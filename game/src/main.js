// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The game
// moves between six screens: title, play, paused, busted, wasted and story complete. Money,
// missions and the best take are saved to localStorage, and the mute setting with them.
//
// ?seed=N fixes the city's layout. ?shot=title|drive|chase|mission (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for a
// screenshot. Any script error is recorded on window.__error for headless checks.
import { BEST_KEY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld,
  EVENT_BUSTED,
  EVENT_COP_DOWN,
  EVENT_CRASH,
  EVENT_MISSION,
  EVENT_PICKUP,
  EVENT_PUNCH,
  EVENT_SHOT,
  EVENT_STAR,
  EVENT_WASTED,
} from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_COMPLETE, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;
/** The fine for being busted or wasted, taken from the player's money on a continue. */
const FINE = 200;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

window.addEventListener('error', (event) => {
  window.__error = String(event.message || event.error || 'unknown error');
});

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return { money: 0, missionsDone: 0, best: 0, muted: false };
    const parsed = JSON.parse(raw);
    return {
      money: Number(parsed.money) || 0,
      missionsDone: Number(parsed.missionsDone) || 0,
      best: Number(parsed.best) || 0,
      muted: Boolean(parsed.muted),
    };
  } catch {
    return { money: 0, missionsDone: 0, best: 0, muted: false };
  }
}

function writeSave(save) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best take then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  const ui = { best: scene.best, muted: false, toast: null, showHints: false, time: world.state.time };
  // The camera lerps toward the player a little per paint, so paint enough frames for it to
  // arrive — two paints would leave it stranded near the origin.
  for (let i = 0; i < 50; i++) renderer.draw(world.state, scene.screen, ui);
  window.__shotReady = true;
  document.title = window.__error ? `ERROR ${window.__error}` : 'SHOT READY';
}

function runGame() {
  const input = createInput(canvas);
  let save = readSave();
  let best = Math.max(readBest(), save.best, save.money);
  let screen = SCREEN_TITLE;
  let muted = save.muted;
  audio.setMuted(muted);
  let accumulator = 0;
  let last = performance.now();
  let toast = null;
  let hintsUntil = 0;
  let saveTimer = 0;
  let completeShown = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each hit.
  function announce(message) {
    status.textContent = message;
  }

  function showToast(text) {
    toast = { text, until: world.state.time + 4 };
  }

  function persist() {
    save = {
      money: world.state.money,
      missionsDone: world.missions.state.doneCount,
      best: Math.max(best, world.state.money),
      muted,
    };
    writeSave(save);
    if (world.state.money > best) {
      best = world.state.money;
      saveBest(best);
    }
  }

  function startGame() {
    audio.unlock();
    world.reset(save);
    accumulator = 0;
    screen = SCREEN_PLAY;
    completeShown = world.missions.allDone();
    hintsUntil = world.state.time + 14;
    showToast(world.state.mission ? world.state.mission.briefing : 'Free roam — the city is yours.');
    announce('Playing. Solmar Keys.');
  }

  function continueAfterTrouble() {
    audio.unlock();
    const wasBusted = screen === SCREEN_BUSTED;
    const p = world.state.player;
    world.state.money = Math.max(0, world.state.money - FINE);
    p.health = 100;
    p.wanted = 0;
    p.bustTimer = 0;
    p.invulnerable = 2;
    if (p.car) {
      p.car.kind = 'traffic';
      p.car.driver = true;
      p.car = null;
    }
    p.onFoot = true;
    const spot = wasBusted ? { x: 1600, y: 750 } : { x: 1000, y: 1650 };
    const pos = world.city.resolveCircle(spot.x + 40, spot.y + 40, 13);
    p.x = pos.x;
    p.y = pos.y;
    persist();
    screen = SCREEN_PLAY;
    showToast(wasBusted ? 'Back on the street. Stay out of trouble.' : 'Patched up. Back on the street.');
    announce('Playing.');
  }

  /** Menu and pause keys; called once a frame with the frame's actions. */
  function handleActions(actions) {
    if (actions & ACTION_MUTE) {
      muted = !muted;
      audio.setMuted(muted);
      persist();
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
      return;
    }
    if ((actions & (ACTION_CONFIRM | ACTION_PUNCH)) && screen === SCREEN_TITLE) {
      startGame();
      return;
    }
    if ((actions & (ACTION_CONFIRM | ACTION_PUNCH)) && (screen === SCREEN_BUSTED || screen === SCREEN_WASTED)) {
      continueAfterTrouble();
      return;
    }
    if ((actions & (ACTION_CONFIRM | ACTION_PUNCH)) && screen === SCREEN_COMPLETE) {
      screen = SCREEN_PLAY;
      announce('Free roam.');
    }
  }

  /** One fixed step of play; `actions` is the frame's one-shot presses (0 on catch-up steps). */
  function step(actions) {
    const mouse = input.mouse();
    const mouseWorld = renderer.screenToWorld(mouse.x, mouse.y);
    const stepInput = {
      up: input.up(),
      down: input.down(),
      left: input.left(),
      right: input.right(),
      run: input.run(),
      enter: Boolean(actions & ACTION_ENTER),
      punch: Boolean(actions & ACTION_PUNCH),
      shoot: input.mouseDown(),
      mouseWorld,
    };
    if (actions & ACTION_PAUSE) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
      return;
    }
    const events = world.step(STEP, stepInput, false);
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_SHOT) audio.shot();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_STAR) {
      audio.star();
      showToast(`Wanted level ${Math.ceil(world.state.player.wanted)} — the law is coming.`);
    }
    if (events & EVENT_COP_DOWN) showToast('Cop car down. +$50.');
    if (events & EVENT_MISSION) {
      audio.mission();
      const mission = world.state.mission;
      if (mission) showToast(`${mission.job}: ${mission.objective}`);
      else showToast('All jobs done.');
      persist();
    }
    if (events & EVENT_BUSTED) {
      audio.busted();
      persist();
      screen = SCREEN_BUSTED;
      announce('Busted. The police caught you.');
      return;
    }
    if (events & EVENT_WASTED) {
      audio.busted();
      persist();
      screen = SCREEN_WASTED;
      announce('Wasted. You went down.');
      return;
    }
    if (world.state.storyDone && !completeShown) {
      completeShown = true;
      persist();
      screen = SCREEN_COMPLETE;
      announce('Story complete. All three jobs done.');
      return;
    }
    // Save every few seconds while playing.
    saveTimer += STEP;
    if (saveTimer > 5) {
      saveTimer = 0;
      persist();
    }
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    // The frame's one-shot presses, taken once and shared by the menu keys and the first step.
    const actions = input.takeActions();
    handleActions(actions);
    if (screen === SCREEN_PLAY) {
      let first = true;
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step(first ? actions : 0);
        first = false;
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    const p = world.state.player;
    audio.update(STEP, p.car ? Math.abs(p.car.speed) : 0, p.wanted);
    renderer.draw(world.state, screen, {
      best,
      muted,
      toast,
      showHints: world.state.time < hintsUntil,
      time: world.state.time,
    });
  }

  // Leaving the tab pauses a running game rather than letting the cops close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });
  window.addEventListener('pagehide', persist);

  announce('Solmar Keys. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();

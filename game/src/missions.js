// The story: three jobs for Rico Vega, plus free roam once they are done. Each mission is a
// small state machine over steps; update() checks the player's position and state once a
// step and returns EVENT_MISSION when a step advances or a job is finished, so the caller can
// flash the new objective. The world owns the money; missions only ask for it through
// addMoney, and set the wanted level through the player state they are handed.
import { LANDMARKS } from './city.js';

export const EVENT_MISSION = 16;

const JOBS = [
  {
    id: 'wheels',
    title: 'Job 1 — Wheels Up',
    briefing: 'Rico: "First things first, kid. Get yourself some wheels. Any car. Then meet me at the Marina."',
    reward: 300,
    steps: [
      { objective: 'Steal a car (walk up to one and press E)', marker: null, kind: 'car' },
      { objective: 'Drive to the Marina', marker: 'marina', kind: 'goto' },
    ],
  },
  {
    id: 'drop',
    title: 'Job 2 — The Drop',
    briefing: 'Rico: "Package is waiting in Palm Park. Grab it, then run it to the Motel. The boys in blue will not like it."',
    reward: 600,
    steps: [
      { objective: 'Pick up the package in Palm Park', marker: 'park', kind: 'goto' },
      { objective: 'Deliver the package to the Motel — lose the cops if you have to', marker: 'motel', kind: 'goto' },
    ],
  },
  {
    id: 'getaway',
    title: 'Job 3 — The Getaway',
    briefing: 'Rico: "Last one. The Docks are hot — get there, shake the heat, and come home to the Safehouse. Do this and you are family."',
    reward: 1000,
    steps: [
      { objective: 'Get to the Docks', marker: 'docks', kind: 'goto' },
      { objective: 'Lose the cops — get your wanted level to zero', marker: null, kind: 'lose-heat' },
      { objective: 'Come home to the Safehouse', marker: 'safehouse', kind: 'goto' },
    ],
  },
];

function dist(x0, y0, x1, y1) {
  return Math.hypot(x1 - x0, y1 - y0);
}

export function createMissions() {
  const state = { index: 0, step: 0, doneCount: 0 };

  function reset(missionsDone) {
    state.doneCount = missionsDone ?? 0;
    state.index = Math.min(state.doneCount, JOBS.length - 1);
    if (state.doneCount >= JOBS.length) state.index = JOBS.length;
    state.step = 0;
  }

  function allDone() {
    return state.doneCount >= JOBS.length;
  }

  function currentJob() {
    return state.index < JOBS.length ? JOBS[state.index] : null;
  }

  /** The objective the HUD shows and the marker the minimap draws, or null when free roaming. */
  function current() {
    const job = currentJob();
    if (!job) return null;
    const step = job.steps[state.step];
    const marker = step.marker ? LANDMARKS[step.marker] : null;
    return {
      job: job.title,
      briefing: job.briefing,
      objective: step.objective,
      marker: marker ? { x: marker.x, y: marker.y, name: marker.name, color: marker.color } : null,
      step: state.step,
      steps: job.steps.length,
      reward: job.reward,
    };
  }

  function completeJob(addMoney) {
    const job = currentJob();
    addMoney(job.reward);
    state.doneCount += 1;
    state.index += 1;
    state.step = 0;
  }

  function update(dt, worldState, city, addMoney) {
    let events = 0;
    const job = currentJob();
    if (!job) return events;
    const step = job.steps[state.step];
    const p = worldState.player;
    if (step.kind === 'car') {
      if (!p.onFoot) {
        state.step += 1;
        events |= EVENT_MISSION;
      }
      return events;
    }
    if (step.kind === 'goto') {
      const lm = LANDMARKS[step.marker];
      if (dist(p.x, p.y, lm.x, lm.y) < 70) {
        if (job.id === 'drop' && state.step === 0) {
          // Picking up the package draws the law: two stars, on the spot.
          p.wanted = Math.max(p.wanted, 2);
          p.wantedTimer = 0;
          state.step += 1;
          events |= EVENT_MISSION;
          return events;
        }
        if (job.id === 'getaway' && state.step === 0) {
          // The Docks are hot: three stars the moment you arrive.
          p.wanted = 3;
          p.wantedTimer = 0;
          state.step += 1;
          events |= EVENT_MISSION;
          return events;
        }
        if (state.step === job.steps.length - 1) {
          completeJob(addMoney);
          events |= EVENT_MISSION;
        } else {
          state.step += 1;
          events |= EVENT_MISSION;
        }
      }
      return events;
    }
    if (step.kind === 'lose-heat') {
      if (p.wanted <= 0) {
        state.step += 1;
        events |= EVENT_MISSION;
      }
      return events;
    }
    return events;
  }

  return { state, reset, update, current, allDone, currentJob };
}

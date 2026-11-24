// The screenshot scenes behind ?shot=title|drive|chase|mission (with &seed=N). Each one plays
// the real rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot that keeps the car on the road, so the frame is what a short game really looks
// like and the same seed always gives the same frame.
import { ROAD, STEP } from './config.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const TITLE_SECONDS = 4;
const DRIVE_SECONDS = 7;
const CHASE_SECONDS = 9;
const MISSION_SECONDS = 6;
/** The Marina, the fallback target when no mission marker is up. */
const FALLBACK_TARGET = { x: 2720, y: 1950 };

function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Last game-time a turn was started, so the car does not turn twice in one crossing. */
let lastTurnTime = -10;
/** The axis angle the car is currently turning onto, or null when driving straight. */
let turnTarget = null;

/**
 * Steer the player's car along the road grid toward the current mission marker: stay on the
 * axis, and at an intersection take whichever way (straight, left, right) brings the car
 * closest to the target. A turn starts while the car is still approaching the crossing, so
 * the arc lands on the far road instead of swinging wide into the block; the car holds
 * about 120 px/s through the turn, which is where the steering gives its tightest radius.
 * (The turn target is remembered: steering back to the *nearest* axis mid-turn would fight
 * the turn and leave the car wobbling straight on.)
 */
function driveInput(world) {
  const p = world.state.player;
  const car = p.car;
  const noInput = { up: false, down: false, left: false, right: false, run: false, enter: false, punch: false, shoot: false, mouseWorld: { x: p.x, y: p.y } };
  if (!car) return noInput;
  const target = world.state.mission?.marker ?? FALLBACK_TARGET;
  const turnSpeed = {
    up: Math.abs(car.speed) < 120,
    down: Math.abs(car.speed) > 160,
  };
  // Mid-turn: keep steering onto the remembered axis until it is reached.
  if (turnTarget !== null) {
    const diff = angleDiff(car.angle, turnTarget);
    if (Math.abs(diff) <= 0.08) {
      turnTarget = null;
    } else {
      return { ...noInput, ...turnSpeed, left: diff < 0, right: diff > 0 };
    }
  }
  // Approaching an intersection: the crossing centre is ahead and near the car's line.
  const hx = Math.cos(car.angle);
  const hy = Math.sin(car.angle);
  let nearestAhead = Infinity;
  let nearestTurn = 0;
  for (const ax of ROAD.avenues) {
    for (const sy of ROAD.streets) {
      const cx = ax - car.x;
      const cy = sy - car.y;
      const along = hx * cx + hy * cy;
      const across = Math.abs(hx * cy - hy * cx);
      if (along < 0 || along > 200 || across > 40) continue;
      if (along >= nearestAhead) continue;
      nearestAhead = along;
      nearestTurn = 0;
      if (along <= 80 && world.state.time - lastTurnTime > 0.8) {
        const options = [0, Math.PI / 2, -Math.PI / 2];
        let bestD = Infinity;
        for (const turn of options) {
          const a = (car.angle + turn + Math.PI * 2) % (Math.PI * 2);
          const px = car.x + Math.cos(a) * 120;
          const py = car.y + Math.sin(a) * 120;
          const dd = Math.hypot(px - target.x, py - target.y);
          if (dd < bestD) {
            bestD = dd;
            nearestTurn = turn;
          }
        }
      }
    }
  }
  if (nearestTurn !== 0) {
    lastTurnTime = world.state.time;
    turnTarget = (car.angle + nearestTurn + Math.PI * 2) % (Math.PI * 2);
    return { ...noInput, ...turnSpeed, left: nearestTurn < 0, right: nearestTurn > 0 };
  }
  // Slow for the crossing ahead so a turn starts at turn speed, not full speed.
  if (nearestAhead <= 200) {
    return { ...noInput, up: Math.abs(car.speed) < 120, down: Math.abs(car.speed) > 140 };
  }
  return { ...noInput, up: true };
}

function idleInput(world) {
  const p = world.state.player;
  return { up: false, down: false, left: false, right: false, run: false, enter: false, punch: false, shoot: false, mouseWorld: { x: p.x, y: p.y } };
}

/** Put the player straight into a fresh car on the street beside the safehouse. */
function giveCar(world) {
  const p = world.state.player;
  // Street 600's south lane, just south of the safehouse: on the road, facing east, so the
  // autopilot can actually drive instead of being boxed in by buildings.
  const car = {
    kind: 'player',
    x: p.x,
    y: 620,
    angle: 0,
    speed: 0,
    latVel: 0,
    color: '#e84c3d',
    health: 100,
    driver: false,
    turnCooldown: 0,
    brakeTimer: 0,
    dead: false,
  };
  world.state.cars.push(car);
  p.onFoot = false;
  p.car = car;
  p.x = car.x;
  p.y = car.y;
  p.angle = car.angle;
  return car;
}

/**
 * Set `world` to the named scene (title, drive, chase or mission; any other name is title)
 * and return the screen to draw over it and the best score to show.
 */
export function stageShot(name, world) {
  lastTurnTime = -10;
  turnTarget = null;
  world.reset(null);
  const state = world.state;
  if (name !== 'drive' && name !== 'chase' && name !== 'mission') {
    for (let i = 0; i < TITLE_SECONDS / STEP; i++) world.step(STEP, idleInput(world), false);
    return { screen: SCREEN_TITLE, best: 1250 };
  }
  if (name === 'drive') {
    giveCar(world);
    for (let i = 0; i < DRIVE_SECONDS / STEP; i++) world.step(STEP, driveInput(world), false);
    return { screen: SCREEN_PLAY, best: 1250 };
  }
  if (name === 'chase') {
    giveCar(world);
    state.player.wanted = 3;
    state.player.wantedTimer = 0;
    for (let i = 0; i < CHASE_SECONDS / STEP; i++) world.step(STEP, driveInput(world), false);
    return { screen: SCREEN_PLAY, best: 1250 };
  }
  // mission: the first job, driving toward the Marina with the objective on the HUD.
  giveCar(world);
  for (let i = 0; i < MISSION_SECONDS / STEP; i++) world.step(STEP, driveInput(world), false);
  return { screen: SCREEN_PLAY, best: 1250 };
}

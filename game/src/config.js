// SOLMAR KEYS — a sun-soaked open-world crime game in the spirit of GTA, top-down.
// Every tuning number and colour in one place. The city is a fixed 3200 x 2400 world; the
// camera follows the player and the renderer scales to the window, so no rule below depends
// on the screen size.

export const WORLD = { width: 3200, height: 2400 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The road grid: avenues run north-south, streets east-west. */
export const ROAD = {
  width: 72,
  lane: 20,
  avenues: [400, 800, 1200, 1600, 2000, 2400, 2800],
  streets: [300, 600, 900, 1200, 1500, 1800, 2100],
};

/** The beach and water along the east edge, and the marina at the south-east. */
export const BEACH = { x: 2960, y: 0, width: 240, height: 2400 };
export const WATER = { x: 3080, y: 0, width: 120, height: 2400 };

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  runSpeed: 300,
  health: 100,
  punchDamage: 34,
  punchRange: 34,
  punchCooldown: 0.45,
  pistolDamage: 25,
  pistolRange: 420,
  pistolCooldown: 0.28,
  startAmmo: 24,
  maxAmmo: 60,
};

export const CAR = {
  length: 46,
  width: 22,
  accel: 420,
  brake: 700,
  reverseAccel: 260,
  maxSpeed: 520,
  maxReverse: 160,
  steer: 2.6,
  grip: 6.0,
  health: 100,
  enterRange: 64,
};

export const TRAFFIC = {
  count: 22,
  speed: 150,
  speedJitter: 50,
  followGap: 70,
  spawnMargin: 500,
};

export const PED = {
  count: 26,
  walkSpeed: 55,
  fleeSpeed: 150,
  knockdownTime: 2.5,
};

export const POLICE = {
  maxActive: 5,
  chaseSpeed: 470,
  ramDamage: 12,
  bustTime: 1.4,
  bustRange: 46,
  spawnInterval: 2.2,
  carHealth: 90,
};

export const WANTED = {
  max: 5,
  stealCar: 1,
  hitPed: 1,
  shoot: 2,
  killCop: 1,
  decayDelay: 14,
  decayPerSecond: 0.12,
};

/** Cash pickups scattered around the city. */
export const PICKUP = { count: 14, money: 50, ammo: 12 };

export const PALETTE = {
  backdrop: '#0e1a24',
  grass: '#7fae5a',
  grassDark: '#6d9c4c',
  sand: '#e8d29a',
  water: '#2f7fb8',
  waterDeep: '#1f5f92',
  road: '#3a3f47',
  roadLine: '#e8e4c8',
  sidewalk: '#9aa0a8',
  building: ['#c96f4a', '#4a7fa5', '#a55a7d', '#5a8a6a', '#b08a3e', '#7d6aa8', '#8a5a3b', '#4a9a8a'],
  buildingTop: ['#d97f57', '#5a90b8', '#b8688c', '#6a9a7a', '#c09a4a', '#8d7ab8', '#9a6a48', '#5aaa9a'],
  park: '#5d8a48',
  tree: '#3f6b2f',
  player: '#ffd23f',
  playerCar: '#e84c3d',
  trafficCar: ['#d8d8d8', '#3a6fd8', '#d83a6f', '#3ad8a0', '#e8a83a', '#7a3ad8'],
  policeCar: '#2f6fd0',
  policeLight: '#ff3b30',
  ped: ['#e8b88a', '#c98a5a', '#8a5a3b', '#f0d0a0'],
  marker: '#ffd23f',
  text: '#f4f1e8',
  muted: '#b8c0c8',
  panel: 'rgba(12, 20, 28, 0.88)',
  star: '#ffd23f',
  health: '#4caf50',
  damage: '#e53935',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save (money, missions, best) is kept between visits (this browser only). */
export const SAVE_KEY = 'solmar-keys.save.v1';
export const BEST_KEY = 'solmar-keys.best.v1';

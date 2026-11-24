// The city of Solmar Keys: a road grid, the blocks between the roads filled with buildings,
// a park, the beach and marina on the east edge, and the story landmarks (safehouse, motel,
// police station, hospital). Everything is derived from the seed, so the same seed builds the
// same city. This file holds no drawing and no browser in it: it answers questions about the
// city (is this point on a road, does this rectangle hit a building, where is the nearest road).

import { BEACH, PALETTE, ROAD, WATER, WORLD } from './config.js';
import { intBetween, pick } from './random.js';

/** The story landmarks, fixed points on the map. */
export const LANDMARKS = {
  safehouse: { x: 560, y: 450, name: 'Safehouse', color: '#4caf50' },
  marina: { x: 2720, y: 1950, name: 'Marina', color: '#ffd23f' },
  motel: { x: 2280, y: 450, name: 'Motel', color: '#ffd23f' },
  park: { x: 1400, y: 1350, name: 'Palm Park', color: '#4caf50' },
  policeStation: { x: 1600, y: 750, name: 'Police HQ', color: '#2f6fd0' },
  hospital: { x: 1000, y: 1650, name: 'Hospital', color: '#e8e4c8' },
  docks: { x: 2600, y: 2100, name: 'Docks', color: '#ffd23f' },
};

const DISTRICTS = [
  { x0: 0, y0: 0, x1: 1200, y1: 1200, name: 'Old Town', tall: 0 },
  { x0: 1200, y0: 0, x1: 2400, y1: 1200, name: 'Downtown', tall: 1 },
  { x0: 0, y0: 1200, x1: 1600, y1: 2400, name: 'Southside', tall: 0 },
  { x0: 1600, y0: 1200, x1: 2960, y1: 2400, name: 'Marina District', tall: 0 },
];

function districtAt(x, y) {
  for (const d of DISTRICTS) if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d;
  return DISTRICTS[0];
}

function onRoadPoint(x, y) {
  const half = ROAD.width / 2;
  for (const ax of ROAD.avenues) if (Math.abs(x - ax) <= half) return true;
  for (const sy of ROAD.streets) if (Math.abs(y - sy) <= half) return true;
  return false;
}

export function createCity(random) {
  const buildings = [];
  const trees = [];
  const parks = [];

  // The park block: the block bounded by avenue 1200/1600 and streets 1200/1500.
  parks.push({ x: 1240, y: 1240, width: 320, height: 220 });

  // One building (or a pair) per city block, clear of roads, the park, the beach and landmarks.
  const margin = ROAD.width / 2 + 24;
  const xs = [0, ...ROAD.avenues, WORLD.width];
  const ys = [0, ...ROAD.streets, WORLD.height];
  for (let bx = 0; bx < xs.length - 1; bx++) {
    for (let by = 0; by < ys.length - 1; by++) {
      const x0 = xs[bx] + margin;
      const x1 = xs[bx + 1] - margin;
      const y0 = ys[by] + margin;
      const y1 = ys[by + 1] - margin;
      if (x1 - x0 < 90 || y1 - y0 < 90) continue;
      if (x0 >= BEACH.x) continue;
      // The park block stays open.
      if (x0 >= 1200 && x1 <= 1640 && y0 >= 1200 && y1 <= 1540) {
        for (let t = 0; t < 8; t++) {
          trees.push({ x: 1260 + random() * 280, y: 1260 + random() * 180, r: 12 + random() * 8 });
        }
        continue;
      }
      // Landmark blocks stay open so their markers are reachable.
      let blocked = false;
      for (const key of Object.keys(LANDMARKS)) {
        const lm = LANDMARKS[key];
        if (lm.x > x0 - 60 && lm.x < x1 + 60 && lm.y > y0 - 60 && lm.y < y1 + 60) blocked = true;
      }
      if (blocked) continue;
      const district = districtAt((x0 + x1) / 2, (y0 + y1) / 2);
      const count = random() < 0.45 ? 2 : 1;
      for (let n = 0; n < count; n++) {
        const w = 70 + random() * Math.min(150, (x1 - x0) / count - 80);
        const h = 70 + random() * Math.min(130, y1 - y0 - 80);
        const bx0 = x0 + (n * (x1 - x0)) / count + 8;
        const by0 = y0 + 10 + random() * Math.max(0, y1 - y0 - h - 20);
        const color = pick(random, PALETTE.building);
        const top = pick(random, PALETTE.buildingTop);
        buildings.push({
          x: bx0,
          y: by0,
          width: Math.min(w, x1 - bx0 - 8),
          height: Math.min(h, y1 - by0 - 8),
          color,
          top,
          tall: district.tall && random() < 0.6,
          heightPx: district.tall ? intBetween(random, 26, 54) : intBetween(random, 8, 18),
        });
      }
    }
  }

  // Palm trees along the beach and a few on sidewalks.
  for (let y = 80; y < WORLD.height; y += 130) {
    trees.push({ x: 2990 + random() * 40, y: y + random() * 40, r: 13 + random() * 6 });
  }
  for (let t = 0; t < 24; t++) {
    const ax = pick(random, ROAD.avenues);
    const sy = pick(random, ROAD.streets);
    trees.push({ x: ax + (random() < 0.5 ? -1 : 1) * (ROAD.width / 2 + 14), y: sy + intBetween(random, -140, 140), r: 10 + random() * 6 });
  }

  /** True when the point is on a road (drivable). */
  function isRoad(x, y) {
    return onRoadPoint(x, y);
  }

  /** True when the point is in the water (not walkable). */
  function isWater(x, y) {
    return x > WATER.x;
  }

  /** The nearest point on a road to (x, y). */
  function nearestRoadPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const ax of ROAD.avenues) {
      const d = Math.abs(x - ax);
      if (d < bestD) {
        bestD = d;
        best = { x: ax, y: Math.min(Math.max(y, 40), WORLD.height - 40), vertical: true };
      }
    }
    for (const sy of ROAD.streets) {
      const d = Math.abs(y - sy);
      if (d < bestD) {
        bestD = d;
        best = { x: Math.min(Math.max(x, 40), WORLD.width - 40), y: sy, vertical: false };
      }
    }
    return best;
  }

  /** A random point on a road, at least `away` from (x, y); `vertical` says avenue (true) or street (false). */
  function randomRoadPoint(awayX, awayY, away) {
    for (let tries = 0; tries < 40; tries++) {
      const vertical = random() < 0.5;
      const point = vertical
        ? { x: pick(random, ROAD.avenues), y: 60 + random() * (WORLD.height - 120), vertical: true }
        : { x: 60 + random() * (WORLD.width - 120), y: pick(random, ROAD.streets), vertical: false };
      if (away !== undefined && Math.hypot(point.x - awayX, point.y - awayY) < away) continue;
      return point;
    }
    return { x: 1200, y: 1200, vertical: true };
  }

  /** A random walkable point (on a road or a sidewalk, never inside a building or the water). */
  function randomWalkPoint() {
    for (let tries = 0; tries < 40; tries++) {
      const x = 60 + random() * (WORLD.width - 200);
      const y = 60 + random() * (WORLD.height - 120);
      if (isWater(x, y)) continue;
      if (hitsBuilding(x - 10, y - 10, 20, 20)) continue;
      return { x, y };
    }
    return { x: 1200, y: 1200 };
  }

  /** True when the rectangle overlaps any building. */
  function hitsBuilding(x, y, w, h) {
    for (const b of buildings) {
      if (x < b.x + b.width && x + w > b.x && y < b.y + b.height && y + h > b.y) return b;
    }
    return null;
  }

  /** Push a circle out of buildings and the water; returns the corrected position. */
  function resolveCircle(x, y, r) {
    let nx = Math.min(Math.max(x, r), WORLD.width - r);
    let ny = Math.min(Math.max(y, r), WORLD.height - r);
    if (nx > WATER.x - r) nx = WATER.x - r;
    const b = hitsBuilding(nx - r, ny - r, r * 2, r * 2);
    if (b) {
      const dxLeft = nx - (b.x - r);
      const dxRight = b.x + b.width + r - nx;
      const dyTop = ny - (b.y - r);
      const dyBottom = b.y + b.height + r - ny;
      const m = Math.min(dxLeft, dxRight, dyTop, dyBottom);
      if (m === dxLeft) nx = b.x - r;
      else if (m === dxRight) nx = b.x + b.width + r;
      else if (m === dyTop) ny = b.y - r;
      else ny = b.y + b.height + r;
    }
    return { x: nx, y: ny };
  }

  return {
    buildings,
    trees,
    parks,
    isRoad,
    isWater,
    nearestRoadPoint,
    randomRoadPoint,
    randomWalkPoint,
    hitsBuilding,
    resolveCircle,
    districtAt,
  };
}

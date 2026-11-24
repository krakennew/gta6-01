// The game's rules and state, with no drawing and no browser in it: the player on foot and in
// cars, traffic, pedestrians, police, the wanted level, money, health, pickups, bullets and the
// mission state. step() advances one fixed step and returns what happened as bit flags, so the
// caller can react (sound, announcements) without the world knowing about screens or sound.
// Nothing here allocates after createWorld returns, except short-lived particle bursts.
import { CAR, PED, PICKUP, PLAYER, POLICE, STEP, TRAFFIC, WANTED, WORLD } from './config.js';
import { createCity, LANDMARKS } from './city.js';
import { createMissions } from './missions.js';
import { pick } from './random.js';

export const EVENT_NONE = 0;
export const EVENT_PICKUP = 1;
export const EVENT_SHOT = 2;
export const EVENT_CRASH = 4;
export const EVENT_STAR = 8;
export const EVENT_MISSION = 16;
export const EVENT_BUSTED = 32;
export const EVENT_WASTED = 64;
export const EVENT_COP_DOWN = 128;
export const EVENT_PUNCH = 256;

const TAU = Math.PI * 2;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

function angleTo(x0, y0, x1, y1) {
  return Math.atan2(y1 - y0, x1 - x0);
}

function dist(x0, y0, x1, y1) {
  return Math.hypot(x1 - x0, y1 - y0);
}

export function createWorld(random) {
  const city = createCity(random);
  const missions = createMissions();
  const state = {
    time: 0,
    money: 0,
    earned: 0,
    best: 0,
    player: {
      x: LANDMARKS.safehouse.x,
      y: LANDMARKS.safehouse.y,
      angle: 0,
      health: PLAYER.health,
      onFoot: true,
      car: null,
      ammo: PLAYER.startAmmo,
      punchTimer: 0,
      pistolTimer: 0,
      wanted: 0,
      wantedTimer: 0,
      bustTimer: 0,
      invulnerable: 0,
    },
    cars: [],
    peds: [],
    pickups: [],
    bullets: [],
    particles: [],
    policeTimer: 0,
    spawnTimer: 0,
    storyDone: false,
  };

  function addMoney(amount) {
    state.money += amount;
    state.earned += amount;
    if (state.money > state.best) state.best = state.money;
  }

  function raiseWanted(amount, events) {
    const before = state.player.wanted;
    state.player.wanted = Math.min(WANTED.max, state.player.wanted + amount);
    state.player.wantedTimer = 0;
    if (state.player.wanted > before) return events | EVENT_STAR;
    return events;
  }

  function spawnParticles(x, y, color, count, speed) {
    for (let i = 0; i < count; i++) {
      const a = random() * TAU;
      const s = speed * (0.4 + random() * 0.6);
      state.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + random() * 0.5, max: 1, color, size: 2 + random() * 3 });
    }
    if (state.particles.length > 240) state.particles.splice(0, state.particles.length - 240);
  }

  function makeCar(kind, x, y, angle, color) {
    return {
      kind,
      x,
      y,
      angle,
      speed: 0,
      latVel: 0,
      color,
      health: kind === 'police' ? POLICE.carHealth : CAR.health,
      driver: kind === 'traffic',
      turnCooldown: 0,
      brakeTimer: 0,
      avoidTimer: 0,
      avoidDir: 1,
      dead: false,
    };
  }

  function spawnTrafficCar(away) {
    const point = city.randomRoadPoint(state.player.x, state.player.y, away ?? 500);
    // The angle must match the road the point is on: an avenue point drives north/south,
    // a street point east/west, each in its right-hand lane.
    let angle;
    let x = point.x;
    let y = point.y;
    if (point.vertical) {
      angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      x = point.x + (Math.sin(angle) > 0 ? -20 : 20);
    } else {
      angle = random() < 0.5 ? 0 : Math.PI;
      y = point.y + (Math.cos(angle) > 0 ? 20 : -20);
    }
    const car = makeCar('traffic', x, y, angle, pick(random, ['#d8d8d8', '#3a6fd8', '#d83a6f', '#3ad8a0', '#e8a83a', '#7a3ad8']));
    car.speed = TRAFFIC.speed + (random() - 0.5) * TRAFFIC.speedJitter;
    car.driver = true;
    state.cars.push(car);
    return car;
  }

  function spawnPed() {
    const point = city.randomWalkPoint();
    state.peds.push({
      x: point.x,
      y: point.y,
      angle: random() * TAU,
      speed: 0,
      state: 'walk',
      downTimer: 0,
      target: city.randomWalkPoint(),
      color: pick(random, ['#e8b88a', '#c98a5a', '#8a5a3b', '#f0d0a0']),
      shirt: pick(random, ['#3a6fd8', '#d83a6f', '#3ad8a0', '#e8a83a', '#7a3ad8', '#e8e4c8']),
    });
  }

  function spawnPolice() {
    const point = city.randomRoadPoint(state.player.x, state.player.y, 700);
    // Start on the road's axis, heading toward the player's side of the map.
    const angle = point.vertical
      ? state.player.y > point.y
        ? Math.PI / 2
        : -Math.PI / 2
      : state.player.x > point.x
        ? 0
        : Math.PI;
    const car = makeCar('police', point.x, point.y, angle, '#2f6fd0');
    car.speed = POLICE.chaseSpeed * 0.8;
    state.cars.push(car);
    return car;
  }

  function reset(save) {
    state.time = 0;
    state.money = save?.money ?? 0;
    state.earned = state.money;
    state.best = save?.best ?? 0;
    state.cars.length = 0;
    state.peds.length = 0;
    state.pickups.length = 0;
    state.bullets.length = 0;
    state.particles.length = 0;
    const p = state.player;
    p.x = LANDMARKS.safehouse.x;
    p.y = LANDMARKS.safehouse.y;
    p.angle = 0;
    p.health = PLAYER.health;
    p.onFoot = true;
    p.car = null;
    p.ammo = PLAYER.startAmmo;
    p.punchTimer = 0;
    p.pistolTimer = 0;
    p.wanted = 0;
    p.wantedTimer = 0;
    p.bustTimer = 0;
    p.invulnerable = 0;
    missions.reset(save?.missionsDone ?? 0);
    state.storyDone = missions.allDone();
    state.city = city;
    state.mission = missions.current();
    for (let i = 0; i < TRAFFIC.count; i++) spawnTrafficCar(300);
    for (let i = 0; i < PED.count; i++) spawnPed();
    for (let i = 0; i < PICKUP.count; i++) {
      const point = city.randomWalkPoint();
      state.pickups.push({ x: point.x, y: point.y, kind: i % 3 === 0 ? 'ammo' : 'cash', taken: false, bob: random() * TAU });
    }
  }

  /** The car the player is in, or the nearest drivable car within range, or null. */
  function nearestCar(x, y, maxDist) {
    let best = null;
    let bestD = maxDist;
    for (const car of state.cars) {
      if (car.dead || car.kind === 'police') continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  function stepPlayerOnFoot(dt, input, events) {
    const p = state.player;
    const run = input.run ? PLAYER.runSpeed : PLAYER.walkSpeed;
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx !== 0 || my !== 0) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      p.angle = Math.atan2(my, mx);
      const pos = city.resolveCircle(p.x + mx * run * dt, p.y + my * run * dt, PLAYER.radius);
      p.x = pos.x;
      p.y = pos.y;
    }
    if (p.punchTimer > 0) p.punchTimer -= dt;
    if (p.pistolTimer > 0) p.pistolTimer -= dt;
    if (input.punch && p.punchTimer <= 0) {
      p.punchTimer = PLAYER.punchCooldown;
      events |= EVENT_PUNCH;
      const hx = p.x + Math.cos(p.angle) * (PLAYER.radius + PLAYER.punchRange / 2);
      const hy = p.y + Math.sin(p.angle) * (PLAYER.radius + PLAYER.punchRange / 2);
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (dist(hx, hy, ped.x, ped.y) < PLAYER.punchRange) {
          ped.state = 'down';
          ped.downTimer = PED.knockdownTime;
          spawnParticles(ped.x, ped.y, '#e8b88a', 6, 120);
          events = raiseWanted(WANTED.hitPed, events);
        }
      }
      for (const car of state.cars) {
        if (car.kind !== 'police' || car.dead) continue;
        if (dist(hx, hy, car.x, car.y) < PLAYER.punchRange + 20) {
          car.health -= PLAYER.punchDamage;
          spawnParticles(car.x, car.y, '#ffd23f', 8, 160);
          if (car.health <= 0) events = killPoliceCar(car, events);
        }
      }
    }
    if (input.shoot && p.pistolTimer <= 0 && p.ammo > 0) {
      p.pistolTimer = PLAYER.pistolCooldown;
      p.ammo -= 1;
      events |= EVENT_SHOT;
      const aim = angleTo(p.x, p.y, input.mouseWorld.x, input.mouseWorld.y);
      p.angle = aim;
      state.bullets.push({ x: p.x + Math.cos(aim) * 20, y: p.y + Math.sin(aim) * 20, vx: Math.cos(aim) * 900, vy: Math.sin(aim) * 900, life: PLAYER.pistolRange / 900 });
      events = raiseWanted(WANTED.shoot, events);
    }
    if (input.enter) {
      const car = nearestCar(p.x, p.y, CAR.enterRange);
      if (car) {
        p.onFoot = false;
        p.car = car;
        car.driver = false;
        car.kind = 'player';
        car.color = '#e84c3d';
        if (car.speed < 0) car.speed = 0;
        events = raiseWanted(WANTED.stealCar, events);
        spawnParticles(car.x, car.y, '#ffd23f', 6, 100);
      }
    }
    return events;
  }

  function stepPlayerCar(dt, input, events) {
    const p = state.player;
    const car = p.car;
    if (!car || car.dead) {
      p.onFoot = true;
      p.car = null;
      return events;
    }
    const forward = input.up ? 1 : input.down ? -0.55 : 0;
    const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
    const accel = forward > 0 ? CAR.accel : forward < 0 ? CAR.reverseAccel : 0;
    car.speed += forward * accel * dt;
    if (forward === 0) {
      const drag = Math.exp(-1.2 * dt);
      car.speed *= drag;
      if (Math.abs(car.speed) < 4) car.speed = 0;
    }
    if (input.down && car.speed > 0) car.speed = Math.max(0, car.speed - CAR.brake * dt);
    car.speed = clamp(car.speed, -CAR.maxReverse, CAR.maxSpeed);
    const steerAmount = steer * CAR.steer * clamp(Math.abs(car.speed) / 160, 0, 1) * (car.speed < 0 ? -1 : 1);
    car.angle += steerAmount * dt;
    car.latVel *= Math.exp(-CAR.grip * dt);
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const nx = car.x + (fx * car.speed - fy * car.latVel) * dt;
    const ny = car.y + (fy * car.speed + fx * car.latVel) * dt;
    const before = { x: car.x, y: car.y };
    const pos = city.resolveCircle(nx, ny, 21);
    car.x = pos.x;
    car.y = pos.y;
    if (pos.x !== nx || pos.y !== ny) {
      const impact = Math.abs(car.speed);
      car.speed *= 0.45;
      if (impact > 240) {
        events |= EVENT_CRASH;
        car.health -= (impact - 240) / 14;
        p.health -= (impact - 240) / 40;
        spawnParticles(car.x, car.y, '#ffb74d', 10, 200);
      }
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
    if (car.health <= 0) {
      events = killPlayerCar(car, events);
    }
    if (input.enter) {
      p.onFoot = true;
      p.car = null;
      car.kind = 'traffic';
      car.driver = true;
      car.color = pick(random, ['#d8d8d8', '#3a6fd8', '#d83a6f', '#3ad8a0', '#e8a83a', '#7a3ad8']);
      const out = city.resolveCircle(car.x + Math.cos(car.angle + Math.PI / 2) * 36, car.y + Math.sin(car.angle + Math.PI / 2) * 36, PLAYER.radius);
      p.x = out.x;
      p.y = out.y;
      p.angle = car.angle + Math.PI / 2;
    }
    return events;
  }

  function stepTrafficCar(car, dt) {
    if (car.dead || car.kind !== 'traffic') return;
    // Slow for the car ahead on the same road.
    let targetSpeed = TRAFFIC.speed + (car.cruise ?? 0);
    if (car.cruise === undefined) car.cruise = (random() - 0.5) * TRAFFIC.speedJitter;
    for (const other of state.cars) {
      if (other === car || other.dead) continue;
      const dx = other.x - car.x;
      const dy = other.y - car.y;
      const ahead = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
      const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
      if (ahead > 0 && ahead < TRAFFIC.followGap && side < 30) {
        targetSpeed = Math.min(targetSpeed, other.speed * 0.7);
        break;
      }
    }
    car.speed += clamp(targetSpeed - car.speed, -300 * dt, 200 * dt);
    car.turnCooldown -= dt;
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    const nx = car.x + fx * car.speed * dt;
    const ny = car.y + fy * car.speed * dt;
    // At a real intersection — near an avenue AND a street at once — sometimes turn onto
    // the crossing road, snapping onto its right-hand lane.
    let ax = null;
    for (const a of [400, 800, 1200, 1600, 2000, 2400, 2800]) {
      if (Math.abs(nx - a) < 30) ax = a;
    }
    let sy = null;
    for (const s of [300, 600, 900, 1200, 1500, 1800, 2100]) {
      if (Math.abs(ny - s) < 30) sy = s;
    }
    if (car.turnCooldown <= 0 && ax !== null && sy !== null) {
      car.turnCooldown = 1.5 + random() * 2;
      if (random() < 0.35) {
        const wasVertical = Math.abs(Math.sin(car.angle)) > 0.5;
        const turn = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        car.angle = (car.angle + turn + Math.PI * 2) % (Math.PI * 2);
        if (wasVertical) {
          // Now travelling east/west along street sy: eastbound takes the south lane.
          car.y = sy + (Math.cos(car.angle) > 0 ? 20 : -20);
          car.x = ax;
        } else {
          // Now travelling north/south along avenue ax: southbound takes the west lane.
          car.x = ax + (Math.sin(car.angle) > 0 ? -20 : 20);
          car.y = sy;
        }
      }
    }
    const pos = city.resolveCircle(nx, ny, 20);
    car.x = pos.x;
    car.y = pos.y;
    if (pos.x !== nx || pos.y !== ny) car.speed *= 0.5;
  }

  /** Police chase: follow the roads toward the player (greedy at intersections), and crawl
   * straight at them once close enough to make an arrest or a ram. */
  function stepPoliceCar(car, dt, events) {
    if (car.dead || car.kind !== 'police') return events;
    const p = state.player;
    const d = dist(car.x, car.y, p.x, p.y);
    if (d < 220) {
      // Close in: slow, direct pursuit so the car can actually stop on the player. Once
      // on top of them it stops and holds still — steering at a target a few pixels away
      // would only spin it in circles.
      if (d >= 30) {
        const targetAngle = angleTo(car.x, car.y, p.x, p.y);
        const diff = angleDiff(car.angle, targetAngle);
        car.angle += clamp(diff, -3.5 * dt, 3.5 * dt);
      }
      const targetSpeed = d < 40 ? 0 : 150;
      car.speed += clamp(targetSpeed - car.speed, -500 * dt, 300 * dt);
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const nx = car.x + fx * car.speed * dt;
      const ny = car.y + fy * car.speed * dt;
      const pos = city.resolveCircle(nx, ny, 21);
      car.x = pos.x;
      car.y = pos.y;
      if (pos.x !== nx || pos.y !== ny) car.speed *= 0.5;
    } else {
      // Road mode: snap to an axis and a lane, then drive the grid, turning at intersections
      // toward whichever way brings the car closer to the player.
      const snapped = Math.round(car.angle / (Math.PI / 2)) * (Math.PI / 2);
      if (Math.abs(angleDiff(car.angle, snapped)) > 0.05) {
        car.angle += clamp(angleDiff(car.angle, snapped), -3 * dt, 3 * dt);
      } else {
        car.angle = snapped;
      }
      car.turnCooldown -= dt;
      const fx = Math.cos(car.angle);
      const fy = Math.sin(car.angle);
      const nx = car.x + fx * car.speed * dt;
      const ny = car.y + fy * car.speed * dt;
      let ax = null;
      for (const a of [400, 800, 1200, 1600, 2000, 2400, 2800]) {
        if (Math.abs(nx - a) < 30) ax = a;
      }
      let sy = null;
      for (const s of [300, 600, 900, 1200, 1500, 1800, 2100]) {
        if (Math.abs(ny - s) < 30) sy = s;
      }
      if (car.turnCooldown <= 0 && ax !== null && sy !== null) {
        car.turnCooldown = 0.8;
        // Of straight, left and right, take the way whose next point is nearest the player.
        const options = [0, Math.PI / 2, -Math.PI / 2];
        let bestTurn = 0;
        let bestD = Infinity;
        for (const turn of options) {
          const a = (car.angle + turn + Math.PI * 2) % (Math.PI * 2);
          const px = car.x + Math.cos(a) * 120;
          const py = car.y + Math.sin(a) * 120;
          const dd = dist(px, py, p.x, p.y);
          if (dd < bestD) {
            bestD = dd;
            bestTurn = turn;
          }
        }
        if (bestTurn !== 0) {
          const wasVertical = Math.abs(Math.sin(car.angle)) > 0.5;
          car.angle = (car.angle + bestTurn + Math.PI * 2) % (Math.PI * 2);
          if (wasVertical) {
            car.y = sy + (Math.cos(car.angle) > 0 ? 20 : -20);
            car.x = ax;
          } else {
            car.x = ax + (Math.sin(car.angle) > 0 ? -20 : 20);
            car.y = sy;
          }
        }
      }
      const wantedSpeed = POLICE.chaseSpeed * (0.8 + 0.08 * p.wanted);
      car.speed += clamp(wantedSpeed - car.speed, -400 * dt, 300 * dt);
      const mx = car.x + Math.cos(car.angle) * car.speed * dt;
      const my = car.y + Math.sin(car.angle) * car.speed * dt;
      const pos = city.resolveCircle(mx, my, 21);
      car.x = pos.x;
      car.y = pos.y;
      if (pos.x !== mx || pos.y !== my) car.speed *= 0.6;
    }
    // Ram the player: damage on contact, and a bust when the player is on foot.
    const dd = dist(car.x, car.y, p.x, p.y);
    if (dd < 52) {
      if (p.onFoot) {
        p.bustTimer += dt;
        if (p.bustTimer >= POLICE.bustTime) return events | EVENT_BUSTED;
      } else if (p.car) {
        if (p.invulnerable <= 0) {
          p.car.health -= POLICE.ramDamage;
          p.health -= POLICE.ramDamage * 0.4;
          p.invulnerable = 0.6;
          events |= EVENT_CRASH;
          spawnParticles(car.x, car.y, '#ffd23f', 8, 180);
          if (p.car.health <= 0) events = killPlayerCar(p.car, events);
        }
      }
    } else if (p.onFoot) {
      p.bustTimer = Math.max(0, p.bustTimer - dt * 2);
    }
    return events;
  }

  /** The player's car is destroyed: it burns out and the player is thrown clear on foot. */
  function killPlayerCar(car, events) {
    const p = state.player;
    car.dead = true;
    spawnParticles(car.x, car.y, '#ff5722', 26, 320);
    spawnParticles(car.x, car.y, '#616161', 18, 140);
    events |= EVENT_CRASH;
    p.onFoot = true;
    p.car = null;
    const out = city.resolveCircle(car.x + Math.cos(car.angle + Math.PI / 2) * 40, car.y + Math.sin(car.angle + Math.PI / 2) * 40, PLAYER.radius);
    p.x = out.x;
    p.y = out.y;
    p.health = Math.max(1, p.health - 15);
    return events;
  }

  function killPoliceCar(car, events) {
    car.dead = true;
    spawnParticles(car.x, car.y, '#ff5722', 26, 320);
    spawnParticles(car.x, car.y, '#616161', 18, 140);
    addMoney(50);
    events |= EVENT_COP_DOWN;
    return raiseWanted(WANTED.killCop, events);
  }

  function stepPeds(dt, events) {
    const p = state.player;
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        ped.downTimer -= dt;
        if (ped.downTimer <= 0) ped.state = 'walk';
        continue;
      }
      const playerCar = p.car;
      const threatX = playerCar ? playerCar.x : p.x;
      const threatY = playerCar ? playerCar.y : p.y;
      const threatSpeed = playerCar ? Math.abs(playerCar.speed) : 0;
      const dThreat = dist(ped.x, ped.y, threatX, threatY);
      if (ped.state === 'walk' && ((playerCar && dThreat < 130 && threatSpeed > 200) || (!playerCar && dThreat < 40))) {
        ped.state = 'flee';
      }
      if (ped.state === 'flee') {
        const away = angleTo(threatX, threatY, ped.x, ped.y);
        const pos = city.resolveCircle(ped.x + Math.cos(away) * PED.fleeSpeed * dt, ped.y + Math.sin(away) * PED.fleeSpeed * dt, 10);
        ped.x = pos.x;
        ped.y = pos.y;
        ped.angle = away;
        if (dThreat > 260) ped.state = 'walk';
      } else {
        const target = ped.target;
        const a = angleTo(ped.x, ped.y, target.x, target.y);
        const pos = city.resolveCircle(ped.x + Math.cos(a) * PED.walkSpeed * dt, ped.y + Math.sin(a) * PED.walkSpeed * dt, 10);
        ped.x = pos.x;
        ped.y = pos.y;
        ped.angle = a;
        if (dist(ped.x, ped.y, target.x, target.y) < 24) ped.target = city.randomWalkPoint();
      }
      // Hit by a fast car: knocked down, and the law notices.
      if (playerCar && Math.abs(playerCar.speed) > 120 && dist(ped.x, ped.y, playerCar.x, playerCar.y) < 30) {
        ped.state = 'down';
        ped.downTimer = PED.knockdownTime;
        spawnParticles(ped.x, ped.y, '#e8b88a', 8, 160);
        events = raiseWanted(WANTED.hitPed, events);
      }
    }
    return events;
  }

  function stepBullets(dt, events) {
    for (const b of state.bullets) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) continue;
      if (city.hitsBuilding(b.x - 1, b.y - 1, 2, 2)) {
        b.life = 0;
        spawnParticles(b.x, b.y, '#b8c0c8', 4, 90);
        continue;
      }
      for (const car of state.cars) {
        if (car.dead || car.kind !== 'police') continue;
        if (dist(b.x, b.y, car.x, car.y) < 24) {
          b.life = 0;
          car.health -= PLAYER.pistolDamage;
          spawnParticles(b.x, b.y, '#ffd23f', 6, 140);
          if (car.health <= 0) events = killPoliceCar(car, events);
          break;
        }
      }
      if (b.life <= 0) continue;
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (dist(b.x, b.y, ped.x, ped.y) < 12) {
          b.life = 0;
          ped.state = 'down';
          ped.downTimer = PED.knockdownTime;
          spawnParticles(ped.x, ped.y, '#e8b88a', 6, 120);
          break;
        }
      }
    }
    state.bullets = state.bullets.filter((b) => b.life > 0);
    return events;
  }

  function stepCarCollisions(dt, events) {
    const cars = state.cars;
    for (let i = 0; i < cars.length; i++) {
      const a = cars[i];
      if (a.dead) continue;
      for (let j = i + 1; j < cars.length; j++) {
        const b = cars[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= 44 || d === 0) continue;
        const push = (44 - d) / 2;
        const nx = dx / d;
        const ny = dy / d;
        a.x -= nx * push;
        a.y -= ny * push;
        b.x += nx * push;
        b.y += ny * push;
        const impact = Math.abs(a.speed - b.speed);
        if (impact > 140) {
          a.speed *= 0.7;
          b.speed *= 0.7;
          if (a.kind === 'player' || b.kind === 'player') {
            events |= EVENT_CRASH;
            spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, '#ffb74d', 8, 160);
          }
        }
      }
    }
    return events;
  }

  function step(dt, input, paused) {
    let events = EVENT_NONE;
    if (paused) return events;
    state.time += dt;
    const p = state.player;
    if (p.invulnerable > 0) p.invulnerable -= dt;
    if (p.health < PLAYER.health && p.wanted === 0) p.health = Math.min(PLAYER.health, p.health + 1.5 * dt);

    events = p.onFoot ? stepPlayerOnFoot(dt, input, events) : stepPlayerCar(dt, input, events);
    for (const car of state.cars) {
      if (car.kind === 'traffic') stepTrafficCar(car, dt);
      else if (car.kind === 'police') events = stepPoliceCar(car, dt, events);
    }
    events = stepPeds(dt, events);
    events = stepBullets(dt, events);
    events = stepCarCollisions(dt, events);

    // Police response: keep the chase at the wanted level's strength.
    const policeCount = state.cars.filter((c) => c.kind === 'police' && !c.dead).length;
    if (p.wanted > 0) {
      state.policeTimer -= dt;
      if (policeCount < Math.min(p.wanted, POLICE.maxActive) && state.policeTimer <= 0) {
        spawnPolice();
        state.policeTimer = POLICE.spawnInterval;
      }
      p.wantedTimer += dt;
      const nearestCop = state.cars.reduce((best, c) => (c.kind === 'police' && !c.dead ? Math.min(best, dist(c.x, c.y, p.x, p.y)) : best), Infinity);
      if (p.wantedTimer > WANTED.decayDelay && nearestCop > 600) {
        p.wanted = Math.max(0, p.wanted - WANTED.decayPerSecond * dt);
      }
    } else {
      // No heat: stray police cars drive off and despawn.
      for (const car of state.cars) {
        if (car.kind === 'police' && !car.dead && dist(car.x, car.y, p.x, p.y) > 900) car.dead = true;
      }
    }
    // Keep the streets full and the sidewalks busy.
    state.spawnTimer -= dt;
    if (state.spawnTimer <= 0) {
      state.spawnTimer = 1.5;
      const liveTraffic = state.cars.filter((c) => c.kind === 'traffic' && !c.dead).length;
      if (liveTraffic < TRAFFIC.count) spawnTrafficCar(500);
      if (state.peds.length < PED.count) spawnPed();
    }
    state.cars = state.cars.filter((c) => !c.dead);
    if (state.cars.length > 60) state.cars = state.cars.filter((c) => c.kind !== 'traffic' || dist(c.x, c.y, p.x, p.y) < 1400);

    // Pickups.
    for (const pickup of state.pickups) {
      if (pickup.taken) continue;
      pickup.bob += dt * 3;
      if (dist(p.x, p.y, pickup.x, pickup.y) < 30) {
        pickup.taken = true;
        if (pickup.kind === 'cash') {
          addMoney(PICKUP.money);
        } else {
          p.ammo = Math.min(PLAYER.maxAmmo, p.ammo + PICKUP.ammo);
        }
        events |= EVENT_PICKUP;
        spawnParticles(pickup.x, pickup.y, '#ffd23f', 10, 140);
      }
    }

    // Particles.
    for (const pt of state.particles) {
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;
      pt.vx *= Math.exp(-2 * dt);
      pt.vy *= Math.exp(-2 * dt);
      pt.life -= dt;
    }
    state.particles = state.particles.filter((pt) => pt.life > 0);

    // Missions.
    const missionEvents = missions.update(dt, state, city, addMoney);
    events |= missionEvents;
    state.mission = missions.current();
    if (missions.allDone() && !state.storyDone) {
      state.storyDone = true;
      events |= EVENT_MISSION;
    }

    if (p.health <= 0) return events | EVENT_WASTED;
    return events;
  }

  reset(null);
  return { state, city, missions, reset, step, nearestCar, addMoney };
}

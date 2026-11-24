// Drawing only: the world's state and the current screen in, pixels out. The camera follows
// the player through the city; the HUD (money, health, wanted stars, objective), the minimap
// and the menus are drawn in screen space. Flat shapes and canvas text: no images, no assets.
import { BEACH, FONT, PALETTE, ROAD, WATER, WORLD } from './config.js';
import { LANDMARKS } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_COMPLETE = 'complete';

const PANEL = { width: 640, top: 150, line: 32, bottom: 78 };
const MINIMAP = { width: 216, height: 162, margin: 16 };

function cachedLabel(prefix) {
  let value = -1;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { dpr: 1, cssWidth: 1280, cssHeight: 720, camX: 0, camY: 0, zoom: 1 };
  const moneyLabel = cachedLabel('$');
  const bestLabel = cachedLabel('$');
  const speedLabel = cachedLabel('');

  const fonts = new Map();
  function font(size) {
    if (!fonts.has(size)) fonts.set(size, `bold ${size}px ${FONT}`);
    return fonts.get(size);
  }
  function plainFont(size) {
    const key = `p${size}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${FONT}`);
    return fonts.get(key);
  }

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    view.dpr = ratio;
    view.cssWidth = window.innerWidth;
    view.cssHeight = window.innerHeight;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
  }

  /** World coordinates under a screen point (CSS pixels). */
  function screenToWorld(sx, sy) {
    return {
      x: view.camX + (sx - view.cssWidth / 2) / view.zoom,
      y: view.camY + (sy - view.cssHeight / 2) / view.zoom,
    };
  }

  function text(value, x, y, size, color, align, bold) {
    context.font = bold ? font(size) : plainFont(size);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function drawGround(state) {
    const city = state.city;
    context.fillStyle = PALETTE.grass;
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // Mow stripes on the grass, for texture.
    context.fillStyle = PALETTE.grassDark;
    for (let y = 0; y < WORLD.height; y += 160) {
      context.fillRect(0, y, WORLD.width, 80);
    }
    // Beach and water on the east edge.
    context.fillStyle = PALETTE.sand;
    context.fillRect(BEACH.x, BEACH.y, BEACH.width, BEACH.height);
    context.fillStyle = PALETTE.water;
    context.fillRect(WATER.x, WATER.y, WATER.width, WATER.height);
    context.fillStyle = PALETTE.waterDeep;
    context.fillRect(WATER.x + 40, WATER.y, WATER.width - 40, WATER.height);
    // Parks.
    for (const park of city.parks) {
      context.fillStyle = PALETTE.park;
      context.fillRect(park.x, park.y, park.width, park.height);
    }
    // Sidewalks, then roads, then centre dashes.
    const half = ROAD.width / 2;
    context.fillStyle = PALETTE.sidewalk;
    for (const ax of ROAD.avenues) context.fillRect(ax - half - 8, 0, ROAD.width + 16, WORLD.height);
    for (const sy of ROAD.streets) context.fillRect(0, sy - half - 8, WORLD.width, ROAD.width + 16);
    context.fillStyle = PALETTE.road;
    for (const ax of ROAD.avenues) context.fillRect(ax - half, 0, ROAD.width, WORLD.height);
    for (const sy of ROAD.streets) context.fillRect(0, sy - half, WORLD.width, ROAD.width);
    context.fillStyle = PALETTE.roadLine;
    for (const ax of ROAD.avenues) {
      for (let y = 20; y < WORLD.height; y += 64) context.fillRect(ax - 2, y, 4, 34);
    }
    for (const sy of ROAD.streets) {
      for (let x = 20; x < WORLD.width; x += 64) context.fillRect(x, sy - 2, 34, 4);
    }
  }

  function drawBuildings(state) {
    const city = state.city;
    for (const b of city.buildings) {
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(b.x + 6, b.y + 8, b.width, b.height);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.width, b.height);
      context.fillStyle = b.top;
      context.fillRect(b.x + 5, b.y + 5, b.width - 10, b.height - 10);
      context.fillStyle = 'rgba(255,255,255,0.25)';
      context.fillRect(b.x + 5, b.y + 5, b.width - 10, 6);
      if (b.tall) {
        context.fillStyle = 'rgba(20,30,50,0.5)';
        for (let wy = b.y + 18; wy < b.y + b.height - 12; wy += 18) {
          for (let wx = b.x + 12; wx < b.x + b.width - 12; wx += 18) {
            context.fillRect(wx, wy, 9, 6);
          }
        }
      }
    }
    for (const t of city.trees) {
      context.fillStyle = '#2f5c26';
      context.fillRect(t.x - 2, t.y - 2, 4, 4);
      context.fillStyle = PALETTE.tree;
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.2)';
      context.beginPath();
      context.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.45, 0, Math.PI * 2);
      context.fill();
    }
    // Landmark pads and labels.
    context.textAlign = 'center';
    for (const key of Object.keys(LANDMARKS)) {
      const lm = LANDMARKS[key];
      context.fillStyle = lm.color;
      context.globalAlpha = 0.25;
      context.beginPath();
      context.arc(lm.x, lm.y, 46, 0, Math.PI * 2);
      context.fill();
      context.globalAlpha = 1;
      context.beginPath();
      context.arc(lm.x, lm.y, 8, 0, Math.PI * 2);
      context.fill();
      text(lm.name, lm.x, lm.y - 54, 15, PALETTE.text, 'center', true);
    }
  }

  function drawMarker(state, time) {
    const mission = state.mission;
    if (!mission || !mission.marker) return;
    const pulse = 1 + Math.sin(time * 5) * 0.15;
    const m = mission.marker;
    context.strokeStyle = m.color;
    context.lineWidth = 4;
    context.beginPath();
    context.arc(m.x, m.y, 34 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = m.color;
    context.beginPath();
    context.arc(m.x, m.y, 8, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(m.x, m.y - 52 * pulse);
    context.lineTo(m.x - 10, m.y - 34 * pulse);
    context.lineTo(m.x + 10, m.y - 34 * pulse);
    context.closePath();
    context.fill();
  }

  function drawPickups(state) {
    for (const pickup of state.pickups) {
      if (pickup.taken) continue;
      const bob = Math.sin(pickup.bob) * 3;
      context.fillStyle = pickup.kind === 'cash' ? '#4caf50' : '#ff9800';
      context.beginPath();
      context.arc(pickup.x, pickup.y + bob, 12, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.font = font(15);
      context.textAlign = 'center';
      context.fillText(pickup.kind === 'cash' ? '$' : 'A', pickup.x, pickup.y + bob + 5);
    }
  }

  function drawCar(car, time, isPlayer) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    const len = 46;
    const wid = 22;
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.fillRect(-len / 2 + 3, -wid / 2 + 4, len, wid);
    context.fillStyle = car.color;
    context.beginPath();
    context.roundRect(-len / 2, -wid / 2, len, wid, 6);
    context.fill();
    context.fillStyle = 'rgba(20,30,45,0.85)';
    context.fillRect(-6, -wid / 2 + 3, 16, wid - 6);
    context.fillStyle = 'rgba(255,255,255,0.25)';
    context.fillRect(-len / 2 + 4, -wid / 2 + 2, 8, wid - 4);
    // Headlights and taillights.
    context.fillStyle = '#fff8c0';
    context.fillRect(len / 2 - 3, -wid / 2 + 3, 3, 4);
    context.fillRect(len / 2 - 3, wid / 2 - 7, 3, 4);
    context.fillStyle = '#ff3b30';
    context.fillRect(-len / 2, -wid / 2 + 3, 3, 4);
    context.fillRect(-len / 2, wid / 2 - 7, 3, 4);
    if (car.kind === 'police') {
      const flash = Math.floor(time * 4) % 2 === 0;
      context.fillStyle = flash ? '#ff3b30' : '#3b82ff';
      context.beginPath();
      context.arc(-2, -wid / 2 + 1, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = flash ? '#3b82ff' : '#ff3b30';
      context.beginPath();
      context.arc(-2, wid / 2 - 1, 5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#ffffff';
      context.fillRect(-10, -wid / 2 + 4, 4, wid - 8);
    }
    if (isPlayer) {
      context.fillStyle = '#ffd23f';
      context.fillRect(-4, -2, 8, 4);
    }
    // Damage smoke.
    if (car.health < 40 && !car.dead) {
      context.fillStyle = 'rgba(90,90,90,0.6)';
      context.beginPath();
      context.arc(-len / 2 + 4, 0, 6 + Math.sin(time * 9) * 2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
  }

  function drawPed(ped) {
    if (ped.state === 'down') {
      context.fillStyle = ped.shirt;
      context.beginPath();
      context.ellipse(ped.x, ped.y, 12, 7, ped.angle, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(ped.x, ped.y + 8, 9, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.shirt;
    context.beginPath();
    context.arc(ped.x, ped.y, 9, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3, 5, 0, Math.PI * 2);
    context.fill();
  }

  function drawPlayer(state, time) {
    const p = state.player;
    if (!p.onFoot) return;
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(p.x, p.y + 10, 11, 5, 0, 0, Math.PI * 2);
    context.fill();
    if (p.invulnerable > 0 && Math.floor(p.invulnerable * 10) % 2 === 0) return;
    context.fillStyle = '#1f6fd0';
    context.beginPath();
    context.arc(p.x, p.y, 12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(p.x + Math.cos(p.angle) * 4, p.y + Math.sin(p.angle) * 4, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#1f1f1f';
    context.beginPath();
    context.arc(p.x + Math.cos(p.angle) * 8, p.y + Math.sin(p.angle) * 8, 3, 0, Math.PI * 2);
    context.fill();
  }

  function drawBullets(state) {
    context.fillStyle = '#fff3a0';
    for (const b of state.bullets) {
      context.beginPath();
      context.arc(b.x, b.y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawParticles(state) {
    for (const pt of state.particles) {
      context.globalAlpha = Math.max(0, pt.life / pt.max);
      context.fillStyle = pt.color;
      context.beginPath();
      context.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
  }

  function drawMinimap(state) {
    const x0 = view.cssWidth - MINIMAP.width - MINIMAP.margin;
    const y0 = view.cssHeight - MINIMAP.height - MINIMAP.margin;
    const sx = MINIMAP.width / WORLD.width;
    const sy = MINIMAP.height / WORLD.height;
    context.fillStyle = 'rgba(10,16,22,0.85)';
    context.fillRect(x0 - 4, y0 - 4, MINIMAP.width + 8, MINIMAP.height + 8);
    context.fillStyle = '#4a7a3a';
    context.fillRect(x0, y0, MINIMAP.width, MINIMAP.height);
    context.fillStyle = '#2f7fb8';
    context.fillRect(x0 + WATER.x * sx, y0, (WORLD.width - WATER.x) * sx, MINIMAP.height);
    context.fillStyle = '#e8d29a';
    context.fillRect(x0 + BEACH.x * sx, y0, (WATER.x - BEACH.x) * sx, MINIMAP.height);
    context.strokeStyle = '#c8c8c8';
    context.lineWidth = 2;
    for (const ax of ROAD.avenues) {
      context.beginPath();
      context.moveTo(x0 + ax * sx, y0);
      context.lineTo(x0 + ax * sx, y0 + MINIMAP.height);
      context.stroke();
    }
    for (const syRoad of ROAD.streets) {
      context.beginPath();
      context.moveTo(x0, y0 + syRoad * sy);
      context.lineTo(x0 + MINIMAP.width, y0 + syRoad * sy);
      context.stroke();
    }
    const mission = state.mission;
    if (mission && mission.marker) {
      context.fillStyle = mission.marker.color;
      context.beginPath();
      context.arc(x0 + mission.marker.x * sx, y0 + mission.marker.y * sy, 6, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) {
      if (car.dead) continue;
      context.fillStyle = car.kind === 'police' ? '#3b82ff' : car.kind === 'player' ? '#ffd23f' : '#e8e8e8';
      context.fillRect(x0 + car.x * sx - 2, y0 + car.y * sy - 2, 4, 4);
    }
    const p = state.player;
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.arc(x0 + p.x * sx, y0 + p.y * sy, 4, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#ffffff';
    context.lineWidth = 1;
    context.strokeRect(x0 - 4, y0 - 4, MINIMAP.width + 8, MINIMAP.height + 8);
  }

  function drawHud(state, ui) {
    const p = state.player;
    context.textBaseline = 'top';
    // Money and health, top left.
    context.fillStyle = 'rgba(10,16,22,0.6)';
    context.fillRect(14, 12, 220, 62);
    text(moneyLabel(state.money), 26, 20, 26, '#4caf50', 'left', true);
    context.fillStyle = '#333';
    context.fillRect(26, 52, 150, 12);
    context.fillStyle = p.health > 40 ? PALETTE.health : PALETTE.damage;
    context.fillRect(26, 52, 150 * Math.max(0, p.health / 100), 12);
    text(`Ammo ${p.ammo}`, 186, 50, 15, PALETTE.text, 'left', true);
    // Wanted stars, top right.
    const stars = Math.ceil(p.wanted);
    let starText = '';
    for (let i = 0; i < 5; i++) starText += i < stars ? '★' : '☆';
    text(starText, view.cssWidth - 26, 16, 30, PALETTE.star, 'right', true);
    if (p.wanted > 0) text('WANTED', view.cssWidth - 26, 52, 16, PALETTE.damage, 'right', true);
    // Mission objective, top centre.
    const mission = state.mission;
    if (mission) {
      const label = `${mission.job} — ${mission.objective}`;
      context.font = plainFont(17);
      const w = context.measureText(label).width + 28;
      context.fillStyle = 'rgba(10,16,22,0.6)';
      context.fillRect((view.cssWidth - w) / 2, 12, w, 30);
      text(label, view.cssWidth / 2, 19, 17, PALETTE.text, 'center', false);
    }
    // Speed, bottom left, while driving.
    if (!p.onFoot && p.car) {
      const mph = Math.round(Math.abs(p.car.speed) * 0.12);
      text(speedLabel(mph) + ' mph', 26, view.cssHeight - 52, 26, PALETTE.text, 'left', true);
    }
    // Toast banner under the objective.
    if (ui.toast && ui.toast.until > ui.time) {
      const alpha = Math.min(1, (ui.toast.until - ui.time) / 0.8);
      context.globalAlpha = alpha;
      context.font = plainFont(20);
      const w = context.measureText(ui.toast.text).width + 36;
      context.fillStyle = 'rgba(10,16,22,0.75)';
      context.fillRect((view.cssWidth - w) / 2, 56, w, 36);
      text(ui.toast.text, view.cssWidth / 2, 64, 20, '#ffd23f', 'center', true);
      context.globalAlpha = 1;
    }
    // Controls hint, bottom centre, fading out.
    if (ui.showHints) {
      context.globalAlpha = 0.85;
      text('WASD drive / walk — E enter & steal a car — Space punch — Click shoot — Shift run — P pause — M mute', view.cssWidth / 2, view.cssHeight - 34, 15, PALETTE.muted, 'center', false);
      context.globalAlpha = 1;
    }
    if (ui.muted) text('Muted (M)', 26, view.cssHeight - 52, 15, PALETTE.muted, 'left', false);
    drawMinimap(state);
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = PANEL.top + lines.length * PANEL.line + PANEL.bottom;
    const x = (view.cssWidth - PANEL.width) / 2;
    const y = (view.cssHeight - height) / 2;
    context.fillStyle = PALETTE.panel;
    context.fillRect(x, y, PANEL.width, height);
    context.strokeStyle = accent || '#ffd23f';
    context.lineWidth = 3;
    context.strokeRect(x, y, PANEL.width, height);
    context.textBaseline = 'alphabetic';
    text(title, view.cssWidth / 2, y + 78, 46, accent || PALETTE.text, 'center', true);
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], view.cssWidth / 2, y + PANEL.top + index * PANEL.line, 20, PALETTE.muted, 'center', false);
    }
    text(prompt, view.cssWidth / 2, y + height - 38, 22, '#ffd23f', 'center', true);
  }

  /** Paint one frame: the city through the camera, then the HUD or a panel. */
  function draw(state, screen, ui) {
    const p = state.player;
    const targetZoom = p.onFoot ? 1.0 : 0.82;
    view.zoom += (targetZoom - view.zoom) * 0.04;
    const lerp = 0.12;
    view.camX += (p.x - view.camX) * lerp;
    view.camY += (p.y - view.camY) * lerp;
    const halfW = view.cssWidth / 2 / view.zoom;
    const halfH = view.cssHeight / 2 / view.zoom;
    view.camX = Math.min(Math.max(view.camX, halfW - 200), WORLD.width - halfW + 200);
    view.camY = Math.min(Math.max(view.camY, halfH - 200), WORLD.height - halfH + 200);

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const s = view.dpr * view.zoom;
    context.setTransform(s, 0, 0, s, view.dpr * (view.cssWidth / 2 - view.camX * view.zoom), view.dpr * (view.cssHeight / 2 - view.camY * view.zoom));
    drawGround(state);
    drawBuildings(state);
    drawMarker(state, ui.time);
    drawPickups(state);
    for (const car of state.cars) {
      if (!car.dead) drawCar(car, ui.time, car.kind === 'player');
    }
    for (const ped of state.peds) drawPed(ped);
    drawPlayer(state, ui.time);
    drawBullets(state);
    drawParticles(state);

    // Screen space from here.
    context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    if (screen === SCREEN_TITLE) {
      drawPanel(
        'SOLMAR KEYS',
        [
          'A sun-soaked island city. One kid from the Keys.',
          'Three jobs for Rico Vega. The whole city to steal.',
          'Drive, run, steal cars, dodge the law — and finish the story.',
          `Best take: ${bestLabel(ui.best)}`,
          '',
          'WASD move & drive — E steal a car — Space punch',
          'Click shoot — Shift run — P pause — M mute',
        ],
        'Press Enter or click to start',
        '#ffd23f',
      );
      return;
    }
    drawHud(state, ui);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['The city waits for no one. Except now.'], 'Press P to resume');
    } else if (screen === SCREEN_BUSTED) {
      drawPanel(
        'BUSTED',
        [`The Solmar PD caught you. Fine: $200.`, `Money kept: $${state.money}.`, ''],
        'Press Enter to walk free',
        '#3b82ff',
      );
    } else if (screen === SCREEN_WASTED) {
      drawPanel(
        'WASTED',
        [`You went down in Solmar Keys. Hospital bill: $200.`, `Money kept: $${state.money}.`, ''],
        'Press Enter to get back up',
        '#e53935',
      );
    } else if (screen === SCREEN_COMPLETE) {
      drawPanel(
        'STORY COMPLETE',
        [
          'All three jobs done. Rico Vega owes you one.',
          `Total take: $${state.earned}. Best: $${state.best}.`,
          'The city is yours now — keep driving, keep earning.',
        ],
        'Press Enter to keep playing',
        '#4caf50',
      );
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, screenToWorld, view };
}

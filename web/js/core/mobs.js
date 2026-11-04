// Враги, боссы и снаряды. Главное правило мира: обычный враг рождается только в тёмной
// клетке (свет меньше DARK) и горит в ярком свете (свет от BURN и выше).
//
// Виды: капля (поверхность, прыгает), тень (ночью на поверхности, летает сквозь блоки),
// крот (пещеры, ходит и прыгает), бес (подземный ад, летает). Боссы: Ночной колосс (маяк
// ночью) и Сердце магмы (обсидиановый ключ в аду).
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(
    req ? require('./world.js') : root.SB.World,
    req ? require('./physics.js') : root.SB.Physics,
    req ? require('./light.js') : root.SB.Light,
    req ? require('./gen.js') : root.SB.Gen,
    req ? require('./time.js') : root.SB.Time,
  );
  if (req) module.exports = api;
  else (root.SB = root.SB || {}).Mobs = api;
})(typeof self !== 'undefined' ? self : this, function (Wd, P, Lt, G, T) {
/* c8 ignore stop */
  'use strict';
  const DARK = 5;
  const BURN = 12;
  const CAP = 6;
  const DESPAWN = 90;

  const TYPES = Object.freeze({
    drop: { hp: 18, dmg: 8, w: 0.9, h: 0.75, fly: false, speed: 5, loot: [['goo', 1, 2], ['coin', 1, 1]] },
    shade: { hp: 24, dmg: 12, w: 1.0, h: 1.0, fly: true, speed: 6, loot: [['shadow_dust', 1, 1], ['coin', 1, 2]] },
    mole: { hp: 35, dmg: 14, w: 0.9, h: 0.9, fly: false, speed: 6, loot: [['coin', 1, 3]] },
    imp: { hp: 50, dmg: 20, w: 0.9, h: 1.2, fly: true, speed: 7, loot: [['ember', 1, 2], ['coin', 2, 3]] },
    colossus: { hp: 700, dmg: 25, w: 4, h: 4, fly: true, speed: 9, boss: true, loot: [['life_shard', 1, 1], ['crystal', 10, 10], ['coin', 20, 20]] },
    heart: { hp: 1000, dmg: 30, w: 3, h: 3, fly: true, speed: 3, boss: true, loot: [['life_shard', 1, 1], ['magmite_bar', 8, 8], ['coin', 30, 30]] },
  });

  let nextId = 1;
  function make(kind, x, y) {
    const t = TYPES[kind];
    const b = P.body(x, y, t.w, t.h);
    return Object.assign(b, { id: nextId++, kind, hp: t.hp, maxHp: t.hp, hurtT: 0, t: 0, cd: 0, phase: 1 });
  }

  const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];
  function boxHit(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  // где можно родиться: вид по месту, null - нельзя
  function kindAt(game, x, y) {
    const world = game.world;
    if (Lt.at(game.light, x, y) >= DARK) return null;
    if (Wd.get(world, x, y) !== 0 || Wd.getLiq(world, x, y)) return null;
    if (y >= world.dims.hellTop) return 'imp';
    const depth = y - Wd.skyY(world, x);
    if (depth > 25) return fits(world, x, y) ? 'mole' : null;
    if (depth > 6) return null;
    if (T.isNight(game.time) && game.rng() < 0.45) return 'shade';
    return fits(world, x, y) ? 'drop' : null;
  }

  // ходячему нужна опора снизу и место над ним
  function fits(world, x, y) {
    return Wd.solidAt(world, x, y + 1) && !Wd.solidAt(world, x, y - 1) && !Wd.solidAt(world, x, y);
  }

  function nearAny(list, x, y, r) {
    return list.some((m) => Math.abs(m.x - x) < r && Math.abs(m.y - y) < r);
  }

  // одна попытка появления врага возле игрока
  function trySpawn(game) {
    const p = game.player.body;
    const normal = game.mobs.filter((m) => !TYPES[m.kind].boss).length;
    if (normal >= CAP || game.player.dead) return null;
    const side = game.rng() < 0.5 ? -1 : 1;
    const x = Math.floor(p.x + side * (28 + game.rng() * 30));
    let y = Math.floor(p.y + (game.rng() - 0.5) * 50);
    for (let k = 0; k < 24 && y < game.world.H - 1 && !Wd.solidAt(game.world, x, y + 1); k++) y++;
    if (nearAny(game.residents, x, y, 16)) return null;
    const kind = kindAt(game, x, y);
    if (!kind) return null;
    const t = TYPES[kind];
    const m = make(kind, x + 0.5 - t.w / 2, y + 1 - t.h - P.EPS);
    if (!t.fly && P.overlaps(game.world, m)) return null;
    game.mobs.push(m);
    return m;
  }

  function summon(game, boss) {
    if (game.mobs.some((m) => TYPES[m.kind].boss)) return null;
    const p = game.player.body;
    const m = boss === 'colossus' ? make('colossus', p.x - 2, p.y - 24) : make('heart', p.x + 18, p.y - 6);
    game.mobs.push(m);
    game.events.push({ type: 'boss', kind: boss });
    return m;
  }

  function hurtPlayer(game, dmg, fromX) {
    const pl = game.player;
    if (pl.dead || pl.invuln > 0 || dmg <= 0) return false;
    pl.hp = Math.max(0, pl.hp - dmg);
    pl.invuln = 0.6;
    pl.calm = 0;
    const [cx] = center(pl.body);
    pl.body.vx = (cx < fromX ? -1 : 1) * 10;
    pl.body.vy = Math.min(pl.body.vy, -8);
    game.events.push({ type: 'hurt', x: cx, y: pl.body.y, dmg });
    return true;
  }

  function hurtMob(game, m, dmg, fromX) {
    if (m.hp <= 0) return false;
    m.hp -= dmg;
    m.hurtT = 0.25;
    if (!TYPES[m.kind].boss) {
      m.vx = (center(m)[0] < fromX ? -1 : 1) * 9;
      m.vy = -7;
    }
    game.events.push({ type: 'hit', x: center(m)[0], y: m.y, dmg });
    return true;
  }

  function fly(m, tx, ty, speed, dt, k) {
    const [cx, cy] = center(m);
    const dx = tx - cx;
    const dy = ty - cy;
    const d = Math.hypot(dx, dy) || 1;
    const a = Math.min(1, dt * (k || 3));
    m.vx += ((dx / d) * speed - m.vx) * a;
    m.vy += ((dy / d) * speed - m.vy) * a;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
  }

  function shoot(game, m, tx, ty, speed, dmg, spread, count) {
    const [cx, cy] = center(m);
    const base = Math.atan2(ty - cy, tx - cx);
    for (let i = 0; i < count; i++) {
      const a = base + (count > 1 ? (i / (count - 1) - 0.5) * spread : 0);
      game.projectiles.push({ x: cx, y: cy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, ttl: 4, kind: m.kind });
    }
  }

  function think(game, m, dt) {
    const t = TYPES[m.kind];
    const p = game.player.body;
    const [px, py] = center(p);
    const [mx] = center(m);
    m.t += dt;
    m.cd -= dt;
    if (m.hurtT > 0) m.hurtT -= dt;
    const dir = px < mx ? -1 : 1;
    switch (m.kind) {
      case 'drop': {
        const input = {};
        if (m.onGround && m.cd <= 0) { input.jump = true; m.cd = 1.1 + game.rng() * 0.6; m.vx = dir * t.speed; }
        if (!m.onGround) { input.left = dir < 0; input.right = dir > 0; }
        P.step(game.world, m, input, dt);
        break;
      }
      case 'mole': {
        const blocked = Math.abs(m.vx) < 0.5 && m.t > 0.3;
        P.step(game.world, m, { left: dir < 0, right: dir > 0, jump: blocked && m.onGround }, dt);
        break;
      }
      case 'shade':
        fly(m, px + Math.sin(m.t * 1.7) * 3, py - 1 + Math.cos(m.t * 2.3) * 2, t.speed, dt);
        break;
      case 'imp':
        fly(m, px + Math.sin(m.t) * 6, py - 4, t.speed, dt);
        if (m.cd <= 0) { m.cd = 2.5; shoot(game, m, px, py, 12, 14, 0, 1); }
        break;
      case 'colossus': {
        if (m.hp < m.maxHp / 2) m.phase = 2;
        if (m.phase === 1) fly(m, px + Math.sin(m.t * 0.7) * 10, py - 12, t.speed, dt, 1.5);
        else fly(m, px + Math.sin(m.t * 1.3) * 14, py - 6 + Math.sin(m.t * 2.1) * 4, t.speed * 1.5, dt, 2);
        if (m.cd <= 0) { m.cd = m.phase === 1 ? 2.6 : 1.6; shoot(game, m, px, py, 14, 16, 0.9, m.phase === 1 ? 5 : 7); }
        break;
      }
      case 'heart': {
        fly(m, px + Math.cos(m.t * 0.5) * 12, py - 8, t.speed, dt, 1);
        if (m.cd <= 0) { m.cd = 2; shoot(game, m, px, py, 11, 18, 0.5, 3); }
        if (Math.floor(m.t / 8) !== Math.floor((m.t - dt) / 8) && game.mobs.filter((o) => o.kind === 'imp').length < 4) {
          game.mobs.push(make('imp', m.x + m.w / 2, m.y + m.h));
        }
        break;
      }
      default:
        break;
    }
  }

  // шаг всех врагов; возвращает убитых
  function update(game, dt) {
    const dead = [];
    const p = game.player.body;
    const night = T.isNight(game.time);
    for (const m of game.mobs) {
      const t = TYPES[m.kind];
      think(game, m, dt);
      if (!t.boss) {
        const [cx, cy] = center(m);
        if (Lt.at(game.light, Math.floor(cx), Math.floor(cy)) >= BURN) {
          m.hp -= 12 * dt;
          if (game.tick % 20 === 0) game.events.push({ type: 'burn', x: cx, y: cy });
        }
      }
      if (!game.player.dead && boxHit(m, p)) hurtPlayer(game, t.dmg, center(m)[0]);
      const far = Math.abs(m.x - p.x) > DESPAWN || Math.abs(m.y - p.y) > DESPAWN;
      const fled = (m.kind === 'shade' || m.kind === 'colossus') && !night;
      if (m.hp <= 0) dead.push(m);
      else if ((far && !t.boss) || fled || (t.boss && game.player.dead)) m.gone = true;
    }
    for (const m of dead) m.killed = true;
    game.mobs = game.mobs.filter((m) => !m.killed && !m.gone);
    for (const pr of game.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.ttl -= dt;
      if (Wd.solidAt(game.world, Math.floor(pr.x), Math.floor(pr.y))) pr.ttl = 0;
      else if (!game.player.dead && pr.x > p.x && pr.x < p.x + p.w && pr.y > p.y && pr.y < p.y + p.h) {
        hurtPlayer(game, pr.dmg, pr.x - pr.vx);
        pr.ttl = 0;
      }
    }
    game.projectiles = game.projectiles.filter((pr) => pr.ttl > 0);
    return dead;
  }

  function lootOf(kind, r) {
    const out = [];
    for (const [id, a, b] of TYPES[kind].loot) out.push([id, a + Math.floor(r() * (b - a + 1))]);
    return out;
  }

  return { DARK, BURN, CAP, DESPAWN, TYPES, make, center, boxHit, kindAt, fits, trySpawn, summon, hurtPlayer, hurtMob, update, lootOf, shoot };
});

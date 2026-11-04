// Игра целиком без окна: игрок, копание и стройка, предметы на земле, бой, смерть и
// возрождение, время суток, свет и жидкости вокруг игрока, враги, боссы и жители.
// Один шаг - STEP секунды; окно только передаёт ввод и рисует состояние.
//
// Ввод: { left, right, jump, use, aimX, aimY } - aim в клетках мира (дробные).
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const m = (n) => (req ? require('./' + n + '.js') : null);
  const S = req ? null : root.SB;
  const api = factory(
    m('noise') || S.Noise, m('data') || S.Data, m('gen') || S.Gen, m('world') || S.World, m('light') || S.Light,
    m('liquid') || S.Liquid, m('physics') || S.Physics, m('inventory') || S.Inv, m('time') || S.Time,
    m('mobs') || S.Mobs, m('npc') || S.Npc, m('save') || S.Save,
  );
  if (req) module.exports = api;
  else (root.SB = root.SB || {}).Game = api;
})(typeof self !== 'undefined' ? self : this, function (N, D, G, Wd, Lt, Lq, P, Inv, T, M, Npc, Sv) {
/* c8 ignore stop */
  'use strict';
  const { B } = D;
  const STEP = 1 / 60;
  const REACH = 5.5;
  const AREA = Object.freeze({ x: 72, y: 48 });
  const LIQ_AREA = Object.freeze({ x: 64, y: 44 });
  const PLAYER = Object.freeze({ w: 0.8, h: 1.8, hp: 100, maxShards: 3 });
  const RESPAWN = 3;
  const SAFE_FALL = 12;
  const MAGNET = 5.5;
  // свет предмета в руке
  const HAND_LIGHT = Object.freeze({ torch: 11, campfire: 9, crystal: 7, crystal_ore: 6, magmite_ore: 5 });
  const START = Object.freeze([['stone_pick', 1], ['wood_sword', 1], ['torch', 12], ['wood', 10]]);

  function newPlayer(spawn) {
    const body = P.body(spawn.x - PLAYER.w / 2, spawn.y - PLAYER.h - P.EPS, PLAYER.w, PLAYER.h);
    return {
      body, hp: PLAYER.hp, maxHp: PLAYER.hp, shards: 0, facing: 1, invuln: 0, dead: 0, slot: 0, cd: 0, swing: 0,
      potionCd: 0, calm: 0, mining: null, spawn: { x: spawn.x, y: spawn.y },
    };
  }

  function create(opts) {
    const o = opts || {};
    const seed = o.seed === undefined ? N.seedFrom('Sandbox2D') : o.seed | 0;
    const world = o.world || Wd.create(seed, o.W, o.H);
    const spawn = G.spawnPoint(world.seed, world.dims);
    const inv = Inv.create();
    for (const [id, n] of START) Inv.add(inv, id, n);
    const game = {
      name: o.name || 'World',
      world,
      time: 0.05,
      day: 0,
      tick: 0,
      player: newPlayer(spawn),
      inv,
      mobs: [],
      projectiles: [],
      drops: [],
      residents: [],
      campfires: [],
      bosses: { colossus: false, heart: false },
      stats: { kills: 0, coins: 0 },
      events: [],
      light: null,
      liq: Lq.emptyStats(),
      rng: N.rng((world.seed ^ 0x5bd1e995) >>> 0),
      spawning: o.spawning !== false,
    };
    relight(game);
    return game;
  }

  const center = (b) => [b.x + b.w / 2, b.y + b.h / 2];

  function relight(game) {
    const [cx, cy] = center(game.player.body);
    const x0 = Math.floor(cx) - AREA.x;
    const y0 = Math.floor(cy) - AREA.y;
    const held = game.inv[game.player.slot];
    const glow = !game.player.dead && held && HAND_LIGHT[held.id] ? [[cx, cy - 0.3, HAND_LIGHT[held.id]]] : null;
    game.light = Lt.compute(game.world, x0, y0, AREA.x * 2, AREA.y * 2, T.daylight(game.time), glow);
    game.lightVersion = game.world.version;
  }

  function emit(game, e) {
    game.events.push(e);
    if (game.events.length > 300) game.events.splice(0, game.events.length - 300);
  }

  // ---------- предметы на земле ----------

  function dropItem(game, id, n, x, y) {
    if (!id || !(n > 0)) return null;
    const d = P.body(x - 0.3, y - 0.3, 0.6, 0.6);
    Object.assign(d, { id, n, age: 0 });
    game.drops.push(d);
    return d;
  }

  function updateDrops(game, dt) {
    const p = game.player;
    const [px, py] = center(p.body);
    for (const d of game.drops) {
      d.age += dt;
      const [dx, dy] = [px - (d.x + 0.3), py - (d.y + 0.3)];
      const dist = Math.hypot(dx, dy);
      if (!p.dead && d.age > 0.4 && dist < MAGNET && Inv.room(game.inv, d.id) > 0) {
        d.x += (dx / (dist || 1)) * 14 * dt;
        d.y += (dy / (dist || 1)) * 14 * dt;
        if (dist < 1.2) {
          const left = Inv.add(game.inv, d.id, d.n);
          const got = d.n - left;
          if (got > 0) {
            if (d.id === 'coin') game.stats.coins += got;
            emit(game, { type: 'pickup', id: d.id, n: got });
          }
          d.n = left;
        }
      } else {
        P.step(game.world, d, {}, dt);
      }
    }
    game.drops = game.drops.filter((d) => d.n > 0 && d.age < 600);
  }

  // ---------- копать и строить ----------

  function inReach(game, x, y) {
    const [px, py] = center(game.player.body);
    return Math.hypot(x + 0.5 - px, y + 0.5 - py) <= REACH;
  }

  function hasSupport(world, x, y, kind) {
    if (kind === 'floor') return Wd.solidAt(world, x, y + 1);
    if (kind === 'any') {
      if (Wd.getWall(world, x, y)) return true;
      return Wd.solidAt(world, x, y + 1) || Wd.solidAt(world, x - 1, y) || Wd.solidAt(world, x + 1, y) || Wd.solidAt(world, x, y - 1);
    }
    return true;
  }

  // блок держится за что-нибудь: сосед не воздух или стена
  function anchored(world, x, y) {
    if (Wd.getWall(world, x, y)) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (Wd.get(world, x + dx, y + dy) !== B.AIR || Wd.getWall(world, x + dx, y + dy)) return true;
    }
    return false;
  }

  function bodies(game) {
    return [game.player.body, ...game.mobs, ...game.residents];
  }

  function blocksBody(game, x, y) {
    return bodies(game).some((b) => b.x < x + 1 && b.x + b.w > x && b.y < y + 1 && b.y + b.h > y);
  }

  // можно ли поставить блок id в клетку; причина отказа или null
  function placeProblem(game, x, y, blockId) {
    const world = game.world;
    const def = D.BLOCKS[blockId];
    if (!def || blockId === B.AIR) return 'item';
    if (!Wd.inside(world, x, y)) return 'outside';
    if (!inReach(game, x, y)) return 'reach';
    if (Wd.get(world, x, y) !== B.AIR) return 'occupied';
    if (Wd.getLiq(world, x, y)) return 'liquid';
    if (def.support && !hasSupport(world, x, y, def.support)) return 'support';
    if (!def.support && !anchored(world, x, y)) return 'support';
    if (def.solid && blocksBody(game, x, y)) return 'body';
    return null;
  }

  function place(game, x, y, slot) {
    const s = game.inv[slot];
    if (!s) return false;
    const it = D.ITEMS[s.id];
    if (it.kind === 'wall') return placeWall(game, x, y, slot);
    const blockId = D.blockOfItem(s.id);
    const why = placeProblem(game, x, y, blockId);
    if (why) return false;
    Wd.set(game.world, x, y, blockId);
    Inv.removeAt(game.inv, slot, 1);
    if (blockId === B.CAMPFIRE) game.campfires.push([x, y]);
    emit(game, { type: 'place', x, y, block: blockId });
    return true;
  }

  function placeWall(game, x, y, slot) {
    const world = game.world;
    const it = D.ITEMS[game.inv[slot].id];
    if (!Wd.inside(world, x, y) || !inReach(game, x, y) || Wd.getWall(world, x, y)) return false;
    if (!anchored(world, x, y) && Wd.get(world, x, y) === B.AIR) return false;
    Wd.setWall(world, x, y, it.wall);
    Inv.removeAt(game.inv, slot, 1);
    emit(game, { type: 'place', x, y, wall: it.wall });
    return true;
  }

  // сломать блок: выпадает ровно его предмет; что держалось на нём - падает тоже
  function breakBlock(game, x, y, fell) {
    const world = game.world;
    const id = Wd.get(world, x, y);
    const def = D.BLOCKS[id];
    if (!def || id === B.AIR || id === Wd.OUT || def.tier > 50) return false;
    Wd.set(world, x, y, B.AIR);
    if (def.drop) dropItem(game, def.drop, 1, x + 0.5, y + 0.5);
    if (id === B.CAMPFIRE) game.campfires = game.campfires.filter((c) => c[0] !== x || c[1] !== y);
    emit(game, { type: 'break', x, y, block: id });
    if (id === B.LOG || id === B.CACTUS) {
      if (Wd.get(world, x, y - 1) === id) breakBlock(game, x, y - 1, true);
      else if (id === B.LOG) clearCanopy(game, x, y);
    }
    if (!fell) settle(game, x, y);
    return true;
  }

  // листва вокруг верхушки срубленного дерева исчезает
  function clearCanopy(game, x, y) {
    for (let j = y - 4; j <= y + 2; j++) {
      for (let i = x - 3; i <= x + 3; i++) {
        const b = Wd.get(game.world, i, j);
        if (b === B.LEAVES || b === B.PINE) Wd.set(game.world, i, j, B.AIR);
      }
    }
  }

  // проверить соседей: факел без опоры и станция без пола падают
  function settle(game, x, y) {
    for (const [dx, dy] of [[0, -1], [1, 0], [-1, 0], [0, 1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const def = D.BLOCKS[Wd.get(game.world, nx, ny)];
      if (def && def.support && !hasSupport(game.world, nx, ny, def.support)) breakBlock(game, nx, ny);
    }
  }

  function breakWall(game, x, y) {
    const w = Wd.getWall(game.world, x, y);
    if (!w) return false;
    Wd.setWall(game.world, x, y, 0);
    dropItem(game, D.WALLS[w].key, 1, x + 0.5, y + 0.5);
    emit(game, { type: 'break', x, y, wall: w });
    const def = D.BLOCKS[Wd.get(game.world, x, y)];
    if (def && def.support && !hasSupport(game.world, x, y, def.support)) breakBlock(game, x, y);
    return true;
  }

  // копание киркой: прогресс копится, пока цель та же
  function mine(game, x, y, pick, dt) {
    const world = game.world;
    const p = game.player;
    if (!inReach(game, x, y)) { p.mining = null; return 'reach'; }
    const id = Wd.get(world, x, y);
    const wall = id === B.AIR;
    if (wall && !Wd.getWall(world, x, y)) { p.mining = null; return 'empty'; }
    const def = D.BLOCKS[id];
    if (!wall && def.tier > pick.tier) {
      if (!p.mining || p.mining.x !== x || p.mining.y !== y) emit(game, { type: 'hard', x, y });
      p.mining = { x, y, wall, progress: 0 };
      return 'hard';
    }
    if (!p.mining || p.mining.x !== x || p.mining.y !== y || p.mining.wall !== wall) p.mining = { x, y, wall, progress: 0 };
    const hard = wall ? 0.4 : Math.max(0.05, def.hard);
    p.mining.progress += (dt * pick.power) / hard;
    if (game.tick % 14 === 0) emit(game, { type: 'dig', x, y, block: id });
    if (p.mining.progress < 1) return 'digging';
    p.mining = null;
    if (wall) breakWall(game, x, y);
    else breakBlock(game, x, y);
    return 'broken';
  }

  // ---------- бой ----------

  function swing(game, item, aimX, aimY) {
    const p = game.player;
    const [px, py] = center(p.body);
    p.facing = aimX < px ? -1 : 1;
    p.cd = item.kind === 'sword' ? 0.33 : 0.45;
    p.swing = 0.25;
    emit(game, { type: 'swing', x: px, y: py });
    const reach = item.kind === 'sword' ? 2.6 : 1.8;
    const box = { x: p.facing > 0 ? px : px - reach, y: py - 1.6, w: reach, h: 3.2 };
    let hit = 0;
    for (const m of game.mobs) if (M.boxHit(box, m) && M.hurtMob(game, m, item.damage, px)) hit++;
    return hit;
  }

  function killed(game, list) {
    for (const m of list) {
      const [cx, cy] = center(m);
      for (const [id, n] of M.lootOf(m.kind, game.rng)) dropItem(game, id, n, cx, cy);
      game.stats.kills++;
      if (M.TYPES[m.kind].boss) {
        game.bosses[m.kind] = true;
        emit(game, { type: 'bossDown', kind: m.kind });
      }
      emit(game, { type: 'kill', kind: m.kind, x: cx, y: cy });
    }
  }

  // ---------- предметы в руке ----------

  function use(game, input, dt) {
    const p = game.player;
    const s = game.inv[p.slot];
    if (!s) return null;
    const it = D.ITEMS[s.id];
    const ax = Math.floor(input.aimX);
    const ay = Math.floor(input.aimY);
    if (it.kind === 'pick') {
      const target = mobAt(game, input.aimX, input.aimY);
      if (target && p.cd <= 0) return swing(game, it, input.aimX, input.aimY) ? 'hit' : 'miss';
      return mine(game, ax, ay, it, dt);
    }
    if (p.cd > 0) return 'wait';
    if (it.kind === 'sword') { swing(game, it, input.aimX, input.aimY); return 'swing'; }
    if (it.kind === 'block' || it.kind === 'wall') {
      const ok = place(game, ax, ay, p.slot);
      if (ok) p.cd = 0.12;
      return ok ? 'placed' : 'blocked';
    }
    if (it.kind === 'use') return consume(game, p.slot);
    if (it.kind === 'summon') return summonWith(game, p.slot);
    return null;
  }

  function mobAt(game, x, y) {
    return game.mobs.find((m) => x >= m.x && x <= m.x + m.w && y >= m.y && y <= m.y + m.h) || null;
  }

  function consume(game, slot) {
    const p = game.player;
    const it = D.ITEMS[game.inv[slot].id];
    p.cd = 0.4;
    if (it.heal) {
      if (p.potionCd > 0 || p.hp >= p.maxHp) return 'wait';
      p.hp = Math.min(p.maxHp, p.hp + it.heal);
      p.potionCd = 20;
    } else if (it.maxHp) {
      if (p.shards >= PLAYER.maxShards) return 'full';
      p.shards++;
      p.maxHp += it.maxHp;
      p.hp = Math.min(p.maxHp, p.hp + it.maxHp);
    }
    Inv.removeAt(game.inv, slot, 1);
    emit(game, { type: 'drink', id: it.id });
    return 'used';
  }

  function summonWith(game, slot) {
    const it = D.ITEMS[game.inv[slot].id];
    const p = game.player;
    p.cd = 1;
    if (it.boss === 'colossus' && !T.isNight(game.time)) return 'day';
    if (it.boss === 'heart' && p.body.y < game.world.dims.hellTop) return 'not-hell';
    if (!M.summon(game, it.boss)) return 'busy';
    Inv.removeAt(game.inv, slot, 1);
    return 'summoned';
  }

  // ---------- игрок ----------

  function updatePlayer(game, input, dt) {
    const p = game.player;
    const b = p.body;
    if (p.dead > 0) {
      p.dead -= dt;
      if (p.dead <= 0) respawn(game);
      return;
    }
    p.cd = Math.max(0, p.cd - dt);
    p.swing = Math.max(0, p.swing - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.potionCd = Math.max(0, p.potionCd - dt);
    if (input.left && !input.right) p.facing = -1;
    if (input.right && !input.left) p.facing = 1;
    const landed = P.step(game.world, b, input, dt);
    if (landed > SAFE_FALL) M.hurtPlayer(game, Math.round((landed - SAFE_FALL) * 4), center(b)[0]);
    if (b.inLiquid === D.L.LAVA) {
      if (p.invuln <= 0) M.hurtPlayer(game, 20, center(b)[0]);
    }
    if (input.use && input.aimX !== undefined) use(game, input, dt);
    else p.mining = null;
    // медленное лечение, если 5 секунд не били
    p.calm += dt;
    if (p.calm > 5 && p.hp < p.maxHp && game.tick % 60 === 0) p.hp = Math.min(p.maxHp, p.hp + 1);
    if (p.hp <= 0) die(game);
  }

  function die(game) {
    const p = game.player;
    p.dead = RESPAWN;
    p.mining = null;
    const coins = Inv.count(game.inv, 'coin');
    const lost = Math.floor(coins / 2);
    if (lost > 0) Inv.remove(game.inv, 'coin', lost);
    emit(game, { type: 'death', lost });
  }

  function respawn(game) {
    const p = game.player;
    const s = p.spawn;
    p.body.x = s.x - PLAYER.w / 2;
    p.body.y = s.y - PLAYER.h - P.EPS;
    p.body.vx = 0;
    p.body.vy = 0;
    P.unstick(game.world, p.body);
    p.hp = p.maxHp;
    p.dead = 0;
    p.invuln = 2;
    game.projectiles = [];
    emit(game, { type: 'respawn' });
  }

  // ---------- шаг мира ----------

  function step(game, input) {
    const inp = input || {};
    const dt = STEP;
    game.tick++;
    const adv = T.advance(game.time, dt);
    game.time = adv.t;
    game.day += adv.days;
    updatePlayer(game, inp, dt);
    if (game.tick % 3 === 0) {
      const [cx, cy] = center(game.player.body);
      const before = game.liq.obsidian.length;
      Lq.step(game.world, Math.floor(cx) - LIQ_AREA.x, Math.floor(cy) - LIQ_AREA.y, LIQ_AREA.x * 2, LIQ_AREA.y * 2, game.tick / 3, game.liq);
      for (const [x, y] of game.liq.obsidian.slice(before)) emit(game, { type: 'obsidian', x, y });
      if (game.liq.obsidian.length > 100) game.liq.obsidian.length = 0;
      for (const b of bodies(game)) P.unstick(game.world, b);
    }
    if (game.tick % 6 === 0) relight(game);
    if (game.spawning && game.tick % 60 === 0) M.trySpawn(game);
    killed(game, M.update(game, dt));
    if (game.tick % 300 === 0) Npc.check(game);
    Npc.update(game, dt);
    updateDrops(game, dt);
  }

  function craft(game, recipe) {
    const [cx, cy] = center(game.player.body);
    const ok = Inv.craft(game.inv, recipe, Inv.stationsNear(game.world, cx, cy));
    if (ok) emit(game, { type: 'craft', id: recipe.out });
    return ok;
  }

  function stations(game) {
    const [cx, cy] = center(game.player.body);
    return Inv.stationsNear(game.world, cx, cy);
  }

  // ---------- сохранение ----------

  function toSave(game) {
    const p = game.player;
    return Sv.serialize({
      name: game.name, world: game.world, time: game.time, day: game.day,
      player: { x: p.body.x, y: p.body.y, hp: p.hp, maxHp: p.maxHp, shards: p.shards },
      inv: game.inv, residents: game.residents, bosses: game.bosses, stats: game.stats,
    });
  }

  function fromSave(text, opts) {
    const s = Sv.deserialize(text);
    if (!s) return null;
    const game = create(Object.assign({}, opts, { world: s.world, name: s.name }));
    game.time = s.time;
    game.day = s.day;
    game.inv = s.inv;
    game.bosses = Object.assign({ colossus: false, heart: false }, s.bosses);
    game.stats = Object.assign({ kills: 0, coins: 0 }, s.stats);
    const p = game.player;
    p.body.x = s.player.x;
    p.body.y = s.player.y;
    p.maxHp = s.player.maxHp;
    p.hp = Math.max(1, s.player.hp);
    p.shards = s.player.shards;
    P.unstick(game.world, p.body);
    for (const c of Wd.dirtyChunks(game.world)) {
      for (let i = 0; i < c.fg.length; i++) if (c.fg[i] === B.CAMPFIRE) game.campfires.push([c.cx * 32 + (i & 31), c.cy * 32 + (i >> 5)]);
    }
    relight(game);
    game.residents = s.residents.filter((r) => Wd.get(game.world, r.home[0], r.home[1]) === B.CAMPFIRE).map((r) => Npc.make(r.kind, r.home));
    return game;
  }

  return {
    STEP, REACH, AREA, PLAYER, START, HAND_LIGHT, SAFE_FALL, create, relight, step, place, placeProblem, breakBlock, breakWall, mine,
    use, swing, consume, craft, stations, dropItem, inReach, hasSupport, anchored, toSave, fromSave, respawn, die, center,
  };
});

// Законы игры целиком: копание даёт ровно один предмет, блок не ставится в игрока, свет
// решает, где рождаются враги, боссы зовутся по правилу, жители приходят к костру, торговля
// честная, смерть и сохранение.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core, flatWorld } = require('./helpers');
const Gm = core('game');
const Wd = core('world');
const Inv = core('inventory');
const M = core('mobs');
const Npc = core('npc');
const T = core('time');
const P = core('physics');
const Lq = core('liquid');
const D = core('data');
const { B, W, L } = D;

// ровный мир: камень с y=40, игрок стоит на x=20
function flat(opts) {
  const world = flatWorld(96, 64, 40);
  world.dims = Object.assign({}, world.dims, { spawnX: 20, hellTop: 60 });
  const game = Gm.create(Object.assign({ world, spawning: false }, opts));
  game.player.spawn = { x: 20.5, y: 40 };
  Gm.respawn(game);
  game.player.invuln = 0;
  game.events.length = 0;
  for (let i = 0; i < 10; i++) Gm.step(game, {});
  return game;
}

function hold(game, id, n) {
  game.inv.fill(null);
  if (id) Inv.add(game.inv, id, n || 1);
  game.player.slot = 0;
}

function run(game, input, ticks) {
  for (let i = 0; i < ticks; i++) Gm.step(game, input);
}

function pickupAll(game) {
  run(game, {}, 120);
}

test('игрок появляется на земле и стоит', () => {
  const game = flat();
  const b = game.player.body;
  assert.ok(b.onGround);
  assert.ok(Math.abs(b.y + b.h - 40) < 0.01);
  assert.ok(!P.overlaps(game.world, b));
  assert.equal(Inv.count(game.inv, 'stone_pick'), 1);
});

test('копание: блок ломается за время по твёрдости и даёт ровно один предмет', () => {
  const game = flat();
  hold(game, 'stone_pick');
  let ticks = 0;
  while (Wd.get(game.world, 22, 40) === B.STONE && ticks < 600) { Gm.step(game, { use: true, aimX: 22.5, aimY: 40.5 }); ticks++; }
  assert.equal(Wd.get(game.world, 22, 40), B.AIR);
  const expect = D.BLOCKS[B.STONE].hard / D.ITEMS.stone_pick.power * 60;
  assert.ok(Math.abs(ticks - expect) <= 2, `тиков ${ticks}, ждали ${expect}`);
  pickupAll(game);
  assert.equal(Inv.count(game.inv, 'stone'), 1);
  assert.ok(game.events.some((e) => e.type === 'pickup' && e.id === 'stone'));
});

test('закон: копание любого блока даёт не больше одного предмета, коренная порода не копается', () => {
  for (const b of D.BLOCKS) {
    if (b.id === B.AIR || b.support) continue;
    const game = flat();
    Wd.set(game.world, 23, 39, b.id);
    const before = game.drops.length;
    const ok = Gm.breakBlock(game, 23, 39);
    if (b.id === B.BEDROCK) { assert.equal(ok, false); continue; }
    assert.equal(ok, true, b.key);
    const got = game.drops.slice(before);
    assert.equal(got.length, b.drop ? 1 : 0, b.key);
    if (b.drop) assert.deepEqual([got[0].id, got[0].n], [b.drop, 1]);
  }
  const game = flat();
  assert.equal(Gm.breakBlock(game, 23, 30), false, 'воздух не ломается');
});

test('слабая кирка не берёт крепкую руду; далеко не копается', () => {
  const game = flat();
  hold(game, 'stone_pick');
  Wd.set(game.world, 21, 40, B.IRON);
  run(game, { use: true, aimX: 21.5, aimY: 40.5 }, 300);
  assert.equal(Wd.get(game.world, 21, 40), B.IRON);
  assert.ok(game.events.some((e) => e.type === 'hard'));
  assert.equal(Gm.mine(game, 40, 40, D.ITEMS.stone_pick, 1), 'reach');
  assert.equal(Gm.mine(game, 21, 36, D.ITEMS.stone_pick, 1), 'empty');
  hold(game, 'iron_pick');
  run(game, { use: true, aimX: 21.5, aimY: 40.5 }, 120);
  assert.equal(Wd.get(game.world, 21, 40), B.AIR);
});

test('кирка по пустой клетке со стеной снимает стену', () => {
  const game = flat();
  Wd.setWall(game.world, 22, 37, W.PLANK);
  hold(game, 'stone_pick');
  run(game, { use: true, aimX: 22.5, aimY: 37.5 }, 60);
  assert.equal(Wd.getWall(game.world, 22, 37), 0);
  pickupAll(game);
  assert.equal(Inv.count(game.inv, 'plank_wall'), 1);
});

test('стройка: блок не ставится в игрока, в воздух без опоры и в жидкость', () => {
  const game = flat();
  const b = game.player.body;
  const px = Math.floor(b.x + b.w / 2);
  hold(game, 'stone', 10);
  assert.equal(Gm.placeProblem(game, px, 39, B.STONE), 'body');
  assert.equal(Gm.placeProblem(game, 23, 35, B.STONE), 'support');
  assert.equal(Gm.placeProblem(game, 23, 40, B.STONE), 'occupied');
  assert.equal(Gm.placeProblem(game, 50, 39, B.STONE), 'reach');
  assert.equal(Gm.placeProblem(game, 23, 39, B.AIR), 'item');
  assert.equal(Gm.placeProblem(game, -1, 39, B.STONE), 'outside');
  Wd.setLiq(game.world, 23, 39, Lq.pack(L.WATER, 8));
  assert.equal(Gm.placeProblem(game, 23, 39, B.STONE), 'liquid');
  Wd.setLiq(game.world, 23, 39, 0);
  assert.equal(Gm.use(game, { aimX: 23.5, aimY: 39.5 }, Gm.STEP), 'placed');
  assert.equal(Wd.get(game.world, 23, 39), B.STONE);
  assert.equal(Inv.count(game.inv, 'stone'), 9);
  game.player.cd = 0;
  assert.equal(Gm.use(game, { aimX: px + 0.5, aimY: 39.5 }, Gm.STEP), 'blocked');
  assert.equal(Inv.count(game.inv, 'stone'), 9, 'неудача не тратит блок');
});

test('закон: что бы ни ставили и ни копали, игрок не оказывается внутри блока', () => {
  const game = flat();
  const r = require('./helpers').core('noise').rng(5);
  const items = ['stone', 'planks', 'torch', 'dirt', 'stone_pick', 'glass'];
  for (let t = 0; t < 2000; t++) {
    if (t % 20 === 0) {
      hold(game, items[Math.floor(r() * items.length)], 50);
    }
    const b = game.player.body;
    const input = { left: r() < 0.3, right: r() < 0.3, jump: r() < 0.2, use: r() < 0.7, aimX: b.x + (r() - 0.5) * 8, aimY: b.y + (r() - 0.3) * 6 };
    Gm.step(game, input);
    let hit = false;
    for (let cy = Math.floor(b.y + 1e-3); cy <= Math.floor(b.y + b.h - 1e-3); cy++) for (let cx = Math.floor(b.x + 1e-3); cx <= Math.floor(b.x + b.w - 1e-3); cx++) if (Wd.solidAt(game.world, cx, cy)) hit = true;
    assert.ok(!hit, `шаг ${t}`);
  }
});

test('опора: факел падает без стены и соседей, станция - без пола', () => {
  const game = flat();
  Wd.set(game.world, 24, 39, B.STONE);
  Wd.set(game.world, 25, 39, B.TORCH);
  Wd.set(game.world, 24, 38, B.WORKBENCH);
  Wd.set(game.world, 25, 40, B.AIR);
  Gm.breakBlock(game, 24, 39);
  assert.equal(Wd.get(game.world, 25, 39), B.AIR, 'факел упал');
  assert.equal(Wd.get(game.world, 24, 38), B.AIR, 'верстак упал');
  pickupAll(game);
  assert.equal(Inv.count(game.inv, 'torch') >= 1, true);
  assert.equal(Inv.count(game.inv, 'workbench'), 1);
  // факел на стене держится
  Wd.setWall(game.world, 30, 30, W.PLANK);
  assert.equal(Gm.hasSupport(game.world, 30, 30, 'any'), true);
  assert.equal(Gm.hasSupport(game.world, 31, 30, 'any'), false);
  assert.equal(Gm.hasSupport(game.world, 31, 30, null), true);
  Gm.breakWall(game, 30, 30);
  assert.equal(Gm.breakWall(game, 30, 30), false);
});

test('дерево рубится целиком: каждый ствол даёт одно дерево, листва исчезает', () => {
  const game = flat();
  for (let y = 33; y < 40; y++) Wd.set(game.world, 23, y, B.LOG);
  for (let x = 21; x <= 25; x++) for (let y = 30; y < 33; y++) Wd.set(game.world, x, y, B.LEAVES);
  Gm.breakBlock(game, 23, 39);
  for (let y = 30; y < 40; y++) for (let x = 21; x <= 25; x++) assert.equal(Wd.get(game.world, x, y), B.AIR);
  pickupAll(game);
  assert.equal(Inv.count(game.inv, 'wood'), 10 + 7);
});

test('стены: ставятся рядом с чем-то, не поверх стены', () => {
  const game = flat();
  hold(game, 'plank_wall', 5);
  assert.equal(Gm.place(game, 23, 39, 0), true);
  assert.equal(Gm.place(game, 23, 39, 0), false);
  assert.equal(Gm.place(game, 23, 34, 0), false, 'в пустоте без опоры');
  assert.equal(Gm.place(game, 23, 38, 0), true, 'рядом со стеной');
  assert.equal(Inv.count(game.inv, 'plank_wall'), 3);
  game.inv[0] = null;
  assert.equal(Gm.place(game, 23, 37, 0), false);
});

test('закон света: враги не рождаются в освещённых клетках', () => {
  const game = flat();
  game.time = 0.75;
  Gm.relight(game);
  const b = game.player.body;
  const x = Math.floor(b.x) + 10;
  assert.equal(M.kindAt(game, x, 39) !== null, true, 'ночью на поверхности темно - можно');
  Wd.set(game.world, x, 39, B.TORCH);
  Wd.set(game.world, x + 3, 38, B.STONE);
  Gm.relight(game);
  for (let dx = -6; dx <= 6; dx++) {
    const cx = x + dx;
    if (Wd.get(game.world, cx, 39) !== B.AIR) continue;
    assert.equal(M.kindAt(game, cx, 39), null, `рядом с факелом, dx=${dx}`);
  }
  game.time = 0.2;
  Gm.relight(game);
  assert.equal(M.kindAt(game, x + 20, 39), null, 'днём на открытом месте светло');
});

test('закон света: за тысячу попыток ни один враг не родился в светлом месте', () => {
  const game = flat({ spawning: false });
  game.time = 0.75;
  for (let x = 0; x < 60; x += 7) Wd.set(game.world, x, 39, B.TORCH);
  Gm.relight(game);
  let born = 0;
  for (let i = 0; i < 1000; i++) {
    const m = M.trySpawn(game);
    if (!m) continue;
    born++;
    const [cx, cy] = M.center(m);
    const Lt = core('light');
    assert.ok(Lt.at(game.light, Math.floor(cx), Math.floor(m.y + m.h - 0.5)) < M.DARK, 'в темноте');
    game.mobs.length = 0;
    void cy;
  }
  assert.ok(born > 10, `родилось ${born}`);
});

test('враг горит в ярком свете', () => {
  const game = flat();
  game.time = 0.75;
  const b = game.player.body;
  // яма в пять клеток, на стенке ямы факелы
  const px = Math.floor(b.x) + 30;
  for (let y = 40; y < 45; y++) { Wd.set(game.world, px, y, B.AIR); Wd.setWall(game.world, px, y, W.STONE); }
  Wd.set(game.world, px, 41, B.TORCH);
  Wd.set(game.world, px, 43, B.TORCH);
  const m = M.make('drop', px + 0.05, 45 - 0.75 - 0.01);
  game.mobs.push(m);
  Gm.relight(game);
  run(game, {}, 300);
  assert.ok(!game.mobs.includes(m), 'сгорел');
  assert.equal(game.stats.kills, 1);
});

test('бой: меч бьёт врага рядом, после смерти выпадает добыча', () => {
  const game = flat();
  game.time = 0.75;
  hold(game, 'iron_sword');
  const b = game.player.body;
  const m = M.make('drop', b.x + 1.2, 39 - 0.75);
  game.mobs.push(m);
  let swings = 0;
  for (let i = 0; i < 200 && game.mobs.includes(m); i++) {
    Gm.step(game, { use: true, aimX: b.x + 3, aimY: b.y + 1 });
    if (game.player.swing > 0.24) swings++;
  }
  assert.ok(!game.mobs.includes(m));
  assert.ok(swings >= 2);
  assert.ok(game.drops.some((d) => d.id === 'goo'));
  pickupAll(game);
  assert.ok(Inv.count(game.inv, 'coin') >= 1);
  assert.ok(game.stats.coins >= 1);
});

test('боссы: колосс только ночью, сердце только в аду, второй босс не зовётся', () => {
  const game = flat();
  hold(game, 'beacon', 2);
  game.time = 0.2;
  assert.equal(Gm.use(game, {}, Gm.STEP), 'day');
  game.time = 0.75;
  game.player.cd = 0;
  assert.equal(Gm.use(game, {}, Gm.STEP), 'summoned');
  assert.equal(Inv.count(game.inv, 'beacon'), 1);
  game.player.cd = 0;
  assert.equal(Gm.use(game, {}, Gm.STEP), 'busy');
  hold(game, 'obsidian_key', 1);
  game.player.cd = 0;
  assert.equal(Gm.use(game, {}, Gm.STEP), 'not-hell');
  // колосс улетает с рассветом
  game.time = 0.1;
  Gm.step(game, {});
  assert.equal(game.mobs.length, 0);
});

test('босс побеждён - флаг и добыча; осколок жизни прибавляет здоровье до предела', () => {
  const game = flat();
  game.time = 0.75;
  const boss = M.summon(game, 'colossus');
  boss.hp = 1;
  M.hurtMob(game, boss, 5, 0);
  Gm.step(game, {});
  assert.equal(game.bosses.colossus, true);
  assert.ok(game.drops.some((d) => d.id === 'life_shard'));
  hold(game, 'life_shard', 5);
  for (let i = 0; i < 5; i++) { game.player.cd = 0; Gm.use(game, {}, Gm.STEP); }
  assert.equal(game.player.maxHp, 160);
  assert.equal(game.player.shards, 3);
  assert.equal(Inv.count(game.inv, 'life_shard'), 2);
});

test('удары колосса и снаряды ранят игрока, стена закрывает от снаряда', () => {
  const game = flat();
  const b = game.player.body;
  game.projectiles.push({ x: b.x - 3, y: b.y + 1, vx: 20, vy: 0, dmg: 10, ttl: 2, kind: 'imp' });
  run(game, {}, 30);
  assert.equal(game.player.hp, 90);
  game.player.invuln = 0;
  Wd.set(game.world, Math.floor(b.x) - 2, Math.floor(b.y + 1), B.STONE);
  game.projectiles.push({ x: b.x - 5, y: b.y + 1, vx: 20, vy: 0, dmg: 10, ttl: 2, kind: 'imp' });
  run(game, {}, 30);
  assert.equal(game.player.hp, 90);
  assert.equal(game.projectiles.length, 0);
});

test('смерть: половина монет теряется, через 3 секунды игрок у точки появления', () => {
  const game = flat();
  hold(game, 'coin', 11);
  game.player.body.x = 60;
  game.player.hp = 1;
  M.hurtPlayer(game, 50, 0);
  Gm.step(game, {});
  assert.ok(game.player.dead > 0);
  assert.equal(Inv.count(game.inv, 'coin'), 6);
  run(game, {}, 200);
  assert.equal(game.player.dead, 0);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.ok(Math.abs(game.player.body.x + 0.4 - 20.5) < 0.5);
  assert.equal(M.hurtPlayer(game, 5, 0), false, 'после возрождения неуязвим');
});

test('падение с большой высоты ранит, лава жжёт', () => {
  const game = flat();
  const b = game.player.body;
  b.y = 2;
  run(game, {}, 200);
  assert.ok(game.player.hp < 100, `здоровье ${game.player.hp}`);
  const g2 = flat();
  for (let x = 15; x < 26; x++) Wd.setLiq(g2.world, x, 39, Lq.pack(L.LAVA, 8));
  run(g2, {}, 30);
  assert.ok(g2.player.hp < 100);
});

test('зелье лечит раз в 20 секунд', () => {
  const game = flat();
  hold(game, 'potion', 3);
  game.player.hp = 30;
  assert.equal(Gm.use(game, {}, Gm.STEP), 'used');
  assert.equal(game.player.hp, 80);
  game.player.cd = 0;
  game.player.hp = 30;
  assert.equal(Gm.use(game, {}, Gm.STEP), 'wait');
  assert.equal(Inv.count(game.inv, 'potion'), 2);
});

test('жители: торговец приходит днём к костру, уходит, если костёр убрать', () => {
  const game = flat();
  hold(game, 'campfire', 1);
  assert.equal(Gm.place(game, 23, 39, 0), true);
  Gm.relight(game);
  assert.equal(Npc.check(game), null, 'без монет не приходит');
  Inv.add(game.inv, 'coin', 10);
  game.time = 0.75;
  assert.equal(Npc.check(game), null, 'ночью не приходит');
  game.time = 0.2;
  Gm.relight(game);
  const r = Npc.check(game);
  assert.equal(r.kind, 'trader');
  assert.equal(Npc.check(game), null, 'знахарке нужно 10 побед');
  game.stats.kills = 10;
  assert.equal(Npc.check(game).kind, 'healer');
  run(game, {}, 240);
  for (const res of game.residents) assert.ok(Math.abs(res.x - 23) < 9, 'живут у костра');
  Gm.breakBlock(game, 23, 39);
  Npc.check(game);
  assert.equal(game.residents.length, 0);
  assert.ok(game.events.some((e) => e.type === 'leave'));
});

test('торговля честная: монеты меняются ровно на цену, без места - сделки нет', () => {
  const game = flat();
  hold(game, 'coin', 20);
  assert.equal(Npc.buy(game, 'trader', 0), true);
  assert.equal(Inv.count(game.inv, 'coin'), 17);
  assert.equal(Inv.count(game.inv, 'torch'), 10);
  assert.equal(Npc.buy(game, 'trader', 99), false);
  assert.equal(Npc.buy(game, 'nobody', 0), false);
  Inv.add(game.inv, 'iron_ore', 3);
  const slot = game.inv.findIndex((s) => s && s.id === 'iron_ore');
  assert.equal(Npc.sell(game, slot), true);
  assert.equal(Inv.count(game.inv, 'coin'), 19);
  assert.equal(Npc.sell(game, game.inv.findIndex((s) => s && s.id === 'torch')), false, 'факелы не покупают');
  game.player.hp = 50;
  assert.equal(Npc.heal(game), true);
  assert.equal(game.player.hp, game.player.maxHp);
  assert.equal(Npc.heal(game), false, 'здоров - не лечат');
  // всё забито - купить нельзя, монеты целы
  const full = flat();
  full.inv.fill(null);
  for (let i = 0; i < full.inv.length; i++) full.inv[i] = { id: 'dirt', n: 999 };
  full.inv[0] = { id: 'coin', n: 999 };
  assert.equal(Npc.buy(full, 'trader', 0), false);
  assert.equal(Inv.count(full.inv, 'coin'), 999);
  full.inv[1] = { id: 'iron_ore', n: 2 };
  assert.equal(Npc.sell(full, 1), false, 'монетам некуда лечь');
  hold(full, 'coin', 2);
  assert.equal(Npc.buy(full, 'healer', 0), false, 'не хватает монет');
});

test('крафт через игру видит станции возле игрока', () => {
  const game = flat();
  hold(game, 'planks', 7);
  const sword = D.RECIPES.find((r) => r.out === 'wood_sword');
  assert.equal(Gm.craft(game, sword), false);
  Wd.set(game.world, 22, 39, B.WORKBENCH);
  assert.ok(Gm.stations(game).has('workbench'));
  assert.equal(Gm.craft(game, sword), true);
  assert.equal(Inv.count(game.inv, 'wood_sword'), 1);
});

test('время идёт: за сутки игры наступает следующий день и ночь', () => {
  const game = flat();
  game.time = 0;
  let nights = 0;
  let was = false;
  for (let i = 0; i < T.DAY_LEN * 60 + 10; i++) {
    Gm.step(game, {});
    const n = T.isNight(game.time);
    if (n && !was) nights++;
    was = n;
  }
  assert.equal(nights, 1);
  assert.equal(game.day, 1);
});

test('сохранение игры туда-обратно: игрок, инвентарь, костёр и жители', () => {
  const game = flat();
  hold(game, 'campfire', 1);
  Gm.place(game, 23, 39, 0);
  Inv.add(game.inv, 'coin', 15);
  game.time = 0.2;
  Gm.relight(game);
  Npc.check(game);
  game.stats.kills = 3;
  const text = Gm.toSave(game);
  const back = Gm.fromSave(text, { spawning: false });
  assert.ok(back);
  assert.deepEqual(back.campfires, [[23, 39]]);
  assert.equal(back.residents.length, 1);
  assert.equal(Inv.count(back.inv, 'coin'), 15);
  assert.equal(back.stats.kills, 3);
  assert.ok(Math.abs(back.player.body.x - game.player.body.x) < 1e-9);
  assert.equal(Gm.fromSave('мусор'), null);
});

test('сохранение настоящего мира: туда-обратно после копания', () => {
  const game = Gm.create({ seed: 77, W: 320, H: 256, spawning: false });
  run(game, {}, 30);
  hold(game, 'magmite_pick');
  const b = game.player.body;
  for (let i = 0; i < 60; i++) Gm.step(game, { use: true, aimX: b.x + 0.4, aimY: b.y + b.h + 0.5 });
  const text = Gm.toSave(game);
  const back = Gm.fromSave(text, { spawning: false });
  for (let x = 140; x < 180; x++) for (let y = 40; y < 120; y++) assert.equal(Wd.get(back.world, x, y), Wd.get(game.world, x, y));
});

test('враги живут: капля прыгает к игроку, крот идёт, тень и бес летают, сердце зовёт бесов', () => {
  const game = flat();
  game.time = 0.75;
  const b = game.player.body;
  const kinds = ['drop', 'mole', 'shade', 'imp', 'heart'];
  const mobs = kinds.map((k, i) => M.make(k, b.x + 12 + i, 30));
  game.mobs.push(...mobs);
  const d0 = mobs.map((m) => Math.abs(m.x - b.x));
  game.player.invuln = 1e9;
  let fired = 0;
  for (let i = 0; i < 600; i++) { const n = game.projectiles.length; Gm.step(game, {}); if (game.projectiles.length > n) fired++; }
  for (const [i, m] of mobs.entries()) if (m.kind !== 'heart') assert.ok(Math.abs(m.x - b.x) < d0[i], m.kind);
  assert.ok(game.mobs.filter((m) => m.kind === 'imp').length >= 2, 'бесы от сердца');
  assert.ok(fired >= 3, `выстрелов беса и сердца: ${fired}`);
  const c = M.summon(flat(), 'colossus');
  assert.equal(c.kind, 'colossus');
});

test('враг далеко пропадает; капля выбивается ударом', () => {
  const game = flat();
  game.time = 0.75;
  const m = M.make('drop', 5, 38);
  game.mobs.push(m);
  game.player.body.x = 95;
  m.x = -200;
  Gm.step(game, {});
  assert.equal(game.mobs.length, 0);
  const k = M.make('mole', 10, 10);
  assert.equal(M.hurtMob(game, k, 5, 0), true);
  k.hp = 0;
  assert.equal(M.hurtMob(game, k, 5, 0), false);
});

test('колосс во второй фазе быстрее и злее', () => {
  const game = flat();
  game.time = 0.75;
  game.player.invuln = 1e9;
  const shots = (hp) => {
    const g = flat();
    g.time = 0.75;
    g.player.invuln = 1e9;
    const c = M.summon(g, 'colossus');
    c.hp = hp;
    let n = 0;
    let fastest = 0;
    for (let i = 0; i < 600; i++) {
      const before = g.projectiles.length;
      Gm.step(g, {});
      if (g.projectiles.length > before) n++;
      fastest = Math.max(fastest, Math.hypot(c.vx, c.vy));
    }
    return { n, fastest, phase: c.phase };
  };
  const calm = shots(700);
  const angry = shots(100);
  assert.equal(calm.phase, 1);
  assert.equal(angry.phase, 2);
  assert.ok(angry.n > calm.n, `залпов: ${calm.n} -> ${angry.n}`);
  assert.ok(angry.fastest > calm.fastest, `скорость: ${calm.fastest.toFixed(1)} -> ${angry.fastest.toFixed(1)}`);
});

test('факел в руке светит вокруг игрока, меч - нет', () => {
  const game = flat();
  game.time = 0.75;
  const Lt = core('light');
  hold(game, 'iron_sword');
  Gm.relight(game);
  const [cx, cy] = Gm.center(game.player.body);
  const dim = Lt.at(game.light, Math.floor(cx), Math.floor(cy));
  hold(game, 'torch', 5);
  Gm.relight(game);
  assert.ok(Lt.at(game.light, Math.floor(cx), Math.floor(cy - 0.3)) >= 11);
  assert.ok(dim < 5);
});

test('сквозной: магмитовой киркой можно прокопаться от поверхности до подземного ада', () => {
  const game = Gm.create({ seed: 4242, W: 320, H: 384, spawning: false });
  game.inv.fill(null);
  Inv.add(game.inv, 'magmite_pick', 1);
  game.player.slot = 0;
  game.player.invuln = 1e9;
  const b = game.player.body;
  const hell = game.world.dims.hellTop;
  let t = 0;
  for (; t < 60 * 240 && b.y < hell; t++) {
    const cx = b.x + b.w / 2;
    // копать под ногами, а если упёрлись сбоку - перед собой
    Gm.step(game, { use: true, aimX: cx, aimY: b.y + b.h + 0.5, jump: false });
    game.player.hp = game.player.maxHp;
  }
  assert.ok(b.y >= hell, `глубина ${b.y.toFixed(1)} из ${hell} за ${t} шагов`);
});

// ---------- находки независимого обзора: сначала закон ----------

test('закон торговли: купить, переработать и продать не даёт прибыли', () => {
  const unit = {};
  for (const offers of Object.values(Npc.SHOP)) for (const o of offers) unit[o.id] = Math.min(unit[o.id] || Infinity, o.price / o.n);
  for (const [id, price] of Object.entries(Npc.SELL)) if (unit[id] !== undefined) assert.ok(price <= unit[id], `${id}: купить ${unit[id]}, продать ${price}`);
  for (const r of D.RECIPES) {
    if (!Npc.SELL[r.out] || !r.ins.every(([id]) => unit[id] !== undefined)) continue;
    const cost = r.ins.reduce((s, [id, n]) => s + unit[id] * n, 0);
    assert.ok(Npc.SELL[r.out] * r.n <= cost, `${r.out}: сырьё ${cost}, продажа ${Npc.SELL[r.out] * r.n}`);
  }
});

test('мёртвый игрок не пользуется предметами', () => {
  const game = flat();
  hold(game, 'dirt', 10);
  game.player.hp = 0;
  Gm.step(game, {});
  assert.ok(game.player.dead > 0);
  game.player.cd = 0;
  assert.equal(Gm.use(game, { aimX: 23.5, aimY: 39.5 }, Gm.STEP), null);
  assert.equal(Inv.count(game.inv, 'dirt'), 10);
});

test('сохранение во время смерти: после загрузки игрок жив и у точки появления', () => {
  const game = flat();
  game.player.body.x = 60;
  game.player.hp = 0;
  Gm.step(game, {});
  const back = Gm.fromSave(Gm.toSave(game), { spawning: false });
  assert.equal(back.player.hp, back.player.maxHp);
  assert.ok(Math.abs(back.player.body.x + back.player.body.w / 2 - back.player.spawn.x) < 1, `x ${back.player.body.x}`);
});

test('предметы на земле переживают сохранение', () => {
  const game = flat();
  Gm.dropItem(game, 'life_shard', 1, 70.5, 38.5);
  Gm.dropItem(game, 'stone', 7, 80.5, 38.5);
  const back = Gm.fromSave(Gm.toSave(game), { spawning: false });
  assert.deepEqual(back.drops.map((d) => [d.id, d.n]).sort(), [['life_shard', 1], ['stone', 7]]);
  assert.ok(Math.abs(back.drops.find((d) => d.id === 'stone').x - game.drops.find((d) => d.id === 'stone').x) < 1e-9);
});

test('враг не рождается за краем карты света: там свет неизвестен', () => {
  const world = flatWorld(200, 64, 40);
  world.dims = Object.assign({}, world.dims, { spawnX: 20, hellTop: 60 });
  const game = Gm.create({ world, spawning: false });
  game.time = 0.75;
  Gm.relight(game);
  const m = game.light;
  const x = m.x0 + m.w + 3;
  assert.equal(Wd.get(game.world, x, 39), B.AIR);
  assert.equal(M.kindAt(game, x, 39), null, 'ночью, но за картой света');
  assert.notEqual(M.kindAt(game, m.x0 + m.w - 3, 39), null, 'внутри карты ночью можно');
});

test('житель неизвестного вида из сохранения не появляется', () => {
  const game = flat();
  hold(game, 'campfire', 1);
  Gm.place(game, 23, 39, 0);
  const o = JSON.parse(Gm.toSave(game));
  o.residents = [{ kind: 'ghost', home: [23, 39] }, { kind: 'trader', home: [23, 39] }];
  const back = Gm.fromSave(JSON.stringify(o), { spawning: false });
  assert.deepEqual(back.residents.map((r) => r.kind), ['trader']);
});

test('тень летает сквозь блоки: её не выталкивает из земли', () => {
  const game = flat();
  game.time = 0.75;
  game.player.invuln = 1e9;
  const m = M.make('shade', 30, 41);
  game.mobs.push(m);
  let pushed = 0;
  for (let i = 0; i < 30; i++) {
    const [x0, y0] = [m.x, m.y];
    Gm.step(game, {});
    if (Math.hypot(m.x - x0, m.y - y0) > 0.5) pushed++;
  }
  assert.equal(pushed, 0);
});

test('кирка у края мира: за краем копать нечего, игра не падает', () => {
  const game = flat();
  game.player.body.x = 0.6;
  hold(game, 'stone_pick');
  assert.equal(Gm.mine(game, -1, 39, D.ITEMS.stone_pick, 1), 'outside');
  Gm.step(game, { use: true, aimX: -0.5, aimY: 39.5 });
});

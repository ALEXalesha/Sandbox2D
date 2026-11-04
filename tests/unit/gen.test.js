// Законы генерации и чанков: мир по зерну детерминирован, чанк не зависит от порядка,
// границы чанков не видны.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core } = require('./helpers');
const N = core('noise');
const G = core('gen');
const Wd = core('world');
const D = core('data');
const { B } = D;

test('шум: одни и те же входы - одно и то же число, в [0, 1)', () => {
  for (let i = 0; i < 200; i++) {
    const x = i * 7.3 - 400;
    const y = i * 3.1;
    assert.equal(N.value2(5, x, y), N.value2(5, x, y));
    const v = N.fbm2(5, x, y, 3, 20);
    assert.ok(v >= 0 && v < 1, `fbm2 ${v}`);
    const u = N.fbm1(9, x, 4, 50);
    assert.ok(u >= 0 && u < 1, `fbm1 ${u}`);
  }
  assert.notEqual(N.hash(1, 2, 3), N.hash(2, 2, 3));
});

test('зерно из строки: число как есть, текст - хеш, пусто - 0-хеш', () => {
  assert.equal(N.seedFrom('12345'), 12345);
  assert.equal(N.seedFrom(' -7 '), -7);
  assert.equal(N.seedFrom('лес'), N.seedFrom('лес'));
  assert.notEqual(N.seedFrom('лес'), N.seedFrom('лис'));
  assert.equal(N.seedFrom(null), N.seedFrom(''));
});

test('генератор событий: повторяется по состоянию', () => {
  const a = N.rng(42);
  const b = N.rng(42);
  for (let i = 0; i < 50; i++) assert.equal(a(), b());
  assert.equal(typeof a.state(), 'number');
});

test('генерация детерминирована: два мира с одним зерном совпадают клетка в клетку', () => {
  const a = Wd.create(777, 320, 256);
  const b = Wd.create(777, 320, 256);
  for (let cy = 0; cy < a.chh; cy++) {
    for (let cx = 0; cx < a.cw; cx++) {
      const ca = Wd.chunk(a, cx, cy);
      const cb = Wd.chunk(b, cx, cy);
      assert.deepEqual(ca.fg, cb.fg);
      assert.deepEqual(ca.wall, cb.wall);
      assert.deepEqual(ca.liq, cb.liq);
    }
  }
  const c = Wd.create(778, 320, 256);
  let diff = 0;
  for (let x = 0; x < 320; x++) for (let y = 0; y < 256; y++) if (Wd.get(a, x, y) !== Wd.get(c, x, y)) diff++;
  assert.ok(diff > 1000, 'другое зерно - другой мир');
});

test('чанк не зависит от порядка генерации соседей', () => {
  const a = Wd.create(31337, 256, 192);
  const b = Wd.create(31337, 256, 192);
  for (let cx = 0; cx < a.cw; cx++) for (let cy = 0; cy < a.chh; cy++) Wd.chunk(a, cx, cy);
  for (let cx = b.cw - 1; cx >= 0; cx--) for (let cy = b.chh - 1; cy >= 0; cy--) Wd.chunk(b, cx, cy);
  for (let x = 0; x < 256; x++) for (let y = 0; y < 192; y++) {
    assert.equal(Wd.get(a, x, y), Wd.get(b, x, y));
    assert.equal(Wd.getWall(a, x, y), Wd.getWall(b, x, y));
  }
});

test('чанки на границах совпадают: клетка чанка равна клетке генератора, рельеф непрерывен', () => {
  const seed = 2024;
  const d = G.dims(640, 256);
  const world = Wd.create(seed, 640, 256);
  for (let cx = 1; cx < world.cw; cx++) {
    const x = cx * 32;
    for (const xx of [x - 1, x]) {
      const col = G.column(seed, xx, d);
      const plants = [];
      for (let i = xx - 3; i <= xx + 3; i++) plants.push(G.plantAt(seed, i, d));
      for (let y = 0; y < 256; y++) {
        const c = G.cell(seed, xx, y, col, plants, d);
        assert.equal(Wd.get(world, xx, y), c[0], `x=${xx} y=${y}`);
        assert.equal(Wd.getLiq(world, xx, y), c[2]);
      }
    }
    // скачок высоты через границу не больше, чем бывает внутри чанков
    const jump = Math.abs(G.surfaceAt(seed, x, d) - G.surfaceAt(seed, x - 1, d));
    assert.ok(jump <= 6, `скачок ${jump} на x=${x}`);
  }
  let inner = 0;
  for (let x = 1; x < 640; x++) inner = Math.max(inner, Math.abs(G.surfaceAt(seed, x, d) - G.surfaceAt(seed, x - 1, d)));
  assert.ok(inner <= 6, `внутри ${inner}`);
});

test('мир: края и низ из коренной породы, над поверхностью нет стен, у спавна лес', () => {
  const world = Wd.create(99, 640, 256);
  for (let y = 0; y < 256; y++) {
    assert.equal(Wd.get(world, 0, y), B.BEDROCK);
    assert.equal(Wd.get(world, 639, y), B.BEDROCK);
  }
  for (let x = 0; x < 640; x++) assert.equal(Wd.get(world, x, 255), B.BEDROCK);
  const d = world.dims;
  for (let x = 1; x < 639; x++) {
    const s = G.surfaceAt(99, x, d);
    for (let y = 0; y < s; y++) assert.equal(Wd.getWall(world, x, y), 0);
  }
  assert.equal(G.biomeAt(99, d.spawnX, d), 'forest');
  assert.equal(Wd.get(world, -5, 10), Wd.OUT);
  assert.equal(Wd.get(world, 10, -5), B.AIR);
  assert.equal(Wd.getWall(world, -5, 10), 0);
  assert.equal(Wd.set(world, -1, 0, B.DIRT), false);
});

test('по глубине: медь выше железа, кристаллы глубоко, магмит только в аду', () => {
  const world = Wd.create(5, 800, 576);
  const first = {};
  const last = {};
  for (let x = 1; x < 799; x += 1) {
    for (let y = 0; y < 576; y++) {
      const b = Wd.get(world, x, y);
      if (first[b] === undefined || y < first[b]) first[b] = y;
      if (last[b] === undefined || y > last[b]) last[b] = y;
    }
  }
  for (const b of [B.COPPER, B.IRON, B.CRYSTAL, B.MAGMITE, B.ASH, B.LOG, B.LEAVES, B.GRASS, B.SAND, B.SNOW]) assert.ok(first[b] !== undefined, `нет блока ${b}`);
  assert.ok(first[B.COPPER] < first[B.IRON]);
  assert.ok(first[B.CRYSTAL] >= 576 * 0.55);
  assert.ok(first[B.MAGMITE] >= world.dims.hellTop);
  // в мире есть и вода, и лава
  let water = 0;
  let lava = 0;
  for (const c of world.chunks.values()) for (const v of c.liq) { if (v >> 4 === 1) water++; else if (v >> 4 === 2) lava++; }
  assert.ok(water > 50 && lava > 50, `вода ${water}, лава ${lava}`);
});

test('биомы: в большом мире есть все три, деревья растут на траве', () => {
  const d = G.dims(1600, 576);
  const seen = new Set();
  for (let x = 0; x < 1600; x += 4) seen.add(G.biomeAt(3, x, d));
  assert.deepEqual([...seen].sort(), ['desert', 'forest', 'snow']);
  let trees = 0;
  for (let x = 0; x < 1600; x++) {
    const p = G.plantAt(3, x, d);
    if (!p) continue;
    trees++;
    assert.ok(p.height >= 2);
    assert.ok(p.base === G.surfaceAt(3, x, d));
  }
  assert.ok(trees > 40);
  assert.equal(G.plantAt(3, 1, d), null);
});

test('спавн на поверхности: над ногами воздух, под ногами земля', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    const world = Wd.create(seed, 640, 256);
    const s = G.spawnPoint(seed, world.dims);
    const x = Math.floor(s.x);
    assert.ok(Wd.solidAt(world, x, s.y));
    assert.ok(!Wd.solidAt(world, x, s.y - 1));
    assert.ok(!Wd.solidAt(world, x, s.y - 2));
  }
});

test('мир: изменения помечают чанк и версию, небо пересчитывается', () => {
  const world = Wd.create(8, 128, 128);
  const x = 64;
  const top = Wd.skyY(world, x);
  const v = world.version;
  assert.equal(Wd.set(world, x, top - 3, B.STONE), true);
  assert.equal(Wd.set(world, x, top - 3, B.STONE), false);
  assert.ok(world.version > v);
  assert.equal(Wd.skyY(world, x), top - 3);
  assert.equal(Wd.dirtyChunks(world).length, 1);
  assert.deepEqual(Wd.changes(world), [Wd.key(x >> 5, (top - 3) >> 5)]);
  assert.deepEqual(Wd.changes(world), []);
  assert.equal(Wd.skyY(world, -1), 0);
  assert.equal(Wd.groundY(world, x), top - 3);
  assert.equal(Wd.liqType(0x28), 2);
  assert.equal(Wd.liqAmount(0x28), 8);
});

test('справочник: у каждого рецепта известные предметы, у блоков с выпадением есть предмет', () => {
  for (const r of D.RECIPES) {
    assert.ok(D.ITEMS[r.out], r.out);
    for (const [id, n] of r.ins) { assert.ok(D.ITEMS[id], id); assert.ok(n > 0); }
    assert.ok(r.station === null || ['workbench', 'furnace', 'anvil'].includes(r.station));
  }
  for (const b of D.BLOCKS) if (b.drop) assert.ok(D.ITEMS[b.drop], b.key);
  assert.equal(D.blockOfItem('stone'), B.STONE);
  assert.equal(D.blockOfItem('iron_pick'), -1);
  assert.equal(D.blockOfItem('nothing'), -1);
});

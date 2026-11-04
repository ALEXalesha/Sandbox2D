// Законы жидкостей: объём не появляется из ничего; меняется только по двум правилам -
// испарение воды в аду и обсидиан при встрече воды и лавы.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core, flatWorld } = require('./helpers');
const Lq = core('liquid');
const Wd = core('world');
const N = core('noise');
const { B, L } = core('data');

function box(world, x0, y0, w, h) {
  for (let x = x0; x < x0 + w; x++) { Wd.set(world, x, y0 + h - 1, B.STONE); }
  for (let y = y0; y < y0 + h; y++) { Wd.set(world, x0, y, B.STONE); Wd.set(world, x0 + w - 1, y, B.STONE); }
}

function run(world, r, ticks, stats) {
  for (let t = 0; t < ticks; t++) Lq.step(world, r.x0, r.y0, r.w, r.h, t, stats);
}

test('вода падает и растекается по дну, объём тот же', () => {
  const world = flatWorld(64, 64);
  box(world, 10, 10, 20, 20);
  for (let y = 11; y < 15; y++) Wd.setLiq(world, 20, y, Lq.pack(L.WATER, 8));
  const r = { x0: 0, y0: 0, w: 64, h: 64 };
  const before = Lq.total(world, 0, 0, 64, 64);
  const st = Lq.emptyStats();
  run(world, r, 200, st);
  const after = Lq.total(world, 0, 0, 64, 64);
  assert.equal(after.water, before.water);
  assert.equal(st.evaporated.water + st.consumed.water, 0);
  // всё на дне: в ряду над дном вода, выше пусто
  let bottom = 0;
  for (let x = 11; x < 29; x++) bottom += Wd.getLiq(world, x, 28) & 15;
  assert.equal(bottom, 32);
  assert.equal(Wd.getLiq(world, 20, 11), 0);
  assert.ok(st.moved > 0);
});

test('закон объёма: случайные миры, вода и лава, объём меняется только по правилам', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = N.rng(seed);
    const world = flatWorld(64, 96);
    world.dims = Object.assign({}, world.dims, { hellTop: 80 });
    for (let i = 0; i < 400; i++) {
      const x = 1 + Math.floor(r() * 62);
      const y = 1 + Math.floor(r() * 94);
      const k = r();
      if (k < 0.35) Wd.set(world, x, y, B.STONE);
      else if (k < 0.75) { if (Wd.get(world, x, y) === B.AIR) Wd.setLiq(world, x, y, Lq.pack(L.WATER, 1 + Math.floor(r() * 8))); }
      else if (Wd.get(world, x, y) === B.AIR) Wd.setLiq(world, x, y, Lq.pack(L.LAVA, 1 + Math.floor(r() * 8)));
    }
    const area = { x0: 0, y0: 0, w: 64, h: 96 };
    const before = Lq.total(world, 0, 0, 64, 96);
    const st = Lq.emptyStats();
    run(world, area, 150, st);
    const after = Lq.total(world, 0, 0, 64, 96);
    assert.equal(before.water - after.water, st.evaporated.water + st.consumed.water, `вода, зерно ${seed}`);
    assert.equal(before.lava - after.lava, st.evaporated.lava + st.consumed.lava, `лава, зерно ${seed}`);
    for (let x = 0; x < 64; x++) for (let y = 0; y < 96; y++) {
      const v = Wd.getLiq(world, x, y);
      assert.ok((v & 15) <= 8, 'не больше полной клетки');
      if (v) assert.ok((v & 15) > 0 && (v >> 4 === 1 || v >> 4 === 2));
    }
  }
});

test('вода и лава при встрече дают обсидиан', () => {
  const world = flatWorld(32, 32, 20);
  Wd.setLiq(world, 10, 19, Lq.pack(L.LAVA, 8));
  Wd.setLiq(world, 11, 19, Lq.pack(L.WATER, 5));
  const st = Lq.emptyStats();
  Lq.step(world, 0, 0, 32, 32, 0, st);
  assert.equal(Wd.get(world, 10, 19), B.OBSIDIAN);
  assert.equal(st.consumed.lava, 8);
  assert.equal(st.consumed.water, 5);
  assert.deepEqual(st.obsidian, [[10, 19]]);
  assert.equal(Wd.getLiq(world, 11, 19), 0);
});

test('вода в аду испаряется; за краем области жидкость не утекает', () => {
  const world = flatWorld(32, 64, 60);
  world.dims = Object.assign({}, world.dims, { hellTop: 50 });
  Wd.setLiq(world, 5, 55, Lq.pack(L.WATER, 6));
  Wd.setLiq(world, 5, 55 - 20, Lq.pack(L.WATER, 3));
  const st = Lq.emptyStats();
  Lq.step(world, 0, 0, 32, 64, 0, st);
  assert.equal(st.evaporated.water, 6);
  // область без нижней половины: вода не уходит за край
  const t0 = Lq.total(world, 0, 0, 32, 40).water;
  for (let t = 0; t < 60; t++) Lq.step(world, 0, 0, 32, 40, t);
  assert.equal(Lq.total(world, 0, 0, 32, 40).water, t0);
});

test('лава течёт медленнее воды, налить можно только в воздух', () => {
  const world = flatWorld(32, 32, 30);
  Wd.setLiq(world, 5, 10, Lq.pack(L.LAVA, 8));
  Lq.step(world, 0, 0, 32, 32, 1);
  assert.equal(Wd.getLiq(world, 5, 10), Lq.pack(L.LAVA, 8), 'лава ждёт свой такт');
  Lq.step(world, 0, 0, 32, 32, 3);
  assert.equal(Wd.getLiq(world, 5, 10), 0);
  assert.equal(Lq.pour(world, 5, 31, L.WATER, 8), 0, 'в камень нельзя');
  assert.equal(Lq.pour(world, 7, 5, L.WATER, 5), 5);
  assert.equal(Lq.pour(world, 7, 5, L.WATER, 5), 3);
  assert.equal(Lq.pour(world, 7, 5, L.LAVA, 1), 0, 'в воду лаву не налить');
  assert.equal(Lq.pack(L.WATER, 0), 0);
});

test('жидкость под поставленным блоком ждёт и не теряется', () => {
  const world = flatWorld(16, 16, 12);
  Wd.setLiq(world, 4, 11, Lq.pack(L.WATER, 4));
  Wd.set(world, 4, 11, B.PLANKS);
  const before = Lq.total(world, 0, 0, 16, 16).water;
  for (let t = 0; t < 10; t++) Lq.step(world, 0, 0, 16, 16, t);
  assert.equal(Lq.total(world, 0, 0, 16, 16).water, before);
});

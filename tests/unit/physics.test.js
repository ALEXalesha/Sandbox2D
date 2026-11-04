// Законы физики: тело не застревает в блоках при любых нажатиях, стоит на земле,
// поднимается на ступень в одну клетку, а не на две.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core, flatWorld } = require('./helpers');
const P = core('physics');
const Wd = core('world');
const N = core('noise');
const Lq = core('liquid');
const { B, L } = core('data');
const DT = 1 / 60;

test('тело падает на землю и стоит на ней', () => {
  const world = flatWorld(64, 64, 40);
  const b = P.body(10, 20, 0.8, 1.8);
  let landed = 0;
  for (let i = 0; i < 120; i++) landed = Math.max(landed, P.step(world, b, {}, DT));
  assert.ok(b.onGround);
  assert.ok(Math.abs(b.y + b.h - 40) < 0.01, `низ ${b.y + b.h}`);
  assert.ok(!P.overlaps(world, b));
  assert.ok(landed > 15, `высота падения ${landed}`);
});

test('прыжок поднимает примерно на 3.5 клетки', () => {
  const world = flatWorld(64, 64, 40);
  const b = P.body(10, 38.2 - 0.01, 0.8, 1.8);
  P.step(world, b, {}, DT);
  const y0 = b.y;
  let top = y0;
  P.step(world, b, { jump: true }, DT);
  for (let i = 0; i < 90; i++) { P.step(world, b, {}, DT); top = Math.min(top, b.y); }
  const h = y0 - top;
  assert.ok(h > 3.2 && h < 4.2, `высота прыжка ${h}`);
});

test('ступень в одну клетку проходится сама, в две - нет', () => {
  const world = flatWorld(64, 64, 40);
  Wd.set(world, 15, 39, B.STONE);
  for (let y = 37; y < 40; y++) Wd.set(world, 25, y, B.STONE);
  const b = P.body(10, 38, 0.8, 1.8);
  for (let i = 0; i < 300; i++) P.step(world, b, { right: true }, DT);
  assert.ok(b.x > 15, 'перешёл ступень');
  assert.ok(b.x < 25, 'стена в три клетки не пройдена');
  assert.ok(!P.overlaps(world, b));
  for (let i = 0; i < 300; i++) P.step(world, b, { left: true }, DT);
  assert.ok(b.x < 15);
});

test('закон: при любых нажатиях тело не застревает в блоках', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const r = N.rng(seed);
    const world = flatWorld(48, 48, 44);
    for (let i = 0; i < 260; i++) Wd.set(world, 1 + Math.floor(r() * 46), 1 + Math.floor(r() * 43), B.STONE);
    for (let i = 0; i < 40; i++) {
      const x = 1 + Math.floor(r() * 46);
      const y = 1 + Math.floor(r() * 43);
      if (!Wd.solidAt(world, x, y)) Wd.setLiq(world, x, y, Lq.pack(r() < 0.8 ? L.WATER : L.LAVA, 8));
    }
    const b = P.body(24, 2, 0.8, 1.8);
    P.unstick(world, b);
    let input = {};
    for (let t = 0; t < 1200; t++) {
      if (t % 12 === 0) input = { left: r() < 0.4, right: r() < 0.4, jump: r() < 0.3 };
      P.step(world, b, input, DT * (0.5 + r()));
      assert.ok(!P.overlaps(world, b), `зерно ${seed}, шаг ${t}: (${b.x.toFixed(3)}, ${b.y.toFixed(3)})`);
    }
  }
});

test('блок появился внутри тела - тело выталкивается наверх', () => {
  const world = flatWorld(32, 32, 20);
  const b = P.body(5.1, 18.19, 0.8, 1.8);
  P.step(world, b, {}, DT);
  Wd.set(world, 5, 19, B.OBSIDIAN);
  assert.ok(P.overlaps(world, b));
  assert.equal(P.unstick(world, b), true);
  assert.ok(!P.overlaps(world, b));
  assert.ok(b.y + b.h <= 19 + 1e-3);
  assert.equal(P.unstick(world, b), false, 'свободному телу толкаться некуда');
});

test('в воде медленнее и можно всплыть; замурованное тело не двигается в стены', () => {
  const world = flatWorld(32, 40, 36);
  for (let x = 1; x < 31; x++) for (let y = 20; y < 36; y++) Wd.setLiq(world, x, y, Lq.pack(L.WATER, 8));
  const b = P.body(10, 30, 0.8, 1.8);
  for (let i = 0; i < 30; i++) P.step(world, b, {}, DT);
  assert.equal(b.inLiquid, L.WATER);
  const y1 = b.y;
  for (let i = 0; i < 60; i++) P.step(world, b, { jump: true }, DT);
  assert.ok(b.y < y1 - 2, 'всплывает');
  // со всех сторон камень, внутри ровно тело
  const tight = flatWorld(16, 16);
  for (let x = 3; x <= 5; x++) for (let y = 2; y <= 6; y++) if (x !== 4 || y < 3 || y > 4) Wd.set(tight, x, y, B.STONE);
  const t = P.body(4.1, 3.1, 0.8, 1.8);
  for (let i = 0; i < 60; i++) P.step(tight, t, { left: i < 30, right: i >= 30, jump: true }, DT);
  assert.ok(!P.overlaps(tight, t));
});

test('мир без опоры: край мира - твёрдый', () => {
  const world = flatWorld(16, 16);
  const b = P.body(0.5, 3, 0.8, 1.8);
  P.unstick(world, b);
  for (let i = 0; i < 60; i++) P.step(world, b, { left: true }, DT);
  assert.ok(b.x >= -1e-3 && b.x < 0.01, `x ${b.x}`);
});

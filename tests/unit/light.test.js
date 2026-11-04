// Законы света: 0..15, не дальше радиуса источника, небо зависит от дня, стена закрывает небо.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core, flatWorld } = require('./helpers');
const Lt = core('light');
const Wd = core('world');
const Lq = core('liquid');
const { B, W, L } = core('data');

// подземелье: всё закрыто стенами, неба нет
function dark(w, h) {
  const world = flatWorld(w, h);
  for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) Wd.setWall(world, x, y, W.STONE);
  return world;
}

test('факел в темноте: свет в пределах 0..15 и не дальше 14 клеток по сумме шагов', () => {
  const world = dark(96, 96);
  Wd.set(world, 48, 48, B.TORCH);
  const map = Lt.compute(world, 16, 16, 64, 64, 1);
  let lit = 0;
  for (let y = 16; y < 80; y++) {
    for (let x = 16; x < 80; x++) {
      const v = Lt.at(map, x, y);
      assert.ok(v >= 0 && v <= Lt.MAX);
      const dist = Math.abs(x - 48) + Math.abs(y - 48);
      assert.ok(v <= Math.max(0, 14 - dist), `(${x},${y}) = ${v} на расстоянии ${dist}`);
      if (v > 0) lit++;
    }
  }
  assert.equal(Lt.at(map, 48, 48), 14);
  assert.equal(Lt.at(map, 48 + 13, 48), 1);
  assert.ok(lit > 300);
});

test('источник за краем области светит внутрь, но не дальше своего радиуса', () => {
  const world = dark(96, 96);
  Wd.set(world, 10, 40, B.CAMPFIRE);
  const map = Lt.compute(world, 20, 20, 40, 40, 1);
  assert.equal(Lt.at(map, 20, 40), 5);
  assert.equal(Lt.at(map, 30, 40), 0);
  assert.equal(Lt.at(map, 0, 0), 0, 'вне карты - темно');
  assert.equal(Lt.at(null, 1, 1), 0);
});

test('камень гасит сильнее воздуха, вода - чуть сильнее', () => {
  const world = dark(64, 64);
  Wd.set(world, 32, 32, B.TORCH);
  for (let x = 33; x < 40; x++) Wd.set(world, x, 32, B.STONE);
  for (let y = 33; y < 40; y++) Wd.setLiq(world, 32, y, Lq.pack(L.WATER, 8));
  const map = Lt.compute(world, 0, 0, 64, 64, 1);
  assert.ok(Lt.at(map, 32, 26) > Lt.at(map, 32, 38), 'вниз через воду темнее, чем вверх по воздуху');
  assert.equal(Lt.at(map, 33, 32), 11);
});

test('небо: днём светло на поверхности, ночью темнее, под стеной неба нет', () => {
  const world = flatWorld(64, 64, 40);
  const day = Lt.compute(world, 0, 0, 64, 64, 1);
  const night = Lt.compute(world, 0, 0, 64, 64, 0.2);
  assert.equal(Lt.at(day, 20, 30), 15);
  assert.equal(Lt.at(night, 20, 30), 3);
  assert.equal(Lt.at(day, 20, 50), 0, 'глубоко под землёй неба нет');
  for (let y = 0; y < 30; y++) Wd.setWall(world, 30, y, W.PLANK);
  const roofed = Lt.compute(world, 0, 0, 64, 64, 1);
  assert.equal(Lt.at(roofed, 30, 10), 14, 'стена закрывает небо, свет приходит сбоку');
  const neg = Lt.compute(world, 0, 0, 8, 8, -3);
  assert.equal(Lt.at(neg, 3, 3), 0, 'яркость дня ограничена снизу');
});

test('лава светится, кристалл тоже', () => {
  const world = dark(48, 48);
  Wd.setLiq(world, 10, 10, Lq.pack(L.LAVA, 8));
  Wd.set(world, 30, 30, B.CRYSTAL);
  const map = Lt.compute(world, 0, 0, 48, 48, 0);
  assert.equal(Lt.at(map, 10, 10), Lt.LAVA_LIGHT);
  assert.equal(Lt.at(map, 30, 30), 9);
});

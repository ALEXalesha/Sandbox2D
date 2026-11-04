// Законы суток: день светлый, ночь тёмная, переходы плавные, часы с 6:00.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core } = require('./helpers');
const T = core('time');

test('яркость: день 1, ночь 0.15, между ними без скачков', () => {
  assert.equal(T.daylight(0.2), 1);
  assert.equal(T.daylight(0.75), T.NIGHT_LIGHT);
  assert.equal(T.daylight(-0.25), T.NIGHT_LIGHT, 'отрицательное время по кругу');
  let prev = T.daylight(0);
  for (let i = 1; i <= 1000; i++) {
    const v = T.daylight(i / 1000);
    assert.ok(Math.abs(v - prev) < 0.02, `скачок на ${i / 1000}`);
    assert.ok(v >= T.NIGHT_LIGHT && v <= 1);
    prev = v;
  }
  assert.equal(T.isNight(0.7), true);
  assert.equal(T.isNight(0.3), false);
});

test('время идёт по кругу и считает дни', () => {
  assert.deepEqual(T.advance(0.5, T.DAY_LEN / 4), { t: 0.75, days: 0 });
  const r = T.advance(0.9, T.DAY_LEN * 0.2);
  assert.ok(Math.abs(r.t - 0.1) < 1e-9);
  assert.equal(r.days, 1);
});

test('часы: рассвет в 6:00, закат в 18:00, полночь', () => {
  assert.deepEqual(T.clock(0), { h: 6, m: 0 });
  assert.deepEqual(T.clock(0.5), { h: 18, m: 0 });
  assert.deepEqual(T.clock(0.75), { h: 0, m: 0 });
  assert.deepEqual(T.clock(1.25), { h: 12, m: 0 });
});

test('цвет неба: днём голубой, ночью тёмный, переходы без скачков', () => {
  assert.deepEqual(T.sky(0.2), [126, 200, 255]);
  assert.deepEqual(T.sky(0.8), [11, 16, 48]);
  let prev = T.sky(0);
  for (let i = 1; i <= 2000; i++) {
    const c = T.sky(i / 2000);
    for (let k = 0; k < 3; k++) assert.ok(Math.abs(c[k] - prev[k]) <= 12, `скачок цвета на ${i / 2000}`);
    prev = c;
  }
  assert.deepEqual(T.sky(-0.8), T.sky(0.2));
});

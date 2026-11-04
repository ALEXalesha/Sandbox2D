// Шум и случайность по зерну: одни и те же (зерно, x, y) всегда дают одно и то же число.
// Работает и в браузере (SB.Noise), и в node (require) - законы проверяют тот же код.
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SB = root.SB || {}).Noise = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function hash(seed, x, y) {
    let h = (seed | 0) ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }

  function rand(seed, x, y) {
    return hash(seed, x, y) / 4294967296;
  }

  const smooth = (f) => f * f * (3 - 2 * f);

  function value1(seed, x) {
    const xi = Math.floor(x);
    const f = smooth(x - xi);
    const a = rand(seed, xi, 0x51ed);
    const b = rand(seed, xi + 1, 0x51ed);
    return a + (b - a) * f;
  }

  function value2(seed, x, y) {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const fx = smooth(x - xi);
    const fy = smooth(y - yi);
    const a = rand(seed, xi, yi);
    const b = rand(seed, xi + 1, yi);
    const c = rand(seed, xi, yi + 1);
    const d = rand(seed, xi + 1, yi + 1);
    const top = a + (b - a) * fx;
    const bottom = c + (d - c) * fx;
    return top + (bottom - top) * fy;
  }

  // сумма октав, результат в [0, 1)
  function fbm1(seed, x, octaves, scale) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let freq = 1 / scale;
    for (let i = 0; i < octaves; i++) {
      sum += value1(seed + i * 1013, x * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  function fbm2(seed, x, y, octaves, scale) {
    let sum = 0;
    let amp = 1;
    let norm = 0;
    let freq = 1 / scale;
    for (let i = 0; i < octaves; i++) {
      sum += value2(seed + i * 7919, x * freq, y * freq) * amp;
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  }

  // зерно из строки: число как есть, иначе FNV-1a
  function seedFrom(text) {
    const s = String(text == null ? '' : text).trim();
    if (/^-?\d{1,9}$/.test(s)) return parseInt(s, 10) | 0;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h | 0;
  }

  // генератор для игровых событий (враги, выпадение), состояние - одно число
  function rng(state) {
    let s = state >>> 0;
    const next = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    next.state = () => s;
    return next;
  }

  return { hash, rand, value1, value2, fbm1, fbm2, seedFrom, rng };
});

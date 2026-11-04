// Освещение по клеткам, 0..15. Два прохода заливкой: свет неба (сверху до первой
// непрозрачной клетки или стены, потом растекается) и свет блоков (факел, костёр, лава,
// кристаллы). Итог - больший из двух, небо умножено на яркость дня.
//
// Шаг в воздухе гасит 1, в жидкости 2, в непрозрачном блоке 3: свет источника силы L никогда
// не уходит дальше L клеток (по сумме |dx| + |dy|).
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(req ? require('./world.js') : root.SB.World, req ? require('./data.js') : root.SB.Data);
  if (req) module.exports = api;
  else (root.SB = root.SB || {}).Light = api;
})(typeof self !== 'undefined' ? self : this, function (Wd, D) {
/* c8 ignore stop */
  'use strict';
  const MAX = 15;
  const MARGIN = MAX;
  const LAVA_LIGHT = 12;

  function flood(levels, cost, w, h) {
    const buckets = [];
    for (let l = 0; l <= MAX; l++) buckets.push([]);
    for (let i = 0; i < levels.length; i++) if (levels[i] > 1) buckets[levels[i]].push(i);
    for (let lv = MAX; lv > 1; lv--) {
      const b = buckets[lv];
      for (let q = 0; q < b.length; q++) {
        const i = b[q];
        if (levels[i] !== lv) continue;
        const x = i % w;
        const y = (i - x) / w;
        if (x > 0) spread(i - 1, lv);
        if (x < w - 1) spread(i + 1, lv);
        if (y > 0) spread(i - w, lv);
        if (y < h - 1) spread(i + w, lv);
      }
    }
    function spread(n, lv) {
      const nl = lv - cost[n];
      if (nl > levels[n]) {
        levels[n] = nl;
        if (nl > 1) buckets[nl].push(n);
      }
    }
  }

  // свет прямоугольника (x0, y0, w, h); источники ищутся и за краем, на MARGIN клеток;
  // sources - добавочные источники [[x, y, сила]] (факел в руке игрока)
  function compute(world, x0, y0, w, h, daylight, sources) {
    const ex = x0 - MARGIN;
    const ey = y0 - MARGIN;
    const ew = w + MARGIN * 2;
    const eh = h + MARGIN * 2;
    const n = ew * eh;
    const cost = new Uint8Array(n);
    const sky = new Uint8Array(n);
    const block = new Uint8Array(n);
    for (let i = 0; i < ew; i++) {
      const x = ex + i;
      const top = Wd.skyY(world, x);
      for (let j = 0; j < eh; j++) {
        const y = ey + j;
        const k = j * ew + i;
        const fg = Wd.get(world, x, y);
        const liq = Wd.getLiq(world, x, y);
        cost[k] = D.opaque[fg] ? 3 : liq ? 2 : 1;
        if (y < top && x >= 0 && x < world.W) sky[k] = MAX;
        let e = D.emit[fg];
        if (liq >> 4 === D.L.LAVA && LAVA_LIGHT > e) e = LAVA_LIGHT;
        block[k] = e;
      }
    }
    for (const [sx, sy, lv] of sources || []) {
      const i = Math.floor(sx) - ex;
      const j = Math.floor(sy) - ey;
      if (i < 0 || j < 0 || i >= ew || j >= eh) continue;
      const k = j * ew + i;
      if (lv > block[k]) block[k] = Math.min(MAX, lv);
    }
    flood(sky, cost, ew, eh);
    flood(block, cost, ew, eh);
    const k = Math.max(0, Math.min(1, daylight));
    const out = new Uint8Array(w * h);
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const s = (j + MARGIN) * ew + i + MARGIN;
        const sl = Math.round(sky[s] * k);
        out[j * w + i] = block[s] > sl ? block[s] : sl;
      }
    }
    return { x0, y0, w, h, data: out };
  }

  function at(map, x, y) {
    if (!map) return 0;
    const i = x - map.x0;
    const j = y - map.y0;
    if (i < 0 || j < 0 || i >= map.w || j >= map.h) return 0;
    return map.data[j * map.w + i];
  }

  return { MAX, MARGIN, LAVA_LIGHT, flood, compute, at };
});

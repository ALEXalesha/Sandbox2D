// Жидкости клетками: вода и лава, объём клетки 0..8 целыми единицами. Один шаг обходит
// прямоугольник снизу вверх: жидкость падает вниз, потом выравнивается с соседями слева и
// справа. Объём не появляется и не пропадает, кроме двух правил:
//   - вода в подземном аду испаряется целиком (evaporated);
//   - лава, которая коснулась воды, становится обсидианом; уходит вся лава клетки и столько же
//     воды у соседа (сколько у него есть) - consumed.
// За краем прямоугольника - стена: жидкость не утекает из обсчитанной области.
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(req ? require('./world.js') : root.SB.World, req ? require('./data.js') : root.SB.Data);
  if (req) module.exports = api;
  else (root.SB = root.SB || {}).Liquid = api;
})(typeof self !== 'undefined' ? self : this, function (Wd, D) {
/* c8 ignore stop */
  'use strict';
  const { B, L } = D;
  const FULL = L.FULL;
  const LAVA_EVERY = 3;

  const pack = (t, a) => (a > 0 ? (t << 4) | a : 0);

  function emptyStats() {
    return { evaporated: { water: 0, lava: 0 }, consumed: { water: 0, lava: 0 }, obsidian: [], moved: 0 };
  }

  function total(world, x0, y0, w, h) {
    const s = { water: 0, lava: 0 };
    for (let y = y0; y < y0 + h; y++) {
      for (let x = x0; x < x0 + w; x++) {
        const v = Wd.getLiq(world, x, y);
        if (v >> 4 === L.WATER) s.water += v & 15;
        else if (v >> 4 === L.LAVA) s.lava += v & 15;
      }
    }
    return s;
  }

  // в клетку может войти жидкость: блока нет (воздух) и клетка внутри области
  function open(world, x, y, r) {
    if (x < r.x0 || y < r.y0 || x >= r.x0 + r.w || y >= r.y0 + r.h) return false;
    return Wd.get(world, x, y) === B.AIR;
  }

  function step(world, x0, y0, w, h, tick, stats) {
    const st = stats || emptyStats();
    const r = { x0, y0, w, h };
    const hell = world.dims.hellTop;
    const leftFirst = (tick & 1) === 0;
    for (let y = y0 + h - 1; y >= y0; y--) {
      for (let q = 0; q < w; q++) {
        const x = leftFirst ? x0 + q : x0 + w - 1 - q;
        const v = Wd.getLiq(world, x, y);
        if (v === 0) continue;
        const t = v >> 4;
        let a = v & 15;
        if (t === L.LAVA && tick % LAVA_EVERY !== 0) continue;
        if (Wd.get(world, x, y) !== B.AIR) {
          // блок встал в жидкость (так не бывает при обычной игре): жидкость остаётся до его ухода
          continue;
        }
        if (t === L.WATER && y >= hell) {
          st.evaporated.water += a;
          Wd.setLiq(world, x, y, 0);
          continue;
        }
        if (t === L.LAVA && touchWater(world, x, y, a, r, st)) continue;
        // вниз
        if (open(world, x, y + 1, r)) {
          const bv = Wd.getLiq(world, x, y + 1);
          const bt = bv >> 4;
          const ba = bv & 15;
          if (bv === 0 || bt === t) {
            const move = Math.min(a, FULL - ba);
            if (move > 0) {
              a -= move;
              Wd.setLiq(world, x, y + 1, pack(t, ba + move));
              Wd.setLiq(world, x, y, pack(t, a));
              st.moved += move;
            }
          }
        }
        if (a === 0) continue;
        // в стороны: выровнять с соседями того же типа или пустыми
        const sides = [];
        for (const dx of leftFirst ? [-1, 1] : [1, -1]) {
          if (!open(world, x + dx, y, r)) continue;
          const sv = Wd.getLiq(world, x + dx, y);
          if (sv !== 0 && sv >> 4 !== t) continue;
          const sa = sv & 15;
          if (sa < a) sides.push([x + dx, sa]);
        }
        if (sides.length === 0) continue;
        let sum = a;
        for (const s of sides) sum += s[1];
        const n = sides.length + 1;
        const each = Math.floor(sum / n);
        let rest = sum - each * n;
        let mine = each;
        if (rest > 0) { mine++; rest--; }
        for (const s of sides) {
          let give = each;
          if (rest > 0) { give++; rest--; }
          if (give !== s[1]) {
            st.moved += Math.abs(give - s[1]);
            Wd.setLiq(world, s[0], y, pack(t, give));
          }
        }
        Wd.setLiq(world, x, y, pack(t, mine));
      }
    }
    return st;
  }

  function touchWater(world, x, y, a, r, st) {
    const near = [[x, y - 1], [x - 1, y], [x + 1, y], [x, y + 1]];
    for (const [nx, ny] of near) {
      if (nx < r.x0 || ny < r.y0 || nx >= r.x0 + r.w || ny >= r.y0 + r.h) continue;
      const nv = Wd.getLiq(world, nx, ny);
      if (nv >> 4 !== L.WATER) continue;
      const wa = nv & 15;
      const take = Math.min(wa, a);
      st.consumed.lava += a;
      st.consumed.water += take;
      Wd.setLiq(world, nx, ny, pack(L.WATER, wa - take));
      Wd.setLiq(world, x, y, 0);
      Wd.set(world, x, y, B.OBSIDIAN);
      st.obsidian.push([x, y]);
      return true;
    }
    return false;
  }

  // сколько единиц можно вылить/набрать (ведро в этой версии не делаем, но правило общее)
  function pour(world, x, y, t, amount) {
    if (Wd.get(world, x, y) !== B.AIR) return 0;
    const v = Wd.getLiq(world, x, y);
    if (v !== 0 && v >> 4 !== t) return 0;
    const a = v & 15;
    const put = Math.max(0, Math.min(amount, FULL - a));
    if (put > 0) Wd.setLiq(world, x, y, pack(t, a + put));
    return put;
  }

  return { FULL, LAVA_EVERY, pack, emptyStats, total, step, pour };
});

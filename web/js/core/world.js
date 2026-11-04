// Мир чанками 32 x 32. Чанк создаётся генератором при первом обращении; изменённые чанки
// помечаются dirty - только они попадают в сохранение. Всё, что за краем мира, - коренная
// порода (блок 255 в таблицах solid/opaque).
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(req ? require('./gen.js') : root.SB.Gen, req ? require('./data.js') : root.SB.Data);
  if (req) module.exports = api;
  else (root.SB = root.SB || {}).World = api;
})(typeof self !== 'undefined' ? self : this, function (G, D) {
/* c8 ignore stop */
  'use strict';
  const CH = G.CH;
  const OUT = 255;

  function create(seed, w, h) {
    const d = G.dims(w, h);
    return {
      seed: seed | 0,
      dims: d,
      W: d.W,
      H: d.H,
      cw: Math.ceil(d.W / CH),
      chh: Math.ceil(d.H / CH),
      chunks: new Map(),
      version: 0,          // растёт при каждом изменении: отрисовка и свет узнают, что пора обновить
      changed: new Set(),  // ключи чанков, изменённых после последнего опроса changes()
      skyCache: new Map(),
    };
  }

  const key = (cx, cy) => cy * 4096 + cx;

  function chunk(world, cx, cy) {
    const k = key(cx, cy);
    let c = world.chunks.get(k);
    if (!c) {
      c = G.genChunk(world.seed, cx, cy, world.dims);
      c.cx = cx;
      c.cy = cy;
      c.dirty = false;
      world.chunks.set(k, c);
    }
    return c;
  }

  function inside(world, x, y) {
    return x >= 0 && y >= 0 && x < world.W && y < world.H;
  }

  function at(world, x, y, layer) {
    if (!inside(world, x, y)) return layer === 'fg' ? (y < 0 ? 0 : OUT) : 0;
    const c = chunk(world, x >> 5, y >> 5);
    return c[layer][(y & 31) * CH + (x & 31)];
  }

  function put(world, x, y, layer, v) {
    if (!inside(world, x, y)) return false;
    const c = chunk(world, x >> 5, y >> 5);
    const i = (y & 31) * CH + (x & 31);
    if (c[layer][i] === v) return false;
    c[layer][i] = v;
    c.dirty = true;
    world.version++;
    world.changed.add(key(c.cx, c.cy));
    if (layer !== 'liq') world.skyCache.delete(x);
    return true;
  }

  const get = (w, x, y) => at(w, x, y, 'fg');
  const getWall = (w, x, y) => at(w, x, y, 'wall');
  const getLiq = (w, x, y) => at(w, x, y, 'liq');
  const set = (w, x, y, v) => put(w, x, y, 'fg', v);
  const setWall = (w, x, y, v) => put(w, x, y, 'wall', v);
  const setLiq = (w, x, y, v) => put(w, x, y, 'liq', v);

  const liqType = (v) => v >> 4;
  const liqAmount = (v) => v & 15;

  function solidAt(world, x, y) {
    return D.solid[get(world, x, y)] === 1;
  }

  // первая сверху клетка, которая закрывает небо (непрозрачный блок или стена)
  function skyY(world, x) {
    if (x < 0 || x >= world.W) return 0;
    let y = world.skyCache.get(x);
    if (y !== undefined) return y;
    y = 0;
    while (y < world.H && D.opaque[get(world, x, y)] === 0 && getWall(world, x, y) === 0) y++;
    world.skyCache.set(x, y);
    return y;
  }

  // поверхность для появления: первая твёрдая клетка сверху
  function groundY(world, x) {
    let y = 0;
    while (y < world.H && !solidAt(world, x, y)) y++;
    return y;
  }

  function changes(world) {
    const out = [...world.changed];
    world.changed.clear();
    return out;
  }

  function dirtyChunks(world) {
    return [...world.chunks.values()].filter((c) => c.dirty);
  }

  return { CH, OUT, create, key, chunk, inside, get, getWall, getLiq, set, setWall, setLiq, liqType, liqAmount, solidAt, skyY, groundY, changes, dirtyChunks };
});

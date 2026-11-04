// Сохранение мира: только изменённые чанки (три слоя подряд, сжатые RLE и base64), игрок,
// инвентарь, время, жители и побеждённые боссы. Разбор не доверяет входу: испорченная строка
// даёт null, а не сломанную игру.
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(req ? require('./world.js') : root.SB.World, req ? require('./inventory.js') : root.SB.Inv, req ? require('./data.js') : root.SB.Data);
  if (req) module.exports = api;
  else (root.SB = root.SB || {}).Save = api;
})(typeof self !== 'undefined' ? self : this, function (Wd, Inv, D) {
/* c8 ignore stop */
  'use strict';
  const VERSION = 1;
  const CELLS = Wd.CH * Wd.CH;
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const REV = new Int16Array(128).fill(-1);
  for (let i = 0; i < ABC.length; i++) REV[ABC.charCodeAt(i)] = i;

  function rle(bytes) {
    const out = [];
    let i = 0;
    while (i < bytes.length) {
      const v = bytes[i];
      let n = 1;
      while (i + n < bytes.length && bytes[i + n] === v && n < 255) n++;
      out.push(n, v);
      i += n;
    }
    return Uint8Array.from(out);
  }

  function unrle(bytes, size) {
    if (bytes.length % 2 !== 0) return null;
    const out = new Uint8Array(size);
    let p = 0;
    for (let i = 0; i < bytes.length; i += 2) {
      const n = bytes[i];
      if (n === 0 || p + n > size) return null;
      out.fill(bytes[i + 1], p, p + n);
      p += n;
    }
    return p === size ? out : null;
  }

  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const a = bytes[i];
      const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
      const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
      const t = (a << 16) | (b << 8) | c;
      s += ABC[(t >> 18) & 63] + ABC[(t >> 12) & 63];
      s += i + 1 < bytes.length ? ABC[(t >> 6) & 63] : '=';
      s += i + 2 < bytes.length ? ABC[t & 63] : '=';
    }
    return s;
  }

  function unb64(s) {
    if (typeof s !== 'string' || s.length % 4 !== 0) return null;
    const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
    const out = new Uint8Array((s.length / 4) * 3 - pad);
    let p = 0;
    for (let i = 0; i < s.length; i += 4) {
      let t = 0;
      for (let k = 0; k < 4; k++) {
        const ch = s.charCodeAt(i + k);
        let v;
        if (ch === 61 && i + k >= s.length - pad) v = 0;
        else {
          v = ch < 128 ? REV[ch] : -1;
          if (v < 0) return null;
        }
        t = (t << 6) | v;
      }
      if (p < out.length) out[p++] = (t >> 16) & 255;
      if (p < out.length) out[p++] = (t >> 8) & 255;
      if (p < out.length) out[p++] = t & 255;
    }
    return out;
  }

  function packChunk(c) {
    const all = new Uint8Array(CELLS * 3);
    all.set(c.fg, 0);
    all.set(c.wall, CELLS);
    all.set(c.liq, CELLS * 2);
    return b64(rle(all));
  }

  function unpackChunk(s) {
    const raw = unb64(s);
    if (!raw) return null;
    const all = unrle(raw, CELLS * 3);
    if (!all) return null;
    return { fg: all.slice(0, CELLS), wall: all.slice(CELLS, CELLS * 2), liq: all.slice(CELLS * 2) };
  }

  // блоки, стены и жидкости только известные: иначе игра упадёт на первом же шаге
  function validCells(c) {
    for (let i = 0; i < CELLS; i++) {
      if (c.fg[i] >= D.BLOCKS.length || c.wall[i] >= D.WALLS.length) return false;
      const t = c.liq[i] >> 4;
      const a = c.liq[i] & 15;
      if (c.liq[i] !== 0 && (t < 1 || t > 2 || a < 1 || a > 8)) return false;
    }
    return true;
  }

  // state: { name, world, player: {x,y,hp,maxHp}, inv, time, residents, bosses, stats }
  function serialize(state) {
    const chunks = {};
    for (const c of Wd.dirtyChunks(state.world)) chunks[c.cx + ',' + c.cy] = packChunk(c);
    return JSON.stringify({
      v: VERSION,
      name: String(state.name || ''),
      seed: state.world.seed,
      W: state.world.W,
      H: state.world.H,
      time: state.time,
      day: state.day | 0,
      player: { x: state.player.x, y: state.player.y, hp: state.player.hp, maxHp: state.player.maxHp, shards: state.player.shards | 0 },
      inv: state.inv.map((s) => (s ? { id: s.id, n: s.n } : null)),
      residents: (state.residents || []).map((r) => ({ kind: r.kind, home: r.home })),
      bosses: Object.assign({}, state.bosses || {}),
      stats: Object.assign({}, state.stats || {}),
      drops: (state.drops || []).filter((d) => d.n > 0).slice(0, 500).map((d) => ({ id: d.id, n: d.n, x: d.x, y: d.y })),
      chunks,
    });
  }

  const num = (v, lo, hi, dflt) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : dflt);

  function deserialize(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || typeof o !== 'object' || o.v !== VERSION) return null;
    const W = num(o.W, 64, 8192, 0);
    const H = num(o.H, 64, 4096, 0);
    if (!W || !H || !Number.isInteger(o.seed)) return null;
    const world = Wd.create(o.seed, W, H);
    const chunks = o.chunks && typeof o.chunks === 'object' ? o.chunks : {};
    for (const k of Object.keys(chunks)) {
      const m = /^(\d+),(\d+)$/.exec(k);
      if (!m) return null;
      const cx = +m[1];
      const cy = +m[2];
      if (cx >= world.cw || cy >= world.chh) return null;
      const data = unpackChunk(chunks[k]);
      if (!data || !validCells(data)) return null;
      const c = Wd.chunk(world, cx, cy);
      c.fg = data.fg;
      c.wall = data.wall;
      c.liq = data.liq;
      c.dirty = true;
    }
    world.skyCache.clear();
    world.changed.clear();
    const p = o.player && typeof o.player === 'object' ? o.player : {};
    const maxHp = num(p.maxHp, 1, 1000, 100);
    return {
      name: typeof o.name === 'string' ? o.name.slice(0, 40) : '',
      world,
      time: num(o.time, 0, 1, 0.1),
      day: num(o.day, 0, 1e6, 0),
      player: { x: num(p.x, 0, W, world.dims.spawnX), y: num(p.y, -50, H, 0), hp: num(p.hp, 0, maxHp, maxHp), maxHp, shards: num(p.shards, 0, 10, 0) },
      inv: Inv.sanitize(o.inv),
      residents: Array.isArray(o.residents) ? o.residents.filter((r) => r && typeof r.kind === 'string' && Array.isArray(r.home)).map((r) => ({ kind: r.kind, home: [num(r.home[0], 0, W, 0), num(r.home[1], 0, H, 0)] })) : [],
      bosses: o.bosses && typeof o.bosses === 'object' ? { colossus: o.bosses.colossus === true, heart: o.bosses.heart === true } : {},
      drops: Array.isArray(o.drops) ? o.drops.filter((d) => d && Inv.sanitize([d], 1)[0]).slice(0, 500).map((d) => ({ id: d.id, n: Math.min(Math.floor(d.n), Inv.stackOf(d.id)), x: num(d.x, 0, W, 0), y: num(d.y, -50, H, 0) })) : [],
      stats: o.stats && typeof o.stats === 'object' ? { kills: num(o.stats.kills, 0, 1e9, 0), coins: num(o.stats.coins, 0, 1e9, 0) } : { kills: 0, coins: 0 },
    };
  }

  return { VERSION, rle, unrle, b64, unb64, packChunk, unpackChunk, serialize, deserialize };
});

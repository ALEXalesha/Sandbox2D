// Инвентарь и крафт. Ячейка - { id, n } или null. Крафт или делается целиком, или не меняет
// ничего: ингредиенты списываются ровно по рецепту, результат кладётся только если есть место.
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(req ? require('./data.js') : root.SB.Data, req ? require('./world.js') : root.SB.World);
  if (req) module.exports = api;
  else (root.SB = root.SB || {}).Inv = api;
})(typeof self !== 'undefined' ? self : this, function (D, Wd) {
  'use strict';
  const SIZE = 40;
  const HOTBAR = 10;
  const STATION_RANGE = 4;

  const create = (size) => new Array(size || SIZE).fill(null);
  const stackOf = (id) => (D.ITEMS[id] ? D.ITEMS[id].stack : 0);

  function count(inv, id) {
    let n = 0;
    for (const s of inv) if (s && s.id === id) n += s.n;
    return n;
  }

  // сколько штук id влезет
  function room(inv, id) {
    const max = stackOf(id);
    let r = 0;
    for (const s of inv) {
      if (!s) r += max;
      else if (s.id === id) r += max - s.n;
    }
    return r;
  }

  // положить; возвращает, сколько не влезло
  function add(inv, id, n) {
    const max = stackOf(id);
    if (!max || !(n > 0)) return n > 0 ? n : 0;
    let left = Math.floor(n);
    for (const s of inv) {
      if (left === 0) break;
      if (s && s.id === id && s.n < max) {
        const put = Math.min(max - s.n, left);
        s.n += put;
        left -= put;
      }
    }
    for (let i = 0; i < inv.length && left > 0; i++) {
      if (inv[i]) continue;
      const put = Math.min(max, left);
      inv[i] = { id, n: put };
      left -= put;
    }
    return left;
  }

  // забрать ровно n или ничего
  function remove(inv, id, n) {
    if (count(inv, id) < n) return false;
    let left = n;
    for (let i = inv.length - 1; i >= 0 && left > 0; i--) {
      const s = inv[i];
      if (!s || s.id !== id) continue;
      const take = Math.min(s.n, left);
      s.n -= take;
      left -= take;
      if (s.n === 0) inv[i] = null;
    }
    return true;
  }

  function removeAt(inv, slot, n) {
    const s = inv[slot];
    if (!s) return 0;
    const take = Math.min(s.n, n);
    s.n -= take;
    if (s.n === 0) inv[slot] = null;
    return take;
  }

  function swap(inv, a, b) {
    if (a === b || a < 0 || b < 0 || a >= inv.length || b >= inv.length) return false;
    const sa = inv[a];
    const sb = inv[b];
    if (sa && sb && sa.id === sb.id && sb.n < stackOf(sb.id)) {
      const put = Math.min(stackOf(sa.id) - sb.n, sa.n);
      sb.n += put;
      sa.n -= put;
      if (sa.n === 0) inv[a] = null;
      return true;
    }
    inv[a] = sb;
    inv[b] = sa;
    return true;
  }

  // станции в квадрате вокруг точки
  function stationsNear(world, x, y, range) {
    const r = range || STATION_RANGE;
    const out = new Set();
    const cx = Math.floor(x);
    const cy = Math.floor(y);
    for (let j = cy - r; j <= cy + r; j++) {
      for (let i = cx - r; i <= cx + r; i++) {
        const b = D.BLOCKS[Wd.get(world, i, j)];
        if (b && b.station) out.add(b.station);
      }
    }
    return out;
  }

  function canCraft(inv, recipe, stations) {
    if (recipe.station && !(stations && stations.has(recipe.station))) return false;
    for (const [id, n] of recipe.ins) if (count(inv, id) < n) return false;
    return roomAfter(inv, recipe) >= recipe.n;
  }

  // место под результат после списания (ячейки могут освободиться)
  function roomAfter(inv, recipe) {
    const copy = inv.map((s) => (s ? { id: s.id, n: s.n } : null));
    for (const [id, n] of recipe.ins) remove(copy, id, n);
    return room(copy, recipe.out);
  }

  function craft(inv, recipe, stations) {
    if (!canCraft(inv, recipe, stations)) return false;
    for (const [id, n] of recipe.ins) remove(inv, id, n);
    add(inv, recipe.out, recipe.n);
    return true;
  }

  function available(inv, stations) {
    return D.RECIPES.filter((r) => canCraft(inv, r, stations));
  }

  // для сохранения: только известные предметы и честные числа
  function sanitize(list, size) {
    const inv = create(size);
    if (!Array.isArray(list)) return inv;
    for (let i = 0; i < inv.length && i < list.length; i++) {
      const s = list[i];
      if (!s || typeof s !== 'object' || !D.ITEMS[s.id]) continue;
      const n = Math.floor(Number(s.n));
      if (!(n > 0)) continue;
      inv[i] = { id: s.id, n: Math.min(n, stackOf(s.id)) };
    }
    return inv;
  }

  return { SIZE, HOTBAR, STATION_RANGE, create, stackOf, count, room, add, remove, removeAt, swap, stationsNear, canCraft, craft, available, sanitize };
});

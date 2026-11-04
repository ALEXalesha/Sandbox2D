// Настройки и хранилище: тема (5 тем как в Paint Pro), язык, громкость, масштаб, клавиши;
// три ячейки миров. Хранилище - любой объект с getItem/setItem/removeItem (localStorage в
// браузере, подделка в законах); ошибки хранилища не роняют игру.
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(req ? require('./keys.js') : root.SB.Keys);
  if (req) module.exports = api;
  else (root.SB = root.SB || {}).Settings = api;
})(typeof self !== 'undefined' ? self : this, function (K) {
/* c8 ignore stop */
  'use strict';
  const THEMES = Object.freeze(['glass', 'formal', 'light', 'night', 'warm']);
  const LANGS = Object.freeze(['ru', 'en']);
  const SLOTS = 3;
  const PREFIX = 'sandbox2d:';
  const ZOOM = Object.freeze({ min: 1, max: 4, dflt: 2 });

  function defaults() {
    return { theme: 'glass', lang: 'ru', volume: 0.7, music: 0.4, zoom: ZOOM.dflt, keys: K.defaults(), fps: false };
  }

  const clamp01 = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : d);

  function sanitize(src) {
    const d = defaults();
    const s = src && typeof src === 'object' ? src : {};
    return {
      theme: THEMES.includes(s.theme) ? s.theme : d.theme,
      lang: LANGS.includes(s.lang) ? s.lang : d.lang,
      volume: clamp01(s.volume, d.volume),
      music: clamp01(s.music, d.music),
      zoom: typeof s.zoom === 'number' && s.zoom >= ZOOM.min && s.zoom <= ZOOM.max ? Math.round(s.zoom * 4) / 4 : d.zoom,
      keys: K.sanitize(s.keys),
      fps: s.fps === true,
    };
  }

  function read(store, key) {
    try { return store.getItem(PREFIX + key); } catch (e) { return null; }
  }
  function write(store, key, value) {
    try { store.setItem(PREFIX + key, value); return true; } catch (e) { return false; }
  }
  function drop(store, key) {
    try { store.removeItem(PREFIX + key); return true; } catch (e) { return false; }
  }

  function load(store) {
    const text = read(store, 'settings');
    if (!text) return defaults();
    try { return sanitize(JSON.parse(text)); } catch (e) { return defaults(); }
  }

  const save = (store, s) => write(store, 'settings', JSON.stringify(sanitize(s)));

  // ячейки миров: данные и описание (имя, день, дата) хранятся отдельно, чтобы список
  // открывался быстро
  function listWorlds(store) {
    const out = [];
    for (let i = 0; i < SLOTS; i++) {
      let meta = null;
      try { meta = JSON.parse(read(store, 'meta.' + i) || 'null'); } catch (e) { meta = null; }
      const ok = meta && typeof meta === 'object' && typeof meta.name === 'string' && read(store, 'world.' + i) !== null;
      out.push(ok ? { slot: i, name: meta.name.slice(0, 40), day: meta.day | 0, savedAt: Number(meta.savedAt) || 0, seed: meta.seed | 0 } : { slot: i, empty: true });
    }
    return out;
  }

  function saveWorld(store, slot, text, meta) {
    if (!(slot >= 0 && slot < SLOTS)) return false;
    if (!write(store, 'world.' + slot, text)) return false;
    return write(store, 'meta.' + slot, JSON.stringify({ name: String(meta.name || ''), day: meta.day | 0, seed: meta.seed | 0, savedAt: meta.savedAt || 0 }));
  }

  const loadWorld = (store, slot) => (slot >= 0 && slot < SLOTS ? read(store, 'world.' + slot) : null);

  function deleteWorld(store, slot) {
    if (!(slot >= 0 && slot < SLOTS)) return false;
    return drop(store, 'world.' + slot) && drop(store, 'meta.' + slot);
  }

  // первая пустая ячейка, иначе самая старая
  function freeSlot(store) {
    const list = listWorlds(store);
    const empty = list.find((w) => w.empty);
    if (empty) return empty.slot;
    return list.reduce((a, b) => (b.savedAt < a.savedAt ? b : a)).slot;
  }

  return { THEMES, LANGS, SLOTS, PREFIX, ZOOM, defaults, sanitize, load, save, listWorlds, saveWorld, loadWorld, deleteWorld, freeSlot };
});

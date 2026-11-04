// Главный файл окна: меню, настройки, ввод, игровой цикл, панель инвентаря, крафт и лавка.
// Правила игры - в core/, здесь только связь с экраном. window.Sandbox2D - для законов
// страницы (Playwright) и отладки.
(function (root) {
  'use strict';
  const SB = root.SB;
  const { Game: Gm, Inv, Data: D, Keys: K, Settings: St, I18n, Noise: N, Time: T, Npc, Mobs: M, World: Wd } = SB;
  const $ = (id) => document.getElementById(id);
  const SIZES = { normal: [1600, 576], small: [800, 384] };
  const AUTOSAVE = 60;

  let store;
  try { store = root.localStorage; void store.length; } catch (e) { store = { getItem: () => null, setItem: () => {}, removeItem: () => {} }; }

  let waitingKey = null;
  const app = {
    settings: St.load(store),
    overlay: 'menu',
    game: null,
    slot: -1,
    render: null,
    keys: new Set(),
    touch: { left: false, right: false, jump: false },
    mouse: { x: 0, y: 0, left: false, right: false, inside: false },
    panelPick: -1,
    shopKind: null,
    lastSave: 0,
    backTo: 'menu',
    frames: 0,
  };
  root.Sandbox2D = app;
  app.core = SB;

  const t = (key, p) => I18n.t(app.settings.lang, key, p);
  const itemName = (id) => t('item.' + id);

  // ---------- оформление ----------

  function applyTheme() {
    const th = app.settings.theme;
    if (th === 'glass') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', th);
  }

  function applyLang() {
    document.documentElement.lang = app.settings.lang;
    for (const el of document.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
    for (const el of document.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
    for (const el of document.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
    for (const el of document.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
    const sel = $('o-theme');
    sel.innerHTML = '';
    for (const th of St.THEMES) {
      const o = document.createElement('option');
      o.value = th;
      o.textContent = t('theme.' + th);
      sel.appendChild(o);
    }
    sel.value = app.settings.theme;
    buildKeys($('o-keys'), true);
    buildKeys($('h-keys'), false);
    if (app.game) { buildHotbar(); if (app.overlay === 'panel') buildPanel(); }
  }

  function saveSettings() {
    St.save(store, app.settings);
    SB.Audio.setVolume(app.settings.volume, app.settings.music);
    if (app.render) app.render.zoom = app.settings.zoom;
    $('fps').hidden = !app.settings.fps;
  }

  // ---------- экраны ----------

  function show(name) {
    waitingKey = null;
    app.overlay = name;
    for (const s of document.querySelectorAll('.screen[data-screen]')) s.hidden = s.dataset.screen !== name;
    const inGame = !!app.game && name !== 'menu' && name !== 'new' && name !== 'load';
    $('hud').hidden = !app.game || !inGame;
    $('panel').hidden = name !== 'panel';
    const screens = $('screens');
    screens.classList.toggle('dim', !app.game);
    screens.classList.toggle('over', !!app.game && name !== 'playing' && name !== 'panel');
    if (name === 'load') buildLoad();
    if (name === 'settings') fillSettings();
    if (name === 'new') {
      $('n-name').value = t('defaultName');
      $('n-seed').value = '';
    }
    if (name !== 'playing' && name !== 'panel') app.mouse.left = false;
    const first = document.querySelector('.screen[data-screen="' + name + '"] .btn.primary');
    if (first && name !== 'playing') first.focus({ preventScroll: true });
  }

  function fillSettings() {
    const s = app.settings;
    $('o-theme').value = s.theme;
    $('o-lang').value = s.lang;
    $('o-volume').value = s.volume;
    $('o-music').value = s.music;
    $('o-zoom').value = s.zoom;
    $('o-fps').checked = s.fps;
    buildKeys($('o-keys'), true);
  }

  function buildKeys(host, editable) {
    host.innerHTML = '';
    for (const a of K.ACTIONS) {
      const row = document.createElement('div');
      row.className = 'key-row';
      const label = document.createElement('span');
      label.textContent = t('act.' + a);
      row.appendChild(label);
      for (let i = 0; i < 2; i++) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'btn';
        const wait = waitingKey && waitingKey.action === a && waitingKey.index === i && editable;
        b.textContent = wait ? t('pressKey') : K.keyName(app.settings.keys[a][i], app.settings.lang);
        if (wait) b.classList.add('wait');
        if (editable) b.addEventListener('click', () => { waitingKey = { action: a, index: i }; buildKeys(host, true); });
        else b.tabIndex = -1;
        row.appendChild(b);
      }
      host.appendChild(row);
    }
  }

  function buildLoad() {
    const host = $('l-list');
    host.innerHTML = '';
    for (const w of St.listWorlds(store)) {
      const row = document.createElement('div');
      row.className = 'slot-row';
      const info = document.createElement('div');
      info.className = 'info';
      if (w.empty) {
        info.innerHTML = '<b></b>';
        info.firstChild.textContent = t('empty');
      } else {
        const b = document.createElement('b');
        b.textContent = w.name;
        const small = document.createElement('small');
        const date = w.savedAt ? new Date(w.savedAt).toLocaleString(app.settings.lang === 'en' ? 'en-GB' : 'ru-RU') : '';
        small.textContent = t('day', { n: w.day + 1 }) + (date ? ' · ' + t('savedAt', { date }) : '');
        info.append(b, small);
      }
      row.appendChild(info);
      if (!w.empty) {
        const play = document.createElement('button');
        play.className = 'btn primary small';
        play.type = 'button';
        play.textContent = t('play');
        play.dataset.slot = w.slot;
        play.addEventListener('click', () => loadSlot(w.slot));
        const del = document.createElement('button');
        del.className = 'btn small';
        del.type = 'button';
        del.textContent = t('delete');
        del.addEventListener('click', () => { St.deleteWorld(store, w.slot); buildLoad(); });
        row.append(play, del);
      }
      host.appendChild(row);
    }
  }

  // ---------- миры ----------

  function startGame(game, slot) {
    app.game = game;
    app.slot = slot;
    app.lastSave = performance.now();
    app.render.setGame(game);
    app.render.zoom = app.settings.zoom;
    app.panelPick = -1;
    buildHotbar();
    show('playing');
  }

  function newWorld(opts) {
    const o = opts || {};
    const name = (o.name || $('n-name').value || t('defaultName')).trim().slice(0, 32) || t('defaultName');
    const seedText = o.seed !== undefined ? String(o.seed) : $('n-seed').value.trim();
    const seed = seedText ? N.seedFrom(seedText) : (Math.random() * 2147483647) | 0;
    const size = SIZES[o.size || $('n-size').value] || SIZES.normal;
    const slot = St.freeSlot(store);
    if (slot < 0) { toast(t('slotsFull')); show('load'); return null; }
    const game = Gm.create({ seed, W: size[0], H: size[1], name, spawning: o.spawning !== false });
    startGame(game, slot);
    saveNow();
    return game;
  }

  function loadSlot(slot) {
    const text = St.loadWorld(store, slot);
    const game = text && Gm.fromSave(text);
    if (!game) { toast(t('loadFailed')); return null; }
    startGame(game, slot);
    return game;
  }

  function saveNow() {
    if (!app.game || app.slot < 0) return false;
    const ok = St.saveWorld(store, app.slot, Gm.toSave(app.game), { name: app.game.name, day: app.game.day, seed: app.game.world.seed, savedAt: Date.now() });
    app.lastSave = performance.now();
    return ok;
  }

  function toMenu() {
    saveNow();
    app.game = null;
    app.render.setGame(null);
    SB.Audio.stopAmbience();
    show('menu');
  }

  // ---------- панель предметов ----------

  function cellEl(slot, index, hotkey) {
    const c = document.createElement('div');
    c.className = 'cell';
    c.dataset.index = index;
    if (slot) {
      const img = document.createElement('img');
      img.src = SB.Tex.iconURL(slot.id);
      img.alt = itemName(slot.id);
      c.appendChild(img);
      if (slot.n > 1) {
        const n = document.createElement('span');
        n.className = 'n';
        n.textContent = slot.n;
        c.appendChild(n);
      }
      c.title = itemName(slot.id);
    }
    if (hotkey) {
      const k = document.createElement('span');
      k.className = 'k';
      k.textContent = hotkey;
      c.appendChild(k);
    }
    return c;
  }

  let hotbarSig = '';
  function buildHotbar(force) {
    const g = app.game;
    const sig = g.inv.slice(0, Inv.HOTBAR).map((s) => (s ? s.id + s.n : '-')).join() + '|' + g.player.slot + app.settings.lang;
    if (!force && sig === hotbarSig) return;
    hotbarSig = sig;
    const host = $('hotbar');
    host.innerHTML = '';
    for (let i = 0; i < Inv.HOTBAR; i++) {
      const c = cellEl(g.inv[i], i, String((i + 1) % 10));
      if (i === g.player.slot) c.classList.add('on');
      c.addEventListener('mousedown', (e) => { e.stopPropagation(); selectSlot(i); });
      host.appendChild(c);
    }
    const s = g.inv[g.player.slot];
    $('hand').textContent = s ? itemName(s.id) : '';
  }

  function selectSlot(i) {
    if (!app.game) return;
    app.game.player.slot = Math.max(0, Math.min(Inv.HOTBAR - 1, i));
    app.game.player.mining = null;
    buildHotbar();
  }

  function describe(id) {
    const it = D.ITEMS[id];
    let d = itemName(id);
    if (it.kind === 'pick') d += ' - ' + t('desc.pick', it);
    else if (it.kind === 'sword') d += ' - ' + t('desc.sword', it);
    else if (I18n.DICT.ru['desc.' + id]) d += ' - ' + t('desc.' + id);
    return d;
  }

  function buildPanel() {
    const g = app.game;
    const grid = $('inv-grid');
    grid.innerHTML = '';
    g.inv.forEach((s, i) => {
      const c = cellEl(s, i, i < Inv.HOTBAR ? String((i + 1) % 10) : '');
      if (i === app.panelPick) c.classList.add('pick');
      if (i === g.player.slot) c.classList.add('on');
      c.addEventListener('click', () => clickCell(i));
      c.addEventListener('mouseenter', () => { $('item-info').textContent = s ? describe(s.id) : ''; });
      grid.appendChild(c);
    });
    $('coins').textContent = t('coins', { n: Inv.count(g.inv, 'coin') });
    buildCraft();
    buildShop();
  }

  function clickCell(i) {
    const g = app.game;
    if (app.panelPick < 0) {
      if (g.inv[i]) app.panelPick = i;
    } else {
      Inv.swap(g.inv, app.panelPick, i);
      app.panelPick = -1;
    }
    SB.Audio.play({ type: 'ui' });
    buildPanel();
    buildHotbar();
  }

  function buildCraft() {
    const g = app.game;
    const st = Gm.stations(g);
    const host = $('craft-list');
    host.innerHTML = '';
    const list = D.RECIPES.map((r, i) => ({ r, i, ok: Inv.canCraft(g.inv, r, st) }));
    list.sort((a, b) => (b.ok - a.ok) || (a.i - b.i));
    for (const { r, i, ok } of list) {
      const row = document.createElement('div');
      row.className = 'recipe' + (ok ? '' : ' no');
      const img = document.createElement('img');
      img.src = SB.Tex.iconURL(r.out);
      img.alt = '';
      const txt = document.createElement('div');
      txt.className = 'txt';
      txt.textContent = itemName(r.out) + (r.n > 1 ? ' x' + r.n : '');
      const small = document.createElement('small');
      const ins = r.ins.map(([id, n]) => `${itemName(id)} ${Inv.count(g.inv, id)}/${n}`).join(', ');
      small.textContent = ins + ' · ' + (r.station ? t('station.' + r.station) : t('hand'));
      txt.appendChild(small);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small';
      b.textContent = t('craft');
      b.disabled = !ok;
      b.dataset.recipe = i;
      b.addEventListener('click', () => {
        if (Gm.craft(g, D.RECIPES[i])) { buildPanel(); buildHotbar(); }
      });
      row.append(img, txt, b);
      host.appendChild(row);
    }
  }

  function buildShop() {
    const box = $('shop');
    const kind = app.shopKind;
    box.hidden = !kind;
    if (!kind) return;
    const g = app.game;
    $('shop-who').textContent = t('npc.' + kind);
    $('shop-hello').textContent = t('npc.' + kind + '.hello');
    const host = $('shop-list');
    host.innerHTML = '';
    Npc.SHOP[kind].forEach((o, i) => {
      const row = document.createElement('div');
      row.className = 'recipe';
      const img = document.createElement('img');
      img.src = SB.Tex.iconURL(o.id);
      img.alt = '';
      const txt = document.createElement('div');
      txt.className = 'txt';
      txt.textContent = itemName(o.id) + ' x' + o.n;
      const small = document.createElement('small');
      small.textContent = o.price + ' ' + itemName('coin').toLowerCase();
      txt.appendChild(small);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn small';
      b.textContent = t('buy');
      b.disabled = Inv.count(g.inv, 'coin') < o.price;
      b.addEventListener('click', () => { if (Npc.buy(g, kind, i)) { SB.Audio.play({ type: 'pickup' }); buildPanel(); buildHotbar(); } });
      row.append(img, txt, b);
      host.appendChild(row);
    });
    const sel = app.panelPick >= 0 ? g.inv[app.panelPick] : null;
    $('shop-sell').disabled = !(sel && Npc.SELL[sel.id]);
    $('shop-sell').textContent = t('sell') + (sel && Npc.SELL[sel.id] ? ` (+${Npc.SELL[sel.id]})` : '');
    $('shop-heal').hidden = kind !== 'healer';
    $('shop-heal').textContent = t('heal', { n: Npc.HEAL_PRICE });
  }

  function openPanel(kind) {
    if (!app.game || app.game.player.dead) return;
    app.shopKind = kind || null;
    app.panelPick = -1;
    show('panel');
    buildPanel();
  }

  function closePanel() {
    app.shopKind = null;
    app.panelPick = -1;
    show('playing');
  }

  function residentNear(x, y, r) {
    let best = null;
    let bd = r;
    for (const res of app.game.residents) {
      const d = Math.hypot(res.x + res.w / 2 - x, res.y + res.h / 2 - y);
      if (d < bd) { bd = d; best = res; }
    }
    return best;
  }

  // нажатие прямо на жителя рядом - разговор, а не удар
  function talkAt(aim) {
    const g = app.game;
    const res = residentNear(aim[0], aim[1], 1.3);
    if (!res) return false;
    const [px, py] = Gm.center(g.player.body);
    if (Math.hypot(res.x + res.w / 2 - px, res.y + res.h / 2 - py) > 7) return false;
    openPanel(res.kind);
    return true;
  }

  function talk(aim) {
    const g = app.game;
    const [px, py] = Gm.center(g.player.body);
    let res = aim ? residentNear(aim[0], aim[1], 2) : null;
    if (res && Math.hypot(res.x - px, res.y - py) > 7) res = null;
    if (!res) res = residentNear(px, py, 6);
    if (res) openPanel(res.kind);
    return res;
  }

  // ---------- сообщения ----------

  function toast(text) {
    const host = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = text;
    host.appendChild(el);
    while (host.children.length > 4) host.firstChild.remove();
    setTimeout(() => el.remove(), 3100);
  }

  function handleEvents() {
    const g = app.game;
    const ev = g.events.splice(0);
    if (!ev.length) return;
    app.render.events(ev);
    let invChanged = false;
    for (const e of ev) {
      SB.Audio.play(e);
      if (e.type === 'pickup' || e.type === 'place' || e.type === 'craft' || e.type === 'drink' || e.type === 'death') invChanged = true;
      if (e.type === 'hard') toast(t('msg.hard'));
      else if (e.type === 'arrive') toast(t('msg.arrive.' + e.kind));
      else if (e.type === 'leave') toast(t('msg.leave'));
      else if (e.type === 'boss') toast(t('msg.boss.' + e.kind));
      else if (e.type === 'bossDown') toast(t('msg.bossDown.' + e.kind));
      else if (e.type === 'craft') toast(t('msg.craft', { item: itemName(e.id) }));
      else if (e.type === 'death' && e.lost) toast(t('lostCoins', { n: e.lost }));
    }
    if (invChanged) {
      buildHotbar();
      if (app.overlay === 'panel') buildPanel();
    }
  }

  function useResult(res) {
    if (res === 'day') toast(t('msg.day'));
    else if (res === 'not-hell') toast(t('msg.notHell'));
    else if (res === 'busy') toast(t('msg.busy'));
    else if (res === 'full') toast(t('msg.full'));
  }

  // ---------- HUD ----------

  let hudSig = '';
  function updateHud() {
    const g = app.game;
    const p = g.player;
    const c = T.clock(g.time);
    const [lx, ly] = Gm.center(p.body);
    const lv = SB.Light.at(g.light, Math.floor(lx), Math.floor(ly + 0.5));
    const sig = [Math.ceil(p.hp), p.maxHp, c.h, Math.floor(c.m / 10), g.day, Math.ceil(p.dead), app.settings.lang, lv].join();
    if (sig !== hudSig) {
      hudSig = sig;
      $('hp-bar').style.width = (100 * p.hp / p.maxHp) + '%';
      $('hp-text').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
      $('clock').textContent = `${t('day', { n: g.day + 1 })} · ${String(c.h).padStart(2, '0')}:${String(c.m).padStart(2, '0')}`;
      const el = $('light');
      el.textContent = t(lv >= M.DARK ? 'light.safe' : 'light.dark', { n: lv });
      el.classList.toggle('dark', lv < M.DARK);
      $('dead').hidden = !(p.dead > 0);
      $('dead-info').textContent = p.dead > 0 ? t('respawnIn', { n: Math.ceil(p.dead) }) : '';
    }
    const boss = g.mobs.find((m) => M.TYPES[m.kind].boss);
    $('boss').hidden = !boss;
    if (boss) {
      $('boss-name').textContent = t('mob.' + boss.kind);
      $('boss-bar').style.width = Math.max(0, 100 * boss.hp / boss.maxHp) + '%';
    }
  }

  function ambienceMode() {
    const g = app.game;
    const b = g.player.body;
    if (b.y >= g.world.dims.hellTop) return 'hell';
    if (b.y > Wd.skyY(g.world, Math.floor(b.x)) + 20) return 'deep';
    return T.isNight(g.time) ? 'night' : 'day';
  }

  // ---------- ввод ----------

  function input() {
    const b = app.settings.keys;
    const down = (a) => b[a].some((c) => c && app.keys.has(c));
    const playing = app.overlay === 'playing';
    const aim = app.mouse.inside ? app.render.toWorld(app.mouse.x, app.mouse.y) : null;
    return {
      left: playing && (down('left') || app.touch.left),
      right: playing && (down('right') || app.touch.right),
      jump: playing && (down('jump') || app.touch.jump),
      use: playing && app.mouse.left && !!aim,
      aimX: aim ? aim[0] : undefined,
      aimY: aim ? aim[1] : undefined,
    };
  }

  function onKey(e) {
    if (waitingKey) {
      e.preventDefault();
      if (e.code !== 'Escape') K.rebind(app.settings.keys, waitingKey.action, waitingKey.index, e.code);
      waitingKey = null;
      saveSettings();
      buildKeys($('o-keys'), true);
      buildKeys($('h-keys'), false);
      return;
    }
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
    const code = e.code;
    if (code === 'Escape') {
      e.preventDefault();
      if (app.overlay === 'playing') show('pause');
      else if (app.overlay === 'pause') show('playing');
      else if (app.overlay === 'panel') closePanel();
      else if (app.overlay === 'settings' || app.overlay === 'help') show(app.game ? 'pause' : 'menu');
      else if (app.overlay === 'new' || app.overlay === 'load') show('menu');
      return;
    }
    if (!app.game) return;
    const slot = K.slotFor(code);
    if (slot >= 0 && (app.overlay === 'playing' || app.overlay === 'panel')) { selectSlot(slot); if (app.overlay === 'panel') buildPanel(); return; }
    const act = K.actionFor(app.settings.keys, code);
    if (act && (app.overlay === 'playing' || app.overlay === 'panel')) e.preventDefault();
    if (act === 'inventory') { if (app.overlay === 'playing') openPanel(); else if (app.overlay === 'panel') closePanel(); }
    else if (act === 'talk' && app.overlay === 'playing') talk(null);
    else if (act === 'zoomIn' || act === 'zoomOut') {
      const z = app.settings.zoom + (act === 'zoomIn' ? 0.5 : -0.5);
      app.settings.zoom = Math.max(St.ZOOM.min, Math.min(St.ZOOM.max, z));
      saveSettings();
    } else if (act === 'map' && app.overlay === 'playing') { app.backTo = 'playing'; show('help'); }
    if (act === 'jump' && app.overlay === 'playing' && app.game.player.body.onGround) SB.Audio.play({ type: 'jump' });
  }

  function bindInput() {
    root.addEventListener('keydown', (e) => { SB.Audio.resume(); app.keys.add(e.code); if (!e.repeat) onKey(e); else if (K.actionFor(app.settings.keys, e.code) && app.overlay === 'playing') e.preventDefault(); });
    root.addEventListener('keyup', (e) => app.keys.delete(e.code));
    root.addEventListener('blur', () => { app.keys.clear(); app.mouse.left = false; });
    const view = $('game');
    view.addEventListener('mousemove', (e) => { app.mouse.x = e.clientX; app.mouse.y = e.clientY; app.mouse.inside = true; });
    view.addEventListener('mouseleave', () => { app.mouse.inside = false; app.mouse.left = false; });
    view.addEventListener('mousedown', (e) => {
      SB.Audio.resume();
      app.mouse.x = e.clientX;
      app.mouse.y = e.clientY;
      app.mouse.inside = true;
      if (app.overlay !== 'playing') return;
      if (e.button === 0) {
        if (talkAt(app.render.toWorld(e.clientX, e.clientY))) return;
        app.mouse.left = true;
        const res = Gm.use(app.game, Object.assign(input(), { use: false }), 0);
        if (res) useResult(res);
      } else if (e.button === 2) talk(app.render.toWorld(e.clientX, e.clientY));
    });
    root.addEventListener('mouseup', (e) => { if (e.button === 0) app.mouse.left = false; });
    view.addEventListener('contextmenu', (e) => e.preventDefault());
    view.addEventListener('wheel', (e) => {
      if (app.overlay !== 'playing') return;
      e.preventDefault();
      selectSlot((app.game.player.slot + (e.deltaY > 0 ? 1 : -1) + Inv.HOTBAR) % Inv.HOTBAR);
    }, { passive: false });
    // касание: один палец - использовать предмет в точке
    view.addEventListener('touchstart', (e) => {
      const tt = e.touches[0];
      app.mouse.x = tt.clientX; app.mouse.y = tt.clientY; app.mouse.inside = true;
      if (app.overlay === 'playing' && talkAt(app.render.toWorld(tt.clientX, tt.clientY))) return;
      app.mouse.left = true;
    }, { passive: true });
    view.addEventListener('touchmove', (e) => { const tt = e.touches[0]; app.mouse.x = tt.clientX; app.mouse.y = tt.clientY; }, { passive: true });
    view.addEventListener('touchend', () => { app.mouse.left = false; }, { passive: true });
    for (const b of document.querySelectorAll('[data-touch]')) {
      const set = (v) => (e) => { e.preventDefault(); app.touch[b.dataset.touch] = v; b.classList.toggle('on', v); };
      b.addEventListener('pointerdown', set(true));
      for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, set(false));
    }
  }

  function bindUi() {
    const on = (id, f) => $(id).addEventListener('click', () => { SB.Audio.resume(); SB.Audio.play({ type: 'ui' }); f(); });
    on('m-new', () => show('new'));
    on('m-load', () => show('load'));
    on('m-settings', () => { app.backTo = 'menu'; show('settings'); });
    on('m-help', () => { app.backTo = 'menu'; show('help'); });
    on('n-back', () => show('menu'));
    on('n-create', () => newWorld());
    on('l-back', () => show('menu'));
    on('o-back', () => show(app.game ? 'pause' : 'menu'));
    on('h-back', () => show(app.game ? (app.backTo === 'playing' ? 'playing' : 'pause') : 'menu'));
    on('o-reset', () => { app.settings.keys = K.defaults(); saveSettings(); buildKeys($('o-keys'), true); buildKeys($('h-keys'), false); });
    on('p-resume', () => show('playing'));
    on('p-save', () => toast(saveNow() ? t('msg.saved') : t('noSpace')));
    on('p-settings', () => show('settings'));
    on('p-help', () => { app.backTo = 'pause'; show('help'); });
    on('p-menu', () => toMenu());
    on('panel-close', () => closePanel());
    on('btn-pause', () => show('pause'));
    on('btn-inv', () => (app.overlay === 'panel' ? closePanel() : openPanel()));
    on('shop-sell', () => { if (app.panelPick >= 0 && Npc.sell(app.game, app.panelPick)) { if (!app.game.inv[app.panelPick]) app.panelPick = -1; buildPanel(); buildHotbar(); } });
    on('shop-heal', () => { if (Npc.heal(app.game)) { SB.Audio.play({ type: 'drink' }); buildPanel(); } });
    $('o-theme').addEventListener('change', (e) => { app.settings.theme = e.target.value; applyTheme(); saveSettings(); });
    $('o-lang').addEventListener('change', (e) => { app.settings.lang = e.target.value; saveSettings(); applyLang(); });
    $('o-volume').addEventListener('input', (e) => { app.settings.volume = +e.target.value; saveSettings(); });
    $('o-music').addEventListener('input', (e) => { app.settings.music = +e.target.value; saveSettings(); });
    $('o-zoom').addEventListener('input', (e) => { app.settings.zoom = +e.target.value; saveSettings(); });
    $('o-fps').addEventListener('change', (e) => { app.settings.fps = e.target.checked; saveSettings(); });
    $('n-seed').addEventListener('keydown', (e) => { if (e.key === 'Enter') newWorld(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
    root.addEventListener('beforeunload', () => saveNow());
  }

  // ---------- цикл ----------

  let acc = 0;
  let prev = 0;
  let fpsT = 0;
  let fpsN = 0;

  // шаги игры без отрисовки (для законов страницы)
  app.step = function (n, inp) {
    for (let i = 0; i < n; i++) Gm.step(app.game, inp || {});
    handleEvents();
    updateHud();
  };

  function frame(now) {
    root.requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - prev) / 1000 || 0);
    prev = now;
    app.frames++;
    if (!app.game || !app.render.ready) return;
    const live = app.overlay === 'playing' || app.overlay === 'panel';
    if (live) {
      acc += dt;
      let steps = 0;
      const inp = input();
      while (acc >= Gm.STEP && steps < 6) {
        Gm.step(app.game, inp);
        acc -= Gm.STEP;
        steps++;
      }
      if (steps === 6) acc = 0;
      handleEvents();
      updateHud();
      if (now - app.lastSave > AUTOSAVE * 1000) saveNow();
      SB.Audio.ambience(ambienceMode());
    }
    const aim = app.mouse.inside && app.overlay === 'playing' ? app.render.toWorld(app.mouse.x, app.mouse.y) : null;
    app.render.frame(live ? dt : 0, now / 1000, aim);
    fpsT += dt;
    fpsN++;
    if (fpsT >= 0.5) {
      if (app.settings.fps) $('fps').textContent = t('fps', { n: Math.round(fpsN / fpsT) });
      fpsT = 0;
      fpsN = 0;
    }
  }

  async function boot() {
    applyTheme();
    applyLang();
    saveSettings();
    bindUi();
    bindInput();
    show('menu');
    if (!root.PIXI) { fail(); return; }
    try {
      app.render = SB.Render.create(root.PIXI, $('game'));
      await app.render.init();
    } catch (e) {
      fail(e);
      return;
    }
    app.ready = true;
    root.requestAnimationFrame(frame);
  }

  function fail(e) {
    const el = $('error');
    el.hidden = false;
    el.textContent = t('webglError') + (e ? ': ' + e.message : '');
  }

  app.newWorld = newWorld;
  app.loadSlot = loadSlot;
  app.saveNow = saveNow;
  app.toMenu = toMenu;
  app.show = show;
  app.openPanel = openPanel;
  app.closePanel = closePanel;
  app.selectSlot = selectSlot;
  app.talk = talk;
  app.store = () => store;

  boot();
})(typeof self !== 'undefined' ? self : this);

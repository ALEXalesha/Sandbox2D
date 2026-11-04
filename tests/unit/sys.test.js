// Законы логики окна: клавиши без повторов, настройки и миры в хранилище, перевод полный.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core, sys } = require('./helpers');
const K = sys('keys');
const S = sys('settings');
const I = sys('i18n');
const D = core('data');

function fakeStore(opts = {}) {
  const m = new Map();
  return {
    m,
    getItem: (k) => { if (opts.readFail) throw new Error('нет'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => { if (opts.full) throw new Error('полно'); m.set(k, String(v)); },
    removeItem: (k) => { if (opts.removeFail) throw new Error('нет'); m.delete(k); },
  };
}

test('переназначение: клавиша не может стоять на двух действиях', () => {
  const b = K.defaults();
  assert.equal(K.rebind(b, 'jump', 1, 'KeyA'), true);
  assert.equal(b.left[0], null);
  assert.equal(b.jump[1], 'KeyA');
  assert.equal(K.actionFor(b, 'KeyA'), 'jump');
  assert.equal(K.rebind(b, 'jump', 2, 'KeyQ'), false);
  assert.equal(K.rebind(b, 'fly', 0, 'KeyQ'), false);
  assert.equal(K.rebind(b, 'jump', 0, 'Escape'), false, 'Esc занят паузой');
  assert.equal(K.rebind(b, 'jump', 0, 'Digit3'), false, 'цифры заняты панелью');
  assert.equal(K.actionFor(b, 'KeyZ'), null);
  const all = K.ACTIONS.flatMap((a) => b[a]).filter(Boolean);
  assert.equal(new Set(all).size, all.length);
});

test('клавиши из хранилища: мусор и повторы отброшены, пустые действия получают свои', () => {
  const s = K.sanitize({ left: ['KeyD', 'KeyD'], right: ['KeyD'], jump: 5, inventory: ['bad key', null], talk: ['KeyF', 'Escape'] });
  assert.deepEqual(s.left, ['KeyD', null]);
  assert.deepEqual(s.right, [null, 'ArrowRight'], 'D уже занята, своя вторая клавиша');
  assert.deepEqual(s.jump, ['Space', 'KeyW']);
  assert.deepEqual(s.talk, ['KeyF', null]);
  assert.deepEqual(K.sanitize(null), K.defaults());
  const all = K.ACTIONS.flatMap((a) => s[a]).filter(Boolean);
  assert.equal(new Set(all).size, all.length);
});

test('цифры выбирают ячейку, имена клавиш понятны', () => {
  assert.equal(K.slotFor('Digit1'), 0);
  assert.equal(K.slotFor('Digit0'), 9);
  assert.equal(K.slotFor('Numpad5'), -1, 'цифровой блок свободен для действий');
  assert.equal(K.slotFor('KeyA'), -1);
  assert.equal(K.slotFor(undefined), -1);
  assert.equal(K.keyName('KeyA'), 'A');
  assert.equal(K.keyName('Space', 'ru'), 'Пробел');
  assert.equal(K.keyName('Space', 'en'), 'Space');
  assert.equal(K.keyName('Digit7'), '7');
  assert.equal(K.keyName('Numpad7'), 'Num 7');
  assert.equal(K.keyName(null), '-');
  assert.equal(K.keyName('F5'), 'F5');
});

test('настройки: разумные значения, мусор заменяется, туда-обратно через хранилище', () => {
  const store = fakeStore();
  assert.deepEqual(S.load(store), S.defaults());
  const s = S.defaults();
  s.theme = 'warm';
  s.lang = 'en';
  s.volume = 0.25;
  s.zoom = 3;
  K.rebind(s.keys, 'jump', 0, 'KeyK');
  assert.equal(S.save(store, s), true);
  assert.deepEqual(S.load(store), s);
  const bad = S.sanitize({ theme: 'pink', lang: 'de', volume: 5, music: NaN, zoom: 9, fps: 1 });
  assert.deepEqual([bad.theme, bad.lang, bad.volume, bad.music, bad.zoom, bad.fps], ['glass', 'ru', 1, 0.4, 2, false]);
  assert.equal(S.sanitize({ zoom: 2.6 }).zoom, 2.5);
  store.m.set(S.PREFIX + 'settings', '{не json');
  assert.deepEqual(S.load(store), S.defaults());
  assert.equal(S.THEMES.length, 5);
});

test('хранилище сломано или полно - игра не падает', () => {
  assert.deepEqual(S.load(fakeStore({ readFail: true })), S.defaults());
  assert.equal(S.save(fakeStore({ full: true }), S.defaults()), false);
  assert.equal(S.saveWorld(fakeStore({ full: true }), 0, 'x', { name: 'a' }), false);
  assert.equal(S.deleteWorld(fakeStore({ removeFail: true }), 0), false);
  assert.deepEqual(S.listWorlds(fakeStore({ readFail: true })).map((w) => w.empty), [true, true, true]);
});

test('ячейки миров: сохранить, список, загрузить, удалить, свободная ячейка', () => {
  const store = fakeStore();
  assert.equal(S.freeSlot(store), 0);
  assert.equal(S.saveWorld(store, 0, 'DATA0', { name: 'Первый', day: 2, seed: 5, savedAt: 100 }), true);
  assert.equal(S.saveWorld(store, 1, 'DATA1', { name: 'Второй', day: 0, seed: 6, savedAt: 50 }), true);
  assert.equal(S.saveWorld(store, 7, 'X', { name: 'нет' }), false);
  assert.equal(S.freeSlot(store), 2);
  S.saveWorld(store, 2, 'DATA2', { name: 'Третий', savedAt: 200 });
  assert.equal(S.freeSlot(store), -1, 'всё занято');
  const list = S.listWorlds(store);
  assert.deepEqual(list.map((w) => w.name), ['Первый', 'Второй', 'Третий']);
  assert.equal(list[0].day, 2);
  assert.equal(S.loadWorld(store, 1), 'DATA1');
  assert.equal(S.loadWorld(store, -1), null);
  assert.equal(S.deleteWorld(store, 1), true);
  assert.equal(S.deleteWorld(store, 9), false);
  assert.equal(S.listWorlds(store)[1].empty, true);
  store.m.set(S.PREFIX + 'meta.1', '{plохо');
  store.m.set(S.PREFIX + 'world.1', 'x');
  assert.equal(S.listWorlds(store)[1].empty, true);
});

test('перевод: у всех ключей оба языка, у всех предметов и врагов есть имена', () => {
  const ru = Object.keys(I.DICT.ru).sort();
  const en = Object.keys(I.DICT.en).sort();
  assert.deepEqual(ru, en);
  for (const id of Object.keys(D.ITEMS)) {
    assert.ok(I.DICT.ru['item.' + id], 'ru ' + id);
    assert.ok(I.DICT.en['item.' + id], 'en ' + id);
  }
  for (const k of ['drop', 'shade', 'mole', 'imp', 'colossus', 'heart']) assert.ok(I.DICT.en['mob.' + k]);
  for (const a of K.ACTIONS) assert.ok(I.DICT.ru['act.' + a]);
  for (const k of ['trader', 'healer']) assert.ok(I.DICT.en['msg.arrive.' + k] && I.DICT.ru['npc.' + k + '.hello']);
  for (const k of ['colossus', 'heart']) assert.ok(I.DICT.ru['msg.boss.' + k] && I.DICT.en['msg.bossDown.' + k]);
  assert.equal(I.t('en', 'day', { n: 3 }), 'Day 3');
  assert.equal(I.t('de', 'play'), 'Играть');
  assert.equal(I.t('en', 'nothing.here'), 'nothing.here');
  assert.equal(I.t('ru', 'day', {}), 'День {n}');
  for (const lang of ['ru', 'en']) for (const v of Object.values(I.DICT[lang])) assert.ok(!/[—–]/.test(v), 'только дефис: ' + v);
});

test('цифры цифрового блока можно назначить, и они работают как действие, а не как ячейка', () => {
  const b = K.defaults();
  assert.equal(K.rebind(b, 'inventory', 0, 'Numpad5'), true);
  assert.equal(K.actionFor(b, 'Numpad5'), 'inventory');
  assert.equal(K.slotFor('Numpad5'), -1);
});

test('все три ячейки заняты - свободной нет, старый мир молча не затирается', () => {
  const store = fakeStore();
  for (let i = 0; i < 3; i++) S.saveWorld(store, i, 'D', { name: 'w' + i, savedAt: i });
  assert.equal(S.freeSlot(store), -1);
});

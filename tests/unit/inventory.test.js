// Законы инвентаря и крафта: крафт не создаёт предметов из ничего, неудачный крафт ничего не
// меняет, стопки не переполняются.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core, flatWorld } = require('./helpers');
const Inv = core('inventory');
const D = core('data');
const N = core('noise');
const Wd = core('world');
const { B } = D;

const snapshot = (inv) => JSON.stringify(inv);
function totals(inv) {
  const t = {};
  for (const s of inv) if (s) t[s.id] = (t[s.id] || 0) + s.n;
  return t;
}

test('положить и забрать: стопки до предела, лишнее возвращается', () => {
  const inv = Inv.create(3);
  assert.equal(Inv.add(inv, 'dirt', 3500), 3500 - 999 * 3);
  assert.equal(Inv.count(inv, 'dirt'), 2997);
  assert.equal(Inv.add(inv, 'dirt', 5), 5);
  assert.equal(Inv.add(inv, 'unknown', 5), 5);
  assert.equal(Inv.add(inv, 'dirt', 0), 0);
  assert.equal(Inv.remove(inv, 'dirt', 3000), false);
  assert.equal(Inv.count(inv, 'dirt'), 2997, 'неудачное «забрать» ничего не меняет');
  assert.equal(Inv.remove(inv, 'dirt', 1000), true);
  assert.equal(Inv.count(inv, 'dirt'), 1997);
  const part = Inv.create(3);
  Inv.add(part, 'stone', 500);
  assert.equal(Inv.add(part, 'stone', 800), 0);
  assert.deepEqual(part.slice(0, 2), [{ id: 'stone', n: 999 }, { id: 'stone', n: 301 }], 'стопка дополняется до предела');
  const tools = Inv.create(2);
  assert.equal(Inv.add(tools, 'iron_pick', 3), 1, 'инструменты по одному');
});

test('перестановка и объединение ячеек', () => {
  const inv = Inv.create(4);
  inv[0] = { id: 'stone', n: 900 };
  inv[1] = { id: 'stone', n: 500 };
  inv[2] = { id: 'iron_pick', n: 1 };
  assert.equal(Inv.swap(inv, 1, 0), true);
  assert.deepEqual(inv[0], { id: 'stone', n: 999 });
  assert.deepEqual(inv[1], { id: 'stone', n: 401 });
  Inv.swap(inv, 2, 3);
  assert.equal(inv[2], null);
  assert.equal(inv[3].id, 'iron_pick');
  assert.equal(Inv.swap(inv, 0, 0), false);
  assert.equal(Inv.swap(inv, 0, 9), false);
  inv[0] = { id: 'stone', n: 400 };
  inv[1] = { id: 'stone', n: 1 };
  Inv.swap(inv, 1, 0);
  assert.equal(inv[1], null, 'пустая ячейка после слияния');
  assert.equal(Inv.removeAt(inv, 0, 5), 5);
  assert.equal(Inv.removeAt(inv, 2, 5), 0);
  inv[2] = { id: 'torch', n: 2 };
  assert.equal(Inv.removeAt(inv, 2, 5), 2);
  assert.equal(inv[2], null);
});

test('крафт: ингредиенты списываются ровно по рецепту, результат прибавляется', () => {
  const inv = Inv.create();
  Inv.add(inv, 'wood', 10);
  const planks = D.RECIPES.find((r) => r.out === 'planks');
  assert.equal(Inv.craft(inv, planks, new Set()), true);
  assert.equal(Inv.count(inv, 'wood'), 9);
  assert.equal(Inv.count(inv, 'planks'), 4);
});

test('крафт без станции или без ингредиентов ничего не меняет', () => {
  const inv = Inv.create();
  Inv.add(inv, 'iron_bar', 4);
  const anvil = D.RECIPES.find((r) => r.out === 'anvil');
  const before = snapshot(inv);
  assert.equal(Inv.craft(inv, anvil, new Set(['workbench'])), false);
  assert.equal(snapshot(inv), before);
  Inv.add(inv, 'iron_bar', 1);
  assert.equal(Inv.craft(inv, anvil, new Set()), false, 'нет верстака');
  assert.equal(Inv.craft(inv, anvil, new Set(['workbench'])), true);
});

test('нет места под результат - крафт не идёт; место, что освободится, считается', () => {
  const inv = Inv.create(2);
  inv[0] = { id: 'wood', n: 1 };
  inv[1] = { id: 'dirt', n: 5 };
  const planks = D.RECIPES.find((r) => r.out === 'planks');
  assert.equal(Inv.canCraft(inv, planks, new Set()), true, 'дерево уйдёт целиком - ячейка освободится');
  inv[0] = { id: 'wood', n: 2 };
  const before = snapshot(inv);
  assert.equal(Inv.craft(inv, planks, new Set()), false);
  assert.equal(snapshot(inv), before);
});

test('закон: случайные крафты не создают предметов из ничего', () => {
  const all = new Set(['workbench', 'furnace', 'anvil']);
  for (let seed = 1; seed <= 30; seed++) {
    const r = N.rng(seed);
    const inv = Inv.create();
    const ids = Object.keys(D.ITEMS);
    for (let i = 0; i < 25; i++) Inv.add(inv, ids[Math.floor(r() * ids.length)], 1 + Math.floor(r() * 60));
    const expect = totals(inv);
    for (let i = 0; i < 200; i++) {
      const rec = D.RECIPES[Math.floor(r() * D.RECIPES.length)];
      const ok = Inv.craft(inv, rec, r() < 0.8 ? all : new Set());
      if (ok) {
        for (const [id, n] of rec.ins) expect[id] = (expect[id] || 0) - n;
        expect[rec.out] = (expect[rec.out] || 0) + rec.n;
      }
    }
    const got = totals(inv);
    for (const id of new Set([...Object.keys(expect), ...Object.keys(got)])) {
      assert.equal(got[id] || 0, expect[id] || 0, `${id}, зерно ${seed}`);
    }
  }
});

test('станции рядом: верстак, печь и наковальня находятся в радиусе', () => {
  const world = flatWorld(32, 32, 20);
  Wd.set(world, 10, 19, B.WORKBENCH);
  Wd.set(world, 13, 19, B.FURNACE);
  Wd.set(world, 25, 19, B.ANVIL);
  const near = Inv.stationsNear(world, 11, 18);
  assert.ok(near.has('workbench') && near.has('furnace'));
  assert.ok(!near.has('anvil'));
  const inv = Inv.create();
  Inv.add(inv, 'wood', 1);
  assert.deepEqual(Inv.available(inv, near).map((r) => r.out), ['planks', 'torch']);
});

test('инвентарь из сохранения: чужие предметы и плохие числа отброшены', () => {
  const inv = Inv.sanitize([{ id: 'dirt', n: 5000 }, { id: 'nope', n: 1 }, null, { id: 'torch', n: -3 }, 'x', { id: 'stone', n: '7' }], 6);
  assert.deepEqual(inv, [{ id: 'dirt', n: 999 }, null, null, null, null, { id: 'stone', n: 7 }]);
  assert.equal(Inv.sanitize('bad').length, Inv.SIZE);
});

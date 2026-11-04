// Законы сохранения: туда-обратно без потерь, хранятся только изменённые чанки,
// испорченная строка не ломает игру.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core } = require('./helpers');
const S = core('save');
const Wd = core('world');
const Inv = core('inventory');
const N = core('noise');
const { B } = core('data');

function state(world) {
  const inv = Inv.create();
  Inv.add(inv, 'torch', 25);
  Inv.add(inv, 'iron_pick', 1);
  return {
    name: 'Тест', world, time: 0.4, day: 3,
    player: { x: 100.5, y: 60.25, hp: 80, maxHp: 120, shards: 1 },
    inv, residents: [{ kind: 'trader', home: [100, 70] }], bosses: { colossus: true, heart: false }, stats: { kills: 7, coins: 0 },
  };
}

test('RLE и base64 туда-обратно на случайных байтах', () => {
  const r = N.rng(9);
  for (let n = 0; n < 50; n++) {
    const len = Math.floor(r() * 700);
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = r() < 0.7 ? 3 : Math.floor(r() * 256);
    assert.deepEqual(S.unb64(S.b64(bytes)), bytes);
    assert.deepEqual(S.unrle(S.rle(bytes), len), bytes);
  }
  const long = new Uint8Array(3000).fill(9);
  long[1500] = 4;
  assert.deepEqual(S.unrle(S.rle(long), 3000), long, 'ряд длиннее 255');
  assert.ok(S.rle(long).every((v, i) => i % 2 === 1 || v > 0), 'длина ряда не обнуляется');
  assert.equal(S.unb64('abc'), null);
  assert.equal(S.unb64('ab!d'), null);
  assert.equal(S.unb64('abпd'), null);
  assert.equal(S.unb64(5), null);
  assert.equal(S.unrle(Uint8Array.from([1]), 1), null);
  assert.equal(S.unrle(Uint8Array.from([0, 5]), 1), null);
  assert.equal(S.unrle(Uint8Array.from([5, 5]), 3), null);
  assert.equal(S.unrle(Uint8Array.from([2, 5]), 3), null);
});

test('сохранение туда-обратно: мир, игрок, инвентарь и прочее те же', () => {
  const world = Wd.create(4242, 320, 192);
  const r = N.rng(1);
  for (let i = 0; i < 500; i++) {
    const x = Math.floor(r() * 320);
    const y = Math.floor(r() * 192);
    Wd.set(world, x, y, [B.AIR, B.PLANKS, B.TORCH, B.BRICK][i % 4]);
    if (i % 3 === 0) Wd.setWall(world, x, y, 3);
    if (i % 5 === 0) Wd.setLiq(world, x, y, 0x15);
  }
  const st = state(world);
  const text = S.serialize(st);
  const back = S.deserialize(text);
  assert.ok(back);
  assert.equal(back.name, 'Тест');
  assert.equal(back.world.seed, 4242);
  assert.deepEqual(back.player, st.player);
  assert.deepEqual(back.inv, st.inv);
  assert.deepEqual(back.residents, st.residents);
  assert.deepEqual(back.bosses, { colossus: true, heart: false });
  assert.deepEqual(back.stats, { kills: 7, coins: 0 });
  assert.equal(back.time, 0.4);
  assert.equal(back.day, 3);
  for (let x = 0; x < 320; x++) for (let y = 0; y < 192; y++) {
    assert.equal(Wd.get(back.world, x, y), Wd.get(world, x, y));
    assert.equal(Wd.getWall(back.world, x, y), Wd.getWall(world, x, y));
    assert.equal(Wd.getLiq(back.world, x, y), Wd.getLiq(world, x, y));
  }
  assert.equal(S.serialize(back), text, 'второй круг даёт ту же строку');
});

test('в сохранении только изменённые чанки', () => {
  const world = Wd.create(1, 320, 192);
  for (let cx = 0; cx < world.cw; cx++) Wd.chunk(world, cx, 2);
  Wd.set(world, 5, 5, B.PLANKS);
  const o = JSON.parse(S.serialize(state(world)));
  assert.deepEqual(Object.keys(o.chunks), ['0,0']);
});

test('испорченное сохранение - null, а не падение', () => {
  const good = S.serialize(state(Wd.create(3, 128, 128)));
  const o = JSON.parse(good);
  const bad = [
    'не json', 'null', '{}', JSON.stringify({ ...o, v: 99 }), JSON.stringify({ ...o, W: 'x' }),
    JSON.stringify({ ...o, seed: 1.5 }), JSON.stringify({ ...o, chunks: { 'a,b': 'AAAA' } }),
    JSON.stringify({ ...o, chunks: { '99,0': 'AAAA' } }), JSON.stringify({ ...o, chunks: { '0,0': '!!!!' } }),
    JSON.stringify({ ...o, chunks: { '0,0': 'AAAA' } }),
  ];
  for (const b of bad) assert.equal(S.deserialize(b), null, b.slice(0, 60));
  // мусор в полях заменяется разумным
  const odd = S.deserialize(JSON.stringify({ ...o, name: 5, time: 7, player: 'x', residents: [1, { kind: 'trader', home: [1, 2] }], bosses: 3, stats: null, chunks: null }));
  assert.equal(odd.name, '');
  assert.equal(odd.time, 0.1);
  assert.equal(odd.player.hp, 100);
  assert.deepEqual(odd.residents, [{ kind: 'trader', home: [1, 2] }]);
  assert.deepEqual(odd.bosses, {});
  assert.deepEqual(odd.stats, { kills: 0, coins: 0 });
  const noRes = S.deserialize(JSON.stringify({ ...o, residents: 'x' }));
  assert.deepEqual(noRes.residents, []);
});

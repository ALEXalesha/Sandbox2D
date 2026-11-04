// Справочник мира: блоки, стены, предметы, рецепты. Только данные и простые выборки.
//
// Клетка мира хранит три байта: блок (передний слой), стена (задний слой) и жидкость
// (тип << 4 | объём 0..8). Блок с solid=false не мешает ходить (факел, ствол, листва).
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SB = root.SB || {}).Data = api;
})(typeof self !== 'undefined' ? self : this, function () {
/* c8 ignore stop */
  'use strict';

  const B = Object.freeze({
    AIR: 0, DIRT: 1, GRASS: 2, STONE: 3, SAND: 4, SNOW: 5, ICE: 6, LOG: 7, LEAVES: 8, PLANKS: 9,
    COPPER: 10, IRON: 11, CRYSTAL: 12, MAGMITE: 13, ASH: 14, OBSIDIAN: 15, BEDROCK: 16,
    TORCH: 17, CAMPFIRE: 18, WORKBENCH: 19, FURNACE: 20, ANVIL: 21, CACTUS: 22, BRICK: 23,
    GLASS: 24, PINE: 25, SANDSTONE: 26,
  });

  // hard - секунды копания при силе кирки 1; tier - нужная сила кирки; light - свечение 0..15;
  // opaque - гасит свет как камень; support: 'any' - нужен сосед или стена, 'floor' - нужен
  // твёрдый блок снизу; drop - предмет, который выпадает; station - станция крафта.
  const BLOCKS = [];
  function def(id, key, o) {
    BLOCKS[id] = Object.freeze(Object.assign({
      id, key, solid: true, opaque: true, hard: 1, tier: 0, light: 0, drop: key, support: null, station: null,
      colors: ['#888888', '#777777', '#999999'],
    }, o));
  }
  def(B.AIR, 'air', { solid: false, opaque: false, hard: 0, drop: null, colors: ['#000000'] });
  def(B.DIRT, 'dirt', { hard: 0.35, colors: ['#8a5a36', '#7a4e2e', '#99673f'] });
  def(B.GRASS, 'grass', { hard: 0.4, drop: 'dirt', colors: ['#8a5a36', '#4f9e3a', '#62b84a'] });
  def(B.STONE, 'stone', { hard: 0.9, tier: 1, colors: ['#7c7f86', '#6b6e75', '#8d9098'] });
  def(B.SAND, 'sand', { hard: 0.35, colors: ['#e2c784', '#d4b872', '#eed596'] });
  def(B.SNOW, 'snow', { hard: 0.3, colors: ['#eef4fb', '#dbe5f0', '#ffffff'] });
  def(B.ICE, 'ice', { hard: 0.6, tier: 1, opaque: false, colors: ['#a9d6f2', '#93c6e8', '#c4e6fa'] });
  def(B.LOG, 'log', { solid: false, opaque: false, hard: 0.6, drop: 'wood', colors: ['#6b4628', '#5a3a20', '#7d5432'] });
  def(B.LEAVES, 'leaves', { solid: false, opaque: false, hard: 0.1, drop: null, colors: ['#3f8f3a', '#347a30', '#4fa548'] });
  def(B.PLANKS, 'planks', { hard: 0.5, colors: ['#b5824c', '#a3733f', '#c4925a'] });
  def(B.COPPER, 'copper_ore', { hard: 1.1, tier: 1, colors: ['#7c7f86', '#d9824a', '#f0a066'] });
  def(B.IRON, 'iron_ore', { hard: 1.4, tier: 2, colors: ['#7c7f86', '#c9b7a6', '#e6d8ca'] });
  def(B.CRYSTAL, 'crystal_ore', { hard: 1.8, tier: 3, light: 7, colors: ['#4c4f66', '#62d0ff', '#b8f0ff'] });
  def(B.MAGMITE, 'magmite_ore', { hard: 2.2, tier: 4, light: 6, colors: ['#3a2a2a', '#ff6a2a', '#ffb347'] });
  def(B.ASH, 'ash', { hard: 0.5, tier: 1, colors: ['#4a4446', '#3d3739', '#5a5356'] });
  def(B.OBSIDIAN, 'obsidian', { hard: 2.5, tier: 3, colors: ['#22182e', '#2f2240', '#46345e'] });
  def(B.BEDROCK, 'bedrock', { hard: Infinity, tier: 99, drop: null, colors: ['#1c1c20', '#26262c', '#141418'] });
  def(B.TORCH, 'torch', { solid: false, opaque: false, hard: 0, light: 14, support: 'any', colors: ['#ffcc55'] });
  def(B.CAMPFIRE, 'campfire', { solid: false, opaque: false, hard: 0.3, light: 15, support: 'floor', colors: ['#ff8a2a'] });
  def(B.WORKBENCH, 'workbench', { solid: false, opaque: false, hard: 0.3, support: 'floor', station: 'workbench', colors: ['#a3733f'] });
  def(B.FURNACE, 'furnace', { solid: false, opaque: false, hard: 0.6, light: 7, support: 'floor', station: 'furnace', colors: ['#6b6e75'] });
  def(B.ANVIL, 'anvil', { solid: false, opaque: false, hard: 0.6, support: 'floor', station: 'anvil', colors: ['#4a4e58'] });
  def(B.CACTUS, 'cactus', { solid: false, opaque: false, hard: 0.3, support: 'floor', colors: ['#3c9b4a', '#2f8040', '#56b862'] });
  def(B.BRICK, 'brick', { hard: 1.0, tier: 1, colors: ['#9a9da5', '#7c7f86', '#b0b3ba'] });
  def(B.GLASS, 'glass', { hard: 0.2, opaque: false, colors: ['#cfeaf5', '#b8dcea', '#eaf8ff'] });
  def(B.PINE, 'pine', { solid: false, opaque: false, hard: 0.1, drop: null, colors: ['#2a6a4a', '#225a3e', '#357a58'] });
  def(B.SANDSTONE, 'sandstone', { hard: 0.8, tier: 1, colors: ['#c9a96a', '#b8985a', '#d8b97a'] });
  Object.freeze(BLOCKS);

  const W = Object.freeze({ NONE: 0, DIRT: 1, STONE: 2, PLANK: 3, BRICK: 4, SANDSTONE: 5, ASH: 6 });
  const WALLS = Object.freeze([
    null,
    { id: 1, key: 'dirt_wall', color: '#4a3020' },
    { id: 2, key: 'stone_wall', color: '#3d3f45' },
    { id: 3, key: 'plank_wall', color: '#6e4e2c' },
    { id: 4, key: 'brick_wall', color: '#55585f' },
    { id: 5, key: 'sandstone_wall', color: '#7a6440' },
    { id: 6, key: 'ash_wall', color: '#2c2628' },
  ]);

  // жидкости: тип в старших 4 битах байта
  const L = Object.freeze({ NONE: 0, WATER: 1, LAVA: 2, FULL: 8 });

  const ITEMS = {};
  function item(id, o) { ITEMS[id] = Object.freeze(Object.assign({ id, stack: 999, kind: 'material' }, o)); }
  for (const b of BLOCKS) {
    if (b.id === B.AIR || b.drop !== b.key) continue;
    item(b.key, { kind: 'block', place: b.id });
  }
  item('wood', {});
  for (const w of WALLS) if (w) item(w.key, { kind: 'wall', wall: w.id });
  const TOOLS = [
    ['stone', 1, 1.0, 5], ['copper', 2, 1.35, 8], ['iron', 3, 1.75, 12], ['crystal', 4, 2.3, 17], ['magmite', 5, 3.0, 24],
  ];
  for (const [m, tier, power, dmg] of TOOLS) {
    item(m + '_pick', { kind: 'pick', stack: 1, tier, power, damage: Math.round(dmg * 0.6) });
  }
  const SWORDS = [['wood', 7], ['copper', 11], ['iron', 15], ['crystal', 22], ['magmite', 32]];
  for (const [m, dmg] of SWORDS) item(m + '_sword', { kind: 'sword', stack: 1, damage: dmg });
  for (const id of ['copper_bar', 'iron_bar', 'crystal', 'magmite_bar', 'goo', 'shadow_dust', 'ember', 'coin']) item(id, {});
  item('potion', { kind: 'use', stack: 30, heal: 50 });
  item('life_shard', { kind: 'use', stack: 10, maxHp: 20 });
  item('beacon', { kind: 'summon', stack: 5, boss: 'colossus' });
  item('obsidian_key', { kind: 'summon', stack: 5, boss: 'heart' });
  Object.freeze(ITEMS);

  // station: null - в руках; иначе блок-станция должна быть рядом
  const RECIPES = Object.freeze([
    { out: 'planks', n: 4, ins: [['wood', 1]], station: null },
    { out: 'torch', n: 3, ins: [['wood', 1]], station: null },
    { out: 'workbench', n: 1, ins: [['planks', 10]], station: null },
    { out: 'plank_wall', n: 4, ins: [['planks', 1]], station: 'workbench' },
    { out: 'wood_sword', n: 1, ins: [['planks', 7]], station: 'workbench' },
    { out: 'campfire', n: 1, ins: [['wood', 8], ['torch', 2]], station: 'workbench' },
    { out: 'furnace', n: 1, ins: [['stone', 20], ['wood', 4], ['torch', 3]], station: 'workbench' },
    { out: 'stone_wall', n: 4, ins: [['stone', 1]], station: 'workbench' },
    { out: 'dirt_wall', n: 4, ins: [['dirt', 1]], station: 'workbench' },
    { out: 'sandstone_wall', n: 4, ins: [['sandstone', 1]], station: 'workbench' },
    { out: 'brick', n: 1, ins: [['stone', 2]], station: 'furnace' },
    { out: 'brick_wall', n: 4, ins: [['brick', 1]], station: 'workbench' },
    { out: 'glass', n: 1, ins: [['sand', 2]], station: 'furnace' },
    { out: 'copper_bar', n: 1, ins: [['copper_ore', 3]], station: 'furnace' },
    { out: 'iron_bar', n: 1, ins: [['iron_ore', 3]], station: 'furnace' },
    { out: 'crystal', n: 1, ins: [['crystal_ore', 2]], station: 'furnace' },
    { out: 'magmite_bar', n: 1, ins: [['magmite_ore', 3], ['obsidian', 1]], station: 'furnace' },
    { out: 'anvil', n: 1, ins: [['iron_bar', 5]], station: 'workbench' },
    { out: 'copper_pick', n: 1, ins: [['copper_bar', 8], ['wood', 3]], station: 'workbench' },
    { out: 'copper_sword', n: 1, ins: [['copper_bar', 7]], station: 'workbench' },
    { out: 'iron_pick', n: 1, ins: [['iron_bar', 10], ['wood', 3]], station: 'anvil' },
    { out: 'iron_sword', n: 1, ins: [['iron_bar', 8]], station: 'anvil' },
    { out: 'crystal_pick', n: 1, ins: [['crystal', 12], ['iron_bar', 4]], station: 'anvil' },
    { out: 'crystal_sword', n: 1, ins: [['crystal', 10], ['iron_bar', 3]], station: 'anvil' },
    { out: 'magmite_pick', n: 1, ins: [['magmite_bar', 12], ['crystal', 4]], station: 'anvil' },
    { out: 'magmite_sword', n: 1, ins: [['magmite_bar', 10], ['crystal', 3]], station: 'anvil' },
    { out: 'potion', n: 1, ins: [['goo', 2], ['glass', 1]], station: 'workbench' },
    { out: 'beacon', n: 1, ins: [['crystal', 5], ['shadow_dust', 5], ['torch', 10]], station: 'anvil' },
    { out: 'obsidian_key', n: 1, ins: [['obsidian', 10], ['magmite_bar', 3], ['ember', 5]], station: 'anvil' },
  ]);

  const solid = new Uint8Array(256);
  const opaque = new Uint8Array(256);
  const emit = new Uint8Array(256);
  for (const b of BLOCKS) {
    solid[b.id] = b.solid ? 1 : 0;
    opaque[b.id] = b.opaque ? 1 : 0;
    emit[b.id] = b.light;
  }
  // за краем мира - коренная порода
  solid[255] = 1;
  opaque[255] = 1;

  function blockOfItem(id) {
    const it = ITEMS[id];
    if (!it || it.kind !== 'block') return -1;
    return it.place;
  }

  return { B, BLOCKS, W, WALLS, L, ITEMS, RECIPES, solid, opaque, emit, blockOfItem };
});

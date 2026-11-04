// Перевод: русский и английский. t(lang, key, params) - строка с подстановкой {name}.
// Имена предметов - item.<id>, врагов - mob.<kind>, жителей - npc.<kind>.
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SB = root.SB || {}).I18n = api;
})(typeof self !== 'undefined' ? self : this, function () {
/* c8 ignore stop */
  'use strict';
  const RU = {
    title: 'Sandbox2D',
    tagline: 'Песочница, где свет решает: враги рождаются только в темноте',
    fan: 'Фан-игра. Графика, звуки и мир нарисованы и написаны кодом.',
    newWorld: 'Новый мир', load: 'Загрузить', settings: 'Настройки', controls: 'Управление', back: 'Назад',
    play: 'Играть', create: 'Создать', delete: 'Удалить', empty: 'Пусто', worldName: 'Имя мира', seed: 'Зерно',
    size: 'Размер', small: 'Малый', normal: 'Обычный', randomSeed: 'Случайное', defaultName: 'Мой мир',
    day: 'День {n}', saved: 'Сохранено', slotsFull: 'Все три ячейки заняты: удалите мир, чтобы создать новый', savedAt: 'сохранён {date}', noSpace: 'Нет места для сохранения',
    pause: 'Пауза', resume: 'Продолжить', save: 'Сохранить', toMenu: 'В меню',
    theme: 'Тема', lang: 'Язык', volume: 'Звуки', music: 'Фон', zoom: 'Масштаб', keys: 'Клавиши', showFps: 'Показывать FPS',
    'theme.glass': 'Стекло', 'theme.formal': 'Строгая', 'theme.light': 'Светлая', 'theme.night': 'Ночная', 'theme.warm': 'Тёплая',
    pressKey: 'Нажмите клавишу…', resetKeys: 'Сбросить клавиши',
    'act.left': 'Влево', 'act.right': 'Вправо', 'act.jump': 'Прыжок / плыть', 'act.inventory': 'Инвентарь и крафт',
    'act.talk': 'Говорить с жителем', 'act.zoomIn': 'Приблизить', 'act.zoomOut': 'Отдалить', 'act.map': 'Подсказки',
    helpMouse: 'Левая кнопка мыши - использовать предмет в руке: кирка копает (по пустой клетке со стеной - снимает стену), меч бьёт, блок ставится. Правая кнопка - говорить с жителем.',
    helpHotbar: 'Цифры 1-0 и колесо мыши - выбор ячейки. Esc - пауза.',
    helpLight: 'Враги рождаются только в темноте и горят в ярком свете. Ставьте факелы и костры.',
    helpResidents: 'Костёр зовёт жителей: торговца (когда у вас 10 монет) и знахарку (после 10 побед).',
    helpBosses: 'Маяк ночью зовёт Ночного колосса, обсидиановый ключ в аду - Сердце магмы.',
    inventory: 'Инвентарь', crafting: 'Крафт', craft: 'Создать', need: 'Нужно', station: 'Станция', hand: 'в руках',
    'station.workbench': 'верстак', 'station.furnace': 'печь', 'station.anvil': 'наковальня',
    shop: 'Лавка', buy: 'Купить', sell: 'Продать выбранное', heal: 'Вылечить ({n} мон.)', coins: 'Монеты: {n}',
    close: 'Закрыть', hp: 'Здоровье', dead: 'Вы погибли', respawnIn: 'Возрождение через {n}', lostCoins: 'Потеряно монет: {n}',
    'msg.hard': 'Кирка слишком слабая', 'msg.day': 'Маяк работает только ночью', 'msg.notHell': 'Ключ откроется только в аду',
    'msg.busy': 'Босс уже здесь', 'msg.arrive.trader': 'Торговец поселился у костра', 'msg.arrive.healer': 'Знахарка поселилась у костра', 'msg.leave': 'Житель ушёл: костёр погас',
    'msg.bossDown.colossus': 'Ночной колосс повержен!', 'msg.bossDown.heart': 'Сердце магмы разбито!', 'msg.boss.colossus': 'Ночной колосс пробудился!', 'msg.boss.heart': 'Сердце магмы пробудилось!', 'msg.full': 'Больше осколков не нужно',
    'msg.saved': 'Мир сохранён', 'msg.craft': 'Создано: {item}', 'msg.noRoom': 'Инвентарь полон',
    'mob.drop': 'Капля', 'mob.shade': 'Тень', 'mob.mole': 'Крот', 'mob.imp': 'Бес', 'mob.colossus': 'Ночной колосс', 'mob.heart': 'Сердце магмы',
    'npc.trader': 'Торговец', 'npc.healer': 'Знахарка',
    'npc.trader.hello': 'Свет у костра - лучшая защита. Что возьмёте?', 'npc.healer.hello': 'Раны лечу, зелья варю. Только не гасите костёр.',
    'item.dirt': 'Земля', 'item.stone': 'Камень', 'item.sand': 'Песок', 'item.snow': 'Снег', 'item.ice': 'Лёд', 'item.wood': 'Дерево',
    'item.planks': 'Доски', 'item.copper_ore': 'Медная руда', 'item.iron_ore': 'Железная руда', 'item.crystal_ore': 'Кристаллическая руда',
    'item.magmite_ore': 'Магмит', 'item.ash': 'Пепел', 'item.obsidian': 'Обсидиан', 'item.torch': 'Факел', 'item.campfire': 'Костёр',
    'item.workbench': 'Верстак', 'item.furnace': 'Печь', 'item.anvil': 'Наковальня', 'item.cactus': 'Кактус', 'item.brick': 'Кирпич',
    'item.glass': 'Стекло', 'item.sandstone': 'Песчаник',
    'item.dirt_wall': 'Земляная стена', 'item.stone_wall': 'Каменная стена', 'item.plank_wall': 'Дощатая стена',
    'item.brick_wall': 'Кирпичная стена', 'item.sandstone_wall': 'Стена из песчаника', 'item.ash_wall': 'Пепельная стена',
    'item.stone_pick': 'Каменная кирка', 'item.copper_pick': 'Медная кирка', 'item.iron_pick': 'Железная кирка',
    'item.crystal_pick': 'Кристальная кирка', 'item.magmite_pick': 'Магмитовая кирка',
    'item.wood_sword': 'Деревянный меч', 'item.copper_sword': 'Медный меч', 'item.iron_sword': 'Железный меч',
    'item.crystal_sword': 'Кристальный меч', 'item.magmite_sword': 'Магмитовый меч',
    'item.copper_bar': 'Медный слиток', 'item.iron_bar': 'Железный слиток', 'item.crystal': 'Кристалл', 'item.magmite_bar': 'Магмитовый слиток',
    'item.goo': 'Слизь', 'item.shadow_dust': 'Теневая пыль', 'item.ember': 'Уголёк', 'item.coin': 'Монета',
    'item.potion': 'Лечебное зелье', 'item.life_shard': 'Осколок жизни', 'item.beacon': 'Звёздный маяк', 'item.obsidian_key': 'Обсидиановый ключ',
    'desc.pick': 'Сила {tier}, урон {damage}', 'desc.sword': 'Урон {damage}', 'desc.potion': '+50 здоровья, раз в 20 с',
    'desc.life_shard': '+20 к здоровью (до трёх)', 'desc.beacon': 'Зовёт Ночного колосса (только ночью)', 'desc.obsidian_key': 'Зовёт Сердце магмы (только в аду)',
    'desc.torch': 'Свет 14: здесь враги не родятся', 'desc.campfire': 'Свет 15, зовёт жителей',
    'light.safe': 'Свет {n}: здесь враги не родятся', 'light.dark': 'Темно ({n}): здесь рождаются враги',
    fps: 'FPS {n}', loading: 'Загрузка…', webglError: 'Не удалось запустить WebGL',
  };
  const EN = {
    title: 'Sandbox2D',
    tagline: 'A sandbox where light rules: monsters are born only in the dark',
    fan: 'A fan game. Graphics, sounds and the world are drawn and written in code.',
    newWorld: 'New world', load: 'Load', settings: 'Settings', controls: 'Controls', back: 'Back',
    play: 'Play', create: 'Create', delete: 'Delete', empty: 'Empty', worldName: 'World name', seed: 'Seed',
    size: 'Size', small: 'Small', normal: 'Normal', randomSeed: 'Random', defaultName: 'My world',
    day: 'Day {n}', saved: 'Saved', slotsFull: 'All three slots are taken: delete a world to create a new one', savedAt: 'saved {date}', noSpace: 'No room to save',
    pause: 'Paused', resume: 'Resume', save: 'Save', toMenu: 'To menu',
    theme: 'Theme', lang: 'Language', volume: 'Sounds', music: 'Ambience', zoom: 'Zoom', keys: 'Keys', showFps: 'Show FPS',
    'theme.glass': 'Glass', 'theme.formal': 'Formal', 'theme.light': 'Light', 'theme.night': 'Night', 'theme.warm': 'Warm',
    pressKey: 'Press a key…', resetKeys: 'Reset keys',
    'act.left': 'Left', 'act.right': 'Right', 'act.jump': 'Jump / swim', 'act.inventory': 'Inventory and crafting',
    'act.talk': 'Talk to a resident', 'act.zoomIn': 'Zoom in', 'act.zoomOut': 'Zoom out', 'act.map': 'Hints',
    helpMouse: 'Left mouse button uses the item in hand: a pickaxe digs (on an empty cell with a wall it removes the wall), a sword strikes, a block is placed. Right button talks to a resident.',
    helpHotbar: 'Keys 1-0 and the mouse wheel pick a slot. Esc pauses.',
    helpLight: 'Monsters are born only in the dark and burn in bright light. Place torches and campfires.',
    helpResidents: 'A campfire calls residents: the trader (once you have 10 coins) and the healer (after 10 victories).',
    helpBosses: 'A beacon at night calls the Night Colossus, the obsidian key in the underworld calls the Magma Heart.',
    inventory: 'Inventory', crafting: 'Crafting', craft: 'Craft', need: 'Needs', station: 'Station', hand: 'by hand',
    'station.workbench': 'workbench', 'station.furnace': 'furnace', 'station.anvil': 'anvil',
    shop: 'Shop', buy: 'Buy', sell: 'Sell selected', heal: 'Heal ({n} coins)', coins: 'Coins: {n}',
    close: 'Close', hp: 'Health', dead: 'You died', respawnIn: 'Respawn in {n}', lostCoins: 'Coins lost: {n}',
    'msg.hard': 'The pickaxe is too weak', 'msg.day': 'The beacon works only at night', 'msg.notHell': 'The key opens only in the underworld',
    'msg.busy': 'A boss is already here', 'msg.arrive.trader': 'The trader settled by the campfire', 'msg.arrive.healer': 'The healer settled by the campfire', 'msg.leave': 'A resident left: the campfire is gone',
    'msg.bossDown.colossus': 'The Night Colossus is defeated!', 'msg.bossDown.heart': 'The Magma Heart is shattered!', 'msg.boss.colossus': 'The Night Colossus has awoken!', 'msg.boss.heart': 'The Magma Heart has awoken!', 'msg.full': 'No more shards needed',
    'msg.saved': 'World saved', 'msg.craft': 'Crafted: {item}', 'msg.noRoom': 'Inventory is full',
    'mob.drop': 'Drop', 'mob.shade': 'Shade', 'mob.mole': 'Mole', 'mob.imp': 'Imp', 'mob.colossus': 'Night Colossus', 'mob.heart': 'Magma Heart',
    'npc.trader': 'Trader', 'npc.healer': 'Healer',
    'npc.trader.hello': 'Firelight is the best guard. What will it be?', 'npc.healer.hello': 'I mend wounds and brew potions. Just keep the fire lit.',
    'item.dirt': 'Dirt', 'item.stone': 'Stone', 'item.sand': 'Sand', 'item.snow': 'Snow', 'item.ice': 'Ice', 'item.wood': 'Wood',
    'item.planks': 'Planks', 'item.copper_ore': 'Copper ore', 'item.iron_ore': 'Iron ore', 'item.crystal_ore': 'Crystal ore',
    'item.magmite_ore': 'Magmite', 'item.ash': 'Ash', 'item.obsidian': 'Obsidian', 'item.torch': 'Torch', 'item.campfire': 'Campfire',
    'item.workbench': 'Workbench', 'item.furnace': 'Furnace', 'item.anvil': 'Anvil', 'item.cactus': 'Cactus', 'item.brick': 'Brick',
    'item.glass': 'Glass', 'item.sandstone': 'Sandstone',
    'item.dirt_wall': 'Dirt wall', 'item.stone_wall': 'Stone wall', 'item.plank_wall': 'Plank wall',
    'item.brick_wall': 'Brick wall', 'item.sandstone_wall': 'Sandstone wall', 'item.ash_wall': 'Ash wall',
    'item.stone_pick': 'Stone pickaxe', 'item.copper_pick': 'Copper pickaxe', 'item.iron_pick': 'Iron pickaxe',
    'item.crystal_pick': 'Crystal pickaxe', 'item.magmite_pick': 'Magmite pickaxe',
    'item.wood_sword': 'Wooden sword', 'item.copper_sword': 'Copper sword', 'item.iron_sword': 'Iron sword',
    'item.crystal_sword': 'Crystal sword', 'item.magmite_sword': 'Magmite sword',
    'item.copper_bar': 'Copper bar', 'item.iron_bar': 'Iron bar', 'item.crystal': 'Crystal', 'item.magmite_bar': 'Magmite bar',
    'item.goo': 'Goo', 'item.shadow_dust': 'Shadow dust', 'item.ember': 'Ember', 'item.coin': 'Coin',
    'item.potion': 'Healing potion', 'item.life_shard': 'Life shard', 'item.beacon': 'Star beacon', 'item.obsidian_key': 'Obsidian key',
    'desc.pick': 'Power {tier}, damage {damage}', 'desc.sword': 'Damage {damage}', 'desc.potion': '+50 health, once per 20 s',
    'desc.life_shard': '+20 max health (up to three)', 'desc.beacon': 'Calls the Night Colossus (night only)', 'desc.obsidian_key': 'Calls the Magma Heart (underworld only)',
    'desc.torch': 'Light 14: no monsters are born here', 'desc.campfire': 'Light 15, calls residents',
    'light.safe': 'Light {n}: no monsters are born here', 'light.dark': 'Dark ({n}): monsters are born here',
    fps: 'FPS {n}', loading: 'Loading…', webglError: 'Could not start WebGL',
  };
  const DICT = Object.freeze({ ru: RU, en: EN });

  function t(lang, key, params) {
    const d = DICT[lang] || RU;
    let s = d[key];
    if (s === undefined) s = RU[key] === undefined ? key : RU[key];
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (params[k] === undefined ? m : String(params[k])));
    return s;
  }

  return { DICT, t };
});

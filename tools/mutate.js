// Проверка проверок: каждое правило игры по очереди ломается в копии web/, и законы обязаны
// это заметить («мутант убит»). Исходники не меняются.
//
//   node tools/mutate.js                всё (законы ядра - секунды, законы страницы - дольше)
//   SB_MUT=liquid node tools/mutate.js  только мутанты, чьё имя подходит под регулярку
//   SB_MUT_WEB=0 node tools/mutate.js   без мутантов страницы (нужен только node)
//
// Сначала должны быть зелёными сами законы (npm test, npm run test:web): иначе упавший закон
// «убьёт» мутанта и без поломки - поэтому первый прогон идёт на целой копии.
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const WEB = path.join(ROOT, 'web');

// file - путь в web/, from -> to (from встречается ровно один раз), law - главный закон,
// который ловит мутанта; unit - имена законов node:test (регулярка), web - законы Playwright (-g)
const MUTANTS = [
  // генерация и чанки
  { id: 'gen-random', law: 'генерация детерминирована', file: 'js/core/gen.js', from: 'if (N.fbm2(seed + 61, x, y, 2, 6) > 0.7) fg = B.MAGMITE;', to: 'if (Math.random() > 0.7) fg = B.MAGMITE;', unit: 'генерация детерминирована' },
  { id: 'gen-local-column', law: 'чанки на границах совпадают', file: 'js/core/gen.js', from: 'const col = column(seed, x, d);', to: 'const col = column(seed, i, d);', unit: 'чанки на границах' },
  { id: 'gen-plants-shift', law: 'чанки на границах совпадают', file: 'js/core/gen.js', from: 'const plants = plantsAll.slice(i, i + 7);', to: 'const plants = plantsAll.slice(i + 1, i + 8);', unit: 'чанки на границах' },
  { id: 'gen-order', law: 'чанк не зависит от порядка', file: 'js/core/world.js', from: '      c = G.genChunk(world.seed, cx, cy, world.dims);', to: '      c = G.genChunk(world.seed + world.chunks.size, cx, cy, world.dims);', unit: 'не зависит от порядка' },
  { id: 'gen-floating-lakes', law: 'озёра лежат у дна пещер', file: 'js/core/gen.js', from: 'const floor = !caveAt(seed, x, y + 1, depth + 1) || !caveAt(seed, x, y + 2, depth + 2);', to: 'const floor = true;', unit: 'озёра лежат' },
  // сохранение
  { id: 'save-no-walls', law: 'сохранение туда-обратно', file: 'js/core/save.js', from: '    all.set(c.wall, CELLS);\n', to: '', unit: 'сохранение туда-обратно' },
  { id: 'save-rle-long', law: 'сохранение туда-обратно', file: 'js/core/save.js', from: 'n < 255) n++;', to: 'n < 256) n++;', unit: 'RLE и base64|сохранение туда-обратно' },
  { id: 'save-trusts-input', law: 'испорченное сохранение', file: 'js/core/save.js', from: '      if (!data || !validCells(data)) return null;\n      const c = Wd.chunk', to: '      if (!data) continue;\n      const c = Wd.chunk', unit: 'испорченное сохранение' },
  // жидкости
  { id: 'liquid-rest-twice', law: 'объём жидкости сохраняется', file: 'js/core/liquid.js', from: 'if (rest > 0) { mine++; rest--; }', to: 'if (rest > 0) { mine++; }', unit: 'закон объёма|растекается' },
  { id: 'liquid-consumed-uncounted', law: 'объём жидкости сохраняется', file: 'js/core/liquid.js', from: '      st.consumed.water += take;\n', to: '', unit: 'закон объёма|обсидиан' },
  { id: 'liquid-evap-uncounted', law: 'объём жидкости сохраняется', file: 'js/core/liquid.js', from: '          st.evaporated.water += a;\n', to: '', unit: 'испаряется|закон объёма' },
  { id: 'liquid-leaks-out', law: 'жидкость не утекает из области', file: 'js/core/liquid.js', from: 'if (x < r.x0 || y < r.y0 || x >= r.x0 + r.w || y >= r.y0 + r.h) return false;\n    return', to: 'if (false) return false;\n    return', unit: 'испаряется' },
  // свет
  { id: 'light-no-falloff', law: 'свет не выходит за радиус', file: 'js/core/light.js', from: 'cost[k] = D.opaque[fg] ? 3 : liq ? 2 : 1;', to: 'cost[k] = D.opaque[fg] ? 3 : liq ? 2 : 0;', unit: 'факел в темноте' },
  { id: 'light-over-max', law: 'свет в пределах 0..15', file: 'js/core/light.js', from: 'if (lv > block[k]) block[k] = Math.min(MAX, lv);', to: 'if (lv > block[k]) block[k] = lv;', unit: 'добавочный источник' },
  { id: 'light-sky-through-walls', law: 'стена закрывает небо', file: 'js/core/world.js', from: 'while (y < world.H && D.opaque[get(world, x, y)] === 0 && getWall(world, x, y) === 0) y++;', to: 'while (y < world.H && D.opaque[get(world, x, y)] === 0) y++;', unit: 'небо: днём' },
  // физика
  { id: 'physics-feet-unchecked', law: 'игрок не застревает в блоках', file: 'js/core/physics.js', from: '    const y2 = Math.floor(y + h - EPS);\n    for (let cy = y1;', to: '    const y2 = Math.floor(y + h * 0.5);\n    for (let cy = y1;', unit: 'не застревает|стоит на ней' },
  { id: 'physics-no-unstick', law: 'игрок не застревает в блоках', file: 'js/core/physics.js', from: '    if (!overlaps(world, b)) return false;\n    const ox', to: '    return false;\n    const ox', unit: 'выталкивается' },
  { id: 'physics-no-step', law: 'ступень в одну клетку проходится', file: 'js/core/physics.js', from: 'moveX(world, b, b.vx * dt, wasGround);', to: 'moveX(world, b, b.vx * dt, false);', unit: 'ступень в одну' },
  // крафт и инвентарь
  { id: 'craft-free', law: 'крафт не создаёт из ничего', file: 'js/core/inventory.js', from: '    for (const [id, n] of recipe.ins) remove(inv, id, n);\n    add(', to: '    add(', unit: 'не создают предметов из ничего|ровно по рецепту' },
  { id: 'craft-no-station', law: 'крафт не создаёт из ничего', file: 'js/core/inventory.js', from: "    if (recipe.station && !(stations && stations.has(recipe.station))) return false;\n", to: '', unit: 'без станции' },
  { id: 'progress-deadlock', law: 'с начальных вещей достижимо всё', file: 'js/core/data.js', from: "{ out: 'copper_pick', n: 1, ins: [['copper_bar', 8], ['wood', 3]], station: 'workbench' },", to: "{ out: 'copper_pick', n: 1, ins: [['copper_bar', 8], ['wood', 3]], station: 'anvil' },", unit: 'закон прогресса' },
  { id: 'stack-overflow', law: 'стопки не переполняются', file: 'js/core/inventory.js', from: 'const put = Math.min(max - s.n, left);', to: 'const put = left;', unit: 'положить и забрать' },
  // копать и строить
  { id: 'dig-two-items', law: 'копание даёт ровно один предмет', file: 'js/core/game.js', from: 'if (def.drop) dropItem(game, def.drop, 1, x + 0.5, y + 0.5);', to: 'if (def.drop) dropItem(game, def.drop, 2, x + 0.5, y + 0.5);', unit: 'копание любого блока|ровно один предмет' },
  { id: 'place-into-player', law: 'блок не ставится в игрока', file: 'js/core/game.js', from: "    if (def.solid && blocksBody(game, x, y)) return 'body';\n", to: '', unit: 'стройка|не оказывается внутри' },
  { id: 'weak-pick-digs', law: 'слабая кирка не берёт руду', file: 'js/core/game.js', from: 'if (!wall && def.tier > pick.tier) {', to: 'if (false) {', unit: 'слабая кирка' },
  // свет решает
  { id: 'spawn-in-light', law: 'враги рождаются только в темноте', file: 'js/core/mobs.js', from: '    if (!Lt.has(game.light, x, y) || Lt.at(game.light, x, y) >= DARK) return null;\n', to: '    if (!Lt.has(game.light, x, y)) return null;\n', unit: 'закон света' },
  { id: 'no-burn', law: 'враг горит в ярком свете', file: 'js/core/mobs.js', from: '          m.hp -= 12 * dt;\n', to: '', unit: 'горит в ярком' },
  { id: 'colossus-by-day', law: 'боссы зовутся по правилу', file: 'js/core/game.js', from: "    if (it.boss === 'colossus' && !T.isNight(game.time)) return 'day';\n", to: '', unit: 'боссы: колосс' },
  // жители и торговля
  { id: 'trade-free', law: 'торговля честная', file: 'js/core/npc.js', from: "    Inv.remove(game.inv, 'coin', offer.price);\n    Inv.add(game.inv, offer.id, offer.n);", to: '    Inv.add(game.inv, offer.id, offer.n);', unit: 'торговля честная' },
  { id: 'residents-at-night', law: 'жители приходят днём', file: 'js/core/npc.js', from: '    if (T.isNight(game.time)) return null;\n', to: '', unit: 'жители:' },
  // сутки, клавиши, настройки
  { id: 'night-bright', law: 'ночь тёмная', file: 'js/core/time.js', from: '    if (x < 0.92) return NIGHT_LIGHT;', to: '    if (x < 0.92) return 1;', unit: 'яркость: день' },
  { id: 'rebind-duplicate', law: 'клавиша не стоит на двух действиях', file: 'js/sys/keys.js', from: '    for (const a of ACTIONS) bindings[a] = bindings[a].map((c) => (c === code ? null : c));\n', to: '', unit: 'переназначение' },
  { id: 'settings-bad-theme', law: 'настройки из хранилища разумные', file: 'js/sys/settings.js', from: 'theme: THEMES.includes(s.theme) ? s.theme : d.theme,', to: 'theme: s.theme || d.theme,', unit: 'настройки: разумные' },
  // находки независимого обзора
  { id: 'trade-profit', law: 'торговля без прибыли из воздуха', file: 'js/core/npc.js', from: 'copper_bar: 3, iron_bar: 5,', to: 'copper_bar: 3, iron_bar: 7,', unit: 'закон торговли' },
  { id: 'dead-uses-items', law: 'мёртвый не пользуется предметами', file: 'js/core/game.js', from: 'if (!s || p.dead > 0) return null;', to: 'if (!s) return null;', unit: 'мёртвый игрок' },
  { id: 'save-loses-drops', law: 'предметы на земле переживают сохранение', file: 'js/core/game.js', from: '    for (const d of s.drops) dropItem(game, d.id, d.n, d.x + 0.3, d.y + 0.3);\n', to: '', unit: 'предметы на земле' },
  { id: 'save-alive-dead', law: 'смерть в сохранении ведёт к возрождению', file: 'js/core/game.js', from: '    if (s.player.hp <= 0) respawn(game);\n', to: '', unit: 'во время смерти' },
  { id: 'save-unknown-block', law: 'сохранение с неизвестным блоком отвергается', file: 'js/core/save.js', from: '      if (!data || !validCells(data)) return null;', to: '      if (!data) return null;', unit: 'неизвестным блоком' },
  { id: 'spawn-outside-light-map', law: 'враги рождаются только в темноте', file: 'js/core/mobs.js', from: 'if (!Lt.has(game.light, x, y) || Lt.at(game.light, x, y) >= DARK) return null;', to: 'if (Lt.at(game.light, x, y) >= DARK) return null;', unit: 'за краем карты света' },
  { id: 'numpad-is-slot', law: 'клавиша работает как назначенное действие', file: 'js/sys/keys.js', from: "const m = /^Digit(\\d)$/.exec(code || '');", to: "const m = /^(?:Digit|Numpad)(\\d)$/.exec(code || '');", unit: 'цифрового блока' },
  { id: 'slots-overwrite', law: 'старый мир молча не затирается', file: 'js/sys/settings.js', from: '    return empty ? empty.slot : -1;', to: '    return empty ? empty.slot : 0;', unit: 'ячейки заняты|ячейки миров' },
  { id: 'web-click-wrong-zoom', law: 'клик попадает в клетку под указателем', file: 'js/ui/render.js', from: '      const s = TS * (r.zoomUsed || r.zoom);\n      return [(sx', to: '      const s = TS * r.zoom;\n      return [(sx', web: 'большое окно' },
  // страница
  { id: 'web-theme-sticks', law: 'темы переключаются', file: 'js/ui/app.js', from: "    if (th === 'glass') document.documentElement.removeAttribute('data-theme');\n    else", to: '    ', web: 'снимки тем' },
  { id: 'web-pointer-lock', law: 'захвата указателя нет', file: 'js/ui/app.js', from: "      if (e.button === 0) {\n        app.mouse.left = true;", to: "      if (e.button === 0) {\n        view.requestPointerLock();\n        app.mouse.left = true;", web: 'мышь:' },
  { id: 'web-narrow-overflow', law: 'узкое окно без прокрутки', file: 'css/style.css', from: '.screen { pointer-events: auto; width: min(420px, 100%);', to: '.screen { pointer-events: auto; width: 420px;', web: 'узкое окно' },
];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name);
    const d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function runUnit(dir, pattern) {
  const files = fs.readdirSync(path.join(ROOT, 'tests', 'unit')).filter((f) => f.endsWith('.test.js')).map((f) => path.join('tests', 'unit', f));
  const args = ['--test', '--test-concurrency=1'];
  if (pattern) args.push('--test-name-pattern=' + pattern);
  const r = spawnSync(process.execPath, [...args, ...files], { cwd: ROOT, env: { ...process.env, SB_WEB: dir }, encoding: 'utf8' });
  const pass = /# pass (\d+)/.exec(r.stdout || '');
  return { ok: r.status === 0, passed: pass ? +pass[1] : 0 };
}

function runWeb(dir, pattern) {
  const cli = path.join(ROOT, 'node_modules', '@playwright', 'test', 'cli.js');
  const args = [cli, 'test', '--workers=1', '--reporter=line'];
  if (pattern) args.push('-g', pattern);
  const r = spawnSync(process.execPath, args, { cwd: ROOT, env: { ...process.env, SB_WEB: dir }, encoding: 'utf8' });
  return { ok: r.status === 0 };
}

function main() {
  const only = process.env.SB_MUT ? new RegExp(process.env.SB_MUT) : null;
  const web = process.env.SB_MUT_WEB !== '0';
  const list = MUTANTS.filter((m) => (!only || only.test(m.id)) && (web || !m.web));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox2d-mut-'));
  copyDir(WEB, dir);
  const clean = runUnit(dir, null);
  if (!clean.ok) { console.error('законы красные на целой копии - сначала npm test'); process.exit(2); }
  console.log(`целая копия: ${clean.passed} законов зелёные`);
  const webLaws = [...new Set(list.filter((m) => m.web).map((m) => m.web))];
  if (webLaws.length && !runWeb(dir, webLaws.join('|')).ok) { console.error('законы страницы красные на целой копии'); process.exit(2); }
  if (webLaws.length) console.log(`целая копия: законы страницы (${webLaws.join(', ')}) зелёные`);
  const survived = [];
  const t0 = Date.now();
  for (const m of list) {
    const file = path.join(dir, m.file);
    const orig = fs.readFileSync(file, 'utf8');
    const n = orig.split(m.from).length - 1;
    if (n !== 1) { console.log(`?? ${m.id}: строка встречается ${n} раз - мутант устарел`); survived.push(m.id); continue; }
    fs.writeFileSync(file, orig.replace(m.from, m.to));
    const r = m.unit ? runUnit(dir, m.unit) : runWeb(dir, m.web);
    const ran = m.unit ? r.passed : 1;
    fs.writeFileSync(file, orig);
    const killed = !r.ok && ran >= 0;
    console.log(`${killed ? 'убит  ' : 'ЖИВ   '} ${m.id.padEnd(26)} закон: ${m.law}`);
    if (!killed) survived.push(m.id);
  }
  fs.rmSync(dir, { recursive: true, force: true });
  const laws = new Set(list.map((m) => m.law));
  console.log(`\nмутантов: ${list.length}, убито: ${list.length - survived.length}, законов под проверкой: ${laws.size}, ${Math.round((Date.now() - t0) / 1000)} с`);
  if (survived.length) { console.log('выжили:', survived.join(', ')); process.exit(1); }
}

if (require.main === module) main();
module.exports = { MUTANTS };

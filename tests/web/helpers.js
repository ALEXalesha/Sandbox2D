// Общее для законов страницы. SB_WEB - папка web/ под проверкой.
'use strict';
const path = require('path');
const { pathToFileURL } = require('url');

const WEB = process.env.SB_WEB || path.join(__dirname, '..', '..', 'web');
const pageUrl = (query = '') => pathToFileURL(path.join(WEB, 'index.html')).href + query;

// Открыть игру. Захват указателя заменён счётчиком; любой запрос не к локальному файлу -
// ошибка; ошибки страницы собираются в список.
async function open(page, opts = {}) {
  const errors = [];
  await page.addInitScript((settings) => {
    window.__pointerLockCalls = 0;
    Element.prototype.requestPointerLock = function () { window.__pointerLockCalls++; };
    if (settings && !sessionStorage.getItem('sb-test-init')) {
      localStorage.setItem('sandbox2d:settings', JSON.stringify(settings));
      sessionStorage.setItem('sb-test-init', '1');
    }
  }, opts.settings || null);
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) errors.push('network: ' + r.url()); });
  await page.goto(pageUrl(opts.query || ''));
  await page.waitForFunction(() => window.Sandbox2D && window.Sandbox2D.ready && window.Sandbox2D.overlay === 'menu');
  return errors;
}

// новый мир без врагов (по умолчанию), игрок стоит на земле
async function play(page, opts = {}) {
  await page.evaluate((o) => {
    window.Sandbox2D.newWorld({ name: o.name || 'Тест', seed: o.seed === undefined ? 7 : o.seed, size: o.size || 'small', spawning: !!o.spawning });
    window.Sandbox2D.step(30);
  }, opts);
  await page.waitForTimeout(200);
}

const sb = (page, fn, arg) => page.evaluate(fn, arg);

// экранная точка центра клетки мира
const cellOnScreen = (page, x, y) => page.evaluate(([x, y]) => window.Sandbox2D.render.toScreen(x + 0.5, y + 0.5), [x, y]);

const player = (page) => page.evaluate(() => {
  const p = window.Sandbox2D.game.player;
  return { x: p.body.x, y: p.body.y, w: p.body.w, h: p.body.h, onGround: p.body.onGround, hp: p.hp, slot: p.slot };
});

module.exports = { WEB, pageUrl, open, play, sb, cellOnScreen, player };

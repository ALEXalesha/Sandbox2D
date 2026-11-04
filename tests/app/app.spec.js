// Законы приложения на Electron: в законах окно невидимо (SB_TEST=1), без фокуса и за экраном.
// Запуск: npm run test:app (на Linux без экрана - через xvfb-run).
'use strict';
const { test, expect, _electron: electron } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RUNS = 20;

async function launch(dataDir) {
  const args = [ROOT, '--user-data-dir=' + dataDir, '--js-flags=--expose-gc', '--enable-precise-memory-info'];
  if (process.getuid && process.getuid() === 0) args.push('--no-sandbox');
  const app = await electron.launch({ executablePath: require('electron'), args, env: { ...process.env, SB_TEST: '1' } });
  const win = await app.firstWindow();
  await win.addInitScript(() => { Element.prototype.requestPointerLock = function () { window.__pointerLockCalls = (window.__pointerLockCalls || 0) + 1; }; });
  await win.waitForFunction(() => window.Sandbox2D && window.Sandbox2D.ready && window.Sandbox2D.overlay === 'menu');
  return { app, win };
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sandbox2d-app-'));

test('окно невидимо и без фокуса, игра открыта, захвата указателя нет', async () => {
  const { app, win } = await launch(tmp());
  try {
    const w = await app.evaluate(({ BrowserWindow }) => {
      const b = BrowserWindow.getAllWindows()[0];
      return { visible: b.isVisible(), focusable: b.isFocusable(), bounds: b.getBounds(), menu: b.isMenuBarVisible() };
    });
    expect(w.visible).toBe(false);
    expect(w.focusable).toBe(false);
    expect(w.bounds.x).toBeLessThan(-10000);
    expect(w.menu).toBe(false);
    expect(await win.title()).toBe('Sandbox2D');
    await win.evaluate(() => window.Sandbox2D.newWorld({ name: 'Э', seed: 3, size: 'small', spawning: false }));
    await win.mouse.click(400, 300);
    await win.waitForTimeout(300);
    expect(await win.evaluate(() => window.Sandbox2D.overlay)).toBe('playing');
    expect(await win.evaluate(() => document.pointerLockElement)).toBeNull();
    expect(await win.evaluate(() => window.__pointerLockCalls || 0)).toBe(0);
  } finally {
    await app.close();
  }
});

test('мир и настройки переживают перезапуск приложения', async () => {
  const dir = tmp();
  const first = await launch(dir);
  await first.win.evaluate(() => {
    const A = window.Sandbox2D;
    A.settings.theme = 'warm';
    A.settings.lang = 'en';
    window.SB.Settings.save(localStorage, A.settings);
    A.newWorld({ name: 'Остров', seed: 99, size: 'small', spawning: false });
    window.SB.Inv.add(A.game.inv, 'coin', 17);
    A.saveNow();
  });
  await first.app.close();
  const second = await launch(dir);
  try {
    await expect(second.win.locator('#m-new')).toHaveText('New world');
    expect(await second.win.evaluate(() => document.documentElement.dataset.theme)).toBe('warm');
    const slot = await second.win.evaluate(() => window.SB.Settings.listWorlds(localStorage).find((w) => w.name === 'Остров').slot);
    await second.win.evaluate((s) => window.Sandbox2D.loadSlot(s), slot);
    expect(await second.win.evaluate(() => window.SB.Inv.count(window.Sandbox2D.game.inv, 'coin'))).toBe(17);
    expect(await second.win.evaluate(() => window.Sandbox2D.game.world.seed)).toBe(99);
  } finally {
    await second.app.close();
  }
});

test('ссылки и переходы не уводят со страницы игры', async () => {
  const { app, win } = await launch(tmp());
  try {
    const before = win.url();
    await win.evaluate(() => { location.href = 'https://example.com/'; });
    await win.waitForTimeout(500);
    expect(win.url()).toBe(before);
    expect(await win.evaluate(() => window.open('https://example.com/') === null)).toBe(true);
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)).toBe(1);
  } finally {
    await app.close();
  }
});

test(`${RUNS} запусков мира подряд: память не растёт`, async () => {
  const { app, win } = await launch(tmp());
  const heap = [];
  const rss = [];
  try {
    for (let i = 0; i < RUNS; i++) {
      await win.evaluate((i) => {
        const A = window.Sandbox2D;
        A.newWorld({ name: 'Run ' + i, seed: 1000 + i, size: 'small', spawning: true });
        A.game.time = 0.7;
        A.game.player.invuln = 1e9;
        for (let k = 0; k < 40; k++) A.step(15, { right: k % 4 < 2, left: k % 4 >= 2, jump: k % 3 === 0 });
      }, i);
      await win.waitForTimeout(400);
      await win.evaluate(() => window.Sandbox2D.toMenu());
      await win.waitForTimeout(150);
      const m = await win.evaluate(() => { if (window.gc) { window.gc(); window.gc(); } return performance.memory ? performance.memory.usedJSHeapSize : 0; });
      heap.push(m / 1048576);
      const metrics = await app.evaluate(({ app: a }) => a.getAppMetrics().reduce((s, p) => s + p.memory.workingSetSize, 0));
      rss.push(metrics / 1024);
    }
    const warm = heap.slice(3, 6).reduce((a, b) => a + b) / 3;
    const late = heap.slice(-3).reduce((a, b) => a + b) / 3;
    console.log('куча, МБ:', heap.map((v) => v.toFixed(1)).join(' '));
    console.log('процессы, МБ:', rss.map((v) => v.toFixed(0)).join(' '));
    expect(late).toBeLessThan(warm * 1.25 + 8);
    const rWarm = rss.slice(3, 6).reduce((a, b) => a + b) / 3;
    const rLate = rss.slice(-3).reduce((a, b) => a + b) / 3;
    expect(rLate).toBeLessThan(rWarm * 1.35 + 60);
    expect(await win.evaluate(() => window.__pointerLockCalls || 0)).toBe(0);
  } finally {
    await app.close();
  }
});

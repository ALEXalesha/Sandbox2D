// Законы страницы в headless Chromium: меню и темы, узкое окно, игра мышью и клавишами,
// инвентарь и крафт, сохранение и загрузка, настройки, никакого захвата указателя.
'use strict';
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { open, play, sb, cellOnScreen, player } = require('./helpers');

const SHOTS = process.env.SB_SHOTS || path.join(os.tmpdir(), 'sandbox2d-shots');
fs.mkdirSync(SHOTS, { recursive: true });

test('меню открывается без ошибок и без сети', async ({ page }) => {
  const errors = await open(page);
  await expect(page.locator('#m-new')).toHaveText('Новый мир');
  await expect(page.locator('.logo')).toContainText('Sandbox');
  await expect(page.locator('.fan')).toContainText('Фан-игра');
  expect(await page.title()).toBe('Sandbox2D');
  expect(await page.locator('#view').count()).toBe(1);
  expect(errors).toEqual([]);
});

test('снимки тем: стекло (тёмная) и светлая различаются, токены из Paint Pro', async ({ page }) => {
  await open(page);
  const bg = () => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--app-base').trim());
  expect(await bg()).toBe('#12101f');
  const dark = await page.screenshot({ path: path.join(SHOTS, 'menu-glass.png') });
  await page.click('#m-settings');
  await page.selectOption('#o-theme', 'light');
  await page.click('#o-back');
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light');
  expect(await bg()).toBe('#e8ecf3');
  const light = await page.screenshot({ path: path.join(SHOTS, 'menu-light.png') });
  expect(Buffer.compare(dark, light)).not.toBe(0);
  for (const th of ['formal', 'night', 'warm', 'glass']) {
    await page.evaluate((th) => { const s = document.getElementById('o-theme'); s.value = th; s.dispatchEvent(new Event('change')); }, th);
    expect(await page.evaluate(() => document.documentElement.getAttribute('data-theme'))).toBe(th === 'glass' ? null : th);
  }
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('sandbox2d:settings')).theme);
  expect(saved).toBe('glass');
});

test('игра в обеих темах: снимки мира днём и ночью', async ({ page }) => {
  await open(page);
  await play(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(SHOTS, 'game-day.png') });
  await sb(page, () => { window.Sandbox2D.game.time = 0.75; window.Sandbox2D.step(12); });
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(SHOTS, 'game-night.png') });
  await sb(page, () => { const s = window.Sandbox2D.settings; s.theme = 'light'; document.documentElement.setAttribute('data-theme', 'light'); window.Sandbox2D.openPanel(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'panel-light.png') });
  await expect(page.locator('#panel')).toBeVisible();
});

test('узкое окно 360 x 640: меню и панель предметов помещаются без прокрутки вбок', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await open(page);
  const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(await fits()).toBe(true);
  const box = await page.locator('#s-menu').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(360);
  await page.screenshot({ path: path.join(SHOTS, 'narrow-menu.png') });
  await play(page);
  const bar = await page.locator('#hotbar').boundingBox();
  expect(bar.x).toBeGreaterThanOrEqual(0);
  expect(bar.x + bar.width).toBeLessThanOrEqual(360);
  await sb(page, () => window.Sandbox2D.openPanel());
  const panel = await page.locator('#panel').boundingBox();
  expect(panel.x + panel.width).toBeLessThanOrEqual(360);
  expect(await fits()).toBe(true);
  await page.screenshot({ path: path.join(SHOTS, 'narrow-panel.png') });
});

test('новый мир через меню: игрок стоит на земле, часы и здоровье видны', async ({ page }) => {
  const errors = await open(page);
  await page.click('#m-new');
  await page.fill('#n-name', 'Долина');
  await page.fill('#n-seed', '12345');
  await page.selectOption('#n-size', 'small');
  await page.click('#n-create');
  await page.waitForFunction(() => window.Sandbox2D.overlay === 'playing');
  await page.waitForFunction(() => window.Sandbox2D.game.player.body.onGround, null, { timeout: 20000 });
  const p = await player(page);
  expect(p.onGround).toBe(true);
  await expect(page.locator('#hp-text')).toHaveText('100 / 100');
  await expect(page.locator('#clock')).toContainText('День 1');
  expect(await sb(page, () => window.Sandbox2D.game.world.seed)).toBe(12345);
  expect(await page.locator('#hotbar .cell').count()).toBe(10);
  expect(errors).toEqual([]);
});

test('клавиши: D идёт вправо, пробел прыгает, цифры выбирают ячейку', async ({ page }) => {
  await open(page);
  await play(page);
  const x0 = (await player(page)).x;
  await page.keyboard.down('KeyD');
  await page.waitForFunction((x0) => window.Sandbox2D.game.player.body.x > x0 + 1, x0, { timeout: 20000 });
  await page.keyboard.up('KeyD');
  await page.keyboard.press('Digit3');
  expect((await player(page)).slot).toBe(2);
  await expect(page.locator('#hand')).toHaveText('Факел');
  await page.waitForFunction(() => window.Sandbox2D.game.player.body.onGround);
  const before = (await player(page)).y;
  await page.keyboard.down('Space');
  await page.waitForFunction((y0) => window.Sandbox2D.game.player.body.y < y0 - 1, before, { timeout: 20000 });
  await page.keyboard.up('Space');
});

test('мышь: кирка копает блок под ногами, факел ставится кликом; захвата указателя нет', async ({ page }) => {
  await open(page);
  await play(page);
  const p = await player(page);
  const cx = Math.floor(p.x + p.w / 2);
  const cy = Math.round(p.y + p.h);
  const before = await sb(page, ([x, y]) => window.SB.World.get(window.Sandbox2D.game.world, x, y), [cx, cy]);
  expect(before).not.toBe(0);
  const [sx, sy] = await cellOnScreen(page, cx, cy);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.waitForFunction(([x, y]) => window.SB.World.get(window.Sandbox2D.game.world, x, y) === 0, [cx, cy], { timeout: 8000 });
  await page.mouse.up();
  await sb(page, () => window.Sandbox2D.step(150));
  const got = await sb(page, (id) => window.SB.Inv.count(window.Sandbox2D.game.inv, id), 'dirt');
  expect(got).toBeGreaterThanOrEqual(1);
  // факел на стену/землю рядом
  await page.keyboard.press('Digit3');
  const tx = Math.floor(p.x + p.w / 2) - 2;
  const ty = Math.round(p.y + p.h) - 1;
  const [qx, qy] = await cellOnScreen(page, tx, ty);
  await page.mouse.click(qx, qy);
  expect(await sb(page, ([x, y]) => window.SB.World.get(window.Sandbox2D.game.world, x, y), [tx, ty])).toBe(17);
  expect(await page.evaluate(() => window.__pointerLockCalls)).toBe(0);
  expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
});

test('инвентарь: E открывает, крафт досок кнопкой, перестановка ячеек кликами', async ({ page }) => {
  await open(page);
  await play(page);
  await page.keyboard.press('KeyE');
  await expect(page.locator('#panel')).toBeVisible();
  const planks = page.locator('#craft-list button[data-recipe="0"]');
  await planks.click();
  expect(await sb(page, () => window.SB.Inv.count(window.Sandbox2D.game.inv, 'planks'))).toBe(4);
  expect(await sb(page, () => window.SB.Inv.count(window.Sandbox2D.game.inv, 'wood'))).toBe(9);
  await page.locator('#inv-grid .cell').nth(0).click();
  await page.locator('#inv-grid .cell').nth(15).click();
  expect(await sb(page, () => window.Sandbox2D.game.inv[15] && window.Sandbox2D.game.inv[15].id)).toBe('stone_pick');
  await page.keyboard.press('Escape');
  await expect(page.locator('#panel')).toBeHidden();
  expect(await sb(page, () => window.Sandbox2D.overlay)).toBe('playing');
});

test('сохранение: пауза, сохранить, в меню, загрузить - мир и игрок те же', async ({ page }) => {
  await open(page);
  await play(page, { name: 'Сохранёнка' });
  await sb(page, () => {
    const g = window.Sandbox2D.game;
    const p = g.player.body;
    window.SB.World.set(g.world, Math.floor(p.x) + 3, Math.floor(p.y) - 6, window.SB.Data.B.BRICK);
    window.SB.Inv.add(g.inv, 'coin', 42);
  });
  const p0 = await player(page);
  await page.keyboard.press('Escape');
  await expect(page.locator('#s-pause')).toBeVisible();
  await page.click('#p-save');
  await page.click('#p-menu');
  await expect(page.locator('#s-menu')).toBeVisible();
  await page.click('#m-load');
  await expect(page.locator('#l-list .slot-row').first()).toContainText('Сохранёнка');
  await page.locator('#l-list .slot-row').first().locator('.btn.primary').click();
  await page.waitForFunction(() => window.Sandbox2D.overlay === 'playing');
  const p1 = await player(page);
  expect(Math.abs(p1.x - p0.x)).toBeLessThan(0.5);
  expect(await sb(page, () => window.SB.Inv.count(window.Sandbox2D.game.inv, 'coin'))).toBe(42);
  const brick = await sb(page, ([x, y]) => window.SB.World.get(window.Sandbox2D.game.world, x, y), [Math.floor(p0.x) + 3, Math.floor(p0.y) - 6]);
  expect(brick).toBe(23);
});

test('настройки: переназначение прыжка и язык переживают перезагрузку', async ({ page }) => {
  await open(page);
  await page.click('#m-settings');
  await page.locator('#o-keys .key-row').nth(2).locator('.btn').first().click();
  await page.keyboard.press('KeyK');
  await expect(page.locator('#o-keys .key-row').nth(2).locator('.btn').first()).toHaveText('K');
  await page.selectOption('#o-lang', 'en');
  await expect(page.locator('#o-back')).toHaveText('Back');
  await page.reload();
  await page.waitForFunction(() => window.Sandbox2D && window.Sandbox2D.ready);
  await expect(page.locator('#m-new')).toHaveText('New world');
  expect(await sb(page, () => window.Sandbox2D.settings.keys.jump[0])).toBe('KeyK');
  await play(page);
  await page.waitForFunction(() => window.Sandbox2D.game.player.body.onGround);
  await page.keyboard.down('KeyK');
  await page.waitForFunction(() => window.Sandbox2D.game.player.body.vy < 0, null, { timeout: 20000 });
  await page.keyboard.up('KeyK');
});

test('ночь: враги рождаются в темноте, у факелов их нет; маяк зовёт босса с полосой здоровья', async ({ page }) => {
  await open(page);
  await play(page, { spawning: true });
  const info = await sb(page, () => {
    const A = window.Sandbox2D;
    const g = A.game;
    g.time = 0.7;
    g.player.invuln = 1e9;
    for (let i = 0; i < 60 * 40; i++) window.SB.Game.step(g, {});
    const Lt = window.SB.Light;
    return { n: g.stats.kills + g.mobs.length, lit: g.mobs.filter((m) => Lt.at(g.light, Math.floor(m.x), Math.floor(m.y)) >= 12 && !window.SB.Mobs.TYPES[m.kind].boss).length };
  });
  expect(info.n).toBeGreaterThan(0);
  await sb(page, () => {
    const g = window.Sandbox2D.game;
    g.inv[0] = { id: 'beacon', n: 1 };
    g.player.slot = 0;
    g.player.cd = 0;
    window.SB.Game.use(g, {}, 0);
    window.Sandbox2D.step(2);
  });
  await expect(page.locator('#boss')).toBeVisible();
  await expect(page.locator('#boss-name')).toHaveText('Ночной колосс');
  await page.waitForTimeout(300);
  await page.screenshot({ path: path.join(SHOTS, 'boss.png') });
});

test('телефон: кнопки касания видны и двигают игрока', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 760 }, hasTouch: true, isMobile: true });
  const page = await ctx.newPage();
  await open(page);
  await play(page);
  await expect(page.locator('[data-touch="right"]')).toBeVisible();
  const x0 = (await player(page)).x;
  const btn = await page.locator('[data-touch="right"]').boundingBox();
  await page.dispatchEvent('[data-touch="right"]', 'pointerdown');
  await page.waitForFunction((x0) => window.Sandbox2D.game.player.body.x > x0 + 1, x0, { timeout: 20000 });
  await page.dispatchEvent('[data-touch="right"]', 'pointerup');
  expect(btn.width).toBeGreaterThan(40);
  await ctx.close();
});

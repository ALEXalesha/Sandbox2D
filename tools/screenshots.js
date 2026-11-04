// Снимки для README в docs/screens: меню в двух темах, день, ночь у костра, пещера с водой,
// подземный ад, инвентарь с крафтом, узкое окно. Headless Chromium, WebGL программный.
//   npm run screens
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs', 'screens');
const URL = pathToFileURL(path.join(ROOT, 'web', 'index.html')).href;

async function page(browser, w, h, settings) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
  await p.addInitScript((s) => { localStorage.setItem('sandbox2d:settings', JSON.stringify(s)); }, Object.assign({ theme: 'glass', lang: 'ru', zoom: 2, volume: 0 }, settings));
  await p.goto(URL);
  await p.waitForFunction(() => window.Sandbox2D && window.Sandbox2D.ready);
  return p;
}

// поставить игрока в первое подходящее место: find(world, x, y) -> bool
async function teleport(p, where) {
  return p.evaluate((where) => {
    const A = window.Sandbox2D;
    const g = A.game;
    const { World: Wd, Data: D } = window.SB;
    const w = g.world;
    const ok = {
      water: (x, y) => Wd.getLiq(w, x, y) >> 4 === 1 && !Wd.solidAt(w, x, y - 3) && !Wd.solidAt(w, x, y - 2) && y > 140,
      hell: (x, y) => y > w.dims.hellTop + 10 && !Wd.solidAt(w, x, y) && !Wd.solidAt(w, x, y - 1) && Wd.solidAt(w, x, y + 1) && !Wd.getLiq(w, x, y),
      cave: (x, y) => y > 200 && y < 320 && !Wd.solidAt(w, x, y) && !Wd.solidAt(w, x, y - 1) && Wd.solidAt(w, x, y + 1) && !Wd.getLiq(w, x, y),
    }[where];
    const cx = w.dims.spawnX;
    for (let r = 0; r < w.W / 2; r += 3) {
      for (const x of [cx + r, cx - r]) {
        for (let y = 100; y < w.H - 2; y++) {
          if (ok(x, y)) {
            g.player.body.x = x;
            g.player.body.y = y - g.player.body.h + 0.99;
            window.SB.Physics.unstick(w, g.player.body);
            A.render.cam.x = x; A.render.cam.y = y;
            return [x, y];
          }
        }
      }
    }
    return null;
  }, where);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') });

  let p = await page(browser, 1280, 720, {});
  await shot(p, 'menu-glass');
  await p.close();
  p = await page(browser, 1280, 720, { theme: 'light' });
  await shot(p, 'menu-light');
  await p.close();

  p = await page(browser, 1280, 720, {});
  await p.evaluate(() => { window.Sandbox2D.newWorld({ name: 'Снимки', seed: 7, spawning: false }); window.Sandbox2D.step(60); });
  await p.waitForTimeout(900);
  await shot(p, 'day');
  // ночь: костёр, факелы и дощатая стена у спавна, враги рождаются только в темноте
  await p.evaluate(() => {
    const A = window.Sandbox2D;
    const g = A.game;
    const { World: Wd, Data: D } = window.SB;
    const b = g.player.body;
    const px = Math.floor(b.x);
    const gy = Math.round(b.y + b.h);
    for (let x = px - 6; x <= px + 6; x++) for (let y = gy - 6; y < gy; y++) { if (!Wd.solidAt(g.world, x, y)) { Wd.set(g.world, x, y, 0); Wd.setWall(g.world, x, y, D.W.PLANK); } }
    for (let x = px - 7; x <= px + 7; x++) Wd.set(g.world, x, gy - 7, D.B.PLANKS);
    Wd.set(g.world, px + 3, gy - 1, D.B.CAMPFIRE);
    g.campfires.push([px + 3, gy - 1]);
    Wd.set(g.world, px - 4, gy - 1, D.B.WORKBENCH);
    Wd.set(g.world, px - 6, gy - 4, D.B.TORCH);
    Wd.set(g.world, px + 6, gy - 4, D.B.TORCH);
    g.time = 0.2;
    window.SB.Inv.add(g.inv, 'coin', 12);
    A.step(320);
    g.stats.kills = 10;
    A.step(320);
    g.time = 0.72;
    g.spawning = true;
    g.player.invuln = 1e9;
    A.step(900);
  });
  await p.waitForTimeout(900);
  await shot(p, 'night');
  await p.evaluate(() => { const g = window.Sandbox2D.game; g.time = 0.25; g.mobs.length = 0; g.spawning = false; });
  if (await teleport(p, 'water')) {
    await p.evaluate(() => { window.Sandbox2D.game.inv[2] = { id: 'torch', n: 9 }; window.Sandbox2D.selectSlot(2); window.Sandbox2D.step(90); });
    await p.waitForTimeout(900);
    await shot(p, 'cave-water');
  }
  if (await teleport(p, 'hell')) {
    await p.evaluate(() => { window.Sandbox2D.step(90); });
    await p.waitForTimeout(900);
    await shot(p, 'underworld');
  }
  await p.evaluate(() => {
    const g = window.Sandbox2D.game;
    const I = window.SB.Inv;
    for (const [id, n] of [['stone', 80], ['iron_ore', 12], ['copper_bar', 9], ['planks', 30], ['crystal', 6], ['potion', 3], ['beacon', 1], ['iron_pick', 1]]) I.add(g.inv, id, n);
    window.Sandbox2D.openPanel('trader');
  });
  await p.waitForTimeout(400);
  await shot(p, 'inventory');
  await p.close();

  p = await page(browser, 360, 640, {});
  await shot(p, 'narrow-menu');
  await p.evaluate(() => { window.Sandbox2D.newWorld({ name: 'Узко', seed: 7, size: 'small', spawning: false }); window.Sandbox2D.step(60); });
  await p.waitForTimeout(900);
  await shot(p, 'narrow-game');
  await p.close();
  await browser.close();
  console.log('docs/screens:', fs.readdirSync(OUT).join(', '));
})();

// Рисует значок Sandbox2D (блоки земли и камня, факел и его свет) в headless Chromium и
// пишет assets/icon.png (256), assets/icon.ico (16-256, внутри PNG) и web/favicon.png.
//   npm run icon
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256" shape-rendering="crispEdges">
  <defs>
    <radialGradient id="glow" cx="0.5" cy="0.42" r="0.55">
      <stop offset="0" stop-color="#ffd76a" stop-opacity="0.95"/><stop offset="0.5" stop-color="#ff8a2a" stop-opacity="0.35"/><stop offset="1" stop-color="#1a1430" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="r"><rect x="8" y="8" width="240" height="240" rx="48"/></clipPath>
  </defs>
  <g clip-path="url(#r)">
    <rect x="0" y="0" width="256" height="256" fill="#1a1430"/>
    <rect x="0" y="0" width="256" height="256" fill="url(#glow)"/>
    <rect x="0" y="168" width="256" height="88" fill="#6b6e75"/>
    <rect x="0" y="168" width="256" height="40" fill="#8a5a36"/>
    <rect x="0" y="168" width="256" height="12" fill="#4f9e3a"/>
    <rect x="40" y="208" width="40" height="40" fill="#7c7f86"/><rect x="176" y="216" width="32" height="32" fill="#d9824a"/>
    <rect x="96" y="224" width="24" height="24" fill="#62d0ff"/>
    <rect x="120" y="104" width="16" height="64" fill="#7a5030"/>
    <rect x="112" y="72" width="32" height="32" fill="#ff8a2a"/>
    <rect x="120" y="56" width="16" height="24" fill="#ffd75a"/>
    <rect x="124" y="48" width="8" height="8" fill="#fff4c0"/>
  </g>
</svg>`;

function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(pngs.length, 4);
  let offset = head.length;
  pngs.forEach(({ size, data }, i) => {
    const o = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, o);
    head.writeUInt8(size >= 256 ? 0 : size, o + 1);
    head.writeUInt8(0, o + 2);
    head.writeUInt8(0, o + 3);
    head.writeUInt16LE(1, o + 4);
    head.writeUInt16LE(32, o + 6);
    head.writeUInt32LE(data.length, o + 8);
    head.writeUInt32LE(offset, o + 12);
    offset += data.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.data)]);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const pngs = [];
  for (const size of [16, 24, 32, 48, 64, 128, 256]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${SVG.replace('width="256" height="256"', `width="${size}" height="${size}"`)}</body></html>`);
    pngs.push({ size, data: await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }) });
  }
  await browser.close();
  fs.mkdirSync(path.join(ROOT, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(ROOT, 'assets', 'icon.png'), pngs.find((p) => p.size === 256).data);
  fs.writeFileSync(path.join(ROOT, 'assets', 'icon.ico'), ico(pngs));
  fs.writeFileSync(path.join(ROOT, 'web', 'favicon.png'), pngs.find((p) => p.size === 64).data);
  console.log('assets/icon.png, assets/icon.ico, web/favicon.png');
})();

// Законы страницы: только headless Chromium, один поток, вывод во временную папку.
// SB_WEB - другая папка web/ (tools/mutate.js гоняет законы на сломанных копиях).
const os = require('os');
const path = require('path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/web',
  workers: 1,
  fullyParallel: true,
  timeout: 90000,
  expect: { timeout: 10000 },
  reporter: [['list']],
  outputDir: path.join(os.tmpdir(), 'sandbox2d-playwright'),
  use: {
    headless: true,
    viewport: { width: 1280, height: 760 },
    locale: 'ru-RU',
    launchOptions: { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
  },
});

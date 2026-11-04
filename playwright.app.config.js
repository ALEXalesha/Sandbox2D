// Законы настоящего приложения на Electron. SB_TEST=1: окно не показывается и не берёт фокус.
// Один поток: одно приложение за раз.
const os = require('os');
const path = require('path');
const { defineConfig } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/app',
  workers: 1,
  fullyParallel: false,
  timeout: 600000,
  reporter: [['list']],
  outputDir: path.join(os.tmpdir(), 'sandbox2d-playwright-app'),
});

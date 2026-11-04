// Копия PixiJS из npm в web/vendor: игра работает без сборки и без сети (Pages, Electron, файл).
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = path.join(ROOT, 'node_modules', 'pixi.js', 'dist', 'pixi.min.js');
const dst = path.join(ROOT, 'web', 'vendor', 'pixi.min.js');
fs.mkdirSync(path.dirname(dst), { recursive: true });
const text = fs.readFileSync(src, 'utf8').replace(/\/\/# sourceMappingURL=\S+\s*$/, '');
fs.writeFileSync(dst, text);
// без eval: страница работает со строгой политикой безопасности (CSP без unsafe-eval)
const safe = path.join(ROOT, 'node_modules', 'pixi.js', 'dist', 'packages', 'unsafe-eval.min.js');
fs.writeFileSync(path.join(ROOT, 'web', 'vendor', 'pixi-unsafe-eval.min.js'), fs.readFileSync(safe, 'utf8').replace(/\/\/# sourceMappingURL=\S+\s*$/, ''));
fs.copyFileSync(path.join(ROOT, 'node_modules', 'pixi.js', 'LICENSE'), path.join(ROOT, 'web', 'vendor', 'PIXI-LICENSE.txt'));
console.log('pixi.js ->', path.relative(ROOT, dst), Math.round(text.length / 1024), 'KB');

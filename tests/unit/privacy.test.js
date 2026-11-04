// Ничего личного в файлах репозитория: путь к папкам на диске автора, адрес домашней сети,
// почта, страница пожертвований, домашний сервер кода. Строки собраны из кусков, иначе закон
// нашёл бы сам себя.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..', '..');
const PATTERNS = [
  new RegExp('C:[\\\\/]+(' + 'Dri' + 've|' + 'Us' + 'ers)', 'i'),
  new RegExp('192\\.' + '168\\.'),
  new RegExp('g' + 'mail', 'i'),
  new RegExp('ko' + '-fi', 'i'),
  new RegExp('gi' + 'tea', 'i'),
];

function tracked() {
  try {
    return execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: ROOT }).toString('utf8').split('\0').filter(Boolean);
  } catch (e) {
    return [];
  }
}

test('в файлах репозитория нет личных путей, адресов, почты и ссылок', () => {
  const found = [];
  for (const f of tracked()) {
    if (f.startsWith('web/vendor/')) continue;
    let data;
    try { data = fs.readFileSync(path.join(ROOT, f)); } catch (e) { continue; }
    if (data.subarray(0, 8192).includes(0)) continue;
    const text = data.toString('utf8');
    for (const re of PATTERNS) if (re.test(text)) found.push(`${f}: ${re}`);
  }
  assert.deepEqual(found, []);
});

test('закон сам ловит запрещённое', () => {
  assert.ok(PATTERNS[1].test('192.' + '168.1.10'));
  assert.ok(PATTERNS[0].test('C:/' + 'Users/x'));
});

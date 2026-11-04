// Клавиши: действия, раскладка по умолчанию, переназначение без повторов, разбор из
// хранилища. У каждого действия две клавиши (вторая может быть пустой).
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SB = root.SB || {}).Keys = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ACTIONS = Object.freeze(['left', 'right', 'jump', 'inventory', 'talk', 'zoomIn', 'zoomOut', 'map']);
  const DEFAULTS = Object.freeze({
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    jump: ['Space', 'KeyW'],
    inventory: ['KeyE', 'KeyI'],
    talk: ['KeyF', null],
    zoomIn: ['Equal', 'NumpadAdd'],
    zoomOut: ['Minus', 'NumpadSubtract'],
    map: ['KeyM', null],
  });
  // занятые игрой навсегда: пауза и панель предметов
  const RESERVED = Object.freeze(['Escape', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7', 'Digit8', 'Digit9', 'Digit0']);

  const defaults = () => {
    const b = {};
    for (const a of ACTIONS) b[a] = DEFAULTS[a].slice();
    return b;
  };

  const validCode = (c) => typeof c === 'string' && /^[A-Za-z][A-Za-z0-9]{1,24}$/.test(c) && !RESERVED.includes(c);

  // из хранилища: неизвестное отброшено, повторы убраны, пустые действия получают свои клавиши
  function sanitize(stored) {
    const out = {};
    const used = new Set();
    const src = stored && typeof stored === 'object' ? stored : {};
    for (const a of ACTIONS) {
      const list = Array.isArray(src[a]) ? src[a] : null;
      out[a] = [null, null];
      if (!list) continue;
      for (let i = 0; i < 2; i++) {
        const c = list[i];
        if (validCode(c) && !used.has(c)) { out[a][i] = c; used.add(c); }
      }
    }
    for (const a of ACTIONS) {
      if (out[a][0] || out[a][1]) continue;
      out[a] = DEFAULTS[a].map((c) => (c && !used.has(c) ? c : null));
      for (const c of out[a]) if (c) used.add(c);
    }
    return out;
  }

  // назначить клавишу; у других действий она снимается
  function rebind(bindings, action, index, code) {
    if (!ACTIONS.includes(action) || (index !== 0 && index !== 1) || !validCode(code)) return false;
    for (const a of ACTIONS) bindings[a] = bindings[a].map((c) => (c === code ? null : c));
    bindings[action][index] = code;
    return true;
  }

  function actionFor(bindings, code) {
    for (const a of ACTIONS) if (bindings[a].includes(code)) return a;
    return null;
  }

  // слот панели по клавише: Digit1..Digit9 - 0..8, Digit0 - 9
  function slotFor(code) {
    const m = /^(?:Digit|Numpad)(\d)$/.exec(code || '');
    if (!m) return -1;
    const d = +m[1];
    return d === 0 ? 9 : d - 1;
  }

  const NAMES = { Space: ['Пробел', 'Space'], ArrowLeft: ['←', '←'], ArrowRight: ['→', '→'], ArrowUp: ['↑', '↑'], ArrowDown: ['↓', '↓'], Equal: ['=', '='], Minus: ['-', '-'], NumpadAdd: ['Num +', 'Num +'], NumpadSubtract: ['Num -', 'Num -'], ShiftLeft: ['Shift', 'Shift'], ControlLeft: ['Ctrl', 'Ctrl'], Tab: ['Tab', 'Tab'] };

  function keyName(code, lang) {
    if (!code) return '-';
    const n = NAMES[code];
    if (n) return lang === 'en' ? n[1] : n[0];
    const m = /^(?:Key|Digit)(.)$/.exec(code);
    if (m) return m[1];
    return code.replace(/^Numpad/, 'Num ');
  }

  return { ACTIONS, DEFAULTS, RESERVED, defaults, sanitize, rebind, actionFor, slotFor, keyName, validCode };
});

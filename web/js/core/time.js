// День и ночь. Время суток t в [0, 1): 0 - рассвет (6:00), 0.5 - закат (18:00).
// Полные сутки - DAY_LEN секунд игры.
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SB = root.SB || {}).Time = api;
})(typeof self !== 'undefined' ? self : this, function () {
/* c8 ignore stop */
  'use strict';
  const DAY_LEN = 720;
  const NIGHT_LIGHT = 0.15;
  const DAY = [126, 200, 255];
  const DUSK = [255, 150, 92];
  const NIGHT = [11, 16, 48];

  // яркость неба 0.15..1
  function daylight(t) {
    const x = ((t % 1) + 1) % 1;
    if (x < 0.5) return 1;
    if (x < 0.6) return 1 - (1 - NIGHT_LIGHT) * ((x - 0.5) / 0.1);
    if (x < 0.92) return NIGHT_LIGHT;
    return NIGHT_LIGHT + (1 - NIGHT_LIGHT) * ((x - 0.92) / 0.08);
  }

  const isNight = (t) => daylight(t) < 0.5;

  function advance(t, dt) {
    const n = t + dt / DAY_LEN;
    return { t: n - Math.floor(n), days: Math.floor(n) };
  }

  // часы и минуты для подписи
  function clock(t) {
    const m = Math.floor((((t % 1) + 1) % 1) * 24 * 60 + 6 * 60) % (24 * 60);
    return { h: Math.floor(m / 60), m: m % 60 };
  }

  const mix = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));

  // цвет неба [r, g, b]: днём голубой, на закате и рассвете тёплый, ночью тёмно-синий
  function sky(t) {
    const x = ((t % 1) + 1) % 1;
    if (x < 0.45) return DAY.slice();
    if (x < 0.55) return mix(DAY, DUSK, (x - 0.45) / 0.1);
    if (x < 0.62) return mix(DUSK, NIGHT, (x - 0.55) / 0.07);
    if (x < 0.9) return NIGHT.slice();
    if (x < 0.96) return mix(NIGHT, DUSK, (x - 0.9) / 0.06);
    return mix(DUSK, DAY, (x - 0.96) / 0.04);
  }

  return { DAY_LEN, NIGHT_LIGHT, daylight, isNight, advance, clock, sky };
});

// Звук кодом через Web Audio: короткие шумы и тоны для событий и тихий фон дня, ночи и
// глубины. Ни одного звукового файла. Звук включается с первым нажатием (так требует браузер).
(function (root) {
  'use strict';
  const SB = root.SB;
  let ctx = null;
  let master = null;
  let sfx = null;
  let amb = null;
  let noiseBuf = null;
  let pad = null;
  let volume = 0.7;
  let music = 0.4;
  let last = {};

  function ensure() {
    if (ctx) return ctx;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    sfx = ctx.createGain();
    sfx.gain.value = volume;
    sfx.connect(master);
    amb = ctx.createGain();
    amb.gain.value = music * 0.25;
    amb.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    let s = 12345;
    for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x7fffffff) * 2 - 1; }
    return ctx;
  }

  function resume() {
    const c = ensure();
    if (c && c.state === 'suspended') c.resume();
  }

  function env(g, t, a, peak, dec) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
  }

  function tone(freq, dur, type, peak, slide, delay) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type || 'square';
    o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + dur);
    env(g, t, 0.005, peak || 0.2, dur);
    o.connect(g);
    g.connect(sfx);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  function noise(dur, filter, freq, peak, delay) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0);
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = filter || 'lowpass';
    f.frequency.value = freq || 1200;
    const g = ctx.createGain();
    env(g, t, 0.003, peak || 0.3, dur);
    src.connect(f);
    f.connect(g);
    g.connect(sfx);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  // не чаще раза в gap секунд для одного звука
  function limited(name, gap) {
    const now = ctx ? ctx.currentTime : 0;
    if (last[name] !== undefined && now - last[name] < gap) return false;
    last[name] = now;
    return true;
  }

  const SOFT = new Set([1, 2, 4, 5, 8, 25, 14]);
  const SOUNDS = {
    dig: (e) => { if (limited('dig', 0.12)) noise(0.07, 'bandpass', SOFT.has(e.block) ? 500 : 1800, 0.25); },
    break: (e) => { noise(0.16, 'lowpass', SOFT.has(e.block) ? 700 : 2400, 0.4); tone(SOFT.has(e.block) ? 120 : 260, 0.08, 'triangle', 0.12, 0.5); },
    place: () => { noise(0.05, 'lowpass', 900, 0.3); tone(180, 0.05, 'triangle', 0.15, 0.7); },
    swing: () => noise(0.12, 'highpass', 2500, 0.12),
    hit: () => { tone(220, 0.09, 'square', 0.14, 0.5); noise(0.06, 'bandpass', 1500, 0.2); },
    hurt: () => { tone(330, 0.18, 'sawtooth', 0.15, 0.4); },
    kill: () => { tone(520, 0.08, 'square', 0.12, 1.5); tone(780, 0.1, 'square', 0.1, 1.2, 0.07); },
    pickup: () => { if (limited('pickup', 0.05)) tone(880, 0.06, 'sine', 0.12, 1.4); },
    craft: () => { tone(660, 0.08, 'triangle', 0.15); tone(990, 0.12, 'triangle', 0.13, 1, 0.08); },
    drink: () => { for (let i = 0; i < 4; i++) tone(400 + i * 80, 0.06, 'sine', 0.1, 1.3, i * 0.06); },
    jump: () => tone(300, 0.08, 'square', 0.06, 1.8),
    hard: () => tone(140, 0.12, 'square', 0.12, 0.8),
    burn: () => { if (limited('burn', 0.3)) noise(0.2, 'bandpass', 800, 0.12); },
    obsidian: () => { noise(0.4, 'highpass', 3000, 0.25); tone(90, 0.3, 'sine', 0.2, 0.6); },
    boss: () => { tone(70, 1.2, 'sawtooth', 0.25, 0.6); tone(105, 1.2, 'sawtooth', 0.18, 0.6, 0.1); },
    bossDown: () => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.25, 'triangle', 0.15, 1, i * 0.12)); },
    death: () => { tone(400, 0.6, 'sawtooth', 0.18, 0.25); },
    arrive: () => { [392, 494, 587].forEach((f, i) => tone(f, 0.18, 'sine', 0.12, 1, i * 0.1)); },
    respawn: () => tone(500, 0.3, 'sine', 0.12, 2),
    ui: () => tone(700, 0.04, 'square', 0.06),
  };

  function play(e) {
    if (!ctx || volume <= 0) return;
    const f = SOUNDS[e.type];
    if (f) f(e);
  }

  // фон: два мягких тона, высота зависит от дня, ночи и глубины
  function ambience(mode) {
    if (!ctx) return;
    if (pad && pad.mode === mode) return;
    if (pad) {
      const old = pad;
      old.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.8);
      setTimeout(() => { for (const o of old.osc) o.stop(); }, 4000);
    }
    const chords = { day: [196, 247, 294], night: [110, 131, 165], deep: [55, 82], hell: [49, 52, 73] };
    const g = ctx.createGain();
    g.gain.value = 0.0001;
    g.gain.setTargetAtTime(0.3, ctx.currentTime, 1.5);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = mode === 'day' ? 900 : 500;
    f.connect(g);
    g.connect(amb);
    const osc = chords[mode].map((hz, i) => {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = hz;
      o.detune.value = (i - 1) * 6;
      o.connect(f);
      o.start();
      return o;
    });
    pad = { mode, g, osc };
  }

  function setVolume(v, m) {
    volume = v;
    music = m;
    if (sfx) sfx.gain.value = v;
    if (amb) amb.gain.value = m * 0.25;
  }

  function stopAmbience() {
    if (!pad || !ctx) return;
    pad.g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.3);
    const old = pad;
    pad = null;
    setTimeout(() => { for (const o of old.osc) o.stop(); }, 2000);
  }

  SB.Audio = { resume, play, ambience, stopAmbience, setVolume, SOUNDS };
})(typeof self !== 'undefined' ? self : this);

// Вся графика игры рисуется здесь кодом, пиксель за пикселем, на маленьких холстах 16 x 16:
// блоки (по 4 варианта), стены, значки предметов, жители, враги и боссы. Ни одной картинки
// из файла.
(function (root) {
  'use strict';
  const SB = root.SB;
  const { B, BLOCKS, WALLS, ITEMS } = SB.Data;
  const H = SB.Noise.hash;
  const TS = 16;
  const VARIANTS = 4;

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h || w;
    return c;
  }

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const css = (c, a) => (a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`);
  const shade = (c, k) => c.map((v) => Math.max(0, Math.min(255, Math.round(v * k))));

  // рисовалка по пикселям с детерминированным шумом
  function painter(ctx, seed) {
    const r = (x, y, k) => H(seed, x * 31 + (k || 0), y * 17) / 4294967296;
    const px = (x, y, c, a) => { ctx.fillStyle = css(c, a); ctx.fillRect(x, y, 1, 1); };
    const rect = (x, y, w, h, c, a) => { ctx.fillStyle = css(c, a); ctx.fillRect(x, y, w, h); };
    return { r, px, rect };
  }

  function noisy(p, cols, w, h, x0, y0, k1, k2) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = p.r(x + x0, y + y0);
        p.px(x + x0, y + y0, v < k1 ? cols[1] : v < k1 + k2 ? cols[2] : cols[0]);
      }
    }
  }

  function block(id, variant) {
    const def = BLOCKS[id];
    const c = canvas(TS);
    const ctx = c.getContext('2d');
    const cols = def.colors.map(rgb);
    const p = painter(ctx, id * 977 + variant * 131 + 7);
    const k = def.key;
    switch (id) {
      case B.GRASS: {
        noisy(p, [rgb('#8a5a36'), rgb('#7a4e2e'), rgb('#99673f')], 16, 16, 0, 0, 0.25, 0.15);
        for (let x = 0; x < 16; x++) {
          const depth = 3 + Math.floor(p.r(x, 0, 5) * 3);
          for (let y = 0; y < depth; y++) p.px(x, y, p.r(x, y, 9) < 0.3 ? cols[2] : cols[1]);
        }
        break;
      }
      case B.LOG: {
        p.rect(2, 0, 12, 16, cols[0]);
        for (let y = 0; y < 16; y++) for (const x of [4, 8, 11]) if (p.r(x, y) < 0.8) p.px(x, y, cols[1]);
        for (let y = 0; y < 16; y++) { p.px(2, y, cols[1]); p.px(13, y, cols[1]); if (p.r(6, y) < 0.3) p.px(6, y, cols[2]); }
        break;
      }
      case B.LEAVES:
      case B.PINE: {
        for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
          const v = p.r(x, y);
          if (v < 0.12) continue;
          p.px(x, y, v < 0.4 ? cols[1] : v < 0.6 ? cols[2] : cols[0]);
        }
        break;
      }
      case B.PLANKS: {
        for (let row = 0; row < 4; row++) {
          const y0 = row * 4;
          noisy(p, cols, 16, 3, 0, y0, 0.18, 0.15);
          p.rect(0, y0 + 3, 16, 1, shade(cols[1], 0.75));
          const cut = (row * 7 + variant * 3) % 16;
          p.rect(cut, y0, 1, 3, shade(cols[1], 0.8));
        }
        break;
      }
      case B.BRICK: {
        p.rect(0, 0, 16, 16, shade(cols[1], 0.8));
        for (let row = 0; row < 4; row++) {
          const off = row % 2 ? 4 : 0;
          for (let bx = -1; bx < 3; bx++) {
            const x0 = bx * 8 + off;
            for (let y = row * 4; y < row * 4 + 3; y++) for (let x = Math.max(0, x0); x < Math.min(16, x0 + 7); x++) p.px(x, y, p.r(x, y) < 0.2 ? cols[2] : cols[0]);
          }
        }
        break;
      }
      case B.SANDSTONE: {
        for (let y = 0; y < 16; y++) {
          const band = Math.floor((y + variant) / 4) % 2 ? cols[0] : cols[2];
          for (let x = 0; x < 16; x++) p.px(x, y, p.r(x, y) < 0.2 ? cols[1] : band);
        }
        break;
      }
      case B.ICE: {
        noisy(p, cols, 16, 16, 0, 0, 0.15, 0.2);
        for (let i = 0; i < 6; i++) p.px(3 + i, 10 - i, [235, 250, 255]);
        for (let i = 0; i < 4; i++) p.px(9 + i, 13 - i, [235, 250, 255]);
        break;
      }
      case B.GLASS: {
        ctx.clearRect(0, 0, 16, 16);
        p.rect(0, 0, 16, 16, cols[0], 0.18);
        p.rect(0, 0, 16, 1, cols[2], 0.9); p.rect(0, 15, 16, 1, cols[1], 0.9);
        p.rect(0, 0, 1, 16, cols[2], 0.9); p.rect(15, 0, 1, 16, cols[1], 0.9);
        for (let i = 0; i < 5; i++) p.px(3 + i, 8 - i, [255, 255, 255], 0.8);
        break;
      }
      case B.COPPER:
      case B.IRON:
      case B.CRYSTAL:
      case B.MAGMITE: {
        const base = id === B.MAGMITE ? [rgb('#3a2a2a'), rgb('#2c2020'), rgb('#4a3434')] : id === B.CRYSTAL ? [rgb('#4c4f66'), rgb('#3e4155'), rgb('#5a5d76')] : [rgb('#7c7f86'), rgb('#6b6e75'), rgb('#8d9098')];
        noisy(p, base, 16, 16, 0, 0, 0.25, 0.15);
        const n = id === B.CRYSTAL ? 3 : 4;
        for (let i = 0; i < n; i++) {
          const cx = 2 + Math.floor(p.r(i, 1, 3) * 11);
          const cy = 2 + Math.floor(p.r(i, 2, 4) * 11);
          if (id === B.CRYSTAL) {
            for (let d = 0; d < 3; d++) { p.px(cx, cy - d, cols[1]); p.px(cx + 1, cy - d, d ? cols[2] : cols[1]); }
            p.px(cx, cy - 3, cols[2]);
          } else if (id === B.MAGMITE) {
            for (let d = 0; d < 4; d++) p.px(Math.min(15, cx + d), Math.min(15, cy + (d % 2)), d % 2 ? cols[2] : cols[1]);
          } else {
            p.rect(cx, cy, 2, 2, cols[1]);
            p.px(cx, cy, cols[2]);
          }
        }
        break;
      }
      case B.OBSIDIAN: {
        noisy(p, cols, 16, 16, 0, 0, 0.3, 0.12);
        for (let i = 0; i < 5; i++) p.px(2 + i * 3, 3 + ((i * 5 + variant) % 10), [120, 90, 170]);
        break;
      }
      case B.TORCH: {
        p.rect(7, 7, 2, 9, rgb('#7a5030'));
        p.rect(6, 4, 4, 3, rgb('#ff8a2a'));
        p.rect(7, 2, 2, 3, rgb('#ffd75a'));
        p.px(7, 1, [255, 250, 210]);
        break;
      }
      case B.CAMPFIRE: {
        p.rect(1, 13, 14, 2, rgb('#6b4628'));
        p.rect(3, 11, 10, 2, rgb('#7d5432'));
        for (const [x, y, w, h, col] of [[4, 6, 8, 5, '#ff6a1a'], [5, 3, 6, 4, '#ff9a2a'], [6, 1, 4, 3, '#ffd75a'], [7, 0, 2, 2, '#fff4c0']]) p.rect(x, y, w, h, rgb(col));
        p.rect(0, 15, 16, 1, rgb('#4a4e58'));
        break;
      }
      case B.WORKBENCH: {
        p.rect(0, 5, 16, 3, rgb('#c4925a'));
        p.rect(0, 8, 16, 1, rgb('#7d5432'));
        p.rect(1, 9, 2, 7, rgb('#8a5a36'));
        p.rect(13, 9, 2, 7, rgb('#8a5a36'));
        p.rect(3, 3, 4, 2, rgb('#9a9da5'));
        p.rect(10, 2, 1, 3, rgb('#6b4628'));
        break;
      }
      case B.FURNACE: {
        noisy(p, [rgb('#6b6e75'), rgb('#55585f'), rgb('#7c7f86')], 14, 14, 1, 2, 0.25, 0.15);
        p.rect(4, 8, 8, 6, rgb('#2a1a10'));
        p.rect(5, 10, 6, 4, rgb('#ff7a2a'));
        p.rect(6, 12, 4, 2, rgb('#ffd75a'));
        p.rect(6, 0, 3, 2, rgb('#55585f'));
        break;
      }
      case B.ANVIL: {
        p.rect(1, 6, 14, 3, rgb('#5a5e68'));
        p.rect(1, 6, 14, 1, rgb('#8a8e98'));
        p.rect(5, 9, 6, 3, rgb('#4a4e58'));
        p.rect(3, 12, 10, 4, rgb('#3a3e48'));
        p.rect(0, 7, 2, 1, rgb('#5a5e68'));
        break;
      }
      case B.CACTUS: {
        p.rect(4, 0, 8, 16, cols[0]);
        for (let y = 0; y < 16; y++) { p.px(6, y, cols[1]); p.px(9, y, cols[2]); }
        for (let y = 2; y < 16; y += 4) { p.px(3, y, [230, 220, 170]); p.px(12, y + 2 > 15 ? 15 : y + 2, [230, 220, 170]); }
        break;
      }
      default:
        noisy(p, cols, 16, 16, 0, 0, 0.25, 0.15);
        if (id === B.STONE || id === B.BEDROCK) {
          const cx = Math.floor(p.r(1, 1, 7) * 10) + 2;
          for (let i = 0; i < 5; i++) p.px(Math.min(15, cx + i), 4 + (i % 2) + variant, shade(cols[1], 0.8));
        }
        if (id === B.DIRT) for (let i = 0; i < 3; i++) p.px(Math.floor(p.r(i, 5, 2) * 16), Math.floor(p.r(i, 6, 2) * 16), rgb('#5a3a20'));
        break;
    }
    void k;
    return c;
  }

  function wall(id, variant) {
    const w = WALLS[id];
    const c = canvas(TS);
    const ctx = c.getContext('2d');
    const base = rgb(w.color);
    const p = painter(ctx, id * 313 + variant * 71 + 3);
    noisy(p, [base, shade(base, 0.85), shade(base, 1.15)], 16, 16, 0, 0, 0.25, 0.15);
    if (id === 3) for (let y = 3; y < 16; y += 4) p.rect(0, y, 16, 1, shade(base, 0.7));
    if (id === 4) for (let row = 0; row < 4; row++) { p.rect(0, row * 4 + 3, 16, 1, shade(base, 0.7)); p.rect((row % 2) * 4 + 3, row * 4, 1, 3, shade(base, 0.7)); p.rect((row % 2) * 4 + 11, row * 4, 1, 3, shade(base, 0.7)); }
    return c;
  }

  // ---------- значки предметов ----------

  const METAL = { stone: '#9a9da5', copper: '#e08a4a', iron: '#dcd4cc', crystal: '#7fe0ff', magmite: '#ff7a2a', wood: '#c4925a' };

  function icon(id) {
    const it = ITEMS[id];
    const c = canvas(TS);
    const ctx = c.getContext('2d');
    const p = painter(ctx, 5);
    if (it.kind === 'block') {
      ctx.drawImage(block(it.place, 0), 0, 0);
      return c;
    }
    if (it.kind === 'wall') {
      ctx.drawImage(wall(it.wall, 0), 2, 2, 12, 12);
      p.rect(1, 1, 14, 1, [255, 255, 255], 0.5);
      p.rect(1, 14, 14, 1, [0, 0, 0], 0.5);
      return c;
    }
    const mat = id.split('_')[0];
    if (it.kind === 'pick') {
      for (let i = 0; i < 11; i++) p.rect(3 + i, 13 - i, 2, 2, rgb('#7a5030'));
      const m = rgb(METAL[mat]);
      for (let i = 0; i < 12; i++) {
        const x = 2 + i;
        const y = Math.round(5 - Math.sin((i / 11) * Math.PI) * 3) + (i < 6 ? 0 : 0);
        p.rect(x, y - 1 + Math.abs(i - 6) / 2, 1, 2, i < 3 || i > 9 ? shade(m, 0.8) : m);
      }
      return c;
    }
    if (it.kind === 'sword') {
      const m = rgb(METAL[mat]);
      for (let i = 0; i < 9; i++) { p.rect(5 + i, 9 - i, 2, 2, m); p.px(6 + i, 9 - i, shade(m, 1.25)); }
      p.rect(2, 9, 6, 2, rgb('#6b4628'));
      p.rect(4, 7, 2, 6, rgb('#d8b040'));
      p.rect(1, 12, 3, 3, rgb('#6b4628'));
      return c;
    }
    switch (id) {
      case 'wood':
        p.rect(2, 4, 12, 8, rgb('#7d5432'));
        p.rect(2, 4, 12, 1, rgb('#5a3a20'));
        p.rect(11, 4, 3, 8, rgb('#c4925a'));
        p.px(12, 7, rgb('#8a5a36')); p.px(12, 8, rgb('#8a5a36'));
        break;
      case 'copper_bar': case 'iron_bar': case 'magmite_bar': {
        const m = rgb(METAL[mat]);
        p.rect(3, 6, 10, 6, shade(m, 0.8));
        p.rect(4, 5, 8, 2, shade(m, 1.2));
        p.rect(5, 8, 6, 2, m);
        break;
      }
      case 'crystal':
        for (let y = 0; y < 12; y++) { const w = y < 6 ? y + 1 : 12 - y; p.rect(8 - w, 2 + y, w * 2, 1, y < 6 ? rgb('#b8f0ff') : rgb('#62d0ff')); }
        break;
      case 'goo':
        p.rect(3, 7, 10, 6, [90, 200, 110], 0.9); p.rect(5, 5, 6, 2, [90, 200, 110], 0.9); p.px(6, 7, [220, 255, 220]);
        break;
      case 'shadow_dust':
        for (let i = 0; i < 9; i++) p.rect(3 + ((i * 5) % 10), 3 + ((i * 7) % 10), 2, 2, i % 2 ? rgb('#8a5ae0') : rgb('#c8a8ff'));
        break;
      case 'ember':
        p.rect(4, 6, 8, 6, rgb('#5a2a10')); p.rect(5, 7, 6, 4, rgb('#ff6a1a')); p.rect(7, 8, 2, 2, rgb('#ffd75a'));
        break;
      case 'coin':
        p.rect(4, 3, 8, 10, rgb('#d8a020')); p.rect(3, 5, 10, 6, rgb('#d8a020')); p.rect(5, 4, 6, 8, rgb('#f8d050')); p.rect(7, 6, 2, 4, rgb('#b08010'));
        break;
      case 'potion':
        p.rect(6, 1, 4, 2, rgb('#8a5a36')); p.rect(6, 3, 4, 3, [220, 240, 255], 0.8); p.rect(3, 6, 10, 9, [220, 240, 255], 0.8); p.rect(4, 8, 8, 6, rgb('#e83a50')); p.px(5, 9, [255, 200, 210]);
        break;
      case 'life_shard':
        p.rect(3, 4, 4, 4, rgb('#ff5a8a')); p.rect(9, 4, 4, 4, rgb('#ff5a8a')); p.rect(3, 6, 10, 4, rgb('#ff5a8a')); p.rect(5, 10, 6, 2, rgb('#e83a6a')); p.rect(7, 12, 2, 2, rgb('#e83a6a')); p.px(4, 5, [255, 220, 230]);
        break;
      case 'beacon':
        p.rect(4, 12, 8, 3, rgb('#5a5e68')); p.rect(6, 9, 4, 3, rgb('#7c7f86'));
        for (const [x, y] of [[8, 1], [7, 3], [8, 3], [9, 3], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [7, 5], [8, 5], [9, 5], [6, 6], [7, 7], [9, 7], [10, 6], [8, 6], [8, 2]]) p.px(x, y, rgb('#fff0a0'));
        break;
      case 'obsidian_key':
        p.rect(2, 4, 6, 6, rgb('#46345e')); p.rect(4, 6, 2, 2, rgb('#ff7a2a')); p.rect(8, 6, 7, 2, rgb('#46345e')); p.rect(12, 8, 2, 3, rgb('#46345e')); p.rect(9, 8, 2, 2, rgb('#46345e'));
        break;
      default:
        p.rect(4, 4, 8, 8, [200, 200, 200]);
    }
    return c;
  }

  // ---------- существа ----------
  // кадры: [холст, ...]; размеры в пикселях = размер тела в клетках * 16

  function human(colors, frame) {
    const c = canvas(14, 30);
    const p = painter(c.getContext('2d'), 1);
    const [skin, hair, shirt, pants, boots, extra] = colors.map((x) => (x ? rgb(x) : null));
    const leg = [0, 2, 0, -2, 0][frame] || 0;
    const air = frame === 5;
    // ноги
    p.rect(4 + (air ? -1 : leg > 0 ? 1 : 0), 20, 3, 7, pants);
    p.rect(7 + (air ? 1 : leg < 0 ? -1 : 0), 20, 3, 7, shade(pants, 0.85));
    p.rect(3 + (air ? -1 : leg > 0 ? 1 : 0), 27, 4, 3, boots);
    p.rect(7 + (air ? 1 : leg < 0 ? -1 : 0), 27, 4, 3, boots);
    // тело и руки
    p.rect(3, 10, 8, 11, shirt);
    p.rect(3, 19, 8, 2, shade(shirt, 0.7));
    p.rect(1, 11 + (leg > 0 ? 1 : 0), 2, 8, shade(shirt, 0.85));
    p.rect(11, 11 + (leg < 0 ? 1 : 0), 2, 8, shade(shirt, 0.85));
    p.rect(1, 19 + (leg > 0 ? 1 : 0), 2, 2, skin);
    p.rect(11, 19 + (leg < 0 ? 1 : 0), 2, 2, skin);
    // голова
    p.rect(3, 1, 8, 9, skin);
    p.rect(3, 0, 8, 3, hair);
    p.rect(2, 1, 2, 5, hair);
    p.px(8, 5, [30, 30, 40]);
    p.px(10, 5, [30, 30, 40]);
    p.rect(8, 8, 2, 1, shade(skin, 0.75));
    if (extra) { p.rect(1, -1 + 1, 12, 2, extra); p.rect(3, -2 + 2, 8, 1, extra); }
    return c;
  }

  const LOOKS = {
    player: ['#f0c8a0', '#5a3418', '#3a78c8', '#3a3f58', '#4a3020', null],
    trader: ['#e0b890', '#2a2a2a', '#b87a2a', '#5a4a3a', '#2a2018', '#7a2a2a'],
    healer: ['#f4d4b8', '#d8d0c0', '#4a9a6a', '#3a6a4a', '#3a3020', '#2a6a4a'],
  };

  function people(kind) {
    return [0, 1, 2, 3, 4, 5].map((f) => human(LOOKS[kind], f));
  }

  function drop(frame) {
    const c = canvas(16, 12);
    const p = painter(c.getContext('2d'), 2);
    const squash = frame === 1 ? 1 : 0;
    p.rect(1, 3 + squash, 14, 9 - squash, [80, 200, 110], 0.85);
    p.rect(3, 1 + squash, 10, 2, [80, 200, 110], 0.85);
    p.rect(3, 4 + squash, 3, 2, [220, 255, 225], 0.8);
    p.rect(5, 6 + squash, 2, 2, [20, 40, 20]);
    p.rect(10, 6 + squash, 2, 2, [20, 40, 20]);
    p.rect(1, 11, 14, 1, [40, 140, 70], 0.9);
    return c;
  }

  function shadeMob(frame) {
    const c = canvas(16, 16);
    const p = painter(c.getContext('2d'), 3);
    p.rect(3, 1, 10, 11, [60, 30, 100], 0.85);
    p.rect(2, 3, 12, 8, [60, 30, 100], 0.85);
    for (let x = 2; x < 14; x += 2) p.rect(x, 11, 2, 2 + ((x + frame) % 4 === 0 ? 2 : 0), [60, 30, 100], 0.7);
    p.rect(5, 5, 2, 2, [255, 230, 120]);
    p.rect(9, 5, 2, 2, [255, 230, 120]);
    return c;
  }

  function mole(frame) {
    const c = canvas(15, 15);
    const p = painter(c.getContext('2d'), 4);
    p.rect(1, 4, 13, 9, rgb('#6a4a3a'));
    p.rect(3, 2, 9, 2, rgb('#6a4a3a'));
    p.rect(11, 6, 4, 4, rgb('#7a5a4a'));
    p.rect(13, 7, 2, 2, rgb('#ff9aa8'));
    p.px(11, 5, [10, 10, 10]);
    const f = frame % 2;
    p.rect(2 + f, 13, 3, 2, rgb('#e0d0c0'));
    p.rect(9 - f, 13, 3, 2, rgb('#e0d0c0'));
    return c;
  }

  function imp(frame) {
    const c = canvas(15, 20);
    const p = painter(c.getContext('2d'), 5);
    const wing = frame % 2 ? 2 : 0;
    p.rect(0, 6 - wing, 4, 6, rgb('#7a1a1a'));
    p.rect(11, 6 - wing, 4, 6, rgb('#7a1a1a'));
    p.rect(4, 5, 7, 10, rgb('#d83a2a'));
    p.rect(4, 0, 2, 3, rgb('#f0e0c0'));
    p.rect(9, 0, 2, 3, rgb('#f0e0c0'));
    p.rect(4, 2, 7, 5, rgb('#e84a3a'));
    p.px(6, 4, [255, 240, 80]);
    p.px(9, 4, [255, 240, 80]);
    p.rect(5, 15, 2, 4, rgb('#a82a1a'));
    p.rect(8, 15, 2, 4, rgb('#a82a1a'));
    return c;
  }

  function colossus(frame) {
    const c = canvas(64, 64);
    const p = painter(c.getContext('2d'), 6);
    for (let y = 4; y < 60; y++) {
      const half = y < 30 ? 14 + y / 3 : 24 - (y - 30) / 4;
      for (let x = Math.floor(32 - half); x < 32 + half; x++) p.px(x, y, p.r(x, y) < 0.25 ? [40, 48, 90] : [28, 34, 72]);
    }
    for (let i = 0; i < 8; i++) p.rect(10 + i * 6, 40 + (i % 3) * 4, 2, 10, [120, 150, 255], 0.35);
    const glow = frame % 2 ? [255, 250, 200] : [180, 210, 255];
    p.rect(22, 20, 7, 5, glow);
    p.rect(36, 20, 7, 5, glow);
    p.rect(30, 8, 4, 4, [255, 255, 255]);
    for (const [x, y] of [[32, 4], [32, 14], [27, 9], [37, 9]]) p.rect(x - 1, y - 1, 2, 2, [255, 240, 160]);
    p.rect(24, 32, 16, 3, [10, 10, 30]);
    return c;
  }

  function heart(frame) {
    const c = canvas(48, 48);
    const p = painter(c.getContext('2d'), 7);
    const beat = frame % 2 ? 1 : 0;
    for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
      const dx = (x - 24) / (22 + beat);
      const dy = (y - 24) / (22 + beat);
      if (dx * dx + dy * dy > 1) continue;
      const v = p.r(x >> 1, y >> 1);
      p.px(x, y, v < 0.2 ? [255, 140, 40] : v < 0.35 ? [200, 60, 20] : [70, 24, 20]);
    }
    p.rect(18, 18, 12, 12, [255, 200, 80], 0.9);
    p.rect(21, 21, 6, 6, [255, 250, 210]);
    return c;
  }

  function particle(color) {
    const c = canvas(2, 2);
    c.getContext('2d').fillStyle = color;
    c.getContext('2d').fillRect(0, 0, 2, 2);
    return c;
  }

  function projectile(kind) {
    const c = canvas(8, 8);
    const p = painter(c.getContext('2d'), 8);
    if (kind === 'colossus') { p.rect(3, 0, 2, 8, [160, 220, 255]); p.rect(0, 3, 8, 2, [160, 220, 255]); p.rect(2, 2, 4, 4, [255, 255, 255]); }
    else { p.rect(1, 1, 6, 6, [255, 120, 30]); p.rect(2, 2, 4, 4, [255, 220, 90]); }
    return c;
  }

  const MOBS = { drop: [0, 1].map(drop), shade: [0, 1, 2, 3].map(shadeMob), mole: [0, 1].map(mole), imp: [0, 1].map(imp), colossus: [0, 1].map(colossus), heart: [0, 1].map(heart) };

  const cache = new Map();
  function cached(key, make) {
    let v = cache.get(key);
    if (!v) { v = make(); cache.set(key, v); }
    return v;
  }

  SB.Tex = {
    TS, VARIANTS, canvas, rgb,
    block: (id, v) => cached('b' + id + ':' + v, () => block(id, v)),
    wall: (id, v) => cached('w' + id + ':' + v, () => wall(id, v)),
    icon: (id) => cached('i' + id, () => icon(id)),
    iconURL: (id) => cached('u' + id, () => {
      const big = canvas(32);
      const ctx = big.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(icon(id), 0, 0, 32, 32);
      return big.toDataURL();
    }),
    people: (kind) => cached('p' + kind, () => people(kind)),
    mob: (kind) => MOBS[kind],
    particle: (color) => cached('pt' + color, () => particle(color)),
    projectile: (kind) => cached('pr' + kind, () => projectile(kind)),
  };
})(typeof self !== 'undefined' ? self : this);

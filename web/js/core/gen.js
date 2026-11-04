// Генерация мира по зерну. Каждая клетка - чистая функция (зерно, x, y): чанк не зависит от
// того, какие чанки созданы раньше, поэтому на границах всё совпадает само собой.
//
// Сверху вниз: небо, холмы (лес, пустыня, снега), земля, камень с пещерами, рудами и
// озёрами, глубокие пещеры с лавой, внизу подземный ад из пепла с лавовыми озёрами.
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./noise.js') : root.SB.Noise,
    typeof module === 'object' && module.exports ? require('./data.js') : root.SB.Data);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.SB = root.SB || {}).Gen = api;
})(typeof self !== 'undefined' ? self : this, function (N, D) {
/* c8 ignore stop */
  'use strict';
  const { B, W, L } = D;
  const CH = 32;
  const BIOMES = Object.freeze(['forest', 'desert', 'snow']);

  function dims(w, h) {
    const width = w || 1600;
    const height = h || 576;
    return Object.freeze({ W: width, H: height, hellTop: height - 72, spawnX: Math.floor(width / 2) });
  }

  function biomeAt(seed, x, d) {
    if (Math.abs(x - d.spawnX) < 60) return 'forest';
    const v = N.fbm1(seed + 11, x, 2, 260);
    if (v < 0.4) return 'desert';
    if (v > 0.6) return 'snow';
    return 'forest';
  }

  function surfaceAt(seed, x, d) {
    const base = d.H * 0.26;
    const mountain = N.fbm1(seed + 29, x, 2, 200);
    const amp = 14 + 46 * mountain * mountain;
    return Math.round(base + (N.fbm1(seed + 3, x, 4, 90) - 0.5) * amp * 2);
  }

  function hellTopAt(seed, x, d) {
    return d.hellTop + Math.floor(N.value1(seed + 41, x / 20) * 8);
  }

  function column(seed, x, d) {
    return {
      x,
      biome: biomeAt(seed, x, d),
      surface: surfaceAt(seed, x, d),
      dirt: 5 + Math.floor(N.rand(seed, x, 7) * 5),
      hell: hellTopAt(seed, x, d),
      floor: d.H - 1 - Math.floor(N.rand(seed, x, 9) * 3),
    };
  }

  // растение в столбце x: дерево, ель или кактус; null - пусто
  function plantAt(seed, x, d) {
    if (x < 3 || x > d.W - 4) return null;
    const cand = (i) => N.rand(seed, i, 201) < 0.17;
    if (!cand(x) || cand(x - 1) || cand(x - 2)) return null;
    const biome = biomeAt(seed, x, d);
    const s = surfaceAt(seed, x, d);
    if (Math.abs(surfaceAt(seed, x - 1, d) - s) > 1 || Math.abs(surfaceAt(seed, x + 1, d) - s) > 1) return null;
    const r = N.rand(seed, x, 211);
    if (biome === 'desert') {
      if (r > 0.45) return null;
      return { kind: 'cactus', x, base: s, height: 2 + Math.floor(r * 6.7), seed };
    }
    if (biome === 'snow') return { kind: 'pine', x, base: s, height: 7 + Math.floor(r * 5), seed };
    return { kind: 'tree', x, base: s, height: 5 + Math.floor(r * 5), seed };
  }

  // блок растения в клетке (x, y) над землёй
  function plantCell(plants, x, y) {
    for (const p of plants) {
      if (!p) continue;
      const top = p.base - p.height;
      const dx = x - p.x;
      if (dx === 0 && y < p.base && y >= top) return p.kind === 'cactus' ? B.CACTUS : B.LOG;
      if (p.kind === 'tree') {
        // круглая крона радиусом около 2.7 клетки, края рваные по зерну
        const dy = y - top + 0.5;
        const r2 = dx * dx + dy * dy * 1.2;
        if ((dx !== 0 || y < top) && r2 <= 8.2 && (r2 <= 5 || N.rand(p.seed, x, y) < 0.55)) return B.LEAVES;
      } else if (p.kind === 'pine') {
        const dy = y - top;
        if (dy >= -1 && y < p.base - 2) {
          const half = Math.min(3, (dy + 2) >> 1);
          if (Math.abs(dx) <= half && (dx !== 0 || dy < 0)) return B.PINE;
        }
      }
    }
    return B.AIR;
  }

  // пещера: тоннели (тонкая полоса шума) и залы (пятна шума), глубже - шире
  function caveAt(seed, x, y, depth) {
    const tunnel = depth > 3 && Math.abs(N.fbm2(seed + 71, x, y * 1.8, 3, 60) - 0.5) < 0.03 + Math.min(0.025, depth / 6000);
    return tunnel || (depth > 12 && N.fbm2(seed + 83, x, y, 3, 30) > 0.66 - Math.min(0.06, depth / 4000));
  }

  // одна клетка: [блок, стена, жидкость]
  function cell(seed, x, y, col, plants, d) {
    if (x <= 0 || x >= d.W - 1 || y >= col.floor) return [B.BEDROCK, W.NONE, 0];
    if (y < col.surface) {
      if (y < 0) return [B.AIR, W.NONE, 0];
      return [plantCell(plants, x, y), W.NONE, 0];
    }
    const depth = y - col.surface;
    if (y >= col.hell) {
      let fg = B.ASH;
      if (N.fbm2(seed + 51, x, y * 1.6, 3, 40) > 0.52) {
        const lava = y > d.H - 22 ? (L.LAVA << 4) | L.FULL : 0;
        return [B.AIR, W.NONE, lava];
      }
      if (N.fbm2(seed + 61, x, y, 2, 6) > 0.7) fg = B.MAGMITE;
      return [fg, W.ASH, 0];
    }
    let fg;
    let wall;
    const desert = col.biome === 'desert';
    if (depth === 0) fg = desert ? B.SAND : col.biome === 'snow' ? B.SNOW : B.GRASS;
    else if (depth < col.dirt) fg = desert ? B.SAND : col.biome === 'snow' && depth < 3 ? B.SNOW : B.DIRT;
    else if (desert && depth < col.dirt + 5) fg = B.SAND;
    else if (desert && depth < 40) fg = B.SANDSTONE;
    else fg = B.STONE;
    if (fg === B.STONE && depth < 120 && N.fbm2(seed + 91, x, y, 2, 12) > 0.72) fg = B.DIRT;
    if (fg === B.STONE && col.biome === 'snow' && depth < 70 && N.fbm2(seed + 97, x, y, 2, 10) > 0.7) fg = B.ICE;
    if (depth <= 2) wall = W.NONE;
    else if (fg === B.SAND || fg === B.SANDSTONE) wall = W.SANDSTONE;
    else if (fg === B.DIRT || fg === B.SNOW || fg === B.GRASS) wall = W.DIRT;
    else wall = W.STONE;

    if (caveAt(seed, x, y, depth)) {
      // озёра только у дна пещеры: в двух клетках ниже уже порода
      let liq = 0;
      const floor = !caveAt(seed, x, y + 1, depth + 1) || !caveAt(seed, x, y + 2, depth + 2);
      if (floor && y < col.hell - 40 && depth > 20 && N.fbm2(seed + 131, x, y, 2, 25) > 0.6) liq = (L.WATER << 4) | L.FULL;
      else if (floor && y > d.H * 0.7 && N.fbm2(seed + 137, x, y, 2, 25) > 0.64) liq = (L.LAVA << 4) | L.FULL;
      return [B.AIR, wall, liq];
    }
    if (fg === B.STONE) {
      if (depth > 4 && depth < 260 && N.fbm2(seed + 101, x, y, 2, 5) > 0.77) fg = B.COPPER;
      else if (depth > 40 && N.fbm2(seed + 113, x, y, 2, 5) > 0.79) fg = B.IRON;
      else if (y > d.H * 0.55 && N.fbm2(seed + 127, x, y, 2, 4) > 0.81) fg = B.CRYSTAL;
    }
    return [fg, wall, 0];
  }

  function genChunk(seed, cx, cy, d) {
    const n = CH * CH;
    const fg = new Uint8Array(n);
    const wall = new Uint8Array(n);
    const liq = new Uint8Array(n);
    const x0 = cx * CH;
    const y0 = cy * CH;
    const plantsAll = [];
    for (let x = x0 - 3; x < x0 + CH + 3; x++) plantsAll.push(plantAt(seed, x, d));
    for (let i = 0; i < CH; i++) {
      const x = x0 + i;
      const col = column(seed, x, d);
      const plants = plantsAll.slice(i, i + 7);
      for (let j = 0; j < CH; j++) {
        const y = y0 + j;
        const k = j * CH + i;
        if (x < 0 || x >= d.W || y < 0 || y >= d.H) { fg[k] = y < 0 ? B.AIR : B.BEDROCK; continue; }
        const c = cell(seed, x, y, col, plants, d);
        fg[k] = c[0];
        wall[k] = c[1];
        liq[k] = c[2];
      }
    }
    return { fg, wall, liq };
  }

  function spawnPoint(seed, d) {
    const x = d.spawnX;
    return { x: x + 0.5, y: surfaceAt(seed, x, d) };
  }

  return { CH, BIOMES, dims, biomeAt, surfaceAt, hellTopAt, column, plantAt, caveAt, cell, genChunk, spawnPoint };
});

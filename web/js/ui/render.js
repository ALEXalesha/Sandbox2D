// Отрисовка на PixiJS (WebGL). Мир - спрайты чанков 32 x 32 клетки: каждый чанк рисуется на
// своём холсте (стены, блоки, жидкости) и обновляется, когда в нём что-то изменилось. Поверх -
// жители, враги, игрок, частицы и слой темноты из карты света (одна клетка - один пиксель,
// растянутый с плавным переходом).
(function (root) {
  'use strict';
  const SB = root.SB;
  const { Data: D, World: Wd, Tex, Time: T, Noise: N, Mobs: M } = SB;
  const TS = Tex.TS;
  const CH = Wd.CH;
  const CPX = CH * TS;
  const REDRAW_PER_FRAME = 6;
  const MAX_PARTICLES = 320;

  function create(PIXI, host) {
    PIXI.TextureStyle.defaultOptions.scaleMode = 'nearest';
    const app = new PIXI.Application();
    const r = { PIXI, app, ready: false, zoom: 2, cam: { x: 0, y: 0 }, chunks: new Map(), sprites: new Map(), particles: [], game: null, serial: 0 };

    r.init = async function () {
      await app.init({ resizeTo: host, background: 0x7ec8ff, antialias: false, preference: 'webgl', autoDensity: true, resolution: Math.min(2, root.devicePixelRatio || 1) });
      host.appendChild(app.canvas);
      app.canvas.id = 'view';
      r.bg = new PIXI.Container();
      r.stars = new PIXI.Graphics();
      r.hillsFar = new PIXI.Graphics();
      r.hillsNear = new PIXI.Graphics();
      r.bg.addChild(r.stars, r.hillsFar, r.hillsNear);
      r.world = new PIXI.Container();
      r.chunkLayer = new PIXI.Container();
      r.entityLayer = new PIXI.Container();
      r.fxLayer = new PIXI.Container();
      r.lightCanvas = document.createElement('canvas');
      r.lightTex = null;
      r.lightSprite = new PIXI.Sprite();
      r.cursor = new PIXI.Graphics();
      r.bars = new PIXI.Graphics();
      r.world.addChild(r.chunkLayer, r.entityLayer, r.fxLayer, r.lightSprite, r.bars, r.cursor);
      app.stage.addChild(r.bg, r.world);
      r.drawHills();
      r.ready = true;
    };

    r.setGame = function (game) {
      for (const c of r.chunks.values()) { c.sprite.destroy(); c.tex.destroy(true); }
      r.chunks.clear();
      for (const s of r.sprites.values()) s.destroy();
      r.sprites.clear();
      for (const p of r.particles) p.s.destroy();
      r.particles = [];
      r.game = game;
      r.lightVersion = -1;
      if (game) {
        const [cx, cy] = SB.Game.center(game.player.body);
        r.cam.x = cx;
        r.cam.y = cy;
      }
    };

    // ---------- чанки ----------

    function paintChunk(world, cx, cy, ctx) {
      ctx.clearRect(0, 0, CPX, CPX);
      const x0 = cx * CH;
      const y0 = cy * CH;
      const c = Wd.chunk(world, cx, cy);
      for (let j = 0; j < CH; j++) {
        for (let i = 0; i < CH; i++) {
          const k = j * CH + i;
          const x = x0 + i;
          const y = y0 + j;
          const fg = c.fg[k];
          const wall = c.wall[k];
          const v = N.hash(7, x, y) & 3;
          if (wall && !D.opaque[fg]) {
            ctx.drawImage(Tex.wall(wall, v), i * TS, j * TS);
            ctx.fillStyle = 'rgba(0,0,0,0.38)';
            ctx.fillRect(i * TS, j * TS, TS, TS);
          }
          if (fg) {
            ctx.drawImage(Tex.block(fg, v), i * TS, j * TS);
            if (D.opaque[fg]) {
              ctx.fillStyle = 'rgba(0,0,0,0.28)';
              if (!D.opaque[Wd.get(world, x, y - 1)]) { ctx.fillStyle = 'rgba(255,255,255,0.16)'; ctx.fillRect(i * TS, j * TS, TS, 1); ctx.fillStyle = 'rgba(0,0,0,0.28)'; }
              if (!D.opaque[Wd.get(world, x, y + 1)]) ctx.fillRect(i * TS, j * TS + TS - 1, TS, 1);
              if (!D.opaque[Wd.get(world, x - 1, y)]) ctx.fillRect(i * TS, j * TS, 1, TS);
              if (!D.opaque[Wd.get(world, x + 1, y)]) ctx.fillRect(i * TS + TS - 1, j * TS, 1, TS);
            }
          }
          const lq = c.liq[k];
          if (lq) {
            const a = lq & 15;
            const h = Math.max(2, Math.round((a / 8) * TS));
            const top = Wd.getLiq(world, x, y - 1) && !Wd.get(world, x, y - 1) ? 0 : TS - h;
            const lava = lq >> 4 === D.L.LAVA;
            ctx.fillStyle = lava ? 'rgba(255,96,24,0.92)' : 'rgba(48,118,230,0.62)';
            ctx.fillRect(i * TS, j * TS + top, TS, TS - top);
            if (top > 0 || !Wd.getLiq(world, x, y - 1)) {
              ctx.fillStyle = lava ? 'rgba(255,214,90,0.95)' : 'rgba(170,215,255,0.8)';
              ctx.fillRect(i * TS, j * TS + top, TS, 1);
            }
            if (lava && (N.hash(3, x, y) & 7) === 0) { ctx.fillStyle = 'rgba(255,230,120,0.9)'; ctx.fillRect(i * TS + 5, j * TS + top + 4, 3, 2); }
          }
        }
      }
    }

    function chunkEntry(cx, cy) {
      const key = Wd.key(cx, cy);
      let e = r.chunks.get(key);
      if (!e) {
        const canvas = document.createElement('canvas');
        canvas.width = CPX;
        canvas.height = CPX;
        const tex = PIXI.Texture.from(canvas);
        tex.source.scaleMode = 'nearest';
        const sprite = new PIXI.Sprite(tex);
        sprite.x = cx * CPX;
        sprite.y = cy * CPX;
        r.chunkLayer.addChild(sprite);
        e = { key, cx, cy, canvas, ctx: canvas.getContext('2d'), tex, sprite, dirty: true };
        r.chunks.set(key, e);
      }
      return e;
    }

    function updateChunks(view) {
      const world = r.game.world;
      for (const key of Wd.changes(world)) {
        const e = r.chunks.get(key);
        if (e) e.dirty = true;
      }
      const cx0 = Math.max(0, Math.floor(view.x0 / CH));
      const cy0 = Math.max(0, Math.floor(view.y0 / CH));
      const cx1 = Math.min(world.cw - 1, Math.floor(view.x1 / CH));
      const cy1 = Math.min(world.chh - 1, Math.floor(view.y1 / CH));
      let budget = REDRAW_PER_FRAME;
      for (let cy = cy0; cy <= cy1; cy++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          const e = chunkEntry(cx, cy);
          e.sprite.visible = true;
          if (e.dirty && (budget > 0 || !e.painted)) {
            paintChunk(world, cx, cy, e.ctx);
            e.tex.source.update();
            e.dirty = false;
            e.painted = true;
            budget--;
          }
        }
      }
      for (const e of r.chunks.values()) {
        const far = e.cx < cx0 - 2 || e.cx > cx1 + 2 || e.cy < cy0 - 2 || e.cy > cy1 + 2;
        if (far) {
          e.sprite.destroy();
          e.tex.destroy(true);
          r.chunks.delete(e.key);
        } else if (e.cx < cx0 || e.cx > cx1 || e.cy < cy0 || e.cy > cy1) e.sprite.visible = false;
      }
    }

    // ---------- свет ----------

    function updateLight() {
      const map = r.game.light;
      if (!map) return;
      if (map === r.lightMap) return;
      r.lightMap = map;
      const cv = r.lightCanvas;
      if (cv.width !== map.w || cv.height !== map.h) {
        cv.width = map.w;
        cv.height = map.h;
        if (r.lightTex) r.lightTex.destroy(true);
        r.lightTex = null;
      }
      const ctx = cv.getContext('2d');
      const img = ctx.createImageData(map.w, map.h);
      for (let i = 0; i < map.data.length; i++) {
        const l = map.data[i] / 15;
        img.data[i * 4 + 3] = Math.round(255 * Math.pow(1 - l, 1.4) * 0.97);
      }
      ctx.putImageData(img, 0, 0);
      if (!r.lightTex) {
        r.lightTex = PIXI.Texture.from(cv);
        r.lightTex.source.scaleMode = 'linear';
        r.lightSprite.texture = r.lightTex;
      } else r.lightTex.source.update();
      r.lightSprite.x = (map.x0 + 0.5) * TS - TS / 2;
      r.lightSprite.y = (map.y0 + 0.5) * TS - TS / 2;
      r.lightSprite.width = map.w * TS;
      r.lightSprite.height = map.h * TS;
    }

    // ---------- существа ----------

    const texCache = new Map();
    function texOf(canvas) {
      let t = texCache.get(canvas);
      if (!t) { t = PIXI.Texture.from(canvas); t.source.scaleMode = 'nearest'; texCache.set(canvas, t); }
      return t;
    }

    function spriteFor(key, layer) {
      let s = r.sprites.get(key);
      if (!s) {
        s = new PIXI.Sprite();
        s.anchor.set(0.5, 1);
        (layer || r.entityLayer).addChild(s);
        r.sprites.set(key, s);
      }
      s.seen = true;
      return s;
    }

    function drawBody(key, b, frames, frame, facing, tint) {
      const s = spriteFor(key);
      s.texture = texOf(frames[frame % frames.length]);
      s.x = (b.x + b.w / 2) * TS;
      s.y = (b.y + b.h) * TS + 0.5;
      s.scale.x = facing < 0 ? -1 : 1;
      s.tint = tint || 0xffffff;
      return s;
    }

    function walkFrame(b, t) {
      if (!b.onGround) return 5;
      if (Math.abs(b.vx) < 0.5) return 0;
      return 1 + (Math.floor(t * 10) % 4);
    }

    function drawEntities(now) {
      const g = r.game;
      for (const s of r.sprites.values()) s.seen = false;
      for (const d of g.drops) {
        if (!d.uid) d.uid = ++r.serial;
        const s = spriteFor('d' + d.uid);
        s.texture = texOf(Tex.icon(d.id));
        s.scale.set(0.7);
        s.x = (d.x + 0.3) * TS;
        s.y = (d.y + 0.6) * TS + Math.sin(now * 4 + d.x) * 1.5;
      }
      for (const res of g.residents) {
        drawBody('r' + res.kind, res, Tex.people(res.kind), walkFrame(res, now), res.vx < -0.1 ? -1 : 1);
      }
      for (const m of g.mobs) {
        const frames = Tex.mob(m.kind);
        const frame = m.kind === 'drop' ? (m.onGround ? 0 : 1) : Math.floor(now * 6 + m.id) % frames.length;
        const facing = (r.game.player.body.x < m.x) ? -1 : 1;
        drawBody('m' + m.id, m, frames, frame, m.kind === 'colossus' || m.kind === 'heart' ? 1 : facing, m.hurtT > 0 ? 0xff8080 : 0xffffff);
      }
      const p = g.player;
      if (!p.dead) {
        const blink = p.invuln > 0 && Math.floor(now * 12) % 2 === 0;
        const s = drawBody('player', p.body, Tex.people('player'), walkFrame(p.body, now), p.facing);
        s.alpha = blink ? 0.45 : 1;
        drawHeld(p, now);
      }
      for (const [i, pr] of g.projectiles.entries()) {
        const s = spriteFor('pr' + i);
        s.anchor.set(0.5);
        s.texture = texOf(Tex.projectile(pr.kind));
        s.x = pr.x * TS;
        s.y = pr.y * TS;
        s.rotation = now * 8;
      }
      for (const [k, s] of r.sprites) {
        if (!s.seen) { s.destroy(); r.sprites.delete(k); }
      }
    }

    function drawHeld(p, now) {
      const slot = r.game.inv[p.slot];
      if (!slot) return;
      const it = D.ITEMS[slot.id];
      const s = spriteFor('held');
      s.texture = texOf(Tex.icon(slot.id));
      s.anchor.set(0.15, 0.85);
      const b = p.body;
      const busy = p.swing > 0 || (p.mining && it.kind === 'pick');
      const swingK = p.swing > 0 ? 1 - p.swing / 0.25 : (Math.sin(now * 18) + 1) / 2;
      const base = it.kind === 'sword' || it.kind === 'pick' ? -1.2 : -0.3;
      const angle = busy ? base + swingK * 2.2 : -0.4;
      s.rotation = p.facing * angle;
      s.scale.set(p.facing * 0.9, 0.9);
      s.x = (b.x + b.w / 2 + p.facing * 0.35) * TS;
      s.y = (b.y + b.h * 0.6) * TS;
    }

    // ---------- частицы ----------

    function burst(x, y, color, n, speed) {
      for (let i = 0; i < n && r.particles.length < MAX_PARTICLES; i++) {
        const s = new PIXI.Sprite(texOf(Tex.particle(color)));
        s.anchor.set(0.5);
        r.fxLayer.addChild(s);
        const a = Math.random() * Math.PI * 2;
        const v = (0.5 + Math.random()) * (speed || 6);
        r.particles.push({ s, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 3, life: 0.5 + Math.random() * 0.5 });
      }
    }

    const blockColor = (id) => (D.BLOCKS[id] ? D.BLOCKS[id].colors[Math.min(1, D.BLOCKS[id].colors.length - 1)] : '#888888');

    r.events = function (events) {
      for (const e of events) {
        if (e.type === 'break') burst(e.x + 0.5, e.y + 0.5, e.wall ? D.WALLS[e.wall].color : blockColor(e.block), 10, 6);
        else if (e.type === 'dig') burst(e.x + 0.5, e.y + 0.5, blockColor(e.block), 2, 4);
        else if (e.type === 'hit' || e.type === 'hurt') burst(e.x, e.y + 0.5, '#ff4a4a', 6, 7);
        else if (e.type === 'burn') burst(e.x, e.y, '#ffb347', 3, 3);
        else if (e.type === 'kill') burst(e.x, e.y, '#ffffff', 14, 8);
        else if (e.type === 'obsidian') burst(e.x + 0.5, e.y + 0.5, '#c8c8d8', 12, 5);
      }
    };

    function updateParticles(dt) {
      for (const p of r.particles) {
        p.vy += 20 * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.life -= dt;
        p.s.x = p.x * TS;
        p.s.y = p.y * TS;
        p.s.alpha = Math.max(0, Math.min(1, p.life * 2));
      }
      for (const p of r.particles) if (p.life <= 0) p.s.destroy();
      r.particles = r.particles.filter((p) => p.life > 0);
    }

    // ---------- фон ----------

    r.drawHills = function () {
      const w = 4096;
      for (const [g, color, amp, base, freq] of [[r.hillsFar, 0x5d8a6a, 60, 0.55, 0.004], [r.hillsNear, 0x3f6e4c, 50, 0.7, 0.007]]) {
        g.clear();
        g.moveTo(0, 3000);
        for (let x = 0; x <= w; x += 16) g.lineTo(x, -(N.fbm1(g === r.hillsFar ? 11 : 12, x * freq, 3, 1) - 0.5 + base * 0.2) * amp * 4);
        g.lineTo(w, 3000);
        g.closePath();
        g.fill({ color });
      }
      r.stars.clear();
      for (let i = 0; i < 160; i++) r.stars.rect((N.rand(1, i, 1) * 4096) | 0, (N.rand(1, i, 2) * 600) | 0, 2, 2).fill({ color: 0xffffff, alpha: 0.5 + N.rand(1, i, 3) * 0.5 });
    };

    function drawBackground(sw, sh, dl) {
      const sky = T.sky(r.game.time);
      const camDepth = r.cam.y - r.game.world.dims.H * 0.26;
      const under = Math.max(0, Math.min(1, (camDepth - 10) / 40));
      const dark = [12, 10, 16];
      const c = sky.map((v, i) => Math.round(v + (dark[i] - v) * under));
      app.renderer.background.color = (c[0] << 16) | (c[1] << 8) | c[2];
      const sx = -((r.cam.x * TS * 0.15) % 2048);
      r.hillsFar.x = sx - 1024;
      const px = TS * (r.zoomUsed || r.zoom);
      r.hillsFar.y = sh * 0.46 - camDepth * px * 0.15;
      r.hillsNear.x = -((r.cam.x * TS * 0.3) % 2048) - 1024;
      r.hillsNear.y = sh * 0.56 - camDepth * px * 0.3;
      const tint = Math.round(80 + 175 * dl);
      r.hillsFar.tint = (tint << 16) | (tint << 8) | tint;
      r.hillsNear.tint = (tint << 16) | (tint << 8) | tint;
      r.hillsFar.alpha = r.hillsNear.alpha = 1 - under;
      r.stars.alpha = (1 - dl) * (1 - under);
      r.stars.x = -((r.cam.x * 2) % 1024);
      void sw;
    }

    // ---------- кадр ----------

    r.view = function () {
      const sw = app.screen.width;
      const sh = app.screen.height;
      const s = TS * r.zoom;
      return { x0: r.cam.x - sw / s / 2, y0: r.cam.y - sh / s / 2, x1: r.cam.x + sw / s / 2, y1: r.cam.y + sh / s / 2 };
    };

    // масштаб тот же, каким нарисован кадр (на большом экране он не меньше minZoom)
    r.toWorld = function (sx, sy) {
      const s = TS * (r.zoomUsed || r.zoom);
      return [(sx - r.world.x) / s, (sy - r.world.y) / s];
    };

    r.toScreen = function (x, y) {
      const s = TS * (r.zoomUsed || r.zoom);
      return [x * s + r.world.x, y * s + r.world.y];
    };

    // наименьший масштаб, при котором экран целиком внутри карты света
    r.minZoom = function () {
      const A = SB.Game.AREA;
      return Math.max(1, app.screen.width / ((A.x * 2 - 8) * TS), app.screen.height / ((A.y * 2 - 8) * TS));
    };

    r.frame = function (dt, now, aim) {
      if (!r.ready || !r.game) return;
      const g = r.game;
      const [px, py] = SB.Game.center(g.player.body);
      const k = Math.min(1, dt * 8);
      r.cam.x += (px - r.cam.x) * k;
      r.cam.y += (py - r.cam.y) * k;
      const z = Math.max(r.zoom, r.minZoom());
      const sw = app.screen.width;
      const sh = app.screen.height;
      const s = TS * z;
      const halfW = sw / s / 2;
      const halfH = sh / s / 2;
      r.cam.x = Math.max(halfW, Math.min(g.world.W - halfW, r.cam.x));
      r.cam.y = Math.max(halfH - 20, Math.min(g.world.H - halfH, r.cam.y));
      r.world.scale.set(z);
      r.world.x = Math.round(sw / 2 - r.cam.x * s);
      r.world.y = Math.round(sh / 2 - r.cam.y * s);
      r.zoomUsed = z;
      const dl = T.daylight(g.time);
      drawBackground(sw, sh, dl);
      updateChunks({ x0: r.cam.x - halfW - 1, y0: r.cam.y - halfH - 1, x1: r.cam.x + halfW + 1, y1: r.cam.y + halfH + 1 });
      updateLight();
      drawEntities(now);
      updateParticles(dt);
      drawCursor(aim);
      drawBars();
    };

    // полоски здоровья над ранеными врагами (кроме боссов - у них полоса сверху экрана)
    function drawBars() {
      const g = r.bars;
      g.clear();
      for (const m of r.game.mobs) {
        if (m.hp >= m.maxHp || M.TYPES[m.kind].boss) continue;
        const x = (m.x + m.w / 2) * TS - 8;
        const y = m.y * TS - 5;
        g.rect(x, y, 16, 3).fill({ color: 0x000000, alpha: 0.6 });
        g.rect(x, y, 16 * Math.max(0, m.hp / m.maxHp), 3).fill({ color: 0xff5050 });
      }
    }

    function drawCursor(aim) {
      const c = r.cursor;
      c.clear();
      if (!aim || r.game.player.dead) return;
      const x = Math.floor(aim[0]);
      const y = Math.floor(aim[1]);
      const ok = SB.Game.inReach(r.game, x, y);
      c.rect(x * TS, y * TS, TS, TS).stroke({ width: 1, color: ok ? 0xffffff : 0xff6060, alpha: ok ? 0.85 : 0.5 });
      const m = r.game.player.mining;
      if (m && m.progress > 0) {
        c.rect(x * TS + 1, y * TS + TS - 3, (TS - 2) * Math.min(1, m.progress), 2).fill({ color: 0xffe080, alpha: 0.9 });
        c.rect(x * TS, y * TS, TS, TS).fill({ color: 0x000000, alpha: 0.35 * m.progress });
      }
    }

    r.destroy = function () {
      app.destroy(true, { children: true, texture: true });
    };

    return r;
  }

  SB.Render = { create, TS };
})(typeof self !== 'undefined' ? self : this);

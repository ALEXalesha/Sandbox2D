// Тело - прямоугольник (x, y - левый верхний угол, в клетках; y растёт вниз). Движение по
// осям отдельно, мелкими шагами меньше клетки: сначала x (с автоподъёмом на одну ступень),
// потом y. После любого шага тело не пересекает твёрдые клетки.
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(req ? require('./world.js') : root.SB.World, req ? require('./data.js') : root.SB.Data);
  if (req) module.exports = api;
  else (root.SB = root.SB || {}).Physics = api;
})(typeof self !== 'undefined' ? self : this, function (Wd, D) {
  'use strict';
  const EPS = 1e-4;
  const C = Object.freeze({
    GRAVITY: 62,
    MAX_FALL: 34,
    WALK: 9,
    ACCEL: 70,
    FRICTION: 55,
    AIR_CONTROL: 0.6,
    JUMP_V: 21.5,
    SWIM_V: 9,
    WATER_DRAG: 0.5,
    STEP: 1,
    SUB: 0.4,
  });

  function body(x, y, w, h) {
    return { x, y, w, h, vx: 0, vy: 0, onGround: false, inLiquid: 0, fall: 0 };
  }

  // есть ли твёрдая клетка в прямоугольнике
  function hits(world, x, y, w, h) {
    const x1 = Math.floor(x + EPS);
    const x2 = Math.floor(x + w - EPS);
    const y1 = Math.floor(y + EPS);
    const y2 = Math.floor(y + h - EPS);
    for (let cy = y1; cy <= y2; cy++) {
      for (let cx = x1; cx <= x2; cx++) if (Wd.solidAt(world, cx, cy)) return true;
    }
    return false;
  }

  const overlaps = (world, b) => hits(world, b.x, b.y, b.w, b.h);

  // жидкость в теле: 0 - нет, иначе тип (1 вода, 2 лава) самой «опасной»
  function liquidIn(world, b) {
    let best = 0;
    const x1 = Math.floor(b.x + EPS);
    const x2 = Math.floor(b.x + b.w - EPS);
    const y1 = Math.floor(b.y + b.h * 0.4);
    const y2 = Math.floor(b.y + b.h - EPS);
    for (let cy = y1; cy <= y2; cy++) {
      for (let cx = x1; cx <= x2; cx++) {
        const v = Wd.getLiq(world, cx, cy);
        if ((v & 15) >= 2 && v >> 4 > best) best = v >> 4;
      }
    }
    return best;
  }

  function moveX(world, b, dx, canStep) {
    let left = dx;
    let stepped = false;
    while (Math.abs(left) > EPS) {
      const d = Math.max(-C.SUB, Math.min(C.SUB, left));
      if (!hits(world, b.x + d, b.y, b.w, b.h)) {
        b.x += d;
        left -= d;
        continue;
      }
      // ступень в одну клетку: поднять тело, если сверху свободно
      if (canStep && !hits(world, b.x + d, b.y - C.STEP, b.w, b.h) && !hits(world, b.x, b.y - C.STEP, b.w, b.h)) {
        const lift = liftNeeded(world, b, d);
        if (lift > 0) {
          b.y -= lift;
          b.x += d;
          left -= d;
          stepped = true;
          continue;
        }
      }
      // упёрлись: прижаться к краю клетки
      const prevX = b.x;
      if (d > 0) b.x = Math.floor(b.x + b.w + d - EPS) - b.w - EPS;
      else b.x = Math.floor(b.x + d + EPS) + 1 + EPS;
      if (hits(world, b.x, b.y, b.w, b.h) || Math.sign(b.x - prevX) === -Math.sign(d)) b.x = prevX;
      b.vx = 0;
      break;
    }
    return stepped;
  }

  // на сколько поднять тело, чтобы встать на ступень (0 - нельзя)
  function liftNeeded(world, b, d) {
    const bottom = b.y + b.h;
    const target = Math.floor(bottom - EPS) - b.h;
    const lift = b.y - target;
    if (lift <= 0 || lift > C.STEP + EPS) return 0;
    if (hits(world, b.x + d, target, b.w, b.h)) return 0;
    return lift;
  }

  function moveY(world, b, dy) {
    let left = dy;
    b.onGround = false;
    while (Math.abs(left) > EPS) {
      const d = Math.max(-C.SUB, Math.min(C.SUB, left));
      if (!hits(world, b.x, b.y + d, b.w, b.h)) {
        b.y += d;
        left -= d;
        continue;
      }
      const prevY = b.y;
      if (d > 0) {
        b.y = Math.floor(b.y + b.h + d - EPS) - b.h - EPS;
        b.onGround = true;
      } else {
        b.y = Math.floor(b.y + d + EPS) + 1 + EPS;
      }
      if (hits(world, b.x, b.y, b.w, b.h) || Math.sign(b.y - prevY) === -Math.sign(d)) b.y = prevY;
      b.vy = 0;
      break;
    }
    if (!b.onGround && b.vy >= 0 && hits(world, b.x, b.y + 0.02, b.w, b.h)) b.onGround = true;
  }

  // ввод: { left, right, jump, down }; возвращает высоту падения при приземлении (клетки)
  function step(world, b, input, dt) {
    const inp = input || {};
    b.inLiquid = liquidIn(world, b);
    const wet = b.inLiquid > 0;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    const speed = C.WALK * (wet ? 0.55 : 1) * (b.speedMul || 1);
    const accel = C.ACCEL * (b.onGround ? 1 : C.AIR_CONTROL);
    if (dir !== 0) {
      b.vx += dir * accel * dt;
      if (b.vx > speed) b.vx = Math.max(speed, b.vx - C.FRICTION * dt);
      if (b.vx < -speed) b.vx = Math.min(-speed, b.vx + C.FRICTION * dt);
    } else {
      const f = C.FRICTION * dt * (b.onGround ? 1 : 0.3);
      b.vx = Math.abs(b.vx) <= f ? 0 : b.vx - Math.sign(b.vx) * f;
    }
    if (inp.jump) {
      if (b.onGround) { b.vy = -C.JUMP_V; b.onGround = false; }
      else if (wet && b.vy > -C.SWIM_V) b.vy = -C.SWIM_V;
    }
    const g = C.GRAVITY * (wet ? C.WATER_DRAG : 1);
    b.vy = Math.min(b.vy + g * dt, wet ? C.MAX_FALL * 0.3 : C.MAX_FALL);
    const wasGround = b.onGround;
    if (b.vy > 0 && !b.onGround) b.fall += b.vy * dt;
    if (wet || b.vy < 0) b.fall = 0;
    moveX(world, b, b.vx * dt, wasGround);
    moveY(world, b, b.vy * dt);
    let landed = 0;
    if (b.onGround && !wasGround) { landed = b.fall; b.fall = 0; }
    if (b.onGround) b.fall = 0;
    unstick(world, b);
    return landed;
  }

  // тело оказалось в блоке (блок поставили, лава стала обсидианом): вытолкнуть в ближнее
  // свободное место - сначала вверх, потом в стороны и вниз
  function unstick(world, b) {
    if (!overlaps(world, b)) return false;
    const ox = b.x;
    const oy = b.y;
    for (let r = 1; r <= 12; r++) {
      const tries = [[0, -r], [-r, 0], [r, 0], [0, r], [-r, -r], [r, -r], [-r, r], [r, r]];
      for (const [dx, dy] of tries) {
        const nx = Math.floor(ox) + dx + (ox - Math.floor(ox));
        const ny = Math.floor(oy + b.h) + dy - b.h - EPS;
        if (!hits(world, nx, ny, b.w, b.h)) {
          b.x = nx;
          b.y = ny;
          b.vx = 0;
          b.vy = 0;
          return true;
        }
      }
    }
    return false;
  }

  return { C, EPS, body, hits, overlaps, liquidIn, moveX, moveY, step, unstick };
});

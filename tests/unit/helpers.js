// Общее для законов: путь к web/ (SB_WEB подставляет tools/mutate.js), мелкие миры.
'use strict';
const path = require('path');

const WEB = process.env.SB_WEB || path.join(__dirname, '..', '..', 'web');
const core = (name) => require(path.join(WEB, 'js', 'core', name + '.js'));
const sys = (name) => require(path.join(WEB, 'js', 'sys', name + '.js'));

// пустой мир заданного размера: все чанки - воздух; за краем мира твёрдо, ада нет
function flatWorld(w, h, groundY) {
  const Wd = core('world');
  const D = core('data');
  const world = Wd.create(1, w, h);
  world.dims = Object.assign({}, world.dims, { hellTop: h });
  for (let cy = 0; cy < world.chh; cy++) {
    for (let cx = 0; cx < world.cw; cx++) {
      const c = Wd.chunk(world, cx, cy);
      c.fg.fill(0);
      c.wall.fill(0);
      c.liq.fill(0);
    }
  }
  if (groundY !== undefined) for (let x = 0; x < w; x++) for (let y = groundY; y < h; y++) Wd.set(world, x, y, D.B.STONE);
  world.skyCache.clear();
  Wd.changes(world);
  return world;
}

module.exports = { WEB, core, sys, flatWorld };

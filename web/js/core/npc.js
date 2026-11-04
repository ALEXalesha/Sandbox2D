// Жители: торговец и знахарка. Приходят к освещённому костру днём, если рядом нет врагов:
// торговец - когда у игрока набралось 10 монет, знахарка - после торговца и 10 побед.
// Живут у своего костра; убрали костёр - житель уходит. Торговля честная: монеты меняются
// ровно на цену, предмет кладётся только если есть место.
// обёртка «браузер или node»: ветку браузера проверяют законы страницы
/* c8 ignore start */
(function (root, factory) {
  const req = typeof module === 'object' && module.exports;
  const api = factory(
    req ? require('./world.js') : root.SB.World,
    req ? require('./physics.js') : root.SB.Physics,
    req ? require('./inventory.js') : root.SB.Inv,
    req ? require('./data.js') : root.SB.Data,
    req ? require('./light.js') : root.SB.Light,
    req ? require('./time.js') : root.SB.Time,
  );
  if (req) module.exports = api;
  else (root.SB = root.SB || {}).Npc = api;
})(typeof self !== 'undefined' ? self : this, function (Wd, P, Inv, D, Lt, T) {
/* c8 ignore stop */
  'use strict';
  const KINDS = Object.freeze(['trader', 'healer']);
  const HOME_LIGHT = 12;
  const WANDER = 6;
  const SHOP = Object.freeze({
    trader: [
      { id: 'torch', n: 10, price: 3 },
      { id: 'wood', n: 20, price: 4 },
      { id: 'glass', n: 5, price: 5 },
      { id: 'iron_ore', n: 6, price: 12 },
      { id: 'workbench', n: 1, price: 6 },
    ],
    healer: [
      { id: 'potion', n: 1, price: 8 },
      { id: 'goo', n: 4, price: 6 },
    ],
  });
  const SELL = Object.freeze({
    copper_ore: 1, iron_ore: 2, crystal_ore: 4, magmite_ore: 6, goo: 1, shadow_dust: 2, ember: 3,
    copper_bar: 3, iron_bar: 5, crystal: 9, magmite_bar: 20,
  });
  const HEAL_PRICE = 5;

  function make(kind, home) {
    const b = P.body(home[0] + 1.1, home[1] - 1.8, 0.8, 1.8);
    return Object.assign(b, { kind, home: home.slice(), t: 0, goal: home[0] + 1 });
  }

  function campfireOk(game, home) {
    return Wd.get(game.world, home[0], home[1]) === D.B.CAMPFIRE && Lt.at(game.light, home[0], home[1]) >= HOME_LIGHT;
  }

  function wants(game, kind) {
    if (kind === 'trader') return Inv.count(game.inv, 'coin') >= 10 || game.stats.coins >= 10;
    return game.residents.some((r) => r.kind === 'trader') && (game.stats.kills | 0) >= 10;
  }

  // жители уходят от потухшего костра и приходят к горящему
  function check(game) {
    const before = game.residents.length;
    game.residents = game.residents.filter((r) => Wd.get(game.world, r.home[0], r.home[1]) === D.B.CAMPFIRE);
    if (game.residents.length < before) game.events.push({ type: 'leave' });
    if (T.isNight(game.time)) return null;
    for (const kind of KINDS) {
      if (game.residents.some((r) => r.kind === kind) || !wants(game, kind)) continue;
      const home = game.campfires.find((c) => campfireOk(game, c) && !game.mobs.some((m) => Math.abs(m.x - c[0]) < 20 && Math.abs(m.y - c[1]) < 20));
      if (!home) continue;
      const r = make(kind, home);
      P.unstick(game.world, r);
      game.residents.push(r);
      game.events.push({ type: 'arrive', kind });
      return r;
    }
    return null;
  }

  function update(game, dt) {
    for (const r of game.residents) {
      r.t -= dt;
      if (r.t <= 0) {
        r.t = 2 + game.rng() * 4;
        r.goal = r.home[0] + (game.rng() * 2 - 1) * WANDER;
      }
      const cx = r.x + r.w / 2;
      const go = Math.abs(r.goal - cx) > 0.5;
      const input = { left: go && r.goal < cx, right: go && r.goal > cx };
      input.jump = go && r.onGround && Math.abs(r.vx) < 0.2;
      r.speedMul = 0.35;
      P.step(game.world, r, input, dt);
    }
  }

  function buy(game, kind, index) {
    const offer = (SHOP[kind] || [])[index];
    if (!offer) return false;
    if (Inv.count(game.inv, 'coin') < offer.price) return false;
    const copy = game.inv.map((s) => (s ? { id: s.id, n: s.n } : null));
    Inv.remove(copy, 'coin', offer.price);
    if (Inv.room(copy, offer.id) < offer.n) return false;
    Inv.remove(game.inv, 'coin', offer.price);
    Inv.add(game.inv, offer.id, offer.n);
    return true;
  }

  function sell(game, slot) {
    const s = game.inv[slot];
    if (!s || !SELL[s.id]) return false;
    const price = SELL[s.id];
    const copy = game.inv.map((c) => (c ? { id: c.id, n: c.n } : null));
    Inv.removeAt(copy, slot, 1);
    if (Inv.room(copy, 'coin') < price) return false;
    Inv.removeAt(game.inv, slot, 1);
    Inv.add(game.inv, 'coin', price);
    return true;
  }

  function heal(game) {
    const p = game.player;
    if (p.hp >= p.maxHp || !Inv.remove(game.inv, 'coin', HEAL_PRICE)) return false;
    p.hp = p.maxHp;
    return true;
  }

  return { KINDS, HOME_LIGHT, SHOP, SELL, HEAL_PRICE, make, campfireOk, wants, check, update, buy, sell, heal };
});

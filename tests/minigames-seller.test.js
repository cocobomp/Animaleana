// Seller son cheval (src/ui/minigames/seller.js) : le tapis et la selle juste derrière le garrot, la sangle serrée
// en deux fois (il gonfle le ventre). Et desseller / reseller à la sellerie (src/sim/gear.js). Faux cadre, sans DOM.

import { describe, it, expect, beforeAll } from 'vitest';
import { justRight, verdict } from '../src/ui/minigames/score.js';
import { makeRng } from '../src/ui/minigames/draw.js';
import { createAnimal } from '../src/sim/animal.js';
import { createProfile } from '../src/sim/profile.js';
import { seeded } from '../src/sim/rng.js';
import { starterTack, freeSaddle, unsaddle, saddleUp, wears, rideGear } from '../src/sim/gear.js';

let t;
let seller;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  seller = await import('../src/ui/minigames/seller.js');
});

const horse = () => {
  const a = createAnimal({ species: 'horse', sex: 'f', ageDays: 2000, rng: seeded('selle') });
  a.name = 'Étoile';
  return a;
};

function fakeCtx(a) {
  const noop = () => {};
  return {
    a,
    sp: { emoji: '🐴' },
    action: 'saddle',
    W: 400,
    H: 360,
    view: { x0: 0, y0: 0, x1: 400, y1: 360, w: 400, h: 360, scale: 1, ox: 0, oy: 0 },
    col: { coat: '#8a5a2b', sec: '#ffffff', mane: '#2b1d14', raw: { pattern: 'solid' } },
    fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop, update: noop, draw: noop },
    rng: makeRng(3),
    time: 0,
    done: false,
    pointer: { x: 0, y: 0, down: false, over: false, type: 'mouse' },
    t,
    name: a.name,
    hints: [],
    buttons: [],
    finished: null,
    hint(text, kind = '') { this.hints.push({ text, kind }); },
    progress() {},
    button(text, opts = {}) { const b = { text, opts }; this.buttons.push(b); return b; },
    clearButtons() { this.buttons = []; },
    finish(q, msg, why) {
      if (this.done) return;
      this.done = true;
      this.finished = { q: Math.round(Math.max(0.4, Math.min(1, q)) * 100) / 100, msg, why };
    },
    zone(lo, hi) { return { lo, hi }; },
    finishJust(value, lo, hi) { this.finish(justRight(value, lo, hi), '', verdict(value, lo, hi)); },
    stopButton(onStop, label = t('mg_stopHere')) { return this.button(`✅ ${label}`, { cls: 'stop primary', onTap: onStop }); },
  };
}

const press = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop')).opts.onTap();
const holdBtn = (ctx) => ctx.buttons.find((b) => b.opts.hold);
const tick = (game, ctx, s) => {
  for (let k = 0; k < Math.round(s / 0.05); k++) {
    ctx.time += 0.05;
    game.update(0.05);
  }
};
/** Glisser l'objet de l'étape (depuis le plateau) jusqu'au point p, et le lâcher. */
function dragTo(game, p) {
  const q = game.peek();
  const it = q.items[q.stage];
  const from = { x: it.x, y: it.y + 15 };
  game.down(from);
  for (let i = 1; i <= 8; i++) game.move({ x: from.x + ((p.x - from.x) * i) / 8, y: from.y + ((p.y - from.y) * i) / 8 }, true);
  game.up(p);
}
const next = (game, ctx) => {
  press(ctx);
  tick(game, ctx, 1.2);
};
/** Serrer la sangle en gardant le doigt sur 🪢 pendant s secondes. */
const tighten = (game, ctx, s) => {
  holdBtn(ctx).opts.onDown();
  tick(game, ctx, s);
  holdBtn(ctx).opts.onUp();
};

describe('seller son cheval', () => {
  it('tapis et selle juste derrière le garrot, sangle en deux fois : trois étoiles', () => {
    const ctx = fakeCtx(horse());
    const game = seller.sellerGame(ctx);
    expect(game.peek().stage).toBe('pad');
    dragTo(game, game.peek().spot);
    let p = game.peek();
    expect(p.items.pad.placed).toBe(true);
    expect(p.value).toBeGreaterThanOrEqual(p.lo);
    expect(p.value).toBeLessThanOrEqual(p.hi);
    next(game, ctx);
    expect(game.peek().stage).toBe('saddle');
    dragTo(game, game.peek().spot);
    next(game, ctx);
    expect(game.peek().stage).toBe('girth');
    // première fois : jusqu'à 0,6 environ… il gonfle le ventre, la sangle se relâche
    tighten(game, ctx, 1.9);
    const first = game.peek().tension;
    tick(game, ctx, 1.5);
    p = game.peek();
    expect(p.bloated).toBe(true);
    expect(p.tension).toBeLessThan(first);
    expect(ctx.hints.some((h) => h.text === t('mg_seller_bloat', { name: 'Étoile' }))).toBe(true);
    // deuxième fois : dans la zone juste
    while (game.peek().tension < (seller.GIRTH.lo + seller.GIRTH.hi) / 2) tighten(game, ctx, 0.1);
    press(ctx);
    expect(ctx.finished).toEqual({ q: 1, msg: t('mg_seller_just', { name: 'Étoile', g: 'f' }), why: 'just' });
  });

  it('trop en avant (sur le garrot) ou trop en arrière (sur les reins) : le jeu le dit, et moins d\'étoiles', () => {
    const ctx = fakeCtx(horse());
    const game = seller.sellerGame(ctx);
    dragTo(game, game.peek().forward);
    expect(ctx.hints.at(-1)).toEqual({ text: t('mg_seller_forward'), kind: 'warn' });
    expect(game.peek().value).toBeGreaterThan(game.peek().hi);
    dragTo(game, game.peek().back);
    expect(ctx.hints.at(-1)).toEqual({ text: t('mg_seller_back'), kind: 'warn' });
    next(game, ctx);
    dragTo(game, game.peek().back);
    next(game, ctx);
    tighten(game, ctx, 1.9);
    tick(game, ctx, 1.5);
    while (game.peek().tension < 0.78) tighten(game, ctx, 0.1);
    press(ctx);
    expect(ctx.finished.why).toBe('low');
    expect(ctx.finished.q).toBeLessThan(1);
  });

  it('lâché à côté du cheval : le tapis retourne dans le plateau', () => {
    const ctx = fakeCtx(horse());
    const game = seller.sellerGame(ctx);
    dragTo(game, { x: 200, y: 20 });
    const p = game.peek();
    expect(p.items.pad.placed).toBe(false);
    expect(p.items.pad.x).toBe(p.tray.x);
  });

  it('la selle doit être sur le tapis', () => {
    const ctx = fakeCtx(horse());
    const game = seller.sellerGame(ctx);
    dragTo(game, game.peek().spot);
    next(game, ctx);
    dragTo(game, game.peek().back);
    expect(ctx.hints.at(-1)).toEqual({ text: t('mg_seller_onPad'), kind: 'warn' });
    expect(game.peek().value).toBe(0);
  });

  it('sangle serrée d\'un coup jusqu\'au bout : trop serrée, il couche les oreilles', () => {
    const ctx = fakeCtx(horse());
    const game = seller.sellerGame(ctx);
    dragTo(game, game.peek().spot);
    next(game, ctx);
    dragTo(game, game.peek().spot);
    next(game, ctx);
    tighten(game, ctx, 4);
    expect(game.peek().tension).toBeGreaterThan(seller.GIRTH.hi);
    press(ctx);
    expect(ctx.finished.why).toBe('high');
    expect(ctx.finished.msg).toBe(t('mg_seller_high_girth', { name: 'Étoile' }));
  });
});

describe('desseller, reseller', () => {
  it('desseller range la selle et le tapis ; reseller remet la même selle', () => {
    const p = createProfile('Lou');
    const a = horse();
    p.animals.push(a);
    starterTack(p, a);
    expect(wears(a, 'saddle')).toBe(true);
    expect(freeSaddle(p, a)).toBeNull(); // (la seule selle est sur son dos)
    const was = a.gear.saddle.item;
    expect(unsaddle(a)).toBe(true);
    expect(wears(a, 'saddle')).toBe(false);
    expect(rideGear(a).bareback).toBe(true); // (sans selle : à cru)
    expect(freeSaddle(p, a)).toBe(was);
    expect(saddleUp(p, a).ok).toBe(true);
    expect(a.gear.saddle.item).toBe(was);
    expect(unsaddle(horse())).toBe(false); // (pas de selle : rien à faire)
  });

  it('sans selle libre : on ne peut pas seller', () => {
    const p = createProfile('Lou');
    p.items = { ...p.items, saddle: 0 };
    const a = horse();
    expect(freeSaddle(p, a)).toBeNull();
    expect(saddleUp(p, a).ok).toBe(false);
  });
});

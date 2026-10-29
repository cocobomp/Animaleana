// Le pansage du cheval (src/ui/minigames/pansage.js) : étrille en ronds, brosse dans le sens du
// poil, cure-pied du talon vers la pince sur les quatre pieds, peigne de haut en bas. On joue
// chaque étape avec un faux cadre (sans DOM ni canvas), comme un enfant avec le doigt.

import { describe, it, expect, beforeAll } from 'vitest';
import { justRight, verdict } from '../src/ui/minigames/score.js';
import { makeRng } from '../src/ui/minigames/draw.js';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';

let t;
let pansage;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  pansage = await import('../src/ui/minigames/pansage.js');
});

const horse = (grooming = 30, seed = 'pansage') => {
  const a = createAnimal({ species: 'horse', sex: 'f', ageDays: 2000, rng: seeded(seed) });
  a.name = 'Étoile';
  a.needs.grooming = grooming;
  return a;
};

function fakeCtx(a, seed = 7) {
  const noop = () => {};
  return {
    a,
    sp: { emoji: '🐴' },
    action: 'brush',
    W: 400,
    H: 360,
    view: { x0: 0, y0: 0, x1: 400, y1: 360, w: 400, h: 360, scale: 1, ox: 0, oy: 0 },
    col: { coat: '#8a5a2b', sec: '#ffffff', mane: '#2b1d14', raw: { pattern: 'solid' } },
    fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop, update: noop, draw: noop },
    rng: makeRng(seed),
    time: 0,
    done: false,
    pointer: { x: 0, y: 0, down: false, over: false, type: 'mouse' },
    t,
    name: a.name,
    hints: [],
    zones: [],
    buttons: [],
    prog: 0,
    finished: null,
    hint(text, kind = '') { this.hints.push({ text, kind }); },
    progress(v) { this.prog = v; },
    button(text, opts = {}) { const b = { text, opts }; this.buttons.push(b); return b; },
    clearButtons() { this.buttons = []; },
    finish(q, msg, why) {
      if (this.done) return;
      this.done = true;
      this.finished = { q: Math.round(Math.max(0.4, Math.min(1, q)) * 100) / 100, msg, why };
    },
    zone(lo, hi) { this.zones.push({ lo, hi }); return { lo, hi }; },
    finishJust(value, lo, hi, o = {}) {
      const q = justRight(value, lo, hi, { slack: o.slack });
      this.finish(q, '', verdict(value, lo, hi));
    },
    stopButton(onStop, label = t('mg_stopHere')) { return this.button(`✅ ${label}`, { cls: 'stop primary', onTap: onStop }); },
  };
}

const press = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop')).opts.onTap();
const tick = (game, ctx, s = 0.1) => {
  for (let k = 0; k < s / 0.05; k++) {
    ctx.time += 0.05;
    game.update(0.05);
  }
};
function stroke(game, pts) {
  game.down({ ...pts[0], type: 'mouse' });
  for (const p of pts.slice(1)) game.move({ ...p, type: 'mouse' }, true);
  game.up(pts[pts.length - 1]);
}
const line = (x0, y0, x1, y1, n = 16) => Array.from({ length: n + 1 }, (_, i) => ({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n }));
const circles = (x, y, r = 12, turns = 1, n = 24) => Array.from({ length: Math.round(n * turns) + 1 }, (_, i) => {
  const ang = (i / n) * Math.PI * 2;
  return { x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r };
});

/** Étrille : des ronds sur chaque plaque jusqu'à ce qu'il n'y en ait plus. */
function curryAll(game) {
  for (let guard = 0; guard < 40 && game.peek().mud.length; guard++) {
    const q = game.peek().mud[0];
    stroke(game, circles(q.x, q.y, Math.min(12, q.r * 0.6), 1));
  }
}
function brushAll(game) {
  for (let guard = 0; guard < 60 && game.peek().dust.length; guard++) {
    const q = game.peek().dust[0];
    stroke(game, line(q.x + 24, q.y, q.x - 24, q.y, 12));
  }
}
function pickFoot(game) {
  for (let guard = 0; guard < 40 && game.peek().blobs.length; guard++) {
    const q = game.peek().blobs[0];
    stroke(game, line(q.x, q.y - 22, q.x, q.y + 22, 11));
  }
}
function combAll(game) {
  for (let guard = 0; guard < 60 && game.peek().knots.length; guard++) {
    const q = game.peek().knots[0];
    stroke(game, line(q.x, q.y - 22, q.x, q.y + 22, 11));
  }
}
const nextStage = (game, ctx) => {
  press(ctx);
  tick(game, ctx, 1.2);
};
function pickAllFeet(game, ctx) {
  for (let f = 0; f < 4; f++) {
    tick(game, ctx, 0.5);
    expect(game.peek().foot).toBe(pansage.PANSAGE_FEET[f]);
    pickFoot(game);
    tick(game, ctx, 1);
  }
}

describe('le pansage du cheval', () => {
  it('quatre étapes dans l\'ordre ; tout bien fait : trois étoiles et « impeccable »', () => {
    const ctx = fakeCtx(horse());
    const game = pansage.pansageGame(ctx);
    expect(game.peek().stage).toBe('curry');
    expect(game.peek().mud.length).toBeGreaterThanOrEqual(3);
    curryAll(game);
    const p1 = game.peek();
    expect(p1.value).toBeGreaterThanOrEqual(p1.lo);
    expect(p1.value).toBeLessThanOrEqual(p1.hi);
    nextStage(game, ctx);
    expect(game.peek().stage).toBe('brush');
    // la boue décollée est devenue de la poussière, plus un peu ailleurs
    expect(game.peek().dust.length).toBeGreaterThan(p1.mud.length);
    brushAll(game);
    nextStage(game, ctx);
    expect(game.peek().stage).toBe('hoof');
    pickAllFeet(game, ctx);
    // le dernier pied propre : on passe tout seul au peigne
    tick(game, ctx, 1.2);
    expect(game.peek().stage).toBe('comb');
    expect(game.peek().knots.length).toBeGreaterThanOrEqual(2);
    combAll(game);
    press(ctx);
    expect(ctx.finished).toEqual({ q: 1, msg: t('mg_pansage_just', { name: 'Étoile' }), why: 'just' });
    expect(game.peek().results.map((r) => r.stage)).toEqual(pansage.PANSAGE_STAGES);
  });

  it('l\'étrille décolle la boue en ronds, à peine en traits droits', () => {
    const run = (shape) => {
      const ctx = fakeCtx(horse());
      const game = pansage.pansageGame(ctx);
      const q = game.peek().mud[0];
      stroke(game, shape(q));
      return game.peek().value;
    };
    // même longueur de geste (≈ 75 px)
    const round = run((q) => circles(q.x, q.y, 12, 1));
    const straight = run((q) => [...line(q.x - 18, q.y, q.x + 18, q.y, 9), ...line(q.x + 18, q.y + 2, q.x - 18, q.y + 2, 9)]);
    expect(round).toBeGreaterThan(straight * 1.8);
  });

  it('l\'étrille sur la tête ou les jambes fait mal : le cheval proteste et c\'est « trop »', () => {
    const ctx = fakeCtx(horse());
    const game = pansage.pansageGame(ctx);
    const { head } = game.peek();
    for (let i = 0; i < 3; i++) stroke(game, circles(head.x, head.y, 10, 1));
    expect(game.peek().over).toBeGreaterThan(0.04);
    expect(ctx.hints.some((h) => h.text === t('mg_pansage_curry_bony') && h.kind === 'warn')).toBe(true);
    const leg = game.peek().legs[0];
    const before = game.peek().over;
    stroke(game, line(leg.x, leg.y - 10, leg.x, leg.y + 10, 8));
    expect(game.peek().over).toBeGreaterThan(before);
  });

  it('le cure-pied : vers la pince, ça gratte ; vers le talon, à peine ; sur la fourchette, ça pique', () => {
    const toStage3 = () => {
      const ctx = fakeCtx(horse());
      const game = pansage.pansageGame(ctx);
      nextStage(game, ctx);
      nextStage(game, ctx);
      tick(game, ctx, 0.5);
      expect(game.peek().stage).toBe('hoof');
      return { ctx, game };
    };
    const { game: g1 } = toStage3();
    const q = g1.peek().blobs.find((b) => !b.stone);
    stroke(g1, line(q.x, q.y - 22, q.x, q.y + 22, 11));
    const down = g1.peek().value;
    const { game: g2 } = toStage3();
    stroke(g2, line(q.x, q.y + 22, q.x, q.y - 22, 11));
    const up = g2.peek().value;
    expect(down).toBeGreaterThan(up * 2);
    // la fourchette
    const { ctx: c3, game: g3 } = toStage3();
    const fr = g3.peek().frog;
    stroke(g3, line(fr.x, fr.y - 10, fr.x, fr.y + 10, 6));
    expect(g3.peek().over).toBeGreaterThan(0);
    expect(c3.hints.at(-1)).toEqual({ text: t('mg_pansage_hoof_frog'), kind: 'warn' });
  });

  it('un pied propre : on passe tout seul au suivant (antérieur gauche, postérieur gauche…)', () => {
    const ctx = fakeCtx(horse());
    const game = pansage.pansageGame(ctx);
    nextStage(game, ctx);
    nextStage(game, ctx);
    tick(game, ctx, 0.5);
    expect(game.peek().foot).toBe('fl');
    pickFoot(game);
    tick(game, ctx, 1);
    expect(game.peek().foot).toBe('hl');
    expect(ctx.hints.at(-1).text).toBe(t('mg_pansage_hoof_next', { foot: t('mg_pansage_foot_hl') }));
  });

  it('le peigne démêle de haut en bas, pas de bas en haut', () => {
    const toComb = () => {
      const ctx = fakeCtx(horse());
      const game = pansage.pansageGame(ctx);
      nextStage(game, ctx);
      nextStage(game, ctx);
      nextStage(game, ctx);
      expect(game.peek().stage).toBe('comb');
      return game;
    };
    const g1 = toComb();
    const k = g1.peek().knots[0];
    stroke(g1, line(k.x, k.y - 20, k.x, k.y + 20, 10));
    const g2 = toComb();
    stroke(g2, line(k.x, k.y + 20, k.x, k.y - 20, 10));
    expect(g1.peek().value).toBeGreaterThan(g2.peek().value * 2);
  });

  it('sauter des étapes : moins d\'étoiles, et le message dit ce qui reste sale', () => {
    const ctx = fakeCtx(horse());
    const game = pansage.pansageGame(ctx);
    curryAll(game);
    nextStage(game, ctx);
    brushAll(game);
    nextStage(game, ctx);
    // pas de cure-pied du tout
    press(ctx);
    tick(game, ctx, 1.2);
    combAll(game);
    press(ctx);
    expect(ctx.finished.why).toBe('low');
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.msg).toBe(t('mg_pansage_low_hoof', { name: 'Étoile' }));
  });

  it('il s\'est roulé : deux plaques de terre de plus, et le pansage le dit', async () => {
    const plain = pansage.pansageGame(fakeCtx(horse(50)));
    const a = horse(50);
    a.muddy = true;
    const ctx = fakeCtx(a);
    const rolled = pansage.pansageGame(ctx);
    expect(rolled.peek().mud.length).toBe(plain.peek().mud.length + 2);
    expect(ctx.hints[0].text).toContain(t('mg_pansage_rolled', { name: 'Étoile', g: 'f' }));
    const { applyCare } = await import('../src/sim/animal.js');
    applyCare(a, 'brush', 1);
    expect(a.muddy).toBeUndefined();
  });

  it('un cheval sale a plus de boue et de nœuds qu\'un cheval presque propre', () => {
    const dirty = pansage.pansageGame(fakeCtx(horse(5)));
    const clean = pansage.pansageGame(fakeCtx(horse(95)));
    expect(dirty.peek().mud.length).toBeGreaterThan(clean.peek().mud.length);
  });

  it('tous les textes existent en français et en anglais', async () => {
    const { setLang } = await import('../src/i18n.js');
    const keys = ['mg_act_horse_brush', 'mg_pansage_next', 'act_horse_brush',
      ...pansage.PANSAGE_STAGES.flatMap((s) => [`mg_pansage_stage_${s}`, `mg_pansage_${s}_hint`, `mg_pansage_low_${s}`, `mg_pansage_high_${s}`]),
      ...pansage.PANSAGE_FEET.map((f) => `mg_pansage_foot_${f}`)];
    for (const lang of ['fr', 'en']) {
      setLang?.(lang);
      for (const k of keys) expect(t(k), `${lang} ${k}`).not.toBe(k);
    }
    setLang?.('fr');
  });
});

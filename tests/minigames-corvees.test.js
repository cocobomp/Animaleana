// Corvées (curer, pailler, balayer, ranger, vaisselle) : la règle « juste ce qu'il faut »
// jouée de bout en bout, jeu par jeu.
// - la zone verte est posée dès le début, à la bonne place sur la jauge ;
// - un bouton « ✅ C'est bon ! » existe et c'est lui qui termine (sauf « tout fait », qui
//   finit tout seul) ;
// - juste = qualité 1 ; trop peu OU trop = moins, de la même façon des deux côtés, plancher
//   0,4 (jamais 0 quand l'enfant a fini) ; le message de fin dit pourquoi.
// Sans DOM ni canvas : un faux ctx remplace le cadre (src/ui/minigames.js), et on ne dessine pas.
// Les messages de fin sont ceux du vrai cadre (mg_chore_* sans animal, mg_* avec son prénom).

import { describe, it, expect, beforeAll } from 'vitest';
import { justRight, verdict, JUST_FLOOR } from '../src/ui/minigames/score.js';
import { makeRng } from '../src/ui/minigames/draw.js';

let t;
let chores;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  chores = await import('../src/ui/minigames/chores.js');
});

const KEY = { just: 'justRight', low: 'tooLittle', high: 'tooMuch' };
/** Le message de fin attendu (comme ctx.finishJust du vrai cadre). */
const endMsg = (v, name = '') => (name ? t(`mg_${KEY[v]}`, { name }) : t(`mg_chore_${KEY[v]}`));
/**
 * Messages de fin acceptés : le standard (endMsg), ou, pour « trop peu » / « trop », celui qui dit
 * pourquoi, propre à une corvée (mg_chore_<corvée>_low / _high : chores.js, whyMsgs) dès qu'il
 * existe dans i18n.js. Les textes propres sont différents pour low et high : le verdict reste vérifié.
 */
const CHORE_KINDS = ['muck', 'straw', 'sweep', 'living', 'kitchen'];
const endMsgs = (v, name = '') => [endMsg(v, name), ...(v === 'just' ? [] : CHORE_KINDS.map((k) => `mg_chore_${k}_${v}`).filter((k) => t(k) !== k).map((k) => t(k)))];

/** Le cadre, en faux : mêmes méthodes (et mêmes messages de fin) que le ctx de minigames.js. */
function fakeCtx({ a = null, seed = 7 } = {}) {
  const noop = () => {};
  const ctx = {
    a,
    sp: a ? { emoji: '🐴' } : null,
    action: 'test',
    chore: null,
    W: 400,
    H: 360,
    view: { x0: 0, y0: -15, x1: 400, y1: 375, w: 400, h: 390, scale: 0.8, ox: 0, oy: 12 },
    col: null,
    fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop, update: noop, draw: noop },
    rng: makeRng(seed),
    time: 0,
    done: false,
    pointer: { x: 0, y: 0, down: false, over: false, type: 'touch' },
    t,
    name: a?.name ?? '',
    hints: [],
    zones: [],
    buttons: [],
    prog: 0,
    finished: null,
    hint(text, kind = '') { this.hints.push({ text, kind }); },
    progress(v) { this.prog = Math.max(0, Math.min(1, v)); },
    button(text, opts = {}) { const b = { text, opts, disabled: false }; this.buttons.push(b); return b; },
    clearButtons() { this.buttons = []; },
    finish(q, msg) {
      if (this.done) return;
      this.done = true;
      this.finished = { q: Math.round(Math.max(0.4, Math.min(1, q)) * 100) / 100, msg };
    },
    zone(lo, hi) { this.zones.push({ lo, hi }); return { lo, hi }; },
    finishJust(value, lo, hi, o = {}) {
      const q = justRight(value, lo, hi, { floor: o.floor, slack: o.slack });
      const v = verdict(value, lo, hi);
      const name = typeof o.who === 'string' ? o.who : o.who?.name ?? this.name;
      this.finish(q, o.msgs?.[v] ?? endMsg(v, name));
      if (this.finished) this.finished.verdict = this.finished.verdict ?? v;
      return { q, verdict: v };
    },
    stopButton(onStop, label = t('mg_stopHere')) { return this.button(`✅ ${label}`, { cls: 'stop primary', onTap: onStop }); },
  };
  return ctx;
}

const stopOf = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop'));
const press = (ctx) => stopOf(ctx).opts.onTap();
const tick = (game, n = 30) => { for (let i = 0; i < n; i++) game.update?.(1 / 30); };
/** Un trait du doigt (appuyé) de (x0, y0) à (x1, y1), en n étapes. */
function stroke(game, x0, y0, x1, y1, n = 10) {
  game.down?.({ x: x0, y: y0, type: 'touch' });
  for (let i = 1; i <= n; i++) game.move?.({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, type: 'touch' }, true);
  game.up?.({ x: x1, y: y1, type: 'touch' });
}
/** La zone affichée (ctx.zone, fractions de jauge) doit être celle de peek(), ramenée à max. */
function expectZoneShown(ctx, p) {
  expect(ctx.zones.length).toBeGreaterThan(0);
  const z = ctx.zones[0];
  expect(z.lo).toBeCloseTo(p.lo / p.max, 6);
  expect(z.hi).toBeCloseTo(p.hi / p.max, 6);
  expect(z.lo).toBeGreaterThan(0);
  expect(z.lo).toBeLessThan(z.hi);
  expect(z.hi).toBeLessThanOrEqual(1);
}
/** Une fin « trop peu » ou « trop » : moins que plein, au moins le plancher, message qui le dit. */
function expectLess(ctx, v, name = '') {
  expect(ctx.finished, 'le jeu doit être fini').toBeTruthy();
  expect(endMsgs(v, name)).toContain(ctx.finished.msg);
  expect(ctx.finished.q).toBeLessThan(1);
  expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
}
function expectJust(ctx, name = '') {
  expect(ctx.finished, 'le jeu doit être fini').toBeTruthy();
  expect(endMsgs('just', name)).toContain(ctx.finished.msg);
  expect(ctx.finished.q).toBe(1);
}

describe('toutes les corvées : zone dès le début, bouton « C\'est bon ! », peek lisible', () => {
  it.each(['muck', 'straw', 'sweep', 'living', 'kitchen'])('%s', (kind) => {
    const ctx = fakeCtx();
    const game = chores.CHORE_GAMES[kind](ctx);
    const p = game.peek();
    for (const k of ['value', 'lo', 'hi', 'max']) expect(Number.isFinite(p[k]), k).toBe(true);
    expect(p.lo).toBeLessThan(p.hi);
    expect(p.hi).toBeLessThanOrEqual(p.max);
    expectZoneShown(ctx, p);
    const stop = stopOf(ctx);
    expect(stop, 'bouton C\'est bon').toBeTruthy();
    expect(stop.text).toBe(`✅ ${t('mg_stopHere')}`);
    expect(ctx.done).toBe(false);
  });

  it.each(['muck', 'straw', 'sweep', 'living', 'kitchen'])('%s : « C\'est bon ! » tout de suite → le plancher, jamais 0', (kind) => {
    const ctx = fakeCtx();
    const game = chores.CHORE_GAMES[kind](ctx);
    // Vaisselle : une note par assiette, il faut envoyer les cinq.
    for (let i = 0; i < 5 && !ctx.done; i++) { press(ctx); tick(game, 40); }
    expectLess(ctx, 'low');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });
});

// ---------------------------------------------------------------- curer le box

/** Tape un objet (il file dans la brouette), puis laisse l'animation finir. */
function tapItem(game, it, frames = 30) {
  game.down({ x: it.x, y: it.y });
  game.up({ x: it.x, y: it.y });
  tick(game, frames);
}
const dirtOf = (game) => game.peek().items.filter((x) => !x.good);
const tuftsOf = (game) => game.peek().items.filter((x) => x.good);

describe('curer le box : tout le crottin, pas la paille propre', () => {
  it('juste : tout le crottin, rien d\'autre → fini tout seul, tous les points', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    expect(dirtOf(game).length).toBe(8);
    expect(tuftsOf(game).length).toBe(3);
    while (dirtOf(game).length && !ctx.done) tapItem(game, dirtOf(game)[0]);
    expectJust(ctx);
    expect(game.peek().inBin).toBe(8);
  });

  it('trop peu : « C\'est bon ! » avec du crottin par terre → moins, et de plus en plus', () => {
    const q = (left) => {
      const ctx = fakeCtx();
      const game = chores.muckGame(ctx);
      for (const it of dirtOf(game).slice(0, 8 - left)) tapItem(game, it);
      expect(game.peek().left).toBe(left);
      expect(ctx.done).toBe(false);
      press(ctx);
      expectLess(ctx, 'low');
      return ctx.finished.q;
    };
    const one = q(1);
    const two = q(2);
    expect(one).toBeLessThan(0.85); // plus trois étoiles
    expect(two).toBeLessThan(one);
  });

  it('trop : jeter de la paille propre → moins, autant qu\'un crottin oublié (symétrique)', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    tapItem(game, tuftsOf(game)[0]);
    expect(game.peek().thrown).toBe(1);
    while (dirtOf(game).length && !ctx.done) tapItem(game, dirtOf(game)[0]);
    expectLess(ctx, 'high');
    const tooMuch = ctx.finished.q;

    const ctx2 = fakeCtx();
    const game2 = chores.muckGame(ctx2);
    for (const it of dirtOf(game2).slice(0, 7)) tapItem(game2, it);
    press(ctx2);
    expectLess(ctx2, 'low');
    expect(ctx2.finished.q).toBeCloseTo(tooMuch, 6);

    // Deux touffes jetées : encore moins.
    const ctx3 = fakeCtx();
    const game3 = chores.muckGame(ctx3);
    for (const it of tuftsOf(game3).slice(0, 2)) tapItem(game3, it);
    while (dirtOf(game3).length && !ctx3.done) tapItem(game3, dirtOf(game3)[0]);
    expectLess(ctx3, 'high');
    expect(ctx3.finished.q).toBeLessThan(tooMuch);
  });

  it('oublié ET jeté ne s\'annulent pas : les erreurs s\'ajoutent, le message dit la plus grosse', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    tapItem(game, tuftsOf(game)[0]);
    for (const it of dirtOf(game).slice(0, 7)) tapItem(game, it);
    // 8 objets dans la brouette (7 crottins + 1 touffe) : ce n'est PAS juste.
    expect(game.peek().inBin).toBe(8);
    press(ctx);
    expect(ctx.finished.q).toBeLessThan(0.8);
    expect(endMsgs('low')).toContain(ctx.finished.msg); // à égalité : il en manquait

    const ctx2 = fakeCtx();
    const game2 = chores.muckGame(ctx2);
    for (const it of tuftsOf(game2)) tapItem(game2, it);
    for (const it of dirtOf(game2).slice(0, 7)) tapItem(game2, it);
    press(ctx2);
    expectLess(ctx2, 'high'); // surtout de la paille jetée
  });

  it('un crottin encore en vol quand on appuie compte comme ramassé', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    const dirt = dirtOf(game);
    for (const it of dirt.slice(0, 6)) tapItem(game, it);
    tapItem(game, dirt[6], 2); // il vole encore
    press(ctx);
    expect(ctx.finished.q).toBeCloseTo(justRight(7, 7.5, 8.5, { slack: 1.5 }), 2);
    tick(game, 30); // il atterrit : pas de deuxième fin
    expect(endMsgs('low')).toContain(ctx.finished.msg);
  });

  it('avec le cheval du box : son prénom quand c\'est juste ; sinon le message de la corvée', () => {
    // « Pomme en avait déjà assez » ne veut rien dire pour de la paille propre jetée.
    const pomme = { id: 'h1', name: 'Pomme', species: 'horse', look: { seed: 3 } };
    const ctx = fakeCtx({ a: pomme });
    const game = chores.muckGame(ctx);
    for (const it of dirtOf(game).slice(0, 7)) tapItem(game, it);
    press(ctx);
    expectLess(ctx, 'low');

    const ctx2 = fakeCtx({ a: pomme });
    const game2 = chores.muckGame(ctx2);
    while (dirtOf(game2).length && !ctx2.done) tapItem(game2, dirtOf(game2)[0]);
    expectJust(ctx2, 'Pomme');
  });
});

// ---------------------------------------------------------------- paille fraîche

describe('paille fraîche : une couche partout', () => {
  /** Une rangée : une brassée sur la botte, puis un trait de droite à gauche. */
  function row(game, p, i) {
    const y = p.floor.y + 15 + (i % 8) * 30;
    game.down({ x: p.bale.x + p.bale.w / 2, y: p.bale.y + p.bale.h / 2 });
    game.move({ x: p.floor.x + p.floor.w - 8, y }, true);
    for (let k = 1; k <= 12; k++) game.move({ x: p.floor.x + p.floor.w - 8 - ((p.floor.w - 16) * k) / 12, y }, true);
    game.up();
  }
  const play = (n) => {
    const ctx = fakeCtx();
    const game = chores.strawGame(ctx);
    const p = game.peek();
    for (let i = 0; i < n && !ctx.done; i++) row(game, p, i);
    return { ctx, game, v: game.peek().value };
  };

  it('juste (une couche) → tous les points ; clairsemé → trop peu ; en tas → trop', () => {
    const just = play(8);
    expect(just.v).toBeGreaterThanOrEqual(0.85);
    expect(just.v).toBeLessThanOrEqual(1.15);
    press(just.ctx);
    expectJust(just.ctx);

    const low = play(3);
    press(low.ctx);
    expectLess(low.ctx, 'low');
    expect(low.ctx.finished.q).toBeCloseTo(justRight(low.v, 0.85, 1.15), 2);

    const high = play(12);
    expect(high.ctx.done).toBe(false);
    press(high.ctx);
    expectLess(high.ctx, 'high');
  });

  it('la note est symétrique : même écart sous ou sur la zone, même note', () => {
    const p = chores.strawGame(fakeCtx()).peek();
    const d = 0.12;
    expect(justRight(p.lo - d, p.lo, p.hi)).toBeCloseTo(justRight(p.hi + d, p.lo, p.hi), 9);
  });

  it('des tas partout : fini tout seul, au plancher', () => {
    const { ctx } = play(40);
    expect(ctx.done).toBe(true);
    expectLess(ctx, 'high');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('dans le vert, la consigne montre le bouton (pas « lâche ! ») ; au-delà, elle prévient', () => {
    const ctx = fakeCtx();
    const game = chores.strawGame(ctx);
    const p = game.peek();
    for (let i = 0; i < 12 && !ctx.done; i++) row(game, p, i);
    const texts = ctx.hints.map((h) => h.text);
    expect(ctx.hints).toContainEqual({ text: `✅ ${t('mg_stopHere')}`, kind: 'good' });
    expect(ctx.hints).toContainEqual({ text: t('mg_zoneHint'), kind: 'warn' });
    expect(texts).not.toContain(t('mg_nowStop'));
    expect(texts).not.toContain(t('mg_stop'));
  });

  it('la botte et la petite jauge restent dans les 400 px', () => {
    const { bale, floor } = chores.strawGame(fakeCtx()).peek();
    expect(bale.x + bale.w).toBeLessThanOrEqual(400);
    expect(floor.x + floor.w).toBeLessThanOrEqual(bale.x);
  });
});

// ---------------------------------------------------------------- balayer l'allée

describe('balayer l\'allée : tout ramasser, sans passes à vide', () => {
  /** Des passes de gauche à droite jusque dans la pelle, une par hauteur. */
  const sweepRows = (game, ys) => { const p = game.peek(); for (const y of ys) stroke(game, 12, y, p.pan.x + p.pan.w - 20, y, 16); };
  /** Balaie jusqu'à avoir au moins frac des brins dans la pelle. */
  function sweepTo(game, frac) {
    const p0 = game.peek();
    for (let i = 0; i < 6 && game.peek().collected < p0.total * frac; i++) sweepRows(game, [p0.aisle.y + 28 + i * 40]);
    for (let k = 0; k < 8 && game.peek().collected < p0.total * frac; k++) {
      sweepRows(game, [...new Set(game.peek().bits.map((b) => Math.round(b.y / 10) * 10))]);
    }
    return game.peek();
  }
  /** Une passe à vide : au-dessus de l'allée, loin de tout brin. */
  const emptyStroke = (game) => { const p = game.peek(); stroke(game, 30, p.aisle.y - 14, 200, p.aisle.y - 14, 6); };

  it('la pelle ET son manche tiennent dans les 400 px (le manche n\'est plus coupé à droite)', () => {
    const { pan, handle, bits } = chores.sweepGame(fakeCtx()).peek();
    expect(pan.x + pan.w).toBeLessThanOrEqual(400);
    expect(handle.x0).toBeLessThan(pan.x + pan.w); // il part de la pelle
    expect(handle.x1 + 3).toBeLessThanOrEqual(400); // ombre comprise
    expect(handle.x1 - handle.x0).toBeGreaterThanOrEqual(24); // un vrai manche, visible
    for (const b of bits) expect(b.x).toBeLessThan(pan.x); // tout commence hors de la pelle
  });

  it('juste : tout dans la pelle → tous les points', () => {
    const ctx = fakeCtx();
    const game = chores.sweepGame(ctx);
    const p = sweepTo(game, 1);
    expect(p.collected).toBe(p.total);
    expect(p.value).toBeGreaterThanOrEqual(p.lo);
    expect(p.value).toBeLessThanOrEqual(p.hi);
    press(ctx);
    expectJust(ctx);
  });

  it('trop peu : il reste des brins → moins', () => {
    const ctx = fakeCtx();
    const game = chores.sweepGame(ctx);
    sweepRows(game, [0, 1, 2].map((i) => game.peek().aisle.y + 28 + i * 40));
    const p = game.peek();
    expect(p.value).toBeLessThan(p.lo);
    press(ctx);
    expectLess(ctx, 'low');
    expect(ctx.finished.q).toBeCloseTo(justRight(p.value, p.lo, p.hi, { slack: 0.3 }), 2);
  });

  it('trop : des passes à vide une fois tout ramassé → de la poussière, moins', () => {
    const ctx = fakeCtx();
    const game = chores.sweepGame(ctx);
    sweepTo(game, 1);
    for (let i = 0; i < 4; i++) emptyStroke(game);
    const p = game.peek();
    expect(p.emptyStrokes).toBe(4);
    expect(p.value).toBeGreaterThan(p.hi);
    press(ctx);
    expectLess(ctx, 'high');
  });

  it('une passe à côté AVANT d\'avoir fini ne compte pas : la poussière ne comble pas les brins oubliés', () => {
    const ctx = fakeCtx();
    const game = chores.sweepGame(ctx);
    for (let i = 0; i < 8; i++) emptyStroke(game);
    expect(game.peek().emptyStrokes).toBe(0);
    expect(game.peek().value).toBe(0);
    sweepTo(game, 0.5);
    for (let i = 0; i < 8; i++) emptyStroke(game);
    const p = game.peek();
    expect(p.collected).toBeLessThan(p.total * p.lo);
    expect(p.value).toBeLessThan(p.lo); // la jauge n'est pas dans le vert avec l'allée sale
    press(ctx);
    expectLess(ctx, 'low');
  });

  it('dans le vert, la jauge dit vrai : au moins 90 % des brins sont dans la pelle, à chaque instant', () => {
    for (const seed of [3, 7, 11, 19]) {
      const ctx = fakeCtx({ seed });
      const game = chores.sweepGame(ctx);
      const p0 = game.peek();
      // Des passes utiles et des passes à côté, mélangées, du début à la fin.
      const ys = [...[0, 1, 2, 3, 4, 5].map((i) => p0.aisle.y + 28 + i * 40)];
      for (let k = 0; k < 40 && !ctx.done; k++) {
        if (k % 2) emptyStroke(game);
        else {
          const left = game.peek().bits;
          sweepRows(game, [k < 12 ? ys[(k / 2) % 6] : Math.round((left[0]?.y ?? ys[0]) / 10) * 10]);
        }
        const p = game.peek();
        if (p.value >= p.lo) expect(p.collected / p.total, `graine ${seed}, coup ${k}`).toBeGreaterThanOrEqual(p.lo);
      }
    }
  });

  it('beaucoup trop balayé : fini tout seul, au plancher', () => {
    const ctx = fakeCtx();
    const game = chores.sweepGame(ctx);
    sweepTo(game, 1);
    for (let i = 0; i < 20 && !ctx.done; i++) emptyStroke(game);
    expect(ctx.done).toBe(true);
    expectLess(ctx, 'high');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('dans le vert, la consigne montre le bouton ; au-delà, elle prévient', () => {
    const ctx = fakeCtx();
    const game = chores.sweepGame(ctx);
    sweepTo(game, 1);
    expect(ctx.hints.at(-1)).toEqual({ text: `✅ ${t('mg_stopHere')}`, kind: 'good' });
    for (let i = 0; i < 4; i++) emptyStroke(game);
    expect(ctx.hints.at(-1)).toEqual({ text: t('mg_zoneHint'), kind: 'warn' });
  });
});

// ---------------------------------------------------------------- ranger le salon

describe('ranger le salon : chaque objet à sa place', () => {
  const drag = (game, it, x, y) => stroke(game, it.x, it.y, x, y, 8);
  const item = (game, id) => game.peek().items.find((x) => x.id === id);

  it('la bande verte entoure « tout rangé » (et pas collée au bout de la jauge)', () => {
    const ctx = fakeCtx();
    const game = chores.livingGame(ctx);
    const p = game.peek();
    const z = ctx.zones[0];
    const full = 8 / p.max; // la jauge quand tout est rangé
    expect(z.lo).toBeLessThan(full);
    expect(z.hi).toBeGreaterThan(full);
    expect(z.hi).toBeLessThan(1);
    expect(z.hi - z.lo).toBeGreaterThan(0.08); // une vraie bande, pas un trait
    expect(7 / p.max).toBeLessThan(z.lo); // un objet oublié : hors du vert
  });

  it('juste : tout à sa place → fini tout seul, tous les points', () => {
    const ctx = fakeCtx();
    const game = chores.livingGame(ctx);
    for (let i = 0; i < 8; i++) { const it = game.peek().items[0]; drag(game, it, it.slot.x, it.slot.y); }
    expectJust(ctx);
    expect(ctx.prog).toBeCloseTo(8 / game.peek().max, 6);
  });

  it('trop peu : un objet oublié → moins ; deux → encore moins', () => {
    const q = (left) => {
      const ctx = fakeCtx();
      const game = chores.livingGame(ctx);
      for (let i = 0; i < 8 - left; i++) { const it = game.peek().items[0]; drag(game, it, it.slot.x, it.slot.y); }
      press(ctx);
      expectLess(ctx, 'low');
      return ctx.finished.q;
    };
    expect(q(1)).toBeLessThan(0.85);
    expect(q(2)).toBeLessThan(q(1));
  });

  it('mal fait : un objet sur le mauvais meuble compte en moins (plus qu\'un oubli)', () => {
    const ctx = fakeCtx();
    const game = chores.livingGame(ctx);
    drag(game, item(game, 'bear'), 92, 140); // sur l'étagère : pas sa place
    for (let i = 0; i < 7; i++) { const it = game.peek().items.find((x) => !x.misplaced); drag(game, it, it.slot.x, it.slot.y); }
    expect(game.peek().value).toBe(6);
    press(ctx);
    expectLess(ctx, 'low');
    expect(ctx.finished.q).toBeCloseTo(justRight(6, 7.6, 8.4, { slack: 2 }), 2);
  });

  it('« trop » n\'existe pas ici : la valeur ne dépasse jamais 8, jamais de verdict « trop »', () => {
    const ctx = fakeCtx();
    const game = chores.livingGame(ctx);
    for (let i = 0; i < 8; i++) {
      const it = game.peek().items[0];
      drag(game, it, it.slot.x, it.slot.y);
      expect(game.peek().value).toBeLessThanOrEqual(8);
    }
    expect(verdict(8, game.peek().lo, game.peek().hi)).toBe('just');
  });

  it('un jouet lâché n\'importe où dans le coffre (sa grande silhouette) file à sa place', () => {
    const ctx = fakeCtx();
    const game = chores.livingGame(ctx);
    const { chest } = game.peek().places;
    // Le nounours lâché à droite du coffre, à plus de 46 px de son emplacement.
    const bear = item(game, 'bear');
    const at = { x: chest.x + chest.w - 12, y: chest.y + chest.h - 14 };
    expect(Math.hypot(at.x - bear.slot.x, at.y - bear.slot.y)).toBeGreaterThan(46);
    drag(game, bear, at.x, at.y);
    expect(item(game, 'bear')).toBeUndefined(); // rangé : il n'est plus dans la liste
    expect(game.peek().placed).toBe(1);
    // Un livre lâché sur l'étagère, sur la silhouette d'un autre livre : rangé à sa place aussi.
    const book = item(game, 'book1');
    drag(game, book, 132, 168);
    expect(game.peek().placed).toBe(2);
  });

  it('lâché par terre : il reste par terre, ni rangé ni mal rangé', () => {
    const ctx = fakeCtx();
    const game = chores.livingGame(ctx);
    const it = game.peek().items[0];
    drag(game, it, 200, 330);
    const after = item(game, it.id);
    expect(after).toBeTruthy();
    expect(after.misplaced).toBe(false);
    expect(game.peek().value).toBe(0);
  });
});

// ---------------------------------------------------------------- la vaisselle

describe('la vaisselle : chaque assiette frottée juste assez', () => {
  /** Un quart de rond à la fois, pour s'arrêter au plus près de la valeur voulue. */
  function scrubUntil(game, ctx, cond, max = 800) {
    for (let i = 0; i < max && !ctx.done; i++) {
      const p = game.peek();
      if (p.phase !== 'scrub' || cond(p)) return p;
      const rr = Math.floor(i / 4) % 2 ? 16 : 30;
      const a0 = (i % 4) * (Math.PI / 2);
      game.down({ x: p.plate.x + Math.cos(a0) * rr, y: p.plate.y + Math.sin(a0) * rr });
      for (let k = 1; k <= 4; k++) {
        const ang = a0 + (k / 4) * (Math.PI / 2);
        game.move({ x: p.plate.x + Math.cos(ang) * rr, y: p.plate.y + Math.sin(ang) * rr }, true);
      }
      game.up();
    }
    return game.peek();
  }
  const fly = (game) => { for (let i = 0; i < 60 && game.peek().phase === 'fly'; i++) game.update(1 / 30); };
  const JUST = (p) => p.value >= p.lo + 0.03;
  const LOW = (p) => p.value >= 0.5;
  const HIGH = (p) => p.value >= p.hi + 0.3;
  /** Cinq assiettes, chacune frottée jusqu'à conds[n], puis « C'est bon ! ». */
  function playPlates(conds) {
    const ctx = fakeCtx();
    const game = chores.kitchenGame(ctx);
    for (let n = 0; n < 5 && !ctx.done; n++) {
      scrubUntil(game, ctx, conds[n]);
      press(ctx);
      fly(game);
    }
    return { ctx, game };
  }

  it('juste pour chaque assiette → tous les points', () => {
    const { ctx, game } = playPlates([JUST, JUST, JUST, JUST, JUST]);
    expectJust(ctx);
    expect(game.peek().plates.length).toBe(5);
  });

  it('trop peu frottées → moins ; trop frottées → moins', () => {
    const low = playPlates([LOW, LOW, LOW, LOW, LOW]);
    expectLess(low.ctx, 'low');
    const high = playPlates([HIGH, HIGH, HIGH, HIGH, HIGH]);
    expectLess(high.ctx, 'high');
  });

  it('une seule assiette ratée coûte un peu, pas tout : la note est la moyenne', () => {
    const { ctx, game } = playPlates([JUST, JUST, JUST, JUST, LOW]);
    const plates = game.peek().plates;
    const expected = plates.map((v) => justRight(v, 0.9, 1.15)).reduce((s, x) => s + x, 0) / 5;
    expect(ctx.finished.q).toBeCloseTo(expected, 2);
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.q).toBeGreaterThan(0.8);
    expect(endMsgs('low')).toContain(ctx.finished.msg);
  });

  it('Entrée envoie l\'assiette (comme « C\'est bon ! »)', () => {
    const ctx = fakeCtx();
    const game = chores.kitchenGame(ctx);
    scrubUntil(game, ctx, JUST);
    game.key('Enter', true);
    expect(game.peek().phase).toBe('fly');
    expect(game.peek().plates.length).toBe(1);
  });

  it('dans le vert, la consigne montre le bouton (pas « lâche ! ») ; au-delà, elle prévient', () => {
    const ctx = fakeCtx();
    const game = chores.kitchenGame(ctx);
    scrubUntil(game, ctx, JUST);
    expect(ctx.hints.at(-1)).toEqual({ text: `✅ ${t('mg_stopHere')}`, kind: 'good' });
    scrubUntil(game, ctx, HIGH);
    expect(ctx.hints.at(-1)).toEqual({ text: t('mg_zoneHint'), kind: 'warn' });
    expect(ctx.hints.map((h) => h.text)).not.toContain(t('mg_stop'));
  });

  it('l\'évier, l\'égouttoir et l\'assiette tiennent dans les 400 px', () => {
    const { sink, rack } = chores.kitchenGame(fakeCtx()).peek();
    expect(rack.x + rack.w).toBeLessThanOrEqual(400);
    expect(sink.x - sink.r - 12 - 14 - 8).toBeGreaterThanOrEqual(0); // anneau et son ✓ compris
  });
});

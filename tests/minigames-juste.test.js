// Règle « juste ce qu'il faut » dans les mini-jeux du cheval à pied (longe, liberté), du
// nettoyage (curer, en soin et en corvée) et des corvées (paille, balai, salon, vaisselle) :
// la zone verte est montrée dès le début, peek() expose { value, lo, hi }, et la note suit
// la règle (tout dans la zone, moins en dessous OU au-dessus, plancher à 0,4).
// Sans DOM ni canvas : un faux ctx remplace le cadre (src/ui/minigames.js), et on ne dessine pas.

import { describe, it, expect, beforeAll } from 'vitest';
import { justRight, verdict, JUST_FLOOR } from '../src/ui/minigames/score.js';
import { makeRng } from '../src/ui/minigames/draw.js';

let t;
let chores;
let clean;
let horse;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  chores = await import('../src/ui/minigames/chores.js');
  clean = await import('../src/ui/minigames/clean.js');
  horse = await import('../src/ui/minigames/horse.js');
});

/** Le cadre, en faux : mêmes méthodes que le ctx de minigames.js, sans DOM. */
function fakeCtx(a = null) {
  const noop = () => {};
  const ctx = {
    a,
    sp: a ? { emoji: '🐴' } : null,
    action: 'test',
    chore: null,
    W: 400,
    H: 360,
    view: { x0: 0, y0: 0, x1: 400, y1: 360, w: 400, h: 360, scale: 1, ox: 0, oy: 0 },
    col: null,
    fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop, update: noop, draw: noop },
    rng: makeRng(7),
    time: 0,
    done: false,
    pointer: { x: 0, y: 0, down: false, over: false, type: 'mouse' },
    t,
    name: a?.name ?? '',
    hints: [],
    zones: [],
    buttons: [],
    prog: 0,
    finished: null,
    hint(text, kind = '') { this.hints.push({ text, kind }); },
    progress(v) { this.prog = v; },
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
      this.finish(q, v);
      return { q, verdict: v };
    },
    stopButton(onStop, label = t('mg_stopHere')) { return this.button(`✅ ${label}`, { cls: 'stop primary', onTap: onStop }); },
  };
  return ctx;
}

const stopOf = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop'));
const press = (ctx) => stopOf(ctx).opts.onTap();
/** Un trait du doigt (appuyé) de (x0, y0) à (x1, y1), en n étapes. */
function stroke(game, x0, y0, x1, y1, n = 10) {
  game.down?.({ x: x0, y: y0, type: 'mouse' });
  for (let i = 1; i <= n; i++) game.move?.({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, type: 'mouse' }, true);
  game.up?.({ x: x1, y: y1, type: 'mouse' });
}
/** La zone affichée doit être celle de peek(), ramenée sur la jauge (0–1). */
function expectZoneShown(ctx, p, scale = (v) => v / p.max) {
  expect(ctx.zones.length).toBeGreaterThan(0);
  const z = ctx.zones[0];
  expect(z.lo).toBeCloseTo(scale(p.lo), 6);
  expect(z.hi).toBeCloseTo(scale(p.hi), 6);
  expect(z.lo).toBeLessThan(z.hi);
}

const horseA = () => ({ id: 'h1', name: 'Pomme', species: 'horse', personality: 'calm', look: { seed: 3 } });

describe('longe : le travail juste (secondes à la bonne allure)', () => {
  /** Tient l'allure demandée (touches ↑ / ↓) jusqu'à ce que cond(peek) soit vraie. */
  function lungeUntil(game, ctx, cond, maxSteps = 4000) {
    for (let i = 0; i < maxSteps && !ctx.done; i++) {
      const p = game.peek();
      if (cond(p)) return p;
      const [lo, hi] = p.gaits[p.gait];
      if (p.v < (lo + hi) / 2 - 6) game.key('ArrowUp', true);
      else if (p.v > (lo + hi) / 2 + 6) game.key('ArrowDown', true);
      ctx.time += 1 / 30;
      game.update(1 / 30);
    }
    return game.peek();
  }

  it('montre la zone dès le début, avec un bouton C\'est bon, et expose value / lo / hi', () => {
    const ctx = fakeCtx(horseA());
    const game = horse.lungeGame(ctx);
    const p = game.peek();
    expect(p).toMatchObject({ value: 0 });
    expect(p.lo).toBeLessThan(p.hi);
    expect(p.hi).toBeLessThan(p.max);
    expectZoneShown(ctx, p);
    expect(stopOf(ctx)).toBeTruthy();
    expect(ctx.buttons.length).toBe(3); // Doucement, Allez !, C'est bon !
  });

  it('tous les points quand on s\'arrête dans la zone, moins en dessous ou au-dessus', () => {
    for (const [where, expected] of [['just', 'just'], ['low', 'low'], ['high', 'high']]) {
      const ctx = fakeCtx(horseA());
      const game = horse.lungeGame(ctx);
      const p0 = game.peek();
      const target = where === 'just' ? p0.lo + 1 : where === 'low' ? p0.lo - 4 : p0.hi + 3;
      const p = lungeUntil(game, ctx, (q) => q.value >= target);
      expect(ctx.done).toBe(false);
      press(ctx);
      expect(ctx.finished.msg).toBe(expected);
      if (where === 'just') expect(ctx.finished.q).toBe(1);
      else {
        expect(ctx.finished.q).toBeLessThan(0.8);
        expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
        expect(ctx.finished.q).toBeCloseTo(justRight(p.value, p.lo, p.hi), 1);
      }
    }
  });

  it('s\'arrête tout seul (trop) quand le cheval n\'en peut plus', () => {
    const ctx = fakeCtx(horseA());
    const game = horse.lungeGame(ctx);
    lungeUntil(game, ctx, () => false, 6000);
    expect(ctx.done).toBe(true);
    expect(ctx.finished.msg).toBe('high');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });
});

describe('liberté : la pression juste (secondes où le cheval avance)', () => {
  const C = { x: 200, y: 158 };
  /** Se place derrière le cheval (angle phi, rayon rho) jusqu'à ce que cond(peek) soit vraie. */
  function followUntil(game, ctx, cond, { phi = 0.5, rho = 85 } = {}, maxSteps = 3000) {
    for (let i = 0; i < maxSteps && !ctx.done; i++) {
      const p = game.peek();
      if (cond(p)) return p;
      const ang = p.theta - phi * p.dirSign;
      game.move({ x: C.x + Math.cos(ang) * rho, y: C.y + Math.sin(ang) * rho, type: 'mouse' }, false);
      ctx.time += 1 / 30;
      game.update(1 / 30);
    }
    return game.peek();
  }
  const finishJoin = (game, ctx) => { for (let i = 0; i < 200 && !ctx.done; i++) game.update(1 / 30); };

  it('montre la zone dès le début et expose value / lo / hi', () => {
    const ctx = fakeCtx(horseA());
    const game = horse.libertyGame(ctx);
    const p = game.peek();
    expect(p.value).toBe(0);
    expectZoneShown(ctx, p);
    expect(stopOf(ctx)).toBeTruthy();
  });

  it('appeler le cheval dans la zone : tous les points ; trop tôt : moins', () => {
    const ctx = fakeCtx(horseA());
    const game = horse.libertyGame(ctx);
    const p = followUntil(game, ctx, (q) => q.value >= q.lo + 0.5);
    expect(p.driving).toBe(true);
    // Toucher le cheval l'appelle (la jauge est dans le vert) ; il vient, puis la fin.
    game.down({ x: p.horse.x, y: p.horse.y, type: 'touch' });
    expect(game.peek().phase).toBe('join');
    finishJoin(game, ctx);
    expect(ctx.finished).toEqual({ q: 1, msg: 'just' });

    const ctx2 = fakeCtx(horseA());
    const game2 = horse.libertyGame(ctx2);
    followUntil(game2, ctx2, (q) => q.value >= 3);
    press(ctx2);
    finishJoin(game2, ctx2);
    expect(ctx2.finished.msg).toBe('low');
    expect(ctx2.finished.q).toBeLessThan(0.8);
  });

  it('trop près du cheval, la pression compte double et dépasse vite la zone (trop)', () => {
    const ctx = fakeCtx(horseA());
    const game = horse.libertyGame(ctx);
    const p = followUntil(game, ctx, (q) => q.value >= q.hi + 2, { phi: 0.3, rho: 96 });
    expect(p.tooClose).toBe(true);
    press(ctx);
    finishJoin(game, ctx);
    expect(ctx.finished.msg).toBe('high');
    expect(ctx.finished.q).toBeLessThan(0.8);
  });
});

/** Met toutes les saletés (sauf la paille propre, ou `tufts` d'entre elles) dans la brouette. */
function pickAll(game, ctx, tufts = 0) {
  const tap = (it) => { game.down({ x: it.x, y: it.y }); game.up({ x: it.x, y: it.y }); for (let i = 0; i < 30; i++) game.update(1 / 30); };
  for (const it of game.peek().items.filter((x) => x.good).slice(0, tufts)) tap(it);
  for (let i = 0; i < 20; i++) {
    const it = game.peek().items.find((x) => !x.good);
    if (!it || ctx.done) break;
    tap(it);
  }
}

describe('curer le box (soin) : une couche de paille partout, ni clairsemée ni en tas', () => {
  const rows = (p, n, half = false) => {
    for (let i = 0; i < n; i++) {
      const y = p.floor.y + 18 + (i % 7) * 36;
      stroke(gameRef, p.floor.x + 10, y, p.floor.x + (half ? p.floor.w / 2 : p.floor.w - 10), y, 12);
    }
  };
  let gameRef;

  it('montre la zone de la 2e étape dès le début, sur la part de jauge qui lui revient', () => {
    const ctx = fakeCtx(horseA());
    gameRef = clean.cleanGame(ctx);
    const p = gameRef.peek();
    expect(p.phase).toBe('pick');
    expect(p.lo).toBeLessThan(p.hi);
    expect(ctx.zones.length).toBe(1);
    expect(ctx.zones[0].lo).toBeGreaterThan(0.35);
    expect(ctx.zones[0].hi).toBeLessThan(1);
    expect(stopOf(ctx)).toBeFalsy(); // pas avant la paille
    pickAll(gameRef, ctx);
    expect(gameRef.peek().phase).toBe('spread');
    expect(stopOf(ctx)).toBeTruthy();
  });

  it('juste, clairsemé, en tas : la note suit la règle, et le message dit pourquoi', () => {
    const cases = [['just', 7, false], ['low', 3, true], ['high', 11, false]];
    for (const [expected, n, half] of cases) {
      const ctx = fakeCtx(horseA());
      gameRef = clean.cleanGame(ctx);
      pickAll(gameRef, ctx);
      const p = gameRef.peek();
      rows(p, n, half);
      const v = gameRef.peek().value;
      press(ctx);
      expect(ctx.finished.msg, `${expected} (value ${v.toFixed(2)})`).toBe(expected);
      if (expected === 'just') expect(ctx.finished.q).toBe(1);
      else expect(ctx.finished.q).toBeLessThan(0.8);
    }
  });

  it('repasser au même endroit fait un tas (une couche de plus), pas une passe voisine', () => {
    const ctx = fakeCtx(horseA());
    gameRef = clean.cleanGame(ctx);
    pickAll(gameRef, ctx);
    const p = gameRef.peek();
    const y = p.floor.y + 18;
    stroke(gameRef, p.floor.x + 10, y, p.floor.x + p.floor.w - 10, y, 12);
    const once = gameRef.peek().value;
    stroke(gameRef, p.floor.x + 10, y, p.floor.x + p.floor.w - 10, y, 12);
    expect(gameRef.peek().value).toBeCloseTo(once * 2, 6);
  });
});

describe('curer le box (corvée) : tout le crottin, pas la paille propre', () => {
  it('finit tout seul quand tout le crottin est dans la brouette : juste', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    const p = game.peek();
    expect(p.items.filter((x) => x.good).length).toBe(3);
    expect(p.nDirt).toBe(8);
    expectZoneShown(ctx, p);
    pickAll(game, ctx);
    expect(ctx.finished).toEqual({ q: 1, msg: 'just' });
  });

  it('jeter la paille propre, c\'est trop', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    pickAll(game, ctx, 2);
    expect(ctx.finished.msg).toBe('high');
    expect(ctx.finished.q).toBeLessThan(0.8);
  });
});

describe('paille fraîche : une couche partout, plus c\'est du gaspillage', () => {
  /** Une rangée : une brassée sur la botte, puis un trait de droite à gauche. */
  function row(game, p, i) {
    const y = p.floor.y + 15 + (i % 8) * 30;
    game.down({ x: p.bale.x + p.bale.w / 2, y: p.bale.y + p.bale.h / 2 });
    game.move({ x: p.floor.x + p.floor.w - 8, y }, true);
    for (let k = 1; k <= 12; k++) game.move({ x: p.floor.x + p.floor.w - 8 - ((p.floor.w - 16) * k) / 12, y }, true);
    game.up();
  }

  it('montre la zone, expose value / lo / hi, et note juste / trop peu / trop', () => {
    for (const [expected, n] of [['just', 8], ['low', 3], ['high', 12]]) {
      const ctx = fakeCtx();
      const game = chores.strawGame(ctx);
      const p = game.peek();
      expectZoneShown(ctx, p);
      for (let i = 0; i < n && !ctx.done; i++) row(game, p, i);
      const v = game.peek().value;
      if (!ctx.done) press(ctx);
      expect(ctx.finished.msg, `${expected} (value ${v.toFixed(2)})`).toBe(expected);
      if (expected === 'just') expect(ctx.finished.q).toBe(1);
      else expect(ctx.finished.q).toBeLessThan(0.8);
    }
  });
});

describe('balayer l\'allée : tout ramasser, sans passes à vide', () => {
  it('la pelle tient dans les 400 px du cadre', () => {
    const game = chores.sweepGame(fakeCtx());
    const { pan } = game.peek();
    expect(pan.x + pan.w).toBeLessThanOrEqual(400);
  });

  it('juste quand presque tout est dans la pelle ; trop peu avant ; trop avec des passes à vide', () => {
    const ctx = fakeCtx();
    const game = chores.sweepGame(ctx);
    const p0 = game.peek();
    expectZoneShown(ctx, p0);
    const sweepRows = (ys) => { for (const y of ys) stroke(game, 12, y, p0.pan.x + p0.pan.w - 20, y, 16); };
    sweepRows([0, 1, 2].map((i) => p0.aisle.y + 28 + i * 40));
    expect(game.peek().value).toBeLessThan(p0.lo);
    sweepRows([3, 4, 5].map((i) => p0.aisle.y + 28 + i * 40));
    for (let k = 0; k < 4 && game.peek().collected < p0.total * 0.9; k++) {
      const ys = [...new Set(game.peek().bits.map((b) => Math.round(b.y / 10) * 10))];
      sweepRows(ys);
    }
    const p = game.peek();
    expect(p.collected).toBeGreaterThanOrEqual(p.total * 0.9);
    expect(p.value).toBeGreaterThanOrEqual(p.lo);
    expect(p.value).toBeLessThanOrEqual(p.hi);
    // Des passes à vide sur l'allée propre : de la poussière, et ça dépasse.
    const before = p.emptyStrokes;
    for (let k = 0; k < 8; k++) stroke(game, 30, p0.aisle.y + 60, 200, p0.aisle.y + 60, 6);
    expect(game.peek().emptyStrokes).toBeGreaterThan(before);
    expect(game.peek().value).toBeGreaterThan(p.hi);
    press(ctx);
    expect(ctx.finished.msg).toBe('high');
    expect(ctx.finished.q).toBeLessThan(0.8);
  });
});

describe('ranger le salon : bien rangés − mal rangés', () => {
  const drag = (game, it, x, y) => stroke(game, it.x, it.y, x, y, 8);

  it('tout à sa place : fini tout seul, tous les points', () => {
    const ctx = fakeCtx();
    const game = chores.livingGame(ctx);
    const p0 = game.peek();
    expectZoneShown(ctx, p0);
    for (let i = 0; i < 8; i++) { const it = game.peek().items[0]; drag(game, it, it.slot.x, it.slot.y); }
    expect(ctx.finished).toEqual({ q: 1, msg: 'just' });
  });

  it('un objet au mauvais endroit y reste, compte en moins, et peut être repris', () => {
    const ctx = fakeCtx();
    const game = chores.livingGame(ctx);
    const bear = game.peek().items.find((x) => x.id === 'bear');
    drag(game, bear, 92, 140); // sur l'étagère : pas sa place
    let p = game.peek();
    const b = p.items.find((x) => x.id === 'bear');
    expect(b.misplaced).toBe(true);
    expect(p.value).toBe(-1);
    expect(p.misplacedCount).toBe(1);
    // Les autres à leur place, puis « C'est bon ! » : 7 − 1 = 6, trop peu.
    for (let i = 0; i < 7; i++) { const it = game.peek().items.find((x) => !x.misplaced); drag(game, it, it.slot.x, it.slot.y); }
    p = game.peek();
    expect(p.placed).toBe(7);
    expect(p.value).toBe(6);
    expect(ctx.done).toBe(false);
    // On reprend le nounours et on le range : tout est juste.
    const b2 = game.peek().items.find((x) => x.id === 'bear');
    drag(game, b2, b2.slot.x, b2.slot.y);
    expect(ctx.finished).toEqual({ q: 1, msg: 'just' });
  });

  it('s\'arrêter avec un objet mal rangé ou par terre : moins de points, progressivement', () => {
    const q = (misplaced, left) => {
      const ctx = fakeCtx();
      const game = chores.livingGame(ctx);
      const wrong = game.peek().items.filter((x) => ['bear', 'train', 'ball'].includes(x.id)).slice(0, misplaced);
      for (const it of wrong) drag(game, it, 92, 140);
      for (let i = 0; i < 8 - misplaced - left; i++) { const it = game.peek().items.find((x) => !x.misplaced); drag(game, it, it.slot.x, it.slot.y); }
      press(ctx);
      return ctx.finished;
    };
    const one = q(0, 1);
    const wrongOne = q(1, 0);
    const two = q(0, 2);
    expect(one.msg).toBe('low');
    expect(one.q).toBeLessThan(0.85);
    expect(wrongOne.q).toBeLessThan(one.q); // un mal rangé coûte plus qu'un oublié par terre
    expect(two.q).toBeLessThan(one.q);
    expect(two.q).toBeGreaterThanOrEqual(JUST_FLOOR);
  });
});

describe('la vaisselle : chaque assiette frottée juste assez', () => {
  /** Frotte en ronds jusqu'à ce que cond(peek) soit vraie (ou que l'assiette parte). */
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
  const fly = (game, ctx) => { for (let i = 0; i < 60 && game.peek().phase === 'fly'; i++) game.update(1 / 30); };

  it('zone par assiette : la jauge repart à zéro à chaque assiette, et la note est la moyenne', () => {
    for (const [expected, cond] of [['just', (p) => p.value >= p.lo + 0.03], ['low', (p) => p.value >= 0.5], ['high', (p) => p.value >= p.hi + 0.3]]) {
      const ctx = fakeCtx();
      const game = chores.kitchenGame(ctx);
      const p0 = game.peek();
      expectZoneShown(ctx, p0);
      for (let n = 0; n < 5 && !ctx.done; n++) {
        scrubUntil(game, ctx, cond);
        expect(game.peek().done).toBe(n);
        press(ctx);
        expect(game.peek().phase).toBe('fly');
        fly(game, ctx);
        if (n < 4) expect(ctx.prog).toBe(0); // la jauge repart pour la suivante
      }
      expect(ctx.done).toBe(true);
      expect(game.peek().plates.length).toBe(5);
      const key = expected === 'just' ? 'mg_chore_justRight' : expected === 'low' ? 'mg_chore_tooLittle' : 'mg_chore_tooMuch';
      // (le message propre à la vaisselle, mg_chore_kitchen_low / _high, s'il existe dans i18n.js)
      const own = expected === 'just' ? key : `mg_chore_kitchen_${expected}`;
      expect(ctx.finished.msg).toBe(t(own) !== own ? t(own) : t(key));
      if (expected === 'just') expect(ctx.finished.q).toBe(1);
      else {
        expect(ctx.finished.q).toBeLessThan(0.8);
        expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
      }
    }
  });

  it('beaucoup trop frottée, l\'assiette part toute seule (trop)', () => {
    const ctx = fakeCtx();
    const game = chores.kitchenGame(ctx);
    const p = scrubUntil(game, ctx, () => false, 2000);
    expect(p.phase).toBe('fly');
    expect(p.plates[0]).toBeGreaterThanOrEqual(p.max);
  });
});

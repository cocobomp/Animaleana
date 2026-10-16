// Règle « juste ce qu'il faut » dans les mini-jeux des repas (nourrir, boire, friandise) et des
// câlins / jeux (caresser, jouer à la balle ou au plumeau, traire) : la zone verte est montrée
// dès le début (au bon endroit sur la jauge), un bouton « ✅ C'est bon ! » termine le jeu, et la
// note suit la règle : dans la zone = 1 (trois étoiles) ; trop peu OU trop = moins, pareil des
// deux côtés, jamais sous le plancher (0,4).
// Sans DOM ni canvas : un faux ctx remplace le cadre (src/ui/minigames.js), et on ne dessine pas.

import { describe, it, expect, beforeAll } from 'vitest';
import { justRight, verdict, JUST_FLOOR } from '../src/ui/minigames/score.js';
import { makeRng } from '../src/ui/minigames/draw.js';

let t;
let food;
let fun;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  food = await import('../src/ui/minigames/food.js');
  fun = await import('../src/ui/minigames/fun.js');
});

/** Le cadre, en faux : mêmes méthodes que le ctx de minigames.js, sans DOM. */
function fakeCtx(a) {
  const noop = () => {};
  return {
    a,
    sp: { emoji: '🐾' },
    action: 'test',
    chore: null,
    W: 400,
    H: 360,
    view: { x0: 0, y0: 0, x1: 400, y1: 360, w: 400, h: 360, scale: 1, ox: 0, oy: 0 },
    col: { coat: '#a06a35', sec: '#fff', mane: '#333', raw: { coat: 0xa06a35, pattern: 'solid' } },
    fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop, update: noop, draw: noop },
    rng: makeRng(11),
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
}

const animal = (species, o = {}) => ({ id: `${species}1`, name: 'Pomme', species, personality: 'calm', weight: 50, needs: { energy: 80 }, look: { seed: 3 }, ...o });
const stopOf = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop'));
const pressStop = (ctx) => stopOf(ctx).opts.onTap();
/** Fait avancer le jeu de n images de 1/30 s (ou jusqu'à ce que cond() soit vraie). */
function run(game, ctx, n, cond = () => false) {
  for (let i = 0; i < n && !cond(); i++) {
    ctx.time += 1 / 30;
    game.update(1 / 30);
  }
}
/** La zone affichée sur la jauge (fractions 0–1) doit être celle de peek(), ramenée sur la jauge. */
function expectZoneShown(ctx, p, scale = (v) => v) {
  expect(ctx.zones.length).toBe(1);
  const z = ctx.zones[0];
  expect(z.lo).toBeCloseTo(scale(p.lo), 6);
  expect(z.hi).toBeCloseTo(scale(p.hi), 6);
  expect(z.lo).toBeLessThan(z.hi);
  expect(z.lo).toBeGreaterThan(0);
  expect(z.hi).toBeLessThan(1);
}
/** Fin hors zone : moins que tout, au moins le plancher, et selon la règle commune. */
function expectLess(ctx, value, lo, hi, opts = {}) {
  expect(ctx.finished.q).toBeLessThan(1);
  expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
  expect(ctx.finished.q).toBeCloseTo(justRight(value, lo, hi, opts), 1);
}

// ---------------------------------------------------------------- verser (nourrir, boire)

describe('nourrir et donner à boire : verser jusqu\'à la zone verte, puis « C\'est bon ! »', () => {
  const CASES = [['feed', 'dog'], ['feed', 'horse'], ['feed', 'rabbit'], ['water', 'cat'], ['water', 'cow']];
  const make = (kind, sp) => {
    const ctx = fakeCtx(animal(sp));
    const game = (kind === 'feed' ? food.feedGame : food.waterGame)(ctx);
    return { ctx, game };
  };
  /** Verse (doigt appuyé) jusqu'à ce que la valeur atteigne goal, lâche, et attend que tout soit tombé. */
  function pourTo(game, ctx, goal) {
    game.down({ x: 200, y: 200 });
    run(game, ctx, 2000, () => ctx.done || game.peek().value >= goal);
    game.up({ x: 200, y: 200 });
    run(game, ctx, 200, () => ctx.done || game.peek().inFlight === 0);
    return game.peek();
  }

  it('montre la zone dès le début (la jauge = le niveau), avec un bouton C\'est bon grisé', () => {
    for (const [kind, sp] of CASES) {
      const { ctx, game } = make(kind, sp);
      const p = game.peek();
      expect(p.value).toBe(0);
      expectZoneShown(ctx, p);
      expect(p.lo).toBeGreaterThanOrEqual(0.45);
      expect(p.hi).toBeLessThanOrEqual(0.9);
      expect(ctx.buttons.length).toBe(2); // Verser (garder appuyé) + C'est bon
      expect(ctx.buttons[0].opts.hold).toBe(true);
      expect(stopOf(ctx).disabled).toBe(true);
    }
  });

  it('lâcher ne termine pas : on peut verser en plusieurs fois, c\'est « C\'est bon ! » qui finit', () => {
    for (const [kind, sp] of CASES) {
      const { ctx, game } = make(kind, sp);
      const p0 = game.peek();
      pourTo(game, ctx, p0.lo * 0.5);
      run(game, ctx, 90);
      expect(ctx.done).toBe(false);
      expect(stopOf(ctx).disabled).toBe(false);
      expect(ctx.hints.at(-1).text).toBe(food.nb(t('mg_more'))); // encore un peu
      const p = pourTo(game, ctx, p0.lo + 0.03); // on complète
      expect(p.value).toBeGreaterThanOrEqual(p.lo);
      expect(p.value).toBeLessThanOrEqual(p.hi);
      expect(ctx.hints.at(-1)).toEqual({ text: food.stopLabel(t), kind: 'good' });
      run(game, ctx, 60);
      expect(ctx.done).toBe(false);
      pressStop(ctx);
      run(game, ctx, 60, () => ctx.done);
      expect(ctx.finished).toEqual({ q: 1, msg: 'just' });
    }
  });

  it('trop peu ou trop : moins de points, de la même façon des deux côtés', () => {
    for (const [kind, sp] of CASES) {
      for (const where of ['low', 'high']) {
        const { ctx, game } = make(kind, sp);
        const p0 = game.peek();
        const p = pourTo(game, ctx, where === 'low' ? p0.lo - 0.15 : p0.hi + 0.06);
        expect(ctx.done).toBe(false);
        pressStop(ctx);
        run(game, ctx, 60, () => ctx.done);
        expect(ctx.finished.msg).toBe(where);
        expectLess(ctx, p.value, p.lo, p.hi);
      }
    }
  });

  it('« C\'est bon ! » attend que tout soit tombé, et compte ce qui tombait encore', () => {
    const { ctx, game } = make('feed', 'dog');
    const p0 = game.peek();
    game.down({});
    run(game, ctx, 2000, () => game.peek().value >= p0.lo + 0.05);
    game.up({});
    expect(game.peek().inFlight).toBeGreaterThan(0);
    pressStop(ctx);
    expect(ctx.done).toBe(false); // ça tombe encore
    run(game, ctx, 200, () => ctx.done);
    expect(ctx.finished).toEqual({ q: 1, msg: 'just' });
  });

  it('une simple tape (presque rien versé) ne permet pas de finir', () => {
    const { ctx, game } = make('water', 'cat');
    game.down({});
    run(game, ctx, 2);
    game.up({});
    run(game, ctx, 60);
    expect(game.peek().value).toBeLessThan(0.05);
    expect(stopOf(ctx).disabled).toBe(true);
    pressStop(ctx);
    run(game, ctx, 30);
    expect(ctx.done).toBe(false);
  });

  it('ça déborde : trop, et c\'est fini tout seul (jamais zéro)', () => {
    for (const [kind, sp] of CASES) {
      const { ctx, game } = make(kind, sp);
      const p = game.peek();
      game.down({});
      run(game, ctx, 4000, () => ctx.done);
      expect(ctx.done).toBe(true);
      expect(ctx.finished.msg).toBe('high');
      expectLess(ctx, 1, p.lo, p.hi);
    }
  });

  it('au clavier : Espace verse, Entrée dit « C\'est bon ! »', () => {
    const { ctx, game } = make('feed', 'cat');
    const p0 = game.peek();
    game.key('Space', true);
    run(game, ctx, 2000, () => game.peek().value >= p0.lo + 0.03);
    game.key('Space', false);
    run(game, ctx, 200, () => game.peek().inFlight === 0);
    game.key('Enter', true);
    run(game, ctx, 60, () => ctx.done);
    expect(ctx.finished).toEqual({ q: 1, msg: 'just' });
  });
});

// ---------------------------------------------------------------- friandise

describe('friandise : n friandises, au bon moment, puis « C\'est bon ! »', () => {
  /** Donne une friandise dès que l'animal est sage, et attend qu'il l'ait mangée. */
  function giveOne(game, ctx) {
    run(game, ctx, 600, () => game.peek().state === 'calm');
    expect(game.peek().state).toBe('calm');
    ctx.buttons[0].opts.onTap();
    run(game, ctx, 600, () => ctx.done || game.peek().state !== 'eat');
  }
  const SPECIES = [['rabbit', 1], ['cat', 2], ['dog', 2], ['horse', 3], ['cow', 3]];

  it('le nombre juste dépend de l\'animal (un animal bien rond en a une de moins)', () => {
    for (const [sp, n] of SPECIES) expect(food.treatCount(animal(sp))).toBe(n);
    expect(food.treatCount(animal('horse', { weight: 80 }))).toBe(2);
    expect(food.treatCount(animal('rabbit', { weight: 90 }))).toBe(1); // jamais moins d'une
  });

  it('montre la zone dès le début (case n sur la jauge), avec un bouton C\'est bon grisé', () => {
    for (const [sp, n] of SPECIES) {
      const ctx = fakeCtx(animal(sp));
      const game = food.treatGame(ctx);
      const p = game.peek();
      expect(p).toMatchObject({ n, lo: n, hi: n, value: 0, max: n + 2 });
      // La jauge avance d'une case par friandise : la case n est au milieu de la zone.
      expect(ctx.zones[0].lo).toBeCloseTo((n - 0.5) / p.max, 6);
      expect(ctx.zones[0].hi).toBeCloseTo((n + 0.5) / p.max, 6);
      expect(stopOf(ctx).disabled).toBe(true);
    }
  });

  it('juste = tous les points ; une de moins ou une de plus : moins, pareil des deux côtés', () => {
    for (const [sp, n] of SPECIES) {
      for (const give of [n - 1, n, n + 1]) {
        if (give < 1) continue; // lapin : « trop peu » = zéro friandise, on ne peut pas finir sans rien donner
        const ctx = fakeCtx(animal(sp));
        const game = food.treatGame(ctx);
        for (let i = 0; i < give; i++) giveOne(game, ctx);
        expect(ctx.done).toBe(false);
        expect(ctx.prog).toBeCloseTo(give / (n + 2), 6);
        pressStop(ctx);
        const why = give === n ? 'just' : give < n ? 'low' : 'high';
        expect(ctx.finished.msg).toBe(why);
        if (why === 'just') expect(ctx.finished.q).toBe(1);
        else expect(ctx.finished.q).toBeCloseTo(0.7, 6);
      }
    }
  });

  it('sans aucune friandise, « C\'est bon ! » ne fait rien (même tapé grisé)', () => {
    const ctx = fakeCtx(animal('rabbit'));
    const game = food.treatGame(ctx);
    pressStop(ctx);
    game.key('Enter', true);
    expect(ctx.done).toBe(false);
  });

  it('tout le sachet (n + 2) : trop, fini tout seul au plancher', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = food.treatGame(ctx);
    for (let i = 0; i < 4 && !ctx.done; i++) giveOne(game, ctx);
    expect(ctx.done).toBe(true);
    expect(ctx.finished).toEqual({ q: JUST_FLOOR, msg: 'high' });
  });

  it('donner trop tôt ne retire pas de points, mais l\'animal met plus longtemps à se calmer', () => {
    // Même graine : sans tape, il se calme après f images.
    const ref = fakeCtx(animal('dog'));
    const gRef = food.treatGame(ref);
    let f = 0;
    run(gRef, ref, 600, () => { if (gRef.peek().state === 'calm') return true; f++; return false; });
    expect(f).toBeGreaterThan(5);
    // Une tape impatiente juste avant : il lui faut encore au moins 0,8 s.
    const ctx = fakeCtx(animal('dog'));
    const game = food.treatGame(ctx);
    run(game, ctx, f - 2);
    expect(game.peek().state).toBe('wiggle');
    ctx.buttons[0].opts.onTap();
    expect(game.peek()).toMatchObject({ penalties: 1, given: 0 });
    expect(ctx.hints.at(-1)).toEqual({ text: food.nb(t('mg_treat_wait', { name: 'Pomme' })), kind: 'warn' });
    let after = 0;
    run(game, ctx, 600, () => { if (game.peek().state === 'calm') return true; after++; return false; });
    expect(after / 30).toBeGreaterThanOrEqual(0.75);
    // Et la note reste pleine si on donne ensuite le bon nombre.
    for (let i = 0; i < 2; i++) giveOne(game, ctx);
    pressStop(ctx);
    expect(ctx.finished).toEqual({ q: 1, msg: 'just' });
  });

  it('au clavier : Espace donne, Entrée dit « C\'est bon ! »', () => {
    const ctx = fakeCtx(animal('rabbit'));
    const game = food.treatGame(ctx);
    run(game, ctx, 600, () => game.peek().state === 'calm');
    game.key('Space', true);
    run(game, ctx, 600, () => game.peek().state !== 'eat');
    game.key('Enter', true);
    expect(ctx.finished).toEqual({ q: 1, msg: 'just' });
  });
});

// ---------------------------------------------------------------- caresser

describe('caresser : remplir le cœur jusqu\'à la zone verte, doucement', () => {
  /** Caresse lentement autour de l'endroit préféré jusqu'à ce que cond(peek) soit vraie. */
  function petUntil(game, ctx, cond, max = 4000) {
    const f = game.peek().fav;
    let i = 0;
    let dir = 1;
    let x = f.x - 18;
    game.down({ x, y: f.y });
    while (i++ < max && !ctx.done && !cond(game.peek())) {
      x += dir * 3; // 3 px par image de 1/60 s : 180 px/s, sous la limite des plus timides (300)
      if (x > f.x + 18 || x < f.x - 18) dir = -dir;
      ctx.time += 1 / 60;
      game.update(1 / 60);
      game.move({ x, y: f.y }, true);
    }
    game.up({ x, y: f.y });
    return game.peek();
  }
  const PERS = ['shy', 'calm', 'cuddly', 'playful'];

  it('montre la zone dès le début (selon le caractère), avec un bouton C\'est bon grisé', () => {
    const his = [];
    for (const personality of PERS) {
      const ctx = fakeCtx(animal('cat', { personality }));
      const game = fun.petGame(ctx);
      const p = game.peek();
      expect(p.value).toBe(0);
      expectZoneShown(ctx, p);
      expect(stopOf(ctx).disabled).toBe(true);
      his.push(p.hi);
    }
    expect(his[0]).toBeLessThan(his[2]); // un timide en veut moins qu'un câlin
  });

  it('juste = tous les points ; trop peu ou trop : moins, pareil des deux côtés', () => {
    for (const sp of ['cat', 'dog', 'horse', 'rabbit']) {
      for (const personality of ['shy', 'cuddly']) {
        for (const where of ['just', 'low', 'high']) {
          const ctx = fakeCtx(animal(sp, { personality }));
          const game = fun.petGame(ctx);
          const p0 = game.peek();
          const goal = where === 'just' ? p0.lo + 0.03 : where === 'low' ? p0.lo - 0.15 : p0.hi + 0.06;
          const p = petUntil(game, ctx, (q) => q.value >= goal);
          expect(ctx.done).toBe(false);
          expect(p.fast).toBe(0);
          expect(stopOf(ctx).disabled).toBe(false);
          pressStop(ctx);
          expect(ctx.finished.msg).toBe(where);
          if (where === 'just') expect(ctx.finished.q).toBe(1);
          else expectLess(ctx, p.value, p.lo, p.hi);
        }
      }
    }
  });

  it('cœur plein : il en a assez, trop, et c\'est fini tout seul au plancher', () => {
    const ctx = fakeCtx(animal('dog', { personality: 'shy' }));
    const game = fun.petGame(ctx);
    petUntil(game, ctx, () => false, 20000);
    expect(ctx.done).toBe(true);
    expect(ctx.finished).toEqual({ q: JUST_FLOOR, msg: 'high' });
  });

  it('trop vite : « Doucement ! », et le cœur redescend un peu', () => {
    const ctx = fakeCtx(animal('cat', { personality: 'shy' }));
    const game = fun.petGame(ctx);
    const p0 = petUntil(game, ctx, (q) => q.value >= 0.2);
    const f = p0.fav;
    game.down({ x: f.x - 30, y: f.y });
    for (let i = 0; i < 6; i++) {
      ctx.time += 1 / 60;
      game.move({ x: f.x - 30 + (i % 2) * 40, y: f.y }, true); // 40 px en 1/60 s : bien trop vite
    }
    const p = game.peek();
    expect(p.fast).toBeGreaterThan(0);
    expect(p.value).toBeLessThan(p0.value);
    expect(ctx.done).toBe(false);
  });

  it('au clavier : Entrée dit « C\'est bon ! » (pas avant d\'avoir caressé)', () => {
    const ctx = fakeCtx(animal('cat'));
    const game = fun.petGame(ctx);
    game.key('Enter', true);
    pressStop(ctx);
    expect(ctx.done).toBe(false);
    const p0 = game.peek();
    petUntil(game, ctx, (q) => q.value >= p0.lo + 0.03);
    game.key('Enter', true);
    expect(ctx.finished).toEqual({ q: 1, msg: 'just' });
  });
});

// ---------------------------------------------------------------- jouer : balle

describe('jouer à la balle : n lancers rapportés, puis « C\'est bon ! »', () => {
  /** Lance la balle juste à côté de l'animal et attend qu'il la rapporte. */
  function throwOne(game, ctx) {
    run(game, ctx, 900, () => ctx.done || game.peek().ball === 'hand');
    const r0 = game.peek().rounds;
    const p = game.peek();
    game.down({ x: Math.min(380, Math.max(20, p.x)), y: Math.min(310, Math.max(160, p.y)) });
    expect(game.peek().ball).toBe('fly');
    run(game, ctx, 1800, () => ctx.done || game.peek().rounds > r0);
    expect(game.peek().rounds).toBe(r0 + 1);
    run(game, ctx, 2); // le bouton se met à jour à l'image suivante
  }

  it('le nombre juste dépend du caractère et de la fatigue (2 à 4)', () => {
    expect(fun.playCount(animal('dog', { personality: 'playful' }))).toBe(4);
    expect(fun.playCount(animal('dog'))).toBe(3);
    expect(fun.playCount(animal('dog', { needs: { energy: 20 } }))).toBe(2);
    expect(fun.playCount(animal('dog', { personality: 'playful', needs: { energy: 20 } }))).toBe(3);
  });

  it('montre la zone dès le début (case n sur la jauge), avec un bouton C\'est bon grisé', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = fun.playGame(ctx);
    const p = game.peek();
    expect(p).toMatchObject({ n: 3, lo: 3, hi: 3, max: 5, value: 0 });
    expect(ctx.zones[0].lo).toBeCloseTo(2.5 / 5, 6);
    expect(ctx.zones[0].hi).toBeCloseTo(3.5 / 5, 6);
    run(game, ctx, 1);
    expect(stopOf(ctx).disabled).toBe(true);
  });

  it('juste = tous les points ; un lancer de moins ou de plus : moins, pareil des deux côtés', () => {
    for (const sp of ['dog', 'rabbit', 'goat']) {
      for (const k of [-1, 0, 1]) {
        const ctx = fakeCtx(animal(sp));
        const game = fun.playGame(ctx);
        const n = game.peek().n;
        for (let i = 0; i < n + k; i++) throwOne(game, ctx);
        expect(ctx.done).toBe(false);
        expect(stopOf(ctx).disabled).toBe(false);
        pressStop(ctx);
        expect(ctx.finished.msg).toBe(k === 0 ? 'just' : k < 0 ? 'low' : 'high');
        expect(ctx.finished.q).toBeCloseTo(k === 0 ? 1 : 0.7, 6);
      }
    }
  });

  it('pas de « C\'est bon ! » pendant que la balle est en l\'air, ni avant le premier lancer', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = fun.playGame(ctx);
    pressStop(ctx);
    game.key('Enter', true);
    expect(ctx.done).toBe(false);
    throwOne(game, ctx);
    const p = game.peek();
    game.down({ x: p.x, y: Math.min(310, Math.max(160, p.y)) });
    run(game, ctx, 1);
    expect(stopOf(ctx).disabled).toBe(true);
    pressStop(ctx);
    expect(ctx.done).toBe(false);
  });

  it('n + 2 lancers : il n\'en peut plus, trop, fini tout seul au plancher', () => {
    const ctx = fakeCtx(animal('dog', { needs: { energy: 20 } })); // n = 2
    const game = fun.playGame(ctx);
    for (let i = 0; i < 4; i++) throwOne(game, ctx);
    expect(ctx.done).toBe(true);
    expect(ctx.finished).toEqual({ q: JUST_FLOOR, msg: 'high' });
  });
});

// ---------------------------------------------------------------- jouer : plumeau (chat)

describe('jouer au plumeau (chat) : n bonds attrapés, puis « C\'est bon ! »', () => {
  /** Fait danser la plume devant le chat jusqu'à ce qu'il ait attrapé `want` fois. */
  function dance(game, ctx, want, max = 9000) {
    for (let i = 0; i < max && !ctx.done && game.peek().catches < want; i++) {
      const p = game.peek();
      game.move({ x: Math.min(370, p.x + 70 + Math.sin(i / 4) * 12), y: 200 + Math.cos(i / 5) * 12 });
      ctx.time += 1 / 30;
      game.update(1 / 30);
    }
    run(game, ctx, 60, () => !game.peek().held && !game.peek().jumping);
    return game.peek();
  }

  it('montre la zone dès le début, avec un bouton C\'est bon grisé', () => {
    const ctx = fakeCtx(animal('cat'));
    const game = fun.playGame(ctx);
    const p = game.peek();
    expect(p).toMatchObject({ n: 3, lo: 3, hi: 3, max: 5, catches: 0 });
    expect(ctx.zones[0].lo).toBeCloseTo(2.5 / 5, 6);
    expect(ctx.zones[0].hi).toBeCloseTo(3.5 / 5, 6);
    expect(stopOf(ctx).disabled).toBe(true);
  });

  it('juste = tous les points ; un bond de moins ou de plus : moins, pareil des deux côtés', () => {
    for (const k of [-1, 0, 1]) {
      const ctx = fakeCtx(animal('cat'));
      const game = fun.playGame(ctx);
      const p = dance(game, ctx, 3 + k);
      expect(p.catches).toBe(3 + k);
      expect(ctx.done).toBe(false);
      run(game, ctx, 1);
      pressStop(ctx);
      expect(ctx.finished.msg).toBe(k === 0 ? 'just' : k < 0 ? 'low' : 'high');
      expect(ctx.finished.q).toBeCloseTo(k === 0 ? 1 : 0.7, 6);
    }
  });

  it('n + 2 bonds : il n\'en peut plus, fini tout seul au plancher', () => {
    const ctx = fakeCtx(animal('cat'));
    const game = fun.playGame(ctx);
    dance(game, ctx, 5, 20000);
    expect(ctx.done).toBe(true);
    expect(ctx.finished).toEqual({ q: JUST_FLOOR, msg: 'high' });
  });
});

// ---------------------------------------------------------------- traire

describe('traire : le lait jusqu\'au trait vert, puis « C\'est bon ! »', () => {
  /** Presse gauche / droite, une fois par temps (en mesure, ou pile à contretemps), jusqu'à ce que le niveau atteigne goal. */
  function milkTo(game, ctx, goal, onBeat = true) {
    let last = -1;
    for (let i = 0; i < 8000 && !ctx.done && game.peek().value < goal; i++) {
      ctx.time += 1 / 60;
      game.update(1 / 60);
      const p = game.peek();
      const inWindow = onBeat ? p.phase < 0.04 || p.phase > 0.96 : p.phase > 0.46 && p.phase < 0.54;
      if (inWindow && ctx.time - last > 0.3) {
        last = ctx.time;
        ctx.buttons[p.expect === 'L' ? 0 : 1].opts.onTap();
      }
    }
    return game.peek();
  }

  it('montre la zone dès le début (vache : plus haut que la chèvre), avec un bouton C\'est bon grisé', () => {
    for (const sp of ['cow', 'goat']) {
      const ctx = fakeCtx(animal(sp));
      const game = fun.milkGame(ctx);
      const p = game.peek();
      expectZoneShown(ctx, p);
      expect(ctx.buttons.map((b) => b.opts.cls)).toEqual(['mg-half', 'mg-half', 'stop primary']);
      expect(stopOf(ctx).disabled).toBe(true);
    }
  });

  it('juste = tous les points, en rythme ou non ; trop peu ou trop : moins, pareil des deux côtés', () => {
    for (const sp of ['cow', 'goat']) {
      for (const [where, onBeat] of [['just', true], ['just', false], ['low', true], ['high', true]]) {
        const ctx = fakeCtx(animal(sp));
        const game = fun.milkGame(ctx);
        const p0 = game.peek();
        const goal = where === 'just' ? (p0.lo + p0.hi) / 2 - 0.02 : where === 'low' ? p0.lo - 0.12 : p0.hi + 0.06;
        const p = milkTo(game, ctx, goal, onBeat);
        expect(ctx.done).toBe(false);
        if (where === 'just') { expect(p.value).toBeGreaterThanOrEqual(p.lo); expect(p.value).toBeLessThanOrEqual(p.hi); }
        pressStop(ctx);
        expect(ctx.finished.msg).toBe(where);
        if (where === 'just') expect(ctx.finished.q).toBe(1);
        else expectLess(ctx, p.value, p.lo, p.hi);
      }
    }
  });

  it('en rythme, chaque pression donne plus de lait (on arrive plus vite au trait)', () => {
    const count = (onBeat) => {
      const ctx = fakeCtx(animal('cow'));
      const game = fun.milkGame(ctx);
      const p = milkTo(game, ctx, game.peek().lo, onBeat);
      return p.hits;
    };
    expect(count(true)).toBeLessThan(count(false));
  });

  it('se tromper de côté ne donne pas de lait', () => {
    const ctx = fakeCtx(animal('goat'));
    const game = fun.milkGame(ctx);
    ctx.buttons[1].opts.onTap(); // il fallait commencer à gauche
    expect(game.peek()).toMatchObject({ mistakes: 1, value: 0 });
    expect(stopOf(ctx).disabled).toBe(true);
  });

  it('seau plein : trop, fini tout seul au plancher', () => {
    const ctx = fakeCtx(animal('cow'));
    const game = fun.milkGame(ctx);
    milkTo(game, ctx, 2);
    expect(ctx.done).toBe(true);
    expect(ctx.finished).toEqual({ q: JUST_FLOOR, msg: 'high' });
  });

  it('au clavier : flèches ou Espace pour traire, Entrée pour « C\'est bon ! »', () => {
    const ctx = fakeCtx(animal('cow'));
    const game = fun.milkGame(ctx);
    game.key('Enter', true);
    expect(ctx.done).toBe(false);
    for (let i = 0; i < 4000 && game.peek().value < game.peek().lo + 0.02; i++) {
      ctx.time += 1 / 60;
      game.update(1 / 60);
      const ph = game.peek().phase;
      if (ph < 0.03 || ph > 0.97) game.key(i % 3 === 0 ? 'Space' : game.peek().expect === 'L' ? 'ArrowLeft' : 'ArrowRight', true);
    }
    game.key('Enter', true);
    expect(ctx.finished).toEqual({ q: 1, msg: 'just' });
  });
});

// Contre-vérification des mini-jeux des repas (nourrir, boire, friandise) et des câlins / jeux
// (caresser, balle, plumeau, traire) : les cas limites de la règle « juste ce qu'il faut ».
// - pile au bord de la zone (dedans) : plein score ;
// - un tout petit peu dehors, d'un côté ou de l'autre : un peu moins, jamais plus que juste ;
// - très loin dehors : le plancher (0,4), jamais 0 ;
// - « C'est bon ! » tout de suite : rien ne se passe ;
// - ne jamais s'arrêter : le jeu finit tout seul (trop), au-dessus de 0 ;
// - la note est exactement justRight(valeur, zone) : pareil des deux côtés.
// Plus : les consignes gardent « ! » collé au mot (espace insécable), et le dessin de chaque
// jeu ne lève pas d'erreur ni ne produit de coordonnée NaN (dessiné sur un faux canvas).
// Sans DOM : un faux ctx remplace le cadre (src/ui/minigames.js), comme tests/minigames-juste.test.js.

import { describe, it, expect, beforeAll } from 'vitest';
import { justRight, verdict, JUST_FLOOR } from '../src/ui/minigames/score.js';
import { makeRng, coatColors } from '../src/ui/minigames/draw.js';
import { createAnimal } from '../src/sim/animal.js';

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
function fakeCtx(a, seed = 11) {
  const noop = () => {};
  return {
    a,
    sp: { emoji: '🐾' },
    action: 'test',
    chore: null,
    W: 400,
    H: 360,
    view: { x0: 0, y0: -15, x1: 400, y1: 375, w: 400, h: 390, scale: 1, ox: 0, oy: 0 },
    col: coatColors(a),
    fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop, update: noop, draw: noop },
    rng: makeRng(seed),
    time: 0,
    done: false,
    pointer: { x: 0, y: 0, down: false, over: false, type: 'touch' },
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
      this.finished.value = value;
      this.finished.text = o.msgs?.[v] ?? null;
      return { q, verdict: v };
    },
    stopButton(onStop, label = t('mg_stopHere')) { return this.button(label.includes('✅') ? label : `✅ ${label}`, { cls: 'stop primary', onTap: onStop }); },
  };
}

/** Un vrai animal (createAnimal), avec ce qu'il faut de fixe pour des tests reproductibles. */
function animal(species, o = {}) {
  const a = createAnimal({ species, ageDays: 900, sex: 'f', rng: makeRng(5) });
  return Object.assign(a, { name: 'Pomme', personality: 'calm', weight: 50 }, o, { needs: { ...a.needs, energy: 80, ...(o.needs ?? {}) } });
}
const stopOf = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop'));
const pressStop = (ctx) => stopOf(ctx).opts.onTap();
const round2 = (q) => Math.round(Math.max(JUST_FLOOR, Math.min(1, q)) * 100) / 100;
/** Fait avancer le jeu de n images de 1/30 s (ou jusqu'à ce que cond() soit vraie). */
function run(game, ctx, n, cond = () => false, dt = 1 / 30) {
  for (let i = 0; i < n && !cond(); i++) {
    ctx.time += dt;
    game.update(dt);
  }
}
/** La note doit être exactement celle de la règle commune, pour la valeur atteinte. */
function expectRule(ctx, p, opts = {}) {
  const v = ctx.finished.value;
  expect(ctx.finished.q).toBe(round2(justRight(v, p.lo, p.hi, opts)));
  expect(ctx.finished.msg).toBe(verdict(v, p.lo, p.hi));
  expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
  if (ctx.finished.msg === 'just') expect(ctx.finished.q).toBe(1);
  else expect(ctx.finished.q).toBeLessThan(1);
}

// ---------------------------------------------------------------- verser

describe('verser (nourrir, boire) : cas limites', () => {
  const CASES = [['feed', 'dog'], ['feed', 'horse'], ['feed', 'cat'], ['feed', 'sheep'], ['water', 'rabbit'], ['water', 'goat'], ['water', 'cow']];
  const make = (kind, sp, seed = 11) => {
    const ctx = fakeCtx(animal(sp), seed);
    const game = (kind === 'feed' ? food.feedGame : food.waterGame)(ctx);
    return { ctx, game };
  };
  /** Verse jusqu'à ce que la valeur (ce qui tombera compris) atteigne goal, lâche, attend que tout soit tombé. */
  function pourTo(game, ctx, goal) {
    game.down({ x: 200, y: 200 });
    run(game, ctx, 4000, () => ctx.done || game.peek().value >= goal);
    game.up({ x: 200, y: 200 });
    run(game, ctx, 300, () => ctx.done || game.peek().inFlight === 0);
    return game.peek();
  }
  const finish = (game, ctx) => { pressStop(ctx); run(game, ctx, 120, () => ctx.done); };

  it('à peine entré dans la zone (bord bas) ou juste avant d\'en sortir (bord haut) : plein score', () => {
    for (const [kind, sp] of CASES) {
      for (const seed of [3, 11, 29]) {
        for (const edge of ['lo', 'hi']) {
          const { ctx, game } = make(kind, sp, seed);
          const p0 = game.peek();
          const p = pourTo(game, ctx, edge === 'lo' ? p0.lo : p0.hi - 0.016);
          expect(p.value).toBeGreaterThanOrEqual(p.lo);
          expect(p.value).toBeLessThanOrEqual(p.hi);
          if (edge === 'lo') expect(p.value - p.lo).toBeLessThan(0.02);
          else expect(p.hi - p.value).toBeLessThan(0.03);
          finish(game, ctx);
          expect(ctx.finished).toMatchObject({ q: 1, msg: 'just' });
        }
      }
    }
  });

  it('un tout petit peu dehors (dessous ou dessus) : un peu moins que juste, et le message dit pourquoi', () => {
    for (const [kind, sp] of CASES) {
      for (const side of ['low', 'high']) {
        const { ctx, game } = make(kind, sp);
        const p0 = game.peek();
        const p = pourTo(game, ctx, side === 'low' ? p0.lo - 0.03 : p0.hi + 0.001);
        if (side === 'low') expect(p.value).toBeLessThan(p.lo);
        else expect(p.value).toBeGreaterThan(p.hi);
        finish(game, ctx);
        expect(ctx.finished.msg).toBe(side);
        expectRule(ctx, p);
        expect(ctx.finished.q).toBeGreaterThan(0.85); // à peine dehors : à peine moins
      }
    }
  });

  it('même écart sous la zone ou au-dessus : même note (règle symétrique)', () => {
    for (const [kind, sp] of CASES) {
      const lowG = make(kind, sp, 7);
      const highG = make(kind, sp, 7); // même graine : même zone
      const p0 = lowG.game.peek();
      expect(highG.game.peek().lo).toBe(p0.lo);
      const pl = pourTo(lowG.game, lowG.ctx, p0.lo - 0.08);
      const ph = pourTo(highG.game, highG.ctx, p0.hi + 0.08);
      finish(lowG.game, lowG.ctx);
      finish(highG.game, highG.ctx);
      expectRule(lowG.ctx, pl);
      expectRule(highG.ctx, ph);
      // À écart égal, même note (à l'arrondi près des grains / gouttes).
      const dl = p0.lo - lowG.ctx.finished.value;
      const dh = highG.ctx.finished.value - p0.hi;
      expect(Math.abs(dl - dh)).toBeLessThan(0.08);
      expect(round2(justRight(p0.lo - dl, p0.lo, p0.hi))).toBe(round2(justRight(p0.hi + dl, p0.lo, p0.hi)));
    }
  });

  it('presque rien (juste au-dessus du minimum) : le plancher, jamais 0', () => {
    for (const [kind, sp] of CASES) {
      const { ctx, game } = make(kind, sp);
      const p = pourTo(game, ctx, 0.05);
      expect(stopOf(ctx).disabled).toBe(false);
      finish(game, ctx);
      expect(ctx.finished).toMatchObject({ q: JUST_FLOOR, msg: 'low' });
      expectRule(ctx, p);
    }
  });

  it('« C\'est bon ! » tout de suite, ou pendant qu\'on verse : rien ne se passe', () => {
    for (const [kind, sp] of CASES) {
      const { ctx, game } = make(kind, sp);
      pressStop(ctx);
      game.key('Enter', true);
      run(game, ctx, 30);
      expect(ctx.done).toBe(false);
      // Pendant qu'on verse (même dans la zone), « C'est bon ! » est grisé et ne fait rien.
      game.down({});
      run(game, ctx, 4000, () => game.peek().value >= game.peek().lo + 0.02);
      run(game, ctx, 1);
      expect(stopOf(ctx).disabled).toBe(true);
      pressStop(ctx);
      game.key('Enter', true);
      expect(game.peek().finishing).toBe(false);
      game.up({});
      run(game, ctx, 300, () => game.peek().inFlight === 0);
      expect(ctx.done).toBe(false);
      expect(stopOf(ctx).disabled).toBe(false);
    }
  });

  it('ne jamais s\'arrêter (doigt appuyé, ou par petits coups) : ça déborde, fin tout seul, trop, au moins 0,4', () => {
    for (const [kind, sp] of CASES) {
      for (const how of ['hold', 'taps']) {
        const { ctx, game } = make(kind, sp);
        const p0 = game.peek();
        if (how === 'hold') {
          game.down({});
          run(game, ctx, 6000, () => ctx.done);
        } else {
          for (let i = 0; i < 400 && !ctx.done; i++) {
            game.down({});
            run(game, ctx, 8, () => ctx.done);
            game.up({});
            run(game, ctx, 8, () => ctx.done);
          }
        }
        expect(ctx.done).toBe(true);
        expect(ctx.finished.msg).toBe('high');
        expect(ctx.finished.value).toBe(1);
        expect(ctx.finished.q).toBe(round2(justRight(1, p0.lo, p0.hi)));
        expect(ctx.finished.q).toBeLessThan(1);
        expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
      }
    }
  });
});

// ---------------------------------------------------------------- friandise

describe('friandise : cas limites', () => {
  function giveOne(game, ctx) {
    run(game, ctx, 900, () => ctx.done || game.peek().state === 'calm');
    if (ctx.done) return;
    expect(game.peek().state).toBe('calm');
    ctx.buttons[0].opts.onTap();
    run(game, ctx, 900, () => ctx.done || game.peek().state !== 'eat');
  }
  const SPECIES = ['rabbit', 'cat', 'dog', 'sheep', 'goat', 'horse', 'cow'];

  it('de 1 à n + 1 friandises puis « C\'est bon ! » : note = justRight(donné, n, n, mou 2), juste = 1', () => {
    for (const sp of SPECIES) {
      for (const weight of [50, 90]) {
        const n = food.treatCount(animal(sp, { weight }));
        for (let give = 1; give <= n + 1; give++) {
          const ctx = fakeCtx(animal(sp, { weight }));
          const game = food.treatGame(ctx);
          for (let i = 0; i < give; i++) giveOne(game, ctx);
          expect(ctx.done).toBe(false);
          pressStop(ctx);
          expect(ctx.finished.value).toBe(give);
          expectRule(ctx, { lo: n, hi: n }, { slack: 2 });
          expect(ctx.finished.q).toBe(give === n ? 1 : give === n - 1 || give === n + 1 ? 0.7 : JUST_FLOOR);
        }
      }
    }
  });

  it('« C\'est bon ! » pendant que l\'animal mange la dernière : compte bien, plein score', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = food.treatGame(ctx);
    const n = game.peek().n;
    for (let i = 0; i < n - 1; i++) giveOne(game, ctx);
    run(game, ctx, 900, () => game.peek().state === 'calm');
    ctx.buttons[0].opts.onTap();
    expect(game.peek().state).toBe('eat');
    pressStop(ctx);
    expect(ctx.finished).toMatchObject({ q: 1, msg: 'just', value: n });
  });

  it('« C\'est bon ! » tout de suite : rien (le lapin, qui n\'en veut qu\'une, n\'a donc pas de « trop peu »)', () => {
    for (const sp of SPECIES) {
      const ctx = fakeCtx(animal(sp));
      const game = food.treatGame(ctx);
      pressStop(ctx);
      game.key('Enter', true);
      run(game, ctx, 60);
      expect(ctx.done).toBe(false);
    }
    // Lapin : n = 1, et finir sans rien donner n'est pas permis : « trop peu » n'existe pas.
    expect(food.treatCount(animal('rabbit'))).toBe(1);
  });

  it('ne jamais s\'arrêter : à n + 2, l\'animal a tout mangé, fin tout seul au plancher', () => {
    for (const sp of SPECIES) {
      const ctx = fakeCtx(animal(sp));
      const game = food.treatGame(ctx);
      const n = game.peek().n;
      for (let i = 0; i < n + 3 && !ctx.done; i++) giveOne(game, ctx);
      expect(ctx.done).toBe(true);
      expect(ctx.finished).toMatchObject({ q: JUST_FLOOR, msg: 'high', value: n + 2 });
    }
  });

  it('taper sans arrêt (impatient) ne coûte aucun point : juste reste plein score', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = food.treatGame(ctx);
    for (let i = 0; i < 12; i++) { ctx.buttons[0].opts.onTap(); run(game, ctx, 6); } // tape toutes les 0,2 s
    expect(game.peek().penalties).toBeGreaterThan(3);
    expect(game.peek().given).toBe(0);
    giveOne(game, ctx);
    giveOne(game, ctx);
    pressStop(ctx);
    expect(ctx.finished).toMatchObject({ q: 1, msg: 'just' });
  });
});

// ---------------------------------------------------------------- caresser

describe('caresser : cas limites', () => {
  function petUntil(game, ctx, cond, max = 20000) {
    const f = game.peek().fav;
    let i = 0;
    let dir = 1;
    let x = f.x - 18;
    game.down({ x, y: f.y });
    while (i++ < max && !ctx.done && !cond(game.peek())) {
      x += dir * 2; // petits pas : la valeur avance finement (on peut viser le bord de la zone)
      if (x > f.x + 18 || x < f.x - 18) dir = -dir;
      ctx.time += 1 / 60;
      game.update(1 / 60);
      game.move({ x, y: f.y }, true);
    }
    game.up({ x, y: f.y });
    return game.peek();
  }
  const PERS = ['shy', 'calm', 'cuddly', 'playful', 'curious', 'stubborn'];
  const SPECIES = ['cat', 'dog', 'rabbit', 'horse', 'cow', 'sheep', 'goat'];

  it('au bord de la zone (dedans) : plein score ; un tout petit peu dehors : à peine moins', () => {
    for (const sp of SPECIES) {
      for (const personality of ['shy', 'cuddly']) {
        for (const where of ['edgeLo', 'edgeHi', 'tinyLow', 'tinyHigh']) {
          const ctx = fakeCtx(animal(sp, { personality }));
          const game = fun.petGame(ctx);
          const p0 = game.peek();
          const goal = { edgeLo: p0.lo, edgeHi: p0.hi - 0.006, tinyLow: p0.lo - 0.03, tinyHigh: p0.hi + 0.001 }[where];
          const p = petUntil(game, ctx, (q) => q.value >= goal);
          expect(p.fast).toBe(0);
          pressStop(ctx);
          expectRule(ctx, p);
          if (where.startsWith('edge')) expect(ctx.finished).toMatchObject({ q: 1, msg: 'just' });
          else {
            expect(ctx.finished.msg).toBe(where === 'tinyLow' ? 'low' : 'high');
            expect(ctx.finished.q).toBeGreaterThan(0.85);
          }
        }
      }
    }
  });

  it('à peine caressé (3 %) : le plancher ; « C\'est bon ! » avant : rien', () => {
    for (const personality of PERS) {
      const ctx = fakeCtx(animal('cat', { personality }));
      const game = fun.petGame(ctx);
      pressStop(ctx);
      game.key('Enter', true);
      expect(ctx.done).toBe(false);
      const p = petUntil(game, ctx, (q) => q.value >= 0.03);
      pressStop(ctx);
      expectRule(ctx, p);
      expect(ctx.finished).toMatchObject({ q: JUST_FLOOR, msg: 'low' });
    }
  });

  it('ne jamais s\'arrêter : cœur plein, fin tout seul, trop, note < 1 et ≥ 0,4 pour chaque caractère', () => {
    for (const personality of PERS) {
      const ctx = fakeCtx(animal('dog', { personality }));
      const game = fun.petGame(ctx);
      const p0 = game.peek();
      petUntil(game, ctx, () => false, 40000);
      expect(ctx.done).toBe(true);
      expect(ctx.finished.msg).toBe('high');
      expect(ctx.finished.q).toBe(round2(justRight(1, p0.lo, p0.hi)));
      expect(ctx.finished.q).toBeLessThan(1);
      expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
    }
  });

  it('le grand cœur (jauge) ne cache pas la tête ni les oreilles de l\'animal', async () => {
    const { fitAnimal, animalShape } = await import('../src/ui/minigames/draw.js');
    const H = fun.HEART;
    // Le cœur et son ✓ (à gauche) : boîte englobante, en unités du mini-jeu.
    const heart = { x0: H.x - H.r * 1.55 - 10, x1: H.x + H.r * 1.2, y0: H.y - H.r * 1.1, y1: H.y + H.r };
    expect(heart.x1).toBeLessThanOrEqual(400); // tient dans le cadre
    expect(heart.y0).toBeGreaterThanOrEqual(0);
    for (const sp of SPECIES) {
      const a = animal(sp);
      const fit = fitAnimal(a, { groundY: 305, maxW: 330, maxH: 240 });
      const sh = animalShape(a, { x: fit.x, y: 305, s: fit.s, f: 1 });
      // Tête (jusqu'au museau) et oreilles (dessinées au-dessus de la tête, voir drawHead :
      // celles du lapin montent à 2,6 rayons) : deux boîtes englobantes, avec de la marge.
      const { x, y } = sh.head;
      const r = sh.hr;
      const boxes = {
        tête: { x0: x - r * 1.25, x1: Math.max(x + r * 1.4, sh.mouth.x + 6), y0: y - r * 1.1, y1: y + r },
        oreilles: { x0: x - r * 0.9, x1: x + r * 0.7, y0: y - r * (sp === 'rabbit' ? 2.75 : 1.9), y1: y },
      };
      for (const [part, b] of Object.entries(boxes)) {
        const overlap = b.x0 < heart.x1 && b.x1 > heart.x0 && b.y0 < heart.y1 && b.y1 > heart.y0;
        expect(overlap, `${sp} ${part} ${JSON.stringify(b)} / cœur ${JSON.stringify(heart)}`).toBe(false);
      }
    }
  });

  it('dépasser la zone : la consigne dit « Un peu trop ! » (comme les autres jeux), pas « Arrête-toi dans la zone »', () => {
    const ctx = fakeCtx(animal('cat', { personality: 'shy' }));
    const game = fun.petGame(ctx);
    petUntil(game, ctx, (q) => q.value > q.hi + 0.01);
    expect(ctx.hints.at(-1)).toEqual({ text: food.nb(t('mg_tooMuch', { name: 'Pomme' })), kind: 'warn' });
  });
});

// ---------------------------------------------------------------- jouer (balle et plumeau)

describe('jouer : cas limites', () => {
  function throwOne(game, ctx) {
    run(game, ctx, 1200, () => ctx.done || game.peek().ball === 'hand');
    if (ctx.done) return;
    const r0 = game.peek().rounds;
    const p = game.peek();
    game.down({ x: Math.min(380, Math.max(20, p.x)), y: Math.min(310, Math.max(160, p.y)) });
    run(game, ctx, 2400, () => ctx.done || game.peek().rounds > r0);
    run(game, ctx, 2);
  }
  function dance(game, ctx, want, max = 30000) {
    for (let i = 0; i < max && !ctx.done && game.peek().catches < want; i++) {
      const p = game.peek();
      game.move({ x: Math.min(370, p.x + 70 + Math.sin(i / 4) * 12), y: 200 + Math.cos(i / 5) * 12 });
      ctx.time += 1 / 30;
      game.update(1 / 30);
    }
    run(game, ctx, 90, () => !game.peek().held && !game.peek().jumping);
    run(game, ctx, 1);
  }

  it('balle, joueur (n = 4) : de 1 à n + 1 lancers, note = justRight(lancers, n, n, mou 2)', () => {
    for (const sp of ['dog', 'goat', 'rabbit']) {
      const a = { personality: 'playful' };
      expect(fun.playCount(animal(sp, a))).toBe(4);
      for (let k = 1; k <= 5; k++) {
        const ctx = fakeCtx(animal(sp, a));
        const game = fun.playGame(ctx);
        for (let i = 0; i < k; i++) throwOne(game, ctx);
        expect(ctx.done).toBe(false);
        pressStop(ctx);
        expect(ctx.finished.value).toBe(k);
        expectRule(ctx, { lo: 4, hi: 4 }, { slack: 2 });
        expect(ctx.finished.q).toBe(k === 4 ? 1 : k === 3 || k === 5 ? 0.7 : JUST_FLOOR);
      }
    }
  });

  it('balle : « C\'est bon ! » tout de suite, ou balle en l\'air : rien ; ne jamais s\'arrêter : fin à n + 2', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = fun.playGame(ctx);
    run(game, ctx, 1);
    pressStop(ctx);
    game.key('Enter', true);
    expect(ctx.done).toBe(false);
    for (let i = 0; i < 9 && !ctx.done; i++) throwOne(game, ctx);
    expect(ctx.finished).toMatchObject({ q: JUST_FLOOR, msg: 'high', value: 5 });
  });

  it('plumeau : le chat lâche la plume après un bond ; si on ne la bouge plus, il ne l\'attrape pas tout seul', () => {
    // Avant : la plume sautait de 140 px quand le chat la lâchait, ce saut comptait comme un
    // mouvement très rapide, et le chat rebondissait tout seul : l'enfant arrêté pile à n
    // trouvait n + 1 en appuyant sur « C'est bon ! » (« Un peu trop ! » sans avoir rien fait).
    for (const seed of [3, 11, 29, 40]) {
      const ctx = fakeCtx(animal('cat'), seed);
      const game = fun.playGame(ctx);
      const n = game.peek().n;
      dance(game, ctx, n);
      expect(game.peek().catches).toBe(n);
      run(game, ctx, 150); // 5 s sans toucher la plume
      expect(game.peek().catches).toBe(n);
      expect(game.peek().jumping).toBe(false);
      pressStop(ctx);
      expect(ctx.finished).toMatchObject({ q: 1, msg: 'just' });
    }
  });

  it('plumeau (chat) : de 1 à n + 1 bonds, note = justRight(bonds, n, n, mou 2) ; à n + 2, fin tout seul', () => {
    const n = fun.playCount(animal('cat'));
    for (let k = 1; k <= n + 2; k++) {
      const ctx = fakeCtx(animal('cat'));
      const game = fun.playGame(ctx);
      pressStop(ctx);
      expect(ctx.done).toBe(false); // rien avant le premier bond
      dance(game, ctx, k);
      if (k <= n + 1) {
        expect(ctx.done).toBe(false);
        pressStop(ctx);
      }
      expect(ctx.finished.value).toBe(k);
      expectRule(ctx, { lo: n, hi: n }, { slack: 2 });
    }
  });
});

// ---------------------------------------------------------------- traire

describe('traire : cas limites', () => {
  function milkTo(game, ctx, cond) {
    let last = -1;
    for (let i = 0; i < 20000 && !ctx.done && !cond(game.peek()); i++) {
      ctx.time += 1 / 60;
      game.update(1 / 60);
      const p = game.peek();
      if (ctx.time - last > 0.3) {
        last = ctx.time;
        ctx.buttons[p.expect === 'L' ? 0 : 1].opts.onTap();
      }
    }
    return game.peek();
  }

  it('première pression dans la zone (bord bas) et dernière avant d\'en sortir (bord haut) : plein score', () => {
    for (const sp of ['cow', 'goat']) {
      for (const seed of [2, 11, 40]) {
        for (const edge of ['lo', 'hi']) {
          const ctx = fakeCtx(animal(sp), seed);
          const game = fun.milkGame(ctx);
          const p0 = game.peek();
          // bord haut : on s'arrête quand la prochaine pression (au plus 0,05) sortirait de la zone
          const p = milkTo(game, ctx, (q) => (edge === 'lo' ? q.value >= q.lo : q.value >= q.hi - 0.05));
          expect(p.value).toBeGreaterThanOrEqual(p0.lo);
          expect(p.value).toBeLessThanOrEqual(p0.hi);
          pressStop(ctx);
          expect(ctx.finished).toMatchObject({ q: 1, msg: 'just' });
        }
      }
    }
  });

  it('juste avant la zone, juste après : un peu moins ; une seule pression : le plancher', () => {
    for (const sp of ['cow', 'goat']) {
      for (const where of ['before', 'after', 'one']) {
        const ctx = fakeCtx(animal(sp));
        const game = fun.milkGame(ctx);
        let p;
        if (where === 'one') { ctx.buttons[0].opts.onTap(); p = game.peek(); } else {
          // la dernière pression avant d'entrer, ou la première après être sorti
          p = milkTo(game, ctx, (q) => (where === 'before' ? q.value + 0.05 >= q.lo : q.value > q.hi));
        }
        if (where === 'before' && p.value >= p.lo) continue; // (la pression suivante tombait déjà dedans)
        pressStop(ctx);
        expectRule(ctx, p);
        if (where === 'one') expect(ctx.finished).toMatchObject({ q: JUST_FLOOR, msg: 'low' });
        else expect(ctx.finished.msg).toBe(where === 'before' ? 'low' : 'high');
      }
    }
  });

  it('« C\'est bon ! » tout de suite, ou après le mauvais côté seulement : rien ; seau plein : fin tout seul', () => {
    const ctx = fakeCtx(animal('cow'));
    const game = fun.milkGame(ctx);
    pressStop(ctx);
    game.key('Enter', true);
    ctx.buttons[1].opts.onTap(); // mauvais côté : pas de lait
    pressStop(ctx);
    expect(ctx.done).toBe(false);
    const p0 = game.peek();
    milkTo(game, ctx, () => false);
    expect(ctx.done).toBe(true);
    expect(ctx.finished.msg).toBe('high');
    expect(ctx.finished.q).toBe(round2(justRight(1, p0.lo, p0.hi)));
    expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
  });

  it('dépasser la zone : « Un peu trop ! » comme les autres jeux', () => {
    const ctx = fakeCtx(animal('goat'));
    const game = fun.milkGame(ctx);
    milkTo(game, ctx, (q) => q.value > q.hi);
    expect(ctx.hints.at(-1)).toEqual({ text: food.nb(t('mg_tooMuch', { name: 'Pomme' })), kind: 'warn' });
  });
});

// ---------------------------------------------------------------- textes

describe('consignes et messages : « ! » jamais seul à la ligne', () => {
  it('nb() colle « ! ? : ; » au mot qui précède (espace insécable)', () => {
    expect(food.nb('Oh oui, juste là ! C\'est son endroit préféré !')).toBe('Oh oui, juste là\u00a0! C\'est son endroit préféré\u00a0!');
    expect(food.nb('« Bravo »')).toBe('«\u00a0Bravo\u00a0»');
    expect(food.stopLabel(t)).toBe(`✅ ${t('mg_stopHere').replace(' !', '\u00a0!')}`);
  });

  it('toutes les consignes et les messages de fin des six jeux passent par nb()', () => {
    const games = [
      ['feed', 'dog', (c) => food.feedGame(c)], ['water', 'cow', (c) => food.waterGame(c)], ['treat', 'horse', (c) => food.treatGame(c)],
      ['pet', 'cat', (c) => fun.petGame(c)], ['play', 'dog', (c) => fun.playGame(c)], ['play', 'cat', (c) => fun.playGame(c)], ['milk', 'cow', (c) => fun.milkGame(c)],
    ];
    for (const [, sp, make] of games) {
      const ctx = fakeCtx(animal(sp));
      make(ctx);
      for (const h of ctx.hints) expect(h.text).not.toMatch(/ [!?:;»]/);
    }
    // Message de fin (friandise, au plancher) : textes déjà prêts, avec l'espace insécable.
    const ctx = fakeCtx(animal('rabbit'));
    const game = food.treatGame(ctx);
    for (let i = 0; i < 4 && !ctx.done; i++) {
      run(game, ctx, 900, () => ctx.done || game.peek().state === 'calm');
      ctx.buttons[0]?.opts.onTap();
      run(game, ctx, 900, () => ctx.done || game.peek().state !== 'eat');
    }
    expect(ctx.finished.text).toBe(food.nb(t('mg_tooMuch', { name: 'Pomme' })));
  });
});

// ---------------------------------------------------------------- dessin

/** Faux contexte 2D : accepte tout, et note les nombres non finis passés au dessin. */
function fakeCanvas() {
  const bad = [];
  const state = {};
  const grad = { addColorStop() {} };
  const g = new Proxy(state, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient' || prop === 'createPattern') return () => grad;
      if (prop === 'measureText') return (s) => ({ width: String(s).length * 8 });
      if (prop === 'getTransform') return () => ({ a: 1, d: 1 });
      return (...args) => {
        for (const v of args) if (typeof v === 'number' && !Number.isFinite(v)) bad.push(`${String(prop)}(${args.join(', ')})`);
      };
    },
    set(target, prop, v) { target[prop] = v; return true; },
  });
  return { g, bad };
}

describe('dessin : aucun jeu ne plante ni ne dessine avec NaN (début, en cours, fin)', () => {
  const GAMES = [
    ['feed', 'dog'], ['feed', 'horse'], ['water', 'cat'], ['water', 'cow'], ['treat', 'rabbit'], ['treat', 'horse'],
    ['pet', 'cat'], ['pet', 'horse'], ['play', 'dog'], ['play', 'goat'], ['play', 'cat'], ['milk', 'cow'], ['milk', 'goat'],
  ];
  const MAKE = { feed: (c) => food.feedGame(c), water: (c) => food.waterGame(c), treat: (c) => food.treatGame(c), pet: (c) => fun.petGame(c), play: (c) => fun.playGame(c), milk: (c) => fun.milkGame(c) };

  it('chaque image dessinée sans erreur ni NaN, pendant 6 s de jeu animé', () => {
    for (const [action, sp] of GAMES) {
      const ctx = fakeCtx(animal(sp));
      const game = MAKE[action](ctx);
      const { g, bad } = fakeCanvas();
      for (let i = 0; i < 180; i++) {
        ctx.time += 1 / 30;
        // un doigt qui bouge (verse, caresse, lance, fait danser la plume, trait)
        if (i === 5) { game.down?.({ x: 260, y: 220 }); ctx.pointer = { ...ctx.pointer, x: 260, y: 220, down: true, over: true }; }
        if (i > 5 && i < 120) game.move?.({ x: 200 + Math.sin(i / 5) * 60, y: 200 + Math.cos(i / 7) * 30 }, true);
        if (i === 60) { game.up?.({ x: 200, y: 200 }); ctx.pointer.down = false; }
        if (i % 20 === 0) ctx.buttons[0]?.opts.onTap?.();
        if (i === 150) pressStop(ctx);
        game.update(1 / 30);
        expect(() => game.draw(g), `${action} ${sp} image ${i}`).not.toThrow();
      }
      expect(bad, `${action} ${sp}`).toEqual([]);
    }
  });
});

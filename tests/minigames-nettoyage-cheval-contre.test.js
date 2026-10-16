// Contre-vérification du groupe nettoyage-cheval (nettoyer, longe, liberté) : les cas limites de
// la règle « juste ce qu'il faut », que les premiers tests ne jouaient pas.
//
// - pile au bord de la zone (dedans) → plein score ; un tout petit peu dehors → presque plein
//   score mais moins (des deux côtés, de la même façon) ; très loin → le plancher, jamais 0 ;
// - s'arrêter tout de suite → le plancher ; ne jamais s'arrêter → le jeu finit tout seul (trop)
//   ou attend sans planter ;
// - une fois fini, rien ne change plus (deuxième « C'est bon ! », touches, toucher) ;
// - la consigne dit où l'on en est (dans le vert : bon ; au-delà : prévient).
//
// Sans DOM : un faux ctx remplace le cadre (src/ui/minigames.js).

import { describe, it, expect, beforeAll } from 'vitest';
import { justRight, verdict, JUST_FLOOR } from '../src/ui/minigames/score.js';
import { makeRng } from '../src/ui/minigames/draw.js';

let t;
let clean;
let horse;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  clean = await import('../src/ui/minigames/clean.js');
  horse = await import('../src/ui/minigames/horse.js');
});

const W = 400;
const H = 360;
const stars = (q) => (q >= 0.85 ? 3 : q >= 0.6 ? 2 : 1); // comme la carte de fin du cadre

/** Le cadre, en faux : mêmes méthodes que le ctx de minigames.js (arrondi de la note compris). */
function fakeCtx(a = null, o = {}) {
  const noop = () => {};
  const row = { style: {} };
  const ctx = {
    a,
    sp: a ? { emoji: '🐾' } : null,
    action: 'test',
    chore: null,
    W,
    H,
    view: { x0: 0, y0: 0, x1: W, y1: H, w: W, h: H, scale: 1, ox: 0, oy: 0 },
    col: null,
    fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop, update: noop, draw: noop },
    rng: makeRng(o.seed ?? 11),
    time: 0,
    done: false,
    pointer: { x: 0, y: 0, down: false, over: false, type: 'touch' },
    t,
    name: a?.name ?? '',
    hints: [],
    zones: [],
    buttons: [],
    prog: 0,
    finishes: 0,
    finished: null,
    hint(text, kind = '') { this.hints.push({ text, kind }); },
    progress(v) { this.prog = v; },
    button(text, opts = {}) {
      const b = { text, opts, disabled: false, style: {}, parentElement: row };
      this.buttons.push(b);
      return b;
    },
    clearButtons() { this.buttons = []; },
    finish(q, msg) {
      this.finishes++;
      if (this.done) return;
      this.done = true;
      const qq = Math.round(Math.max(0.4, Math.min(1, q)) * 100) / 100;
      this.finished = { q: qq, msg, stars: stars(qq) };
      // Comme le cadre : une fois fini, les boutons ne répondent plus.
      for (const b of this.buttons) b.disabled = true;
    },
    zone(lo, hi) { this.zones.push({ lo, hi }); return { lo, hi }; },
    finishJust(value, lo, hi, opts = {}) {
      const q = justRight(value, lo, hi, { floor: opts.floor, slack: opts.slack });
      const v = verdict(value, lo, hi);
      const name = typeof opts.who === 'string' ? opts.who : opts.who?.name ?? this.name;
      const key = v === 'just' ? 'justRight' : v === 'low' ? 'tooLittle' : 'tooMuch';
      const msg = opts.msgs?.[v] ?? (name ? t(`mg_${key}`, { name }) : t(`mg_chore_${key}`));
      const wasDone = this.done;
      this.finish(q, msg);
      if (!wasDone) Object.assign(this.finished, { verdict: v, value });
      return { q, verdict: v };
    },
    stopButton(onStop, label = t('mg_stopHere')) { return this.button(`✅ ${label}`, { cls: 'stop primary', onTap: onStop }); },
  };
  return ctx;
}

const stopOf = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop'));
/** Appuie sur « C'est bon ! » comme le cadre : un bouton désactivé ne fait rien. */
const press = (ctx) => { const b = stopOf(ctx); if (b && !b.disabled) b.opts.onTap(); };
const endMsg = (v, name) => t(`mg_${v === 'just' ? 'justRight' : v === 'low' ? 'tooLittle' : 'tooMuch'}`, { name });

function expectEnd(ctx, v, name) {
  expect(ctx.done).toBe(true);
  expect(ctx.finished.verdict, `valeur ${ctx.finished.value}`).toBe(v);
  expect(ctx.finished.msg).toBe(endMsg(v, name));
  if (v === 'just') expect(ctx.finished.q).toBe(1);
  else {
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
  }
}

// ------------------------------------------------------------------ nettoyer (soin)

const ANIMALS = {
  horse: { id: 'h1', name: 'Pomme', species: 'horse', personality: 'calm', look: { seed: 3 } },
  cow: { id: 'c1', name: 'Marguerite', species: 'cow', look: { seed: 4 } },
  rabbit: { id: 'r1', name: 'Noisette', species: 'rabbit', look: { seed: 5 } },
  cat: { id: 'k1', name: 'Minou', species: 'cat', look: { seed: 6 } },
};

function pickAll(game, ctx) {
  for (let i = 0; i < 20 && !ctx.done; i++) {
    const it = game.peek().items.find((x) => !x.good);
    if (!it) break;
    game.down({ x: it.x, y: it.y, type: 'touch' });
    game.up({ x: it.x, y: it.y, type: 'touch' });
    for (let k = 0; k < 30; k++) game.update(1 / 30);
  }
}

/** Centres des cases du sol (36 px), comme dans clean.js. */
function cellsOf(floor) {
  const out = [];
  for (let y = floor.y + 18; y < floor.y + floor.h; y += 36) for (let x = floor.x + 18; x < floor.x + floor.w; x += 36) out.push({ x, y });
  return out;
}
/** Une toute petite brassée sur une seule case : exactement une couche sur cette case. */
function dab(game, c) {
  game.down({ x: c.x, y: c.y, type: 'touch' });
  game.move({ x: c.x + 2, y: c.y, type: 'touch' }, true);
  game.move({ x: c.x + 3, y: c.y + 1, type: 'touch' }, true);
  game.up({ x: c.x + 3, y: c.y + 1, type: 'touch' });
}
/** Pose k couches, case après case (on recommence au début pour faire des tas). */
function dabs(game, ctx, k) {
  const cells = cellsOf(game.peek().floor);
  for (let i = 0; i < k && !ctx.done; i++) dab(game, cells[i % cells.length]);
}

describe.each(Object.keys(ANIMALS))('nettoyer (%s) : les bords de la zone, au doigt près', (species) => {
  const a = ANIMALS[species];
  const Z = () => clean.SPREAD_ZONE;
  const ready = () => {
    const ctx = fakeCtx(a);
    const game = clean.cleanGame(ctx);
    pickAll(game, ctx);
    expect(game.peek().phase).toBe('spread');
    return { ctx, game };
  };
  /** Nombre de cases du sol : une petite brassée = 1 / N couche en moyenne. */
  const nCells = () => {
    const { game, ctx } = ready();
    dabs(game, ctx, 1);
    return Math.round(1 / game.peek().value);
  };

  it('une petite brassée pose exactement une couche sur une case (le sol compte bien chaque case)', () => {
    const N = nCells();
    expect(N).toBe(cellsOf(ready().game.peek().floor).length);
  });

  it('pile au bord bas de la zone : plein score ; une case de moins : un peu moins (trop peu)', () => {
    const N = nCells();
    const kLo = Math.ceil(Z().lo * N - 1e-9);
    let { ctx, game } = ready();
    dabs(game, ctx, kLo);
    expect(game.peek().value).toBeGreaterThanOrEqual(Z().lo);
    press(ctx);
    expectEnd(ctx, 'just', a.name);
    expect(ctx.finished.stars).toBe(3);

    ({ ctx, game } = ready());
    dabs(game, ctx, kLo - 1);
    press(ctx);
    expectEnd(ctx, 'low', a.name);
    expect(ctx.finished.q).toBeGreaterThan(0.9); // presque : la pente est douce
    expect(ctx.finished.stars).toBe(3);
  });

  it('pile au bord haut de la zone : plein score ; une case de plus : un peu moins (trop)', () => {
    const N = nCells();
    const kHi = Math.floor(Z().hi * N + 1e-9);
    let { ctx, game } = ready();
    dabs(game, ctx, kHi);
    expect(game.peek().value).toBeLessThanOrEqual(Z().hi);
    expect(ctx.done).toBe(false);
    press(ctx);
    expectEnd(ctx, 'just', a.name);

    ({ ctx, game } = ready());
    dabs(game, ctx, kHi + 1);
    expect(ctx.done).toBe(false);
    press(ctx);
    expectEnd(ctx, 'high', a.name);
    expect(ctx.finished.q).toBeGreaterThan(0.9);
  });

  it('un peu trop peu et un peu trop, à la même distance de la zone : la même note', () => {
    const N = nCells();
    const d = 6; // cases
    const kLo = Math.ceil(Z().lo * N - 1e-9);
    const kHi = Math.floor(Z().hi * N + 1e-9);
    let { ctx, game } = ready();
    dabs(game, ctx, kLo - d);
    const vLow = game.peek().value;
    press(ctx);
    const qLow = ctx.finished.q;
    ({ ctx, game } = ready());
    dabs(game, ctx, kHi + d);
    const vHigh = game.peek().value;
    press(ctx);
    const qHigh = ctx.finished.q;
    expect(qLow).toBeLessThan(1);
    expect(qHigh).toBeLessThan(1);
    // même écart à la zone → même note (à l'arrondi près des cases)
    expect(Math.abs((Z().lo - vLow) - (vHigh - Z().hi))).toBeLessThan(2 / N);
    expect(Math.abs(qLow - qHigh)).toBeLessThanOrEqual(0.04);
  });

  it('très loin : rien étalé → le plancher ; des tas partout → fin toute seule, au plancher ou presque', () => {
    let { ctx, game } = ready();
    press(ctx);
    expectEnd(ctx, 'low', a.name);
    expect(ctx.finished.q).toBe(JUST_FLOOR);

    ({ ctx, game } = ready());
    const N = cellsOf(game.peek().floor).length;
    dabs(game, ctx, N * 3);
    expectEnd(ctx, 'high', a.name);
    expect(ctx.finished.value).toBeGreaterThanOrEqual(Z().max);
    expect(ctx.finished.q).toBeLessThan(0.6);
  });

  it('ne jamais s\'arrêter sans rien faire : le jeu attend (pas de fin, pas d\'erreur), le bouton reste là', () => {
    const { ctx, game } = ready();
    for (let i = 0; i < 30 * 60; i++) game.update(1 / 30);
    expect(ctx.done).toBe(false);
    expect(stopOf(ctx).disabled).toBe(false);
  });

  it('une fois fini, plus rien ne change : 2e « C\'est bon ! », autres brassées', () => {
    const { ctx, game } = ready();
    dabs(game, ctx, Math.ceil(Z().lo * cellsOf(game.peek().floor).length));
    stopOf(ctx).opts.onTap();
    const first = { ...ctx.finished };
    stopOf(ctx).opts.onTap(); // même si le bouton était encore actif
    dabs(game, ctx, 40);
    expect(ctx.finished).toEqual(first);
    expect(ctx.finishes).toBe(1);
  });

  it('la consigne : dans le vert, « bon » ; au-delà, elle prévient (orange), jamais une clé brute', () => {
    const { ctx, game } = ready();
    const N = cellsOf(game.peek().floor).length;
    dabs(game, ctx, Math.ceil(Z().lo * N));
    expect(ctx.hints.at(-1).kind).toBe('good');
    dabs(game, ctx, Math.ceil((Z().hi - Z().lo) * N) + 2);
    expect(ctx.hints.at(-1).kind).toBe('warn');
    for (const h of ctx.hints) expect(h.text).not.toMatch(/^mg_/);
  });
});

// ------------------------------------------------------------------ longe

/** Tient l'allure demandée (touches ↑ / ↓) jusqu'à ce que cond(peek) soit vraie. */
function lungeUntil(game, ctx, cond, maxSteps = 9000, dt = 1 / 60) {
  for (let i = 0; i < maxSteps && !ctx.done; i++) {
    const p = game.peek();
    if (cond(p)) return p;
    const [lo, hi] = p.gaits[p.gait];
    if (p.v < (lo + hi) / 2 - 6) game.key('ArrowUp', true);
    else if (p.v > (lo + hi) / 2 + 6) game.key('ArrowDown', true);
    ctx.time += dt;
    game.update(dt);
  }
  return game.peek();
}

describe('longe : les bords de la zone', () => {
  const a = ANIMALS.horse;
  const start = (seed) => { const ctx = fakeCtx(a, { seed }); const game = horse.lungeGame(ctx); return { ctx, game }; };

  it('pile à l\'entrée du vert : plein score ; juste avant : un peu moins (trop peu)', () => {
    let { ctx, game } = start();
    const { lo } = game.peek();
    lungeUntil(game, ctx, (q) => q.value >= lo);
    expect(game.peek().value - lo).toBeLessThan(0.05);
    press(ctx);
    expectEnd(ctx, 'just', a.name);

    ({ ctx, game } = start());
    lungeUntil(game, ctx, (q) => q.value >= lo - 0.3);
    press(ctx);
    expectEnd(ctx, 'low', a.name);
    expect(ctx.finished.q).toBeGreaterThan(0.9);
  });

  it('juste avant la sortie du vert : plein score ; juste après : un peu moins (trop)', () => {
    let { ctx, game } = start();
    const { hi } = game.peek();
    lungeUntil(game, ctx, (q) => q.value >= hi - 0.05);
    press(ctx);
    expectEnd(ctx, 'just', a.name);

    ({ ctx, game } = start());
    lungeUntil(game, ctx, (q) => q.value >= hi + 0.3);
    press(ctx);
    expectEnd(ctx, 'high', a.name);
    expect(ctx.finished.q).toBeGreaterThan(0.9);
  });

  it('même écart sous et au-dessus du vert : même note', () => {
    let { ctx, game } = start();
    const { lo, hi } = game.peek();
    lungeUntil(game, ctx, (q) => q.value >= lo - 2);
    const vl = game.peek().value;
    press(ctx);
    const ql = ctx.finished.q;
    ({ ctx, game } = start());
    lungeUntil(game, ctx, (q) => q.value >= hi + 2 - (vl - (lo - 2)));
    press(ctx);
    expect(ctx.finished.verdict).toBe('high');
    expect(Math.abs(ql - ctx.finished.q)).toBeLessThanOrEqual(0.02);
  });

  it('ne jamais s\'arrêter (même sans rien toucher) : le cheval finit par s\'arrêter tout seul (trop)', () => {
    for (const seed of [1, 2, 3]) {
      const { ctx, game } = start(seed);
      // Sans rien toucher : le cheval change d'allure tout seul, le travail monte quand même.
      for (let i = 0; i < 60 * 60 * 10 && !ctx.done; i++) game.update(1 / 60);
      if (!ctx.done) lungeUntil(game, ctx, () => false, 60 * 60 * 5);
      expectEnd(ctx, 'high', a.name);
      expect(ctx.finished.q).toBe(JUST_FLOOR);
    }
  });

  it('une fois fini, plus rien ne change (2e « C\'est bon ! », Entrée, Allez !)', () => {
    const { ctx, game } = start();
    const { lo, hi } = game.peek();
    lungeUntil(game, ctx, (q) => q.value >= (lo + hi) / 2);
    press(ctx);
    const first = { ...ctx.finished };
    stopOf(ctx).opts.onTap();
    game.key('Enter', true);
    ctx.buttons[1].opts.onTap();
    for (let i = 0; i < 600; i++) game.update(1 / 60);
    expect(ctx.finished).toEqual(first);
    expect(game.peek().value).toBeCloseTo(first.value, 9); // le travail ne compte plus
  });

  it('Entrée termine comme « C\'est bon ! »', () => {
    const { ctx, game } = start();
    const { lo, hi } = game.peek();
    lungeUntil(game, ctx, (q) => q.value >= (lo + hi) / 2);
    game.key('Enter', true);
    expectEnd(ctx, 'just', a.name);
  });
});

// ------------------------------------------------------------------ liberté

const C = { x: 200, y: 158 };
function followUntil(game, ctx, cond, { phi = 0.5, rho = 85 } = {}, maxSteps = 9000, dt = 1 / 60) {
  for (let i = 0; i < maxSteps && !ctx.done; i++) {
    const p = game.peek();
    if (cond(p)) return p;
    const ang = p.theta - phi * p.dirSign;
    game.move({ x: C.x + Math.cos(ang) * rho, y: C.y + Math.sin(ang) * rho, type: 'touch' }, true);
    ctx.time += dt;
    game.update(dt);
  }
  return game.peek();
}
const finishJoin = (game, ctx) => { for (let i = 0; i < 600 && !ctx.done; i++) game.update(1 / 60); };

describe('liberté : les bords de la zone', () => {
  const a = ANIMALS.horse;
  const start = () => { const ctx = fakeCtx(a); const game = horse.libertyGame(ctx); return { ctx, game }; };

  it('pile à l\'entrée du vert : plein score ; juste avant : un peu moins (trop peu)', () => {
    let { ctx, game } = start();
    const { lo } = game.peek();
    followUntil(game, ctx, (q) => q.value >= lo);
    expect(game.peek().value - lo).toBeLessThan(0.05);
    press(ctx);
    finishJoin(game, ctx);
    expectEnd(ctx, 'just', a.name);

    ({ ctx, game } = start());
    followUntil(game, ctx, (q) => q.value >= lo - 0.2);
    press(ctx);
    finishJoin(game, ctx);
    expectEnd(ctx, 'low', a.name);
    expect(ctx.finished.q).toBeGreaterThan(0.9);
  });

  it('juste avant la sortie du vert : plein score ; juste après : un peu moins (trop)', () => {
    let { ctx, game } = start();
    const { hi } = game.peek();
    followUntil(game, ctx, (q) => q.value >= hi - 0.05);
    press(ctx);
    finishJoin(game, ctx);
    expectEnd(ctx, 'just', a.name);

    ({ ctx, game } = start());
    followUntil(game, ctx, (q) => q.value >= hi + 0.2);
    press(ctx);
    finishJoin(game, ctx);
    expectEnd(ctx, 'high', a.name);
    expect(ctx.finished.q).toBeGreaterThan(0.9);
  });

  it('pendant que le cheval vient vers toi, la pression ne compte plus (la note est celle de l\'appel)', () => {
    const { ctx, game } = start();
    const { lo, hi } = game.peek();
    followUntil(game, ctx, (q) => q.value >= hi - 0.3);
    const at = game.peek().value;
    press(ctx);
    // On continue de « pousser » pendant qu'il vient : rien ne change.
    for (let i = 0; i < 600 && !ctx.done; i++) {
      game.move({ x: C.x + 80, y: C.y, type: 'touch' }, true);
      game.down({ x: C.x - 80, y: C.y, type: 'touch' });
      game.update(1 / 60);
    }
    expect(ctx.finished.value).toBeCloseTo(at, 9);
    expect(ctx.finished.value).toBeGreaterThanOrEqual(lo);
    expectEnd(ctx, 'just', a.name);
  });

  it('ne jamais le pousser : rien ne se passe (pas de fin, pas d\'erreur) ; « C\'est bon ! » donne alors le plancher', () => {
    const { ctx, game } = start();
    for (let i = 0; i < 60 * 60; i++) game.update(1 / 60);
    expect(ctx.done).toBe(false);
    expect(game.peek().value).toBe(0);
    press(ctx);
    finishJoin(game, ctx);
    expectEnd(ctx, 'low', a.name);
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('le pousser sans jamais l\'appeler : épuisé, il vient tout seul (trop), au plancher', () => {
    const { ctx, game } = start();
    followUntil(game, ctx, (q) => q.phase !== 'drive');
    finishJoin(game, ctx);
    expectEnd(ctx, 'high', a.name);
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('une fois fini, plus rien ne change (2e « C\'est bon ! », Entrée, toucher)', () => {
    const { ctx, game } = start();
    const { lo, hi } = game.peek();
    followUntil(game, ctx, (q) => q.value >= (lo + hi) / 2);
    press(ctx);
    finishJoin(game, ctx);
    const first = { ...ctx.finished };
    stopOf(ctx).opts.onTap();
    game.key('Enter', true);
    const hp = game.peek().horse;
    game.down({ x: hp.x, y: hp.y, type: 'touch' });
    for (let i = 0; i < 300; i++) game.update(1 / 60);
    expect(ctx.finished).toEqual(first);
    expect(ctx.finishes).toBe(1);
  });
});

// ------------------------------------------------------------------ corrections de la contre-vérification

describe('nettoyer : attraper les saletés au doigt', () => {
  it('un toucher un peu à côté (jusqu\'à PICK_RADIUS) attrape la saleté la plus proche, partout sur le sol', () => {
    expect(clean.PICK_RADIUS).toBeGreaterThanOrEqual(52);
    for (const species of Object.keys(ANIMALS)) {
      const ctx = fakeCtx(ANIMALS[species]);
      const game = clean.cleanGame(ctx);
      const n = game.peek().items.length;
      // Sur un téléphone, le cadre lisait chaque toucher environ 11 % trop à droite et trop bas
      // (voir sharedChangesNeeded) : on touche chaque saleté comme ce cadre la lirait.
      for (let i = 0; i < n; i++) {
        const it = game.peek().items[0];
        const p = { x: it.x * 1.11, y: it.y * 1.11, type: 'touch' };
        game.down(p);
        game.up(p);
        for (let k = 0; k < 30; k++) game.update(1 / 30);
      }
      expect(game.peek().items.length, species).toBe(0);
      expect(game.peek().phase, species).toBe('spread');
    }
  });

  it('entre deux saletés, c\'est la plus proche qui vient (une seule à la fois)', () => {
    const ctx = fakeCtx(ANIMALS.horse);
    const game = clean.cleanGame(ctx);
    const [a, b] = game.peek().items;
    const p = { x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3, type: 'touch' };
    game.down(p);
    game.up(p);
    for (let k = 0; k < 30; k++) game.update(1 / 30);
    const left = game.peek().items;
    expect(left.length).toBe(game.peek().nDirt - 1);
    expect(left.some((x) => x.x === b.x && x.y === b.y)).toBe(true);
  });

  it('avec de la paille propre à laisser (corvée), on reste strict : un toucher à 50 px n\'attrape rien', () => {
    expect(clean.PICK_RADIUS_STRICT).toBeLessThan(50);
    const ctx = fakeCtx();
    const game = clean.cleanGame(ctx, { species: 'horse', n: 8, decoys: 3, spread: false });
    const { items } = game.peek();
    const tuft = items.find((x) => x.good);
    // un point à 50 px de la touffe, plus loin encore de tout le reste
    let p = null;
    for (let a = 0; a < Math.PI * 2 && !p; a += 0.1) {
      const q = { x: tuft.x + Math.cos(a) * 50, y: tuft.y + Math.sin(a) * 50 };
      if (items.every((it) => it === tuft || Math.hypot(it.x - q.x, it.y - q.y) > 50)) p = q;
    }
    expect(p).toBeTruthy();
    game.down({ ...p, type: 'touch' });
    game.up({ ...p, type: 'touch' });
    for (let k = 0; k < 30; k++) game.update(1 / 30);
    expect(game.peek().items.length).toBe(items.length);
    expect(game.peek().inBin).toBe(0);
  });

  it('un toucher loin de toute saleté ne ramasse rien', () => {
    const ctx = fakeCtx(ANIMALS.horse);
    const game = clean.cleanGame(ctx);
    const { items } = game.peek();
    // un point du sol à plus de PICK_RADIUS de toutes les saletés
    let far = null;
    for (const c of cellsOf(game.peek().floor)) if (items.every((it) => Math.hypot(it.x - c.x, it.y - c.y) > clean.PICK_RADIUS + 2)) { far = c; break; }
    expect(far).toBeTruthy();
    game.down({ ...far, type: 'touch' });
    game.up({ ...far, type: 'touch' });
    for (let k = 0; k < 30; k++) game.update(1 / 30);
    expect(game.peek().items.length).toBe(items.length);
  });
});

describe('nettoyer : clavier et décor', () => {
  it('Entrée fait comme « C\'est bon ! » à l\'étape « étaler » (et rien pendant le ramassage)', () => {
    const ctx = fakeCtx(ANIMALS.horse);
    const game = clean.cleanGame(ctx);
    game.key('Enter', true);
    expect(ctx.done).toBe(false);
    pickAll(game, ctx);
    dabs(game, ctx, Math.ceil(clean.SPREAD_ZONE.lo * cellsOf(game.peek().floor).length));
    game.key('Enter', false); // relâcher ne fait rien
    expect(ctx.done).toBe(false);
    game.key('NumpadEnter', true);
    expectEnd(ctx, 'just', ANIMALS.horse.name);
  });

  it('chat : le sac ne cache plus le bord du bac à litière', () => {
    const ctx = fakeCtx(ANIMALS.cat);
    const game = clean.cleanGame(ctx);
    const p = game.peek();
    const rim = p.floor.x + p.floor.w + 16; // bord bleu du bac (dessiné à floor ± 16)
    expect(rim).toBeLessThanOrEqual(p.bin.left);
    expect(p.bin.right).toBeLessThanOrEqual(W);
  });
});

describe('longe : lisible et sans fin par erreur', () => {
  it('les noms des allures font au moins 14 px du cadre (≈ 12 px à l\'écran en 360 px) et tiennent dans la jauge', () => {
    expect(horse.GAIT_LABEL_SIZE).toBeGreaterThanOrEqual(14);
    const G = horse.GAIT_GAUGE;
    expect(G.y0 + 18 + horse.GAIT_LABEL_SIZE / 2).toBeLessThanOrEqual(G.bottom);
    expect(G.y0 + 18 - horse.GAIT_LABEL_SIZE / 2).toBeGreaterThan(G.y0 + 8); // sous la barre des allures
  });

  it('« C\'est bon ! » un peu à l\'écart d\'« Allez ! » : dessous en portrait, à côté en paysage', () => {
    const saved = globalThis.matchMedia;
    try {
      for (const portrait of [true, false]) {
        const mq = { matches: portrait, addEventListener() {}, removeEventListener() {} };
        globalThis.matchMedia = () => mq;
        const ctx = fakeCtx(ANIMALS.horse);
        horse.lungeGame(ctx);
        const b = stopOf(ctx);
        expect(b.style.marginTop).toBe(portrait ? `${horse.STOP_GAP}px` : '');
        expect(b.style.marginLeft).toBe(portrait ? '' : `${horse.STOP_GAP}px`);
      }
    } finally {
      globalThis.matchMedia = saved;
    }
  });
});

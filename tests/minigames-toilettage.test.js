// Règle « juste ce qu'il faut » dans les mini-jeux de toilette (src/ui/minigames/grooming.js) :
// brosser, laver, griffes / onglons, ferrer, tondre. Pour chaque jeu : la zone verte est montrée
// dès le début, peek() expose { value, lo, hi }, le bouton « ✅ C'est bon ! » termine les jeux où
// l'enfant décide quand s'arrêter, et la note suit la règle (juste = 1 ; trop peu OU trop = moins,
// des deux côtés, plancher à 0,4 ; le message dit pourquoi).
// Sans DOM ni canvas : un faux ctx remplace le cadre (src/ui/minigames.js), et un faux contexte 2D
// permet de vérifier que draw() ne plante pas.

import { describe, it, expect, beforeAll } from 'vitest';
import { justRight, verdict, JUST_FLOOR } from '../src/ui/minigames/score.js';
import { makeRng, coatColors } from '../src/ui/minigames/draw.js';
import { createAnimal } from '../src/sim/animal.js';

let t;
let G;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  G = await import('../src/ui/minigames/grooming.js');
});

/** Un animal reproductible (robe, nom, caractère fixés). */
const animal = (species, o = {}) => createAnimal({ species, name: 'Pomme', personality: 'calm', ageDays: 900, colorIndex: 0, rng: makeRng(5), ...o });

/** Le cadre, en faux : mêmes méthodes que le ctx de minigames.js, sans DOM. */
function fakeCtx(a) {
  const noop = () => {};
  const ctx = {
    a,
    sp: { emoji: '🐾' },
    action: 'test',
    chore: null,
    W: 400,
    H: 360,
    view: { x0: 0, y0: -15, x1: 400, y1: 375, w: 400, h: 390, scale: 0.8, ox: 0, oy: 12 },
    col: coatColors(a),
    fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop, update: noop, draw: noop },
    rng: makeRng(7),
    time: 0,
    done: false,
    pointer: { x: 200, y: 180, down: false, over: false, type: 'touch' },
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
      this.finished = { ...this.finished, q: Math.round(Math.max(0.4, Math.min(1, q)) * 100) / 100, msg };
    },
    zone(lo, hi) { this.zones.push({ lo, hi }); return lo === null ? null : { lo, hi }; },
    finishJust(value, lo, hi, o = {}) {
      const q = justRight(value, lo, hi, { floor: o.floor, slack: o.slack });
      const v = verdict(value, lo, hi);
      const key = v === 'just' ? 'justRight' : v === 'low' ? 'tooLittle' : 'tooMuch';
      const name = typeof o.who === 'string' ? o.who : o.who?.name ?? this.name;
      this.finished = { verdict: v, value };
      this.finish(q, o.msgs?.[v] ?? t(`mg_${key}`, { name }));
      return { q, verdict: v };
    },
    stopButton(onStop, label = t('mg_stopHere')) { return this.button(`✅ ${label}`, { cls: 'stop primary', onTap: onStop }); },
  };
  return ctx;
}

/** Faux contexte 2D : toutes les méthodes existent et ne font rien. */
function fakeG() {
  const props = {};
  return new Proxy(props, {
    get(_, k) {
      if (k in props) return props[k];
      if (k === 'measureText') return () => ({ width: 10 });
      if (/^create.*(Gradient|Pattern)$/.test(String(k))) return () => ({ addColorStop() {} });
      return () => {};
    },
    set(_, k, v) { props[k] = v; return true; },
  });
}

const stopOf = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop'));
const press = (ctx) => stopOf(ctx).opts.onTap();
const tapBtn = (ctx, re) => ctx.buttons.find((b) => re.test(b.text)).opts.onTap();

/** Un trait du doigt (appuyé) de (x0, y0) à (x1, y1), par pas d'environ `step` px. */
function stroke(game, ctx, x0, y0, x1, y1, step = 10) {
  const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
  ctx.pointer = { ...ctx.pointer, x: x0, y: y0, down: true, over: true };
  game.down?.({ x: x0, y: y0, type: 'touch' });
  for (let i = 1; i <= n; i++) {
    const p = { x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, type: 'touch' };
    ctx.pointer = { ...ctx.pointer, ...p };
    game.move?.(p, true);
  }
  ctx.pointer = { ...ctx.pointer, down: false };
  game.up?.({ x: x1, y: y1, type: 'touch' });
}

/** La zone affichée dès le début doit être celle de peek(), ramenée sur la jauge (0–1). */
function expectZoneShown(ctx, p, scale = (v) => v / p.max) {
  expect(ctx.zones.length).toBeGreaterThan(0);
  const z = ctx.zones[0];
  expect(z.lo).toBeCloseTo(scale(p.lo), 6);
  expect(z.hi).toBeCloseTo(scale(p.hi), 6);
  expect(z.lo).toBeLessThan(z.hi);
  expect(z.lo).toBeGreaterThan(0);
  expect(z.hi).toBeLessThan(1);
}

/** Note « juste » / « trop peu » / « trop » : vérifie q, le verdict et le message. */
function expectVerdict(ctx, expected, name = 'Pomme') {
  expect(ctx.done).toBe(true);
  expect(ctx.finished.verdict, `valeur ${ctx.finished.value}`).toBe(expected);
  if (expected === 'just') expect(ctx.finished.q).toBe(1);
  else {
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
  }
  expect(ctx.finished.msg).toBeTruthy();
  if (expected === 'just') expect(ctx.finished.msg).toBe(t('mg_justRight', { name }));
  if (expected === 'low') expect(ctx.finished.msg).toBe(t('mg_tooLittle', { name }));
}

/** Avance le temps du jeu (update + horloge du cadre). */
function tick(game, ctx, sec, dt = 1 / 30) {
  for (let s = 0; s < sec && !ctx.done; s += dt) {
    ctx.time += dt;
    game.update?.(dt);
  }
}

const SPECIES_BRUSH = ['horse', 'dog', 'cat', 'rabbit', 'sheep', 'goat', 'cow'];

// ---------------------------------------------------------------- brosser

describe('brosser : enlever la poussière, puis s\'arrêter (✅) avant d\'irriter la peau', () => {
  /** Frotte chaque tache dans le sens du poil (vers la gauche) jusqu'à ce que tout soit propre. */
  function brushClean(game, ctx, maxPatches = Infinity) {
    let n = 0;
    for (let k = 0; k < 40 && !ctx.done; k++) {
      const left = game.peek().patches;
      if (!left.length || n >= maxPatches) break;
      const q = left[0];
      const before = left.length;
      for (let r = 0; r < 12 && game.peek().patches.length === before; r++) stroke(game, ctx, q.x + 34, q.y + ((r % 3) - 1) * 6, q.x - 34, q.y + ((r % 3) - 1) * 6, 6);
      n++;
    }
  }
  /** Frotte le poil déjà propre (au milieu du corps) jusqu'à cond(peek). */
  function brushOver(game, ctx, cond) {
    const p = game.peek();
    for (let k = 0; k < 400 && !ctx.done && !cond(game.peek()); k++) stroke(game, ctx, p.body.x + p.body.rx * 0.5, p.body.y, p.body.x - p.body.rx * 0.5, p.body.y, 6);
  }

  it('zone verte dès le début, bouton C\'est bon, value / lo / hi', () => {
    for (const sp of SPECIES_BRUSH) {
      const ctx = fakeCtx(animal(sp));
      const game = G.brushGame(ctx);
      const p = game.peek();
      expect(p.value).toBe(0);
      expect(p.lo).toBeLessThan(p.hi);
      // 7 taches pour tout le monde (avant : 4 seulement pour le chien, et en laisser une
      // suffisait à sortir de la zone)
      expect(p.patches.length, sp).toBeGreaterThanOrEqual(7);
      expectZoneShown(ctx, p);
      expect(stopOf(ctx), sp).toBeTruthy();
      game.draw(fakeG());
    }
  });

  it('tout propre puis ✅ : tous les points ; trop tôt : moins ; trop longtemps : moins', () => {
    for (const sp of ['horse', 'dog', 'rabbit']) {
      // Juste
      let ctx = fakeCtx(animal(sp));
      let game = G.brushGame(ctx);
      brushClean(game, ctx);
      expect(game.peek().clean, sp).toBeGreaterThanOrEqual(0.999);
      expect(game.peek().value).toBeGreaterThanOrEqual(game.peek().lo);
      expect(game.peek().value).toBeLessThanOrEqual(game.peek().hi);
      // Le jeu attend le ✅ : il ne finit pas tout seul quand c'est propre.
      expect(ctx.done).toBe(false);
      game.draw(fakeG());
      press(ctx);
      expectVerdict(ctx, 'just');

      // Trop peu : deux taches seulement
      ctx = fakeCtx(animal(sp));
      game = G.brushGame(ctx);
      brushClean(game, ctx, 2);
      press(ctx);
      expectVerdict(ctx, 'low');

      // Trop : on continue de frotter le poil propre (la peau rougit)
      ctx = fakeCtx(animal(sp));
      game = G.brushGame(ctx);
      brushClean(game, ctx);
      brushOver(game, ctx, (q) => q.value > q.hi + 0.1);
      expect(ctx.done).toBe(false);
      game.draw(fakeG());
      press(ctx);
      expectVerdict(ctx, 'high');
      expect(ctx.finished.msg).toBe(t('mg_tooMuch', { name: 'Pomme' }));
    }
  });

  it('beaucoup trop frotté : le jeu s\'arrête tout seul, au plancher', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.brushGame(ctx);
    brushClean(game, ctx);
    brushOver(game, ctx, () => false);
    expectVerdict(ctx, 'high');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('le trait qui enlève la dernière tache ne compte pas en trop ; un trait de plus reste juste', () => {
    for (const sp of ['dog', 'cat', 'rabbit', 'horse']) {
      const ctx = fakeCtx(animal(sp));
      const game = G.brushGame(ctx);
      // On finit chaque tache par un long trait qui continue sur le poil propre.
      for (let k = 0; k < 40 && game.peek().patches.length; k++) {
        const q = game.peek().patches[0];
        const b = game.peek().body;
        stroke(game, ctx, q.x + 34, q.y, b.x - b.rx * 0.9, q.y, 6);
      }
      expect(game.peek().clean).toBeGreaterThanOrEqual(0.999);
      // Presque rien : seulement les quelques pixels où la brosse arrive sur la dernière tache
      // (une fois dans la zone, frotter sans toucher de poussière compte dès le début du trait).
      expect(game.peek().over, sp).toBeLessThan(0.005);
      const b = game.peek().body;
      stroke(game, ctx, b.x + b.rx * 0.9, b.y, b.x - b.rx * 0.9, b.y, 6); // un trait de plus
      const p = game.peek();
      expect(p.over, sp).toBeGreaterThan(0);
      expect(p.value, sp).toBeLessThanOrEqual(p.hi);
      press(ctx);
      expectVerdict(ctx, 'just');
    }
  });

  it('un cheveu au-dessus de la zone (note arrondie à 1) : la carte dit « juste », pas « trop »', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.brushGame(ctx);
    brushClean(game, ctx);
    // On frotte par tout petits pas et on s'arrête dès que la jauge passe la zone.
    const b = game.peek().body;
    game.down({ x: b.x + b.rx * 0.5, y: b.y });
    for (let k = 1; k < 4000 && game.peek().value <= game.peek().hi; k++) {
      const tri = Math.abs(((k + 100) % 200) - 100); // aller-retour sans saut : des pas de 1,5 px
      game.move({ x: b.x + b.rx * 0.5 - tri * 1.5, y: b.y }, true);
    }
    const { value, hi, lo } = game.peek();
    expect(value).toBeGreaterThan(hi);
    expect(Math.round(justRight(value, lo, hi, { slack: 0.3 }) * 100)).toBe(100); // trois étoiles…
    press(ctx);
    expectVerdict(ctx, 'just'); // … et le message va avec
  });

  it('la note est symétrique : même écart à la zone = même note', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.brushGame(ctx);
    const { lo, hi } = game.peek();
    expect(justRight(lo - 0.1, lo, hi, { slack: 0.3 })).toBeCloseTo(justRight(hi + 0.1, lo, hi, { slack: 0.3 }), 9);
  });

  it('Espace termine comme le bouton ✅', () => {
    const ctx = fakeCtx(animal('cat'));
    const game = G.brushGame(ctx);
    brushClean(game, ctx);
    game.key('Space', true);
    expectVerdict(ctx, 'just');
  });
});

// ---------------------------------------------------------------- laver

describe('laver : de la mousse partout, ni trop ni trop peu, puis rincer', () => {
  /** Savonne le corps en rangées (pas de rangée `gap` px), `passes` fois. */
  function soapRows(game, ctx, { gap = 22, passes = 1, part = 1 } = {}) {
    const p = game.peek();
    const b = p.body;
    for (let k = 0; k < passes && !ctx.done; k++) {
      for (let y = b.y - b.ry; y <= b.y + b.ry && game.peek().phase === 'soap'; y += gap) {
        stroke(game, ctx, b.x - b.rx, y, b.x - b.rx + 2 * b.rx * part, y, 10);
      }
      if (part === 1 && game.peek().phase === 'soap') {
        // la tête et le cou
        stroke(game, ctx, p.head.x - 30, p.head.y - 10, p.head.x + 20, p.head.y - 10, 10);
        stroke(game, ctx, p.head.x - 30, p.head.y + 12, p.head.x + 20, p.head.y + 12, 10);
        stroke(game, ctx, b.x + b.rx * 0.6, b.y - b.ry * 0.6, p.head.x, p.head.y, 10);
      }
    }
  }
  /** Savonne jusqu'à ce que cond(peek) soit vraie, une rangée à la fois. */
  function soapUntil(game, ctx, cond) {
    const p = game.peek();
    const b = p.body;
    const ys = [];
    for (let y = b.y - b.ry; y <= b.y + b.ry; y += 14) ys.push(y);
    for (let k = 0; k < 600 && game.peek().phase === 'soap' && !cond(game.peek()); k++) {
      const y = ys[k % ys.length];
      stroke(game, ctx, b.x - b.rx, y, b.x + b.rx, y, 10);
      if (k % ys.length === ys.length - 1) stroke(game, ctx, p.head.x - 25, p.head.y, p.head.x + 20, p.head.y, 10);
    }
  }
  /** Rince : garde le doigt appuyé en balayant l'animal de gauche à droite. */
  function rinse(game, ctx) {
    const p = game.peek();
    const b = p.body;
    const x0 = b.x - b.rx - 20;
    const x1 = Math.max(b.x + b.rx, p.head.x + 30) + 20;
    for (let pass = 0; pass < 20 && !ctx.done; pass++) {
      for (let y = Math.min(b.y - b.ry, p.head.y) - 30; y <= b.y + b.ry && !ctx.done; y += 60) {
        for (let x = x0; x <= x1 && !ctx.done; x += 8) {
          ctx.pointer = { ...ctx.pointer, x, y, down: true, over: true };
          tick(game, ctx, 2 / 30);
        }
      }
    }
    ctx.pointer = { ...ctx.pointer, down: false };
  }

  it('zone verte dès le début, bouton C\'est bon (qui passe au rinçage), value / lo / hi', () => {
    for (const sp of ['dog', 'horse', 'cow']) {
      const ctx = fakeCtx(animal(sp));
      const game = G.washGame(ctx);
      const p = game.peek();
      expect(p).toMatchObject({ phase: 'soap', value: 0 });
      expectZoneShown(ctx, p);
      expect(stopOf(ctx)).toBeTruthy();
      game.draw(fakeG());
    }
  });

  it('une passe sur tout le corps tombe dans la zone (pas « trop » pour un travail normal)', () => {
    for (const sp of ['dog', 'horse', 'cow']) {
      for (const gap of [16, 22, 28]) {
        const ctx = fakeCtx(animal(sp));
        const game = G.washGame(ctx);
        soapRows(game, ctx, { gap });
        const p = game.peek();
        expect(p.value, `${sp} rangées de ${gap} px : ${p.value.toFixed(3)}`).toBeGreaterThanOrEqual(p.lo);
        expect(p.value, `${sp} rangées de ${gap} px : ${p.value.toFixed(3)}`).toBeLessThanOrEqual(p.hi);
      }
    }
  });

  it('juste puis rinçage : tous les points ; pas assez de mousse : moins ; trop : moins', () => {
    for (const sp of ['dog', 'horse']) {
      for (const [expected, cond] of [['just', null], ['low', (p) => p.value >= 0.45], ['high', (p) => p.value >= p.hi + 0.12]]) {
        const ctx = fakeCtx(animal(sp));
        const game = G.washGame(ctx);
        if (cond) soapUntil(game, ctx, cond);
        else soapRows(game, ctx);
        expect(game.peek().phase).toBe('soap');
        const v = game.peek().value;
        press(ctx);
        expect(game.peek().phase).toBe('rinse');
        expect(game.peek().value).toBeCloseTo(v, 9); // la note garde la mousse du ✅
        expect(ctx.zones.at(-1)).toEqual({ lo: null, hi: undefined }); // zone cachée pour rincer
        expect(ctx.done).toBe(false);
        game.draw(fakeG());
        rinse(game, ctx);
        expectVerdict(ctx, expected);
      }
    }
  });

  it('repasser sur la même moitié ne fait pas « trop » tant que le reste n\'est pas savonné', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.washGame(ctx);
    for (let k = 0; k < 6; k++) soapRows(game, ctx, { part: 0.5 });
    const p = game.peek();
    expect(p.over).toBe(0);
    expect(p.value).toBeLessThan(p.lo);
  });

  it('rincer sans viser : le bouton 🚿 gardé appuyé (ou Espace) promène la douche tout seul', () => {
    for (const how of ['bouton', 'clavier']) {
      const ctx = fakeCtx(animal('horse'));
      const game = G.washGame(ctx);
      soapRows(game, ctx);
      if (how === 'clavier') game.key('Space', true); else press(ctx);
      expect(game.peek().phase).toBe('rinse');
      const shower = ctx.buttons.find((b) => b.text.includes('🚿'));
      expect(shower?.opts.hold).toBe(true); // la place des commandes reste occupée
      if (how === 'clavier') { game.key('Space', false); game.key('Space', true); } else shower.opts.onDown();
      tick(game, ctx, 3);
      expect(game.peek().rinsed).toBeGreaterThan(0.2);
      game.draw(fakeG());
      tick(game, ctx, 30);
      expectVerdict(ctx, 'just');
    }
  });

  it('lâcher le bouton 🚿 arrête la douche', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.washGame(ctx);
    soapRows(game, ctx);
    press(ctx);
    const shower = ctx.buttons.find((b) => b.text.includes('🚿'));
    shower.opts.onDown();
    tick(game, ctx, 1);
    shower.opts.onUp();
    const r = game.peek().rinsed;
    tick(game, ctx, 3);
    expect(game.peek().rinsed).toBe(r);
    expect(ctx.done).toBe(false);
  });

  it('beaucoup trop de mousse : on passe tout seul au rinçage, au plancher ou presque', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.washGame(ctx);
    soapUntil(game, ctx, () => false);
    expect(game.peek().phase).toBe('rinse');
    rinse(game, ctx);
    expectVerdict(ctx, 'high');
    expect(ctx.finished.q).toBeLessThan(0.6);
  });
});

// ---------------------------------------------------------------- griffes / onglons

describe('griffes et onglons : couper juste ce qu\'il faut (un coup par griffe)', () => {
  /** Attend que les ciseaux soient dans [uMin, uMax] puis coupe (Espace). */
  function cutAt(game, ctx, uMin, uMax) {
    for (let k = 0; k < 2000 && !ctx.done; k++) {
      const p = game.peek();
      if (p.u >= uMin && p.u <= uMax) { game.key('Space', true); return p.u; }
      tick(game, ctx, 1 / 60, 1 / 60);
    }
    throw new Error('ciseaux jamais dans la plage');
  }

  it('zone verte dès le début (longueur coupée), bouton Couper, value / lo / hi', () => {
    for (const sp of ['dog', 'cat', 'rabbit', 'goat']) {
      const ctx = fakeCtx(animal(sp));
      const game = G.nailsGame(ctx);
      const p = game.peek();
      expect(p.lo).toBeLessThan(p.hi);
      expectZoneShown(ctx, p, (v) => v);
      // La jauge suit les ciseaux : sa valeur est la longueur qui serait coupée.
      tick(game, ctx, 0.7);
      expect(ctx.prog).toBeCloseTo(game.peek().value, 6);
      expect(ctx.buttons.some((b) => b.text.includes(t('mg_nails_btn')))).toBe(true);
      game.draw(fakeG());
    }
  });

  it('dans la zone : tous les points ; trop peu coupé : moins ; trop court : moins', () => {
    for (const sp of ['dog', 'goat']) {
      for (const [expected, uMin, uMax] of [['just', 0.5, 0.62], ['low', 0.86, 0.95], ['high', 0.43, 0.445]]) {
        const ctx = fakeCtx(animal(sp));
        const game = G.nailsGame(ctx);
        const p0 = game.peek();
        for (let i = 0; i < p0.n; i++) cutAt(game, ctx, uMin, uMax);
        expect(game.peek().cuts.every((c) => c !== null)).toBe(true);
        game.draw(fakeG());
        expectVerdict(ctx, expected);
        if (expected === 'high') expect(ctx.finished.msg).toBe(t('mg_tooMuch', { name: 'Pomme' }));
      }
    }
  });

  it('dans le rose : « trop », une étoile, et le message parle de la zone verte', () => {
    const ctx = fakeCtx(animal('cat'));
    const game = G.nailsGame(ctx);
    for (let i = 0; i < 4; i++) cutAt(game, ctx, 0.2, 0.36);
    expectVerdict(ctx, 'high');
    expect(ctx.finished.msg).toBe(t('mg_nails_end_ouch', { name: 'Pomme' }));
    expect(ctx.finished.q).toBeLessThan(0.6); // une étoile
  });

  it('pas assez coupé et trop coupé, à même distance de la zone : même note', () => {
    const q = (u) => {
      const ctx = fakeCtx(animal('dog'));
      const game = G.nailsGame(ctx);
      for (let i = 0; i < 4; i++) cutAt(game, ctx, u - 0.006, u + 0.006);
      return ctx.finished.q;
    };
    const p = G.nailsGame(fakeCtx(animal('dog'))).peek();
    // 0,06 de longueur en dessous de la zone (ciseaux trop près du bout) ou au-dessus (trop près du rose)
    expect(q(1 - (p.lo - 0.06))).toBeCloseTo(q(1 - (p.hi + 0.06)), 1);
    expect(q(1 - (p.lo - 0.06))).toBeLessThan(1);
  });

  it('une griffe ratée sur quatre : un peu moins, pas le plancher', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.nailsGame(ctx);
    for (let i = 0; i < 3; i++) cutAt(game, ctx, 0.5, 0.62);
    cutAt(game, ctx, 0.9, 0.97);
    expectVerdict(ctx, 'low');
    expect(ctx.finished.q).toBeGreaterThan(0.6);
  });

  it('toucher l\'écran coupe aussi', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.nailsGame(ctx);
    tick(game, ctx, 0.3);
    game.down({ x: 200, y: 200, type: 'touch' });
    expect(game.peek().cur).toBe(1);
  });
});

// ---------------------------------------------------------------- ferrer

describe('ferrer : trois coups par clou, puis ✅', () => {
  const tapNail = (game, p, i) => game.down({ x: p.nails[i].x, y: p.nails[i].y, type: 'touch' });

  it('zone verte dès le début (coups du clou choisi), boutons Taper et C\'est bon', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = G.shoeGame(ctx);
    const p = game.peek();
    expect(p.hits).toEqual([0, 0, 0, 0]);
    expectZoneShown(ctx, { lo: p.just - 0.5, hi: p.just + 0.5, max: p.max });
    expect(stopOf(ctx)).toBeTruthy();
    expect(ctx.buttons.some((b) => b.text.includes('🔨'))).toBe(true); // marteau en icône (aria-label « Taper »)
    game.draw(fakeG());
  });

  it('3 coups sur chaque clou : tous les points ; pas assez : moins ; un clou plié : moins', () => {
    for (const [expected, hits] of [['just', [3, 3, 3, 3]], ['low', [3, 3, 2, 1]], ['high', [3, 4, 3, 3]], ['high', [4, 4, 4, 4]]]) {
      const ctx = fakeCtx(animal('horse'));
      const game = G.shoeGame(ctx);
      const p = game.peek();
      hits.forEach((n, i) => { for (let k = 0; k < n; k++) tapNail(game, p, i); });
      expect(game.peek().hits).toEqual(hits);
      expect(ctx.done).toBe(false); // c'est le ✅ qui termine
      game.draw(fakeG());
      press(ctx);
      expectVerdict(ctx, expected);
    }
  });

  it('un coup en trop coûte autant qu\'un coup en moins', () => {
    const q = (hits) => {
      const ctx = fakeCtx(animal('horse'));
      const game = G.shoeGame(ctx);
      const p = game.peek();
      hits.forEach((n, i) => { for (let k = 0; k < n; k++) tapNail(game, p, i); });
      press(ctx);
      return ctx.finished.q;
    };
    expect(q([3, 3, 3, 4])).toBeCloseTo(q([3, 3, 3, 2]), 6);
    expect(q([3, 3, 3, 4])).toBeLessThan(1);
  });

  it('le bouton 🔨 passe tout seul au clou suivant : 12 coups puis ✅ = juste ; un 13e plie un clou', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = G.shoeGame(ctx);
    for (let k = 0; k < 12; k++) tapBtn(ctx, /🔨/);
    expect(game.peek().hits).toEqual([3, 3, 3, 3]);
    expect(ctx.hints.at(-1)).toMatchObject({ kind: 'good' });
    const ctx2 = fakeCtx(animal('horse'));
    const game2 = G.shoeGame(ctx2);
    for (let k = 0; k < 13; k++) tapBtn(ctx2, /🔨/);
    expect(game2.peek().hits.reduce((s, x) => s + x, 0)).toBe(13);
    expect(game2.peek().hits.filter((x) => x === 4).length).toBe(1);
    press(ctx2);
    expectVerdict(ctx2, 'high');
    press(ctx);
    expectVerdict(ctx, 'just');
  });

  it('tous les clous au maximum : fin automatique, au plancher', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = G.shoeGame(ctx);
    const p = game.peek();
    for (let i = 0; i < 4; i++) for (let k = 0; k < 5; k++) tapNail(game, p, i);
    expectVerdict(ctx, 'high');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('les cibles des clous font au moins 44 px une fois le jeu affiché sur un téléphone de 360 px', () => {
    // 360 px de large − marges ≈ 328 px pour 400 unités : 0,82 px par unité.
    const ctx = fakeCtx(animal('horse'));
    const game = G.shoeGame(ctx);
    const p = game.peek();
    expect(2 * p.tapR * 0.82).toBeGreaterThanOrEqual(44);
    // Les cibles ne se chevauchent pas trop : toucher un clou ne tape pas son voisin.
    for (let i = 0; i < 4; i++) {
      tapNail(game, p, i);
      expect(game.peek().sel).toBe(i);
    }
  });
});

// ---------------------------------------------------------------- tondre

describe('tondre : laine courte partout, sans raser', () => {
  /** Une passe en rangées sur toute la toison (le temps avance d'environ 0,7 s par rangée). */
  function shearRows(game, ctx, { gap = 30, part = 1, dt = 0.7 } = {}) {
    const p = game.peek();
    const b = p.body;
    for (let y = b.y - b.ry * 1.05; y <= b.y + b.ry * 1.05 + 1 && !ctx.done; y += gap) {
      stroke(game, ctx, b.x - b.rx * 1.1, y, b.x - b.rx * 1.1 + 2.2 * b.rx * part, y, 10);
      ctx.time += dt;
    }
    if (part === 1 && !ctx.done) {
      stroke(game, ctx, p.head.x - 25, p.head.y - 14, p.head.x + 10, p.head.y - 14, 8);
      ctx.time += dt;
    }
  }

  it('zone verte dès le début, bouton C\'est bon, value / lo / hi', () => {
    const ctx = fakeCtx(animal('sheep'));
    const game = G.shearGame(ctx);
    const p = game.peek();
    expect(p.value).toBe(0);
    expect(p.short + p.bald).toBe(0);
    expectZoneShown(ctx, p);
    expect(stopOf(ctx)).toBeTruthy();
    game.draw(fakeG());
  });

  it('une passe partout : juste ; la moitié : trop peu ; repasser pour raser : trop', () => {
    for (const gap of [24, 30, 36]) {
      const ctx = fakeCtx(animal('sheep'));
      const game = G.shearGame(ctx);
      shearRows(game, ctx, { gap });
      const p = game.peek();
      expect(p.value, `rangées de ${gap} px : ${p.value.toFixed(3)} (${p.long} longues, ${p.bald} rasées)`).toBeGreaterThanOrEqual(p.lo);
      expect(p.value).toBeLessThanOrEqual(p.hi);
      expect(ctx.done).toBe(false);
      game.draw(fakeG());
      press(ctx);
      expectVerdict(ctx, 'just');
    }

    let ctx = fakeCtx(animal('sheep'));
    let game = G.shearGame(ctx);
    shearRows(game, ctx, { part: 0.45 });
    press(ctx);
    expectVerdict(ctx, 'low');

    ctx = fakeCtx(animal('sheep'));
    game = G.shearGame(ctx);
    shearRows(game, ctx);
    ctx.time += 2;
    shearRows(game, ctx, { gap: 12 }); // on repasse partout, de près : ça rase
    expect(game.peek().value).toBeGreaterThan(game.peek().hi);
    if (!ctx.done) press(ctx);
    expectVerdict(ctx, 'high');
  });

  it('un doigt qui s\'attarde au même endroit ne rase pas : il faut vraiment repasser', () => {
    const ctx = fakeCtx(animal('sheep'));
    const game = G.shearGame(ctx);
    const p = game.peek();
    const y = p.body.y;
    ctx.pointer.down = true;
    game.down({ x: p.body.x - 60, y });
    for (let k = 0; k < 200; k++) {
      ctx.time += 0.05;
      game.move({ x: p.body.x - 60 + (k % 2) * 4, y }, true);
    }
    expect(game.peek().bald).toBe(0);
  });

  it('tout raser : le jeu s\'arrête tout seul, au plancher', () => {
    const ctx = fakeCtx(animal('sheep'));
    const game = G.shearGame(ctx);
    for (let k = 0; k < 12 && !ctx.done; k++) {
      shearRows(game, ctx, { gap: 8 });
      ctx.time += 2;
    }
    expectVerdict(ctx, 'high');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });
});

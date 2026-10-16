// Contre-vérification des mini-jeux de toilette (src/ui/minigames/grooming.js) : cas limites de
// la règle « juste ce qu'il faut » que tests/minigames-toilettage.test.js ne couvre pas.
// - juste au bord de la zone, un tout petit peu dehors, très loin dehors ;
// - s'arrêter tout de suite (✅ dès le début), ne jamais s'arrêter (le jeu finit tout seul) ;
// - ce qui se voit doit aller avec la note : une tache de poussière laissée entière n'est pas
//   « juste », les taches ne se recouvrent pas, le tas de laine est vide avant de tondre ;
// - le message de fin dit pourquoi (juste / trop peu / trop), la note n'est jamais 0.
// Sans DOM ni canvas : faux ctx (comme tests/minigames-juste.test.js).

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

const animal = (species, o = {}) => createAnimal({ species, name: 'Pomme', personality: 'calm', ageDays: 900, colorIndex: 0, rng: makeRng(5), ...o });

function fakeCtx(a, seed = 7) {
  const noop = () => {};
  return {
    a,
    sp: { emoji: '🐾' },
    action: 'test',
    chore: null,
    W: 400,
    H: 360,
    view: { x0: 0, y0: -15, x1: 400, y1: 375, w: 400, h: 390, scale: 0.9, ox: 0, oy: 13 },
    col: coatColors(a),
    fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop, update: noop, draw: noop },
    rng: makeRng(seed),
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
    button(text, opts = {}) { const b = { text, opts, disabled: false, style: {}, setAttribute() {} }; this.buttons.push(b); return b; },
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
}

/** Faux contexte 2D qui compte les appels (arc, fillText…). */
function fakeG(calls = {}) {
  const props = {};
  return new Proxy(props, {
    get(_, k) {
      if (k in props) return props[k];
      if (k === 'measureText') return () => ({ width: 10 });
      if (/^create.*(Gradient|Pattern)$/.test(String(k))) return () => ({ addColorStop() {} });
      return (...args) => { (calls[k] ??= []).push(args); };
    },
    set(_, k, v) { props[k] = v; return true; },
  });
}

const stopOf = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop'));
const press = (ctx) => stopOf(ctx).opts.onTap();

function stroke(game, ctx, x0, y0, x1, y1, step = 6) {
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

function tick(game, ctx, sec, dt = 1 / 30) {
  for (let s = 0; s < sec && !ctx.done; s += dt) {
    ctx.time += dt;
    game.update?.(dt);
  }
}

/** Fin attendue : verdict, q (1 si juste, entre le plancher et 1 sinon) et le bon message. */
function expectEnd(ctx, expected) {
  expect(ctx.done).toBe(true);
  expect(ctx.finished.verdict, `valeur ${ctx.finished.value}`).toBe(expected);
  if (expected === 'just') expect(ctx.finished.q).toBe(1);
  else {
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
  }
  const key = expected === 'just' ? 'mg_justRight' : expected === 'low' ? 'mg_tooLittle' : 'mg_tooMuch';
  if (!ctx.finished.msg?.includes(t('mg_nails_end_ouch', { name: 'Pomme' }))) expect(ctx.finished.msg).toBe(t(key, { name: 'Pomme' }));
}

const SPECIES_BRUSH = ['horse', 'dog', 'cat', 'rabbit', 'sheep', 'goat', 'cow'];

// ---------------------------------------------------------------- brosser

describe('brosser (contre-vérification)', () => {
  /** Nettoie une tache : traits dans le sens du poil jusqu'à ce qu'elle disparaisse. */
  function cleanOne(game, ctx, q) {
    const before = game.peek().patches.length;
    for (let r = 0; r < 14 && game.peek().patches.length === before; r++) stroke(game, ctx, q.x + 30, q.y + ((r % 3) - 1) * 5, q.x - 30, q.y + ((r % 3) - 1) * 5);
  }
  function cleanAll(game, ctx, keep = 0) {
    for (let k = 0; k < 40 && game.peek().patches.length > keep; k++) {
      // la tache la plus à gauche d'abord : un trait vers la queue ne touche pas les autres
      const left = [...game.peek().patches].sort((a, b) => a.x - b.x);
      cleanOne(game, ctx, left[0]);
    }
  }

  it('les taches ne se recouvrent pas et restent sur le corps, pour toutes les espèces', () => {
    for (const sp of SPECIES_BRUSH) {
      for (const seed of [1, 7, 42, 99]) {
        const ctx = fakeCtx(animal(sp), seed);
        const game = G.brushGame(ctx);
        const p = game.peek();
        expect(p.patches.length, `${sp}`).toBeGreaterThanOrEqual(7);
        const ps = p.patches;
        for (let i = 0; i < ps.length; i++) {
          for (let j = i + 1; j < ps.length; j++) {
            // ellipse r × 0,75 r : on veut un petit jour entre deux taches (pas de grosse plaque)
            const a = ps[i];
            const b = ps[j];
            const dx = (a.x - b.x) / (a.r + b.r);
            const dy = (a.y - b.y) / (0.75 * (a.r + b.r));
            expect(Math.hypot(dx, dy), `${sp} graine ${seed} : taches ${i} et ${j} se recouvrent`).toBeGreaterThanOrEqual(1);
          }
        }
      }
    }
  });

  it('une tache laissée entière, ce n\'est pas « juste » (trop peu, un peu moins de points)', () => {
    for (const sp of SPECIES_BRUSH) {
      const ctx = fakeCtx(animal(sp));
      const game = G.brushGame(ctx);
      cleanAll(game, ctx, 1);
      expect(game.peek().patches.length, sp).toBe(1);
      press(ctx);
      expectEnd(ctx, 'low');
      expect(ctx.finished.q, sp).toBeGreaterThan(0.7); // une seule tache : pas le plancher
    }
  });

  it('tout nettoyer puis ✅ : juste, quel que soit le tirage des taches', () => {
    for (const sp of SPECIES_BRUSH) {
      for (const seed of [1, 42, 2024]) {
        const ctx = fakeCtx(animal(sp), seed);
        const game = G.brushGame(ctx);
        cleanAll(game, ctx);
        expect(game.peek().patches.length, `${sp} ${seed}`).toBe(0);
        press(ctx);
        expectEnd(ctx, 'just');
      }
    }
  });

  it('une tache presque finie (un reste de poussière) compte comme juste', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.brushGame(ctx);
    cleanAll(game, ctx, 1);
    const q = game.peek().patches[0];
    // un petit coup seulement : la tache pâlit sans disparaître
    for (let r = 0; r < 30 && game.peek().value < game.peek().lo; r++) stroke(game, ctx, q.x + 6, q.y, q.x - 6, q.y, 3);
    expect(game.peek().patches.length).toBe(1);
    expect(game.peek().value).toBeGreaterThanOrEqual(game.peek().lo);
    expect(game.peek().marks).toBe(0); // pas de peau rose tant qu'on est dans la zone
    press(ctx);
    expectEnd(ctx, 'just');
  });

  it('✅ tout de suite : trop peu, au plancher (jamais 0)', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = G.brushGame(ctx);
    press(ctx);
    expectEnd(ctx, 'low');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
    expect(game.peek().value).toBe(0);
  });

  it('pile au bord de la zone : juste ; juste après : un peu moins ; très loin : plancher', () => {
    const ctx = fakeCtx(animal('cat'));
    const game = G.brushGame(ctx);
    const { lo, hi } = game.peek();
    const q = (v) => justRight(v, lo, hi, { slack: 0.3 });
    expect(q(lo)).toBe(1);
    expect(q(hi)).toBe(1);
    expect(q(hi + 0.05)).toBeLessThan(1);
    expect(q(lo - 0.05)).toBeCloseTo(q(hi + 0.05), 9);
    expect(q(hi + 0.5)).toBe(JUST_FLOOR);
    expect(q(0)).toBe(JUST_FLOOR);
  });

  it('frotter un peu trop : la première marque rose arrive dès la sortie de la zone ; ne jamais s\'arrêter finit au plancher', () => {
    const ctx = fakeCtx(animal('rabbit'));
    const game = G.brushGame(ctx);
    cleanAll(game, ctx);
    const b = game.peek().body;
    let k = 0;
    while (!ctx.done && game.peek().value <= game.peek().hi && k++ < 200) stroke(game, ctx, b.x + b.rx * 0.5, b.y, b.x - b.rx * 0.5, b.y);
    expect(ctx.hints.at(-1).kind).toBe('warn'); // « Un peu trop ! » dès qu'on sort
    expect(game.peek().marks).toBeGreaterThanOrEqual(1); // et la première marque rose
    while (!ctx.done && k++ < 2000) stroke(game, ctx, b.x + b.rx * 0.5, b.y, b.x - b.rx * 0.5, b.y);
    expectEnd(ctx, 'high');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('frotter sans jamais lever le doigt après la dernière tache finit quand même par être « trop »', () => {
    for (const sp of ['dog', 'horse']) {
      const ctx = fakeCtx(animal(sp));
      const game = G.brushGame(ctx);
      cleanAll(game, ctx, 1);
      const q = game.peek().patches[0];
      const b = game.peek().body;
      // Un seul trait : on nettoie la dernière tache puis on continue d'aller et venir sur le
      // poil propre, sans lever le doigt (avant : sursis jusqu'au doigt levé, donc jamais trop).
      const pts = [];
      for (let r = 0; r < 14; r++) pts.push([q.x + 30, q.y + ((r % 3) - 1) * 5], [q.x - 30, q.y + ((r % 3) - 1) * 5]);
      for (let r = 0; r < 12; r++) pts.push([b.x + b.rx * 0.6, b.y], [b.x - b.rx * 0.6, b.y]);
      game.down({ x: pts[0][0], y: pts[0][1] });
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0] = pts[i - 1];
        const [x1, y1] = pts[i];
        const n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / 6));
        for (let j = 1; j <= n; j++) game.move({ x: x0 + ((x1 - x0) * j) / n, y: y0 + ((y1 - y0) * j) / n }, true);
      }
      expect(game.peek().patches.length, sp).toBe(0);
      expect(game.peek().value, sp).toBeGreaterThan(game.peek().hi);
      press(ctx);
      expectEnd(ctx, 'high');
    }
  });

  it('dans la zone avec un reste de poussière : frotter ailleurs irrite aussi (pas « juste » à l\'infini)', () => {
    const ctx = fakeCtx(animal('cat'));
    const game = G.brushGame(ctx);
    cleanAll(game, ctx, 1);
    const q = game.peek().patches[0];
    for (let r = 0; r < 30 && game.peek().value < game.peek().lo; r++) stroke(game, ctx, q.x + 6, q.y, q.x - 6, q.y, 3);
    expect(game.peek().patches.length).toBe(1); // il reste un peu de poussière…
    expect(game.peek().value).toBeGreaterThanOrEqual(game.peek().lo); // … mais on est dans la zone
    const b = game.peek().body;
    // on brosse loin de la tache, encore et encore
    const far = q.x > b.x ? b.x - b.rx * 0.6 : b.x + b.rx * 0.6;
    for (let k = 0; k < 400 && !ctx.done && game.peek().value <= game.peek().hi + 0.1; k++) stroke(game, ctx, far + 25, b.y + 6, far - 25, b.y + 6, 5);
    expect(game.peek().value).toBeGreaterThan(game.peek().hi);
  });

  it('la zone montrée sur la jauge et sur le cadran est la même que celle de la note', () => {
    for (const sp of SPECIES_BRUSH) {
      const ctx = fakeCtx(animal(sp));
      const game = G.brushGame(ctx);
      const p = game.peek();
      expect(ctx.zones[0].lo).toBeCloseTo(p.lo / p.max, 9);
      expect(ctx.zones[0].hi).toBeCloseTo(p.hi / p.max, 9);
      // la zone verte de la jauge fait au moins 6 % de la largeur (visible au doigt)
      expect(ctx.zones[0].hi - ctx.zones[0].lo).toBeGreaterThanOrEqual(0.06);
    }
  });
});

// ---------------------------------------------------------------- laver

describe('laver (contre-vérification)', () => {
  function soapAll(game, ctx, gap = 20) {
    const p = game.peek();
    const b = p.body;
    for (let y = b.y - b.ry; y <= b.y + b.ry; y += gap) stroke(game, ctx, b.x - b.rx, y, b.x + b.rx, y, 10);
    stroke(game, ctx, p.head.x - 30, p.head.y - 10, p.head.x + 20, p.head.y - 10, 10);
    stroke(game, ctx, p.head.x - 30, p.head.y + 12, p.head.x + 20, p.head.y + 12, 10);
    stroke(game, ctx, b.x + b.rx * 0.6, b.y - b.ry * 0.6, p.head.x, p.head.y, 10);
  }
  const holdShower = (ctx) => ctx.buttons.find((b) => b.text.includes('🚿')).opts.onDown();

  it('✅ tout de suite : rien à rincer, la fin arrive aussitôt, trop peu au plancher', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.washGame(ctx);
    press(ctx);
    expect(game.peek().phase).toBe('rinse');
    tick(game, ctx, 0.2);
    expectEnd(ctx, 'low');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('ne jamais s\'arrêter de savonner : on passe tout seul au rinçage, puis « trop »', () => {
    const ctx = fakeCtx(animal('cow'));
    const game = G.washGame(ctx);
    const b = game.peek().body;
    soapAll(game, ctx);
    for (let k = 0; k < 400 && game.peek().phase === 'soap'; k++) stroke(game, ctx, b.x - b.rx, b.y + ((k % 5) - 2) * 12, b.x + b.rx, b.y + ((k % 5) - 2) * 12, 10);
    expect(game.peek().phase).toBe('rinse');
    holdShower(ctx);
    tick(game, ctx, 60);
    expectEnd(ctx, 'high');
    expect(ctx.finished.q).toBeLessThan(0.6);
  });

  it('un tout petit peu de mousse en trop reste juste ; un peu plus : « trop », moins de points', () => {
    for (const sp of ['dog', 'horse']) {
      const ctx = fakeCtx(animal(sp));
      const game = G.washGame(ctx);
      soapAll(game, ctx);
      const p = game.peek();
      expect(p.value, sp).toBeGreaterThanOrEqual(p.lo);
      expect(p.value, sp).toBeLessThanOrEqual(p.hi);
      const b = p.body;
      // on frotte encore, par petits traits, jusqu'à dépasser la zone d'un rien
      let k = 0;
      while (game.peek().value <= game.peek().hi && k++ < 400) stroke(game, ctx, b.x - 20, b.y, b.x + 20, b.y, 5);
      const v = game.peek().value;
      expect(v).toBeGreaterThan(game.peek().hi);
      expect(v).toBeLessThan(game.peek().hi + 0.02);
      // encore un peu : franchement trop
      for (let j = 0; j < 3 && game.peek().phase === 'soap'; j++) stroke(game, ctx, b.x - b.rx, b.y, b.x + b.rx, b.y, 10);
      expect(game.peek().phase).toBe('soap');
      expect(game.peek().value).toBeGreaterThan(game.peek().hi + 0.05);
      press(ctx);
      holdShower(ctx);
      tick(game, ctx, 60);
      expectEnd(ctx, 'high');
    }
  });

  it('un coin oublié (oreille, haut de la tête) n\'empêche pas d\'en mettre trop si l\'on frotte sans fin', () => {
    for (const sp of ['dog', 'horse', 'cow']) {
      const ctx = fakeCtx(animal(sp));
      const game = G.washGame(ctx);
      const b = game.peek().body;
      const h = game.peek().head;
      // le corps et le bas de la tête : dans la zone, mais pas tout savonné (oreilles, front)
      for (let y = b.y - b.ry; y <= b.y + b.ry; y += 20) stroke(game, ctx, b.x - b.rx, y, b.x + b.rx, y, 10);
      stroke(game, ctx, b.x + b.rx * 0.6, b.y - b.ry * 0.6, h.x, h.y + 12, 10);
      for (let k = 0; k < 6 && game.peek().value < game.peek().lo; k++) stroke(game, ctx, h.x - 30, h.y + 14 - k * 6, h.x + 20, h.y + 14 - k * 6, 10);
      const p = game.peek();
      expect(p.soaped, sp).toBeLessThan(0.97);
      expect(p.value, sp).toBeGreaterThanOrEqual(p.lo);
      // puis on frotte encore et encore le dos (avant : la mousse en trop ne comptait qu'à 97 %)
      for (let k = 0; k < 300 && game.peek().phase === 'soap' && game.peek().value <= game.peek().hi + 0.05; k++) stroke(game, ctx, b.x - b.rx * 0.7, b.y, b.x + b.rx * 0.7, b.y, 8);
      expect(game.peek().value, sp).toBeGreaterThan(game.peek().hi);
    }
  });

  it('une passe normale reste juste quel que soit le tirage (rangées serrées ou larges)', () => {
    // Dans le vrai jeu, la graine change à chaque partie (Date.now()) : on en essaie plusieurs.
    for (const sp of ['dog', 'horse', 'cow']) {
      for (const seed of [1, 7, 42, 99, 123, 2024]) {
        for (const gap of [16, 22, 28]) {
          const ctx = fakeCtx(animal(sp), seed);
          const game = G.washGame(ctx);
          soapAll(game, ctx, gap);
          const p = game.peek();
          const at = `${sp} graine ${seed} rangées ${gap} : ${p.value.toFixed(3)}`;
          expect(p.value, at).toBeGreaterThanOrEqual(p.lo);
          expect(p.value, at).toBeLessThanOrEqual(p.hi);
        }
      }
    }
  });

  it('frotter dans le vide (à côté de l\'animal) ne met pas de mousse en trop', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.washGame(ctx);
    soapAll(game, ctx);
    const v = game.peek().value;
    for (let k = 0; k < 40; k++) stroke(game, ctx, 10, 20, 120, 20, 8);
    expect(game.peek().value).toBe(v);
  });

  it('la moitié du corps savonnée : trop peu, et le message le dit', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = G.washGame(ctx);
    const b = game.peek().body;
    for (let y = b.y - b.ry; y <= b.y + b.ry; y += 20) stroke(game, ctx, b.x - b.rx, y, b.x, y, 10);
    expect(game.peek().value).toBeLessThan(game.peek().lo);
    press(ctx);
    holdShower(ctx);
    tick(game, ctx, 60);
    expectEnd(ctx, 'low');
  });
});

// ---------------------------------------------------------------- griffes

describe('griffes (contre-vérification)', () => {
  /** Coupe chaque griffe exactement à la longueur voulue (on règle les ciseaux puis Espace). */
  function cutLens(game, ctx, lens) {
    for (const len of lens) {
      // on avance jusqu'à ce que les ciseaux soient tout près de 1 − len
      for (let k = 0; k < 20000 && Math.abs(game.peek().u - (1 - len)) > 0.004; k++) tick(game, ctx, 1 / 600, 1 / 600);
      game.key('Space', true);
    }
  }

  it('pile aux bords de la zone (longueur coupée = lo ou hi) : juste', () => {
    for (const edge of ['lo', 'hi']) {
      const ctx = fakeCtx(animal('dog'));
      const game = G.nailsGame(ctx);
      const p = game.peek();
      const L = edge === 'lo' ? p.lo + 0.003 : p.hi - 0.003;
      cutLens(game, ctx, [L, L, L, L]);
      expectEnd(ctx, 'just');
    }
  });

  it('un peu dehors (0,05) des deux côtés : moins de points, autant d\'un côté que de l\'autre', () => {
    const qOf = (side) => {
      const ctx = fakeCtx(animal('cat'));
      const game = G.nailsGame(ctx);
      const p = game.peek();
      const L = side === 'low' ? p.lo - 0.05 : p.hi + 0.05;
      cutLens(game, ctx, [L, L, L, L]);
      expectEnd(ctx, side);
      return ctx.finished.q;
    };
    const lo = qOf('low');
    const hi = qOf('high');
    expect(lo).toBeLessThan(1);
    expect(Math.abs(lo - hi)).toBeLessThanOrEqual(0.06);
  });

  it('une seule griffe dans le rose (« Aïe », 🩹), trois parfaites : jamais « juste »', () => {
    for (const sp of ['dog', 'goat']) {
      const ctx = fakeCtx(animal(sp));
      const game = G.nailsGame(ctx);
      const p = game.peek();
      const mid = (p.lo + p.hi) / 2;
      // ciseaux à u = 0,40 : longueur coupée 0,60, dans le rose (u < quick + 0,04)
      cutLens(game, ctx, [mid, 0.6, mid, mid]);
      expectEnd(ctx, 'high');
      expect(ctx.finished.msg).toBe(t('mg_nails_end_ouch', { name: 'Pomme' }));
    }
  });

  it('un cheveu hors de la zone sur une griffe (moins de 0,02) : juste, comme le dit le ✅', () => {
    const ctx = fakeCtx(animal('cat'));
    const game = G.nailsGame(ctx);
    const p = game.peek();
    const mid = (p.lo + p.hi) / 2;
    cutLens(game, ctx, [mid, p.hi + 0.012, mid, p.lo - 0.012]);
    expectEnd(ctx, 'just');
  });

  it('couper tout de suite sans attendre (ciseaux au bout) : trop peu, au plancher', () => {
    const ctx = fakeCtx(animal('rabbit'));
    const game = G.nailsGame(ctx);
    for (let i = 0; i < 4; i++) game.key('Space', true);
    expectEnd(ctx, 'low');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });
});

// ---------------------------------------------------------------- ferrer

describe('ferrer (contre-vérification)', () => {
  const tapNail = (game, p, i) => game.down({ x: p.nails[i].x, y: p.nails[i].y, type: 'touch' });

  it('✅ tout de suite : trop peu, au plancher', () => {
    const ctx = fakeCtx(animal('horse'));
    G.shoeGame(ctx);
    press(ctx);
    expectEnd(ctx, 'low');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('un clou à 2 et un à 4 : les deux erreurs comptent (pas « juste »)', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = G.shoeGame(ctx);
    const p = game.peek();
    [3, 2, 4, 3].forEach((n, i) => { for (let k = 0; k < n; k++) tapNail(game, p, i); });
    press(ctx);
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.verdict).not.toBe('just');
  });

  it('ne jamais s\'arrêter de taper sur 🔨 : tous les clous finissent pliés et le jeu s\'arrête tout seul, au plancher', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = G.shoeGame(ctx);
    const hammer = ctx.buttons.find((b) => b.text.includes('🔨')).opts.onTap;
    for (let k = 0; k < 40 && !ctx.done; k++) hammer();
    expect(game.peek().hits).toEqual([5, 5, 5, 5]);
    expectEnd(ctx, 'high');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('taper à côté des clous ne fait rien', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = G.shoeGame(ctx);
    game.down({ x: 200, y: 330, type: 'touch' });
    game.down({ x: 20, y: 20, type: 'touch' });
    expect(game.peek().hits).toEqual([0, 0, 0, 0]);
  });
});

// ---------------------------------------------------------------- tondre

describe('tondre (contre-vérification)', () => {
  it('✅ tout de suite : trop peu, au plancher', () => {
    const ctx = fakeCtx(animal('sheep'));
    G.shearGame(ctx);
    press(ctx);
    expectEnd(ctx, 'low');
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('avant de tondre, le tas de laine par terre est vide', () => {
    const ctx = fakeCtx(animal('sheep'));
    const game = G.shearGame(ctx);
    const calls = {};
    game.draw(fakeG(calls));
    // le tas est dessiné à droite, au sol (x ≥ 300, y ≥ 300) : rien tant que rien n'est coupé
    const pile = (calls.arc ?? []).filter(([x, y, r]) => x >= 300 && y >= 300 && r === 16);
    expect(pile.length).toBe(0);
  });

  it('une passe partout puis repasser sur quelques touffes seulement : encore juste, puis trop', () => {
    const ctx = fakeCtx(animal('sheep'));
    const game = G.shearGame(ctx);
    const p = game.peek();
    const b = p.body;
    for (let y = b.y - b.ry * 1.05; y <= b.y + b.ry * 1.05 + 1; y += 28) {
      stroke(game, ctx, b.x - b.rx * 1.1, y, b.x + b.rx * 1.1, y, 10);
      ctx.time += 0.7;
    }
    stroke(game, ctx, p.head.x - 25, p.head.y - 14, p.head.x + 10, p.head.y - 14, 8);
    const v1 = game.peek().value;
    expect(v1).toBeGreaterThanOrEqual(p.lo);
    expect(v1).toBeLessThanOrEqual(p.hi);
    ctx.time += 2;
    // on repasse de près, une rangée à la fois, jusqu'à sortir de la zone
    let y = b.y - b.ry;
    while (game.peek().value <= game.peek().hi && y < b.y + b.ry * 1.2) {
      stroke(game, ctx, b.x - b.rx * 1.1, y, b.x + b.rx * 1.1, y, 4);
      ctx.time += 2;
      y += 6;
    }
    expect(game.peek().value).toBeGreaterThan(game.peek().hi);
    press(ctx);
    expectEnd(ctx, 'high');
  });
});

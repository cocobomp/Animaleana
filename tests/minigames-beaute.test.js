// Mini-jeux du concours de beauté (src/ui/minigames/beauty.js), dans le cadre commun :
// tresser (gauche au milieu, droite au milieu), lustrer (« juste ce qu'il faut » de lustrant),
// le nœud (le serrer juste ce qu'il faut) et gonfler le poil (en rythme).
// Sans DOM ni canvas : un faux ctx remplace le cadre (src/ui/minigames.js), et un faux contexte 2D
// vérifie que draw() ne plante pas, pour chaque espèce.

import { describe, it, expect, beforeAll } from 'vitest';
import { justRight, verdict, JUST_FLOOR } from '../src/ui/minigames/score.js';
import { makeRng, coatColors } from '../src/ui/minigames/draw.js';
import { createAnimal } from '../src/sim/animal.js';

let t;
let B;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  B = await import('../src/ui/minigames/beauty.js');
});

const animal = (species, o = {}) => createAnimal({ species, name: 'Pomme', personality: 'calm', ageDays: 900, colorIndex: 0, rng: makeRng(5), ...o });

/** Le cadre, en faux : mêmes méthodes que le ctx de minigames.js, sans DOM. */
function fakeCtx(a) {
  const noop = () => {};
  return {
    a,
    sp: { emoji: '🐾' },
    action: 'test',
    chore: null,
    opts: { out: {} },
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
    button(text, opts = {}) { const b = { text, opts }; this.buttons.push(b); return b; },
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
      this.finished = { verdict: v, value };
      this.finish(q, o.msgs?.[v] ?? t('mg_justRight', { name: this.name }));
      return { q, verdict: v };
    },
    stopButton(onStop, label = t('mg_stopHere')) { return this.button(`✅ ${label}`, { cls: 'stop primary', onTap: onStop }); },
  };
}

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

function tick(game, ctx, sec, dt = 1 / 30) {
  for (let s = 0; s < sec && !ctx.done; s += dt) {
    ctx.time += dt;
    game.update?.(dt);
  }
}

const tap = (game, p) => { game.down?.({ ...p, type: 'touch' }); game.up?.({ ...p, type: 'touch' }); };

/** Frotte le chiffon sur chaque endroit encore terne (un petit va-et-vient par endroit). */
function rubAll(game, ctx, passes = 1) {
  for (let k = 0; k < passes; k++) {
    for (const c of game.peek().cells.length ? game.peek().cells : []) {
      game.down({ x: c.x - 12, y: c.y });
      for (let i = 0; i <= 8; i++) game.move({ x: c.x - 12 + i * 3, y: c.y }, true);
      game.up({ x: c.x + 12, y: c.y });
    }
  }
}

describe('tresser : le vrai geste, gauche au milieu puis droite au milieu', () => {
  it('sans faute : 5 tresses, la couleur des rubans, un ruban par tresse, 3 étoiles', () => {
    const a = animal('horse');
    const ctx = fakeCtx(a);
    const game = B.braidGame(ctx);
    let guard = 0;
    while (game.peek().phase === 'braid' && guard++ < 100) tap(game, game.peek().next);
    expect(game.peek().phase).toBe('color');
    expect(game.peek().wrong).toBe(0);
    expect(ctx.buttons.length).toBe(6);
    ctx.buttons.find((b) => b.text === '🩷').opts.onTap();
    expect(ctx.opts.out.color).toBe('pink');
    expect(game.peek().phase).toBe('ribbons');
    while (!ctx.done && guard++ < 200) tap(game, game.peek().tie);
    expect(ctx.finished.q).toBe(1);
    expect(ctx.finished.msg).toBe(t('mg_braid_end', { name: 'Pomme', g: a.sex }));
    game.draw(fakeG());
  });

  it("toucher la mauvaise mèche : on le dit, et la note baisse (sans descendre sous 0,4)", () => {
    const ctx = fakeCtx(animal('horse'));
    const game = B.braidGame(ctx);
    tap(game, game.peek().wrongPoint); // celle du milieu : jamais la bonne
    expect(game.peek().wrong).toBe(1);
    expect(ctx.hints.at(-1).kind).toBe('warn');
    expect(game.peek().crossings).toBe(0);
    let guard = 0;
    while (game.peek().phase === 'braid' && guard++ < 100) tap(game, game.peek().next);
    ctx.buttons[0].opts.onTap();
    while (!ctx.done && guard++ < 200) tap(game, game.peek().tie);
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
  });

  it('au clavier : flèches gauche / droite, Espace pour les rubans', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = B.braidGame(ctx);
    let guard = 0;
    while (game.peek().phase === 'braid' && guard++ < 100) game.key(game.peek().next.x < 300 ? 'ArrowLeft' : 'ArrowRight', true);
    expect(game.peek().wrong).toBe(0);
    ctx.buttons[2].opts.onTap();
    while (!ctx.done && guard++ < 200) game.key('Space', true);
    expect(ctx.finished.q).toBe(1);
  });

  it('les mèches de la loupe sont assez grosses pour un doigt (≥ 44 px à l\'écran de 390 px)', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = B.braidGame(ctx);
    const left = game.peek().next.x;
    tap(game, game.peek().next);
    const right = game.peek().next.x;
    // Trois mèches de 32 unités, écartées de 48 : à l'échelle d'un téléphone (≈ 0,92), ≥ 44 px chacune.
    expect(Math.abs(right - left)).toBeGreaterThanOrEqual(90);
  });
});

describe('lustrer : juste ce qu\'il faut de lustrant', () => {
  for (const species of ['dog', 'cat', 'goat', 'cow']) {
    it(`${species} : partout une fois puis ✅ = juste ; s'arrêter trop tôt = trop peu`, () => {
      const ctx = fakeCtx(animal(species));
      const game = B.shineGame(ctx);
      const p0 = game.peek();
      expect(ctx.zones[0].lo).toBeCloseTo(p0.lo / p0.max, 6);
      let guard = 0;
      while (game.peek().value < game.peek().lo && guard++ < 20) rubAll(game, ctx);
      expect(game.peek().value).toBeLessThanOrEqual(game.peek().hi);
      ctx.buttons.find((b) => b.opts.cls?.includes('stop')).opts.onTap();
      expect(ctx.finished.verdict).toBe('just');
      expect(ctx.finished.q).toBe(1);
      game.draw(fakeG());

      const ctx2 = fakeCtx(animal(species));
      const g2 = B.shineGame(ctx2);
      g2.down({ x: 200, y: 200 });
      g2.move({ x: 230, y: 200 }, true);
      ctx2.buttons[0].opts.onTap();
      expect(ctx2.finished.verdict).toBe('low');
      expect(ctx2.finished.msg).toBe(t('mg_shine_low', { name: 'Pomme' }));
    });
  }

  it('frotter, frotter encore : trop de lustrant (ça colle)', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = B.shineGame(ctx);
    const cells = game.peek().cells;
    for (let k = 0; k < 30 && !ctx.done && game.peek().value <= game.peek().hi; k++) {
      for (const c of cells) {
        game.down({ x: c.x - 12, y: c.y });
        for (let i = 0; i <= 8; i++) game.move({ x: c.x - 12 + i * 3, y: c.y }, true);
        game.up({ x: c.x + 12, y: c.y });
      }
    }
    const passes = game.peek();
    expect(passes.over).toBeGreaterThan(0);
    if (!ctx.done) ctx.buttons[0].opts.onTap();
    expect(ctx.finished.verdict).toBe('high');
    expect(ctx.finished.q).toBeLessThan(1);
  });

  it('cheval : sans huiler les sabots, ce n\'est jamais assez ; avec, c\'est juste', () => {
    const ctx = fakeCtx(animal('horse'));
    const game = B.shineGame(ctx);
    let guard = 0;
    while (game.peek().coverage < 0.999 && guard++ < 20) rubAll(game, ctx);
    expect(game.peek().value).toBeLessThan(game.peek().lo);
    for (const h of game.peek().hooves) game.down(h);
    expect(game.peek().hooves.length).toBe(0);
    expect(game.peek().value).toBeGreaterThanOrEqual(game.peek().lo);
    game.key('Enter', true);
    expect(ctx.finished.verdict).toBe('just');
  });
});

describe('le nœud : couleur, motif, au cou, puis serré juste ce qu\'il faut', () => {
  const setup = (species) => {
    const ctx = fakeCtx(animal(species));
    const game = B.bowGame(ctx);
    ctx.buttons.find((b) => b.text === '🔵').opts.onTap();
    expect(ctx.opts.out.color).toBe('blue');
    ctx.buttons[1].opts.onTap(); // à pois
    expect(ctx.opts.out.pattern).toBe('dots');
    const p = game.peek();
    expect(p.phase).toBe('place');
    game.down(p.bow);
    game.move(p.target, true);
    game.up(p.target);
    expect(game.peek().phase).toBe('tighten');
    expect(ctx.zones.at(-1).lo).toBeCloseTo(p.lo / p.max, 6);
    return { ctx, game };
  };

  for (const species of ['dog', 'cat', 'rabbit', 'sheep', 'goat', 'cow']) {
    it(`${species} : lâcher dans le vert = juste, 3 étoiles`, () => {
      const { ctx, game } = setup(species);
      game.down({ x: 10, y: 10 });
      let guard = 0;
      while (game.peek().tension < (game.peek().lo + game.peek().hi) / 2 && guard++ < 400) tick(game, ctx, 1 / 30);
      game.up({ x: 10, y: 10 });
      expect(ctx.finished.verdict).toBe('just');
      expect(ctx.finished.q).toBe(1);
      game.draw(fakeG());
    });
  }

  it('trop tôt : lâche ; trop longtemps : trop serré (et ça finit tout seul au bout)', () => {
    const a = setup('dog');
    a.game.down({ x: 10, y: 10 });
    tick(a.game, a.ctx, 0.4);
    a.game.up({ x: 10, y: 10 });
    expect(a.ctx.finished.verdict).toBe('low');
    expect(a.ctx.finished.msg).toBe(t('mg_bow_loose', { name: 'Pomme' }));
    const b = setup('cat');
    b.game.key('Space', true);
    tick(b.game, b.ctx, 4);
    expect(b.ctx.done).toBe(true);
    expect(b.ctx.finished.verdict).toBe('high');
  });

  it('manquer le cou : on le dit, et le nœud reste à poser', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = B.bowGame(ctx);
    ctx.buttons[0].opts.onTap();
    ctx.buttons[0].opts.onTap();
    const p = game.peek();
    game.down(p.bow);
    game.move({ x: 380, y: 340 }, true);
    game.up({ x: 380, y: 340 });
    expect(game.peek().phase).toBe('place');
    expect(ctx.hints.at(-1).kind).toBe('warn');
  });
});

describe('gonfler le poil : en rythme', () => {
  it('8 tapes au bon moment : 3 étoiles ; trop tôt : moins', () => {
    const ctx = fakeCtx(animal('sheep'));
    const game = B.fluffGame(ctx);
    for (let i = 0; i < 8; i++) {
      while (game.peek().beat < 0.8) tick(game, ctx, 1 / 60, 1 / 60);
      game.key('Space', true);
    }
    expect(ctx.finished.q).toBe(1);
    game.draw(fakeG());
    const ctx2 = fakeCtx(animal('rabbit'));
    const g2 = B.fluffGame(ctx2);
    const body = g2.peek().body;
    for (let i = 0; i < 8; i++) g2.down({ x: body.x, y: body.y });
    expect(ctx2.finished.q).toBeLessThan(1);
    expect(ctx2.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
  });
});

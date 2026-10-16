// Corvées, contre-vérification : les cas limites que la première passe ne couvrait pas.
// - curer : une touffe propre lancée en même temps que le dernier crottin (ou pendant qu'il
//   vole) comptait pour rien (« juste ») ; la jauge était dans le vert avec 7 crottins + 1 touffe ;
// - paille : tout en tas sur un tiers du box (60 % de sol nu) était « Juste ce qu'il fallait ! » ;
// - balayer : un brin poussé en biais sur le rebord de la pelle restait coincé, jamais compté ;
// - vaisselle : le vert ne durait qu'un petit rond (une demi-seconde), et quatre assiettes
//   justes + une un peu sale donnaient 1 (arrondi) avec « Un peu trop peu… » ;
// - partout : « dans le vert » sur la jauge veut toujours dire « juste » ; jamais 0 ; une seule
//   fin ; avec le cheval du box, un message qui a du sens.
// Sans DOM ni canvas : le même faux cadre que tests/minigames-corvees.test.js.

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
const endMsg = (v, name = '') => (name ? t(`mg_${KEY[v]}`, { name }) : t(`mg_chore_${KEY[v]}`));

/** Le cadre, en faux (mêmes méthodes que le ctx de src/ui/minigames.js, finish arrondi pareil). */
function fakeCtx({ a = null, seed = 7 } = {}) {
  const noop = () => {};
  return {
    a,
    sp: a ? { emoji: '🐴' } : null,
    action: 'test',
    chore: null,
    W: 400,
    H: 360,
    view: { x0: 0, y0: -15, x1: 400, y1: 375, w: 400, h: 390, scale: 0.9, ox: 0, oy: 13 },
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
    finishes: 0,
    hint(text, kind = '') { this.hints.push({ text, kind }); },
    progress(v) { this.prog = Math.max(0, Math.min(1, v)); },
    button(text, opts = {}) { const b = { text, opts, disabled: false }; this.buttons.push(b); return b; },
    clearButtons() { this.buttons = []; },
    finish(q, msg) {
      this.finishes++;
      if (this.done) return;
      this.done = true;
      // comme le vrai cadre : bornée à [0,4 ; 1] et arrondie à 2 décimales
      this.finished = { q: Math.round(Math.max(0.4, Math.min(1, q)) * 100) / 100, msg };
    },
    zone(lo, hi) { this.zones.push({ lo, hi }); return { lo, hi }; },
    finishJust(value, lo, hi, o = {}) {
      const q = justRight(value, lo, hi, { floor: o.floor, slack: o.slack });
      const v = verdict(value, lo, hi);
      const name = typeof o.who === 'string' ? o.who : o.who?.name ?? this.name;
      this.finish(q, o.msgs?.[v] ?? endMsg(v, name));
      return { q, verdict: v };
    },
    stopButton(onStop, label = t('mg_stopHere')) { return this.button(`✅ ${label}`, { cls: 'stop primary', onTap: onStop }); },
  };
}

const stopOf = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop'));
const press = (ctx) => stopOf(ctx).opts.onTap();
const tick = (game, n = 30) => { for (let i = 0; i < n; i++) game.update?.(1 / 30); };
function stroke(game, x0, y0, x1, y1, n = 10) {
  game.down?.({ x: x0, y: y0, type: 'touch' });
  for (let i = 1; i <= n; i++) game.move?.({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, type: 'touch' }, true);
  game.up?.({ x: x1, y: y1, type: 'touch' });
}
/** La jauge du cadre est-elle dans la bande verte ? */
const inGreen = (ctx) => ctx.prog >= ctx.zones[0].lo - 1e-9 && ctx.prog <= ctx.zones[0].hi + 1e-9;

// ---------------------------------------------------------------- partout

describe('messages de fin, avec le cheval du box', () => {
  const pomme = { id: 'h1', name: 'Pomme', species: 'horse', look: { seed: 3 } };

  it('curer, de la paille propre jetée : pas « Pomme en avait déjà assez », le message de la corvée', () => {
    const ctx = fakeCtx({ a: pomme });
    const game = chores.muckGame(ctx);
    const tap = (it) => { game.down({ x: it.x, y: it.y }); game.up({ x: it.x, y: it.y }); tick(game, 30); };
    tap(game.peek().items.find((x) => x.good));
    while (game.peek().items.some((x) => !x.good) && !ctx.done) tap(game.peek().items.find((x) => !x.good));
    expect(ctx.finished.msg).toBe(endMsg('high'));
  });

  it('paille : le prénom reste (« Pomme en voulait encore un peu » parle bien de paille)', () => {
    const ctx = fakeCtx({ a: pomme });
    chores.strawGame(ctx);
    press(ctx);
    expect(ctx.finished.msg).toBe(endMsg('low', 'Pomme'));
  });
});

describe('toutes les corvées : « C\'est bon ! » deux fois → une seule fin', () => {
  it.each(['muck', 'straw', 'sweep', 'living'])('%s', (kind) => {
    const ctx = fakeCtx();
    chores.CHORE_GAMES[kind](ctx);
    press(ctx);
    press(ctx);
    expect(ctx.finishes).toBe(1);
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });
});

// ---------------------------------------------------------------- curer le box

const dirtOf = (game) => game.peek().items.filter((x) => !x.good);
const tuftsOf = (game) => game.peek().items.filter((x) => x.good);
const launch = (game, it) => { game.down({ x: it.x, y: it.y }); game.up({ x: it.x, y: it.y }); };
function tapItem(game, it, frames = 30) { launch(game, it); tick(game, frames); }

describe('curer : la course entre le dernier crottin et une touffe propre', () => {
  it('lancés dans la même image : c\'est « trop », pas « juste »', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    for (const it of dirtOf(game).slice(0, 7)) tapItem(game, it);
    launch(game, dirtOf(game)[0]);
    launch(game, tuftsOf(game)[0]);
    tick(game, 30);
    expect(ctx.done).toBe(true);
    expect(ctx.finishes).toBe(1);
    expect(ctx.finished.msg).toBe(endMsg('high'));
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.q).toBeCloseTo(justRight(9, 7.5, 8.5, { slack: 1.5 }), 2);
  });

  it('la touffe lancée PENDANT que le dernier crottin vole : « trop » aussi', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    for (const it of dirtOf(game).slice(0, 7)) tapItem(game, it);
    launch(game, dirtOf(game)[0]);
    tick(game, 3); // il vole encore
    expect(ctx.done).toBe(false);
    launch(game, tuftsOf(game)[0]);
    tick(game, 40);
    expect(ctx.finished.msg).toBe(endMsg('high'));
    expect(ctx.finished.q).toBeLessThan(1);
  });

  it('une touffe encore dans la fourche à la fin ne compte pas comme jetée', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    for (const it of dirtOf(game).slice(0, 7)) tapItem(game, it);
    launch(game, dirtOf(game)[0]);
    const tuft = tuftsOf(game)[0];
    game.down({ x: tuft.x, y: tuft.y }); // on la tient, sans la lâcher
    expect(game.peek().holding).toBe('tuft');
    expect(game.peek().thrown).toBe(0);
    tick(game, 40);
    expect(ctx.finished.msg).toBe(endMsg('just'));
    expect(ctx.finished.q).toBe(1);
  });

  it('un crottin dans la fourche quand on touche « C\'est bon ! » compte comme oublié', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    for (const it of dirtOf(game).slice(0, 7)) tapItem(game, it);
    const last = dirtOf(game)[0];
    game.down({ x: last.x, y: last.y });
    expect(game.peek().left).toBe(1);
    press(ctx);
    expect(ctx.finished.msg).toBe(endMsg('low'));
    expect(ctx.finished.q).toBeLessThan(1);
  });
});

describe('curer : la fourche ne perd rien', () => {
  it('un 2e doigt pendant qu\'on tient un crottin ne le fait pas disparaître', () => {
    const ctx = fakeCtx({ seed: 4 });
    const game = chores.muckGame(ctx);
    const [A, B] = dirtOf(game);
    game.down({ x: A.x, y: A.y });
    game.down({ x: B.x, y: B.y }); // 2e doigt : ignoré
    game.up({ x: A.x, y: A.y }); // simple tape : A file dans la brouette
    tick(game, 30);
    expect(game.peek().inBin).toBe(1);
    expect(dirtOf(game).length).toBe(7); // B est toujours par terre
    while (dirtOf(game).length && !ctx.done) tapItem(game, dirtOf(game)[0]);
    expect(ctx.done).toBe(true); // la fin automatique arrive bien
    expect(ctx.finished.msg).toBe(endMsg('just'));
  });

  it('un crottin glissé puis lâché sous la scène reste visible, et on peut le reprendre', () => {
    const ctx = fakeCtx({ seed: 4 });
    const game = chores.muckGame(ctx);
    const A = dirtOf(game)[0];
    game.down({ x: A.x, y: A.y });
    game.move({ x: 200, y: 460 }, true); // le doigt sort par le bas (sur le bouton)
    game.up({ x: 200, y: 460 });
    const back = dirtOf(game).find((x) => x.y > 300);
    expect(back).toBeTruthy();
    expect(back.y).toBeLessThanOrEqual(ctx.view.y1 - 20); // dans la vue
    tapItem(game, back);
    expect(game.peek().inBin).toBe(1);
  });
});

describe('curer : la jauge dit vrai', () => {
  it('7 crottins + 1 touffe (8 objets dans la brouette) : PAS dans le vert', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    tapItem(game, tuftsOf(game)[0]);
    for (const it of dirtOf(game).slice(0, 7)) tapItem(game, it);
    expect(game.peek().inBin).toBe(8);
    expect(inGreen(ctx)).toBe(false);
    press(ctx);
    expect(ctx.finished.q).toBeLessThan(1);
  });

  it('à chaque coup : dans le vert ⇔ « C\'est bon ! » donnerait « juste »', () => {
    for (const seed of [2, 5, 9]) {
      const ctx = fakeCtx({ seed });
      const game = chores.muckGame(ctx);
      const r = makeRng(seed);
      for (let k = 0; k < 14 && !ctx.done; k++) {
        const pool = r() < 0.2 && tuftsOf(game).length ? tuftsOf(game) : dirtOf(game);
        if (!pool.length) break;
        tapItem(game, pool[Math.floor(r() * pool.length)]);
        if (ctx.done) break;
        const p = game.peek();
        expect(inGreen(ctx), `graine ${seed}, coup ${k}`).toBe(verdict(p.scored, p.lo, p.hi) === 'just');
      }
    }
  });

  it('la jauge monte avec chaque crottin ramassé', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    let prev = ctx.prog;
    for (const it of dirtOf(game).slice(0, 7)) {
      tapItem(game, it);
      expect(ctx.prog).toBeGreaterThan(prev);
      prev = ctx.prog;
    }
  });

  it('tout jeter (3 touffes) puis tout le crottin : fin tout seule, au plancher', () => {
    const ctx = fakeCtx();
    const game = chores.muckGame(ctx);
    for (const it of tuftsOf(game)) tapItem(game, it);
    while (dirtOf(game).length && !ctx.done) tapItem(game, dirtOf(game)[0]);
    expect(ctx.finished.msg).toBe(endMsg('high'));
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });
});

// ---------------------------------------------------------------- paille fraîche

describe('paille : une couche PARTOUT', () => {
  /** Des traits dans [x0, x1] seulement ; on reprend une brassée (doigt levé) quand les bras sont vides. */
  function playRegion(f0, f1, maxStrokes, stopInZone = true) {
    const ctx = fakeCtx({ seed: 3 });
    const game = chores.strawGame(ctx);
    const p = game.peek();
    const x0 = p.floor.x + 8 + (p.floor.w - 16) * f0;
    const x1 = p.floor.x + 8 + (p.floor.w - 16) * f1;
    for (let k = 0; k < maxStrokes && !ctx.done; k++) {
      if (game.peek().arm <= 0.05) { game.down({ x: p.bale.x + p.bale.w / 2, y: p.bale.y + p.bale.h / 2 }); game.up(); }
      stroke(game, x1, p.floor.y + 15 + (k % 8) * 30, x0, p.floor.y + 15 + (k % 8) * 30, 12);
      const q = game.peek();
      if (stopInZone && q.value >= q.lo) break;
    }
    return { ctx, game };
  }

  it('tout en tas sur un tiers du box : ni vert, ni « juste »', () => {
    const { ctx, game } = playRegion(0, 1 / 3, 40, false);
    const p = game.peek();
    expect(p.covered).toBeLessThan(0.4);
    expect(p.layers).toBeGreaterThan(0.85); // assez de paille… mais pas partout
    expect(inGreen(ctx)).toBe(false);
    press(ctx);
    expect(ctx.finished.msg).toBe(endMsg('low'));
    expect(ctx.finished.q).toBeLessThan(0.85);
  });

  it('même d\'énormes tas sur la moitié du box ne passent jamais par le vert', () => {
    const ctx = fakeCtx({ seed: 3 });
    const game = chores.strawGame(ctx);
    const p = game.peek();
    for (let k = 0; k < 60 && !ctx.done; k++) {
      if (game.peek().arm <= 0.05) { game.down({ x: p.bale.x + 30, y: p.bale.y + 30 }); game.up(); }
      const y = p.floor.y + 15 + (k % 8) * 30;
      stroke(game, p.floor.x + p.floor.w / 2, y, p.floor.x + 8, y, 12);
      expect(inGreen(ctx), `trait ${k}`).toBe(false);
    }
    expect(game.peek().layers).toBeGreaterThan(2); // de très gros tas
    press(ctx);
    expect(ctx.finished.msg).toBe(endMsg('low'));
  });

  it('des tas, puis le sol enfin couvert : « trop » (la jauge saute au-dessus du vert)', () => {
    const ctx = fakeCtx({ seed: 3 });
    const game = chores.strawGame(ctx);
    const p = game.peek();
    const row = (k, f1) => {
      if (game.peek().arm <= 0.05) { game.down({ x: p.bale.x + 30, y: p.bale.y + 30 }); game.up(); }
      const y = p.floor.y + 15 + (k % 8) * 30;
      stroke(game, p.floor.x + 8 + (p.floor.w - 16) * f1, y, p.floor.x + 8, y, 12);
    };
    for (let k = 0; k < 24; k++) row(k, 1 / 2); // des tas sur la moitié gauche
    expect(inGreen(ctx)).toBe(false);
    for (let k = 0; k < 8; k++) row(k, 1); // puis tout le box
    const q = game.peek();
    expect(q.covered).toBeGreaterThanOrEqual(0.85);
    expect(q.value).toBeGreaterThan(q.hi);
    press(ctx);
    expect(ctx.finished.msg).toBe(endMsg('high'));
    expect(ctx.finished.q).toBeLessThan(1);
  });

  it('sur tout le box : vert, et « juste »', () => {
    const { ctx, game } = playRegion(0, 1, 30);
    const p = game.peek();
    expect(p.covered).toBeGreaterThan(0.85);
    expect(inGreen(ctx)).toBe(true);
    press(ctx);
    expect(ctx.finished.msg).toBe(endMsg('just'));
    expect(ctx.finished.q).toBe(1);
  });

  it('la jauge ne fait que monter, et dans le vert ⇔ « juste »', () => {
    const ctx = fakeCtx({ seed: 4 });
    const game = chores.strawGame(ctx);
    const p = game.peek();
    const r = makeRng(11);
    let prev = 0;
    for (let k = 0; k < 40 && !ctx.done; k++) {
      if (game.peek().arm <= 0.05) { game.down({ x: p.bale.x + 30, y: p.bale.y + 30 }); game.up(); }
      const y0 = p.floor.y + 10 + r() * (p.floor.h - 20);
      stroke(game, p.floor.x + 10 + r() * 280, y0, p.floor.x + 10 + r() * 280, y0 + (r() - 0.5) * 60, 10);
      if (ctx.done) break;
      expect(ctx.prog).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = ctx.prog;
      const q = game.peek();
      expect(inGreen(ctx), `coup ${k}`).toBe(verdict(q.value, p.lo, p.hi) === 'just');
      if (inGreen(ctx)) expect(q.covered, `coup ${k}`).toBeGreaterThanOrEqual(0.85); // vert ⇒ couvert partout
    }
  });

  it('couvert partout, la valeur reste le nombre de couches (rien ne change pour un vrai tapis)', () => {
    const { game } = playRegion(0, 1, 16, false);
    const p = game.peek();
    expect(p.covered).toBe(1);
    expect(p.value).toBeCloseTo(p.layers, 9);
  });
});

// ---------------------------------------------------------------- balayer l'allée

describe('balayer : rien ne reste coincé sur le rebord de la pelle', () => {
  it('un brin poussé en biais tout en haut, dans la pelle, est compté', () => {
    const ctx = fakeCtx();
    const game = chores.sweepGame(ctx);
    const p0 = game.peek();
    // le brin le plus haut, poussé vers la droite ET vers le haut de l'allée
    const b = [...p0.bits].sort((u, v) => u.y - v.y)[0];
    stroke(game, b.x - 20, b.y + 10, p0.pan.x + 40, p0.aisle.y - 40, 30);
    const p = game.peek();
    const stuck = p.bits.filter((x) => x.x > p.pan.x + 10);
    expect(stuck).toEqual([]);
    expect(p.collected).toBeGreaterThan(0);
  });

  it('au bord de la zone : 42/46 → juste ; 41/46 → un peu moins, sans retomber à 1 à l\'arrondi', () => {
    const lo = 0.9;
    const hi = 1.1;
    expect(verdict(42 / 46, lo, hi)).toBe('just');
    expect(verdict(41 / 46, lo, hi)).toBe('low');
    const q = Math.round(justRight(41 / 46, lo, hi, { slack: 0.3 }) * 100) / 100;
    expect(q).toBeLessThan(1);
    expect(q).toBeGreaterThan(0.9);
  });
});

// ---------------------------------------------------------------- ranger le salon

describe('ranger : « trop » n\'existe pas, mais « mal fait » compte', () => {
  const drag = (game, it, x, y) => stroke(game, it.x, it.y, x, y, 8);

  it('tout sur le mauvais meuble → le plancher, « trop peu », jamais 0', () => {
    const ctx = fakeCtx();
    const game = chores.livingGame(ctx);
    const { shelf, chest } = game.peek().places;
    for (const it of [...game.peek().items]) {
      const pl = it.slot.y < 200 ? chest : shelf; // les livres dans le coffre, le reste sur l'étagère
      drag(game, it, pl.x + pl.w / 2, pl.y + pl.h / 2);
    }
    expect(game.peek().misplacedCount).toBeGreaterThan(4);
    press(ctx);
    expect(ctx.finished.msg).toBe(endMsg('low'));
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('toucher un objet sans le déplacer ne range ni ne dérange rien', () => {
    const ctx = fakeCtx();
    const game = chores.livingGame(ctx);
    const it = game.peek().items[0];
    game.down({ x: it.x, y: it.y });
    game.up({ x: it.x, y: it.y });
    expect(game.peek().value).toBe(0);
    expect(game.peek().misplacedCount).toBe(0);
  });

  it('la jauge dans le vert ⇔ tout est rangé', () => {
    const ctx = fakeCtx();
    const game = chores.livingGame(ctx);
    for (let i = 0; i < 8; i++) {
      const it = game.peek().items[0];
      drag(game, it, it.slot.x, it.slot.y);
      expect(inGreen(ctx)).toBe(game.peek().placed === 8);
    }
  });
});

// ---------------------------------------------------------------- la vaisselle

describe('vaisselle : le vert dure assez longtemps pour s\'arrêter à temps', () => {
  /** Des ronds de rayon r autour de l'assiette, 4 px par pas ; renvoie où on entre / sort du vert. */
  function circles(r, seed = 5, limit = 8000) {
    const ctx = fakeCtx({ seed });
    const game = chores.kitchenGame(ctx);
    const p0 = game.peek();
    let len = 0;
    let ang = 0;
    let inAt = null;
    let outAt = null;
    game.down({ x: p0.plate.x + r, y: p0.plate.y });
    while (len < limit && game.peek().phase === 'scrub') {
      ang += 4 / r;
      game.move({ x: p0.plate.x + Math.cos(ang) * r, y: p0.plate.y + Math.sin(ang) * r }, true);
      len += 4;
      const p = game.peek();
      if (inAt === null && p.value >= p.lo) inAt = len;
      if (outAt === null && p.value > p.hi) outAt = len;
    }
    return { inAt, outAt, sentAt: game.peek().phase === 'fly' ? len : null, ctx, game };
  }

  it.each([[18, 5], [25, 5], [25, 9], [18, 9]])('ronds de %i px (graine %i) : au moins un tour complet dans le vert, puis « trop », puis l\'envoi', (r, seed) => {
    const { inAt, outAt, sentAt } = circles(r, seed);
    expect(inAt).not.toBeNull();
    expect(outAt - inAt).toBeGreaterThanOrEqual(2 * Math.PI * r); // ≥ 1 tour (avant : ~120 px)
    expect(outAt - inAt).toBeGreaterThanOrEqual(300);
    expect(sentAt).not.toBeNull(); // frotter sans fin finit quand même par envoyer l'assiette
    expect(sentAt).toBeGreaterThan(outAt);
  });

  function scrubTo(game, ctx, cond, step = 1) {
    // de tout petits arcs (step px), pour s'arrêter au plus près
    const p0 = game.peek();
    let ang = 0;
    const r = 22;
    game.down({ x: p0.plate.x + r, y: p0.plate.y });
    for (let i = 0; i < 20000 && !cond(game.peek()); i++) {
      ang += step / r;
      game.move({ x: p0.plate.x + Math.cos(ang) * r, y: p0.plate.y + Math.sin(ang) * r }, true);
    }
    game.up();
  }
  const fly = (game) => { for (let i = 0; i < 60 && game.peek().phase === 'fly'; i++) game.update(1 / 30); };

  it('quatre assiettes justes + une à peine sale : moins de 1 (pas arrondi à 1), « trop peu »', () => {
    const ctx = fakeCtx({ seed: 5 });
    const game = chores.kitchenGame(ctx);
    for (let n = 0; n < 5; n++) {
      if (n < 4) scrubTo(game, ctx, (p) => p.value >= 1);
      else scrubTo(game, ctx, (p) => p.value >= 0.895, 0.2);
      if (n === 4) {
        const v = game.peek().value;
        expect(v).toBeLessThan(0.9); // à peine sale
        expect(justRight(v, 0.9, 1.15)).toBeGreaterThan(0.975);
      }
      press(ctx);
      fly(game);
    }
    const plates = game.peek().plates;
    const mean = plates.map((v) => justRight(v, 0.9, 1.15)).reduce((s, x) => s + x, 0) / 5;
    expect(Math.round(mean * 100) / 100).toBe(1); // l'arrondi du cadre en faisait 1
    expect(ctx.finished.q).toBe(0.99);
    expect(ctx.finished.msg).toBe(endMsg('low'));
  });

  it('ne jamais s\'arrêter : chaque assiette part toute seule, au plancher, « trop »', () => {
    const ctx = fakeCtx({ seed: 9 });
    const game = chores.kitchenGame(ctx);
    for (let n = 0; n < 5 && !ctx.done; n++) {
      scrubTo(game, ctx, (p) => p.phase !== 'scrub', 4);
      fly(game);
    }
    expect(ctx.done).toBe(true);
    expect(game.peek().plates.every((v) => v >= 1.6)).toBe(true);
    expect(ctx.finished.msg).toBe(endMsg('high'));
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });
});

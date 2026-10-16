// « Juste ce qu'il faut » dans les mini-jeux du groupe nettoyage-cheval : nettoyer (soin : box du
// cheval, étable de la vache, clapier du lapin, litière du chat), longe et liberté.
//
// Pour chaque jeu : la zone verte est posée dès le début, le bouton « C'est bon ! » existe quand
// l'enfant décide quand s'arrêter, juste = plein score (q = 1, trois étoiles), trop peu OU trop =
// moins (q < 1, jamais sous le plancher de 0,4), et le message de fin dit pourquoi.
// On vérifie aussi que rien n'est dessiné hors des 400 × 360 du cadre : sur un téléphone en
// portrait, la largeur visible est exactement 400 (la brouette coupée à droite), en paysage la
// hauteur visible est exactement 360.
//
// Sans DOM ni canvas : un faux ctx remplace le cadre (src/ui/minigames.js) et un faux contexte 2D
// mesure ce qui est dessiné.

import { describe, it, expect, beforeAll, afterEach } from 'vitest';
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

/** Le cadre, en faux : mêmes méthodes que le ctx de minigames.js (messages de fin compris), sans DOM. */
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
    rng: makeRng(o.seed ?? 7),
    time: 0,
    done: false,
    pointer: { x: 0, y: 0, down: false, over: false, type: 'mouse' },
    t: o.t ?? t,
    name: a?.name ?? '',
    hints: [],
    zones: [],
    buttons: [],
    row,
    prog: 0,
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
      if (this.done) return;
      this.done = true;
      const qq = Math.round(Math.max(0.4, Math.min(1, q)) * 100) / 100;
      this.finished = { q: qq, msg, stars: stars(qq) };
    },
    zone(lo, hi) { this.zones.push({ lo, hi }); return { lo, hi }; },
    finishJust(value, lo, hi, opts = {}) {
      const q = justRight(value, lo, hi, { floor: opts.floor, slack: opts.slack });
      const v = verdict(value, lo, hi);
      const name = typeof opts.who === 'string' ? opts.who : opts.who?.name ?? this.name;
      const key = v === 'just' ? 'justRight' : v === 'low' ? 'tooLittle' : 'tooMuch';
      const msg = opts.msgs?.[v] ?? (name ? t(`mg_${key}`, { name }) : t(`mg_chore_${key}`));
      this.finish(q, msg);
      this.finished.verdict = v;
      this.finished.value = value;
      return { q, verdict: v };
    },
    stopButton(onStop, label = t('mg_stopHere')) { return this.button(`✅ ${label}`, { cls: 'stop primary', onTap: onStop }); },
  };
  return ctx;
}

const stopOf = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop'));
const press = (ctx) => stopOf(ctx).opts.onTap();
/** Un trait du doigt (appuyé) de (x0, y0) à (x1, y1), en n étapes. */
function stroke(game, x0, y0, x1, y1, n = 12) {
  game.down?.({ x: x0, y: y0, type: 'touch' });
  for (let i = 1; i <= n; i++) game.move?.({ x: x0 + ((x1 - x0) * i) / n, y: y0 + ((y1 - y0) * i) / n, type: 'touch' }, true);
  game.up?.({ x: x1, y: y1, type: 'touch' });
}

/** La note que le cadre garde pour une valeur : justRight, plancher 0,4, arrondie au centième. */
const noteOf = (value, lo, hi) => Math.round(Math.max(0.4, Math.min(1, justRight(value, lo, hi))) * 100) / 100;

/** Le message de fin attendu pour un verdict (avec le prénom de l'animal). */
const endMsg = (v, name) => t(`mg_${v === 'just' ? 'justRight' : v === 'low' ? 'tooLittle' : 'tooMuch'}`, { name });

/** Vérifie la note et le message d'une fin « juste ce qu'il faut ». */
function expectVerdict(ctx, v, name) {
  expect(ctx.done).toBe(true);
  expect(ctx.finished.verdict, `valeur ${ctx.finished.value}`).toBe(v);
  expect(ctx.finished.msg).toBe(endMsg(v, name));
  if (v === 'just') {
    expect(ctx.finished.q).toBe(1);
    expect(ctx.finished.stars).toBe(3);
  } else {
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.q).toBeGreaterThanOrEqual(JUST_FLOOR);
  }
}

// ------------------------------------------------------------------ faux contexte 2D qui mesure

/**
 * Contexte 2D qui ne dessine rien mais note tout ce qui sort de [0, W] × [0, H] (transformations,
 * épaisseur des traits et textes compris, à `tol` près). Les arcs sont échantillonnés, les ellipses
 * et courbes comptées large (cercle englobant, points de contrôle).
 */
function boundsRecorder(tol = 2) {
  let m = [1, 0, 0, 1, 0, 0];
  const stack = [];
  let pts = [];
  const out = [];
  const mul = (a, b) => [
    a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
  ];
  const P = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  const k = () => Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const add = (x, y, r = 0) => { const [X, Y] = P(x, y); const R = r * k(); pts.push([X - R, Y - R, X + R, Y + R]); };
  const check = (what, [x0, y0, x1, y1]) => {
    if (x0 < -tol || y0 < -tol || x1 > W + tol || y1 > H + tol) out.push({ what, x0: Math.round(x0), y0: Math.round(y0), x1: Math.round(x1), y1: Math.round(y1) });
  };
  const commit = (what, pad = 0) => { for (const [a, b, c, d] of pts) check(what, [a - pad, b - pad, c + pad, d + pad]); };
  const corners = (x, y, w, h) => [P(x, y), P(x + w, y), P(x, y + h), P(x + w, y + h)];
  const boxOf = (cs, pad = 0) => [Math.min(...cs.map((c) => c[0])) - pad, Math.min(...cs.map((c) => c[1])) - pad, Math.max(...cs.map((c) => c[0])) + pad, Math.max(...cs.map((c) => c[1])) + pad];
  const size = (g) => +(/(\d+(?:\.\d+)?)px/.exec(g.font)?.[1] ?? 10);
  const textW = (g, s) => ([...s].length <= 2 && /\p{Extended_Pictographic}/u.test(s) ? size(g) : s.length * size(g) * 0.56);
  const text = (g, s, x, y, what) => {
    const w = textW(g, s);
    const h = size(g);
    const xa = g.textAlign === 'center' ? x - w / 2 : g.textAlign === 'right' || g.textAlign === 'end' ? x - w : x;
    const ya = g.textBaseline === 'middle' ? y - h / 2 : y - h;
    check(`${what} « ${s} »`, boxOf(corners(xa, ya, w, h)));
  };
  const g = {
    out,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '10px sans-serif', textAlign: 'start', textBaseline: 'alphabetic',
    globalAlpha: 1, lineCap: 'butt', lineJoin: 'miter',
    save() { stack.push({ m: [...m], lineWidth: this.lineWidth, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline }); },
    restore() { const s = stack.pop(); if (s) { m = s.m; Object.assign(this, { lineWidth: s.lineWidth, font: s.font, textAlign: s.textAlign, textBaseline: s.textBaseline }); } },
    translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); },
    rotate(a) { const c = Math.cos(a); const s = Math.sin(a); m = mul(m, [c, s, -s, c, 0, 0]); },
    scale(x, y) { m = mul(m, [x, 0, 0, y, 0, 0]); },
    setTransform(a, b, c, d, e, f) { m = [a, b, c, d, e, f]; },
    resetTransform() { m = [1, 0, 0, 1, 0, 0]; },
    beginPath() { pts = []; },
    closePath() {},
    moveTo(x, y) { add(x, y); },
    lineTo(x, y) { add(x, y); },
    quadraticCurveTo(cx, cy, x, y) { add(cx, cy); add(x, y); },
    bezierCurveTo(ax, ay, bx, by, x, y) { add(ax, ay); add(bx, by); add(x, y); },
    arc(x, y, r, a0, a1, ccw = false) {
      if (Math.abs(a1 - a0) >= Math.PI * 2 - 1e-9) return add(x, y, r);
      let sw = ccw ? a0 - a1 : a1 - a0;
      sw = ((sw % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      for (let i = 0; i <= 32; i++) {
        const a = a0 + (ccw ? -1 : 1) * sw * (i / 32);
        add(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
    },
    ellipse(x, y, rx, ry) { add(x, y, Math.max(rx, ry)); },
    rect(x, y, w, h) { add(x, y); add(x + w, y + h); add(x + w, y); add(x, y + h); },
    roundRect(x, y, w, h) { this.rect(x, y, w, h); },
    fill() { commit(`fill ${this.fillStyle}`); },
    stroke() { commit(`stroke ${this.strokeStyle}`, (this.lineWidth / 2) * k()); },
    clip() {},
    fillRect(x, y, w, h) { check(`fillRect ${this.fillStyle}`, boxOf(corners(x, y, w, h))); },
    strokeRect(x, y, w, h) { check(`strokeRect ${this.strokeStyle}`, boxOf(corners(x, y, w, h), (this.lineWidth / 2) * k())); },
    fillText(s, x, y) { text(this, String(s), x, y, 'texte'); },
    strokeText(s, x, y) { text(this, String(s), x, y, 'contour'); },
    measureText(s) { return { width: textW(this, String(s)) }; },
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    setLineDash() {},
    drawImage() {},
  };
  return g;
}

/** Dessine une image du jeu et renvoie ce qui sort du cadre (liste vide = tout tient). */
function overflow(game) {
  const g = boundsRecorder();
  game.draw(g);
  return g.out;
}

// ------------------------------------------------------------------ nettoyer (soin)

const ANIMALS = {
  horse: { id: 'h1', name: 'Pomme', species: 'horse', personality: 'calm', look: { seed: 3 } },
  cow: { id: 'c1', name: 'Marguerite', species: 'cow', look: { seed: 4 } },
  rabbit: { id: 'r1', name: 'Noisette', species: 'rabbit', look: { seed: 5 } },
  cat: { id: 'k1', name: 'Minou', species: 'cat', look: { seed: 6 } },
};

/** Met toutes les saletés dans le bac (tape sur chacune, puis la laisse voler jusqu'au bac). */
function pickAll(game, ctx) {
  for (let i = 0; i < 20 && !ctx.done; i++) {
    const it = game.peek().items.find((x) => !x.good);
    if (!it) break;
    game.down({ x: it.x, y: it.y, type: 'touch' });
    game.up({ x: it.x, y: it.y, type: 'touch' });
    for (let k = 0; k < 30; k++) game.update(1 / 30);
  }
}
/** Les rangées de cases du sol (une brassée par rangée = une couche partout). */
const rowYs = (f) => { const ys = []; for (let y = f.y + 18; y < f.y + f.h; y += 36) ys.push(y); return ys; };
/** Une brassée par rangée (ou sur une partie seulement). */
function spreadRows(game, ys, { half = false } = {}) {
  const f = game.peek().floor;
  for (const y of ys) stroke(game, f.x + 10, y, f.x + (half ? f.w / 2 : f.w - 10), y);
}

describe.each(Object.keys(ANIMALS))('nettoyer (%s) : une couche de propre partout, ni clairsemée ni en tas', (species) => {
  const a = ANIMALS[species];
  const start = () => { const ctx = fakeCtx(a); const game = clean.cleanGame(ctx); return { ctx, game }; };

  it('zone verte posée dès le début, sur la part de jauge de l\'étape « étaler »', () => {
    const { ctx, game } = start();
    const p = game.peek();
    expect(p.phase).toBe('pick');
    expect(ctx.zones.length).toBe(1);
    const Z = clean.SPREAD_ZONE;
    // La jauge : 35 % pour ramasser, puis 65 % pour étaler jusqu'à Z.max.
    expect(ctx.zones[0].lo).toBeCloseTo(0.35 + 0.65 * (Z.lo / Z.max), 6);
    expect(ctx.zones[0].hi).toBeCloseTo(0.35 + 0.65 * (Z.hi / Z.max), 6);
    expect(p.lo).toBe(Z.lo);
    expect(p.hi).toBe(Z.hi);
  });

  it('« C\'est bon ! » n\'apparaît qu\'à l\'étape « étaler », et c\'est lui qui termine', () => {
    const { ctx, game } = start();
    expect(stopOf(ctx)).toBeFalsy();
    pickAll(game, ctx);
    expect(game.peek().phase).toBe('spread');
    expect(ctx.done).toBe(false); // ramasser ne termine pas le soin
    expect(stopOf(ctx)).toBeTruthy();
    spreadRows(game, rowYs(game.peek().floor));
    expect(ctx.done).toBe(false); // une couche partout : on attend « C'est bon ! »
    press(ctx);
    expect(ctx.done).toBe(true);
  });

  it('juste : une couche partout → tous les points', () => {
    const { ctx, game } = start();
    pickAll(game, ctx);
    spreadRows(game, rowYs(game.peek().floor));
    press(ctx);
    expectVerdict(ctx, 'just', a.name);
  });

  it('trop peu : quelques brassées seulement → moins de points (et « trop peu »)', () => {
    const { ctx, game } = start();
    pickAll(game, ctx);
    spreadRows(game, rowYs(game.peek().floor).slice(0, 2), { half: true });
    press(ctx);
    expectVerdict(ctx, 'low', a.name);
  });

  it('trop : des tas (rangées en double) → moins de points (et « trop »)', () => {
    const { ctx, game } = start();
    pickAll(game, ctx);
    const ys = rowYs(game.peek().floor);
    spreadRows(game, ys);
    spreadRows(game, ys.slice(0, 3));
    expect(ctx.done).toBe(false);
    press(ctx);
    expectVerdict(ctx, 'high', a.name);
  });

  it('beaucoup trop : des tas partout, le jeu s\'arrête tout seul (trop), jamais à 0', () => {
    const { ctx, game } = start();
    pickAll(game, ctx);
    const ys = rowYs(game.peek().floor);
    for (let i = 0; i < 3 && !ctx.done; i++) spreadRows(game, ys);
    expectVerdict(ctx, 'high', a.name);
    expect(ctx.finished.value).toBeGreaterThanOrEqual(clean.SPREAD_ZONE.max);
  });

  it('s\'arrêter tout de suite (rien d\'étalé) : le plancher, pas zéro', () => {
    const { ctx, game } = start();
    pickAll(game, ctx);
    press(ctx);
    expectVerdict(ctx, 'low', a.name);
    expect(ctx.finished.q).toBe(JUST_FLOOR);
    expect(ctx.finished.stars).toBe(1);
  });

  it('la note suit la règle commune, symétrique des deux côtés de la zone', () => {
    const Z = clean.SPREAD_ZONE;
    const d = 0.2;
    expect(justRight(Z.lo - d, Z.lo, Z.hi)).toBeCloseTo(justRight(Z.hi + d, Z.lo, Z.hi), 9);
    const { ctx, game } = start();
    pickAll(game, ctx);
    spreadRows(game, rowYs(game.peek().floor).slice(0, 4));
    press(ctx);
    expect(ctx.finished.q).toBe(noteOf(ctx.finished.value, Z.lo, Z.hi));
  });

  it('rien n\'est dessiné hors du cadre 400 × 360 (bac, animal, jauge au mur…)', () => {
    const { ctx, game } = start();
    expect(overflow(game)).toEqual([]);
    const p = game.peek();
    expect(p.bin.right).toBeLessThanOrEqual(W);
    expect(p.bin.left).toBeGreaterThan(p.floor.x + p.floor.w - 30); // le bac ne cache presque pas le sol
    // une saleté tenue au doigt, puis en vol vers le bac
    const it = p.items[0];
    game.down({ x: it.x, y: it.y, type: 'touch' });
    game.move({ x: it.x + 5, y: it.y + 5, type: 'touch' }, true);
    expect(overflow(game)).toEqual([]);
    game.up({ x: it.x + 5, y: it.y + 5, type: 'touch' });
    for (let k = 0; k < 6; k++) { game.update(1 / 30); expect(overflow(game)).toEqual([]); }
    pickAll(game, ctx);
    expect(overflow(game)).toEqual([]); // étape « étaler » : jauge au mur
    const ys = rowYs(game.peek().floor);
    spreadRows(game, ys);
    spreadRows(game, ys.slice(0, 3));
    expect(overflow(game)).toEqual([]); // avec des tas
  });
});

describe('nettoyer : la consigne parle du bon bac', () => {
  it('chat : la consigne de la litière ; cheval : celle de la brouette', () => {
    const ctxCat = fakeCtx(ANIMALS.cat);
    clean.cleanGame(ctxCat);
    expect(ctxCat.hints[0].text).toBe(t('mg_clean_hint_cat'));
    const ctxHorse = fakeCtx(ANIMALS.horse);
    clean.cleanGame(ctxHorse);
    expect(ctxHorse.hints[0].text).toBe(t('mg_clean_hint'));
  });

  it('lapin : la consigne du clapier (mg_clean_hint_rabbit : le seau) dès qu\'elle existe, sinon la commune', () => {
    const tt = (k, p) => (k === 'mg_clean_hint_rabbit' ? 'Mets les crottes dans le seau.' : t(k, p));
    const ctx = fakeCtx(ANIMALS.rabbit, { t: tt });
    clean.cleanGame(ctx);
    expect(ctx.hints[0].text).toBe('Mets les crottes dans le seau.');
    const ctx2 = fakeCtx(ANIMALS.rabbit);
    clean.cleanGame(ctx2);
    expect(ctx2.hints[0].text).not.toMatch(/^mg_/); // jamais une clé brute à l'écran
  });

  it('chaque bac tient dans les 400 px de large', () => {
    for (const [kind, b] of Object.entries(clean.BINS)) expect(b.x + b.right, kind).toBeLessThanOrEqual(W);
  });
});

// ------------------------------------------------------------------ longe

/** Tient l'allure demandée (touches ↑ / ↓) jusqu'à ce que cond(peek) soit vraie. */
function lungeUntil(game, ctx, cond, maxSteps = 6000) {
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

describe('longe : le travail juste (secondes à la bonne allure)', () => {
  const a = ANIMALS.horse;
  const start = () => { const ctx = fakeCtx(a); const game = horse.lungeGame(ctx); return { ctx, game }; };

  it('zone verte dès le début (à sa place sur la jauge), Doucement / Allez ! / C\'est bon !', () => {
    const { ctx, game } = start();
    const p = game.peek();
    expect(p.value).toBe(0);
    expect(ctx.zones).toEqual([{ lo: p.lo / p.max, hi: p.hi / p.max }]);
    expect(p.lo).toBeLessThan(p.hi);
    expect(p.hi).toBeLessThan(p.max);
    expect(ctx.buttons.map((b) => b.opts.cls)).toEqual(['mg-half', 'mg-half primary', 'stop primary']);
  });

  for (const [where, v] of [['juste', 'just'], ['trop peu', 'low'], ['trop', 'high']]) {
    it(`${where} : « C'est bon ! » termine, ${v === 'just' ? 'tous les points' : 'moins de points'}`, () => {
      const { ctx, game } = start();
      const p0 = game.peek();
      const target = v === 'just' ? (p0.lo + p0.hi) / 2 : v === 'low' ? p0.lo - 4 : p0.hi + 3;
      lungeUntil(game, ctx, (q) => q.value >= target);
      expect(ctx.done).toBe(false);
      press(ctx);
      expectVerdict(ctx, v, a.name);
      expect(ctx.finished.q).toBe(noteOf(ctx.finished.value, p0.lo, p0.hi));
    });
  }

  it('s\'arrêter tout de suite : le plancher (trop peu), pas zéro', () => {
    const { ctx } = start();
    press(ctx);
    expectVerdict(ctx, 'low', a.name);
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('le cheval n\'en peut plus : le jeu s\'arrête tout seul (trop)', () => {
    const { ctx, game } = start();
    lungeUntil(game, ctx, () => false, 9000);
    expectVerdict(ctx, 'high', a.name);
    expect(ctx.finished.value).toBeGreaterThanOrEqual(game.peek().max);
  });

  it('toucher la jauge des allures ne change pas la vitesse ; le centre ralentit, le bord accélère', () => {
    const { game } = start();
    const v0 = game.peek().v;
    game.down({ x: 200, y: horse.GAIT_GAUGE.top + 10, type: 'touch' });
    expect(game.peek().v).toBe(v0);
    game.down({ x: 200, y: 158, type: 'touch' });
    expect(game.peek().v).toBeLessThan(v0);
    const v1 = game.peek().v;
    game.down({ x: 330, y: 158, type: 'touch' });
    expect(game.peek().v).toBeGreaterThan(v1);
  });

  it('l\'anneau du travail tient dans le cadre et ne passe pas sous la jauge des allures', () => {
    const R = horse.WORK_RING;
    const G = horse.GAIT_GAUGE;
    const out = R.r + R.width / 2;
    expect(R.y + out).toBeLessThanOrEqual(G.top);
    expect(R.y - out).toBeGreaterThanOrEqual(0);
    expect(R.x - out).toBeGreaterThanOrEqual(0);
    expect(R.x + out).toBeLessThanOrEqual(W);
    expect(G.bottom).toBeLessThanOrEqual(H);
  });

  it('rien n\'est dessiné hors du cadre, sur tout un tour et à la fin', () => {
    const { ctx, game } = start();
    for (let i = 0; i < 90; i++) {
      game.key('ArrowUp', true);
      for (let k = 0; k < 4; k++) game.update(1 / 30);
      expect(overflow(game)).toEqual([]);
    }
    press(ctx);
    for (let k = 0; k < 10; k++) game.update(1 / 30);
    expect(overflow(game)).toEqual([]);
  });

  describe('« C\'est bon ! » sur sa propre ligne en portrait', () => {
    const saved = globalThis.matchMedia;
    afterEach(() => { globalThis.matchMedia = saved; });
    /** Faux matchMedia : on bascule portrait / paysage à la main. */
    function fakeMedia(matches) {
      const mq = { matches, fns: new Set(), addEventListener(_, f) { this.fns.add(f); }, removeEventListener(_, f) { this.fns.delete(f); } };
      globalThis.matchMedia = (q) => { mq.query = q; return mq; };
      return mq;
    }

    it('téléphone en portrait : la rangée passe à la ligne, « C\'est bon ! » prend toute la largeur', () => {
      const mq = fakeMedia(true);
      const { ctx, game } = start();
      expect(mq.query).toMatch(/portrait/);
      expect(ctx.row.style.flexWrap).toBe('wrap');
      expect(stopOf(ctx).style.flexBasis).toBe('100%');
      expect(ctx.buttons.filter((b) => !b.opts.cls.includes('stop')).every((b) => !b.style.flexBasis)).toBe(true);
      // On tourne le téléphone : une seule ligne.
      mq.matches = false;
      mq.fns.forEach((f) => f());
      expect(ctx.row.style.flexWrap).toBe('');
      expect(stopOf(ctx).style.flexBasis).toBe('');
      game.destroy();
      expect(mq.fns.size).toBe(0);
    });

    it('paysage ou grand écran : les trois boutons restent sur une ligne', () => {
      fakeMedia(false);
      const { ctx } = start();
      expect(ctx.row.style.flexWrap ?? '').toBe('');
      expect(stopOf(ctx).style.flexBasis ?? '').toBe('');
    });
  });
});

// ------------------------------------------------------------------ liberté

const C = { x: 200, y: 158 };
/** Se place derrière le cheval (angle phi, rayon rho) jusqu'à ce que cond(peek) soit vraie. */
function followUntil(game, ctx, cond, { phi = 0.5, rho = 85 } = {}, maxSteps = 4000) {
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
/** Le cheval vient vers l'enfant : la fin arrive quand il l'a rejoint. */
const finishJoin = (game, ctx) => { for (let i = 0; i < 300 && !ctx.done; i++) game.update(1 / 30); };

describe('liberté : la pression juste (secondes où le cheval avance)', () => {
  const a = ANIMALS.horse;
  const start = () => { const ctx = fakeCtx(a); const game = horse.libertyGame(ctx); return { ctx, game }; };

  it('zone verte dès le début (à sa place sur la jauge) et bouton « C\'est bon ! »', () => {
    const { ctx, game } = start();
    const p = game.peek();
    expect(p.value).toBe(0);
    expect(ctx.zones).toEqual([{ lo: p.lo / p.max, hi: p.hi / p.max }]);
    expect(stopOf(ctx)).toBeTruthy();
    expect(ctx.buttons.length).toBe(1);
  });

  it('juste, avec « C\'est bon ! » : le cheval vient, tous les points ; le bouton ne resservira pas', () => {
    const { ctx, game } = start();
    followUntil(game, ctx, (q) => q.value >= (q.lo + q.hi) / 2);
    press(ctx);
    expect(game.peek().phase).toBe('join');
    expect(stopOf(ctx).disabled).toBe(true);
    expect(ctx.done).toBe(false); // la fin arrive quand il t'a rejoint
    finishJoin(game, ctx);
    expectVerdict(ctx, 'just', a.name);
  });

  it('juste, en touchant le cheval quand la jauge est dans le vert : tous les points', () => {
    const { ctx, game } = start();
    const p = followUntil(game, ctx, (q) => q.value >= q.lo + 0.5);
    game.down({ x: p.horse.x, y: p.horse.y, type: 'touch' });
    expect(game.peek().phase).toBe('join');
    finishJoin(game, ctx);
    expectVerdict(ctx, 'just', a.name);
  });

  it('trop peu : on l\'appelle trop tôt → moins de points', () => {
    const { ctx, game } = start();
    followUntil(game, ctx, (q) => q.value >= 4);
    press(ctx);
    finishJoin(game, ctx);
    expectVerdict(ctx, 'low', a.name);
  });

  it('trop : on le fait trop travailler avant de l\'appeler → moins de points', () => {
    const { ctx, game } = start();
    followUntil(game, ctx, (q) => q.value >= q.hi + 2);
    press(ctx);
    finishJoin(game, ctx);
    expectVerdict(ctx, 'high', a.name);
  });

  it('épuisé : il s\'arrête et vient tout seul (trop), jamais à 0', () => {
    const { ctx, game } = start();
    followUntil(game, ctx, (q) => q.phase !== 'drive', { phi: 0.3, rho: 96 });
    finishJoin(game, ctx);
    expectVerdict(ctx, 'high', a.name);
  });

  it('s\'arrêter tout de suite : le plancher (trop peu), pas zéro', () => {
    const { ctx, game } = start();
    press(ctx);
    finishJoin(game, ctx);
    expectVerdict(ctx, 'low', a.name);
    expect(ctx.finished.q).toBe(JUST_FLOOR);
  });

  it('toucher le cheval avant la zone verte ne l\'appelle pas (on se place, c\'est tout)', () => {
    const { game } = start();
    const p = game.peek();
    game.down({ x: p.horse.x, y: p.horse.y, type: 'touch' });
    expect(game.peek().phase).toBe('drive');
  });

  it('rien n\'est dessiné hors du cadre, en le faisant avancer puis quand il vient', () => {
    const { ctx, game } = start();
    for (let i = 0; i < 40; i++) {
      followUntil(game, ctx, () => false, {}, 8);
      expect(overflow(game)).toEqual([]);
    }
    press(ctx);
    for (let i = 0; i < 40 && !ctx.done; i++) {
      game.update(1 / 15);
      expect(overflow(game)).toEqual([]);
    }
  });
});

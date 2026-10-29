// Brider son cheval (src/ui/minigames/bridle.js) : le mors par le coin des lèvres (pas devant les dents), la
// têtière derrière une oreille puis l'autre, la sous-gorge avec un poing de place. Faux cadre, sans DOM.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeRng } from '../src/ui/minigames/draw.js';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';

let t;
let br;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  br = await import('../src/ui/minigames/bridle.js');
});

const horse = () => {
  const a = createAnimal({ species: 'horse', sex: 'f', ageDays: 2000, rng: seeded('filet') });
  a.name = 'Étoile';
  return a;
};

function fakeCtx(a, opts = {}) {
  const noop = () => {};
  return {
    a, t, name: a.name, W: 400, H: 360, time: 0, done: false, rng: makeRng(4), opts,
    view: { x0: 0, y0: 0, x1: 400, y1: 360, w: 400, h: 360, scale: 1, ox: 0, oy: 0 },
    col: { coat: '#8a5a2b', mane: '#222' }, fx: { float: noop, text: noop, burst: noop },
    hints: [], buttons: [], finished: null,
    hint(text, kind = '') { this.hints.push({ text, kind }); }, progress() {}, zone() {},
    button(text, opts = {}) { const b = { text, opts }; this.buttons.push(b); return b; },
    finish(q, msg, why) {
      if (this.done) return;
      this.done = true;
      this.finished = { q: Math.round(Math.max(0.4, Math.min(1, q)) * 100) / 100, msg, why };
    },
    stopButton(onStop) { return this.button('✅', { cls: 'stop primary', onTap: onStop }); },
  };
}
const press = (ctx) => ctx.buttons.find((b) => b.opts.cls?.includes('stop')).opts.onTap();
const holdBtn = (ctx) => ctx.buttons.find((b) => b.opts.hold);
const tick = (g, ctx, s) => { for (let k = 0; k < Math.round(s / 0.05); k++) { ctx.time += 0.05; g.update(0.05); } };
const tap = (g, p) => { g.down(p); g.up(p); };
/** Le mors (par le coin des lèvres) et les deux oreilles, puis la pause. */
function bitAndEars(g, ctx) {
  tap(g, g.peek().bar);
  tick(g, ctx, 1.2);
  for (const e of g.peek().ears) tap(g, e);
  tick(g, ctx, 1.2);
}
/** Serrer la sous-gorge en gardant le doigt sur 🪢 pendant s secondes. */
const tighten = (g, ctx, s) => {
  holdBtn(ctx).opts.onDown();
  tick(g, ctx, s);
  holdBtn(ctx).opts.onUp();
};

describe('brider son cheval', () => {
  it('par le coin des lèvres, une oreille puis l\'autre, un poing de place : trois étoiles', () => {
    const ctx = fakeCtx(horse());
    const g = br.bridleGame(ctx);
    expect(g.peek().step).toBe('bit');
    tap(g, g.peek().bar);
    expect(g.peek().bitIn).toBe(true);
    tick(g, ctx, 1.2);
    expect(g.peek().step).toBe('ears');
    const [near, far] = g.peek().ears;
    tap(g, near);
    expect(g.peek().earDone).toEqual([true, false]);
    tap(g, near); // (la même oreille, déjà passée : c'est l'autre, juste à côté)
    expect(g.peek().earDone).toEqual([true, true]);
    tap(g, far); // (rien de plus)
    tick(g, ctx, 1.2);
    expect(g.peek().step).toBe('throat');
    expect(holdBtn(ctx)).toBeTruthy();
    const { lo, hi } = br.BRIDLE.throat;
    tighten(g, ctx, ((lo + hi) / 2) / br.BRIDLE.throat.rate);
    const v = g.peek().throat;
    expect(v).toBeGreaterThanOrEqual(lo);
    expect(v).toBeLessThanOrEqual(hi);
    expect(ctx.hints.at(-1)).toEqual({ text: t('mg_pressStop'), kind: 'good' });
    press(ctx);
    expect(ctx.finished).toEqual({ q: 1, msg: t('mg_bridle_end'), why: 'just' });
  });

  it('devant ses dents d\'abord : il relève la tête, et moins d\'étoiles', () => {
    const ctx = fakeCtx(horse());
    const g = br.bridleGame(ctx);
    tap(g, g.peek().teeth);
    expect(g.peek().annoyed).toBeGreaterThan(0);
    expect(g.peek().bitIn).toBe(false);
    expect(ctx.hints.at(-1)).toEqual({ text: t('mg_deworm_teeth', { name: 'Étoile', g: 'f' }), kind: 'warn' });
    tick(g, ctx, 1.2);
    bitAndEars(g, ctx);
    tighten(g, ctx, 0.68 / br.BRIDLE.throat.rate);
    press(ctx);
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.q).toBeGreaterThanOrEqual(0.9);
    expect(ctx.finished.msg).toBe(t('mg_deworm_teeth', { name: 'Étoile', g: 'f' }));
  });

  it('sous-gorge serrée trop longtemps : trop serrée, il couche les oreilles', () => {
    const ctx = fakeCtx(horse());
    const g = br.bridleGame(ctx);
    bitAndEars(g, ctx);
    tighten(g, ctx, 4);
    expect(g.peek().throat).toBeGreaterThan(br.BRIDLE.throat.hi);
    expect(ctx.hints.some((h) => h.text === t('mg_bridle_tight', { name: 'Étoile', g: 'f' }))).toBe(true);
    press(ctx);
    expect(ctx.finished.why).toBe('high');
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.msg).toBe(t('mg_bridle_tight', { name: 'Étoile', g: 'f' }));
  });

  it('✅ avant la sous-gorge : on redit quoi faire, sans finir', () => {
    const ctx = fakeCtx(horse());
    const g = br.bridleGame(ctx);
    press(ctx);
    expect(ctx.done).toBe(false);
    expect(ctx.hints.at(-1)).toEqual({ text: t('mg_bridle_bit', { name: 'Étoile', g: 'f' }), kind: 'warn' });
    expect(ctx.hints.at(-1).text).toMatch(/elle ouvre/); // (une jument)
  });

  it('« ⏩ Brider vite » (après trois filets mis) : fini tout de suite, trois étoiles', () => {
    const plain = fakeCtx(horse());
    br.bridleGame(plain);
    expect(plain.buttons.some((b) => b.text === t('mg_bridle_quick'))).toBe(false);
    const ctx = fakeCtx(horse(), { quick: true });
    br.bridleGame(ctx);
    ctx.buttons.find((b) => b.text === t('mg_bridle_quick')).opts.onTap();
    expect(ctx.finished).toEqual({ q: 1, msg: t('mg_bridle_end'), why: 'just' });
  });

  it('les zones : le coin des lèvres, les dents ; la sous-gorge juste, lâche, trop serrée', async () => {
    const { bar, teeth } = (await import('../src/ui/minigames/deworm.js')).MOUTH;
    expect(br.bitTap(bar)).toBe('bar');
    expect(br.bitTap({ x: bar.x + 20, y: bar.y + 10 })).toBe('bar');
    expect(br.bitTap(teeth)).toBe('teeth');
    expect(br.bitTap({ x: teeth.x - 25, y: teeth.y })).toBe('teeth');
    expect(br.bitTap({ x: 300, y: 60 })).toBe('miss');
    expect(br.bitTap({ x: 0, y: 0 }, { bar: { x: 0, y: 0 }, teeth: { x: 100, y: 100 } })).toBe('bar');
    const { lo, hi } = br.BRIDLE.throat;
    expect(br.throatVerdict((lo + hi) / 2)).toEqual({ q: 1, verdict: 'just' });
    expect(br.throatVerdict(0.1).verdict).toBe('low');
    expect(br.throatVerdict(1.1).verdict).toBe('high');
    expect(br.throatVerdict(1.1).q).toBeLessThan(1);
  });
});

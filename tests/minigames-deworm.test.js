// Le vermifuge (src/ui/minigames/deworm.js) : la bague de la seringue sur son poids, puis la seringue dans le coin
// de la bouche (pas devant les dents) et toute la pâte. Faux cadre, sans DOM.
import { describe, it, expect, beforeAll } from 'vitest';
import { makeRng } from '../src/ui/minigames/draw.js';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';

let t;
let dw;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  dw = await import('../src/ui/minigames/deworm.js');
});

const horse = (breed = 'selle_francais') => {
  const a = createAnimal({ species: 'horse', breed, sex: 'f', ageDays: 2000, rng: seeded(breed) });
  a.name = 'Étoile';
  a.weight = 50;
  return a;
};
function fakeCtx(a) {
  const noop = () => {};
  return {
    a, t, name: a.name, W: 400, H: 360, time: 0, done: false, rng: makeRng(2),
    view: { x0: 0, y0: 0, x1: 400, y1: 360, w: 400, h: 360, scale: 1, ox: 0, oy: 0 },
    col: { coat: '#8a5a2b', mane: '#222' }, fx: { float: noop, text: noop, burst: noop },
    hints: [], buttons: [], finished: null,
    hint(text, kind = '') { this.hints.push({ text, kind }); }, progress() {}, zone() {},
    button(text, opts = {}) { const b = { text, opts }; this.buttons.push(b); return b; },
    finish(q, msg, why) { this.done = true; this.finished = { q: Math.round(q * 100) / 100, msg, why }; },
    stopButton(onStop) { return this.button('✅', { cls: 'stop', onTap: onStop }); },
  };
}
const press = (ctx) => ctx.buttons.find((b) => b.opts.cls === 'stop').opts.onTap();
const tick = (g, ctx, s) => { for (let k = 0; k < s / 0.05; k++) { ctx.time += 0.05; g.update(0.05); } };
/** Glisser la bague jusqu'au poids kg. */
function setDose(g, kg) {
  const x = 70 + ((kg - dw.DOSE.min) / (dw.DOSE.max - dw.DOSE.min)) * 260;
  g.down({ x: 200, y: 300 });
  g.move({ x, y: 300 });
  g.up({ x, y: 300 });
}
function syringeTo(g, p) {
  const s = g.peek().syr;
  g.down({ x: s.x, y: s.y });
  g.move({ x: p.x, y: p.y });
  g.up({ x: p.x, y: p.y });
}

describe('le vermifuge', () => {
  it('le poids : un poney pèse moins qu\'un cheval, un cheval de trait plus', () => {
    expect(dw.horseKg(horse('shetland'))).toBeLessThan(dw.horseKg(horse('selle_francais')));
    expect(dw.horseKg(horse('percheron'))).toBeGreaterThan(dw.horseKg(horse('selle_francais')));
    const fat = horse();
    fat.weight = 90;
    expect(dw.horseKg(fat)).toBeGreaterThan(dw.horseKg(horse()));
  });

  it('bonne dose, dans le coin de la bouche, toute la pâte : trois étoiles', () => {
    const ctx = fakeCtx(horse());
    const g = dw.dewormGame(ctx);
    setDose(g, g.peek().kg);
    expect(g.peek().ring).toBeGreaterThanOrEqual(g.peek().doseLo);
    expect(g.peek().ring).toBeLessThanOrEqual(g.peek().doseHi);
    press(ctx);
    tick(g, ctx, 1);
    syringeTo(g, g.peek().bar);
    expect(g.peek().syr.placed).toBe(true);
    g.down(g.peek().bar);
    tick(g, ctx, 2);
    g.up();
    expect(g.peek().syr.left).toBe(0);
    press(ctx);
    expect(ctx.finished.why).toBe('just');
    expect(ctx.finished.q).toBe(1);
  });

  it('devant ses dents : il relève la tête, la seringue revient', () => {
    const ctx = fakeCtx(horse());
    const g = dw.dewormGame(ctx);
    press(ctx);
    tick(g, ctx, 1);
    syringeTo(g, g.peek().teeth);
    expect(g.peek().syr.placed).toBe(false);
    expect(ctx.hints.at(-1)).toEqual({ text: t('mg_deworm_teeth', { name: 'Étoile' }), kind: 'warn' });
  });

  it('trop de vermifuge : moins d\'étoiles, et le message dit pourquoi', () => {
    const ctx = fakeCtx(horse());
    const g = dw.dewormGame(ctx);
    setDose(g, 900);
    press(ctx);
    tick(g, ctx, 1);
    syringeTo(g, g.peek().bar);
    g.down(g.peek().bar);
    tick(g, ctx, 2);
    press(ctx);
    expect(ctx.finished.why).toBe('high');
    expect(ctx.finished.msg).toBe(t('mg_deworm_high_dose', { name: 'Étoile', g: 'f', kg: g.peek().kg }));
  });
});

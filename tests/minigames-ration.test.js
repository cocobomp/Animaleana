// La ration du cheval (src/ui/minigames/ration.js) : un filet à foin bien plein, puis une petite mesure de granulés ;
// beaucoup trop de granulés : les coliques (ctx.opts.out.colic, pour le jeu).
import { describe, it, expect, beforeAll } from 'vitest';
import { makeRng } from '../src/ui/minigames/draw.js';
import { justRight, verdict } from '../src/ui/minigames/score.js';

let t;
let ration;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  ration = await import('../src/ui/minigames/ration.js');
});

function play(hold1, hold2) {
  const noop = () => {};
  const a = { species: 'horse', name: 'Étoile', sex: 'f' };
  const ctx = {
    a, action: 'feed', W: 400, H: 360, opts: {},
    view: { x0: 0, y0: 0, x1: 400, y1: 360, w: 400, h: 360, scale: 1, ox: 0, oy: 0 },
    col: { coat: '#8a5a2b', mane: '#222' }, fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop }, rng: makeRng(3),
    time: 0, done: false, pointer: { x: 0, y: 0 }, t, name: a.name, hints: [], buttons: [], finished: null,
    hint(text, kind = '') { this.hints.push({ text, kind }); }, progress() {}, zone() {},
    button(text, opts = {}) { const b = { text, opts }; this.buttons.push(b); return b; },
    finish(q, msg, why) { this.done = true; this.finished = { q, msg, why }; },
    finishJust(v, lo, hi) { this.finish(justRight(v, lo, hi), '', verdict(v, lo, hi)); },
    stopButton(onStop) { return this.button('✅', { cls: 'stop', onTap: onStop }); },
  };
  const game = ration.rationGame(ctx);
  const tick = (s) => { for (let k = 0; k < s / 0.05; k++) { ctx.time += 0.05; game.update(0.05); } };
  const press = () => ctx.buttons.find((b) => b.opts.cls === 'stop').opts.onTap();
  game.down(); tick(hold1); game.up();
  press(); tick(0.6);
  expect(game.peek().stage).toBe('grain');
  game.down(); tick(hold2); game.up();
  if (!ctx.done) press();
  return { ctx, game };
}

describe('la ration du cheval', () => {
  it('un filet bien plein et une petite mesure : trois étoiles, pas de coliques', () => {
    const { ctx, game } = play(3.2, 1);
    expect(game.peek().hay).toBeGreaterThanOrEqual(ration.RATION.hayLo);
    expect(game.peek().grain).toBeGreaterThanOrEqual(ration.RATION.grainLo);
    expect(game.peek().grain).toBeLessThanOrEqual(ration.RATION.grainHi);
    expect(ctx.finished.q).toBe(1);
    expect(ctx.finished.why).toBe('just');
    expect(ctx.opts.out.colic).toBe(false);
    expect(ctx.finished.msg).toBe(t('mg_ration_just', { name: 'Étoile', g: 'f' }));
  });

  it('pas assez de foin : moins de points, et le jeu le dit', () => {
    const { ctx } = play(1, 1);
    expect(ctx.finished.q).toBeLessThan(1);
    expect(ctx.finished.msg).toBe(t('mg_ration_low_hay', { name: 'Étoile', g: 'f' }));
  });

  it('beaucoup trop de granulés : les coliques', () => {
    const { ctx } = play(3.2, 3);
    expect(ctx.opts.out.colic).toBe(true);
    expect(ctx.finished.q).toBeLessThanOrEqual(0.4);
    expect(ctx.finished.msg).toBe(t('mg_ration_colic', { name: 'Étoile', g: 'f' }));
  });

  it('les textes existent en anglais aussi', async () => {
    const { setLang } = await import('../src/i18n.js');
    setLang('en');
    for (const k of ['mg_ration_hay_hint', 'mg_ration_grain_hint', 'mg_ration_just', 'mg_ration_low_hay', 'mg_ration_high_grain', 'mg_ration_colic', 'colicSick']) {
      expect(t(k, { name: 'Étoile' }), k).not.toBe(k);
    }
    setLang('fr');
  });

  it('le soir d\'un jour sans travail : presque que du foin (la zone des granulés est plus petite)', () => {
    const noop = () => {};
    const a = { species: 'horse', name: 'Étoile', sex: 'f', today: { day: 4, done: ['feedAm'], perfect: false } };
    const c = {
      a, action: 'feed', W: 400, H: 360, opts: {}, day: 4, hour: 18,
      view: { x0: 0, y0: 0, x1: 400, y1: 360, w: 400, h: 360, scale: 1, ox: 0, oy: 0 },
      col: { coat: '#8a5a2b', mane: '#222' }, fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop }, rng: makeRng(3),
      time: 0, done: false, pointer: { x: 0, y: 0 }, t, name: a.name, hints: [], buttons: [], finished: null,
      hint(text, kind = '') { this.hints.push({ text, kind }); }, progress() {}, zone() {},
      button(text, opts = {}) { const b = { text, opts }; this.buttons.push(b); return b; },
      finish(q, msg, why) { this.done = true; this.finished = { q, msg, why }; },
      stopButton(onStop) { return this.button('✅', { cls: 'stop', onTap: onStop }); },
    };
    const g = ration.rationGame(c);
    expect(g.peek().rest).toBe(true);
    expect(g.peek().grainHi).toBe(ration.RATION.restHi);
    expect(ration.restDay(a, 4, 9)).toBe(false); // (le matin : on ne sait pas encore)
    a.today.done.push('work');
    expect(ration.restDay(a, 4, 18)).toBe(false); // (il a travaillé : la ration habituelle)
    expect(ration.restDay(a, 5, 18)).toBe(false); // (sa journée d'hier ne compte pas)
  });
});

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
    expect(ration.restDay(a, 5, 18)).toBe(true); // (sa journée d'hier ne compte pas : rien de fait aujourd'hui)
    expect(ration.restDay({ ...a, client: true }, 5, 18)).toBe(false); // (un cheval en pension : la ration habituelle)
  });

  it('un jour de repos, le seau et les petits mots suivent la petite zone (pas « C\'est bon » à 20 %)', () => {
    const noop = () => {};
    const make = (rest) => {
      const a = { species: 'horse', name: 'Noisette', sex: 'm', today: { day: 4, done: rest ? ['feedAm'] : ['feedAm', 'work'], perfect: false } };
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
      const tick = (sec) => { for (let k = 0; k < sec / 0.05; k++) { c.time += 0.05; g.update(0.05); } };
      g.down(); tick(3.2); g.up();
      c.buttons.find((b) => b.opts.cls === 'stop').opts.onTap();
      tick(0.6);
      return { c, g, tick };
    };
    // Le seau : la bande verte dessinée (un faux contexte 2D qui note les rectangles verts).
    const band = (g) => {
      const rects = [];
      const st = {};
      const ctx2d = new Proxy(st, {
        get(o, k) {
          if (k in o) return o[k];
          if (k === 'fillRect') return (x, y, w, h) => { if (o.fillStyle === 'rgba(63, 174, 98, 0.25)') rects.push([y, h]); };
          if (k === 'measureText') return (s) => ({ width: String(s).length * 8 });
          if (k.startsWith('create')) return () => ({ addColorStop() {} });
          return () => {};
        },
        set(o, k, v) { o[k] = v; return true; },
      });
      g.draw(ctx2d);
      const [y, h] = rects[0];
      return { lo: +((300 - y - h) / 70).toFixed(2), hi: +((300 - y) / 70).toFixed(2) };
    };
    const rest = make(true);
    expect(rest.g.peek().rest).toBe(true);
    expect(band(rest.g)).toEqual({ lo: ration.RATION.restLo, hi: ration.RATION.restHi });
    rest.g.down();
    rest.tick(0.4); // (≈ 9 % : dans la petite zone)
    expect(rest.c.hints.at(-1)).toEqual({ text: t('mg_nowStop'), kind: 'good' });
    rest.tick(0.5); // (≈ 20 % : trop pour un jour sans travail)
    rest.g.up();
    expect(rest.g.peek().grain).toBeGreaterThan(ration.RATION.restHi);
    expect(rest.g.peek().grain).toBeLessThan(ration.RATION.grainHi);
    expect(rest.c.hints.at(-1)).toEqual({ text: t('mg_stop'), kind: 'warn' });
    // Un jour de travail : la zone habituelle, partout.
    const work = make(false);
    expect(band(work.g)).toEqual({ lo: ration.RATION.grainLo, hi: ration.RATION.grainHi });
    work.g.down();
    work.tick(0.9);
    work.g.up();
    expect(work.c.hints.at(-1)).toEqual({ text: t('mg_nowStop'), kind: 'good' });
  });
});

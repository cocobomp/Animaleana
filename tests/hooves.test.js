// Les pieds du cheval (src/sim/animal.js HOOF) : la terre se tasse dans les sabots, pas curés un caillou s'y coince
// et il boite ; le cure-pied (pansage) l'enlève, sinon un abcès (malade) que le vétérinaire soigne.
import { describe, it, expect, beforeAll } from 'vitest';
import { createAnimal, tickAnimal, applyCare, canRide, cure, checkup, careFull, pickHooves, hoovesNeedCare, HOOF } from '../src/sim/animal.js';
import { seeded, mulberry32 } from '../src/sim/rng.js';
import { makeRng } from '../src/ui/minigames/draw.js';
import { justRight, verdict } from '../src/ui/minigames/score.js';

let t;
let pansage;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  pansage = await import('../src/ui/minigames/pansage.js');
});

const horse = () => {
  const a = createAnimal({ species: 'horse', sex: 'f', ageDays: 2000, rng: seeded('pieds') });
  for (const n of Object.keys(a.needs)) a.needs[n] = 80;
  a.name = 'Étoile';
  return a;
};
/** Des jours au pré, sans soin des pieds (les autres besoins restent bons). */
function days(a, n, rng, weather = 'clear') {
  const events = [];
  for (let h = 0; h < n * 24; h++) {
    events.push(...tickAnimal(a, 1, { rng, weather }));
    for (const k of Object.keys(a.needs)) a.needs[k] = Math.max(a.needs[k], 70);
  }
  return events;
}

describe('les pieds du cheval', () => {
  it('la terre se tasse chaque jour, plus vite sous la pluie ; un chien n\'a pas ce souci', () => {
    const a = horse();
    days(a, 1, () => 0.99);
    expect(a.hoofDirt).toBeCloseTo(HOOF.perDay, 5);
    const b = horse();
    days(b, 1, () => 0.99, 'rain');
    expect(b.hoofDirt).toBeCloseTo(HOOF.wetPerDay, 5);
    const d = createAnimal({ species: 'dog', sex: 'f', ageDays: 300, rng: seeded('chien') });
    tickAnimal(d, 24, { rng: () => 0 });
    expect(d.hoofDirt).toBeUndefined();
  });

  it('pansé tous les deux jours : jamais de caillou ; jamais curé : il finit par boiter', () => {
    const rng = mulberry32(4);
    const cared = horse();
    for (let k = 0; k < 30; k++) {
      expect(days(cared, 2, rng)).not.toContain('lame');
      pickHooves(cared);
    }
    expect(cared.lame ?? null).toBeNull();
    const left = horse();
    const ev = days(left, 8, mulberry32(4));
    expect(ev).toContain('lame');
    expect(left.lame.cause === 'stone' || left.lame.cause === 'abscess').toBe(true);
  });

  it('il boite : on ne le monte pas, il est moins heureux ; le pansage (cure-pied) enlève le caillou', () => {
    const a = horse();
    a.lame = { cause: 'stone', foot: 2, hours: 0 };
    expect(canRide(a)).toEqual({ ok: false, reason: 'lame' });
    // pas de « il est déjà tout propre » : ses pieds ont besoin du cure-pied
    a.needs.grooming = 100;
    expect(hoovesNeedCare(a)).toBe(true);
    expect(careFull(a, 'brush')).toBe(false);
    // le mini-jeu : pieds pas curés, le caillou reste
    expect(applyCare(a, 'brush', 0.6, { hooves: { cleaned: 0.2, stoneOut: false } })).toEqual({ ok: true, unlame: false });
    expect(a.lame).not.toBeNull();
    a.needs.grooming = 50;
    expect(applyCare(a, 'brush', 1, { hooves: { cleaned: 1, stoneOut: true } })).toEqual({ ok: true, unlame: true });
    expect(a.lame).toBeNull();
    expect(a.hoofDirt).toBe(0);
    expect(canRide(a).ok).toBe(true);
  });

  it('laissé deux jours : un abcès, il est malade ; le vétérinaire le soigne', () => {
    const a = horse();
    a.lame = { cause: 'stone', foot: 0, hours: 0 };
    const ev = days(a, 2.1, () => 0.99);
    expect(ev).toContain('sick');
    expect(a.sick).toBe('paw');
    expect(a.lame.cause).toBe('abscess');
    cure(a, 10);
    expect(a.sick).toBeNull();
    expect(a.lame).toBeNull();
  });

  it('il boite (pas encore d\'abcès) : la visite chez le vétérinaire enlève aussi le caillou', () => {
    const a = horse();
    a.lame = { cause: 'stone', foot: 1, hours: 5 };
    checkup(a, 3);
    expect(a.lame).toBeNull();
  });

  it('au pansage, le caillou est dans le pied qui boite ; le jeu dit au cheval ce qui a été curé', () => {
    const a = horse();
    a.lame = { cause: 'stone', foot: 2, hours: 3 };
    const noop = () => {};
    const ctx = {
      a, sp: { emoji: '🐴' }, action: 'brush', W: 400, H: 360, opts: {},
      view: { x0: 0, y0: 0, x1: 400, y1: 360, w: 400, h: 360, scale: 1, ox: 0, oy: 0 },
      col: { coat: '#8a5a2b', sec: '#fff', mane: '#222', raw: { pattern: 'solid' } },
      fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop }, rng: makeRng(5), time: 0, done: false,
      pointer: { x: 0, y: 0 }, t, name: a.name, hints: [], buttons: [], finished: null,
      hint(text, kind = '') { this.hints.push({ text, kind }); }, progress() {}, zone() {},
      button(text, opts = {}) { const b = { text, opts }; this.buttons.push(b); return b; },
      finish(q, msg, why) { this.done = true; this.finished = { q, msg, why }; },
      finishJust(v, lo, hi) { this.finish(justRight(v, lo, hi), '', verdict(v, lo, hi)); },
      stopButton(onStop) { return this.button('✅', { cls: 'stop', onTap: onStop }); },
    };
    const game = pansage.pansageGame(ctx);
    const press = () => ctx.buttons.find((b) => b.opts.cls === 'stop').opts.onTap();
    const tick = (s) => { for (let k = 0; k < s / 0.05; k++) { ctx.time += 0.05; game.update(0.05); } };
    press(); tick(1.2); press(); tick(1.2); // étrille et brosse passées
    expect(game.peek().stage).toBe('hoof');
    expect(ctx.hints.at(-1).text).toBe(t('mg_pansage_hoof_lame', { name: 'Étoile', foot: t('mg_pansage_foot_fr') }));
    // les pieds, un par un ; le caillou est dans le troisième (antérieur droit)
    let stoneAt = -1;
    for (let f = 0; f < 4; f++) {
      tick(0.5);
      if (game.peek().blobs.some((b) => b.stone)) stoneAt = game.peek().footIndex;
      for (let g = 0; g < 40 && game.peek().stage === 'hoof' && game.peek().blobs.length; g++) {
        const q = game.peek().blobs[0];
        game.down({ x: q.x, y: q.y - 22 });
        for (let i = 1; i <= 11; i++) game.move({ x: q.x, y: q.y - 22 + 4 * i }, true);
        game.up({ x: q.x, y: q.y + 22 });
      }
      tick(1);
    }
    expect(stoneAt).toBe(2);
    tick(1.2);
    press(); // peigne : on s'arrête là
    expect(ctx.opts.out.hooves.stoneOut).toBe(true);
    expect(ctx.opts.out.hooves.cleaned).toBeCloseTo(1, 5);
  });
});

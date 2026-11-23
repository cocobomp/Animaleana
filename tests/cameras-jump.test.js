// ⤴️ Très petits poneys au saut (src/sim/activities.js scaledCourse, src/game/Activities.js jumpArc) : barres baissées à
// leur taille et envol à leur mesure (un Falabella sautait une barre presque aussi haute que lui, et s'envolait d'un
// mètre). Les grands chevaux gardent leur parcours.
import { describe, it, expect, beforeAll } from 'vitest';
import { JUMP_COURSE, courseForStage, scaledCourse, jumpBarScale, JUMP_STAGES } from '../src/sim/activities.js';

let jumpArc;
beforeAll(async () => {
  const mem = new Map();
  globalThis.localStorage = globalThis.localStorage ?? {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k),
    key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
  };
  globalThis.window = globalThis.window ?? { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
  globalThis.document = globalThis.document ?? {
    addEventListener() {}, hidden: false, documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } }, getElementById: () => null, createElement: () => ({ getContext: () => null, style: {} }),
  };
  globalThis.matchMedia = globalThis.matchMedia ?? (() => ({ matches: true }));
  ({ jumpArc } = await import('../src/game/Activities.js'));
}, 60000);

// Tailles du jeu (modèle) : Selle Français 1, Frison 1,05, Shetland 0,58, Falabella 0,5.
describe('⤴️ barres à la taille du poney', () => {
  it('les grands chevaux et poneys moyens : le même parcours', () => {
    for (const sc of [0.9, 1, 1.06]) {
      expect(jumpBarScale(sc)).toBe(1);
      for (let st = 0; st < JUMP_STAGES.length; st++) expect(scaledCourse(courseForStage(st), sc)).toEqual(courseForStage(st));
    }
  });

  it('Shetland et Falabella : barres baissées (pas plus de 70 % de leur hauteur au garrot, 85 % au plus haut niveau), au moins 10 cm', () => {
    for (const [sc, withers] of [[0.58, 0.92], [0.5, 0.8]]) {
      for (let st = 0; st < JUMP_STAGES.length; st++) {
        const c = scaledCourse(courseForStage(st), sc);
        c.obstacles.forEach((o, i) => {
          expect(o.height).toBeLessThanOrEqual(courseForStage(st).obstacles[i].height);
          expect(o.height).toBeGreaterThanOrEqual(0.1);
          expect(o.height / withers, `${sc} niveau ${st}`).toBeLessThan(st === 3 ? 0.85 : 0.7);
        });
        // (mêmes places, même arrivée)
        expect(c.obstacles.map((o) => [o.x, o.z])).toEqual(JUMP_COURSE.obstacles.map((o) => [o.x, o.z]));
        expect(c.finish).toEqual(JUMP_COURSE.finish);
      }
    }
  });

  it('l\'envol : la barre franchie, une marge à la taille du cheval', () => {
    // grand cheval : comme avant (0,9 m → 1,29 m)
    expect(jumpArc(0.9, 1)).toBeCloseTo(0.9 * 1.1 + 0.3, 5);
    // Falabella sur sa barre baissée : moins haut qu'avant (1,07 m sur la barre de 0,7 m), au-dessus de la barre
    const h = scaledCourse(JUMP_COURSE, 0.5).obstacles[0].height;
    expect(jumpArc(h, 0.5)).toBeLessThan(0.7);
    expect(jumpArc(h, 0.5)).toBeGreaterThan(h * 1.1);
    // à barre égale, un petit poney s'élève moins qu'un grand cheval
    expect(jumpArc(0.5, 0.5)).toBeLessThan(jumpArc(0.5, 1));
  });
});

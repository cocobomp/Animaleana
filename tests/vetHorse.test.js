import { describe, it, expect } from 'vitest';
import { SPECIES } from '../src/sim/species.js';
import { createAnimal } from '../src/sim/animal.js';
import { mulberry32 as makeRng } from '../src/sim/rng.js';
import { animalShape, fitAnimal } from '../src/ui/minigames/draw.js';
import { drawHorseVet, horseLegZone, HORSE_LEG_ZONES } from '../src/ui/vetHorse.js';

/** Faux contexte 2D : compte les appels, vérifie qu'aucun nombre n'est faux (NaN). */
function fakeCtx() {
  const calls = { n: 0, bad: [] };
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(target, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k in target) return target[k];
      return (...args) => {
        calls.n++;
        if (args.some((v) => typeof v === 'number' && !Number.isFinite(v))) calls.bad.push(String(k));
      };
    },
    set(target, k, v) {
      target[k] = v;
      return true;
    },
  });
  return { ctx, calls };
}

describe('le cheval réaliste de l\'examen vétérinaire', () => {
  it('se dessine pour chaque race et chaque robe, debout et en marche, sans valeur fausse', () => {
    for (const breed of SPECIES.horse.breeds) {
      breed.colors.forEach((_, ci) => {
        const a = createAnimal({ species: 'horse', breed: breed.id, colorIndex: ci, ageDays: 72, rng: makeRng(3 + ci) });
        const fit = fitAnimal(a, { cx: 196, groundY: 274, maxW: 344, maxH: 236 });
        for (const o of [{}, { walk: 1.3, headDip: -0.1, f: -1 }, { walk: 4, lift: 3, earsBack: true, blink: true, shake: 0.6 }]) {
          const { ctx, calls } = fakeCtx();
          const sh = drawHorseVet(ctx, a, { x: fit.x, y: 274, s: fit.s, f: 1, time: 2, ...o });
          expect(calls.bad, `${breed.id} ${ci}`).toEqual([]);
          expect(calls.n).toBeGreaterThan(100);
          // Même géométrie que les autres animaux (les zones de l'examen restent justes).
          const ref = animalShape(a, { x: fit.x, y: 274, s: fit.s, f: 1, ...o });
          expect(sh.head).toEqual(ref.head);
          expect(sh.mouth).toEqual(ref.mouth);
        }
      });
    }
  });

  it('les zones des pattes sont sur les pattes : sous le ventre, au-dessus du sol, devant et derrière', () => {
    const a = createAnimal({ species: 'horse', breed: 'selle_francais', ageDays: 72, rng: makeRng(1) });
    for (const f of [1, -1]) {
      const sh = animalShape(a, { x: 200, y: 274, s: 1.2, f });
      const front = horseLegZone(sh, 'front');
      const hind = horseLegZone(sh, 'hind');
      for (const z of [front, hind]) {
        expect(z.y).toBeGreaterThan(sh.by + sh.ry * 0.9);
        expect(z.y).toBeLessThan(sh.groundY - 10);
      }
      expect((front.x - sh.bx) * f).toBeGreaterThan(sh.rx * 0.5);
      expect((hind.x - sh.bx) * f).toBeLessThan(-sh.rx * 0.6);
    }
    expect(HORSE_LEG_ZONES.front[0]).toBeGreaterThan(0);
    expect(HORSE_LEG_ZONES.hind[0]).toBeLessThan(0);
  });
});

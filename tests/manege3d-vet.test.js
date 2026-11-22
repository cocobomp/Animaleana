// Le cheval dessiné du vétérinaire (src/ui/vetHorse.js) à sa race et à son âge : gabarit (poney trapu, poulain aux
// longues jambes et à la grosse tête), crinière longue, fanons, profil camus, pommelures en taches claires pleines ; et
// les zones de l'examen (src/ui/vetStage.js zonePoints, horseLegZone) toujours sur le cheval dessiné.
import { describe, it, expect, beforeAll } from 'vitest';
import { createAnimal } from '../src/sim/animal.js';
import { mulberry32 as makeRng } from '../src/sim/rng.js';
import { SPECIES } from '../src/sim/species.js';
import { animalShape, fitAnimal } from '../src/ui/minigames/draw.js';
import { fakeDocument } from './fixtures/careCtx.js';

let vet;
let stage;
beforeAll(async () => {
  fakeDocument();
  vet = await import('../src/ui/vetHorse.js');
  stage = await import('../src/ui/vetStage.js');
});

const horse = (breed, ci = 0, foal = false) => createAnimal({ species: 'horse', breed, colorIndex: ci, ageDays: foal ? 7 : 72, rng: makeRng(5) });

/** Faux contexte 2D qui note les appels (nom, arguments). */
function recCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(target, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k in target) return target[k];
      return (...args) => calls.push([String(k), args]);
    },
    set(target, k, v) {
      target[k] = v;
      return true;
    },
  });
  return { ctx, calls };
}

describe('le cheval du vétérinaire à sa race et à son âge', () => {
  it('poney trapu, poulain haut sur jambes à grosse tête, trait épais : des gabarits différents', () => {
    const sf = vet.vetBuild(horse('selle_francais'));
    const shet = vet.vetBuild(horse('shetland'));
    const fala = vet.vetBuild(horse('falabella'));
    const foal = vet.vetBuild(horse('selle_francais', 0, true));
    const perch = vet.vetBuild(horse('percheron'));
    const arabe = vet.vetBuild(horse('arabe'));
    // (ventre plus bas : membres courts sous un tronc profond)
    expect(shet.belly).toBeGreaterThan(sf.belly + 10);
    expect(fala.belly).toBeGreaterThan(sf.belly);
    expect(perch.belly).toBeGreaterThan(sf.belly + 4);
    // (poulain : le ventre haut, le tronc court, la grosse tête, la crinière en brosse, la queue courte)
    expect(foal.belly).toBeLessThan(sf.belly - 5);
    expect(foal.len).toBeLessThan(sf.len);
    expect(foal.headK).toBeGreaterThan(sf.headK + 0.1);
    expect(foal.mane).toBe('foal');
    expect(foal.tail).toBeLessThan(0.6);
    expect(foal.profile).toBe('foal');
    // (trait : canons forts, croupe ronde, encolure épaisse ; arabe : profil camus, queue portée haut)
    expect(perch.bone).toBeGreaterThan(sf.bone);
    expect(perch.croup).toBeGreaterThan(sf.croup);
    expect(perch.neckW).toBeGreaterThan(sf.neckW);
    expect(arabe.profile).toBe('dish');
    expect(arabe.tailSet).toBe(1);
  });

  it('le Frison : longue crinière ondulée, grands fanons (breed.feathers, plus seulement fluff ≥ 1,1)', () => {
    const fr = vet.vetBuild(horse('frison'));
    expect(fr.mane).toBe('long');
    expect(fr.maneLen).toBeGreaterThan(2);
    expect(fr.feathers).toBeGreaterThanOrEqual(1);
    expect(vet.vetBuild(horse('selle_francais')).feathers).toBe(0);
  });

  it('gris pommelé : des taches claires pleines (plus d\'anneaux) ; gris clair : pas de pommelures', () => {
    const perch = horse('percheron', 0);
    expect(perch.look.colorName.fr).toMatch(/pommel/i);
    const p = vet.paletteOf(perch);
    expect(p.dapples.length).toBeGreaterThan(30);
    expect(p.dapple).toBeTruthy();
    // dessinées en remplissages (fill) d'ellipses, jamais en traits d'arcs
    const { ctx, calls } = recCtx();
    vet.drawHorseVet(ctx, perch, { x: 200, y: 300, s: 1.2, f: 1, time: 1 });
    const arcs = calls.filter(([k, a]) => k === 'arc' && a[2] >= 3 && a[2] <= 7).length;
    expect(arcs).toBeLessThan(5);
    expect(vet.paletteOf(horse('arabe', 0)).dapples.length).toBe(0);
  });

  it('les zones de l\'examen tombent sur le cheval dessiné, pour chaque race et un poulain', () => {
    const list = SPECIES.horse.breeds.map((b) => horse(b.id)).concat([horse('selle_francais', 0, true), horse('shetland', 1, true)]);
    for (const a of list) {
      const fit = fitAnimal(a, { cx: 196, groundY: 274, maxW: 344, maxH: 236 });
      for (const f of [1, -1]) {
        const sh = animalShape(a, { x: fit.x, y: 274, s: fit.s, f });
        const z = stage.zonePoints(sh, a);
        const m = vet.horseVetMarks(a);
        const loc = (q) => ({ x: (q.x - sh.bx) / (f * sh.s), y: (q.y - sh.by) / sh.s });
        const name = `${a.breed} ${a.ageDays}`;
        // dans le corps : sous le dos, au-dessus du ventre, entre les fesses et le poitrail
        for (const k of ['heart', 'lungs', 'gut', 'back', 'belly', 'rump']) {
          const q = loc(z[k]);
          expect(q.y, `${name} ${k}`).toBeGreaterThan(m.back);
          expect(q.y, `${name} ${k}`).toBeLessThan(m.belly - 2);
          expect(q.x, `${name} ${k}`).toBeGreaterThan(m.rumpX + 4);
          expect(q.x, `${name} ${k}`).toBeLessThan(m.chestX - 4);
        }
        // les pattes : sous le ventre, au-dessus du sol (sur l'avant-bras et la jambe dessinés)
        for (const k of ['legFront', 'legHind']) {
          const q = loc(z[k]);
          expect(q.y, `${name} ${k}`).toBeGreaterThan(m.belly + 4);
          expect(q.y, `${name} ${k}`).toBeLessThan(101.76 - 30);
        }
        // l'œil et la bouche dessinés sur leurs zones (tête agrandie selon le gabarit)
        const hd = { x: (sh.head.x - sh.bx) / (f * sh.s), y: (sh.head.y - sh.by) / sh.s };
        const eye = loc(z.eye);
        expect(Math.hypot(hd.x + m.eye[0] - eye.x, hd.y + m.eye[1] - eye.y), `${name} œil`).toBeLessThan(5);
        const mouth = loc(z.mouth);
        expect(Math.hypot(hd.x + m.mouth[0] - mouth.x, hd.y + m.mouth[1] - mouth.y), `${name} bouche`).toBeLessThan(z.mouth.r / sh.s);
      }
    }
  });
});

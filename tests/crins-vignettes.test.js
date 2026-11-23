// Vignettes du cheval (chantier « crins ») : photographié du côté où tombe sa crinière, un peu plus bas ; les autres
// espèces ne changent pas.
import { describe, it, expect, beforeAll } from 'vitest';
import { animalThumbDir } from '../src/game/thumbScenes.js';
import { buildRealHorseModel } from '../src/game/models/horseReal.js';
import { createAnimal } from '../src/sim/animal.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
}, 60000);

describe('vignettes du cheval : du côté de la crinière', () => {
  it('portrait et animalerie : côté droit du cheval (x < 0), plus bas qu\'avant', () => {
    for (const portrait of [true, false]) {
      const [x, y, z] = animalThumbDir('horse', portrait);
      const L = Math.hypot(x, y, z);
      expect(x).toBeLessThan(0);
      // (de trois quarts avant, pas de dos)
      expect(z).toBeGreaterThan(0);
      // (hauteur de la caméra : moins de 14° au-dessus de l'horizon ; avant 10° et 16° pour le portrait, 15 à 18° ailleurs)
      expect(Math.asin(y / L) * 180 / Math.PI).toBeLessThan(14);
    }
  });

  it('la crinière tombe de ce côté-là (la masse des crins y descend plus bas, en moyenne et au plus bas)', () => {
    const side = Math.sign(animalThumbDir('horse', true)[0]);
    for (const breed of ['frison', 'selle_francais', 'shetland']) {
      const a = createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: 900, seed: 3 });
      const md = buildRealHorseModel(a.look, a.breed, gltf);
      const g = md.hairMesh.geometry.attributes;
      const ys = { same: [], other: [] };
      for (let i = 0; i < g.position.count; i++) {
        if (g.hairRoot.getW(i) !== 8 || Math.abs(g.position.getX(i)) < 0.03) continue;
        ys[Math.sign(g.position.getX(i)) === side ? 'same' : 'other'].push(g.position.getY(i));
      }
      const mean = (v) => v.reduce((x, y) => x + y, 0) / v.length;
      expect(Math.min(...ys.same), breed).toBeLessThan(Math.min(...ys.other));
      expect(mean(ys.same), breed).toBeLessThan(mean(ys.other));
      md.dispose();
    }
    // (trois chevaux construits : 2,7 s seul, plus de 5 s quand la machine est chargée — même marge que les autres
    // tests qui construisent le cheval réaliste)
  }, 60000);

  it('les autres espèces gardent leur vue', () => {
    expect(animalThumbDir('cow', false)).toEqual([1, 0.38, 0.72]);
    expect(animalThumbDir('dog', false)).toEqual([1, 0.5, 0.95]);
    expect(animalThumbDir('cat', true)).toEqual([0.95, 0.24, 1]);
    expect(animalThumbDir('sheep', false)).toEqual([1, 0.5, 0.95]);
  });
});

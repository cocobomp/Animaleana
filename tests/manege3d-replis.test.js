// Replis dessinés des soins du cheval (sans 3D) : la ration, boire, caresser, le pansage et laver dessinent le cheval du
// vétérinaire (src/ui/vetHorse.js : sa race, sa robe, ses marques, son œil), plus la tête en trois ronds de deworm.js ni
// le cheval générique de draw.js ; les autres espèces gardent leur dessin. Et la longe / la liberté dessinées gardent
// leur jeu, avec le cheval vu de dessus à sa taille.
import { describe, it, expect, beforeAll } from 'vitest';
import { createAnimal } from '../src/sim/animal.js';
import { mulberry32 as makeRng } from '../src/sim/rng.js';
import { fakeCtx, fakeDocument } from './fixtures/careCtx.js';

let t;
let ration;
let food;
let fun;
let pansage;
let grooming;
let horse;
beforeAll(async () => {
  fakeDocument();
  ({ t } = await import('../src/i18n.js'));
  ration = await import('../src/ui/minigames/ration.js');
  food = await import('../src/ui/minigames/food.js');
  fun = await import('../src/ui/minigames/fun.js');
  pansage = await import('../src/ui/minigames/pansage.js');
  grooming = await import('../src/ui/minigames/grooming.js');
  horse = await import('../src/ui/minigames/horse.js');
});

/** Toile 2D qui note les couleurs posées (le licol bleu du cheval du vétérinaire : #2f6fb0). */
function recCtx() {
  const styles = new Set();
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get(target, k) {
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      if (k in target) return target[k];
      return () => {};
    },
    set(target, k, v) {
      if ((k === 'strokeStyle' || k === 'fillStyle') && typeof v === 'string') styles.add(v);
      target[k] = v;
      return true;
    },
  });
  return { ctx, styles };
}
const VET_HALTER = '#2f6fb0';
const animal = (species, breed) => {
  const a = createAnimal({ species, breed, colorIndex: 0, ageDays: 72, rng: makeRng(4) });
  a.name = 'Honey';
  return a;
};

describe('replis dessinés : le cheval du vétérinaire', () => {
  const games = () => [['ration', ration.rationGame], ['boire', food.waterGame], ['caresser', fun.petGame], ['pansage', pansage.pansageGame], ['laver', grooming.washGame]];
  for (const breed of ['selle_francais', 'frison', 'shetland']) {
    it(`${breed} : chaque repli dessine le cheval du vétérinaire`, () => {
      for (const [name, make] of games()) {
        const a = animal('horse', breed);
        const c = fakeCtx(a, t);
        const game = make(c);
        for (let k = 0; k < 5; k++) {
          c.time += 0.1;
          game.update?.(0.1);
        }
        const { ctx, styles } = recCtx();
        game.draw(ctx);
        expect(styles.has(VET_HALTER), `${breed} ${name}`).toBe(true);
        game.destroy?.();
      }
    });
  }
  it('un chien qui boit ou qu\'on caresse garde son dessin', () => {
    for (const make of [food.waterGame, fun.petGame]) {
      const a = animal('dog');
      const c = fakeCtx(a, t);
      const game = make(c);
      const { ctx, styles } = recCtx();
      game.draw(ctx);
      expect(styles.has(VET_HALTER)).toBe(false);
    }
  });
  it('le cheval qui boit est plus grand que son seau (0,9 et non plus 0,6)', () => {
    expect(food.sizeFor({ species: 'horse' })).toBeCloseTo(0.6, 6);
    // (la taille du cheval qui boit est dans le jeu : il tient dans le cadre, la tête au-dessus du seau)
    const a = animal('horse', 'selle_francais');
    const c = fakeCtx(a, t);
    const game = food.waterGame(c);
    const { ctx } = recCtx();
    game.draw(ctx);
  });
});

describe('longe et liberté dessinées (sans 3D) : le cheval vu de dessus à sa taille', () => {
  it('un Falabella et un poulain plus petits qu\'un selle français, un percheron plus grand (lisibles)', () => {
    const sf = horse.topScale(animal('horse', 'selle_francais'));
    const fala = horse.topScale(animal('horse', 'falabella'));
    const perch = horse.topScale(animal('horse', 'percheron'));
    const foal = horse.topScale(createAnimal({ species: 'horse', breed: 'selle_francais', ageDays: 7, rng: makeRng(2) }));
    expect(fala).toBeLessThan(sf - 0.25);
    expect(foal).toBeLessThan(sf - 0.15);
    expect(perch).toBeGreaterThan(sf);
    expect(fala).toBeGreaterThanOrEqual(0.74);
    // (sans âge connu, dans un essai : la taille de la race)
    expect(horse.topScale({ species: 'horse', look: { seed: 3 } })).toBeCloseTo(1.22, 6);
  });
});

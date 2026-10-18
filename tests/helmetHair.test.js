// La bombe du cavalier et les coiffures : aucune mèche ne traverse la coque (vu : cheveux bouclés).
// Sous la bombe, la coiffure est la variante « sous un chapeau » (mèches rentrées), et la bombe est un peu
// plus grande sur une coiffure volumineuse (helmetFit). On compte les sommets des cheveux qui sortent de la
// coque au-dessus de son bord, dans le repère de la tête.
import { describe, it, expect } from 'vitest';
import { hairArrays, helmetFit, HAIR_STYLES } from '../src/game/models/avatarHair.js';

// Coque de helmetModel (src/game/models/tackModels.js) : demi-sphère r 0,115, étirée [1, 0,95, 1,12],
// ouverte jusqu'à 0,52 π depuis le haut.
const R = 0.115;
const AX = [1, 0.95, 1.12];
const RIM = Math.cos(Math.PI * 0.52);

// La bombe d'avant : même taille pour toutes les coiffures, coiffure entière dessous.
const OLD_FIT = { y: 0.112, z: -0.012, tilt: -0.24, scale: 1.36 };

/** Sommets qui sortent de la coque à plus de `above` au-dessus de son bord (cosinus de l'angle depuis le haut). */
function poking(style, underHelmet, f = helmetFit(style), above = 0.02) {
  const { position } = hairArrays(style, underHelmet, false).main;
  const c = Math.cos(-f.tilt);
  const s = Math.sin(-f.tilt);
  let n = 0;
  for (let i = 0; i < position.length; i += 3) {
    const x = position[i] / f.scale;
    const y0 = (position[i + 1] - f.y) / f.scale;
    const z0 = (position[i + 2] - f.z) / f.scale;
    const y = y0 * c - z0 * s; // rotation inverse autour de X
    const z = y0 * s + z0 * c;
    const q = [x / (R * AX[0]), y / (R * AX[1]), z / (R * AX[2])];
    const len = Math.hypot(...q);
    // Dehors (2 mm de marge) et au-dessus du bord de la coque : la mèche traverse la bombe.
    if (len > 1 + 0.002 / R && q[1] / len > RIM + above) n++;
  }
  return n;
}

describe('bombe et cheveux', () => {
  it('cheveux bouclés : les mèches traversaient la bombe ; rentrées dessous, plus aucune', () => {
    expect(poking('curly', false, OLD_FIT)).toBeGreaterThan(300); // (avant : des centaines de sommets dehors)
    expect(poking('curly', true)).toBe(0);
  });

  it('aucune coiffure ne traverse la bombe', () => {
    for (const style of HAIR_STYLES.filter((x) => x !== 'bun')) expect(poking(style, true), style).toBe(0);
    // Le chignon : avant, il était sur le dessus de la tête et traversait la bombe ; dessous, il descend
    // dans la nuque et touche seulement le bord, derrière (comme un chignon bas sous une vraie bombe).
    expect(poking('bun', false, OLD_FIT)).toBeGreaterThan(50);
    expect(poking('bun', true, helmetFit('bun'), 0.16)).toBe(0);
  });

  it('la bombe est un peu plus grande sur les bouclés, jamais plus petite qu’avant', () => {
    expect(helmetFit('short').scale).toBeCloseTo(1.36);
    expect(helmetFit('curly').scale).toBeGreaterThan(helmetFit('short').scale);
    for (const style of HAIR_STYLES) expect(helmetFit(style).scale).toBeGreaterThanOrEqual(1.36);
  });
});

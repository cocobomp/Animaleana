// Rouans au téléphone : à la distance du jeu, le motif des poils blancs est fondu en sa moyenne, mêlée à la robe de
// base en lumière linéaire. Avant, 19 % de blanc sur un brun peu saturé : le flanc du Trait breton et du Criollo rouans
// se lisait gris clair (saturation du flanc mesurée au téléphone : 0,03 et 0,02). Maintenant, moins de blanc sur un fond
// roux plus saturé : rouan rouge lisible (flanc brun rosé, la tête et les membres roux). Sans GLB ni hasard.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { coatMaterial, roanBase, COAT_LOOKS } from '../src/game/models/horseCoat.js';
import { createAnimal } from '../src/sim/animal.js';
import { horseBuild } from '../src/sim/horseLook.js';

const realOpts = { detail: null, normalMap: null, normalSign: 1, hoofY: 0.12 };
const look = (breed, colorIndex) => createAnimal({ species: 'horse', breed, colorIndex, ageDays: 900, seed: 77 }).look;
const material = (breed, colorIndex) => {
  const l = look(breed, colorIndex);
  return coatMaterial(l, horseBuild(null, l), null, realOpts);
};
const hsl = (c) => c.getHSL({}, THREE.SRGBColorSpace);

// Bruit du shader (hNoise de horseCoat.js), pour la part des poils blancs de près.
const fract = (x) => x - Math.floor(x);
function hash(x, y, z) {
  let a = fract(x * 0.3183099 + 0.11) * 17;
  let b = fract(y * 0.3183099 + 0.17) * 17;
  let c = fract(z * 0.3183099 + 0.13) * 17;
  return fract(a * b * c * (a + b + c));
}
function noise(x, y, z) {
  const i = [Math.floor(x), Math.floor(y), Math.floor(z)];
  const f = [x - i[0], y - i[1], z - i[2]].map((t) => t * t * (3 - 2 * t));
  const h = (dx, dy, dz) => hash(i[0] + dx, i[1] + dy, i[2] + dz);
  const mix = (p, q, t) => p + (q - p) * t;
  return mix(mix(mix(h(0, 0, 0), h(1, 0, 0), f[0]), mix(h(0, 1, 0), h(1, 1, 0), f[0]), f[1]),
    mix(mix(h(0, 0, 1), h(1, 0, 1), f[0]), mix(h(0, 1, 1), h(1, 1, 1), f[0]), f[1]), f[2]);
}

describe('rouans', () => {
  it.each([['trait_breton', 1], ['criollo', 1]])('%s rouan : au loin, flanc roux soutenu (pas un gris clair), plus clair que la robe de base', (breed, ci) => {
    const m = material(breed, ci);
    const u = m.userData.horseUniforms;
    expect(u.hRoan.value).toBe(1);
    const base = u.hCoat.value.clone();
    // (moyenne du corps au loin : part de blanc far × white, mêlée en linéaire comme dans le shader)
    const far = base.clone().lerp(u.hWhite.value, COAT_LOOKS.roan.far * COAT_LOOKS.roan.white);
    const b = hsl(base);
    const f = hsl(far);
    // (avant : saturation 0,11 et 0,08, clarté 0,54 et 0,52)
    expect(f.s).toBeGreaterThan(0.2);
    expect(f.l).toBeLessThan(0.5);
    expect(f.l).toBeGreaterThan(b.l + 0.05);
    expect(Math.abs(f.h - b.h) * 360).toBeLessThan(10);
    // (robe de base : la teinte d'ensemble de la race, plus saturée)
    expect(base.getHex()).toBe(roanBase(look(breed, ci).coat).getHex());
    expect(b.s).toBeGreaterThan(0.45);
    // (pas traitée en robe claire : modelé peint comme les autres robes foncées)
    expect(u.hDetail.value).toBe(0.5);
    m.dispose();
  });

  it('autant de poils blancs de près qu\'au loin (le flanc ne s\'éclaircit pas quand on approche)', () => {
    const { cut, far } = COAT_LOOKS.roan;
    let n = 0;
    let s = 0;
    for (let i = 0; i < 60000; i++) {
      const x = fract(Math.sin(i * 12.9898) * 43758.5453) * 0.6 - 0.3;
      const y = 0.7 + fract(Math.sin(i * 78.233) * 43758.5453);
      const z = fract(Math.sin(i * 39.425) * 43758.5453) * 2 - 1;
      n++;
      if (noise(x * 170, y * 170, z * 170) > cut) s++;
    }
    expect(Math.abs(s / n - far)).toBeLessThan(0.01);
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    material('trait_breton', 1).onBeforeCompile(sh);
    expect(sh.fragmentShader).toContain(`mix(step(${cut.toFixed(4)}, hNoise(P * 170.0)), ${far.toFixed(4)}, aa)`);
  });

  it('les autres robes ne changent pas (couleur de la race telle quelle)', () => {
    for (const [breed, ci] of [['trait_breton', 0], ['criollo', 0], ['mustang', 0], ['mustang', 1]]) {
      const l = look(breed, ci);
      const m = material(breed, ci);
      const u = m.userData.horseUniforms;
      expect(u.hRoan.value).toBe(0);
      expect(u.hCoat.value.getHex()).toBe(new THREE.Color(l.coat).getHex());
      m.dispose();
    }
  });
});

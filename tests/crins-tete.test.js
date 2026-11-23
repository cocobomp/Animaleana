// Tête du cheval (chantier « crins ») : oreilles pointées vers toi sans partir de côté comme une corne, toupet en mèches
// plus fines. Cheval réaliste au repos (GLB chargé dans node, sans textures).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel, EAR_POSE } from '../src/game/models/horseReal.js';
import { FORE_SHADE_LIGHT } from '../src/game/models/horseCoat.js';
import { createAnimal } from '../src/sim/animal.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
}, 60000);

const horse = (breed, colorIndex = 0) => {
  const a = createAnimal({ species: 'horse', breed, colorIndex, ageDays: 900, seed: 21 });
  return buildRealHorseModel(a.look, a.breed, gltf);
};
const compile = (m) => {
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  m.onBeforeCompile(sh);
  return sh.fragmentShader;
};

/** Bout de chaque oreille (point de l'oreille le plus loin de sa racine) dans le repère de la tête, après n images. */
function earTips(md, ears) {
  const st = { v: 0, moving: false, graze: 0, feeder: 0, turn: 0, fat: 1, near: true, ears };
  md.anim.photo = false;
  for (let f = 0; f < 60; f++) md.anim.update(1 / 30, st, {});
  md.root.updateMatrixWorld(true);
  const inv = md.head.matrixWorld.clone().invert();
  return md.ears.map((e) => new THREE.Vector3(0, 0.12, 0).applyMatrix4(e.matrixWorld).applyMatrix4(inv));
}

describe('oreilles pointées vers toi', () => {
  it('pavillon tourné vers l\'avant et oreilles rapprochées : la pose les règle (y et z), pas seulement penchées', () => {
    expect(EAR_POSE.fwd.y).toBeLessThan(0);
    expect(EAR_POSE.fwd.z).toBeLessThan(0);
  });

  it.each(['arabe', 'selle_francais', 'shetland'])('%s : bouts des oreilles pas plus écartés qu\'au repos, plus en avant', (breed) => {
    const md = horse(breed);
    const rest = earTips(md, null);
    const fwd = earTips(md, 'forward');
    const spread = (t) => Math.abs(t[0].x - t[1].x);
    // (avant : l'oreille lointaine partait de côté comme une corne)
    expect(spread(fwd), breed).toBeLessThanOrEqual(spread(rest) + 0.005);
    for (let i = 0; i < 2; i++) expect(fwd[i].z, `${breed} oreille ${i}`).toBeGreaterThan(rest[i].z);
    md.dispose();
  }, 60000);
});

describe('toupet', () => {
  it('mèches plus fines (cartes de 2,1 cm au plus, avant 2,9) et ombre de contact plus marquée sur les robes claires', () => {
    const md = horse('arabe'); // gris clair, crins clairs
    const g = md.hairMesh.geometry.attributes;
    // (cartes du toupet : sorte 1 ; deux sommets par point, largeur = écart entre les deux)
    let maxW = 0;
    let n = 0;
    for (let i = 0; i + 1 < g.position.count; i += 2) {
      if (g.hairRoot.getW(i) !== 1 || g.hairRoot.getW(i + 1) !== 1) continue;
      const a = new THREE.Vector3().fromBufferAttribute(g.position, i);
      const b = new THREE.Vector3().fromBufferAttribute(g.position, i + 1);
      maxW = Math.max(maxW, a.distanceTo(b));
      n++;
    }
    expect(n).toBeGreaterThan(40);
    expect(maxW).toBeLessThan(0.0215);
    expect(FORE_SHADE_LIGHT).toBeGreaterThan(0.6);
    md.dispose();
  }, 60000);
});

// Toupet couché sur le front (reprise) : de profil, il se dressait devant le front comme une plume (masse épaisse de 2 cm,
// bosse de 4 cm sous la nuque). La masse, de mi-hauteur des yeux à ses pointes, reste près de la vraie peau de la tête.
describe('toupet couché sur le front', () => {
  it.each([['selle_francais'], ['arabe'], ['shetland'], ['falabella'], ['frison'], ['percheron']])('%s : masse du toupet à moins de 2,2 cm de la peau (médiane 1,35)', (breed) => {
    const md = horse(breed);
    md.root.updateMatrixWorld(true);
    const T = md.sdf.head.skin.tris;
    const g = md.hairMesh.geometry.attributes;
    const tri = new THREE.Triangle();
    const cp = new THREE.Vector3();
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    const dist = (p) => {
      let best = Infinity;
      for (let k = 0; k < T.length; k += 9) {
        a.set(T[k], T[k + 1], T[k + 2]);
        if (a.distanceToSquared(p) > 0.01) continue;
        tri.set(a, b.set(T[k + 3], T[k + 4], T[k + 5]), c.set(T[k + 6], T[k + 7], T[k + 8])).closestPointToPoint(p, cp);
        best = Math.min(best, cp.distanceTo(p));
      }
      return best;
    };
    const ds = [];
    for (let i = 0; i < g.position.count; i++) {
      if (g.hairRoot.getW(i) !== 9 || g.hairG.getX(i) < 0.3) continue;
      const p = md.head.worldToLocal(new THREE.Vector3().fromBufferAttribute(g.position, i));
      ds.push(dist(p));
    }
    ds.sort((x, y) => x - y);
    if (process.env.CRINS_DBG) console.log(breed, 'toupet', ds.length, 'médiane', ds[ds.length >> 1].toFixed(4), 'max', ds.at(-1).toFixed(4));
    expect(ds.length).toBeGreaterThan(40);
    // (avant : médiane 1,5 à 2 cm, jusqu'à 3,3 cm)
    expect(ds[ds.length >> 1], breed).toBeLessThan(0.0135);
    expect(ds.at(-1), breed).toBeLessThan(0.022);
    md.dispose();
  }, 60000);
});

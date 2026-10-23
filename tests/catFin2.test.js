// Finitions (2e passe) des chats réalistes : chaton qui dort vraiment roulé en boule sur le flanc, ... Déterministe :
// graines fixes, pas de temps fixe, aucun Math.random (le mixeur est appelé avec des états donnés).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { buildRealCatModel } from '../src/game/models/catReal.js';
import { catLookWithBreed } from '../src/sim/catLook.js';
import { SPECIES } from '../src/sim/species.js';
import { resolveLook } from '../src/sim/animal.js';
import { loadRealCatGltf } from './fixtures/realCatGltf.js';

// (machine chargée : construire et animer un chat prend parfois plusieurs secondes)
vi.setConfig({ testTimeout: 180000 });

const BREEDS = SPECIES.cat.breeds.map((b) => b.id);
let G;
beforeAll(async () => {
  G = { adult: await loadRealCatGltf('adult'), kitten: await loadRealCatGltf('kitten') };
}, 120000);

const lookOf = (breed, colorIndex = 0) => catLookWithBreed({ ...resolveLook('cat', breed, colorIndex), seed: 4242 }, breed);
const cat = (breed, stage = 'adult') => buildRealCatModel(lookOf(breed), stage, G[stage === 'baby' ? 'kitten' : 'adult']);
const _v = new THREE.Vector3();

/** Position d'un os dans le repère du chat. */
function local(md, name) {
  md.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
  return md.bone(name).getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
}

/** Plus bas et plus haut de la peau (repère du chat). */
function skinBox(md, step = 2) {
  md.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
  const m = md.coatMesh;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < m.geometry.attributes.position.count; i += step) {
    m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
    lo = Math.min(lo, _v.y);
    hi = Math.max(hi, _v.y);
  }
  return { lo, hi };
}

describe('chaton en boule', () => {
  // Le chaton qui dort était « bombé, pas roulé » : debout tassé sur ses pattes, dos rond, tête entre les pattes (roulis
  // 0°, tête à 70 % de sa hauteur debout, à 0,54 longueur de corps de ses pieds arrière). Il est maintenant couché sur
  // le flanc (83°), roulé : tête posée contre les pieds arrière, queue enroulée, peau jamais sous le sol.
  it.each(BREEDS)('%s : couché sur le flanc, roulé, tête contre les pieds arrière, rien sous le sol', (breed) => {
    const md = cat(breed, 'baby');
    md.staticPose('stand');
    const stand = skinBox(md);
    const headStand = local(md, 'head').y - stand.lo;
    const len = local(md, 'head').distanceTo(local(md, 'tail1'));
    md.staticPose('curl');
    const box = skinBox(md);
    const L = local(md, 'femurL');
    const R = local(md, 'femurR');
    const roll = Math.asin(Math.min(1, Math.abs(L.y - R.y) / L.distanceTo(R)));
    expect(roll, 'roulis (rad)').toBeGreaterThan(1.05);
    const h = local(md, 'head');
    expect(h.y - box.lo, 'hauteur de la tête').toBeLessThan(0.55 * headStand);
    const paw = Math.min(h.distanceTo(local(md, 'htoesL')), h.distanceTo(local(md, 'htoesR')));
    expect(paw / len, 'tête - pieds arrière').toBeLessThan(0.32);
    expect((box.hi - box.lo) / (stand.hi - stand.lo), 'hauteur de la boule').toBeLessThan(0.75);
    // (le poil long s'écrase un peu sur le sol)
    expect(box.lo).toBeGreaterThan(-0.004 - 0.4 * Math.max(0, md.build.fur));
    expect(box.lo).toBeLessThan(0.01);
    md.dispose();
  });

  it('couché → en boule → couché → debout : jamais sous le sol, jamais en l\'air (peau à moins de 8 mm du sol)', () => {
    for (const breed of ['europeen', 'maine_coon', 'siamois']) {
      const md = cat(breed, 'baby');
      md.staticPose('lie');
      let worst = Infinity;
      let high = -Infinity;
      for (const posture of ['lie', 'curl', 'lie', 'stand']) {
        for (let f = 0; f < 150; f++) {
          md.anim.update(1 / 30, { v: 0, moving: false, posture, sleeping: posture === 'curl' });
          if (f % 3) continue;
          const { lo } = skinBox(md, 3);
          worst = Math.min(worst, lo);
          high = Math.max(high, lo);
        }
      }
      // (au repos, la peau peut s'enfoncer de bodyAllow, 3 mm et plus pour le poil long ; 1 mm de plus en passant)
      expect(worst, breed).toBeGreaterThan(-0.001 - md.anim.bodyAllow);
      expect(high, breed).toBeLessThan(0.008);
      md.dispose();
    }
  });
});

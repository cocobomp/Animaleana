// Chats réalistes (chat de Claire pour les adultes, chaton de FainoDS, GLB chargés dans node sans textures) : fichiers,
// races (gabarits reconnaissables), chatons, yeux dans les orbites, pieds au sol dans les poses et allures, robes,
// tours du spectacle, équipement, crédits CC-BY. Tout est déterministe (graines fixes, pas de temps fixe, aucun
// Math.random : les choix de pose passent par un rng à graine).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealCatModel, realCatBase, deformCat, REAL_CAT_KEYS, pickCatGait, catPosturePath, realCatPose, POSTURE_CLIP } from '../src/game/models/catReal.js';
import { catBuild, catLookWithBreed, CAT_BUILDS } from '../src/sim/catLook.js';
import { SPECIES } from '../src/sim/species.js';
import { resolveLook } from '../src/sim/animal.js';
import { loadRealCatGltf } from './fixtures/realCatGltf.js';

const BREEDS = SPECIES.cat.breeds.map((b) => b.id);
let G;
beforeAll(async () => {
  G = { adult: await loadRealCatGltf('adult'), kitten: await loadRealCatGltf('kitten') };
}, 120000);

const lookOf = (breed, colorIndex = 0) => ({ ...resolveLook('cat', breed, colorIndex), seed: 4242 });
const cat = (breed, stage = 'adult', colorIndex = 0) => {
  const look = lookOf(breed, colorIndex);
  return buildRealCatModel(catLookWithBreed(look, breed), stage, G[stage === 'baby' ? 'kitten' : 'adult']);
};

const _v = new THREE.Vector3();
/** Point le plus bas de la peau (repère du chat). */
function lowest(md, step = 2) {
  md.root.updateMatrixWorld(true);
  const m = md.coatMesh;
  let lo = Infinity;
  for (let i = 0; i < m.geometry.attributes.position.count; i += step) {
    m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
    lo = Math.min(lo, _v.y);
  }
  return lo;
}

describe('chats réalistes : construction', () => {
  it.each(BREEDS)('%s : adulte et chaton se construisent et se posent', (breed) => {
    for (const stage of ['adult', 'baby', 'young']) {
      const md = cat(breed, stage);
      expect(md, `${breed} ${stage}`).toBeTruthy();
      expect(md.realCat).toBe(true);
      expect(md.cat).toBeUndefined();
      for (const k of ['stand', 'sit', 'lie', 'curl']) {
        md.staticPose(k);
        const lo = lowest(md);
        expect(lo, `${breed} ${stage} ${k}`).toBeGreaterThan(-0.004 - 0.4 * Math.max(0, md.build.fur));
        expect(lo, `${breed} ${stage} ${k}`).toBeLessThan(0.02);
      }
      md.dispose();
    }
  });
});

// Robe du cheval (chantier « crins ») : liste blanche des pies aux bords nets (moins de dents de scie, pas de gouttes
// détachées). Shader de la robe du cheval réaliste (GLB chargé dans node, sans textures).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel } from '../src/game/models/horseReal.js';
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

describe('liste blanche des pies : bords nets', () => {
  it('dentelure du bord des marques de tête divisée par 2,5, celle des plaques pies par 3 sur la tête', () => {
    const md = horse('shetland');
    const fs = compile(md.coatMesh.material);
    expect(fs).toContain('float fn = (hNoise(P * 40.0) - 0.5) * 0.024;');
    expect(fs).toContain('* (1.0 - 0.67 * isHead);');
    md.dispose();
  }, 60000);
});

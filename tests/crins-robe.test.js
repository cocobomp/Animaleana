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

describe('sueur et terre sur la cuisse : pas de tache en escalier', () => {
  it('sueur et taches de terre suivent le poids du corps continu (bodyL), pas le numéro de partie des triangles', () => {
    const md = horse('selle_francais', 1);
    const fs = compile(md.coatMesh.material);
    const sweat = fs.slice(fs.indexOf('if (hSweat > 0.001)'));
    expect(sweat).toMatch(/float wet = hSweat \* bodyL \*/);
    const dirt = fs.slice(fs.indexOf('if (hDirt > 0.001)'), fs.indexOf('if (hLegMud > 0.001)'));
    expect(dirt).toMatch(/float bodyMud = bodyL \* smoothstep/);
    expect(dirt.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')).not.toMatch(/bodyS/);
    // la terre des membres s'arrête avant le coude et le grasset (hauteur continue h, pas la limite des triangles)
    expect(dirt).toMatch(/float legMud = isLeg \*.*\(1\.0 - smoothstep\(0\.45, 0\.8, h/);
    md.dispose();
  }, 60000);
});

// Pointillés de la joue (ganache) : un triangle à cheval entre la tête et l'encolure est peint selon la partie de
// son dernier sommet (attribut « flat ») ; le shader de la robe y lisait le repère de la tête dans hInfo, qui pour un
// sommet de l'encolure porte la hauteur du corps : la position fausse passait par l'œil sur un bout du triangle et
// le bord foncé des paupières s'y peignait en points sombres alignés le long de la ganache. Le repère de la tête est
// maintenant juste sur tous les sommets (attribut hHL). GLB chargé dans node, sans textures ; graines fixes.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel, realHorseBase } from '../src/game/models/horseReal.js';
import { createAnimal } from '../src/sim/animal.js';
import { SPECIES } from '../src/sim/species.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
  realHorseBase(gltf);
}, 60000);

const horse = (breed, foal = false) => {
  const a = createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: foal ? 60 : 900, seed: 7 });
  return buildRealHorseModel(foal ? { ...a.look, foal: true } : a.look, a.breed, gltf);
};

// (points pris dans chaque triangle, en coordonnées barycentriques)
const BARY = [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6], [0.45, 0.45, 0.1], [0.45, 0.1, 0.45],
  [0.1, 0.45, 0.45], [0.8, 0.1, 0.1], [0.1, 0.8, 0.1], [0.1, 0.1, 0.8]];

/**
 * Points des triangles peints comme la tête où le shader voit le bord des paupières (distance au centre de l'œil,
 * dans le repère de tête qu'il lit, sous 1,24 rayon) alors que le point est à plus de 3 rayons du globe.
 */
function lidAwayFromEye(md, attr) {
  const g = md.coatMesh.geometry;
  const P = g.attributes.position;
  const part = g.attributes.hPart;
  const A = g.attributes[attr];
  const eye = md.coatMesh.material.userData.horseUniforms.hEye.value;
  const eg = md.bounds.meshes[1].geometry.attributes.position;
  const centers = [new THREE.Vector3(), new THREE.Vector3()];
  const n = [0, 0];
  const v = new THREE.Vector3();
  for (let i = 0; i < eg.count; i++) {
    const s = eg.getX(i) > 0 ? 0 : 1;
    centers[s].add(v.fromBufferAttribute(eg, i));
    n[s]++;
  }
  centers.forEach((c, s) => c.multiplyScalar(1 / n[s]));
  let r = 0;
  for (let i = 0; i < eg.count; i++) r += v.fromBufferAttribute(eg, i).distanceTo(centers[eg.getX(i) > 0 ? 0 : 1]);
  r /= eg.count;
  const idx = g.index.array;
  let bad = 0;
  let samples = 0;
  const p = new THREE.Vector3();
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    if (part.getX(tri[2]) !== 1) continue; // dernier sommet de la tête : triangle peint comme la tête
    for (const w of BARY) {
      const hl = [0, 1, 2].map((k) => w[0] * A.getComponent(tri[0], k) + w[1] * A.getComponent(tri[1], k) + w[2] * A.getComponent(tri[2], k));
      p.set(0, 0, 0);
      for (let j = 0; j < 3; j++) p.addScaledVector(v.fromBufferAttribute(P, tri[j]), w[j]);
      samples++;
      const eyeD = Math.hypot(Math.abs(hl[0]) - eye.x, hl[1] - eye.y, hl[2] - eye.z) / eye.w;
      if (eyeD < 1.24 && Math.min(p.distanceTo(centers[0]), p.distanceTo(centers[1])) > 3 * r) bad++;
    }
  }
  return { bad, samples };
}

describe('joue du cheval réaliste', () => {
  it('le shader lit le repère de la tête et la hauteur dans hHL (justes sur tous les sommets)', () => {
    const md = horse('selle_francais');
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    md.coatMesh.material.onBeforeCompile(sh);
    expect(sh.vertexShader).toContain('attribute vec4 hHL;');
    expect(sh.fragmentShader).toMatch(/vec3 hl = vHHL\.xyz;/);
    // sur un sommet de la tête, hHL redit son repère de tête (hInfo) ; ailleurs, sa hauteur relative au coude
    const g = md.coatMesh.geometry.attributes;
    let head = 0;
    let body = 0;
    for (let i = 0; i < g.position.count; i++) {
      const part = g.hPart.getX(i);
      if (part === 1) {
        head++;
        for (const k of [0, 1, 2]) expect(g.hHL.getComponent(i, k)).toBeCloseTo(g.hInfo.getComponent(i, k), 5);
      } else if (part === 0 || (part >= 2 && part <= 5)) {
        body++;
        expect(g.hHL.getW(i)).toBeCloseTo(g.hInfo.getX(i), 5);
      }
    }
    expect(head).toBeGreaterThan(300);
    expect(body).toBeGreaterThan(1000);
    md.dispose();
  });

  it.each(SPECIES.horse.breeds.map((b) => [b.id]))('%s : le bord des paupières n\'est peint qu\'autour de l\'œil (ni pointillés sur la ganache)', (breed) => {
    for (const foal of [false, true]) {
      const md = horse(breed, foal);
      const { bad, samples } = lidAwayFromEye(md, 'hHL');
      expect(samples).toBeGreaterThan(10000);
      // (avec hInfo, lu avant : 3 à 5 points par race le long de la ganache et sous l'oreille, 149 en tout)
      expect(bad).toBe(0);
      md.dispose();
    }
  });
});

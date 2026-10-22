// Finitions des lapins réalistes vues de près (critique « chats-lapins ») : visage du bélier (truffe, moustaches, yeux),
// ... Déterministe : graines fixes, aucun Math.random (le mixeur est appelé avec des états donnés).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { buildRealRabbitModel } from '../src/game/models/rabbitReal.js';
import { rabbitBuild, rabbitLookWithBreed } from '../src/sim/rabbitLook.js';
import { resolveLook } from '../src/sim/animal.js';
import { loadRealRabbitGltf } from './fixtures/realRabbitGltf.js';

vi.setConfig({ testTimeout: 180000 });

let G;
beforeAll(async () => {
  G = { up: await loadRealRabbitGltf('up'), lop: await loadRealRabbitGltf('lop') };
}, 120000);

const lookOf = (breed, colorIndex = 0) => rabbitLookWithBreed({ ...resolveLook('rabbit', breed, colorIndex), seed: 4242 }, breed);
const rabbit = (breed, stage = 'adult', colorIndex = 0) => {
  const look = lookOf(breed, colorIndex);
  return buildRealRabbitModel(look, stage, G[rabbitBuild(look, stage).model]);
};

describe('visage du bélier', () => {
  // Le bout du nez était pris sur le sommet de tête le plus en avant, n'importe où : chez le bélier, le bord de la joue,
  // à 5,6 cm du milieu. Truffe d'origine gardée sur la joue (tache brune), moustaches parties du vide.
  it.each([['belier', 'adult'], ['belier', 'baby'], ['rex', 'adult']])('%s (%s) : bout du nez sur l\'axe du corps', (b, stage) => {
    const md = rabbit(b, stage);
    const L = md.anim.base.land;
    expect(Math.abs(L.nose.x - L.midX), `${b} repère`).toBeLessThan(0.005);
    expect(Math.abs(md.snoutTip[0] - L.midX), `${b} ${stage} mesuré`).toBeLessThan(0.005);
    md.dispose();
  });

  it.each([['belier', 'adult'], ['belier', 'baby'], ['rex', 'adult']])('%s (%s) : les moustaches partent de part et d\'autre du nez (moins de 3 cm d\'écart)', (b, stage) => {
    const md = rabbit(b, stage);
    md.staticPose('crouch');
    md.root.updateMatrixWorld(true);
    let w = null;
    md.root.traverse((o) => {
      if (o.userData?.whiskers) w = o;
    });
    expect(w, b).toBeTruthy();
    const p = w.geometry.attributes.position;
    const xs = [];
    for (let i = 0; i < p.count; i += 8) xs.push(new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(w.matrixWorld).x);
    expect(Math.max(...xs) - Math.min(...xs), `${b} ${stage}`).toBeLessThan(0.03);
    md.dispose();
  });

  // Yeux peints dans la texture de 256 px (trous sombres déchirés) : repeints ronds à leur place mesurée sur la texture.
  it('bélier : yeux repeints ronds par la robe, à la place des yeux peints, rayon de 7 à 9 mm ; jamais pour les autres', () => {
    const md = rabbit('belier');
    const eyes = md.anim.base.land.eyes;
    expect(eyes[0].painted).toBe(true);
    expect(eyes[0].c.distanceTo(new THREE.Vector3(0.0319, 0.2809, 0.1035))).toBeLessThan(0.004);
    expect(eyes[1].c.x).toBeCloseTo(-eyes[0].c.x, 3);
    // (la robe reçoit le rayon des yeux peints : shader compilé à blanc)
    const compile = (m) => {
      const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>' };
      m.coatMesh.material.onBeforeCompile(sh);
      return sh;
    };
    const sh = compile(md);
    expect(sh.uniforms.cKeepOpt.value.z).toBeCloseTo(0.0078, 4);
    expect(sh.fragmentShader).toContain('cEyeIn');
    md.dispose();
    const rex = rabbit('rex');
    expect(rex.anim.base.land.eyes[0].painted).toBeFalsy();
    expect(compile(rex).uniforms.cKeepOpt.value.z).toBe(0);
    rex.dispose();
  });
});

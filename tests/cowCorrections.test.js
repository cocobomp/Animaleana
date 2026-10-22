// Corrections des vaches réalistes après les contre-vérifications (beauté et jeu) : grain sans taches fantômes, ventre
// blanc net, chignon des vaches sans cornes et des veaux, poil long de la Highland, mangeoire, sabots des veaux, sol en se
// couchant, cornes de la Hérens, taureau dans le van. GLB chargés dans node sans textures ; tout est déterministe (pas de
// temps fixe, aucun tirage au hasard).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealCowModel, POLL_CAP } from '../src/game/models/cowReal.js';
import { COW_GRAIN, makeCowUniforms, setCowCoat, cowMaterial } from '../src/game/models/cowCoat.js';
import { cowBuild } from '../src/sim/cowLook.js';
import { resolveLook } from '../src/sim/animal.js';
import { loadRealCowGltf } from './fixtures/realCowGltf.js';

let G;
beforeAll(async () => {
  G = await loadRealCowGltf();
}, 120000);

const lookOf = (breed, o = {}) => ({
  ...resolveLook('cow', breed, o.color ?? 0), seed: 4242, sex: o.sex ?? 'f', ...(o.calf ? { calf: true } : {}), ...(o.young ? { young: true } : {}),
  ...(o.udderFill !== undefined ? { udderFill: o.udderFill } : {}),
});
const cow = (breed, o = {}) => buildRealCowModel(lookOf(breed, o), breed, G);
const _v = new THREE.Vector3();

describe('robe', () => {
  it('grain ramené à la même clarté dans les anciennes taches de la photo et hors taches (vache) ; rien pour le taureau', () => {
    const [kOut, kIn] = COW_GRAIN.cow;
    // (mesuré à l'écran : rapport 1,10 entre les deux champs ; la robe garde sa clarté moyenne — 28 % de taches)
    expect(kIn / kOut).toBeGreaterThan(1.08);
    expect(kIn / kOut).toBeLessThan(1.12);
    expect(0.28 * kIn + 0.72 * kOut).toBeGreaterThan(0.98);
    expect(0.28 * kIn + 0.72 * kOut).toBeLessThan(1.02);
    expect(COW_GRAIN.bull).toEqual([1, 1]);
    for (const [kind, k] of [['cow', COW_GRAIN.cow], ['bull', COW_GRAIN.bull]]) {
      const u = makeCowUniforms();
      setCowCoat(u, cowBuild(lookOf('retinta'), { breed: 'retinta', sex: kind === 'bull' ? 'm' : 'f' }), kind);
      expect([u.cGrain.value.x, u.cGrain.value.y]).toEqual(k);
    }
    // (le shader applique le facteur au grain d'après le champ des taches du masque)
    const { mat } = cowMaterial(null, makeCowUniforms());
    const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    mat.onBeforeCompile(sh);
    expect(sh.fragmentShader).toMatch(/mix\(cGrain\.x, cGrain\.y, smoothstep\(0\.4, 0\.6, mk\.r\)\)/);
    // (ventre blanc par une ligne nette — plus de rampe grise de 28 % de la hauteur du tronc, tache effacée à 80 %)
    expect(sh.fragmentShader).toMatch(/bellyW = smoothstep\(-0\.012, 0\.012, wb\)/);
    expect(sh.fragmentShader).not.toMatch(/belly \* 0\.8/);
  });
});

describe('sans cornes : un chignon, plus de pyramides', () => {
  /** Plus grande distance des sommets de la corne gauche (poids > 0,3) à la base de son os, en unités du modèle et de la tête (le veau a la tête 1,3 fois plus grosse). */
  const hornReach = (md) => {
    md.root.updateMatrixWorld(true);
    const P = md.anim.base.prim;
    const o = md.bone('hornL').getWorldPosition(new THREE.Vector3());
    const s = md.root.scale.x * md.headBone.scale.x;
    let far = 0;
    for (let i = 0; i < P.count; i++) {
      if (P.part[i * 4] < 0.3 || P.pos[i * 3] < 0) continue;
      md.mesh.getVertexPosition(i, _v).applyMatrix4(md.mesh.matrixWorld);
      far = Math.max(far, _v.distanceTo(o) / s);
    }
    return far;
  };
  /** Plus grand étirement des arêtes qui touchent la corne (longueur posée / longueur au repos du modèle). */
  const hornStretch = (md) => {
    md.root.updateMatrixWorld(true);
    const P = md.anim.base.prim;
    const idx = md.mesh.geometry.index.array;
    const s = md.root.scale.x;
    const w = (i) => md.mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(md.mesh.matrixWorld).divideScalar(s);
    let worst = 0;
    for (let t = 0; t < idx.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = idx[t + e];
        const b = idx[t + ((e + 1) % 3)];
        if (P.part[a * 4] < 0.1 && P.part[b * 4] < 0.1) continue;
        const rest = Math.hypot(P.pos[a * 3] - P.pos[b * 3], P.pos[a * 3 + 1] - P.pos[b * 3 + 1], P.pos[a * 3 + 2] - P.pos[b * 3 + 2]);
        if (rest < 1e-4) continue;
        worst = Math.max(worst, w(a).distanceTo(w(b)) / rest);
      }
    }
    return worst;
  };

  it('Angus, Charolaise et les veaux : corne écrasée en bosse (moins de 8,5 cm de la base, plus de 12 cm pour une corne), peinte de la robe, peau jamais étirée', () => {
    const horned = cow('holstein');
    horned.staticPose('stand');
    expect(hornReach(horned)).toBeGreaterThan(0.12);
    horned.dispose();
    for (const [b, o] of [['angus', {}], ['charolaise', {}], ['wagyu', { calf: true }], ['herens', { calf: true }], ['highland', { calf: true }], ['holstein', { calf: true }]]) {
      const md = cow(b, o);
      const tag = `${b} ${JSON.stringify(o)}`;
      md.staticPose('stand');
      expect(md.build.hornSize, tag).toBe(0);
      expect(hornReach(md), tag).toBeLessThan(0.085);
      expect(hornStretch(md), tag).toBeLessThan(2.6);
      // (aucun sommet peint couleur corne)
      const part = md.mesh.geometry.attributes.cowPart.array;
      let horn = 0;
      for (let i = 0; i < part.length; i += 4) horn = Math.max(horn, part[i]);
      expect(horn, tag).toBe(0);
      md.dispose();
    }
    // (le veau a de petits boutons de corne, l'adulte sans cornes un chignon à peine bombé)
    expect(POLL_CAP.calf).toBeGreaterThan(POLL_CAP.adult);
  });

  it('les races à cornes gardent leurs cornes couleur corne (Holstein, Normande, génisse Highland)', () => {
    for (const [b, o] of [['holstein', {}], ['normande', {}], ['highland', { young: true }]]) {
      const md = cow(b, o);
      const part = md.mesh.geometry.attributes.cowPart.array;
      let horn = 0;
      for (let i = 0; i < part.length; i += 4) horn = Math.max(horn, part[i]);
      expect(horn, b).toBeGreaterThan(0.9);
      md.dispose();
    }
  });
});

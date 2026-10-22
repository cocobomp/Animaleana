// Corrections du cheval après la critique « finitions » (téléphone 390×844, caméra du jeu) : triangles noirs à la nuque
// et à la base des oreilles, dents de scie du pangaré, gris pommelés en mosaïque, mèches de gauche en rangée
// régulière… GLB chargé dans node, sans textures ; rien ne dépend du hasard (graines fixes).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { realHorseBase, buildRealHorseModel, leftLocks } from '../src/game/models/horseReal.js';
import { coatMaterial } from '../src/game/models/horseCoat.js';
import { createAnimal } from '../src/sim/animal.js';
import { horseBuild } from '../src/sim/horseLook.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
  realHorseBase(gltf);
}, 60000);

const sm = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};
const animal = (breed, colorIndex = 0) => createAnimal({ species: 'horse', breed, colorIndex, ageDays: 80, seed: 7 });
const horse = (breed, colorIndex = 0) => {
  const a = animal(breed, colorIndex);
  return buildRealHorseModel(a.look, a.breed, gltf);
};
const compile = (m) => {
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  m.onBeforeCompile(sh);
  return sh.fragmentShader;
};

describe('pelage : parties du corps prises au dernier sommet (flat)', () => {
  it('nuque et base des oreilles : aucun triangle à cheval entre l\'oreille et la nuque n\'est peint en pointe noire d\'oreille (index complet et réduit)', () => {
    const md = horse('selle_francais', 0); // bai : pointes des oreilles noires
    const g = md.coatMesh.geometry;
    const part = g.attributes.hPart;
    const info = g.attributes.hInfo;
    const ear = (v) => part.getX(v) > 7.5;
    for (const idx of [g.index.array, md.lod?.coat?.index?.array ?? gltf.userData.horseBase.prims.coat.lodIndex].filter(Boolean)) {
      let mixed = 0;
      let darkened = 0;
      for (let t = 0; t < idx.length; t += 3) {
        const vs = [idx[t], idx[t + 1], idx[t + 2]];
        const e = vs.map(ear);
        if (!e.some(Boolean) || e.every(Boolean)) continue;
        mixed++;
        // (WebGL : la partie du triangle est celle de son dernier sommet ; la pointe noire de l'oreille s'y peint là
        // où la hauteur interpolée passe 0,65)
        if (e[2] && Math.max(...vs.map((v) => sm(0.65, 0.95, info.getX(v)))) > 0.3) darkened++;
        expect(e[2]).toBe(false);
      }
      expect(mixed).toBeGreaterThan(20); // (ils existent : la base de l'oreille touche la nuque et le front)
      expect(darkened).toBe(0);
    }
    md.dispose();
  });

  it('pangaré : ventre éclairci continu du corps au haut des membres (coude, grasset), pas de dents de scie', () => {
    const md = horse('trotteur_francais', 3); // noir pangaré
    const fs = compile(md.coatMesh.material);
    expect(fs).toContain('float bodyL = clamp(bodyS + isLeg * smoothstep(0.55, 0.9, h), 0.0, 1.0);');
    expect(fs).toContain('float belly = under * bodyL;');
    // (triangles à cheval entre un membre et le corps : la hauteur relative au coude y est assez haute pour que le
    // poids du corps prolongé vaille presque 1 aux sommets du membre — aucune marche à la frontière)
    const g = md.coatMesh.geometry;
    const part = g.attributes.hPart;
    const info = g.attributes.hInfo;
    const leg = (v) => part.getX(v) > 1.5 && part.getX(v) < 5.5;
    const body = (v) => part.getX(v) < 0.5;
    const I = g.index.array;
    let n = 0;
    const steps = [];
    for (let t = 0; t < I.length; t += 3) {
      const vs = [I[t], I[t + 1], I[t + 2]];
      if (!vs.some(leg) || !vs.some(body)) continue;
      n++;
      // poids du corps à chaque sommet selon que le triangle est pris pour un membre ou pour le corps
      for (const v of vs) steps.push(1 - sm(0.55, 0.9, info.getX(v)));
    }
    expect(n).toBeGreaterThan(50);
    steps.sort((a, b) => a - b);
    // (95 % des sommets : écart de moins de 10 % entre les deux lectures)
    expect(steps[Math.floor(steps.length * 0.95)]).toBeLessThan(0.1);
    md.dispose();
  });
});

describe('robes', () => {
  it('le ton doré du palomino suit aussi le haut des membres (même poids continu)', () => {
    const a = animal('quarter', 1);
    const fs = compile(coatMaterial(a.look, horseBuild(null, a.look), null, { detail: null, normalMap: null, hoofY: 0.12 }));
    expect(fs).toContain('hGold * hGoldDap * bodyL * 0.7');
  });
});

describe('crinière : mèches de gauche', () => {
  const spread = (xs) => {
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length) / m;
  };
  it('en grappes qui se chevauchent, séparées par des vides inégaux, longueurs et largeurs dispersées, tons propres (pas une rangée régulière de pétales)', () => {
    // (même suite que horseReal.js, mulberry(4127))
    const mulberry = (seed) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };
    for (const n of [8, 10]) {
      const crest = 0.75;
      const L = leftLocks(n, mulberry(4127), crest, 0.34);
      expect(L.length).toBe(n);
      const t = L.map((m) => m.t);
      for (let k = 1; k < n; k++) expect(t[k]).toBeGreaterThan(t[k - 1]);
      expect(Math.min(...t)).toBeGreaterThan(0.08);
      expect(Math.max(...t)).toBeLessThan(0.92);
      // écarts entre voisines (en mètres) : des chevauchements (moins que la somme des demi-largeurs) et des vides
      const gaps = [];
      let overlaps = 0;
      for (let k = 1; k < n; k++) {
        const d = (t[k] - t[k - 1]) * crest;
        gaps.push(d);
        if (d < (L[k].w + L[k - 1].w) * crest) overlaps++;
      }
      expect(overlaps).toBeGreaterThanOrEqual(n - 4);
      expect(Math.max(...gaps) / Math.min(...gaps)).toBeGreaterThan(3);
      // (grappes : au moins deux vides de plus du double de l'écart médian ; l'ancienne répartition, une mèche par
      // huitième de la crête, n'en avait aucun)
      const med = [...gaps].sort((x, y) => x - y)[Math.floor(gaps.length / 2)];
      expect(gaps.filter((d) => d > 2 * med).length).toBeGreaterThanOrEqual(2);
      // longueurs : une longue par grappe, des courtes ; largeurs inégales ; tons différents
      const lens = L.map((m) => m.L);
      expect(Math.max(...lens) / Math.min(...lens)).toBeGreaterThan(2);
      expect(spread(lens)).toBeGreaterThan(0.27); // (avant : 0,22)
      expect(Math.max(...L.map((m) => m.w)) / Math.min(...L.map((m) => m.w))).toBeGreaterThan(1.3);
      expect(Math.max(...L.map((m) => m.tone)) - Math.min(...L.map((m) => m.tone))).toBeGreaterThan(0.1);
      // (demi-largeur 2,1 à 4,2 cm)
      for (const m of L) {
        expect(m.w * crest).toBeGreaterThanOrEqual(0.021);
        expect(m.w * crest).toBeLessThanOrEqual(0.042);
      }
    }
    expect(leftLocks(0, mulberry(4127), 0.75, 0.34)).toEqual([]);
  });
});

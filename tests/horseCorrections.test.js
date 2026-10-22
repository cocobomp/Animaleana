// Corrections du cheval après la critique « finitions » (téléphone 390×844, caméra du jeu) : triangles noirs à la nuque
// et à la base des oreilles, dents de scie du pangaré, gris pommelés en mosaïque, mèches de gauche en rangée
// régulière… GLB chargé dans node, sans textures ; rien ne dépend du hasard (graines fixes).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { realHorseBase, buildRealHorseModel, leftLocks, groundTilt, TILT_MAX, GALLOP_TS_MAX } from '../src/game/models/horseReal.js';
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

describe('terrain en pente', () => {
  // (cheval posé comme dans le jeu : racine → groupe d'échelle → modèle ; terrain : un plan incliné)
  const place = (md, scale, heading, heightAt, x = 3, z = -2) => {
    const root = new THREE.Group();
    const sg = new THREE.Group();
    sg.scale.setScalar(scale);
    sg.add(md.root);
    root.add(sg);
    root.position.set(x, heightAt(x, z), z);
    root.rotation.y = heading;
    return { root, model: md, scale, heading, world: { heightAt } };
  };
  // plus grand écart (m) entre le dessous de chaque sabot (point le plus bas de sa sole) et le terrain sous lui
  const hoofGap = (e) => {
    e.root.updateMatrixWorld(true);
    const p = new THREE.Vector3();
    let worst = 0;
    for (const l of e.model.legs) {
      let low = Infinity;
      for (const q of l.solePts) {
        p.copy(q).applyMatrix4(l.fetlock.matrixWorld);
        low = Math.min(low, p.y - e.world.heightAt(p.x, p.z));
      }
      worst = Math.max(worst, Math.abs(low));
    }
    return worst;
  };
  it('sabots sur le terrain en pente (28 % dans l\'axe, 15 % en travers), amorti ; rien hors du terrain', () => {
    for (const [breed, scale] of [['selle_francais', 1], ['shetland', 0.58]]) {
      const md = horse(breed);
      for (const [gx, gz, heading] of [[0, 0.28, 0], [0.15, 0, 0.4], [0.12, -0.22, 2.3]]) {
        const heightAt = (x, z) => 0.5 + gx * x + gz * z;
        const e = place(md, scale, heading, heightAt);
        // (au repos : sole à 3 mm sous le sol du modèle)
        const flat = hoofGap(e);
        for (let i = 0; i < 40; i++) {
          e.root.position.y = heightAt(e.root.position.x, e.root.position.z); // (snap, comme AnimalEntity)
          groundTilt(e, 1 / 60);
        }
        const tilted = hoofGap(e);
        expect(flat, `${breed} ${gx} ${gz}`).toBeGreaterThan(0.03 * scale);
        expect(tilted, `${breed} ${gx} ${gz}`).toBeLessThan(0.012);
        expect(Math.abs(e.root.rotation.x)).toBeLessThanOrEqual(TILT_MAX.pitch);
        expect(Math.abs(e.root.rotation.z)).toBeLessThanOrEqual(TILT_MAX.roll);
        md.root.removeFromParent();
      }
      // hors du terrain (dans un van, sur un podium) : inclinaison qui revient à zéro, hauteur laissée telle quelle
      const heightAt = (x, z) => 0.3 * z;
      const e = place(md, scale, 0, heightAt);
      for (let i = 0; i < 30; i++) {
        e.root.position.y = heightAt(e.root.position.x, e.root.position.z);
        groundTilt(e, 1 / 60);
      }
      expect(Math.abs(e.root.rotation.x)).toBeGreaterThan(0.2);
      const y = e.root.position.y + 0.45;
      for (let i = 0; i < 60; i++) {
        e.root.position.y = y;
        groundTilt(e, 1 / 60);
      }
      expect(Math.abs(e.root.rotation.x)).toBeLessThan(0.01);
      expect(e.root.position.y).toBe(y);
      md.root.removeFromParent();
      md.dispose();
    }
  });
});

describe('galop monté très rapide', () => {
  // (instants de départ des clips fixés : le mixeur les tire au hasard)
  const fixedHorse = (breed) => {
    const random = Math.random;
    let n = 0;
    Math.random = () => (0.31 + 0.377 * n++) % 1;
    try {
      const md = horse(breed);
      md.anim.useGaits();
      md.anim.resting = false;
      md.anim.restTimer = 1e9;
      return md;
    } finally {
      Math.random = random;
    }
  };
  const go = (v) => ({ v, moving: true, sleeping: false, sad: false, graze: 0, feeder: 0, turn: 0, fat: 1 });
  // Vitesse montée la plus haute, ramenée à la taille 1 (Player.update : 11 × (1 + 100/150) × min(1,2 ; taille + 0,2)
  // × selle de course 1,12, ÷ taille) : 24,6 m/s (Selle français), 27,6 (Shetland), 28,8 (Falabella).
  it.each([['selle_francais', 1], ['shetland', 0.58], ['falabella', 0.5]])('%s à sa vitesse montée la plus haute : les sabots posés ne glissent pas (avant : 8 à 28 cm)', (breed, sc) => {
    const v = (11 * (1 + 100 / 150) * Math.min(1.2, sc + 0.2) * 1.12) / sc;
    const md = fixedHorse(breed);
    expect(v / md.anim.natural.gallopX).toBeLessThan(GALLOP_TS_MAX);
    const dt = 1 / 60;
    const step = () => {
      md.root.position.z += v * dt;
      md.anim.update(dt, go(v), {});
    };
    for (let f = 0; f < 200; f++) step();
    const p = new THREE.Vector3();
    const flat = md.legs.map(() => null);
    const flats = [];
    for (let f = 0; f < 240; f++) {
      step();
      md.root.updateMatrixWorld(true);
      md.legs.forEach((l, i) => {
        let hi = -Infinity;
        let z = 0;
        for (const q of l.solePts) {
          p.copy(q).applyMatrix4(l.fetlock.matrixWorld);
          hi = Math.max(hi, p.y);
          z += p.z / l.solePts.length;
        }
        if (hi < 0.015) {
          flat[i] ??= { z0: z, n: 0 };
          flat[i].z1 = z;
          flat[i].n++;
        } else if (flat[i]) {
          if (flat[i].n > 1) flats.push(Math.abs(flat[i].z1 - flat[i].z0));
          flat[i] = null;
        }
      });
    }
    md.dispose();
    expect(flats.length).toBeGreaterThan(6);
    expect(Math.max(...flats)).toBeLessThan(0.02);
  });
});

describe('couverture imperméable en mouvement', () => {
  // (sommet de la nappe sous la peau : parité verticale contre le pelage déformé, profondeur verticale)
  const insideOf = (C, I) => {
    const CS = 0.04;
    const grid = new Map();
    for (let t = 0; t < I.length; t += 3) {
      let x0 = Infinity;
      let x1 = -Infinity;
      let z0 = Infinity;
      let z1 = -Infinity;
      for (let k = 0; k < 3; k++) {
        const o = I[t + k] * 3;
        x0 = Math.min(x0, C[o]);
        x1 = Math.max(x1, C[o]);
        z0 = Math.min(z0, C[o + 2]);
        z1 = Math.max(z1, C[o + 2]);
      }
      for (let a = Math.floor(x0 / CS); a <= Math.floor(x1 / CS); a++) {
        for (let b = Math.floor(z0 / CS); b <= Math.floor(z1 / CS); b++) {
          const key = a * 100003 + b;
          if (!grid.has(key)) grid.set(key, []);
          grid.get(key).push(t);
        }
      }
    }
    return (p) => {
      const L = grid.get(Math.floor(p.x / CS) * 100003 + Math.floor(p.z / CS));
      if (!L) return 0;
      let up = 0;
      let dn = 0;
      let dUp = Infinity;
      let dDn = Infinity;
      for (const t of L) {
        const a = I[t] * 3;
        const b = I[t + 1] * 3;
        const c = I[t + 2] * 3;
        const det = (C[b + 2] - C[c + 2]) * (C[a] - C[c]) + (C[c] - C[b]) * (C[a + 2] - C[c + 2]);
        if (Math.abs(det) < 1e-12) continue;
        const l1 = ((C[b + 2] - C[c + 2]) * (p.x - C[c]) + (C[c] - C[b]) * (p.z - C[c + 2])) / det;
        const l2 = ((C[c + 2] - C[a + 2]) * (p.x - C[c]) + (C[a] - C[c]) * (p.z - C[c + 2])) / det;
        if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
        const y = l1 * C[a + 1] + l2 * C[b + 1] + (1 - l1 - l2) * C[c + 1];
        if (y > p.y) {
          up++;
          dUp = Math.min(dUp, y - p.y);
        } else {
          dn++;
          dDn = Math.min(dDn, p.y - y);
        }
      }
      return up % 2 === 1 && dn % 2 === 1 ? Math.min(dUp, dDn) : 0;
    };
  };
  it.each([['akhal_teke'], ['trait_breton'], ['comtois']])('%s : la nappe ne passe pas sous la peau de la hanche ni du grasset au pas et au trot (avant : 3 à 4 cm)', async (breed) => {
    const { buildGear } = await import('../src/game/gearModels.js');
    const random = Math.random;
    let n = 0;
    Math.random = () => (0.37 + 0.618 * n++) % 1;
    try {
      const a = createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: 80, seed: 1234 });
      const md = buildRealHorseModel(a.look, a.breed, gltf);
      md.anim.useGaits?.();
      const own = new Set(md.bounds.meshes);
      buildGear(md, a.look, { blanket: { item: 'blanketRain', color: 'navy' } });
      const shell = md.bounds.meshes.filter((m) => !own.has(m)).sort((x, y) => y.geometry.attributes.position.count - x.geometry.attributes.position.count)[0];
      const coat = md.coatMesh;
      const g = coat.geometry;
      const p = new THREE.Vector3();
      let worst = 0;
      for (const u of [md.anim.natural.walk, md.anim.natural.trot]) {
        const st = { v: u, moving: true, graze: 0, feeder: 0, turn: 0, fat: 1 };
        for (let f = 0; f < 60; f++) md.anim.update(1 / 60, st, {});
        for (let f = 0; f < 8; f++) {
          md.anim.update(0.083, st, {});
          md.root.updateMatrixWorld(true);
          const C = new Float32Array(g.attributes.position.count * 3);
          for (let i = 0; i < g.attributes.position.count; i++) coat.getVertexPosition(i, p).applyMatrix4(coat.matrixWorld).toArray(C, i * 3);
          const inside = insideOf(C, g.index.array);
          const sp = shell.geometry.attributes.position;
          for (let i = 0; i < sp.count; i++) worst = Math.max(worst, inside(shell.getVertexPosition(i, p).applyMatrix4(shell.matrixWorld)));
        }
      }
      md.dispose();
      expect(worst).toBeLessThan(0.003);
    } finally {
      Math.random = random;
    }
  }, 120000);
});

// Crinière vue du côté gauche (chantier « crins ») : une frange continue de crins le long de la crête, sans grands vides
// ni glaçons ; le côté droit (où tombe la crinière) garde sa nappe. Mesures sur le cheval réaliste au repos (GLB chargé
// dans node, sans textures).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel, leftLocks } from '../src/game/models/horseReal.js';
import { hairMassPixels, HAIR_TEX, HAIR_MASS, HAIR_CUT } from '../src/game/models/horseHair.js';
import { createAnimal } from '../src/sim/animal.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
}, 60000);

const horse = (breed, colorIndex = 0) => {
  const a = createAnimal({ species: 'horse', breed, colorIndex, ageDays: 900, seed: 31 });
  return buildRealHorseModel(a.look, a.breed, gltf);
};

/**
 * Profil de la crinière vue de gauche, par tranches de 1 cm le long de l'encolure (z) : haut de la crinière (le dessus
 * du rouleau, le plus haut de ses crins dans la tranche) et point le plus bas des crins du côté gauche (x > 2 cm).
 * Renvoie [{ z, top, low, depth }] pour les tranches du milieu de la crête (de 15 à 85 % de sa longueur ; aux deux bouts,
 * la crinière s'amincit).
 */
function leftProfile(md) {
  const geo = md.hairMesh.geometry;
  const g = geo.attributes;
  const idx = geo.index.array;
  const top = new Map();
  const low = new Map();
  let z0 = Infinity;
  let z1 = -Infinity;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const p = new THREE.Vector3();
  // (chaque triangle de la crinière échantillonné en 21 points : les sommets seuls, espacés de 2 à 3 cm, laissaient des
  // tranches de 1 cm sans le bas d'une mèche)
  for (let t = 0; t < idx.length; t += 3) {
    const kind = g.hairRoot.getW(idx[t]);
    // (crinière seulement : cartes, sorte 0, et masse, sorte 8)
    if (kind !== 0 && kind !== 8) continue;
    a.fromBufferAttribute(g.position, idx[t]);
    b.fromBufferAttribute(g.position, idx[t + 1]);
    c.fromBufferAttribute(g.position, idx[t + 2]);
    for (let i = 0; i <= 5; i++) {
      for (let j = 0; j <= 5 - i; j++) {
        p.set(0, 0, 0).addScaledVector(a, i / 5).addScaledVector(b, j / 5).addScaledVector(c, 1 - (i + j) / 5);
        const k = Math.round(p.z / 0.01);
        top.set(k, Math.max(top.get(k) ?? -Infinity, p.y));
        if (Math.abs(p.x) < 0.02) {
          z0 = Math.min(z0, p.z);
          z1 = Math.max(z1, p.z);
        }
        if (p.x > 0.02) low.set(k, Math.min(low.get(k) ?? Infinity, p.y));
      }
    }
  }
  const out = [];
  for (let k = Math.ceil((z0 + 0.15 * (z1 - z0)) / 0.01); k <= Math.floor((z0 + 0.85 * (z1 - z0)) / 0.01); k++) {
    if (!top.has(k)) continue;
    out.push({ z: k * 0.01, top: top.get(k), low: low.get(k) ?? top.get(k), depth: top.get(k) - (low.get(k) ?? top.get(k)) });
  }
  return out;
}

/**
 * Creux de la frange : tranches où elle remonte de plus de 3,5 cm sous ses voisines à moins de 4 cm des deux côtés (avant :
 * jusqu'à 20 cm entre deux grappes ; le bas arrondi de deux mèches voisines en fait 3 au plus).
 */
function notches(prof) {
  let n = 0;
  for (let i = 0; i < prof.length; i++) {
    const near = prof.filter((p) => Math.abs(p.z - prof[i].z) <= 0.04 + 1e-6);
    const left = Math.max(...near.filter((p) => p.z < prof[i].z).map((p) => p.depth), -1);
    const right = Math.max(...near.filter((p) => p.z > prof[i].z).map((p) => p.depth), -1);
    if (Math.min(left, right) - prof[i].depth > 0.035) n++;
  }
  return n;
}

describe('crinière vue de gauche : une frange continue', () => {
  it.each([['pre', 0], ['haflinger', 0], ['selle_francais', 1], ['frison', 0], ['shetland', 0]])(
    '%s : crins tout le long de la crête, sans vide ni dents (profondeur sous la crête régulière)',
    (breed, c) => {
      const md = horse(breed, c);
      const prof = leftProfile(md);
      if (process.env.CRINS_DBG) console.log(breed, prof.map((p) => `${p.z.toFixed(2)}:${(p.depth * 100).toFixed(1)}`).join(' '));
      const d = prof.map((p) => p.depth).sort((a, b) => a - b);
      const q1 = d[Math.floor(d.length / 4)];
      // (la plus courte des tranches : au moins 70 % du premier quart — avant, entre deux grappes, il ne restait que le
      // bord du rouleau ; et pas de creux étroits en dent de scie)
      expect(d[0] / q1, `${breed} min/premier quart`).toBeGreaterThan(0.6);
      // (au moins 7 cm sous le haut du rouleau partout : avant, il ne restait par endroits que son bord, 4 à 6 cm)
      expect(d[0], `${breed} min`).toBeGreaterThan(0.07);
      expect(notches(prof), `${breed} creux`).toBe(0);
      md.dispose();
    },
    60000,
  );

  it('mèches de gauche : voisines qui se recouvrent toujours, surtout courtes, quelques longues', () => {
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
    for (const [n, share] of [[15, 0.12], [17, 0.3]]) {
      const crest = 0.75;
      const L = leftLocks(n, mulberry(4127), crest, 0.34, share);
      expect(L.length).toBe(n);
      for (let k = 1; k < n; k++) {
        expect(L[k].t).toBeGreaterThan(L[k - 1].t);
        // (recouvrement d'au moins un cinquième de l'écart)
        expect((L[k].w + L[k - 1].w) * crest, `mèches ${k - 1} et ${k}`).toBeGreaterThan((L[k].t - L[k - 1].t) * crest * 1.15);
      }
      // (de la première à la dernière : la crête entière, du garrot à la nuque)
      expect(L[0].t - L[0].w).toBeLessThan(0.08);
      expect(L.at(-1).t + L.at(-1).w).toBeGreaterThan(0.9);
      const short = L.filter((m) => !m.long);
      expect(short.length).toBeGreaterThan(n * 0.5);
      // (courtes : au plus 9 cm sous le bord du rouleau pour une crinière de 34 cm)
      for (const m of short) expect(m.L).toBeLessThan(0.09);
      // (largeurs et tons propres à chacune)
      expect(Math.max(...L.map((m) => m.w)) / Math.min(...L.map((m) => m.w))).toBeGreaterThan(1.2);
      expect(Math.max(...L.map((m) => m.tone)) - Math.min(...L.map((m) => m.tone))).toBeGreaterThan(0.1);
      // (deux couches : deux voisines ne sont jamais à la même hauteur au-dessus de la peau)
      for (let k = 1; k < n; k++) expect(L[k].h).not.toBe(L[k - 1].h);
    }
  });
});

describe('bout des mèches de la masse : des crins, pas des pointes', () => {
  it('chaque mèche de la texture finit en crins de longueurs inégales (pas en triangle)', () => {
    const m = hairMassPixels();
    const W = HAIR_TEX.w;
    // Pour chaque ligne de pixels (un crin), le dernier pixel opaque : ses bouts sont étalés (avant : une pointe par
    // mèche, les lignes d'une même mèche finissaient en escalier régulier, de 1 px en 1 px).
    const ends = [];
    for (let y = 0; y < HAIR_MASS.h; y++) {
      let last = 0;
      for (let x = 0; x < W; x++) if (m[(y * W + x) * 4 + 3] >= HAIR_CUT) last = x;
      ends.push(last / W);
    }
    // (bouts de 0,8 à 1 : presque jamais avant la fin du fond opaque — pas de bord droit ; seules quelques lignes du
    // bord de la bande)
    expect(ends.filter((e) => e < 0.785).length).toBeLessThanOrEqual(4);
    // (crins voisins de longueurs bien différentes : écart moyen d'une ligne à la suivante de plus de 1,5 % de la
    // longueur ; une mèche en triangle donnait des lignes voisines presque de même longueur)
    let jump = 0;
    for (let y = 1; y < ends.length; y++) jump += Math.abs(ends[y] - ends[y - 1]);
    expect(jump / (ends.length - 1)).toBeGreaterThan(0.015);
  });
});

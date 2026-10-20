// Crins du cheval réaliste en cartes (plan « cheval beau », étape 2) : texture de crins droits générée,
// crinière, toupet et queue en rubans posés sur la peau de chaque race, poids des os, version réduite, matière.
// GLB chargé dans node (sans textures) ; aucun hasard : graines fixes, allures calées à des instants fixés.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel, realLegPose, RIG_BONES } from '../src/game/models/horseReal.js';
import { hairStrandPixels, hairMipLevels, hairMaterial, HAIR_TEX, HAIR_CUT, HAIR_TOP } from '../src/game/models/horseHair.js';
import { gfx } from '../src/game/gfx.js';
import { createAnimal } from '../src/sim/animal.js';
import { SPECIES } from '../src/sim/species.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
}, 60000);

const horse = (breed, { foal = false, seed = 5 } = {}) => {
  const a = createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: foal ? 10 : 80, seed });
  return buildRealHorseModel(foal ? { ...a.look, foal: true } : a.look, a.breed, gltf);
};

/** Cartes de la géométrie des crins par sorte (0 crinière, 1 toupet, 2 queue, 4 crête) : racines et longueurs. */
function cards(md) {
  const g = md.hairMesh.geometry;
  const root = g.attributes.hairRoot;
  const f = g.attributes.hairG;
  const pos = g.attributes.position;
  const out = { 0: [], 1: [], 2: [], 4: [] };
  // (deux sommets par point, du premier point au dernier : une carte commence là où hairG repasse à 0)
  let start = 0;
  for (let i = 2; i <= pos.count; i += 2) {
    if (i === pos.count || f.getX(i) === 0) {
      const r = new THREE.Vector3(root.getX(start), root.getY(start), root.getZ(start));
      const tip = new THREE.Vector3().fromBufferAttribute(pos, i - 2).add(new THREE.Vector3().fromBufferAttribute(pos, i - 1)).multiplyScalar(0.5);
      let top = -Infinity;
      for (let j = start; j < i; j++) top = Math.max(top, pos.getY(j));
      out[root.getW(start)]?.push({ root: r, len: tip.distanceTo(r), tip, top });
      start = i;
    }
  }
  return out;
}

describe('texture des crins (générée en code)', () => {
  it('toujours la même (graine fixe), crins opaques à la racine, pointes effilées', () => {
    const a = hairStrandPixels();
    const b = hairStrandPixels();
    expect(a.length).toBe(HAIR_TEX.w * HAIR_TEX.h * 4);
    expect(Array.from(a.slice(0, 4000))).toEqual(Array.from(b.slice(0, 4000)));
    // Couverture par colonne (u le long des crins) : pleine près de la racine, faible à la pointe.
    const col = (u) => {
      const x = Math.floor(u * HAIR_TEX.w);
      let n = 0;
      for (let y = 0; y < HAIR_TEX.h; y++) if (a[(y * HAIR_TEX.w + x) * 4 + 3] >= HAIR_CUT) n++;
      return n / HAIR_TEX.h;
    };
    expect(col(0.07)).toBeGreaterThan(0.85);
    expect(col(0.5)).toBeGreaterThan(0.6);
    expect(col(0.97)).toBeLessThan(col(0.5) * 0.6);
  });

  it('les niveaux réduits gardent la part de pixels opaques (les crins ne fondent pas au loin)', () => {
    const levels = hairMipLevels(hairStrandPixels());
    expect(levels.at(-1).width).toBe(1);
    expect(levels.at(-1).height).toBe(1);
    const c0 = levels[0].coverage;
    for (const l of levels.slice(1, 6)) expect(Math.abs(l.coverage - c0), `${l.width}×${l.height}`).toBeLessThan(0.08);
  });
});

describe('crinière, toupet et queue en cartes de crins', () => {
  it('nombre de mèches selon le style de crinière ; brosse (Fjord, poulain) : toupet et queue seulement', () => {
    const sf = cards(horse('selle_francais'));
    const haf = cards(horse('haflinger'));
    const fjord = cards(horse('fjord'));
    const foal = cards(horse('selle_francais', { foal: true }));
    expect(sf[0].length).toBeGreaterThanOrEqual(70);
    expect(sf[0].length).toBeLessThanOrEqual(120);
    expect(haf[0].length).toBeGreaterThan(sf[0].length); // (épaisse : plus de mèches)
    for (const c of [sf, haf, fjord, foal]) {
      expect(c[1].length).toBeGreaterThanOrEqual(15);
      expect(c[1].length).toBeLessThanOrEqual(25);
      expect(c[2].length).toBeGreaterThanOrEqual(40);
      expect(c[2].length).toBeLessThanOrEqual(64);
    }
    expect(fjord[0].length).toBe(0);
    expect(foal[0].length).toBe(0);
  });

  it('longueur selon la race : crinière longue du Frison, courte de l\'Akhal-Teké ; toupet sur le front', () => {
    const mean = (l) => l.reduce((s, c) => s + c.len, 0) / l.length;
    const sf = horse('selle_francais');
    const frison = cards(horse('frison'));
    const akhal = cards(horse('akhal_teke'));
    const c = cards(sf);
    expect(mean(frison[0])).toBeGreaterThan(mean(c[0]) * 1.4);
    expect(mean(akhal[0])).toBeLessThan(mean(c[0]) * 0.7);
    // (crinière longue : une partie des mèches tombe aussi du côté gauche)
    expect(frison[0].filter((m) => m.tip.x > 0.05).length).toBeGreaterThan(5);
    // Toupet : il descend sur le chanfrein (vers le bout du nez), sous la nuque.
    sf.root.updateMatrixWorld(true);
    const poll = sf.head.getWorldPosition(new THREE.Vector3());
    const snout = sf.head.localToWorld(new THREE.Vector3(...sf.snoutTip));
    const along = snout.clone().sub(poll).normalize();
    for (const m of c[1]) {
      expect(m.tip.clone().sub(poll).dot(along)).toBeGreaterThan(m.root.clone().sub(poll).dot(along) + 0.05);
      expect(m.tip.y).toBeLessThan(poll.y);
    }
  });

  it('crinière du côté droit, la plupart des mèches ; queue derrière la croupe, jamais au sol', () => {
    const md = horse('selle_francais');
    const c = cards(md);
    const right = c[0].filter((m) => m.tip.x < 0).length;
    expect(right / c[0].length).toBeGreaterThan(0.9);
    for (const m of c[2]) {
      expect(m.tip.y).toBeGreaterThan(0.1);
      expect(m.tip.z).toBeLessThan(m.root.z + 0.05);
    }
  });

  it('crête de la crinière : mèches courtes dressées, visibles des deux côtés (pas un liseré vu de gauche)', () => {
    for (const breed of ['selle_francais', 'akhal_teke', 'frison', 'haflinger']) {
      const c = cards(horse(breed));
      const n = c[0].length;
      expect(c[4].length, breed).toBeGreaterThanOrEqual(Math.round(n * 0.7));
      expect(c[4].length, breed).toBeLessThanOrEqual(Math.round(n * 0.8));
      // (elles montent au-dessus de leur racine avant de retomber : la crête a du volume, vue de profil)
      const risen = c[4].filter((m) => m.top > m.root.y + 0.015).length;
      expect(risen / c[4].length, breed).toBeGreaterThan(0.6);
      // (une sur quatre au moins retombe du côté gauche ; courtes : pas un second rideau)
      const left = c[4].filter((m) => m.tip.x > m.root.x + 0.01).length;
      expect(left / c[4].length, breed).toBeGreaterThan(0.18);
      expect(left / c[4].length, breed).toBeLessThan(0.45);
      const mean = (l) => l.reduce((s, m) => s + m.len, 0) / l.length;
      expect(mean(c[4]), breed).toBeLessThan(0.12);
    }
    // Brosse (Fjord, poulain) : ni crinière, ni crête.
    expect(cards(horse('fjord'))[4].length).toBe(0);
    expect(cards(horse('selle_francais', { foal: true }))[4].length).toBe(0);
  });

  it.each(['selle_francais', 'fjord', 'frison', 'shetland'])('%s : poids des os de somme 1, os valides (crins, brosse, fanons)', (breed) => {
    const md = horse(breed);
    const meshes = md.root.children.filter((m) => m.isSkinnedMesh && m.geometry.attributes.hairG);
    expect(meshes.length).toBeGreaterThanOrEqual(1);
    for (const m of meshes) {
      const si = m.geometry.attributes.skinIndex;
      const sw = m.geometry.attributes.skinWeight;
      for (let i = 0; i < sw.count; i++) {
        let s = 0;
        for (let k = 0; k < 4; k++) {
          s += sw.getComponent(i, k);
          expect(si.getComponent(i, k)).toBeLessThan(RIG_BONES.length);
        }
        expect(Math.abs(s - 1)).toBeLessThan(1e-4);
      }
    }
    md.dispose();
  });

  it('racines liées à la peau, pointes de la crinière aux os de la crinière, toupet à la tête, queue aux os de la queue', () => {
    const md = horse('selle_francais');
    const g = md.hairMesh.geometry;
    const kind = g.attributes.hairRoot;
    const f = g.attributes.hairG;
    const si = g.attributes.skinIndex;
    const sw = g.attributes.skinWeight;
    const weightOf = (i, names) => {
      let w = 0;
      for (let k = 0; k < 4; k++) if (names.includes(RIG_BONES[si.getComponent(i, k)])) w += sw.getComponent(i, k);
      return w;
    };
    for (let i = 0; i < g.attributes.position.count; i++) {
      const k = kind.getW(i);
      if (k === 1) expect(weightOf(i, ['Head'])).toBeCloseTo(1, 5);
      if (k === 2 && f.getX(i) > 0.5) expect(weightOf(i, ['Tail2'])).toBeGreaterThan(0.99);
      if (k === 2) expect(weightOf(i, ['Tail1', 'Tail2', 'Spine'])).toBeGreaterThan(0.99);
      if (k === 0 && f.getX(i) > 0.5) expect(weightOf(i, ['Mane1', 'Mane2', 'Mane3', 'Mane4'])).toBeGreaterThan(0.75);
      // (crête : liée à l'encolure et à la crinière, comme la peau de la crête — un peu d'épaule près du garrot)
      if (k === 4) expect(weightOf(i, ['Neck', 'Mane1', 'Mane2', 'Mane3', 'Mane4', 'Spine', 'Head'])).toBeGreaterThan(0.85);
      if (k === 4 && f.getX(i) > 0.7) expect(weightOf(i, ['Mane1', 'Mane2', 'Mane3', 'Mane4'])).toBeGreaterThan(0.3);
    }
    md.dispose();
  });

  it('moins de triangles que les crins du GLB (5 676) ; version réduite : un ruban sur deux, mêmes sommets', () => {
    let worst = 0;
    for (const b of SPECIES.horse.breeds) {
      const md = horse(b.id);
      worst = Math.max(worst, md.hairMesh.geometry.index.count / 3);
      md.dispose();
    }
    expect(worst).toBeLessThan(2800);
    const md = horse('selle_francais');
    const full = md.hairMesh.geometry;
    md.setLod(1);
    const lod = md.hairMesh.geometry;
    expect(lod).not.toBe(full);
    expect(lod.attributes.position).toBe(full.attributes.position);
    expect(lod.index.count).toBeLessThan(full.index.count * 0.6);
    expect(lod.index.count).toBeGreaterThan(full.index.count * 0.4);
    md.setLod(0);
    expect(md.hairMesh.geometry).toBe(full);
    md.dispose();
  });
});

/** Instants fixés de toutes les allures (pas de hasard : le mixeur part sinon d'un instant tiré au sort). */
function fixTimes(md) {
  md.anim.t = 10;
  for (const a of Object.values(md.anim.actions)) a.time = a.getClip().duration * 0.3;
}

const st = (v, extra) => ({ v, moving: v > 0, graze: 0, feeder: 0, turn: 0, fat: 1, ...extra });
const POSES = {
  arrêt: (md) => { for (let f = 0; f < 30; f++) md.anim.update(1 / 30, st(0), {}); },
  broute: (md) => { for (let f = 0; f < 150; f++) md.anim.update(1 / 30, st(0, { graze: 1 }), {}); },
  repos: (md) => {
    for (const [n, a] of Object.entries(md.anim.actions)) a.setEffectiveWeight(n === 'rest' ? 1 : 0);
    md.anim.mixer.update(0);
  },
  pas: (md) => { for (let f = 0; f < 50; f++) md.anim.update(1 / 30, st(1.5), {}); },
  trot: (md) => { for (let f = 0; f < 50; f++) md.anim.update(1 / 30, st(3.2), {}); },
  'petit galop': (md) => { for (let f = 0; f < 50; f++) md.anim.update(1 / 30, st(5), {}); },
  galop: (md) => { for (let f = 0; f < 50; f++) md.anim.update(1 / 30, st(9), {}); },
  saut: (md) => { md.anim.update(1 / 30, st(4), {}); realLegPose(md, 'jump', 1, null, 0.45); },
};

/**
 * Sommets des crins (hors racines, qui sortent de la peau) entrés de plus de 2,5 cm dans le pelage déformé :
 * sommet du pelage le plus proche (grille de 6 cm) et sa normale. Renvoie [part, part de la crinière et du toupet].
 */
function inside(md) {
  md.root.updateMatrixWorld(true);
  const coat = md.coatMesh;
  coat.skeleton.update();
  const v = new THREE.Vector3();
  const n = coat.geometry.attributes.position.count;
  const P = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) coat.getVertexPosition(i, v).toArray(P, i * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(P, 3));
  g.setIndex(coat.geometry.index);
  g.computeVertexNormals();
  const N = g.attributes.normal.array;
  const cell = 0.06;
  const grid = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  for (let i = 0; i < n; i++) {
    const k = key(Math.floor(P[i * 3] / cell), Math.floor(P[i * 3 + 1] / cell), Math.floor(P[i * 3 + 2] / cell));
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  }
  const hair = md.hairMesh;
  const hg = hair.geometry.attributes;
  let bad = 0;
  let badMane = 0;
  let total = 0;
  let totalMane = 0;
  for (let j = 0; j < hg.position.count; j++) {
    if (hg.hairG.getX(j) === 0) continue;
    const w = hg.hairRoot.getW(j);
    const mane = w < 1.5 || w > 3.5;
    total++;
    if (mane) totalMane++;
    hair.getVertexPosition(j, v);
    const cx = Math.floor(v.x / cell);
    const cy = Math.floor(v.y / cell);
    const cz = Math.floor(v.z / cell);
    let best = -1;
    let bd = Infinity;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      for (const i of grid.get(key(cx + dx, cy + dy, cz + dz)) ?? []) {
        const d = (P[i * 3] - v.x) ** 2 + (P[i * 3 + 1] - v.y) ** 2 + (P[i * 3 + 2] - v.z) ** 2;
        if (d < bd) {
          bd = d;
          best = i;
        }
      }
    }
    if (best < 0) continue;
    const depth = -((v.x - P[best * 3]) * N[best * 3] + (v.y - P[best * 3 + 1]) * N[best * 3 + 1] + (v.z - P[best * 3 + 2]) * N[best * 3 + 2]);
    if (depth > 0.025) {
      bad++;
      if (mane) badMane++;
    }
  }
  return [bad / total, badMane / totalMane];
}

describe('crins hors du corps, dans toutes les poses', () => {
  it.each(['selle_francais', 'frison', 'shetland', 'arabe'])('%s : arrêt, broutage, repos, pas, trot, petit galop, galop, saut', (breed) => {
    for (const [name, pose] of Object.entries(POSES)) {
      const md = horse(breed);
      fixTimes(md);
      pose(md);
      const [all, mane] = inside(md);
      // (la queue est raide : au pas et au trot, le postérieur qui recule la frôle ; les ressorts viendront à
      // l'étape 6 du plan)
      expect(mane, `${name} : crinière et toupet`).toBeLessThan(0.01);
      expect(all, `${name} : tous les crins`).toBeLessThan(0.04);
      md.dispose();
    }
  });
});

describe('matière des crins', () => {
  it('reflet le long des mèches (Kajiya-Kay), second reflet en qualité haute seulement, normales de volume', () => {
    const was = gfx.quality;
    try {
      for (const q of ['low', 'high']) {
        gfx.quality = q;
        const m = hairMaterial(0x1b1410, { value: 0 });
        const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
        m.onBeforeCompile(sh, null);
        expect(sh.fragmentShader).toContain('RE_Direct_Hair');
        expect(sh.fragmentShader).toContain('normal = normalize( vNormal );');
        expect(sh.vertexShader).toContain('attribute vec3 hairT;');
        expect(sh.fragmentShader.includes('#define HAIR_HQ')).toBe(q === 'high');
        expect(m.alphaTest).toBe(HAIR_CUT);
        expect(m.customProgramCacheKey()).toBe(q === 'high' ? 'horsehairh' : 'horsehairl');
        m.dispose();
      }
    } finally {
      gfx.quality = was;
    }
  });

  it('crins clairs jamais brûlés en blanc, crins noirs un peu éclaircis', () => {
    const flaxen = hairMaterial(0xf4ecd8, { value: 0 });
    expect(Math.max(flaxen.color.r, flaxen.color.g, flaxen.color.b)).toBeLessThanOrEqual(HAIR_TOP + 1e-6);
    const black = hairMaterial(0x0a0a0a, { value: 0 });
    expect(black.color.r).toBeGreaterThan(new THREE.Color(0x0a0a0a).r);
  });
});

// Crins du cheval réaliste en cartes (plan « cheval beau », étape 2) : texture de crins droits générée,
// crinière, toupet et queue en rubans posés sur la peau de chaque race, poids des os, version réduite, matière.
// GLB chargé dans node (sans textures) ; aucun hasard : graines fixes, allures calées à des instants fixés.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel, realLegPose, RIG_BONES } from '../src/game/models/horseReal.js';
import { hairStrandPixels, hairMassPixels, hairMipLevels, hairMaterial, HAIR_TEX, HAIR_MASS, HAIR_CUT, HAIR_TOP } from '../src/game/models/horseHair.js';
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

/** Sommets des masses (crins « en volume ») par sorte : 8 crinière, 9 toupet, 10 queue. */
function massVerts(md) {
  const g = md.hairMesh.geometry;
  const root = g.attributes.hairRoot;
  const pos = g.attributes.position;
  const out = { 8: [], 9: [], 10: [] };
  for (let i = 0; i < pos.count; i++) out[root.getW(i)]?.push(new THREE.Vector3().fromBufferAttribute(pos, i));
  return out;
}

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

  it('bande de la masse : opaque entre les pointes (le cou ne se voit jamais au travers), pointes inégales aux deux bouts', () => {
    const m = hairMassPixels();
    expect(m.length).toBe(HAIR_TEX.w * HAIR_MASS.h * 4);
    expect(Array.from(m.slice(0, 4000))).toEqual(Array.from(hairMassPixels().slice(0, 4000)));
    const col = (u) => {
      const x = Math.floor(u * HAIR_TEX.w);
      let n = 0;
      for (let y = 0; y < HAIR_MASS.h; y++) if (m[(y * HAIR_TEX.w + x) * 4 + 3] >= HAIR_CUT) n++;
      return n / HAIR_MASS.h;
    };
    for (const u of [HAIR_MASS.root, 0.2, 0.5, 0.72]) expect(col(u), `u = ${u}`).toBe(1);
    // (bord gauche de la crinière en dents ; au bout, chaque mèche à sa longueur : ni bord droit ni trou)
    expect(col(0.01)).toBeLessThan(0.7);
    expect(col(0.86)).toBeGreaterThan(0.2);
    expect(col(0.86)).toBeLessThan(0.9);
    expect(col(0.99)).toBeLessThan(col(0.86));
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
    // (crins « en volume » : la masse fait le volume, les cartes — moins nombreuses — les bords et les pointes)
    expect(sf[0].length).toBeGreaterThanOrEqual(45);
    expect(sf[0].length).toBeLessThanOrEqual(80);
    expect(haf[0].length).toBeGreaterThan(sf[0].length); // (épaisse : plus de mèches)
    for (const c of [sf, haf, fjord, foal]) {
      expect(c[1].length).toBeGreaterThanOrEqual(10);
      expect(c[1].length).toBeLessThanOrEqual(24);
      expect(c[2].length).toBeGreaterThanOrEqual(30);
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
    expect(right / c[0].length).toBeGreaterThan(0.72);
    // (quelques mèches passent à gauche : on voit la crinière des deux côtés)
    expect(c[0].filter((m) => m.tip.x > 0.03).length).toBeGreaterThanOrEqual(4);
    for (const m of c[2]) {
      expect(m.tip.y).toBeGreaterThan(0.1);
      expect(m.tip.z).toBeLessThan(m.root.z + 0.05);
    }
  });

  it('crête de la crinière : un rouleau de crins (la masse) visible des deux côtés, pas une crête de lamelles dressées', () => {
    for (const breed of ['selle_francais', 'akhal_teke', 'frison', 'haflinger']) {
      const md = horse(breed);
      const c = cards(md);
      const n = c[0].length;
      // (plus de rubans de crête : le rouleau est la masse — posés dessus, ils se dressaient en brosse au garrot)
      expect(c[4].length, breed).toBe(0);
      expect(n, breed).toBeGreaterThan(30);
      // Rouleau : tranches de 4 cm le long de l'encolure ; dans chacune, le haut de la masse dépasse la crête (le
      // haut du pelage près de la ligne du dessus) et la masse déborde à gauche (x > 0) : vue de gauche, la crinière
      // est un bourrelet de crins, pas un liseré.
      const M = massVerts(md)[8];
      const coat = md.coatMesh.geometry.attributes.position;
      const z0 = Math.min(...M.map((p) => p.z));
      const z1 = Math.max(...M.map((p) => p.z));
      const rise = [];
      let left = 0;
      let slabs = 0;
      for (let z = z0 + (z1 - z0) * 0.15; z < z1 - (z1 - z0) * 0.15; z += 0.04) {
        const inS = (p) => p.z >= z && p.z < z + 0.04;
        let topC = -Infinity;
        for (let i = 0; i < coat.count; i++) {
          if (Math.abs(coat.getX(i)) < 0.04 && coat.getZ(i) >= z && coat.getZ(i) < z + 0.04) topC = Math.max(topC, coat.getY(i));
        }
        const ms = M.filter(inS);
        if (!ms.length || !Number.isFinite(topC)) continue;
        slabs++;
        rise.push(Math.max(...ms.map((p) => p.y)) - topC);
        if (Math.max(...ms.map((p) => p.x)) > 0.03) left++;
      }
      rise.sort((a, b) => a - b);
      expect(slabs, breed).toBeGreaterThan(8);
      expect(rise[Math.floor(rise.length / 2)], breed).toBeGreaterThan(breed === 'akhal_teke' ? 0.015 : 0.025);
      expect(left / slabs, breed).toBeGreaterThan(0.8);
      md.dispose();
    }
    // Crinière qui tombe : les grandes mèches pendent sur l'encolure (pointe bien sous la racine), comme une crinière
    // de cheval de selle (avant : 24 cm recourbés, la pointe à 10 cm sous la crête).
    const sf = cards(horse('selle_francais'));
    // (mèches du côté droit : celles qui passent à gauche sont plus courtes, ce sont les pointes des mèches de gauche)
    const drop = sf[0].filter((m) => m.tip.x < 0).map((m) => m.root.y - m.tip.y).sort((x, y) => x - y);
    // (posées sur la masse, un peu moins bas qu'à même la peau)
    expect(drop[Math.floor(drop.length / 2)]).toBeGreaterThan(0.13);
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
    // (masses + cartes : plus qu'avec les cartes seules, toujours moins que les crins du GLB ; version réduite : la
    // masse à un quart, une rangée et une colonne sur deux, et les cartes principales)
    expect(worst).toBeLessThan(5000);
    const md = horse('selle_francais');
    const full = md.hairMesh.geometry;
    md.setLod(1);
    const lod = md.hairMesh.geometry;
    expect(lod).not.toBe(full);
    expect(lod.attributes.position).toBe(full.attributes.position);
    expect(lod.index.count).toBeLessThan(full.index.count * 0.5);
    expect(lod.index.count).toBeGreaterThan(full.index.count * 0.25);
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

describe('toupet en mèche', () => {
  it('plus long au milieu qu\'aux bords : une mèche en pointe (pas un rectangle rayé collé sur le front)', () => {
    for (const breed of ['selle_francais', 'frison', 'arabe']) {
      const md = horse(breed);
      md.root.updateMatrixWorld(true);
      // (position en travers du chanfrein, repère de la tête : x de la racine)
      const t = cards(md)[1].map((m) => ({ x: Math.abs(md.head.worldToLocal(m.root.clone()).x), len: m.len }));
      const w = Math.max(...t.map((m) => m.x));
      const mean = (l) => l.reduce((u, m) => u + m.len, 0) / l.length;
      const mid = t.filter((m) => m.x < w * 0.4);
      const edge = t.filter((m) => m.x > w * 0.75);
      expect(mid.length, breed).toBeGreaterThan(1);
      expect(edge.length, breed).toBeGreaterThan(1);
      expect(mean(mid), breed).toBeGreaterThan(mean(edge) * 1.25);
      md.dispose();
    }
  });

  it('reflet et éclaircissement des crins foncés réduits sur le toupet (il reste noir)', () => {
    const m = hairMaterial(0x1b1410, { value: 0 });
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(sh);
    expect(sh.vertexShader).toContain('vHairK = mod( hairRoot.w, 8.0 );');
    expect(sh.fragmentShader).toContain('spec * lit * ( 1.0 - 0.65 * hHairFore() )');
    expect(sh.fragmentShader).toContain('hHairLift * ( 1.0 - 0.6 * hHairFore() )');
  });
});

describe('toupet sous le bonnet anti-mouches', () => {
  it.each(['selle_francais', 'frison', 'shetland'])('%s : rentré sous le voile (aucune mèche ne le traverse), ressorti sans le bonnet', async (breed) => {
    const { buildGear } = await import('../src/game/gearModels.js');
    const a = createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: 80, seed: 5 });
    const md = buildRealHorseModel(a.look, a.breed, gltf);
    md.root.updateMatrixWorld(true);
    const tuck = md.hairMesh.material.userData.hairTuck;
    buildGear(md, a.look, { head: { item: 'flyMask', color: 'white' } });
    expect(tuck.value).toBe(1);
    // Toupet replié comme dans le shader (racine + 5 % de la mèche), au repos, dans le repère de la tête : sous la
    // surface du voile (gearModels.js : coque à hr × 0,05 de la peau du champ de distance de la tête).
    const g = md.hairMesh.geometry.attributes;
    const p = new THREE.Vector3();
    const r = new THREE.Vector3();
    const hr = md.dims.hr;
    let n = 0;
    let out = 0;
    for (let i = 0; i < g.position.count; i++) {
      // (toupet : ses cartes et sa masse)
      if (g.hairRoot.getW(i) !== 1 && g.hairRoot.getW(i) !== 9) continue;
      p.fromBufferAttribute(g.position, i);
      r.set(g.hairRoot.getX(i), g.hairRoot.getY(i), g.hairRoot.getZ(i));
      p.sub(r).multiplyScalar(0.05).add(r);
      md.head.worldToLocal(p);
      n++;
      if (md.sdf.head(p.x, p.y, p.z) > hr * 0.05 - 0.002) out++;
    }
    expect(n).toBeGreaterThan(40);
    expect(out, breed).toBe(0);
    // Sans le bonnet, le toupet ressort.
    buildGear(md, a.look, {});
    expect(tuck.value).toBe(0);
    md.dispose();
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

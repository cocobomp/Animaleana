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
    // (les cartes de gauche sont courtes : pointes des mèches de gauche et du flanc du rouleau)
    expect(right / c[0].length).toBeGreaterThan(0.6);
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

  it('crinière : aucune carte au-dessus de la silhouette du rouleau, rien de dressé à la nuque', () => {
    for (const breed of ['selle_francais', 'frison', 'arabe', 'akhal_teke', 'haflinger']) {
      const md = horse(breed);
      const g = md.hairMesh.geometry.attributes;
      const coat = md.coatMesh.geometry.attributes.position;
      const M = massVerts(md)[8];
      // Haut de la masse par tranches de 2 cm le long de l'encolure (z).
      const z0 = Math.min(...M.map((p) => p.z));
      const top = new Map();
      for (const p of M) {
        const k = Math.floor((p.z - z0) / 0.02);
        top.set(k, Math.max(top.get(k) ?? -Infinity, p.y));
      }
      // (le plus haut de la masse à 3 cm près le long de l'encolure : la crête monte vers la nuque, un bord de carte
      // posé de biais peut être un peu plus loin que le dernier point de la masse)
      const near = (z) => {
        const k = Math.floor((z - z0) / 0.02);
        return Math.max(top.get(k - 1) ?? -Infinity, top.get(k) ?? -Infinity, top.get(k + 1) ?? -Infinity);
      };
      // Les cartes de la crinière ne dépassent nulle part le haut de la masse de plus d'un centimètre et demi : vues de
      // gauche, elles dépassaient en marches rectangulaires ; vers la nuque, elles se dressaient au-dessus des oreilles.
      let n = 0;
      for (let i = 0; i < g.position.count; i++) {
        if (g.hairRoot.getW(i) !== 0) continue;
        const m = near(g.position.getZ(i));
        if (!Number.isFinite(m)) continue;
        n++;
        expect(g.position.getY(i), `${breed} z = ${g.position.getZ(i).toFixed(2)}`).toBeLessThan(m + 0.015);
      }
      expect(n, breed).toBeGreaterThan(200);
      // La masse elle-même : un rouleau de quelques centimètres sur la crête, pas une brosse (par tranches de 4 cm, le
      // haut du pelage près de la ligne du dessus, quand la tranche en a un sommet ; sur l'encolure, pas à la nuque où
      // le haut du pelage de la tranche est déjà le front).
      const kMax = Math.max(...top.keys());
      for (const [k, mTop] of top) {
        if (k > kMax * 0.85) continue;
        const z = z0 + k * 0.02;
        let topC = -Infinity;
        for (let i = 0; i < coat.count; i++) if (Math.abs(coat.getX(i)) < 0.05 && Math.abs(coat.getZ(i) - z - 0.01) < 0.02) topC = Math.max(topC, coat.getY(i));
        if (topC > mTop - 0.2) expect(mTop - topC, `${breed} z = ${z.toFixed(2)}`).toBeLessThan(0.13);
      }
      md.dispose();
    }
  }, 60000);

  it('mèches de gauche de la masse : sous le bord du rouleau, étroites, nombreuses, effilées ; aucune pour une crinière courte', () => {
    const locks = (md) => {
      // (mèches de gauche : les grilles de la masse dont toutes les rangées partent de la même racine)
      const g = md.hairMesh.geometry.attributes;
      // (et dont les points sont pris par neuvièmes le long des crins : la nappe en a 15 ou 16, une rangée de la nappe
      // peut avoir la même racine qu'une mèche ; ses rangées de bord de bande, en double, partagent aussi une racine)
      const by = new Map();
      for (let i = 0; i < g.position.count; i++) {
        const f = g.hairG.getX(i);
        if (g.hairRoot.getW(i) !== 8 || Math.abs(f * 9 - Math.round(f * 9)) > 1e-4) continue;
        const k = [0, 1, 2].map((c) => g.hairRoot.getComponent(i, c).toFixed(5)).join(',');
        if (!by.has(k)) by.set(k, []);
        by.get(k).push({ p: new THREE.Vector3().fromBufferAttribute(g.position, i), f });
      }
      return [...by.values()].filter((l) => l.length >= 35);
    };
    for (const [breed, n] of [['selle_francais', 8], ['frison', 10], ['akhal_teke', 0]]) {
      const md = horse(breed);
      const L = locks(md);
      expect(L.length, breed).toBe(n);
      for (const l of L) {
        // (plus grand écart entre deux points de la mèche pris au même endroit le long des crins)
        const span = (sel) => {
          const q = l.filter(sel).map((v) => v.p);
          let d = 0;
          for (const a of q) for (const b of q) d = Math.max(d, a.distanceTo(b));
          return d;
        };
        const top = span((v) => v.f < 0.15);
        const tip = span((v) => v.f > 0.95);
        // (4,4 à 8 cm de large en haut — plus larges, au téléphone, des languettes « en flammes » ou des pétales —,
        // resserrée vers le bas : elle finit en crins de longueurs inégales, par la texture)
        expect(top, breed).toBeGreaterThan(0.04);
        expect(top, breed).toBeLessThan(0.11);
        expect(tip, breed).toBeLessThan(top * 0.62);
        // (du côté gauche, et plus bas que le bord du rouleau : 9,5 cm sous la crête)
        const low = l.reduce((a, v) => (v.p.y < a.p.y ? v : a));
        expect(low.p.x, breed).toBeGreaterThan(0.03);
        expect(l[0].p.y - low.p.y, breed).toBeGreaterThan(0.1);
      }
      md.dispose();
    }
  }, 60000);

  it('queue : pleine de dos, d\'aplomb, et du volume de profil ; en panache, plus large, si elle est portée haut', () => {
    const wides = {};
    for (const breed of ['selle_francais', 'arabe', 'frison']) {
      const md = horse(breed);
      const T = massVerts(md)[10];
      const y0 = Math.min(...T.map((p) => p.y));
      const y1 = Math.max(...T.map((p) => p.y));
      let wide = 0;
      let deep = 0;
      const mids = [];
      for (let y = y0; y < y1; y += 0.05) {
        const s = T.filter((p) => p.y >= y && p.y < y + 0.05);
        if (s.length < 4) continue;
        const xs = s.map((p) => p.x);
        const zs = s.map((p) => p.z);
        wide = Math.max(wide, Math.max(...xs) - Math.min(...xs));
        deep = Math.max(deep, Math.max(...zs) - Math.min(...zs));
        // (ondulée de côté en descendant, mèche par mèche : le milieu de chaque tranche à moins de 3 cm de l'axe)
        mids.push(xs.reduce((a, b) => a + b, 0) / xs.length);
        expect(Math.abs(mids.at(-1)), breed).toBeLessThan(0.03);
      }
      // (d'aplomb au repos : en moyenne, à moins de 1 cm de l'axe du cheval — elle ne pend pas d'un côté)
      expect(Math.abs(mids.reduce((a, b) => a + b, 0) / mids.length), breed).toBeLessThan(0.01);
      // (vue de dos, plus large qu'un postérieur : 17 à 30 cm, jusqu'à 36 cm en panache ; de profil, encore 13 cm au moins)
      expect(wide, breed).toBeGreaterThan(0.17);
      expect(wide, breed).toBeLessThan(breed === 'arabe' ? 0.36 : 0.3);
      expect(deep, breed).toBeGreaterThan(0.13);
      wides[breed] = wide;
      md.dispose();
    }
    // (queue portée haut, arabe : les crins retombent en éventail du couard relevé — à la largeur des autres, vue de dos,
    // une lame plate grise, moitié moins large que les rubans d'avant)
    expect(wides.arabe).toBeGreaterThan(wides.selle_francais * 1.12);
  }, 60000);

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
    let lodSum = 0;
    for (const b of SPECIES.horse.breeds) {
      const md = horse(b.id);
      worst = Math.max(worst, md.hairMesh.geometry.index.count / 3);
      md.setLod(1);
      lodSum += md.hairMesh.geometry.index.count / 3;
      md.dispose();
    }
    // (masses + cartes : plus qu'avec les cartes seules, toujours moins que les crins du GLB ; version réduite : la
    // masse à un quart, une rangée et une colonne sur deux, et les cartes principales, un point sur deux)
    expect(worst).toBeLessThan(4700);
    // (version réduite, celle des chevaux lointains du téléphone : pas plus, en moyenne, que les cartes seules d'avant
    // — 1 300 triangles)
    expect(lodSum / SPECIES.horse.breeds.length).toBeLessThan(1300);
    const md = horse('selle_francais');
    const full = md.hairMesh.geometry;
    md.setLod(1);
    const lod = md.hairMesh.geometry;
    expect(lod).not.toBe(full);
    expect(lod.attributes.position).toBe(full.attributes.position);
    expect(lod.index.count).toBeLessThan(full.index.count * 0.5);
    expect(lod.index.count).toBeGreaterThan(full.index.count * 0.2);
    md.setLod(0);
    expect(md.hairMesh.geometry).toBe(full);
    md.dispose();
  }, 60000);
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

describe('éclairage des crins', () => {
  it('normales des mèches de la crinière jamais tournées vers le sol (pas de taches sombres sur une crinière grise)', () => {
    for (const breed of ['selle_francais', 'pre', 'frison', 'arabe']) {
      const md = horse(breed);
      const g = md.hairMesh.geometry.attributes;
      const n = { 0: 0, 8: 0 };
      const down = { 0: 0, 8: 0 };
      for (let i = 0; i < g.position.count; i++) {
        const w = g.hairRoot.getW(i);
        if (w !== 0 && w !== 8) continue;
        n[w]++;
        if (g.normal.getY(i) < -0.6) down[w]++;
      }
      // (cartes : normales de la peau ; masse : celles de la grille, celles du corps au bord gauche du rouleau)
      expect(down[0] / n[0], `${breed} cartes`).toBeLessThan(0.01);
      expect(down[8] / n[8], `${breed} masse`).toBeLessThan(0.03);
      md.dispose();
    }
  });

  it('bout avant du rouleau, à la nuque : normales de la masse jamais vers le sol (pas de tache vert sombre)', () => {
    // (derrière la nuque, la distance à la tête finissait par un plan, son bout arrière : les crins écartés de la peau
    // dans ce sens se repliaient sous le rouleau, normales vers l'arrière et le sol — sur une crinière claire, au
    // téléphone, une tache vert sombre, la lumière du sol)
    for (const breed of ['haflinger', 'pre', 'camargue', 'comtois', 'lusitanien', 'trait_breton', 'arabe']) {
      const md = horse(breed);
      const g = md.hairMesh.geometry.attributes;
      let zmax = -Infinity;
      for (let i = 0; i < g.position.count; i++) if (g.hairRoot.getW(i) === 8) zmax = Math.max(zmax, g.position.getZ(i));
      let n = 0;
      let down = 0;
      for (let i = 0; i < g.position.count; i++) {
        if (g.hairRoot.getW(i) !== 8 || zmax - g.position.getZ(i) > 0.12) continue;
        n++;
        if (g.normal.getY(i) < -0.3) down++;
      }
      expect(n, breed).toBeGreaterThan(20);
      expect(down / n, breed).toBeLessThan(0.02);
      md.dispose();
    }
  });

  it('crins clairs sur une robe claire un peu assombris à gauche et au toupet (lisibles sur l\'encolure et le front blancs), pas sur une robe foncée', () => {
    const grey = hairMaterial(0xc9c5bf, { value: 0 }, undefined, 0xdedbd5);
    const onBay = hairMaterial(0xc9c5bf, { value: 0 }, undefined, 0x6a3a20);
    const alone = hairMaterial(0xc9c5bf, { value: 0 });
    // (de 15 % au moins, dans le shader : le toupet et ce qui passe à gauche seulement — la nappe de droite et la queue
    // restent claires)
    expect(grey.userData.hairDark.value).toBeGreaterThan(0.15);
    expect(onBay.userData.hairDark.value).toBe(0);
    expect(alone.userData.hairDark.value).toBe(0);
    expect(grey.color.r).toBeCloseTo(onBay.color.r, 6);
    // (crins noirs sur une robe noire : rien ne change)
    expect(hairMaterial(0x0b0a0a, { value: 0 }, undefined, 0x171414).userData.hairDark.value).toBe(0);
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    grey.onBeforeCompile(sh);
    expect(sh.fragmentShader).toContain('hHairDark * max( hHairFore(), step( vHairK, 0.5 ) * smoothstep( 0.0, 0.03, vHairP.x ) )');
  });

  it('ombre du soleil adoucie sur les crins (qualité haute : plus de plaques d\'ombre nettes d\'une mèche sur l\'autre)', () => {
    const m = hairMaterial(0xc9c5bf, { value: 0 });
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    m.onBeforeCompile(sh);
    expect(sh.fragmentShader).toContain('mix( 0.45, 1.0, getShadow( directionalShadowMap[ i ]');
    expect(sh.fragmentShader).not.toContain('#include <lights_fragment_begin>');
  });
});

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
  it('masse du toupet : resserrée en pointe entre les yeux, au milieu du chanfrein', () => {
    for (const breed of ['selle_francais', 'frison', 'arabe', 'shetland']) {
      const md = horse(breed);
      md.root.updateMatrixWorld(true);
      const g = md.hairMesh.geometry.attributes;
      const top = [];
      const tip = [];
      for (let i = 0; i < g.position.count; i++) {
        if (g.hairRoot.getW(i) !== 9) continue;
        const p = md.head.worldToLocal(new THREE.Vector3().fromBufferAttribute(g.position, i));
        if (g.hairG.getX(i) < 0.12) top.push(p.x);
        if (g.hairG.getX(i) > 0.75) tip.push(p.x);
      }
      const w = (l) => Math.max(...l) - Math.min(...l);
      expect(w(top), breed).toBeGreaterThan(0.05);
      expect(w(tip), breed).toBeLessThan(w(top) * 0.3);
      expect(Math.abs(tip.reduce((a, b) => a + b, 0) / tip.length), breed).toBeLessThan(0.01);
      md.dispose();
    }
  }, 60000);

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
  it('couverture par l\'alpha sans écrire l\'alpha dans l\'image (pas de points clairs au bord des mèches)', () => {
    const was = [gfx.quality, gfx.msaa];
    try {
      for (const [q, msaa] of [['low', true], ['high', false], ['low', false]]) {
        gfx.quality = q;
        gfx.msaa = msaa;
        const m = hairMaterial(0x1b1410, { value: 0 });
        expect(m.alphaToCoverage).toBe(msaa || q === 'high');
        if (!m.alphaToCoverage) continue;
        // (couleur écrite telle quelle, alpha de l'image gardé : la toile ne devient jamais transparente)
        expect(m.blending).toBe(THREE.CustomBlending);
        expect([m.blendSrc, m.blendDst]).toEqual([THREE.OneFactor, THREE.ZeroFactor]);
        expect([m.blendSrcAlpha, m.blendDstAlpha]).toEqual([THREE.ZeroFactor, THREE.OneFactor]);
        expect(m.transparent).toBe(false);
      }
    } finally {
      [gfx.quality, gfx.msaa] = was;
    }
  });

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

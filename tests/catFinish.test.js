// Finitions des chats et des lapins réalistes vues au téléphone et de près (critique « chats-lapins ») : trot posé des
// races longilignes, ... Déterministe : graines fixes, pas de temps fixe, aucun Math.random (le mixeur est appelé
// avec des états donnés, jamais animateRealCat).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { buildRealCatModel } from '../src/game/models/catReal.js';
import { buildAccessories } from '../src/game/models/salon.js';
import { buildGear } from '../src/game/gearModels.js';
import { catLookWithBreed } from '../src/sim/catLook.js';
import { resolveLook } from '../src/sim/animal.js';
import { loadRealCatGltf } from './fixtures/realCatGltf.js';

// (machine chargée : construire et animer un chat prend parfois plusieurs secondes)
vi.setConfig({ testTimeout: 180000 });

let G;
beforeAll(async () => {
  G = { adult: await loadRealCatGltf('adult'), kitten: await loadRealCatGltf('kitten') };
}, 120000);

const lookOf = (breed, colorIndex = 0) => catLookWithBreed({ ...resolveLook('cat', breed, colorIndex), seed: 4242 }, breed);
const cat = (breed, stage = 'adult') => buildRealCatModel(lookOf(breed), stage, G[stage === 'baby' ? 'kitten' : 'adult']);
const _v = new THREE.Vector3();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Chat qui avance comme en jeu (le mixeur tient les pieds posés) : plus bas de la peau de chaque sole (sommets des
 * soles mesurées sur la race, repère du monde) image par image, après une seconde pour prendre l'allure.
 */
function soleTrack(md, v, frames = 240) {
  const m = md.coatMesh;
  const soles = md.anim.S.measure.soles;
  const out = soles.map(() => []);
  const dt = 1 / 60;
  for (let f = 0; f < 60 + frames; f++) {
    md.anim.update(dt, { v, moving: true, posture: 'stand' });
    md.root.position.z += v * dt;
    md.root.updateMatrixWorld(true);
    if (f < 60) continue;
    soles.forEach((ids, l) => {
      let lo = Infinity;
      for (const i of ids) lo = Math.min(lo, m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld).y);
      out[l].push(lo);
    });
  }
  return out;
}

describe('trot posé', () => {
  // Au trot (le chat qui suit le joueur : 1,4 m/s), le corps restait porté par le haut de la foulée : siamois, abyssin,
  // devon rex, bobtail et sphynx trottaient les pattes avant à 6 à 14 mm du sol, jamais posées, le corps entier en
  // l'air une image sur deux ; les chatons enfonçaient leurs pieds de 3 mm.
  it.each([
    ['siamois', 'adult'], ['abyssin', 'adult'], ['devon_rex', 'adult'], ['bobtail', 'adult'], ['sphynx', 'adult'],
    ['europeen', 'adult'], ['persan', 'adult'], ['siamois', 'young'], ['abyssin', 'baby'], ['europeen', 'baby'],
  ])('%s (%s) : au trot, chaque patte se pose (à moins de 2 mm du sol) sans s\'enfoncer de plus de 2,5 mm', (b, stage) => {
    for (const v of [1.4, 2.2]) {
      const md = cat(b, stage);
      md.staticPose('stand');
      const tr = soleTrack(md, v);
      expect(md.anim.gait, `${b} ${stage} ${v}`).toBe('trot');
      tr.forEach((ys, l) => {
        const name = `${b} ${stage} ${v} m/s, patte ${['AVG', 'AVD', 'ARG', 'ARD'][l]}`;
        expect(Math.min(...ys), name).toBeLessThan(0.002);
        expect(Math.min(...ys), name).toBeGreaterThan(-0.0025);
        // (posée au moins une image sur seize : un vrai appui, pas un effleurement)
        expect(ys.filter((y) => y < 0.003).length / ys.length, name).toBeGreaterThan(1 / 16);
      });
      md.dispose();
    }
  });

  // (british et persan : les postérieurs glissaient de 8 % de la vitesse au pas, pieds tenus après la pose du corps)
  it('au pas, un pied toujours posé (à moins de 3 mm du sol) : british, persan', () => {
    for (const [b, stage] of [['british', 'adult'], ['persan', 'adult'], ['british', 'young']]) {
      const md = cat(b, stage);
      md.staticPose('stand');
      const tr = soleTrack(md, 0.6);
      expect(md.anim.gait).toBe('walk');
      const n = tr[0].length;
      let air = 0;
      for (let f = 0; f < n; f++) if (Math.min(tr[0][f], tr[1][f], tr[2][f], tr[3][f]) > 0.003) air++;
      expect(air / n, `${b} ${stage}`).toBeLessThan(0.08);
      md.dispose();
    }
  });
});

/**
 * Glissement des appuis (méthode de la critique) : le sommet de peau le plus bas d'une sole est suivi tant qu'il reste à
 * moins de 4 mm du sol ; chemin parcouru sur le sol ÷ (durée × vitesse du chat). Médiane des appuis de chaque patte.
 */
function slipRatios(md, v, frames = 240) {
  const m = md.coatMesh;
  const soles = md.anim.S.measure.soles;
  const dt = 1 / 60;
  const cur = soles.map(() => null);
  const ratios = soles.map(() => []);
  for (let f = 0; f < 120 + frames; f++) {
    md.anim.update(dt, { v, moving: true, posture: 'stand' });
    md.root.position.z += v * dt;
    md.root.updateMatrixWorld(true);
    if (f < 120) continue;
    soles.forEach((ids, l) => {
      const c = cur[l];
      if (c) {
        m.getVertexPosition(c.i, _v).applyMatrix4(m.matrixWorld);
        if (_v.y < 0.004) {
          c.path += Math.hypot(_v.x - c.x, _v.z - c.z);
          c.x = _v.x;
          c.z = _v.z;
          c.n++;
          return;
        }
        if (c.n >= 3) ratios[l].push(c.path / (c.n * dt) / v);
        cur[l] = null;
      }
      let lo = Infinity;
      let best = -1;
      for (const i of ids) {
        const y = m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld).y;
        if (y < lo) {
          lo = y;
          best = i;
        }
      }
      if (lo < 0.004) {
        m.getVertexPosition(best, _v).applyMatrix4(m.matrixWorld);
        cur[l] = { i: best, x: _v.x, z: _v.z, n: 0, path: 0 };
      }
    });
  }
  return ratios.map((r) => (r.length ? [...r].sort((a, b) => a - b)[Math.floor(r.length / 2)] : null));
}

describe('appuis tenus', () => {
  // British et persan (pattes courtes) : les postérieurs glissaient encore de 7,5 à 8,8 % de la vitesse au pas.
  it.each(['british', 'persan'])('%s : au pas, les postérieurs posés glissent de moins de 6 % de la vitesse', (b) => {
    for (const v of [0.5, 0.9]) {
      const md = cat(b);
      md.staticPose('stand');
      const r = slipRatios(md, v);
      expect(md.anim.gait).toBe('walk');
      for (const l of [2, 3]) {
        expect(r[l], `${b} ${v} m/s patte ${l}`).not.toBeNull();
        expect(r[l], `${b} ${v} m/s patte ${l}`).toBeLessThan(0.06);
      }
      md.dispose();
    }
  });
});

describe('queue en pompon du bobtail', () => {
  /**
   * Bout de la queue (peau déformée de la race, repos) : avancée de l'extrémité au centre et au bord, rayon ; le long de
   * l'axe de la base de la queue au centre du pompon (la boule n'est plus dans l'axe des deux derniers os, ramenés en
   * arrière avec la queue raccourcie).
   */
  function tipShape(md) {
    const S = md.anim.S;
    const base = md.anim.base;
    const P = S.D.pos;
    const H = S.D.heads;
    const tb = base.tailBones;
    const a = V(...H[tb[0]].toArray());
    const b = V();
    let cnt = 0;
    for (let i = 0; i < base.prims.coat.count; i++) {
      if (base.W.tail[i] < 0.7) continue;
      b.add(V(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]));
      cnt++;
    }
    b.multiplyScalar(1 / cnt);
    const axis = b.clone().sub(a).normalize();
    const pts = [];
    for (let i = 0; i < base.prims.coat.count; i++) {
      if (base.W.tail[i] < 0.7) continue;
      const p = V(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(b);
      const t = p.dot(axis);
      const rho = p.clone().addScaledVector(axis, -t).length();
      pts.push([t, rho]);
    }
    const tMax = Math.max(...pts.map((x) => x[0]));
    const end = pts.filter((x) => x[0] > tMax - 0.03);
    const R = Math.max(...end.map((x) => x[1]));
    const rim = Math.max(...pts.filter((x) => x[1] > 0.8 * R).map((x) => x[0]));
    return { R, dome: tMax - rim };
  }
  // Le bout était un disque plat (moignon coupé net) : il est bombé d'au moins 40 % de son rayon.
  it.each([['bobtail', 'adult'], ['bobtail', 'baby']])('%s (%s) : bout de la queue arrondi', (b, stage) => {
    const md = cat(b, stage);
    const { R, dome } = tipShape(md);
    expect(R, b).toBeGreaterThan(0.005);
    expect(dome / R, `${b} ${stage}`).toBeGreaterThan(0.4);
    md.dispose();
  });
  // Le nœud de queue du salon était posé sur l'os du bout de la queue, enfoui dans le pompon : il sort de la boule.
  it('bobtail : le nœud de queue du salon est posé à la surface du pompon, pas dedans', () => {
    const md = cat('bobtail');
    md.staticPose('stand');
    md.root.updateMatrixWorld(true);
    const acc = buildAccessories(md, lookOf('bobtail'), { tail: { id: 'tailBow', color: 'blue' } });
    expect(acc.length).toBe(1);
    md.root.updateMatrixWorld(true);
    const bow = acc[0].getWorldPosition(V());
    // distance au plus proche sommet de la queue (peau animée) : le nœud est dehors, posé dessus (moins de 1,5 cm)
    const m = md.coatMesh;
    let near = Infinity;
    const tip = md.tailTip.getWorldPosition(V());
    for (let i = 0; i < md.anim.base.prims.coat.count; i++) {
      if (md.anim.base.W.tail[i] < 0.7) continue;
      const p = m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
      near = Math.min(near, p.distanceTo(bow));
    }
    expect(near).toBeLessThan(0.015);
    // (loin de l'os du bout de la queue, qui est au cœur de la boule)
    expect(bow.distanceTo(tip)).toBeGreaterThan(0.01);
    md.dispose();
  });
});

describe('assis droit', () => {
  // Pieds avant en l'air (postérieurs longs du siamois et de l'abyssin, antérieurs courts du persan) : le corps basculait
  // de toute la hauteur et le dos tombait à 24° (siamois), 28° (abyssin), 26° (persan), 15,5° (chaton siamois) contre 34°
  // pour l'européen — un chat accroupi. Les pattes avant descendent d'abord vers le sol, redressées sous l'épaule.
  const sit = (b, stage) => {
    const md = cat(b, stage);
    md.staticPose('stand');
    for (let f = 0; f < 420; f++) md.anim.update(1 / 60, { v: 0, moving: false, posture: 'sit' });
    md.root.updateMatrixWorld(true);
    const P = md.bone('pelvis').getWorldPosition(V());
    const C = md.bone('chest').getWorldPosition(V());
    const back = (Math.atan2(C.y - P.y, Math.hypot(C.x - P.x, C.z - P.z)) * 180) / Math.PI;
    // (plus bas de la peau des soles avant, repère du monde : le chat est à l'origine)
    const m = md.coatMesh;
    const soles = md.anim.S.measure.soles;
    const front = [0, 1].map((l) => {
      let lo = Infinity;
      for (const i of soles[l]) lo = Math.min(lo, m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld).y);
      return lo;
    });
    md.dispose();
    return { back, front };
  };
  it.each([
    ['siamois', 'adult', 29], ['abyssin', 'adult', 32], ['persan', 'adult', 27.5], ['europeen', 'adult', 33],
    ['siamois', 'baby', 25], ['abyssin', 'baby', 30], ['maine_coon', 'baby', 25],
  ])('%s (%s) : dos assis à plus de %s°, pieds avant posés', (b, stage, min) => {
    const r = sit(b, stage);
    expect(r.back).toBeGreaterThan(min);
    for (const y of r.front) {
      expect(y).toBeLessThan(0.003);
      expect(y).toBeGreaterThan(-0.004);
    }
  });
});

describe('pinceaux et poils d\'oreille', () => {
  // Cartes qui prenaient la texture à l'envers : leur bout tombait sur les racines serrées et opaques des brins, coupées
  // net — des étiquettes grises à bord droit dans les oreilles des chatons maine coon et norvégien.
  it.each([['maine_coon', 'baby'], ['norvegien', 'baby'], ['maine_coon', 'adult']])('%s (%s) : racine de chaque carte en haut de la texture (v = 1), bout en bas (v = 0), poils d\'oreille étroits', (b, stage) => {
    const md = cat(b, stage);
    const g = md.tuftMesh.geometry;
    const uv = g.attributes.uv;
    const p = g.attributes.position;
    expect(uv.count % 4).toBe(0);
    for (let q = 0; q < uv.count; q += 4) {
      expect(uv.getY(q)).toBe(1);
      expect(uv.getY(q + 1)).toBe(1);
      expect(uv.getY(q + 2)).toBe(0);
      expect(uv.getY(q + 3)).toBe(0);
      // (largeur de la carte au plus 0,6 fois sa longueur)
      const w = V().fromBufferAttribute(p, q).distanceTo(V().fromBufferAttribute(p, q + 1));
      const h = V().fromBufferAttribute(p, q).distanceTo(V().fromBufferAttribute(p, q + 3));
      expect(w).toBeLessThan(0.6 * h);
    }
    md.dispose();
  });
});

describe('collier des chats à poil long', () => {
  // Collier enfoncé de moitié dans la collerette restée debout : seul un bout dépassait à la nuque (maine coon, persan,
  // norvégien, ragdoll). Le poil des couches est couché sous la bande du collier porté (sillon, comme chez le chien).
  const STUB_V = '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>';
  const STUB_F = '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <alphatest_fragment>';
  const compile = (m) => {
    const sh = { uniforms: {}, vertexShader: STUB_V, fragmentShader: STUB_F };
    m.onBeforeCompile(sh, {});
    return sh;
  };
  it.each(['maine_coon', 'persan'])('%s : sillon posé avec le collier, retiré avec lui, à la place de l\'anneau', (b) => {
    const md = cat(b);
    let shell = null;
    md.root.traverse((o) => {
      if (!shell && o.material?.customProgramCacheKey?.()?.startsWith('cat-shell')) shell = o;
    });
    expect(shell, 'couches du poil (qualité haute)').toBeTruthy();
    const sh = compile(shell.material);
    expect(sh.vertexShader).toContain('len *= 1.0 - 0.92 * bandC');
    const R = sh.uniforms.cCollarR.value;
    expect(R.w).toBe(0);
    const g = buildGear(md, lookOf(b), { neck: { item: 'collar', color: 'red' } });
    expect(R.w).toBe(1);
    const F = md.dogFit.collar;
    expect(R.x).toBeGreaterThan(F.rx);
    expect(R.z).toBeGreaterThan(0.005);
    // (la bande, repérée dans la pose de liaison, tombe sur l'anneau une fois le chat debout)
    md.staticPose('stand');
    md.root.updateMatrixWorld(true);
    const C = sh.uniforms.cCollarC.value;
    const N = sh.uniforms.cCollarN.value;
    const ring = F.bone.localToWorld(F.center.clone());
    const nW = F.normal.clone().transformDirection(F.bone.matrixWorld);
    const m = md.coatMesh;
    const pos = m.geometry.attributes.position;
    const v = V();
    let n = 0;
    let sum = 0;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).sub(C);
      const d = v.dot(N);
      if (Math.abs(d) > 0.004 || v.addScaledVector(N, -d).length() > 2 * Math.max(F.rx, F.ry)) continue;
      sum += Math.abs(m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld).sub(ring).dot(nW));
      n++;
    }
    expect(n).toBeGreaterThan(10);
    expect(sum / n).toBeLessThan(0.009);
    for (const h of g.userData.meshes) for (const x of h.userData?.dispose ?? []) x.dispose?.();
    expect(R.w).toBe(0);
    md.dispose();
  });
});

describe('chaton devon rex', () => {
  // Vagues du poil frisé à pleine force sur la grosse tête du chaton : bandes sombres sur les joues et le cou, corps en
  // carton ondulé. Chaton : vagues plus douces et deux fois plus fines, tête et haut du cou épargnés (rayon plus large).
  it('vagues plus douces que chez l\'adulte, masque de tête par la distance au centre de la tête', () => {
    const kit = cat('devon_rex', 'baby');
    const ad = cat('devon_rex');
    const compile = (md) => {
      const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>' };
      md.coatMesh.material.onBeforeCompile(sh, {});
      return sh;
    };
    const k = compile(kit);
    const a = compile(ad);
    expect(k.uniforms.cHair.value.y).toBeGreaterThan(0);
    expect(k.uniforms.cHair.value.y).toBeLessThan(0.5 * a.uniforms.cHair.value.y);
    expect(k.uniforms.cIris.value.x).toBe(1);
    expect(a.uniforms.cIris.value.x).toBe(0);
    expect(k.fragmentShader).toContain('cHair.y * catCurlMask(vCmpPos, vCmpPart)');
    expect(k.fragmentShader).toContain('distance(p, cHead.xyz) / max(0.01, cNose.w)');
    kit.dispose();
    ad.dispose();
  });

  // Iris peint du chaton à 0,86 rad : le globe peint en noir se voyait tout autour (cercle sombre du chaton persan).
  it('chaton : iris peint jusqu\'au bord de l\'œil ouvert (demi-angle d\'au moins 1 rad)', () => {
    const kit = cat('persan', 'baby');
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>' };
    kit.eyeMesh.material.onBeforeCompile(sh, {});
    expect(sh.uniforms.cIris.value.x).toBe(1);
    expect(sh.uniforms.cIris.value.z).toBeGreaterThanOrEqual(1);
    kit.dispose();
  });
});

describe('sous les yeux', () => {
  // La texture d'origine est peinte lisse et claire sous l'œil : un croissant sans poil (british, chartreux, scottish fold,
  // européen). Le relief y est pris sur un grain du pelage, jamais plus clair que le pelage voisin.
  it.each(['british', 'europeen'])('%s : la robe remplace le relief lisse sous l\'œil par du grain', (b) => {
    const md = cat(b);
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>' };
    md.coatMesh.material.onBeforeCompile(sh, {});
    expect(sh.fragmentShader).toContain('uniform vec4 cIris;');
    expect(sh.fragmentShader).toContain('detail = mix(detail, min(detail, 1.0) * grainE, ringE)');
    // (rayon du globe pour l'anneau : celui de la race, non nul)
    expect(sh.uniforms.cIris.value.y).toBeGreaterThan(0.002);
    md.dispose();
  });
});

// Finitions (2e passe) des chats réalistes : chaton qui dort vraiment roulé en boule sur le flanc, pompon du bobtail
// en boule, pas de peau retournée à l'aine pendant la toilette, pas posés au pas, avant du collier visible sous le
// menton, ... Déterministe :
// graines fixes, pas de temps fixe, aucun Math.random (le mixeur est appelé avec des états donnés).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { buildRealCatModel } from '../src/game/models/catReal.js';
import { buildGear } from '../src/game/gearModels.js';
import { catLookWithBreed } from '../src/sim/catLook.js';
import { SPECIES } from '../src/sim/species.js';
import { resolveLook } from '../src/sim/animal.js';
import { loadRealCatGltf } from './fixtures/realCatGltf.js';

// (machine chargée : construire et animer un chat prend parfois plusieurs secondes)
vi.setConfig({ testTimeout: 180000 });

const BREEDS = SPECIES.cat.breeds.map((b) => b.id);
let G;
beforeAll(async () => {
  G = { adult: await loadRealCatGltf('adult'), kitten: await loadRealCatGltf('kitten') };
}, 120000);

const lookOf = (breed, colorIndex = 0) => catLookWithBreed({ ...resolveLook('cat', breed, colorIndex), seed: 4242 }, breed);
const cat = (breed, stage = 'adult') => buildRealCatModel(lookOf(breed), stage, G[stage === 'baby' ? 'kitten' : 'adult']);
const _v = new THREE.Vector3();

/** Position d'un os dans le repère du chat. */
function local(md, name) {
  md.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
  return md.bone(name).getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
}

/** Plus bas et plus haut de la peau (repère du chat). */
function skinBox(md, step = 2) {
  md.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
  const m = md.coatMesh;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < m.geometry.attributes.position.count; i += step) {
    m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
    lo = Math.min(lo, _v.y);
    hi = Math.max(hi, _v.y);
  }
  return { lo, hi };
}

describe('chaton en boule', () => {
  // Le chaton qui dort était « bombé, pas roulé » : debout tassé sur ses pattes, dos rond, tête entre les pattes (roulis
  // 0°, tête à 70 % de sa hauteur debout, à 0,54 longueur de corps de ses pieds arrière). Il est maintenant couché sur
  // le flanc (83°), roulé : tête posée contre les pieds arrière, queue enroulée, peau jamais sous le sol.
  it.each(BREEDS)('%s : couché sur le flanc, roulé, tête contre les pieds arrière, rien sous le sol', (breed) => {
    const md = cat(breed, 'baby');
    md.staticPose('stand');
    const stand = skinBox(md);
    const headStand = local(md, 'head').y - stand.lo;
    const len = local(md, 'head').distanceTo(local(md, 'tail1'));
    md.staticPose('curl');
    const box = skinBox(md);
    const L = local(md, 'femurL');
    const R = local(md, 'femurR');
    const roll = Math.asin(Math.min(1, Math.abs(L.y - R.y) / L.distanceTo(R)));
    expect(roll, 'roulis (rad)').toBeGreaterThan(1.05);
    const h = local(md, 'head');
    expect(h.y - box.lo, 'hauteur de la tête').toBeLessThan(0.55 * headStand);
    const paw = Math.min(h.distanceTo(local(md, 'htoesL')), h.distanceTo(local(md, 'htoesR')));
    expect(paw / len, 'tête - pieds arrière').toBeLessThan(0.32);
    expect((box.hi - box.lo) / (stand.hi - stand.lo), 'hauteur de la boule').toBeLessThan(0.75);
    // (le poil long s'écrase un peu sur le sol)
    expect(box.lo).toBeGreaterThan(-0.004 - 0.4 * Math.max(0, md.build.fur));
    expect(box.lo).toBeLessThan(0.01);
    md.dispose();
  });

  it('couché → en boule → couché → debout : jamais sous le sol, jamais en l\'air (peau à moins de 8 mm du sol)', () => {
    for (const breed of ['europeen', 'maine_coon', 'siamois']) {
      const md = cat(breed, 'baby');
      md.staticPose('lie');
      let worst = Infinity;
      let high = -Infinity;
      for (const posture of ['lie', 'curl', 'lie', 'stand']) {
        for (let f = 0; f < 150; f++) {
          md.anim.update(1 / 30, { v: 0, moving: false, posture, sleeping: posture === 'curl' });
          if (f % 3) continue;
          const { lo } = skinBox(md, 3);
          worst = Math.min(worst, lo);
          high = Math.max(high, lo);
        }
      }
      // (au repos, la peau peut s'enfoncer de bodyAllow, 3 mm et plus pour le poil long ; 1 mm de plus en passant)
      expect(worst, breed).toBeGreaterThan(-0.001 - md.anim.bodyAllow);
      expect(high, breed).toBeLessThan(0.008);
      md.dispose();
    }
  });
});

describe('pompon du bobtail', () => {
  /** Sommets de la boule du pompon (portés par la base de la queue) : positions (repère du chat), repos ou pose. */
  function pompon(md, rest = false) {
    const base = md.anim.base;
    const P = md.anim.S.D.pos;
    const k = md.anim.S.D.stubK;
    md.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
    const out = [];
    for (let i = 0; i < base.prims.coat.count; i++) {
      if (!(k?.[i] > 0.95)) continue;
      out.push(rest ? new THREE.Vector3().fromArray(P, i * 3) : md.coatMesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(md.coatMesh.matrixWorld).applyMatrix4(inv));
    }
    return out;
  }
  /**
   * Rondeur : sphère ajustée aux points (moindres carrés, forme algébrique |p|² = 2 c·p + d) ; écart relatif des
   * distances à son centre (0 pour une boule parfaite) et rayon moyen.
   */
  function roundness(pts) {
    const N = Array.from({ length: 4 }, () => new Array(5).fill(0));
    for (const p of pts) {
      const row = [2 * p.x, 2 * p.y, 2 * p.z, 1];
      const y = p.lengthSq();
      for (let r = 0; r < 4; r++) {
        N[r][4] += row[r] * y;
        for (let c = 0; c < 4; c++) N[r][c] += row[r] * row[c];
      }
    }
    for (let i = 0; i < 4; i++) {
      for (let r = 0; r < 4; r++) {
        if (r === i) continue;
        const f = N[r][i] / N[i][i];
        for (let c = i; c < 5; c++) N[r][c] -= f * N[i][c];
      }
    }
    const c = new THREE.Vector3(N[0][4] / N[0][0], N[1][4] / N[1][1], N[2][4] / N[2][2]);
    const d = pts.map((p) => p.distanceTo(c));
    const m = d.reduce((s, x) => s + x, 0) / d.length;
    const sd = Math.sqrt(d.reduce((s, x) => s + (x - m) ** 2, 0) / d.length);
    return { cv: sd / m, r: m, c };
  }
  // Le pompon était un tonneau au bout bombé, lié aux huit os de la queue (un bouchon à bord net, froissé quand la queue
  // bougeait) : c'est une boule (écart à la sphère ajustée, mêmes sommets : 0,08 à 0,25 avant, 0,03 maintenant),
  // portée d'un bloc par la base de la queue, qui reste ronde dans les poses.
  it.each(['adult', 'young', 'baby'])('%s : une boule, ronde aussi debout, au trot et assis', (stage) => {
    const md = cat('bobtail', stage);
    const pts = pompon(md, true);
    expect(pts.length).toBeGreaterThan(100);
    const r0 = roundness(pts);
    expect(r0.cv, 'repos').toBeLessThan(0.08);
    expect(r0.r).toBeGreaterThan(0.012);
    expect(r0.r).toBeLessThan(0.03);
    for (const [clip, t] of [['idle', 0.5], ['trot', 0.3], ['sit', 0]]) {
      md.anim.clipPose(clip, t);
      expect(roundness(pompon(md)).cv, `${stage} ${clip}`).toBeLessThan(0.08);
    }
    md.dispose();
  });

  it('se voit de dos et de profil : la boule sort de la silhouette de la croupe (en arrière ou au-dessus) d\'au moins la moitié de son rayon', () => {
    for (const stage of ['adult', 'young', 'baby']) {
      const md = cat('bobtail', stage);
      md.staticPose('stand');
      const pts = pompon(md);
      const { r } = roundness(pts);
      const back = Math.min(...pts.map((p) => p.z));
      const top = Math.max(...pts.map((p) => p.y));
      const zc = pts.reduce((s, p) => s + p.z, 0) / pts.length;
      md.root.updateMatrixWorld(true);
      const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
      const base = md.anim.base;
      let rump = Infinity;
      let hip = -Infinity;
      for (let i = 0; i < base.prims.coat.count; i += 2) {
        if (base.W.tail[i] > 0.05) continue;
        const q = md.coatMesh.getVertexPosition(i, _v).applyMatrix4(md.coatMesh.matrixWorld).applyMatrix4(inv);
        rump = Math.min(rump, q.z);
        if (Math.abs(q.z - zc) < 0.03) hip = Math.max(hip, q.y);
      }
      expect(Math.max(rump - back, top - hip), stage).toBeGreaterThan(0.5 * r);
      md.dispose();
    }
  });

  it('robe lue près de la croupe : repères du motif du pompon à moins de 35 % de la longueur de la queue d\'origine', () => {
    for (const stage of ['adult', 'baby']) {
      const md = cat('bobtail', stage);
      const base = md.anim.base;
      const rest = md.coatMesh.geometry.attributes.cmpRest.array;
      const c0 = base.heads[base.tailBones[0]];
      let far = 0;
      for (let i = 0; i < base.prims.coat.count; i++) {
        if (base.W.tail[i] < 0.7) continue;
        far = Math.max(far, _v.fromArray(rest, i * 3).distanceTo(c0));
      }
      expect(far / base.land.tailLen, stage).toBeLessThan(0.35);
      md.dispose();
    }
  });
});

/**
 * Peau retournée visible sur les pattes arrière, dans la pose du clip à l'instant t : triangles dont l'ordre des
 * sommets s'est inversé (normale du triangle déformé opposée aux normales des sommets, tournées par leurs os) et
 * qu'un rayon partant de leur centre le long de la peau quitte sans rien toucher (ils se voient : faces arrière,
 * magenta en rendu de débogage). Seuls les triangles portés surtout par la cuisse, la jambe ou le pied arrière.
 * Retourne { n, cm2 }.
 */
function legFlips(md, clip, t) {
  const g = md.coatMesh.geometry;
  const idx = g.index.array;
  const n = g.attributes.position.count;
  const si = g.attributes.skinIndex.array;
  const sw = g.attributes.skinWeight.array;
  const N = g.attributes.normal.array;
  const names = md.skeleton.bones.map((b) => b.name);
  const isLeg = names.map((nm) => /^(femur|tibia|metatarsus|htoes|haunch)[LR]$/.test(nm));
  md.anim.clipPose(clip, t);
  md.coatMesh.updateMatrixWorld(true);
  md.skeleton.update();
  const P = new Float32Array(n * 3);
  const NP = new Float32Array(n * 3);
  const legW = new Float32Array(n);
  const inv = new THREE.Matrix4().copy(md.coatMesh.matrixWorld).invert();
  const mats = md.skeleton.bones.map((bn, k) => new THREE.Matrix4().multiplyMatrices(bn.matrixWorld, md.skeleton.boneInverses[k]).premultiply(inv));
  const v = new THREE.Vector3();
  const acc = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    md.coatMesh.getVertexPosition(i, v);
    P.set([v.x, v.y, v.z], i * 3);
    acc.set(0, 0, 0);
    for (let c = 0; c < 4; c++) {
      const w = sw[i * 4 + c];
      if (!(w > 0)) continue;
      acc.addScaledVector(v.fromArray(N, i * 3).transformDirection(mats[si[i * 4 + c]]), w);
      if (isLeg[si[i * 4 + c]]) legW[i] += w;
    }
    NP.set([acc.x, acc.y, acc.z], i * 3);
  }
  const fg = new THREE.BufferGeometry();
  fg.setAttribute('position', new THREE.BufferAttribute(P, 3));
  fg.setIndex(new THREE.BufferAttribute(idx, 1));
  const fm = new THREE.Mesh(fg, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  const ray = new THREE.Raycaster();
  ray.far = 0.08;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const nf = new THREE.Vector3();
  const nv = new THREE.Vector3();
  const ce = new THREE.Vector3();
  let cnt = 0;
  let area = 0;
  for (let f = 0; f < idx.length; f += 3) {
    const i0 = idx[f];
    const i1 = idx[f + 1];
    const i2 = idx[f + 2];
    if (legW[i0] + legW[i1] + legW[i2] < 1.5) continue;
    a.fromArray(P, i0 * 3);
    b.fromArray(P, i1 * 3).sub(a);
    c.fromArray(P, i2 * 3).sub(a);
    nf.crossVectors(b, c);
    if (nf.lengthSq() < 1e-14) continue;
    nv.fromArray(NP, i0 * 3).add(b.fromArray(NP, i1 * 3)).add(c.fromArray(NP, i2 * 3));
    if (!(nf.dot(nv) < 0)) continue;
    ce.fromArray(P, i0 * 3).add(b.fromArray(P, i1 * 3)).add(c.fromArray(P, i2 * 3)).multiplyScalar(1 / 3);
    nv.normalize();
    ray.set(ce.addScaledVector(nv, 0.0005), nv);
    if (ray.intersectObject(fm, false).some((h) => h.faceIndex !== f / 3)) continue;
    cnt++;
    area += nf.length() / 2;
  }
  fg.dispose();
  return { n: cnt, cm2: area * 1e4 };
}

describe('aine pendant la toilette', () => {
  // Avant (poids de chaleur bruts ; culottes poussées à plein dans le pli du genou), toilette à 0,35 : de 15 à 116
  // triangles retournés visibles sur les pattes arrière selon la race adulte, 0,8 à 25 cm² (13 races sur 15 au-dessus
  // de 3,6 cm²), 2,6 à 8,8 cm² chez le chaton ; triangle magenta devant la cuisse repliée, de profil. Après : genou
  // fondu large, pattes arrière sans part de la queue ni de la patte d'en face, flanc rendu au dos (cat_autorig.py),
  // poil long presque pas poussé dans le pli du genou (deformCat) : 0,3 à 1,2 cm² (adulte), 0,9 à 2,2 cm² (chaton).
  it.each(BREEDS)('%s adulte : moins de 1,5 cm² de peau retournée visible sur les pattes arrière (assis, toilette)', (breed) => {
    const md = cat(breed);
    for (const [clip, t] of [['groom', 0.35], ['sit', 0]]) {
      const r = legFlips(md, clip, t);
      expect(r.cm2, `${clip} ${t} : ${r.n} triangles`).toBeLessThan(1.5);
    }
    md.dispose();
  });

  it('chatons (européen, maine coon, persan, british) : moins de 2,5 cm² sur les pattes arrière pendant la toilette', () => {
    for (const breed of ['europeen', 'maine_coon', 'persan', 'british']) {
      const md = cat(breed, 'baby');
      const r = legFlips(md, 'groom', 0.35);
      expect(r.cm2, `${breed} : ${r.n} triangles`).toBeLessThan(2.5);
      md.dispose();
    }
  });
});

/**
 * Chat qui avance comme en jeu : plus bas de la peau de chaque sole (repère du monde) image par image, après une
 * seconde pour prendre l'allure (comme catFinish.test.js).
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

/**
 * Glissement des appuis (méthode de la critique, comme catFinish.test.js) : le sommet de peau le plus bas d'une sole est
 * suivi tant qu'il reste à moins de 4 mm du sol ; chemin sur le sol ÷ (durée × vitesse). Médiane par patte.
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

describe('chaton au pas lent', () => {
  // Avant, à 0,3 m/s : les pieds avant posés glissaient de 9 à 23 % de la vitesse (européen 12 et 14 %, norvégien 23 %,
  // siamois 12 et 14 %, abyssin 8 et 9 %) : le coussinet de la sole, à moitié porté par le métacarpe qui bascule
  // pendant l'appui, reculait en se levant ; pieds posés encore lancés en avant. Après : 1,4 à 3,1 %, arrière 1 %.
  it.each(['europeen', 'siamois', 'norvegien', 'abyssin', 'bobtail'])('%s chaton : au pas lent, pieds avant et arrière posés glissent de moins de 5 %', (b) => {
    const md = cat(b, 'baby');
    md.staticPose('stand');
    const r = slipRatios(md, 0.3);
    expect(md.anim.gait).toBe('walk');
    r.forEach((x, l) => {
      expect(x, `${b} patte ${l}`).not.toBeNull();
      expect(x, `${b} patte ${l}`).toBeLessThan(0.05);
    });
    md.dispose();
  });
});

describe('pas posé des races longilignes', () => {
  // Avant, au pas de 0,5 à 0,7 m/s, siamois, abyssin, devon rex, sphynx et bobtail (adultes et jeunes) avaient les
  // quatre pieds à plus de 3 mm du sol 38 à 51 % du temps (chaque pied posé 13 à 16 % du temps) : le pied arrière du
  // clip, encore lancé en avant, était pris trop tôt, retenu, enfoncé, et le corps relevé de 2 à 3 cm. Après : jamais.
  it.each([
    ['siamois', 'adult'], ['siamois', 'young'], ['abyssin', 'adult'], ['devon_rex', 'adult'], ['sphynx', 'young'], ['bobtail', 'adult'],
  ])('%s (%s) : au pas, toujours un pied posé et chaque pied posé plus du quart du temps', (b, stage) => {
    for (const v of [0.5, 0.7]) {
      const md = cat(b, stage);
      md.staticPose('stand');
      const tr = soleTrack(md, v);
      expect(md.anim.gait).toBe('walk');
      const n = tr[0].length;
      let air = 0;
      for (let f = 0; f < n; f++) if (Math.min(tr[0][f], tr[1][f], tr[2][f], tr[3][f]) > 0.003) air++;
      expect(air / n, `${b} ${stage} ${v} m/s`).toBeLessThan(0.05);
      tr.forEach((ys, l) => expect(ys.filter((y) => y < 0.003).length / n, `${b} ${stage} ${v} m/s patte ${l}`).toBeGreaterThan(0.25));
      md.dispose();
    }
  });
});

describe('collier sous le menton', () => {
  // L'anneau du collier, mesuré sur la coupe du cou, laissait de côté la gorge (sa peau est portée surtout par les pattes
  // avant) : l'ellipse s'arrêtait 3 à 6 cm au-dessus, et l'avant du collier passait dans le cou, caché sous le menton et
  // la collerette (maine coon, norvégien, ragdoll, persan ; le dessous seul chez l'européen). Mesure : depuis une caméra
  // devant la tête (comme la vue « face » des planches), part des points du dessous de la bande (150° à 210°) que la
  // robe ne cache pas. La robe est prise telle que le shader la montre : serrée sous la bande (réplique de PUSH_V,
  // catCoat.js : sommets choisis au repos, ellipse retrouvée dans la pose par la matrice de l'os du collier).
  function wornCoat(md) {
    const m = md.coatMesh;
    const geo = m.geometry;
    const pos = geo.attributes.position;
    const part = geo.attributes.cmpPart;
    const u = md.uniforms;
    const C = u.cCollarC.value;
    const N = u.cCollarN.value;
    const X = u.cCollarX.value;
    const R = u.cCollarR.value;
    const bone = m.skeleton.bones[u.cCollarB.value];
    // (matrice de l'os dans le repère du maillage, comme bindMatrixInverse * getBoneMatrix)
    const nb = new THREE.Matrix4().copy(m.bindMatrixInverse).multiply(bone.matrixWorld).multiply(m.skeleton.boneInverses[u.cCollarB.value]);
    const cp = C.clone().applyMatrix4(nb);
    const np = N.clone().transformDirection(nb);
    const xp = X.clone().transformDirection(nb);
    const sm = (a, b, x) => {
      const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
      return t * t * (3 - 2 * t);
    };
    const ell = (ux) => 1 / Math.sqrt((ux * ux) / (R.x * R.x) + Math.max(0, 1 - ux * ux) / (R.y * R.y));
    const out = new Float32Array(pos.count * 3);
    const q = new THREE.Vector3();
    const t = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      q.fromBufferAttribute(pos, i).applyMatrix4(m.bindMatrix).sub(C);
      const dd = q.dot(N);
      q.addScaledVector(N, -dd);
      const rlq = Math.max(q.length(), 1e-5);
      const zone = (1 - sm(R.z, R.z * 2.8, Math.abs(dd))) * (1 - sm(1.3, 1.8, rlq / ell(q.dot(X) / rlq))) * (1 - sm(0.4, 0.8, part.getZ(i)));
      m.getVertexPosition(i, t);
      if (zone > 0 && R.w > 0) {
        const rv = t.clone().sub(cp);
        rv.addScaledVector(np, -rv.dot(np));
        const rl = Math.max(rv.length(), 1e-5);
        const re = ell(rv.dot(xp) / rl) - 0.004;
        t.addScaledVector(rv, (-Math.max(0, rl - re) / rl) * zone);
      }
      t.applyMatrix4(m.matrixWorld);
      out.set([t.x, t.y, t.z], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(out, 3));
    g.setIndex(geo.index);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  }

  it.each([
    ['maine_coon', 'adult'], ['norvegien', 'adult'], ['ragdoll', 'adult'], ['persan', 'adult'], ['europeen', 'adult'],
    ['siamois', 'adult'], ['maine_coon', 'baby'], ['persan', 'baby'],
  ])('%s (%s) : le dessous de la bande se voit de face, sous le menton', (b, stage) => {
    const md = cat(b, stage);
    md.staticPose('stand');
    const g = buildGear(md, lookOf(b), { neck: { item: 'collar', color: 'red' } });
    md.root.updateMatrixWorld(true);
    const F = md.dogFit.collar;
    const ring = F.bone.children.find((o) => !o.isBone && o.children?.length);
    const coat = wornCoat(md);
    // caméra : devant la tête (le chat regarde vers +z), à sa hauteur
    const cam = md.head.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.02, 0.01, 0.35).transformDirection(md.root.matrixWorld).multiplyScalar(0.35 * md.root.scale.x));
    const ray = new THREE.Raycaster();
    let seen = 0;
    const N = 7;
    for (let k = 0; k < N; k++) {
      const a = Math.PI * (150 + (60 * k) / (N - 1)) / 180;
      // (surface extérieure de la bande : rayon de l'ellipse + écart 6 mm + épaisseur 7 mm)
      const p = new THREE.Vector3((F.rx + 0.013) * Math.sin(a), (F.ry + 0.013) * Math.cos(a), 0).applyMatrix4(ring.matrixWorld);
      const dir = p.clone().sub(cam);
      const dist = dir.length();
      ray.set(cam, dir.normalize());
      ray.far = dist - 0.002;
      if (!ray.intersectObject(coat).length) seen++;
    }
    expect(seen / N, `${b} ${stage} : ${seen}/${N} points du dessous de la bande visibles`).toBeGreaterThanOrEqual(5 / 7);
    // (sillon : réglé par le collier, retiré avec lui)
    expect(md.uniforms.cCollarB.value).toBe(md.coatMesh.skeleton.bones.indexOf(F.bone));
    for (const h of g.userData.meshes) for (const x of h.userData?.dispose ?? []) x.dispose?.();
    expect(md.uniforms.cCollarR.value.w).toBe(0);
    coat.geometry.dispose();
    md.dispose();
  });
});

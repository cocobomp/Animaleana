// Finitions (2e passe) des chats réalistes : chaton qui dort vraiment roulé en boule sur le flanc, pompon du bobtail
// en boule, pas de peau retournée à l'aine pendant la toilette, pas posés au pas, avant du collier visible sous le
// menton, fourrure sous les yeux, ... Déterministe :
// graines fixes, pas de temps fixe, aucun Math.random (le mixeur est appelé avec des états donnés).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { buildRealCatModel, realCatBase, realCatPose } from '../src/game/models/catReal.js';
import { buildGear } from '../src/game/gearModels.js';
import { buildAccessories } from '../src/game/models/salon.js';
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
  // robe ne cache pas. La robe est prise telle que le shader la montre : serrée sous la bande (déplacement cmpCollar
  // ajouté avant les os, catCoat.js / catReal.js collarStand).
  function wornCoat(md) {
    const m = md.coatMesh;
    const geo = m.geometry;
    const pos = geo.attributes.position;
    const cc = geo.attributes.cmpCollar;
    const on = md.uniforms.cCollarR.value.w;
    const out = new Float32Array(pos.count * 3);
    const t = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      t.fromBufferAttribute(pos, i);
      if (cc && on) t.add(new THREE.Vector3(cc.getX(i), cc.getY(i), cc.getZ(i)).multiplyScalar(on));
      m.applyBoneTransform(i, t);
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
    const ring = F.bone.children.find((o) => !o.isBone); // (repère de l'anneau mesuré, sur l'os du cou)
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
    // (bande liée au squelette, debout à la place de l'anneau mesuré ; sillon réglé par le collier, retiré avec lui)
    let band = null;
    for (const h of g.userData.meshes) h.traverse((o) => {
      if (o.userData?.collarBand) band = o;
    });
    expect(band?.isSkinnedMesh).toBe(true);
    expect(md.uniforms.cCollarR.value.w).toBe(1);
    for (const h of g.userData.meshes) for (const x of h.userData?.dispose ?? []) x.dispose?.();
    expect(md.uniforms.cCollarR.value.w).toBe(0);
    coat.geometry.dispose();
    md.dispose();
  });
});

describe('fourrure sous les yeux', () => {
  // La texture de l'adulte est peinte lisse et claire sous l'œil (un croissant sans poil : british, chartreux, scottish
  // fold, européen) et sombre au coin intérieur (une tache de larme sur le maine coon). Le shader de la robe y prend le
  // relief de la joue voisine : décalage de texture cEyeUv, mesuré sur le modèle. Vérifié ici : le décalage existe pour
  // l'adulte (symétrique d'un œil à l'autre), et pour presque tous les sommets du tour de l'œil il mène dans la texture à
  // de la fourrure de la joue (le sommet dont la coordonnée de texture est la plus proche est hors de l'œil, plus en
  // dehors que lui).
  it.each(['british', 'chartreux', 'scottish_fold', 'europeen', 'maine_coon'])('%s : relief pris sur la joue', (b) => {
    const md = cat(b);
    const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>\n#include <skinning_vertex>', fragmentShader: '#include <common>\n#include <color_fragment>\n#include <roughnessmap_fragment>' };
    md.coatMesh.material.onBeforeCompile(sh, {});
    expect(sh.fragmentShader).toContain('vec2 uvE = vMapUv + offE;');
    expect(sh.fragmentShader).toContain('detail = mix(detail, detS, ringE);');
    const o = sh.uniforms.cEyeUv.value;
    for (const [du, dv] of [[o.x, o.y], [o.z, o.w]]) {
      expect(Math.hypot(du, dv), b).toBeGreaterThan(0.03);
      expect(Math.hypot(du, dv), b).toBeLessThan(0.12);
    }
    expect(Math.sign(o.x), b).toBe(-Math.sign(o.z));
    expect(Math.abs(o.y - o.w), b).toBeLessThan(0.01);
    // où mène le décalage, sommet par sommet (dessous et coins de l'œil, de 1,1 à 2,6 rayons du globe)
    const base = realCatBase(G.adult, 'adult');
    const c = base.prims.coat;
    const L = base.land;
    let n = 0;
    let ok = 0;
    for (let i = 0; i < c.count; i++) {
      if (base.W.head[i] < 0.6) continue;
      const x = c.pos[i * 3];
      const side = x > L.midX ? 1 : -1;
      const dx = (x - (L.midX + side * L.eyeX)) / L.eyeR;
      const dy = (c.pos[i * 3 + 1] - L.eyeY) / L.eyeR;
      const dz = (c.pos[i * 3 + 2] - L.eyeZ) / L.eyeR;
      const de = Math.hypot(dx, dy, dz);
      if (de < 1.1 || de > 2.6 || dy > 0) continue;
      const u = c.uv[i * 2] + (side > 0 ? o.x : o.z);
      const v = c.uv[i * 2 + 1] + (side > 0 ? o.y : o.w);
      let bd = Infinity;
      let bj = -1;
      for (let j = 0; j < c.count; j++) {
        const d = (c.uv[j * 2] - u) ** 2 + (c.uv[j * 2 + 1] - v) ** 2;
        if (d < bd) {
          bd = d;
          bj = j;
        }
      }
      const ex = (c.pos[bj * 3] - (L.midX + side * L.eyeX)) / L.eyeR;
      const ey = (c.pos[bj * 3 + 1] - L.eyeY) / L.eyeR;
      const ez = (c.pos[bj * 3 + 2] - L.eyeZ) / L.eyeR;
      n++;
      // (hors de l'œil peint, plus en dehors sur la joue que le sommet lui-même, et pas au-dessus de l'œil)
      if (Math.hypot(ex, ey, ez) > 1.15 && ex * side - dx * side > 0.3 && ey < 0.3) ok++;
    }
    expect(n, b).toBeGreaterThan(20);
    expect(ok / n, `${b} : ${ok}/${n} sommets du tour de l'œil prennent la fourrure de la joue`).toBeGreaterThan(0.8);
    md.dispose();
  });

  it('chaton : yeux peints, rien de prêté', () => {
    const md = cat('british', 'baby');
    const o = md.uniforms.cEyeUv.value;
    expect(o.x === 0 && o.y === 0 && o.z === 0 && o.w === 0).toBe(true);
    md.dispose();
  });
});

describe('collier lié à la peau', () => {
  // Anneau rigide porté par l'os du cou (même agrandi jusqu'à la gorge) : il quittait la peau dès que le cou se pliait —
  // la gorge suit surtout les pattes avant — : cerceau autour du poitrail couché (médaille au sol), bandoulière assis,
  // barre au-dessus de la tête en mangeant, patte levée passée dedans. Lié au squelette, chaque point de la bande reste
  // près du point de peau qu'il touchait debout. Mesure : écart bande–peau de chaque sommet de la bande à son sommet de
  // peau le plus proche debout, comparé debout et dans la pose (avant, en mangeant : 4 à 10 cm au pire, 2 à 6 cm en
  // médiane ; maintenant au plus 0,2 cm en médiane, 1,4 cm pour 9 points sur 10). Peau telle que le shader la montre
  // (serrée sous la bande).
  const skinNow = (md) => {
    const m = md.coatMesh;
    const geo = m.geometry;
    const cc = geo.attributes.cmpCollar;
    const on = md.uniforms.cCollarR.value.w;
    md.root.updateMatrixWorld(true);
    const out = [];
    for (let i = 0; i < geo.attributes.position.count; i++) {
      const t = new THREE.Vector3().fromBufferAttribute(geo.attributes.position, i);
      if (cc && on) t.add(new THREE.Vector3(cc.getX(i), cc.getY(i), cc.getZ(i)).multiplyScalar(on));
      m.applyBoneTransform(i, t);
      out.push(t.applyMatrix4(m.matrixWorld));
    }
    return out;
  };
  const verts = (m) => {
    const out = [];
    for (let i = 0; i < m.geometry.attributes.position.count; i++) out.push(m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld));
    return out;
  };
  const near = (S, q) => {
    let d = Infinity;
    let j = -1;
    for (let k = 0; k < S.length; k++) {
      const e = S[k].distanceToSquared(q);
      if (e < d) {
        d = e;
        j = k;
      }
    }
    return j;
  };
  const pose = (md, p) => {
    if (p === 'groom' || p === 'eat') {
      md.staticPose(p === 'groom' ? 'sit' : 'stand');
      for (let i = 0; i < 180; i++) md.anim.update(1 / 60, { moving: false, v: 0, posture: p === 'groom' ? 'groom' : 'crouch' });
    } else if (p === 'highfive') {
      md.staticPose('sit');
      for (let i = 0; i < 40; i++) {
        realCatPose(md, 'highfive', 1);
        md.anim.update(1 / 60, { moving: false, v: 0, posture: 'sit' });
      }
    } else md.staticPose(p);
    md.root.updateMatrixWorld(true);
  };
  it.each([['europeen', 'adult'], ['maine_coon', 'adult'], ['persan', 'adult'], ['europeen', 'baby']])('%s (%s) : la bande reste sur la peau couché, assis, à la toilette, en mangeant, patte levée', (b, stage) => {
    const md = cat(b, stage);
    md.staticPose('stand');
    const g = buildGear(md, lookOf(b), { neck: { item: 'collar', color: 'red' } });
    let band = null;
    let medal = null;
    for (const h of g.userData.meshes) h.traverse((o) => {
      if (o.userData?.collarBand) band = o;
      if (o.userData?.collarMedal) medal = o;
    });
    md.root.updateMatrixWorld(true);
    const S0 = skinNow(md);
    const B0 = verts(band);
    const anc = B0.map((q) => near(S0, q));
    const d0 = B0.map((q, k) => q.distanceTo(S0[anc[k]]));
    const sc = md.root.matrixWorld.getMaxScaleOnAxis();
    const inv = new THREE.Matrix4();
    for (const p of ['lie', 'sit', 'groom', 'eat', 'highfive']) {
      pose(md, p);
      const S = skinNow(md);
      const dr = verts(band).map((q, k) => Math.abs(q.distanceTo(S[anc[k]]) - d0[k]) / sc).sort((x, y) => x - y);
      expect(dr[dr.length >> 1], `${b} ${stage} ${p} : dérive médiane (m)`).toBeLessThan(0.005);
      // (9 points sur 10 : le pire, ancré debout près de la tête ou du côté de la patte levée — la peau de la gorge suit
      // l'humérus, la bande pour moitié l'omoplate —, n'est pas pris)
      expect(dr[Math.floor(dr.length * 0.9)], `${b} ${stage} ${p} : dérive de 9 points sur 10 (m)`).toBeLessThan(0.02);
      inv.copy(md.root.matrixWorld).invert();
      const mc = verts(medal).reduce((a, v) => a.add(v.applyMatrix4(inv)), new THREE.Vector3()).multiplyScalar(1 / medal.geometry.attributes.position.count);
      expect(mc.y, `${b} ${stage} ${p} : médaille au-dessus du sol (m)`).toBeGreaterThan(0.005);
    }
    md.dispose();
  });
});

describe('foulard et nœud du salon', () => {
  // Foulard : un triangle rigide sur l'os du cou pendait en pyramide sous l'anneau et pointait en bec quand le chat
  // s'asseyait ; nœud large comme la tête du maine coon. Maintenant (comme le chien réaliste) une bavette posée sur la
  // peau du poitrail debout et liée au squelette, et un nœud à la taille de la tête.
  const near = (pts, q) => Math.sqrt(Math.min(...pts.map((p) => p.distanceToSquared(q))));
  it.each(['europeen', 'maine_coon', 'persan'])('%s : foulard posé sur le poitrail debout comme assis, nœud pas plus large que la tête', (b) => {
    const md = cat(b);
    md.staticPose('stand');
    const look = lookOf(b);
    const acc = buildAccessories(md, look, { neck: { id: 'bandana', color: 'blue' } });
    const bib = acc.find((o) => o.isSkinnedMesh && !o.userData.collarBand);
    expect(bib, 'bavette liée au squelette').toBeTruthy();
    const verts = (m) => {
      md.root.updateMatrixWorld(true);
      const out = [];
      for (let i = 0; i < m.geometry.attributes.position.count; i++) out.push(m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld));
      return out;
    };
    const skin = () => {
      const m = md.coatMesh;
      const out = [];
      for (let i = 0; i < m.geometry.attributes.position.count; i++) out.push(m.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(m.matrixWorld));
      return out;
    };
    const sc = md.root.matrixWorld.getMaxScaleOnAxis();
    for (const p of ['stand', 'sit']) {
      md.staticPose(p);
      const S = skin();
      const d = verts(bib).map((q) => near(S, q) / sc);
      // haut de la bavette (5 rangées sur 8, sur le cou et le poitrail) à moins de 2 cm de la peau pour 9 points sur 10 ;
      // le bas tombe entre les antérieurs, posé sur le devant des bras (au plus 5 cm de la peau)
      const top = d.slice(0, 45).sort((x, y) => x - y);
      expect(top[Math.floor(top.length * 0.9)], `${b} ${p} : haut de la bavette sur la peau (m)`).toBeLessThan(0.02);
      expect(Math.max(...d), `${b} ${p} : bas de la bavette (m)`).toBeLessThan(0.05);
    }
    for (const o of acc) {
      o.parent?.remove(o);
      o.userData.onRemove?.();
    }
    md.staticPose('stand');
    const acc2 = buildAccessories(md, look, { neck: { id: 'bow', color: 'pink' } });
    const bow = acc2.find((o) => o.isSkinnedMesh && !o.userData.collarBand);
    expect(bow, 'nœud lié au squelette').toBeTruthy();
    const bx = verts(bow).map((v) => v.x / sc);
    expect(Math.max(...bx) - Math.min(...bx), `${b} : largeur du nœud (m)`).toBeLessThan(2.4 * md.accessoryFit.headR);
    md.dispose();
  });
});

describe('réveil du chaton', () => {
  // Réveillé, le chaton roulé en boule sur le flanc se fondait dans la marche en 0,15 à 0,3 s, sans se relever (saut de
  // pose). Maintenant il roule sur le ventre (clip get_up tenu à son début, couché), se relève, puis marche ; l'entité
  // attend (e.holdMove, AnimalEntity).
  it.each([['europeen', 'baby'], ['maine_coon', 'baby'], ['europeen', 'adult']])('%s (%s) : de la boule, il se relève avant de marcher', (b, stage) => {
    const md = cat(b, stage);
    md.staticPose('curl');
    const a = md.anim;
    let walkAt = null;
    let rose = false;
    for (let i = 0; i < 60; i++) {
      // (il veut partir : l'entité, retenue, ne bouge pas tant qu'il se relève)
      const moving = !a.trans?.rise;
      a.update(1 / 30, { moving, v: moving ? 0.4 : 0, posture: 'stand', sleeping: false });
      if (a.trans?.rise) rose = true;
      if (walkAt === null && (a.w.walk ?? 0) > 0.5) walkAt = (i + 1) / 30;
    }
    expect(rose, `${b} ${stage} : il se relève`).toBe(true);
    // (roulade 0,6 s puis get_up 0,8 s : la marche ne l'emporte pas avant 1 s)
    expect(walkAt, `${b} ${stage} : marche à ${walkAt} s`).toBeGreaterThan(1.0);
    md.dispose();
  });
});

// Finitions (2e passe) des chats réalistes : chaton qui dort vraiment roulé en boule sur le flanc, pompon du bobtail
// en boule, ... Déterministe :
// graines fixes, pas de temps fixe, aucun Math.random (le mixeur est appelé avec des états donnés).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { buildRealCatModel } from '../src/game/models/catReal.js';
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

// Finitions des chiens réalistes vues au téléphone : manteau, collier, queues, assis et couchés (src/game/models/dogReal.js).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealDogModel, deformDog, realDogPose } from '../src/game/models/dogReal.js';
import { buildGear, removeGear } from '../src/game/gearModels.js';
import { buildAccessories, removeAccessories } from '../src/game/models/salon.js';
import { EAR_GRID } from '../src/game/models/dogParts.js';
import { dogModelOf } from '../src/sim/dogLook.js';
import { resolveLook } from '../src/sim/animal.js';
import { loadRealDogGltf } from './fixtures/realDogGltf.js';

let G;
beforeAll(async () => {
  G = { shiba: await loadRealDogGltf('shiba'), jack: await loadRealDogGltf('jack') };
}, 120000);

const dog = (breed) => {
  const look = { ...resolveLook('dog', breed, 0), seed: 4242 };
  return { look, md: buildRealDogModel(look, breed, G[dogModelOf(look)]), s: look.scale ?? 1 };
};
const st = (o = {}) => ({ v: 0, moving: false, posture: 'stand', action: null, sleeping: false, happy: 0.25, sad: false, pull: 0, size: 1, ...o });

/**
 * Peau du dessus du tronc qui passe hors du manteau : un rayon part de l'axe du tronc (centre de la coupe la plus
 * proche) vers chaque sommet de la peau (ni membres, ni tête, ni queue, ni oreilles) ; s'il dépasse la coque du manteau
 * de plus d'un millimètre, il en sort. Renvoie la part des sommets du dos (à moins de 30° du dessus) qui sortent et le
 * plus grand dépassement (cm, taille réelle).
 */
function coatLeak(md, coat, s) {
  md.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
  const fit = md.dogFit;
  const v = new THREE.Vector3();
  const cp = coat.geometry.attributes.position;
  const pts = [];
  for (let i = 0; i < cp.count; i++) pts.push(coat.getVertexPosition(i, v).applyMatrix4(coat.matrixWorld).applyMatrix4(inv).clone());
  const idx = coat.geometry.index;
  const tris = [];
  for (let t = 0; t < idx.count; t += 3) tris.push([pts[idx.getX(t)], pts[idx.getX(t + 1)], pts[idx.getX(t + 2)]]);
  const zs = pts.map((p) => p.z);
  const zMin = Math.min(...zs) + 0.01;
  const zMax = Math.max(...zs) - 0.01;
  const base = md.anim.base;
  const part = base.part;
  const m = md.coatMesh;
  const ray = new THREE.Ray();
  const hit = new THREE.Vector3();
  let back = 0;
  let out = 0;
  let worst = 0;
  for (let i = 0; i < base.prims.coat.count; i++) {
    if (part[i * 4] > 0.1 || part[i * 4 + 1] > 0.3 || part[i * 4 + 2] > 0.3 || part[i * 4 + 3] > 0.3) continue;
    m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).applyMatrix4(inv);
    if (v.z < zMin || v.z > zMax) continue;
    const rg = fit.rings.reduce((b, x) => (Math.abs(x[0] - v.z) < Math.abs(b[0] - v.z) ? x : b));
    const c = new THREE.Vector3(fit.midX, rg[2], v.z);
    const d = v.clone().sub(c);
    if (Math.abs(Math.atan2(d.x, d.y)) > 0.5) continue;
    ray.set(c, d.clone().normalize());
    let best = Infinity;
    for (const [a, b, e] of tris) if (ray.intersectTriangle(a, b, e, false, hit)) best = Math.min(best, hit.distanceTo(c));
    if (!Number.isFinite(best)) continue;
    back++;
    const dd = d.length() - best;
    if (dd > 0.001) {
      out++;
      worst = Math.max(worst, dd);
    }
  }
  return { back, pct: (100 * out) / Math.max(1, back), worstCm: worst * 100 * s };
}

describe('manteau du chien', () => {
  // (races du jack : ses grands triangles et ses poids qui débordent des membres laissaient la plupart des secteurs des
  // coupes vides — 80 à 96 % du dos hors du manteau, dents de scie ; races du shiba : 9 à 36 %)
  it.each(['jack_russell', 'teckel', 'corgi', 'carlin', 'cocker', 'chihuahua', 'yorkshire', 'spitz_nain', 'labrador', 'golden', 'samoyede', 'terre_neuve'])(
    '%s : le dos ne passe pas à travers le manteau (debout et au pas)', (breed) => {
      const { look, md, s } = dog(breed);
      const g = buildGear(md, look, { blanket: { item: 'dogCoat', color: 'navy' } });
      const coat = g.userData.meshes.find((x) => x.isSkinnedMesh && x.material.side === THREE.DoubleSide);
      expect(coat).toBeTruthy();
      for (let i = 0; i < 60; i++) md.anim.update(1 / 60, st({ size: s }));
      const a = coatLeak(md, coat, s);
      for (let i = 0; i < 37; i++) md.anim.update(1 / 60, st({ size: s, moving: true, v: 1.1 / Math.sqrt(s) }));
      const b = coatLeak(md, coat, s);
      expect(a.back).toBeGreaterThan(100);
      expect(a.pct).toBeLessThan(3);
      expect(b.pct).toBeLessThan(3);
      expect(Math.max(a.worstCm, b.worstCm)).toBeLessThan(0.8);
      // (coupes du tronc sous le manteau : un centre propre à chacune, aucun rayon de repli de 1,6 cm sur le dos et les
      // flancs)
      const f = md.dogFit;
      for (const [z, r, yc] of f.rings) {
        if (z <= f.hipZ - 0.01 || z >= f.shZ + 0.035) continue;
        expect(Number.isFinite(yc)).toBe(true);
        const top = [...r.slice(0, 7), ...r.slice(r.length - 6)];
        expect(Math.min(...top)).toBeGreaterThan(0.03);
      }
      removeGear(g);
      md.dispose();
    }, 60000);
});

describe('collier', () => {
  it('races à poil du shiba : collier serré dans le poil (sillon), pas un cerceau autour de la collerette', () => {
    const lab = dog('labrador');
    const rLab = lab.md.dogFit.collar;
    for (const breed of ['golden', 'samoyede', 'terre_neuve', 'bouvier_bernois', 'saint_bernard', 'berger_islandais', 'akita', 'lagotto']) {
      const { look, md } = dog(breed);
      const c = md.dogFit.collar;
      // (avant : golden 11 × 15 cm de demi-axes contre 5 × 8 au labrador ; samoyède 15 × 20)
      expect(c.rx - rLab.rx).toBeLessThan(0.075);
      expect(c.ry).toBeLessThan(1.45 * c.rx);
      // sillon du poil sous la bande : posé avec le collier, retiré avec lui
      const u = md.uniforms.cCollarR.value;
      expect(u.w).toBe(0);
      const g = buildGear(md, look, { neck: { item: 'collar', color: 'red' } });
      expect(u.w).toBe(1);
      expect(u.x).toBeGreaterThan(c.rx);
      expect(u.x).toBeLessThan(c.rx + 0.012);
      removeGear(g);
      expect(u.w).toBe(0);
      md.dispose();
    }
    lab.md.dispose();
  });

  it('petits chiens : l\'anneau penche comme le cou (plus à plat dans la gorge), le nœud du salon serre aussi le poil', () => {
    for (const breed of ['jack_russell', 'spitz_nain', 'carlin', 'chihuahua', 'yorkshire']) {
      const { look, md } = dog(breed);
      // (axe du plan du collier à 40° au plus au-dessus de l'horizontale : les os du cou du jack montent à la verticale)
      const ax = md.anim.S.measure.axis;
      expect(Math.asin(ax.y)).toBeLessThan(0.71);
      const acc = buildAccessories(md, look, { neck: { id: 'bow', color: 'pink' } });
      expect(md.uniforms.cCollarR.value.w).toBe(1);
      const g = buildGear(md, look, { neck: { item: 'collar', color: 'red' } });
      removeAccessories(acc);
      // (le collier reste porté : son sillon aussi)
      expect(md.uniforms.cCollarR.value.w).toBe(1);
      removeGear(g);
      expect(md.uniforms.cCollarR.value.w).toBe(0);
      md.dispose();
    }
  });
});

/** Pose mesurée dans le repère du chien (cm, taille réelle) : pente du dos, pieds, triangles de l'arrière-train étirés. */
function poseOf(md, s) {
  md.root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
  const loc = (n) => md.bone(n).getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  const hip = loc('femurL').add(loc('femurR')).multiplyScalar(0.5);
  const sh = loc('humerusL').add(loc('humerusR')).multiplyScalar(0.5);
  const feet = md.legs.map((leg, l) => {
    let lo = Infinity;
    for (const p of md.anim.solePts[l]) lo = Math.min(lo, p.clone().applyMatrix4(leg.paw.matrixWorld).applyMatrix4(inv).y);
    return lo * s * 100;
  });
  const m = md.coatMesh;
  const pos = m.geometry.attributes.position;
  const base = md.anim.base;
  const ci = base.prims.coat.index;
  const D = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < base.prims.coat.count; i++) D.push(m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).applyMatrix4(inv).clone());
  let stretch = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let t = 0; t + 2 < ci.length; t += 3) {
    const [i0, i1, i2] = [ci[t], ci[t + 1], ci[t + 2]];
    if (!(D[i0].z < hip.z + 0.06) || base.part[i0 * 4 + 1] > 0.5) continue;
    a.fromBufferAttribute(pos, i0);
    b.fromBufferAttribute(pos, i1);
    c.fromBufferAttribute(pos, i2);
    const ar = b.clone().sub(a).cross(c.clone().sub(a)).length();
    if (ar < 1e-10) continue;
    const ad = D[i1].clone().sub(D[i0]).cross(D[i2].clone().sub(D[i0])).length();
    if (ad / ar > 3) stretch++;
  }
  // plus bas de la peau du tronc (ni membres, ni tête, ni queue) : la croupe, assis
  let trunk = Infinity;
  const W = base.W;
  for (let i = 0; i < base.prims.coat.count; i++) {
    if (W.leg[i * 4] + W.leg[i * 4 + 1] + W.leg[i * 4 + 2] + W.leg[i * 4 + 3] > 0.3 || W.head[i] > 0.3 || W.tail[i] > 0.3) continue;
    trunk = Math.min(trunk, D[i].y);
  }
  return { back: (Math.atan2(sh.y - hip.y, sh.z - hip.z) * 180) / Math.PI, hipY: hip.y * s * 100, feet, stretch, trunk: trunk * s * 100 };
}

describe('assis et couché des petits chiens', () => {
  it('teckel et corgi assis et « donne la patte » : dos relevé (≥ 30°), arrière-train sans triangles étirés, croupe au sol, pieds posés', () => {
    // (avant : dos 13,6° et 17,4°, 121 et 110 triangles de l'arrière-train étirés plus de trois fois — jack : 43°, 0 ;
    // finitions 1 : dos 18° et 23°, 54 et 62 triangles ; finitions 2 — assis du gabarit court aux reins fléchis, peau du
    // grasset laissée au tibia : dos 33° et 47°, 6 et 2 triangles)
    for (const breed of ['teckel', 'corgi']) {
      for (const paw of [false, true]) {
        const { md, s } = dog(breed);
        for (let i = 0; i < 240; i++) {
          if (paw) realDogPose(md, 'paw', Math.min(1, i / 60));
          md.anim.update(1 / 60, st({ size: s, posture: 'sit' }));
        }
        const p = poseOf(md, s);
        expect(p.back).toBeGreaterThan(30);
        expect(p.stretch).toBeLessThan(15);
        expect(p.trunk).toBeLessThan(1.5);
        expect(p.trunk).toBeGreaterThan(-0.8);
        for (const f of paw ? p.feet.slice(1) : p.feet) expect(Math.abs(f)).toBeLessThan(0.6);
        md.dispose();
      }
    }
  });

  it('teckel et corgi assis : tête au-dessus des épaules, à niveau ; patte donnée devant le poitrail', () => {
    // (finitions 2 : assis aux reins fléchis, poitrail baissé — tête du teckel à 7,3 cm au-dessus des épaules contre
    // 10,5 pour le jack russell, museau vers l'avant et le bas, dos bossu ; corgi tête renversée, 10 à 14° au-dessus de
    // son port ; patte donnée repliée sous le menton)
    for (const breed of ['teckel', 'corgi']) {
      for (const paw of [false, true]) {
        const { md, s } = dog(breed);
        for (let i = 0; i < 240; i++) {
          if (paw) realDogPose(md, 'paw', Math.min(1, i / 60));
          md.anim.update(1 / 60, st({ size: s, posture: 'sit' }));
        }
        md.root.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
        const loc = (n) => md.bone(n).getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
        const sh = loc('humerusL').add(loc('humerusR')).multiplyScalar(0.5);
        const fwd = md.anim.headFwd.clone().applyQuaternion(md.head.getWorldQuaternion(new THREE.Quaternion()))
          .applyQuaternion(md.root.getWorldQuaternion(new THREE.Quaternion()).invert());
        const pitch = (Math.asin(fwd.y) * 180) / Math.PI;
        expect((loc('head').y - sh.y) * s * 100, breed).toBeGreaterThan(9.5);
        expect(pitch, breed).toBeGreaterThan(-4);
        expect(pitch, breed).toBeLessThan(9);
        if (paw) {
          const p = md.legs[0].paw.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
          expect((p.z - sh.z) * s * 100, breed).toBeGreaterThan(3.2);
          expect(p.y * s * 100, breed).toBeGreaterThan(8);
        }
        md.dispose();
      }
    }
  });

  it('chiots trapus aux pattes courtes (carlin, bouledogue) et chiot corgi assis et « donne la patte » : jamais à la renverse', () => {
    // (gabarit court : l'assis aux reins fléchis, fait pour les dos longs du teckel et du corgi, faisait basculer les
    // chiots carlin et bouledogue sur le dos — dos à 130° et 121°, 76 et 93 triangles étirés ; chiot corgi presque
    // vertical, 59°, peau 1,1 cm sous le sol. L'assis du gabarit est fondu avec celui de sa variante « nain », sans
    // reins fléchis, selon la longueur du dos : chiots carlin et bouledogue 42° et 40°, comme avant les finitions 2)
    for (const breed of ['carlin', 'bouledogue', 'corgi']) {
      for (const paw of [false, true]) {
        const look = { ...resolveLook('dog', breed, 0), seed: 4242, puppy: true };
        const md = buildRealDogModel(look, breed, G[dogModelOf(look)]);
        const s = (look.scale ?? 1) * 0.55;
        expect(md.anim.gabarit, breed).toBe('court');
        for (let i = 0; i < 240; i++) {
          if (paw) realDogPose(md, 'paw', Math.min(1, i / 60));
          md.anim.update(1 / 60, st({ size: s, posture: 'sit' }));
        }
        const p = poseOf(md, s);
        expect(p.back, breed).toBeGreaterThan(30);
        expect(p.back, breed).toBeLessThan(50);
        expect(p.stretch, breed).toBeLessThan(35);
        expect(p.trunk, breed).toBeGreaterThan(-0.8);
        md.dispose();
      }
    }
  });

  it('couchés et endormis des races du jack aux membres changés : postérieurs repliés au sol, antérieurs posés, poitrail jamais sous le sol', () => {
    // (avant : pieds arrière à 4 à 6 cm ; finitions 2 — antérieurs allongés devant à 3,4 cm (teckel), 3,7 (corgi), 4,6
    // (carlin), 6,1 (bouledogue), 5,5 (yorkshire), 4,7 (spitz nain) du sol)
    for (const breed of ['teckel', 'corgi', 'carlin', 'bouledogue', 'yorkshire', 'spitz_nain']) {
      for (const sleeping of [false, true]) {
        const { md, s } = dog(breed);
        for (let i = 0; i < 300; i++) md.anim.update(1 / 60, st({ size: s, posture: sleeping ? 'sleep' : 'lie', sleeping }));
        const p = poseOf(md, s);
        expect(Math.max(p.feet[2], p.feet[3]), breed).toBeLessThan(1.2);
        expect(Math.max(p.feet[0], p.feet[1]), breed).toBeLessThan(1);
        expect(Math.min(...p.feet), breed).toBeGreaterThan(-0.8);
        expect(p.trunk, breed).toBeGreaterThan(-0.3);
        md.dispose();
      }
    }
  });

  it('galgo et whippet couchés et endormis : posés comme le labrador, antérieurs en sphinx, hanches plus basses que les siennes', () => {
    // (avant : couché du gabarit long à genoux sur ses coudes, tronc à 4,2 cm du sol, hanches du galgo à 16,9 cm,
    // du whippet à 12,9, du labrador à 14,6 cm)
    const hipOf = (breed, sleeping) => {
      const { md, s } = dog(breed);
      for (let i = 0; i < 300; i++) md.anim.update(1 / 60, st({ size: s, posture: sleeping ? 'sleep' : 'lie', sleeping }));
      const p = poseOf(md, s);
      md.dispose();
      return p;
    };
    for (const sleeping of [false, true]) {
      const lab = hipOf('labrador', sleeping);
      for (const breed of ['galgo', 'whippet']) {
        const p = hipOf(breed, sleeping);
        expect(p.hipY, breed).toBeLessThan(lab.hipY);
        expect(p.trunk, breed).toBeLessThan(1.5);
        expect(p.trunk, breed).toBeGreaterThan(-0.8);
        for (const f of p.feet) expect(Math.abs(f), breed).toBeLessThan(1);
      }
    }
  });

  it('yorkshire couché : posé sur le ventre (la jupe de peau et les mèches s\'étalent au sol), croupe basse, pieds arrière posés', () => {
    // (avant : hanches à 7,9 cm, pieds arrière à 2,6 cm — le corps reposait sur la jupe de peau sous le ventre et sur
    // la peau de l'aine tirée par les cuisses repliées ; carlin, du même gabarit : 4,0 cm)
    const { md, s } = dog('yorkshire');
    for (let i = 0; i < 300; i++) md.anim.update(1 / 60, st({ size: s, posture: 'lie' }));
    const p = poseOf(md, s);
    expect(p.hipY).toBeLessThan(4);
    expect(Math.max(p.feet[2], p.feet[3])).toBeLessThan(1);
    md.dispose();
  });
});

/**
 * Mèches du yorkshire posées comme le fait le shader (dogCoat.js, SILK) : réplique sur le processeur. Renvoie le
 * dépassement des mèches hors du corps vu d'en haut (cm, taille réelle) et la part des segments de mèche à moins de 15°
 * de la verticale.
 */
function silkLayout(md, s, SILK) {
  md.root.updateMatrixWorld(true);
  const m = md.coatMesh;
  const g = m.geometry;
  const sk = m.skeleton;
  const pom = g.attributes.cmpPom;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const pos = g.attributes.position;
  const midX = md.anim.base.land.midX;
  const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
  const T = new THREE.Matrix4();
  const skinM = (i) => {
    const M = new THREE.Matrix4().set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = sw.getComponent(i, k);
      if (!w) continue;
      T.multiplyMatrices(sk.bones[si.getComponent(i, k)].matrixWorld, sk.boneInverses[si.getComponent(i, k)]).premultiply(inv);
      for (let e = 0; e < 16; e++) M.elements[e] += T.elements[e] * w;
    }
    return M;
  };
  const sm = (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  let bodyX = 0;
  const v = new THREE.Vector3();
  for (let i = 0; i < pom.count; i += 3) if (!(pom.getX(i) < 0)) bodyX = Math.max(bodyX, Math.abs(v.fromBufferAttribute(pos, i).applyMatrix4(skinM(i)).x - midX));
  const P = [];
  let reach = 0;
  const down = new THREE.Vector3(0, -1, 0);
  for (let i = 0; i < pom.count; i++) {
    const h = pom.getX(i);
    if (!(h < 0)) {
      P.push(null);
      continue;
    }
    const M = skinM(i);
    const p0 = new THREE.Vector3().fromBufferAttribute(pos, i);
    const piv = p0.clone().add(new THREE.Vector3(0, -h, 0)).applyMatrix4(M);
    let off = p0.clone().applyMatrix4(M).sub(piv);
    const dS = down.clone().transformDirection(M);
    const ka = new THREE.Vector3().crossVectors(dS, down);
    const sn = ka.length();
    if (sn > 1e-4) {
      ka.divideScalar(sn);
      const tilt = Math.atan2(sn, -dS.y);
      off.applyAxisAngle(ka, tilt * (1 - SILK.keep * sm(SILK.follow0, SILK.follow1, tilt)));
    }
    const t = piv.add(off);
    const under = 0.004 - t.y;
    if (under > 0) {
      const o2 = new THREE.Vector2(p0.x >= midX ? 1 : -1, 0).add(new THREE.Vector2(off.x, off.z).multiplyScalar(6)).normalize();
      t.x += o2.x * under * SILK.spread;
      t.z += o2.y * under * SILK.spread;
      t.y = 0.004 + Math.min(under, 0.03) * SILK.lift;
    }
    P.push(t);
    reach = Math.max(reach, Math.abs(t.x - midX) - bodyX);
  }
  let vert = 0;
  let segs = 0;
  for (let i = 0; i + 3 < P.length; i++) {
    if (!P[i] || !P[i + 3] || Math.abs(pom.getX(i + 3)) <= Math.abs(pom.getX(i))) continue;
    const d = P[i + 3].clone().sub(P[i]);
    if (d.length() < 0.005) continue;
    segs++;
    if (Math.acos(Math.min(1, -d.y / d.length())) < (15 * Math.PI) / 180) vert++;
  }
  return { reach: reach * s * 100, vertical: vert / Math.max(1, segs) };
}

describe('yorkshire', () => {
  it('mèches : pendues debout, couchées autour du corps couché (ni palissade ni oursin), le long du corps assis (pas de rideau)', async () => {
    // (main : couché, aplaties sur place sous le corps, une palissade ; finitions 2 : couchées vers l'extérieur de toute
    // la longueur qui passait sous le sol — des lames droites jusqu'à 19 cm hors du corps couché, 25 cm assis, un oursin vu
    // d'en haut ; assis, 73 % des segments de mèche à la verticale, un rideau devant le poitrail)
    const { SILK } = await import('../src/game/models/dogCoat.js');
    const at = (post) => {
      const { md, s } = dog('yorkshire');
      for (let i = 0; i < 300; i++) md.anim.update(1 / 60, st({ size: s, posture: post, sleeping: post === 'sleep' }));
      const r = silkLayout(md, s, SILK);
      md.dispose();
      return r;
    };
    const stand = at('stand');
    expect(stand.vertical).toBeGreaterThan(0.7);
    for (const post of ['lie', 'sleep']) {
      const r = at(post);
      expect(r.reach, post).toBeGreaterThan(1);
      expect(r.reach, post).toBeLessThan(6);
    }
    const sit = at('sit');
    expect(sit.reach).toBeLessThan(3);
    expect(sit.vertical).toBeLessThan(0.3);
  });

  it('robe soyeuse : une jupe de mèches des flancs presque jusqu\'au sol et une barbe, qui pendent (pas chez les autres races du jack)', async () => {
    const { SILK_SIDE, SILK_BEARD } = await import('../src/game/models/dogParts.js');
    const { md, s } = dog('yorkshire');
    const g = md.coatMesh.geometry;
    const hang = g.attributes.cmpPom;
    expect(hang).toBeTruthy();
    let n = 0;
    for (let i = 0; i < hang.count; i++) if (hang.getX(i) < 0) n++;
    // (six rangs de trois sommets par mèche)
    expect(n).toBe((2 * SILK_SIDE + SILK_BEARD) * 18);
    // debout : le bout des mèches de la jupe à moins de 4 cm du sol (taille réelle), au-dessous du coude
    for (let i = 0; i < 60; i++) md.anim.update(1 / 60, st({ size: s }));
    md.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
    const v = new THREE.Vector3();
    let low = Infinity;
    for (let i = 0; i < hang.count; i++) if (hang.getX(i) < 0) low = Math.min(low, md.coatMesh.getVertexPosition(i, v).applyMatrix4(inv).y);
    expect(low * s * 100).toBeLessThan(4);
    expect(low).toBeGreaterThan(0);
    md.dispose();
    // (les autres races du jack : pas de mèches qui pendent)
    const jack = dog('jack_russell');
    expect(jack.md.coatMesh.geometry.attributes.cmpPom).toBeFalsy();
    jack.md.dispose();
  });
});

describe('queues qui frétillent', () => {
  // Bout de la queue dans le repère du bassin, chien content qui frétille : plus grand écart au point moyen rapporté à la
  // longueur de la queue (entre la base et le dernier os).
  const wagRatio = (breed) => {
    const { md, s } = dog(breed);
    const pel = md.bone('pelvis');
    const pts = [];
    let len = 0;
    for (let i = 0; i < 240; i++) {
      md.anim.update(1 / 60, st({ size: s, happy: 1, action: 'wag' }));
      md.root.updateMatrixWorld(true);
      if (i > 60) pts.push(pel.worldToLocal(md.tailTip.getWorldPosition(new THREE.Vector3())));
      if (i === 61) {
        const tb = md.tailBones;
        for (let k = 0; k + 1 < tb.length; k++) len += tb[k].getWorldPosition(new THREE.Vector3()).distanceTo(tb[k + 1].getWorldPosition(new THREE.Vector3()));
      }
    }
    const c = pts.reduce((a, p) => a.add(p), new THREE.Vector3()).multiplyScalar(1 / pts.length);
    const amp = Math.max(...pts.map((p) => p.distanceTo(c)));
    md.dispose();
    return (2 * amp) / len;
  };
  it('queues dressées des petits chiens : elles battent de côté (avant : elles tournaient sur elles-mêmes, pointe à 1-2 cm)', () => {
    // (avant : jack 0,36, chihuahua 0,54, yorkshire 0,36 — labrador 1,4)
    for (const breed of ['jack_russell', 'chihuahua', 'yorkshire', 'spitz_nain']) expect(wagRatio(breed)).toBeGreaterThan(1.0);
    for (const breed of ['labrador', 'beagle', 'golden']) {
      const r = wagRatio(breed);
      expect(r).toBeGreaterThan(1.1);
      expect(r).toBeLessThan(1.9);
    }
  });
});

describe('gueule ouverte', () => {
  // Pointe de la langue au-delà du devant de la mâchoire du bas, sur l'axe tête → truffe, après 6 s : cm à la taille du
  // modèle (chien de taille 1 ; la taille réelle pour le labrador, le golden et le husky), rapportés à la taille de la
  // tête de la race (head : 1,45 pour le chihuahua). (Avant : divisés par la taille de la race, ce qui grossissait la
  // langue des petits chiens au lieu de la ramener à leur taille.)
  const tongueOut = (breed, o) => {
    const { md, s } = dog(breed);
    const base = md.anim.base;
    const c = base.prims.coat;
    const tI = new Set([1, 2, 3, 4, 5, 6].map((k) => base.index.get('tongue' + k)));
    const jI = base.index.get('jaw');
    for (let i = 0; i < 360; i++) md.anim.update(1 / 60, st({ size: s, ...o }));
    md.root.updateMatrixWorld(true);
    const m = md.coatMesh;
    const v = new THREE.Vector3();
    const head = md.bone('head').getWorldPosition(new THREE.Vector3());
    let nose = 0;
    const tongue = [];
    const lip = [];
    for (let i = 0; i < c.count; i++) {
      let wt = 0;
      let wj = 0;
      for (let k = 0; k < 4; k++) {
        if (tI.has(c.si[i * 4 + k])) wt += c.sw[i * 4 + k];
        if (c.si[i * 4 + k] === jI) wj += c.sw[i * 4 + k];
      }
      if (wt > 0.5) tongue.push(i);
      else if (wj > 0.5 && wt < 0.05) lip.push(i);
      if (base.part[i * 4 + 2] > 0.9 && c.pos[i * 3 + 2] > c.pos[nose * 3 + 2]) nose = i;
    }
    const fwd = m.getVertexPosition(nose, v).applyMatrix4(m.matrixWorld).sub(head).normalize().clone();
    const proj = (i) => m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).sub(head).dot(fwd);
    const out = ((Math.max(...tongue.map(proj)) - Math.max(...lip.map(proj))) * 100) / (md.build.head ?? 1);
    md.dispose();
    return out;
  };
  it('en haletant, la langue pend hors de la gueule (avant : rentrée derrière les dents, un rictus) ; au calme, elle est dedans', () => {
    // (boxer, museau court : avant, la langue s'arrêtait à la lèvre, +0,1 cm, cachée derrière les babines)
    for (const breed of ['labrador', 'golden', 'husky', 'boxer']) {
      // (mesuré, rapporté à la tête : 2,9 à 3,3 à l'arrêt, 2,6 à 3,1 en marchant ; au calme -2 à -3,2)
      expect(tongueOut(breed, { happy: 1, hot: true })).toBeGreaterThan(2);
      expect(tongueOut(breed, { hot: true, v: 1.2, moving: true })).toBeGreaterThan(2);
      expect(tongueOut(breed, { happy: 0.25 })).toBeLessThan(0);
    }
  });

  it('races du jack : la gueule s\'ouvre et la langue modelée pend en haletant (avant : ni os de mâchoire ni langue, gueule toujours fermée) ; au calme, gueule fermée', () => {
    // (le GLB du jack porte la mâchoire et quatre os de langue, contigus : la langue est peinte en rose par le shader)
    const idx = G.jack.scene.getObjectByProperty('isSkinnedMesh', true).skeleton.bones.map((b) => b.name);
    expect(idx).toContain('jaw');
    const t = [1, 2, 3, 4].map((k) => idx.indexOf('tongue' + k));
    expect(Math.min(...t)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...t) - Math.min(...t)).toBe(3);
    for (const breed of ['jack_russell', 'cavalier', 'chihuahua']) {
      // (mesuré : 2,8 / 2,7 / 2,6 à l'arrêt, 2,9 / 2,7 / 2,5 en marchant ; au calme -1,1 à -1,6 ; avant : pas de langue)
      const a = tongueOut(breed, { happy: 1, hot: true });
      expect(a, breed).toBeGreaterThan(2);
      expect(a, breed).toBeLessThan(3.8);
      expect(tongueOut(breed, { hot: true, v: 1.2, moving: true }), breed).toBeGreaterThan(2);
      expect(tongueOut(breed, { happy: 0.25 }), breed).toBeLessThan(0);
      // au calme, la mâchoire reste à son repos (la gueule fermée du GLB)
      const { md, s } = dog(breed);
      for (let i = 0; i < 120; i++) md.anim.update(1 / 60, st({ size: s }));
      const jaw = md.bone('jaw');
      expect(jaw.quaternion.angleTo(jaw.userData.restQ)).toBeLessThan(0.01);
      md.dispose();
    }
  });
});

describe('accessoires du salon', () => {
  // Pièce liée au squelette (nœud ou foulard) : distance de son centre et de son sommet le plus éloigné à la peau, et
  // hauteur de son centre sous le menton (cm, dans le repère du modèle, à la taille du shiba), après une seconde debout.
  const place = (breed, id) => {
    const { look, md, s } = dog(breed);
    for (let i = 0; i < 30; i++) md.anim.update(1 / 60, st({ size: s }));
    const acc = buildAccessories(md, look, { neck: { id, color: 'pink' } });
    for (let i = 0; i < 30; i++) md.anim.update(1 / 60, st({ size: s }));
    md.root.updateMatrixWorld(true);
    const sk = acc.find((o) => o.isSkinnedMesh);
    const v = new THREE.Vector3();
    const m = md.coatMesh;
    const base = md.anim.base;
    const skin = [];
    let chin = Infinity;
    const ringZ = md.dogFit.collar.rest.center.z;
    for (let i = 0; i < base.prims.coat.count; i++) {
      const p = m.getVertexPosition(i, v).applyMatrix4(m.matrixWorld).clone();
      skin.push(p);
      if (base.W.head[i] > 0.5 && md.anim.S.D.pos[i * 3 + 2] > ringZ) chin = Math.min(chin, p.y);
    }
    const near = (p) => Math.min(...skin.map((q) => q.distanceTo(p)));
    const c = new THREE.Vector3();
    let worst = 0;
    const n = sk.geometry.attributes.position.count;
    for (let i = 0; i < n; i++) {
      const p = sk.getVertexPosition(i, v).applyMatrix4(sk.matrixWorld).clone();
      c.add(p);
      worst = Math.max(worst, near(p));
    }
    c.multiplyScalar(1 / n);
    const out = { center: near(c) * 100, worst: worst * 100, belowChin: (chin - c.y) * 100 };
    removeAccessories(acc);
    expect(sk.parent).toBe(null);
    md.dispose();
    return out;
  };
  it('foulard plaqué sur le poitrail et nœud sous l\'anneau, sous le menton (avant : nœud devant la bouche du yorkshire, foulard qui flotte)', () => {
    for (const breed of ['labrador', 'yorkshire', 'samoyede', 'caniche']) {
      const b = place(breed, 'bandana');
      // (mesuré : centre à 0,4-2 cm de la peau, sommet le plus loin à 1,5-4,3 cm — collerette du samoyède)
      expect(b.center, breed).toBeLessThan(2.5);
      expect(b.worst, breed).toBeLessThan(5);
      const w = place(breed, 'bow');
      expect(w.center, breed).toBeLessThan(2.5);
      expect(w.belowChin, breed).toBeGreaterThan(1);
    }
  });
});

describe('foulard du caniche', () => {
  it('posé sur la crinière gonflée par la coupe, pas dedans : plus froissé de face (sans la collerette de la coupe : 4,1 mm dans les boucles ; avec : 3,7 mm devant)', () => {
    const { look, md } = dog('caniche');
    const acc = buildAccessories(md, look, { neck: { id: 'bandana', color: 'red' } });
    const bib = acc.find((o) => o.isMesh && o.geometry.index && o.geometry.attributes.position.count === 9 * 8);
    const P = bib.geometry.attributes.position;
    // surface du poil poussée par le shader (comme PUSH_V de dogCoat.js) : peau + collerette de la coupe (cCut.y)
    const base = md.anim.base;
    const S = md.anim.S;
    const cp = S.D.pos;
    const L = base.land;
    const part = base.part;
    const R0 = base.prims.coat.pos;
    const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const cutY = md.uniforms.cCut.value.y;
    expect(cutY).toBeGreaterThan(0);
    let worst = -Infinity;
    // (rangées 2 à 6 : la rangée du haut reste sur l'anneau du collier, la dernière est la pointe)
    for (let k = 2 * 9; k < 7 * 9; k++) {
      const x = P.getX(k), y = P.getY(k), z = P.getZ(k);
      let top = -Infinity;
      for (let j = 0; j < base.prims.coat.count; j++) {
        if (base.W.head[j] > 0.1 || base.W.tail[j] > 0.1) continue;
        if (Math.abs(cp[j * 3] - x) > 0.015 || Math.abs(cp[j * 3 + 1] - y) > 0.015) continue;
        const zj = cp[j * 3 + 2];
        if (zj > z + 0.06 || zj < z - 0.12) continue;
        const u = (R0[j * 3 + 2] - L.hipZ) / Math.max(0.05, L.shZ - L.hipZ);
        const ruff = (1 - part[j * 4 + 3]) * (1 - part[j * 4 + 1]) * (1 - part[j * 4]) * sm(0.85, 1.05, u) * (1 - sm(L.head.z - 0.02, L.head.z + 0.05, R0[j * 3 + 2])) * (1 - part[j * 4 + 2] * 0.6);
        top = Math.max(top, zj + cutY * ruff);
      }
      if (Number.isFinite(top)) worst = Math.max(worst, top - z);
    }
    // (enfoncé de 1 mm au plus dans le poil)
    expect(worst * 1000).toBeLessThan(1);
    md.dispose();
  });
});

describe('oreilles modelées', () => {
  it('face intérieure éclairée comme la face externe : pas tournée vers le sol près de l\'attache (avant : liseré sombre et verdâtre du dogue)', () => {
    const { NU, NV } = EAR_GRID;
    for (const breed of ['dogo', 'labrador', 'beagle']) {
      const { md } = dog(breed);
      const L = md.anim.base.parts;
      const N = md.coatMesh.geometry.attributes.normal.array;
      let low = 1;
      for (let s = 0; s < 2; s++) {
        const st = L.earStart + s * ((NV + 1) * NU + 1);
        // (moitié haute de l'oreille, face intérieure : points k de NU/2 + 1 à NU - 1)
        for (let r = 0; r <= NV / 2; r++) for (let k = NU / 2 + 1; k < NU; k++) low = Math.min(low, N[(st + r * NU + k) * 3 + 1]);
      }
      // (avant : jusqu'à -0,8 sur les premières rangées du dogue)
      expect(low, breed).toBeGreaterThan(-0.45);
      md.dispose();
    }
  });
});

describe('oreilles d\'origine cachées', () => {
  // Sommets de l'oreille d'origine cachée (lambeau du jack) qui ressortent de la peau voisine : au-dessus du plan des 6
  // sommets visibles de la tête les plus proches (moyenne et normale), après la déformation de la race.
  const poke = (breed, puppy) => {
    const look = { ...resolveLook('dog', breed, 0), seed: 4242, ...(puppy ? { puppy: true } : {}) };
    const md = buildRealDogModel(look, breed, G[dogModelOf(look)]);
    const base = md.anim.base;
    const D = deformDog(base, md.build);
    const n = base.prims.coat.count;
    const P = D.pos;
    const N = D.nrm;
    const vis = [];
    for (let i = 0; i < n; i++) if (base.W.head[i] > 0.5 && !(D.hidden[i] > 0.02)) vis.push(i);
    let out = 0;
    let worst = 0;
    for (let i = 0; i < n; i++) {
      if (!(D.hidden[i] > 0.3)) continue;
      const near = vis.map((j) => [(P[j * 3] - P[i * 3]) ** 2 + (P[j * 3 + 1] - P[i * 3 + 1]) ** 2 + (P[j * 3 + 2] - P[i * 3 + 2]) ** 2, j]).sort((a, b) => a[0] - b[0]).slice(0, 6);
      const c = new THREE.Vector3();
      const nn = new THREE.Vector3();
      for (const [, j] of near) {
        c.add(new THREE.Vector3().fromArray(P, j * 3).multiplyScalar(1 / 6));
        nn.add(new THREE.Vector3().fromArray(N, j * 3));
      }
      const d = new THREE.Vector3().fromArray(P, i * 3).sub(c).dot(nn.normalize());
      if (d > 0.001) out++;
      worst = Math.max(worst, d);
    }
    md.dispose();
    return { out, worst: worst * 1000 };
  };
  it('chihuahua (et son chiot) : le lambeau caché ne ressort plus en échardes à la base de l\'oreille ni en lame à la tempe', () => {
    // (avant : 544 et 552 sommets dehors, jusqu'à 15 et 11 mm ; finitions 1 : 2, 1,4 mm au plus — une petite lame claire
    // à la tempe du chiot ; finitions 2, lambeau rentré à 6,5 mm sous le crâne au lieu de 3 : aucun, 0,6 mm au plus)
    for (const puppy of [true, false]) {
      const r = poke('chihuahua', puppy);
      expect(r.out, 'chiot ' + puppy).toBe(0);
      expect(r.worst, 'chiot ' + puppy).toBeLessThan(1);
    }
  });
});

describe('pieds posés en virage', () => {
  // Chemin du bout des doigts d'un pied tenu au sol (appui du footLock), moyenne par appui (cm, taille réelle), au pas
  // en virage à gauche à 1,2 rad/s — comme le jeu : groupe parent à l'échelle de la race, v en unités du modèle.
  const slip = (breed) => {
    const { md, s } = dog(breed);
    const g = new THREE.Group();
    g.add(md.root);
    g.scale.setScalar(s);
    const anim = md.anim;
    const toe = new THREE.Vector3();
    const prev = md.legs.map(() => null);
    const path = md.legs.map(() => 0);
    const stances = md.legs.map(() => []);
    for (let f = 0; f < 60 * 7; f++) {
      g.rotation.y += 1.2 / 60;
      g.position.x += (Math.sin(g.rotation.y) * s) / 60;
      g.position.z += (Math.cos(g.rotation.y) * s) / 60;
      g.updateMatrixWorld(true);
      anim.update(1 / 60, st({ v: 1, moving: true, size: s }));
      g.updateMatrixWorld(true);
      if (f < 120) continue;
      for (let l = 0; l < md.legs.length; l++) {
        toe.copy(anim.toePts[l]).applyMatrix4(md.legs[l].paw.matrixWorld);
        if (anim.plant[l]) {
          if (prev[l]) path[l] += Math.hypot(toe.x - prev[l].x, toe.z - prev[l].z);
          prev[l] = toe.clone();
        } else if (prev[l]) {
          stances[l].push(path[l]);
          path[l] = 0;
          prev[l] = null;
        }
      }
    }
    g.remove(md.root);
    md.dispose();
    return stances.map((a) => {
      const v = a.slice(1);
      return v.length ? (v.reduce((x, y) => x + y, 0) / v.length) * 100 / s : 0;
    });
  };
  it('pattes courtes : aucun pied posé ne glisse de plus de 2 cm par appui (correction latérale jusqu\'à 0,6 rad)', () => {
    for (const breed of ['teckel', 'corgi', 'cocker', 'cavalier', 'chihuahua', 'jack_russell']) {
      // (FL, FR, HL — intérieur —, HR ; avant : HL 9,2 / 7,7 / 8,1 cm, HR 9,8 / 9,7 / 9,8 ; finitions 1 — 0,38 rad — :
      // teckel HL 4,8 HR 5,7, corgi 3,2 / 4,4, jack russell 3,1 / 5,0 ; finitions 2 : 1,3 cm au plus)
      const r = slip(breed);
      for (const x of r) expect(x, breed).toBeLessThan(2);
    }
  });

  it('membres longs : écart latéral du membre borné comme avant (0,38 rad), pattes courtes et petits chiens 0,6', () => {
    // (finitions 2 : 0,6 pour toutes les races — membre du labrador écarté de 30 → 33°, du saint-bernard 31 → 36° en
    // virage à 2 rad/s, sans pied qui glisse moins)
    for (const [breed, want] of [['labrador', 0.38], ['saint_bernard', 0.38], ['galgo', 0.38], ['beagle', 0.38], ['teckel', 0.6], ['jack_russell', 0.6], ['cavalier', 0.6]]) {
      const { md } = dog(breed);
      expect(md.anim.sideMax, breed).toBe(want);
      md.dispose();
    }
  });
});

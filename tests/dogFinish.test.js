// Finitions des chiens réalistes vues au téléphone : manteau, collier, queues, assis et couchés (src/game/models/dogReal.js).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealDogModel } from '../src/game/models/dogReal.js';
import { buildGear, removeGear } from '../src/game/gearModels.js';
import { buildAccessories, removeAccessories } from '../src/game/models/salon.js';
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
  return { back: (Math.atan2(sh.y - hip.y, sh.z - hip.z) * 180) / Math.PI, hipY: hip.y * s * 100, feet, stretch };
}

describe('assis et couché des petits chiens', () => {
  it('teckel et corgi assis : antérieurs tendus, postérieurs repliés (plus d\'arrière-train fripé), dos plus relevé', () => {
    // (avant : dos 13,6° et 17,4°, 121 et 110 triangles de l'arrière-train étirés plus de trois fois — jack : 43°, 0)
    for (const breed of ['teckel', 'corgi']) {
      const { md, s } = dog(breed);
      for (let i = 0; i < 240; i++) md.anim.update(1 / 60, st({ size: s, posture: 'sit' }));
      const p = poseOf(md, s);
      expect(p.back).toBeGreaterThan(17);
      expect(p.stretch).toBeLessThan(70);
      for (const f of p.feet) expect(Math.abs(f)).toBeLessThan(0.6);
      md.dispose();
    }
  });

  it('couchés des races du jack aux membres changés : postérieurs repliés au sol (avant : pieds arrière à 4 à 6 cm)', () => {
    for (const breed of ['teckel', 'corgi', 'carlin', 'bouledogue']) {
      const { md, s } = dog(breed);
      for (let i = 0; i < 300; i++) md.anim.update(1 / 60, st({ size: s, posture: 'lie' }));
      const p = poseOf(md, s);
      expect(Math.max(p.feet[2], p.feet[3])).toBeLessThan(1.2);
      expect(Math.min(...p.feet)).toBeGreaterThan(-0.8);
      md.dispose();
    }
  });
});

describe('yorkshire', () => {
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
  // Pointe de la langue au-delà du devant de la mâchoire du bas (cm, taille réelle), sur l'axe tête → truffe, après 6 s.
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
    const out = (Math.max(...tongue.map(proj)) - Math.max(...lip.map(proj))) * 100 / s;
    md.dispose();
    return out;
  };
  it('en haletant, la langue pend hors de la gueule (avant : rentrée derrière les dents, un rictus) ; au calme, elle est dedans', () => {
    for (const breed of ['labrador', 'golden', 'husky']) {
      // (mesuré : 3 à 3,6 cm à l'arrêt, 2,9 à 3,2 en marchant ; au calme -2,1 à -2,3)
      expect(tongueOut(breed, { happy: 1, hot: true })).toBeGreaterThan(2);
      expect(tongueOut(breed, { hot: true, v: 1.2, moving: true })).toBeGreaterThan(2);
      expect(tongueOut(breed, { happy: 0.25 })).toBeLessThan(0);
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

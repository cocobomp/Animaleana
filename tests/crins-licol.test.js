// Licol et filet (chantier « crins ») : posés sur la vraie peau de la tête, jamais dedans — ni la muserolle dans le
// nez du Percheron, ni la sous-gorge dans la joue —, la têtière derrière les oreilles. Mesures sur le cheval réaliste au
// repos (GLB chargé dans node), pièces rigides sur la tête (comme horse3dKit.js rigidGear) et liées à la peau (le jeu).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel } from '../src/game/models/horseReal.js';
import { buildGear, removeGear } from '../src/game/gearModels.js';
import { createAnimal } from '../src/sim/animal.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
}, 60000);

const horse = (breed, ageDays = 900) => {
  const a = createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays, seed: 11 });
  const look = ageDays < 200 ? { ...a.look, foal: true } : a.look;
  return { md: buildRealHorseModel(look, a.breed, gltf), look };
};

/** Triangles de la peau de la tête (repère de la tête), mesurés par horseReal.js. */
const skinTris = (md) => md.sdf.head.skin.tris;

/** Distance d'un point au triangle (a, b, c). */
const tri = new THREE.Triangle();
const cp = new THREE.Vector3();
function distToSkin(T, p) {
  let best = Infinity;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let k = 0; k < T.length; k += 9) {
    a.set(T[k], T[k + 1], T[k + 2]);
    // (tri rapide : un triangle loin de p ne peut pas être le plus proche)
    if (Math.abs(a.x - p.x) > 0.12 || Math.abs(a.y - p.y) > 0.12 || Math.abs(a.z - p.z) > 0.12) continue;
    b.set(T[k + 3], T[k + 4], T[k + 5]);
    c.set(T[k + 6], T[k + 7], T[k + 8]);
    tri.set(a, b, c).closestPointToPoint(p, cp);
    best = Math.min(best, cp.distanceTo(p));
  }
  return best;
}

/**
 * Vrai si p est dans la tête : deux rayons (vers le haut et vers le bas) traversent chacun la peau un nombre impair de
 * fois (la peau mesurée est ouverte derrière la gorge et à la base des oreilles : un seul rayon pourrait y passer).
 */
function inside(md, p) {
  // (pas près de la base des oreilles : la peau mesurée y est ouverte, et sous le bord de la base d'une oreille, un point
  // dehors y passait pour dedans ; là, la ligne du milieu des sangles est vérifiée à part, à 4 mm au moins de la peau)
  const ears = [md.ears[0], md.ears[1]].map((e) => {
    md.root.updateMatrixWorld(true);
    return e.getWorldPosition(new THREE.Vector3()).applyMatrix4(md.head.matrixWorld.clone().invert());
  });
  if (ears.some((e) => e.distanceTo(p) < 0.055)) return false;
  const odd = (d) => {
    let n = 0;
    const o = p.clone();
    for (let guard = 0; guard < 30; guard++) {
      const h = nearestHit(md, o, d);
      if (!h) break;
      n++;
      o.copy(h).addScaledVector(d, 1e-4);
    }
    return n % 2 === 1;
  };
  // (deux rayons d'accord, et à moins de 6 mm de la peau : derrière la gorge, la peau mesurée est ouverte, un point de
  // la sous-gorge à 9 mm de la peau y passait pour dedans ; une sangle qui entre dans la peau a toujours des points tout
  // près d'elle, comptés à part — moins de 1,5 mm)
  // (et un troisième, de côté vers le milieu de la tête : sous la gorge, la peau mesurée est ouverte vers l'encolure)
  return odd(new THREE.Vector3(0.13, 1, 0.07).normalize()) && odd(new THREE.Vector3(-0.09, -1, 0.11).normalize())
    && odd(new THREE.Vector3(-Math.sign(p.x || 1), 0.1, 0.05).normalize()) && distToSkin(skinTris(md), p) < 0.006;
}

/** Première traversée de la peau le long de d depuis o. */
function nearestHit(md, o, d) {
  const T = skinTris(md);
  const ray = new THREE.Ray(o, d);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const hit = new THREE.Vector3();
  let best = null;
  let bt = Infinity;
  for (let k = 0; k < T.length; k += 9) {
    a.set(T[k], T[k + 1], T[k + 2]);
    b.set(T[k + 3], T[k + 4], T[k + 5]);
    c.set(T[k + 6], T[k + 7], T[k + 8]);
    if (!ray.intersectTriangle(a, b, c, false, hit)) continue;
    const t = hit.distanceTo(o);
    if (t > 1e-6 && t < bt) {
      bt = t;
      best = hit.clone();
    }
  }
  return best;
}

/** Sommets des pièces posées sur la tête, dans le repère de la tête. */
function headGearPoints(md, group) {
  const out = [];
  const inv = new THREE.Matrix4();
  md.root.updateMatrixWorld(true);
  inv.copy(md.head.matrixWorld).invert();
  for (const m of group.userData.meshes) {
    if (m.parent !== md.head) continue;
    m.updateMatrixWorld(true);
    const pos = m.geometry.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) out.push(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld).applyMatrix4(inv).clone());
  }
  return out;
}

const BREEDS = [['selle_francais', 900], ['percheron', 900], ['trait_breton', 900], ['shetland', 900], ['falabella', 900], ['selle_francais', 60],
  ['arabe', 900], ['appaloosa', 900], ['frison', 900], ['pre', 900]];

describe('licol et filet sur la vraie peau de la tête', () => {
  it.each(BREEDS)('%s (%i jours) : licol, sangles à 4 mm au moins de la peau (ligne du milieu), aucun point dans la peau', (breed, age) => {
    const { md, look } = horse(breed, age);
    expect(md.sdf.head.skin.tris.length).toBeGreaterThan(9 * 500);
    for (const item of ['halter', 'halterLeather', 'halterRope']) {
      // (pièces rigides sur la tête, comme dans les soins en 3D : horse3dKit.js rigidGear)
      const proxy = Object.create(md);
      proxy.skinGear = null;
      proxy.setForelockTucked = null;
      const g = buildGear(proxy, look, { halter: { item } });
      const T = skinTris(md);
      // (ligne du milieu des sangles : muserolle, têtière et sous-gorge, montants)
      const L = g.userData.headLines;
      const line = [...L.nose, ...L.crown, ...L.cheeks.flat()];
      expect(line.length).toBeGreaterThan(60);
      const dMin = Math.min(...line.map((p) => distToSkin(T, p)));
      expect(dMin, `${breed} ${item} : ligne du milieu`).toBeGreaterThan(0.004);
      // (surface des sangles : aucun point à plus de 1,5 mm dans la peau — avant, la sous-gorge traversait la joue et la
      // muserolle le nez, de plusieurs centimètres)
      const pts = headGearPoints(md, g);
      expect(pts.length).toBeGreaterThan(100);
      let inPts = 0;
      for (let i = 0; i < pts.length; i += 5) {
        if (inside(md, pts[i]) && distToSkin(T, pts[i]) > 0.0015) {
          inPts++;
          if (process.env.CRINS_DBG) console.log('IN', breed, item, pts[i].toArray().map((v) => v.toFixed(3)).join(','), distToSkin(T, pts[i]).toFixed(4));
        }
      }
      // (au plus un point sur les échantillons : la corde du licol éthologique dans le creux entre la ganache et la gorge,
      // où la peau mesurée est ouverte et le test des rayons incertain — vérifié à l'image, rien ne traverse)
      expect(inPts, `${breed} ${item} : points dans la peau`).toBeLessThanOrEqual(item === 'halterRope' ? 1 : 0);
      removeGear(g);
    }
    md.dispose();
  }, 120000);

  it.each(BREEDS.slice(0, 3))('%s : filet, aucun point de ses sangles à plus de 1,5 mm dans la peau', (breed, age) => {
    const { md, look } = horse(breed, age);
    for (const item of ['bridle', 'bridleOlive', 'doubleBridle']) {
      const proxy = Object.create(md);
      proxy.skinGear = null;
      proxy.setForelockTucked = null;
      const g = buildGear(proxy, look, { bridle: { item } });
      // (les sangles seulement : le mors et ses anneaux vont dans la bouche, au coin des lèvres)
      const straps = g.userData.meshes.filter((m) => m.parent === md.head && m.geometry.type !== 'TorusGeometry' && m.geometry.type !== 'CylinderGeometry' && m.geometry.type !== 'SphereGeometry');
      const sub = new THREE.Group();
      sub.userData.meshes = straps;
      const pts = headGearPoints(md, sub);
      let inPts = 0;
      const T = skinTris(md);
      for (let i = 0; i < pts.length; i += 5) {
        if (inside(md, pts[i]) && distToSkin(T, pts[i]) > 0.0015) {
          inPts++;
          if (process.env.CRINS_DBG) console.log('INB', breed, item, pts[i].toArray().map((v) => v.toFixed(3)).join(','));
        }
      }
      expect(inPts, `${breed} ${item}`).toBe(0);
      removeGear(g);
    }
    md.dispose();
  }, 120000);

  it('têtière bien derrière les oreilles', () => {
    const { md, look } = horse('selle_francais');
    const g = buildGear(md, look, { halter: { item: 'halter' } });
    const pts = headGearPoints(md, g);
    // (têtière : les points au-dessus de la nuque, plus de 3,5 cm en arrière du milieu des oreilles)
    const zC0 = md.dims.earZ - md.dims.hr * 0.38;
    const top = pts.filter((p) => p.y > md.dims.earY * 0.6 && Math.abs(p.z - zC0) < 0.1);
    expect(top.length).toBeGreaterThan(10);
    for (const p of top) expect(p.z, 'têtière').toBeLessThan(md.dims.earZ - 0.035);
    removeGear(g);
    md.dispose();
  }, 60000);

  // Borne haute : une sangle qui flotte loin de la tête (la sous-gorge qui pendait à 5-12 cm sous la gorge de l'arabe et de
  // l'appaloosa) ne passe plus. Mesure contre la peau au repos.
  it.each(BREEDS)('%s (%i jours) : aucune sangle loin de la peau, sous-gorge juste sous la ganache', (breed, age) => {
    const { md, look } = horse(breed, age);
    const T = skinTris(md);
    for (const item of ['halter', 'halterRope']) {
      const g = buildGear(md, look, { halter: { item } });
      const L = g.userData.headLines;
      const far = (line) => Math.max(...line.map((p) => distToSkin(T, p)));
      expect(far(L.nose), `${breed} ${item} muserolle`).toBeLessThan(0.025);
      expect(far(L.cheeks.flat()), `${breed} ${item} montants`).toBeLessThan(0.03);
      expect(far(L.crown), `${breed} ${item} têtière et sous-gorge`).toBeLessThan(0.035);
      // (sous-gorge : le point le plus bas de la boucle de la têtière, décollé de la gorge mais tout près — avant, à 6 cm de
      // la gorge de l'arabe, 12 cm de celle du Percheron —, et derrière la ganache, pas le long de la gorge)
      const low = L.crown.reduce((a, p) => (p.y < a.y ? p : a));
      const d = distToSkin(T, low);
      expect(d, `${breed} ${item} sous-gorge décollée`).toBeGreaterThan(0.008);
      expect(d, `${breed} ${item} sous-gorge proche`).toBeLessThan(0.035);
      expect(low.y, `${breed} ${item} sous-gorge pas le long de la gorge`).toBeGreaterThan(-2.7 * md.dims.hr);
      removeGear(g);
    }
    md.dispose();
  }, 120000);

  // La tête bouge par rapport à l'encolure (photo, brouter, manger à la mangeoire, trotter) : les pièces sont rigides sur la
  // tête, la gorge suit l'encolure. La sangle reste près de la peau (sommet de la peau posée le plus proche, à moins de
  // 4,5 cm : les sommets sont espacés de 1 à 2 cm).
  it.each([['arabe'], ['appaloosa'], ['percheron'], ['shetland']])('%s : licol près de la tête, tête relevée ou baissée', (breed) => {
    const { md, look } = horse(breed);
    const g = buildGear(md, look, { halter: { item: 'halter' } });
    const L = g.userData.headLines;
    const mesh = md.coatMesh;
    const v = new THREE.Vector3();
    const st = (o) => ({ v: 0, moving: false, graze: 0, feeder: 0, turn: 0, fat: 1, near: true, ...o });
    const check = (tag) => {
      md.root.updateMatrixWorld(true);
      const inv = md.head.matrixWorld.clone().invert();
      const pv = [];
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).applyMatrix4(inv);
        if (v.z > -0.3 && v.z < 0.8 && v.y > -0.7) pv.push(v.clone());
      }
      const far = (line) => Math.max(...line.map((p) => Math.min(...pv.map((q) => q.distanceToSquared(p)))).map(Math.sqrt));
      expect(far(L.crown), `${breed} ${tag} têtière et sous-gorge`).toBeLessThan(0.045);
      expect(far(L.nose), `${breed} ${tag} muserolle`).toBeLessThan(0.03);
    };
    md.photoPose();
    check('photo');
    md.anim.photo = false;
    for (const [tag, o] of [['brouter', { graze: 1 }], ['mangeoire', { feeder: 1 }], ['trot', { v: 3, moving: true }]]) {
      for (let i = 0; i < 90; i++) md.anim.update(1 / 30, st(o), {});
      check(tag);
    }
    removeGear(g);
    md.dispose();
  }, 120000);

  // Coût : la peau de la tête est rangée dans une grille, et les lignes des sangles sont gardées avec elle ; un deuxième
  // licol du même modèle sur le même gabarit ne lance plus aucun rayon.
  it('un deuxième licol du même gabarit ne refait pas les rayons', () => {
    const { md, look } = horse('selle_francais');
    const skin = md.sdf.head.skin;
    skin.cache.clear();
    let rays = 0;
    let clears = 0;
    const { ray, clear } = skin;
    skin.ray = (...a) => (rays++, ray(...a));
    skin.clear = (...a) => (clears++, clear(...a));
    const g1 = buildGear(md, look, { halter: { item: 'halter' } });
    expect(rays).toBeGreaterThan(100);
    rays = 0;
    clears = 0;
    const g2 = buildGear(md, look, { halter: { item: 'halter' } });
    expect(rays + clears).toBe(0);
    // (mêmes lignes, mais des copies : une pièce ne déplace pas les points d'une autre)
    expect(g2.userData.headLines.crown[3].distanceTo(g1.userData.headLines.crown[3])).toBeLessThan(1e-9);
    expect(g2.userData.headLines.crown[3]).not.toBe(g1.userData.headLines.crown[3]);
    Object.assign(skin, { ray, clear });
    removeGear(g1);
    removeGear(g2);
    md.dispose();
  }, 60000);
});

// Cheval réaliste : modèle et textures de Lyndon Daniels, squelette de ChadM (OpenGameArt, CC0 1.0),
// préparés et animés pour le jeu (public/models/horse_real.glb, voir tools/cheval/LISEZMOI.md).
//
// Le GLB n'est qu'une source : à son premier usage, on en tire une fois pour toutes la géométrie de
// repos (en flottants, dans le repère du cheval), le squelette et les allures. Puis chaque race a sa
// propre géométrie (proportions : longueur des membres, épaisseur du tronc, encolure, tête, crins),
// partagée par les chevaux de cette race, et chaque cheval son propre squelette, ses matières (robe
// peinte par le shader de horseCoat.js, crins recolorés) et son mixeur d'animations.
//
// Interface : la même que le cheval sculpté (horseModel.js), qui reste le modèle de repli si le GLB
// manque. Repère : regard vers +Z, y vers le haut, origine au sol sous le milieu du corps ; cheval
// « de taille 1 » (garrot ≈ 1,6 m), l'échelle de la race est appliquée par AnimalEntity.
// Les groupes du squelette (body, neck, head, oreilles, queue, membres) sont de vrais parents des os :
// ce qu'on leur fait (saut d'obstacles, tours, broutage) déforme le maillage. Leur rotation de repos
// est nulle (axes du cheval), sauf l'encolure (rotation x = NECK_REST, comme look.neckAngle) et la
// tête (axe z le long du chanfrein, rotation x seule).

import * as THREE from 'three';
import { getModel } from '../assets.js';
import { gfx } from '../gfx.js';
import { horseBuild, horseBreedOf, foalBuild, horseCoatTraits, horseSocks } from '../../sim/horseLook.js';
import { coatMaterial, PART } from './horseCoat.js';
import { hairMaterial, hairColor, HAIR_V, HAIR_TEX, HAIR_MASS } from './horseHair.js';

export const REAL_HORSE_KEY = 'horse_real';
/** Rotation x de repos de l'encolure (interface : look.neckAngle ; plus grand = encolure plus basse). */
export const NECK_REST = 0.85;

// Vitesse « naturelle » de chaque allure du GLB (m/s, cheval de taille 1, voir tools/cheval/gait2.py) :
// à cette vitesse, les sabots posés du modèle d'origine ne glissent pas. Pour une race, les allures sont
// recalées sur ses membres et la vitesse mesurée sur ses sabots (lockedGaits) ; le clip est accéléré ou
// ralenti d'autant.
export const NATURAL_SPEED = { walk: 1.6, trot: 3.0, canter: 4.6, canterR: 4.6, gallop: 8.5 };
const MOVING = ['walk', 'trot', 'canter', 'gallop'];
const STILL = ['idle', 'rest', 'eat'];
// Allure du cavalier (src/game/models/avatarRig.js) : 0 pas, 1 trot, 2 galop.
const RIDER_GAIT = { walk: 0, trot: 1, canter: 2, gallop: 2 };
const RIDER_KEYS = [...MOVING, 'canterR'];
/**
 * Galop allongé (gallopX) : le galop du GLB recalé par race (lockedGaits) avec une foulée GALLOP_REACH fois plus
 * longue pour la même cadence — antérieurs posés plus loin devant, postérieurs levés plus loin derrière. Au-dessus
 * de la vitesse naturelle du galop, le cheval allonge sa foulée (mélange du galop et du galop allongé) plutôt que
 * d'accélérer ses membres : cadence (v ÷ naturelle)^GALLOP_CADENCE, au plus GALLOP_CADENCE_MAX. Avant : clip
 * joué à v ÷ naturelle, 1,67 fois trop vite à 14 m/s (moulinet de dessin animé accéléré).
 */
export const GALLOP_REACH = 1.45;
export const GALLOP_CADENCE = 0.35;
export const GALLOP_CADENCE_MAX = 1.22;
const LOCK_KEYS = [...RIDER_KEYS, 'gallopX'];
/** Allures recalées à partir d'une autre (nom du clip source, facteur de foulée). */
const LOCK_FROM = { gallopX: ['gallop', GALLOP_REACH] };

/**
 * Version réduite (LOD) au-delà de cette distance à la caméra (m, divisée par la taille du cheval) : plus
 * près en qualité basse (téléphone), plus loin en qualité haute. Hystérésis de 10 % (pas de va-et-vient).
 * (Basse : 15 m et non plus 7 — la caméra du jeu est à 7 m du joueur, 9 m quand il monte, et le cheval d'à
 * côté à 9 à 13 m de la caméra, 10 à 14,5 m une fois divisé par sa taille : on voyait toujours la version
 * réduite, crinière en dents de peigne. Un poney à cette distance, plus petit à l'écran, reste en version réduite.)
 */
export const LOD_DIST = { low: 15, high: 22 };
/** Cheval hors du champ (ni dessiné ni dans l'ombre) : animé une image sur OFFSCREEN_STEP, avec le temps cumulé. */
export const OFFSCREEN_STEP = 3;
/**
 * Point de vue du jeu (Game.frame : position de la caméra à l'image précédente), pour le choix de la version
 * réduite. Sans lui (tests, vignettes), toujours la version complète. frame : numéro de l'image du jeu
 * (Game.frame l'avance une fois par image, avant les pas de simulation) ; « vu ou pas » se décide une fois
 * par image, même quand l'avance rapide (⏩) simule plusieurs pas dans la même image.
 */
export const horseView = { eye: new THREE.Vector3(), on: false, frame: 0 };

// Gabarit natif du modèle (cheval de trait, en unités de horseLook.js) : les races s'obtiennent en
// divisant leur gabarit par celui-ci (pur-sang : tronc plus étroit, membres plus fins et plus longs…).
// (back : 1,08 et non 1 — le modèle d'origine a le corps long, 1,12 fois la hauteur au garrot chez un selle
// français, 1,21 chez un pur-sang ; un cheval de selle est presque carré, 1,00 à 1,05)
export const NATIVE_BUILD = { girth: 1.24, legs: 0.98, bone: 1.36, neck: 0.95, neckW: 1.24, crest: 1.25, head: 1.1, croup: 1.12, back: 1.08, mane: 1.45, tail: 0.85 };
/** Exposant de la profondeur du tronc selon son épaisseur (deformer : girth^GIRTH_DEPTH, 0,6 avant). */
export const GIRTH_DEPTH = 0.25;
/**
 * Ligne du dessus (deformer, m, cheval de taille 1) : bosse du garrot (withers) à behind derrière la base de
 * l'encolure, longue de wLen ; creux du dos comblé de fill, fillAt plus en arrière, long de fLen ; à partir de
 * from au-dessus des coudes.
 */
export const TOPLINE = { withers: 0.035, behind: 0.17, wLen: 0.1, fill: 0.018, fillAt: 0.24, fLen: 0.13, from: 0.36 };

// Squelette : [os, os parent dans le jeu]. Spine est le groupe body (origine au sol).
const RIG = [
  ['Spine', null], ['Ribs', 'Spine'], ['Neck', 'Spine'], ['Head', 'Neck'], ['EarL', 'Head'], ['EarR', 'Head'],
  ['Mane1', 'Neck'], ['Mane2', 'Neck'], ['Mane3', 'Neck'], ['Mane4', 'Neck'],
  ['FL1', 'Spine'], ['FL2', 'FL1'], ['FL3', 'FL2'], ['FL4', 'FL3'],
  ['FR1', 'Spine'], ['FR2', 'FR1'], ['FR3', 'FR2'], ['FR4', 'FR3'],
  ['HL1', 'Spine'], ['HL2', 'HL1'], ['HL3', 'HL2'], ['HL4', 'HL3'],
  ['HR1', 'Spine'], ['HR2', 'HR1'], ['HR3', 'HR2'], ['HR4', 'HR3'],
  ['Tail1', 'Spine'], ['Tail2', 'Tail1'],
];
const BONE_INDEX = Object.fromEntries(RIG.map(([n], i) => [n, i]));
/** Os du squelette, dans l'ordre du jeu (tests : construire des données de repos). */
export const RIG_BONES = RIG.map(([n]) => n);
const PARENT = Object.fromEntries(RIG);
// Membres dans l'ordre de l'interface : antérieur gauche (+x), antérieur droit, postérieur gauche, postérieur droit.
const LEGS = [['FL', true, 1], ['FR', true, -1], ['HL', false, 1], ['HR', false, -1]];
const TRUNK = new Set(['Spine', 'Ribs', 'FL1', 'FR1', 'HL1', 'HR1', 'Tail1']);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const _v = V();
const _w = V();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();

// ------------------------------------------------------------------ données de repos (une fois par GLB)

/**
 * Géométrie et squelette de repos tirés du GLB, dans le repère du cheval (flottants : les positions
 * du fichier sont quantifiées, c'est le squelette qui les remet à l'échelle), et allures reciblées
 * sur les groupes du jeu. Gardé dans gltf.userData.
 */
export function realHorseBase(gltf) {
  if (gltf.userData.horseBase) return gltf.userData.horseBase;
  const scene = gltf.scene;
  scene.updateMatrixWorld(true);
  const toHorse = scene.matrixWorld.clone().invert();
  const meshes = [];
  const lods = []; // version réduite (tools/cheval/lod.mjs) : un autre index sur les mêmes sommets
  scene.traverse((o) => {
    if (o.isSkinnedMesh) (o.userData.lod ? lods : meshes).push(o);
  });
  const skel = meshes[0].skeleton;
  const glbIndex = new Map(skel.bones.map((b, i) => [b.name, i]));
  const restW = RIG.map(([n]) => {
    const b = skel.bones[glbIndex.get(n)];
    if (!b) throw new Error(`os ${n} absent du GLB`);
    return new THREE.Matrix4().multiplyMatrices(toHorse, b.matrixWorld);
  });
  const remap = skel.bones.map((b) => BONE_INDEX[b.name] ?? 0);
  const prims = {};
  const bm = new THREE.Matrix4();
  const acc = new THREE.Matrix4();
  const nm = new THREE.Matrix3();
  for (const mesh of meshes) {
    const name = mesh.material.name.replace('horse_', ''); // coat, eye, mane
    const g = mesh.geometry;
    const n = g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nrm = new Float32Array(n * 3);
    const si = new Uint16Array(n * 4);
    const sw = new Float32Array(n * 4);
    const uv = new Float32Array(n * 2);
    const ao = new Float32Array(n);
    const sIdx = g.attributes.skinIndex;
    const sWgt = g.attributes.skinWeight;
    const col = g.attributes.color;
    const toH = new THREE.Matrix4().multiplyMatrices(toHorse, mesh.matrixWorld);
    for (let i = 0; i < n; i++) {
      // Peau au repos : matrice mélangée des os (elle contient la déquantification).
      acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
      let tot = 0;
      for (let k = 0; k < 4; k++) {
        const w = sWgt.getComponent(i, k);
        const bi = sIdx.getComponent(i, k);
        si[i * 4 + k] = remap[bi];
        sw[i * 4 + k] = w;
        tot += w;
        if (w <= 0) continue;
        bm.multiplyMatrices(skel.bones[bi].matrixWorld, skel.boneInverses[bi]);
        for (let e = 0; e < 16; e++) acc.elements[e] += bm.elements[e] * w;
      }
      for (let k = 0; k < 4; k++) sw[i * 4 + k] /= tot || 1;
      _m.multiplyMatrices(toH, mesh.bindMatrixInverse).multiply(acc).multiply(mesh.bindMatrix);
      _v.fromBufferAttribute(g.attributes.position, i).applyMatrix4(_m);
      pos.set([_v.x, _v.y, _v.z], i * 3);
      nm.getNormalMatrix(_m);
      _w.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize();
      nrm.set([_w.x, _w.y, _w.z], i * 3);
      if (g.attributes.uv) uv.set([g.attributes.uv.getX(i), g.attributes.uv.getY(i)], i * 2);
      ao[i] = col ? col.getX(i) : 1;
    }
    prims[name] = { pos, nrm, si, sw, uv, ao, index: Uint32Array.from(g.index.array), count: n, material: mesh.material };
  }
  for (const mesh of lods) {
    const name = mesh.material.name.replace('horse_', '');
    const src = meshes.find((m) => m.material.name === mesh.material.name);
    // (index pris seulement s'il porte sur les mêmes sommets que la primitive d'origine)
    const same = src && mesh.geometry.attributes.position.count === src.geometry.attributes.position.count;
    if (prims[name] && same && mesh.geometry.index) prims[name].lodIndex = Uint32Array.from(mesh.geometry.index.array);
  }
  provokeOffEars(prims.coat);
  // Recalage en z : le creux du dos (là où se pose la selle) à z = -0,075, comme le cheval sculpté
  // (Player.seat, gearModels.js). Le GLB est centré sur sa boîte, qui comprend la tête et la queue.
  const rest = restW.map((m) => V().setFromMatrixPosition(m));
  const rot = restW.map((m) => new THREE.Quaternion().setFromRotationMatrix(m));
  const seatZ = backSeatZ(prims.coat, rest);
  const zShift = -0.075 - seatZ;
  for (const p of Object.values(prims)) for (let i = 2; i < p.pos.length; i += 3) p.pos[i] += zShift;
  for (const r of rest) r.z += zShift;
  // Rotation de repos des groupes (axes du cheval), sauf l'encolure et la tête (z le long du chanfrein).
  const iH = BONE_INDEX.Head;
  const snout = muzzleTip(prims.coat, rest[iH]);
  const chanfrein = snout.clone().sub(rest[iH]);
  const headTilt = Math.atan2(-chanfrein.y, chanfrein.z);
  const groupRest = RIG.map(([n]) => {
    if (n === 'Neck') return new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), NECK_REST);
    if (n === 'Head') return new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), headTilt);
    return new THREE.Quaternion();
  });
  const base = { prims, rest, rot, groupRest, headTilt, zShift, snout };
  base.eyes = openEyelids(prims, chanfrein);
  mapEyes(prims, base.eyes, chanfrein);
  base.hair = hairInfo(prims, rest);
  base.clips = retarget(gltf, toHorse, restW, groupRest, zShift);
  base.sole = solesOf(prims.coat, rest);
  gltf.userData.horseBase = base;
  // Les textures du GLB sont partagées par tous les chevaux : jamais libérées avec l'un d'eux.
  for (const p of Object.values(prims)) {
    const m = p.material;
    for (const key of ['map', 'normalMap']) {
      if (!m[key]) continue;
      m[key].userData.shared = true;
      if (key === 'map') m[key].colorSpace = THREE.NoColorSpace; // modelé gris (données), pas une couleur
    }
  }
  return base;
}

/**
 * Paupières du modèle source à demi fermées (regard somnolent en permanence, qu'on ne distinguait plus de la
 * somnolence ni de la tristesse) : on ouvre l'œil. Pour chaque œil (sphère de la primitive des yeux), les
 * sommets du pelage autour, du côté de l'œil, tournent sur la sphère autour de l'axe du chanfrein passant par
 * son centre : la paupière supérieure remonte de EYE_OPEN.up, l'inférieure descend de EYE_OPEN.low. Tourner
 * sur la sphère garde chaque sommet à sa distance du centre (rien ne passe dans le globe) ; l'angle décroît
 * vers le sourcil et la joue (sans repli : jamais plus vite que l'angle lui-même) et vers les coins de l'œil,
 * qui restent en place (forme en amande). Renvoie les yeux (centre, rayon) pour les tests.
 */
const EYE_OPEN = { up: 0.42, low: 0.12 };
export const EYE_SCALE = 1.12;
function openEyelids(prims, chanfrein) {
  const eye = prims.eye;
  const coat = prims.coat;
  if (!eye || !coat) return [];
  const f = V(0, chanfrein.y, chanfrein.z).normalize();
  const u = V().crossVectors(f, V(1, 0, 0)).normalize();
  if (u.y < 0) u.negate();
  const eyes = [];
  const before = new Map(); // sommet déplacé -> position d'origine (contrôle des triangles retournés)
  for (const side of [1, -1]) {
    const c = V();
    let n = 0;
    for (let i = 0; i < eye.count; i++) {
      if (Math.sign(eye.pos[i * 3]) !== side) continue;
      c.add(_v.fromArray(eye.pos, i * 3));
      n++;
    }
    if (!n) continue;
    c.multiplyScalar(1 / n);
    let r = 0;
    for (let i = 0; i < eye.count; i++) {
      if (Math.sign(eye.pos[i * 3]) === side) r = Math.max(r, _v.fromArray(eye.pos, i * 3).distanceTo(c));
    }
    // Œil plus grand (EYE_SCALE, finitions de près) : le globe grossit autour de son centre ; le pelage autour,
    // du côté de l'œil, s'écarte d'autant au bord des paupières, moins en s'éloignant (rien n'entre dans le globe :
    // un œil un peu plus saillant, comme celui d'un cheval, au lieu d'un œil petit et enfoncé).
    const r1 = r * EYE_SCALE;
    for (let i = 0; i < eye.count; i++) {
      if (Math.sign(eye.pos[i * 3]) !== side) continue;
      _v.fromArray(eye.pos, i * 3).sub(c).multiplyScalar(EYE_SCALE).add(c);
      eye.pos.set([_v.x, _v.y, _v.z], i * 3);
    }
    for (let i = 0; i < coat.count; i++) {
      _v.fromArray(coat.pos, i * 3).sub(c);
      const dl = _v.length();
      if (dl / r > 2.4 || _v.x * side < 0.1 * r || dl < 1e-6) continue;
      const k = (r1 - r) * (1 - smooth(1.0, 2.4, dl / r)) * smooth(0.1, 0.5, (_v.x * side) / dl);
      _v.multiplyScalar((dl + k) / dl).add(c);
      coat.pos.set([_v.x, _v.y, _v.z], i * 3);
    }
    r = r1;
    eyes.push({ side, c: c.clone(), r });
    const l = V(side, 0, 0);
    // Milieu de la fente le long du chanfrein (entre les deux coins) : sommets du bord, juste hors du globe.
    let f0 = Infinity;
    let f1 = -Infinity;
    for (let i = 0; i < coat.count; i++) {
      _v.fromArray(coat.pos, i * 3).sub(c);
      const d = _v.length() / r;
      if (d < 0.95 || d > 1.12 || _v.dot(l) < 0.3 * r) continue;
      const a = _v.dot(f) / r;
      f0 = Math.min(f0, a);
      f1 = Math.max(f1, a);
    }
    if (!Number.isFinite(f0)) continue;
    const fm = (f0 + f1) / 2;
    const half = Math.max(0.3, (f1 - f0) / 2);
    const q = new THREE.Quaternion();
    for (let i = 0; i < coat.count; i++) {
      _v.fromArray(coat.pos, i * 3).sub(c);
      const d = _v.length() / r;
      const pl = _v.dot(l) / r;
      if (d > 2 || pl < 0.15) continue;
      const pu = _v.dot(u) / r;
      const pf = _v.dot(f) / r;
      const phi = Math.atan2(pu, pl); // hauteur sur le globe, depuis l'axe du regard (vers l'extérieur)
      // (la fente est un peu au-dessus de l'axe : paupière supérieure au-dessus de 0,05 rad)
      const upper = phi > 0.05;
      const top = upper ? 1 - smooth(0.6, 1.5, phi) : 1 - smooth(-0.35, -1.2, phi);
      const w = top * (1 - smooth(1.3, 2, d)) * (1 - smooth(0.6, 1.05, Math.abs(pf - fm) / half));
      if (w <= 0) continue;
      const ang = (upper ? EYE_OPEN.up : -EYE_OPEN.low) * w * side;
      // (autour de f, de l vers u : f × (+x) = u, la paupière gauche s'ouvre ; à droite, l = -x, le sens s'inverse)
      q.setFromAxisAngle(f, ang);
      before.set(i, coat.pos.slice(i * 3, i * 3 + 3));
      _v.applyQuaternion(q).add(c);
      coat.pos.set([_v.x, _v.y, _v.z], i * 3);
      _w.fromArray(coat.nrm, i * 3).applyQuaternion(q);
      coat.nrm.set([_w.x, _w.y, _w.z], i * 3);
    }
  }
  // Triangles retournés (repli de la paupière : un trou dans le pelage) : comptés pour les tests.
  let flips = 0;
  const A = V(), B = V(), C = V(), n0 = V(), n1 = V();
  const at = (k, old) => (old && before.has(k) ? _v.fromArray(before.get(k)) : _v.fromArray(coat.pos, k * 3));
  for (let t = 0; t < coat.index.length; t += 3) {
    const [a, b, c] = [coat.index[t], coat.index[t + 1], coat.index[t + 2]];
    if (!before.has(a) && !before.has(b) && !before.has(c)) continue;
    for (const old of [true, false]) {
      A.copy(at(a, old));
      B.copy(at(b, old)).sub(A);
      C.copy(at(c, old)).sub(A);
      (old ? n0 : n1).crossVectors(B, C);
    }
    if (n0.dot(n1) <= 0) flips++;
  }
  eyes.flips = flips;
  return eyes;
}

/**
 * Œil vivant (voir eyeMaterial) : pour chaque globe, la partie que les paupières laissent voir (sommets du côté
 * extérieur dont le rayon, le long de la normale, sort sans toucher le pelage), son centre (axe du regard) et
 * son étendue ; puis des UV projetées sur le plan du regard (iris peint centré sur l'ouverture, pupille
 * horizontale le long du chanfrein) et l'axe du regard par sommet (attribut eyeAxis : le reflet du soleil y
 * reste dans l'ouverture). Ajoute à chaque œil { axis, cap } (cap : angle de l'ouverture, rad).
 */
function mapEyes(prims, eyes, chanfrein) {
  const eye = prims.eye;
  const coat = prims.coat;
  if (!eye || !coat || !eyes.length) return;
  const f = V(0, chanfrein.y, chanfrein.z).normalize();
  const up = V().crossVectors(f, V(1, 0, 0)).normalize();
  if (up.y < 0) up.negate();
  const uv = new Float32Array(eye.count * 2);
  const axis = new Float32Array(eye.count * 3);
  const P = coat.pos;
  const d = V();
  const e1 = V();
  const e2 = V();
  const pv = V();
  const tv = V();
  const qv = V();
  for (const E of eyes) {
    const reach = 8 * E.r;
    // Triangles du pelage autour de l'œil (sommets en coordonnées absolues, à plat).
    const tri = [];
    for (let t = 0; t < coat.index.length; t += 3) {
      let near = true;
      for (let k = 0; k < 3 && near; k++) {
        const o = coat.index[t + k] * 3;
        near = (P[o] - E.c.x) ** 2 + (P[o + 1] - E.c.y) ** 2 + (P[o + 2] - E.c.z) ** 2 < reach * reach;
      }
      if (near) for (let k = 0; k < 3; k++) tri.push(coat.index[t + k] * 3);
    }
    // Rayon (Möller-Trumbore) depuis le sommet, le long de la normale du globe : touche-t-il le pelage ?
    const blocked = (ox, oy, oz) => {
      for (let t = 0; t < tri.length; t += 3) {
        const a = tri[t];
        const b = tri[t + 1];
        const c = tri[t + 2];
        e1.set(P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]);
        e2.set(P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]);
        pv.crossVectors(d, e2);
        const det = e1.dot(pv);
        if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det;
        tv.set(ox - P[a], oy - P[a + 1], oz - P[a + 2]);
        const u = tv.dot(pv) * inv;
        if (u < 0 || u > 1) continue;
        qv.crossVectors(tv, e1);
        const v = d.dot(qv) * inv;
        if (v < 0 || u + v > 1) continue;
        const s = e2.dot(qv) * inv;
        if (s > 1e-5 && s < reach) return true;
      }
      return false;
    };
    const G = V();
    const seen = [];
    for (let i = 0; i < eye.count; i++) {
      if (Math.sign(eye.pos[i * 3]) !== E.side) continue;
      d.fromArray(eye.pos, i * 3).sub(E.c).normalize();
      if (d.x * E.side < 0.2) continue; // (côté extérieur seulement : vers l'intérieur, le rayon traverse la tête)
      if (blocked(eye.pos[i * 3], eye.pos[i * 3 + 1], eye.pos[i * 3 + 2])) continue;
      G.add(d);
      seen.push(d.clone());
    }
    if (!seen.length) G.set(E.side, 0, 0);
    G.normalize();
    const ang = seen.map((x) => Math.acos(Math.min(1, x.dot(G)))).sort((a, b) => a - b);
    const cap = Math.min(0.9, Math.max(0.35, ang[Math.floor(ang.length * 0.85)] ?? 0.5));
    E.axis = G.clone();
    E.cap = cap;
    // Repère du regard : F le long de la fente des paupières (grand axe de la partie visible : la pupille
    // horizontale lui est parallèle), U en travers, vers le haut de la tête.
    const U0 = up.clone().addScaledVector(G, -up.dot(G)).normalize();
    const F0 = V().crossVectors(U0, G);
    let sxx = 0;
    let sxy = 0;
    let syy = 0;
    for (const x of seen) {
      const a = x.dot(F0);
      const b = x.dot(U0);
      sxx += a * a;
      sxy += a * b;
      syy += b * b;
    }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const F = F0.clone().multiplyScalar(Math.cos(th)).addScaledVector(U0, Math.sin(th));
    const U = V().crossVectors(G, F);
    if (U.dot(up) < 0) U.negate();
    const R = Math.sin(Math.min(1.2, cap * 1.15));
    for (let i = 0; i < eye.count; i++) {
      if (Math.sign(eye.pos[i * 3]) !== E.side) continue;
      d.fromArray(eye.pos, i * 3).sub(E.c).normalize();
      let x = d.dot(F) / R;
      let y = d.dot(U) / R;
      const l = Math.hypot(x, y);
      // (derrière le bord de l'iris, et sur la moitié cachée du globe : couleur du bord)
      if (d.dot(G) < 0 || l > 1) {
        x /= Math.max(l, 1e-6);
        y /= Math.max(l, 1e-6);
      }
      uv[i * 2] = 0.5 + 0.5 * x * E.side;
      uv[i * 2 + 1] = 0.5 + 0.5 * y;
      axis.set([G.x, G.y, G.z], i * 3);
    }
  }
  eye.uv = uv;
  eye.axis = axis;
}

/** z du creux du dos (ligne du dessus entre garrot et hanches). */
function backSeatZ(coat, rest) {
  const zW = rest[BONE_INDEX.Neck].z;
  const zH = rest[BONE_INDEX.Spine].z;
  const bins = new Map();
  for (let i = 0; i < coat.count; i++) {
    const x = coat.pos[i * 3];
    const y = coat.pos[i * 3 + 1];
    const z = coat.pos[i * 3 + 2];
    if (Math.abs(x) > 0.1 || z > zW || z < zH) continue;
    const k = Math.round(z / 0.04);
    bins.set(k, Math.max(bins.get(k) ?? -1, y));
  }
  let best = null;
  for (const [k, y] of bins) {
    // (moyenne glissante sur trois cases : un sommet isolé ne fait pas le creux)
    const m = ((bins.get(k - 1) ?? y) + y + (bins.get(k + 1) ?? y)) / 3;
    if (!best || m < best[1]) best = [k * 0.04, m];
  }
  // Le creux est plat : on prend le milieu de la zone à moins de 1 cm du plus bas.
  const low = [...bins].filter(([k, y]) => y < best[1] + 0.012).map(([k]) => k * 0.04);
  return low.length ? (Math.min(...low) + Math.max(...low)) / 2 : best[0];
}

/** Bout du nez (sommet de la tête le plus loin de la nuque, dans l'axe de l'os de la tête). */
function muzzleTip(coat, poll) {
  let best = null;
  for (let i = 0; i < coat.count; i++) {
    const b = dominant(coat, i);
    if (b !== BONE_INDEX.Head) continue;
    _v.fromArray(coat.pos, i * 3);
    if (Math.abs(_v.x) > 0.05) continue;
    const d = _v.distanceTo(poll);
    if (!best || d > best[0]) best = [d, _v.clone()];
  }
  return best[1];
}

/**
 * Points de la sole de chaque sabot au repos (pince, centre, talons), par rapport au boulet : le jeu
 * vérifie qu'ils ne passent pas sous le sol.
 */
function solesOf(coat, rest) {
  return LEGS.map(([k]) => {
    const b = BONE_INDEX[k + '4'];
    const pts = [];
    for (let i = 0; i < coat.count; i++) {
      if (dominant(coat, i) !== b || coat.pos[i * 3 + 1] > 0.02) continue;
      pts.push(V().fromArray(coat.pos, i * 3));
    }
    const toe = pts.reduce((a, p) => (p.z > a.z ? p : a), pts[0]);
    const heel = pts.reduce((a, p) => (p.z < a.z ? p : a), pts[0]);
    const mid = toe.clone().lerp(heel, 0.5);
    return [toe, mid, heel].map((p) => p.clone().sub(rest[b]).setY(-rest[b].y));
  });
}

/**
 * Mèches de gauche de la masse de la crinière (celles qui passent par-dessus la crête) : en grappes de une à quatre
 * mèches qui se chevauchent, séparées par des vides inégaux, de largeurs et de longueurs très dispersées (une longue
 * par grappe, les autres courtes) et d'un ton propre à chacune ; dans une grappe, chacune un peu au-dessus de la
 * précédente (h : pas de scintillement là où elles se recouvrent). Avant : une par huitième de la crête, à peine
 * décalées, de formes voisines — au téléphone, une rangée régulière de pétales gris (crins clairs) ou de flammes
 * (crins foncés) sous le rouleau. t : place le long de la crête (0 garrot, 1 nuque) ; w : demi-largeur (part de la
 * crête) ; L : longueur sous le bord du rouleau (m) ; v0 : bande de la texture ; tone : ton ; h : écart à la peau (m).
 */
export function leftLocks(n, rng, crestSpan, len0) {
  if (!n) return [];
  const nG = n >= 10 ? 4 : 3;
  const sizes = new Array(nG).fill(1);
  for (let k = nG; k < n; k++) {
    let g = Math.floor(rng() * nG);
    while (sizes[g] >= 4) g = (g + 1) % nG;
    sizes[g]++;
  }
  // (vides inégaux entre les grappes, plus courts aux deux bouts)
  const gaps = Array.from({ length: nG + 1 }, (_, i) => (i === 0 || i === nG ? 0.35 : 0.55) + rng());
  const tot = gaps.reduce((a, b) => a + b, 0);
  const out = [];
  let acc = 0;
  for (let g = 0; g < nG; g++) {
    acc += gaps[g];
    const tc = 0.14 + (acc / tot) * 0.7;
    const sz = sizes[g];
    const lead = Math.floor(rng() * sz);
    // (demi-largeurs 2,1 à 4,2 cm, le plus souvent étroites)
    const ws = Array.from({ length: sz }, () => 0.021 + 0.021 * rng() ** 1.5);
    // (voisines qui se chevauchent : centres écartés de 40 à 65 % de leurs demi-largeurs mises bout à bout)
    const pos = [0];
    for (let k = 1; k < sz; k++) pos.push(pos[k - 1] + (ws[k - 1] + ws[k]) * (0.4 + 0.25 * rng()));
    const mid = pos[sz - 1] / 2;
    for (let k = 0; k < sz; k++) {
      out.push({
        t: tc + (pos[k] - mid) / crestSpan,
        w: ws[k] / crestSpan,
        L: (k === lead ? 0.3 + 0.16 * rng() : 0.12 + 0.14 * rng()) * len0,
        v0: rng() * (1 - LEFT_VSPAN),
        tone: 0.86 + 0.2 * rng(),
        h: 0.003 + 0.002 * k,
      });
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/**
 * Triangles à cheval entre une oreille et la nuque ou le front : la partie du corps (attribut hPart, « flat » dans
 * le shader de la robe : WebGL la prend au DERNIER sommet du triangle) était celle de l'oreille quand ce dernier
 * sommet en était. Ses voisins de la nuque portent la hauteur relative du corps (≈ 1,7 coude), lue alors comme la
 * hauteur sur l'oreille : la pointe noire des oreilles se peignait en triangles noirs nets à la nuque et à la base
 * des oreilles (bai, isabelle, alezan, en basse comme en haute). On fait tourner l'ordre de leurs sommets (même
 * sens, même face) pour que le dernier ne soit pas de l'oreille ; index complet et version réduite.
 */
export function provokeOffEars(prim) {
  if (!prim) return 0;
  const ear = new Uint8Array(prim.count);
  for (let i = 0; i < prim.count; i++) {
    const b = dominant(prim, i);
    ear[i] = b === BONE_INDEX.EarL || b === BONE_INDEX.EarR ? 1 : 0;
  }
  let n = 0;
  for (const idx of [prim.index, prim.lodIndex]) {
    if (!idx) continue;
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t];
      const b = idx[t + 1];
      const c = idx[t + 2];
      if (!ear[c] || (ear[a] && ear[b])) continue;
      // (a, b, c) → (b, c, a) si a n'est pas de l'oreille, sinon (c, a, b) : b n'en est pas
      if (!ear[a]) idx.set([b, c, a], t);
      else idx.set([c, a, b], t);
      n++;
    }
  }
  return n;
}

function dominant(p, i) {
  let b = p.si[i * 4];
  let w = p.sw[i * 4];
  for (let k = 1; k < 4; k++) {
    if (p.sw[i * 4 + k] > w) {
      w = p.sw[i * 4 + k];
      b = p.si[i * 4 + k];
    }
  }
  return b;
}

/**
 * Crins : la texture est rangée en étoile (racines au centre, pointes au bord) : la distance au centre
 * des UV dit où est chaque sommet le long de sa mèche (0 racine, 1 pointe). Crête de l'encolure et
 * attache de la queue : racines des mèches, pour allonger ou raccourcir les crins par race.
 */
function hairInfo(prims, rest) {
  const m = prims.mane;
  const g = new Float32Array(m.count);
  const tail = new Uint8Array(m.count);
  for (let i = 0; i < m.count; i++) {
    const r = Math.hypot(m.uv[i * 2] - 0.5, m.uv[i * 2 + 1] - 0.5);
    const b = dominant(m, i);
    tail[i] = b === BONE_INDEX.Tail1 || b === BONE_INDEX.Tail2 ? 1 : 0;
    g[i] = tail[i] ? smooth(0.04, 0.48, r) : smooth(0.15, 0.5, r);
  }
  // Crête : point le plus haut du pelage le long de l'axe de l'encolure (garrot -> nuque).
  const w = rest[BONE_INDEX.Neck];
  const p = rest[BONE_INDEX.Head];
  const axis = p.clone().sub(w);
  const len = axis.length();
  axis.normalize();
  const up = V(0, axis.z, -axis.y);
  if (up.y < 0) up.negate();
  const crest = [];
  const c = prims.coat;
  for (let k = 0; k <= 20; k++) {
    const t = k / 20;
    const o = w.clone().addScaledVector(axis, len * t);
    let best = null;
    for (let i = 0; i < c.count; i++) {
      _v.fromArray(c.pos, i * 3);
      if (Math.abs(_v.x) > 0.08 || Math.abs(_v.clone().sub(o).dot(axis)) > 0.05) continue;
      const h = _v.clone().sub(o).dot(up);
      if (!best || h > best[0]) best = [h, _v.clone()];
    }
    if (best) crest.push([t, best[1].setX(0)]);
  }
  // Tronçon de la queue (couard) d'où partent les crins : de la racine la plus haute des crins de la queue du
  // GLB (au milieu) jusqu'au bas de la peau du tronçon (sommets du pelage liés à Tail2).
  let dockTop = null;
  for (let i = 0; i < m.count; i++) {
    if (!tail[i] || g[i] > 0.1 || Math.abs(m.pos[i * 3]) > 0.04) continue;
    if (!dockTop || m.pos[i * 3 + 1] > dockTop.y) dockTop = V().fromArray(m.pos, i * 3);
  }
  let dockEnd = null;
  for (let i = 0; i < c.count; i++) {
    if (dominant(c, i) !== BONE_INDEX.Tail2 || Math.abs(c.pos[i * 3]) > 0.06) continue;
    if (!dockEnd || c.pos[i * 3 + 1] < dockEnd.y) dockEnd = V().fromArray(c.pos, i * 3);
  }
  const t2 = rest[BONE_INDEX.Tail2];
  dockTop = (dockTop ?? t2.clone().add(V(0, 0.1, 0.09))).setX(0);
  dockEnd = (dockEnd ?? t2.clone().add(V(0, -0.08, -0.04))).setX(0);
  // (pointe de la queue du GLB : sa longueur, que chaque race allonge ou raccourcit)
  let tailTipY = Infinity;
  for (let i = 0; i < m.count; i++) if (tail[i]) tailTipY = Math.min(tailTipY, m.pos[i * 3 + 1]);
  if (!Number.isFinite(tailTipY)) tailTipY = 0.24;
  return { g, tail, crest, axis, len, origin: w.clone(), dockTop, dockEnd, tailTipY };
}

// ------------------------------------------------------------------ allures reciblées

/**
 * Les clips du GLB animent ses os ; on les traduit une fois en rotations des groupes du jeu (et en
 * position du groupe body pour le rebond). Échantillonnés à 25 images/s, comme ils ont été générés.
 */
function retarget(gltf, toHorse, restW, groupRest, zShift) {
  const scene = gltf.scene;
  const mixer = new THREE.AnimationMixer(scene);
  const bones = RIG.map(([n]) => scene.getObjectByName(n));
  const saved = [];
  scene.traverse((o) => saved.push([o, o.position.clone(), o.quaternion.clone(), o.scale.clone()]));
  const R0inv = restW.map((m) => new THREE.Quaternion().setFromRotationMatrix(m).invert());
  const P0 = restW.map((m) => V().setFromMatrixPosition(m).add(V(0, 0, zShift)));
  const W = new THREE.Matrix4();
  const out = {};
  const qWorld = RIG.map(() => new THREE.Quaternion());
  const pos = V();
  const sc = V();
  for (const clip of gltf.animations) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    const N = Math.max(2, Math.round(clip.duration * 25) + 1);
    const times = new Float32Array(N);
    const quats = RIG.map(() => new Float32Array(N * 4));
    const bodyPos = new Float32Array(N * 3);
    for (let s = 0; s < N; s++) {
      const t = (s / (N - 1)) * clip.duration;
      times[s] = t;
      mixer.setTime(t);
      scene.updateMatrixWorld(true);
      RIG.forEach(([n], j) => {
        W.multiplyMatrices(toHorse, bones[j].matrixWorld).decompose(pos, _q, sc);
        pos.z += zShift;
        // Rotation du groupe dans le repère du cheval : celle de l'os depuis le repos, appliquée au repos du groupe.
        qWorld[j].copy(_q).multiply(R0inv[j]).multiply(groupRest[j]);
        if (n === 'Spine') {
          // Groupe body (origine au sol) : rotation et translation qui amènent l'os du dos du repos à sa pose.
          const rb = _q2.copy(_q).multiply(R0inv[j]);
          const p0 = P0[j].clone().applyQuaternion(rb);
          bodyPos.set([pos.x - p0.x, pos.y - p0.y, pos.z - p0.z], s * 3);
        }
      });
      RIG.forEach(([n], j) => {
        const par = PARENT[n];
        const local = par ? _q2.copy(qWorld[BONE_INDEX[par]]).invert().multiply(qWorld[j]) : qWorld[j];
        // (continuité des quaternions d'une image à l'autre, pour l'interpolation)
        if (s > 0) {
          const o = (s - 1) * 4;
          const q = quats[j];
          if (q[o] * local.x + q[o + 1] * local.y + q[o + 2] * local.z + q[o + 3] * local.w < 0) {
            local.set(-local.x, -local.y, -local.z, -local.w);
          }
        }
        quats[j].set([local.x, local.y, local.z, local.w], s * 4);
      });
    }
    const tracks = [new THREE.VectorKeyframeTrack('gSpine.position', times, bodyPos)];
    RIG.forEach(([n], j) => {
      // Os immobiles par rapport à leur parent (crinière, côtes) : pas de piste (le jeu les anime).
      if (n.startsWith('Mane') || n === 'Ribs') return;
      tracks.push(new THREE.QuaternionKeyframeTrack(`g${n}.quaternion`, times, quats[j]));
    });
    out[clip.name] = new THREE.AnimationClip(clip.name, clip.duration, tracks);
    action.stop();
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(scene);
  // remet le GLB d'origine au repos
  for (const [o, p, q, s] of saved) {
    o.position.copy(p);
    o.quaternion.copy(q);
    o.scale.copy(s);
  }
  scene.updateMatrixWorld(true);
  return out;
}

// ------------------------------------------------------------------ proportions de race

/**
 * Géométrie d'une race (gabarit B) : chaque os déforme ses sommets (tronc plus ou moins large et
 * profond, dos plus ou moins long, membres plus longs et plus fins, encolure, tête, queue), mélangés
 * selon les poids de la peau ; les articulations suivent. Les sabots restent posés au sol.
 */
export function deformer(base, B) {
  const N = NATIVE_BUILD;
  const r = (k) => (B[k] ?? 1) / (N[k] ?? 1);
  const rest = base.rest;
  const J = (n) => rest[BONE_INDEX[n]];
  const gx = r('girth');
  // Profondeur du tronc : moins liée à sa largeur qu'avant (girth^0,6 : un pur-sang au tronc étroit avait aussi une
  // poitrine de poulain, 0,43 du garrot au lieu de 0,50) ; B.depth la règle à part (poulain : tronc peu profond).
  const gy = r('girth') ** GIRTH_DEPTH * (B.depth ?? 1);
  const rb = r('back');
  const rl = r('legs');
  const bone = r('bone');
  const hoof = bone ** 0.85;
  const croup = r('croup');
  const elbowY = (J('FL2').y + J('FR2').y) / 2;
  const yA = elbowY;
  const yA2 = elbowY * rl;
  const zSeat = -0.075;
  const zHip = J('Spine').z;
  // Tronc (et épaules, hanches, attache de la queue) : largeur, profondeur ancrée à la hauteur des
  // coudes (qui suit la longueur des membres), longueur du dos autour de la selle, croupe.
  // Ligne du dessus sculptée (le modèle d'origine, un cheval de trait, n'a pas de garrot et a le dos ensellé) :
  // bosse étroite du garrot derrière la base de l'encolure, creux du dos comblé juste derrière (devant la selle).
  // Seulement le haut du tronc, près de la ligne du dessus (les articulations, plus bas, ne bougent pas).
  const zW = J('Neck').z - TOPLINE.behind;
  const yTop = elbowY + TOPLINE.from;
  const sculpt = (p) => {
    const hi = smooth(yTop, yTop + 0.16, p.y);
    if (hi <= 0) return 0;
    const dzW = (p.z - zW) / TOPLINE.wLen;
    const dzF = (p.z - zW + TOPLINE.fillAt) / TOPLINE.fLen;
    return hi * (TOPLINE.withers * Math.exp(-dzW * dzW - (p.x / 0.11) ** 2) + TOPLINE.fill * Math.exp(-dzF * dzF - (p.x / 0.2) ** 2));
  };
  const trunk = (p, o) => {
    const rear = smooth(zHip + 0.38, zHip - 0.05, p.z);
    const kx = gx * (1 + (croup - 1) * 0.8 * rear);
    const ky = gy * (1 + (croup - 1) * 0.35 * rear);
    return o.set(p.x * kx, yA2 + (p.y + sculpt(p) - yA) * ky, zSeat + (p.z - zSeat) * rb);
  };
  const affine = (head, newHead, lin) => (p, o) => o.copy(p).sub(head).applyMatrix3(lin).add(newHead);
  const along = (a, f, t) => {
    // f le long de a, t en travers
    const m = new THREE.Matrix3();
    const e = m.elements;
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        const aa = a.getComponent(i) * a.getComponent(j);
        e[j * 3 + i] = (i === j ? t : 0) + (f - t) * aa;
      }
    }
    return m;
  };
  const maps = new Array(RIG.length);
  const heads = new Array(RIG.length);
  for (const n of TRUNK) maps[BONE_INDEX[n]] = trunk;
  // Membres : sous le coude (ou le grasset), avant-bras et canon s'allongent pour que le sabot reste au sol.
  for (const [k, front] of LEGS) {
    const j1 = J(k + '1');
    const j2 = J(k + '2');
    const j3 = J(k + '3');
    const j4 = J(k + '4');
    const sole = j4.clone();
    sole.y = 0;
    // (pied de l'os du sabot : sous le boulet, au sol)
    const s2 = trunk(j2, V());
    const f = (s2.y - j4.y * hoof) / (j2.y - j4.y);
    const s3 = s2.clone().addScaledVector(j3.clone().sub(j2), f);
    const s4 = s3.clone().addScaledVector(j4.clone().sub(j3), f);
    const t2 = Math.sqrt(gx * bone) * (front ? 1 : 1.03);
    heads[BONE_INDEX[k + '1']] = trunk(j1, V());
    heads[BONE_INDEX[k + '2']] = s2;
    heads[BONE_INDEX[k + '3']] = s3;
    heads[BONE_INDEX[k + '4']] = s4;
    maps[BONE_INDEX[k + '2']] = affine(j2, s2, along(j3.clone().sub(j2).normalize(), f, t2));
    maps[BONE_INDEX[k + '3']] = affine(j3, s3, along(j4.clone().sub(j3).normalize(), f, bone));
    maps[BONE_INDEX[k + '4']] = affine(j4, s4, new THREE.Matrix3().multiplyScalar(hoof));
    void sole;
  }
  // Encolure : longueur et épaisseur, raccordée en douceur au tronc à sa base.
  const w0 = J('Neck');
  const w1 = trunk(w0, V());
  const nAxis = J('Head').clone().sub(w0);
  const nLen = nAxis.length();
  nAxis.normalize();
  const neckLin = affine(w0, w1, along(nAxis, r('neck'), r('neckW')));
  const tmpA = V();
  const tmpB = V();
  const neck = (p, o) => {
    const t = p.clone().sub(w0).dot(nAxis) / nLen;
    const s = smooth(0.06, 0.38, t);
    trunk(p, tmpA);
    neckLin(p, tmpB);
    return o.copy(tmpA).lerp(tmpB, s);
  };
  maps[BONE_INDEX.Neck] = neck;
  for (let i = 1; i <= 4; i++) maps[BONE_INDEX['Mane' + i]] = neck;
  const poll = J('Head');
  const poll2 = neckLin(poll, V());
  const rh = r('head');
  const headLin = affine(poll, poll2, new THREE.Matrix3().multiplyScalar(rh));
  const prof = headProfile(base, B.profile);
  // (poulain : chanfrein court, front bombé, petit bout du nez — après le profil de la race)
  const foal = B.foalHead ? headProfile(base, 'foal') : null;
  const tmpP = V();
  const tmpF = V();
  maps[BONE_INDEX.Head] = prof && foal ? (p, o) => headLin(foal(prof(p, tmpP), tmpF), o)
    : prof || foal ? (p, o) => headLin((prof || foal)(p, tmpP), o) : headLin;
  // Oreilles : un peu plus petites chez les poneys (B.ears ; Shetland : de petites oreilles dans un gros toupet,
  // pas les oreilles d'un cheval sur une tête de poney)
  const re = rh ** 0.6 * (B.ears ?? 1);
  for (const e of ['EarL', 'EarR']) {
    const h = J(e);
    const h2 = maps[BONE_INDEX.Head](h, V());
    maps[BONE_INDEX[e]] = affine(h, h2, new THREE.Matrix3().multiplyScalar(re));
    heads[BONE_INDEX[e]] = h2;
  }
  // Queue : le tronçon qui pend s'allonge ou se raccourcit (les crins suivent).
  const d0 = J('Tail2');
  const d1 = trunk(d0, V());
  const tAxis = V(0, -1, -0.15).normalize();
  maps[BONE_INDEX.Tail2] = affine(d0, d1, along(tAxis, 1, Math.sqrt(gx)));
  heads[BONE_INDEX.Spine] = trunk(J('Spine'), V());
  heads[BONE_INDEX.Ribs] = trunk(J('Ribs'), V());
  heads[BONE_INDEX.Neck] = w1;
  heads[BONE_INDEX.Head] = poll2;
  for (let i = 1; i <= 4; i++) heads[BONE_INDEX['Mane' + i]] = neck(J('Mane' + i), V());
  heads[BONE_INDEX.Tail1] = trunk(J('Tail1'), V());
  heads[BONE_INDEX.Tail2] = d1;
  // (longueur de la tête, nuque → bout du nez, raccourcie chez le poulain : voir headProfile 'foal')
  const snout = foal ? FOAL_FACE.at + (1 - FOAL_FACE.at) * FOAL_FACE.face : 1;
  return { maps, heads, scale: { gx, gy, rb, rl, bone, hoof, head: rh, yA2, snout } };
}

/**
 * Profil de tête de la race, sculpté dans le repère de la tête du GLB (x en travers, y vers le front,
 * z de la nuque au bout du nez ; unités : longueur de la tête). Le modèle d'origine a le chanfrein
 * droit (ligne du dessus à y ≈ 0,2) : 'convex' (busqué : PRE, lusitanien) bosse sur le chanfrein ;
 * 'dish' (arabe, welsh) creux entre les yeux et les naseaux, front bombé, bout du nez plus fin ;
 * 'square' (camargue) ganaches plus larges, bout du nez massif. Renvoie null pour une tête droite.
 */
/** Tête de poulain (headProfile 'foal') : face raccourcie au-delà de at (× face), front bombé (dome, longueur de la tête). */
const FOAL_FACE = { at: 0.4, face: 0.8, dome: 0.035 };

function headProfile(base, kind) {
  if (!kind || kind === 'straight' || !base.snout) return null;
  const poll = base.rest[BONE_INDEX.Head];
  const L = base.snout.distanceTo(poll);
  const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), base.headTilt);
  const qi = q.clone().invert();
  const h = V();
  const bump = (z, a, b) => {
    const t = Math.min(1, Math.max(0, (z - a) / (b - a)));
    return Math.sin(Math.PI * t) ** 2;
  };
  const ridge = (x, w) => Math.exp(-((x / w) ** 2));
  return (p, o) => {
    h.copy(p).sub(poll).applyQuaternion(qi).multiplyScalar(1 / L);
    const { x, y, z } = h;
    const top = smooth(0.0, 0.15, y); // dessus de la tête (chanfrein, front)
    if (kind === 'convex') {
      h.y += 0.045 * bump(z, 0.3, 0.92) * top * ridge(x, 0.2);
    } else if (kind === 'dish') {
      h.y += -0.07 * bump(z, 0.32, 0.9) * top * ridge(x, 0.22) + 0.025 * bump(z, 0.06, 0.4) * smooth(0.05, 0.17, y) * ridge(x, 0.18);
      const m = smooth(0.7, 0.98, z);
      h.x *= 1 - 0.1 * m;
      h.y = 0.02 + (h.y - 0.02) * (1 - 0.07 * m);
    } else if (kind === 'foal') {
      // Poulain : la face (au-delà de FOAL_FACE.at) raccourcie, front bombé entre les yeux, bout du nez plus petit.
      if (z > FOAL_FACE.at) h.z = FOAL_FACE.at + (z - FOAL_FACE.at) * FOAL_FACE.face;
      h.y += FOAL_FACE.dome * bump(z, 0.04, 0.5) * smooth(0.02, 0.15, y) * ridge(x, 0.24);
      const m = smooth(0.55, 0.95, z);
      h.x *= 1 - 0.1 * m;
      h.y = 0.02 + (h.y - 0.02) * (1 - 0.08 * m);
    } else if (kind === 'square') {
      h.y -= 0.012 * bump(z, 0.4, 0.86) * top * ridge(x, 0.2);
      h.x *= 1 + 0.15 * bump(z, 0.05, 0.6) * smooth(0.02, -0.2, y);
      const m = smooth(0.68, 0.95, z);
      h.x *= 1 + 0.1 * m;
      h.y = 0.02 + (h.y - 0.02) * (1 + 0.07 * m);
    }
    return o.copy(h).multiplyScalar(L).applyQuaternion(q).add(poll);
  };
}

/** Applique le déformeur à une primitive : positions et normales mélangées selon les poids de la peau. */
function deformPrim(p, D) {
  const n = p.count;
  const pos = new Float32Array(n * 3);
  const nrm = new Float32Array(n * 3);
  const P = V();
  const o = V();
  const acc = V();
  const J = new THREE.Matrix3();
  const e = 0.002;
  const cols = [V(), V(), V()];
  const ax = [V(e, 0, 0), V(0, e, 0), V(0, 0, e)];
  const evalAt = (q, i, out) => {
    out.set(0, 0, 0);
    for (let k = 0; k < 4; k++) {
      const w = p.sw[i * 4 + k];
      if (w <= 0) continue;
      D.maps[p.si[i * 4 + k]](q, o);
      out.addScaledVector(o, w);
    }
    return out;
  };
  const qa = V();
  const qb = V();
  const ra = V();
  const rbv = V();
  for (let i = 0; i < n; i++) {
    P.fromArray(p.pos, i * 3);
    evalAt(P, i, acc);
    pos.set([acc.x, acc.y, acc.z], i * 3);
    for (let k = 0; k < 3; k++) {
      evalAt(qa.copy(P).add(ax[k]), i, ra);
      evalAt(qb.copy(P).sub(ax[k]), i, rbv);
      cols[k].subVectors(ra, rbv).multiplyScalar(1 / (2 * e));
    }
    J.set(cols[0].x, cols[1].x, cols[2].x, cols[0].y, cols[1].y, cols[2].y, cols[0].z, cols[1].z, cols[2].z);
    J.invert().transpose();
    P.fromArray(p.nrm, i * 3).applyMatrix3(J).normalize();
    nrm.set([P.x, P.y, P.z], i * 3);
  }
  return { pos, nrm };
}

/** Hauteur minimale du bout de la queue au repos (cheval de taille 1). */
export const TAIL_CLEAR = 0.1;

// ------------------------------------------------------------------ crins en cartes (crinière, toupet, queue)
//
// Les crins du GLB (volumes pleins : plaque de caoutchouc sur l'encolure, perruque sur le front, queue en
// sac) sont remplacés par des cartes de crins : des rubans de quelques points, posés par la pesanteur sur la
// peau de la race (sans y entrer), texture de crins droits (horseHair.js). Géométrie partagée par les chevaux
// d'un même gabarit (ton gris par sommet, couleur dans la matière de chaque cheval) ; mèches « principales »
// d'abord, seules gardées par la version réduite (un ruban sur deux).

/**
 * Longueur de la crinière (cheval de taille 1) d'un cheval de selle au style normal, et par style : facteur de
 * longueur et de nombre de mèches ('long' : rideau ondulé des baroques ; 'thick' : épaisse, plus de mèches, en
 * partie de l'autre côté ; 'short' : courte et un peu dressée, Akhal-Teké). Toupet : part de la longueur de la
 * tête. (34 cm : une crinière de cheval de selle qui tombe sur l'encolure ; à 24 cm, recourbée par la pesanteur,
 * elle ne pendait que de 10 cm et se lisait comme une crête de lamelles.) MANE_MAX : borne de la plus longue.
 */
const MANE_LEN = 0.34;
const MANE_MAX = 0.62;
const MANE_STYLE = {
  normal: { len: 1, n: 1, lift: 0.3, other: 0 },
  long: { len: 1.3, n: 1.1, lift: 0.22, other: 0.22 },
  thick: { len: 1.05, n: 1.2, lift: 0.3, other: 0.25 },
  short: { len: 0.42, n: 0.85, lift: 0.65, other: 0 },
};
const FORELOCK = { normal: 0.46, long: 0.56, thick: 0.48, short: 0.26, brush: 0.26, foal: 0.18 };
/**
 * Crins « en volume » (masse + cartes) : une masse lissée liée au squelette (rouleau de la crinière, mèche du toupet,
 * fuseau de la queue) donne le volume et la silhouette, peinte en crins (bande du bas de la texture) ; les cartes,
 * moins nombreuses (part du nombre d'avant), font les bords et les pointes qui bougent. MANE_ROLL : épaisseur du
 * rouleau sur la crête (m, cheval de taille 1) ; MANE_MASS_LEN : longueur de la nappe (part de la crinière) ;
 * MANE_LEFT : part des mèches qui passent à gauche ; LEFT_TAPER : resserrement des mèches de la masse qui passent à
 * gauche vers leur pointe (1 : une pointe ; moins : elles finissent en crins de longueurs inégales, par la texture) ;
 * LEFT_VSPAN : part de la hauteur de la bande de la masse sur la largeur d'une de ces mèches ; FORE_MASS_W : largeur de
 * la masse du toupet (part de celle du V de ses cartes, qui en font les bords) ; FORE_THICK : épaisseur du toupet sous les oreilles ;
 * TAIL_DEPTH : épaisseur d'avant en arrière du fuseau (part de sa largeur) ; TAIL_MASS_LEN : longueur du fuseau
 * (part de la queue sous le tronçon) ; TAIL_RINGS × TAIL_AROUND : anneaux et points par anneau ; PLUME_WIDTH : largeur en
 * plus, de côté, d'une queue portée haut (× tailSet : panache de l'arabe).
 */
const MANE_CARDS = 0.52;
const MANE_LEFT = 0.2;
const MANE_ROLL = 0.055;
const LEFT_TAPER = 0.7;
const LEFT_VSPAN = 0.45;
const MANE_MASS_LEN = 0.8;
const FORE_CARDS = 0.55;
const FORE_THICK = 0.02;
const FORE_MASS_W = 0.8;
const TAIL_CARDS = 0.62;
const TAIL_DEPTH = 0.8;
const TAIL_WIDTH = 0.13;
const PLUME_WIDTH = 0.45;
const TAIL_MASS_LEN = 0.95;
const TAIL_RINGS = 18;
const TAIL_AROUND = 20;
/** Rangées de la texture des crins (une mèche différente par quart de la hauteur) : [v du milieu, demi-hauteur]. */
const HAIR_ROWS = [0, 1, 2, 3].map((k) => [(k + 0.5) / 4, 0.117]);

/** Poids de peau [[os, poids]…] : les quatre plus forts, de somme 1. */
function topWeights(map) {
  const list = [...map.entries()].filter(([, w]) => w > 1e-4).sort((a, b) => b[1] - a[1]).slice(0, 4);
  const s = list.reduce((a, [, w]) => a + w, 0) || 1;
  return list.map(([b, w]) => [b, w / s]);
}

/** Mélange de deux listes de poids (t : part de b). */
function blendWeights(a, b, t) {
  const m = new Map();
  for (const [k, w] of a) m.set(k, (m.get(k) ?? 0) + w * (1 - t));
  for (const [k, w] of b) m.set(k, (m.get(k) ?? 0) + w * t);
  return topWeights(m);
}

/** Poids de peau du sommet du pelage le plus proche de p parmi ceux de la liste. */
function skinNear(pos, prim, list, p) {
  let best = list[0] ?? 0;
  let bd = Infinity;
  for (const i of list) {
    const dx = pos[i * 3] - p.x;
    const dy = pos[i * 3 + 1] - p.y;
    const dz = pos[i * 3 + 2] - p.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  const m = new Map();
  for (let k = 0; k < 4; k++) {
    const w = prim.sw[best * 4 + k];
    if (w > 0) m.set(prim.si[best * 4 + k], (m.get(prim.si[best * 4 + k]) ?? 0) + w);
  }
  return topWeights(m);
}

/**
 * Corps du cheval pour poser les crins (repère du cheval, au repos) : distance approchée à la peau, négative
 * dedans — réunion du tronc (S.measure.torso), de l'encolure (coupes perpendiculaires à son axe, du garrot à
 * la nuque) et de la tête (S.measure.head). body.grad(p, out) : direction vers l'extérieur (différences finies).
 */
function hairBody(S, pos, coat, base) {
  const heads = S.heads;
  const O = heads[BONE_INDEX.Neck];
  const ez = heads[BONE_INDEX.Head].clone().sub(O);
  const len = ez.length();
  ez.normalize();
  const ey = V(0, ez.z, -ez.y);
  if (ey.y < 0) ey.negate();
  const neckB = new Set(['Neck', 'Mane1', 'Mane2', 'Mane3', 'Mane4'].map((n) => BONE_INDEX[n]));
  const isN = new Uint8Array(coat.count);
  for (let i = 0; i < coat.count; i++) isN[i] = neckB.has(dominant(coat, i)) ? 1 : 0;
  const tris = [];
  const idx = coat.index;
  for (let t = 0; t < idx.length; t += 3) {
    if (isN[idx[t]] + isN[idx[t + 1]] + isN[idx[t + 2]] >= 2) tris.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const toNeck = (p) => {
    const dy = p.y - O.y;
    const dz = p.z - O.z;
    return V(p.x, dy * ey.y + dz * ey.z, dy * ez.y + dz * ez.z);
  };
  // (jusqu'un peu avant la nuque : au-delà, les dernières coupes, larges de la ganache, couvraient le front et
  // le toupet s'y décollait de la tête ; la tête a sa propre forme)
  const neck = sections(pos, tris, toNeck, 0.02, len - 0.05, 0.03);
  const poll = heads[BONE_INDEX.Head];
  const hq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), base.headTilt).invert();
  const torso = S.measure.torso;
  const head = S.measure.head;
  const h = V();
  // (derrière la nuque, la tête laisse la place à l'encolure : ses premières coupes, perpendiculaires au chanfrein,
  // coupent la crête en biais, et son bout arrière est un plan — près de lui, la « peau » de la tête regardait vers
  // l'arrière et le sol ; les crins posés là, écartés de la peau dans ce sens, se repliaient sous le rouleau, normales
  // tournées vers le sol : à la nuque, une tache vert sombre sur les crinières claires. Au-delà de HB derrière la
  // nuque, la distance à la tête croît vite (en douceur) et l'encolure, mesurée jusque-là, l'emporte.)
  const HB = -0.1 * S.headLen;
  const headD = (x, y, z) => head(x, y, z) + 6 * Math.max(0, HB - z) ** 2;
  const f = (p) => {
    const dy = p.y - O.y;
    const dz = p.z - O.z;
    h.copy(p).sub(poll).applyQuaternion(hq);
    return Math.min(torso(p.x, p.y, p.z), neck(p.x, dy * ey.y + dz * ey.z, dy * ez.y + dz * ez.z), headD(h.x, h.y, h.z));
  };
  f.grad = gradOf(f, V(0, 1, 0));
  return f;
}

/** Direction vers l'extérieur d'une distance approchée f (différences finies avant : 3 évaluations de plus). */
function gradOf(f, fallback) {
  const q = V();
  return (p, out, f0 = f(p)) => {
    const e = 0.004;
    out.set(f(q.copy(p).setX(p.x + e)) - f0, f(q.copy(p).setY(p.y + e)) - f0, f(q.copy(p).setZ(p.z + e)) - f0);
    if (out.lengthSq() < 1e-12) out.copy(fallback);
    return out.normalize();
  };
}

/**
 * Arrière du cheval vu de côté : pour chaque hauteur, le z le plus en arrière du pelage (fesses, cuisses,
 * jarrets ; sans le tronçon de la queue) à moins de 25 cm du milieu. La queue pend derrière.
 */
function rearProfile(pos, coat) {
  const dy = 0.02;
  const n = Math.ceil(2.4 / dy);
  const zmin = new Float32Array(n).fill(Infinity);
  const skip = new Uint8Array(coat.count);
  for (let i = 0; i < coat.count; i++) {
    const b = dominant(coat, i);
    skip[i] = b === BONE_INDEX.Tail1 || b === BONE_INDEX.Tail2 ? 1 : 0;
  }
  const idx = coat.index;
  for (let t = 0; t < idx.length; t += 3) {
    if (skip[idx[t]] || skip[idx[t + 1]] || skip[idx[t + 2]]) continue;
    for (let e = 0; e < 3; e++) {
      const a = idx[t + e];
      const b = idx[t + (e + 1) % 3];
      const ya = pos[a * 3 + 1];
      const yb = pos[b * 3 + 1];
      const k0 = Math.max(0, Math.ceil(Math.min(ya, yb) / dy));
      const k1 = Math.min(n - 1, Math.floor(Math.max(ya, yb) / dy));
      for (let k = k0; k <= k1; k++) {
        const u = ya === yb ? 0 : (k * dy - ya) / (yb - ya);
        const x = pos[a * 3] + (pos[b * 3] - pos[a * 3]) * u;
        if (Math.abs(x) > 0.25) continue;
        const z = pos[a * 3 + 2] + (pos[b * 3 + 2] - pos[a * 3 + 2]) * u;
        if (z < zmin[k]) zmin[k] = z;
      }
    }
  }
  return (y) => {
    const f = Math.min(n - 1.001, Math.max(0, y / dy));
    const k = Math.floor(f);
    return Math.min(zmin[k], zmin[k + 1]);
  };
}

/** Points d'une ligne brisée, régulièrement espacés le long d'elle (n points, bouts compris). */
function resample(pts, n) {
  const acc = [0];
  for (let i = 1; i < pts.length; i++) acc.push(acc[i - 1] + pts[i].distanceTo(pts[i - 1]));
  const total = acc[acc.length - 1];
  const out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (total * k) / (n - 1);
    while (j < pts.length - 2 && acc[j + 1] < s) j++;
    const seg = acc[j + 1] - acc[j];
    const u = seg > 1e-9 ? Math.min(1, Math.max(0, (s - acc[j]) / seg)) : 0;
    out.push(pts[j].clone().lerp(pts[j + 1], u));
  }
  return out;
}

/**
 * Une mèche posée par la pesanteur : partie de root dans la direction d0, elle se courbe vers le bas (rayon
 * ≈ bend) et glisse sur la peau sans y entrer (au moins h de la peau, distance body) ; posée sur une peau
 * tournée vers le haut (front, côté de l'encolure), elle y reste couchée (à moins de stick au-dessus, elle y
 * est ramenée d'autant plus que la peau regarde vers le haut), et pend librement sous une peau tournée vers le
 * bas. keep(p) : contrainte de plus après chaque pas (arrière-main pour la queue). floor : la mèche s'arrête à
 * cette hauteur. Renvoie np points régulièrement espacés de la racine à la pointe.
 */
function drape(body, root, d0, L, { h = 0.006, bend = 0.06, np = 5, steps = 12, keep = null, floor = -Infinity, stick = 0, grav = null } = {}) {
  const ds = L / steps;
  const g = grav ?? V(0, -1, 0);
  const d = d0.clone().normalize();
  const p = root.clone();
  const prev = V();
  const gr = V();
  const pts = [root.clone()];
  for (let k = 0; k < steps; k++) {
    d.addScaledVector(g, ds / bend).normalize();
    prev.copy(p);
    p.addScaledVector(d, ds);
    for (let it = 0; it < 4; it++) {
      const dist = body(p);
      if (dist >= h) {
        if (stick && it === 0 && dist < h + stick) {
          body.grad(p, gr, dist);
          if (gr.y > 0.1) p.addScaledVector(gr, -(dist - h) * Math.min(1, gr.y * 1.5));
        }
        break;
      }
      p.addScaledVector(body.grad(p, gr, dist), h - dist + 1e-4);
    }
    keep?.(p, h);
    if (p.y < floor) {
      // (pointe à la hauteur limite : le dernier pas coupé là)
      const u = (prev.y - floor) / Math.max(1e-6, prev.y - p.y);
      pts.push(prev.clone().lerp(p, Math.min(1, Math.max(0, u))));
      break;
    }
    d.subVectors(p, prev);
    if (d.lengthSq() < 1e-12) d.set(0, -1, 0);
    d.normalize();
    pts.push(p.clone());
  }
  return resample(pts, np);
}

/** Direction le long d'une mèche au point i (différence des voisins). */
const alongAt = (pts, i) => pts[Math.min(pts.length - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize();

/** Ruban à plat sur la peau : en travers de la mèche, tangent à la surface (tourné un peu au hasard). */
function cardSide(n, along, twist) {
  const s = V().crossVectors(n, along);
  if (s.lengthSq() < 1e-8) s.set(0, 0, 1);
  return s.normalize().applyAxisAngle(n, twist);
}

/** Ton gris (couleur par sommet des cartes partagées : la couleur des crins est dans la matière de chaque cheval). */
const grey = (t) => new THREE.Color(t, t, t);

/**
 * Écarte de la peau (distance approchée sdf, au moins h) les points d'une carte dont un bord y entre (creux de
 * l'encolure devant le garrot, front, tronçon de la queue) ; keep : contrainte de plus sur les bords (arrière-main
 * pour la queue). La carte reste à plat : son milieu suit le bord qui sort.
 */
function pushCardOut(card, sdf, h, keep = null) {
  const q = V();
  const g = V();
  const n = card.pts.length;
  for (let i = 1; i < n; i++) {
    const p = card.pts[i];
    const half = (card.w0 + (card.w1 - card.w0) * (i / (n - 1))) / 2;
    for (let it = 0; it < 2; it++) {
      let moved = false;
      for (const k of [-1, 1]) {
        q.copy(p).addScaledVector(card.side, half * k);
        const d = sdf(q);
        if (d < h) {
          p.addScaledVector(sdf.grad(q, g, d), h - d);
          moved = true;
          q.copy(p).addScaledVector(card.side, half * k);
        }
        if (keep) {
          const z0 = q.z;
          keep(q, h);
          if (q.z !== z0) {
            p.z += q.z - z0;
            moved = true;
          }
        }
      }
      if (!moved) break;
    }
  }
}

/**
 * Crinière « en volume » (masse + cartes) : une masse lissée liée au squelette — un rouleau sur la crête, qui retombe
 * du côté droit (−x) en une nappe posée sur l'encolure — donne le volume et la silhouette ; quelques mèches de la
 * masse passent par-dessus la crête et tombent à gauche, effilées en pointe ; les cartes, posées sur la masse (et
 * dans le rouleau près de la crête : jamais au-dessus de sa silhouette), font les bords et les pointes qui bougent.
 * Longueur selon le gabarit (B.mane) et le style, plus courte au garrot et vers la nuque ; ondulée si longue. Racines
 * liées à la peau de la crête, pointes aux os de la crinière (Mane1-4 : elle pend quand l'encolure descend). Rien
 * pour une brosse (Fjord, poulain : brushCards).
 */
function maneCards(S, B, body, pos, coat) {
  const style = B.maneStyle;
  if (style === 'brush' || style === 'foal') return { main: [], fill: [], mass: [] };
  const st = MANE_STYLE[style] ?? MANE_STYLE.normal;
  const rng = mulberry(4111);
  const heads = S.heads;
  const O = heads[BONE_INDEX.Neck];
  const ez = heads[BONE_INDEX.Head].clone().sub(O).normalize();
  const crest = S.crest;
  const at = (t) => {
    const k = Math.min(crest.length - 2, Math.max(0, Math.floor(t * (crest.length - 1))));
    return crest[k][1].clone().lerp(crest[k + 1][1], t * (crest.length - 1) - k);
  };
  // Racines : poids de la peau de la crête (encolure, garrot, nuque).
  const crestB = new Set(['Neck', 'Mane1', 'Mane2', 'Mane3', 'Mane4', 'Spine', 'Head'].map((nm) => BONE_INDEX[nm]));
  const near = [];
  for (let i = 0; i < coat.count; i++) if (Math.abs(pos[i * 3]) < 0.07 && crestB.has(dominant(coat, i))) near.push(i);
  // Pointes : les deux os de la crinière les plus proches le long de l'encolure.
  const mb = [1, 2, 3, 4].map((k) => BONE_INDEX['Mane' + k]);
  const ms = mb.map((b) => heads[b].clone().sub(O).dot(ez));
  const tipW = (s) => {
    if (s <= ms[0]) return [[mb[0], 1]];
    for (let k = 0; k < 3; k++) {
      if (s <= ms[k + 1]) {
        const u = (s - ms[k]) / (ms[k + 1] - ms[k]);
        return topWeights(new Map([[mb[k], 1 - u], [mb[k + 1], u]]));
      }
    }
    return [[mb[3], 1]];
  };
  // (poids d'une mèche dont la racine est en root : la peau de la crête, puis de plus en plus les os de la crinière)
  const lockWeights = (root, f0 = 0, f1 = 0.3) => {
    const wR = skinNear(pos, coat, near, root);
    const wT = blendWeights(tipW(root.clone().sub(O).dot(ez)), wR, 0.15);
    return (f) => blendWeights(wR, wT, smooth(f0, f1, f));
  };
  // (moins de mèches qu'avant : la masse fait le volume, les cartes les bords et les pointes qui bougent)
  const n = Math.round(Math.min(120, Math.max(72, 96 * (B.maneN ?? 1) * st.n)) * MANE_CARDS);
  const len0 = Math.min(MANE_MAX, MANE_LEN * (B.mane ?? 1) * st.len);
  // (plus courte au garrot et à la nuque, où passe la têtière)
  const prof = (t) => 0.4 + 0.6 * smooth(0, 0.22, t) * (1 - 0.45 * smooth(0.82, 1, t));
  const frameAt = (t) => {
    const c = at(t);
    const dir = at(Math.min(1, t + 0.03)).sub(at(Math.max(0, t - 0.03))).normalize();
    const up = V(0, dir.z, -dir.y).normalize();
    if (up.y < 0) up.negate();
    return { t, c, dir, up };
  };

  // ---- Masse : un rouleau sur la crête, qui retombe du côté droit en une nappe épaisse posée sur l'encolure et
  // déborde à gauche (vue de gauche, le côté qu'on voit le plus, la crinière se lit en un bourrelet de crins au-dessus
  // de la crête, pas en liseré). Champ de distance « corps + épaisseur » : la peau, gonflée de l'épaisseur de la
  // crinière (rouleau de T0 sur la crête ; à gauche, rien à 6,5 cm sous la crête ; à droite, de moins en moins vers le
  // bas de la nappe ; rien aux deux bouts). Les mèches de la masse s'y posent par la même pesanteur (drape).
  const T0 = MANE_ROLL * Math.sqrt(B.mane ?? 1) * ({ long: 1.1, thick: 1.25, short: 0.6 }[style] ?? 1) * Math.sqrt(S.D.scale.gx ?? 1);
  const NT = 48;
  const ct = [];
  for (let k = 0; k < NT; k++) ct.push(frameAt(k / (NT - 1)));
  // (le rouleau s'amincit au garrot et vers la nuque : sous la têtière, il ne monte plus entre les oreilles)
  const env = (t) => smooth(0.0, 0.07, t) * (1 - smooth(0.8, 0.95, t));
  const fr = { t: 0, c: V(), up: V(), dir: V() };
  const fa = V();
  const fb = V();
  // (cadre de la crête le plus proche de p, dans le plan y-z : la crête est sur la ligne du dessus)
  const frameNear = (p) => {
    let best = 0;
    let bd = Infinity;
    for (let k = 0; k < NT; k++) {
      const d = (ct[k].c.y - p.y) ** 2 + (ct[k].c.z - p.z) ** 2;
      if (d < bd) {
        bd = d;
        best = k;
      }
    }
    const a = ct[Math.max(0, best - 1)];
    const b = ct[Math.min(NT - 1, best + 1)];
    const ab = fa.subVectors(b.c, a.c);
    const u = Math.min(1, Math.max(0, fb.subVectors(p, a.c).dot(ab) / Math.max(1e-9, ab.lengthSq())));
    fr.t = a.t + (b.t - a.t) * u;
    fr.c.copy(a.c).lerp(b.c, u);
    fr.up.copy(a.up).lerp(b.up, u).normalize();
    fr.dir.copy(a.dir).lerp(b.dir, u).normalize();
    return fr;
  };
  let crestSpan = 0;
  for (let k = 1; k < NT; k++) crestSpan += ct[k].c.distanceTo(ct[k - 1].c);
  // (bord gauche du rouleau : 9,5 cm sous la crête le long de la peau, en pointes — texture)
  const LEFT = 0.095;
  // (nappe de droite : 80 % de la crinière, inégale d'une mèche à l'autre — un bas irrégulier, pas coupé droit)
  const lockN = Math.max(8, crestSpan / 0.065);
  const lockLen = (t) => 1 + 0.1 * Math.sin(t * lockN * 2.1 + 1.3) + 0.07 * Math.sin(t * lockN * 1.3 + 4.1);
  const rightLen = (t) => MANE_MASS_LEN * len0 * prof(t) * lockLen(t);
  // (mèches de la masse en travers de la crête : un relief de 6,5 cm de période, bombé dehors)
  const rip = (t) => Math.sin(t * lockN * 6.283 + 0.7);
  const dq = V();
  // (hauteur sous la crête le long de la verticale de la crête, et épaisseur de la crinière en p)
  const below = (p, F) => dq.subVectors(F.c, p).dot(F.up);
  const thick = (p) => {
    const F = frameNear(p);
    const dy = below(p, F);
    const D = rightLen(F.t);
    const gR = (1 - 0.45 * smooth(0, 0.1, dy)) * (1 - 0.7 * smooth(0.5 * D, D, dy));
    // (à gauche, un rouleau plein qui retombe en arrondi, pas un biseau : épais jusqu'à mi-hauteur)
    const gL = 1 - smooth(0.02, LEFT, dy) ** 1.5;
    const w = smooth(-0.012, 0.012, p.x);
    return T0 * env(F.t) * (gR * (1 - w) + gL * w);
  };
  const mbody = (p) => body(p) - thick(p);
  mbody.grad = gradOf(mbody, V(0, 1, 0));
  // (pesanteur à demi « peignée » : la mèche tombe en travers de la crête, puis droit vers le bas)
  const gravAt = (dir) => V(0, -1, 0).addScaledVector(dir, dir.y).normalize().lerp(V(0, -1, 0), 0.45).normalize();
  // Mèches guides de la masse, une par station le long de la crête : posées sur la peau (une vers la gauche depuis
  // le dessus de la crête, retournée, puis la grande du côté droit), rééchantillonnées à part (NL points à gauche
  // jusqu'à la crête, NR à droite : la crête est la même colonne de la grille à chaque station, la surface ne se tord
  // pas), puis écartées de la peau de l'épaisseur de la crinière à cet endroit (jamais rapprochées : la nappe qui
  // pend reste où elle pend). Le bord gauche, où l'épaisseur s'annule, est sur la peau. (24 à 36 stations : la masse
  // est lisse, 2 à 2,5 cm entre deux stations suffisent ; au-delà, des triangles de plus sans rien de plus à voir.)
  const NS = Math.max(24, Math.round(36 * Math.min(1, 0.5 + len0)));
  const NL = 5;
  const NR = len0 > 0.4 ? 11 : 10;
  const NP = NL + NR;
  const rows = [];
  const gq0 = V();
  for (let i = 0; i < NS; i++) {
    const t = 0.02 + (i / (NS - 1)) * 0.92;
    const F = frameAt(t);
    const top = F.c.clone().addScaledVector(F.up, 0.002);
    const grav = gravAt(F.dir);
    const left = drape(body, top, F.up.clone().multiplyScalar(0.25).add(V(1, 0, 0)), LEFT, { h: 0.003, bend: 0.05, np: 6, steps: 8, stick: 0.03 });
    const right = drape(body, top, F.up.clone().multiplyScalar(0.3).add(V(-0.95, 0, 0)), rightLen(t), { h: 0.003, bend: 0.06, np: 12, steps: 24, stick: 0.02, grav });
    const skinTop = left[0].clone();
    const pts = [...resample(left.reverse(), NL), ...resample(right, NR + 1).slice(1)];
    for (const q of pts) {
      const d = body(q);
      const want = thick(q) + 0.0015;
      if (d < want) q.addScaledVector(body.grad(q, gq0, d), want - d);
    }
    rows.push({ t, F, pts, root: F.c.clone().addScaledVector(F.up, -0.005), skinRoot: skinTop });
  }
  // (lissée d'une station à l'autre : chaque mèche guide est posée seule)
  for (let pass = 0; pass < 2; pass++) {
    const prev = rows.map((r) => r.pts.map((q) => q.clone()));
    for (let i = 1; i < NS - 1; i++) {
      for (let k = 1; k < NP; k++) rows[i].pts[k].copy(prev[i - 1][k]).addScaledVector(prev[i][k], 2).add(prev[i + 1][k]).multiplyScalar(0.25);
    }
  }
  // Relief des mèches (après le lissage, qui l'effacerait) : bombé dehors sur la nappe, d'autant plus vers les
  // pointes, pas sur le dessus du rouleau (sa silhouette reste lisse et arrondie) ; puis hors de la peau, toujours.
  const gq = V();
  const RIP = 0.0035 * Math.sqrt(S.D.scale.gx ?? 1);
  for (const r of rows) {
    const a = rip(r.t) * RIP * env(r.t);
    for (let k = 1; k < NP; k++) {
      const q = r.pts[k];
      const w = smooth(NL, NL + 3, k) * (0.6 + 0.4 * smooth(NL, NP - 1, k));
      if (w > 0) q.addScaledVector(body.grad(q, gq), a * w);
      const d = body(q);
      if (d < 0.003) q.addScaledVector(body.grad(q, gq, d), 0.003 - d);
    }
  }
  const rowW = rows.map((r) => lockWeights(r.skinRoot, NL - 1, NL + 3));
  const mass = {
    // (au bord gauche du rouleau, la nappe se replie vers la peau : normales de la grille tournées vers le sol, qui y
    // prenaient la lumière du sol — sur une crinière grise, des taches vert sombre entre les pointes ; là, celles du corps)
    P: rows.map((r) => r.pts), kind: 0, strip: 6, soft: (i, k) => 1 - smooth(1, NL, k),
    out: (i, k) => body.grad(rows[i].pts[k], V()),
    root: rows.map((r) => r.root),
    G: (i, k) => k / (NP - 1),
    // (le dessus des mèches de la masse un peu plus clair : il prend la lumière, de loin aussi)
    tone: (i, k) => (0.84 + 0.16 * smooth(0, 0.3, k / (NP - 1)) - 0.06 * smooth(0.75, 1, k / (NP - 1))) * (0.95 + 0.05 * rip(rows[i].t)),
    // (le bord gauche et le rouleau suivent la peau de la crête ; la nappe, les os de la crinière)
    weights: (i, k) => rowW[i](k),
  };

  // ---- Mèches de gauche : quelques mèches de la masse passent par-dessus la crête et tombent à gauche (plus pour
  // une crinière longue ou épaisse, aucune pour une courte), chacune une petite grille à part (5 rangées en travers,
  // la largeur de la mèche, 4 à 6 cm de demi-largeur le long de la crête) : posée sur le rouleau puis sur la peau,
  // bombée au milieu, resserrée en pointe vers le bas, plus longue au milieu (une mèche, pas un rabat coupé droit).
  // Places et longueurs tirées d'une suite à part (la répartition des cartes ne change pas).
  const lrng = mulberry(4127);
  const nLeft = style === 'short' ? 0 : style === 'long' || style === 'thick' ? 10 : 8;
  const lefts = leftLocks(nLeft, lrng, crestSpan, len0);
  // (part d'une mèche de gauche à la place t : les cartes courtes de gauche n'y vont pas, la mèche a les siennes)
  const leftLock = (t) => {
    let e = 0;
    for (const m of lefts) e = Math.max(e, 1 - smooth(m.w * 0.45, m.w, Math.abs(t - m.t)));
    return e;
  };
  const LR = 5;
  const LP = 10;
  const lockT = 0.016 * Math.sqrt(S.D.scale.gx ?? 1);
  // Chemin d'une mèche qui passe à gauche, à la place t : sur le flanc gauche du rouleau (les points de la nappe, de la
  // crête à son bord gauche, entre deux stations), à la part keep de son épaisseur (1 : dessus, à h ; moins : dedans),
  // puis le long de la peau sur L sous le bord du rouleau. (Posées par la pesanteur sur le champ « corps + épaisseur »,
  // les mèches de gauche glissaient sur le flanc du rouleau comme sur un toit et sortaient de 10 cm en travers de
  // l'encolure, au lieu de pendre.) f0 : part du chemin sur le rouleau.
  const rowAt = (t, k) => {
    let i = 0;
    while (i < NS - 2 && rows[i + 1].t < t) i++;
    const u = Math.min(1, Math.max(0, (t - rows[i].t) / (rows[i + 1].t - rows[i].t)));
    return rows[i].pts[k].clone().lerp(rows[i + 1].pts[k], u);
  };
  const leftPath = (t, L, keep = 1, h = 0.003) => {
    const roll = [];
    for (let k = NL - 1; k >= 0; k--) {
      const p = rowAt(t, k);
      const d = body(p);
      roll.push(p.addScaledVector(body.grad(p, V(), d), h - (1 - keep) * Math.max(0, d)));
    }
    const edge = roll[NL - 1];
    const dir = edge.clone().sub(roll[NL - 2]).normalize();
    // (peignée à demi vers le garrot, comme la nappe de droite : la mèche tombe en biais, pas à plomb)
    const hang = drape(body, edge, dir, L, { h: 0.004, bend: 0.04, np: 6, steps: Math.max(8, Math.round(L / 0.012)), stick: 0.02, grav: gravAt(frameAt(t).dir) });
    let rl = 0;
    for (let k = 1; k < NL; k++) rl += roll[k].distanceTo(roll[k - 1]);
    return { pts: [...roll, ...hang.slice(1)], f0: rl / (rl + L) };
  };
  const locks = lefts.map((m) => {
    const lr = [];
    for (let j = 0; j < LR; j++) {
      const r = (j / (LR - 1)) * 2 - 1;
      const t = m.t + r * m.w;
      const path = leftPath(t, m.L * (1 - 0.15 * r * r), 1, m.h);
      lr.push({ r, t, pts: resample(path.pts, LP), f0: path.f0 });
    }
    // (pleine sur le rouleau, resserrée vers la rangée du milieu en dessous : la mèche finit en pointe — toutes les
    // rangées d'autant, dans leur ordre : resserrées chacune à sa mesure, elles se croisaient et la pointe se repliait,
    // tachée de noir)
    const mid = lr[(LR - 1) / 2];
    for (const row of lr) {
      row.pts.forEach((p, k) => {
        const f = k / (LP - 1);
        p.lerp(mid.pts[k], LEFT_TAPER * smooth(mid.f0, 1, f));
      });
    }
    // (lissée le long des crins : au bord du rouleau, le chemin tournait d'un coup et la mèche se pliait en arête — de
    // près, un papier froissé)
    for (const row of lr) {
      for (let pass = 0; pass < 2; pass++) {
        const q = row.pts.map((p) => p.clone());
        for (let k = 1; k < LP - 1; k++) {
          if (k / (LP - 1) < mid.f0 - 0.12) continue;
          row.pts[k].copy(q[k - 1]).add(q[k + 1]).multiplyScalar(0.25).addScaledVector(q[k], 0.5);
        }
      }
    }
    // (sous le bord du rouleau, bombée au milieu ; jamais dans la peau)
    for (const row of lr) {
      row.pts.forEach((p, k) => {
        const f = k / (LP - 1);
        if (f < mid.f0) return;
        const d = body(p);
        const want = m.h + 0.001 + lockT * (1 - row.r * row.r) * smooth(mid.f0, mid.f0 + 0.25, f) * (1 - 0.5 * smooth(0.6, 1, f));
        if (d < want) p.addScaledVector(body.grad(p, gq, d), want - d);
      });
    }
    // (racine de la mèche à 6 mm sous la crête, juste sous celles de la nappe : jamais la même qu'une rangée de la nappe)
    const Fm = frameAt(m.t);
    const root = Fm.c.addScaledVector(Fm.up, -0.006);
    const w = lockWeights(root, 0, 0.6);
    return {
      m, rows: lr, root,
      mass: {
        // (texture prise dès le bord en pointes : la mèche commence sur le rouleau en crins épars, pas en bord droit)
        // (normales à moitié celles du corps : une mèche souple, sans arêtes d'ombre)
        // (une part seulement de la hauteur de la bande en travers : trois ou quatre petites mèches de la texture sur la
        // largeur de la mèche, pas neuf — au téléphone, fondues en un aplat, elles faisaient des pétales unis)
        P: lr.map((row) => row.pts), kind: 0, strip: LR - 1, u0: 0, soft: 0.5, v0: m.v0, vSpan: LEFT_VSPAN,
        out: (j, k) => body.grad(lr[j].pts[k], V()),
        root: lr.map(() => root),
        G: (j, k) => k / (LP - 1),
        // (ton propre à chaque mèche : voisines, elles se distinguent — sur des crins clairs, une rangée de pétales du
        // même gris sinon)
        tone: (j, k) => (0.9 + 0.1 * smooth(0, 0.3, k / (LP - 1)) - 0.08 * Math.abs(lr[j].r)) * m.tone,
        weights: (j, k) => w(k / (LP - 1)),
      },
    };
  });

  // ---- Cartes. Elles partent du flanc du rouleau, sur la masse (3 à 6 cm sous la crête du côté où elles tombent),
  // racine — pour les tresses et l'ondulation — sur la peau de la crête, et ne montent jamais au-dessus de la
  // silhouette du rouleau. (Parties de la crête par-dessus la masse, leurs bords droits dépassaient en marches
  // rectangulaires vues de gauche ; vers la nuque, la pesanteur « peignée » d'une crête qui remonte les dressait
  // au-dessus des oreilles ; parties de dedans, elles traversaient la masse en lames plates, bien visibles sur une
  // crinière claire.)
  const cap = (pts, side = null, half = null) => {
    for (let k = 1; k < pts.length; k++) {
      const p = pts[k];
      const F = frameNear(p);
      const hgt = -below(p, F) + (side ? Math.abs(side.dot(F.up)) * half(k / (pts.length - 1)) : 0);
      const top = 0.65 * T0 * env(F.t) + 0.002;
      if (hgt > top) p.addScaledVector(F.up, top - hgt);
    }
  };
  const main = [];
  const fill = [];
  for (let i = 0; i < n; i++) {
    const primary = i % 2 === 0;
    // (jusqu'un peu avant la nuque : derrière les oreilles passe la têtière, les dernières mèches s'y retournaient)
    const t = 0.03 + ((i + rng() * 0.9) / n) * 0.87;
    const { c, dir, up } = frameAt(t);
    // (quelques cartes courtes passent à gauche, plus pour une crinière longue ou épaisse, à côté des mèches de
    // gauche de la masse)
    const ll = leftLock(t);
    const sx = rng() < Math.max(st.other * 0.5, MANE_LEFT * (1 - ll)) ? 1 : -1;
    const across = -sx * (0.002 + rng() * 0.008);
    const root = c.clone().addScaledVector(up, -0.005).add(V(across, 0, 0));
    const jit = 0.86 + 0.28 * rng();
    const L = len0 * prof(t) * jit;
    // (vers la nuque, les mèches ne se soulèvent plus : elles passent sous la têtière)
    const lift = st.lift * (1 - 0.8 * smooth(0.75, 0.9, t));
    const d0 = up.clone().multiplyScalar(lift).add(V(sx * (1 - lift * 0.4), 0, 0)).addScaledVector(dir, (rng() - 0.5) * 0.2);
    const h = 0.002 + rng() * (primary ? 0.004 : 0.007);
    let pts;
    if (sx > 0) {
      // (celles de gauche, courtes : sur le flanc du rouleau puis des pointes qui dépassent de 3 à 9 cm sous son bord,
      // pas un second rideau)
      // (parties du milieu du flanc : plus haut, leur bord dépassait de la silhouette du rouleau en dents de scie)
      pts = resample(leftPath(t, (0.03 + 0.06 * rng()) * Math.min(1.4, 0.8 + len0), 1, h * 0.5).pts.slice(2 + Math.floor(rng() * 2)), 5);
    } else {
      // (celles de droite : de la nappe, une ou deux colonnes après la crête, dans le sens de la nappe)
      const k0 = NL + Math.floor(rng() * 2);
      const a = rowAt(t, k0);
      const b = rowAt(t, k0 + 1);
      let used = 0;
      for (let k = NL - 1; k < k0; k++) used += rowAt(t, k).distanceTo(rowAt(t, k + 1));
      const start = a.clone().addScaledVector(body.grad(a, V()), h);
      const Lr = Math.max(0.06, L - used);
      pts = drape(mbody, start, b.sub(a).add(d0.clone().multiplyScalar(0.02)), Lr, { h, bend: 0.055 + rng() * 0.025, np: Lr > 0.24 ? 6 : 5, steps: 14, stick: 0.02, grav: gravAt(dir) });
    }
    // (normales de la peau, pas du champ « corps − épaisseur » : là où l'épaisseur décroît vers le bas, sa pente les
    // tournait vers le sol — sur une crinière grise, des taches vert sombre, la lumière du sol, sur les mèches)
    const normals = pts.map((p) => body.grad(p, V()));
    if (style === 'long') {
      // Rideau ondulé : la mèche ondule en s'écartant de l'encolure (jamais vers elle) et un peu d'avant en arrière.
      const ph = rng() * 6.28;
      pts.forEach((p, k) => {
        const f = k / (pts.length - 1);
        const w = smooth(0.15, 0.5, f);
        p.addScaledVector(normals[k], 0.014 * w * (0.5 + 0.5 * Math.sin(f * 9 + ph)));
        p.addScaledVector(ez, 0.012 * w * Math.sin(f * 7 + ph * 1.3));
      });
    }
    const m = Math.floor(pts.length / 2);
    const side = cardSide(normals[m], alongAt(pts, m), (rng() - 0.5) * 0.3);
    // (étroites, posées sur la masse : des pointes de mèches, pas des lames ; celles de gauche plus encore)
    const w0 = (primary ? 0.07 + rng() * 0.018 : 0.052 + rng() * 0.014) * (sx > 0 ? 0.5 : 0.65);
    const w1 = (primary ? 0.046 : 0.034) * (sx > 0 ? 0.4 : 0.65);
    // (bords compris : une carte peignée en arrière est de biais sur la crête, son bord haut dépassait du rouleau en
    // aileron — vue de gauche, une rangée de dents sur la crinière)
    cap(pts, side, (f) => ((w0 + (w1 - w0) * f) / 2) * (0.3 + 0.7 * smooth(0, 0.3, f)));
    const card = {
      pts, normals, side, w0, w1,
      // (racine sur la peau de la crête : tressée, la mèche s'y replie, sous le bouton ; partie du flanc du rouleau,
      // la carte en sort en pointe)
      root, rootTaper: 0.3,
      color: grey(0.93 + rng() * 0.14), uv: [0, 1, ...HAIR_ROWS[Math.floor(rng() * 4)]], kind: 0,
      // (celles de gauche moins traînées par le vent de la course : au galop, elles se dressaient en touffes)
      sway: sx > 0 ? 0.55 : 1,
      weights: (() => {
        const w = lockWeights(root);
        return (p, f) => w(f);
      })(),
      meta: { t, root, primary },
    };
    // (bords hors de la peau : dans le creux de l'encolure devant le garrot, un bord de carte y entrait)
    pushCardOut(card, body, 0.002);
    (primary ? main : fill).push(card);
  }
  // Cartes des mèches de gauche : deux par mèche, posées sur elle (entre ses rangées), aussi longues qu'elle :
  // ses bords et sa pointe qui bougent.
  locks.forEach((lk, li) => {
    // (deux par mèche : elles sont étroites et nombreuses)
    const nc = 2;
    for (let q = 0; q < nc; q++) {
      const r = ((q + 0.5) / nc) * 2 - 1 + (lrng() - 0.5) * 0.3;
      const x = ((r + 1) / 2) * (LR - 1);
      const j0 = Math.min(LR - 2, Math.floor(x));
      const u = x - j0;
      const h = 0.001 + 0.002 * lrng();
      const pts = [];
      const normals = [];
      for (let k = 0; k < LP; k += 1) {
        const p = lk.rows[j0].pts[k].clone().lerp(lk.rows[j0 + 1].pts[k], u);
        const nn = body.grad(p, V());
        pts.push(p.addScaledVector(nn, h + (k ? 0.002 : 0)));
        normals.push(nn);
      }
      const m = Math.floor(LP / 2);
      const w = lockWeights(lk.root, 0, 0.6);
      const card = {
        // (racine celle de la mèche, sur la peau de la crête : tressée, la carte s'y replie sous le bouton — repliée
        // vers son premier point, au-dessus du rouleau, elle dépassait des boutons)
        pts, normals, root: lk.root, side: cardSide(normals[m], alongAt(pts, m), (lrng() - 0.5) * 0.3), w0: 0.045, w1: 0.008,
        // (même part le long des crins que la mèche dessous — hairG — : elles bougent avec elle au vent et au galop, et
        // leurs racines ne sont pas assombries sur toute leur longueur)
        color: grey(0.95 + lrng() * 0.1), uv: [0.055, 1, ...HAIR_ROWS[(li + q) % 4]], kind: 0,
        weights: (p, f) => w(f), meta: { t: lk.m.t, root: lk.root, primary: q === 0 },
      };
      pushCardOut(card, body, 0.002);
      (q === 0 ? main : fill).push(card);
    }
  });
  return { main, fill, mass: [mass, ...locks.map((lk) => lk.mass)] };
}

/**
 * Toupet « en volume » : une mèche pleine qui sort entre les oreilles, bombée en haut, et tombe vers l'avant sur le
 * chanfrein en se resserrant en pointe entre les yeux (masse de 9 colonnes, 8 à 9 cm de large en haut) ; les
 * cartes, étroites, posées sur elle dans le même V, en font les bords et la pointe. La ligne du milieu est posée par
 * la pesanteur sur le front ; la largeur, réglée dans le repère de la tête, et chaque point redescendu sur la peau
 * le long de la verticale de la tête (posées une à une par la pesanteur, les colonnes glissaient de part et d'autre
 * du chanfrein : un rectangle coupé droit au lieu d'une pointe). Liés à la tête.
 */
function forelockCards(S, B, body, base) {
  const rng = mulberry(4127);
  const heads = S.heads;
  const poll = heads[BONE_INDEX.Head];
  const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), base.headTilt);
  const qi = q.clone().invert();
  const toH = (p) => p.clone().sub(poll).applyQuaternion(qi);
  const fromH = (p) => p.clone().applyQuaternion(q).add(poll);
  const style = B.maneStyle;
  // (un peu plus long que les rubans d'avant : la pointe effilée mange le bas de la mèche)
  const L0 = S.headLen * (FORELOCK[style] ?? FORELOCK.normal) * Math.min(1.25, Math.sqrt(B.mane ?? 1)) * 1.08;
  // (moins de rubans : la masse fait la mèche pleine, les cartes ses bords et sa pointe)
  const n = Math.round(Math.min(34, Math.max(20, 26 * Math.sqrt(B.maneN ?? 1) * (style === 'thick' ? 1.15 : 1))) * FORE_CARDS);
  const eL = toH(heads[BONE_INDEX.EarL]);
  const eR = toH(heads[BONE_INDEX.EarR]);
  const ez0 = (eL.z + eR.z) / 2;
  const head = S.measure.head;
  // (la tête seule pour poser le toupet : entre les oreilles, les dernières coupes de l'encolure couvrent la nuque,
  // et les mèches qui partaient de là étaient poussées vers le haut, dressées entre les oreilles)
  const hp = V();
  const hd = (p) => {
    hp.copy(p).sub(poll).applyQuaternion(qi);
    return head(hp.x, hp.y, hp.z);
  };
  hd.grad = gradOf(hd, V(0, 1, 0).applyQuaternion(q));
  // (racines au milieu de celles d'avant : plus en arrière, sur la pente de la nuque, les mèches glissaient vers
  // l'encolure ; 8 à 9 cm de large en haut, entre les oreilles sans les toucher)
  const z0 = ez0 + 0.032;
  const halfM = Math.abs(eL.x - eR.x) * 0.44;
  // Largeur (demi, repère de la tête) le long du toupet : pleine en haut, un peu évasée sous les oreilles, resserrée en
  // pointe à 80 % de sa longueur, une pointe fine au bout.
  const halfW = (f) => halfM * (1 + 0.1 * smooth(0, 0.12, f) * (1 - smooth(0.12, 0.3, f))) * (1 - 0.88 * smooth(0.05, 0.85, f) ** 0.85);
  // Épaisseur de la masse : elle monte au-dessus du toupet en haut (les crins sortent de la nuque et basculent vers
  // l'avant — vu de face, le haut du toupet est arrondi, pas un bord droit sur le front), s'amincit vers la pointe et
  // sur les côtés.
  const TF0 = FORE_THICK * Math.sqrt(Math.min(1.4, B.mane ?? 1));
  // (bosse de 4 cm sous la nuque : de trois quarts, le toupet sort en arrondi d'entre les oreilles au lieu d'une
  // plaque couchée sur le front)
  const tf = (r, f) => TF0 * smooth(0, 0.07, f) * (1 + 1.1 * (1 - smooth(0.04, 0.32, f))) * (1 - 0.6 * smooth(0.1, 0.9, f)) * Math.max(0, 1 - r * r) ** 0.8;
  // Ligne du milieu, posée par la pesanteur sur le front, dans le repère de la tête.
  const rootY = (x, z) => {
    let y = 0.3;
    while (y > -0.1 && head(x, y, z) > 0) y -= 0.003;
    return y;
  };
  const NP = 10;
  const root0 = fromH(V(0, rootY(0, z0 - 0.008) - 0.004, z0 - 0.008));
  const center = drape(hd, root0, V(0, 0.3, 1).normalize().applyQuaternion(q), L0 * 0.95, { h: 0.004, bend: 0.06, np: 2 * NP - 1, steps: 16, stick: 0.05 }).map(toH);
  // (point de la ligne du milieu à la part f de sa longueur, repère de la tête)
  const centerAt = (f) => {
    const x = Math.min(center.length - 1.001, Math.max(0, f * (center.length - 1)));
    const k = Math.floor(x);
    return center[k].clone().lerp(center[k + 1], x - k);
  };
  // (point du toupet en travers r (−1 à 1) à la part f, à la hauteur off au-dessus de la peau : redescendu le long de la
  // verticale de la tête, par dichotomie, depuis 6 cm au-dessus de la ligne du milieu)
  const surf = (r, f, off, zTop = 0) => {
    const c = centerAt(f);
    const x = r * halfW(f);
    const z = c.z + zTop * (1 - f);
    let hi = c.y + 0.06;
    let lo = c.y - 0.1;
    if (head(x, hi, z) < off) return fromH(V(x, hi, z));
    if (head(x, lo, z) > off) return fromH(V(x, c.y + off, z));
    for (let it = 0; it < 16; it++) {
      const m = (hi + lo) / 2;
      if (head(x, m, z) > off) hi = m;
      else lo = m;
    }
    return fromH(V(x, (hi + lo) / 2, z));
  };
  // Masse : neuf colonnes en travers, racines du milieu un peu plus en arrière (un haut arrondi) ; moins large que le V
  // des cartes (FORE_MASS_W) : ses bords sont faits des cartes, des mèches de longueurs inégales — sur un front blanc,
  // la masse seule, bords droits, se lisait en triangle gris lisse.
  const NJ = 9;
  const cols = [];
  for (let j = 0; j < NJ; j++) {
    const r = (j / (NJ - 1)) * 2 - 1;
    const zTop = 0.008 * r * r;
    const x0 = r * FORE_MASS_W * halfW(0);
    const root = fromH(V(x0, rootY(x0, z0 - 0.008 * (1 - r * r)) - 0.004, z0 - 0.008 * (1 - r * r)));
    const pts = [root];
    for (let k = 1; k < NP; k++) {
      const f = k / (NP - 1);
      pts.push(surf(r * FORE_MASS_W, f, tf(r, f) + 0.0015, zTop));
    }
    cols.push({ pts, root });
  }
  const mass = {
    P: cols.map((c) => c.pts), kind: 1, strip: NJ - 1, u0: HAIR_MASS.root,
    out: (j, k) => hd.grad(cols[j].pts[k], V()),
    root: cols.map((c) => c.root),
    G: (j, k) => k / (NP - 1),
    tone: (j, k) => 0.9 + 0.1 * smooth(0, 0.3, k / (NP - 1)),
    weights: () => [[BONE_INDEX.Head, 1]],
  };
  // Cartes : dans le même V, posées sur la masse (2 à 6 mm au-dessus), plus longues au milieu, racines à des hauteurs
  // différentes entre les oreilles (pas de bord droit sur le front).
  const main = [];
  const fill = [];
  for (let i = 0; i < n; i++) {
    const primary = i % 2 === 0;
    const rr = rng() * 2 - 1;
    const r = Math.sign(rr) * Math.abs(rr) ** 1.15 * 0.95;
    const fmax = Math.min(1.04, (0.8 + 0.3 * rng()) * (1 - 0.35 * r * r));
    const h = 0.002 + rng() * 0.004;
    const zTop = -0.01 + rng() * 0.03;
    const pts = [];
    for (let k = 0; k < 5; k++) {
      const f = (fmax * k) / 4;
      // (racine dans la peau, 4 mm sous elle : rentrée sous un bonnet, la mèche se replie sous le voile)
      pts.push(surf(r * (1 - 0.15 * f), f, k ? tf(r, Math.min(1, f)) + h : -0.004, zTop));
    }
    const normals = pts.map((p) => hd.grad(p, V()));
    const m = 2;
    const side = cardSide(normals[m], alongAt(pts, m), (rng() - 0.5) * 0.25);
    const card = {
      // (étroits, posés sur la masse : ils en font les bords et la pointe, pas une plaque rayée ; la pointe fine)
      pts, normals, side, w0: primary ? 0.04 : 0.03, w1: primary ? 0.008 : 0.006,
      // (tons peu écartés d'un ruban à l'autre : couchés côte à côte sur le front, des tons différents se lisaient en
      // rayures ; texture prise après les dents de la racine : racine pleine, pas une bande translucide sur le front)
      color: grey(0.96 + rng() * 0.08), uv: [0.055, 1, ...HAIR_ROWS[Math.floor(rng() * 4)]], kind: 1,
      weights: () => [[BONE_INDEX.Head, 1]], meta: { root: pts[0].clone(), primary },
    };
    pushCardOut(card, hd, 0.002);
    (primary ? main : fill).push(card);
  }
  return { main, fill, mass: [mass] };
}

/**
 * Queue : rubans effilés partis du tronçon de la queue (couard, sur le dessus et les côtés, plus serrés au
 * milieu), qui suivent le tronçon puis pendent ; la queue s'élargit un peu puis s'affine vers le bas, longueurs
 * inégales (plus longues au milieu), derrière les fesses et les jarrets. Longueur selon le gabarit (B.tail),
 * jamais jusqu'au sol (TAIL_CLEAR, plus haut pour une queue moyenne). Racines liées à la peau du tronçon,
 * le reste à Tail2 (coups de queue, port de queue).
 */
function tailCards(S, B, body, pos, coat, base) {
  const rng = mulberry(4133);
  const D = S.D;
  const H = base.hair;
  const dockList = [];
  for (let i = 0; i < coat.count; i++) {
    const b = dominant(coat, i);
    if (b === BONE_INDEX.Tail1 || b === BONE_INDEX.Tail2) dockList.push(i);
  }
  // Tronçon de la queue : coupes horizontales de sa peau (centre, rayon), du haut des racines du GLB (4 cm
  // au-dessus : pas de bosse de peau nue au-dessus des crins) jusqu'au bas du tronçon.
  const Bd = D.maps[BONE_INDEX.Tail2](H.dockEnd, V()).setX(0);
  const A = D.maps[BONE_INDEX.Tail1](H.dockTop, V()).setX(0);
  const NS = 6;
  const yTop = A.y + 0.04;
  const ring = [];
  for (let k = 0; k < NS; k++) {
    const y = yTop + ((Bd.y - yTop) * k) / (NS - 1);
    let z0 = Infinity;
    let z1 = -Infinity;
    let xm = 0;
    for (const i of dockList) {
      if (Math.abs(pos[i * 3 + 1] - y) > 0.03 || Math.abs(pos[i * 3]) > 0.08) continue;
      z0 = Math.min(z0, pos[i * 3 + 2]);
      z1 = Math.max(z1, pos[i * 3 + 2]);
      xm = Math.max(xm, Math.abs(pos[i * 3]));
    }
    ring.push(Number.isFinite(z0) ? [V(0, y, (z0 + z1) / 2), Math.max(0.02, Math.min(0.07, Math.max(xm, (z1 - z0) / 2)))] : null);
  }
  for (let k = 0; k < NS; k++) {
    if (ring[k]) continue;
    const j = ring.findIndex(Boolean);
    ring[k] = j >= 0 ? [ring[j][0].clone().setY(yTop + ((Bd.y - yTop) * k) / (NS - 1)), ring[j][1]] : [A.clone().lerp(Bd, k / (NS - 1)), 0.035];
  }
  const dockAt = (u) => {
    const f = Math.min(NS - 1.001, Math.max(0, u * (NS - 1)));
    const k = Math.floor(f);
    const c = ring[k][0].clone().lerp(ring[k + 1][0], f - k);
    const r = ring[k][1] + (ring[k + 1][1] - ring[k][1]) * (f - k);
    const d = ring[k + 1][0].clone().sub(ring[k][0]).normalize();
    return [c, r, d];
  };
  const rear = rearProfile(pos, coat);
  // (2,5 cm derrière les fesses et les cuisses au repos : au trot, les postérieurs reculent sous la queue)
  const keep = (p, h) => {
    const zb = rear(p.y);
    if (Number.isFinite(zb) && p.z > zb - h - 0.025) p.z = zb - h - 0.025;
  };
  const gx = D.scale.gx;
  const foal = !!B.foal;
  // (longueur : celle de la queue du GLB, de la fin du tronçon à sa pointe, × le gabarit de la race)
  const Lt = Math.max(0.15, (H.dockEnd.y - H.tailTipY) * ((B.tail ?? 1) / NATIVE_BUILD.tail));
  const dockLen = yTop - Bd.y;
  const clear = TAIL_CLEAR + Math.max(0, 1.25 - (B.tail ?? 1)) * 0.5;
  // ---- Axe de la queue : le milieu des coupes du tronçon, puis une ligne qui pend depuis le bas du tronçon (pas
  // de corps à éviter : seulement l'arrière-main, devant elle, à la demi-épaisseur de la queue près).
  // (largeur selon l'abondance des crins de la race, pas selon la longueur de sa queue)
  const Wmax = (foal ? 0.06 : TAIL_WIDTH) * Math.sqrt(gx) * Math.sqrt(Math.min(1.15, B.maneN ?? 1));
  // (port de queue de la race : 0 basse, 1 relevée — arabe)
  const plume = foal ? 0 : Math.min(1, B.tailSet ?? 0);
  const rzMax = Wmax * TAIL_DEPTH;
  const free = () => 1;
  free.grad = (p, out) => out.set(0, 1, 0);
  const keepAxis = (p) => keep(p, rzMax * 0.85);
  const [, , dEnd] = dockAt(1);
  // (une queue portée haut (arabe) : les crins retombent dès le bout du tronçon, en fontaine — l'axe qui
  // prolongeait le tronçon avant de tomber faisait une anse lisse au-dessus de la queue)
  const d0h = dEnd.clone().lerp(V(0, -1, 0), 0.45 * smooth(-0.3, 0.4, dEnd.y)).normalize();
  const hang = drape(free, Bd, d0h, Lt * 1.04, { h: 0, bend: 0.05, np: 18, steps: 30, keep: keepAxis, floor: clear });
  const axis0 = [];
  for (let k = 0; k < NS; k++) axis0.push(dockAt(k / (NS - 1))[0]);
  axis0.push(...hang.slice(1));
  const NR = TAIL_RINGS;
  const axis = resample(axis0, NR + 6);
  const acc = [0];
  for (let k = 1; k < axis.length; k++) acc.push(acc[k - 1] + axis[k].distanceTo(axis[k - 1]));
  const total = acc[acc.length - 1];
  // (position sur l'axe à la distance s du haut : point, direction, cadre latéral et arrière)
  const axisAt = (s) => {
    let k = 0;
    while (k < axis.length - 2 && acc[k + 1] < s) k++;
    const u = Math.min(1, Math.max(0, (s - acc[k]) / Math.max(1e-9, acc[k + 1] - acc[k])));
    const p = axis[k].clone().lerp(axis[k + 1], u);
    const a = axis[k + 1].clone().sub(axis[k]).normalize();
    if (s > total) p.addScaledVector(a, s - total);
    const lat = V(1, 0, 0).addScaledVector(a, -a.x).normalize();
    const back = V().crossVectors(lat, a).normalize();
    if (back.z > 0) back.negate();
    return { p, a, lat, back };
  };
  // Rayons de la masse le long de l'axe : sur le tronçon, la peau + l'épaisseur des crins qui la couvrent ; sous
  // lui, un fuseau qui s'élargit vite (couard plein), reste plein jusqu'à mi-longueur puis s'effile ; un peu moins
  // épais d'avant en arrière que large (de profil, la queue garde du volume : pas un ruban vu par la tranche).
  // f : part de la queue sous le tronçon (0 en bas du tronçon, 1 à la pointe des crins) ; Lh : longueur de l'axe
  // qui pend (plus courte que la queue quand elle s'arrête à sa hauteur limite : la masse ne la dépasse pas).
  const Lh = Math.max(0.1, Math.min(Lt, total - dockLen));
  const Lm = dockLen + Lh * TAIL_MASS_LEN;
  const fOf = (s) => Math.max(0, (s - dockLen) / Lh);
  const rDock = (u) => Math.min(dockAt(u)[1], 0.045 * Math.sqrt(gx));
  const radii = (s) => {
    if (s <= dockLen) {
      const u = s / Math.max(1e-6, dockLen);
      // (le premier anneau dans le tronçon : la masse en sort, sans bord ouvert au-dessus — une queue portée haut
      // le montrait)
      const r = rDock(u) * (0.4 + 0.6 * smooth(0, 0.12, u)) + 0.006 * smooth(0, 0.12, u) + 0.026 * smooth(0, 1, u);
      return [r, r * (1 - 0.15 * smooth(0.3, 1, u))];
    }
    const f = fOf(s);
    const r0 = rDock(1) + 0.032;
    // (en éventail dès le bas du tronçon : vue de dos, la queue s'élargit tout de suite sous le couard ; le bas reste
    // à moitié de la largeur : des mèches qui finissent à leurs longueurs, pas une pointe unique)
    // (et refermé tout au bout, là où la texture n'a plus que des pointes : ouvert, on voyait par le bas l'intérieur
    // du fuseau, tourné vers le sol, en traînées sombres sous une queue claire)
    const rx = (r0 + (Wmax - r0) * smooth(0, 0.2, f)) * (1 - 0.5 * smooth(0.5, 1, f)) * (1 - 0.9 * smooth(TAIL_MASS_LEN - 0.14, TAIL_MASS_LEN, f));
    const rz = rx * (0.85 - (0.85 - TAIL_DEPTH) * smooth(0, 0.35, f));
    // (queue portée haut, en panache : plus large de côté dès le couard — les crins retombent en éventail du tronçon
    // relevé ; à la largeur des autres, vue de dos, une lame plate grise)
    const wide = 1 + PLUME_WIDTH * plume * smooth(0, 0.12, f) * (1 - 0.3 * smooth(0.6, 1, f));
    return [Math.max(0.008, rx * wide), Math.max(0.007, rz)];
  };
  // (mèches de la masse : cinq lobes, de plus en plus marqués vers le bas — la queue s'y divise en mèches —, qui
  // ondulent de côté en descendant ; plus un léger écart à trois lobes : pas une étoile régulière)
  const lobePh = rng() * 6.28;
  const wavePh = rng() * 6.28;
  const lobe = (phi, s) => {
    const f = fOf(s);
    // (les lobes se balancent de côté en descendant, d'un tiers d'écart entre deux lobes : de profil comme de dos, le
    // bord de la queue ondule en mèches, pas une ligne droite)
    const tw = 0.5 * f + 0.34 * Math.sin(6.2 * f + wavePh) * smooth(0.05, 0.35, f);
    // (sur le tronçon aussi, un peu : pas un tube lisse)
    const a = 0.035 + (0.035 + 0.22 * smooth(0.2, 0.85, f)) * smooth(0, 0.15, f);
    return 1 + a * Math.cos(5 * (phi - tw) + lobePh) + 0.05 * smooth(0, 0.2, f) * Math.sin(3 * phi - 1.3 * f + 1.7);
  };
  const gq = V();
  // (sAx : distance le long de l'axe, si elle diffère de celle qui donne la forme — colonne plus courte que la queue)
  const surface = (s, phi, off = 0, sAx = s) => {
    const F = axisAt(sAx);
    const [rx, rz] = radii(Math.min(s, total));
    const l = lobe(phi, s);
    // (la queue entière ondule un peu, de côté et d'avant en arrière : pas un fil à plomb)
    const f = fOf(s);
    const wv = smooth(0.1, 0.6, f) * Math.sqrt(gx);
    const p = F.p.clone()
      .addScaledVector(F.lat, 0.012 * wv * Math.sin(f * 6.5 + wavePh) + (rx * l + off) * Math.sin(phi))
      .addScaledVector(F.back, 0.007 * wv * Math.sin(f * 4.3 + wavePh * 1.7) + (rz * l + off) * Math.cos(phi));
    keep(p, 0.004);
    // (hors de la croupe et du tronçon, toujours ; jamais sous la hauteur limite)
    const d = body(p);
    if (d < 0.004) p.addScaledVector(body.grad(p, gq, d), 0.004 - d);
    if (p.y < clear) p.y = clear;
    return { p, F };
  };
  // Masse : NR anneaux du haut du tronçon jusqu'à Lm, TAIL_AROUND points autour (quatre bandes de la texture).
  // Sous le tronçon, chaque colonne a sa longueur (86 à 100 % : plus longue derrière, inégale d'une mèche à l'autre) :
  // le bas de la queue finit en pointes de longueurs différentes, pas coupé droit à sa hauteur limite.
  const NA = TAIL_AROUND;
  const P = [];
  const sOf = (k) => (Lm * k) / (NR - 1);
  const colPh = rng() * 6.28;
  const colLen = (phi) => Math.min(1, 0.95 + 0.05 * Math.cos(phi) + 0.025 * Math.sin(3 * phi + colPh) + 0.02 * Math.cos(5 * phi));
  const sCol = (s, phi) => (s <= dockLen ? s : dockLen + (s - dockLen) * colLen(phi));
  for (let j = 0; j < NA; j++) {
    const phi = (j / NA) * Math.PI * 2;
    const row = [];
    for (let k = 0; k < NR; k++) row.push(surface(sOf(k), phi, 0, sCol(sOf(k), phi)).p);
    P.push(row);
  }
  // Poids : sur le tronçon, la peau du tronçon (sans les hanches) ; dessous, de plus en plus Tail2.
  const dockW = (p) => {
    const w = topWeights(new Map(skinNear(pos, coat, dockList, p).filter(([bn]) => bn === BONE_INDEX.Tail1 || bn === BONE_INDEX.Tail2 || bn === BONE_INDEX.Spine)));
    if (!w.length) w.push([BONE_INDEX.Tail1, 1]);
    return w;
  };
  const wT = [[BONE_INDEX.Tail2, 1]];
  const ringW = [];
  for (let k = 0; k < NR; k++) {
    const s = sOf(k);
    ringW.push(dockW(dockAt(Math.min(1, s / Math.max(1e-6, dockLen)))[0]));
  }
  const top = axis[0].clone();
  const mass = {
    // (u1 : les pointes les plus fines de la texture laissées de côté — tout au bout d'une queue longue, réduites au
    // loin, elles se lisaient en une pluie de points sous la queue ; les cartes font la pointe)
    P, kind: 2, strip: TAIL_AROUND / 4, closed: true, u0: HAIR_MASS.root, u1: 0.93,
    out: (j, k) => {
      const F = axisAt(sCol(sOf(k), (j / NA) * Math.PI * 2));
      return P[j][k].clone().sub(F.p);
    },
    root: P.map(() => top),
    G: (j, k) => k / (NR - 1),
    tone: (j) => {
      const phi = (j / NA) * Math.PI * 2;
      return 0.8 + 0.2 * (0.5 + 0.5 * Math.cos(phi));
    },
    weights: (j, k) => blendWeights(ringW[k], wT, smooth(0, 0.45, (sOf(k) - dockLen * 0.5) / (Lt + dockLen * 0.5))),
  };
  // Cartes : posées sur la masse (1 à 1,2 cm au-dessus au plus), en groupes de quatre qui ondulent ensemble ; elles
  // vont plus loin que la masse et se rejoignent en pointe ; plus serrées derrière et sur les côtés.
  const n = foal ? 36 : Math.round(Math.min(80, Math.max(60, 70 * Math.sqrt((B.tail ?? 1) * (B.maneN ?? 1)))) * TAIL_CARDS);
  const main = [];
  const fill = [];
  const crng = mulberry(4139);
  let clump = null;
  for (let i = 0; i < n; i++) {
    const primary = i % 2 === 0;
    if (i % 4 === 0) {
      // (groupes en treillis de Fibonacci sur le tronçon : du haut vers le bas, chacun tourné du nombre d'or autour —
      // ni trou ni paquet d'un côté, vue de dos la queue est pleine et d'aplomb)
      const k = i / 4;
      const sv = ((k * 0.618034 + 0.31) % 1) * 2 - 1;
      clump = {
        // (chaque groupe ondule en S autour de la queue — 2 à 3 cm de côté, une période et demie sur sa longueur — et
        // s'écarte puis se rapproche de la masse : des mèches ondulées, pas des fils tendus ; le reflet, qui suit la
        // direction des crins, se casse en bandes au lieu d'allumer d'un bloc une carte droite)
        phi: Math.sign(sv) * Math.abs(sv) ** 1.15 * Math.PI * 0.92, ph: crng() * 6.28, amp: 0.2 + crng() * 0.14, fr: 6.5 + crng() * 2.5,
        // (queue en panache : les groupes s'écartent plus de la masse — du volume et des jours entre les mèches)
        lift: (0.006 + crng() * 0.016) * (1 + 0.7 * plume), len: 0.88 + crng() * 0.22, u: (k + 0.5) / Math.ceil(n / 4),
      };
    }
    const u = Math.min(1, Math.max(0, clump.u + (rng() - 0.5) * 0.25)) ** 1.3;
    const phi = clump.phi + (rng() - 0.5) * 0.35;
    const cw = Math.max(0, Math.cos(phi));
    const s0 = u * dockLen;
    // (longueurs inégales, par mèche et par groupe : la queue finit en pointe irrégulière, pas coupée net)
    // (jamais plus de 6 % plus bas que la masse : au-delà, des pointes isolées pendaient sous la queue et, de loin au
    // téléphone, se lisaient en une pluie de points — à 10 %, il en restait deux ou trois)
    const Ls = Math.min(Lm * 1.06 - s0, (Lt + dockLen * (1 - u)) * (0.8 + 0.2 * cw) * (0.86 + 0.26 * rng()) * clump.len);
    const NPc = 10;
    const h = 0.003 + rng() * 0.004;
    const pts = [];
    const normals = [];
    for (let k = 0; k < NPc; k++) {
      const f = k / (NPc - 1);
      const s = s0 + Ls * f;
      // (au-delà de la masse, la mèche rejoint l'axe : la pointe de la queue)
      const beyond = smooth(Lm * 0.92, Lm * 1.25, s);
      const wf = smooth(0.12, 0.6, f);
      const off = (h + clump.lift * smooth(0.2, 0.8, f) * (0.65 + 0.35 * Math.sin(f * clump.fr + clump.ph + 1.6))) * (1 - beyond);
      const pw = phi + clump.amp * Math.sin(f * clump.fr + clump.ph) * wf;
      const { p, F } = surface(s, pw, off, sCol(s, pw));
      if (beyond > 0) p.lerp(F.p, beyond * 0.4);
      // (au-dessus de la hauteur limite de la demi-largeur du ruban au moins : ses bords ne passent pas dessous)
      if (p.y < clear + 0.02) p.y = clear + 0.02;
      pts.push(p);
      normals.push(F.lat.clone().multiplyScalar(Math.sin(pw)).addScaledVector(F.back, Math.cos(pw)).normalize());
    }
    const m = Math.floor(NPc / 2);
    const side = cardSide(normals[m], alongAt(pts, m), (rng() - 0.5) * 0.5);
    const root = pts[0].clone();
    const wR = dockW(dockAt(u)[0]);
    const tone = 0.93 + rng() * 0.14;
    const [v, dv] = HAIR_ROWS[Math.floor(rng() * 4)];
    const card = {
      // (racine étroite : la mèche sort du tronçon en pointe, pas une plaque large posée sur le couard)
      pts, normals, side, w0: primary ? 0.07 : 0.052, w1: primary ? 0.04 : 0.03, rootTaper: 0.22,
      // (texture jusqu'à 0,92 : ses crins les plus fins, tout au bout, laissés de côté — réduits au loin, des points)
      color: new THREE.Color(tone, tone, tone), uv: [0, 0.92, v, dv], kind: 2,
      // (du tronçon vers Tail2 sur la première moitié : une queue portée haut (arabe) retombe en arc)
      weights: (p, f) => blendWeights(wR, wT, smooth(0, 0.45, f)),
      meta: { root, primary },
    };
    // (bords hors du tronçon et derrière les fesses : une carte tournée de biais y entrait par un bord)
    pushCardOut(card, body, 0.004, keep);
    (primary ? main : fill).push(card);
  }
  return { main, fill, mass: [mass] };
}

/**
 * Crins en cartes d'un gabarit (crinière, toupet, queue), partagés par ses chevaux : géométrie (ton gris par
 * sommet) et index réduit (mèches principales seulement), plus les racines (tresses du concours de beauté).
 */
function hairShape(S, B, pos, coat, base) {
  const body = hairBody(S, pos, coat, base);
  const mane = maneCards(S, B, body, pos, coat);
  const fore = forelockCards(S, B, body, base);
  const tail = tailCards(S, B, body, pos, coat, base);
  const main = [...mane.main, ...fore.main, ...tail.main];
  const fill = [...mane.fill, ...fore.fill, ...tail.fill];
  // (masses d'abord dans l'index : le volume, toujours dessiné ; puis les cartes principales, puis les autres)
  const geo = hairCards([...main, ...fill], { masses: [...mane.mass, ...fore.mass, ...tail.mass], mainCount: main.length });
  geo.userData.shared = true;
  // (index réduit : les masses réduites et les mèches principales)
  const lod = lodGeometry(geo, geo.userData.lodIndex);
  return { geo, lod, mane: [...mane.main, ...mane.fill], tail: [...tail.main, ...tail.fill], body };
}

// Géométries par gabarit, partagées par les chevaux de ce gabarit. Celles qui ne servent plus (cheval
// vendu, vignettes de l'animalerie faites) restent sous la main quelques-unes, puis sont libérées.
const shapes = new Map();
const SPARE_SHAPES = 6;

function releaseShape(S) {
  S.users = Math.max(0, S.users - 1);
  if (S.users > 0) return;
  S.idleAt = performance.now?.() ?? Date.now();
  const idle = [...shapes.values()].filter((x) => x.users === 0).sort((a, b) => a.idleAt - b.idleAt);
  for (const x of idle.slice(0, Math.max(0, idle.length - SPARE_SHAPES))) {
    shapes.delete(x.key);
    for (const g of [x.coatGeo, x.eyeGeo, x.hairGeo, x.hairLod, ...Object.values(x.lod ?? {})]) g?.dispose();
  }
}

/**
 * Version réduite d'une géométrie de race : l'index simplifié du GLB (tools/cheval/lod.mjs) sur les mêmes
 * attributs (positions déformées, poids de la peau, attributs de la robe), partagés avec la géométrie
 * complète : rien de plus en mémoire que l'index, sur la carte graphique comme ici.
 */
function lodGeometry(full, index) {
  if (!index) return null;
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(full.attributes)) g.setAttribute(k, a);
  g.setIndex(new THREE.BufferAttribute(index, 1));
  g.boundingSphere = full.boundingSphere?.clone() ?? null;
  g.userData.shared = true;
  return g;
}

/**
 * Boîtes englobantes par os (repère du cheval, au repos) : chaque sommet compte dans la boîte de chacun des os
 * qui le déplacent (poids > 0). Une fois chaque boîte emmenée par la matrice de peau de son os, leur réunion
 * contient le maillage déformé (un sommet mélangé est entre les positions que lui donnent ses os). Voir
 * horseBounds. box : Float32Array(6 × os) (min x y z, max x y z) ; pos : tableau (x, y, z) ou attribut.
 */
function growBoneBoxes(box, pos, si, sw, count) {
  const attr = !!pos.isBufferAttribute || !!pos.isInterleavedBufferAttribute;
  for (let i = 0; i < count; i++) {
    const x = attr ? pos.getX(i) : pos[i * 3];
    const y = attr ? pos.getY(i) : pos[i * 3 + 1];
    const z = attr ? pos.getZ(i) : pos[i * 3 + 2];
    for (let k = 0; k < 4; k++) {
      if (!(sw[i * 4 + k] > 0)) continue;
      const o = si[i * 4 + k] * 6;
      if (x < box[o]) box[o] = x;
      if (y < box[o + 1]) box[o + 1] = y;
      if (z < box[o + 2]) box[o + 2] = z;
      if (x > box[o + 3]) box[o + 3] = x;
      if (y > box[o + 4]) box[o + 4] = y;
      if (z > box[o + 5]) box[o + 5] = z;
    }
  }
  return box;
}

const emptyBoneBoxes = () => {
  const b = new Float32Array(RIG.length * 6);
  for (let k = 0; k < RIG.length; k++) b.set([Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity], k * 6);
  return b;
};

/**
 * Oreille creusée (le modèle d'origine a des oreilles en feuilles minces) : la feuille est pliée en gouttière, le
 * milieu de sa face avant reculé de EAR_CUP (× la taille de l'oreille), les bords en place, ni la base (raccord
 * avec la tête) ni la pointe. Les deux faces bougent ensemble : l'épaisseur ne change pas, rien ne se retourne.
 * Repère de l'oreille : axe de la base à la pointe (sommet le plus loin de l'articulation), largeur (plus grand
 * étalement en travers), face avant (vers l'avant du cheval). Écrit dans info (attribut hInfo) : y = position en
 * travers (-1 à 1 d'un bord à l'autre), z = face avant (0 à 1 : 1 là où l'oreille est libre, 0 sur la peau de sa
 * base posée sur la tête) ou arrière (-1), pour le shader (intérieur foncé, poils clairs vers les bords).
 */
export const EAR_CUP = 0.008;
function earCup(d, coat, b, joint, scale, info) {
  const ids = [];
  for (let i = 0; i < coat.count; i++) if (dominant(coat, i) === b) ids.push(i);
  if (ids.length < 8) return;
  const P = V();
  let tip = null;
  let far = -1;
  for (const i of ids) {
    const dd = P.fromArray(d.pos, i * 3).distanceTo(joint);
    if (dd > far) {
      far = dd;
      tip = P.clone();
    }
  }
  const a1 = tip.clone().sub(joint).normalize();
  // largeur : plus grand étalement en travers de l'axe (analyse en composantes dans le plan perpendiculaire)
  const t1 = Math.abs(a1.x) < 0.9 ? V(1, 0, 0) : V(0, 0, 1);
  const e1 = t1.addScaledVector(a1, -t1.dot(a1)).normalize();
  const e2 = V().crossVectors(a1, e1);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  const c = V();
  for (const i of ids) c.add(P.fromArray(d.pos, i * 3));
  c.multiplyScalar(1 / ids.length);
  for (const i of ids) {
    P.fromArray(d.pos, i * 3).sub(c);
    const x = P.dot(e1);
    const y = P.dot(e2);
    sxx += x * x;
    sxy += x * y;
    syy += y * y;
  }
  const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const a2 = e1.clone().multiplyScalar(Math.cos(th)).addScaledVector(e2, Math.sin(th));
  const a3 = V().crossVectors(a1, a2);
  if (a3.z < 0) a3.negate();
  // milieu et demi-largeur par tranche de hauteur
  const BINS = 8;
  const lo = new Float32Array(BINS).fill(Infinity);
  const hi = new Float32Array(BINS).fill(-Infinity);
  const hOf = (p) => Math.min(1, Math.max(0, p.clone().sub(joint).dot(a1) / far));
  for (const i of ids) {
    P.fromArray(d.pos, i * 3);
    const k = Math.min(BINS - 1, Math.floor(hOf(P) * BINS));
    const x = P.clone().sub(c).dot(a2);
    lo[k] = Math.min(lo[k], x);
    hi[k] = Math.max(hi[k], x);
  }
  const N = V();
  const moved = new Set();
  for (const i of ids) {
    P.fromArray(d.pos, i * 3);
    const h = hOf(P);
    const k = Math.min(BINS - 1, Math.floor(h * BINS));
    const w = Math.max(-1, Math.min(1, (P.clone().sub(c).dot(a2) - (lo[k] + hi[k]) / 2) / Math.max(1e-4, (hi[k] - lo[k]) / 2)));
    const front = N.fromArray(d.nrm, i * 3).dot(a3) >= 0;
    let ew = 0;
    for (let q = 0; q < 4; q++) if (coat.si[i * 4 + q] === b) ew += coat.sw[i * 4 + q];
    const free = smooth(0.97, 1, ew) * smooth(0.18, 0.36, h);
    info[i * 3 + 1] = w;
    info[i * 3 + 2] = front ? free : -1;
    // (seulement là où l'oreille est libre : la peau de sa base, à demi liée à la tête, ne bouge pas)
    const amt = EAR_CUP * scale * (1 - w * w) * smooth(0.22, 0.42, h) * (1 - smooth(0.75, 1, h)) * smooth(0.97, 1, ew);
    if (amt <= 1e-5) continue;
    P.addScaledVector(a3, -amt);
    d.pos.set([P.x, P.y, P.z], i * 3);
    moved.add(i);
  }
  // (normales refaites sur les seuls sommets déplacés : celles du GLB, lissées, restent ailleurs)
  recomputeNormals(d, coat, moved);
}

/** Normales des sommets choisis refaites sur les triangles qui les touchent (pondérées par l'aire). */
function recomputeNormals(d, coat, set) {
  const acc = new Map();
  const A = V();
  const B2 = V();
  const C = V();
  const n = V();
  for (let t = 0; t < coat.index.length; t += 3) {
    const a = coat.index[t];
    const b = coat.index[t + 1];
    const c = coat.index[t + 2];
    if (!set.has(a) && !set.has(b) && !set.has(c)) continue;
    A.fromArray(d.pos, a * 3);
    B2.fromArray(d.pos, b * 3).sub(A);
    C.fromArray(d.pos, c * 3).sub(A);
    n.crossVectors(B2, C);
    for (const k of [a, b, c]) {
      if (!set.has(k)) continue;
      const s = acc.get(k) ?? V();
      s.add(n);
      acc.set(k, s);
    }
  }
  for (const [k, s] of acc) {
    if (s.lengthSq() < 1e-20) continue;
    // (même côté que l'ancienne normale : un triangle de sens inverse dans le GLB ne la retourne pas)
    if (s.dot(n.fromArray(d.nrm, k * 3)) < 0) s.negate();
    s.normalize();
    d.nrm.set([s.x, s.y, s.z], k * 3);
  }
}

/**
 * Naseau du modèle (une fente, mesurée sur la photo d'origine : x ±0,072, y 0,112, z 0,882 dans le repère de la
 * tête du GLB, en longueurs de tête ; r : taille de la virgule peinte) ; nostrilAt le replace sur la tête de la
 * race (profil busqué ou camus, tête de poulain). NOSTRIL.depth : creux du naseau ouvert (m, cheval de taille 1).
 */
export const NOSTRIL = { x: 0.072, y: 0.112, z: 0.882, r: 0.03, depth: 0.009 };
function nostrilAt(base, D, toHead) {
  const poll = base.rest[BONE_INDEX.Head];
  const L = base.snout.distanceTo(poll);
  const q = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), base.headTilt);
  const restP = V(NOSTRIL.x, NOSTRIL.y, NOSTRIL.z).multiplyScalar(L).applyQuaternion(q).add(poll);
  const out = toHead(D.maps[BONE_INDEX.Head](restP, V()));
  out.x = Math.abs(out.x);
  return out;
}

/**
 * Naseaux ouverts : les sommets du pelage autour de chaque fente reculent dans la tête (jusqu'à NOSTRIL.depth au
 * centre, en cloche serrée), le long de leur normale ; la virgule sombre est peinte par le shader de la robe (hNos).
 */
function openNostrils(d, coat, nos, toHead, headLen) {
  const moved = new Set();
  const P = V();
  const N = V();
  const r = NOSTRIL.r * 1.1;
  for (let i = 0; i < coat.count; i++) {
    const b = dominant(coat, i);
    if (b !== BONE_INDEX.Head) continue;
    P.fromArray(d.pos, i * 3);
    const h = toHead(P);
    const dx = Math.abs(h.x) - nos.x;
    const dy = h.y - nos.y;
    const dz = h.z - nos.z;
    const q = (dx * dx + dy * dy * 1.4 + dz * dz * 0.65) / (r * r);
    if (q >= 1) continue;
    const amt = NOSTRIL.depth * (headLen / 0.54) * (1 - q) ** 3;
    N.fromArray(d.nrm, i * 3);
    P.addScaledVector(N, -amt);
    d.pos.set([P.x, P.y, P.z], i * 3);
    moved.add(i);
  }
  if (moved.size) recomputeNormals(d, coat, moved);
}

/** Œil gauche dans le repère de la tête (centre |x|, y, z et rayon, en longueurs de tête). */
function eyeInHead(de, base, toHead, rScale) {
  const eye = base.prims.eye;
  const c = V();
  let n = 0;
  for (let i = 0; i < eye.count; i++) {
    if (de.pos[i * 3] <= 0) continue;
    c.add(_v.fromArray(de.pos, i * 3));
    n++;
  }
  if (!n || !base.eyes?.length) return [0, 0, 0, 0];
  c.multiplyScalar(1 / n);
  const h = toHead(c);
  return [Math.abs(h.x), h.y, h.z, base.eyes[0].r * rScale];
}

/** Géométries (partagées) d'un gabarit : pelage, yeux, crins, avec les attributs du shader de la robe. */
function shapeFor(base, B) {
  const key = JSON.stringify(B);
  let S = shapes.get(key);
  if (S) {
    S.users++;
    return S;
  }
  const D = deformer(base, B);
  const coat = base.prims.coat;
  const dc = deformPrim(coat, D);
  const de = deformPrim(base.prims.eye, D);
  const heads = D.heads;
  const elbowY = (heads[BONE_INDEX.FL2].y + heads[BONE_INDEX.FR2].y) / 2;
  // Attributs du shader de la robe (horseCoat.js) : partie du corps, repère de la tête, hauteur sur le membre.
  const n = coat.count;
  const part = new Float32Array(n);
  const info = new Float32Array(n * 3);
  const ao = new Float32Array(n);
  const poll = heads[BONE_INDEX.Head];
  const headQ = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), base.headTilt).invert();
  const headLen = base.snout.distanceTo(base.rest[BONE_INDEX.Head]) * D.scale.head * D.scale.snout;
  const legOf = (b) => LEGS.findIndex(([k]) => RIG[b][0].startsWith(k));
  const zMidLegs = (heads[BONE_INDEX.FL3].z + heads[BONE_INDEX.HL3].z) / 2;
  const P = V();
  for (let i = 0; i < n; i++) {
    const b = dominant(coat, i);
    const name = RIG[b][0];
    P.fromArray(dc.pos, i * 3);
    ao[i] = 0.45 + 0.55 * coat.ao[i];
    if (name === 'Head') {
      const h = P.clone().sub(poll).applyQuaternion(headQ).multiplyScalar(1 / headLen);
      part[i] = PART.head;
      info.set([h.x, h.y, h.z], i * 3);
    } else if (name === 'EarL' || name === 'EarR') {
      part[i] = PART.ear;
      const e = heads[b];
      info[i * 3] = Math.min(1, Math.max(0, (P.y - e.y) / 0.16));
    } else {
      // (hauteur relative partout sur le corps aussi : un triangle à cheval entre le corps et un
      // membre n'a pas de « fausse balzane » au bord ; membre le plus proche selon le quart du corps)
      const li = legOf(b);
      const near = (P.z > zMidLegs ? 0 : 2) + (P.x >= 0 ? 0 : 1);
      part[i] = li >= 0 && (!name.endsWith('1') || P.y < elbowY * 0.9) ? PART.leg0 + li : PART.body;
      info.set([P.y / elbowY, li >= 0 ? li : near, 0], i * 3);
    }
  }
  // Poids de la tête (os de la tête et des oreilles), continu d'un sommet à l'autre et adouci : la robe
  // pie le prend pour sa tête foncée (un numéro de partie, constant par triangle, ferait des dents de scie
  // à la jonction avec l'encolure).
  const headW = new Float32Array(n);
  const hb = [BONE_INDEX.Head, BONE_INDEX.EarL, BONE_INDEX.EarR];
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 4; k++) if (hb.includes(coat.si[i * 4 + k])) headW[i] += coat.sw[i * 4 + k];
  }
  smoothOnMesh(headW, coat.index, 3);
  // Finitions de près (étape 9) : oreilles creusées (et leur face avant repérée pour le shader : poils clairs à
  // l'intérieur), naseau ouvert, œil et sabots repérés pour le shader de la robe.
  const earScale = D.scale.head ** 0.6 * (B.ears ?? 1);
  for (const e of ['EarL', 'EarR']) earCup(dc, coat, BONE_INDEX[e], heads[BONE_INDEX[e]], earScale, info);
  const toHead = (p) => p.clone().sub(poll).applyQuaternion(headQ).multiplyScalar(1 / headLen);
  const nostril = nostrilAt(base, D, toHead);
  openNostrils(dc, coat, nostril, toHead, headLen);
  const geo = (d, prim, extra) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(d.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(d.nrm, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(prim.uv, 2));
    g.setAttribute('skinIndex', new THREE.BufferAttribute(prim.si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(prim.sw, 4));
    for (const [k, a] of Object.entries(extra ?? {})) g.setAttribute(k, a);
    g.setIndex(new THREE.BufferAttribute(prim.index, 1));
    g.computeBoundingSphere();
    g.userData.shared = true;
    return g;
  };
  const hoofY = 0.128 * D.scale.hoof;
  const soles = base.sole.map((pts) => pts.map((p) => p.clone().multiplyScalar(D.scale.hoof)));
  // (centre de la sole de chaque sabot, x et z, au repos : la couronne descend de la pince vers les talons)
  const hooves = LEGS.map(([k], i) => {
    const c = heads[BONE_INDEX[k + '4']].clone().add(soles[i][1]);
    return [c.x, c.z];
  });
  // (centre de l'œil gauche dans le repère de la tête, |x|, et son rayon, en longueurs de tête)
  const eyeHL = eyeInHead(de, base, toHead, D.scale.head / headLen);
  S = {
    B,
    D,
    heads,
    coatGeo: geo(dc, coat, {
      hPart: new THREE.BufferAttribute(part, 1),
      hInfo: new THREE.BufferAttribute(info, 3),
      hAO: new THREE.BufferAttribute(ao, 1),
      hHead: new THREE.BufferAttribute(headW, 1),
    }),
    // (axe du regard par sommet : le reflet reste dans l'ouverture des paupières, eyeMaterial)
    eyeGeo: geo(de, base.prims.eye, base.prims.eye.axis ? { eyeAxis: new THREE.BufferAttribute(base.prims.eye.axis, 3) } : null),
    // Boîtes par os (culling, voir horseBounds), sur le pelage, les yeux et les crins de la race.
    boneBox: emptyBoneBoxes(),
    hoofY,
    hooves,
    eyeHL,
    nostril: [nostril.x, nostril.y, nostril.z, NOSTRIL.r],
    elbowY,
    headLen,
    soles,
    crest: base.hair.crest.map(([t, c]) => [t, D.maps[BONE_INDEX.Neck](c, V())]),
  };
  growBoneBoxes(S.boneBox, dc.pos, coat.si, coat.sw, coat.count);
  growBoneBoxes(S.boneBox, de.pos, base.prims.eye.si, base.prims.eye.sw, base.prims.eye.count);
  // Version réduite (si le GLB en a une) : mêmes sommets, index simplifié.
  const lc = lodGeometry(S.coatGeo, coat.lodIndex);
  if (lc) {
    S.lod = {
      coat: lc,
      eye: lodGeometry(S.eyeGeo, base.prims.eye.lodIndex) ?? S.eyeGeo,
    };
  }
  S.measure = measureShape(S, dc.pos, coat, base);
  // Crins en cartes (crinière, toupet, queue) posés sur la peau de la race (les crins du GLB ne servent plus).
  const hair = hairShape(S, B, dc.pos, coat, base);
  S.hairGeo = hair.geo;
  S.hairLod = hair.lod;
  const hg = hair.geo.attributes;
  growBoneBoxes(S.boneBox, hg.position, hg.skinIndex.array, hg.skinWeight.array, hg.position.count);
  S.braids = measureBraids(S, hair, dc.pos, base);
  S.key = key;
  S.users = 1;
  shapes.set(key, S);
  return S;
}

/** Adoucit une valeur par sommet (moyenne avec les voisins du maillage, passes fois). */
function smoothOnMesh(val, index, passes) {
  const n = val.length;
  const sum = new Float32Array(n);
  const cnt = new Uint16Array(n);
  for (let p = 0; p < passes; p++) {
    sum.fill(0);
    cnt.fill(0);
    for (let t = 0; t < index.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = index[t + e];
        const b = index[t + (e + 1) % 3];
        sum[a] += val[b];
        cnt[a]++;
        sum[b] += val[a];
        cnt[b]++;
      }
    }
    for (let i = 0; i < n; i++) if (cnt[i]) val[i] = 0.5 * val[i] + 0.5 * (sum[i] / cnt[i]);
  }
}

/**
 * Places des tresses du concours de beauté (Beauty.js), mesurées sur les crins de la race (repère du
 * cheval, au repos) : sur la peau de la crête, au milieu des racines de la crinière (7 tresses de la première racine
 * de crins, pas la peau nue du garrot, jusqu'à t = 0,86 vers la nuque) ; crestCovered : les mêmes, mais
 * devant le bord avant d'une couverture (dims.blanket, couverture d'été comprise) ; sur la queue, le long de
 * la face arrière des crins du milieu depuis leur sortie de la croupe (pas l'articulation cachée dedans).
 */
function measureBraids(S, hair, cpos, base) {
  const coat = base.prims.coat;
  const heads = S.heads;
  const axis = heads[BONE_INDEX.Head].clone().sub(heads[BONE_INDEX.Neck]).normalize();
  const up = V(0, axis.z, -axis.y);
  if (up.y < 0) up.negate();
  const crestAt = (t) => {
    const c = S.crest;
    const k = Math.min(c.length - 2, Math.max(0, Math.floor(t * (c.length - 1))));
    return c[k][1].clone().lerp(c[k + 1][1], t * (c.length - 1) - k);
  };
  const P = V();
  // Racines des mèches de la crinière (cartes de crins) autour d'un point de la crête, à moins de `along` le
  // long de l'encolure.
  const roots = hair.mane.map((c) => c.meta.root);
  const rootsAt = (c, along) => {
    let n = 0;
    for (const p of roots) {
      P.copy(p).sub(c);
      if (Math.abs(P.dot(axis)) <= along && Math.abs(P.x) <= 0.05) n++;
    }
    return n;
  };
  const T1 = 0.86;
  // Début de la crinière, depuis le garrot (le premier bouton était sur la peau nue du garrot, qui suit le
  // tronc : il flottait quand le cheval broute et s'enfonçait dans la couverture).
  const neckLen = heads[BONE_INDEX.Head].distanceTo(heads[BONE_INDEX.Neck]);
  const knobR = 0.085 * 0.32; // (rayon d'un bouton, Beauty.js : R × 0,085, cheval de taille 1)
  let tMane = 0.14;
  if (S.crest.length > 1) {
    for (let t = 0; t <= 0.5; t += 0.01) {
      if (rootsAt(crestAt(t), 0.02) >= 2) {
        tMane = Math.min(0.4, t + (0.4 * knobR) / Math.max(0.2, neckLen));
        break;
      }
    }
  }
  // Bord avant d'une couverture (gearModels.js : dims.blanket[1], + 4 cm pour celle d'été) : rien derrière.
  const front = heads[BONE_INDEX.Neck].z + 0.1 + 0.04 + knobR;
  let tFront = tMane;
  while (tFront < 0.6 && S.crest.length > 1 && crestAt(tFront).z < front) tFront += 0.01;
  const knobs = (t0) => {
    const out = [];
    for (let i = 0; i < 7 && S.crest.length > 1; i++) {
      const c = crestAt(t0 + (i / 6) * (T1 - t0));
      // (sur la peau de la crête : tressée, la crinière rentre dans les boutons — hairBraid — et ne laisse dessous
      // que ses racines ; posés au-dessus du début des mèches, les boutons flottaient avec un jour dessous)
      // 3e élément : la peau de la crête à mi-chemin du bouton suivant (bourrelet de crins tressés, Beauty.js),
      // prise sur la crête et pas sur la corde entre les boutons (l'encolure creuse devant le garrot du Frison).
      const mid = i < 6 ? crestAt(t0 + ((i + 0.5) / 6) * (T1 - t0)).addScaledVector(up, 0.004) : null;
      out.push([c.addScaledVector(up, 0.004), up.clone(), mid]);
    }
    return out;
  };
  const crest = knobs(tMane);
  const crestCovered = tFront > tMane ? knobs(tFront) : crest;
  // Queue : la racine la plus haute des mèches (au milieu), puis la face arrière des mèches du milieu.
  let top = null;
  for (const c of hair.tail) {
    const p = c.meta.root;
    if (Math.abs(p.x) < 0.05 && (!top || p.y > top.y)) top = p.clone();
  }
  // (point d'une mèche à la hauteur y, entre ses points : [x, z] ou null)
  const atY = (pts, y) => {
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      if ((a.y - y) * (b.y - y) > 0 || a.y === b.y) continue;
      const u = (y - a.y) / (b.y - a.y);
      return [a.x + (b.x - a.x) * u, a.z + (b.z - a.z) * u];
    }
    return null;
  };
  const tail = [];
  if (top) {
    // Peau du tronçon de queue (sommets liés aux os de la queue) : la tresse passe derrière elle aussi.
    const dock = [];
    for (let i = 0; i < coat.count; i++) {
      const b = dominant(coat, i);
      if ((b === BONE_INDEX.Tail1 || b === BONE_INDEX.Tail2) && Math.abs(cpos[i * 3]) < 0.04) dock.push(i);
    }
    // (un peu sous la racine la plus haute : à la jonction avec la croupe, la peau ne suit qu'à moitié
    // les os de la queue, la première perle y entrait quand la queue est relevée ou chasse les mouches)
    const L = 0.25;
    const N = 8;
    const y0 = top.y - 0.02;
    let z = top.z;
    for (let j = 0; j <= N; j++) {
      const y = y0 - (L * j) / N;
      let zb = Infinity;
      for (const c of hair.tail) {
        const q = atY(c.pts, y);
        if (q && Math.abs(q[0]) <= 0.04) zb = Math.min(zb, q[1]);
      }
      for (const i of dock) if (Math.abs(cpos[i * 3 + 1] - y) < 0.03) zb = Math.min(zb, cpos[i * 3 + 2]);
      // (jamais plus en avant que le point d'au-dessus : la queue descend vers l'arrière)
      z = Math.min(z, Number.isFinite(zb) ? zb : z);
      tail.push(V(0, y, z));
    }
    // Lissé (la face arrière des mèches fait des marches) et décollé des crins.
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 1; j < tail.length - 1; j++) tail[j].z = (tail[j - 1].z + tail[j].z * 2 + tail[j + 1].z) / 4;
    }
    // La dernière perle prolonge la tresse lissée (le lissage rentre les perles du milieu dans les crins :
    // seule, sur la face arrière brute, la dernière pendait dans le vide derrière la queue).
    if (tail.length > 2) {
      const n = tail.length - 1;
      tail[n].z = Math.max(tail[n].z, 2 * tail[n - 1].z - tail[n - 2].z);
    }
    for (const p of tail) p.add(V(0, 0.006, -0.02));
  }
  return { crest, crestCovered, tail };
}

// ------------------------------------------------------------------ mesures (selle, équipement)

/**
 * Coupes du tronc et de la tête mesurées sur la géométrie de la race : champs de distance approchés
 * (comme gltfHorseFit.js) pour que gearModels.js pose la couverture, la selle, la sangle, le filet…
 */
function measureShape(S, pos, coat, base) {
  const heads = S.heads;
  const n = coat.count;
  const trunkTri = [];
  const headTri = [];
  const idx = coat.index;
  const isTrunk = new Uint8Array(n);
  const isHead = new Uint8Array(n);
  const upper = new Set(['FL2', 'FR2', 'HL2', 'HR2']);
  for (let i = 0; i < n; i++) {
    const nm = RIG[dominant(coat, i)][0];
    // (haut de la cuisse et de l'avant-bras compris : la coupe de la croupe reste fermée)
    // (sans l'attache de la queue : la couverture ne monte pas en pointe par-dessus)
    isTrunk[i] = (TRUNK.has(nm) && nm !== 'Tail1') || nm === 'Neck' || (upper.has(nm) && pos[i * 3 + 1] > S.elbowY - 0.04) ? 1 : 0;
    isHead[i] = nm === 'Head' ? 1 : 0;
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t];
    const b = idx[t + 1];
    const c = idx[t + 2];
    if (isTrunk[a] && isTrunk[b] && isTrunk[c]) trunkTri.push(a, b, c);
    if (isHead[a] + isHead[b] + isHead[c] >= 2) headTri.push(a, b, c);
  }
  // Tronc : coupes en z (repère du corps), centre à mi-hauteur, rayons tous les 15° de -90° à +90° (côté +x).
  const zH = heads[BONE_INDEX.Spine].z;
  const zN = heads[BONE_INDEX.Neck].z;
  const torso = sections(pos, trunkTri, (p) => p, zH - 0.3, zN + 0.42, 0.04);
  // Tête : repère du groupe head (origine à la nuque, z le long du chanfrein).
  const poll = heads[BONE_INDEX.Head];
  const hq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), base.headTilt).invert();
  const toHead = (p) => p.clone().sub(poll).applyQuaternion(hq);
  const head = sections(pos, headTri, toHead, -0.16, S.headLen + 0.02, 0.025);
  // Ligne du dos : le haut de chaque coupe du tronc (interpolé).
  const rings = torso.rings;
  const dz = rings[1][0] - rings[0][0];
  const backTop = (z) => {
    const f = Math.min(rings.length - 1.001, Math.max(0, (z - rings[0][0]) / dz));
    const i = Math.floor(f);
    return rings[i][3] + (rings[i + 1][3] - rings[i][3]) * (f - i);
  };
  const bellyAt = (z) => {
    const f = Math.min(rings.length - 1.001, Math.max(0, (z - rings[0][0]) / dz));
    const i = Math.floor(f);
    return rings[i][4] + (rings[i + 1][4] - rings[i][4]) * (f - i);
  };
  return { torso, head, backTop, bellyAt };
}

/**
 * Coupes d'une forme triangulée le long de z (dans le repère donné par toFrame) : pour chaque coupe,
 * les points où les arêtes la traversent, puis le centre et le rayon par secteur de 15°.
 * Renvoie un champ de distance approché f(x, y, z) et ses coupes.
 */
function sections(pos, tris, toFrame, z0, z1, dz) {
  const STEP = Math.PI / 12;
  const rings = [];
  const nv = pos.length / 3;
  const fp = new Float32Array(nv * 3);
  for (let i = 0; i < nv; i++) {
    const q = toFrame(V(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]));
    fp[i * 3] = q.x;
    fp[i * 3 + 1] = q.y;
    fp[i * 3 + 2] = q.z;
  }
  // 1) Points de chaque coupe (arêtes qui traversent le plan z), haut et bas près du milieu.
  const raw = [];
  for (let z = z0; z <= z1 + 1e-6; z += dz) {
    const pts = [];
    for (let t = 0; t < tris.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = tris[t + e];
        const b = tris[t + (e + 1) % 3];
        const za = fp[a * 3 + 2];
        const zb = fp[b * 3 + 2];
        if ((za - z) * (zb - z) > 0 || za === zb) continue;
        const u = (z - za) / (zb - za);
        pts.push([Math.abs(fp[a * 3] + (fp[b * 3] - fp[a * 3]) * u), fp[a * 3 + 1] + (fp[b * 3 + 1] - fp[a * 3 + 1]) * u]);
      }
    }
    if (pts.length < 6) {
      raw.push(null);
      continue;
    }
    let top = -Infinity;
    let bot = Infinity;
    for (const [x, y] of pts) {
      if (x < 0.1) {
        top = Math.max(top, y);
        bot = Math.min(bot, y);
      }
    }
    if (!Number.isFinite(top)) for (const [, y] of pts) {
      top = Math.max(top, y);
      bot = Math.min(bot, y);
    }
    // Coupe ouverte en haut : près de la hanche, le milieu du dessus de la croupe est lié à l'attache de la queue
    // (exclue du tronc) ; sans lui, le haut de la coupe tombait à l'intérieur des cuisses (0,8 m au lieu de 1,4 m
    // chez un Shetland) et la couverture s'arrêtait à la hanche. Le haut est repris des côtés de la croupe.
    let side = -Infinity;
    for (const [, y] of pts) side = Math.max(side, y);
    if (top < side - 0.1) top = side;
    raw.push({ z, pts, top, bot });
  }
  // 2) Coupe ouverte en bas (entre les cuisses, l'intérieur des membres n'est pas compté) : le bas
  // est repris des coupes voisines bien fermées.
  const hs = raw.filter(Boolean).map((r) => r.top - r.bot).sort((a, b) => a - b);
  const med = hs.length ? hs[Math.floor(hs.length / 2)] : 0;
  const good = raw.map((r) => !!r && r.top - r.bot > med * 0.45);
  raw.forEach((r, i) => {
    if (!r || good[i]) return;
    let a = i - 1;
    while (a >= 0 && !good[a]) a--;
    let b = i + 1;
    while (b < raw.length && !good[b]) b++;
    if (a < 0 && b >= raw.length) return;
    const ba = a >= 0 ? raw[a].bot : raw[b].bot;
    const bb = b < raw.length ? raw[b].bot : raw[a].bot;
    const u = a >= 0 && b < raw.length ? (i - a) / (b - a) : 0;
    r.bot = Math.min(r.bot, ba + (bb - ba) * u);
  });
  // 3) Centre (lissé d'une coupe à l'autre), puis rayon par secteur.
  const yc0 = raw.map((r) => (r ? (r.top + r.bot) / 2 : null));
  raw.forEach((r, i) => {
    if (!r) {
      rings.push(null);
      return;
    }
    const nb = [yc0[i - 1], yc0[i], yc0[i], yc0[i + 1]].filter((v) => v !== null && v !== undefined);
    const yc = nb.reduce((x, y) => x + y, 0) / nb.length;
    const rr = new Array(13).fill(0);
    for (const [x, y] of r.pts) {
      const a = Math.atan2(y - yc, x);
      const k = Math.round((a + Math.PI / 2) / STEP);
      if (k < 0 || k > 12) continue;
      rr[k] = Math.max(rr[k], Math.hypot(x, y - yc));
    }
    // secteurs vides (ou coupe ouverte en bas) : voisins, et au moins jusqu'au bas retenu
    rr[0] = Math.max(rr[0], yc - r.bot);
    for (let pass = 0; pass < 3; pass++) {
      for (let k = 0; k <= 12; k++) {
        if (rr[k] > 0) continue;
        const a = rr[k - 1] ?? 0;
        const b = rr[k + 1] ?? 0;
        rr[k] = a && b ? (a + b) / 2 : a || b;
      }
    }
    rings.push([r.z, yc, rr, r.top, r.bot]);
  });
  // coupes manquantes aux bouts : la plus proche
  const first = rings.findIndex(Boolean);
  if (first < 0) {
    // (rien de mesuré : une forme ronde par défaut, pour ne jamais bloquer)
    for (let i = 0; i < rings.length; i++) rings[i] = [z0 + i * dz, 0, new Array(13).fill(0.1), 0.1, -0.1];
  }
  const last = rings.length - 1 - [...rings].reverse().findIndex(Boolean);
  for (let i = 0; i < rings.length; i++) {
    if (rings[i]) continue;
    const j = i < first ? first : i > last ? last : null;
    if (j !== null) rings[i] = [z0 + i * dz, rings[j][1], rings[j][2].map((x) => x * 0.6), rings[j][1] + (rings[j][3] - rings[j][1]) * 0.6, rings[j][1] + (rings[j][4] - rings[j][1]) * 0.6];
    else {
      let a = i - 1;
      while (!rings[a]) a--;
      let b = i + 1;
      while (!rings[b]) b++;
      const u = (i - a) / (b - a);
      const mix = (k) => rings[a][k] * (1 - u) + rings[b][k] * u;
      rings[i] = [z0 + i * dz, mix(1), rings[a][2].map((x, k) => x * (1 - u) + rings[b][2][k] * u), mix(3), mix(4)];
    }
  }
  const nR = rings.length;
  const ringAt = (rr, a) => {
    const f = Math.min(11.999, Math.max(0, (a + Math.PI / 2) / STEP));
    const i = Math.floor(f);
    return rr[i] + (rr[i + 1] - rr[i]) * (f - i);
  };
  const za = z0;
  const zEnd0 = z0 - dz * 0.5;
  const zEnd1 = z0 + (nR - 1) * dz + dz * 0.5;
  const f = (x, y, z) => {
    const fz = Math.min(nR - 1.001, Math.max(0, (z - za) / dz));
    const i = Math.floor(fz);
    const k = fz - i;
    const A = rings[i];
    const Bq = rings[i + 1];
    const yc = A[1] + (Bq[1] - A[1]) * k;
    const dy = y - yc;
    const ax = Math.abs(x);
    const a = Math.atan2(dy, ax);
    const rr = ringAt(A[2], a) * (1 - k) + ringAt(Bq[2], a) * k;
    return Math.max(Math.hypot(ax, dy) - rr, z - zEnd1, zEnd0 - z);
  };
  f.rings = rings;
  return f;
}

// ------------------------------------------------------------------ matières

/**
 * Cartes de crins (crinière, toupet, queue, brosse, fanons) : rubans de quelques points, texture de crins
 * droits (horseHair.js : u le long de la mèche, de la racine à la pointe ; v en travers), ton ou couleur et os
 * par sommet. cards : [{ pts, w0, w1, side, normal | normals, color, uv: [u0, u1, v, dv], weights(p, f),
 * sway?, kind?, root? }] — normal(s) : normale « de volume » (vers l'extérieur de la crinière), la même des deux
 * côtés du ruban (l'ondulation déplace la carte d'un bloc, sans la gonfler) ; kind : 0 crinière, 1 toupet, 2 queue,
 * 3 fanons (la queue et les fanons ondulent aussi de côté ; la crinière rentre dans les tresses) ; root : racine de
 * la mèche (par défaut son premier point ; sur la peau de la crête pour une carte de crinière partie du flanc du
 * rouleau). masses : grilles de la masse (crins « en volume », sortes + 8), voir plus bas. Attributs pour la matière
 * des crins : hairG (0 racine → 1 pointe), hairT (direction de la mèche, pour le reflet), hairRoot (racine de la
 * mèche et sorte : elle ondule d'un bloc).
 */
function hairCards(cards, { masses = [], mainCount = 0 } = {}) {
  const pos = [];
  const nrm = [];
  const uv = [];
  const col = [];
  const si = [];
  const sw = [];
  const hg = [];
  const ht = [];
  const hr = [];
  const idx = [];
  // (version réduite des cartes principales : un point sur deux le long de la mèche, bouts gardés — de loin, la
  // courbe d'une mèche n'a pas besoin de ses dix points)
  const lodIdx = [];
  const tan = V();
  const n0 = V();
  cards.forEach((c, ci) => {
    const base0 = pos.length / 3;
    const n = c.pts.length;
    const [u0, u1, v, dv] = c.uv;
    const r = c.root ?? c.pts[0];
    const kind = c.kind ?? 0;
    for (let i = 0; i < n; i++) {
      const f = i / (n - 1);
      const p = c.pts[i];
      tan.subVectors(c.pts[Math.min(n - 1, i + 1)], c.pts[Math.max(0, i - 1)]).normalize();
      // (normale « de volume » si la carte en donne une : la même des deux côtés du ruban)
      if (c.normals) n0.copy(c.normals[i]);
      else if (c.normal) n0.copy(c.normal);
      else n0.crossVectors(c.side, tan).normalize();
      // (rootTaper : la carte s'élargit depuis sa racine — une mèche qui sort de la masse en pointe, pas un bord coupé
      // droit en travers)
      const w = ((c.w0 + (c.w1 - c.w0) * f) / 2) * (c.rootTaper ? 0.3 + 0.7 * smooth(0, c.rootTaper, f) : 1);
      const ww = c.weights(p, f);
      // (somme 1 : un poids négligeable écarté par une carte ne doit pas rétrécir le sommet vers l'origine)
      let wsum = 0;
      for (let q = 0; q < 4; q++) wsum += ww[q]?.[1] ?? 0;
      wsum = wsum || 1;
      // (racine plus sombre, pointe un peu plus claire)
      const shade = 0.72 + 0.28 * smooth(0, 0.3, f) + 0.1 * f;
      for (const k of [-1, 1]) {
        pos.push(p.x + c.side.x * w * k, p.y + c.side.y * w * k, p.z + c.side.z * w * k);
        nrm.push(n0.x, n0.y, n0.z);
        // (v des cartes dans la bande du haut de la texture : HAIR_V)
        uv.push(u0 + (u1 - u0) * f, (v + dv * k) * HAIR_V);
        col.push(c.color.r * shade, c.color.g * shade, c.color.b * shade);
        for (let q = 0; q < 4; q++) {
          si.push(ww[q]?.[0] ?? 0);
          sw.push((ww[q]?.[1] ?? 0) / wsum);
        }
        hg.push(f * (c.sway ?? 1));
        ht.push(tan.x, tan.y, tan.z);
        hr.push(r.x, r.y, r.z, kind);
      }
      if (i < n - 1) {
        const a = base0 + i * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    if (ci < mainCount) {
      for (let i = 0; i < n - 1; ) {
        const j = Math.min(n - 1, i + (n > 4 ? 2 : 1));
        const a = base0 + i * 2;
        const b = base0 + j * 2;
        lodIdx.push(a, b, a + 1, a + 1, b, b + 1);
        i = j;
      }
    }
  });
  // Masses (crinière, toupet, queue « en volume ») : grilles de points (rangées en travers, colonnes le long des
  // crins), après les cartes dans les sommets, avant elles dans l'index (dessinées d'abord, toujours gardées par
  // la version réduite, une rangée et une colonne sur deux).
  const midx = [];
  const mlod = [];
  const vm = 2 / (HAIR_TEX.h + HAIR_MASS.h);
  for (const M of masses) {
    const R = M.P.length;
    const C = M.P[0].length;
    const u0m = M.u0 ?? 0;
    const u1m = M.u1 ?? 1;
    const at = (j, k) => M.P[M.closed ? (j + R) % R : Math.min(R - 1, Math.max(0, j))][Math.min(C - 1, Math.max(0, k))];
    // normales (vers l'extérieur) et direction des crins
    const N = [];
    const Tg = [];
    for (let j = 0; j < R; j++) {
      const nr = [];
      const tr = [];
      for (let k = 0; k < C; k++) {
        const dk = at(j, k + 1).clone().sub(at(j, k - 1));
        const dj = at(j + 1, k).clone().sub(at(j - 1, k));
        const o = M.out(j, k).normalize();
        const nn = V().crossVectors(dk, dj);
        if (nn.dot(o) < 0) nn.negate();
        if (nn.lengthSq() < 1e-14) nn.copy(o);
        // (là où les rangées se rejoignent — la pointe d'une mèche —, la normale de la grille ne veut plus rien dire :
        // celle du volume ; sinon une pointe tournée vers le sol prenait la lumière du sol, en taches sombres)
        const wj = Math.min(1, dj.length() / Math.max(1e-6, 0.5 * dk.length()));
        const soft = typeof M.soft === 'function' ? M.soft(j, k) : (M.soft ?? 0);
        nr.push(nn.normalize().lerp(o, Math.max(soft, 1 - wj)).normalize());
        tr.push(dk.lengthSq() > 1e-14 ? dk.normalize() : V(0, -1, 0));
      }
      N.push(nr);
      Tg.push(tr);
    }
    // rangées dépliées par bandes de texture (une rangée de bord en double : la bande suivante repart en haut)
    const S = M.strip;
    const nrows = M.closed ? R + 1 : R;
    const strips = [];
    for (let s0 = 0; s0 < nrows - 1; s0 += S) strips.push([s0, Math.min(nrows - 1, s0 + S)]);
    for (const [a, b] of strips) {
      const base0 = pos.length / 3;
      // (une bande sur deux retournée en travers : le motif des mèches ne se répète pas tel quel le long de la crête ;
      // les bords de deux bandes voisines tombent sur la même ligne de la texture, sans raccord visible)
      const flip = Math.floor(a / S) % 2 === 1;
      for (let jj = a; jj <= b; jj++) {
        const j = jj % R;
        const lv = flip ? 1 - (jj - a) / S : (jj - a) / S;
        for (let k = 0; k < C; k++) {
          const p = M.P[j][k];
          const nn = N[j][k];
          const tt = Tg[j][k];
          pos.push(p.x, p.y, p.z);
          nrm.push(nn.x, nn.y, nn.z);
          // (u : de M.u0 — après les pointes du bord gauche de la crinière — au bout des crins)
          uv.push(u0m + (u1m - u0m) * (k / (C - 1)), HAIR_V + vm + (1 - HAIR_V - 2 * vm) * ((M.v0 ?? 0) + lv * (M.vSpan ?? 1)));
          const tone = M.tone(j, k);
          col.push(tone, tone, tone);
          const ww = M.weights(j, k);
          let wsum = 0;
          for (let q = 0; q < 4; q++) wsum += ww[q]?.[1] ?? 0;
          wsum = wsum || 1;
          for (let q = 0; q < 4; q++) {
            si.push(ww[q]?.[0] ?? 0);
            sw.push((ww[q]?.[1] ?? 0) / wsum);
          }
          hg.push(M.G(j, k));
          ht.push(tt.x, tt.y, tt.z);
          const r = M.root[j];
          hr.push(r.x, r.y, r.z, M.kind + 8);
        }
      }
      const vi = (jj, k) => base0 + (jj - a) * C + k;
      for (let jj = a; jj < b; jj++) {
        for (let k = 0; k < C - 1; k++) midx.push(vi(jj, k), vi(jj, k + 1), vi(jj + 1, k), vi(jj + 1, k), vi(jj, k + 1), vi(jj + 1, k + 1));
      }
      // (version réduite : une rangée et une colonne sur deux, bords gardés)
      const lr = [];
      for (let jj = a; jj < b; jj += 2) lr.push(jj);
      lr.push(b);
      const lc = [];
      for (let k = 0; k < C - 1; k += 2) lc.push(k);
      lc.push(C - 1);
      for (let x = 0; x < lr.length - 1; x++) {
        for (let y = 0; y < lc.length - 1; y++) {
          const j0 = lr[x];
          const j1 = lr[x + 1];
          const k0 = lc[y];
          const k1 = lc[y + 1];
          mlod.push(vi(j0, k0), vi(j0, k1), vi(j1, k0), vi(j1, k0), vi(j0, k1), vi(j1, k1));
        }
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('hairG', new THREE.Float32BufferAttribute(hg, 1));
  g.setAttribute('hairT', new THREE.Float32BufferAttribute(ht, 3));
  g.setAttribute('hairRoot', new THREE.Float32BufferAttribute(hr, 4));
  g.setIndex([...midx, ...idx]);
  g.computeBoundingSphere();
  // (index de la version réduite : masses réduites, puis les cartes principales, rangées d'abord)
  const Ix = pos.length / 3 > 65535 ? Uint32Array : Uint16Array;
  g.userData.lodIndex = new Ix([...mlod, ...lodIdx]);
  g.userData.massTris = midx.length / 3;
  return g;
}

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Crinière en brosse le long de la crête : Fjord (bicolore, cœur foncé, bords crème) ou poulain
 * (courte, duveteuse, d'une couleur). Rubans debout dans les deux sens : du volume sous tous les angles.
 */
function brushCards(S, B, look) {
  const foal = B.maneStyle === 'foal';
  const rng = mulberry((look.seed ?? 1) + 9);
  const nk = S.heads[BONE_INDEX.Neck];
  const hd = S.heads[BONE_INDEX.Head];
  const axis = hd.clone().sub(nk).normalize();
  const up = V(0, axis.z, -axis.y);
  if (up.y < 0) up.negate();
  const crest = S.crest;
  const at = (t) => {
    const k = Math.min(crest.length - 2, Math.max(0, Math.floor(t * (crest.length - 1))));
    return crest[k][1].clone().lerp(crest[k + 1][1], t * (crest.length - 1) - k);
  };
  // (couleurs des crins plafonnées : la brosse crème du Fjord n'est pas un blanc brûlé)
  const maneC = hairColor(look.mane ?? 0x1b1410);
  const coreC = hairColor(look.maneCore ?? look.mane ?? 0x1b1410);
  const tint = (c, a) => c.clone().multiplyScalar(1 - a + rng() * a * 2);
  const weights = (t) => () => {
    const wh = smooth(0.86, 0.98, t);
    return [[BONE_INDEX.Neck, 1 - wh], [BONE_INDEX.Head, wh]].filter(([, w]) => w > 0.001);
  };
  const cards = [];
  const n = foal ? 34 : 64;
  // Hauteur de la brosse le long de la crête (plus haute au milieu, taillée en arc). Les rubans vont
  // jusqu'aux pointes des mèches de la texture (alpha) : le haut de la brosse est effilé et irrégulier.
  const height = (t) => (foal ? 0.05 + 0.012 * Math.sin(t * Math.PI) : 0.085 + 0.03 * Math.sin(t * Math.PI)) * 1.12;
  // (une bande étroite d'une mèche de la texture des crins, de près de la racine aux trois quarts : des crins
  // serrés, coupés presque droit en haut comme une brosse taillée)
  const tipUV = () => {
    const [v] = HAIR_ROWS[Math.floor(rng() * 4)];
    return [0.12 + rng() * 0.06, 0.8 + rng() * 0.1, v + (rng() - 0.5) * 0.1, 0.05];
  };
  // Bords crème (ou toute la brosse du poulain) : rubans debout, le long de la crête ou en travers.
  for (let i = 0; i < n; i++) {
    const t = 0.03 + (i / (n - 1)) * 0.93;
    const c = at(t).addScaledVector(up, -0.012);
    const dir = at(Math.min(1, t + 0.02)).sub(at(Math.max(0, t - 0.02))).normalize();
    for (const lane of foal ? [-1, 0, 1] : [-1, 1]) {
      const along = lane === 0 || (i + lane) % 2 === 0;
      const h = height(t) * (1 - Math.abs(lane) * 0.12) * (0.93 + rng() * 0.14);
      const lat = V(lane * (foal ? 0.014 : 0.013), 0, 0);
      const p0 = c.clone().add(lat);
      const tip = p0.clone().addScaledVector(up, h).addScaledVector(lat, foal ? 0.8 : 0.4);
      cards.push({
        // (rubans effilés : la pointe est trois fois plus étroite que la racine)
        pts: [p0, p0.clone().lerp(tip, 0.5), tip], w0: 0.03, w1: 0.01,
        side: along ? dir.clone().applyAxisAngle(up, (rng() - 0.5) * 0.7) : V(1, 0, 0), color: tint(maneC, 0.06),
        uv: tipUV(), weights: weights(t), sway: 0.25, normal: up.clone().multiplyScalar(0.55).add(V(lane * 0.85, 0, 0)).normalize(),
      });
    }
  }
  // Pied de la brosse : rubans bas et pleins le long de la crête, des deux côtés, couchés un peu vers l'extérieur
  // (le bas d'une brosse taillée est dense : sans eux, on voyait le cœur foncé et la peau entre les rubans)
  const nb = foal ? 24 : 40;
  for (let i = 0; i < nb; i++) {
    const t = 0.04 + ((i + rng() * 0.5) / nb) * 0.9;
    const c = at(t).addScaledVector(up, -0.016);
    const dir = at(Math.min(1, t + 0.02)).sub(at(Math.max(0, t - 0.02))).normalize();
    for (const lane of [-1, 1]) {
      const lat = V(lane * 0.018, 0, 0);
      const p0 = c.clone().add(lat);
      const tip = p0.clone().addScaledVector(up, height(t) * 0.6).addScaledVector(lat, 0.6);
      const [v] = HAIR_ROWS[Math.floor(rng() * 4)];
      cards.push({
        pts: [p0, p0.clone().lerp(tip, 0.5), tip], w0: 0.05, w1: 0.042, side: dir.clone(), color: tint(maneC, 0.05),
        uv: [0.08, 0.62 + rng() * 0.1, v, 0.1], weights: weights(t), sway: 0.2,
        normal: up.clone().multiplyScalar(0.45).add(V(lane, 0, 0)).normalize(),
      });
    }
  }
  if (foal) return cards;
  // Cœur foncé du Fjord : rubans fins et nombreux, pas plus hauts que les bords, chacun un peu tourné et
  // incliné au hasard (pas une palissade de plaques alignées), de la couleur des crins foncés (pas grisée).
  const nc = 110;
  for (let i = 0; i < nc; i++) {
    const t = 0.03 + ((i + rng() * 0.8) / nc) * 0.93;
    const c = at(t).addScaledVector(up, -0.012).add(V((rng() - 0.5) * 0.01, 0, 0));
    const dir = at(Math.min(1, t + 0.02)).sub(at(Math.max(0, t - 0.02))).normalize();
    const side = dir.clone().applyAxisAngle(up, (rng() - 0.5) * 0.9);
    const h = height(t) * 0.88 * (0.94 + rng() * 0.1);
    const tip = c.clone().addScaledVector(up, h).addScaledVector(dir, (rng() - 0.5) * 0.04);
    cards.push({
      pts: [c, c.clone().lerp(tip, 0.5), tip], w0: 0.02, w1: 0.006, side, color: tint(coreC.clone().lerp(maneC, 0.03), 0.1),
      uv: tipUV(), weights: weights(t), sway: 0.25, normal: up.clone(),
    });
  }
  return cards;
}

/**
 * Fanons : longs poils derrière et sur les côtés du bas des membres, qui couvrent les sabots (traits,
 * Frison, Irish Cob). Couleur du bas de la jambe : blanc sous une balzane ou sur une jambe de pie,
 * noir sur les bas noirs d'un bai, sinon la robe.
 */
function featherCards(S, B, look) {
  const rng = mulberry((look.seed ?? 1) + 21);
  const traits = horseCoatTraits(look);
  const socks = horseSocks(look);
  const cards = [];
  const r = 0.06 * S.D.scale.bone;
  LEGS.forEach(([k, front], i) => {
    const F = S.heads[BONE_INDEX[k + '4']];
    const K = S.heads[BONE_INDEX[k + '3']];
    const sole = F.clone().add(S.soles[i][1]);
    const white = socks[i] > 0.1 || traits.pinto > 0;
    // (poils longs plus clairs que la robe au soleil : un peu éclaircis, jamais plus foncés)
    const legC = new THREE.Color(white ? 0xf1ede6 : traits.points ? (look.maneCore ?? look.mane ?? look.coat) : look.coat);
    if (!white && !traits.points) legC.multiplyScalar(1.2).lerp(new THREE.Color(0xd9c3a5), 0.1);
    legC.copy(hairColor(legC));
    // (rubans fins et nombreux : des poils, pas des bottes pleines)
    const n = Math.round(18 + 22 * B.feathers);
    const b3 = BONE_INDEX[k + '3'];
    const b4 = BONE_INDEX[k + '4'];
    const fy = F.y;
    const sx = k.endsWith('L') ? 1 : -1;
    for (let j = 0; j < n; j++) {
      // derrière et sur les côtés du membre (pas devant le canon), en éventail vers l'arrière
      const a = -Math.PI * 0.72 + (j / (n - 1)) * Math.PI * 1.44 + (rng() - 0.5) * 0.15;
      const d = V(Math.sin(a) * sx * 0.95, 0, -Math.cos(a));
      const fan = d.clone().add(V(0, 0, -0.45)).normalize();
      // (sur l'axe du canon, un peu au-dessus du boulet, plus haut derrière)
      const y0 = fy + (0.05 + 0.13 * B.feathers * (0.55 + 0.45 * Math.cos(a))) * (0.9 + rng() * 0.2);
      const u = (K.y - y0) / Math.max(0.01, K.y - fy);
      const axisP = K.clone().lerp(F, Math.min(1.2, Math.max(0, u)));
      const p0 = V(axisP.x, y0, axisP.z).addScaledVector(d, r);
      const end = V(p0.x, 0.012, sole.z + (p0.z - F.z) * 0.7).addScaledVector(fan, 0.06 + rng() * 0.04);
      const pts = [0, 0.33, 0.66, 1].map((f) => p0.clone().lerp(end, f).addScaledVector(fan, 0.016 * Math.sin(f * Math.PI)));
      cards.push({
        // (racine étroite : pas de bord horizontal net en haut ; pointes des mèches au bas, effilées)
        pts, w0: 0.012, w1: 0.03, side: V(-d.z, 0, d.x), normal: fan.clone(), color: legC.clone().multiplyScalar(0.92 + rng() * 0.16),
        uv: [0.3 + rng() * 0.05, 1, HAIR_ROWS[j % 4][0] + (rng() - 0.5) * 0.08, 0.07], sway: 0.35, kind: 3,
        weights: (p) => {
          const w = smooth(fy + 0.03, fy - 0.03, p.y);
          return [[b3, 1 - w], [b4, w]].filter(([, x]) => x > 0.001);
        },
      });
    }
  });
  return cards;
}

/**
 * Iris du cheval (toile 256², partagée) : brun foncé, fibres rayonnantes et petites taches claires, bord plus
 * sombre ; pupille horizontale presque noire, grains de suie (corpora nigra) sur son bord supérieur. UV
 * projetées sur l'ouverture des paupières (mapEyes) : le centre de la toile est le centre du regard.
 */
let eyeTex = null;
function eyeTexture() {
  if (eyeTex) return eyeTex;
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  if (!ctx) {
    // (sans toile 2D : un brun uni)
    eyeTex = new THREE.DataTexture(new Uint8Array([74, 45, 24, 255]), 1, 1);
    eyeTex.colorSpace = THREE.SRGBColorSpace;
    eyeTex.needsUpdate = true;
    eyeTex.userData.shared = true;
    return eyeTex;
  }
  const h = S / 2;
  const rng = mulberry(77);
  ctx.fillStyle = '#140c07';
  ctx.fillRect(0, 0, S, S);
  const R = S * 0.47;
  const g = ctx.createRadialGradient(h, h, 0, h, h, R);
  g.addColorStop(0, '#6e4727');
  g.addColorStop(0.35, '#5c391d');
  g.addColorStop(0.72, '#432814');
  g.addColorStop(0.9, '#2a180c');
  g.addColorStop(1, '#170e07');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(h, h, R, 0, Math.PI * 2);
  ctx.fill();
  // fibres et taches de l'iris
  for (let i = 0; i < 170; i++) {
    const a = rng() * Math.PI * 2;
    const r0 = R * (0.2 + rng() * 0.15);
    const r1 = R * (0.7 + rng() * 0.28);
    ctx.strokeStyle = rng() < 0.5 ? 'rgba(150,98,52,0.16)' : 'rgba(24,13,6,0.22)';
    ctx.lineWidth = 1 + rng() * 1.5;
    ctx.beginPath();
    ctx.moveTo(h + Math.cos(a) * r0, h + Math.sin(a) * r0);
    ctx.lineTo(h + Math.cos(a) * r1, h + Math.sin(a) * r1);
    ctx.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const a = rng() * Math.PI * 2;
    const r = R * (0.35 + rng() * 0.4);
    ctx.fillStyle = 'rgba(176,122,66,0.22)';
    ctx.beginPath();
    ctx.arc(h + Math.cos(a) * r, h + Math.sin(a) * r, 1.5 + rng() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // pupille horizontale (bord adouci), un peu au-dessus du centre de la partie visible, et grains de suie
  // au-dessus
  const pw = S * 0.2;
  const ph = S * 0.085;
  const py = h - S * 0.035;
  for (const [k, col] of [[1.2, 'rgba(10,6,4,0.55)'], [1, '#040302']]) {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.ellipse(h, py, pw * k, ph * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const [dx, r] of [[-0.09, 0.034], [-0.03, 0.044], [0.035, 0.04], [0.09, 0.03]]) {
    ctx.fillStyle = '#21140b';
    ctx.beginPath();
    ctx.arc(h + dx * S, py - ph * 0.85, r * S, Math.PI, Math.PI * 2);
    ctx.fill();
  }
  eyeTex = new THREE.CanvasTexture(c);
  eyeTex.colorSpace = THREE.SRGBColorSpace;
  eyeTex.userData.shared = true;
  return eyeTex;
}

/**
 * Œil vivant : iris brun foncé visible (eyeTexture) sous une cornée brillante (reflet du ciel par la carte
 * d'environnement) et un reflet net du soleil qui suit la lumière : là où la normale du globe est la
 * bissectrice de la lumière et du regard de la caméra, ramené dans l'ouverture des paupières si ce point est
 * caché (axe du regard eyeAxis, mapEyes). De loin, le reflet tient dans un pixel, assombri d'autant
 * (fwidth) : jamais un œil blanc. Quelques instructions sur les seuls pixels des yeux.
 */
const EYE_CAP = 0.24; // (le reflet reste à moins de 0,24 rad du centre de l'ouverture)
function eyeMaterial() {
  const high = gfx.quality === 'high';
  const map = eyeTexture();
  const m = high
    ? new THREE.MeshPhysicalMaterial({ map, roughness: 0.34, clearcoat: 1, clearcoatRoughness: 0.05 })
    : new THREE.MeshStandardMaterial({ map, roughness: 0.16 });
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute vec3 eyeAxis;
varying vec3 vEyeAxis;`)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
{
  vec3 eyeA = eyeAxis;
  #ifdef USE_SKINNING
    eyeA = ( skinMatrix * vec4( eyeA, 0.0 ) ).xyz;
  #endif
  vEyeAxis = normalMatrix * eyeA;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vEyeAxis;
// Reflet d'une lumière de direction L (repère de la vue) sur le globe : disque de rayon angulaire a1 (bord
// net à partir de a0), centré sur la bissectrice ramenée dans l'ouverture.
float eyeGlint( vec3 L, vec3 V, vec3 G, vec3 N, float a0, float a1 ) {
  vec3 H = normalize( L + V );
  float c = dot( H, G );
  if ( c < ${Math.cos(EYE_CAP).toFixed(5)} ) {
    vec3 s = H - G * c;
    float l = length( s );
    H = l > 1e-4 ? G * ${Math.cos(EYE_CAP).toFixed(5)} + s / l * ${Math.sin(EYE_CAP).toFixed(5)} : G;
  }
  float a = acos( clamp( dot( N, H ), -1.0, 1.0 ) );
  // (de loin, le disque est élargi à un demi-pixel et assombri d'autant : la même lumière, pas un œil gris)
  float b = max( a1, a0 + 0.5 * fwidth( a ) );
  return ( 1.0 - smoothstep( a0, b, a ) ) * ( a1 * a1 ) / ( b * b );
}`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  vec3 eyeG = normalize( vEyeAxis );
  vec3 eyeV = normalize( vViewPosition );
  vec3 glint = vec3( 0.0 );
  #if NUM_DIR_LIGHTS > 0
    vec3 eyeL = directionalLights[ 0 ].direction;
    // (soleil derrière la tête : reflet plus faible, jamais éteint)
    // (reflet petit et net, pas un gros point blanc de dessin animé)
    glint += directionalLights[ 0 ].color * eyeGlint( eyeL, eyeV, eyeG, normal, 0.035, 0.07 ) * ( 0.3 + 0.7 * smoothstep( -0.5, 0.3, dot( eyeL, eyeG ) ) ) * 1.35;
  #endif
  reflectedLight.directSpecular += glint;
}`);
  };
  m.customProgramCacheKey = () => 'horsereal-eye';
  return m;
}

/** Ombre de contact douce, partagée (comme horseModel.js). */
let contactTex = null;
/** Opacité des ombres des sabots, et de l'ombre de contact en qualité basse. */
const SOLE_ALPHA = 0.6;
const CONTACT_ALPHA_LOW = 0.75;
/** Tache d'ombre ronde dégradée (partagée : ombre de contact, ombres des sabots). */
function contactTexture() {
  if (!contactTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    contactTex = new THREE.CanvasTexture(c);
    contactTex.userData.shared = true;
  }
  return contactTex;
}

function contactShadow(R, L) {
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  // (qualité basse : le soleil n'y projette pas d'ombre, c'est le seul signe que le cheval touche le sol ;
  // décalage de profondeur : elle passe devant un sol posé juste au-dessus du terrain, sable, litière)
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: contactTexture(), transparent: true, depthWrite: false, opacity: gfx.quality === 'high' ? 0.5 : CONTACT_ALPHA_LOW, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  }));
  m.scale.set(R * 3.0, 1, L * 1.45);
  m.position.y = 0.015;
  m.renderOrder = -1;
  return m;
}

const SOLE_SHADOW_LIFT = 0.25; // (m, cheval de taille 1 : sabot levé de plus, plus d'ombre sous lui)

/**
 * Petites ombres sous les sabots (qualité basse, où le soleil ne projette pas d'ombre : sans elles, le cheval
 * flotte), avec l'ombre de contact sous le corps dans le même maillage (un seul appel de dessin par cheval, comme
 * avant les ombres de sabots : elles en coûtaient un de plus). Cinq carrés : le shader place chacun des quatre
 * premiers sous son sabot (uniform hSole : centre de la sole dans le repère du cheval, et opacité), recalculé juste
 * avant son dessin (onBeforeRender), après l'animation et les poses des activités (sabot donné, saut, révérence) ;
 * le cinquième, l'ombre de contact (contact : { w, d } en m), reste sous le corps. Sabot posé : ombre pleine ; levé
 * de SOLE_SHADOW_LIFT : plus rien. 10 triangles et 20 nombres par image ; rien si le cheval n'est pas dans le champ.
 */
function soleShadows(model, size, contact = null) {
  const pos = [];
  const uv = [];
  const ids = [];
  const index = [];
  for (let i = 0; i < 4; i++) {
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(x * size * 0.5, 0, z * size * 0.62);
      uv.push((x + 1) / 2, (1 - z) / 2);
      ids.push(i);
    }
    const o = i * 4;
    index.push(o, o + 2, o + 1, o, o + 3, o + 2);
  }
  if (contact) {
    // (ombre de contact : carré fixe, à sa taille, centré sous le corps)
    for (const [x, z] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      pos.push(x * contact.w * 0.5, 0, z * contact.d * 0.5);
      uv.push((x + 1) / 2, (1 - z) / 2);
      ids.push(4);
    }
    index.push(16, 18, 17, 16, 19, 18);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('hIdx', new THREE.Float32BufferAttribute(ids, 1));
  geo.setIndex(index);
  // (les carrés sont déplacés dans le shader : la sphère englobante couvre tout le dessous du cheval)
  geo.boundingSphere = new THREE.Sphere(V(0, 0, 0), 1.6);
  geo.boundingBox = new THREE.Box3(V(-1.6, -0.1, -1.6), V(1.6, 0.1, 1.6));
  const sole = { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector4()) };
  // (ombre de contact : 1,5 cm au-dessus du sol, plus foncée que celles des sabots)
  sole.value[4].set(0, 0.015, 0, contact ? CONTACT_ALPHA_LOW / SOLE_ALPHA : 0);
  const mat = new THREE.MeshBasicMaterial({
    map: contactTexture(), transparent: true, depthWrite: false, opacity: SOLE_ALPHA, toneMapped: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4,
  });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.hSole = sole;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float hIdx;
uniform vec4 hSole[5];
varying float vHSole;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
{
  vec4 hs = hSole[int(hIdx + 0.5)];
  transformed = vec3(hs.x + position.x, hs.y, hs.z + position.z);
  vHSole = hs.w;
}`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
varying float vHSole;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
diffuseColor.a *= vHSole;`);
  };
  mat.customProgramCacheKey = () => 'horsereal-soles';
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1;
  m.name = 'soleShadows';
  m.onBeforeRender = () => {
    const md = model;
    md.body.updateMatrix();
    for (let j = 0; j < md.legs.length; j++) {
      const l = md.legs[j];
      _m.multiplyMatrices(md.body.matrix, l.top.matrix).multiply(l.pivot.matrix).multiply(l.knee.matrix).multiply(l.fetlock.matrix);
      let x = 0;
      let z = 0;
      let low = Infinity;
      for (let q = 0; q < l.solePts.length; q++) {
        _v.copy(l.solePts[q]).applyMatrix4(_m);
        x += _v.x;
        z += _v.z;
        if (_v.y < low) low = _v.y;
      }
      const n = l.solePts.length;
      const h = Math.max(0, low - 0.003);
      const t = Math.min(1, h / SOLE_SHADOW_LIFT);
      sole.value[j].set(x / n, 0.004, z / n, 1 - t * t * (3 - 2 * t));
    }
  };
  return m;
}

// ------------------------------------------------------------------ construction

/**
 * Construit le cheval réaliste (ou null si le GLB n'est pas chargé : on prend alors le cheval sculpté).
 * look : la robe de l'animal (look.foal : poulain) ; breedId : sa race ; gltf : le GLB chargé (tests).
 */
export function buildRealHorseModel(look, breedId = null, gltf = getModel(REAL_HORSE_KEY)) {
  if (!gltf) return null;
  const base = realHorseBase(gltf);
  const breed = horseBreedOf(look, breedId);
  const B = look.foal ? foalBuild(horseBuild(breed, look)) : horseBuild(breed, look);
  const S = shapeFor(base, B);
  const heads = S.heads;

  // Groupes animés (repère du cheval, rotation de repos nulle sauf encolure et tête) et os dessous.
  const root = new THREE.Group();
  const groups = [];
  const bones = [];
  RIG.forEach(([n, par], i) => {
    const g = new THREE.Group();
    g.name = `g${n}`;
    const pi = par ? BONE_INDEX[par] : -1;
    const worldQ = base.groupRest[i];
    if (pi < 0) {
      g.position.set(0, 0, 0); // body : origine au sol
      root.add(g);
    } else {
      const pq = base.groupRest[pi].clone().invert();
      const pp = pi === 0 ? V() : heads[pi];
      g.position.copy(heads[i]).sub(pp).applyQuaternion(pq);
      g.quaternion.copy(pq).multiply(worldQ);
      groups[pi].add(g);
    }
    g.userData.restQ = g.quaternion.clone();
    groups.push(g);
    const b = new THREE.Bone();
    b.name = n;
    // Os : sa place (l'articulation) et son orientation de repos du GLB.
    const head = pi < 0 ? heads[i] : V();
    b.position.copy(head);
    b.quaternion.copy(worldQ).invert().multiply(base.rot[i]);
    g.add(b);
    bones.push(b);
  });
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const G = (n) => groups[BONE_INDEX[n]];
  // Places des tresses (Beauty.js) dans le repère des groupes qui les portent, pris au repos (root = monde
  // ici) : elles suivent l'encolure et la queue comme la peau et les crins liés à ces os.
  const neckQi = G('Neck').getWorldQuaternion(new THREE.Quaternion()).invert();
  const dockY = heads[BONE_INDEX.Tail2].y;
  const braidSpots = {
    crest: S.braids.crest.map(([p, up, mid]) => [G('Neck').worldToLocal(p.clone()), up.clone().applyQuaternion(neckQi), mid && G('Neck').worldToLocal(mid.clone())]),
    // (sous une couverture : les boutons commencent devant son bord avant)
    crestCovered: S.braids.crestCovered.map(([p, up, mid]) => [G('Neck').worldToLocal(p.clone()), up.clone().applyQuaternion(neckQi), mid && G('Neck').worldToLocal(mid.clone())]),
    tail: S.braids.tail.map((p) => {
      const g = G(p.y > dockY ? 'Tail1' : 'Tail2');
      return [g, g.worldToLocal(p.clone())];
    }),
    // (nœud de la queue tourné vers l'arrière du cheval, dans le repère du premier groupe de la tresse)
    tailBowQ: null,
  };
  if (braidSpots.tail.length) {
    braidSpots.tailBowQ = braidSpots.tail[0][0].getWorldQuaternion(new THREE.Quaternion()).invert()
      .multiply(new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI));
  }

  const coatSrc = base.prims.coat.material;
  const coatMat = coatMaterial(look, B, breed, {
    detail: coatSrc.map, normalMap: coatSrc.normalMap, normalSign: Math.sign(coatSrc.normalScale?.y ?? 1), hoofY: S.hoofY,
    hooves: S.hooves, eye: S.eyeHL, nostril: S.nostril,
  });
  // Boîte englobante du cheval, commune à ses maillages : recalculée sur la pose des os à chaque image où il
  // passe le test du champ de la caméra (voir HorseMesh, horseBounds). Les boîtes par os viennent de la race,
  // plus les cartes de crins de ce cheval et l'équipement lié au squelette (skinGear).
  const hb = { box: new THREE.Box3(), sphere: new THREE.Sphere(), boneBox: S.boneBox.slice(), skeleton, meshes: [], anim: null };
  const coat = new HorseMesh(S.coatGeo, coatMat, hb);
  const eyes = new HorseMesh(S.eyeGeo, eyeMaterial(), hb);
  const hairSway = { value: 0 };
  // (courbure des crins par la vitesse et le fouet de la queue : RealHorseAnim.hairSprings)
  const hairDrag = { tail: { value: V() }, mane: { value: V() }, up: { value: V(0, 1, 0) } };
  // Crinière, toupet et queue : cartes de crins de la race (partagées), à la couleur des crins de ce cheval.
  const mane = new HorseMesh(S.hairGeo, hairMaterial(look.mane ?? 0x1b1410, hairSway, hairDrag, look.coat ?? null), hb);
  const meshes = [coat, eyes, mane];
  // Brosse (Fjord, poulain) et fanons : cartes de crins à la couleur de chaque cheval.
  const extra = [];
  if (B.maneStyle === 'brush' || B.maneStyle === 'foal') extra.push(...brushCards(S, B, look));
  if ((B.feathers ?? 0) > 0.05) extra.push(...featherCards(S, B, look));
  if (extra.length) {
    const cg = hairCards(extra);
    growBoneBoxes(hb.boneBox, cg.attributes.position, cg.attributes.skinIndex.array, cg.attributes.skinWeight.array, cg.attributes.position.count);
    meshes.push(new HorseMesh(cg, hairMaterial(null, hairSway, hairDrag), hb));
  }
  for (const m of meshes) {
    m.bind(skeleton, new THREE.Matrix4());
    m.castShadow = m !== eyes;
    m.receiveShadow = true;
    root.add(m);
    hb.meshes.push(m);
  }

  const gx = S.D.scale.gx;
  const back = S.measure.backTop;
  const zSeat = -0.075;
  const L = 1.5 * (B.back ?? 1);
  const elbow = heads[BONE_INDEX.FL2];
  const torsoTop = back(zSeat);
  const belly = S.measure.bellyAt(zSeat);
  const R = (torsoTop - belly) / 2;
  // (qualité basse : l'ombre de contact est dans le maillage des ombres de sabots, voir soleShadows)
  const contactSize = { w: (0.3 * gx + 0.05) * 3.0, d: L * 0.95 * 1.45 };
  if (gfx.quality === 'high') root.add(contactShadow(0.3 * gx + 0.05, L * 0.95));
  // Couverture : du garrot jusqu'où le centre de ses coupes (y0 - 0,2 R) est encore dans le corps
  // (plus loin, la croupe remonte : la nappe se refermerait en pointe).
  const ty = (belly + torsoTop) / 2 - 0.2 * R;
  let bz0 = heads[BONE_INDEX.Spine].z - 0.17;
  while (bz0 < zSeat && S.measure.torso(0, ty, bz0) > -0.06) bz0 += 0.01;

  const legs = LEGS.map(([k, front, side], i) => {
    const fet = heads[BONE_INDEX[k + '4']];
    const sole = fet.clone().add(S.soles[i][1]);
    sole.y = 0;
    return {
      top: G(k + '1'), pivot: G(k + '2'), knee: G(k + '3'), fetlock: G(k + '4'), front, side,
      hoof: sole, fetlockRest: fet.clone(), kneeRest: heads[BONE_INDEX[k + '3']].clone(),
      solePts: S.soles[i].map((p) => p.clone().setY(p.y + 0.003)),
    };
  });
  const headG = G('Head');
  const poll = heads[BONE_INDEX.Head];
  const hq = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), base.headTilt).invert();
  const earLocal = heads[BONE_INDEX.EarL].clone().sub(poll).applyQuaternion(hq);
  const hr = 0.105 * Math.sqrt(B.head ?? 1) * 1.1;
  const legR = 0.04 * S.D.scale.bone * 1.25;
  const model = {
    root,
    body: G('Spine'),
    neck: G('Neck'),
    head: headG,
    tail: G('Tail1'),
    tailTip: G('Tail2'),
    ears: [G('EarL'), G('EarR')],
    ribs: G('Ribs'),
    mane: [1, 2, 3, 4].map((i) => G('Mane' + i)),
    groups,
    legs,
    skeleton,
    hairSway,
    hairDrag,
    // (plus longue mèche de la queue, de la racine à la pointe : jusqu'où sa courbure l'écarte)
    tailLen: S.tailLen ??= tailLength(S.hairGeo),
    coatMesh: coat,
    // (crinière, toupet et queue en cartes de crins)
    hairMesh: mane,
    y0: belly + R,
    legTop: elbow.y,
    saddleY: torsoTop,
    headHeight: poll.y,
    headTilt: base.headTilt - NECK_REST,
    snoutTip: V(0, 0, S.headLen).toArray(),
    mouth: V(0, -0.2 * S.headLen, 0.86 * S.headLen),
    sdf: { torso: S.measure.torso, head: S.measure.head },
    braidSpots,
    dims: {
      L, R, hr, legR, snoutZ: S.headLen, headBack: -0.12, earZ: earLocal.z, earY: earLocal.y,
      zGirth: elbow.z - 0.14, blanket: [bz0, heads[BONE_INDEX.Neck].z + 0.1],
    },
    backTop: back,
    build: B,
    foal: !!look.foal,
    horseV3: true,
    real: true,
    speedScale: heads[BONE_INDEX.FL1].y / base.rest[BONE_INDEX.FL1].y,
  };
  for (const e of model.ears) e.userData.side = e === model.ears[0] ? 1 : -1;
  model.skinGear = (mesh) => skinGear(model, S, mesh, hb);
  // Crinière tressée (concours de beauté, Beauty.js) : les mèches de la crinière rentrent dans les boutons.
  model.setBraided = (on) => {
    const u = mane.material.userData.hairBraid;
    if (u) u.value = on ? 1 : 0;
    model.braided = !!on;
  };
  // Toupet rentré sous un bonnet anti-mouches (gearModels.js, emplacement head) : ses mèches se replient entre les
  // oreilles au lieu de traverser le voile (taches noires sur le front, jusque dans les photos de la sellerie).
  model.setForelockTucked = (on) => {
    const u = mane.material.userData.hairTuck;
    if (u) u.value = on ? 1 : 0;
  };
  if (gfx.quality !== 'high') root.add(soleShadows(model, legR * 6.5, contactSize));
  // Allures de la race aux appuis calés au sol (lockedGaits) : faites une fois par gabarit, une allure à la
  // fois (lockGaitStep : 6 à 15 ms chacune), pendant les temps morts du navigateur après la construction
  // (voir plus bas) ; ce qui reste est fait au premier pas (lockGaits). Avant, les cinq allures étaient
  // calées d'un coup au premier pas : 27 à 64 ms par nouveau gabarit dans le navigateur.
  model.lockGaitStep = () => {
    if (S.gaits) return true;
    const acc = (S.gaitAcc ??= { clips: { ...base.clips }, natural: {}, next: 0 });
    if (acc.next < LOCK_KEYS.length) lockedGaits(model, base.clips, [LOCK_KEYS[acc.next++]], acc);
    if (acc.next < LOCK_KEYS.length) return false;
    S.gaits = { clips: acc.clips, natural: acc.natural };
    S.gaitAcc = null;
    return true;
  };
  model.lockGaits = () => {
    while (!model.lockGaitStep());
    return S.gaits;
  };
  model.anim = new RealHorseAnim(model, S.gaits ?? base.clips);
  hb.anim = model.anim;
  model.photoPose = () => model.anim.photoPose();
  model.bounds = hb;
  // Version réduite (LOD) : 0 complète, 1 réduite (index simplifié du GLB, ≈ 6 300 triangles au lieu de
  // 15 000). Choisie d'après la distance à la caméra du jeu (animateRealHorse) ; les photos la remettent à 0.
  model.lodLevel = 0;
  model.setLod = (level) => {
    const l = S.lod && level ? 1 : 0;
    if (l === model.lodLevel) return;
    model.lodLevel = l;
    coat.geometry = l ? S.lod.coat : S.coatGeo;
    eyes.geometry = l ? S.lod.eye : S.eyeGeo;
    mane.geometry = l ? S.hairLod : S.hairGeo;
  };
  let disposed = false;
  model.dispose = () => {
    if (disposed) return;
    disposed = true;
    model.anim.dispose();
    releaseShape(S);
  };
  // (navigateur : une allure calée par temps mort, au plus tard 1 s après ; plus rien si le cheval est parti)
  if (!S.gaits && typeof requestIdleCallback === 'function') {
    const step = () => {
      if (!disposed && !model.lockGaitStep()) requestIdleCallback(step, { timeout: 1000 });
    };
    requestIdleCallback(step, { timeout: 1000 });
  }
  return model;
}

/** Plus grande distance d'un sommet des cartes de la queue (sorte 2) à la racine de sa mèche (m). */
function tailLength(geo) {
  const p = geo.attributes.position;
  const r = geo.attributes.hairRoot;
  let L = 0;
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(r.getW(i) - 2) > 0.5) continue;
    L = Math.max(L, Math.hypot(p.getX(i) - r.getX(i), p.getY(i) - r.getY(i), p.getZ(i) - r.getZ(i)));
  }
  return L || 1;
}

/**
 * Pièce d'équipement posée sur le corps (couverture : coque mesurée au repos, dans le repère du groupe
 * body) changée en maillage lié au squelette : chaque sommet prend les poids de la peau la plus proche
 * (tronc, épaules, hanches, côtes). Elle suit alors les hanches, les épaules et la respiration au lieu
 * de rester rigide sur le dos (le pelage la traversait sur la croupe et les flancs).
 * Renvoie le nouveau maillage (à la place de l'ancien, retiré de son parent).
 */
function skinGear(model, S, mesh, hb) {
  const coat = S.coatGeo;
  const cp = coat.attributes.position;
  const csi = coat.attributes.skinIndex;
  const csw = coat.attributes.skinWeight;
  // Peau du tronc seulement (pas la tête, les membres sous le coude ni la queue, sauf son attache).
  if (!S.trunkSkin) {
    // (tronc et épaules à toute hauteur : chez un petit poney, le bas du ventre est 15 cm sous le coude ;
    // sans lui, la sangle se liait à l'avant-bras voisin et le ventre passait à travers en marchant ;
    // cuisses, haut des avant-bras et des jambes seulement au-dessus du coude ; attache de la queue : le bout
    // de la couverture la suit quand elle se lève, sinon elle passait par-dessus, jusqu'à 5 cm chez l'arabe
    // et le saddlebred à la queue portée haut, ≈ 1 cm au pur-sang et au trotteur)
    const trunk = new Set(['Spine', 'Ribs', 'Neck', 'FL1', 'FR1', 'Tail1']);
    const upper = new Set(['HL1', 'HR1', 'FL2', 'FR2', 'HL2', 'HR2']);
    const list = [];
    const thigh = [];
    const tail = [];
    for (let i = 0; i < cp.count; i++) {
      let b = csi.getX(i);
      let w = csw.getX(i);
      for (let k = 1; k < 4; k++) if (csw.getComponent(i, k) > w) { w = csw.getComponent(i, k); b = csi.getComponent(i, k); }
      const nm = RIG[b][0];
      if (trunk.has(nm) || (upper.has(nm) && cp.getY(i) > S.elbowY - 0.08)) {
        list.push(i);
        thigh.push(nm === 'HL2' || nm === 'HR2' ? 1 : 0);
        tail.push(nm === 'Tail1' ? 1 : 0);
      }
    }
    S.trunkSkin = Uint32Array.from(list);
    S.trunkThigh = Uint8Array.from(thigh);
    S.trunkTail = Uint8Array.from(tail);
  }
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const n = pos.count;
  // Les coupes mesurées sont approchées (un rayon par secteur de 15°, une coupe tous les 4 cm) : une bosse
  // de la peau entre deux coupes passerait à travers le tissu. Chaque sommet est repoussé vers l'extérieur
  // (axe du tronc) jusqu'à laisser 6 mm au-dessus de la peau voisine (1,5 cm au plus ; 3 cm sur la pointe de la
  // cuisse, à moins de 10 cm du bord arrière de la pièce), puis les poussées sont adoucies.
  const thigh = new Float32Array(n);
  let zEnd = Infinity;
  for (let i = 0; i < n; i++) zEnd = Math.min(zEnd, pos.getZ(i));
  const rings = model.sdf.torso.rings;
  const ycAt = (z) => {
    const f = Math.min(rings.length - 1.001, Math.max(0, (z - rings[0][0]) / (rings[1][0] - rings[0][0])));
    const k = Math.floor(f);
    return rings[k][1] + (rings[k + 1][1] - rings[k][1]) * (f - k);
  };
  const push = new Float32Array(n);
  const dirs = new Float32Array(n * 3);
  const q = V();
  const nrm = V();
  // Tranche de peau mesurée autour de chaque sommet : au moins la moitié de l'écart entre deux rangées de la
  // pièce, plus 1 cm (sur un petit poney, les rangées de la couverture sont à 6 ou 7 cm : la peau du milieu
  // d'une bande échappait à la mesure et passait par-dessus le tissu près du bord arrière, à la hanche).
  let dzWin = 0.025;
  if (geo.index) {
    const idx = geo.index.array;
    for (let t = 0; t < idx.length; t += 3) {
      for (let e = 0; e < 3; e++) dzWin = Math.max(dzWin, Math.abs(pos.getZ(idx[t + e]) - pos.getZ(idx[t + (e + 1) % 3])) / 2 + 0.01);
    }
  }
  dzWin = Math.min(dzWin, 0.06);
  for (let i = 0; i < n; i++) {
    q.fromBufferAttribute(pos, i);
    nrm.set(q.x, q.y - ycAt(q.z), 0).normalize();
    dirs.set([nrm.x, nrm.y, nrm.z], i * 3);
    for (let t = 0; t < S.trunkSkin.length; t++) {
      const j = S.trunkSkin[t];
      // (peau de la même tranche : à moins de dzWin en z, à moins de 6 cm de côté dans la tranche)
      const dz = cp.getZ(j) - q.z;
      if (dz * dz > dzWin * dzWin) continue;
      const dx = cp.getX(j) - q.x;
      const dy = cp.getY(j) - q.y;
      const along = dx * nrm.x + dy * nrm.y;
      if (along < -0.03) continue;
      if (dx * dx + dy * dy - along * along > 0.06 * 0.06) continue;
      if (S.trunkThigh[t] && q.z < zEnd + 0.1) thigh[i] = Math.max(thigh[i], along + 0.006);
      else push[i] = Math.max(push[i], along + 0.006);
    }
    // (au plus 1,5 cm : au bout de la couverture, la croupe s'arrondit et une forte poussée ferait un bourrelet ;
    // la pointe de la cuisse, sous le bord arrière de la nappe, en demande jusqu'à 2,6 cm chez l'akhal-teke : la
    // peau de la hanche passait par-dessus, de 1,2 cm avec la couverture imperméable)
    push[i] = Math.max(Math.min(push[i], 0.015), Math.min(thigh[i], 0.03));
  }
  if (geo.index) {
    const nb = new Float32Array(n);
    for (let pass = 0; pass < 2; pass++) {
      nb.set(push);
      const idx = geo.index.array;
      for (let t = 0; t < idx.length; t += 3) {
        for (let e = 0; e < 3; e++) {
          const a = idx[t + e];
          const b = idx[t + (e + 1) % 3];
          nb[a] = Math.max(nb[a], push[b] * 0.6);
          nb[b] = Math.max(nb[b], push[a] * 0.6);
        }
      }
      push.set(nb);
    }
  }
  for (let i = 0; i < n; i++) {
    if (push[i] <= 0) continue;
    pos.setXYZ(i, pos.getX(i) + dirs[i * 3] * push[i], pos.getY(i) + dirs[i * 3 + 1] * push[i], pos.getZ(i));
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const p = V();
  const near = [];
  for (let i = 0; i < n; i++) {
    p.fromBufferAttribute(pos, i);
    // les 4 sommets de peau les plus proches, pondérés par l'inverse de la distance (l'attache de la queue ne
    // porte que la bande du milieu de la pièce, à moins de 12 cm de l'échine : un coup de queue ne fait pas onduler
    // tout le bout de la couverture)
    near.length = 0;
    for (let t = 0; t < S.trunkSkin.length; t++) {
      if (S.trunkTail[t] && Math.abs(p.x) > 0.12) continue;
      const j = S.trunkSkin[t];
      const d = (cp.getX(j) - p.x) ** 2 + (cp.getY(j) - p.y) ** 2 + (cp.getZ(j) - p.z) ** 2;
      if (near.length < 4 || d < near[3][0]) {
        near.push([d, j]);
        near.sort((a, b) => a[0] - b[0]);
        if (near.length > 4) near.pop();
      }
    }
    const acc = new Map();
    for (const [d, j] of near) {
      const f = 1 / (Math.sqrt(d) + 0.005);
      for (let k = 0; k < 4; k++) {
        const w = csw.getComponent(j, k);
        if (w > 0) acc.set(csi.getComponent(j, k), (acc.get(csi.getComponent(j, k)) ?? 0) + w * f);
      }
    }
    const top = [...acc].sort((a, b) => b[1] - a[1]).slice(0, 4);
    const tot = top.reduce((x, [, w]) => x + w, 0) || 1;
    top.forEach(([b, w], k) => {
      si[i * 4 + k] = b;
      sw[i * 4 + k] = w / tot;
    });
  }
  geo.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  // (la boîte du cheval la contient : elle est éliminée hors champ avec lui ; une pièce retirée laisse sa
  // trace dans les boîtes des os, un peu plus larges, jamais trop petites)
  growBoneBoxes(hb.boneBox, pos, si, sw, n);
  const sk = new HorseMesh(geo, mesh.material, hb);
  sk.castShadow = mesh.castShadow;
  sk.receiveShadow = true;
  mesh.parent?.remove(mesh);
  model.root.add(sk);
  sk.bind(model.skeleton, new THREE.Matrix4());
  hb.meshes = hb.meshes.filter((m) => m.parent);
  hb.meshes.push(sk);
  return sk;
}

// ------------------------------------------------------------------ élimination hors champ

const _bm = new THREE.Matrix4();
// Marge autour des os : les pointes des crins ondulent dans le shader (hairMaterial : vers l'extérieur et, pour la
// queue, de côté, 1,2 cm chacun × 4,8 au plus).
const HAIR_MARGIN = 0.08;
const TAIL_BOXES = [[BONE_INDEX.Tail2, 0.5], [BONE_INDEX.Tail1, 0.25]];

/**
 * Boîte englobante du cheval dans le repère de ses maillages (tous enfants directs de model.root, sans
 * décalage), d'après la pose : la boîte de repos de chaque os, emmenée par sa matrice de peau (os dans le
 * monde × inverse de repos, ramenée au repère du maillage par bindMatrixInverse), puis réunie aux autres.
 * Tient compte de la race (boîtes mesurées sur sa géométrie), de l'allure, du broutage, des sauts, de
 * l'embonpoint (échelle du tronc dans les matrices). Environ 3 µs ; partagée par les maillages du cheval.
 */
function horseBounds(hb, mesh) {
  const box = hb.box.makeEmpty();
  const bones = hb.skeleton.bones;
  const inv = hb.skeleton.boneInverses;
  const bb = hb.boneBox;
  const mn = box.min;
  const mx = box.max;
  for (let k = 0; k < bones.length; k++) {
    const o = k * 6;
    if (!(bb[o] <= bb[o + 3])) continue; // (os sans sommet)
    const e = _bm.multiplyMatrices(mesh.bindMatrixInverse, bones[k].matrixWorld).multiply(inv[k]).elements;
    const cx = (bb[o] + bb[o + 3]) * 0.5;
    const cy = (bb[o + 1] + bb[o + 4]) * 0.5;
    const cz = (bb[o + 2] + bb[o + 5]) * 0.5;
    const ex = (bb[o + 3] - bb[o]) * 0.5;
    const ey = (bb[o + 4] - bb[o + 1]) * 0.5;
    const ez = (bb[o + 5] - bb[o + 2]) * 0.5;
    const X = e[0] * cx + e[4] * cy + e[8] * cz + e[12];
    const Y = e[1] * cx + e[5] * cy + e[9] * cz + e[13];
    const Z = e[2] * cx + e[6] * cy + e[10] * cz + e[14];
    const EX = Math.abs(e[0]) * ex + Math.abs(e[4]) * ey + Math.abs(e[8]) * ez;
    const EY = Math.abs(e[1]) * ex + Math.abs(e[5]) * ey + Math.abs(e[9]) * ez;
    const EZ = Math.abs(e[2]) * ex + Math.abs(e[6]) * ey + Math.abs(e[10]) * ez;
    if (X - EX < mn.x) mn.x = X - EX;
    if (Y - EY < mn.y) mn.y = Y - EY;
    if (Z - EZ < mn.z) mn.z = Z - EZ;
    if (X + EX > mx.x) mx.x = X + EX;
    if (Y + EY > mx.y) mx.y = Y + EY;
    if (Z + EZ > mx.z) mx.z = Z + EZ;
  }
  // (plus la courbure des crins de la queue par la vitesse et son fouet, hairSprings : chaque sommet s'écarte de
  // s × D⊥, la part de D en travers de sa mèche, s ≤ longueur de la mèche L ; ces écarts sont tous dans la
  // sphère de diamètre [0, L × D] — boîte de Tail2 déplacée de L × D / 2 et grossie de L × |D| / 2 ; celle de
  // Tail1, où les mèches commencent, de moitié)
  const sh = hb.tailShift;
  if (sh && sh.lengthSq() > 1e-6) {
    // (jamais plus bas que les sabots : la queue est portée au-dessus du sol, sa courbure la soulève)
    const floor = mn.y;
    for (const [k, f] of TAIL_BOXES) {
      const o = k * 6;
      if (!(bb[o] <= bb[o + 3])) continue;
      const e = _bm.multiplyMatrices(mesh.bindMatrixInverse, bones[k].matrixWorld).multiply(inv[k]).elements;
      const r = sh.length() * f;
      for (let c = 0; c < 8; c++) {
        const x = bb[o + (c & 1 ? 3 : 0)];
        const y = bb[o + 1 + (c & 2 ? 3 : 0)];
        const z = bb[o + 2 + (c & 4 ? 3 : 0)];
        _v.set(e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]);
        _v.addScaledVector(sh, f);
        box.expandByPoint(_w.set(_v.x - r, _v.y - r, _v.z - r));
        box.expandByPoint(_w.set(_v.x + r, _v.y + r, _v.z + r));
      }
    }
    if (mn.y < floor) mn.y = floor;
  }
  if (box.isEmpty()) box.set(V(-1, 0, -1.2), V(1, 2.2, 1.2));
  box.expandByScalar(HAIR_MARGIN);
  box.getBoundingSphere(hb.sphere);
  for (const m of hb.meshes) {
    m.boundingBox = box;
    m.boundingSphere = hb.sphere;
  }
}

/**
 * Maillage du cheval réaliste (lié au squelette) : éliminé hors du champ de la caméra et de la lumière des
 * ombres comme les autres objets, avec une boîte qui suit la pose (horseBounds) au lieu de la sphère de repos
 * de la géométrie (fausse quand il broute, galope ou saute) ou du calcul de three.js (chaque sommet déformé
 * sur le processeur, une fois, puis jamais remis à jour). La boîte est oubliée à chaque mise à jour des
 * matrices (une fois par rendu) et refaite au premier test qui la demande (champ de la caméra, ombres,
 * lancer de rayon, cadrage d'une photo). Dessiné (caméra ou ombre) : noté pour l'animation (anim.seen).
 */
class HorseMesh extends THREE.SkinnedMesh {
  constructor(geometry, material, hb) {
    super(geometry, material);
    this.horse = hb;
  }

  updateMatrixWorld(force) {
    super.updateMatrixWorld(force);
    this.boundingBox = null;
    this.boundingSphere = null;
  }

  computeBoundingBox() {
    if (this.horse) horseBounds(this.horse, this);
    else super.computeBoundingBox();
  }

  computeBoundingSphere() {
    if (this.horse) horseBounds(this.horse, this);
    else super.computeBoundingSphere();
  }

  onBeforeRender() {
    if (this.horse?.anim) this.horse.anim.seen = true;
  }

  onBeforeShadow() {
    if (this.horse?.anim) this.horse.anim.seen = true;
  }
}

// ------------------------------------------------------------------ appuis calés au sol (par race)

/** Échantillons par seconde des allures recalées (le GLB en a 25 : au galop, trois clés seulement par appui). */
const LOCK_RATE = 100;
/** Hauteur des points de la sole posée (legs.solePts sont 3 mm au-dessus de la vraie sole : celle-ci est au sol). */
const SOLE_GROUND = 0.003;
/** Sabot tenu à sa place au moins ce temps (s) avant la pose et après le lever, lâché peu à peu. */
const LIFT_RELEASE = 0.1;
/** Boulet visé au plus à cette part de la longueur du bas du membre (coude ou grasset → boulet) : jamais tendu. */
const REACH = 0.97;

/**
 * Allures de la race aux appuis calés. Les clips du GLB ont 25 clés par seconde (au galop : trois par
 * appui) et des membres à la longueur du modèle d'origine : entre deux clés, la rotation interpolée des
 * articulations fait flotter ou glisser le sabot posé, et une autre longueur de membre change la foulée ;
 * en fin de soutien, le sabot arrivait au sol en avançant encore avec le corps (pas de rétraction).
 * Pour chaque allure, sur ce gabarit : clip échantillonné à LOCK_RATE ; pour chaque membre, l'appui (sole
 * à moins d'un centimètre du sol) ; la pince y suit une droite à la vitesse de l'allure (moindres
 * carrés, même vitesse pour les quatre membres), sole posée au sol, et le sabot y est tenu un peu avant
 * de se poser et un peu après s'être levé, d'autant plus qu'il est près du sol (fondu) : il descend sur sa
 * place et se lève sans traîner. Cinématique inverse (solveLeg) dans le plan du membre, sabot gardant
 * l'orientation du clip ; le côté rattrapé au coude ou au grasset. Sans à-coup : boulet visé à portée du membre
 * (jamais tendu), appui raccourci aux allures rapides là où la pince n'est plus à portée, sabot tenu puis lâché
 * en 0,1 s au moins, après le lever par un mélange des poses (articulation par articulation) partant de la
 * fin de l'appui. Plus grand changement d'angle d'une articulation d'une image à l'autre (60 im/s, 33 races) :
 * galop 0,77 → 0,45 rad (au lever du sabot 0,77 → 0,42), petit galop 0,54 → 0,41, trot 0,33 → 0,32, pas
 * 0,34 → 0,28 (le clip du GLB seul : 0,37 au galop).
 * names : les allures à caler (toutes par défaut) ; acc : ce qui est déjà calé, complété et renvoyé :
 * { clips, natural } (natural : vitesse de chaque allure, m/s, cheval de taille 1 : jouée à v ÷ natural,
 * la pince posée reste immobile). Une fois par gabarit, une allure à la fois (model.lockGaitStep).
 * Mesuré sur les 33 races (60 im/s, étendue de chaque point de la sole posée, vers l'avant / de côté) : galop
 * 0,76 / 0,59 → 0,05 / 0,06 cm ; petit galop 0,59 / 0,24 → 0,03 / 0,03 ; trot 0,27 / 0,10 → 0,02 / 0,02 ;
 * pas 0,51 / 0,76 → 0,01 / 0,01 cm.
 */
function lockedGaits(model, clips, names = LOCK_KEYS, acc = { clips: { ...clips }, natural: {} }) {
  const root = model.root;
  const groups = model.groups;
  const legs = model.legs;
  const saved = groups.map((g) => [g.position.clone(), g.quaternion.clone(), g.scale.clone()]);
  // (sans embonpoint ni respiration : les allures calées servent à tous les chevaux du gabarit)
  for (const g of groups) g.scale.set(1, 1, 1);
  const mixer = new THREE.AnimationMixer(root);
  const out = acc.clips;
  const natural = acc.natural;
  const qIdx = [];
  RIG.forEach(([n], j) => {
    if (!n.startsWith('Mane') && n !== 'Ribs') qIdx.push(j);
  });
  const legQ = legs.map((l) => [l.top, l.pivot, l.knee, l.fetlock].map((g) => qIdx.indexOf(groups.indexOf(g))));
  const toRoot = new THREE.Matrix4();
  const P4 = V();
  const T = V();
  const Qf = new THREE.Quaternion();
  const Qk = new THREE.Quaternion();
  const Qa = new THREE.Quaternion();
  const Pv = V();
  const Zp = V();
  const Qc = [0, 1, 2].map(() => new THREE.Quaternion());
  const J3 = [(l) => l.top, (l) => l.pivot, (l) => l.knee];
  const Rk = V();
  const Rf = V();
  for (const name of names) {
    // (galop allongé : le clip du galop, la pince posée suivant une droite plus rapide, voir GALLOP_REACH)
    const [src, stretch] = LOCK_FROM[name] ?? [name, 1];
    const clip = clips[src];
    if (!clip) continue;
    const D = clip.duration;
    const N = Math.max(12, Math.round(D * LOCK_RATE));
    const dt = D / N;
    mixer.stopAllAction();
    const action = mixer.clipAction(clip);
    action.play();
    action.setEffectiveWeight(1);
    // 1) Pose du clip à chaque échantillon : rotations des groupes, position du tronc, pince et sole.
    const Q = qIdx.map(() => new Float32Array((N + 1) * 4));
    const bodyP = new Float32Array((N + 1) * 3);
    const toe = legs.map(() => new Float32Array(N * 3));
    const low = legs.map(() => new Float32Array(N));
    const pose = (s) => {
      for (let k = 0; k < qIdx.length; k++) groups[qIdx[k]].quaternion.fromArray(Q[k], s * 4);
      groups[0].position.fromArray(bodyP, s * 3);
      root.updateMatrixWorld(true);
      toRoot.copy(root.matrixWorld).invert();
    };
    for (let s = 0; s < N; s++) {
      action.time = s * dt;
      mixer.update(0);
      for (let k = 0; k < qIdx.length; k++) groups[qIdx[k]].quaternion.toArray(Q[k], s * 4);
      groups[0].position.toArray(bodyP, s * 3);
      pose(s);
      legs.forEach((l, i) => {
        let lo = Infinity;
        for (const p of l.solePts) lo = Math.min(lo, _v.copy(p).applyMatrix4(l.fetlock.matrixWorld).applyMatrix4(toRoot).y);
        low[i][s] = lo;
        _v.copy(l.solePts[0]).applyMatrix4(l.fetlock.matrixWorld).applyMatrix4(toRoot).toArray(toe[i], s * 3);
      });
    }
    // 2) Appui de chaque membre : la plus longue suite (circulaire) d'échantillons sole à moins de 1 cm, et
    // la droite de la pince (pente commune aux quatre membres).
    const stances = legs.map((l, i) => {
      const on = Array.from(low[i], (y) => y < SOLE_GROUND + 0.01);
      if (on.every(Boolean) || !on.some(Boolean)) return null;
      // Trous comblés : un sabot qui flotte à moins de 2,5 cm au milieu ou au bout de l'appui puis revient au
      // sol pour basculer sur la pince (membres d'une autre longueur que le modèle d'origine : le clip l'y
      // laissait flotter) fait partie de l'appui ; un sabot qui se lève pour de bon ne revient pas.
      const runOf = () => {
        let best = null;
        for (let s = 0; s < N; s++) {
          if (!on[s] || on[(s - 1 + N) % N]) continue;
          let n = 0;
          while (n < N && on[(s + n) % N]) n++;
          if (!best || n > best[1]) best = [s, n];
        }
        return best;
      };
      const longest = runOf()[1];
      const maxGap = Math.max(2, Math.round(N * 0.25));
      for (let s = 0; s < N; s++) {
        if (on[s] || !on[(s - 1 + N) % N]) continue;
        let g = 0;
        while (g <= maxGap && !on[(s + g) % N] && low[i][(s + g) % N] < SOLE_GROUND + 0.025) g++;
        if (g <= maxGap && on[(s + g) % N] && (g <= 2 || g < N - longest - g)) for (let k = 0; k < g; k++) on[(s + k) % N] = true;
      }
      if (on.every(Boolean)) return null;
      const [s0, n] = runOf();
      let st = 0;
      let sz = 0;
      let stt = 0;
      let stz = 0;
      let sx = 0;
      for (let k = 0; k < n; k++) {
        const s = (s0 + k) % N;
        const tau = (s0 + k) * dt;
        const z = toe[i][s * 3 + 2];
        st += tau;
        sz += z;
        stt += tau * tau;
        stz += tau * z;
        sx += toe[i][s * 3];
      }
      const tb = st / n;
      const zb = sz / n;
      const slope = n > 2 ? (stz / n - tb * zb) / Math.max(1e-9, stt / n - tb * tb) : 0;
      return { s0, n, tb, zb, xb: sx / n, slope };
    });
    const fit = stances.filter(Boolean);
    if (!fit.length) continue;
    const v = (stretch * -fit.reduce((a, b) => a + b.slope * b.n, 0)) / fit.reduce((a, b) => a + b.n, 0);
    if (v > 0.2) natural[name] = v;
    // 3) Correction de chaque échantillon : sabot déplacé (sans tourner) vers sa place, cinématique inverse.
    // Portée du bas du membre : REACH de la longueur coude (ou grasset) → genou (ou jarret) → boulet, depuis le
    // coude du clip (Pv). Près du membre tendu, la cinématique inverse passe d'une pose à l'autre d'un
    // échantillon au suivant.
    const reachOf = (l) => {
      Pv.setFromMatrixPosition(l.pivot.matrixWorld).applyMatrix4(toRoot);
      Rk.setFromMatrixPosition(l.knee.matrixWorld).applyMatrix4(toRoot);
      return REACH * (Pv.distanceTo(Rk) + Rk.distanceTo(Rf.setFromMatrixPosition(l.fetlock.matrixWorld).applyMatrix4(toRoot)));
    };
    // Allures rapides (le corps avance de plus de 3 cm par échantillon) : l'appui finit au dernier échantillon
    // où la pince est encore à portée (au plus un quart de l'appui en moins). Le membre d'une race n'a pas la
    // longueur de celui du modèle : tenir la pince jusqu'au bout tendait le genou de 0,4 rad en un échantillon
    // (et l'épaule prenait le relais d'un coup) ; au pas, la pince glisserait sur le sol.
    const kept = stances.map((A, i) => {
      if (!A) return 0;
      let n = A.n;
      if (v * dt <= 0.03) return n;
      const l = legs[i];
      while (n > A.n * 0.75) {
        const s = (A.s0 + n - 1) % N;
        pose(s);
        const lim = reachOf(l);
        l.fetlock.getWorldPosition(P4).applyMatrix4(toRoot);
        P4.y += SOLE_GROUND - low[i][s];
        P4.z += A.zb - v * ((A.s0 + n - 1) * dt - A.tb) - toe[i][s * 3 + 2];
        if (P4.distanceTo(Pv) <= lim) break;
        n--;
      }
      return n;
    });
    // Après le lever, le membre part de la correction de l'échantillon d'avant (appliquée à la pose du clip) :
    // trois articulations pour deux cibles (hauteur, avancée) ; en partant de la pose du clip seule (genou
    // tendu au lever), la cinématique inverse choisissait une autre pose que celle de la fin de l'appui pour
    // une place voisine du sabot (0,4 rad au genou en un échantillon). Une zone corrigée qui passe la fin du
    // cycle est refaite au début d'un second tour, à la suite de la fin du premier.
    const Q0 = Q.map((q) => q.slice());
    const plan = stances.map((A, i) => {
      if (!A) return null;
      const ramp = Math.max(dt, Math.min(0.4 * A.n * dt, 0.3 * (N - A.n) * dt));
      const nb = Math.ceil(ramp / dt) + 1;
      const len = Math.min(N, nb + kept[i] + Math.ceil(Math.max(ramp, LIFT_RELEASE) / dt) + 1);
      return { ramp, again: (A.s0 - nb + N) % N + len - 1 - N, last: -2, dq: [0, 1, 2].map(() => new THREE.Quaternion()) };
    });
    const extra = Math.max(-1, ...plan.map((P) => P?.again ?? -1)) + 1;
    for (let u = 0; u < N + extra; u++) {
      const s = u % N;
      for (let k = 0; k < qIdx.length; k++) groups[qIdx[k]].quaternion.fromArray(Q0[k], s * 4);
      groups[0].position.fromArray(bodyP, s * 3);
      root.updateMatrixWorld(true);
      toRoot.copy(root.matrixWorld).invert();
      legs.forEach((l, i) => {
        const A = stances[i];
        const P = plan[i];
        if (!A || (u >= N && u - N > P.again)) return;
        const n = kept[i];
        const { ramp } = P;
        // (avant la pose : dIn échantillons ; après le lever : dOut)
        const k = (s - A.s0 + N) % N;
        const inside = k < n;
        const dIn = (A.s0 - s + N) % N;
        const dOut = k - (n - 1);
        let w = 1;
        // (après le lever : poids de la pose du sabot tenu, mélangée avec celle du clip plus bas)
        let mix = 1;
        let tau = (A.s0 + k) * dt;
        const h = low[i][s] - SOLE_GROUND;
        if (!inside) {
          // Près de l'appui (temps) et près du sol (hauteur) : de plus en plus tenu à sa place au sol (fondu en
          // hauteur de 2 à 14 cm), et sur LIFT_RELEASE au moins : le sabot du clip monte ou descend de 12 cm en
          // 4 images au galop, et le fondu en hauteur seul le tenait ou le lâchait en deux images (le genou
          // rejoignait le clip d'un coup, 0,78 rad en une image au lever). Avant la pose, la place visée glisse
          // de celle du clip à celle de l'appui ; après le lever, le sabot est visé à sa place et la pose obtenue
          // est mélangée avec celle du clip (mix, plus bas).
          const before = dIn <= dOut;
          const d = (before ? dIn : dOut) * dt;
          w = Math.max((1 - smooth(0, ramp, d)) * (1 - smooth(0.02, 0.14, h)), 1 - d / LIFT_RELEASE);
          if (!before) {
            mix = w;
            w = mix > 1e-4 ? 1 : 0;
          }
          tau = before ? (A.s0 - dIn) * dt : (A.s0 + n - 1 + dOut) * dt;
        }
        const tz = toe[i][s * 3 + 2];
        const tx = toe[i][s * 3];
        const dz = w * (A.zb - v * (tau - A.tb) - tz);
        const dx = w * (A.xb - tx);
        // (sole posée au sol pendant l'appui ; jamais dessous)
        const dy = inside ? -h : Math.max(0, -h);
        if (Math.abs(dz) + Math.abs(dx) + Math.abs(dy) < 1e-5) {
          P.last = -2;
          return;
        }
        // Boulet visé, orientation du sabot gardée (repère du cheval). La cinématique inverse ne tourne
        // qu'autour des axes x : elle vise la hauteur et l'avancée (viser aussi le côté, hors d'atteinte,
        // faisait trembler le sabot de ±2 mm d'une image à l'autre, et glisser de côté trois fois plus au
        // trot) ; le côté est rattrapé ensuite par un petit écart du membre au coude (ou au grasset), autour
        // de l'axe avant-arrière : le boulet, juste dessous, se déplace de côté sans monter.
        for (let j = 0; j < 3; j++) Qc[j].copy(J3[j](l).quaternion);
        l.fetlock.getWorldPosition(P4).applyMatrix4(toRoot);
        const wantX = P4.x + dx;
        T.copy(P4).add(_w.set(0, dy, dz)); // (x : sans effet, solveLeg reste dans le plan du membre)
        l.fetlock.getWorldQuaternion(Qf);
        // Boulet visé à portée (reachOf) : en fin d'appui et après le lever, la pince avance un peu plutôt que
        // de tendre le membre ; avant la pose et au début de l'appui, jamais plus près que le boulet du clip.
        const late = mix < 1 || (inside && k >= n / 2);
        const lim = late ? reachOf(l) : Math.max(reachOf(l), P4.distanceTo(Pv));
        const dist = T.distanceTo(Pv);
        if (dist > lim) T.sub(Pv).multiplyScalar(lim / dist).add(Pv);
        if (mix < 1 && P.last === u - 1) {
          for (let j = 0; j < 3; j++) J3[j](l).quaternion.multiply(P.dq[j]);
          l.top.updateMatrixWorld(true);
        }
        solveLeg(l, T, toRoot);
        Pv.setFromMatrixPosition(l.pivot.matrixWorld).applyMatrix4(toRoot);
        P4.setFromMatrixPosition(l.fetlock.matrixWorld).applyMatrix4(toRoot);
        const hgt = Pv.y - P4.y;
        if (hgt > 0.05 && Math.abs(wantX - P4.x) > 1e-5) {
          const ab = Math.asin(Math.max(-0.1, Math.min(0.1, (wantX - P4.x) / hgt)));
          Zp.set(0, 0, 1).transformDirection(root.matrixWorld).applyQuaternion(l.pivot.parent.getWorldQuaternion(Qk).invert());
          l.pivot.quaternion.premultiply(Qa.setFromAxisAngle(Zp, ab));
          l.top.updateMatrixWorld(true);
        }
        for (let j = 0; j < 3; j++) P.dq[j].copy(Qc[j]).invert().multiply(J3[j](l).quaternion);
        P.last = u;
        if (mix < 1) {
          // Après le lever : la pose du sabot tenu et celle du clip mélangées articulation par articulation
          // (et non la place visée : quand le corps est passé loin devant le sabot tenu, la cible est hors
          // d'atteinte et le membre se tend vers elle ; en la lâchant, le genou rejoignait le clip d'un coup,
          // 0,78 rad en une image au galop). Puis la sole relevée si le mélange la met plus bas que dans le
          // clip (entre deux poses où elle est à la même hauteur, le sabot passe en arc, plus bas).
          for (let j = 0; j < 3; j++) {
            const q = J3[j](l).quaternion;
            q.copy(Qa.copy(Qc[j]).slerp(q, mix));
          }
          l.top.updateMatrixWorld(true);
          l.knee.updateMatrixWorld(true);
          l.fetlock.quaternion.copy(l.knee.getWorldQuaternion(Qk).invert().multiply(Qf));
          l.fetlock.updateMatrixWorld(true);
          let y = Infinity;
          for (const p of l.solePts) y = Math.min(y, _v.copy(p).applyMatrix4(l.fetlock.matrixWorld).applyMatrix4(toRoot).y);
          const yWant = Math.max(SOLE_GROUND, low[i][s]);
          if (y < yWant) {
            l.fetlock.getWorldPosition(P4).applyMatrix4(toRoot);
            solveLeg(l, T.copy(P4).add(_w.set(0, yWant - y, 0)), toRoot);
          }
        }
        l.knee.updateMatrixWorld(true);
        l.fetlock.quaternion.copy(l.knee.getWorldQuaternion(Qk).invert().multiply(Qf));
        const [kt, kp, kk, kf] = legQ[i];
        l.top.quaternion.toArray(Q[kt], s * 4);
        l.pivot.quaternion.toArray(Q[kp], s * 4);
        l.knee.quaternion.toArray(Q[kk], s * 4);
        l.fetlock.quaternion.toArray(Q[kf], s * 4);
      });
    }
    // 4) Clip : boucle fermée (dernière clé = première), quaternions continus.
    const times = new Float32Array(N + 1);
    for (let s = 0; s <= N; s++) times[s] = s * dt;
    bodyP.copyWithin(N * 3, 0, 3);
    for (const q of Q) {
      q.copyWithin(N * 4, 0, 4);
      for (let s = 1; s <= N; s++) {
        const o = s * 4;
        if (q[o] * q[o - 4] + q[o + 1] * q[o - 3] + q[o + 2] * q[o - 2] + q[o + 3] * q[o - 1] < 0) {
          for (let c = 0; c < 4; c++) q[o + c] = -q[o + c];
        }
      }
    }
    const tracks = [new THREE.VectorKeyframeTrack('gSpine.position', times, bodyP)];
    qIdx.forEach((j, k) => tracks.push(new THREE.QuaternionKeyframeTrack(`g${RIG[j][0]}.quaternion`, times, Q[k])));
    out[name] = new THREE.AnimationClip(name, D, tracks);
  }
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  groups.forEach((g, i) => {
    g.position.copy(saved[i][0]);
    g.quaternion.copy(saved[i][1]);
    g.scale.copy(saved[i][2]);
  });
  root.updateMatrixWorld(true);
  return acc;
}

const _ik = { p: [V(), V(), V()], j: [V(), V(), V()], e: V(), a: V(), m: new THREE.Matrix3(), best: [0, 1, 2].map(() => new THREE.Quaternion()) };
/** Poids de l'épaule ou de la hanche dans la cinématique inverse (elle bouge peu : surtout coude et genou). */
const IK_TOP = 0.35;

/**
 * Cinématique inverse d'un membre : rotations autour de l'axe x local de l'épaule (ou de la hanche, peu),
 * du coude (ou du grasset) et du genou (ou du jarret) pour amener le boulet en T (repère toRoot), dans le
 * plan du membre : hauteur et avancée seulement (le côté, hors d'atteinte de ces axes, est rattrapé par
 * lockedGaits). Moindres carrés amortis : le plus petit changement de pose, sans à-coup près du membre
 * tendu ; un pas qui éloigne le boulet est annulé (pas suivant deux fois plus court). Hors d'atteinte :
 * la pose la plus proche. Renvoie la distance restante (hauteur et avancée).
 */
function solveLeg(l, T, toRoot) {
  const J = [l.top, l.pivot, l.knee];
  const { p, j, e, a, m, best } = _ik;
  const wt = [IK_TOP, 1, 1];
  let bestErr = Infinity;
  let gain = 1;
  for (let it = 0; it < 16; it++) {
    l.top.updateMatrixWorld(true);
    for (let k = 0; k < 3; k++) p[k].setFromMatrixPosition(J[k].matrixWorld).applyMatrix4(toRoot);
    const P4 = _v.setFromMatrixPosition(l.fetlock.matrixWorld).applyMatrix4(toRoot);
    e.subVectors(T, P4);
    e.x = 0;
    const err = e.lengthSq();
    if (err < bestErr) {
      bestErr = err;
      for (let k = 0; k < 3; k++) best[k].copy(J[k].quaternion);
    } else {
      // (le pas a éloigné le boulet : retour à la meilleure pose, pas plus court)
      for (let k = 0; k < 3; k++) J[k].quaternion.copy(best[k]);
      gain *= 0.5;
      continue;
    }
    if (err < 1e-8) break;
    // dP4/dθ = axe × (P4 - articulation), axe x local de l'os dans le repère du cheval
    for (let k = 0; k < 3; k++) {
      j[k].crossVectors(a.setFromMatrixColumn(J[k].matrixWorld, 0).transformDirection(toRoot), _w.subVectors(P4, p[k])).multiplyScalar(wt[k]);
    }
    // (JᵀJ + λ) dθ = Jᵀ e
    const lam = 0.005;
    const el = m.elements;
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) el[c * 3 + r] = j[r].dot(j[c]) + (r === c ? lam : 0);
    m.invert();
    const b0 = j[0].dot(e);
    const b1 = j[1].dot(e);
    const b2 = j[2].dot(e);
    for (let k = 0; k < 3; k++) {
      const d = el[k] * b0 + el[3 + k] * b1 + el[6 + k] * b2;
      J[k].rotateX(Math.max(-0.2, Math.min(0.2, d * gain)) * wt[k]);
    }
  }
  for (let k = 0; k < 3; k++) J[k].quaternion.copy(best[k]);
  l.top.updateMatrixWorld(true);
  return Math.sqrt(bestErr);
}

// ------------------------------------------------------------------ animation

/**
 * Mixeur d'animations d'un cheval : les clips d'allures se fondent selon la vitesse (chacun joué à
 * vitesse réelle / vitesse naturelle : les sabots posés ne glissent pas), le repos, le repos d'un
 * postérieur et le broutage selon l'occupation ; par-dessus : regard, oreilles, queue, respiration,
 * crinière qui pend (souple), tête jusqu'à l'herbe quelle que soit la race.
 */
class RealHorseAnim {
  /** gaits : allures déjà calées pour ce gabarit ({ clips, natural }), ou les clips du GLB (calés au premier pas). */
  constructor(model, gaits) {
    this.model = model;
    const clips = gaits.clips ?? gaits;
    this.natural = null;
    this.mixer = new THREE.AnimationMixer(model.root);
    this.actions = {};
    this.w = {};
    // (listes figées : rien n'est alloué à chaque image)
    this.names = [];
    this.list = [];
    this.target = {};
    for (const name of [...MOVING, 'canterR', ...STILL]) {
      const clip = clips[name];
      if (!clip) continue;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(name === 'idle' ? 1 : 0);
      a.time = Math.random() * clip.duration;
      this.actions[name] = a;
      this.w[name] = name === 'idle' ? 1 : 0;
      this.names.push(name);
      this.list.push(a);
      this.target[name] = 0;
    }
    this.gait = 'idle';
    this.restAmt = 0;
    this.restTimer = 8 + Math.random() * 20;
    // Ressorts (springTo) de la crinière et de la queue, dans le repère du cheval ; rebond (accélération vers le
    // haut ressentie par les crins, m/s²) et virage (accélération de côté) qui les secouent.
    const spring = () => ({ q: new THREE.Quaternion(), w: V(), on: false });
    this.maneS = model.mane.map(spring);
    this.tailS = [spring(), spring()];
    this.bounce = 0;
    this.lat = 0;
    this.bodyY = undefined;
    this.bodyVy = 0;
    this.effort = 0;
    this.breathPh = Math.random() * Math.PI * 2;
    this.t = Math.random() * 100;
    this.lead = 'canter';
    // Groupes que l'embonpoint ne doit pas élargir (enfants du tronc élargi).
    this.fatParts = [model.neck, model.tail, ...model.legs.map((l) => l.top)];
    // Pose des groupes écrite par le mixeur (voir update) : position, rotation, échelle.
    this.pose = model.groups.map((g) => [g.position.clone(), g.quaternion.clone(), g.scale.clone()]);
    // Dessiné depuis la dernière image (HorseMesh : caméra ou ombre) ; sinon l'animation est ralentie.
    // seenNow : vu pour l'image en cours (frame : son numéro, horseView.frame), gardé pour tous ses pas.
    this.seen = false;
    this.seenNow = false;
    this.frame = -1;
    this.skipDt = 0;
    this.skipN = 0;
    this.doze = 0;
    this.sadAmt = 0;
    this.proud = 1; // (port de tête relevé : voir overlay)
    if (gaits.natural) this.useGaits(gaits);
  }

  /**
   * Allures calées de ce gabarit (lockedGaits) à la place des clips du GLB, au premier pas : même poids, même
   * temps ; vitesse naturelle de chaque allure (le clip est joué à v ÷ celle-ci) et échelle des limites entre
   * allures (la foulée mesurée au trot plutôt que la hauteur de l'épaule).
   */
  useGaits(gaits = this.model.lockGaits?.()) {
    this.locked = true;
    if (!gaits) return;
    this.natural = gaits.natural;
    if (gaits.natural.trot) this.model.speedScale = gaits.natural.trot / NATURAL_SPEED.trot;
    for (let j = 0; j < this.names.length; j++) {
      const name = this.names[j];
      const clip = gaits.clips[name];
      const old = this.list[j];
      if (!NATURAL_SPEED[name] || !clip || clip === old.getClip()) continue;
      const a = this.mixer.clipAction(clip);
      a.play();
      a.setEffectiveWeight(old.getEffectiveWeight());
      a.time = old.time;
      a.timeScale = old.timeScale;
      old.stop();
      this.mixer.uncacheAction(old.getClip());
      this.actions[name] = a;
      this.list[j] = a;
    }
    // Galop allongé (GALLOP_REACH) : même durée que le galop, joué au même instant ; son poids est pris sur celui
    // du galop (update), il n'a pas de poids à lui dans this.w.
    const cx = gaits.clips.gallopX;
    if (cx && !this.actX && this.actions.gallop) {
      const a = this.mixer.clipAction(cx);
      a.play();
      a.setEffectiveWeight(0);
      a.time = this.actions.gallop.time;
      this.actX = a;
      this.actions.gallopX = a;
    }
  }

  /**
   * Le mixeur n'écrit une valeur que si elle a changé depuis l'image précédente (THREE.PropertyMixer) :
   * sur une piste constante (queue au repos, au trot…), ce que le procédural ou une activité ajoute
   * par-dessus resterait et s'additionnerait d'une image à l'autre (queue qui tourne et reste de
   * travers). Avant chaque mise à jour du mixeur, on remet donc la pose qu'il a écrite la dernière fois.
   */
  restorePose() {
    const gs = this.model.groups;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i];
      const P = this.pose[i];
      g.position.copy(P[0]);
      g.quaternion.copy(P[1]);
      g.scale.copy(P[2]);
    }
  }

  savePose() {
    const gs = this.model.groups;
    for (let i = 0; i < gs.length; i++) {
      const g = gs[i];
      const P = this.pose[i];
      P[0].copy(g.position);
      P[1].copy(g.quaternion);
      P[2].copy(g.scale);
    }
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.model.root);
  }

  /**
   * Une image. st : { v (m/s, cheval de taille 1), moving, sleeping, sad, graze (0-1 : tête à l'herbe),
   * feeder (0-1 : tête à la mangeoire), turn (virage, rad/s), fat (embonpoint) }.
   * Renvoie { gait (0 pas, 1 trot, 2 galop), phase (rad) } pour le cavalier et les bruits de sabots.
   */
  update(dt, st, out = {}) {
    const md = this.model;
    this.restorePose();
    if (this.reachFix === undefined) this.reachFix = this.computeReach();
    if (st.moving && !this.locked) this.useGaits();
    this.t += dt;
    const t = this.t;
    const u = st.moving ? st.v / md.speedScale : 0;
    const g0 = this.gait;
    const g = pickGait(g0, st.moving ? u : 0);
    this.gait = g;
    // Petit galop : à droite dans un virage à droite.
    if (g === 'canter' && g0 !== 'canter') this.lead = (st.turn ?? 0) < -0.2 ? 'canterR' : 'canter';
    // Repos d'un postérieur de temps en temps quand il ne fait rien.
    this.restTimer -= dt;
    if (this.restTimer <= 0) {
      this.resting = !this.resting;
      this.restTimer = this.resting ? 10 + Math.random() * 20 : 8 + Math.random() * 25;
    }
    const still = g === 'idle';
    const graze = still ? Math.max(st.graze ?? 0, st.feeder ?? 0) : 0;
    const target = this.target;
    for (let j = 0; j < this.names.length; j++) target[this.names[j]] = 0;
    if (still) {
      target.eat = graze;
      const r = this.resting && !st.sleeping ? 1 : 0;
      target.rest = (1 - graze) * r;
      target.idle = (1 - graze) * (1 - r);
    } else {
      target[g === 'canter' ? this.lead : g] = 1;
    }
    const k = 1 - Math.exp(-dt * (still ? 3 : 5));
    let lead = null;
    let leadW = 0;
    for (let j = 0; j < this.list.length; j++) {
      const name = this.names[j];
      const a = this.list[j];
      const was = this.w[name];
      const w = was + (target[name] - was) * k;
      this.w[name] = w;
      // Une allure qui entre se cale sur la phase de celle qui sort (moins de glissement pendant le fondu).
      if (was < 0.02 && w >= 0.02 && NATURAL_SPEED[name] && this.leadName) {
        const from = this.actions[this.leadName];
        a.time = (from.time / from.getClip().duration) * a.getClip().duration;
      }
      a.setEffectiveWeight(w);
      if (NATURAL_SPEED[name]) {
        // (vitesse naturelle de CE cheval : mesurée sur ses sabots, ses membres n'ont pas la longueur du modèle)
        const nat = this.natural?.[name] ?? NATURAL_SPEED[name] * md.speedScale;
        a.timeScale = Math.min(1.8, Math.max(0.3, (st.moving ? st.v : nat) / nat));
        if (w > leadW) {
          lead = name;
          leadW = w;
        }
      }
    }
    if (lead && leadW > 0.3) this.leadName = lead;
    this.stretchGallop(st);
    this.mixer.update(dt);
    this.savePose();
    this.overlay(dt, st, graze);
    // Pour le cavalier : allure (moyenne pondérée) et phase du clip qui mène.
    let gs = 0;
    let ws = 0;
    for (let j = 0; j < RIDER_KEYS.length; j++) {
      const name = RIDER_KEYS[j];
      const w = this.w[name] ?? 0;
      gs += (RIDER_GAIT[name] ?? 2) * w;
      ws += w;
    }
    out.gait = ws > 0.01 ? gs / ws : 0;
    const la = this.actions[this.leadName ?? 'walk'];
    out.phase = la ? (la.time / la.getClip().duration) * Math.PI * 2 : 0;
    out.moving = ws;
    return out;
  }

  /**
   * Galop plus rapide que sa vitesse naturelle : foulée allongée plutôt que cadence accélérée. Le poids du galop
   * (this.w.gallop) est partagé entre le galop et le galop allongé (part x, même instant du clip), joués à la
   * cadence (v ÷ naturelle)^GALLOP_CADENCE ; la foulée du mélange (naturelle du galop → du galop allongé) fait
   * le reste : les sabots posés ne glissent pas. Au-delà du galop allongé, la cadence reprend le relais.
   */
  stretchGallop(st) {
    const ag = this.actions.gallop;
    const ax = this.actX;
    if (!ag || !ax) return;
    const natG = this.natural?.gallop;
    const natX = this.natural?.gallopX;
    let x = 0;
    if (st.moving && natG && natX > natG && st.v > natG) {
      let ts = Math.min(GALLOP_CADENCE_MAX, (st.v / natG) ** GALLOP_CADENCE);
      x = (st.v / ts - natG) / (natX - natG);
      if (x > 1) {
        x = 1;
        ts = st.v / natX;
      }
      ts = Math.min(1.8, ts);
      ag.timeScale = ts;
    }
    this.stretch = x;
    const wg = this.w.gallop ?? 0;
    ag.setEffectiveWeight(wg * (1 - x));
    ax.setEffectiveWeight(wg * x);
    ax.timeScale = ag.timeScale;
    ax.time = ag.time;
  }

  /**
   * Queue souple : ressorts amortis sur Tail1 et Tail2 (repère du cheval), qui suivent la pose voulue (clip, port
   * de queue de la race, coup de queue, arc du galop) avec du retard — Tail2 plus souple, elle fouette après le
   * couard. Secoués par le rebond de l'allure (le corps qui retombe allège les crins : ils se soulèvent) et par
   * les virages (la queue part vers l'extérieur). Jamais vers les fesses (springLimit). Puis la courbure des
   * cartes de crins (hairDrag, horseHair.js) : mèches de la queue et de la crinière traînées en arrière par la
   * vitesse, pointes de la queue en retard quand elle fouette.
   */
  hairSprings(dt, st, photo) {
    const md = this.model;
    const y = md.body.position.y;
    if (photo || this.bodyY === undefined || dt > 0.25 || dt <= 0) {
      this.bodyVy = 0;
      this.bounce = 0;
      this.lat = 0;
    } else {
      const vy = (y - this.bodyY) / dt;
      const ay = (vy - this.bodyVy) / dt;
      this.bodyVy = vy;
      this.bounce += (Math.max(-15, Math.min(15, -ay)) - this.bounce) * (1 - Math.exp(-dt * 25));
      const v = st.moving ? (st.v ?? 0) : 0;
      this.lat += (Math.max(-12, Math.min(12, v * (st.turn ?? 0))) - this.lat) * (1 - Math.exp(-dt * 6));
    }
    this.bodyY = y;
    const T = TAIL_SPRING;
    const q1t = _qt1.copy(md.tail.quaternion);
    const q2t = _qt2.copy(q1t).multiply(md.tailTip.quaternion);
    // (le rebond ne soulève la queue que lorsqu'il l'allège : poussée vers les fesses, elle ne bougerait pas)
    _w.set(Math.max(0, this.bounce) * T.lift, 0, -this.lat * T.side);
    const ddt = photo ? 1 : dt;
    springTo(this.tailS[0], q1t, _w, ddt, T.k1, T.c1);
    springLimit(this.tailS[0], q1t, 0, -0.03, 0.6);
    _w.multiplyScalar(1.6);
    springTo(this.tailS[1], q2t, _w, ddt, T.k2, T.c2);
    springLimit(this.tailS[1], q2t, 0, -0.05, 0.8);
    md.tail.quaternion.copy(this.tailS[0].q);
    md.tailTip.quaternion.copy(_qs2.copy(this.tailS[0].q).invert().multiply(this.tailS[1].q));
    // Courbure des crins (repère de repos des cartes) : vent de la course vers l'arrière (un peu vers le haut),
    // retard des pointes de la queue qui fouette (vitesse du bout : vitesse angulaire × longueur pendante).
    const drag = md.hairDrag;
    if (!drag) return;
    const v = photo || !st.moving ? 0 : (st.v ?? 0);
    const run = smooth(1.5, 11, v);
    const wq = this.tailS[1].w;
    const lag = photo ? 0 : T.lag;
    // (bout de la queue à 0,7 m sous le couard : sa vitesse w × (0, -0,7, 0) ; les pointes restent en arrière)
    _w.set(-lag * 0.7 * wq.z, 0.25 * run * T.bend, -run * T.bend + lag * 0.7 * wq.x);
    // (vers le repère de repos de Tail2 : les crins de la queue y sont liés)
    _qs2.copy(this.tailS[1].q).invert();
    drag.tail.value.copy(_w).applyQuaternion(_qs2);
    drag.up.value.set(0, 1, 0).applyQuaternion(_qs2);
    drag.mane.value.set(0, 0.3 * run * MANE_SPRING.bend, -run * MANE_SPRING.bend);
    // (boîte du cheval élargie d'autant du côté de la queue : la pointe d'une queue de 1 m s'écarte de la
    // courbure × 1 m)
    if (md.bounds) (md.bounds.tailShift ??= V()).copy(_w).multiplyScalar(md.tailLen ?? 1);
  }

  /** Procédural par-dessus les clips. */
  overlay(dt, st, graze) {
    const md = this.model;
    const t = this.t;
    const photo = !!this.photo;
    // Essoufflement : l'effort monte au galop (moins au petit galop et au trot) en 12 s environ et retombe en
    // 40 s : après une galopade, le cheval souffle (respiration plus ample et plus rapide, encolure qui suit).
    const run = Math.min(1, (this.w.gallop ?? 0) + 0.55 * ((this.w.canter ?? 0) + (this.w.canterR ?? 0)) + 0.2 * (this.w.trot ?? 0));
    if (!photo) this.effort += (run - this.effort) * (1 - Math.exp(-dt / (run > this.effort ? 12 : 40)));
    const effort = photo ? 0 : this.effort;
    // Respiration (côtes) et embonpoint (tronc plus large, membres et encolure gardent leur forme).
    // L'embonpoint n'élargit qu'en x, comme le cheval sculpté : l'origine du tronc est au sol, une échelle
    // en y y remonterait les épaules et les hanches (sabots en l'air, dos au-dessus de la selle du cavalier).
    // Au repos : 12 respirations par minute (8 en dormant), jusqu'à 60 essoufflé ; le flanc se soulève de 2 %
    // (4 % essoufflé). (Avant : 20 par minute, 1,4 %, la même après un galop.)
    const rate = st.sleeping ? 0.14 : BREATH.rest + (BREATH.blown - BREATH.rest) * effort;
    this.breathPh = photo ? 0 : (this.breathPh + dt * rate * Math.PI * 2) % (Math.PI * 2);
    // (inspiration plus courte que l'expiration)
    const bs = Math.sin(this.breathPh + 0.35 * Math.sin(this.breathPh));
    const amp = (st.moving ? 0.006 : BREATH.amp) + BREATH.ampBlown * effort;
    const breathe = bs * amp;
    md.ribs.scale.set(1 + breathe, 1 + breathe * 0.7, 1 + breathe * 0.2);
    const fat = st.fat ?? 1;
    md.body.scale.set(fat, 1, 1);
    md.fat = fat;
    if (fat !== 1) {
      for (let j = 0; j < this.fatParts.length; j++) this.fatParts[j].scale.set(1 / fat, 1, 1);
    }
    // Somnolence : encolure basse, oreilles sur le côté ; tristesse : tête un peu basse.
    this.doze = (this.doze ?? 0) + ((st.sleeping ? 1 : 0) - (this.doze ?? 0)) * Math.min(1, dt * 1.5);
    this.sadAmt = (this.sadAmt ?? 0) + ((st.sad && !st.moving ? 1 : 0) - (this.sadAmt ?? 0)) * Math.min(1, dt * 1.5);
    const neckDrop = this.doze * 0.42 + this.sadAmt * 0.25 * (1 - graze);
    // Broutage : le clip pose le bout du nez à l'herbe pour le modèle d'origine ; pour une autre race
    // (membres, encolure, tête différents) on corrige l'angle de l'encolure.
    const eat = this.w.eat ?? 0;
    const reach = (this.reachFix ?? 0) * eat;
    const feeder = (st.feeder ?? 0) * eat * -0.42;
    // Port de tête : les clips portent la tête « encapuchonnée » (à l'arrêt, chanfrein à 68° sous l'horizontale,
    // menton rentré : air triste). Encolure et nuque relevées (HEAD_UP : 50° environ), partagées entre les deux
    // pour ne pas étirer la gorge ; rien quand il broute ou somnole, moins quand il est triste et aux allures
    // rapides (le galop tend l'encolure vers l'avant). Lissé : la tête monte et descend en douceur.
    const fast = Math.min(1, (this.w.canter ?? 0) + (this.w.canterR ?? 0) + (this.w.gallop ?? 0));
    const proud = (1 - eat) * (1 - this.doze) * (1 - 0.6 * fast) * (1 - 0.6 * this.sadAmt);
    this.proud += (proud - this.proud) * Math.min(1, dt * 4);
    const up = this.proud;
    // Hochement de tête au pas : deux fois par foulée, en phase avec le clip (tête au plus bas juste après la pose
    // de chaque antérieur) ; le clip seul ne hochait que de 0,05 rad, à peine visible. Au galop, la pompe de
    // l'encolure du clip (0,13 rad, coup de tête en l'air vu de 3/4) ramenée à 0,09, nez un peu plus en avant
    // (encolure tendue), d'autant plus que la foulée s'allonge.
    let nodN = 0;
    let nodH = 0;
    const ww = this.w.walk ?? 0;
    if (ww > 0.01 && this.actions.walk) {
      const p = this.actions.walk.time / this.actions.walk.getClip().duration;
      nodN += WALK_NOD.neck * ww * Math.cos(Math.PI * 4 * (p - 0.3));
      nodH += WALK_NOD.head * ww * Math.cos(Math.PI * 4 * (p - 0.3) + 0.6);
    }
    const wgal = this.w.gallop ?? 0;
    if (wgal > 0.01 && this.actions.gallop) {
      const p = this.actions.gallop.time / this.actions.gallop.getClip().duration;
      nodN -= GALLOP_PUMP.calm * wgal * Math.cos(Math.PI * 2 * (p - 0.55));
      nodH -= wgal * (GALLOP_PUMP.reach + GALLOP_PUMP.stretch * (this.stretch ?? 0));
    }
    // (essoufflé, à l'arrêt : l'encolure suit le souffle)
    if (!st.moving) nodN += 0.025 * effort * bs;
    if (neckDrop || reach || feeder || up || nodN) md.neck.rotateX(neckDrop + reach + feeder - HEAD_UP.neck * up + nodN);
    if (this.doze || up || nodH) md.head.rotateX(this.doze * 0.12 - HEAD_UP.head * up + nodH);
    // Regard qui se promène (moins en marche).
    const look = photo ? 0 : (Math.sin(t * 0.37) * 0.5 + Math.sin(t * 0.13 + 1.7) * 0.5) * 0.32 * (st.moving ? 0.15 : 1) * (1 - graze * 0.7);
    if (look) md.neck.quaternion.premultiply(_qYaw.setFromAxisAngle(AXIS_Y, look));
    // Oreilles : elles pivotent un peu vers ce qu'il écoute, ensemble la plupart du temps, pointées vers l'avant
    // quand il est attentif ; sur le côté quand il somnole. (Avant : ±0,3 rad chacune de son côté, une oreille
    // se couchait parfois à l'horizontale.) Contre les mouches (à l'arrêt, éveillé) : par moments, une oreille
    // chasse d'un petit coup sec en arrière et revient (earFlick).
    const alert = 1 - this.doze;
    const both = Math.sin(t * 0.31 + 0.6) * 0.09;
    const kid = md.root.id % 7;
    for (let i = 0; i < md.ears.length; i++) {
      const e = md.ears[i];
      const s = i === 0 ? 1 : -1;
      const n1 = Math.sin(t * 1.3 + i * 2.1) + Math.sin(t * 0.47 + i);
      // (coup d'oreille : le pavillon pivote vers l'arrière autour de l'axe de l'oreille, la pointe un peu en arrière)
      const fl = photo || st.moving ? 0 : earFlick(t, kid + i * 2.9) * alert;
      e.rotateX(n1 * 0.04 + this.doze * 0.2 - 0.08 * alert * this.proud - 0.12 * fl);
      e.rotateZ(-s * (this.doze * 0.45 + Math.max(0, Math.sin(t * 0.9 + i * 1.7)) * 0.06 + 0.04 * fl));
      e.rotateY((s * Math.sin(t * 0.7 + i * 3) * 0.06 + both) * alert + s * 0.38 * fl);
    }
    // Port de queue de la race (arabe, saddlebred, welsh) : couard relevé, crins qui retombent en arc.
    const set = md.build.tailSet ?? 0;
    if (set) {
      md.tail.rotateX(set * 0.75);
      md.tailTip.rotateX(-set * TAIL_SET_FALL);
    }
    // Queue : de temps en temps un coup de fouet contre les mouches.
    const swish = photo ? 0 : tailSwish(t, kid);
    if (swish) {
      md.tail.rotateZ(swish * SWISH.dock);
      md.tailTip.rotateZ(swish * SWISH.tip);
    }
    // Au galop, le bout de la queue retombe en arc (couard relevé par le clip, crins qui flottent derrière) au
    // lieu d'une planche levée d'un bloc.
    const arc = Math.min(1, wgal + 0.6 * ((this.w.canter ?? 0) + (this.w.canterR ?? 0)));
    if (arc > 0.01) md.tailTip.rotateX(-TAIL_ARC * arc);
    // Mouvement de la queue et de la crinière : ressorts amortis (hairSprings), secoués par le rebond du corps et
    // par les virages, traînés par la vitesse.
    this.hairSprings(dt, st, photo);
    // Crinière : elle pend (pesanteur) au lieu de suivre l'encolure, et flotte (ressorts : retard, rebond de
    // l'allure, vent de la course). relN : rotation de l'encolure dans le repère du cheval (tronc × encolure,
    // rotations locales : aucune matrice du monde à refaire, le rendu s'en charge) ; rel : depuis son repos.
    const relN = _q.copy(md.body.quaternion).multiply(md.neck.quaternion);
    const rel = _qa.copy(relN).multiply(QNECK_REST_INV);
    const relNinv = _qc.copy(relN).invert();
    const v = st.moving ? (st.v ?? 0) : 0;
    const drag = MANE_SPRING.drag * smooth(1.5, 10, v);
    const flutter = Math.min(1, v / 6) * 0.05 + 0.01;
    for (let i = 0; i < md.mane.length; i++) {
      const m = md.mane[i];
      // monde voulu : entre « suit l'encolure » (rel) et « pend comme au repos » (identité), mèches poussées
      // en arrière par le vent de la course (rotation x)
      // (crinière tressée, concours de beauté : elle suit l'encolure, sans pendre ni flotter — les boutons, portés par
      // l'encolure, restaient sinon en l'air au-dessus de la crête quand le cheval levait ou baissait la tête)
      const want = md.braided ? _qb.copy(rel) : _qb.copy(rel).slerp(QI, 0.55 + i * 0.08);
      if (drag && !md.braided) want.multiply(_qd.setFromAxisAngle(AXIS_X, drag * (0.7 + 0.1 * i)));
      // (rebond de l'allure : les mèches se soulèvent du côté de la crinière, plus vers le garrot où elles sont
      // longues ; un retard par os, la crinière ondule du garrot à la nuque)
      _w.set(0, 0, -this.bounce * MANE_SPRING.lift * (1.15 - 0.1 * i));
      springTo(this.maneS[i], want, _w, dt, MANE_SPRING.k - 4 * i, MANE_SPRING.c);
      // (les mèches, du côté droit, ne rentrent pas dans l'encolure : rotation z vers +x tenue près de la cible)
      springLimit(this.maneS[i], want, 2, -0.6, 0.02);
      m.quaternion.copy(this.maneS[i].q).premultiply(relNinv);
      if (!md.braided) m.rotateZ(Math.sin(t * 5 + i * 0.8) * flutter);
    }
    md.hairSway.value = Math.min(2.5, (st.v ?? 0) * 0.45) + (Math.abs(swish) > 0.2 ? 1 : 0);
    // Sabots jamais sous le sol (fondu entre deux clips, proportions de la race) : on relève le corps.
    // Dans le repère du cheval, par le produit des matrices locales (tronc, épaule ou hanche, coude ou
    // grasset, genou ou jarret, boulet) : ni matrice du monde ni inversion.
    let low = 0;
    md.body.updateMatrix();
    for (let j = 0; j < md.legs.length; j++) {
      const l = md.legs[j];
      l.top.updateMatrix();
      l.pivot.updateMatrix();
      l.knee.updateMatrix();
      l.fetlock.updateMatrix();
      _m.multiplyMatrices(md.body.matrix, l.top.matrix).multiply(l.pivot.matrix).multiply(l.knee.matrix).multiply(l.fetlock.matrix);
      for (let q = 0; q < l.solePts.length; q++) {
        const y = _v.copy(l.solePts[q]).applyMatrix4(_m).y;
        if (y < low) low = y;
      }
    }
    if (low < 0) md.body.position.y -= low;
  }

  /**
   * Pose de photo (vignettes, essayage de la sellerie, portrait de la fiche) : à l'arrêt, attentif — clip
   * d'arrêt seul à un instant fixe, tête relevée (HEAD_UP), oreilles en avant, regard droit devant, sans
   * broutage, somnolence, coup de queue ni hasard : la même photo à chaque fois.
   */
  photoPose() {
    this.restorePose();
    for (let j = 0; j < this.list.length; j++) {
      const name = this.names[j];
      const on = name === 'idle' || (!this.actions.idle && j === 0);
      this.list[j].setEffectiveWeight(on ? 1 : 0);
      this.list[j].time = 0;
      this.w[name] = on ? 1 : 0;
    }
    this.actX?.setEffectiveWeight(0);
    this.mixer.update(0);
    this.savePose();
    this.doze = 0;
    this.sadAmt = 0;
    this.proud = 1;
    this.photo = true;
    const t = this.t;
    this.t = 0;
    // (dt = 1 : la crinière a fini de retomber)
    this.overlay(1, { v: 0, moving: false, sleeping: false, sad: false, graze: 0, feeder: 0, turn: 0, fat: 1 }, 0);
    this.t = t;
    this.photo = false;
    this.model.root.updateMatrixWorld(true);
  }

  /** Correction d'angle de l'encolure pour que le bout du nez touche l'herbe (pose « eat » de cette race). */
  computeReach() {
    const md = this.model;
    const a = this.actions.eat;
    if (!a) return 0;
    // pose eat seule, à mi-clip
    const saved = Object.entries(this.actions).map(([n, x]) => [x, x.getEffectiveWeight(), x.time]);
    for (const [x] of saved) x.setEffectiveWeight(0);
    a.setEffectiveWeight(1);
    a.time = a.getClip().duration * 0.5;
    this.mixer.update(0);
    const muzzle = () => {
      md.root.updateMatrixWorld(true);
      _v.set(0, -0.12 * md.dims.snoutZ, md.dims.snoutZ * 0.97).applyMatrix4(md.head.matrixWorld);
      return md.root.worldToLocal(_v).y;
    };
    // L'encolure tourne autour de sa base : on cherche l'angle qui met le bout du nez à 3 cm du sol.
    let fix = 0;
    const neckQ = md.neck.quaternion.clone();
    for (let i = 0; i < 6; i++) {
      md.neck.quaternion.copy(neckQ);
      md.neck.rotateX(fix);
      const y = muzzle() - 0.03;
      if (Math.abs(y) < 0.004) break;
      const lever = Math.max(0.4, md.dims.snoutZ + 0.6);
      fix += y / lever;
    }
    md.neck.quaternion.copy(neckQ);
    for (const [x, w, time] of saved) {
      x.setEffectiveWeight(w);
      x.time = time;
    }
    return Math.max(-0.5, Math.min(0.5, fix));
  }
}

/**
 * Coup de queue contre les mouches à l'instant t (rad, 0 la plupart du temps) : par salves de 4 s
 * environ toutes les 27 s, décalées d'un cheval à l'autre (k).
 */
export function tailSwish(t, k = 0) {
  return Math.sin(t * 0.23 + k) > 0.9 ? Math.sin(t * 9) * 0.35 : 0;
}

/**
 * Allure d'après la vitesse (m/s, ramenée à la taille du modèle d'origine), avec hystérésis : pas de
 * va-et-vient entre deux allures quand la vitesse est à la limite. prev : allure de l'image précédente.
 */
const GAIT_UP = { walk: 2.15, trot: 3.9, canter: 6.3 };
const GAIT_DOWN = { trot: 1.85, canter: 3.55, gallop: 5.8 };
export function pickGait(prev, u) {
  const up = GAIT_UP;
  const down = GAIT_DOWN;
  if (!(u >= 0.03)) return 'idle';
  let g = prev === 'idle' || !prev ? 'walk' : prev;
  for (let k = 0; k < 3; k++) {
    if (g === 'walk' && u > up.walk) g = 'trot';
    else if (g === 'trot' && u > up.trot) g = 'canter';
    else if (g === 'canter' && u > up.canter) g = 'gallop';
    else if (g === 'gallop' && u < down.gallop) g = 'canter';
    else if (g === 'canter' && u < down.canter) g = 'trot';
    else if (g === 'trot' && u < down.trot) g = 'walk';
  }
  return g;
}

/**
 * Port de tête relevé à l'arrêt et au pas (rad, rotation x : encolure à sa base, tête à la nuque ; voir
 * RealHorseAnim.overlay). Chanfrein mesuré à 68° sous l'horizontale avec les clips seuls, 50° environ avec.
 */
export const HEAD_UP = { neck: 0.12, head: 0.18 };

/** Hochement de tête ajouté au pas (rad, rotation x de l'encolure et de la nuque ; le clip en a déjà 0,05 et 0,03). */
export const WALK_NOD = { neck: 0.04, head: 0.015 };
/**
 * Galop : pompe de l'encolure du clip réduite de calm (0,13 → 0,09 rad), nez en avant de reach, plus stretch au
 * galop allongé (rad, rotation x de la nuque).
 */
const GALLOP_PUMP = { calm: 0.04, reach: 0.05, stretch: 0.05 };
/**
 * Queue portée haut (arabe, saddlebred, welsh : tailSet) : les crins retombent en panache depuis le couard relevé
 * (rad, rotation x de Tail2 par rapport à Tail1, × tailSet ; 0,4 avant : une planche raide levée en arrière).
 */
const TAIL_SET_FALL = 0.75;
/** Bout de la queue qui retombe en arc au galop (rad, rotation x de Tail2 par rapport à Tail1). */
const TAIL_ARC = 0.35;
/**
 * Respiration (Hz, part du flanc) : au repos, essoufflé (BREATH.blown, après une galopade), amplitude au repos et
 * en plus essoufflé.
 */
export const BREATH = { rest: 0.2, blown: 1.0, amp: 0.02, ampBlown: 0.022 };
/**
 * Ressorts amortis de la queue (Tail1, Tail2 plus souple : elle fouette après le couard) et de la crinière :
 * raideur k (s⁻²), amortissement c (s⁻¹) ; lift : secousse du rebond de l'allure (rad/s² par m/s²) ; side :
 * balancement dans les virages (rad/s² par m/s²) ; drag : mèches de la crinière poussées en arrière à la course
 * (rad) ; bend : courbure des crins par la vitesse (cartes de crins, hairDrag) ; lag : retard des crins de la queue
 * qui fouette (s).
 */
/**
 * Coup de queue contre les mouches (tailSwish × ce facteur, rad de rotation z du couard et du bout) : plus ample
 * qu'avant (0,6 et 1) — les ressorts de la queue en retiennent une part, le bout fouette après le couard.
 */
const SWISH = { dock: 0.85, tip: 1.3 };
export const TAIL_SPRING = { k1: 70, c1: 10, k2: 38, c2: 6.5, lift: 5, side: 0.5, bend: 0.45, lag: 0.07 };
export const MANE_SPRING = { k: 60, c: 11, lift: 3.2, drag: 0.22, bend: 0.3 };

/**
 * Ressort amorti d'une rotation (repère du cheval) : S = { q, w (vitesse angulaire, rad/s), on } suit target
 * (raideur k, amortissement c), poussé par l'accélération angulaire alpha (rad/s²). Pas de 1/60 s au plus (stable
 * en avance rapide) ; au premier appel, ou après une longue pause, il part de la cible sans vitesse.
 */
function springTo(S, target, alpha, dt, k, c) {
  if (!S.on || dt > 0.5) {
    S.q.copy(target);
    S.w.set(0, 0, 0);
    S.on = true;
    return S.q;
  }
  const n = Math.min(8, Math.ceil(dt * 60 - 1e-6));
  const h = dt / n;
  for (let s = 0; s < n; s++) {
    // erreur : rotation qui amène S.q sur la cible (vecteur rotation)
    _qs.copy(S.q).invert().premultiply(target);
    if (_qs.w < 0) _qs.set(-_qs.x, -_qs.y, -_qs.z, -_qs.w);
    const sn = Math.hypot(_qs.x, _qs.y, _qs.z);
    const ang = 2 * Math.atan2(sn, _qs.w);
    const f = sn > 1e-9 ? ang / sn : 2;
    S.w.x += (k * _qs.x * f - c * S.w.x + alpha.x) * h;
    S.w.y += (k * _qs.y * f - c * S.w.y + alpha.y) * h;
    S.w.z += (k * _qs.z * f - c * S.w.z + alpha.z) * h;
    const wl = S.w.length();
    if (wl > 1e-9) S.q.premultiply(_qs.setFromAxisAngle(_ws.copy(S.w).multiplyScalar(1 / wl), wl * h));
  }
  return S.q;
}

/**
 * Tient la rotation S.q du côté permis d'un axe par rapport à target : composante axis (0 x, 2 z) de l'écart
 * (vecteur rotation) au moins lo, au plus hi ; la vitesse qui pousse au-delà est annulée (la queue ne passe
 * pas dans les fesses, la crinière pas dans l'encolure).
 */
function springLimit(S, target, axis, lo, hi) {
  _qs.copy(S.q).multiply(_qs2.copy(target).invert());
  if (_qs.w < 0) _qs.set(-_qs.x, -_qs.y, -_qs.z, -_qs.w);
  const sn = Math.hypot(_qs.x, _qs.y, _qs.z);
  const f = sn > 1e-9 ? (2 * Math.atan2(sn, _qs.w)) / sn : 2;
  _ws.set(_qs.x * f, _qs.y * f, _qs.z * f);
  const e = _ws.getComponent(axis);
  const ec = Math.min(hi, Math.max(lo, e));
  if (ec === e) return;
  _ws.setComponent(axis, ec);
  const wv = S.w.getComponent(axis);
  if ((e < lo && wv < 0) || (e > hi && wv > 0)) S.w.setComponent(axis, 0);
  const a = _ws.length();
  if (a > 1e-9) _qs.setFromAxisAngle(_ws.multiplyScalar(1 / a), a);
  else _qs.identity();
  S.q.copy(_qs).multiply(target);
}

/**
 * Coup d'oreille contre les mouches à l'instant t (0 → 1 → 0 en 0,3 s environ), 0 la plupart du temps : par
 * moments (une période sur deux de 30 s environ), toutes les 5 s environ, décalé d'une oreille et d'un cheval à
 * l'autre (k). Aucun hasard : la même animation à chaque fois.
 */
export function earFlick(t, k = 0) {
  if (Math.sin(t * 0.21 + k * 1.3) < 0.2) return 0;
  const s = Math.sin(t * 1.27 + k * 2.17);
  return s > 0.985 ? Math.sin(((s - 0.985) / 0.015) * Math.PI * 0.5) : 0;
}

const _qs = new THREE.Quaternion();
const _qs2 = new THREE.Quaternion();
const _ws = V();
const _qd = new THREE.Quaternion();
const _qt1 = new THREE.Quaternion();
const _qt2 = new THREE.Quaternion();
const AXIS_X = V(1, 0, 0);

const QNECK_REST = new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), NECK_REST);
const QNECK_REST_INV = QNECK_REST.clone().invert();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qc = new THREE.Quaternion();
const QI = new THREE.Quaternion();
const _qYaw = new THREE.Quaternion();
const AXIS_Y = V(0, 1, 0);

/**
 * Poses des membres imposées par les activités (src/game/Activities.js, écrites après l'animation) :
 * 'jump' (saut d'obstacle : antérieurs repliés sous le poitrail, postérieurs repliés sous le ventre),
 * 'down' (couché sur le sternum, membres repliés), 'hoof' (antérieur levé, genou plié : « donner le
 * sabot »), 'bow' (révérence, voir bowPose). s : 0 → 1 (amplitude). sg : groupe d'échelle de l'entité
 * (pour se coucher, pour la révérence : il bascule et se pose au sol). t : phase d'un saut d'obstacle
 * (0 → 1, voir jumpLegs ; sans elle, 'jump' replie tout selon s). Renvoie true si le modèle est le cheval
 * réaliste (sinon l'activité garde sa pose habituelle).
 */
export function realLegPose(md, kind, s, sg = null, t = null) {
  if (!md?.real) return false;
  const front = md.legs.filter((l) => l.front);
  const hind = md.legs.filter((l) => !l.front);
  if (kind === 'jump' && t !== null) {
    jumpLegs(front, hind, t);
  } else if (kind === 'jump') {
    for (const l of front) {
      l.pivot.rotation.x = -1.2 * s;
      l.knee.rotation.x = 1.9 * s;
      l.fetlock.rotation.x = 0.5 * s;
    }
    for (const l of hind) {
      l.pivot.rotation.x = -0.75 * s;
      l.knee.rotation.x = 1.25 * s;
      l.fetlock.rotation.x = 0.55 * s;
    }
  } else if (kind === 'down') {
    for (const l of front) {
      l.pivot.rotation.x = 1.15 * s;
      l.knee.rotation.x = -2.3 * s;
      l.fetlock.rotation.x = 0.4 * s;
    }
    for (const l of hind) {
      l.pivot.rotation.x = -1.35 * s;
      l.knee.rotation.x = 2.1 * s;
      l.fetlock.rotation.x = 0.4 * s;
    }
    if (sg) sg.position.y = -0.6 * md.legTop * sg.scale.y * s;
  } else if (kind === 'hoof') {
    // Donner le sabot : depuis la pose de l'allure, dont l'écart s'efface pendant le premier tiers du geste
    // (remplacer d'un coup ses angles faisait piquer la pince de 1 à 1,4 cm dans le sol au début) ; le
    // genou mène (le sabot quitte le sol à plat, talons et pince ensemble, avant de partir en avant), le
    // boulet ne se plie qu'ensuite ; et la sole ne passe jamais sous le sol.
    const l = front[0];
    const b0 = l.pivot.rotation.x;
    const b1 = l.knee.rotation.x;
    const b2 = l.fetlock.rotation.x;
    // (up : genou plus plié, boulet d'autant moins : le sabot garde son angle et monte, en reculant un peu,
    // car en appui le canon penche vers l'arrière ; d : le surplus qui garde la sole sur son plancher)
    const pose = (a, d = 0) => {
      const w = 1 - smooth(0, 0.3, a);
      const up = 0.25 * smooth(0, 0.3, a) * (1 - smooth(0.3, 0.9, a)) + d;
      l.pivot.rotation.x = -1.1 * a + b0 * w;
      l.knee.rotation.x = 1.1 * a + b1 * w + up;
      l.fetlock.rotation.x = 0.3 * smooth(0.35, 1, a) + b2 * w - up;
    };
    // Plancher de la sole : jamais sous sa hauteur de départ, et au sol dès le premier quart du geste.
    // (Avant, dès que la pince piquait, la pose était prise plus loin dans le geste, dès s ≈ 0,03 puisque la
    // pose d'arrêt est au sol ou juste dessous : le sabot sautait de 10 à 20 cm en une image, au début et à
    // la fin du tour.) Le surplus d, lui, est nul au départ puis continu avec s : la sole monte avec d.
    const h0 = legLow(md, l);
    const floor = SOLE_GROUND - Math.max(0, SOLE_GROUND - h0) * (1 - smooth(0, 0.25, s)) - 1e-5;
    pose(s);
    if (s > 0 && legLow(md, l) < floor) {
      let lo = 0;
      let hi = 0.4;
      for (let i = 0; i < 14; i++) {
        const d = (lo + hi) / 2;
        pose(s, d);
        if (legLow(md, l) < floor) lo = d;
        else hi = d;
      }
      pose(s, hi);
    }
  } else if (kind === 'bow') {
    bowPose(md, front, hind, s, sg);
  } else return false;
  return true;
}

/**
 * Membres pendant un saut d'obstacle, selon sa phase t (0 → 1, de l'appel à la réception), fondus avec
 * l'allure (pose du clip) au début et à la fin : à l'appel, les postérieurs poussent (tendus vers
 * l'arrière) pendant que les antérieurs se replient haut sous le poitrail ; au-dessus de la barre, tout est
 * replié ; à la réception, les antérieurs se tendent vers le sol, un peu en avant, les postérieurs suivent.
 */
function jumpLegs(front, hind, t) {
  const w = smooth(0, 0.15, t) * (1 - smooth(0.85, 1, t));
  if (w <= 0) return;
  const mix = (g, a) => {
    g.rotation.x += (a - g.rotation.x) * w;
  };
  const ff = smooth(0.04, 0.24, t) * (1 - smooth(0.5, 0.72, t));
  const fr = smooth(0.5, 0.72, t);
  for (const l of front) {
    mix(l.top, -0.22 * ff);
    mix(l.pivot, -1.2 * ff - 0.3 * fr);
    mix(l.knee, 1.9 * ff + 0.05 * fr);
    mix(l.fetlock, 0.5 * ff - 0.1 * fr);
  }
  const hp = 1 - smooth(0.05, 0.28, t);
  const hf = smooth(0.1, 0.36, t) * (1 - smooth(0.7, 0.95, t));
  for (const l of hind) {
    mix(l.pivot, 0.3 * hp - 0.8 * hf);
    mix(l.knee, -0.2 * hp + 1.3 * hf);
    mix(l.fetlock, -0.25 * hp + 0.55 * hf);
  }
}

/**
 * Point le plus bas de la sole d'un membre, dans le repère du cheval (origine au sol), par le produit des
 * matrices locales (tronc, épaule ou hanche, coude ou grasset, genou ou jarret, boulet), comme le calage de
 * RealHorseAnim.overlay : ni matrice du monde ni inversion.
 */
function legLow(md, l) {
  md.body.updateMatrix();
  l.top.updateMatrix();
  l.pivot.updateMatrix();
  l.knee.updateMatrix();
  l.fetlock.updateMatrix();
  _m.multiplyMatrices(md.body.matrix, l.top.matrix).multiply(l.pivot.matrix).multiply(l.knee.matrix).multiply(l.fetlock.matrix);
  let low = Infinity;
  for (const p of l.solePts) low = Math.min(low, _v.copy(p).applyMatrix4(_m).y);
  return low;
}

const _mInv = new THREE.Matrix4();

/** Semelle la plus basse de ces membres, dans le repère m (matrices du monde à jour). */
function lowestSole(legs, m) {
  let low = Infinity;
  for (const l of legs) {
    for (const p of l.solePts) low = Math.min(low, _v.copy(p).applyMatrix4(l.fetlock.matrixWorld).applyMatrix4(m).y);
  }
  return low;
}

/**
 * Révérence (spectacle) : l'avant-main bascule vers le sol, les antérieurs se tendent vers l'avant
 * (épaule et coude, genou droit, sabot à plat), les postérieurs restent sous la masse. L'angle des
 * antérieurs est cherché pour que leurs sabots touchent le sol en même temps que les postérieurs, puis
 * le groupe d'échelle (sg) est posé pour que la semelle la plus basse soit au sol : rien ne passe sous la
 * scène, et le bout du nez reste au-dessus (encolure relevée s'il broutait encore).
 */
function bowPose(md, front, hind, s, sg) {
  const A = 1.3; // (antérieurs tendus au plus : au-delà, l'avant-main bascule moins)
  let th = 0.28 * s;
  const pose = (a) => {
    for (const l of front) {
      l.top.rotation.x = -0.35 * a;
      l.pivot.rotation.x = -0.65 * a;
      l.knee.rotation.x = 0;
      l.fetlock.rotation.x = Math.max(0, a - th) * 0.7;
    }
  };
  const top = sg ?? md.root;
  const frame = top.parent ?? top;
  let yHind = 0;
  let hi = A;
  for (let tries = 0; tries < 4; tries++) {
    if (sg) {
      sg.rotation.x = th;
      sg.position.y = 0;
    }
    // (postérieurs : le basculement les met sous la masse ; sabots remis à plat)
    for (const l of hind) l.fetlock.rotation.x = -th;
    pose(0);
    top.updateMatrixWorld(true);
    _mInv.copy(frame.matrixWorld).invert();
    yHind = lowestSole(hind, _mInv);
    // Angle des antérieurs : dichotomie (les sabots montent quand les membres se tendent vers l'avant).
    let lo = 0;
    hi = A;
    for (let i = 0; i < 10; i++) {
      const a = (lo + hi) / 2;
      pose(a);
      for (const l of front) l.top.updateMatrixWorld(true);
      if (lowestSole(front, _mInv) < yHind) lo = a;
      else hi = a;
    }
    pose(hi);
    for (const l of front) l.top.updateMatrixWorld(true);
    // Membres trop courts pour ce tronc (trait, poney) : l'avant-main descend moins.
    if (hi < A - 0.01 || lowestSole(front, _mInv) > yHind - 0.003) break;
    th *= 0.8;
  }
  const low = Math.min(yHind, lowestSole(front, _mInv));
  if (sg) sg.position.y = -low;
  // Bout du nez au-dessus du sol (6 cm, cheval de taille 1) : on relève l'encolure tant qu'il manque.
  if (sg) top.updateMatrixWorld(true);
  const sc = sg?.scale.y ?? 1;
  for (let i = 0; i < 6; i++) {
    _w.copy(md.mouth).applyMatrix4(md.head.matrixWorld).applyMatrix4(_mInv);
    const short = 0.06 * sc - (sg ? _w.y : _w.y - low);
    if (short <= 0.002) break;
    md.neck.rotateX(-Math.min(0.5, short / Math.max(0.3, md.dims.snoutZ * sc)));
    md.neck.updateMatrixWorld(true);
  }
}

/**
 * Animation d'une entité (AnimalEntity) au cheval réaliste : ce qu'il fait (allure selon sa vitesse,
 * broutage, repos, somnolence) ; renseigne e.gait et e.phase (cavalier, bruits de sabots).
 */
export function animateRealHorse(e, dt, sad) {
  const md = e.model;
  const anim = md.anim;
  // Version réduite au loin (distance à la caméra du jeu, ramenée à la taille du cheval).
  if (horseView.on && md.setLod && !md.lodHold) {
    const far = gfx.quality === 'high' ? LOD_DIST.high : LOD_DIST.low;
    const d = _w.setFromMatrixPosition(e.root.matrixWorld).distanceTo(horseView.eye) / Math.max(0.3, e.scale);
    md.setLod(d > far * (md.lodLevel ? 0.9 : 1) ? 1 : 0);
  }
  // Hors du champ (ni dessiné ni dans l'ombre à la dernière image) et livré à lui-même : animé une image sur
  // OFFSCREEN_STEP avec le temps cumulé (allure, broutage, sabots au sol identiques ; on ne le voit pas).
  // Jamais monté, guidé, en séance ou mené en main : sa pose sert au cavalier, à l'activité ou à la longe.
  // « Vu » se décide une fois par image : en avance rapide (⏩ : 3 pas de simulation par image, Game.frame),
  // un cheval dessiné à l'image d'avant reste vu pour tous les pas de l'image (sinon les pas 2 et 3 le
  // croyaient caché et ses membres tournaient trois fois moins vite que son corps : sabots qui patinent).
  if (anim.frame !== horseView.frame) {
    anim.frame = horseView.frame;
    anim.seenNow = false;
  }
  if (anim.seen) {
    anim.seenNow = true;
    anim.seen = false;
  }
  if (!anim.seenNow && !e.ridden && !e.scripted && !e.herdCtrl && !e.posing && !e.data.following && !e.data.leashed) {
    anim.skipDt += dt;
    if (++anim.skipN < OFFSCREEN_STEP) return;
    dt = anim.skipDt;
  } else {
    dt += anim.skipDt; // (le temps mis de côté n'est jamais perdu : l'animation reçoit tout le temps simulé)
  }
  anim.skipDt = 0;
  anim.skipN = 0;
  const v = e.speed / Math.max(0.3, e.scale);
  const moving = e.speed > 0.05 && !e.sleeping;
  const t = e.time;
  e.grazeSeed ??= Math.random() * 10;
  // (pas pendant une séance qui le guide, spectacle, toilettage… : il attend tête haute)
  // (ni quand il regarde le joueur depuis son box : AnimalEntity.attending)
  const grazing = e.state === 'idle' && !e.sleeping && !e.herdCtrl && !e.ridden && !e.scripted && !e.attending && Math.sin(t * 0.3 + e.grazeSeed) > 0.2;
  // (tête à l'herbe ou à la mangeoire : lissé, elle descend et remonte en douceur)
  e.grazeAmt = (e.grazeAmt ?? 0) + ((grazing ? 1 : 0) - (e.grazeAmt ?? 0)) * Math.min(1, dt * 1.2);
  e.feedAmt = (e.feedAmt ?? 0) + ((e.state === 'eat' ? 1 : 0) - (e.feedAmt ?? 0)) * Math.min(1, dt * 1.5);
  const heading = e.heading;
  const turn = e.lastHeading === undefined ? 0 : Math.atan2(Math.sin(heading - e.lastHeading), Math.cos(heading - e.lastHeading)) / Math.max(1e-3, dt);
  e.lastHeading = heading;
  const w = e.data.weight ?? 50;
  const st = e.realSt ??= {};
  st.v = v;
  st.moving = moving;
  st.sleeping = e.sleeping;
  st.sad = sad;
  st.graze = e.grazeAmt;
  st.feeder = e.feedAmt;
  st.turn = turn;
  st.fat = 1 + (w - 50) / 50 * 0.18;
  const o = md.anim.update(dt, st, e.realOut ??= {});
  e.gait = o.gait;
  e.phase = o.phase;
  e.headDown = Math.max(e.grazeAmt, e.feedAmt);
}

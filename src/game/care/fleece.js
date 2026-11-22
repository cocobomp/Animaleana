// La tonte en 3D (src/ui/minigames/shear3d.js) : la toison du vrai mouton se coupe là où passe la tondeuse. Chaque
// sommet de sa peau reçoit une valeur « coupé » (0 : laine pleine, 0,5 : tondu une fois, une laine courte et égale,
// 1 : rasé, la peau rose), et le dessin de la laine (sheepCoat.js) en tient compte, sommet par sommet : la toison
// rentre (cible de forme « shorn » et volume de la laine), la laine courte s'éclaircit, la peau rasée rosit. Les
// deux flancs se tondent ensemble (le mouton est symétrique : on n'en voit qu'un). Les flocons de laine coupée
// tombent dans la paille et y restent, en tas.
//
// Rien n'est changé pour les moutons du jeu : le double de la scène reçoit sa propre géométrie (qui partage les
// données du gabarit) et une copie de la recette de son dessin (une autre clé de programme), libérées à la fin.

import * as THREE from 'three';
import { lumpy } from './barnProps.js';
import { noiseTexture } from './textures.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

const COMMON_V = /* glsl */ `
attribute float careCut;
varying float vCareCut;
`;
const BEGIN_V = /* glsl */ `
float careCutS = min(1.0, careCut * 2.0);
vCareCut = careCut;
`;
// (après la cible de forme du jeu : le reste du chemin vers la toison tondue, pour ce sommet)
const MORPH_V = /* glsl */ `
#ifdef USE_MORPHTARGETS
transformed += getMorph( gl_VertexID, 0, 0 ).xyz * careCutS * ( 1.0 - morphTargetInfluences[ 0 ] );
#endif
`;

// La toison pas encore tondue : le bout des mèches, terni par le temps (gris-jaune). Tondue : la laine du dessous,
// propre et crème, avec les bandes des passages de la tondeuse (du ventre vers le dos, côte à côte le long du corps,
// effacées de loin). Rasée : la peau rose.
const CUT_F = /* glsl */ `
  {
    float cutL = smoothstep(0.05, 0.45, vCareCut) * wool;
    float blow = 0.5 + 0.5 * sin(vSRest.z * 84.0 + sin(vSRest.y * 18.0) * 1.2);
    vec3 under = vec3(1.05, 1.03, 0.98) * (1.0 - 0.06 * blow * sFade(vSRest));
    col *= mix(vec3(0.92, 0.89, 0.81), under, cutL);
    col = mix(col, vec3(0.88, 0.67, 0.63), smoothstep(0.6, 1.0, vCareCut) * wool * 0.8);
  }
`;

/**
 * La coupe sommet par sommet dans le dessin de la laine : des remplacements de texte dans la recette du jeu
 * (sheepCoat.js). Chaque texte visé doit s'y trouver : sinon la coupe ne se verrait pas, sans erreur. Les textes
 * absents sont comptés (patchVertex / patchFragment les renvoient) et signalés une fois dans la console ; un test
 * vérifie qu'il n'en manque aucun (tests/farm3dStage.test.js).
 */
const VERTEX_PATCH = [
  ['#include <common>', `#include <common>\n${COMMON_V}`],
  ['#include <begin_vertex>', `#include <begin_vertex>\n${BEGIN_V}`],
  ['#include <morphtarget_vertex>', `#include <morphtarget_vertex>\n${MORPH_V}`],
  ['float pm = sheepPuffW;', 'float pm = sheepPuffW * (1.0 - careCutS);'],
  ['0.0) * (1.0 - sState.x);', '0.0) * (1.0 - max(sState.x, careCutS));'],
];
const FRAGMENT_PATCH = [
  ['#include <common>', '#include <common>\nvarying float vCareCut;'],
  ['float sh = sState.x * wool;', 'float sh = max(sState.x, min(1.0, vCareCut * 2.0)) * wool;'],
  ['vec3 col = mix(skin, wc, wool);', `vec3 col = mix(skin, wc, wool);\n${CUT_F}`],
  ['(1.0 - sState.x) * sFade(vSRest)', '(1.0 - max(sState.x, min(1.0, vCareCut * 2.0))) * sFade(vSRest)'],
];
let warned = false;
function apply(sh, key, list) {
  const missing = [];
  for (const [a, b] of list) {
    if (!sh[key].includes(a)) missing.push(a);
    else sh[key] = sh[key].replace(a, b);
  }
  if (missing.length && !warned) {
    warned = true;
    console.warn('[care3d] tonte : textes introuvables dans le dessin de la laine', missing);
  }
  return missing;
}
/** Ajoute la coupe au vertex shader ; renvoie les textes visés introuvables (aucun : tout va bien). */
export const patchVertex = (sh) => apply(sh, 'vertexShader', VERTEX_PATCH);
/** Ajoute la coupe et les couleurs de la laine tondue au fragment shader ; renvoie les textes introuvables. */
export const patchFragment = (sh) => apply(sh, 'fragmentShader', FRAGMENT_PATCH);

/**
 * Prépare la toison du double pour la tonte. Renvoie { verts (indices des sommets de laine), pos (positions monde,
 * pose figée), set(i, k) (valeur coupée du sommet i), flush() (envoie les changements), dispose() } ou null (pas un
 * mouton réaliste).
 */
export function cuttableFleece(sc) {
  const md = sc.model;
  const mesh = md.mesh;
  if (!md.realSheep || !mesh?.material?.onBeforeCompile) return null;
  const src = mesh.geometry;
  // Une géométrie à lui, qui partage les données du gabarit (et la version réduite n'est plus utilisée ici).
  const geo = new THREE.BufferGeometry();
  geo.index = src.index;
  for (const k of Object.keys(src.attributes)) geo.setAttribute(k, src.attributes[k]);
  geo.morphAttributes = src.morphAttributes;
  geo.morphTargetsRelative = src.morphTargetsRelative;
  for (const gr of src.groups) geo.addGroup(gr.start, gr.count, gr.materialIndex);
  geo.boundingBox = src.boundingBox;
  geo.boundingSphere = src.boundingSphere;
  const n = src.attributes.position.count;
  const cut = new Float32Array(n);
  const attr = new THREE.BufferAttribute(cut, 1);
  attr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('careCut', attr);
  mesh.geometry = geo;
  // La recette du dessin : celle du jeu, plus la coupe (une autre clé : un autre programme, rien que pour la scène).
  const mat = mesh.material;
  const origMat = mat.onBeforeCompile;
  const origKey = mat.customProgramCacheKey;
  mat.onBeforeCompile = (sh, r) => {
    origMat.call(mat, sh, r);
    patchVertex(sh);
    patchFragment(sh);
  };
  mat.customProgramCacheKey = () => `${origKey.call(mat)}-care-cut`;
  mat.needsUpdate = true;
  const depth = mesh.customDepthMaterial;
  const origDepth = depth?.onBeforeCompile;
  const origDepthKey = depth?.customProgramCacheKey;
  if (depth && origDepth) {
    depth.onBeforeCompile = (sh, r) => {
      origDepth.call(depth, sh, r);
      patchVertex(sh);
    };
    depth.customProgramCacheKey = () => `${origDepthKey.call(depth)}-care-cut`;
    depth.needsUpdate = true;
  }
  // Les sommets de laine, et leur place dans la pose figée (la copie du lancer de rayon : sc.proxy, sommets de la peau
  // dans l'ordre de sa liste). Laine : le masque de la robe (sheepMask.x), mais aussi tout sommet que la toison
  // déplace — le volume (sheepPuffW, lissé sur 9 cm au-delà du masque) ou la cible « shorn » : les sommets de la
  // lisière (masque entre 0 et 0,3, au garrot et à la base de l'encolure) gardaient leur volume pendant que la laine
  // autour rentrait, et dressaient une voile blanche au garrot.
  const mask = src.attributes.sheepMask;
  const puffW = src.attributes.sheepPuffW;
  const shorn = src.morphAttributes?.position?.[0] ?? null;
  const moved = (v) => (mask ? mask.getX(v) > 0.01 : true) || (puffW && puffW.getX(v) > 0.002)
    || (shorn && Math.abs(shorn.getX(v)) + Math.abs(shorn.getY(v)) + Math.abs(shorn.getZ(v)) > 1e-4);
  sc.proxy.bake();
  const part = sc.proxy.parts?.find((p) => p.m === mesh) ?? sc.proxy.parts?.[0];
  const where = new Map();
  if (part) {
    let base = 0;
    for (const p of sc.proxy.parts) {
      if (p === part) break;
      base += p.list.length;
    }
    part.list.forEach((v, k) => where.set(v, base + k));
  }
  const verts = [];
  const pos = [];
  for (let v = 0; v < n; v++) {
    if (!moved(v)) continue;
    const k = where.get(v);
    if (k === undefined) continue;
    verts.push(v);
    pos.push(V(sc.proxy.pos[k * 3], sc.proxy.pos[k * 3 + 1], sc.proxy.pos[k * 3 + 2]));
  }
  let dirty = false;
  return {
    verts,
    pos,
    /** Valeur coupée du sommet v (indice du maillage) : 0 pleine, 0,5 tondue, 1 rasée. */
    set(v, k) {
      if (cut[v] !== k) {
        cut[v] = k;
        dirty = true;
      }
    },
    get: (v) => cut[v],
    flush() {
      if (!dirty) return;
      attr.needsUpdate = true;
      dirty = false;
    },
    dispose() {
      // (le double est libéré avec la scène ; on rend quand même sa géométrie et sa recette à leur état)
      mesh.geometry = src;
      geo.deleteAttribute('careCut');
      geo.dispose();
      mat.onBeforeCompile = origMat;
      mat.customProgramCacheKey = origKey;
      if (depth && origDepth) {
        depth.onBeforeCompile = origDepth;
        depth.customProgramCacheKey = origDepthKey;
      }
    },
  };
}

/**
 * Les flocons de laine coupée : ils tombent du point coupé et restent dans la paille (un tas qui grossit). Un seul
 * maillage répété. color : la couleur de la laine ; size : la taille d'un flocon (m).
 */
export function fleeceFall(scene, { color = 0xeee6d6, size = 0.05, max = 260, floor = 0.05 } = {}) {
  const geo = lumpy(new THREE.IcosahedronGeometry(1, 2), 0.18, 3, 4);
  const tex = noiseTexture('#f4efe4', 0.28, 12, 64);
  const mat = new THREE.MeshStandardMaterial({ color, map: tex, roughness: 1 });
  const inst = new THREE.InstancedMesh(geo, mat, max);
  inst.count = 0;
  inst.castShadow = true;
  inst.receiveShadow = true;
  inst.frustumCulled = false;
  scene.add(inst);
  const items = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = V();
  const write = (i, it) => {
    e.set(it.rx, it.ry, it.rz);
    q.setFromEuler(e);
    s.set(it.size * 1.25, it.size * 0.55, it.size);
    m4.compose(it.p, q, s);
    inst.setMatrixAt(i, m4);
  };
  return {
    mesh: inst,
    get count() { return items.length; },
    /** Un flocon qui se détache en p (monde), poussé le long de n (normale du poil). */
    drop(p, n) {
      if (items.length >= max) {
        // (le tas est plein : on recycle le plus ancien flocon tombé)
        items.shift();
      }
      const it = {
        p: p.clone().addScaledVector(n, size * 0.6),
        v: n.clone().multiplyScalar(0.25 + Math.random() * 0.2).add(V((Math.random() - 0.5) * 0.2, 0.15, (Math.random() - 0.5) * 0.2)),
        size: size * (0.7 + Math.random() * 0.6),
        rx: Math.random() * 3, ry: Math.random() * 3, rz: Math.random() * 3,
        spin: (Math.random() - 0.5) * 5,
        down: false,
      };
      items.push(it);
    },
    update(dt) {
      let moved = false;
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (!it.down) {
          it.v.y -= 3.2 * dt; // (la laine tombe doucement : l'air la freine)
          it.v.multiplyScalar(1 - dt * 1.5);
          it.p.addScaledVector(it.v, dt);
          it.rx += it.spin * dt;
          if (it.p.y <= floor + it.size * 0.3) {
            it.p.y = floor + it.size * 0.3;
            it.down = true;
            it.rx = (Math.random() - 0.5) * 0.4;
            it.rz = (Math.random() - 0.5) * 0.4;
          }
          moved = true;
        }
        write(i, it);
      }
      if (inst.count !== items.length || moved) {
        inst.count = items.length;
        inst.instanceMatrix.needsUpdate = true;
      }
    },
    dispose() {
      scene.remove(inst);
      inst.dispose();
      geo.dispose();
      mat.dispose();
      tex.dispose();
    },
  };
}

/** La tondeuse électrique (origine : le peigne contre la laine ; +y : vers l'extérieur ; le manche part vers +x). */
export function clipperModel(keep) {
  const g = new THREE.Group();
  const body = keep(new THREE.MeshStandardMaterial({ color: 0x2f6fb8, roughness: 0.35, metalness: 0.1 }));
  const grey = keep(new THREE.MeshStandardMaterial({ color: 0xc9ced3, roughness: 0.25, metalness: 0.85 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x2a2d31, roughness: 0.5, metalness: 0.4 }));
  const sh = (m) => {
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  // tête : le peigne (dents) et le couteau
  const head = new THREE.Group();
  head.position.set(0.01, 0.015, 0);
  g.add(head);
  const comb = sh(new THREE.Mesh(keep(new THREE.BoxGeometry(0.035, 0.006, 0.075)), grey));
  head.add(comb);
  const teeth = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(0.03, 0.004, 0.004)), grey, 11);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 11; i++) teeth.setMatrixAt(i, m4.makeTranslation(-0.025, -0.002, -0.034 + i * 0.0068));
  keep({ dispose: () => teeth.dispose() });
  head.add(teeth);
  const cutter = sh(new THREE.Mesh(keep(new THREE.BoxGeometry(0.03, 0.006, 0.06)), dark));
  cutter.position.set(0.005, 0.006, 0);
  head.add(cutter);
  // le corps (manche), légèrement relevé, et le câble
  const handle = sh(new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.024, 0.13, 6, 14)), body));
  handle.rotation.z = Math.PI / 2 + 0.35;
  handle.position.set(0.09, 0.045, 0);
  g.add(handle);
  const grip = sh(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 14)), dark));
  grip.rotation.z = Math.PI / 2 + 0.35;
  grip.position.set(0.04, 0.025, 0);
  g.add(grip);
  const cable = sh(new THREE.Mesh(keep(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([V(0.16, 0.07, 0), V(0.26, 0.09, 0.03), V(0.38, 0.05, 0.08), V(0.5, 0.12, 0.1)]), 20, 0.006, 6)), dark));
  g.add(cable);
  return g;
}

// Modèle 3D des chats, sculpté par le code (même principe que animalModel.js : tronc et tête en
// champs de distance fondus, pattes et queue en « lofts » qui se plient avec des os).
// Les races changent la silhouette (trapue, fine, grande), la tête (ronde, plate, en triangle…),
// les oreilles (grandes, petites, pliées, à pinceaux), le poil (ras, mi-long, long, frisé, nu)
// et la robe (catTextures.js). Le chat regarde vers +Z. Les pivots et les os servent aux poses
// (catAnim.js) : marcher la queue levée, s'asseoir, faire sa toilette, s'étirer, dormir en boule.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loft, strands, noise3 } from './shapes.js';
import { roundCone, sdfMesh, rayHit, sdfNormal } from './sdf.js';
import { hairTexture } from '../textures.js';
import { catCoatTextures, catEyeTexture, catSkinColors } from '../catTextures.js';
import { gfx } from '../gfx.js';
import { SPECIES } from '../../sim/species.js';
import { catTraits } from '../../sim/catBreeds.js';
import { addShells, cachedGeo, buildShapes, cylUv, contactShadowTexture, neckAt, mat, add } from './animalModel.js';

// ------------------------------------------------------------------ proportions par race

// Silhouette : longueur (L), épaisseur (R), pattes, tête, cou ; belly = ventre plus bas (Sphynx).
const BUILD = {
  semi: { L: 1, R: 1, leg: 1, head: 1, neck: 1, belly: 0 },
  cobby: { L: 0.9, R: 1.08, leg: 0.9, head: 1.1, neck: 0.75, belly: 0.04 },
  foreign: { L: 1.08, R: 0.8, leg: 1.06, head: 0.92, neck: 1.25, belly: -0.05 },
  large: { L: 1.1, R: 1.0, leg: 1.03, head: 1.0, neck: 1.0, belly: 0.02 },
  muscular: { L: 1.0, R: 1.02, leg: 1.0, head: 0.97, neck: 1.0, belly: 0 },
};

// Têtes (unités : rayon de la tête hr). cr = crâne, ch = joues [x, y, z, rx, ry, rz],
// pd = coussinets des moustaches [x, y, rx, ry, rz], br = chanfrein (rayons), eye = yeux.
const HEADS = {
  balanced: { cr: [1.0, 0.9, 0.92], ch: [0.46, -0.24, 0.1, 0.48, 0.42, 0.46], pd: [0.19, -0.32, 0.25, 0.21, 0.24], br: [0.38, 0.19], noseY: -0.08,
    eye: { o: [0, 0.15, 0.25], d: [0.62, 0.12, 0.78], r: 0.25, fwd: 0.6 } },
  round: { cr: [1.08, 0.93, 0.9], ch: [0.52, -0.26, 0.04, 0.6, 0.52, 0.5], pd: [0.22, -0.33, 0.29, 0.24, 0.25], br: [0.4, 0.21], noseY: -0.07,
    eye: { o: [0, 0.14, 0.25], d: [0.6, 0.1, 0.8], r: 0.27, fwd: 0.62 } },
  flat: { cr: [1.1, 0.96, 0.86], ch: [0.52, -0.22, 0.02, 0.58, 0.52, 0.48], pd: [0.2, -0.28, 0.26, 0.22, 0.2], br: [0.36, 0.2], noseY: 0.0, short: true,
    eye: { o: [0, 0.12, 0.2], d: [0.52, 0.06, 0.86], r: 0.265, fwd: 0.72 } },
  wedge: { cr: [0.9, 0.84, 1.0], ch: [0.36, -0.2, 0.2, 0.36, 0.36, 0.55], pd: [0.15, -0.3, 0.2, 0.18, 0.24], br: [0.36, 0.17], noseY: -0.1, wedge: true,
    eye: { o: [0, 0.16, 0.28], d: [0.68, 0.16, 0.72], r: 0.23, fwd: 0.55 } },
  modwedge: { cr: [0.96, 0.88, 0.95], ch: [0.42, -0.22, 0.12, 0.44, 0.4, 0.48], pd: [0.18, -0.32, 0.24, 0.2, 0.25], br: [0.37, 0.18], noseY: -0.09,
    eye: { o: [0, 0.15, 0.26], d: [0.64, 0.13, 0.76], r: 0.25, fwd: 0.58 } },
  square: { cr: [0.98, 0.9, 0.95], ch: [0.44, -0.18, 0.1, 0.46, 0.42, 0.48], pd: [0.22, -0.32, 0.28, 0.25, 0.26], br: [0.4, 0.22], noseY: -0.08, square: true,
    eye: { o: [0, 0.16, 0.26], d: [0.63, 0.13, 0.77], r: 0.245, fwd: 0.58 } },
  pixie: { cr: [1.02, 0.95, 0.9], ch: [0.46, -0.26, 0.06, 0.5, 0.44, 0.44], pd: [0.18, -0.33, 0.27, 0.22, 0.24], br: [0.32, 0.18], noseY: -0.08,
    eye: { o: [0, 0.14, 0.24], d: [0.6, 0.1, 0.8], r: 0.3, fwd: 0.62 } },
};

// Oreilles : point d'attache (o, d), longueur et largeur (en hr), inclinaisons, pinceaux.
const EARS = {
  cat: { o: [0.42, 0.3, -0.28], d: [0.45, 1, 0.05], len: 0.95, w: 0.56, rx: -0.12, rz: 0.3, yaw: 0.3 },
  cat_big: { o: [0.5, 0.2, -0.24], d: [0.7, 1, 0.05], len: 1.32, w: 0.74, rx: -0.12, rz: 0.5, yaw: 0.35 },
  cat_small: { o: [0.52, 0.25, -0.28], d: [0.75, 1, 0], len: 0.6, w: 0.5, rx: -0.15, rz: 0.55, yaw: 0.35 },
  cat_fold: { o: [0.4, 0.35, -0.16], d: [0.4, 1, 0.12], len: 0.6, w: 0.55, rx: 0, rz: 0.42, yaw: 0.15, fold: true },
  cat_lynx: { o: [0.4, 0.3, -0.28], d: [0.4, 1, 0.05], len: 1.2, w: 0.62, rx: -0.1, rz: 0.22, yaw: 0.25, lynx: true },
};

// Longueur de la fourrure en couches (ordinateur) et volume du poil long.
const HAIR = {
  short: { fur: 0.004, fuzz: 0 },
  plush: { fur: 0.0055, fuzz: 0.15 },
  semi: { fur: 0.0065, fuzz: 0.6 },
  long: { fur: 0.008, fuzz: 1 },
  curly: { fur: 0.003, fuzz: 0 },
  hairless: { fur: 0, fuzz: 0 },
};

// Pattes [z/T, y/T, largeur/r, profondeur/r] : épaule ou hanche en haut, coussinet en bas.
const FRONT = [[0, 0.18, 1.25, 1.9], [0, 0, 1.3, 1.8], [0, -0.22, 1.1, 1.3], [0.01, -0.45, 0.88, 0.98], [0, -0.7, 0.78, 0.84], [0.02, -0.83, 0.8, 0.86], [0.05, -0.9, 0.86, 0.9]];
const HIND = [[0, 0.2, 1.4, 2.5], [0, 0, 1.55, 2.5], [0.06, -0.22, 1.45, 1.9], [-0.04, -0.42, 1.0, 1.25], [-0.13, -0.58, 0.78, 0.9], [-0.1, -0.78, 0.74, 0.8], [-0.06, -0.9, 0.8, 0.86]];
// Articulations (en T) : coude et poignet devant, grasset et jarret derrière.
const JOINTS = { front: [-0.28, -0.8], hind: [-0.26, -0.58] };

const TAIL_BONES = 7;
const Z = new THREE.Vector3(0, 0, 1);

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const sphere = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

/** Retrouve la race à partir de la robe (le look ne garde pas l'id de la race). */
function catBreedOf(look) {
  return SPECIES.cat.breeds.find((b) => b.colors.some((c) => c.coat === look.coat && c.secondary === look.secondary
    && (!look.colorName || c.name?.fr === look.colorName.fr))) ?? null;
}

/** Formes de la tête selon la race (crâne rond, joues, coussinets des moustaches, menton). */
function headPrims(H, F, fuzz) {
  const [cx, cy, cz, crx, cry, crz] = H.ch;
  const [px, py, prx, pry, prz] = H.pd;
  const list = [
    ['e', 0, [0, 0.1, -0.15], H.cr], // crâne
    ['e', 1, [cx, cy, cz], [crx, cry, crz], 0.35], // joues
    ['e', 1, [px, py, 0.42 + F], [prx, pry, prz], 0.18], // coussinets des moustaches
    ['e', 0, [0, -0.5, 0.3 + F * 0.8], [0.22, 0.16, 0.24], 0.16], // menton
    ['c', 0, [0, 0.18, 0.18], [0, H.noseY, 0.5 + F], H.br[0], H.br[1], 1, 0.24], // chanfrein
    ['e', 1, [0.34, 0.33, 0.28], [0.24, 0.14, 0.22], 0.15], // arcades
  ];
  if (H.wedge) list.push(['e', 0, [0, -0.15, 0.3 + F * 0.5], [0.42, 0.36, 0.5 + F * 0.4], 0.25]);
  if (H.square) list.push(['e', 0, [0, -0.3, 0.38 + F], [0.42, 0.28, 0.26], 0.15], ['e', 0, [0, -0.52, 0.28 + F * 0.8], [0.26, 0.2, 0.26], 0.15]);
  // Poil long : fourrure autour du visage (joues, collerette qui remonte).
  if (fuzz > 0.3) list.push(['e', 1, [0.5, -0.4, -0.3], [0.34 * fuzz, 0.42, 0.4], 0.3]);
  return list;
}

/** Tronc du chat : cage thoracique, ventre, hanches, épaules, cuisses (+ collerette et culottes). */
function torsoPrims(B, fuzz) {
  const b = B.belly;
  const list = [
    ['e', 0, [0, -0.05, 0.14], [0.8, 1.0, 0.3]], // cage thoracique (poitrine profonde)
    ['e', 0, [0, 0.08 - b * 2, -0.1], [0.72, 0.72 + b * 2, 0.28], 0.3], // ventre (plus haut : taille fine)
    ['e', 0, [0, 0.16, -0.31], [0.8, 0.82, 0.2], 0.3], // reins et hanches : le dos remonte un peu
    ['e', 0, [0, -0.06, 0.34], [0.62, 0.84, 0.15], 0.3], // poitrail
    ['e', 1, [0.36, 0.25, 0.27], [0.28, 0.6, 0.13], 0.3], // omoplates
    ['e', 1, [0.44, -0.08, -0.33], [0.44, 0.86, 0.17], 0.3], // cuisses
  ];
  if (fuzz > 0) {
    list.push(
      ['e', 0, [0, -0.12, 0.42], [0.58 + 0.2 * fuzz, 0.66 + 0.18 * fuzz, 0.12 + 0.03 * fuzz], 0.4], // collerette (sous le menton)
      ['e', 0, [0, -0.55, -0.04], [0.52, 0.24 + 0.1 * fuzz, 0.3], 0.35], // frange du ventre
      ['e', 1, [0.44, -0.4, -0.37], [0.28, 0.36 + 0.08 * fuzz, 0.14], 0.3], // culottes
    );
  }
  return list;
}

/** Oreille : nappe triangulaire bombée derrière, creusée devant. curve(t) → [dy, dz]. */
function earGeo(len, w, profile, { curve = null, back = 0.3, front = 0.08, high = true } = {}) {
  const n = profile.length;
  return loft(profile.map((pw, i) => {
    const t = i / (n - 1);
    const c = curve ? curve(t) : [t * len, 0];
    return { p: [0, c[0], c[1]], rx: Math.max(0.0008, pw * w), ry: Math.max(0.0006, pw * w * back), ryb: Math.max(0.0004, pw * w * front) };
  }), { radial: high ? 12 : 8, sub: 2 });
}

/** Points d'une oreille pliée vers l'avant (Scottish fold). */
function foldCurve(len) {
  const N = 24;
  const pts = [[0, 0]];
  let y = 0;
  let z = 0;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const a = t < 0.35 ? 0 : ((t - 0.35) / 0.65) * 2.2;
    y += (len / N) * Math.cos(a);
    z += (len / N) * Math.sin(a);
    pts.push([y, z]);
  }
  return (t) => pts[Math.round(t * N)];
}

// ------------------------------------------------------------------ construction

export function buildCatModel(look) {
  const high = gfx.quality === 'high';
  const breed = catBreedOf(look);
  const tr = catTraits(look, breed);
  const B = BUILD[tr.build] ?? BUILD.semi;
  const Hd = HEADS[tr.head] ?? HEADS.balanced;
  const hair = HAIR[tr.hair] ?? HAIR.short;
  const fuzz = hair.fuzz;
  const hairless = tr.hair === 'hairless';
  const fluff = look.fluff ?? 1;
  // Proportions de l'espèce (les chats enregistrés avant gardent d'anciennes valeurs dans leur look).
  const P = SPECIES.cat.model;
  const L = P.bodyLen * B.L;
  // Rs : le squelette (place des pattes, hauteur du dos) ; R : la surface, poil compris (le poil long
  // gonfle la silhouette et descend sous le ventre, sans allonger les pattes).
  const Rs = P.bodyR * B.R;
  const R = Rs * (1 + (fluff - 1) * 0.6);
  const legLen = P.legLen * (look.legs ?? 1) * B.leg;
  const legR = P.legR * B.R * (hairless ? 0.92 : 1.08);
  const y0 = legLen + Rs * 0.85;
  const nl = P.neckLen * B.neck * (1 + fuzz * 0.45); // poil long : la tête dépasse bien de la collerette
  const na = P.neckAngle;
  const hr = P.headR * B.head * (1 + (fluff - 1) * 0.35);
  const F = Hd.short ? 0.04 : 0.1 + 0.34 * (look.snout ?? 0.35);
  const furLen = high ? hair.fur : 0;
  const skin = catSkinColors(look, tr);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const parts = { root, body, legs: [], y0, hairSway: { value: 0 } };

  // --- Ombre de contact douce sous le chat.
  const shadowGeo = new THREE.PlaneGeometry(1, 1);
  shadowGeo.rotateX(-Math.PI / 2);
  const contact = new THREE.Mesh(shadowGeo, new THREE.MeshBasicMaterial({
    map: contactShadowTexture(), transparent: true, depthWrite: false, opacity: high ? 0.55 : 0.7, toneMapped: false,
  }));
  contact.scale.set(R * 3.4, 1, L * 1.5);
  contact.position.y = 0.012;
  contact.renderOrder = -1;
  root.add(contact);

  // --- Tronc et base du cou, fondus en une seule surface.
  const nk = 1 + fuzz * 0.2;
  const ns = [[-0.6, 0.62, 0.68, 0, 0.74], [0, 0.56, 0.6, 0, 0.66], [1, 0.5, 0.52, 0, 0.56], [1.2, 0.44, 0.46, 0, 0.48]]
    .map(([t, w, dc, zo, dt]) => [t, w * nk, dc * nk, zo, dt * nk]);
  const neckBase = new THREE.Vector3(0, y0 + Rs * 0.28 + (R - Rs) * 0.4, L * 0.36);
  const neckDir = new THREE.Vector3(0, Math.cos(na), Math.sin(na));
  const crestDir = new THREE.Vector3(0, Math.sin(na), -Math.cos(na));
  const neckChain = [];
  const chainT = ns.map((s) => s[0]).filter((t) => t < 0.48);
  chainT.push(0.5);
  for (let i = 0; i < chainT.length - 1; i++) {
    const pt = (t) => {
      const q = neckAt(ns, t);
      const r = ((q.dc + q.dt) / 2) * R;
      const c = neckBase.clone().addScaledVector(neckDir, t * nl).addScaledVector(crestDir, ((q.dc - q.dt) / 2) * R);
      return { c, r, sx: q.w / ((q.dc + q.dt) / 2) };
    };
    const a = pt(chainT[i]);
    const b = pt(chainT[i + 1]);
    const f = roundCone(a.c.toArray(), b.c.toArray(), a.r, b.r, (a.sx + b.sx) / 2);
    neckChain.push([f, 0.3 * R, a.c.toArray(), [a.r, a.r, a.r]], [() => 1e9, 0, b.c.toArray(), [b.r, b.r, b.r]]);
  }
  const { sdf: torsoSdf, bounds: tb } = buildShapes(torsoPrims(B, fuzz), [R, R, L], [R, R, L], [0, y0, 0], neckChain);
  const pad = R * 0.3;
  const torsoBounds = [[tb[0][0] - pad, tb[0][1] - pad, tb[0][2] - pad], [tb[1][0] + pad, tb[1][1] + pad, tb[1][2] + pad]];
  // Poil long : mèches qui gonflent la silhouette et pendent sous le ventre ; frisé : petites bosses ;
  // peau nue : plis sur le cou et les épaules.
  const furDisp = fuzz > 0.3
    ? (x, y, z, nx, ny) => {
      const a = noise3(x * 48 + 1, y * 48, z * 48);
      const b = noise3(x * 110, y * 110 + 3, z * 110);
      return ((a - 0.45) * 0.07 + (b - 0.45) * 0.04) * R * fuzz + Math.max(0, -ny) * (b - 0.25) * R * 0.08 * fuzz;
    }
    : tr.hair === 'curly' ? (x, y, z) => (noise3(x * 150, y * 150, z * 150) - 0.5) * R * 0.035
      : hairless ? (x, y, z) => Math.sin(z * 260 + noise3(x * 30, y * 30, z * 30) * 4) * R * 0.007 * smooth(L * 0.12, L * 0.42, z) : null;
  const shapeKey = ['cat', L, R, y0, nl, na, hr, F, tr.build, tr.head, tr.hair, gfx.quality].join('|');
  const torsoGeo = cachedGeo(`torso|${shapeKey}`, () => sdfMesh(torsoSdf, torsoBounds, L / (high ? 44 : 28), {
    uv: cylUv(y0, torsoBounds[0][2], torsoBounds[1][2]), displace: furDisp,
  }));
  const backTop = (z) => rayHit(torsoSdf, [0, y0, z], [0, 1, 0], R * 3).y;

  // --- Tête : formes fondues, puis repères du visage (yeux, nez) pour peindre la robe.
  const neck = new THREE.Group();
  neck.position.copy(neckBase);
  neck.rotation.order = 'YXZ'; // tourner la tête sur le côté autour de la verticale, même cou baissé
  neck.rotation.x = na;
  body.add(neck);
  const head = new THREE.Group();
  head.position.set(0, nl, 0);
  head.rotation.x = 0.1 - na;
  neck.add(head);
  const { sdf: headSdf, bounds: hb } = buildShapes(headPrims(Hd, F, fuzz), [hr, hr, hr], [hr, hr, hr]);
  const hpad = hr * 0.3;
  const headBounds = [[hb[0][0] - hpad, hb[0][1] - hpad, hb[0][2] - hpad], [hb[1][0] + hpad, hb[1][1] + hpad, hb[1][2] + hpad]];
  const headUv = cylUv(0, headBounds[0][2], headBounds[1][2]);
  const headDisp = fuzz > 0.3 ? (x, y, z, nx, ny, nz) => (noise3(x * 140, y * 140, z * 140) - 0.45) * hr * 0.06 * fuzz * smooth(0.2, -0.6, nz) : null;
  const headGeo = cachedGeo(`head|${shapeKey}`, () => sdfMesh(headSdf, headBounds, hr / (high ? 7.5 : 5), { uv: headUv, displace: headDisp }));
  const H = (v) => v.map((x) => x * hr);
  const tip = rayHit(headSdf, H([0, Hd.noseY, 0]), [0, 0, 1], hr * 8);
  const E = Hd.eye;
  const eyeR = hr * E.r;
  const eyeHits = [1, -1].map((s) => {
    const hit = rayHit(headSdf, H(E.o), [s * E.d[0], E.d[1], E.d[2]], hr * 3);
    return { s, hit, n: sdfNormal(headSdf, hit, hr * 0.02) };
  });
  const marks = { eyes: eyeHits.map((e) => headUv(e.hit.x, e.hit.y, e.hit.z)), noseV: headUv(tip.x, tip.y, tip.z)[1] };

  // --- Matières.
  const tex = catCoatTextures(look, tr, marks);
  const rough = hairless ? 0.5 : 0.9;
  const coatMat = (map) => new THREE.MeshStandardMaterial({ map, roughness: rough, metalness: 0 });
  const M = {
    body: coatMat(tex.body),
    neck: coatMat(tex.neck),
    head: coatMat(tex.head),
    tail: coatMat(tex.tail),
    ear: coatMat(tex.ear),
    legs: [],
    inner: mat(hairless ? 0xd99a92 : tr.pattern === 'points' ? 0xc79a9a : 0xe3aaa6, { roughness: 0.7 }),
    nose: mat(skin.nose, { roughness: 0.42 }),
    pad: mat(skin.pad, { roughness: 0.6 }),
    rim: mat(0x161010, { roughness: 0.35 }),
    mouth: mat(0x3a2622, { roughness: 0.6 }),
  };
  tex.legs.forEach((t, i) => { M.legs[i] = i > 0 && t === tex.legs[i - 1] ? M.legs[i - 1] : coatMat(t); });

  const torsoMesh = add(body, torsoGeo, M.body);
  addShells(torsoMesh, furLen);

  // --- Pattes : un tube plié par trois os (épaule/hanche, coude/grasset, poignet/jarret).
  const legX = Rs * 0.45;
  const legTop = y0 - Rs * 0.3;
  const T = legTop;
  const corners = [[legX, L / 2 - Rs * 0.75, true], [-legX, L / 2 - Rs * 0.75, true], [legX, -L / 2 + Rs * 0.75, false], [-legX, -L / 2 + Rs * 0.75, false]];
  const skins = [];
  corners.forEach(([x, z, front], i) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, legTop, z);
    body.add(pivot);
    const pawMat = M.legs[i].userData.paw ?? (M.legs[i].userData.paw = M.legs[i].clone());
    pawMat.color.setScalar(high ? 0.84 : 0.94);
    const leg = buildCatLeg(pivot, { front, T, r: legR, mat: M.legs[i], pawMat, padMat: M.pad, high, fuzz, index: i, fur: furLen * 0.6 });
    skins.push(leg.skin);
    parts.legs.push({ pivot, knee: leg.knee, paw: leg.paw, toe: leg.toe, front, side: x > 0 ? 1 : -1 });
  });

  // --- Cou (partie mobile) et tête.
  const neckSecs = [];
  for (let t = 0.3; t <= ns[ns.length - 1][0] + 1e-6; t += 0.1) {
    const q = neckAt(ns, t);
    neckSecs.push({ p: [0, t * nl, q.zo * R], rx: q.w * R, ry: q.dc * R, ryb: q.dt * R });
  }
  const neckGeo = loft(neckSecs, {
    radial: high ? 20 : 12, sub: high ? 3 : 2, capStart: false,
    displace: fuzz > 0.3 ? (x, y, z) => (noise3(x * 60, y * 60 + 2, z * 60) - 0.45) * R * 0.07 * fuzz : null,
  });
  const neckMesh = add(neck, neckGeo, M.neck);
  addShells(neckMesh, furLen);
  const headMesh = add(head, headGeo, M.head);
  if (fuzz > 0.3) addShells(headMesh, furLen * 0.5); // poil ras : la tête reste nette

  // Yeux : globe brillant (iris, pupille, reflets), bord sombre, paupière qui cligne.
  const eyeMats = [tr.eye, tr.eye2].map((c) => new THREE.MeshPhysicalMaterial({
    map: catEyeTexture(c, tr.head === 'flat' || tr.head === 'pixie' ? 0.42 : 0.34), roughness: 0.06, clearcoat: high ? 1 : 0, clearcoatRoughness: 0.03,
  }));
  const sq = tr.eyes === 'almond' ? 0.74 : tr.eyes === 'oval' ? 0.86 : 1;
  const slant = tr.eyes === 'almond' ? 0.32 : tr.eyes === 'oval' ? 0.14 : 0.04;
  const lids = [];
  const eyeGeo = sphere(eyeR, high ? 22 : 14, high ? 16 : 10);
  const rimGeo = new THREE.TorusGeometry(eyeR * 0.86, eyeR * 0.085, 6, high ? 26 : 18);
  const LID_OPEN = -0.95;
  const LID_SHUT = 1.0;
  const tmpM = new THREE.Matrix4();
  const tmpV = new THREE.Vector3();
  for (const { s, hit, n } of eyeHits) {
    const dir = n.clone().multiplyScalar(1 - E.fwd).add(new THREE.Vector3(0, 0, E.fwd)).normalize();
    const eye = new THREE.Group();
    eye.position.copy(hit).addScaledVector(n, -eyeR * 0.5);
    eye.quaternion.setFromUnitVectors(Z, dir);
    eye.rotateZ(s * slant); // coin extérieur relevé (yeux en amande)
    eye.scale.set(1, sq, 1);
    head.add(eye);
    add(eye, eyeGeo, eyeMats[s > 0 ? 0 : 1], null, null, null, false);
    add(eye, rimGeo, M.rim, [0, 0, eyeR * 0.5], null, null, false);
    // Paupière : calotte qui descend pour cligner ; ses UV reprennent la robe de la tête autour de l'œil.
    const lidGeo = new THREE.SphereGeometry(eyeR * 1.06, high ? 18 : 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);
    const lid = new THREE.Mesh(lidGeo, M.head);
    lid.rotation.x = LID_SHUT;
    eye.add(lid);
    eye.updateMatrix();
    lid.updateMatrix();
    tmpM.multiplyMatrices(eye.matrix, lid.matrix);
    const lp = lidGeo.attributes.position;
    const luv = lidGeo.attributes.uv;
    for (let k = 0; k < lp.count; k++) {
      tmpV.fromBufferAttribute(lp, k).applyMatrix4(tmpM);
      const [u, v] = headUv(tmpV.x, tmpV.y, tmpV.z);
      luv.setXY(k, u, v);
    }
    lid.rotation.x = LID_OPEN;
    lid.castShadow = false;
    lids.push(lid);
  }

  // Truffe : petit triangle arrondi ; philtrum et bouche en « ω ».
  const noseR = hr * (Hd.short ? 0.1 : 0.12);
  const noseGeo = sphere(noseR, 14, 10);
  const np = noseGeo.attributes.position;
  for (let k = 0; k < np.count; k++) {
    const y = np.getY(k);
    np.setXYZ(k, np.getX(k) * (1 + Math.min(0, y / noseR) * 0.55) * 1.15, y * 0.8, np.getZ(k) * 0.7);
  }
  noseGeo.computeVertexNormals();
  const noseN = sdfNormal(headSdf, tip, hr * 0.02);
  const nose = add(head, noseGeo, M.nose, tip.clone().addScaledVector(noseN, -noseR * 0.3).add(new THREE.Vector3(0, noseR * 0.15, 0)).toArray(), null, null, false);
  nose.quaternion.setFromUnitVectors(Z, noseN.clone().lerp(Z, 0.5).normalize());
  const onFace = (x, y, out = hr * 0.006) => {
    const p = rayHit(headSdf, [x, y, 0], [0, 0, 1], hr * 4);
    return p.addScaledVector(sdfNormal(headSdf, p, hr * 0.02), out);
  };
  const ny0 = tip.y - noseR * 0.75;
  const phil = onFace(0, ny0 - hr * 0.1);
  const mouthParts = [];
  const tube = (pts, r) => loft(pts.map((p) => ({ p: p.toArray(), rx: r, ry: r })), { radial: 5, sub: 3 });
  mouthParts.push(tube([onFace(0, ny0), phil], hr * 0.016));
  for (const s of [1, -1]) {
    mouthParts.push(tube([phil, onFace(s * hr * 0.1, ny0 - hr * 0.15), onFace(s * hr * 0.2, ny0 - hr * 0.13)], hr * 0.014));
  }
  add(head, mergeGeometries(mouthParts), M.mouth, null, null, null, false);
  mouthParts.forEach((g) => g.dispose());

  // Moustaches (et poils des sourcils) : fines lignes courbées.
  const wh = [];
  const wLen = hr * (hairless ? 0.5 : tr.hair === 'curly' ? 0.9 : 1.45);
  const wCount = hairless ? 2 : 4;
  for (const s of [1, -1]) {
    for (let k = 0; k < wCount; k++) {
      const o = rayHit(headSdf, [s * hr * 0.08, tip.y - hr * (0.16 + k * 0.05), tip.z - hr * 0.3], [s, -0.05, 0.35], hr * 2);
      const dir = new THREE.Vector3(s, -0.1 + k * 0.1, -0.3 + k * 0.08).normalize();
      const len = wLen * (1 - k * 0.08);
      let prev = o;
      for (let q = 1; q <= 4; q++) {
        const t = q / 4;
        const wave = tr.hair === 'curly' ? Math.sin(t * 9) * hr * 0.05 : 0;
        const p = o.clone().addScaledVector(dir, len * t).add(new THREE.Vector3(0, -len * 0.22 * t * t + wave, 0));
        wh.push(prev, p);
        prev = p;
      }
    }
    if (!hairless) {
      const brow = eyeHits.find((e) => e.s === s).hit;
      for (let k = 0; k < 2; k++) {
        const o = brow.clone().add(new THREE.Vector3(s * hr * (0.02 + k * 0.08), eyeR * 1.15, 0));
        const p = o.clone().add(new THREE.Vector3(s * hr * 0.16, hr * 0.26, hr * 0.08));
        wh.push(o, o.clone().lerp(p, 0.5).add(new THREE.Vector3(0, hr * 0.04, 0)), o.clone().lerp(p, 0.5).add(new THREE.Vector3(0, hr * 0.04, 0)), p);
      }
    }
  }
  const whiskers = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(wh),
    new THREE.LineBasicMaterial({ color: 0xf6f3ec, transparent: true, opacity: 0.75 }));
  head.add(whiskers);

  // --- Oreilles.
  parts.ears = [];
  const ES = EARS[tr.earType] ?? EARS.cat;
  const furnish = fuzz > 0.3 || ES.lynx;
  const tuftMat = furnish ? new THREE.MeshStandardMaterial({ color: 0xf1ece4, map: hairTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8 }) : null;
  const lynxMat = ES.lynx ? new THREE.MeshStandardMaterial({ color: look.secondary === look.coat ? 0x2a2422 : look.secondary, map: hairTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8 }) : null;
  const elen = hr * ES.len;
  const ew = hr * ES.w;
  const prof = [1, 0.98, 0.86, 0.64, 0.38, 0.14, 0.02];
  const curve = ES.fold ? foldCurve(elen) : null;
  const outerGeo = earGeo(elen, ew, prof, { curve, high });
  const innerGeo = ES.fold ? null : earGeo(elen * 0.8, ew * 0.66, prof, { back: 0.06, front: 0.03, high });
  for (const s of [1, -1]) {
    const ear = new THREE.Group();
    head.add(ear);
    const p = rayHit(headSdf, H([s * ES.o[0], ES.o[1], ES.o[2]]), [s * ES.d[0], ES.d[1], ES.d[2]], hr * 3);
    ear.position.copy(p).addScaledVector(sdfNormal(headSdf, p, hr * 0.02), -hr * 0.07);
    add(ear, outerGeo, M.ear);
    if (innerGeo) add(ear, innerGeo, M.inner, [0, elen * 0.06, ew * 0.1], null, null, false);
    if (furnish && !ES.fold) {
      // Touffes de poils clairs dans l'oreille.
      const list = [];
      for (let k = 0; k < 4; k++) {
        const x = (k / 3 - 0.5) * ew * 0.45;
        const o = new THREE.Vector3(x, elen * 0.06, ew * 0.12);
        list.push({ pts: [o, o.clone().add(new THREE.Vector3(-x * 0.2, elen * 0.2, ew * 0.08)), o.clone().add(new THREE.Vector3(-x * 0.5, elen * 0.38, ew * 0.14))], w0: ew * 0.22, w1: ew * 0.1, side: new THREE.Vector3(1, 0, 0) });
      }
      add(ear, strands(list), tuftMat, null, null, null, false);
    }
    if (ES.lynx) {
      // Pinceaux du lynx au bout de l'oreille (Maine coon, Norvégien).
      const o = new THREE.Vector3(0, elen * 0.92, 0);
      const list = [-1, 0, 1].map((k) => ({ pts: [o, o.clone().add(new THREE.Vector3(k * ew * 0.05, elen * 0.15, -ew * 0.02)), o.clone().add(new THREE.Vector3(k * ew * 0.08, elen * 0.32, -ew * 0.05))], w0: ew * 0.1, w1: ew * 0.03, side: new THREE.Vector3(1, 0, 0) }));
      add(ear, strands(list), lynxMat, null, null, null, false);
    }
    ear.rotation.set(ES.rx, s * ES.yaw, -s * ES.rz);
    ear.userData.rest = ear.rotation.clone();
    ear.userData.base = ear.rotation.clone();
    ear.userData.side = s;
    parts.ears.push(ear);
  }

  // --- Queue : un tube souple plié par sept os (levée en marchant, enroulée en dormant).
  const tail = new THREE.Group();
  const tailRoot = rayHit(torsoSdf, [0, y0 + R * 0.35, -L * 0.2], [0, 0, -1], L);
  tail.position.set(0, tailRoot.y, tailRoot.z + R * 0.08);
  body.add(tail);
  const tailSkin = buildCatTail(tail, { L, R, fuzz, stub: tr.stubTail, mat: M.tail, high, fur: furLen * 1.1, hairless });
  skins.push(tailSkin.skin);

  // Un seul squelette pour les pattes et la queue (une seule texture d'os par chat).
  const skeleton = new THREE.Skeleton(skins.flatMap((s) => s.bones), skins.flatMap((s) => s.inverses));
  for (const s of skins) {
    s.mesh.bind(skeleton, new THREE.Matrix4());
    addShells(s.mesh, s.fur);
  }
  parts.skeleton = skeleton;

  Object.assign(parts, {
    neck, head, tail, snoutTip: tip.toArray(), headTilt: 0.1 - na,
    headHeight: neckBase.y + nl * Math.cos(na),
    saddleY: backTop(-L * 0.05),
    legTop,
    cat: {
      traits: tr,
      tailBones: tailSkin.bones,
      neckRest: na,
      lids, lidOpen: LID_OPEN, lidShut: LID_SHUT,
      dims: { L, R, Rs, y0, legLen, legTop, hr, hipZ: -L / 2 + Rs * 0.75, shoulderZ: L / 2 - Rs * 0.75 },
    },
  });
  catRestPose(parts);
  return parts;
}

/** Pose de repos (modèle immobile : caisse de transport, aperçu) : queue posée qui remonte au bout. */
export function catRestPose(parts) {
  const bones = parts.cat?.tailBones;
  if (!bones) return;
  bones.forEach((b, i) => {
    b.rotation.set(i === 0 ? -0.85 : 0.2, 0, 0);
  });
}

// ------------------------------------------------------------------ pattes

function buildCatLeg(pivot, o) {
  const { front, T, r, high, fuzz } = o;
  const path = front ? FRONT : HIND;
  // Poil long : avant-bras fournis, « culottes » sur les cuisses.
  const puff = (i) => 1 + fuzz * (front ? 0.25 : 0.45) * Math.max(0, 1 - i / 3);
  const g = loft(path.map(([z, y, w, d], i) => ({ p: [0, y * T, z * T], rx: w * r * puff(i), ry: d * r * puff(i) })), {
    radial: high ? 14 : 9, sub: high ? 4 : 2,
    displace: fuzz > 0.3 ? (x, y, z, u, v) => (noise3(x * 120, y * 120, z * 120) - 0.45) * r * 0.5 * fuzz * Math.max(0, 1 - v * 1.6) : null,
  });
  const [j1, j2] = front ? JOINTS.front : JOINTS.hind;
  const zAt = (y) => {
    // Position z du chemin à la hauteur y (pour placer les articulations dans la patte).
    for (let i = 0; i < path.length - 1; i++) {
      const a = path[i];
      const b = path[i + 1];
      if (y <= a[1] && y >= b[1]) return (a[0] + (b[0] - a[0]) * ((y - a[1]) / (b[1] - a[1]))) * T;
    }
    return path[path.length - 1][0] * T;
  };
  const p1 = [0, j1 * T, zAt(j1)];
  const p2 = [0, j2 * T, zAt(j2)];
  const pos = g.attributes.position;
  const n = pos.count;
  const si = new Uint16Array(n * 4);
  const sw = new Float32Array(n * 4);
  const band = T * 0.07;
  const b0 = o.index * 3;
  for (let i = 0; i < n; i++) {
    const y = pos.getY(i);
    const w1 = THREE.MathUtils.smoothstep(p1[1] - y, -band, band);
    const w2 = THREE.MathUtils.smoothstep(p2[1] - y, -band, band);
    si[i * 4] = b0;
    si[i * 4 + 1] = b0 + 1;
    si[i * 4 + 2] = b0 + 2;
    sw[i * 4] = 1 - w1;
    sw[i * 4 + 1] = w1 - w2;
    sw[i * 4 + 2] = w2;
  }
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  const hip = new THREE.Bone();
  const knee = new THREE.Bone();
  const paw = new THREE.Bone();
  knee.position.set(...p1);
  paw.position.set(p2[0] - p1[0], p2[1] - p1[1], p2[2] - p1[2]);
  hip.add(knee);
  knee.add(paw);
  const legMesh = new THREE.SkinnedMesh(g, o.mat);
  legMesh.castShadow = true;
  legMesh.receiveShadow = true;
  legMesh.add(hip);
  pivot.add(legMesh);

  // Patte : coussinet arrondi et quatre doigts (dans le repère de l'os du bas), coussinets roses dessous.
  const end = path[path.length - 1];
  const pr = r * 1.1;
  const pz = end[0] * T + (front ? 0.04 : 0.06) * T;
  // « Orteils » : la patte tourne autour du talon pour rester à plat (assis, couché).
  const A = [0, -T + pr * 0.75, pz - pr * 0.55];
  const toe = new THREE.Group();
  toe.position.set(A[0] - p2[0], A[1] - p2[1], A[2] - p2[2]);
  paw.add(toe);
  const at = (x, y, z) => [x - A[0], y - A[1], z - A[2]];
  const pieces = [];
  const ball = sphere(pr, 14, 10);
  ball.scale(1.0, 0.7, 1.25);
  ball.translate(...at(0, -T + pr * 0.66, pz));
  pieces.push(ball);
  for (const k of [-1.5, -0.5, 0.5, 1.5]) {
    const toe = sphere(pr * 0.3, 8, 6);
    toe.scale(1, 0.75, 1.05);
    toe.translate(...at(k * pr * 0.31, -T + pr * 0.28, pz + pr * 0.84 - Math.abs(k) * pr * 0.13));
    pieces.push(toe);
  }
  const pawGeo = mergeGeometries(pieces);
  pieces.forEach((p) => p.dispose());
  // Le bout de la patte prend la couleur du bas de la texture (gants blancs, pattes foncées des colourpoints).
  const uv = pawGeo.attributes.uv;
  for (let k = 0; k < uv.count; k++) uv.setY(k, 0.97);
  // Un peu plus sombre que la patte : sans fourrure en couches, la patte paraîtrait trop claire.
  add(toe, pawGeo, o.pawMat, null, null, null, true);
  const beans = [];
  const main = sphere(pr * 0.42, 10, 6);
  main.scale(1.25, 0.25, 1);
  main.translate(...at(0, -T + pr * 0.06, pz - pr * 0.05));
  beans.push(main);
  for (const k of [-1.5, -0.5, 0.5, 1.5]) {
    const bean = sphere(pr * 0.15, 8, 4);
    bean.scale(1, 0.4, 1.2);
    bean.translate(...at(k * pr * 0.3, -T + pr * 0.08, pz + pr * 0.62 - Math.abs(k) * pr * 0.12));
    beans.push(bean);
  }
  const beanGeo = mergeGeometries(beans);
  beans.forEach((b) => b.dispose());
  add(toe, beanGeo, o.padMat, null, null, null, false);
  return {
    knee, paw, toe,
    skin: { mesh: legMesh, bones: [hip, knee, paw], inverses: [new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(-p1[0], -p1[1], -p1[2]), new THREE.Matrix4().makeTranslation(-p2[0], -p2[1], -p2[2])], fur: o.fur },
  };
}

// ------------------------------------------------------------------ queue

function buildCatTail(tail, o) {
  const { L, R, fuzz, high, stub, hairless } = o;
  const len = stub ? L * 0.2 : L * 0.82;
  const n = TAIL_BONES;
  const seg = len / (n - 1);
  // Section : fine et effilée (poil ras, peau nue), en panache (poil long), pompon (bobtail).
  const radius = (t) => {
    if (stub) return R * (0.26 + 0.12 * Math.sin(Math.PI * Math.min(1, t * 1.1)));
    const base = R * (0.17 - 0.06 * t) * (hairless ? 0.75 : 1);
    return base + R * 0.2 * fuzz * Math.sin(Math.PI * Math.min(1, 0.15 + t * 0.9));
  };
  const secs = [];
  const steps = 16;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    secs.push({ p: [0, 0, -t * len], rx: radius(t), ry: radius(t) });
  }
  const g = loft(secs, {
    radial: high ? 14 : 9, sub: 1, round: [0, 0.9], side: [1, 0, 0],
    displace: fuzz > 0.3 || stub ? (x, y, z, u, v) => (noise3(x * 90, y * 90, z * 90) - 0.45) * R * 0.12 * (stub ? 1 : fuzz) * Math.min(1, v * 4) : null,
  });
  const pos = g.attributes.position;
  const si = new Uint16Array(pos.count * 4);
  const sw = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const f = Math.min(n - 1 - 1e-4, Math.max(0, -pos.getZ(i) / seg));
    const i0 = Math.floor(f);
    si[i * 4] = i0;
    si[i * 4 + 1] = i0 + 1;
    sw[i * 4] = 1 - (f - i0);
    sw[i * 4 + 1] = f - i0;
  }
  // Les index d'os sont locaux à la queue : décalés après les 12 os des pattes.
  for (let i = 0; i < si.length; i++) si[i] += 12;
  g.setAttribute('skinIndex', new THREE.BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
  const bones = [];
  for (let i = 0; i < n; i++) {
    const b = new THREE.Bone();
    if (i > 0) {
      b.position.set(0, 0, -seg);
      bones[i - 1].add(b);
    }
    bones.push(b);
  }
  const mesh = new THREE.SkinnedMesh(g, o.mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.add(bones[0]);
  tail.add(mesh);
  return { bones, skin: { mesh, bones, inverses: bones.map((b, i) => new THREE.Matrix4().makeTranslation(0, 0, i * seg)), fur: o.fur } };
}

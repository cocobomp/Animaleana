// Modèle 3D du personnage du joueur (regarde vers +Z, environ 1,6 m).
// Corps en « lofts » (formes lisses), tête sculptée (champ de distance), mains, chaussures,
// visage posé sur la peau (avatarFace.js : yeux avec iris, paupières qui clignent et cils,
// sourcils, bouche souriante, joues roses), cheveux en volume (avatarHair.js),
// vêtements avec plis légers (relief peint), tee-shirt à manches courtes.
// Squelette : hanches → genoux → chevilles (jambes) ; torse (pivot aux hanches) → épaules → coudes
// → mains (bras), tête → yeux (globe qui regarde, paupière).
// Les proportions sont un peu enfantines (grosse tête, membres ronds).
// Animation : animateAvatarWalk (marche, course, caisse portée), puis updateAvatarLife (avatarRig.js :
// clignement, regard, attente vivante, gestes de soin) ; animateAvatarRide (à cheval).

import * as THREE from 'three';
import { loft } from './shapes.js';
import { sdfMesh } from './sdf.js';
import { headSdf } from './avatarHead.js';
import { buildFace } from './avatarFace.js';
import { gfx } from '../gfx.js';
import { hairGeometry, tintHair, hatScale, HAT_SHAPE, prepareHair, BRAID_END } from './avatarHair.js';
import { initLife, carryHold, animateAvatarRide } from './avatarRig.js';

// Le reste de l'animation (vie, gestes, cheval) est aussi disponible depuis ce module.
export { updateAvatarLife, startAvatarGesture, stopAvatarGesture, avatarBusy, animateAvatarRide, armIK } from './avatarRig.js';
export { careGestureFor, CARE_GESTURE_TIME } from './avatarMotion.js';

const mat = (color, roughness = 0.8, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

/** Épaisseur de chaque coiffure sur les côtés de la tête (m, repère de la tête). */
const HAIR_BULK = { short: 0.03, long: 0.035, ponytail: 0.016, curly: 0.075, bald: 0.006, bun: 0.016, braid: 0.016 };

function add(parent, geo, material, pos, rot, scale, shadow = true) {
  const m = new THREE.Mesh(geo, material);
  if (pos) m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  if (scale) m.scale.set(...scale);
  m.castShadow = shadow;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

const cache = new Map();
function shared(key, make) {
  if (!cache.has(key)) {
    const g = make();
    g.userData.shared = true;
    cache.set(key, g);
  }
  return cache.get(key);
}

/** Relief de tissu (plis et trame), partagé. */
let _cloth = null;
function clothBump() {
  if (_cloth) return _cloth;
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 2) {
    ctx.fillStyle = y % 4 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, 128, 1);
  }
  // Plis doux.
  for (let i = 0; i < 9; i++) {
    const g = ctx.createLinearGradient(0, i * 14, 0, i * 14 + 14);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.12)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, i * 14 + Math.sin(i) * 3, 128, 14);
  }
  _cloth = new THREE.CanvasTexture(c);
  _cloth.wrapS = THREE.RepeatWrapping;
  _cloth.wrapT = THREE.RepeatWrapping;
  _cloth.repeat.set(3, 3);
  _cloth.userData.shared = true;
  return _cloth;
}

/**
 * Faces tournées vers l'extérieur. Un loft décrit de bas en haut (bassin, buste) sortait « à
 * l'envers » : on voyait l'intérieur du dos à travers le devant, invisible tant que rien n'était
 * dedans, mais les cheveux longs dans le dos apparaissaient à travers le tee-shirt.
 */
function outward(geo) {
  const p = geo.attributes.position.array;
  const idx = geo.index.array;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  const n = p.length / 3;
  for (let i = 0; i < p.length; i += 3) {
    cx += p[i];
    cy += p[i + 1];
    cz += p[i + 2];
  }
  cx /= n;
  cy /= n;
  cz /= n;
  let vol = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3;
    const b = idx[t + 1] * 3;
    const c = idx[t + 2] * 3;
    const ax = p[a] - cx; const ay = p[a + 1] - cy; const az = p[a + 2] - cz;
    const bx = p[b] - cx; const by = p[b + 1] - cy; const bz = p[b + 2] - cz;
    const qx = p[c] - cx; const qy = p[c + 1] - cy; const qz = p[c + 2] - cz;
    vol += ax * (by * qz - bz * qy) + ay * (bz * qx - bx * qz) + az * (bx * qy - by * qx);
  }
  if (vol >= 0) return geo;
  for (let t = 0; t < idx.length; t += 3) {
    const s = idx[t + 1];
    idx[t + 1] = idx[t + 2];
    idx[t + 2] = s;
  }
  geo.index.needsUpdate = true;
  const nr = geo.attributes.normal;
  if (nr) {
    for (let i = 0; i < nr.array.length; i++) nr.array[i] = -nr.array[i];
    nr.needsUpdate = true;
  }
  return geo;
}

/** Tube vertical (membre) : sections [y, rayon x, rayon z, décalage z]. round = bouts arrondis. */
const limbGeo = (secs, radial, round = null) => outward(loft(secs.map(([y, rx, rz, oz = 0]) => ({ p: [0, y, oz], rx, ry: rz })), { radial, sub: 3, side: [1, 0, 0], round }));

// La tête (champ de distance) est dans avatarHead.js : le worker des coiffures s'en sert aussi.

/** Hauteur de la hanche, du genou (sous la hanche), de l'épaule et du coude (sous l'épaule). */
const HIP_Y = 0.82;
const KNEE = 0.4;
const ANKLE = 0.36; // genou → cheville
const SHOULDER_Y = 1.33;
const ELBOW = 0.27;

/**
 * Construit le personnage. look : { skin, hair, hairStyle, top, bottom, shoes, eyes?, hat }.
 * Renvoie { root, legs, knees, ankles, arms, elbows, hands, head, torso, chest, eyeBalls, lids,
 * hairTail, life } ; seed (facultatif) rend ses petits mouvements reproductibles.
 */
export function buildAvatar(look, seed = Math.random() * 1e9) {
  const high = gfx.quality === 'high';
  const R = high ? 18 : 12;
  const root = new THREE.Group();
  const bump = high ? clothBump() : null;
  const cloth = (c) => mat(c, 0.85, bump ? { bumpMap: bump, bumpScale: 0.6 } : {});
  const skin = mat(look.skin, 0.55);
  const top = cloth(look.top);
  const bottom = cloth(look.bottom);
  const shoes = mat(look.shoes, 0.45);
  const sole = mat(0xe8e2d8, 0.7);

  // --- Jambes (pivot à la hanche, genou et cheville articulés)
  const legs = [];
  const knees = [];
  const ankles = [];
  for (const s of [1, -1]) {
    const hip = new THREE.Group();
    hip.position.set(s * 0.095, HIP_Y, 0);
    root.add(hip);
    const thigh = shared(`thigh${R}`, () => limbGeo([[0.06, 0.082, 0.082], [0, 0.085, 0.088], [-0.18, 0.072, 0.077], [-0.36, 0.058, 0.062, 0.004], [-KNEE, 0.056, 0.06, 0.004]], R, [0, 0.9]));
    add(hip, thigh, bottom);
    const knee = new THREE.Group();
    knee.position.set(0, -KNEE, 0);
    hip.add(knee);
    const shin = shared(`shin${R}`, () => limbGeo([[0, 0.056, 0.06, 0.004], [-0.05, 0.06, 0.064], [-0.2, 0.053, 0.056, -0.004], [-0.32, 0.043, 0.046], [-0.36, 0.045, 0.047]], R, [0.9, 0]));
    add(knee, shin, bottom);
    // Cheville : le pied peut rester à plat quand on s'accroupit, talons bas à cheval.
    const ankle = new THREE.Group();
    ankle.position.set(0, -ANKLE, 0);
    knee.add(ankle);
    // Chaussure : bout arrondi, semelle claire.
    const shoe = shared(`shoe${R}`, () => loft([[-0.07, 0.042, 0.036], [-0.03, 0.052, 0.052], [0.04, 0.054, 0.046], [0.1, 0.048, 0.036], [0.135, 0.032, 0.026]].map(([z, w, h]) => ({ p: [0, 0, z], rx: w, ry: h, ryb: 0.012 })), { radial: R, sub: 3, round: [0.4, 0.6] }));
    add(ankle, shoe, shoes, [0, -0.775 + KNEE + ANKLE, 0.02]);
    // Semelle qui suit le contour de la chaussure (une planche droite dépassait au talon, comme un ski).
    const soleGeo = shared(`sole${R}`, () => loft([[-0.084, 0.02], [-0.078, 0.036], [-0.068, 0.045], [-0.03, 0.055], [0.04, 0.057], [0.1, 0.051], [0.135, 0.037], [0.151, 0.022], [0.159, 0.008]].map(([z, w]) => ({ p: [0, 0, z], rx: w, ry: 0.0095 })), { radial: R, sub: 2, round: [0.4, 0.4] }));
    add(ankle, soleGeo, sole, [0, -0.796 + KNEE + ANKLE, 0.02]);
    legs.push(hip);
    knees.push(knee);
    ankles.push(ankle);
  }

  // --- Torse (bassin + buste, avec épaules). Le pivot est aux hanches : quand le buste se penche
  // (course, travail), les bras et la tête suivent. Les formes restent décrites en hauteur absolue.
  const torso = new THREE.Group();
  torso.position.y = HIP_Y;
  root.add(torso);
  const body = new THREE.Group();
  body.position.y = -HIP_Y;
  torso.add(body);
  // Bassin : le bas est arrondi entre les cuisses, et le devant ne bombe plus devant le haut des
  // cuisses (coupé net et plus profond, il dessinait une sorte de culotte par-dessus le pantalon).
  const pelvis = shared(`pelvis${R}`, () => limbGeo([[0.74, 0.115, 0.08, -0.008], [0.8, 0.162, 0.098, -0.01], [0.9, 0.16, 0.103, -0.002], [0.96, 0.15, 0.1]], R + 4, [0.5, 0]));
  add(body, pelvis, bottom);
  const chest = shared(`chest${R}`, () => limbGeo([[0.9, 0.158, 0.105], [1.02, 0.15, 0.1], [1.15, 0.162, 0.108, 0.005], [1.27, 0.19, 0.108], [1.34, 0.215, 0.1], [1.385, 0.17, 0.085], [1.42, 0.085, 0.065], [1.44, 0.06, 0.055]], R + 4));
  add(body, chest, top);
  // Ourlet du tee-shirt et col.
  // (le tore est couché par la rotation : pour l'aplatir dans la profondeur du corps, c'est son axe Y local qu'on réduit)
  add(body, new THREE.TorusGeometry(0.15, 0.008, 6, R + 4), top, [0, 0.925, 0.002], [Math.PI / 2, 0, 0], [1, 0.64, 1]);
  add(body, new THREE.TorusGeometry(0.058, 0.014, 6, R), top, [0, 1.43, 0.005], [Math.PI / 2 - 0.15, 0, 0]);

  // --- Bras (pivot à l'épaule, coude articulé, manches courtes)
  const arms = [];
  const elbows = [];
  const hands = [];
  for (const s of [1, -1]) {
    const shoulder = new THREE.Group();
    shoulder.position.set(s * 0.19, SHOULDER_Y - 0.03 - HIP_Y, 0);
    shoulder.rotation.z = s * 0.08;
    torso.add(shoulder);
    // Haut du bras nu (la manche courte le couvre jusqu'à mi-hauteur).
    const upper = shared(`upperArm${R}`, () => limbGeo([[0.015, 0.05, 0.05], [-0.01, 0.056, 0.057], [-0.14, 0.048, 0.051], [-ELBOW, 0.041, 0.043]], R - 2, [0, 0.9]));
    add(shoulder, upper, skin);
    // Manche courte un peu évasée. Le haut est un dôme qui rentre dans l'épaule du buste : la manche
    // fait corps avec le tee-shirt (avant, son bord plat dépassait sous l'épaule comme une épaulette
    // posée à côté, et le bras restait bleu jusqu'au coude, comme une seconde manche détachée).
    const sleeve = shared(`sleeve${R}`, () => limbGeo([[0.05, 0.036, 0.038], [0.035, 0.054, 0.056], [0.005, 0.064, 0.065], [-0.05, 0.066, 0.067], [-0.105, 0.069, 0.07], [-0.12, 0.07, 0.071]], R - 2, [0.6, 0.25]));
    add(shoulder, sleeve, top);
    const elbow = new THREE.Group();
    elbow.position.set(0, -ELBOW, 0);
    shoulder.add(elbow);
    const fore = shared(`foreArm${R}`, () => limbGeo([[0, 0.041, 0.043], [-0.04, 0.042, 0.043], [-0.18, 0.035, 0.037], [-0.23, 0.034, 0.035]], R - 2, [0.9, 0]));
    add(elbow, fore, skin);
    // Main : paume, doigts serrés, pouce.
    const hand = new THREE.Group();
    hand.position.set(0, -0.26, 0.005);
    elbow.add(hand);
    add(hand, new THREE.SphereGeometry(0.038, 12, 10), skin, [0, 0, 0], null, [0.64, 1.05, 1], false);
    add(hand, new THREE.CapsuleGeometry(0.021, 0.03, 4, 8), skin, [0, -0.046, 0.004], null, [0.95, 1, 1.2], false);
    add(hand, new THREE.CapsuleGeometry(0.011, 0.025, 4, 6), skin, [-s * 0.012, -0.012, 0.03], [0.5, 0, s * 0.3], null, false);
    arms.push(shoulder);
    elbows.push(elbow);
    hands.push(hand);
  }

  // --- Tête (un peu grosse : proportions d'enfant)
  const head = new THREE.Group();
  head.position.set(0, 1.5 - HIP_Y, 0);
  head.scale.setScalar(1.1);
  torso.add(head);
  add(head, new THREE.CylinderGeometry(0.048, 0.056, 0.12, R), skin, [0, -0.07, 0]);
  const headGeo = shared(`head${high}`, () => sdfMesh(headSdf, [[-0.16, -0.12, -0.16], [0.16, 0.24, 0.17]], high ? 0.008 : 0.013));
  add(head, headGeo, skin, [0, 0.0, 0]);
  // Visage (avatarFace.js) : yeux, sourcils, bouche souriante et joues, posés sur la peau.
  const { eyeBalls, lids } = buildFace(head, look, high);

  // --- Cheveux : une vraie masse qui suit le crâne (avatarHair.js), mèches et reflets doux.
  const style = look.hairStyle ?? 'short';
  const hairShapes = hairGeometry(style, !!look.hat, high, headSdf);
  // Les autres coiffures se préparent dans un worker (une seule fois par qualité).
  prepareHair(high);
  const buzz = style === 'bald';
  const hairHex = buzz ? new THREE.Color(look.hair).lerp(new THREE.Color(look.skin), 0.42).getHex() : look.hair;
  const hairMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: buzz ? 0.85 : 0.52 });
  add(head, tintHair(hairShapes.main, hairHex, { buzz }), hairMat);
  let hairTail = null;
  if (hairShapes.tie) {
    const [tx, ty, tz] = hairShapes.tie;
    // Élastique (chouchou) de la couleur du haut, posé à plat sur la tête ; pour la tresse, il
    // l'entoure (axe le long de la tresse, qui descend dans le dos).
    const tieMat = mat(look.top, 0.7);
    const ring = add(head, shared('hairTie', () => new THREE.TorusGeometry(0.02, 0.0095, 6, 14)), tieMat, [tx, ty, tz], null, null, false);
    const axis = style === 'braid' ? new THREE.Vector3(0, -1, -0.18) : new THREE.Vector3(tx, ty - 0.075, tz + 0.005);
    ring.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis.normalize());
    if (hairShapes.tail) {
      // Queue de cheval / tresse : sur un pivot, elle se balance quand on bouge.
      hairTail = new THREE.Group();
      hairTail.position.set(tx, ty, tz);
      head.add(hairTail);
      add(hairTail, tintHair(hairShapes.tail, look.hair, { center: [0, -0.12, -0.06] }), hairMat);
      if (style === 'braid') add(hairTail, shared('braidTie', () => new THREE.TorusGeometry(0.0115, 0.005, 5, 10)), tieMat, [0, BRAID_END, -0.03], [Math.PI / 2, 0, 0], null, false);
    }
  }
  if (look.hat) {
    const capMat = mat(look.top, 0.6);
    const hs = hatScale(style);
    const [cx, cy, cz] = HAT_SHAPE.c;
    add(head, new THREE.SphereGeometry(HAT_SHAPE.r, R + 6, 10, 0, Math.PI * 2, 0, Math.PI * HAT_SHAPE.open), capMat, [cx, cy, cz], [HAT_SHAPE.tilt, 0, 0], [hs, hs, hs]);
    // Visière presque à plat (pas penchée vers le bas) et sans ombre portée : vu de la caméra du jeu,
    // au-dessus du personnage, elle cachait le haut des yeux et les mettait dans l'ombre à midi.
    add(head, new THREE.CylinderGeometry(0.1, 0.1, 0.012, 20, 1, false, -Math.PI / 2, Math.PI), capMat, [0, cy + (0.135 - cy) * hs, cz + (0.105 - cz) * hs], [0.02, 0, 0], [hs, 1, 1.15 * hs], false);
    add(head, new THREE.SphereGeometry(0.012, 8, 6), capMat, [0, cy + (0.237 - cy) * hs, cz]);
  }

  // Volume de la coiffure autour de la tête (et du chapeau) : les gestes (se gratter la tête,
  // s'étirer) placent les mains autour, sans entrer dedans.
  const hairBulk = look.hat ? Math.max(HAIR_BULK[style] ?? 0.03, HAT_SHAPE.r * hatScale(style) - 0.12) : HAIR_BULK[style] ?? 0.03;
  const hat = look.hat ? { r: HAT_SHAPE.r * hatScale(style), c: HAT_SHAPE.c } : null;
  const a = { root, legs, knees, ankles, arms, elbows, hands, head, torso, chest: body, eyeBalls, lids, hairTail, carry: null, hairStyle: style, hairBulk, hat };
  initLife(a, seed);
  return a;
}

/**
 * Cycle de marche / course articulé. phase avance avec la distance parcourue ; speed en m/s.
 * Marche : petits pas, bras ballants. Course : foulée plus ample mais pas en grand écart, genoux
 * hauts, coudes à 90°, buste penché en avant depuis les hanches, tête qui reste droite.
 * À l'arrêt : jambes droites (la vie à l'arrêt est ajoutée ensuite par updateAvatarLife).
 * Caisse portée (poseAvatar(a, 'carry', { size })) : pas plus courts et plus lourds, genoux un peu
 * pliés, buste en arrière, la caisse tenue devant à deux mains.
 */
export function animateAvatarWalk(a, phase, speed) {
  const carry = a.carry;
  const go = Math.min(1, speed / 1.2); // 0 à l'arrêt, 1 dès qu'on avance franchement
  const run = carry ? 0 : Math.min(1, Math.max(0, (speed - 3.6) / 2.6));
  const amp = Math.min(0.52, speed * 0.13) * (carry ? 0.78 : 1); // demi-amplitude des hanches (rad)
  for (let i = 0; i < 2; i++) {
    const ph = phase + i * Math.PI;
    const swing = Math.sin(ph); // > 0 : jambe en arrière
    // La hanche fléchit plus vers l'avant qu'elle ne s'étend vers l'arrière.
    a.legs[i].rotation.set(swing * amp - amp * 0.25 - (carry ? 0.05 * go : 0), 0, carry ? (i === 0 ? 0.03 : -0.03) : 0);
    // Le genou se plie pendant le retour de la jambe (haut en courant), presque droit à la pose du pied.
    const lift = Math.max(0, -Math.cos(ph));
    if (a.knees) a.knees[i].rotation.set(0.06 * go + run * 0.22 + lift * lift * (amp * 1.7 + run * 0.7) + (carry ? 0.1 * go + 0.04 : 0), 0, 0);
    if (a.ankles) a.ankles[i].rotation.set(0, 0, 0);
    // Bras opposé à la jambe ; coudes de plus en plus pliés quand on court.
    const arm = -swing * amp * 0.8;
    a.arms[i].rotation.set(arm, 0, (i === 0 ? 1 : -1) * (0.08 + run * 0.06));
    if (a.elbows) a.elbows[i].rotation.set(-(0.2 + run * 1.1) - Math.max(0, -arm) * 0.5, 0, 0);
    if (a.hands) a.hands[i].rotation.set(0, 0, 0);
  }
  if (carry) {
    // Charge devant soi : buste en arrière pour l'équilibre, roulis d'un pied sur l'autre.
    a.torso.rotation.set(-0.11, Math.sin(phase) * 0.02 * go, Math.sin(phase) * 0.045 * go);
    a.head.rotation.set(0.1, 0, -Math.sin(phase) * 0.03 * go);
    a.root.position.y = Math.abs(Math.sin(phase)) * 0.034 * go - 0.012;
    carryHold(a, carry.size, carry.pos);
  } else {
    // Buste penché depuis les hanches quand on court, léger roulis des épaules ; la tête compense.
    a.torso.rotation.set(0.03 * go + run * 0.26, Math.sin(phase) * 0.06 * amp, Math.sin(phase) * 0.015 * go);
    a.head.rotation.set(-(0.02 * go + run * 0.2), 0, 0);
    // Rebond : deux appuis par cycle, plus marqué en courant (petite phase de vol).
    a.root.position.y = Math.abs(Math.sin(phase)) * (0.025 + run * 0.045) * go;
  }
  if (a.chest) a.chest.scale.set(1, 1, 1);
}

// Réglages par défaut d'une pose à cheval sans cheval connu (aperçus) : pieds dans les étriers
// d'un cheval moyen (voir stirrupFor).
const RIDE_DEFAULT = { gait: 0, phase: 0, posting: true, seatY: 0, seatZ: 0, bob: 0, reinsY: 1.02, reinsZ: 0.36 };

/**
 * Pose fixe : 'ride' (assis à cheval ; opts = réglages de animateAvatarRide), 'carry' (porter une
 * caisse devant soi ; opts.size = { w, h, d }) ou debout ('stand', la pose par défaut).
 */
export function poseAvatar(a, pose, opts = {}) {
  if (pose === 'carry') {
    a.carry = { size: opts.size ?? { w: 0.45, h: 0.42, d: 0.6 }, pos: new THREE.Vector3() };
    animateAvatarWalk(a, 0, 0);
    return;
  }
  a.carry = null;
  if (pose === 'ride') {
    const { y, z } = a.root.position;
    animateAvatarRide(a, { ...RIDE_DEFAULT, seatY: y, seatZ: z, ...opts });
    return;
  }
  a.legs.forEach((l) => l.rotation.set(0, 0, 0));
  a.knees?.forEach((k) => k.rotation.set(0, 0, 0));
  a.ankles?.forEach((k) => k.rotation.set(0, 0, 0));
  a.arms.forEach((arm, i) => arm.rotation.set(0, 0, (i === 0 ? 1 : -1) * 0.08));
  a.elbows?.forEach((e) => e.rotation.set(-0.2, 0, 0));
  a.hands?.forEach((h) => h.rotation.set(0, 0, 0));
  a.torso.rotation.set(0, 0, 0);
  a.head.rotation.set(0, 0, 0);
}

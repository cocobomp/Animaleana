// Ce qu'on photographie pour les vignettes (moteur : src/game/thumbs.js) :
//   gear      : un objet de la sellerie, à la couleur et à la taille choisies — la selle sur son porte-selle,
//               la bombe sur son pied, la laisse sur un socle, et le reste porté par un cheval « mannequin »
//               (filet, licol, bonnet sur la tête ; tapis seul sur le dos ; couverture ; guêtres, cloches)
//               ou par un chien (collier, manteau) — robe du mannequin choisie pour que l'objet ressorte ;
//   animal    : un animal de l'animalerie tel qu'il sera (espèce, race, robe, sexe, âge) ;
//   structure : une construction du catalogue, posée sur un carré d'herbe ;
//   equipment : un équipement de la ferme (mangeoire, abreuvoir…) ;
//   vehicle   : la voiture, le 4x4 et son van, le van seul, le coffre de sellerie, le coffre de toit, le cheval sellé.
// Les mannequins (chevaux, chien) sont fabriqués une fois, gardés pendant qu'on fait des vignettes,
// puis libérés quand le moteur se repose longtemps (deux minutes sans vignette).

import * as THREE from 'three';
import { Thumbs, disposeDeep, thumbKey, samplePoints, aboveGround, scaleAbout } from './thumbs.js';
import { GEAR, COLORS, BLANKET_COLORS } from '../sim/gear.js';
import { withTexScale } from './gfx.js';
import { tackModel } from './models/tackModels.js';
import { buildGear, removeGear } from './gearModels.js';
import { buildAnimalModel, disposeModel } from './models/animalModel.js';
import { buildGltfAnimal } from './models/gltfAnimal.js';
import { resolveLook, growthScale, lifeStage } from '../sim/animal.js';
import { stageAgeDays } from '../sim/adoption.js';
import { STRUCTURES } from '../sim/construction.js';
import { SPECIES } from '../sim/species.js';
import { sheepFleece } from '../sim/sheepLook.js';
import { buildStructureModel } from './models/structures.js';
import { EQUIPMENT_MODELS } from './models/equipment.js';
import { car, towCar, horseTrailer, trunk } from './models/vehicles.js';

/** Le moteur de vignettes de la partie (créé à la première demande). null sans jeu. */
export function thumbsFor(game) {
  if (!game) return null;
  if (!game.thumbs) {
    game.thumbs = new Thumbs(game.renderer);
    registerThumbKinds(game.thumbs);
  }
  return game.thumbs;
}

/**
 * Élément de vignette pour une carte (emoji tant que l'image n'est pas prête, ou sans WebGL).
 * Raccourci pour les écrans : thumb(game, { kind: 'gear', id, color, size }, { w, h, emoji, cls }).
 */
export function thumb(game, spec, opts = {}) {
  const th = thumbsFor(game);
  if (th) return th.view(spec, opts);
  const el = document.createElement('span');
  el.className = `thumb ${opts.cls ?? ''} is-emoji`.trim();
  const ph = document.createElement('span');
  ph.className = 'thumb-ph';
  ph.textContent = opts.emoji ?? '';
  el.append(ph);
  return el;
}

// ---------------------------------------------------------------- outils

const V3 = THREE.Vector3;
const tmpBox = new THREE.Box3();

/** Boîte englobante des maillages visibles (sans les ombres de contact ni les étiquettes). */
function boxOf(root, { meshes = null } = {}) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const visit = (o) => {
    if (!o.isMesh || o.isSprite) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    if (o.material?.depthWrite === false && o.material?.transparent) return; // ombre de contact, vitres
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    tmpBox.copy(o.geometry.boundingBox).applyMatrix4(o.matrixWorld);
    box.union(tmpBox);
  };
  if (meshes) for (const m of meshes) m.traverse(visit);
  else root.traverse(visit);
  return box;
}

/** Agrandit une boîte autour de son centre (grow), avec une taille minimale (m) dans chaque direction. */
function grown(box, grow = 1.25, min = 0) {
  const c = box.getCenter(new V3());
  const s = box.getSize(new V3()).multiplyScalar(grow);
  s.set(Math.max(s.x, min), Math.max(s.y, min), Math.max(s.z, min));
  return new THREE.Box3().setFromCenterAndSize(c, s);
}

/** Chaque matériau de l'objet (pour garder ses shaders avant de le libérer). */
function eachMaterial(obj, fn) {
  if (!fn) return;
  obj.traverse((o) => {
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) if (!m.userData?.shared) fn(m);
  });
}

/** Petit nombre stable tiré d'une clé (graine de la robe : la même vignette à chaque fois). */
function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h) % 1e6;
}

// ---------------------------------------------------------------- supports de la sellerie

const shared = new Map();
function keep(key, make) {
  if (!shared.has(key)) {
    const v = make();
    v.userData.shared = true;
    shared.set(key, v);
  }
  return shared.get(key);
}
const wood = () => keep('wood', () => new THREE.MeshStandardMaterial({ color: 0xa8784a, roughness: 0.62 }));
const darkWood = () => keep('darkWood', () => new THREE.MeshStandardMaterial({ color: 0x6e4a2c, roughness: 0.7 }));
const linen = () => keep('linen', () => new THREE.MeshStandardMaterial({ color: 0xe9e0cf, roughness: 0.92 }));
const geo = (key, make) => keep(`g:${key}`, make);

function part(parent, geometry, material, pos, rot = null) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  parent.add(m);
  return m;
}

/** Porte-selle sur pied (chevalet en bois) : la barre du haut le long de z, son dessus à y = 0.78. */
function saddleStand() {
  const g = new THREE.Group();
  part(g, geo('rail', () => new THREE.CylinderGeometry(0.06, 0.06, 0.6, 18)), wood(), [0, 0.72, 0], [Math.PI / 2, 0, 0]);
  part(g, geo('railPlank', () => new THREE.BoxGeometry(0.1, 0.03, 0.6)), darkWood(), [0, 0.675, 0]);
  const leg = geo('leg', () => new THREE.BoxGeometry(0.035, 0.76, 0.035));
  for (const z of [-0.24, 0.24]) {
    for (const s of [-1, 1]) part(g, leg, darkWood(), [s * 0.15, 0.36, z], [0, 0, s * 0.36]);
    part(g, geo('cross', () => new THREE.BoxGeometry(0.3, 0.03, 0.03)), darkWood(), [0, 0.26, z]);
  }
  part(g, geo('stretch', () => new THREE.BoxGeometry(0.03, 0.03, 0.5)), darkWood(), [0, 0.26, 0]);
  return g;
}

/** Pied de bombe : socle rond, tige, et une tête stylisée en tissu sur laquelle la bombe est posée. */
function helmetStand() {
  const g = new THREE.Group();
  part(g, geo('hBase', () => new THREE.CylinderGeometry(0.1, 0.11, 0.03, 28)), darkWood(), [0, 0.015, 0]);
  part(g, geo('hPost', () => new THREE.CylinderGeometry(0.014, 0.014, 0.17, 12)), wood(), [0, 0.11, 0]);
  const head = part(g, geo('hHead', () => new THREE.SphereGeometry(0.1, 24, 16)), linen(), [0, 0.29, 0.005]);
  head.scale.set(0.92, 1.08, 1.02);
  part(g, geo('hNeck', () => new THREE.CylinderGeometry(0.045, 0.06, 0.08, 18)), linen(), [0, 0.2, 0]);
  return g;
}

/** Socle rond (laisse, objets posés). */
function plinth() {
  const g = new THREE.Group();
  part(g, geo('plinth', () => new THREE.CylinderGeometry(0.17, 0.18, 0.04, 32)), wood(), [0, 0.02, 0]);
  return g;
}

// ---------------------------------------------------------------- mannequins (gardés entre deux vignettes)

/**
 * Cheval mannequin de chaque taille, en robes unies (sans balzanes ni liste : les sabots restent foncés).
 * « light » (gris) porte les objets foncés (cuir, marine, rouge…), « dark » (bai, crins et bas des membres noirs)
 * les objets clairs (blanc, ciel, rose, argent…) : l'objet se détache toujours de la robe. « mid » (alezan,
 * isabelle pour le poney) : pour les filets, le cuir foncé ET le métal clair du mors s'y voient.
 */
const HORSE_FOR_SIZE = {
  pony: { light: { breed: 'connemara', color: 0 }, dark: { breed: 'connemara', color: 2 }, mid: { breed: 'connemara', color: 1 } },
  horse: { light: { breed: 'selle_francais', color: 2 }, dark: { breed: 'selle_francais', color: 0 }, mid: { breed: 'selle_francais', color: 1 } },
  draft: { light: { breed: 'trait_breton', color: 1 }, dark: { breed: 'trait_breton', color: 0 }, mid: { breed: 'trait_breton', color: 0 } },
};
/** Chien mannequin (labrador) : sable sous les objets foncés, chocolat sous les clairs. */
const DOG_FOR_TONE = { light: 0, dark: 1, mid: 4 };

/** Robe du mannequin qui fait ressortir un objet de cette couleur (hex) : 'dark' sous un objet clair, sinon 'light'. */
export function mannequinTone(hex) {
  const l = (((hex >> 16) & 255) * 0.2126 + ((hex >> 8) & 255) * 0.7152 + (hex & 255) * 0.0722) / 255;
  return l >= 0.5 ? 'dark' : 'light';
}

/** Pelages peints à moitié de leur taille de jeu pour les vignettes (voir gfx.withTexScale). */
const THUMB_TEX = 0.5;

const mannequins = new Map();

function mannequin(kind, tone = 'light') {
  const id = `${kind}:${tone}`;
  if (mannequins.has(id)) return mannequins.get(id);
  const pick = kind === 'dog'
    ? { species: 'dog', breed: 'labrador', color: DOG_FOR_TONE[tone] ?? 0 }
    : { species: 'horse', ...((HORSE_FOR_SIZE[kind] ?? HORSE_FOR_SIZE.horse)[tone] ?? HORSE_FOR_SIZE.horse.light) };
  // Robe unie et graine fixe : le même mannequin à chaque fois.
  const look = { ...resolveLook(pick.species, pick.breed, pick.color), pattern: 'solid', seed: 4242 };
  const model = withTexScale(THUMB_TEX, () => buildAnimalModel(pick.species, look, pick.breed));
  model.photoPose?.(); // (cheval réaliste : à l'arrêt, tête relevée, oreilles en avant)
  const holder = new THREE.Group();
  holder.add(model.root);
  holder.scale.setScalar(look.scale ?? 1);
  model.root.traverse((o) => {
    if (o.isMesh && o.parent === model.root && o.material?.depthWrite === false) o.visible = false; // (notre ombre suffit)
  });
  const m = { model, look, holder };
  mannequins.set(id, m);
  return m;
}

function releaseMannequins() {
  for (const m of mannequins.values()) {
    m.holder.removeFromParent();
    m.model.dispose?.();
    disposeModel(m.model.root);
  }
  mannequins.clear();
}

/** Hauteur relative de chaque taille : une vignette « poney » montre un poney (et son objet) plus petit. */
const SIZE_SCALE = { pony: 0.86, horse: 1, draft: 1.14 };

/**
 * Agrandissement du cadre d'un objet porté pour cette taille : le cadre est celui de la taille « cheval »,
 * l'objet d'un poney y paraît donc plus petit, celui d'un trait plus grand. whole (le cheval entier) :
 * jamais moins de 1 (le trait remplit déjà l'image).
 */
export function sizeFrame(size, { whole = false } = {}) {
  const k = SIZE_SCALE.horse / (SIZE_SCALE[size] ?? 1);
  return whole ? Math.max(1, k) : k;
}

/**
 * D'où l'on regarde l'objet porté et la taille minimale du cadre (m, taille « cheval »).
 * mouth : [avant, bas] — on ne garde que cette part de la tête (vers les naseaux, vers le bas) : le mors et la
 * muserolle pour les filets (c'est là qu'ils se distinguent), sans la têtière pour les licols (sangles plus grosses).
 */
const WORN_VIEW = {
  pad: { dir: [1, 0.85, 0.4], grow: 1.3, min: 0.62, shadow: false }, // le tapis seul, vu d'en haut : sa forme et son galon
  blanket: { dir: [1, 0.36, 0.62], whole: true }, // le cheval entier : la couverture le couvre presque tout
  // (filets : cadrés sur le mors et la muserolle, sur un alezan — sauf le havane, trop proche : sur le gris)
  bridle: { dir: [1, 0.12, 0.62], grow: 1.08, min: 0.15, shadow: false, mouth: [0.4, 0.5], tone: (c) => (c === 'havana' ? 'light' : 'mid') },
  halter: { dir: [1, 0.16, 0.7], grow: 1.1, min: 0.26, shadow: false, mouth: [0.8, 0.82] },
  head: { dir: [1, 0.2, 0.8], grow: 1.15, min: 0.32, shadow: false },
  legs: { dir: [1, 0.3, 0.8], grow: 1.12, min: 0.5 },
  bells: { dir: [1, 0.3, 0.75], grow: 1.25, min: 0.3, front: true },
  neck: { dir: [1, 0.3, 0.9], grow: 2.1, min: 0.28, shadow: false },
};
/** Le chien est petit : un cadre minimal plus petit que pour un cheval. */
const DOG_MIN = 0.4;

/** Partie avant et basse d'une boîte de tête (vers les naseaux : +z, vers le bas) : front et low en fractions. */
function mouthPart(box, [front, low]) {
  const out = box.clone();
  out.min.z = box.max.z - (box.max.z - box.min.z) * front;
  out.max.y = box.min.y + (box.max.y - box.min.y) * low;
  return out;
}

/** L'objet porté par le mannequin (tête, dos, jambes…), cadré sur l'objet. */
function wornThumb(def, id, color, size) {
  const horse = def.species.includes('horse');
  const kind = horse ? (def.sizes?.includes(size) ? size : 'horse') : 'dog';
  const view = WORN_VIEW[def.slot] ?? WORN_VIEW.blanket;
  const tone = view.tone?.(color) ?? mannequinTone(COLORS[color] ?? BLANKET_COLORS[color] ?? 0x5a3418);
  const m = mannequin(kind, tone);
  const gear = { [def.slot]: { item: id, color, size } };
  const worn = buildGear(m.model, m.look, gear);
  let meshes = worn.userData.meshes ?? [];
  if (view.front) {
    // Cloches : les deux antérieurs suffisent (plus gros dans l'image).
    m.holder.updateMatrixWorld(true);
    const front = meshes.filter((x) => x.getWorldPosition(new V3()).z > 0);
    if (front.length) meshes = front;
  }
  const k = horse ? sizeFrame(kind, { whole: !!view.whole }) : 1;
  let box = null;
  let points = null;
  if (view.whole) {
    // L'animal entier (couverture, manteau du chien), cadré sur ses sommets, « grandi » pour un poney.
    // (box : la vraie boîte, pour l'ombre au sol ; points : ceux du cadrage)
    points = samplePoints(m.holder);
    box = new THREE.Box3().setFromArray(points.flat());
    points = scaleAbout(points, k, [(box.min.x + box.max.x) / 2, 0, (box.min.z + box.max.z) / 2]);
  } else {
    const min = kind === 'dog' ? Math.min(view.min ?? 0, DOG_MIN) : view.min ?? 0;
    let b = boxOf(m.holder, { meshes });
    if (view.mouth) b = mouthPart(b, view.mouth);
    const g = grown(b, (view.grow ?? 1) * k, min);
    const up = aboveGround(g.min.toArray(), g.max.toArray(), 0);
    box = new THREE.Box3(new V3(...up.min), new V3(...up.max));
  }
  return {
    object: m.holder,
    box,
    points,
    dir: view.dir,
    ground: 0,
    shadow: view.shadow,
    shadowScale: 1,
    keep: true,
    dispose: (onMat) => {
      for (const mesh of worn.userData.meshes ?? []) eachMaterial(mesh, onMat);
      removeGear(worn);
    },
  };
}

/** Un objet de la sellerie, à sa couleur (et à sa taille). */
function gearThumb(spec) {
  const def = GEAR[spec.id];
  if (!def) return null;
  const color = def.colors?.includes(spec.color) ? spec.color : def.colors?.[0];
  const size = def.sizes ? (def.sizes.includes(spec.size) ? spec.size : (def.sizes.includes('horse') ? 'horse' : def.sizes[0])) : null;
  if (def.type === 'saddle') {
    // Sur son porte-selle : le cadre est celui de la plus grande taille, une selle poney paraît donc plus petite.
    const g = new THREE.Group();
    g.add(saddleStand());
    const saddle = tackModel(spec.id, color);
    saddle.position.set(0, 0.775, 0);
    g.add(saddle);
    saddle.scale.setScalar(SIZE_SCALE.draft);
    const box = boxOf(g, { meshes: [saddle] });
    box.min.y = Math.min(box.min.y, 0.5);
    saddle.scale.setScalar(SIZE_SCALE[size] ?? 1);
    // De trois quarts côté montoir (gauche) : quartier, étrivière et étrier bien visibles.
    return { object: g, box: grown(box, 1.03), dir: [1, 0.5, 0.55], ground: 0, shadow: false, keep: true };
  }
  if (def.type === 'helmet') {
    const g = new THREE.Group();
    g.add(helmetStand());
    const helmet = tackModel(spec.id, color);
    helmet.position.set(0, 0.315, 0);
    helmet.rotation.y = 0;
    g.add(helmet);
    return { object: g, dir: [1, 0.5, 1.1], ground: 0, keep: true };
  }
  if (def.type === 'leash') {
    const g = new THREE.Group();
    g.add(plinth());
    const leash = tackModel(spec.id, color);
    leash.position.y = 0.04;
    g.add(leash);
    return { object: g, dir: [0.8, 0.95, 1], ground: 0, keep: true };
  }
  return wornThumb(def, spec.id, color, size);
}

// ---------------------------------------------------------------- animaux

/**
 * Un animal tel qu'il sera : espèce, race, robe, sexe, âge (le bébé est plus petit dans le même cadre).
 * seed : la graine de l'animal (marques blanches, taches) ; sans elle, une graine tirée de la clé.
 */
function animalThumb(spec) {
  const { species, breed, colorIndex = 0, sex = 'f', stage = 'adult' } = spec;
  const seed = Number.isFinite(spec.seed) ? spec.seed : seedOf(thumbKey({ species, breed, colorIndex, sex }));
  // (portrait de la fiche : la vraie robe de l'animal, spec.look — sa signature spec.sig fait partie de la clé)
  const look = spec.look ? { ...spec.look } : { ...resolveLook(species, breed, colorIndex), seed };
  const data = { species, breed, sex, ageDays: stageAgeDays(species, stage), look };
  const foal = species === 'horse' && stage === 'baby';
  // (le chiot du chien réaliste : son gabarit, grosse tête et pattes courtes, comme en jeu)
  const puppy = species === 'dog' && stage === 'baby';
  // (mouton réaliste : gabarit de l'agneau et du jeune, cornes du bélier, toison de l'animal pour son portrait)
  const sheep = species === 'sheep' ? { ...look, lamb: stage === 'baby', young: stage === 'young', sex, ...(Number.isFinite(spec.fleece) ? { fleece: spec.fleece } : {}) } : null;
  const model = withTexScale(THUMB_TEX, () => buildAnimalModel(species, foal ? { ...look, foal: true } : puppy ? { ...look, puppy: true } : sheep ?? look, breed));
  model.photoPose?.(); // (cheval réaliste : à l'arrêt, tête relevée, oreilles en avant — jamais en train de brouter)
  model.root.traverse((o) => {
    if (o.isMesh && o.parent === model.root && o.material?.depthWrite === false) o.visible = false;
  });
  const holder = new THREE.Group();
  holder.add(model.root);
  const adult = look.scale ?? 1;
  const g = growthScale(data);
  // Cadre : celui d'un animal un peu plus grand que lui (entre lui et l'adulte) : un bébé paraît petit, mais pas perdu.
  holder.scale.setScalar(adult * Math.max(g, (1 + g) / 2));
  const points = samplePoints(holder);
  holder.scale.setScalar(adult * g);
  // Portrait (fiche) : de trois quarts avant, à hauteur d'épaule — la tête et l'encolure en valeur.
  const portrait = spec.view === 'portrait';
  return {
    object: holder,
    points,
    dir: portrait ? [0.95, 0.24, 1] : species === 'horse' || species === 'cow' ? [1, 0.38, 0.72] : [1, 0.5, 0.95],
    ground: 0,
    pad: portrait ? 1.04 : 1.06,
    dispose: (onMat) => {
      eachMaterial(holder, onMat);
      model.dispose?.();
      disposeModel(model.root);
    },
  };
}

/** Signature courte d'une robe (clé de vignette du portrait : une autre robe, une autre image). */
export function lookSig(look) {
  const txt = JSON.stringify(look ?? {});
  let h = 0x811c9dc5;
  for (let i = 0; i < txt.length; i++) {
    h ^= txt.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * Vignette « portrait » d'un de nos animaux (fiche) : sa vraie robe, son âge, de trois quarts avant.
 * À passer à thumb(game, spec, { w, h, … }).
 */
export function portraitSpec(a, stage) {
  // (mouton : sa toison du moment, arrondie au dixième — tondu, puis qui repousse : une autre image)
  const fleece = a.species === 'sheep' ? Math.round(sheepFleece(a) * 10) / 10 : undefined;
  return { kind: 'animal', view: 'portrait', species: a.species, breed: a.breed, sex: a.sex, stage, seed: a.look?.seed, sig: lookSig(a.look), look: a.look, fleece };
}

/**
 * Un double d'un de nos animaux (entité du jeu), fabriqué neuf pour une photo à part (essayage de la sellerie,
 * portrait de la fiche) : même espèce, race, robe, âge et taille que lui, en pose de photo (cheval réaliste : à
 * l'arrêt, tête relevée, oreilles en avant), sans ombre de contact (le studio a la sienne). On ne déplace plus
 * l'animal vivant dans le studio : en qualité haute, la photo d'essayage montrait l'équipement sans le cheval.
 * Renvoie { holder, model, wear(gear) (met cet équipement, renvoie ses maillages), dispose(onMat) }.
 */
export function photoDouble(e) {
  const data = e.data;
  const foal = data.species === 'horse' && lifeStage(data) === 'baby';
  const st = lifeStage(data);
  const look = foal ? { ...data.look, foal: true }
    : data.species === 'sheep' ? { ...data.look, lamb: st === 'baby', young: st === 'young', sex: data.sex, fleece: sheepFleece(data) } : data.look;
  const model = withTexScale(THUMB_TEX, () => buildGltfAnimal(data.species, look) ?? buildAnimalModel(data.species, look, data.breed));
  model.photoPose?.();
  model.root.traverse((o) => {
    if (o.isMesh && o.parent === model.root && o.material?.depthWrite === false) o.visible = false;
  });
  const holder = new THREE.Group();
  holder.add(model.root);
  holder.scale.setScalar(e.scale ?? data.look.scale ?? 1);
  let worn = null;
  const wear = (gear) => {
    if (worn) removeGear(worn);
    worn = buildGear(model, data.look, gear ?? {});
    holder.updateMatrixWorld(true);
    return worn.userData.meshes ?? [];
  };
  return {
    holder,
    model,
    wear,
    dispose: (onMat) => {
      if (worn) {
        for (const mesh of worn.userData.meshes ?? []) eachMaterial(mesh, onMat);
        removeGear(worn);
        worn = null;
      }
      eachMaterial(holder, onMat);
      model.dispose?.();
      disposeModel(model.root);
    },
  };
}

// ---------------------------------------------------------------- constructions

const grass = () => keep('grass', () => new THREE.MeshStandardMaterial({ color: 0x8fbf5a, roughness: 1 }));
const grassEdge = () => keep('grassEdge', () => new THREE.MeshStandardMaterial({ color: 0x6f9a44, roughness: 1 }));
// Sol des enclos : un paddock en terre battue (la clôture blanche s'y détache), un pré à herbe haute (vert franc).
const paddockGround = () => keep('paddockGround', () => new THREE.MeshStandardMaterial({ color: 0x8f7a4e, roughness: 1 }));
const meadow = () => keep('meadow', () => new THREE.MeshStandardMaterial({ color: 0x5f9e3c, roughness: 1 }));

/** Carré d'herbe sous la construction (les enclos ne sont que des clôtures : on voit mieux le terrain). */
function groundTile(w, d, margin, top = grass()) {
  const g = new THREE.Group();
  const t = new THREE.Mesh(new THREE.BoxGeometry(w + margin * 2, 0.06, d + margin * 2), top);
  t.position.y = -0.03;
  g.add(t);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w + margin * 2 + 0.02, 0.05, d + margin * 2 + 0.02), grassEdge());
  edge.position.y = -0.075;
  g.add(edge);
  return g;
}

/**
 * Habitants des enclos (repère de taille et d'usage) : le même cheval dans le petit et le grand paddock
 * (il paraît plus petit dans le grand), deux moutons dans le pré. [espèce, x, z (÷ largeur, profondeur), cap].
 * Ils sont grossis (ANIMAL_ZOOM, comme sur une icône) : à leur vraie taille, ce ne serait qu'un point.
 */
const ANIMAL_ZOOM = { horse: 1.5, sheep: 1.9 };
const ENCLOSURE_LIFE = {
  paddockSmall: [['horse', 0.12, 0.08, 0.7]],
  paddockLarge: [['horse', 0.12, 0.08, 0.7]],
  pasture: [['sheep', 0.1, 0.1, 0.9], ['sheep', -0.12, -0.02, -0.5]],
};
const ENCLOSURE_GROUND = { paddockSmall: paddockGround, paddockLarge: paddockGround, pasture: meadow };

function structureThumb(spec) {
  const def = STRUCTURES[spec.type];
  if (!def) return null;
  const g = new THREE.Group();
  const model = buildStructureModel(spec.type, '');
  g.add(model);
  const big = Math.max(def.w, def.d);
  const tile = groundTile(def.w, def.d, Math.max(0.25, big * 0.04), (ENCLOSURE_GROUND[spec.type] ?? grass)());
  g.add(tile);
  const decor = def.cat === 'decor';
  // Animaux : le cheval mannequin (gardé, remis à sa place après la photo), des moutons fabriqués pour l'occasion.
  const borrowed = [];
  const made = [];
  for (const [sp, fx, fz, rot] of ENCLOSURE_LIFE[spec.type] ?? []) {
    let obj;
    if (sp === 'horse') {
      const m = mannequin('horse', 'dark'); // (bai : il se détache de l'herbe)
      obj = m.holder;
      borrowed.push([obj, obj.position.clone(), obj.rotation.y, obj.scale.x]);
      obj.scale.setScalar(obj.scale.x * ANIMAL_ZOOM.horse);
    } else {
      // (chaque mouton fabriqué à part : le mouton réaliste a son squelette, qu'une copie partagerait — le second
      // mouton se dessinerait sur le premier)
      const look = { ...resolveLook('sheep', SPECIES.sheep.breeds[0].id, 0), seed: 77 + made.length };
      const sheep = withTexScale(THUMB_TEX, () => buildAnimalModel('sheep', look, SPECIES.sheep.breeds[0].id));
      sheep.photoPose?.();
      sheep.root.traverse((o) => {
        if (o.isMesh && o.parent === sheep.root && o.material?.depthWrite === false) o.visible = false;
      });
      made.push(sheep);
      obj = sheep.root;
    }
    if (sp !== 'horse') borrowed.push([obj, null, 0, 1]);
    obj.position.set(fx * def.w, 0, fz * def.d);
    obj.rotation.y = rot;
    if (sp !== 'horse') obj.scale.setScalar(ANIMAL_ZOOM[sp] ?? 1);
    g.add(obj);
  }
  return {
    object: g,
    // (les enclos : d'assez haut pour voir le rectangle de clôture, le sol et qui y vit)
    dir: decor ? [1, 0.6, 1.05] : ENCLOSURE_LIFE[spec.type] ? [1, 0.9, 1.25] : big > 10 ? [1, 0.62, 1.35] : [1, 0.8, 1.15],
    ground: -0.06,
    shadowScale: 1.12,
    pad: 1.05,
    dispose: (onMat) => {
      // (les animaux sortent du groupe avant de libérer l'enclos : le mannequin est gardé, les moutons à part)
      for (const [obj, pos, ry, sc] of borrowed) {
        g.remove(obj);
        if (pos) {
          obj.position.copy(pos);
          obj.rotation.y = ry;
          obj.scale.setScalar(sc);
        }
      }
      disposeDeep(g, onMat);
      for (const m of made) {
        eachMaterial(m.root, onMat);
        m.dispose?.();
        disposeModel(m.root);
      }
    },
  };
}

function equipmentThumb(spec) {
  const make = EQUIPMENT_MODELS[spec.type];
  if (!make) return null;
  const g = new THREE.Group();
  const model = make();
  g.add(model);
  const b = boxOf(g);
  const s = b.getSize(new V3());
  g.add(groundTile(s.x, s.z, Math.max(0.12, Math.max(s.x, s.z) * 0.15)));
  return { object: g, dir: [1, 0.75, 1.1], ground: -0.06, pad: 1.06 };
}

// ---------------------------------------------------------------- véhicules

function vehicleThumb(spec) {
  const g = new THREE.Group();
  let dir = [1, 0.45, 0.85];
  let box = null;
  let shadow = true;
  switch (spec.id) {
    case 'car':
      g.add(car().group);
      break;
    case 'towCar':
      g.add(towCar().group);
      break;
    case 'trailer': {
      g.add(horseTrailer(1).group);
      dir = [1, 0.45, -0.85]; // de l'arrière : on voit le pont
      break;
    }
    case 'rig': {
      // Le 4x4 et son van, attelés comme dans la cour (src/game/Vehicle.js).
      const main = towCar();
      const tr = horseTrailer(1);
      tr.group.position.z = main.hitchZ - tr.hitchZ;
      g.add(main.group, tr.group);
      dir = [1, 0.5, 0.42];
      break;
    }
    case 'trunk':
      g.add(trunk().group);
      dir = [1, 0.8, 1.1];
      break;
    case 'roofBox': {
      // Le coffre de toit de la voiture, couvercle ouvert, vu d'en haut (pas la voiture entière : elle a sa vignette).
      const c = car();
      c.roofLid.rotation.z = 1.1;
      g.add(c.group);
      const at = c.cargo.roof;
      box = new THREE.Box3().setFromCenterAndSize(new V3(at.x + 0.1, at.y + 0.08, at.z), new V3(1.5, 0.95, 2.05));
      dir = [1, 1.05, 0.5];
      shadow = false;
      break;
    }
    case 'horse': {
      // À cheval : le cheval mannequin sellé.
      const m = mannequin('horse');
      const worn = buildGear(m.model, m.look, { saddle: { item: 'saddle', color: 'brown' }, bridle: { item: 'bridle', color: 'brown' }, pad: { item: 'saddlePad', color: 'navy' } });
      return {
        object: m.holder,
        dir: [1, 0.35, 0.6],
        ground: 0,
        keep: true,
        dispose: (onMat) => {
          for (const mesh of worn.userData.meshes ?? []) eachMaterial(mesh, onMat);
          removeGear(worn);
        },
      };
    }
    default:
      return null;
  }
  // Les textures dessinées des véhicules sont partagées (gardées) : on ne libère que géométries et matériaux.
  return {
    object: g,
    box,
    dir,
    ground: 0,
    shadow,
    pad: 1.05,
    dispose: (onMat) => disposeDeep(g, onMat, { textures: false }),
  };
}

// ---------------------------------------------------------------- enregistrement

export function registerThumbKinds(thumbs) {
  thumbs
    .register('gear', gearThumb)
    .register('animal', animalThumb)
    // (le cheval mannequin des paddocks et de « À cheval » : refaits quand le cheval réaliste arrive)
    // (et le pré et ses moutons : refaits quand le mouton réaliste arrive)
    .register('structure', structureThumb, { horse: (s) => !!ENCLOSURE_LIFE[s.type]?.some(([sp]) => sp === 'horse' || sp === 'sheep') })
    .register('equipment', equipmentThumb)
    .register('vehicle', vehicleThumb, { horse: (s) => s.id === 'horse' });
  thumbs.onRelease(releaseMannequins);
  return thumbs;
}

// Ce qu'on photographie pour les vignettes (moteur : src/game/thumbs.js) :
//   gear      : un objet de la sellerie, à la couleur et à la taille choisies — la selle sur son porte-selle,
//               la bombe sur son pied, la laisse sur un socle, et le reste porté par un cheval « mannequin »
//               (filet, licol, bonnet sur la tête ; tapis sous une selle ; couverture ; guêtres, cloches)
//               ou par un chien (collier, manteau) ;
//   animal    : un animal de l'animalerie tel qu'il sera (espèce, race, robe, sexe, âge) ;
//   structure : une construction du catalogue, posée sur un carré d'herbe ;
//   equipment : un équipement de la ferme (mangeoire, abreuvoir…) ;
//   vehicle   : la voiture, le 4x4 et son van, le van seul, le coffre de sellerie, le cheval sellé.
// Les mannequins (chevaux, chien) sont fabriqués une fois, gardés pendant qu'on fait des vignettes,
// puis libérés quand le moteur se repose.

import * as THREE from 'three';
import { Thumbs, disposeDeep, thumbKey, samplePoints } from './thumbs.js';
import { GEAR } from '../sim/gear.js';
import { tackModel } from './models/tackModels.js';
import { buildGear, removeGear } from './gearModels.js';
import { buildAnimalModel, disposeModel } from './models/animalModel.js';
import { resolveLook, growthScale } from '../sim/animal.js';
import { stageAgeDays } from '../sim/adoption.js';
import { STRUCTURES } from '../sim/construction.js';
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

/** Cheval mannequin de chaque taille : robe grise neutre (le cuir, les couleurs se voient bien dessus). */
const HORSE_FOR_SIZE = {
  pony: { breed: 'connemara', color: 0 },
  horse: { breed: 'selle_francais', color: 2 },
  draft: { breed: 'trait_breton', color: 1 },
};
const mannequins = new Map();

function mannequin(kind) {
  if (mannequins.has(kind)) return mannequins.get(kind);
  const pick = kind === 'dog' ? { species: 'dog', breed: 'labrador', color: 0 } : { species: 'horse', ...(HORSE_FOR_SIZE[kind] ?? HORSE_FOR_SIZE.horse) };
  const look = { ...resolveLook(pick.species, pick.breed, pick.color), seed: 4242 };
  const model = buildAnimalModel(pick.species, look, pick.breed);
  const holder = new THREE.Group();
  holder.add(model.root);
  holder.scale.setScalar(look.scale ?? 1);
  model.root.traverse((o) => {
    if (o.isMesh && o.parent === model.root && o.material?.depthWrite === false) o.visible = false; // (notre ombre suffit)
  });
  const m = { model, look, holder };
  mannequins.set(kind, m);
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

/** D'où l'on regarde l'objet porté et la taille minimale du cadre (m, à l'échelle de l'animal). */
const WORN_VIEW = {
  saddle: { dir: [1, 0.6, 0.45], grow: 1.5, min: 0.7, shadow: false },
  pad: { dir: [1, 0.6, 0.45], grow: 1.4, min: 0.7, shadow: false },
  blanket: { dir: [1, 0.36, 0.62], whole: true }, // le cheval entier : la couverture le couvre presque tout
  bridle: { dir: [1, 0.2, 0.8], grow: 1.15, min: 0.32, shadow: false },
  halter: { dir: [1, 0.2, 0.8], grow: 1.15, min: 0.32, shadow: false },
  head: { dir: [1, 0.2, 0.8], grow: 1.15, min: 0.32, shadow: false },
  legs: { dir: [1, 0.3, 0.8], grow: 1.12, min: 0.5 },
  bells: { dir: [1, 0.35, 0.8], grow: 1.1, min: 0.35, front: true },
  neck: { dir: [1, 0.3, 0.9], grow: 2.1, min: 0.28, shadow: false },
};
/** Le chien est petit : un cadre minimal plus petit que pour un cheval. */
const DOG_MIN = 0.4;

/** L'objet porté par le mannequin (tête, dos, jambes…), cadré sur l'objet. */
function wornThumb(def, id, color, size) {
  const kind = def.species.includes('horse') ? (def.sizes?.includes(size) ? size : 'horse') : 'dog';
  const m = mannequin(kind);
  const gear = { [def.slot]: { item: id, color, size } };
  // Un tapis ne se voit que sous une selle : une selle marron toute simple par-dessus.
  if (def.slot === 'pad') gear.saddle = { item: 'saddle', color: 'brown', size };
  const worn = buildGear(m.model, m.look, gear);
  const view = WORN_VIEW[def.slot] ?? WORN_VIEW.blanket;
  let meshes = worn.userData.meshes ?? [];
  if (view.front) {
    // Cloches : les deux antérieurs suffisent (plus gros dans l'image).
    m.holder.updateMatrixWorld(true);
    const front = meshes.filter((x) => x.getWorldPosition(new V3()).z > 0);
    if (front.length) meshes = front;
  }
  const dog = kind === 'dog';
  const min = dog ? Math.min(view.min ?? 0, DOG_MIN) : view.min ?? 0;
  // Cadre : l'objet porté (agrandi), ou l'animal entier (couverture, manteau du chien).
  const box = view.whole ? null : grown(boxOf(m.holder, { meshes }), view.grow, min * (m.look.scale ?? 1));
  return {
    object: m.holder,
    box,
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

const SIZE_SCALE = { pony: 0.86, horse: 1, draft: 1.14 };

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

/** Un animal tel qu'il sera : espèce, race, robe, sexe, âge (le bébé est plus petit dans le même cadre). */
function animalThumb(spec) {
  const { species, breed, colorIndex = 0, sex = 'f', stage = 'adult' } = spec;
  const look = { ...resolveLook(species, breed, colorIndex), seed: seedOf(thumbKey({ species, breed, colorIndex, sex })) };
  const data = { species, breed, sex, ageDays: stageAgeDays(species, stage), look };
  const foal = species === 'horse' && stage === 'baby';
  const model = buildAnimalModel(species, foal ? { ...look, foal: true } : look, breed);
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
  return {
    object: holder,
    points,
    dir: species === 'horse' || species === 'cow' ? [1, 0.38, 0.72] : [1, 0.5, 0.95],
    ground: 0,
    pad: 1.06,
    dispose: (onMat) => {
      eachMaterial(holder, onMat);
      model.dispose?.();
      disposeModel(model.root);
    },
  };
}

// ---------------------------------------------------------------- constructions

const grass = () => keep('grass', () => new THREE.MeshStandardMaterial({ color: 0x8fbf5a, roughness: 1 }));
const grassEdge = () => keep('grassEdge', () => new THREE.MeshStandardMaterial({ color: 0x6f9a44, roughness: 1 }));

/** Carré d'herbe sous la construction (les enclos ne sont que des clôtures : on voit mieux le terrain). */
function groundTile(w, d, margin) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(w + margin * 2, 0.06, d + margin * 2), grass());
  top.position.y = -0.03;
  g.add(top);
  const edge = new THREE.Mesh(new THREE.BoxGeometry(w + margin * 2 + 0.02, 0.05, d + margin * 2 + 0.02), grassEdge());
  edge.position.y = -0.075;
  g.add(edge);
  return g;
}

function structureThumb(spec) {
  const def = STRUCTURES[spec.type];
  if (!def) return null;
  const g = new THREE.Group();
  const model = buildStructureModel(spec.type, '');
  g.add(model);
  const big = Math.max(def.w, def.d);
  const tile = groundTile(def.w, def.d, Math.max(0.25, big * 0.08));
  g.add(tile);
  const decor = def.cat === 'decor';
  return {
    object: g,
    dir: decor ? [1, 0.6, 1.05] : big > 10 ? [1, 0.8, 1.3] : [1, 0.8, 1.15],
    ground: -0.06,
    shadowScale: 1.12,
    pad: 1.05,
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
    dir,
    ground: 0,
    pad: 1.05,
    dispose: (onMat) => disposeDeep(g, onMat, { textures: false }),
  };
}

// ---------------------------------------------------------------- enregistrement

export function registerThumbKinds(thumbs) {
  thumbs
    .register('gear', gearThumb)
    .register('animal', animalThumb)
    .register('structure', structureThumb)
    .register('equipment', equipmentThumb)
    .register('vehicle', vehicleThumb);
  thumbs.onRelease(releaseMannequins);
  return thumbs;
}

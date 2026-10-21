// Chargement des modèles 3D (GLB) : cache, pré-chargement et copies (instances).
// Les fichiers sont dans public/models/ (compressés en meshopt) et mis en cache par le
// service worker : une fois le jeu ouvert une première fois, tout marche hors ligne.
// Si un modèle manque ou n'est pas encore chargé, chaque usage retombe sur le modèle
// procédural (voir USE_GLTF et getModel).

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';

/** Interrupteur général : false = tout en procédural, comme avant. */
export const USE_GLTF = true;

// Clé -> fichier dans public/models/. Les espèces absentes restent procédurales.
// horse_real : le cheval réaliste (Lyndon Daniels, CC0), construit par horseReal.js. Clé à part (pas
// « horse ») : gltfAnimal.js ne doit pas le prendre pour un animal GLB générique. S'il manque, le
// cheval sculpté par le code (horseModel.js) le remplace.
export const MODELS = {
  horse_real: 'horse_real.glb',
  // Chiens réalistes (dogReal.js) : le shiba (quander, CC-BY 4.0) pour les moyens et grands, le jack russell
  // (FainoDS, CC-BY 4.0) pour les petits. Clés à part (pas « dog ») ; s'ils manquent, le chien procédural reste.
  dog_shiba: 'dog_shiba.glb',
  dog_jack: 'dog_jack.glb',
  // Chats réalistes (catReal.js) : le chat de Claire (claireanne3d, CC-BY 4.0) pour les adultes, le chaton de
  // FainoDS (CC-BY 4.0) pour les bébés. Clés à part (pas « cat ») ; s'ils manquent, le chat procédural reste.
  cat_adult: 'cat_adult.glb',
  cat_kitten: 'cat_kitten.glb',
  // Lapins réalistes (rabbitReal.js) : le lapin gris de Dakota.Hinkle (CC-BY 4.0) pour toutes les races sauf le bélier,
  // le bélier fauve de FourthGreen (CC-BY 4.0) pour le bélier. Clés à part (pas « rabbit ») ; s'ils manquent, le lapin
  // procédural reste.
  rabbit_up: 'rabbit.glb',
  rabbit_lop: 'rabbit_lop.glb',
  // Mouton réaliste (sheepReal.js) : « Sheep_White_01 » de la Microsoft Rocketbox Avatar Library (MIT), pour les 7 races
  // et les agneaux. Clé à part (pas « sheep ») ; s'il manque, le mouton procédural reste.
  sheep_real: 'sheep.glb',
  // Chèvre réaliste (goatReal.js) : « Goat_White_01 » de la Microsoft Rocketbox Avatar Library (MIT), avec les cornes de
  // « Goat_Brown_01 », pour les 4 races et les chevreaux. Clé à part (pas « goat ») ; s'il manque, la chèvre procédurale reste.
  goat_real: 'goat.glb',
  tree_common: 'tree_common.glb',
  tree_common2: 'tree_common2.glb',
  tree_birch: 'tree_birch.glb',
  tree_pine: 'tree_pine.glb',
  rock_a: 'rock_a.glb',
  rock_b: 'rock_b.glb',
  rock_moss: 'rock_moss.glb',
  bush: 'bush.glb',
};

const BASE = `${import.meta.env?.BASE_URL ?? './'}models/`;
const loaded = new Map(); // clé -> gltf (prêt)
const pending = new Map(); // clé -> Promise
let loader = null;

function getLoader() {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
}

/** Prépare un modèle chargé : ombres, géométries partagées (non libérées par disposeModel). */
function prepare(gltf) {
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    o.geometry.userData.shared = true;
    o.frustumCulled = true;
  });
  return gltf;
}

/** Charge un modèle (une seule fois) ; résout null si le fichier manque. */
export function loadModel(key) {
  if (loaded.has(key)) return Promise.resolve(loaded.get(key));
  if (pending.has(key)) return pending.get(key);
  const file = MODELS[key];
  if (!file || !USE_GLTF || typeof window === 'undefined') return Promise.resolve(null);
  // Version « à emporter » (un seul fichier HTML) : les modèles y sont inclus en data: URI.
  const embedded = window.__ANIMADICHELLE_MODELS__?.[file];
  const p = getLoader().loadAsync(embedded ?? BASE + file)
    .then((gltf) => {
      loaded.set(key, prepare(gltf));
      return gltf;
    })
    .catch((err) => {
      console.warn(`Modèle ${key} indisponible, on garde la version procédurale.`, err?.message ?? err);
      loaded.set(key, null);
      return null;
    })
    .finally(() => pending.delete(key));
  pending.set(key, p);
  return p;
}

/** Pré-charge une liste de modèles (toutes par défaut) ; onProgress(fait, total). */
export async function preloadModels(keys = Object.keys(MODELS), onProgress = null) {
  let done = 0;
  await Promise.all(keys.map((k) => loadModel(k).then(() => onProgress?.(++done, keys.length))));
  return keys.filter((k) => loaded.get(k)).length;
}

/** Modèle déjà chargé (synchrone), sinon null. */
export function getModel(key) {
  return (USE_GLTF && loaded.get(key)) || null;
}

/** Vrai si un modèle GLB est prêt pour cette clé. */
export const hasModel = (key) => !!getModel(key);

/**
 * Copie indépendante de la scène d'un modèle (squelette compris) avec ses propres matériaux,
 * pour pouvoir recolorer chaque animal sans toucher aux autres.
 */
export function instantiate(key) {
  const gltf = getModel(key);
  if (!gltf) return null;
  const scene = cloneSkeleton(gltf.scene);
  const mats = new Map();
  scene.traverse((o) => {
    if (!o.isMesh) return;
    const dup = (m) => {
      if (!mats.has(m)) mats.set(m, m.clone());
      return mats.get(m);
    };
    o.material = Array.isArray(o.material) ? o.material.map(dup) : dup(o.material);
  });
  return { scene, animations: gltf.animations };
}

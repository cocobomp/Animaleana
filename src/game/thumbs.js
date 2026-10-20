// Vignettes 3D des cartes (sellerie, animalerie, construction, véhicules) : on « photographie »
// l'objet en 3D hors de l'écran et on garde l'image (blob) en mémoire.
//
// - UN seul rendu hors écran : une cible de rendu du moteur du jeu (pas de deuxième contexte WebGL,
//   les shaders et les textures déjà envoyés à la carte graphique servent aussi ici) ;
//   image suréchantillonnée ×2 puis réduite (bords lisses), fond transparent, éclairage studio doux ;
// - caméra de trois quarts cadrée sur la boîte englobante de l'objet (fitView) ;
// - image 2× la taille affichée, gardée en cache par clé (thumbKey : type, modèle, taille, couleur…) ;
//   le même objet demandé à plusieurs tailles (aperçu, fiche, petite vue) n'est fabriqué qu'une fois, à la
//   plus grande : elle sert aussi aux petites (covers) ;
// - fabriquée seulement quand la carte devient visible (IntersectionObserver), une à la fois et en
//   plusieurs étapes, chacune dans sa propre image d'animation (fabrication du modèle, compilation des
//   shaders, rendu, lecture des pixels, encodage), lancée juste après une image « calme » (pas en retard)
//   pour ne pas retarder celle du jeu ; les pelages sont peints plus petits (gfx.withTexScale) ;
// - un emoji en attendant (ou, pour un aperçu qui change, l'image d'avant sous un voile : hold), et pour
//   toujours si WebGL manque ;
// - les géométries, matériaux et textures de chaque photo sont libérés juste après le rendu ; l'éclairage
//   studio est gardé, les mannequins deux minutes, les cibles de rendu quinze secondes.
//
// La partie « logique pure » (clés, file d'attente, rythme, cadrage, cache) est testée dans tests/thumbs.test.js.

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// ---------------------------------------------------------------- logique pure

/**
 * Clé de cache d'une vignette : « genre:clé=valeur;… » (clés triées, valeurs vides ignorées).
 * Les objets (une robe complète, un modèle…) ne comptent pas : on met dans spec ce qui les décrit.
 */
export function thumbKey(spec = {}) {
  const parts = Object.keys(spec)
    .filter((k) => k !== 'kind')
    .filter((k) => {
      const v = spec[k];
      return v !== undefined && v !== null && v !== '' && typeof v !== 'function' && (typeof v !== 'object' || Array.isArray(v));
    })
    .sort()
    .map((k) => {
      const v = spec[k];
      const s = Array.isArray(v) ? v.join(',') : typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v);
      return `${k}=${s}`;
    });
  return `${spec.kind ?? '?'}:${parts.join(';')}`;
}

/** Taille de l'image : scale × la taille affichée (2× : écran Retina), plafonnée à max pixels de côté. */
export function outputSize(w, h, { scale = 2, max = 512, min = 16 } = {}) {
  let W = Math.max(min, Math.round(w * scale));
  let H = Math.max(min, Math.round(h * scale));
  const big = Math.max(W, H);
  if (big > max) {
    W = Math.max(min, Math.round((W * max) / big));
    H = Math.max(min, Math.round((H * max) / big));
  }
  return [W, H];
}

/**
 * Une image déjà faite de have = [W, H] pixels peut-elle servir à une vue qui en demande want = [W, H] ?
 * Oui si elle est assez grande (slack : 10 % plus petite au plus) et de même forme (rapport largeur/hauteur
 * à tol près : l'image est affichée « contain », une petite différence ne laisse qu'un mince bord vide).
 * Ainsi le même animal, le même objet n'est fabriqué qu'une fois pour l'aperçu, la fiche et les petites vues.
 */
export function covers(have, want, { tol = 0.12, slack = 0.9 } = {}) {
  const [hw, hh] = have;
  const [ww, wh] = want;
  if (!(hw > 0 && hh > 0 && ww > 0 && wh > 0)) return false;
  if (hw < ww * slack || hh < wh * slack) return false;
  const a = hw / hh;
  const b = ww / wh;
  return Math.abs(a - b) / b <= tol;
}

/** Parmi des images [{ size: [W, H], … }], la plus petite qui couvre want (voir covers), ou null. */
export function bestCover(list, want, opts) {
  let best = null;
  for (const it of list) {
    if (!covers(it.size, want, opts)) continue;
    if (!best || it.size[0] * it.size[1] < best.size[0] * best.size[1]) best = it;
  }
  return best;
}

/** Parmi des demandes [{ size: [W, H], … }], la plus grande que l'image de cette demande-là couvrirait aussi. */
export function largestCovering(list, want, opts) {
  let best = null;
  for (const it of list) {
    if (!covers(it.size, want, opts)) continue;
    if (!best || it.size[0] * it.size[1] > best.size[0] * best.size[1]) best = it;
  }
  return best;
}

/**
 * Image d'animation « calme » ? gap : temps écoulé depuis l'image précédente (ms) ; usual : temps habituel
 * entre deux images sur cet appareil. Une image en retard (le jeu a déjà dépassé son budget) : on attend.
 */
export function calmFrame(gap, usual = 16.7, { min = 40, factor = 1.6 } = {}) {
  return gap <= Math.max(min, usual * factor);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a) => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const addScaled = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/**
 * Repère de la caméra qui regarde dans la direction -dir (dir : de l'objet vers la caméra).
 * Renvoie { d, r, u, up } : d vers la caméra, r à droite de l'image, u en haut de l'image.
 */
export function viewBasis(dir) {
  const d = norm(dir);
  const up = Math.abs(d[1]) > 0.999 ? [0, 0, -1] : [0, 1, 0]; // vue de dessus : le haut de l'image vers -z
  const r = norm(cross(up, d));
  const u = cross(d, r);
  return { d, r, u, up };
}

/** Les 8 coins d'une boîte { min: [x, y, z], max: [x, y, z] }. */
export function boxCorners(min, max) {
  const out = [];
  for (const x of [min[0], max[0]]) for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) out.push([x, y, z]);
  return out;
}

/**
 * Remonte une boîte { min, max } ([x, y, z]) qui passe sous le sol (min.y < ground) : agrandie autour d'un
 * objet posé au sol (guêtres, cloches), elle ferait cadrer une moitié d'image vide, sous le sol.
 */
export function aboveGround(min, max, ground = 0) {
  const dy = Math.max(0, ground - min[1]);
  return { min: [min[0], min[1] + dy, min[2]], max: [max[0], max[1] + dy, max[2]] };
}

/** Points agrandis k fois autour de origin (cadrer « comme si » l'objet était plus grand : il paraît plus petit). */
export function scaleAbout(points, k, origin) {
  if (k === 1) return points;
  return points.map((p) => [origin[0] + (p[0] - origin[0]) * k, origin[1] + (p[1] - origin[1]) * k, origin[2] + (p[2] - origin[2]) * k]);
}

/**
 * Cadrage automatique : où placer la caméra (direction dir, champ vertical fov en degrés, rapport aspect)
 * pour que tous les points (les coins de la boîte englobante) tiennent dans l'image, avec une marge pad
 * (1.1 = 10 %), l'objet centré dans l'image (on recentre d'après sa projection, en perspective).
 * Renvoie { target, position, up, distance, near, far, bounds } (bounds : étendue projetée, de -1 à 1).
 */
export function fitView(points, { dir = [1, 0.6, 1], fov = 30, aspect = 1, pad = 1.1, iterations = 3 } = {}) {
  const { d, r, u, up } = viewBasis(dir);
  const tv = Math.tan((fov * Math.PI) / 360);
  const th = tv * aspect;
  let c = [0, 0, 0];
  for (const p of points) c = addScaled(c, p, 1 / points.length);
  let D = 0;
  let local = [];
  const measure = () => {
    local = points.map((p) => {
      const v = sub(p, c);
      return [dot(v, r), dot(v, u), dot(v, d)];
    });
    D = 0;
    for (const [x, y, z] of local) D = Math.max(D, z + (Math.abs(x) * pad) / th, z + (Math.abs(y) * pad) / tv);
  };
  const bounds = () => {
    const b = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
    for (const [x, y, z] of local) {
      const k = 1 / Math.max(1e-6, D - z);
      b.x0 = Math.min(b.x0, (x * k) / th);
      b.x1 = Math.max(b.x1, (x * k) / th);
      b.y0 = Math.min(b.y0, (y * k) / tv);
      b.y1 = Math.max(b.y1, (y * k) / tv);
    }
    return b;
  };
  measure();
  for (let i = 0; i < iterations; i++) {
    // Recentre : le milieu de l'image projetée passe au centre (un déplacement Δ au centre décale l'image de Δ/D).
    const b = bounds();
    c = addScaled(addScaled(c, r, ((b.x0 + b.x1) / 2) * th * D), u, ((b.y0 + b.y1) / 2) * tv * D);
    measure();
  }
  let zMin = Infinity;
  let zMax = -Infinity;
  for (const [, , z] of local) {
    zMin = Math.min(zMin, z);
    zMax = Math.max(zMax, z);
  }
  const position = addScaled(c, d, D);
  return {
    target: c,
    position,
    up,
    distance: D,
    near: Math.max(0.005, (D - zMax) * 0.5),
    far: (D - zMin) * 1.6 + 0.1,
    bounds: bounds(),
  };
}

/**
 * File des vignettes à fabriquer, sans doublon : la plus prioritaire d'abord (3 = urgente, 2 = visible,
 * 1 = bientôt visible, 0 = sortie de l'écran), puis dans l'ordre des demandes (de haut en bas de la liste).
 */
export class ThumbQueue {
  constructor() {
    this.jobs = new Map();
    this.seq = 0;
  }

  get size() {
    return this.jobs.size;
  }

  has(key) {
    return this.jobs.has(key);
  }

  get(key) {
    return this.jobs.get(key) ?? null;
  }

  /** Ajoute (ou met à jour) une demande. Changer sa priorité la remet en fin de sa nouvelle file. */
  push(key, data, priority = 2) {
    const old = this.jobs.get(key);
    if (old) {
      if (data !== undefined) old.data = data;
      if (old.priority !== priority) {
        old.priority = priority;
        old.seq = ++this.seq;
      }
      return old;
    }
    const job = { key, data, priority, seq: ++this.seq };
    this.jobs.set(key, job);
    return job;
  }

  /** Retire et renvoie la prochaine (ou null). keep(job) → false : on la jette (plus personne ne l'attend). */
  next(keep = null) {
    for (;;) {
      let best = null;
      for (const j of this.jobs.values()) {
        if (!best || j.priority > best.priority || (j.priority === best.priority && j.seq < best.seq)) best = j;
      }
      if (!best) return null;
      this.jobs.delete(best.key);
      if (!keep || keep(best)) return best;
    }
  }

  delete(key) {
    return this.jobs.delete(key);
  }

  clear() {
    this.jobs.clear();
  }
}

/**
 * Rythme : après une étape qui a pris `cost` ms, on attend au moins rest × cost ms (et au moins min) avant
 * la suivante. rest = 1 : le moteur ne prend jamais plus de la moitié du temps, le jeu garde l'autre moitié.
 */
export class Pacer {
  constructor({ rest = 1, min = 0, max = 400 } = {}) {
    this.rest = rest;
    this.min = min;
    this.max = max;
    this.until = 0;
  }

  ready(now) {
    return now >= this.until;
  }

  done(now, cost) {
    this.until = now + Math.min(this.max, Math.max(this.min, cost * this.rest));
  }

  /** Temps à attendre (ms) avant la prochaine étape. */
  wait(now) {
    return Math.max(0, this.until - now);
  }
}

/** Cache LRU : max entrées ; onEvict(valeur, clé) quand on en retire une (pour libérer l'URL du blob). */
export class ThumbCache {
  constructor(max = 200, onEvict = null) {
    this.max = max;
    this.onEvict = onEvict;
    this.map = new Map();
    this.bytes = 0;
  }

  get size() {
    return this.map.size;
  }

  has(key) {
    return this.map.has(key);
  }

  /** La valeur (et elle devient la plus récente), ou null. */
  get(key) {
    const e = this.map.get(key);
    if (!e) return null;
    this.map.delete(key);
    this.map.set(key, e);
    return e.value;
  }

  set(key, value, bytes = 0) {
    if (this.map.has(key)) this.delete(key);
    this.map.set(key, { value, bytes });
    this.bytes += bytes;
    while (this.map.size > this.max) this.delete(this.map.keys().next().value);
  }

  delete(key) {
    const e = this.map.get(key);
    if (!e) return false;
    this.map.delete(key);
    this.bytes -= e.bytes;
    this.onEvict?.(e.value, key);
    return true;
  }

  clear() {
    for (const key of [...this.map.keys()]) this.delete(key);
  }
}

// ---------------------------------------------------------------- mémoire

const TEX_SLOTS = ['map', 'alphaMap', 'aoMap', 'bumpMap', 'normalMap', 'displacementMap', 'emissiveMap', 'metalnessMap',
  'roughnessMap', 'lightMap', 'specularMap', 'clearcoatMap', 'clearcoatNormalMap', 'clearcoatRoughnessMap', 'sheenColorMap',
  'sheenRoughnessMap', 'transmissionMap', 'thicknessMap', 'iridescenceMap', 'anisotropyMap', 'gradientMap'];

/**
 * Libère tout ce qui appartient à cet objet : géométries, matériaux et leurs textures,
 * sauf ce qui est partagé (userData.shared : caches des modèles de la sellerie, textures communes…).
 * onMaterial(m) est appelé avant de libérer chaque matériau ; textures : false garde les textures
 * (celles des véhicules sont dessinées une fois et partagées).
 */
export function disposeDeep(object, onMaterial = null, { textures = true } = {}) {
  const done = new Set();
  object.traverse((o) => {
    if (o.geometry && !done.has(o.geometry)) {
      done.add(o.geometry);
      if (!o.geometry.userData?.shared) o.geometry.dispose();
    }
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      if (done.has(m) || m.userData?.shared) continue;
      done.add(m);
      for (const slot of textures ? TEX_SLOTS : []) {
        const t = m[slot];
        if (t?.isTexture && !t.userData?.shared && !t.isRenderTargetTexture && !done.has(t)) {
          done.add(t);
          t.dispose();
        }
      }
      onMaterial?.(m);
      m.dispose();
    }
  });
}

// ---------------------------------------------------------------- moteur

const tmpV = new THREE.Vector3();

/**
 * Quelques sommets des maillages visibles de l'objet (repère monde), au plus max : de quoi cadrer serré.
 * Sans les ombres de contact ni les vitres (transparentes, sans profondeur). Chaque petite pièce garde au
 * moins les coins de sa boîte.
 */
export function samplePoints(object, max = 3000) {
  object.updateMatrixWorld(true);
  const meshes = [];
  let total = 0;
  object.traverse((o) => {
    if (!o.isMesh || o.isSprite || !o.geometry?.attributes?.position) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    if (o.material?.depthWrite === false && o.material?.transparent) return;
    meshes.push(o);
    total += o.geometry.attributes.position.count * (o.isInstancedMesh ? o.count : 1);
  });
  const step = Math.max(1, Math.ceil(total / max));
  const out = [];
  const m4 = new THREE.Matrix4();
  for (const o of meshes) {
    const pos = o.geometry.attributes.position;
    const copies = o.isInstancedMesh ? o.count : 1;
    for (let c = 0; c < copies; c++) {
      if (o.isInstancedMesh) {
        o.getMatrixAt(c, m4);
        m4.premultiply(o.matrixWorld);
      } else m4.copy(o.matrixWorld);
      if (pos.count <= step * 8) {
        // petite pièce : les coins de sa boîte suffisent
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        for (const p of boxCorners(b.min.toArray(), b.max.toArray())) out.push(tmpV.fromArray(p).applyMatrix4(m4).toArray());
        continue;
      }
      for (let i = 0; i < pos.count; i += step) out.push(tmpV.fromBufferAttribute(pos, i).applyMatrix4(m4).toArray());
    }
  }
  return out;
}

/** Ombre douce au sol (tache ronde), partagée. */
function blobTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(0,0,0,1)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.6)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Passe finale : réduit l'image ×2 (un échantillon bilinéaire au coin de 4 pixels = leur moyenne),
// tons filmiques ACES et sRGB comme l'écran du jeu, et retire le pré-multiplié par l'alpha (fond transparent).
const OUTPUT_VERT = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;
const OUTPUT_FRAG = /* glsl */`
uniform sampler2D tScene;
uniform vec2 uScale;
uniform float uExposure;
varying vec2 vUv;
vec3 RRTAndODTFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}
vec3 aces(vec3 color) {
  const mat3 inMat = mat3(vec3(0.59719, 0.07600, 0.02840), vec3(0.35458, 0.90834, 0.13383), vec3(0.04823, 0.01566, 0.83777));
  const mat3 outMat = mat3(vec3(1.60475, -0.10208, -0.00327), vec3(-0.53108, 1.10813, -0.07276), vec3(-0.07367, -0.00605, 1.07602));
  color *= uExposure / 0.6;
  color = inMat * color;
  color = RRTAndODTFit(color);
  color = outMat * color;
  return clamp(color, 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
}
void main() {
  vec4 c = texture2D(tScene, vUv * uScale);
  if (c.a <= 0.002) {
    gl_FragColor = vec4(0.0);
    return;
  }
  gl_FragColor = vec4(toSRGB(aces(c.rgb / c.a)), clamp(c.a, 0.0, 1.0));
}`;

const nextFrame = () => new Promise((resolve) => {
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame((ts) => resolve(ts));
  else setTimeout(() => resolve(now()), 16);
});

// Tâche « juste après l'image » : le navigateur vient d'afficher l'image, le jeu a devant lui tout le temps
// jusqu'à la suivante ; un travail lancé là ne retarde pas l'image en cours (dans un rappel d'animation, si).
let postChannel = null;
const postQueue = [];
function postTask(fn) {
  if (typeof MessageChannel !== 'function') {
    setTimeout(fn, 0);
    return;
  }
  if (!postChannel) {
    postChannel = new MessageChannel();
    postChannel.port1.onmessage = () => postQueue.shift()?.();
  }
  postQueue.push(fn);
  postChannel.port2.postMessage(0);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Repos : les cibles de rendu sont rendues après REST_MS sans travail, les mannequins après REST_LONG_MS. */
const REST_MS = 15000;
const REST_LONG_MS = 120000;

/** Réglage par l'adresse ou le stockage local : ?thumbs=off (emoji seulement, pour tester le repli) ou ?thumbs=debug. */
function thumbsSetting() {
  try {
    const q = new URLSearchParams(location.search).get('thumbs');
    return q ?? localStorage.getItem('thumbs') ?? '';
  } catch {
    return '';
  }
}

/**
 * Le moteur de vignettes. Un par partie (game.thumbs, voir src/game/thumbScenes.js qui y enregistre
 * les genres : gear, animal, structure, equipment, vehicle).
 */
export class Thumbs {
  constructor(renderer, { debug = null } = {}) {
    this.renderer = renderer ?? null;
    const setting = thumbsSetting();
    this.debug = debug ?? setting === 'debug';
    this.kinds = new Map(); // genre → fabrique(spec) → { object, box?, dir?, pad?, fov?, ground?, dispose?, keep? }
    // Genres de vignettes qui peuvent montrer un cheval (true, ou spec → oui / non) : voir modelsChanged.
    this.horseKinds = new Map([['animal', true], ['gear', true]]);
    // Les images d'un même objet (même spec, tailles différentes) : une grande sert aussi aux petites vues.
    this.family = new Map(); // famille (clé sans la taille) → Map(clé → { key, size: [W, H], url })
    this.familyOf = new Map(); // clé → famille
    this.live = new Set(); // URL des images encore en cache (les autres sont libérées)
    this.cache = new ThumbCache(240, (url, key) => {
      this.live.delete(url);
      const fam = this.familyOf.get(key);
      this.familyOf.delete(key);
      this.family.get(fam)?.delete(key);
      if (fam && !this.family.get(fam)?.size) this.family.delete(fam);
      try {
        URL.revokeObjectURL(url);
      } catch {
        /* rien à libérer */
      }
    });
    this.held = new Map(); // emplacement (hold) → dernière image montrée (gardée sous un voile pendant la suivante)
    this.queue = new ThumbQueue();
    this.pacer = new Pacer({ rest: 1, min: 0, max: 300 });
    this.waiting = new Map(); // clé → { key, spec, fam, size: [W, H], els: Set<élément>, resolvers: [] }
    this.info = new WeakMap(); // élément → { key, cls, alt, priority, hold }
    // Rythme des images du jeu (mesuré pendant qu'on travaille) : on ne lance rien sur une image en retard.
    this.frameGap = 16.7;
    this.usualGap = 16.7;
    this.lastFrameTs = 0;
    this.ticking = false;
    this.observed = new Set();
    this.failed = new Set();
    this.anchored = new Set(); // programmes de shaders gardés (pas recompilés à chaque vignette)
    this.releasers = [];
    this.busy = false;
    this.raf = 0;
    this.idleTimer = 0;
    this.longIdleTimer = 0;
    this.lastSweep = 0;
    this.log = []; // dernières mesures (temps, taille)
    this.totals = { made: 0, failed: 0, cpuMs: 0, maxCpuMs: 0, wallMs: 0 };
    this.enabled = setting !== 'off' && this.detect();
    this.io = typeof IntersectionObserver === 'function'
      ? new IntersectionObserver((entries) => this.onSeen(entries), { rootMargin: '120px 0px' })
      : null;
    const canvas = this.renderer?.domElement;
    if (canvas?.addEventListener) {
      canvas.addEventListener('webglcontextlost', () => this.contextLost());
      canvas.addEventListener('webglcontextrestored', () => {
        this.failed.clear(); // (les vignettes ratées pendant la perte du contexte : on pourra les refaire)
        this.enabled = setting !== 'off' && this.detect();
      });
    }
  }

  /** WebGL est-il là (et pas perdu) ? Sinon : emoji seulement. */
  detect() {
    try {
      if (typeof document === 'undefined' || !this.renderer) return false;
      const gl = this.renderer.getContext?.();
      return !!gl && !gl.isContextLost?.();
    } catch {
      return false;
    }
  }

  /**
   * Enregistre un genre de vignette : fabrique(spec) → { object, … } (voir run()). horse : la vignette peut
   * montrer un cheval (true, ou spec → oui / non) ; elle sera refaite quand le cheval réaliste arrive.
   */
  register(kind, make, { horse } = {}) {
    this.kinds.set(kind, make);
    if (horse) this.horseKinds.set(kind, horse);
    return this;
  }

  /**
   * Appelé quand le moteur se repose depuis longtemps (REST_LONG_MS : rien à faire depuis deux minutes) :
   * on libère ce qu'on gardait sous la main (les mannequins). Pas après chaque pause courte : les refaire
   * coûterait plus cher que de les garder (un cheval mannequin : quelques centaines de Ko).
   */
  onRelease(fn) {
    this.releasers.push(fn);
  }

  /**
   * Les modèles des chevaux ont changé (le cheval réaliste est arrivé après l'ouverture de la partie, voir
   * Game.onRealHorse ; de même les chiens réalistes, Game.onRealDogs : vignettes « animal » et « gear ») : les vignettes qui peuvent montrer un cheval (animaux, équipement posé sur des chevaux
   * mannequins, « À cheval » des véhicules, paddocks : voir register) prennent d'autres clés et sont refaites à
   * la prochaine demande ; les mannequins gardés sont libérés entre deux vignettes (jamais pendant qu'on en
   * photographie une).
   */
  modelsChanged() {
    this.variant = (this.variant ?? 0) + 1;
    const release = () => {
      if (this.busy) setTimeout(release, 100);
      else this.releaseKept();
    };
    release();
  }

  /** La demande, marquée de la version des modèles si elle peut montrer un cheval (voir modelsChanged). */
  vary(spec) {
    return this.variant && this.showsHorse(spec) ? { ...spec, mv: this.variant } : spec;
  }

  /** Cette vignette peut-elle montrer un cheval (voir register) ? */
  showsHorse(spec) {
    const h = this.horseKinds.get(spec.kind);
    return typeof h === 'function' ? !!h(spec) : !!h;
  }

  /** L'image déjà faite pour cette vignette (URL), ou une plus grande du même objet, ou null. */
  get(spec, w, h) {
    spec = this.vary(spec);
    return this.lookup(thumbKey(spec), thumbKey({ ...spec, w, h }), outputSize(w, h));
  }

  /** L'image de cette clé, sinon une image plus grande de la même famille qui la couvre (voir covers). */
  lookup(fam, key, size) {
    const url = this.cache.get(key);
    if (url) return url;
    const imgs = this.family.get(fam);
    if (!imgs?.size) return null;
    const best = bestCover([...imgs.values()], size);
    if (!best) return null;
    this.cache.get(best.key); // (elle devient la plus récente du cache)
    return best.url;
  }

  /** Demande en attente pour cette clé (créée au besoin). */
  waitFor(key, fam, full, size) {
    let w8 = this.waiting.get(key);
    if (!w8) {
      w8 = { key, spec: full, fam, size, els: new Set(), resolvers: [] };
      this.waiting.set(key, w8);
    }
    return w8;
  }

  /**
   * Élément de vignette pour une carte : l'image si elle est prête, sinon l'emoji en attendant
   * (l'image arrive quand la carte devient visible). w × h : taille affichée (px CSS).
   * urgent : passe devant les autres (aperçu de ce qu'on est en train de choisir).
   * hold : nom d'emplacement (ex. « tk-big:saddle ») ; tant que la nouvelle image n'est pas prête, on y laisse
   * la précédente sous un léger voile, au lieu de repasser à l'emoji (pas de clignotement à chaque choix).
   */
  view(spec, { w = 80, h = 64, emoji = '', cls = '', alt = '', urgent = false, hold = '' } = {}) {
    spec = this.vary(spec);
    const full = { ...spec, w, h };
    const key = thumbKey(full);
    const fam = thumbKey(spec);
    const size = outputSize(w, h);
    const el = document.createElement('span');
    const info = { key, cls, alt, priority: urgent ? 3 : 2, hold };
    this.info.set(el, info);
    const url = this.lookup(fam, key, size);
    if (url) {
      this.fill(el, url);
      return el;
    }
    const prev = hold && this.enabled ? this.held.get(hold) : null;
    const keepPrev = !!prev && this.live.has(prev);
    el.className = `thumb ${cls} ${this.enabled && !this.failed.has(key) ? 'is-wait' : 'is-emoji'}${keepPrev ? ' is-hold' : ''}`.replace(/\s+/g, ' ').trim();
    if (keepPrev) {
      const img = document.createElement('img');
      img.src = prev;
      img.alt = '';
      img.draggable = false;
      img.className = 'thumb-prev';
      el.append(img);
    }
    const ph = document.createElement('span');
    ph.className = 'thumb-ph';
    ph.setAttribute('aria-hidden', 'true');
    ph.textContent = emoji;
    el.append(ph);
    if (alt) el.setAttribute('aria-label', alt);
    if (!this.enabled || this.failed.has(key)) return el; // repli : l'emoji reste
    this.waitFor(key, fam, full, size).els.add(el);
    this.observed.add(el);
    if (this.io) this.io.observe(el);
    else this.enqueue(key, info.priority);
    return el;
  }

  /** Demande une vignette sans élément (pré-chargement) : promesse de l'URL (null si impossible). */
  want(spec, { w = 80, h = 64, priority = 1 } = {}) {
    const full = { ...spec, w, h };
    const key = thumbKey(full);
    const fam = thumbKey(spec);
    const size = outputSize(w, h);
    const url = this.lookup(fam, key, size);
    if (url || !this.enabled || this.failed.has(key)) return Promise.resolve(url ?? null);
    return new Promise((resolve) => {
      this.waitFor(key, fam, full, size).resolvers.push(resolve);
      this.enqueue(key, Math.max(priority, this.queue.get(key)?.priority ?? 0));
    });
  }

  /** Met l'image dans l'élément (même HTML qu'un élément tout neuf : le panneau ne se redessine pas pour rien). */
  fill(el, url, fresh = false) {
    const info = this.info.get(el) ?? {};
    el.className = `thumb ${info.cls ?? ''} is-ready${fresh ? ' is-new' : ''}`.replace(/\s+/g, ' ').trim();
    el.removeAttribute('aria-label');
    const img = document.createElement('img');
    img.src = url;
    img.alt = info.alt ?? '';
    img.draggable = false;
    el.replaceChildren(img);
    if (info.hold) this.held.set(info.hold, url);
    if (fresh) {
      // (la classe « is-new » ne sert qu'au fondu d'arrivée : on la retire ensuite)
      setTimeout(() => el.classList.remove('is-new'), 400);
    }
  }

  onSeen(entries) {
    for (const e of entries) {
      const el = e.target;
      const info = this.info.get(el);
      if (!info || !el.isConnected) {
        this.forget(el);
        continue;
      }
      if (e.isIntersecting) this.enqueue(info.key, info.priority);
      else if (this.queue.has(info.key) && ![...(this.waiting.get(info.key)?.els ?? [])].some((x) => x !== el && x.isConnected)) {
        this.queue.push(info.key, undefined, 0); // sortie de l'écran : elle attendra son tour
      }
    }
  }

  /** On n'attend plus cette vignette pour cet élément (carte retirée de l'écran). */
  forget(el) {
    this.io?.unobserve(el);
    this.observed.delete(el);
    const info = this.info.get(el);
    if (!info) return;
    const w8 = this.waiting.get(info.key);
    if (!w8) return;
    w8.els.delete(el);
    if (!w8.els.size && !w8.resolvers.length) {
      this.waiting.delete(info.key);
      this.queue.delete(info.key);
    }
  }

  /** Oublie les cartes qui ne sont plus à l'écran (panneau redessiné ou fermé). */
  sweep() {
    for (const el of [...this.observed]) if (!el.isConnected) this.forget(el);
  }

  /** Quelqu'un attend-il encore cette demande (un élément à l'écran, ou une promesse) ? */
  wanted(w8) {
    return !!w8 && (w8.resolvers.length > 0 || [...w8.els].some((el) => el.isConnected));
  }

  enqueue(key, priority) {
    const w8 = this.waiting.get(key);
    if (!w8) return;
    const url = this.lookup(w8.fam, key, w8.size);
    if (url) {
      this.deliver(key, url);
      return;
    }
    const old = this.queue.get(key);
    this.queue.push(key, w8.spec, Math.max(priority, old?.priority ?? 0));
    this.schedule();
  }

  schedule(delay = 0) {
    if (this.raf || this.busy) return;
    clearTimeout(this.idleTimer);
    clearTimeout(this.longIdleTimer);
    this.startTicker();
    const go = () => {
      this.raf = typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame(() => {
          this.raf = 0;
          this.pump();
        })
        : setTimeout(() => {
          this.raf = 0;
          this.pump();
        }, 16);
    };
    if (delay > 0) {
      this.raf = setTimeout(() => {
        this.raf = 0;
        go();
      }, delay);
    } else go();
  }

  /**
   * Mesure le rythme des images tant qu'on a du travail (un rappel d'animation qui ne fait que noter l'heure) :
   * frameGap = temps depuis l'image précédente, usualGap = temps habituel sur cet appareil.
   */
  startTicker() {
    if (this.ticking || typeof requestAnimationFrame !== 'function') return;
    this.ticking = true;
    this.lastFrameTs = 0;
    const tick = (ts) => {
      if (this.lastFrameTs) {
        const gap = ts - this.lastFrameTs;
        this.frameGap = gap;
        // Temps habituel : suit vite les images rapides, lentement les lentes (une saccade ne le gonfle pas).
        this.usualGap += (Math.min(gap, 250) - this.usualGap) * (gap < this.usualGap ? 0.3 : 0.05);
      }
      this.lastFrameTs = ts;
      if (this.ticking) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  stopTicker() {
    this.ticking = false;
  }

  /** Une étape de travail (appelée au plus une fois par image d'animation). */
  async pump() {
    if (this.busy || !this.enabled) return;
    const t = now();
    if (t - this.lastSweep > 1000) {
      this.lastSweep = t;
      this.sweep();
    }
    if (!this.pacer.ready(t)) {
      this.schedule(this.pacer.wait(t));
      return;
    }
    // (une vignette que plus personne n'attend est jetée)
    const job = this.queue.next((j) => this.wanted(this.waiting.get(j.key)));
    if (!job) {
      this.restSoon();
      return;
    }
    // Le même objet est aussi demandé en plus grand (aperçu et fiche) : on fait la grande, elle sert aux deux.
    const asked = this.waiting.get(job.key);
    const same = [...this.waiting.values()].filter((w8) => w8.fam === asked.fam && w8.key !== job.key && this.wanted(w8));
    const big = largestCovering(same, asked.size);
    const target = big && big.size[0] * big.size[1] > asked.size[0] * asked.size[1] ? big : asked;
    if (target !== asked) this.queue.delete(target.key);
    this.busy = true;
    let url = null;
    try {
      url = await this.run(target.key, target.spec);
    } catch (err) {
      if (this.debug) console.warn('[thumbs] échec', target.key, err);
      url = null;
    }
    this.busy = false;
    if (url) {
      this.deliver(target.key, url, true);
      // Toutes les vues du même objet que cette image couvre (plus petites) : servies aussi.
      for (const w8 of [...this.waiting.values()]) {
        if (w8.fam === target.fam && covers(target.size, w8.size)) {
          this.queue.delete(w8.key);
          this.deliver(w8.key, url, true);
        }
      }
    } else {
      this.failed.add(target.key);
      this.totals.failed += 1;
      this.deliver(target.key, null);
    }
    // (la demande d'origine, si l'image faite ne lui va pas : elle reprend sa place dans la file)
    if (this.waiting.has(job.key) && !this.queue.has(job.key)) {
      if (url) this.queue.push(job.key, asked.spec, job.priority);
      else this.deliver(job.key, null);
    }
    if (this.queue.size) this.schedule();
    else this.restSoon();
  }

  /** L'image est prête (ou impossible : null) : on la donne à tous ceux qui l'attendent. */
  deliver(key, url, fresh = false) {
    const w8 = this.waiting.get(key);
    if (!w8) return;
    this.waiting.delete(key);
    for (const el of w8.els) {
      this.io?.unobserve(el);
      this.observed.delete(el);
      if (url) this.fill(el, url, fresh && el.isConnected);
      else {
        el.classList.remove('is-wait', 'is-hold');
        el.querySelector('.thumb-prev')?.remove();
        el.classList.add('is-emoji');
      }
    }
    for (const r of w8.resolvers) r(url);
  }

  /**
   * Plus rien à faire : après REST_MS on rend les cibles de rendu (mémoire de la carte graphique, vite refaites) ;
   * après REST_LONG_MS les mannequins aussi. L'éclairage studio (petit) est gardé : le refaire coûte une image.
   */
  restSoon() {
    this.stopTicker();
    clearTimeout(this.idleTimer);
    clearTimeout(this.longIdleTimer);
    const idle = () => !this.busy && !this.queue.size;
    this.idleTimer = setTimeout(() => {
      if (idle()) this.releaseTargets();
    }, REST_MS);
    this.longIdleTimer = setTimeout(() => {
      if (idle()) this.releaseKept();
    }, REST_LONG_MS);
  }

  releaseTargets() {
    this.sceneRT?.dispose();
    this.outRT?.dispose();
    this.sceneRT = null;
    this.outRT = null;
  }

  releaseKept() {
    for (const fn of this.releasers) {
      try {
        fn();
      } catch {
        /* rien */
      }
    }
  }

  /** Libère tout (cibles, mannequins, éclairage studio) : rien n'est perdu, tout se refait à la demande. */
  release() {
    this.releaseKept();
    this.releaseTargets();
    this.envRT?.dispose();
    this.envRT = null;
    if (this.scene) this.scene.environment = null;
  }

  contextLost() {
    this.enabled = false;
    this.stopTicker();
    this.queue.clear();
    for (const key of [...this.waiting.keys()]) this.deliver(key, null);
    this.sceneRT = null;
    this.outRT = null;
    this.envRT = null;
  }

  // ------------------------------------------------------------ studio

  setup() {
    const r = this.renderer;
    if (!this.scene) {
      const scene = new THREE.Scene();
      this.hemi = new THREE.HemisphereLight(0xffffff, 0xcdbfa8, 0.55);
      this.key = new THREE.DirectionalLight(0xfff3e2, 1.9);
      scene.add(this.hemi, this.key, this.key.target);
      this.shadow = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0xffffff, transparent: true, opacity: 0.32, depthWrite: false, toneMapped: false }),
      );
      this.shadow.renderOrder = -1;
      scene.add(this.shadow);
      this.camera = new THREE.PerspectiveCamera(30, 1, 0.01, 100);
      this.scene = scene;
      this.quadScene = new THREE.Scene();
      this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
      this.quadMat = new THREE.ShaderMaterial({
        uniforms: { tScene: { value: null }, uScale: { value: new THREE.Vector2(1, 1) }, uExposure: { value: 1.0 } },
        vertexShader: OUTPUT_VERT,
        fragmentShader: OUTPUT_FRAG,
        depthTest: false,
        depthWrite: false,
        blending: THREE.NoBlending,
        toneMapped: false,
      });
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat);
      quad.frustumCulled = false;
      this.quadScene.add(quad);
      this.canvas = document.createElement('canvas');
      // Cible du rendu : demi-flottants si possible (plus de nuances dans les ombres), sinon 8 bits.
      const ext = r.extensions;
      this.hdr = !!(ext?.has?.('EXT_color_buffer_float') || ext?.has?.('EXT_color_buffer_half_float'));
    }
    if (!this.envRT) {
      // Éclairage studio : une pièce blanche douce (reflets sur le cuir, la peinture, les métaux).
      const pmrem = new THREE.PMREMGenerator(r);
      const room = new RoomEnvironment();
      this.envRT = pmrem.fromScene(room, 0.04, 0.1, 100, { size: 64 });
      room.traverse((o) => {
        o.geometry?.dispose?.();
        o.material?.dispose?.();
      });
      pmrem.dispose();
      this.scene.environment = this.envRT.texture;
      this.scene.environmentIntensity = 0.75;
    }
  }

  /** Cibles de rendu assez grandes (elles grandissent par paliers de 64 px, jamais ne rétrécissent tant qu'on s'en sert). */
  targets(W, H) {
    const SW = W * 2;
    const SH = H * 2;
    const up = (v) => Math.ceil(v / 64) * 64;
    if (!this.sceneRT || this.sceneRT.width < SW || this.sceneRT.height < SH) {
      const w = up(Math.max(SW, this.sceneRT?.width ?? 0));
      const h = up(Math.max(SH, this.sceneRT?.height ?? 0));
      this.sceneRT?.dispose();
      this.sceneRT = new THREE.WebGLRenderTarget(w, h, {
        type: this.hdr ? THREE.HalfFloatType : THREE.UnsignedByteType,
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        depthBuffer: true,
        generateMipmaps: false,
      });
    }
    if (!this.outRT || this.outRT.width < W || this.outRT.height < H) {
      const w = up(Math.max(W, this.outRT?.width ?? 0));
      const h = up(Math.max(H, this.outRT?.height ?? 0));
      this.outRT?.dispose();
      this.outRT = new THREE.WebGLRenderTarget(w, h, {
        type: THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        generateMipmaps: false,
      });
    }
    const s = this.sceneRT;
    s.viewport.set(0, 0, SW, SH);
    s.scissor.set(0, 0, SW, SH);
    s.scissorTest = true;
    const o = this.outRT;
    o.viewport.set(0, 0, W, H);
    o.scissor.set(0, 0, W, H);
    o.scissorTest = true;
    this.quadMat.uniforms.tScene.value = s.texture;
    this.quadMat.uniforms.uScale.value.set(SW / s.width, SH / s.height);
  }

  /** Place la caméra, la lumière principale et l'ombre au sol pour cet objet. */
  frame(built, W, H) {
    const obj = built.object;
    obj.updateMatrixWorld(true);
    // Cadrage serré : sur des sommets de l'objet (une boîte de trois quarts laisse beaucoup de vide dans les coins),
    // ou sur la boîte donnée par la fabrique (objet porté par un mannequin, animal plus jeune…).
    const points = built.points ?? (built.box ? boxCorners(built.box.min.toArray(), built.box.max.toArray()) : samplePoints(obj));
    if (!points.length) throw new Error('vignette vide');
    const box = built.box ?? new THREE.Box3().setFromArray(points.flat());
    const cam = this.camera;
    cam.fov = built.fov ?? 30;
    cam.aspect = W / H;
    const fit = fitView(points, {
      dir: built.dir ?? [1, 0.6, 1], fov: cam.fov, aspect: cam.aspect, pad: built.pad ?? 1.08,
    });
    cam.position.fromArray(fit.position);
    cam.up.fromArray(fit.up);
    cam.near = fit.near;
    cam.far = fit.far;
    cam.lookAt(new THREE.Vector3().fromArray(fit.target));
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld(true);
    // Lumière principale de face, en haut à gauche de l'image (pareil quelle que soit la direction de vue).
    const { d, r, u } = viewBasis(built.dir ?? [1, 0.6, 1]);
    const L = norm([d[0] * 0.75 - r[0] * 0.55 + u[0] * 1.1, d[1] * 0.75 - r[1] * 0.55 + u[1] * 1.1, d[2] * 0.75 - r[2] * 0.55 + u[2] * 1.1]);
    const t = fit.target;
    this.key.position.set(t[0] + L[0] * fit.distance, t[1] + L[1] * fit.distance, t[2] + L[2] * fit.distance);
    this.key.target.position.fromArray(t);
    this.key.target.updateMatrixWorld();
    this.key.intensity = built.light ?? 1.9;
    // Ombre douce sous l'objet (sauf s'il flotte : objet posé sur un support qui a son propre pied).
    const ground = built.ground ?? box.min.y;
    const sh = this.shadow;
    sh.visible = built.shadow !== false;
    if (sh.visible) {
      const sx = (box.max.x - box.min.x) * (built.shadowScale ?? 1.25);
      const sz = (box.max.z - box.min.z) * (built.shadowScale ?? 1.25);
      sh.scale.set(Math.max(sx, 0.05), 1, Math.max(sz, 0.05));
      sh.position.set((box.min.x + box.max.x) / 2, ground + 0.002 * fit.distance, (box.min.z + box.max.z) / 2);
    }
  }

  /** Ne recompile pas ce programme de shader à chaque vignette : on le garde (nombre limité de variantes). */
  anchor(m) {
    try {
      const prog = this.renderer.properties.get(m)?.currentProgram;
      if (prog && !this.anchored.has(prog)) {
        prog.usedTimes += 1;
        this.anchored.add(prog);
      }
    } catch {
      /* moteur sans ces détails : tant pis */
    }
  }

  /**
   * Attend son tour : le rythme (Pacer), puis une image d'animation « calme » (la précédente n'était pas en
   * retard : le jeu n'a pas déjà dépassé son budget), et l'on travaille juste après cette image (postTask),
   * pas dedans : le jeu a devant lui tout le temps jusqu'à l'image suivante. Au plus 6 images d'attente.
   */
  async slot() {
    let t = now();
    while (!this.pacer.ready(t)) {
      await sleep(Math.min(100, this.pacer.wait(t)));
      t = now();
    }
    this.startTicker();
    for (let i = 0; i < 6; i++) {
      await nextFrame();
      if (calmFrame(this.frameGap, this.usualGap)) break;
    }
    await new Promise((resolve) => postTask(resolve));
  }

  /** Fabrique la vignette d'une demande de la file (genre enregistré), la met en cache. */
  async run(key, spec) {
    const make = this.kinds.get(spec.kind);
    if (!make) throw new Error(`genre inconnu : ${spec.kind}`);
    const [W, H] = outputSize(spec.w, spec.h);
    // Le studio (la toute première fois : l'éclairage) a son image d'animation, la fabrication du modèle la sienne.
    if (!this.scene || !this.envRT) {
      await this.slot();
      const t0 = now();
      this.setup();
      this.pacer.done(now(), now() - t0);
    }
    await this.slot();
    if (!this.enabled) throw new Error('contexte perdu');
    const t = now();
    this.setup();
    const built = make(spec, { W, H });
    if (!built?.object) throw new Error('rien à photographier');
    const out = await this.shoot(built, W, H, now() - t);
    if (!out) return null;
    this.store(key, thumbKey({ ...spec, w: undefined, h: undefined }), out.url, out.bytes, [W, H]);
    out.m.key = key;
    this.record(out.m);
    return out.url;
  }

  /** Garde l'image en cache, rangée dans sa famille (le même objet à d'autres tailles). */
  store(key, fam, url, bytes, size) {
    this.cache.set(key, url, bytes);
    this.live.add(url);
    this.familyOf.set(key, fam);
    if (!this.family.has(fam)) this.family.set(fam, new Map());
    this.family.get(fam).set(key, { key, size, url });
  }

  /**
   * Photo immédiate (essayage d'un équipement sur un de nos animaux) : même studio, pas de cache.
   * prepare() est appelé juste avant la photo et renvoie ce qu'une fabrique renvoie
   * ({ object, box, dir, restore, keep, dispose… }) ; dispose remet tout en place juste après le rendu.
   * Renvoie une promesse de l'URL (null si impossible).
   */
  async capture(prepare, { w = 360, h = 250 } = {}) {
    if (!this.enabled) return null;
    // (une photo à la fois : on attend la fin de la vignette en cours)
    while (this.busy) await sleep(30);
    this.busy = true;
    try {
      this.setup();
      const [W, H] = outputSize(w, h);
      const built = typeof prepare === 'function' ? prepare() : prepare;
      if (!built?.object) return null;
      const out = await this.shoot(built, W, H, 0, true);
      if (!out) return null;
      out.m.key = 'essayage';
      this.record(out.m);
      return out.url;
    } catch (err) {
      if (this.debug) console.warn('[thumbs] photo impossible', err);
      return null;
    } finally {
      this.busy = false;
      if (this.queue.size) this.schedule();
      else this.restSoon();
    }
  }

  /**
   * Compile les shaders et envoie les textures de l'objet avant le rendu. Si le navigateur compile en
   * parallèle (KHR_parallel_shader_compile), on attend sans bloquer ; sinon, un matériau à la fois, et on
   * rend la main au jeu dès qu'une étape a pris plus de quelques millisecondes (rien si immediate).
   * Renvoie le temps passé sur le fil principal (ms).
   */
  async prepareGPU(object, immediate = false) {
    const r = this.renderer;
    let busy = 0;
    const step = async (fn) => {
      const prev = r.getRenderTarget();
      const t = now();
      try {
        r.setRenderTarget(this.sceneRT);
        fn();
      } finally {
        r.setRenderTarget(prev);
      }
      const dt = now() - t;
      busy += dt;
      if (!immediate && dt > 6) {
        this.pacer.done(now(), dt);
        await this.slot();
      }
    };
    if (!immediate && r.compileAsync && r.extensions?.has?.('KHR_parallel_shader_compile')) {
      let p = null;
      await step(() => {
        p = r.compileAsync(object, this.camera, this.scene);
      });
      await p;
    } else if (r.compile) {
      // Un maillage par matériau suffit (les programmes sont partagés).
      const byMat = new Map();
      object.traverse((o) => {
        if (!(o.isMesh || o.isLine || o.isPoints) || !o.visible) return;
        for (const mm of Array.isArray(o.material) ? o.material : [o.material]) if (mm && !byMat.has(mm)) byMat.set(mm, o);
      });
      // Le pilote finit souvent d'assembler un shader seulement à sa première utilisation : on la provoque ici
      // (lecture de ses variables), un shader par étape, plutôt que tous d'un coup au moment du rendu.
      const link = (mats) => {
        for (const mm of mats) {
          try {
            r.properties.get(mm)?.currentProgram?.getUniforms?.();
          } catch {
            /* moteur sans ces détails : le rendu s'en chargera */
          }
        }
      };
      for (const mesh of new Set(byMat.values())) {
        await step(() => {
          r.compile(mesh, this.camera, this.scene);
          link(Array.isArray(mesh.material) ? mesh.material : [mesh.material]);
        });
      }
    }
    if (r.initTexture) {
      const texs = new Set();
      object.traverse((o) => {
        for (const mm of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
          for (const slot of TEX_SLOTS) if (mm[slot]?.isTexture && !mm[slot].isRenderTargetTexture) texs.add(mm[slot]);
        }
      });
      for (const tex of texs) await step(() => r.initTexture(tex));
    }
    return busy;
  }

  /**
   * Prise de vue : cadrage, compilation des shaders, rendu, lecture des pixels et encodage.
   * Chaque étape lourde a sa propre image d'animation (now : tout de suite, pour l'essayage).
   * Renvoie { url, bytes, m } (m : les mesures en ms).
   */
  async shoot(built, W, H, buildMs = 0, immediate = false) {
    const r = this.renderer;
    const m = { key: '', build: buildMs, compile: 0, render: 0, read: 0, encode: 0, cpu: 0, wall: 0, bytes: 0, size: `${W}×${H}` };
    const t0 = now() - buildMs;
    const parent = built.object.parent;
    let placed = false;
    const unplace = () => {
      if (!placed) return;
      placed = false;
      this.scene.remove(built.object);
      if (parent && built.restore) parent.add(built.object);
      this.cleanup(built);
    };
    try {
      // 1. Cadrage.
      let t = now();
      this.scene.add(built.object);
      placed = true;
      this.frame(built, W, H);
      this.targets(W, H);
      m.build += now() - t;
      this.pacer.done(now(), m.build);
      // Shaders et textures préparés à l'avance, avec la même cible que le rendu (les shaders d'une cible
      // de rendu ne sont pas ceux de l'écran) : chaque nouveau shader ou grosse texture a son image d'animation.
      m.compile = await this.prepareGPU(built.object, immediate);

      // 2. Le rendu (une autre image d'animation, à son tour).
      if (!immediate) await this.slot();
      if (!this.enabled) throw new Error('contexte perdu');
      t = now();
      this.targets(W, H); // (une autre taille a pu passer entre-temps)
      const prevTarget = r.getRenderTarget();
      const prevColor = r.getClearColor(new THREE.Color());
      const prevAlpha = r.getClearAlpha();
      const prevAuto = r.autoClear;
      const pixels = new Uint8Array(W * H * 4);
      let read;
      try {
        r.autoClear = true;
        r.setClearColor(0x000000, 0);
        r.setRenderTarget(this.sceneRT);
        r.clear(true, true, false);
        r.render(this.scene, this.camera);
        r.setRenderTarget(this.outRT);
        r.render(this.quadScene, this.quadCam);
        // Lecture sans bloquer (tampon PBO + barrière) si possible.
        read = r.readRenderTargetPixelsAsync
          ? r.readRenderTargetPixelsAsync(this.outRT, 0, 0, W, H, pixels)
          : Promise.resolve(r.readRenderTargetPixels(this.outRT, 0, 0, W, H, pixels));
      } finally {
        r.setRenderTarget(prevTarget);
        r.setClearColor(prevColor, prevAlpha);
        r.autoClear = prevAuto;
        unplace(); // les géométries et matériaux sont libérés tout de suite
      }
      m.render = now() - t;
      this.pacer.done(now(), m.render);

      // 3. Les pixels, puis l'image (l'encodage se fait hors du fil principal quand le navigateur le permet).
      t = now();
      await read;
      m.read = now() - t;
      t = now();
      const blob = await this.encode(pixels, W, H);
      m.encode = now() - t;
      if (!blob) return null;
      m.bytes = blob.size;
      m.cpu = m.build + m.compile + m.render;
      m.wall = now() - t0;
      return { url: URL.createObjectURL(blob), bytes: blob.size, m };
    } finally {
      unplace();
    }
  }

  /** Libère le modèle photographié (sauf s'il est gardé sous la main, ex. le cheval mannequin). */
  cleanup(built) {
    if (built.cleaned) return;
    built.cleaned = true;
    const onMat = (mm) => this.anchor(mm);
    if (built.dispose) built.dispose(onMat);
    else if (!built.keep) disposeDeep(built.object, onMat);
  }

  /**
   * Pixels (bas en haut) → image WebP (PNG si le navigateur ne sait pas l'écrire).
   * OffscreenCanvas d'abord : son encodage ne dépend pas des moments où le fil principal est libre
   * (le toBlob de Chrome attend, lui, que le jeu laisse un temps mort).
   */
  async encode(pixels, W, H) {
    const flip = (img) => {
      const row = W * 4;
      for (let y = 0; y < H; y++) img.data.set(pixels.subarray((H - 1 - y) * row, (H - y) * row), y * row);
      return img;
    };
    if (typeof OffscreenCanvas === 'function') {
      try {
        if (!this.offscreen || this.offscreen.width !== W || this.offscreen.height !== H) this.offscreen = new OffscreenCanvas(W, H);
        const ctx = this.offscreen.getContext('2d', { willReadFrequently: true }); // (toile en mémoire, pas sur la carte graphique)
        ctx.putImageData(flip(ctx.createImageData(W, H)), 0, 0);
        return await this.offscreen.convertToBlob({ type: 'image/webp', quality: 0.9 });
      } catch {
        this.offscreen = null; // (repli sur une toile ordinaire)
      }
    }
    const c = this.canvas;
    if (c.width !== W) c.width = W;
    if (c.height !== H) c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.putImageData(flip(ctx.createImageData(W, H)), 0, 0);
    return new Promise((resolve) => {
      try {
        c.toBlob((b) => resolve(b), 'image/webp', 0.9);
      } catch {
        resolve(null);
      }
    });
  }

  record(m) {
    const T = this.totals;
    T.made += 1;
    T.cpuMs += m.cpu;
    T.maxCpuMs = Math.max(T.maxCpuMs, m.cpu);
    T.wallMs += m.wall;
    this.log.push(m);
    if (this.log.length > 60) this.log.shift();
    if (this.debug) {
      const mem = this.renderer?.info?.memory ?? {};
      const f = (v) => v.toFixed(1);
      console.log(`[thumbs] ${m.key} build=${f(m.build)} compile=${f(m.compile)} render=${f(m.render)} read=${f(m.read)} encode=${f(m.encode)} cpu=${f(m.cpu)} total=${f(m.wall)}ms ${(m.bytes / 1024).toFixed(1)}Ko · cache ${this.cache.size} (${(this.cache.bytes / 1024).toFixed(0)}Ko) · GPU géo ${mem.geometries} tex ${mem.textures}`);
    }
  }

  /** Mesures : nombre, temps (ms), mémoire (cache d'images, objets sur la carte graphique). */
  stats() {
    const T = this.totals;
    const mem = this.renderer?.info?.memory ?? {};
    return {
      enabled: this.enabled,
      made: T.made,
      failed: T.failed,
      avgCpuMs: T.made ? T.cpuMs / T.made : 0,
      maxCpuMs: T.maxCpuMs,
      avgWallMs: T.made ? T.wallMs / T.made : 0,
      queued: this.queue.size,
      waiting: this.waiting.size,
      cacheCount: this.cache.size,
      cacheBytes: this.cache.bytes,
      gpuGeometries: mem.geometries ?? 0,
      gpuTextures: mem.textures ?? 0,
      programs: this.renderer?.info?.programs?.length ?? 0,
      targets: [this.sceneRT && `${this.sceneRT.width}×${this.sceneRT.height}`, this.outRT && `${this.outRT.width}×${this.outRT.height}`].filter(Boolean),
      last: this.log.slice(-8),
    };
  }
}

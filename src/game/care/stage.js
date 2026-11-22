// Scène de soin en 3D : quand un mini-jeu de soin s'ouvre, on voit le VRAI animal du joueur (même race, robe,
// âge, crins, équipement), construit avec les constructeurs du jeu, dans un décor crédible (le box de l'écurie
// pour le cheval : src/game/care/stall.js), cadré selon le soin, et vivant (il respire, bouge les oreilles,
// chasse les mouches avec la queue, tourne la tête vers ce qu'on lui apporte, mange vraiment).
//
// - UN rendu WebGL en plus, le temps du mini-jeu (sa propre toile, sous la toile 2D du cadre qui garde les
//   effets et les petits dessins par-dessus) ; le rendu du jeu, caché derrière, est mis en pause (ui.vxCover) ;
//   tout est libéré à la fermeture (dispose) : géométries et matières à nous, cibles de rendu, contexte WebGL,
//   et les écouteurs « dispose » que ce rendu a posés sur les ressources partagées du jeu (géométries de la
//   race, textures du GLB : voir trackListeners), sinon chaque ouverture laisserait un rendu mort en mémoire ;
// - le doigt : lancer de rayon sur l'animal (pick) à travers une copie figée de sa pose (pickProxy, refaite
//   quand il bouge), et sur les accessoires ; projection d'un point 3D dans l'espace 400 × 360 du cadre
//   (project) pour poser un effet, une bulle, une cible au bon endroit ;
// - la caméra : des cadrages (frame) calculés sur les repères du modèle (tête, garrot, croupe, sabots…) avec le
//   cadrage automatique des vignettes (thumbs.js fitView), et des fondus doux de l'un à l'autre.
//
// Pas de DOM ici hormis la toile : le cadre des mini-jeux (src/ui/minigames.js) la pose dans la scène.

import * as THREE from 'three';
import { fitView as fitCamera } from '../thumbs.js';
import { buildAnimalModel, disposeModel } from '../models/animalModel.js';
import { buildGltfAnimal } from '../models/gltfAnimal.js';
import { buildGear, removeGear } from '../gearModels.js';
import { stageLook, growthScale } from '../../sim/animal.js';
import { gfx } from '../gfx.js';

// ---------------------------------------------------------------- logique pure (tests/care3d.test.js)

// (quand ouvrir la scène : src/game/care/which.js, dans le jeu dès le départ ; redit ici pour les tests)
export { care3dSetting, CARE3D_SPECIES, care3dPossible } from './which.js';

/** Point (x, y) de l'espace du cadre (400 × 360, vue view) → coordonnées normalisées de la toile (-1 à 1). */
export function virtualToNdc(x, y, view, w, h) {
  const px = x * view.scale + view.ox;
  const py = y * view.scale + view.oy;
  return { x: (px / Math.max(1, w)) * 2 - 1, y: -((py / Math.max(1, h)) * 2 - 1) };
}

/** Coordonnées normalisées (-1 à 1) → point de l'espace du cadre. */
export function ndcToVirtual(nx, ny, view, w, h) {
  const px = (nx * 0.5 + 0.5) * w;
  const py = (-ny * 0.5 + 0.5) * h;
  return { x: (px - view.ox) / view.scale, y: (py - view.oy) / view.scale };
}

/** Lissage exponentiel indépendant de l'image : part du chemin faite en dt pour une demi-vie de half secondes. */
export const ease = (dt, half) => 1 - Math.pow(0.5, dt / Math.max(1e-4, half));

/** Angle borné et lissé vers target (rad). */
export function approachAngle(cur, target, dt, half = 0.25, max = Math.PI) {
  const t = Math.max(-max, Math.min(max, target));
  return cur + (t - cur) * ease(dt, half);
}

// ---------------------------------------------------------------- écouteurs posés sur les ressources partagées

/**
 * Pendant fn(), note chaque écouteur « dispose » ajouté (par le rendu de la scène de soin : géométries,
 * textures, matières, cibles). Le rendu du jeu n'en ajoute pas en même temps (tout est synchrone).
 */
function trackListeners(list, fn) {
  const proto = THREE.EventDispatcher.prototype;
  const orig = proto.addEventListener;
  proto.addEventListener = function add(type, listener) {
    if (type === 'dispose') list.push([this, listener]);
    return orig.call(this, type, listener);
  };
  try {
    return fn();
  } finally {
    proto.addEventListener = orig;
  }
}

// ---------------------------------------------------------------- l'animal

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const AXIS_Y = new THREE.Vector3(0, 1, 0);

/**
 * Un double de l'animal (comme photoDouble des vignettes, mais en pleine finesse) : même espèce, race, robe, âge,
 * taille et équipement que lui. Renvoie { holder, model, gear, scale, dispose }.
 */
export function buildDouble(a, entity = null, built = null) {
  const look = stageLook(a);
  // (built : modèle déjà construit, pour les tests sans navigateur)
  const model = built ?? buildGltfAnimal(a.species, look) ?? buildAnimalModel(a.species, look, a.breed);
  // (l'ombre de contact au sol du modèle : la scène a de vraies ombres)
  model.root.traverse((o) => {
    if (o.isMesh && o.parent === model.root && o.material?.depthWrite === false) o.visible = false;
  });
  model.setLod?.(0);
  // (les ombres des sabots peintes sous lui, en qualité basse : ici il y a de vraies ombres)
  const soles = model.root.getObjectByName?.('soleShadows');
  if (soles) soles.visible = false;
  const holder = new THREE.Group();
  holder.add(model.root);
  const scale = entity?.scale ?? (a.look?.scale ?? 1) * growthScale(a);
  holder.scale.setScalar(scale);
  let gear = null;
  try {
    gear = buildGear(model, a.look, a.gear ?? {});
  } catch {
    gear = null; // (un équipement qui ne se pose pas : l'animal sans, plutôt qu'aucune scène)
  }
  return {
    holder,
    model,
    gear,
    scale,
    dispose() {
      if (gear) removeGear(gear);
      model.dispose?.();
      disposeModel(model.root);
    },
  };
}

// ---------------------------------------------------------------- copie figée de la pose (lancer de rayon)

/**
 * Lancer de rayon sur un animal lié à un squelette : three.js déforme chaque sommet de chaque triangle testé à
 * chaque rayon (des millisecondes par rayon sur un cheval). Ici, une copie figée de la pose (positions déformées
 * une fois, repère monde), refaite au plus toutes les `every` secondes quand on la demande, avec l'index réduit
 * (LOD) s'il y en a un. Chaque triangle garde son os principal (région du corps).
 */
class PickProxy {
  /** meshes : maillages de l'animal ; index : (maillage) → index à utiliser (réduit), ou celui de sa géométrie. */
  constructor(meshes, index = null) {
    this.meshes = meshes.filter((m) => m.isSkinnedMesh || m.isMesh);
    this.index = index;
    this.geo = new THREE.BufferGeometry();
    this.mesh = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    this.mesh.matrixAutoUpdate = false;
    this.bones = []; // par sommet gardé : os principal (indice dans skeleton.bones)
    this.skeleton = null;
    this.at = -Infinity;
    this.ray = new THREE.Raycaster();
    this.parts = null; // par maillage : sommets utiles et index renuméroté (calculés une fois)
  }

  /** Une fois : pour chaque maillage, les sommets que l'index utilise, et l'index renuméroté sur eux. */
  prepare() {
    let base = 0;
    const idx = [];
    const bone = [];
    this.parts = this.meshes.map((m) => {
      const g = m.geometry;
      const p = g.attributes.position;
      const index = this.index?.(m) ?? g.index;
      const used = new Map();
      const list = [];
      const n = index ? index.count : p.count;
      for (let i = 0; i < n; i++) {
        const v = index ? index.getX(i) : i;
        let k = used.get(v);
        if (k === undefined) {
          k = list.length;
          used.set(v, k);
          list.push(v);
        }
        idx.push(base + k);
      }
      const si = g.attributes.skinIndex;
      const sw = g.attributes.skinWeight;
      for (const v of list) {
        let b = -1;
        if (si && sw) {
          let best = -1;
          for (let k = 0; k < 4; k++) {
            const wk = sw.getComponent(v, k);
            if (wk > best) {
              best = wk;
              b = si.getComponent(v, k);
            }
          }
        }
        bone.push(b);
      }
      if (m.isSkinnedMesh) this.skeleton ??= m.skeleton;
      base += list.length;
      return { m, list };
    });
    this.pos = new Float32Array(base * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setIndex(idx);
    this.bones = bone;
  }

  bake() {
    if (!this.parts) this.prepare();
    let o = 0;
    for (const { m, list } of this.parts) {
      const p = m.geometry.attributes.position;
      m.updateWorldMatrix(true, false);
      for (const v of list) {
        _v.fromBufferAttribute(p, v);
        if (m.isSkinnedMesh) m.applyBoneTransform(v, _v);
        _v.applyMatrix4(m.matrixWorld);
        this.pos[o++] = _v.x;
        this.pos[o++] = _v.y;
        this.pos[o++] = _v.z;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeBoundingSphere();
    this.geo.computeBoundingBox();
  }

  /** Premier point touché par le rayon (ray : THREE.Ray, repère monde), ou null. */
  hit(ray, time, every = 0.3) {
    if (time - this.at > every) {
      this.at = time;
      this.bake();
    }
    this.ray.ray.copy(ray);
    const hits = this.ray.intersectObject(this.mesh, false);
    const h = hits[0];
    if (!h) return null;
    return this.wrap(h, ray);
  }

  /** Un point touché : os principal du triangle, normale tournée vers le rayon (l'ordre des sommets peut varier). */
  wrap(h, ray) {
    const b = this.bones[h.face.a];
    const boneObj = this.skeleton && b >= 0 ? this.skeleton.bones[b] : null;
    const normal = h.face.normal.clone();
    if (normal.dot(ray.direction) > 0) normal.negate();
    return { point: h.point.clone(), normal, distance: h.distance, bone: boneObj, boneName: boneObj?.name ?? '' };
  }

  /** Tous les points touchés, du plus proche au plus loin (même forme que hit). */
  hitAll(ray) {
    if (!this.parts) this.bake();
    this.ray.ray.copy(ray);
    return this.ray.intersectObject(this.mesh, false).map((h) => this.wrap(h, ray));
  }

  dispose() {
    this.geo.dispose();
    this.mesh.material.dispose();
  }
}

// ---------------------------------------------------------------- la scène

const FOV = 38;

/**
 * La scène de soin. o : { game, a, entity, set(stage) → décor ({ group, anchors, update(dt, stage), dispose }),
 * pixelRatio }. Lève une erreur si WebGL manque (le cadre retombe alors sur le mini-jeu dessiné).
 * Tests sans navigateur : o.renderer (un faux rendu : headlessRenderer) et o.model (le modèle déjà construit) ; la
 * scène est alors complète (vrai modèle, décor, caméra, doigt, projection) mais rien n'est peint.
 */
export class CareStage {
  constructor(o) {
    this.game = o.game ?? null;
    this.a = o.a;
    this.time = 0;
    this.listeners = [];
    this.disposables = [];
    this.high = gfx.quality === 'high';
    this.headless = !!o.renderer?.headless;
    const canvas = o.renderer?.domElement ?? document.createElement('canvas');
    canvas.className = 'mg-3d';
    this.canvas = canvas;
    let renderer = o.renderer ?? null;
    // Même budget que le rendu du jeu sur cet appareil (src/game/pixelBudget.js : définition, anticrénelage) : la
    // scène est plus petite que l'écran, elle coûte donc moins qu'une image du jeu.
    const gameRenderer = this.game?.renderer ?? null;
    const msaa = gameRenderer ? !!gfx.msaa || this.high : true;
    if (!renderer) {
      trackListeners(this.listeners, () => {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: msaa, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: false });
      });
    }
    if (!renderer.getContext()) throw new Error('webgl');
    this.renderer = renderer;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.pixelRatio = o.pixelRatio ?? Math.min(dpr, 2, Math.max(1, gameRenderer?.getPixelRatio?.() ?? (this.high ? 2 : 1.5)));
    renderer.setPixelRatio(this.pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = this.high ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    // Contexte WebGL perdu (téléphone en arrière-plan, mémoire pleine) : le jeu attend (le cadre montre l'emoji) ;
    // rendu : on reprend (voir restore). Le cadre retombe sur le jeu dessiné s'il ne revient pas (lostFor).
    this.lost = false;
    this.lostFor = 0;
    this.onLost = (e) => {
      e.preventDefault();
      this.lost = true;
      this.lostFor = 0;
      canvas.classList?.remove?.('ready');
    };
    this.onRestored = () => this.restore();
    canvas.addEventListener?.('webglcontextlost', this.onLost);
    canvas.addEventListener?.('webglcontextrestored', this.onRestored);

    this.timing = {};
    try {
      this.build(o);
    } catch (e) {
      this.dispose();
      throw e;
    }
  }

  /** La scène, l'animal, le décor (voir le constructeur). */
  build(o) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.05, 60);
    this.camPos = new THREE.Vector3(0, 1.6, 4);
    this.camTarget = new THREE.Vector3(0, 1, 0);
    this.camGoal = null; // { position, target } visé (fondu)
    this.camHalf = 0.35;
    this.shake = 0;

    // L'animal, puis le décor autour de lui (le décor a besoin de sa taille : mangeoire à hauteur de bouche…).
    const t0 = performance.now();
    this.double = buildDouble(o.a, o.entity ?? null, o.model ?? null);
    this.timing.animal = Math.round(performance.now() - t0);
    this.model = this.double.model;
    this.holder = this.double.holder;
    // (les matières de l'animal et de son équipement : peut-être celles du jeu, on n'y touche pas, voir unify)
    this.foreign = new Set();
    this.holder.traverse((o) => {
      for (const m of [].concat(o.material ?? [])) this.foreign.add(m);
    });
    this.holder.rotation.y = Math.PI / 2; // (il regarde vers +x : vu de profil, tête à droite, comme les jeux dessinés)
    this.scene.add(this.holder);
    this.holder.traverse((m) => {
      if (m.isMesh) {
        m.castShadow = m.castShadow !== false;
        m.receiveShadow = true;
      }
    });
    // État de l'animal, lu à chaque image (les jeux l'écrivent) : voir life().
    this.st = { v: 0, moving: false, sleeping: false, sad: false, graze: 0, feeder: 0, turn: 0, fat: 1, ears: null, near: true };
    this.mood = { look: null, lookAmt: 0, feeder: 0, chew: 0, ears: null, nod: 0, nuzzle: 0, lift: null, liftAmt: 0, happy: 0, annoyed: 0 };
    this.yaw = 0;
    this.pitch = 0;
    const w = a0(o.a?.weight);
    this.st.fat = 1 + (w - 50) / 50 * 0.18;
    this.measure();

    const t1 = performance.now();
    this.decor = o.set ? o.set(this) : null;
    this.timing.decor = Math.round(performance.now() - t1);
    if (this.decor?.group) this.scene.add(this.decor.group);
    this.pickables = [];
    // (le pelage seul, avec l'index réduit du modèle s'il en a un : deux fois moins de triangles à tester)
    let lodIndex = null;
    if (this.model.coatMesh && this.model.setLod) {
      this.model.setLod(1);
      lodIndex = this.model.coatMesh.geometry.index;
      this.model.setLod(0);
    }
    this.proxy = new PickProxy(this.model.coatMesh ? [this.model.coatMesh] : collectMeshes(this.model.root), lodIndex ? () => lodIndex : null);
    this.raycaster = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
    this.size = { w: 1, h: 1 };
    this.view = { scale: 1, ox: 0, oy: 0 };
    this.fx = []; // petites choses 3D qui vivent un instant (souffle, brins…), voir puff()
    this.ready = false;
  }

  /** fn() avec le rendu de la scène : les écouteurs « dispose » qu'il pose sont notés (voir trackListeners). */
  track(fn) {
    return trackListeners(this.listeners, fn);
  }

  /**
   * Le contexte WebGL est revenu : three.js a tout remis à neuf (ressources renvoyées à la carte graphique à la
   * prochaine image). Les écouteurs « dispose » posés du temps de l'ancien contexte visent des objets WebGL morts :
   * retirés (sinon 256 avertissements à la fermeture). Le décor refait son environnement (une image rendue), puis la
   * scène se prépare à nouveau, comme à l'ouverture.
   */
  restore() {
    if (this.disposed) return;
    for (const [obj, fn] of this.listeners) obj.removeEventListener('dispose', fn);
    this.listeners = [];
    this.decor?.restore?.(this);
    this.lost = false;
    this.lostFor = 0;
    this.ready = false;
    this.restored = (this.restored ?? 0) + 1;
    return this.warm().then(() => {
      if (!this.disposed && !this.lost) this.canvas.classList?.add?.('ready');
    });
  }

  /** Repères du modèle au repos (pose de photo) : bouche, oreilles, garrot, croupe, sabots… (repère monde). */
  measure() {
    const md = this.model;
    md.photoPose?.();
    this.holder.updateMatrixWorld(true);
    const L = {};
    const at = (obj, x = 0, y = 0, z = 0) => obj ? obj.localToWorld(new THREE.Vector3(x, y, z)) : null;
    const snout = md.dims?.snoutZ ?? 0.5;
    L.muzzle = md.head ? at(md.head, 0, -0.12 * snout, snout * 0.97) : at(md.root, 0, 1.2, 1.2);
    L.head = md.head ? at(md.head, 0, -0.05, snout * 0.45) : L.muzzle;
    L.poll = md.head ? at(md.head) : L.head;
    L.ears = (md.ears ?? []).map((e) => at(e, 0, 0.12, 0));
    L.neck = md.neck ? at(md.neck) : L.head;
    L.withers = md.neck ? at(md.neck, 0, 0.12, -0.1) : at(md.root, 0, 1.4, 0.4);
    L.tail = md.tail ? at(md.tail) : at(md.root, 0, 1.2, -1);
    L.tailTip = md.tailTip ? at(md.tailTip, 0, -0.6, 0) : L.tail;
    L.hooves = (md.legs ?? []).map((l) => this.holder.localToWorld(l.hoof.clone()));
    L.body = md.body ? at(md.body, 0, md.y0 ?? 1, 0) : at(md.root, 0, 1, 0);
    L.belly = md.body ? at(md.body, 0, (md.y0 ?? 1) - (md.dims?.R ?? 0.35), 0) : L.body;
    L.back = md.backTop ? this.holder.localToWorld(new THREE.Vector3(0, md.backTop(-0.1), -0.1)) : L.body;
    L.croup = md.backTop ? this.holder.localToWorld(new THREE.Vector3(0, md.backTop(-0.55), -0.55)) : L.tail;
    L.chest = md.legs?.[0] ? this.holder.localToWorld(new THREE.Vector3(0, md.legTop ?? 1, (md.legs[0].kneeRest?.z ?? 0.5) + 0.12)) : L.body;
    this.marks = L;
    this.box = new THREE.Box3().setFromObject(this.holder);
  }

  /**
   * Où est sa bouche quand il mange à la mangeoire (pose « eat » + tête à la mangeoire, mesurée sur ce gabarit) ?
   * Repère monde ; puis il reprend sa pose debout.
   */
  eatMuzzle() {
    const md = this.model;
    if (!md.anim) return this.marks.muzzle.clone();
    const st = { ...this.st, feeder: 1, graze: 0 };
    for (let i = 0; i < 16; i++) md.anim.update(0.25, st);
    this.holder.updateMatrixWorld(true);
    const p = this.live('muzzle');
    md.photoPose();
    this.holder.updateMatrixWorld(true);
    return p;
  }

  /** Repères dans la pose du moment (la tête bouge) : bouche, tête. */
  live(name) {
    const md = this.model;
    const snout = md.dims?.snoutZ ?? 0.5;
    if (name === 'muzzle' && md.head) return md.head.localToWorld(_w.set(0, -0.12 * snout, snout * 0.97)).clone();
    if (name === 'nose' && md.head) return md.head.localToWorld(_w.set(0, -0.02 * snout, snout * 1.0)).clone();
    if (name === 'head' && md.head) return md.head.localToWorld(_w.set(0, -0.05, snout * 0.45)).clone();
    if (name === 'forehead' && md.head) return md.head.localToWorld(_w.set(0, 0.06, snout * 0.25)).clone();
    return this.marks[name]?.clone?.() ?? null;
  }

  /** Ajoute un objet qu'on peut toucher du doigt (pickHit le renverra avec son nom). */
  pickable(obj, name) {
    obj.userData.pick = name;
    this.pickables.push(obj);
    return obj;
  }

  // ---------------------------------------------------------------- caméra

  /**
   * Cadrage : la caméra va voir ces points (repère monde) depuis la direction dir (vers la caméra), avec la marge
   * pad. o.now : sans fondu. o.half : demi-vie du fondu (s). o.fov.
   */
  frame(points, { dir = [0.4, 0.25, 1], pad = 1.12, now = false, half = 0.45, lift = 0, raise = 0 } = {}) {
    const pts = points.filter(Boolean).map((p) => (p.isVector3 ? p.toArray() : p));
    if (!pts.length) return;
    // (zone libre : la scène doit tenir dans la partie de la toile que la carte de fin laisse voir, voir setFocus)
    const fh = this.focus ? this.focus.bottom - this.focus.top : this.size.h;
    const aspect = this.size.w / Math.max(1, fh);
    const fov = this.focus ? (2 * Math.atan(Math.tan((FOV * Math.PI) / 360) * (fh / this.size.h)) * 180) / Math.PI : FOV;
    const f = fitCamera(pts, { dir, fov, aspect, pad });
    const goal = { position: new THREE.Vector3(...f.position), target: new THREE.Vector3(...f.target) };
    goal.position.y += lift;
    goal.target.y += lift;
    if (raise) goal.target.y -= raise * f.distance * Math.tan((FOV * Math.PI) / 360);
    this.lastFrame = { points: pts, dir, pad, half, lift, raise };
    // (de l'autre côté de l'animal : on coupe, plutôt que de traverser le cheval pendant le fondu)
    const from = _v.copy(this.camPos).sub(this.camTarget);
    const to = _w.copy(goal.position).sub(goal.target);
    const across = from.lengthSq() > 1e-6 && from.normalize().dot(to.normalize()) < -0.05;
    if (now || !this.ready || across) {
      this.camPos.copy(goal.position);
      this.camTarget.copy(goal.target);
      this.camGoal = null;
    } else {
      this.camGoal = goal;
      this.camHalf = half;
    }
  }

  /** La caméra est-elle posée (à moins de eps mètres de son cadrage) ? */
  settled(eps = 0.03) {
    const g = this.camGoal;
    return !g || (this.camPos.distanceTo(g.position) < eps && this.camTarget.distanceTo(g.target) < eps);
  }

  /** Refait le dernier cadrage (la forme de la toile a changé). */
  reframe(now = true) {
    const f = this.lastFrame;
    if (f) this.frame(f.points, { ...f, now });
  }

  /**
   * La partie de la toile qu'on voit encore (px CSS, de top à bottom) : la carte de fin couvre le bas, la scène se
   * recadre en douceur dans le haut (l'animal qui mange, qui boit, qui croque sa friandise reste visible au-dessus
   * de la carte). null : toute la toile. Le centre de l'image glisse au milieu de cette zone (setViewOffset : le
   * doigt et la projection suivent, ils passent par la caméra).
   */
  setFocus(top, bottom) {
    const f = top === null || top === undefined ? null : { top: Math.max(0, top), bottom: Math.min(this.size.h, bottom) };
    if (f && f.bottom - f.top < 80) return;
    const same = (a, b) => (!a && !b) || (a && b && Math.abs(a.top - b.top) < 1 && Math.abs(a.bottom - b.bottom) < 1);
    if (same(f, this.focus)) return;
    this.focus = f;
    this.reframe(false);
  }

  updateCamera(dt) {
    if (this.camGoal) {
      const k = ease(dt, this.camHalf);
      this.camPos.lerp(this.camGoal.position, k);
      this.camTarget.lerp(this.camGoal.target, k);
      if (this.camPos.distanceToSquared(this.camGoal.position) < 1e-6) this.camGoal = null;
    }
    const c = this.camera;
    // (zone libre : le centre de l'image glisse vers son milieu)
    const offGoal = this.focus ? this.size.h / 2 - (this.focus.top + this.focus.bottom) / 2 : 0;
    this.viewY = (this.viewY ?? 0) + (offGoal - (this.viewY ?? 0)) * (dt > 0 ? ease(dt, this.camHalf) : 1);
    if (Math.abs(this.viewY) > 0.5) c.setViewOffset(this.size.w, this.size.h, 0, this.viewY, this.size.w, this.size.h);
    else if (c.view?.enabled) c.clearViewOffset();
    c.position.copy(this.camPos);
    // (respiration de la caméra : à peine, la scène n'est jamais figée)
    c.position.y += Math.sin(this.time * 0.6) * 0.004;
    if (this.shake > 0) {
      c.position.x += (Math.random() - 0.5) * this.shake * 0.02;
      c.position.y += (Math.random() - 0.5) * this.shake * 0.02;
      this.shake = Math.max(0, this.shake - dt * 3);
    }
    c.lookAt(this.camTarget);
    c.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- taille, projection, doigt

  /** Taille de la toile (px CSS, mise en page) et vue du cadre (fitView de frame.js). */
  resize(w, h, view) {
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    this.view = view;
    this.renderer.setSize(this.size.w, this.size.h, false);
    this.camera.aspect = this.size.w / this.size.h;
    if (this.camera.view?.enabled) this.camera.setViewOffset(this.size.w, this.size.h, 0, this.viewY ?? 0, this.size.w, this.size.h);
    this.camera.updateProjectionMatrix();
    this.reframe();
  }

  /** Point 3D (monde) → point de l'espace du cadre ({ x, y, behind }). */
  project(p) {
    _v.copy(p).project(this.camera);
    const q = ndcToVirtual(_v.x, _v.y, this.view, this.size.w, this.size.h);
    q.behind = _v.z > 1;
    return q;
  }

  /** Taille (en unités du cadre) d'un objet de r mètres posé en p. */
  projectRadius(p, r) {
    const d = this.camera.position.distanceTo(p);
    const fovR = (this.camera.fov * Math.PI) / 360;
    const px = (r / (2 * Math.tan(fovR) * Math.max(0.01, d))) * this.size.h;
    return px / this.view.scale;
  }

  /** Rayon (monde) sous un point de l'espace du cadre. */
  rayAt(x, y) {
    const n = virtualToNdc(x, y, this.view, this.size.w, this.size.h);
    this.ndc.set(n.x, n.y);
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray;
  }

  /** Le doigt sur l'animal ? { point, normal, bone, boneName, region } ou null. */
  pickAnimal(x, y) {
    const ray = this.rayAt(x, y);
    const h = this.proxy.hit(ray, this.time);
    if (!h) return null;
    h.region = regionOf(h.boneName);
    return h;
  }

  /** Le doigt sur un accessoire touchable ? Renvoie son nom (pickable) et le point, ou null. */
  pickProp(x, y) {
    if (!this.pickables.length) return null;
    this.rayAt(x, y);
    const hits = this.raycaster.intersectObjects(this.pickables, true);
    for (const h of hits) {
      let o = h.object;
      while (o && !o.userData.pick) o = o.parent;
      if (o && o.visible !== false) return { name: o.userData.pick, point: h.point, object: o };
    }
    return null;
  }

  /** Point sur un plan horizontal à la hauteur y (pour poser un outil sous le doigt hors de l'animal). */
  pointOnPlane(x, y, planeY) {
    const ray = this.rayAt(x, y);
    if (Math.abs(ray.direction.y) < 1e-4) return null;
    const t = (planeY - ray.origin.y) / ray.direction.y;
    return t > 0 ? ray.origin.clone().addScaledVector(ray.direction, t) : null;
  }

  /** Point à la distance d de la caméra sous le doigt. */
  pointAtDepth(x, y, d) {
    const ray = this.rayAt(x, y);
    return ray.origin.clone().addScaledVector(ray.direction, d);
  }

  // ---------------------------------------------------------------- la vie de l'animal

  /**
   * Une image de vie : animation du modèle (allures, repos, broutage, respiration, oreilles, queue), puis ce que
   * le jeu demande (mood) : tourner la tête vers un point, tête à la mangeoire, mâcher, oreilles, hocher, lever un
   * pied.
   */
  life(dt) {
    const md = this.model;
    const m = this.mood;
    const st = this.st;
    // (tête à la mangeoire : lissée par l'animation elle-même)
    st.feeder = m.feeder;
    st.graze = 0;
    st.ears = m.annoyed > 0 ? 'back' : m.ears;
    st.near = true;
    // Pied levé (ou sur le point de l'être) : il se tient carré sur ses trois autres membres, jamais au repos sur un
    // postérieur (le clip « rest » plie un postérieur et déplace tout l'arrière-main : le pied tenu bougeait de 35 cm).
    if (md.anim && (m.square || m.lift !== null)) {
      md.anim.resting = false;
      md.anim.restTimer = Math.max(md.anim.restTimer ?? 0, 2);
    }
    if (md.anim) md.anim.update(dt, st);
    else md.update?.(dt, st);
    if (!md.neck || !md.head) return;
    // Tourner la tête vers ce qu'on lui montre (repère du cheval : +z devant, +x à sa gauche).
    let yawT = 0;
    let pitchT = 0;
    if (m.look && m.lookAmt > 0) {
      const local = this.holder.worldToLocal(_v.copy(m.look));
      const base = this.holder.worldToLocal(md.neck.getWorldPosition(_w));
      const dx = local.x - base.x;
      const dz = local.z - base.z;
      const dy = local.y - base.y;
      yawT = Math.atan2(dx, Math.max(0.2, dz)) * m.lookAmt;
      pitchT = -Math.atan2(dy - 0.35, Math.hypot(dx, dz)) * 0.35 * m.lookAmt;
    }
    this.yaw = approachAngle(this.yaw, yawT, dt, 0.35, 0.75);
    this.pitch = approachAngle(this.pitch, pitchT, dt, 0.4, 0.35);
    if (this.yaw) md.neck.quaternion.premultiply(_q.setFromAxisAngle(AXIS_Y, this.yaw * 0.7));
    if (this.yaw) md.head.quaternion.premultiply(_q.setFromAxisAngle(AXIS_Y, this.yaw * 0.3));
    let pitch = this.pitch;
    // Mâcher (petit mouvement de la tête), hocher de contentement, tendre le nez.
    if (m.chew > 0) pitch += Math.sin(this.time * 9) * 0.025 * m.chew;
    if (m.nod > 0) {
      pitch += Math.sin(this.time * 7) * 0.08 * m.nod;
      m.nod = Math.max(0, m.nod - dt * 0.8);
    }
    if (m.nuzzle > 0) pitch -= 0.12 * m.nuzzle;
    if (pitch) md.neck.rotateX(pitch);
    if (m.chew > 0) md.head.rotateX(Math.sin(this.time * 9 + 1) * 0.03 * m.chew);
    m.annoyed = Math.max(0, m.annoyed - dt);
    // Lever un pied (cure-pied) : le membre se plie (genou ou jarret, boulet), le sabot montre sa sole.
    if (md.legs && m.lift !== null) {
      const l = md.legs[m.lift];
      m.liftAmt = Math.min(m.liftMax ?? 1, m.liftAmt + dt * 1.6);
      if (l) liftLeg(l, smoothstep(m.liftAmt));
    } else if (md.legs && m.liftAmt > 0) {
      m.liftAmt = Math.max(0, m.liftAmt - dt * 2);
      const l = md.legs[m.lastLift ?? 0];
      if (l) liftLeg(l, smoothstep(m.liftAmt));
    }
    if (m.lift !== null) m.lastLift = m.lift;
  }

  /**
   * Le souffle des naseaux : seulement quand il fait froid (en dessous de 8 °C, la buée se voit ; dans un box au
   * chaud, rien), et en voile léger : de petites images douces, blanches, toujours face à nous, qui partent des deux
   * naseaux, s'élargissent et s'effacent vite (avant : une boule grise floue qui flottait).
   */
  puff(at, dir, { n = 4, size = 0.03 } = {}) {
    const temp = this.game?.temperature;
    if (!(Number.isFinite(temp) && temp <= 8)) return false;
    this.puffMap ??= puffTexture();
    const side = new THREE.Vector3(0, 1, 0).cross(dir).normalize().multiplyScalar(0.022 * this.double.scale);
    for (let i = 0; i < n; i++) {
      const mat = new THREE.SpriteMaterial({ map: this.puffMap, color: 0xffffff, transparent: true, opacity: 0, depthWrite: false });
      const s = new THREE.Sprite(mat);
      s.position.copy(at).addScaledVector(side, i % 2 ? 1 : -1);
      const v = dir.clone().multiplyScalar(0.35 + Math.random() * 0.25).add(new THREE.Vector3((Math.random() - 0.5) * 0.06, -0.03 + Math.random() * 0.05, (Math.random() - 0.5) * 0.06));
      this.scene.add(s);
      this.fx.push({ obj: s, v, age: -Math.floor(i / 2) * 0.06, life: 0.7, size, kind: 'puff' });
    }
    return true;
  }

  /** Objet 3D éphémère : il vit life secondes (update(o, k) le fait bouger), puis il est retiré et libéré. */
  spawn(obj, { life = 1, v = null, grav = 0, spin = 0, update = null, fade = true } = {}) {
    this.scene.add(obj);
    this.fx.push({ obj, v: v?.clone?.() ?? null, age: 0, life, grav, spin, update, fade, kind: 'obj' });
    return obj;
  }

  updateFx(dt) {
    for (const f of this.fx) {
      f.age += dt;
      if (f.age < 0) continue;
      const k = f.age / f.life;
      const o = f.obj;
      if (f.kind === 'puff') {
        o.position.addScaledVector(f.v, dt);
        f.v.multiplyScalar(1 - dt * 1.8);
        o.scale.setScalar(f.size * (1 + k * 2.5));
        o.material.opacity = 0.45 * Math.sin(Math.min(1, k) * Math.PI) * (1 - k * 0.5);
      } else {
        if (f.v) {
          f.v.y -= f.grav * dt;
          o.position.addScaledVector(f.v, dt);
        }
        if (f.spin) o.rotation.z += f.spin * dt;
        f.update?.(o, k, dt);
        if (f.fade) o.traverse((m) => {
          if (m.material?.transparent) m.material.opacity = Math.min(m.material.userData.baseOpacity ?? 1, (1 - k) * 3);
        });
      }
    }
    const dead = this.fx.filter((f) => f.age >= f.life);
    if (dead.length) {
      for (const f of dead) {
        f.obj.parent?.remove(f.obj);
        f.obj.traverse((m) => {
          // (pas la géométrie d'une image face à nous : three.js la partage entre toutes, celles du jeu comprises)
          if (m.geometry && !m.isSprite && !m.geometry.userData.shared) m.geometry.dispose();
          if (m.material && !m.material.userData?.shared) m.material.dispose();
        });
      }
      this.fx = this.fx.filter((f) => f.age < f.life);
    }
  }

  // ---------------------------------------------------------------- image

  /**
   * Préparation avant la première image, étalée sur plusieurs images (pendant ce temps, le cadre montre l'emoji qui
   * respire) : shaders de la scène (en parallèle si le navigateur sait), textures envoyées à la carte graphique trois
   * par image, puis les ombres seules (leurs shaders de profondeur), puis la scène est prête. Avant : tout dans la
   * première image (1,4 s d'un coup en SwiftShader).
   */
  /**
   * Moins de programmes à compiler (chacun coûte cher à l'ouverture, surtout sur un téléphone modeste) : les matières
   * du décor et des accessoires sans image reçoivent une image blanche d'un pixel, les objets répétés sans couleur
   * par exemplaire reçoivent du blanc ; ils partagent alors le programme de leurs voisins. (Pas les matières de
   * l'animal ni de son équipement : elles peuvent être celles du jeu ; celles des jeux, posées sur lui, oui.)
   */
  unify() {
    const white = (this.white ??= whiteTexture());
    const c = new THREE.Color(1, 1, 1);
    this.scene.traverse((o) => {
      if ([].concat(o.material ?? []).some((m) => this.foreign.has(m))) return;
      // (la première couleur crée la couleur de tous les exemplaires, blanche)
      if (o.isInstancedMesh && !o.instanceColor && o.instanceMatrix.count > 0) o.setColorAt(0, c);
      if (!o.isMesh) return;
      for (const m of [].concat(o.material)) {
        if (!m || m.map || m.transparent || m.userData.shared) continue;
        if (m.isMeshStandardMaterial || m.isMeshBasicMaterial) {
          m.map = white;
          m.needsUpdate = true;
        }
      }
    });
  }

  async warm() {
    this.updateCamera(0);
    this.unify();
    const t0 = performance.now();
    const frame = () => new Promise((r) => (typeof requestAnimationFrame === 'function' ? requestAnimationFrame(() => r()) : setTimeout(r, 16)));
    // Les shaders : demandés tous ensemble, puis on attend qu'ils soient prêts (en parallèle si le navigateur sait).
    // (Pas renderer.compileAsync : fermé pendant l'attente, sa boucle relisait les matières d'un rendu libéré —
    // TypeError dans un setTimeout.)
    this.track(() => this.renderer.compile(this.scene, this.camera));
    await new Promise((resolve) => {
      const t = performance.now();
      const check = () => {
        if (this.disposed || this.lost || performance.now() - t > 8000) return resolve();
        const progs = this.renderer.info.programs ?? [];
        if (progs.every((p) => !p.isReady || p.isReady())) return resolve();
        setTimeout(check, 10);
      };
      check();
    });
    if (this.disposed) return;
    this.timing.shaders = Math.round(performance.now() - t0);
    const t1 = performance.now();
    const textures = new Set();
    this.scene.traverse((o) => {
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const m of mats) for (const v of Object.values(m)) if (v?.isTexture && !v.isRenderTargetTexture) textures.add(v);
    });
    let n = 0;
    for (const tex of textures) {
      if (this.disposed) return;
      trackListeners(this.listeners, () => this.renderer.initTexture(tex));
      if (++n % 3 === 0) await frame();
    }
    this.timing.textures = Math.round(performance.now() - t1);
    // Des images dans un seul pixel : la carte des ombres (et ses shaders de profondeur) et les géométries envoyées
    // à la carte graphique, sans presque rien peindre ; la vraie première image est alors une image ordinaire. En
    // trois fois (l'animal, puis le décor, puis le reste) : trois images moyennes plutôt qu'une très longue.
    const r = this.renderer;
    const all = [];
    this.scene.traverse((o) => {
      if ((o.isMesh || o.isPoints) && o.visible) all.push(o);
    });
    const inside = (o, root) => {
      for (let p = o; p; p = p.parent) if (p === root) return true;
      return false;
    };
    const steps = [(o) => inside(o, this.holder), (o) => !!this.decor?.group && inside(o, this.decor.group), () => true];
    this.timing.shadows = 0;
    for (let i = 0; i < steps.length; i++) {
      await frame();
      if (this.disposed || this.lost) return;
      const t2 = performance.now();
      for (const o of all) o.visible = steps.slice(0, i + 1).some((f) => f(o));
      r.setScissorTest(true);
      r.setScissor(0, 0, 1, 1);
      r.setViewport(0, 0, 1, 1);
      try {
        trackListeners(this.listeners, () => r.render(this.scene, this.camera));
      } finally {
        for (const o of all) o.visible = true;
        r.setScissorTest(false);
        r.setViewport(0, 0, this.size.w, this.size.h);
      }
      this.timing.shadows += Math.round(performance.now() - t2);
    }
    await frame();
    this.ready = true;
  }

  update(dt) {
    this.time += dt;
    this.life(dt);
    this.decor?.update?.(dt, this);
    this.updateFx(dt);
    this.updateCamera(dt);
  }

  render() {
    if (this.lost || this.disposed) return;
    // Qualité basse : la carte des ombres une image sur deux (l'animal bouge à peine d'une image à l'autre ; c'est
    // une passe de plus sur toute la scène, à chaque image).
    if (!this.high) {
      const sm = this.renderer.shadowMap;
      sm.autoUpdate = false;
      sm.needsUpdate = (this.frames = (this.frames ?? 0) + 1) % 2 === 1;
    }
    const t0 = this.timing.first === undefined ? performance.now() : 0;
    trackListeners(this.listeners, () => this.renderer.render(this.scene, this.camera));
    if (t0) this.timing.first = Math.round(performance.now() - t0);
  }

  /** Mesure pour les planches (mémoire de ce rendu). */
  info() {
    const i = this.renderer.info;
    return { geometries: i.memory.geometries, textures: i.memory.textures, calls: i.render.calls, triangles: i.render.triangles, programs: i.programs?.length ?? 0, timing: { ...this.timing } };
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const f of this.fx ?? []) {
      f.obj.parent?.remove(f.obj);
      f.obj.traverse((m) => {
        if (m.geometry && !m.isSprite && !m.geometry.userData.shared) m.geometry.dispose();
        m.material?.dispose?.();
      });
    }
    this.fx = [];
    this.decor?.dispose?.();
    this.proxy?.dispose();
    if (this.holder) this.scene?.remove(this.holder);
    this.double?.dispose();
    for (const d of this.disposables) d.dispose?.();
    this.white?.dispose();
    this.puffMap?.dispose();
    this.scene?.traverse((o) => {
      if (o.isLight) o.dispose?.();
    });
    this.renderer.renderLists.dispose();
    this.renderer.dispose();
    // (contexte déjà perdu : rien à rendre, et l'extension n'existe plus)
    if (!this.lost) {
      try {
        this.renderer.forceContextLoss();
      } catch {
        /* déjà perdu */
      }
    }
    // Les écouteurs posés par ce rendu sur les ressources partagées du jeu : retirés (voir trackListeners).
    for (const [obj, fn] of this.listeners) obj.removeEventListener('dispose', fn);
    this.listeners = [];
    this.canvas.removeEventListener?.('webglcontextlost', this.onLost);
    this.canvas.removeEventListener?.('webglcontextrestored', this.onRestored);
    this.canvas.remove();
  }
}

/** Une petite buée : un rond blanc très doux (voir puff). */
function puffTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.4)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Une image blanche d'un pixel (voir unify). */
function whiteTexture() {
  const t = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}


const a0 = (v) => (Number.isFinite(v) ? v : 50);
const smoothstep = (k) => k * k * (3 - 2 * k);

function collectMeshes(root) {
  const out = [];
  root.traverse((o) => { if (o.isMesh && o.visible) out.push(o); });
  return out;
}

/** Région du corps d'après l'os (cheval réaliste) : tête, encolure, corps, croupe, membre, queue, crins. */
export function regionOf(bone = '') {
  if (/^Head|^Ear/.test(bone)) return 'head';
  if (/^Mane/.test(bone)) return 'mane';
  if (/^Neck/.test(bone)) return 'neck';
  if (/^Tail/.test(bone)) return 'tail';
  if (/^(F|H)(L|R)[34]$/.test(bone)) return 'leg';
  if (/^(F|H)(L|R)2$/.test(bone)) return /^F/.test(bone) ? 'shoulder' : 'hip';
  if (/^(F|H)(L|R)1$/.test(bone)) return /^F/.test(bone) ? 'shoulder' : 'hip';
  if (/^Ribs|^Spine/.test(bone)) return 'body';
  return bone ? 'body' : '';
}

/**
 * Plie un membre (k : 0 posé, 1 levé) : antérieur, genou vers l'arrière et boulet replié (la sole regarde vers
 * l'arrière et le haut, comme quand on cure un pied) ; postérieur, jarret et boulet pliés vers l'avant.
 */
function liftLeg(l, k) {
  if (!k) return;
  // (le membre s'écarte un peu du corps, comme quand on tient le pied pour le curer : la sole sort de sous le ventre)
  l.top.rotateZ(l.side * 0.3 * k);
  if (l.front) {
    l.pivot.rotateX(-0.3 * k);
    l.knee.rotateX(1.45 * k);
    l.fetlock.rotateX(1.25 * k);
  } else {
    l.pivot.rotateX(-0.45 * k);
    l.knee.rotateX(1.15 * k);
    l.fetlock.rotateX(1.2 * k);
  }
}

/**
 * Un faux rendu pour les tests (pas de WebGL dans node) : la scène se construit, la caméra, le doigt et la projection
 * marchent, rien n'est peint. Il émet les événements de perte et de retour du contexte comme une vraie toile.
 */
export function headlessRenderer() {
  const handlers = {};
  const canvas = {
    className: '',
    classList: { add() {}, remove() {} },
    addEventListener: (type, fn) => { (handlers[type] ??= []).push(fn); },
    removeEventListener: (type, fn) => { handlers[type] = (handlers[type] ?? []).filter((f) => f !== fn); },
    dispatch: (type) => { for (const fn of handlers[type] ?? []) fn({ type, preventDefault() {} }); },
    remove() {},
  };
  const calls = { render: 0, dispose: 0 };
  return {
    headless: true,
    domElement: canvas,
    calls,
    toneMapping: 0,
    toneMappingExposure: 1,
    shadowMap: { enabled: false, type: 0 },
    info: { memory: { geometries: 0, textures: 0 }, render: { calls: 0, triangles: 0 }, programs: [] },
    renderLists: { dispose() {} },
    getContext: () => ({ isContextLost: () => false }),
    getPixelRatio: () => 1,
    setPixelRatio() {},
    setSize() {},
    setScissorTest() {},
    setScissor() {},
    setViewport() {},
    compile: () => new Set(),
    initTexture() {},
    render() { calls.render++; },
    dispose() { calls.dispose++; },
    forceContextLoss() {},
  };
}

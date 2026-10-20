// Concours de beauté en 3D : les tresses, rubans et nœuds visibles sur l'animal, la robe qui brille,
// la pluie qui abîme la préparation, et la présentation dans la carrière devant le juge
// (marcher jusqu'au cercle, s'arrêter au bon moment, rester immobile, tourner, trotter, photo sur le podium).
// Logique pure : src/sim/beauty.js. Interface : src/ui/beauty.js. Branché dans Game.js (game.beauty)
// et dans le registre des séances d'Activities.js (SESSION_TYPES.beauty).

import * as THREE from 'three';
import { Session, SESSION_TYPES } from './Activities.js';
import { toWorld, eligibility, ranking, activityData, addAward } from '../sim/activities.js';
import {
  PREP_ITEMS, RIBBON_COLORS, notePrep, isFresh, isReady, weatherWear, nowHours, presentationSteps, ringWindow, gaugeQuality,
  trotPar, fidgetChance, judgeMarks, beautyData, classOf, classRivals, entryFor, registerBlock, registerEntry, ringBlock,
  markPresented, missedEntries, todaysEntries, isChampion, handlerXp, lowestNeed, showCare,
} from '../sim/beauty.js';
import { canLead } from '../sim/gear.js';
import { addStat, spend } from '../sim/profile.js';
import { addCareerXp, isStarted, RANKS } from '../sim/careers.js';
import { noteClientContest } from '../sim/clients.js';
import { flagPair } from './models/course.js';
import { signTexture } from './textures.js';
import { buildAvatar, animateAvatarWalk, updateAvatarLife, startAvatarGesture } from './models/avatarModel.js';
import { disposeModel } from './models/animalModel.js';
import { judgeLines } from '../ui/beauty.js';
import { t, ta } from '../i18n.js';

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const fwd = (h) => new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
const CARRIED = ['cat', 'rabbit'];
const WET = { rain: 1, storm: 1, snow: 1 };

// ---------------------------------------------------------------- décor sur l'animal (tresses, nœuds, brillant)

/** Résumé de ce qui doit être visible sur l'animal (si ça change, on reconstruit). */
function decorKey(a, now) {
  const p = a.beauty?.prep ?? {};
  const f = (k) => (isFresh(a, k, now) ? `${k}:${p[k]?.color ?? ''}${p[k]?.pattern ?? ''}` : '');
  // (tresses du cheval réaliste : placées autrement sous une couverture)
  const covered = a.species === 'horse' && a.gear?.blanket && f('braid') ? '+c' : '';
  return [f('braid') + covered, f('bow'), f('shine'), f('fluff')].join('|');
}

const mat = (color, roughness = 0.6) => new THREE.MeshStandardMaterial({ color, roughness });

/** Un petit nœud en 3D : deux boucles aplaties, un nœud et deux pans. */
function bowMesh(color, size, pattern = 'plain') {
  const g = new THREE.Group();
  const m = mat(color, 0.5);
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), m);
    loop.scale.set(1.1, 0.65, 0.5);
    loop.position.set(s * size * 0.95, 0, 0);
    loop.rotation.z = s * 0.3;
    g.add(loop);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(size * 0.5, size * 1.4, size * 0.12), m);
    tail.position.set(s * size * 0.4, -size * 0.9, 0);
    tail.rotation.z = s * 0.25;
    g.add(tail);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(size * 0.4, 10, 8), mat(new THREE.Color(color).multiplyScalar(0.7).getHex(), 0.5));
  g.add(knot);
  if (pattern === 'dots') {
    const w = mat(0xffffff, 0.6);
    for (const [x, y] of [[-1.2, 0.15], [-0.7, -0.15], [0.7, 0.15], [1.2, -0.1]]) {
      const d = new THREE.Mesh(new THREE.SphereGeometry(size * 0.12, 6, 5), w);
      d.position.set(x * size, y * size, size * 0.26);
      g.add(d);
    }
  } else if (pattern === 'stripes') {
    const w = mat(0xffffff, 0.6);
    for (const s of [-1, 1]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(size * 0.18, size * 1.1, size * 0.06), w);
      st.position.set(s * size * 0.95, 0, size * 0.27);
      st.rotation.z = s * 0.3;
      g.add(st);
    }
  }
  return g;
}

/** Une tresse : des perles de crins entrelacées de from vers to (repère local du parent). */
function braidMesh(from, to, radius, color) {
  const g = new THREE.Group();
  const m = mat(color, 0.65);
  const n = 4;
  const dir = to.clone().sub(from);
  const side = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i < n; i++) {
    const k = (i + 0.5) / n;
    const b = new THREE.Mesh(new THREE.SphereGeometry(radius, 10, 8), m);
    b.position.copy(from).addScaledVector(dir, k).addScaledVector(side, (i % 2 ? 1 : -1) * radius * 0.45);
    b.scale.set(1, 1.35, 1);
    b.lookAt(b.position.clone().add(dir));
    g.add(b);
  }
  return g;
}

/**
 * Repère de l'encolure, valable pour les deux sortes de modèles : le modèle procédural (groupe « neck »,
 * y vers la tête, crête du côté −z) et le modèle GLB (ancre « neck » posée sur l'os, même convention).
 * Renvoie { len (longueur jusqu'à la tête), down (le bas du monde vu depuis l'encolure) }.
 */
function neckFrame(model, fallbackLen) {
  const neck = model.neck;
  model.root?.updateMatrixWorld?.(true);
  let len = fallbackLen;
  if (model.head) {
    const p = neck.worldToLocal(model.head.getWorldPosition(new THREE.Vector3()));
    const d = p.length();
    if (d > 0.02 && d < 6) len = d;
  }
  const rootQ = model.root?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion();
  const neckQ = neck.getWorldQuaternion(new THREE.Quaternion());
  const rel = rootQ.invert().multiply(neckQ); // encolure dans le repère de l'animal
  const down = new THREE.Vector3(0, -1, 0).applyQuaternion(rel.invert()).normalize();
  return { len, down };
}

/** Les maillages du modèle qu'on peut toucher avec un rayon (corps, encolure, crinière). */
function modelMeshes(model, skip) {
  const list = [];
  model.root?.traverse((o) => {
    if (!o.isMesh || skip.has(o) || o.material?.transparent) return;
    list.push(o);
  });
  return list;
}

const _ray = new THREE.Raycaster();

/**
 * Point de la surface du modèle vu depuis l'extérieur : on lance un rayon depuis `outside` (repère du parent)
 * vers `inside`. Ainsi les tresses se posent sur le dessus de la crinière, quelle que soit la forme du cou
 * (procédural, nouveau cheval, modèle GLB). Renvoie null si le rayon ne touche rien.
 */
function surfaceHit(parent, outside, inside, meshes) {
  if (!meshes.length) return null;
  const o = parent.localToWorld(outside.clone());
  const target = parent.localToWorld(inside.clone());
  const dir = target.sub(o);
  const far = dir.length();
  _ray.set(o, dir.normalize());
  _ray.far = far;
  let hit = null;
  try {
    hit = _ray.intersectObjects(meshes, false)[0] ?? null;
  } catch {
    hit = null;
  }
  return hit ? parent.worldToLocal(hit.point.clone()) : null;
}

const _zAxis = new THREE.Vector3(0, 0, 1);
const _d = new THREE.Vector3();
const _s = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m = new THREE.Matrix4();

/**
 * Tresses du cheval réaliste, aux places mesurées sur ses crins (model.braidSpots, horseReal.js) :
 * tresses « boutons » de concours sur la crête (une boule de crins, un ruban noué autour, un pompon),
 * tresse de queue le long du dessus des crins depuis la croupe, nœud en haut.
 */
function realHorseBraids(model, ribbon, mane, add, covered = false) {
  const S = model.braidSpots;
  // (les mèches de la crinière en cartes de crins rentrent dans les boutons : plus de crinière qui pend dessous)
  model.setBraided?.(true);
  const r = (model.dims?.R ?? 0.32) * 0.085;
  const hairMat = mat(mane, 0.7);
  const ribbonMat = mat(ribbon, 0.5);
  // (sous une couverture, les boutons commencent devant son bord avant : sinon le premier s'y enfonçait)
  const crest = (covered && S.crestCovered) || S.crest;
  if (crest.length && model.neck) {
    const group = new THREE.Group();
    for (const [p, up] of crest) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 9), hairMat);
      // (enfoncé d'un tiers dans la crête : posé dessus, il n'y touchait qu'en un point)
      knob.position.copy(p).addScaledVector(up, r * 0.45);
      knob.quaternion.setFromUnitVectors(_zAxis, up);
      knob.scale.set(1, 1, 0.85); // (un peu aplatie sur la crête)
      group.add(knob);
      const band = new THREE.Mesh(new THREE.TorusGeometry(r * 0.82, r * 0.2, 6, 14), ribbonMat);
      band.position.copy(knob.position).addScaledVector(up, -r * 0.15);
      band.quaternion.copy(knob.quaternion);
      group.add(band);
      const pom = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 10, 8), ribbonMat);
      pom.position.copy(knob.position).addScaledVector(up, r * 0.8);
      group.add(pom);
    }
    // Entre deux boutons, la crinière tressée tendue : un bourrelet bas de crins le long de la crête. Sans lui,
    // des boules posées sur une crête ronde ne la touchaient qu'en un point, avec le ciel tout autour (« des perles
    // qui flottent ») ; de vraies tresses de concours sont reliées par les crins rentrés. Centré sur la peau de la
    // crête à mi-chemin (braidSpots : 3e élément), à 0,2 r au-dessus, enfoncé de 0,25 r.
    const ridge = new THREE.SphereGeometry(1, 12, 6);
    for (let i = 0; i + 1 < crest.length; i++) {
      const [a, up, mid] = crest[i];
      const b = crest[i + 1][0];
      const d = _d.copy(b).sub(a);
      const len = d.length();
      if (len < 1e-4) continue;
      d.divideScalar(len);
      const side = _s.crossVectors(d, up).normalize();
      const n = _n.crossVectors(side, d);
      const seg = new THREE.Mesh(ridge, hairMat);
      seg.quaternion.setFromRotationMatrix(_m.makeBasis(side, d, n));
      if (mid) seg.position.copy(mid);
      else seg.position.copy(a).add(b).multiplyScalar(0.5);
      seg.position.addScaledVector(n, r * 0.2);
      seg.scale.set(r * 0.62, len * 0.6, r * 0.45);
      seg.userData.braidRidge = true;
      group.add(seg);
    }
    add(model.neck, group);
  }
  if (S.tail.length) {
    S.tail.forEach(([parent, p], j) => {
      // perles de crins entrelacées, un peu plus fines vers le bas
      const b = new THREE.Mesh(new THREE.SphereGeometry(r * (1 - j * 0.045), 10, 8), hairMat);
      b.position.copy(p);
      b.position.x += (j % 2 ? 1 : -1) * r * 0.3;
      add(parent, b);
    });
    const [parent, p] = S.tail[0];
    const bow = bowMesh(ribbon, r * 1.25, 'plain');
    bow.position.copy(p);
    bow.quaternion.copy(S.tailBowQ ?? bow.quaternion);
    bow.translateZ(r * 0.9); // (devant la tresse, vu de derrière)
    add(parent, bow);
  }
}

/** Construit (ou enlève) les tresses, nœuds et le brillant de l'animal selon sa préparation. */
export function applyBeautyDecor(e, now) {
  const a = e.data;
  const key = decorKey(a, now);
  const cur = e.beautyDecor;
  if (cur && cur.key === key && cur.model === e.model) return;
  removeBeautyDecor(e);
  const look = a.look;
  const model = e.model;
  const decor = { key, model, groups: [], mats: [] };
  e.beautyDecor = decor;
  if (!model || !look || !key.replace(/\|/g, '')) return;
  const R = (look.bodyR ?? 0.3) * (look.fluff ?? 1);
  const prep = a.beauty?.prep ?? {};
  const add = (parent, obj) => {
    if (!parent) return;
    parent.add(obj);
    decor.groups.push(obj);
  };
  let meshes = null;
  const hitList = () => {
    meshes = meshes ?? modelMeshes(model, new Set());
    return meshes;
  };

  // Tresses de crinière et de queue (chevaux), rubans à la couleur choisie.
  if (isFresh(a, 'braid', now) && a.species === 'horse') {
    const ribbon = RIBBON_COLORS[prep.braid?.color] ?? RIBBON_COLORS.red;
    const mane = look.mane ?? look.secondary ?? 0x4a2f1d;
    if (model.braidSpots) {
      // Cheval réaliste : places mesurées sur ses crins (horseReal.js). Les rayons de surfaceHit s'arrêtaient
      // sur la partie transparente des cartes de crins (tresses dressées au-dessus de la crinière) et la
      // racine du groupe de la queue est l'articulation, dans la croupe (tresse enfouie).
      realHorseBraids(model, ribbon, mane, add, !!a.gear?.blanket);
    } else if (model.neck) {
      const { len: nl, down } = neckFrame(model, look.neckLen ?? R);
      const group = new THREE.Group();
      const count = 7;
      for (let i = 0; i < count; i++) {
        const tt = 0.12 + (i / (count - 1)) * 0.72;
        // Sur la crête de l'encolure : un rayon venu d'au-dessus (côté −z) trouve la crinière.
        const guess = new THREE.Vector3(0, tt * nl, -R * (0.66 - 0.36 * tt));
        const hit = surfaceHit(model.neck, new THREE.Vector3(0, tt * nl, -R * 2.5), new THREE.Vector3(0, tt * nl, 0), hitList());
        const base = (hit ?? guess).add(new THREE.Vector3(0, 0, -R * 0.03));
        const blen = R * (0.42 - tt * 0.12);
        const end = base.clone().addScaledVector(down, blen).add(new THREE.Vector3(R * 0.12, 0, 0));
        group.add(braidMesh(base, end, R * 0.075, mane));
        // Le petit nœud au bout de chaque tresse, tourné vers le côté
        const bow = bowMesh(ribbon, R * 0.075, 'plain');
        bow.position.copy(end);
        bow.lookAt(end.clone().add(new THREE.Vector3(1, 0, 0)));
        group.add(bow);
        // Et un pompon sur la crête
        const knob = new THREE.Mesh(new THREE.SphereGeometry(R * 0.06, 10, 8), mat(ribbon, 0.5));
        knob.position.copy(base);
        group.add(knob);
      }
      add(model.neck, group);
    }
    if (model.tail && !model.braidSpots) {
      // La queue : modèle procédural (groupe « tail » à la racine) ou ancre GLB (même repère que l'animal).
      const tg = new THREE.Group();
      tg.add(braidMesh(new THREE.Vector3(0, -R * 0.08, -R * 0.14), new THREE.Vector3(0, -R * 0.7, -R * 0.26), R * 0.1, mane));
      const bow = bowMesh(ribbon, R * 0.11, 'plain');
      bow.position.set(0, -R * 0.02, -R * 0.2);
      bow.rotation.y = Math.PI;
      tg.add(bow);
      add(model.tail, tg);
    }
  }

  // Nœud ou bandana (autres espèces) : sur le cou, côté dos.
  if (isFresh(a, 'bow', now) && a.species !== 'horse') {
    const color = RIBBON_COLORS[prep.bow?.color] ?? RIBBON_COLORS.red;
    // Assez gros pour se voir de loin (un vrai nœud de concours), même sur un petit chat.
    const size = Math.max(0.028, R * 0.3);
    const bow = bowMesh(color, size, prep.bow?.pattern ?? 'plain');
    const ring = model.dogFit?.collar;
    if (ring) {
      // Chien réaliste (dogReal.js) : sur l'anneau mesuré de l'encolure (z le long du cou, y vers le dessus), côté dos.
      const frame = new THREE.Group();
      frame.position.copy(ring.center);
      frame.quaternion.copy(ring.q);
      const dogSize = Math.max(0.03, (ring.rx + ring.ry) * 0.42);
      bow.scale.setScalar(dogSize / size);
      bow.position.set(0, ring.ry + dogSize * 0.35, 0);
      bow.rotation.x = Math.PI / 2 - 0.35; // (à plat sur le dessus du cou, les pans vers le dos)
      frame.add(bow);
      add(model.neck, frame);
    } else if (model.neck) {
      const { len: nl } = neckFrame(model, look.neckLen ?? R);
      const t = 0.5;
      const hit = surfaceHit(model.neck, new THREE.Vector3(0, t * nl, -R * 2.5), new THREE.Vector3(0, t * nl, 0), hitList());
      bow.position.copy(hit ?? new THREE.Vector3(0, t * nl, -R * 0.52)).add(new THREE.Vector3(0, 0, -size * 0.45));
      bow.rotation.x = -0.5;
      add(model.neck, bow);
    } else if (model.body) {
      bow.position.set(0, (model.y0 ?? 0) + R * 0.95, (look.bodyLen ?? R * 2) * 0.3);
      add(model.body, bow);
    }
  }

  // Robe lustrée : la robe est moins rugueuse (elle brille au soleil) tant que le lustrage est frais.
  if (isFresh(a, 'shine', now) && model.root) {
    const own = new Set();
    for (const g of decor.groups) g.traverse((o) => own.add(o));
    model.root.traverse((o) => {
      const m = o.material;
      if (!o.isMesh || own.has(o) || !m?.isMeshStandardMaterial || m.transparent || m.alphaTest > 0) return;
      const shiny = m.clone();
      // Les matériaux à shader maison (fourrure, crins) gardent leur shader, et leurs defines
      // (material.copy() les remet à ceux de MeshStandardMaterial).
      shiny.onBeforeCompile = m.onBeforeCompile;
      shiny.customProgramCacheKey = m.customProgramCacheKey;
      shiny.defines = { ...m.defines };
      // Robe peinte du cheval (horseCoat.js) : un brillant satiné ; plus lisse, le relief peint disparaît
      // sous les reflets (robe de plastique).
      const coat = !!m.userData?.horseUniforms;
      shiny.roughness = Math.max(coat ? 0.3 : 0.12, (m.roughness ?? 0.8) - (coat ? 0.24 : 0.4));
      shiny.metalness = Math.max(m.metalness ?? 0, Math.min(coat ? 0.2 : 0.3, (m.metalness ?? 0) + (coat ? 0.05 : 0.08)));
      o.material = shiny;
      decor.mats.push({ mesh: o, orig: m, shiny });
    });
  }
}

export function removeBeautyDecor(e) {
  const cur = e.beautyDecor;
  if (!cur) return;
  cur.model?.setBraided?.(false);
  for (const g of cur.groups) {
    g.parent?.remove(g);
    g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  }
  for (const { mesh, orig, shiny } of cur.mats) {
    if (mesh.material === shiny) mesh.material = orig;
    shiny.dispose();
  }
  e.beautyDecor = null;
}

// ---------------------------------------------------------------- le gestionnaire (game.beauty)

export class Beauty {
  constructor(game) {
    this.game = game;
    this.lastHours = null;
    this.tick = 0;
    this.checkedDay = null; // dernier jour où l'on a regardé les inscriptions (oubliées, du jour)
    // Un soin normal (laver, brosser, couper les griffes, ferrer) compte dans la préparation.
    game.on?.('care', ({ a, action }) => { if (PREP_ITEMS[action]?.care) this.prepDone(a, action, 1, {}, true); });
  }

  /** Une action du carnet du handler (sans effet tant que le métier n'est pas commencé). */
  noteHandler(action) {
    const g = this.game;
    if (g.profile && isStarted(g.profile, 'handler')) g.clients?.noteCareer?.('handler', action);
  }

  /**
   * Inscrit un animal à un concours de beauté (frais payés tout de suite). Renvoie l'inscription,
   * ou null (raison dite par un message).
   */
  register(a, comp) {
    const g = this.game;
    const p = g.profile;
    const why = registerBlock(p, comp, a, { day: g.day, hour: g.hour });
    if (why) {
      g.ui.toast(ta(`beauty_reg_${why}`, a, { cls: t(`beauty_class_${classOf(a.species)}`) }), 4500);
      return null;
    }
    if (!spend(p, comp.fee)) {
      g.ui.toast(t('r_money'));
      return null;
    }
    const e = registerEntry(p, comp, a);
    addStat(p, 'beautyEntries');
    g.audio?.ui?.('coin');
    g.ui.toast(ta(comp.day === g.day ? 'beauty_registeredToday' : 'beauty_registered', a, { day: comp.day, cls: t(`beauty_class_${e.cls}`) }), 5000);
    g.save();
    g.ui.refresh();
    return e;
  }

  /**
   * Entrer dans la carrière : entraînement (comp null) ou concours (inscrit à l'avance, ou inscription
   * sur place le jour même). Renvoie la session, ou null.
   */
  enterRing(a, comp = null) {
    const g = this.game;
    if (!comp) return g.activities.start('beauty', { animal: a, comp: null });
    const block = ringBlock(g.profile, comp, a, { day: g.day, hour: g.hour });
    if (block) {
      g.ui.toast(ta(`beauty_ring_${block}`, a, { from: comp.open, to: comp.close, day: comp.day }), 4500);
      return null;
    }
    if (!entryFor(g.profile, comp.id, a.id) && !this.register(a, comp)) return null;
    return g.activities.start('beauty', { animal: a, comp, prepaid: true });
  }

  /** Une fois par jour : inscriptions oubliées (concours passé) et rappel du concours du jour. */
  checkEntries() {
    const g = this.game;
    const p = g.profile;
    if (this.checkedDay === g.day || g.hour < 7) return;
    this.checkedDay = g.day;
    const find = (id) => p.animals.find((x) => x.id === id);
    for (const e of missedEntries(p, g.day)) {
      const a = find(e.animalId);
      if (a) g.ui.toast(ta('beauty_missed', a, { day: e.day }), 6000);
    }
    const today = todaysEntries(p, g.day).map((e) => find(e.animalId)).filter(Boolean);
    if (today.length) g.ui.toast(t('beauty_todayReminder', { names: today.map((a) => a.name).join(', '), n: today.length }), 7000);
  }

  /** Un geste de préparation vient d'être fait (mini-jeu fini). quiet : soin normal, sans fanfare. */
  prepDone(a, item, quality = 1, extra = {}, quiet = false) {
    const g = this.game;
    const now = nowHours(g.profile);
    const def = PREP_ITEMS[item];
    if (!def) return null;
    // Bain ou brossage fait depuis la liste du concours (pas un soin ordinaire) : toilette de concours.
    if (!quiet && def.care) showCare(a, item, quality);
    const entry = notePrep(a, item, now, quality, extra);
    const e = g.entities.get(a.id);
    if (!quiet) {
      // Un moment doux avec l'animal : il aime qu'on s'occupe de lui (lien et câlins réels).
      a.bond = Math.min(100, (a.bond ?? 5) + 1);
      a.needs.affection = Math.min(100, a.needs.affection + 4);
      if (item === 'shine' || item === 'fluff') a.needs.grooming = Math.min(100, (a.needs.grooming ?? 0) + 10);
      addStat(g.profile, 'beautyPrep');
      if (item === 'braid') addStat(g.profile, 'beautyBraid');
      g.xp('care');
      e?.emit(def.icon === '🧶' ? '☁️' : def.icon, 3);
      if (item === 'braid' || item === 'bow') this.noteHandler('braid');
    }
    if (isReady(a, now) && beautyData(a).readyDay !== g.day) {
      a.beauty.readyDay = g.day;
      addStat(g.profile, 'beautyReady');
      g.ui.toast(ta('beauty_nowReady', a), 4500);
      e?.emit('🎀', 4);
      this.noteHandler('prep');
    }
    if (e) applyBeautyDecor(e, now);
    g.save();
    g.ui.refresh();
    return entry;
  }

  /** Chaque image : la pluie abîme la préparation, et le décor des animaux suit leur préparation. */
  update(dt) {
    const g = this.game;
    if (!g.profile) return;
    if (!g.ui?.isBlocking?.()) this.checkEntries();
    const now = nowHours(g.profile);
    const dh = this.lastHours === null ? 0 : now - this.lastHours;
    this.lastHours = now;
    this.tick += dt;
    const wet = WET[g.weather] ? g.weather : null;
    const refresh = this.tick > 0.5;
    if (refresh) this.tick = 0;
    for (const e of g.entities.values()) {
      const a = e.data;
      if (!a.beauty) continue;
      if (wet && dh > 0 && !e.inside) weatherWear(a, wet, dh);
      if (!refresh) continue;
      applyBeautyDecor(e, now);
      // Petites étincelles sur une robe qui brille ou un poil tout gonflé.
      if ((isFresh(a, 'shine', now) || isFresh(a, 'fluff', now)) && Math.random() < 0.08) e.emit('✨', 1);
    }
  }
}

// ---------------------------------------------------------------- présentation dans la carrière

// Emplacements (coordonnées locales de la carrière) : départ côté entrée, cercle du juge côté cabane du jury.
const RING = {
  start: { x: 14, z: 0, heading: -Math.PI / 2 },
  judge: { x: -12.5, z: -5 },
  table: { x: -14.6, z: -5 },
  judgeSeat: { x: -16.4, z: -5 },
  back: { x: 10, z: 0 },
  podium: { x: 10, z: 3.6 },
};
const STAND_SECONDS = 3;
const RUN_SPEED = 4.0; // au-dessus, on court

class BeautySession extends Session {
  constructor(mgr, type, opts) {
    super(mgr, type, opts);
    const g = this.game;
    const a = opts.animal;
    const e = g.entities.get(a?.id);
    const why = a ? (eligibility(a, 'beauty') ?? (canLead(a).ok ? null : 'needHalter')) : 'notHere';
    if (!e || why) {
      if (a) g.ui.toast(ta(`actv_why_${why ?? 'notHere'}`, a), 5000);
      this.ok = false;
      return;
    }
    if (g.player.mount) g.dismount();
    this.animal = a;
    this.e = e;
    // Classe de l'animal (chevaux, chiens, chats…) : ses concurrents sont de la même classe.
    this.cls = classOf(a.species);
    this.rivals = this.comp ? classRivals(this.comp, this.cls) : null;
    this.script(e);
    this.carried = CARRIED.includes(a.species);
    this.steps = presentationSteps(a.species);
    this.stepIndex = -1;
    this.phase = 'wait';
    this.phaseT = 0;
    this.perf = {};
    this.now = nowHours(g.profile);
    this.win = ringWindow(a);
    this.walkT = 0;
    this.runT = 0;
    this.touched = false;
    this.fidgets = 0;
    this.photoDone = false;

    this.start = toWorld(RING.start);
    this.judge = toWorld(RING.judge);
    this.back = toWorld(RING.back);
    this.podium = toWorld(RING.podium);
    const table = toWorld(RING.table);
    const seat = toWorld(RING.judgeSeat);
    this.tableTop = 0.82;
    // Le cercle du juge, le drapeau du retour, la table (petits animaux), le juge et le podium.
    this.ringA = this.put(ringMesh(1.3, 0xffd23a), this.judge.x, this.judge.z);
    this.ringB = this.put(ringMesh(1.3, 0x2f6fd8), this.back.x, this.back.z);
    this.ringA.position.y += 0.08;
    this.ringB.position.y += 0.08;
    this.ringB.visible = false;
    const flags = flagPair(4, t('actv_finish'));
    this.flags = this.put(flags, this.back.x, this.back.z, 0);
    const tbl = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.0), mat(0xf6f4ee, 0.8));
    top.position.y = this.tableTop;
    tbl.add(top);
    const cloth = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.5, 1.1), mat(0xe86aa0, 0.9));
    cloth.position.y = this.tableTop - 0.3;
    tbl.add(cloth);
    for (const [x, z] of [[-0.7, -0.4], [0.7, -0.4], [-0.7, 0.4], [0.7, 0.4]]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, this.tableTop, 8), mat(0x5a3418, 0.7));
      leg.position.set(x, this.tableTop / 2, z);
      tbl.add(leg);
    }
    this.table = this.put(tbl, table.x, table.z);
    // Le juge : une vraie personne (veste bleu marine, chapeau) derrière la table, avec son nom.
    this.judgeNpc = buildAvatar({ skin: 0xc68a63, hair: 0x9a9a9a, hairStyle: 'short', top: 0x23395d, bottom: 0x2d3a4f, shoes: 0x2b2b2b, hat: true }, 77);
    this.judgeNpc.root.position.set(seat.x, this.y(seat.x, seat.z), seat.z);
    this.judgeNpc.root.rotation.y = Math.PI / 2; // face à la carrière (+x)
    g.scene.add(this.judgeNpc.root);
    this.judgeLife = { speed: 0, busy: false };
    // Petite étiquette au-dessus de sa tête (cachée par le décor comme le reste : elle ne masque pas la carrière).
    const judgeSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture(t('beauty_judgeTag'), '#23395d', '#ffffff', '🧑‍⚖️'), transparent: true, depthWrite: false }));
    judgeSprite.scale.set(1.0, 0.25, 1);
    judgeSprite.position.set(seat.x, this.y(seat.x, seat.z) + 2.15, seat.z);
    this.group.add(judgeSprite);
    this.judgeSprite = judgeSprite;
    const pod = new THREE.Group();
    const cols = [0xffd23a, 0xc0c0c0, 0xcd7f32];
    const heights = [0.7, 0.5, 0.35];
    const xs = [0, -1.1, 1.1];
    this.podiumSteps = [];
    for (let i = 0; i < 3; i++) {
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, heights[i], 1.0), mat(cols[i], 0.5));
      box.position.set(xs[i], heights[i] / 2, 0);
      pod.add(box);
      this.podiumSteps.push({ x: xs[i], h: heights[i] });
    }
    this.put(pod, this.podium.x, this.podium.z, Math.PI);
    this.arrow = this.put(new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.7, 10), mat(0xff8a1f, 0.5)), this.judge.x, this.judge.z);
    this.arrow.rotation.x = Math.PI;
    // La longe (cheval) ou la laisse (chien)
    if (!this.carried) {
      const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 8 }, () => new THREE.Vector3()));
      this.rope = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: a.species === 'dog' ? 0xc0392b : 0x4a3a2a }));
      this.rope.frustumCulled = false;
      this.group.add(this.rope);
    }
    if (this.comp) this.addCrowd();
    this.teleportPlayer(this.start.x, this.start.z, RING.start.heading);
    this.placeAnimal(true);
    this.hud.hint(ta(this.carried ? 'beauty_hintCarry' : 'beauty_hintWalk', a));
    // Humeur réelle : un animal qui a faim, soif ou besoin de câlins sera moins calme devant le juge.
    const need = lowestNeed(a);
    if (need) g.ui.toast(ta('beauty_moodWarn', a, { what: ta(`beauty_need_${need}`, a) }), 5000);
    this.refreshHud();
  }

  // ---- la position de l'animal par rapport au joueur
  animalGoal() {
    const pl = this.game.player;
    const p = pl.root.position;
    const f = fwd(pl.heading);
    const right = new THREE.Vector3(f.z, 0, -f.x);
    if (this.carried) return p.clone().addScaledVector(f, 0.42);
    return p.clone().addScaledVector(right, this.animal.species === 'horse' ? 1.1 : 0.8).addScaledVector(f, -0.5);
  }

  placeAnimal(snap = false) {
    const e = this.e;
    const pl = this.game.player;
    const goal = this.animalGoal();
    if (this.carried) {
      e.position.set(goal.x, pl.root.position.y + 0.95, goal.z);
      e.heading = pl.heading;
      e.speed = 0;
      e.scaleGroup.rotation.x = 0;
    } else if (snap) {
      e.position.set(goal.x, this.y(goal.x, goal.z), goal.z);
      e.heading = pl.heading;
      e.speed = 0;
    }
    e.root.rotation.y = e.heading;
  }

  /** L'animal mené suit le joueur (pas ou trot). */
  followPlayer(dt) {
    const e = this.e;
    const pl = this.game.player;
    const goal = this.animalGoal();
    const to = new THREE.Vector3(goal.x - e.position.x, 0, goal.z - e.position.z);
    const d = to.length();
    const vmax = Math.max(e.sp.runSpeed, 6.5);
    const v = d > 0.15 ? Math.min(vmax, d * 3 + pl.speed) : 0;
    if (v > 0) {
      e.heading += wrap(Math.atan2(to.x, to.z) - e.heading) * Math.min(1, dt * 6);
      e.position.addScaledVector(to.normalize(), Math.min(d, v * dt));
    } else e.heading += wrap(pl.heading - e.heading) * Math.min(1, dt * 4);
    e.speed = d > 0.3 ? Math.min(v, pl.speed + 0.5) : 0;
    e.position.y = this.y(e.position.x, e.position.z);
    e.root.rotation.y = e.heading;
  }

  updateRope() {
    if (!this.rope) return;
    const pl = this.game.player;
    const h = pl.heading;
    const p = pl.root.position;
    const hand = new THREE.Vector3(p.x + Math.cos(h) * 0.3, p.y + 0.85, p.z - Math.sin(h) * 0.3);
    const e = this.e;
    const head = e.position.clone();
    // (chien réaliste : l'anneau de son collier)
    if (e.model.leashPoint) e.model.leashPoint.getWorldPosition(head);
    else head.y += (e.model.headHeight ?? (e.model.y0 + e.data.look.bodyR)) * e.scale * 0.9;
    const dist = hand.distanceTo(head);
    const slack = Math.max(0, 2.2 - dist) * 0.3;
    const pos = this.rope.geometry.attributes.position;
    for (let i = 0; i < 8; i++) {
      const k = i / 7;
      pos.setXYZ(i, hand.x + (head.x - hand.x) * k, hand.y + (head.y - hand.y) * k - Math.sin(k * Math.PI) * slack, hand.z + (head.z - hand.z) * k);
    }
    pos.needsUpdate = true;
  }

  holdPlayer(x, z, heading = null) {
    const pl = this.game.player;
    pl.cancelGoTo();
    pl.root.position.set(x, this.y(x, z), z);
    pl.speed = 0;
    if (heading !== null) pl.heading = heading;
  }

  // ---- les étapes
  onGo() {
    this.nextStep();
  }

  nextStep() {
    this.stepIndex++;
    const step = this.steps[this.stepIndex];
    this.phase = step ?? 'podium';
    this.phaseT = 0;
    this.hud.setGauge(null);
    this.hud.setMain(null);
    const a = this.animal;
    switch (this.phase) {
      case 'walk':
        this.hud.big(t('beauty_step_walk'), 1200);
        this.hud.hint(ta(this.carried ? 'beauty_hintCarry' : 'beauty_hintWalk', a));
        document.body.classList.remove('actv-nomove');
        break;
      case 'halt':
        this.hold = { x: this.judge.x, z: this.judge.z, heading: this.game.player.heading };
        this.openGauge('halt', '🛑', t('beauty_haltBtn'));
        this.hud.hint(t('beauty_hintHalt'));
        if (this.carried) this.putOnTable();
        break;
      case 'stand':
        this.touched = false;
        this.standQ = 1;
        this.hud.hint(ta('beauty_hintStand', a));
        break;
      case 'turn':
        this.openGauge('turn', '🔄', t('beauty_turnBtn'));
        this.hud.hint(t('beauty_hintTurn'));
        break;
      case 'trot':
        this.turnAnim = null;
        this.hold = null;
        this.trotStart = this.time;
        this.trotPar = trotPar(Math.hypot(this.back.x - this.judge.x, this.back.z - this.judge.z));
        this.ringB.visible = true;
        this.hud.big(t('beauty_step_trot'), 1200);
        this.hud.hint(ta('beauty_hintTrot', a));
        document.body.classList.remove('actv-nomove');
        break;
      case 'pose':
        this.openGauge('pose', '📸', t('beauty_poseBtn'));
        this.hud.hint(ta('beauty_hintPose', a));
        break;
      default:
        this.beginPodium();
    }
    this.refreshHud();
  }

  openGauge(key, icon, label) {
    document.body.classList.add('actv-nomove');
    this.gauge = { key, cursor: 0, dir: 1, speed: 0.6 + this.stepIndex * 0.05 };
    this.hud.setGauge(this.win);
    this.hud.setMain({ icon, label, key: t('actv_key_space'), onClick: () => this.action() });
  }

  putOnTable() {
    const e = this.e;
    const tp = this.table.position;
    e.position.set(tp.x, tp.y + this.tableTop, tp.z + 0.1);
    e.heading = Math.PI / 2; // vers l'entrée (et le public)
    e.root.rotation.y = e.heading;
    e.speed = 0;
    this.onTable = true;
  }

  /** Le gros bouton (ou Espace, ou un toucher) : on s'arrête / on tourne / on pose au bon moment. */
  action() {
    if (this.state !== 'run') return;
    const gg = this.gauge;
    if (!gg || !['halt', 'turn', 'pose'].includes(this.phase)) return;
    const q = gaugeQuality(gg.cursor, this.win);
    this.perf[gg.key === 'pose' ? 'trot' : gg.key] = q;
    this.gauge = null;
    this.hud.setGauge(null);
    this.hud.setMain(null);
    this.hud.big(q > 0.85 ? t('actv_perfect') : q > 0.5 ? t('actv_good') : t('actv_oops'), 900, q > 0.5 ? 'good' : 'bad');
    if (q > 0.5) {
      this.e.emit('⭐', 1);
      if (this.comp) this.applause(0.3);
    }
    if (this.phase === 'turn') {
      // Demi-tour : l'animal et le joueur pivotent face à l'entrée.
      this.turnAnim = { t: 0, h0: this.e.heading, p0: this.game.player.heading };
      this.phase = 'turning';
      this.phaseT = 0;
    } else {
      this.phaseT = 0;
      this.phase = `${this.phase}-done`;
    }
  }

  onKeyDown(ev) {
    if (ev.code === 'Space') {
      ev.preventDefault();
      this.action();
    } else if (this.phase === 'stand') this.touched = true;
  }

  onTap() {
    if (this.phase === 'stand') {
      this.touched = true;
      return true;
    }
    if (this.gauge) {
      this.action();
      return true;
    }
    return false; // marcher : toucher le sol emmène le joueur
  }

  refreshHud() {
    const idx = Math.max(0, this.stepIndex); // pendant le compte à rebours : la première étape
    const i = Math.max(1, Math.min(this.steps.length, idx + 1));
    const stepName = this.steps[idx] && this.phase !== 'podium' ? t(`beauty_step_${this.steps[idx]}`) : t('beauty_step_podium');
    const stats = [['🎀', `${t('beauty_stepN', { n: i, total: this.steps.length })} · ${stepName}`]];
    if (this.phase === 'stand') stats.push(['🤫', t('beauty_standing', { n: Math.max(0, Math.ceil(STAND_SECONDS - this.phaseT)) })]);
    if (this.phase === 'trot') stats.push(['⏱️', `${(this.time - this.trotStart).toFixed(1)} s / ${this.trotPar} s`]);
    this.hud.stats(stats);
  }

  update(dt) {
    this.updateCommon(dt);
    if (this.state === 'done') {
      this.game.rig.frameWith = null;
      this.game.rig.occluders = null;
      return;
    }
    const g = this.game;
    const pl = g.player;
    const e = this.e;
    // La caméra cadre l'animal mené avec l'enfant (pas quand il est porté, sur la table ou au podium).
    g.rig.frameWith = this.carried || this.onTable || this.phase === 'podium' ? null : e;
    // (décor du terrain et arche d'arrivée : la caméra qui recule pour cadrer se place devant eux — Player.js)
    g.rig.occluders = g.rig.frameWith ? [this.flags, g.world.showground].filter(Boolean) : null;
    this.phaseT += dt;
    this.judgeSprite.position.y = this.y(this.judgeSprite.position.x, this.judgeSprite.position.z) + 2.15 + Math.sin(this.time * 2) * 0.03;
    if (this.judgeNpc) {
      // Le juge suit l'animal du regard (il tourne doucement sur place).
      const jr = this.judgeNpc.root;
      const want = Math.atan2(e.position.x - jr.position.x, e.position.z - jr.position.z);
      jr.rotation.y += wrap(want - jr.rotation.y) * Math.min(1, dt * 2);
      // Pose debout remise à zéro à chaque image, puis la vie par-dessus (sinon les gestes s'additionnent).
      animateAvatarWalk(this.judgeNpc, 0, 0);
      updateAvatarLife(this.judgeNpc, dt, this.judgeLife);
    }
    this.arrow.position.y = this.y(this.arrow.position.x, this.arrow.position.z) + 2.4 + Math.sin(this.time * 4) * 0.2;
    this.arrow.rotation.y += dt * 2;
    this.ringA.material.opacity = 0.55 + Math.sin(this.time * 5) * 0.3;
    this.ringB.material.opacity = 0.55 + Math.sin(this.time * 5) * 0.3;

    if (this.state === 'countdown') {
      this.holdPlayer(this.start.x, this.start.z, RING.start.heading);
      this.placeAnimal(true);
      this.updateRope();
      return;
    }
    if (this.gauge) {
      const gg = this.gauge;
      gg.cursor += gg.dir * gg.speed * dt;
      if (gg.cursor > 1) { gg.cursor = 1; gg.dir = -1; }
      if (gg.cursor < 0) { gg.cursor = 0; gg.dir = 1; }
      this.hud.setGaugeCursor(gg.cursor);
      if (this.phaseT > 10) {
        gg.cursor = 0.1;
        this.action();
      }
    }
    switch (this.phase) {
      case 'walk': {
        if (pl.speed > RUN_SPEED) this.runT += dt;
        else if (pl.speed > 0.3) this.walkT += dt;
        const d = Math.hypot(this.judge.x - pl.root.position.x, this.judge.z - pl.root.position.z);
        this.arrow.visible = d > 4;
        if (this.runT > 1.5 && this.runT > this.walkT && !this.warnedRun) {
          this.warnedRun = true;
          this.hud.big(t('beauty_noRun'), 1000, 'bad');
        }
        if (d < 1.4) {
          this.perf.walk = Math.max(0.2, 1 - this.runT / Math.max(1, this.walkT + this.runT) * 0.9);
          this.arrow.visible = false;
          this.nextStep();
        }
        break;
      }
      case 'halt':
      case 'turn':
      case 'pose':
      case 'halt-done':
      case 'pose-done':
        this.holdPlayer(this.hold.x, this.hold.z, this.hold.heading);
        if (this.phase.endsWith('-done') && this.phaseT > 0.9) this.nextStep();
        break;
      case 'stand': {
        if (pl.speed > 0.05) this.touched = true; // le joystick a bougé (avant qu'on remette le joueur en place)
        this.holdPlayer(this.hold.x, this.hold.z, this.hold.heading);
        if (this.touched && !this.touchedShown) {
          this.touchedShown = true;
          this.standQ = Math.min(this.standQ, 0.35);
          this.hud.big(t('beauty_moved'), 1000, 'bad');
        }
        // Un animal peu calme gigote tout seul.
        if (Math.random() < fidgetChance(this.animal) * dt) {
          this.fidgets++;
          this.standQ = Math.max(0.3, this.standQ - 0.25);
          e.emit('❗', 1);
          this.hud.big(ta('beauty_fidget', this.animal), 900, 'bad');
        }
        if (this.phaseT >= STAND_SECONDS) {
          this.perf.stand = this.standQ;
          if (this.standQ > 0.8) {
            this.hud.big(t('actv_perfect'), 800, 'good');
            e.emit('💕', 2);
          }
          this.nextStep();
        }
        break;
      }
      case 'turning': {
        this.holdPlayer(this.hold.x, this.hold.z);
        const ta2 = this.turnAnim;
        ta2.t = Math.min(1, ta2.t + dt / 0.9);
        const k = ta2.t * ta2.t * (3 - 2 * ta2.t);
        pl.heading = ta2.p0 + Math.PI * k;
        this.hold.heading = pl.heading;
        if (!this.onTable) {
          e.heading = ta2.h0 + Math.PI * k;
          e.speed = ta2.t < 1 ? 1.2 : 0;
        }
        g.rig.yaw += wrap(pl.heading - g.rig.yaw) * Math.min(1, dt * 3);
        if (ta2.t >= 1) this.nextStep();
        break;
      }
      case 'trot': {
        if (pl.speed > RUN_SPEED) this.trotRun = (this.trotRun ?? 0) + dt;
        const d = Math.hypot(this.back.x - pl.root.position.x, this.back.z - pl.root.position.z);
        if (d < 1.6) {
          const el = this.time - this.trotStart;
          const pace = Math.max(0, 1 - Math.max(0, el - this.trotPar) / this.trotPar);
          this.perf.trot = Math.max(0.15, pace * ((this.trotRun ?? 0) > 1 ? 1 : 0.6));
          this.ringB.visible = false;
          this.nextStep();
        }
        break;
      }
      case 'podium':
        this.updatePodium(dt);
        break;
      default:
    }
    // L'animal : porté, sur la table, ou mené à la main.
    if (this.onTable) {
      e.speed = 0;
      e.root.rotation.y = e.heading;
    } else if (this.carried) this.placeAnimal();
    else if (this.phase !== 'podium') this.followPlayer(dt);
    this.updateRope();
    if (this.state === 'run') this.refreshHud();
  }

  // ---- podium et photo
  beginPodium() {
    const g = this.game;
    this.phase = 'podium';
    this.phaseT = 0;
    this.hud.setGauge(null);
    this.hud.setMain(null);
    document.body.classList.add('actv-nomove');
    this.marks = judgeMarks(this.animal, this.now, this.perf);
    const points = this.marks.points;
    let step = this.marks.stars === 3 ? 0 : this.marks.stars === 2 ? 1 : 2;
    this.rank = null;
    if (this.comp) {
      this.rank = ranking(this.comp, { points }, this.rivals).rank;
      step = this.rank <= 3 ? this.rank - 1 : 2;
    }
    // La photo du podium : on enlève l'arche d'arrivée, les cercles et la flèche qui la cachaient.
    for (const o of [this.flags, this.ringA, this.ringB, this.arrow]) if (o) o.visible = false;
    // Le juge tend le ruban (ou la coupe).
    if (this.judgeNpc) startAvatarGesture(this.judgeNpc, 'offer', { duration: 2.4, local: true, x: 0, y: 1.15, z: 0.45 });
    const s = this.podiumSteps[step];
    const e = this.e;
    // Le podium est tourné de 180° : les marches sont inversées en x.
    const px = this.podium.x - s.x;
    const pz = this.podium.z;
    this.onTable = false;
    e.position.set(px, this.y(px, pz) + s.h, pz);
    e.heading = Math.PI; // face au joueur (côté −z)
    e.speed = 0;
    e.root.rotation.y = e.heading;
    // Le joueur se met sur le côté : la photo montre l'animal sur sa marche, pas le dos du joueur.
    this.hold = { x: this.back.x - 1.1, z: this.back.z, heading: 0 };
    this.holdPlayer(this.hold.x, this.hold.z, 0);
    this.hud.hint(ta(this.rank && this.rank <= 3 ? 'beauty_hintPodium' : 'beauty_hintPhoto', this.animal));
    g.rig.yaw = 0;
    g.rig.pitch = 0.22;
    g.rig.dist = 6.5;
    this.hud.big(this.rank ? (this.rank <= 3 ? t('actv_podium', { n: this.rank }) : t('actv_ranked', { n: this.rank })) : t('beauty_photo'), 1600, 'good');
    this.applause(this.marks.stars / 3);
    this.e.emit(this.marks.stars === 3 ? '🏆' : '🎉', 3);
    if (this.rank && this.rank <= 3) addStat(g.profile, 'beautyPodium');
  }

  updatePodium(dt) {
    const pl = this.game.player;
    this.holdPlayer(this.hold.x, this.hold.z, 0);
    pl.heading = 0;
    this.game.rig.yaw += wrap(0 - this.game.rig.yaw) * Math.min(1, dt * 4);
    if (this.phaseT > 1.6 && !this.photoDone) {
      this.photoDone = true;
      this.takePhoto();
      this.hud.flash();
    }
    if (this.phaseT > 3.2 && this.state === 'run') {
      this.state = 'finishing';
      const result = { points: this.marks.points, stars: this.marks.stars, marks: this.marks };
      setTimeout(() => !this.ended && this.finishBeauty(result), 300);
    }
  }

  /**
   * Fin de la présentation : on garde le résultat (inscription, animal confié), le métier de handler
   * progresse, l'animal est content, puis la fenêtre des résultats commune (Session.finish).
   */
  finishBeauty(result) {
    const g = this.game;
    const p = g.profile;
    const a = this.animal;
    const marks = this.marks;
    const rank = this.rank;
    const champion = !!this.comp && isChampion(rank, marks.points);
    if (this.comp) markPresented(p, this.comp, a, { points: marks.points, rank });
    // Animal confié (métier de handler) : le propriétaire verra la note.
    noteClientContest(a, { points: marks.points, rank, stars: marks.stars, comp: !!this.comp });
    // Métier de handler : présenter au juge (carnet) et de l'expérience selon la note.
    let careerLine = null;
    if (isStarted(p, 'handler')) {
      g.beauty?.noteHandler('present');
      const xp = handlerXp(marks.stars, rank);
      const up = addCareerXp(p, 'handler', xp);
      careerLine = `🎀 ${t('ca_xpGain', { n: xp, career: t('career_handler') })}`;
      if (up && up.rankUp !== null && up.rankUp !== undefined) g.ui.toast(t('ca_rankUpToast', { rank: t(`ca_rank_${RANKS[up.rankUp]}`), career: t('career_handler') }), 7000);
    }
    // L'animal est fier et heureux d'avoir été chouchouté : câlins et lien réels.
    a.needs.affection = Math.min(100, a.needs.affection + 6 + marks.stars * 2);
    a.bond = Math.min(100, (a.bond ?? 5) + (marks.stars >= 2 ? 2 : 1));
    if (champion) {
      addAward(p, { kind: 'ribbon', tier: 'champion', money: 0 }, {
        type: 'beauty', day: g.day, place: p.place, animal: a.name, animalId: a.id, species: a.species, level: this.comp.levelId, rank: 1,
      });
      addStat(p, 'beautyChampion');
    }
    this.finish(result, {
      animals: [a],
      quality: marks.points / 100,
      rivals: this.rivals ?? undefined,
      extra: [...judgeLines(marks, a, { cls: this.cls, comp: !!this.comp, champion }), careerLine].filter(Boolean),
    });
  }

  /** Petite photo de l'écran gardée dans l'album (comme les photos de balade). */
  takePhoto() {
    const g = this.game;
    try {
      g.renderer.render(g.scene, g.camera);
      const src = g.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 192;
      c.height = 120;
      const ctx = c.getContext('2d');
      const ratio = c.width / c.height;
      let sw = src.width;
      let sh = sw / ratio;
      if (sh > src.height) {
        sh = src.height;
        sw = sh * ratio;
      }
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      const d = activityData(g.profile);
      d.photos.push({ sight: 'podium', day: g.day, place: g.profile.place, data: c.toDataURL('image/jpeg', 0.7) });
      if (d.photos.length > 24) d.photos.shift();
      addStat(g.profile, 'actvPhotos');
      g.ui.toast(t('actv_photoTaken', { what: t('beauty_sight_podium') }), 3000);
    } catch {
      /* pas de photo possible : tant pis */
    }
  }

  cleanup() {
    this.game.rig.frameWith = null;
    this.game.rig.occluders = null;
    if (this.judgeNpc) {
      this.game.scene.remove(this.judgeNpc.root);
      disposeModel(this.judgeNpc.root);
      this.judgeNpc = null;
    }
    const e = this.e;
    if (e) {
      e.scaleGroup.rotation.set(0, 0, 0);
      e.position.y = this.y(e.position.x, e.position.z);
      e.speed = 0;
    }
    this.game.player.speed = 0;
  }
}

/** Un anneau au sol (cercle du juge, drapeau du retour). */
function ringMesh(r, color) {
  const m = new THREE.Mesh(new THREE.RingGeometry(r - 0.18, r, 40).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
  m.position.y = 0.06;
  return m;
}

// La discipline 'beauty' est jouable par Activities.start('beauty', { animal, comp }).
SESSION_TYPES.beauty = { cls: BeautySession, icon: '🎀', stat: 'actvBeauty' };

export { BeautySession };

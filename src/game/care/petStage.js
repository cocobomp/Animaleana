// Scène de soin en 3D des animaux de compagnie (chien, chat, lapin) : la même scène que celle du cheval
// (src/game/care/stage.js : rendu, caméra, doigt, projection, libération), avec ce qui change pour eux :
//
// - les repères (museau, nez, tête, oreilles, garrot, dos, poitrail, ventre, queue, pattes) sont pris sur la peau
//   du vrai modèle (dogReal.js, catReal.js, rabbitReal.js), sommet par sommet, et non sur des distances de cheval :
//   un chihuahua de 23 cm comme un bouvier bernois, un sphynx comme un maine coon, un bélier comme un géant ;
// - la vie : c'est l'animation du modèle lui-même (son mixeur : assis, couché, accroupi pour manger, renifler,
//   frétiller de la queue, respiration, clignements, oreilles) que la scène pilote avec ce que le jeu demande
//   (sc.mood : regarder la main, manger, boire, s'asseoir, content, apeuré) ; par-dessus, de petits gestes en plus
//   (mâcher, tendre le nez, sursauter, ronronner) ;
// - le double porte aussi ses accessoires du salon de toilettage (nœud, bandana, collier) et sa coupe du moment ;
// - les régions du corps sous le doigt d'après les os de ces modèles (tête, oreille, encolure, corps, épaule,
//   hanche, patte, queue).
//
// Rien ne change pour le cheval : c'est une sous-classe (le cadre la choisit par espèce, voir care3d.js).

import * as THREE from 'three';
import { CareStage, approachAngle, ease } from './stage.js';
import { buildAccessories, removeAccessories } from '../models/salon.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const AX = new THREE.Vector3(1, 0, 0);

/** Région du corps d'après l'os d'un chien, d'un chat ou d'un lapin réaliste. */
export function petRegionOf(bone = '') {
  if (/^ear/.test(bone)) return 'ear';
  if (/^(head|jaw|tongue|lid|eye|nose)/.test(bone)) return 'head';
  if (/^neck/.test(bone)) return 'neck';
  if (/^tail/.test(bone)) return 'tail';
  if (/^(scap|humerus)/.test(bone)) return 'shoulder';
  if (/^(femur|haunch)/.test(bone)) return 'hip';
  if (/^(radius|metacarpus|toes|tibia|metatarsus|htoes)/.test(bone)) return 'leg';
  return bone ? 'body' : '';
}

/** Posture de repos de chaque espèce (debout ; le lapin, ramassé). */
const REST = { dog: 'stand', cat: 'stand', rabbit: 'crouch' };

/**
 * Sommets de la peau dans la pose du moment (repère monde), un sur `step`, avec leur os principal (nom).
 * Sert aux repères : la peau, pas une boîte, dit où est le bout du nez ou le haut du dos.
 */
export function skinPoints(mesh, step = 1) {
  const g = mesh.geometry;
  const p = g.attributes.position;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const bones = mesh.skeleton?.bones ?? [];
  mesh.updateWorldMatrix(true, false);
  const n = Math.ceil(p.count / step);
  const pos = new Float32Array(n * 3);
  const bone = new Array(n);
  let k = 0;
  for (let i = 0; i < p.count; i += step) {
    _v.fromBufferAttribute(p, i);
    if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, _v);
    _v.applyMatrix4(mesh.matrixWorld);
    pos[k * 3] = _v.x;
    pos[k * 3 + 1] = _v.y;
    pos[k * 3 + 2] = _v.z;
    let b = -1;
    let best = -1;
    if (si && sw) {
      for (let c = 0; c < 4; c++) {
        const w = sw.getComponent(i, c);
        if (w > best) {
          best = w;
          b = si.getComponent(i, c);
        }
      }
    }
    bone[k] = bones[b]?.name ?? '';
    k++;
  }
  return { pos, bone, n: k };
}

export class PetStage extends CareStage {
  /** Le double, plus ses accessoires du salon et sa coupe du moment (comme dans le jeu). */
  build(o) {
    this.species = o.a?.species ?? 'dog';
    this.pst = {}; // état passé à l'animation du modèle (voir life)
    super.build(o);
    const md = this.model;
    // Les couches de poil du chat (maine coon, persan…) de près : c'est un gros plan.
    if (this.species === 'cat') md.setLod?.(0, true);
    // Sa coupe du salon de toilettage (celle que montre le jeu), et ses accessoires (nœud, bandana, collier).
    const cut = o.entity?.model?.cut ?? null;
    if (cut && md.setCut) md.setCut(cut);
    try {
      this.accessories = buildAccessories(md, o.a?.look ?? {}, o.a?.accessories);
    } catch {
      this.accessories = [];
    }
    for (const m of this.accessories ?? []) {
      m.traverse?.((x) => {
        if (x.isMesh) {
          x.castShadow = true;
          x.receiveShadow = true;
        }
      });
    }
    this.extra = { chew: 0, nuzzle: 0, flinch: 0, jaw: 0 };
  }

  /** Pose de repos de l'espèce (repères, vignettes). */
  restPose() {
    const md = this.model;
    if (md.photoPose) md.photoPose();
    else md.staticPose?.(REST[this.species] ?? 'stand');
    // (la pose figée tourne la tête au hasard : on la remet droite, regard devant)
    if (md.anim && this.pst) {
      const st = this.stateFor({ posture: REST[this.species], happy: 0.25 });
      st.look = new THREE.Vector3(0, 0, 1);
      for (let i = 0; i < 2; i++) md.anim.update(0.4, st);
      st.look = null;
      this.holder.updateMatrixWorld(true);
    }
  }

  /**
   * Repères au repos, sur la peau : museau (bouche), nez, tête, crâne, oreilles (le bout), encolure, garrot, dos,
   * croupe, poitrail, ventre, corps, queue, bout de la queue, pattes ; et la boîte de l'animal (repère monde).
   */
  measure() {
    const md = this.model;
    this.restPose();
    this.holder.updateMatrixWorld(true);
    const mesh = md.coatMesh;
    const sk = skinPoints(mesh, mesh.geometry.attributes.position.count > 12000 ? 2 : 1);
    this.skin = sk;
    const at = (obj, v = null) => (obj ? (v ? obj.localToWorld(v.clone()) : obj.getWorldPosition(new THREE.Vector3())) : null);
    const P = (i) => new THREE.Vector3(sk.pos[i * 3], sk.pos[i * 3 + 1], sk.pos[i * 3 + 2]);
    const reg = sk.bone.map((b) => petRegionOf(b));
    const boxOf = (f) => {
      const b = new THREE.Box3();
      for (let i = 0; i < sk.n; i++) if (f(reg[i], sk.bone[i])) b.expandByPoint(P(i));
      return b;
    };
    const all = boxOf(() => true);
    const headBox = boxOf((r) => r === 'head');
    const bodyBox = boxOf((r) => r === 'body' || r === 'shoulder' || r === 'hip');
    const L = {};
    const acc = md.accessoryFit ?? {};
    L.head = headBox.isEmpty() ? at(md.head) : headBox.getCenter(new THREE.Vector3());
    // le bout du nez : le sommet de la tête le plus en avant (il regarde vers +x)
    let nose = null;
    for (let i = 0; i < sk.n; i++) if (reg[i] === 'head' && (!nose || sk.pos[i * 3] > nose.x)) nose = P(i);
    L.nose = nose ?? L.head.clone();
    L.muzzle = acc.mouth && md.head ? at(md.head, acc.mouth) : L.nose.clone().add(new THREE.Vector3(-0.01, -0.02, 0));
    // (la bouche du modèle peut être un peu dans la tête : jamais plus loin du nez que le quart de la tête)
    const headLen = Math.max(0.02, headBox.max.x - headBox.min.x);
    if (L.muzzle.distanceTo(L.nose) > headLen * 0.45) L.muzzle = L.nose.clone().add(new THREE.Vector3(-headLen * 0.12, -headLen * 0.12, 0));
    L.poll = acc.skull && md.head ? at(md.head, acc.skull) : new THREE.Vector3(L.head.x, headBox.max.y, L.head.z);
    L.forehead = L.poll.clone().lerp(L.nose, 0.35);
    // oreilles : le sommet de chaque oreille le plus loin du centre de la tête (le bout) ; aussi sur les autres
    // maillages liés au squelette (les grandes oreilles en chauve-souris du chihuahua, du bouledogue sont à part)
    const skins = [sk];
    md.root.traverse((o) => {
      // (pas les couches de poil des chats, qui copient le pelage : seulement de petits maillages à part)
      const n = o.geometry?.attributes?.position?.count ?? 0;
      if (o.isSkinnedMesh && o !== mesh && o.visible && o.renderOrder <= 0 && o.geometry?.attributes?.skinIndex && n < mesh.geometry.attributes.position.count * 0.4) skins.push(skinPoints(o, 1));
    });
    L.ears = [];
    for (const side of ['L', 'R']) {
      let best = null;
      let bd = -1;
      for (const s of skins) {
        for (let i = 0; i < s.n; i++) {
          const b = s.bone[i];
          if (!b.startsWith('ear') || !b.endsWith(side)) continue;
          const d = (s.pos[i * 3] - L.head.x) ** 2 + (s.pos[i * 3 + 1] - L.head.y) ** 2 + (s.pos[i * 3 + 2] - L.head.z) ** 2;
          if (d > bd) {
            bd = d;
            best = new THREE.Vector3(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]);
          }
        }
      }
      if (best) L.ears.push(best);
    }
    for (const s of skins.slice(1)) for (let i = 0; i < s.n; i++) all.expandByPoint(new THREE.Vector3(s.pos[i * 3], s.pos[i * 3 + 1], s.pos[i * 3 + 2]));
    if (!L.ears.length) L.ears = (md.ears ?? []).map((e) => at(e));
    L.neck = at(md.neck) ?? L.head.clone();
    const len = Math.max(0.05, bodyBox.max.x - bodyBox.min.x);
    // le haut du corps à une abscisse donnée (garrot, dos, croupe) ; le bas (ventre)
    const topAt = (x, w = 0.08) => {
      let best = null;
      for (let i = 0; i < sk.n; i++) {
        const r = reg[i];
        if (r !== 'body' && r !== 'shoulder' && r !== 'hip' && r !== 'neck') continue;
        if (Math.abs(sk.pos[i * 3] - x) > len * w) continue;
        if (!best || sk.pos[i * 3 + 1] > best.y) best = P(i);
      }
      return best;
    };
    const lowAt = (x, w = 0.1) => {
      let best = null;
      for (let i = 0; i < sk.n; i++) {
        if (reg[i] !== 'body') continue;
        if (Math.abs(sk.pos[i * 3] - x) > len * w) continue;
        if (!best || sk.pos[i * 3 + 1] < best.y) best = P(i);
      }
      return best;
    };
    const legs = md.legs ?? [];
    const frontX = legs[0]?.top ? (at(legs[0].top).x + at(legs[1]?.top ?? legs[0].top).x) / 2 : bodyBox.max.x - len * 0.2;
    const hindX = legs[2]?.top || legs[2]?.pivot ? (at(legs[2].top ?? legs[2].pivot).x + at(legs[3]?.top ?? legs[3]?.pivot ?? legs[2].pivot).x) / 2 : bodyBox.min.x + len * 0.2;
    const midX = (frontX + hindX) / 2;
    const cz = bodyBox.isEmpty() ? 0 : (bodyBox.min.z + bodyBox.max.z) / 2;
    L.body = bodyBox.isEmpty() ? at(md.body) : bodyBox.getCenter(new THREE.Vector3());
    L.withers = topAt(frontX) ?? L.body.clone();
    L.back = topAt(midX) ?? L.body.clone();
    L.croup = topAt(hindX) ?? L.body.clone();
    L.belly = lowAt(midX) ?? L.body.clone();
    // poitrail : le plus en avant du corps, sous l'encolure
    let chest = null;
    for (let i = 0; i < sk.n; i++) {
      const r = reg[i];
      if (r !== 'body' && r !== 'shoulder' && r !== 'neck') continue;
      if (sk.pos[i * 3 + 1] > L.withers.y - (L.withers.y - L.belly.y) * 0.25) continue;
      if (!chest || sk.pos[i * 3] > chest.x) chest = P(i);
    }
    L.chest = chest ?? L.body.clone();
    L.chest.z = cz;
    // la croupe, tout au bout : le point du corps le plus en arrière (le derrière rond d'un lapin dépasse la queue)
    let rump = null;
    for (let i = 0; i < sk.n; i++) {
      const r = reg[i];
      if (r !== 'body' && r !== 'hip') continue;
      if (!rump || sk.pos[i * 3] < rump.x) rump = P(i);
    }
    L.rump = rump ?? new THREE.Vector3(bodyBox.min.x, L.back.y, cz);
    // (le poil long, poussé au rendu, dépasse la peau : angora, jupe du tête de lion)
    const b = md.build ?? {};
    const fluffy = (b.fur ?? 0) > 0.002 || (b.skirt ?? 0) > 0.1;
    if (fluffy) L.rump.x -= Math.max(0.01, (bodyBox.max.x - bodyBox.min.x) * 0.1);
    L.tail = at(md.tail) ?? new THREE.Vector3(bodyBox.min.x, L.back.y, cz);
    let tip = null;
    let td = -1;
    for (let i = 0; i < sk.n; i++) {
      if (reg[i] !== 'tail') continue;
      const d = P(i).distanceTo(L.tail);
      if (d > td) {
        td = d;
        tip = P(i);
      }
    }
    L.tailTip = tip ?? L.tail.clone();
    // (les pattes : sous l'os des doigts, au sol — la plante du pied, pour que le cadrage garde les pieds)
    L.hooves = legs.map((l) => at(l.paw ?? l.fetlock ?? l.knee)).filter(Boolean).map((p) => p.setY(Math.min(p.y, Math.max(0, all.min.y))));
    L.paws = L.hooves;
    L.top = new THREE.Vector3(L.head.x, all.max.y, cz);
    // (fluff : marge de cadrage en plus pour le poil long, qui déborde de la peau au rendu)
    L.size = { len: all.max.x - all.min.x, h: all.max.y, w: all.max.z - all.min.z, headLen, fluff: fluffy ? 1.1 : 1 };
    this.marks = L;
    this.box = all;
    // (la place des repères de la tête dans le repère de son os, au repos : live les suit quand la tête bouge)
    this.restHead = {};
    if (md.head) for (const k of ['muzzle', 'nose', 'head', 'forehead', 'poll']) this.restHead[k] = md.head.worldToLocal(L[k].clone());
    // (le bout des oreilles aussi, 'ear0' et 'ear1' : approché par l'os de la tête, pour vérifier les cadrages)
    if (md.head) L.ears.forEach((e, i) => { this.restHead[`ear${i}`] = md.head.worldToLocal(e.clone()); });
  }

  /** Repères dans la pose du moment (la tête bouge) : bouche, nez, tête, front. */
  live(name) {
    const h = this.model.head;
    const loc = this.restHead?.[name];
    if (h && loc) return h.localToWorld(_w.copy(loc)).clone();
    return this.marks[name]?.clone?.() ?? null;
  }

  /**
   * Où est sa bouche quand il mange (ou boit) dans la gamelle (son animation, mesurée sur ce gabarit) ? Repère
   * monde ; puis il reprend sa pose de repos.
   */
  eatMuzzle(kind = 'eat') {
    const md = this.model;
    if (!md.anim) return this.marks.muzzle.clone();
    const st = this.stateFor({ ...this.mood, eat: kind, look: null, lookAmt: 0 });
    for (let i = 0; i < 20; i++) md.anim.update(0.2, st);
    this.holder.updateMatrixWorld(true);
    const p = this.live('muzzle');
    this.restPose();
    this.holder.updateMatrixWorld(true);
    return p;
  }

  /** L'état que lit l'animation du modèle, d'après ce que le jeu demande (mood). */
  stateFor(m) {
    const st = this.pst;
    const sp = this.species;
    st.v = 0;
    st.moving = false;
    st.sleeping = false;
    st.quick = false;
    st.size = this.double.scale;
    const w = Number.isFinite(this.a?.weight) ? this.a.weight : 50;
    st.fat = 1 + ((w - 50) / 50) * 0.6;
    const scared = (m.annoyed ?? 0) > 0 || m.ears === 'back';
    st.sad = !!m.sad;
    st.happy = Math.max(0, Math.min(1, m.happy ?? 0.25));
    const eat = m.eat ?? (m.feeder > 0.5 ? 'eat' : null);
    if (sp === 'dog') {
      st.posture = eat ? 'stand' : m.posture ?? 'stand';
      st.action = eat ?? m.action ?? null;
      st.sad = st.sad || scared;
      st.hot = !!m.pant;
      if (scared) st.happy = 0;
    } else if (sp === 'cat') {
      st.posture = eat ? 'crouch' : m.posture ?? 'stand';
      st.fear = scared;
      if (scared) st.happy = 0;
    } else {
      st.posture = eat ? 'eat' : m.sniff ? 'sniff' : m.posture ?? 'crouch';
      st.fear = scared;
      st.alert = m.ears === 'forward';
      if (scared) st.happy = 0;
    }
    // regard : de la tête vers ce qu'on lui montre, dans le repère de l'animal (ses anims tournent l'encolure)
    st.look = null;
    if (m.look && (m.lookAmt ?? 0) > 0.02 && this.model.head) {
      const head = this.model.head.getWorldPosition(_w);
      const d = _v.copy(m.look).sub(head);
      d.applyQuaternion(_q.copy(this.holder.quaternion).invert());
      // (lookAmt : à moitié, il tourne la tête à moitié — mélange avec « droit devant »)
      const k = Math.min(1, m.lookAmt);
      const l = d.length();
      this.lookV ??= new THREE.Vector3();
      st.look = this.lookV.set(d.x * k, d.y * k, d.z * k + l * (1 - k));
    }
    return st;
  }

  /**
   * Une image de vie : l'animation du modèle pilotée par mood (posture, manger, regarder, content, apeuré), puis
   * les petits gestes : mâcher, tendre le nez, sursauter quand on va trop fort.
   */
  life(dt) {
    const md = this.model;
    const m = this.mood;
    const st = this.stateFor(m);
    // Marcher jusqu'à walkTo (repère monde, en x : il vient jusqu'à sa gamelle) : son allure, à sa vitesse.
    this.baseX ??= this.holder.position.x;
    if (m.walkTo !== null && m.walkTo !== undefined) {
      const d = m.walkTo - this.baseX;
      if (Math.abs(d) > 0.004) {
        const sc = this.double.scale;
        const speed = (this.species === 'rabbit' ? 0.32 : this.species === 'cat' ? 0.42 : 0.55) * sc;
        this.baseX += Math.sign(d) * Math.min(Math.abs(d), speed * dt);
        st.moving = true;
        st.v = speed / sc;
        if (this.species === 'rabbit') st.posture = 'crouch';
        else st.posture = 'stand';
        st.action = null;
      }
    }
    // Conduit par le jeu (jouer à la balle) : sa place sur le sol (x, z) et sa vitesse ; il se tourne vers où il va.
    if (m.drive) {
      const d = m.drive;
      const sc = this.double.scale;
      if (d.speed > 0.02 && d.heading !== undefined) {
        let dh = d.heading - this.holder.rotation.y;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        this.holder.rotation.y += dh * ease(dt, 0.12);
      }
      this.baseX = d.x;
      this.holder.position.z = d.z;
      st.moving = d.speed > 0.04 * sc;
      st.v = d.speed / sc;
      if (st.moving) {
        st.posture = this.species === 'rabbit' ? 'crouch' : 'stand';
        st.action = null;
      }
    }
    if (md.anim) md.anim.update(dt, st);
    const x = this.extra;
    m.annoyed = Math.max(0, (m.annoyed ?? 0) - dt);
    // Sursaut : un petit recul du corps entier, vite revenu.
    if (m.flinch > 0) {
      x.flinch = Math.max(x.flinch, m.flinch);
      m.flinch = 0;
    }
    x.flinch = Math.max(0, x.flinch - dt * 2.2);
    const back = Math.sin(Math.min(1, x.flinch) * Math.PI) * 0.06 * this.double.scale;
    this.holder.position.x = this.baseX - back;
    if (!md.head || !md.neck) return;
    // Tendre le nez (vers la main, la friandise) ; mâcher (la tête qui bouge un peu, la mâchoire s'il en a une).
    x.nuzzle = approachAngle(x.nuzzle, m.nuzzle ?? 0, dt, 0.25, 1);
    if (x.nuzzle > 0.01) md.neck.quaternion.multiply(_q.setFromAxisAngle(AX, -0.1 * x.nuzzle));
    x.chew = x.chew + ((m.chew ?? 0) - x.chew) * ease(dt, 0.2);
    if (x.chew > 0.01) {
      const c = Math.sin(this.time * (this.species === 'rabbit' ? 16 : 10));
      md.head.quaternion.multiply(_q.setFromAxisAngle(AX, c * 0.03 * x.chew));
      const jaw = md.bone?.('jaw');
      if (jaw) jaw.quaternion.multiply(_q.setFromAxisAngle(AX, (0.5 + 0.5 * c) * 0.12 * x.chew));
    }
    if (m.nod > 0) {
      md.head.quaternion.multiply(_q.setFromAxisAngle(AX, Math.sin(this.time * 9) * 0.06 * m.nod));
      m.nod = Math.max(0, m.nod - dt * 0.9);
    }
  }

  /**
   * Une image : la vie (l'animation du modèle), puis ce qu'un jeu impose au modèle par-dessus son animation
   * (sc.mood.pose(dt) : une patte présentée pour les griffes…), avant le rendu.
   */
  update(dt) {
    super.update(dt);
    if (this.mood.pose) {
      this.holder.updateMatrixWorld(true);
      this.mood.pose(dt);
      this.holder.updateMatrixWorld(true);
    }
  }

  /**
   * La caméra, avec son plan proche à la mesure du gros plan : à 6 cm de la patte d'un chihuahua, le plan proche du
   * cheval (5 cm) coupait les coussinets en anneaux.
   */
  updateCamera(dt) {
    super.updateCamera(dt);
    const d = this.camPos.distanceTo(this.camTarget);
    const near = Math.min(0.05, Math.max(0.004, d * 0.12));
    if (Math.abs(near - this.camera.near) > 1e-4) {
      this.camera.near = near;
      this.camera.updateProjectionMatrix();
    }
  }

  /** Le doigt sur l'animal ? Régions des modèles de compagnie (petRegionOf). */
  pickAnimal(x, y) {
    const h = super.pickAnimal(x, y);
    if (h) h.region = petRegionOf(h.boneName);
    return h;
  }

  /** Pas de buée dans la maison ni au clapier (le souffle des naseaux est celui du cheval par temps froid). */
  puff() {
    return false;
  }

  dispose() {
    if (this.disposed) return;
    removeAccessories(this.accessories);
    this.accessories = [];
    super.dispose();
  }
}

// Couper les griffes en 3D (chien, chat, lapin) : la logique est celle du jeu dessiné (grooming.js nailsGame : un
// seul coup de pince par griffe, quand elle passe dans la zone verte ; trop près du rose, la veine, ça fait mal).
//
// C'est un gros plan, comme le cure-pied du cheval : il donne la patte (le chien assis, le chat qui tend la patte, le
// lapin dressé) et on la voit de tout près, paume vers nous, comme dans le jeu dessiné : les coussinets, et les
// quatre griffes dressées au bout des doigts ; la patte remplit l'image. Les griffes sont de vraies griffes posées au
// bout des doigts (liées à l'os : elles suivent la patte), claires et translucides : on voit la veine rose dedans. La
// bande verte entoure la griffe en cours ; notre pince guillotine glisse le long d'elle, un trait pointillé montre où
// elle couperait ; clac : le bout tombe. Une griffe coupée dans le rose : il retire la patte, oreilles en arrière.
//
// La patte est présentée par le jeu, par-dessus l'animation du modèle (sc.mood.pose, voir petStage.js update) :
// l'avant-bras vers l'avant, le poignet plié, les doigts vers le haut, la paume vers nous. Ainsi le même cadrage
// marche du chihuahua au saint-bernard, du sphynx au persan, et pour le lapin.

import * as THREE from 'three';
import { nailsGame } from './grooming.js';
import { withLogic } from './care3d.js';
import { realDogPose } from '../../game/models/dogReal.js';
import { realCatPose } from '../../game/models/catReal.js';
import { own, shadowed } from '../../game/care/petProps.js';
import { skinPoints } from '../../game/care/petStage.js';
import { audio } from '../../game/audio.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const happySound = (sc) => audio.animal?.(sc.a?.species ?? 'dog', 'happy', sc.a?.id ?? null);
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
const _m = new THREE.Matrix4();

/** Une griffe (pointe vers +y, base à l'origine, longueur 1) : un croc courbe vers -z (le dessous du doigt). */
function clawGeometry(thick = 0.15) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    pts.push(new THREE.Vector2(thick * Math.pow(1 - k, 0.75) + 0.006, k));
  }
  const g = new THREE.LatheGeometry(pts, 14);
  // un peu aplatie sur les côtés (une griffe est plus haute que large), courbée vers -z
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) * 0.72);
    p.setZ(i, p.getZ(i) - y * y * 0.3);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * La pince à griffes (guillotine) : l'anneau où passe la griffe (axe +z), la lame qui glisse dans l'anneau, la tête
 * en acier et deux poignées orange vers -y. Origine : le milieu de l'anneau. r : rayon de l'anneau.
 */
function clipper(keep, r) {
  const g = new THREE.Group();
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 0.85, roughness: 0.25 }));
  const orange = keep(new THREE.MeshStandardMaterial({ color: 0xe8743a, roughness: 0.42 }));
  const grip = keep(new THREE.MeshStandardMaterial({ color: 0xc2552a, roughness: 0.7 }));
  const ring = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(r, r * 0.22, 10, 28)), steel));
  g.add(ring);
  // (la lame : une plaque d'acier qui glisse dans l'anneau, du côté des poignées)
  const blade = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(r * 1.5, r * 0.5, r * 0.12)), steel));
  blade.position.set(0, -r * 0.95, r * 0.18);
  g.add(blade);
  const neck = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(r * 0.32, r * 0.42, r * 3.2, 12)), steel));
  neck.position.set(0, -r * 2.5, 0);
  g.add(neck);
  const L = r * 9;
  for (const sd of [-1, 1]) {
    const h = shadowed(new THREE.Mesh(keep(new THREE.CapsuleGeometry(r * 0.48, L, 4, 12)), orange));
    h.position.set(sd * r * 0.9, -r * 4.1 - L / 2, 0);
    h.rotation.z = sd * 0.1;
    g.add(h);
    const end = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(r * 0.62, 12, 8)), grip));
    end.position.set(sd * (r * 0.9 + Math.sin(0.1) * L), -r * 4.1 - L, 0);
    g.add(end);
  }
  return g;
}

/** Quaternion d'une base : x, puis y (rendu orthogonal à x), z = x × y. */
function basisQ(x, y, out = new THREE.Quaternion()) {
  const X = x.clone().normalize();
  const Y = y.clone().addScaledVector(X, -y.dot(X)).normalize();
  return out.setFromRotationMatrix(_m.makeBasis(X, Y, new THREE.Vector3().crossVectors(X, Y)));
}

/** Tourne un os de la rotation D (repère monde). */
function rotateWorld(bone, D) {
  if (!bone?.parent) return;
  const target = D.clone().multiply(bone.getWorldQuaternion(new THREE.Quaternion()));
  bone.quaternion.copy(bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(target));
  bone.updateMatrixWorld(true);
}

export function petNails3dGame(ctx) {
  const sc = ctx.scene;
  const sp = sc.species;
  sc.decor.layout('rest');
  const md = sc.model;
  const L = sc.marks;
  const keep = own();
  const m = sc.mood;
  const front = (md.legs ?? []).slice(0, 2).filter((l) => l?.paw);
  // L'avant des doigts et leur dessus, dans le repère de l'os des doigts : lus sur la pose de liaison du modèle
  // (debout, les pattes à plat, il regarde vers +z), pas sur l'animation du moment.
  const skel = md.coatMesh.skeleton;
  const bindAt = (bone) => {
    const i = skel.bones.indexOf(bone);
    return i < 0 ? null : skel.boneInverses[i];
  };
  const bindPos = (name) => {
    const b = skel.getBoneByName(name);
    const inv = b && bindAt(b);
    return inv ? new THREE.Vector3().setFromMatrixPosition(inv.clone().invert()) : null;
  };
  const hips = [bindPos('femurL'), bindPos('femurR')].filter(Boolean);
  const headB = bindPos('head');
  const bindFwd = headB && hips.length ? headB.clone().sub(hips.reduce((s, p) => s.add(p), v3()).multiplyScalar(1 / hips.length)) : v3(0, 0, 1);
  bindFwd.y = 0;
  bindFwd.normalize();
  const restAxes = new Map(front.map((l) => {
    const inv = bindAt(l.paw);
    return [l, { fwd: bindFwd.clone().transformDirection(inv), up: v3(0, 1, 0).transformDirection(inv) }];
  }));
  const hq = sc.holder.getWorldQuaternion(new THREE.Quaternion());
  const FWD = v3(1, 0, 0).applyQuaternion(hq);
  const UP = v3(0, 1, 0);
  const SIDE = v3(0, 0, 1).applyQuaternion(hq); // (notre côté)
  // Il donne la patte : le chien assis (« donne la patte »), le chat (« tape-m'en cinq »), le lapin dressé.
  const clip = () => {
    if (sp === 'dog') realDogPose(md, 'paw', 1);
    else if (sp === 'cat') realCatPose(md, 'paw', 1);
  };
  m.posture = sp === 'rabbit' ? 'rear' : 'sit';
  m.ears = 'forward';
  m.happy = 0.4;
  for (let i = 0; i < 25; i++) {
    clip();
    sc.update(0.1);
  }
  sc.holder.updateMatrixWorld(true);
  // La patte présentée : celle que son geste lève (la plus haute) ; le lapin, celle de notre côté.
  const body = L.body.clone();
  const sideOf = (l) => Math.sign(l.paw.getWorldPosition(v3()).sub(body).dot(SIDE)) || 1;
  const leg = sp === 'rabbit'
    ? front.reduce((b, l) => (l.paw.getWorldPosition(v3()).dot(SIDE) > b.paw.getWorldPosition(v3()).dot(SIDE) ? l : b), front[0])
    : front.reduce((b, l) => (l.paw.getWorldPosition(v3()).y > b.paw.getWorldPosition(v3()).y ? l : b), front[0]);
  const ax = restAxes.get(leg);
  const sd = sideOf(leg);
  // Où va la patte (repère de l'animal) : « tape-m'en cinq ». L'avant-bras vers l'avant et un peu vers le haut, le
  // poignet plié en arrière, les doigts vers le haut, la paume (les coussinets) vers nous : comme le jeu dessiné, les
  // griffes dressées au bout des doigts. La caméra : devant lui, à hauteur de la patte, de notre côté.
  const toCam = FWD.clone().addScaledVector(UP, 0.12).addScaledVector(SIDE, 0.45).normalize();
  const ARM = FWD.clone().addScaledVector(UP, 0.5).addScaledVector(SIDE, 0.15 * sd).normalize();
  const TOES = FWD.clone().multiplyScalar(0.2).addScaledVector(UP, 1).addScaledVector(SIDE, 0.05 * sd).normalize();
  const DORSAL = toCam.clone().negate().addScaledVector(TOES, toCam.dot(TOES)).normalize();
  const BW = basisQ(TOES, DORSAL);
  /** L'avant et le dessus des doigts, maintenant (repère monde). */
  const toeAxes = () => ({ f: ax.fwd.clone().transformDirection(leg.paw.matrixWorld), u: ax.up.clone().transformDirection(leg.paw.matrixWorld) });
  let drop = 0; // (aïe : il retire la patte)
  let weight = 0;
  const wrist = leg.fetlock && leg.fetlock !== leg.paw ? leg.fetlock : leg.knee;
  const present = (dt) => {
    weight = Math.min(1, weight + dt * 3);
    const w = weight * (1 - 0.75 * Math.sin(Math.min(1, drop) * Math.PI));
    const k0 = leg.knee?.quaternion.clone();
    const w0q = wrist.quaternion.clone();
    // l'avant-bras vers l'avant
    if (leg.knee && leg.fetlock && leg.knee !== wrist) {
      for (let k = 0; k < 2; k++) {
        const cur = leg.fetlock.getWorldPosition(v3()).sub(leg.knee.getWorldPosition(v3())).normalize();
        rotateWorld(leg.knee, new THREE.Quaternion().setFromUnitVectors(cur, ARM));
      }
    }
    // le poignet : les doigts vers le haut, la paume vers nous (trois petits pas : la rotation d'un os se lit sur
    // les matrices, celle qu'on demande n'est pas tout à fait celle qu'on obtient)
    for (let k = 0; k < 3; k++) {
      const t = toeAxes();
      rotateWorld(wrist, BW.clone().multiply(basisQ(t.f, t.u).invert()));
    }
    // (il retire la patte : mélangé avec son geste à lui)
    if (w < 0.999) {
      if (leg.knee && k0) leg.knee.quaternion.copy(k0.slerp(leg.knee.quaternion, w));
      wrist.quaternion.copy(w0q.slerp(wrist.quaternion, w));
    }
  };
  m.pose = (dt) => {
    clip();
    present(dt);
  };
  // (la patte prend sa place tout de suite)
  weight = 1;
  for (let i = 0; i < 6; i++) sc.update(0.1);
  sc.holder.updateMatrixWorld(true);

  // ---- la patte, mesurée sur sa peau : le bout des doigts, leur largeur, leur épaisseur
  const paw = leg.paw;
  const t0 = toeAxes();
  const F = t0.f; // (vers le bout des doigts)
  const U = t0.u.addScaledVector(F, -t0.u.dot(F)).normalize(); // (le dessus des doigts)
  const W = new THREE.Vector3().crossVectors(F, U).normalize();
  const pw = paw.getWorldPosition(v3());
  const sk = skinPoints(md.coatMesh, 1);
  const P = [];
  for (let i = 0; i < sk.n; i++) if (sk.bone[i] === paw.name) P.push(v3(sk.pos[i * 3], sk.pos[i * 3 + 1], sk.pos[i * 3 + 2]).sub(pw));
  let tipD = 0;
  for (const p of P) tipD = Math.max(tipD, p.dot(F));
  let w0 = 0;
  let w1 = 0;
  let h0 = 0;
  let h1 = 0;
  for (const p of P) {
    if (p.dot(F) < tipD * 0.45) continue;
    w0 = Math.min(w0, p.dot(W));
    w1 = Math.max(w1, p.dot(W));
    h0 = Math.min(h0, p.dot(U));
    h1 = Math.max(h1, p.dot(U));
  }
  const width = Math.max(0.012, w1 - w0, L.size.len * 0.04);
  const thick = Math.max(width * 0.35, h1 - h0);
  const tipC = pw.clone().addScaledVector(F, tipD * 0.97).addScaledVector(W, (w0 + w1) / 2).addScaledVector(U, h0 + thick * 0.4);
  // ---- les quatre griffes : du bout des doigts, courbées vers le dessous ; un peu plus grandes que nature chez les
  // tout petits (une griffe de chihuahua ferait 4 mm), pour qu'on les voie bien
  const clawLen = Math.max(width * (sp === 'cat' ? 0.5 : 0.56), 0.011);
  const geo = keep(clawGeometry());
  const tone = sp === 'rabbit' ? 0xf3ead8 : 0xf6efe0;
  const clawMat = keep(new THREE.MeshStandardMaterial({ color: tone, roughness: 0.25, transparent: true, opacity: 0.62, depthWrite: false, emissive: 0x3a3024, emissiveIntensity: 0.2 }));
  const quickMat = keep(new THREE.MeshStandardMaterial({ color: 0xff6f8e, roughness: 0.45, emissive: 0xb02848, emissiveIntensity: 0.55, transparent: true }));
  const greenMat = keep(new THREE.MeshBasicMaterial({ color: 0x2fbf62, transparent: true, opacity: 0.7, depthWrite: false, side: THREE.DoubleSide }));
  let claws = [];
  let cur = 0;
  const play = withLogic(ctx, nailsGame, () => sc.project(claws[Math.min(3, cur)].g.localToWorld(v3(0, 0.5, 0))));
  const s0 = play.peek();
  const C = F.clone().addScaledVector(U, -0.3).normalize(); // (l'axe des griffes : un peu courbées vers la paume)
  const spread = width * 0.27;
  claws = [-1.5, -0.5, 0.5, 1.5].map((k) => {
    const g = new THREE.Group();
    // (les griffes du milieu dépassent un peu plus, comme les doigts)
    const base = tipC.clone().addScaledVector(W, k * spread).addScaledVector(F, (Math.abs(k) < 1 ? 0 : -0.12) * width);
    g.position.copy(base);
    // (local : +y l'axe de la griffe, -z le dessous)
    g.quaternion.copy(new THREE.Quaternion().setFromRotationMatrix(_m.makeBasis(new THREE.Vector3().crossVectors(C, U).normalize(), C, U.clone().addScaledVector(C, -U.dot(C)).normalize())));
    g.scale.setScalar(clawLen);
    const claw = shadowed(new THREE.Mesh(geo, clawMat), false);
    claw.renderOrder = 53;
    g.add(claw);
    const quick = shadowed(new THREE.Mesh(geo, quickMat), false);
    quick.scale.set(0.55, s0.quick, 0.55);
    quick.renderOrder = 52;
    g.add(quick);
    const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.2, 0.2, s0.uHi - s0.uLo, 18, 1, true)), greenMat);
    band.position.y = (s0.uLo + s0.uHi) / 2;
    band.position.z = -0.04 * band.position.y;
    band.scale.set(0.85, 1, 1);
    band.visible = false;
    band.renderOrder = 54;
    g.add(band);
    sc.scene.add(g);
    paw.attach(g);
    return { g, claw, quick, band, cutAt: 1 };
  });
  // ---- la pince
  const tool = clipper(keep, clawLen * 0.32);
  tool.traverse((o) => {
    o.renderOrder = 51;
    if (o.material) o.material.transparent = true;
  });
  sc.scene.add(tool);
  const pads = [];
  let cuts = [null, null, null, null];
  let snip = 0;
  let react = 0;
  let happyT = 0;
  let saidHappy = false;
  // Cadrage : la patte en gros plan, de face, à sa hauteur ; ses coussinets et ses griffes remplissent l'image.
  const tipAt = (c) => c.g.localToWorld(v3(0, 1, 0));
  const frame = (now = false) => {
    const pts = [];
    for (const c of claws) pts.push(c.g.getWorldPosition(v3()), tipAt(c));
    pts.push(tipC.clone().addScaledVector(W, -width * 0.62), tipC.clone().addScaledVector(W, width * 0.62), tipC.clone().addScaledVector(F, -width * 0.9));
    sc.frame(pts, { dir: toCam.toArray(), pad: 1.25, now });
  };
  frame(true);
  // (de gauche à droite à l'écran, comme le jeu dessiné)
  sc.updateCamera(0);
  claws.sort((p, q) => sc.project(p.g.getWorldPosition(v3())).x - sc.project(q.g.getWorldPosition(v3())).x);
  // ---- les coussinets (quand la robe du modèle ne les peint pas) : quatre petits et le grand, sur la paume
  if (sp === 'cat' || (sp === 'dog' && md.kind !== 'shiba')) {
    sc.proxy.bake();
    const coatL = new THREE.Color(ctx.col?.coat ?? '#c8a070').getHSL({}).l;
    const padCol = sp === 'dog' || coatL < 0.3 ? 0x332a29 : 0xe49aa2;
    // (dessinés après le poil et par-dessus lui : les couches de poil des races à poil long, transparentes et
    // dessinées tard, couvriraient les coussinets ; puis la pince, la veine et les griffes, dans cet ordre)
    const padMat = keep(new THREE.MeshStandardMaterial({ color: padCol, roughness: 0.55, transparent: true, depthTest: false }));
    const padGeo = keep(new THREE.SphereGeometry(1, 18, 12));
    const mid = (w0 + w1) / 2;
    const fp = tipD * 0.7;
    const spots = [-1.5, -0.5, 0.5, 1.5].map((k) => ({ f: fp - (Math.abs(k) > 1 ? 0.1 : 0) * width, w: mid + k * spread * 0.9, rw: width * 0.12, rf: width * 0.145 }));
    spots.push({ f: fp - width * 0.44, w: mid, rw: width * 0.28, rf: width * 0.2 });
    const ray = new THREE.Ray();
    for (const q of spots) {
      const o = pw.clone().addScaledVector(F, q.f).addScaledVector(W, q.w).addScaledVector(U, -0.5);
      ray.set(o, U.clone());
      const h = sc.proxy.hit(ray, -9, 1e9);
      if (!h) continue;
      const n = h.normal.clone().normalize();
      if (n.dot(U) > 0) n.negate();
      const pad = shadowed(new THREE.Mesh(padGeo, padMat), false);
      pad.position.copy(h.point).addScaledVector(n, q.rw * 0.32);
      const y = F.clone().addScaledVector(n, -F.dot(n)).normalize();
      pad.quaternion.setFromRotationMatrix(_m.makeBasis(new THREE.Vector3().crossVectors(y, n), y, n));
      pad.scale.set(q.rw, q.rf, q.rw * 0.38);
      pad.renderOrder = 50;
      sc.scene.add(pad);
      paw.attach(pad);
      pads.push(pad);
    }
  }
  return {
    peek: () => {
      const c = claws[Math.min(3, cur)];
      const a = sc.project(c.g.getWorldPosition(v3()));
      const b = sc.project(tipAt(c));
      return { ...play.peek(), clawTip: b, clawBase: a, clawPx: Math.hypot(b.x - a.x, b.y - a.y), clawLen, width };
    },
    down: (p) => play.down(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = play.peek();
      // une griffe vient d'être coupée : le bout tombe ; dans le rose, il retire la patte, oreilles en arrière
      for (let i = 0; i < 4; i++) {
        if (s.cuts[i] !== null && cuts[i] === null) {
          const c = claws[i];
          const u = 1 - s.cuts[i];
          c.cutAt = u;
          c.claw.scale.y = u;
          const bit = new THREE.Mesh(geo, clawMat);
          c.g.updateMatrixWorld(true);
          bit.position.copy(c.g.localToWorld(v3(0, u, 0)));
          bit.quaternion.copy(c.g.getWorldQuaternion(new THREE.Quaternion()));
          bit.scale.set(clawLen * 0.8, clawLen * (1 - u), clawLen * 0.8);
          bit.userData.shared = true;
          bit.geometry.userData.shared = true;
          bit.material.userData.shared = true;
          sc.spawn(bit, { life: 0.8, v: v3((Math.random() - 0.5) * 0.2, 0.1, 0.1), grav: 2, fade: false });
          snip = 1;
          if (u < s.quick + 0.04) {
            react = 1.3;
            drop = 0.001;
            m.annoyed = 1.4;
            m.flinch = 1;
            sc.shake = 0.3;
          } else {
            happyT = 1;
            if (!saidHappy) {
              saidHappy = true;
              happySound(sc);
            }
          }
        }
      }
      cuts = s.cuts.slice();
      cur = Math.min(3, s.cur);
      snip = Math.max(0, snip - dt * 4);
      react = Math.max(0, react - dt);
      happyT = Math.max(0, happyT - dt);
      if (drop > 0) drop = drop >= 1 ? 0 : Math.min(1, drop + dt * 1.4);
      for (let i = 0; i < 4; i++) claws[i].band.visible = i === s.cur && !ctx.done;
      // la pince : la griffe en cours dans son anneau, à la hauteur des ciseaux du jeu dessiné ; les poignées vers nous,
      // en bas à droite
      const c = claws[cur];
      c.g.updateMatrixWorld(true);
      const at = c.g.localToWorld(v3(0, ctx.done ? 1 : s.u, 0));
      tool.visible = !ctx.done;
      tool.position.copy(at);
      const axis = c.g.localToWorld(v3(0, 1, 0)).sub(c.g.getWorldPosition(v3())).normalize();
      const cam = sc.camera;
      const right = v3(1, 0, 0).applyQuaternion(cam.quaternion);
      const camUp = v3(0, 1, 0).applyQuaternion(cam.quaternion);
      const toward = cam.position.clone().sub(at).normalize();
      // (les poignées vers l'extérieur de la patte, du côté de la griffe, un peu vers le haut et vers nous : elles ne
      // passent jamais devant la patte)
      const side = sc.project(c.g.getWorldPosition(v3())).x < sc.project(tipC).x ? -1 : 1;
      const out = right.clone().multiplyScalar(side).addScaledVector(camUp, 0.3).addScaledVector(toward, 0.55);
      const down = out.addScaledVector(axis, -out.dot(axis)).normalize().negate(); // (-y local : vers les poignées)
      const x = new THREE.Vector3().crossVectors(down, axis).normalize();
      tool.quaternion.setFromRotationMatrix(_m.makeBasis(x, down, axis));
      tool.rotateZ(snip * 0.2);
      // lui : il regarde sa patte (et nous), calme ; aïe : il détourne la tête
      m.look = react > 0 ? sc.camera.position.clone().add(v3(0, 0.5, -1)) : tipC.clone().lerp(sc.camera.position, 0.5);
      m.lookAmt = 0.6;
      m.happy = react > 0 ? 0 : 0.5;
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      const v = ctx.view;
      // 1/4 : la griffe en cours
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.88)';
      g.beginPath();
      g.roundRect(v.x0 + 10, v.y0 + 10, 132, 40, 14);
      g.fill();
      g.font = `18px ${EMOJI}`;
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText('✂️', v.x0 + 20, v.y0 + 30);
      for (let i = 0; i < 4; i++) {
        const done = s.cuts[i] !== null;
        const bad = done && 1 - s.cuts[i] < s.quick + 0.04;
        g.fillStyle = done ? (bad ? '#e0574a' : '#3fae62') : i === s.cur ? '#f2c84b' : '#d9d2c2';
        g.beginPath();
        g.arc(v.x0 + 58 + i * 22, v.y0 + 30, 7, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      // où couperait la pince : un trait pointillé rouge en travers de la griffe en cours (comme le jeu dessiné)
      if (!ctx.done && s.cur < 4) {
        const c = claws[s.cur];
        const a = sc.project(c.g.localToWorld(v3(0, s.u, 0)));
        const b = sc.project(c.g.localToWorld(v3(0, Math.min(1, s.u + 0.1), 0)));
        const r = Math.max(10, sc.projectRadius(c.g.localToWorld(v3(0, s.u, 0)), clawLen * 0.32)) + 6;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 1;
        dx /= d;
        dy /= d;
        const inZone = s.u >= s.uLo && s.u <= s.uHi;
        g.save();
        g.strokeStyle = s.u < s.quick + 0.04 ? '#e0273f' : inZone ? '#1e9a4e' : '#e0574a';
        g.lineWidth = 3;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.moveTo(a.x - dy * r, a.y + dx * r);
        g.lineTo(a.x + dy * r, a.y - dx * r);
        g.stroke();
        g.restore();
      }
      // sa tête (il réagit) : dans une bulle, en haut à droite
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.88)';
      g.beginPath();
      g.arc(v.x1 - 40, v.y0 + 40, 30, 0, Math.PI * 2);
      g.fill();
      g.font = `36px ${EMOJI}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText(react > 0 ? '😣' : happyT > 0 ? '😊' : ctx.sp?.emoji ?? '🐾', v.x1 - 40, v.y0 + 42);
      g.restore();
      // ✅ / 🩹 au bout des griffes coupées
      for (let i = 0; i < 4; i++) {
        if (s.cuts[i] === null) continue;
        const c = claws[i];
        const p = sc.project(c.g.localToWorld(v3(0, c.cutAt + 0.45, 0)));
        const bad = c.cutAt < s.quick + 0.04;
        g.save();
        g.font = `17px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText(bad ? '🩹' : '✅', p.x, p.y);
        g.restore();
      }
    },
    destroy() {
      m.pose = null;
      for (const c of claws) c.g.parent?.remove(c.g);
      for (const p of pads) p.parent?.remove(p);
      sc.scene.remove(tool);
      keep.dispose();
    },
  };
}

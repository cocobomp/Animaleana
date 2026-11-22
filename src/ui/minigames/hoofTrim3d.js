// Parer les onglons de la chèvre, en 3D. La logique est celle du jeu dessiné (grooming.js nailsGame : deux pieds,
// deux onglons chacun ; la lame glisse le long de l'onglon, on coupe quand elle est dans la zone verte ; trop court,
// c'est le vif, rose, ça fait mal) : la note et les textes ne changent pas.
// Ici, dans la chèvrerie, on lève le pied de devant de la chèvre (le genou plié, la sole vers le haut), puis celui de
// derrière (tiré en arrière, le jarret ouvert) ; notre main tient le pied. On voit le sabot fendu par-dessous : les
// deux onglons, leur paroi de corne, la sole claire, les talons, et la corne qui a trop poussé et se replie sur la
// sole. Le sécateur à onglons glisse le long de l'onglon, la bande verte dit où couper ; clac : le bout de corne
// tombe dans la paille, la coupe est claire. Dans le vif : la coupe est rose, elle retire le pied, oreilles couchées.

import * as THREE from 'three';
import { nailsGame } from './grooming.js';
import { withLogic } from './care3d.js';
import { goatHoofModel, hoofTrimmer } from '../../game/care/goatHoof.js';
import { handModel, aimHand, avatarHand } from '../../game/care/props.js';
import { callOut } from './farm3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const EMOJI = '"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';

export function hoofTrim3dGame(ctx) {
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const md = sc.model;
  const L = sc.marks;
  const u = L.u;
  const m = sc.mood;
  const disp = [];
  const keep = (x) => {
    disp.push(x);
    return x;
  };
  // Repère de chaque pied au repos (debout) : la sole vers le bas, la pince vers l'avant (+x : il regarde vers +x).
  sc.holder.updateMatrixWorld(true);
  const rest = (md.legs ?? []).map((l) => {
    const qi = l.paw.getWorldQuaternion(new THREE.Quaternion()).invert();
    return { down: v3(0, -1, 0).applyQuaternion(qi), fwd: v3(1, 0, 0).applyQuaternion(qi) };
  });
  // Les deux pieds parés : celui de devant puis celui de derrière, du côté de la caméra (+z).
  const near = (front) => {
    let best = -1;
    let bz = -Infinity;
    (md.legs ?? []).forEach((l, i) => {
      if (l.front !== front) return;
      const z = l.paw.getWorldPosition(v3()).z;
      if (z > bz) {
        bz = z;
        best = i;
      }
    });
    return best;
  };
  const feet = [near(true), near(false)];
  const hoofCol = md.build?.colors?.hoof ?? 0x2a221d;
  const Ls = THREE.MathUtils.clamp(0.072 * u, 0.026, 0.085);

  // La logique du jeu dessiné ; le bouton « Couper » attend que le pied soit levé et tenu.
  let ready = false;
  const gctx = Object.create(ctx);
  gctx.button = (label, opts = {}) => ctx.button(label, { ...opts, onTap: (...args) => { if (ready) opts.onTap?.(...args); } });
  let hoof = null;
  let cur = 0;
  const clawOf = (i) => hoof?.claws[i % 2] ?? null;
  const play = withLogic(gctx, nailsGame, () => {
    const c = clawOf(cur);
    return c ? sc.project(hoof.group.localToWorld(c.at(0.8))) : { x: 200, y: 140 };
  });
  const s0 = play.peek();

  // notre main qui tient le pied (le paturon), et le sécateur
  const hand = handModel(keep, { ...avatarHand(sc.game?.profile), grip: 0.85 });
  hand.scale.setScalar(THREE.MathUtils.clamp(u / 0.75, 0.7, 1) * 0.82);
  hand.visible = false;
  sc.scene.add(hand);
  const tool = hoofTrimmer(keep, THREE.MathUtils.clamp(Ls / 0.075, 0.45, 1));
  tool.visible = false;
  sc.scene.add(tool);
  // bande verte (la zone où couper) : un anneau autour de l'onglon en cours
  const greenMat = keep(new THREE.MeshBasicMaterial({ color: 0x3fae62, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide }));
  const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(1, 1, 1, 18, 1, true)), greenMat);
  band.visible = false;
  sc.scene.add(band);

  // (au début, entre deux pieds et à la fin : la chèvre de profil, de la tête aux sabots)
  const wide = (now) => sc.frame([L.muzzle, L.poll, L.withers, L.chest, L.croup, ...L.hooves], { dir: [0.25, 0.2, 1], pad: 1.06, now, half: 0.5 });
  wide(true);
  let foot = -1;
  let lowerT = null;
  let cuts = s0.cuts.slice();
  let snip = 0;
  let react = 0;
  let happyT = 0;
  let saidHappy = false;
  let endT = -1;

  /** Le pied levé : le sabot vu par-dessous, posé sur sa sole, lié au pied (il suit la jambe). */
  function buildHoof(i) {
    hoof?.dispose();
    const l = md.legs[i];
    const r = rest[i];
    sc.holder.updateMatrixWorld(true);
    const q = l.paw.getWorldQuaternion(new THREE.Quaternion());
    const n = r.down.clone().applyQuaternion(q).normalize();
    const f = r.fwd.clone().applyQuaternion(q);
    f.addScaledVector(n, -f.dot(n)).normalize();
    const z = new THREE.Vector3().crossVectors(f, n).normalize();
    // (le milieu de la sole : la moyenne des points de la sole du modèle, un peu vers les talons)
    const pts = md.anim?.solePts?.[i] ?? [];
    const c = v3();
    for (const p of pts) c.add(p.clone().applyMatrix4(l.paw.matrixWorld));
    if (pts.length) c.multiplyScalar(1 / pts.length);
    else l.paw.getWorldPosition(c);
    const toe = md.anim?.toePts?.[i] ? md.anim.toePts[i].clone().applyMatrix4(l.paw.matrixWorld) : null;
    if (toe) c.copy(toe).addScaledVector(f, -Ls * 0.5).addScaledVector(n, Math.max(0, toe.clone().sub(c).dot(n)));
    hoof = goatHoofModel({ L: Ls, hoof: hoofCol, quick: s0.quick });
    hoof.oldMat.userData.shared = true;
    hoof.group.position.copy(c).addScaledVector(n, -Ls * 0.02);
    hoof.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, n, z));
    sc.scene.add(hoof.group);
    l.paw.attach(hoof.group);
    // cadrage : le sabot en grand, vu du côté de la sole, un peu de la jambe ; la chèvre est dans la bulle
    const g = hoof.group;
    const pts3 = [g.localToWorld(v3(-Ls * 0.55, 0, Ls * 0.45)), g.localToWorld(v3(-Ls * 0.55, 0, -Ls * 0.45)), g.localToWorld(hoof.claws[0].at(1)), g.localToWorld(hoof.claws[1].at(1)),
      g.localToWorld(v3(Ls * 0.95, Ls * 0.2, 0)), g.localToWorld(v3(-Ls * 0.9, -Ls * 0.3, 0))];
    // (du côté de la sole, de notre côté de l'animal et d'en haut : comme on regarde le pied qu'on tient — de face
    // sur la sole, la caméra serait dans le poitrail)
    const dir = n.clone().add(v3(0, 0.1, 0.9)).normalize();
    // (un plan serré, pris d'un coup : le pied est levé et tenu, on regarde la sole)
    sc.frame(pts3, { dir: dir.toArray(), pad: 1.3, now: true });
    footZ = z;
  }

  /**
   * La main tient le pied : posée sur le dessus du paturon (du côté opposé à la sole), les doigts qui l'entourent
   * vers nous ; on n'en voit que le bout des doigts et le pouce, derrière la jambe.
   */
  let footZ = v3(0, 0, 1);
  function placeHand() {
    if (foot < 0 || !hoof) return;
    const l = md.legs[feet[foot]];
    const a = l.fetlock.getWorldPosition(v3());
    const b = l.paw.getWorldPosition(v3());
    const at = a.clone().lerp(b, 0.25);
    const q = l.paw.getWorldQuaternion(new THREE.Quaternion());
    const n = rest[feet[foot]].down.clone().applyQuaternion(q).normalize();
    const across = footZ.clone().multiplyScalar(footZ.dot(sc.camera.position.clone().sub(at)) > 0 ? 1 : -1);
    hand.position.copy(at).addScaledVector(n, -(0.022 * u + 0.012 * hand.scale.x));
    aimHand(hand, hand.position.clone().addScaledVector(across, -0.2), hand.position.clone().addScaledVector(across, 0.2), true, n);
    hand.visible = true;
  }

  return {
    peek: () => ({ ...play.peek(), foot, ready, clawTip: clawOf(cur) ? sc.project(hoof.group.localToWorld(clawOf(cur).at(1))) : null }),
    down: (p) => { if (ready) play.down?.(p); },
    key: (c, d) => { if (ready) play.key?.(c, d); },
    update(dt) {
      const s = play.peek();
      const wantFoot = s.cur < 2 ? 0 : 1;
      // Changer de pied : on repose le premier, puis on lève le second, on attend qu'il soit tenu.
      if (!ctx.done && wantFoot !== foot) {
        ready = false;
        tool.visible = false;
        band.visible = false;
        hand.visible = false;
        // (on repose d'abord le pied paré)
        if (foot >= 0 && lowerT === null) {
          lowerT = 0.8;
          wide(false);
        }
        if (lowerT !== null && lowerT > 0) {
          lowerT -= dt;
          m.lift = null;
          return;
        }
        m.lift = feet[wantFoot];
        if ((sc.liftK ?? 0) > 0.97 && sc.liftLeg === feet[wantFoot]) {
          foot = wantFoot;
          lowerT = null;
          buildHoof(feet[foot]);
        }
        return;
      }
      if (!ctx.done && hoof && !ready && sc.settled(0.05)) ready = true;
      if (ready && !ctx.done) play.update(dt);
      const s1 = play.peek();
      // une coupe : le bout de corne tombe ; dans le vif, elle retire le pied, oreilles couchées
      for (let i = 0; i < 4; i++) {
        if (s1.cuts[i] === null || cuts[i] !== null) continue;
        const c = hoof?.claws[i % 2];
        if (!c) continue;
        const uc = 1 - s1.cuts[i];
        const piece = c.cut(uc);
        hoof.group.add(piece);
        hoof.group.updateMatrixWorld(true);
        const wq = piece.getWorldQuaternion(new THREE.Quaternion());
        const wp = piece.getWorldPosition(v3());
        hoof.group.remove(piece);
        piece.position.copy(wp);
        piece.quaternion.copy(wq);
        hoof.group.updateWorldMatrix(true, false);
        piece.scale.setFromMatrixScale(hoof.group.matrixWorld);
        sc.spawn(piece, { life: 1.4, v: v3((Math.random() - 0.5) * 0.3, 0.4, 0.25), grav: 3.2, spin: 4, fade: false });
        snip = 1;
        if (uc < s1.quick + 0.04) {
          react = 1.4;
          m.annoyed = 1.5;
          m.flinch = 1;
          sc.shake = 0.3;
          sc.liftK = Math.min(sc.liftK ?? 1, 0.55);
          callOut(sc, 'sad');
        } else {
          happyT = 1.1;
          m.chew = 1;
          if (!saidHappy) {
            saidHappy = true;
            callOut(sc);
          }
        }
      }
      cuts = s1.cuts.slice();
      cur = Math.min(3, s1.cur);
      snip = Math.max(0, snip - dt * 4);
      react = Math.max(0, react - dt);
      happyT = Math.max(0, happyT - dt);
      // la lame : sur l'onglon en cours, à la hauteur des ciseaux du jeu dessiné, en travers de l'onglon
      const c = clawOf(cur);
      if (c && !ctx.done && ready) {
        const g = hoof.group;
        g.updateMatrixWorld(true);
        const at = g.localToWorld(c.at(s1.u));
        const tw = c.tan(s1.u).transformDirection(g.matrixWorld);
        const across = v3(0, 0, 1).transformDirection(g.matrixWorld);
        const toCam = sc.camera.position.clone().sub(at).normalize();
        // (les lames en travers de la corne ; les poignées vers nous)
        const x = across.clone().multiplyScalar(across.dot(toCam) > 0 ? -1 : 1);
        const zt = tw.clone();
        const y = new THREE.Vector3().crossVectors(zt, x).normalize();
        tool.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, new THREE.Vector3().crossVectors(x, y)));
        tool.position.copy(at).addScaledVector(x, -Ls * 0.42);
        tool.userData.open(snip > 0 ? 0 : 1);
        tool.visible = true;
        // la bande verte autour de l'onglon, de uLo à uHi
        const a0 = g.localToWorld(c.at(s1.uLo));
        const a1 = g.localToWorld(c.at(s1.uHi));
        band.position.copy(a0).lerp(a1, 0.5);
        band.quaternion.setFromUnitVectors(v3(0, 1, 0), a1.clone().sub(a0).normalize());
        band.scale.set(Ls * 0.22, a0.distanceTo(a1), Ls * 0.22);
        band.visible = true;
      } else {
        tool.visible = false;
        band.visible = false;
      }
      placeHand();
      if (ctx.done) {
        // fini : on repose le pied
        if (endT < 0) endT = 0;
        endT += dt;
        if (endT > 1.2 && m.lift !== null) {
          m.lift = null;
          hand.visible = false;
          wide(false);
        }
      }
      // elle : calme, elle rumine en regardant ailleurs ; aïe : la tête secouée, les oreilles couchées
      m.ears = react > 0 ? 'back' : 'forward';
      m.chew = react > 0 ? 0 : Math.max(happyT > 0 ? 1 : 0.6, (m.chew ?? 0) - dt);
      m.look = react > 0 ? L.muzzle.clone().add(v3(0.4 * u, 0.2 * u, -0.6 * u)) : sc.camera.position;
      m.lookAmt = 0.4;
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      const v = ctx.view;
      // les onglons : deux pieds, deux onglons chacun
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.86)';
      g.beginPath();
      g.roundRect(v.x0 + 10, v.y0 + 10, 150, 40, 14);
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
        g.arc(v.x0 + 58 + i * 22 + (i >= 2 ? 10 : 0), v.y0 + 30, 7, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
      // l'onglon en cours : un cercle doré qui pulse autour de lui
      const c = clawOf(cur);
      if (c && ready && !ctx.done) {
        const mid = hoof.group.localToWorld(c.at(0.75));
        const p = sc.project(mid);
        const r = Math.max(18, sc.projectRadius(mid, Ls * 0.4)) * (1 + Math.sin(ctx.time * 6) * 0.08);
        g.save();
        g.strokeStyle = 'rgba(242,200,75,0.9)';
        g.lineWidth = 3;
        g.setLineDash([5, 4]);
        g.beginPath();
        g.arc(p.x, p.y, r, 0, Math.PI * 2);
        g.stroke();
        g.restore();
      }
      // elle, dans une bulle en haut à droite : calme, contente, ou aïe
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.88)';
      g.beginPath();
      g.arc(v.x1 - 40, v.y0 + 40, 30, 0, Math.PI * 2);
      g.fill();
      g.font = `36px ${EMOJI}`;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText(react > 0 ? '😣' : happyT > 0 ? '😊' : '🐐', v.x1 - 40, v.y0 + 42);
      g.restore();
      // ✅ / 🩹 au bout des onglons coupés de ce pied (tant qu'on le tient)
      if (hoof && ready && !ctx.done) {
        for (let i = foot * 2; i < foot * 2 + 2; i++) {
          if (s.cuts[i] === null || s.cuts[i] === undefined) continue;
          const cl = hoof.claws[i % 2];
          const p = sc.project(hoof.group.localToWorld(cl.at(Math.min(1, cl.cutAt + 0.12)).add(v3())));
          const bad = cl.cutAt < s.quick + 0.04;
          g.save();
          g.font = `15px ${EMOJI}`;
          g.textAlign = 'center';
          g.textBaseline = 'middle';
          g.fillStyle = '#000';
          g.fillText(bad ? '🩹' : '✅', p.x, p.y - 14);
          g.restore();
        }
      }
    },
    destroy() {
      m.lift = null;
      hoof?.dispose();
      sc.scene.remove(hand);
      sc.scene.remove(tool);
      sc.scene.remove(band);
      for (const d of disp) d.dispose?.();
    },
  };
}


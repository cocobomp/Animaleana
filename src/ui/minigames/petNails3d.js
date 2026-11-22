// Couper les griffes en 3D (chien, chat, lapin) : la logique est celle du jeu dessiné (grooming.js nailsGame : un
// seul coup de pince par griffe, quand elle passe dans la zone verte ; trop près du rose, la veine, ça fait mal).
// Ici, le chien s'assied et donne la patte, le chat tend la patte (« tape-m'en cinq ») ; ses
// quatre griffes sont de vraies petites griffes posées au bout de sa patte (liées à son os : elles suivent la
// patte), claires et un peu translucides, avec la veine rose à la base ; notre pince glisse le long de la griffe,
// la bande verte dit où couper ; clac : le bout tombe. Une griffe coupée dans le rose : il retire la patte, oreilles
// en arrière.

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

/** Une griffe (pointe vers +y, base à l'origine, longueur 1) : un croc courbe, et la veine rose dedans. */
function clawGeometry() {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const k = i / 10;
    pts.push(new THREE.Vector2(0.14 * Math.pow(1 - k, 0.8) + 0.004, k));
  }
  const g = new THREE.LatheGeometry(pts, 12);
  // courbée vers -z (vers le sol, comme une vraie griffe)
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setZ(i, p.getZ(i) * 0.75 - y * y * 0.28);
  }
  g.computeVertexNormals();
  return g;
}

/** La pince à griffes (guillotine) : deux poignées orange, la tête en acier avec son anneau. Origine : la lame. */
function clipper(keep, s) {
  const g = new THREE.Group();
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0xd4d8de, metalness: 0.9, roughness: 0.22 }));
  const orange = keep(new THREE.MeshStandardMaterial({ color: 0xe8743a, roughness: 0.45 }));
  const ring = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.008 * s, 0.0025 * s, 8, 20)), steel));
  g.add(ring);
  const blade = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.018 * s, 0.003 * s, 0.006 * s)), steel));
  blade.position.y = 0.002 * s;
  g.add(blade);
  const head = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004 * s, 0.004 * s, 0.026 * s, 10)), steel));
  head.position.set(0.012 * s, -0.016 * s, 0);
  head.rotation.z = 0.35;
  g.add(head);
  for (const sd of [-1, 1]) {
    const h = shadowed(new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.0055 * s, 0.07 * s, 4, 10)), orange));
    h.position.set(0.02 * s + sd * 0.008 * s, -0.065 * s, 0);
    h.rotation.z = sd * 0.12;
    g.add(h);
  }
  return g;
}

export function petNails3dGame(ctx) {
  const sc = ctx.scene;
  const sp = sc.species;
  sc.decor.layout('rest');
  const md = sc.model;
  const L = sc.marks;
  const keep = own();
  const m = sc.mood;
  // Il donne la patte : le chien assis (« donne la patte »), le chat (« tape-m'en cinq »). (Le lapin n'a pas ce
  // geste dans ses animations : ses griffes restent au jeu dessiné.)
  const pose = () => {
    if (sp === 'dog') realDogPose(md, 'paw', 1);
    else if (sp === 'cat') realCatPose(md, 'paw', 1);
  };
  m.posture = 'sit';
  m.ears = 'forward';
  m.happy = 0.4;
  for (let i = 0; i < 25; i++) {
    pose();
    sc.update(0.1);
  }
  sc.holder.updateMatrixWorld(true);
  // Quelle patte avant est levée (la plus haute) ; son bout, sa largeur, sa direction.
  const legs = (md.legs ?? []).slice(0, 2);
  const leg = legs.reduce((b, l) => (l.paw.getWorldPosition(v3()).y > b.paw.getWorldPosition(v3()).y ? l : b), legs[0]);
  const paw = leg.paw;
  const sk = skinPoints(md.coatMesh, 1);
  const pw = paw.getWorldPosition(v3());
  const back = (leg.fetlock ?? leg.knee).getWorldPosition(v3());
  const dir = pw.clone().sub(back).normalize();
  const P = [];
  for (let i = 0; i < sk.n; i++) if (sk.bone[i] === paw.name) P.push(v3(sk.pos[i * 3], sk.pos[i * 3 + 1], sk.pos[i * 3 + 2]));
  let tipD = 0;
  for (const p of P) tipD = Math.max(tipD, p.clone().sub(pw).dot(dir));
  // côté : l'axe du corps de l'animal (z du monde : il regarde vers +x), sans la part le long de la patte
  const lat = v3(0, 0, 1).addScaledVector(dir, -dir.z).normalize();
  let w0 = 0;
  let w1 = 0;
  for (const p of P) {
    if (p.clone().sub(pw).dot(dir) < tipD * 0.4) continue;
    const l = p.clone().sub(pw).dot(lat);
    w0 = Math.min(w0, l);
    w1 = Math.max(w1, l);
  }
  const width = Math.max(0.012, w1 - w0, L.size.len * 0.05);
  const down = new THREE.Vector3().crossVectors(dir, lat).normalize(); // (dessous de la patte, d'un côté ou de l'autre)
  if (down.y > 0) down.negate();
  const tip = pw.clone().addScaledVector(dir, tipD * 0.82).addScaledVector(lat, (w0 + w1) / 2).addScaledVector(down, width * 0.12);
  // ---- les quatre griffes
  const clawLen = width * 0.5;
  const geo = keep(clawGeometry());
  const clawMat = keep(new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 0.3, transparent: true, opacity: 0.72, depthWrite: false }));
  const quickMat = keep(new THREE.MeshStandardMaterial({ color: 0xee8aa0, roughness: 0.5, emissive: 0x6a1a28, emissiveIntensity: 0.25 }));
  const greenMat = keep(new THREE.MeshBasicMaterial({ color: 0x3fae62, transparent: true, opacity: 0.6, depthWrite: false, side: THREE.DoubleSide }));
  let claws = [];
  let cur = 0;
  const play = withLogic(ctx, nailsGame, () => sc.project(claws[Math.min(3, cur)].g.getWorldPosition(v3())));
  const s0 = play.peek();
  claws = [-0.3, -0.1, 0.1, 0.3].map((k) => {
    const g = new THREE.Group();
    const base = tip.clone().addScaledVector(lat, k * width);
    g.position.copy(base);
    // pointe : le long de la patte, un peu vers le bas
    const along = dir.clone().addScaledVector(down, 0.35).normalize();
    g.quaternion.setFromUnitVectors(v3(0, 1, 0), along);
    // (le dessous de la griffe vers le bas de la patte)
    g.scale.setScalar(clawLen);
    const claw = shadowed(new THREE.Mesh(geo, clawMat), false);
    g.add(claw);
    const quick = shadowed(new THREE.Mesh(geo, quickMat), false);
    quick.scale.set(0.55, s0.quick, 0.55);
    g.add(quick);
    const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.26, 0.26, s0.uHi - s0.uLo, 14, 1, true)), greenMat);
    band.position.y = (s0.uLo + s0.uHi) / 2;
    band.visible = false;
    g.add(band);
    sc.scene.add(g);
    paw.attach(g);
    return { g, claw, quick, band, cutAt: 1 };
  });
  // ---- la pince
  const tool = clipper(keep, Math.max(0.45, Math.min(1.1, width / 0.06)));
  sc.scene.add(tool);
  let cuts = [null, null, null, null];
  let snip = 0;
  let react = 0;
  let happyT = 0;
  let saidHappy = false;
  // Cadrage : sa patte tendue en grand, et sa tête (il nous regarde faire).
  // (la patte seule, en gros plan : une griffe fait un centimètre ; sa tête est dans la bulle, en haut à droite)
  const frame = (now = false) => sc.frame([tip.clone().addScaledVector(lat, width * 0.85), tip.clone().addScaledVector(lat, -width * 0.85), tip.clone().addScaledVector(dir, clawLen * 1.5), tip.clone().addScaledVector(down, width * 0.45), back.clone().lerp(tip, 0.2)], { dir: [0.9, 0.5, 1], pad: 1.3, now });
  frame(true);
  return {
    peek: () => ({ ...play.peek(), clawTip: sc.project(claws[Math.min(3, cur)].g.localToWorld(v3(0, 1, 0))) }),
    down: (p) => play.down(p),
    key: (c, d) => play.key(c, d),
    update(dt) {
      pose();
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
          sc.spawn(bit, { life: 0.8, v: v3((Math.random() - 0.5) * 0.2, 0.15, 0.1), grav: 2, fade: false });
          snip = 1;
          if (u < s.quick + 0.04) {
            react = 1.3;
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
      for (let i = 0; i < 4; i++) claws[i].band.visible = i === s.cur && !ctx.done;
      // la pince : sur la griffe en cours, à la hauteur des ciseaux du jeu dessiné, de travers sur la griffe
      const c = claws[cur];
      c.g.updateMatrixWorld(true);
      const at = c.g.localToWorld(v3(0, ctx.done ? 1 : s.u, 0));
      tool.visible = !ctx.done;
      tool.position.copy(at);
      const axis = c.g.localToWorld(v3(0, 1, 0)).sub(c.g.getWorldPosition(v3())).normalize();
      // (la lame en travers de la griffe, les poignées vers nous et vers le bas)
      const toCam = sc.camera.position.clone().sub(at).normalize();
      const x = new THREE.Vector3().crossVectors(axis, toCam).normalize();
      const y = new THREE.Vector3().crossVectors(x, axis).normalize();
      tool.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, axis.clone().negate(), y.clone().negate()));
      tool.rotateZ(snip * 0.25);
      // lui : il regarde sa patte (et nous), calme ; aïe : il détourne la tête
      m.look = react > 0 ? sc.camera.position.clone().add(v3(0, 0.5, -1)) : tip.clone().lerp(sc.camera.position, 0.4);
      m.lookAmt = 0.6;
      m.happy = react > 0 ? 0 : 0.5;
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      const v = ctx.view;
      // 1/4 : la griffe en cours
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.86)';
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
        const p = sc.project(c.g.localToWorld(v3(0, c.cutAt + 0.6, 0)));
        const bad = c.cutAt < s.quick + 0.04;
        g.save();
        g.font = `15px ${EMOJI}`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText(bad ? '🩹' : '✅', p.x, p.y);
        g.restore();
      }
    },
    destroy() {
      for (const c of claws) c.g.parent?.remove(c.g);
      sc.scene.remove(tool);
      keep.dispose();
    },
  };
}

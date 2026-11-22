// Le vermifuge, en 3D : les deux étapes et la note du jeu dessiné (deworm.js), avec une vraie seringue de pâte dans
// notre main et la vraie tête du cheval :
//
//   1. la dose : la seringue en gros plan, graduée en kilos ; on fait glisser la bague rouge le long du corps (ou ➖ / ➕
//      10 kg) jusqu'à son poids, ou un peu plus (la bande verte) ; le cheval regarde, curieux ;
//   2. la seringue : on la glisse dans le coin de sa bouche, là où il n'a pas de dents (l'anneau blanc) ; devant ses
//      dents, il relève la tête et couche les oreilles. Puis on garde le doigt dessus : le piston avance, la pâte part,
//      il fait la grimace (il tire la langue, secoue la tête, mâchonne).
//
// La règle est celle du jeu dessiné : justOutcome sur la dose (son poids, jusqu'à DOSE.over kg de plus), puis sur la
// pâte donnée ; ce qu'on écrit dans ctx.opts.out.dose (sous-dosé : à refaire plus tôt).

import * as THREE from 'three';
import { justOutcome } from './score.js';
import { nbsp } from './frame.js';
import { clamp, rrect, label } from './draw.js';
import { horseKg, DOSE } from './deworm.js';
import { syringeModel } from '../../game/care/tackProps.js';
import { handModel, avatarHand } from '../../game/care/props.js';
import { nicker, snort } from './feed3d.js';
import { v3, owner, impatience, afterLife, smooth, dist2, pulseRing, updateRing } from './horse3dKit.js';

export function deworm3dGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const name = a?.name ?? ctx.name;
  const own = owner();
  const md = sc.model;
  const head = md.head;
  const S = sc.double.scale;
  const L = sc.marks;
  const m = sc.mood;
  m.ears = 'forward';
  const dims = md.dims ?? { hr: 0.11, snoutZ: 0.5 };
  const hr = dims.hr ?? 0.11;
  const snout = dims.snoutZ ?? 0.5;
  const kg = horseKg(a);

  // ---------------------------------------------------------------- le coin de la bouche (la barre) et les dents
  // (sur la peau, de notre côté : un rayon lancé vers la tête, sur la copie figée de sa pose)
  sc.proxy.bake();
  const sideW = () => head.localToWorld(v3(1, 0, 0)).sub(head.localToWorld(v3())).normalize();
  const onSkin = (local) => {
    const from = head.localToWorld(local.clone().setX(-0.6));
    const hit = sc.proxy.hitAll(new THREE.Ray(from, sideW()))[0];
    return hit ? head.worldToLocal(hit.point.clone()).add(v3(-0.004, 0, 0)) : local.clone().setX(-hr * 0.45);
  };
  const barLocal = onSkin(v3(0, -hr * 0.42, snout - hr * 0.85));
  const teethLocal = v3(-hr * 0.1, -0.15 * snout, snout * 1.0);
  const W = (local) => head.localToWorld(local.clone());

  // ---------------------------------------------------------------- la seringue, dans notre main
  const syr = syringeModel(own);
  const holder = new THREE.Group(); // (la seringue et la main ensemble)
  holder.add(syr.group);
  const hand = handModel(own, { ...avatarHand(sc.game?.profile), grip: 0.95 });
  hand.scale.setScalar(0.9);
  // (la main tient le corps près de la collerette, le pouce vers le piston)
  // (la paume sous le corps, près de la collerette, les doigts qui l'entourent par-derrière, le pouce vers le piston ;
  // le poignet descend vers nous, hors de l'image)
  {
    const xh = v3(0, 0.45, 1).normalize();
    const yh = v3(0, 1, -0.45).normalize();
    const zh = new THREE.Vector3().crossVectors(xh, yh);
    hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xh, yh, zh));
    hand.position.set(syr.tip + syr.len * 0.8, -0.03, -0.012);
  }
  holder.add(hand);
  sc.scene.add(holder);
  // la bande verte (la bonne dose) sur le corps
  const kOf = (w) => (w - DOSE.min) / (DOSE.max - DOSE.min);
  const doseLo = kg - DOSE.slack;
  const doseHi = kg + DOSE.over;
  const span = (kOf(doseHi) - kOf(doseLo)) * syr.len * (480 / 512);
  const band = new THREE.Mesh(own(new THREE.CylinderGeometry(0.0182, 0.0182, Math.max(0.002, span), 24, 1, true)), own(new THREE.MeshBasicMaterial({ color: 0x3fae62, transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide })));
  band.rotation.z = -Math.PI / 2;
  band.position.copy(syr.ringAt((kOf(doseLo) + kOf(doseHi)) / 2));
  band.renderOrder = 3;
  syr.group.add(band);
  // la pâte qui sort, un peu de langue rose (la grimace)
  const tongue = new THREE.Mesh(own(new THREE.CapsuleGeometry(0.02, 0.035, 4, 10)), own(new THREE.MeshStandardMaterial({ color: 0xd8707e, roughness: 0.45 })));
  tongue.scale.set(1, 0.42, 1.2);
  tongue.rotation.set(Math.PI / 2, 0, 0);
  tongue.visible = false;
  head.add(tongue);
  const ring = pulseRing(own, { r: 0.028 * Math.max(0.8, S) });
  sc.scene.add(ring);

  // ---------------------------------------------------------------- état (la logique du jeu dessiné)
  let stage = 'dose';
  let ring0 = 300 + Math.round(((ctx.rng?.() ?? 0.5) * 300) / 10) * 10;
  let dose = ring0;
  let dragRing = false;
  const sy = { placed: false, pushing: false, left: 1, drag: false };
  let grimace = 0;
  let annoyed = 0;
  let pause = 0;
  let licked = false;
  const results = [];
  const busy = impatience(sc, { after: 12 });
  ctx.zone(kOf(doseLo), kOf(doseHi));
  ctx.progress(kOf(dose));
  ctx.hint(t('mg_deworm_dose_hint', { name, kg }));
  const stopBtn = ctx.stopButton(() => next());
  const setLabel = (key) => {
    const text = `✅ ${t(key)}`;
    if (stopBtn && 'textContent' in stopBtn) stopBtn.textContent = nbsp(text);
    else if (stopBtn) stopBtn.text = text;
  };
  setLabel('mg_pansage_next');
  const setDose = (w) => {
    dose = clamp(Math.round(w / 10) * 10, DOSE.min, DOSE.max);
    ctx.progress(kOf(dose));
  };
  const nudge = (k) => { if (stage === 'dose' && !ctx.done && pause <= 0) setDose(dose + k * DOSE.step); };
  const minus = ctx.button(`➖ ${DOSE.step} kg`, { onTap: () => nudge(-1) });
  const plus = ctx.button(`➕ ${DOSE.step} kg`, { onTap: () => nudge(1) });

  function next() {
    if (ctx.done || pause > 0) return;
    if (stage === 'dose') {
      const res = justOutcome(dose, doseLo, doseHi, { slack: 120 });
      results.push({ stage: 'dose', value: dose, ...res });
      if (ctx.opts) ctx.opts.out = { ...(ctx.opts.out ?? {}), dose: res.verdict };
      for (const b of [minus, plus]) if (b) b.hidden = true;
      stage = 'give';
      pause = 0.6;
      ctx.zone(null);
      ctx.progress(0);
      ctx.hint(t('mg_deworm_give_hint', { name }));
      setLabel('mg_stopHere');
      frameFor('give');
      busy.poke();
      return;
    }
    if (!sy.placed || sy.left > 0.05) {
      ctx.hint(t('mg_deworm_give_hint', { name }), 'warn');
      return;
    }
    finish();
  }

  function finish() {
    if (ctx.done) return;
    const given = 1 - sy.left;
    const res = justOutcome(sy.placed ? given : 0, 0.95, 1, { slack: 0.6 });
    results.push({ stage: 'give', value: given, ...res });
    const q = results.reduce((n, r) => n + r.q, 0) / results.length;
    const worst = results.reduce((w, r) => (r.q < w.q ? r : w), results[0]);
    const just = results.every((r) => r.verdict === 'just');
    const p = { name, g: a?.sex, kg };
    const msg = just ? t('mg_deworm_just', p) : t(`mg_deworm_${worst.verdict}_${worst.stage}`, p);
    ctx.finish(q, msg, just ? 'just' : worst.verdict);
  }

  // ---------------------------------------------------------------- caméra et place de la seringue
  function frameFor(st, now = false) {
    const pts = [L.muzzle, L.poll, ...L.ears, L.head, W(v3(0, -hr * 1.6, 0)), W(teethLocal.clone().add(v3(0, -hr * 0.6, 0)))];
    if (st === 'dose') {
      // (la tête en haut ; la seringue, en gros plan, en bas)
      sc.setFocus(0, sc.size.h * 0.6);
      sc.frame([...pts, L.neck], { dir: [0.85, 0.05, 1], pad: 1.4, now });
    } else {
      sc.setFocus(null);
      sc.frame([...pts, L.neck], { dir: [0.7, 0.05, 1], pad: 1.35, now });
    }
  }
  /** La seringue au repos : devant nous, en travers du bas de l'image (dose), ou plus bas à gauche (prête à donner). */
  function restPose() {
    const v = ctx.view;
    const c = sc.camera;
    const aspect = sc.size.w / Math.max(1, sc.size.h);
    const tanH = Math.tan((c.fov * Math.PI) / 360) * Math.max(0.5, aspect);
    const d = clamp((syr.len + syr.tip) / (0.78 * 2 * tanH), 0.32, 0.95);
    const yv = stage === 'dose' ? v.y0 + (v.y1 - v.y0) * 0.8 : v.y0 + (v.y1 - v.y0) * 0.78;
    const xv = stage === 'dose' ? 200 : v.x0 + (v.x1 - v.x0) * 0.4;
    const at = sc.pointAtDepth(xv, yv, stage === 'dose' ? d : d * 1.35);
    const right = v3(1, 0, 0).applyQuaternion(c.quaternion);
    const up = v3(0, 1, 0).applyQuaternion(c.quaternion);
    const back = v3(0, 0, 1).applyQuaternion(c.quaternion);
    // (l'embout vers la gauche ? non : vers le cheval, à droite ; le corps en travers, un peu penché)
    const x = right.clone().multiplyScalar(stage === 'dose' ? 1 : 0.8).addScaledVector(back, stage === 'dose' ? -0.15 : -0.6).normalize();
    const z = new THREE.Vector3().crossVectors(x, up).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x.clone().negate(), y, z.clone().negate()));
    // (origine au bout de l'embout : on recule de la moitié de la seringue pour la centrer)
    const pos = at.clone().addScaledVector(x, (syr.len + syr.tip) * 0.5);
    return { pos, q };
  }
  /** La seringue dans le coin de sa bouche : l'embout dedans, le corps vers nous et un peu vers l'arrière. */
  function inMouthPose() {
    const bar = W(barLocal);
    const out = W(barLocal.clone().add(v3(-0.18, 0.05, -0.12))).sub(bar).normalize();
    const up = v3(0, 1, 0);
    const xAxis = out.clone().negate(); // (le corps de la seringue va de l'embout vers +x : vers nous)
    const z = new THREE.Vector3().crossVectors(out, up).normalize();
    const y = new THREE.Vector3().crossVectors(z, out).normalize();
    const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(out, y, z));
    void xAxis;
    return { pos: bar.clone().addScaledVector(out, -0.012), q };
  }
  let pose = null;

  // ---------------------------------------------------------------- la pose : tête relevée, grimace
  const unhook = afterLife(sc, () => {
    if (annoyed > 0 && md.neck) md.neck.rotateX(-0.3 * smooth(Math.min(1, annoyed)));
    if (grimace > 0.05 && md.head) {
      md.head.rotateZ(Math.sin(sc.time * 16) * 0.05 * grimace);
      md.head.rotateX(-0.08 * grimace);
    }
  });

  frameFor('dose', true);

  function moveTo(p) {
      if (dragRing) {
        const { a0, a1, len2 } = dragRing;
        const k = ((p.x - a0.x) * (a1.x - a0.x) + (p.y - a0.y) * (a1.y - a0.y)) / Math.max(1, len2);
        setDose(DOSE.min + clamp(k) * (DOSE.max - DOSE.min));
      }
      if (sy.drag) {
        // (l'embout sous le doigt, à la profondeur de sa bouche ; la seringue pointe vers sa tête)
        const n = sc.camera.getWorldDirection(v3());
        const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, W(barLocal));
        const at = sc.rayAt(clamp(p.x, 20, 380), p.y).intersectPlane(plane, v3()) ?? W(barLocal);
        const goal = inMouthPose();
        holder.position.copy(at);
        holder.quaternion.copy(goal.q);
        pose = null;
      }
  }

  return {
    peek: () => {
      const rp = sy.drag ? null : holder.position;
      return {
        stage, ring: dose, kg, doseLo, doseHi, syr: { placed: sy.placed, pushing: sy.pushing, left: sy.left }, pause,
        results: results.map((r) => ({ ...r })),
        bar: sc.project(W(barLocal)), teeth: sc.project(W(teethLocal)),
        syringe: rp ? sc.project(holder.localToWorld(syr.at(0.45))) : null,
        ringX: sc.project(holder.localToWorld(syr.ringAt(kOf(dose)))),
        doseAt: (w) => sc.project(holder.localToWorld(syr.ringAt(kOf(w)))),
        ends: [sc.project(holder.localToWorld(syr.ringAt(0))), sc.project(holder.localToWorld(syr.ringAt(1)))],
      };
    },
    down(p) {
      if (ctx.done || pause > 0) return;
      busy.poke();
      if (stage === 'dose') {
        const a0 = sc.project(holder.localToWorld(syr.ringAt(0)));
        const a1 = sc.project(holder.localToWorld(syr.ringAt(1)));
        const len2 = (a1.x - a0.x) ** 2 + (a1.y - a0.y) ** 2;
        const k = ((p.x - a0.x) * (a1.x - a0.x) + (p.y - a0.y) * (a1.y - a0.y)) / Math.max(1, len2);
        const foot = { x: a0.x + (a1.x - a0.x) * k, y: a0.y + (a1.y - a0.y) * k };
        if (k > -0.08 && k < 1.08 && dist2(foot, p) < 46) {
          dragRing = { a0, a1, len2 };
          setDose(DOSE.min + clamp(k) * (DOSE.max - DOSE.min));
        }
        return;
      }
      if (sy.placed) {
        sy.pushing = true;
        return;
      }
      const c = sc.project(holder.localToWorld(syr.at(0.45)));
      if (dist2(c, p) < 70) {
        sy.drag = true;
        moveTo(p);
      }
    },
    move: (p) => moveTo(p),
    up() {
      dragRing = false;
      sy.pushing = false;
      if (!sy.drag) return;
      sy.drag = false;
      const tip = sc.project(holder.position);
      const bar = sc.project(W(barLocal));
      const teeth = sc.project(W(teethLocal));
      if (dist2(tip, bar) < 48 && dist2(tip, bar) <= dist2(tip, teeth) + 6) {
        sy.placed = true;
        ctx.hint(t('mg_deworm_push', { name }), 'good');
        m.ears = 'back';
        m.nod = 0.4;
      } else if (dist2(tip, teeth) < 52) {
        annoyed = 1;
        m.annoyed = 1.2;
        const h = sc.project(L.poll);
        fx.float(h.x, h.y - 20, '💢', 22);
        ctx.hint(t('mg_deworm_teeth', { name }), 'warn');
        snort(sc);
      }
      pose = null;
    },
    key(code, isDown) {
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (isDown) next();
        return;
      }
      if (code === 'ArrowLeft' && isDown && stage === 'dose') nudge(-1);
      if (code === 'ArrowRight' && isDown && stage === 'dose') nudge(1);
      if (code === 'Space' && stage === 'give' && sy.placed) sy.pushing = isDown;
    },
    update(dt) {
      annoyed = Math.max(0, annoyed - dt);
      grimace = Math.max(0, grimace - dt * 0.5);
      if (pause > 0) pause = Math.max(0, pause - dt);
      // la seringue : au repos (devant nous), tenue (sous le doigt) ou dans sa bouche
      syr.setDose(kOf(dose));
      syr.setLeft(sy.left);
      if (!sy.drag) {
        pose = sy.placed ? inMouthPose() : restPose();
        const k = sy.placed ? 1 : Math.min(1, dt * 7);
        holder.position.lerp(pose.pos, k);
        holder.quaternion.slerp(pose.q, k);
      }
      // la pâte part quand on pousse ; il fait la grimace
      if (stage === 'give' && sy.placed && sy.pushing && sy.left > 0 && pause <= 0) {
        sy.left = Math.max(0, sy.left - dt * 0.6);
        grimace = 1;
        m.chew = 1;
        ctx.progress(1 - sy.left);
        if (sy.left <= 0) {
          const h = sc.project(W(teethLocal));
          fx.text(h.x, h.y - 50, '😝', '#5a4636', 30);
          ctx.hint(t('mg_pressStop'), 'good');
          snort(sc);
        }
      }
      if (sy.left <= 0 && !licked && grimace < 0.6) {
        licked = true;
        m.nod = 1;
        nicker(sc);
      }
      m.chew = Math.max(grimace > 0.2 ? 1 : 0, m.chew - dt * 0.7);
      tongue.visible = grimace > 0.25;
      if (tongue.visible) {
        const k = smooth(Math.min(1, (grimace - 0.25) / 0.5));
        tongue.position.set(-0.004, -0.17 * snout, snout * (0.9 + 0.07 * k) + Math.sin(sc.time * 10) * 0.004);
      }
      // il regarde la seringue (curieux), puis la supporte, oreilles couchées
      const fidget = busy.update(dt, sy.drag || dragRing || sy.pushing || ctx.done);
      if (!fidget) m.lift = null;
      m.look = holder.position;
      m.lookAmt = stage === 'dose' ? 0.45 : sy.placed ? 0 : 0.25;
      if (annoyed > 0 || grimace > 0.3) m.ears = 'back';
      else if (!sy.placed) m.ears = 'forward';
      ring.visible = stage === 'give' && !sy.placed && pause <= 0 && !ctx.done && sc.ready;
      if (ring.visible) updateRing(ring, sc, ctx.time, W(barLocal));
    },
    draw(g) {
      if (!sc.ready) return;
      const v = ctx.view;
      // le poids du cheval
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      rrect(g, v.x0 + 12, Math.max(12, v.y0 + 12), 170, 40, 12);
      g.fill();
      label(g, `⚖️ ${t('mg_deworm_weight', { kg })}`, v.x0 + 97, Math.max(12, v.y0 + 12) + 20, 16, '#23302a');
      g.restore();
      if (stage === 'dose') {
        // la dose réglée, au-dessus de la bague
        const q = sc.project(holder.localToWorld(syr.ringAt(kOf(dose)).add(v3(0, 0.03, 0))));
        g.save();
        g.font = '900 18px system-ui, sans-serif';
        const text = `${dose} kg`;
        const w = g.measureText(text).width + 16;
        g.fillStyle = 'rgba(255,255,255,0.92)';
        rrect(g, q.x - w / 2, q.y - 34, w, 26, 13);
        g.fill();
        label(g, text, q.x, q.y - 21, 18, '#c0392b');
        g.restore();
      }
    },
    destroy() {
      unhook();
      sc.setFocus(null);
      head.remove(tongue);
      sc.scene.remove(holder, ring);
      own.free();
    },
  };
}

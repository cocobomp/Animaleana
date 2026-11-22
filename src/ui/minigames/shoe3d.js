// Le maréchal-ferrant, en 3D : la règle et la note du jeu dessiné (grooming.js shoeGame : trois coups de marteau
// par clou, pas un de plus, puis ✅), sur le vrai pied du cheval :
//
//   - il lève l'antérieur de notre côté (le membre se plie, la sole apparaît : hoof.js) ; on tient le pied ;
//   - le fer neuf est posé sur la sole, quatre clous plantés dans ses étampures, la tête dépasse ;
//   - à chaque coup (🔨, ou le doigt sur un clou), le marteau frappe, le clou s'enfonce d'un tiers ; au troisième il
//     affleure (✓) ; un coup de trop le plie (💢 : le cheval tire sur son pied et couche les oreilles) ;
//   - trop long sans rien faire, il essaie de reposer son pied et s'ébroue.

import * as THREE from 'three';
import { justRight } from './score.js';
import { hoofSole } from '../../game/care/hoof.js';
import { horseshoeModel, nailModel, hammerModel } from '../../game/care/tackProps.js';
import { handModel, avatarHand } from '../../game/care/props.js';
import { snort, nicker } from './feed3d.js';
import { circle, label } from './draw.js';
import { closeSleeve, v3, owner, impatience, smooth, dist2, pulseRing, updateRing } from './horse3dKit.js';

const JUST = 3;
const MAXHITS = 5;
const TAP_R = 46;
const LEG = 1; // (model.legs : l'antérieur droit, de notre côté)

/** Où sont les clous sur le fer (repère de la sole, rayon 1) : deux de chaque côté, en mamelle et en quartier. */
export const SHOE_NAILS = [0.36, 0.62].flatMap((k) => [-1, 1].map((s) => ({ a: s * k * Math.PI })));

export function shoe3dGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const name = a?.name ?? ctx.name;
  const own = owner();
  const md = sc.model;
  const S = sc.double.scale;
  const m = sc.mood;
  m.ears = 'forward';
  m.square = true;
  m.lift = LEG;
  m.liftAmt = 0;
  const leg = md.legs?.[LEG] ?? md.legs?.[0];

  // ---------------------------------------------------------------- la sole, le fer, les clous
  /** Rayon du bas du sabot (repère monde), mesuré sur la pose figée (comme le cure-pied). */
  function hoofRadius(prefix) {
    const px = sc.proxy;
    px.bake();
    if (!px.skeleton || !leg) return null;
    const at = sc.holder.localToWorld(leg.hoof.clone());
    const names = px.skeleton.bones.map((b) => b.name);
    let r = 0;
    for (let i = 0; i < px.bones.length; i++) {
      if (!names[px.bones[i]]?.startsWith(prefix)) continue;
      const y = px.pos[i * 3 + 1];
      if (y > at.y + 0.03 * S) continue;
      const d = Math.hypot(px.pos[i * 3] - at.x, px.pos[i * 3 + 2] - at.z);
      if (d < 0.2 * S) r = Math.max(r, d);
    }
    return r || null;
  }
  const sole = leg ? hoofSole(sc, leg, [], own, { radius: hoofRadius('FR') }) : null;
  const g = sole?.group ?? new THREE.Group();
  const holePos = SHOE_NAILS.map(({ a: ang }) => ({ x: Math.cos(ang) * (Math.cos(ang) > 0 ? 0.86 : 0.78) * 1.04, y: Math.sin(ang) * 0.82 }));
  const shoe = horseshoeModel(own, holePos);
  // (la forme du fer est dans le plan xy, épaisseur vers +z : couchée sur la sole, face vers +y)
  shoe.group.rotation.x = -Math.PI / 2;
  shoe.group.scale.set(1, -1, 1);
  shoe.group.position.y = 0.065;
  g.add(shoe.group);
  const steel = own(new THREE.MeshStandardMaterial({ color: 0xd2d7dc, roughness: 0.28, metalness: 0.9 }));
  const nailMats = { steel, headGeo: own(new THREE.BoxGeometry(0.09, 0.05, 0.06)), shankGeo: own(new THREE.BoxGeometry(0.03, 0.4, 0.022)) };
  const NAIL_UP = 0.36; // (ce qui dépasse avant le premier coup)
  const nails = holePos.map((h) => {
    const n = nailModel(own, nailMats);
    n.position.set(h.x, 0.18, h.y);
    g.add(n);
    return { obj: n, local: v3(h.x, 0.18, h.y), hits: 0, bend: 0, bendDir: Math.sign(h.y) || 1, sink: 0 };
  });
  // (ordre du jeu dessiné : de la pince vers les talons, puis de gauche à droite à l'écran — fait à la première image)
  const n = nails.length;
  const TOTAL = JUST * n;
  let sel = 0;
  let swing = 0;
  let saidStop = false;
  let flinch = 0;

  // ---------------------------------------------------------------- le marteau, notre main qui tient le pied
  const hammer = hammerModel(own);
  hammer.scale.setScalar(0.85 * Math.max(0.85, S));
  sc.scene.add(hammer);
  // (notre autre main tient le marteau par le bout du manche, le poing autour, le pouce vers la tête ; l'avant-bras
  // remonte derrière — avant, le marteau flottait tout seul)
  const hammerHand = closeSleeve(handModel(own, { ...avatarHand(sc.game?.profile), grip: 0.95 }), own);
  {
    // (le poing par-dessus le manche : le dos de la main vers nous, la paume et les doigts qui l'entourent par-dessous,
    // le pouce vers la tête du marteau ; l'avant-bras repart vers le bas de l'image)
    const xh = v3(0, -0.35, 1).normalize(); // (les doigts, avant de se refermer)
    const yh = v3(0, -1, -0.35).normalize(); // (la paume, vers le manche)
    const zh = new THREE.Vector3().crossVectors(xh, yh).normalize(); // (le long du manche, vers la tête)
    hammerHand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xh, yh, zh));
    const k = 1.05 / 0.85;
    hammerHand.scale.setScalar(k);
    // (le manche passe dans le creux des doigts refermés)
    const grip = v3(-0.235, 0.05, 0);
    hammerHand.position.copy(grip).addScaledVector(xh, -0.045 * k).addScaledVector(yh, -0.026 * k);
  }
  hammer.add(hammerHand);
  const hand = closeSleeve(handModel(own, { ...avatarHand(sc.game?.profile), grip: 0.7 }), own);
  hand.scale.setScalar(0.95 * Math.max(0.85, S));
  sc.scene.add(hand);
  const ring = pulseRing(own, { color: 0xf2c84b, r: 0.022 * Math.max(0.8, S) });
  sc.scene.add(ring);

  ctx.hint(t('mg_shoe_hint_just'));
  ctx.zone((JUST - 0.5) / MAXHITS, (JUST + 0.5) / MAXHITS);
  const hammerBtn = ctx.button('🔨', { cls: 'primary', onTap: () => hammerHit() });
  if (hammerBtn?.style) {
    hammerBtn.style.flex = '0 0 30%';
    hammerBtn.style.fontSize = '1.7rem';
    hammerBtn.setAttribute('aria-label', t('mg_shoe_btn'));
    hammerBtn.title = t('mg_shoe_btn');
  }
  ctx.stopButton(() => finishAll());
  const showGauge = () => { if (!ctx.done) ctx.progress(nails[sel].hits / MAXHITS); };
  showGauge();
  const busy = impatience(sc, { after: 10 });

  function tally() {
    let low = 0;
    let high = 0;
    for (const x of nails) {
      if (x.hits < JUST) low += JUST - x.hits;
      else high += x.hits - JUST;
    }
    const value = low + high === 0 ? TOTAL : high >= low ? TOTAL + low + high : TOTAL - low - high;
    return { low, high, value };
  }
  function finishAll() {
    if (ctx.done) return;
    const r = ctx.finishJust(tally().value, TOTAL, TOTAL, { who: a?.name, slack: 2 * n });
    if (r?.verdict === 'just' || justRight(tally().value, TOTAL, TOTAL, { slack: 2 * n }) >= 0.99) {
      nicker(sc);
      m.nod = 1;
    }
    // (il repose son pied)
    m.lift = null;
  }
  function select(i) {
    sel = (i + n) % n;
    showGauge();
  }
  function hammerHit() {
    if (ctx.done) return;
    const next = (ok) => {
      for (let k = 1; k < n; k++) if (ok(nails[(sel + k) % n])) return select(sel + k);
    };
    if (nails[sel].hits >= JUST) next((x) => x.hits < JUST);
    if (nails[sel].hits >= MAXHITS) next((x) => x.hits < MAXHITS);
    hit();
  }
  const nailScreen = (nl) => sc.project(g.localToWorld(v3(nl.local.x, 0.1, nl.local.z)));
  function hit() {
    if (ctx.done) return;
    busy.poke();
    const nl = nails[sel];
    swing = 1;
    const at = nailScreen(nl);
    sc.shake = Math.max(sc.shake, 0.25);
    if (nl.hits >= MAXHITS) {
      fx.text(at.x, at.y - 40, t('mg_oops'), '#c07a10', 22);
      return;
    }
    nl.hits++;
    if (nl.hits < JUST) {
      fx.text(at.x, at.y - 40, t('mg_hop'), '#1f55a8', 24);
      fx.burst(at.x, at.y, '💥', 2, { speed: 60, size: 14 });
    } else if (nl.hits === JUST) {
      fx.text(at.x, at.y - 40, t('mg_perfect'), '#11573a', 27); // (vert foncé : lisible sur la paille claire)
      fx.burst(at.x, at.y, '✨', 5, { speed: 120, size: 14 });
    } else {
      nl.bend = Math.min(1, nl.bend + 0.5);
      fx.text(at.x, at.y - 40, t('mg_oops'), '#c07a10', 22);
      fx.float(at.x + 16, at.y - 20, '💢', 22);
      ctx.hint(t('mg_tooMuch', { name: a?.name }), 'warn');
      saidStop = true;
      flinch = 1;
      m.annoyed = 1.2;
      snort(sc);
    }
    showGauge();
    if (nails.every((x) => x.hits >= MAXHITS)) finishAll();
    else if (!saidStop && nails.every((x) => x.hits >= JUST)) {
      saidStop = true;
      ctx.hint(t('mg_pressStop'), 'good');
    }
  }

  let framed = false;
  let framedEnd = false;
  function frameFoot(half = 0.5) {
    if (!sole) return;
    const f = sole.frameInfo();
    // (en paysage, l'image est large : plus serré sur la sole et la main, sans les deux canons en V autour)
    const wide = sc.size.w > sc.size.h * 1.2;
    sc.frame(f.points, { dir: f.dir, pad: wide ? 1.45 : 2.1, half });
  }

  return {
    peek: () => ({
      value: tally().value, lo: TOTAL, hi: TOTAL, just: JUST, max: MAXHITS, sel, tapR: TAP_R,
      hits: nails.map((x) => x.hits), nails: nails.map((nl) => nailScreen(nl)), lifted: m.liftAmt,
    }),
    down(p) {
      if (ctx.done) return;
      let best = -1;
      let bd = TAP_R;
      nails.forEach((nl, i) => {
        const d = dist2(p, nailScreen(nl));
        if (d < bd) {
          bd = d;
          best = i;
        }
      });
      if (best < 0) return;
      select(best);
      hit();
    },
    key(code, down) {
      if (!down) return;
      if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') hammerHit();
      else if (code === 'ArrowLeft' || code === 'ArrowUp') select(sel - 1);
      else if (code === 'ArrowRight' || code === 'ArrowDown') select(sel + 1);
    },
    update(dt) {
      swing = Math.max(0, swing - dt * 5);
      flinch = Math.max(0, flinch - dt * 1.5);
      // il tient son pied levé (il tire un peu dessus quand un clou plie, ou quand on traîne)
      const tired = busy.update(dt, swing > 0 || ctx.done, { canPaw: false });
      if (!ctx.done) {
        m.lift = LEG;
        m.liftMax = 1 - 0.25 * flinch - (tired ? 0.3 : 0);
      }
      m.ears = flinch > 0 || tired ? 'back' : 'forward';
      // la caméra suit le pied (le membre se plie) ; à la fin, on le voit reposer son pied, content
      if (!ctx.done) frameFoot(framed ? 0.25 : 0.6);
      else if (!framedEnd) {
        framedEnd = true;
        const L = sc.marks;
        sc.frame([L.muzzle, L.poll, ...L.ears, L.chest, L.withers, ...L.hooves.slice(0, 2)], { dir: [0.6, 0.15, 1], pad: 1.15, half: 0.8 });
      }
      framed = true;
      // les clous : ce qui dépasse, puis plié
      for (const nl of nails) {
        const h = 1 - Math.min(JUST, nl.hits) / JUST;
        nl.sink += (h - nl.sink) * Math.min(1, dt * 14);
        nl.obj.position.y = 0.11 + NAIL_UP * nl.sink;
        nl.obj.rotation.set(nl.bendDir * 0.9 * nl.bend, 0, 0);
      }
      // le marteau : au-dessus du clou choisi, il frappe
      const nl = nails[sel];
      const at = g.localToWorld(nl.local.clone().setY(0.11 + NAIL_UP * nl.sink + 0.05));
      const nrm = g.localToWorld(v3(0, 1, 0)).sub(g.localToWorld(v3())).normalize();
      const k = smooth(swing);
      const lift = (1 - k) * 0.09 * Math.max(0.85, S);
      hammer.position.copy(at).addScaledVector(nrm, lift + 0.004);
      // (la tête le long de la normale de la sole ; le manche vers nous, couché sur le côté)
      // (le manche part du clou vers l'extérieur du sabot et vers nous : il ne cache pas le fer)
      const toCam = sc.camera.position.clone().sub(at).normalize();
      const radial = at.clone().sub(g.localToWorld(v3(-0.3, 0.1, 0)));
      const handleDir = radial.normalize().addScaledVector(toCam, 0.35).addScaledVector(nrm, -0.0);
      handleDir.addScaledVector(nrm, -handleDir.dot(nrm)).normalize();
      const xAxis = handleDir.clone().negate();
      const zAxis = new THREE.Vector3().crossVectors(xAxis, nrm).normalize();
      hammer.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(xAxis, nrm, zAxis));
      hammer.rotateZ(0.6 * (1 - k));
      hammer.visible = !ctx.done && (m.liftAmt > 0.6);
      // notre main tient la pince du sabot (de l'autre côté du marteau)
      const toe = g.localToWorld(v3(1.15, -0.2, 0));
      hand.position.copy(toe);
      const out = g.localToWorld(v3(2, -0.6, 0)).sub(toe).normalize();
      const zH = new THREE.Vector3().crossVectors(out.clone().negate(), nrm).normalize();
      const yH = new THREE.Vector3().crossVectors(zH, out.clone().negate()).normalize();
      hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(out.clone().negate(), yH, zH));
      hand.visible = !ctx.done && m.liftAmt > 0.6;
      ring.visible = !ctx.done && sc.ready && m.liftAmt > 0.6;
      if (ring.visible) updateRing(ring, sc, ctx.time, g.localToWorld(nl.local.clone().setY(0.12)));
    },
    draw(gc) {
      if (!sc.ready || m.liftAmt < 0.6) return;
      // le compte des coups sous chaque clou : ●●● (3 = juste), ✕ pour les coups en trop
      for (const nl of nails) {
        const q = nailScreen(nl);
        for (let k = 0; k < MAXHITS; k++) {
          const px = q.x - 16 + k * 8;
          const py = q.y + 22;
          if (k < JUST) {
            gc.fillStyle = k < nl.hits ? '#1e8a4a' : 'rgba(255,255,255,0.85)';
            circle(gc, px, py, 3.4);
            gc.fill();
          } else if (k < nl.hits) label(gc, '✕', px, py, 11, '#e0574a');
        }
        if (nl.hits === JUST) label(gc, '✓', q.x + 18, q.y - 10, 16, '#1e8a4a');
      }
      label(gc, `${nails.filter((x) => x.hits >= JUST).length} / ${n}`, ctx.view.x0 + 50, Math.max(40, ctx.view.y0 + 40), 20);
    },
    destroy() {
      m.square = false;
      m.lift = null;
      sole?.remove();
      sc.scene.remove(hammer, hand, ring);
      own.free();
    },
  };
}

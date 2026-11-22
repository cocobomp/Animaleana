// Le bain du chien, en 3D : la même logique et la même note que le jeu dessiné (grooming.js washGame), comme le lavage
// du cheval (wash3d.js), sur le vrai chien du joueur debout dans une bassine en zinc, dans le coin de la maison
// (petBath.js). Étape 1, l'éponge : on frotte partout, la mousse monte (une passe suffit ; frotter encore sur la
// mousse en met trop, long à rincer) et la saleté part sous la mousse. Étape 2, la douchette : notre main la tient,
// l'eau suit le doigt (ou balaie le chien toute seule, bouton gardé appuyé), la mousse coule et disparaît. À la fin,
// il s'ébroue : tout le corps qui tourne, des gouttes partout.
//
// Les endroits à savonner sont des points de son flanc (rayons lancés sur le modèle), liés à ses os ; à chaque geste,
// ils sont projetés à l'écran et le doigt est comparé à eux comme dans le jeu dessiné (mêmes distances, en unités du
// cadre 400 × 360).

import * as THREE from 'three';
import { justRule } from './grooming.js';
import { distToSegment } from './draw.js';
import { groomTool } from '../../game/care/props.js';
import { paint } from '../../game/care/textures.js';
import { petRegionOf } from '../../game/care/petStage.js';
import { petDirtTexture } from '../../game/care/petTextures.js';
import { petHand, shoulderFor } from '../../game/care/petHand.js';
import { petBath, showerHead } from '../../game/care/petBath.js';
import { holdHand, own as owner } from '../../game/care/petProps.js';
import { audio } from '../../game/audio.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const BODY = new Set(['body', 'shoulder', 'hip', 'neck']);
const SOAP_MAX = 1.5;
const MAX = 1.5;
const LO = 0.85;
const OVER_RATE = 0.00025;
const relLum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

export function petWash3dGame(ctx) {
  const { t, fx } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const L = sc.marks;
  const S = L.size;
  const rng = ctx.rng;
  const m = sc.mood;
  m.posture = 'stand';
  m.ears = 'forward';
  m.happy = 0.4;
  const keep = owner();
  const hs = Math.max(0.45, Math.min(1, 0.2 + 1.5 * ((S.len + S.h) / 2))); // (comme pets3d.js handSize)

  // ---------------------------------------------------------------- la bassine, sous lui
  const bath = petBath(L);
  bath.group.position.set(L.body.x, 0, sc.holder.position.z);
  sc.scene.add(bath.group);

  // ---------------------------------------------------------------- les endroits à savonner, sur son flanc
  sc.proxy.bake();
  const step = Math.max(0.022, (L.back.y - L.belly.y) * 0.36);
  const cells = [];
  const ray = new THREE.Ray();
  const floorY = bath.rim + step * 0.2;
  for (let x = L.croup.x - step * 0.6; x <= L.withers.x + step * 0.8; x += step) {
    for (let y = Math.max(L.belly.y - step * 0.2, floorY); y <= L.back.y + step * 0.3; y += step * 0.9) {
      const jx = x + (rng() - 0.5) * step * 0.6;
      const jy = y + (rng() - 0.5) * step * 0.6;
      ray.set(v3(jx, jy, sc.holder.position.z + 2.5), v3(0, 0, -1));
      const h = sc.proxy.hit(ray, -9, 1e9);
      if (!h || !BODY.has(petRegionOf(h.boneName))) continue;
      cells.push({ p: h.point, n: h.normal, bone: h.bone, soap: 0, peak: 0, mud: rng() < 0.45, k: rng() });
    }
  }
  // (mousse et saleté : des cartes posées sur le poil, liées aux os ; la saleté qui se voit sur sa robe)
  const coatLum = relLum(new THREE.Color(ctx.col?.coat ?? '#c8a070'));
  // (au bain, c'est de la boue : terre sombre, sauf sur un poil noir où elle ne se verrait pas)
  const lightDirt = coatLum < 0.06;
  const foamTex = keep(new THREE.CanvasTexture(foamCanvas()));
  foamTex.colorSpace = THREE.SRGBColorSpace;
  const mudTex = keep(petDirtTexture(lightDirt, 8));
  const plane = keep(new THREE.PlaneGeometry(1, 1));
  function card(c, tex, size, order) {
    const mat = keep(new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 - order, polygonOffsetUnits: -4 - order }));
    const mesh = new THREE.Mesh(plane, mat);
    mesh.scale.set(size, size, 1);
    mesh.position.copy(c.p).addScaledVector(c.n, 0.003 + order * 0.002);
    mesh.lookAt(c.p.clone().add(c.n));
    mesh.rotateZ(rng() * Math.PI * 2);
    // (après les couches de poil)
    mesh.renderOrder = 40 + order;
    sc.scene.add(mesh);
    (c.bone ?? sc.holder).attach(mesh);
    return mesh;
  }
  for (const c of cells) {
    if (c.mud) c.mudMesh = card(c, mudTex, step * 1.1, 0);
    c.foam = card(c, foamTex, step * 1.6, 1);
    c.foam.visible = false;
  }

  // ---------------------------------------------------------------- l'éponge, la douchette
  const sponge = groomTool('sponge', keep);
  sponge.scale.setScalar(Math.max(0.42, Math.min(1, S.len / 0.85)));
  sponge.visible = false;
  sc.scene.add(sponge);
  const hand = petHand(keep, { ...(sc.decor.props.hand ?? {}), grip: 0.8, size: hs });
  hand.visible = false;
  sc.scene.add(hand);
  const shower = showerHead(keep, Math.max(0.6, hs));
  shower.visible = false;
  sc.scene.add(shower);
  const streamTex = keep(new THREE.CanvasTexture(paint(16, 64, (x) => {
    x.fillStyle = '#cfe8ff';
    x.fillRect(0, 0, 16, 64);
    for (let i = 0; i < 20; i++) {
      x.fillStyle = `rgba(255,255,255,${0.3 + (i % 5) * 0.12})`;
      x.fillRect((i * 7) % 16, (i * 13) % 64, 2, 6 + (i % 4) * 3);
    }
  }, 'washStream')));
  streamTex.wrapS = THREE.RepeatWrapping;
  streamTex.wrapT = THREE.RepeatWrapping;
  // (la douchette : une pluie de filets, un cône d'eau clair)
  const stream = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.6, 0.7, 1, 16, 1, true)), keep(new THREE.MeshStandardMaterial({ color: 0xe4f3ff, map: streamTex, transparent: true, opacity: 0.72, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide, emissive: 0x335a78, emissiveIntensity: 0.25 })));
  stream.visible = false;
  stream.renderOrder = 45;
  sc.scene.add(stream);
  const dropTex = keep(new THREE.CanvasTexture(paint(32, 32, (x) => {
    const gr = x.createRadialGradient(16, 14, 2, 16, 16, 15);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.5, 'rgba(200,230,255,0.85)');
    gr.addColorStop(1, 'rgba(160,210,245,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 32, 32);
  }, 'petDrop')));

  // ---------------------------------------------------------------- la logique (celle du jeu dessiné)
  const rule = justRule(ctx, { lo: LO, hi: 1.05, max: MAX, slack: 0.3 });
  let over = 0;
  let grace = 0;
  let spare = 0;
  let phase = 'soap';
  let soapValue = 0;
  let last = null;
  let auto = false;
  let autoT = 0;
  let sprayAt = null;
  let spray = 0;
  let shakeT = 0;
  let saidHappy = false;
  const frac = (fn) => (cells.length ? cells.filter(fn).length / cells.length : 1);
  const covered = () => frac((c) => c.soap >= 1);
  const soapNow = () => Math.min(MAX, covered() + over);
  const value = () => (phase === 'soap' ? soapNow() : soapValue);
  const bodyPx = () => {
    const a = sc.project(L.withers);
    const b = sc.project(L.croup);
    return Math.hypot(a.x - b.x, a.y - b.y) * 0.5; // (une demi-longueur de corps à l'écran)
  };
  spare = 3 * bodyPx();
  function place(c) {
    const w = (c.foam ?? c.mudMesh).getWorldPosition(v3());
    const q = sc.project(w);
    c.x = q.x;
    c.y = q.y;
    return c;
  }

  ctx.hint(t('mg_wash_hint'));
  // de profil, un peu de haut, la tête à droite ; toute la bassine
  const B = bath.size;
  const bx = bath.group.position;
  sc.frame([L.nose, L.poll, ...L.ears, L.withers, L.croup, L.tail, L.tailTip, L.chest, L.belly, bx.clone().add(v3(-B.len / 2, 0, B.wid / 2)), bx.clone().add(v3(B.len / 2, 0, B.wid / 2))], { dir: [0.5, 0.45, 1], pad: 1.08, now: true });

  function scrub(p) {
    if (!last) {
      last = p;
      return;
    }
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    if (d < 2) return;
    const near = cells.filter((c) => distToSegment(place(c).x, c.y, last.x, last.y, p.x, p.y) < 26);
    let extra = 0;
    if (near.some((c) => c.soap < 1)) grace = bodyPx();
    else if (near.length) {
      const free = Math.min(grace, d);
      grace -= free;
      let rest = d - free;
      if (covered() >= LO) {
        const s2 = Math.min(spare, rest);
        spare -= s2;
        rest -= s2;
      } else rest = 0;
      extra = rest;
    }
    for (const c of near) {
      if (c.soap < 1) c.soap = Math.min(1, c.soap + d * 0.022 + 0.04);
      else if (extra > 0) c.soap = Math.min(SOAP_MAX, c.soap + extra * 0.004);
      c.peak = Math.max(c.peak, c.soap);
    }
    over += extra * OVER_RATE;
    last = p;
    rule.show(soapNow());
    if (!saidHappy && covered() > 0.5) {
      saidHappy = true;
      audio.animal?.('dog', 'happy', ctx.a?.id ?? null);
    }
    if (soapNow() >= MAX - 0.08) toRinse();
  }

  function toRinse() {
    if (ctx.done || phase !== 'soap') return;
    soapValue = soapNow();
    phase = 'rinse';
    last = null;
    ctx.zone(null);
    ctx.progress(0);
    ctx.clearButtons();
    const btn = ctx.button('🚿 💦', { cls: 'primary', hold: true, onDown: () => { auto = true; }, onUp: () => { auto = false; } });
    btn?.setAttribute?.('aria-label', t('mg_wash_rinse'));
    ctx.hint(t('mg_wash_rinse'), 'good');
    fx.text(200, 80, t('mg_good'), '#2f8a5f', 26);
  }
  ctx.stopButton(toRinse);

  // ---------------------------------------------------------------- ce qu'on voit
  function showFoam() {
    let sum = 0;
    for (const c of cells) {
      if (c.mudMesh) {
        c.mudMesh.material.opacity = Math.max(0, 1 - c.peak / 0.7);
        c.mudMesh.visible = c.peak < 0.7;
      }
      const k = Math.min(SOAP_MAX, c.soap);
      sum += Math.min(1, c.peak);
      c.foam.visible = k > 0.02;
      if (c.foam.visible) {
        const s = step * 1.6 * (0.45 + k * 0.55);
        c.foam.scale.set(s, s, 1);
        c.foam.material.opacity = Math.min(1, 0.4 + k);
      }
    }
    // (la mousse tombe dans l'eau de la bassine)
    bath.foam(cells.length ? sum / cells.length : 0);
  }
  /** Les endroits savonnés, à l'écran (pour le balayage de la douche). */
  function rows() {
    const ps = cells.map(place);
    const xs = ps.map((c) => c.x);
    const ys = ps.map((c) => c.y);
    const top = Math.min(...ys) - 20;
    const bottom = Math.max(...ys);
    return { x0: Math.min(...xs) - 10, x1: Math.max(...xs) + 10, ys: bottom - top > 120 ? [top, top + 100] : [top] };
  }
  /** Il s'ébroue : des gouttes partent de son dos et de ses flancs. */
  function droplets(n) {
    for (let i = 0; i < n; i++) {
      const c = cells[Math.floor(Math.random() * cells.length)] ?? null;
      const at = c ? c.foam.getWorldPosition(v3()) : L.back.clone();
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: dropTex, transparent: true, depthWrite: false }));
      const s = Math.max(0.006, S.len * 0.018) * (0.6 + Math.random() * 0.8);
      spr.scale.set(s, s, s);
      spr.position.copy(at);
      const out = v3(0, (Math.random() - 0.3) * 0.6, (Math.random() < 0.5 ? -1 : 1)).normalize();
      sc.spawn(spr, { life: 0.7, v: out.multiplyScalar(0.6 + Math.random() * 0.8).add(v3((Math.random() - 0.5) * 0.4, 0.5, 0)), grav: 2.5 });
    }
  }

  return {
    peek: () => ({ phase, value: value(), lo: rule.lo, hi: rule.hi, max: MAX, over, soaped: covered(), rinsed: frac((c) => c.soap <= 0.05), cells: cells.length, shaking: shakeT > 0, cellsAt: cells.map((c) => ({ ...place(c) })).map(({ x, y }) => ({ x, y })) }),
    down(p) {
      last = p;
      grace = 0;
    },
    move(p, down) { if (down && phase === 'soap') scrub(p); },
    up() {
      last = null;
      grace = 0;
    },
    key(code, down) {
      if (code !== 'Space' && code !== 'Enter' && code !== 'NumpadEnter') return;
      if (phase === 'soap') { if (down) toRinse(); } else auto = down;
    },
    update(dt) {
      if (!ctx.done) sc.setFocus(88 * ctx.view.scale, sc.size.h - 20 * ctx.view.scale);
      bath.update(dt, ctx.time);
      const pp = ctx.pointer;
      // l'éponge sous le doigt (savonnage)
      sponge.visible = phase === 'soap' && !ctx.done && (pp.down || pp.over);
      if (sponge.visible) {
        const h = sc.pickAnimal(pp.x, pp.y);
        const at = h ? h.point.clone().addScaledVector(h.normal, pp.down ? 0.003 : 0.02) : sc.pointAtDepth(pp.x, pp.y, sc.camera.position.distanceTo(sc.camTarget) * 0.8);
        sponge.position.lerp(at, Math.min(1, dt * 25));
        sponge.quaternion.setFromUnitVectors(v3(0, 1, 0), h ? h.normal : v3(0, 0, 1));
        sponge.rotateY(ctx.time * (pp.down ? 5 : 0));
      }
      // la douchette
      sprayAt = null;
      if (phase === 'rinse' && !ctx.done) {
        if (pp.down) sprayAt = { x: pp.x, y: pp.y };
        else if (auto) {
          const R = rows();
          autoT += dt * 0.45;
          const leg = Math.floor(autoT);
          const k = autoT - leg;
          sprayAt = { x: leg % 2 ? R.x1 - (R.x1 - R.x0) * k : R.x0 + (R.x1 - R.x0) * k, y: R.ys[leg % R.ys.length] };
        }
      }
      hand.visible = !!sprayAt;
      shower.visible = !!sprayAt;
      stream.visible = !!sprayAt;
      if (sprayAt) {
        const h = sc.pickAnimal(sprayAt.x, sprayAt.y);
        const target = h ? h.point : sc.pointAtDepth(sprayAt.x, sprayAt.y, sc.camera.position.distanceTo(sc.camTarget));
        // la douchette : au-dessus de lui, de notre côté, la pomme tournée vers l'endroit visé
        const toCam = sc.camera.position.clone().sub(target).normalize();
        const from = target.clone().addScaledVector(toCam, Math.max(0.07, S.h * 0.35)).add(v3(0, Math.max(0.08, S.h * 0.38), 0));
        shower.position.lerp(from, Math.min(1, dt * 12));
        const down = target.clone().sub(shower.position).normalize();
        shower.quaternion.setFromUnitVectors(v3(0, -1, 0), down);
        shower.updateMatrixWorld(true);
        const grip = shower.localToWorld(shower.userData.grip.clone());
        holdHand(hand, grip, v3(0, 1, 0).applyQuaternion(shower.quaternion).negate(), shoulderFor(sc, grip));
        const face = shower.localToWorld(v3(0, -0.008, 0));
        const len = face.distanceTo(target);
        stream.position.copy(face).lerp(target, 0.5);
        stream.quaternion.setFromUnitVectors(v3(0, -1, 0), target.clone().sub(face).normalize());
        const w = 0.03 * Math.max(0.6, hs);
        stream.scale.set(w, len, w);
        streamTex.offset.y = (ctx.time * 3) % 1;
        streamTex.repeat.set(2, len * 6);
        const sp = sc.project(target);
        spray += dt * 30;
        while (spray > 1) {
          spray--;
          fx.dot(sp.x + (Math.random() - 0.5) * 30, sp.y + 6, 'rgba(120, 185, 240, 0.85)', 2.5, { vy: 200 + Math.random() * 80, vx: (Math.random() - 0.5) * 40, life: 0.45 });
        }
        for (const c of cells) {
          if (c.soap <= 0) continue;
          place(c);
          const dx = c.x - sprayAt.x;
          const dy = c.y - sprayAt.y;
          if (Math.abs(dx) < 34 && dy > -20 && dy < 110) c.soap = Math.max(0, c.soap - dt * 2.2);
        }
        // (l'eau sur la tête, il n'aime pas : oreilles en arrière ; sur le corps, il se laisse faire)
        m.ears = h?.region === 'head' ? 'back' : 'forward';
        m.look = sc.camera.position;
        m.lookAmt = 0.3;
        m.happy = 0.3;
      } else if (!ctx.done) {
        m.ears = 'forward';
        m.look = sc.camera.position;
        m.lookAmt = 0.4;
        m.happy = ctx.pointer.down ? 0.8 : 0.45;
      }
      if (phase === 'rinse' && !ctx.done) {
        const f = frac((c) => c.soap <= 0.05);
        ctx.progress(f / 0.92);
        if (f >= 0.92) {
          for (const c of cells) c.soap = 0;
          const top = sc.project(L.back);
          fx.burst(top.x, top.y, '💦', 10, { speed: 220, spread: 3 });
          ctx.zone(rule.lo / MAX, rule.hi / MAX);
          ctx.progress(soapValue / MAX);
          rule.finish(soapValue);
          // tout propre : il s'ébroue
          shakeT = 1.4;
          audio.animal?.('dog', 'happy', ctx.a?.id ?? null);
        }
      }
      if (shakeT > 0) {
        shakeT -= dt;
        // (il tourne tout le corps autour de sa colonne, vite, de plus en plus doucement)
        const k = Math.max(0, shakeT) / 1.4;
        sc.holder.rotation.x = Math.sin(ctx.time * 42) * 0.22 * k;
        if (Math.random() < dt * 40 * k) droplets(3);
        m.happy = 1;
      } else sc.holder.rotation.x = 0;
      showFoam();
    },
    draw(g) {
      if (!sc.ready || ctx.done) return;
      const v = ctx.view;
      g.save();
      g.translate(0, v.y0 + 4);
      if (phase === 'soap') rule.dial(g, value(), Math.min(354, v.x1 - 32));
      g.restore();
    },
    destroy() {
      for (const c of cells) {
        c.foam?.parent?.remove(c.foam);
        c.mudMesh?.parent?.remove(c.mudMesh);
      }
      sc.holder.rotation.x = 0;
      for (const o of [sponge, hand, stream, shower, bath.group]) o.parent?.remove(o);
      bath.dispose();
      keep.dispose();
    },
  };
}

/** La mousse : des bulles blanches serrées, un peu bleutées sur les bords. */
function foamCanvas() {
  return paint(128, 128, (x) => {
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    const base = x.createRadialGradient(64, 64, 8, 64, 64, 62);
    base.addColorStop(0, 'rgba(250,252,255,0.95)');
    base.addColorStop(0.6, 'rgba(240,247,255,0.8)');
    base.addColorStop(1, 'rgba(230,242,255,0)');
    x.fillStyle = base;
    x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r()) * 38;
      const cx = 64 + Math.cos(a) * d;
      const cy = 64 + Math.sin(a) * d * 0.85;
      const rad = 6 + r() * 12 * (1 - d / 70);
      const gr = x.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, rad * 0.1, cx, cy, rad);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.75, 'rgba(240,248,255,0.95)');
      gr.addColorStop(1, 'rgba(170,205,235,0.55)');
      x.fillStyle = gr;
      x.beginPath();
      x.arc(cx, cy, rad, 0, Math.PI * 2);
      x.fill();
    }
  }, 'foam2');
}

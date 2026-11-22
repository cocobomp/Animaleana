// Laver la vache, en 3D (dans l'étable : src/game/care/farmBarn.js). C'est le jeu du cheval (wash3d.js : même logique et
// même note que le jeu dessiné grooming.js washGame) adapté à la vache : ses os (régions du corps lues par
// l'adaptation de la scène, sc.fit), sa taille (unité : sa hauteur au garrot), sa voix (elle meugle doucement). Étape 1,
// l'éponge : la mousse monte et la boue part dessous ; étape 2, la douche : notre main tient la lance, la mousse coule.
// Elle frissonne de la peau quand c'est fini.
//
// (Copie plutôt que partage : le jeu du cheval reste tel quel.)

import * as THREE from 'three';
import { justRule } from './grooming.js';
import { clamp, distToSegment } from './draw.js';
import { groomTool, mudTexture, handModel, avatarHand, aimHand } from '../../game/care/props.js';
import { paint } from '../../game/care/textures.js';
import { callOut } from './farm3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const BODY = new Set(['body', 'shoulder', 'hip', 'neck']);
const SOAP_MAX = 1.5;
const MAX = 1.5;
const LO = 0.85;
const OVER_RATE = 0.00025;

export function cowWash3dGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  // (taille : celle d'un cheval de 1,55 m au garrot vaut 1)
  const S = sc.marks.u / 1.55;
  const L = sc.marks;
  const rng = ctx.rng;
  const m = sc.mood;
  m.ears = 'forward';
  const keep = [];
  const own = (x) => {
    keep.push(x);
    return x;
  };

  // ---------------------------------------------------------------- les endroits à savonner, sur son flanc
  sc.proxy.bake();
  const step = 0.13 * S;
  const cells = [];
  const ray = new THREE.Ray();
  for (let x = L.tail.x + 0.12 * S; x <= L.poll.x - 0.05 * S; x += step) {
    for (let y = L.belly.y + 0.06 * S; y <= L.withers.y + 0.1 * S; y += step * 0.9) {
      const jx = x + (rng() - 0.5) * step * 0.6;
      const jy = y + (rng() - 0.5) * step * 0.6;
      ray.set(v3(jx, jy, sc.holder.position.z + 2.5), v3(0, 0, -1));
      const h = sc.proxy.hit(ray, -9, 1e9);
      if (!h) continue;
      const region = h.boneName ? sc.fit?.region?.(h.boneName) ?? 'body' : 'body';
      if (!BODY.has(region)) continue;
      cells.push({ p: h.point, n: h.normal, bone: h.bone, soap: 0, peak: 0, mud: rng() < 0.45, k: rng() });
    }
  }
  // (mousse et boue : des cartes posées sur le poil, liées aux os)
  const foamTex = own(new THREE.CanvasTexture(foamCanvas()));
  foamTex.colorSpace = THREE.SRGBColorSpace;
  const mudTex = own(mudTexture('mud', 6));
  const plane = own(new THREE.PlaneGeometry(1, 1));
  function card(c, tex, size, order) {
    const mat = own(new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 0.6, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4 - order, polygonOffsetUnits: -4 - order }));
    const mesh = new THREE.Mesh(plane, mat);
    mesh.scale.set(size, size, 1);
    mesh.position.copy(c.p).addScaledVector(c.n, 0.006 + order * 0.002);
    mesh.lookAt(c.p.clone().add(c.n));
    mesh.rotateZ(rng() * Math.PI * 2);
    mesh.renderOrder = 2 + order;
    sc.scene.add(mesh);
    (c.bone ?? sc.holder).attach(mesh);
    return mesh;
  }
  for (const c of cells) {
    if (c.mud) c.mudMesh = card(c, mudTex, step * 1.1, 0);
    c.foam = card(c, foamTex, step * 1.6, 1);
    c.foam.visible = false;
  }

  // ---------------------------------------------------------------- l'éponge, la douche
  const sponge = groomTool('sponge', own);
  sponge.scale.setScalar(1.7 * Math.max(0.8, S));
  sponge.visible = false;
  sc.scene.add(sponge);
  const hand = handModel(own, { ...avatarHand(sc.game?.profile), grip: 0.85 });
  const nozzle = new THREE.Group();
  const nzMat = own(new THREE.MeshStandardMaterial({ color: 0x2f8a3c, roughness: 0.5 }));
  const nz = new THREE.Mesh(own(new THREE.CylinderGeometry(0.016, 0.02, 0.12, 14)), nzMat);
  nz.rotation.z = -Math.PI / 2;
  nz.position.x = 0.06;
  nozzle.add(nz);
  hand.add(nozzle);
  nozzle.position.set(0.03, -0.02, 0);
  hand.visible = false;
  sc.scene.add(hand);
  const streamTex = own(new THREE.CanvasTexture(paint(16, 64, (x) => {
    x.fillStyle = '#cfe8ff';
    x.fillRect(0, 0, 16, 64);
    for (let i = 0; i < 20; i++) {
      x.fillStyle = `rgba(255,255,255,${0.3 + (i % 5) * 0.12})`;
      x.fillRect((i * 7) % 16, (i * 13) % 64, 2, 6 + (i % 4) * 3);
    }
  }, 'washStream')));
  streamTex.wrapS = THREE.RepeatWrapping;
  streamTex.wrapT = THREE.RepeatWrapping;
  const stream = new THREE.Mesh(own(new THREE.CylinderGeometry(1, 1, 1, 12, 1, true)), own(new THREE.MeshStandardMaterial({ color: 0xd8eeff, map: streamTex, transparent: true, opacity: 0.6, roughness: 0.05, depthWrite: false })));
  stream.visible = false;
  sc.scene.add(stream);

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
  const frac = (fn) => (cells.length ? cells.filter(fn).length / cells.length : 1);
  const covered = () => frac((c) => c.soap >= 1);
  const soapNow = () => Math.min(MAX, covered() + over);
  const value = () => (phase === 'soap' ? soapNow() : soapValue);
  const bodyPx = () => sc.projectRadius(L.body, 1) * 0.6; // (une demi-longueur de corps à l'écran)
  spare = 3 * bodyPx();
  function place(c) {
    const w = (c.foam ?? c.mudMesh).getWorldPosition(v3());
    const q = sc.project(w);
    c.x = q.x;
    c.y = q.y;
    return c;
  }

  ctx.hint(t('mg_wash_hint'));
  // (tout le flanc : du bout du nez aux fesses, derrière la queue)
  const rump = L.croup.clone().lerp(L.tail, 0.8).add(v3(-0.16 * S, -0.12 * S, 0));
  sc.frame([L.withers, L.croup, L.back, L.belly, L.chest, L.tail, rump, L.poll, L.muzzle, ...L.ears, L.belly.clone().add(v3(0, -0.12 * S, 0))], { dir: [0.42, 0.2, 1], pad: 1.1 });

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
    const shower = ctx.button('🚿 💦', { cls: 'primary', hold: true, onDown: () => { auto = true; }, onUp: () => { auto = false; } });
    shower?.setAttribute?.('aria-label', t('mg_wash_rinse'));
    ctx.hint(t('mg_wash_rinse'), 'good');
    fx.text(200, 80, t('mg_good'), '#2f8a5f', 26);
  }
  ctx.stopButton(toRinse);

  // ---------------------------------------------------------------- ce qu'on voit
  function showFoam() {
    for (const c of cells) {
      if (c.mudMesh) {
        c.mudMesh.material.opacity = Math.max(0, 1 - c.peak / 0.7);
        c.mudMesh.visible = c.peak < 0.7;
      }
      const k = Math.min(SOAP_MAX, c.soap);
      c.foam.visible = k > 0.02;
      if (c.foam.visible) {
        const s = step * 1.6 * (0.45 + k * 0.55);
        c.foam.scale.set(s, s, 1);
        c.foam.material.opacity = Math.min(1, 0.4 + k);
      }
    }
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

  return {
    peek: () => ({ phase, value: value(), lo: rule.lo, hi: rule.hi, max: MAX, over, soaped: covered(), rinsed: frac((c) => c.soap <= 0.05), cells: cells.length, three: true }),
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
      const pp = ctx.pointer;
      // l'éponge sous le doigt (savonnage)
      sponge.visible = phase === 'soap' && !ctx.done && (pp.down || pp.over);
      if (sponge.visible) {
        const h = sc.pickAnimal(pp.x, pp.y);
        const at = h ? h.point.clone().addScaledVector(h.normal, pp.down ? 0.005 : 0.04) : sc.pointAtDepth(pp.x, pp.y, sc.camera.position.distanceTo(sc.camTarget) * 0.8);
        sponge.position.lerp(at, Math.min(1, dt * 25));
        sponge.quaternion.setFromUnitVectors(v3(0, 1, 0), h ? h.normal : v3(0, 0, 1));
        sponge.rotateY(ctx.time * (pp.down ? 5 : 0));
      }
      // la douche
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
      stream.visible = !!sprayAt;
      if (sprayAt) {
        const h = sc.pickAnimal(sprayAt.x, sprayAt.y);
        const target = h ? h.point : sc.pointAtDepth(sprayAt.x, sprayAt.y, sc.camera.position.distanceTo(sc.camTarget));
        // la main et la lance : tout près de son poil, entre lui et nous, un peu au-dessus, visant l'endroit
        const toCam = sc.camera.position.clone().sub(target).normalize();
        const from = target.clone().addScaledVector(h ? h.normal.clone().lerp(toCam, 0.5).normalize() : toCam, 0.3 * S).add(v3(0, 0.08 * S, 0));
        hand.position.lerp(from, hand.visible ? Math.min(1, dt * 12) : 1);
        aimHand(hand, from.clone().addScaledVector(toCam, 0.4).add(v3(0.15, -0.15, 0)), target, false);
        const tip = nozzle.localToWorld(v3(0.12, 0, 0));
        const len = tip.distanceTo(target);
        stream.position.copy(tip).lerp(target, 0.5);
        stream.quaternion.setFromUnitVectors(v3(0, 1, 0), target.clone().sub(tip).normalize());
        stream.scale.set(0.012, len, 0.012);
        streamTex.offset.y = (ctx.time * 3) % 1;
        streamTex.repeat.set(1, len * 4);
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
        m.ears = 'back';
        m.look = sc.camera.position;
        m.lookAmt = 0.3;
      } else if (!ctx.done) {
        m.ears = 'forward';
        m.look = sc.camera.position;
        m.lookAmt = 0.4;
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
          shakeT = 1.2;
          m.nod = 1;
          callOut(sc);
        }
      }
      if (shakeT > 0) {
        shakeT -= dt;
        sc.holder.rotation.z = Math.sin(ctx.time * 30) * 0.02 * Math.max(0, shakeT);
      } else sc.holder.rotation.z = 0;
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
      sc.holder.rotation.z = 0;
      for (const o of [sponge, hand, stream]) o.parent?.remove(o);
      for (const x of keep) x.dispose?.();
    },
  };
}

/** La mousse : des bulles blanches serrées, un peu bleutées sur les bords. */
function foamCanvas() {
  return paint(128, 128, (x) => {
    let s = 7;
    const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    // un nuage de mousse doux (les bords s'effacent : les endroits voisins se fondent en une seule mousse), puis
    // les bulles par-dessus
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

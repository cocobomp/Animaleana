// Brosser un mouton, une chèvre, une vache, en 3D : la même règle que le jeu dessiné (grooming.js brushGame : sept
// taches de poussière à chasser, dans le sens du poil ‹‹ c'est mieux, puis « C'est bon ! » ; continuer à frotter le
// poil propre irrite la peau), sur le vrai animal de profil dans sa case. Les taches sont des cartes de poussière
// posées sur son poil (sur la laine gonflée du mouton), liées à ses os : elles suivent sa respiration ; la brosse
// en 3D se pose sous le doigt, dans le sens du geste. Il aime ça : il rumine, la queue frétille ; trop : oreilles
// couchées, il secoue la tête.

import * as THREE from 'three';
import { justRule } from './grooming.js';
import { clamp, lerp, distToSegment, label } from './draw.js';
import { emojiOpaque as emoji } from './food.js';
import { mudTexture } from '../../game/care/props.js';
import { farmBrushModel } from '../../game/care/stableChores.js';
import { pickFarm } from './farmPet3d.js';
import { callOut } from './farm3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const BODY = new Set(['body', 'shoulder', 'hip', 'neck']);
const MAX = 1.4;
const OVER_RATE = 0.0002;

/** Volume de la laine (m) par-dessus le corps que touche le rayon (sheepCoat.js : gonflée par le dessin). */
export function woolOut(sc) {
  const u = sc.model.uniforms?.sPuff?.value;
  return u ? (u.x * (1 + (u.z ?? 0) * 0.5) + (u.y ?? 0) * 0.5) * (sc.model.size ?? 1) * sc.double.scale : 0;
}

export function farmBrush3dGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const rng = ctx.rng;
  const L = sc.marks;
  const u = L.u;
  const keep = [];
  const own = (x) => {
    keep.push(x);
    return x;
  };
  const m = sc.mood;
  m.ears = 'forward';
  const puff = woolOut(sc);

  // ---------------------------------------------------------------- les taches de poussière, posées sur le poil
  const dustTex = own(mudTexture('dust', 7));
  const patchGeo = own(new THREE.PlaneGeometry(1, 1));
  // (une poussière qui se voit : brune sur une toison ou une robe claire, gris clair sur une robe foncée)
  const coat = new THREE.Color(a?.look?.coat ?? 0xd8c8b0);
  const dark = coat.r * 0.3 + coat.g * 0.59 + coat.b * 0.11 < 0.45;
  const dustCol = dark ? 0xe0d6c4 : 0x8a6a4c;
  function decal(p, n, bone, r) {
    const mat = own(new THREE.MeshStandardMaterial({ map: dustTex, bumpMap: dustTex, bumpScale: 2, transparent: true, depthWrite: false, roughness: 1, color: dustCol, emissive: dark ? 0x2a2620 : 0x000000, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    const mesh = new THREE.Mesh(patchGeo, mat);
    mesh.scale.set(r * 2.6, r * 1.8, 1);
    mesh.position.copy(p).addScaledVector(n, 0.006 + puff);
    mesh.lookAt(mesh.position.clone().add(n));
    mesh.rotateZ((rng() - 0.5) * 0.5);
    mesh.renderOrder = 2;
    sc.scene.add(mesh);
    (bone ?? sc.holder).attach(mesh);
    return mesh;
  }
  /** Des points du flanc (côté caméra), sur le corps et l'encolure : rayons lancés vers lui depuis l'allée. */
  function bodyPoints(count, r0) {
    const out = [];
    const x0 = L.croup.x - 0.05 * u;
    const x1 = L.withers.x + 0.25 * u;
    // (le flanc, pas le dessus du dos : vue de profil, une tache posée sur le dos s'étirait en trait)
    const y0 = L.belly.y + 0.16 * u;
    const y1 = L.back.y - 0.14 * u;
    const z0 = sc.holder.position.z + 3;
    const ray = new THREE.Ray();
    for (let r = r0; r > r0 * 0.4 && out.length < count; r *= 0.92) {
      out.length = 0;
      for (let tries = 0; out.length < count && tries < 200; tries++) {
        ray.set(v3(lerp(x0, x1, rng()), lerp(y0, y1, rng()), z0), v3(0, 0, -1));
        const h = sc.proxy.hit(ray, -9, 1e9);
        if (!h || !BODY.has(sc.fit?.region ? sc.fit.region(h.boneName) : 'body')) continue;
        const rr = r * (0.9 + rng() * 0.2);
        if (out.some((q) => q.p.distanceTo(h.point) < (q.r + rr) * 1.1)) continue;
        out.push({ p: h.point, n: h.normal, bone: h.bone, r: rr });
      }
    }
    return out;
  }
  sc.proxy.bake();
  const patches = bodyPoints(7, 0.1 * u).map((q) => ({ ...q, dirt: 1, mesh: decal(q.p, q.n, q.bone, q.r) }));
  const n = Math.max(1, patches.length);
  const rule = justRule(ctx, { lo: 1 - 0.5 / n, hi: 1.05, max: MAX, slack: 0.3 });
  let over = 0;
  let nextMark = 0;
  let good = 0;
  let bad = 0;
  let last = null;
  let rot = 0;
  let shine = 0;
  let grace = 0;
  let touch = null;
  let happyT = 0;
  let saidHappy = false;
  const GRACE = () => 2 * sc.projectRadius(L.body, 0.5 * u);

  ctx.hint(t('mg_brush_hint'));
  const clean = () => 1 - patches.reduce((s, p) => s + p.dirt, 0) / n;
  const value = () => Math.min(MAX, clean() + over);
  const stop = () => { if (!ctx.done) rule.finish(value()); };
  ctx.stopButton(stop);

  // Tout l'animal de profil (la tête à droite, comme les jeux dessinés), un peu vu d'en haut.
  sc.frame([L.muzzle, L.poll, ...L.ears, L.withers, L.croup, L.tailTip, ...L.hooves, L.chest, L.belly], { dir: [0.12, 0.2, 1], pad: 1.06, now: true });

  function place(q) {
    const w = q.mesh.getWorldPosition(v3());
    const p = sc.project(w);
    q.x = p.x;
    q.y = p.y;
    q.rr = Math.max(8, sc.projectRadius(w, q.r));
    return q;
  }

  function rub(p) {
    if (!last) {
      last = p;
      return;
    }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) return;
    // (la tête est à droite : dans le sens du poil, c'est vers la gauche, vers la queue)
    const withHair = -dx > d * 0.35;
    rot = lerp(rot, clamp(dx / 40, -0.5, 0.5), 0.3);
    touch = pickFarm(sc, p.x, p.y);
    let touched = false;
    for (const q of patches) {
      if (q.dirt <= 0) continue;
      place(q);
      if (distToSegment(q.x, q.y, last.x, last.y, p.x, p.y) > q.rr + 14) continue;
      touched = true;
      q.dirt -= d * 0.0062 * (withHair ? 1 : 0.55);
      q.mesh.material.opacity = Math.max(0, Math.min(1, q.dirt * 1.15));
      if (Math.random() < 0.5) fx.dot(p.x + (Math.random() - 0.5) * 20, p.y + 10, 'rgba(150, 120, 90, 0.6)', 3 + Math.random() * 3, { vx: (Math.random() - 0.5) * 60, vy: 40, grav: 120, life: 0.6 });
      if (q.dirt <= 0.15) {
        q.dirt = 0;
        q.mesh.visible = false;
        fx.burst(q.x, q.y, '✨', 3, { speed: 80, size: 16 });
      }
    }
    if (touched) {
      if (withHair) good += d;
      else bad += d;
      grace = GRACE();
      happyT = 1.2;
      if (rule.state() === 'low') {
        if (bad > 260 && bad > good) ctx.hint(t('mg_brush_dir'), 'warn');
        else if (withHair && good > 120) ctx.hint(t('mg_brush_good'), 'good');
      }
    } else if (value() >= rule.lo && touch && BODY.has(touch.region)) {
      // Dans la zone : continuer à frotter le poil propre irrite la peau.
      const free = Math.min(grace, d);
      grace -= free;
      over += (d - free) * OVER_RATE;
      if (value() > rule.hi && over >= nextMark) {
        nextMark = over + 0.06;
        fx.float(p.x, p.y - 20, '💢', 20);
        m.annoyed = 0.8;
      }
    } else if (touch) happyT = Math.max(happyT, 0.6);
    last = p;
    rule.show(value());
    if (value() >= MAX) stop();
  }

  // la brosse, sous le doigt
  // (la brosse en chiendent : dos en bois, anse de cuir, touffes de poils clairs — de profil, on la reconnaît)
  const brush = farmBrushModel(own);
  brush.scale.setScalar(clamp(0.8 + u * 0.3, 0.9, 1.3));
  brush.visible = false;
  sc.scene.add(brush);
  const toolPos = v3();
  function showTool(dt) {
    const pp = ctx.pointer;
    if (ctx.done || !(pp.down || pp.over)) {
      brush.visible = false;
      return;
    }
    const h = pp.down && touch ? touch : pickFarm(sc, pp.x, pp.y);
    let p;
    let nn;
    if (h) {
      p = h.point.clone().addScaledVector(h.normal, puff);
      nn = h.normal;
    } else {
      p = sc.pointAtDepth(pp.x, pp.y, sc.camera.position.distanceTo(sc.camTarget) * 0.8);
      nn = sc.camera.position.clone().sub(p).normalize();
    }
    toolPos.copy(p).addScaledVector(nn, pp.down ? 0.004 : 0.04);
    brush.position.lerp(toolPos, brush.visible ? Math.min(1, dt * 25) : 1);
    brush.quaternion.setFromUnitVectors(v3(0, 1, 0), nn);
    brush.rotateY(rot * 1.5);
    // (penchée sur la tranche, vers le bas, comme on la tient : vue de face sur le flanc, on voit les poils sous le bois
    // et l'anse dessus, pas seulement le dos de la brosse)
    brush.rotateX(0.55);
    brush.visible = true;
  }

  return {
    peek: () => ({
      value: value(), lo: rule.lo, hi: rule.hi, max: MAX, clean: clean(), over, n,
      patches: patches.filter((q) => q.dirt > 0).map((q) => {
        place(q);
        return { x: q.x, y: q.y, r: q.rr, dirt: q.dirt };
      }),
    }),
    down(p) {
      last = p;
      grace = 0;
      touch = pickFarm(sc, p.x, p.y);
    },
    move(p, down) { if (down) rub(p); },
    up() {
      last = null;
      grace = 0;
    },
    key(code, down) { if (down && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')) stop(); },
    update(dt) {
      if (ctx.done || clean() >= 0.999) shine += dt;
      showTool(dt);
      happyT = Math.max(0, happyT - dt);
      const zone = value() < rule.lo ? 'low' : value() > rule.hi ? 'high' : 'just';
      // Il aime être brossé : il rumine, la queue frétille, il tourne un peu la tête vers nous.
      const happy = (happyT > 0 && zone !== 'high') || (ctx.done && over < 0.1);
      m.ears = zone === 'high' ? 'back' : 'forward';
      m.chew = happy ? 1 : Math.max(0, (m.chew ?? 0) - dt * 0.4);
      m.wag = lerp(m.wag ?? 0, happy ? 0.6 : 0, Math.min(1, dt * 3));
      m.look = sc.camera.position;
      m.lookAmt = happy ? 0.45 : 0.25;
      if (happy && !saidHappy && clean() > 0.4) {
        saidHappy = true;
        callOut(sc);
      }
      if (ctx.done && over < 0.1 && shine > 0 && shine < dt * 1.5) callOut(sc);
    },
    draw(g) {
      if (!sc.ready) return;
      const st = rule.state();
      // Sens du poil (tant qu'il reste des taches) : ‹‹ sur le flanc.
      if (!ctx.done && clean() < 0.999) {
        g.save();
        g.globalAlpha = 0.5 + Math.sin(ctx.time * 3) * 0.15;
        for (const k of [0.2, 0.5, 0.8]) {
          const w = L.croup.clone().lerp(L.withers, k);
          w.y = lerp(L.belly.y, L.back.y, 0.55);
          w.z += 0.3 * u + puff;
          const q = sc.project(w);
          label(g, '‹‹', q.x, q.y, 22, '#ffffff');
        }
        g.restore();
      }
      // Le poil brille : c'est le moment de s'arrêter.
      if (clean() >= 0.999 && st !== 'high') {
        for (let i = 0; i < 4; i++) {
          const w = L.croup.clone().lerp(L.withers, 0.5 + Math.cos(shine * 2 + i * 1.6) * 0.4);
          w.y = lerp(L.belly.y, L.back.y, 0.5 + Math.sin(shine * 3 + i) * 0.3);
          w.z += 0.3 * u + puff;
          const q = sc.project(w);
          emoji(g, '✨', q.x, q.y, 18, 0, 0.8);
        }
      }
      rule.dial(g, value(), ctx.view.x1 - 46, ctx.view.y0 + 46);
    },
    destroy() {
      sc.scene.remove(brush);
      for (const q of patches) q.mesh.parent?.remove(q.mesh);
      for (const x of keep) x.dispose?.();
    },
  };
}

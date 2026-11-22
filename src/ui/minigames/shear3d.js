// La tonte du mouton, en 3D : la même règle que le jeu dessiné (grooming.js shearGame : passer la tondeuse une fois
// sur toute la laine, sans raser, puis « C'est bon ! » ; une touffe repassée trop tôt est rasée, la peau rose), sur
// le vrai mouton de profil dans la bergerie. Sa toison se coupe vraiment là où passe la tondeuse (fleece.js : chaque
// sommet de sa peau, les deux flancs ensemble) : la laine rentre et devient courte et claire, des flocons tombent
// dans la paille et y font un tas ; à la fin, il est plus fin. Rasé : la peau rosit, il sursaute, il bêle.

import * as THREE from 'three';
import { justRule } from './grooming.js';
import { clamp, distToSegment, dist, label } from './draw.js';
import { cuttableFleece, fleeceFall, clipperModel } from '../../game/care/fleece.js';
import { pickFarm } from './farmPet3d.js';
import { woolOut } from './farmBrush3d.js';
import { callOut } from './farm3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const WOOLLY = new Set(['body', 'shoulder', 'hip', 'neck']);
const MAX = 2;

export function shear3dGame(ctx) {
  const { t, fx } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const L = sc.marks;
  const u = L.u;
  const m = sc.mood;
  m.ears = 'forward';
  const keep = [];
  const own = (x) => {
    keep.push(x);
    return x;
  };
  const puff = woolOut(sc);
  const fleece = cuttableFleece(sc);
  const zc = sc.holder.position.z;
  const fold = (p) => v3(p.x, p.y, zc + Math.abs(p.z - zc));

  // ---------------------------------------------------------------- les touffes (une grille sur le flanc)
  const step = 0.075 * u;
  const wool = [];
  {
    const ray = new THREE.Ray();
    const x0 = L.tail.x - 0.02 * u;
    const x1 = L.muzzle.x - 0.12 * u;
    const y0 = L.belly.y - 0.1 * u;
    const y1 = L.back.y + 0.12 * u;
    let row = 0;
    for (let y = y0; y <= y1; y += step * 0.9, row++) {
      for (let x = x0 + (row % 2) * step * 0.5; x <= x1; x += step) {
        ray.set(v3(x, y, zc + 3), v3(0, 0, -1));
        const h = sc.proxy.hit(ray, -9, 1e9);
        if (!h || !WOOLLY.has(sc.fit?.region ? sc.fit.region(h.boneName) : 'body')) continue;
        wool.push({ p: h.point, n: h.normal, bone: h.bone, len: 2, k: 0, away: true, at: -9, verts: [] });
      }
    }
  }
  // Chaque sommet de laine va à la touffe la plus proche (flancs repliés l'un sur l'autre), même loin de la grille (le
  // haut de l'encolure, le dessous du ventre, la lisière de la toison) : aucun sommet ne garde sa laine seul.
  if (fleece) {
    const tufts = wool.map((w) => fold(w.p));
    fleece.pos.forEach((p, i) => {
      const f = fold(p);
      let best = -1;
      let bd = Infinity;
      for (let k = 0; k < tufts.length; k++) {
        const d = tufts[k].distanceToSquared(f);
        if (d < bd) {
          bd = d;
          best = k;
        }
      }
      if (best >= 0) wool[best].verts.push(fleece.verts[i]);
    });
  }
  // (une touffe qui ne porte aucun sommet ne compte pas : rien à couper là)
  const tufts = fleece ? wool.filter((w) => w.verts.length) : wool;
  const total = Math.max(1, tufts.length);
  const rule = justRule(ctx, { lo: 0.85, hi: 1.15, max: MAX, slack: 0.35 });
  ctx.hint(t('mg_shear_hint_just'));
  const value = () => tufts.reduce((s, w) => s + (2 - w.len), 0) / total;
  const stop = () => { if (!ctx.done) rule.finish(value()); };
  ctx.stopButton(stop);

  // Les flocons qui tombent dans la paille.
  const woolCol = new THREE.Color(sc.model.build?.colors?.wool ?? 0xeee6d6);
  const fall = fleeceFall(sc.scene, { color: woolCol, size: 0.045 * u, floor: 0.06 });

  // Tout le mouton de profil, grand dans l'image.
  sc.frame([L.muzzle, L.poll, ...L.ears, L.withers, L.croup, L.tailTip, ...L.hooves, L.chest, L.belly], { dir: [0.08, 0.16, 1], pad: 1.04, now: true });

  let last = null;
  let rot = 0;
  let touch = null;
  let ouch = 0;
  let saidHalf = false;

  function place(w) {
    const q = sc.project(w.p);
    w.x = q.x;
    w.y = q.y;
    w.r = Math.max(5, sc.projectRadius(w.p, step * 0.75));
    return w;
  }

  function cutAlong(p) {
    if (!last) {
      last = p;
      return;
    }
    rot = rot * 0.7 + clamp((p.x - last.x) / 40, -0.5, 0.5) * 0.3;
    touch = pickFarm(sc, p.x, p.y);
    for (const w of tufts) {
      if (w.len <= 0) continue;
      place(w);
      // Une touffe longue se coupe de loin ; pour la raser, il faut passer juste dessus (comme le jeu dessiné).
      const reach = w.len === 2 ? 20 + w.r * 0.3 : 9 + w.r * 0.3;
      const near = distToSegment(w.x, w.y, last.x, last.y, p.x, p.y) < reach;
      if (near && w.away && (w.len === 2 || ctx.time - w.at > 1.5)) {
        w.len--;
        w.at = ctx.time;
        w.away = false;
        const at = w.p.clone().addScaledVector(w.n, puff * 0.8);
        if (w.len === 1) {
          fall.drop(at, w.n);
          if (Math.random() < 0.6) fall.drop(at, w.n);
        } else {
          fall.drop(at, w.n);
          ouch = 0.6;
          m.flinch = 0.6;
          m.annoyed = 0.7;
          if (Math.random() < 0.3) fx.float(w.x, w.y - 10, '💢', 16);
          if (Math.random() < 0.25) callOut(sc, 'sad');
        }
      } else if (!near && dist(w.x, w.y, p.x, p.y) > reach + 12) w.away = true;
    }
    last = p;
    const v = value();
    const s = rule.show(v);
    if (s === 'low' && v > 0.5 && !saidHalf) {
      saidHalf = true;
      ctx.hint(t('mg_shear_more'), 'good');
      callOut(sc);
    }
    if (v >= MAX - 0.02) stop();
  }

  // la tondeuse, sous le doigt (elle vibre quand elle coupe)
  const clip = clipperModel(own);
  clip.scale.setScalar(clamp(0.8 + u * 0.35, 0.9, 1.3));
  clip.visible = false;
  sc.scene.add(clip);
  const toolPos = v3();
  function showTool(dt) {
    const pp = ctx.pointer;
    if (ctx.done || !(pp.down || pp.over)) {
      clip.visible = false;
      return;
    }
    const h = pp.down && touch ? touch : pickFarm(sc, pp.x, pp.y);
    let p;
    let nn;
    if (h) {
      p = h.point.clone().addScaledVector(h.normal, puff * 0.5);
      nn = h.normal;
    } else {
      p = sc.pointAtDepth(pp.x, pp.y, sc.camera.position.distanceTo(sc.camTarget) * 0.8);
      nn = sc.camera.position.clone().sub(p).normalize();
    }
    toolPos.copy(p).addScaledVector(nn, pp.down ? 0.004 : 0.04);
    if (pp.down) toolPos.add(v3((Math.random() - 0.5) * 0.003, (Math.random() - 0.5) * 0.003, 0));
    clip.position.lerp(toolPos, clip.visible ? Math.min(1, dt * 25) : 1);
    clip.quaternion.setFromUnitVectors(v3(0, 1, 0), nn);
    clip.rotateY(-Math.PI / 2 + rot);
    clip.visible = true;
  }

  return {
    peek: () => ({
      value: value(), lo: rule.lo, hi: rule.hi, max: MAX, total,
      long: tufts.filter((w) => w.len === 2).length, short: tufts.filter((w) => w.len === 1).length, bald: tufts.filter((w) => w.len === 0).length,
      longAt: tufts.filter((w) => w.len === 2).map((w) => {
        place(w);
        return { x: Math.round(w.x), y: Math.round(w.y) };
      }),
      fallen: fall.count,
    }),
    down(p) {
      last = p;
      touch = pickFarm(sc, p.x, p.y);
    },
    move(p, down) { if (down) cutAlong(p); },
    up() {
      last = null;
      for (const w of tufts) w.away = true;
    },
    key(code, down) { if (down && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')) stop(); },
    update(dt) {
      showTool(dt);
      ouch = Math.max(0, ouch - dt);
      // La toison suit les coupes (en douceur : la laine rentre en un quart de seconde).
      if (fleece) {
        for (const w of tufts) {
          const want = w.len === 2 ? 0 : w.len === 1 ? 0.5 : 1;
          if (w.k === want) continue;
          w.k = want > w.k ? Math.min(want, w.k + dt * 4) : Math.max(want, w.k - dt * 4);
          for (const v of w.verts) fleece.set(v, w.k);
        }
        fleece.flush();
      }
      // La laine longue de l'islandais : ses mèches raccourcissent avec la tonte.
      m.lockK = clamp(1 - value() * 1.1, 0, 1);
      fall.update(dt);
      const zone = value() < rule.lo ? 'low' : value() > rule.hi ? 'high' : 'just';
      m.ears = zone === 'high' || ouch > 0 ? 'back' : 'forward';
      m.look = sc.camera.position;
      m.lookAmt = 0.3;
      m.chew = ctx.pointer.down && ouch <= 0 ? 0.7 : Math.max(0, (m.chew ?? 0) - dt * 0.3);
    },
    draw(g) {
      if (!sc.ready) return;
      rule.dial(g, value(), ctx.view.x1 - 46, ctx.view.y0 + 46);
      const pp = ctx.pointer;
      if (!ctx.done && value() === 0 && !(pp.over || pp.down)) {
        // Rien de coupé encore : ↔ au-dessus du dos, pour montrer le geste.
        const q = sc.project(L.croup.clone().lerp(L.withers, 0.5).add(v3(0, 0.28 * u, 0)));
        const k = Math.sin(ctx.time * 2.2);
        label(g, '↔', q.x + k * 14, q.y, 30, 'rgba(35, 48, 42, 0.6)');
      }
    },
    destroy() {
      sc.scene.remove(clip);
      fall.dispose();
      fleece?.dispose();
      m.lockK = undefined;
      for (const x of keep) x.dispose?.();
    },
  };
}

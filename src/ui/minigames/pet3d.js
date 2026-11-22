// Caresser le cheval, en 3D : on glisse le doigt sur lui (lancer de rayon sur le vrai modèle) et notre main se pose
// sur son poil. Mêmes règles que le jeu dessiné (fun.js petGame) : doucement (au-delà de sa vitesse, il sursaute,
// oreilles couchées), son coin préféré (garrot, encolure, poitrail ou front : src/sim/horseQuirks.js) compte plus
// et, gratté là, il tend la lèvre ; le cœur doit s'arrêter dans la zone verte (trop : il en a assez).
// Il répond : oreilles en avant, tête qui se tourne vers nous et s'abaisse, détendu ; hennissement doux.

import * as THREE from 'three';
import { FAVORITE, SPEED_LIMIT, PET_AMOUNT, drawHeartGauge, HEART } from './fun.js';
import { stopLabel, nb, justMsgs, emojiOpaque as emoji } from './food.js';
import { quirksOf, knows, QUIRK_SPOTS } from '../../sim/horseQuirks.js';
import { keepsMemories } from '../../sim/memories.js';
import { rrect, circle, clamp, lerp } from './draw.js';
import { nicker, snort } from './feed3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Où sont ses coins (repère monde, pose du moment) : garrot, encolure, poitrail, front. */
export function petSpots(sc) {
  const L = sc.marks;
  const toUs = v3(0, 0, 1); // (son côté droit, face à nous)
  const R = (sc.model.dims?.R ?? 0.35) * sc.double.scale;
  const neckMid = L.withers.clone().lerp(sc.live('head'), 0.42).add(v3(0, -0.08, 0)).addScaledVector(toUs, 0.12 * sc.double.scale);
  return {
    withers: L.withers.clone().add(v3(-0.05, -0.04, 0)).addScaledVector(toUs, 0.1 * sc.double.scale),
    neck: neckMid,
    chest: L.chest.clone().addScaledVector(toUs, R * 0.55).add(v3(0.08, 0, 0)),
    forehead: sc.live('forehead'),
  };
}

export function pet3dGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const hint = (text, kind) => ctx.hint(nb(text), kind);
  const qk = keepsMemories(a) ? quirksOf(a) : null;
  const favKey = qk ? qk.spot : FAVORITE[a.species] ?? 'neck';
  const hintAfter = qk && !knows(a, 'spot') ? 8 : 3.5;
  const limit = SPEED_LIMIT[a.personality] ?? 420;
  const shy = a.personality === 'shy';
  const target = PET_AMOUNT[a.personality] ?? 0.65;
  const band = 0.12;
  const lo = target - band;
  const hi = target + band;
  const favR = 0.2 * sc.double.scale; // (mètres : son coin, sur le modèle)
  let prog = 0;
  let speed = 0;
  let last = null;
  let lastT = 0;
  let heartAcc = 0;
  let favDist = 0;
  let fast = 0;
  let flinch = 0;
  let cool = 0;
  let calmStroke = 0;
  let purr = 0;
  let lip = 0;
  let lipShown = false;
  let lastLove = -9;
  let zoneState = 'low';
  let touch = null; // dernier point touché sur lui ({ point, normal })
  let touchAge = 9;
  let nickered = false;

  const L = sc.marks;
  const spotsNow = () => petSpots(sc);
  sc.frame([L.muzzle, L.poll, ...L.ears, L.withers, L.chest, L.chest.clone().add(v3(0, -0.2, 0)), L.withers.clone().add(v3(-0.3, 0, 0))], { dir: [0.55, 0.1, 1], pad: 1.04, now: true });
  const m = sc.mood;
  m.ears = 'forward';


  hint(t(shy ? 'mg_pet_hint_shy' : 'mg_pet_hint', { name: a.name }));
  ctx.zone(lo, hi);
  const stopBtn = ctx.stopButton(() => { if (prog >= 0.03) end(); }, stopLabel(t));
  stopBtn.disabled = true;

  const headAt = () => sc.project(sc.live('head').add(v3(0, 0.2, 0)));

  function end() {
    if (ctx.done) return;
    const { verdict: why } = ctx.finishJust(prog, lo, hi, { who: a.name, msgs: justMsgs(t, a.name) });
    const h = headAt();
    if (why === 'just') {
      fx.burst(h.x, h.y, '💕', 6);
      nicker(sc);
      m.nod = 1;
    } else if (why === 'high') fx.float(h.x, h.y - 20, '😮‍💨', 28);
  }

  function stroke(p) {
    const now = ctx.time;
    if (!last) {
      last = p;
      lastT = now;
      return;
    }
    const d = Math.hypot(p.x - last.x, p.y - last.y);
    const dtm = Math.max(0.008, now - lastT);
    last = p;
    lastT = now;
    if (d < 0.5) return;
    speed = lerp(speed, d / dtm, 0.35);
    const hit = sc.pickAnimal(p.x, p.y);
    if (!hit || hit.region === 'leg' || hit.region === 'tail') return;
    touch = hit;
    touchAge = 0;
    if (speed > limit) {
      if (cool <= 0) {
        fast++;
        flinch = 0.5;
        cool = 0.9;
        prog = Math.max(0, prog - (shy ? 0.07 : 0.035));
        fx.text(p.x, p.y - 30, t('mg_gentle_short'), '#c07a10', 22);
        const h = headAt();
        fx.float(h.x, h.y - 10, '❗', 26);
        hint(t('mg_gentle', { name: a.name }), 'warn');
        zoneState = 'low';
        m.annoyed = 0.9;
        m.nod = 0.8;
        sc.shake = 0.25;
      }
      return;
    }
    const spots = spotsNow();
    let nearest = null;
    let nd = Infinity;
    for (const k of Object.keys(QUIRK_SPOTS)) {
      const dd = hit.point.distanceTo(spots[k]);
      if (dd < nd) {
        nd = dd;
        nearest = k;
      }
    }
    const atFav = hit.point.distanceTo(spots[favKey]) < favR && (!qk || nearest === qk.spot);
    prog = Math.min(1, prog + d * 0.0011 * (atFav ? 2.3 : 1));
    if (atFav) favDist += d;
    if (qk && !lipShown && favDist > 120) {
      lipShown = true;
      lip = 1.5;
      const h = headAt();
      fx.text(200, h.y - 40, t('mg_pet_lip', { name: a.name, g: a.sex }), '#d6457a', 16);
      if (ctx.opts) ctx.opts.out = { ...(ctx.opts.out ?? {}), quirk: 'spot' };
    } else if (lipShown && atFav) lip = Math.max(lip, 0.6);
    calmStroke += d;
    heartAcc += d;
    if (heartAcc > 48) {
      heartAcc = 0;
      fx.float(p.x, p.y - 12, prog > hi ? '💤' : atFav ? '💖' : '❤️', atFav ? 26 : 20);
    }
    if (prog <= hi && atFav && ctx.time - lastLove > 1.2 && Math.random() < 0.08) {
      lastLove = ctx.time;
      const h = headAt();
      fx.text(Math.max(70, h.x - 60), h.y - 20, t('mg_loves'), '#d6457a', 18);
    }
    if (atFav) purr = 0.6;
    if (!nickered && prog > 0.25) {
      nickered = true;
      nicker(sc);
    }
    stopBtn.disabled = prog < 0.03;
    ctx.progress(prog);
    if (prog >= 1 && !ctx.done) end();
    else if (prog > hi) {
      if (zoneState !== 'high') {
        zoneState = 'high';
        hint(t('mg_tooMuch', { name: a.name }), 'warn');
      }
    } else if (prog >= lo) {
      if (zoneState !== 'just') {
        zoneState = 'just';
        hint(`✅ ${t('mg_stopHere')}`, 'good');
      }
    } else if (calmStroke > 180) {
      zoneState = 'low';
      hint(t(lip > 0 ? 'mg_pet_lip' : atFav ? 'mg_pet_fav' : 'mg_pet_good', { name: a.name, g: a.sex }), 'good');
    }
  }

  let snortIn = 3;
  return {
    peek: () => ({ fav: favKey, spot: qk?.spot ?? null, lip, prog, value: prog, lo, hi, fast, touching: touchAge < 0.2, region: touch?.region ?? null }),
    key(code, down) { if (down && (code === 'Enter' || code === 'NumpadEnter') && !stopBtn.disabled) end(); },
    down(p) {
      last = p;
      lastT = ctx.time;
      const hit = sc.pickAnimal(p.x, p.y);
      if (hit) {
        touch = hit;
        touchAge = 0;
      }
    },
    move(p, down) { if (down) stroke(p); },
    up() {
      last = null;
      touch = null;
      speed *= 0.5;
    },
    update(dt) {
      // (la tortue et le lièvre, le grand cœur en haut : la scène se cadre dessous)
      if (!ctx.done) sc.setFocus(78 * ctx.view.scale, sc.size.h);
      flinch = Math.max(0, flinch - dt);
      cool = Math.max(0, cool - dt);
      purr = Math.max(0, purr - dt);
      lip = Math.max(0, lip - dt);
      touchAge += dt;
      if (!ctx.pointer.down) speed = Math.max(0, speed - dt * 600);
      const fedUp = prog > hi && !ctx.done;
      // Lui : il nous regarde, oreilles en avant ; détendu quand on le gratte à son coin (tête qui s'abaisse) ;
      // oreilles couchées s'il sursaute ou en a assez (il détourne la tête).
      const happy = (ctx.pointer.down && flinch <= 0 && speed > 20 && !fedUp) || (ctx.done && prog <= hi);
      m.ears = fedUp ? 'back' : 'forward';
      if (fedUp) m.annoyed = Math.max(m.annoyed, 0.3);
      // (il en a assez : il détourne un peu la tête, sans sortir de l'image)
      m.look = fedUp ? sc.marks.muzzle.clone().add(v3(0.3, 0.1, -0.7)) : sc.camera.position;
      m.lookAmt = fedUp ? 0.6 : happy ? 0.55 : 0.4;
      m.nuzzle = lerp(m.nuzzle, (purr > 0 ? 0.9 : happy ? 0.4 : 0) + (lip > 0 ? 0.5 : 0), Math.min(1, dt * 3));
      m.chew = lip > 0 ? 0.8 : Math.max(0, m.chew - dt);
      snortIn -= dt;
      if (snortIn <= 0) {
        snortIn = 3 + Math.random() * 4;
        snort(sc, happy);
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const v = ctx.view;
      const fedUp = prog > hi && !ctx.done;
      if (fedUp) {
        const h = headAt();
        emoji(g, '😑', clamp(h.x + 34, v.x0 + 22, v.x1 - 22), clamp(h.y - 26, v.y0 + 70, v.y1 - 22), 26);
      }
      // Son coin préféré : il scintille si on ne l'a pas encore trouvé (après quelques secondes).
      if (!ctx.done && ctx.time > hintAfter && favDist < 60) {
        const sp = spotsNow()[favKey];
        const c = sc.project(sp);
        const r = sc.projectRadius(sp, favR * 1.6);
        g.save();
        g.globalAlpha = 0.4 + Math.sin(ctx.time * 5) * 0.25;
        g.strokeStyle = '#ff7aa8';
        g.lineWidth = 4;
        g.setLineDash([6, 6]);
        circle(g, c.x, c.y, Math.max(18, r));
        g.stroke();
        g.restore();
        emoji(g, '💡', c.x + Math.max(18, r) * 0.8, c.y - Math.max(18, r) * 0.8, 20);
      }
      // Tortue (doux) / lièvre (trop vite), en haut à gauche ; le grand cœur en haut à droite.
      const gx = v.x0 + 24;
      const gy = v.y0 + 26;
      const gw = 150;
      g.fillStyle = 'rgba(255,255,255,0.88)';
      rrect(g, gx - 10, gy - 16, gw + 60, 32, 16);
      g.fill();
      const k = clamp(speed / (limit * 1.4));
      const okW = gw / 1.4;
      g.fillStyle = '#c9ecd4';
      rrect(g, gx + 18, gy - 6, okW, 12, 6);
      g.fill();
      g.fillStyle = '#f7c9c3';
      rrect(g, gx + 18 + okW, gy - 6, gw - okW, 12, 6);
      g.fill();
      g.fillStyle = k * 1.4 > 1 ? '#e0574a' : '#3fae62';
      circle(g, gx + 18 + gw * k, gy, 9);
      g.fill();
      emoji(g, '🐢', gx + 4, gy, 18);
      emoji(g, '🐇', gx + gw + 34, gy, 18);
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.88)';
      circle(g, v.x1 - 34, v.y0 + 40, 32);
      g.fill();
      g.restore();
      drawHeartGauge(g, v.x1 - 34, v.y0 + 42, HEART.r, prog, lo, hi);
      // La main qui caresse (doigt posé sur lui : une lueur douce sur son poil) ; à la souris, elle montre où on va caresser.
      const pp = ctx.pointer;
      if (pp.down && touch && !ctx.done) {
        const gl = g.createRadialGradient(pp.x, pp.y, 2, pp.x, pp.y, 34);
        gl.addColorStop(0, purr > 0 ? 'rgba(255,170,200,0.55)' : 'rgba(255,240,220,0.45)');
        gl.addColorStop(1, 'rgba(255,240,220,0)');
        g.fillStyle = gl;
        g.beginPath();
        g.arc(pp.x, pp.y, 34, 0, Math.PI * 2);
        g.fill();
      }
      if ((pp.down && touch) || (pp.over && pp.type === 'mouse')) emoji(g, '🤚', pp.x + 6, pp.y - 8, 40, -0.3 + Math.sin(ctx.time * 8) * (pp.down ? 0.08 : 0));
    },
    destroy() {},
  };
}

/** Notre épaule : sous la caméra, un peu à droite. */
export function shoulder(sc) {
  const c = sc.camera;
  const right = v3(1, 0, 0).applyQuaternion(c.quaternion);
  const up = v3(0, 1, 0).applyQuaternion(c.quaternion);
  const fwd = v3(0, 0, -1).applyQuaternion(c.quaternion);
  return c.position.clone().addScaledVector(right, 0.3).addScaledVector(up, -0.45).addScaledVector(fwd, 0.1);
}

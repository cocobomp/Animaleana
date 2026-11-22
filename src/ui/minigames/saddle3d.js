// Seller son cheval, en 3D : les trois étapes et la note du jeu dessiné (seller.js), sur le vrai cheval dans son box,
// avec SON équipement (la selle et le tapis que le jeu va lui mettre : celle qu'il portait la dernière fois, ou une
// libre de la sellerie, dans sa couleur), construit par le jeu lui-même (gearModels.js buildGear) :
//
//   1. le tapis : on le prend sur le porte-selle et on le pose sur son dos, juste derrière le garrot ;
//   2. la selle : on la pose sur le tapis, au même endroit (à côté du tapis : « mets-la sur le tapis ») ;
//   3. la sangle : elle pend sous le ventre ; on la serre en gardant le doigt sur 🪢 (ou sur son ventre, ou Espace).
//      La première fois qu'on lâche, il gonfle le ventre (on voit ses côtes s'arrondir) et la sangle se relâche.
//      Trop serrée, il couche les oreilles, tourne la tête vers la sangle et lève un postérieur.
//
// La règle est celle du jeu dessiné, mot pour mot : la place sur le dos (jauge de la queue à la tête, zone verte
// SADDLE_SPOT juste derrière le garrot), la sangle (GIRTH), la moyenne des trois étapes et le message de la moins bien
// faite. La place sur le dos vient du doigt : on lâche la pièce près de la ligne du dos (projetée à l'écran), elle se
// pose à cet endroit-là, le long de la colonne du modèle.

import * as THREE from 'three';
import { justRule } from './grooming.js';
import { justOutcome } from './score.js';
import { nbsp } from './frame.js';
import { clamp } from './draw.js';
import { SELLER_STAGES, SADDLE_SPOT, GIRTH } from './seller.js';
import { freeSaddle } from '../../sim/gear.js';
import { saddleStand, padClothTexture } from '../../game/care/tackProps.js';
import { nicker, snort } from './feed3d.js';
import { v3, owner, rigidGear, impatience, stagePill, afterLife, smooth, dist2 } from './horse3dKit.js';

const PAUSE = 0.9;

/** La selle et le tapis que le jeu va lui mettre (Game.saddle → saddleUp) : { saddle, pad }. */
export function realSaddleGear(profile, a, home = true) {
  let item = null;
  try {
    item = profile ? freeSaddle(profile, a, { home }) : null;
  } catch {
    item = null;
  }
  item ??= a?.lastSaddle?.item ?? 'saddle';
  const color = a?.lastSaddle?.item === item ? a.lastSaddle.color : undefined;
  const worn = a?.gear?.pad && a.gear.pad.item !== 'vaultPad' ? a.gear.pad : null;
  const pad = worn ?? (a?.lastPad?.item && a.lastPad.item !== 'vaultPad' ? a.lastPad : null);
  return { saddle: { item, color }, pad: pad ? { ...pad } : null };
}

export function saddle3dGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const name = a?.name ?? ctx.name;
  const own = owner();
  const md = sc.model;
  const body = md.body;
  const S = sc.double.scale;
  const L = sc.marks;
  const m = sc.mood;
  m.ears = 'forward';
  const dims = md.dims ?? { L: 1.5, R: 0.35 };
  const zSeat = -dims.L * 0.05; // (là où gearModels.js pose la selle : repère de body)
  const half = dims.L / 2;
  const backY = (z) => (md.backTop ? md.backTop(z) : (md.y0 ?? 1) + dims.R);

  // ---------------------------------------------------------------- son équipement, en pièces
  const real = realSaddleGear(sc.game?.profile, a, sc.game?.isHome ?? true);
  // Ce qu'il porte déjà sur le dos (une couverture, un tapis mis depuis sa fiche) : caché le temps de seller.
  const hidden = [];
  for (const mesh of sc.double.gear?.userData?.meshes ?? []) {
    if (mesh.parent === body && mesh.visible) {
      mesh.visible = false;
      hidden.push(mesh);
    }
  }
  const gear = rigidGear(sc, { saddle: real.saddle, pad: real.pad ?? undefined });
  const nPad = real.pad ? 2 : 1; // (horsePad : le tapis, et son liseré s'il y en a un)
  const meshes = gear.meshes;
  const girth = meshes[meshes.length - 1];
  const padCarrier = new THREE.Group();
  const saddleCarrier = new THREE.Group();
  body.add(padCarrier, saddleCarrier);
  meshes.forEach((mesh, i) => (i < nPad ? padCarrier : saddleCarrier).add(mesh));
  // Le tapis blanc tout simple (pas de tapis à soi) : le même, mais on voit son coton piqué et ses coins arrondis
  // (sans cela, une feuille blanche toute plate sur son dos).
  if (!real.pad && meshes[0]?.isMesh) {
    const cloth = own(meshes[0].material.clone());
    cloth.map = own(padClothTexture());
    cloth.alphaTest = 0.5;
    cloth.color.set(0xffffff);
    cloth.roughness = 0.95;
    cloth.userData = {};
    meshes[0].material = cloth;
  }
  for (const c of [padCarrier, saddleCarrier]) c.traverse((o) => { if (o.isMesh) o.userData.pickPart = c; });
  sc.pickable(padCarrier, 'pad');
  sc.pickable(saddleCarrier, 'saddle');
  // La sangle : un tour sous le ventre ; lâche, elle pend (agrandie vers le bas autour de son point haut).
  const zG = dims.zGirth ?? zSeat + dims.L * 0.13;
  const girthC = v3(0, (md.y0 ?? 1) - dims.R * 0.2, zG);
  girth.visible = false;

  // ---------------------------------------------------------------- le porte-selle, dans la paille devant lui
  const stand = saddleStand(own, { h: 0.84 });
  sc.scene.add(stand.group);
  /**
   * Le porte-selle se pose près de nous, en bas à gauche de l'image (comme le plateau du jeu dessiné), entre nous et le
   * cheval : à mi-chemin de son dos, sous ce point de l'écran ; sa hauteur va jusqu'à la paille.
   */
  function placeStand() {
    sc.updateCamera(0);
    const v = ctx.view;
    // (le pied du porte-selle : la paille sous le bas gauche de l'image, assez loin de nous, pas sous le cheval)
    let base = sc.pointOnPlane(v.x0 + 78, v.y1 - 30, 0) ?? v3(L.croup.x, 0, sc.holder.position.z + 1.2);
    const minZ = sc.holder.position.z + 0.75 * S + 0.25;
    if (base.z < minZ) base = sc.pointOnPlane(v.x0 + 78, v.y1 - 30, 0)?.setZ(minZ) ?? base.setZ(minZ);
    const cam = sc.camera.position;
    const far = Math.hypot(base.x - cam.x, base.z - cam.z);
    if (far < 0.9) base.lerp(v3(L.croup.x, 0, minZ), 0.5);
    stand.group.position.set(base.x, 0.02, base.z);
    stand.group.rotation.y = -0.25;
    stand.group.scale.setScalar(clamp(0.85 + 0.15 * S, 0.8, 1));
    stand.group.updateMatrixWorld(true);
  }
  const seatLocal = v3(0, backY(zSeat) + 0.02, zSeat); // (le creux du siège, repère de body)
  const tmpQ = new THREE.Quaternion();
  const tmpS = new THREE.Vector3();
  const tmpP = new THREE.Vector3();
  /** Transformation monde de body (la pièce garde son orientation et son échelle sur le cheval). */
  function bodyFrame() {
    body.updateWorldMatrix(true, false);
    body.matrixWorld.decompose(tmpP, tmpQ, tmpS);
    return { q: tmpQ.clone(), s: tmpS.clone() };
  }
  /** Où va une pièce posée sur le porte-selle (monde) : le creux du siège sur la barre. */
  function onStand(key) {
    const f = bodyFrame();
    const at = stand.group.localToWorld(key === 'saddle' ? stand.top.clone() : stand.low.clone().add(v3(0, 0.02, 0)));
    const off = seatLocal.clone().multiply(f.s).applyQuaternion(f.q);
    return { pos: at.sub(off), q: f.q, s: f.s };
  }
  /** Où va une pièce posée sur le dos à la place u (repère de body) : glissée le long du dos, penchée comme lui. */
  const zOf = (u) => zSeat + (u - (SADDLE_SPOT.lo + SADDLE_SPOT.hi) / 2) * half;
  function onBack(u) {
    const z = zOf(u);
    const dy = backY(z) - backY(zSeat);
    const slope = (backY(z + 0.05) - backY(z - 0.05)) / 0.1 - (backY(zSeat + 0.05) - backY(zSeat - 0.05)) / 0.1;
    return { pos: v3(0, dy, z - zSeat), rotX: -Math.atan(slope) };
  }

  // ---------------------------------------------------------------- la ligne du dos (pour le doigt)
  const backSamples = [];
  for (let u = -0.8; u <= 0.9001; u += 0.05) backSamples.push({ u, local: v3(0, backY(zOf(u)) + 0.03, zOf(u)) });
  function nearestBack(p) {
    let best = null;
    for (const b of backSamples) {
      const q = sc.project(body.localToWorld(b.local.clone()));
      const d = dist2(q, p);
      if (!best || d < best.d) best = { d, u: b.u, q };
    }
    return best;
  }

  // ---------------------------------------------------------------- état (la logique du jeu dessiné)
  const items = { pad: { placed: false, u: 0, carrier: padCarrier }, saddle: { placed: false, u: 0, carrier: saddleCarrier } };
  const tween = new Map(); // carrier → { from, to, k, parent }
  let drag = null; // { key, off }
  let tension = 0;
  let tightening = false;
  let bloat = { done: false, at: -1 };
  let bloatK = 0;
  let annoyed = 0;
  let si = 0;
  let pause = 0;
  let rule = null;
  let lastZone = null;
  const results = [];
  const stage = () => SELLER_STAGES[si];
  const gaugeOf = (u) => (u + 1) / 2;
  const onPad = () => items.pad.placed && Math.abs(items.saddle.u - items.pad.u) < 0.15;
  function value() {
    const st = stage();
    if (st === 'girth') return tension;
    const it = items[st];
    if (!it.placed) return 0;
    if (st === 'saddle' && !onPad()) return 0;
    return gaugeOf(it.u);
  }
  const zoneOf = (st) => (st === 'girth' ? { lo: GIRTH.lo, hi: GIRTH.hi, max: GIRTH.max } : { lo: gaugeOf(SADDLE_SPOT.lo), hi: gaugeOf(SADDLE_SPOT.hi), max: 1 });

  const stopBtn = ctx.stopButton(() => endStage());
  let holdBtn = null;
  const setStopLabel = () => {
    const text = `✅ ${si < SELLER_STAGES.length - 1 ? t('mg_pansage_next') : t('mg_stopHere')}`;
    if (stopBtn && 'textContent' in stopBtn) stopBtn.textContent = nbsp(text);
    else if (stopBtn) stopBtn.text = text;
  };
  const busy = impatience(sc, { after: 10 });

  function startStage(i) {
    si = i;
    lastZone = null;
    const st = stage();
    const z = zoneOf(st);
    rule = justRule(ctx, { lo: z.lo, hi: z.hi, max: z.max, slack: st === 'girth' ? 0.2 : 0.12 });
    if (st === 'girth' && !holdBtn) {
      holdBtn = ctx.button(`🪢 ${t('mg_seller_tighten')}`, { cls: 'primary', hold: true, onDown: () => { tightening = true; }, onUp: () => release() });
    }
    // (la sangle pend sous la selle posée ; sans selle, rien à sangler — le jeu dessiné ne la montrait pas non plus)
    if (st === 'girth') girth.visible = items.saddle.placed;
    if (st === 'girth' && items.pad.placed && items.saddle.placed) stand.group.visible = false;
    ctx.hint(t(`mg_seller_${st}_hint`, { name }));
    ctx.progress(value() / z.max);
    setStopLabel();
    frameFor(st);
    busy.poke();
  }

  function endStage() {
    if (ctx.done || pause > 0 || !rule) return;
    tightening = false;
    const st = stage();
    const v = value();
    const res = justOutcome(v, rule.lo, rule.hi, { slack: st === 'girth' ? 0.2 : 0.12 });
    const offPad = st === 'saddle' && items.saddle.placed && !onPad();
    results.push({ stage: st, value: v, lo: rule.lo, hi: rule.hi, q: res.q, verdict: res.verdict, offPad });
    if (si >= SELLER_STAGES.length - 1) return finishAll();
    fx.text(200, 120, `✓ ${t(`mg_seller_stage_${st}`)}`, '#2f8a5f', 26);
    pause = PAUSE;
  }

  function finishAll() {
    const q = results.reduce((n, r) => n + r.q, 0) / results.length;
    const worst = results.reduce((w, r) => (r.q < w.q ? r : w), results[0]);
    const just = results.every((r) => r.verdict === 'just');
    const why = just ? 'just' : worst.verdict;
    const p = { name, g: a?.sex };
    let msg;
    if (just) msg = t('mg_seller_just', p);
    else if (worst.offPad) msg = t('mg_seller_offPad', p);
    else if (worst.stage === 'girth' || worst.value > 0) msg = t(`mg_seller_${worst.verdict}_${worst.stage}`, p);
    else msg = t(`mg_seller_missing_${worst.stage}`, p);
    ctx.finish(q, msg, why);
    if (just) {
      nicker(sc);
      m.nod = 1;
    }
  }

  function placeHint() {
    const st = stage();
    if (st === 'girth') return;
    const it = items[st];
    if (!it.placed) return;
    if (st === 'saddle' && !onPad()) {
      ctx.hint(t('mg_seller_onPad'), 'warn');
      lastZone = 'offPad';
      return;
    }
    const v = value();
    const z = v < rule.lo ? 'back' : v > rule.hi ? 'forward' : 'just';
    ctx.progress(v);
    if (z === lastZone) return;
    lastZone = z;
    if (z === 'just') ctx.hint(t('mg_pressStop'), 'good');
    else ctx.hint(t(`mg_seller_${z}`), 'warn');
  }

  function release() {
    if (!tightening) return;
    tightening = false;
    if (!bloat.done && tension >= GIRTH.bloatAt && bloat.at < 0) bloat.at = ctx.time + 1.2;
  }

  // ---------------------------------------------------------------- déplacer les pièces
  /** Pose la pièce (carrier) sur le porte-selle, d'un coup ou en glissant. */
  function toStand(key, now = false) {
    const c = items[key].carrier;
    const goal = onStand(key);
    if (c.parent !== sc.scene) sc.scene.attach(c);
    if (now) {
      c.position.copy(goal.pos);
      c.quaternion.copy(goal.q);
      c.scale.copy(goal.s);
      tween.delete(c);
    } else tween.set(c, { space: 'world', from: { p: c.position.clone(), q: c.quaternion.clone() }, to: goal, k: 0 });
  }
  /** Pose la pièce sur le dos à la place u (elle glisse jusque-là). */
  function toBack(key, u) {
    const c = items[key].carrier;
    body.attach(c);
    const goal = onBack(u);
    const qGoal = new THREE.Quaternion().setFromEuler(new THREE.Euler(goal.rotX, 0, 0));
    tween.set(c, { space: 'body', from: { p: c.position.clone(), q: c.quaternion.clone(), s: c.scale.clone() }, to: { pos: goal.pos, q: qGoal, s: v3(1, 1, 1) }, k: 0 });
  }
  function stepTweens(dt) {
    for (const [c, tw] of tween) {
      tw.k = Math.min(1, tw.k + dt / 0.28);
      const k = smooth(tw.k);
      c.position.lerpVectors(tw.from.p, tw.to.pos, k);
      c.quaternion.slerpQuaternions(tw.from.q, tw.to.q, k);
      if (tw.from.s) c.scale.lerpVectors(tw.from.s, tw.to.s, k);
      if (tw.k >= 1) tween.delete(c);
    }
  }

  /** Le point 3D sous le doigt, à la profondeur de son dos (un plan face à la caméra). */
  function grabPoint(p) {
    const ray = sc.rayAt(p.x, p.y);
    const n = sc.camera.getWorldDirection(v3());
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, body.localToWorld(seatLocal.clone()).add(v3(0, 0, 0.25 * S)));
    return ray.intersectPlane(plane, v3()) ?? sc.pointAtDepth(p.x, p.y, 2.5);
  }
  /** Où est la pièce à l'écran (le creux du siège ; le tapis : son milieu). */
  const screenOf = (key) => sc.project(items[key].carrier.localToWorld(seatLocal.clone()));

  // ---------------------------------------------------------------- caméra
  function frameFor(st, now = false) {
    if (st === 'girth') {
      // (le ventre et la sangle, les antérieurs, et sa tête : on le voit se retourner quand c'est trop serré)
      const gb = body.localToWorld(girthC.clone().add(v3(0, -dims.R * 1.25, 0)));
      sc.frame([L.withers, L.back, L.belly, L.chest, gb, L.poll, L.muzzle, L.hooves[0], L.hooves[1], L.croup], { dir: [0.32, 0.02, 1], pad: 1.06, now });
    } else {
      sc.frame([L.withers, L.croup, L.tail, L.tail.clone().add(v3(-0.12 * S, 0, 0)), L.back, L.belly, L.chest, L.muzzle, L.poll, ...L.ears, ...L.hooves], { dir: [0.3, 0.72, 1], pad: 1.1, now });
    }
  }

  // ---------------------------------------------------------------- l'animal : ventre gonflé, réactions
  const ribs0 = new THREE.Vector3();
  const unhook = afterLife(sc, () => {
    if (md.ribs && bloatK > 0.001) {
      ribs0.copy(md.ribs.scale);
      md.ribs.scale.set(ribs0.x * (1 + 0.07 * bloatK), ribs0.y * (1 + 0.05 * bloatK), ribs0.z);
    }
  });
  let lookAt = null;
  let lookFor = 0;
  function react(at, ears = 'back') {
    lookAt = at.clone();
    lookFor = 1.6;
    m.ears = ears;
    m.nod = Math.max(m.nod, 0.5);
  }

  // (le porte-selle se place quand la toile a sa taille, puis à chaque changement de forme : écran tourné)
  let standFor = '';
  function keepStand() {
    const key = `${sc.size.w}x${sc.size.h}`;
    if (key === standFor || sc.size.w < 2) return;
    standFor = key;
    if (stage() !== 'girth') frameFor(stage(), true);
    placeStand();
    for (const k of ['pad', 'saddle']) if (!items[k].placed && drag?.key !== k) toStand(k, true);
  }
  startStage(0);
  keepStand();

  return {
    peek: () => {
      const spotU = (SADDLE_SPOT.lo + SADDLE_SPOT.hi) / 2;
      const spot = sc.project(body.localToWorld(v3(0, backY(zOf(spotU)) + 0.03, zOf(spotU))));
      const fwd = sc.project(body.localToWorld(v3(0, backY(zOf(0.75)) + 0.03, zOf(0.75))));
      const back = sc.project(body.localToWorld(v3(0, backY(zOf(-0.45)) + 0.03, zOf(-0.45))));
      const st = stage();
      return {
        stage: st, si, value: value(), lo: rule.lo, hi: rule.hi, pause, tension, tightening, bloated: bloat.done,
        results: results.map((r) => ({ ...r })),
        items: Object.fromEntries(Object.entries(items).map(([k, it]) => [k, { placed: it.placed, u: it.u }])),
        spot, forward: fwd, back,
        tray: st !== 'girth' ? screenOf(st === 'pad' ? 'pad' : 'saddle') : null,
        belly: sc.project(body.localToWorld(girthC.clone().add(v3(0, -dims.R, 0.15)))),
        girthScale: girth.scale.y,
      };
    },
    down(p) {
      if (ctx.done || pause > 0) return;
      busy.poke();
      const st = stage();
      if (st === 'girth') {
        const b = sc.project(body.localToWorld(girthC.clone().add(v3(0, -dims.R, 0.15))));
        if (dist2(b, p) < 60 || sc.pickAnimal(p.x, p.y)?.region === 'body') tightening = true;
        return;
      }
      const it = items[st];
      const hit = sc.pickProp(p.x, p.y);
      const q = screenOf(st);
      if (hit?.name === st || dist2(q, p) < 58) {
        if (it.carrier.parent !== sc.scene) sc.scene.attach(it.carrier);
        tween.delete(it.carrier);
        const at = grabPoint(p);
        drag = { key: st, off: v3() }; // (la pièce vient sous le doigt)
        it.placed = false;
        ctx.progress(0);
      }
    },
    move(p) {
      if (!drag) return;
      const it = items[drag.key];
      const at = grabPoint(p).add(drag.off);
      const f = bodyFrame();
      const off = seatLocal.clone().multiply(f.s).applyQuaternion(f.q);
      it.carrier.quaternion.copy(f.q);
      it.carrier.scale.copy(f.s);
      it.carrier.position.copy(at).sub(off).add(v3(0, 0.04, 0));
      // (près du dos : elle se penche déjà comme lui, l'aimant)
      const nb = nearestBack(sc.project(at));
      drag.near = nb && nb.d < 55 ? nb : null;
      if (drag.near) m.look = it.carrier.position.clone();
    },
    up() {
      if (stage() === 'girth') return release();
      if (!drag) return;
      const key = drag.key;
      const it = items[key];
      const nb = nearestBack(screenOf(key));
      drag = null;
      if (nb && nb.d < 55) {
        it.placed = true;
        it.u = clamp(nb.u, -0.8, 0.9);
        toBack(key, it.u);
        fx.burst(nb.q.x, nb.q.y - 10, '✨', 2, { speed: 60, size: 14 });
        react(body.localToWorld(seatLocal.clone()), key === 'pad' ? 'forward' : 'back');
        if (key === 'saddle') setTimeout(() => snort(sc, false), 400);
        placeHint();
      } else {
        toStand(key);
        it.placed = false;
        ctx.progress(0);
        lastZone = null;
      }
    },
    key(code, isDown) {
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (isDown) endStage();
        return;
      }
      if (code === 'Space' && stage() === 'girth' && pause <= 0) {
        if (isDown) tightening = true;
        else release();
      }
    },
    update(dt) {
      keepStand();
      annoyed = Math.max(0, annoyed - dt);
      stepTweens(dt);
      bloatK = Math.max(0, bloatK - dt * 0.5);
      // la vie : il regarde ce qu'on lui pose, puis se détend ; impatient si on traîne
      lookFor = Math.max(0, lookFor - dt);
      const st = stage();
      if (lookFor > 0 && lookAt) {
        m.look = lookAt;
        m.lookAmt = 0.9;
      } else if (!drag) {
        m.lookAmt = Math.max(0, m.lookAmt - dt * 0.8);
        if (m.ears === 'back' && annoyed <= 0 && !(st === 'girth' && tension > 0.95)) m.ears = 'forward';
      }
      const fidget = busy.update(dt, !!drag || tightening || pause > 0 || ctx.done);
      if (!fidget && !(st === 'girth' && tension > 0.95)) m.lift = null;
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) {
          pause = 0;
          startStage(si + 1);
        }
        return;
      }
      // la sangle : elle pend quand elle est lâche, colle au ventre quand elle est serrée
      const loose = Math.max(0, 0.78 - tension) / 0.78;
      const sx = 1 + 0.06 * loose - (tension > 0.95 ? 0.012 : 0);
      const sy = 1 + 0.2 * loose - (tension > 0.95 ? 0.02 : 0);
      girth.scale.set(sx, sy, 1);
      // (agrandie autour de son point haut, sous le quartier : le bas descend)
      const top = girthC.clone().add(v3(0, dims.R * 0.55, 0));
      girth.position.set(top.x * (1 - sx), top.y * (1 - sy), 0);
      if (ctx.done || st !== 'girth') return;
      if (tightening) {
        tension = Math.min(GIRTH.max, tension + GIRTH.rate * dt);
        if (tension > 0.95) {
          if (annoyed <= 0) {
            const h = sc.project(sc.live('head'));
            fx.float(h.x, h.y - 30, '💢', 20);
            snort(sc);
          }
          annoyed = 0.6;
        }
      }
      if (tension > 0.95) {
        // trop serrée : oreilles couchées, il tourne la tête vers la sangle, lève un postérieur
        m.ears = 'back';
        m.annoyed = Math.max(m.annoyed, 0.3);
        m.look = body.localToWorld(girthC.clone().add(v3(0, -dims.R, 0.4)));
        m.lookAmt = 1;
        m.lift = 3;
        m.liftMax = 0.28;
      } else if (m.lift === 3) m.lift = null;
      if (bloat.at > 0 && ctx.time >= bloat.at) {
        bloat = { done: true, at: -1 };
        tension = Math.max(0, tension - GIRTH.bloat);
        bloatK = 1;
        const b = sc.project(body.localToWorld(girthC.clone().add(v3(0, -dims.R, 0.2))));
        fx.text(b.x, b.y + 10, '💨', '#3c7bd9', 22);
        ctx.hint(t('mg_seller_bloat', { name }), 'warn');
        snort(sc);
      }
      rule.show(tension);
    },
    draw(g) {
      if (!sc.ready) return;
      const st = stage();
      // Là où va la pièce (tant qu'elle n'est pas posée) : un contour pointillé derrière le garrot, sur son dos.
      if (!ctx.done && pause <= 0 && st !== 'girth' && !items[st].placed) {
        const spotU = (SADDLE_SPOT.lo + SADDLE_SPOT.hi) / 2;
        const c = sc.project(body.localToWorld(v3(0, backY(zOf(spotU)) + 0.03, zOf(spotU))));
        const a0 = sc.project(body.localToWorld(v3(0, backY(zOf(spotU - 0.3)) + 0.03, zOf(spotU - 0.3))));
        const a1 = sc.project(body.localToWorld(v3(0, backY(zOf(spotU + 0.3)) + 0.03, zOf(spotU + 0.3))));
        const w = dist2(a0, a1);
        const ang = Math.atan2(a1.y - a0.y, a1.x - a0.x);
        g.save();
        g.globalAlpha = 0.55 + Math.sin(ctx.time * 3) * 0.2;
        g.setLineDash([6, 5]);
        g.strokeStyle = '#ffffff';
        g.lineWidth = 3;
        g.translate(c.x, c.y);
        g.rotate(ang);
        g.beginPath();
        g.roundRect(-w / 2, -6, w, w * 0.55, 8);
        g.stroke();
        g.restore();
      }
      if (st === 'girth' && rule && pause <= 0) rule.dial(g, tension, 354, ctx.view.y0 + 56);
      stagePill(g, si, SELLER_STAGES.length, t(`mg_seller_stage_${st}`), Math.max(8, ctx.view.y0 + 8));
    },
    destroy() {
      unhook();
      if (md.ribs) md.ribs.scale.set(1, 1, 1);
      for (const c of [padCarrier, saddleCarrier]) c.parent?.remove(c);
      gear.dispose();
      for (const mesh of hidden) mesh.visible = true;
      sc.scene.remove(stand.group);
      sc.pickables = sc.pickables.filter((o) => o !== padCarrier && o !== saddleCarrier);
      own.free();
    },
  };
}

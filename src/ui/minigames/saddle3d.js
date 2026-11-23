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
import { STALL } from '../../game/care/stall.js';
import { nicker, snort } from './feed3d.js';
import { v3, owner, rigidGear, impatience, stagePill, afterLife, smooth, dist2 } from './horse3dKit.js';

const PAUSE = 0.9;
const STALL_FRONT = STALL.front;

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
  // (le seau du box n'a rien à faire ici : chez un petit poney, il cachait les antérieurs au premier plan)
  const bucket = sc.decor.props?.bucket?.group ?? null;
  const bucketWas = bucket?.visible ?? false;
  if (bucket) bucket.visible = false;
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
  let padMat0 = null; // (la matière du jeu, remise avant de rendre l'équipement : removeGear la libère comme d'habitude)
  if (!real.pad && meshes[0]?.isMesh) {
    padMat0 = meshes[0].material;
    const cloth = own(meshes[0].material.clone());
    cloth.map = own(padClothTexture());
    cloth.alphaTest = 0.5;
    cloth.color.set(0xffffff);
    cloth.roughness = 0.95;
    cloth.userData = {};
    meshes[0].material = cloth;
  }
  sc.pickable(padCarrier, 'pad');
  sc.pickable(saddleCarrier, 'saddle');
  // La sangle : un tour sous le ventre ; lâche, elle pend (agrandie vers le bas autour de son point haut).
  const zG = dims.zGirth ?? zSeat + dims.L * 0.13;
  const girthC = v3(0, (md.y0 ?? 1) - dims.R * 0.2, zG);
  girth.visible = false;
  // La sangle de la scène : celle du jeu est rigide ici (sans skinGear) et flottait sur le flanc, devant le quartier.
  // On la refait sur la peau du cheval (rayons sur la copie figée de sa pose) : elle sort de sous le quartier, côté
  // avant-bas, avec ses deux boucles, descend en biais jusqu'au passage de sangle derrière le coude, passe sous le
  // ventre et remonte de l'autre côté. Lâche, elle pend sous le ventre ; serrée, elle le touche.
  const girthSet = girthOnSkin(sc, { body, girthMat: girth.material, carrier: saddleCarrier, skip: new Set([girth, ...meshes.slice(0, nPad)]), zG, R: dims.R, y0: md.y0 ?? 1, wide: real.saddle.item === 'saddleWestern', own });
  body.add(girthSet.group);
  girthSet.group.visible = false;

  // ---------------------------------------------------------------- le porte-selle, dans la paille devant lui
  const stand = saddleStand(own, { h: 0.84 });
  sc.scene.add(stand.group);
  /** Le porte-selle (le plateau du jeu dessiné) : dans la paille devant lui, du côté de la croupe, entre lui et nous. */
  function placeStand() {
    // (devant lui, du côté de la croupe, entre lui et nous ; la caméra le cadre avec le cheval : voir frameFor)
    const k = clamp(0.85 + 0.15 * S, 0.8, 1);
    stand.group.scale.setScalar(k);
    const z = Math.min(STALL_FRONT - 0.35, sc.holder.position.z + 0.45 * S + 0.75);
    stand.group.position.set(L.croup.x - 0.05 * S, 0.02, z);
    stand.group.rotation.y = -0.25;
    stand.group.updateMatrixWorld(true);
  }
  placeStand();
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
    if (st === 'girth' && items.saddle.placed) {
      girthSet.measure();
      girthSet.group.visible = true;
    }
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

  /** Les 8 coins (monde) de ce que contient un porteur. */
  const box3 = new THREE.Box3();
  function boxCorners(obj) {
    obj.updateWorldMatrix(true, true);
    box3.setFromObject(obj);
    if (box3.isEmpty()) return [];
    const out = [];
    for (let i = 0; i < 8; i++) out.push(v3(i & 1 ? box3.max.x : box3.min.x, i & 2 ? box3.max.y : box3.min.y, i & 4 ? box3.max.z : box3.min.z));
    return out;
  }
  /** Le rectangle (espace du cadre) d'une pièce à l'écran. */
  function screenBox(obj) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const c of boxCorners(obj)) {
      const q = sc.project(c);
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
    return { x0, y0, x1, y1 };
  }

  // ---------------------------------------------------------------- caméra
  function frameFor(st, now = false) {
    if (st === 'girth') {
      // (le ventre et la sangle, les antérieurs, toute la croupe et sa tête avec de la marge devant le nez — au repos,
      // il tend l'encolure ; la tête telle qu'elle est quand il se retourne vers la sangle)
      const gb = body.localToWorld(girthC.clone().add(v3(0, -dims.R * 1.25, 0)));
      const mz = sc.live('muzzle') ?? L.muzzle;
      sc.frame([L.withers, L.back, L.belly, L.chest, gb, L.poll, sc.live('poll'), L.muzzle, mz, L.muzzle.clone().add(v3(0.2 * S, 0, 0)), L.hooves[0], L.hooves[1], L.croup, L.tail, ...L.hooves], { dir: [0.32, 0.02, 1], pad: 1.15, now });
    } else {
      // (de la queue au bout du nez, avec de la marge : au repos, il tend parfois l'encolure ; et les pièces encore sur
      // le porte-selle, en entier — avant, le tapis qui pend était à moitié coupé par le bord gauche)
      const st0 = stand.group.localToWorld(stand.top.clone().add(v3(0, 0.15, 0)));
      const st1 = stand.group.localToWorld(stand.low.clone().add(v3(0, -0.25, 0.05)));
      const onStandPts = [];
      for (const k of ['pad', 'saddle']) if (!items[k].placed) onStandPts.push(...boxCorners(items[k].carrier));
      sc.frame([L.withers, L.croup, L.tail, L.tail.clone().add(v3(-0.15 * S, 0, 0)), L.back, L.belly, L.chest, L.muzzle, L.muzzle.clone().add(v3(0.18 * S, -0.1 * S, 0)), L.poll, ...L.ears, ...L.hooves, st0, st1, ...onStandPts], { dir: [0.3, 0.72, 1], pad: 1.1, now });
    }
  }

  // ---------------------------------------------------------------- l'animal : ventre gonflé, réactions
  const ribs0 = new THREE.Vector3();
  // trop serrée : il se retourne vers la sangle, l'encolure et la tête bien tournées vers le flanc (jusqu'à ≈ 0,8 rad
  // en tout ; la vie de la scène seule ne le tournait presque pas)
  let turnK = 0;
  let turnFramed = false;
  const _tq = new THREE.Quaternion();
  const UP = v3(0, 1, 0);
  const unhook = afterLife(sc, (dt) => {
    turnK += ((stage() === 'girth' && tension > 0.95 ? 1 : 0) - turnK) * Math.min(1, (dt ?? 0.016) * 3);
    if (turnK > 0.01 && md.neck && md.head) {
      // (du côté de la sangle qu'on voit : le même sens que là où il regarde)
      const side = Math.sign(sc.yaw || 1);
      // (l'encolure en tout ≈ 0,8 rad : ce que la vie lui donne déjà, plus le reste ; la tête un peu plus)
      const extra = Math.max(0, 0.8 - Math.abs((sc.yaw ?? 0) * 0.7));
      md.neck.quaternion.premultiply(_tq.setFromAxisAngle(UP, side * extra * smooth(turnK)));
      md.head.quaternion.premultiply(_tq.setFromAxisAngle(UP, side * 0.18 * smooth(turnK)));
    }
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
    for (const k of ['pad', 'saddle']) if (!items[k].placed && drag?.key !== k) toStand(k, true);
    if (stage() !== 'girth') frameFor(stage(), true);
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
        trayBox: st !== 'girth' ? screenBox(items[st].carrier) : null,
        belly: sc.project(body.localToWorld(girthC.clone().add(v3(0, -dims.R, 0.15)))),
        girthSag: girthSet.sag,
        girthShown: girthSet.group.visible,
        /** (tests) la sangle : son bout de notre côté (sous le quartier), son point le plus bas, dans le repère du corps */
        girthEnds: girthSet.ends,
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
      // la sangle : elle pend quand elle est lâche, colle au ventre quand elle est serrée (gonflé : un peu plus loin)
      const loose = Math.max(0, 0.78 - tension) / 0.78;
      if (girthSet.group.visible) girthSet.setSag(dims.R * 0.24 * loose + 0.012 * bloatK - (tension > 0.95 ? 0.003 : 0));
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
      // (il s'est retourné : la caméra garde sa tête dans l'image)
      if (tension > 0.95 && turnK > 0.6 && !turnFramed) {
        turnFramed = true;
        frameFor('girth');
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
      // La pièce à prendre, sur le porte-selle : un cadre bleu qui pulse autour d'elle (comme le jeu dessiné)
      if (!ctx.done && pause <= 0 && st !== 'girth' && !items[st].placed && drag?.key !== st && !tween.has(items[st].carrier)) {
        const b = screenBox(items[st].carrier);
        const k = 0.5 + 0.5 * Math.sin(ctx.time * 4);
        const m2 = 6 + 3 * k;
        g.save();
        g.lineWidth = 4;
        g.strokeStyle = `rgba(60, 123, 217, ${0.65 + 0.3 * k})`;
        g.shadowColor = 'rgba(255,255,255,0.9)';
        g.shadowBlur = 6;
        g.beginPath();
        g.roundRect(b.x0 - m2, b.y0 - m2, b.x1 - b.x0 + 2 * m2, b.y1 - b.y0 + 2 * m2, 12);
        g.stroke();
        g.restore();
      }
      if (st === 'girth' && rule && pause <= 0) rule.dial(g, tension, 354, ctx.view.y0 + 56);
      stagePill(g, si, SELLER_STAGES.length, t(`mg_seller_stage_${st}`), ctx.view.y0 + 10);
    },
    destroy() {
      unhook();
      if (bucket) bucket.visible = bucketWas;
      if (md.ribs) md.ribs.scale.set(1, 1, 1);
      for (const c of [padCarrier, saddleCarrier]) c.parent?.remove(c);
      body.remove(girthSet.group);
      girthSet.dispose();
      if (padMat0) meshes[0].material = padMat0;
      gear.dispose();
      for (const mesh of hidden) mesh.visible = true;
      sc.scene.remove(stand.group);
      sc.pickables = sc.pickables.filter((o) => o !== padCarrier && o !== saddleCarrier);
      own.free();
    },
  };
}

/**
 * La sangle posée sur la peau, côté nous et de l'autre côté. Elle part de sous le quartier (le coin avant-bas, mesuré
 * sur les pièces de la selle telles qu'elles sont posées), descend en biais jusqu'au passage de sangle (zG), passe sous
 * le ventre et remonte symétriquement. Deux boucles en acier de chaque côté, juste sous le bord du quartier.
 * measure() : prend les mesures (la selle posée) ; setSag(m) : lâche, la sangle s'écarte du ventre (surtout dessous).
 */
function girthOnSkin(sc, { body, girthMat, carrier, skip, zG, R, y0, wide, own }) {
  const group = new THREE.Group();
  const strapMesh = new THREE.Mesh(new THREE.BufferGeometry(), girthMat);
  strapMesh.castShadow = true;
  strapMesh.receiveShadow = true;
  group.add(strapMesh);
  const steel = own(new THREE.MeshStandardMaterial({ color: 0xc9ccd1, roughness: 0.28, metalness: 0.85 }));
  const buckleGeo = own(new THREE.TorusGeometry(0.02, 0.0038, 6, 4));
  const buckles = [];
  for (let i = 0; i < 4; i++) {
    const b = new THREE.Mesh(buckleGeo, steel);
    b.castShadow = true;
    buckles.push(b);
    group.add(b);
  }
  const W = wide ? 0.072 : 0.052; // (largeur de la sangle)
  const TH = 0.007;
  const cy = y0 - R * 0.2; // (l'axe du tronc, comme gearModels.js)
  let samples = null; // [{ p (peau), n (vers dehors), t (0 en haut côté nous … 1 dessous … 2 en haut de l'autre côté) }]
  let sagNow = -1;
  const api = { group, sag: 0, ends: null };

  /** Le coin avant-bas du quartier de notre côté (repère du corps), et le côté (x) où est la caméra. */
  function flapCorner() {
    body.updateWorldMatrix(true, true);
    const cam = body.worldToLocal(sc.camera.position.clone());
    const side = cam.x < 0 ? -1 : 1;
    const inv = new THREE.Matrix4().copy(body.matrixWorld).invert();
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    let yMin = Infinity;
    const pts = [];
    carrier.traverse((o) => {
      // (les plaques de cuir de la selle seulement : pas les étriers — des groupes, ou des anneaux —, pas les petites
      // pièces rondes, pas la sangle du jeu)
      if (!o.isMesh || skip.has(o) || o.parent !== carrier) return;
      if (/Torus|Cylinder|Sphere/.test(o.geometry?.type ?? '')) return;
      const pos = o.geometry?.attributes?.position;
      if (!pos) return;
      m.multiplyMatrices(inv, o.matrixWorld);
      for (let i = 0; i < pos.count; i += 2) {
        p.fromBufferAttribute(pos, i).applyMatrix4(m);
        if (p.x * side < R * 0.55) continue; // (seulement le flanc de notre côté)
        pts.push(p.clone());
        yMin = Math.min(yMin, p.y);
      }
    });
    if (!pts.length) return { side, corner: v3(side * R * 0.9, cy, zG - 0.12) };
    // (le bas du quartier, puis ce qu'il y a de plus en avant dans ce bas)
    let best = null;
    for (const q of pts) if (q.y < yMin + 0.1 && (!best || q.z > best.z)) best = q;
    return { side, corner: best };
  }

  api.measure = () => {
    if (samples) return;
    const { side, corner } = flapCorner();
    // (le départ : sous le quartier, un peu en arrière et au-dessus de son coin)
    const E = corner.clone().add(v3(0, 0.035, -0.05));
    const aE = Math.atan2(side * E.x, E.y - cy); // (angle depuis le haut, autour de l'axe du tronc)
    sc.proxy.bake();
    const q = new THREE.Quaternion();
    body.getWorldQuaternion(q);
    const dC = 1.2 * body.getWorldScale(v3()).x; // (distance du départ du rayon à l'axe du tronc, en mètres du monde)
    const N = 26;
    samples = [];
    for (let i = 0; i <= N; i++) {
      const t = (i / N) * 2; // 0 … 2
      const half = t <= 1 ? t : 2 - t;
      const sd = t <= 1 ? side : -side;
      const a = aE + (Math.PI - aE) * half;
      const z = E.z + (zG - E.z) * smooth(Math.min(1, half / 0.75));
      const dir = v3(sd * Math.sin(a), Math.cos(a), 0);
      const c = v3(0, cy, z);
      const from = body.localToWorld(c.clone().addScaledVector(dir, 1.2));
      const wdir = dir.clone().negate().applyQuaternion(q).normalize();
      const hits = sc.proxy.hitAll(new THREE.Ray(from, wdir)).filter((h) => h.distance < dC * 0.97);
      const h = hits.length ? hits[hits.length - 1] : null; // (l'entrée dans le tronc, pas un coude devant)
      const pSkin = h ? body.worldToLocal(h.point.clone()) : c.clone().addScaledVector(dir, R);
      samples.push({ p: pSkin, n: dir, t, half });
    }
    api.ends = { near: samples[0].p.clone(), low: samples[N / 2].p.clone() };
    sagNow = -1;
    api.setSag(api.sag);
  };

  api.setSag = (sag) => {
    api.sag = sag;
    if (!samples || Math.abs(sag - sagNow) < 0.002) return;
    sagNow = sag;
    // (lâche : elle pend sous le ventre ; sur les flancs elle reste contre lui, et sous le quartier en haut)
    const P = samples.map((sm) => sm.p.clone().addScaledVector(sm.n, 0.005 + TH / 2 + Math.max(-0.002, sag) * smooth(Math.max(0, (sm.half - 0.4) / 0.6)) ** 1.2));
    const pos = [];
    const idx = [];
    for (let i = 0; i < P.length; i++) {
      const tan = P[Math.min(P.length - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize();
      const n = samples[i].n;
      const across = new THREE.Vector3().crossVectors(tan, n).normalize().multiplyScalar(W / 2);
      const out = n.clone().multiplyScalar(TH / 2);
      for (const [a, b] of [[1, 1], [-1, 1], [-1, -1], [1, -1]]) {
        const v = P[i].clone().addScaledVector(across, a).addScaledVector(out, b);
        pos.push(v.x, v.y, v.z);
      }
      if (i > 0) {
        const o = (i - 1) * 4;
        for (let f = 0; f < 4; f++) {
          const a0 = o + f;
          const a1 = o + ((f + 1) % 4);
          idx.push(a0, a0 + 4, a1, a1, a0 + 4, a1 + 4);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    strapMesh.geometry.dispose();
    strapMesh.geometry = geo;
    // les boucles : juste sous le bord du quartier, de chaque côté (deux par côté, l'une à côté de l'autre)
    const at = (k) => {
      const i = Math.round(k * (P.length - 1));
      return { p: P[i], n: samples[i].n, tan: P[Math.min(P.length - 1, i + 1)].clone().sub(P[Math.max(0, i - 1)]).normalize() };
    };
    [at(0.11), at(0.89)].forEach((b, s2) => {
      const across = new THREE.Vector3().crossVectors(b.tan, b.n).normalize();
      for (let j = 0; j < 2; j++) {
        const m = buckles[s2 * 2 + j];
        m.position.copy(b.p).addScaledVector(b.n, TH * 0.7).addScaledVector(across, (j ? 1 : -1) * W * 0.24);
        // (le cadre de la boucle à plat sur la sangle, ses côtés le long d'elle)
        const basis = new THREE.Matrix4().makeBasis(across, b.tan, b.n);
        m.quaternion.setFromRotationMatrix(basis).multiply(new THREE.Quaternion().setFromAxisAngle(v3(0, 0, 1), Math.PI / 4));
        m.scale.set(1, 1.35, 1);
      }
    });
  };

  api.dispose = () => {
    strapMesh.geometry.dispose();
  };
  return api;
}

// Brider son cheval, en 3D : les trois étapes et la note du jeu dessiné (bridle.js), sur la vraie tête du cheval, avec
// SON filet (celui que le jeu va lui mettre : celui d'avant, ou un libre de la sellerie, dans sa couleur), construit
// par le jeu (gearModels.js buildGear) :
//
//   1. le mors : il baisse la tête vers nous ; le filet est posé sur sa tête, un peu bas (la têtière devant les
//      oreilles), et notre main, venue d'en bas, tient le mors sous ses lèvres ; on touche le coin de ses lèvres (là où
//      il n'a pas de dents) : le mors glisse dans sa bouche, le filet monte en place, il mâchonne son mors. Devant ses
//      dents, il relève la tête et couche les oreilles ;
//   2. les oreilles : la têtière est devant ses oreilles ; on touche une oreille (elle se plie sous la têtière), puis
//      l'autre ; la têtière passe sur la nuque, le frontal se pose ;
//   3. la sous-gorge : elle pend sous la ganache ; on la serre (🪢, ou le doigt sur sa gorge) en laissant un poing de
//      place. Trop serrée : elle rougit, il couche les oreilles et secoue la tête.
//
// Son licol (s'il en porte un) s'en va quand le mors entre : comme dans le jeu, le filet prend sa place.

import * as THREE from 'three';
import { justRule } from './grooming.js';
import { BRIDLE, throatVerdict } from './bridle.js';
import { freeBridle } from '../../sim/gear.js';
import { handModel, avatarHand } from '../../game/care/props.js';
import { nicker, snort } from './feed3d.js';
import { closeSleeve, v3, owner, rigidGear, impatience, stagePill, afterLife, smooth, dist2, pulseRing, updateRing } from './horse3dKit.js';

const PAUSE = 0.9;
const EAR_FOLD = 0.45;

/** Le filet que le jeu va lui mettre (Game.bridle → bridleUp). */
export function realBridle(profile, a, home = true) {
  let item = null;
  try {
    item = profile ? freeBridle(profile, a, { home }) : null;
  } catch {
    item = null;
  }
  item ??= a?.lastBridle?.item ?? 'bridle';
  const color = a?.lastBridle?.item === item ? a.lastBridle.color : undefined;
  return { item, color };
}

export function bridle3dGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const name = a?.name ?? ctx.name;
  const who = { name, g: a?.sex };
  const own = owner();
  const md = sc.model;
  const head = md.head;
  const S = sc.double.scale;
  const L = sc.marks;
  const m = sc.mood;
  m.ears = 'forward';
  const T = BRIDLE.throat;
  const dims = md.dims ?? { hr: 0.11, snoutZ: 0.5, earZ: -0.05 };
  const hr = dims.hr ?? 0.11;

  // ---------------------------------------------------------------- son filet, en pièces
  const real = realBridle(sc.game?.profile, a, sc.game?.isHome ?? true);
  const gear = rigidGear(sc, { bridle: real });
  const root = new THREE.Group(); // tout le filet (repère de la tête) : tenu devant elle, puis en place
  head.add(root);
  const straps = [];
  const rings = [];
  for (const mesh of gear.meshes) {
    root.add(mesh);
    const geo = mesh.geometry;
    if (geo?.type === 'TorusGeometry') rings.push(mesh);
    else if (mesh.isMesh && !geo?.userData?.shared && geo?.type === 'BufferGeometry') straps.push(mesh);
  }
  // (ordre de gearModels.js : muserolle, têtière avec la sous-gorge, frontal, puis les montants)
  const nose = straps[0] ?? null;
  const crown = straps[1] ?? null;
  const brow = real.item === 'hackamore' ? straps[2] : straps[2] ?? null;
  const cheeks = straps.slice(3);
  // La têtière : sa matière à elle (elle rougit quand la sous-gorge est trop serrée).
  const crownMat0 = crown?.material ?? null; // (remise avant de rendre l'équipement : removeGear la libère)
  if (crown) {
    crown.material = own(crown.material.clone());
    crown.material.userData = {};
  }
  const box = new THREE.Box3();
  const boxOf = (mesh) => {
    mesh.geometry.computeBoundingBox();
    return box.copy(mesh.geometry.boundingBox).clone();
  };
  // Pivots : la têtière bascule vers l'avant autour du bas de sa boucle (la gorge) ; les montants autour du mors.
  const crownBox = crown ? boxOf(crown) : null;
  const crownPivot = new THREE.Group();
  root.add(crownPivot);
  if (crown && crownBox) {
    const pv = v3(0, crownBox.min.y, (crownBox.min.z + crownBox.max.z) / 2);
    crownPivot.position.copy(pv);
    crownPivot.add(crown);
    crown.position.sub(pv);
    if (brow) {
      crownPivot.add(brow);
      brow.position.sub(pv);
    }
    // (le frontal à strass : ses perles suivent le frontal)
    for (const mesh of gear.meshes) {
      if (mesh.geometry?.type === 'SphereGeometry' && mesh.position.y > 0) {
        crownPivot.add(mesh);
        mesh.position.sub(pv);
      }
    }
  }
  // La sous-gorge : une lanière à nous, d'un côté de la têtière à l'autre en passant sous la gorge (le bas de la boucle
  // de la têtière du jeu est caché dans la ganache). Lâche, elle pend sous la gorge ; serrée, elle la touche.
  let sagNow = -1;
  const throatMat = own(new THREE.MeshStandardMaterial({ color: crown?.material?.color?.getHex?.() ?? 0x3b2110, roughness: 0.45 }));
  const throatStrap = new THREE.Mesh(new THREE.BufferGeometry(), throatMat);
  throatStrap.castShadow = true;
  throatStrap.visible = false;
  root.add(throatStrap);
  const tl = { a: null, b: null, c: null, skin: 0 };
  if (crown && crownBox) {
    const pos = crown.geometry.attributes.position;
    const h = crownBox.max.y - crownBox.min.y;
    let low = null;
    let A = null;
    let B = null;
    for (let i = 0; i < pos.count; i++) {
      const p = v3(pos.getX(i), pos.getY(i), pos.getZ(i));
      if (!low || p.y < low.y) low = p;
      const band = p.y > crownBox.min.y + 0.3 * h && p.y < crownBox.min.y + 0.5 * h;
      if (band && (!A || p.x < A.x)) A = p;
      if (band && (!B || p.x > B.x)) B = p;
    }
    tl.a = A ?? v3(-hr * 0.6, crownBox.min.y + 0.4 * h, low.z);
    tl.b = B ?? v3(hr * 0.6, crownBox.min.y + 0.4 * h, low.z);
    tl.c = low.clone();
    tl.skin = low.y; // (le dessous de la gorge, mesuré sur le vrai modèle au premier besoin : voir measureThroat)
  }
  let throatMeasured = false;
  let throatPath = null; // points de la sous-gorge sur la peau, côté nous (repère de la tête)
  /**
   * Le chemin de la sous-gorge, posé sur la peau de notre côté : du côté de la têtière (sous l'oreille) jusque sous la
   * gorge, chaque point cherché par un rayon lancé vers la tête (sur la copie figée de la pose).
   */
  function measureThroat() {
    if (throatMeasured || !tl.c) return;
    throatMeasured = true;
    sc.proxy.bake();
    const top = tl.a.clone();
    const end = tl.c.clone();
    const side = head.localToWorld(v3(1, 0, 0)).sub(head.localToWorld(v3(0, 0, 0))).normalize();
    throatPath = [];
    for (let i = 0; i <= 8; i++) {
      const k = i / 8;
      const q = top.clone().lerp(end, k);
      // (le rayon part de notre côté, loin, vers la tête)
      const from = head.localToWorld(q.clone().setX(-0.6));
      const hit = sc.proxy.hitAll(new THREE.Ray(from, side.clone()))[0];
      const p = hit ? head.worldToLocal(hit.point.clone()) : q.clone().setX(-hr * 0.5 * (1 - k));
      throatPath.push(p.add(v3(-0.006, 0, 0)));
    }
  }
  function setSag(sag) {
    if (!throatPath || Math.abs(sag - sagNow) < 0.002) return;
    sagNow = sag;
    // (lâche : elle s'écarte de la gorge et pend, surtout au milieu ; serrée, elle colle à la peau)
    const pts = throatPath.map((p, i) => {
      const k = i / (throatPath.length - 1);
      const b = Math.sin(Math.PI * Math.min(1, k * 1.15)) * sag;
      return p.clone().add(v3(-0.25 * b, -b, -0.35 * b));
    });
    throatStrap.geometry.dispose();
    throatStrap.geometry = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 28, 0.0085, 6, false);
  }
  const cheekPivots = cheeks.map((c) => {
    const b = boxOf(c);
    const pv = v3((b.min.x + b.max.x) / 2, b.min.y, b.max.z);
    const g = new THREE.Group();
    g.position.copy(pv);
    root.add(g);
    g.add(c);
    c.position.sub(pv);
    return { g, len: Math.max(0.05, b.max.y - b.min.y) };
  });
  // Le mors (les anneaux, côté nous : x < 0 dans le repère de la tête — on voit son côté droit) et ses dents.
  const ringNear = rings.length ? rings.reduce((p, q) => (q.position.x < p.position.x ? q : p)) : null;
  const barLocal = ringNear ? ringNear.position.clone().add(v3(-0.004, 0, -0.01)) : v3(-hr * 0.5, -hr * 0.42, (dims.snoutZ ?? 0.5) - hr * 0.8);
  const snout = dims.snoutZ ?? 0.5;
  const teethLocal = v3(-hr * 0.12, -0.13 * snout, snout * 0.99);
  const throatLocal = crownBox ? v3(-hr * 0.45, crownBox.min.y + (crownBox.max.y - crownBox.min.y) * 0.25, crownBox.min.z) : v3(0, -hr, 0);
  // Son licol : retiré quand le mors entre (le filet le remplace, comme dans le jeu).
  const halter = (sc.double.gear?.userData?.meshes ?? []).filter((x) => x.parent === head && x.visible);

  // ---------------------------------------------------------------- notre main
  // (la main tient l'anneau du mors par dessous, la paume vers le haut, les doigts refermés dessus ; le poignet et la
  // manche descendent vers nous, hors de l'image. Avant : la main tenait la têtière, tournée vers nous, on ne voyait
  // que quatre doigts collés sur sa joue)
  const hand = closeSleeve(handModel(own, { ...avatarHand(sc.game?.profile), grip: 0.55 }), own);
  const handK = 0.95 * Math.max(0.8, S);
  hand.scale.setScalar(handK);
  sc.scene.add(hand);
  const ring = pulseRing(own, { r: 0.03 * Math.max(0.8, S) });
  sc.scene.add(ring);

  // ---------------------------------------------------------------- état (la logique du jeu dessiné)
  let si = 0;
  let pause = 0;
  let annoyed = 0;
  let fuss = 0;
  let teethTaps = 0;
  let bitIn = false;
  let bitK = 0; // 0 tenu devant sa tête, 1 en place
  const ears = [0, 0];
  const earDone = [false, false]; // [celle de notre côté, celle de derrière]
  let crownK = 0;
  let throat = 0;
  let tightening = false;
  let zone = null;
  let rule = null;
  let chew = 0;
  const results = [];
  const step = () => BRIDLE.steps[si];
  const busy = impatience(sc, { after: 10 });

  ctx.stopButton(() => next());
  const quickBtn = ctx.opts?.quick
    ? ctx.button(t('mg_bridle_quick'), { onTap: () => { if (!ctx.done) { bitIn = true; earDone[0] = earDone[1] = true; throat = (T.lo + T.hi) / 2; ctx.finish(1, t('mg_bridle_end'), 'just'); } } })
    : null;

  /** La consigne d'une étape (le mors : la bouche du modèle ne s'ouvre pas, on ne le promet pas). */
  const stepHint = (st) => t(st === 'bit' ? 'mg_bridle_bit3d' : `mg_bridle_${st}`, who);
  function startStep(i) {
    si = i;
    const st = step();
    ctx.hint(stepHint(st));
    frameFor(st);
    busy.poke();
    if (st !== 'throat') return ctx.progress(0);
    if (quickBtn) quickBtn.remove();
    rule = justRule(ctx, { lo: T.lo, hi: T.hi, max: T.max, slack: T.hi - T.lo });
    ctx.button(`🪢 ${t('mg_seller_tighten')}`, { cls: 'primary', hold: true, onDown: () => { tightening = true; }, onUp: () => { tightening = false; } });
    ctx.progress(0);
  }

  function next() {
    if (ctx.done || pause > 0) return;
    if (step() !== 'throat') return ctx.hint(stepHint(step()), 'warn');
    tightening = false;
    results.push({ step: 'throat', value: throat, ...throatVerdict(throat) });
    finishAll();
  }

  function finishAll() {
    const q = results.reduce((n, r) => n + r.q, 0) / results.length;
    const worst = results.reduce((w, r) => (r.q < w.q ? r : w), results[0]);
    const just = results.every((r) => r.verdict === 'just');
    let msg;
    if (just) msg = t('mg_bridle_end');
    else if (worst.step === 'bit') msg = t('mg_deworm_teeth', who);
    else msg = t(worst.verdict === 'high' ? 'mg_bridle_tight' : 'mg_bridle_loose', who);
    ctx.finish(q, msg, just ? 'just' : worst.verdict);
    if (just) {
      nicker(sc);
      m.nod = 1;
    }
  }

  function showThroat() {
    ctx.progress(throat / T.max);
    const z = throat < T.lo ? 'low' : throat > T.hi ? 'high' : 'just';
    if (z === zone) return;
    zone = z;
    if (z === 'just') ctx.hint(t('mg_pressStop'), 'good');
    else if (z === 'high') ctx.hint(t('mg_bridle_tight', who), 'warn');
  }

  // ---------------------------------------------------------------- où toucher (à l'écran)
  const W = (local) => head.localToWorld(local.clone());
  /** Là où toucher pour serrer : le milieu de la sous-gorge (une fois posée sur la peau), sinon sous la ganache. */
  const throatAt = () => (throatPath ? throatPath[5].clone().add(v3(-0.01, -Math.max(0, sagNow) * 0.8, 0)) : throatLocal);
  const earTip = (i) => {
    const e = md.ears?.[i === 0 ? 1 : 0]; // (model.ears : [gauche, droite] ; celle de notre côté est la droite)
    return e ? e.localToWorld(v3(0, 0.1 * Math.max(0.7, S), 0)) : W(v3(0, hr * 1.2, dims.earZ ?? 0));
  };

  // ---------------------------------------------------------------- caméra
  function frameFor(st, now = false) {
    sc.holder.updateMatrixWorld(true); // (la pose du moment : à l'ouverture, la tête n'a pas encore été dessinée)
    const ptsHead = [L.muzzle, L.poll, ...L.ears, L.head, W(throatLocal.clone().add(v3(0, -hr * 0.6, 0)))];
    // (le mors : la tête telle qu'elle est — il la baisse vers nous —, le bout du nez avec de la marge, et notre main
    // sous ses lèvres. Avant : cadré sur la pose de repos, le nez sortait de l'image en portrait)
    // (à l'ouverture, la pose du modèle n'est pas encore celle du box : les repères de repos, avec de la marge)
    if (st === 'bit' && !framedLow) sc.frame([...ptsHead, W(v3(0, -hr * 2.2, snout * 0.9)), W(v3(0, -hr * 1.6, snout * 1.3)), L.muzzle.clone().add(v3(0.2 * S, -0.12 * S, 0))], { dir: [0.75, 0.12, 1], pad: 1.2, now });
    else if (st === 'bit') sc.frame([W(v3(0, hr * 1.2, -0.02)), ...[0, 1].map((i) => earTip(i)), W(v3(0, -hr * 0.2, snout * 1.14)), W(teethLocal.clone().add(v3(0, -hr * 0.4, hr * 0.5))), W(barLocal.clone().add(v3(-hr * 0.5, -hr * 1.9, 0))), W(throatLocal.clone().add(v3(0, -hr * 0.6, 0)))], { dir: [0.75, 0.12, 1], pad: 1.16, now });
    else if (st === 'ears') sc.frame([...ptsHead, ...L.ears.map((e) => e.clone().add(v3(0, 0.08 * S, 0)))], { dir: [0.6, 0.35, 1], pad: 1.22, now });
    else sc.frame([...ptsHead, L.neck, W(throatLocal.clone().add(v3(0, -hr * 1.2, 0)))], { dir: [0.42, -0.12, 1], pad: 1.2, now });
  }

  // ---------------------------------------------------------------- la pose : oreilles pliées, tête relevée
  let lower = 0; // (il baisse la tête vers nous pour qu'on lui mette le filet, tant que le mors n'est pas entré)
  let framedLow = false;
  const unhook = afterLife(sc, (dt) => {
    // (il garde la tête baissée jusqu'aux oreilles : relevée tout de suite, son nez sortait de l'image)
    lower += ((step() === 'bit' && annoyed <= 0 ? 1 : 0) - lower) * Math.min(1, dt * 2.5);
    if (lower > 0.01 && md.neck) md.neck.rotateX(0.16 * smooth(lower));
    if (annoyed > 0 && md.neck) md.neck.rotateX(-0.28 * smooth(Math.min(1, annoyed)));
    for (let i = 0; i < 2; i++) {
      if (ears[i] <= 0) continue;
      const e = md.ears?.[i === 0 ? 1 : 0];
      const k = Math.sin(Math.PI * (1 - ears[i] / EAR_FOLD));
      if (e) e.rotateX(1.1 * k);
    }
    if (fuss > 0 && md.head) md.head.rotateZ(Math.sin(sc.time * 18) * 0.06 * fuss);
  });

  startStep(0);
  frameFor('bit', true);

  /** Le filet : sur sa tête mais plus bas, le mors sous ses lèvres (k = 0), puis en place (k = 1). */
  function poseBridle() {
    const k = smooth(bitK);
    // (tenu : le filet descendu le long de sa tête et un peu écarté du chanfrein, le mors juste sous la bouche ;
    // avant : décalé devant le bout du nez, on ne voyait que deux lanières et une boucle qui pendaient)
    root.position.set(0, -hr * 0.42 * (1 - k), hr * 0.12 * (1 - k));
    root.rotation.set(0, 0, 0);
    // la têtière : devant les oreilles tant qu'elles ne sont pas passées
    const tilt = bitIn ? 0.45 * (1 - smooth(crownK)) : 0.2;
    crownPivot.rotation.x = tilt;
    if (brow) brow.visible = crownK > 0.85;
    // la sous-gorge : lâche, elle pend sous la gorge ; serrée, elle la touche (trop : elle rougit)
    const on = bitIn && earDone.every(Boolean) && crownK > 0.8;
    throatStrap.visible = on;
    if (on) {
      measureThroat();
      setSag(hr * 0.55 * Math.max(0, 1 - throat / T.hi) - (throat > T.hi ? 0.004 : 0));
      const red = throat > T.hi ? Math.min(1, (throat - T.hi) / 0.2) : 0;
      throatMat.emissive.setRGB(0.6 * red, 0.04 * red, 0.02 * red);
    }
  }

  return {
    peek: () => ({
      step: step(), si, annoyed, throat, tightening, bitIn, crown: crownK, pause, teethTaps, lo: T.lo, hi: T.hi,
      earDone: [...earDone], results: results.map((r) => ({ ...r })),
      bar: sc.project(W(barLocal)), teeth: sc.project(W(teethLocal)), ears: [0, 1].map((i) => sc.project(earTip(i))),
      nose: sc.project(W(v3(0, -0.02 * snout, snout))), hand: hand.visible ? sc.project(hand.position) : null,
      throatSpot: sc.project(W(throatAt())), halterHidden: halter.every((x) => !x.visible),
      sag: sagNow,
    }),
    down(p) {
      if (ctx.done || pause > 0) return;
      busy.poke();
      const st = step();
      if (st === 'bit') {
        const bar = sc.project(W(barLocal));
        const teeth = sc.project(W(teethLocal));
        const dBar = dist2(p, bar);
        const dTeeth = dist2(p, teeth);
        if (dBar < 44 && dBar <= dTeeth + 6) {
          bitIn = true;
          chew = 2.4;
          for (const x of halter) x.visible = false;
          results.push({ step: 'bit', value: teethTaps, q: [1, 0.7][teethTaps] ?? 0.4, verdict: teethTaps ? 'low' : 'just' });
          ctx.progress(1);
          ctx.hint(t('mg_bridle_bitIn3d', who), 'good');
          // (le mot reste dans l'image, même quand la bouche est près du bord)
          const v = ctx.view;
          fx.text(Math.min(v.x1 - 80, Math.max(v.x0 + 80, bar.x)), bar.y - 40, `✓ ${t('mg_bridle_stage_bit')}`, '#2f8a5f', 26);
          pause = PAUSE;
        } else if (dTeeth < 52) {
          teethTaps++;
          annoyed = 1;
          m.annoyed = 1.2;
          const h = sc.project(L.poll);
          fx.float(h.x, h.y - 20, '💢', 22);
          ctx.hint(t('mg_deworm_teeth', who), 'warn');
          snort(sc);
        }
        return;
      }
      if (st === 'ears') {
        let best = -1;
        let bd = 58;
        for (let i = 0; i < 2; i++) {
          const d = dist2(p, sc.project(earTip(i)));
          if (!earDone[i] && d < bd) {
            bd = d;
            best = i;
          }
        }
        if (best < 0) return;
        earDone[best] = true;
        ears[best] = EAR_FOLD;
        const at = sc.project(earTip(best));
        fx.burst(at.x, at.y, '✨', 2, { speed: 60, size: 14 });
        const n = earDone.filter(Boolean).length;
        ctx.progress(n / 2);
        if (n < 2) return;
        results.push({ step: 'ears', value: 2, q: 1, verdict: 'just' });
        fx.text(at.x, at.y - 30, `✓ ${t('mg_bridle_stage_ears')}`, '#2f8a5f', 26);
        pause = PAUSE;
        return;
      }
      if (dist2(p, sc.project(W(throatAt()))) < 60) tightening = true;
    },
    up() {
      if (step() === 'throat') tightening = false;
    },
    key(code, isDown) {
      if (code === 'Enter' || code === 'NumpadEnter') {
        if (isDown) next();
        return;
      }
      if (code === 'Space' && step() === 'throat' && pause <= 0) tightening = isDown;
    },
    update(dt) {
      annoyed = Math.max(0, annoyed - dt);
      for (let i = 0; i < ears.length; i++) ears[i] = Math.max(0, ears[i] - dt);
      crownK += (earDone.filter(Boolean).length / 2 - crownK) * Math.min(1, dt * 6);
      if (bitIn) bitK = Math.min(1, bitK + dt / 0.55);
      chew = Math.max(0, chew - dt);
      fuss = Math.max(0, fuss - dt * 1.5);
      // il mâchonne son mors, il regarde la main qui tient le filet ; impatient si on traîne
      m.chew = Math.max(chew > 0 ? 1 : 0, m.chew - dt);
      const st = step();
      const fidget = busy.update(dt, tightening || pause > 0 || ctx.done);
      if (!fidget) m.lift = null;
      if (annoyed > 0) m.ears = 'back';
      else if (!(st === 'throat' && throat > T.hi)) m.ears = 'forward';
      m.look = hand.position;
      m.lookAmt = st === 'bit' && !bitIn ? 0.2 : 0;
      poseBridle();
      // (la tête baissée vers nous : on recadre une fois, en douceur, sur sa tête telle qu'elle est)
      if (st === 'bit' && !framedLow && lower > 0.92) {
        framedLow = true;
        frameFor('bit');
      }
      // la main : elle tient l'anneau du mors (de notre côté) par dessous et l'accompagne quand il entre ; puis elle
      // s'en va (on touche les oreilles, on serre la sous-gorge)
      hand.visible = !ctx.done && st === 'bit' && bitK < 1;
      if (hand.visible && ringNear) {
        const at = ringNear.getWorldPosition(v3());
        const toCam = sc.camera.position.clone().sub(at).normalize();
        // (le bras vient de notre côté, d'en bas : le poignet descend vers nous)
        const from = at.clone().addScaledVector(toCam, 0.32).add(v3(0, -0.42, 0));
        const x = at.clone().sub(from).normalize();
        const z = new THREE.Vector3().crossVectors(x, v3(0, 1, 0)).normalize();
        const y = new THREE.Vector3().crossVectors(z, x).normalize();
        hand.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
        // (l'anneau dans le creux des doigts : un peu au-delà de la paume, au-dessus d'elle)
        hand.position.copy(at).addScaledVector(x, -0.05 * handK).addScaledVector(y, -0.022 * handK);
      }
      // la cible : le coin des lèvres, puis les oreilles
      ring.visible = !ctx.done && pause <= 0 && sc.ready && !(st === 'throat' && (tightening || throat > 0));
      if (ring.visible) updateRing(ring, sc, ctx.time, st === 'bit' ? W(barLocal) : st === 'ears' ? earTip(earDone[0] ? 1 : 0) : W(throatAt()));
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) {
          pause = 0;
          if (!ctx.done) startStep(si + 1);
        }
        return;
      }
      if (ctx.done || st !== 'throat') return;
      if (tightening) {
        throat = Math.min(T.max, throat + T.rate * dt);
        if (throat > 0.95) {
          if (fuss <= 0.2) {
            const h = sc.project(L.poll);
            fx.float(h.x + 20, h.y - 30, '💢', 20);
            snort(sc);
          }
          fuss = 1;
        }
      }
      if (throat > T.hi) m.ears = 'back';
      showThroat();
    },
    draw(g) {
      if (!sc.ready) return;
      const st = step();
      if (rule && st === 'throat') rule.dial(g, throat, 354, ctx.view.y0 + 56);
      stagePill(g, si, BRIDLE.steps.length, t(`mg_bridle_stage_${st}`), Math.max(8, ctx.view.y0 + 8));
    },
    destroy() {
      unhook();
      root.parent?.remove(root);
      throatStrap.geometry.dispose();
      if (crown && crownMat0) crown.material = crownMat0;
      gear.dispose();
      for (const x of halter) x.visible = true;
      sc.scene.remove(hand, ring);
      own.free();
    },
  };
}

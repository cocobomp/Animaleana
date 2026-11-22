// Le pansage complet du cheval, en 3D : les mêmes quatre outils dans l'ordre, les mêmes gestes et la même note que
// le jeu dessiné (pansage.js), mais sur le vrai cheval de profil dans son box :
//
//   1. l'étrille en caoutchouc : des petits ronds sur les plaques de boue séchée collées à son poil (cartes posées
//      sur le modèle, liées à ses os : elles suivent sa respiration) ; pas sur la tête ni les jambes ;
//   2. la brosse douce : chasser la poussière dans le sens du poil (vers la queue) ; ses chaussettes de boue, de haut
//      en bas ;
//   3. le cure-pied : il lève chaque pied à son tour (le membre se plie, la sole apparaît) ; gratter la terre du
//      talon vers la pince, sans piquer la fourchette ; parfois un caillou qui saute ;
//   4. le peigne : les nœuds de la crinière, puis de la queue, de haut en bas.
//
// La logique des gestes est celle du jeu dessiné, à l'écran : chaque tache, chaque nœud, chaque motte de terre est
// projeté dans l'espace du cadre à chaque image (position et rayon), et le doigt est comparé à eux comme avant ;
// « sur le corps », « sur la tête ou les jambes », « sur les crins » viennent du lancer de rayon sur le modèle.

import * as THREE from 'three';
import { justRule } from './grooming.js';
import { justOutcome } from './score.js';
import { nbsp } from './frame.js';
import { clamp, lerp, distToSegment } from './draw.js';
import { LEG_MUD } from '../../sim/legMud.js';
import { PANSAGE_STAGES, PANSAGE_FEET, MAX, SLACK, STEP, PAUSE, HX, HY, makeHoof, drawStagePill, drawTray, legMudColor } from './pansage.js';
import { groomTool, mudTexture } from '../../game/care/props.js';
import { hoofSole } from '../../game/care/hoof.js';
import { nicker, snort } from './feed3d.js';
import { rng as seeded } from '../../game/care/textures.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** Pied du jeu → membre du modèle (model.legs : FL, FR, HL, HR). */
const LEG_OF = { fl: 0, fr: 1, hl: 2, hr: 3 };
const BODY = new Set(['body', 'shoulder', 'hip']);

export function pansage3dGame(ctx) {
  const { a, t, fx } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const name = a?.name ?? ctx.name;
  const rng = ctx.rng;
  const S = sc.double.scale;
  const L = sc.marks;
  const dirt = clamp(1 - (a?.needs?.grooming ?? 50) / 100);
  const rolled = !!a?.muddy;
  const legMud = (a?.legMud ?? 0) > LEG_MUD.patchesAt;
  const legWet = clamp(a?.legMudWet ?? 0);
  const keep = [];
  const own = (x) => {
    keep.push(x);
    return x;
  };
  const m = sc.mood;
  m.ears = 'forward';

  // ---------------------------------------------------------------- les taches, posées sur le modèle
  const mudTex = own(mudTexture('mud', 3));
  const dustTex = own(mudTexture('dust', 5));
  const legTex = own(mudTexture('leg', 9));
  const patchGeo = own(new THREE.PlaneGeometry(1, 1));
  /** Une carte posée sur le poil au point p (normale n), liée à l'os bone (elle suit le corps). */
  function decal(p, n, bone, r, tex, color = 0xffffff, spin = true) {
    const mat = own(new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, color, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }));
    const mesh = new THREE.Mesh(patchGeo, mat);
    mesh.scale.set(r * 2.2, r * 2.2, 1);
    mesh.position.copy(p).addScaledVector(n, 0.006);
    mesh.lookAt(p.clone().add(n));
    if (spin) mesh.rotateZ(rng() * Math.PI * 2);
    mesh.renderOrder = 2;
    sc.scene.add(mesh);
    (bone ?? sc.holder).attach(mesh);
    return mesh;
  }
  /** Des points du flanc (côté caméra), sur le corps : rayons lancés vers lui depuis devant. */
  function bodyPoints(count, r0, avoid = []) {
    const out = [];
    const x0 = L.tail.x + 0.22 * S;
    const x1 = L.chest.x - 0.02 * S;
    const y0 = L.belly.y + 0.1 * S;
    const y1 = L.back.y - 0.06 * S;
    const z0 = sc.holder.position.z + 2.5;
    const ray = new THREE.Ray();
    for (let r = r0; r > r0 * 0.4 && out.length < count; r *= 0.92) {
      out.length = 0;
      for (let tries = 0; out.length < count && tries < 160; tries++) {
        const x = lerp(x0, x1, rng());
        const y = lerp(y0, y1, rng());
        ray.set(v3(x, y, z0), v3(0, 0, -1));
        const h = sc.proxy.hit(ray, -9, 1e9);
        if (!h || !BODY.has(regionFor(h.boneName))) continue;
        const rr = r * (0.9 + rng() * 0.2);
        if ([...avoid, ...out].some((q) => q.p.distanceTo(h.point) < (q.r + rr) * 1.06)) continue;
        out.push({ p: h.point, n: h.normal, bone: h.bone, r: rr });
      }
    }
    return out;
  }
  sc.proxy.bake();
  const nMud = 3 + Math.round(dirt * 4) + (rolled ? 2 : 0);
  const mudSpots = bodyPoints(nMud, 0.115 * S);
  const mud = mudSpots.map((q) => ({ ...q, mud: 1, dust: 0, seed: rng() * 10, mesh: decal(q.p, q.n, q.bone, q.r, mudTex) }));
  let dust = [];
  let legs = [];
  const toUs = v3(0, 0, 1);

  // ---------------------------------------------------------------- les pieds : sole et mottes de terre
  const lame = a?.lame?.cause === 'stone';
  const r0 = rng();
  const r1 = rng();
  const stoneFoot = lame ? (a.lame.foot ?? 0) % 4 : r0 < 0.6 ? Math.floor(r1 * 4) : -1;
  const hooves = PANSAGE_FEET.map((foot, i) => {
    const hf = makeHoof(foot, i === stoneFoot, rng, dirt);
    const leg = sc.model.legs?.[LEG_OF[foot]];
    hf.sole = leg ? hoofSole(sc, leg, hf.blobs.map((q) => ({ u: (q.y - HY) / 86, w: (q.x - HX) / 50, r: q.r / 50, stone: !!q.stone, seed: q.seed })), own) : null;
    return hf;
  });
  let foot = 0;
  let footAt = 0;
  let footDoneAt = -1;
  let pokeAt = -9;
  let stoneOut = false;

  // ---------------------------------------------------------------- les nœuds des crins
  const nKnots = 2 + Math.round(dirt * 4);
  const knots = [];
  const knotGeo = own(knotGeometry());
  const knotMat = own(new THREE.MeshStandardMaterial({ color: new THREE.Color(a?.look?.mane ?? 0x2a1d14).multiplyScalar(0.85), roughness: 0.85 }));
  for (let i = 0; i < nKnots; i++) {
    const part = i % 2 === 0 ? 'mane' : 'tail';
    const slot = Math.floor(i / 2);
    const k = part === 'mane' ? [0.3, 0.55, 0.8][slot] : [0.5, 0.75, 0.97][slot];
    const spot = knotSpot(sc, part, k);
    const mesh = new THREE.Mesh(knotGeo, knotMat);
    mesh.scale.setScalar(0.06 * S);
    mesh.position.copy(spot.p);
    mesh.rotation.set(rng() * 3, rng() * 3, rng() * 3);
    mesh.castShadow = true;
    sc.scene.add(mesh);
    spot.bone.attach(mesh);
    knots.push({ part, k, tangle: 1, r: 12, seed: rng() * 6, mesh });
  }

  // ---------------------------------------------------------------- l'outil sous le doigt
  const tools = Object.fromEntries(['curry', 'brush', 'pick', 'comb'].map((k) => [k, groomTool(k, own)]));
  for (const tl of Object.values(tools)) {
    tl.visible = false;
    tl.scale.setScalar(1.7 * Math.max(0.8, S));
    sc.scene.add(tl);
  }
  const toolOf = { curry: 'curry', brush: 'brush', hoof: 'pick', comb: 'comb' };

  // ---------------------------------------------------------------- état du jeu (comme pansage.js)
  let si = 0;
  let rule = null;
  let over = 0;
  let grace = 0;
  let nextMark = 0;
  let annoyed = 0;
  let pause = 0;
  const results = [];
  let last = null;
  let lastDir = null;
  let goodLen = 0;
  let badLen = 0;
  let saidBony = false;
  let touch = null; // dernier point touché ({ point, normal, region })
  let rot = 0;

  const stage = () => PANSAGE_STAGES[si];
  const stageName = (k = stage()) => t(`mg_pansage_stage_${k}`);
  const hoofBlobs = () => hooves.flatMap((hf) => hf.blobs);

  function value() {
    const st = stage();
    let done = 0;
    if (st === 'curry') done = 1 - mud.reduce((n, q) => n + q.mud, 0) / Math.max(1, mud.length);
    else if (st === 'brush') done = dust.length ? 1 - dust.reduce((n, q) => n + q.dust, 0) / dust.length : 1;
    else if (st === 'hoof') {
      const b = hoofBlobs();
      done = 1 - b.reduce((n, q) => n + Math.min(1, q.dirt / q.hard), 0) / b.length;
    } else done = 1 - knots.reduce((n, q) => n + q.tangle, 0) / knots.length;
    return Math.min(MAX, done + over);
  }
  const count = () => ({ curry: mud.length, brush: dust.length, hoof: hoofBlobs().length, comb: knots.length })[stage()] || 1;

  const stopBtn = ctx.stopButton(() => endStage());
  const setStopLabel = () => {
    const text = `✅ ${si < PANSAGE_STAGES.length - 1 ? t('mg_pansage_next') : t('mg_stopHere')}`;
    if (stopBtn && 'textContent' in stopBtn) stopBtn.textContent = nbsp(text);
    else if (stopBtn) stopBtn.text = text;
  };

  // ---------------------------------------------------------------- caméra selon l'étape
  function frameStage() {
    const st = stage();
    const body = [L.withers, L.croup, L.back, L.belly, L.chest, L.tail, L.neck.clone().lerp(L.poll, 0.3)];
    // (de trois quarts avant : le flanc où sont les taches, et sa tête, qui réagit)
    const head = [L.poll, L.muzzle, ...L.ears];
    if (st === 'curry') sc.frame([...body, ...head, L.belly.clone().add(v3(0, -0.15 * S, 0))], { dir: [0.42, 0.2, 1], pad: 1.04 });
    else if (st === 'brush') {
      const low = legs.length ? L.hooves : [L.belly.clone().add(v3(0, -0.2 * S, 0))];
      sc.frame([...body, ...head, ...low], { dir: [0.42, 0.18, 1], pad: 1.03 });
    } else if (st === 'hoof') frameHoof();
    else frameComb();
  }
  /**
   * Le pied levé, vu de près. Appelé à chaque image de l'étape : la caméra suit la sole (le membre se plie, le cheval
   * respire, il reporte son poids) ; avant, elle ne la suivait que 1,2 s et un postérieur pouvait sortir de l'image.
   */
  function frameHoof(half = 0.55) {
    const hf = hooves[foot];
    if (!hf?.sole) return;
    const f = hf.sole.frameInfo();
    sc.frame(f.points, { dir: f.dir, pad: 2.3, half });
  }
  /** On peut curer ce pied : il est levé et la caméra s'est posée sur lui (ou, au plus tard, après 2 s). */
  const footReady = () => footDoneAt < 0 && ctx.time - footAt >= 0.6 && (sc.settled(0.04) || ctx.time - footAt > 2);
  let combOn = null;
  function frameComb() {
    const maneLeft = knots.some((q) => q.part === 'mane' && q.tangle > 0);
    const tailLeft = knots.some((q) => q.part === 'tail' && q.tangle > 0);
    const part = maneLeft || !tailLeft ? 'mane' : 'tail';
    if (combOn === part) return;
    combOn = part;
    const pts = knots.filter((q) => q.part === part).map((q) => q.mesh.getWorldPosition(v3()));
    if (part === 'mane') sc.frame([...pts, L.withers, L.poll, ...L.ears, L.neck.clone().add(v3(0, -0.25 * S, 0))], { dir: [0.15, 0.2, 1], pad: 1.3 });
    else sc.frame([...pts, L.tail, L.croup, L.tailTip, L.tailTip.clone().add(v3(0, -0.1, 0))], { dir: [-0.25, 0.15, 1], pad: 1.25 });
  }

  function startStage(i) {
    si = i;
    over = 0;
    grace = 0;
    nextMark = 0;
    goodLen = 0;
    badLen = 0;
    last = null;
    lastDir = null;
    const st = stage();
    if (st === 'brush') {
      // La boue décollée devient de la poussière ; un peu de poussière en plus, ailleurs.
      dust = mud.filter((q) => q.mud <= 0).map((q) => {
        q.mesh.material.map = dustTex;
        q.mesh.material.needsUpdate = true;
        q.mesh.material.opacity = 1;
        q.dust = 1;
        return q;
      });
      const extra = bodyPoints(2, 0.085 * S, mud);
      for (const q of extra) dust.push({ ...q, dust: 1, seed: rng() * 10, mesh: decal(q.p, q.n, q.bone, q.r, dustTex) });
      if (legMud) {
        // (🧦 ses chaussettes de boue : une tache sur chaque canon, foncée mouillée, claire sèche)
        const col = new THREE.Color(legMudColor(legWet));
        legs = (sc.model.legs ?? []).map((l, i) => {
          const knee = l.knee.getWorldPosition(v3());
          const fet = l.fetlock.getWorldPosition(v3());
          const at = knee.clone().lerp(fet, 0.5);
          // (le canon de CE membre : rayon depuis notre côté, premier point sur ses os à lui)
          const prefix = ['FL', 'FR', 'HL', 'HR'][i];
          const hits = sc.proxy.hitAll(new THREE.Ray(v3(at.x, at.y, at.z + 3), v3(0, 0, -1)));
          const h = hits.find((x) => x.boneName.startsWith(prefix)) ?? { point: at.clone().addScaledVector(toUs, (sc.model.dims?.legR ?? 0.06) * S), normal: toUs.clone(), bone: null };
          const bone = h.bone ?? l.knee;
          const q = { p: h.point, n: h.normal, bone, r: 0.065 * S, dust: 1, leg: true, wet: legWet, seed: rng() * 10 };
          q.mesh = decal(h.point, h.normal, bone, q.r, legTex, col.getHex(), false);
          // (une chaussette : étroite comme le canon, longue du genou au boulet)
          q.mesh.scale.x *= 0.55;
          q.mesh.scale.y *= 1.9;
          return q;
        });
        dust.push(...legs);
      }
    }
    if (st === 'hoof') {
      foot = 0;
      footAt = ctx.time;
      footDoneAt = -1;
      m.lift = LEG_OF[PANSAGE_FEET[0]];
      m.liftAmt = 0;
    } else m.lift = null;
    // (au cure-pied, il se tient carré : pas de repos sur un postérieur, voir stage.life)
    m.square = st === 'hoof';
    if (st === 'comb') combOn = null;
    frameStage();
    const n = count();
    rule = justRule(ctx, { lo: 1 - 0.5 / n, hi: st === 'hoof' ? 1.1 : 1.05, max: MAX, slack: SLACK });
    if (st === 'curry' && rolled) ctx.hint(`${t('mg_pansage_rolled', { name, g: a?.sex })} ${t('mg_pansage_curry_hint')}`);
    else if (st === 'brush' && legs.length) ctx.hint(`${t('mg_pansage_brush_hint')} ${t('mg_pansage_legmud')}`);
    else if (st === 'hoof' && lame) ctx.hint(t('mg_pansage_hoof_lame', { name, foot: t(`mg_pansage_foot_${PANSAGE_FEET[stoneFoot]}`) }), 'warn');
    else ctx.hint(st === 'hoof' ? `${t('mg_pansage_hoof_hint')} (${t(`mg_pansage_foot_${PANSAGE_FEET[0]}`)})` : t(`mg_pansage_${st}_hint`));
    ctx.progress(value() / MAX);
    setStopLabel();
  }

  function endStage() {
    if (ctx.done || pause > 0 || !rule) return;
    const v = value();
    const res = justOutcome(v, rule.lo, rule.hi, { slack: SLACK });
    results.push({ stage: stage(), value: v, lo: rule.lo, hi: rule.hi, q: res.q, verdict: res.verdict });
    last = null;
    if (si >= PANSAGE_STAGES.length - 1) return finishAll();
    fx.text(200, 120, `✓ ${stageName()}`, '#2f8a5f', 26);
    if (stage() === 'hoof') m.lift = null;
    pause = PAUSE;
  }

  function finishAll() {
    const b = hoofBlobs();
    const cleaned = 1 - b.reduce((n, q) => n + Math.min(1, q.dirt / q.hard), 0) / b.length;
    if (ctx.opts) ctx.opts.out = { ...(ctx.opts.out ?? {}), hooves: { cleaned, stoneOut } };
    const q = results.reduce((n, r) => n + r.q, 0) / results.length;
    const worst = results.reduce((w, r) => (r.q < w.q ? r : w), results[0]);
    const just = results.every((r) => r.verdict === 'just');
    const why = just ? 'just' : worst.verdict;
    const msg = just ? t('mg_pansage_just', { name }) : t(`mg_pansage_${worst.verdict}_${worst.stage}`, { name });
    ctx.finish(q, msg, why);
    // Tout beau, tout propre : il s'ébroue de contentement, toute la scène le voit (cadrage large).
    m.lift = null;
    m.nod = 1;
    nicker(sc);
    snort(sc);
    sc.frame([L.muzzle, L.poll, ...L.ears, L.tail, L.croup, ...L.hooves], { dir: [0.4, 0.18, 1], pad: 1.08, half: 0.7, raise: 0.5 });
  }

  // ---------------------------------------------------------------- les gestes (comme pansage.js)

  /** Les objets du jeu, projetés à l'écran à cette image (position et rayon dans l'espace du cadre). */
  function place(q, wr = q.r) {
    const w = q.mesh.getWorldPosition(v3());
    const p = sc.project(w);
    q.x = p.x;
    q.y = p.y;
    q.rr = Math.max(8, sc.projectRadius(w, wr));
    return q;
  }
  const near = (q, seg, pad) => distToSegment(q.x, q.y, seg.x0, seg.y0, seg.x1, seg.y1) <= q.rr + pad;
  const crumbs = (p, color) => {
    if (Math.random() < 0.5) fx.dot(p.x + (Math.random() - 0.5) * 20, p.y + 8, color, 3 + Math.random() * 3, { vx: (Math.random() - 0.5) * 60, vy: 40, grav: 140, life: 0.6 });
  };
  const sw = () => sc.projectRadius(L.body, 1) * 0.6; // (une demi-largeur de corps à l'écran)

  function rub(p) {
    if (ctx.done || pause > 0) return;
    if (!last) {
      last = p;
      return;
    }
    const dx = p.x - last.x;
    const dy = p.y - last.y;
    const d = Math.hypot(dx, dy);
    if (d < STEP) return;
    const dir = Math.atan2(dy, dx);
    let turn = 0;
    if (lastDir !== null) {
      let dd = dir - lastDir;
      while (dd > Math.PI) dd -= Math.PI * 2;
      while (dd < -Math.PI) dd += Math.PI * 2;
      turn = Math.min(Math.abs(dd), 0.9);
    }
    rot = lerp(rot, clamp(dx / 40, -0.5, 0.5), 0.3);
    const seg = { x0: last.x, y0: last.y, x1: p.x, y1: p.y, dx, dy, d, turn };
    const st = stage();
    touch = st === 'hoof' ? null : sc.pickAnimal(p.x, p.y);
    if (st === 'curry') rubCurry(seg, p);
    else if (st === 'brush') rubBrush(seg, p);
    else if (st === 'hoof') pick(seg, p);
    else comb(seg, p);
    last = p;
    lastDir = dir;
    if (st === 'hoof') ctx.progress(value() / MAX);
    else rule.show(value());
    if (value() >= MAX) endStage();
  }

  function overdo(seg, p, onCoat, rate = 0.0002) {
    if (!onCoat || value() < rule.lo) return;
    const free = Math.min(grace, seg.d);
    grace -= free;
    over += (seg.d - free) * rate;
    if (value() > rule.hi && over >= nextMark) {
      nextMark = over + 0.06;
      fx.float(p.x, p.y - 20, '💢', 20);
      annoyed = 0.8;
      m.annoyed = 0.8;
    }
  }

  const onBody = () => !!touch && (BODY.has(touch.region) || touch.region === 'neck');
  const bony = () => !!touch && (touch.region === 'head' || touch.region === 'leg');

  function rubCurry(seg, p) {
    let touched = false;
    for (const q of mud) {
      if (q.mud <= 0 || !near(place(q), seg, 12)) continue;
      touched = true;
      q.mud -= seg.turn * 0.085 + seg.d * 0.0008;
      q.mesh.material.opacity = 0.35 + 0.65 * Math.max(0, q.mud);
      crumbs(p, 'rgba(110, 80, 50, 0.65)');
      if (q.mud <= 0.12) {
        q.mud = 0;
        q.dust = 1;
        q.mesh.material.map = dustTex;
        q.mesh.material.needsUpdate = true;
        q.mesh.material.opacity = 1;
        fx.burst(q.x, q.y, '💨', 3, { speed: 70, size: 16 });
      }
    }
    if (touched) {
      grace = 2 * sw();
      if (seg.turn > 0.15) goodLen += seg.d;
      else badLen += seg.d;
      if (rule.state() === 'low') {
        if (badLen > 220 && badLen > goodLen * 1.5) ctx.hint(t('mg_pansage_curry_round'), 'warn');
        else if (goodLen > 120 && goodLen > badLen) ctx.hint(t('mg_pansage_curry_good'), 'good');
      }
    } else if (bony()) {
      over += seg.d * 0.0004;
      annoyed = 0.8;
      m.annoyed = 0.8;
      if (over >= nextMark) {
        nextMark = over + 0.04;
        fx.float(p.x, p.y - 18, '💢', 20);
      }
      if (!saidBony || over > 0.02) {
        saidBony = true;
        ctx.hint(t('mg_pansage_curry_bony'), 'warn');
      }
    } else overdo(seg, p, onBody());
  }

  function rubBrush(seg, p) {
    const withHair = -seg.dx > seg.d * 0.35; // (la tête est à droite : vers la queue, c'est vers la gauche)
    const down = seg.dy > seg.d * 0.35;
    let touched = false;
    let good = false;
    let onLeg = false;
    for (const q of dust) {
      if (q.dust <= 0 || !near(place(q), seg, 14)) continue;
      touched = true;
      const ok = q.leg ? down : withHair;
      good = good || ok;
      onLeg = onLeg || !!q.leg;
      q.dust -= seg.d * 0.0062 * (ok ? 1 : 0.55) * (q.leg ? 0.67 : 1);
      q.mesh.material.opacity = Math.max(0, Math.min(1, q.dust * 1.15));
      crumbs(p, 'rgba(150, 120, 90, 0.6)');
      if (q.dust <= 0.15) {
        q.dust = 0;
        q.mesh.visible = false;
        fx.burst(q.x, q.y, '✨', 3, { speed: 80, size: 16 });
        if (q.leg && ctx.opts?.legMudTip && !ctx.opts.out?.legMudTip && legs.every((o) => o.dust <= 0)) {
          ctx.opts.out = { ...(ctx.opts.out ?? {}), legMudTip: true };
        }
      }
    }
    if (touched) {
      grace = 2 * sw();
      if (good) goodLen += seg.d;
      else badLen += seg.d;
      if (rule.state() === 'low') {
        if (badLen > 260 && badLen > goodLen) ctx.hint(t(onLeg ? 'mg_pansage_legmud' : 'mg_brush_dir'), 'warn');
        else if (good && goodLen > 120) ctx.hint(t('mg_brush_good'), 'good');
      }
    } else overdo(seg, p, onBody());
  }

  function pick(seg, p) {
    const hf = hooves[foot];
    if (!hf || !hf.sole || !footReady()) return;
    const sole = hf.sole;
    if (sole.inFrog(p.x, p.y) && ctx.time - pokeAt > 0.6) {
      pokeAt = ctx.time;
      over += 0.04;
      annoyed = 0.8;
      m.annoyed = 0.9;
      sc.shake = 0.4;
      fx.float(p.x, p.y - 20, '💢', 22);
      ctx.hint(t('mg_pansage_hoof_frog'), 'warn');
      return;
    }
    const toe = sole.toeDir();
    const toToe = (seg.dx * toe.x + seg.dy * toe.y) > seg.d * 0.35;
    let touched = false;
    for (let i = 0; i < hf.blobs.length; i++) {
      const q = hf.blobs[i];
      if (q.dirt <= 0) continue;
      const sp = sole.blobScreen(i);
      q.x = sp.x;
      q.y = sp.y;
      q.rr = sp.r;
      if (!near(q, seg, 8)) continue;
      touched = true;
      q.dirt -= seg.d * 0.016 * (toToe ? 1 : 0.3);
      sole.setDirt(i, Math.max(0, q.dirt / q.hard));
      crumbs(p, 'rgba(80, 58, 38, 0.75)');
      if (q.dirt <= 0.12) {
        q.dirt = 0;
        sole.setDirt(i, 0);
        if (q.stone) {
          stoneOut = true;
          sole.popStone(i);
          fx.text(q.x, q.y - 30, t(lame ? 'mg_pansage_hoof_stoneLame' : 'mg_pansage_hoof_stone', { name }), '#2f8a5f', 20);
        } else fx.burst(q.x, q.y, '✨', 2, { speed: 60, size: 14 });
      }
    }
    if (touched) {
      if (toToe) goodLen += seg.d;
      else badLen += seg.d;
      if (badLen > 140 && badLen > goodLen) {
        ctx.hint(t('mg_pansage_hoof_dir'), 'warn');
        badLen = 0;
        goodLen = 0;
      }
    }
    if (hf.blobs.every((q) => q.dirt <= 0)) {
      footDoneAt = ctx.time;
      const c = sole.center();
      fx.burst(c.x, c.y, '✨', 5, { speed: 110, size: 16 });
    }
  }

  function comb(seg, p) {
    const down = seg.dy > seg.d * 0.3;
    let touched = false;
    for (const q of knots) {
      if (q.tangle <= 0) continue;
      place(q, 0.06 * S);
      if (distToSegment(q.x, q.y, seg.x0, seg.y0, seg.x1, seg.y1) > q.rr + 12) continue;
      touched = true;
      q.tangle -= seg.d * (down ? 0.014 : 0.004);
      q.mesh.scale.setScalar(0.06 * S * (0.35 + 0.65 * Math.max(0, q.tangle)));
      if (q.tangle <= 0.12) {
        q.tangle = 0;
        q.mesh.visible = false;
        fx.burst(q.x, q.y, '✨', 3, { speed: 70, size: 14 });
      }
    }
    if (touched) {
      grace = 120;
      if (down) goodLen += seg.d;
      else badLen += seg.d;
      if (rule.state() === 'low') {
        if (badLen > 120 && badLen > goodLen) ctx.hint(t('mg_pansage_comb_dir'), 'warn');
        else if (down && goodLen > 80) ctx.hint(t('mg_pansage_comb_good'), 'good');
      }
    } else overdo(seg, p, !!touch && (touch.region === 'neck' || touch.region === 'tail' || touch.region === 'mane'), 0.0004);
  }

  startStage(0);

  // ---------------------------------------------------------------- l'outil en 3D
  const toolPos = v3();
  function showTool(dt) {
    const st = stage();
    const key = toolOf[st];
    const pp = ctx.pointer;
    for (const [k, tl] of Object.entries(tools)) if (k !== key) tl.visible = false;
    const tl = tools[key];
    if (!tl || ctx.done || pause > 0 || !(pp.down || pp.over)) {
      if (tl) tl.visible = false;
      return;
    }
    let p = null;
    let n = null;
    if (st === 'hoof') {
      const h = hooves[foot]?.sole?.pickSole(pp.x, pp.y);
      if (h) {
        p = h.point;
        n = h.normal;
      }
    } else {
      const h = pp.down && touch ? touch : sc.pickAnimal(pp.x, pp.y);
      if (h) {
        p = h.point;
        n = h.normal;
      }
    }
    if (!p) {
      // hors du cheval : l'outil flotte sous le doigt, devant lui
      p = sc.pointAtDepth(pp.x, pp.y, sc.camera.position.distanceTo(sc.camTarget) * 0.8);
      n = sc.camera.position.clone().sub(p).normalize();
    }
    toolPos.copy(p).addScaledVector(n, pp.down ? 0.005 : 0.05);
    tl.position.lerp(toolPos, tl.visible ? Math.min(1, dt * 25) : 1);
    // (le dos de l'outil vers nous, le dessous contre le poil ; il penche dans le sens du geste)
    tl.quaternion.setFromUnitVectors(v3(0, 1, 0), n);
    tl.rotateY(rot * 1.5 + (st === 'curry' ? ctx.time * (pp.down ? 6 : 0) : 0));
    tl.visible = true;
  }

  return {
    peek: () => ({
      stage: stage(), si, value: value(), lo: rule.lo, hi: rule.hi, max: MAX, over, pause, three: true,
      results: results.map((r) => ({ ...r })),
      mud: mud.filter((q) => q.mud > 0).map((q) => ({ x: place(q).x, y: q.y, r: q.rr, mud: q.mud })),
      dust: dust.filter((q) => q.dust > 0).map((q) => ({ x: place(q).x, y: q.y, r: q.rr, dust: q.dust, leg: !!q.leg })),
      foot: PANSAGE_FEET[foot] ?? null, footIndex: foot, footReady: stage() === 'hoof' && footReady(),
      blobs: (hooves[foot]?.blobs ?? []).map((q, i) => ({ q, i })).filter(({ q }) => q.dirt > 0).map(({ q, i }) => {
        const sp = hooves[foot].sole.blobScreen(i);
        return { x: sp.x, y: sp.y, r: sp.r, dirt: q.dirt, stone: !!q.stone };
      }),
      frog: hooves[foot]?.sole ? hooves[foot].sole.frogScreen() : null,
      frogOk: hooves[foot]?.sole ? (() => { const f = hooves[foot].sole.frogScreen(); return hooves[foot].sole.inFrog(f.x, f.y); })() : null,
      toe: hooves[foot]?.sole ? hooves[foot].sole.toeDir() : null,
      sole: hooves[foot]?.sole ? { ...hooves[foot].sole.where(), cam: sc.camera.position.toArray().map((x) => +x.toFixed(3)), lift: m.liftAmt } : null,
      knots: knots.filter((q) => q.tangle > 0).map((q) => {
        place(q, 0.06 * S);
        return { x: q.x, y: q.y, r: q.rr, tangle: q.tangle, part: q.part };
      }),
    }),
    down(p) {
      last = p;
      lastDir = null;
      touch = stage() === 'hoof' ? null : sc.pickAnimal(p.x, p.y);
    },
    move(p, isDown) { if (isDown) rub(p); },
    up() {
      last = null;
      lastDir = null;
      grace = 0;
    },
    key(code, isDown) { if (isDown && (code === 'Space' || code === 'Enter' || code === 'NumpadEnter')) endStage(); },
    update(dt) {
      annoyed = Math.max(0, annoyed - dt);
      if (pause > 0) {
        pause -= dt;
        if (pause <= 0) {
          pause = 0;
          startStage(si + 1);
        }
      } else if (stage() === 'hoof' && footDoneAt >= 0 && ctx.time - footDoneAt > 0.7 && !ctx.done) {
        // Pied propre : il le repose, on passe au suivant (puis à l'étape suivante après le dernier).
        if (foot < hooves.length - 1) {
          foot++;
          footAt = ctx.time;
          footDoneAt = -1;
          badLen = 0;
          goodLen = 0;
          m.lift = LEG_OF[PANSAGE_FEET[foot]];
          m.liftAmt = 0;
          frameHoof();
          ctx.hint(t('mg_pansage_hoof_next', { foot: t(`mg_pansage_foot_${PANSAGE_FEET[foot]}`) }), 'good');
        } else {
          footDoneAt = -1;
          endStage();
        }
      }
      // Le cheval : oreilles en avant, il tourne la tête vers nous ; couchées si ça fait mal ou si c'est trop.
      const zone = rule ? (value() < rule.lo ? 'low' : value() > rule.hi ? 'high' : 'just') : 'low';
      m.ears = zone === 'high' ? 'back' : 'forward';
      if (zone === 'high') m.annoyed = Math.max(m.annoyed, 0.2);
      m.look = sc.camera.position;
      m.lookAmt = stage() === 'comb' ? 0.2 : 0.45;
      // (pied levé : la caméra suit la sole, doucement au début du geste, puis de près)
      if (stage() === 'hoof' && pause <= 0) frameHoof(ctx.time - footAt < 1.2 ? 0.55 : 0.2);
      if (stage() === 'comb' && pause <= 0) frameComb();
      showTool(dt);
    },
    draw(g) {
      if (!sc.ready) return;
      const v = ctx.view;
      const st = stage();
      const val = value();
      // Flèches du sens du geste (étape brosse) au-dessus des taches qui restent.
      if (st === 'brush' && pause <= 0) {
        g.save();
        g.globalAlpha = 0.5 + Math.sin(ctx.time * 3) * 0.2;
        g.font = '900 20px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#ffffff';
        g.strokeStyle = 'rgba(60,40,20,0.5)';
        g.lineWidth = 3;
        for (const q of dust) {
          if (q.dust <= 0) continue;
          place(q);
          const s = q.leg ? '↓' : '‹‹';
          g.strokeText(s, q.x, q.y - q.rr - 10);
          g.fillText(s, q.x, q.y - q.rr - 10);
        }
        g.restore();
      }
      if (st === 'comb' && pause <= 0 && !ctx.done) {
        // les nœuds qui restent : un rond qui pulse, et le sens du peigne
        g.save();
        g.lineWidth = 3;
        g.setLineDash([5, 5]);
        g.font = '900 18px system-ui, sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        for (const q of knots) {
          if (q.tangle <= 0) continue;
          place(q, 0.06 * S);
          const r = q.rr + 6 + Math.sin(ctx.time * 5) * 2;
          g.strokeStyle = 'rgba(255,255,255,0.85)';
          g.beginPath();
          g.arc(q.x, q.y, r, 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = '#ffffff';
          g.strokeStyle = 'rgba(60,40,20,0.5)';
          g.setLineDash([]);
          g.strokeText('↓', q.x + r + 10, q.y);
          g.fillText('↓', q.x + r + 10, q.y);
          g.setLineDash([5, 5]);
        }
        g.restore();
      }
      if (st === 'hoof' && pause <= 0) {
        // talon → pince : la flèche du bon sens, à côté du pied
        const sole = hooves[foot]?.sole;
        if (sole && footReady()) {
          const c = sole.center();
          const d = sole.toeDir();
          g.save();
          g.globalAlpha = 0.55 + Math.sin(ctx.time * 4) * 0.2;
          g.strokeStyle = '#ffffff';
          g.lineWidth = 4;
          g.lineCap = 'round';
          const ox = -d.y * 70;
          const oy = d.x * 70;
          g.beginPath();
          g.moveTo(c.x + ox - d.x * 40, c.y + oy - d.y * 40);
          g.lineTo(c.x + ox + d.x * 40, c.y + oy + d.y * 40);
          g.lineTo(c.x + ox + d.x * 28 - d.y * 8, c.y + oy + d.y * 28 + d.x * 8);
          g.moveTo(c.x + ox + d.x * 40, c.y + oy + d.y * 40);
          g.lineTo(c.x + ox + d.x * 28 + d.y * 8, c.y + oy + d.y * 28 - d.x * 8);
          g.stroke();
          g.restore();
        }
      }
      // La pastille de l'étape en haut, le cadran de la jauge, les quatre outils en bas (comme le jeu dessiné).
      if (ctx.done) return;
      g.save();
      g.translate(0, v.y0 + 4);
      if (rule && pause <= 0) rule.dial(g, val, Math.min(354, v.x1 - 32));
      drawStagePill(g, si, stageName(), st === 'hoof' && pause <= 0 ? foot : -1, t);
      g.restore();
      g.save();
      g.translate(0, v.y1 - 360 - 2);
      drawTray(g, si, results, pause > 0, ctx.time);
      g.restore();
    },
    destroy() {
      for (const tl of Object.values(tools)) tl.parent?.remove(tl);
      for (const q of [...mud, ...dust, ...knots]) q.mesh?.parent?.remove(q.mesh);
      for (const hf of hooves) hf.sole?.remove();
      for (const x of keep) x.dispose?.();
    },
  };
}

/** Région d'après le nom de l'os (voir stage.regionOf, ici pour les points tirés au début). */
function regionFor(bone = '') {
  if (/^Head|^Ear/.test(bone)) return 'head';
  if (/^Neck|^Mane/.test(bone)) return 'neck';
  if (/^Tail/.test(bone)) return 'tail';
  if (/^(F|H)(L|R)[34]$/.test(bone)) return 'leg';
  if (/^F(L|R)[12]$/.test(bone)) return 'shoulder';
  if (/^H(L|R)[12]$/.test(bone)) return 'hip';
  return 'body';
}

/**
 * Où accrocher un nœud : dans la crinière (le long de la crête, un peu sous elle, côté caméra), ou dans la queue
 * (le long des crins qui pendent). k : 0 en haut, 1 en bas.
 */
function knotSpot(sc, part, k) {
  const md = sc.model;
  const S = sc.double.scale;
  if (part === 'mane' && md.braidSpots?.crest?.length && md.neck) {
    const list = md.braidSpots.crest;
    const at = list[Math.min(list.length - 1, Math.round((1 - k) * (list.length - 1)))];
    const p = md.neck.localToWorld(at[0].clone()).add(v3(0, -0.14 * S, 0.17 * S));
    return { p, bone: md.neck };
  }
  if (part === 'tail' && md.tailTip) {
    const dock = sc.marks.tail;
    const tip = md.tailTip.localToWorld(v3(0, -0.62, 0));
    const p = dock.clone().lerp(tip, 0.25 + 0.7 * k).add(v3(0, 0, 0.07 * S));
    return { p, bone: md.tailTip };
  }
  const p = (part === 'mane' ? sc.marks.withers.clone().lerp(sc.marks.poll, k) : sc.marks.tail.clone()).add(v3(0, -0.1, 0.08));
  return { p, bone: sc.holder };
}

/** Un nœud de crins : une petite pelote bosselée et emmêlée. */
function knotGeometry() {
  const geo = new THREE.IcosahedronGeometry(1, 2);
  const p = geo.attributes.position;
  const r = seeded(4);
  for (let i = 0; i < p.count; i++) {
    const k = 0.75 + r() * 0.45;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 1.3, p.getZ(i) * k * 0.8);
  }
  geo.computeVertexNormals();
  return geo;
}

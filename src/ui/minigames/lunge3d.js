// La longe et la liberté en 3D : le vrai cheval du joueur dans le rond de longe (src/game/care/roundPen.js), l'enfant
// (son avatar) au milieu. La logique est celle des jeux dessinés (horse.js lungeGame et libertyGame, par withLogic) :
// mêmes consignes, mêmes boutons, même jauge des allures, même règle « juste ce qu'il faut », même note.
//
// - LONGE : le cheval tourne à main gauche sur la piste, à ses vraies allures (pas, trot, galop : celles du modèle,
//   choisies par sa vitesse), à la vitesse donnée par la logique : chaque bande de la jauge des allures tombe sur
//   l'allure du même nom (voir lungeSpeed). Sa position avance exactement de la vitesse que joue l'animation : les
//   sabots ne glissent pas. Il plie l'encolure vers l'intérieur (il regarde l'enfant) ; quand elle parle (🐢, ✨),
//   son oreille du dedans se tourne vers elle. L'enfant marche un petit cercle au milieu, la longe dans la main
//   gauche jusqu'à l'anneau du licol, la chambrière dans la main droite vers les hanches (elle claque sur ✨).
// - LIBERTÉ : le même rond, sans longe. Le plan du jeu dessiné (le manège de 400 × 360) est posé à plat sur le sable,
//   sa piste sur la piste du rond : le doigt sur le sable → le point du sol sous lui → le point du plan, c'est là que
//   l'enfant va (en courant). La zone verte (derrière l'épaule du cheval) et le cercle orange (trop près) sont peints
//   sur le sable. À l'appel, il vient vers elle et s'arrête devant elle.
// - L'anneau « juste ce qu'il faut » est peint sur le sable, entre la piste et la clôture ; la jauge des allures reste
//   dessinée par-dessus, en bas de l'image (la scène se cadre au-dessus d'elle).
//
// Le décor : la scène de soin est construite avec le box ; ces jeux le cachent, posent le rond à sa place le temps de
// la séance, et rendent le box en partant (comme la balle de la chèvre dans le pré : goatPlay3d.js).

import * as THREE from 'three';
import { lungeGame, libertyGame, drawGaitGauge, GAIT_GAUGE, ARENA_PLAN, GAITS } from './horse.js';
import { withLogic, bubble } from './care3d.js';
import { label, emoji, clamp } from './draw.js';
import { roundPenSet, penSize } from '../../game/care/roundPen.js';
import { ease } from '../../game/care/stage.js';
import { buildAvatar, animateAvatarWalk, updateAvatarLife, armIK } from '../../game/models/avatarModel.js';
import { rootToTorso } from '../../game/models/avatarRig.js';
import { disposeModel } from '../../game/models/animalModel.js';
import { lungeWhip, ribbon, sagPoints } from '../../game/models/vaultingProps.js';
import { buildGear, removeGear } from '../../game/gearModels.js';
import { stageLook } from '../../sim/animal.js';
import { DEFAULT_AVATAR } from '../../sim/profile.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const TAU = Math.PI * 2;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const _v = V();
const _w = V();
const _p = V();

// ---------------------------------------------------------------- logique pure (tests/manege3d-*.test.js)

/**
 * Vitesse de la longe (logique : 0 à 100) → vitesse du modèle, en « vitesse de référence » (m/s d'un cheval de taille
 * 1 aux allures du modèle d'origine ; pickGait de horseReal.js choisit l'allure sur cette échelle : trot au-dessus de
 * 2,15, galop au-dessus de 3,9 ; retour au pas sous 1,85, au trot sous 3,55). Chaque bande de la jauge tombe nettement
 * dans l'allure du même nom, au-delà des seuils (pas de va-et-vient) : pas 0,95 → 1,8 ; trot 2,35 → 3,45 ;
 * galop 4,0 → 5,6. Sous la bande du pas, il marche lentement, puis s'arrête (v < 3).
 */
export function lungeSpeed(v) {
  const [w0, w1] = GAITS.walk;
  const [t0, t1] = GAITS.trot;
  const [c0, c1] = GAITS.canter;
  const lin = (x, a, b, ya, yb) => ya + ((clamp(x, a, b) - a) / (b - a)) * (yb - ya);
  if (!(v >= 3)) return 0;
  if (v < w0) return lin(v, 3, w0, 0.6, 0.95);
  if (v < t0) return lin(v, w0, t0, 0.95, 1.8);
  if (v < c0) return lin(v, t0, c0, 2.35, 3.45);
  return lin(v, c0, Math.max(c1, 100), 4.0, 5.6);
}

/** Allure de la jauge (pas, trot, galop) pour une vitesse de la logique, ou null sous la bande du pas. */
export function bandOf(v) {
  for (const [id, [lo, hi]] of Object.entries(GAITS)) if (v >= lo && (v < hi || id === 'canter')) return id;
  return null;
}

/**
 * Le plan du jeu dessiné posé sur le sable : (x, y) du manège dessiné ↔ point du sol (repère monde, centre du rond à
 * l'origine). La piste du dessin (rayon ARENA_PLAN.path) tombe sur la piste du rond (rayon R).
 */
export function penPlan(R) {
  const k = R / ARENA_PLAN.path;
  return {
    k,
    toWorld: (x, y, out = V()) => out.set((x - ARENA_PLAN.x) * k, 0, (y - ARENA_PLAN.y) * k),
    toLogic: (P) => ({ x: ARENA_PLAN.x + P.x / k, y: ARENA_PLAN.y + P.z / k }),
  };
}

/** Cap (rotation y d'un cheval qui regarde vers +z) d'un déplacement (dx, dz). */
export const headingOf = (dx, dz) => Math.atan2(dx, dz);

// ---------------------------------------------------------------- le rond, l'enfant, la caméra (commun aux deux jeux)

/** L'anneau de la longe : l'anneau du filet du côté du dedans, sinon celui du licol sous le menton, sinon le menton. */
function lungeAttach(sc, inner) {
  const md = sc.model;
  const gear = sc.double.gear;
  const reins = gear?.userData?.reins;
  if (reins?.points?.length) {
    const pt = reins.points.find((p) => Math.sign(p.x) === inner) ?? reins.points[0];
    return (out) => reins.parent.localToWorld(out.copy(pt));
  }
  const under = (o) => {
    for (let p = o; p; p = p.parent) if (p === md.head) return true;
    return false;
  };
  let ring = null;
  for (const m of gear?.userData?.meshes ?? []) {
    if (m.geometry?.type === 'TorusGeometry' && under(m)) ring = m;
  }
  if (ring) return (out) => ring.getWorldPosition(out);
  const snout = md.dims?.snoutZ ?? 0.5;
  return (out) => (md.head ? md.head.localToWorld(out.set(0, -0.16 * snout, 0.72 * snout)) : out.copy(sc.marks.muzzle));
}

/**
 * Prépare la séance : le rond à la place du box, l'enfant au milieu, la caméra. kind : 'lunge' | 'liberty'.
 * Renvoie l'outillage commun (voir plus bas) ; rig.destroy() rend le box et libère tout.
 */
function penRig(ctx, kind) {
  const sc = ctx.scene;
  const md = sc.model;
  const scale = sc.double.scale;
  const ss = md.speedScale ?? 1;
  const M = sc.marks;
  // (longueur du nez à la pointe des fesses, pose de photo : il regarde vers +x)
  const Lb = Math.max(0.5, M.muzzle.x - M.tail.x);
  const withers = Math.max(0.4, M.withers.y);
  const u = withers / 1.42;
  const { R, F } = penSize({ L: Lb, ss, scale });
  const plan = penPlan(R);
  const disp = [];
  const keep = (x) => {
    disp.push(x);
    return x;
  };

  // le rond à la place du box (rendu à la fin)
  const stall = sc.decor;
  const before = { bg: sc.scene.background, fog: sc.scene.fog, env: sc.scene.environmentIntensity };
  if (stall?.group) sc.scene.remove(stall.group);
  const pen = roundPenSet(sc, { R, F, u, L: Lb });
  pen.sky(sc);
  sc.decor = pen;
  sc.scene.add(pen.group);

  // l'enfant : son avatar (ses couleurs, sa coiffure)
  const look = sc.game?.profile?.avatar ?? DEFAULT_AVATAR;
  const kid = buildAvatar(look, 31);
  kid.root.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  sc.scene.add(kid.root);
  const kidLife = { speed: 0, riding: false, carry: false, busy: true, noGestures: true };
  let kidPhase = 0;

  // l'anneau « juste ce qu'il faut », peint sur le sable entre la piste et la clôture
  const trackW = pen.dims.trackW;
  const r0 = Math.min(F - 0.25, R + trackW / 2 + 0.12);
  const r1 = Math.min(F - 0.12, r0 + 0.12 + 0.12 * u);
  const ringGeo = keep(new THREE.RingGeometry(r0, r1, 160, 1));
  ringGeo.rotateX(-Math.PI / 2);
  const ringK = [];
  {
    const p = ringGeo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      // (part du tour, depuis le haut de l'image, dans le sens des aiguilles d'une montre vu d'en haut : comme le dessin)
      const phi = Math.atan2(p.getZ(i), p.getX(i));
      ringK.push((((phi + Math.PI / 2) / TAU) % 1 + 1) % 1);
    }
    ringGeo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(p.count * 4), 4));
  }
  const ring = new THREE.Mesh(ringGeo, keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, toneMapped: false })));
  ring.position.y = 0.012;
  ring.renderOrder = 2;
  sc.scene.add(ring);
  let ringAt = null;
  const WHITE = [1, 1, 1, 0.32];
  const GREEN = [0.25, 0.68, 0.38, 0.95];
  const BLUE = [0.24, 0.48, 0.85, 1];
  /** L'anneau : rempli en bleu jusqu'au travail fait, la zone juste en vert. */
  function paintRing(value, lo, hi, max) {
    const key = `${value.toFixed(2)}|${lo}|${hi}|${max}`;
    if (key === ringAt) return;
    ringAt = key;
    const col = ringGeo.attributes.color;
    for (let i = 0; i < ringK.length; i++) {
      const w = ringK[i] * max;
      const c = w <= value && value > 0 ? BLUE : w >= lo && w <= hi ? GREEN : WHITE;
      col.setXYZW(i, c[0], c[1], c[2], c[3]);
    }
    col.needsUpdate = true;
  }
  /** Où dessiner le ✓ de la zone juste (espace du cadre). */
  const checkAt = (lo, hi, max) => {
    const phi = -Math.PI / 2 + ((lo + hi) / 2 / max) * TAU;
    return sc.project(_v.set(Math.cos(phi) * (r1 + 0.35 * u + 0.1), 0.02, Math.sin(phi) * (r1 + 0.35 * u + 0.1)));
  };

  // l'oreille du dedans vers l'enfant quand elle parle (ou qu'elle le pousse, en liberté)
  let earK = 0;
  let earT = 0;
  const earHook = (dt) => {
    earK += ((earT > 0 ? 1 : 0) - earK) * Math.min(1, dt * 6);
    earT = Math.max(0, earT - dt);
    if (earK < 0.02 || !md.ears?.length) return;
    const kp = kid.root.getWorldPosition(_p);
    let best = null;
    let bd = Infinity;
    for (const e of md.ears) {
      const d = e.getWorldPosition(_w).distanceToSquared(kp);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    // (le pavillon tourne vers le côté de l'oreille, un peu vers l'arrière : il écoute sur le côté)
    const s = best.position.x >= 0 ? 1 : -1;
    best.rotateY(s * 1.15 * earK);
    best.rotateX(-0.22 * earK);
  };
  (sc.afterLife ??= []).push(earHook);

  // Les sabots posés restent où ils sont posés. Les allures du modèle sont faites pour marcher droit : sur un cercle,
  // le corps tourne pendant l'appui, et un sabot posé à 60 cm du milieu du corps glissait de côté (ω × 0,6 m : 13 cm
  // par appui au trot). Pendant l'appui, chaque membre pivote un peu à l'épaule (ou à la hanche) pour garder son sabot
  // à l'endroit où il s'est posé ; levé, la correction s'efface en l'air. (Au-delà d'un cinquième de la longueur du
  // membre — un pivot sur place —, le sabot fait un petit pas.)
  const pins = (md.legs ?? []).map((l) => ({ on: false, P: V(), off: V(), cool: 0, z: null, len: Math.max(0.3, (l.kneeRest?.y ?? 0.6) * 1.6) * scale }));
  const _J = V();
  const _H = V();
  const _a = V();
  const _b = V();
  const _qw = new THREE.Quaternion();
  const _qp = new THREE.Quaternion();
  let lastPos = null;
  let lastRot = 0;
  const pinStats = { drops: 0 };
  const pinHook = (dt) => {
    if (!md.legs?.length || !(dt > 0)) {
      md.skeleton?.update();
      return;
    }
    const hp = sc.holder.position;
    const rot = sc.holder.rotation.y;
    const moved = lastPos ? Math.hypot(hp.x - lastPos.x, hp.z - lastPos.z) / dt + Math.abs(wrap(rot - lastRot)) / dt : 0;
    lastPos = (lastPos ?? V()).copy(hp);
    lastRot = rot;
    const active = moved > 0.02;
    sc.holder.updateMatrixWorld(true);
    const lift = 0.05 * scale;
    for (let i = 0; i < md.legs.length; i++) {
      const l = md.legs[i];
      const pin = pins[i];
      let low = Infinity;
      _H.set(0, 0, 0);
      for (const q of l.solePts) {
        _v.copy(q).applyMatrix4(l.fetlock.matrixWorld);
        _H.add(_v);
        low = Math.min(low, _v.y);
      }
      _H.divideScalar(l.solePts.length);
      pin.cool = Math.max(0, pin.cool - dt);
      // (en appui, le sabot recule sous le corps ; levé, il avance : c'est ce qui dit l'appui, pas sa hauteur — au pas
      // lent, un sabot de poney ou de cheval de trait ne se lève que de quelques centimètres)
      const z = sc.holder.worldToLocal(_a.copy(_H)).z;
      const back = pin.z !== null && z < pin.z;
      pin.z = z;
      const down = active && low < lift && back && pin.cool <= 0;
      if (down && !pin.on) {
        pin.on = true;
        pin.P.copy(_H).add(pin.off);
      } else if (!down && pin.on) pin.on = false;
      if (pin.on) {
        pin.off.set(pin.P.x - _H.x, 0, pin.P.z - _H.z);
        if (pin.off.length() > pin.len * 0.3) {
          pin.on = false;
          pin.cool = 0.25;
          pinStats.drops++;
        }
      }
      if (!pin.on) pin.off.multiplyScalar(1 - ease(dt, 0.05));
      if (pin.off.lengthSq() < 1e-8) continue;
      // (le membre pivote à son sommet : le sabot se déplace de off)
      l.top.getWorldPosition(_J);
      _a.subVectors(_H, _J);
      _b.copy(_a).add(pin.off);
      _qw.setFromUnitVectors(_a.normalize(), _b.normalize());
      l.top.parent.getWorldQuaternion(_qp);
      _qw.premultiply(_qp.clone().invert()).multiply(_qp);
      l.top.quaternion.premultiply(_qw);
      l.top.updateMatrixWorld(true);
    }
    // Le squelette du pelage, remis à jour ici, à chaque image. three.js le met à jour une fois par image… en le
    // comptant à la passe des ombres de l'image d'avant ; en qualité basse, la scène ne refait ses ombres qu'une image
    // sur deux (stage.js render) : une image sur deux, le cheval était dessiné avec les os de l'image précédente,
    // en retard sur son licol et sa longe (50 cm au galop dans un navigateur lent : le licol flottait devant le nez).
    md.skeleton?.update();
  };
  sc.afterLife.push(pinHook);

  // Un licol le temps de la longe, s'il n'a ni licol ni filet (on ne longe pas un cheval tête nue).
  let tmpGear = null;
  if (kind === 'lunge' && !ctx.a?.gear?.halter && !ctx.a?.gear?.bridle && md.head) {
    try {
      tmpGear = buildGear(md, stageLook(ctx.a), { halter: { item: 'halter', color: 'blue' } });
      sc.holder.traverse((o) => {
        if (o.isMesh) o.castShadow = o.castShadow !== false;
      });
    } catch {
      tmpGear = null;
    }
  }
  const prevGear = sc.double.gear;
  if (tmpGear) sc.double.gear = tmpGear;

  // ---------------------------------------------------------------- caméra
  let shape = '';
  let framed = false;
  /** Haute, de trois quarts : toute la piste et le cheval entier (la tête aussi) partout sur le cercle. */
  function frameCamera(now = false) {
    const w = sc.size.w;
    const h = sc.size.h;
    const v = ctx.view;
    // (la jauge des allures dessinée en bas : la scène se cadre au-dessus d'elle)
    const gaugeTop = kind === 'lunge' ? (GAIT_GAUGE.top + gaugeDy()) * v.scale + v.oy - 6 : h - 34 * v.scale;
    const key = `${w}x${h}|${Math.round(gaugeTop)}|${ctx.done ? 1 : 0}`;
    if (key === shape && !now) return;
    shape = key;
    if (!ctx.done) sc.setFocus(0, Math.min(h, gaugeTop));
    const fh = !ctx.done && sc.focus ? sc.focus.bottom - sc.focus.top : h;
    const portrait = w / Math.max(1, fh) < 1.05;
    const top = withers * 1.35;
    const pts = [];
    // (le cheval partout sur la piste : son nez et ses fesses, au sol et à hauteur des oreilles)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU;
      const c = V(Math.cos(a) * R, 0, Math.sin(a) * R);
      const tg = V(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(Lb * 0.55);
      const out = V(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.3 * u);
      for (const s of [1, -1]) {
        const p = c.clone().addScaledVector(tg, s).add(out);
        pts.push(p, p.clone().setY(top));
      }
    }
    pts.push(V(0, 1.75, 0));
    // (le premier cadrage à la vraie taille de la toile : sans fondu)
    const first = !framed && w > 2;
    if (w > 2) framed = true;
    sc.frame(pts, { dir: portrait ? [0, 0.78, 1] : [0, 0.62, 1], pad: 1.03, now: now || first || !sc.ready });
  }
  /** Décalage de la jauge des allures vers le bas de la scène (espace du cadre). */
  const gaugeDy = () => Math.max(0, (ctx.view?.y1 ?? 360) - 8 - GAIT_GAUGE.bottom);

  // ---------------------------------------------------------------- l'enfant
  const kidPos = V(0, 0, 0);
  let kidHeading = 0;
  /** L'enfant marche (ou court) vers goal, tournée vers face (cap), à la vitesse donnée (m/s). */
  function moveKid(dt, goal, face, run = 0) {
    const d = _v.subVectors(goal, kidPos).setY(0);
    const dist = d.length();
    // (elle rattrape son point : vite s'il est loin, comme une enfant qui court)
    const sp = dist < 1e-3 ? 0 : Math.min(dist / Math.max(dt, 1e-3), Math.max(run, 1.2, dist * 2.6), 6.5);
    if (dist > 1e-4) kidPos.addScaledVector(d.normalize(), Math.min(dist, sp * dt));
    kidHeading = wrap(kidHeading + wrap(face - kidHeading) * ease(dt, 0.18));
    kid.root.position.copy(kidPos);
    kid.root.rotation.y = kidHeading;
    // (ses pas : la part de son déplacement qui va vers l'avant)
    const along = sp * Math.max(0.35, Math.cos(wrap(Math.atan2(d.x, d.z) - kidHeading)));
    kidPhase += dt * along * 2.4;
    animateAvatarWalk(kid, kidPhase, sp > 0.05 ? along : 0);
    kidLife.speed = sp;
    updateAvatarLife(kid, dt, kidLife);
    kid.root.updateMatrixWorld(true);
    return sp;
  }
  /** Bras de l'enfant : main (0 gauche, 1 droite) vers un point du monde (à portée de bras). */
  function reach(i, P, pole, len = 0.5) {
    _p.copy(P);
    kid.root.worldToLocal(_p);
    const sh = _w.set(i === 0 ? 0.19 : -0.19, 1.2, 0.02);
    _p.sub(sh);
    if (_p.lengthSq() < 1e-6) _p.set(0, -1, 0.3);
    _p.normalize().multiplyScalar(len).add(sh);
    rootToTorso(kid, _p);
    armIK(kid, i, _p, pole, 1);
  }

  return {
    sc, md, R, F, Lb, u, scale, ss, plan, pen, kid, kidPos, keep,
    frameCamera, gaugeDy, paintRing, checkAt, moveKid, reach,
    get kidHeading() { return kidHeading; },
    listen(s = 1.8) { earT = Math.max(earT, s); },
    attach: lungeAttach(sc, 1),
    pinStats,
    /** Point de la tête de l'enfant (pour une bulle). */
    kidHead: (out = V()) => kid.head.localToWorld(out.set(0, 0.32, 0)),
    destroy() {
      sc.afterLife = (sc.afterLife ?? []).filter((f) => f !== earHook && f !== pinHook);
      sc.scene.remove(kid.root, ring);
      disposeModel(kid.root);
      for (const x of disp) x.dispose?.();
      if (tmpGear) {
        removeGear(tmpGear);
        sc.double.gear = prevGear;
      }
      // le box revient
      sc.scene.remove(pen.group);
      pen.dispose();
      sc.decor = stall;
      if (stall?.group) sc.scene.add(stall.group);
      sc.scene.background = before.bg;
      sc.scene.fog = before.fog;
      sc.scene.environmentIntensity = before.env;
      sc.setFocus(null);
      // le cheval revient à sa place, de profil, au repos
      sc.st.moving = false;
      sc.st.v = 0;
      sc.st.turn = 0;
      sc.mood.look = null;
      sc.mood.lookAmt = 0;
      sc.holder.position.set(0, 0, 0);
      sc.holder.rotation.y = Math.PI / 2;
      delete sc.pen;
    },
  };
}

/**
 * Un cadre dérivé : les boutons du jeu dessiné passent par lui (on sait quand l'enfant parle au cheval : 🐢, ✨).
 */
function speakingCtx(ctx, onSay) {
  const c = Object.create(ctx);
  c.button = (text, o = {}) => ctx.button(text, { ...o, onTap: (...args) => {
    const r = o.onTap?.(...args);
    onSay(text);
    return r;
  } });
  return c;
}

// ---------------------------------------------------------------- longe

export function lunge3dGame(ctx) {
  const rig = penRig(ctx, 'lunge');
  const { sc, md, R, Lb, u, scale, ss, kid } = rig;
  const m = sc.mood;
  let said = null; // { text, t } : la bulle de l'enfant
  let whipK = 0; // claquement de la chambrière (1 → 0)
  const say = (text) => {
    if (ctx.done) return;
    const fast = text.includes('✨');
    said = { text: fast ? ctx.t('mg_lunge_fast') : `${ctx.t('mg_lunge_slow')}…`, t: 1.3 };
    if (fast) whipK = 1;
    rig.listen();
  };
  const head = () => sc.holder.position.clone().add(V(0, Math.max(0.6, sc.marks.withers.y) * 1.05, 0));
  const anchor = () => sc.project(head());
  const logic = withLogic(speakingCtx(ctx, say), lungeGame, anchor);
  const FAST_KEYS = new Set(['ArrowUp', 'Space', 'ArrowRight']);
  const SLOW_KEYS = new Set(['ArrowDown', 'ArrowLeft']);

  // la chambrière (main droite) et sa mèche, la longe (main gauche → anneau du licol)
  const whip = lungeWhip();
  const wl = clamp(R / 4.2, 0.55, 1);
  whip.scale.setScalar(wl);
  sc.scene.add(whip);
  const lash = ribbon(0x2a2a2a, 0.006, 12);
  const line = ribbon(0xf4efe2, 0.014, 20);
  sc.scene.add(lash, line);
  const lineA = Array.from({ length: 20 }, () => V());
  const lashA = Array.from({ length: 12 }, () => V());

  // le cheval part sur la piste, à main gauche (dans le sens inverse des aiguilles d'une montre vu d'en haut)
  let phi = Math.PI * 0.35;
  let us = lungeSpeed(logic.peek().v);
  const place = () => {
    sc.holder.position.set(Math.cos(phi) * R, 0, Math.sin(phi) * R);
    sc.holder.rotation.y = headingOf(Math.sin(phi), -Math.cos(phi));
  };
  place();
  const rc = clamp(0.12 * R, 0.25, 0.6); // (le petit cercle de l'enfant)
  rig.kidPos.set(Math.cos(phi) * rc, 0, Math.sin(phi) * rc);
  rig.frameCamera(true);
  sc.pen = { toWorld: (x, y) => rig.plan.toWorld(x, y), toLogic: rig.plan.toLogic, R, F: rig.F };
  let slid = 0; // (mesure : écart entre le chemin du cheval et la vitesse jouée par l'animation)

  return {
    peek: () => ({
      ...logic.peek(),
      phi,
      ref: us,
      stv: sc.st.v,
      moving: sc.st.moving,
      gait3d: md.anim?.gait ?? null,
      horse3d: sc.holder.position.clone(),
      kid3d: kid.root.position.clone(),
      R,
      slid,
      pinDrops: rig.pinStats.drops,
    }),
    down(p) {
      if (ctx.done) return;
      // la jauge : rien ; près de l'enfant : doucement ; ailleurs : allez !
      if (p.y > GAIT_GAUGE.top + rig.gaugeDy()) return;
      const k = sc.project(_v.copy(kid.root.position).setY(0.8));
      const near = Math.hypot(p.x - k.x, p.y - k.y) < 60;
      logic.down(near ? { x: ARENA_PLAN.x, y: ARENA_PLAN.y } : { x: ARENA_PLAN.x + ARENA_PLAN.path, y: ARENA_PLAN.y });
      say(near ? '🐢' : '✨');
    },
    key(code, down) {
      logic.key?.(code, down);
      if (!down || ctx.done) return;
      if (FAST_KEYS.has(code)) say('✨');
      else if (SLOW_KEYS.has(code)) say('🐢');
    },
    update(dt) {
      dt = Math.max(0, dt);
      logic.update(dt);
      const s = logic.peek();
      rig.frameCamera();
      // vitesse : celle de la logique, ramenée aux allures du modèle (lissée : il accélère, il ralentit)
      us += (lungeSpeed(s.v) - us) * ease(dt, 0.3);
      const moving = us > 0.25;
      const st = sc.st;
      st.moving = moving;
      st.v = moving ? us * ss : 0;
      // (le chemin parcouru : exactement la vitesse jouée par l'animation, à la taille du cheval)
      const w = (st.v * scale) / R;
      phi -= w * dt;
      st.turn = w;
      place();
      // il plie l'encolure vers le dedans : il regarde l'enfant
      m.look = rig.kidHead(_w).clone();
      m.lookAmt = moving ? 0.2 : 0.5;
      // l'enfant marche son petit cercle, tournée vers lui (un peu vers là où il va), à la même vitesse angulaire
      const hp = sc.holder.position;
      const goal = V(Math.cos(phi) * rc, 0, Math.sin(phi) * rc);
      const toHorse = Math.atan2(hp.x - rig.kidPos.x, hp.z - rig.kidPos.z);
      const face = toHorse + wrap(sc.holder.rotation.y - toHorse) * 0.3;
      rig.moveKid(dt, goal, face, w * rc);
      // main gauche : la longe vers sa tête ; main droite : la chambrière vers ses hanches
      const ringAt = rig.attach(V());
      rig.reach(0, ringAt, _w.set(1, -0.6, -0.3), 0.46);
      whipK = Math.max(0, whipK - dt * 1.6);
      const hip = sc.holder.localToWorld(V(0, 0.55, -0.55));
      hip.y *= 0.6;
      rig.reach(1, hip, _w.set(-1, -0.5, -0.4), 0.4 + 0.08 * whipK);
      kid.root.updateMatrixWorld(true);
      // la longe : tendue au trot et au galop, plus lâche au pas
      kid.hands[0].getWorldPosition(_v);
      line.userData.setPoints(sagPoints(_v, ringAt, clamp(0.4 - us * 0.07, 0.04, 0.4) * Math.min(1, R / 4), lineA));
      // la chambrière : pointée vers l'arrière du cheval, bas ; elle se lève et sa mèche claque sur ✨
      kid.hands[1].getWorldPosition(_v);
      _p.subVectors(sc.holder.localToWorld(_w.set(0, 0.5, -1.2)), _v).normalize();
      _p.y = Math.min(_p.y, -0.32) + 0.55 * Math.sin(Math.min(1, whipK * 1.4) * Math.PI) * whipK;
      _p.normalize();
      whip.position.copy(_v);
      whip.quaternion.setFromUnitVectors(_w.set(0, 1, 0), _p);
      const tip = _v.clone().addScaledVector(_p, 1.8 * wl);
      const end = tip.clone().addScaledVector(_p, 1.1 * wl);
      const crack = Math.sin(Math.min(1, whipK) * Math.PI);
      end.y = Math.max(0.02, end.y + crack * 0.6 * wl);
      lash.userData.setPoints(sagPoints(tip, end, 0.25 * (1 - crack * 0.8) * wl, lashA));
      if (said && (said.t -= dt) <= 0) said = null;
      rig.paintRing(s.value, s.lo, s.hi, s.max);
      slid = Math.abs(w * R - st.v * scale);
    },
    draw(g) {
      if (!sc.ready) return;
      const s = logic.peek();
      const c = rig.checkAt(s.lo, s.hi, s.max);
      label(g, '✓', c.x, c.y, 18, '#1e5c3e');
      if (said) {
        const h = sc.project(rig.kidHead(_v));
        bubble(g, h.x, h.y - 6, said.text, { size: 14 });
      }
      drawGaitGauge(g, ctx.t, s.v, s.gait, ctx.done, rig.gaugeDy());
    },
    destroy() {
      logic.destroy?.();
      sc.scene.remove(whip, lash, line);
      for (const o of [whip, lash, line]) {
        o.traverse((x) => {
          if (x.isMesh) {
            x.geometry.dispose();
            x.material.dispose();
          }
        });
      }
      rig.destroy();
    },
  };
}

// ---------------------------------------------------------------- liberté

export function liberty3dGame(ctx) {
  const rig = penRig(ctx, 'liberty');
  const { sc, md, R, Lb, scale, kid, plan } = rig;
  const m = sc.mood;
  const head = () => sc.holder.position.clone().add(V(0, Math.max(0.6, sc.marks.withers.y) * 1.05, 0));
  const anchor = () => sc.project(head());
  const logic = withLogic(ctx, libertyGame, anchor);
  const P0 = logic.peek();
  const keep = rig.keep;

  // la zone verte (derrière son épaule) et le cercle orange (trop près), peints sur le sable, bords fondus
  const N = 28;
  const zoneGeo = keep(new THREE.BufferGeometry());
  const zonePos = new Float32Array(N * 4 * 3);
  const zoneCol = new Float32Array(N * 4 * 4);
  zoneGeo.setAttribute('position', new THREE.BufferAttribute(zonePos, 3));
  zoneGeo.setAttribute('color', new THREE.BufferAttribute(zoneCol, 4));
  {
    const idx = [];
    for (let i = 0; i < N - 1; i++) {
      for (let j = 0; j < 3; j++) {
        const a = i * 4 + j;
        idx.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
      }
    }
    zoneGeo.setIndex(idx);
  }
  const zone = new THREE.Mesh(zoneGeo, keep(new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, toneMapped: false })));
  zone.position.y = 0.014;
  zone.renderOrder = 3;
  zone.frustumCulled = false;
  sc.scene.add(zone);
  const closeTex = keep(new THREE.CanvasTexture((() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const x = c.getContext('2d');
    const gr = x.createRadialGradient(32, 32, 4, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
    gr.addColorStop(0.75, 'rgba(255,255,255,0.75)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 64, 64);
    return c;
  })()));
  const closeR = P0.close * plan.k;
  const closeDisc = new THREE.Mesh(keep(new THREE.PlaneGeometry(closeR * 2, closeR * 2)), keep(new THREE.MeshBasicMaterial({ map: closeTex, color: 0xe0574a, transparent: true, opacity: 0.3, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -6, toneMapped: false })));
  closeDisc.rotation.x = -Math.PI / 2;
  closeDisc.position.y = 0.016;
  closeDisc.renderOrder = 4;
  sc.scene.add(closeDisc);
  /** La zone verte : de l'angle a0 à a1 (sens du plan dessiné), entre les rayons ra et rb (plan dessiné). */
  function paintZone(a0, a1, ra, rb, alpha) {
    const rs = [ra * plan.k, (ra + 6) * plan.k, (rb - 8) * plan.k, rb * plan.k];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const a = a0 + (a1 - a0) * t;
      const ends = Math.min(1, Math.min(t, 1 - t) * 7);
      for (let j = 0; j < 4; j++) {
        const o = (i * 4 + j) * 3;
        zonePos[o] = Math.cos(a) * rs[j];
        zonePos[o + 1] = 0;
        zonePos[o + 2] = Math.sin(a) * rs[j];
        const c = (i * 4 + j) * 4;
        zoneCol[c] = 0.25;
        zoneCol[c + 1] = 0.7;
        zoneCol[c + 2] = 0.38;
        zoneCol[c + 3] = (j === 0 || j === 3 ? 0 : alpha) * ends;
      }
    }
    zoneGeo.attributes.position.needsUpdate = true;
    zoneGeo.attributes.color.needsUpdate = true;
    zoneGeo.computeBoundingSphere();
  }

  // le cheval à sa place du dessin, tourné dans son sens de marche ; l'enfant au milieu
  const hp0 = plan.toWorld(P0.horse.x, P0.horse.y);
  sc.holder.position.copy(hp0);
  let heading = headingOf(-Math.sin(P0.theta) * P0.dirSign, Math.cos(P0.theta) * P0.dirSign);
  sc.holder.rotation.y = heading;
  rig.kidPos.copy(plan.toWorld(P0.me.x, P0.me.y));
  rig.frameCamera(true);
  sc.pen = { toWorld: (x, y) => plan.toWorld(x, y), toLogic: plan.toLogic, R, F: rig.F };
  let vs = 0;
  let endT = 0;
  let maxSlide = 0;

  /** Le doigt sur le sable → point du plan dessiné (ou null hors du sol). */
  const toPlan = (p) => {
    const P = sc.pointOnPlane(p.x, p.y, 0);
    return P ? plan.toLogic(P) : null;
  };
  return {
    peek: () => ({
      ...logic.peek(),
      stv: sc.st.v,
      moving: sc.st.moving,
      gait3d: md.anim?.gait ?? null,
      horse3d: sc.holder.position.clone(),
      kid3d: kid.root.position.clone(),
      heading3d: sc.holder.rotation.y,
      R,
      maxSlide,
    }),
    down(p) {
      if (ctx.done) return;
      const s = logic.peek();
      // le doigt sur le cheval (zone verte atteinte) : on l'appelle
      if (s.phase === 'drive' && s.value >= s.lo && sc.pickAnimal(p.x, p.y)) {
        logic.down({ x: s.horse.x, y: s.horse.y });
        return;
      }
      const q = toPlan(p);
      if (q) logic.down(q);
    },
    move(p, down) {
      // (à la souris, l'enfant suit le pointeur sans appuyer, comme dans le jeu dessiné)
      if (!(down || p.type === 'mouse')) return;
      const q = toPlan(p);
      if (q) logic.move({ ...q, type: p.type }, down);
    },
    key: (c, d) => logic.key?.(c, d),
    update(dt) {
      dt = Math.max(0, dt);
      logic.update(dt);
      const s = logic.peek();
      rig.frameCamera();
      // le cheval : exactement à sa place du dessin ; sa vitesse (celle qu'il joue) : son vrai déplacement
      const P = plan.toWorld(s.horse.x, s.horse.y, _p);
      const hp = sc.holder.position;
      const dx = P.x - hp.x;
      const dz = P.z - hp.z;
      const d = Math.hypot(dx, dz);
      // (la logique avance déjà en douceur : sa vitesse telle quelle, sans retard — lissée, les jambes accéléraient
      // après le corps, et les sabots glissaient au départ)
      const sp = dt > 0 ? d / dt : vs;
      vs = sp;
      const st = sc.st;
      // (sous 0,25 m/s de référence, il s'arrête : l'animation la plus lente du pas glisserait plus qu'il n'avance)
      st.moving = vs / scale > 0.25 * (md.speedScale ?? 1);
      st.v = st.moving ? vs / scale : 0;
      // cap : le long de la piste dans son sens de marche (au demi-tour, il pivote) ; à l'appel, vers l'enfant
      let want = heading;
      if (s.phase === 'drive') want = headingOf(-Math.sin(s.theta) * s.dirSign, Math.cos(s.theta) * s.dirSign);
      else if (d > 1e-4) want = headingOf(dx, dz);
      else want = headingOf(rig.kidPos.x - hp.x, rig.kidPos.z - hp.z);
      const h0 = heading;
      heading = wrap(heading + wrap(want - heading) * ease(dt, s.phase === 'drive' ? 0.12 : 0.25));
      st.turn = dt > 0 ? wrap(heading - h0) / dt : 0;
      hp.copy(P);
      sc.holder.rotation.y = heading;
      // (glissement des sabots : la vitesse jouée par l'animation suit le déplacement, à un lissage près)
      maxSlide = Math.max(maxSlide, st.moving ? Math.abs(st.v * scale - sp) : 0);
      // il garde un œil (et une oreille) sur l'enfant ; à l'appel, il la regarde franchement
      m.look = rig.kidHead(_w).clone();
      m.lookAmt = s.phase === 'join' || ctx.done ? 0.85 : 0.3;
      if (s.driving) rig.listen(0.4);
      if (ctx.done) {
        endT += dt;
        m.ears = 'forward';
      }
      // l'enfant : vers son point du dessin (elle court s'il est loin), tournée vers le cheval
      const goal = plan.toWorld(s.me.x, s.me.y);
      // (jamais dans le cheval : écartée de son corps, pour l'image seulement)
      const away = _v.subVectors(goal, hp).setY(0);
      const minD = 0.55 * Lb;
      if (away.length() < minD) goal.copy(hp).addScaledVector(away.lengthSq() > 1e-6 ? away.normalize() : V(1, 0, 0), minD);
      rig.moveKid(dt, goal, Math.atan2(hp.x - rig.kidPos.x, hp.z - rig.kidPos.z));
      // elle pousse : le bras tendu vers ses hanches ; sinon les bras le long du corps
      if (s.driving && s.phase === 'drive') {
        rig.reach(1, sc.holder.localToWorld(_w.set(0, 0.5, -0.8)), V(-1, -0.5, -0.4), 0.5);
        kid.root.updateMatrixWorld(true);
      }
      // la zone verte derrière son épaule, et le rond orange autour de lui (plus vif quand on est trop près)
      const pulse = 0.5 + Math.sin(ctx.time * 4) * 0.12;
      if (s.phase === 'drive') {
        const a0 = s.theta - 1.4 * s.dirSign;
        const a1 = s.theta - 0.2 * s.dirSign;
        paintZone(Math.min(a0, a1), Math.max(a0, a1), 25, 100, pulse);
        zone.visible = true;
        closeDisc.visible = true;
        closeDisc.position.set(hp.x, 0.016, hp.z);
        closeDisc.material.opacity = s.tooClose ? 0.55 : 0.26;
      } else {
        zone.visible = false;
        closeDisc.visible = false;
      }
      rig.paintRing(s.value, s.lo, s.hi, s.max);
    },
    draw(g) {
      if (!sc.ready) return;
      const s = logic.peek();
      const v = ctx.view;
      const c = rig.checkAt(s.lo, s.hi, s.max);
      label(g, '✓', c.x, c.y, 18, '#1e5c3e');
      if (s.phase === 'drive' && s.value >= s.lo) {
        // la main « touche-le » au-dessus du cheval
        const h = sc.project(_v.copy(sc.holder.position).setY(sc.marks.withers.y * 1.55));
        const k = 1 + Math.sin(ctx.time * 6) * 0.15;
        emoji(g, '👆', h.x, Math.max(v.y0 + 20, h.y - 10), 30 * k);
      }
      if (s.phase === 'join' || ctx.done) {
        const a = sc.project(rig.kidHead(_v));
        if (endT < 3) emoji(g, '💛', a.x, a.y - 22 - Math.sin(ctx.time * 3) * 3, 24);
      }
      if (!ctx.done) label(g, `🟢 ${ctx.t('mg_liberty_zone')}`, (v.x0 + v.x1) / 2, v.y1 - 18, 15, '#1e5c3e');
    },
    destroy() {
      logic.destroy?.();
      sc.scene.remove(zone, closeDisc);
      m.ears = null;
      rig.destroy();
    },
  };
}

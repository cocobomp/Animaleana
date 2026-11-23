// Concours de beauté du cheval, en 3D, sur le vrai cheval dans son box (scène des soins : src/game/care/stage.js) :
//
// - LUSTRER (shine3dGame) : un chiffon dans notre main ; on frotte la robe, et elle brille de plus en plus là où on a
//   frotté (un voile de reflets satinés posé sur le pelage, sommet par sommet) ; trop frotter, ça colle (le reflet
//   devient gras, jaunâtre). Puis on huile chaque sabot : la corne brille.
// - TRESSER (braid3dGame) : gros plan sur la vraie crinière, du côté où elle tombe ; la loupe aux trois mèches du jeu
//   dessiné est posée dans un coin ; chaque geste juste ajoute un bouton de tresse sur la crête. Puis les rubans à la
//   couleur choisie, et la queue tressée à la fin.
//
// La logique est celle des jeux dessinés (beauty.js, par withLogic) : mêmes consignes, même note « juste ce qu'il
// faut », même couleur écrite dans ctx.opts.out. Le geste en 3D est reporté sur le cheval dessiné (même forme que la
// sienne) : pour les mêmes gestes, la même note.

import * as THREE from 'three';
import { shineGame, braidGame } from './beauty.js';
import { withLogic } from './care3d.js';
import { handModel, avatarHand, aimHand } from '../../game/care/props.js';
import { RIBBON_COLORS } from '../../sim/beauty.js';
import { headShape, headFollow } from './headFrame.js';
import { nicker, snort } from './feed3d.js';
import { armDir } from './treat3d.js';
import { circle, emoji } from './draw.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const GLOSS_K = 1.4; // (une case du jeu dessiné frottée une fois, 1 : le reflet à fond)
const clamp01 = (k) => Math.max(0, Math.min(1, k));

// ---------------------------------------------------------------- le voile brillant (commun : lustrer, sécher)

/**
 * Un voile de reflets posé sur le pelage : le même maillage que la robe (mêmes sommets, même squelette), une matière
 * lisse qui ne fait que des reflets (ajoutés à la robe), et par sommet une force (alpha) et une teinte. paint(p, r,
 * amount) : frotter autour du point p (monde). Les valeurs vont de 0 (rien) à 1 (brille) ; au-delà de over, le reflet
 * devient gras (trop de lustrant).
 */
export function coatGloss(sc, own, { color = 0xffffff, roughness = 0.2, over = 2.5, tint = [0.42, 0.33, 0.05], base = [0, 0, 0], alpha = 1, additive = true, env = 2.2 } = {}) {
  const coat = sc.model.coatMesh;
  if (!coat?.isSkinnedMesh) return null;
  const src = coat.geometry;
  const geo = own(new THREE.BufferGeometry());
  for (const k of ['position', 'normal', 'skinIndex', 'skinWeight']) if (src.attributes[k]) geo.setAttribute(k, src.attributes[k]);
  if (src.index) geo.setIndex(src.index);
  const n = src.attributes.position.count;
  const col = new Float32Array(n * 4);
  const colAttr = new THREE.BufferAttribute(col, 4);
  colAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('color', colAttr);
  const mat = own(new THREE.MeshStandardMaterial({
    color, roughness, metalness: 0.05, vertexColors: true, transparent: true, depthWrite: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, envMapIntensity: env,
  }));
  mat.userData.shared = false;
  const mesh = new THREE.SkinnedMesh(geo, mat);
  mesh.bind(coat.skeleton, coat.bindMatrix);
  mesh.frustumCulled = false;
  mesh.userData.coatGloss = true;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 3;
  coat.parent.add(mesh);
  // Les sommets dans la pose du moment (monde), pour savoir lesquels on frotte (refaits au plus toutes les 0,5 s).
  const pos = new Float32Array(n * 3);
  const val = new Float32Array(n); // ce qu'on a frotté là
  let bakedAt = -9;
  const p = v3();
  const bake = () => {
    coat.updateWorldMatrix(true, false);
    const at = src.attributes.position;
    for (let i = 0; i < n; i++) {
      p.fromBufferAttribute(at, i);
      coat.applyBoneTransform(i, p);
      p.applyMatrix4(coat.matrixWorld);
      pos[i * 3] = p.x;
      pos[i * 3 + 1] = p.y;
      pos[i * 3 + 2] = p.z;
    }
  };
  let dirty = false;
  const show = (i) => {
    const v = val[i];
    const g = Math.min(1, v * 0.7);
    const o = clamp01((v - over) * 0.8);
    col[i * 4] = base[0] * (1 - o) + tint[0] * o;
    col[i * 4 + 1] = base[1] * (1 - o) + tint[1] * o;
    col[i * 4 + 2] = base[2] * (1 - o) + tint[2] * o;
    col[i * 4 + 3] = alpha * Math.min(1, g * (1 - 0.5 * o) + 0.45 * o);
    dirty = true;
  };
  const api = {
    mesh,
    /** Frotter autour de p (rayon r, mètres) ; keep(i, x, y, z) : ce sommet compte-t-il (la robe, pas la tête) ? */
    paint(at, r, amount, time = 0, keep = null) {
      if (time - bakedAt > 0.5) {
        bake();
        bakedAt = time;
      }
      const r2 = r * r;
      let hit = 0;
      for (let i = 0; i < n; i++) {
        const dx = pos[i * 3] - at.x;
        const dy = pos[i * 3 + 1] - at.y;
        const dz = pos[i * 3 + 2] - at.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        if (keep && !keep(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])) continue;
        val[i] += amount * (1 - d2 / r2);
        show(i);
        hit++;
      }
      return hit;
    },
    /** Sommets choisis (fn(i, x, y, z) → force à ajouter) : les sabots huilés. */
    each(fn, time = 0) {
      if (time - bakedAt > 0.5) {
        bake();
        bakedAt = time;
      }
      for (let i = 0; i < n; i++) {
        const k = fn(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
        if (k > 0) {
          val[i] += k;
          show(i);
        }
      }
    },
    value: (i) => val[i],
    /** Fixe la valeur d'un sommet (départ : tout mouillé, poil d'hiver partout). */
    set(i, v) {
      val[i] = v;
      show(i);
    },
    /** Sommets dans la pose du moment (monde), refaits si besoin. */
    positions(time = 0) {
      if (time - bakedAt > 0.5) {
        bake();
        bakedAt = time;
      }
      return pos;
    },
    count: n,
    /** Envoie les couleurs changées à la carte graphique (une fois par image). */
    flush() {
      if (!dirty) return;
      colAttr.needsUpdate = true;
      dirty = false;
    },
    /** Efface autour de p (rayon r) : amount retiré au centre (séchage, tonte). Renvoie ce qui a été retiré. */
    wipe(at, r, amount, time = 0, keep = null) {
      if (time - bakedAt > 0.5) {
        bake();
        bakedAt = time;
      }
      const r2 = r * r;
      let took = 0;
      for (let i = 0; i < n; i++) {
        if (val[i] <= 0) continue;
        const dx = pos[i * 3] - at.x;
        const dy = pos[i * 3 + 1] - at.y;
        const dz = pos[i * 3 + 2] - at.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 > r2) continue;
        if (keep && !keep(i, pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])) continue;
        const k = Math.min(val[i], amount * (1 - (0.6 * d2) / r2));
        val[i] -= k;
        took += k;
        show(i);
      }
      return took;
    },
    /** Tout s'efface (séchage : l'eau qui s'en va) : k par seconde. */
    fade(dt, k) {
      for (let i = 0; i < n; i++) {
        if (val[i] <= 0) continue;
        val[i] = Math.max(0, val[i] - dt * k);
        show(i);
      }
    },
    remove() {
      mesh.parent?.remove(mesh);
    },
  };
  mesh.userData.api = api;
  return api;
}

/**
 * Report d'un point du corps (monde) sur le cheval dessiné du jeu de lustrage (sh : sa forme, animalShape) : de la
 * queue au poitrail, du ventre au dos, sur l'ovale du corps dessiné.
 */
export function bodyTo2d(sc, sh) {
  const F = bodyFrame(sc);
  return (p) => {
    const q = sc.holder.worldToLocal(p.clone());
    const u = (q.z - F.z0) / (F.z1 - F.z0);
    const w = (q.y - F.y0) / (F.y1 - F.y0);
    return sh.L((u * 2 - 1) * sh.rx, (1 - w * 2) * sh.ry);
  };
}

/** Le cadre du corps du cheval dans son repère (z : vers la tête ; y : vers le haut), pour reporter un geste. */
export function bodyFrame(sc) {
  const L = sc.marks;
  const loc = (p) => sc.holder.worldToLocal(p.clone());
  const tail = loc(L.tail);
  const chest = loc(L.chest);
  const belly = loc(L.belly);
  const back = loc(L.back);
  const withers = loc(L.withers);
  return { z0: tail.z, z1: chest.z + 0.04, y0: belly.y, y1: Math.max(back.y, withers.y * 0.97) };
}

/** Notre main, paume posée sur la robe, et un chiffon dessous (peau de chamois). */
export function clothHand(sc, own, color = 0xe9c77b) {
  const hand = handModel(own, { ...avatarHand(sc.game?.profile), grip: 0.35 });
  hand.userData.hand = true;
  // (manche très longue : le bras vient de nous et sort toujours du cadre, on n'en voit jamais le bout)
  for (const c of hand.children) {
    if (c.geometry?.type === 'CylinderGeometry' && c.geometry.parameters.height > 0.3) {
      c.scale.y = 5;
      c.position.x = -0.142 - (0.34 * 5) / 2;
    }
  }
  const geo = own(new THREE.PlaneGeometry(0.2, 0.15, 10, 8));
  const pp = geo.attributes.position;
  for (let i = 0; i < pp.count; i++) {
    const x = pp.getX(i);
    const y = pp.getY(i);
    // (un chiffon froissé : quelques plis, et les coins qui retombent)
    pp.setZ(i, 0.008 * Math.sin(x * 60 + y * 25) + 0.006 * Math.cos(y * 70) - 0.25 * (x * x + y * y));
  }
  geo.computeVertexNormals();
  const cloth = new THREE.Mesh(geo, own(new THREE.MeshStandardMaterial({ color, roughness: 0.95, side: THREE.DoubleSide })));
  cloth.rotation.x = Math.PI / 2; // (à plat sous la paume : la paume regarde vers +y)
  cloth.position.set(0.01, 0.022, 0);
  cloth.castShadow = true;
  hand.add(cloth);
  // L'avant-bras (poignet, manche, revers) sur un pivot au poignet : la paume reste à plat sur le poil, l'avant-bras
  // vient vers nous, d'en bas à droite (comme quand on frotte un cheval, le bras tendu vers lui).
  const forearm = new THREE.Group();
  forearm.position.set(-0.045, 0, 0);
  hand.add(forearm);
  for (const c of [...hand.children]) if (c !== forearm && c !== cloth && c.position.x < -0.06) forearm.attach(c);
  hand.userData.forearm = forearm;
  hand.visible = false;
  sc.scene.add(hand);
  return { hand, cloth, geo };
}

const _fa = new THREE.Vector3();
const _fq = new THREE.Quaternion();
const BACK_X = new THREE.Vector3(-1, 0, 0);

/**
 * Pose la main sur le pelage au point h (point, normale) : paume contre lui, doigts vers le haut (un peu vers sa
 * tête), et l'avant-bras plié au poignet qui vient vers nous, d'en bas à droite (sc : la scène, pour la caméra).
 */
export function handOnCoat(hand, h, press = 1, sc = null) {
  const n = h.normal;
  const up = v3(0.35, 1, 0).addScaledVector(n, -n.y).normalize();
  const at = h.point.clone().addScaledVector(n, 0.028 + 0.02 * (1 - press));
  hand.position.copy(at);
  const from = at.clone().addScaledVector(up, -0.3);
  aimHand(hand, from, at.clone().addScaledVector(up, 0.05), false, n);
  const forearm = hand.userData.forearm;
  if (!forearm || !sc) return;
  hand.updateMatrixWorld(true);
  _fa.copy(at).addScaledVector(armDir(sc), 0.5);
  hand.worldToLocal(_fa).sub(forearm.position).normalize();
  const ang = BACK_X.angleTo(_fa);
  _fq.setFromUnitVectors(BACK_X, _fa);
  if (ang > 1.45) forearm.quaternion.identity().slerp(_fq, 1.45 / ang);
  else forearm.quaternion.copy(_fq);
}

// ---------------------------------------------------------------- lustrer

/**
 * Le reflet du lustrage selon la robe. Le reflet s'ajoute à la robe : sur une robe foncée (alezan, noir, bai), il se
 * voit bien ; sur une robe claire (gris, blanc, Appaloosa), la même force brûle la robe en une tache blanc-jaune là
 * où le soleil tape, et ne se voit pas ailleurs. Plus la robe est claire, plus le reflet est doux (alpha) et étalé
 * (rugosité) : un satin sur toute la partie frottée, pas une tache.
 */
export function glossFor(coat = 0x8a5a2b) {
  const c = new THREE.Color(coat);
  // (clarté perçue de la robe, de 0 à 1 : luminance des composantes linéaires, ramenée à l'écran)
  const lum = (0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b) ** (1 / 2.2);
  const k = clamp01((lum - 0.35) / 0.5); // (0 : robe foncée ; 1 : robe blanche)
  return { roughness: 0.27 + 0.2 * k, env: 1.5 - 0.6 * k, alpha: 0.85 * (1 - 0.68 * k), tint: [0.42 - 0.2 * k, 0.33 - 0.15 * k, 0.05] };
}

export function shine3dGame(ctx) {
  const { a } = ctx;
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const S = sc.double.scale;
  const L = sc.marks;
  const keep = [];
  const own = (x) => {
    keep.push(x);
    return x;
  };
  const m = sc.mood;
  m.ears = 'forward';
  let lastHit = null;
  const play = withLogic(ctx, shineGame, () => (lastHit ? sc.project(lastHit) : sc.project(L.body)));
  const sh = play.shape;
  const F = bodyFrame(sc);
  const to2d = bodyTo2d(sc, sh);
  // (un reflet satiné, pas une robe de plastique : assez lisse pour briller au soleil de la fenêtre, pas plus ;
  // plus doux et plus étalé sur une robe claire, voir glossFor)
  const gloss = coatGloss(sc, own, { over: play.overAt * GLOSS_K, ...glossFor(a?.look?.coat) });
  // Chaque sommet de la robe (corps seulement) et les cases du cheval dessiné qui l'entourent : il brille comme
  // elles (ce qui brille, c'est ce que la jauge compte ; trop de lustrant : le reflet devient gras).
  const near = [];
  if (gloss) {
    const pos = gloss.positions(0);
    const cells = play.cells;
    const reach = play.step * 1.2;
    const w = v3();
    for (let i = 0; i < gloss.count; i++) {
      w.set(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]);
      const q = sc.holder.worldToLocal(w.clone());
      if (q.z < F.z0 - 0.05 || q.z > F.z1 + 0.02 || q.y < F.y0 - 0.04) continue;
      const p2 = to2d(w);
      const list = [];
      for (let c = 0; c < cells.length; c++) {
        const d = Math.hypot(cells[c].x - p2.x, cells[c].y - p2.y);
        if (d < reach) list.push([c, 1 - d / reach]);
      }
      if (!list.length) continue;
      const sum = list.reduce((n, x) => n + x[1], 0);
      near.push([i, list.map(([c, k]) => [c, k / sum])]);
    }
  }
  let shineDirty = false;
  function shineFromCells() {
    if (!gloss) return;
    const cells = play.cells;
    for (const [i, list] of near) {
      let v = 0;
      for (const [c, k] of list) v += cells[c].v * k;
      gloss.set(i, v * GLOSS_K);
    }
  }
  const body = new Set(['body', 'shoulder', 'hip']);
  // Les deux sabots de notre côté (le cheval dessiné en a deux : devant, derrière).
  const legs = sc.model.legs ?? [];
  const hoofLeg = [legs[1] ?? legs[0], legs[3] ?? legs[2]].map((l) => (l ? sc.holder.localToWorld(l.hoof.clone()) : null));
  const hoofAt = (i) => hoofLeg[i]?.clone().add(v3(0, 0.05 * S, 0.06 * S));
  const oiled = [false, false];
  const { hand } = clothHand(sc, own);

  // Cadrage : tout le cheval de profil (la robe, les sabots), et toute sa tête.
  const fixed = [L.withers, L.croup, L.back, L.belly, L.chest, L.tail, L.tail.clone().lerp(L.tailTip, 0.6), L.tail.clone().add(v3(-0.18 * S, -0.3 * S, 0)), L.croup.clone().lerp(L.tail, 0.8).add(v3(-0.16 * S, -0.12 * S, 0)), ...L.hooves];
  const follow = headFollow(sc, headShape(sc), () => fixed, { dir: [0.34, 0.16, 1], pad: 1.16, half: 0.5, reach: 0.1 });
  follow.frame(true);
  let started = false;
  let last = null;
  let snortIn = 3;
  let sparkleT = 0;
  let saidDone = false;

  function rub(p) {
    const h = sc.pickAnimal(p.x, p.y);
    if (!h || !body.has(h.region)) {
      // (le doigt quitte le corps : le chiffon se lève, comme un doigt levé dans le jeu dessiné)
      if (last) play.up();
      last = null;
      return;
    }
    lastHit = h.point;
    const p2 = to2d(h.point);
    if (!last) {
      last = { p2, w: h.point };
      play.down(p2);
      return;
    }
    const d = Math.hypot(p2.x - last.p2.x, p2.y - last.p2.y);
    if (d < 1) return;
    play.move(p2, true);
    // (le reflet suit la jauge du jeu dessiné : voir shineFromCells)
    shineDirty = true;
    last = { p2, w: h.point };
  }

  function oil(i) {
    if (oiled[i]) return;
    // (le sabot de devant du dessin, puis celui de derrière : mêmes que dans le jeu dessiné)
    const hv = play.hoofSpots[i];
    if (!hv || hv.done) return;
    play.down({ x: hv.x, y: hv.y });
    play.up();
    if (!hv.done) return;
    oiled[i] = true;
    // La corne brille : un voile de reflets sur le bas du membre.
    const sole = hoofLeg[i];
    if (sole && gloss) {
      gloss.each((k, x, y, z) => {
        const dy = y - sole.y;
        const dh = Math.hypot(x - sole.x, z - sole.z);
        return dy < 0.11 * S && dh < 0.12 * S ? 1.6 : 0;
      }, ctx.time);
    }
    const c = sc.project(hoofAt(i));
    ctx.fx.burst(c.x, c.y - 6, '✨', 5, { speed: 70, size: 14 });
  }

  return {
    peek: () => ({ ...play.peek(), oiled: [...oiled], hoof3d: hoofLeg.map((p, i) => (p ? sc.project(hoofAt(i)) : null)), three: true }),
    down(p) {
      // un sabot à huiler sous le doigt ?
      for (let i = 0; i < 2; i++) {
        const at = hoofAt(i);
        if (!at || oiled[i]) continue;
        const c = sc.project(at);
        if (Math.hypot(p.x - c.x, p.y - c.y) < Math.max(26, sc.projectRadius(at, 0.2 * S))) {
          oil(i);
          return;
        }
      }
      last = null;
      rub(p);
    },
    move(p, down) { if (down) rub(p); },
    up() {
      last = null;
      play.up();
    },
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      if (!started) follow.frame(true);
      started = true;
      follow.update(dt);
      if (shineDirty) {
        shineDirty = false;
        shineFromCells();
      }
      gloss?.flush();
      sparkleT += dt;
      const s = play.peek();
      const pp = ctx.pointer;
      // la main et le chiffon sous le doigt, sur sa robe
      const h = !ctx.done && (pp.down || pp.over) ? sc.pickAnimal(pp.x, pp.y) : null;
      hand.visible = !!h;
      if (h) handOnCoat(hand, h, pp.down ? 1 : 0, sc);
      // Lui : content quand ça brille, oreilles en arrière quand ça colle.
      const high = s.value > s.hi;
      m.ears = high ? 'back' : 'forward';
      if (high) m.annoyed = Math.max(m.annoyed, 0.2);
      m.look = sc.camera.position;
      m.lookAmt = 0.35;
      snortIn -= dt;
      if (snortIn <= 0) {
        snortIn = 4 + Math.random() * 4;
        snort(sc, false);
      }
      if (ctx.done && !saidDone) {
        saidDone = true;
        if (!high) {
          nicker(sc);
          m.nod = 1;
        }
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      // Les sabots à huiler : un rond qui pulse et le flacon ; huilés : des étincelles.
      for (let i = 0; i < 2; i++) {
        const at = hoofAt(i);
        if (!at) continue;
        const c = sc.project(at);
        if (oiled[i]) {
          emoji(g, '✨', c.x, c.y - 14 + Math.sin(sparkleT * 4 + i) * 2, 16, 0, 0.9);
          continue;
        }
        if (ctx.done) continue;
        const r = Math.max(18, sc.projectRadius(at, 0.16 * S));
        g.save();
        g.globalAlpha = 0.6 + Math.sin(ctx.time * 5) * 0.3;
        g.strokeStyle = '#fff';
        g.lineWidth = 3;
        circle(g, c.x, c.y, r);
        g.stroke();
        g.restore();
        emoji(g, '🧴', c.x + r * 0.9, c.y - r * 0.9, 22);
      }
      // Juste ce qu'il faut : des étincelles sur sa robe.
      if (s.value >= s.lo && s.value <= s.hi) {
        for (let i = 0; i < 5; i++) {
          const k = (Math.sin(sparkleT * 1.3 + i * 2.1) + 1) / 2;
          const w = L.croup.clone().lerp(L.withers, k).add(v3(0, -0.15 * S * (1 + Math.sin(sparkleT * 2 + i)), 0.2 * S));
          const c = sc.project(w);
          emoji(g, '✨', c.x, c.y, 16, 0, 0.6 + 0.3 * Math.sin(sparkleT * 5 + i));
        }
      }
    },
    destroy() {
      gloss?.remove();
      sc.scene.remove(hand);
      for (const x of keep) x.dispose?.();
    },
  };
}

// ---------------------------------------------------------------- tresser

/** Les boutons de tresse de la crête (repère de l'encolure), du garrot vers la nuque. */
function crestSpots(sc) {
  const md = sc.model;
  const list = md.braidSpots?.crest ?? [];
  if (!list.length || !md.neck) return [];
  const withers = sc.marks.withers;
  return list
    .map(([p, up, mid]) => ({ p: p.clone(), up: up.clone(), mid: mid?.clone() ?? null, w: md.neck.localToWorld(p.clone()) }))
    .sort((a, b) => a.w.distanceTo(withers) - b.w.distanceTo(withers));
}

/**
 * Les tresses « boutons » de concours sur la vraie crête (model.braidSpots, horseReal.js), cachées au départ : la
 * boule de crins, le ruban et le pompon de chaque bouton, le bourrelet de crins jusqu'au suivant ; les perles de la
 * queue et son nœud. Chaque bouton a sa section (du garrot, 0, à la nuque, sections - 1). show(k) fait apparaître
 * un bouton en douceur (dt). Libérés avec own ; remove() les retire du cheval.
 */
export function crestBraids(sc, own, { mane = 0x4a2f1d, sections = 4 } = {}) {
  const md = sc.model;
  const spots = crestSpots(sc);
  const r = (md.dims?.R ?? 0.32) * 0.085;
  const hairMat = own(new THREE.MeshStandardMaterial({ color: mane, roughness: 0.7 }));
  const ribbonMat = own(new THREE.MeshStandardMaterial({ color: 0xd8402f, roughness: 0.5 }));
  const knobGeo = own(new THREE.SphereGeometry(r, 14, 10));
  const bandGeo = own(new THREE.TorusGeometry(r * 0.82, r * 0.2, 8, 16));
  const pomGeo = own(new THREE.SphereGeometry(r * 0.5, 10, 8));
  const ridgeGeo = own(new THREE.SphereGeometry(1, 12, 6));
  const zAxis = v3(0, 0, 1);
  const knobs = spots.map((sp, i) => {
    // (le groupe est posé au centre du bouton : il grandit sur place, au lieu de glisser depuis l'encolure)
    const g = new THREE.Group();
    g.position.copy(sp.p).addScaledVector(sp.up, r * 0.45);
    g.quaternion.setFromUnitVectors(zAxis, sp.up);
    const knob = new THREE.Mesh(knobGeo, hairMat);
    knob.scale.set(1, 1, 0.85);
    knob.castShadow = true;
    g.add(knob);
    const band = new THREE.Mesh(bandGeo, ribbonMat);
    band.position.set(0, 0, -r * 0.15);
    const pom = new THREE.Mesh(pomGeo, ribbonMat);
    pom.position.set(0, 0, r * 0.8);
    band.visible = false;
    pom.visible = false;
    g.add(band, pom);
    g.visible = false;
    g.scale.setScalar(0.01);
    md.neck.add(g);
    // (le bourrelet de crins jusqu'au bouton suivant : les boutons sont reliés, comme de vraies tresses de concours ;
    // il n'apparaît que quand les deux boutons sont faits)
    const next = spots[i + 1];
    let ridge = null;
    if (next) {
      const d = next.p.clone().sub(sp.p);
      const len = d.length();
      if (len > 1e-4) {
        d.divideScalar(len);
        const side = v3().crossVectors(d, sp.up).normalize();
        const nn = v3().crossVectors(side, d);
        ridge = new THREE.Mesh(ridgeGeo, hairMat);
        ridge.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(side, d, nn));
        ridge.position.copy(sp.mid ?? sp.p.clone().add(next.p).multiplyScalar(0.5)).addScaledVector(nn, r * 0.2);
        ridge.scale.set(r * 0.62, len * 0.6, r * 0.45);
        ridge.visible = false;
        md.neck.add(ridge);
      }
    }
    const sec = Math.min(sections - 1, Math.floor((i / Math.max(1, spots.length)) * sections));
    return { g, band, pom, ridge, sec, shown: 0, w: () => md.neck.localToWorld(g.position.clone()) };
  });
  /** Les bourrelets entre deux boutons faits. */
  const ridges = () => {
    knobs.forEach((k, i) => {
      if (k.ridge) k.ridge.visible = k.shown >= 1 && !!knobs[i + 1]?.g.visible && knobs[i + 1].shown >= 1;
    });
  };
  // La queue : des perles de crins entrelacées le long du dessus de la queue, et un nœud en haut.
  const tailSpots = md.braidSpots?.tail ?? [];
  const beads = tailSpots.map(([parent, p], j) => {
    const b = new THREE.Mesh(own(new THREE.SphereGeometry(r * (1 - j * 0.045), 10, 8)), hairMat);
    b.position.copy(p);
    b.position.x += (j % 2 ? 1 : -1) * r * 0.3;
    b.visible = false;
    b.castShadow = true;
    parent.add(b);
    return b;
  });
  let tailBow = null;
  if (tailSpots.length) {
    const [parent, p] = tailSpots[0];
    tailBow = bowMesh(ribbonMat, r * 1.25, own);
    tailBow.position.copy(p);
    if (md.braidSpots.tailBowQ) tailBow.quaternion.copy(md.braidSpots.tailBowQ);
    tailBow.translateZ(r * 0.9);
    tailBow.visible = false;
    parent.add(tailBow);
  }
  return {
    knobs,
    beads,
    tailBow,
    tailSpots,
    ribbonMat,
    r,
    /** Le bouton apparaît (ou grandit) : à appeler à chaque image. */
    grow(k, on, dt) {
      if (on && !k.g.visible) {
        k.g.visible = true;
        k.shown = 0;
      }
      if (!on) k.g.visible = false;
      if (k.g.visible) {
        k.shown = Math.min(1, k.shown + dt * 4);
        k.g.scale.setScalar(0.2 + 0.8 * smooth(k.shown));
      }
      ridges();
    },
    ridges,
    remove() {
      for (const k of knobs) {
        k.g.parent?.remove(k.g);
        k.ridge?.parent?.remove(k.ridge);
      }
      for (const b of beads) b.parent?.remove(b);
      tailBow?.parent?.remove(tailBow);
    },
  };
}

export function braid3dGame(ctx) {
  const sc = ctx.scene;
  sc.decor.layout('rest');
  const S = sc.double.scale;
  const L = sc.marks;
  const md = sc.model;
  const keep = [];
  const own = (x) => {
    keep.push(x);
    return x;
  };
  const m = sc.mood;
  m.ears = 'forward';
  let fxAt = null;
  const play = withLogic(ctx, braidGame, () => (fxAt ? sc.project(fxAt) : sc.project(L.poll)));
  const sections = play.sections;
  const nMane = sections.filter((x) => !x.tail).length;
  const B = crestBraids(sc, own, { mane: ctx.a?.look?.mane ?? ctx.a?.look?.secondary ?? 0x4a2f1d, sections: nMane });
  const { knobs, beads, tailBow, ribbonMat, tailSpots } = B;
  const maneU = md.hairMesh?.material?.userData?.hairBraid ?? null;
  let tuck = 0;

  // Cadrage : la section en cours, de près, vue du côté où tombe la crinière (le nôtre) ; puis la queue ; à la fin,
  // tout le cheval avec ses tresses.
  const head = headShape(sc);
  const follow = headFollow(sc, head, () => [], { dir: [0.12, 0.35, 1], pad: 1.25, half: 0.55, reach: 0 });
  follow.on = false;
  let framed = null;
  function frameFor(what) {
    if (framed === what) return;
    const from = framed;
    framed = what;
    if (what === 'end') {
      sc.setFocus(null);
      follow.on = true;
      follow.set({ dir: [0.3, 0.22, 1], pad: 1.15 }, () => [L.withers, L.croup, L.tail, L.tailTip, L.chest, ...L.hooves]);
      follow.frame(false);
      return;
    }
    follow.on = false;
    // (la scène au-dessus de la loupe : rien de la crinière ne passe dessous)
    const o = loupeAt();
    sc.setFocus(0, Math.max(sc.size.h * 0.5, (o.y * ctx.view.scale + ctx.view.oy) - 6));
    if (what === 'tail') {
      const pts = [L.tail, L.croup, L.tailTip, L.tail.clone().lerp(L.tailTip, 0.5).add(v3(0, 0, 0.15 * S)), L.croup.clone().add(v3(0.3 * S, 0.12 * S, 0)), L.croup.clone().add(v3(0.1 * S, -0.45 * S, 0))];
      // (un changement de plan net vers la queue, comme au retour : pendant un long glissement le long du dos, on
      // voyait l'encolure en gros plan avec la tête coupée au bord)
      sc.frame(pts, { dir: [-0.6, 0.22, 1], pad: 1.2, half: 0.6, now: true });
      return;
    }
    // la crinière : toute l'encolure et la tête (ses vrais bords : bout du nez, oreilles), de notre côté, un peu d'en haut ; la même vue pour chaque tresse
    // (le rond jaune montre celle qu'on tresse) : on voit le cheval, et les boutons qui viennent un à un
    // (suivie en douceur : quand il baisse ou tourne un peu la tête, elle reste dans l'image)
    const low = [L.withers.clone().add(v3(-0.05 * S, -0.38 * S, 0.05 * S)), L.neck.clone().add(v3(0, -0.3 * S, 0))];
    follow.on = true;
    // (en revenant de la queue pour les rubans : un changement de plan net, comme au cinéma, plutôt qu'un long
    // glissement le long du dos pendant lequel la tête entrait par le bord)
    follow.set({ dir: [0.2, 0.32, 1], pad: 1.22, half: 0.5, reach: 0.08 }, () => [...knobs.map((k) => k.w()), L.withers, ...low]);
    follow.frame(from === 'tail');
  }

  // La loupe du jeu dessiné, plus petite, en bas à droite (on y touche les mèches, comme dans le jeu dessiné).
  const LR = play.loupe.rect;
  const loupeAt = () => {
    const v = ctx.view;
    const k = Math.min(0.72, ((v.y1 - v.y0) * 0.42) / LR.h);
    return { k, x: v.x1 - LR.w * k - 8, y: v.y1 - LR.h * k - 8 };
  };
  const toLoupe = (p) => {
    const o = loupeAt();
    return { x: (p.x - o.x) / o.k + LR.x, y: (p.y - o.y) / o.k + LR.y };
  };
  const inLoupe = (p) => {
    const o = loupeAt();
    return p.x >= o.x && p.x <= o.x + LR.w * o.k && p.y >= o.y && p.y <= o.y + LR.h * o.k;
  };

  let started = false;
  let pulse = 0;
  let color = null;
  let doneT = 0;

  /** Montre les boutons, rubans et perles d'après l'état du jeu dessiné. */
  function sync(dt) {
    const s = play.peek();
    if (s.color && s.color !== color) {
      color = s.color;
      ribbonMat.color.setHex(RIBBON_COLORS[color] ?? RIBBON_COLORS.red);
    }
    for (let i = 0; i < nMane; i++) {
      const sec = sections[i];
      const mine = knobs.filter((k) => k.sec === i);
      const want = Math.round(mine.length * Math.min(1, sec.done));
      mine.forEach((k, j) => {
        const on = j < want;
        if (on && !k.g.visible) {
          k.g.visible = true;
          k.shown = 0;
          fxAt = k.w();
          const c = sc.project(fxAt);
          ctx.fx.burst(c.x, c.y, '✨', 2, { speed: 50, size: 12 });
        }
        if (k.g.visible) {
          k.shown = Math.min(1, k.shown + dt * 4);
          k.g.scale.setScalar(0.2 + 0.8 * smooth(k.shown));
        }
        k.band.visible = k.pom.visible = !!sec.ribbon;
      });
    }
    B.ridges();
    // la crinière rentre dans les boutons à mesure qu'on tresse (toute tressée : elle est rentrée)
    const maneDone = sections.slice(0, nMane).reduce((n, x) => n + Math.min(1, x.done), 0) / Math.max(1, nMane);
    tuck += (Math.min(1, maneDone >= 1 ? 1 : maneDone * 0.6) - tuck) * Math.min(1, dt * 3);
    if (maneU) maneU.value = tuck;
    const tail = sections.find((x) => x.tail);
    if (tail) {
      const want = Math.round(beads.length * Math.min(1, tail.done));
      beads.forEach((b, j) => { b.visible = j < want; });
      if (tailBow) tailBow.visible = !!tail.ribbon;
    }
    return s;
  }

  return {
    peek: () => ({ ...play.peek(), knobs: knobs.filter((k) => k.g.visible).length, ribbons: knobs.filter((k) => k.band.visible).length, beads: beads.filter((b) => b.visible).length, tailBow: !!tailBow?.visible, tuck, loupe: loupeAt(), view: framed, three: true }),
    down(p) {
      const s = play.peek();
      if (s.phase === 'braid') {
        if (inLoupe(p)) play.down(toLoupe(p));
        return;
      }
      if (s.phase === 'ribbons') {
        // (nouer : dans la loupe, ou sur le cheval)
        if (inLoupe(p)) play.down(toLoupe(p));
        else if (sc.pickAnimal(p.x, p.y) && s.tie) play.down(s.tie);
      }
    },
    key: (c, d) => play.key(c, d),
    update(dt) {
      play.update(dt);
      const s = sync(dt);
      pulse += dt;
      // la caméra : la section en cours (ou celle où nouer le ruban), la queue, puis tout le cheval
      const sec = s.phase === 'braid' ? s.cur : s.phase === 'ribbons' ? Math.min(sections.length - 1, sections.length - s.ribbonsLeft) : sections.length;
      const what = ctx.done ? 'end' : sections[sec]?.tail ? 'tail' : sec;
      if (!started) {
        frameFor(what);
        if (what !== 'end') sc.reframe(true);
        started = true;
      } else frameFor(what);
      follow.update(dt);
      m.look = sc.camera.position;
      m.lookAmt = 0.15;
      m.ears = 'forward';
      if (ctx.done) {
        doneT += dt;
        if (doneT < dt * 1.5) {
          nicker(sc);
          m.nod = 1;
        }
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      if (ctx.done) return;
      // La section en cours sur la vraie crinière : un rond qui pulse, relié à la loupe.
      const o = loupeAt();
      let at = null;
      if (s.phase === 'braid') {
        const sec = sections[s.cur];
        if (sec?.tail) at = tailSpots.length ? tailSpots[Math.floor(tailSpots.length / 2)][0].localToWorld(tailSpots[Math.floor(tailSpots.length / 2)][1].clone()) : L.tail;
        else {
          const mine = knobs.filter((k) => k.sec === s.cur);
          if (mine.length) at = mine[Math.floor(mine.length / 2)].w();
        }
      }
      if (at) {
        const c = sc.project(at);
        g.save();
        g.globalAlpha = 0.6 + Math.sin(ctx.time * 5) * 0.3;
        g.strokeStyle = '#ffd23a';
        g.lineWidth = 3;
        circle(g, c.x, c.y, 18);
        g.stroke();
        g.globalAlpha = 0.4;
        g.setLineDash([5, 6]);
        g.beginPath();
        g.moveTo(c.x + 16, c.y);
        g.lineTo(o.x, o.y + LR.h * o.k * 0.3);
        g.stroke();
        g.restore();
      }
      g.save();
      g.translate(o.x, o.y);
      g.scale(o.k, o.k);
      g.translate(-LR.x, -LR.y);
      play.loupe.draw(g);
      g.restore();
    },
    destroy() {
      B.remove();
      if (maneU) maneU.value = 0;
      for (const x of keep) x.dispose?.();
    },
  };
}

const smooth = (k) => k * k * (3 - 2 * k);

/** Un petit nœud de ruban en 3D : deux boucles aplaties, un nœud et deux pans. */
function bowMesh(mat, size, own) {
  const g = new THREE.Group();
  const loopGeo = own(new THREE.SphereGeometry(size, 12, 8));
  const tailGeo = own(new THREE.BoxGeometry(size * 0.5, size * 1.4, size * 0.12));
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(loopGeo, mat);
    loop.scale.set(1.1, 0.65, 0.5);
    loop.position.set(s * size * 0.95, 0, 0);
    loop.rotation.z = s * 0.3;
    g.add(loop);
    const tail = new THREE.Mesh(tailGeo, mat);
    tail.position.set(s * size * 0.4, -size * 0.9, 0);
    tail.rotation.z = s * 0.25;
    g.add(tail);
  }
  const knot = new THREE.Mesh(own(new THREE.SphereGeometry(size * 0.4, 10, 8)), mat);
  g.add(knot);
  return g;
}

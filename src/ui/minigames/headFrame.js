// La tête du cheval toujours dans l'image, dans les soins 3D (friandise, caresses, boire, manger, pansage, laver) :
//
// - headShape : les vrais bords de sa tête (bout du nez, menton, front, ganache, bouts des oreilles), mesurés une
//   fois sur le pelage du modèle (sommets liés aux os de la tête et des oreilles) puis suivis dans la pose du moment ;
//   le bout du nez « tendu » (un peu plus loin devant) laisse la place au nez qu'il avance vers nous ;
// - headFollow : un recadrage doux, sans saut, qui garde ces points dans l'image quand il tourne la tête, sans toucher
//   à la scène (src/game/care/stage.js) : toutes les demi-secondes, la caméra cadre les points fixes du jeu (la main,
//   le seau…) et la tête des dernières secondes (il tourne la tête : on ne la perd pas ; il la ramène : la caméra
//   revient doucement, sans sautiller).
//
// Avant : chaque soin cadrait une seule fois la pose photo ; quand il tendait le nez, tournait la tête vers nous ou
// la détournait, le nez, le front ou les oreilles sortaient de l'image.

import * as THREE from 'three';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Les bords de la tête du cheval de la scène. Renvoie { points(reach), rest(reach) } : points (repère monde) de la
 * pose du moment ; rest : les mêmes, mesurés au départ (pose photo, pour un cadrage fixe). reach : de combien le bout
 * du nez est tendu vers l'avant (mètres, à la taille du cheval).
 */
export function headShape(sc) {
  const md = sc.model;
  const S = sc.double?.scale ?? 1;
  // [objet du modèle, point dans son repère]
  const list = [];
  let tip = null; // le bout du nez (repère de la tête)
  if (md?.head) {
    const snout = md.dims?.snoutZ ?? 0.5;
    const found = measure(sc);
    if (found) {
      list.push(...found.points);
      tip = found.tip;
    } else {
      // (pas de squelette : les repères de la scène)
      tip = v3(0, -0.02 * snout, snout);
      list.push([md.head, v3(0, -0.12 * snout, snout * 0.97)], [md.head, v3(0, 0.06, snout * 0.25)], [md.head, v3()]);
      for (const e of md.ears ?? []) list.push([e, v3(0, 0.12, 0)]);
    }
  }
  const at = () => list.map(([o, p]) => o.localToWorld(p.clone()));
  const nose = (reach) => {
    if (!tip || !reach) return null;
    const a = md.head.localToWorld(tip.clone());
    const b = md.head.localToWorld(tip.clone().add(v3(0, 0, 0.1)));
    return a.clone().addScaledVector(b.sub(a).normalize(), reach * S);
  };
  const shape = {
    /** Les bords de la tête, pose du moment (avec le bout du nez tendu de reach mètres). */
    points(reach = 0.12) {
      if (!list.length) return [sc.live?.('muzzle'), sc.live?.('head')].filter(Boolean);
      const out = at();
      const n = nose(reach);
      if (n) out.push(n);
      return out;
    },
    /** Les mêmes, au départ du jeu (pose photo). */
    rest: null,
  };
  // (le jeu démarre sur la pose photo : la scène vient d'être construite)
  const rest = list.length ? at() : [];
  shape.rest = (reach = 0.12) => {
    const out = rest.map((p) => p.clone());
    if (tip && reach && md?.head) {
      // (le nez tendu dans le sens de la tête au repos : du milieu de la tête vers le bout du nez)
      const mid = sc.marks?.head ?? null;
      const n = out[0];
      if (mid && n) out.push(n.clone().addScaledVector(n.clone().sub(mid).normalize(), reach * S));
    }
    return out;
  };
  return shape;
}

/**
 * Sommets du pelage liés à la tête et aux oreilles : dans le repère de la tête, le plus en avant (bout du nez), le
 * plus bas (menton), le plus haut (front), le plus en arrière (ganache) ; dans le repère de chaque oreille, le plus
 * loin de sa base (le bout). null si le modèle n'a pas de squelette lisible.
 */
function measure(sc) {
  const md = sc.model;
  const px = sc.proxy;
  if (!px || !md.head) return null;
  try {
    px.bake();
  } catch {
    return null;
  }
  if (!px.skeleton || !px.bones?.length) return null;
  const names = px.skeleton.bones.map((b) => b.name);
  const ears = md.ears ?? [];
  const p = v3();
  const best = { front: null, low: null, high: null, back: null };
  const score = { front: -Infinity, low: -Infinity, high: -Infinity, back: -Infinity };
  const earBest = ears.map(() => null);
  const earLen = ears.map(() => -1);
  for (let i = 0; i < px.bones.length; i++) {
    const n = names[px.bones[i]];
    if (n === 'Head') {
      md.head.worldToLocal(p.set(px.pos[i * 3], px.pos[i * 3 + 1], px.pos[i * 3 + 2]));
      const s = { front: p.z, low: -p.y + p.z * 0.05, high: p.y + p.z * 0.05, back: -p.z - p.y * 0.3 };
      for (const k of Object.keys(s)) {
        if (s[k] > score[k]) {
          score[k] = s[k];
          best[k] = p.clone();
        }
      }
    } else if (n === 'EarL' || n === 'EarR') {
      const k = n === 'EarL' ? 0 : 1;
      const e = ears[k];
      if (!e) continue;
      e.worldToLocal(p.set(px.pos[i * 3], px.pos[i * 3 + 1], px.pos[i * 3 + 2]));
      const d = p.length();
      if (d > earLen[k]) {
        earLen[k] = d;
        earBest[k] = p.clone();
      }
    }
  }
  if (!best.front) return null;
  const points = Object.values(best).filter(Boolean).map((q) => [md.head, q]);
  ears.forEach((e, k) => {
    if (earBest[k]) points.push([e, earBest[k]]);
  });
  return { points, tip: best.front.clone() };
}

/**
 * Recadrage doux qui garde la tête dans l'image. fixed() : points du jeu à garder aussi (repère monde : la main, le
 * seau…). o : { dir, pad, half (demi-vie du fondu, s), every (s entre deux cadrages), memory (nombre de poses de la tête
 * gardées), reach (nez tendu) }. Renvoie { update(dt), frame(now), set(o), reset(), on }.
 */
export function headFollow(sc, shape, fixed = () => [], o = {}) {
  const opts = { dir: [0.4, 0.2, 1], pad: 1.4, half: 0.6, every: 0.3, memory: 10, reach: 0.12, ...o };
  const recent = [];
  let t = 0;
  const f = {
    on: true,
    opts,
    /** Cadre tout de suite (now : sans fondu). */
    frame(now = false) {
      recent.push(shape.points(opts.reach));
      while (recent.length > opts.memory) recent.shift();
      sc.frame([...fixed(), ...recent.flat()], { dir: opts.dir, pad: opts.pad, half: opts.half, now, lift: opts.lift ?? 0, raise: opts.raise ?? 0 });
    },
    update(dt) {
      if (!f.on) return;
      t += dt;
      if (t >= opts.every) {
        t = 0;
        f.frame(false);
      }
    },
    /** Change les réglages (nouvelle étape du jeu) ; la tête des dernières secondes est oubliée. */
    set(o2 = {}, fixed2 = null) {
      Object.assign(opts, o2);
      if (fixed2) fixed = fixed2;
      recent.length = 0;
      t = 0;
    },
    reset() {
      recent.length = 0;
      t = 0;
    },
  };
  return f;
}

/**
 * Marges de la tête dans l'image (fractions de la largeur et de la hauteur de la partie visible de la toile) : pour
 * les tests et les mesures. points : repère monde ; renvoie { left, right, top, bottom, width, min }.
 */
export function headMargins(sc, points) {
  const w = sc.size.w;
  const h = sc.size.h;
  const top = sc.focus ? sc.focus.top : 0;
  const bottom = sc.focus ? sc.focus.bottom : h;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  const p = v3();
  for (const q of points) {
    p.copy(q).project(sc.camera);
    const x = (p.x * 0.5 + 0.5) * w;
    const y = (-p.y * 0.5 + 0.5) * h;
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const hh = Math.max(1, bottom - top);
  const m = { left: x0 / w, right: 1 - x1 / w, top: (y0 - top) / hh, bottom: (bottom - y1) / hh, width: (x1 - x0) / w };
  m.min = Math.min(m.left, m.right, m.top, m.bottom);
  return m;
}

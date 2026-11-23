// Petits outils communs aux soins du cheval refaits en 3D dans le chantier « seller, brider, vermifuge, maréchal,
// curer » (saddle3d.js, bridle3d.js, deworm3d.js, shoe3d.js, clean3d.js) : ce qu'on crée et qu'il faut libérer,
// l'équipement réel posé en pièces rigides, l'impatience du cheval, la pastille de l'étape, la retouche de la pose
// après l'animation (stage.afterLife).

import * as THREE from 'three';
import { buildGear, removeGear } from '../../game/gearModels.js';
import { rrect, label } from './draw.js';
import { snort } from './feed3d.js';

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const smooth = (k) => k * k * (3 - 2 * k);
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Ce qu'un jeu crée (géométries, matières, textures) : own(x) le garde, free() libère tout. */
export function owner() {
  const list = [];
  const own = (x) => {
    list.push(x);
    return x;
  };
  own.free = () => {
    for (const x of list) x.dispose?.();
    list.length = 0;
  };
  return own;
}

/**
 * L'équipement du jeu (gearModels.js buildGear) posé sur le double de la scène, en pièces RIGIDES (pas liées au
 * squelette : on peut les déplacer, les porter, les faire glisser le long du dos). gear : { pad, saddle, bridle… }.
 * Renvoie { group, meshes, dispose } ; les pièces sont dans le repère de leur parent (model.body, model.head).
 */
export function rigidGear(sc, gear) {
  const md = sc.model;
  // (une copie du modèle sans skinGear : pièces posées telles quelles ; et sans toucher au toupet du vrai modèle)
  const proxy = Object.create(md);
  proxy.skinGear = null;
  proxy.setForelockTucked = null;
  const group = buildGear(proxy, sc.a?.look ?? {}, gear);
  const meshes = group.userData.meshes ?? [];
  for (const m of meshes) {
    m.traverse?.((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
  return { group, meshes, dispose: () => removeGear(group) };
}

/**
 * L'impatience : trop longtemps sans rien faire (après `after` secondes), le cheval gratte du pied, s'ébroue, couche
 * un instant les oreilles et secoue la tête. update(dt, busy) : busy = on est en train de faire quelque chose.
 * leg : le membre qui gratte (model.legs : 0 FL, 1 FR — celui de notre côté —, 2 HL, 3 HR).
 * Renvoie { update, poke (remet à zéro), level (0 à 1) }.
 */
export function impatience(sc, { after = 9, every = 4.5, leg = 1 } = {}) {
  const m = sc.mood;
  let idle = 0;
  let paw = 0;
  let next = after;
  return {
    get level() {
      return Math.min(1, Math.max(0, (idle - after) / 8));
    },
    poke() {
      idle = 0;
      next = after;
    },
    update(dt, busy = false, { canPaw = true } = {}) {
      idle = busy ? 0 : idle + dt;
      if (busy) next = after;
      if (idle > next) {
        next = idle + every;
        paw = 1.1;
        m.annoyed = Math.max(m.annoyed, 0.7);
        m.nod = Math.max(m.nod, 0.9);
        snort(sc);
      }
      if (paw > 0) {
        paw -= dt;
        // (gratter du pied : l'antérieur se lève un peu et retombe, deux fois)
        if (canPaw) {
          m.lift = Math.sin(paw * 9) > 0 ? leg : null;
          m.liftMax = 0.32;
        }
        if (paw <= 0 && canPaw) m.lift = null;
      }
      return paw > 0;
    },
  };
}

/** La pastille de l'étape en haut (« 2/3 · La selle »), comme les jeux dessinés. */
export function stagePill(g, i, n, name, y = 8, x = 200) {
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.88)';
  rrect(g, x - 82, y, 164, 30, 15);
  g.fill();
  label(g, `${i + 1}/${n} · ${name}`, x, y + 15, 16, '#23302a');
  g.restore();
}

/**
 * Retouche de la pose après l'animation du modèle (oreilles pliées, ventre gonflé, tête relevée) : fn(dt, stage) est
 * appelée à chaque image juste après la vie de l'animal (stage.afterLife). Renvoie de quoi la retirer.
 */
export function afterLife(sc, fn) {
  (sc.afterLife ??= []).push(fn);
  return () => {
    sc.afterLife = (sc.afterLife ?? []).filter((f) => f !== fn);
  };
}

/** Une petite cible qui pulse (anneau blanc posé face à la caméra), là où toucher. */
export function pulseRing(own, { color = 0xffffff, r = 0.035 } = {}) {
  const mat = own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, toneMapped: false }));
  const ring = new THREE.Mesh(own(new THREE.RingGeometry(r * 0.78, r, 40)), mat);
  ring.renderOrder = 20;
  ring.userData.baseOpacity = 0.8;
  return ring;
}

/** L'anneau regarde la caméra et pulse. */
export function updateRing(ring, sc, time, at) {
  if (at) ring.position.copy(at);
  ring.quaternion.copy(sc.camera.quaternion);
  const k = 1 + Math.sin(time * 5) * 0.12;
  ring.scale.setScalar(k);
  ring.material.opacity = 0.55 + Math.sin(time * 5) * 0.25;
}

/**
 * La manche de notre main (props.js handModel) est un tube ouvert : vu de face, on voyait l'intérieur. On la ferme
 * (nouvelle géométrie à nous, rendue par own à la fermeture du jeu) ; ne touche qu'à cette main-là.
 */
export function closeSleeve(hand, own) {
  hand.traverse((o) => {
    const p = o.geometry?.parameters;
    if (o.isMesh && o.geometry?.type === 'CylinderGeometry' && p?.openEnded) {
      o.geometry = own(new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, p.radialSegments, 1, false));
    }
  });
  return hand;
}

const _hw = new THREE.Vector3();
const _hd = new THREE.Vector3();
const _hw2 = new THREE.Vector3();
const _hq = new THREE.Quaternion();
const _hray = new THREE.Ray();

/**
 * La copie figée de la pose refaite MAINTENANT (os et repères de l'image en cours) : la peau qu'on mesure est celle
 * qu'on voit.
 */
export function bakeSkin(sc) {
  sc.holder.updateMatrixWorld(true);
  const px = sc.proxy;
  if (!px) return null;
  if (!px.parts) px.prepare();
  px.skeleton?.update?.();
  px.bake();
  px.at = sc.time ?? 0;
  return px;
}

/** Les points touchés par un rayon (repère monde) sur la copie figée, du plus proche au plus loin, avec leur triangle. */
function skinHits(px, ray) {
  if (!px.parts) px.bake();
  px.ray.ray.copy(ray);
  return px.ray.intersectObject(px.mesh, false).map((h) => {
    const w = px.wrap(h, ray);
    w.face = h.face;
    return w;
  });
}

/** Où est un sommet de la copie figée dans son maillage d'origine (maillage, indice). */
function sourceOf(px, k) {
  let base = 0;
  for (const part of px.parts) {
    if (k < base + part.list.length) return { m: part.m, i: part.list[k - base] };
    base += part.list.length;
  }
  return null;
}

const _ga = new THREE.Vector3();
const _gb = new THREE.Vector3();
const _gc = new THREE.Vector3();
const _tri = new THREE.Triangle();
/**
 * Une « colle » sur la peau : le triangle touché et la place du point dedans (coordonnées barycentriques). À chaque
 * image, gluePoint refait le point avec la peau déformée de l'image (os de la tête, de l'encolure…) : une lanière
 * collée suit la gorge qui se plie quand il baisse la tête.
 */
function glueOf(px, h) {
  const f = h.face;
  if (!f) return null;
  const P = px.pos;
  _tri.set(_ga.fromArray(P, f.a * 3), _gb.fromArray(P, f.b * 3), _gc.fromArray(P, f.c * 3));
  const bary = _tri.getBarycoord(h.point, new THREE.Vector3());
  if (!bary) return null;
  const src = [f.a, f.b, f.c].map((k) => sourceOf(px, k));
  if (src.some((x) => !x)) return null;
  // (le sens de la normale du triangle vers le dehors : celui du rayon qui l'a touché)
  const n = _tri.getNormal(new THREE.Vector3());
  return { src, bary, sign: n.dot(h.normal) >= 0 ? 1 : -1 };
}
const _gv = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
const _gt = new THREE.Vector3();
/** Le point du triangle collé, pose de l'image (remap : des os remplacés, voir skinRemapped). */
function gluedAt(g, out, remap) {
  for (let k = 0; k < 3; k++) {
    const { m, i } = g.src[k];
    const v = _gv[k].fromBufferAttribute(m.geometry.attributes.position, i);
    if (m.isSkinnedMesh) {
      if (remap) skinRemapped(m, i, v, remap);
      else m.applyBoneTransform(i, v);
    }
    v.applyMatrix4(m.matrixWorld);
  }
  return out.set(0, 0, 0).addScaledVector(_gv[0], g.bary.x).addScaledVector(_gv[1], g.bary.y).addScaledVector(_gv[2], g.bary.z);
}
/**
 * Le point collé et sa normale (repère monde), avec la pose de l'image. out : { p, n }. Avec g.remap (des os
 * remplacés, par exemple l'oreille par la tête) : le point suit la tête, sans glisser avec l'oreille, mais se soulève
 * si la peau de la base de l'oreille gonfle vers le dehors (jamais dedans).
 */
export function gluePoint(g, out) {
  if (g.remap) {
    gluedAt(g, _gt, null);
    gluedAt(g, out.p, g.remap);
    _tri.set(_gv[0], _gv[1], _gv[2]).getNormal(out.n);
    out.n.multiplyScalar(g.sign);
    // (la peau qui a bougé : sa hauteur au-dessus du point, moins ce qu'elle a glissé de côté — partie ailleurs,
    // elle ne soulève plus la lanière ici)
    const d = _gt.sub(out.p);
    const up = d.dot(out.n);
    const side = Math.sqrt(Math.max(0, d.lengthSq() - up * up));
    const lift = up - 0.5 * side;
    if (lift > 0) out.p.addScaledVector(out.n, lift);
    return out;
  }
  gluedAt(g, out.p, null);
  _tri.set(_gv[0], _gv[1], _gv[2]).getNormal(out.n);
  out.n.multiplyScalar(g.sign);
  return out;
}
const _rb = new THREE.Vector3();
const _rv = new THREE.Vector3();
const _rm = new THREE.Matrix4();
const _remaps = new WeakMap();
/** Les indices d'os remplacés pour ce squelette (-1 : gardé), calculés une fois. */
function remapIndex(sk, remap) {
  let per = _remaps.get(sk);
  if (!per) _remaps.set(sk, (per = new Map()));
  let out = per.get(remap);
  if (!out) {
    out = sk.bones.map((b) => (remap[b.name] ? sk.bones.findIndex((x) => x.name === remap[b.name]) : -1));
    per.set(remap, out);
  }
  return out;
}
/** Comme applyBoneTransform, mais un os (par son nom) est remplacé par un autre : remap = { EarL: 'Head', … }. */
function skinRemapped(m, i, v, remap) {
  const sk = m.skeleton;
  const si = m.geometry.attributes.skinIndex;
  const sw = m.geometry.attributes.skinWeight;
  _rb.copy(v).applyMatrix4(m.bindMatrix);
  v.set(0, 0, 0);
  for (let k = 0; k < 4; k++) {
    const w = sw.getComponent(i, k);
    if (!w) continue;
    let b = si.getComponent(i, k);
    const j = remapIndex(sk, remap)[b];
    if (j >= 0) b = j;
    _rm.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b]);
    v.addScaledVector(_rv.copy(_rb).applyMatrix4(_rm), w);
  }
  return v.applyMatrix4(m.bindMatrixInverse);
}

/**
 * Combien la peau d'une colle suit des os dont le nom répond à re (0 à 1 : le plus fort des trois sommets). Sert à ne
 * pas coller une lanière à la base d'une oreille : cette peau-là suit l'oreille quand il la couche.
 */
export function glueWeight(g, re) {
  if (!g) return 0;
  let best = 0;
  for (const { m, i } of g.src) {
    if (!m.isSkinnedMesh) continue;
    const si = m.geometry.attributes.skinIndex;
    const sw = m.geometry.attributes.skinWeight;
    const bones = m.skeleton?.bones;
    if (!si || !sw || !bones) continue;
    let w = 0;
    for (let k = 0; k < 4; k++) {
      const b = bones[si.getComponent(i, k)];
      if (b && re.test(b.name)) w += sw.getComponent(i, k);
    }
    best = Math.max(best, w);
  }
  return best;
}
/** La peau de l'image en cours : les os à jour (avant le rendu), pour gluePoint. */
export function skinNow(sc) {
  sc.model?.root?.updateMatrixWorld(true);
  sc.proxy?.skeleton?.update?.();
}

/**
 * Un point posé sur la peau, dans le repère de obj (la tête) : un rayon part de loin, du côté d (repère de obj), et
 * descend vers p ; le premier point de peau touché (skip(h) : un point à ne pas prendre, une oreille par exemple),
 * décalé de margin le long de la normale. Renvoie { p, n, glue } (repère de obj ; glue : de quoi le refaire à chaque
 * image avec gluePoint), ou le point du guide (miss) si le rayon ne touche rien avant p. bakeSkin avant.
 */
export function skinPoint(sc, obj, p, d, { margin = 0.007, reach = 0.6, skip = null } = {}) {
  const dl = _hd.copy(d).normalize();
  const from = obj.localToWorld(_hw.copy(p).addScaledVector(dl, reach));
  const scale = obj.getWorldScale(_hw2).x;
  obj.getWorldQuaternion(_hq);
  _hray.origin.copy(from);
  _hray.direction.copy(dl).applyQuaternion(_hq).negate();
  const h = skinHits(sc.proxy, _hray).find((x) => x.distance < reach * scale && !(skip && skip(x)));
  if (!h) return { p: p.clone(), n: d.clone().normalize(), miss: true };
  const n = h.normal.clone().applyQuaternion(_hq.invert()).normalize();
  const q = obj.worldToLocal(h.point.clone()).addScaledVector(n, margin / scale);
  return { p: q, n, bone: h.bone, glue: glueOf(sc.proxy, h) };
}

/**
 * Pour skinPoint : un point sur une oreille elle-même (elle dépasse du crâne de plus de 12 mm au-dessus de sa base),
 * pas sur le crâne autour de sa base (sa peau suit aussi l'os de l'oreille).
 */
export function earSkip(model) {
  const head = model.head;
  const ears = (model.ears ?? []).filter((e) => e.parent === head);
  const v = new THREE.Vector3();
  const out = ears.map((e) => e.position.clone().setZ(0).setY(e.position.y + 0.02).normalize());
  return (h) => {
    if (!/Ear/.test(h.boneName) || !head) return false;
    head.worldToLocal(v.copy(h.point));
    const s = head.getWorldScale(new THREE.Vector3()).x || 1;
    return ears.some((e, i) => {
      const d = v.clone().sub(e.position);
      return d.dot(out[i]) * s > 0.012;
    });
  };
}

/**
 * Une lanière de cuir plate (section rectangulaire, faces nettes) le long de points et de leurs normales (la peau) :
 * hw demi-largeur, th épaisseur. Renvoie { geo, set(pts, nrm) } : set refait les sommets sans rien réallouer (même
 * nombre de points).
 */
export function ribbon(n, { hw = 0.011, th = 0.0045, closed = false } = {}) {
  const geo = new THREE.BufferGeometry();
  const segs = closed ? n : n - 1;
  const vCount = 4 * 2 * n + (closed ? 0 : 8);
  const pos = new Float32Array(vCount * 3);
  const nor = new Float32Array(vCount * 3);
  const idx = [];
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < segs; i++) {
      const a = s * 2 * n + i * 2;
      const b = s * 2 * n + ((i + 1) % n) * 2;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  if (!closed) {
    const c0 = 8 * n;
    idx.push(c0, c0 + 2, c0 + 1, c0, c0 + 3, c0 + 2, c0 + 4, c0 + 5, c0 + 6, c0 + 4, c0 + 6, c0 + 7);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setIndex(idx);
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  const N = new THREE.Vector3();
  const c = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const put = (arr, k, v) => {
    arr[k * 3] = v.x;
    arr[k * 3 + 1] = v.y;
    arr[k * 3 + 2] = v.z;
  };
  function set(pts, nrm) {
    for (let i = 0; i < n; i++) {
      const prev = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
      const next = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
      T.subVectors(next, prev).normalize();
      N.copy(nrm[i]).addScaledVector(T, -nrm[i].dot(T)).normalize();
      B.crossVectors(T, N).normalize();
      const p = pts[i];
      // coins : 0 dessus-gauche, 1 dessus-droite, 2 dessous-droite, 3 dessous-gauche
      c[0].copy(p).addScaledVector(N, th / 2).addScaledVector(B, -hw);
      c[1].copy(p).addScaledVector(N, th / 2).addScaledVector(B, hw);
      c[2].copy(p).addScaledVector(N, -th / 2).addScaledVector(B, hw);
      c[3].copy(p).addScaledVector(N, -th / 2).addScaledVector(B, -hw);
      // faces : dessus (c0,c1 ; +N), droite (c1,c2 ; +B), dessous (c2,c3 ; -N), gauche (c3,c0 ; -B)
      const faces = [[0, 1, N, 1], [1, 2, B, 1], [2, 3, N, -1], [3, 0, B, -1]];
      for (let s = 0; s < 4; s++) {
        const [u, v, dir, sg] = faces[s];
        const k = s * 2 * n + i * 2;
        put(pos, k, c[u]);
        put(pos, k + 1, c[v]);
        nor[k * 3] = nor[k * 3 + 3] = dir.x * sg;
        nor[k * 3 + 1] = nor[k * 3 + 4] = dir.y * sg;
        nor[k * 3 + 2] = nor[k * 3 + 5] = dir.z * sg;
      }
      if (!closed && (i === 0 || i === n - 1)) {
        const k0 = 8 * n + (i === 0 ? 0 : 4);
        const sg = i === 0 ? -1 : 1;
        for (let j = 0; j < 4; j++) {
          put(pos, k0 + j, c[j]);
          nor[(k0 + j) * 3] = T.x * sg;
          nor[(k0 + j) * 3 + 1] = T.y * sg;
          nor[(k0 + j) * 3 + 2] = T.z * sg;
        }
      }
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.normal.needsUpdate = true;
    geo.computeBoundingSphere();
  }
  return { geo, set };
}

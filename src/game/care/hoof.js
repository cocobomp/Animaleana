// La sole d'un sabot, pour le cure-pied (src/ui/minigames/pansage3d.js) : la paroi de corne, la ligne blanche, la sole,
// la fourchette (le triangle sensible), les mottes de terre tassée et parfois un caillou. Posée sous le sabot du vrai
// modèle, liée à son boulet : quand le cheval lève le pied (stage.mood.lift), elle monte avec lui et se montre.
// Les mottes sont placées comme dans le jeu dessiné (pansage.js makeHoof : u du talon -1 à la pince +1, w de gauche à
// droite), et tout ce que le jeu compare au doigt est projeté à l'écran (blobScreen, inFrog, toeDir…).

import * as THREE from 'three';
import { noiseTexture, rng } from './textures.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Contour du sabot vu de dessous (repère de la sole : pince en +x, talons en -x), rayon 1. */
export function hoofOutline(n = 28) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    let x = Math.cos(a) * (Math.cos(a) > 0 ? 1.05 : 0.92);
    let z = Math.sin(a) * 0.96;
    // talons : un peu plus droits et écartés
    if (x < -0.55) z *= 1.04;
    if (x < -0.8) x = -0.8 - (x + 0.8) * 0.4;
    pts.push(new THREE.Vector2(x, z));
  }
  return pts;
}

/** Le triangle de la fourchette (repère de la sole, rayon 1) : base aux talons, pointe vers la pince. */
export const FROG = [[-0.86, -0.34], [-0.86, 0.34], [0.32, 0]];

/** Le point (px, py) est-il dans le triangle (a, b, c) ? */
export function inTriangle(px, py, a, b, c) {
  const s = (p, q, r) => (p.x - r.x) * (q.y - r.y) - (q.x - r.x) * (p.y - r.y);
  const P = { x: px, y: py };
  const d1 = s(P, a, b);
  const d2 = s(P, b, c);
  const d3 = s(P, c, a);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

/**
 * La sole sous le sabot de ce membre (leg : un élément de model.legs). blobs : [{ u, w, r, stone, seed }] (u, w, r en
 * part du rayon du sabot). own(x) : à libérer avec le jeu.
 */
export function hoofSole(sc, leg, blobs, own, { radius = null } = {}) {
  const md = sc.model;
  // (radius : le rayon du bas du sabot du modèle, mesuré ; la sole le couvre tout entier, sinon le bord du sabot,
  // en grosses facettes, dépassait autour d'elle)
  const R = Math.max((md.dims?.legR ?? 0.065) * 1.08, (radius ?? 0) / sc.double.scale * 1.06);
  const g = new THREE.Group();
  g.scale.setScalar(R);
  // (au repos, les groupes des membres n'ont pas de rotation : la sole est sous le boulet, normale vers le bas)
  g.position.copy(leg.hoof).sub(leg.fetlockRest).add(v3(0, -0.004, 0));
  g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(v3(0, 0, 1), v3(0, -1, 0), v3(1, 0, 0)));
  leg.fetlock.add(g);

  const outline = hoofOutline();
  const shapeOf = (k) => new THREE.Shape(outline.map((p) => new THREE.Vector2(p.x * k, p.y * k)));
  const flat = (geo, y) => {
    geo.rotateX(-Math.PI / 2); // (forme dans xy → plan xz, face vers +y)
    geo.scale(1, 1, -1); // (le y de la forme devient z)
    geo.translate(0, y, 0);
    geo.computeVertexNormals();
    return geo;
  };
  const horn = own(new THREE.MeshStandardMaterial({ color: 0x3a302a, roughness: 0.55, side: THREE.DoubleSide }));
  const soleTex = own(noiseTexture('#b8a88f', 0.2, 13, 64));
  const soleMat = own(new THREE.MeshStandardMaterial({ map: soleTex, color: 0xffffff, roughness: 0.9, side: THREE.DoubleSide }));
  const whiteLine = own(new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.8, side: THREE.DoubleSide }));
  const frogMat = own(new THREE.MeshStandardMaterial({ color: 0x75685c, roughness: 0.8, side: THREE.DoubleSide }));
  // paroi (anneau), ligne blanche, sole
  const wallShape = shapeOf(1.0);
  wallShape.holes.push(new THREE.Path(outline.map((p) => new THREE.Vector2(p.x * 0.85, p.y * 0.85)).reverse()));
  g.add(new THREE.Mesh(own(flat(new THREE.ShapeGeometry(wallShape, 4), 0.06)), horn));
  const wl = shapeOf(0.85);
  wl.holes.push(new THREE.Path(outline.map((p) => new THREE.Vector2(p.x * 0.8, p.y * 0.8)).reverse()));
  g.add(new THREE.Mesh(own(flat(new THREE.ShapeGeometry(wl, 4), 0.05)), whiteLine));
  g.add(new THREE.Mesh(own(flat(new THREE.ShapeGeometry(shapeOf(0.8), 4), 0.02)), soleMat));
  // bord de la paroi (épaisseur visible de côté)
  const rim = new THREE.Mesh(own(new THREE.CylinderGeometry(1, 1, 0.12, 28, 1, true)), horn);
  rim.position.y = 0.0;
  rim.scale.set(1.0, 1, 0.96);
  g.add(rim);
  // fourchette : un triangle bombé, avec sa lacune centrale
  const fs = new THREE.Shape([new THREE.Vector2(FROG[0][0], FROG[0][1]), new THREE.Vector2(FROG[2][0], FROG[2][1]), new THREE.Vector2(FROG[1][0], FROG[1][1])]);
  const frogGeo = own(new THREE.ExtrudeGeometry(fs, { depth: 0.06, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.05, bevelSegments: 2 }));
  frogGeo.rotateX(-Math.PI / 2);
  frogGeo.scale(1, 1, -1);
  frogGeo.translate(0, 0.02, 0);
  frogGeo.computeVertexNormals();
  g.add(new THREE.Mesh(frogGeo, frogMat));
  const cleft = new THREE.Mesh(own(new THREE.BoxGeometry(0.7, 0.03, 0.05)), own(new THREE.MeshStandardMaterial({ color: 0x3a3029, roughness: 1 })));
  cleft.position.set(-0.45, 0.13, 0);
  g.add(cleft);
  // mottes de terre
  const r = rng(31);
  const dirtTex = own(noiseTexture('#4e3622', 0.22, 17, 64));
  const dirtMat = own(new THREE.MeshStandardMaterial({ map: dirtTex, color: 0xffffff, roughness: 1 }));
  const lump = own(lumpyBall(5));
  const stoneMat = own(new THREE.MeshStandardMaterial({ color: 0x8f8b86, roughness: 0.6 }));
  const stoneGeo = own(lumpyBall(9, 0.25));
  const items = blobs.map((b) => {
    const m = new THREE.Mesh(lump, dirtMat);
    const size = b.r * 1.25;
    m.position.set(b.u * 0.82, 0.1, b.w * 0.85);
    m.scale.set(size, size * 0.55, size);
    m.rotation.y = r() * 6;
    m.castShadow = true;
    g.add(m);
    let stone = null;
    if (b.stone) {
      stone = new THREE.Mesh(stoneGeo, stoneMat);
      stone.position.set(b.u * 0.82, 0.16, b.w * 0.85);
      stone.scale.setScalar(0.17);
      g.add(stone);
    }
    return { b, m, size, stone };
  });

  const W = (x, y = 0.1, z = 0) => g.localToWorld(v3(x, y, z));
  const P = (w) => sc.project(w);
  return {
    group: g,
    /** Cadrage du pied levé : le contour et le bas du membre, vus de face (normale de la sole). */
    frameInfo() {
      g.updateWorldMatrix(true, false);
      const pts = outline.filter((_, i) => i % 4 === 0).map((p) => W(p.x * 1.2, 0, p.y * 1.2));
      pts.push(leg.fetlock.getWorldPosition(v3()));
      const n = W(0, 1, 0).sub(W(0, 0, 0)).normalize();
      // (d'en haut et du côté de ce pied — l'autre côté du cheval pour un pied gauche — : jamais sous le sol ni dans
      // le ventre ; la sole, tournée vers le haut, se voit bien)
      const side = leg.side === 1 ? -1 : 1;
      const dir = n.clone().add(v3(0, 0.35, side * 0.9)).normalize();
      return { points: pts, dir: dir.toArray() };
    },
    center() { return P(W(0, 0.1, 0)); },
    /** (mesures : où est la sole, vers où elle regarde) */
    where() {
      g.updateWorldMatrix(true, false);
      const o = W(0, 0, 0);
      return { p: o.toArray().map((x) => +x.toFixed(3)), n: W(0, 1, 0).sub(o).normalize().toArray().map((x) => +x.toFixed(3)) };
    },
    /** Sens talon → pince à l'écran (vecteur unité). */
    toeDir() {
      const a = P(W(-0.8));
      const b = P(W(0.9));
      const l = Math.hypot(b.x - a.x, b.y - a.y) || 1;
      return { x: (b.x - a.x) / l, y: (b.y - a.y) / l };
    },
    /** Le doigt sur la fourchette (le triangle, en plus petit) : ça pique. */
    inFrog(x, y) {
      const c = FROG.reduce((s, p) => [s[0] + p[0] / 3, s[1] + p[1] / 3], [0, 0]);
      const tri = FROG.map(([u, w]) => P(W(c[0] + (u - c[0]) * 0.7, 0.12, c[1] + (w - c[1]) * 0.7)));
      return inTriangle(x, y, tri[0], tri[1], tri[2]);
    },
    frogScreen() {
      const c = FROG.reduce((s, p) => [s[0] + p[0] / 3, s[1] + p[1] / 3], [0, 0]);
      return P(W(c[0], 0.12, c[1]));
    },
    blobScreen(i) {
      const it = items[i];
      const w = it.m.getWorldPosition(v3());
      const p = P(w);
      p.r = Math.max(9, sc.projectRadius(w, it.size * R * sc.double.scale * 1.15));
      return p;
    },
    /** La motte i : k de 1 (pleine) à 0 (partie). */
    setDirt(i, k) {
      const it = items[i];
      it.m.visible = k > 0.02;
      it.m.scale.set(it.size * (0.45 + 0.55 * k), it.size * 0.55 * k, it.size * (0.45 + 0.55 * k));
    },
    /** Le caillou saute du pied. */
    popStone(i) {
      const it = items[i];
      if (!it.stone) return;
      const w = it.stone.getWorldPosition(v3());
      g.remove(it.stone);
      const pebble = new THREE.Mesh(stoneGeo, stoneMat);
      pebble.scale.setScalar(0.17 * R * sc.double.scale);
      pebble.position.copy(w);
      sc.spawn(pebble, { life: 1.2, v: W(0, 1, 0).sub(W(0, 0, 0)).normalize().multiplyScalar(1.2).add(v3(0.3, 1.2, 0.4)), grav: 9.8, fade: false });
      // (la géométrie et la matière sont au pied : la scène ne doit pas les libérer)
      pebble.geometry = stoneGeo;
      stoneGeo.userData.shared = true;
      stoneMat.userData.shared = true;
      it.stone = null;
    },
    /** Le doigt sur la sole ? (rayon contre le plan de la sole, dans le contour) */
    pickSole(x, y) {
      g.updateWorldMatrix(true, false);
      const ray = sc.rayAt(x, y);
      const o = W(0, 0.1, 0);
      const n = W(0, 1, 0).sub(W(0, 0, 0)).normalize();
      const den = n.dot(ray.direction);
      if (Math.abs(den) < 1e-4) return null;
      const tt = o.clone().sub(ray.origin).dot(n) / den;
      if (tt <= 0) return null;
      const hit = ray.origin.clone().addScaledVector(ray.direction, tt);
      const local = g.worldToLocal(hit.clone());
      if (Math.hypot(local.x, local.z) > 1.25) return null;
      return { point: hit, normal: n };
    },
    remove() {
      g.parent?.remove(g);
    },
  };
}

/** Petite boule bosselée (motte de terre, caillou). */
function lumpyBall(seed, amp = 0.22) {
  // (plus fine et moins bosselée : une motte de terre tassée, pas une boule de papier froissé)
  const geo = new THREE.IcosahedronGeometry(1, 3);
  const p = geo.attributes.position;
  const r = rng(seed);
  for (let i = 0; i < p.count; i++) {
    const k = 1 - amp / 2 + r() * amp;
    p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k);
  }
  geo.computeVertexNormals();
  return geo;
}

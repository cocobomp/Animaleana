// Le pied de la chèvre vu par-dessous, pour parer les onglons (src/ui/minigames/hoofTrim3d.js) : le sabot fendu
// (deux onglons, chacun avec sa paroi de corne, sa sole claire, la ligne blanche entre les deux, et les talons
// souples), et la corne qui a trop poussé au bout de chaque onglon et se replie sur la sole. Le sécateur à onglons
// (lames courtes, poignées orange). Tout est construit dans le repère du pied : x vers la pince (le bout du pied),
// y vers l'extérieur de la sole, z en travers ; L : longueur de la sole (m).
//
// Le long de chaque onglon, la position u de la lame (celle du jeu dessiné, grooming.js nailsGame) : 0 au milieu de
// la sole (le vif, rose, jusqu'à QUICK), TOE au bout de la sole (la pince), 1 au bout de la corne qui a poussé.

import * as THREE from 'three';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** u du bout de la sole (là où la corne en trop commence) : couper juste là, c'est le milieu de la zone verte. */
export const TOE = 0.56;
const SAMPLES = 16;

const shadowed = (m, cast = true) => {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
};

/** Contour d'un onglon (côté s = ±1), dans le plan de la sole (x : vers la pince ; y de la forme = −z). */
function digitShape(L, Wd, gap, s, inset = 0) {
  const sh = new THREE.Shape();
  const x0 = -L / 2 + inset;
  const x1 = L / 2 - inset;
  const zi = gap + inset;
  const zo = gap + Wd - inset;
  const Y = (z) => -s * z;
  sh.moveTo(x0 + L * 0.06, Y(zi));
  sh.lineTo(x1 - L * 0.08, Y(zi));
  // la pince : pointue côté fente, arrondie côté dehors
  sh.quadraticCurveTo(x1, Y(zi), x1, Y(zi + (zo - zi) * 0.3));
  sh.quadraticCurveTo(x1 - L * 0.1, Y(zo), x0 + L * 0.55, Y(zo));
  sh.lineTo(x0 + L * 0.18, Y(zo - (zo - zi) * 0.04));
  // le talon
  sh.quadraticCurveTo(x0, Y(zo - (zo - zi) * 0.1), x0, Y((zi + zo) / 2));
  sh.quadraticCurveTo(x0, Y(zi), x0 + L * 0.06, Y(zi));
  return sh;
}

function extrude(shape, depth, bevel, keep) {
  const g = keep(new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 }));
  g.rotateX(-Math.PI / 2); // (forme : x, y = −z ; épaisseur → +y, hors de la sole)
  return g;
}

/**
 * La corne en trop (un onglon) : une lame de corne qui part du bout de la sole, avance puis se replie vers la sole,
 * effilée. Renvoie la courbe de l'onglon (u de 0 à 1) et une fonction qui fait la géométrie de u0 à u1.
 */
function clawPath(L, Wd, gap, s, h) {
  const zc = s * (gap + Wd * 0.5);
  // (de 0 à TOE : sur la sole, en ligne droite ; puis la corne qui a poussé, qui se recourbe)
  const ext = L * 0.55;
  const pts = [V(-L * 0.02, h, zc), V(L * 0.22, h, zc), V(L / 2, h, zc + s * Wd * 0.04), V(L / 2 + ext * 0.45, h + ext * 0.12, zc + s * Wd * 0.08), V(L / 2 + ext * 0.8, h + ext * 0.45, zc + s * Wd * 0.05), V(L / 2 + ext * 0.75, h + ext * 0.8, zc - s * Wd * 0.05)];
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  // (u → paramètre de la courbe : TOE tombe sur le bout de la sole, quelle que soit la longueur de la corne)
  const lens = curve.getLengths(200);
  const total = lens[200];
  const tOf = (len) => {
    let i = 0;
    while (i < 200 && lens[i + 1] < len) i++;
    const a = lens[i];
    const b = lens[i + 1] ?? a;
    return (i + (b > a ? (len - a) / (b - a) : 0)) / 200;
  };
  // longueur de la courbe jusqu'au bout de la sole
  let toeLen = 0;
  {
    let best = Infinity;
    for (let i = 0; i <= 200; i++) {
      const p = curve.getPoint(i / 200);
      const d = Math.abs(p.x - L / 2);
      if (d < best) {
        best = d;
        toeLen = lens[i];
      }
    }
  }
  const lenOf = (u) => (u <= TOE ? (u / TOE) * toeLen : toeLen + ((u - TOE) / (1 - TOE)) * (total - toeLen));
  const at = (u) => curve.getPoint(tOf(lenOf(THREE.MathUtils.clamp(u, 0, 1))));
  const tan = (u) => curve.getTangent(tOf(lenOf(THREE.MathUtils.clamp(u, 0, 1))));
  return { at, tan, zc };
}

/** Géométrie de la corne de u0 à u1 (section : une lame bombée, plus large que haute, effilée vers le bout). */
function hornGeometry(path, Wd, u0, u1) {
  const ring = 10;
  const n = SAMPLES;
  const pos = new Float32Array((n + 1) * ring * 3 + 6);
  const idx = [];
  const side = V();
  const up = V();
  for (let i = 0; i <= n; i++) {
    const u = u0 + (u1 - u0) * (i / n);
    const p = path.at(u);
    const t = path.tan(u);
    side.set(0, 0, 1);
    up.crossVectors(side, t).normalize();
    side.crossVectors(t, up).normalize();
    // (largeur : celle de l'onglon au bout de la sole, effilée jusqu'au bout ; épaisseur : un tiers)
    const k = THREE.MathUtils.clamp((u - TOE) / (1 - TOE), 0, 1);
    const w = Wd * 0.5 * (1 - 0.7 * k * k);
    const th = Wd * 0.2 * (1 - 0.55 * k);
    for (let j = 0; j < ring; j++) {
      const a = (j / ring) * Math.PI * 2;
      const q = p.clone().addScaledVector(side, Math.cos(a) * w).addScaledVector(up, Math.sin(a) * th * (Math.sin(a) > 0 ? 1 : 0.6));
      pos.set([q.x, q.y, q.z], (i * ring + j) * 3);
    }
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * ring + j;
      const b = i * ring + ((j + 1) % ring);
      idx.push(a, a + ring, b, b, a + ring, b + ring);
    }
  }
  // (les deux bouts fermés : le bout effilé, et la coupe)
  const c0 = (n + 1) * ring;
  const pa = path.at(u0);
  const pb = path.at(u1);
  pos.set([pa.x, pa.y, pa.z], c0 * 3);
  pos.set([pb.x, pb.y, pb.z], (c0 + 1) * 3);
  for (let j = 0; j < ring; j++) {
    idx.push(c0, (j + 1) % ring, j);
    idx.push(c0 + 1, n * ring + j, n * ring + ((j + 1) % ring));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Le pied (deux onglons) dans son repère. o : { L (longueur de la sole, m), hoof (couleur de la corne), quick }.
 * Renvoie { group, claws: [{ at(u), tan(u), cut(u) → morceau qui tombe (Mesh) ou null }], dispose }.
 */
export function goatHoofModel({ L, hoof = 0x2a221d, quick = 0.38 }) {
  const disp = [];
  const keep = (x) => {
    disp.push(x);
    return x;
  };
  const group = new THREE.Group();
  const W = L * 0.78;
  const gap = L * 0.035;
  const Wd = W / 2 - gap;
  const wallH = L * 0.075;
  const horn = new THREE.Color(hoof);
  const wallMat = keep(new THREE.MeshStandardMaterial({ color: horn, roughness: 0.55 }));
  // (la corne en trop, un peu plus claire et plus terne : vieille corne, avec de la terre)
  const oldMat = keep(new THREE.MeshStandardMaterial({ color: horn.clone().lerp(new THREE.Color(0x9a8668), 0.55), roughness: 0.8 }));
  const soleMat = keep(new THREE.MeshStandardMaterial({ color: 0xc9bca6, roughness: 0.85 }));
  const lineMat = keep(new THREE.MeshStandardMaterial({ color: 0xe8dfcc, roughness: 0.8 }));
  const heelMat = keep(new THREE.MeshStandardMaterial({ color: horn.clone().lerp(new THREE.Color(0xb08a7c), 0.55), roughness: 0.7 }));
  const quickMat = keep(new THREE.MeshStandardMaterial({ color: 0xe88f9c, roughness: 0.5, emissive: 0x5a1420, emissiveIntensity: 0.3 }));
  const cutMat = keep(new THREE.MeshStandardMaterial({ color: 0xf2e9d6, roughness: 0.7 }));
  const claws = [];
  for (const s of [1, -1]) {
    // paroi (anneau de corne, plus haute que la sole), ligne blanche, sole
    const outer = digitShape(L, Wd, gap, s);
    const inner = digitShape(L, Wd, gap, s, L * 0.05);
    const ringShape = outer.clone();
    ringShape.holes.push(new THREE.Path(inner.getPoints(24).reverse()));
    const wall = shadowed(new THREE.Mesh(extrude(ringShape, wallH, L * 0.008, keep), wallMat));
    group.add(wall);
    const line = shadowed(new THREE.Mesh(extrude(digitShape(L, Wd, gap, s, L * 0.04), wallH * 0.62, 0, keep), lineMat), false);
    group.add(line);
    const sole = shadowed(new THREE.Mesh(extrude(digitShape(L, Wd, gap, s, L * 0.065), wallH * 0.66, L * 0.006, keep), soleMat), false);
    group.add(sole);
    // le talon (souple, bombé)
    const heel = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(1, 16, 10)), heelMat));
    heel.scale.set(L * 0.17, wallH * 1.3, Wd * 0.46);
    heel.position.set(-L * 0.36, wallH * 0.5, s * (gap + Wd * 0.5));
    group.add(heel);
    // la corne en trop et le vif
    const path = clawPath(L, Wd, gap, s, wallH * 0.9);
    let over = shadowed(new THREE.Mesh(keep(hornGeometry(path, Wd, TOE - 0.08, 1)), oldMat));
    group.add(over);
    // (le vif : rose, au milieu de la sole, sous la corne ; il se voit si on coupe trop court)
    const vif = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(1, 14, 8)), quickMat), false);
    const pv = path.at(quick * 0.6);
    vif.position.set(pv.x, wallH * 0.62, pv.z);
    vif.scale.set(L * 0.16, wallH * 0.08, Wd * 0.22);
    vif.visible = false;
    group.add(vif);
    const claw = {
      at: path.at,
      tan: path.tan,
      cutAt: 1,
      /** Coupe à u : la corne au-delà tombe (renvoie le morceau, déjà placé dans le repère du pied), la coupe se voit. */
      cut(u) {
        claw.cutAt = u;
        const piece = new THREE.Mesh(hornGeometry(path, Wd, Math.max(u, TOE - 0.08), 1), oldMat);
        group.remove(over);
        over.geometry.dispose();
        if (u > TOE - 0.06) {
          over = shadowed(new THREE.Mesh(keep(hornGeometry(path, Wd, TOE - 0.08, u)), oldMat));
          group.add(over);
        } else over = null;
        // la coupe : corne claire (juste), rose si on est dans le vif
        const p = path.at(u);
        const t = path.tan(u);
        const disc = shadowed(new THREE.Mesh(keep(new THREE.CircleGeometry(1, 16)), u < quick + 0.04 ? quickMat : cutMat), false);
        disc.position.copy(p).addScaledVector(t, 0.0008);
        disc.quaternion.setFromUnitVectors(V(0, 0, 1), t);
        const k = THREE.MathUtils.clamp((u - TOE) / (1 - TOE), 0, 1);
        disc.scale.set(Wd * 0.5 * (1 - 0.7 * k * k), Wd * 0.2 * (1 - 0.55 * k), 1);
        if (u <= TOE) {
          // (coupée à ras de la sole ou dedans : la coupe est à plat sur la sole)
          disc.quaternion.setFromUnitVectors(V(0, 0, 1), V(0, 1, 0));
          disc.position.set(p.x, wallH * 1.02, p.z);
          disc.scale.set(L * 0.05, Wd * 0.4, 1);
        }
        group.add(disc);
        if (u < quick + 0.04) vif.visible = true;
        piece.userData.ownGeo = true;
        return piece;
      },
    };
    claws.push(claw);
  }
  // (les deux onglons d'un pied : celui du côté de l'animal d'abord, puis l'autre)
  return {
    group,
    claws,
    L,
    wallH,
    oldMat,
    dispose() {
      group.parent?.remove(group);
      for (const d of disp) d.dispose?.();
      group.traverse((o) => {
        if (o.isMesh && !disp.includes(o.geometry)) o.geometry.dispose();
      });
    },
  };
}

/**
 * Le sécateur à onglons : deux lames courtes et droites (acier), l'axe, deux poignées orange et le ressort. Origine :
 * le point de coupe entre les lames ; les lames le long de +x, ouvertes dans le plan xy ; les poignées vers −x.
 * open(k) : ouvert (1) ou fermé (0). s : taille (1 : un sécateur de 20 cm).
 */
export function hoofTrimmer(keep, s = 1) {
  const g = new THREE.Group();
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0xd6dade, metalness: 0.9, roughness: 0.25 }));
  const orange = keep(new THREE.MeshStandardMaterial({ color: 0xe8662c, roughness: 0.45 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x2b2d30, metalness: 0.5, roughness: 0.4 }));
  const arms = [];
  for (const sd of [1, -1]) {
    const arm = new THREE.Group();
    g.add(arm);
    // lame : effilée vers la pointe, tranchant du côté intérieur
    const bs = new THREE.Shape();
    bs.moveTo(0, 0);
    bs.lineTo(0.05 * s, sd * 0.002 * s);
    bs.lineTo(0.046 * s, sd * 0.009 * s);
    bs.lineTo(-0.012 * s, sd * 0.012 * s);
    bs.lineTo(-0.012 * s, 0);
    const blade = shadowed(new THREE.Mesh(keep(new THREE.ExtrudeGeometry(bs, { depth: 0.0025 * s, bevelEnabled: false })), steel));
    blade.position.z = sd > 0 ? 0 : -0.0025 * s;
    arm.add(blade);
    // poignée : un tube orange, un peu courbé, vers l'arrière
    const curve = new THREE.CatmullRomCurve3([V(-0.012 * s, sd * 0.006 * s, 0), V(-0.04 * s, sd * 0.012 * s, 0), V(-0.075 * s, sd * 0.02 * s, 0), V(-0.1 * s, sd * 0.022 * s, 0)]);
    const handle = shadowed(new THREE.Mesh(keep(new THREE.TubeGeometry(curve, 16, 0.0065 * s, 8)), orange));
    arm.add(handle);
    const cap = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(0.0065 * s, 10, 8)), orange));
    cap.position.copy(curve.getPoint(1));
    arm.add(cap);
    arms.push({ arm, sd });
  }
  const bolt = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004 * s, 0.004 * s, 0.009 * s, 12)), dark));
  bolt.rotation.x = Math.PI / 2;
  bolt.position.set(-0.004 * s, 0, 0);
  g.add(bolt);
  // le ressort entre les poignées
  const spring = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.006 * s, 0.0012 * s, 6, 16, Math.PI * 1.6)), steel));
  spring.position.set(-0.03 * s, 0, 0);
  g.add(spring);
  g.userData.open = (k) => {
    for (const { arm, sd } of arms) arm.rotation.z = sd * 0.2 * k;
  };
  g.userData.open(1);
  return g;
}

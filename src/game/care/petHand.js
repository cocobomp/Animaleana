// Notre main pour les soins des animaux de compagnie (chien, chat, lapin) : une main d'enfant (12 cm), douce, les
// doigts serrés et un peu pliés comme une main au repos, des ongles, un poignet qui s'affine et une manche en tricot
// (bord-côte au poignet) aux couleurs de l'avatar. La main du cheval (props.js handModel) n'a pas changé.
//
// Même repère que handModel : origine au milieu de la paume, les doigts vers +x, la paume vers +y, le pouce vers +z ;
// le bras part vers -x (la manche est longue : elle sort toujours de l'image). pose({ curl, thumb, spread }) plie la
// main : curl 0 (à plat) → 1 (le poing), thumb 0 (le long de la main) → 1 (en face des doigts, pour tenir).

import * as THREE from 'three';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Un tube lisse le long d'un chemin (sections en ellipse arrondie : rw sur `side`, rh sur l'autre axe), fermé aux deux
 * bouts par des calottes rondes. path : points ; r : [rw, rh] par point. side : axe de largeur (constant).
 */
function tube(path, r, side, { segs = 14, cap0 = true, cap1 = true, squircle = 2 } = {}) {
  const pos = [];
  const rings = [];
  const S = side.clone().normalize();
  const ring = (c, t, rw, rh, scale = 1) => {
    const sd = S.clone().addScaledVector(t, -S.dot(t)).normalize();
    const up = new THREE.Vector3().crossVectors(t, sd).normalize();
    const start = pos.length / 3;
    for (let k = 0; k < segs; k++) {
      const a = (k / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // (ellipse un peu carrée : une main est plus plate qu'un tuyau)
      const e = 2 / squircle;
      const x = Math.sign(ca) * Math.abs(ca) ** e;
      const y = Math.sign(sa) * Math.abs(sa) ** e;
      const p = c.clone().addScaledVector(sd, x * rw * scale).addScaledVector(up, y * rh * scale);
      pos.push(p.x, p.y, p.z);
    }
    rings.push(start);
  };
  const tan = (i) => {
    const a = path[Math.max(0, i - 1)];
    const b = path[Math.min(path.length - 1, i + 1)];
    return b.clone().sub(a).normalize();
  };
  // calotte du début
  const CAP = 4;
  if (cap0) {
    const t = tan(0);
    for (let k = CAP; k >= 1; k--) {
      const ang = (k / (CAP + 1)) * (Math.PI / 2);
      const c = path[0].clone().addScaledVector(t, -Math.sin(ang) * Math.min(r[0][0], r[0][1]));
      ring(c, t, r[0][0], r[0][1], Math.cos(ang));
    }
  }
  for (let i = 0; i < path.length; i++) ring(path[i], tan(i), r[i][0], r[i][1]);
  if (cap1) {
    const n = path.length - 1;
    const t = tan(n);
    for (let k = 1; k <= CAP; k++) {
      const ang = (k / (CAP + 1)) * (Math.PI / 2);
      const c = path[n].clone().addScaledVector(t, Math.sin(ang) * Math.min(r[n][0], r[n][1]));
      ring(c, t, r[n][0], r[n][1], Math.cos(ang));
    }
  }
  const idx = [];
  for (let j = 0; j < rings.length - 1; j++) {
    const a = rings[j];
    const b = rings[j + 1];
    for (let k = 0; k < segs; k++) {
      const k1 = (k + 1) % segs;
      idx.push(a + k, b + k, a + k1, a + k1, b + k, b + k1);
    }
  }
  // les deux pointes
  const tipAt = (ri, c) => {
    const i0 = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    for (let k = 0; k < segs; k++) idx.push(ri + k, ri + ((k + 1) % segs), i0);
    return i0;
  };
  if (cap0) {
    const t = tan(0);
    const c = path[0].clone().addScaledVector(t, -Math.min(r[0][0], r[0][1]));
    const i0 = pos.length / 3;
    pos.push(c.x, c.y, c.z);
    for (let k = 0; k < segs; k++) idx.push(rings[0] + ((k + 1) % segs), rings[0] + k, i0);
  }
  if (cap1) {
    const n = path.length - 1;
    tipAt(rings[rings.length - 1], path[n].clone().addScaledVector(tan(n), Math.min(r[n][0], r[n][1])));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // (sens des faces : la normale d'un sommet du milieu doit sortir du tube ; sinon on retourne les triangles)
  const mid = rings[Math.floor(rings.length / 2)];
  const n0 = v3().fromBufferAttribute(g.attributes.normal, mid);
  const p0 = v3().fromBufferAttribute(g.attributes.position, mid);
  const c0 = path[Math.floor(path.length / 2)] ?? path[0];
  if (n0.dot(p0.sub(c0)) < 0) {
    for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  return g;
}

/** Une phalange : tube effilé de longueur len (le long de +x), arrondi aux deux bouts. */
function phalanx(len, r0, r1, flat = 0.86) {
  const path = [];
  const r = [];
  const n = 5;
  for (let i = 0; i <= n; i++) {
    const k = i / n;
    path.push(v3(k * len, 0, 0));
    // (un peu plus épais aux articulations)
    const rr = r0 + (r1 - r0) * k + Math.sin(k * Math.PI) * -0.0004;
    r.push([rr, rr * flat]);
  }
  return tube(path, r, v3(0, 0, 1), { segs: 14, squircle: 2.2 });
}

/** Couleurs de notre main (celles de l'avatar : peau, haut). */
export function handColors(o = {}) {
  return { skin: o.skin ?? 0xf0c29a, sleeve: o.sleeve ?? 0x3f7fd0 };
}

/**
 * Notre main (une main d'enfant), avec son poignet et sa manche. keep : ce qu'on crée, à libérer. grip : la main se
 * ferme d'autant (comme handModel). size : échelle (1 : 12 cm du poignet au bout du majeur).
 */
export function petHand(keep, { skin = 0xf0c29a, sleeve = 0x3f7fd0, grip = 0, size = 1 } = {}) {
  const g = new THREE.Group();
  const inner = new THREE.Group();
  inner.scale.setScalar(size);
  g.add(inner);
  const skinCol = new THREE.Color(skin);
  const skinMat = keep(new THREE.MeshPhysicalMaterial({ color: skinCol, roughness: 0.62, sheen: 0.5, sheenRoughness: 0.55, sheenColor: skinCol.clone().lerp(new THREE.Color(0xff9a8a), 0.5) }));
  const nailMat = keep(new THREE.MeshStandardMaterial({ color: skinCol.clone().lerp(new THREE.Color(0xffe4e0), 0.55), roughness: 0.28 }));
  const knit = new THREE.Color(sleeve);
  const sleeveMat = keep(new THREE.MeshStandardMaterial({ color: knit, roughness: 0.92 }));
  const cuffMat = keep(new THREE.MeshStandardMaterial({ color: knit.clone().multiplyScalar(0.88), roughness: 0.95 }));
  const mesh = (geo, mat) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };
  // ---- la paume et le dos de la main, jusqu'au poignet : une section plate, plus large aux jointures
  const PALM = 0.034; // (des jointures au milieu de la paume)
  const palmPath = [v3(-0.05, -0.001, 0.002), v3(-0.036, -0.001, 0.003), v3(-0.018, 0, 0.002), v3(0, 0.0005, 0), v3(0.018, 0, -0.001), v3(PALM, -0.0015, -0.001)];
  const palmR = [[0.019, 0.0145], [0.021, 0.013], [0.025, 0.0118], [0.0275, 0.011], [0.0285, 0.0098], [0.0275, 0.0085]];
  const palm = mesh(tube(palmPath, palmR, v3(0, 0, 1), { segs: 22, squircle: 2.6 }), skinMat);
  inner.add(palm);
  // l'éminence du pouce (le gras de la main, côté pouce)
  const thenar = mesh(new THREE.SphereGeometry(1, 16, 10), skinMat);
  thenar.position.set(-0.012, 0.004, 0.015);
  thenar.scale.set(0.024, 0.009, 0.012);
  thenar.rotation.y = 0.5;
  inner.add(thenar);
  // ---- les doigts : trois phalanges chacun, serrés (index du côté du pouce)
  const FINGERS = [
    { z: 0.0185, len: 0.05, r: 0.0074, ang: 0.06 },
    { z: 0.0062, len: 0.055, r: 0.0077, ang: 0.0 },
    { z: -0.0062, len: 0.052, r: 0.0073, ang: -0.04 },
    { z: -0.0182, len: 0.041, r: 0.0064, ang: -0.1 },
  ];
  const joints = [];
  for (const f of FINGERS) {
    const base = new THREE.Group();
    base.position.set(PALM - 0.004 - Math.abs(f.z) * 0.12, -0.001, f.z);
    base.rotation.y = -f.ang;
    inner.add(base);
    const lens = [f.len * 0.46, f.len * 0.3, f.len * 0.24];
    const rad = [f.r, f.r * 0.93, f.r * 0.86, f.r * 0.8];
    let parent = base;
    const chain = [];
    for (let k = 0; k < 3; k++) {
      const j = new THREE.Group();
      if (k > 0) j.position.x = lens[k - 1];
      parent.add(j);
      const ph = mesh(phalanx(lens[k], rad[k], rad[k + 1]), skinMat);
      j.add(ph);
      chain.push(j);
      parent = j;
    }
    // l'ongle, sur le dessus du bout du doigt
    const nail = mesh(new THREE.SphereGeometry(1, 12, 8), nailMat);
    nail.position.set(lens[2] * 0.62, -rad[3] * 0.62, 0);
    nail.scale.set(lens[2] * 0.42, rad[3] * 0.32, rad[3] * 0.72);
    chain[2].add(nail);
    joints.push(chain);
  }
  // ---- le pouce : deux phalanges, depuis le bas de la paume côté +z
  const tb = new THREE.Group();
  tb.position.set(-0.008, 0.002, 0.024);
  inner.add(tb);
  const t1 = new THREE.Group();
  tb.add(t1);
  t1.add(mesh(phalanx(0.024, 0.0095, 0.0088), skinMat));
  const t2 = new THREE.Group();
  t2.position.x = 0.024;
  t1.add(t2);
  t2.add(mesh(phalanx(0.02, 0.0088, 0.0078), skinMat));
  const tnail = mesh(new THREE.SphereGeometry(1, 12, 8), nailMat);
  tnail.position.set(0.013, 0, 0.0055);
  tnail.scale.set(0.0085, 0.0058, 0.0028);
  t2.add(tnail);
  // ---- la manche : bord-côte au poignet, puis la manche, longue (elle sort de l'image)
  const cuffPath = [];
  const cuffR = [];
  for (let i = 0; i <= 6; i++) {
    cuffPath.push(v3(-0.044 - i * 0.008, 0, 0.002));
    cuffR.push([0.026, 0.0215]);
  }
  const cuffGeo = tube(cuffPath, cuffR, v3(0, 0, 1), { segs: 40, cap0: true, cap1: false });
  // (les côtes du tricot : le rayon ondule autour de la manche)
  const cp = cuffGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const p = v3().fromBufferAttribute(cp, i);
    const a = Math.atan2(p.y, p.z - 0.002);
    const k = 1 + 0.06 * Math.max(0, Math.cos(a * 20));
    cp.setXYZ(i, p.x, p.y * k, (p.z - 0.002) * k + 0.002);
  }
  cuffGeo.computeVertexNormals();
  inner.add(mesh(cuffGeo, cuffMat));
  const slPath = [];
  const slR = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    slPath.push(v3(-0.09 - k * 0.62, Math.sin(k * 9) * 0.0015, 0.002));
    const r = 0.029 + 0.012 * Math.min(1, k * 2.5) + Math.sin(k * 23) * 0.0012;
    slR.push([r, r * 0.86]);
  }
  inner.add(mesh(tube(slPath, slR, v3(0, 0, 1), { segs: 24, cap0: false, cap1: false }), sleeveMat));
  // (le bord de la manche, sur le bord-côte)
  const lip = mesh(new THREE.TorusGeometry(0.029, 0.004, 8, 28), sleeveMat);
  lip.rotation.y = Math.PI / 2;
  lip.position.set(-0.091, 0, 0.002);
  lip.scale.set(1, 0.86, 1);
  inner.add(lip);

  /** Plie la main : curl (0 à plat → 1 le poing), thumb (0 le long de la main → 1 en face des doigts), spread. */
  const pose = ({ curl = 0.12, thumb = 0, spread = 0 } = {}) => {
    joints.forEach((chain, i) => {
      // (le petit doigt se plie un peu plus, l'index un peu moins : une main au repos)
      const c = curl * (0.9 + i * 0.06);
      chain[0].rotation.z = c * 1.15;
      chain[1].rotation.z = c * 1.45 + 0.05;
      chain[2].rotation.z = c * 1.05 + 0.04;
      chain[0].rotation.y = (i - 1.5) * -spread * 0.12;
    });
    // pouce : le long de la main, ou replié en face des doigts (pour tenir une anse, un sac)
    tb.rotation.set(-0.25 - thumb * 0.7, -0.55 + thumb * 0.15, 0.12 + thumb * 0.35);
    t2.rotation.z = 0.15 + thumb * 0.45;
  };
  pose({ curl: grip > 0 ? 0.15 + grip * 0.85 : 0.12, thumb: grip > 0 ? Math.min(1, grip * 1.2) : 0 });
  g.userData.pose = pose;
  return g;
}

/**
 * L'épaule de notre bras, pour une main posée en `at` : en bas et un peu à droite de l'image, vers nous (on tend le
 * bras devant soi ; il entre par le bas de l'image, jamais d'en haut). sc : la scène (sa caméra).
 */
export function shoulderFor(sc, at) {
  const c = sc.camera;
  const right = v3(1, 0, 0).applyQuaternion(c.quaternion);
  const up = v3(0, 1, 0).applyQuaternion(c.quaternion);
  const toCam = c.position.clone().sub(at);
  const d = toCam.length();
  return at.clone().addScaledVector(toCam.normalize(), d * 0.7).addScaledVector(right, d * 0.32).addScaledVector(up, -d * 0.42);
}

// Salon de toilettage (métier Toiletteur ✂️) : le petit bâtiment rose avec sa table de toilettage,
// sa baignoire, son séchoir et son étagère de nœuds sous l'auvent — et les accessoires portés par
// les animaux (nœuds, bandanas, clochettes, petits chapeaux), accrochés à la tête, au cou ou à la queue.
// Tout est généré par le code. Repère local du salon : la façade (porte) regarde vers +z.

import * as THREE from 'three';
import { signTexture } from '../textures.js';
import { ACCESSORIES, ACC_COLORS } from '../../sim/groomer.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { flatBand } from '../gearModels.js';

const mat = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });

function add(parent, geo, material, pos, rot) {
  const m = new THREE.Mesh(geo, material);
  m.position.set(...pos);
  if (rot) m.rotation.set(...rot);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Toit à deux pans (faîte le long de x). */
function gable(w, d, h, material, overhang = 0.3) {
  const shape = new THREE.Shape();
  shape.moveTo(-d / 2 - overhang, 0);
  shape.lineTo(d / 2 + overhang, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: w + overhang * 2, bevelEnabled: false });
  geo.translate(0, 0, -(w + overhang * 2) / 2);
  geo.rotateY(Math.PI / 2);
  const m = new THREE.Mesh(geo, material);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

const RIBBON_COLORS = [0xff7eb6, 0x3b7dd8, 0xf2c94c, 0x9b59d0, 0x3fae62, 0xe03d3d];

/** Le salon : 6 m × 5 m. La maisonnette à gauche, l'auvent de travail à droite. */
export function salonModel(def, label = '') {
  const g = new THREE.Group();
  const wall = mat(0xf7cfdc, 0.9);
  const trim = mat(0xfff8f2, 0.8);
  const roof = mat(0x8d6aa6, 0.7);
  const wood = mat(0xb5793f, 0.8);
  const metal = mat(0xb9c2c9, 0.35, { metalness: 0.5 });

  // Socle
  add(g, new THREE.BoxGeometry(def.w + 0.3, 1.2, def.d + 0.3), mat(0x8a8178), [0, -0.5, 0]);
  add(g, new THREE.BoxGeometry(def.w, 0.12, def.d), mat(0xe9dcd1, 0.9), [0, 0.06, 0]);

  // Maisonnette (x de -3 à 0,9)
  const bw = 3.9;
  const bx = -3 + bw / 2;
  add(g, new THREE.BoxGeometry(bw, 2.7, 4.3), wall, [bx, 1.35 + 0.1, -0.1]);
  const r = gable(bw, 4.3, 1.1, roof, 0.3);
  r.position.set(bx, 2.8, -0.1);
  g.add(r);
  // Porte et fenêtre ronde sur la façade
  add(g, new THREE.BoxGeometry(0.9, 1.9, 0.08), mat(0x7a4a8a, 0.6), [bx - 0.7, 1.05, 2.07]);
  add(g, new THREE.SphereGeometry(0.06, 8, 8), metal, [bx - 0.4, 1.0, 2.12]);
  add(g, new THREE.CylinderGeometry(0.45, 0.45, 0.08, 20), trim, [bx + 0.9, 1.75, 2.07], [Math.PI / 2, 0, 0]);
  add(g, new THREE.CylinderGeometry(0.36, 0.36, 0.1, 20), mat(0x9fd3ef, 0.1, { metalness: 0.2 }), [bx + 0.9, 1.75, 2.08], [Math.PI / 2, 0, 0]);
  // Fenêtre latérale
  add(g, new THREE.BoxGeometry(0.08, 0.9, 1.3), mat(0x9fd3ef, 0.1), [-3 + 0.02 - 0.04, 1.6, -0.3]);
  add(g, new THREE.BoxGeometry(0.1, 1.0, 1.4), trim, [-3 + 0.01, 1.6, -0.3]);
  // Enseigne
  if (label) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshStandardMaterial({ map: signTexture(label, '#7a4a8a', '#fff8f2', '✂️'), roughness: 0.7 }));
    s.position.set(bx, 3.0, 2.2);
    g.add(s);
  }

  // Auvent de travail (x de 0,9 à 3)
  const ax = 1.95;
  add(g, new THREE.BoxGeometry(2.3, 0.1, 4.6), mat(0xfff0f5, 0.8), [ax, 2.55, -0.1]);
  for (const [px, pz] of [[2.85, 2.0], [2.85, -2.2]]) add(g, new THREE.CylinderGeometry(0.07, 0.07, 2.5, 8), trim, [px, 1.3, pz]);
  // Rayures roses sur le bord de l'auvent
  for (let i = 0; i < 4; i++) add(g, new THREE.BoxGeometry(0.08, 0.25, 1.1), i % 2 ? wall : trim, [3.0, 2.45, -1.75 + i * 1.1]);

  // Table de toilettage
  add(g, new THREE.BoxGeometry(1.3, 0.08, 0.7), metal, [ax, 0.95, 0.9]);
  add(g, new THREE.BoxGeometry(1.2, 0.04, 0.6), mat(0x3b7dd8, 0.6), [ax, 1.0, 0.9]);
  for (const [sx, sz] of [[-0.55, -0.28], [0.55, -0.28], [-0.55, 0.28], [0.55, 0.28]]) add(g, new THREE.CylinderGeometry(0.03, 0.03, 0.9, 6), metal, [ax + sx, 0.5, 0.9 + sz]);
  // Petite potence pour attacher l'animal
  add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.9, 6), metal, [ax + 0.6, 1.45, 0.9]);
  add(g, new THREE.CylinderGeometry(0.025, 0.025, 0.5, 6), metal, [ax + 0.35, 1.9, 0.9], [0, 0, Math.PI / 2]);

  // Baignoire
  add(g, new THREE.CylinderGeometry(0.62, 0.5, 0.55, 18, 1, true), trim, [ax, 0.4, -0.9]);
  add(g, new THREE.CylinderGeometry(0.5, 0.5, 0.06, 18), mat(0x4a8fb5, 0.1), [ax, 0.6, -0.9]);
  add(g, new THREE.TorusGeometry(0.6, 0.05, 6, 20), trim, [ax, 0.67, -0.9], [Math.PI / 2, 0, 0]);
  add(g, new THREE.TorusGeometry(0.12, 0.03, 6, 12, Math.PI), metal, [ax, 0.95, -1.35], [0, 0, 0]);
  for (let i = 0; i < 3; i++) add(g, new THREE.SphereGeometry(0.08 + i * 0.03, 8, 8), mat(0xffffff, 0.2, { transparent: true, opacity: 0.6 }), [ax - 0.3 + i * 0.3, 0.8 + i * 0.12, -0.9 + (i - 1) * 0.1]);

  // Séchoir sur pied
  add(g, new THREE.CylinderGeometry(0.03, 0.03, 1.3, 8), metal, [ax - 0.9, 0.8, -1.9]);
  add(g, new THREE.CylinderGeometry(0.2, 0.2, 0.05, 12), metal, [ax - 0.9, 0.15, -1.9]);
  add(g, new THREE.CylinderGeometry(0.14, 0.1, 0.4, 12), mat(0xff7eb6, 0.5), [ax - 0.75, 1.5, -1.75], [Math.PI / 2, 0, -0.6]);

  // Étagère de nœuds et de rubans contre le mur
  add(g, new THREE.BoxGeometry(0.25, 0.05, 1.6), wood, [1.05, 1.5, 0.0]);
  add(g, new THREE.BoxGeometry(0.25, 0.05, 1.6), wood, [1.05, 2.0, 0.0]);
  RIBBON_COLORS.forEach((c, i) => {
    const y = i < 3 ? 1.62 : 2.12;
    const z = -0.55 + (i % 3) * 0.55;
    add(g, new THREE.SphereGeometry(0.1, 10, 8), mat(c, 0.6), [1.0, y, z]).scale.set(1, 0.7, 1);
    add(g, new THREE.SphereGeometry(0.1, 10, 8), mat(c, 0.6), [1.0, y, z + 0.2]).scale.set(1, 0.7, 1);
    add(g, new THREE.SphereGeometry(0.045, 8, 6), mat(0x3a2a20, 0.6), [1.0, y, z + 0.1]);
  });
  return g;
}

// ---------------------------------------------------------------- accessoires portés

/** Un nœud papillon : deux boucles aplaties et un petit nœud au milieu. */
function bowMesh(size, color) {
  const g = new THREE.Group();
  const m = mat(color, 0.55);
  for (const s of [-1, 1]) {
    const loop = new THREE.Mesh(new THREE.SphereGeometry(size * 0.55, 10, 8), m);
    loop.position.x = s * size * 0.6;
    loop.scale.set(1, 0.65, 0.45);
    loop.castShadow = true;
    g.add(loop);
  }
  const knot = new THREE.Mesh(new THREE.SphereGeometry(size * 0.28, 8, 8), mat(color, 0.4));
  knot.scale.z = 0.7;
  g.add(knot);
  return g;
}

/**
 * Chien réaliste (dogReal.js) : bavette sous l'anneau du cou mesuré, plaquée sur le devant de la peau (model.drapeChest),
 * dans le repère de repos du chien. Grille de NC colonnes sur NR + 1 rangées : la première suit le bas de l'anneau
 * (± 57° autour de la gorge), les suivantes descendent vers la pointe, à la verticale sous la gorge, et se posent sur le
 * cou puis le poitrail. Renvoie la grille (pts).
 */
const BIB_NC = 9;
const BIB_NR = 7;
function dogBib(model, ring, rx, ry, lenOf, clear, spread = 1.0) {
  const C = ring.rest.center;
  const z = ring.rest.axis;
  const x = new THREE.Vector3(1, 0, 0).addScaledVector(z, -z.x).normalize();
  const y = z.clone().cross(x);
  const at = (th) => C.clone().addScaledVector(x, rx * Math.sin(th)).addScaledVector(y, -ry * Math.cos(th));
  const tip = at(0);
  tip.y -= lenOf(tip.y);
  const pts = [];
  for (let i = 0; i <= BIB_NR; i++) {
    for (let j = 0; j < BIB_NC; j++) pts.push(at(((j / (BIB_NC - 1)) * 2 - 1) * spread).lerp(tip, i / BIB_NR));
  }
  const plane = pts.map((p) => p.z);
  const skin = model.drapeChest(pts.map((p) => p.clone()), clear);
  // (pas de peau sous un point — entre les antérieurs — : celle de la rangée du dessus)
  for (let k = BIB_NC; k < pts.length; k++) if (Number.isNaN(skin[k])) skin[k] = skin[k - BIB_NC];
  // (enveloppe lissée de la peau, jamais en dessous d'elle : le foulard s'y pose. Posé point par point sur la peau, il
  // en prenait chaque bosse — sur les boucles du caniche, un foulard froissé de face)
  const raw = skin.slice();
  for (let pass = 0; pass < 6; pass++) {
    const prev = skin.slice();
    for (let i = 0; i <= BIB_NR; i++) {
      for (let j = 0; j < BIB_NC; j++) {
        const k = i * BIB_NC + j;
        if (Number.isNaN(raw[k])) continue;
        let sum = 0;
        let cnt = 0;
        for (const [a, b] of [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]]) {
          if (a < 0 || a > BIB_NR || b < 0 || b >= BIB_NC || Number.isNaN(prev[a * BIB_NC + b])) continue;
          sum += prev[a * BIB_NC + b];
          cnt++;
        }
        if (cnt) skin[k] = Math.max(raw[k], (prev[k] + sum / cnt) / 2);
      }
    }
  }
  // (la rangée du haut reste sur l'anneau ; dessous, posée sur la peau — fondu sur les premières rangées : sur les
  // côtés du cou, parallèles à z, la peau « devant » le point n'a pas de sens)
  const w = (i) => Math.min(1, Math.max(0, (i / BIB_NR - 0.1) / 0.3));
  const fit = () => {
    for (let k = 0; k < pts.length; k++) {
      const i = Math.floor(k / BIB_NC);
      if (Number.isNaN(skin[k]) || !w(i)) continue;
      pts[k].z = Math.max(pts[k].z, skin[k] + clear * w(i));
    }
  };
  for (let k = 0; k < pts.length; k++) {
    const i = Math.floor(k / BIB_NC);
    if (!Number.isNaN(skin[k])) pts[k].z = plane[k] + (skin[k] + clear - plane[k]) * w(i);
  }
  // (lissée : quatre passes de moyenne entre voisines, sans rentrer dans la peau — à deux, le pli du poitrail entre
  // les antérieurs restait marqué au milieu du foulard)
  for (let pass = 0; pass < 4; pass++) {
    const zs = pts.map((p) => p.z);
    for (let i = 1; i <= BIB_NR; i++) {
      for (let j = 0; j < BIB_NC; j++) {
        const nb = [[i - 1, j], [i + 1, j], [i, j - 1], [i, j + 1]].filter(([a, b]) => a >= 0 && a <= BIB_NR && b >= 0 && b < BIB_NC);
        pts[i * BIB_NC + j].z = (zs[i * BIB_NC + j] + nb.reduce((t, [a, b]) => t + zs[a * BIB_NC + b], 0) / nb.length) / 2;
      }
    }
    fit();
  }
  return { pts };
}

/** Maillage de la bavette (grille de dogBib), dans le repère de repos du chien. */
function bibGeometry(pts) {
  const pos = new Float32Array(pts.length * 3);
  pts.forEach((p, k) => p.toArray(pos, k * 3));
  const idx = [];
  for (let i = 0; i < BIB_NR; i++) {
    for (let j = 0; j + 1 < BIB_NC; j++) {
      const a = i * BIB_NC + j;
      const b = a + BIB_NC;
      idx.push(a, b, a + 1);
      if (i + 1 < BIB_NR) idx.push(a + 1, b, b + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Accroche les accessoires d'un animal (a.accessories = { head: { id, color }, neck: …, tail: … })
 * aux pièces du modèle (model.head / neck / tail). Tolère un modèle sans ces pièces.
 * Renvoie la liste des objets ajoutés (à retirer avec removeAccessories).
 */
export function buildAccessories(model, look, accessories = {}) {
  const out = [];
  if (!model || !accessories) return out;
  const fluff = look.fluff ?? 1;
  const R = (look.bodyR ?? 0.2) * fluff;
  const hr = (look.headR ?? 0.1) * (1 + (fluff - 1) * 0.5);
  const neckLen = look.neckLen ?? R;
  const put = (parent, obj, pos, rot) => {
    if (!parent) return null;
    obj.position.set(...pos);
    if (rot) obj.rotation.set(...rot);
    parent.add(obj);
    out.push(obj);
    return obj;
  };
  // Chien réaliste (dogReal.js) : places mesurées sur sa race (dessus du crâne, anneau de l'encolure, bout de la
  // queue) dans le repère de ses os.
  const fit = model.accessoryFit;
  const ring = model.dogFit?.collar;
  for (const [slot, worn] of Object.entries(accessories)) {
    const def = ACCESSORIES[worn?.id];
    if (!def || def.slot !== slot) continue;
    const color = ACC_COLORS[worn.color] ?? ACC_COLORS.pink;
    if (fit && slot === 'head') {
      const frame = new THREE.Group();
      frame.position.copy(fit.skull);
      frame.quaternion.copy(fit.headQ);
      const h = fit.headR;
      if (worn.id === 'ribbon') put(frame, bowMesh(h * 0.6, color), [0, h * 0.12, -h * 0.1], [-0.3, 0, 0]);
      else if (worn.id === 'flower') {
        const f = new THREE.Group();
        for (let i = 0; i < 5; i++) {
          const p = new THREE.Mesh(new THREE.SphereGeometry(h * 0.22, 8, 6), mat(color, 0.6));
          const a = (i / 5) * Math.PI * 2;
          p.position.set(Math.cos(a) * h * 0.28, 0, Math.sin(a) * h * 0.28);
          p.scale.y = 0.5;
          f.add(p);
        }
        f.add(new THREE.Mesh(new THREE.SphereGeometry(h * 0.16, 8, 6), mat(0xf2c94c, 0.6)));
        put(frame, f, [h * 0.45, h * 0.05, -h * 0.1], [0, 0, -0.5]);
      } else if (worn.id === 'hat') {
        const hat = new THREE.Group();
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.75, h * 0.75, h * 0.08, 16), mat(color, 0.6));
        const topM = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.42, h * 0.46, h * 0.7, 16), mat(color, 0.6));
        topM.position.y = h * 0.38;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(h * 0.47, h * 0.47, h * 0.12, 16), mat(0x2a2a2a, 0.6));
        band.position.y = h * 0.1;
        brim.castShadow = topM.castShadow = true;
        hat.add(brim, topM, band);
        put(frame, hat, [0, h * 0.05, -h * 0.15], [-0.2, 0, 0.12]);
      }
      if (frame.children.length) {
        model.head.add(frame);
        out.push(frame);
      }
      continue;
    }
    if (ring && slot === 'neck') {
      // Anneau de l'encolure mesuré (repère : z le long du cou, -y vers la gorge).
      const frame = new THREE.Group();
      frame.position.copy(ring.center);
      frame.quaternion.copy(ring.q);
      const rx = ring.rx + 0.008;
      const ry = ring.ry + 0.008;
      // (bande plate, comme le collier : voir flatBand)
      const band = 0.01;
      const torus = new THREE.Mesh(flatBand(rx, ry, 0.003, band), mat(worn.id === 'bandana' ? color : 0x3a2a20, 0.6));
      frame.add(torus);
      // (chien réaliste : le poil est serré sous la bande, comme sous le collier — voir dogReal.js setGroove)
      if (model.setGroove) {
        model.setGroove(frame, { rx, ry, w: band });
        frame.userData.onRemove = () => model.setGroove(frame, null);
      }
      const throat = -(ry + band);
      // Chien réaliste : nœud et foulard posés sous l'anneau, sur le devant du cou et du poitrail mesurés au repos
      // (avant : à la gorge de l'anneau, le nœud du yorkshire, dont l'anneau penche comme le cou, tombait devant la
      // bouche ; le triangle du foulard, orienté de façon fixe, flottait devant le poitrail)
      // (longueur : celle du foulard des autres animaux, au plus 55 % de la hauteur de la gorge au ventre — l'anneau des
      // races à collerette, mesuré sur le poil, est large)
      const fitD = model.dogFit;
      // (foulard : plus large et plus long que la bavette du nœud — à ± 57° et 55 %, il ne se voyait presque plus de loin ;
      // au moins 7 cm à la taille du shiba : chez les races du jack, le bas de l'anneau est presque à hauteur du ventre et
      // il ne restait qu'un liseré de 2 cm sous le collier)
      const big = worn.id === 'bandana';
      const bibLen = (thr) => {
        const len = Math.min((rx + ry) * (big ? 1.1 : 0.85), (big ? 0.68 : 0.55) * Math.max(0.03, thr - (fitD?.bellyY ?? -1)));
        return big ? Math.max(0.07, len) : len;
      };
      const bib = model.realDog && model.drapeChest && model.skinGear && ring.rest ? dogBib(model, ring, rx, ry, bibLen, 0.006, big ? 1.3 : 1.0) : null;
      if (bib && (worn.id === 'bow' || worn.id === 'bandana')) {
        if (worn.id === 'bow') {
          // (sur la peau, sous la gorge, de face et un peu penché vers le haut ; sous le menton — gorge haute du
          // yorkshire : on descend le long de la bavette jusqu'à ce qu'il passe dessous)
          // (taille d'après la tête, pas d'après l'anneau : mesuré sur le poil, celui des races à poil long ou à
          // collerette donnait un nœud plus large que la tête)
          const sz = Math.min((rx + ry) * 0.4, (fit?.headR ?? 1) * 0.5);
          let row = 2;
          while (row < BIB_NR - 2 && bib.pts[row * BIB_NC + (BIB_NC >> 1)].y + sz * 0.4 > (ring.rest.chinY ?? Infinity) - 0.004) row++;
          const g = bowMesh(sz, color);
          g.position.copy(bib.pts[row * BIB_NC + (BIB_NC >> 1)]);
          g.position.z += sz * 0.15;
          g.rotation.set(-0.25, 0, 0);
          g.updateMatrixWorld(true);
          // (lié au squelette comme le foulard : rigide sur l'os du cou, il flottait devant la peau quand le cou se
          // pliait — la peau sous lui suit aussi le poitrail)
          const m = new THREE.Mesh(mergeGeometries(g.children.map((c) => c.geometry.clone().applyMatrix4(c.matrixWorld))), mat(color, 0.5));
          g.children.forEach((c) => {
            c.geometry.dispose();
            c.material.dispose();
          });
          m.castShadow = true;
          out.push(model.skinGear(m));
        } else {
          // (lié au squelette : il suit le cou et le poitrail, assis comme debout)
          const m = new THREE.Mesh(bibGeometry(bib.pts), mat(color, 0.75, { side: THREE.DoubleSide }));
          m.castShadow = true;
          const sk = model.skinGear(m);
          out.push(sk);
        }
        model.neck.add(frame);
        out.push(frame);
        continue;
      }
      // (lapin réaliste : le nœud sur le côté de la nuque ; accroupi, sa gorge touche presque le sol et le nœud y
      // disparaissait entre ses pattes)
      if (worn.id === 'bow' && model.realRabbit) put(frame, bowMesh((rx + ry) * 0.42, color), [rx * 0.85, ry * 0.5, band * 0.5], [0, Math.PI / 2, -0.5]);
      else if (worn.id === 'bow') put(frame, bowMesh((rx + ry) * 0.45, color), [0, throat - band * 0.5, band * 0.5], [0.3, 0, 0]);
      else if (worn.id === 'bell') {
        const bell = new THREE.Mesh(new THREE.SphereGeometry((rx + ry) * 0.14, 10, 8), mat(0xf2c94c, 0.3, { metalness: 0.6 }));
        put(frame, bell, [0, throat - (rx + ry) * 0.14, band]);
      } else if (worn.id === 'bandana') {
        // foulard : triangle plié qui pend sous la gorge, un peu bombé sur le poitrail
        // (lapin : plus petit, sa gorge est près du sol quand il est accroupi)
        const w = (rx + ry) * (model.realRabbit ? 0.75 : 1.1);
        const tri = new THREE.Mesh(new THREE.ConeGeometry(w * 0.55, w * 0.75, 3, 1), mat(color, 0.75, { side: THREE.DoubleSide }));
        tri.scale.z = 0.22;
        put(frame, tri, [0, throat - w * 0.32, band * 1.2], [Math.PI + 0.25, 0, 0]);
        // Chat et lapin réalistes (catReal.js, rabbitReal.js) : leur cou se redresse beaucoup (assis, tête levée) ; le foulard pend vers le sol
        // dans la pose où on le lui met, au lieu de pointer devant lui.
        if (model.realCat || model.realRabbit) {
          model.neck.updateWorldMatrix(true, false);
          const q = model.neck.getWorldQuaternion(new THREE.Quaternion()).multiply(frame.quaternion).invert();
          const down = new THREE.Vector3(0, -1, 0).applyQuaternion(q);
          // (pointe du cône tournée de π + a autour de x : vers (0, -cos a, -sin a) ; a = 0 : vers la gorge)
          const a = Math.atan2(-down.z, -down.y) + 0.15;
          tri.rotation.x = Math.PI + a;
          tri.position.set(0, throat - w * 0.32 * Math.cos(a), band * 1.2 - w * 0.32 * Math.sin(a));
        }
      }
      model.neck.add(frame);
      out.push(frame);
      continue;
    }
    if (fit && slot === 'tail' && worn.id === 'tailBow') {
      // (tailBowAt : place mesurée à la surface d'une queue en pompon — bobtail —, dans le repère de l'os)
      if (fit.tailTip) put(fit.tailTip, bowMesh(fit.headR * 0.45, color), fit.tailBowAt ?? [0, 0, 0], [0.6, 0, 0]);
      continue;
    }
    if (slot === 'head') {
      // Sur le dessus de la tête, entre les oreilles.
      const top = [0, hr * 1.0, hr * 0.15];
      if (worn.id === 'ribbon') put(model.head, bowMesh(hr * 0.6, color), top, [-0.3, 0, 0]);
      else if (worn.id === 'flower') {
        const f = new THREE.Group();
        for (let i = 0; i < 5; i++) {
          const p = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.22, 8, 6), mat(color, 0.6));
          const a = (i / 5) * Math.PI * 2;
          p.position.set(Math.cos(a) * hr * 0.28, 0, Math.sin(a) * hr * 0.28);
          p.scale.y = 0.5;
          f.add(p);
        }
        const c = new THREE.Mesh(new THREE.SphereGeometry(hr * 0.16, 8, 6), mat(0xf2c94c, 0.6));
        f.add(c);
        put(model.head, f, [hr * 0.45, hr * 0.95, hr * 0.1], [0, 0, -0.5]);
      } else if (worn.id === 'hat') {
        const hat = new THREE.Group();
        const brim = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.75, hr * 0.75, hr * 0.08, 16), mat(color, 0.6));
        const topM = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.42, hr * 0.46, hr * 0.7, 16), mat(color, 0.6));
        topM.position.y = hr * 0.38;
        const band = new THREE.Mesh(new THREE.CylinderGeometry(hr * 0.47, hr * 0.47, hr * 0.12, 16), mat(0x2a2a2a, 0.6));
        band.position.y = hr * 0.1;
        brim.castShadow = topM.castShadow = true;
        hat.add(brim, topM, band);
        put(model.head, hat, [0, hr * 1.05, 0], [-0.25, 0, 0.15]);
      }
    } else if (slot === 'neck') {
      // Autour du cou, le nœud / la clochette / le bandana sur la gorge (+z = devant).
      const y = neckLen * 0.5;
      const collar = new THREE.Mesh(new THREE.TorusGeometry(R * 0.62, R * 0.07, 6, 20), mat(worn.id === 'bandana' ? color : 0x3a2a20, 0.6));
      put(model.neck, collar, [0, y, 0], [Math.PI / 2, 0, 0]);
      if (worn.id === 'bow') put(model.neck, bowMesh(R * 0.4, color), [0, y - R * 0.05, R * 0.62], [0.4, 0, 0]);
      else if (worn.id === 'bell') {
        const bell = new THREE.Mesh(new THREE.SphereGeometry(R * 0.16, 10, 8), mat(0xf2c94c, 0.3, { metalness: 0.6 }));
        put(model.neck, bell, [0, y - R * 0.18, R * 0.62]);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(R * 0.62, R * 0.04, 6, 20), mat(color, 0.6));
        put(model.neck, ring, [0, y + R * 0.1, 0], [Math.PI / 2, 0, 0]);
      } else if (worn.id === 'bandana') {
        const tri = new THREE.Mesh(new THREE.ConeGeometry(R * 0.5, R * 0.6, 3), mat(color, 0.7, { side: THREE.DoubleSide }));
        tri.scale.z = 0.25;
        put(model.neck, tri, [0, y - R * 0.35, R * 0.55], [Math.PI, 0, 0]);
      }
    } else if (slot === 'tail' && worn.id === 'tailBow') {
      put(model.tail, bowMesh(R * 0.32, color), [0, R * 0.1, -R * 0.18], [0.6, 0, 0]);
    }
  }
  return out;
}

export function removeAccessories(list) {
  for (const o of list ?? []) {
    o.parent?.remove(o);
    o.userData.onRemove?.();
    o.traverse((m) => {
      if (m.isMesh) {
        m.geometry.dispose();
        m.material.dispose();
      }
    });
  }
}

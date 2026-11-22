// Accessoires 3D des soins « sellerie et maréchal » (src/ui/minigames/saddle3d.js, bridle3d.js, deworm3d.js,
// shoe3d.js) : le porte-selle en bois, la seringue de vermifuge graduée, le marteau du maréchal, le fer et ses clous,
// la main qui tient. Tout est neuf (à libérer avec own) ; les textures peintes sont gardées d'une ouverture à l'autre
// (textures.js paint).

import * as THREE from 'three';
import { woodTexture, canvasTex } from './textures.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function shade(m, cast = true) {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/**
 * Porte-selle en bois, posé dans la paille : deux pieds en A, une barre du haut arrondie (la selle), une barre plus
 * basse (le tapis), un plateau entre les pieds. Origine au sol, la barre du haut le long de x. Renvoie
 * { group, top, low } (top, low : le dessus des deux barres, repère du groupe).
 */
export function saddleStand(own, { h = 0.86 } = {}) {
  const g = new THREE.Group();
  const tex = own(woodTexture({ base: '#a8743f', dark: '#6a4321', vertical: false, seed: 21, boards: 2 }));
  const wood = own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.62, color: 0xffffff }));
  const dark = own(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, color: 0xc49a70 }));
  const len = 0.62;
  // la barre du haut : une demi-lune, comme le dos d'un cheval
  const topGeo = own(new THREE.CylinderGeometry(0.075, 0.075, len, 20, 1, false, 0, Math.PI));
  const top = shade(new THREE.Mesh(topGeo, wood));
  // (demi-cylindre couché le long de x, l'arrondi en haut)
  top.rotation.z = Math.PI / 2;
  top.position.set(0, h - 0.06, 0);
  g.add(top);
  const plank = shade(new THREE.Mesh(own(new THREE.BoxGeometry(len, 0.03, 0.15)), wood));
  plank.position.set(0, h - 0.07, 0);
  g.add(plank);
  // pieds en A, aux deux bouts
  for (const s of [-1, 1]) {
    for (const k of [-1, 1]) {
      const leg = shade(new THREE.Mesh(own(new THREE.BoxGeometry(0.045, h, 0.045)), dark));
      leg.position.set(s * (len / 2 - 0.05), h / 2 - 0.03, k * 0.16);
      leg.rotation.x = -k * 0.36;
      g.add(leg);
    }
    const brace = shade(new THREE.Mesh(own(new THREE.BoxGeometry(0.04, 0.04, 0.42)), dark));
    brace.position.set(s * (len / 2 - 0.05), 0.24, 0);
    g.add(brace);
  }
  // la barre du bas (le tapis), et le plateau
  const low = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.03, 0.03, len + 0.08, 14)), wood));
  low.rotation.z = Math.PI / 2;
  low.position.set(0, 0.44, 0.24);
  g.add(low);
  const lowArm = shade(new THREE.Mesh(own(new THREE.BoxGeometry(0.04, 0.04, 0.2)), dark));
  for (const s of [-1, 1]) {
    const arm = lowArm.clone();
    arm.position.set(s * (len / 2 + 0.01), 0.44, 0.15);
    g.add(arm);
  }
  return { group: g, top: v3(0, h + 0.01, 0), low: v3(0, 0.47, 0.24) };
}

/**
 * Seringue de vermifuge (pâte) : le corps transparent gradué en kilos, la pâte dedans, le piston, la bague rouge qui
 * règle la dose, l'embout. Origine au bout de l'embout, le corps le long de +x. setDose(k) : la bague (0 à 1 du
 * corps) ; setLeft(k) : la pâte qui reste (le piston avance). Renvoie { group, setDose, setLeft, axis, len }.
 */
export function syringeModel(own, { marks = [100, 900] } = {}) {
  const g = new THREE.Group();
  const len = 0.2;
  const r = 0.017;
  const tip = 0.035;
  // embout
  const plastic = own(new THREE.MeshStandardMaterial({ color: 0xf4f2ec, roughness: 0.35 }));
  const nozzle = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.006, 0.01, tip, 14)), plastic));
  nozzle.rotation.z = -Math.PI / 2;
  nozzle.position.x = tip / 2;
  g.add(nozzle);
  // corps gradué (texture : les kilos, de 100 à 900)
  const scale = own(canvasTex(512, 64, (c) => {
    c.fillStyle = 'rgba(250,250,246,0.94)';
    c.fillRect(0, 0, 512, 64);
    c.strokeStyle = '#66717a';
    c.fillStyle = '#4a545c';
    c.font = 'bold 15px sans-serif';
    c.textAlign = 'center';
    for (let w = marks[0]; w <= marks[1]; w += 50) {
      const x = 16 + ((w - marks[0]) / (marks[1] - marks[0])) * 480;
      const big = w % 100 === 0;
      c.lineWidth = big ? 3 : 2;
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, big ? 26 : 16);
      c.stroke();
      if (big) c.fillText(`${w}`, x, 46);
    }
  }, { repeat: false, key: 'syringeScale' }));
  scale.wrapS = THREE.ClampToEdgeWrapping;
  const bodyMat = own(new THREE.MeshStandardMaterial({ map: scale, roughness: 0.3, transparent: true, opacity: 0.92 }));
  const bodyGeo = own(new THREE.CylinderGeometry(r, r, len, 28, 1, true));
  // (la graduation se lit sur le dessus : les u tournés pour que 100 soit à l'embout)
  const uv = bodyGeo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - uv.getY(i), uv.getX(i));
  const body = shade(new THREE.Mesh(bodyGeo, bodyMat));
  // (couché le long de +x, puis tourné sur lui-même pour que la graduation se lise. Avant : tourné autour de y après
  // être couché, le corps partait de travers, loin de l'embout)
  body.rotation.set(Math.PI * 0.75, 0, -Math.PI / 2);
  body.position.x = tip + len / 2;
  g.add(body);
  // la pâte (blanc cassé), qui recule quand on pousse
  const pasteMat = own(new THREE.MeshStandardMaterial({ color: 0xe9dcc0, roughness: 0.8 }));
  const paste = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(r * 0.86, r * 0.86, 1, 20)), pasteMat), false);
  paste.rotation.z = -Math.PI / 2;
  g.add(paste);
  // collerette et piston (bleu) : la tige part du joint, derrière la pâte, et sort par l'arrière du corps
  const blue = own(new THREE.MeshStandardMaterial({ color: 0x2f6fd0, roughness: 0.45 }));
  const flange = shade(new THREE.Mesh(own(new THREE.BoxGeometry(0.008, 0.05, 0.03)), plastic));
  flange.position.x = tip + len + 0.004;
  g.add(flange);
  const plunger = new THREE.Group();
  const rod = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.006, 0.006, len, 10)), blue));
  rod.rotation.z = -Math.PI / 2;
  rod.position.x = len / 2;
  plunger.add(rod);
  const thumb = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.02, 0.02, 0.008, 22)), blue));
  thumb.rotation.z = Math.PI / 2;
  thumb.position.x = len;
  plunger.add(thumb);
  g.add(plunger);
  // la bague de dose (rouge), qui glisse le long du corps
  const ringMat = own(new THREE.MeshStandardMaterial({ color: 0xd8433a, roughness: 0.4 }));
  const ring = shade(new THREE.Mesh(own(new THREE.TorusGeometry(r * 1.08, 0.005, 10, 28)), ringMat));
  ring.rotation.y = Math.PI / 2;
  ring.scale.set(1, 1, 1.6);
  g.add(ring);
  const api = {
    group: g,
    len,
    tip,
    /** Où est la bague (0 : 100 kg, à l'embout ; 1 : 900 kg). */
    setDose(k) {
      ring.position.x = tip + len * ((16 + k * 480) / 512);
    },
    /** La pâte qui reste (1 pleine, 0 vide) : le piston avance d'autant. */
    setLeft(k) {
      const l = Math.max(0.001, len * 0.94 * k);
      paste.scale.set(1, l, 1);
      paste.position.x = tip + len - 0.004 - l / 2 - len * 0.94 * (1 - k);
      paste.visible = k > 0.005;
      // (le joint du piston pousse la pâte : pleine, la tige sort par l'arrière ; vide, elle est rentrée dans le corps)
      plunger.position.x = tip + len - 0.004 - len * 0.94 * (1 - k);
    },
    /** Point du corps à la part k (0 embout, 1 fond), repère du groupe (pour le doigt). */
    at(k) {
      return v3(tip + len * k, 0, 0);
    },
    ringAt(k) {
      return v3(tip + len * ((16 + k * 480) / 512), 0, 0);
    },
  };
  api.setDose(0.5);
  api.setLeft(1);
  return api;
}

/**
 * Marteau du maréchal : tête en acier, manche en bois. Origine au milieu de la face qui frappe (elle frappe vers -y) ;
 * la tête monte le long de +y, le manche part vers -x.
 */
export function hammerModel(own) {
  const g = new THREE.Group();
  const steel = own(new THREE.MeshStandardMaterial({ color: 0x8d949c, roughness: 0.32, metalness: 0.85 }));
  const wood = own(new THREE.MeshStandardMaterial({ color: 0xb0814e, roughness: 0.55 }));
  // (la face qui frappe à l'origine, vers -y ; la tête monte vers +y ; le manche part vers -x)
  const head = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.014, 0.016, 0.09, 16)), steel));
  head.position.y = 0.045;
  g.add(head);
  const face = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.018, 0.018, 0.012, 18)), steel));
  face.position.y = 0.006;
  g.add(face);
  const peen = shade(new THREE.Mesh(own(new THREE.SphereGeometry(0.015, 12, 8)), steel));
  peen.position.y = 0.09;
  g.add(peen);
  const handle = shade(new THREE.Mesh(own(new THREE.CylinderGeometry(0.009, 0.012, 0.3, 12)), wood));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-0.155, 0.05, 0);
  g.add(handle);
  return g;
}

/**
 * Le fer à cheval vu de dessous : une bande en U, plate, avec sa rainure et ses étampures (les trous des clous).
 * R : rayon du sabot (repère de la sole, rayon 1 → R). Renvoie { group, holes } (holes : positions des trous, repère
 * du groupe, dans l'ordre du jeu : de la pince vers les talons, gauche puis droite).
 */
export function horseshoeModel(own, holes = []) {
  const g = new THREE.Group();
  const steel = own(new THREE.MeshStandardMaterial({ color: 0x9aa2aa, roughness: 0.38, metalness: 0.85 }));
  const shape = new THREE.Shape();
  const N = 40;
  const a0 = -Math.PI * 0.8;
  const a1 = Math.PI * 0.8;
  const rOut = (a) => (Math.cos(a) > 0 ? 0.98 : 0.9);
  const outer = [];
  const inner = [];
  for (let i = 0; i <= N; i++) {
    const a = a0 + ((a1 - a0) * i) / N;
    outer.push(new THREE.Vector2(Math.cos(a) * rOut(a) * 1.04, Math.sin(a) * 0.94));
    inner.push(new THREE.Vector2(Math.cos(a) * (rOut(a) - 0.24) * 1.04, Math.sin(a) * 0.7));
  }
  shape.moveTo(outer[0].x, outer[0].y);
  for (const p of outer) shape.lineTo(p.x, p.y);
  for (let i = inner.length - 1; i >= 0; i--) shape.lineTo(inner[i].x, inner[i].y);
  shape.closePath();
  const geo = own(new THREE.ExtrudeGeometry(shape, { depth: 0.09, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 2, curveSegments: 6 }));
  const shoe = shade(new THREE.Mesh(geo, steel));
  g.add(shoe);
  // la rainure (un trait plus sombre au milieu de la bande)
  const dark = own(new THREE.MeshStandardMaterial({ color: 0x5b6168, roughness: 0.5, metalness: 0.7 }));
  const groovePts = [];
  for (let i = 3; i <= N - 3; i++) {
    const a = a0 + ((a1 - a0) * i) / N;
    groovePts.push(v3(Math.cos(a) * (rOut(a) - 0.12) * 1.04, Math.sin(a) * 0.82, 0.112));
  }
  const groove = new THREE.Mesh(own(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(groovePts), 40, 0.012, 5, false)), dark);
  g.add(groove);
  for (const h of holes) {
    const hole = new THREE.Mesh(own(new THREE.BoxGeometry(0.05, 0.03, 0.02)), dark);
    hole.position.set(h.x, h.y, 0.112);
    hole.rotation.z = Math.atan2(h.y, h.x);
    g.add(hole);
  }
  return { group: g };
}

/** Un clou de maréchal : tête carrée et tige. Origine sous la tête, la tige vers -y (dans la corne). */
export function nailModel(own, mats) {
  const g = new THREE.Group();
  const steel = mats?.steel ?? own(new THREE.MeshStandardMaterial({ color: 0xc9cfd5, roughness: 0.3, metalness: 0.9 }));
  const head = shade(new THREE.Mesh(mats?.headGeo ?? own(new THREE.BoxGeometry(0.06, 0.035, 0.04)), steel));
  head.position.y = 0.0175;
  g.add(head);
  const shank = shade(new THREE.Mesh(mats?.shankGeo ?? own(new THREE.BoxGeometry(0.022, 0.32, 0.016)), steel));
  shank.position.y = -0.16;
  g.add(shank);
  g.userData.shank = shank;
  return g;
}

/**
 * Le tapis blanc tout simple (celui que le jeu met sous la selle quand on n'a pas de tapis à soi) vu de près : du
 * coton piqué en losanges, un passepoil crème sur le bord, les coins arrondis (repère du tapis de gearModels.js :
 * u en travers du dos, v le long du dos). La même couleur que dans le jeu : seul le tissu se voit mieux.
 */
export function padClothTexture() {
  const S = 256;
  return canvasTex(S, S, (c) => {
    c.clearRect(0, 0, S, S);
    const r = 26;
    c.save();
    c.beginPath();
    c.roundRect(2, 2, S - 4, S - 4, r);
    c.clip();
    c.fillStyle = '#f4efe6';
    c.fillRect(0, 0, S, S);
    // grain du coton
    for (let i = 0; i < 2600; i++) {
      const x = (i * 97) % S;
      const y = (i * 61 + (i >> 4) * 13) % S;
      c.fillStyle = i % 3 ? 'rgba(120,100,80,0.05)' : 'rgba(255,255,255,0.35)';
      c.fillRect(x, y, 2, 1);
    }
    // piqûres en losanges, et l'ombre douce des coussins entre elles
    c.strokeStyle = 'rgba(150,135,115,0.55)';
    c.lineWidth = 2;
    c.setLineDash([5, 4]);
    for (let k = -S; k < 2 * S; k += 36) {
      c.beginPath();
      c.moveTo(k, 0);
      c.lineTo(k + S, S);
      c.stroke();
      c.beginPath();
      c.moveTo(k + S, 0);
      c.lineTo(k, S);
      c.stroke();
    }
    c.setLineDash([]);
    // passepoil sur tout le bord
    c.strokeStyle = '#d8ccb6';
    c.lineWidth = 14;
    c.beginPath();
    c.roundRect(2, 2, S - 4, S - 4, r);
    c.stroke();
    c.strokeStyle = 'rgba(110,90,70,0.35)';
    c.lineWidth = 2;
    c.beginPath();
    c.roundRect(11, 11, S - 22, S - 22, r - 8);
    c.stroke();
    c.restore();
  }, { repeat: false, key: 'padCloth' });
}

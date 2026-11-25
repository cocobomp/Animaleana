// Le rond de longe : le décor de la longe et de la liberté en 3D (src/ui/minigames/lunge3d.js). Un cercle de sable
// clair au milieu du pré, la piste foulée (plus foncée, marquée de traces de sabots) là où le cheval tourne, une
// clôture ronde en bois (poteaux et trois lisses rondes, à claire-voie : on voit les jambes du cheval à travers quand il
// passe devant), une barrière, une botte de paille et un seau au pied de la clôture ; autour, l'herbe et ses touffes,
// des arbres, des collines, le ciel ; le soleil de l'après-midi.
//
// pen = { R (rayon de la piste, m), F (rayon de la clôture, m), u (taille du cheval : 1 pour un selle français) }.
// Le centre du rond est l'origine. Même forme que les autres décors (stallSet, paddockSet) :
// { group, dims, props, layout, update, dispose } ; sky(stage) pose le ciel et la brume (à rendre au départ). Il suit
// l'heure, la météo et la saison du jeu (pen.season ; ambience.js : ciel recolorable, sol mouillé ou blanc, herbe
// cachée sous la neige ; la pluie tombe sur tout le rond, weatherBox) et reçoit les objets du jour (spots : dehors,
// au pied de la clôture, sur sa lisse du haut, accrochés aux poteaux — la caméra est dedans, ils sont derrière lui).

import * as THREE from 'three';
import { canvasTex, rng } from './textures.js';
import { bag, barnWood, strawBale, lumpy } from './barnProps.js';
import { skySphere, GRASS_TINT, LEAVES } from './outdoor.js';
import { fogFromCamera } from './ambience.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Le sable du rond : beige clair, des grains plus clairs et plus foncés, de petits cailloux, des traces de râteau. */
export function sandTexture(seed = 4) {
  return canvasTex(256, 256, (c) => {
    const r = rng(seed);
    c.fillStyle = '#d9c39a';
    c.fillRect(0, 0, 256, 256);
    // (taches douces : le sable n'est jamais d'une seule couleur)
    for (let i = 0; i < 30; i++) {
      const g = c.createRadialGradient(0, 0, 0, 0, 0, 1);
      const light = r() < 0.5;
      g.addColorStop(0, light ? 'rgba(240,226,196,0.18)' : 'rgba(176,148,104,0.12)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.save();
      c.translate(r() * 256, r() * 256);
      c.scale(14 + r() * 30, 10 + r() * 24);
      c.fillStyle = g;
      c.fillRect(-1, -1, 2, 2);
      c.restore();
    }
    // traces de râteau, très légères
    c.strokeStyle = 'rgba(150,122,84,0.12)';
    c.lineWidth = 1.2;
    for (let y = 6; y < 256; y += 9) {
      c.beginPath();
      c.moveTo(0, y);
      for (let x = 0; x <= 256; x += 16) c.lineTo(x, y + Math.sin(x * 0.03 + y) * 1.5);
      c.stroke();
    }
    for (let i = 0; i < 9000; i++) {
      const k = r();
      c.fillStyle = k < 0.5 ? `rgba(${120 + r() * 40},${96 + r() * 30},${62 + r() * 20},${0.25 + r() * 0.35})` : `rgba(${238 + r() * 17},${222 + r() * 25},${190 + r() * 30},${0.3 + r() * 0.4})`;
      c.fillRect(r() * 256, r() * 256, 1, 1);
    }
    for (let i = 0; i < 70; i++) {
      c.fillStyle = `rgba(${140 + r() * 60},${130 + r() * 50},${110 + r() * 40},0.8)`;
      c.beginPath();
      c.ellipse(r() * 256, r() * 256, 0.8 + r() * 1.4, 0.6 + r() * 1, r() * 3, 0, Math.PI * 2);
      c.fill();
    }
  }, { key: `pen-sand|${seed}` });
}

/**
 * La piste foulée : en travers (x, de l'intérieur vers l'extérieur), plus foncée au milieu et fondue sur les bords ; le
 * long (y), des traces de sabots en croissant et du sable retourné.
 */
function trackTexture(seed = 6) {
  return canvasTex(128, 512, (c) => {
    const r = rng(seed);
    c.clearRect(0, 0, 128, 512);
    const g = c.createLinearGradient(0, 0, 128, 0);
    g.addColorStop(0, 'rgba(150,118,78,0)');
    g.addColorStop(0.25, 'rgba(150,118,78,0.45)');
    g.addColorStop(0.5, 'rgba(138,106,68,0.62)');
    g.addColorStop(0.75, 'rgba(150,118,78,0.45)');
    g.addColorStop(1, 'rgba(150,118,78,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 128, 512);
    // sable retourné : mottes claires et ombres
    for (let i = 0; i < 1600; i++) {
      const x = 28 + r() * 72;
      const y = r() * 512;
      c.fillStyle = r() < 0.5 ? `rgba(110,82,50,${0.2 + r() * 0.25})` : `rgba(232,212,176,${0.2 + r() * 0.3})`;
      c.fillRect(x, y, 1 + r() * 2, 1 + r() * 2);
    }
    // traces de sabots (croissants), en quinconce de part et d'autre du milieu
    for (let i = 0; i < 26; i++) {
      const x = 64 + (i % 2 ? 1 : -1) * (8 + r() * 10);
      const y = (i / 26) * 512 + r() * 8;
      c.save();
      c.translate(x, y);
      c.rotate(-Math.PI / 2 + (r() - 0.5) * 0.4);
      c.strokeStyle = `rgba(92,66,38,${0.35 + r() * 0.2})`;
      c.lineWidth = 2.2;
      c.beginPath();
      c.arc(0, 0, 4.5 + r() * 1.5, -2.3, 2.3);
      c.stroke();
      c.restore();
    }
  }, { key: `pen-track|${seed}` });
}

/** L'herbe du pré autour du rond. */
function grassTexture(seed = 11) {
  return canvasTex(256, 256, (c) => {
    const r = rng(seed);
    c.fillStyle = '#7aa456';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 24; i++) {
      c.fillStyle = `rgba(${140 + r() * 50},${150 + r() * 40},${70 + r() * 20},0.15)`;
      c.beginPath();
      c.arc(r() * 256, r() * 256, 10 + r() * 28, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 6000; i++) {
      const gg = 95 + r() * 85;
      c.strokeStyle = `rgba(${40 + r() * 60},${gg},${30 + r() * 40},${0.45 + r() * 0.5})`;
      c.lineWidth = 0.8 + r() * 0.8;
      const x = r() * 256;
      const y = r() * 256;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 6);
      c.stroke();
    }
  }, { key: `pen-grass|${seed}` });
}

/** Une touffe d'herbe (brins effilés, alpha découpé). */
function tuftTexture() {
  return canvasTex(64, 64, (c) => {
    const r = rng(9);
    c.clearRect(0, 0, 64, 64);
    for (let i = 0; i < 26; i++) {
      const x = 32 + (r() - 0.5) * 34;
      const h = 30 + r() * 32;
      const lean = (r() - 0.5) * 22;
      c.fillStyle = `rgb(${60 + r() * 50},${110 + r() * 60},${40 + r() * 30})`;
      c.beginPath();
      c.moveTo(x - 1.6, 64);
      c.quadraticCurveTo(x + lean * 0.4, 64 - h * 0.6, x + lean, 64 - h);
      c.quadraticCurveTo(x + lean * 0.4 + 1, 64 - h * 0.6, x + 1.6, 64);
      c.fill();
    }
  }, { repeat: false, key: 'pen-tuft' });
}

/** Le ciel : bleu en haut, pâle et doré vers l'horizon (une grande sphère vue de dedans). */
function skyDome(keep, r = 60) {
  const geo = keep(new THREE.SphereGeometry(r, 24, 12));
  const col = new Float32Array(geo.attributes.position.count * 3);
  const top = new THREE.Color(0x6aa2dc);
  const mid = new THREE.Color(0xbcd8ee);
  const low = new THREE.Color(0xf2e6c8);
  const c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const y = geo.attributes.position.getY(i) / r;
    if (y > 0.15) c.copy(mid).lerp(top, Math.min(1, (y - 0.15) / 0.6));
    else c.copy(low).lerp(mid, Math.max(0, (y + 0.05) / 0.2));
    c.toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.Mesh(geo, keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })));
  m.renderOrder = -1;
  return m;
}

/**
 * Dimensions du rond : rayon de la piste R et de la clôture F (m). L : longueur du cheval (du nez à la pointe des
 * fesses) ; ss : son échelle de vitesse (speedScale du modèle) ; scale : sa taille.
 *
 * La piste est faite pour la liberté, dont la logique (horse.js libertyGame) donne la vitesse du cheval en tours par
 * seconde : poussé (1,25 rad/s), il prend un petit galop tranquille (4,25 m/s de référence : au-dessus du seuil du
 * galop, 3,9, loin du grand galop, 6,3) ; il ne s'emballe que si on le serre de trop près (1,9 rad/s). D'où
 * R = 4,25 × ss × scale ÷ 1,25 : 3,4 m pour un selle français, 1,7 m pour un Shetland ; jamais moins d'une longueur et
 * demie de cheval (il doit pouvoir tourner). Un petit rond : on voit le cheval en grand, tête comprise, au téléphone.
 */
export function penSize({ L, ss = 1, scale = 1 }) {
  const R = Math.max(1.4, 1.5 * L, (4.25 * ss * scale) / 1.25);
  const F = R + Math.max(1.1, 0.7 * L);
  return { R, F };
}

/**
 * Le rond de longe. stage : la scène (qualité) ; pen : { R, F, u } (voir plus haut).
 */
export function roundPenSet(stage, pen) {
  const g = new THREE.Group();
  const keep = bag();
  const high = !!stage?.high;
  const { R, F } = pen;
  const u = THREE.MathUtils.clamp(pen.u ?? 1, 0.4, 1.3);
  const r = rng(17);
  const season = pen.season ?? 'summer';
  const mesh = (geo, mat, pos, rot = null, shadow = true) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // ---------------------------------------------------------------- le sol : l'herbe, le sable du rond, la piste
  const grass = keep(grassTexture());
  grass.repeat.set(26, 26);
  const grassMat = keep(new THREE.MeshStandardMaterial({ map: grass, roughness: 1, color: GRASS_TINT[season] ?? 0xdfe8cf }));
  grassMat.userData.main = true;
  mesh(new THREE.PlaneGeometry(90, 90), grassMat, [0, 0, 0], [-Math.PI / 2, 0, 0], false);
  const sand = keep(sandTexture());
  sand.repeat.set(F / 1.6, F / 1.6);
  const sandGeo = new THREE.CircleGeometry(F + 0.35, 72);
  const sandMat = keep(new THREE.MeshStandardMaterial({ map: sand, roughness: 1, color: 0xf4ece0 }));
  mesh(sandGeo, sandMat, [0, 0.004, 0], [-Math.PI / 2, 0, 0], false);
  // un liseré d'herbe foulée et de sable mêlés tout autour (le bord du sable n'est pas une coupe nette)
  const edge = new THREE.RingGeometry(F + 0.2, F + 0.75, 72, 1);
  const ecol = new Float32Array(edge.attributes.position.count * 4);
  for (let i = 0; i < edge.attributes.position.count; i++) {
    const d = Math.hypot(edge.attributes.position.getX(i), edge.attributes.position.getY(i));
    ecol.set([0.72, 0.62, 0.42, d < F + 0.4 ? 0.85 : 0], i * 4);
  }
  edge.setAttribute('color', new THREE.BufferAttribute(ecol, 4));
  mesh(edge, keep(new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, depthWrite: false, roughness: 1 })), [0, 0.006, 0], [-Math.PI / 2, 0, 0], false);
  // la piste : un anneau (en travers : x de la texture ; le long : y, répété), plus foncé, traces de sabots
  const w = Math.max(0.55, 0.42 * (pen.L ?? 2.4) + 0.25);
  const track = new THREE.RingGeometry(R - w / 2, R + w / 2, 128, 1);
  {
    const p = track.attributes.position;
    const uv = track.attributes.uv;
    const turns = Math.max(6, Math.round((2 * Math.PI * R) / 2.6));
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const d = Math.hypot(x, y);
      const a = Math.atan2(y, x);
      uv.setXY(i, (d - (R - w / 2)) / w, ((a / (Math.PI * 2) + 1) % 1) * turns);
    }
    // (le joint à l'angle π : le dernier sommet repart à 0 dans la texture répétée ; sans conséquence, la texture boucle)
  }
  const trackTex = keep(trackTexture());
  const trackMat = keep(new THREE.MeshStandardMaterial({ map: trackTex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 }));
  mesh(track, trackMat, [0, 0.008, 0], [-Math.PI / 2, 0, 0], false);

  // ---------------------------------------------------------------- la clôture ronde : poteaux et trois lisses
  const postTex = keep(barnWood(23, true, 'old'));
  const railTex = keep(barnWood(24, false, 'pale'));
  railTex.repeat.set(Math.round((2 * Math.PI * F) / 1.4), 1);
  const postMat = keep(new THREE.MeshStandardMaterial({ map: postTex, roughness: 0.9, color: 0xd8c4a8 }));
  const railMat = keep(new THREE.MeshStandardMaterial({ map: railTex, roughness: 0.85, color: 0xe8d8bd }));
  const fH = THREE.MathUtils.clamp(0.55 + 0.85 * u, 0.95, 1.45);
  const post = keep(lumpy(new THREE.CylinderGeometry(0.065, 0.075, fH + 0.12, 8, 3), 0.005, 3));
  post.translate(0, (fH + 0.12) / 2 - 0.04, 0);
  const cap = keep(new THREE.SphereGeometry(0.07, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2));
  cap.scale(1, 0.5, 1);
  cap.translate(0, fH + 0.08, 0);
  // (la barrière, au fond à gauche : deux gros poteaux, un portail en planches entre eux)
  const gateA = -Math.PI / 2 - 0.55;
  const gateW = 1.5 / F; // (ouverture, en angle)
  const nP = Math.max(14, Math.round((2 * Math.PI * F) / 1.8));
  const posts = new THREE.InstancedMesh(post, postMat, nP);
  const caps = new THREE.InstancedMesh(cap, postMat, nP);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  let nIn = 0;
  for (let i = 0; i < nP; i++) {
    const a = (i / nP) * Math.PI * 2;
    // (pas de poteau dans l'ouverture de la barrière : ses deux gros poteaux la marquent)
    if (Math.abs(Math.atan2(Math.sin(a - gateA), Math.cos(a - gateA))) < gateW * 0.75) continue;
    e.set((r() - 0.5) * 0.03, r() * 3, (r() - 0.5) * 0.03);
    q.setFromEuler(e);
    m4.compose(V(Math.cos(a) * F, 0, Math.sin(a) * F), q, V(1, 1, 1));
    posts.setMatrixAt(nIn, m4);
    caps.setMatrixAt(nIn++, m4);
  }
  posts.count = nIn;
  caps.count = nIn;
  posts.castShadow = true;
  posts.receiveShadow = true;
  caps.castShadow = true;
  g.add(posts, caps);
  const railR = 0.045;
  for (const k of [0.3, 0.62, 0.92]) {
    // (un arc : la barrière remplace les lisses dans son ouverture)
    const rail = new THREE.TorusGeometry(F - 0.05, railR, 6, 160, Math.PI * 2 - gateW);
    rail.rotateX(Math.PI / 2);
    rail.rotateY(-(gateA + gateW / 2));
    mesh(rail, railMat, [0, k * fH, 0]);
  }
  // le portail : un cadre de planches fermé, posé devant les lisses, et ses deux gros poteaux
  const gate = new THREE.Group();
  gate.position.set(Math.cos(gateA) * (F - 0.05), 0, Math.sin(gateA) * (F - 0.05));
  // (son x le long de la clôture : la tangente au cercle en gateA)
  gate.rotation.y = Math.atan2(-Math.cos(gateA), -Math.sin(gateA));
  const plank = keep(new THREE.BoxGeometry(gateW * F, 0.1, 0.04));
  for (const k of [0.22, 0.5, 0.78]) {
    const p = new THREE.Mesh(plank, postMat);
    p.position.set(0, k * fH, 0);
    p.castShadow = true;
    gate.add(p);
  }
  const diag = new THREE.Mesh(keep(new THREE.BoxGeometry(Math.hypot(gateW * F, fH * 0.56), 0.08, 0.035)), postMat);
  diag.position.set(0, 0.5 * fH, 0.01);
  diag.rotation.z = Math.atan2(fH * 0.56, gateW * F);
  gate.add(diag);
  const big = keep(new THREE.CylinderGeometry(0.09, 0.1, fH + 0.3, 8));
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(big, postMat);
    p.position.set((s * gateW * F) / 2, (fH + 0.3) / 2 - 0.05, 0);
    p.castShadow = true;
    gate.add(p);
  }
  g.add(gate);

  // ---------------------------------------------------------------- au pied de la clôture : paille, seau, chambrière
  const bale = strawBale(keep, { w: 0.9, h: 0.4, d: 0.48, seed: 7 });
  const ba = -Math.PI / 2 + 0.7;
  bale.position.set(Math.cos(ba) * (F + 0.7), 0, Math.sin(ba) * (F + 0.7));
  bale.rotation.y = -ba + 0.3;
  g.add(bale);
  const bucketMat = keep(new THREE.MeshStandardMaterial({ color: 0x2f6fb8, roughness: 0.5 }));
  const bucket = mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.28, 16, 1, true), bucketMat, [Math.cos(ba + 0.12) * (F + 0.55), 0.14, Math.sin(ba + 0.12) * (F + 0.55)]);
  bucket.material.side = THREE.DoubleSide;
  mesh(new THREE.CircleGeometry(0.12, 16), bucketMat, [bucket.position.x, 0.012, bucket.position.z], [-Math.PI / 2, 0, 0]);
  mesh(new THREE.TorusGeometry(0.15, 0.008, 4, 20, Math.PI), keep(new THREE.MeshStandardMaterial({ color: 0x9aa2aa, metalness: 0.6, roughness: 0.4 })), [bucket.position.x, 0.3, bucket.position.z], [0, 0.4, 0]);

  // ---------------------------------------------------------------- l'herbe autour : touffes et pâquerettes
  const tuftGeo = keep(new THREE.PlaneGeometry(1, 1));
  tuftGeo.translate(0, 0.5, 0);
  const tuftMat = keep(new THREE.MeshStandardMaterial({ map: keep(tuftTexture()), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, color: season === 'autumn' ? 0xe8dcb0 : season === 'winter' ? 0xd8d8c4 : 0xffffff }));
  tuftMat.userData.tuft = true;
  const nT = high ? 520 : 320;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, nT * 2);
  let k = 0;
  const s = V();
  for (let i = 0; i < nT; i++) {
    const a = r() * Math.PI * 2;
    // (plus serrées au pied de la clôture, là où on ne fauche pas)
    const d = F + 0.25 + (r() < 0.35 ? r() * 0.6 : r() * r() * 16);
    const h = 0.08 + r() * 0.12 * (d < F + 1 ? 1.4 : 1);
    for (const b of [0, Math.PI / 2]) {
      e.set(0, r() * 3 + b, 0);
      q.setFromEuler(e);
      s.set(h * 1.3, h, h * 1.3);
      m4.compose(V(Math.cos(a) * d, 0, Math.sin(a) * d), q, s);
      tufts.setMatrixAt(k++, m4);
    }
  }
  tufts.count = k;
  tufts.receiveShadow = true;
  tufts.userData.grass = true; // (sous la neige, l'herbe disparaît : ambience.js)
  g.add(tufts);
  const petal = keep(new THREE.CircleGeometry(0.014, 8));
  petal.rotateX(-Math.PI / 2);
  const heart = keep(new THREE.CircleGeometry(0.005, 6));
  heart.rotateX(-Math.PI / 2);
  heart.translate(0, 0.001, 0);
  const nD = 90;
  const petals = new THREE.InstancedMesh(petal, keep(new THREE.MeshStandardMaterial({ color: 0xfbfaf4, roughness: 0.7 })), nD);
  const hearts = new THREE.InstancedMesh(heart, keep(new THREE.MeshStandardMaterial({ color: 0xf1c232, roughness: 0.6 })), nD);
  for (let i = 0; i < nD; i++) {
    const a = r() * Math.PI * 2;
    const d = F + 0.8 + r() * 7;
    m4.makeTranslation(Math.cos(a) * d, 0.02 + r() * 0.02, Math.sin(a) * d);
    petals.setMatrixAt(i, m4);
    hearts.setMatrixAt(i, m4);
  }
  petals.userData.grass = true;
  hearts.userData.grass = true;
  petals.visible = hearts.visible = season !== 'winter';
  g.add(petals, hearts);

  // ---------------------------------------------------------------- au loin : l'écurie, des arbres, des collines
  const barnWall = keep(barnWood(31, true, 'warm'));
  barnWall.repeat.set(4, 1);
  const wallMat = keep(new THREE.MeshStandardMaterial({ map: barnWall, roughness: 0.9 }));
  const roofMat = keep(new THREE.MeshStandardMaterial({ color: 0x7c4434, roughness: 0.8 }));
  const stable = new THREE.Group();
  const sw = 8;
  const sh = 2.6;
  const sd = 4;
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(sw, sh, sd)), wallMat);
  body.position.y = sh / 2;
  body.castShadow = true;
  stable.add(body);
  const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(sw + 0.5, 0.14, sd * 0.62)), roofMat);
  for (const sd2 of [-1, 1]) {
    const rf = roof.clone();
    rf.position.set(0, sh + 0.62, sd2 * sd * 0.26);
    rf.rotation.x = sd2 * 0.52;
    rf.castShadow = true;
    stable.add(rf);
  }
  const doorMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a2616, roughness: 0.9 }));
  for (let i = 0; i < 3; i++) {
    const d = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.0, 1.9)), doorMat);
    d.position.set(-2.4 + i * 2.4, 0.95, sd / 2 + 0.01);
    stable.add(d);
    const top = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.06, 0.12)), keep(new THREE.MeshStandardMaterial({ color: 0xefe6d6, roughness: 0.8 })));
    top.position.set(d.position.x, 1.96, sd / 2 + 0.012);
    stable.add(top);
  }
  stable.position.set(-F - 7.5, 0, -F - 9);
  stable.rotation.y = 0.45;
  g.add(stable);
  const trunkMat = keep(new THREE.MeshStandardMaterial({ color: 0x5b4330, roughness: 1 }));
  const leafMats = (LEAVES[season] ?? LEAVES.summer).map((c) => keep(new THREE.MeshStandardMaterial({ color: c, roughness: 1, flatShading: true })));
  const crown = keep(lumpy(new THREE.IcosahedronGeometry(1, 2), 0.16, 4, 2.4));
  const trunkGeo = keep(new THREE.CylinderGeometry(0.12, 0.18, 1.8, 8));
  // (tout autour du rond : la caméra suit le cheval et fait le tour, il y a des arbres de tous les côtés ; en instances,
  // un appel de dessin par sorte de pièce)
  const spots = [];
  const nTree = 30;
  for (let i = 0; i < nTree; i++) {
    const a = (i / nTree) * Math.PI * 2 + (r() - 0.5) * 0.14;
    const d = F + 22 + r() * 8;
    const x = Math.cos(a) * d;
    const z = Math.sin(a) * d;
    if (Math.hypot(x - stable.position.x, z - stable.position.z) < 6) continue;
    spots.push({ x, z, sc: 1.1 + r() * 0.9 });
  }
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, spots.length);
  const crowns = leafMats.map((m) => new THREE.InstancedMesh(crown, m, spots.length));
  const nC = [0, 0, 0];
  spots.forEach((t, i) => {
    m4.compose(V(t.x, 0.9 * t.sc, t.z), q.identity(), s.setScalar(t.sc));
    trunks.setMatrixAt(i, m4);
    for (let j = 0; j < 3; j++) {
      const c = (i + j) % 3;
      const k2 = (0.95 + r() * 0.5) * t.sc;
      m4.compose(V(t.x + (r() - 0.5) * 1.2 * t.sc, (2.2 + r() * 0.9) * t.sc, t.z + (r() - 0.5) * 0.8), q.identity(), s.setScalar(k2));
      crowns[c].setMatrixAt(nC[c]++, m4);
    }
  });
  crowns.forEach((c, j) => {
    c.count = nC[j];
  });
  g.add(trunks, ...crowns);
  const hillMat = keep(new THREE.MeshStandardMaterial({ color: season === 'autumn' ? 0x9a9a5c : season === 'winter' ? 0x8c9a80 : 0x7c9f5c, roughness: 1 }));
  const hillGeo = keep(new THREE.SphereGeometry(1, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2));
  const nH = 12;
  const hills = new THREE.InstancedMesh(hillGeo, hillMat, nH);
  for (let i = 0; i < nH; i++) {
    const a = (i / nH) * Math.PI * 2 + (r() - 0.5) * 0.2;
    const d = F + 27 + r() * 5;
    e.set(0, -a + Math.PI / 2, 0);
    q.setFromEuler(e);
    m4.compose(V(Math.cos(a) * d, -0.2, Math.sin(a) * d), q, s.set(13 + r() * 7, 2.5 + r() * 3, 7));
    hills.setMatrixAt(i, m4);
  }
  g.add(hills);
  const sky = skySphere(keep, 60);
  g.add(sky);

  // ---------------------------------------------------------------- lumière : l'après-midi
  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x7a8a52, 0.95);
  g.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.5);
  sun.position.set(-F * 0.7, 9 + F * 0.4, F * 0.9);
  sun.target.position.set(0, 0, 0);
  sun.castShadow = true;
  const sm = high ? 2048 : 1024;
  sun.shadow.mapSize.set(sm, sm);
  const span = F + 0.6;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 30 + F * 2 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  g.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xd8e6ff, 0.35);
  fill.position.set(F, 4, -F);
  g.add(fill);

  // Les places des objets du jour, tout autour, dehors : au pied de la clôture, sur la lisse du haut, accrochés à un
  // poteau (face au rond) ; ni devant la barrière, ni sur la paille et le seau. (face : vers le milieu du rond)
  const places = [];
  const faceIn = (a) => Math.atan2(-Math.cos(a), -Math.sin(a));
  const nS = 28;
  for (let i = 0; i < nS; i++) {
    const a = (i / nS) * Math.PI * 2 + 0.05;
    const dG = Math.abs(Math.atan2(Math.sin(a - gateA), Math.cos(a - gateA)));
    const dB = Math.abs(Math.atan2(Math.sin(a - ba), Math.cos(a - ba)));
    if (dG < gateW * 1.2 || dB < 0.35) continue;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    places.push({ kind: 'floor', p: [c * (F + 0.6), 0, sn * (F + 0.6)], face: faceIn(a) });
    places.push({ kind: 'perch', p: [c * (F - 0.05), 0.92 * fH + railR, sn * (F - 0.05)], face: faceIn(a) + Math.PI / 2 });
    // (appuyée contre la clôture, dehors : le pied s'écarte de la clôture, placeExtras)
    places.push({ kind: 'lean', p: [c * (F + 0.12), 0, sn * (F + 0.12)], face: faceIn(a) + Math.PI });
  }
  for (let i = 0; i < nP; i++) {
    const a = (i / nP) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a - gateA), Math.cos(a - gateA))) < gateW * 1.2) continue;
    // (accroché au poteau, côté rond, entre la lisse du bas et celle du milieu)
    places.push({ kind: 'hang', p: [Math.cos(a) * (F - 0.13), 0.3 * fH + 0.06, Math.sin(a) * (F - 0.13)], face: faceIn(a) });
  }
  // (le réverbère de la nuit : dehors, à côté de la paille ; sa lumière au-dessus du milieu, comme un projecteur : le
  // cheval tourne tout autour, et l'on voit toujours le côté qui regarde le milieu)
  const lampSpot = V(Math.cos(ba - 0.3) * (F + 0.8), 0, Math.sin(ba - 0.3) * (F + 0.8));
  const lampLight = V(0, Math.max(3.2, 2.2 * u + 1.6), 0);

  return {
    group: g,
    props: {},
    dims: { R, F, fenceH: fH, trackW: w },
    kind: 'roundPen',
    outdoor: true,
    skyMesh: sky,
    ground: [grassMat, sandMat, tuftMat, hillMat],
    spots: places,
    lampSpot,
    lampFace: faceIn(ba - 0.3),
    lampLight,
    lampReach: R,
    // (la pluie, la neige : sur tout le rond, la caméra en fait le tour ; la brume plus loin, ses arbres tout autour, et
    // plus loin encore quand la caméra recule — au téléphone en portrait —, le cheval n'y est jamais noyé)
    weatherBox: { x0: -F - 2.5, x1: F + 2.5, z0: -F - 2.5, z1: F + 2.5, top: Math.max(3.5, 2.6 * u + 1.5) },
    fogScale: fogFromCamera((F * 4 + 40) / 36),
    layout() {},
    /** Le ciel, la brume, les reflets du pré (à rendre au départ : voir lunge3d.js). */
    sky(st) {
      st.scene.background = new THREE.Color(0xbcd8ee);
      st.scene.fog = new THREE.Fog(0xd9e6ee, F * 2.4 + 10, F * 4 + 40);
      st.scene.environmentIntensity = 0.5;
    },
    update() {},
    dispose() {
      keep.dispose();
      g.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
    },
  };
}

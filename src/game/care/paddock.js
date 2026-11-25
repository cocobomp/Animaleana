// Le pré des chèvres, derrière la chèvrerie : le décor de la partie de balle (src/ui/minigames/goatPlay3d.js). Une
// pelouse un peu usée devant la porte, des touffes d'herbe et des pâquerettes, la clôture en bois à trois lisses
// (comme les enclos du jeu), le mur chaulé de la chèvrerie avec sa porte à deux battants, un touret en bois où grimper,
// une botte de paille, des arbres et des collines au loin, le ciel ; le soleil de l'après-midi.
//
// Le terrain du jeu dessiné (400 × 165, fun.js ballGame) est posé sur l'herbe devant nous : yard = { xC (milieu, x),
// half (demi-largeur, m), zFar (bord du fond), depth (profondeur, m) }. Même forme que les autres décors (stallSet,
// barnSet) : { group, dims, props, layout, update, dispose }. Il suit l'heure, la météo et la saison du jeu (yard.season :
// l'herbe, les touffes, les arbres au loin, des feuilles mortes l'automne à la place des pâquerettes ; ambience.js : le
// ciel recolorable, le sol que la pluie mouille et que la neige blanchit, l'herbe cachée sous la neige, la nuit le
// réverbère et sa lumière sur le terrain, la brume qui recule avec la caméra) et reçoit les objets du jour (spots : le
// long de la clôture du fond, derrière le terrain).
//
// En voyage (yard.travel : la chèvre emmenée dans les Alpes, à la plage…), le pré n'est plus derrière la chèvrerie de
// la ferme : ni son mur, ni son toit, ni sa porte, ni la terre battue devant elle. La clôture fait tout le tour du
// fond, et le fond du lieu (away.js) se voit derrière, au-dessus des lisses.

import * as THREE from 'three';
import { canvasTex, rng } from './textures.js';
import { bag, barnWood, strawBale, lumpy } from './barnProps.js';
import { limeWallTexture } from './farmBarn.js';
import { farAway, skySphere, GRASS_TINT } from './outdoor.js';
import { fogFromCamera } from './ambience.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** L'herbe du pré : vert tendre, des brins plus clairs et plus sombres, quelques taches jaunies. */
export function grassTexture(seed = 3) {
  return canvasTex(256, 256, (c) => {
    const r = rng(seed);
    c.fillStyle = '#76a052';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 26; i++) {
      c.fillStyle = `rgba(${150 + r() * 40},${150 + r() * 30},${70 + r() * 20},0.16)`;
      c.beginPath();
      c.arc(r() * 256, r() * 256, 10 + r() * 26, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 6500; i++) {
      const g = 95 + r() * 85;
      c.strokeStyle = `rgba(${40 + r() * 60},${g},${30 + r() * 40},${0.45 + r() * 0.5})`;
      c.lineWidth = 0.8 + r() * 0.8;
      const x = r() * 256;
      const y = r() * 256;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 6);
      c.stroke();
    }
  }, { key: `pre-grass|${seed}` });
}

/** Terre battue devant la porte (là où les chèvres passent). */
export function dirtTexture() {
  return canvasTex(128, 128, (c) => {
    const r = rng(8);
    const gr = c.createRadialGradient(64, 64, 10, 64, 64, 64);
    gr.addColorStop(0, 'rgba(126,98,66,0.95)');
    gr.addColorStop(0.65, 'rgba(120,100,64,0.6)');
    gr.addColorStop(1, 'rgba(110,120,60,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(${70 + r() * 60},${55 + r() * 40},${35 + r() * 25},${0.3 * r()})`;
      c.fillRect(r() * 128, r() * 128, 1 + r() * 2, 1 + r() * 2);
    }
  }, { repeat: false, key: 'pre-dirt' });
}

/** Une touffe d'herbe (brins effilés, alpha découpé) : la toile d'une carte. */
export function tuftTexture() {
  return canvasTex(64, 64, (c) => {
    const r = rng(5);
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
  }, { repeat: false, key: 'pre-tuft' });
}

/** Les feuilles mortes de l'automne, à la place des pâquerettes (comme grassField, outdoor.js). */
const DEAD_LEAVES = [0xc8642c, 0xd89a3a, 0x8a4a24];

/**
 * Les pâquerettes de la saison : n l'été, plus au printemps, chacune à la place at() → [x, z] (tirée de r) ; des
 * pétales blancs, un cœur jaune. L'automne, des feuilles mortes rousses à leur place (moins nombreuses, plus grandes :
 * comme grassField, outdoor.js) ; rien l'hiver. size : le rayon d'une fleur. Deux instances au plus ; sous la neige,
 * elles disparaissent (userData.grass : ambience.js).
 */
export function daisies(keep, { n, season = 'summer', r, at, size = 0.012 }) {
  const g = new THREE.Group();
  if (season === 'winter') return g;
  const autumn = season === 'autumn';
  const count = Math.round(n * (autumn ? 0.6 : season === 'spring' ? 1.4 : 1));
  const petal = keep(new THREE.CircleGeometry(size, 10));
  petal.rotateX(-Math.PI / 2);
  const petals = new THREE.InstancedMesh(petal, keep(new THREE.MeshStandardMaterial({ color: autumn ? 0xffffff : 0xfbfaf4, roughness: 0.7 })), count);
  let hearts = null;
  if (!autumn) {
    const heart = keep(new THREE.CircleGeometry(size * 0.375, 8));
    heart.rotateX(-Math.PI / 2);
    heart.translate(0, 0.001, 0);
    hearts = new THREE.InstancedMesh(heart, keep(new THREE.MeshStandardMaterial({ color: 0xf1c232, roughness: 0.6 })), count);
  }
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const [x, z] = at(i);
    const y = 0.02 + r() * 0.02;
    if (autumn) {
      // (une feuille : un peu allongée, tournée au hasard, rousse, orange ou brune)
      m4.compose(V(x, y * 0.6, z), q.setFromEuler(e.set(0, r() * 6, 0)), V(1.6, 1, 1.28));
      petals.setColorAt(i, c.setHex(DEAD_LEAVES[i % 3]));
    } else m4.makeTranslation(x, y, z);
    petals.setMatrixAt(i, m4);
    hearts?.setMatrixAt(i, m4);
  }
  for (const o of [petals, hearts]) {
    if (!o) continue;
    o.userData.grass = true;
    g.add(o);
  }
  return g;
}

/** Le ciel : bleu en haut, pâle et un peu doré vers l'horizon (une grande sphère vue de dedans). */
export function skyDome(keep, r = 40) {
  const geo = keep(new THREE.SphereGeometry(r, 24, 12));
  const col = new Float32Array(geo.attributes.position.count * 3);
  const top = new THREE.Color(0x6fa6dc);
  const mid = new THREE.Color(0xbcd8ee);
  const low = new THREE.Color(0xf3e6c8);
  const c = new THREE.Color();
  for (let i = 0; i < geo.attributes.position.count; i++) {
    const y = geo.attributes.position.getY(i) / r;
    if (y > 0.18) c.copy(mid).lerp(top, Math.min(1, (y - 0.18) / 0.6));
    else c.copy(low).lerp(mid, Math.max(0, (y + 0.05) / 0.23));
    c.toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = keep(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = -1;
  return m;
}

/**
 * Le pré. stage : la scène (pour la taille de l'animal) ; yard : le terrain de jeu (yard.travel : en voyage, sans la
 * chèvrerie). Renvoie le décor (voir plus haut).
 */
export function paddockSet(stage, yard) {
  const g = new THREE.Group();
  const keep = bag();
  const high = stage.high;
  const u = stage.marks?.u ?? 0.7;
  const { xC, half, zFar, depth } = yard;
  const season = yard.season ?? 'summer';
  const travel = !!yard.travel;
  const zNear = zFar + depth;
  // (la clôture autour du terrain, un peu plus loin que lui ; on se tient devant, côté +z, sans clôture)
  const F = { x0: xC - half - 0.9, x1: xC + half + 0.9, z0: zFar - 0.9, z1: zNear + 1.6 };
  const mesh = (geo, mat, pos, rot = null, shadow = true) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = shadow;
    m.receiveShadow = true;
    g.add(m);
    return m;
  };

  // ---------------------------------------------------------------- sol : l'herbe, la terre battue devant la porte
  const grass = keep(grassTexture());
  grass.repeat.set(16, 16);
  const groundMat = keep(new THREE.MeshStandardMaterial({ map: grass, roughness: 1, color: GRASS_TINT[season] ?? 0xdfe8cf }));
  groundMat.userData.main = true;
  mesh(new THREE.PlaneGeometry(60, 60), groundMat, [xC, 0, zFar], [-Math.PI / 2, 0, 0], false);
  const door = V(F.x0 + 1.6, 0, F.z0 - 0.35);
  // (en voyage, pas de porte : pas de terre battue)
  const dirtMat = travel ? null : keep(new THREE.MeshStandardMaterial({ map: keep(dirtTexture()), transparent: true, depthWrite: false, roughness: 1 }));
  if (dirtMat) {
    const dirt = mesh(new THREE.PlaneGeometry(2.6, 2.2), dirtMat, [door.x, 0.003, door.z + 0.9], [-Math.PI / 2, 0, 0], false);
    dirt.userData.grass = true; // (sous la neige, elle disparaît comme l'herbe : ambience.js)
  }

  // touffes d'herbe (cartes en croix) et pâquerettes, semées partout sauf au milieu du terrain
  const tuftTex = keep(tuftTexture());
  const tuftGeo = keep(new THREE.PlaneGeometry(1, 1));
  tuftGeo.translate(0, 0.5, 0);
  const tuftMat = keep(new THREE.MeshStandardMaterial({ map: tuftTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9, color: season === 'autumn' ? 0xe8dcb0 : season === 'winter' ? 0xd8d8c4 : 0xffffff }));
  tuftMat.userData.tuft = true;
  const nT = high ? 420 : 260;
  const tufts = new THREE.InstancedMesh(tuftGeo, tuftMat, nT * 2);
  const r = rng(12);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const s = V();
  let k = 0;
  for (let i = 0; i < nT; i++) {
    const x = xC + (r() - 0.5) * (half * 2 + 6);
    const z = zFar - 2.5 + r() * (depth + 5);
    // (moins au milieu du terrain, là où la balle roule)
    const inYard = Math.abs(x - xC) < half * 0.8 && z > zFar + 0.2 && z < zNear - 0.1;
    if (inYard && r() < 0.65) continue;
    const h = (0.06 + r() * 0.09) * (inYard ? 0.7 : 1);
    for (const a of [0, Math.PI / 2]) {
      e.set(0, r() * 3 + a, 0);
      q.setFromEuler(e);
      s.set(h * 1.3, h, h * 1.3);
      m4.compose(V(x, 0, z), q, s);
      tufts.setMatrixAt(k++, m4);
    }
  }
  tufts.count = k;
  tufts.receiveShadow = true;
  tufts.userData.grass = true; // (sous la neige, l'herbe disparaît : ambience.js)
  g.add(tufts);
  // pâquerettes (des feuilles mortes l'automne, rien l'hiver)
  g.add(daisies(keep, { n: 70, season, r, size: 0.012, at: () => [xC + (r() - 0.5) * (half * 2 + 3), zFar - 0.6 + r() * (depth + 2)] }));

  // ---------------------------------------------------------------- la clôture (poteaux et trois lisses)
  const post = keep(barnWood(21, true, 'old'));
  const rail = keep(barnWood(22, false, 'pale'));
  const postMat = keep(new THREE.MeshStandardMaterial({ map: post, roughness: 0.9, color: 0xd8c4a8 }));
  const railMat = keep(new THREE.MeshStandardMaterial({ map: rail, roughness: 0.85, color: 0xe6d6bc }));
  const fH = Math.max(1.0, 1.1 * u + 0.3);
  const postGeo = keep(lumpy(new THREE.BoxGeometry(0.11, fH + 0.1, 0.11, 1, 3, 1), 0.006, 3));
  const backPosts = [];
  const side = (a, b) => {
    const len = a.distanceTo(b);
    const n = Math.max(1, Math.round(len / 1.7));
    for (let i = 0; i <= n; i++) {
      const p = a.clone().lerp(b, i / n);
      if (Math.abs(a.z - F.z0) < 1e-6 && Math.abs(b.z - F.z0) < 1e-6) backPosts.push(p);
      const m = new THREE.Mesh(postGeo, postMat);
      m.position.set(p.x, (fH + 0.1) / 2 - 0.05, p.z);
      m.rotation.y = (r() - 0.5) * 0.2;
      m.castShadow = true;
      m.receiveShadow = true;
      g.add(m);
    }
    const ang = Math.atan2(b.z - a.z, b.x - a.x);
    for (const y of [0.32, 0.62, 0.92]) {
      const geo = new THREE.BoxGeometry(len + 0.1, 0.09, 0.04);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 1.2, uv.getY(i));
      const m = mesh(geo, railMat, [(a.x + b.x) / 2, y * fH, (a.z + b.z) / 2], [0, -ang, (r() - 0.5) * 0.02]);
      m.position.add(V(-Math.sin(ang), 0, Math.cos(ang)).multiplyScalar(0.07));
    }
  };
  // (à la ferme, la chèvrerie ferme le fond à gauche ; en voyage, la clôture fait tout le tour du fond)
  side(V(travel ? F.x0 : F.x0 + 3.4, 0, F.z0), V(F.x1, 0, F.z0));
  side(V(F.x1, 0, F.z0), V(F.x1, 0, F.z1));
  side(V(F.x0, 0, F.z1), V(F.x0, 0, travel ? F.z0 : F.z0 + 0.6));

  // ---------------------------------------------------------------- la chèvrerie : le mur chaulé, la porte, le toit
  // (à la ferme seulement : en voyage, elle est restée à la ferme)
  const wallH = Math.max(2.4, 1.5 * u + 1.4);
  const bx = F.x0 - 0.4;
  const bw = 4.6;
  const dW = 1.05;
  if (!travel) {
    const lime = keep(limeWallTexture(6));
    lime.repeat.set(2.2, 1.1);
    const limeMat = keep(new THREE.MeshStandardMaterial({ map: lime, roughness: 0.95 }));
    // (tout le bâtiment dans un groupe : userData.house, la chèvrerie de la ferme)
    const house = new THREE.Group();
    house.userData.house = true;
    g.add(house);
    const inHouse = (m) => {
      house.add(m);
      return m;
    };
    const wall = new THREE.Mesh(keep(new THREE.BoxGeometry(bw, wallH, 3)), limeMat);
    wall.position.set(bx + bw / 2 - 0.6, wallH / 2, F.z0 - 1.9);
    wall.castShadow = true;
    wall.receiveShadow = true;
    house.add(wall);
    // le toit de tuiles brunes, débordant
    const tileTex = keep(canvasTex(128, 128, (c) => {
      const rr = rng(4);
      c.fillStyle = '#8a4b32';
      c.fillRect(0, 0, 128, 128);
      for (let y = 0; y < 128; y += 16) {
        for (let x = (y / 16) % 2 ? -8 : 0; x < 128; x += 16) {
          c.fillStyle = `rgb(${120 + rr() * 40},${60 + rr() * 25},${40 + rr() * 15})`;
          c.beginPath();
          c.ellipse(x + 8, y + 10, 8, 9, 0, 0, Math.PI);
          c.fill();
        }
        c.fillStyle = 'rgba(40,20,10,0.35)';
        c.fillRect(0, y + 14, 128, 2);
      }
    }, { key: 'pre-tiles' }));
    tileTex.repeat.set(3, 2);
    const roof = new THREE.Mesh(keep(new THREE.BoxGeometry(bw + 0.5, 0.12, 2.1)), keep(new THREE.MeshStandardMaterial({ map: tileTex, roughness: 0.85 })));
    roof.position.set(wall.position.x, wallH + 0.35, F.z0 - 0.85);
    roof.rotation.x = 0.42;
    roof.castShadow = true;
    house.add(roof);
    // la porte à deux battants : le bas fermé, le haut ouvert (le noir de l'intérieur)
    const doorWood = keep(barnWood(9, true, 'warm'));
    const doorMat = keep(new THREE.MeshStandardMaterial({ map: doorWood, roughness: 0.85 }));
    const dH = Math.max(1.85, 0.9 * u + 1.3);
    const dark = keep(new THREE.MeshStandardMaterial({ color: 0x1d1610, roughness: 1 }));
    inHouse(mesh(new THREE.PlaneGeometry(dW, dH), dark, [door.x, dH / 2, F.z0 - 0.39], null, false));
    inHouse(mesh(new THREE.BoxGeometry(dW, dH * 0.5, 0.05), doorMat, [door.x, dH * 0.25, F.z0 - 0.37]));
    const top = inHouse(mesh(new THREE.BoxGeometry(dW, dH * 0.48, 0.05), doorMat, [door.x - dW / 2, dH * 0.75, F.z0 - 0.37 + dW / 2]));
    top.geometry.translate(dW / 2, 0, 0);
    top.position.x = door.x - dW / 2;
    top.position.z = F.z0 - 0.37;
    top.rotation.y = -1.9; // (le battant du haut ouvert contre le mur)
    // l'encadrement de la porte
    for (const sx of [-1, 1]) inHouse(mesh(new THREE.BoxGeometry(0.1, dH + 0.08, 0.1), postMat, [door.x + sx * (dW / 2 + 0.05), (dH + 0.08) / 2, F.z0 - 0.36]));
    inHouse(mesh(new THREE.BoxGeometry(dW + 0.3, 0.1, 0.12), postMat, [door.x, dH + 0.05, F.z0 - 0.36]));
  }

  // ---------------------------------------------------------------- le touret où grimper, la botte de paille
  const spoolWood = keep(barnWood(26, false, 'pale'));
  const spoolMat = keep(new THREE.MeshStandardMaterial({ map: spoolWood, roughness: 0.85, color: 0xe2cfb0 }));
  const sR = Math.max(0.42, 0.55 * u + 0.1);
  const spool = new THREE.Group();
  for (const y of [0.04, 0.6 * sR + 0.04]) {
    const disc = new THREE.Mesh(keep(new THREE.CylinderGeometry(sR, sR, 0.06, 28)), spoolMat);
    disc.position.y = y;
    disc.castShadow = true;
    disc.receiveShadow = true;
    spool.add(disc);
  }
  const core = new THREE.Mesh(keep(new THREE.CylinderGeometry(sR * 0.45, sR * 0.45, 0.6 * sR, 18)), spoolMat);
  core.position.y = 0.3 * sR + 0.04;
  core.castShadow = true;
  spool.add(core);
  spool.position.set(F.x1 - sR - 0.35, 0, F.z0 + sR + 0.4);
  g.add(spool);
  const bale = strawBale(keep, { w: 0.9, h: 0.4, d: 0.48, seed: 5 });
  bale.position.set(F.x0 + 0.7, 0, F.z1 - 1.2);
  bale.rotation.y = 1.2;
  g.add(bale);

  // ---------------------------------------------------------------- au loin : arbres et collines (de la saison), le ciel
  const far = farAway(keep, { xC, zFar: F.z0 - 6, season, seed: 12, n: 9, spread: 3.2 });
  far.group.scale.set(1, 1.25, 1);
  g.add(far.group);
  const sky = skySphere(keep);
  g.add(sky);

  // ---------------------------------------------------------------- lumière : l'après-midi, de notre côté
  const hemi = new THREE.HemisphereLight(0xcfe4ff, 0x6f8a4a, 0.95);
  g.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d2, 2.6);
  sun.position.set(xC - 3.5, 7, zNear + 3.5);
  sun.target.position.set(xC, 0, (zFar + zNear) / 2);
  sun.castShadow = true;
  const sm = high ? 2048 : 1024;
  sun.shadow.mapSize.set(sm, sm);
  const span = half + 2.4;
  Object.assign(sun.shadow.camera, { left: -span, right: span, top: span, bottom: -span, near: 1, far: 22 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.radius = 3;
  g.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xd8e6ff, 0.35);
  fill.position.set(xC + 4, 3, zFar - 2);
  g.add(fill);

  // Les places des objets du jour : au sol devant la clôture du fond et sur sa lisse du haut (derrière le terrain : la
  // balle ne roule pas jusque-là), accrochés à ses poteaux ; ni devant la porte ni sur le touret. (En voyage, la
  // clôture du fond va jusqu'au coin de gauche : les places aussi.) Au sol, toutes serrées contre le décor (tight :
  // extras.js) — ce qui y est posé ne passe ni dans les lisses, ni dans un poteau, la paille, le touret ou le mur ; une
  // botte tient devant la clôture du fond, la brouette ne tient pas dans ce petit pré.
  const spots = [];
  const topY = 0.92 * fH + 0.05;
  const back0 = travel ? F.x0 + 0.45 : F.x0 + 3.7;
  for (let x = back0; x <= F.x1 - 2 * sR - 0.6; x += 0.35) {
    spots.push({ kind: 'floor', p: [x, 0, F.z0 + 0.48], tight: true });
    spots.push({ kind: 'perch', p: [x, topY, F.z0 + 0.07], face: 0 });
  }
  for (const p of backPosts) if (p.x > back0 - 0.1 && p.x < F.x1 - 0.2) spots.push({ kind: 'hang', p: [p.x, 0.32 * fH + 0.06, F.z0 + 0.06], face: 0 });
  for (let z = F.z0 + 2 * sR + 1; z <= zNear; z += 0.35) spots.push({ kind: 'perch', p: [F.x1 - 0.07, topY, z], face: -Math.PI / 2 });
  // (le long du mur chaulé de la chèvrerie, de part et d'autre de la porte : au pied du mur, appuyé, accroché ; au sol,
  // entre le mur, l'encadrement de la porte, le poteau du coin et la clôture de gauche)
  const wallZ = F.z0 - 0.4;
  for (let x = bx - 0.3; !travel && x <= F.x0 + 3.2; x += 0.3) {
    if (Math.abs(x - door.x) < dW / 2 + 0.3) continue;
    spots.push({ kind: 'floor', p: [x, 0, wallZ + 0.42], tight: true });
    spots.push({ kind: 'lean', p: [x, 0, wallZ + 0.04] });
    spots.push({ kind: 'hang', p: [x, Math.min(1.25, wallH - 0.6), wallZ + 0.005], face: 0 });
  }
  // (le long de la clôture de gauche et de droite, hors du terrain : au sol, sur la lisse du haut ; pas sur la paille)
  for (let z = F.z0 + 0.8; z <= zNear + 0.2; z += 0.35) {
    if (Math.abs(z - bale.position.z) > 0.75) spots.push({ kind: 'floor', p: [F.x0 + 0.35, 0, z], tight: true }, { kind: 'perch', p: [F.x0 + 0.07, topY, z], face: Math.PI / 2 });
    if (z > F.z0 + 2 * sR + 1) spots.push({ kind: 'floor', p: [F.x1 - 0.35, 0, z], tight: true });
  }
  // (le réverbère de la nuit : contre le mur, juste à droite de la porte, son bras au-dessus d'elle — là où rien ne se
  // pose : plus loin, il prenait la place des objets du jour qu'on voit au téléphone en portrait ; en voyage, à la même
  // place, juste derrière la clôture du fond)
  // (sa lumière : en hauteur, devant le terrain, du côté de la caméra. On voit la chèvre de devant et d'en haut, et
  // elle attend la balle au premier rang : une lumière au-dessus du terrain l'éclairait par le dos, le côté qu'on voit
  // restait noir. D'ici, ce côté reçoit la lumière partout où elle court, jusqu'au fond)
  const lampSpot = V(door.x + dW / 2 + 0.2, 0, F.z0 - 0.25);
  const lampLight = V(xC, Math.max(2.6, 1.8 * u + 1.6), zNear + depth * 0.55);

  return {
    group: g,
    props: {},
    // (houseX1 : le bout droit de la chèvrerie, au fond à gauche — rien du lieu du voyage n'y est posé, away.js ; null
    // en voyage, sans chèvrerie)
    dims: { ...F, halfW: half, back: zFar, front: zNear, houseX1: travel ? null : F.x0 + 3.7 },
    kind: 'pre',
    outdoor: true,
    skyMesh: sky,
    ground: [groundMat, tuftMat, ...far.mats],
    // (la terre battue : mouillée et assombrie comme l'herbe, ambience.js)
    groundMarks: dirtMat ? [dirtMat] : [],
    // (en voyage, le fond du lieu deux fois moins loin au-delà de 6 m : la caméra du jeu, d'en haut, ne voit pas
    // l'horizon ; ses arbres et sa construction viennent derrière la clôture, là où sont ceux de la ferme — away.js)
    awayFold: 0.5,
    spots,
    lampSpot,
    lampFace: Math.PI,
    lampLight,
    // (de son pied aux coins du fond : là où la chèvre va le plus loin d'elle)
    lampReach: Math.hypot(half, depth * 1.55),
    // (la pluie, la neige : sur tout le terrain, pas seulement autour de la chèvre)
    weatherBox: { x0: F.x0 - 1.5, x1: F.x1 + 1.5, z0: F.z0 - 2, z1: F.z1 + 2.5, top: Math.max(3, 3 * u + 1) },
    // (la caméra voit tout le terrain de loin, plus loin encore en portrait : la brume recule d'autant)
    fogScale: fogFromCamera(),
    layout() {},
    /** Le ciel, la brume, les reflets du pré (à rendre au départ : voir goatPlay3d.js). */
    sky(st) {
      st.scene.background = new THREE.Color(0xbcd8ee);
      st.scene.fog = new THREE.Fog(0xd9e6ee, 14, 34);
      st.scene.environmentIntensity = 0.55;
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

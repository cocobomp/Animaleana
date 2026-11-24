// La bergerie, la chèvrerie et l'étable : le décor de la scène de soin des moutons, des chèvres et des vaches
// (src/game/care/stage.js). Une case paillée dans un vieux bâtiment de ferme, dans le style des bâtiments du jeu
// (planches brunes, poteaux et poutres, chaux, paille dorée) : une litière épaisse, le râtelier à foin en bois au mur
// devant sa tête et l'auge dessous, l'abreuvoir en tôle galvanisée et son robinet, une barrière en bois à lisses vers
// la case voisine (des bottes de paille empilées, la pénombre), une lucarne au fond d'où entre le soleil (un rai de
// lumière, des poussières qui dansent), la lanterne, la pierre à sel, la fourche, la plaque à son nom. Lumière chaude.
// La chèvrerie a son banc (les chèvres aiment grimper) et un mur chaulé ; l'étable est plus grande, chaulée, et la
// brosse à vaches jaune est au mur.
//
// Tout se place d'après l'animal (stage.marks, sa bouche quand il mange : stage.eatMuzzle) : un agneau d'Ouessant ou
// une Holstein. Repère : l'animal au milieu, de profil, la tête vers +x ; on se tient du côté +z (l'allée).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { plateTexture } from '../models/interiorKit.js';
import { cowBrushModel } from './stableChores.js';
import { waterTap, avatarHand } from './props.js';
import { canvasTex, strawFloorTexture, noiseTexture, rng } from './textures.js';
import { hayRack, waterTrough, strawBale, saltLick, pitchfork, lantern, barnWood, bag } from './barnProps.js';
import { grassField, fenceMats, fenceLine, farAway, skySphere, outdoorLights, plankPanel } from './outdoor.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Le décor de cet animal : la bergerie (mouton), la chèvrerie (chèvre), l'étable (vache). */
export function barnKind(species) {
  return species === 'cow' ? 'etable' : species === 'goat' ? 'chevrerie' : 'bergerie';
}

/**
 * La case. stage : la scène (marks, double, holder). Renvoie { group, props, layout, walls, plate, dims, update,
 * restore, dispose } (comme stallSet). opts.outdoor : le pré (l'animal est dehors) — l'herbe, la clôture, le ciel ;
 * le râtelier et l'abreuvoir à la même place, le râtelier accroché au panneau en planches de la clôture.
 * opts.season : la saison (l'herbe, les arbres au loin).
 */
export function barnSet(stage, opts = {}) {
  const out = !!opts.outdoor;
  const g = new THREE.Group();
  const keep = bag();
  const high = stage.high;
  const kind = out ? 'pre' : barnKind(stage.a?.species);
  // (la vache garde sa taille de case et sa façon de manger, dedans comme au pré)
  const etable = barnKind(stage.a?.species) === 'etable';

  // ---------------------------------------------------------------- l'animal et la taille de la case
  stage.holder.position.set(0, 0, -0.15);
  stage.measure();
  const L0 = stage.marks;
  const u = L0.u; // (hauteur au garrot : l'unité de tout le décor)
  const kp = clamp(u / 0.72, 0.42, 2.2); // (taille des accessoires : 1 pour un mouton adulte ; un agneau d'Ouessant : 0,42)
  const box = stage.box;
  const lenX = box.max.x - box.min.x;
  const halfZ = (box.max.z - box.min.z) / 2;
  const S = {
    // (assez large pour qu'il recule devant l'abreuvoir, layout('water'), sans toucher la barrière)
    halfW: Math.max(1.6, lenX * 0.56 + 0.7 + 0.22 * kp),
    back: -0.15 - Math.max(0.95, halfZ + 0.8),
    front: 2.3 + (etable ? 0.4 : 0),
    eave: Math.max(2.35, u * 1.7 + 0.7),
  };
  S.roof = S.eave + 0.45;
  // Le râtelier : au mur de droite, devant sa tête ; sa bouche, tête baissée pour manger, entre les barreaux.
  // (l'auge devant le râtelier : il y mange tête baissée, le foin qu'il tire des barreaux y tombe)
  const rack = { w: 0.85 * kp, h: 0.42 * kp, d: 0.11 * kp, trough: 0.13 * kp, troughW: Math.max(0.22, 0.32 * kp) };
  // (la vache amène sa bouche à la hauteur de l'auge : un peu plus du tiers de sa hauteur au garrot)
  if (etable) stage.eatReach = clamp(u * 0.36, 0.25, 0.75);
  const eat0 = stage.eatMuzzle();
  const wantX = S.halfW - rack.troughW * 0.5;
  let dx = wantX - eat0.x;
  // (le rebord de l'auge juste au-dessus de sa bouche tête baissée : la bouche dans le foin)
  const rackY = clamp(eat0.y + 0.05 * kp, 0.14 * kp, u * 0.9);
  // (tête haute, son nez reste devant les barreaux)
  const standNose = L0.muzzle.x;
  const barsAt = (y) => S.halfW - rack.d * clamp((y - rackY) / rack.h, 0, 1) - 0.03 - 0.025 * kp;
  dx = Math.min(dx, barsAt(L0.muzzle.y) - standNose);
  stage.holder.position.x += dx;
  stage.measure();
  const L = stage.marks;
  const eat = eat0.clone().add(V(dx, 0, 0));
  // (la litière tassée là où il se tient et piétine — de la queue à l'auge, la largeur de ses sabots — : on voit ses
  // sabots, la paille ne passe plus par-dessus)
  {
    const hz = L.hooves.map((h) => h.z);
    S.trod = { x0: L.tailTip.x - 0.2 * u, x1: S.halfW, z0: Math.min(...hz) - 0.12 * u, z1: Math.max(...hz) + 0.12 * u };
  }

  // ---------------------------------------------------------------- matières
  const wallTex = keep(barnWood(etable ? 17 : 7, true, 'old'));
  wallTex.repeat.set(3.2, 1);
  const sideTex = keep(barnWood(etable ? 18 : 8, false, 'old'));
  sideTex.repeat.set(2, 2.4);
  const beamTex = keep(barnWood(5, false, 'warm'));
  const railTex = keep(barnWood(14, false, 'pale'));
  const straw = keep(strawFloorTexture());
  straw.repeat.set(3, 3);
  const grain = keep(noiseTexture('#6e5a44', 0.2, 9));
  grain.repeat.set(5, 5);
  const plankMat = keep(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }));
  const sideMat = keep(new THREE.MeshStandardMaterial({ map: sideTex, roughness: 0.9 }));
  const beamMat = keep(new THREE.MeshStandardMaterial({ map: beamTex, roughness: 0.88, color: 0xc9b39a }));
  const railMat = keep(new THREE.MeshStandardMaterial({ map: railTex, roughness: 0.8 }));
  const strawMat = keep(new THREE.MeshStandardMaterial({ map: straw, roughness: 1, color: 0xf2e2b8 }));
  const dirtMat = keep(new THREE.MeshStandardMaterial({ map: grain, roughness: 1, color: 0x9a8a72 }));
  const iron = keep(new THREE.MeshStandardMaterial({ color: 0x2a2c30, roughness: 0.45, metalness: 0.7 }));
  const lime = kind === 'bergerie' ? null : keep(limeWallTexture(etable ? 4 : 6));
  if (lime) lime.repeat.set(1.3, 0.9);
  const limeMat = lime ? keep(new THREE.MeshStandardMaterial({ map: lime, roughness: 0.95 })) : null;

  const walls = { back: new THREE.Group(), left: new THREE.Group(), right: new THREE.Group(), roof: new THREE.Group(), front: new THREE.Group() };
  for (const w of Object.values(walls)) g.add(w);
  let into = g;
  const mesh = (geo, mat, pos, rot = null, shadow = true) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = shadow;
    m.receiveShadow = true;
    into.add(m);
    return m;
  };
  // (une boîte dont la texture garde la taille des planches, quelle que soit sa taille)
  const plankBox = (w, h, d, mat, pos, tile = 1.2, rot = null) => {
    const geo = new THREE.BoxGeometry(w, h, d);
    const uv = geo.attributes.uv;
    const big = Math.max(w, d);
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * big / tile, uv.getY(i) * h / tile);
    return mesh(geo, mat, pos, rot);
  };

  // ---------------------------------------------------------------- sol : terre battue et litière épaisse
  const win = { x: -S.halfW * 0.38, y: Math.min(S.eave - 0.55, Math.max(1.55, u * 1.55)), w: 0.75, h: 0.55 };
  let plateG = null;
  let plateMesh = null;
  let plateX = 0;
  let plateY = 1;
  let cowBrush = null;
  let outside = null;
  if (out) outside = buildPre();
  else {
  mesh(new THREE.PlaneGeometry(14, 14), dirtMat, [0, -0.002, 0], [-Math.PI / 2, 0, 0], false);
  const bed = new THREE.PlaneGeometry(S.halfW * 2 + 0.1, S.front - S.back + 0.2, 52, 40);
  const bp = bed.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const zw = (S.back + S.front) / 2 - bp.getY(i); // (z du monde : le plan est tourné)
    bp.setZ(i, litterHeight(S, x, zw));
  }
  bed.computeVertexNormals();
  mesh(bed, strawMat, [0, 0, (S.back + S.front) / 2], [-Math.PI / 2, 0, 0], false);
  const strands = strawStrands(keep, high ? 2400 : 1400, S);
  g.add(strands);

  // ---------------------------------------------------------------- murs
  const wallT = 0.09;
  // Fond : planches (bergerie) ou chaux sur un soubassement de planches (chèvrerie, étable), la lucarne en haut.
  into = walls.back;
  const backW = S.halfW * 2 + 0.3;
  const backMat = limeMat ?? plankMat;
  const piece = (x0, x1, y0, y1, mat = backMat) => {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return;
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, wallT);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0) + 3) / 1.25, (y0 + uv.getY(i) * (y1 - y0)) / 1.25);
    mesh(geo, mat, [(x0 + x1) / 2, (y0 + y1) / 2, S.back - wallT / 2]);
  };
  const bx0 = -backW / 2;
  const bx1 = backW / 2;
  piece(bx0, bx1, 0, win.y - win.h / 2);
  piece(bx0, bx1, win.y + win.h / 2, S.eave + 0.3);
  piece(bx0, win.x - win.w / 2, win.y - win.h / 2, win.y + win.h / 2);
  piece(win.x + win.w / 2, bx1, win.y - win.h / 2, win.y + win.h / 2);
  if (limeMat) {
    // soubassement en planches (les sabots, la litière) et lisse
    const lowH = Math.max(0.55, u * 0.75);
    plankBox(backW, lowH, 0.035, plankMat, [0, lowH / 2, S.back + 0.018]);
    plankBox(backW, 0.07, 0.08, beamMat, [0, lowH + 0.03, S.back + 0.04]);
  }
  // la lucarne : le ciel et la prairie dehors, un cadre épais, deux barreaux
  const sky = keep(canvasTex(128, 96, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, 96);
    gr.addColorStop(0, '#fdf6e2');
    gr.addColorStop(0.5, '#ffe9bc');
    gr.addColorStop(1, '#f2cf92');
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 96);
    c.fillStyle = 'rgba(110,150,70,0.55)';
    c.beginPath();
    c.moveTo(0, 74);
    c.quadraticCurveTo(50, 60, 128, 70);
    c.lineTo(128, 96);
    c.lineTo(0, 96);
    c.fill();
    c.fillStyle = 'rgba(80,110,50,0.4)';
    c.beginPath();
    c.ellipse(28, 66, 18, 12, 0, 0, Math.PI * 2);
    c.fill();
  }, { key: 'barnSky' }));
  const pane = mesh(new THREE.PlaneGeometry(win.w, win.h), keep(new THREE.MeshBasicMaterial({ map: sky, toneMapped: false })), [win.x, win.y, S.back - wallT - 0.01], null, false);
  pane.material.color.setScalar(1.55);
  pane.userData.window = { w: win.w, h: win.h, bright: 1.55 }; // (le ciel dehors : l'heure, la météo, ambience.js)
  const fr = (w, h, x, y) => plankBox(w, h, 0.14, beamMat, [x, y, S.back - 0.02], 0.8);
  fr(win.w + 0.2, 0.1, win.x, win.y + win.h / 2 + 0.05);
  fr(win.w + 0.24, 0.1, win.x, win.y - win.h / 2 - 0.05);
  fr(0.1, win.h, win.x - win.w / 2 - 0.05, win.y);
  fr(0.1, win.h, win.x + win.w / 2 + 0.05, win.y);
  for (const k of [-1, 1]) mesh(new THREE.CylinderGeometry(0.012, 0.012, win.h, 8), iron, [win.x + k * win.w * 0.18, win.y, S.back - 0.03]);
  // Poteaux de la charpente (coins et milieu du fond) et sablière.
  const postW = 0.16 + (etable ? 0.04 : 0);
  for (const x of [-S.halfW, 0.15 * S.halfW, S.halfW]) plankBox(postW, S.eave + 0.2, postW, beamMat, [x, (S.eave + 0.2) / 2, S.back + postW / 2 - 0.02], 0.9);
  plankBox(backW + 0.2, 0.2, 0.18, beamMat, [0, S.eave + 0.05, S.back + 0.08], 0.9);

  // Mur de droite (devant sa tête) : planches jusqu'en haut ; le râtelier y est accroché.
  into = walls.right;
  {
    const depth = S.front - S.back;
    const lowH = limeMat ? Math.max(0.55, u * 0.75) : S.eave + 0.2;
    plankBox(wallT, lowH, depth, sideMat, [S.halfW + wallT / 2, lowH / 2, (S.back + S.front) / 2]);
    if (limeMat) {
      const up = new THREE.BoxGeometry(wallT, S.eave + 0.2 - lowH, depth);
      const uv = up.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * depth / 1.25, uv.getY(i) * (S.eave + 0.2 - lowH) / 1.25);
      mesh(up, limeMat, [S.halfW + wallT / 2, (S.eave + 0.2 + lowH) / 2, (S.back + S.front) / 2]);
      plankBox(0.08, 0.07, depth, beamMat, [S.halfW - 0.02, lowH + 0.03, (S.back + S.front) / 2]);
    }
    plankBox(postW, S.eave + 0.2, postW, beamMat, [S.halfW - postW / 2 + 0.02, (S.eave + 0.2) / 2, S.front - 0.1], 0.9);
    plankBox(0.18, 0.2, depth, beamMat, [S.halfW - 0.02, S.eave + 0.05, (S.back + S.front) / 2], 0.9);
  }

  // Côté gauche : une barrière en bois à lisses (la case voisine dans la pénombre, des bottes de paille empilées).
  into = walls.left;
  {
    const depth = S.front - S.back;
    const fx = -S.halfW;
    const railH = Math.max(1.0, u * 1.25);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const y = 0.22 + (i * (railH - 0.22)) / (n - 1);
      plankBox(0.05, 0.13, depth, railMat, [fx, y, (S.back + S.front) / 2], 1.1);
    }
    for (const z of [S.back + 0.06, (S.back + S.front) / 2, S.front - 0.1]) plankBox(0.12, railH + 0.18, 0.12, beamMat, [fx, (railH + 0.18) / 2, z], 0.9);
    // écharpe en travers (croix de Saint-André, comme les portes de l'écurie du jeu)
    const zA = S.back + 0.1;
    const zB = (S.back + S.front) / 2 - 0.05;
    const diag = Math.hypot(zB - zA, railH - 0.25);
    plankBox(0.045, 0.11, diag, railMat, [fx + 0.03, (railH + 0.22) / 2, (zA + zB) / 2], 1.1, [Math.atan2(railH - 0.25, zB - zA), 0, 0]);
    // poteau haut et poutre (le bâtiment continue au-dessus de la barrière)
    plankBox(postW, S.eave + 0.2, postW, beamMat, [fx, (S.eave + 0.2) / 2, S.front - 0.1], 0.9);
    plankBox(0.18, 0.2, depth, beamMat, [fx, S.eave + 0.05, (S.back + S.front) / 2], 0.9);
    // la case voisine : paille, bottes de paille empilées, mur du fond sombre
    const nb = new THREE.Group();
    nb.position.set(fx - 1.6, 0, 0);
    mesh(new THREE.PlaneGeometry(3.2, depth + 1), keep(new THREE.MeshStandardMaterial({ map: straw, roughness: 1, color: 0xa08a64 })), [fx - 1.6, 0.03, (S.back + S.front) / 2], [-Math.PI / 2, 0, 0], false);
    mesh(new THREE.PlaneGeometry(depth + 3, S.eave + 0.6), keep(new THREE.MeshStandardMaterial({ map: wallTex, color: 0x6a5440, roughness: 1, emissive: 0x1a120a })), [fx - 3.0, (S.eave + 0.6) / 2, (S.back + S.front) / 2], [0, Math.PI / 2, 0], false);
    const baleK = clamp(0.75 + kp * 0.15, 0.85, 1.1);
    const bales = [[-0.6, 0, S.back + 0.4, 0.1], [0.35, 0, S.back + 0.42, -0.05], [-0.15, 1, S.back + 0.42, 0.04], [-0.9, 0, S.back + 1.05, 1.5]];
    for (const [ox, lvl, z, ry] of bales) {
      const b = strawBale(keep, { w: 0.9 * baleK, h: 0.4 * baleK, d: 0.48 * baleK, seed: 3 + lvl + ox });
      b.position.set(fx - 1.2 + ox, lvl * 0.4 * baleK, z);
      b.rotation.y = ry;
      into.add(b);
    }
  }
  // Une botte de paille dans notre case, au fond à gauche (on s'y assoit pour traire, on y pose la brosse).
  into = g;
  {
    const b = strawBale(keep, { w: 0.85, h: 0.38, d: 0.46, seed: 9 });
    b.position.set(-S.halfW + 0.55, 0.02, S.back + 0.36);
    b.rotation.y = 0.06;
    walls.back.add(b);
  }

  // Charpente : poutres en travers, solives, planches du grenier au-dessus (on n'en voit que le dessous).
  into = walls.roof;
  for (const z of [S.back + 0.3, (S.back + S.front) / 2 + 0.2, S.front - 0.4]) plankBox(S.halfW * 2 + 0.4, 0.22, 0.18, beamMat, [0, S.eave + 0.05, z], 0.9);
  const joists = Math.round((S.halfW * 2) / 0.6);
  for (let i = 0; i <= joists; i++) plankBox(0.1, 0.12, S.front - S.back + 0.4, beamMat, [-S.halfW + (i * S.halfW * 2) / joists, S.eave + 0.22, (S.back + S.front) / 2], 0.9);
  plankBox(S.halfW * 2 + 0.4, 0.04, S.front - S.back + 0.6, sideMat, [0, S.eave + 0.3, (S.back + S.front) / 2]);
  // (du foin dépasse du grenier, entre les solives)
  // Devant (l'allée, notre côté) : une barrière basse et l'allée en dalles ; on ne la voit que de l'autre côté.
  into = walls.front;
  {
    const railH = Math.max(1.0, u * 1.25);
    for (let i = 0; i < 3; i++) plankBox(S.halfW * 2, 0.12, 0.05, railMat, [0, 0.3 + (i * (railH - 0.3)) / 2, S.front], 1.1);
    mesh(new THREE.PlaneGeometry(S.halfW * 2 + 4, 3), keep(new THREE.MeshStandardMaterial({ color: 0x8c8478, roughness: 0.95 })), [0, 0.004, S.front + 1.5], [-Math.PI / 2, 0, 0], false);
    mesh(new THREE.PlaneGeometry(S.halfW * 2 + 4, S.roof), keep(new THREE.MeshStandardMaterial({ map: wallTex, color: 0x6a5038, roughness: 1, emissive: 0x1e140a })), [0, S.roof / 2, S.front + 3], [0, Math.PI, 0], false);
  }

  // ---------------------------------------------------------------- petit décor
  into = walls.back;
  plateX = clamp(win.x + win.w / 2 + 0.75, -S.halfW + 0.5, S.halfW - 0.5);
  plateY = clamp(Math.max(u * 1.35, 1.1), 0.9, win.y + 0.1);
  const plate = keep(plateTexture(stage.a?.name ?? ''));
  // (la plaque et ses deux clous ensemble : elle se déplace le long du mur si un cadrage la coupe, voir fitPlate)
  plateG = new THREE.Group();
  plateG.position.set(plateX, plateY, S.back);
  walls.back.add(plateG);
  into = plateG;
  plateMesh = mesh(new THREE.BoxGeometry(0.56, 0.18, 0.025), keep(new THREE.MeshStandardMaterial({ map: plate, roughness: 0.6 })), [0, 0, 0.013]);
  for (const k of [-0.23, 0.23]) mesh(new THREE.SphereGeometry(0.011, 8, 6), iron, [k, 0, 0.03], null, false);
  into = walls.back;
  // pierre à sel au mur du fond, à hauteur de bouche
  const salt = saltLick(keep);
  salt.position.set(clamp(L.body.x + 0.15 * u, -S.halfW + 0.4, S.halfW - 0.5), clamp(L.muzzle.y * 0.85, 0.35, 1.3), S.back);
  salt.scale.setScalar(clamp(kp, 0.8, 1.6));
  walls.back.add(salt);
  // lanterne à la poutre du milieu, la fourche contre la barrière
  const lamp = lantern(keep);
  lamp.position.set(-S.halfW * 0.35, S.eave - 0.08, (S.back + S.front) / 2 + 0.2);
  walls.roof.add(lamp);
  const fork = pitchfork(keep);
  fork.position.set(-S.halfW + 0.12, 0.05, S.front - 0.55);
  fork.rotation.set(0.05, 0.4, 0.2);
  walls.left.add(fork);
  // chèvrerie : le banc où elles grimpent ; étable : la brosse à vaches jaune
  if (kind === 'chevrerie') {
    into = walls.back;
    const bw = 1.1;
    const bh = clamp(u * 0.55, 0.3, 0.5);
    plankBox(bw, 0.06, 0.42, railMat, [-S.halfW + 0.7, bh, S.back + 0.95], 0.9);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) plankBox(0.07, bh, 0.07, beamMat, [-S.halfW + 0.7 + sx * (bw / 2 - 0.08), bh / 2, S.back + 0.95 + sz * 0.15], 0.9);
  }
  if (etable) {
    into = walls.back;
    const by = clamp(u * 0.95, 0.9, 1.6);
    const bxp = clamp(L.croup.x - 0.2, -S.halfW + 0.6, S.halfW - 0.8);
    // (le rouleau de poils jaunes et noirs sous son capot rouge, au bout de son bras : il tourne doucement)
    cowBrush = cowBrushModel(keep);
    cowBrush.group.position.set(bxp, by, S.back + 0.52);
    walls.back.add(cowBrush.group);
  }
  into = g;
  }

  /**
   * Le pré : l'herbe, la clôture à droite (le panneau en planches où le râtelier est accroché, comme au mur de la
   * case) et au fond, les arbres au loin, le ciel, la plaque à son nom sur la clôture du fond.
   */
  function buildPre() {
    const season = opts.season ?? 'summer';
    const fm = fenceMats(keep);
    fm.plank = sideMat;
    const field = grassField(keep, { x0: -8, x1: 8, z0: S.back - 6, z1: S.front + 3, season, high, keepOut: { x0: L.tailTip.x - 0.3, x1: S.halfW, z0: -0.15 - 0.6 * u, z1: -0.15 + 0.6 * u } });
    g.add(field.group);
    const fh = Math.max(1.1, u * 1.15 + 0.2);
    const right = fenceLine(keep, walls.right, fm, V(S.halfW + 0.06, 0, S.back - 1.4), V(S.halfW + 0.06, 0, S.front + 2.2), { h: fh, seed: 4 });
    plankPanel(keep, walls.right, fm, { x: S.halfW, z0: eat.z - rack.w / 2 - 0.25, z1: eat.z + rack.w / 2 + 0.25, y0: Math.max(0.05, rackY - rack.trough - 0.35), y1: rackY + rack.h + 0.12 });
    const backZ = S.back - 0.2;
    const back = fenceLine(keep, walls.back, fm, V(-8, 0, backZ), V(S.halfW + 0.06, 0, backZ), { h: fh, seed: 5 });
    fenceLine(keep, walls.left, fm, V(-S.halfW - 3.5, 0, backZ), V(-S.halfW - 3.5, 0, S.front + 2.5), { h: fh, seed: 6 });
    const far = farAway(keep, { xC: 0, zFar: S.back - 17, season, n: 13, spread: 4.2 });
    g.add(far.group);
    const sky = skySphere(keep);
    g.add(sky);
    plateX = clamp(win.x + win.w / 2 + 0.75, -S.halfW + 0.5, S.halfW - 0.5);
    plateY = back.top - 0.08;
    plateG = new THREE.Group();
    plateG.position.set(plateX, plateY, backZ + 0.04);
    walls.back.add(plateG);
    plateMesh = new THREE.Mesh(keep(new THREE.BoxGeometry(0.56, 0.18, 0.025)), keep(new THREE.MeshStandardMaterial({ map: keep(plateTexture(stage.a?.name ?? '')), roughness: 0.6 })));
    plateMesh.position.z = 0.013;
    plateMesh.castShadow = true;
    plateG.add(plateMesh);
    const spots = [];
    for (let x = -S.halfW - 1.5; x <= S.halfW - 0.6; x += 0.4) {
      spots.push({ kind: 'floor', p: [x, 0, backZ + 0.45] });
      spots.push({ kind: 'perch', p: [x, back.top + 0.02, backZ], face: 0 });
    }
    for (const p of back.posts) if (p.x < S.halfW - 0.4) spots.push({ kind: 'lean', p: [p.x + 0.15, 0, backZ + 0.08] });
    for (let z = 0.4; z <= S.front - 0.2; z += 0.4) spots.push({ kind: 'floor', p: [-S.halfW + 0.2, 0, z] });
    for (let z = S.back - 1.2; z <= S.front + 1.8; z += 0.3) {
      if (Math.abs(z - eat.z) < rack.w / 2 + 0.4) continue;
      spots.push({ kind: 'perch', p: [S.halfW + 0.06, right.top + 0.02, z], face: -Math.PI / 2 });
    }
    return { sky, ground: [...field.mats, ...far.mats], spots };
  }

  // ---------------------------------------------------------------- accessoires
  const props = {};
  const hand = avatarHand(stage.game?.profile);
  props.rack = hayRack({ ...rack, high, hand });
  props.rack.group.position.set(S.halfW, rackY, eat.z);
  props.rack.setFloor(-rackY + 0.04);
  walls.right.add(props.rack.group);
  // Abreuvoir : à l'angle avant droit (dans l'allée de la case) ; pour boire, sous sa bouche.
  const tr = { r: 0.14 * kp, len: 0.75 * kp };
  props.trough = waterTrough({ ...tr, high });
  g.add(props.trough.group);
  props.tap = waterTap();
  props.tap.group.scale.setScalar(clamp(kp, 1, 1.5));
  g.add(props.tap.group);
  /**
   * Où sont les accessoires selon le soin : 'feed' (râtelier vide, devant sa tête), 'water' (l'abreuvoir sous sa
   * bouche et le robinet), 'rest' (un peu de foin au râtelier : il a déjà mangé ; tête libre pour la friandise, les
   * caresses, la brosse).
   */
  // (au repos, l'abreuvoir est le long du mur du fond, à droite : derrière lui, jamais entre nous et lui)
  const troughRest = V(S.halfW - tr.len / 2 - 0.25, 0, S.back + tr.r + 0.1);
  const baseX = stage.holder.position.x;
  const layout = (which) => {
    props.tap.group.visible = which === 'water';
    if (which !== 'feed') props.rack.setFill(which === 'water' ? 0.55 : 0.5);
    // (pour boire, il recule d'un pas : l'abreuvoir se pose devant l'auge du râtelier, sous sa bouche)
    const tx = S.halfW - rack.troughW - 0.05 - tr.r;
    stage.holder.position.x = baseX + (which === 'water' ? tx - eat.x : 0);
    stage.measure();
    if (which === 'water') {
      // (le rebord juste sous sa bouche tête baissée : il boit sans plier les genoux)
      const rimY = Math.max(tr.r + 0.06, eat.y + 0.02 * kp);
      const p = props.trough.group.position.set(tx, rimY, eat.z + tr.len * 0.05);
      props.trough.group.rotation.y = 0;
      props.trough.setFloor(-rimY + 0.04);
      // le robinet au mur, vers nous ; le tuyau descend le long du mur, passe dans la paille et remonte au bord de
      // l'abreuvoir, côté mur
      const s = props.tap.group.scale.x;
      const tap = props.tap.group.position.set(S.halfW, rimY + 0.38 * kp, p.z + tr.len * 0.62);
      const rim = V(tr.r * 0.92, 0.03, tr.len * 0.3).add(p);
      props.tap.hookUp(rim.clone().sub(tap).divideScalar(s), V(-1, 0, -0.1), (0.06 - tap.y) / s);
    } else {
      props.trough.group.position.set(troughRest.x, tr.r + 0.1, troughRest.z);
      props.trough.group.rotation.y = Math.PI / 2;
      props.trough.setFloor(-(tr.r + 0.1) + 0.04);
    }
  };
  layout('rest');
  props.trough.setLevel(0.7);

  // ---------------------------------------------------------------- lumière
  let shaft = null;
  let motes = null;
  if (out) outdoorLights(stage, g, { center: V(L.body.x + 0.2 * u, u * 0.6, 0), span: Math.max(3, S.halfW + 1.2) });
  else {
  const hemi = new THREE.HemisphereLight(0xfff0d6, 0x8b6a3c, high ? 0.7 : 0.82);
  g.add(hemi);
  // Lumière principale : par l'allée (le grand portail ouvert), haute et chaude, de notre côté.
  const key = new THREE.DirectionalLight(0xffe0b0, 2.3);
  const span = Math.max(3, S.halfW + 1.2);
  key.position.set(-1.8, 4.5 + u, 3.8);
  key.target.position.set(0.3, u * 0.6, -0.3);
  key.castShadow = true;
  const sm = high ? 2048 : 1024;
  key.shadow.mapSize.set(sm, sm);
  const cam = key.shadow.camera;
  cam.left = -span;
  cam.right = span;
  cam.top = span;
  cam.bottom = -2;
  cam.near = 0.5;
  cam.far = 14;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  g.add(key, key.target);
  // Soleil de la lucarne : le liseré du dos et de la laine (contre-jour doux).
  const sun = new THREE.DirectionalLight(0xffd29a, 1.3);
  sun.position.set(win.x - 0.5, win.y + 1.3, S.back - 2.5);
  sun.target.position.set(0.4, u * 0.5, 1);
  g.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xc9dcff, 0.32);
  fill.position.set(2.5, 1.5, 4);
  g.add(fill);
  shaft = sunShaft(keep, win, S);
  g.add(shaft);
  motes = dustMotes(keep, win, S, high ? 70 : 40);
  g.add(motes.points);
  }

  let env = stage.headless ? null : stage.track(() => roomEnvironment(stage.renderer, high));
  stage.scene.environment = env?.texture ?? null;
  stage.scene.environmentIntensity = out ? 0.5 : 0.4;
  stage.scene.background = new THREE.Color(out ? 0xbcd8ee : 0x2a1e14);
  stage.scene.fog = out ? new THREE.Fog(0xd9e6ee, 14, 36) : new THREE.Fog(0x2a1e14, 7, 17);

  /**
   * La plaque à son nom, la touche personnelle : coupée par le bord de l'image, cachée par un poteau, par l'animal ou
   * par une réglette du jeu (le haut de l'image : 🐢/🐇, le cœur, les cadrans), on la déplace le long du mur du fond,
   * au plus près de sa place, là où on la lit en entier. (Seulement caméra posée, et une fois par cadrage.)
   */
  const ray = new THREE.Raycaster();
  // (tout le décor qui peut passer devant : poteaux, barrière, poutres, râtelier… — pas la litière, ni les brins et les
  // poussières, ni la plaque elle-même)
  const blockers = [];
  const solid = (o) => {
    if (!o.isMesh || o.isInstancedMesh || plateG?.children.includes(o)) return false;
    // (ni le rai de soleil, ni ce qui est transparent ou découpé — les brins de foin —, ni la litière à plat)
    const mt = o.material;
    if (!mt || Array.isArray(mt) || mt.isShaderMaterial || mt.transparent || mt.depthWrite === false || mt.alphaTest > 0) return false;
    return !(o.geometry?.type === 'PlaneGeometry' && Math.abs(o.rotation.x + Math.PI / 2) < 0.01);
  };
  g.traverse((o) => solid(o) && blockers.push(o));
  /** Visible (lui et tous ses parents : un mur caché parce que la caméra est derrière ne cache rien). */
  const shown = (o) => {
    for (let p = o; p; p = p.parent) if (!p.visible) return false;
    return true;
  };
  /** Ce qui gêne la lecture de la plaque en (x, y) : 0 si on la lit en entier (plus c'est grand, moins on la lit). */
  const plateBad = (st, x, y, why = null) => {
    const v = st.view;
    if (!v) return 0;
    const top = v.y0 + 70;
    let bad = 0;
    for (const [dx, dy] of [[-0.3, -0.1], [0.3, -0.1], [-0.3, 0.1], [0.3, 0.1]]) {
      const q = st.project(V(x + dx, y + dy, S.back + 0.03));
      if (q.behind || q.x < v.x0 + 6 || q.x > v.x1 - 6 || q.y < top || q.y > v.y1 - 20) {
        bad += 2;
        why?.push(`coin ${dx},${dy} hors de l'image`);
      }
    }
    // (rien devant elle, d'un bout à l'autre : ni poteau, ni râtelier, ni l'animal — sept rayons, aux deux hauteurs du
    // texte : un poteau qui dépasse du mur en cache vite un bout)
    const cam = st.camera.position;
    const live = blockers.filter(shown);
    for (const p of Object.values(props)) p.group?.traverse((o) => solid(o) && shown(o) && live.push(o));
    for (const [dx, dy] of [[-0.28, 0.04], [-0.19, -0.04], [-0.09, 0.04], [0, -0.04], [0.09, 0.04], [0.19, -0.04], [0.28, 0.04]]) {
      const c = V(x + dx, y + dy, S.back + 0.03);
      const dir = c.clone().sub(cam);
      const d = dir.length();
      dir.normalize();
      ray.set(cam, dir);
      ray.far = d - 0.04;
      const hs = ray.intersectObjects(live, true);
      if (hs.length) {
        bad++;
        why?.push(`${dx},${dy} : ${hs[0].object.geometry?.type} ${hs[0].point.toArray().map((k) => k.toFixed(2))}`);
      } else {
        const h = st.proxy?.hit?.(new THREE.Ray(cam.clone(), dir), -9, 1e9);
        if (h && h.point.distanceTo(cam) < d - 0.04) {
          // (l'animal bouge : il compte moins qu'un poteau, voir fitPlate)
          bad += 0.3;
          why?.push(`${dx},${dy} : l'animal`);
        }
      }
    }
    return bad;
  };
  /** Près de sa tête, qui bouge (elle se tourne vers nous, vers la friandise) : à éviter si on peut (0 à 3). */
  const nearHead = (st, x, y) => {
    const hd = st.live?.('head');
    if (!hd) return 0;
    const hc = st.project(hd);
    const hr = st.projectRadius(hd, 0.34 * u);
    let n = 0;
    for (const dx of [-0.28, 0, 0.28]) {
      const q = st.project(V(x + dx, y, S.back + 0.03));
      if (Math.hypot(q.x - hc.x, q.y - hc.y) < hr) n++;
    }
    return n;
  };
  const lastCam = V(1e9, 0, 0);
  let lastKey = '';
  function fitPlate(st) {
    if (!walls.back.visible || out) return;
    // (une fois par cadrage : ni la caméra ni le cadre — la zone libre au-dessus d'une réglette — n'ont bougé depuis,
    // rien à refaire)
    const key = `${Math.round(st.viewY ?? 0)}|${st.size?.w}|${st.size?.h}|${st.view?.y0}`;
    if (st.camera.position.distanceToSquared(lastCam) < 1e-4 && key === lastKey) return;
    lastCam.copy(st.camera.position);
    lastKey = key;
    // (les places du monde à jour, même sans image rendue depuis : les rayons s'en servent)
    g.updateMatrixWorld(true);
    const bad0 = plateBad(st, plateG.position.x, plateG.position.y);
    const near0 = nearHead(st, plateG.position.x, plateG.position.y);
    if (bad0 === 0 && near0 === 0) return;
    // (la place la plus lisible, la plus proche de la sienne et loin de sa tête ; à défaut d'une place parfaite, la
    // moins gênée)
    const score = (bad, near, cost) => bad * 10 + near * 2 + cost;
    let best = { x: plateG.position.x, y: plateG.position.y, s: score(bad0, near0, 0) };
    for (let x = -S.halfW + 0.4; x <= S.halfW - 0.4; x += 0.1) {
      for (const y of [plateY, plateY + 0.3, plateY - 0.25, plateY + 0.6]) {
        if (y < 0.75 || y > S.eave - 0.15 || (Math.abs(y - win.y) < win.h / 2 + 0.12 && Math.abs(x - win.x) < win.w / 2 + 0.35)) continue;
        const cost = Math.abs(x - plateX) + Math.abs(y - plateY) * 1.5;
        if (cost >= best.s) continue;
        const sc2 = score(plateBad(st, x, y), nearHead(st, x, y), cost);
        if (sc2 < best.s) best = { x, y, s: sc2 };
      }
    }
    plateG.position.set(best.x, best.y, S.back);
  }

  return {
    group: g,
    props,
    kind,
    dims: S,
    win,
    walls,
    plate: plateMesh,
    /** Ce qui gêne la lecture de la plaque à sa place du moment (0 : on la lit en entier ; why : les raisons ; tests). */
    plateBad: (st, why = null) => {
      g.updateMatrixWorld(true);
      return out ? 0 : plateBad(st, plateG.position.x, plateG.position.y, why);
    },
    outdoor: out,
    sky: outside?.sky ?? null,
    ground: outside?.ground ?? [],
    spots: out ? outside.spots : barnSpots(S, win, kind),
    area: out ? { x0: -S.halfW - 3, x1: S.halfW - 0.3, z0: S.back + 0.2, z1: S.front + 1.5, y: 0 } : { x0: -S.halfW + 0.3, x1: S.halfW - 0.3, z0: S.back + 0.3, z1: S.front - 0.3, y: 0.06 },
    anchors: { eat },
    layout,
    restore(st) {
      if (st.headless) return;
      env?.dispose();
      env = st.track(() => roomEnvironment(st.renderer, high));
      st.scene.environment = env.texture;
    },
    update(dt, st) {
      // (un mur entre la caméra et l'animal : caché)
      const c = st.camera.position;
      walls.right.visible = c.x < S.halfW - 0.02;
      walls.left.visible = c.x > -S.halfW + 0.02;
      walls.back.visible = c.z > S.back + 0.02;
      walls.roof.visible = c.y < S.eave - 0.05;
      walls.front.visible = c.z < S.front - 0.02;
      // (la plaque à son nom : toujours lisible — refait seulement quand le cadrage a changé, et après avoir caché les
      // murs entre la caméra et l'animal, voir fitPlate)
      if (st.ready && st.settled?.(0.02)) fitPlate(st);
      motes?.update(dt);
      cowBrush?.spin(dt);
      if (shaft) shaft.material.uniforms.uTime.value += dt;
      for (const p of Object.values(props)) p.update?.(dt, st);
    },
    dispose() {
      for (const p of Object.values(props)) p.dispose?.();
      env?.dispose();
      keep.dispose();
      g.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
    },
  };
}

/**
 * Hauteur de la litière (m) en (x, z) du monde : épaisse et bosselée, relevée contre les murs. S : dims du décor. (Les
 * jeux qui posent des choses sur la litière s'en servent : la corvée de l'étable, barnClean3d.js.)
 */
/**
 * Les places des objets du jour dans la case (extras.js) : au sol le long du mur du fond et dans le coin avant
 * gauche ; sur l'appui de la lucarne et la lisse du haut de la barrière ; contre le mur du fond.
 */
function barnSpots(S, win, kind) {
  const spots = [];
  const lift = (x, z) => litterHeight(S, x, z) - 0.02;
  for (let x = -S.halfW + 1.2; x <= S.halfW - 0.5; x += 0.35) spots.push({ kind: 'floor', p: [x, lift(x, S.back + 0.35), S.back + 0.35] });
  for (let z = 0.6; z <= S.front - 0.4; z += 0.35) spots.push({ kind: 'floor', p: [-S.halfW + 0.35, lift(-S.halfW + 0.35, z), z] });
  for (const dx of [-0.2, 0, 0.2]) spots.push({ kind: 'perch', p: [win.x + dx, win.y - win.h / 2 - 0.1, S.back + 0.1], face: 0 });
  for (let x = -S.halfW + 1.4; x <= S.halfW - 0.6; x += 0.5) spots.push({ kind: 'lean', p: [x, lift(x, S.back + 0.08), S.back + 0.08] });
  return spots;
}

export function litterHeight(S, x, z) {
  const y = (S.back + S.front) / 2 - z;
  const edge = Math.max(0, 1 - Math.min(S.halfW - Math.abs(x), z - S.back) / 0.55);
  const h = 0.05 + 0.025 * Math.sin(x * 6.1 + y * 3.3) * Math.cos(y * 5.2 - x * 2.4) + 0.014 * Math.sin(x * 17 + y * 21) + 0.12 * edge * edge;
  const t = S.trod;
  if (!t) return h;
  // (tassée sous ses pas : 1 à 2 cm, avec un bord doux de 12 cm)
  const dxs = Math.max(t.x0 - x, x - t.x1, 0);
  const dzs = Math.max(t.z0 - z, z - t.z1, 0);
  const k = Math.max(0, 1 - Math.hypot(dxs, dzs) / 0.12);
  return h + (0.012 + 0.006 * Math.sin(x * 23 + z * 19) - h) * k * k * (3 - 2 * k);
}

/** Mur chaulé : des moellons irréguliers sous la chaux blanche, la chaux usée par endroits, des coulures en bas. */
export function limeWallTexture(seed = 4) {
  return canvasTex(512, 512, (c) => {
    const r = rng(seed);
    const S = 512;
    c.fillStyle = '#cfc5b3';
    c.fillRect(0, 0, S, S);
    // moellons : rangées irrégulières de pierres aux bords cassés (polygones bosselés), joints de mortier entre elles
    const stones = [];
    let y = -10;
    while (y < S + 10) {
      const h = 34 + r() * 30;
      let x = -r() * 40;
      while (x < S + 20) {
        const w = 44 + r() * 70;
        stones.push({ x: x + w / 2, y: y + h / 2, w: w / 2 - 3 - r() * 3, h: h / 2 - 3 - r() * 3, tone: r() });
        x += w;
      }
      y += h;
    }
    const shape = (st, grow = 0) => {
      c.beginPath();
      const n = 9;
      for (let k = 0; k <= n; k++) {
        const a = (k / n) * Math.PI * 2;
        const j = 0.86 + ((Math.sin(a * 3 + st.tone * 9) + Math.sin(a * 5 + st.tone * 4)) * 0.06);
        const px = st.x + Math.cos(a) * (st.w + grow) * j * (Math.abs(Math.cos(a)) > 0.5 ? 1.05 : 1);
        const py = st.y + Math.sin(a) * (st.h + grow) * j;
        if (k === 0) c.moveTo(px, py);
        else c.lineTo(px, py);
      }
      c.closePath();
    };
    for (const st of stones) {
      const t = st.tone;
      c.fillStyle = t < 0.4 ? '#bfb29a' : t < 0.75 ? '#c9bfae' : '#b8a68a';
      shape(st);
      c.fill();
      c.strokeStyle = 'rgba(90,75,55,0.35)';
      c.lineWidth = 2;
      c.stroke();
      // relief : un bord éclairé en haut, une ombre en bas
      c.strokeStyle = 'rgba(255,250,240,0.25)';
      c.lineWidth = 1.5;
      c.beginPath();
      c.moveTo(st.x - st.w * 0.7, st.y - st.h * 0.75);
      c.quadraticCurveTo(st.x, st.y - st.h * 0.95, st.x + st.w * 0.7, st.y - st.h * 0.7);
      c.stroke();
    }
    // la chaux : un voile blanc cassé qui couvre tout, plus mince sur le relief des pierres
    c.fillStyle = 'rgba(242,237,226,0.74)';
    c.fillRect(0, 0, S, S);
    for (const st of stones) {
      if (st.tone > 0.82) {
        // (chaux tombée : la pierre se voit un peu)
        c.fillStyle = 'rgba(175,155,125,0.32)';
        shape(st, -st.h * 0.35);
        c.fill();
      }
    }
    // coulures et salissures (plus en bas : la litière, les bêtes qui se frottent)
    for (let i = 0; i < 26; i++) {
      const x = r() * S;
      const len = 40 + r() * 160;
      const gr = c.createLinearGradient(0, S - len, 0, S);
      gr.addColorStop(0, 'rgba(120,100,70,0)');
      gr.addColorStop(1, `rgba(120,100,70,${0.08 + r() * 0.12})`);
      c.fillStyle = gr;
      c.fillRect(x, S - len, 3 + r() * 10, len);
    }
    const low = c.createLinearGradient(0, S * 0.7, 0, S);
    low.addColorStop(0, 'rgba(110,90,60,0)');
    low.addColorStop(1, 'rgba(110,90,60,0.16)');
    c.fillStyle = low;
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 9000; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(0,0,0,${r() * 0.05})` : `rgba(255,255,255,${r() * 0.07})`;
      c.fillRect(r() * S, r() * S, 1.5, 1.5);
    }
  }, { key: `lime2|${seed}` });
}

/** Environnement des reflets : une petite pièce chaude « photographiée » une fois. */
export function roomEnvironment(renderer, high) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  room.traverse((o) => {
    if (o.isMesh && o.material?.color) o.material.color.multiply(new THREE.Color(1.0, 0.86, 0.66));
  });
  const env = pmrem.fromScene(room, 0.04, 0.1, 100, { size: high ? 128 : 64 });
  room.traverse((o) => {
    o.geometry?.dispose?.();
    o.material?.dispose?.();
  });
  pmrem.dispose();
  return env;
}

/** Brins de paille posés sur la litière (un seul InstancedMesh, couleurs variées). */
function strawStrands(keep, n, S) {
  const geo = keep(new THREE.BoxGeometry(1, 0.004, 0.006));
  const mat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  const rnd = rng(13);
  const palette = [0xe6c66e, 0xd8b45a, 0xf0d88e, 0xc49a48, 0xe9cf86, 0xb88d40];
  for (let i = 0; i < n; i++) {
    const x = (rnd() * 2 - 1) * (S.halfW - 0.05);
    const z = S.back + 0.05 + rnd() * (S.front - S.back - 0.1);
    // (posés sur la litière, à plat ou presque : ils flottaient jusqu'à 6 cm au-dessus, et de près — un agneau, la
    // caméra basse — on aurait dit des planches en l'air)
    const y = litterHeight(S, x, z) + 0.003 + rnd() * 0.008;
    e.set((rnd() - 0.5) * 0.16, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.2);
    q.setFromEuler(e);
    const len = 0.08 + rnd() * 0.2;
    m4.compose(V(x, y, z), q, V(len, 0.8, 0.6 + 0.5 * rnd()));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.setHex(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.85 + rnd() * 0.3));
  }
  inst.receiveShadow = true;
  inst.castShadow = false;
  return inst;
}

/** Rai de soleil de la lucarne : boîte allongée, lumière additive qui s'efface sur les bords et vers le sol. */
function sunShaft(keep, win, S) {
  const len = 3.4;
  const geo = keep(new THREE.BoxGeometry(win.w * 0.95, win.h * 0.9, len, 1, 1, 1));
  geo.translate(0, 0, len / 2);
  const mat = keep(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */`
      varying vec3 vP;
      void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      varying vec3 vP;
      uniform float uTime;
      void main() {
        float along = clamp(vP.z / ${len.toFixed(2)}, 0.0, 1.0);
        float side = 1.0 - smoothstep(0.25, 0.5, abs(vP.x) / ${(win.w * 0.95).toFixed(2)});
        float vert = 1.0 - smoothstep(0.2, 0.5, abs(vP.y) / ${(win.h * 0.9).toFixed(2)});
        float flick = 0.9 + 0.1 * sin(uTime * 0.7 + vP.z * 2.0);
        float a = side * vert * (1.0 - along) * (0.2 + 0.8 * smoothstep(0.0, 0.15, along)) * 0.12 * flick;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a, 1.0);
      }`,
  }));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(win.x, win.y, S.back);
  m.lookAt(win.x + 0.8, 0.15, S.back + 2.3);
  m.renderOrder = 5;
  return m;
}

/** Poussières dans le rai de soleil. */
function dustMotes(keep, win, S, n) {
  const pos = new Float32Array(n * 3);
  const r = rng(23);
  const seeds = [];
  for (let i = 0; i < n; i++) seeds.push({ k: r(), a: r() * 6.28, rr: 0.1 + r() * 0.35, s: 0.2 + r() * 0.5, y: r() });
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = keep(canvasTex(32, 32, (x) => {
    const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 32, 32);
  }, { key: 'mote', repeat: false }));
  const mat = keep(new THREE.PointsMaterial({ size: 0.018, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff0c8, opacity: 0.8 }));
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let t = 0;
  const update = (dt) => {
    t += dt;
    for (let i = 0; i < n; i++) {
      const s = seeds[i];
      const k = (s.k + t * 0.01 * s.s) % 1;
      pos[i * 3] = win.x + 0.8 * k + Math.cos(s.a + t * s.s * 0.3) * s.rr;
      pos[i * 3 + 1] = win.y - (win.y - 0.3) * k + Math.sin(s.a * 2 + t * s.s * 0.4) * 0.12 + (s.y - 0.5) * 0.4;
      pos[i * 3 + 2] = S.back + 0.2 + 2.3 * k + Math.sin(s.a + t * 0.2) * 0.15;
    }
    geo.attributes.position.needsUpdate = true;
  };
  update(0);
  return { points, update };
}

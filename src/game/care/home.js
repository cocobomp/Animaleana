// Le coin de la maison, décor de la scène de soin du chien et du chat (src/game/care/petStage.js) : parquet de
// chêne, lambris peint en bas des murs et enduit crème au-dessus, une porte-fenêtre sur le jardin d'où entre le
// soleil (un rai de lumière, des poussières qui dansent, une tache de soleil sur le parquet), un voilage, une plante
// verte dans son pot en terre cuite, son panier (chien) ou son coussin et son arbre à chat (chat), un tapis tressé,
// un cadre au mur, la plaque à son nom, et ses gamelles à son nom. Lumière chaude et ombres douces.
//
// Tout est placé d'après la taille de l'animal (stage.marks) : un chihuahua a une petite gamelle et un petit panier,
// un bouvier bernois une grande ; la pièce, elle, a ses vraies dimensions.
//
// Repère : l'animal est au milieu, de profil, la tête vers +x ; on se tient du côté +z ; le mur du fond est vers -z,
// le mur de côté vers +x (le coin de la pièce derrière ses gamelles).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { canvasTex, rng } from './textures.js';
import { parquetTexture, plasterTexture, wainscotTexture, fabricTexture, braidedRugTexture, terracottaTexture, leafTexture, gardenTexture, sunPatchTexture, paw } from './petTextures.js';
import { petBowl, FOODS, shadowed } from './petProps.js';
import { avatarHand } from './props.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Couleurs des gamelles et du panier, selon l'espèce. */
const STYLE = {
  dog: { food: 0xc8503e, water: 0x3f74b8, bed: ['#6f8aa3', '#4f6a83', '#efe4cf'], cushion: ['#e8dcc4', '#d3c4a6', '#c9b48e'] },
  cat: { food: 0xd98a3a, water: 0x5a9a8a, bed: ['#b8838f', '#94606e', '#f2e6dc'], cushion: ['#efe2d6', '#ddc9b8', '#cbb39c'] },
};

/**
 * Le coin de la maison. stage : la scène (marks, double). Renvoie { group, props, layout, update, restore, dispose }.
 */
export function homeSet(stage) {
  const g = new THREE.Group();
  const own = [];
  const keep = (x) => {
    own.push(x);
    return x;
  };
  const high = stage.high;
  const sp = stage.species === 'cat' ? 'cat' : 'dog';
  const ST = STYLE[sp];
  // L'animal au milieu (son corps au-dessus de l'origine).
  stage.holder.position.x -= stage.marks.body.x;
  stage.holder.position.z -= stage.marks.body.z;
  stage.measure();
  const L = stage.marks;
  const H = Math.max(0.12, L.size.h); // hauteur de l'animal (oreilles comprises)
  const len = Math.max(0.15, L.size.len);
  // Pièce : le mur du fond derrière lui (plus loin pour un grand chien), le mur de côté au-delà de ses gamelles.
  const back = -(0.32 + 0.95 * H + 0.12 * len);
  const side = L.nose.x + 0.55 + 0.9 * H;
  const R = { back, side, roof: 2.6, left: -4 };

  // ---------------------------------------------------------------- matières
  const parquet = keep(parquetTexture());
  parquet.repeat.set(2.4, 2.4);
  const floorMat = keep(new THREE.MeshStandardMaterial({ map: parquet, roughness: 0.42, metalness: 0, color: 0xffffff }));
  floorMat.envMapIntensity = 0.7;
  const plaster = keep(plasterTexture('#efe1c6'));
  plaster.repeat.set(3, 2);
  const wallMat = keep(new THREE.MeshStandardMaterial({ map: plaster, roughness: 0.95 }));
  const wains = keep(wainscotTexture(sp === 'cat' ? '#a9b9c6' : '#9fb5a2'));
  const wainH = 0.82;
  const white = keep(new THREE.MeshStandardMaterial({ color: 0xf4efe6, roughness: 0.5 }));

  const walls = { back: new THREE.Group(), side: new THREE.Group() };
  g.add(walls.back, walls.side);
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

  // ---------------------------------------------------------------- sol
  const floor = mesh(new THREE.PlaneGeometry(10, 10), floorMat, [0, 0, 0], [-Math.PI / 2, 0, 0], false);
  floor.receiveShadow = true;

  // ---------------------------------------------------------------- murs : lambris, cimaise, enduit, plinthe
  const wallLen = 8;
  const W0 = R.left;
  const W1 = R.side;
  // la porte-fenêtre dans le mur du fond, derrière lui (un peu vers sa queue)
  const winW = 0.86;
  const winH = 2.05;
  const winX = Math.min(L.tail.x - 0.1, -0.25 - 0.3 * len) + 0.1;
  const wx0 = winX - winW / 2 - 0.06;
  const wx1 = winX + winW / 2 + 0.06;
  into = walls.back;
  const wainMat = keep(new THREE.MeshStandardMaterial({ map: wains, roughness: 0.6 }));
  const wallPiece = (x0, x1, y0, y1, mat, z = R.back, depth = 0.04, uvScale = null) => {
    if (x1 - x0 < 0.005 || y1 - y0 < 0.005) return null;
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, depth);
    if (uvScale) {
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0)) / uvScale[0], (y0 + uv.getY(i) * (y1 - y0)) / uvScale[1]);
    }
    return mesh(geo, mat, [(x0 + x1) / 2, (y0 + y1) / 2, z - depth / 2]);
  };
  // fond : de part et d'autre de la porte-fenêtre ; au-dessus d'elle
  for (const [a, b] of [[W0, wx0], [wx1, W1]]) {
    wallPiece(a, b, 0, wainH, wainMat, R.back + 0.012, 0.03, [0.42, wainH]);
    wallPiece(a, b, wainH, R.roof, wallMat, R.back, 0.04, [1.4, 1.4]);
    // cimaise et plinthe
    mesh(new THREE.BoxGeometry(b - a, 0.035, 0.03), white, [(a + b) / 2, wainH, R.back + 0.02]);
    mesh(new THREE.BoxGeometry(b - a, 0.09, 0.022), white, [(a + b) / 2, 0.045, R.back + 0.022]);
  }
  wallPiece(wx0, wx1, winH + 0.06, R.roof, wallMat, R.back, 0.04, [1.4, 1.4]);
  // la porte-fenêtre : encadrement blanc, croisillons, le jardin derrière (très lumineux)
  const garden = keep(gardenTexture());
  const glass = mesh(new THREE.PlaneGeometry(winW, winH), keep(new THREE.MeshBasicMaterial({ map: garden, color: 0xffffff, toneMapped: false })), [winX, winH / 2 + 0.03, R.back - 0.03], null, false);
  glass.material.color.setScalar(1.05);
  const fr = (w, h, x, y, d = 0.06) => mesh(new THREE.BoxGeometry(w, h, d), white, [x, y, R.back - 0.01]);
  fr(winW + 0.14, 0.07, winX, winH + 0.065);
  fr(0.07, winH + 0.06, winX - winW / 2 - 0.035, winH / 2 + 0.03);
  fr(0.07, winH + 0.06, winX + winW / 2 + 0.035, winH / 2 + 0.03);
  fr(0.05, winH, winX, winH / 2 + 0.03, 0.05); // (les deux battants)
  for (const k of [1 / 3, 2 / 3]) fr(winW, 0.025, winX, 0.03 + winH * k, 0.035);
  for (const s of [-1, 1]) fr(0.022, winH, winX + s * winW / 4, winH / 2 + 0.03, 0.03);
  fr(winW + 0.1, 0.03, winX, 0.03, 0.09); // seuil
  // poignées dorées
  const brass = keep(new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.3, metalness: 0.85 }));
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.012, 0.09, 0.02), brass, [winX + s * 0.04, 1.05, R.back + 0.03]);
  // voilage plissé, ouvert sur le côté droit de la porte-fenêtre
  const curtainGeo = new THREE.PlaneGeometry(0.42, winH + 0.15, 24, 1);
  const cp = curtainGeo.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const x = cp.getX(i);
    const y = cp.getY(i);
    cp.setZ(i, Math.sin(x * 48) * 0.025 + Math.sin(x * 17 + 1) * 0.01 + (0.5 - (y / (winH + 0.15) + 0.5)) * 0.02);
  }
  curtainGeo.computeVertexNormals();
  const curtain = mesh(curtainGeo, keep(new THREE.MeshStandardMaterial({ color: 0xfbf6ec, roughness: 0.9, transparent: true, opacity: 0.78, side: THREE.DoubleSide })), [wx1 + 0.12, (winH + 0.15) / 2, R.back + 0.09], null, false);
  curtain.castShadow = false;
  // tringle
  mesh(new THREE.CylinderGeometry(0.01, 0.01, winW + 0.9, 10), brass, [winX + 0.2, winH + 0.17, R.back + 0.09], [0, 0, Math.PI / 2]);

  // Mur de côté (le coin de la pièce, derrière ses gamelles).
  into = walls.side;
  {
    const z0 = R.back;
    const z1 = 2.2;
    const d = z1 - z0;
    const geoW = new THREE.BoxGeometry(0.04, wainH, d);
    const uv = geoW.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * d / 0.42, uv.getY(i));
    mesh(geoW, wainMat, [R.side + 0.02 - 0.012, wainH / 2, (z0 + z1) / 2]);
    const geoP = new THREE.BoxGeometry(0.04, R.roof - wainH, d);
    const uv2 = geoP.attributes.uv;
    for (let i = 0; i < uv2.count; i++) uv2.setXY(i, uv2.getX(i) * d / 1.4, uv2.getY(i) * (R.roof - wainH) / 1.4);
    mesh(geoP, wallMat, [R.side + 0.02, wainH + (R.roof - wainH) / 2, (z0 + z1) / 2]);
    mesh(new THREE.BoxGeometry(0.03, 0.035, d), white, [R.side - 0.02, wainH, (z0 + z1) / 2]);
    mesh(new THREE.BoxGeometry(0.022, 0.09, d), white, [R.side - 0.022, 0.045, (z0 + z1) / 2]);
  }
  into = g;

  // ---------------------------------------------------------------- le tapis tressé (sous lui)
  const rugR = Math.max(0.3, len * 0.7 + 0.1);
  const rug = mesh(new THREE.CircleGeometry(rugR, 48), keep(new THREE.MeshStandardMaterial({ map: keep(braidedRugTexture()), roughness: 1, color: 0xbdb2a0 })), [L.body.x - len * 0.15, 0.004, 0.02], [-Math.PI / 2, 0, 0], false);
  rug.scale.set(1.25, 0.9, 1);
  // (son épaisseur : un bord arrondi)
  const rugEdge = mesh(new THREE.TorusGeometry(rugR, 0.006, 4, 64), keep(new THREE.MeshStandardMaterial({ color: 0xb98f6c, roughness: 1 })), [L.body.x - len * 0.15, 0.004, 0.02], [Math.PI / 2, 0, 0], false);
  rugEdge.scale.set(1.25, 0.9, 1);

  // ---------------------------------------------------------------- son panier (chien) ou son coussin et son arbre (chat)
  const bedR = Math.max(0.16, len * 0.62);
  const bedX = winX - winW / 2 - bedR * 0.4;
  const bedZ = R.back + bedR * 1.05 + 0.04;
  const bed = new THREE.Group();
  bed.position.set(bedX, 0, bedZ);
  g.add(bed);
  {
    const fab = keep(fabricTexture(sp === 'cat' ? 'velvet' : 'plaid', ST.bed, sp === 'cat' ? 4 : 6));
    fab.repeat.set(4, 1);
    const fabMat = keep(new THREE.MeshStandardMaterial({ map: fab, roughness: 0.95 }));
    // bourrelet : un tore épais, plus haut au fond
    const tube = bedR * 0.26;
    const bol = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(bedR - tube * 0.6, tube, 14, 40)), fabMat));
    bol.rotation.x = Math.PI / 2;
    bol.position.y = tube * 0.85;
    bol.scale.set(1.12, 1, 1);
    bed.add(bol);
    const cushTex = keep(fabricTexture('knit', ST.cushion, 3));
    cushTex.repeat.set(3, 3);
    const cush = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(bedR - tube * 1.05, bedR - tube * 0.9, tube * 0.9, 32)), keep(new THREE.MeshStandardMaterial({ map: cushTex, roughness: 1 }))));
    cush.position.y = tube * 0.45;
    cush.scale.set(1.12, 1, 1);
    bed.add(cush);
    // un petit plaid replié sur le bord, et un jouet
    const plaid = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(bedR * 0.7, tube * 0.25, bedR * 0.45, 4, 1, 4)), keep(new THREE.MeshStandardMaterial({ map: keep(fabricTexture('plaid', ['#c8754a', '#a85a35', '#f3e2c4'], 9)), roughness: 1 }))));
    plaid.position.set(-bedR * 0.45, tube * 1.75, -bedR * 0.25);
    plaid.rotation.set(0.15, 0.6, 0.35);
    bed.add(plaid);
    if (sp === 'dog') {
      // une corde à nœuds
      const rope = keep(new THREE.MeshStandardMaterial({ color: 0x3f8ac8, roughness: 0.9 }));
      const knot = keep(new THREE.SphereGeometry(bedR * 0.07, 10, 8));
      for (const s of [-1, 1]) {
        const k = shadowed(new THREE.Mesh(knot, rope));
        k.position.set(bedR * 0.15 + s * bedR * 0.18, tube * 0.95, bedR * 0.15);
        bed.add(k);
      }
      const cord = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(bedR * 0.03, bedR * 0.03, bedR * 0.36, 8)), keep(new THREE.MeshStandardMaterial({ color: 0xf2e6cc, roughness: 0.9 }))));
      cord.rotation.z = Math.PI / 2;
      cord.position.set(bedR * 0.15, tube * 0.95, bedR * 0.15);
      bed.add(cord);
    } else {
      // une petite souris en feutrine
      const felt = keep(new THREE.MeshStandardMaterial({ color: 0x9a9aa2, roughness: 1 }));
      const mouse = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(0.02, 12, 8)), felt));
      mouse.scale.set(1.5, 0.8, 0.9);
      mouse.position.set(bedR * 0.2, tube * 0.95, bedR * 0.25);
      bed.add(mouse);
    }
  }
  // Chat : un arbre à chat à côté de son coussin (poteau en corde de sisal, plateformes moquettées).
  if (sp === 'cat') {
    const tree = new THREE.Group();
    tree.position.set(bedX + bedR + 0.32, 0, R.back + 0.3);
    g.add(tree);
    const sisal = keep(canvasTex(64, 128, (c) => {
      const r = rng(3);
      c.fillStyle = '#c8a874';
      c.fillRect(0, 0, 64, 128);
      for (let y = 0; y < 128; y += 4) {
        c.fillStyle = `rgba(110,80,40,${0.35 + r() * 0.2})`;
        c.fillRect(0, y, 64, 1.5);
        c.fillStyle = `rgba(255,240,200,${0.15 + r() * 0.1})`;
        c.fillRect(0, y + 2, 64, 1);
      }
    }, { key: 'sisal' }));
    sisal.repeat.set(2, 6);
    const carpet = keep(new THREE.MeshStandardMaterial({ map: keep(fabricTexture('velvet', ['#d9cbb8', '#c8b8a2', '#ffffff'], 12)), roughness: 1 }));
    const base = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.45, 0.05, 0.4)), carpet));
    base.position.y = 0.025;
    tree.add(base);
    const post = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.055, 0.055, 0.9, 16)), keep(new THREE.MeshStandardMaterial({ map: sisal, roughness: 1 }))));
    post.position.y = 0.5;
    tree.add(post);
    for (const [y, x, w] of [[0.48, 0.08, 0.32], [0.95, -0.04, 0.38]]) {
      const plat = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(w / 2, w / 2, 0.035, 24)), carpet));
      plat.position.set(x, y, 0);
      tree.add(plat);
    }
    // une petite balle pompon qui pend
    const pomp = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(0.025, 10, 8)), keep(new THREE.MeshStandardMaterial({ color: 0xe86a8a, roughness: 1 }))));
    pomp.position.set(0.17, 0.32, 0.02);
    tree.add(pomp);
    const thread = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.002, 0.002, 0.15, 4)), keep(new THREE.MeshStandardMaterial({ color: 0xffffff }))), false);
    thread.position.set(0.17, 0.4, 0.02);
    tree.add(thread);
  }

  // ---------------------------------------------------------------- la plante verte (dans le coin)
  const plant = new THREE.Group();
  plant.position.set(R.side - 0.32, 0, R.back + 0.3);
  g.add(plant);
  {
    const potPts = [[0.0, 0], [0.12, 0], [0.14, 0.02], [0.17, 0.3], [0.19, 0.32], [0.19, 0.36], [0.165, 0.36], [0.16, 0.33]].map(([x, y]) => new THREE.Vector2(x, y));
    const pot = shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry(potPts, 32)), keep(new THREE.MeshStandardMaterial({ map: keep(terracottaTexture()), roughness: 0.9 }))));
    plant.add(pot);
    const soil = shadowed(new THREE.Mesh(keep(new THREE.CircleGeometry(0.16, 24)), keep(new THREE.MeshStandardMaterial({ color: 0x3a2a1c, roughness: 1 }))), false);
    soil.rotation.x = -Math.PI / 2;
    soil.position.y = 0.33;
    plant.add(soil);
    const leafMat = keep(new THREE.MeshStandardMaterial({ map: keep(leafTexture('monstera')), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.55 }));
    const stemMat = keep(new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.7 }));
    const r = rng(5);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + r() * 0.5;
      const lean = 0.35 + r() * 0.5;
      const hgt = 0.45 + r() * 0.55;
      const size = 0.32 + r() * 0.16;
      const tip = v3(Math.cos(a) * Math.sin(lean) * hgt, 0.33 + Math.cos(lean) * hgt, Math.sin(a) * Math.sin(lean) * hgt);
      const stem = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.006, 0.009, 1, 6)), stemMat));
      const mid = tip.clone().add(v3(0, 0.33, 0)).multiplyScalar(0.5);
      stem.position.copy(mid);
      stem.scale.y = tip.distanceTo(v3(0, 0.33, 0));
      stem.quaternion.setFromUnitVectors(v3(0, 1, 0), tip.clone().sub(v3(0, 0.33, 0)).normalize());
      plant.add(stem);
      // la feuille, un peu pliée le long de sa nervure
      const lg = new THREE.PlaneGeometry(size, size, 6, 6);
      const lp = lg.attributes.position;
      for (let k = 0; k < lp.count; k++) {
        const x = lp.getX(k);
        const y = lp.getY(k);
        lp.setZ(k, Math.abs(x) * 0.35 - (y / size + 0.5) ** 2 * size * 0.25);
      }
      lg.translate(0, size / 2, 0);
      lg.computeVertexNormals();
      const leaf = shadowed(new THREE.Mesh(keep(lg), leafMat));
      leaf.position.copy(tip);
      leaf.lookAt(tip.clone().add(v3(Math.cos(a), 0.6 + r() * 0.5, Math.sin(a))));
      leaf.rotateX(-Math.PI / 2 + 0.5);
      plant.add(leaf);
    }
  }

  // ---------------------------------------------------------------- au mur : un cadre et la plaque à son nom
  into = walls.back;
  const frameX = wx1 + 0.75;
  const art = keep(canvasTex(256, 192, (c) => {
    // une aquarelle : collines, soleil, un petit arbre
    const sky = c.createLinearGradient(0, 0, 0, 192);
    sky.addColorStop(0, '#cfe4ef');
    sky.addColorStop(1, '#fbeedc');
    c.fillStyle = sky;
    c.fillRect(0, 0, 256, 192);
    c.fillStyle = 'rgba(245,190,110,0.8)';
    c.beginPath();
    c.arc(190, 60, 22, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#9cc28a';
    c.beginPath();
    c.moveTo(0, 140);
    c.quadraticCurveTo(80, 90, 160, 130);
    c.quadraticCurveTo(210, 150, 256, 120);
    c.lineTo(256, 192);
    c.lineTo(0, 192);
    c.fill();
    c.fillStyle = '#7aa86c';
    c.beginPath();
    c.moveTo(0, 165);
    c.quadraticCurveTo(120, 130, 256, 170);
    c.lineTo(256, 192);
    c.lineTo(0, 192);
    c.fill();
    c.fillStyle = '#5a7a4a';
    c.beginPath();
    c.arc(70, 112, 16, 0, Math.PI * 2);
    c.fill();
    c.fillRect(68, 115, 4, 20);
  }, { key: 'watercolor', repeat: false }));
  const fw = 0.44;
  const fh = 0.33;
  mesh(new THREE.BoxGeometry(fw + 0.05, fh + 0.05, 0.025), keep(new THREE.MeshStandardMaterial({ color: 0x8a5a32, roughness: 0.5 })), [frameX, 1.45, R.back + 0.012]);
  mesh(new THREE.PlaneGeometry(fw - 0.03, fh - 0.03), keep(new THREE.MeshStandardMaterial({ map: art, roughness: 0.8 })), [frameX, 1.45, R.back + 0.026], null, false);
  // la plaque à son nom, au-dessus de son panier, accrochée par une cordelette
  const plateTex = keep(namePlateTexture(stage.a?.name ?? ''));
  const plateY = Math.max(0.55, Math.min(1.25, bedR * 2.2 + 0.35));
  const plateMesh = mesh(new THREE.BoxGeometry(0.4, 0.13, 0.015), keep(new THREE.MeshStandardMaterial({ map: plateTex, roughness: 0.6 })), [bedX, plateY, R.back + 0.02]);
  const twine = keep(new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 1 }));
  for (const s of [-1, 1]) {
    const c = mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.16, 4), twine, [bedX + s * 0.08, plateY + 0.11, R.back + 0.02], [0, 0, s * 0.85], false);
    c.castShadow = false;
  }
  mesh(new THREE.SphereGeometry(0.008, 8, 6), brass, [bedX, plateY + 0.17, R.back + 0.02], null, false);
  into = g;

  // ---------------------------------------------------------------- ses gamelles (à son nom), sur un petit set
  const props = {};
  const scale = stage.double.scale;
  // gamelle à la taille de sa tête (un chihuahua : 6 cm de rayon ; un saint-bernard : 14 cm)
  const bowlR = Math.max(0.045, Math.min(0.15, L.size.headLen * 0.62 + 0.014));
  const food = FOODS[sp];
  props.food = petBowl({ r: bowlR, color: ST.food, name: stage.a?.name ?? '', content: 'food', food, high });
  props.water = petBowl({ r: bowlR, color: ST.water, name: stage.a?.name ?? '', content: 'water', high });
  for (const b of [props.food, props.water]) g.add(b.group);
  const mat = shadowed(new THREE.Mesh(keep(roundedPlate(bowlR * 4.6, bowlR * 2.4, bowlR * 0.4)), keep(new THREE.MeshStandardMaterial({ color: sp === 'cat' ? 0x6d8f86 : 0x4f6a7a, roughness: 0.75 }))), false);
  g.add(mat);
  // Où va sa bouche quand il mange : la gamelle se pose là (mesuré sur son animation : un teckel ou un dogue).
  const eat = stage.eatMuzzle('eat');
  const drink = stage.eatMuzzle('drink');
  const bowlDepth = props.food.dims.depth;
  const feedAt = v3(Math.max(eat.x, L.nose.x - bowlR * 0.2), bowlDepth, eat.z);
  const drinkAt = v3(Math.max(drink.x, L.nose.x - bowlR * 0.2), bowlDepth, drink.z);
  // au repos : rangées sur leur set, contre le mur, devant lui
  const restAt = (k) => v3(L.nose.x + bowlR * (1.6 + k * 2.3), bowlDepth, R.back + bowlR * 1.6 + 0.04);
  const hand = avatarHand(stage.game?.profile);
  props.hand = hand;
  /**
   * Où sont les gamelles selon le soin : 'feed' (la gamelle de croquettes sous sa bouche), 'water' (celle d'eau),
   * 'rest' (rangées sur leur set, contre le mur).
   */
  const layout = (which) => {
    const f = which === 'feed' ? feedAt : restAt(0);
    const w = which === 'water' ? drinkAt : which === 'feed' ? v3(feedAt.x + bowlR * 2.4, bowlDepth, feedAt.z - bowlR * 1.2) : restAt(1);
    props.food.group.position.copy(f);
    props.water.group.position.copy(w);
    if (which === 'water') props.food.group.position.set(drinkAt.x + bowlR * 2.4, bowlDepth, drinkAt.z - bowlR * 1.2);
    const a = props.food.group.position;
    const b = props.water.group.position;
    mat.position.set((a.x + b.x) / 2, 0.003, (a.z + b.z) / 2);
    mat.rotation.set(-Math.PI / 2, 0, -Math.atan2(b.z - a.z, b.x - a.x));
    mat.visible = which === 'rest';
  };
  layout('rest');

  // ---------------------------------------------------------------- lumière
  const hemi = new THREE.HemisphereLight(0xfff1dc, 0x8a6a4c, high ? 0.7 : 0.8);
  g.add(hemi);
  // Lumière principale : douce et chaude, de notre côté (une fenêtre derrière nous) ; elle dessine le flanc.
  const key = new THREE.DirectionalLight(0xffe6c4, 1.75);
  const span = Math.max(1.2, len * 2 + 0.9);
  key.position.set(L.body.x - 1.6 * span, 2.6 * span + 1, 2.4 * span);
  key.target.position.set(L.body.x, H * 0.4, 0);
  key.castShadow = true;
  const sm = high ? 2048 : 1024;
  key.shadow.mapSize.set(sm, sm);
  const cam = key.shadow.camera;
  cam.left = -span * 1.3;
  cam.right = span * 1.3;
  cam.top = span * 1.2;
  cam.bottom = -span * 0.8;
  cam.near = 0.1;
  cam.far = span * 10 + 4;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.015;
  key.shadow.radius = 5;
  g.add(key, key.target);
  // Le soleil de la porte-fenêtre : contre-jour doux qui dessine le liseré du dos et des oreilles.
  const sun = new THREE.DirectionalLight(0xffd6a0, 1.5);
  sun.position.set(winX - 0.6, 2.4, R.back - 2.2);
  sun.target.position.set(L.body.x + 0.3, H * 0.5, 0.4);
  g.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.35);
  fill.position.set(R.side + 2, 1.4, 3);
  g.add(fill);
  // tache de soleil sur le parquet, rai de lumière et poussières
  const patch = mesh(new THREE.PlaneGeometry(1, 1), keep(new THREE.MeshBasicMaterial({ map: keep(sunPatchTexture(2, 3)), color: 0xffd9a0, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false })), [winX + 0.35, 0.006, R.back + 0.75], [-Math.PI / 2, 0, -0.35], false);
  patch.scale.set(winW * 0.95, 1.25, 1);
  patch.renderOrder = 1;
  const shaft = sunShaft(keep, winX, winW, winH, R.back);
  g.add(shaft);
  const motes = dustMotes(keep, winX, winW, winH, R.back, high ? 60 : 36);
  g.add(motes.points);

  // Environnement (reflets doux du poil, des gamelles, du parquet) : une pièce chaude « photographiée » une fois.
  let env = stage.headless ? null : stage.track(() => roomEnvironment(stage.renderer, high));
  stage.scene.environment = env?.texture ?? null;
  stage.scene.environmentIntensity = 0.45;
  stage.scene.background = new THREE.Color(0x3a2a1c);
  stage.scene.fog = new THREE.Fog(0x3a2a1c, 6, 14);

  return {
    group: g,
    props,
    walls,
    plate: plateMesh,
    room: R,
    bed,
    anchors: { eat, drink },
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
      walls.back.visible = c.z > R.back + 0.02;
      walls.side.visible = c.x < R.side - 0.02;
      motes.update(dt);
      shaft.material.uniforms.uTime.value += dt;
      for (const p of Object.values(props)) p.update?.(dt, st);
    },
    dispose() {
      for (const p of Object.values(props)) p.dispose?.();
      env?.dispose();
      for (const x of own) x.dispose?.();
      g.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
    },
  };
}

/** Plaque en bois peint à son nom, une patte de chaque côté. */
export function namePlateTexture(name) {
  return canvasTex(256, 84, (c) => {
    const r = rng(17);
    c.fillStyle = '#e9d3a8';
    c.fillRect(0, 0, 256, 84);
    for (let i = 0; i < 26; i++) {
      c.strokeStyle = `rgba(140,95,50,${0.08 + r() * 0.1})`;
      c.lineWidth = 1;
      c.beginPath();
      const y = r() * 84;
      c.moveTo(0, y);
      c.bezierCurveTo(80, y + (r() - 0.5) * 8, 170, y + (r() - 0.5) * 8, 256, y);
      c.stroke();
    }
    c.strokeStyle = '#8a5a32';
    c.lineWidth = 5;
    c.strokeRect(4, 4, 248, 76);
    c.fillStyle = '#5a3a20';
    c.font = 'bold 40px "Trebuchet MS", system-ui, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(String(name || '').slice(0, 11), 128, 44);
    paw(c, 22, 44, 9, '#a8743c');
    paw(c, 234, 44, 9, '#a8743c');
  }, { key: `nameplate|${name}`, repeat: false });
}

/** Petit set de table en caoutchouc aux coins arrondis (à plat, dans le plan xy). */
function roundedPlate(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + r, -h / 2);
  s.lineTo(w / 2 - r, -h / 2);
  s.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  s.lineTo(w / 2, h / 2 - r);
  s.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  s.lineTo(-w / 2 + r, h / 2);
  s.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  s.lineTo(-w / 2, -h / 2 + r);
  s.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return new THREE.ExtrudeGeometry(s, { depth: 0.004, bevelEnabled: false, curveSegments: 6 });
}

/** Environnement des reflets : une pièce chaude « photographiée » une fois (PMREM). */
export function roomEnvironment(renderer, high, tint = new THREE.Color(1.0, 0.88, 0.72)) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  room.traverse((o) => {
    if (o.isMesh && o.material?.color) o.material.color.multiply(tint);
  });
  const env = pmrem.fromScene(room, 0.04, 0.1, 100, { size: high ? 128 : 64 });
  room.traverse((o) => {
    o.geometry?.dispose?.();
    o.material?.dispose?.();
  });
  pmrem.dispose();
  return env;
}

/** Rai de soleil : boîte allongée, lumière additive qui s'efface sur les bords et vers le sol. */
function sunShaft(keep, winX, winW, winH, back) {
  const len = 2.6;
  const geo = keep(new THREE.BoxGeometry(winW * 0.9, winH * 0.75, len, 1, 1, 1));
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
        float side = 1.0 - smoothstep(0.25, 0.5, abs(vP.x) / ${(winW * 0.9).toFixed(2)});
        float vert = 1.0 - smoothstep(0.2, 0.5, abs(vP.y) / ${(winH * 0.75).toFixed(2)});
        float flick = 0.9 + 0.1 * sin(uTime * 0.6 + vP.z * 2.0);
        float a = side * vert * (1.0 - along) * (0.2 + 0.8 * smoothstep(0.0, 0.15, along)) * 0.09 * flick;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.62) * a, 1.0);
      }`,
  }));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(winX, winH * 0.62, back);
  m.lookAt(winX + 0.7, 0.05, back + 1.9);
  m.renderOrder = 5;
  return m;
}

/** Poussières dans le rai de soleil. */
function dustMotes(keep, winX, winW, winH, back, n) {
  const pos = new Float32Array(n * 3);
  const r = rng(13);
  const seeds = [];
  for (let i = 0; i < n; i++) seeds.push({ k: r(), a: r() * 6.28, r: 0.08 + r() * 0.3, s: 0.2 + r() * 0.5, y: r() });
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = keep(canvasTex(32, 32, (c) => {
    const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 32, 32);
  }, { key: 'mote', repeat: false }));
  const mat = keep(new THREE.PointsMaterial({ size: 0.012, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff0c8, opacity: 0.75 }));
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let t = 0;
  const update = (dt) => {
    t += dt;
    for (let i = 0; i < n; i++) {
      const s = seeds[i];
      const k = (s.k + t * 0.012 * s.s) % 1;
      pos[i * 3] = winX + 0.6 * k + Math.cos(s.a + t * s.s * 0.3) * s.r;
      pos[i * 3 + 1] = winH * 0.85 - (winH * 0.7) * k + Math.sin(s.a * 2 + t * s.s * 0.4) * 0.1 + (s.y - 0.5) * 0.3;
      pos[i * 3 + 2] = back + 0.15 + 1.6 * k + Math.sin(s.a + t * 0.2) * 0.1;
    }
    geo.attributes.position.needsUpdate = true;
  };
  update(0);
  return { points, update };
}

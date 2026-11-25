// Le clapier, décor de la scène de soin du lapin (src/game/care/petStage.js) : un enclos au jardin, au pied de son
// clapier en bois (planches, toit de bardeaux, la plaque à son nom), une litière de paille et de foin, sa
// maisonnette à porte ronde, le râtelier plein de foin, le biberon accroché au grillage, quelques fanes de carotte
// et feuilles de pissenlit, ses gamelles en grès à son nom ; derrière le grillage, la pelouse et les massifs.
// Lumière de jardin : ciel clair, soleil doux de notre côté.
//
// Tout est placé d'après la taille du lapin (stage.marks) : un nain a une petite gamelle, un géant des Flandres une
// grande ; le clapier, lui, a ses vraies dimensions.
//
// Repère : le lapin est au milieu, de profil, la tête vers +x ; on se tient du côté +z ; le clapier est au fond
// (vers -z), le grillage de côté vers +x.

import * as THREE from 'three';
import { canvasTex, rng, strawFloorTexture, hayTexture, woodTexture, noiseTexture } from './textures.js';
import { wireMeshTexture, gardenTexture } from './petTextures.js';
import { petBowl, FOODS, shadowed } from './petProps.js';
import { avatarHand } from './props.js';
import { roomEnvironment, namePlateTexture, travelCrate } from './home.js';
import { grassField, skySphere } from './outdoor.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Le clapier et son enclos. stage : la scène. Renvoie { group, props, layout, update, restore, dispose }.
 * opts.grass : dans son enclos dehors, sur l'herbe (pas la litière de paille du clapier) ; opts.season : la saison.
 * opts.travel (sur l'herbe, en voyage) : ni le clapier de la ferme ni sa plaque, ni le jardin de la maison — un enclos
 * grillagé bas derrière lui, sa caisse de transport, et loin derrière, le fond du lieu du voyage (away.js).
 */
export function hutchSet(stage, opts = {}) {
  const travel = !!opts.grass && !!opts.travel;
  const g = new THREE.Group();
  const own = [];
  const keep = (x) => {
    own.push(x);
    return x;
  };
  const high = stage.high;
  stage.holder.position.x -= stage.marks.body.x;
  stage.holder.position.z -= stage.marks.body.z;
  stage.measure();
  const L = stage.marks;
  const H = Math.max(0.08, L.size.h);
  const len = Math.max(0.12, L.size.len);
  const back = -(0.22 + 1.1 * H + 0.15 * len);
  const side = L.nose.x + 0.8 + 1.5 * H;
  const R = { back, side, left: -3 };
  const mesh = (geo, mat, pos, rot = null, shadow = true, into = g) => {
    const m = new THREE.Mesh(keep(geo), mat);
    m.position.set(...pos);
    if (rot) m.rotation.set(...rot);
    m.castShadow = shadow;
    m.receiveShadow = true;
    into.add(m);
    return m;
  };

  // ---------------------------------------------------------------- sol : pelouse dehors, paille dans l'enclos
  const grass = keep(canvasTex(256, 256, (c) => {
    const r = rng(4);
    c.fillStyle = '#7fa65a';
    c.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) {
      c.strokeStyle = `rgba(${60 + r() * 70},${110 + r() * 70},${40 + r() * 40},${0.5 + r() * 0.5})`;
      c.lineWidth = 1;
      const x = r() * 256;
      const y = r() * 256;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + (r() - 0.5) * 4, y - 3 - r() * 6);
      c.stroke();
    }
  }, { key: 'lawn' }));
  grass.repeat.set(10, 10);
  mesh(new THREE.PlaneGeometry(14, 14), keep(new THREE.MeshStandardMaterial({ map: grass, roughness: 1 })), [0, -0.002, 0], [-Math.PI / 2, 0, 0], false);
  const straw = keep(strawFloorTexture());
  straw.repeat.set(2.5, 2.5);
  const bedW = R.side - R.left;
  const bedD = 2.2 - R.back;
  const bed = new THREE.PlaneGeometry(bedW, bedD, 48, 30);
  const bp = bed.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const y = bp.getY(i);
    bp.setZ(i, 0.012 + 0.008 * Math.sin(x * 9.1 + y * 4.3) * Math.cos(y * 7.7 - x * 2.1) + 0.004 * Math.sin(x * 31 + y * 27));
  }
  bed.computeVertexNormals();
  let field = null;
  if (opts.grass) {
    // dans son enclos : l'herbe courte (il la broute), quelques fleurs
    // (en voyage, le sol va jusqu'au fond du lieu, loin derrière)
    field = grassField(keep, { x0: R.left - 1, x1: R.side + 1, z0: R.back - 1, z1: 2.4, season: opts.season ?? 'summer', high, flowers: 30, size: travel ? 60 : 16, keepOut: { x0: L.tail.x - 0.1, x1: L.nose.x + 0.3, z0: -0.25, z1: 0.25 } });
    g.add(field.group);
    bed.dispose();
  } else {
  mesh(bed, keep(new THREE.MeshStandardMaterial({ map: straw, roughness: 1, color: 0xf4e6c0 })), [(R.side + R.left) / 2, 0, (R.back + 2.2) / 2], [-Math.PI / 2, 0, 0], false);
  g.add(strands(keep, high ? 1400 : 900, R, H));
  }
  const sky = skySphere(keep);
  g.add(sky);

  // ---------------------------------------------------------------- le clapier au fond : planches, toit, plaque
  // (en voyage : construit, jamais montré — le clapier est resté à la ferme)
  const hutch = new THREE.Group();
  if (!travel) g.add(hutch);
  const plank = keep(woodTexture({ base: '#c49a66', dark: '#7a5432', vertical: false, seed: 21, boards: 7 }));
  plank.repeat.set(2, 1);
  const plankMat = keep(new THREE.MeshStandardMaterial({ map: plank, roughness: 0.85 }));
  const postMat = keep(new THREE.MeshStandardMaterial({ map: keep(woodTexture({ base: '#8a6440', dark: '#4a321c', vertical: true, seed: 22, boards: 2 })), roughness: 0.9 }));
  const hW = 3.2;
  const hH = 1.05;
  const hx = (R.side + R.left) / 2 + 0.5;
  mesh(new THREE.BoxGeometry(hW, hH, 0.05), plankMat, [hx, hH / 2, R.back - 0.025], null, true, hutch);
  for (const x of [hx - hW / 2, hx - hW / 6, hx + hW / 6, hx + hW / 2]) mesh(new THREE.BoxGeometry(0.07, hH + 0.05, 0.07), postMat, [x, (hH + 0.05) / 2, R.back + 0.01], null, true, hutch);
  mesh(new THREE.BoxGeometry(hW + 0.1, 0.06, 0.08), postMat, [hx, hH, R.back + 0.01], null, true, hutch);
  // toit de bardeaux vert sauge (comme les clapiers du jeu), un peu de débord
  const shingle = keep(canvasTex(256, 128, (c) => {
    const r = rng(9);
    c.fillStyle = '#5f7350';
    c.fillRect(0, 0, 256, 128);
    for (let row = 0; row < 8; row++) {
      for (let col = 0; col < 9; col++) {
        const x = col * 32 - (row % 2) * 16;
        const y = row * 16;
        c.fillStyle = `rgb(${80 + r() * 20},${100 + r() * 20},${68 + r() * 15})`;
        c.fillRect(x + 1, y + 1, 30, 14);
        c.fillStyle = 'rgba(0,0,0,0.25)';
        c.fillRect(x, y + 14, 32, 2);
      }
    }
  }, { key: 'shingle' }));
  shingle.repeat.set(3, 1);
  mesh(new THREE.BoxGeometry(hW + 0.3, 0.05, 0.7), keep(new THREE.MeshStandardMaterial({ map: shingle, roughness: 0.8 })), [hx, hH + 0.12, R.back + 0.12], [0.32, 0, 0], true, hutch);
  // une porte grillagée du clapier (fermée), à gauche
  const meshTex = keep(wireMeshTexture());
  meshTex.repeat.set(8, 6);
  const wireMat = keep(new THREE.MeshStandardMaterial({ map: meshTex, alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
  const doorX = hx - hW / 3;
  mesh(new THREE.PlaneGeometry(0.85, 0.6), wireMat, [doorX, 0.62, R.back + 0.035], null, false, hutch);
  mesh(new THREE.PlaneGeometry(0.85, 0.6), keep(new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 })), [doorX, 0.62, R.back + 0.012], null, false, hutch);
  for (const [w, h, x, y] of [[0.95, 0.05, doorX, 0.94], [0.95, 0.05, doorX, 0.3], [0.05, 0.66, doorX - 0.45, 0.62], [0.05, 0.66, doorX + 0.45, 0.62]]) mesh(new THREE.BoxGeometry(w, h, 0.04), postMat, [x, y, R.back + 0.04], null, true, hutch);
  // la plaque à son nom
  const plate = mesh(new THREE.BoxGeometry(0.36, 0.12, 0.015), keep(new THREE.MeshStandardMaterial({ map: keep(namePlateTexture(stage.a?.name ?? '')), roughness: 0.6 })), [hx + hW / 6 - 0.45, 0.82, R.back + 0.012], null, true, hutch);

  // ---------------------------------------------------------------- le râtelier plein de foin, au mur du clapier
  const rack = new THREE.Group();
  rack.position.set(hx + hW / 6 + 0.35, Math.max(0.22, H * 1.15), R.back + 0.02);
  g.add(rack);
  const hay = keep(hayTexture(7));
  const hayMat = keep(new THREE.MeshStandardMaterial({ map: hay, roughness: 1, color: 0xe8e0b0 }));
  {
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0x9aa2a8, metalness: 0.7, roughness: 0.35 }));
    const rw = 0.42;
    const rh = 0.26;
    // le foin dedans, qui déborde
    const pile = shadowed(new THREE.Mesh(keep(lumpy(new THREE.BoxGeometry(rw * 0.95, rh * 0.95, 0.12, 8, 6, 3), 0.02)), hayMat));
    pile.position.set(0, rh / 2, 0.06);
    rack.add(pile);
    for (let i = 0; i <= 8; i++) {
      const bar = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.004, 0.004, rh, 6)), metal));
      bar.position.set(-rw / 2 + (i / 8) * rw, rh / 2, 0.14 - 0.06 * (i % 2));
      bar.rotation.x = -0.25;
      rack.add(bar);
    }
    for (const y of [0, rh]) {
      const rail = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.005, 0.005, rw, 6)), metal));
      rail.rotation.z = Math.PI / 2;
      rail.position.set(0, y, y ? 0.1 : 0.15);
      rack.add(rail);
    }
    // brins qui pendent
    const hs = keep(new THREE.MeshStandardMaterial({ map: hay, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 1, transparent: false }));
    const r = rng(3);
    for (let i = 0; i < 10; i++) {
      const s = shadowed(new THREE.Mesh(keep(new THREE.PlaneGeometry(0.012, 0.1 + r() * 0.08)), hs), false);
      s.position.set((r() - 0.5) * rw * 0.9, -0.02 - r() * 0.03, 0.15);
      s.rotation.set(0.3, r() * 2, (r() - 0.5) * 0.6);
      rack.add(s);
    }
  }

  // ---------------------------------------------------------------- sa maisonnette (à gauche, derrière lui)
  const house = new THREE.Group();
  const hs = Math.max(0.55, Math.min(1.6, H / 0.26));
  house.scale.setScalar(hs);
  house.position.set(Math.min(L.tail.x - 0.12, -len * 0.7) - 0.22 * hs, 0, R.back + 0.3 * hs + 0.05);
  house.rotation.y = 0.35;
  // (en voyage : sa caisse de transport à la place de sa maisonnette)
  if (travel) {
    const crate = travelCrate(keep, Math.max(0.4, Math.min(0.85, len * 1.3 + 0.1)), 0x6a9a4a);
    crate.position.set(house.position.x, 0, R.back + 0.35);
    crate.rotation.y = 0.2;
    g.add(crate);
  } else g.add(house);
  {
    const wood = keep(new THREE.MeshStandardMaterial({ map: keep(woodTexture({ base: '#d8b48a', dark: '#9a7350', vertical: true, seed: 31, boards: 5 })), roughness: 0.8 }));
    // façade avec une porte ronde
    const shape = new THREE.Shape();
    shape.moveTo(-0.2, 0);
    shape.lineTo(0.2, 0);
    shape.lineTo(0.2, 0.22);
    shape.lineTo(0, 0.34);
    shape.lineTo(-0.2, 0.22);
    shape.lineTo(-0.2, 0);
    const hole = new THREE.Path();
    hole.absarc(0, 0.1, 0.075, 0, Math.PI, false);
    hole.lineTo(-0.075, 0.0);
    hole.lineTo(0.075, 0.0);
    shape.holes.push(hole);
    const front = new THREE.ExtrudeGeometry(shape, { depth: 0.02, bevelEnabled: false });
    for (const z of [0.15, -0.17]) mesh(front.clone(), wood, [0, 0, z], null, true, house);
    front.dispose();
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.02, 0.22, 0.32), wood, [s * 0.19, 0.11, 0], null, true, house);
    const roofMat = keep(new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.8, map: keep(noiseTexture('#8a5a3a', 0.2, 3, 64)) }));
    for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.26, 0.018, 0.4), roofMat, [s * 0.1, 0.285, 0], [0, 0, -s * 0.55], true, house);
    mesh(new THREE.BoxGeometry(0.36, 0.005, 0.3), keep(new THREE.MeshStandardMaterial({ color: 0x1c140c, roughness: 1 })), [0, 0.01, 0], null, false, house);
  }

  // ---------------------------------------------------------------- le grillage de côté (au-delà de ses gamelles), et le jardin
  const fence = new THREE.Group();
  g.add(fence);
  const backWire = new THREE.Group();
  if (travel) g.add(backWire);
  {
    const wm = keep(new THREE.MeshStandardMaterial({ map: meshTex.clone(), alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
    wm.map.repeat.set(14, 3);
    keep(wm.map);
    const d = 2.2 - R.back;
    mesh(new THREE.PlaneGeometry(d, 0.75), wm, [R.side, 0.375, (R.back + 2.2) / 2], [0, -Math.PI / 2, 0], false, fence);
    for (let k = 0; k <= 3; k++) mesh(new THREE.BoxGeometry(0.05, 0.8, 0.05), postMat, [R.side, 0.4, R.back + (k / 3) * d], null, true, fence);
    mesh(new THREE.BoxGeometry(0.04, 0.04, d), postMat, [R.side, 0.78, (R.back + 2.2) / 2], null, true, fence);
    // le jardin au-delà : massifs et haie (une grande image derrière, un peu floue) ; en voyage, ni le jardin ni ses
    // touffes vertes (sur le sable, la terre rouge) : construits, jamais montrés
    const garden = travel ? new THREE.Group() : g;
    const gt = keep(gardenTexture(5));
    const far = mesh(new THREE.PlaneGeometry(6, 3), keep(new THREE.MeshBasicMaterial({ map: gt, toneMapped: false })), [R.side + 2.5, 1.0, 0], [0, -Math.PI / 2, 0], false, garden);
    far.material.color.setScalar(0.95);
    // quelques touffes d'herbe et des fleurs le long du grillage, dehors
    const tuft = keep(new THREE.MeshStandardMaterial({ color: 0x6f9a4a, roughness: 1, side: THREE.DoubleSide }));
    const r = rng(8);
    for (let i = 0; i < 26; i++) {
      const t = shadowed(new THREE.Mesh(keep(new THREE.ConeGeometry(0.03 + r() * 0.03, 0.12 + r() * 0.12, 5)), tuft), false);
      t.position.set(R.side + 0.08 + r() * 0.6, 0.06, R.back + r() * d);
      t.rotation.z = (r() - 0.5) * 0.3;
      garden.add(t);
    }
    // en voyage, derrière lui : le même grillage bas, à la place du clapier (on voit le lieu par-dessus)
    if (travel) {
      const bw = R.side - R.left;
      const wb = keep(new THREE.MeshStandardMaterial({ map: meshTex.clone(), alphaTest: 0.4, side: THREE.DoubleSide, metalness: 0.6, roughness: 0.4 }));
      wb.map.repeat.set(bw * 4, 3);
      keep(wb.map);
      mesh(new THREE.PlaneGeometry(bw, 0.75), wb, [(R.left + R.side) / 2, 0.375, R.back], null, false, backWire);
      const nP = Math.max(2, Math.round(bw / 1.1));
      for (let k = 0; k <= nP; k++) mesh(new THREE.BoxGeometry(0.05, 0.8, 0.05), postMat, [R.left + (k / nP) * bw, 0.4, R.back], null, true, backWire);
      mesh(new THREE.BoxGeometry(bw, 0.04, 0.04), postMat, [(R.left + R.side) / 2, 0.78, R.back], null, true, backWire);
    }
  }

  // ---------------------------------------------------------------- le biberon accroché au grillage
  const bottle = new THREE.Group();
  bottle.position.set(R.side - 0.035, Math.max(0.12, H * 0.62), Math.max(R.back + 0.35, -0.1));
  g.add(bottle);
  {
    const glass = keep(new THREE.MeshStandardMaterial({ color: 0xdff2ff, roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35 }));
    const water = keep(new THREE.MeshStandardMaterial({ color: 0x8cc4e8, roughness: 0.1, transparent: true, opacity: 0.6 }));
    const steel = keep(new THREE.MeshStandardMaterial({ color: 0xc8ccd2, metalness: 0.9, roughness: 0.25 }));
    const bs = Math.max(0.7, Math.min(1.2, H / 0.26));
    const b = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03 * bs, 0.03 * bs, 0.16 * bs, 18)), glass), false);
    b.position.y = 0.1 * bs;
    bottle.add(b);
    const w = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.027 * bs, 0.027 * bs, 0.11 * bs, 18)), water), false);
    w.position.y = 0.075 * bs;
    bottle.add(w);
    const cap = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.02 * bs, 0.028 * bs, 0.025 * bs, 14)), keep(new THREE.MeshStandardMaterial({ color: 0x3f8ac8, roughness: 0.4 }))));
    cap.position.y = 0.012 * bs;
    bottle.add(cap);
    const spout = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.005 * bs, 0.006 * bs, 0.07 * bs, 10)), steel));
    spout.position.set(-0.012 * bs, -0.02 * bs, 0);
    spout.rotation.z = -0.5;
    bottle.add(spout);
    const clip = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.032 * bs, 0.002, 4, 16)), steel), false);
    clip.rotation.x = Math.PI / 2;
    clip.position.y = 0.13 * bs;
    bottle.add(clip);
    bottle.rotation.y = Math.PI / 2;
  }

  // ---------------------------------------------------------------- fanes et feuilles dans la paille
  {
    const leaf = keep(new THREE.MeshStandardMaterial({ color: 0x5f9a3a, roughness: 0.7, side: THREE.DoubleSide }));
    const r = rng(12);
    for (let i = 0; i < 7; i++) {
      const l = shadowed(new THREE.Mesh(keep(new THREE.CircleGeometry(0.035 * Math.max(0.7, H / 0.26), 6)), leaf), false);
      l.scale.set(0.5, 1.6, 1);
      l.position.set(L.body.x - len * 1.2 + r() * len * 0.8, 0.02, 0.15 + r() * 0.35);
      l.rotation.set(-Math.PI / 2 + 0.1, 0, r() * 6);
      g.add(l);
    }
  }

  // ---------------------------------------------------------------- ses gamelles en grès, à son nom
  const props = {};
  const bowlR = Math.max(0.045, Math.min(0.11, L.size.headLen * 0.9 + 0.015));
  props.food = petBowl({ r: bowlR, color: 0xc9a46a, name: stage.a?.name ?? '', content: 'food', food: FOODS.rabbit, high });
  props.water = petBowl({ r: bowlR, color: 0x6a8fb0, name: stage.a?.name ?? '', content: 'water', high });
  for (const b of [props.food, props.water]) g.add(b.group);
  const eat = stage.eatMuzzle('eat');
  const bowlDepth = props.food.dims.depth + 0.012;
  const feedAt = v3(Math.max(eat.x, L.nose.x - bowlR * 0.3), bowlDepth, eat.z);
  const restAt = (k) => v3(L.nose.x + bowlR * (1.8 + k * 2.3), bowlDepth, R.back + bowlR * 1.4 + 0.12);
  props.hand = avatarHand(stage.game?.profile);
  const layout = (which) => {
    const f = which === 'feed' ? feedAt : restAt(0);
    props.food.group.position.copy(f);
    props.water.group.position.copy(which === 'water' ? feedAt : which === 'feed' ? v3(feedAt.x + bowlR * 1.7, bowlDepth, feedAt.z - bowlR * 3.1) : restAt(1));
    if (which === 'water') props.food.group.position.set(feedAt.x + bowlR * 1.7, bowlDepth, feedAt.z - bowlR * 3.1);
  };
  layout('rest');

  // ---------------------------------------------------------------- lumière du jardin
  const hemi = new THREE.HemisphereLight(0xe8f2ff, 0x8a7a4a, 0.85);
  g.add(hemi);
  const key = new THREE.DirectionalLight(0xfff0d8, 2.2);
  const span = Math.max(0.9, len * 3 + 0.6);
  key.position.set(L.body.x - 1.4 * span, 2.8 * span, 2.2 * span);
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
  key.shadow.normalBias = 0.012;
  key.shadow.radius = 5;
  g.add(key, key.target);
  const rim = new THREE.DirectionalLight(0xffe2b0, 1.0);
  rim.position.set(R.side + 2, 2, R.back - 2);
  rim.target.position.set(L.body.x, H * 0.5, 0);
  g.add(rim, rim.target);
  let env = stage.headless ? null : stage.track(() => roomEnvironment(stage.renderer, high, new THREE.Color(0.95, 1.0, 0.92)));
  stage.scene.environment = env?.texture ?? null;
  stage.scene.environmentIntensity = 0.5;
  stage.scene.background = new THREE.Color(0xbfd8e8);
  stage.scene.fog = new THREE.Fog(0xcfe0e8, 5, 12);

  // Les places des objets du jour (extras.js) : au sol devant le clapier, sur son toit, contre ses planches.
  const spots = [];
  for (let x = R.left + 0.4; x <= R.side - 0.3; x += 0.25) spots.push({ kind: 'floor', p: [x, 0, R.back + 0.22] });
  // (sur le toit du clapier ; en voyage, sur la barre du haut du grillage)
  if (travel) for (let x = R.left + 0.4; x <= R.side - 0.3; x += 0.3) spots.push({ kind: 'perch', p: [x, 0.8, R.back], face: 0, wall: backWire });
  else for (let x = hx - hW / 2 + 0.3; x <= hx + hW / 2 - 0.3; x += 0.3) spots.push({ kind: 'perch', p: [x, hH + 0.2, R.back + 0.1], face: 0, wall: hutch });
  for (let x = R.left + 0.4; x <= R.side - 0.3; x += 0.35) spots.push({ kind: 'lean', p: [x, 0, R.back + 0.04] });
  // (sur ses planches, là où la caméra les voit, à hauteur de lapin : une botte de carottes, un nichoir — la porte, la
  // plaque, le râtelier, les montants y sont déjà, placeExtras les voit et les évite)
  // (en voyage, pas de clapier : rien à y accrocher)
  const hangAreas = travel ? [] : [{ axis: 'z', at: R.back, u0: hx - hW / 2 + 0.06, u1: hx + hW / 2 - 0.06, y0: 0.03, y1: hH - 0.06, face: 0, wall: hutch }];
  return {
    group: g,
    props,
    plate,
    room: R,
    kind: opts.grass ? 'enclos' : 'clapier',
    outdoor: true,
    sky,
    ground: field ? field.mats : [],
    spots,
    hangAreas,
    area: { x0: R.left + 0.3, x1: R.side - 0.25, z0: R.back + 0.2, z1: 1.4, y: 0.02 },
    anchors: { eat },
    layout,
    restore(st) {
      if (st.headless) return;
      env?.dispose();
      env = st.track(() => roomEnvironment(st.renderer, high, new THREE.Color(0.95, 1.0, 0.92)));
      st.scene.environment = env.texture;
    },
    update(dt, st) {
      hutch.visible = st.camera.position.z > R.back + 0.02;
      backWire.visible = hutch.visible;
      // (le grillage entre la caméra et le lapin : caché, avec le biberon qui y est accroché)
      fence.visible = st.camera.position.x < R.side - 0.02;
      bottle.visible = fence.visible;
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

/** Bosselle une géométrie (bruit déterministe le long de la normale). */
function lumpy(geo, amp, seed = 1, freq = 30) {
  const p = geo.attributes.position;
  const n = geo.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const d = (Math.sin(x * freq + seed) * Math.cos(y * freq * 1.3 - seed) + Math.sin(z * freq * 1.7 + y * 3 + seed * 2) * 0.6) * amp;
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Brins de paille et de foin posés sur la litière (un seul InstancedMesh, couleurs variées). */
function strands(keep, n, R, H) {
  const geo = keep(new THREE.BoxGeometry(1, 0.0025, 0.004));
  const mat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
  const inst = new THREE.InstancedMesh(geo, mat, n);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const c = new THREE.Color();
  const r = rng(19);
  const palette = [0xe6c66e, 0xd8b45a, 0xf0d88e, 0xc49a48, 0xb8c070, 0x9aa858];
  const near = Math.max(0.6, H * 5);
  for (let i = 0; i < n; i++) {
    const x = (r() - 0.5) * near * 2;
    const z = R.back + 0.05 + r() * (near + 0.6);
    e.set((r() - 0.5) * 0.4, r() * Math.PI * 2, (r() - 0.5) * 0.5);
    q.setFromEuler(e);
    const len = 0.04 + r() * 0.12;
    m4.compose(new THREE.Vector3(x, 0.014 + r() * 0.012, z), q, new THREE.Vector3(len, 1, 1 + r()));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.setHex(palette[Math.floor(r() * palette.length)]).multiplyScalar(0.85 + r() * 0.3));
  }
  inst.receiveShadow = true;
  return inst;
}

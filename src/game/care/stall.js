// Le box de l'écurie, décor de la scène de soin du cheval (src/game/care/stage.js) : murs en planches, barreaux
// noirs au-dessus, fenêtre au fond d'où entre le soleil (un rai de lumière, des poussières qui dansent dedans),
// litière de paille épaisse, poutres, la plaque à son nom ; lumière chaude et ombres douces. Les accessoires
// (filet à foin, mangeoire, seau…) sont posés par rapport à la bouche du cheval (stage.marks), quelle que soit
// sa taille (un Shetland ou un Frison).
//
// Repère : le cheval est au milieu, de profil, la tête vers +x ; on se tient du côté +z (la porte du box).

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { plateTexture } from '../models/interiorKit.js';
import { hayNet, feeder, bucket, waterTap, BUCKET, FEEDER, NET_DEPTH, avatarHand } from './props.js';
import { canvasTex, woodTexture, strawFloorTexture, noiseTexture } from './textures.js';

export const STALL = { halfW: 1.85, back: -1.45, front: 2.2, low: 1.3, high: 2.6, roof: 3.05 };

/**
 * Le box. stage : la scène (marks, double). Renvoie { group, props, anchors, update, dispose }.
 */
export function stallSet(stage) {
  const g = new THREE.Group();
  const own = []; // à libérer
  const keep = (x) => {
    own.push(x);
    return x;
  };
  const high = stage.high;
  const S = STALL;
  const M = stage.marks;
  const scale = stage.double.scale;
  // Accessoires à la taille de l'animal : un poney ou un poulain a un plus petit seau, une plus petite mangeoire,
  // un plus petit filet (comme dans une vraie écurie de poneys), sinon il disparaît derrière.
  const ps = Math.min(1, Math.max(0.72, 0.35 + 0.65 * scale));
  // Petit gabarit (Falabella 0, Shetland 0,2, poulain 0,3 ; cheval 1) : le filet et le robinet se rapprochent de sa
  // bouche (sinon, à côté d'eux, sa petite tête restait toute petite dans un coin de l'image).
  const big = Math.min(1, Math.max(0, (scale - 0.5) / 0.45));
  // Le cheval se place d'après sa pose « à la mangeoire » (mesurée sur son gabarit : un Shetland ou un Frison) :
  // la bouche au-dessus du milieu de la mangeoire accrochée au mur de droite ; le dos à ~1 m du mur du fond. Mais
  // tête haute, son nez reste à 15 cm du mur au moins : un poulain baisse la tête jusqu'au sol en reculant le nez
  // de 35 cm, il avait le bout du nez dans le mur ; sa mangeoire et son seau sont alors posés dans la paille.
  // (une seule mesure : déplacer le cheval en x déplace sa bouche d'autant)
  stage.holder.position.set(0, 0, -0.2);
  const standX = stage.marks.muzzle.x - stage.marks.body.x; // (nez debout, par rapport au corps)
  const bodyX = stage.marks.body.x;
  const eat = stage.eatMuzzle();
  const feedX = S.halfW - (FEEDER.r * ps + 0.06);
  const dx = Math.min(feedX - eat.x, S.halfW - 0.15 - (bodyX + standX));
  stage.holder.position.x += dx;
  eat.x += dx;
  stage.measure();
  const L = stage.marks;

  // ---------------------------------------------------------------- matières
  const wood = keep(woodTexture({ base: '#9b6a3f', dark: '#5d3a1f', vertical: true, seed: 3 }));
  wood.repeat.set(3, 1);
  const woodSide = keep(woodTexture({ base: '#a77445', dark: '#62401f', vertical: true, seed: 9 }));
  woodSide.repeat.set(3, 1);
  const woodBeam = keep(woodTexture({ base: '#6f4a2a', dark: '#3f2614', vertical: false, seed: 5 }));
  const straw = keep(strawFloorTexture());
  straw.repeat.set(3, 3);
  const grain = keep(noiseTexture('#7a5a3c', 0.18, 7));
  grain.repeat.set(4, 4);
  const plankMat = keep(new THREE.MeshStandardMaterial({ map: wood, roughness: 0.82, color: 0xffffff }));
  const plankSideMat = keep(new THREE.MeshStandardMaterial({ map: woodSide, roughness: 0.82 }));
  const beamMat = keep(new THREE.MeshStandardMaterial({ map: woodBeam, roughness: 0.9 }));
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x1d1d20, roughness: 0.38, metalness: 0.75 }));
  const strawMat = keep(new THREE.MeshStandardMaterial({ map: straw, roughness: 1, color: 0xf2e2b8 }));
  const dirtMat = keep(new THREE.MeshStandardMaterial({ map: grain, roughness: 1, color: 0x8a6a48 }));
  const plaster = keep(new THREE.MeshStandardMaterial({ color: 0xe8dcc4, roughness: 0.95 }));

  // Murs en groupes : un mur entre la caméra et le cheval disparaît (la caméra peut se placer hors du box).
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

  // ---------------------------------------------------------------- sol : terre battue et litière épaisse
  mesh(new THREE.PlaneGeometry(12, 12), dirtMat, [0, -0.002, 0], [-Math.PI / 2, 0, 0], false);
  // Litière : un tapis bosselé (relief doux) et des brins de paille posés dessus.
  const bed = new THREE.PlaneGeometry(S.halfW * 2 + 0.1, S.front - S.back + 0.2, 48, 36);
  const bp = bed.attributes.position;
  for (let i = 0; i < bp.count; i++) {
    const x = bp.getX(i);
    const y = bp.getY(i);
    // (plus épaisse le long des murs, comme une vraie litière relevée)
    const edge = Math.max(0, 1 - Math.min(S.halfW - Math.abs(x), y - (-(S.front - S.back) / 2)) / 0.5);
    const h = 0.035 + 0.02 * Math.sin(x * 7.1 + y * 3.3) * Math.cos(y * 5.7 - x * 2.1) + 0.012 * Math.sin(x * 19 + y * 23) + 0.1 * edge * edge;
    bp.setZ(i, h);
  }
  bed.computeVertexNormals();
  mesh(bed, strawMat, [0, 0, (S.back + S.front) / 2], [-Math.PI / 2, 0, 0], false).receiveShadow = true;
  g.add(strawStrands(keep, high ? 2200 : 1300, S));

  // ---------------------------------------------------------------- murs
  const wallT = 0.08;
  // Fond : planches jusqu'en haut, avec une fenêtre.
  const backW = S.halfW * 2 + 0.2;
  const win = { x: -0.55, y: 1.95, w: 1.05, h: 0.75 };
  // (planches autour de la fenêtre : quatre morceaux)
  const backMat = plankMat;
  into = walls.back;
  const piece = (x0, x1, y0, y1) => {
    if (x1 - x0 < 0.01 || y1 - y0 < 0.01) return;
    const geo = new THREE.BoxGeometry(x1 - x0, y1 - y0, wallT);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, (x0 + uv.getX(i) * (x1 - x0) + 2) / 1.2, (y0 + uv.getY(i) * (y1 - y0)) / S.roof);
    mesh(geo, backMat, [(x0 + x1) / 2, (y0 + y1) / 2, S.back - wallT / 2]);
  };
  const bx0 = -backW / 2;
  const bx1 = backW / 2;
  piece(bx0, bx1, 0, win.y - win.h / 2);
  piece(bx0, bx1, win.y + win.h / 2, S.roof);
  piece(bx0, win.x - win.w / 2, win.y - win.h / 2, win.y + win.h / 2);
  piece(win.x + win.w / 2, bx1, win.y - win.h / 2, win.y + win.h / 2);
  // La fenêtre : cadre, croisillon, carreaux lumineux (le ciel dehors) et barreaux.
  const sky = keep(canvasTex(128, 96, (c) => {
    const gr = c.createLinearGradient(0, 0, 0, 96);
    gr.addColorStop(0, '#fff8e6');
    gr.addColorStop(0.55, '#ffe8b8');
    gr.addColorStop(1, '#f3c98a');
    c.fillStyle = gr;
    c.fillRect(0, 0, 128, 96);
    // (un arbre au loin, flou)
    c.fillStyle = 'rgba(120,140,80,0.35)';
    c.beginPath();
    c.ellipse(96, 86, 40, 26, 0, 0, Math.PI * 2);
    c.fill();
  }, { key: 'sky' }));
  const pane = mesh(new THREE.PlaneGeometry(win.w, win.h), keep(new THREE.MeshBasicMaterial({ map: sky, color: 0xffffff, toneMapped: false })), [win.x, win.y, S.back - wallT - 0.01], null, false);
  pane.material.color.setScalar(1.6);
  const frameMat = keep(new THREE.MeshStandardMaterial({ color: 0xf1ead8, roughness: 0.7 }));
  const fr = (w, h, x, y) => mesh(new THREE.BoxGeometry(w, h, 0.1), frameMat, [x, y, S.back - 0.03]);
  fr(win.w + 0.12, 0.07, win.x, win.y + win.h / 2 + 0.02);
  fr(win.w + 0.16, 0.08, win.x, win.y - win.h / 2 - 0.02);
  fr(0.07, win.h, win.x - win.w / 2 - 0.02, win.y);
  fr(0.07, win.h, win.x + win.w / 2 + 0.02, win.y);
  fr(0.045, win.h, win.x, win.y);
  fr(win.w, 0.04, win.x, win.y);
  // Murs de côté : planches en bas, barreaux noirs en haut (on voit le box d'à côté, dans la pénombre).
  for (const s of [-1, 1]) {
    into = s < 0 ? walls.left : walls.right;
    const x = s * S.halfW;
    const depth = S.front - S.back;
    const geo = new THREE.BoxGeometry(wallT, S.low, depth);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * depth / 1.2, uv.getY(i) * S.low / S.roof);
    mesh(geo, plankSideMat, [x + s * wallT / 2, S.low / 2, (S.back + S.front) / 2]);
    // lisse en haut des planches
    mesh(new THREE.BoxGeometry(0.14, 0.09, depth), beamMat, [x + s * 0.02, S.low + 0.04, (S.back + S.front) / 2]);
    mesh(new THREE.BoxGeometry(0.12, 0.08, depth), beamMat, [x + s * 0.02, S.high, (S.back + S.front) / 2]);
    // barreaux
    const n = Math.floor(depth / 0.16);
    const bars = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.014, 0.014, S.high - S.low, 8)), metal, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) bars.setMatrixAt(i, m4.makeTranslation(x, (S.low + S.high) / 2, S.back + 0.08 + i * 0.16));
    bars.castShadow = true;
    into.add(bars);
    // au-dessus des barreaux : le haut de la cloison, en planches
    const up = new THREE.BoxGeometry(wallT, S.roof - S.high, depth);
    mesh(up, plankSideMat, [x + s * wallT / 2, (S.high + S.roof) / 2, (S.back + S.front) / 2]);
    // le box d'à côté, sombre (on n'en voit que la pénombre à travers les barreaux)
    mesh(new THREE.PlaneGeometry(depth + 2, S.high + 0.4), keep(new THREE.MeshStandardMaterial({ map: woodSide, color: 0x7a6048, roughness: 1, emissive: 0x2a1c10 })),
      [x + s * 1.6, (S.high + 0.4) / 2, (S.back + S.front) / 2], [0, -s * Math.PI / 2, 0], false);
  }
  // Poutres du plafond.
  into = walls.roof;
  for (const z of [S.back + 0.4, 0.45, S.front - 0.5]) mesh(new THREE.BoxGeometry(S.halfW * 2 + 0.3, 0.18, 0.16), beamMat, [0, S.roof - 0.09, z]);
  mesh(new THREE.PlaneGeometry(S.halfW * 2 + 0.3, S.front - S.back + 1), plaster, [0, S.roof, (S.back + S.front) / 2], [Math.PI / 2, 0, 0], false);
  // Porte du box (de notre côté) : les deux montants, au bord de la vue. Avec le devant du box : quand la caméra
  // recule hors du box (paysage, tout le cheval dans peu de hauteur), ils disparaissent avec lui (avant : un grand
  // coin brun en travers de l'image).
  into = walls.front;
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.14, S.roof, 0.14), beamMat, [s * (S.halfW - 0.05), S.roof / 2, S.front - 0.05]);

  // Devant (la porte du box, de notre côté) : planches en bas, barreaux au-dessus, l'ouverture de la porte au milieu.
  // On ne le voit que quand la caméra passe de l'autre côté du cheval (cure-pied des pieds gauches).
  into = walls.front;
  {
    const door = 1.3;
    const seg = (x0, x1) => {
      const w = x1 - x0;
      const geo = new THREE.BoxGeometry(w, S.low, wallT);
      const uv = geo.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w / 1.2, uv.getY(i) * S.low / S.roof);
      mesh(geo, plankSideMat, [(x0 + x1) / 2, S.low / 2, S.front + wallT / 2]);
      mesh(new THREE.BoxGeometry(w, 0.09, 0.14), beamMat, [(x0 + x1) / 2, S.low + 0.04, S.front]);
    };
    seg(-S.halfW, -door / 2);
    seg(door / 2, S.halfW);
    mesh(new THREE.BoxGeometry(S.halfW * 2, 0.1, 0.14), beamMat, [0, S.high, S.front]);
    const n = Math.floor((S.halfW * 2) / 0.16);
    const bars = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.014, 0.014, S.high - S.low, 8)), metal, n);
    const m4 = new THREE.Matrix4();
    for (let i = 0; i < n; i++) bars.setMatrixAt(i, m4.makeTranslation(-S.halfW + 0.08 + i * 0.16, (S.low + S.high) / 2, S.front));
    walls.front.add(bars);
    // l'allée au-delà : dalles et pénombre
    mesh(new THREE.PlaneGeometry(S.halfW * 2 + 4, 3), keep(new THREE.MeshStandardMaterial({ color: 0x8e877c, roughness: 0.95 })), [0, 0.005, S.front + 1.5], [-Math.PI / 2, 0, 0], false);
    mesh(new THREE.PlaneGeometry(S.halfW * 2 + 4, S.roof), keep(new THREE.MeshStandardMaterial({ map: woodSide, color: 0x6a5038, roughness: 1, emissive: 0x1e140a })), [0, S.roof / 2, S.front + 3], [0, Math.PI, 0], false);
  }

  // Plaque à son nom, sur le mur du fond.
  into = walls.back;
  const plate = keep(plateTexture(stage.a?.name ?? ''));
  const plateMat = keep(new THREE.MeshStandardMaterial({ map: plate, roughness: 0.6 }));
  const plateMesh = mesh(new THREE.BoxGeometry(0.62, 0.2, 0.025), plateMat, [win.x + win.w / 2 + 0.75, 2.2, S.back + 0.012]);
  // (deux clous)
  for (const dx of [-0.26, 0.26]) mesh(new THREE.SphereGeometry(0.012, 8, 6), metal, [win.x + win.w / 2 + 0.75 + dx, 2.2, S.back + 0.03], null, false);
  // Une bride accrochée et un licol (taches de couleur sur le mur, comme dans un vrai box).
  const hook = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 8), metal, [-S.halfW + 0.05, 1.05, S.back + 0.6], [0, 0, Math.PI / 2]);
  hook.castShadow = false;
  const rope = keep(new THREE.MeshStandardMaterial({ color: 0x2f6aa8, roughness: 0.8 }));
  const coil = new THREE.Mesh(keep(new THREE.TorusGeometry(0.14, 0.018, 8, 28)), rope);
  coil.position.set(-S.halfW + 0.08, 0.92, S.back + 0.6);
  coil.rotation.y = Math.PI / 2;
  coil.scale.set(1, 1.35, 1);
  coil.castShadow = true;
  walls.left.add(coil);
  into = g;

  // ---------------------------------------------------------------- accessoires (posés à hauteur de sa bouche)
  const props = {};
  const muzzle = L.muzzle;
  // Mangeoire : au mur de droite, sous sa bouche quand il mange (le bord juste au-dessus du bout du nez) ; ou, si sa
  // bouche n'arrive pas jusqu'au mur (poulain), posée dans la paille sous sa bouche.
  const onFloor = eat.x < feedX - 0.04;
  const hand = avatarHand(stage.game?.profile);
  props.feeder = feeder({ high, hand });
  props.feeder.group.scale.setScalar(ps);
  props.feeder.setFloor(onFloor);
  const feedAt = onFloor
    ? new THREE.Vector3(eat.x + 0.04, FEEDER.depth * ps + 0.045, eat.z)
    : new THREE.Vector3(feedX, Math.max(0.3, eat.y + 0.07), eat.z);
  props.feeder.group.position.copy(feedAt);
  g.add(props.feeder.group);
  // Filet à foin : accroché au mur de droite, un peu devant la mangeoire, le bas à hauteur de bouche (tête haute).
  props.net = hayNet({ high, hand });
  props.net.group.scale.setScalar(ps);
  props.net.group.position.set(S.halfW - 0.25 * ps, Math.max(feedAt.y + (NET_DEPTH + 0.2) * ps, muzzle.y + 0.62 * ps), feedAt.z + (0.42 + 0.43 * big) * Math.max(0.85, ps));
  g.add(props.net.group);
  // Seau d'eau : posé dans la litière, à l'angle avant droit (pour boire, il prend la place de la mangeoire).
  props.bucket = bucket({ high });
  props.bucket.group.scale.setScalar(ps);
  g.add(props.bucket.group);
  props.tap = waterTap();
  g.add(props.tap.group);
  /**
   * Où sont les accessoires selon le soin : 'feed' (filet, mangeoire devant sa tête), 'water' (seau au mur sous sa
   * bouche, robinet), 'rest' (rangés au fond du box : la tête est libre, pour la friandise, les caresses, le pansage).
   */
  const netAt = props.net.group.position.clone();
  const layout = (which) => {
    props.tap.group.visible = which === 'water';
    props.net.group.visible = which !== 'water';
    props.feeder.group.visible = which !== 'water';
    if (which === 'rest') {
      props.net.group.position.set(netAt.x, netAt.y, S.back + 0.4);
      props.feeder.group.position.set(feedAt.x, feedAt.y, S.back + 0.42);
    } else {
      props.net.group.position.copy(netAt);
      props.feeder.group.position.copy(feedAt);
    }
    if (which === 'water') {
      // Seau accroché au mur sous sa bouche, ou posé dans la paille sous sa bouche (poulain : voir la mangeoire).
      const bx = S.halfW - (BUCKET.r * ps + 0.07);
      const b = onFloor
        ? props.bucket.group.position.set(eat.x + 0.03, BUCKET.depth * ps + 0.045, eat.z)
        : props.bucket.group.position.set(bx, Math.max(0.36, eat.y + 0.1), eat.z);
      // Le robinet au mur, à côté du seau (vers nous, loin de la tête), et le tuyau dont la lance est accrochée au
      // bord du seau côté mur. (Avant : un robinet au-dessus du seau, en plein là où la tête descend boire : il
      // traversait la tête d'un poulain.)
      const tap = props.tap.group.position.set(S.halfW, b.y + (onFloor ? 0.45 : 0.36 + 0.16 * big), b.z + 0.36 + 0.19 * big);
      const rim = new THREE.Vector3(BUCKET.r * 0.45, 0.035, BUCKET.r * 0.88).multiplyScalar(ps).add(b);
      props.tap.hookUp(rim.clone().sub(tap), b.clone().sub(rim), onFloor ? 0.04 - tap.y : null);
    } else {
      props.bucket.group.position.set(S.halfW - 0.3, BUCKET.depth * ps + 0.03, S.front - 0.75);
    }
  };
  layout('none');

  // ---------------------------------------------------------------- lumière
  const hemi = new THREE.HemisphereLight(0xfff0d6, 0x8b6a3c, high ? 0.75 : 0.85);
  g.add(hemi);
  // Lumière principale : par la porte du box, haute et chaude, de notre côté (le flanc qu'on voit est éclairé).
  const key = new THREE.DirectionalLight(0xffe2b8, 2.3);
  key.position.set(-1.6, 4.2, 3.4);
  key.target.position.set(0.2, 0.8, -0.3);
  key.castShadow = true;
  const sm = high ? 2048 : 1024;
  key.shadow.mapSize.set(sm, sm);
  const cam = key.shadow.camera;
  cam.left = -3;
  cam.right = 3;
  cam.top = 3;
  cam.bottom = -2;
  cam.near = 0.5;
  cam.far = 12;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  g.add(key, key.target);
  // Soleil de la fenêtre : il dessine le liseré du dos et de la crinière (contre-jour doux).
  const sun = new THREE.DirectionalLight(0xffd29a, 1.4);
  sun.position.set(win.x - 0.5, win.y + 1.2, S.back - 2.5);
  sun.target.position.set(0.4, 0.6, 1);
  g.add(sun, sun.target);
  // Petit débouchage froid de face (l'allée), pour que rien ne soit noir.
  const fill = new THREE.DirectionalLight(0xc9dcff, 0.35);
  fill.position.set(2.5, 1.5, 4);
  g.add(fill);
  // Rai de soleil : un volume lumineux de la fenêtre vers la litière, et des poussières qui y flottent.
  const shaft = sunShaft(keep, win, S);
  g.add(shaft);
  const motes = dustMotes(keep, win, S, high ? 70 : 40);
  g.add(motes.points);

  // Environnement (reflets doux du pelage, du seau, du métal) : un petit box chaud « photographié » une fois.
  // (sans WebGL, dans les tests : pas d'environnement)
  let env = stage.headless ? null : stage.track(() => roomEnvironment(stage.renderer, high));
  stage.scene.environment = env?.texture ?? null;
  stage.scene.environmentIntensity = 0.42;
  stage.scene.background = new THREE.Color(0x2a1e14);
  stage.scene.fog = new THREE.Fog(0x2a1e14, 7, 16);

  return {
    group: g,
    props,
    win,
    anchors: { muzzle, eat },
    walls,
    plate: plateMesh,
    layout,
    /** Le contexte WebGL est revenu : l'image de l'environnement est à refaire (l'ancienne est perdue). */
    restore(st) {
      if (st.headless) return;
      env?.dispose();
      env = st.track(() => roomEnvironment(st.renderer, high));
      st.scene.environment = env.texture;
    },
    update(dt, st) {
      // (un mur entre la caméra et le cheval : caché)
      const c = st.camera.position;
      walls.right.visible = c.x < S.halfW - 0.02;
      walls.left.visible = c.x > -S.halfW + 0.02;
      walls.back.visible = c.z > S.back + 0.02;
      walls.roof.visible = c.y < S.roof - 0.02;
      walls.front.visible = c.z < S.front - 0.02;
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

/** Environnement des reflets : un petit box chaud « photographié » une fois (PMREM). */
function roomEnvironment(renderer, high) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  room.traverse((o) => {
    if (o.isMesh && o.material?.color) o.material.color.multiply(new THREE.Color(1.0, 0.86, 0.68));
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
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const palette = [0xe6c66e, 0xd8b45a, 0xf0d88e, 0xc49a48, 0xe9cf86, 0xb88d40];
  for (let i = 0; i < n; i++) {
    const x = (rnd() * 2 - 1) * (S.halfW - 0.05);
    const z = S.back + 0.05 + rnd() * (S.front - S.back - 0.1);
    const edge = Math.max(0, 1 - Math.min(S.halfW - Math.abs(x), z - S.back) / 0.5);
    const y = 0.04 + rnd() * 0.035 + 0.1 * edge * edge;
    e.set((rnd() - 0.5) * 0.5, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.6);
    q.setFromEuler(e);
    const len = 0.08 + rnd() * 0.2;
    m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(len, 1, 1 + rnd()));
    inst.setMatrixAt(i, m4);
    inst.setColorAt(i, c.setHex(palette[Math.floor(rnd() * palette.length)]).multiplyScalar(0.85 + rnd() * 0.3));
  }
  inst.receiveShadow = true;
  inst.castShadow = false;
  return inst;
}

/** Rai de soleil : boîte allongée, lumière additive qui s'efface sur les bords et vers le sol. */
function sunShaft(keep, win, S) {
  const len = 3.3;
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
        float a = side * vert * (1.0 - along) * (0.2 + 0.8 * smoothstep(0.0, 0.15, along)) * 0.11 * flick;
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * a, 1.0);
      }`,
  }));
  const m = new THREE.Mesh(geo, mat);
  m.position.set(win.x, win.y, S.back);
  // (le rai descend vers l'avant et un peu vers la droite)
  m.lookAt(win.x + 0.9, 0.2, S.back + 2.4);
  m.renderOrder = 5;
  return m;
}

/** Poussières dans le rai de soleil : quelques points doux qui flottent lentement. */
function dustMotes(keep, win, S, n) {
  const pos = new Float32Array(n * 3);
  const seeds = [];
  for (let i = 0; i < n; i++) {
    const k = Math.random();
    seeds.push({ k, a: Math.random() * 6.28, r: 0.1 + Math.random() * 0.35, s: 0.2 + Math.random() * 0.5, y: Math.random() });
  }
  const geo = keep(new THREE.BufferGeometry());
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dot = keep(new THREE.CanvasTexture(makeDot()));
  const mat = keep(new THREE.PointsMaterial({ size: 0.018, map: dot, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xfff0c8, opacity: 0.8 }));
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false;
  let t = 0;
  const update = (dt) => {
    t += dt;
    for (let i = 0; i < n; i++) {
      const s = seeds[i];
      const k = (s.k + t * 0.01 * s.s) % 1;
      const x = win.x + 0.9 * k + Math.cos(s.a + t * s.s * 0.3) * s.r;
      const y = win.y - (win.y - 0.4) * k + Math.sin(s.a * 2 + t * s.s * 0.4) * 0.12 + (s.y - 0.5) * 0.4;
      const z = S.back + 0.2 + 2.4 * k + Math.sin(s.a + t * 0.2) * 0.15;
      pos[i * 3] = x;
      pos[i * 3 + 1] = y;
      pos[i * 3 + 2] = z;
    }
    geo.attributes.position.needsUpdate = true;
  };
  update(0);
  return { points, update };
}

function makeDot() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = gr;
  x.fillRect(0, 0, 32, 32);
  return c;
}

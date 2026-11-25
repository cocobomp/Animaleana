// En voyage, le décor dehors d'un soin montre le lieu du voyage (la famille du lieu : awayLook, AWAY_LOOKS dans
// setting.js) : le sable et la mer au loin à la plage, les sommets enneigés, les sapins et un chalet à la montagne, le
// volcan qui fume en Islande, les Rocheuses et la grange rouge en Alberta, l'éolienne et l'estancia dans la Pampa, les
// cerisiers et le portail rouge à Kyoto, les oliviers et l'hacienda en Andalousie, la terre rouge et les eucalyptus du
// bush, les murets de pierre des Cotswolds, les clôtures blanches du Kentucky.
//
// dressAway(stage, decor, look, amb) habille un décor dehors déjà construit (stallSet, barnSet, homeSet, hutchSet
// avec leur version dehors) : cache ses arbres et ses collines au loin (userData.far), change la couleur du sol,
// ajoute le fond du lieu (loin derrière l'animal : il ne le cache jamais). Tout est fait en code, en peu de pièces (les
// arbres en instances), et tout est libéré par dispose() (le sol retrouve sa couleur).

import * as THREE from 'three';
import { canvasTex, rng, softDot } from './textures.js';
import { bag, barnWood, lumpy } from './barnProps.js';
import { stoneTexture } from './outdoor.js';
import { sandTexture } from './roundPen.js';
import { animalBox } from './extras.js';
import { AWAY_LOOKS } from './setting.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** La couleur du sol (multipliée par la texture de l'herbe) ou le sable, selon la famille du lieu. */
const GROUND = {
  sable: { sand: 0xf4e6c8, grass: false },
  rouge: { sand: 0xd8875a, grass: false },
  sec: { tint: 0xe2d29a, tuft: 0xe8d8a0, flowers: false },
  prairie: { tint: 0xeee2a4, tuft: 0xf0e2a8 },
  mousse: { tint: 0xb4c49a, tuft: 0xc8c8a0, flowers: false },
  alpage: {},
  herbe: {},
};

/** Couleurs des arbres selon la saison. */
const CHERRY = { spring: 0xf2b8cc, summer: 0x5d8a3c, autumn: 0xd0602c, winter: null };
const BIRCH = { spring: 0x9ac25a, summer: 0x7aa848, autumn: 0xe0b23a, winter: null };
const LEAVES = { spring: 0x6a9a3e, summer: 0x4f7a34, autumn: 0xc8782c, winter: null };

/** Des pièces posées en instances (une seule par sorte : géométrie + matière). */
function instancer(keep, into) {
  const map = new Map();
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  return {
    add(geo, mat, p, s = [1, 1, 1], ry = 0, rx = 0, rz = 0) {
      const k = `${geo.uuid}|${mat.uuid}`;
      if (!map.has(k)) map.set(k, { geo, mat, list: [] });
      q.setFromEuler(e.set(rx, ry, rz));
      map.get(k).list.push(m4.compose(V(...p), q, V(...(Array.isArray(s) ? s : [s, s, s]))).clone());
    },
    done() {
      for (const { geo, mat, list } of map.values()) {
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m));
        im.castShadow = false;
        im.receiveShadow = true;
        im.userData.away = true;
        into.add(im);
      }
    },
  };
}

/** Rayures d'une cabane de plage (blanc et bleu, ou blanc et rouge). */
function stripeTexture(col) {
  return canvasTex(64, 64, (c) => {
    c.fillStyle = '#f6f2ea';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = col;
    for (let x = 0; x < 64; x += 16) c.fillRect(x, 0, 8, 64);
  }, { key: `stripes|${col}` });
}

/** L'écume au bord de l'eau : une bande blanche déchiquetée, transparente (elle glisse doucement). */
function foamTexture() {
  return canvasTex(256, 32, (c) => {
    const r = rng(19);
    c.clearRect(0, 0, 256, 32);
    for (let i = 0; i < 90; i++) {
      c.fillStyle = `rgba(255,255,255,${0.35 + r() * 0.5})`;
      c.beginPath();
      c.ellipse(r() * 256, 10 + r() * 14, 6 + r() * 16, 1.5 + r() * 3, 0, 0, Math.PI * 2);
      c.fill();
    }
  }, { key: 'foam' });
}

/** Une éolienne de ferme (pylône en treillis, roue à pales qui tourne) ; h : sa hauteur. */
function windPump(keep, h = 6) {
  const g = new THREE.Group();
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.5 }));
  const leg = keep(new THREE.CylinderGeometry(0.05, 0.07, h, 5));
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const m = new THREE.Mesh(leg, metal);
    m.position.set(x * 0.4, h / 2, z * 0.4);
    m.rotation.set(-z * 0.06, 0, x * 0.06);
    g.add(m);
  }
  const wheel = new THREE.Group();
  wheel.position.set(0, h + 0.2, 0.3);
  g.add(wheel);
  const blade = keep(new THREE.BoxGeometry(0.22, 1.1, 0.02));
  blade.translate(0, 0.65, 0);
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Mesh(blade, metal);
    b.rotation.z = (i / 12) * Math.PI * 2;
    b.rotation.y = 0.3;
    wheel.add(b);
  }
  const tail = new THREE.Mesh(keep(new THREE.BoxGeometry(0.04, 0.6, 1.2)), metal);
  tail.position.set(0, h + 0.2, -0.6);
  g.add(tail);
  g.userData.step = (dt) => {
    wheel.rotation.z += dt * 0.9;
  };
  return g;
}

/** Une maison simple : murs (matière walls), toit à deux pans (matière roof). w, d, h : ses tailles. */
function house(keep, { w = 5, d = 4, h = 2.6, walls, roof, pitch = 0.5, over = 0.4, thick = 0.16 }) {
  const g = new THREE.Group();
  const body = new THREE.Mesh(keep(new THREE.BoxGeometry(w, h, d)), walls);
  body.position.y = h / 2;
  g.add(body);
  // le pignon : un prisme sur le mur
  const rise = (d / 2) * Math.tan(pitch);
  const shape = new THREE.Shape([new THREE.Vector2(-d / 2, 0), new THREE.Vector2(d / 2, 0), new THREE.Vector2(0, rise)]);
  const gable = keep(new THREE.ExtrudeGeometry(shape, { depth: w, bevelEnabled: false }));
  gable.rotateY(Math.PI / 2);
  gable.translate(-w / 2, h, 0);
  g.add(new THREE.Mesh(gable, walls));
  const half = d / 2 / Math.cos(pitch) + over;
  const panel = keep(new THREE.BoxGeometry(w + over * 2, thick, half));
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(panel, roof);
    p.rotation.x = s * pitch;
    p.position.set(0, h + rise / 2 + 0.05, (s * (d / 2 + over * 0.3)) / 2);
    g.add(p);
  }
  g.userData.rise = rise;
  return g;
}

/** Une fenêtre ou une porte : un rectangle posé sur un mur (face +z). */
function opening(keep, into, mat, x, y, z, w, h) {
  const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(w, h)), mat);
  m.position.set(x, y, z + 0.01);
  into.add(m);
  return m;
}

/**
 * Habille le décor dehors (decor : sa version dehors) pour la famille de lieu look (AWAY_LOOKS), sous l'ambiance amb
 * (careAmbience : la saison, la neige, le brouillard). Renvoie { group, look, update(dt), dispose() }.
 */
export function dressAway(stage, decor, look, amb = null) {
  const L = AWAY_LOOKS[look];
  if (!L || !decor?.group) return null;
  const keep = bag();
  const g = new THREE.Group();
  g.name = `voyage ${look}`;
  decor.group.add(g);
  const season = amb?.season ?? 'summer';
  const winter = season === 'winter';
  const r = rng(look.length * 7 + 3);
  const box = animalBox(stage);
  const cx = (box.min.x + box.max.x) / 2;
  // (le fond commence derrière la clôture du fond du décor, loin derrière lui)
  const zb = Math.min(decor.dims?.back ?? box.min.z - 0.6, box.min.z - 0.6);
  const steps = [];
  const inst = instancer(keep, g);
  // (une matière par couleur : les arbres de même couleur vont dans la même instance)
  const matMemo = new Map();
  const mat = (color, o = {}) => {
    const k = `${color}|${JSON.stringify(o)}`;
    if (!matMemo.has(k)) matMemo.set(k, keep(new THREE.MeshStandardMaterial({ color, roughness: 0.9, flatShading: true, ...o })));
    return matMemo.get(k);
  };
  const skyLow = new THREE.Color(amb?.skyLow ?? 0xe6eef2);
  const thick = !!(amb?.foggy);
  // (au loin, la brume du ciel : les sommets se voient toujours un peu, sauf dans le brouillard)
  const hazed = (c, k) => {
    const col = new THREE.Color(c).lerp(skyLow, amb?.snowy || amb?.wet ? Math.min(0.75, k + 0.3) : k);
    return keep(new THREE.MeshStandardMaterial({ color: col, roughness: 1, flatShading: true, fog: thick }));
  };

  // ---------------------------------------------------------------- ce qu'on cache : les arbres et collines de la ferme
  const hidden = [];
  decor.group.traverse((o) => {
    if (o.userData?.far && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  });

  // ---------------------------------------------------------------- le sol
  const G = GROUND[L.ground] ?? {};
  const mats = (decor.ground ?? []).filter(Boolean);
  const main = mats.find((m) => m.userData?.main) ?? mats[0] ?? null;
  const tuft = mats.find((m) => m.userData?.tuft) ?? null;
  const saved = [main, tuft].filter(Boolean).map((m) => ({ m, color: m.color.clone(), map: m.map }));
  if (main && G.sand) {
    const st = keep(sandTexture(look === 'bush' ? 9 : 4));
    st.repeat.set(14, 14);
    main.map = st;
    main.color.set(G.sand);
    main.needsUpdate = true;
  } else if (main && G.tint) main.color.set(G.tint);
  if (tuft && G.tuft) tuft.color.set(G.tuft);
  if (G.grass === false || G.flowers === false) {
    decor.group.traverse((o) => {
      if (!o.userData?.grass || !o.visible) return;
      // (le sable, la terre rouge : ni herbe ni fleurs ; la terre sèche, la mousse : l'herbe sans fleurs)
      const isTuft = o.material === tuft;
      if (G.grass === false || !isTuft) {
        o.visible = false;
        hidden.push(o);
      }
    });
  }

  // ---------------------------------------------------------------- les arbres (en instances)
  const trunk = mat(0x5b4330);
  const crownGeo = keep(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.14, 4, 2.4));
  const coneGeo = keep(new THREE.ConeGeometry(1, 2.4, 8));
  const trunkGeo = keep(new THREE.CylinderGeometry(0.1, 0.16, 1, 6));
  trunkGeo.translate(0, 0.5, 0);
  const snowCap = winter || amb?.snowy ? mat(0xf2f6fa) : null;
  function tree(kind, x, z, s = 1) {
    switch (kind) {
      case 'sapin': {
        inst.add(trunkGeo, trunk, [x, 0, z], [s, s * 0.8, s]);
        const m = mat(0x2f5a3a);
        inst.add(coneGeo, m, [x, 1.6 * s, z], [0.9 * s, s, 0.9 * s]);
        inst.add(coneGeo, m, [x, 2.6 * s, z], [0.65 * s, 0.8 * s, 0.65 * s]);
        if (snowCap) inst.add(coneGeo, snowCap, [x, 3.2 * s, z], [0.3 * s, 0.32 * s, 0.3 * s]);
        return;
      }
      case 'pin': {
        // (le pin parasol, le pin des plages : un grand tronc, une couronne plate)
        inst.add(trunkGeo, trunk, [x, 0, z], [0.8 * s, 3.2 * s, 0.8 * s], 0, 0, (r() - 0.5) * 0.2);
        const m = mat(0x3f6a34);
        inst.add(crownGeo, m, [x, 3.3 * s, z], [1.6 * s, 0.55 * s, 1.4 * s]);
        inst.add(crownGeo, m, [x + 0.7 * s, 3.05 * s, z + 0.2], [0.9 * s, 0.4 * s, 0.8 * s]);
        return;
      }
      case 'bouleau': {
        inst.add(trunkGeo, mat(0xe8e4dc), [x, 0, z], [0.55 * s, 2.6 * s, 0.55 * s]);
        if (BIRCH[season]) inst.add(crownGeo, mat(BIRCH[season]), [x, 2.6 * s, z], [0.7 * s, 1.1 * s, 0.7 * s]);
        return;
      }
      case 'cerisier': {
        inst.add(trunkGeo, mat(0x4a3428), [x, 0, z], [0.8 * s, 1.5 * s, 0.8 * s], 0, 0, (r() - 0.5) * 0.3);
        const c = CHERRY[season];
        if (c) for (let j = 0; j < 3; j++) inst.add(crownGeo, mat(c), [x + (j - 1) * 0.7 * s, (1.9 + r() * 0.4) * s, z + (r() - 0.5) * 0.6], 0.85 * s);
        return;
      }
      case 'olivier': {
        inst.add(trunkGeo, mat(0x6a5a48), [x, 0, z], [1.1 * s, 1.1 * s, 1.1 * s], 0, 0, (r() - 0.5) * 0.4);
        const m = mat(0x8a9a6a);
        inst.add(crownGeo, m, [x - 0.4 * s, 1.5 * s, z], [0.9 * s, 0.6 * s, 0.9 * s]);
        inst.add(crownGeo, m, [x + 0.4 * s, 1.6 * s, z + 0.2], [0.8 * s, 0.55 * s, 0.8 * s]);
        return;
      }
      case 'cypres': {
        inst.add(coneGeo, mat(0x2a4a2a), [x, 2.2 * s, z], [0.45 * s, 1.9 * s, 0.45 * s]);
        return;
      }
      case 'eucalyptus': {
        inst.add(trunkGeo, mat(0xd8d0c0), [x, 0, z], [0.7 * s, 3.4 * s, 0.7 * s], 0, 0, (r() - 0.5) * 0.25);
        const m = mat(0x7a9a80);
        for (let j = 0; j < 3; j++) inst.add(crownGeo, m, [x + (r() - 0.5) * 1.4 * s, (3 + r() * 0.9) * s, z + (r() - 0.5) * 0.8], [0.8 * s, 0.5 * s, 0.8 * s]);
        return;
      }
      case 'ombu': {
        inst.add(trunkGeo, trunk, [x, 0, z], [2.4 * s, 1.8 * s, 2.4 * s]);
        const m = mat(LEAVES[season] ?? 0x4f7a34);
        for (let j = 0; j < 5; j++) inst.add(crownGeo, m, [x + (j - 2) * 1.2 * s, (2.4 + r() * 0.6) * s, z + (r() - 0.5) * 1.2], [1.4 * s, 1 * s, 1.3 * s]);
        return;
      }
      default: {
        inst.add(trunkGeo, trunk, [x, 0, z], [s, 1.8 * s, s]);
        const c = LEAVES[season];
        if (c) for (let j = 0; j < 3; j++) inst.add(crownGeo, mat(c), [x + (r() - 0.5) * 1.1 * s, (2.2 + r() * 0.8) * s, z + (r() - 0.5) * 0.8], (0.9 + r() * 0.4) * s);
      }
    }
  }
  const treeKind = { pin: 'pin', sapin: 'sapin', bouleau: 'bouleau', cerisier: 'cerisier', olivier: 'olivier', eucalyptus: 'eucalyptus', ombu: 'feuillu', feuillu: 'feuillu' }[L.trees] ?? 'feuillu';
  const nTrees = { plage: 6, montagne: 14, volcan: 5, rocheuses: 9, pampa: 3, japon: 9, mediterranee: 10, bush: 7, cottage: 9, haras: 8 }[look] ?? 8;
  for (let i = 0; i < nTrees; i++) {
    const x = cx + (i - (nTrees - 1) / 2) * (44 / nTrees) + (r() - 0.5) * 2;
    const z = zb - 11 - r() * 8;
    // (la plage : les pins sur les côtés, la mer au milieu)
    if (look === 'plage' && Math.abs(x - cx) < 9) continue;
    const s = 0.8 + r() * 0.5;
    tree(look === 'mediterranee' && i % 3 === 1 ? 'cypres' : treeKind, x, z, s);
  }
  if (L.trees === 'ombu') tree('ombu', cx - 9, zb - 14, 1.3);

  // ---------------------------------------------------------------- au loin : la mer, les sommets, le volcan, les collines
  const far = new Set(L.far);
  if (far.has('mer')) {
    const shore = zb - 7;
    const seaCol = new THREE.Color(winter || amb?.wet ? 0x4a6a80 : 0x3f86b8).lerp(skyLow, 0.2);
    const sea = new THREE.Mesh(keep(new THREE.PlaneGeometry(140, 80)), keep(new THREE.MeshStandardMaterial({ color: seaCol, roughness: 0.25, metalness: 0.1 })));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(cx, 0.03, shore - 40);
    sea.receiveShadow = false;
    g.add(sea);
    // (le sable mouillé au bord, plus foncé, et l'écume qui va et vient)
    const wet = new THREE.Mesh(keep(new THREE.PlaneGeometry(140, 1.6)), keep(new THREE.MeshStandardMaterial({ color: 0xc8b48c, roughness: 0.5, transparent: true, opacity: 0.8, depthWrite: false })));
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(cx, 0.02, shore + 0.5);
    g.add(wet);
    const ft = keep(foamTexture());
    ft.repeat.set(10, 1);
    const foam = new THREE.Mesh(keep(new THREE.PlaneGeometry(140, 0.9)), keep(new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, color: 0xffffff })));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(cx, 0.04, shore);
    foam.renderOrder = 2;
    g.add(foam);
    let t = 0;
    steps.push((dt) => {
      t += dt;
      ft.offset.x = (ft.offset.x + dt * 0.01) % 1;
      foam.position.z = shore + Math.sin(t * 0.6) * 0.35;
    });
    // un voilier au large, qui se balance
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(keep(new THREE.BoxGeometry(1.6, 0.35, 0.5)), mat(0xf4f0e8));
    hull.position.y = 0.15;
    boat.add(hull);
    const sail = new THREE.Mesh(keep(new THREE.ShapeGeometry(new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(1.1, 0), new THREE.Vector2(0, 2.2)]))), keep(new THREE.MeshStandardMaterial({ color: 0xfaf6ee, side: THREE.DoubleSide, roughness: 0.8 })));
    sail.position.set(-0.4, 0.35, 0);
    boat.add(sail);
    const mast = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, 2.4, 5)), trunk);
    mast.position.set(-0.42, 1.5, 0);
    boat.add(mast);
    boat.position.set(cx + 6, 0, shore - 22);
    g.add(boat);
    steps.push((dt) => {
      boat.rotation.z = Math.sin(t * 0.9) * 0.05;
      boat.position.y = Math.sin(t * 1.1) * 0.05;
      boat.position.x = cx + 6 + Math.sin(t * 0.05) * 3;
    });
  }
  if (far.has('dunes')) {
    const dm = mat(0xe8d6b0);
    const dg = keep(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2));
    for (const s of [-1, 1]) inst.add(dg, dm, [cx + s * (12 + r() * 4), -0.1, zb - 6 - r() * 3], [6 + r() * 3, 1.2 + r() * 0.6, 3]);
  }
  if (far.has('sommets')) {
    // (les sommets : un cône de roche, son chapeau de neige ; plus de neige l'hiver)
    const rock = hazed(look === 'rocheuses' ? 0x6a7888 : 0x7a8290, 0.35);
    const snow = hazed(0xf6f8fc, 0.2);
    const peak = keep(lumpy(new THREE.ConeGeometry(1, 1, 7, 3), 0.04, 3, 3));
    const n = look === 'rocheuses' ? 7 : 6;
    for (let i = 0; i < n; i++) {
      const x = cx + (i - (n - 1) / 2) * 11 + (r() - 0.5) * 5;
      const z = Math.max(-38, zb - 26 - r() * 8);
      const h = (look === 'rocheuses' ? 8 : 11) + r() * 6;
      const w = h * (0.6 + r() * 0.2);
      const capK = winter ? 0.55 : 0.32;
      const p = new THREE.Mesh(peak, rock);
      p.scale.set(w, h, w * 0.8);
      p.position.set(x, h / 2 - 0.3, z);
      p.rotation.y = r() * 3;
      g.add(p);
      const c = new THREE.Mesh(peak, snow);
      c.scale.set(w * capK * 1.04, h * capK, w * capK * 0.84);
      c.position.set(x, h - (h * capK) / 2 - 0.29, z);
      c.rotation.y = p.rotation.y;
      g.add(c);
    }
  }
  if (far.has('volcan')) {
    const vm = hazed(0x4e4844, 0.3);
    const vg = keep(lumpy(new THREE.CylinderGeometry(1.6, 11, 9, 12, 3, true), 0.2, 5, 1.2));
    const v = new THREE.Mesh(vg, vm);
    v.position.set(cx + 8, 4.2, Math.max(-37, zb - 28));
    g.add(v);
    // (la fumée : des bouffées grises qui montent, s'élargissent, dérivent avec le vent et s'effacent)
    const puffTex = keep(softDot('255,255,255', 64));
    const puffs = [];
    for (let i = 0; i < 10; i++) {
      const sm = keep(new THREE.SpriteMaterial({ map: puffTex, color: 0x9a9a9e, transparent: true, depthWrite: false, fog: thick }));
      const s = new THREE.Sprite(sm);
      g.add(s);
      puffs.push({ s, k: i / 10, j: (r() - 0.5) * 0.8 });
    }
    steps.push((dt) => {
      for (const p of puffs) {
        p.k = (p.k + dt * 0.025) % 1;
        p.s.position.set(v.position.x + p.k * 5 + p.j, v.position.y + 4.4 + p.k * 6, v.position.z);
        p.s.scale.setScalar(1.6 + p.k * 4);
        p.s.material.opacity = 0.5 * Math.min(1, p.k * 6) * (1 - p.k);
      }
    });
    steps.at(-1)(0);
  }
  if (far.has('rocher')) {
    // (un grand rocher rouge au loin, posé sur la plaine)
    const rm = hazed(0xb8582e, 0.25);
    const rg = keep(lumpy(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.05, 7, 3));
    const rk = new THREE.Mesh(rg, rm);
    rk.scale.set(12, 4.5, 5);
    rk.position.set(cx - 10, -0.2, Math.max(-36, zb - 27));
    g.add(rk);
  }
  if (far.has('collines') || far.has('plaine') || far.has('sommets')) {
    const hc = { volcan: 0x6a7a5a, mediterranee: 0xb0a070, bush: 0xb0704a, rocheuses: 0x8a9a64, pampa: 0x9aa868, japon: 0x5a8a4c }[look] ?? 0x7c9f5c;
    const hm = hazed(winter && look !== 'bush' && look !== 'mediterranee' ? 0xd8dee4 : hc, 0.15);
    const hg = keep(new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2));
    const flat = far.has('plaine');
    for (let i = 0; i < 5; i++) inst.add(hg, hm, [cx + (i - 2) * 11 + (r() - 0.5) * 4, -0.2, zb - 19 - r() * 4], [10 + r() * 6, flat ? 0.6 + r() * 0.4 : 1.6 + r() * 2.2, 6]);
  }

  // ---------------------------------------------------------------- la construction du pays (à gauche, au loin)
  const lx = cx - 6.5;
  const lz = zb - 9.5;
  const dark = mat(0x2a2420);
  const glass = mat(0x8ab0c8, { roughness: 0.3 });
  let mark = null;
  switch (L.landmark) {
    case 'cabane': {
      const walls = keep(new THREE.MeshStandardMaterial({ map: keep(stripeTexture('#3a78c0')), roughness: 0.8 }));
      for (const [k, dx] of [[0, 0], [1, 2.4]]) {
        const hm = k ? keep(new THREE.MeshStandardMaterial({ map: keep(stripeTexture('#d84a3a')), roughness: 0.8 })) : walls;
        const h = house(keep, { w: 1.8, d: 1.6, h: 1.9, walls: hm, roof: mat(0xf2ece0), pitch: 0.6, over: 0.15, thick: 0.08 });
        h.position.set(lx + dx - 6, 0, lz + 2.5);
        h.rotation.y = 0.25;
        opening(keep, h, dark, 0, 0.75, 0.8, 0.7, 1.4);
        g.add(h);
      }
      // (un parasol planté dans le sable)
      const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, 2, 5)), mat(0xe8e0d0));
      const um = new THREE.Mesh(keep(new THREE.ConeGeometry(1.1, 0.45, 10, 1, true)), keep(new THREE.MeshStandardMaterial({ map: keep(stripeTexture('#f0a83a')), side: THREE.DoubleSide, roughness: 0.8 })));
      pole.position.set(cx + 5, 1, zb - 4);
      um.position.set(cx + 5, 2, zb - 4);
      g.add(pole, um);
      break;
    }
    case 'chalet': {
      const wood = keep(barnWood(41, false, 'warm'));
      wood.repeat.set(2, 2);
      const h = house(keep, { w: 5.5, d: 4.5, h: 3.2, walls: keep(new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 })), roof: snowCap ?? mat(0x5a3a2a), pitch: 0.42, over: 0.8, thick: 0.22 });
      const stone = keep(stoneTexture('#9a9488', 8));
      stone.repeat.set(3, 0.6);
      const base = new THREE.Mesh(keep(new THREE.BoxGeometry(5.6, 0.9, 4.6)), keep(new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 })));
      base.position.y = 0.45;
      h.add(base);
      // (le balcon, les volets, les géraniums)
      const bal = new THREE.Mesh(keep(new THREE.BoxGeometry(5.8, 0.5, 0.12)), mat(0x6a4a30));
      bal.position.set(0, 2.1, 2.6);
      h.add(bal);
      for (const x of [-1.6, 0, 1.6]) {
        opening(keep, h, glass, x, 2.6, 2.25, 0.8, 0.8);
        const fl = new THREE.Mesh(keep(new THREE.BoxGeometry(0.8, 0.14, 0.18)), mat(season === 'winter' ? 0x6a4a30 : 0xd83a3a));
        fl.position.set(x, 2.42, 2.7);
        h.add(fl);
      }
      opening(keep, h, dark, 0, 1.0, 2.25, 1, 1.9);
      h.position.set(lx, 0, lz - 2);
      h.rotation.y = 0.3;
      g.add(h);
      break;
    }
    case 'tourbe': {
      // (la maison au toit d'herbe : pignon blanc, toit couvert de mousse)
      const h = house(keep, { w: 3.2, d: 3, h: 1.4, walls: mat(0xece8de), roof: mat(winter ? 0xe8eef2 : 0x6a8a4a), pitch: 0.65, over: 0.2, thick: 0.4 });
      opening(keep, h, mat(0xb03a2a), 0, 0.6, 1.5, 0.6, 1.2);
      h.position.set(lx, 0, lz);
      h.rotation.y = 0.35;
      g.add(h);
      break;
    }
    case 'grange': {
      const h = house(keep, { w: 6, d: 4.5, h: 3.4, walls: mat(0xa8342a), roof: snowCap ?? mat(0x4a4a4e), pitch: 0.6, over: 0.3 });
      const trim = mat(0xf2ece0);
      for (const sx of [-1, 1]) {
        const s = new THREE.Mesh(keep(new THREE.BoxGeometry(0.14, 2.3, 0.05)), trim);
        s.position.set(sx * 0.95, 1.15, 2.27);
        h.add(s);
      }
      for (const a of [0.9, -0.9]) {
        const d = new THREE.Mesh(keep(new THREE.BoxGeometry(2.6, 0.12, 0.05)), trim);
        d.position.set(0, 1.15, 2.28);
        d.rotation.z = a;
        h.add(d);
      }
      h.position.set(lx, 0, lz - 1);
      h.rotation.y = 0.35;
      g.add(h);
      break;
    }
    case 'estancia': {
      const h = house(keep, { w: 7, d: 4, h: 2.4, walls: mat(0xf2ede2), roof: mat(0xb4603a), pitch: 0.3, over: 0.5 });
      for (const x of [-2.2, 0, 2.2]) opening(keep, h, dark, x, 1.0, 2, 0.9, 1.6);
      h.position.set(lx - 2, 0, lz - 3);
      h.rotation.y = 0.2;
      g.add(h);
      mark = windPump(keep, 5);
      mark.position.set(cx + 7, 0, zb - 11);
      break;
    }
    case 'torii': {
      const red = mat(0xc8402a);
      const t = new THREE.Group();
      const post = keep(new THREE.CylinderGeometry(0.16, 0.18, 3.4, 10));
      for (const sx of [-1, 1]) {
        const p = new THREE.Mesh(post, red);
        p.position.set(sx * 1.3, 1.7, 0);
        t.add(p);
      }
      const top = new THREE.Mesh(keep(new THREE.BoxGeometry(3.9, 0.22, 0.34)), dark);
      top.position.y = 3.45;
      t.add(top);
      const top2 = new THREE.Mesh(keep(new THREE.BoxGeometry(3.6, 0.2, 0.3)), red);
      top2.position.y = 3.25;
      t.add(top2);
      const tie = new THREE.Mesh(keep(new THREE.BoxGeometry(3, 0.16, 0.2)), red);
      tie.position.y = 2.65;
      t.add(tie);
      t.position.set(lx + 1, 0, lz + 1);
      t.rotation.y = 0.25;
      g.add(t);
      // (une petite pagode au loin)
      const pg = new THREE.Group();
      const pw = mat(0x8a3a2a);
      const pr = mat(0x3a3a40);
      for (let i = 0; i < 3; i++) {
        const w = 2.4 - i * 0.5;
        const b = new THREE.Mesh(keep(new THREE.BoxGeometry(w * 0.7, 1, w * 0.7)), pw);
        b.position.y = 0.5 + i * 1.3;
        const rf = new THREE.Mesh(keep(new THREE.ConeGeometry(w * 0.85, 0.5, 4)), pr);
        rf.position.y = 1.2 + i * 1.3;
        rf.rotation.y = Math.PI / 4;
        pg.add(b, rf);
      }
      pg.position.set(cx + 8, 0, zb - 16);
      g.add(pg);
      break;
    }
    case 'hacienda': {
      const h = house(keep, { w: 8, d: 4.5, h: 2.8, walls: mat(0xf6f2ea), roof: mat(0xc0643a), pitch: 0.28, over: 0.4 });
      for (const x of [-2.8, -1, 1, 2.8]) {
        const arch = new THREE.Mesh(keep(new THREE.CircleGeometry(0.55, 12, 0, Math.PI)), dark);
        arch.position.set(x, 1.6, 2.26);
        h.add(arch);
        opening(keep, h, dark, x, 0.8, 2.25, 1.1, 1.6);
      }
      h.position.set(lx - 1, 0, lz - 2);
      h.rotation.y = 0.2;
      g.add(h);
      break;
    }
    case 'eolienne': {
      mark = windPump(keep, 6);
      mark.position.set(lx, 0, lz);
      const tank = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.1, 1.1, 1.4, 14)), mat(0xb8bec4, { metalness: 0.4, roughness: 0.5 }));
      tank.position.set(lx + 2.2, 0.7, lz + 0.5);
      g.add(tank);
      // un kangourou qui saute au loin, va et vient
      const kg = new THREE.Group();
      const fur = mat(0xa86a3a);
      const body = new THREE.Mesh(keep(new THREE.SphereGeometry(0.35, 10, 8)), fur);
      body.scale.set(1, 1.4, 0.8);
      body.position.y = 0.7;
      body.rotation.z = -0.4;
      const head = new THREE.Mesh(keep(new THREE.SphereGeometry(0.15, 8, 6)), fur);
      head.position.set(0.25, 1.2, 0);
      head.scale.set(1.4, 1, 0.9);
      const tl = new THREE.Mesh(keep(new THREE.ConeGeometry(0.1, 0.9, 6)), fur);
      tl.position.set(-0.45, 0.35, 0);
      tl.rotation.z = 1.1;
      for (const s of [-1, 1]) {
        const ear = new THREE.Mesh(keep(new THREE.ConeGeometry(0.05, 0.18, 4)), fur);
        ear.position.set(0.2, 1.35, s * 0.06);
        kg.add(ear);
      }
      kg.add(body, head, tl);
      const kgo = new THREE.Group();
      kgo.add(kg);
      kgo.position.set(cx + 4, 0, zb - 13);
      g.add(kgo);
      let t = 0;
      steps.push((dt) => {
        t += dt;
        const k = t % 14;
        const dir = k < 7 ? 1 : -1;
        const ph = k < 7 ? k / 7 : (14 - k) / 7;
        kg.position.x = (ph - 0.5) * 8;
        kg.rotation.y = dir > 0 ? 0 : Math.PI;
        kg.position.y = Math.abs(Math.sin(t * 4.5)) * 0.45;
      });
      break;
    }
    case 'cottage': {
      const stone = keep(stoneTexture('#d0b078', 11));
      stone.repeat.set(3, 1.2);
      const sm = keep(new THREE.MeshStandardMaterial({ map: stone, roughness: 0.95 }));
      const h = house(keep, { w: 5, d: 3.6, h: 2.4, walls: sm, roof: snowCap ?? mat(0x6a6a70), pitch: 0.75, over: 0.25 });
      for (const x of [-1.4, 1.4]) opening(keep, h, glass, x, 1.4, 1.8, 0.6, 0.7);
      opening(keep, h, mat(0x3a5a3a), 0, 0.9, 1.8, 0.8, 1.6);
      const ch = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 1.4, 0.5)), sm);
      ch.position.set(1.8, 3.4, 0);
      h.add(ch);
      h.position.set(lx, 0, lz - 1);
      h.rotation.y = 0.3;
      g.add(h);
      // (le muret de pierres sèches qui traverse le pré, et une haie)
      const wallTex = keep(stoneTexture('#b8a070', 12));
      wallTex.repeat.set(16, 0.5);
      const wall = new THREE.Mesh(keep(new THREE.BoxGeometry(40, 0.8, 0.5)), keep(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 })));
      wall.position.set(cx, 0.4, zb - 5.5);
      g.add(wall);
      const hedge = mat(winter ? 0x5a6a4a : 0x3f6a34);
      const hg = keep(lumpy(new THREE.BoxGeometry(1, 1, 1, 4, 2, 2), 0.08, 9, 3));
      for (let i = 0; i < 5; i++) inst.add(hg, hedge, [cx + (i - 2) * 7 + 4, 0.7, zb - 13], [6, 1.4, 1.2]);
      break;
    }
    case 'haras': {
      // (la grande écurie au clocheton, les clôtures blanches)
      const h = house(keep, { w: 9, d: 5, h: 3, walls: mat(0x2f4a3a), roof: snowCap ?? mat(0x3a3a3e), pitch: 0.45, over: 0.3 });
      const white = mat(0xf6f4ee);
      for (const x of [-3, -1, 1, 3]) opening(keep, h, white, x, 1.2, 2.5, 1.1, 2);
      const cup = new THREE.Mesh(keep(new THREE.BoxGeometry(0.9, 0.9, 0.9)), white);
      cup.position.y = 3 + h.userData.rise + 0.5;
      const cupRoof = new THREE.Mesh(keep(new THREE.ConeGeometry(0.8, 0.7, 4)), mat(0x3a7a5a));
      cupRoof.position.y = cup.position.y + 0.75;
      cupRoof.rotation.y = Math.PI / 4;
      h.add(cup, cupRoof);
      h.position.set(lx - 1, 0, lz - 3);
      h.rotation.y = 0.25;
      g.add(h);
      const board = keep(new THREE.BoxGeometry(1, 0.14, 0.05));
      const postG = keep(new THREE.BoxGeometry(0.12, 1.3, 0.12));
      for (const z of [zb - 5, zb - 12]) {
        for (let i = 0; i < 18; i++) {
          const x = cx - 22 + i * 2.6;
          inst.add(postG, white, [x, 0.6, z]);
          for (const y of [0.45, 0.8, 1.15]) inst.add(board, white, [x + 1.3, y, z], [2.6, 1, 1]);
        }
      }
      break;
    }
    default:
      break;
  }
  if (mark) g.add(mark);
  if (mark?.userData.step) steps.push(mark.userData.step);
  inst.done();
  g.traverse((o) => {
    if (o.isMesh && !o.isInstancedMesh) {
      o.castShadow = false;
      o.receiveShadow = true;
    }
  });

  return {
    group: g,
    look,
    update(dt) {
      for (const s of steps) s(Math.min(dt, 0.1));
    },
    dispose() {
      for (const s of saved) {
        s.m.color.copy(s.color);
        if (s.m.map !== s.map) {
          s.m.map = s.map;
          s.m.needsUpdate = true;
        }
      }
      for (const o of hidden) o.visible = true;
      g.parent?.remove(g);
      g.traverse((o) => {
        if (o.isInstancedMesh) o.dispose();
      });
      keep.dispose();
    },
  };
}

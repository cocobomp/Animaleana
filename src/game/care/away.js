// En voyage, le décor dehors d'un soin montre le lieu du voyage (la famille du lieu : awayLook, AWAY_LOOKS dans
// setting.js) : le sable et la mer au loin à la plage, les sommets enneigés, les sapins et un chalet à la montagne, le
// volcan qui fume en Islande, les Rocheuses et la grange rouge en Alberta, l'éolienne et l'estancia dans la Pampa, les
// cerisiers et le portail rouge à Kyoto, les oliviers et l'hacienda en Andalousie, la terre rouge et les eucalyptus du
// bush, les murets de pierre des Cotswolds, les clôtures blanches du Kentucky, le bocage normand (pommiers, haies,
// longère à colombages, vaches au loin).
//
// dressAway(stage, decor, look, amb) habille un décor dehors déjà construit (stallSet, barnSet, homeSet, hutchSet
// avec leur version dehors, le pré de la balle, le rond de longe) : cache ses arbres et ses collines au loin
// (userData.far), change la couleur du sol, ajoute le fond du lieu (loin derrière l'animal : il ne le cache jamais ; au
// rond de longe, tout autour, la caméra en fait le tour). La saison et la neige le suivent (un seul drapeau « blanc »),
// la nuit l'assombrit. Tout est fait en code, en peu de pièces (les arbres en instances), sans ombres (le soleil n'ombre
// que les abords de l'animal), allégé en qualité basse, et tout est libéré par dispose() (le sol retrouve sa couleur).

import * as THREE from 'three';
import { canvasTex, rng, softDot } from './textures.js';
import { bag, barnWood, lumpy } from './barnProps.js';
import { stoneTexture } from './outdoor.js';
import { sandTexture } from './roundPen.js';
import { animalBox } from './extras.js';
import { AWAY_LOOKS, WHITE_WINTER } from './setting.js';

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
const APPLE = { spring: 0xf4e2e8, summer: 0x5a8a3a, autumn: 0x8a9a3a, winter: null };

/**
 * Tout près, juste derrière la clôture du fond : deux ou trois choses du pays ([sorte, côté, profondeur] en mètres pour
 * un chien moyen ; un peu plus loin d'un cheval, un peu plus près d'un lapin). Le côté négatif est vers sa queue.
 */
const NEAR = {
  plage: [['brisevent', -2.6, 0.6], ['chateau', -1.1, 0.35], ['oyats', 2.0, 0.7]],
  montagne: [['rocher', -2.4, 0.6], ['panneau', -1.0, 0.45], ['sapineau', 2.1, 0.8]],
  volcan: [['lave', -2.3, 0.6], ['cairn', -0.9, 0.4], ['lave', 2.1, 0.7]],
  rocheuses: [['tronc', -2.2, 0.6], ['barriere', 2.0, 0.8]],
  pampa: [['herbes', -2.4, 0.6], ['herbes', 2.0, 0.8]],
  japon: [['bambous', -2.6, 0.7], ['pas', -1.0, 0.35]],
  mediterranee: [['jarre', -2.2, 0.6], ['lavande', -0.8, 0.4], ['lavande', 2.0, 0.7]],
  bush: [['termitiere', -2.4, 0.7], ['spinifex', -0.9, 0.4], ['spinifex', 2.0, 0.7]],
  cottage: [['portillon', -2.2, 0.6], ['digitales', 2.0, 0.7]],
  haras: [['obstacle', -2.4, 0.9], ['barriere', 2.0, 0.7]],
  normandie: [['cagette', -2.0, 0.5], ['bidon', -0.9, 0.4]],
};

/** Ce que la lumière n'éclaire pas (l'écume, la fumée) : sa force selon le moment (la nuit, presque éteint). */
const UNLIT = { matin: 0.92, jour: 1, soir: 0.72, nuit: 0.2 };

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
      q.setFromEuler(e.set(rx, ry, rz, 'YXZ'));
      map.get(k).list.push(m4.compose(V(...p), q, V(...(Array.isArray(s) ? s : [s, s, s]))).clone());
    },
    done() {
      for (const { geo, mat, list } of map.values()) {
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((m, i) => im.setMatrixAt(i, m));
        // (loin de l'animal : le soleil n'y ombre rien, la carte des ombres n'y est pas lue)
        im.castShadow = false;
        im.receiveShadow = false;
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

/** Les colombages d'une longère : l'enduit clair, les poutres brunes (montants, sablières, quelques croix). */
function timberTexture() {
  return canvasTex(256, 64, (c) => {
    c.fillStyle = '#efe6d2';
    c.fillRect(0, 0, 256, 64);
    c.fillStyle = '#4a3424';
    c.fillRect(0, 0, 256, 5);
    c.fillRect(0, 59, 256, 5);
    c.fillRect(0, 30, 256, 3);
    for (let x = 0; x < 256; x += 21) c.fillRect(x, 0, 4, 64);
    c.lineWidth = 3;
    c.strokeStyle = '#4a3424';
    for (let x = 21; x < 256; x += 63) {
      c.beginPath();
      c.moveTo(x, 33);
      c.lineTo(x + 21, 59);
      c.moveTo(x + 21, 33);
      c.lineTo(x, 59);
      c.stroke();
    }
  }, { key: 'colombages' });
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

/** Une maison simple : murs (matière walls, gable pour les pignons), toit à deux pans (matière roof). w, d, h : ses tailles. */
function house(keep, { w = 5, d = 4, h = 2.6, walls, gable: gableMat = null, roof, pitch = 0.5, over = 0.4, thick = 0.16 }) {
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
  g.add(new THREE.Mesh(gable, gableMat ?? walls));
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
 * (careAmbience : l'heure, la saison, la neige, la pluie, le brouillard). Renvoie { group, look, shore, landmarks,
 * update(dt, stage), dispose() } (shore : le bord de la mer, z ; landmarks : les constructions qu'on garde hors de sa
 * tête dans l'image).
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
  // (blanc : quand il neige ; l'hiver aussi en montagne, en Islande, dans les Rocheuses — ailleurs, un hiver sans neige
  // garde ses collines et ses toits de tous les jours)
  const white = !!amb?.snowy || (winter && WHITE_WINTER.has(look));
  // (au téléphone, en qualité basse : moitié moins d'arbres, moins de fumée, rien d'animé au loin)
  const high = !!stage?.high;
  const r = rng(look.length * 7 + 3);
  const box = animalBox(stage);
  // Où va le fond. Derrière l'animal, en bande face à la caméra (les soins, la balle de la chèvre) : il commence
  // derrière la clôture ou le mur du fond du décor. Au rond de longe, tout autour, au-delà de la clôture : la caméra
  // en fait le tour avec le cheval.
  const ring = decor.kind === 'roundPen' ? Math.max(3, decor.dims?.F ?? 5) + 4 : 0;
  const cx = ring ? 0 : (box.min.x + box.max.x) / 2;
  const zb = Math.min(decor.dims?.back ?? decor.room?.back ?? box.min.z - 0.6, box.min.z - 0.6);
  /** Une place du fond : side (m, sur le côté), depth (m, au-delà du bord) → { x, z, ry } (ry : tourné vers nous). */
  const at = (side, depth) => {
    if (!ring) return { x: cx + side, z: zb - depth, ry: 0 };
    const R = ring + depth;
    const a = side / R;
    return { x: Math.sin(a) * R, z: -Math.cos(a) * R, ry: -a };
  };
  /** Le côté du i-ième de n : sur une largeur w derrière lui, ou sur tout le tour du rond. */
  const spread = (i, n, w, depth) => (ring ? ((i + 0.5) / n - 0.5) * Math.PI * 2 * (ring + depth) : (i - (n - 1) / 2) * (w / n));
  /** Combien en poser : plus tout autour du rond, moitié moins en qualité basse. */
  const many = (n) => Math.max(1, Math.round(n * (ring ? 3 : 1) * (high ? 1 : 0.5)));
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
  // (l'écume, la fumée : la lumière ne les éclaire pas, on les assombrit à la main — sinon, la nuit, elles brillent)
  const night = amb?.time === 'nuit';
  const unlitK = (UNLIT[amb?.time] ?? 1) * (amb?.wet ? 0.8 : 1);
  const unlit = (c) => new THREE.Color(c).multiplyScalar(unlitK).lerp(skyLow, night ? 0.25 : 0.1);

  // ---------------------------------------------------------------- ce qu'on cache : les arbres et collines de la ferme
  const hidden = [];
  decor.group.traverse((o) => {
    if (o.userData?.far && o.visible) {
      o.visible = false;
      hidden.push(o);
    }
  });
  if (ring) {
    // (au rond de longe, rien n'est marqué : ce qui est loin de la clôture — l'écurie, les arbres, les collines — est
    // caché ; le sol, la clôture, la paille et le seau restent)
    const lim = ring - 2;
    const p = V();
    const m4 = new THREE.Matrix4();
    const farOff = (o) => {
      if (!o.isInstancedMesh) return Math.hypot(o.position.x, o.position.z) > lim;
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m4);
        p.setFromMatrixPosition(m4);
        if (Math.hypot(p.x, p.z) <= lim) return false;
      }
      return o.count > 0;
    };
    for (const o of decor.group.children) {
      if (o === g || o.isLight || !o.visible || o.userData?.sky || o.userData?.grass || !(o.isMesh || o.isGroup)) continue;
      if (farOff(o)) {
        o.visible = false;
        hidden.push(o);
      }
    }
  }

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

  // ---------------------------------------------------------------- le bord de la mer (avant les arbres : rien dans l'eau)
  const far = new Set(L.far);
  // (la plage : sable, dunes, pins et cabanes entre la clôture et l'eau ; plus près d'un petit animal, dont la caméra
  // est au ras du sol : la mer y fait une vraie bande, pas un trait)
  const kSea = ring ? 1 : THREE.MathUtils.clamp((box.max.y - box.min.y) / 1.2, 0.45, 1);
  const shore = far.has('mer') ? at(0, 7 * kSea).z : null;
  const sx = ring ? 0 : cx;
  /** Ce point est-il sur la terre (pas dans la mer) ? */
  const onLand = (z, margin = 0.5) => shore === null || z > shore + margin;

  // ---------------------------------------------------------------- les arbres (en instances)
  const trunk = mat(0x5b4330);
  const crownGeo = keep(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.14, 4, 2.4));
  const coneGeo = keep(new THREE.ConeGeometry(1, 2.4, 8));
  const trunkGeo = keep(new THREE.CylinderGeometry(0.1, 0.16, 1, 6));
  trunkGeo.translate(0, 0.5, 0);
  const appleGeo = keep(new THREE.IcosahedronGeometry(1, 0));
  const snowCap = white ? mat(0xf2f6fa) : null;
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
        // (le pin parasol, le pin des plages : un grand tronc, une couronne plate ; sous la neige, un chapeau blanc)
        inst.add(trunkGeo, trunk, [x, 0, z], [0.8 * s, 3.2 * s, 0.8 * s], 0, 0, (r() - 0.5) * 0.2);
        const m = mat(0x3f6a34);
        inst.add(crownGeo, m, [x, 3.3 * s, z], [1.6 * s, 0.55 * s, 1.4 * s]);
        inst.add(crownGeo, m, [x + 0.7 * s, 3.05 * s, z + 0.2], [0.9 * s, 0.4 * s, 0.8 * s]);
        if (snowCap) inst.add(crownGeo, snowCap, [x, 3.6 * s, z], [1.35 * s, 0.22 * s, 1.15 * s]);
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
      case 'pommier': {
        // (le pommier du bocage : un tronc court et penché, une couronne large ; fleuri au printemps, des pommes rouges
        // l'été et l'automne, nu l'hiver)
        inst.add(trunkGeo, mat(0x5a4632), [x, 0, z], [0.9 * s, 1.3 * s, 0.9 * s], 0, 0, (r() - 0.5) * 0.35);
        const c = APPLE[season];
        if (!c) return;
        const m = mat(c);
        inst.add(crownGeo, m, [x - 0.45 * s, 1.75 * s, z], [1.0 * s, 0.75 * s, 0.95 * s]);
        inst.add(crownGeo, m, [x + 0.5 * s, 1.85 * s, z + 0.2 * s], [0.9 * s, 0.7 * s, 0.85 * s]);
        if (season === 'summer' || season === 'autumn') {
          for (let j = 0; j < 4; j++) {
            const a = r() * Math.PI * 2;
            inst.add(appleGeo, mat(0xc8322a), [x + Math.cos(a) * 0.95 * s, (1.55 + r() * 0.5) * s, z + Math.sin(a) * 0.9 * s], 0.1 * s);
          }
        }
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
  const treeKind = { pin: 'pin', sapin: 'sapin', bouleau: 'bouleau', cerisier: 'cerisier', olivier: 'olivier', eucalyptus: 'eucalyptus', pommier: 'pommier', ombu: 'feuillu', feuillu: 'feuillu' }[L.trees] ?? 'feuillu';
  const nTrees = many({ plage: 6, montagne: 14, volcan: 5, rocheuses: 9, pampa: 3, japon: 9, mediterranee: 10, bush: 7, cottage: 9, haras: 8, normandie: 9 }[look] ?? 8);
  const beach = look === 'plage';
  for (let i = 0; i < nTrees; i++) {
    // (la plage : les pins sur le sable, sur les côtés, entre la clôture et la mer — jamais dans l'eau)
    const depth = beach ? (1.5 + r() * 3.5) * kSea : 11 + r() * 8;
    const side = spread(i, nTrees, beach && !ring ? 52 : 44, depth) + (r() - 0.5) * 2;
    const s = 0.8 + r() * 0.5;
    if (beach && !ring && Math.abs(side) < 9) continue;
    const p = at(side, depth);
    if (!onLand(p.z, 1)) continue;
    tree(look === 'mediterranee' && i % 3 === 1 ? 'cypres' : treeKind, p.x, p.z, s);
  }
  if (L.trees === 'ombu') {
    const p = at(-9, 14);
    tree('ombu', p.x, p.z, 1.3);
  }

  // ---------------------------------------------------------------- au loin : la mer, les sommets, le volcan, les collines
  if (far.has('mer')) {
    const seaCol = new THREE.Color(winter || amb?.wet ? 0x4a6a80 : 0x3f86b8).lerp(skyLow, 0.2);
    const sea = new THREE.Mesh(keep(new THREE.PlaneGeometry(140, 80)), keep(new THREE.MeshStandardMaterial({ color: seaCol, roughness: 0.25, metalness: 0.1 })));
    sea.rotation.x = -Math.PI / 2;
    sea.position.set(sx, 0.03, shore - 40);
    sea.userData.sea = true;
    g.add(sea);
    // (le sable mouillé au bord, plus foncé, et l'écume qui va et vient)
    const wet = new THREE.Mesh(keep(new THREE.PlaneGeometry(140, 1.6)), keep(new THREE.MeshStandardMaterial({ color: 0xc8b48c, roughness: 0.5, transparent: true, opacity: 0.8, depthWrite: false })));
    wet.rotation.x = -Math.PI / 2;
    wet.position.set(sx, 0.02, shore + 0.5);
    g.add(wet);
    const ft = keep(foamTexture());
    ft.repeat.set(10, 1);
    const foam = new THREE.Mesh(keep(new THREE.PlaneGeometry(140, 0.9)), keep(new THREE.MeshBasicMaterial({ map: ft, transparent: true, depthWrite: false, color: unlit(0xffffff) })));
    foam.rotation.x = -Math.PI / 2;
    foam.position.set(sx, 0.04, shore);
    foam.renderOrder = 2;
    foam.userData.foam = true;
    g.add(foam);
    let t = 0;
    steps.push((dt) => {
      t += dt;
      ft.offset.x = (ft.offset.x + dt * 0.01) % 1;
      foam.position.z = shore + Math.sin(t * 0.6) * 0.35;
    });
    // un voilier au large, qui se balance (immobile en qualité basse)
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
    boat.position.set(sx + 6, 0, shore - 22);
    g.add(boat);
    if (high) {
      steps.push(() => {
        boat.rotation.z = Math.sin(t * 0.9) * 0.05;
        boat.position.y = Math.sin(t * 1.1) * 0.05;
        boat.position.x = sx + 6 + Math.sin(t * 0.05) * 3;
      });
    }
  }
  if (far.has('dunes')) {
    // (deux dunes sur les côtés, entre la clôture et la mer : leur pied n'atteint ni l'une ni l'autre)
    const dm = mat(white ? 0xe8edf2 : 0xe8d6b0);
    const dg = keep(new THREE.SphereGeometry(1, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2));
    for (const s of [-1, 1]) {
      const p = at(s * (12 + r() * 4), (3.0 + r() * 0.4) * kSea);
      inst.add(dg, dm, [p.x, -0.1, p.z], [6 + r() * 3, 1.2 + r() * 0.6, 2.2 * kSea], p.ry);
    }
  }
  if (far.has('sommets')) {
    // (les sommets : un cône de roche, son chapeau de neige ; plus de neige quand c'est blanc ; en instances)
    const rock = hazed(look === 'rocheuses' ? 0x6a7888 : 0x7a8290, 0.35);
    const snow = hazed(0xf6f8fc, 0.2);
    const peak = keep(lumpy(new THREE.ConeGeometry(1, 1, 7, 3), 0.04, 3, 3));
    const n = ring ? 14 : look === 'rocheuses' ? 7 : 6;
    const capK = white ? 0.55 : 0.32;
    for (let i = 0; i < n; i++) {
      // (pas plus loin que la caméra ne voit : 38 m derrière, 40 m du milieu du rond)
      const depth = Math.min(26 + r() * 8, ring ? 40 - ring : zb + 38);
      const p = at(spread(i, n, 66, depth) + (r() - 0.5) * 5, depth);
      const h = (look === 'rocheuses' ? 8 : 11) + r() * 6;
      const w = h * (0.6 + r() * 0.2);
      const ry = r() * 3;
      inst.add(peak, rock, [p.x, h / 2 - 0.3, p.z], [w, h, w * 0.8], ry);
      inst.add(peak, snow, [p.x, h - (h * capK) / 2 - 0.29, p.z], [w * capK * 1.04, h * capK, w * capK * 0.84], ry);
    }
  }
  if (far.has('volcan')) {
    const vm = hazed(0x4e4844, 0.3);
    const vg = keep(lumpy(new THREE.CylinderGeometry(1.6, 11, 9, 12, 3, true), 0.2, 5, 1.2));
    const v = new THREE.Mesh(vg, vm);
    const p = at(8, Math.min(28, ring ? 37 - ring : zb + 37));
    v.position.set(p.x, 4.2, p.z);
    g.add(v);
    // (la fumée : des bouffées grises qui montent, s'élargissent, dérivent avec le vent et s'effacent ; la nuit, à peine
    // plus claires que le ciel)
    const puffTex = keep(softDot('255,255,255', 64));
    const puffs = [];
    const nP = high ? 10 : 5;
    const smoke = unlit(0x9a9a9e);
    for (let i = 0; i < nP; i++) {
      const sm = keep(new THREE.SpriteMaterial({ map: puffTex, color: smoke, transparent: true, depthWrite: false, fog: thick }));
      const s = new THREE.Sprite(sm);
      s.userData.smoke = true;
      g.add(s);
      puffs.push({ s, k: i / nP, j: (r() - 0.5) * 0.8 });
    }
    steps.push((dt) => {
      for (const q of puffs) {
        q.k = (q.k + dt * 0.025) % 1;
        q.s.position.set(v.position.x + q.k * 5 + q.j, v.position.y + 4.4 + q.k * 6, v.position.z);
        q.s.scale.setScalar(1.6 + q.k * 4);
        q.s.material.opacity = 0.5 * Math.min(1, q.k * 6) * (1 - q.k);
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
    const p = at(-10, Math.min(27, ring ? 36 - ring : zb + 36));
    rk.position.set(p.x, -0.2, p.z);
    rk.rotation.y = p.ry;
    g.add(rk);
  }
  if (far.has('collines') || far.has('plaine') || far.has('sommets')) {
    const hc = { volcan: 0x6a7a5a, mediterranee: 0xb0a070, bush: 0xb0704a, rocheuses: 0x8a9a64, pampa: 0x9aa868, japon: 0x5a8a4c, normandie: 0x6a9a4c }[look] ?? 0x7c9f5c;
    const hm = hazed(white ? 0xd8dee4 : hc, 0.15);
    const hg = keep(new THREE.SphereGeometry(1, 16, 6, 0, Math.PI * 2, 0, Math.PI / 2));
    const flat = far.has('plaine');
    const n = ring ? 12 : 5;
    for (let i = 0; i < n; i++) {
      const depth = 19 + r() * 4;
      const p = at(spread(i, n, 55, depth) + (r() - 0.5) * 4, depth);
      inst.add(hg, hm, [p.x, -0.2, p.z], [10 + r() * 6, flat ? 0.6 + r() * 0.4 : 1.6 + r() * 2.2, 6], p.ry);
    }
  }
  if (far.has('vaches')) {
    // (des vaches normandes qui paissent au loin : blanches tachées de brun ; des boîtes, en instances)
    const cube = keep(new THREE.BoxGeometry(1, 1, 1));
    const coat = mat(0xf2eee6);
    const spot = mat(0x6a4630);
    const nose = mat(0xd8a89a);
    const n = high ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const p = at([-12, 8, 14][i] + (r() - 0.5) * 3, 7 + r() * 4);
      const hd = p.ry + (r() - 0.5) * 2.4;
      const c = Math.cos(hd);
      const sn = Math.sin(hd);
      // (une pièce de la vache : o, sa place dans le repère de la vache ; s, sa taille)
      const part = (m, o, s) => inst.add(cube, m, [p.x + o[0] * c + o[2] * sn, o[1], p.z - o[0] * sn + o[2] * c], s, hd);
      part(coat, [0, 0.95, 0], [1.5, 0.7, 0.6]);
      part(spot, [-0.2, 1.0, 0], [0.5, 0.5, 0.62]);
      part(spot, [0.4, 1.08, 0], [0.3, 0.36, 0.62]);
      part(coat, [0.88, 0.62, 0], [0.42, 0.36, 0.3]);
      part(nose, [1.08, 0.52, 0], [0.12, 0.2, 0.26]);
      for (const [lx, lz] of [[0.55, 0.2], [0.55, -0.2], [-0.55, 0.2], [-0.55, -0.2]]) part(coat, [lx, 0.3, lz], [0.13, 0.6, 0.13]);
    }
  }

  // ---------------------------------------------------------------- la construction du pays (à gauche, au loin)
  // (les constructions qu'on garde hors de sa tête dans l'image : voir clearHead)
  const landmarks = [];
  /** Pose o au fond (side, depth), tourné de rot (et vers nous), et la garde hors de sa tête (glisse de step m). */
  const place = (o, side, depth, rot = 0, guard = true, step = 1.5) => {
    const p = at(side, depth);
    o.position.set(p.x, o.position.y, p.z);
    o.rotation.y = rot + p.ry;
    g.add(o);
    if (guard) landmarks.push({ o, step });
    return o;
  };
  const dark = mat(0x2a2420);
  const glass = mat(0x8ab0c8, { roughness: 0.3 });
  let mark = null;
  switch (L.landmark) {
    case 'cabane': {
      // (deux cabanes rayées sur le sable, en retrait du bord de l'eau)
      const land = new THREE.Group();
      const walls = keep(new THREE.MeshStandardMaterial({ map: keep(stripeTexture('#3a78c0')), roughness: 0.8 }));
      for (const [k, dx] of [[0, -1.2], [1, 1.2]]) {
        const hm = k ? keep(new THREE.MeshStandardMaterial({ map: keep(stripeTexture('#d84a3a')), roughness: 0.8 })) : walls;
        const h = house(keep, { w: 1.8, d: 1.6, h: 1.9, walls: hm, roof: snowCap ?? mat(0xf2ece0), pitch: 0.6, over: 0.15, thick: 0.08 });
        h.position.set(dx, 0, k * 0.3);
        opening(keep, h, dark, 0, 0.75, 0.8, 0.7, 1.4);
        land.add(h);
      }
      place(land, -11.3, Math.min(4.5, 7 * kSea - 2.2), 0.25);
      // (un parasol planté dans le sable)
      const pole = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03, 0.03, 2, 5)), mat(0xe8e0d0));
      const um = new THREE.Mesh(keep(new THREE.ConeGeometry(1.1, 0.45, 10, 1, true)), keep(new THREE.MeshStandardMaterial({ map: keep(stripeTexture('#f0a83a')), side: THREE.DoubleSide, roughness: 0.8 })));
      pole.position.y = 1;
      um.position.y = 2;
      const parasol = new THREE.Group();
      parasol.add(pole, um);
      place(parasol, 5, Math.min(4, 7 * kSea - 1.2), 0, false);
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
      place(h, -6.5, 11.5, 0.3);
      break;
    }
    case 'tourbe': {
      // (la maison au toit d'herbe : pignon blanc, toit couvert de mousse ; blanc sous la neige)
      const h = house(keep, { w: 3.2, d: 3, h: 1.4, walls: mat(0xece8de), roof: mat(white ? 0xe8eef2 : 0x6a8a4a), pitch: 0.65, over: 0.2, thick: 0.4 });
      opening(keep, h, mat(0xb03a2a), 0, 0.6, 1.5, 0.6, 1.2);
      place(h, -6.5, 9.5, 0.35);
      break;
    }
    case 'grange': {
      const h = house(keep, { w: 6, d: 4.5, h: 3.4, walls: mat(0xa8342a), roof: snowCap ?? mat(0x4a4a4e), pitch: 0.6, over: 0.3 });
      const trim = mat(0xf2ece0);
      for (const sxx of [-1, 1]) {
        const s = new THREE.Mesh(keep(new THREE.BoxGeometry(0.14, 2.3, 0.05)), trim);
        s.position.set(sxx * 0.95, 1.15, 2.27);
        h.add(s);
      }
      for (const a of [0.9, -0.9]) {
        const d = new THREE.Mesh(keep(new THREE.BoxGeometry(2.6, 0.12, 0.05)), trim);
        d.position.set(0, 1.15, 2.28);
        d.rotation.z = a;
        h.add(d);
      }
      place(h, -6.5, 10.5, 0.35);
      break;
    }
    case 'estancia': {
      const h = house(keep, { w: 7, d: 4, h: 2.4, walls: mat(0xf2ede2), roof: snowCap ?? mat(0xb4603a), pitch: 0.3, over: 0.5 });
      for (const x of [-2.2, 0, 2.2]) opening(keep, h, dark, x, 1.0, 2, 0.9, 1.6);
      place(h, -8.5, 12.5, 0.2);
      mark = place(windPump(keep, 5), 7, 11);
      break;
    }
    case 'torii': {
      const red = mat(0xc8402a);
      const t = new THREE.Group();
      const post = keep(new THREE.CylinderGeometry(0.16, 0.18, 3.4, 10));
      for (const sxx of [-1, 1]) {
        const p = new THREE.Mesh(post, red);
        p.position.set(sxx * 1.3, 1.7, 0);
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
      place(t, -5.5, 8.5, 0.25);
      // (une petite pagode au loin)
      const pg = new THREE.Group();
      const pw = mat(0x8a3a2a);
      const pr = snowCap ?? mat(0x3a3a40);
      for (let i = 0; i < 3; i++) {
        const w = 2.4 - i * 0.5;
        const b = new THREE.Mesh(keep(new THREE.BoxGeometry(w * 0.7, 1, w * 0.7)), pw);
        b.position.y = 0.5 + i * 1.3;
        const rf = new THREE.Mesh(keep(new THREE.ConeGeometry(w * 0.85, 0.5, 4)), pr);
        rf.position.y = 1.2 + i * 1.3;
        rf.rotation.y = Math.PI / 4;
        pg.add(b, rf);
      }
      place(pg, 8, 16);
      break;
    }
    case 'hacienda': {
      const h = house(keep, { w: 8, d: 4.5, h: 2.8, walls: mat(0xf6f2ea), roof: snowCap ?? mat(0xc0643a), pitch: 0.28, over: 0.4 });
      for (const x of [-2.8, -1, 1, 2.8]) {
        const arch = new THREE.Mesh(keep(new THREE.CircleGeometry(0.55, 12, 0, Math.PI)), dark);
        arch.position.set(x, 1.6, 2.26);
        h.add(arch);
        opening(keep, h, dark, x, 0.8, 2.25, 1.1, 1.6);
      }
      place(h, -7.5, 11.5, 0.2);
      break;
    }
    case 'eolienne': {
      // (l'éolienne et sa citerne)
      const land = new THREE.Group();
      mark = windPump(keep, 6);
      land.add(mark);
      const tank = new THREE.Mesh(keep(new THREE.CylinderGeometry(1.1, 1.1, 1.4, 14)), mat(0xb8bec4, { metalness: 0.4, roughness: 0.5 }));
      tank.position.set(2.2, 0.7, 0.5);
      land.add(tank);
      place(land, -6.5, 9.5);
      // un kangourou qui saute au loin, va et vient (pas en qualité basse)
      if (high) {
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
        place(kgo, 4, 13, 0, false);
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
      }
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
      place(h, -6.5, 10.5, 0.3);
      // (le muret de pierres sèches qui traverse le pré — tout autour du rond de longe —, et des haies)
      const wallTex = keep(stoneTexture('#b8a070', 12));
      wallTex.repeat.set(3.2, 0.5);
      const wallM = keep(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 1 }));
      const wallG = keep(new THREE.BoxGeometry(8, 0.8, 0.5));
      const nW = ring ? Math.round((Math.PI * 2 * (ring + 5.5)) / 8) : 5;
      for (let i = 0; i < nW; i++) {
        const p = at(spread(i, nW, 40, 5.5), 5.5);
        inst.add(wallG, wallM, [p.x, 0.4, p.z], [ring ? (Math.PI * 2 * (ring + 5.5)) / nW / 8 + 0.02 : 1.01, 1, 1], p.ry);
      }
      const hedge = mat(white ? 0xdde4e8 : winter ? 0x5a6a4a : 0x3f6a34);
      const hg = keep(lumpy(new THREE.BoxGeometry(1, 1, 1, 4, 2, 2), 0.08, 9, 3));
      const nH = ring ? 12 : 5;
      for (let i = 0; i < nH; i++) {
        const p = at(spread(i, nH, 35, 13) + 4, 13);
        inst.add(hg, hedge, [p.x, 0.7, p.z], [6, 1.4, 1.2], p.ry);
      }
      break;
    }
    case 'haras': {
      // (la grande écurie au clocheton, les clôtures blanches)
      const h = house(keep, { w: 9, d: 5, h: 3, walls: mat(0x2f4a3a), roof: snowCap ?? mat(0x3a3a3e), pitch: 0.45, over: 0.3 });
      const paint = mat(0xf6f4ee);
      for (const x of [-3, -1, 1, 3]) opening(keep, h, paint, x, 1.2, 2.5, 1.1, 2);
      const cup = new THREE.Mesh(keep(new THREE.BoxGeometry(0.9, 0.9, 0.9)), paint);
      cup.position.y = 3 + h.userData.rise + 0.5;
      const cupRoof = new THREE.Mesh(keep(new THREE.ConeGeometry(0.8, 0.7, 4)), snowCap ?? mat(0x3a7a5a));
      cupRoof.position.y = cup.position.y + 0.75;
      cupRoof.rotation.y = Math.PI / 4;
      h.add(cup, cupRoof);
      place(h, -7.5, 12.5, 0.25);
      const board = keep(new THREE.BoxGeometry(1, 0.14, 0.05));
      const postG = keep(new THREE.BoxGeometry(0.12, 1.3, 0.12));
      // (deux rangées de clôture ; une seule en qualité basse)
      for (const depth of high ? [5, 12] : [5]) {
        const n = ring ? Math.round((Math.PI * 2 * (ring + depth)) / 2.6) : 18;
        const step = ring ? (Math.PI * 2 * (ring + depth)) / n : 2.6;
        for (let i = 0; i < n; i++) {
          const side = ring ? spread(i, n, 0, depth) : -22 + i * 2.6;
          const p = at(side, depth);
          inst.add(postG, paint, [p.x, 0.6, p.z], 1, p.ry);
          const q = at(side + step / 2, depth);
          for (const y of [0.45, 0.8, 1.15]) inst.add(board, paint, [q.x, y, q.z], [step, 1, 1], q.ry);
        }
      }
      break;
    }
    case 'longere': {
      // (la longère normande : longue et basse, enduit clair à colombages, toit de chaume épais, une cheminée de
      // briques ; blanche sous la neige)
      const tt = keep(timberTexture());
      const wm = keep(new THREE.MeshStandardMaterial({ map: tt, roughness: 0.95 }));
      // (les pignons : l'enduit seul, la texture y serait serrée)
      const h = house(keep, { w: 9, d: 4.2, h: 2.3, walls: wm, gable: mat(0xefe6d2), roof: snowCap ?? mat(0x9a7a48), pitch: 0.8, over: 0.45, thick: 0.38 });
      const ridge = new THREE.Mesh(keep(new THREE.BoxGeometry(9.9, 0.3, 0.55)), snowCap ?? mat(0x6a5a3a));
      ridge.position.y = 2.3 + h.userData.rise + 0.2;
      h.add(ridge);
      const ch = new THREE.Mesh(keep(new THREE.BoxGeometry(0.55, 1.3, 0.55)), mat(0x9a5a44));
      ch.position.set(3.6, 2.3 + h.userData.rise * 0.6 + 0.5, 0);
      h.add(ch);
      for (const x of [-3, -1.2, 2.2]) opening(keep, h, glass, x, 1.3, 2.1, 0.7, 0.8);
      opening(keep, h, mat(0x5a3a2a), 0.5, 0.95, 2.1, 0.9, 1.75);
      place(h, -6.5, 10.5, 0.25);
      // (les haies du bocage : une rangée devant, sur les côtés, et une derrière les pommiers)
      const hedge = mat(white ? 0xdde4e8 : winter ? 0x4f6040 : 0x3a6a30);
      const hg = keep(lumpy(new THREE.BoxGeometry(1, 1, 1, 4, 2, 2), 0.1, 7, 3));
      const nH = ring ? 14 : 7;
      for (let i = 0; i < nH; i++) {
        const side = spread(i, nH, 56, 5.5);
        if (!ring && Math.abs(side) < 9) continue;
        const p = at(side, 5.5);
        inst.add(hg, hedge, [p.x, 0.65, p.z], [6.5, 1.3, 1.3], p.ry);
      }
      for (let i = 0; i < (ring ? 12 : 5); i++) {
        const p = at(spread(i, ring ? 12 : 5, 50, 21) + 3, 21);
        inst.add(hg, hedge, [p.x, 0.8, p.z], [8, 1.7, 1.5], p.ry);
      }
      break;
    }
    default:
      break;
  }
  if (mark?.userData.step) steps.push(mark.userData.step);

  // ---------------------------------------------------------------- tout près, juste derrière la clôture
  // Le lieu se voit même dans les gros plans : la caméra penchée sur la gamelle du chien ne voit que le sol, juste
  // derrière lui. Deux ou trois choses du pays, à sa taille (plus près d'un lapin que d'un cheval), au-delà de la clôture
  // du fond : jamais devant lui, et pas derrière sa tête (clearHead). Pas au rond de longe : ses abords sont la piste.
  if (!ring) {
    // (la caméra penchée sur un petit animal voit le sol derrière sa queue, à quelques fois sa taille : on y va)
    const hgt = box.max.y - box.min.y;
    const kS = THREE.MathUtils.clamp(hgt / 0.5, 0.8, 1.3);
    const kD = THREE.MathUtils.clamp(hgt / 0.5, 0.5, 1.3);
    // (au-delà de la clôture du fond du décor, s'il en a une plus loin que son bord : le pré de la balle)
    const from = Math.max(0, zb - Math.min(zb, decor.dims?.z0 ?? zb)) + 0.2;
    for (const [kind, side, depth] of NEAR[look] ?? []) {
      // (au pré de la balle, la chèvrerie occupe le fond à gauche : rien dedans)
      if (decor.dims?.x0 !== undefined && cx + side * kS < decor.dims.x0 + 3.7) continue;
      const o = nearProp(kind);
      if (o) place(o, side * kS, from + depth * kD, (r() - 0.5) * 0.5, true, 0.5);
    }
  }
  /** Une petite chose du pays, posée tout près (quelques pièces ; les brins, les cailloux en instances). */
  function nearProp(kind) {
    const o = new THREE.Group();
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const add = (geo, m, p, sc = [1, 1, 1], rot = [0, 0, 0]) => {
      const x = new THREE.Mesh(geo, m);
      x.position.set(...p);
      x.scale.set(...sc);
      x.rotation.set(...rot);
      o.add(x);
      return x;
    };
    // (plusieurs fois la même pièce : list de [x, y, z, sx, sy, sz, ry, rz])
    const lots = (geo, m, list) => {
      const im = new THREE.InstancedMesh(geo, m, list.length);
      list.forEach(([x, y, z, sx, sy, sz, ry = 0, rz = 0], i) => im.setMatrixAt(i, m4.compose(V(x, y, z), q.setFromEuler(e.set(0, ry, rz, 'YXZ')), V(sx, sy, sz))));
      o.add(im);
      return im;
    };
    const cyl = () => keep(new THREE.CylinderGeometry(1, 1, 1, 8));
    const rockGeo = () => keep(lumpy(new THREE.IcosahedronGeometry(1, 1), 0.12, 5, 2.2));
    const tufts = (color, n, h, w = 0.06) => {
      const list = [];
      for (let i = 0; i < n; i++) list.push([(r() - 0.5) * 0.7, h * 0.5, (r() - 0.5) * 0.4, w, h * (0.7 + r() * 0.5), w, 0, (r() - 0.5) * 0.5]);
      lots(keep(new THREE.ConeGeometry(1, 1, 5)), mat(color), list);
    };
    switch (kind) {
      case 'brisevent': {
        // (le paravent rayé de la plage : trois piquets, la toile tendue)
        lots(cyl(), mat(0xd8c8a8), [[-0.75, 0.5, 0, 0.02, 1, 0.02], [0, 0.5, -0.1, 0.02, 1, 0.02], [0.75, 0.5, 0, 0.02, 1, 0.02]]);
        add(keep(new THREE.PlaneGeometry(1.5, 0.62)), keep(new THREE.MeshStandardMaterial({ map: keep(stripeTexture('#3a78c0')), side: THREE.DoubleSide, roughness: 0.9 })), [0, 0.6, -0.04]);
        return o;
      }
      case 'chateau': {
        // (un château de sable : la butte, trois tours, un petit drapeau)
        const sand = mat(white ? 0xe8edf2 : 0xe2c896);
        add(keep(new THREE.CylinderGeometry(0.32, 0.38, 0.14, 10)), sand, [0, 0.07, 0]);
        lots(keep(new THREE.CylinderGeometry(1, 1.1, 1, 8)), sand, [[-0.18, 0.24, 0, 0.08, 0.22, 0.08], [0.18, 0.24, 0.02, 0.08, 0.22, 0.08], [0, 0.3, -0.12, 0.1, 0.34, 0.1]]);
        add(keep(new THREE.PlaneGeometry(0.1, 0.06)), mat(0xd84a3a, { side: THREE.DoubleSide }), [0.05, 0.56, -0.12]);
        add(keep(new THREE.CylinderGeometry(0.005, 0.005, 0.12, 4)), dark, [0, 0.53, -0.12]);
        return o;
      }
      case 'oyats':
        // (les oyats des dunes : des touffes d'herbe raide)
        tufts(white ? 0xc8ccc0 : 0xb4b878, 9, 0.5);
        return o;
      case 'rocher':
        add(rockGeo(), mat(white ? 0xdfe4e8 : 0x8a8a86), [0, 0.22, 0], [0.55, 0.4, 0.42]);
        return o;
      case 'panneau': {
        // (le panneau jaune des chemins de randonnée, sur son poteau)
        add(keep(new THREE.BoxGeometry(0.07, 1.1, 0.07)), mat(0x6a4a30), [0, 0.55, 0]);
        add(keep(new THREE.BoxGeometry(0.42, 0.14, 0.03)), mat(0xf0c030), [0.12, 0.95, 0.04], [1, 1, 1], [0, 0, -0.06]);
        return o;
      }
      case 'sapineau': {
        // (un jeune sapin)
        lots(coneGeo, mat(0x2f5a3a), [[0, 0.45, 0, 0.32, 0.3, 0.32], [0, 0.75, 0, 0.22, 0.22, 0.22]]);
        if (snowCap) add(coneGeo, snowCap, [0, 0.95, 0], [0.1, 0.08, 0.1]);
        return o;
      }
      case 'lave':
        // (des blocs de lave noire)
        lots(rockGeo(), mat(0x2e2a28), [[-0.3, 0.12, 0, 0.26, 0.2, 0.22, 0.4], [0.15, 0.1, 0.12, 0.2, 0.16, 0.18, 1.2], [0.3, 0.16, -0.12, 0.3, 0.24, 0.26, 2]]);
        return o;
      case 'cairn': {
        // (un cairn : des pierres plates empilées)
        const list = [];
        for (let i = 0; i < 5; i++) list.push([(r() - 0.5) * 0.04, 0.06 + i * 0.1, 0, 0.2 - i * 0.025, 0.06, 0.16 - i * 0.02, r() * 3]);
        lots(rockGeo(), mat(0x6a6a66), list);
        return o;
      }
      case 'tronc': {
        // (un tronc couché, ses deux bouts clairs)
        add(keep(new THREE.CylinderGeometry(0.16, 0.18, 1.6, 10)), trunk, [0, 0.16, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
        lots(keep(new THREE.CircleGeometry(1, 10)), mat(0xc8a878), [[-0.81, 0.16, 0, 0.16, 0.16, 1, -Math.PI / 2], [0.81, 0.16, 0, 0.17, 0.17, 1, Math.PI / 2]]);
        return o;
      }
      case 'barriere': {
        // (un bout de clôture à perches ; blanche au Kentucky)
        const wood = look === 'haras' ? mat(0xf6f4ee) : mat(0x8a6a48);
        lots(keep(new THREE.BoxGeometry(1, 1, 1)), wood, [[-0.8, 0.45, 0, 0.09, 0.9, 0.09], [0.8, 0.45, 0, 0.09, 0.9, 0.09], [0, 0.4, 0.05, 1.8, 0.08, 0.05], [0, 0.75, 0.05, 1.8, 0.08, 0.05]]);
        return o;
      }
      case 'herbes': {
        // (l'herbe de la pampa : de grands plumets clairs sur une touffe verte)
        tufts(white ? 0xb8c0b0 : 0x8a9a5a, 8, 0.45);
        lots(keep(new THREE.ConeGeometry(1, 1, 6)), mat(0xeee2c4), [[-0.15, 0.85, 0, 0.06, 0.4, 0.06, 0, 0.15], [0.05, 0.95, 0.05, 0.06, 0.45, 0.06, 0, -0.05], [0.2, 0.8, -0.05, 0.05, 0.38, 0.05, 0, -0.2]]);
        return o;
      }
      case 'bambous': {
        // (une touffe de bambous)
        const list = [];
        for (let i = 0; i < 6; i++) list.push([(i - 2.5) * 0.12 + (r() - 0.5) * 0.05, 0.9, (r() - 0.5) * 0.2, 0.025, 1.8 + r() * 0.4, 0.025, 0, (r() - 0.5) * 0.08]);
        lots(cyl(), mat(white ? 0x8aa070 : 0x6a9a3e), list);
        return o;
      }
      case 'pas': {
        // (les pierres plates d'un petit chemin de jardin)
        const list = [];
        for (let i = 0; i < 4; i++) list.push([(i - 1.5) * 0.3, 0.015, Math.sin(i * 1.3) * 0.12, 0.13, 0.03, 0.11, r() * 3]);
        lots(cyl(), mat(white ? 0xe0e4e8 : 0x8a8a84), list);
        return o;
      }
      case 'jarre': {
        // (une grande jarre en terre cuite)
        const pts = [[0, 0], [0.12, 0], [0.2, 0.12], [0.22, 0.3], [0.16, 0.5], [0.1, 0.56], [0.12, 0.6], [0.09, 0.6]].map(([x, y]) => new THREE.Vector2(x, y));
        add(keep(new THREE.LatheGeometry(pts, 12)), mat(0xb8643a), [0, 0, 0]);
        return o;
      }
      case 'lavande': {
        // (des touffes de lavande : violettes l'été, grises le reste de l'année)
        const c = white ? 0xdfe4e8 : season === 'summer' ? 0x8a6ab8 : 0x8a9a88;
        lots(keep(new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2)), mat(c), [[-0.25, 0, 0, 0.22, 0.3, 0.2], [0.15, 0, 0.08, 0.2, 0.26, 0.18], [0.35, 0, -0.1, 0.16, 0.22, 0.15]]);
        return o;
      }
      case 'termitiere': {
        // (une termitière de terre rouge)
        add(keep(lumpy(new THREE.ConeGeometry(0.3, 1.2, 8, 4), 0.04, 3, 4)), mat(0xa8582e), [0, 0.6, 0]);
        add(keep(lumpy(new THREE.ConeGeometry(0.16, 0.6, 7, 2), 0.03, 5, 4)), mat(0xa8582e), [0.22, 0.3, 0.05]);
        return o;
      }
      case 'spinifex':
        // (le spinifex : des touffes piquantes, jaunes)
        tufts(0xb8b05a, 10, 0.3, 0.05);
        return o;
      case 'portillon': {
        // (une petite barrière de bois entre deux poteaux)
        lots(keep(new THREE.BoxGeometry(1, 1, 1)), mat(0x9a7a58), [[-0.55, 0.5, 0, 0.1, 1, 0.1], [0.55, 0.5, 0, 0.1, 1, 0.1], [0, 0.3, 0.04, 1, 0.07, 0.04], [0, 0.6, 0.04, 1, 0.07, 0.04], [0, 0.85, 0.04, 1, 0.07, 0.04], [0, 0.58, 0.06, 1.15, 0.07, 0.04, 0, 0.5]]);
        return o;
      }
      case 'digitales': {
        // (des digitales roses le long du muret ; l'hiver, rien)
        if (winter || white) return null;
        tufts(0x4f7a34, 5, 0.25);
        const list = [];
        for (let i = 0; i < 4; i++) list.push([(i - 1.5) * 0.18, 0.55, (r() - 0.5) * 0.15, 0.06, 0.5 + r() * 0.2, 0.06]);
        lots(keep(new THREE.ConeGeometry(1, 1, 6)), mat(0xd86aa8), list);
        return o;
      }
      case 'obstacle': {
        // (un obstacle de saut : deux chandeliers blancs, deux barres rouges et blanches)
        lots(keep(new THREE.BoxGeometry(1, 1, 1)), mat(0xf6f4ee), [[-1, 0.6, 0, 0.12, 1.2, 0.12], [1, 0.6, 0, 0.12, 1.2, 0.12]]);
        const pole = keep(new THREE.MeshStandardMaterial({ map: keep(stripeTexture('#d03a2a')), roughness: 0.7 }));
        lots(keep(new THREE.CylinderGeometry(0.04, 0.04, 2, 8)), pole, [[0, 0.55, 0.08, 1, 1, 1, 0, Math.PI / 2], [0, 0.95, 0.08, 1, 1, 1, 0, Math.PI / 2]]);
        return o;
      }
      case 'cagette': {
        // (une cagette de pommes)
        add(keep(new THREE.BoxGeometry(0.5, 0.22, 0.34)), mat(0xc8a070), [0, 0.11, 0]);
        const list = [];
        for (let i = 0; i < 6; i++) list.push([((i % 3) - 1) * 0.14, 0.24, (Math.floor(i / 3) - 0.5) * 0.14, 0.06, 0.06, 0.06]);
        lots(appleGeo, mat(0xc8322a), list);
        return o;
      }
      case 'bidon': {
        // (un bidon de lait en fer)
        const pts = [[0, 0], [0.13, 0], [0.13, 0.36], [0.07, 0.44], [0.07, 0.5], [0.09, 0.52], [0, 0.52]].map(([x, y]) => new THREE.Vector2(x, y));
        add(keep(new THREE.LatheGeometry(pts, 12)), mat(0xb8bec4, { metalness: 0.6, roughness: 0.4 }), [0, 0, 0]);
        return o;
      }
      default:
        return null;
    }
  }
  inst.done();
  // (tout le fond sans ombres : le soleil n'ombre que ses abords, la carte des ombres n'est pas lue si loin)
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });

  // ---------------------------------------------------------------- la construction jamais juste derrière sa tête
  // Dans l'image du soin (au téléphone en portrait comme en paysage), chaque construction est projetée depuis la
  // caméra : si elle tombe derrière sa tête, elle glisse sur le côté, d'un côté puis de l'autre, de plus en plus loin.
  // On le revoit quand la caméra bouge (le jeu recadre, la toile change de forme). Au rond de longe, la caméra tourne
  // tout autour : rien à faire.
  g.updateWorldMatrix(true, true);
  // (box : sa boîte autour de sa place ; x0 : sa place sans glissement ; shift : le glissement)
  const guards = landmarks.map(({ o, step }) => ({ o, step, x0: o.position.x, shift: 0, box: new THREE.Box3().setFromObject(o).translate(V(-o.position.x, 0, 0)) }));
  const corner = V();
  let lastKey = '';
  /** Le rectangle de la construction dans l'image (glissée de d m), ou null (derrière la caméra). */
  function rectOf(st, it, d) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let seen = 0;
    const b = it.box;
    for (const x of [b.min.x, b.max.x]) {
      for (const y of [b.min.y, b.max.y]) {
        for (const z of [b.min.z, b.max.z]) {
          const q = st.project(corner.set(x + it.x0 + d, y, z));
          if (q.behind) continue;
          seen++;
          x0 = Math.min(x0, q.x);
          x1 = Math.max(x1, q.x);
          y0 = Math.min(y0, q.y);
          y1 = Math.max(y1, q.y);
        }
      }
    }
    return seen ? { x0, x1, y0, y1 } : null;
  }
  /** Le rectangle q touche-t-il un des cercles de sa tête ? */
  const hits = (q, zone) => !!q && zone.some((c) => Math.hypot(Math.max(q.x0, Math.min(c.x, q.x1)) - c.x, Math.max(q.y0, Math.min(c.y, q.y1)) - c.y) < c.r);
  // (où va sa tête pendant le soin : debout au repos, et la bouche à la mangeoire ou à la gamelle — mesurée par le décor)
  const restHead = [stage.marks?.head, stage.marks?.muzzle, decor.anchors?.eat].filter((p) => p?.isVector3).map((p) => p.clone());
  function clearHead(st) {
    if (ring || !guards.length || !st?.view || !st.project || !st.live || !st.camera) return;
    // (la caméra telle qu'elle projette : sa place, son orientation, son cadre — à 5 cm près, sa respiration n'y fait rien)
    const v = st.view;
    const mw = st.camera.matrixWorld.elements;
    const pm = st.camera.projectionMatrix.elements;
    const key = [...mw.slice(0, 3), ...mw.slice(8, 11), ...mw.slice(12, 15), pm[0], pm[5], pm[9], v.x0, v.x1, v.y0, v.y1].map((k) => Math.round(k * 20)).join('|');
    if (key === lastKey) return;
    lastKey = key;
    // (sa tête là où elle est, et là où elle va pendant le soin : un cercle autour de chaque place)
    const rad = 0.25 * Math.max(0.25, box.max.y - box.min.y);
    const zone = [];
    for (const p of [st.live('head'), st.live('muzzle'), ...restHead]) {
      if (!p) continue;
      const q = st.project(p);
      if (!q.behind) zone.push({ x: q.x, y: q.y, r: (st.projectRadius?.(p, rad) ?? 30) + 10 });
    }
    if (!zone.length) return;
    const hc = zone[0];
    // (là où elle glisse, avec de la marge : sa tête bouge un peu en mangeant, elle n'y retombe pas)
    const wide = zone.map((c) => ({ ...c, r: c.r * 1.4 + 10 }));
    for (const it of guards) {
      const now = rectOf(st, it, it.shift);
      if (!hits(now, zone)) continue;
      // (d'abord du côté où elle est déjà, par rapport à sa tête)
      const first = now.x0 + now.x1 < 2 * hc.x ? -1 : 1;
      let best = null;
      for (let k = 1; k <= 16 && best === null; k++) {
        for (const s of [first, -first]) {
          const d = it.shift + s * k * it.step;
          if (best === null && !hits(rectOf(st, it, d), wide)) best = d;
        }
      }
      if (best === null) continue;
      it.shift = best;
      it.o.position.x = it.x0 + best;
    }
  }

  return {
    group: g,
    look,
    shore,
    landmarks: guards,
    update(dt, st) {
      for (const s of steps) s(Math.min(dt, 0.1));
      clearHead(st);
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

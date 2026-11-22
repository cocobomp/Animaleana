// Accessoires 3D de la bergerie, de la chèvrerie et de l'étable (scène de soin des moutons, chèvres et vaches :
// farmBarn.js) : le râtelier à foin en bois qui se remplit vraiment (et l'auge dessous), l'abreuvoir en tôle galvanisée
// qui se remplit au tuyau, les bottes de paille, la pierre à sel, la fourche, la lanterne. Même forme que les
// accessoires du box (props.js) : chaque fabrique renvoie { group, …, update(dt), dispose() } et libère ce qu'elle
// crée. Tailles en mètres, données par le décor d'après l'animal (un agneau, une vache).

import * as THREE from 'three';
import { hayTexture, hayStrandTexture, rippleNormal, softDot, woodTexture, noiseTexture, canvasTex, rng } from './textures.js';
import { handModel, mergeSimple } from './props.js';

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Ce qu'on crée, à libérer ensemble. */
export function bag() {
  const list = [];
  const keep = (x) => {
    list.push(x);
    return x;
  };
  keep.dispose = () => {
    for (const x of list) x.dispose?.();
    list.length = 0;
  };
  return keep;
}

function shadowed(m, cast = true) {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** Bosselle une géométrie (bruit déterministe le long de la normale). */
export function lumpy(geo, amp, seed = 1, freq = 9) {
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

/** Deux cartes croisées (brins, poignées de foin). */
export function crossCard(w, h) {
  const a = new THREE.PlaneGeometry(w, h);
  a.translate(0, h / 2, 0);
  const b = a.clone();
  b.rotateY(Math.PI / 2);
  const geo = mergeSimple([a, b]);
  a.dispose();
  b.dispose();
  return geo;
}

/** Bois gris-brun des vieux bâtiments de ferme (planches, montants). */
export function barnWood(seed = 3, vertical = true, tone = 'old') {
  const T = { old: ['#8a6a4a', '#4a3320'], warm: ['#9a6e44', '#55361c'], pale: ['#b49268', '#6d4e30'] }[tone] ?? ['#8a6a4a', '#4a3320'];
  return woodTexture({ base: T[0], dark: T[1], vertical, seed, boards: 5 });
}

// ---------------------------------------------------------------- râtelier à foin (et son auge)

/**
 * Râtelier mural en bois : un cadre accroché au mur (origine : au mur, au milieu du bas du râtelier ; il sort vers
 * -x, dans la case ; sa longueur suit z), des barreaux penchés (bas contre le mur, haut vers la case), le foin entre
 * eux et le mur. Dessous, l'auge en planches qui recueille ce qui tombe. Dimensions : w (long du mur), h (hauteur des
 * barreaux), d (avancée du haut), trough (profondeur de l'auge), troughW (son avancée : il y mange tête baissée). setFill(k) : 0 vide à 1 plein (le foin monte depuis
 * le fond, des brins dépassent entre les barreaux) ; pour(on) : des brassées de foin tombent de notre main ;
 * nibble(on) : l'animal tire le foin (des brins tombent dans l'auge) ; bite() : où il mange (monde).
 */
export function hayRack({ w = 0.9, h = 0.55, d = 0.12, trough = 0.13, troughW = 0.3, high = true, hand: handCols = null } = {}) {
  const keep = bag();
  const g = new THREE.Group();
  const wood = keep(barnWood(11, false, 'warm'));
  const woodV = keep(barnWood(12, true, 'warm'));
  const frameMat = keep(new THREE.MeshStandardMaterial({ map: wood, roughness: 0.85 }));
  const barMat = keep(new THREE.MeshStandardMaterial({ map: woodV, roughness: 0.75, color: 0xd8c0a0 }));
  const box = (sx, sy, sz, mat, x, y, z, rx = 0, rz = 0) => {
    const m = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(sx, sy, sz)), mat));
    m.position.set(x, y, z);
    m.rotation.set(rx, 0, rz);
    g.add(m);
    return m;
  };
  const T = 0.035; // épaisseur des montants
  // L'auge : fond, devant, côtés (en planches), un rebord arrondi par l'usure.
  const tw = troughW;
  const tY = 0; // haut de l'auge = origine
  box(tw + 0.02, 0.025, w + 0.06, frameMat, -tw / 2, tY - trough * 0.9, 0);
  box(0.025, trough, w + 0.06, frameMat, -tw - 0.01, tY - trough / 2, 0);
  for (const s of [-1, 1]) box(tw + 0.03, trough + 0.02, 0.03, frameMat, -tw / 2, tY - trough / 2, s * (w / 2 + 0.03));
  // pieds de l'auge jusqu'au sol (donné par setFloor)
  const legs = [];
  for (const s of [-1, 1]) legs.push(box(0.05, 1, 0.05, frameMat, -tw - 0.01, -0.5, s * (w / 2 + 0.02)));
  // Le cadre du râtelier : deux montants latéraux penchés, une traverse en haut, une en bas (contre le mur).
  const tilt = Math.atan2(d, h);
  const len = Math.hypot(d, h);
  for (const s of [-1, 1]) {
    const m = box(T, len + 0.04, T * 1.3, frameMat, -d / 2, h / 2 + 0.02, s * (w / 2 + 0.01));
    m.rotation.z = tilt;
    // joue triangulaire (planche contre le mur, le long du montant)
    const cheek = shadowed(new THREE.Mesh(keep(triangleSlab(d, h, 0.022)), frameMat));
    cheek.position.set(0, 0.02, s * (w / 2 + 0.03));
    g.add(cheek);
  }
  box(T * 1.2, T * 1.4, w + 0.08, frameMat, -d, h + 0.03, 0);
  box(T * 1.4, T, w + 0.04, frameMat, -0.02, 0.02, 0);
  box(0.022, h * 0.35, w + 0.04, frameMat, -0.012, h * 0.9, 0); // (planche haute contre le mur)
  // Barreaux ronds, penchés, réguliers.
  const nBars = Math.max(5, Math.round(w / 0.085));
  const barGeo = keep(new THREE.CylinderGeometry(0.011, 0.012, len, 8));
  const bars = new THREE.InstancedMesh(barGeo, barMat, nBars);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, tilt));
  for (let i = 0; i < nBars; i++) {
    const z = -w / 2 + (i + 0.5) * (w / nBars);
    m4.compose(V(-d / 2, h / 2 + 0.03, z), q, V(1, 1, 1));
    bars.setMatrixAt(i, m4);
  }
  shadowed(bars);
  g.add(bars);
  keep({ dispose: () => bars.dispose() });
  // Le foin : une masse bosselée entre le mur et les barreaux, qui monte avec le remplissage.
  const hayTex = keep(hayTexture(5));
  hayTex.repeat.set(2.5, 2);
  const hayMat = keep(new THREE.MeshStandardMaterial({ map: hayTex, roughness: 1, color: 0xf4ecd0 }));
  const hayGeo = keep(lumpy(wedgeGeometry(d * 0.96, h * 1.05, w * 0.97, 10, 8, 12), 0.02 * Math.max(1, h / 0.55), 3, 13));
  const hayPivot = new THREE.Group();
  hayPivot.position.set(-0.01, 0.02, 0);
  g.add(hayPivot);
  const hay = shadowed(new THREE.Mesh(hayGeo, hayMat));
  hayPivot.add(hay);
  // Foin tombé dans l'auge (un petit tas qui grossit quand il mange, et avec le remplissage).
  const loose = shadowed(new THREE.Mesh(keep(lumpy(new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0.08, 4, 5)), hayMat));
  loose.scale.set(tw * 0.42, 0.001, w * 0.42);
  loose.position.set(-tw / 2, tY - trough * 0.88, 0);
  g.add(loose);
  // Brins qui dépassent entre les barreaux.
  const strandTex = keep(hayStrandTexture());
  const strandMat = keep(new THREE.MeshStandardMaterial({ map: strandTex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 }));
  const card = keep(crossCard(0.08 * Math.max(1, h / 0.55), 0.15 * Math.max(1, h / 0.55)));
  const N = high ? 150 : 90;
  const strands = new THREE.InstancedMesh(card, strandMat, N);
  strands.castShadow = true;
  g.add(strands);
  keep({ dispose: () => strands.dispose() });
  const spots = [];
  const r = rng(9);
  for (let i = 0; i < N; i++) spots.push({ k: r(), z: (r() - 0.5) * w * 0.95, out: r(), spin: r() * Math.PI, tilt: 0.3 + r() * 0.9, s: 0.6 + r() * 0.7 });
  let fill = 0;
  let shown = -1;
  let looseK = 0;
  const e = new THREE.Euler();
  const qq = new THREE.Quaternion();
  const sv = V();
  const apply = () => {
    const k = clamp(fill);
    hay.visible = k > 0.01;
    hayPivot.scale.set(lerp(0.55, 1, Math.sqrt(k)), Math.max(0.02, k), 1);
    let n = 0;
    for (const s of spots) {
      if (s.k > k) continue;
      // (sur la face des barreaux, à la hauteur du foin ; un peu en dessous du dessus du tas)
      const y = 0.03 + s.k * h * 0.95;
      const x = -d * (y / h) - 0.01 - s.out * 0.03;
      e.set(-s.tilt * 0.4, s.spin, Math.PI / 2 + tilt - 0.4 - s.tilt * 0.5);
      qq.setFromEuler(e);
      sv.setScalar(s.s * clamp((k - s.k) * 5 + 0.25));
      m4.compose(V(x, y, s.z), qq, sv);
      strands.setMatrixAt(n++, m4);
    }
    strands.count = n;
    strands.instanceMatrix.needsUpdate = true;
    loose.scale.y = Math.max(0.001, trough * 0.5 * clamp(looseK + k * 0.25, 0, 1));
    loose.visible = loose.scale.y > 0.003;
  };
  apply();

  // Brassées de foin qui tombent de notre main (au-dessus du râtelier).
  const flakes = [];
  const flakeGeo = keep(crossCard(0.13, 0.11));
  let pouring = false;
  let nib = 0;
  let spawn = 0;
  let t = 0;
  const hold = new THREE.Group();
  hold.visible = false;
  g.add(hold);
  const handM = handModel(keep, { ...(handCols ?? {}), grip: 0.8 });
  handM.rotation.order = 'YXZ';
  handM.rotation.set(Math.PI, -Math.PI / 2 - 0.5, -0.4);
  hold.add(handM);
  const bundle = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const m = new THREE.Mesh(flakeGeo, strandMat);
    m.position.set((Math.random() - 0.5) * 0.07, -0.02 - Math.random() * 0.06, (Math.random() - 0.5) * 0.07);
    m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    m.scale.setScalar(0.8 + Math.random() * 0.5);
    bundle.add(m);
  }
  hold.add(bundle);
  const holdAt = V(-d * 0.7, h + 0.22, 0.04);
  // La zone juste (bande verte) et la ligne 🎯 (trait blanc), posées devant les barreaux (setMark).
  const markG = new THREE.Group();
  markG.visible = false;
  g.add(markG);
  const bandMat = keep(new THREE.MeshBasicMaterial({ color: 0x3fae62, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false }));
  const lineMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  // (point du plan des barreaux à la part f de leur hauteur, devant eux et devant le foin qui dépasse)
  const out0 = 0.03 + 0.03 * Math.max(1, h / 0.5);
  const onBars = (f, out = V()) => out.set(-d * f - Math.cos(tilt) * out0, 0.03 + h * f - Math.sin(tilt) * out0, 0);
  hold.position.copy(holdAt);
  const floorOf = { y: -1 };
  return {
    group: g,
    w,
    h,
    d,
    trough,
    get fill() { return fill; },
    setFill(k) {
      fill = clamp(k);
      if (Math.abs(fill - shown) > 0.004) {
        shown = fill;
        apply();
      }
    },
    /** Hauteur du sol (repère du râtelier) : les pieds de l'auge vont jusque-là. */
    setFloor(y) {
      floorOf.y = y;
      const top = -trough;
      for (const l of legs) {
        l.scale.y = Math.max(0.01, top - y);
        l.position.y = (top + y) / 2;
      }
    },
    pour(on) { pouring = !!on; },
    nibble(on) { nib = on ? 1 : 0; },
    /** La zone juste [lo, hi] et la ligne 🎯 (parts du râtelier plein). Renvoie le point de la ligne (repère du râtelier). */
    setMark(lo, hi, target) {
      for (const c of [...markG.children]) {
        markG.remove(c);
        c.geometry.dispose();
      }
      const band = new THREE.Mesh(new THREE.PlaneGeometry(len * (hi - lo), w * 0.98).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), bandMat);
      band.rotation.z = tilt;
      band.position.copy(onBars((lo + hi) / 2));
      band.renderOrder = 2;
      markG.add(band);
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.008 * Math.max(1, h / 0.5), w * 1.02), lineMat);
      line.position.copy(onBars(target));
      line.position.x -= 0.004;
      markG.add(line);
      markG.visible = true;
      return onBars(target);
    },
    /** Point (monde) à la part f de la hauteur des barreaux, devant eux. */
    barsAt(f, out = V()) {
      g.updateWorldMatrix(true, false);
      return g.localToWorld(onBars(f, out));
    },
    /** Où l'animal mange (monde) : dans l'auge, où tombe le foin qu'il tire des barreaux. */
    bite(out = V()) {
      g.updateWorldMatrix(true, false);
      return g.localToWorld(out.set(-tw * 0.5, -trough * 0.25, 0));
    },
    /** Le devant de l'auge (monde). */
    mouthAt(out = V()) {
      g.updateWorldMatrix(true, false);
      return g.localToWorld(out.set(-tw, 0.02, 0));
    },
    update(dt) {
      t += dt;
      hold.visible = pouring;
      if (pouring) {
        hold.position.set(holdAt.x + Math.sin(t * 6) * 0.015, holdAt.y + Math.sin(t * 9) * 0.012, holdAt.z);
        spawn += dt * 16;
        while (spawn > 1) {
          spawn -= 1;
          const m = new THREE.Mesh(flakeGeo, strandMat);
          m.position.set(holdAt.x + (Math.random() - 0.5) * 0.12, holdAt.y - 0.06, (Math.random() - 0.5) * w * 0.5);
          m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          m.castShadow = true;
          g.add(m);
          flakes.push({ m, vy: -0.3 - Math.random() * 0.4, vx: 0.15 + Math.random() * 0.2, spin: (Math.random() - 0.5) * 6, stop: 0.04 + fill * h * 0.9 });
        }
      }
      // Il mange : des brins tombent dans l'auge, le tas grossit un peu, le foin du râtelier bouge.
      if (nib) {
        looseK = Math.min(1, looseK + dt * 0.05);
        hayPivot.position.x = -0.01 + Math.sin(t * 11) * 0.004;
        if (Math.random() < dt * 3) {
          const m = new THREE.Mesh(flakeGeo, strandMat);
          m.position.set(-d * 0.2 - 0.02, h * 0.2 * Math.max(0.4, fill), (Math.random() - 0.5) * w * 0.3);
          m.scale.setScalar(0.5);
          m.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
          g.add(m);
          flakes.push({ m, vy: -0.1, vx: -0.12, spin: (Math.random() - 0.5) * 4, stop: -trough * 0.7 });
        }
        apply();
      }
      for (const f of flakes) {
        f.vy -= 4.5 * dt;
        f.m.position.y += f.vy * dt;
        f.m.position.x += f.vx * dt;
        if (f.vx > 0) f.m.position.x = Math.min(f.m.position.x, -0.03);
        f.m.rotation.x += f.spin * dt;
        if (f.m.position.y < f.stop) f.dead = true;
      }
      for (let i = flakes.length - 1; i >= 0; i--) {
        if (!flakes[i].dead) continue;
        g.remove(flakes[i].m);
        flakes.splice(i, 1);
      }
    },
    dispose() {
      for (const c of markG.children) c.geometry.dispose();
      keep.dispose();
    },
  };
}

/** Prisme (coin) : le foin entre le mur (x = 0) et les barreaux penchés (x = -d en haut). */
function wedgeGeometry(d, h, w, sx = 8, sy = 8, sz = 10) {
  const geo = new THREE.BoxGeometry(1, 1, 1, sx, sy, sz);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + 0.5; // 0 (barreaux) … 1 (mur)
    const y = p.getY(i) + 0.5;
    const z = p.getZ(i);
    // (le dessus bombé : plus haut au milieu, le foin déborde un peu des barreaux en haut)
    const top = 1 + 0.12 * Math.cos(z * Math.PI) - 0.08 * x;
    const yy = y * h * top;
    const xx = -(1 - x) * d * (yy / h) * 1.05;
    p.setXYZ(i, xx, yy, z * w);
  }
  geo.computeVertexNormals();
  return geo;
}

/** Planche triangulaire (joue du râtelier) : un angle au mur en bas, la hauteur h, l'avancée d. */
function triangleSlab(d, h, t) {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.lineTo(0, h);
  s.lineTo(-d, h);
  s.lineTo(0, 0);
  const geo = new THREE.ExtrudeGeometry(s, { depth: t, bevelEnabled: false });
  geo.translate(0, 0, -t / 2);
  return geo;
}

// ---------------------------------------------------------------- abreuvoir

/**
 * Abreuvoir en tôle galvanisée (demi-cylindre couché sur deux pieds, rebord roulé) : origine au milieu du rebord ;
 * sa longueur suit z. Même interface que le seau du cheval (props.js bucket) : setLevel(k), level, surfaceY(),
 * setMark(lo, hi, target), splashAt(p), flow(k), drink(dt). r : rayon, len : longueur.
 */
export function waterTrough({ r = 0.2, len = 0.8, high = true } = {}) {
  const keep = bag();
  const g = new THREE.Group();
  const galvTex = keep(galvanized());
  galvTex.repeat.set(2, 1);
  const galv = keep(new THREE.MeshStandardMaterial({ color: 0xc9cfd3, roughness: 0.42, metalness: 0.75, map: galvTex, side: THREE.DoubleSide }));
  galv.envMapIntensity = 1.3;
  // coque : demi-cylindre ouvert, l'axe le long de z
  // (angle θ depuis le bas, après rotateX : x = r sin θ, y = -r cos θ ; la moitié du bas : θ de -π/2 à π/2)
  const shellGeo = keep(new THREE.CylinderGeometry(r, r, len, high ? 36 : 24, 1, true, -Math.PI / 2, Math.PI));
  shellGeo.rotateX(Math.PI / 2);
  const shell = shadowed(new THREE.Mesh(shellGeo, galv));
  g.add(shell);
  // fonds (demi-disques) et rebord roulé
  for (const s of [-1, 1]) {
    const cap = shadowed(new THREE.Mesh(keep(new THREE.CircleGeometry(r, high ? 24 : 16, Math.PI, Math.PI)), galv));
    cap.position.z = s * len / 2;
    cap.rotation.y = s > 0 ? Math.PI : 0;
    g.add(cap);
  }
  for (const s of [-1, 1]) {
    const lip = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.012, 0.012, len + 0.02, 10)), galv));
    lip.rotation.x = Math.PI / 2;
    lip.position.x = s * r;
    g.add(lip);
  }
  for (const s of [-1, 1]) {
    const lipE = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(r, 0.012, 8, 24, Math.PI)), galv));
    lipE.position.z = s * len / 2;
    lipE.rotation.z = Math.PI;
    g.add(lipE);
  }
  // pieds en tube écartés (deux par bout, en A), jusqu'au sol (setFloor), et un berceau sous la coque
  const legMat = keep(new THREE.MeshStandardMaterial({ color: 0x6f7a80, roughness: 0.45, metalness: 0.7 }));
  const legs = [];
  const tube = keep(new THREE.CylinderGeometry(0.011, 0.011, 1, 8));
  for (const s of [-1, 1]) {
    const cradle = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(r * 1.01, 0.01, 6, 20, Math.PI)), legMat));
    cradle.rotation.z = Math.PI;
    cradle.position.z = s * len * 0.36;
    g.add(cradle);
    for (const sx of [-1, 1]) {
      const leg = shadowed(new THREE.Mesh(tube, legMat));
      leg.userData.sx = sx;
      leg.position.z = s * len * 0.36;
      g.add(leg);
      legs.push(leg);
    }
  }
  // l'eau : un plan dont la largeur suit le niveau (section ronde)
  const ripple = keep(rippleNormal());
  ripple.repeat.set(3, 2);
  const waterMat = keep(new THREE.MeshStandardMaterial({
    color: 0x2a5c6c, roughness: 0.06, metalness: 0.05, transparent: true, opacity: 0.9, normalMap: ripple, normalScale: new THREE.Vector2(0.3, 0.3),
  }));
  waterMat.envMapIntensity = 1.6;
  const water = new THREE.Mesh(keep(new THREE.PlaneGeometry(1, len * 0.995)), waterMat);
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = true;
  g.add(water);
  const depth = r * 0.96;
  const yAt = (k) => -depth + 0.012 + (depth - 0.03) * clamp(k);
  const halfAt = (y) => Math.sqrt(Math.max(0, r * r - y * y)) * 0.99;
  let level = 0;
  let pour = 0;
  let t = 0;
  const apply = () => {
    const k = clamp(level);
    water.visible = k > 0.01;
    const y = yAt(k);
    water.position.y = y;
    water.scale.x = halfAt(y) * 2;
  };
  apply();
  // zone juste (deux bandes vertes sur les parois) et ligne 🎯 (deux traits blancs)
  const bandMat = keep(new THREE.MeshBasicMaterial({ color: 0x3fae62, transparent: true, opacity: 0.4, side: THREE.DoubleSide, depthWrite: false }));
  const lineMat = keep(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const marks = new THREE.Group();
  marks.visible = false;
  g.add(marks);
  const splash = V(0, 0, 0);
  const splashTex = keep(softDot('255,255,255'));
  const rings = [];
  return {
    group: g,
    water,
    r,
    len,
    setFloor(y) {
      // (chaque pied part du flanc de la coque et s'écarte vers le sol)
      for (const l of legs) {
        const top = V(l.userData.sx * r * 0.7, -r * 0.7, l.position.z);
        const foot = V(l.userData.sx * r * 1.15, y, l.position.z);
        const dir = foot.clone().sub(top);
        l.scale.y = Math.max(0.01, dir.length());
        l.position.copy(top).add(foot).multiplyScalar(0.5);
        l.quaternion.setFromUnitVectors(V(0, 1, 0), dir.normalize());
      }
    },
    setMark(lo, hi, target) {
      for (const c of [...marks.children]) {
        marks.remove(c);
        c.geometry.dispose();
      }
      // angle (depuis le bas) d'une hauteur y : y = -r cos θ
      const ang = (y) => Math.acos(clamp(-y / r, -1, 1));
      const y0 = yAt(lo);
      const y1 = yAt(hi);
      const yt = yAt(target);
      for (const s of [-1, 1]) {
        const a0 = ang(y0);
        const a1 = ang(y1);
        // (de chaque côté : de a0 à a1 depuis le bas, vers +x ou vers -x)
        const geo = new THREE.CylinderGeometry(r * 0.985, r * 0.985, len * 0.97, 8, 1, true, s > 0 ? a0 : -a1, a1 - a0);
        geo.rotateX(Math.PI / 2);
        marks.add(new THREE.Mesh(geo, bandMat));
        const line = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.01, len * 0.97), lineMat);
        line.position.set(s * halfAt(yt) * 0.99, yt, 0);
        marks.add(line);
      }
      marks.visible = true;
      return { y: yt, r: halfAt(yt) };
    },
    get level() { return level; },
    setLevel(k) {
      level = clamp(k);
      apply();
    },
    splashAt(p) { splash.set(p.x, 0, p.z); },
    surfaceY() { return water.position.y; },
    flow(k) { pour = k; },
    drink(dt) {
      level = Math.max(0, level - dt * 0.01);
      apply();
    },
    update(dt) {
      t += dt;
      ripple.offset.set(t * 0.03, t * 0.02);
      waterMat.normalScale.setScalar(0.22 + pour * 0.8);
      if (pour > 0 && water.visible && Math.random() < dt * 12 * pour) {
        const m = new THREE.Mesh(keep(new THREE.RingGeometry(0.6, 1, 24)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, alphaMap: splashTex })));
        m.rotation.x = -Math.PI / 2;
        m.position.set((Math.random() - 0.5) * 0.05 + splash.x, water.position.y + 0.003, (Math.random() - 0.5) * 0.05 + splash.z);
        m.scale.setScalar(0.01);
        g.add(m);
        rings.push({ m, age: 0 });
      }
      for (const rr of rings) {
        rr.age += dt;
        rr.m.scale.setScalar(0.01 + rr.age * 0.2);
        rr.m.material.opacity = Math.max(0, 0.45 * (1 - rr.age / 0.6));
        rr.m.position.y = water.position.y + 0.003;
      }
      for (let i = rings.length - 1; i >= 0; i--) {
        if (rings[i].age < 0.6) continue;
        g.remove(rings[i].m);
        rings[i].m.geometry.dispose();
        rings[i].m.material.dispose();
        rings.splice(i, 1);
      }
    },
    dispose() {
      for (const c of marks.children) c.geometry.dispose();
      keep.dispose();
    },
  };
}

/** Tôle galvanisée : cristaux clairs et sombres (le « fleurage » du zinc), quelques traces. */
function galvanized() {
  return canvasTex(128, 128, (c) => {
    const r = rng(21);
    c.fillStyle = '#c8ced2';
    c.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 160; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.08 + r() * 0.14})` : `rgba(60,70,80,${0.06 + r() * 0.1})`;
      c.beginPath();
      const x = r() * 128;
      const y = r() * 128;
      const s = 4 + r() * 12;
      c.moveTo(x, y);
      for (let k = 0; k < 5; k++) c.lineTo(x + Math.cos(k * 1.3 + r()) * s, y + Math.sin(k * 1.3 + r()) * s);
      c.fill();
    }
    for (let i = 0; i < 8; i++) {
      c.strokeStyle = `rgba(120,100,70,${0.05 + r() * 0.08})`;
      c.lineWidth = 2 + r() * 4;
      c.beginPath();
      const x = r() * 128;
      c.moveTo(x, 0);
      c.lineTo(x + (r() - 0.5) * 20, 128);
      c.stroke();
    }
  }, { key: 'galv' });
}

// ---------------------------------------------------------------- petit décor

/** Botte de paille rectangulaire (deux ficelles) ; origine au sol, au milieu. */
export function strawBale(keep, { w = 0.9, h = 0.4, d = 0.48, seed = 1 } = {}) {
  const g = new THREE.Group();
  const tex = keep(baleTexture());
  const mat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 1, color: 0xf0e2b8 }));
  const geo = keep(lumpy(new THREE.BoxGeometry(w, h, d, 8, 4, 5), 0.012, seed, 11));
  // (coins un peu arrondis : la paille pressée se tasse)
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) / (w / 2);
    const y = p.getY(i) / (h / 2);
    const z = p.getZ(i) / (d / 2);
    const k = Math.max(0, Math.abs(y) - 0.7) * Math.max(0, Math.abs(z) - 0.7) * 1.4;
    p.setY(i, p.getY(i) * (1 - k * 0.15));
    p.setZ(i, p.getZ(i) * (1 - k * 0.12));
    void x;
  }
  geo.computeVertexNormals();
  const bale = shadowed(new THREE.Mesh(geo, mat));
  bale.position.y = h / 2;
  g.add(bale);
  const twine = keep(new THREE.MeshStandardMaterial({ color: 0xc84a2a, roughness: 0.7 }));
  for (const x of [-w * 0.27, w * 0.27]) {
    const tw = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(1, 0.012, 4, 24)), twine), false);
    tw.scale.set(1, h / 2 + 0.006, d / 2 + 0.006);
    tw.rotation.y = Math.PI / 2;
    tw.scale.set(d / 2 + 0.008, h / 2 + 0.008, 1);
    tw.position.set(x, h / 2, 0);
    g.add(tw);
  }
  return g;
}

/** Paille pressée vue de côté : brins couchés dans le même sens, tranches de la presse. */
function baleTexture() {
  return canvasTex(256, 128, (c) => {
    const r = rng(31);
    c.fillStyle = '#c9a65c';
    c.fillRect(0, 0, 256, 128);
    for (let i = 0; i < 1800; i++) {
      const x = r() * 256;
      const y = r() * 128;
      const l = 8 + r() * 22;
      const a = (r() - 0.5) * 0.7;
      c.strokeStyle = r() < 0.2 ? `rgba(120,85,40,${0.3 + r() * 0.3})` : `rgba(${235 + r() * 20},${205 + r() * 30},${120 + r() * 50},${0.4 + r() * 0.5})`;
      c.lineWidth = 1 + r() * 1.6;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.stroke();
    }
    // tranches de la presse
    for (let x = 0; x < 256; x += 22 + r() * 10) {
      c.fillStyle = 'rgba(90,60,25,0.18)';
      c.fillRect(x, 0, 2, 128);
    }
  }, { key: 'bale' });
}

/** Pierre à sel dans son support en métal, au mur (origine contre le mur, elle sort vers +z). */
export function saltLick(keep) {
  const g = new THREE.Group();
  const holder = keep(new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.5, metalness: 0.6 }));
  const salt = keep(new THREE.MeshStandardMaterial({ color: 0xe6d6cc, roughness: 0.6, map: keep(noiseTexture('#e8d8ce', 0.22, 15, 64)) }));
  const back = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.16, 0.16, 0.012)), holder));
  back.position.z = 0.006;
  g.add(back);
  const tray = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.16, 0.02, 0.13)), holder));
  tray.position.set(0, -0.07, 0.065);
  g.add(tray);
  const block = shadowed(new THREE.Mesh(keep(lumpy(new THREE.BoxGeometry(0.13, 0.11, 0.1, 4, 4, 4), 0.006, 3, 30)), salt));
  block.position.set(0, -0.01, 0.06);
  // (léché : un creux arrondi devant)
  g.add(block);
  return g;
}

/** Fourche à foin en bois et métal (origine : au bout des dents, au sol ; le manche monte en +y). */
export function pitchfork(keep) {
  const g = new THREE.Group();
  const wood = keep(new THREE.MeshStandardMaterial({ color: 0x9a7448, roughness: 0.6 }));
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x6d7378, roughness: 0.4, metalness: 0.8 }));
  const shaft = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.016, 0.018, 1.25, 10)), wood));
  shaft.position.y = 0.3 + 0.625;
  g.add(shaft);
  const neck = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.14, 0.02, 0.02)), metal));
  neck.position.y = 0.3;
  g.add(neck);
  for (const x of [-0.06, -0.02, 0.02, 0.06]) {
    const tine = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.005, 0.003, 0.3, 6)), metal));
    tine.position.set(x, 0.15, 0.01);
    tine.rotation.x = 0.1;
    g.add(tine);
  }
  return g;
}

/** Lanterne de grange accrochée à une poutre (origine : au crochet). emissive : la flamme, toujours un peu allumée. */
export function lantern(keep) {
  const g = new THREE.Group();
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0x2c2a28, roughness: 0.45, metalness: 0.7 }));
  const glass = keep(new THREE.MeshStandardMaterial({ color: 0xfff2d0, emissive: 0xffb860, emissiveIntensity: 1.4, roughness: 0.2, transparent: true, opacity: 0.85 }));
  const hook = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.025, 0.004, 6, 14)), metal), false);
  g.add(hook);
  const top = shadowed(new THREE.Mesh(keep(new THREE.ConeGeometry(0.06, 0.05, 12)), metal), false);
  top.position.y = -0.05;
  g.add(top);
  const body = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04, 0.045, 0.11, 12)), glass);
  body.position.y = -0.13;
  g.add(body);
  for (let i = 0; i < 4; i++) {
    const bar = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(0.006, 0.12, 0.006)), metal), false);
    const a = (i / 4) * Math.PI * 2;
    bar.position.set(Math.cos(a) * 0.046, -0.13, Math.sin(a) * 0.046);
    g.add(bar);
  }
  const base = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.055, 0.055, 0.02, 12)), metal), false);
  base.position.y = -0.2;
  g.add(base);
  return g;
}

// ---------------------------------------------------------------- friandises de la ferme

/**
 * La friandise de chaque espèce (comme le jeu dessiné : 🍏 pour le mouton, 🥬 pour la chèvre, 🌽 pour la vache) :
 * une pomme verte, des feuilles de chou, un épi de maïs. Origine au milieu ; posée à plat dans la main.
 */
export function farmTreat(species, keep) {
  const g = new THREE.Group();
  if (species === 'goat') {
    // trois feuilles de chou froissées, nervures claires
    const tex = keep(canvasTex(64, 64, (c) => {
      const r = rng(41);
      c.fillStyle = '#5fae3e';
      c.fillRect(0, 0, 64, 64);
      for (let i = 0; i < 200; i++) {
        c.fillStyle = r() < 0.5 ? 'rgba(20,70,10,0.12)' : 'rgba(220,255,180,0.14)';
        c.fillRect(r() * 64, r() * 64, 2, 2);
      }
      c.strokeStyle = 'rgba(225,245,190,0.85)';
      c.lineWidth = 3;
      c.beginPath();
      c.moveTo(32, 64);
      c.lineTo(32, 0);
      c.stroke();
      c.lineWidth = 1.5;
      for (let y = 8; y < 60; y += 9) {
        c.beginPath();
        c.moveTo(32, y + 6);
        c.quadraticCurveTo(18, y + 2, 4, y - 4);
        c.moveTo(32, y + 6);
        c.quadraticCurveTo(46, y + 2, 60, y - 4);
        c.stroke();
      }
    }, { key: 'cabbageLeaf' }));
    const mat = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.55, side: THREE.DoubleSide }));
    for (let i = 0; i < 3; i++) {
      const geo = keep(new THREE.SphereGeometry(0.055, 14, 10, 0, Math.PI * 1.1, 0, Math.PI * 0.55));
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k);
        const y = p.getY(k);
        const z = p.getZ(k);
        p.setXYZ(k, x * 1.25, y * 0.55 + Math.sin(x * 60 + z * 40) * 0.004, z);
      }
      geo.computeVertexNormals();
      const leaf = shadowed(new THREE.Mesh(geo, mat));
      leaf.rotation.set(-0.2 + i * 0.15, i * 2.1, 0.1 * i);
      leaf.position.set((i - 1) * 0.012, 0.01 + i * 0.006, (i - 1) * 0.01);
      g.add(leaf);
    }
  } else if (species === 'cow') {
    // épi de maïs : grains en rangées, deux feuilles de l'enveloppe ouvertes
    const tex = keep(canvasTex(64, 128, (c) => {
      c.fillStyle = '#c98a14';
      c.fillRect(0, 0, 64, 128);
      for (let y = 0; y < 128; y += 7) {
        for (let x = (y / 7) % 2 ? 0 : 4; x < 64; x += 8) {
          const gr = c.createRadialGradient(x + 3, y + 3, 0, x + 3, y + 3, 4);
          gr.addColorStop(0, '#ffe27a');
          gr.addColorStop(0.7, '#f2bc2e');
          gr.addColorStop(1, '#b07a10');
          c.fillStyle = gr;
          c.beginPath();
          c.ellipse(x + 3.5, y + 3.2, 3.6, 3.2, 0, 0, Math.PI * 2);
          c.fill();
        }
      }
    }, { key: 'cornCob' }));
    const corn = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }));
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const k = i / 12;
      pts.push(new THREE.Vector2(Math.max(0.002, 0.021 * Math.sin(Math.min(1, k * 1.3 + 0.12) * Math.PI * 0.55) * (1 - 0.35 * k)), (k - 0.5) * 0.17));
    }
    const cob = shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry(pts, 18)), corn));
    cob.rotation.z = Math.PI / 2;
    g.add(cob);
    const husk = keep(new THREE.MeshStandardMaterial({ color: 0xb7c27a, roughness: 0.7, side: THREE.DoubleSide }));
    for (let i = 0; i < 3; i++) {
      const geo = keep(new THREE.PlaneGeometry(0.11, 0.035, 6, 1));
      const p = geo.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const x = p.getX(k);
        p.setXYZ(k, x, p.getY(k) * (0.5 + (x + 0.055) * 8), -Math.pow(Math.max(0, -x + 0.02), 2) * 6);
      }
      geo.computeVertexNormals();
      const h = shadowed(new THREE.Mesh(geo, husk));
      h.position.set(0.1, 0, 0);
      h.rotation.set(i * 2.1, 0.5 - i * 0.3, 0.25);
      g.add(h);
    }
  } else {
    // pomme verte
    const pts = [];
    for (let i = 0; i <= 16; i++) {
      const a = (i / 16) * Math.PI;
      const r = Math.sin(a) * (0.038 + 0.006 * Math.sin(a * 2));
      pts.push(new THREE.Vector2(Math.max(0.0001, r), -Math.cos(a) * 0.036 - (i < 3 || i > 13 ? 0.004 : 0)));
    }
    const skin = keep(new THREE.MeshStandardMaterial({ color: 0x9cc94a, roughness: 0.32, map: keep(noiseTexture('#a8d058', 0.2, 8, 64)) }));
    const apple = shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry(pts, 24)), skin));
    g.add(apple);
    const stem = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.003, 0.004, 0.026, 6)), keep(new THREE.MeshStandardMaterial({ color: 0x5a3a1c }))));
    stem.position.y = 0.04;
    stem.rotation.z = 0.3;
    g.add(stem);
  }
  return g;
}

// ---------------------------------------------------------------- traite : le seau à lait et le tabouret

/** Profil d'un seau (rayon du haut, du bas, profondeur, épaisseur) pour un LatheGeometry. */
function pailProfile(rTop, rBot, depth, th) {
  const lip = 0.01;
  return [
    [0.0, -depth], [rBot, -depth], [rTop, -lip], [rTop + lip * 0.7, 0], [rTop - th + 0.002, lip * 0.3],
    [rTop - th, -lip], [rBot - th, -depth + th], [0.0, -depth + th],
  ].map(([x, y]) => new THREE.Vector2(x, y));
}

/**
 * Seau à lait en inox (le bord du haut à l'origine) : même interface que le seau d'eau du cheval (setLevel, level,
 * surfaceY, setMark) ; le lait est blanc crème, avec de la mousse quand il gicle (froth). size : rayon du haut (m).
 */
export function milkPail({ size = 0.13, high = true } = {}) {
  const keep = bag();
  const g = new THREE.Group();
  const P = { r: size, rBot: size * 0.8, depth: size * 2.1, th: 0.006 };
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.22, metalness: 0.9, side: THREE.DoubleSide }));
  steel.envMapIntensity = 1.4;
  const shell = shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry(pailProfile(P.r, P.rBot, P.depth, P.th), high ? 40 : 28)), steel));
  g.add(shell);
  for (const y of [-P.depth * 0.2, -P.depth * 0.75]) {
    const ring = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(lerp(P.r, P.rBot, -y / P.depth) + 0.002, 0.004, 6, 40)), steel));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    g.add(ring);
  }
  const handle = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(P.r + 0.008, 0.004, 6, 32, Math.PI)), steel));
  handle.rotation.y = Math.PI / 2;
  handle.rotation.z = -0.5;
  g.add(handle);
  const milkTex = keep(noiseTexture('#fbf8ef', 0.06, 19, 64));
  const milkMat = keep(new THREE.MeshStandardMaterial({ color: 0xfbf7ec, roughness: 0.35, map: milkTex }));
  const milk = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 40)), milkMat);
  milk.rotation.x = -Math.PI / 2;
  milk.receiveShadow = true;
  g.add(milk);
  // mousse : petites bulles sur le lait, autour de là où le jet tombe
  const foamMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, transparent: true, opacity: 0.9 }));
  const foam = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(1, 8, 6)), foamMat, 40);
  foam.count = 0;
  g.add(foam);
  keep({ dispose: () => foam.dispose() });
  const yAt = (k) => -P.depth + P.th + (P.depth - P.th - 0.015) * clamp(k);
  const rAt = (y) => lerp(P.rBot - P.th, P.r - P.th, (y + P.depth) / P.depth) * 0.99;
  let level = 0;
  let froth = 0;
  const m4 = new THREE.Matrix4();
  const bubbles = [];
  const fr = rng(5);
  for (let i = 0; i < 40; i++) bubbles.push({ a: fr() * Math.PI * 2, d: Math.sqrt(fr()), s: 0.003 + fr() * 0.006 });
  const apply = () => {
    const k = clamp(level);
    milk.visible = k > 0.01;
    const y = yAt(k);
    milk.position.y = y;
    milk.scale.setScalar(rAt(y));
    const nb = Math.round(clamp(froth) * 40 * (k > 0.01 ? 1 : 0));
    foam.count = nb;
    for (let i = 0; i < nb; i++) {
      const b = bubbles[i];
      const r = rAt(y) * b.d * 0.85;
      m4.makeScale(b.s, b.s * 0.5, b.s).setPosition(Math.cos(b.a) * r, y + 0.001, Math.sin(b.a) * r);
      foam.setMatrixAt(i, m4);
    }
    foam.instanceMatrix.needsUpdate = true;
  };
  apply();
  const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(1, 1, 1, 36, 1, true)), keep(new THREE.MeshBasicMaterial({ color: 0x3fae62, transparent: true, opacity: 0.4, side: THREE.BackSide, depthWrite: false })));
  band.visible = false;
  g.add(band);
  const line = new THREE.Mesh(keep(new THREE.TorusGeometry(1, 0.03, 6, 40)), keep(new THREE.MeshBasicMaterial({ color: 0x1e7a40 })));
  line.rotation.x = Math.PI / 2;
  line.visible = false;
  g.add(line);
  return {
    group: g,
    size: P,
    setMark(lo, hi, target) {
      const y0 = yAt(lo);
      const y1 = yAt(hi);
      band.position.y = (y0 + y1) / 2;
      const r = rAt(band.position.y);
      band.scale.set(r, y1 - y0, r);
      band.visible = true;
      line.position.y = yAt(target);
      line.scale.setScalar(rAt(line.position.y));
      line.visible = true;
      return { y: line.position.y, r: rAt(line.position.y) };
    },
    get level() { return level; },
    setLevel(k) {
      level = clamp(k);
      apply();
    },
    surfaceY() { return milk.position.y; },
    /** Un jet arrive : la mousse monte, puis retombe. */
    froth(k) {
      froth = Math.max(froth, k);
      apply();
    },
    update(dt) {
      if (froth > 0) {
        froth = Math.max(0, froth - dt * 0.35);
        apply();
      }
    },
    dispose() { keep.dispose(); },
  };
}

/** Tabouret de traite à trois pieds (origine au sol, au milieu). h : hauteur de l'assise. */
export function milkStool(keep, h = 0.32) {
  const g = new THREE.Group();
  const wood = keep(new THREE.MeshStandardMaterial({ map: keep(barnWood(23, false, 'pale')), roughness: 0.7 }));
  const seat = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.15, 0.15, 0.035, 24)), wood));
  seat.position.y = h;
  g.add(seat);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.3;
    const leg = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.016, 0.02, h * 1.05, 8)), wood));
    leg.position.set(Math.cos(a) * 0.08, h / 2, Math.sin(a) * 0.08);
    leg.rotation.set(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18);
    g.add(leg);
  }
  return g;
}

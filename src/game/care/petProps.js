// Accessoires 3D des soins des animaux de compagnie (chien, chat, lapin) : gamelle en céramique à son nom (elle se
// remplit vraiment de croquettes ou d'eau, et se vide quand il mange ou boit), sac de croquettes tenu par notre main
// qui se penche et verse (les croquettes tombent une à une), carafe qui verse un filet d'eau, friandises (biscuit
// en os, poisson, bâtonnet de carotte), brosse à picots. Chaque fabrique renvoie { group, …, update(dt), dispose() } ;
// ce qu'elle crée est à elle (libéré par dispose).

import * as THREE from 'three';
import { rippleNormal, softDot, noiseTexture, rng } from './textures.js';
import { bowlTexture, bagTexture } from './petTextures.js';
import { petHand } from './petHand.js';

const lerp = (a, b, k) => a + (b - a) * k;
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/** Ce qu'on crée, à libérer ensemble. */
export function own() {
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

export function shadowed(m, cast = true) {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

// ---------------------------------------------------------------- croquettes

/** Ce que mange chaque espèce : couleurs et forme des morceaux, et l'étiquette du sac. */
export const FOODS = {
  dog: { colors: [0x8a5a2b, 0x9c6a35, 0x6f4520, 0xa8743c], shape: 'disc', size: 0.011 },
  cat: { colors: [0xb36b3a, 0x8f4f2a, 0xc98a52, 0x7a4424], shape: 'star', size: 0.0075 },
  rabbit: { colors: [0x8a9a4a, 0x9aa858, 0x7a8a40, 0xf08a24, 0xe6c86a], shape: 'pellet', size: 0.0085 },
};

/** Géométrie d'un morceau (rayon 1) : rondelle (chien), petit trèfle (chat), granulé (lapin). */
function kibbleGeometry(shape) {
  if (shape === 'pellet') {
    const g = new THREE.CylinderGeometry(0.55, 0.55, 1.6, 7, 1);
    g.rotateZ(Math.PI / 2);
    return g;
  }
  if (shape === 'star') {
    const s = new THREE.Shape();
    for (let i = 0; i <= 30; i++) {
      const a = (i / 30) * Math.PI * 2;
      const r = 0.8 + 0.25 * Math.cos(a * 3);
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.55, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.15, bevelSegments: 1, curveSegments: 6 });
    g.center();
    g.rotateX(Math.PI / 2);
    return g;
  }
  const g = new THREE.SphereGeometry(1, 10, 6);
  g.scale(1, 0.55, 1);
  return g;
}

// ---------------------------------------------------------------- la gamelle

/**
 * Gamelle en céramique émaillée (le bord du haut à l'origine, posée sur le sol à y = -depth). o : { r (rayon du
 * bord), color, name (son prénom, peint sur le côté), content ('food' | 'water'), food (FOODS[espèce]) }.
 * setLevel(k) : ce qu'il y a dedans (0 vide, 1 au bord) ; eat(dt) / drink(dt) : il mange, il boit.
 */
export function petBowl({ r = 0.09, color = 0xd9574a, name = '', content = 'food', food = FOODS.dog, high = true } = {}) {
  const keep = own();
  const g = new THREE.Group();
  const depth = r * 0.55;
  const th = r * 0.13;
  const rBot = r * 0.86;
  const baseR = r * 1.06;
  const D = { r, depth, th, rBot, inR: r - th, inBot: rBot - th * 1.4 };
  // Paroi extérieure (avec son prénom), bord arrondi, intérieur clair, dessous.
  const outerPts = [];
  for (let i = 0; i <= 12; i++) {
    const k = i / 12;
    // (le bas plus large, comme une gamelle stable qu'on ne renverse pas)
    outerPts.push(new THREE.Vector2(lerp(baseR, r + th * 0.15, Math.pow(k, 0.8)) - Math.sin(k * Math.PI) * r * 0.04, -depth + k * depth));
  }
  const outerGeo = keep(new THREE.LatheGeometry(outerPts, high ? 48 : 36));
  const glaze = keep(new THREE.MeshStandardMaterial({ map: keep(bowlTexture(color, name)), roughness: 0.22, metalness: 0 }));
  const outer = shadowed(new THREE.Mesh(outerGeo, glaze));
  g.add(outer);
  // le bord : un tore arrondi
  const rim = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(r - th * 0.42, th * 0.58, 10, high ? 48 : 36)), keep(new THREE.MeshStandardMaterial({ color, roughness: 0.2 }))));
  rim.rotation.x = Math.PI / 2;
  g.add(rim);
  // l'intérieur : émail crème, creux
  const innerPts = [new THREE.Vector2(0.0001, -depth + th), new THREE.Vector2(D.inBot * 0.85, -depth + th), new THREE.Vector2(D.inBot, -depth + th * 1.6)];
  for (let i = 1; i <= 8; i++) {
    const k = i / 8;
    innerPts.push(new THREE.Vector2(lerp(D.inBot, D.inR + th * 0.08, k), lerp(-depth + th * 1.6, 0, k)));
  }
  const inner = shadowed(new THREE.Mesh(keep(new THREE.LatheGeometry(innerPts, high ? 48 : 36)), keep(new THREE.MeshStandardMaterial({ color: 0xf6efe2, roughness: 0.18, side: THREE.BackSide }))), false);
  g.add(inner);
  // un fond pour la base (on ne voit jamais le dessous, mais l'ombre en a besoin)
  const base = shadowed(new THREE.Mesh(keep(new THREE.CircleGeometry(baseR, 32)), glaze));
  base.rotation.x = Math.PI / 2;
  base.position.y = -depth + 0.001;
  g.add(base);
  const rAt = (y) => lerp(D.inBot, D.inR, clamp((y + depth - th * 1.6) / (depth - th * 1.6)));
  const yAt = (k) => -depth + th * 1.1 + (depth - th * 1.4) * clamp(k);

  // ---- le contenu
  let level = 0;
  let t = 0;
  const ripple = content === 'water' ? keep(rippleNormal()) : null;
  let surface;
  let pieces = null;
  const N = content === 'food' ? (high ? 150 : 110) : 0;
  const slots = [];
  if (content === 'water') {
    ripple.repeat.set(1.5, 1.5);
    const mat = keep(new THREE.MeshStandardMaterial({ color: 0x5f8fa8, roughness: 0.04, metalness: 0.05, transparent: true, opacity: 0.62, normalMap: ripple, normalScale: new THREE.Vector2(0.3, 0.3) }));
    mat.envMapIntensity = 1.8;
    surface = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 40)), mat);
    surface.rotation.x = -Math.PI / 2;
    surface.receiveShadow = true;
  } else {
    // un tas bombé (dôme), et les morceaux posés dessus
    const dome = keep(new THREE.SphereGeometry(1, 28, 8, 0, Math.PI * 2, 0, Math.PI / 2));
    const domeMat = keep(new THREE.MeshStandardMaterial({ color: food.colors[0], roughness: 0.8, map: keep(noiseTexture('#9a7a5a', 0.4, 4, 64)) }));
    surface = shadowed(new THREE.Mesh(dome, domeMat), false);
    const kg = keep(kibbleGeometry(food.shape));
    const km = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 }));
    pieces = new THREE.InstancedMesh(kg, km, N);
    pieces.castShadow = true;
    pieces.receiveShadow = true;
    const R = rng(7);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      // place sur le tas : rayon relatif, angle, et à quel niveau ce morceau apparaît
      slots.push({ rr: Math.sqrt(R()), a: R() * Math.PI * 2, at: R() * 0.95, spin: v3(R() * 6, R() * 6, R() * 6), s: 0.8 + R() * 0.45, eaten: false });
      pieces.setColorAt(i, c.setHex(food.colors[Math.floor(R() * food.colors.length)]).multiplyScalar(0.85 + R() * 0.3));
    }
    keep({ dispose: () => pieces.dispose() });
    g.add(pieces);
  }
  g.add(surface);
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const apply = () => {
    const k = clamp(level);
    surface.visible = k > 0.01;
    const y = yAt(k);
    const rr = rAt(y) * 0.985;
    if (content === 'water') {
      surface.position.y = y;
      surface.scale.setScalar(rr);
      return;
    }
    // le tas : bombé au milieu, au ras de la paroi
    const hump = Math.min(depth * 0.35, r * 0.18) * Math.min(1, k * 3);
    surface.position.y = y - hump * 0.25;
    surface.scale.set(rr, hump + 0.001, rr);
    const size = food.size * (r / 0.09) ** 0.35;
    for (let i = 0; i < N; i++) {
      const s = slots[i];
      const show = !s.eaten && s.at < k * 1.02 && k > 0.02;
      const rad = s.rr * rr * 0.92;
      const yy = surface.position.y + hump * Math.sqrt(Math.max(0, 1 - (rad / rr) ** 2)) + size * 0.3;
      e.set(s.spin.x, s.spin.y, s.spin.z);
      q.setFromEuler(e);
      const sc = show ? size * s.s : 0;
      m4.compose(v3(Math.cos(s.a) * rad, yy, Math.sin(s.a) * rad), q, v3(sc, sc, sc));
      pieces.setMatrixAt(i, m4);
    }
    pieces.instanceMatrix.needsUpdate = true;
  };
  apply();

  // la bande verte « juste ce qu'il faut » et la ligne 🎯, sur la paroi intérieure (setMark)
  const band = new THREE.Mesh(keep(new THREE.CylinderGeometry(1, 1, 1, 40, 1, true)), keep(new THREE.MeshBasicMaterial({ color: 0x3fae62, transparent: true, opacity: 0.32, side: THREE.BackSide, depthWrite: false })));
  band.visible = false;
  band.renderOrder = 3;
  g.add(band);
  const line = new THREE.Mesh(keep(new THREE.TorusGeometry(1, 0.02, 6, 48)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })));
  line.rotation.x = Math.PI / 2;
  line.visible = false;
  g.add(line);

  // éclaboussures (eau) : anneaux qui s'élargissent ; rebonds (croquettes) : dans le jeu (kibbleRain)
  const splashTex = content === 'water' ? keep(softDot('255,255,255')) : null;
  const rings = [];
  let pour = 0;
  const splash = v3();
  return {
    group: g,
    dims: D,
    get level() { return level; },
    setLevel(k) {
      if (Math.abs(clamp(k) - level) < 1e-4) return;
      level = clamp(k);
      apply();
    },
    /** Hauteur du contenu (repère de la gamelle). */
    surfaceY: () => (content === 'water' ? yAt(level) : surface.position.y + Math.min(depth * 0.35, r * 0.18) * Math.min(1, level * 3)),
    /** Rayon intérieur à la hauteur y (repère de la gamelle). */
    radiusAt: rAt,
    /** La zone juste [lo, hi] et la ligne 🎯 (parts de la gamelle). Renvoie la ligne { y, r }. */
    setMark(lo, hi, target) {
      const y0 = yAt(lo);
      const y1 = yAt(hi);
      band.position.y = (y0 + y1) / 2;
      const rr = rAt(band.position.y) * 0.995;
      band.scale.set(rr, Math.max(0.002, y1 - y0), rr);
      band.visible = true;
      line.position.y = yAt(target);
      line.scale.setScalar(rAt(line.position.y) * 0.99);
      line.visible = true;
      return { y: line.position.y, r: rAt(line.position.y) };
    },
    hideMark() {
      band.visible = false;
      line.visible = false;
    },
    flow(k, at = null) {
      pour = k;
      if (at) splash.copy(at);
    },
    /** Il mange : quelques morceaux disparaissent, le niveau baisse doucement. */
    eat(dt, rate = 0.05) {
      level = Math.max(0, level - dt * rate);
      apply();
    },
    drink(dt, rate = 0.03) {
      level = Math.max(0, level - dt * rate);
      apply();
    },
    update(dt) {
      t += dt;
      if (ripple) {
        ripple.offset.set(t * 0.04, t * 0.03);
        surface.material.normalScale.setScalar(0.22 + pour * 0.9);
        if (pour > 0 && surface.visible && Math.random() < dt * 14 * pour) {
          const m = new THREE.Mesh(keep(new THREE.RingGeometry(0.6, 1, 24)), keep(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, alphaMap: splashTex })));
          m.rotation.x = -Math.PI / 2;
          m.position.set(splash.x + (Math.random() - 0.5) * r * 0.2, surface.position.y + 0.002, splash.z + (Math.random() - 0.5) * r * 0.2);
          m.scale.setScalar(0.004);
          g.add(m);
          rings.push({ m, age: 0 });
        }
        for (const rr of rings) {
          rr.age += dt;
          rr.m.scale.setScalar(0.004 + rr.age * r * 1.4);
          rr.m.material.opacity = Math.max(0, 0.5 * (1 - rr.age / 0.55));
          rr.m.position.y = surface.position.y + 0.002;
        }
        for (let i = rings.length - 1; i >= 0; i--) {
          if (rings[i].age < 0.55) continue;
          g.remove(rings[i].m);
          rings[i].m.geometry.dispose();
          rings[i].m.material.dispose();
          rings.splice(i, 1);
        }
      }
    },
    dispose() {
      for (const rr of rings) {
        rr.m.geometry.dispose();
        rr.m.material.dispose();
      }
      keep.dispose();
    },
  };
}

/**
 * Pose notre main sur un objet tenu : la paume en grip (repère monde), tournée vers `toward` (direction monde de la
 * paume), le bras qui vient de notre épaule (petHand.js shoulderFor : en bas à droite de l'image, vers nous).
 */
export function holdHand(hand, grip, toward, shoulder = null) {
  // (de l'épaule vers la main : l'épaule est près de la caméra, à droite — le bras entre par le bord de l'image)
  const fingers = shoulder ? grip.clone().sub(shoulder).normalize() : v3(-0.55, -0.6, -0.55).normalize();
  const y = toward.clone().normalize();
  const x = fingers.clone().addScaledVector(y, -fingers.dot(y)).normalize();
  const z = new THREE.Vector3().crossVectors(x, y).normalize();
  const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
  // (la paume posée sur la surface, pas dedans ; repère du parent de la main)
  const at = grip.clone().addScaledVector(y, -0.012);
  const parent = hand.parent;
  if (parent) {
    parent.updateWorldMatrix(true, false);
    parent.worldToLocal(at);
    q.premultiply(parent.getWorldQuaternion(new THREE.Quaternion()).invert());
  }
  hand.position.copy(at);
  hand.quaternion.copy(q);
}

// ---------------------------------------------------------------- le sac de croquettes, et la pluie de croquettes

/**
 * Sac de croquettes en papier kraft, ouvert en haut, tenu par notre main (couleurs de l'avatar). Origine : le coin
 * de l'ouverture d'où tombent les croquettes ; le sac pend dessous, vers +x (il verse vers -x). setTilt(k) : 0 droit,
 * 1 penché pour verser.
 */
export function kibbleBag({ kind = 'dog', size = 1, hand = null, shoulder = null } = {}) {
  const keep = own();
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  g.add(pivot);
  const W = 0.16 * size;
  const H = 0.24 * size;
  const Dp = 0.08 * size;
  const geo = keep(new THREE.BoxGeometry(W, H, Dp, 6, 8, 3));
  // un sac bombé, froissé, plus étroit en haut (le haut replié)
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const k = y / H + 0.5;
    const bulge = 1 + 0.18 * Math.sin(k * Math.PI) - 0.1 * k;
    const crease = Math.sin(x * 90 + y * 40) * 0.0025 * size;
    p.setXYZ(i, x * (1 - 0.06 * k), y, z * bulge + crease);
  }
  geo.computeVertexNormals();
  const tex = keep(bagTexture(kind));
  const paper = keep(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  const body = shadowed(new THREE.Mesh(geo, paper));
  // (le coin d'ouverture en haut à gauche : le sac est décalé vers +x et vers le bas)
  body.position.set(W * 0.5, -H * 0.5, 0);
  pivot.add(body);
  // le bord replié de l'ouverture
  const lip = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(W * 0.96, 0.014 * size, Dp * 1.12)), keep(new THREE.MeshStandardMaterial({ color: 0xc9a46c, roughness: 0.9 }))));
  lip.position.set(W * 0.5, 0, 0);
  pivot.add(lip);
  // notre main, qui tient le sac par sa face avant, près du fond (posée à chaque image : holdHand)
  const h = hand ? petHand(keep, { ...hand, grip: 0.62, size: hand.size ?? clamp(0.55 + 0.4 * size, 0.62, 1) }) : null;
  if (h) g.add(h);
  let tilt = 0;
  let want = 0;
  return {
    group: g,
    /** Point d'où tombent les croquettes (repère monde). */
    mouth: (out = v3()) => pivot.localToWorld(out.set(0.004 * size, 0.004 * size, 0)),
    setTilt(k) { want = clamp(k); },
    get tilt() { return tilt; },
    update(dt) {
      tilt += (want - tilt) * (1 - Math.pow(0.5, dt / 0.12));
      // (penché au-delà de l'horizontale : l'ouverture regarde la gamelle, le fond du sac en l'air)
      pivot.rotation.z = tilt * 1.95 + Math.sin(performance.now() * 0.02) * 0.02 * want;
      if (h) {
        g.updateMatrixWorld(true);
        const grip = pivot.localToWorld(v3(W * 0.78, -H * 0.62, Dp * 0.62));
        holdHand(h, grip, v3(0, 0, -1), shoulder?.(grip));
      }
    },
    dispose() { keep.dispose(); },
  };
}

/**
 * Pluie de croquettes : des morceaux qui tombent de `from()` vers la gamelle et disparaissent en arrivant sur le tas
 * (le tas, lui, monte avec le niveau que tient la logique du jeu). spawn(n) : n morceaux de plus.
 */
export function kibbleRain(food, max = 60) {
  const keep = own();
  const kg = keep(kibbleGeometry(food.shape));
  const km = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62 }));
  const mesh = new THREE.InstancedMesh(kg, km, max);
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  const c = new THREE.Color();
  const live = [];
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  for (let i = 0; i < max; i++) {
    mesh.setMatrixAt(i, zero);
    mesh.setColorAt(i, c.setHex(food.colors[i % food.colors.length]).multiplyScalar(0.85 + ((i * 37) % 10) / 30));
  }
  let free = [...Array(max).keys()];
  return {
    mesh,
    /** Un morceau part de p (monde), vitesse v ; il s'arrête à la hauteur floorY (monde), au rayon rr de c. */
    spawn(p, v, size) {
      const i = free.pop();
      if (i === undefined) return;
      live.push({ i, p: p.clone(), v: v.clone(), a: v3(Math.random() * 6, Math.random() * 6, Math.random() * 6), w: v3((Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 20), s: size * (0.8 + Math.random() * 0.4), bounce: 0 });
    },
    /** stopY(p) : hauteur où le morceau se pose (monde), ou null s'il tombe par terre. */
    update(dt, stopY) {
      for (const k of live) {
        k.v.y -= 9.8 * dt;
        k.p.addScaledVector(k.v, dt);
        k.a.addScaledVector(k.w, dt);
        const sy = stopY(k.p);
        if (sy !== null && k.p.y <= sy) {
          if (k.bounce < 1 && Math.random() < 0.6) {
            k.bounce++;
            k.p.y = sy;
            k.v.set(k.v.x * 0.3 + (Math.random() - 0.5) * 0.3, Math.abs(k.v.y) * 0.25, k.v.z * 0.3 + (Math.random() - 0.5) * 0.3);
          } else k.dead = true;
        }
        if (k.p.y < -0.05) k.dead = true;
        e.set(k.a.x, k.a.y, k.a.z);
        q.setFromEuler(e);
        m4.compose(k.p, q, v3(k.s, k.s, k.s));
        mesh.setMatrixAt(k.i, k.dead ? zero : m4);
      }
      for (let j = live.length - 1; j >= 0; j--) {
        if (!live[j].dead) continue;
        free.push(live[j].i);
        live.splice(j, 1);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
    get count() { return live.length; },
    clear() {
      for (const k of live) mesh.setMatrixAt(k.i, zero);
      live.length = 0;
      free = [...Array(max).keys()];
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      mesh.dispose();
      keep.dispose();
    },
  };
}

// ---------------------------------------------------------------- la carafe et le filet d'eau

/**
 * Carafe en céramique (anse, bec verseur) tenue par notre main. Origine : le bout du bec ; la carafe est derrière
 * (vers +x) et verse vers -x. setTilt(k) : 0 droite, 1 penchée ; setStream(on, toY) : le filet d'eau du bec
 * jusqu'à la hauteur toY (monde).
 */
export function pitcher({ size = 1, color = 0xe9f0f2, hand = null, shoulder = null } = {}) {
  const keep = own();
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  g.add(pivot);
  const s = size;
  const pts = [];
  // profil : pied, panse ronde, col resserré, bord évasé
  const prof = [[0.045, 0], [0.058, 0.02], [0.064, 0.07], [0.058, 0.12], [0.044, 0.155], [0.04, 0.175], [0.047, 0.19]];
  for (const [r, y] of prof) pts.push(new THREE.Vector2(r * s, y * s));
  const geo = keep(new THREE.LatheGeometry(pts, 32));
  // le bec : on tire le bord vers -x
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const y = p.getY(i);
    const z = p.getZ(i);
    const top = clamp((y / s - 0.15) / 0.04);
    const front = Math.max(0, -x / Math.hypot(x, z || 1e-6));
    const pull = top * Math.pow(front, 6) * 0.03 * s;
    p.setXYZ(i, x - pull, y + pull * 0.4, z * (1 - top * Math.pow(front, 6) * 0.3));
  }
  geo.computeVertexNormals();
  const mat = keep(new THREE.MeshStandardMaterial({ color, roughness: 0.18, side: THREE.DoubleSide }));
  const body = shadowed(new THREE.Mesh(geo, mat));
  // (origine au bec : la carafe derrière)
  body.position.set(0.064 * s, -0.19 * s, 0);
  pivot.add(body);
  // une bande bleue peinte
  const band = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.061 * s, 0.003 * s, 6, 40)), keep(new THREE.MeshStandardMaterial({ color: 0x3f74b8, roughness: 0.3 }))));
  band.rotation.x = Math.PI / 2;
  band.position.set(0.064 * s, -0.19 * s + 0.1 * s, 0);
  pivot.add(band);
  const handle = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(0.04 * s, 0.009 * s, 8, 20, Math.PI * 1.1)), mat));
  handle.position.set(0.064 * s + 0.06 * s, -0.19 * s + 0.1 * s, 0);
  handle.rotation.z = -Math.PI / 2 - 0.15;
  pivot.add(handle);
  // l'eau dans la carafe (on la voit par l'ouverture)
  const inside = new THREE.Mesh(keep(new THREE.CircleGeometry(0.042 * s, 24)), keep(new THREE.MeshStandardMaterial({ color: 0x6aa0c0, roughness: 0.05, transparent: true, opacity: 0.8 })));
  inside.rotation.x = -Math.PI / 2;
  inside.position.set(0.064 * s, -0.19 * s + 0.165 * s, 0);
  pivot.add(inside);
  const h = hand ? petHand(keep, { ...hand, grip: 0.85, size: hand.size ?? clamp(0.55 + 0.4 * s, 0.62, 1) }) : null;
  if (h) g.add(h);
  // le filet d'eau : un cylindre transparent dont la texture défile vers le bas
  const streamTex = keep(new THREE.CanvasTexture(streamCanvas()));
  streamTex.wrapS = THREE.RepeatWrapping;
  streamTex.wrapT = THREE.RepeatWrapping;
  const streamMat = keep(new THREE.MeshStandardMaterial({ color: 0xd8efff, map: streamTex, transparent: true, opacity: 0.7, roughness: 0.04, metalness: 0.1, depthWrite: false }));
  streamMat.envMapIntensity = 1.5;
  const stream = new THREE.Mesh(keep(new THREE.CylinderGeometry(1, 0.8, 1, 10, 1, true)), streamMat);
  stream.visible = false;
  g.add(stream);
  let tilt = 0;
  let want = 0;
  let flow = 0;
  let toY = 0;
  let t = 0;
  const tip = v3();
  const spout = (out = v3()) => pivot.localToWorld(out.set(-0.004 * s, -0.002 * s, 0));
  return {
    group: g,
    spout,
    setTilt(k) { want = clamp(k); },
    setStream(k, y) {
      flow = k;
      toY = y;
    },
    update(dt) {
      t += dt;
      tilt += (want - tilt) * (1 - Math.pow(0.5, dt / 0.15));
      pivot.rotation.z = tilt * 1.05;
      g.updateMatrixWorld(true);
      // (notre main tient l'anse)
      if (h) {
        const grip = pivot.localToWorld(v3(0.064 * s + 0.1 * s, -0.19 * s + 0.12 * s, 0));
        holdHand(h, grip, v3(0, 0, -1), shoulder?.(grip));
      }
      stream.visible = flow > 0.02 && tilt > 0.6;
      if (stream.visible) {
        const sp = spout(tip);
        const local = g.worldToLocal(sp.clone());
        const bottom = g.worldToLocal(v3(sp.x - 0.006 * s, toY, sp.z));
        const len = Math.max(0.01, local.y - bottom.y);
        const w = (0.0035 + 0.005 * flow) * s;
        stream.position.set((local.x + bottom.x) / 2, (local.y + bottom.y) / 2, local.z);
        stream.scale.set(w, len, w);
        streamTex.offset.y = (streamTex.offset.y + dt * 3) % 1;
        streamTex.repeat.set(1, len * 12);
      }
    },
    dispose() { keep.dispose(); },
  };
}

function streamCanvas() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,0.75)';
  x.fillRect(0, 0, 32, 64);
  for (let i = 0; i < 18; i++) {
    x.fillStyle = `rgba(160,200,235,${0.25 + Math.random() * 0.4})`;
    x.fillRect(Math.random() * 32, Math.random() * 64, 2 + Math.random() * 6, 6 + Math.random() * 14);
  }
  return c;
}

// ---------------------------------------------------------------- friandises

/** Biscuit en forme d'os (chien). Longueur ~ len, couché le long de x. */
export function boneTreat(keep, len = 0.07) {
  const g = new THREE.Group();
  const mat = keep(new THREE.MeshStandardMaterial({ color: 0xe8c48e, roughness: 0.8, map: keep(noiseTexture('#e0b47a', 0.3, 21, 64)) }));
  const r = len * 0.14;
  const mid = shadowed(new THREE.Mesh(keep(new THREE.CapsuleGeometry(r, len * 0.62, 4, 10)), mat));
  mid.rotation.z = Math.PI / 2;
  mid.scale.set(1, 1, 0.75);
  g.add(mid);
  const knob = keep(new THREE.SphereGeometry(r * 1.45, 12, 8));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const k = shadowed(new THREE.Mesh(knob, mat));
      k.position.set(sx * len * 0.42, 0, sz * r * 1.05);
      k.scale.set(1, 0.7, 1);
      g.add(k);
    }
  }
  return g;
}

/** Friandise en forme de petit poisson (chat), orangée, couchée le long de x (la tête vers +x). */
export function fishTreat(keep, len = 0.04) {
  const g = new THREE.Group();
  const mat = keep(new THREE.MeshStandardMaterial({ color: 0xe0864a, roughness: 0.55 }));
  const body = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(len * 0.3, 14, 10)), mat));
  body.scale.set(1.5, 0.75, 0.55);
  g.add(body);
  const tail = shadowed(new THREE.Mesh(keep(new THREE.ConeGeometry(len * 0.2, len * 0.32, 4)), mat));
  tail.rotation.z = -Math.PI / 2;
  tail.scale.set(1, 1, 0.35);
  tail.position.x = -len * 0.55;
  g.add(tail);
  const eye = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(len * 0.04, 6, 4)), keep(new THREE.MeshStandardMaterial({ color: 0x3a2010 }))), false);
  eye.position.set(len * 0.3, len * 0.05, len * 0.13);
  g.add(eye);
  return g;
}

/** Bâtonnet de carotte avec un brin de fane (lapin), couché le long de x. */
export function carrotStick(keep, len = 0.06) {
  const g = new THREE.Group();
  const mat = keep(new THREE.MeshStandardMaterial({ color: 0xf07a1e, roughness: 0.5 }));
  const body = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(len * 0.13, len * 0.06, len, 10)), mat));
  body.rotation.z = Math.PI / 2;
  g.add(body);
  const green = keep(new THREE.MeshStandardMaterial({ color: 0x4c9a34, roughness: 0.6 }));
  for (let i = 0; i < 3; i++) {
    const leaf = shadowed(new THREE.Mesh(keep(new THREE.ConeGeometry(len * 0.05, len * 0.6, 5)), green));
    leaf.position.set(-len * 0.75, (i - 1) * len * 0.05, 0);
    leaf.rotation.z = Math.PI / 2 + (i - 1) * 0.35;
    g.add(leaf);
  }
  return g;
}

/** La friandise de chaque espèce. */
export function treatFor(species, keep, scale = 1) {
  if (species === 'cat') return fishTreat(keep, 0.04 * scale);
  if (species === 'rabbit') return carrotStick(keep, 0.06 * scale);
  return boneTreat(keep, 0.075 * scale);
}

// ---------------------------------------------------------------- la brosse

/**
 * Brosse à picots pour chien, chat ou lapin : un manche en bois, une tête ovale, un coussin de caoutchouc et ses
 * picots. Origine : là où les picots touchent le poil ; +y : vers l'extérieur du corps ; le manche vers +x.
 */
export function petBrush(keep, size = 1) {
  const g = new THREE.Group();
  const s = size;
  const wood = keep(new THREE.MeshStandardMaterial({ color: 0xc08a52, roughness: 0.4, map: keep(noiseTexture('#c08a52', 0.22, 13, 64)) }));
  // la tête ovale (dos en bois verni), un peu bombée
  const head = shadowed(new THREE.Mesh(keep(new THREE.SphereGeometry(0.04 * s, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)), wood));
  head.scale.set(1.3, 0.35, 0.9);
  head.position.y = 0.016 * s;
  g.add(head);
  const rim = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.04 * s, 0.04 * s, 0.008 * s, 28)), wood));
  rim.scale.set(1.3, 1, 0.9);
  rim.position.y = 0.012 * s;
  g.add(rim);
  // le manche, qui part vers +x en remontant
  const handle = shadowed(new THREE.Mesh(keep(new THREE.CapsuleGeometry(0.012 * s, 0.1 * s, 4, 12)), wood));
  handle.rotation.z = Math.PI / 2 - 0.3;
  handle.position.set(0.1 * s, 0.035 * s, 0);
  handle.scale.set(1, 1, 0.7);
  g.add(handle);
  // le coussin de caoutchouc rose et ses picots
  const pad = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.036 * s, 0.036 * s, 0.006 * s, 28)), keep(new THREE.MeshStandardMaterial({ color: 0xe0708a, roughness: 0.55 }))));
  pad.scale.set(1.3, 1, 0.9);
  pad.position.y = 0.007 * s;
  g.add(pad);
  const pins = [];
  for (let i = -6; i <= 6; i++) for (let j = -4; j <= 4; j++) {
    const x = i * 0.0068 * s;
    const z = j * 0.0068 * s;
    if ((x / (0.044 * s)) ** 2 + (z / (0.03 * s)) ** 2 > 1) continue;
    pins.push([x, z]);
  }
  const pin = new THREE.InstancedMesh(keep(new THREE.CylinderGeometry(0.0011 * s, 0.0011 * s, 0.008 * s, 4)), keep(new THREE.MeshStandardMaterial({ color: 0xe8ecf0, metalness: 0.85, roughness: 0.25 })), pins.length);
  const m4 = new THREE.Matrix4();
  pins.forEach(([x, z], i) => pin.setMatrixAt(i, m4.makeTranslation(x, 0.002 * s, z)));
  pin.castShadow = true;
  keep({ dispose: () => pin.dispose() });
  g.add(pin);
  return g;
}

// Cavalier sur le cheval réaliste (vrai avatar de buildAvatar, vrai cheval GLB chargé dans node, vraie selle, vrai
// Player et vrai saut d'obstacle) : bassin posé sur le siège, jambes le long des flancs, pieds aux étriers, sans
// rien faire passer dans le cheval, à l'arrêt, au pas, au trot, au galop et pendant le saut
// (src/game/models/riderFit.js). Avant : bassin 6 à 8 cm dans le dos, jambes 5 à 13 cm dans les flancs au saut.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
let M;
beforeAll(async () => {
  // (toiles 2D muettes : l'avatar peint ses tissus et son visage sur des toiles, rien n'est affiché ici)
  const noop = () => {};
  const ctx2d = new Proxy({}, {
    get(o, k) {
      if (k in o) return o[k];
      if (String(k).startsWith('create')) return () => ({ addColorStop: noop });
      if (k === 'getImageData') return (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h });
      if (k === 'measureText') return () => ({ width: 10 });
      return noop;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
  const mem = new Map();
  globalThis.localStorage = globalThis.localStorage ?? {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k), key: () => null, get length() { return mem.size; },
  };
  globalThis.window = globalThis.window ?? { addEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600, matchMedia: () => ({ matches: false }) };
  globalThis.matchMedia = globalThis.matchMedia ?? (() => ({ matches: false, addEventListener() {} }));
  globalThis.document = {
    addEventListener() {}, hidden: false, documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } }, getElementById: () => null,
    createElement: () => ({ width: 1, height: 1, getContext: () => ctx2d, style: {} }),
  };
  gltf = await loadRealHorseGltf();
  M = {
    ...(await import('../src/game/models/horseReal.js')),
    ...(await import('../src/sim/animal.js')),
    ...(await import('../src/sim/species.js')),
    ...(await import('../src/game/gearModels.js')),
    ...(await import('../src/game/models/avatarModel.js')),
    ...(await import('../src/game/Player.js')),
    ...(await import('../src/game/Activities.js')),
    ...(await import('../src/sim/profile.js')),
  };
}, 120000);

/** Cheval sellé et cavalier en selle (Player sans son constructeur : pas de rendu). */
function mounted(breed, saddle = 'saddle') {
  const a = M.createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: 900, seed: 77 });
  a.gear = { saddle: { item: saddle, color: 'brown' }, bridle: { item: 'bridle', color: 'brown' } };
  const md = M.buildRealHorseModel(a.look, a.breed, gltf);
  md.lockGaits();
  const sc = a.look.scale * M.growthScale(a);
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  const sg = new THREE.Group();
  scene.add(root);
  root.add(sg);
  sg.add(md.root);
  sg.scale.setScalar(sc);
  const gearGroup = M.buildGear(md, a.look, a.gear);
  // (tourné et déplacé : le cavalier se mesure dans le repère du cheval)
  root.position.set(3, 0, -2);
  const e = { model: md, root, scaleGroup: sg, scale: sc, data: a, position: root.position, heading: 2.2, sp: M.SPECIES.horse, gearGroup };
  const pl = Object.create(M.Player.prototype);
  Object.assign(pl, { scene, root: new THREE.Group(), heading: 0, speed: 0, phase: 0, mount: null, lifeOpts: { speed: 0, riding: false, carry: false } });
  scene.add(pl.root);
  pl.avatar = M.buildAvatar(M.DEFAULT_AVATAR);
  pl.root.add(pl.avatar.root);
  pl.ride(e);
  return { a, md, sc, scene, e, pl, gearGroup };
}

/** Points du bassin et des jambes de l'avatar (meshes → nom de la partie). */
function riderParts(av) {
  const parts = { bassin: [], cuisses: [], tibias: [], pieds: [] };
  for (const x of av.ankles) x.traverse((o) => { if (o.isMesh) parts.pieds.push(o); });
  for (const x of av.knees) for (const o of x.children) if (o.isMesh) parts.tibias.push(o);
  for (const x of av.legs) for (const o of x.children) if (o.isMesh) parts.cuisses.push(o);
  av.root.updateMatrixWorld(true);
  const inv = av.root.matrixWorld.clone().invert();
  for (const o of av.chest.children) {
    if (!o.isMesh) continue;
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
    if (bb.max.y < 1.0) parts.bassin.push(o);
  }
  return parts;
}

/** Semelle au-dessus du point T (m, monde ; négatif : dedans) : sommets du pied i à moins de 3 cm de T à l'horizontale. */
function soleGap(av, i, T) {
  let gap = Infinity;
  const v = new THREE.Vector3();
  av.ankles[i].traverse((o) => {
    if (!o.isMesh) return;
    const pos = o.geometry.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k).applyMatrix4(o.matrixWorld);
      if (Math.hypot(v.x - T.x, v.z - T.z) < 0.03) gap = Math.min(gap, v.y - T.y);
    }
  });
  return gap;
}

/** Profondeur (m) du point le plus enfoncé de chaque partie dans le pelage déformé (parité verticale). */
function depths(coat, parts) {
  const n = coat.geometry.attributes.position.count;
  const C = new Float32Array(n * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) coat.getVertexPosition(i, v).applyMatrix4(coat.matrixWorld).toArray(C, i * 3);
  const I = coat.geometry.index.array;
  const CS = 0.05;
  const grid = new Map();
  for (let t = 0; t < I.length; t += 3) {
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (let k = 0; k < 3; k++) {
      const o = I[t + k] * 3;
      x0 = Math.min(x0, C[o]);
      x1 = Math.max(x1, C[o]);
      z0 = Math.min(z0, C[o + 2]);
      z1 = Math.max(z1, C[o + 2]);
    }
    for (let a = Math.floor(x0 / CS); a <= Math.floor(x1 / CS); a++) {
      for (let b = Math.floor(z0 / CS); b <= Math.floor(z1 / CS); b++) {
        const key = a * 100003 + b;
        if (!grid.has(key)) grid.set(key, []);
        grid.get(key).push(t);
      }
    }
  }
  const inside = (p) => {
    const L = grid.get(Math.floor(p.x / CS) * 100003 + Math.floor(p.z / CS));
    if (!L) return 0;
    let up = 0;
    let dn = 0;
    let dUp = Infinity;
    let dDn = Infinity;
    for (const t of L) {
      const a = I[t] * 3;
      const b = I[t + 1] * 3;
      const c = I[t + 2] * 3;
      const det = (C[b + 2] - C[c + 2]) * (C[a] - C[c]) + (C[c] - C[b]) * (C[a + 2] - C[c + 2]);
      if (Math.abs(det) < 1e-12) continue;
      const l1 = ((C[b + 2] - C[c + 2]) * (p.x - C[c]) + (C[c] - C[b]) * (p.z - C[c + 2])) / det;
      const l2 = ((C[c + 2] - C[a + 2]) * (p.x - C[c]) + (C[a] - C[c]) * (p.z - C[c + 2])) / det;
      if (l1 < 0 || l2 < 0 || l1 + l2 > 1) continue;
      const y = l1 * C[a + 1] + l2 * C[b + 1] + (1 - l1 - l2) * C[c + 1];
      if (y > p.y) { up++; dUp = Math.min(dUp, y - p.y); } else { dn++; dDn = Math.min(dDn, p.y - y); }
    }
    return up % 2 === 1 && dn % 2 === 1 ? Math.min(dUp, dDn) : 0;
  };
  const out = {};
  for (const [k, meshes] of Object.entries(parts)) {
    let worst = 0;
    for (const m of meshes) {
      const pos = m.geometry.attributes.position;
      const step = Math.max(1, Math.floor(pos.count / 120));
      for (let i = 0; i < pos.count; i += step) worst = Math.max(worst, inside(v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld)));
    }
    out[k] = worst;
  }
  return out;
}

describe('cavalier sur le cheval réaliste', () => {
  // (Falabella en selle poney : au saut, cuisses 4,6 cm et tibias 3,9 cm dans le cheval quand le pied ne pouvait
  // s'écarter que de 5 cm ; il reste au plus 4 mm, la pointe du pied contre l'avant-bras à un instant du galop, dont
  // la peau n'est pas relue à chaque image. Shetland en western : semelle à 1,8 cm du fond de l'étrier en bois,
  // décalé en x seulement.) tol : enfoncement toléré (m).
  it.each([['shetland', 'saddle', 0.002], ['selle_francais', 'saddle', 0.002], ['frison', 'saddle', 0.002], ['percheron', 'saddle', 0.002], ['falabella', 'saddlePony', 0.005], ['shetland', 'saddleWestern', 0.002]])('%s (%s) : bassin sur la selle, jambes hors des flancs, pieds aux étriers (arrêt, pas, trot, galop, saut)', (breed, saddle, tol) => {
    const random = Math.random;
    let s = 4242;
    Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    try {
      const { md, sc, e, pl, gearGroup } = mounted(breed, saddle);
      const parts = riderParts(pl.avatar);
      const seat = (() => {
        let best = null;
        for (const o of gearGroup.userData.meshes) {
          if (!o.isMesh || o.parent !== md.body || o.isSkinnedMesh) continue;
          o.geometry.computeBoundingBox();
          const bb = o.geometry.boundingBox;
          if (Math.abs(bb.max.x + bb.min.x) > 0.01) continue;
          if (!best || bb.max.y > best.geometry.boundingBox.max.y) best = o;
        }
        return best;
      })();
      const worst = {};
      let feet = 0;
      let seatGap = [Infinity, -Infinity];
      let jumpGap = 0;
      const dt = 1 / 60;
      const check = (gait, jump) => {
        pl.scene.updateMatrixWorld(true);
        const d = depths(md.coatMesh, parts);
        for (const [k, x] of Object.entries(d)) worst[`${gait} ${k}`] = Math.max(worst[`${gait} ${k}`] ?? 0, x);
        // plante du pied contre la grille de l'étrier (pas au saut : le cavalier se lève, la jambe peut se tendre) :
        // la vraie semelle (sommets de la chaussure à moins de 3 cm de la grille à l'horizontale), pas un point
        // fixe sous la cheville (le pied est incliné talon bas : elle flottait 1,8 cm au-dessus)
        if (!jump) {
          for (let i = 0; i < 2; i++) {
            const gaps = gearGroup.userData.saddle.stirrups.map((x) => soleGap(pl.avatar, i, x.iron.localToWorld(x.tread.clone())));
            feet = Math.max(feet, Math.min(...gaps.map((x) => Math.abs(x))));
          }
        }
        // bas du bassin et dessus du siège à sa verticale (à l'arrêt et au pas : assis ; au saut : en suspension)
        if (gait === 'arrêt' || gait === 'pas' || jump) {
          let low = null;
          for (const m of parts.bassin) {
            const pos = m.geometry.attributes.position;
            for (let i = 0; i < pos.count; i += 3) {
              const p = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
              if (!low || p.y < low.y) low = p;
            }
          }
          const rc = new THREE.Raycaster(low.clone().setY(low.y + 2), new THREE.Vector3(0, -1, 0));
          const side = seat.material.side;
          seat.material.side = THREE.DoubleSide;
          const h = rc.intersectObject(seat, false)[0];
          seat.material.side = side;
          if (jump) jumpGap = Math.max(jumpGap, h ? low.y - h.point.y : Infinity);
          else seatGap = [Math.min(seatGap[0], low.y - h.point.y), Math.max(seatGap[1], low.y - h.point.y)];
        }
      };
      for (const [gait, u] of [['arrêt', 0], ['pas', md.anim.natural?.walk ?? 1.6], ['trot', md.anim.natural?.trot ?? 3], ['galop', 6.5 / sc]]) {
        const speed = u * sc;
        pl.speed = speed;
        e.speed = speed;
        const st = { v: u, moving: u > 0, graze: 0, feeder: 0, turn: 0, fat: 1 };
        for (let f = 0; f < 90; f++) {
          const o = md.anim.update(dt, st, {});
          e.gait = o.gait;
          e.phase = o.phase;
          pl.lateUpdate(dt);
          pl.afterSessions();
          if (f >= 30 && f % 6 === 0) check(gait, false);
        }
        if (gait !== 'galop') continue;
        // saut de 1,2 m (0,88 s, une image sur trois), dans l'ordre du jeu : le joueur revient au sol (Player.update)
        // et ses matrices sont à jour avant lateUpdate, celles du cheval datent encore de l'image d'avant ; puis la
        // séance soulève joueur et cheval (JumpingSession.updateJump) et les fait basculer (poseJump). (Avant, le
        // bassin suivait la selle d'après ces matrices du monde : le cavalier s'envolait de la hauteur du saut.)
        const N = 53;
        for (let f = 0; f <= N; f++) {
          const o = md.anim.update(dt, st, {});
          e.gait = o.gait;
          e.phase = o.phase;
          pl.root.position.y = 0;
          e.root.position.y = 0;
          pl.root.updateMatrixWorld(true);
          pl.lateUpdate(dt);
          const lift = Math.sin((Math.PI * f) / N) * (1.2 * 1.1 + 0.3);
          pl.root.position.y = lift;
          e.root.position.y = lift;
          M.poseJump(e, pl, f / N);
          pl.afterSessions();
          if (f % 3 === 0) check('saut', true);
        }
        pl.root.position.y = 0;
        e.root.position.y = 0;
      }
      // (2 mm de marge pour le maillage)
      for (const [k, x] of Object.entries(worst)) expect(x, `${breed}, ${k} dans le cheval`).toBeLessThan(tol);
      expect(feet, `${breed} : semelle sur la grille de l'étrier`).toBeLessThan(0.006);
      // (assis sur le siège : ni dedans, ni à plus de 3 cm au-dessus)
      expect(seatGap[0], `${breed} : bassin dans le siège`).toBeGreaterThan(-0.002);
      expect(seatGap[1], `${breed} : bassin au-dessus du siège`).toBeLessThan(0.03);
      // (au saut, le cavalier se soulève de sa selle, en suspension : une douzaine de cm au plus)
      expect(jumpGap, `${breed} : cavalier au-dessus de la selle au saut`).toBeLessThan(0.15);
      md.dispose();
    } finally {
      Math.random = random;
    }
  }, 120000);

  it('selle changée en selle (sellerie) : selle, étriers et cartes refaits ; pied à terre, étrivières remises', () => {
    const random = Math.random;
    let s = 99;
    Math.random = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    try {
      const { md, e, pl, gearGroup } = mounted('selle_francais');
      const strap = gearGroup.userData.saddle.stirrups.find((x) => x.leather).leather;
      const fitted = strap.geometry;
      expect(strap.userData.homeGeo, 'étrivière mise à la longueur de jambe').toBeDefined();
      M.removeGear(e.gearGroup);
      e.gearGroup = M.buildGear(md, e.data.look, { saddle: { item: 'saddleWestern', color: 'brown' } });
      const st = { v: 0, moving: false, graze: 0, feeder: 0, turn: 0, fat: 1 };
      for (let f = 0; f < 4; f++) {
        md.anim.update(1 / 60, st, {});
        pl.lateUpdate(1 / 60);
        pl.afterSessions();
      }
      expect(pl.fit.gear, 'cavalier remis sur la nouvelle selle').toBe(e.gearGroup);
      expect(pl.fit.stirrups.every((x) => x?.fender), 'étriers western').toBe(true);
      // (l'ancienne étrivière, retirée avec sa selle, n'est pas remise en place)
      expect(strap.geometry).toBe(fitted);
      pl.scene.updateMatrixWorld(true);
      const d = depths(md.coatMesh, riderParts(pl.avatar));
      for (const [k, x] of Object.entries(d)) expect(x, `${k} dans le cheval`).toBeLessThan(0.002);
      // plante du pied sur le fond de l'étrier en bois (avant : 11 cm au-dessus, puis 30 cm à côté, poussée)
      for (let i = 0; i < 2; i++) {
        const s = pl.fit.stirrups[i];
        expect(Math.abs(soleGap(pl.avatar, i, s.iron.localToWorld(s.tread.clone()))), 'semelle sur le fond de l\'étrier western').toBeLessThan(0.006);
      }
      // pied à terre puis de nouveau en selle anglaise : étrivières à la longueur, puis remises
      M.removeGear(e.gearGroup);
      e.gearGroup = M.buildGear(md, e.data.look, { saddle: { item: 'saddle', color: 'brown' } });
      pl.seat();
      const strap2 = e.gearGroup.userData.saddle.stirrups.find((x) => x.leather).leather;
      const home = strap2.userData.homeGeo;
      expect(home).toBeDefined();
      // (dans le jeu, on monte toujours avec sa bombe : Game.ride → setHelmet ; l'ôter au pied à terre refait
      // l'avatar, qui était remis en selle tant que mount restait posé : étriers de nouveau à la jambe)
      pl.look = { ...M.DEFAULT_AVATAR };
      pl.setHelmet({ item: 'helmet', color: 'navy' });
      expect(pl.fit.stirrups.every((x) => x && x.iron.position.distanceTo(x.home.pos) > 0.01), 'étriers à la jambe, bombe sur la tête').toBe(true);
      const irons = pl.fit.stirrups;
      pl.world = { resolveCollisions() {}, heightAt: () => 0 };
      pl.dismount();
      expect(strap2.geometry, 'étrivière remise à sa longueur').toBe(home);
      for (const x of irons) expect(x.iron.position.distanceTo(x.home.pos), 'étrier remis à sa place').toBeLessThan(1e-6);
      expect(pl.fit).toBe(null);
      expect(pl.helmet).toBe(null);
      md.dispose();
    } finally {
      Math.random = random;
    }
  }, 120000);
});

// La séance de voltige en 3D (src/game/Vaulting.js), sans écran : le plan large du départ montre ton avatar, le longeur
// et le cheval où qu'il soit sur le cercle (en hauteur et en paysage) ; les poses sur le tonneau avec le vrai avatar
// (mains sur les poignées, pieds sur le tapis, rien sous le sable) ; le toucher daté entre deux images ; le bouton 🎥 ;
// et le décor libéré à la fin (géométries et matériaux, sauf ceux partagés).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { CIRCLE_R, onCircle, TAP_LATENCY } from '../src/sim/vaulting.js';

let VS;
let props;
let avatarModel;
beforeAll(async () => {
  const mem = new Map();
  globalThis.localStorage = globalThis.localStorage ?? {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  globalThis.window = globalThis.window ?? { addEventListener() {}, devicePixelRatio: 1, innerWidth: 390, innerHeight: 844 };
  // (une toile qui ne dessine rien, pour les textures du bois du tonneau)
  const ctx2d = new Proxy({}, { get: (o, k) => (k in o ? o[k] : () => ({ addColorStop() {} })), set: (o, k, v) => { o[k] = v; return true; } });
  globalThis.document = globalThis.document ?? {
    addEventListener() {}, hidden: false, documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } }, getElementById: () => null,
    createElement: () => ({ getContext: () => ctx2d, style: {}, width: 0, height: 0 }),
  };
  globalThis.matchMedia = globalThis.matchMedia ?? (() => ({ matches: true }));
  VS = await import('../src/game/Vaulting.js');
  props = await import('../src/game/models/vaultingProps.js');
  avatarModel = await import('../src/game/models/avatarModel.js');
}, 60000);

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

describe('le plan large du départ', () => {
  // Le cercle autour de (0, 0) ; les juges côté -z ; l'avatar salue près du centre ; le longeur sur son petit cercle.
  const center = { x: 0, z: 0 };
  const judges = V(0, 0, -CIRCLE_R - 3.6);
  const pref = Math.atan2(judges.x - center.x, judges.z - center.z);
  const ORIENT = {
    // parties libres de l'écran : sous la barre du haut et la bulle d'aide, au-dessus du gros bouton (en hauteur) ou
    // à sa gauche (en paysage) — comme freeBox au téléphone
    portrait: { aspect: 390 / 844, box: { x0: -0.84, x1: 0.84, y0: -0.48, y1: 0.48 }, pitch: 0.55, portrait: true },
    landscape: { aspect: 844 / 390, box: { x0: -0.84, x1: 0.62, y0: -0.84, y1: 0.4 }, pitch: 0.3, portrait: false },
  };
  /** Les points à voir : l'avatar (pieds, tête), le longeur, le cheval (tête et croupe, en bas et en haut). */
  function scene(theta, avatar) {
    const p = onCircle(center, theta);
    const f = V(Math.sin(theta), 0, Math.cos(theta));
    const coach = onCircle(center, theta, 1.1);
    const H = V(p.x, 0, p.z);
    const pts = [
      V(avatar.x, 0, avatar.z), V(avatar.x, 1.55, avatar.z), V(coach.x, 0, coach.z), V(coach.x, 1.95, coach.z),
      H.clone().addScaledVector(f, 1.35), H.clone().addScaledVector(f, 1.2).setY(1.95),
      H.clone().addScaledVector(f, -1.25), H.clone().addScaledVector(f, -1.25).setY(1.6),
    ];
    const mid = pts.reduce((m, q) => m.add(q), V()).multiplyScalar(1 / pts.length);
    return { pts, mid, line: Math.atan2(p.x - avatar.x, p.z - avatar.z) };
  }

  for (const [name, o] of Object.entries(ORIENT)) {
    it(`${name} : où que soit le cheval sur le cercle, les trois tiennent dans la partie libre de l'écran`, () => {
      for (const avatar of [{ x: 1.3, z: -1.6 }, { x: 4.5, z: 2.5 }]) { // (au salut, puis en courant vers le cheval)
        for (let k = 0; k < 16; k++) {
          const { pts, mid, line } = scene((k / 16) * Math.PI * 2, avatar);
          const frame = { fov: 60, aspect: o.aspect, box: o.box, az: VS.wideAzimuth(pref, line, o.portrait), pitch: o.pitch };
          const d = VS.fitDistance(pts, mid, frame);
          expect(d, `${name} cheval ${k}/16`).toBeLessThan(40);
          expect(VS.shotFits(pts, VS.shotAim(mid, d, frame), d, frame), `${name} cheval ${k}/16`).toBe(true);
        }
      }
    });
  }

  it('vu du côté des juges (l\'avatar qui les salue est vu de face), sans à-coup quand le cheval tourne', () => {
    for (const portrait of [true, false]) {
      let prev = null;
      for (let k = 0; k <= 64; k++) {
        const az = VS.wideAzimuth(pref, (k / 64) * Math.PI * 2, portrait);
        expect(Math.abs(Math.atan2(Math.sin(az - pref), Math.cos(az - pref)))).toBeLessThanOrEqual(0.6 + 1e-9);
        if (prev !== null) expect(Math.abs(az - prev)).toBeLessThan(0.13); // (1/64 de tour, 0,098 rad : petit pas)
        prev = az;
      }
    }
  });
});

describe('les poses sur le tonneau, avec le vrai avatar', () => {
  const world = { heightAt: () => 0 };
  let mt;
  let P;
  let av;
  let parent;
  beforeAll(() => {
    const barrel = props.vaultBarrel();
    barrel.rotation.y = -Math.PI / 2;
    barrel.updateMatrixWorld(true);
    mt = VS.barrelMount(barrel, world);
    P = VS.makePoses(mt);
    av = avatarModel.buildAvatar({ skin: 0xe8b796, hair: 0x3b2a20, hairStyle: 'short', top: 0x3a7bd5, bottom: 0x2d3a4f, shoes: 0x2b2b2b, hat: false }, 3);
    parent = new THREE.Group();
    parent.add(av.root);
  });
  /** Pose la pose name et renvoie des points du corps dans le repère du tapis. */
  function put(name) {
    const R = VS.resolve(P[name], mt);
    parent.position.copy(mt.pos);
    parent.updateMatrixWorld(true);
    VS.applyPose(av, R, mt, parent);
    av.root.updateMatrixWorld(true);
    const pad = (o) => o.getWorldPosition(V()).applyMatrix4(mt.inv);
    return { R, ankles: av.ankles.map(pad), hands: av.hands.map(pad), hips: av.legs.map(pad), world: av.ankles.map((o) => o.getWorldPosition(V())) };
  }
  const NAMES = ['seatGrip', 'seat', 'kneel', 'flag', 'sideL', 'back', 'sideR', 'q1', 'q2', 'q3', 'q4', 'backGrip', 'sc1', 'sc2', 'sc3', 'sc4', 'sc5', 'crouch', 'stand', 'fl1', 'fl2', 'fl3', 'sideLGrip', 'off1'];

  it('les mains tenues aux poignées y sont vraiment (la paume posée dessus)', () => {
    // (sauf au saut à terre, off1 : on repousse et on lâche les poignées)
    for (const name of NAMES.filter((x) => x !== 'off1')) {
      const b = put(name);
      P[name].arms.forEach((spec, i) => {
        if (spec.grip === undefined) return;
        const want = mt.grips[spec.grip].clone().add(V(0, VS.GRIP_UP, 0));
        expect(b.hands[i].distanceTo(want), `${name} main ${i}`).toBeLessThan(0.045);
      });
    }
  });

  it('rien sous le sable, et assis, les hanches sur le dessus (pas dans le tonneau)', () => {
    for (const name of NAMES) {
      const b = put(name);
      for (const w of b.world) expect(w.y, `${name} cheville`).toBeGreaterThan(0.02);
      if (['seatGrip', 'seat', 'sideL', 'sideR', 'back', 'backGrip'].includes(name)) {
        for (const h of b.hips) expect(h.y, `${name} hanche`).toBeGreaterThan(-0.06);
      }
    }
  });

  it('debout : les deux pieds à plat sur le tapis, les bras tendus sur les côtés à hauteur des yeux', () => {
    const b = put('stand');
    b.ankles.forEach((a) => expect(Math.abs(a.y - (mt.topAt(a.z) + 0.065)), 'cheville sur le tapis').toBeLessThan(0.04));
    // les mains loin sur les côtés, plus haut que les épaules et pas devant
    const toBody = new THREE.Matrix4().compose(V(), b.R.q, V(1, 1, 1)).invert();
    const hip = b.R.hip;
    for (const hand of b.hands) {
      const local = hand.clone().sub(hip).applyMatrix4(toBody);
      expect(Math.abs(local.x)).toBeGreaterThan(0.55);
      expect(local.y).toBeGreaterThan(0.55); // (au-dessus des épaules, 0,51 m au-dessus des hanches)
      expect(Math.abs(local.z)).toBeLessThan(0.25);
    }
  });

  it('flanc, 2e partie : les hanches plus haut que les épaules, les jambes en l\'air', () => {
    const b = put('fl3');
    const shoulders = av.arms.map((o) => o.getWorldPosition(V()).applyMatrix4(mt.inv));
    const hipY = (b.hips[0].y + b.hips[1].y) / 2;
    expect(hipY).toBeGreaterThan(Math.max(...shoulders.map((s) => s.y)));
    expect(Math.min(...b.ankles.map((a) => a.y))).toBeGreaterThan(hipY);
  });
});

describe('le toucher entre deux images', () => {
  const at = (o, ts) => VS.VaultingSession.prototype.phaseAt.call({ strideTime: () => 0.62, ...o }, ts);

  it('la foulée est prolongée jusqu\'à l\'heure du toucher, moins le retard du tactile', () => {
    // dernière image à 1000 ms, phase 0,2 ; toucher reçu 100 ms plus tard
    expect(at({ wallAt: 1000, phAt: 0.2, rate: 1 }, 1100)).toBeCloseTo(0.2 + (0.1 - TAP_LATENCY) / 0.62, 9);
    // un appareil lent (le jeu avance 4 fois moins vite que l'horloge) : la foulée aussi
    expect(at({ wallAt: 1000, phAt: 0.2, rate: 0.25 }, 1100)).toBeCloseTo(0.2 + ((0.1 - TAP_LATENCY) * 0.25) / 0.62, 9);
    // un toucher reçu avant la dernière image (image longue) : on revient en arrière
    expect(at({ wallAt: 1000, phAt: 0.5, rate: 1 }, 950)).toBeLessThan(0.5);
  });
});

describe('le bouton 🎥 pendant la voltige', () => {
  it('passe d\'une vue à l\'autre (trois quarts, de près, de loin) et le dit', () => {
    const said = [];
    const s = { view: 0, hud: { hint: (x) => said.push(x) } };
    const views = [];
    for (let i = 0; i < 3; i++) {
      expect(VS.VaultingSession.prototype.cameraButton.call(s)).toBe(true); // (le bouton est pris : pas de 1re personne)
      views.push(s.view);
    }
    expect(views).toEqual([1, 2, 0]);
    expect(said).toHaveLength(3);
  });
});

describe('à la fin de la séance', () => {
  it('le décor est libéré : géométries et matériaux, sauf ceux partagés (gardés pour la séance suivante)', () => {
    const root = new THREE.Group();
    const barrel = props.vaultBarrel();
    root.add(props.judgesTable(), props.circleTrack(CIRCLE_R, 1.6), barrel);
    const shared = new Set(barrel.userData.sharedMats);
    const geos = new Set();
    const mats = new Set();
    root.traverse((o) => {
      if (!o.isMesh) return;
      geos.add(o.geometry);
      for (const m of [o.material].flat()) mats.add(m);
    });
    const freed = new Set();
    for (const x of [...geos, ...mats]) x.addEventListener('dispose', () => freed.add(x));
    VS.disposeProps(root, shared);
    for (const g of geos) if (!g.userData.shared) expect(freed.has(g)).toBe(true);
    for (const m of mats) expect(freed.has(m)).toBe(!shared.has(m));
    expect(shared.size).toBeGreaterThan(0);
  });
});

// Allures vivantes du cheval réaliste (plan « cheval beau », étape 6) : galop qui allonge sa foulée au lieu de
// mouliner, queue et crinière souples (ressorts), tête qui hoche au pas, respiration et essoufflement. GLB chargé
// dans node, sans textures. Les instants de départ des clips sont tirés au hasard par le mixeur (Math.random) :
// ils sont FIXÉS ici, rien ne dépend du hasard.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import {
  buildRealHorseModel, realHorseBase, GALLOP_CADENCE_MAX, GALLOP_REACH, WALK_NOD, BREATH,
} from '../src/game/models/horseReal.js';
import { createAnimal } from '../src/sim/animal.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
  realHorseBase(gltf);
}, 60000);

/** Cheval aux instants de clips fixés (phase), allures calées. */
function horse(breed, phase = 0.31) {
  const random = Math.random;
  let n = 0;
  Math.random = () => (phase + 0.377 * n++) % 1;
  try {
    const a = createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: 900, seed: 5 });
    const md = buildRealHorseModel(a.look, a.breed, gltf);
    md.anim.useGaits();
    md.anim.resting = false;
    md.anim.restTimer = 1e9;
    return md;
  } finally {
    Math.random = random;
  }
}

const go = (v, extra) => ({ v, moving: v > 0, sleeping: false, sad: false, graze: 0, feeder: 0, turn: 0, fat: 1, ...extra });
const run = (md, st, frames, dt = 1 / 60, each = null) => {
  for (let f = 0; f < frames; f++) {
    md.root.position.z += st.v * dt;
    md.anim.update(dt, st, {});
    each?.(f);
  }
};
/** Angle (degrés) entre deux rotations. */
const deg = (a, b) => (2 * Math.acos(Math.min(1, Math.abs(a.dot(b)))) * 180) / Math.PI;

describe('galop : foulée allongée plutôt que cadence accélérée', () => {
  it('chaque race a un galop allongé recalé, GALLOP_REACH fois plus long que son galop', () => {
    for (const breed of ['selle_francais', 'shetland', 'percheron']) {
      const md = horse(breed);
      const { gallop, gallopX } = md.anim.natural;
      expect(gallopX / gallop).toBeCloseTo(GALLOP_REACH, 5);
      expect(md.anim.actions.gallopX).toBeTruthy();
      md.dispose();
    }
  });

  it.each([['selle_francais', 14], ['pur_sang', 14], ['selle_francais', 11]])('%s à %s m/s : cadence au plus %s fois la naturelle (1,67 avant), foulée allongée', (breed, v) => {
    const md = horse(breed);
    run(md, go(v), 180);
    const ts = md.anim.actions.gallop.timeScale;
    expect(ts).toBeLessThanOrEqual(1.25);
    expect(ts).toBeLessThanOrEqual(GALLOP_CADENCE_MAX + 1e-9);
    expect(ts).toBeGreaterThan(1);
    expect(md.anim.actions.gallopX.timeScale).toBe(ts);
    expect(md.anim.actions.gallopX.time).toBeCloseTo(md.anim.actions.gallop.time, 6); // (même instant du clip)
    expect(md.anim.stretch).toBeGreaterThan(0.3);
    md.dispose();
  });

  it('à sa vitesse naturelle, le galop n\'est ni allongé ni accéléré', () => {
    const md = horse('selle_francais');
    run(md, go(md.anim.natural.gallop), 180);
    expect(md.anim.stretch).toBeLessThan(0.01);
    expect(md.anim.actions.gallop.timeScale).toBeCloseTo(1, 2);
    md.dispose();
  });

  // Centre de la sole pendant chaque appui à plat (tous ses points à moins de 1,5 cm du sol) : déplacement du début
  // à la fin ; et chaque point de la sole tant qu'il touche (à moins de 4 mm), pince en bascule comprise.
  it.each([
    ['selle_francais', 8.5], ['selle_francais', 11], ['selle_francais', 14], ['pur_sang', 11], ['pur_sang', 14],
    ['percheron', 11], ['shetland', 11],
  ])('%s à %s m/s : les sabots posés ne glissent pas (galop et galop allongé mêlés)', (breed, v) => {
    const md = horse(breed);
    run(md, go(v), 240);
    const p = new THREE.Vector3();
    const flat = md.legs.map(() => null);
    const flats = [];
    const touch = new Map();
    const pts = [];
    run(md, go(v), 360, 1 / 60, () => {
      md.root.updateMatrixWorld(true);
      md.legs.forEach((l, i) => {
        let hi = -Infinity;
        let z = 0;
        l.solePts.forEach((q, k) => {
          p.copy(q).applyMatrix4(l.fetlock.matrixWorld);
          hi = Math.max(hi, p.y);
          z += p.z / l.solePts.length;
          const key = i * 10 + k;
          const S = touch.get(key);
          if (p.y - 0.003 < 0.004) {
            if (!S) touch.set(key, { z0: p.z, z1: p.z, n: 1 });
            else {
              S.z0 = Math.min(S.z0, p.z);
              S.z1 = Math.max(S.z1, p.z);
              S.n++;
            }
          } else if (S) {
            if (S.n > 1) pts.push(S.z1 - S.z0);
            touch.delete(key);
          }
        });
        if (hi < 0.015) {
          flat[i] ??= { z0: z, n: 0 };
          flat[i].z1 = z;
          flat[i].n++;
        } else if (flat[i]) {
          if (flat[i].n > 2) flats.push(Math.abs(flat[i].z1 - flat[i].z0));
          flat[i] = null;
        }
      });
    });
    md.dispose();
    expect(flats.length).toBeGreaterThan(6);
    expect(pts.length).toBeGreaterThan(40);
    const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
    if (process.env.SLIP_LOG) console.log(breed, v, (mean(pts) * 100).toFixed(2), (Math.max(...pts) * 100).toFixed(2), (Math.max(...flats) * 100).toFixed(2));
    expect(Math.max(...flats)).toBeLessThan(0.02);
    expect(mean(pts)).toBeLessThan(0.005);
    // (un point de la sole : la pince qui bascule en fin d'appui glisse un peu plus que le centre)
    expect(Math.max(...pts)).toBeLessThan(0.04);
  });
});

describe('queue et crinière souples', () => {
  it('au galop la queue traîne en arc et ses crins se courbent ; à l\'arrêt, elle revient au repos en moins de 1,5 s', () => {
    const md = horse('selle_francais');
    // (loin d'une salve de coups de queue contre les mouches pendant les 9 s du test)
    md.anim.t = (Math.PI * 1.5 - (md.root.id % 7)) / 0.23;
    run(md, go(0), 120);
    const rest2 = md.tailTip.quaternion.clone();
    const rest1 = md.tail.quaternion.clone();
    expect(md.hairDrag.tail.value.length()).toBeLessThan(0.02);
    run(md, go(12), 240);
    // (Tail2 tournée par rapport à Tail1 : la queue n'est plus une planche droite)
    expect(deg(md.tailTip.quaternion, rest2)).toBeGreaterThan(10);
    expect(md.hairDrag.tail.value.length()).toBeGreaterThan(0.3);
    expect(md.hairDrag.mane.value.length()).toBeGreaterThan(0.15);
    let back = null;
    run(md, go(0), 180, 1 / 60, (f) => {
      if (back === null && f > 0 && deg(md.tailTip.quaternion, rest2) < 4 && deg(md.tail.quaternion, rest1) < 4) back = f / 60;
    });
    expect(back).not.toBeNull();
    expect(back).toBeLessThan(1.5);
    expect(md.hairDrag.tail.value.length()).toBeLessThan(0.02);
    md.dispose();
  });

  it('la queue suit le galop avec du retard : Tail2 bouge après Tail1 (elle fouette)', () => {
    const md = horse('selle_francais');
    run(md, go(10), 240);
    const a1 = [];
    const a2 = [];
    const r1 = md.tail.quaternion.clone();
    const r2 = md.tailTip.quaternion.clone();
    run(md, go(10), 120, 1 / 60, () => {
      a1.push(deg(md.tail.quaternion, r1));
      a2.push(deg(md.tailTip.quaternion, r2));
    });
    const range = (a) => Math.max(...a) - Math.min(...a);
    expect(range(a1)).toBeGreaterThan(2); // (secouée par le rebond du galop)
    expect(range(a2)).toBeGreaterThan(2);
    md.dispose();
  });

  it('la crinière flotte au galop (ses ressorts bougent à chaque foulée), immobile à l\'arrêt', () => {
    const md = horse('frison');
    // (vitesse angulaire moyenne des ressorts de la crinière, rad/s)
    const motion = (st) => {
      run(md, st, 180);
      let s = 0;
      let n = 0;
      run(md, st, 90, 1 / 60, () => {
        for (const S of md.anim.maneS) {
          s += S.w.length();
          n++;
        }
      });
      return s / n;
    };
    const still = motion(go(0));
    const gal = motion(go(11));
    expect(still).toBeLessThan(0.1);
    expect(gal).toBeGreaterThan(0.5);
    expect(gal).toBeGreaterThan(still * 5);
    md.dispose();
  });

  it('dans un virage, la queue part vers l\'extérieur', () => {
    const md = horse('selle_francais');
    const side = (turn) => {
      run(md, go(9, { turn: 0 }), 120);
      run(md, go(9, { turn }), 90);
      md.root.updateMatrixWorld(true);
      const tip = md.tailTip.localToWorld(new THREE.Vector3(0, -0.5, 0));
      return md.root.worldToLocal(tip).x;
    };
    // (virage à gauche, cap qui augmente : centre du virage du côté +x ; la queue part vers -x)
    expect(side(1.2)).toBeLessThan(side(-1.2) - 0.03);
    md.dispose();
  });

  it('pose de photo : la même après un galop qu\'au repos (ressorts remis à leur place)', () => {
    const a = horse('haflinger');
    const b = horse('haflinger');
    run(a, go(12), 200);
    a.photoPose();
    b.photoPose();
    for (let i = 0; i < a.groups.length; i++) {
      const qa = a.groups[i].quaternion.toArray();
      const qb = b.groups[i].quaternion.toArray();
      for (let k = 0; k < 4; k++) expect(Math.abs(qa[k] - qb[k]), a.groups[i].name).toBeLessThan(1e-5);
    }
    expect(a.hairDrag.tail.value.length()).toBe(0);
    a.dispose();
    b.dispose();
  });
});

describe('tête qui hoche, respiration', () => {
  /** Écart de hauteur du bout du nez (m) sur un cycle de pas. */
  const nodRange = (md) => {
    const v = md.anim.natural.walk;
    run(md, go(v), 180);
    let lo = Infinity;
    let hi = -Infinity;
    const T = md.anim.actions.walk.getClip().duration;
    run(md, go(v), Math.ceil((T * 60) / md.anim.actions.walk.timeScale), 1 / 60, () => {
      md.root.updateMatrixWorld(true);
      const y = md.root.worldToLocal(md.head.localToWorld(new THREE.Vector3(...md.snoutTip))).y;
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    });
    return hi - lo;
  };

  it('au pas, la tête hoche nettement (deux fois par foulée, en phase avec le clip)', () => {
    const md = horse('selle_francais');
    const withNod = nodRange(md);
    md.dispose();
    const saved = { ...WALK_NOD };
    WALK_NOD.neck = 0;
    WALK_NOD.head = 0;
    try {
      const md2 = horse('selle_francais');
      const clipOnly = nodRange(md2);
      md2.dispose();
      expect(withNod).toBeGreaterThan(clipOnly * 1.35);
      expect(withNod).toBeLessThan(0.28);
    } finally {
      Object.assign(WALK_NOD, saved);
    }
  });

  /** Respirations par minute et amplitude (part du flanc) sur 30 s, à l'arrêt. */
  const breathing = (md) => {
    let n = 0;
    let prev = 0;
    let amp = 0;
    run(md, go(0), 900, 1 / 30, () => {
      const s = md.ribs.scale.x - 1;
      if (prev < 0 && s >= 0) n++;
      prev = s;
      amp = Math.max(amp, Math.abs(s));
    });
    return { perMin: n * 2, amp };
  };

  it('au repos, 12 respirations par minute ; après une galopade, il souffle (plus vite, plus fort), puis se calme', () => {
    const md = horse('selle_francais');
    run(md, go(0), 600, 1 / 30);
    const rest = breathing(md);
    expect(rest.perMin).toBeGreaterThanOrEqual(10);
    expect(rest.perMin).toBeLessThanOrEqual(14);
    expect(rest.amp).toBeCloseTo(BREATH.amp, 2);
    run(md, go(12), 1800, 1 / 60); // (30 s de galop)
    const blown = breathing(md);
    expect(blown.perMin).toBeGreaterThan(30);
    expect(blown.amp).toBeGreaterThan(rest.amp * 1.4);
    run(md, go(0), 30 * 240, 1 / 30); // (4 min plus tard)
    const calm = breathing(md);
    expect(calm.perMin).toBeLessThanOrEqual(15);
    md.dispose();
  });
});

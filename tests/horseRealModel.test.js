// Cheval réaliste construit pour de bon (GLB chargé dans node, sans textures) : animation sur la
// durée (rien ne s'accumule d'une image à l'autre), queue au-dessus du sol pour chaque race.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealHorseModel, tailSwish, TAIL_CLEAR, RIG_BONES } from '../src/game/models/horseReal.js';
import { createAnimal } from '../src/sim/animal.js';
import { SPECIES } from '../src/sim/species.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
}, 60000);

const horse = (breed, { foal = false, seed = 1234, colorIndex = 0 } = {}) => {
  const a = createAnimal({ species: 'horse', breed, colorIndex, ageDays: foal ? 60 : 900, seed });
  return buildRealHorseModel(foal ? { ...a.look, foal: true } : a.look, a.breed, gltf);
};

/** Angle (degrés) entre deux rotations. */
const angle = (a, b) => {
  const d = Math.abs(a.dot(b));
  return (2 * Math.acos(Math.min(1, d)) * 180) / Math.PI;
};

describe('animation du cheval réaliste', () => {
  it.each([['idle', 0], ['trot', 3], ['pas', 1.4]])('%s : la queue revient toujours près de sa pose (coups de queue compris)', (name, v) => {
    const md = horse('selle_francais');
    const k = md.root.id % 7;
    // Début d'une salve de coups de queue : sin(t·0,23 + k) passe 0,9.
    let t0 = (Math.asin(0.9) - k) / 0.23;
    while (t0 < 1) t0 += (2 * Math.PI) / 0.23;
    md.anim.t = t0 - 0.5;
    const st = { v, moving: v > 0, graze: 0, feeder: 0, turn: 0, fat: 1 };
    const dt = 1 / 60;
    let maxA = 0;
    let swishes = 0;
    const rest = new THREE.Quaternion();
    for (let f = 0; f < 1800; f++) {
      md.anim.update(dt, st, {});
      if (tailSwish(md.anim.t, k)) swishes++;
      maxA = Math.max(maxA, angle(md.tail.quaternion, rest));
    }
    expect(swishes).toBeGreaterThan(120); // la salve a bien eu lieu
    expect(maxA).toBeLessThan(25);
    md.dispose();
  });

  it('les oreilles et l\'encolure ne dérivent pas à l\'arrêt (10 min)', () => {
    const md = horse('pur_sang');
    const st = { v: 0, moving: false, graze: 0, feeder: 0, turn: 0, fat: 1 };
    const neck0 = md.neck.quaternion.clone();
    let maxEar = 0;
    let maxNeck = 0;
    for (let f = 0; f < 6000; f++) {
      md.anim.update(0.1, st, {});
      maxEar = Math.max(maxEar, angle(md.ears[0].quaternion, md.ears[0].userData.restQ));
      maxNeck = Math.max(maxNeck, angle(md.neck.quaternion, neck0));
    }
    expect(maxEar).toBeLessThan(45);
    expect(maxNeck).toBeLessThan(40);
    md.dispose();
  });
});

/** Point le plus bas de la queue (sommets des crins liés aux os de la queue), maillage déformé. */
function tailLow(md, rest = false) {
  const mane = md.root.children.find((m) => m.isSkinnedMesh && m.geometry.attributes.hairG && !m.geometry.attributes.color);
  const g = mane.geometry;
  const tail = [RIG_BONES.indexOf('Tail1'), RIG_BONES.indexOf('Tail2')];
  const v = new THREE.Vector3();
  let low = Infinity;
  for (let i = 0; i < g.attributes.position.count; i++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (tail.includes(g.attributes.skinIndex.getComponent(i, k))) w += g.attributes.skinWeight.getComponent(i, k);
    if (w < 0.5) continue;
    low = Math.min(low, rest ? g.attributes.position.getY(i) : mane.getVertexPosition(i, v).y);
  }
  return low;
}

describe('queue du cheval réaliste', () => {
  const cases = SPECIES.horse.breeds.flatMap((b) => [[b.id, false], [b.id, true]]);
  it.each(cases)('%s (poulain : %s) : le bout de la queue reste au-dessus du sol, au repos comme à l\'arrêt, en broutant ou au repos d\'un postérieur', (id, foal) => {
    const md = horse(id, { foal });
    expect(tailLow(md, true)).toBeGreaterThan(TAIL_CLEAR - 0.002);
    const { actions, mixer } = md.anim;
    for (const name of ['idle', 'rest', 'eat']) {
      for (const f of [0, 0.25, 0.5, 0.75]) {
        for (const [n, a] of Object.entries(actions)) a.setEffectiveWeight(n === name ? 1 : 0);
        actions[name].time = actions[name].getClip().duration * f;
        mixer.update(0);
        md.root.updateMatrixWorld(true);
        expect(tailLow(md), `${name} ${f}`).toBeGreaterThan(0.04);
      }
    }
    md.dispose();
  });

  it('les longues queues (baroques, poneys) descendent plus bas que celles des chevaux de sport', () => {
    const low = (id) => {
      const md = horse(id);
      const y = tailLow(md, true);
      md.dispose();
      return y;
    };
    expect(low('frison')).toBeLessThan(low('pur_sang') - 0.05);
    expect(low('shetland')).toBeLessThan(low('selle_francais') - 0.05);
  });

  it('allongée dans sa longueur, pas en largeur : une longue queue n\'est pas plus large qu\'une autre', () => {
    const width = (id) => {
      const md = horse(id);
      const mane = md.root.children.find((m) => m.isSkinnedMesh && m.geometry.attributes.hairG && !m.geometry.attributes.color);
      const g = mane.geometry;
      const tail = [RIG_BONES.indexOf('Tail1'), RIG_BONES.indexOf('Tail2')];
      let x0 = Infinity;
      let x1 = -Infinity;
      for (let i = 0; i < g.attributes.position.count; i++) {
        if (!tail.includes(g.attributes.skinIndex.getComponent(i, 0)) || g.attributes.skinWeight.getComponent(i, 0) < 0.5) continue;
        x0 = Math.min(x0, g.attributes.position.getX(i));
        x1 = Math.max(x1, g.attributes.position.getX(i));
      }
      md.dispose();
      return x1 - x0;
    };
    expect(width('irish_cob')).toBeLessThan(width('percheron') * 1.08);
    expect(width('pre')).toBeLessThan(width('selle_francais') * 1.12);
  });
});

describe('signes de race du cheval réaliste', () => {
  /** Hauteur du chanfrein (repère de la tête, ÷ longueur de la tête) entre les yeux et les naseaux. */
  const noseLine = (id) => {
    const md = horse(id);
    const g = md.coatMesh.geometry;
    let top = -Infinity;
    for (let i = 0; i < g.attributes.position.count; i++) {
      if (g.attributes.hPart.getX(i) !== 1) continue;
      const x = g.attributes.hInfo.getX(i);
      const z = g.attributes.hInfo.getZ(i);
      if (Math.abs(x) < 0.05 && z > 0.55 && z < 0.68) top = Math.max(top, g.attributes.hInfo.getY(i));
    }
    md.dispose();
    return top;
  };

  it('tête busquée (PRE, lusitanien) au chanfrein bombé, tête concave (arabe, welsh) creusée', () => {
    const straight = noseLine('selle_francais');
    expect(noseLine('pre')).toBeGreaterThan(straight + 0.025);
    expect(noseLine('lusitanien')).toBeGreaterThan(straight + 0.025);
    expect(noseLine('arabe')).toBeLessThan(straight - 0.03);
    expect(noseLine('welsh')).toBeLessThan(straight - 0.03);
  });

  /** Angle (degrés) de la queue depuis la verticale (de l'attache au bout), à l'arrêt, sans coup de queue. */
  const tailAngle = (id) => {
    const md = horse(id);
    const k = md.root.id % 7;
    md.anim.t = (Math.PI * 1.5 - k) / 0.23; // (loin d'une salve de coups de queue)
    md.anim.update(1 / 60, { v: 0, moving: false }, {});
    md.root.updateMatrixWorld(true);
    const a = md.tail.getWorldPosition(new THREE.Vector3());
    const b = md.tailTip.getWorldPosition(new THREE.Vector3());
    md.dispose();
    return (Math.atan2(a.z - b.z, a.y - b.y) * 180) / Math.PI;
  };

  it('queue portée haut chez l\'arabe et le saddlebred, pendante chez le selle français', () => {
    const sf = tailAngle('selle_francais');
    expect(tailAngle('arabe')).toBeGreaterThan(sf + 25);
    expect(tailAngle('saddlebred')).toBeGreaterThan(sf + 15);
  });
});

describe('sabots posés du cheval réaliste', () => {
  /** Glissement (m) du centre de la sole pendant chaque appui à plat, cheval qui avance à v (taille 1). */
  const slips = (id, v) => {
    const md = horse(id);
    const st = { v, moving: true, graze: 0, feeder: 0, turn: 0, fat: 1 };
    const dt = 1 / 60;
    const p = new THREE.Vector3();
    for (let f = 0; f < 240; f++) {
      md.root.position.z += v * dt;
      md.anim.update(dt, st, {});
    }
    const stance = md.legs.map(() => null);
    const out = [];
    for (let f = 0; f < 600; f++) {
      md.root.position.z += v * dt;
      md.anim.update(dt, st, {});
      md.root.updateMatrixWorld(true);
      md.legs.forEach((l, i) => {
        let hi = -Infinity;
        let z = 0;
        for (const s of l.solePts) {
          p.copy(s).applyMatrix4(l.fetlock.matrixWorld);
          hi = Math.max(hi, p.y);
          z += p.z / l.solePts.length;
        }
        if (hi < 0.015) {
          stance[i] ??= { z0: z, n: 0 };
          stance[i].z1 = z;
          stance[i].n++;
        } else if (stance[i]) {
          if (stance[i].n > 3) out.push(Math.abs(stance[i].z1 - stance[i].z0));
          stance[i] = null;
        }
      });
    }
    md.dispose();
    return out;
  };

  // (allures calées par race, horseReal.js lockedGaits : au galop, le GLB n'a que trois clés par appui et
  // le sabot glissait de 2 à 5 cm ; il arrivait au sol en avançant encore avec le corps)
  it.each([
    ['pur_sang', 3.0], ['percheron', 3.0], ['shetland', 3.0], ['pur_sang', 4.6], ['percheron', 1.6],
    ['selle_francais', 1.6], ['shetland', 4.1], ['pur_sang', 8.7], ['shetland', 7.3], ['percheron', 7.5], ['fjord', 7.3],
  ])('%s à %s m/s : les sabots posés ne glissent presque pas', (id, v) => {
    const s = slips(id, v);
    expect(s.length).toBeGreaterThan(6);
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    expect(mean).toBeLessThan(0.006);
    expect(Math.max(...s)).toBeLessThan(0.02);
  });
});

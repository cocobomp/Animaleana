// Finitions des chats et des lapins réalistes vues au téléphone et de près (critique « chats-lapins ») : trot posé des
// races longilignes, ... Déterministe : graines fixes, pas de temps fixe, aucun Math.random (le mixeur est appelé
// avec des états donnés, jamais animateRealCat).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { buildRealCatModel } from '../src/game/models/catReal.js';
import { buildAccessories } from '../src/game/models/salon.js';
import { catLookWithBreed } from '../src/sim/catLook.js';
import { resolveLook } from '../src/sim/animal.js';
import { loadRealCatGltf } from './fixtures/realCatGltf.js';

// (machine chargée : construire et animer un chat prend parfois plusieurs secondes)
vi.setConfig({ testTimeout: 180000 });

let G;
beforeAll(async () => {
  G = { adult: await loadRealCatGltf('adult'), kitten: await loadRealCatGltf('kitten') };
}, 120000);

const lookOf = (breed, colorIndex = 0) => catLookWithBreed({ ...resolveLook('cat', breed, colorIndex), seed: 4242 }, breed);
const cat = (breed, stage = 'adult') => buildRealCatModel(lookOf(breed), stage, G[stage === 'baby' ? 'kitten' : 'adult']);
const _v = new THREE.Vector3();
const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

/**
 * Chat qui avance comme en jeu (le mixeur tient les pieds posés) : plus bas de la peau de chaque sole (sommets des
 * soles mesurées sur la race, repère du monde) image par image, après une seconde pour prendre l'allure.
 */
function soleTrack(md, v, frames = 240) {
  const m = md.coatMesh;
  const soles = md.anim.S.measure.soles;
  const out = soles.map(() => []);
  const dt = 1 / 60;
  for (let f = 0; f < 60 + frames; f++) {
    md.anim.update(dt, { v, moving: true, posture: 'stand' });
    md.root.position.z += v * dt;
    md.root.updateMatrixWorld(true);
    if (f < 60) continue;
    soles.forEach((ids, l) => {
      let lo = Infinity;
      for (const i of ids) lo = Math.min(lo, m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld).y);
      out[l].push(lo);
    });
  }
  return out;
}

describe('trot posé', () => {
  // Au trot (le chat qui suit le joueur : 1,4 m/s), le corps restait porté par le haut de la foulée : siamois, abyssin,
  // devon rex, bobtail et sphynx trottaient les pattes avant à 6 à 14 mm du sol, jamais posées, le corps entier en
  // l'air une image sur deux ; les chatons enfonçaient leurs pieds de 3 mm.
  it.each([
    ['siamois', 'adult'], ['abyssin', 'adult'], ['devon_rex', 'adult'], ['bobtail', 'adult'], ['sphynx', 'adult'],
    ['europeen', 'adult'], ['persan', 'adult'], ['siamois', 'young'], ['abyssin', 'baby'], ['europeen', 'baby'],
  ])('%s (%s) : au trot, chaque patte se pose (à moins de 2 mm du sol) sans s\'enfoncer de plus de 2,5 mm', (b, stage) => {
    for (const v of [1.4, 2.2]) {
      const md = cat(b, stage);
      md.staticPose('stand');
      const tr = soleTrack(md, v);
      expect(md.anim.gait, `${b} ${stage} ${v}`).toBe('trot');
      tr.forEach((ys, l) => {
        const name = `${b} ${stage} ${v} m/s, patte ${['AVG', 'AVD', 'ARG', 'ARD'][l]}`;
        expect(Math.min(...ys), name).toBeLessThan(0.002);
        expect(Math.min(...ys), name).toBeGreaterThan(-0.0025);
        // (posée au moins une image sur seize : un vrai appui, pas un effleurement)
        expect(ys.filter((y) => y < 0.003).length / ys.length, name).toBeGreaterThan(1 / 16);
      });
      md.dispose();
    }
  });

  // (british et persan : les postérieurs glissaient de 8 % de la vitesse au pas, pieds tenus après la pose du corps)
  it('au pas, un pied toujours posé (à moins de 3 mm du sol) : british, persan', () => {
    for (const [b, stage] of [['british', 'adult'], ['persan', 'adult'], ['british', 'young']]) {
      const md = cat(b, stage);
      md.staticPose('stand');
      const tr = soleTrack(md, 0.6);
      expect(md.anim.gait).toBe('walk');
      const n = tr[0].length;
      let air = 0;
      for (let f = 0; f < n; f++) if (Math.min(tr[0][f], tr[1][f], tr[2][f], tr[3][f]) > 0.003) air++;
      expect(air / n, `${b} ${stage}`).toBeLessThan(0.08);
      md.dispose();
    }
  });
});

/**
 * Glissement des appuis (méthode de la critique) : le sommet de peau le plus bas d'une sole est suivi tant qu'il reste à
 * moins de 4 mm du sol ; chemin parcouru sur le sol ÷ (durée × vitesse du chat). Médiane des appuis de chaque patte.
 */
function slipRatios(md, v, frames = 240) {
  const m = md.coatMesh;
  const soles = md.anim.S.measure.soles;
  const dt = 1 / 60;
  const cur = soles.map(() => null);
  const ratios = soles.map(() => []);
  for (let f = 0; f < 120 + frames; f++) {
    md.anim.update(dt, { v, moving: true, posture: 'stand' });
    md.root.position.z += v * dt;
    md.root.updateMatrixWorld(true);
    if (f < 120) continue;
    soles.forEach((ids, l) => {
      const c = cur[l];
      if (c) {
        m.getVertexPosition(c.i, _v).applyMatrix4(m.matrixWorld);
        if (_v.y < 0.004) {
          c.path += Math.hypot(_v.x - c.x, _v.z - c.z);
          c.x = _v.x;
          c.z = _v.z;
          c.n++;
          return;
        }
        if (c.n >= 3) ratios[l].push(c.path / (c.n * dt) / v);
        cur[l] = null;
      }
      let lo = Infinity;
      let best = -1;
      for (const i of ids) {
        const y = m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld).y;
        if (y < lo) {
          lo = y;
          best = i;
        }
      }
      if (lo < 0.004) {
        m.getVertexPosition(best, _v).applyMatrix4(m.matrixWorld);
        cur[l] = { i: best, x: _v.x, z: _v.z, n: 0, path: 0 };
      }
    });
  }
  return ratios.map((r) => (r.length ? [...r].sort((a, b) => a - b)[Math.floor(r.length / 2)] : null));
}

describe('appuis tenus', () => {
  // British et persan (pattes courtes) : les postérieurs glissaient encore de 7,5 à 8,8 % de la vitesse au pas.
  it.each(['british', 'persan'])('%s : au pas, les postérieurs posés glissent de moins de 6 % de la vitesse', (b) => {
    for (const v of [0.5, 0.9]) {
      const md = cat(b);
      md.staticPose('stand');
      const r = slipRatios(md, v);
      expect(md.anim.gait).toBe('walk');
      for (const l of [2, 3]) {
        expect(r[l], `${b} ${v} m/s patte ${l}`).not.toBeNull();
        expect(r[l], `${b} ${v} m/s patte ${l}`).toBeLessThan(0.06);
      }
      md.dispose();
    }
  });
});

describe('queue en pompon du bobtail', () => {
  /** Bout de la queue (peau déformée de la race, repos) : avancée de l'extrémité au centre et au bord, rayon. */
  function tipShape(md) {
    const S = md.anim.S;
    const base = md.anim.base;
    const P = S.D.pos;
    const H = S.D.heads;
    const tb = base.tailBones;
    const a = V(...H[tb[tb.length - 2]].toArray());
    const b = V(...H[tb[tb.length - 1]].toArray());
    const axis = b.clone().sub(a).normalize();
    const pts = [];
    for (let i = 0; i < base.prims.coat.count; i++) {
      if (base.W.tail[i] < 0.7) continue;
      const p = V(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).sub(b);
      const t = p.dot(axis);
      const rho = p.clone().addScaledVector(axis, -t).length();
      pts.push([t, rho]);
    }
    const tMax = Math.max(...pts.map((x) => x[0]));
    const end = pts.filter((x) => x[0] > tMax - 0.03);
    const R = Math.max(...end.map((x) => x[1]));
    const rim = Math.max(...pts.filter((x) => x[1] > 0.8 * R).map((x) => x[0]));
    return { R, dome: tMax - rim };
  }
  // Le bout était un disque plat (moignon coupé net) : il est bombé d'au moins 40 % de son rayon.
  it.each([['bobtail', 'adult'], ['bobtail', 'baby']])('%s (%s) : bout de la queue arrondi', (b, stage) => {
    const md = cat(b, stage);
    const { R, dome } = tipShape(md);
    expect(R, b).toBeGreaterThan(0.005);
    expect(dome / R, `${b} ${stage}`).toBeGreaterThan(0.4);
    md.dispose();
  });
  // Le nœud de queue du salon était posé sur l'os du bout de la queue, enfoui dans le pompon : il sort de la boule.
  it('bobtail : le nœud de queue du salon est posé à la surface du pompon, pas dedans', () => {
    const md = cat('bobtail');
    md.staticPose('stand');
    md.root.updateMatrixWorld(true);
    const acc = buildAccessories(md, lookOf('bobtail'), { tail: { id: 'tailBow', color: 'blue' } });
    expect(acc.length).toBe(1);
    md.root.updateMatrixWorld(true);
    const bow = acc[0].getWorldPosition(V());
    // distance au plus proche sommet de la queue (peau animée) : le nœud est dehors, posé dessus (moins de 1,5 cm)
    const m = md.coatMesh;
    let near = Infinity;
    const tip = md.tailTip.getWorldPosition(V());
    for (let i = 0; i < md.anim.base.prims.coat.count; i++) {
      if (md.anim.base.W.tail[i] < 0.7) continue;
      const p = m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
      near = Math.min(near, p.distanceTo(bow));
    }
    expect(near).toBeLessThan(0.015);
    // (loin de l'os du bout de la queue, qui est au cœur de la boule)
    expect(bow.distanceTo(tip)).toBeGreaterThan(0.01);
    md.dispose();
  });
});

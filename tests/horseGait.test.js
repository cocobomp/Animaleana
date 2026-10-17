// Allures du cheval : sabots posés au sol et immobiles pendant l'appui, corps qui suit, IK juste.
import { describe, it, expect } from 'vitest';
import { GAITS, gaitStride, gaitDuty, hoofOffset, legRig, legIK, gaitFrame } from '../src/sim/horseGait.js';
import { horseBuild } from '../src/sim/horseLook.js';
import { SPECIES } from '../src/sim/species.js';
import { horseLegPoints } from '../src/game/models/horseModel.js';

const rigsOf = (id) => horseLegPoints(horseBuild(SPECIES.horse.breeds.find((b) => b.id === id)))
  .map((l) => legRig(l.pivot, l.knee, l.fetlock, l.front ? -1 : 1));

/** Simule une allure à vitesse constante ; renvoie des mesures sur les sabots (repère du sol). */
function run(id, gait, v) {
  const rigs = rigsOf(id);
  const H = rigs[0].pivot.y;
  const w = { walk: 0, trot: 0, gallop: 0, [gait]: 1 };
  const stride = gaitStride(gait, v, H);
  const dt = 1 / 60;
  let cyc = 0;
  let prev = null;
  let airborne = 0;
  let maxErr = 0;
  let slip = 0;
  let slipN = 0;
  let minDown = 4;
  const n = 600;
  for (let f = 0; f < n; f++) {
    const t = f * dt;
    cyc += (dt * v) / stride;
    const fr = gaitFrame(rigs, w, cyc, stride, v, H, 1);
    const ys = fr.legs.map((l, i) => l.hoof.y - rigs[i].hoof.y); // hauteur du sabot au-dessus du sol
    const zs = fr.legs.map((l) => l.hoof.z + v * t);
    const down = ys.filter((y) => y < 0.015).length;
    minDown = Math.min(minDown, down);
    if (down === 0) airborne++;
    fr.legs.forEach((l, i) => {
      if (l.target.y === rigs[i].hoof.y) maxErr = Math.max(maxErr, Math.abs(l.hoof.y - l.target.y));
      if (prev && ys[i] < 0.015 && prev.ys[i] < 0.015) {
        slip += Math.abs(zs[i] - prev.zs[i]) / dt;
        slipN++;
      }
    });
    prev = { ys, zs };
  }
  return { airborne: airborne / n, maxErr, slip: slip / Math.max(1, slipN), minDown };
}

describe('allures du cheval', () => {
  it('chaque allure a ses temps : pas à quatre temps, trot en diagonale, galop à trois temps', () => {
    expect(new Set(GAITS.walk.touchdown).size).toBe(4);
    expect(GAITS.trot.touchdown[0]).toBe(GAITS.trot.touchdown[3]); // antérieur gauche + postérieur droit
    expect(GAITS.trot.touchdown[1]).toBe(GAITS.trot.touchdown[2]);
    expect(new Set(GAITS.gallop.touchdown).size).toBe(3);
    expect(gaitStride('gallop', 11, 1.1)).toBeGreaterThan(gaitStride('gallop', 5.5, 1.1));
    expect(gaitDuty('gallop', 11)).toBeLessThan(gaitDuty('gallop', 5.5));
  });

  it('en appui, le sabot est au sol et recule exactement à la vitesse du corps', () => {
    const S = 1;
    const a = hoofOffset('walk', 2, 0.1, S, 0.1);
    const b = hoofOffset('walk', 2, 0.2, S, 0.1);
    expect(a.stance && b.stance).toBe(true);
    expect(a.y).toBe(0);
    // 0,1 tour en appui = 0,1 / 0,6 de l'appui ; l'appui dure S.
    expect(a.z - b.z).toBeCloseTo((0.1 / GAITS.walk.duty) * S, 5);
    const sw = hoofOffset('walk', 2, 0.8, S, 0.1);
    expect(sw.stance).toBe(false);
    expect(sw.y).toBeGreaterThan(0.05);
  });

  it('l\'IK à deux os atteint le sabot visé', () => {
    for (const r of rigsOf('selle_francais')) {
      const P = { y: r.pivot.y, z: r.pivot.z };
      for (const [dz, dy] of [[0.2, 0.06], [-0.25, 0.1], [0.1, 0.3], [0.3, 0.15]]) {
        const T = { z: r.hoof.z + dz, y: r.hoof.y + dy };
        const k = legIK(r, P, T);
        expect(Math.hypot(k.hoof.z - T.z, k.hoof.y - T.y)).toBeLessThan(1e-6);
      }
      // Au repos : la pose de repos (angles nuls) pour le postérieur.
      if (r.bend > 0) {
        const k = legIK(r, P, r.hoof);
        expect(Math.abs(k.a) + Math.abs(k.b)).toBeLessThan(1e-6);
      }
    }
  });

  it('au pas : toujours au moins deux sabots posés, sans glisser', () => {
    for (const id of ['selle_francais', 'percheron', 'shetland', 'akhal_teke']) {
      const r = run(id, 'walk', 1.6);
      expect(r.minDown, id).toBeGreaterThanOrEqual(2);
      expect(r.maxErr, id).toBeLessThan(0.012);
      expect(r.slip, id).toBeLessThan(0.12);
    }
  });

  it('au trot et au galop : appuis nets, suspension courte', () => {
    for (const id of ['selle_francais', 'percheron', 'shetland']) {
      const tr = run(id, 'trot', 3.2);
      expect(tr.airborne, id).toBeLessThan(0.2);
      expect(tr.maxErr, id).toBeLessThan(0.015);
      expect(tr.slip, id).toBeLessThan(0.15);
      const ga = run(id, 'gallop', 5.5);
      expect(ga.airborne, id).toBeLessThan(0.25);
      expect(ga.maxErr, id).toBeLessThan(0.015);
      expect(ga.slip, id).toBeLessThan(0.12);
    }
  });

  it('à l\'arrêt : le cheval est dans sa pose de repos', () => {
    const rigs = rigsOf('selle_francais');
    const fr = gaitFrame(rigs, { walk: 1, trot: 0, gallop: 0 }, 0.3, 1.6, 0, rigs[0].pivot.y, 0);
    expect(Math.abs(fr.by)).toBeLessThan(1e-3);
    expect(Math.abs(fr.pitch)).toBeLessThan(1e-3);
    fr.legs.forEach((l, i) => expect(Math.hypot(l.hoof.y - rigs[i].hoof.y, l.hoof.z - rigs[i].hoof.z)).toBeLessThan(0.01));
  });
});

import { describe, it, expect } from 'vitest';
import {
  ARENA, LETTERS, RAIL_LETTERS, GAITS, gaitOf, nextGait, letterPath, circlePath, serpentinePath, pathLengths, pathProgress,
  REPRISES, repriseFor, figureEnd, expectedDuration, figureMark, haltMark, reinBackMark, judgeComment, repriseResult,
  learnFactor, cooldownLeft, trainingBlock, trainingGain, applyTraining, flatSequence, transitionQuality, flatResult, RAIL_LOOP,
  dressageSkill, FIGURE_IDS,
} from '../src/sim/dressage.js';
import { SHOWGROUND } from '../src/sim/activities.js';
import { createAnimal } from '../src/sim/animal.js';

const horse = () => {
  const a = createAnimal({ species: 'horse', ageDays: 80, rng: () => 0.5 });
  a.needs.energy = 90;
  a.bond = 60;
  return a;
};

describe('rectangle de dressage', () => {
  it('tient dans la carrière, avec ses huit lettres sur la piste', () => {
    expect(ARENA.hl).toBeLessThan(SHOWGROUND.hw);
    expect(ARENA.hw).toBeLessThan(SHOWGROUND.hd);
    expect(RAIL_LETTERS).toHaveLength(8);
    for (const l of RAIL_LETTERS) expect(Math.abs(LETTERS[l].x) === ARENA.hl || Math.abs(LETTERS[l].z) === ARENA.hw).toBe(true);
    expect(LETTERS.A.x).toBeGreaterThan(0); // A du côté de l'entrée
    expect(LETTERS.C.x).toBeLessThan(0);
  });

  it('reconnaît les allures et les enchaîne', () => {
    expect(gaitOf(0)).toBe('halt');
    expect(gaitOf(GAITS.walk.speed)).toBe('walk');
    expect(gaitOf(GAITS.trot.speed)).toBe('trot');
    expect(gaitOf(GAITS.canter.speed)).toBe('canter');
    expect(nextGait('walk')).toBe('trot');
    expect(nextGait('canter')).toBe('walk');
  });

  it('arrondit les coins entre un petit et un grand côté', () => {
    const pts = letterPath(['A', 'K']);
    expect(pts).toHaveLength(3);
    expect(pts[1]).toEqual({ x: ARENA.hl - 2, z: -(ARENA.hw - 2) });
    expect(letterPath(['K', 'E'])).toHaveLength(2);
    expect(letterPath(['K', 'X', 'M'])).toHaveLength(3);
  });

  it('cercles et serpentines restent dans le rectangle', () => {
    for (const pts of [circlePath(LETTERS.X, ARENA.hw, 0), serpentinePath(3), RAIL_LOOP()]) {
      for (const p of pts) {
        expect(Math.abs(p.x)).toBeLessThanOrEqual(ARENA.hl + 0.01);
        expect(Math.abs(p.z)).toBeLessThanOrEqual(ARENA.hw + 0.01);
      }
    }
    const c = circlePath(LETTERS.X, 9, -Math.PI / 2);
    expect(c[0].z).toBeCloseTo(-9);
    expect(c[c.length - 1].z).toBeCloseTo(-9);
    expect(pathLengths(c).total).toBeCloseTo(2 * Math.PI * 9, 0);
  });

  it('la progression sur un tracé n\'avance que vers l\'avant (un cercle n\'est pas fini au départ)', () => {
    const pts = circlePath(LETTERS.X, 9, -Math.PI / 2);
    const len = pathLengths(pts);
    const start = pathProgress(pts, len, { x: 0, z: -9 }, 0);
    expect(start.prog).toBeLessThan(1);
    expect(start.dist).toBeCloseTo(0, 1);
    // À mi-chemin du cercle, après avoir avancé pas à pas.
    let prog = 0;
    for (let i = 1; i <= 12; i++) {
      const a = -Math.PI / 2 + (i / 24) * Math.PI * 2;
      ({ prog } = pathProgress(pts, len, { x: Math.cos(a) * 9.5, z: Math.sin(a) * 9.5 }, prog));
    }
    expect(prog).toBeGreaterThan(len.total * 0.45);
    expect(prog).toBeLessThan(len.total * 0.55);
    // Écart mesuré quand on coupe à l'intérieur.
    expect(pathProgress(pts, len, { x: 0, z: -5 }, prog).dist).toBeGreaterThan(3);
  });
});

describe('reprises', () => {
  it('ont entre 6 et 10 figures, commencent par l\'entrée à A et finissent par un arrêt', () => {
    for (const level of [1, 2, 3]) {
      const r = repriseFor(level);
      expect(r.length).toBeGreaterThanOrEqual(6);
      expect(r.length).toBeLessThanOrEqual(10);
      expect(r[0].id).toBe('enter');
      expect(r[0].pts[0]).toEqual(LETTERS.A);
      expect(['halt', 'haltBack']).toContain(r[r.length - 1].kind);
      for (const f of r) {
        expect(f.n).toBeGreaterThan(0);
        expect(figureEnd(f)).toBeTruthy();
        if (f.kind === 'path') expect(f.lengths.total).toBeGreaterThan(5);
        expect(expectedDuration(f)).toBeGreaterThan(2);
      }
    }
    expect(repriseFor(3).some((f) => f.kind === 'haltBack')).toBe(true);
    expect(repriseFor(2).some((f) => f.id === 'serpentine')).toBe(true);
    expect(REPRISES.training.length).toBeGreaterThanOrEqual(4);
    expect(Object.keys(REPRISES).every((k) => REPRISES[k].every((id) => FIGURE_IDS.includes(id)))).toBe(true);
  });

  it('les figures s\'enchaînent : chacune commence près de la fin de la précédente', () => {
    for (const level of [1, 2, 3]) {
      const r = repriseFor(level);
      for (let i = 1; i < r.length; i++) {
        const prev = figureEnd(r[i - 1]);
        const f = r[i];
        const start = f.kind === 'path' ? f.pts[0] : f.at;
        expect(Math.hypot(start.x - prev.x, start.z - prev.z), `${r[i - 1].id} → ${f.id}`).toBeLessThan(0.5);
      }
    }
  });
});

describe('notes du juge', () => {
  it('récompense précision, bonne allure et calme', () => {
    const perfect = figureMark({ meanDist: 0.3, gaitRatio: 1, changes: 1, duration: 10, expected: 10, skill: 100 });
    expect(perfect).toBe(10);
    const good = figureMark({ meanDist: 0.5, gaitRatio: 1, changes: 1, duration: 10, expected: 10, skill: 20 });
    expect(good).toBeGreaterThanOrEqual(9);
    const wrongGait = figureMark({ meanDist: 0.5, gaitRatio: 0, changes: 1, duration: 10, expected: 10, skill: 50 });
    expect(wrongGait).toBeLessThanOrEqual(good - 2.5);
    const offPath = figureMark({ meanDist: 3, gaitRatio: 1, changes: 1, duration: 10, expected: 10, skill: 50 });
    expect(offPath).toBeLessThan(good - 3);
    const rushed = figureMark({ meanDist: 0.5, gaitRatio: 1, changes: 5, duration: 10, expected: 10, skill: 50 });
    expect(rushed).toBeLessThan(good);
    expect(figureMark({ meanDist: 10, gaitRatio: 0, changes: 9, duration: 60, expected: 10, skill: 0 })).toBe(0);
  });

  it('note les arrêts et le reculer', () => {
    expect(haltMark({ dist: 0.3, settle: 2, moved: 0, skill: 50 })).toBeGreaterThanOrEqual(10);
    expect(haltMark({ dist: 3, settle: 9, moved: 2 })).toBeLessThan(3);
    expect(reinBackMark({ halted: true, dist: 0.5, wait: 2 })).toBeGreaterThanOrEqual(9.5);
    expect(reinBackMark({ halted: false, dist: 2, wait: 12 })).toBeLessThan(6);
  });

  it('le juge explique ce qui a péché', () => {
    expect(judgeComment(9.5)).toBe('brilliant');
    expect(judgeComment(6, { gaitRatio: 0.2 })).toBe('wrongGait');
    expect(judgeComment(6, { meanDist: 2.5 })).toBe('offPath');
    expect(judgeComment(6, { changes: 4 })).toBe('rushed');
    expect(judgeComment(7.5)).toBe('good');
    expect(judgeComment(1)).toBe('oops');
  });

  it('le total est un pourcentage, avec des étoiles', () => {
    const r = repriseResult([{ n: 1, id: 'enter', mark: 8 }, { n: 2, id: 'halt', mark: 6 }, { n: 3, id: 'circleE', mark: 7 }]);
    expect(r.percent).toBe(70);
    expect(r.points).toBe(70);
    expect(r.stars).toBe(3);
    expect(r.best.id).toBe('enter');
    expect(r.worst.id).toBe('halt');
    expect(repriseResult([{ n: 1, id: 'enter', mark: 5 }]).stars).toBe(1);
    expect(repriseResult([]).percent).toBe(0);
  });
});

describe('entraînement', () => {
  it('un cheval fatigué, stressé ou peu attaché apprend moins', () => {
    const a = horse();
    expect(learnFactor(a)).toEqual({ factor: 1, reasons: [] });
    a.needs.energy = 30;
    expect(learnFactor(a).reasons).toEqual(['tired']);
    a.stress = 60;
    a.bond = 10;
    const f = learnFactor(a);
    expect(f.reasons).toEqual(['tired', 'stressed', 'lowBond']);
    expect(f.factor).toBeGreaterThanOrEqual(0.25);
    expect(f.factor).toBeLessThan(0.3);
  });

  it('gagne 2 à 6 points, une fois par heure', () => {
    const a = horse();
    expect(dressageSkill(a)).toBe(10);
    expect(trainingGain(a, 0).gain).toBe(2);
    expect(trainingGain(a, 1).gain).toBe(6);
    expect(trainingBlock(a, 'flat', 600)).toBeNull();
    const r = applyTraining(a, 'flat', 1, 600);
    expect(r.gain).toBe(6);
    expect(a.skills.dressage).toBe(16);
    expect(a.skills.obedience).toBe(11);
    expect(trainingBlock(a, 'flat', 630)).toBe('cooldown');
    expect(cooldownLeft(a, 'flat', 630)).toBe(30);
    expect(trainingBlock(a, 'figures', 630)).toBeNull(); // une autre séance reste possible
    expect(trainingBlock(a, 'flat', 661)).toBeNull();
    a.needs.energy = 20;
    expect(applyTraining(a, 'figures', 1, 700).gain).toBe(3); // ×0,5
    delete a.skills.dressage; // ancien cheval
    expect(applyTraining(a, 'flat', 0, 800).skill).toBe(11);
  });

  it('séance de plat : transitions annoncées, qualité selon le retard', () => {
    const seq = flatSequence(8, 'x');
    expect(seq).toHaveLength(9);
    expect(seq[0]).toEqual({ gait: 'walk', at: 0 });
    for (let i = 1; i < seq.length; i++) {
      expect(seq[i].gait).not.toBe(seq[i - 1].gait);
      expect(seq[i].at - seq[i - 1].at).toBeGreaterThanOrEqual(5);
    }
    expect(flatSequence(8, 'x')).toEqual(seq);
    expect(transitionQuality(0.2)).toBe(1);
    expect(transitionQuality(1)).toBeLessThan(1);
    expect(transitionQuality(5)).toBe(0);
    expect(transitionQuality(-1)).toBe(0.3);
    const r = flatResult([1, 1, 0.8, 1], 0, 40);
    expect(r.stars).toBe(3);
    expect(r.points).toBe(96);
    expect(flatResult([0, 0.2], 20, 40).stars).toBe(1);
  });
});

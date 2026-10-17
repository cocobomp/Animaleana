import { describe, it, expect } from 'vitest';
import { createAnimal, ILLNESSES } from '../src/sim/animal.js';
import { mulberry32 as makeRng } from '../src/sim/rng.js';
import {
  VITALS, VITAL_SPECIES, TOOLS, TOOL_IDS, MEASURES, MEASURE_IDS, TOOL_ZONES, ILLNESS_SIGNS, ILLNESS_IDS, KEY_SIGNS, SIGN_MEASURE,
  classify, makeCase, evaluate, signsFound, compatibleDiagnoses, isRightDiagnosis, missingExam, bpmFromCount, expectedCount,
  countOk, slowmoOf, slowmoFor, typicalHeartOf, measureFor, normalKg, typicalKg, bodyScore, treatmentFor, doseFor, TREATMENTS, CRT_MAX,
} from '../src/sim/vetExam.js';

const SPECIES = ['horse', 'dog', 'cat', 'rabbit', 'sheep', 'goat', 'cow'];
const animal = (species, sick = null, extra = {}) => {
  const a = createAnimal({ species, ageDays: 200, rng: makeRng(7) });
  a.sick = sick;
  return Object.assign(a, extra);
};

/** Ce que trouve un examen complet (le cœur bien compté). */
function fullExam(cs) {
  return MEASURE_IDS.map((m) => {
    if (m === 'heart') return evaluate(cs, m, { count: Math.round(expectedCount(cs.heart, cs.slowmo)) });
    if (m === 'crt') return evaluate(cs, m, { seconds: cs.crt });
    if (m === 'gait') return evaluate(cs, m, { answer: cs.lame ? 'lame' : 'sound' });
    return evaluate(cs, m);
  });
}

describe('constantes normales par espèce', () => {
  it('les 7 espèces ont des plages réalistes (°C, battements et respirations par minute)', () => {
    expect(VITAL_SPECIES).toEqual(expect.arrayContaining(SPECIES));
    for (const sp of SPECIES) {
      const V = VITALS[sp];
      expect(V.temp[0]).toBeLessThan(V.temp[1]);
      expect(V.temp[0]).toBeGreaterThanOrEqual(37);
      expect(V.temp[1]).toBeLessThanOrEqual(40.5);
      expect(V.heart[0]).toBeLessThan(V.heart[1]);
      expect(V.resp[0]).toBeLessThan(V.resp[1]);
      expect(V.kg).toBeGreaterThan(1);
    }
  });

  it('les grands animaux ont le cœur plus lent que les petits', () => {
    expect(VITALS.horse.heart[1]).toBeLessThan(VITALS.dog.heart[1]);
    expect(VITALS.cow.heart[1]).toBeLessThan(VITALS.cat.heart[0]);
    expect(VITALS.cat.heart[0]).toBeLessThan(VITALS.rabbit.heart[1]);
    // Le cheval est le plus « froid », le lapin le plus chaud.
    expect(VITALS.horse.temp[1]).toBeLessThan(VITALS.rabbit.temp[1]);
  });

  it('classify : en dessous, dans, au-dessus de la norme', () => {
    expect(classify(37.0, VITALS.horse.temp)).toBe('low');
    expect(classify(37.8, VITALS.horse.temp)).toBe('normal');
    expect(classify(39.4, VITALS.horse.temp)).toBe('high');
  });
});

describe('outils, zones et mesures', () => {
  it('la trousse a les 7 outils et chaque mesure a son outil', () => {
    expect(TOOL_IDS).toEqual(['stetho', 'thermo', 'light', 'mouth', 'palpate', 'scale', 'walk']);
    for (const t of TOOLS) expect(t.emoji).toBeTruthy();
    for (const m of MEASURE_IDS) expect(TOOL_IDS).toContain(MEASURES[m].tool);
    expect(TOOL_ZONES.stetho).toEqual(['heart', 'lungs', 'gut']);
    expect(measureFor('stetho', 'heart')).toBe('heart');
    expect(measureFor('mouth', 'mouth')).toBe('gums');
    expect(measureFor('palpate', 'legHind')).toBe('palpHind');
  });

  it('chaque signe de maladie se trouve avec une mesure', () => {
    for (const id of ILLNESS_IDS) {
      expect(ILLNESSES[id]).toBeTruthy();
      for (const s of ILLNESS_SIGNS[id]) expect(s === 'painLeg' || !!SIGN_MEASURE[s]).toBe(true);
      for (const s of KEY_SIGNS[id]) expect(ILLNESS_SIGNS[id]).toContain(s);
    }
  });
});

describe('compter les battements du cœur', () => {
  it('10 s × 6, et × 2 au ralenti pour le chat et le lapin', () => {
    expect(bpmFromCount(6, 'horse')).toBe(36);
    expect(bpmFromCount(15, 'dog')).toBe(90);
    expect(slowmoOf('cat')).toBe(2);
    expect(bpmFromCount(15, 'cat')).toBe(180);
    expect(expectedCount(180, 'cat')).toBeCloseTo(15);
  });

  it('le ralenti dépend du rythme, pas de l\'espèce : jamais plus de ~2 taps par seconde', () => {
    expect(slowmoFor(36)).toBe(1);
    expect(slowmoFor(118)).toBe(1);
    expect(slowmoFor(190)).toBe(2); // chienne grippée : au ralenti × 2 (et pas 3 taps par seconde)
    expect(slowmoFor(340)).toBe(3); // lapin malade : au ralenti × 3
    expect(bpmFromCount(16, 2)).toBe(192);
    expect(bpmFromCount(19, 3)).toBe(342);
    expect(expectedCount(342, 3)).toBeCloseTo(19);
    expect(countOk(16, 190, 2)).toBe(true);
    expect(countOk(31, 190, 2)).toBe(false); // compté sans ralenti : trop
    for (const sp of SPECIES) {
      for (const sick of [null, 'flu', 'belly', 'paw', 'cold']) {
        for (let seed = 1; seed < 30; seed++) {
          const cs = makeCase(animal(sp, sick), makeRng(seed));
          expect(cs.slowmo).toBe(slowmoFor(cs.heart));
          const tapsPerSecond = cs.heart / cs.slowmo / 60;
          expect(tapsPerSecond, `${sp} ${sick} ${cs.heart}`).toBeLessThanOrEqual(2.05);
          // Et pas de ralenti inutile : au moins ~1 tap par seconde.
          expect(tapsPerSecond, `${sp} ${sick} ${cs.heart}`).toBeGreaterThan(0.45);
        }
      }
    }
    // Un cœur typique d'espèce : cheval ≈ 36, chien ≈ 100, lapin ≈ 215.
    expect(typicalHeartOf('horse')).toBe(36);
    expect(typicalHeartOf('dog')).toBe(100);
    expect(typicalHeartOf('rabbit')).toBe(215);
  });

  it('un compte à peu près juste est accepté, un compte au hasard non', () => {
    expect(countOk(6, 36, 'horse')).toBe(true);
    expect(countOk(7, 36, 'horse')).toBe(true);
    expect(countOk(12, 36, 'horse')).toBe(false);
    expect(countOk(30, 180, 'cat')).toBe(false); // au ralenti, on entend 15 « boum »
  });

  it('compte faux : on recompte ; deux fois raté, le docteur aide', () => {
    const cs = makeCase(animal('horse'), makeRng(3));
    expect(evaluate(cs, 'heart', { count: 2 })).toMatchObject({ retry: true, reason: 'few' });
    expect(evaluate(cs, 'heart', { count: 40 })).toMatchObject({ retry: true, reason: 'many' });
    const r = evaluate(cs, 'heart', { assisted: true });
    expect(r).toMatchObject({ status: 'ok', value: cs.heart, assisted: true });
  });

  it('mesuré à peu près juste, la conclusion est toujours la bonne (normal ou trop rapide)', () => {
    for (const sp of SPECIES) {
      for (const sick of [null, 'flu', 'belly', 'paw']) {
        for (let seed = 1; seed < 25; seed++) {
          const cs = makeCase(animal(sp, sick), makeRng(seed));
          const exp = expectedCount(cs.heart, cs.slowmo);
          const want = sick ? 'bad' : 'ok';
          for (const count of [Math.floor(exp), Math.ceil(exp)]) {
            const r = evaluate(cs, 'heart', { count });
            if (!r.retry) expect(r.status).toBe(want);
          }
          // Le compte arrondi au plus près est toujours accepté.
          expect(evaluate(cs, 'heart', { count: Math.round(exp) }).retry).toBeFalsy();
        }
      }
    }
  });
});

describe('le cas d\'un animal', () => {
  it('en bonne santé : toutes les mesures sont normales', () => {
    for (const sp of SPECIES) {
      for (let seed = 1; seed < 10; seed++) {
        const cs = makeCase(animal(sp), makeRng(seed));
        const results = fullExam(cs);
        for (const r of results) expect(r.status, `${sp} ${r.measure}`).toBe('ok');
        expect(compatibleDiagnoses(signsFound(results))).toEqual([{ id: 'healthy', matched: [], key: true }]);
      }
    }
  });

  it('chaque maladie montre ses signes, et l\'examen complet ne propose qu\'elle', () => {
    for (const sp of SPECIES) {
      for (const ill of ILLNESS_IDS) {
        const cs = makeCase(animal(sp, ill), makeRng(11));
        const signs = signsFound(fullExam(cs));
        for (const s of signs) expect(ILLNESS_SIGNS[ill], `${sp} ${ill} ${s}`).toContain(s);
        expect(signs.some((s) => KEY_SIGNS[ill].includes(s)), `${sp} ${ill}`).toBe(true);
        const dx = compatibleDiagnoses(signs);
        expect(dx[0].id, `${sp} ${ill}`).toBe(ill);
        expect(dx).toHaveLength(1);
      }
    }
  });

  it('la fièvre seule laisse plusieurs maladies possibles', () => {
    const ids = compatibleDiagnoses(['fever']).map((x) => x.id);
    expect(ids).toEqual(expect.arrayContaining(['belly', 'cold', 'flu']));
    expect(ids).not.toContain('ear');
    // Avec les crépitements, c'est la grippe ; avec le sifflement, le rhume.
    expect(compatibleDiagnoses(['fever', 'crackles']).map((x) => x.id)).toEqual(['flu']);
    expect(compatibleDiagnoses(['fever', 'wheeze']).map((x) => x.id)).toEqual(['cold']);
    // Le poids n'est pas une maladie.
    expect(compatibleDiagnoses(['fat'])[0].id).toBe('healthy');
  });

  it('colique : ventre silencieux chez le cheval, gargouillis chez le chien', () => {
    expect(evaluate(makeCase(animal('horse', 'belly')), 'gut')).toMatchObject({ status: 'bad', signs: ['gutSilent'] });
    expect(evaluate(makeCase(animal('dog', 'belly')), 'gut')).toMatchObject({ status: 'bad', signs: ['gutLoud'] });
    const cs = makeCase(animal('horse', 'belly'));
    expect(cs.crt).toBeGreaterThan(CRT_MAX);
    expect(evaluate(cs, 'gums').signs).toEqual(['gumsPale']);
    expect(evaluate(cs, 'palpBelly').signs).toEqual(['painBelly']);
  });

  it('boiterie : la bonne patte fait mal, et il faut bien regarder la marche', () => {
    const cs = makeCase(animal('horse', 'paw'), makeRng(5));
    expect(['front', 'hind']).toContain(cs.lame);
    const sore = cs.lame === 'front' ? 'palpFront' : 'palpHind';
    const other = cs.lame === 'front' ? 'palpHind' : 'palpFront';
    expect(evaluate(cs, sore).status).toBe('bad');
    expect(evaluate(cs, other).status).toBe('ok');
    expect(evaluate(cs, 'gait', { answer: 'sound' })).toMatchObject({ retry: true });
    expect(evaluate(cs, 'gait', { answer: 'lame' })).toMatchObject({ status: 'bad', signs: ['lame'], leg: cs.lame });
  });

  it('temps de recoloration : trop tôt on attend, sinon on garde le temps compté', () => {
    const cs = makeCase(animal('dog'), makeRng(2));
    expect(evaluate(cs, 'crt', { seconds: 0.1 })).toMatchObject({ retry: true, reason: 'early' });
    const r = evaluate(cs, 'crt', { seconds: 1.4 });
    expect(r).toMatchObject({ status: 'ok', norm: [0, CRT_MAX] });
    expect(r.value).toBeGreaterThan(0);
  });

  it('température et respiration sont données avec la norme de l\'espèce', () => {
    const cs = makeCase(animal('cat', 'flu'), makeRng(4));
    const temp = evaluate(cs, 'temp');
    expect(temp).toMatchObject({ status: 'bad', signs: ['fever'], norm: VITALS.cat.temp, unit: '°C' });
    expect(temp.value).toBeGreaterThan(VITALS.cat.temp[1]);
    const lungs = evaluate(cs, 'lungs');
    expect(lungs.signs).toEqual(expect.arrayContaining(['crackles', 'breathFast']));
    expect(lungs.norm).toEqual(VITALS.cat.resp);
  });
});

describe('poids et balance', () => {
  it('le poids suit la taille de la race', () => {
    const chihuahua = createAnimal({ species: 'dog', breed: 'chihuahua', ageDays: 200 });
    const stBernard = createAnimal({ species: 'dog', breed: 'saint_bernard', ageDays: 200 });
    const shetland = createAnimal({ species: 'horse', breed: 'shetland', ageDays: 200 });
    expect(typicalKg(chihuahua)).toBeLessThan(5);
    expect(typicalKg(stBernard)).toBeGreaterThan(45);
    expect(typicalKg(shetland)).toBeLessThan(250);
    const [lo, hi] = normalKg(stBernard);
    expect(lo).toBeLessThan(hi);
  });

  it('trop gros ou trop maigre : noté, mais ce n\'est pas une maladie', () => {
    const fat = animal('dog', null, { weight: 85 });
    expect(bodyScore(fat)).toBe('fat');
    const cs = makeCase(fat, makeRng(1));
    const r = evaluate(cs, 'weight');
    expect(r).toMatchObject({ status: 'bad', signs: ['fat'] });
    expect(r.value).toBeGreaterThan(r.norm[1]);
  });
});

describe('diagnostic et traitement', () => {
  it('bon diagnostic, et l\'indice dit quel examen manque', () => {
    const cs = makeCase(animal('dog', 'flu'), makeRng(1));
    expect(isRightDiagnosis(cs, 'flu')).toBe(true);
    expect(isRightDiagnosis(cs, 'cold')).toBe(false);
    expect(missingExam(cs, ['temp'])).toBe('lungs');
    expect(missingExam(cs, ['temp', 'lungs'])).toBe(null);
    const healthy = makeCase(animal('cat'), makeRng(1));
    expect(isRightDiagnosis(healthy, 'healthy')).toBe(true);
    expect(missingExam(healthy, [])).toBe('temp');
    const lame = makeCase(animal('horse', 'paw'), makeRng(1));
    expect(missingExam(lame, ['temp'])).toBe('gait');
  });

  it('chaque maladie a son soin, et la dose suit le poids', () => {
    for (const id of ILLNESS_IDS) expect(TREATMENTS).toContain(treatmentFor(id));
    expect(doseFor('syrup', 30)).toEqual({ amount: 6, unit: 'ml' });
    expect(doseFor('injection', 500)).toEqual({ amount: 50, unit: 'ml' });
    expect(doseFor('syrup', 2)).toEqual({ amount: 0.5, unit: 'ml' });
    expect(doseFor('drops', 30)).toBe(null);
  });
});

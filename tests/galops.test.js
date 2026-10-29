// 🏅 Les Galops (src/sim/galops.js) : la pratique avec ton cheval ouvre l'examen, 4 bonnes réponses sur 5 pour
// l'avoir, un Galop après l'autre ; chaque question a ses textes (FR et EN) ; tes Galops calment ton cheval en balade.
import { describe, it, expect, beforeAll } from 'vitest';
import {
  GALOPS, EXAM_QUESTIONS, EXAM_PASS, ANSWERS, galopLevel, nextGalop, isOpen, practiceOf, canTakeExam, makeExam, isRight,
  finishExam, galopsSummary,
} from '../src/sim/galops.js';
import { createProfile } from '../src/sim/profile.js';
import { nextSpookIn } from '../src/sim/riding.js';
import { mulberry32 } from '../src/sim/rng.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

/** Toute la pratique d'un Galop faite. */
function practise(p, id) {
  for (const it of GALOPS.find((x) => x.id === id).practice) p.stats[it.stat] = Math.max(p.stats[it.stat] ?? 0, it.n);
}

describe('les Galops', () => {
  it('au début : aucun Galop, le 1 est ouvert, mais il faut d\'abord la pratique', () => {
    const p = createProfile('Lou');
    expect(galopLevel(p)).toBe(0);
    expect(nextGalop(p).id).toBe(1);
    expect(isOpen(p, 1)).toBe(true);
    expect(isOpen(p, 2)).toBe(false);
    expect(canTakeExam(p, 1)).toEqual({ ok: false, reason: 'practice' });
    expect(practiceOf(p, 1).every((x) => !x.done && x.have === 0)).toBe(true);
    p.stats.horse_pet = 7; // (le compte s'arrête à ce qui est demandé)
    expect(practiceOf(p, 1).find((x) => x.id === 'pet')).toEqual({ id: 'pet', icon: '❤️', have: 3, n: 3, done: true });
    expect(canTakeExam(p, 2)).toEqual({ ok: false, reason: 'locked' });
  });

  it('l\'examen : 5 questions différentes, les réponses mélangées ; 3 bonnes réponses ne suffisent pas, 4 oui', () => {
    const p = createProfile('Lou');
    practise(p, 1);
    expect(canTakeExam(p, 1).ok).toBe(true);
    const exam = makeExam(1, mulberry32(3));
    expect(exam).toHaveLength(EXAM_QUESTIONS);
    expect(new Set(exam.map((q) => q.k)).size).toBe(EXAM_QUESTIONS);
    for (const q of exam) expect([...q.order].sort()).toEqual([0, 1, 2]);
    expect(finishExam(p, 1, EXAM_PASS - 1, 4)).toEqual({ passed: false, missing: 1 });
    expect(galopLevel(p)).toBe(0);
    const coins = GALOPS[0].coins;
    expect(finishExam(p, 1, EXAM_PASS, 5)).toEqual({ passed: true, coins, level: 1 });
    expect(p.galops[1]).toBe(5);
    expect(p.stats.galops).toBe(1);
    // déjà obtenu : on ne le repasse pas ; le Galop 2 s'ouvre
    expect(canTakeExam(p, 1)).toEqual({ ok: false, reason: 'done' });
    expect(finishExam(p, 1, 5, 6)).toBeNull();
    expect(isOpen(p, 2)).toBe(true);
    expect(nextGalop(p).id).toBe(2);
  });

  it('tous les Galops, l\'un après l\'autre', () => {
    const p = createProfile('Lou');
    for (const x of GALOPS) {
      practise(p, x.id);
      expect(finishExam(p, x.id, 5, x.id).passed).toBe(true);
    }
    expect(galopLevel(p)).toBe(GALOPS.length);
    expect(nextGalop(p)).toBeNull();
    expect(galopsSummary(p).every((x) => x.done && !x.ready)).toBe(true);
  });

  it('chaque question a trois réponses, une seule bonne, et ses textes en français et en anglais', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const x of GALOPS) {
        expect(x.quiz.length).toBeGreaterThanOrEqual(EXAM_QUESTIONS);
        x.quiz.forEach((correct, i) => {
          const k = i + 1;
          expect(correct >= 0 && correct < ANSWERS).toBe(true);
          expect([0, 1, 2].filter((a) => isRight(x.id, k, a))).toEqual([correct]);
          for (const key of [`gq_${x.id}_${k}`, `gq_${x.id}_${k}_why`, ...[1, 2, 3].map((a) => `gq_${x.id}_${k}_a${a}`)]) {
            expect(t(key), `${lang} ${key}`).not.toBe(key);
          }
        });
        expect(t(`galop_sub_${x.id}`)).not.toBe(`galop_sub_${x.id}`);
        for (const it of x.practice) expect(t(`gp_${it.id}`), `${lang} gp_${it.id}`).not.toBe(`gp_${it.id}`);
      }
    }
    setLang('fr');
    expect(t('gq_2_1_a3')).toBe('4 temps'); // (le pas : 4 temps, la bonne réponse)
  });

  it('les textes français et anglais ont les mêmes clés', async () => {
    const { GALOPS_FR, GALOPS_EN } = await import('../src/ui/galopsTexts.js');
    expect(Object.keys(GALOPS_EN).sort()).toEqual(Object.keys(GALOPS_FR).sort());
  });

  it('avec tes Galops, ton cheval s\'effraie moins souvent en balade', () => {
    const a = { personality: 'shy', skills: { obedience: 10 }, bond: 20 };
    const r = () => 0.5;
    expect(nextSpookIn(a, r, 3)).toBeCloseTo(nextSpookIn(a, r) * 1.6, 5);
    expect(nextSpookIn(a, r, 1)).toBeGreaterThan(nextSpookIn(a, r, 0));
  });
});

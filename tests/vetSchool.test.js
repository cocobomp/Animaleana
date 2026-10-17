import { describe, it, expect } from 'vitest';
import { createProfile, loadProfile, saveProfile } from '../src/sim/profile.js';
import { canStart, startCareer, careerXp, careerSummary, rankOf, careerState, shouldPropose } from '../src/sim/careers.js';
import {
  LESSONS, LESSON_IDS, BASIC_IDS, LESSON_XP, MASTER_XP, schoolState, completeLesson, isUnlocked, nextLesson, basicsDone, allDone,
  quizStars, isRightAnswer, schoolSummary, lessonStars, hasDiploma, HEART_SORT,
} from '../src/sim/vetSchool.js';
import { typicalHeartOf, VITALS } from '../src/sim/vetExam.js';

const finish = (p, ids, stars = 3) => ids.map((id, i) => completeLesson(p, id, { stars, day: i + 1 }));

describe('les leçons', () => {
  it('6 à 8 leçons, chacune avec un exercice et 2 ou 3 questions', () => {
    expect(LESSONS.length).toBeGreaterThanOrEqual(6);
    expect(LESSONS.length).toBeLessThanOrEqual(8);
    expect(BASIC_IDS.length).toBeGreaterThanOrEqual(3);
    for (const l of LESSONS) {
      expect(l.emoji && l.exercise).toBeTruthy();
      expect(l.quiz.length).toBeGreaterThanOrEqual(2);
      expect(l.quiz.length).toBeLessThanOrEqual(3);
      for (const q of l.quiz) expect(q.correct).toBeLessThan(q.answers);
    }
    // Les leçons de base sont au début.
    expect(LESSON_IDS.slice(0, BASIC_IDS.length)).toEqual(BASIC_IDS);
  });

  it('leçon 1 : les cœurs affichés (valeur typique) se rangent du plus lent au plus rapide', () => {
    // On montre un nombre par animal (pas la plage) : un enfant qui compare les nombres trouve l'ordre attendu.
    const shown = HEART_SORT.map(typicalHeartOf);
    for (let i = 1; i < shown.length; i++) expect(shown[i], HEART_SORT[i]).toBeGreaterThan(shown[i - 1]);
    for (const sp of HEART_SORT) {
      expect(typicalHeartOf(sp)).toBeGreaterThanOrEqual(VITALS[sp].heart[0]);
      expect(typicalHeartOf(sp)).toBeLessThanOrEqual(VITALS[sp].heart[1]);
    }
  });

  it('les bonnes réponses et les étoiles', () => {
    expect(isRightAnswer('vitals', 0, LESSONS[0].quiz[0].correct)).toBe(true);
    expect(isRightAnswer('vitals', 0, LESSONS[0].quiz[0].correct + 1)).toBe(false);
    expect(isRightAnswer('nope', 0, 0)).toBe(false);
    expect(quizStars(0)).toBe(3);
    expect(quizStars(1)).toBe(2);
    expect(quizStars(4)).toBe(1);
  });
});

describe('progression dans l\'école', () => {
  it('les leçons s\'ouvrent l\'une après l\'autre', () => {
    const p = createProfile('Lou');
    expect(isUnlocked(p, LESSON_IDS[0])).toBe(true);
    expect(isUnlocked(p, LESSON_IDS[1])).toBe(false);
    expect(nextLesson(p).id).toBe(LESSON_IDS[0]);
    completeLesson(p, LESSON_IDS[0], { stars: 2, day: 3 });
    expect(isUnlocked(p, LESSON_IDS[1])).toBe(true);
    expect(nextLesson(p).id).toBe(LESSON_IDS[1]);
    expect(schoolState(p).done[LESSON_IDS[0]]).toEqual({ stars: 2, day: 3 });
  });

  it('une leçon réussie donne de l\'XP de métier une seule fois, et garde les meilleures étoiles', () => {
    const p = createProfile('Lou');
    startCareer(p, 'vet', 1, { level: 3 });
    const r = completeLesson(p, 'vitals', { stars: 1 });
    expect(r).toMatchObject({ first: true, xp: LESSON_XP });
    expect(careerXp(p, 'vet')).toBe(LESSON_XP);
    const again = completeLesson(p, 'vitals', { stars: 3 });
    expect(again).toMatchObject({ first: false, xp: 0 });
    expect(careerXp(p, 'vet')).toBe(LESSON_XP);
    expect(lessonStars(p, 'vitals')).toBe(3);
    completeLesson(p, 'vitals', { stars: 1 });
    expect(lessonStars(p, 'vitals')).toBe(3);
    expect(p.stats.vetLessons).toBe(1);
  });

  it('les leçons de base donnent le diplôme : on peut commencer le métier avant le niveau 3', () => {
    const p = createProfile('Lou');
    expect(canStart(p, 'vet', { level: 1 }).ok).toBe(false);
    const results = finish(p, BASIC_IDS);
    expect(results.at(-1).diploma).toBe(true);
    expect(results.slice(0, -1).every((r) => !r.diploma)).toBe(true);
    expect(basicsDone(p)).toBe(true);
    expect(hasDiploma(p)).toBe(true);
    expect(careerState(p).diplomas.vet).toBeDefined();
    expect(canStart(p, 'vet', { level: 1 }).ok).toBe(true);
    expect(careerSummary(p, 'vet', { level: 1 }).state).toBe('available');
    expect(shouldPropose(p, 'vet', { level: 1, day: 5, building: 'vet' })).toBe(true);
    // Le diplôme ne vaut que pour le vétérinaire.
    expect(canStart(p, 'pension', { level: 1 }).ok).toBe(false);
  });

  it('l\'XP des leçons est gardée et compte quand on commence le métier ; toute l\'école = confirmé', () => {
    const p = createProfile('Lou');
    const results = finish(p, LESSON_IDS);
    expect(results.at(-1).master).toBe(true);
    expect(allDone(p)).toBe(true);
    expect(startCareer(p, 'vet', 9, { level: 1 }).ok).toBe(true);
    expect(careerXp(p, 'vet')).toBe(LESSON_IDS.length * LESSON_XP + MASTER_XP);
    expect(rankOf(p, 'vet')).toBe(1); // confirmé
  });

  it('le résumé et la sauvegarde (vieux profils complétés)', () => {
    const p = createProfile('Lou');
    finish(p, BASIC_IDS.slice(0, 2));
    const s = schoolSummary(p);
    expect(s).toMatchObject({ done: 2, total: LESSONS.length, basicsDone: 2, diploma: false, next: BASIC_IDS[2] });
    expect(s.lessons[0]).toMatchObject({ done: true, stars: 3, unlocked: true });
    // Un vieux profil sans école ni diplômes.
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    const old = createProfile('Vieux');
    delete old.vetSchool;
    delete old.careers.diplomas;
    saveProfile(old);
    const back = loadProfile(old.id);
    expect(back.vetSchool).toEqual({ done: {}, diploma: null, master: null });
    expect(back.careers.diplomas).toEqual({});
    delete globalThis.localStorage;
  });
});

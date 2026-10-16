// École vétérinaire : de courtes leçons pour apprendre le métier (constantes, stéthoscope,
// thermomètre, yeux / oreilles / bouche, palper, sabots et boiterie, maladies, soigner et suivre).
// Chaque leçon = une explication illustrée, un petit exercice et 2 ou 3 questions.
// Une leçon réussie se coche ✅ et donne de l'XP de métier vétérinaire ; finir les leçons de base
// donne le diplôme d'apprenti (on peut alors commencer le métier, même avant le niveau 3),
// finir toute l'école donne un bonus d'XP (de quoi passer « confirmé »).
// Logique pure, testée dans tests/vetSchool.test.js. L'interface est dans src/ui/vetSchool.js.
//
// Dans le profil :
//   profile.vetSchool = {
//     done: { vitals: { stars: 3, day: 4 } },  // leçons réussies (meilleures étoiles, jour)
//     diploma: day | null,                       // diplôme d'apprenti (leçons de base finies)
//     master: day | null,                        // toute l'école finie
//   }

import { careerState, isStarted, addCareerXp } from './careers.js';

export const LESSON_XP = 15; // XP de métier par leçon réussie (la première fois)
export const MASTER_XP = 30; // bonus quand toute l'école est finie

/**
 * Les leçons, dans l'ordre. exercise : le genre d'exercice (src/ui/vetSchool.js).
 * quiz : pour chaque question, le nombre de réponses et l'indice de la bonne
 * (textes vs_<id>_q<n>, vs_<id>_q<n>_a<k> et vs_<id>_q<n>_why dans src/ui/vetTexts.js).
 */
export const LESSONS = [
  { id: 'vitals', emoji: '📏', basic: true, exercise: 'sortHeart', quiz: [{ answers: 3, correct: 0 }, { answers: 3, correct: 1 }, { answers: 3, correct: 2 }] },
  { id: 'stetho', emoji: '🩺', basic: true, exercise: 'stetho', quiz: [{ answers: 3, correct: 1 }, { answers: 3, correct: 0 }, { answers: 3, correct: 2 }] },
  { id: 'thermo', emoji: '🌡️', basic: true, exercise: 'thermo', quiz: [{ answers: 3, correct: 2 }, { answers: 3, correct: 0 }] },
  { id: 'look', emoji: '🔦', basic: true, exercise: 'look', quiz: [{ answers: 3, correct: 0 }, { answers: 3, correct: 1 }, { answers: 3, correct: 0 }] },
  { id: 'palpate', emoji: '👆', basic: false, exercise: 'palpate', quiz: [{ answers: 3, correct: 1 }, { answers: 3, correct: 2 }] },
  { id: 'hooves', emoji: '🐴', basic: false, exercise: 'gait', quiz: [{ answers: 3, correct: 0 }, { answers: 3, correct: 1 }, { answers: 3, correct: 2 }] },
  { id: 'illness', emoji: '🤒', basic: false, exercise: 'match', quiz: [{ answers: 3, correct: 2 }, { answers: 3, correct: 0 }] },
  { id: 'care', emoji: '💊', basic: false, exercise: 'treat', quiz: [{ answers: 3, correct: 1 }, { answers: 3, correct: 0 }, { answers: 3, correct: 2 }] },
];
export const LESSON_IDS = LESSONS.map((l) => l.id);
export const BASIC_IDS = LESSONS.filter((l) => l.basic).map((l) => l.id);
export const lessonDef = (id) => LESSONS.find((l) => l.id === id) ?? null;

export function defaultVetSchool() {
  return { done: {}, diploma: null, master: null };
}

/** État de l'école dans le profil (complété pour les vieilles sauvegardes). */
export function schoolState(profile) {
  if (!profile.vetSchool) profile.vetSchool = defaultVetSchool();
  else for (const [k, v] of Object.entries(defaultVetSchool())) if (profile.vetSchool[k] === undefined) profile.vetSchool[k] = v;
  return profile.vetSchool;
}

export const lessonDone = (profile, id) => !!schoolState(profile).done[id];
export const lessonStars = (profile, id) => schoolState(profile).done[id]?.stars ?? 0;
export const lessonsDoneCount = (profile) => LESSON_IDS.filter((id) => lessonDone(profile, id)).length;
export const basicsDone = (profile) => BASIC_IDS.every((id) => lessonDone(profile, id));
export const allDone = (profile) => LESSON_IDS.every((id) => lessonDone(profile, id));
export const hasDiploma = (profile) => !!schoolState(profile).diploma;

/** Une leçon s'ouvre quand la précédente est réussie (la première est toujours ouverte). */
export function isUnlocked(profile, id) {
  const i = LESSON_IDS.indexOf(id);
  if (i < 0) return false;
  return i === 0 || lessonDone(profile, id) || lessonDone(profile, LESSON_IDS[i - 1]);
}

/** La prochaine leçon à faire (dans l'ordre), ou null quand tout est fini. */
export function nextLesson(profile) {
  return LESSONS.find((l) => !lessonDone(profile, l.id)) ?? null;
}

/** Étoiles d'une leçon selon les erreurs aux questions : 0 → 3 ★, 1 → 2 ★, plus → 1 ★. */
export const quizStars = (mistakes) => (mistakes <= 0 ? 3 : mistakes === 1 ? 2 : 1);

/** La réponse k est-elle la bonne à la question n de la leçon ? */
export function isRightAnswer(id, n, k) {
  const q = lessonDef(id)?.quiz[n];
  return !!q && q.correct === k;
}

/** Donne de l'XP de métier vétérinaire (gardée pour plus tard si le métier n'est pas commencé). */
function giveVetXp(profile, n) {
  if (isStarted(profile, 'vet')) return addCareerXp(profile, 'vet', n)?.rankUp ?? null;
  const st = careerState(profile);
  st.xp.vet = (st.xp.vet ?? 0) + n;
  return null;
}

/**
 * Leçon réussie. Renvoie { first, xp, diploma (vient d'être obtenu), master, rankUp }.
 * Refaire une leçon garde les meilleures étoiles, sans redonner d'XP.
 */
export function completeLesson(profile, id, { stars = 3, day = 1 } = {}) {
  if (!lessonDef(id)) return null;
  const st = schoolState(profile);
  const prev = st.done[id];
  st.done[id] = { stars: Math.max(stars, prev?.stars ?? 0), day: prev?.day ?? day };
  const first = !prev;
  let xp = first ? LESSON_XP : 0;
  let diploma = false;
  let master = false;
  if (!st.diploma && basicsDone(profile)) {
    st.diploma = day;
    careerState(profile).diplomas.vet = day; // le métier peut commencer avant le niveau 3
    diploma = true;
  }
  if (!st.master && allDone(profile)) {
    st.master = day;
    master = true;
    xp += MASTER_XP;
  }
  const rankUp = xp ? giveVetXp(profile, xp) : null;
  profile.stats = profile.stats ?? {};
  if (first) profile.stats.vetLessons = (profile.stats.vetLessons ?? 0) + 1;
  return { first, xp, diploma, master, rankUp };
}

/** Résumé pour l'interface. */
export function schoolSummary(profile) {
  const st = schoolState(profile);
  return {
    lessons: LESSONS.map((l) => ({ ...l, done: lessonDone(profile, l.id), stars: lessonStars(profile, l.id), unlocked: isUnlocked(profile, l.id) })),
    done: lessonsDoneCount(profile),
    total: LESSONS.length,
    basicsDone: BASIC_IDS.filter((id) => lessonDone(profile, id)).length,
    basicsTotal: BASIC_IDS.length,
    diploma: !!st.diploma,
    master: !!st.master,
    next: nextLesson(profile)?.id ?? null,
  };
}

// 🎓 Les Galops : les examens d'équitation des clubs français (Galop 1, 2, 3…), en plus simple. Chaque Galop
// demande de la pratique avec ton cheval (des choses faites dans le jeu, comptées dans profile.stats) puis un petit
// examen de 5 questions (4 bonnes réponses pour l'avoir). Galop obtenu : une récompense, et ton cheval s'effraie
// moins en balade (tu as plus d'assurance : src/sim/riding.js nextSpookIn).
// Logique pure (tests/galops.test.js) ; l'interface : src/ui/galops.js ; les textes : src/ui/galopsTexts.js.
//
// Dans le profil (sauvegardé) : profile.galops = { 1: jour obtenu, 2: … }.

/**
 * La pratique (stat : la statistique du profil, n : combien de fois) et les questions de l'examen (answers : le
 * nombre de réponses, correct : l'indice de la bonne ; textes gq_<galop>_<k>, gq_<galop>_<k>_a<i>, gq_<galop>_<k>_why).
 */
export const GALOPS = [
  {
    id: 1, emoji: '🥉', coins: 60,
    practice: [
      { id: 'pet', icon: '❤️', stat: 'horse_pet', n: 3 },
      { id: 'brush', icon: '🪮', stat: 'horse_brush', n: 2 },
      { id: 'feed', icon: '🌾', stat: 'horse_feed', n: 2 },
      { id: 'water', icon: '💧', stat: 'horse_water', n: 2 },
      { id: 'ride', icon: '🏇', stat: 'rides', n: 2 },
    ],
    quiz: [1, 1, 0, 0, 1, 1, 0, 0],
  },
  {
    id: 2, emoji: '🥈', coins: 100,
    practice: [
      { id: 'saddle', icon: '🪢', stat: 'horse_saddle', n: 2 },
      { id: 'canter', icon: '🐎', stat: 'rideCanter', n: 1 },
      { id: 'lesson', icon: '🎓', stat: 'actvLessons', n: 1 },
      { id: 'perfect', icon: '⭐', stat: 'perfectDays', n: 1 },
      { id: 'came', icon: '📣', stat: 'horse_came', n: 1 }, // (il vient quand tu l'appelles : src/sim/horseCall.js)
      { id: 'post', icon: '⬆️', stat: 'risingTrot', n: 1 }, // (trotter enlevé : src/sim/posting.js)
    ],
    quiz: [2, 0, 0, 1, 1, 1, 0, 1],
  },
  {
    id: 3, emoji: '🥇', coins: 150,
    practice: [
      { id: 'lunge', icon: '🪢', stat: 'horse_lunge', n: 2 },
      { id: 'clear', icon: '🚧', stat: 'actvClear', n: 1 },
      { id: 'trail', icon: '🧭', stat: 'actvTrail', n: 1 },
      { id: 'deworm', icon: '🪱', stat: 'horse_deworm', n: 1 },
      { id: 'perfect3', icon: '🗓️', stat: 'perfectDays', n: 3 },
    ],
    quiz: [1, 1, 1, 0, 1, 1, 1, 0],
  },
];
export const GALOP_IDS = GALOPS.map((x) => x.id);
/** Le nombre de questions de l'examen, et de bonnes réponses pour l'avoir. */
export const EXAM_QUESTIONS = 5;
export const EXAM_PASS = 4;
/** Chaque question a trois réponses. */
export const ANSWERS = 3;

export const galopDef = (id) => GALOPS.find((x) => x.id === id) ?? null;

/** Les Galops obtenus (créés au besoin). */
export function galopsState(profile) {
  if (!profile.galops || typeof profile.galops !== 'object') profile.galops = {};
  return profile.galops;
}
export const hasGalop = (profile, id) => typeof galopsState(profile)[id] === 'number';
/** Le plus haut Galop obtenu (0 : aucun). */
export function galopLevel(profile) {
  let n = 0;
  for (const id of GALOP_IDS) if (hasGalop(profile, id)) n = id;
  return n;
}
/** Le Galop suivant à passer, ou null quand tout est obtenu. */
export const nextGalop = (profile) => GALOPS.find((x) => !hasGalop(profile, x.id)) ?? null;
/** Un Galop s'ouvre quand le précédent est obtenu. */
export const isOpen = (profile, id) => id === GALOP_IDS[0] || hasGalop(profile, id - 1) || hasGalop(profile, id);

/** La pratique d'un Galop : [{ id, icon, have, n, done }]. */
export function practiceOf(profile, id) {
  const def = galopDef(id);
  if (!def) return [];
  const stats = profile.stats ?? {};
  return def.practice.map((p) => {
    const have = Math.min(p.n, stats[p.stat] ?? 0);
    return { id: p.id, icon: p.icon, have, n: p.n, done: have >= p.n };
  });
}
/** Toute la pratique est faite : on peut passer l'examen. */
export const practiceDone = (profile, id) => {
  const list = practiceOf(profile, id);
  return list.length > 0 && list.every((p) => p.done);
};
export function canTakeExam(profile, id) {
  if (!galopDef(id)) return { ok: false, reason: 'unknown' };
  if (hasGalop(profile, id)) return { ok: false, reason: 'done' };
  if (!isOpen(profile, id)) return { ok: false, reason: 'locked' };
  if (!practiceDone(profile, id)) return { ok: false, reason: 'practice' };
  return { ok: true };
}

/**
 * Un examen : EXAM_QUESTIONS questions tirées au hasard dans celles du Galop, les réponses mélangées.
 * Renvoie [{ k (numéro de la question, 1…), order: [indices des réponses dans l'ordre montré] }].
 */
export function makeExam(id, rng = Math.random) {
  const def = galopDef(id);
  if (!def) return [];
  const ks = def.quiz.map((_, i) => i + 1);
  for (let i = ks.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [ks[i], ks[j]] = [ks[j], ks[i]];
  }
  return ks.slice(0, EXAM_QUESTIONS).map((k) => {
    const order = [0, 1, 2];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    return { k, order };
  });
}
/** La réponse a (indice d'origine) est-elle la bonne à la question k du Galop id ? */
export const isRight = (id, k, a) => galopDef(id)?.quiz[k - 1] === a;

/**
 * Fin de l'examen avec `right` bonnes réponses. Réussi : le Galop est noté (jour day) et renvoie
 * { passed: true, coins, level } ; raté : { passed: false, missing: combien de bonnes réponses manquaient }.
 */
export function finishExam(profile, id, right, day = 1) {
  const def = galopDef(id);
  if (!def || !canTakeExam(profile, id).ok) return null;
  if (right < EXAM_PASS) return { passed: false, missing: EXAM_PASS - right };
  galopsState(profile)[id] = day;
  profile.stats = profile.stats ?? {};
  profile.stats.galops = (profile.stats.galops ?? 0) + 1;
  return { passed: true, coins: def.coins, level: galopLevel(profile) };
}

/** Résumé pour l'interface. */
export function galopsSummary(profile) {
  return GALOPS.map((x) => ({
    id: x.id,
    emoji: x.emoji,
    coins: x.coins,
    done: hasGalop(profile, x.id),
    day: galopsState(profile)[x.id] ?? null,
    open: isOpen(profile, x.id),
    practice: practiceOf(profile, x.id),
    ready: canTakeExam(profile, x.id).ok,
  }));
}

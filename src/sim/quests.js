// Quêtes principales et secondaires : l'histoire de la ferme (une suite de chapitres, un seul à la fois), et des
// quêtes secondaires qu'on REJOINT quand on veut (MAX_JOINED au plus) et qu'on peut ENLEVER sans rien perdre.
// Le chapitre en cours ne s'enlève pas : il se PASSE « pour l'instant » (il devient une quête secondaire, le
// chapitre suivant arrive) et se reprend plus tard. Rien n'est jamais imposé : une quête qu'on ne peut pas encore
// faire le dit (questBlock, src/sim/tutorial.js).
//
// Les récompenses ne changent pas : toute quête finie est récompensée (checkObjectives, src/sim/objectives.js),
// qu'on l'ait rejointe ou non. Une quête rejointe et finie quitte « Mes quêtes ».
//
// Logique pure, sans 3D ni DOM (testée dans tests/quests.test.js). L'interface : le journal (src/ui/quests.js),
// le suivi à l'écran et la bulle de la quête (src/ui/tutorial.js).
//
// Dans le profil (sauvegardé, synchronisé avec le reste de la partie) :
//   profile.quests = { joined: [ids], skipped: [ids] }
//     joined  : les quêtes secondaires rejointes, dans l'ordre où on les a rejointes ;
//     skipped : les chapitres de l'histoire passés pour l'instant.
// L'avancée de l'histoire se lit dans profile.completed : un chapitre fini (même avant cette version, ou en
// dehors de l'histoire) est fini.

import { OBJECTIVES, objectiveShown } from './objectives.js';
import { QUEST_ORDER, questBlock } from './tutorial.js';

/** Quêtes secondaires rejointes en même temps, au plus. */
export const MAX_JOINED = 3;

/**
 * L'histoire de la ferme, dans l'ordre. Chaque chapitre se fait avec n'importe quel animal, sans chance et sans
 * gros budget, avec ce qu'on a gagné jusque-là (tests/quests.test.js le vérifie) :
 * adopter (gratuit), caresser, nourrir, donner à boire, brosser (le lien qu'il faut pour un tour), le vétérinaire,
 * un tour, un métier (niveau 3, déjà atteint grâce aux chapitres d'avant), un premier client, puis un voyage
 * (payé par les récompenses d'avant). Ramasser un crottin n'en fait pas partie : les chats et les lapins n'en
 * font pas (litière).
 */
export const STORY = ['adopt1', 'pet3', 'feed5', 'water3', 'brush3', 'vet1', 'trick1', 'career1', 'client1', 'travel1'];

/** Thèmes des quêtes secondaires (journal : « 🗺️ Autres quêtes »). Chaque quête est dans un seul thème. */
export const THEMES = [
  { id: 'animals', quests: ['adopt1', 'pet3', 'feed5', 'water3', 'brush3', 'scoop1', 'vet1', 'trick1', 'ride1', 'baby', 'species4'] },
  { id: 'travel', quests: ['travel1', 'abroad', 'horseTrip'] },
  {
    id: 'activities',
    quests: ['actvLesson1', 'actvJump1', 'actvTrail1', 'actvAgility1', 'actvHutch5', 'actvHop1', 'actvShow1', 'actvClear1', 'actvCompete1',
      'drTrain3', 'drReprise1', 'compRegister1', 'compAway1', 'beautyPrep1', 'beautyBraid1', 'beauty1'],
  },
  {
    id: 'careers',
    quests: ['career1', 'client1', 'clientVet1', 'clientHappy5', 'clientMoney500', 'dtClient1', 'dtSession3', 'dtDeliver1', 'dtCoach1',
      'grmSalon', 'grmOwn1', 'grmAccessory1', 'grmClient1', 'grmFive1', 'tgFirst', 'tgStars3', 'tgRiders10', 'tgAbroad'],
  },
];

const QUESTS = new Map(OBJECTIVES.filter((o) => o.kind === 'quest').map((o) => [o.id, o]));
export const isQuestId = (id) => QUESTS.has(id);
export const questObjective = (id) => QUESTS.get(id) ?? null;
export const themeOf = (id) => THEMES.find((th) => th.quests.includes(id))?.id ?? null;

const isDone = (p, id) => (p.completed ?? []).includes(id);
const shown = (p, id) => QUESTS.has(id) && objectiveShown(p, QUESTS.get(id));
const rank = (id) => {
  const i = QUEST_ORDER.indexOf(id);
  return i < 0 ? QUEST_ORDER.length : i;
};

/** Une liste d'ids propre : des quêtes connues, sans doublon. */
const cleanList = (list) => [...new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && QUESTS.has(id)))];

export const defaultQuests = () => ({ joined: [], skipped: [] });

/** L'état des quêtes du profil (créé ou réparé s'il manque ou s'il est abîmé). */
export function questState(p) {
  const q = p.quests;
  if (!q || typeof q !== 'object' || Array.isArray(q) || !Array.isArray(q.joined) || !Array.isArray(q.skipped)) {
    p.quests = { ...(q && typeof q === 'object' && !Array.isArray(q) ? q : {}), joined: cleanList(q?.joined), skipped: cleanList(q?.skipped) };
  }
  return p.quests;
}

/**
 * Ancienne sauvegarde (avant les quêtes principales et secondaires) : rien de rejoint, sauf la quête qu'on
 * suivait (🧭) si c'était une quête secondaire ; les chapitres déjà finis restent finis (profile.completed).
 * Une sauvegarde récente est seulement nettoyée (ids inconnus, doublons, quêtes finies).
 */
export function migrateQuests(p) {
  if (!p.quests || typeof p.quests !== 'object' || Array.isArray(p.quests)) {
    const follow = p.questFollow?.id;
    const joined = follow && QUESTS.has(follow) && !STORY.includes(follow) && !isDone(p, follow) ? [follow] : [];
    p.quests = { joined, skipped: [] };
  }
  const st = questState(p);
  st.skipped = cleanList(st.skipped).filter((id) => STORY.includes(id));
  st.joined = cleanList(st.joined).filter((id) => !isDone(p, id) && (!STORY.includes(id) || st.skipped.includes(id))).slice(0, MAX_JOINED);
  return st;
}

// ------------------------------------------------------------------ l'histoire

/** Le chapitre en cours : le premier de l'histoire ni fini ni passé (null : tout est fini ou passé). */
export function mainQuest(p) {
  const { skipped } = questState(p);
  return STORY.find((id) => !isDone(p, id) && !skipped.includes(id) && shown(p, id)) ?? null;
}

/**
 * Ce que montre le journal : { current, chapter (numéro du chapitre en cours, 1…), total, done: [ids finis],
 * skipped: [ids passés et pas finis], upcoming (nombre de chapitres à venir après celui-ci), finished }.
 */
export function storyView(p) {
  const { skipped } = questState(p);
  const current = mainQuest(p);
  const at = current ? STORY.indexOf(current) : STORY.length;
  return {
    current,
    chapter: current ? at + 1 : null,
    total: STORY.length,
    done: STORY.filter((id) => isDone(p, id)),
    skipped: STORY.filter((id) => skipped.includes(id) && !isDone(p, id)),
    upcoming: STORY.filter((id, i) => i > at && !isDone(p, id) && !skipped.includes(id)).length,
    finished: STORY.every((id) => isDone(p, id)),
  };
}

/** Passer le chapitre en cours « pour l'instant ». Renvoie le nouveau chapitre (ou null), undefined si impossible. */
export function skipChapter(p, id = mainQuest(p)) {
  if (!id || id !== mainQuest(p)) return undefined;
  const st = questState(p);
  st.skipped.push(id);
  if (p.questFollow?.id === id) p.questFollow = null; // on ne le suit plus
  return mainQuest(p);
}

/** Reprendre un chapitre passé : il redevient le chapitre en cours s'il vient avant celui-ci (sinon il attend son tour). */
export function resumeChapter(p, id) {
  const st = questState(p);
  if (!st.skipped.includes(id) || isDone(p, id)) return false;
  st.skipped = st.skipped.filter((x) => x !== id);
  st.joined = st.joined.filter((x) => x !== id); // (rejoint comme quête secondaire : il revient dans l'histoire)
  return true;
}

// ------------------------------------------------------------------ quêtes secondaires

/** Est-ce une quête secondaire ? Toutes les quêtes hors de l'histoire, et les chapitres passés. */
export function isSideQuest(p, id) {
  if (!QUESTS.has(id)) return false;
  return !STORY.includes(id) || questState(p).skipped.includes(id);
}

/** Les quêtes rejointes encore à faire, dans l'ordre où on les a rejointes. */
export function joinedQuests(p) {
  return questState(p).joined.filter((id) => !isDone(p, id) && shown(p, id) && isSideQuest(p, id));
}

/** Où en est une quête : 'done', 'main' (chapitre en cours), 'joined', 'side' (à rejoindre), 'story' (chapitre à venir), 'hidden'. */
export function questKind(p, id) {
  if (!QUESTS.has(id)) return 'hidden';
  if (isDone(p, id)) return 'done';
  if (!shown(p, id)) return 'hidden';
  if (id === mainQuest(p)) return 'main';
  if (joinedQuests(p).includes(id)) return 'joined';
  return isSideQuest(p, id) ? 'side' : 'story';
}

/**
 * Peut-on rejoindre cette quête ? { ok: true } ou { ok: false, reason } :
 * 'unknown' (pas une quête, ou cachée), 'done', 'joined' (déjà rejointe), 'story' (chapitre de l'histoire, en cours
 * ou à venir), 'full' (déjà MAX_JOINED quêtes rejointes : en enlever une).
 * Une quête pas encore possible (questBlock) peut se rejoindre : elle dit ce qu'il faut d'abord.
 */
export function canJoin(p, id) {
  if (!QUESTS.has(id) || !shown(p, id)) return { ok: false, reason: 'unknown' };
  if (isDone(p, id)) return { ok: false, reason: 'done' };
  if (joinedQuests(p).includes(id)) return { ok: false, reason: 'joined' };
  if (!isSideQuest(p, id)) return { ok: false, reason: 'story' };
  if (joinedQuests(p).length >= MAX_JOINED) return { ok: false, reason: 'full' };
  return { ok: true };
}

export function joinQuest(p, id) {
  const r = canJoin(p, id);
  if (!r.ok) return r;
  pruneQuests(p);
  questState(p).joined.push(id);
  return r;
}

/** Enlever une quête rejointe (sans rien perdre : sa progression reste, on peut la rejoindre de nouveau). */
export function leaveQuest(p, id) {
  const st = questState(p);
  if (!st.joined.includes(id)) return false;
  st.joined = st.joined.filter((x) => x !== id);
  if (p.questFollow?.id === id) p.questFollow = null;
  return true;
}

/** Retire de « Mes quêtes » celles qui sont finies. Renvoie les ids retirés. */
export function pruneQuests(p) {
  const st = questState(p);
  const gone = st.joined.filter((id) => isDone(p, id));
  if (gone.length) st.joined = st.joined.filter((id) => !gone.includes(id));
  return gone;
}

/** Les autres quêtes, par thème : celles qu'on peut rejoindre (pas finies, pas rejointes, pas de l'histoire à venir). */
export function otherQuests(p) {
  const joined = joinedQuests(p);
  return THEMES.map((th) => {
    const quests = th.quests.filter((id) => shown(p, id) && !isDone(p, id) && !joined.includes(id) && isSideQuest(p, id));
    // Celles qu'on peut faire tout de suite d'abord, puis les autres (chacune dans l'ordre du plus facile).
    quests.sort((a, b) => (questBlock(a, p) ? 1 : 0) - (questBlock(b, p) ? 1 : 0) || rank(a) - rank(b));
    return { id: th.id, quests };
  }).filter((th) => th.quests.length);
}

/** Toutes les quêtes finies (journal : « ✅ Terminées »), dans l'ordre du plus facile. */
export function doneQuests(p) {
  return [...QUESTS.keys()].filter((id) => isDone(p, id)).sort((a, b) => rank(a) - rank(b));
}

// ------------------------------------------------------------------ suivi à l'écran

/**
 * Quelle quête montre le suivi à l'écran ? La quête suivie (🧭), sinon la dernière choisie (recent : arrêtée
 * avec ✋, ou montrée depuis le journal) si c'est encore le chapitre en cours ou une quête rejointe, sinon le
 * chapitre en cours, sinon la première quête rejointe, sinon rien. Jamais une quête que l'enfant n'a pas choisie
 * en dehors de l'histoire. Renvoie { id, kind: 'main' | 'joined' | 'story', followed } ou null.
 */
export function trackerQuest(p, { recent = null } = {}) {
  const f = p.questFollow?.id;
  if (f && QUESTS.has(f) && !isDone(p, f) && shown(p, f)) return { id: f, kind: questKind(p, f), followed: true };
  const main = mainQuest(p);
  const joined = joinedQuests(p);
  if (recent && (recent === main || joined.includes(recent))) return { id: recent, kind: recent === main ? 'main' : 'joined', followed: false };
  if (main) return { id: main, kind: 'main', followed: false };
  if (joined.length) return { id: joined[0], kind: 'joined', followed: false };
  return null;
}

/**
 * Après checkObjectives : « Mes quêtes » se vide des quêtes finies, et si le chapitre en cours (before, lu avant
 * checkObjectives) vient d'être fini, on le dit et on annonce le suivant.
 * Renvoie { chapter: id | null, next: id | null, storyDone: bool, left: [ids rejoints finis] }.
 */
export function afterQuestsDone(p, done, before) {
  const left = pruneQuests(p);
  const chapter = before && done.some((o) => o.id === before) ? before : null;
  return { chapter, next: chapter ? mainQuest(p) : null, storyDone: !!chapter && STORY.every((id) => isDone(p, id)), left };
}

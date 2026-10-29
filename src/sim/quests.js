// Quêtes principales et secondaires : l'histoire de la ferme (une suite de chapitres, un seul à la fois), et des
// quêtes secondaires qu'on REJOINT quand on veut (MAX_JOINED au plus) et qu'on peut ENLEVER sans rien perdre.
// Le chapitre en cours ne s'enlève pas : il se PASSE « pour l'instant » (il devient une quête secondaire, le
// chapitre suivant arrive) et se REPREND plus tard. Rien n'est jamais imposé : une quête qu'on ne peut pas encore
// faire le dit (questBlock, src/sim/tutorial.js), et le suivi 🧭 ne guide jamais vers l'impossible (followBlock).
//
// Les récompenses ne changent pas : toute quête finie est récompensée (checkObjectives, src/sim/objectives.js),
// qu'on l'ait rejointe ou non. Une quête rejointe et finie quitte « Mes quêtes ».
//
// Logique pure, sans 3D ni DOM (testée dans tests/quests.test.js). L'interface : le journal (src/ui/quests.js),
// le suivi à l'écran et la bulle de la quête (src/ui/tutorial.js).
//
// Dans le profil (sauvegardé, synchronisé avec le reste de la partie) :
//   profile.quests = { joined: [ids], skipped: [ids], aside?: [ids], front?: id, held?: { id: suivi } }
//     joined  : les quêtes secondaires rejointes, dans l'ordre où on les a rejointes ;
//     skipped : les chapitres de l'histoire passés pour l'instant ;
//     aside   : les quêtes secondaires passées pour l'instant (« ⏭️ Mises de côté » : ↩️ Reprendre les remet dans
//               « Mes quêtes ») ;
//     front   : la quête que l'enfant a mise devant, dans le suivi à l'écran (⇄ pour jongler entre le chapitre en
//               cours et les quêtes rejointes) ;
//     held    : où en était le suivi pas à pas (🧭) des quêtes qu'on a quittées en jonglant, pour le reprendre à la
//               même étape.
// Ces trois derniers champs n'existent que s'ils servent (une ancienne partie n'a que joined et skipped).
// L'avancée de l'histoire se lit dans profile.completed : un chapitre fini (même avant cette version, ou en
// dehors de l'histoire) est fini.

import { OBJECTIVES, objectiveShown } from './objectives.js';
import { QUEST_ORDER, questBlock, followBlock } from './tutorial.js';

/** Quêtes secondaires rejointes en même temps, au plus. */
export const MAX_JOINED = 3;

/**
 * L'histoire de la ferme, dans l'ordre : celle de ton premier cheval. On l'adopte au refuge (gratuit, et il y a
 * toujours un cheval adulte, qu'on peut monter : src/sim/adoption.js), on fait connaissance (caresses, foin, eau),
 * on le panse (étrille, brosse, cure-pied, peigne), on monte en selle, on passe au trot puis au galop, la visite
 * chez le vétérinaire, la première leçon, le premier saut, la première balade ; puis vers le concours : tresser sa
 * crinière, trois séances de dressage, une reprise, et le premier concours (au terrain de concours, un tous les trois
 * jours à la maison). Chaque chapitre se fait sans chance et sans gros budget, avec ce qu'on a gagné jusque-là, dans
 * toutes les maisons (tests/quests.test.js).
 * Les quêtes des autres animaux (un tour, un spectacle, un métier, un client…) sont des quêtes secondaires.
 */
export const STORY = ['horse1', 'horsePet3', 'horseFeed3', 'horseWater2', 'horseBrush1', 'ride1', 'rideCanter1', 'vet1', 'actvLesson1', 'actvJump1', 'actvTrail1',
  'beautyBraid1', 'drTrain3', 'drReprise1', 'actvCompete1'];

/** Thèmes des quêtes secondaires (journal : « 🗺️ Autres quêtes »). Chaque quête est dans un seul thème. */
export const THEMES = [
  { id: 'horse', quests: ['horse1', 'horsePet3', 'horseFeed3', 'horseWater2', 'horseBrush1', 'ride1', 'rideCanter1', 'horsePerfect3'] },
  { id: 'animals', quests: ['adopt1', 'pet3', 'feed5', 'water3', 'brush3', 'scoop1', 'vet1', 'trick1', 'baby', 'species4'] },
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

const isDone = (p, id) => (p.completed ?? []).includes(id);
const shown = (p, id) => QUESTS.has(id) && objectiveShown(p, QUESTS.get(id));
/** Faisable tout de suite (0), faisable avec le suivi qui commence par le refuge (1), pas encore possible (2). */
const readiness = (p, id) => (!questBlock(id, p) ? 0 : !followBlock(id, p) ? 1 : 2);
const rank = (id) => {
  const i = QUEST_ORDER.indexOf(id);
  return i < 0 ? QUEST_ORDER.length : i;
};

/** Une liste d'ids propre : des quêtes connues, sans doublon. */
const cleanList = (list) => [...new Set((Array.isArray(list) ? list : []).filter((id) => typeof id === 'string' && QUESTS.has(id)))];

export const defaultQuests = () => ({ joined: [], skipped: [] });

/** Les champs facultatifs (aside, front, held) réparés : seulement s'ils existent. */
function tidyExtras(p, st) {
  if ('aside' in st) {
    st.aside = cleanList(st.aside).filter((id) => !isDone(p, id) && !STORY.includes(id) && !st.joined.includes(id));
    if (!st.aside.length) delete st.aside;
  }
  if ('front' in st && (typeof st.front !== 'string' || !QUESTS.has(st.front) || isDone(p, st.front))) delete st.front;
  if ('held' in st) {
    const held = st.held && typeof st.held === 'object' && !Array.isArray(st.held) ? st.held : {};
    for (const id of Object.keys(held)) {
      const f = held[id];
      if (!QUESTS.has(id) || isDone(p, id) || !f || !Array.isArray(f.steps) || !Array.isArray(f.seen)) delete held[id];
    }
    if (Object.keys(held).length) st.held = held;
    else delete st.held;
  }
}

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
  tidyExtras(p, st);
  tidyFollow(p);
  return st;
}

/**
 * La quête suivie (🧭) doit être le chapitre en cours ou une quête rejointe, et possible à suivre : sinon on ne la
 * suit plus (elle reste rejointe). Ex. une ancienne sauvegarde qui suivait « Fais naître un bébé » avec un seul
 * animal, ou un chapitre qui n'est pas encore arrivé ; ou le chapitre en cours qui ne l'est plus après « Reprendre ».
 * Renvoie true si le suivi a été arrêté.
 */
export function tidyFollow(p) {
  const f = p.questFollow?.id;
  if (!f) return false;
  const kind = questKind(p, f);
  if ((kind === 'main' || kind === 'joined') && !followBlock(f, p)) return false;
  p.questFollow = null;
  return true;
}

// ------------------------------------------------------------------ l'histoire

/** Le chapitre en cours : le premier de l'histoire ni fini ni passé (null : tout est fini ou passé). */
export function mainQuest(p) {
  const { skipped } = questState(p);
  return STORY.find((id) => !isDone(p, id) && !skipped.includes(id) && shown(p, id)) ?? null;
}

/**
 * Ce que montre le journal : { current, chapter (numéro du chapitre en cours, 1…), total, done: [ids finis],
 * skipped: [ids passés, pas finis, et pas dans « Mes quêtes »], upcoming (nombre de chapitres à venir après
 * celui-ci), finished }.
 */
export function storyView(p) {
  const { skipped, joined } = questState(p);
  const current = mainQuest(p);
  const at = current ? STORY.indexOf(current) : STORY.length;
  return {
    current,
    chapter: current ? at + 1 : null,
    total: STORY.length,
    done: STORY.filter((id) => isDone(p, id)),
    skipped: STORY.filter((id) => skipped.includes(id) && !isDone(p, id) && !joined.includes(id)),
    upcoming: STORY.filter((id, i) => i > at && !isDone(p, id) && !skipped.includes(id)).length,
    finished: STORY.every((id) => isDone(p, id)),
  };
}

/** Les chapitres passés et pas encore finis (qu'ils soient dans « Mes quêtes » ou non). */
export const skippedLeft = (p) => STORY.filter((id) => questState(p).skipped.includes(id) && !isDone(p, id));

/** Passer le chapitre en cours « pour l'instant ». Renvoie le nouveau chapitre (ou null), undefined si impossible. */
export function skipChapter(p, id = mainQuest(p)) {
  if (!id || id !== mainQuest(p)) return undefined;
  const st = questState(p);
  st.skipped.push(id);
  if (p.questFollow?.id === id) {
    holdFollow(p); // (repris plus tard, le suivi pas à pas reprendra à la même étape)
    p.questFollow = null; // on ne le suit plus
  }
  return mainQuest(p);
}

/**
 * Comment « ↩️ Reprendre » ce chapitre passé ? 'main' : il vient avant le chapitre en cours (ou il n'y en a plus) et
 * redevient le chapitre en cours ; 'joined' : il vient après, il va donc dans « Mes quêtes » pour être fait tout de
 * suite (l'histoire garde son ordre) ; 'full' : il viendrait dans « Mes quêtes », mais elles sont déjà MAX_JOINED ;
 * null : pas un chapitre passé (ou déjà fini, ou déjà dans « Mes quêtes »).
 */
export function resumeMode(p, id) {
  const st = questState(p);
  if (!STORY.includes(id) || !st.skipped.includes(id) || isDone(p, id) || joinedQuests(p).includes(id)) return null;
  const main = mainQuest(p);
  if (!main || STORY.indexOf(id) < STORY.indexOf(main)) return 'main';
  return joinedQuests(p).length >= MAX_JOINED ? 'full' : 'joined';
}

/**
 * ↩️ Reprendre un chapitre passé (voir resumeMode). Renvoie { ok: true, how: 'main' | 'joined' } ou
 * { ok: false, reason: 'full' | 'notSkipped' }. Avant, reprendre un chapitre placé après celui en cours le faisait
 * disparaître de partout jusqu'à son tour.
 */
export function resumeChapter(p, id) {
  const how = resumeMode(p, id);
  if (!how) return { ok: false, reason: 'notSkipped' };
  if (how === 'full') return { ok: false, reason: 'full' };
  const st = questState(p);
  if (how === 'joined') {
    st.joined.push(id); // (il reste « passé » : c'est une quête secondaire jusqu'à ce qu'il soit fini)
    return { ok: true, how };
  }
  st.skipped = st.skipped.filter((x) => x !== id);
  st.joined = st.joined.filter((x) => x !== id);
  tidyFollow(p); // (on suivait l'ancien chapitre en cours : il attend maintenant son tour)
  return { ok: true, how };
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

/**
 * Peut-on suivre (🧭) cette quête ? { ok: true } ou { ok: false, reason } : 'blocked' (pas encore possible ; block dit
 * pourquoi : le suivi ne guide jamais vers l'impossible), 'full' (une quête secondaire pas encore rejointe, et déjà
 * MAX_JOINED quêtes), 'story' (un chapitre pas encore arrivé), 'done' ou 'unknown'. Une quête secondaire qu'on suit
 * est rejointe d'abord (src/ui/tutorial.js, startFollow).
 */
export function canFollow(p, id) {
  const kind = questKind(p, id);
  if (kind === 'hidden') return { ok: false, reason: 'unknown' };
  if (kind === 'done' || kind === 'story') return { ok: false, reason: kind };
  const block = followBlock(id, p);
  if (block) return { ok: false, reason: 'blocked', block };
  if (kind === 'side' && joinedQuests(p).length >= MAX_JOINED) return { ok: false, reason: 'full' };
  return { ok: true };
}

export function joinQuest(p, id) {
  const r = canJoin(p, id);
  if (!r.ok) return r;
  pruneQuests(p);
  const st = questState(p);
  st.joined.push(id);
  if (st.aside) {
    st.aside = st.aside.filter((x) => x !== id);
    if (!st.aside.length) delete st.aside;
  }
  return r;
}

/** Enlever une quête rejointe (sans rien perdre : sa progression reste, on peut la rejoindre de nouveau). */
export function leaveQuest(p, id) {
  const st = questState(p);
  if (!st.joined.includes(id)) return false;
  st.joined = st.joined.filter((x) => x !== id);
  if (p.questFollow?.id === id) {
    holdFollow(p);
    p.questFollow = null;
  }
  return true;
}

/** Retire de « Mes quêtes » (et des quêtes mises de côté) celles qui sont finies. Renvoie les ids retirés de « Mes quêtes ». */
export function pruneQuests(p) {
  const st = questState(p);
  const gone = st.joined.filter((id) => isDone(p, id));
  if (gone.length) st.joined = st.joined.filter((id) => !gone.includes(id));
  tidyExtras(p, st);
  return gone;
}

/**
 * Les autres quêtes, par thème : celles qu'on peut rejoindre (pas finies, pas rejointes, pas de l'histoire). Les
 * chapitres passés n'y sont pas : ils restent dans l'histoire (« Passés pour l'instant », avec ↩️ Reprendre), pour
 * n'apparaître qu'une fois.
 */
export function otherQuests(p) {
  const joined = joinedQuests(p);
  return THEMES.map((th) => {
    const aside = questState(p).aside ?? [];
    // (les quêtes mises de côté sont dans « Mes quêtes », sous « ⏭️ Mises de côté » : une seule fois dans le journal)
    const quests = th.quests.filter((id) => shown(p, id) && !isDone(p, id) && !joined.includes(id) && !STORY.includes(id) && !aside.includes(id));
    // Celles qu'on peut faire tout de suite d'abord, puis celles où le suivi passe par le refuge, puis les autres
    // (chacune dans l'ordre du plus facile).
    quests.sort((a, b) => readiness(p, a) - readiness(p, b) || rank(a) - rank(b));
    return { id: th.id, quests };
  }).filter((th) => th.quests.length);
}

/** Toutes les quêtes finies (journal : « ✅ Terminées »), dans l'ordre du plus facile. */
export function doneQuests(p) {
  return [...QUESTS.keys()].filter((id) => isDone(p, id)).sort((a, b) => rank(a) - rank(b));
}

// ------------------------------------------------------------------ suivi à l'écran

/**
 * Quelle quête montre le suivi à l'écran ? La quête suivie (🧭), sinon le chapitre en cours, sinon la première quête
 * rejointe, sinon rien. Jamais une quête que l'enfant n'a pas choisie en dehors de l'histoire, ni un chapitre qui
 * n'est pas encore arrivé. (Avant, après ✋ sur une quête rejointe, le suivi la gardait au lieu de revenir au
 * chapitre en cours.) Renvoie { id, kind: 'main' | 'joined', followed } ou null.
 */
export function trackerQuest(p) {
  const f = p.questFollow?.id;
  const fk = f ? questKind(p, f) : null;
  if (fk === 'main' || fk === 'joined') return { id: f, kind: fk, followed: true };
  // La quête que l'enfant a mise devant (⇄), si c'est toujours le chapitre en cours ou une quête rejointe.
  const front = questState(p).front;
  const frk = front ? questKind(p, front) : null;
  if (frk === 'main' || frk === 'joined') return { id: front, kind: frk, followed: false };
  const main = mainQuest(p);
  const joined = joinedQuests(p);
  if (main) return { id: main, kind: 'main', followed: false };
  if (joined.length) return { id: joined[0], kind: 'joined', followed: false };
  return null;
}

// ------------------------------------------------------------------ jongler entre les quêtes

/**
 * Les quêtes entre lesquelles on jongle (⇄) : le chapitre en cours puis les quêtes rejointes, dans l'ordre où on
 * les a rejointes (MAX_JOINED + 1 au plus).
 */
export function activeQuests(p) {
  const main = mainQuest(p);
  return [...(main ? [main] : []), ...joinedQuests(p)];
}

/** La quête qui vient après (dir = 1) ou avant (dir = -1) celle du suivi, en faisant le tour ; null s'il n'y en a qu'une. */
export function nextQuest(p, dir = 1) {
  const list = activeQuests(p);
  if (list.length < 2) return null;
  const at = Math.max(0, list.indexOf(trackerQuest(p)?.id));
  return list[(at + (dir < 0 ? -1 : 1) + list.length) % list.length];
}

/** Garde où en était le suivi pas à pas de la quête suivie (pour la reprendre à la même étape). */
export function holdFollow(p) {
  const f = p.questFollow;
  if (!f?.id || !Array.isArray(f.steps)) return;
  const st = questState(p);
  st.held = { ...(st.held ?? {}), [f.id]: { step: f.step | 0, seen: [...(f.seen ?? [])], steps: [...f.steps] } };
}

/** Où en était le suivi pas à pas de cette quête quand on l'a quittée ({ id, step, seen, steps }), ou null. */
export function heldFollow(p, id) {
  const h = questState(p).held?.[id];
  return h ? { id, ...h } : null;
}

/**
 * Mettre une quête devant, dans le suivi à l'écran (⇄ ou une pastille de la bulle). Seulement le chapitre en cours
 * ou une quête rejointe. Renvoie true si c'est fait.
 */
export function setFront(p, id) {
  const k = questKind(p, id);
  if (k !== 'main' && k !== 'joined') return false;
  questState(p).front = id;
  return true;
}

/**
 * ⏭️ Passer une quête pour l'instant : le chapitre en cours (skipChapter : le suivant arrive) ou une quête rejointe
 * (elle quitte « Mes quêtes » et va dans « ⏭️ Mises de côté », d'où ↩️ Reprendre la remet ; un chapitre passé repris
 * dans « Mes quêtes » retourne, lui, dans « Passés pour l'instant » de l'histoire). Rien n'est perdu.
 * Renvoie { ok: true, kind: 'main' | 'joined', next: le nouveau chapitre (pour 'main') } ou { ok: false }.
 */
export function passQuest(p, id) {
  const k = questKind(p, id);
  const st = questState(p);
  if (st.front === id) delete st.front; // (le suivi passe à la quête suivante)
  if (k === 'main') {
    const next = skipChapter(p, id);
    return next === undefined ? { ok: false } : { ok: true, kind: 'main', next };
  }
  if (k !== 'joined' || !leaveQuest(p, id)) return { ok: false };
  if (!STORY.includes(id)) st.aside = [...(st.aside ?? []).filter((x) => x !== id), id];
  return { ok: true, kind: 'joined', next: null };
}

/** Les quêtes secondaires passées pour l'instant (« ⏭️ Mises de côté »), encore à faire. */
export function asideQuests(p) {
  const joined = joinedQuests(p);
  return (questState(p).aside ?? []).filter((id) => QUESTS.has(id) && shown(p, id) && !isDone(p, id) && !joined.includes(id));
}

/** ↩️ Reprendre une quête mise de côté : elle revient dans « Mes quêtes » (joinQuest : 'full' s'il y en a déjà MAX_JOINED). */
export function resumeAside(p, id) {
  if (!asideQuests(p).includes(id)) return { ok: false, reason: 'notAside' };
  return joinQuest(p, id);
}

/**
 * Après checkObjectives : « Mes quêtes » se vide des quêtes finies, et si le chapitre en cours (before, lu avant
 * checkObjectives) vient d'être fini, on le dit et on annonce la suite.
 * Renvoie { chapter: id | null, next: id | null, storyDone: bool, skippedLeft: n, left: [ids rejoints finis] } :
 * next = le nouveau chapitre en cours ; sans lui, storyDone dit si TOUTE l'histoire est finie, et skippedLeft
 * combien de chapitres passés restent à faire (« Tu as fini toute l'histoire » ne se dit que s'il n'en reste aucun).
 */
export function afterQuestsDone(p, done, before) {
  const left = pruneQuests(p);
  const chapter = before && done.some((o) => o.id === before) ? before : null;
  return {
    chapter,
    next: chapter ? mainQuest(p) : null,
    storyDone: !!chapter && STORY.every((id) => isDone(p, id)),
    skippedLeft: chapter ? skippedLeft(p).length : 0,
    left,
  };
}

/**
 * Le petit mot de la fin d'un chapitre (r : afterQuestsDone) : { kind: 'next' (le chapitre suivant est là),
 * 'finished' (toute l'histoire est finie) ou 'skippedLeft' (il ne reste que des chapitres passés), next, n }.
 */
export function chapterEnd(r) {
  if (r.next) return { kind: 'next', next: r.next, n: 0 };
  if (r.storyDone || !r.skippedLeft) return { kind: 'finished', next: null, n: 0 };
  return { kind: 'skippedLeft', next: null, n: r.skippedLeft };
}

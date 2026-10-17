// Métiers : on apprend peu à peu un métier (vétérinaire, gardien de pension…), avec un carnet
// d'actions à cocher, de l'expérience de métier et trois rangs (apprenti, confirmé, expert).
// Logique pure, testée dans tests/careers.test.js. L'interface est dans src/ui/careers.js.
//
// Pour ajouter un métier : une entrée dans CAREERS (+ textes career_<id>, careerd_<id>,
// ca_<id>_<action> dans src/ui/clientsTexts.js), puis appeler noteAction(profile, id, action)
// quand le joueur fait l'action et addCareerXp(profile, id, n) quand il réussit un travail.
//
// Dans le profil :
//   profile.careers = {
//     active: 'vet' | 'pension' | 'handler' | null,          // le métier suivi (carnet affiché à l'écran)
//     started: { vet: day },          // jour où chaque métier a été commencé
//     xp: { vet: 0 },                 // expérience par métier
//     done: { vet: ['welcome'] },     // actions du carnet déjà faites une fois
//     earned: { vet: 0 },             // argent gagné grâce au métier
//     reputation: { vet: 50 },        // réputation par métier (0 à 100)
//     proposed: { vet: day },         // dernier jour où on a proposé ce métier (pas trop souvent)
//     hints: {},                      // petites phrases dites une seule fois
//     diplomas: { vet: day },         // diplôme d'une école (src/sim/vetSchool.js) : on peut commencer avant le niveau
//   }

export const RANKS = ['apprentice', 'skilled', 'expert'];
export const ACTION_XP = 15; // première fois qu'on fait une action du carnet
export const QUESTS_FOR_CAREER = 5; // quêtes finies avant qu'on propose un métier

/**
 * Registre des métiers.
 *   level     : niveau du joueur pour pouvoir commencer
 *   ranks     : XP de métier pour chaque rang (apprenti, confirmé, expert)
 *   actions   : le carnet, dans l'ordre d'apprentissage ; `where` = où aller (bâtiment ou 'visitor') ;
 *               `rank` (facultatif) : l'action s'ouvre à ce rang (🔒 avant)
 *   building  : le bâtiment qui propose le métier quand on le touche
 *   perks     : ce que change chaque rang (lu par src/sim/clients.js, ou par le module du métier)
 *   ownClients: le métier a ses propres clients (pas les visites de src/sim/clients.js)
 *   clients   : false = aucun visiteur (cavalier de concours : on travaille ses propres chevaux)
 */
export const CAREERS = {
  vet: {
    id: 'vet',
    emoji: '🩺',
    level: 3,
    building: 'vet',
    ranks: [0, 150, 400],
    actions: [
      { id: 'welcome', emoji: '👋', where: 'visitor' },
      { id: 'exam', emoji: '🔍', where: 'animal' },
      { id: 'treat', emoji: '💊', where: 'animal' },
      { id: 'watch', emoji: '💚', where: 'animal' },
      { id: 'return', emoji: '🎁', where: 'visitor' },
    ],
    perks: [
      { maxClients: 1, species: ['dog', 'cat', 'rabbit'], illnesses: ['ear', 'fleas', 'cold'], price: 1, tips: false },
      { maxClients: 2, species: ['dog', 'cat', 'rabbit', 'horse', 'sheep', 'goat'], illnesses: ['ear', 'fleas', 'cold', 'paw', 'belly'], price: 1.1, tips: false },
      { maxClients: 3, species: ['dog', 'cat', 'rabbit', 'horse', 'sheep', 'goat', 'cow'], illnesses: ['ear', 'fleas', 'cold', 'paw', 'belly', 'flu'], price: 1.25, tips: true },
    ],
  },
  pension: {
    id: 'pension',
    emoji: '🏡',
    level: 3,
    building: 'pethouse',
    ranks: [0, 120, 350],
    actions: [
      { id: 'welcome', emoji: '👋', where: 'visitor' },
      { id: 'feed', emoji: '🍖', where: 'animal' },
      { id: 'clean', emoji: '🫧', where: 'animal' },
      { id: 'play', emoji: '⚽', where: 'animal' },
      { id: 'return', emoji: '🎁', where: 'visitor' },
    ],
    perks: [
      { maxClients: 1, species: ['dog', 'cat', 'rabbit'], price: 1, tips: false },
      { maxClients: 2, species: ['dog', 'cat', 'rabbit', 'horse', 'sheep', 'goat'], price: 1.1, tips: false },
      { maxClients: 3, species: ['dog', 'cat', 'rabbit', 'horse', 'sheep', 'goat', 'cow'], price: 1.25, tips: true },
    ],
  },
  // Cavalière / cavalier de concours : dressage au manège, puis concours à l'extérieur (calendrier,
  // inscription, voyage en van, reprise ou parcours notés, podium). Pas de visiteurs (clients: false).
  // Les avantages sont lus par src/sim/competitions.js (riderPerks) : frais d'inscription et primes.
  rider: {
    id: 'rider',
    emoji: '🏇',
    level: 3,
    building: 'showground',
    clients: false,
    ranks: [0, 150, 400],
    actions: [
      { id: 'train', emoji: '🎠', where: 'showground' },
      { id: 'reprise', emoji: '🧑‍⚖️', where: 'showground' },
      { id: 'register', emoji: '📅', where: 'calendar' },
      { id: 'travel', emoji: '🚐', where: 'calendar' },
      { id: 'compete', emoji: '🏁', where: 'venue' },
      { id: 'podium', emoji: '🏆', where: 'venue' },
    ],
    perks: [
      { fee: 1, prize: 1, sponsor: false },
      { fee: 0.8, prize: 1.15, sponsor: false },
      { fee: 0.5, prize: 1.3, sponsor: true },
    ],
  },
  // Handler de concours de beauté : les gens confient leur animal pour qu'on le prépare (bain, tresses,
  // nœud…) et qu'on le présente au juge (src/sim/beauty.js, src/game/Beauty.js). La préparation et la
  // présentation comptent aussi avec ses propres animaux (on apprend le métier en s'entraînant).
  handler: {
    id: 'handler',
    emoji: '🎀',
    level: 3,
    building: 'showground',
    ranks: [0, 120, 350],
    actions: [
      { id: 'welcome', emoji: '👋', where: 'visitor' },
      { id: 'prep', emoji: '🧺', where: 'animal' },
      { id: 'braid', emoji: '🎀', where: 'animal' },
      { id: 'present', emoji: '🧑‍⚖️', where: 'showground' },
      { id: 'return', emoji: '🎁', where: 'visitor' },
    ],
    perks: [
      { maxClients: 1, species: ['dog', 'cat', 'rabbit'], price: 1, tips: false },
      { maxClients: 2, species: ['dog', 'cat', 'rabbit', 'horse', 'sheep', 'goat'], price: 1.15, tips: false },
      { maxClients: 3, species: ['dog', 'cat', 'rabbit', 'horse', 'sheep', 'goat', 'cow'], price: 1.3, tips: true },
    ],
  },
  // Éducateur canin : des maîtres amènent leur chien qui a un problème (tire en laisse, saute sur
  // les gens, ne revient pas au rappel…) ; séances (mini-jeux), livraison, paiement et réputation.
  // Logique : src/sim/dogTrainer.js ; 3D : src/game/DogTrainer.js ; interface : src/ui/dogTrainer.js.
  // ownClients : ses clients ne passent pas par src/sim/clients.js (pension, soins).
  dogTrainer: {
    id: 'dogTrainer',
    emoji: '🐕',
    level: 3,
    building: 'kennel',
    ownClients: true,
    ranks: [0, 150, 400],
    actions: [
      { id: 'meetClient', emoji: '👋', where: 'visitor' },
      { id: 'session', emoji: '🎓', where: 'animal' },
      { id: 'deliver', emoji: '🎬', where: 'visitor' },
      { id: 'coachOwn', emoji: '🐶', where: 'animal' },
      { id: 'coachHerd', emoji: '🐑', where: 'animal', rank: 1 },
      { id: 'coachAgility', emoji: '🎯', where: 'animal', rank: 2 },
      { id: 'rescue', emoji: '💛', where: 'visitor', rank: 2 },
    ],
    // maxClients : chiens en éducation en même temps ; problems : ce que les maîtres demandent ;
    // price : tarif de la séance ; speed : vitesse de progrès ; tips : pourboires ;
    // rescue : chiens de refuge avec deux problèmes.
    perks: [
      { maxClients: 1, problems: ['obey', 'pull', 'jump', 'recall'], price: 1, speed: 1, tips: false, rescue: false },
      { maxClients: 2, problems: ['obey', 'pull', 'jump', 'recall', 'bark'], price: 1.25, speed: 1.25, tips: true, rescue: false },
      { maxClients: 3, problems: ['obey', 'pull', 'jump', 'recall', 'bark', 'shy'], price: 1.5, speed: 1.5, tips: true, rescue: true },
    ],
  },
};

export const CAREER_IDS = Object.keys(CAREERS);

export function defaultCareers() {
  return { active: null, started: {}, xp: {}, done: {}, earned: {}, reputation: {}, proposed: {}, hints: {}, diplomas: {} };
}

/** État des métiers dans le profil (complété pour les vieilles sauvegardes). */
export function careerState(profile) {
  if (!profile.careers) profile.careers = defaultCareers();
  else for (const [k, v] of Object.entries(defaultCareers())) if (profile.careers[k] === undefined) profile.careers[k] = v;
  return profile.careers;
}

export const isStarted = (profile, id) => careerState(profile).started[id] !== undefined;
export const startedCareers = (profile) => CAREER_IDS.filter((id) => isStarted(profile, id));
export const careerXp = (profile, id) => careerState(profile).xp[id] ?? 0;

/** Réputation d'un métier (50 au départ). */
export function reputationOf(profile, id) {
  const st = careerState(profile);
  if (st.reputation[id] === undefined) st.reputation[id] = 50;
  return st.reputation[id];
}

export function changeReputation(profile, id, delta) {
  const st = careerState(profile);
  st.reputation[id] = Math.max(0, Math.min(100, reputationOf(profile, id) + delta));
  return st.reputation[id];
}

/** Rang (0 apprenti, 1 confirmé, 2 expert). */
export function rankOf(profile, id) {
  const xp = careerXp(profile, id);
  const ranks = CAREERS[id]?.ranks ?? [0];
  let r = 0;
  for (let i = 0; i < ranks.length; i++) if (xp >= ranks[i]) r = i;
  return r;
}

export const rankName = (profile, id) => RANKS[rankOf(profile, id)];
export const perksOf = (profile, id) => CAREERS[id].perks[rankOf(profile, id)];

/** Progression vers le rang suivant : { rank, xp, from, to, ratio } (to = null au rang expert). */
export function rankProgress(profile, id) {
  const rank = rankOf(profile, id);
  const xp = careerXp(profile, id);
  const ranks = CAREERS[id].ranks;
  const from = ranks[rank];
  const to = ranks[rank + 1] ?? null;
  return { rank, xp, from, to, ratio: to === null ? 1 : Math.min(1, (xp - from) / (to - from)) };
}

/** A-t-on le diplôme de l'école de ce métier ? (école vétérinaire : src/sim/vetSchool.js) */
export const hasCareerDiploma = (profile, id) => careerState(profile).diplomas?.[id] !== undefined;

/** Peut-on commencer ce métier ? ctx : { level }. Avec le diplôme de l'école, le niveau ne compte pas. */
export function canStart(profile, id, ctx = {}) {
  const def = CAREERS[id];
  if (!def) return { ok: false, reason: 'unknown' };
  if (isStarted(profile, id)) return { ok: false, reason: 'started' };
  if ((ctx.level ?? 1) < def.level && !hasCareerDiploma(profile, id)) return { ok: false, reason: 'level', n: def.level };
  return { ok: true };
}

/** Commence un métier (il devient le métier suivi). */
export function startCareer(profile, id, day = 1, ctx = {}) {
  const check = canStart(profile, id, { level: ctx.level ?? 99 });
  if (!check.ok) return check;
  const st = careerState(profile);
  st.started[id] = day;
  st.xp[id] = st.xp[id] ?? 0;
  st.done[id] = st.done[id] ?? [];
  st.earned[id] = st.earned[id] ?? 0;
  reputationOf(profile, id);
  st.active = id;
  profile.stats = profile.stats ?? {};
  profile.stats.careersStarted = (profile.stats.careersStarted ?? 0) + 1;
  return { ok: true };
}

export function setActiveCareer(profile, id) {
  const st = careerState(profile);
  if (isStarted(profile, id)) st.active = id;
  return st.active;
}

/** Ajoute de l'XP de métier. Renvoie { rankUp: nouveau rang } si on monte de rang, sinon null. */
export function addCareerXp(profile, id, n) {
  if (!isStarted(profile, id)) return null;
  const st = careerState(profile);
  const before = rankOf(profile, id);
  st.xp[id] = (st.xp[id] ?? 0) + n;
  const after = rankOf(profile, id);
  return after > before ? { rankUp: after } : null;
}

/** L'argent gagné grâce au métier (pour le panneau). */
export function addEarnings(profile, id, n) {
  const st = careerState(profile);
  st.earned[id] = (st.earned[id] ?? 0) + n;
}

/**
 * Une action du carnet vient d'être faite. La première fois, elle se coche et donne de l'XP.
 * Renvoie { first, rankUp } ou null si le métier n'est pas commencé.
 */
export function noteAction(profile, id, action) {
  if (!isStarted(profile, id)) return null;
  const def = CAREERS[id];
  if (!def.actions.some((a) => a.id === action)) return null;
  const st = careerState(profile);
  const done = st.done[id] ?? (st.done[id] = []);
  if (done.includes(action)) return { first: false, rankUp: null };
  done.push(action);
  return { first: true, rankUp: addCareerXp(profile, id, ACTION_XP)?.rankUp ?? null };
}

export const isActionDone = (profile, id, action) => (careerState(profile).done[id] ?? []).includes(action);

/** Une action du carnet encore fermée (elle s'ouvre à un rang plus haut) ? */
export const isActionLocked = (profile, id, action) => rankOf(profile, id) < (action.rank ?? 0);

/** La prochaine action du carnet à faire (dans l'ordre, sans celles encore fermées), ou null. */
export function nextAction(profile, id) {
  if (!isStarted(profile, id)) return null;
  return CAREERS[id].actions.find((a) => !isActionDone(profile, id, a.id) && !isActionLocked(profile, id, a)) ?? null;
}

/** Le carnet : [{ id, emoji, where, rank?, done, locked }]. */
export function carnet(profile, id) {
  return CAREERS[id].actions.map((a) => {
    const done = isActionDone(profile, id, a.id);
    return { ...a, done, locked: !done && isActionLocked(profile, id, a) };
  });
}

const questsDone = (profile, objectives) => (objectives ? objectives.filter((o) => o.kind === 'quest' && profile.completed.includes(o.id)).length : profile.completed.length);

/**
 * Faut-il proposer ce métier maintenant ?
 * ctx : { level, day, objectives?, building? (le joueur vient de toucher ce bâtiment) }
 * On propose quand on est prêt (niveau et quêtes), ou quand on touche le bâtiment du métier,
 * et pas plus d'une fois par jour.
 */
export function shouldPropose(profile, id, ctx) {
  const def = CAREERS[id];
  if (!def || isStarted(profile, id)) return false;
  if ((ctx.level ?? 1) < def.level && !hasCareerDiploma(profile, id)) return false;
  const st = careerState(profile);
  if (st.proposed[id] !== undefined && ctx.day - st.proposed[id] < 1) return false;
  if (ctx.building) return ctx.building === def.building;
  return questsDone(profile, ctx.objectives) >= QUESTS_FOR_CAREER;
}

export function markProposed(profile, id, day) {
  careerState(profile).proposed[id] = day;
}

/** Une petite phrase dite une seule fois (ex. « tu pourrais ouvrir une pension un jour »). */
export function hintOnce(profile, key) {
  const st = careerState(profile);
  if (st.hints[key]) return false;
  st.hints[key] = true;
  return true;
}

/** Résumé d'un métier pour l'interface. */
export function careerSummary(profile, id, ctx = {}) {
  const def = CAREERS[id];
  const started = isStarted(profile, id);
  const check = canStart(profile, id, ctx);
  return {
    id,
    emoji: def.emoji,
    level: def.level,
    state: started ? 'started' : check.ok ? 'available' : 'locked',
    active: careerState(profile).active === id,
    progress: started ? rankProgress(profile, id) : null,
    rank: started ? rankOf(profile, id) : null,
    carnet: carnet(profile, id),
    earned: careerState(profile).earned[id] ?? 0,
    reputation: started ? reputationOf(profile, id) : null,
  };
}

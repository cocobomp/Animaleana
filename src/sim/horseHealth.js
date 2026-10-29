// Le carnet de santé du cheval, comme dans la vraie vie (raccourci dans le temps du jeu) :
//   🪱 vermifuge tous les 20 jours (dans sa fiche) ; 💉 vaccins et 🦷 dents tous les 60 jours (chez le vétérinaire) ;
//   🔨 maréchal-ferrant tous les 14 jours (« Ferrer »).
// Le jour où c'est l'heure, un rappel. En retard : le vermifuge oublié le fait maigrir, les dents aussi (il mâche
// mal), sans vaccin il attrape plus facilement la grippe, et des fers trop usés finissent par tomber (il boite : on
// le ferre). Logique pure (tests/horseHealth.test.js) ; le jeu : src/game/Game.js (horseHealthDay), la fiche :
// src/ui/panels.js.
//
// Dans l'animal (sauvegardé) : a.healthLog = { worm, vaccine, teeth, farrier } (le jour où c'était fait),
// a.healthReminded = { id: jour d'échéance déjà rappelé }, a.healthDay (le dernier jour compté).

export const HEALTH_PLAN = {
  worm: { every: 20, icon: '🪱', where: 'sheet' },
  vaccine: { every: 60, icon: '💉', where: 'vet' },
  teeth: { every: 60, icon: '🦷', where: 'vet' },
  farrier: { every: 14, icon: '🔨', where: 'shoe' },
};
export const HEALTH_IDS = Object.keys(HEALTH_PLAN);
/** Un cheval qui arrive : fait il y a quelques jours (tout n'est pas à faire le même jour). */
const START_AGO = { worm: 8, vaccine: 20, teeth: 35, farrier: 4 };
/** Le prix du vermifuge (en mode gestion). */
export const WORMER_COST = 12;

const clampN = (v, min, max) => Math.max(min, Math.min(max, v));

/** Le carnet (créé au besoin, le jour où on le regarde pour la première fois). null si ce n'est pas un cheval. */
export function healthLog(a, day) {
  if (a.species !== 'horse') return null;
  a.healthLog = a.healthLog ?? {};
  for (const id of HEALTH_IDS) if (typeof a.healthLog[id] !== 'number') a.healthLog[id] = day - START_AGO[id];
  return a.healthLog;
}

/** Chaque ligne du carnet : { id, last, due, left (jours, négatif = en retard), state: 'ok' | 'soon' | 'today' | 'late' }. */
export function healthPlan(a, day) {
  const log = healthLog(a, day);
  if (!log) return [];
  return HEALTH_IDS.map((id) => {
    const due = log[id] + HEALTH_PLAN[id].every;
    const left = due - day;
    return { id, last: log[id], due, left, state: left < 0 ? 'late' : left === 0 ? 'today' : left <= 2 ? 'soon' : 'ok' };
  });
}

/** C'est fait (vermifuge, visite du vétérinaire, ferrure). Les fers neufs : il ne boite plus d'un fer perdu. */
export function noteHealth(a, id, day) {
  if (!healthLog(a, day) || !HEALTH_PLAN[id]) return false;
  a.healthLog[id] = day;
  if (id === 'farrier' && a.lame?.cause === 'shoe') a.lame = null;
  return true;
}

/**
 * Les jours passent (une fois par jour de jeu) : rappels et effets des retards. Renvoie les événements :
 * 'remind:<id>' (c'est l'heure), 'sick' (la grippe, sans vaccin), 'lostShoe' (un fer tombé : il boite).
 */
export function healthDay(a, day, rng = Math.random) {
  const events = [];
  if (a.species !== 'horse' || a.client || a.guest) return events;
  const from = a.healthDay ?? day;
  a.healthDay = day;
  const days = Math.max(0, Math.min(10, day - from)); // (une longue absence ne compte pas tout)
  a.healthReminded = a.healthReminded ?? {};
  for (const it of healthPlan(a, day)) {
    if (it.left <= 0 && a.healthReminded[it.id] !== it.due) {
      a.healthReminded[it.id] = it.due;
      events.push(`remind:${it.id}`);
    }
    if (it.state !== 'late') continue;
    for (let k = 0; k < days; k++) {
      if (it.id === 'worm') {
        a.weight = clampN((a.weight ?? 50) - 1.5, 0, 100);
        a.health = clampN((a.health ?? 100) - 2, 30, 100);
      } else if (it.id === 'teeth') {
        a.weight = clampN((a.weight ?? 50) - 1, 0, 100); // (il mâche mal)
      } else if (it.id === 'vaccine' && !a.sick && rng() < 0.04) {
        a.sick = 'flu';
        events.push('sick');
      } else if (it.id === 'farrier' && it.left <= -3 && !a.lame && !a.sick && rng() < 0.15) {
        a.lame = { cause: 'shoe', foot: Math.floor(rng() * 4), hours: 0 };
        events.push('lostShoe');
      }
    }
  }
  return events;
}

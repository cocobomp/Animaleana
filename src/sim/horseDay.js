// La journée de ton cheval : la routine d'un vrai propriétaire, chaque jour de jeu. 🌅 le foin du matin (avant 14 h),
// 🌇 le foin du soir (à partir de 14 h), 💧 l'eau, 🪮 le pansage, 🏇 le faire travailler (monter, longe, liberté, une
// activité) et ❤️ un câlin. Tout coché : une journée parfaite (le lien et le bonheur montent, stat 'perfectDays').
// Logique pure (tests/horseDay.test.js) ; le jeu : src/game/Game.js (markHorseDay), la fiche : src/ui/panels.js.
//
// Dans l'animal (sauvegardé) : a.today = { day, done: [ids], perfect }.

export const DAY_TASKS = [
  { id: 'feedAm', icon: '🌅', kinds: ['feed'], before: 14 },
  { id: 'feedPm', icon: '🌇', kinds: ['feed'], from: 14 },
  { id: 'water', icon: '💧', kinds: ['water'] },
  { id: 'brush', icon: '🪮', kinds: ['brush'] },
  { id: 'work', icon: '🏇', kinds: ['ride', 'lunge', 'liberty', 'activity'] },
  { id: 'pet', icon: '❤️', kinds: ['pet'] },
];

/** La journée du cheval (remise à zéro le jour suivant). */
export function horseToday(a, day) {
  if (!a.today || a.today.day !== day) a.today = { day, done: [], perfect: false };
  return a.today;
}

/**
 * Note un soin (kind : 'feed', 'water', 'brush', 'pet', 'ride', 'lunge', 'liberty', 'activity') fait à l'heure
 * hour du jour day. Renvoie { added: [ids cochés], perfect: true si la journée vient de devenir parfaite }.
 */
export function markHorseDay(a, kind, hour, day) {
  if (a.species !== 'horse' || a.client || a.guest) return { added: [], perfect: false };
  const today = horseToday(a, day);
  const added = [];
  for (const task of DAY_TASKS) {
    if (!task.kinds.includes(kind) || today.done.includes(task.id)) continue;
    if (task.before !== undefined && hour >= task.before) continue;
    if (task.from !== undefined && hour < task.from) continue;
    today.done.push(task.id);
    added.push(task.id);
    break; // (un repas compte pour un seul créneau)
  }
  let perfect = false;
  if (!today.perfect && DAY_TASKS.every((x) => today.done.includes(x.id))) {
    today.perfect = true;
    perfect = true;
    a.bond = Math.min(100, (a.bond ?? 5) + 3);
    a.needs.affection = Math.min(100, (a.needs?.affection ?? 50) + 10);
  }
  return { added, perfect };
}

/** Ce qu'il reste à faire aujourd'hui (les tâches dont l'heure est passée comprises : on peut toujours les voir). */
export function horseDayView(a, day, hour) {
  const today = horseToday(a, day);
  return DAY_TASKS.map((x) => ({
    id: x.id,
    icon: x.icon,
    done: today.done.includes(x.id),
    // (le foin du matin, après 14 h : trop tard pour aujourd'hui ; le foin du soir, avant 14 h : pas encore)
    missed: !today.done.includes(x.id) && x.before !== undefined && hour >= x.before,
    later: x.from !== undefined && hour < x.from,
  }));
}

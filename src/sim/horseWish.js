// 🫧 « Il te demande… » : ce que ton cheval voudrait maintenant, une seule chose à la fois, dans une bulle au-dessus de
// sa tête quand tu passes près de lui. 🌾 le foin (il a faim, ou le foin du matin manque avant 14 h, ou celui du soir à
// partir de 16 h), 💧 l'eau, 🪮 le pansage, 🏇 le travail (de 8 h à 19 h, s'il peut être monté), ❤️ un câlin. Tout est
// fait : plus de bulle (« Journée parfaite »). Rien la nuit, ni pour un cheval confié ; malade, boiteux ou endormi, son
// 🤒, son 🩹 ou son 💤 passent avant.
// Logique pure (tests/horseWish.test.js) : il lit sa journée (src/sim/horseDay.js) sans rien cocher. La bulle :
// src/game/wishBubble.js, src/game/AnimalEntity.js (update, updateStatus).

import { DAY_TASKS } from './horseDay.js';
import { keepsMemories } from './memories.js';
import { canRide, careFull } from './animal.js';

/** À 10 m ; faim ou soif sous 45 ; le foin du soir à partir de 16 h ; le travail de 8 h à 19 h ; la nuit de 21 h à 6 h. */
export const WISH = { near: 10, hungry: 45, thirsty: 45, eveningHay: 16, workFrom: 8, workTo: 19, nightFrom: 21, nightTo: 6 };
export const ICONS = { hay: '🌾', water: '💧', brush: '🪮', work: '🏇', pet: '❤️' };

const FULL = 60; // (rassasié, désaltéré : le foin ou l'eau qui manquait est exaucé)
const MORNING = DAY_TASKS.find((x) => x.id === 'feedAm').before; // (le foin du matin : avant 14 h)
const NONE = [];

// (des vœux tout faits, un par tâche : rien n'est créé chaque seconde)
const BY_TASK = {};
for (const [id, tasks] of Object.entries({ hay: ['hunger', 'feedAm', 'feedPm'], water: ['thirst', 'water'], brush: ['brush'], work: ['work'], pet: ['pet'] })) {
  for (const task of tasks) BY_TASK[task] = Object.freeze({ id, icon: ICONS[id], task });
}

const doneToday = (a, day) => (a.today?.day === day ? a.today.done : NONE);
// (pas un soin que le jeu refuserait, « il n'en a pas besoin » : il a bu seul à l'abreuvoir… la bulle passe au suivant)
const asks = (a, done, task, care) => !done.includes(task) && !careFull(a, care);

/**
 * Ce qu'il te demande maintenant : { id ('hay', 'water', 'brush', 'work', 'pet'), icon, task (ce qui l'exauce : 'hunger',
 * 'thirst' ou une tâche de sa journée) }, ou null. hour : l'heure du jeu (8.5 = 8 h 30). sleeping : il dort.
 */
export function wishOf(a, { day, hour, sleeping = false } = {}) {
  if (!keepsMemories(a) || a.sick || a.lame || sleeping) return null;
  if (hour < WISH.nightTo || hour >= WISH.nightFrom) return null; // (la nuit, il se repose)
  const done = doneToday(a, day);
  const n = a.needs ?? {};
  if ((n.hunger ?? 100) < WISH.hungry) return BY_TASK.hunger;
  if (hour < MORNING && asks(a, done, 'feedAm', 'feed')) return BY_TASK.feedAm;
  if (hour >= WISH.eveningHay && asks(a, done, 'feedPm', 'feed')) return BY_TASK.feedPm;
  if ((n.thirst ?? 100) < WISH.thirsty) return BY_TASK.thirst;
  if (asks(a, done, 'water', 'water')) return BY_TASK.water;
  if (asks(a, done, 'brush', 'brush')) return BY_TASK.brush;
  if (hour >= WISH.workFrom && hour < WISH.workTo && !done.includes('work') && canRide(a).ok) return BY_TASK.work;
  if (asks(a, done, 'pet', 'pet')) return BY_TASK.pet;
  return null;
}

/** Le vœu est-il exaucé ? La faim ou la soif : rassasié (60) ; sinon, la tâche est cochée dans sa journée. */
export function wishDone(a, wish, day) {
  if (!wish) return false;
  if (wish.task === 'hunger') return (a.needs?.hunger ?? 0) >= FULL;
  if (wish.task === 'thirst') return (a.needs?.thirst ?? 0) >= FULL;
  return doneToday(a, day).includes(wish.task);
}

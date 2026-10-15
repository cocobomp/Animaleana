// Quêtes (facultatives) et succès. Chaque objectif donne sa progression [actuel, total].

import { happiness } from './animal.js';
import { PLACE_IDS, PLACES } from './places.js';

const stat = (p, k) => p.stats[k] ?? 0;

export const OBJECTIVES = [
  { id: 'adopt1', kind: 'quest', reward: 50, progress: (p) => [stat(p, 'adopted'), 1] },
  // Quêtes pour bien débuter (tutoriel) : voir aussi QUEST_GUIDE dans tutorial.js.
  { id: 'pet3', kind: 'quest', reward: 20, progress: (p) => [stat(p, 'pet'), 3] },
  { id: 'water3', kind: 'quest', reward: 20, progress: (p) => [stat(p, 'water'), 3] },
  { id: 'scoop1', kind: 'quest', reward: 20, progress: (p) => [stat(p, 'scoop'), 1] },
  { id: 'feed5', kind: 'quest', reward: 30, progress: (p) => [stat(p, 'feed'), 5] },
  { id: 'brush3', kind: 'quest', reward: 30, progress: (p) => [stat(p, 'brush'), 3] },
  { id: 'ride1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'rides'), 1] },
  { id: 'trick1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'tricksLearned'), 1] },
  { id: 'vet1', kind: 'quest', reward: 50, progress: (p) => [stat(p, 'vet'), 1] },
  { id: 'travel1', kind: 'quest', reward: 80, progress: (p) => [stat(p, 'travels'), 1] },
  { id: 'abroad', kind: 'quest', reward: 120, progress: (p) => [p.visited.some((id) => PLACES[id].country !== PLACES[p.home ?? 'maison'].country) ? 1 : 0, 1] },
  { id: 'horseTrip', kind: 'quest', reward: 150, progress: (p) => [stat(p, 'horseTravels'), 1] },
  { id: 'baby', kind: 'quest', reward: 100, progress: (p) => [stat(p, 'births'), 1] },
  { id: 'species4', kind: 'quest', reward: 150, progress: (p) => [new Set(p.animals.map((a) => a.species)).size, 4] },
  // activités (src/sim/activities.js)
  { id: 'actvJump1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'actvJumping'), 1] },
  { id: 'actvClear1', kind: 'quest', reward: 80, progress: (p) => [stat(p, 'actvClear'), 1] },
  { id: 'actvTrail1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'actvTrail'), 1] },
  { id: 'actvAgility1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'actvAgility'), 1] },
  { id: 'actvShow1', kind: 'quest', reward: 80, progress: (p) => [stat(p, 'actvShows'), 1] },
  { id: 'actvCompete1', kind: 'quest', reward: 100, progress: (p) => [stat(p, 'actvCompetitions'), 1] },
  { id: 'actvLesson1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'actvLessons'), 1] },
  { id: 'actvHop1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'actvHop'), 1] },
  { id: 'actvHutch5', kind: 'quest', reward: 40, progress: (p) => [stat(p, 'actvHutchPlay'), 5] },
  { id: 'zoo10', kind: 'achievement', progress: (p) => [p.animals.length, 10] },
  { id: 'world', kind: 'achievement', progress: (p) => [p.visited.length, PLACE_IDS.length] },
  { id: 'allHappy', kind: 'achievement', progress: (p) => {
    const n = p.animals.length;
    return [n >= 3 && p.animals.every((a) => happiness(a) >= 70) ? 1 : 0, 1];
  } },
  { id: 'rider10', kind: 'achievement', progress: (p) => [stat(p, 'rides'), 10] },
  { id: 'vet10', kind: 'achievement', progress: (p) => [stat(p, 'vet'), 10] },
  { id: 'trainer5', kind: 'achievement', progress: (p) => [stat(p, 'tricksLearned'), 5] },
  { id: 'globe10', kind: 'achievement', progress: (p) => [stat(p, 'travels'), 10] },
  { id: 'actvWin1', kind: 'achievement', progress: (p) => [stat(p, 'actvWins'), 1] },
  { id: 'actvPodium5', kind: 'achievement', progress: (p) => [stat(p, 'actvPodiums'), 5] },
  { id: 'actvPhotos', kind: 'achievement', progress: (p) => [stat(p, 'actvPhotos'), 8] },
  { id: 'actvStar', kind: 'achievement', progress: (p) => [stat(p, 'actvShows'), 10] },
];

/** Renvoie les objectifs qui viennent d'être terminés (et les marque comme faits). */
export function checkObjectives(profile) {
  const done = [];
  for (const o of OBJECTIVES) {
    if (profile.completed.includes(o.id)) continue;
    const [cur, max] = o.progress(profile);
    if (cur >= max) {
      profile.completed.push(o.id);
      if (o.reward && profile.mode === 'manage') profile.money += o.reward;
      done.push(o);
    }
  }
  return done;
}

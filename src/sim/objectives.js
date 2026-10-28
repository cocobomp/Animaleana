// Quêtes (facultatives) et succès. Chaque objectif donne sa progression [actuel, total].
// Quêtes principales (l'histoire de la ferme) et secondaires (à rejoindre) : src/sim/quests.js.

import { happiness } from './animal.js';
import { PLACE_IDS, PLACES } from './places.js';
import { CAREERS } from './careers.js'; // paliers du métier Toiletteur
import { SPECIES_IDS, isOffered, anyAvailable } from './species.js';

const stat = (p, k) => p.stats[k] ?? 0;

/**
 * Quête « espèces différentes » : 4 espèces au plus, mais jamais plus que celles qu'on peut avoir dans
 * cette partie (proposées, OFFERED_SPECIES de src/sim/species.js, ou déjà à soi). Seuls nos propres
 * animaux comptent, pour le compte comme pour le but : un chat en pension (client d'une ancienne partie)
 * ne relève pas le but à 3 espèces alors qu'aucun chat ne peut s'adopter.
 */
function speciesProgress(p) {
  const own = new Set(p.animals.filter((a) => !a.client && !a.guest).map((a) => a.species));
  const total = Math.min(4, SPECIES_IDS.filter((sid) => isOffered(sid) || own.has(sid)).length);
  return [Math.min(own.size, total), total];
}

export const OBJECTIVES = [
  // L'histoire de ton premier cheval (chapitres : STORY, src/sim/quests.js). Les soins d'un cheval comptent aussi à
  // part (horse_pet, horse_feed… : src/game/Game.js care) ; galoper : 3 secondes de galop d'affilée (Player.rideStep).
  { id: 'horse1', kind: 'quest', reward: 50, progress: (p) => [p.animals.some((a) => a.species === 'horse' && !a.client && !a.guest) ? 1 : 0, 1] },
  { id: 'horsePet3', kind: 'quest', reward: 20, progress: (p) => [stat(p, 'horse_pet'), 3] },
  { id: 'horseFeed3', kind: 'quest', reward: 30, progress: (p) => [stat(p, 'horse_feed'), 3] },
  { id: 'horseWater2', kind: 'quest', reward: 20, progress: (p) => [stat(p, 'horse_water'), 2] },
  { id: 'horseBrush1', kind: 'quest', reward: 40, progress: (p) => [stat(p, 'horse_brush'), 1] },
  { id: 'rideCanter1', kind: 'quest', reward: 50, progress: (p) => [stat(p, 'rideCanter'), 1] },
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
  { id: 'species4', kind: 'quest', reward: 150, progress: speciesProgress }, // (texte : « Adopte {n} espèces… »)
  // activités (src/sim/activities.js)
  { id: 'actvJump1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'actvJumping'), 1] },
  { id: 'actvClear1', kind: 'quest', reward: 80, progress: (p) => [stat(p, 'actvClear'), 1] },
  { id: 'actvTrail1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'actvTrail'), 1] },
  { id: 'actvAgility1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'actvAgility'), 1] },
  { id: 'actvShow1', kind: 'quest', reward: 80, progress: (p) => [stat(p, 'actvShows'), 1] },
  { id: 'actvCompete1', kind: 'quest', reward: 100, progress: (p) => [stat(p, 'actvCompetitions'), 1] },
  { id: 'actvLesson1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'actvLessons'), 1] },
  // needs : espèces nécessaires (quête cachée tant qu'aucune n'est proposée ni à la ferme, voir objectiveShown)
  { id: 'actvHop1', kind: 'quest', reward: 60, needs: ['rabbit'], progress: (p) => [stat(p, 'actvHop'), 1] },
  { id: 'actvHutch5', kind: 'quest', reward: 40, needs: ['rabbit'], progress: (p) => [stat(p, 'actvHutchPlay'), 5] },
  // dressage et concours à l'extérieur (src/sim/dressage.js, src/sim/competitions.js)
  { id: 'drTrain3', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'actvTraining'), 3] },
  { id: 'drReprise1', kind: 'quest', reward: 80, progress: (p) => [stat(p, 'actvDressage'), 1] },
  { id: 'compRegister1', kind: 'quest', reward: 40, progress: (p) => [stat(p, 'compRegistered'), 1] },
  { id: 'compAway1', kind: 'quest', reward: 150, progress: (p) => [stat(p, 'compAway'), 1] },
  // concours de beauté (src/sim/beauty.js)
  { id: 'beautyPrep1', kind: 'quest', reward: 40, progress: (p) => [stat(p, 'beautyReady'), 1] },
  { id: 'beautyBraid1', kind: 'quest', reward: 40, progress: (p) => [stat(p, 'beautyBraid'), 1] },
  { id: 'beauty1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'actvBeauty'), 1] },
  // métier éducateur canin (src/sim/dogTrainer.js)
  { id: 'dtClient1', kind: 'quest', reward: 40, progress: (p) => [(p.dogTrainer?.clients?.length ?? 0) + (p.dogTrainer?.history?.length ?? 0) > 0 ? 1 : 0, 1] },
  { id: 'dtSession3', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'dtSessions'), 3] },
  { id: 'dtDeliver1', kind: 'quest', reward: 100, progress: (p) => [stat(p, 'dtSuccess'), 1] },
  { id: 'dtCoach1', kind: 'quest', reward: 40, progress: (p) => [stat(p, 'dtCoach'), 1] },
  { id: 'dtStars3', kind: 'achievement', progress: (p) => [stat(p, 'dtStars3'), 3] },
  { id: 'dtDeliver5', kind: 'achievement', progress: (p) => [stat(p, 'dtSuccess'), 5] },
  // Métier Toiletteur ✂️ (src/sim/groomer.js)
  { id: 'grmSalon', kind: 'quest', reward: 80, progress: (p) => [(p.structures ?? []).some((s) => s.type === 'salon') ? 1 : 0, 1] },
  { id: 'grmClient1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'groomClients'), 1] },
  { id: 'grmOwn1', kind: 'quest', reward: 40, progress: (p) => [stat(p, 'groomOwn'), 1] },
  { id: 'grmAccessory1', kind: 'quest', reward: 40, progress: (p) => [stat(p, 'groomAccessories'), 1] },
  { id: 'grmFive1', kind: 'quest', reward: 100, progress: (p) => [stat(p, 'groomFive'), 1] },
  { id: 'grmClients10', kind: 'achievement', progress: (p) => [stat(p, 'groomClients'), 10] },
  { id: 'grmExpert', kind: 'achievement', progress: (p) => [p.careers?.xp?.groomer ?? 0, CAREERS.groomer.ranks[2]] }, // rang expert
  // Métiers et clients (src/sim/careers.js, src/sim/clients.js)
  { id: 'career1', kind: 'quest', reward: 80, progress: (p) => [stat(p, 'careersStarted'), 1] },
  { id: 'client1', kind: 'quest', reward: 60, progress: (p) => [stat(p, 'clients'), 1] },
  { id: 'clientVet1', kind: 'quest', reward: 100, progress: (p) => [stat(p, 'clientsVet'), 1] },
  { id: 'clientHappy5', kind: 'quest', reward: 150, progress: (p) => [stat(p, 'clientsHappy'), 5] },
  { id: 'clientMoney500', kind: 'quest', reward: 200, progress: (p) => [stat(p, 'clientMoney'), 500] },
  { id: 'client5Stars10', kind: 'achievement', progress: (p) => [stat(p, 'clients5Stars'), 10] },
  { id: 'reputation90', kind: 'achievement', progress: (p) => [Math.max(0, ...Object.values(p.careers?.reputation ?? {})) >= 90 ? 1 : 0, 1] },
  // 🧭 Guide de randonnée (src/sim/trailGuide.js)
  { id: 'tgFirst', kind: 'quest', reward: 80, progress: (p) => [stat(p, 'tgRides'), 1] },
  { id: 'tgStars3', kind: 'quest', reward: 120, progress: (p) => [stat(p, 'tgStars3'), 1] },
  { id: 'tgRiders10', kind: 'quest', reward: 150, progress: (p) => [stat(p, 'tgRiders'), 10] },
  { id: 'tgAbroad', kind: 'quest', reward: 200, progress: (p) => [stat(p, 'tgAbroad'), 1] },
  { id: 'tgPhotos10', kind: 'achievement', progress: (p) => [stat(p, 'tgPhotos'), 10] },
  { id: 'tgExpert', kind: 'achievement', progress: (p) => [Math.min(400, p.careers?.xp?.trailGuide ?? 0), 400] },
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
  { id: 'drGood', kind: 'achievement', progress: (p) => [stat(p, 'actvDressage70'), 1] },
  { id: 'compPodium3', kind: 'achievement', progress: (p) => [stat(p, 'compAwayPodiums'), 3] },
  { id: 'compGrand', kind: 'achievement', progress: (p) => [stat(p, 'compGrandWins'), 1] },
  { id: 'beautyPodium', kind: 'achievement', progress: (p) => [stat(p, 'beautyPodium'), 1] }, // concours de beauté
  { id: 'beautyChampion', kind: 'achievement', progress: (p) => [stat(p, 'beautyChampion'), 1] }, // écharpe du plus bel animal
];

/**
 * L'objectif est-il montré (journal, histoire de la ferme, quêtes à rejoindre, suivi) ? Non s'il demande une espèce pas encore
 * proposée qu'on n'a pas (needs). Une quête déjà finie reste dans le journal.
 */
export const objectiveShown = (p, o) => !o.needs || anyAvailable(p, o.needs) || (p.completed ?? []).includes(o.id);

/** Paramètres du texte d'un objectif (o_<id>) : {n} = le total à atteindre (« Adopte 2 espèces… »). */
export function objectiveParams(p, o) {
  if (!o || !p) return {};
  return { n: o.progress(p)[1] };
}

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

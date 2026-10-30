// 🧦 Les chaussettes de boue : au pré, à l'automne et l'hiver dans un pays de pluie (ou partout quand il pleut), la
// terre mouillée colle aux jambes du cheval, jusqu'aux genoux, en deux heures de jeu environ. Mouillée, elle est
// foncée ; en séchant, elle devient claire et poussiéreuse (et tombe peu à peu, au sec ou dans son box). Dans son box,
// il reste propre. La brosse du pansage l'enlève (src/sim/animal.js applyCare), de haut en bas : on la laisse sécher,
// puis on brosse (mouiller ses jambes tous les jours abîme sa peau).
// Logique pure (tests/legMud.test.js) ; sur sa robe en 3D : src/game/models/horseCoat.js (hLegMud, hLegWet), au
// pansage : src/ui/minigames/pansage.js (les quatre taches sur ses jambes).

import { PLACES } from './places.js';

/**
 * perHour : boue gagnée par heure au pré boueux ; fallPerHour : perdue par heure ailleurs (elle sèche et tombe) ;
 * wetRate : vitesse à laquelle elle se mouille ou sèche ; brushAt : à partir de là, le pansage n'est jamais « inutile »
 * (careFull) ; patchesAt : à partir de là, des taches sur ses jambes au pansage.
 */
export const LEG_MUD = { perHour: 0.5, fallPerHour: 0.1, wetRate: 2, brushAt: 0.3, patchesAt: 0.2 };

const RAIN = ['rain', 'storm'];

/** Le sol du pré est-il boueux ? Sous la pluie, partout ; sinon, à la saison des pluies du lieu (poids de pluie ≥ 3). */
export function muddyGround({ placeId, season, weather }) {
  if (RAIN.includes(weather)) return true;
  return (PLACES[placeId]?.weather?.[season]?.rain ?? 0) >= 3;
}

/**
 * Fait passer `hours` heures pour ses jambes (chevaux seulement). ctx : { outdoors (dehors, pas dans son box), muddy
 * (sol boueux : muddyGround), sky ou weather (le ciel : une couverture de pluie ne couvre pas ses jambes) }. Sans
 * ctx.outdoors (voyage, anciens appels) : pas de boue, elle tombe seulement.
 */
export function legMudTick(a, hours, ctx = {}) {
  if (a.species !== 'horse' || !(hours > 0)) return;
  const mud = a.legMud ?? 0;
  if (ctx.outdoors && ctx.muddy) a.legMud = Math.min(1, mud + LEG_MUD.perHour * hours);
  else if (mud > 0) a.legMud = Math.max(0, mud - LEG_MUD.fallPerHour * hours);
  if (!a.legMud) {
    cleanLegs(a);
    return;
  }
  // (mouillée sous la pluie, humide au pré boueux, sèche ailleurs ; elle s'en approche en douceur)
  const sky = ctx.sky ?? ctx.weather;
  const want = ctx.outdoors && RAIN.includes(sky) ? 1 : ctx.outdoors && ctx.muddy ? 0.5 : 0;
  const wet = a.legMudWet ?? 0;
  a.legMudWet = wet + (want - wet) * Math.min(1, LEG_MUD.wetRate * hours);
}

/** La brosse (ou le bain) : ses jambes sont propres. */
export function cleanLegs(a) {
  delete a.legMud;
  delete a.legMudWet;
}

// 🎨 Tout assorti : le tapis, les guêtres (ou les cloches) et ta bombe de la même couleur, comme au poney-club.
// Niveau 1 : le tapis et ce qu'il porte aux jambes ; niveau 2 : ta bombe aussi. Logique pure (tests/matchy.test.js) ;
// le jeu : src/game/Game.js (matchyNews, ride), la fiche du cheval : src/ui/tack.js (animalGearSection).
//
// Rien de plus dans la sauvegarde : les couleurs sont déjà dans a.gear[slot].color et profile.rider.helmet ;
// profile.stats.rideMatchy compte les montes avec un ensemble (le défi du jour, src/sim/horseChallenge.js).

import { GEAR, freeStock, gearPrice, sizeFor, fitReason } from './gear.js';

/** Couleurs qui ne font pas un ensemble : les cuirs, et le tapis citrouille. */
export const NEVER = ['brown', 'havana', 'tan', 'orange'];

const LEGS = ['legs', 'bells']; // (les guêtres d'abord)
const cloth = (c) => !!c && !NEVER.includes(c);

/**
 * L'ensemble d'un cheval. helmet : la bombe du cavalier ({ item, color }, riderHelmet). Renvoie { color (celle du
 * tapis, ou null), level (0 ; 1 : tapis et jambes ; 2 : ta bombe aussi), pieces : [{ slot, color, ok }] } — le tapis,
 * les jambes et la bombe (ok : de la couleur du tapis).
 */
export function matchyOf(a, helmet) {
  const pad = a?.gear?.pad;
  const c = cloth(pad?.color) ? pad.color : null;
  const legSlot = c ? LEGS.find((s) => a.gear[s]?.color === c) ?? null : null;
  const leg = legSlot ? a.gear[legSlot] : null;
  const level = c && leg ? (helmet?.color === c ? 2 : 1) : 0;
  return {
    color: c,
    level,
    pieces: [
      { slot: 'pad', color: pad?.color ?? null, ok: !!c },
      { slot: legSlot ?? 'legs', color: leg?.color ?? null, ok: !!leg },
      { slot: 'helmet', color: helmet?.color ?? null, ok: !!c && helmet?.color === c },
    ],
  };
}

/**
 * La pièce qui manque pour monter d'un cran : { item, color, owned (déjà à toi : on peut la mettre) } ou null (déjà
 * tout assorti, ou rien n'existe dans cette couleur : pas de guêtres vertes). Ce qu'on a déjà d'abord, sinon le
 * moins cher (les cloches avant les guêtres).
 */
export function missingFor(profile, a, helmet) {
  const m = matchyOf(a, helmet);
  // (déjà porté par ce cheval : on change seulement sa couleur)
  const have = (id) => (GEAR[id].type !== 'helmet' && a.gear?.[GEAR[id].slot]?.item === id) || freeStock(profile, id, sizeFor(id, a)) > 0;
  const pick = (ids, color) => {
    const list = ids.filter((id) => GEAR[id].colors?.includes(color) && (GEAR[id].type === 'helmet' || !fitReason(id, a)));
    if (!list.length) return null;
    const cost = (id) => (have(id) ? 0 : 1e6) + gearPrice(id, sizeFor(id, a) ?? undefined);
    const item = list.reduce((x, y) => (cost(y) < cost(x) ? y : x));
    return { item, color, owned: have(item) };
  };
  if (!m.color) {
    // Pas de tapis (ou le tapis citrouille) : un tapis de la couleur de ses jambes, sinon rose.
    const leg = LEGS.map((s) => a?.gear?.[s]?.color).find((c) => cloth(c) && GEAR.saddlePad.colors.includes(c));
    return pick(['saddlePad'], leg ?? 'pink');
  }
  if (m.level === 0) return pick(['bellBoots', 'boots'], m.color);
  if (m.level === 1) return pick(['helmet', 'helmetSparkle'], m.color);
  return null;
}

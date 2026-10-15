// Ce qu'on peut faire dans chaque bâtiment, et quand.
// Chaque action a ses conditions (heures d'ouverture, saison, animaux présents) et,
// si elle est impossible, une raison expliquée au joueur.

const inHours = (h, from, to) => (from <= to ? h >= from && h < to : h >= from || h < to);
const fmtHour = (h) => `${Math.floor(h)} h`;

/**
 * Règles par bâtiment. when(ctx) renvoie null si c'est possible, sinon { reason, params }.
 * ctx : { hour, season, home, count: { horse, livestock, pets, sick, milkable, shearable } }
 */
const RULES = {
  stable: [
    { id: 'checkHorses', icon: '🔦', when: (c) => need(c.count.horse) },
    { id: 'storeHorses', icon: '🏠', when: (c) => need(c.count.horse) ?? dayOnly(c, 6, 22) },
    { id: 'outHorses', icon: '🌿', when: (c) => need(c.count.horse) ?? dayOnly(c, 6, 19) },
    { id: 'hayHorses', icon: '🌾', when: (c) => need(c.count.horse) },
    { id: 'waterHorses', icon: '💧', when: (c) => need(c.count.horse) },
    { id: 'brushHorses', icon: '🪮', when: (c) => need(c.count.horse) ?? sleeping(c, 6, 21) },
    { id: 'cleanStalls', icon: '🧹', when: (c) => (c.count.horse || c.count.paddockDroppings ? null : { reason: 'noAnimals' }) ?? sleeping(c, 6, 21) },
    { id: 'tack', icon: '🏇', when: () => null },
    { id: 'farm', icon: '🔧', when: () => null },
  ],
  paddock: [
    { id: 'horsesToPaddock', icon: '🐴', when: (c) => need(c.count.horse) ?? dayOnly(c, 6, 22) },
    { id: 'hayPaddock', icon: '🌾', when: (c) => need(c.count.horse) },
    { id: 'waterHorses', icon: '💧', when: (c) => need(c.count.horse) },
    { id: 'cleanPaddock', icon: '🧹', when: (c) => (c.count.paddockDroppings > 0 ? null : { reason: 'alreadyClean' }) },
    { id: 'farm', icon: '🔧', when: () => null },
  ],
  kennel: [
    { id: 'feedDogs', icon: '🥣', when: (c) => need(c.count.dog) },
    { id: 'waterDogs', icon: '💧', when: (c) => need(c.count.dog) },
    { id: 'farm', icon: '🔧', when: () => null },
  ],
  hutch: [
    { id: 'feedRabbits', icon: '🥕', when: (c) => need(c.count.rabbit) },
    { id: 'cleanHutch', icon: '🧹', when: (c) => need(c.count.rabbit) },
    { id: 'farm', icon: '🔧', when: () => null },
  ],
  pen: [
    { id: 'outFlock', icon: '🌿', when: (c) => need(c.count.livestock) ?? dayOnly(c, 6, 18) },
    { id: 'inFlock', icon: '🏠', when: (c) => need(c.count.livestock) },
    { id: 'hayFlock', icon: '🌾', when: (c) => need(c.count.livestock) },
    { id: 'waterFlock', icon: '💧', when: (c) => need(c.count.livestock) },
    { id: 'cleanPen', icon: '🧹', when: (c) => (c.count.penDroppings > 0 ? null : { reason: 'alreadyClean' }) },
    // La traite se fait le matin et le soir.
    { id: 'milkAll', icon: '🥛', when: (c) => need(c.count.milkable, 'noneReady') ?? (inHours(c.hour, 6, 10) || inHours(c.hour, 17, 21) ? null : { reason: 'milkTime' }) },
    // On tond au printemps et en été.
    { id: 'shearAll', icon: '🧶', when: (c) => need(c.count.shearable, 'noneReady') ?? (['spring', 'summer'].includes(c.season) ? null : { reason: 'shearSeason' }) ?? dayOnly(c, 7, 19) },
    { id: 'farm', icon: '🔧', when: () => null },
  ],
  house: [
    { id: 'sleep', icon: '🛏️', when: (c) => (inHours(c.hour, 19, 10) ? null : { reason: 'notTired', params: { h: fmtHour(19) } }) },
    { id: 'feedPets', icon: '🥣', when: (c) => need(c.count.pets) },
    { id: 'avatar', icon: '👕', when: () => null },
  ],
  lodge: [
    { id: 'sleep', icon: '🛏️', when: (c) => (inHours(c.hour, 19, 10) ? null : { reason: 'notTired', params: { h: fmtHour(19) } }) },
    { id: 'feedPets', icon: '🥣', when: (c) => need(c.count.pets) },
  ],
  refuge: [
    { id: 'adopt', icon: '🐾', when: (c) => open(c, 9, 18) },
  ],
  vet: [
    { id: 'vet', icon: '🩺', when: (c) => (inHours(c.hour, 8, 19) || c.count.sick > 0 ? null : { reason: 'vetClosed', params: { h: fmtHour(8) } }) },
  ],
  jobs: [
    { id: 'jobs', icon: '📋', when: (c) => open(c, 8, 18) },
  ],
};

function need(n, reason = 'noAnimals') {
  return n > 0 ? null : { reason };
}

function open(c, from, to) {
  return inHours(c.hour, from, to) ? null : { reason: 'closed', params: { from: fmtHour(from), to: fmtHour(to) } };
}

function dayOnly(c, from, to) {
  return inHours(c.hour, from, to) ? null : { reason: 'night', params: { from: fmtHour(from), to: fmtHour(to) } };
}

/** Les animaux dorment : on ne les dérange pas pour un soin bruyant. */
function sleeping(c, from, to) {
  return inHours(c.hour, from, to) ? null : { reason: 'asleep', params: { h: fmtHour(from) } };
}

export function buildingActions(kind, ctx) {
  return (RULES[kind] ?? []).map((r) => {
    const block = r.when(ctx);
    return { id: r.id, icon: r.icon, enabled: !block, reason: block?.reason ?? null, params: block?.params ?? {} };
  });
}

/** Une action sur un animal est-elle possible maintenant ? (il dort la nuit) */
export function animalActionAllowed(action, { sleeping: asleep }) {
  const quiet = ['pet', 'feed', 'water', 'treat'];
  if (asleep && !quiet.includes(action)) return { ok: false, reason: 'animalAsleep' };
  return { ok: true };
}

export const BUILDING_KINDS = Object.keys(RULES);

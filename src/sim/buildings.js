// Ce qu'on peut faire dans chaque bâtiment, et quand.
// Chaque action a ses conditions (heures d'ouverture, saison, animaux présents) et,
// si elle est impossible, une raison expliquée au joueur.

const inHours = (h, from, to) => (from <= to ? h >= from && h < to : h >= from || h < to);
// Les heures des raisons restent des nombres ({ h: 19 }, { from: 9, to: 18 }) : l'interface les écrit dans la
// langue du joueur (hourParams de src/i18n.js : « 9 h » en français, « 9 am » en anglais).
const fmtHour = (h) => Math.floor(h);

/**
 * Règles par bâtiment. when(ctx) renvoie null si c'est possible, sinon { reason, params }.
 * ctx : { hour, season, home, count: { horse, livestock, pets, sick, milkable, shearable } }
 */
const RULES = {
  stable: [
    { id: 'checkHorses', icon: '🔦', when: (c) => need(c.count.horse) },
    { id: 'storeHorses', icon: '🏠', when: (c) => need(c.count.horse) }, // au box, même le soir
    { id: 'outHorses', icon: '🌿', when: (c) => need(c.count.horse) ?? dayOnly(c, 6, 19) },
    { id: 'hayHorses', icon: '🌾', when: (c) => need(c.count.horse) },
    { id: 'waterHorses', icon: '💧', when: (c) => need(c.count.horse) },
    { id: 'brushHorses', icon: '🪮', when: (c) => need(c.count.horse) ?? sleeping(c, 6, 21) },
    { id: 'cleanStalls', icon: '🧹', when: (c) => (c.count.horse || c.count.paddockDroppings ? null : { reason: 'noAnimals' }) ?? sleeping(c, 6, 21) },
    { id: 'tack', icon: '🏇', when: () => null },
    { id: 'actvOpen', icon: '🏆', when: () => null }, // activités et concours
    { id: 'farm', icon: '🔧', when: () => null },
    // Bâtiments à entretenir (src/sim/facilities.js)
    { id: 'facPaddock', icon: '🌳', when: (c) => need(c.count.horse) ?? dayOnly(c, 6, 22) },
    { id: 'facEnter', icon: '🚪', when: () => null },
    { id: 'facManage', icon: '📋', when: () => null },
    { id: 'extendStable', icon: '➕', when: () => null }, // rallonger l'écurie (vue construction)
  ],
  paddock: [
    { id: 'horsesToPaddock', icon: '🐴', when: (c) => need(c.count.horse) ?? dayOnly(c, 6, 22) },
    { id: 'hayPaddock', icon: '🌾', when: (c) => need(c.count.horse) },
    { id: 'waterHorses', icon: '💧', when: (c) => need(c.count.horse) },
    { id: 'cleanPaddock', icon: '🧹', when: (c) => (c.count.paddockDroppings > 0 ? null : { reason: 'alreadyClean' }) },
    { id: 'actvLesson', icon: '🎓', when: (c) => need(c.count.horse) ?? dayOnly(c, 7, 21) }, // activités : apprendre à sauter
    { id: 'farm', icon: '🔧', when: () => null },
    { id: 'moveCore', icon: '↔️', when: () => null }, // déplacer (vue d'ensemble, src/game/BuildMode.js)
    { id: 'resizeCore', icon: '⤢', when: () => null }, // agrandir (vue construction, src/game/ConstructionView.js)
  ],
  kennel: [
    { id: 'feedDogs', icon: '🥣', when: (c) => need(c.count.dog) },
    { id: 'waterDogs', icon: '💧', when: (c) => need(c.count.dog) },
    { id: 'dogTrainer', icon: '🐕', when: () => null }, // métier éducateur canin (src/ui/dogTrainer.js)
    { id: 'farm', icon: '🔧', when: () => null },
    { id: 'moveCore', icon: '↔️', when: () => null }, // déplacer (vue d'ensemble, src/game/BuildMode.js)
  ],
  hutch: [
    { id: 'feedRabbits', icon: '🥕', when: (c) => need(c.count.rabbit) },
    { id: 'cleanHutch', icon: '🧹', when: (c) => need(c.count.rabbit) },
    { id: 'actvHutchPlay', icon: '🎡', when: (c) => need(c.count.rabbit) }, // activités : jouer dans l'enclos
    { id: 'farm', icon: '🔧', when: () => null },
    { id: 'moveCore', icon: '↔️', when: () => null }, // déplacer (vue d'ensemble, src/game/BuildMode.js)
    { id: 'resizeCore', icon: '⤢', when: () => null }, // agrandir (vue construction, src/game/ConstructionView.js)
  ],
  pen: [
    { id: 'outFlock', icon: '🌿', when: (c) => need(c.count.livestock) ?? dayOnly(c, 6, 18) },
    { id: 'inFlock', icon: '🏠', when: (c) => need(c.count.livestock) },
    { id: 'leadIn', icon: '🤠', when: (c) => need(c.count.livestock) },
    { id: 'leadOut', icon: '🤠', when: (c) => need(c.count.livestock) ?? dayOnly(c, 6, 18) },
    { id: 'hayFlock', icon: '🌾', when: (c) => need(c.count.livestock) },
    { id: 'waterFlock', icon: '💧', when: (c) => need(c.count.livestock) },
    { id: 'cleanPen', icon: '🧹', when: (c) => (c.count.penDroppings > 0 ? null : { reason: 'alreadyClean' }) },
    // La traite se fait le matin et le soir.
    { id: 'milkAll', icon: '🥛', when: (c) => need(c.count.milkable, 'noneReady') ?? (inHours(c.hour, 6, 10) || inHours(c.hour, 17, 21) ? null : { reason: 'milkTime' }) },
    // On tond au printemps et en été.
    { id: 'shearAll', icon: '🧶', when: (c) => need(c.count.shearable, 'noneReady') ?? (['spring', 'summer'].includes(c.season) ? null : { reason: 'shearSeason' }) ?? dayOnly(c, 7, 19) },
    { id: 'farm', icon: '🔧', when: () => null },
    { id: 'facManage', icon: '📋', when: () => null }, // entretien et améliorations
    { id: 'moveCore', icon: '↔️', when: () => null }, // déplacer (vue d'ensemble, src/game/BuildMode.js)
    { id: 'resizeCore', icon: '⤢', when: () => null }, // agrandir (vue construction, src/game/ConstructionView.js)
  ],
  house: [
    { id: 'sleep', icon: '🛏️', when: (c) => (inHours(c.hour, 19, 7) ? null : { reason: 'notTired', params: { h: fmtHour(19) } }) },
    { id: 'feedPets', icon: '🥣', when: (c) => need(c.count.pets) },
    { id: 'avatar', icon: '👕', when: () => null },
    { id: 'facEnter', icon: '🚪', when: () => null }, // entrer dans la maison
    { id: 'facManage', icon: '📋', when: () => null },
  ],
  lodge: [
    { id: 'sleep', icon: '🛏️', when: (c) => (inHours(c.hour, 19, 7) ? null : { reason: 'notTired', params: { h: fmtHour(19) } }) },
    { id: 'feedPets', icon: '🥣', when: (c) => need(c.count.pets) },
  ],
  refuge: [
    // À la maison : refuge (gratuit). En voyage : élevage local (payant, on choisit).
    { id: 'adopt', icon: '🐾', when: (c) => (c.home ? open(c, 9, 18) : { reason: 'notHere' }) },
    { id: 'shop', icon: '🛒', when: (c) => (c.home ? { reason: 'notHere' } : open(c, 9, 19)) },
  ],
  petshop: [
    { id: 'shop', icon: '🛒', when: (c) => open(c, 9, 19) },
  ],
  // Sellerie : on y achète et range le matériel, et on entretient le cuir.
  tackroom: [
    { id: 'facEnter', icon: '🚪', when: () => null }, // entrer dans la sellerie (src/game/Interiors.js)
    { id: 'tack', icon: '🏇', when: () => null },
    { id: 'cleanTack', icon: '🧽', when: (c) => (c.count.tackDirty ? null : { reason: 'tackClean' }) },
  ],
  // Maison des animaux : chiens, chats et lapins y ont chacun leur coin pour dormir.
  pethouse: [
    { id: 'storePets', icon: '🏠', when: (c) => (c.count.pets ? (c.count.petsOut ? null : { reason: 'allHoused' }) : { reason: 'noPets' }) },
    { id: 'outPets', icon: '🌿', when: (c) => (c.count.housed ? null : { reason: 'noneHoused' }) },
    { id: 'feedPets', icon: '🥣', when: (c) => need(c.count.pets, 'noPets') },
    { id: 'cleanPetHouse', icon: '🧹', when: (c) => (c.count.petHouseDirt ? null : { reason: 'alreadyClean' }) },
  ],
  // Terrain de concours (activités) : on monte de jour, les spectacles se jouent aussi le soir.
  showground: [
    { id: 'actvLesson', icon: '🎓', when: (c) => need(c.count.horse) ?? dayOnly(c, 7, 21) },
    { id: 'actvJumping', icon: '🏇', when: (c) => need(c.count.horse) ?? dayOnly(c, 7, 21) },
    { id: 'actvAgility', icon: '🐕', when: (c) => dayOnly(c, 7, 21) },
    { id: 'actvHop', icon: '🐇', when: (c) => need(c.count.rabbit) ?? dayOnly(c, 7, 21) },
    { id: 'actvShow', icon: '🎪', when: (c) => dayOnly(c, 9, 23) },
    { id: 'actvBeauty', icon: '🎀', when: (c) => dayOnly(c, 8, 20) }, // concours de beauté (src/sim/beauty.js)
    { id: 'actvTrail', icon: '🧭', when: (c) => dayOnly(c, 7, 20) },
    { id: 'actvCalendar', icon: '📅', when: () => null },
    { id: 'actvTrophies', icon: '🏆', when: () => null },
  ],
  vet: [
    { id: 'vet', icon: '🩺', when: (c) => (inHours(c.hour, 8, 19) || c.count.sick > 0 ? null : { reason: 'vetClosed', params: { h: fmtHour(8) } }) },
    { id: 'vetSchool', icon: '🎓', when: () => null }, // apprendre le métier (src/ui/vetSchool.js), à toute heure
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

// ---------------------------------------------------------------- constructions du joueur
// Une feuille d'actions par famille de construction (voir src/sim/construction.js).
// ctx.count : { residents, droppings, horse }.
const hasResidents = (c) => need(c.count.residents, 'noResidents');
const CON_CARE = [
  { id: 'conFeed', icon: '🍖', when: hasResidents },
  { id: 'conWater', icon: '💧', when: hasResidents },
];
const CON_END = [
  { id: 'conResidents', icon: '🐾', when: () => null },
  { id: 'conMove', icon: '↔️', when: () => null },
  { id: 'conResize', icon: '⤢', when: (c) => (c.resizable ? null : { reason: 'notHere' }) }, // agrandir (enclos seulement)
  { id: 'conDemolish', icon: '🗑️', when: () => null },
];
const CON_CLEAN = { id: 'conClean', icon: '🧹', when: (c) => (c.count.droppings > 0 ? null : { reason: 'alreadyClean' }) };
const CON_HOME = { id: 'conCallHome', icon: '🏠', when: hasResidents };
const CON_FIELD = [...CON_CARE, { id: 'conBrush', icon: '🪮', when: (c) => hasResidents(c) ?? sleeping(c, 6, 21) }, CON_CLEAN, CON_HOME, ...CON_END];
Object.assign(RULES, {
  con_home: [...CON_CARE, { id: 'conPet', icon: '🤚', when: hasResidents }, CON_HOME, ...CON_END],
  con_enclosure: CON_FIELD,
  con_building: CON_FIELD,
  con_ranch: CON_FIELD,
  con_arena: [{ id: 'conTrain', icon: '🏇', when: (c) => need(c.count.horse) ?? dayOnly(c, 7, 20) }, CON_CLEAN, ...CON_END.slice(1)],
  con_decor: CON_END.slice(1),
});

export function buildingActions(kind, ctx) {
  return (RULES[kind] ?? []).flatMap((r) => {
    const block = r.when(ctx);
    if (block?.reason === 'notHere') return [];
    return [{ id: r.id, icon: r.icon, enabled: !block, reason: block?.reason ?? null, params: block?.params ?? {} }];
  });
}

/** Une action sur un animal est-elle possible maintenant ? (il dort la nuit) */
export function animalActionAllowed(action, { sleeping: asleep }) {
  const quiet = ['pet', 'feed', 'water', 'treat'];
  if (asleep && !quiet.includes(action)) return { ok: false, reason: 'animalAsleep' };
  return { ok: true };
}

export const BUILDING_KINDS = Object.keys(RULES);

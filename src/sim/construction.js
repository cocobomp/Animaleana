// Construction : catalogue des niches, clapiers, enclos, abris, granges, carrières, ranchs et décorations,
// placement sur une grille de 1 m (rectangles), prix, places pour les animaux et attribution d'une « maison ».
// Ce fichier ne dépend pas de la 3D, il est testé dans tests/construction.test.js.

import { uid } from './rng.js';
import { spend, earn } from './profile.js';
import { isUnlocked, UNLOCKS } from './progress.js';
import { EQUIPMENT } from './farm.js';

const LIVESTOCK = ['sheep', 'goat', 'cow'];

/**
 * Catalogue. w × d : taille en mètres (avant rotation, la façade / l'entrée regarde vers +z).
 * cat : home (niche, clapier), enclosure (enclos avec barrière), building (bâtiment), ranch, decor.
 * species : qui peut y habiter ; capacity : combien ; comfort : énergie gagnée par heure de sommeil « à la maison ».
 * gate : largeur de l'ouverture (enclos). g : genre du nom en français (accords).
 */
export const STRUCTURES = {
  kennel: { cat: 'home', emoji: '🐶', w: 2, d: 2, price: 120, species: ['dog'], capacity: 2, comfort: 6, g: 'f' },
  hutch: { cat: 'home', emoji: '🐰', w: 2, d: 2, price: 90, species: ['rabbit'], capacity: 4, comfort: 6, g: 'm' },
  paddockSmall: { cat: 'enclosure', emoji: '🐴', w: 12, d: 10, price: 300, species: ['horse'], capacity: 3, comfort: 2, gate: 3, g: 'm' },
  shelter: { cat: 'building', emoji: '🛖', w: 6, d: 4, price: 400, species: ['horse', ...LIVESTOCK], capacity: 4, comfort: 8, g: 'm', open: true },
  paddockLarge: { cat: 'enclosure', emoji: '🐎', w: 20, d: 16, price: 550, species: ['horse'], capacity: 6, comfort: 2, gate: 4, g: 'm' },
  pasture: { cat: 'enclosure', emoji: '🐑', w: 24, d: 20, price: 600, species: [...LIVESTOCK, 'horse'], capacity: 10, comfort: 2, gate: 4, g: 'm' },
  barn: { cat: 'building', emoji: '🏚️', w: 12, d: 8, price: 900, species: [...LIVESTOCK, 'horse'], capacity: 8, comfort: 10, g: 'f' },
  arena: { cat: 'enclosure', emoji: '🏇', w: 18, d: 28, price: 800, species: [], capacity: 0, comfort: 0, gate: 4, g: 'f', arena: true },
  newStable: { cat: 'building', emoji: '🐴', w: 16, d: 7, price: 1200, species: ['horse'], capacity: 4, comfort: 12, g: 'f' },
  // Le ranch : une grange, un grand paddock et un abri, pour les chevaux et le bétail.
  ranch: { cat: 'ranch', emoji: '🤠', w: 30, d: 24, price: 2500, species: ['horse', ...LIVESTOCK], capacity: 12, comfort: 10, gate: 5, g: 'm' },
  // Décorations (sans animaux).
  flowerBed: { cat: 'decor', emoji: '🌷', w: 2, d: 1, price: 20, g: 'm', walkable: true },
  tree: { cat: 'decor', emoji: '🌳', w: 2, d: 2, price: 30, g: 'm' },
  bench: { cat: 'decor', emoji: '🪑', w: 2, d: 1, price: 40, g: 'm' },
  fence: { cat: 'decor', emoji: '🪵', w: 4, d: 1, price: 15, g: 'f' },
};

export const CATEGORIES = ['home', 'enclosure', 'building', 'ranch', 'decor'];

/** Les enclos (et le ranch) ont une barrière et une ouverture. */
export const isEnclosure = (type) => ['enclosure', 'ranch'].includes(STRUCTURES[type].cat);
export const hasResidents = (type) => (STRUCTURES[type].capacity ?? 0) > 0;
export const REFUND = 0.5;

/** Taille d'une construction (w × d avant rotation) : les enclos peuvent être agrandis (s.w, s.d). */
export function sizeOf(s) {
  const def = STRUCTURES[s.type];
  return { w: s.w ?? def.w, d: s.d ?? def.d };
}

/** Démolir rend la moitié du prix, au prorata de la surface (un enclos agrandi rapporte plus). */
export function refundOf(type, size = null) {
  const def = STRUCTURES[type];
  const k = size ? (size.w * size.d) / (def.w * def.d) : 1;
  return Math.floor(def.price * k * REFUND);
}

/** Places pour les habitants : elles suivent la surface quand on agrandit un enclos. */
export function capacityOf(s) {
  const def = STRUCTURES[s.type];
  if (!def.capacity) return 0;
  if (s.w === undefined && s.d === undefined) return def.capacity;
  const { w, d } = sizeOf(s);
  return Math.max(1, Math.round((def.capacity * w * d) / (def.w * def.d)));
}

/** Zone constructible : un carré autour de la ferme. */
export const BOUNDS = 90;

// ---------------------------------------------------------------- installations de base
// Bergerie, paddock, niche et clapier existent dès le début ; on peut les déplacer (sans les tourner)
// et agrandir les trois enclos (src/sim/resize.js).
// layout : { pen: { x, z, w?, d? }, … } (choix du joueur, par lieu : profile.coreLayout[lieu]).
// w × d : largeur (le long de x) × profondeur (le long de z) en mètres ; absentes = taille par défaut.
// legacy : position et taille d'avant l'agrandissement (anciennes sauvegardes, voir resize.js).
export const CORE_ITEMS = {
  pen: { x: 14, z: 35, w: 24, d: 16, emoji: '🐑', encl: true, gate: { side: '+z', width: 4 }, legacy: { x: 14, z: 35, w: 20, d: 14 } },
  paddock: { x: -16, z: 20, w: 22, d: 26, emoji: '🐴', encl: true, gate: { side: '+x', width: 3 }, legacy: { x: -16, z: 16, w: 14, d: 18 } },
  kennel: { x: -9, z: -7, w: 2, d: 2, emoji: '🐶', gate: { side: '+z', width: 1.5 } },
  hutch: { x: 9, z: 4.5, w: 6, d: 5, emoji: '🐰', gate: { side: '+z', width: 1.2 }, legacy: { x: 9, z: 4, w: 5.2, d: 4.4 } },
};
export const CORE_IDS = Object.keys(CORE_ITEMS);
/** Les installations de base qu'on peut agrandir. */
export const RESIZABLE_CORE = ['paddock', 'pen', 'hutch'];

/** Où est cette installation maintenant (position d'origine si le joueur ne l'a pas déplacée). */
export function corePos(layout, id) {
  const def = CORE_ITEMS[id];
  const p = layout?.[id];
  return p ? { x: p.x, z: p.z } : { x: def.x, z: def.z };
}

/** Taille actuelle (w le long de x, d le long de z). */
export function coreSize(layout, id) {
  const def = CORE_ITEMS[id];
  const p = layout?.[id];
  return { w: p?.w ?? def.w, d: p?.d ?? def.d };
}

/** Décalage par rapport à la position d'origine. */
export function coreOffset(layout, id) {
  const p = corePos(layout, id);
  return { dx: p.x - CORE_ITEMS[id].x, dz: p.z - CORE_ITEMS[id].z };
}

/** Rectangle au sol { x, z, hw, hd }. at / size : position ou taille à essayer (sinon l'actuelle). */
export function coreRect(layout, id, at = null, size = null) {
  const p = at ?? corePos(layout, id);
  const s = size ?? coreSize(layout, id);
  return { x: p.x, z: p.z, hw: s.w / 2, hd: s.d / 2 };
}

/** Profondeur de l'espace libre devant l'entrée de chaque installation. */
export const APRON_DEPTH = { pen: 4, paddock: 3, hutch: 1.75, kennel: 1 };

/** Espace à garder libre devant l'entrée d'une installation de base (la porte est au milieu de son côté). */
export function coreApron(id, p, size = null) {
  const def = CORE_ITEMS[id];
  const f = coreRect(null, id, p, size);
  const wide = Math.max(1.5, def.gate.width / 2 + 0.5);
  const depth = APRON_DEPTH[id];
  if (def.gate.side === '+x') return { x: p.x + f.hw + depth, z: p.z, hw: depth, hd: wide };
  return { x: p.x, z: p.z + f.hd + depth, hw: wide, hd: depth };
}

/** Les équipements rangés dans un enclos le suivent quand on le déplace ou qu'on l'agrandit. */
export const EQUIPMENT_ZONE = { hayrack: 'paddock', paddockTrough: 'paddock', penFeeder: 'pen', penTrough: 'pen', cowBrush: 'pen' };

/**
 * Emplacement prévu de ces équipements, par rapport aux bords de leur enclos : [côté, retrait en mètres].
 * côté 1 = bord du haut (x ou z le plus grand), -1 = bord du bas, 0 = depuis le centre.
 * (Mêmes places qu'avant pour un enclos de l'ancienne taille.)
 */
export const SLOT_ANCHORS = {
  hayrack: { x: [1, 3], z: [1, 3] },
  paddockTrough: { x: [-1, 3], z: [0, 1] },
  penFeeder: { x: [1, 4], z: [1, 1] },
  penTrough: { x: [-1, 4], z: [1, 1] },
  cowBrush: { x: [-1, 5], z: [-1, 3] },
};

const anchorAt = (c, half, [side, inset]) => (side === 0 ? c + inset : side > 0 ? c + half - inset : c - half + inset);

/** Emplacement prévu d'un équipement (il suit son enclos : déplacé, agrandi ou réduit). */
export function slotOf(layout, type) {
  const [x, z] = EQUIPMENT[type].slot;
  const zone = EQUIPMENT_ZONE[type];
  if (!zone) return { x, z };
  const r = coreRect(layout, zone);
  const a = SLOT_ANCHORS[type];
  return { x: anchorAt(r.x, r.hw, a.x), z: anchorAt(r.z, r.hd, a.z) };
}

/** Position d'un équipement acheté : celle choisie par le joueur (eq.pos), sinon son emplacement prévu. */
export function equipmentPos(layout, eq) {
  return eq.pos ? { x: eq.pos[0], z: eq.pos[1] } : slotOf(layout, eq.type);
}

export const EQUIP_SIZE = 1.2;

/**
 * Le cœur de la ferme, où l'on ne construit pas : la cour devant la maison (on y arrive),
 * le pré du troupeau, les installations de base avec leur entrée,
 * et les emplacements prévus des équipements. id : à quelle installation appartient la zone.
 */
export function coreRects(layout = null) {
  const rects = [
    { x: 0, z: -4.5, hw: 9.5, hd: 7, id: 'yard' },
    { x: 0, z: 60, hw: 15, hd: 15, id: 'field' },
  ];
  for (const id of CORE_IDS) {
    const p = corePos(layout, id);
    const r = coreRect(layout, id);
    rects.push({ ...r, hw: r.hw + 0.5, hd: r.hd + 0.5, encl: CORE_ITEMS[id].encl, id });
    rects.push({ ...coreApron(id, p, coreSize(layout, id)), id, gate: true });
  }
  for (const type of Object.keys(EQUIPMENT)) {
    const p = slotOf(layout, type);
    rects.push({ x: p.x, z: p.z, hw: 1, hd: 1, id: EQUIPMENT_ZONE[type] ?? 'slot' });
  }
  return rects;
}

export const snap = (v) => Math.round(v);
export const normRot = (r) => ((Math.round(r) % 4) + 4) % 4;

/**
 * Rectangle occupé au sol : { x, z, hw, hd } (moitiés de largeur et de profondeur, après rotation).
 * size : { w, d } d'un enclos agrandi (sinon la taille du catalogue).
 */
export function footprint(type, x, z, rot = 0, size = null) {
  const def = STRUCTURES[type];
  const w = size?.w ?? def.w;
  const d = size?.d ?? def.d;
  const swap = normRot(rot) % 2 === 1;
  return { x, z, hw: (swap ? d : w) / 2, hd: (swap ? w : d) / 2 };
}

/** Emprise d'une construction posée (avec sa taille à elle). */
export const footprintOf = (s) => footprint(s.type, s.x, s.z, s.rot, sizeOf(s));

/** Côté de l'entrée selon la rotation (quarts de tour) : la façade regarde vers +z, puis +x, -z, -x. */
export const frontSide = (rot) => ['+z', '+x', '-z', '-x'][normRot(rot)];

/** Vecteur « vers l'avant » (vers l'entrée). */
export function frontDir(rot) {
  const a = (normRot(rot) * Math.PI) / 2;
  return { x: Math.round(Math.sin(a)), z: Math.round(Math.cos(a)) };
}

/** Point local (lx, lz) → monde, pour une rotation en quarts de tour (même convention que three.js rotation.y). */
export function toWorld(s, lx, lz) {
  const a = (normRot(s.rot) * Math.PI) / 2;
  const c = Math.round(Math.cos(a));
  const si = Math.round(Math.sin(a));
  return { x: s.x + lx * c + lz * si, z: s.z - lx * si + lz * c };
}

/** Ouverture d'un enclos au format de src/game/nav.js. */
export function gateOf(s) {
  const def = STRUCTURES[s.type];
  if (!def.gate) return null;
  const side = frontSide(s.rot);
  return { side, at: side.endsWith('x') ? s.z : s.x, width: def.gate };
}

/** L'enclos pour la navigation (passer par l'ouverture), ou null. */
export function enclosureOf(s) {
  if (!isEnclosure(s.type)) return null;
  const f = footprintOf(s);
  return { id: s.id, x: s.x, z: s.z, hw: f.hw, hd: f.hd, gate: gateOf(s), built: true };
}

/** Petit espace à garder libre devant une entrée (barrière, porte de bâtiment, niche). */
export function apron(s) {
  const def = STRUCTURES[s.type];
  if (def.cat === 'decor') return null;
  const f = footprintOf(s);
  const dir = frontDir(s.rot);
  const wide = Math.max(1.5, (def.gate ?? 2) / 2 + 0.5);
  const depth = 1.75;
  if (dir.x !== 0) return { x: s.x + dir.x * (f.hw + depth), z: s.z, hw: depth, hd: wide };
  return { x: s.x, z: s.z + dir.z * (f.hd + depth), hw: wide, hd: depth };
}

/** Point où l'on se tient pour utiliser la structure (devant l'entrée). */
export function doorOf(s) {
  const f = footprintOf(s);
  const dir = frontDir(s.rot);
  const ext = dir.x !== 0 ? f.hw : f.hd;
  return { x: s.x + dir.x * (ext + 1.2), z: s.z + dir.z * (ext + 1.2) };
}

/**
 * Zone de vie des habitants : un cercle { x, z, r } (et, pour les enclos, le rectangle intérieur hw × hd :
 * les animaux profitent de toute la place, même quand on agrandit).
 * Enclos : l'intérieur ; ranch : la moitié avant (la grange est au fond) ; bâtiments et niches : devant l'entrée.
 */
export function homeZone(s) {
  const def = STRUCTURES[s.type];
  const f = footprintOf(s);
  if (def.cat === 'enclosure') {
    return { x: s.x, z: s.z, r: Math.max(1.5, Math.min(f.hw, f.hd) - 2), hw: Math.max(1, f.hw - 1.5), hd: Math.max(1, f.hd - 1.5) };
  }
  if (def.cat === 'ranch') {
    const { w, d } = sizeOf(s);
    const c = toWorld(s, 0, d / 4);
    const lw = Math.max(1, w / 2 - 1.5);
    const ld = Math.max(1, d / 4 - 1.5);
    const swap = normRot(s.rot) % 2 === 1;
    return { x: c.x, z: c.z, r: Math.max(2, Math.min(w / 2, d / 4) - 2), hw: swap ? ld : lw, hd: swap ? lw : ld };
  }
  if (def.open) return { x: s.x, z: s.z, r: Math.min(def.w, def.d) / 2 - 0.6 };
  const dir = frontDir(s.rot);
  const ext = dir.x !== 0 ? f.hw : f.hd;
  const r = def.cat === 'home' ? 1.6 : Math.min(4, def.w / 3);
  return { x: s.x + dir.x * (ext + r + 0.4), z: s.z + dir.z * (ext + r + 0.4), r };
}

/** Rectangle de la zone (pour ramasser les crottins). */
export function zoneRect(s) {
  if (isEnclosure(s.type)) {
    const f = footprintOf(s);
    return { x: f.x, z: f.z, hw: f.hw, hd: f.hd };
  }
  const z = homeZone(s);
  return { x: z.x, z: z.z, hw: z.r + 1, hd: z.r + 1 };
}

const overlap = (a, b, eps = 0.01) => Math.abs(a.x - b.x) < a.hw + b.hw - eps && Math.abs(a.z - b.z) < a.hd + b.hd - eps;
const insideRect = (r, x, z) => Math.abs(x - r.x) <= r.hw && Math.abs(z - r.z) <= r.hd;

/** Points d'échantillonnage d'un rectangle (coins, centre, et tous les ~2 m). */
function samples(r) {
  const out = [];
  const nx = Math.max(1, Math.ceil((r.hw * 2) / 2));
  const nz = Math.max(1, Math.ceil((r.hd * 2) / 2));
  for (let i = 0; i <= nx; i++) {
    for (let j = 0; j <= nz; j++) out.push({ x: r.x - r.hw + (i / nx) * r.hw * 2, z: r.z - r.hd + (j / nz) * r.hd * 2 });
  }
  return out;
}

// (aussi utilisés pour agrandir les enclos : src/sim/resize.js)
export { overlap as rectsOverlap, samples as sampleRect };

/** Passage minimal (m) autour d'un enclos. */
export const GAP = 2.5;

/** Pente maximale acceptée (différence de hauteur sur l'emplacement, en mètres). */
export const MAX_SLOPE = { home: 1.2, building: 1.2, enclosure: 3, ranch: 3, decor: 2 };

/**
 * Peut-on poser cette structure ici ?
 * env : {
 *   structures : structures déjà construites dans ce lieu,
 *   colliders : obstacles du monde (bâtiments, barrières, équipements) { x, z, hw, hd },
 *   blocked : zones interdites en plus (cœur de la ferme, portes…),
 *   isWater(x, z), heightAt(x, z) (facultatifs), ignore : id de la structure qu'on déplace,
 * }
 * Renvoie { ok: true } ou { ok: false, reason: 'bounds' | 'core' | 'overlap' | 'water' | 'slope' }.
 */
export function validatePlacement(type, x, z, rot, env = {}) {
  const def = STRUCTURES[type];
  if (!def) return { ok: false, reason: 'unknown' };
  // env.size : taille d'un enclos agrandi qu'on déplace.
  const f = footprint(type, x, z, rot, env.size);
  const me = { id: env.ignore ?? '__new', type, x, z, rot, ...(env.size ?? {}) };
  return checkRect(f, { apron: apron(me), encl: isEnclosure(type), slope: MAX_SLOPE[def.cat] }, env);
}

/** Déplacer une installation de base (bergerie, paddock, niche, clapier) en (x, z). size : sa taille actuelle. */
export function validateCore(id, x, z, env = {}, size = null) {
  const def = CORE_ITEMS[id];
  const p = { x, z };
  const f = coreRect(null, id, p, size);
  return checkRect(f, { apron: coreApron(id, p, size), encl: def.encl, slope: def.encl ? 3 : 1.2, skipCore: id }, env);
}

/** Poser un équipement (mangeoire, abreuvoir…) : dans un enclos ou dehors, mais pas sur un passage. */
export function validateEquipment(x, z, env = {}) {
  const f = { x, z, hw: EQUIP_SIZE / 2, hd: EQUIP_SIZE / 2 };
  return checkRect(f, { equipment: true, slope: 1.5 }, env);
}

export const grow = (r, m) => ({ ...r, hw: r.hw + m, hd: r.hd + m });

/** Vérifications communes (voir validatePlacement). */
function checkRect(f, opts, env) {
  if (Math.abs(f.x) + f.hw > BOUNDS || Math.abs(f.z) + f.hd > BOUNDS) return { ok: false, reason: 'bounds' };
  const myApron = opts.apron ?? null;
  // Autour d'un enclos, on garde un passage (pour en faire le tour et rejoindre son ouverture).
  const mine = opts.encl ? GAP : 0;
  // Un équipement peut aller dans la cour ou dans un enclos, mais pas devant une entrée.
  const core = coreRects(env.core).filter((b) => b.id !== opts.skipCore && (!opts.equipment || b.gate));
  const blocked = [...core, ...(env.blocked ?? [])];
  // (le pré n'a pas de clôture : pas besoin de passage autour)
  if (blocked.some((b) => overlap(f, grow(b, b.encl ? Math.max(mine, GAP) : b.id === 'field' ? 0 : mine)))) return { ok: false, reason: 'core' };
  const others = (env.structures ?? []).filter((s) => s.id !== env.ignore);
  for (const s of others) {
    const o = footprintOf(s);
    const ap = apron(s);
    if (ap && overlap(f, ap)) return { ok: false, reason: 'overlap' };
    if (opts.equipment) {
      // Dans un enclos construit : d'accord (ses barrières sont dans colliders).
      if (!isEnclosure(s.type) && overlap(f, o)) return { ok: false, reason: 'overlap' };
      continue;
    }
    if (overlap(f, grow(o, Math.max(mine, isEnclosure(s.type) ? GAP : 0)))) return { ok: false, reason: 'overlap' };
    if (myApron && overlap(myApron, o)) return { ok: false, reason: 'overlap' };
  }
  for (const c of env.colliders ?? []) {
    if (overlap(f, grow(c, mine)) || (myApron && overlap(myApron, c))) return { ok: false, reason: 'overlap' };
  }
  const pts = samples(f);
  if (env.isWater && pts.some((p) => env.isWater(p.x, p.z))) return { ok: false, reason: 'water' };
  if (env.heightAt && opts.slope) {
    const hs = pts.map((p) => env.heightAt(p.x, p.z));
    if (Math.max(...hs) - Math.min(...hs) > opts.slope) return { ok: false, reason: 'slope' };
  }
  return { ok: true };
}

// ---------------------------------------------------------------- déplacer (payant en mode gestion)

/** Prix d'un déménagement : petit en mode gestion, gratuit en bac à sable. */
export const MOVE_FEE = { decor: 5, equipment: 10, structure: 25, core: 40 };

export function moveFeeFor(kind, type = null) {
  if (kind === 'structure' && type && STRUCTURES[type]?.cat === 'decor') return MOVE_FEE.decor;
  return MOVE_FEE[kind] ?? 0;
}

/** Payer le déménagement. */
export function payMove(profile, kind, type = null) {
  return spend(profile, moveFeeFor(kind, type));
}

/** Déplacer une installation de base. */
export function moveCore(profile, place, id, x, z) {
  if (!payMove(profile, 'core')) return { ok: false, reason: 'money' };
  profile.coreLayout = profile.coreLayout ?? {};
  const layout = profile.coreLayout[place] ?? {};
  // Il garde sa taille (s'il a été agrandi). Le joueur a choisi sa place : plus d'agrandissement automatique.
  const { grow, ...rest } = layout[id] ?? {};
  profile.coreLayout[place] = { ...layout, [id]: { ...rest, x: snap(x), z: snap(z) } };
  return { ok: true };
}

/** Déplacer un équipement. */
export function moveEquipment(profile, eq, x, z) {
  if (!payMove(profile, 'equipment')) return { ok: false, reason: 'money' };
  eq.pos = [snap(x), snap(z)];
  return { ok: true };
}

// ---------------------------------------------------------------- achats

export const structuresAt = (profile, place) => (profile.structures ?? []).filter((s) => s.place === place);
export const findStructure = (profile, id) => (profile.structures ?? []).find((s) => s.id === id) ?? null;

/** Structure dont l'emprise contient (x, z), ou null. */
export function structureAtPoint(profile, place, x, z, margin = 0.3) {
  return structuresAt(profile, place).find((s) => {
    const f = footprintOf(s);
    return insideRect({ ...f, hw: f.hw + margin, hd: f.hd + margin }, x, z);
  }) ?? null;
}

/** Peut-on acheter ce type ? (niveau et argent) */
export function canBuild(profile, type) {
  const def = STRUCTURES[type];
  if (!def) return { ok: false, reason: 'unknown' };
  if (UNLOCKS[type] && !isUnlocked(profile, type)) return { ok: false, reason: 'locked', level: UNLOCKS[type] };
  if (profile.mode !== 'sandbox' && profile.money < def.price) return { ok: false, reason: 'money' };
  return { ok: true };
}

/** Construit (après validatePlacement). Renvoie { ok, structure } ou { ok: false, reason }. */
export function build(profile, type, place, x, z, rot = 0) {
  const check = canBuild(profile, type);
  if (!check.ok) return check;
  if (!spend(profile, STRUCTURES[type].price)) return { ok: false, reason: 'money' };
  profile.structures = profile.structures ?? [];
  const s = { id: uid(), type, place, x: snap(x), z: snap(z), rot: normRot(rot) };
  profile.structures.push(s);
  return { ok: true, structure: s };
}

/** Déplacer : petit prix en mode gestion (gratuit en bac à sable). */
export function moveStructure(profile, id, x, z, rot) {
  const s = findStructure(profile, id);
  if (!s) return { ok: false, reason: 'unknown' };
  if (!payMove(profile, 'structure', s.type)) return { ok: false, reason: 'money' };
  s.x = snap(x);
  s.z = snap(z);
  s.rot = normRot(rot);
  return { ok: true, structure: s };
}

/** Démolir : on récupère la moitié du prix (mode gestion) et les habitants retrouvent leur place habituelle. */
export function demolish(profile, id) {
  const s = findStructure(profile, id);
  if (!s) return { ok: false, reason: 'unknown' };
  profile.structures = profile.structures.filter((x) => x.id !== id);
  const freed = [];
  for (const a of profile.animals) {
    if (a.homeId === id) {
      delete a.homeId;
      freed.push(a);
    }
  }
  const refund = profile.mode === 'sandbox' ? 0 : refundOf(s.type, sizeOf(s));
  earn(profile, refund);
  return { ok: true, refund, freed };
}

// ---------------------------------------------------------------- habitants

export const residents = (profile, sid) => profile.animals.filter((a) => a.homeId === sid);

export const accepts = (type, species) => (STRUCTURES[type].species ?? []).includes(species);

/** L'animal peut-il habiter ici ? reason : 'species' | 'full' | 'place' | 'already' */
export function canAssign(profile, a, s) {
  if (!accepts(s.type, a.species)) return { ok: false, reason: 'species' };
  if (a.location !== s.place) return { ok: false, reason: 'place' };
  if (a.homeId === s.id) return { ok: false, reason: 'already' };
  if (residents(profile, s.id).length >= capacityOf(s)) return { ok: false, reason: 'full' };
  return { ok: true };
}

export function assign(profile, a, s) {
  const r = canAssign(profile, a, s);
  if (!r.ok) return r;
  a.homeId = s.id;
  return { ok: true };
}

export function unassign(a) {
  delete a.homeId;
}

/** La maison de l'animal ici, ou null (structure démolie ou dans un autre lieu). */
export function homeOf(profile, a) {
  if (!a.homeId) return null;
  const s = findStructure(profile, a.homeId);
  return s && s.place === a.location ? s : null;
}

/** Énergie en plus quand l'animal dort chez lui (niche, box, abri…). */
export function comfortBonus(type, hours) {
  return { energy: (STRUCTURES[type]?.comfort ?? 0) * hours };
}

/** Applique le confort aux animaux qui dorment à la maison. restingAtHome(a, s) dit s'ils y sont. */
export function applyComfort(profile, animals, hours, restingAtHome) {
  let n = 0;
  for (const a of animals) {
    const s = homeOf(profile, a);
    if (!s || !restingAtHome(a, s)) continue;
    const b = comfortBonus(s.type, hours);
    a.needs.energy = Math.min(100, a.needs.energy + b.energy);
    n++;
  }
  return n;
}

/** Groupes d'espèces pour le résumé des places. */
export const SPACE_GROUPS = { horse: ['horse'], livestock: LIVESTOCK, dog: ['dog'], rabbit: ['rabbit'] };

/**
 * Places disponibles dans un lieu, par groupe : { horse: { used, cap }, livestock: …, dog: …, rabbit: … }.
 * Une structure qui accepte plusieurs groupes (ranch, grange, pré, abri) compte pour chacun d'eux.
 */
export function spaceSummary(profile, place) {
  const out = {};
  const list = structuresAt(profile, place);
  for (const [group, species] of Object.entries(SPACE_GROUPS)) {
    let cap = 0;
    let used = 0;
    for (const s of list) {
      if (!species.some((sp) => accepts(s.type, sp))) continue;
      cap += capacityOf(s);
      used += residents(profile, s.id).filter((a) => species.includes(a.species)).length;
    }
    out[group] = { used, cap };
  }
  return out;
}

// Agrandir et réduire les enclos : le paddock, la bergerie et l'enclos des lapins (installations de base),
// et les enclos construits (paddocks, pré, carrière, ranch). On tire sur leurs poignées dans la vue
// construction (src/game/ConstructionView.js) ; ici, la logique pure : tailles permises, validation,
// prix (ou remboursement), places pour les animaux, rallonge de l'écurie et migration des anciennes
// sauvegardes. Testé dans tests/resize.test.js.
//
// Attention : profile.js importe ce fichier (migration). Il ne doit rien lire des autres modules au
// chargement, seulement dans les fonctions (imports circulaires).

import {
  STRUCTURES, CORE_ITEMS, RESIZABLE_CORE, BOUNDS, GAP, REFUND, APRON_DEPTH, coreRect, coreRects, coreSize,
  footprintOf, apron, structuresAt, findStructure, residents, capacityOf, rectsOverlap, sampleRect, grow,
  EQUIP_SIZE, normRot, frontSide, SPACE_GROUPS,
} from './construction.js';
import { spend, earn, isSandbox } from './profile.js';
import { CORE_SPECIES, coreShown } from './species.js';
import {
  ensureFacilities, stableExt, stableRect, tackRoomPos, TACKROOM_SIZE, petHousePos, PETHOUSE_SIZE, canExtendStable,
} from './facilities.js';

/**
 * Tailles permises (mètres) : w × d dans le repère de l'objet. Enclos construits : la porte est sur un
 * côté de longueur w. Installations de base : w suit x et d suit z (elles ne tournent pas).
 * m2 : prix d'un m² en plus (installations de base ; les enclos construits suivent leur prix du catalogue),
 * gap : passage à garder autour, perAnimal : m² par animal (places des installations de base).
 */
const LIMITS = {
  paddock: { min: [12, 14], max: [40, 48], m2: 2, gap: 2.5, perAnimal: 60 },
  pen: { min: [12, 8], max: [44, 36], m2: 2, gap: 2.5, perAnimal: 24 },
  hutch: { min: [4, 4], max: [12, 10], m2: 6, gap: 1, perAnimal: 5 },
  paddockSmall: { min: [8, 8], max: [30, 30] },
  paddockLarge: { min: [12, 10], max: [40, 36] },
  pasture: { min: [12, 10], max: [44, 40] },
  arena: { min: [14, 20], max: [32, 44] },
  ranch: { min: [24, 18], max: [46, 40] },
};

/** Ce type (installation de base ou construction) s'agrandit-il ? */
export const canResize = (kind) => !!LIMITS[kind];

/** Limites d'un type : { min: [w, d], max: [w, d], m2, gap }. */
export function resizeLimits(kind) {
  const l = LIMITS[kind];
  if (!l) return null;
  if (CORE_ITEMS[kind]) return l;
  const def = STRUCTURES[kind];
  return { ...l, m2: def.price / (def.w * def.d), gap: GAP };
}

/** Les mêmes limites dans le repère du monde (largeur le long de x, profondeur le long de z). */
export function worldLimits(kind, rot = 0) {
  const l = resizeLimits(kind);
  if (!l || normRot(rot) % 2 === 0) return l;
  return { ...l, min: [l.min[1], l.min[0]], max: [l.max[1], l.max[0]] };
}

const round2 = (v) => Math.round(v * 100) / 100;

/** Taille de l'objet (w × d dans son repère) pour un rectangle du monde. */
export function localSize(rect, rot = 0) {
  const swap = normRot(rot) % 2 === 1;
  return { w: round2((swap ? rect.hd : rect.hw) * 2), d: round2((swap ? rect.hw : rect.hd) * 2) };
}

export const edgesOf = (r) => ({ x0: r.x - r.hw, x1: r.x + r.hw, z0: r.z - r.hd, z1: r.z + r.hd });
export const rectOf = (e) => ({ x: round2((e.x0 + e.x1) / 2), z: round2((e.z0 + e.z1) / 2), hw: round2((e.x1 - e.x0) / 2), hd: round2((e.z1 - e.z0) / 2) });
export const areaOf = (r) => 4 * r.hw * r.hd;
export const sameRect = (a, b) => Math.abs(a.x - b.x) < 1e-6 && Math.abs(a.z - b.z) < 1e-6 && Math.abs(a.hw - b.hw) < 1e-6 && Math.abs(a.hd - b.hd) < 1e-6;

/** Les poignées : quatre bords (n = côté +z, e = côté +x…) et quatre coins. */
export const HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

/**
 * Tirer une poignée. (px, pz) : où le joueur amène ce bord (au sol). Les bords tirés bougent au mètre
 * près, les autres restent en place ; la taille reste entre lim.min et lim.max (worldLimits).
 */
export function dragRect(start, handle, px, pz, lim) {
  const e = edgesOf(start);
  const [minW, minD] = lim.min;
  const [maxW, maxD] = lim.max;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  if (handle.includes('e')) e.x1 = clamp(e.x1 + Math.round(px - e.x1), e.x0 + minW, e.x0 + maxW);
  if (handle.includes('w')) e.x0 = clamp(e.x0 + Math.round(px - e.x0), e.x1 - maxW, e.x1 - minW);
  if (handle.includes('n')) e.z1 = clamp(e.z1 + Math.round(pz - e.z1), e.z0 + minD, e.z0 + maxD);
  if (handle.includes('s')) e.z0 = clamp(e.z0 + Math.round(pz - e.z0), e.z1 - maxD, e.z1 - minD);
  return rectOf(e);
}

/** Parties du nouveau rectangle qui débordent de l'ancien, avec le côté vers lequel elles poussent. */
export function addedStrips(old, nu) {
  const a = edgesOf(old);
  const b = edgesOf(nu);
  const out = [];
  const push = (x0, x1, z0, z1, dir) => {
    if (x1 - x0 > 1e-6 && z1 - z0 > 1e-6) out.push({ ...rectOf({ x0, x1, z0, z1 }), dir });
  };
  push(Math.max(a.x1, b.x0), b.x1, b.z0, b.z1, 'e');
  push(b.x0, Math.min(a.x0, b.x1), b.z0, b.z1, 'w');
  const ix0 = Math.max(a.x0, b.x0);
  const ix1 = Math.min(a.x1, b.x1);
  push(ix0, ix1, Math.max(a.z1, b.z0), b.z1, 'n');
  push(ix0, ix1, b.z0, Math.min(a.z0, b.z1), 's');
  return out;
}

/** Bande agrandie de m mètres vers l'extérieur seulement (le passage à garder devant). */
function outward(strip, m) {
  const e = edgesOf(strip);
  if (strip.dir === 'e') e.x1 += m;
  if (strip.dir === 'w') e.x0 -= m;
  if (strip.dir === 'n') e.z1 += m;
  if (strip.dir === 's') e.z0 -= m;
  return rectOf(e);
}

/** Espace libre devant la porte, qui reste au milieu de son côté. gate : { side, width }. */
export function gateApron(r, gate, depth = 1.75) {
  const wide = Math.max(1.5, gate.width / 2 + 0.5);
  switch (gate.side) {
    case '+x': return { x: r.x + r.hw + depth, z: r.z, hw: depth, hd: wide };
    case '-x': return { x: r.x - r.hw - depth, z: r.z, hw: depth, hd: wide };
    case '-z': return { x: r.x, z: r.z - r.hd - depth, hw: wide, hd: depth };
    default: return { x: r.x, z: r.z + r.hd + depth, hw: wide, hd: depth };
  }
}

/** Places pour les animaux selon la taille (w × d dans le repère de l'objet). */
export function capacityFor(kind, w, d) {
  if (CORE_ITEMS[kind]) return Math.max(1, Math.floor((w * d) / LIMITS[kind].perAnimal));
  return capacityOf({ type: kind, w, d });
}

/**
 * Ce qu'il faut savoir pour redimensionner une installation de base. free : sa place par défaut,
 * qu'on sait bonne : on peut toujours y revenir après avoir réduit (même si un bâtiment la touche presque).
 * residents : animaux qui y vivent (coreResidents) : on ne la réduit pas au point de ne plus les loger.
 */
export function coreResizeOpts(id, residents = 0) {
  return { kind: id, coreId: id, rot: 0, gate: CORE_ITEMS[id].gate, apronDepth: APRON_DEPTH[id], free: coreRect(null, id), residents };
}

/**
 * Animaux qui vivent dans une installation de base de ce lieu (sans maison construite) : les chevaux au
 * paddock, le troupeau à la bergerie (pas ceux du pré), les lapins au clapier.
 */
export function coreResidents(profile, place, id) {
  const here = (profile.animals ?? []).filter((a) => a.location === place && !a.homeId);
  if (id === 'paddock') return here.filter((a) => a.species === 'horse').length;
  if (id === 'hutch') return here.filter((a) => a.species === 'rabbit').length;
  if (id === 'pen') return here.filter((a) => SPACE_GROUPS.livestock.includes(a.species) && a.zone !== 'field').length;
  return 0;
}

const within = (r, f) => !!f && r.x - r.hw >= f.x - f.hw - 1e-6 && r.x + r.hw <= f.x + f.hw + 1e-6
  && r.z - r.hd >= f.z - f.hd - 1e-6 && r.z + r.hd <= f.z + f.hd + 1e-6;

/** … ou une construction du joueur (ses habitants doivent garder leur place). */
export function structureResizeOpts(profile, s) {
  return {
    kind: s.type, structureId: s.id, rot: s.rot, gate: { side: frontSide(s.rot), width: STRUCTURES[s.type].gate ?? 2 },
    apronDepth: 1.75, residents: residents(profile, s.id).length,
  };
}

/**
 * Peut-on donner le rectangle nu à cet enclos (il occupait old) ?
 * opts : coreResizeOpts / structureResizeOpts.
 * env (comme validatePlacement) : structures, colliders (sans les barrières de l'enclos lui-même),
 *   blocked (portes des bâtiments), core (installations de base du lieu), equipment ([{ x, z }]),
 *   isWater(x, z), heightAt(x, z).
 * Seule la partie ajoutée doit être libre, avec un passage autour : un enclos déjà serré contre un
 * bâtiment peut quand même grandir de l'autre côté (et ce qui le touchait déjà ne compte pas).
 * La porte reste au milieu de son côté : l'espace devant elle doit être libre.
 * reason : 'tooSmall' | 'tooBig' | 'bounds' | 'crowded' | 'core' | 'door' | 'overlap' | 'water' | 'slope'.
 */
export function validateResize(old, nu, opts, env = {}) {
  const lim = worldLimits(opts.kind, opts.rot ?? 0);
  if (!lim) return { ok: false, reason: 'unknown' };
  const W = nu.hw * 2;
  const D = nu.hd * 2;
  if (W < lim.min[0] - 1e-6 || D < lim.min[1] - 1e-6) return { ok: false, reason: 'tooSmall' };
  if (W > lim.max[0] + 1e-6 || D > lim.max[1] + 1e-6) return { ok: false, reason: 'tooBig' };
  if (Math.abs(nu.x) + nu.hw > BOUNDS || Math.abs(nu.z) + nu.hd > BOUNDS) return { ok: false, reason: 'bounds' };
  if (opts.residents) {
    // Trop petit pour ses habitants : refusé si on réduit (agrandir un enclos déjà plein reste permis).
    const cap = (r) => {
      const { w, d } = localSize(r, opts.rot);
      return capacityFor(opts.kind, w, d);
    };
    const n = cap(nu);
    if (n < opts.residents && n < cap(old)) return { ok: false, reason: 'crowded', n: opts.residents };
  }
  const strips = addedStrips(old, nu);
  // (dans sa place par défaut, pas besoin de passage en plus : on ne vérifie que ce qu'on touche vraiment)
  const zones = strips.map((s) => ({ raw: s, wide: within(s, opts.free) ? s : outward(s, lim.gap) }));
  const ap = gateApron(nu, opts.gate, opts.apronDepth);
  zones.push({ raw: ap, wide: ap, apron: true });
  // Ce qui chevauchait déjà l'enclos (un ancien voisin trop proche) ne l'empêche pas de grandir ailleurs.
  const fresh = (r) => !rectsOverlap(old, r);
  const core = coreRects(env.core).filter((b) => b.id !== opts.coreId && fresh(b));
  const blocked = (env.blocked ?? []).filter(fresh);
  const others = (env.structures ?? []).filter((s) => s.id !== opts.structureId);
  const colliders = (env.colliders ?? []).filter(fresh);
  const equipment = (env.equipment ?? []).map((q) => ({ x: q.x, z: q.z, hw: EQUIP_SIZE / 2, hd: EQUIP_SIZE / 2 })).filter(fresh);
  for (const z of zones) {
    for (const b of core) {
      if (b.id === 'field') {
        // Le pré n'a pas de clôture : on ne marche pas dessus, mais une porte peut s'ouvrir vers lui.
        if (!z.apron && rectsOverlap(z.raw, b)) return { ok: false, reason: 'core' };
        continue;
      }
      if (b.gate && z.apron) continue; // deux entrées peuvent se faire face
      if (rectsOverlap(z.wide, b)) return { ok: false, reason: b.gate ? 'door' : 'core' };
    }
    if (blocked.some((b) => rectsOverlap(z.raw, grow(b, 0.5)))) return { ok: false, reason: 'door' };
    for (const s of others) {
      const ap2 = apron(s);
      if (ap2 && !z.apron && fresh(ap2) && rectsOverlap(z.raw, ap2)) return { ok: false, reason: 'door' };
      const o = footprintOf(s);
      if (fresh(o) && rectsOverlap(z.wide, o)) return { ok: false, reason: 'overlap' };
    }
    if (colliders.some((c) => rectsOverlap(z.wide, c))) return { ok: false, reason: 'overlap' };
    if (equipment.some((q) => rectsOverlap(z.raw, q))) return { ok: false, reason: 'overlap' };
  }
  if (env.isWater && strips.some((s) => sampleRect(s).some((p) => env.isWater(p.x, p.z)))) return { ok: false, reason: 'water' };
  if (env.heightAt && strips.length) {
    const spread = (r) => {
      const hs = sampleRect(r).map((p) => env.heightAt(p.x, p.z));
      return Math.max(...hs) - Math.min(...hs);
    };
    if (spread(nu) > Math.max(3, spread(old) + 0.01)) return { ok: false, reason: 'slope' };
  }
  return { ok: true };
}

/**
 * Prix d'un changement de taille : la surface ajoutée se paie, la surface rendue est remboursée à moitié.
 * Une installation de base a sa taille de départ offerte : on ne paie que ce qui la dépasse, et réduire ne
 * rembourse que ce qui la dépassait (réduire le paddock offert ne rapporte rien, et le ramener à sa taille
 * de départ ne coûte rien).
 */
export function resizeCost(profile, kind, old, nu) {
  const l = resizeLimits(kind);
  const delta = round2(areaOf(nu) - areaOf(old));
  if (isSandbox(profile) || Math.abs(delta) < 1e-6) return { cost: 0, refund: 0, delta };
  const free = CORE_ITEMS[kind] ? CORE_ITEMS[kind].w * CORE_ITEMS[kind].d : 0;
  const paid = round2(Math.max(areaOf(nu), free) - Math.max(areaOf(old), free));
  if (paid > 0) return { cost: Math.ceil(paid * l.m2), refund: 0, delta };
  return { cost: 0, refund: paid < 0 ? Math.floor(-paid * l.m2 * REFUND) : 0, delta };
}

/** Agrandit (ou réduit) une installation de base de ce lieu : rect = nouveau rectangle (déjà validé). */
export function resizeCore(profile, place, id, rect) {
  // (clapier ou bergerie qui ne sert pas encore : ses espèces ne sont pas proposées, src/sim/species.js)
  if (CORE_SPECIES[id] && !coreShown(profile, id)) return { ok: false, reason: 'soon' };
  profile.coreLayout = profile.coreLayout ?? {};
  const layout = profile.coreLayout[place] ?? {};
  const c = resizeCost(profile, id, coreRect(layout, id), rect);
  if (c.cost && !spend(profile, c.cost)) return { ok: false, reason: 'money' };
  earn(profile, c.refund);
  const { grow: _g, ...rest } = layout[id] ?? {};
  const { w, d } = localSize(rect, 0);
  profile.coreLayout[place] = { ...layout, [id]: { ...rest, x: rect.x, z: rect.z, w, d } };
  return { ok: true, ...c };
}

/** Agrandit (ou réduit) un enclos construit : sa position et sa taille changent, ses habitants restent. */
export function resizeStructure(profile, id, rect) {
  const s = findStructure(profile, id);
  if (!s || !canResize(s.type)) return { ok: false, reason: 'unknown' };
  const { w, d } = localSize(rect, s.rot);
  if (capacityFor(s.type, w, d) < residents(profile, id).length) return { ok: false, reason: 'crowded' };
  const c = resizeCost(profile, s.type, footprintOf(s), rect);
  if (c.cost && !spend(profile, c.cost)) return { ok: false, reason: 'money' };
  earn(profile, c.refund);
  Object.assign(s, { x: rect.x, z: rect.z, w, d });
  return { ok: true, structure: s, ...c };
}

// ---------------------------------------------------------------- l'écurie

/** Largeur du passage à garder devant la façade de l'écurie (côté cour, +x) le long de la partie ajoutée. */
export const STABLE_FRONT_PASSAGE = 2.5;

/**
 * Peut-on rallonger l'écurie ? La partie ajoutée (au sud), un passage devant sa façade, et les nouvelles
 * places de la sellerie et de la maison des animaux (avec leurs portes) doivent être libres.
 * env : structures, core, equipment, colliders et blocked du monde (sans les murs de l'écurie, ni la
 * sellerie, ni la maison des animaux et leurs portes, qui vont bouger).
 */
export function validateStableExtension(profile, env = {}) {
  const check = canExtendStable(profile);
  if (!check.ok) return check;
  const ext = stableExt(ensureFacilities(profile));
  const old = stableRect(ext);
  const nu = stableRect(ext + 1);
  const tp = tackRoomPos(ext + 1);
  const tack = { x: tp.x, z: tp.z, ...TACKROOM_SIZE };
  const door = { x: tp.x + TACKROOM_SIZE.hw + 1.2, z: tp.z, hw: 1.2, hd: 1.5 };
  const ph = petHousePos(ext + 1);
  const pet = { x: ph.x, z: ph.z, ...PETHOUSE_SIZE };
  const petDoor = { x: ph.door.x, z: ph.door.z, hw: 1.5, hd: 1.2 };
  // Devant la façade, tout le long de la partie ajoutée : on doit pouvoir longer l'écurie.
  const added = edgesOf(addedStrips(old, nu)[0] ?? nu);
  const front = rectOf({ x0: nu.x + nu.hw, x1: nu.x + nu.hw + STABLE_FRONT_PASSAGE, z0: added.z0, z1: added.z1 });
  const zones = [...addedStrips(old, nu).map((s) => outward(s, 1)), front, grow(tack, 1), door, grow(pet, 1), petDoor];
  const core = coreRects(env.core).filter((b) => b.id !== 'yard' && b.id !== 'field');
  for (const z of zones) {
    if (core.some((b) => rectsOverlap(z, b))) return { ok: false, reason: 'core' };
    if ((env.blocked ?? []).some((b) => rectsOverlap(z, b))) return { ok: false, reason: 'door' };
    for (const s of env.structures ?? []) {
      const ap = apron(s);
      if (rectsOverlap(z, footprintOf(s)) || (ap && rectsOverlap(z, ap))) return { ok: false, reason: 'overlap' };
    }
    if ((env.colliders ?? []).some((c) => rectsOverlap(z, c))) return { ok: false, reason: 'overlap' };
    if ((env.equipment ?? []).some((q) => rectsOverlap(z, { x: q.x, z: q.z, hw: EQUIP_SIZE / 2, hd: EQUIP_SIZE / 2 }))) return { ok: false, reason: 'overlap' };
  }
  return check;
}

// ---------------------------------------------------------------- anciennes sauvegardes

/** Version des installations de base dans le profil (2 : tailles par lieu, paddock de 22 × 26 m…). */
export const CORE_VERSION = 2;

const legacyRect = (id) => {
  const l = CORE_ITEMS[id].legacy;
  return { x: l.x, z: l.z, hw: l.w / 2, hd: l.d / 2 };
};

/**
 * Anciennes sauvegardes (avant les tailles) : on agrandit sans rien casser.
 * - Installation jamais déplacée : elle prend la nouvelle taille par défaut, sauf si une construction
 *   du joueur, un équipement qu'il a posé ou une autre installation gêne : elle garde alors son ancienne
 *   taille, à son ancienne place.
 * - Installation déplacée : elle garde sa place (le décalage enregistré) et son ancienne taille.
 * Dans ces deux cas elle est marquée grow : au chargement du lieu, le jeu essaie de l'agrandir avec
 * tout le monde 3D sous les yeux (growthCandidates puis validateResize, voir Structures.growPending).
 * Ne fait rien pour un profil déjà à jour. Renvoie le profil.
 */
export function migrateCoreSizes(profile) {
  if ((profile.coreVersion ?? 1) >= CORE_VERSION) return profile;
  const places = new Set([
    ...Object.keys(profile.coreLayout ?? {}),
    ...(profile.structures ?? []).map((s) => s.place),
    ...(profile.equipment ?? []).filter((e) => e.pos).map((e) => e.place),
  ]);
  for (const place of places) {
    const layout = { ...(profile.coreLayout?.[place] ?? {}) };
    let changed = false;
    for (const id of RESIZABLE_CORE) {
      const cur = layout[id];
      if (cur?.w !== undefined) continue;
      const lg = CORE_ITEMS[id].legacy;
      if (!cur) {
        const env = {
          core: layout,
          structures: structuresAt(profile, place),
          equipment: (profile.equipment ?? []).filter((e) => e.place === place && e.pos).map((e) => ({ x: e.pos[0], z: e.pos[1] })),
        };
        if (validateResize(legacyRect(id), coreRect(null, id), { ...coreResizeOpts(id), free: null }, env).ok) continue; // (avec un passage partout)
      }
      const at = cur ?? lg;
      layout[id] = { ...(cur ?? {}), x: at.x, z: at.z, w: lg.w, d: lg.d, grow: true };
      changed = true;
    }
    if (changed) {
      profile.coreLayout = profile.coreLayout ?? {};
      profile.coreLayout[place] = layout;
    }
  }
  profile.coreVersion = CORE_VERSION;
  return profile;
}

/**
 * Où essayer d'agrandir une installation marquée grow : la taille par défaut, puis à mi-chemin,
 * en gardant tour à tour le centre ou un bord de l'ancien rectangle (dans cet ordre).
 */
export function growthCandidates(layout, id) {
  const old = coreRect(layout, id);
  const def = CORE_ITEMS[id];
  const e = edgesOf(old);
  const cur = coreSize(layout, id);
  const mid = { w: Math.round((cur.w + def.w) / 2), d: Math.round((cur.d + def.d) / 2) };
  const out = [];
  for (const s of [{ w: def.w, d: def.d }, mid]) {
    if (s.w <= cur.w && s.d <= cur.d) continue;
    const w = Math.max(s.w, cur.w);
    const d = Math.max(s.d, cur.d);
    const xs = [old.x, e.x0 + w / 2, e.x1 - w / 2];
    const zs = [old.z, e.z0 + d / 2, e.z1 - d / 2];
    for (const z of zs) for (const x of xs) out.push(rectOf({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 }));
  }
  return out;
}

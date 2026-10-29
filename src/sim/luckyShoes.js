// 🍀 Le fer porte-bonheur du jour : chaque vrai jour, un vieux fer à cheval brille au bord du chemin de balade de la
// ferme (src/sim/activities.js TRAIL). On le ramasse à cheval en passant à côté ; il est cloué sur la porte du box du
// cheval qu'on montait. 7 vrais fers à collectionner, un nouveau chaque jour : de devant (rond), de derrière (plus
// pointu), de poney, de cheval de trait, à crampons, en œuf, en aluminium. Les 7 : des pièces, un peu de lien, un
// souvenir ; ensuite, le fer du jour rapporte quelques pièces.
// Logique pure (tests/luckyShoes.test.js) ; le jeu : src/game/LuckyShoes.js ; les textes : src/ui/luckyShoesTexts.js.
//
// Dans le profil (sauvegardé) : profile.luckyShoes = { last (le jour du dernier fer ramassé, 'AAAA-MM-JJ'),
// kinds: [les fers trouvés], byHorse: { id du cheval: [ses fers, sur la porte de son box] } }.

import { TRAIL } from './activities.js';
import { logSpots } from './freeJumps.js';
import { pumpkinSpots } from './halloween.js';
import { seeded } from './rng.js';

export const LUCKY = {
  reach: 2.5, // (on passe à côté, à cheval : il est ramassé)
  side: 1.4, // (au bord du chemin, à gauche : les citrouilles sont à droite)
  clear: 5, // (loin des troncs et des citrouilles)
  coins: 50, // (les 7 fers, en gestion)
  daily: 5, // (ensuite, chaque fer du jour)
  bond: 3,
};

export const SHOE_KINDS = ['front', 'hind', 'pony', 'draft', 'studs', 'eggbar', 'alu'];

/**
 * Leur forme pour le jeu (src/game/LuckyShoes.js) : s, la taille ; sx, sz, la largeur et la longueur (pince-talons) ;
 * toe, la pince plus pointue ; studs, deux crampons aux talons ; closed, fermé derrière ; metal 'alu', plus clair.
 */
export const SHOE_SHAPES = {
  front: { s: 1 },
  hind: { s: 1, sx: 0.88, sz: 1.12, toe: 0.22 },
  pony: { s: 0.6 },
  draft: { s: 1.6 },
  studs: { s: 1, studs: true },
  eggbar: { s: 1, closed: true, sx: 0.92, sz: 1.1 },
  alu: { s: 0.95, metal: 'alu' },
};

/** Le jour (date de l'appareil, comme pour Halloween) : 'AAAA-MM-JJ'. */
export function dayKey(date = new Date()) {
  const p2 = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p2(date.getMonth() + 1)}-${p2(date.getDate())}`;
}

/**
 * Les places possibles : à 25 % et à 80 % de chaque tronçon du chemin, au bord, à gauche du sens de la balade ; pas
 * trop près d'un tronc à sauter ni d'une citrouille d'Halloween. [{ x, z, cx, cz (le point du chemin) }].
 */
export function shoeSpots(trail = TRAIL) {
  const pts = [trail.start, ...trail.checkpoints];
  const away = [...logSpots(trail), ...pumpkinSpots(trail)];
  const out = [];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    // (à gauche du sens de marche : (-dz, dx))
    const lx = -(b.z - a.z) / len;
    const lz = (b.x - a.x) / len;
    for (const k of [0.25, 0.8]) {
      const cx = a.x + (b.x - a.x) * k;
      const cz = a.z + (b.z - a.z) * k;
      const s = { x: cx + lx * LUCKY.side, z: cz + lz * LUCKY.side, cx, cz };
      if (away.every((o) => Math.hypot(o.x - s.x, o.z - s.z) > LUCKY.clear)) out.push(s);
    }
  }
  return out;
}

/** La collection (créée, ou remise d'aplomb). */
export function luckyState(profile) {
  const st = profile.luckyShoes && typeof profile.luckyShoes === 'object' ? profile.luckyShoes : {};
  st.last = typeof st.last === 'string' ? st.last : null;
  st.kinds = Array.isArray(st.kinds) ? st.kinds.filter((k, i, all) => SHOE_KINDS.includes(k) && all.indexOf(k) === i) : [];
  st.byHorse = st.byHorse && typeof st.byHorse === 'object' ? st.byHorse : {};
  profile.luckyShoes = st;
  return st;
}

/**
 * Le fer du jour : { key, spot, kind } (toujours le même ce jour-là), ou null s'il est déjà ramassé. Un fer qui
 * manque à la collection ; tous trouvés : n'importe lequel.
 */
export function shoeOfDay(profile, date = new Date()) {
  const st = luckyState(profile);
  const key = dayKey(date);
  if (st.last === key) return null;
  const rng = seeded(`shoe:${key}`);
  const spots = shoeSpots();
  const spot = spots[Math.floor(rng() * spots.length)];
  const missing = SHOE_KINDS.filter((k) => !st.kinds.includes(k));
  const pool = missing.length ? missing : SHOE_KINDS;
  return { key, spot, kind: pool[Math.floor(rng() * pool.length)] };
}

/**
 * Le fer du jour ramassé en montant le cheval horseId : il va sur la porte de son box. Renvoie { kind, isNew, n,
 * total, complete (seulement au 7e), coins (50 au 7e ; 5 ensuite ; sinon 0) }, ou null (déjà ramassé aujourd'hui).
 */
export function findShoe(profile, date = new Date(), horseId = null) {
  const day = shoeOfDay(profile, date);
  if (!day) return null;
  const st = luckyState(profile);
  const done = st.kinds.length >= SHOE_KINDS.length;
  st.last = day.key;
  const isNew = !st.kinds.includes(day.kind);
  if (isNew) st.kinds.push(day.kind);
  if (horseId) {
    const mine = Array.isArray(st.byHorse[horseId]) ? st.byHorse[horseId] : (st.byHorse[horseId] = []);
    if (!mine.includes(day.kind)) mine.push(day.kind);
  }
  const n = st.kinds.length;
  const complete = isNew && n === SHOE_KINDS.length;
  return { kind: day.kind, isNew, n, total: SHOE_KINDS.length, complete, coins: complete ? LUCKY.coins : done ? LUCKY.daily : 0 };
}

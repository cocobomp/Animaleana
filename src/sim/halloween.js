// 🎃 Halloween au poney-club : comme dans les vrais clubs fin octobre, la ferme se décore de citrouilles-lanternes,
// et une chasse aux citrouilles se fait à cheval le long du chemin de balade (src/sim/activities.js TRAIL). Toutes
// trouvées : des pièces, un peu de lien avec ton cheval, et le tapis citrouille (sellerie, rayon Tapis : il ne se
// vend pas, il se gagne). Seulement pendant la fête (date réelle : du 24 octobre au 2 novembre).
// Logique pure (tests/halloween.test.js) ; le jeu : src/game/Halloween.js ; les textes : src/ui/halloweenTexts.js.
//
// Dans le profil (sauvegardé) : profile.halloween = { year, found: [ids des citrouilles trouvées], done }.

import { TRAIL } from './activities.js';

export const HALLOWEEN = {
  reach: 2.6, // (on passe à côté, à cheval : elle est trouvée)
  side: 2.4, // (posée au bord du chemin, pas dessus)
  reward: { coins: 50, bond: 3, item: 'padPumpkin' },
};

/** La fête : du 24 octobre au 2 novembre (date réelle). */
export function halloweenOn(date = new Date()) {
  const m = date.getMonth();
  const d = date.getDate();
  return (m === 9 && d >= 24) || (m === 10 && d <= 2);
}

/** L'année de la fête (le 1er novembre 2026 fait partie de la fête 2026). */
export const halloweenYear = (date = new Date()) => date.getFullYear();

/**
 * Les citrouilles de la chasse : une à chaque point du chemin de balade (sauf l'arrivée, à l'écurie), posées au bord
 * du chemin, à droite en allant dans le sens de la balade. [{ id, x, z, n (1…), face (vers où regarde son visage) }].
 */
export function pumpkinSpots(trail = TRAIL) {
  const pts = [trail.start, ...trail.checkpoints];
  const out = [];
  for (let i = 1; i < pts.length - 1; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
    // (à droite du sens de marche : (dz, -dx))
    const rx = (b.z - a.z) / len;
    const rz = -(b.x - a.x) / len;
    // (face : le visage tourné vers le cavalier qui arrive du point d'avant)
    out.push({ id: `pk${i}`, n: i, x: b.x + rx * HALLOWEEN.side, z: b.z + rz * HALLOWEEN.side, cx: b.x, cz: b.z, face: Math.atan2(a.x - b.x, a.z - b.z) });
  }
  return out;
}

/**
 * Le décor de la ferme : des citrouilles-lanternes autour du départ de la balade. Des places possibles, en cercle ; le
 * jeu garde les DECOR_MAX premières qui ne tombent ni dans un bâtiment ni dans l'eau (src/game/Halloween.js).
 */
export const DECOR_MAX = 4;
export function decorSpots(trail = TRAIL) {
  const s = trail.start;
  const out = [];
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const r = 3.2 + (k % 3) * 0.6;
    out.push({ x: s.x + Math.sin(a) * r, z: s.z + Math.cos(a) * r, size: [1.2, 0.8, 1, 0.7][k % 4], face: a + Math.PI });
  }
  return out;
}

/** La chasse de cette année (créée, ou remise à zéro l'année suivante). */
export function huntState(profile, year) {
  const h = profile.halloween;
  if (!h || h.year !== year || !Array.isArray(h.found)) profile.halloween = { year, found: [], done: false };
  return profile.halloween;
}

/**
 * Une citrouille trouvée (id). Renvoie { what: 'found' | 'done' | null (déjà trouvée, ou chasse finie), n (trouvées),
 * total }. 'done' : la dernière ; la récompense se donne une fois (done passe à true).
 */
export function findPumpkin(profile, id, year, total = pumpkinSpots().length) {
  const h = huntState(profile, year);
  if (h.done || h.found.includes(id)) return { what: null, n: h.found.length, total };
  h.found.push(id);
  const n = h.found.length;
  if (n >= total) {
    h.done = true;
    return { what: 'done', n, total };
  }
  return { what: 'found', n, total };
}

/** Pour la fiche et le carnet : { n, total, done } (null hors de la fête). */
export function huntView(profile, date = new Date()) {
  if (!halloweenOn(date)) return null;
  const h = huntState(profile, halloweenYear(date));
  return { n: h.found.length, total: pumpkinSpots().length, done: h.done };
}

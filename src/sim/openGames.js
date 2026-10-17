// Registre des parties ouvertes, partagé entre les onglets du même navigateur (localStorage
// 'animaleana.open') : la synchro (src/cloud/sync.js) ne remplace ni n'efface jamais une partie en train d'être
// jouée, même dans un autre onglet. Chaque onglet note sa partie et la « bat » toutes les ~10 s ; une entrée
// de plus de ~30 s est oubliée (onglet fermé, appli tuée ou gelée en arrière-plan).

const KEY = 'animaleana.open';
export const BEAT_MS = 10 * 1000;
export const FRESH_MS = 30 * 1000;

function storage(s) {
  if (s !== undefined) return s;
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function read(s) {
  try {
    const v = JSON.parse(s?.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

function write(s, v) {
  try {
    if (Object.keys(v).length) s?.setItem(KEY, JSON.stringify(v));
    else s?.removeItem(KEY);
  } catch {
    /* stockage plein : l'onglet compte quand même sa propre partie (src/main.js) */
  }
}

const fresh = (e, now) => e && typeof e.id === 'string' && typeof e.at === 'number' && Math.abs(now - e.at) < FRESH_MS;

/** Cet onglet joue la partie id (à rappeler toutes les BEAT_MS). Les entrées périmées sont nettoyées au passage. */
export function markOpen(tab, id, { storage: st, now = Date.now() } = {}) {
  const s = storage(st);
  const all = read(s);
  for (const [k, e] of Object.entries(all)) if (!fresh(e, now)) delete all[k];
  all[tab] = { id, at: now };
  write(s, all);
}

/** Cet onglet ne joue plus. */
export function markClosed(tab, { storage: st } = {}) {
  const s = storage(st);
  const all = read(s);
  if (!(tab in all)) return;
  delete all[tab];
  write(s, all);
}

/** Les parties ouvertes dans les autres onglets (except : cet onglet, qui compte la sienne lui-même). */
export function openElsewhere({ storage: st, now = Date.now(), except = null } = {}) {
  const ids = new Set();
  for (const [k, e] of Object.entries(read(storage(st)))) if (k !== except && fresh(e, now)) ids.add(e.id);
  return [...ids];
}

/** Un nom d'onglet (au hasard, différent pour chaque onglet ouvert). */
export const newTabId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

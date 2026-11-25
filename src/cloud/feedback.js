// 💌 Les avis des joueurs (fenêtre « Ton avis » : src/ui/feedbackWindow.js). Un petit message (une humeur, une sorte,
// un texte court) part dans la base Firestore du projet (collection « feedback », à Zurich), que le développeur lit
// dans la console Firebase (docs/HEBERGEMENT.md, « Les avis des joueurs »). Règles : firestore.rules.
//
// Rien de personnel : ni prénom, ni identifiant de partie, ni compte (Firebase est chargé SANS la connexion Google,
// dans une appli à part), ni e-mail ; l'adresse IP n'est gardée nulle part par le jeu. Seulement de quoi comprendre le
// message : langue, version du jeu, sorte d'appareil, sens de l'écran, mode, niveau, jour du jeu, lieu et ce qui était
// ouvert. Dans le texte, les adresses e-mail, les numéros de téléphone et les prénoms des profils (le nom entier et
// chacun de ses mots) sont masqués.
//
// Pas d'Internet, règles pas encore publiées, réponse qui ne vient pas : le message est GARDÉ sur l'appareil
// (localStorage, 20 au plus) et renvoyé au prochain démarrage ou quand le réseau revient. Stockage plein ou bloqué :
// gardé en mémoire tant que le jeu est ouvert (renvoyé au retour du réseau ou au prochain avis), et passé dans le
// stockage dès qu'il accepte de nouveau. Jamais d'erreur technique à l'écran. Limites sur l'appareil : 30 s entre
// deux envois, 5 par jour (en mémoire aussi, si le stockage refuse).
//
// Seulement depuis le jeu en ligne (feedbackAvailable) : dans la version « à emporter » (fichier), un message ne
// pourrait jamais partir (son stockage n'est pas celui du site) ; « 💌 Ton avis » n'y est pas proposé.

import { FIREBASE_CONFIG, cloudSupported, emulatorConfig } from './firebase.js';

/** Les humeurs (4 smileys) ; « none » : pas de smiley choisi (il faut alors un texte). */
export const MOODS = ['love', 'happy', 'meh', 'sad'];
export const MOOD_EMOJI = { love: '😍', happy: '🙂', meh: '😐', sad: '😕' };
/** La sorte de message ; « other » quand rien n'est choisi. */
export const KINDS = ['idea', 'bug', 'like', 'other'];
const DEVICES = ['phone', 'tablet', 'computer'];
const MODES = ['sandbox', 'manage', 'none'];

export const MAX_TEXT = 500; // caractères (comme firestore.rules ; la zone de texte s'arrête là)
export const MAX_QUEUE = 20; // messages gardés sur l'appareil en attendant de partir
export const MIN_GAP_MS = 30000; // entre deux envois
export const MAX_PER_DAY = 5;
const SEND_TIMEOUT_MS = 15000; // au-delà, le message est gardé (réseau muet)

/** Les champs d'un avis, exactement ceux que firestore.rules accepte (plus createdAt, l'heure du serveur). */
export const FIELDS = ['text', 'mood', 'kind', 'lang', 'version', 'device', 'orientation', 'mode', 'level', 'day', 'place', 'screen'];

const QUEUE_KEY = 'animaleana.feedback.queue'; // [{ id, at, msg }] : les messages qui attendent de partir
const SENT_KEY = 'animaleana.feedback.sent'; // { day, n, last } : pour les limites
const APP_NAME = 'avis'; // une appli Firebase à part : jamais le compte Google connecté (request.auth reste vide)

// ---------------------------------------------------------------- le message

/** Ce qui ne s'écrit pas : caractères de contrôle, invisibles, changements de sens d'écriture (le zéro-largeur des emojis composés reste). */
const INVISIBLE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B\u200E\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const EMAIL = /[^\s@]+@[^\s@]+\.[^\s@]{2,}/g;
const PHONE = /\+?\d(?:[ .\-/()]{0,2}\d){7,}/g; // 8 chiffres ou plus, avec ou sans séparateurs
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Les petits mots d'un nom qui ne sont pas des prénoms (« Lou de la Tour », « Ma ferme ») : jamais masqués seuls. */
const NOT_NAMES = new Set(['de', 'du', 'des', 'la', 'le', 'les', 'et', 'un', 'une', 'au', 'aux', 'en', 'ma', 'mon', 'mes',
  'ta', 'ton', 'tes', 'sa', 'son', 'ses', 'di', 'da', 'del', 'dos', 'van', 'von', 'der', 'den', 'the', 'an', 'and', 'of', 'my']);

/**
 * Ce qu'on masque pour les noms des profils : chaque nom entier (en NFC, comme le texte : un nom décomposé, venu
 * d'une partie restaurée depuis un Mac par exemple, est reconnu) et chacun de ses mots (découpé sur les espaces,
 * tirets, apostrophes… ; 2 lettres ou plus, sauf les petits mots NOT_NAMES) : « Léa Dupont » masque aussi « Léa » et
 * « Dupont », « Marie-Lou » aussi « marie lou ». Le plus long d'abord.
 */
export function nameParts(names = []) {
  const out = new Set();
  for (const n of names) {
    const name = String(n ?? '').normalize('NFC').replace(INVISIBLE, '').trim().replace(/\s+/g, ' ');
    if (name.length >= 2) out.add(name);
    for (const w of name.split(/[^\p{L}\p{M}]+/u)) if (w.length >= 2 && !NOT_NAMES.has(w.toLowerCase())) out.add(w);
  }
  return [...out].sort((a, b) => b.length - a.length);
}

/**
 * Le texte du joueur, nettoyé : caractères invisibles retirés, espaces et lignes vides resserrés, adresses e-mail,
 * numéros de téléphone et prénoms (names : les noms des profils de l'appareil, entiers et mot à mot : nameParts)
 * masqués, MAX_TEXT caractères au plus.
 */
export function cleanText(raw, { names = [] } = {}) {
  let s = String(raw ?? '').normalize('NFC')
    .replace(/\r\n?|[\u2028\u2029]/g, '\n')
    .replace(INVISIBLE, '')
    .replace(/\t/g, ' ');
  s = s.replace(EMAIL, '[e-mail]').replace(PHONE, '[téléphone]');
  for (const name of nameParts(names)) {
    // (mot entier, sans tenir compte des majuscules ; pas de « lookbehind » : les vieux iPad ne le connaissent pas)
    s = s.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}(?=[^\\p{L}\\p{N}]|$)`, 'giu'), '$1[prénom]');
  }
  s = s.replace(/ {2,}/g, ' ').replace(/ +\n/g, '\n').replace(/\n +/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (s.length > MAX_TEXT) s = s.slice(0, MAX_TEXT).replace(/[\uD800-\uDBFF]$/, '').trimEnd(); // (pas d'emoji coupé en deux)
  return s;
}

/** Téléphone, tablette ou ordinateur (desk : souris ou pavé tactile, voir isDesk de src/ui/dom.js ; coarse : au doigt). */
export function deviceKind({ desk = false, coarse = false, width = 0, height = 0 } = {}) {
  if (desk || !coarse) return 'computer';
  return Math.min(width, height) < 600 ? 'phone' : 'tablet';
}

export const orientationOf = (width, height) => (width > height ? 'landscape' : 'portrait');

/** « 0.5.0+cb4307f » : le numéro de version et le commit, définis au build (vite.config.js) ; « dev » sinon. */
export function appVersion() {
  const v = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
  const c = typeof __APP_COMMIT__ !== 'undefined' ? __APP_COMMIT__ : '';
  return `${v}${c ? `+${c}` : ''}`;
}

const tag = (s, max) => String(s ?? '').replace(/[^A-Za-z0-9:/_ -]/g, '').slice(0, max).trim();
const int = (n, max) => (Number.isFinite(Number(n)) ? Math.min(max, Math.max(0, Math.round(Number(n)))) : 0);
const tryGet = (f, d) => {
  try {
    return f() ?? d;
  } catch {
    return d;
  }
};

/**
 * Ce qui était ouvert : mini-jeu, examen vétérinaire, activité, voyage, vue d'ensemble ou construction, panneau (sa
 * sorte : animal, réglages…), à cheval. Quelques mots séparés par des espaces, 40 caractères au plus.
 */
function screenOf(ui, g) {
  const tags = [];
  if (ui?.minigameOpen) tags.push('minigame');
  if (ui?.vxOpen > 0) tags.push('vet');
  const act = tryGet(() => g.activities?.active?.type, null);
  if (act) tags.push(`activity:${act}`);
  if (tryGet(() => g.tripFlow?.active, false)) tags.push('trip');
  if (tryGet(() => g.mgmt?.construct?.active, false)) tags.push('build');
  else if (tryGet(() => g.mgmt?.active, false)) tags.push('map');
  if (ui?.panel) tags.push(`panel:${ui.panel.kind || 'other'}`);
  if (tryGet(() => g.player?.mount, null)) tags.push('ride');
  let out = '';
  for (const x of tags.map((s) => tag(s, 40))) if (x && `${out} ${x}`.trim().length <= 40) out = `${out} ${x}`.trim();
  return out;
}

/**
 * Le contexte du jeu (sans rien de personnel) : mode, niveau, jour du jeu, lieu (et bâtiment où l'on est), ce qui est
 * ouvert. Hors partie (écran des profils) : mode « none ».
 */
export function gameContext(ui) {
  const g = ui?.game;
  const p = g?.running ? g.profile : null;
  if (!p) return { mode: 'none', level: 0, day: 0, place: '', screen: 'profiles' };
  return {
    mode: p.mode === 'sandbox' ? 'sandbox' : 'manage',
    level: tryGet(() => g.level, 0),
    day: tryGet(() => g.day, 0),
    place: [p.place, tryGet(() => g.interiors?.inside, null)].filter((x) => typeof x === 'string' && x).join('/'),
    screen: screenOf(ui, g),
  };
}

/**
 * Le message à envoyer : input { mood, kind, text } (ce que l'enfant a choisi et écrit), ctx (contexte : langue,
 * version, appareil, sens de l'écran et gameContext). Exactement FIELDS, rien d'autre (ce que ctx aurait en plus est
 * ignoré). null s'il n'y a rien à dire (ni smiley ni texte).
 */
export function buildMessage(input = {}, ctx = {}, { names = [] } = {}) {
  const text = cleanText(input?.text, { names });
  const mood = MOODS.includes(input?.mood) ? input.mood : 'none';
  if (!text && mood === 'none') return null;
  return {
    text,
    mood,
    kind: KINDS.includes(input?.kind) ? input.kind : 'other',
    lang: ctx.lang === 'en' ? 'en' : 'fr',
    version: String(ctx.version ?? '').replace(/[^\w.+-]/g, '').slice(0, 40) || 'dev',
    device: DEVICES.includes(ctx.device) ? ctx.device : 'phone',
    orientation: ctx.orientation === 'landscape' ? 'landscape' : 'portrait',
    mode: MODES.includes(ctx.mode) ? ctx.mode : 'none',
    level: int(ctx.level, 1000),
    day: int(ctx.day, 1000000),
    place: tag(ctx.place, 30),
    screen: tag(ctx.screen, 40),
  };
}

const isInt = (n, max) => Number.isInteger(n) && n >= 0 && n <= max;

/** Un message bien formé (mêmes contrôles que firestore.rules) : sert à relire la file d'attente sans se tromper. */
export function validMessage(m) {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return false;
  const keys = Object.keys(m);
  if (keys.length !== FIELDS.length || !FIELDS.every((k) => keys.includes(k))) return false;
  return typeof m.text === 'string' && m.text.length <= MAX_TEXT
    && [...MOODS, 'none'].includes(m.mood) && (m.text.length > 0 || m.mood !== 'none')
    && KINDS.includes(m.kind) && ['fr', 'en'].includes(m.lang)
    && typeof m.version === 'string' && m.version.length >= 1 && m.version.length <= 40
    && DEVICES.includes(m.device) && ['portrait', 'landscape'].includes(m.orientation) && MODES.includes(m.mode)
    && isInt(m.level, 1000) && isInt(m.day, 1000000)
    && typeof m.place === 'string' && m.place.length <= 30
    && typeof m.screen === 'string' && m.screen.length <= 40;
}

// ---------------------------------------------------------------- sur l'appareil : file d'attente et limites

const store = () => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // (stockage bloqué : l'accès lui-même lève une erreur)
  }
};

function readJson(key) {
  try {
    const s = store()?.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function writeJson(key, value) {
  try {
    const s = store();
    if (!s) return false;
    if (value === null) s.removeItem(key);
    else s.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; // (plein ou bloqué)
  }
}

/** Les messages qui attendent de partir, du plus ancien au plus récent (lecture tolérante : ce qui est abîmé est oublié). */
export function readQueue() {
  const raw = readJson(QUEUE_KEY);
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((it) => it && typeof it === 'object' && typeof it.id === 'string' && it.id.length >= 1 && it.id.length <= 40 && validMessage(it.msg))
    .map((it) => ({ id: it.id, at: Number.isFinite(it.at) ? it.at : 0, msg: it.msg }))
    .slice(-MAX_QUEUE);
}

const writeQueue = (q) => writeJson(QUEUE_KEY, q.length ? q.slice(-MAX_QUEUE) : null);

// Stockage plein ou bloqué (navigation privée, appareil plein) : les messages attendent ici, en mémoire, le temps que
// le jeu est ouvert ; ils passent dans le stockage dès qu'il accepte de nouveau (spill). Et les messages déjà partis
// pendant cette session : jamais renvoyés, même si le stockage refuse de les retirer de la file.
let memQueue = []; // [{ id, at, msg }]
const gone = new Set();

/** Les messages qui attendent de partir : ceux du stockage, puis ceux gardés en mémoire. */
function pendingItems() {
  const q = readQueue();
  const ids = new Set(q.map((it) => it.id));
  return [...q, ...memQueue.filter((it) => !ids.has(it.id))].filter((it) => !gone.has(it.id));
}

/** Nombre de messages gardés (sur l'appareil, ou en mémoire si le stockage refuse), pas encore partis. */
export const pendingFeedback = () => pendingItems().length;

/** Les messages gardés en mémoire passent dans le stockage s'il accepte (ils survivront alors à un redémarrage). */
function spill() {
  if (!memQueue.length || !writeQueue([...readQueue().filter((it) => !gone.has(it.id)), ...memQueue])) return;
  // (relu : seul ce que le stockage rend vraiment est retiré de la mémoire)
  const stored = new Set(readQueue().map((it) => it.id));
  memQueue = memQueue.filter((it) => !stored.has(it.id));
}

/** Un message est parti : retiré de la file (stockage et mémoire). */
function forget(id) {
  gone.add(id);
  memQueue = memQueue.filter((it) => it.id !== id);
  const q = readQueue();
  if (q.some((it) => it.id === id)) writeQueue(q.filter((it) => it.id !== id));
}

let idCount = 0;
const newId = (now) => `${now.toString(36)}-${(idCount++).toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Garde un message (le plus ancien part de la file au-delà de MAX_QUEUE) : dans le stockage, ou en mémoire s'il est
 * plein ou bloqué. Renvoie son id.
 */
export function enqueue(msg, now = Date.now()) {
  const id = newId(now);
  memQueue = [...memQueue, { id, at: now, msg }].slice(-MAX_QUEUE);
  spill();
  return id;
}

/** « 2026-11-25 » : le jour de l'appareil (heure locale), pour la limite par jour. */
export function dayKey(now) {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

let memSent = null; // (le dernier compte noté : les limites tiennent même si le stockage refuse de l'écrire)

function readSent() {
  const s = readJson(SENT_KEY);
  const stored = {
    day: typeof s?.day === 'string' ? s.day : '',
    n: Number.isInteger(s?.n) && s.n > 0 ? s.n : 0,
    last: Number.isFinite(s?.last) ? s.last : 0,
  };
  return memSent && memSent.last > stored.last ? memSent : stored;
}

/** Pourquoi on ne peut pas envoyer maintenant : 'wait' (moins de 30 s depuis le précédent), 'day' (5 aujourd'hui), ou null. */
export function limitReason(now = Date.now()) {
  const s = readSent();
  // (l'heure de l'appareil remise en arrière : pas d'attente sans fin)
  if (s.last && now >= s.last && now - s.last < MIN_GAP_MS) return 'wait';
  if (s.day === dayKey(now) && s.n >= MAX_PER_DAY) return 'day';
  return null;
}

function noteSent(now) {
  const s = readSent();
  const day = dayKey(now);
  memSent = { day, n: s.day === day ? s.n + 1 : 1, last: now };
  writeJson(SENT_KEY, memSent);
}

// ---------------------------------------------------------------- envoi (Firebase chargé à la demande)

/**
 * « 💌 Ton avis » est proposé : seulement depuis le jeu en ligne (une vraie adresse Internet). Dans la version « à
 * emporter », ouverte comme fichier, le message ne partirait jamais (comme le compte Google : cloudCard).
 */
export const feedbackAvailable = (loc = globalThis.location) => cloudSupported(loc);

/**
 * ⏸️ L'interrupteur du bouton « 💌 Ton avis » : EN VEILLE (on: false). Le bouton n'est montré nulle part (⋯ Plus, ⚙️
 * Réglages, écran des profils, Aide) tant que les règles Firestore qui acceptent les avis ne sont pas publiées
 * (docs/HEBERGEMENT.md, « Publier les règles ») : sinon un enfant écrirait des messages qui ne partent jamais. Tout le
 * reste est prêt : publier les règles, puis mettre on: true. (Les avis déjà gardés sur un appareil repartent tout
 * seuls dès que les règles le permettent : startFeedback.)
 */
export const FEEDBACK = { on: false };

/** Le bouton « 💌 Ton avis » est-il montré ? Interrupteur allumé et jeu en ligne (pas la version fichier). */
export const feedbackShown = (loc = globalThis.location) => FEEDBACK.on && feedbackAvailable(loc);

/** On peut essayer d'envoyer : vraie adresse Internet (pas la version fichier) et réseau présent. */
export function canSendNow(loc = globalThis.location, nav = globalThis.navigator) {
  return feedbackAvailable(loc) && nav?.onLine !== false;
}

let ready = null;

/** firebase/app et firebase/firestore seulement (jamais firebase/auth), dans l'appli « avis ». */
function loadDb() {
  if (!ready) {
    ready = Promise.all([import('firebase/app'), import('firebase/firestore')])
      .then(([appMod, fs]) => {
        const app = appMod.getApps().find((a) => a.name === APP_NAME) ?? appMod.initializeApp(FIREBASE_CONFIG, APP_NAME);
        const db = fs.getFirestore(app);
        // Émulateurs (développement seulement), comme src/cloud/firebase.js.
        const emu = import.meta.env?.DEV ? emulatorConfig(tryGet(() => store()?.getItem('animaleana.cloud.emulator'), null)) : null;
        if (emu) {
          try {
            fs.connectFirestoreEmulator(db, emu.host, emu.firestore);
          } catch {
            /* déjà relié */
          }
        }
        return { appMod, app, db, fs };
      })
      .catch((err) => {
        ready = null; // réessayer plus tard
        throw err;
      });
  }
  return ready;
}

/** Écrit un message dans « feedback » (createdAt : l'heure du serveur). Erreur ou délai dépassé : lève une erreur. */
async function sendOne(msg, timeoutMs) {
  const { appMod, app, db, fs } = await loadDb();
  let timer;
  try {
    await Promise.race([
      fs.addDoc(fs.collection(db, 'feedback'), { ...msg, createdAt: fs.serverTimestamp() }),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Object.assign(new Error('timeout'), { code: 'timeout' })), timeoutMs);
      }),
    ]);
  } catch (err) {
    // Pas de réponse : Firebase garderait l'écriture en mémoire et la renverrait tout seul (en double avec la file
    // d'attente). On ferme cette appli : la file d'attente est la seule à renvoyer le message.
    if (err?.code === 'timeout') {
      ready = null;
      Promise.resolve(appMod.deleteApp?.(app)).catch(() => {});
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

let flushing = null;

/**
 * Envoie les messages gardés, du plus ancien au plus récent ; s'arrête au premier refus (hors ligne, règles pas encore
 * publiées…) : les suivants attendent la prochaine fois. Un seul envoi à la fois. Renvoie le nombre de messages partis.
 */
export async function flushFeedback({ timeoutMs = SEND_TIMEOUT_MS } = {}) {
  while (flushing) await flushing;
  flushing = (async () => {
    let n = 0;
    spill(); // (le stockage accepte peut-être de nouveau ce qui attendait en mémoire)
    for (;;) {
      if (!canSendNow()) return n;
      const next = pendingItems()[0];
      if (!next) return n;
      try {
        await sendOne(next.msg, timeoutMs);
      } catch {
        return n; // gardé : prochain démarrage, retour du réseau ou prochain message
      }
      forget(next.id); // (jamais deux fois, même si le stockage refuse de le retirer)
      n++;
    }
  })();
  try {
    return await flushing;
  } finally {
    flushing = null;
  }
}

/**
 * Le joueur envoie son avis. input : { mood, kind, text } ; ctx : le contexte (voir buildMessage) ; names : les prénoms
 * à masquer dans le texte. Renvoie 'sent' (parti), 'kept' (vraiment gardé : sur l'appareil, ou en mémoire si le
 * stockage refuse ; il partira plus tard), 'empty' (rien à envoyer), 'wait' (moins de 30 s depuis le précédent),
 * 'day' (déjà 5 aujourd'hui) ou 'offsite' (version fichier : il ne pourrait jamais partir, rien n'est gardé). Ne lève
 * jamais d'erreur.
 */
export async function submitFeedback(input, ctx, { names = [], now = Date.now(), timeoutMs = SEND_TIMEOUT_MS } = {}) {
  if (!feedbackAvailable()) return 'offsite';
  const msg = buildMessage(input, ctx, { names });
  if (!msg) return 'empty';
  const limit = limitReason(now);
  if (limit) return limit;
  noteSent(now);
  const id = enqueue(msg, now);
  await flushFeedback({ timeoutMs });
  // (parti avec cet envoi ou avec un autre en cours ; sinon il attend : le plus récent n'est jamais retiré de la file)
  return gone.has(id) ? 'sent' : 'kept';
}

let started = false;

/**
 * Au démarrage du jeu (src/main.js) : les messages gardés repartent un peu plus tard (le jeu se charge d'abord ; rien
 * n'est chargé s'il n'y en a pas), et chaque fois que le réseau revient.
 */
export function startFeedback({ delayMs = 8000 } = {}) {
  if (started) return;
  started = true;
  const retry = () => {
    if (pendingFeedback() && canSendNow()) flushFeedback().catch(() => {});
  };
  setTimeout(retry, delayMs);
  globalThis.addEventListener?.('online', retry);
}

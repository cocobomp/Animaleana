// Point d'entrée : prépare l'interface, le moteur 3D et le mode hors ligne.

import './style.css';
import { t, setLang, getLang } from './i18n.js';
import { UI } from './ui/UI.js';
import { Game } from './game/Game.js';
import { Tutorial } from './ui/tutorial.js';
import { initUpdates } from './ui/updates.js'; // bandeau « nouvelle version prête »
import { startCloud, syncNow, onCloudChange } from './cloud/account.js'; // compte Google facultatif (src/cloud/)
import { chooseClaims } from './ui/cloudAccount.js';
import { markOpen, markClosed, openElsewhere, newTabId, BEAT_MS } from './sim/openGames.js'; // parties ouvertes (onglets)

setLang(getLang());

const app = document.getElementById('app');
const ui = new UI(app);
const game = new Game(app, ui);
ui.attach(game);
// Tutoriel guidé + objectif à l'écran (écoute les événements du jeu).
ui.tutorial = new Tutorial(ui, game);
ui.showProfiles();
initUpdates(app, () => game.running && game.save());

// Parties ouvertes : celle de cet onglet (aussi pendant qu'elle s'ouvre), et celles des autres onglets
// (registre partagé, battement toutes les 10 s). La synchro ne les remplace ni ne les efface jamais.
const tab = newTabId();
const mine = () => game.profile?.id ?? game.opening?.id ?? null;
const beat = () => {
  const id = mine();
  if (id) markOpen(tab, id);
};
game.on('opening', beat);
game.on('start', beat);
// Une partie déjà ouverte dans un autre onglet (ou une autre fenêtre) ne s'ouvre pas une deuxième fois.
game.openElsewhere = (id) => openElsewhere({ except: tab }).includes(id);
setInterval(beat, BEAT_MS);
addEventListener('pagehide', () => markClosed(tab));

// Compte Google (facultatif) : si ce navigateur était connecté, on se reconnecte et on synchronise
// les parties (au démarrage, à la connexion, au retour au menu, en arrière-plan, et toutes les 5 minutes
// pendant une partie, onglet visible). La partie ouverte n'est jamais remplacée pendant qu'on joue.
startCloud({
  busy: () => [mine(), ...openElsewhere({ except: tab })].filter(Boolean),
  playing: () => game.running,
  beforeSync: () => game.running && game.save(),
  // La question « quelles parties mettre dans ton compte ? » : seulement sur l'écran des profils.
  canAsk: () => !game.running && !game.opening && !ui.screen.hidden && Boolean(ui.screen.querySelector('.profiles')),
  chooseClaims: (parties) => chooseClaims(ui, parties),
  appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev',
  backupName: (p) => t('cloud_backupName', { name: p.name, date: new Date().toLocaleDateString(getLang() === 'fr' ? 'fr-CH' : 'en-GB', { day: '2-digit', month: '2-digit' }) }),
});
// Retour au menu : la partie est vraiment arrêtée (Game.stop prévient en dernier), puis on synchronise.
game.on('stop', () => {
  markClosed(tab);
  syncNow();
});
// Pendant la partie : prévenir (une fois) si elle a été jouée ailleurs, ou si l'appareil est plein.
const warned = new Set();
let lastReport = null;
onCloudChange((s) => {
  const r = s.report;
  if (!r || r === lastReport) return;
  lastReport = r;
  if (game.running && game.profile && r.heldIds?.includes(game.profile.id) && !warned.has(game.profile.id)) {
    warned.add(game.profile.id);
    ui.toast(t('cloud_held'), 9000);
  }
  if (r.storageFull && !warned.has('storage')) {
    warned.add('storage');
    ui.toast(t('cloud_storageFull'), 9000);
  }
});

// Téléphone : pas de zoom à deux doigts ni au double-tap (la mise en page est fixe : zoomée, la fiche
// d'un animal sort de l'écran et les boutons du haut deviennent inaccessibles). Le CSS met aussi touch-action: manipulation.
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('touchmove', (e) => { if (e.touches.length > 1) e.preventDefault(); }, { passive: false });

// Le service worker garde tout le jeu en cache pour jouer sans réseau.
// L'écran d'accueil dit quand c'est prêt (« ✅ Prêt à jouer sans Internet »).
// Le cache hors ligne n'existe qu'en https (ou sur localhost) : depuis un téléphone sur l'adresse http
// de l'ordinateur, le jeu marche mais ne s'installe pas ; on l'écrit au lieu de « Préparation… » sans fin.
const ICONS = { ready: '✅', preparing: '⏳', unavailable: 'ℹ️', file: '📁' };
const KEYS = { ready: 'offlineReady', preparing: 'offlinePreparing', unavailable: 'offlineUnavailable', file: 'offlineFile' };
const show = (state) => {
  window.offlineState = state;
  const el = document.querySelector('.offline');
  if (el) el.textContent = `${ICONS[state]} ${t(KEYS[state])}`;
};
if (location.protocol === 'file:') {
  // Fichier unique ouvert depuis le disque (version « à emporter ») : tout est déjà là, pas de cache à préparer.
  show('file');
} else if (import.meta.env.PROD && !(window.isSecureContext && 'serviceWorker' in navigator)) {
  show('unavailable');
} else if ('serviceWorker' in navigator && import.meta.env.PROD) {
  show('preparing');
  const check = async () => {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    const ok = await Promise.all(keys.filter((k) => k.startsWith('animaleana-')).map((k) => caches.open(k).then((c) => c.match('./index.html'))));
    if (ok.some(Boolean)) show('ready');
  };
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(check).catch(() => show('unavailable'));
  navigator.serviceWorker.addEventListener('controllerchange', check);
  setTimeout(check, 4000);
}

// Accès depuis la console du navigateur (pratique pour tester).
window.animaleana = { game, ui, audio: game.audio };

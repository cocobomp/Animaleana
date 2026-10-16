// Point d'entrée : prépare l'interface, le moteur 3D et le mode hors ligne.

import './style.css';
import { t, setLang, getLang } from './i18n.js';
import { UI } from './ui/UI.js';
import { Game } from './game/Game.js';
import { Tutorial } from './ui/tutorial.js';

setLang(getLang());

const app = document.getElementById('app');
const ui = new UI(app);
const game = new Game(app, ui);
ui.attach(game);
// Tutoriel guidé + objectif à l'écran (écoute les événements du jeu).
ui.tutorial = new Tutorial(ui, game);
ui.showProfiles();

// Le service worker garde tout le jeu en cache pour jouer sans réseau.
// L'écran d'accueil dit quand c'est prêt (« ✅ Prêt à jouer sans Internet »).
// Le cache hors ligne n'existe qu'en https (ou sur localhost) : depuis un téléphone sur l'adresse http
// de l'ordinateur, le jeu marche mais ne s'installe pas ; on l'écrit au lieu de « Préparation… » sans fin.
const ICONS = { ready: '✅', preparing: '⏳', unavailable: 'ℹ️' };
const KEYS = { ready: 'offlineReady', preparing: 'offlinePreparing', unavailable: 'offlineUnavailable' };
const show = (state) => {
  window.offlineState = state;
  const el = document.querySelector('.offline');
  if (el) el.textContent = `${ICONS[state]} ${t(KEYS[state])}`;
};
if (import.meta.env.PROD && !(window.isSecureContext && 'serviceWorker' in navigator)) {
  show('unavailable');
} else if ('serviceWorker' in navigator && import.meta.env.PROD) {
  show('preparing');
  const check = async () => {
    const keys = await caches.keys();
    const ok = await Promise.all(keys.filter((k) => k.startsWith('animaleana-')).map((k) => caches.open(k).then((c) => c.match('./index.html'))));
    if (ok.some(Boolean)) show('ready');
  };
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(check).catch(() => show('unavailable'));
  navigator.serviceWorker.addEventListener('controllerchange', check);
  setTimeout(check, 4000);
}

// Accès depuis la console du navigateur (pratique pour tester).
window.animaleana = { game, ui };

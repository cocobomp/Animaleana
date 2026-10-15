// Point d'entrée : prépare l'interface, le moteur 3D et le mode hors ligne.

import './style.css';
import { setLang, getLang } from './i18n.js';
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
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}

// Accès depuis la console du navigateur (pratique pour tester).
window.animaleana = { game, ui };

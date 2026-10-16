// Mise à jour du jeu installé : le cache hors ligne (sw.js) sert l'ancienne version pendant que la
// nouvelle s'installe. Dès que la nouvelle est prête, un bandeau propose de recharger ; ⚙️ Réglages
// a aussi un bouton « Rechercher une mise à jour ».

import { h } from './dom.js';
import { t } from '../i18n.js';

const sw = () => (typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? navigator.serviceWorker : null);

let banner = null;
let saveBeforeReload = () => {};

function showBanner() {
  if (!banner || !banner.hidden) return;
  banner.querySelector('.ub-text').textContent = `⬆️ ${t('updateReady')}`;
  banner.querySelector('button').textContent = t('updateReload');
  banner.hidden = false;
}

export function reloadForUpdate() {
  try { saveBeforeReload(); } catch { /* on recharge quand même */ }
  location.reload();
}

/** À appeler une fois au démarrage (src/main.js). save : sauvegarde la partie avant de recharger. */
export function initUpdates(root, save) {
  saveBeforeReload = save ?? saveBeforeReload;
  banner = h('div', { id: 'update-banner', hidden: true, role: 'status' },
    h('span', { class: 'ub-text' }), h('button', { class: 'primary small', onClick: reloadForUpdate }, ''));
  root.append(banner);
  const reg = sw();
  if (!reg) return;
  // Un contrôleur existait déjà et change : une nouvelle version vient de s'installer (skipWaiting + claim).
  const hadController = !!reg.controller;
  reg.addEventListener('controllerchange', () => { if (hadController || reg.controller) showBanner(); });
}

/**
 * Cherche une mise à jour maintenant. Renvoie 'ready' (bandeau affiché), 'none' (déjà à jour)
 * ou 'unavailable' (pas de cache hors ligne ici : http, ou mode développement).
 */
export async function checkForUpdate() {
  const reg = sw();
  if (!reg || !window.isSecureContext) return 'unavailable';
  const r = await reg.getRegistration().catch(() => null);
  if (!r) return 'unavailable';
  const before = r.active;
  await r.update().catch(() => {});
  const installing = r.installing || r.waiting;
  if (!installing) return 'none';
  // Une nouvelle version s'installe : on attend qu'elle prenne la main (controllerchange → bandeau).
  await new Promise((resolve) => {
    const done = () => resolve();
    installing.addEventListener('statechange', () => { if (installing.state === 'activated' || installing.state === 'redundant') done(); });
    setTimeout(done, 8000);
  });
  if (r.active && r.active !== before) { showBanner(); return 'ready'; }
  return 'none';
}

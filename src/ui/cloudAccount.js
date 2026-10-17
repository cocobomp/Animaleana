// Encart « Sauvegarde en ligne » de l'écran des profils : jouer en invité (rien à faire) ou se connecter
// avec Google pour retrouver ses parties sur tous ses appareils. Logique dans src/cloud/account.js.

import { h } from './dom.js';
import { t, getLang } from '../i18n.js';
import { cloudState, cloudAvailable, signIn, signOut, syncNow } from '../cloud/account.js';

const ERRORS = {
  'auth/popup-blocked': 'cloud_err_popup',
  'auth/unauthorized-domain': 'cloud_err_domain',
  'too-big': 'cloud_err_tooBig',
  'permission-denied': 'cloud_err_denied',
};

export const cloudErrorText = (code) => t(ERRORS[code] ?? 'cloud_err_network');

const clock = (ms) => new Date(ms).toLocaleTimeString(getLang() === 'fr' ? 'fr-CH' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

/** L'encart (null si la connexion est impossible ici, par exemple dans la version « à emporter »). */
export function cloudCard(ui) {
  if (!cloudAvailable()) return null;
  const s = cloudState();
  const online = globalThis.navigator?.onLine !== false;
  const rows = [h('h3', {}, t('cloud_title'))];

  if (s.status === 'in' && s.user) {
    rows.push(h('div', { class: 'cloud-user' },
      s.user.photo ? h('img', { src: s.user.photo, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'cloud-avatar' }, '👤'),
      h('div', {},
        h('b', {}, t('cloud_signedIn', { name: s.user.name || s.user.email })),
        h('small', {}, !online ? t('cloud_offline') : s.syncing ? `🔄 ${t('cloud_syncing')}` : s.lastSync ? t('cloud_synced', { time: clock(s.lastSync) }) : t('cloud_notYet')))));
    rows.push(h('div', { class: 'cloud-actions' },
      h('button', { class: 'small', disabled: s.syncing || !online, onClick: () => syncNow() }, `🔄 ${t('cloud_syncNow')}`),
      h('button', {
        class: 'small',
        onClick: async () => {
          if (await ui.confirm(t('cloud_signOutConfirm'))) signOut();
        },
      }, t('cloud_signOut'))));
  } else {
    rows.push(h('p', { class: 'note' }, t('cloud_guestHelp')));
    rows.push(h('button', {
      class: 'google',
      disabled: s.status === 'loading' || !online,
      onClick: () => signIn(),
    }, h('span', { class: 'g-logo', 'aria-hidden': 'true' }, 'G'), s.status === 'loading' ? t('cloud_loading') : t('cloud_signIn')));
    if (!online) rows.push(h('small', {}, t('cloud_offline')));
  }
  if (s.error) rows.push(h('p', { class: 'cloud-error', role: 'alert' }, cloudErrorText(s.error)));
  return h('section', { class: 'cloud' }, rows);
}

/** Message après une synchro qui a changé des parties sur l'appareil (null sinon). */
export function syncMessage(report) {
  if (!report) return null;
  const out = [];
  if (report.downloaded) out.push(t('cloud_got', { n: report.downloaded }));
  for (const name of report.backups ?? []) out.push(t('cloud_backup', { name }));
  return out.length ? out.join(' ') : null;
}

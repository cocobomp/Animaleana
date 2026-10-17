// Encart « Sauvegarde en ligne » de l'écran des profils : jouer en invité (rien à faire) ou se connecter
// avec Google pour retrouver ses parties sur tous ses appareils. Aussi : la question « quelles parties mettre
// dans ton compte ? » (tablette partagée) et les messages après une synchro. Logique dans src/cloud/account.js.

import { h } from './dom.js';
import { t, getLang } from '../i18n.js';
import { cloudState, cloudAvailable, signIn, signOut, syncNow, eraseCloud } from '../cloud/account.js';

const ERRORS = {
  'auth/popup-blocked': 'cloud_err_popup',
  'auth/unauthorized-domain': 'cloud_err_domain',
  'auth/requires-recent-login': 'cloud_err_recentLogin',
  'redirect-failed': 'cloud_err_redirect',
  'too-big': 'cloud_err_tooBig',
  'permission-denied': 'cloud_err_denied',
  conflict: 'cloud_err_conflict',
  storage: 'cloud_storageFull',
  'resource-exhausted': 'cloud_err_busy',
};

export const cloudErrorText = (code) => t(ERRORS[code] ?? 'cloud_err_network');

const clock = (ms) => new Date(ms).toLocaleTimeString(getLang() === 'fr' ? 'fr-CH' : 'en-GB', { hour: '2-digit', minute: '2-digit' });

/** L'encart (null si la connexion est impossible ici, par exemple dans la version « à emporter »). */
export function cloudCard(ui) {
  if (!cloudAvailable()) return null;
  const s = cloudState();
  const online = globalThis.navigator?.onLine !== false;
  const rows = [h('h3', {}, t('cloud_title'))];
  const privacy = h('p', { class: 'note cloud-privacy' }, t('cloud_privacy'));

  if (s.status === 'in' && s.user) {
    const busy = s.syncing || s.erasing;
    const status = !online ? t('cloud_offline') : s.erasing ? `🧹 ${t('cloud_erasing')}` : s.syncing ? `🔄 ${t('cloud_syncing')}`
      : s.lastSync ? t('cloud_synced', { time: clock(s.lastSync) }) : t('cloud_notYet');
    rows.push(h('div', { class: 'cloud-user' },
      s.user.photo ? h('img', { src: s.user.photo, alt: '', referrerpolicy: 'no-referrer' }) : h('span', { class: 'cloud-avatar' }, '👤'),
      h('div', {},
        h('b', {}, t('cloud_signedIn', { name: s.user.name || s.user.email })),
        h('small', {}, status))));
    rows.push(h('div', { class: 'cloud-actions' },
      h('button', { class: 'small', disabled: busy || !online, onClick: () => syncNow() }, `🔄 ${t('cloud_syncNow')}`),
      h('button', {
        class: 'small',
        disabled: s.erasing,
        onClick: async () => {
          if (await ui.confirm(t('cloud_signOutConfirm'))) signOut();
        },
      }, t('cloud_signOut'))));
    rows.push(privacy);
    // Mes données : tout effacer en ligne (les parties restent sur l'appareil), ou supprimer le compte.
    const erase = (account) => async () => {
      if (!(await ui.confirm(t(account ? 'cloud_deleteAccountConfirm' : 'cloud_eraseSavesConfirm')))) return;
      const ok = await eraseCloud({ account });
      if (ok === true) ui.toast(t(account ? 'cloud_erasedAccount' : 'cloud_erasedSaves'), 7000);
    };
    rows.push(h('details', { class: 'cloud-data' },
      h('summary', {}, t('cloud_myData')),
      h('div', { class: 'cloud-actions' },
        h('button', { class: 'small', disabled: busy || !online, onClick: erase(false) }, t('cloud_eraseSaves')),
        h('button', { class: 'small danger', disabled: busy || !online, onClick: erase(true) }, t('cloud_deleteAccount')))));
  } else {
    rows.push(h('p', { class: 'note' }, t('cloud_guestHelp')));
    rows.push(privacy);
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

/**
 * Tablette partagée : « Quelles parties mettre dans ton compte ? » (toutes cochées au départ).
 * Renvoie (promesse) les ids cochés — les autres restent sur l'appareil —, ou null pour « Plus tard ».
 */
export function chooseClaims(ui, parties) {
  return new Promise((resolve) => {
    const sel = new Set(parties.map((p) => p.id));
    const label = () => (sel.size ? `☁️ ${t('cloud_claimOk')}` : `📱 ${t('cloud_claimNone')}`);
    const finish = (v) => {
      ui.hideModal();
      resolve(v);
    };
    const ok = h('button', { class: 'primary', onClick: () => finish([...sel]) }, label());
    ui.showModal(h('div', { class: 'cloud-claim' },
      h('h2', { class: 'sv-title' }, t('cloud_claimTitle')),
      h('p', { class: 'note' }, t('cloud_claimHelp')),
      h('div', { class: 'sv-pick' }, parties.map((p) => h('label', { class: 'check sv-check' },
        h('input', {
          type: 'checkbox',
          checked: true,
          onChange: (ev) => {
            if (ev.target.checked) sel.add(p.id);
            else sel.delete(p.id);
            ok.textContent = label();
          },
        }),
        h('span', {},
          h('b', {}, p.name),
          h('small', {}, `${p.mode === 'sandbox' ? t('modeSandbox') : t('modeManage')} · ${t('animalsCount', { n: p.animals ?? 0 })}`))))),
      h('div', { class: 'row end' }, h('button', { onClick: () => finish(null) }, t('cloud_claimLater')), ok)));
  });
}

/** Message après une synchro qui a changé des parties sur l'appareil (null sinon). */
export function syncMessage(report) {
  if (!report) return null;
  const out = [];
  if (report.downloaded) out.push(t('cloud_got', { n: report.downloaded }));
  for (const name of report.backups ?? []) out.push(t('cloud_backup', { name }));
  for (const name of report.removedNames ?? []) out.push(t('cloud_removedElsewhere', { name }));
  for (const name of report.unlinked ?? []) out.push(t('cloud_unlinked', { name }));
  return out.length ? out.join(' ') : null;
}

// 💌 La fenêtre « Ton avis » : quatre gros smileys, la sorte de message en pastilles (idée, bug, j'aime, autre), un
// petit texte (500 caractères au plus, avec son compteur), une phrase de prudence et « Envoyer ». Ouverte depuis
// « ⋯ Plus » (src/ui/UI.js), ⚙️ Réglages (src/ui/panels.js) et l'écran des profils (src/ui/screens.js).
// Ce qui part, la file d'attente et les limites : src/cloud/feedback.js. Jamais d'erreur technique à l'écran :
// « Merci ! 💌 » (parti) ou « Merci ! Il partira dès que possible 💌 » (gardé sur l'appareil). Les petits mots
// (« Choisis un smiley… », « Attends un petit moment… ») s'écrivent dans la rangée Annuler / Envoyer, collée en bas :
// toujours visibles à côté d'« Envoyer », clavier ouvert compris. Seulement dans le jeu en ligne (feedbackAvailable).

import { h, isDesk } from './dom.js';
import { t, getLang } from '../i18n.js';
import { nbsp } from './minigames/frame.js'; // typographie française (« Merci ! » ne se coupe pas avant le « ! »)
import { listProfiles } from '../sim/profile.js';
import {
  MOODS, MOOD_EMOJI, KINDS, MAX_TEXT, submitFeedback, gameContext, deviceKind, orientationOf, appVersion, feedbackAvailable,
} from '../cloud/feedback.js';

/** Au-delà (réseau lent), on remercie déjà : le message est gardé sur l'appareil et finit de partir tout seul. */
const UI_WAIT_MS = 6000;

// Brouillon : fermée par erreur (Échap, Annuler), la fenêtre se rouvre avec ce qui était choisi et écrit (jusqu'à
// l'envoi ; en mémoire seulement, jamais enregistré).
let draft = { mood: null, kind: null, text: '' };

/** Le contexte du message (rien de personnel) : langue, version, appareil, sens de l'écran, et le jeu (gameContext). */
export function feedbackContext(ui) {
  const width = globalThis.innerWidth ?? 0;
  const height = globalThis.innerHeight ?? 0;
  let coarse = false;
  try {
    coarse = Boolean(globalThis.matchMedia?.('(pointer: coarse)')?.matches);
  } catch {
    /* pas de matchMedia */
  }
  return {
    lang: getLang(), version: appVersion(), device: deviceKind({ desk: isDesk(), coarse, width, height }),
    orientation: orientationOf(width, height), ...gameContext(ui),
  };
}

/** Les prénoms des profils de l'appareil : masqués s'ils sont écrits dans le message. */
function profileNames(ui) {
  const names = [];
  try {
    for (const p of listProfiles()) names.push(p?.name);
  } catch {
    /* liste illisible */
  }
  names.push(ui?.game?.profile?.name);
  return names.filter((n) => typeof n === 'string');
}

/**
 * Ouvre la fenêtre. opts.submit : l'envoi (tests) ; opts.waitMs : attente avant de remercier quand le réseau traîne.
 */
export function openFeedback(ui, { submit = submitFeedback, waitMs = UI_WAIT_MS } = {}) {
  // Version « à emporter » (fichier) : le bouton n'y est pas proposé ; au cas où, une phrase vraie plutôt qu'un
  // message qui ne partirait jamais.
  if (!feedbackAvailable()) {
    ui.showModal(h('div', { class: 'fb-sheet' },
      h('h3', {}, `💌 ${t('fb_btn')}`),
      h('p', { class: 'fb-offsite' }, nbsp(t('fb_offsite'))),
      h('div', { class: 'row end' }, h('button', { type: 'button', class: 'primary', 'data-escape': true, onClick: () => ui.hideModal() }, 'OK'))));
    return;
  }
  const state = { ...draft, busy: false };
  const toggle = (btn, on) => {
    btn.classList.toggle('on', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  };

  // Les smileys : boutons à bascule (aria-pressed), leur mot dessous (c'est aussi leur nom pour un lecteur d'écran).
  // (le premier prend le focus à l'ouverture : au clavier, on commence par les smileys)
  const moodBtns = MOODS.map((m, i) => h('button', {
    type: 'button', class: 'fb-mood', 'data-mood': m, 'aria-pressed': 'false', 'data-default': i === 0,
    onClick: () => { state.mood = state.mood === m ? null : m; status.hidden = true; sync(); },
  }, h('span', { class: 'fb-emoji', 'aria-hidden': 'true' }, MOOD_EMOJI[m]), h('small', {}, t(`fb_mood_${m}`))));
  const kindBtns = KINDS.map((k) => h('button', {
    type: 'button', class: 'fb-kind', 'data-kind': k, 'aria-pressed': 'false',
    onClick: () => { state.kind = state.kind === k ? null : k; status.hidden = true; sync(); },
  }, t(`fb_kind_${k}`)));

  const text = h('textarea', {
    id: 'fb-text', class: 'fb-text', maxlength: MAX_TEXT, rows: 4, placeholder: t('fb_placeholder'),
    autocomplete: 'off', autocapitalize: 'sentences', 'aria-describedby': 'fb-safety fb-count',
  });
  text.value = state.text;
  const count = h('small', { id: 'fb-count', class: 'fb-count' });
  const status = h('p', { class: 'fb-status', role: 'status', 'aria-live': 'polite' });
  status.hidden = true;
  const sendBtn = h('button', { type: 'button', class: 'primary fb-send', onClick: () => send() }, `💌 ${t('fb_send')}`);

  const sync = () => {
    for (const b of moodBtns) toggle(b, b.getAttribute('data-mood') === state.mood);
    for (const b of kindBtns) toggle(b, b.getAttribute('data-kind') === state.kind);
    count.textContent = `${text.value.length}/${MAX_TEXT}`;
    draft = { mood: state.mood, kind: state.kind, text: text.value };
  };
  const say = (key) => {
    status.textContent = nbsp(t(key));
    status.hidden = false;
  };
  text.addEventListener('input', () => {
    state.text = text.value;
    status.hidden = true;
    sync();
  });
  // (ordinateur : Ctrl + Entrée envoie ; Entrée seule va à la ligne)
  text.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && !e.isComposing) {
      e.preventDefault();
      send();
    }
  });

  const root = h('div', { class: 'fb-sheet' },
    h('h3', { id: 'fb-title' }, `💌 ${t('fb_btn')}`),
    h('p', { class: 'note fb-intro' }, nbsp(t('fb_intro'))),
    h('p', { id: 'fb-mood-label', class: 'fb-label' }, nbsp(t('fb_moodLabel'))),
    h('div', { class: 'fb-moods', role: 'group', 'aria-labelledby': 'fb-mood-label' }, moodBtns),
    h('p', { id: 'fb-kind-label', class: 'fb-label' }, nbsp(t('fb_kindLabel'))),
    h('div', { class: 'fb-kinds', role: 'group', 'aria-labelledby': 'fb-kind-label' }, kindBtns),
    h('label', { class: 'fb-label', for: 'fb-text' }, t('fb_textLabel')),
    h('p', { id: 'fb-safety', class: 'fb-safety' }, nbsp(t('fb_safety'))),
    text,
    count,
    // (le petit mot, sur sa ligne au-dessus des boutons, dans la rangée collée en bas : jamais caché par elle)
    h('div', { class: 'row end fb-foot' },
      status,
      h('button', { type: 'button', 'data-escape': true, onClick: () => ui.hideModal() }, t('cancel')),
      sendBtn));

  /** Le message est parti (ou gardé) : on remercie, avec un seul bouton (OK, Échap). */
  const thanks = (key) => {
    if (!root.isConnected) return; // (fenêtre déjà fermée : le message est de toute façon parti ou gardé)
    const ok = h('button', { type: 'button', class: 'primary', 'data-escape': true, onClick: () => ui.hideModal() }, 'OK');
    root.replaceChildren(
      h('div', { class: 'fb-thanks', role: 'status' },
        h('div', { class: 'fb-thanks-emoji', 'aria-hidden': 'true' }, '💌'),
        h('p', {}, nbsp(t(key)))),
      h('div', { class: 'row end' }, ok));
    ok.focus?.({ preventScroll: true });
  };

  const send = async () => {
    if (state.busy) return;
    state.text = text.value;
    const input = { mood: state.mood, kind: state.kind, text: state.text };
    state.busy = true;
    sendBtn.disabled = true;
    sendBtn.textContent = t('fb_sending');
    let result;
    try {
      const sending = Promise.resolve().then(() => submit(input, feedbackContext(ui), { names: profileNames(ui) }));
      result = await Promise.race([sending, new Promise((r) => setTimeout(() => r('kept'), waitMs))]);
    } catch {
      result = 'kept'; // (jamais d'erreur technique : il est gardé, ou il repartira)
    }
    state.busy = false;
    sendBtn.disabled = false;
    sendBtn.textContent = `💌 ${t('fb_send')}`;
    if (result === 'empty' || result === 'wait' || result === 'day' || result === 'offsite') {
      say({ empty: 'fb_empty', wait: 'fb_wait', day: 'fb_day', offsite: 'fb_offsite' }[result]);
      return;
    }
    draft = { mood: null, kind: null, text: '' };
    thanks(result === 'sent' ? 'fb_sent' : 'fb_kept');
  };

  sync();
  ui.showModal(root);
}

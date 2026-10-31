// Le nom des touches sur le clavier de l'enfant : le jeu lit les touches par leur place (event.code), et montre la
// lettre écrite dessus. KeyW KeyA KeyS KeyD, c'est Z Q S D sur un clavier français (AZERTY), W A S D ailleurs.
// Chrome et Edge le disent (navigator.keyboard.getLayoutMap, lu une fois) ; sinon on devine par la langue du navigateur.

import { t, getLang } from '../i18n.js';

/** Marcher (et diriger le cheval) : avant, gauche, arrière, droite, à leur place sur le clavier (src/game/Input.js). */
export const MOVE_CODES = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];
export const ARROW_CODES = ['ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];

// AZERTY : seules ces lettres changent de place parmi celles du jeu (E, C, N, J, P, H restent où elles sont).
const AZERTY = { KeyW: 'Z', KeyA: 'Q', KeyQ: 'A', KeyZ: 'W' };
const LETTERS = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((c) => `Key${c}`);
const ARROW = { ArrowUp: '↑', ArrowLeft: '←', ArrowDown: '↓', ArrowRight: '→' };
const NAMED = { Space: 'key_space', ShiftLeft: 'key_shift', ShiftRight: 'key_shift', Escape: 'key_esc', Enter: 'key_enter', NumpadEnter: 'key_enter', Tab: 'key_tab' };

let layout = null; // { KeyW: 'Z', … } : ce que dit le navigateur (null : pas encore lu, ou il ne sait pas)
let loading = null;
const listeners = new Set();

/**
 * Clavier français (AZERTY) d'après la langue du navigateur : « fr », « fr-FR », « fr-BE »… mais pas le Canada
 * (QWERTY), ni la Suisse ou le Luxembourg (QWERTZ, où W A S D sont à leur place).
 */
export function guessAzerty(lang) {
  const m = /^fr(?:[-_]([a-z]{2}))?/i.exec(String(lang ?? ''));
  return !!m && !['CA', 'CH', 'LU'].includes((m[1] ?? '').toUpperCase());
}

/** La langue du navigateur (pas celle choisie dans le jeu : un enfant qui joue en anglais garde son clavier français). */
const browserLang = () => (typeof navigator !== 'undefined' && navigator.language) || getLang();

/** La lettre (ou le nom) écrite sur la touche de ce code : « Z », « Maj », « Espace », « ↑ », « 2 ». */
export function keyLabel(code) {
  if (NAMED[code]) return t(NAMED[code]);
  if (ARROW[code]) return ARROW[code];
  // (les chiffres restent des chiffres : sur AZERTY, la touche 1 sans Maj écrit « & »)
  const digit = /^(?:Digit|Numpad)(\d)$/.exec(code);
  if (digit) return digit[1];
  if (/^Key[A-Z]$/.test(code)) {
    if (layout?.[code]) return layout[code];
    return (guessAzerty(browserLang()) && AZERTY[code]) || code.slice(3);
  }
  return code;
}

/** Les quatre lettres pour marcher, dans l'ordre avant, gauche, arrière, droite : « Z Q S D ». */
export const moveKeys = (sep = ' ') => MOVE_CODES.map(keyLabel).join(sep);

/** La ligne de toutes les touches (Réglages, sur un appareil sans souris) : « ZQSD ou flèches : marcher · … ». */
export const controlsHelp = () => t('controlsHelp', { move: moveKeys('') });

/**
 * Lit le vrai clavier (Chrome, Edge), une seule fois ; ensuite, les noms suivent (onKeyLayout prévient). Une carte
 * vide (navigateur sans écran, autre clavier inconnu) ou une erreur (cadre d'une autre page) : on garde la devinette.
 */
export function loadKeyLayout(nav = typeof navigator !== 'undefined' ? navigator : null) {
  if (loading) return loading;
  const kb = nav?.keyboard;
  if (typeof kb?.getLayoutMap !== 'function') {
    loading = Promise.resolve(false);
    return loading;
  }
  loading = Promise.resolve()
    .then(() => kb.getLayoutMap())
    .then((map) => {
      const found = {};
      for (const code of LETTERS) {
        const v = map?.get?.(code);
        // (une lettre ou un signe, jamais un blanc ; en majuscule, comme sur la touche)
        if (typeof v === 'string' && v.length === 1 && v.trim()) found[code] = v.toUpperCase();
      }
      if (!Object.keys(found).length) return false;
      layout = found;
      for (const fn of listeners) fn();
      return true;
    })
    .catch(() => false);
  return loading;
}

/** fn() quand le vrai clavier est connu (le bandeau, la carte et le guide changent leurs lettres). */
export function onKeyLayout(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** (tests) Oublie le clavier lu. */
export function resetKeyLayout() {
  layout = null;
  loading = null;
}

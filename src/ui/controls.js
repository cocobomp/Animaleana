// ⌨️ Les commandes sur ordinateur : la carte « Les touches » (H), le bandeau des touches en bas de l'écran, et les
// touches des menus (J le journal, P la pause, H la carte, Échap le menu). Sur un téléphone ou une tablette : rien de
// tout ça à l'écran (pas de bandeau, pas de carte qui s'ouvre toute seule).

import { h, isDesk, isPhone } from './dom.js';
import { t, getLang } from '../i18n.js';
import { keyLabel, moveKeys, MOVE_CODES, ARROW_CODES } from './keys.js';
import { nbsp } from './minigames/frame.js'; // typographie française (« Bravo ! » ne se coupe pas)

/** Des touches dessinées comme sur le clavier : [Z][Q][S][D] (les lettres de ce clavier-là). */
export const keycaps = (codes, cls = '') => codes.map((c) => h('kbd', { class: `kc ${cls}`.trim(), 'data-code': c }, keyLabel(c)));

/** Les touches déjà dessinées reprennent la lettre de ce clavier, ou le nom dans la langue choisie (« Maj », « Shift »). */
export function relabelKeycaps(root = document) {
  for (const k of root.querySelectorAll('kbd[data-code]')) {
    const s = keyLabel(k.dataset.code);
    if (k.textContent !== s) k.textContent = s;
  }
}

// ------------------------------------------------------------ la carte « Les touches »

/**
 * Ce que dit la carte, par groupe : { id, icon, title, rows: [{ keys, mouse, text }] } ; keys : les codes des touches
 * (event.code, montrés avec la lettre de ce clavier), mouse : 🖱️ quand c'est la souris.
 */
export function keysCardGroups() {
  const row = (keys, text) => ({ keys, mouse: null, text });
  const mouse = (text) => ({ keys: null, mouse: '🖱️', text });
  return [
    { id: 'walk', icon: '🚶', title: t('kc_walk'), rows: [row(MOVE_CODES, t('kc_walkKeys')), row(ARROW_CODES, t('kc_walkArrows')), mouse(t('kc_walkClick'))] },
    { id: 'run', icon: '🏃', title: t('kc_run'), rows: [row(['ShiftLeft'], t('kc_runHold'))] },
    { id: 'act', icon: '🤲', title: t('kc_act'), rows: [row(['KeyE'], t('kc_actE')), mouse(t('kc_actClick'))] },
    { id: 'look', icon: '👀', title: t('kc_look'), rows: [mouse(t('kc_lookDrag')), row(['KeyC'], t('kc_lookCam')), row(['Numpad4', 'Numpad6', 'Numpad8', 'Numpad2'], t('kc_lookPad'))] },
    { id: 'ride', icon: '🏇', title: t('kc_ride'), rows: [
      row(MOVE_CODES, t('kc_rideSteer')), row(['Digit1', 'Digit2', 'Digit3'], t('kc_rideGaits')), row(['Digit0'], t('kc_rideHalt')),
      row(['ShiftLeft'], t('kc_rideGallop')), row(['Space'], t('kc_rideSpace')), row(['KeyE'], t('kc_rideOff'))] },
    { id: 'menus', icon: '📋', title: t('kc_menus'), rows: [
      row(['KeyJ'], t('kc_journal')), row(['KeyP'], t('kc_pause')), row(['KeyN'], t('kc_quest')), row(['KeyH'], t('kc_card')), row(['Escape'], t('kc_esc'))] },
  ];
}

/** La carte est ouverte (H la referme : UI, écouteur du clavier). */
export const keysCardOpen = (ui) => !!ui.modalOpen && !!ui.modal.querySelector('.keys-card');

/** ⌨️ La carte « Les touches » : de grosses touches, groupées (marcher, courir, agir, regarder, à cheval, menus). */
export function openKeysCard(ui) {
  const p = ui.game?.profile;
  if (p) p.keysCard = true; // (vue : elle ne s'ouvrira plus toute seule, maybeKeysCard)
  const groups = keysCardGroups();
  const group = (id) => {
    const gr = groups.find((x) => x.id === id);
    return h('section', { class: `kc-group kc-${id}` },
      h('h4', {}, h('span', { class: 'kc-icon', 'aria-hidden': 'true' }, gr.icon), ` ${nbsp(gr.title)}`),
      gr.rows.map((r) => h('div', { class: 'kc-row' },
        h('span', { class: 'kc-keys' }, r.keys ? keycaps(r.keys, 'big') : h('span', { class: 'kc-mouse', 'aria-hidden': 'true' }, r.mouse)),
        h('span', { class: 'kc-text' }, nbsp(r.text)))));
  };
  ui.showModal([
    h('div', { class: 'keys-card' },
      h('h3', {}, `⌨️ ${t('kc_title')}`),
      h('div', { class: 'kc-grid' },
        h('div', { class: 'kc-col' }, group('walk'), group('run'), group('act')),
        h('div', { class: 'kc-col' }, group('ride')),
        h('div', { class: 'kc-col' }, group('look'), group('menus'))),
      h('p', { class: 'note kc-again' }, nbsp(t('kc_again', { h: keyLabel('KeyH') })))),
    h('div', { class: 'row end' }, h('button', { class: 'primary', 'data-escape': true, onClick: () => ui.hideModal() }, `👍 ${nbsp(t('kc_ok'))}`)),
  ]);
}

/**
 * La première fois sur un ordinateur (une fois par partie, profile.keysCard) : la carte s'ouvre toute seule, quand rien
 * d'autre n'est ouvert. Pas pendant le tutoriel guidé : son étape « marcher » apprend déjà les touches ; la carte
 * vient quand il est fini (ou passé).
 */
export function maybeKeysCard(ui) {
  const g = ui.game;
  const p = g?.profile;
  if (!p || p.keysCard || !g.running || !isDesk()) return false;
  if (performance.now() - (ui.startedAt ?? 0) < 2500) return false; // (le temps d'arriver dans la ferme)
  if (ui.tutorial?.active || ui.isBlocking() || ui.panel || ui.minigameOpen || ui.modalQueue?.length) return false;
  if (g.activities?.active || g.tripFlow?.active || g.mgmt?.active) return false;
  openKeysCard(ui);
  return true;
}

// ------------------------------------------------------------ les touches des menus

const MENU = { KeyJ: 'journal', KeyP: 'pause', KeyH: 'keys', Escape: 'menu' };

/** Ce que voit le jeu au moment de la touche (pour menuAction). */
export function menuState(ui) {
  const g = ui.game;
  const b = ui.tutorial?.bubble;
  return {
    running: !!g?.running,
    blocking: !!ui.isBlocking?.(), // fenêtre, écran (profils, avatar), trajet, examen véto
    minigame: !!ui.minigameOpen,
    activity: !!g?.activities?.active,
    trip: !!g?.tripFlow?.journey, // en route (pendant le chargement du véhicule, on marche encore dans la cour)
    tripView: !!g?.tripFlow?.view, // dans le véhicule : Échap en sort (Game.onKey)
    mgmt: !!g?.mgmt?.active, // vue d'ensemble, construction : Échap reste à la construction
    panel: !!ui.panel,
    questBubble: !!b && !b.hidden && b.classList.contains('quest-bubble'),
    tuto: !!ui.tutorial?.active, // (le tutoriel guidé : pas de menu d'Échap, sa bulle dirait « touche OK »)
  };
}

/**
 * Ce que fait une touche de menu dans cet état (s : menuState), ou null : rien (la touche est pour autre chose).
 * Jamais pendant une fenêtre, un mini-jeu, l'examen véto, une activité ni un voyage. Échap ferme d'abord ce qui est
 * ouvert (la fenêtre et le panneau : UI ; la bulle d'une quête : ici) ; le menu seulement quand rien ne l'est, et pas
 * pendant le tutoriel guidé (tous ses choix sont déjà en haut de l'écran).
 */
export function menuAction(code, s) {
  const act = MENU[code];
  if (!act || !s.running || s.blocking || s.minigame || s.activity || s.trip) return null;
  if (act === 'menu') {
    if (s.questBubble) return 'bubble';
    if (s.panel || s.mgmt || s.tripView || s.tuto) return null;
  }
  return act;
}

/** J, P, H, Échap (Game.onKey) : fait ce que dit menuAction. Renvoie ce qui a été fait (ou null). */
export function runMenuKey(ui, code) {
  const act = menuAction(code, menuState(ui));
  const g = ui.game;
  if (act === 'journal') {
    if (ui.panel?.kind === 'journal') ui.closePanel();
    else ui.openJournal();
  } else if (act === 'pause') g.setTimeScale(g.paused ? 1 : 0); // (⏩ puis P, P : on repart à ×1, comme ▶ Reprendre)
  else if (act === 'keys') openKeysCard(ui);
  else if (act === 'menu') ui.openMore();
  else if (act === 'bubble') ui.tutorial.closeQuestBubble();
  return act;
}

/**
 * J, P ou H pendant qu'une fenêtre est ouverte (UI, écouteur du clavier) : dans le menu d'Échap, la touche choisit ce
 * que dit sa petite touche (⌨️ H, 📖 J, ⏸ P) ; H referme aussi la carte des touches. Renvoie true si c'est fait.
 */
export function modalMenuKey(ui, code) {
  if (!ui.modalOpen || !MENU[code] || code === 'Escape') return false;
  const item = ui.modal.querySelector(`.more-sheet [data-key="${code}"]`);
  if (item) item.click();
  else if (code === 'KeyH' && keysCardOpen(ui)) ui.hideModal();
  else return false;
  return true;
}

// ------------------------------------------------------------ le bandeau des touches

const STRIP_KEY = 'animaleana.keystrip';

/** Le bandeau est voulu sur cet appareil (Réglages : « Montrer » / « Cacher » ; montré tant qu'on n'a rien choisi). */
export function stripWanted() {
  try {
    return localStorage.getItem(STRIP_KEY) !== 'off';
  } catch {
    return true;
  }
}

export function setStripWanted(on) {
  try {
    localStorage.setItem(STRIP_KEY, on ? 'on' : 'off');
  } catch {
    /* rien */
  }
}

/**
 * Le bandeau en bas de l'écran (ordinateur) : ce qu'on peut faire maintenant. À pied : marcher, courir, [E] ce que dit
 * le bouton vert, regarder, [H] toutes les touches ; en selle : diriger, grand galop, allures, arrêt, [Espace] quand il
 * y a quelque chose à faire (sauter, bravo, trot enlevé), [E] descendre. Il prend sa place en bas (body.keys-strip, CSS
 * --keys-b : le bouton vert, les allures… montent d'autant) ; une fenêtre ou un panneau ouvert le cachent (CSS).
 */
export class KeyStrip {
  constructor(ui) {
    this.ui = ui;
    this.el = h('div', { id: 'key-strip', hidden: true, role: 'note' });
    this.act = h('span', { class: 'ks-label' }, t('ks_act'));
    this.actText = '';
    this.key = '';
    this.on = false;
    this.ride = false; // (en selle : UI.updatePostBtn le compare à chaque image, update seulement quand ça change)
  }

  /** Ce que fait [E] : le texte du bouton vert (vide : « Agir »). Appelé quand il change (UI.setFocus). */
  setAction(text) {
    if (text === this.actText) return;
    this.actText = text;
    const s = text || t('ks_act');
    if (this.act.textContent !== s) this.act.textContent = s;
  }

  /** La touche Espace en selle : ce qu'elle fait maintenant (« Sauter », « Bravo ! », « Trot enlevé »), ou null. */
  spaceLabel() {
    const ui = this.ui;
    if (!ui.jumpBtn.hidden) return t('fj_btn');
    if (!ui.praiseBtn.hidden) return ui.praiseName.textContent;
    if (!ui.postBtn.hidden) return t('ks_post');
    return null;
  }

  /** À rappeler quand quelque chose change (rafraîchissement, bouton vert, ⬆️ ⤴️ 🤚, réglages, langue, clavier lu). */
  update() {
    const ui = this.ui;
    const g = ui.game;
    const ride = !!g?.player?.mount;
    this.ride = ride;
    // (un portable à écran tactile garde son bandeau ; seul le joystick choisi dans les Réglages prend sa place)
    const on = !!g?.running && isDesk() && !isPhone() && stripWanted() && ui.onScreenChoice() !== 'on' && ui.screen.hidden;
    if (on !== this.on) {
      this.on = on;
      this.el.hidden = !on;
      document.body.classList.toggle('keys-strip', on);
    }
    if (!on) return;
    const space = ride ? this.spaceLabel() : null;
    const key = `${ride}|${space}|${getLang()}|${moveKeys()}`;
    if (key === this.key) return;
    this.key = key;
    if (!this.actText) this.act.textContent = t('ks_act');
    const item = (keys, label, cls = '') => h('span', { class: `ks-item ${cls}`.trim() }, keys, h('span', {}, label));
    const help = h('button', {
      class: 'ks-item ks-help', type: 'button', tabindex: '-1', title: t('kc_show'),
      onPointerdown: (e) => e.preventDefault(), // (pas de focus : Espace reste au jeu)
      onClick: () => { if (!ui.isBlocking()) openKeysCard(ui); },
    }, keycaps(['KeyH']), h('span', {}, t('ks_keys')));
    const act = h('span', { class: 'ks-item ks-act' }, keycaps(['KeyE']), this.act);
    this.el.setAttribute('aria-label', t('ks_aria'));
    this.el.replaceChildren(...(ride
      ? [
        item(keycaps(MOVE_CODES), t('ks_steer')),
        item(keycaps(['ShiftLeft']), t('ks_gallop')),
        item(keycaps(['Digit1', 'Digit2', 'Digit3']), t('ks_gaits'), 'ks-gaits'),
        item(keycaps(['Digit0']), t('ks_halt'), 'ks-gaits'),
        space ? item(keycaps(['Space']), space) : null,
        act, help,
      ]
      : [
        item(keycaps(MOVE_CODES), t('ks_walk')),
        item(keycaps(['ShiftLeft']), t('ks_run')),
        act,
        item(h('span', { class: 'ks-mouse', 'aria-hidden': 'true' }, '🖱️'), t('ks_look'), 'ks-look'),
        help,
      ]).filter(Boolean));
  }
}

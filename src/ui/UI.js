// Interface : barre du haut, bouton d'action, notifications, fenêtres.

import { h, isPhone, safeInsets } from './dom.js';
import { watchViewport, focusField } from './viewport.js'; // clavier à l'écran
import { t, L, fmtHour, getLang } from '../i18n.js';
import { formatClock } from '../sim/time.js';
import { WEATHER_EMOJI } from '../sim/places.js';
import * as panels from './panels.js';
import { openTackItem } from './tack.js'; // sellerie : fiche d'un objet
import { openVet } from './vet.js';
import { openVetSchool } from './vetSchool.js'; // 🎓 école vétérinaire
import { runMinigame, runChoreGame } from './minigames.js';
import { nbsp } from './minigames/frame.js'; // typographie française des messages
import { showProfiles, showAvatarEditor } from './screens.js';
import { openBuilding, openAnimalActions } from './actions.js';
import { openHelp } from './help.js';
import { openFacility, openBox, openBed } from './facilitiesPanel.js'; // bâtiments à entretenir
import { tripChips } from './trip.js'; // voyages réalistes
import { openActivities } from './activities.js';
import { TOOLS, toolAtHome } from '../sim/tools.js';
import { isSandbox } from '../sim/profile.js';
import { lifeStage } from '../sim/animal.js'; // étiquettes groupées des bébés
import { openHelperChat } from './helperChat.js'; // parler aux aides
import { audio } from '../game/audio.js'; // sons de l'interface (boutons, notifications)
import { openDogTrainerPanel } from './dogTrainer.js'; // métier éducateur canin
import { openCareers, careerChips } from './careers.js'; // 💼 métiers
import { openTrailCarnet } from './trailGuide.js'; // 🧭 guide de randonnée

const STATUS_MAX = 3; // pastilles d'état visibles en même temps (les autres derrière « ➕ N de plus »)
// Le passage de niveau est annoncé ce temps (ms) après ce qui l'a fait gagner (UI.levelUp).
export const LEVEL_UP_DELAY = 1200;
// Ce qui peut prendre le focus au clavier (boutons, liens, champs).
const FOCUSABLE = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export const NEED_ICON = { hunger: '🍖', thirst: '💧', hygiene: '🫧', energy: '⚡', exercise: '🏃', affection: '❤️', grooming: '🪮' };

export class UI {
  constructor(root) {
    this.root = root;
    this.game = null;
    this.panel = null; // { el, render, animalId, kind }
    this.modalOpen = false;
    this.modalQueue = []; // fenêtres arrivées pendant un mini-jeu, montrées après (showModal)

    this.hud = h('div', { id: 'hud', hidden: true });
    this.actionBtn = h('button', { id: 'action', hidden: true, onClick: () => this.game?.interact() });
    this.camBtn = h('button', { id: 'cam-btn', title: t('camera'), onClick: () => this.game?.toggleCamera() }, '🎥');
    this.toasts = h('div', { id: 'toasts' });
    this.panelEl = h('aside', { id: 'panel', hidden: true });
    this.screen = h('div', { id: 'screen' });
    this.modal = h('div', { id: 'modal', hidden: true });
    this.help = h('div', { id: 'help', hidden: true });
    root.append(this.hud, this.actionBtn, this.camBtn, this.toasts, this.panelEl, this.screen, this.modal, this.help);
    this.camBtn.hidden = true;

    // Boutons à l'écran : tourner la vue et courir (en plus du joystick).
    const hold = (el, down, up) => {
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); down(); });
      for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture']) el.addEventListener(ev, up);
    };
    const left = h('button', { class: 'pad-btn', 'aria-label': '⟲' }, '⟲');
    const right = h('button', { class: 'pad-btn', 'aria-label': '⟳' }, '⟳');
    const runBtn = h('button', { class: 'pad-btn run' }, '🏃');
    hold(left, () => { this.game.input.btnLook = 1; }, () => { this.game.input.btnLook = 0; });
    hold(right, () => { this.game.input.btnLook = -1; }, () => { this.game.input.btnLook = 0; });
    hold(runBtn, () => { this.game.input.btnRun = true; }, () => { this.game.input.btnRun = false; });
    this.touchPad = h('div', { id: 'touch-pad', hidden: true }, left, runBtn, right);
    this.statusBar = h('div', { id: 'status-bar' });
    this.pauseBanner = h('div', { id: 'pause-banner', hidden: true },
      h('span', {}, `⏸ ${t('pause')}`),
      h('button', { class: 'primary', onClick: () => this.game.setTimeScale(1) }, `▶ ${t('resume')}`));
    root.append(this.pauseBanner);
    this.taskBox = h('div', { id: 'task-list', hidden: true });
    root.append(this.taskBox);
    this.t = t;
    this.labels = h('div', { id: 'labels' });
    this.labelEls = new Map();
    // À cheval, en balade libre : les allures (arrêt, pas, trot, galop). Les boutons sont créés une fois (seule leur
    // classe change : pas de bouton remplacé sous le doigt) ; leurs textes suivent la langue (updateGaitPad).
    this.gaitBtns = {};
    this.gaitPad = h('div', { id: 'gait-pad', hidden: true, role: 'group' },
      ['halt', 'walk', 'trot', 'canter'].map((g) => {
        const b = h('button', { class: `gait-btn ${g}`, onClick: () => this.game?.setRideGait(g) },
          h('span', { class: 'gait-icon', 'aria-hidden': 'true' }, { halt: '✋', walk: '🐢', trot: '🐴', canter: '💨' }[g]),
          h('span', { class: 'gait-name' }), h('kbd', {}, { halt: '0', walk: '1', trot: '2', canter: '3' }[g]));
        this.gaitBtns[g] = b;
        return b;
      }));
    root.append(this.touchPad, this.gaitPad, this.statusBar, this.labels);

    // Un seul écouteur pour tous les boutons : petit « tic », plus chantant pour les boutons principaux,
    // descendant pour les boutons rouges. (Pas pour les boutons de direction qu'on garde appuyés.)
    root.addEventListener('click', (e) => {
      const b = e.target?.closest?.('button');
      if (!b || b.disabled || b.classList.contains('pad-btn')) return;
      audio.ui(b.classList.contains('primary') ? 'ok' : b.classList.contains('danger') ? 'cancel' : 'tap');
    });

    // Ne pas redessiner un panneau pendant qu'on appuie dessus (sinon le clic se perd).
    this.holding = false;
    // Sur Safari iOS, le clic arrive APRÈS le relâchement du doigt : si le panneau se redessine entre les deux,
    // le clic tombe sur un bouton qui n'existe plus. On bloque donc tout redessin automatique pendant le toucher
    // et dans la demi-seconde qui suit (panelBusyUntil) ; les redessins explicites (onglets…) restent immédiats.
    this.panelBusyUntil = 0;
    this.panelEl.addEventListener('pointerdown', () => { this.holding = true; this.panelBusyUntil = performance.now() + 2000; });
    // pointercancel : le navigateur a pris la main (défilement) ; sans ça le panneau restait figé jusqu'au prochain tap.
    for (const ev of ['pointerup', 'pointercancel']) {
      window.addEventListener(ev, () => {
        if (!this.holding) return;
        this.holding = false;
        this.panelBusyUntil = performance.now() + 450;
        setTimeout(() => this.refreshPanel(), 500);
      });
    }

    window.addEventListener('keydown', (e) => {
      // Fenêtre ouverte : Tab et Maj+Tab tournent dans ses boutons (avant, ils parcouraient tout le jeu derrière).
      if (this.modalOpen && e.key === 'Tab') return this.trapModalTab(e);
      // defaultPrevented : touche déjà traitée (Échap dans la fenêtre du nom ne ferme pas aussi le panneau dessous).
      if (e.code === 'Escape' && !e.defaultPrevented) {
        if (this.modalOpen) return this.escapeModal(e);
        if (this.panel) this.closePanel();
      }
    });
    // Une fenêtre qui se redessine elle-même (📸 photo, inscription…) : le bouton qui avait le focus disparaît,
    // le focus revient dans la fenêtre au lieu de tomber sur la page.
    if (typeof MutationObserver === 'function') {
      new MutationObserver(() => {
        const a = document.activeElement;
        if (this.modalOpen && (!a || a === document.body)) this.focusModal();
      }).observe(this.modal, { childList: true, subtree: true });
    }

    // Clavier à l'écran (iPhone) : fenêtres et panneaux restent dans la partie visible (src/ui/viewport.js).
    watchViewport();
    // Hauteur de la barre du haut, pour le CSS (#panel commence sous la barre d'outils en paysage et sur ordinateur).
    this.hudObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(() => this.syncHudVars()) : null;
    this.hudObserver?.observe(this.hud);
    window.addEventListener('resize', () => this.syncHudVars());
    // Hauteur du panneau depuis le bas de l'écran (CSS : messages juste au-dessus du panneau, sur téléphone).
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => this.syncPanelSpace()).observe(this.panelEl);
    window.addEventListener('resize', () => this.syncPanelSpace());
    // Messages : quand on les déplace (tutorial.layoutTop pose leur top) ou qu'on en ajoute, ils restent dans l'écran.
    if (typeof MutationObserver === 'function') {
      new MutationObserver(() => this.fitToasts()).observe(this.toasts, { attributes: true, attributeFilter: ['style'], childList: true });
    }
    // La bulle du guide s'efface pendant qu'on tape (CSS) : la fenêtre reprend alors sa place en haut.
    for (const ev of ['focusin', 'focusout']) {
      document.addEventListener(ev, () => { if (this.modalOpen) setTimeout(() => this.syncModalTop(), 0); });
    }
  }

  /**
   * Pose --hud-tools-bottom, --hud-info-right et --hud-bottom (px) : où finissent la barre d'outils, la carte
   * d'infos et toute la barre du haut (CSS : panneau, « Ma liste » et bandeau d'événement en paysage).
   */
  syncHudVars() {
    const root = document.documentElement.style;
    const tools = this.hud.hidden ? null : this.hud.querySelector('.hud-buttons')?.getBoundingClientRect();
    const info = this.hud.hidden ? null : this.hudInfo?.getBoundingClientRect();
    const hud = this.hud.hidden ? null : this.hud.getBoundingClientRect();
    const set = (k, v) => { if (root.getPropertyValue(k) !== v) root.setProperty(k, v); };
    set('--hud-tools-bottom', tools?.height ? `${Math.round(tools.bottom)}px` : '');
    set('--hud-info-right', info?.width ? `${Math.round(info.right)}px` : '');
    set('--hud-bottom', hud?.height ? `${Math.round(hud.bottom)}px` : '');
  }

  /** Pose --panel-space (px) : la place prise par le panneau depuis le bas de l'écran (vide s'il est fermé). */
  syncPanelSpace() {
    // (offsetTop, pas getBoundingClientRect : sans l'animation d'entrée, qui décale le panneau de 24 px)
    const el = this.panelEl;
    const v = !el.hidden && el.offsetHeight ? `${Math.max(0, Math.round(window.innerHeight - el.offsetTop))}px` : '';
    const root = document.documentElement.style;
    if (root.getPropertyValue('--panel-space') !== v) root.setProperty('--panel-space', v);
  }

  attach(game) {
    this.game = game;
  }

  // ------------------------------------------------------------ écrans

  showProfiles() {
    this.hud.hidden = true;
    this.actionBtn.hidden = true;
    this.camBtn.hidden = true;
    this.touchPad.hidden = true;
    this.gaitPad.hidden = true;
    this.statusBar.replaceChildren();
    this.statusKey = '';
    this.clearLabels();
    document.getElementById('joystick').hidden = true;
    showProfiles(this);
  }

  showAvatarEditor(profile, onDone) {
    showAvatarEditor(this, profile, onDone);
  }

  clearScreen() {
    this.screen.replaceChildren();
    this.screen.scrollTop = 0;
    this.screen.hidden = true;
  }

  onStart(game) {
    this.clearScreen();
    this.hud.hidden = false;
    this.camBtn.hidden = false;
    this.applyControls();
    this.buildHud();
    {
      const touch = matchMedia('(pointer: coarse)').matches;
      this.help.textContent = touch ? t('tapHint') : `${t('tapHint')} · ${t('controlsHelp')}`;
      this.help.hidden = false;
      clearTimeout(this.helpTimer);
      this.helpTimer = setTimeout(() => this.hideHelp(), 15000);
    }
    this.refresh();
  }

  hideHelp() {
    this.help.hidden = true;
  }

  buildHud() {
    // Le tutoriel et l'aide retrouvent chaque bouton par son title (= le libellé traduit) : on le garde exact.
    const btn = (emoji, label, fn, cls = '') => h('button', { class: `hud-btn ${cls}`, onClick: fn, title: label }, h('span', {}, emoji), h('small', {}, label));
    // Refait avec l'interface : il garde ainsi la langue choisie dans les réglages.
    this.pauseBanner.replaceChildren(h('span', {}, `⏸ ${t('pause')}`),
      h('button', { class: 'primary', onClick: () => this.game.setTimeScale(1) }, `▶ ${t('resume')}`));
    // Carte d'infos : les nœuds sont créés une fois ici ; refresh() ne change que les textes.
    // (Recréer les boutons à chaque rafraîchissement faisait perdre le tap qu'on était en train de donner.)
    this.hudName = h('span', { class: 'hud-name' });
    this.hudCoin = h('span', { class: 'coin' });
    this.hudLevel = h('span', { class: 'hud-lv' });
    this.xpFill = h('span', { class: 'xp-fill' });
    this.hudClock = h('div', { class: 'hud-line clock' });
    this.hudPlace = h('div', { class: 'hud-line place' });
    this.hudWeather = h('div', { class: 'hud-line weather' });
    this.timeBar = this.timeControls();
    this.hudInfo = h('div', { class: 'hud-info' },
      h('div', { class: 'hud-line strong' }, this.hudName, this.hudCoin),
      h('div', { class: 'hud-line level' }, this.hudLevel, h('span', { class: 'xp-track' }, this.xpFill)),
      this.hudClock,
      this.timeBar,
      this.hudPlace,
      this.hudWeather);
    this.hud.replaceChildren(
      this.hudInfo,
      h('nav', { class: 'hud-buttons' },
        btn('🐾', t('animals'), () => this.openAnimals()),
        btn('🚜', t('farm'), () => this.openFarm()),
        // Vue d'ensemble : dans « ⋯ Plus » sur téléphone (sept boutons d'au moins 44 px tiennent sur la rangée, pas huit).
        btn('🗺️', t('mgmt_btn'), () => this.game.mgmt.toggle(), 'secondary'),
        // Vue construction : grille, agrandir le paddock et les enclos, construire (src/game/ConstructionView.js).
        btn('🏗️', t('hud_build'), () => this.game.mgmt.openBuild(), 'build'),
        btn('💼', t('careers'), () => this.openCareers()), // métiers (src/ui/careers.js)
        btn('🧭', t('travel'), () => this.openTravel()),
        btn('📖', t('journal'), () => this.openJournal()),
        // Sur téléphone (une seule rangée), ceux-là passent dans « ⋯ Plus » ; sur ordinateur ils restent visibles.
        btn('🏆', t('actv_hud'), () => this.openActivities(), 'secondary'),
        btn('👕', t('avatar'), () => this.showAvatarEditor(this.game.profile, () => this.clearScreen()), 'secondary'),
        btn('❓', t('help'), () => openHelp(this), 'secondary'),
        btn('⚙️', t('settings'), () => this.openSettings(), 'secondary'),
        btn('⋯', t('hud_more'), () => this.openMore(), 'more')),
    );
  }

  /** « ⋯ Plus » (téléphone) : Vue d'ensemble, Activités, Avatar, Aide et Réglages dans une petite feuille. */
  openMore() {
    const item = (emoji, label, fn) => h('button', { class: 'big-action', onClick: () => { this.hideModal(); fn(); } },
      h('span', { class: 'ba-icon' }, emoji), h('span', { class: 'ba-text' }, h('b', {}, label)));
    this.showModal([
      h('div', { class: 'action-sheet more-sheet' },
        item('🗺️', t('mgmt_btn'), () => this.game.mgmt.toggle()),
        item('🏆', t('actv_hud'), () => this.openActivities()),
        item('👕', t('avatar'), () => this.showAvatarEditor(this.game.profile, () => this.clearScreen())),
        item('❓', t('help'), () => openHelp(this)),
        item('⚙️', t('settings'), () => this.openSettings())),
      h('div', { class: 'row end' }, h('button', { onClick: () => this.hideModal() }, t('cancel'))),
    ]);
  }

  /**
   * Les boutons d'allure : visibles quand on monte en balade libre (pas pendant une activité, un voyage, la vue
   * d'ensemble ni une fenêtre qui prend l'écran) ; le bouton de l'allure choisie est allumé, et celui du galop
   * clignote quand on « court » (grand galop).
   */
  updateGaitPad() {
    const g = this.game;
    const pl = g?.player;
    const show = !!pl?.mount && g.running && !g.activities?.active && !g.tripFlow?.active && !g.mgmt?.active && !this.isBlocking();
    if (this.gaitPad.hidden === show) this.gaitPad.hidden = !show;
    if (!show) return;
    const lang = getLang();
    if (this.gaitLang !== lang) {
      this.gaitLang = lang;
      this.gaitPad.setAttribute('aria-label', t('ride_gait'));
      for (const [k, b] of Object.entries(this.gaitBtns)) {
        b.querySelector('.gait-name').textContent = t(`ride_gait_${k}`);
        b.title = `${t(`ride_gait_${k}`)} (${b.querySelector('kbd').textContent})`;
      }
    }
    for (const [k, b] of Object.entries(this.gaitBtns)) {
      const on = pl.gait === k;
      if (b.classList.contains('on') !== on) {
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      }
      const gal = k === 'canter' && pl.gaitNow === 'gallop';
      if (b.classList.contains('gallop') !== gal) b.classList.toggle('gallop', gal);
    }
  }

  refresh() {
    const g = this.game;
    if (!g?.profile || !this.hudInfo) return;
    this.updateGaitPad();
    const s = g.hud();
    const set = (el, text) => { if (el.textContent !== text) el.textContent = text; };
    const narrow = isPhone(); // téléphone : carte sur deux lignes + barre du temps
    const money = s.money === null ? t('infinite') : s.money;
    set(this.hudName, `👤 ${s.name}`);
    set(this.hudCoin, `🪙 ${money}`);
    set(this.hudLevel, `⭐ ${t(narrow ? 'levelShort' : 'level', { n: s.level })}`);
    const xp = `${Math.round(s.levelProgress * 100)}%`;
    if (this.xpFill.style.width !== xp) this.xpFill.style.width = xp;
    const placeIcon = s.isHome ? '🏠' : s.place.flag;
    const weather = `${WEATHER_EMOJI[s.weather]} ${t('weatherNow', { w: t(`w_${s.weather}`), t: s.temperature })}`;
    const clock = `📅 ${t('day', { n: s.day })} · 🕐 ${formatClock(s.clock)}`;
    // Téléphone : date, heure et météo sur une ligne (le drapeau du pays quand on voyage) ; le détail en info-bulle.
    set(this.hudClock, narrow
      ? `${clock} · ${s.isHome ? '' : `${s.place.flag} `}${WEATHER_EMOJI[s.weather]} ${s.temperature} °C${g.timeScale === 0 ? ' · ⏸' : ''}`
      : `${clock}${g.timeScale === 0 ? ` · ⏸ ${t('paused')}` : ''}`);
    set(this.hudPlace, `${placeIcon} ${L(s.place.name)}`);
    set(this.hudWeather, `${weather} · ${t(`season_${s.season}`)}`);
    this.hudPlace.hidden = narrow;
    this.hudWeather.hidden = narrow;
    const tip = narrow ? `${placeIcon} ${L(s.place.name)} · ${weather} · ${t(`season_${s.season}`)}` : '';
    if (this.hudInfo.title !== tip) this.hudInfo.title = tip;
    this.updateTimeBar();
    if (this.panel?.live && !this.holding) this.refreshPanel();
    // Une nouvelle heure : les panneaux qui en dépendent (refuge, animalerie ou vétérinaire qui ouvrent, petits
    // boulots, maison où l'on peut enfin dormir…) se redessinent aussi, même s'ils ne sont pas « vivants » : au ⏩,
    // le refuge restait affiché « Fermé » après 9 h tant qu'on ne le refermait pas.
    const hourNow = Math.floor(s.clock / 60);
    if (hourNow !== this.panelHour && !this.holding && performance.now() >= this.panelBusyUntil) {
      const changed = this.panelHour !== undefined;
      this.panelHour = hourNow;
      if (changed && this.panel && !this.panel.live) this.renderPanel();
    }
    this.renderStatus();
    this.pauseBanner.hidden = !g.paused;
    this.fitToasts();
  }

  /**
   * Étiquettes des noms au-dessus des animaux proches, qu'on peut toucher.
   * Quand plusieurs animaux sont serrés, les étiquettes s'écartent pour rester lisibles.
   */
  updateLabels(entities, camera, playerPos) {
    // Plan rapproché (tour du spectacle, photo du podium : CameraRig.focus) : pas d'étiquettes, elles flotteraient
    // loin au-dessus de l'animal filmé de près.
    if ((this.game?.rig?.shotK ?? 0) > 0.3) {
      this.clearLabels();
      return;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    const seen = new Set();
    const placed = [];
    const items = [];
    for (const e of entities) {
      if (e.ridden || e.inside) continue; // (dans la maison des animaux : on ne le voit pas)
      const d = e.position.distanceTo(playerPos);
      if (d > 14) continue;
      const v = e.position.clone();
      v.y += e.label.position.y;
      v.project(camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1 || v.y < -1.1 || v.y > 1.1) continue;
      items.push({ e, x: (v.x + 1) / 2 * W, y: (1 - v.y) / 2 * H, d });
    }
    items.sort((a, b) => a.d - b.d);
    for (const it of items) {
      const a = it.e.data;
      seen.add(a.id);
      let el = this.labelEls.get(a.id);
      if (!el) {
        el = h('button', { class: 'animal-label', onClick: (ev) => {
          ev.stopPropagation();
          const e = this.game.entities.get(a.id); // retrouvée au clic : l'entité change à chaque rechargement du lieu
          if (e) this.game.walkTo(e.position, e.radius + 1.2, () => this.openAnimalActions(e.data), true);
        } });
        this.labels.append(el);
        this.labelEls.set(a.id, el);
      }
      const m = this.game.moodOf(a);
      const text = `${{ happy: '😄', ok: '🙂', sad: '😢', sick: '🤒' }[m]} ${a.name}${it.e.sleeping ? ' 💤' : ''}`;
      // Bébés serrés (portée, chiots achetés ensemble) : une seule étiquette « 😄 Oscar +2 » pour le groupe (celle
      // du plus proche), au lieu d'une pile de bulles qui cache les petits ; et une pastille plus petite.
      const baby = lifeStage(a) === 'baby';
      el.classList.toggle('baby', baby);
      const grp = baby ? placed.find((q) => q.baby && Math.abs(q.ax - it.x) < 80 && Math.abs(q.ay - it.y) < 60) : null;
      if (grp) {
        grp.extra++;
        el.hidden = true;
        continue;
      }
      el.hidden = false;
      // Écarte l'étiquette vers le haut tant qu'elle chevauche une autre. La zone qu'on touche fait 44 px de
      // haut (la pastille visible 28 px, au milieu, cf. .animal-label) : on les espace donc de 46 px.
      const w = (baby ? 12 : 14) + (text.length + (baby ? 3 : 0)) * (baby ? 7 : 8);
      let y = it.y;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find((q) => Math.abs(q.x - it.x) < (q.w + w) / 2 && Math.abs(q.y - y) < 44);
        if (!hit) break;
        y = hit.y - 46;
      }
      placed.push({ x: it.x, y, w, ax: it.x, ay: it.y, baby, extra: 0, el, text });
      el.style.transform = `translate(${it.x - w / 2}px, ${y - 38}px)`;
      el.style.opacity = it.d > 10 ? 0.6 : 1;
    }
    for (const q of placed) {
      const text = q.extra ? `${q.text} +${q.extra}` : q.text;
      if (q.el.textContent !== text) q.el.textContent = text;
    }
    for (const [id, el] of this.labelEls) {
      if (!seen.has(id)) {
        el.remove();
        this.labelEls.delete(id);
      }
    }
  }

  clearLabels() {
    for (const el of this.labelEls.values()) el.remove();
    this.labelEls.clear();
  }

  /** « Ma liste de tâches », en bas à droite. */
  renderTasks() {
    const q = this.game?.tasks;
    if (!q) return;
    this.taskBox.hidden = !q.tasks.length;
    if (!q.tasks.length) {
      this.taskBox.replaceChildren();
      return;
    }
    const cur = q.current?.task;
    const open = this.taskOpen !== false;
    const head = h('div', { class: 'task-head' },
      h('button', { class: 'task-toggle', onClick: () => { this.taskOpen = !open; this.renderTasks(); } }, `📝 ${t('myTasks')} (${q.tasks.length}) ${open ? '▾' : '▸'}`),
      q.running
        ? h('button', { class: 'small', onClick: () => q.stop() }, `⏹ ${t('tasksStop')}`)
        : h('button', { class: 'small primary', onClick: () => q.start() }, `▶ ${t('tasksGo')}`));
    const rows = open ? q.tasks.map((task, i) => h('div', { class: `task-row ${task === cur ? 'current' : ''}` },
      h('span', { class: 'task-label' }, `${task.icon} ${task.label}`),
      h('button', { class: `task-mode ${task.mode}`, onClick: () => q.toggleMode(task.id), title: t('taskModeHelp') }, task.mode === 'auto' ? `🤖 ${t('taskAuto')}` : `✋ ${t('taskManual')}`),
      i > 0 ? h('button', { class: 'task-icon', onClick: () => q.move(task.id, -1), 'aria-label': '↑' }, '↑') : h('span', { class: 'task-icon-space' }),
      h('button', { class: 'task-icon', onClick: () => q.remove(task.id), 'aria-label': '✕' }, '✕'))) : [];
    const manual = q.current?.phase === 'manual'
      ? h('div', { class: 'task-manual' }, h('span', {}, `✋ ${t('taskYourTurn')}`), h('button', { class: 'small primary', onClick: () => q.next() }, `✓ ${t('taskDone')}`))
      : null;
    this.taskBox.replaceChildren(...[head, manual, ...rows].filter(Boolean));
  }

  /** Bandeau d'état : qui me suit, sur qui je suis monté, le troupeau en route. */
  renderStatus() {
    const g = this.game;
    const chips = [];
    const chip = (text, label, fn) => h('div', { class: 'status-chip' }, h('span', {}, text), h('button', { class: 'small', onClick: fn }, label));
    if (g.player.mount) {
      const a = g.player.mount.data;
      chips.push(chip(`🏇 ${t('statusRiding', { name: a.name, g: a.sex })}`, t('dismount'), () => { g.dismount(); this.renderStatus(); }));
    }
    // Pendant le chargement du véhicule, les voyageurs sont déjà dans le bandeau « Chargement » (moins de bandeaux sur téléphone).
    const loadingIds = g.tripFlow?.loading?.vehicle ? g.tripFlow.loading.ids : [];
    for (const a of g.animalsHere().filter((x) => x.following && !loadingIds.includes(x.id))) {
      const label = a.leashed ? t('statusLeash', { name: a.name, g: a.sex }) : t('statusFollowing', { name: a.name, g: a.sex });
      chips.push(chip(`🦮 ${label}`, t('statusStop'), () => { if (a.leashed) g.toggleLeash(a); else g.toggleFollow(a); this.renderStatus(); }));
    }
    if (g.herding.active) {
      const pd = g.herding.active.pusher.data;
      chips.push(chip(`🐕 ${t('statusHerding', { name: pd.name, g: pd.sex })}`, t('statusStop'), () => { g.herding.stop(false); this.renderStatus(); }));
    }
    chips.push(...tripChips(this)); // chargement du véhicule de voyage
    chips.push(...(g.events?.statusChips(chip) ?? [])); // événement en cours (bandeau réduit)
    chips.push(...(g.venue?.statusChips(chip) ?? [])); // concours du jour sur place (src/game/CompetitionVenue.js)
    chips.push(...(g.clients?.statusChips(chip) ?? [])); // visiteur, clients (pension, soins, beauté)
    chips.push(...(g.dogTrainer?.statusChips(chip) ?? [])); // un maître attend près de la niche (éducateur canin)
    chips.push(...(g.groomer?.statusChips(chip) ?? [])); // clients qui attendent au salon de toilettage
    chips.push(...(g.trailGuide?.statusChips(chip) ?? [])); // 🧭 visiteurs, balade à préparer, rendez-vous ailleurs
    chips.push(...careerChips(this, chip)); // la prochaine case du carnet du métier suivi (moins pressée : en dernier)
    // Avec plusieurs métiers, les pastilles s'empilent et cachent le jeu : on en montre STATUS_MAX, les autres
    // derrière « ➕ N de plus » (on peut tout déplier, puis replier).
    const all = chips;
    const extra = all.length - STATUS_MAX;
    let shown = all;
    if (extra > 0) {
      const toggle = () => { this.statusOpen = !this.statusOpen; this.statusKey = null; this.renderStatus(); };
      const more = h('div', { class: 'status-chip status-more' },
        h('button', { class: 'small', onClick: toggle, 'aria-expanded': this.statusOpen ? 'true' : 'false' },
          this.statusOpen ? t('statusLess') : t('statusMore', { n: extra + 1 })));
      shown = this.statusOpen ? [...all, more] : [...all.slice(0, STATUS_MAX - 1), more];
    } else this.statusOpen = false;
    const key = shown.map((c) => c.textContent).join('|');
    if (key === this.statusKey) return;
    this.statusKey = key;
    this.statusBar.replaceChildren(...shown);
  }

  /** Barre du temps : pause, ▶, ⏩ et 🤖 Auto. Créée une fois ; updateTimeBar() allume le bon bouton. */
  timeControls() {
    const g = this.game;
    const b = (label, scale, title) => h('button', {
      class: 'time-btn',
      'data-scale': scale,
      title,
      onClick: () => g.setTimeScale(scale),
    }, label);
    this.timeBtns = [b('⏸', 0, t('pause')), b('▶', 1, t('timeNormal')), b('⏩', 3, t('timeFast'))];
    // 🤖 Auto : le personnage s'occupe tout seul des tâches simples (visibles dans « Ma liste »).
    this.autoBtn = h('button', {
      class: 'time-btn auto',
      title: t('autoModeHelp'),
      onClick: () => g.tasks.setAuto(!g.tasks.autoMode),
    }, `🤖 ${t('autoMode')}`);
    return h('div', { class: 'time-bar' }, ...this.timeBtns, this.autoBtn);
  }

  updateTimeBar() {
    const g = this.game;
    if (!this.timeBtns) return;
    for (const b of this.timeBtns) b.classList.toggle('on', g.timeScale === Number(b.dataset.scale));
    this.autoBtn.classList.toggle('on', !!g.tasks?.autoMode);
  }

  openSkipMenu() {
    const g = this.game;
    const busy = g.needsAttention();
    const go = (fn) => () => {
      this.hideModal();
      fn();
    };
    // Une heure déjà passée : c'est demain (le bouton le dit) ; plus de 12 h d'attente : on demande d'abord
    // (« Jusqu'à 21 h » choisi à 22 h 24 sautait presque une journée entière sans prévenir).
    const hour = (hh, label) => {
      const tomorrow = hh - g.hour <= 0.05;
      const wait = tomorrow ? hh - g.hour + 24 : hh - g.hour;
      const skip = () => {
        this.hideModal();
        if (wait <= 12) return g.skipTo(hh);
        return this.confirm(t('skipLongAsk', { h: Math.round(wait) })).then((ok) => ok && g.skipTo(hh));
      };
      return h('button', { class: 'big-action', onClick: skip },
        h('span', { class: 'ba-icon' }, label), h('span', { class: 'ba-text' }, h('b', {}, t(tomorrow ? 'skipToHourTomorrow' : 'skipToHour', { h: fmtHour(hh) }))));
    };
    this.showModal([
      h('h3', {}, `⏭ ${t('skipTitle')}`),
      busy.length ? h('p', { class: 'warn' }, t('skipBusy', { name: busy[0].a.name, g: busy[0].a.sex, what: t(`attn_${busy[0].what}`, { g: busy[0].a.sex }) })) : null,
      h('div', { class: 'action-sheet' },
        h('button', { class: 'big-action primary', onClick: go(() => g.skipAhead(true)) }, h('span', { class: 'ba-icon' }, '✨'), h('span', { class: 'ba-text' }, h('b', {}, t('skipNext')))),
        hour(7, '🌅'), hour(12, '☀️'), hour(18, '🌇'), hour(21, '🌙')),
      h('div', { class: 'row end' }, h('button', { onClick: () => this.hideModal() }, t('cancel'))),
    ]);
  }

  setFocus(f) {
    if (!f) {
      this.actionBtn.hidden = true;
      return;
    }
    // Coin de l'écurie ou de la maison (src/game/Interiors.js).
    if (f.kind === 'spot') {
      this.actionBtn.replaceChildren(h('span', {}, f.icon), ` ${f.label()}`, h('kbd', {}, 'E'));
      this.actionBtn.hidden = false;
      return;
    }
    if (f.kind === 'vehicle') { // voyage : faire monter les animaux (game/TripFlow.js)
      this.actionBtn.replaceChildren(this.game.tripFlow.focusLabel(), h('kbd', {}, 'E'));
      this.actionBtn.hidden = false;
      return;
    }
    const labels = {
      animal: () => t('interact', { name: f.entity.data.name }),
      helper: () => t('talkTo', { name: f.helper.data.name }),
      refuge: () => (this.game.isHome ? t('enterRefuge') : t('enterBreeder')),
      vet: () => t('enterVet'),
      house: () => t('enterHouse'),
      lodge: () => t('enterLodge'),
      jobs: () => t('jobBoard'),
      petshop: () => t('bld_petshop'),
      tackroom: () => t('bld_tackroom'),
      pethouse: () => t('bld_pethouse'),
      stable: () => t('bld_stable'),
      paddock: () => t('bld_paddock'),
      kennel: () => t('bld_kennel'),
      hutch: () => t('bld_hutch'),
      pen: () => t('bld_pen'),
      showground: () => t('actv_enterShowground'),
      salon: () => this.game.groomer?.focusLabel() ?? t('grm_enter'), // salon de toilettage (src/game/Groomer.js)
      dismount: () => t('dismount'),
      client: () => t('cl_talk', { owner: f.name }), // visiteur (src/game/Clients.js)
      trailVisitor: () => t('tg_talk'), // 🧭 visiteurs (src/game/TrailGuide.js)
    };
    const emoji = { animal: '🤲', helper: '💬', client: '💬', trailVisitor: '🧭', refuge: '🐾', vet: '🩺', house: '🏠', lodge: '🛏️', jobs: '📋', petshop: '🛒', tackroom: '🏇', pethouse: '🐾', stable: '🐴', paddock: '🌾', kennel: '🐶', hutch: '🐰', pen: '🐑', showground: '🏆', salon: '✂️', dismount: '⬇️' }[f.kind];
    this.actionBtn.replaceChildren(h('span', {}, emoji), ` ${labels[f.kind]()}`, h('kbd', {}, 'E'));
    this.actionBtn.hidden = false;
  }

  /** Montre ce que le soin a changé : « 🍖 Faim 30 → 75 ». */
  showDeltas(a, before) {
    const parts = [];
    for (const [n, v] of Object.entries(a.needs)) {
      const d = Math.round(v - before[n]);
      if (Math.abs(d) >= 1) parts.push(`${NEED_ICON[n]} ${t(`need_${n}`)} ${Math.round(before[n])} → ${Math.round(v)}`);
    }
    if (parts.length) this.toast(t('careDeltas', { name: a.name, parts: parts.join(' · ') }), 3500);
  }

  /**
   * « ⭐ Tu passes au niveau 2 ! » : annoncé un instant après ce qui l'a fait gagner (LEVEL_UP_DELAY), pour
   * qu'on voie d'abord l'achat ou le soin (l'animal acheté qui arrive, « Tu as adopté Pompon ! ») au lieu
   * d'une fenêtre qui le cache. Plusieurs niveaux d'un coup : une fenêtre par niveau, à la suite.
   */
  levelUp(level, names) {
    const msg = names ? t('levelUp', { n: level, names }) : t('levelUpPlain', { n: level });
    (this.levelQueue ??= []).push(msg);
    clearTimeout(this.levelTimer);
    this.levelTimer = setTimeout(() => this.flushLevelUps(), LEVEL_UP_DELAY);
  }

  /** Montre les passages de niveau en attente (voir levelUp). */
  flushLevelUps() {
    clearTimeout(this.levelTimer);
    this.levelTimer = null;
    const list = (this.levelQueue ?? []).splice(0);
    if (!list.length || !this.game?.running) return;
    audio.ui('levelUp');
    // Une fenêtre est ouverte (résultats d'un concours…), une activité est en cours (reprise de dressage,
    // parcours : la fenêtre cachait la carrière et mettait les résultats en attente) ou un panneau est ouvert
    // (on est retourné à l'animalerie juste après un achat : la fenêtre arrivait par-dessus) : en bulle.
    const quiet = this.modalOpen || !!this.panel || !!this.game.activities?.active;
    for (const msg of list) {
      if (quiet) this.toast(msg, 8000); // (le texte commence déjà par ⭐)
      else this.alert(msg); // (la deuxième attend que l'on ferme la première, voir showModal)
    }
  }

  // ------------------------------------------------------------ notifications

  /**
   * Petit message. opts.group : les messages d'un même groupe encore affichés sont réunis dans une seule
   * bulle (une ligne chacun) au lieu de s'empiler, par ex. 'visitors' pour les arrivées des métiers.
   */
  toast(msg, ms = 3200, opts = null) {
    audio.ui('toast');
    // (typographie française : « balade / ! Lis leur demande » se coupait avant le point d'exclamation)
    const text = typeof msg === 'string' ? nbsp(msg) : msg;
    const group = opts?.group;
    const same = group && [...this.toasts.children].find((x) => x.dataset.group === group && !x.classList.contains('out'));
    if (same) {
      if (!same.querySelector('.toast-line')) same.replaceChildren(h('div', { class: 'toast-line' }, ...same.childNodes));
      same.classList.add('grouped');
      same.append(h('div', { class: 'toast-line' }, text));
      this.toasts.append(same); // (le plus récent en bas, comme un nouveau message)
      this.fitToasts();
      this.toastTimers(same, ms);
      return null;
    }
    const el = h('div', { class: 'toast' }, text);
    if (group) el.dataset.group = group;
    this.toasts.append(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    this.fitToasts();
    this.toastTimers(el, ms);
    return null;
  }

  /** Le message s'efface après ms (une bulle de groupe qui reçoit une ligne repart pour ms de plus). */
  toastTimers(el, ms) {
    clearTimeout(el._outT);
    clearTimeout(el._rmT);
    el._outT = setTimeout(() => el.classList.add('out'), ms);
    el._rmT = setTimeout(() => el.remove(), ms + 400);
  }

  /**
   * Les messages ne sortent jamais par le bas de l'écran (paysage : peu de hauteur) et ne descendent pas sur la
   * carte du bandeau d'événement posée plus bas (paysage) : les plus anciens partent.
   */
  fitToasts() {
    const box = this.toasts;
    if (box.children.length < 2) return;
    let limit = window.innerHeight - safeInsets().b - 8;
    const card = document.querySelector('#ev-banner:not([hidden]) > .ev-card');
    if (card) {
      const c = card.getBoundingClientRect();
      const r = box.getBoundingClientRect();
      // (seulement si la carte est sous le haut des messages et en face d'eux : en portrait, elle est au-dessus)
      if (c.height && c.top > r.top && c.left < r.right && c.right > r.left) limit = Math.min(limit, c.top - 6);
    }
    while (box.children.length > 1 && box.getBoundingClientRect().bottom > limit) box.firstChild.remove();
  }

  /** Millisecondes depuis la fermeture de la dernière fenêtre (0 si une fenêtre est ouverte ou attend). */
  sinceModal() {
    if (this.modalOpen || this.modalQueue.length) return 0;
    return this.modalClosedAt === undefined ? Infinity : performance.now() - this.modalClosedAt;
  }

  isBlocking() {
    // tripBlocking : écran du trajet ; vxOpen : examen ou leçon vétérinaire ouverts (src/ui/vetExam.js)
    return this.modalOpen || !this.screen.hidden || !!this.tripBlocking || this.vxOpen > 0;
  }

  showModal(content) {
    // Pas par-dessus un mini-jeu en cours (#modal, z-index 50, couvrait .mg-overlay, 45 : « ⭐ Tu
    // passes au niveau 2 ! » en plein milieu des griffes) : la fenêtre attend la fin du mini-jeu,
    // qui appelle flushModals en se fermant. Ses boutons (et ses promesses) marchent pareil.
    // Ni à la place d'une fenêtre déjà ouverte : « ⭐ Niveau 2 » remplaçait la fenêtre du nom (le nom tapé était
    // perdu, l'adoption n'aboutissait jamais), une alerte ou l'annonce d'un orage, et la promesse de la fenêtre
    // remplacée ne se résolvait jamais. Elle attend qu'on ferme celle-ci (hideModal la ressort). Les boutons des
    // fenêtres appellent hideModal avant d'en ouvrir une autre : cette suite-là passe tout de suite.
    // Pas non plus par-dessus l'examen ou une leçon vétérinaire (vxOpen, .vx-overlay sous #modal) : la
    // fenêtre attend leur fermeture (openOverlay de src/ui/vetExam.js appelle flushModals).
    if (this.minigameOpen || this.modalOpen || this.vxOpen > 0) {
      this.modalQueue.push(content);
      return;
    }
    // Ce qui avait le focus avant (un bouton du panneau…) le retrouve à la fermeture (hideModal).
    const prev = document.activeElement;
    if (prev && prev !== document.body && !this.modal.contains(prev)) this.modalReturn = prev;
    this.modalOpen = true;
    this.game && (this.game.input.enabled = false);
    this.modal.replaceChildren(h('div', { class: 'modal-box', tabindex: '-1' }, content));
    this.modal.hidden = false;
    document.body.classList.add('modal-open');
    this.watchTutoBubble();
    // Champ à remplir : le focus est donné ici, tout de suite, encore dans le geste (le tap) qui a ouvert la
    // fenêtre ; sur iPhone, c'est la seule façon d'ouvrir le clavier sans que l'enfant touche le champ.
    const field = this.modal.querySelector('input[data-autofocus]');
    if (field) {
      focusField(field, true);
      // Repli (fenêtre sortie de la file d'attente, navigateur qui refuse) : un peu plus tard, hors du geste.
      if (document.activeElement !== field) setTimeout(() => { if (field.isConnected) focusField(field, true); }, 30);
    } else {
      // Sinon le bouton principal prend le focus : Entrée le choisit, Tab passe aux autres boutons de la fenêtre.
      this.focusModal();
    }
  }

  /** Boutons et champs de la fenêtre ouverte que l'on peut atteindre au clavier (dans l'ordre). */
  modalFocusables() {
    const box = this.modal.querySelector('.modal-box');
    if (!box) return [];
    return [...box.querySelectorAll(FOCUSABLE)].filter((el) => el.getClientRects().length > 0);
  }

  /** Focus sur le bouton par défaut de la fenêtre : data-default, sinon le bouton principal, sinon le dernier. */
  focusModal() {
    const box = this.modal.querySelector('.modal-box');
    if (!box) return;
    const list = this.modalFocusables();
    const buttons = list.filter((el) => el.tagName === 'BUTTON');
    const el = list.find((x) => x.hasAttribute('data-default')) ?? buttons.find((b) => b.classList.contains('primary')) ?? buttons.at(-1) ?? list[0] ?? box;
    el.focus({ preventScroll: true });
  }

  /** Tab / Maj+Tab dans une fenêtre : on reste dans ses boutons (du dernier, on revient au premier). */
  trapModalTab(e) {
    const list = this.modalFocusables();
    e.preventDefault();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const next = i < 0 ? (e.shiftKey ? list.at(-1) : list[0]) : list[(i + (e.shiftKey ? -1 : 1) + list.length) % list.length];
    next.focus();
  }

  /**
   * Échap dans une fenêtre : le bouton marqué data-escape (Annuler, OK d'une alerte) ; une fenêtre à un seul
   * bouton se ferme avec lui. Une fenêtre à plusieurs choix sans data-escape attend qu'on choisisse.
   */
  escapeModal(e) {
    const buttons = this.modalFocusables().filter((el) => el.tagName === 'BUTTON');
    const btn = buttons.find((b) => b.hasAttribute('data-escape')) ?? (buttons.length === 1 ? buttons[0] : null);
    if (!btn) return;
    e.preventDefault(); // (le jeu ne reçoit pas aussi Échap : on ne sort pas du véhicule en fermant une fenêtre)
    btn.click();
  }

  /**
   * Fenêtre ouverte pendant le tutoriel : la bulle du guide monte en haut de l'écran (CSS, body.modal-open)
   * et la fenêtre commence sous elle (--modal-top) au lieu d'être cachée par elle (z-index 55 > 50).
   */
  watchTutoBubble() {
    const bubble = document.getElementById('tuto-bubble');
    if (bubble && !this.bubbleObserver && typeof ResizeObserver === 'function') {
      this.bubbleObserver = new ResizeObserver(() => this.syncModalTop());
      this.bubbleObserver.observe(bubble);
    }
    this.syncModalTop();
  }

  syncModalTop() {
    const bubble = document.getElementById('tuto-bubble');
    let top = '';
    if (this.modalOpen && bubble && !bubble.hidden) {
      const r = bubble.getBoundingClientRect();
      if (r.height > 0) top = `${Math.round(r.bottom - this.modal.getBoundingClientRect().top + 8)}px`;
    }
    if (this.modal.style.getPropertyValue('--modal-top') !== top) this.modal.style.setProperty('--modal-top', top);
  }

  hideModal() {
    this.modalOpen = false;
    this.modalClosedAt = performance.now();
    this.modal.hidden = true;
    document.body.classList.remove('modal-open');
    this.syncModalTop();
    if (this.game) this.game.input.enabled = !this.panel || !this.panel.blocking;
    // Le focus revient où il était avant la fenêtre (sauf si une autre fenêtre, un mini-jeu… l'a pris entre-temps).
    setTimeout(() => {
      if (this.modalOpen) return; // une autre fenêtre a pris la suite : elle le rendra en se fermant
      const back = this.modalReturn;
      this.modalReturn = null;
      const a = document.activeElement;
      if (a && a !== document.body && !this.modal.contains(a)) return;
      // Le suivi de quête est rangé tant qu'une fenêtre est ouverte (renderTracker) : on le ressort d'abord,
      // sinon son bouton (‹ ranger, 🧭) choisi au clavier avant la fenêtre serait encore caché.
      this.tutorial?.renderTracker?.();
      const visible = (el) => el?.isConnected && el.getClientRects().length > 0 && !['INPUT', 'TEXTAREA'].includes(el.tagName);
      // Le bouton a été redessiné pendant que la fenêtre était ouverte (bulle du guide, panneau vivant) :
      // on reprend son remplaçant, le bouton visible qui porte le même texte.
      const same = back && !visible(back) && back.textContent
        ? [...document.querySelectorAll('button, a[href]')].find((el) => el.textContent === back.textContent && visible(el) && !this.modal.contains(el))
        : null;
      const target = visible(back) ? back : same;
      if (target) target.focus({ preventScroll: true });
      else if (this.panel) this.focusPanel();
      else a?.blur?.();
    }, 0);
    // La suivante en attente, s'il y en a : après coup, pour laisser la suite de celle-ci
    // (une autre fenêtre qu'elle ouvre tout de suite) passer d'abord.
    if (this.modalQueue.length) setTimeout(() => this.flushModals(), 0);
  }

  /** Montre la prochaine fenêtre mise en attente pendant un mini-jeu ou un examen véto (une à la fois). */
  flushModals() {
    if (this.minigameOpen || this.modalOpen || this.vxOpen > 0 || !this.modalQueue.length) return;
    this.showModal(this.modalQueue.shift());
  }

  alert(msg) {
    return new Promise((resolve) => {
      this.showModal([h('p', {}, msg), h('div', { class: 'row end' }, h('button', { class: 'primary', 'data-escape': true, onClick: () => { this.hideModal(); resolve(); } }, 'OK'))]);
    });
  }

  confirm(msg) {
    return new Promise((resolve) => {
      const done = (v) => { this.hideModal(); resolve(v); };
      this.showModal([
        h('p', {}, msg),
        h('div', { class: 'row end' },
          h('button', { 'data-escape': true, onClick: () => done(false) }, t('cancel')),
          h('button', { class: 'danger', 'data-default': true, onClick: () => done(true) }, 'OK')),
      ]);
    });
  }

  /**
   * Demande un texte (un nom). info : contenu affiché au-dessus du champ (ex. fiche de l'animal).
   * À appeler directement dans le gestionnaire du tap (avant tout await) : le champ reçoit alors le focus
   * dans le geste et le clavier de l'iPhone s'ouvre tout seul (voir showModal).
   */
  prompt(label, value = '', info = null) {
    return new Promise((resolve) => {
      const input = h('input', {
        type: 'text', value, maxlength: 20, id: 'prompt-input', 'data-autofocus': true,
        // Des prénoms inventés : ni correction automatique ni suggestions ; « OK » sur la touche Entrée du clavier.
        enterkeyhint: 'done', autocapitalize: 'words', autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
      });
      let finished = false;
      const done = (v) => {
        if (finished) return;
        finished = true;
        this.hideModal();
        resolve(v);
      };
      input.addEventListener('keydown', (e) => {
        if (e.isComposing) return; // Entrée qui valide un mot en cours de saisie (accents, japonais…)
        if (e.key === 'Enter' || e.key === 'Escape') {
          // La touche est traitée ici : elle ne remonte pas jusqu'au jeu (Échap fermait aussi le panneau dessous).
          e.preventDefault();
          e.stopPropagation();
          done(e.key === 'Enter' ? input.value : null);
        }
      });
      this.showModal([
        info,
        h('label', { class: 'field' }, h('span', {}, label), input),
        value ? h('p', { class: 'note' }, t('keepNameHint', { name: value })) : null,
        h('div', { class: 'row end' },
          h('button', { onClick: () => done(null) }, t('cancel')),
          h('button', { class: 'primary', onClick: () => done(input.value) }, 'OK')),
      ]);
    });
  }

  // ------------------------------------------------------------ panneaux

  openPanel({ title, render, live = false, animalId = null, kind = '' }) {
    this.panel = { title, render, live, animalId, kind };
    // L'en-tête (titre, croix) est créé une fois par panneau : la croix reste le même bouton pendant
    // toute la vie du panneau, les redessins ne touchent que le corps.
    this.panelTitle = h('h2', {});
    this.panelBody = h('div', { class: 'panel-body' });
    this.panelEl.replaceChildren(
      h('header', { class: 'panel-head' }, this.panelTitle,
        h('button', { class: 'close', onClick: () => this.closePanel(), 'aria-label': t('close') }, '✕')),
      this.panelBody,
    );
    this.panelEl.hidden = false;
    document.body.classList.add('panel-open'); // (CSS : bulle du guide, messages et pastilles hors du panneau)
    this.renderPanel(true);
    this.tutorial?.layoutTop?.(); // téléphone : la fiche commence sous la bulle du guide
  }

  /** Redessine le panneau tout de suite (changement d'onglet, action faite…). */
  renderPanel(first = false) {
    const p = this.panel;
    if (!p || !this.panelBody) return;
    this.panelDirty = false;
    const title = typeof p.title === 'function' ? p.title() : p.title;
    if (this.panelTitle.textContent !== title) this.panelTitle.textContent = title;
    const scroll = first ? 0 : this.panelBody.scrollTop;
    const fresh = h('div', {}, p.render());
    // Rien n'a changé à l'écran : on garde les boutons existants (moins de redessins = moins de taps perdus).
    if (!first && fresh.innerHTML === this.panelBody.innerHTML) return;
    // Au clavier, le bouton choisi avec Tab garde le focus après le redessin (même texte, sinon même place) :
    // sans ça, chaque mise à jour des barres renvoyait le focus tout en haut de la page.
    const active = document.activeElement;
    let keep = null;
    if (!first && active && active !== this.panelBody && this.panelBody.contains(active)) {
      const list = [...this.panelBody.querySelectorAll(FOCUSABLE)];
      keep = { i: list.indexOf(active), text: active.textContent };
    }
    this.panelBody.replaceChildren(...fresh.childNodes);
    this.panelBody.scrollTop = scroll;
    if (keep) {
      const list = [...this.panelBody.querySelectorAll(FOCUSABLE)];
      const el = list.find((x) => x.textContent === keep.text) ?? list[Math.min(Math.max(keep.i, 0), list.length - 1)];
      el?.focus({ preventScroll: true });
    }
  }

  /**
   * Donne le focus au premier bouton du panneau (panneau ouvert au clavier). like : { text, label } d'un bouton
   * disparu dans un redessin (« Caresser » après le mini-jeu) : son remplaçant (même texte, ou même intitulé
   * en gras quand l'effet affiché a changé, « Affection +28 » → « +5 ») le reprend.
   */
  focusPanel(like = null) {
    const list = this.panelBody ? [...this.panelBody.querySelectorAll(FOCUSABLE)] : [];
    const label = (el) => el.querySelector('b')?.textContent ?? null;
    const same = like ? list.find((x) => x.textContent === like.text) ?? (like.label ? list.find((x) => label(x) === like.label) : null) : null;
    const el = same ?? list[0] ?? this.panelEl.querySelector(FOCUSABLE);
    el?.focus({ preventScroll: true });
  }

  /** Redessin automatique (panneau « vivant ») : reporté tant qu'un doigt vient de toucher le panneau. */
  refreshPanel() {
    if (!this.panel?.live) return;
    if (performance.now() < this.panelBusyUntil) {
      this.panelDirty = true;
      return;
    }
    this.renderPanel();
  }

  closePanel() {
    this.panel = null;
    this.panelBody = null;
    this.panelEl.hidden = true;
    document.body.classList.remove('panel-open');
    this.panelEl.replaceChildren();
    this.panelEl.style.maxHeight = '';
    if (this.game) this.game.input.enabled = true;
    this.tutorial?.layoutTop?.();
  }

  closePanelFor(animalId) {
    if (this.panel?.animalId === animalId) this.closePanel();
  }

  /**
   * Point d'entrée de chaque soin fait par le joueur : lance le mini-jeu du soin,
   * puis applique le soin avec la qualité obtenue (0 à 1).
   */
  async careWithGame(a, action) {
    const g = this.game;
    if (g.blockedByPause()) return null;
    let check = g.canCare(a, action);
    if (check.reason === 'needTool') {
      // Il manque l'outil (longe, shampoing…) : on propose de l'acheter maintenant, sans passer par la sellerie.
      const tool = check.tool;
      const label = `${TOOLS[tool].emoji} ${t(`tool_${tool}`)}`;
      // En voyage, l'outil est peut-être resté à la maison (pas dans le coffre de transport, src/sim/cargo.js).
      // (en bac à sable c'est gratuit : pas de prix dans la question, même si l'outil est resté à la maison)
      const key = `${toolAtHome(g.profile, tool) ? 'buyToolAskAway' : 'buyToolAsk'}${isSandbox(g.profile) ? 'Free' : ''}`;
      const ok = await this.confirm(t(key, { tool: label, price: TOOLS[tool].price }));
      if (!ok || !g.buyTool(tool)?.ok) return null;
      check = g.canCare(a, action);
    }
    if (!check.ok) return this.toast(t(check.reason === 'money' ? 'r_money' : `r_${check.reason}`, { name: a.name, g: a.sex }));
    const quality = await runMinigame(this, a, action);
    if (quality === null) return null; // fermé avec ✕ : rien n'est appliqué
    return g.care(a, action, quality);
  }

  /** Tonte ou traite (mini-jeu aussi). */
  async collectWithGame(a) {
    if (this.game.blockedByPause()) return null;
    // Pas encore prêt : collect() affiche pourquoi, sans mini-jeu.
    if (!a.produceReady) return this.game.collect(a);
    const quality = await runMinigame(this, a, 'collect');
    if (quality === null) return null;
    return this.game.collect(a);
  }

  // game.emit(…) : annonce les fenêtres ouvertes (utilisé par le tutoriel guidé et « Suivre la quête »).
  openAnimal(a) { panels.openAnimal(this, a); this.game?.emit('panel', 'animal'); }
  openAnimals() { panels.openAnimals(this); this.game?.emit('panel', 'animals'); }
  openAdoption() { panels.openAdoption(this); this.game?.emit('panel', 'adoption'); }
  openTravel() { panels.openTravel(this); this.game?.emit('panel', 'travel'); }
  openJournal(tab) { panels.openJournal(this, tab); this.game?.emit('panel', 'journal'); }
  openCareers() { openCareers(this); } // 💼 métiers (src/ui/careers.js)
  openJobs() { panels.openJobs(this); }
  openSettings() { panels.openSettings(this); this.game?.emit('panel', 'settings'); }
  openFarm() { panels.openFarm(this); this.game?.emit('panel', 'farm'); }
  openTack(opts) { panels.openTack(this, opts); } // sellerie : catalogue (src/ui/tack.js)
  openTackItem(id) { openTackItem(this, id); } // fiche d'un objet de la sellerie
  openShop() { panels.openShop(this); }
  openBuilding(kind) {
    if (kind === 'salon') return this.game?.groomer?.open(); // salon de toilettage (src/ui/groomer.js)
    openBuilding(this, kind);
    this.game?.emit('building', kind);
    return null;
  }
  // Bâtiments à entretenir (src/ui/facilitiesPanel.js)
  openFacility(kind) { openFacility(this, kind); }
  openBox(i) { openBox(this, i); }
  openBed() { openBed(this); }

  /**
   * Point d'entrée de chaque corvée (curer un box, balayer, ranger…) : lance son mini-jeu
   * (src/ui/minigames/chores.js) et renvoie la qualité (0,4 à 1), ou null si on abandonne
   * (Interiors.chore n'applique alors rien). Une corvée sans mini-jeu renvoie 1.
   */
  async choreWithGame(kind, target = null) {
    const g = this.game;
    if (g?.blockedByPause()) return null;
    const o = {};
    // Dans un box : son nom en sous-titre, et le cheval qui y habite regarde faire.
    if ((kind === 'muck' || kind === 'straw') && Number.isInteger(target) && g?.interiors) {
      o.subtitle = g.interiors.boxLabel(target);
      o.a = g.interiors.boxOccupant(target);
    }
    return runChoreGame(this, kind, target, o);
  }

  openAnimalActions(a) {
    if (a.stray) return this.game.events.askStray(this.game.events.active); // petit animal perdu (événement)
    const r = openAnimalActions(this, a);
    this.game?.emit('animalActions', a);
    return r;
  }
  openActivities(opts) { openActivities(this, opts); this.game?.emit('panel', 'activities'); }
  openHelper(h) { openHelperChat(this, h); this.game?.emit('panel', 'helper'); }
  openDogTrainer() { openDogTrainerPanel(this); this.game?.emit('panel', 'dogTrainer'); }
  openTrailGuide() { openTrailCarnet(this); this.game?.emit('panel', 'trailGuide'); } // 🧭 carnet du guide

  /** Un soin pour un groupe (foin pour tous les chevaux…) : un mini-jeu, appliqué à tout le groupe. */
  async groupCareWithGame(filter, action) {
    if (this.game.blockedByPause()) return null;
    return this.game.groupCare(filter, action, 1);
  }

  // ------------------------------------------------------------ commandes à l'écran

  onScreenControls() {
    try {
      const v = localStorage.getItem('animaleana.onscreen');
      if (v) return v === 'on';
    } catch {
      /* rien */
    }
    return matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  }

  setOnScreenControls(on) {
    try {
      localStorage.setItem('animaleana.onscreen', on ? 'on' : 'off');
    } catch {
      /* rien */
    }
    this.applyControls();
  }

  applyControls() {
    const on = this.onScreenControls();
    document.getElementById('joystick').hidden = !on;
    this.touchPad.hidden = !on;
  }
  openVetClinic() { panels.openVetClinic(this); this.game?.emit('panel', 'vetClinic'); }
  openVet(a, atClinic) { openVet(this, a, atClinic); this.game?.emit('panel', 'vetExam'); }
  openVetSchool() { openVetSchool(this); } // 🎓 école vétérinaire (src/ui/vetSchool.js)
}

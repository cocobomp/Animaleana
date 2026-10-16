// Interface : barre du haut, bouton d'action, notifications, fenêtres.

import { h, isPhone } from './dom.js';
import { t, L } from '../i18n.js';
import { formatClock } from '../sim/time.js';
import { WEATHER_EMOJI } from '../sim/places.js';
import * as panels from './panels.js';
import { openVet } from './vet.js';
import { runMinigame, runChoreGame } from './minigames.js';
import { showProfiles, showAvatarEditor } from './screens.js';
import { openBuilding, openAnimalActions } from './actions.js';
import { openHelp } from './help.js';
import { openFacility, openBox, openBed } from './facilitiesPanel.js'; // bâtiments à entretenir
import { tripChips } from './trip.js'; // voyages réalistes
import { openActivities } from './activities.js';
import { TOOLS } from '../sim/tools.js';
import { isSandbox } from '../sim/profile.js';
import { openHelperChat } from './helperChat.js'; // parler aux aides
import { audio } from '../game/audio.js'; // sons de l'interface (boutons, notifications)
import { openCareers, careerChips } from './careers.js'; // 💼 métiers

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
    root.append(this.touchPad, this.statusBar, this.labels);

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
      if (e.code === 'Escape') {
        if (this.modalOpen) return;
        if (this.panel) this.closePanel();
      }
    });
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
        btn('🗺️', t('mgmt_btn'), () => this.game.mgmt.toggle()), // vue d'ensemble
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

  /** « ⋯ Plus » (téléphone) : Activités, Avatar, Aide et Réglages dans une petite feuille. */
  openMore() {
    const item = (emoji, label, fn) => h('button', { class: 'big-action', onClick: () => { this.hideModal(); fn(); } },
      h('span', { class: 'ba-icon' }, emoji), h('span', { class: 'ba-text' }, h('b', {}, label)));
    this.showModal([
      h('div', { class: 'action-sheet more-sheet' },
        item('🏆', t('actv_hud'), () => this.openActivities()),
        item('👕', t('avatar'), () => this.showAvatarEditor(this.game.profile, () => this.clearScreen())),
        item('❓', t('help'), () => openHelp(this)),
        item('⚙️', t('settings'), () => this.openSettings())),
      h('div', { class: 'row end' }, h('button', { onClick: () => this.hideModal() }, t('cancel'))),
    ]);
  }

  refresh() {
    const g = this.game;
    if (!g?.profile || !this.hudInfo) return;
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
    this.renderStatus();
    this.pauseBanner.hidden = !g.paused;
  }

  /**
   * Étiquettes des noms au-dessus des animaux proches, qu'on peut toucher.
   * Quand plusieurs animaux sont serrés, les étiquettes s'écartent pour rester lisibles.
   */
  updateLabels(entities, camera, playerPos) {
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
      if (el.textContent !== text) el.textContent = text;
      // Écarte l'étiquette vers le haut tant qu'elle chevauche une autre.
      const w = 14 + text.length * 8;
      let y = it.y;
      for (let k = 0; k < 6; k++) {
        const hit = placed.find((q) => Math.abs(q.x - it.x) < (q.w + w) / 2 && Math.abs(q.y - y) < 30);
        if (!hit) break;
        y = hit.y - 32;
      }
      placed.push({ x: it.x, y, w });
      el.style.transform = `translate(${it.x - w / 2}px, ${y - 30}px)`;
      el.style.opacity = it.d > 10 ? 0.6 : 1;
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
    for (const a of g.animalsHere().filter((x) => x.following)) {
      const label = a.leashed ? t('statusLeash', { name: a.name, g: a.sex }) : t('statusFollowing', { name: a.name, g: a.sex });
      chips.push(chip(`🦮 ${label}`, t('statusStop'), () => { if (a.leashed) g.toggleLeash(a); else g.toggleFollow(a); this.renderStatus(); }));
    }
    if (g.herding.active) {
      const pd = g.herding.active.pusher.data;
      chips.push(chip(`🐕 ${t('statusHerding', { name: pd.name, g: pd.sex })}`, t('statusStop'), () => { g.herding.stop(false); this.renderStatus(); }));
    }
    chips.push(...tripChips(this)); // chargement du véhicule de voyage
    chips.push(...(g.events?.statusChips(chip) ?? [])); // événement en cours (bandeau réduit)
    chips.push(...(g.clients?.statusChips(chip) ?? []), ...careerChips(this, chip)); // visiteur, clients, carnet du métier
    const key = chips.map((c) => c.textContent).join('|');
    if (key === this.statusKey) return;
    this.statusKey = key;
    this.statusBar.replaceChildren(...chips);
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
    const hour = (hh, label) => h('button', { class: 'big-action', onClick: go(() => g.skipTo(hh)) },
      h('span', { class: 'ba-icon' }, label), h('span', { class: 'ba-text' }, h('b', {}, t('skipToHour', { h: hh }))));
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
      dismount: () => t('dismount'),
      client: () => t('cl_talk', { owner: f.name }), // visiteur (src/game/Clients.js)
    };
    const emoji = { animal: '🤲', helper: '💬', client: '💬', refuge: '🐾', vet: '🩺', house: '🏠', lodge: '🛏️', jobs: '📋', petshop: '🛒', tackroom: '🏇', pethouse: '🐾', stable: '🐴', paddock: '🌾', kennel: '🐶', hutch: '🐰', pen: '🐑', showground: '🏆', dismount: '⬇️' }[f.kind];
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
    if (parts.length) this.toast(`${a.name} : ${parts.join(' · ')}`, 3500);
  }

  levelUp(level, names) {
    audio.ui('levelUp');
    this.alert(names ? t('levelUp', { n: level, names }) : t('levelUpPlain', { n: level }));
  }

  // ------------------------------------------------------------ notifications

  toast(msg, ms = 3200) {
    audio.ui('toast');
    const el = h('div', { class: 'toast' }, msg);
    this.toasts.append(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
    return null;
  }

  isBlocking() {
    return this.modalOpen || !this.screen.hidden || !!this.tripBlocking; // tripBlocking : écran du trajet
  }

  showModal(content) {
    // Pas par-dessus un mini-jeu en cours (#modal, z-index 50, couvrait .mg-overlay, 45 : « ⭐ Tu
    // passes au niveau 2 ! » en plein milieu des griffes) : la fenêtre attend la fin du mini-jeu,
    // qui appelle flushModals en se fermant. Ses boutons (et ses promesses) marchent pareil.
    if (this.minigameOpen) {
      this.modalQueue.push(content);
      return;
    }
    this.modalOpen = true;
    this.game && (this.game.input.enabled = false);
    this.modal.replaceChildren(h('div', { class: 'modal-box' }, content));
    this.modal.hidden = false;
  }

  hideModal() {
    this.modalOpen = false;
    this.modal.hidden = true;
    if (this.game) this.game.input.enabled = !this.panel || !this.panel.blocking;
    // La suivante en attente, s'il y en a : après coup, pour laisser la suite de celle-ci
    // (une autre fenêtre qu'elle ouvre tout de suite) passer d'abord.
    if (this.modalQueue.length) setTimeout(() => this.flushModals(), 0);
  }

  /** Montre la prochaine fenêtre mise en attente pendant un mini-jeu (une à la fois). */
  flushModals() {
    if (this.minigameOpen || this.modalOpen || !this.modalQueue.length) return;
    this.showModal(this.modalQueue.shift());
  }

  alert(msg) {
    return new Promise((resolve) => {
      this.showModal([h('p', {}, msg), h('div', { class: 'row end' }, h('button', { class: 'primary', onClick: () => { this.hideModal(); resolve(); } }, 'OK'))]);
    });
  }

  confirm(msg) {
    return new Promise((resolve) => {
      const done = (v) => { this.hideModal(); resolve(v); };
      this.showModal([
        h('p', {}, msg),
        h('div', { class: 'row end' },
          h('button', { onClick: () => done(false) }, t('cancel')),
          h('button', { class: 'danger', onClick: () => done(true) }, 'OK')),
      ]);
    });
  }

  /** Demande un texte. info : contenu affiché au-dessus du champ (ex. fiche de l'animal). */
  prompt(label, value = '', info = null) {
    return new Promise((resolve) => {
      const input = h('input', { type: 'text', value, maxlength: 20, id: 'prompt-input' });
      const done = (v) => { this.hideModal(); resolve(v); };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(input.value);
        if (e.key === 'Escape') done(null);
      });
      this.showModal([
        info,
        h('label', { class: 'field' }, h('span', {}, label), input),
        value ? h('p', { class: 'note' }, t('keepNameHint', { name: value })) : null,
        h('div', { class: 'row end' },
          h('button', { onClick: () => done(null) }, t('cancel')),
          h('button', { class: 'primary', onClick: () => done(input.value) }, 'OK')),
      ]);
      setTimeout(() => { input.focus(); input.select(); }, 30);
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
    this.panelBody.replaceChildren(...fresh.childNodes);
    this.panelBody.scrollTop = scroll;
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
      const ok = await this.confirm(t(isSandbox(g.profile) ? 'buyToolAskFree' : 'buyToolAsk', { tool: label, price: TOOLS[tool].price }));
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
  openTack() { panels.openTack(this); }
  openShop() { panels.openShop(this); }
  openBuilding(kind) { openBuilding(this, kind); this.game?.emit('building', kind); }
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
  openActivities(opts) { openActivities(this, opts); }
  openHelper(h) { openHelperChat(this, h); this.game?.emit('panel', 'helper'); }

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
}

// Interface : barre du haut, bouton d'action, notifications, fenêtres.

import { h } from './dom.js';
import { t, L } from '../i18n.js';
import { formatClock } from '../sim/time.js';
import { WEATHER_EMOJI } from '../sim/places.js';
import * as panels from './panels.js';
import { openVet } from './vet.js';
import { showProfiles, showAvatarEditor } from './screens.js';
import { openBuilding, openAnimalActions } from './actions.js';

export class UI {
  constructor(root) {
    this.root = root;
    this.game = null;
    this.panel = null; // { el, render, animalId, kind }
    this.modalOpen = false;

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
    root.append(this.touchPad);

    // Ne pas redessiner un panneau pendant qu'on appuie dessus (sinon le clic se perd).
    this.holding = false;
    this.panelEl.addEventListener('pointerdown', () => { this.holding = true; });
    window.addEventListener('pointerup', () => {
      if (!this.holding) return;
      this.holding = false;
      setTimeout(() => this.panel?.live && this.renderPanel(), 0);
    });

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
      this.help.textContent = `${t('tapHint')} · ${t('controlsHelp')}`;
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
    const btn = (emoji, label, fn) => h('button', { class: 'hud-btn', onClick: fn, title: label }, h('span', {}, emoji), h('small', {}, label));
    this.hudInfo = h('div', { class: 'hud-info' });
    this.hud.replaceChildren(
      this.hudInfo,
      h('nav', { class: 'hud-buttons' },
        btn('🐾', t('animals'), () => this.openAnimals()),
        btn('⏩', t('skip'), () => this.game.skipAhead()),
        btn('🚜', t('farm'), () => this.openFarm()),
        btn('🧭', t('travel'), () => this.openTravel()),
        btn('📖', t('journal'), () => this.openJournal()),
        btn('👕', t('avatar'), () => this.showAvatarEditor(this.game.profile, () => this.clearScreen())),
        btn('⚙️', t('settings'), () => this.openSettings())),
    );
  }

  refresh() {
    const g = this.game;
    if (!g?.profile) return;
    const s = g.hud();
    const money = s.money === null ? t('infinite') : s.money;
    this.hudInfo.replaceChildren(
      h('div', { class: 'hud-line strong' }, `👤 ${s.name}`, h('span', { class: 'coin' }, `🪙 ${money}`)),
      h('div', { class: 'hud-line' }, `📅 ${t('day', { n: s.day })} · 🕐 ${formatClock(s.clock)}`),
      h('div', { class: 'hud-line' }, `${s.place.flag} ${L(s.place.name)}`),
      h('div', { class: 'hud-line' }, `${WEATHER_EMOJI[s.weather]} ${t('weatherNow', { w: t(`w_${s.weather}`), t: s.temperature })} · ${t(`season_${s.season}`)}`),
    );
    if (this.panel?.live && !this.holding) this.renderPanel();
  }

  setFocus(f) {
    if (!f) {
      this.actionBtn.hidden = true;
      return;
    }
    const labels = {
      animal: () => t('interact', { name: f.entity.data.name }),
      refuge: () => (this.game.placeDef.home ? t('enterRefuge') : t('enterBreeder')),
      vet: () => t('enterVet'),
      house: () => t('enterHouse'),
      lodge: () => t('enterLodge'),
      jobs: () => t('jobBoard'),
      stable: () => t('bld_stable'),
      pen: () => t('bld_pen'),
      dismount: () => t('dismount'),
    };
    const emoji = { animal: '🤲', refuge: '🐾', vet: '🩺', house: '🏠', lodge: '🛏️', jobs: '📋', stable: '🐴', pen: '🐑', dismount: '⬇️' }[f.kind];
    this.actionBtn.replaceChildren(h('span', {}, emoji), ` ${labels[f.kind]()}`, h('kbd', {}, 'E'));
    this.actionBtn.hidden = false;
  }

  // ------------------------------------------------------------ notifications

  toast(msg, ms = 3200) {
    const el = h('div', { class: 'toast' }, msg);
    this.toasts.append(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild.remove();
    setTimeout(() => el.classList.add('out'), ms);
    setTimeout(() => el.remove(), ms + 400);
    return null;
  }

  isBlocking() {
    return this.modalOpen || !this.screen.hidden;
  }

  showModal(content) {
    this.modalOpen = true;
    this.game && (this.game.input.enabled = false);
    this.modal.replaceChildren(h('div', { class: 'modal-box' }, content));
    this.modal.hidden = false;
  }

  hideModal() {
    this.modalOpen = false;
    this.modal.hidden = true;
    if (this.game) this.game.input.enabled = !this.panel || !this.panel.blocking;
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

  prompt(label, value = '') {
    return new Promise((resolve) => {
      const input = h('input', { type: 'text', value, maxlength: 20 });
      const done = (v) => { this.hideModal(); resolve(v); };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') done(input.value);
        if (e.key === 'Escape') done(null);
      });
      this.showModal([
        h('label', { class: 'field' }, h('span', {}, label), input),
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
    this.panelEl.hidden = false;
    this.renderPanel(true);
  }

  renderPanel(first = false) {
    const p = this.panel;
    if (!p) return;
    const body = this.panelEl.querySelector('.panel-body');
    const scroll = first ? 0 : body?.scrollTop ?? 0;
    const content = h('div', { class: 'panel-body' }, p.render());
    this.panelEl.replaceChildren(
      h('header', { class: 'panel-head' },
        h('h2', {}, typeof p.title === 'function' ? p.title() : p.title),
        h('button', { class: 'close', onClick: () => this.closePanel(), 'aria-label': t('close') }, '✕')),
      content,
    );
    content.scrollTop = scroll;
  }

  closePanel() {
    this.panel = null;
    this.panelEl.hidden = true;
    this.panelEl.replaceChildren();
    if (this.game) this.game.input.enabled = true;
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
    const check = g.canCare(a, action);
    if (!check.ok) return this.toast(t(check.reason === 'money' ? 'r_money' : `r_${check.reason}`, { name: a.name, g: a.sex }));
    return g.care(a, action, 1);
  }

  /** Tonte ou traite (mini-jeu aussi). */
  async collectWithGame(a) {
    return this.game.collect(a);
  }

  openAnimal(a) { panels.openAnimal(this, a); }
  openAnimals() { panels.openAnimals(this); }
  openAdoption() { panels.openAdoption(this); }
  openTravel() { panels.openTravel(this); }
  openJournal() { panels.openJournal(this); }
  openJobs() { panels.openJobs(this); }
  openSettings() { panels.openSettings(this); }
  openFarm() { panels.openFarm(this); }
  openBuilding(kind) { openBuilding(this, kind); }
  openAnimalActions(a) { openAnimalActions(this, a); }

  /** Un soin pour un groupe (foin pour tous les chevaux…) : un mini-jeu, appliqué à tout le groupe. */
  async groupCareWithGame(filter, action) {
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
  openVetClinic() { panels.openVetClinic(this); }
  openVet(a, atClinic) { openVet(this, a, atClinic); }
}

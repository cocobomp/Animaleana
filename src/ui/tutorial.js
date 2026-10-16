// Tutoriel guidé (pour les enfants) et quêtes claires :
// - une bulle avec le guide Biscuit 🐶, des phrases très courtes et de gros emojis ;
// - le repère 3D (game.marker) au-dessus de ce qu'il faut toucher dans le monde ;
// - un cercle qui clignote autour du bouton à presser (barre du haut, menus) ;
// - un « objectif » épinglé à l'écran : la quête conseillée, ou la quête suivie
//   (« Suivre la quête ») avec ses petites étapes qui se cochent toutes seules.
// La logique (étapes, réussite) est dans src/sim/tutorial.js.

import { h } from './dom.js';
import { t, getLang } from '../i18n.js';
import { OBJECTIVES } from '../sim/objectives.js';
import { earn } from '../sim/profile.js';
import {
  tutorialStep, stepNumber, noteEvent, updateTutorial, skipTutorial, restartTutorial,
  suggestedQuest, questGuide, TUTORIAL_REWARD,
  followQuest, stopFollow, noteFollowEvent, updateFollow, followView,
} from '../sim/tutorial.js';

const GUIDE = '🐶';
const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const isNarrow = () => window.innerWidth <= 640;

export class Tutorial {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.stepId = undefined;
    this.cheerUntil = 0;
    this.highlight = null; // élément HTML à montrer
    this.markerKey = '';
    this.questFocus = null; // « Montre-moi » : { id, spec, until }

    this.bubble = h('div', { id: 'tuto-bubble', hidden: true, role: 'status', 'aria-live': 'polite' });
    this.ring = h('div', { id: 'tuto-ring', hidden: true }, h('span', { class: 'tuto-finger' }, '👆'));
    this.tracker = h('div', { id: 'quest-tracker', hidden: true });
    ui.root.append(this.bubble, this.ring, this.tracker);

    game.on('start', () => this.begin());
    game.on('stop', () => this.end());
    game.on('building', (kind) => this.event(`building:${kind}`));
    game.on('panel', (name) => this.event(`panel:${name}`));
    game.on('animalActions', (a) => { this.animalId = a.id; this.event('animalActions'); });
    game.on('skip', () => {
      // Le temps a avancé : un menu ouvert (ex. refuge fermé → ouvert) doit se mettre à jour.
      if (ui.panel && !ui.panel.live) ui.renderPanel();
      this.event('skip');
    });
    game.on('adopted', (a) => { this.animalId = a.id; this.event('adopted'); });
    game.on('care', ({ action }) => this.event(`care:${action}`));

    setInterval(() => this.tick(), 250);
    const loop = () => {
      this.placeRing();
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  get profile() {
    return this.game.running ? this.game.profile : null;
  }

  get active() {
    return !!this.profile && !!tutorialStep(this.profile.tutorial);
  }

  // ------------------------------------------------------------ cycle de vie

  begin() {
    this.stepId = undefined;
    this.questFocus = null;
    this.animalId = null;
    this.trackerKey = '';
    if (this.active) this.ui.hideHelp();
    this.tick();
  }

  end() {
    this.bubble.hidden = true;
    this.ring.hidden = true;
    this.tracker.hidden = true;
    this.moveToasts();
    this.highlight = null;
    this.releaseMarker();
  }

  /** Revoir le tutoriel (depuis les réglages). */
  replay() {
    const p = this.profile;
    if (!p) return;
    restartTutorial(p);
    stopFollow(p);
    this.ui.closePanel();
    this.begin();
  }

  skip() {
    const p = this.profile;
    if (!p) return;
    skipTutorial(p);
    this.bubble.hidden = true;
    this.highlight = null;
    this.releaseMarker();
    this.ui.toast(t('tuto_skipped'), 5000);
    this.tick();
  }

  event(name) {
    const p = this.profile;
    if (!p) return;
    noteEvent(p.tutorial, name);
    noteFollowEvent(p, name);
    this.questEvent(name);
    this.tick();
  }

  // ------------------------------------------------------------ boucle

  tick() {
    const p = this.profile;
    if (!p) {
      if (!this.bubble.hidden || !this.tracker.hidden) this.end();
      return;
    }
    if (this.active && performance.now() > this.cheerUntil) {
      const r = updateTutorial(p, this.context());
      if (r?.completed.length) this.cheer();
    }
    const step = tutorialStep(p.tutorial);
    if (step?.id !== this.stepId) this.enterStep(step);
    if (step) {
      // Étape « OK » : on montre le bouton de la bulle (ou celui d'un message ouvert).
      if (step.manual) this.applyTarget({ el: this.ui.modalOpen ? this.ui.modal.querySelector('button.primary') : this.bubble.querySelector('.tuto-ok') });
      else this.updateTarget(step.target);
      this.renderBubble(step);
      if (step.manual && !this.ui.modalOpen) this.applyTarget({ el: this.bubble.querySelector('.tuto-ok') });
    } else {
      this.bubble.hidden = true;
      if (p.questFollow) this.updateFollowing();
      else this.updateQuestFocus();
    }
    this.renderTracker();
    this.moveToasts();
    this.placeRing(); // aussi ici : sur un appareil lent, les images 3D peuvent être rares
  }

  enterStep(step) {
    this.stepId = step?.id;
    this.startPos = this.game.player?.position.clone();
    this.bubbleKey = '';
    if (!step) {
      this.highlight = null;
      this.releaseMarker();
      return;
    }
    if (step.id === 'end') this.reward();
  }

  /** Ce que la logique ne peut pas savoir seule (3D, heure, animal choisi, menus ouverts). */
  context() {
    const g = this.game;
    const pos = g.player.position;
    const moved = this.startPos ? Math.hypot(pos.x - this.startPos.x, pos.z - this.startPos.z) : 0;
    const adopt = g.buildingActions('refuge').find((a) => a.id === 'adopt');
    const a = this.animal();
    const panel = this.ui.panelEl;
    return {
      moved,
      refugeOpen: !!adopt?.enabled,
      animals: g.profile.animals.length,
      full: a ? { hunger: a.needs.hunger >= 96, affection: a.needs.affection >= 96 } : {},
      hasDropping: [...g.droppingMeshes.values()].some((m) => m.userData.dropping.kind === 'poop'),
      travelDest: !!panel.querySelector('.card.place.selected'),
      travelMode: !!panel.querySelector('.card.mode.selected'),
      hasClient: g.profile.animals.some((a) => a.client), // un animal confié par un client
    };
  }

  /** L'animal du tutoriel : celui qu'on vient d'adopter ou de toucher, sinon le plus proche. */
  animal() {
    const g = this.game;
    const here = g.animalsHere();
    const chosen = here.find((x) => x.id === this.animalId);
    if (chosen) return chosen;
    const pos = g.player.position;
    let best = null;
    let bestD = Infinity;
    for (const x of here) {
      const e = g.entities.get(x.id);
      if (!e || e.ridden) continue;
      const d = e.position.distanceTo(pos);
      if (d < bestD) {
        bestD = d;
        best = x;
      }
    }
    return best;
  }

  cheer() {
    this.cheerUntil = performance.now() + 1300;
    this.highlight = null;
    this.bubbleKey = 'cheer';
    const cheers = ['tuto_cheer1', 'tuto_cheer2', 'tuto_cheer3'];
    this.bubble.replaceChildren(
      h('div', { class: 'tuto-guide' }, GUIDE),
      h('div', { class: 'tuto-main' }, h('div', { class: 'tuto-emoji big pop' }, '⭐'),
        h('p', { class: 'tuto-text' }, t(cheers[Math.floor(Math.random() * cheers.length)]))),
    );
    this.bubble.hidden = false;
    this.bubble.classList.add('cheer');
    setTimeout(() => {
      this.bubble.classList.remove('cheer');
      this.tick();
    }, 1350);
  }

  reward() {
    const p = this.profile;
    if (!p || p.tutorial.flags.rewarded) return;
    p.tutorial.flags.rewarded = true;
    earn(p, TUTORIAL_REWARD.money);
    this.game.xp(TUTORIAL_REWARD.xp);
    const a = this.animal();
    if (a) this.game.entities.get(a.id)?.emit('🎉', 5);
    this.ui.refresh();
  }

  // ------------------------------------------------------------ bulle du guide

  stepText(step) {
    const a = this.animal();
    const params = { name: this.profile.name, animal: a?.name ?? '', g: a?.sex };
    let key = `tuto_${step.id}`;
    if (step.id === 'move') key = isTouch() ? 'tuto_move_touch' : 'tuto_move';
    return t(key, params);
  }

  /** Petite aide qui change selon la situation (« Ferme d'abord la fenêtre ✕ »…). */
  subHint(step) {
    const a = this.animal();
    const params = { animal: a?.name ?? '', g: a?.sex, money: TUTORIAL_REWARD.money };
    const why = this.targetWhy;
    if (this.ui.modalOpen) return t(this.ui.modal.querySelector('input') ? 'tuto_hint_modal' : 'tuto_hint_modalOk');
    if (why) return t(`tuto_hint_${why}`, params);
    if (step.id === 'end' && this.profile.mode === 'manage') return t('tuto_end_money', params);
    if (step.id === 'move') return isTouch() ? t('tuto_move_touch_hint') : t('tuto_move_hint');
    const key = `tuto_${step.id}_hint`;
    return t(key, params) === key ? '' : t(key, params);
  }

  renderBubble(step) {
    if (performance.now() < this.cheerUntil) return;
    const text = this.stepText(step);
    const hint = this.subHint(step);
    const key = `${step.id}|${text}|${hint}|${getLang()}`;
    if (key !== this.bubbleKey) {
      this.bubbleKey = key;
      const { n, total } = stepNumber(this.profile.tutorial);
      const okLabel = step.id === 'welcome' ? t('tuto_go') : step.id === 'end' ? t('tuto_thanks') : 'OK';
      this.bubble.replaceChildren(
        h('div', { class: 'tuto-guide', 'aria-hidden': 'true' }, GUIDE),
        h('div', { class: 'tuto-main' },
          h('div', { class: 'tuto-top' },
            h('span', { class: 'tuto-emoji' }, step.emoji),
            h('span', { class: 'tuto-dots', 'aria-label': `${n}/${total}` },
              Array.from({ length: total }, (_, i) => h('i', { class: i < n - 1 ? 'on' : i === n - 1 ? 'now' : '' }))),
            h('button', { class: 'tuto-icon', title: t('tuto_read'), 'aria-label': t('tuto_read'), onClick: () => this.speak(`${text} ${hint}`) }, '🔊'),
            step.id !== 'end'
              ? h('button', { class: 'tuto-skip', onClick: () => this.askSkip() }, step.id === 'welcome' ? t('tuto_skipAll') : t('tuto_skip'))
              : null),
          h('p', { class: 'tuto-text' }, text),
          hint ? h('p', { class: 'tuto-hint' }, hint) : null,
          step.manual ? h('button', { class: 'primary tuto-ok', onClick: () => this.event('next') }, okLabel) : null),
      );
    }
    this.bubble.hidden = false;
    // Sur téléphone, la bulle descend sous la barre du haut quand il faut toucher un de ses boutons ;
    // sur ordinateur, elle se place sous la carte d'infos (en haut à gauche).
    const low = isNarrow() && !!this.highlight?.closest?.('#hud');
    this.bubble.classList.toggle('low', low);
    const hudInfo = this.ui.hud.querySelector('.hud-info');
    const top = low ? this.ui.hud.getBoundingClientRect().bottom + 8 : hudInfo ? hudInfo.getBoundingClientRect().bottom + 12 : 160;
    this.bubble.style.setProperty('--tuto-top', `${Math.round(top)}px`);
  }

  async askSkip() {
    if (await this.ui.confirm(t('tuto_skipConfirm'))) this.skip();
  }

  speak(text) {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/[\p{Extended_Pictographic}️]/gu, ''));
      u.lang = getLang() === 'fr' ? 'fr-FR' : 'en-GB';
      u.rate = 0.9;
      synth.speak(u);
    } catch {
      /* pas de voix sur cet appareil */
    }
  }

  // ------------------------------------------------------------ cibles

  hudButton(id) {
    return [...this.ui.hud.querySelectorAll('.hud-btn')].find((b) => b.title === t(id)) ?? null;
  }

  sheetButton(label) {
    return [...this.ui.panelEl.querySelectorAll('.big-action')].find((b) => b.querySelector('b')?.textContent === label) ?? null;
  }

  closeBtn() {
    return this.ui.panelEl.querySelector('.panel-head .close');
  }

  /** Premier bouton utilisable sous un titre de la fiche (ex. « Tours », « Avoir des bébés »). */
  sectionButton(titleKey) {
    const h3 = [...this.ui.panelEl.querySelectorAll('h3')].find((x) => x.textContent === t(titleKey));
    let el = h3?.nextElementSibling;
    while (el && el.tagName !== 'H3') {
      const b = el.querySelector?.('button:not([disabled])');
      if (b) return b;
      el = el.nextElementSibling;
    }
    return null;
  }

  /**
   * Que montrer pour une cible ? Renvoie { el, world, why } :
   * el = bouton à entourer, world = cible du repère 3D, why = aide affichée (clé tuto_hint_*).
   */
  resolve(spec) {
    const ui = this.ui;
    const g = this.game;
    if (!spec) return {};
    if (ui.modalOpen) return { el: ui.modal.querySelector('button.primary') };
    switch (spec.type) {
      case 'hud': {
        // Une fenêtre est ouverte : on la ferme d'abord (elle peut cacher les boutons du haut).
        if (ui.panel) return { el: this.closeBtn(), why: 'close' };
        return { el: this.hudButton(spec.id) };
      }
      case 'building': return this.resolveBuilding(spec.id);
      case 'adopt': {
        const card = ui.panelEl.querySelector('.card.adopt button.primary:not([disabled])');
        if (card) return { el: card };
        const btn = this.sheetButton(t('do_adopt'));
        if (btn && !btn.classList.contains('off')) return { el: btn };
        return this.resolveBuilding('refuge');
      }
      case 'animal': return this.resolveAnimal(spec);
      case 'action': {
        const label = spec.id === 'more' ? t('more') : t(`act_${spec.id}`);
        const btn = this.sheetButton(label);
        if (btn) return { el: btn };
        return this.resolveAnimal(spec, true);
      }
      case 'sheet': {
        const btn = this.sheetButton(t(spec.label));
        return btn ? { el: btn } : this.resolve(spec.fallback);
      }
      case 'el': {
        const el = [...ui.panelEl.querySelectorAll(spec.sel.replace(/^#panel\s*/, ''))].find((x) => x.getClientRects().length);
        return el ? { el } : this.resolve(spec.fallback);
      }
      case 'section': {
        const el = this.sectionButton(spec.h3);
        return el ? { el } : this.resolve(spec.fallback);
      }
      case 'dropping': {
        const pos = g.player.position;
        const poops = [...g.droppingMeshes.values()].filter((m) => m.userData.dropping.kind === 'poop');
        poops.sort((a, b) => a.position.distanceTo(pos) - b.position.distanceTo(pos));
        if (ui.panel) return { el: this.closeBtn(), why: 'close' };
        return poops[0] ? { world: poops[0], key: poops[0].userData.dropping.id, height: 1.2 } : {};
      }
      default: return {};
    }
  }

  resolveBuilding(kind) {
    const g = this.game;
    const ui = this.ui;
    const door = g.world.interactables.find((i) => i.kind === kind);
    if (!door) return {};
    const onEdgeTap = () => g.walkTo({ x: door.x, z: door.z }, 1.2, () => ui.openBuilding(kind));
    if (ui.panel) return { el: this.closeBtn(), why: 'close', world: door, key: `b-${kind}`, height: 3.4, onEdgeTap };
    // Juste devant la porte : le gros bouton vert « Entrer » (plus besoin de la flèche 3D).
    if (g.focus?.kind === kind && !ui.actionBtn.hidden) return { el: ui.actionBtn, why: 'enter' };
    return { world: door, key: `b-${kind}`, height: 3.4, onEdgeTap, why: 'walk' };
  }

  resolveAnimal(spec, forAction = false) {
    const g = this.game;
    const ui = this.ui;
    let a = this.animal();
    if (spec.species && a?.species !== spec.species) a = g.animalsHere().find((x) => x.species === spec.species) ?? null;
    const e = a && g.entities.get(a.id);
    if (!e) return {};
    if (ui.panel) return { el: this.closeBtn(), why: 'close', world: e, key: `a-${a.id}` };
    const onEdgeTap = () => g.walkTo(e.position, e.radius + 1.2, () => ui.openAnimalActions(a), true);
    let el = null;
    if (g.focus?.kind === 'animal' && g.focus.entity === e && !ui.actionBtn.hidden) el = ui.actionBtn;
    else el = ui.labelEls.get(a.id) ?? null;
    return { el, world: e, key: `a-${a.id}`, onEdgeTap, why: forAction ? 'tapAnimal' : null };
  }

  updateTarget(spec) {
    if (performance.now() < this.cheerUntil) return;
    const r = this.resolve(spec);
    this.applyTarget(r);
    this.targetWhy = r.why ?? null;
  }

  applyTarget(r) {
    if (r.el !== this.highlight) {
      this.highlight = r.el ?? null;
      // Fait défiler le menu pour que le bouton soit visible.
      if (this.highlight?.closest?.('.panel-body')) this.highlight.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
    const key = r.world ? r.key ?? 'w' : '';
    if (key !== this.markerKey) {
      this.markerKey = key;
      if (r.world) {
        this.game.marker.show(r.world, { height: r.height, onEdgeTap: r.onEdgeTap });
        this.ownsMarker = true;
      } else this.releaseMarker();
    }
  }

  releaseMarker() {
    this.markerKey = '';
    if (this.ownsMarker) this.game.marker.hide();
    this.ownsMarker = false;
  }

  /** Le cercle qui clignote autour du bouton à presser, et le doigt 👆. */
  placeRing() {
    const el = this.highlight;
    const show = el && el.isConnected && el.getClientRects().length > 0 && performance.now() > this.cheerUntil && this.profile;
    if (!show) {
      if (!this.ring.hidden) this.ring.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) {
      this.ring.hidden = true;
      return;
    }
    this.ring.hidden = false;
    const pad = 6;
    Object.assign(this.ring.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    // Le doigt vient d'en dessous (ou d'au-dessus si le bouton est en bas de l'écran).
    this.ring.classList.toggle('from-top', r.bottom > window.innerHeight - 90);
  }

  // ------------------------------------------------------------ quêtes claires

  /** Position de l'objectif : sous la carte d'infos (ordinateur) ou sous la barre du haut (téléphone). */
  trackerTop() {
    const ref = isNarrow() ? this.ui.hud : this.ui.hud.querySelector('.hud-info');
    return ref ? Math.round(ref.getBoundingClientRect().bottom + 8) : 156;
  }

  /**
   * L'objectif épinglé à l'écran.
   * - quête suivie : son nom, ses étapes (✅ faite, 👉 en cours, ⬜ à faire), « Arrêter » ;
   * - sinon : la quête conseillée et un bouton « Suivre ».
   */
  renderTracker() {
    const p = this.profile;
    if (!p || this.active || this.ui.isBlocking()) {
      this.tracker.hidden = true;
      this.moveToasts();
      return;
    }
    const view = followView(p, OBJECTIVES);
    const q = view ? OBJECTIVES.find((o) => o.id === view.id) : suggestedQuest(p, OBJECTIVES);
    if (!q) {
      this.tracker.hidden = true;
      this.moveToasts();
      return;
    }
    const [cur, max] = q.progress(p);
    const where = this.whereText(q.id);
    const stepsKey = view ? view.steps.map((s) => s.state[0]).join('') : '';
    const key = `${q.id}|${cur}|${where}|${getLang()}|${stepsKey}|${this.questFocus?.id === q.id}`;
    if (key !== this.trackerKey) {
      this.trackerKey = key;
      const head = h('button', {
        class: 'qt-head',
        title: t('quest_trackerTitle'),
        onClick: () => (view ? this.reshow() : this.showQuest(q.id)),
      },
      h('span', { class: 'qt-icon' }, view ? '🧭' : '🎯'),
      h('span', { class: 'qt-main' }, h('b', {}, t(`o_${q.id}`)), h('small', {}, `📍 ${where}`)),
      h('span', { class: 'qt-side' }, `${Math.min(cur, max)}/${max}`));
      const items = view
        ? h('ol', { class: 'qt-steps' }, view.steps.map((s) => h('li', { class: `qt-step ${s.state}` },
          h('span', { class: 'qt-check' }, s.state === 'done' ? '✅' : s.state === 'now' ? '👉' : '⬜'),
          h('span', {}, t(`quest_step_${s.id}`), s.progress && s.state === 'now' ? ` (${Math.min(cur, max)}/${max})` : ''))))
        : null;
      const actions = h('div', { class: 'qt-actions' },
        view
          ? h('button', { class: 'qt-stop', onClick: () => this.stopFollowing() }, `✋ ${t('quest_stop')}`)
          : h('button', { class: 'primary qt-follow', onClick: () => this.startFollow(q.id) }, `🧭 ${t('quest_follow')}`));
      this.tracker.replaceChildren(...[head, items, actions].filter(Boolean));
      this.tracker.classList.toggle('following', !!view);
    }
    this.tracker.style.top = `${this.trackerTop()}px`;
    this.tracker.hidden = false;
    this.moveToasts();
  }

  /** Sur téléphone, les messages s'affichent sous l'objectif (sinon ils le cachent). */
  moveToasts() {
    const toasts = this.ui.toasts;
    if (!toasts) return;
    const ref = !this.bubble.hidden ? this.bubble : !this.tracker.hidden ? this.tracker : null;
    const top = ref && isNarrow() && !this.ui.panel ? `${Math.round(ref.getBoundingClientRect().bottom + 8)}px` : '';
    if (toasts.style.top !== top) toasts.style.top = top;
  }

  whereText(id) {
    const g = questGuide(id, this.profile);
    if (!g) return '';
    if (g.first === 'adopt') return t('quest_where_firstAdopt');
    if (g.first === 'horse') return t('quest_where_firstHorse');
    return t(`quest_where_${g.where}`);
  }

  // --- « Suivre la quête »

  startFollow(id) {
    const p = this.profile;
    if (!p) return;
    followQuest(p, id);
    this.questFocus = null;
    this.ui.closePanel();
    this.trackerKey = '';
    const v = followView(p, OBJECTIVES);
    this.ui.toast(`🧭 ${t(`o_${id}`)} — ${t(`quest_step_${v.current.id}`)}`, 5000);
    this.tick();
  }

  stopFollowing() {
    const p = this.profile;
    if (!p) return;
    stopFollow(p);
    this.highlight = null;
    this.releaseMarker();
    this.trackerKey = '';
    this.tick();
  }

  /** Toucher l'objectif suivi : remontre le repère et redit l'étape en cours. */
  reshow() {
    const v = followView(this.profile, OBJECTIVES);
    if (!v) return;
    this.markerKey = '';
    this.highlight = null;
    this.ui.toast(`👉 ${t(`quest_step_${v.current.id}`)}`, 4000);
    this.tick();
  }

  updateFollowing() {
    const p = this.profile;
    const r = updateFollow(p, OBJECTIVES, this.context());
    if (r?.questDone) {
      this.highlight = null;
      this.releaseMarker();
      this.ui.toast(`🏆 ${t('quest_followDone', { name: t(`o_${r.id}`) })}`, 5000);
      return;
    }
    if (r?.stepDone) {
      const v = followView(p, OBJECTIVES);
      if (v?.current) this.ui.toast(`✅ → 👉 ${t(`quest_step_${v.current.id}`)}`, 3500);
    }
    const v = followView(p, OBJECTIVES);
    const res = this.resolve(v?.current?.target);
    this.applyTarget(res);
  }

  // --- « Montre-moi »

  showSuggested() {
    const q = suggestedQuest(this.profile, OBJECTIVES);
    if (q) this.showQuest(q.id);
  }

  /** « Montre-moi » : ferme le journal et montre où faire la quête. */
  showQuest(id) {
    const p = this.profile;
    if (!p) return;
    const g = questGuide(id, p);
    if (!g) return;
    if (p.questFollow?.id === id) return this.reshow();
    if (p.questFollow) stopFollow(p); // une seule quête guidée à la fois
    this.ui.closePanel();
    this.questFocus = { id, spec: g.target, until: performance.now() + 45000 };
    this.markerKey = '';
    this.ui.toast(`${t(`o_${id}`)} — ${t(g.first ? `quest_hint_first_${g.first}` : `quest_hint_${id}`)}`, 6000);
    this.tick();
  }

  questEvent(name) {
    const f = this.questFocus;
    if (!f) return;
    const s = f.spec;
    const doneBy = { building: `building:${s.id}`, hud: `panel:${s.id}`, action: `care:${s.id}` }[s.type];
    if (name === doneBy || (s.type === 'action' && s.id === 'more' && name === 'panel:animal')) this.stopQuestFocus();
  }

  stopQuestFocus() {
    this.questFocus = null;
    this.highlight = null;
    this.releaseMarker();
  }

  updateQuestFocus() {
    const f = this.questFocus;
    if (!f) {
      if (this.highlight) this.highlight = null;
      if (this.ownsMarker) this.releaseMarker();
      return;
    }
    if (performance.now() > f.until || this.profile.completed.includes(f.id)) {
      this.stopQuestFocus();
      return;
    }
    // Pour « Montre-moi », on ne force pas à fermer les fenêtres : on montre seulement la cible.
    const r = this.resolve(f.spec);
    if (r.why === 'close') r.el = null;
    this.applyTarget(r);
  }
}

/**
 * Ligne en plus pour une quête du journal : où la faire, une aide, « Montre-moi » et « Suivre ».
 * Utilisé par openJournal (src/ui/panels.js).
 */
export function questExtras(ui, o, done) {
  if (o.kind !== 'quest' || done || !ui.tutorial || !ui.game?.profile) return null;
  const tuto = ui.tutorial;
  const p = ui.game.profile;
  const g = questGuide(o.id, p);
  if (!g) return null;
  const followed = p.questFollow?.id === o.id;
  return h('div', { class: 'quest-extra' },
    h('span', { class: 'quest-where' }, `📍 ${tuto.whereText(o.id)}`),
    h('span', { class: 'quest-hint' }, t(g.first ? `quest_hint_first_${g.first}` : `quest_hint_${o.id}`)),
    h('button', { class: 'quest-show', onClick: (e) => { e.stopPropagation(); tuto.showQuest(o.id); } }, `👉 ${t('quest_showMe')}`),
    followed
      ? h('button', { class: 'quest-show', onClick: (e) => { e.stopPropagation(); tuto.stopFollowing(); ui.renderPanel(); } }, `✋ ${t('quest_stop')}`)
      : h('button', { class: 'primary quest-show', onClick: (e) => { e.stopPropagation(); tuto.startFollow(o.id); } }, `🧭 ${t('quest_follow')}`));
}

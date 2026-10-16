// Tutoriel guidé (pour les enfants) et quêtes claires :
// - une bulle avec le guide Biscuit 🐶, des phrases très courtes et de gros emojis ;
// - le repère 3D (game.marker) au-dessus de ce qu'il faut toucher dans le monde ;
// - un cercle qui clignote autour du bouton à presser (barre du haut, menus) ;
// - un petit suivi de quête discret sur le côté : la quête conseillée, ou la quête suivie
//   (« Suivre la quête ») avec ses petites étapes qui se cochent toutes seules ; il se range en pastille.
// La logique (étapes, réussite) est dans src/sim/tutorial.js.

import { h, isPhone } from './dom.js';
import { t, getLang } from '../i18n.js';
import { OBJECTIVES } from '../sim/objectives.js';
import { earn } from '../sim/profile.js';
import {
  tutorialStep, stepNumber, noteEvent, updateTutorial, skipTutorial, restartTutorial,
  suggestedQuest, questGuide, TUTORIAL_REWARD,
  followQuest, stopFollow, noteFollowEvent, updateFollow, followView, stepWindow,
} from '../sim/tutorial.js';

const GUIDE = '🐶';
const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const isNarrow = isPhone;

// Suivi de quête rangé en pastille ou non : un confort mémorisé sur cet appareil (pas dans la sauvegarde).
const FOLD_KEY = 'animaleana.questFold';
function readFold() {
  try {
    return localStorage.getItem(FOLD_KEY) === '1';
  } catch {
    return false;
  }
}
function writeFold(on) {
  try {
    localStorage.setItem(FOLD_KEY, on ? '1' : '0');
  } catch {
    /* pas de stockage (navigation privée…) : le réglage dure jusqu'au rechargement */
  }
}

export class Tutorial {
  constructor(ui, game) {
    this.ui = ui;
    this.game = game;
    this.stepId = undefined;
    this.cheerUntil = 0;
    this.highlight = null; // élément HTML à montrer
    this.markerKey = '';
    this.questFocus = null; // « Montre-moi » : { id, spec, until }
    this.folded = readFold(); // suivi de quête rangé en pastille
    this.trackerBox = null; // où est le suivi à l'écran (lu par la flèche du repère, src/game/Marker.js)

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
    game.on('timeFast', () => this.event('timeFast')); // ⏩ de la barre du temps
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
    // Sa position : sous la carte d'infos (ordinateur) ou sous tout le bloc du haut (téléphone), voir layoutTop().
    this.layoutTop();
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

  /** Bouton du haut (barre d'outils) ou de la barre du temps (⏸ ▶ ⏩), reconnu par son titre. */
  hudButton(id) {
    return [...this.ui.hud.querySelectorAll('.hud-btn, .time-btn')].find((b) => b.title === t(id)) ?? null;
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

  /**
   * Le suivi de quête, discret sur le côté : à gauche sous la carte d'infos (ordinateur), à droite sous les
   * boutons du haut (téléphone, loin du joystick). Une seule ligne : la quête (la toucher = « Montre-moi »),
   * sa progression (0/3), 🧭 pour la suivre (✋ pour arrêter) et « – » pour le ranger en pastille (mémorisé).
   * Quête suivie : ses étapes en petit dessous (✅ faite, 👉 en cours, ⬜ à faire), quelques lignes au plus.
   */
  renderTracker() {
    const p = this.profile;
    // Téléphone : une fenêtre ouverte prend presque tout l'écran ; on range le suivi pour laisser la place aux messages.
    if (!p || this.active || this.ui.isBlocking() || (isNarrow() && this.ui.panel)) {
      this.tracker.hidden = true;
      this.layoutTop();
      return;
    }
    const view = followView(p, OBJECTIVES);
    const q = view ? OBJECTIVES.find((o) => o.id === view.id) : suggestedQuest(p, OBJECTIVES);
    if (!q) {
      this.tracker.hidden = true;
      this.layoutTop();
      return;
    }
    const [cur, max] = q.progress(p);
    const count = `${Math.min(cur, max)}/${max}`;
    const where = this.whereText(q.id);
    const right = isNarrow(); // téléphone : contre le bord droit ; ordinateur : contre le bord gauche
    const lines = right ? 2 : 4; // lignes d'étapes sur le côté (téléphone : l'étape en cours et la suivante)
    const stepsKey = view ? view.steps.map((s) => s.state[0]).join('') : '';
    const key = `${q.id}|${count}|${where}|${getLang()}|${stepsKey}|${this.folded}|${right}|${lines}`;
    if (key !== this.trackerKey) {
      // La même quête a avancé : petit rebond (surtout utile quand le suivi est rangé en pastille).
      const moved = !!this.trackerKey && this.trackerWas?.id === q.id && (this.trackerWas.count !== count || this.trackerWas.steps !== stepsKey);
      this.trackerKey = key;
      this.trackerWas = { id: q.id, count, steps: stepsKey };
      this.tracker.replaceChildren(...this.trackerContent(q, view, { count, where, right, lines }));
      this.tracker.classList.toggle('following', !!view);
      this.tracker.classList.toggle('folded', this.folded);
      this.tracker.classList.toggle('side-right', right);
      if (moved) this.bumpTracker();
    }
    this.tracker.hidden = false;
    this.layoutTop();
  }

  /** Ce qu'il y a dans le suivi : la pastille rangée, ou la ligne de la quête (+ ses étapes si on la suit). */
  trackerContent(q, view, { count, where, right, lines }) { // right : contre le bord droit (téléphone)
    const icon = view ? '🧭' : '🎯';
    const title = t(`o_${q.id}`);
    if (this.folded) {
      // La flèche montre de quel côté la carte va s'ouvrir.
      const chev = (s) => h('span', { class: 'qt-chev', 'aria-hidden': 'true' }, s);
      return [h('button', {
        class: 'qt-pill',
        title: `${title} — ${t('quest_unfold')}`,
        'aria-label': `${t('quest_unfold')} : ${title} (${count})`,
        'aria-expanded': 'false',
        onClick: () => this.setFolded(false),
      }, right ? chev('‹') : null, h('span', { class: 'qt-icon' }, icon), h('b', { class: 'qt-count' }, count), right ? null : chev('›'))];
    }
    const show = () => (view ? this.reshow() : this.showQuest(q.id));
    // Pas d'icône devant le nom : toute la place pour lire (la bordure verte et 🧭 / ✋ disent si on la suit).
    const head = h('button', { class: 'qt-head', title: `📍 ${where} — ${t('quest_trackerTitle')}`, onClick: show },
      h('b', { class: 'qt-title' }, title),
      h('span', { class: 'qt-count' }, count));
    const quick = view
      ? h('button', { class: 'qt-quick', title: t('quest_stop'), 'aria-label': t('quest_stop'), onClick: () => this.stopFollowing() }, '✋')
      : h('button', { class: 'qt-quick primary', title: t('quest_follow'), 'aria-label': t('quest_follow'), onClick: () => this.startFollow(q.id) }, '🧭');
    // Ranger en pastille : « – » comme pour réduire le bandeau d'un événement (src/ui/events.js).
    const fold = h('button', { class: 'qt-fold', title: t('quest_fold'), 'aria-label': t('quest_fold'), 'aria-expanded': 'true', onClick: () => this.setFolded(true) }, '–');
    const out = [h('div', { class: 'qt-row' }, head, quick, fold)];
    if (view) {
      const w = stepWindow(view.steps, lines);
      if (w.before || w.after) {
        // Longue quête : des petits points disent où on en est (comme dans la bulle du guide).
        const n = view.steps.findIndex((s) => s.state === 'now') + 1;
        out.push(h('div', { class: 'qt-dots', role: 'img', 'aria-label': t('quest_stepOf', { n, total: view.steps.length }) },
          view.steps.map((s) => h('i', { class: s.state }))));
      }
      out.push(h('ol', { class: 'qt-steps' }, w.steps.map((s) => h('li', { class: `qt-step ${s.state}` },
        h('span', { class: 'qt-check', 'aria-hidden': 'true' }, s.state === 'done' ? '✅' : s.state === 'now' ? '👉' : '⬜'),
        h('span', { class: 'qt-label' }, t(`quest_step_${s.id}`), s.progress && s.state === 'now' ? ` (${count})` : '')))));
    }
    return out;
  }

  /** Ranger le suivi en pastille (ou le rouvrir) ; c'est mémorisé sur l'appareil. */
  setFolded(on) {
    this.folded = !!on;
    writeFold(this.folded);
    this.trackerKey = '';
    this.renderTracker();
  }

  bumpTracker() {
    const el = this.tracker;
    el.classList.remove('bump');
    void el.offsetWidth; // relance l'animation
    el.classList.add('bump');
    clearTimeout(this.bumpTimer);
    this.bumpTimer = setTimeout(() => el.classList.remove('bump'), 700);
  }

  /**
   * Pose le suivi contre son bord, juste sous le haut de l'écran, et garde sa boîte (trackerBox) :
   * les messages et la flèche du repère passent en dessous au lieu de le recouvrir.
   */
  placeTracker() {
    const el = this.tracker;
    this.trackerBox = null;
    if (el.hidden) return null;
    const hud = this.ui.hud;
    let top;
    if (!isNarrow()) {
      // Ordinateur : à gauche, sous la carte d'infos.
      top = (hud.querySelector('.hud-info')?.getBoundingClientRect().bottom || 148) + 8;
    } else {
      // Téléphone : à droite, sous les boutons du haut (en paysage, ils ne prennent que la droite de la barre).
      top = (hud.querySelector('.hud-buttons')?.getBoundingClientRect().bottom || hud.getBoundingClientRect().bottom || 100) + 6;
      if (!this.bubble.hidden) {
        const b = this.bubble.getBoundingClientRect();
        const r = el.getBoundingClientRect();
        if (b.height && b.left < r.right && b.right > r.left && b.bottom + 6 > top) top = b.bottom + 6;
      }
    }
    const px = `${Math.round(top)}px`;
    if (el.style.top !== px) el.style.top = px;
    const r = el.getBoundingClientRect();
    if (r.height > 0) this.trackerBox = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
    return this.trackerBox;
  }

  /**
   * Place ce qui s'affiche en haut de l'écran.
   * - Le suivi de quête se pose contre son bord (placeTracker) ; ce qui passerait dessus va juste en dessous.
   * - Ordinateur : la bulle sous la carte d'infos (en haut à gauche), le reste via le CSS.
   * - Téléphone : rien ne doit recouvrir la barre du haut ni ses boutons. Sous le bloc HUD + outils, on empile
   *   la bulle du guide, le bandeau d'événement, les pastilles d'état, l'aide puis les messages.
   *   Quand une fenêtre (fiche) est ouverte, elle commence sous la bulle (renderTracker range le suivi).
   */
  layoutTop() {
    const ui = this.ui;
    const hud = ui.hud;
    const panel = ui.panelEl;
    const ev = document.getElementById('ev-banner');
    const stacked = [ev, ui.statusBar, ui.help, ui.toasts];
    // Remet un élément à sa place CSS (top ET bottom : #help a un `bottom` dans le CSS).
    const reset = (el) => { if (el && (el.style.top || el.style.bottom)) { el.style.top = ''; el.style.bottom = ''; } };
    // Un élément dans la même colonne que le suivi de quête ?
    const besideSide = (side, r) => !!side && r.width > 0 && r.left < side.right && r.right > side.left;
    if (!isNarrow() || hud.hidden) {
      const info = hud.querySelector('.hud-info');
      const base = info ? info.getBoundingClientRect().bottom : 148;
      this.bubble.style.top = `${Math.round(base + 12)}px`;
      const side = this.placeTracker();
      for (const el of stacked.slice(0, -1)) reset(el);
      // Les messages (au milieu, en haut) passent sous le suivi si la fenêtre est trop étroite pour les deux.
      const toasts = ui.toasts;
      const top = besideSide(side, toasts.getBoundingClientRect()) ? `${Math.round(side.bottom + 8)}px` : '';
      if (toasts.style.top !== top) toasts.style.top = top;
      if (toasts.style.bottom) toasts.style.bottom = '';
      if (panel.style.maxHeight) panel.style.maxHeight = '';
      return;
    }
    let y = hud.getBoundingClientRect().bottom + 6;
    let side = null;
    const place = (el, gap = 6) => {
      if (!el || el.hidden) return;
      // Dans la colonne du suivi de quête : on commence juste sous lui.
      if (besideSide(side, el.getBoundingClientRect()) && y < side.bottom + gap) y = side.bottom + gap;
      const top = `${Math.round(y)}px`;
      if (el.style.top !== top) el.style.top = top;
      // Posé par le haut seulement : un `bottom` venu du CSS l'étirerait jusqu'en bas de l'écran.
      if (el.style.bottom !== 'auto') el.style.bottom = 'auto';
      const r = el.getBoundingClientRect();
      if (r.height > 0) y = r.bottom + gap;
    };
    place(this.bubble);
    side = this.placeTracker();
    // La fiche ouverte commence sous la bulle (sinon elle cacherait le bouton ✕ que le guide montre).
    const panelOpen = !!ui.panel && !panel.hidden;
    const maxH = panelOpen && !this.bubble.hidden ? `${Math.max(Math.round(window.innerHeight * 0.4), Math.round(window.innerHeight - y))}px` : '';
    if (panel.style.maxHeight !== maxH) panel.style.maxHeight = maxH;
    // Les messages viennent en dernier ; fenêtre ouverte, ils se posent entre la barre du haut et la fenêtre
    // (ils peuvent déborder sur son titre quelques secondes, jamais sur les boutons du haut).
    for (const el of stacked) place(el);
  }

  moveToasts() {
    this.layoutTop();
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

// Tutoriel guidé (pour les enfants) et quêtes claires :
// - une bulle avec le guide Biscuit 🐶, des phrases très courtes et de gros emojis ;
// - le repère 3D (game.marker) au-dessus de ce qu'il faut toucher dans le monde ;
// - un cercle qui clignote autour du bouton à presser (barre du haut, menus) ;
// - un petit suivi de quête discret sur le côté : la quête suivie (« Suivre la quête », avec ses petites étapes
//   qui se cochent toutes seules), sinon le chapitre en cours de l'histoire de la ferme (⭐), sinon la première
//   quête rejointe (🎯), sinon rien ; il se range en pastille ;
// - ⇄ sur le suivi (touche N au clavier) : jongler entre le chapitre en cours et les quêtes rejointes ;
// - la bulle de la quête (toucher son nom) : où aller, comment, les pastilles « Tes quêtes » pour en mettre une
//   autre devant, « ⏭️ Passer pour l'instant » (chapitre ou quête rejointe), « 📖 Mes quêtes » ; et les petits mots
//   du guide (fin d'un chapitre…), qui attendent qu'aucune fenêtre ne soit ouverte pour être vus.
// La logique (étapes, réussite) est dans src/sim/tutorial.js ; l'histoire et les quêtes rejointes dans
// src/sim/quests.js ; le journal dans src/ui/quests.js.

import { h, isPhone } from './dom.js';
import { t, getLang } from '../i18n.js';
import { nbsp } from './minigames/frame.js'; // typographie française (« Adopter » ! ne se coupe pas)
import { OBJECTIVES, objectiveParams } from '../sim/objectives.js';
import { earn, isSandbox } from '../sim/profile.js';
import {
  tutorialStep, stepNumber, noteEvent, updateTutorial, skipTutorial, restartTutorial,
  questGuide, followBlock, TUTORIAL_REWARD,
  followQuest, stopFollow, noteFollowEvent, updateFollow, followView, stepWindow,
} from '../sim/tutorial.js';
import {
  trackerQuest, questKind, storyView, joinQuest, leaveQuest, resumeChapter, chapterEnd, joinedQuests, canFollow, questState, STORY, MAX_JOINED,
  activeQuests, nextQuest, holdFollow, heldFollow, setFront, passQuest, resumeAside as resumeAsideQuest, mainQuest,
} from '../sim/quests.js';
import { hintText, blockText, shortBlockText } from './quests.js';
import { NoticeQueue } from './questNotices.js'; // les petits mots du guide, qui attendent qu'aucune fenêtre ne soit ouverte
import { ringSpot } from './ringSpot.js'; // où poser le cercle et le doigt

const GUIDE = '🐶';
/** Nom d'une quête (« Adopte {n} espèces… » : le total suit les espèces proposées). */
const questTitle = (p, id) => t(`o_${id}`, objectiveParams(p, OBJECTIVES.find((o) => o.id === id)));
const isTouch = () => matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const isNarrow = isPhone;
// Taille du suivi de quête : téléphone en portrait (comme le CSS @media (max-width: 640px)), téléphone en paysage,
// ou ordinateur / tablette.
const trackerMode = () => (!isNarrow() ? 'desk' : window.innerWidth <= 640 ? 'compact' : 'side');
// Pas de mot (ou d'emoji 🐾) tout seul sur la dernière ligne : espace insécable avant le dernier.
const keepLast = (s) => s.replace(/\s+(\S+)\s*$/u, '\u00a0$1');
// Texte de la bulle : en plus, « » ! ? : ; restent collés à leur mot (« touche « / Adopter » ! » se coupait
// après le guillemet ouvrant, sur téléphone).
const bubbleText = (s) => keepLast(nbsp(s));

/** Combien de temps la bulle de la quête reste ouverte si on n'y touche pas. */
const QUEST_BUBBLE_MS = 25000;

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
    this.questBubble = null; // la bulle d'une quête touchée : { id, until }
    this.notices = new NoticeQueue(QUEST_BUBBLE_MS); // les petits mots du guide (fin d'un chapitre…)

    this.bubble = h('div', { id: 'tuto-bubble', hidden: true, role: 'status', 'aria-live': 'polite' });
    this.ring = h('div', { id: 'tuto-ring', hidden: true }, h('span', { class: 'tuto-finger' }, '👆'));
    this.tracker = h('div', { id: 'quest-tracker', hidden: true });
    ui.root.append(this.bubble, this.ring, this.tracker);
    // La bulle change de taille (son texte) ou le haut de l'écran bouge : le suivi se repose tout de suite dessous
    // (sinon, jusqu'au prochain tick, il passait un instant sous le bas de la bulle).
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeWatch = new ResizeObserver(() => { if (this.profile) this.layoutTop(); });
      this.resizeWatch.observe(this.bubble);
      if (ui.hud) this.resizeWatch.observe(ui.hud);
    }

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
    this.recent = null; // le suivi arrêté avec ✋ (🧭 sur la même quête reprend à la même étape)
    this.questBubble = null;
    this.notices.clear();
    if (this.active) this.ui.hideHelp();
    this.tick();
  }

  end() {
    this.questBubble = null;
    this.notices.clear();
    this.bubbleKey = '';
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
    if (step && this.ui.minigameOpen) {
      // Un mini-jeu a tout l'écran : la bulle (« touche 🍖 Nourrir ») cachait sa consigne et son ✕,
      // et l'anneau montrait un bouton caché sous le jeu. Ils reviennent au tick qui suit la fin.
      this.bubble.hidden = true;
    } else if (step) {
      // Étape « OK » : on montre le bouton de la bulle (ou celui d'un message ouvert).
      if (step.manual) this.applyTarget({ el: this.ui.modalOpen ? this.ui.modal.querySelector('button.primary') : this.bubble.querySelector('.tuto-ok') });
      else this.updateTarget(step.target);
      this.renderBubble(step);
      if (step.manual && !this.ui.modalOpen) this.applyTarget({ el: this.bubble.querySelector('.tuto-ok') });
    } else {
      // Pas de tutoriel : la bulle sert à la quête (son nom touché) ou aux petits mots du guide (la fin d'un
      // chapitre…), qui attendent qu'aucune fenêtre ne soit ouverte.
      const n = this.questBubble ? null : this.notices.update(this.busy(), performance.now());
      if (this.questBubble) this.renderQuestBubble();
      else if (n) this.renderQuestBubble(n);
      else this.hideQuestBubble();
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
      hasClient: g.profile.animals.some((a) => a.client && a.client.kind !== 'training'), // un animal confié par un client
      dtOwnerBack: !!g.dogTrainer?.visitor?.returning, // éducateur canin : le maître revient chercher son chien
      mounted: !!g.player?.mount, // en selle (le chapitre « au trot, puis au galop »)
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
    if (this.ui.minigameOpen) return; // pas de bulle « Bravo » par-dessus un mini-jeu en cours
    this.cheerUntil = performance.now() + 1300;
    this.highlight = null;
    this.bubbleKey = 'cheer';
    const cheers = ['tuto_cheer1', 'tuto_cheer2', 'tuto_cheer3'];
    this.bubble.replaceChildren(
      h('div', { class: 'tuto-guide' }, GUIDE),
      h('div', { class: 'tuto-main' }, h('div', { class: 'tuto-emoji big pop' }, '⭐'),
        h('p', { class: 'tuto-text' }, bubbleText(t(cheers[Math.floor(Math.random() * cheers.length)])))),
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
      // Au clavier : le bouton de la bulle choisi avec Tab (« Passer le tutoriel », 🔊, OK) garde le focus
      // quand la bulle est redessinée (avant, il retombait sur la page, par exemple après « Annuler »).
      const active = globalThis.document?.activeElement;
      const keepCls = active && active !== this.bubble && this.bubble.contains?.(active) ? active.className : null;
      if (keepCls !== null) {
        queueMicrotask(() => {
          if (this.bubble.contains(document.activeElement)) return;
          const sel = keepCls.split(/\s+/).filter(Boolean).map((c) => `.${CSS.escape(c)}`).join('');
          (sel ? this.bubble.querySelector(`button${sel}`) : null)?.focus({ preventScroll: true });
        });
      }
      this.bubble.classList.remove('quest-bubble'); // (la bulle servait peut-être à une quête)
      this.qbKey = '';
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
          h('p', { class: 'tuto-text' }, bubbleText(text)),
          hint ? h('p', { class: 'tuto-hint' }, bubbleText(hint)) : null,
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
        // (un cheval pour l'histoire de ton premier cheval : sa carte, sinon la première)
        const card = (spec.species && ui.panelEl.querySelector(`.card.adopt[data-species="${spec.species}"] button.primary:not([disabled])`))
          || ui.panelEl.querySelector('.card.adopt button.primary:not([disabled])');
        if (card) return { el: card };
        const btn = this.sheetButton(t('do_adopt'));
        if (btn && !btn.classList.contains('off')) return { el: btn };
        return this.resolveBuilding('refuge');
      }
      case 'animal': return this.resolveAnimal(spec);
      // un bouton d'allure, en selle (src/ui/UI.js : #gait-pad)
      case 'gait': {
        const el = document.querySelector(`#gait-pad:not([hidden]) .gait-btn.${spec.id}`);
        return el ? { el } : {};
      }
      case 'action': {
        const label = spec.id === 'more' ? t('more') : t(`act_${spec.id}`);
        // (brosser un cheval s'appelle « Panser » dans son menu)
        // (pas encore sellé : « Monter » devient « Seller et monter »)
        const alt = { brush: 'act_horse_brush', ride: 'act_saddleRide' }[spec.id];
        const btn = this.sheetButton(label) ?? (alt ? this.sheetButton(t(alt)) : null);
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
    if (spec.training) a = g.animalsHere().find((x) => x.client?.kind === 'training') ?? null; // chien en éducation
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

  /**
   * La place de la bulle à l'écran, sans son animation d'entrée : au début, un transform la montre plus petite et
   * plus haute, et le suivi se posait alors 20 px trop haut, sous son bas (offsetTop/offsetHeight ignorent les
   * transforms ; la bulle est en position fixe et la page ne défile pas). null si elle est cachée.
   */
  bubbleBox() {
    const b = this.bubble;
    if (b.hidden || !b.offsetHeight) return null;
    const left = b.offsetLeft;
    const top = b.offsetTop;
    return { left, top, right: left + b.offsetWidth, bottom: top + b.offsetHeight, width: b.offsetWidth, height: b.offsetHeight };
  }

  /** Le cercle qui clignote autour du bouton à presser, et le doigt 👆. */
  placeRing() {
    const el = this.highlight;
    // Jamais par-dessus un mini-jeu (z-index 60 > 45) : le bouton qu'il montre est caché dessous.
    const show = el && el.isConnected && el.getClientRects().length > 0 && performance.now() > this.cheerUntil && this.profile && !this.ui.minigameOpen;
    if (!show) {
      if (!this.ring.hidden) this.ring.hidden = true;
      return;
    }
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.bottom < 0 || r.top > window.innerHeight) {
      this.ring.hidden = true;
      return;
    }
    // Le doigt vient d'en dessous, d'au-dessus ou de côté, sans cacher la bulle ni le suivi (ringSpot).
    const spot = ringSpot(r, { bubble: this.bubbleBox(), tracker: this.tracker.hidden ? null : this.tracker.getBoundingClientRect() }, window.innerHeight);
    if (spot.hidden) {
      // (la bulle cache tout le bouton : le cercle reviendra quand elle se fermera)
      if (!this.ring.hidden) this.ring.hidden = true;
      return;
    }
    const pad = spot.pad;
    this.ring.hidden = false;
    Object.assign(this.ring.style, {
      left: `${r.left - pad}px`,
      top: `${r.top - pad}px`,
      width: `${r.width + pad * 2}px`,
      height: `${r.height + pad * 2}px`,
    });
    const cl = this.ring.classList;
    cl.toggle('from-top', spot.fromTop);
    cl.toggle('from-left', spot.side === 'left');
    cl.toggle('from-right', spot.side === 'right');
    cl.toggle('under', spot.under);
    const finger = this.ring.firstChild;
    if (finger && finger.textContent !== spot.glyph) finger.textContent = spot.glyph;
    // (sous la bulle : le doigt au milieu de ce qu'on voit du cercle)
    const fy = spot.fingerY == null ? '' : `${spot.fingerY}px`;
    if (finger && finger.style.top !== fy) finger.style.top = fy;
  }

  // ------------------------------------------------------------ quêtes claires

  /**
   * Le suivi de quête, discret sur le côté : à gauche sous la carte d'infos (ordinateur), à droite sous les
   * boutons du haut (téléphone, loin du joystick). Une poignée ‹ / › à gauche pour le ranger en pastille (mémorisé),
   * puis le nom de la quête (le toucher ouvre sa bulle : où aller, « Tes quêtes », ⏭️ Passer, 📖 Mes quêtes) avec sa
   * progression (0/3), ⇄ s'il y a plusieurs quêtes en cours (la suivante passe devant ; touche N), et 🧭 pour la
   * suivre (✋ pour arrêter) contre l'autre bord : le nom sépare toujours « ranger » de « arrêter ». Quelle quête : la suivie (🧭), sinon le chapitre en cours (⭐), sinon la première
   * quête rejointe (🎯), sinon rien (trackerQuest, src/sim/quests.js) : jamais une quête que l'enfant n'a pas choisie
   * en dehors de l'histoire.
   * Sous le nom : « 0/3 📍 où aller », ou « 🔒 ce qu'il faut d'abord » (court) si elle n'est pas encore possible : alors
   * pas de 🧭 (le suivi ne guide jamais vers l'impossible, followBlock) et le nom a toute la largeur. Quête suivie :
   * - téléphone (portrait et paysage) : le nom en petit et, dessous, l'étape en cours « 0/3 👉 … » (48 px de haut en
   *   portrait, comme l'ancienne pastille) ; les étapes suivantes s'annoncent par un message quand une étape se coche ;
   * - ordinateur, tablette : « 0/3 ●●○○ » et 4 étapes en petit dessous (✅ faite, 👉 en cours, ⬜ à faire).
   * Tailles (trackerMode) : « compact » (téléphone en portrait, 48 px de haut), « side » (téléphone en paysage, nom
   * sur 3 lignes au plus) et « desk » (ordinateur, tablette).
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
    // La quête suivie, sinon le chapitre en cours, sinon la première quête rejointe (src/sim/quests.js).
    const tq = trackerQuest(p);
    const q = tq ? OBJECTIVES.find((o) => o.id === tq.id) : null;
    if (!q) {
      this.tracker.hidden = true;
      this.layoutTop();
      return;
    }
    const [cur, max] = q.progress(p);
    const count = `${Math.min(cur, max)}/${max}`;
    const where = this.whereText(q.id);
    const block = shortBlockText(p, q.id); // (la phrase entière est dans la bulle et le journal)
    const kind = tq.kind;
    const mode = trackerMode();
    const stepsKey = view ? view.steps.map((s) => s.state[0]).join('') : '';
    const active = activeQuests(p);
    const key = `${q.id}|${kind}|${count}|${where}|${block}|${getLang()}|${stepsKey}|${this.folded}|${mode}|${active.join(',')}`;
    if (key !== this.trackerKey) {
      // La même quête a avancé : petit rebond (surtout utile quand le suivi est rangé en pastille).
      const moved = !!this.trackerKey && this.trackerWas?.id === q.id && (this.trackerWas.count !== count || this.trackerWas.steps !== stepsKey);
      this.trackerKey = key;
      this.trackerWas = { id: q.id, count, steps: stepsKey };
      this.tracker.replaceChildren(...this.trackerContent(q, view, { count, where, mode, kind, block, active }));
      const cl = this.tracker.classList;
      cl.toggle('following', !!view);
      cl.toggle('main', kind === 'main'); // ⭐ le chapitre en cours de l'histoire
      cl.toggle('folded', this.folded);
      cl.toggle('side-right', mode !== 'desk');
      cl.toggle('compact', mode === 'compact');
      // téléphone, quête suivie (et possible) : l'étape en cours sous le nom
      cl.toggle('step-only', mode !== 'desk' && !!view && !block);
      cl.toggle('blocked', !!block);
      cl.toggle('juggle', active.length > 1); // (⇄ : plusieurs quêtes en cours)
      cl.remove('title2', 'step3');
      if (moved || this.switched) this.bumpTracker();
      this.switched = false;
      this.trackerFit = mode !== 'desk' && !!view && !block && !this.folded; // à mesurer une fois affiché
    }
    this.tracker.hidden = false;
    if (this.trackerFit) {
      // Téléphone, quête suivie : l'étape en cours ne tient pas sur deux lignes → elle prend la place du nom (qui reste
      // sur la pastille et au journal) ; en portrait (44 px), elle tient sur une ligne → le nom peut en prendre deux.
      const sub = this.tracker.querySelector('.qt-sub');
      if (sub?.offsetHeight) {
        this.trackerFit = false;
        const cl = this.tracker.classList;
        cl.toggle('title2', sub.offsetHeight < parseFloat(getComputedStyle(sub).lineHeight) * 1.5);
        cl.toggle('step3', sub.scrollHeight > sub.clientHeight + 1);
      }
    }
    this.layoutTop();
  }

  /**
   * Ce qu'il y a dans le suivi : la pastille rangée, ou la poignée, le nom de la quête et 🧭 / ✋ (+ ses étapes).
   * L'icône : ⭐ le chapitre en cours (⭐🧭 s'il est suivi), 🧭 une quête suivie, 🎯 une quête rejointe.
   */
  trackerContent(q, view, { count, where, mode, kind, block, active = [] }) {
    const right = mode !== 'desk'; // téléphone : contre le bord droit ; ordinateur : contre le bord gauche
    const icon = kind === 'main' ? (view ? '⭐🧭' : '⭐') : view ? '🧭' : '🎯';
    const title = questTitle(this.profile, q.id);
    const chev = (s, cls = 'qt-chev') => h('span', { class: cls, 'aria-hidden': 'true' }, s);
    if (this.folded) {
      // La flèche montre de quel côté la carte va s'ouvrir.
      return [h('button', {
        class: 'qt-pill',
        title: `${title} — ${t('quest_unfold')}`,
        'aria-label': `${t('quest_unfold')} : ${title} (${count})`,
        'aria-expanded': 'false',
        onClick: () => this.setFolded(false),
      }, right ? chev('‹') : null, h('span', { class: 'qt-icon' }, icon), h('b', { class: 'qt-count' }, count), right ? null : chev('›'))];
    }
    const show = () => this.showQuest(q.id); // la bulle de la quête (et le repère de l'étape en cours)
    const countEl = h('b', { class: 'qt-count' }, count);
    // Ordinateur : 4 étapes sous le nom ; téléphone : seulement l'étape en cours, dans la ligne sous le nom.
    // (pas encore possible : ni étapes ni repère, seulement ce qu'il faut d'abord)
    const w = view && mode === 'desk' && !block ? stepWindow(view.steps, 4) : null;
    // Sous le nom : « 0/3 📍 où aller » ; quête suivie : « 0/3 👉 l'étape en cours » (téléphone) ou « 0/3 ●●○○ ».
    let sub;
    if (block) sub = [countEl, h('span', { class: 'qt-where qt-block' }, `🔒 ${block}`)];
    else if (!view) sub = [countEl, where ? h('span', { class: 'qt-where' }, `📍 ${where}`) : null];
    else if (!w) sub = [countEl, view.current ? h('span', { class: 'qt-now' }, `👉 ${keepLast(t(`quest_step_${view.current.id}`))}`) : null];
    else {
      // Longue quête : des petits points disent où on en est (comme dans la bulle du guide).
      const n = view.steps.findIndex((s) => s.state === 'now') + 1;
      sub = [countEl, w.before || w.after
        ? h('span', { class: 'qt-dots', role: 'img', 'aria-label': t('quest_stepOf', { n, total: view.steps.length }) },
          view.steps.map((s) => h('i', { class: s.state })))
        : null];
    }
    const head = h('button', { class: 'qt-head', title: `📍 ${where} — ${t('quest_trackerTitle')}`, onClick: show },
      h('b', { class: 'qt-title' }, h('span', { class: 'qt-icon', 'aria-hidden': 'true' }, icon), ' ', keepLast(title)),
      h('span', { class: 'qt-sub' }, sub));
    // (pas encore possible : pas de 🧭, la raison prend la place ; une quête déjà suivie garde ✋ pour arrêter)
    const quick = view
      ? h('button', { class: 'qt-quick', title: t('quest_stop'), 'aria-label': t('quest_stop'), onClick: () => this.stopFollowing() }, '✋')
      : block ? null : h('button', { class: 'qt-quick primary', title: t('quest_follow'), 'aria-label': t('quest_follow'), onClick: () => this.startFollow(q.id) }, '🧭');
    // Ranger : une poignée sur le bord gauche de la carte (la flèche montre le bord où elle se range), loin de ✋.
    const fold = h('button', { class: 'qt-fold', title: t('quest_fold'), 'aria-label': t('quest_fold'), 'aria-expanded': 'true', onClick: () => this.setFolded(true) },
      chev(right ? '›' : '‹', 'qt-grip'));
    // ⇄ Plusieurs quêtes en cours (le chapitre et les quêtes rejointes) : on passe à la suivante d'un toucher (touche N
    // au clavier). Les petits points disent combien il y en a et laquelle est devant.
    const at = active.indexOf(q.id);
    const juggle = active.length > 1
      ? h('button', {
        class: 'qt-switch',
        title: `${t('qj_switch')} (${at + 1}/${active.length})${mode === 'desk' ? ' · N' : ''}`,
        'aria-label': `${t('qj_switch')} (${at + 1}/${active.length})`,
        onClick: () => this.cycleQuest(1),
      }, h('span', { class: 'qt-switch-icon', 'aria-hidden': 'true' }, '⇄'),
      h('span', { class: 'qt-switch-dots', 'aria-hidden': 'true' }, active.map((x) => h('i', { class: x === q.id ? 'on' : '' }))))
      : null;
    const out = [fold, h('div', { class: 'qt-row' }, head, juggle, quick)];
    if (w) {
      out.push(h('ol', { class: 'qt-steps' }, w.steps.map((s) => h('li', { class: `qt-step ${s.state}` },
        h('span', { class: 'qt-check', 'aria-hidden': 'true' }, s.state === 'done' ? '✅' : s.state === 'now' ? '👉' : '⬜'),
        h('span', { class: 'qt-label' }, t(`quest_step_${s.id}`))))));
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
      // Ordinateur : à gauche, sous la carte d'infos (et sous la bulle de la quête quand elle est ouverte : elle se
      // pose au même endroit ; pendant le tutoriel, le suivi est caché).
      top = (hud.querySelector('.hud-info')?.getBoundingClientRect().bottom || 148) + 8;
      const b = this.bubble.classList.contains('quest-bubble') ? this.bubbleBox() : null;
      if (b && b.bottom + 8 > top) top = b.bottom + 8;
    } else {
      // Téléphone : à droite, sous les boutons du haut (en paysage, ils ne prennent que la droite de la barre).
      top = (hud.querySelector('.hud-buttons')?.getBoundingClientRect().bottom || hud.getBoundingClientRect().bottom || 100) + 6;
      const b = this.bubbleBox();
      const r = el.getBoundingClientRect();
      if (b && b.left < r.right && b.right > r.left && b.bottom + 6 > top) top = b.bottom + 6;
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
   * - Ordinateur : la bulle sous la carte d'infos (en haut à gauche), le reste via le CSS. Tablette (au doigt) :
   *   le CSS met aussi en haut le bandeau d'événement et les pastilles d'état ; dans la colonne du suivi, ils
   *   passent sous lui (et les messages sous eux).
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
      reset(ui.help);
      // Au doigt (tablette), le bandeau d'événement et les pastilles d'état sont en haut (CSS, `top`) : dans la colonne
      // du suivi, ils se posent sous lui. À la souris, ils sont en bas de l'écran : rien à faire.
      const topped = matchMedia('(pointer: coarse)').matches;
      let low = side; // le bas de ce qui est déjà posé dans la colonne du suivi
      for (const el of [ev, ui.statusBar]) {
        if (!el) continue;
        const top = topped && !el.hidden && besideSide(low, el.getBoundingClientRect()) ? `${Math.round(low.bottom + 8)}px` : '';
        if (el.style.top !== top) el.style.top = top;
        if (el.style.bottom) el.style.bottom = '';
        const b = top ? el.getBoundingClientRect() : null;
        if (b?.height > 0) low = { left: Math.min(low.left, b.left), right: Math.max(low.right, b.right), top: low.top, bottom: b.bottom };
      }
      // Les messages (au milieu, en haut) passent dessous si la fenêtre est trop étroite pour les deux.
      const toasts = ui.toasts;
      const top = besideSide(low, toasts.getBoundingClientRect()) ? `${Math.round(low.bottom + 8)}px` : '';
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
      // (la bulle : sa vraie place, sans son animation d'entrée, voir bubbleBox)
      const r = el === this.bubble ? this.bubbleBox() : el.getBoundingClientRect();
      if (r?.height > 0) y = r.bottom + gap;
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

  /**
   * Suivre une quête (🧭). Une quête pas encore possible ne se suit pas (le suivi guiderait vers l'impossible) : un
   * petit mot dit ce qu'il faut d'abord. Une quête secondaire qu'on n'a pas encore rejointe est rejointe d'abord ;
   * s'il y en a déjà MAX_JOINED, un petit mot dit d'en enlever une (avec 📖 Mes quêtes) et rien d'autre ne change.
   */
  startFollow(id) {
    const p = this.profile;
    if (!p) return;
    const can = canFollow(p, id);
    if (!can.ok) {
      if (can.reason === 'blocked') this.notice({ emoji: '🔒', text: questTitle(p, id), hint: t('qj_notYet', { why: blockText(p, id) }), journal: true, now: true });
      else if (can.reason === 'full') this.notice({ emoji: '🎯', text: t('qj_fullFollow', { max: MAX_JOINED }), journal: true, now: true });
      return;
    }
    if (questKind(p, id) === 'side' && !joinQuest(p, id).ok) return;
    if (p.questFollow && p.questFollow.id !== id) holdFollow(p); // (la quête qu'on quitte reprendra à son étape)
    // Même quête que celle qu'on vient d'arrêter (✋ par erreur), ou qu'on a quittée en jonglant : même étape.
    followQuest(p, id, this.recent?.id === id ? this.recent : heldFollow(p, id));
    this.recent = null;
    this.keepGuiding = false;
    this.questFocus = null;
    this.questBubble = null;
    this.notices.close(); // (🧭 touché dans un petit mot : il a fait son travail)
    this.ui.closePanel();
    // L'enfant choisit lui-même de suivre une quête : le suivi rangé en pastille se rouvre (il pourra le ranger).
    if (this.folded) {
      this.folded = false;
      writeFold(false);
    }
    this.trackerKey = '';
    const v = followView(p, OBJECTIVES);
    if (v?.current) this.ui.toast(`🧭 ${questTitle(p, id)} — ${t(`quest_step_${v.current.id}`)}`, 5000); // (rien pour une quête cachée)
    this.tick();
  }

  stopFollowing() {
    const p = this.profile;
    if (!p) return;
    // Le suivi garde cette quête (avec 🧭 pour la reprendre là où on en était) au lieu de passer à une autre.
    if (p.questFollow) {
      this.recent = { ...p.questFollow, seen: [...p.questFollow.seen] };
      holdFollow(p);
    }
    this.keepGuiding = false;
    stopFollow(p);
    this.highlight = null;
    this.releaseMarker();
    this.trackerKey = '';
    this.tick();
  }

  /** Après une quête passée ou enlevée : plus de repère ni de bulle pour elle. */
  forgetQuest(id) {
    if (this.recent?.id === id) this.recent = null;
    if (this.questFocus?.id === id) this.stopQuestFocus();
    if (this.questBubble?.id === id) this.questBubble = null;
    if (!this.profile?.questFollow) {
      this.highlight = null;
      this.releaseMarker();
    }
    this.trackerKey = '';
  }

  /**
   * ⏭️ Passer une quête pour l'instant (src/sim/quests.js, passQuest) : le chapitre en cours (le suivant arrive, il est
   * annoncé) ou une quête rejointe (mise de côté : ↩️ Reprendre dans 📖 Journal, 🎯 Mes quêtes). Rien n'est perdu.
   * La bulle de la quête, si elle est ouverte, montre la quête qui est maintenant devant : on peut passer, passer…
   */
  pass(id) {
    const p = this.profile;
    if (!p) return;
    const hadBubble = this.questBubble?.id === id;
    const r = passQuest(p, id);
    if (!r.ok) return;
    this.forgetQuest(id);
    if (r.kind === 'main') this.ui.toast(r.next ? `${t('qj_skipped')} ${t('qj_newChapter', { name: questTitle(p, r.next) })}` : t('qj_skipped'), 6000);
    else this.ui.toast(t(STORY.includes(id) ? 'qj_passedChapter' : 'qj_passed'), 5000);
    const tq = trackerQuest(p);
    if (hadBubble && tq) {
      this.questBubble = { id: tq.id, until: performance.now() + QUEST_BUBBLE_MS };
      this.qbKey = '';
    }
    this.switched = true;
    this.tick();
  }

  /** (ancien nom, gardé pour les appels existants) */
  skipMain(id) {
    this.pass(id);
  }

  /**
   * ⇄ Mettre une autre quête devant (le chapitre en cours ou une quête rejointe). Si on suivait une quête (🧭), on
   * suit la nouvelle, reprise à son étape, quand c'est possible ; sinon le suivi dit ce qu'il faut d'abord (🔒).
   * La bulle de la quête, si elle est ouverte, montre la nouvelle.
   */
  switchTo(id) {
    const p = this.profile;
    if (!p || this.active) return false;
    const cur = trackerQuest(p);
    if (!id || cur?.id === id) return false;
    // On guidait (🧭) : on continue de guider, même après être passé par une quête pas encore possible (🔒, elle
    // ne se suit pas) ; ✋ ou 🧭 remettent cela à zéro.
    const guiding = !!cur?.followed || (!!this.keepGuiding && !p.questFollow);
    if (!setFront(p, id)) return false;
    if (p.questFollow) {
      holdFollow(p);
      stopFollow(p);
    }
    this.recent = null;
    this.stopQuestFocus();
    if (guiding && !followBlock(id, p)) followQuest(p, id, heldFollow(p, id));
    this.keepGuiding = guiding;
    if (this.questBubble) {
      this.questBubble = { id, until: performance.now() + QUEST_BUBBLE_MS };
      this.qbKey = '';
    }
    this.markerKey = '';
    this.trackerKey = '';
    this.switched = true;
    this.tick();
    return true;
  }

  /** ⇄ La quête suivante (dir = 1) ou précédente (dir = -1) dans le suivi ; touche N au clavier. */
  cycleQuest(dir = 1) {
    const p = this.profile;
    if (!p || this.active) return false;
    const id = nextQuest(p, dir);
    return id ? this.switchTo(id) : false;
  }

  /** ↩️ Reprendre une quête mise de côté : elle revient dans 🎯 Mes quêtes (sauf s'il y en a déjà MAX_JOINED). */
  resumeAside(id) {
    const p = this.profile;
    if (!p) return false;
    const r = resumeAsideQuest(p, id);
    if (!r.ok) {
      if (r.reason === 'full') this.fullToast();
      return false;
    }
    this.trackerKey = '';
    this.ui.toast(t('qj_resumedAside', { name: questTitle(p, id) }), 4500);
    this.tick();
    return true;
  }

  /**
   * ↩️ Reprendre un chapitre passé : il redevient le chapitre en cours s'il vient avant ; s'il vient après, il va
   * dans 🎯 Mes quêtes pour être fait tout de suite (src/sim/quests.js, resumeChapter).
   */
  resume(id) {
    const p = this.profile;
    if (!p) return false;
    const r = resumeChapter(p, id);
    if (!r.ok) {
      if (r.reason === 'full') this.fullToast();
      return false;
    }
    this.trackerKey = '';
    this.ui.toast(t(r.how === 'joined' ? 'qj_resumedMine' : 'qj_resumed', { name: questTitle(p, id) }), 5000);
    this.tick();
    return true;
  }

  /** « Tu as déjà 3 quêtes » : le journal ouvert descend jusqu'à 🎯 Mes quêtes, pour en enlever une. */
  fullToast() {
    this.ui.toast(`✋ ${t('qj_full', { max: MAX_JOINED })}`, 5000);
    // (après le nouveau dessin du journal, qui suit le toucher du bouton)
    setTimeout(() => {
      const mine = this.ui.panelEl?.querySelector?.('.qj-mine');
      if (!mine) return;
      mine.scrollIntoView({ block: 'start' }); // (pas « smooth » : le journal se redessine souvent et l'arrêtait)
      mine.classList.add('flash');
      setTimeout(() => mine.classList.remove('flash'), 1300);
    }, 60);
  }

  /** ➕ Rejoindre une quête secondaire. */
  join(id) {
    const p = this.profile;
    if (!p) return false;
    const r = joinQuest(p, id);
    if (r.ok) {
      this.trackerKey = '';
      this.ui.toast(t('qj_joined', { name: questTitle(p, id) }), 4000);
      this.tick();
    } else if (r.reason === 'full') this.fullToast();
    return r.ok;
  }

  /** ✖️ Enlever une quête rejointe (sans rien perdre). */
  leave(id) {
    const p = this.profile;
    if (!p || !leaveQuest(p, id)) return;
    this.forgetQuest(id);
    this.ui.toast(t('qj_left'), 4500);
    this.tick();
  }

  updateFollowing() {
    const p = this.profile;
    // Devenue impossible (plus assez d'argent pour le voyage…) : on ne guide plus, le suivi dit ce qu'il faut d'abord.
    if (followBlock(p.questFollow.id, p)) {
      this.applyTarget({});
      return;
    }
    const r = updateFollow(p, OBJECTIVES, this.context());
    if (r?.questDone) {
      this.highlight = null;
      this.releaseMarker();
      // (le chapitre en cours — un chapitre suivi et pas passé — : le guide fête sa fin et annonce le suivant,
      // chapterDone ; pas deux messages)
      if (!STORY.includes(r.id) || questState(p).skipped.includes(r.id)) this.ui.toast(`🏆 ${t('quest_followDone', { name: questTitle(p, r.id) })}`, 5000);
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

  // --- « Montre-moi » et la bulle de la quête

  /**
   * Toucher le nom d'une quête (suivi à l'écran, « Montre-moi » du journal) : ferme le journal, montre où la faire
   * (repère, cercle) et ouvre sa bulle. Pour la quête suivie : le repère de l'étape en cours revient.
   */
  showQuest(id) {
    const p = this.profile;
    if (!p) return;
    const g = questGuide(id, p);
    if (!g) return;
    this.ui.closePanel();
    setFront(p, id); // (le suivi à l'écran montre la même quête que la bulle ; rien si ce n'est ni le chapitre ni une rejointe)
    if (p.questFollow?.id === id) {
      this.markerKey = '';
      this.highlight = null;
    } else {
      if (p.questFollow) {
        this.recent = { ...p.questFollow, seen: [...p.questFollow.seen] }; // (🧭 la reprendra à la même étape)
        holdFollow(p);
        stopFollow(p); // une seule quête guidée à la fois
      }
      // Pas encore possible : la bulle dit pourquoi, sans montrer où aller.
      this.questFocus = followBlock(id, p) ? null : { id, spec: g.target, until: performance.now() + 45000 };
      if (!this.questFocus) {
        this.highlight = null;
        this.releaseMarker();
      }
      this.markerKey = '';
    }
    this.trackerKey = '';
    this.notices.hold(); // (un petit mot affiché reviendra après)
    this.questBubble = { id, until: performance.now() + QUEST_BUBBLE_MS };
    this.qbKey = '';
    this.tick();
  }

  /** Une fenêtre, un message ou un mini-jeu prend l'écran : les petits mots du guide attendent. */
  busy() {
    const ui = this.ui;
    return !!ui.panel || !!ui.modalOpen || !!ui.minigameOpen || ui.isBlocking() || !!this.game.activities?.active;
  }

  /**
   * Un petit mot du guide dans la bulle (pas pendant le tutoriel : alors un message) :
   * { emoji, text, hint?, follow? (id d'une quête : bouton 🧭 Suivre), journal? (bouton 📖 Mes quêtes), now? }.
   * Il attend qu'aucune fenêtre ne soit ouverte (avant, il disparaissait sans être vu quand le menu des soins, la
   * fiche, 💼 Métiers ou la fenêtre « niveau N » étaient ouverts) ; now : la réponse à un bouton qu'on vient de
   * toucher (« Tu as déjà 3 quêtes »…), montrée tout de suite (un message si une fenêtre est ouverte).
   */
  notice(n) {
    if (!this.profile) return;
    if (this.active || (n.now && this.busy())) {
      this.ui.toast(`${n.emoji} ${n.text}${n.hint ? ` ${n.hint}` : ''}`, 6000);
      return;
    }
    if (n.now) {
      // La réponse au bouton qu'on vient de toucher : tout de suite, à la place de la bulle de la quête.
      this.notices.hold();
      this.notices.add(n, { first: true });
      this.questBubble = null;
    } else this.notices.add(n); // (une bulle de quête ouverte : il attend qu'elle se ferme)
    this.qbKey = '';
    this.tick();
  }

  /**
   * Un chapitre de l'histoire vient d'être fini (src/game/Game.js) : bravo, et la suite (r : afterQuestsDone de
   * src/sim/quests.js) : le chapitre suivant (🧭 pour le suivre), la fin de toute l'histoire, ou les chapitres
   * passés qui restent. reward : « +20 🪙 » ou ''. Une fenêtre est ouverte : un message tout de suite (avec la
   * récompense), et la bulle quand la fenêtre se ferme.
   */
  chapterDone(id, r, reward = '') {
    const p = this.profile;
    if (!p) return;
    const end = chapterEnd(r);
    const text = `${t('qj_chapterDone', { name: questTitle(p, id) })}${reward ? ` ${reward}` : ''}`;
    if (this.busy() && !this.active) this.ui.toast(`⭐ ${text}`, 5000);
    if (end.kind === 'next') this.notice({ emoji: '⭐', text, hint: t('qj_nextChapter', { name: questTitle(p, end.next) }), follow: end.next });
    else if (end.kind === 'finished') this.notice({ emoji: '🎉', text, hint: t('qj_storyFinished'), journal: true });
    else this.notice({ emoji: '⭐', text, hint: t('qj_skippedLeft', { n: end.n }), journal: true });
  }

  /** Ferme la bulle (celle d'une quête touchée, ou le petit mot affiché : le suivant viendra). */
  closeQuestBubble() {
    this.questBubble = null;
    this.notices.close();
    this.hideQuestBubble();
    this.layoutTop();
  }

  hideQuestBubble() {
    if (this.bubble.hidden && !this.bubble.classList.contains('quest-bubble')) return;
    this.qbKey = '';
    this.bubble.hidden = true;
    this.bubble.classList.remove('quest-bubble');
  }

  /**
   * La bulle : un petit mot du guide (notice), ou la quête touchée (this.questBubble) avec son nom, où aller et
   * comment (ou ce qu'il faut d'abord), et ses boutons.
   */
  renderQuestBubble(notice = null) {
    const p = this.profile;
    const b = notice ? { notice } : this.questBubble;
    // Une fenêtre ou un mini-jeu prend la place : la bulle d'une quête touchée a fait son travail. (Un petit mot,
    // lui, attend : NoticeQueue.)
    if (!p || (!notice && (performance.now() > b.until || this.busy()))) {
      this.closeQuestBubble();
      return;
    }
    let key;
    let parts;
    const btn = (label, onClick, cls = '') => h('button', { class: `qb-btn ${cls}`.trim(), onClick }, label);
    const journal = () => btn(t('qj_myQuests'), () => { this.closeQuestBubble(); this.ui.openJournal('quest'); });
    if (b.notice) {
      const n = b.notice;
      key = `n|${n.text}|${n.hint ?? ''}|${getLang()}`;
      const buttons = [];
      // (🧭 seulement si le chapitre suivant est possible : sinon il dira lui-même ce qu'il faut d'abord)
      if (n.follow && questKind(p, n.follow) !== 'done' && !blockText(p, n.follow)) buttons.push(btn(`🧭 ${t('quest_follow')}`, () => this.startFollow(n.follow), 'primary'));
      if (n.journal) buttons.push(journal());
      buttons.push(btn('OK', () => this.closeQuestBubble(), n.follow || n.journal ? '' : 'primary'));
      parts = { emoji: n.emoji, label: '', title: n.text, lines: n.hint ? [h('p', { class: 'tuto-hint' }, bubbleText(n.hint))] : [], buttons, speak: `${n.text} ${n.hint ?? ''}` };
    } else {
      const id = b.id;
      const kind = questKind(p, id);
      if (kind === 'done' || kind === 'hidden') {
        this.closeQuestBubble();
        return;
      }
      const followed = p.questFollow?.id === id;
      const why = blockText(p, id) ?? ''; // (pas encore possible : ni 🧭, ni étape, ni « où aller »)
      const view = followed && !why ? followView(p, OBJECTIVES) : null;
      const o = OBJECTIVES.find((x) => x.id === id);
      const [cur, max] = o.progress(p);
      const s = storyView(p);
      const label = kind === 'main' ? t('qj_bubbleMain', { n: s.chapter, total: s.total })
        : kind === 'story' ? t('qj_bubbleStory') : kind === 'side' ? t('qj_bubbleOther') : t('qj_bubbleSide');
      const step = view?.current ? t(`quest_step_${view.current.id}`) : '';
      const active = activeQuests(p);
      key = `q|${id}|${kind}|${followed}|${cur}/${max}|${why}|${step}|${getLang()}|${active.join(',')}`;
      const lines = [];
      if (why) lines.push(h('p', { class: 'tuto-hint qb-block' }, bubbleText(`🔒 ${t('qj_notYet', { why })}`)));
      else {
        lines.push(h('p', { class: 'tuto-hint qb-where' }, bubbleText(`📍 ${this.whereText(id)}`)));
        if (step) lines.push(h('p', { class: 'tuto-hint qb-now' }, bubbleText(t('qj_now', { step }))));
        else lines.push(h('p', { class: 'tuto-hint' }, bubbleText(hintText(p, id))));
      }
      // Tes quêtes : une pastille par quête en cours (⭐ le chapitre, 🎯 les rejointes) ; la toucher la met devant.
      if (active.length > 1 && (kind === 'main' || kind === 'joined')) {
        const main = mainQuest(p);
        lines.push(h('div', { class: 'qb-switch', role: 'group', 'aria-label': t('qj_activeTitle') },
          h('span', { class: 'qb-switch-label' }, t('qj_activeTitle')),
          active.map((x) => h('button', {
            class: `qb-chip${x === id ? ' on' : ''}`,
            'aria-pressed': x === id ? 'true' : 'false',
            title: questTitle(p, x),
            onClick: () => this.switchTo(x),
          }, h('span', { 'aria-hidden': 'true' }, x === main ? '⭐' : '🎯'), ' ', h('span', { class: 'qb-chip-name' }, questTitle(p, x))))));
      }
      const buttons = [];
      if (!followed && !why) buttons.push(btn(`🧭 ${t('quest_follow')}`, () => this.startFollow(id), 'primary'));
      if (followed) buttons.push(btn(`✋ ${t('quest_stop')}`, () => { this.closeQuestBubble(); this.stopFollowing(); }));
      // ⏭️ Passer pour l'instant : le chapitre (le suivant arrive) comme une quête rejointe (mise de côté).
      if (kind === 'main' || kind === 'joined') buttons.push(btn(t('qj_skip'), () => this.pass(id), 'qb-skip'));
      if (kind === 'side') {
        const full = joinedQuests(p).length >= MAX_JOINED; // (grisé, mais il répond : « Tu as déjà 3 quêtes »)
        buttons.push(btn(t('qj_join'), () => { if (this.join(id)) this.qbKey = ''; }, `${why ? 'primary' : ''}${full ? ' off' : ''}`));
      }
      buttons.push(journal());
      const reward = o.reward && !isSandbox(p) ? ` · ${o.reward} 🪙` : '';
      parts = {
        emoji: why ? '🔒' : kind === 'main' ? '⭐' : followed ? '🧭' : kind === 'side' ? '🗺️' : '🎯',
        label,
        title: `${questTitle(p, id)} (${Math.min(cur, max)}/${max}${reward})`,
        lines,
        buttons,
        speak: `${questTitle(p, id)}. ${why || hintText(p, id)}`,
      };
    }
    if (key !== this.qbKey) {
      this.qbKey = key;
      this.bubble.classList.remove('cheer');
      this.bubble.replaceChildren(
        h('div', { class: 'tuto-guide', 'aria-hidden': 'true' }, GUIDE),
        h('div', { class: 'tuto-main' },
          h('div', { class: 'tuto-top' },
            h('span', { class: 'tuto-emoji' }, parts.emoji),
            h('span', { class: 'qb-label' }, parts.label),
            h('button', { class: 'tuto-icon', title: t('tuto_read'), 'aria-label': t('tuto_read'), onClick: () => this.speak(parts.speak) }, '🔊'),
            h('button', { class: 'tuto-icon qb-close', title: t('qj_close'), 'aria-label': t('qj_close'), onClick: () => this.closeQuestBubble() }, '✕')),
          h('p', { class: 'tuto-text qb-title' }, bubbleText(parts.title)),
          ...parts.lines,
          h('div', { class: 'qb-actions' }, parts.buttons)),
      );
      this.bubble.classList.add('quest-bubble');
    }
    this.bubble.hidden = false;
    this.layoutTop();
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

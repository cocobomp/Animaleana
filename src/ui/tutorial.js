// Tutoriel guidé (pour les enfants) et quêtes claires :
// - une bulle avec le guide Biscuit 🐶, des phrases très courtes et de gros emojis ;
// - le repère 3D (game.marker) au-dessus de ce qu'il faut toucher dans le monde ;
// - un cercle qui clignote autour du bouton à presser (barre du haut, menus) ;
// - un petit suivi de quête discret sur le côté : la quête suivie (« Suivre la quête », avec ses petites étapes
//   qui se cochent toutes seules), sinon le chapitre en cours de l'histoire de la ferme (⭐), sinon la première
//   quête rejointe (🎯), sinon rien ; il se range en pastille ;
// - la bulle de la quête (toucher son nom) : où aller, comment, et « Passer pour l'instant » (chapitre),
//   « Enlever cette quête » (quête rejointe), « 📖 Mes quêtes » ; et le petit mot de fin d'un chapitre.
// La logique (étapes, réussite) est dans src/sim/tutorial.js ; l'histoire et les quêtes rejointes dans
// src/sim/quests.js ; le journal dans src/ui/quests.js.

import { h, isPhone } from './dom.js';
import { t, getLang } from '../i18n.js';
import { nbsp } from './minigames/frame.js'; // typographie française (« Adopter » ! ne se coupe pas)
import { OBJECTIVES, objectiveParams } from '../sim/objectives.js';
import { earn, isSandbox } from '../sim/profile.js';
import {
  tutorialStep, stepNumber, noteEvent, updateTutorial, skipTutorial, restartTutorial,
  questGuide, questBlock, TUTORIAL_REWARD,
  followQuest, stopFollow, noteFollowEvent, updateFollow, followView, stepWindow,
} from '../sim/tutorial.js';
import {
  trackerQuest, questKind, mainQuest, storyView, joinQuest, leaveQuest, skipChapter, resumeChapter, MAX_JOINED,
} from '../sim/quests.js';
import { cap, hintText } from './quests.js';

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
    this.questBubble = null; // la bulle de la quête : { id, until } ou un petit mot { notice, until }

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
    this.recent = null; // la dernière quête choisie (arrêtée avec ✋, ou montrée depuis le journal)
    this.questBubble = null;
    if (this.active) this.ui.hideHelp();
    this.tick();
  }

  end() {
    this.questBubble = null;
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
      // Pas de tutoriel : la bulle sert à la quête (son nom touché, ou la fin d'un chapitre).
      if (this.questBubble) this.renderQuestBubble();
      else this.bubble.hidden = true;
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
   * boutons du haut (téléphone, loin du joystick). Une poignée ‹ / › à gauche pour le ranger en pastille (mémorisé),
   * puis le nom de la quête (le toucher ouvre sa bulle : où aller, Passer / Enlever, 📖 Mes quêtes) avec sa
   * progression (0/3), et 🧭 pour la suivre (✋ pour arrêter) contre l'autre bord : le nom sépare toujours
   * « ranger » de « arrêter ». Quelle quête : la suivie (🧭), sinon le chapitre en cours (⭐), sinon la première
   * quête rejointe (🎯), sinon rien (trackerQuest, src/sim/quests.js) : jamais une quête que l'enfant n'a pas choisie
   * en dehors de l'histoire.
   * Sous le nom : « 0/3 📍 où aller », ou « 🔒 ce qu'il faut d'abord » si elle n'est pas encore possible. Quête suivie :
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
    // Sans quête suivie : la dernière choisie (arrêtée avec ✋ : 🧭 la reprend là où on en était) si c'est encore le
    // chapitre en cours ou une quête rejointe, sinon le chapitre en cours, sinon la première quête rejointe.
    const tq = trackerQuest(p, { recent: this.recent?.id ?? null });
    const q = tq ? OBJECTIVES.find((o) => o.id === tq.id) : null;
    if (!q) {
      this.tracker.hidden = true;
      this.layoutTop();
      return;
    }
    const [cur, max] = q.progress(p);
    const count = `${Math.min(cur, max)}/${max}`;
    const where = this.whereText(q.id);
    const b = questBlock(q.id, p);
    const block = b ? cap(t(b.key, b.params)) : '';
    const kind = tq.kind;
    const mode = trackerMode();
    const stepsKey = view ? view.steps.map((s) => s.state[0]).join('') : '';
    const key = `${q.id}|${kind}|${count}|${where}|${block}|${getLang()}|${stepsKey}|${this.folded}|${mode}`;
    if (key !== this.trackerKey) {
      // La même quête a avancé : petit rebond (surtout utile quand le suivi est rangé en pastille).
      const moved = !!this.trackerKey && this.trackerWas?.id === q.id && (this.trackerWas.count !== count || this.trackerWas.steps !== stepsKey);
      this.trackerKey = key;
      this.trackerWas = { id: q.id, count, steps: stepsKey };
      this.tracker.replaceChildren(...this.trackerContent(q, view, { count, where, mode, kind, block }));
      const cl = this.tracker.classList;
      cl.toggle('following', !!view);
      cl.toggle('main', kind === 'main'); // ⭐ le chapitre en cours de l'histoire
      cl.toggle('folded', this.folded);
      cl.toggle('side-right', mode !== 'desk');
      cl.toggle('compact', mode === 'compact');
      cl.toggle('step-only', mode !== 'desk' && !!view); // téléphone, quête suivie : l'étape en cours sous le nom
      cl.remove('title2', 'step3');
      if (moved) this.bumpTracker();
      this.trackerFit = mode !== 'desk' && !!view && !this.folded; // à mesurer une fois affiché
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
  trackerContent(q, view, { count, where, mode, kind, block }) {
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
    const w = view && mode === 'desk' ? stepWindow(view.steps, 4) : null;
    // Sous le nom : « 0/3 📍 où aller » ; quête suivie : « 0/3 👉 l'étape en cours » (téléphone) ou « 0/3 ●●○○ ».
    let sub;
    if (!view) sub = [countEl, block ? h('span', { class: 'qt-where qt-block' }, `🔒 ${block}`) : where ? h('span', { class: 'qt-where' }, `📍 ${where}`) : null];
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
    const quick = view
      ? h('button', { class: 'qt-quick', title: t('quest_stop'), 'aria-label': t('quest_stop'), onClick: () => this.stopFollowing() }, '✋')
      : h('button', { class: 'qt-quick primary', title: t('quest_follow'), 'aria-label': t('quest_follow'), onClick: () => this.startFollow(q.id) }, '🧭');
    // Ranger : une poignée sur le bord gauche de la carte (la flèche montre le bord où elle se range), loin de ✋.
    const fold = h('button', { class: 'qt-fold', title: t('quest_fold'), 'aria-label': t('quest_fold'), 'aria-expanded': 'true', onClick: () => this.setFolded(true) },
      chev(right ? '›' : '‹', 'qt-grip'));
    const out = [fold, h('div', { class: 'qt-row' }, head, quick)];
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
      if (!this.bubble.hidden && this.questBubble) {
        const b = this.bubble.getBoundingClientRect();
        if (b.height && b.bottom + 8 > top) top = b.bottom + 8;
      }
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

  /**
   * Suivre une quête (🧭). Une quête secondaire qu'on n'a pas encore rejointe est rejointe d'abord ; s'il y en a
   * déjà MAX_JOINED, un petit mot dit d'en enlever une (avec 📖 Mes quêtes) et rien d'autre ne change.
   */
  startFollow(id) {
    const p = this.profile;
    if (!p) return;
    if (questKind(p, id) === 'side') {
      const r = joinQuest(p, id);
      if (!r.ok) {
        if (r.reason === 'full') this.notice({ emoji: '🎯', text: t('qj_fullFollow', { max: MAX_JOINED }), journal: true });
        return;
      }
    }
    // Même quête que celle qu'on vient d'arrêter (✋ par erreur) : on reprend à la même étape.
    followQuest(p, id, this.recent);
    this.recent = null;
    this.questFocus = null;
    this.questBubble = null;
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
    if (p.questFollow) this.recent = { ...p.questFollow, seen: [...p.questFollow.seen] };
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

  /** ⏭️ Passer le chapitre en cours pour l'instant : le suivant arrive (il est annoncé). */
  skipMain(id) {
    const p = this.profile;
    if (!p) return;
    const next = skipChapter(p, id);
    if (next === undefined) return;
    this.forgetQuest(id);
    this.ui.toast(next ? `${t('qj_skipped')} ${t('qj_newChapter', { name: questTitle(p, next) })}` : t('qj_skipped'), 6000);
    this.tick();
  }

  /** ↩️ Reprendre un chapitre passé (il redevient le chapitre en cours s'il vient avant). */
  resume(id) {
    const p = this.profile;
    if (!p || !resumeChapter(p, id)) return;
    this.trackerKey = '';
    this.ui.toast(t('qj_resumed', { name: questTitle(p, id) }), 4000);
    this.tick();
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
    } else if (r.reason === 'full') this.ui.toast(t('qj_full', { max: MAX_JOINED }), 5000);
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
    const r = updateFollow(p, OBJECTIVES, this.context());
    if (r?.questDone) {
      this.highlight = null;
      this.releaseMarker();
      this.ui.toast(`🏆 ${t('quest_followDone', { name: questTitle(p, r.id) })}`, 5000);
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
    if (p.questFollow?.id === id) {
      this.markerKey = '';
      this.highlight = null;
    } else {
      if (p.questFollow) stopFollow(p); // une seule quête guidée à la fois
      this.recent = { id }; // le suivi montre cette quête (🧭 pour la suivre)
      this.questFocus = { id, spec: g.target, until: performance.now() + 45000 };
      this.markerKey = '';
    }
    this.trackerKey = '';
    this.questBubble = { id, until: performance.now() + QUEST_BUBBLE_MS };
    this.qbKey = '';
    this.tick();
  }

  /**
   * Un petit mot du guide dans la bulle (pas pendant le tutoriel : alors un message) :
   * { emoji, text, hint?, follow? (id d'une quête : bouton 🧭 Suivre), journal? (bouton 📖 Mes quêtes) }.
   */
  notice(n) {
    if (this.active || this.ui.minigameOpen || !this.profile) {
      this.ui.toast(`${n.emoji} ${n.text}${n.hint ? ` ${n.hint}` : ''}`, 6000);
      return;
    }
    this.questBubble = { notice: n, until: performance.now() + QUEST_BUBBLE_MS };
    this.qbKey = '';
    this.tick();
  }

  /**
   * Un chapitre de l'histoire vient d'être fini (src/game/Game.js) : bravo, et le chapitre suivant (🧭 pour le suivre).
   * reward : « +20 🪙 » ou ''.
   */
  chapterDone(id, next, reward = '') {
    const p = this.profile;
    if (!p) return;
    const text = `${t('qj_chapterDone', { name: questTitle(p, id) })}${reward ? ` ${reward}` : ''}`;
    if (next) this.notice({ emoji: '⭐', text, hint: t('qj_nextChapter', { name: questTitle(p, next) }), follow: next });
    else this.notice({ emoji: '🎉', text, hint: t('qj_storyFinished'), journal: true });
  }

  closeQuestBubble() {
    this.questBubble = null;
    this.qbKey = '';
    this.bubble.hidden = true;
    this.bubble.classList.remove('quest-bubble');
    this.layoutTop();
  }

  /** La bulle de la quête : son nom, où aller et comment (ou ce qu'il faut d'abord), et ses boutons. */
  renderQuestBubble() {
    const p = this.profile;
    const b = this.questBubble;
    // Une fenêtre ou un mini-jeu prend la place : la bulle a fait son travail.
    if (!p || performance.now() > b.until || this.ui.panel || this.ui.modalOpen || this.ui.minigameOpen) {
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
      if (n.follow && questKind(p, n.follow) !== 'done') buttons.push(btn(`🧭 ${t('quest_follow')}`, () => this.startFollow(n.follow), 'primary'));
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
      const view = followed ? followView(p, OBJECTIVES) : null;
      const o = OBJECTIVES.find((x) => x.id === id);
      const [cur, max] = o.progress(p);
      const blk = questBlock(id, p);
      const why = blk ? t(blk.key, blk.params) : '';
      const s = storyView(p);
      const label = kind === 'main' ? t('qj_bubbleMain', { n: s.chapter, total: s.total }) : kind === 'story' ? t('qj_bubbleStory') : t('qj_bubbleSide');
      const step = view?.current ? t(`quest_step_${view.current.id}`) : '';
      key = `q|${id}|${kind}|${followed}|${cur}/${max}|${why}|${step}|${getLang()}`;
      const lines = [];
      if (why) lines.push(h('p', { class: 'tuto-hint qb-block' }, bubbleText(`🔒 ${t('qj_notYet', { why })}`)));
      else {
        lines.push(h('p', { class: 'tuto-hint qb-where' }, bubbleText(`📍 ${this.whereText(id)}`)));
        if (step) lines.push(h('p', { class: 'tuto-hint qb-now' }, bubbleText(t('qj_now', { step }))));
        else lines.push(h('p', { class: 'tuto-hint' }, bubbleText(hintText(p, id))));
      }
      const buttons = [];
      if (!followed) buttons.push(btn(`🧭 ${t('quest_follow')}`, () => this.startFollow(id), 'primary'));
      if (kind === 'main') buttons.push(btn(t('qj_skip'), () => this.skipMain(id), 'qb-skip'));
      if (kind === 'joined') buttons.push(btn(t('qj_leaveLong'), () => this.leave(id), 'qb-leave'));
      buttons.push(journal());
      const reward = o.reward && !isSandbox(p) ? ` · ${o.reward} 🪙` : '';
      parts = {
        emoji: kind === 'main' ? '⭐' : followed ? '🧭' : '🎯',
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

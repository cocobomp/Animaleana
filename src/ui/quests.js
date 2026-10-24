// Journal, onglet Quêtes (openJournal, src/ui/panels.js) : quatre parties lisibles au téléphone.
//   ⭐ Histoire de la ferme : le chapitre en cours (Montre-moi, Suivre, Passer pour l'instant), les chapitres passés
//      (Reprendre), ceux déjà faits ✅ et combien il en reste à venir ;
//   🎯 Mes quêtes (n/3) : les quêtes secondaires rejointes (Montre-moi, Suivre, Enlever) ;
//   🗺️ Autres quêtes : par thème (on touche un thème pour l'ouvrir), avec ➕ Rejoindre ;
//   ✅ Terminées : repliées.
// Le modèle est dans src/sim/quests.js ; les actions (suivre, passer, enlever…) dans src/ui/tutorial.js.

import { h } from './dom.js';
import { t } from '../i18n.js';
import { OBJECTIVES, objectiveParams } from '../sim/objectives.js';
import { isSandbox } from '../sim/profile.js';
import { questGuide, questBlock } from '../sim/tutorial.js';
import {
  storyView, joinedQuests, otherQuests, doneQuests, canJoin, MAX_JOINED, STORY,
} from '../sim/quests.js';

const obj = (id) => OBJECTIVES.find((o) => o.id === id);
export const questName = (p, id) => t(`o_${id}`, objectiveParams(p, obj(id)));
/** « il te faut d'abord un cheval » → « Il te faut d'abord un cheval » (seul, en début de ligne). */
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
/** Pourquoi la quête n'est pas encore possible (texte), ou null. */
export function blockText(p, id) {
  const b = questBlock(id, p);
  return b ? t(b.key, b.params) : null;
}
/** Comment faire la quête : l'aide du suivi (sans animal ou sans cheval, d'abord le refuge). */
export function hintText(p, id) {
  const g = questGuide(id, p);
  if (!g) return '';
  return t(g.first ? `quest_hint_first_${g.first}` : `quest_hint_${id}`);
}

// Parties ouvertes du journal (les thèmes des autres quêtes, les terminées) : le temps de la partie.
const openParts = new Set();

/** La barre de progression et « 1/3 · 20 🪙 » d'une quête. */
function progress(p, id) {
  const o = obj(id);
  const [cur, max] = o.progress(p);
  return {
    bar: h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: { width: `${Math.min(100, (cur / max) * 100)}%` } })),
    count: h('small', { class: 'qc-count' }, `${Math.min(cur, max)}/${max}${o.reward && !isSandbox(p) ? ` · ${o.reward} 🪙` : ''}`),
  };
}

/**
 * Une carte de quête. kind : 'main' (chapitre en cours), 'joined' (rejointe), 'side' (à rejoindre).
 * Le chapitre en cours et les quêtes rejointes disent où aller et comment ; les autres seulement si elles ne sont
 * pas encore possibles.
 */
function questCard(ui, id, kind) {
  const tuto = ui.tutorial;
  const p = ui.game.profile;
  const { bar, count } = progress(p, id);
  const block = blockText(p, id);
  const followed = p.questFollow?.id === id;
  const icon = kind === 'main' ? '⭐' : kind === 'joined' ? (followed ? '🧭' : '🎯') : '🗺️';
  const act = (fn) => (e) => {
    e.stopPropagation();
    fn();
    ui.renderPanel();
  };
  const btn = (label, onClick, cls = '') => h('button', { class: `qc-btn ${cls}`.trim(), onClick }, label);
  const buttons = [];
  if (kind === 'main' || kind === 'joined') {
    buttons.push(btn(`👉 ${t('quest_showMe')}`, (e) => { e.stopPropagation(); tuto.showQuest(id); }));
    buttons.push(followed
      ? btn(`✋ ${t('quest_stop')}`, act(() => tuto.stopFollowing()))
      : btn(`🧭 ${t('quest_follow')}`, (e) => { e.stopPropagation(); tuto.startFollow(id); }, 'primary'));
    buttons.push(kind === 'main'
      ? btn(t('qj_skip'), act(() => tuto.skipMain(id)), 'qc-skip')
      : btn(t('qj_leave'), act(() => tuto.leave(id)), 'qc-leave'));
  } else {
    const can = canJoin(p, id);
    buttons.push(h('button', { class: 'qc-btn primary qc-join', disabled: !can.ok, onClick: act(() => tuto.join(id)) }, t('qj_join')));
  }
  const wasChapter = kind === 'side' && STORY.includes(id);
  return h('div', { class: `qcard ${kind}${followed ? ' following' : ''}`, 'data-quest': id },
    h('div', { class: 'qc-top' },
      h('span', { class: 'obj-icon', 'aria-hidden': 'true' }, icon),
      h('span', { class: 'card-main' },
        h('b', { class: 'qc-title' }, questName(p, id)),
        wasChapter ? h('span', { class: 'qc-tag' }, t('qj_wasChapter')) : null,
        bar),
      count),
    kind !== 'side' && !block ? h('p', { class: 'qc-where' }, `📍 ${tuto.whereText(id)}`) : null,
    kind !== 'side' && !block ? h('p', { class: 'qc-hint' }, hintText(p, id)) : null,
    block ? h('p', { class: 'qc-block' }, `🔒 ${t('qj_notYet', { why: block })}`) : null,
    h('div', { class: 'qc-actions' }, buttons));
}

/** Un titre de partie qu'on touche pour l'ouvrir ou la fermer. */
function toggle(ui, key, label) {
  const open = openParts.has(key);
  return h('button', {
    class: `qj-toggle ${open ? 'open' : ''}`,
    'aria-expanded': open ? 'true' : 'false',
    onClick: () => {
      if (open) openParts.delete(key);
      else openParts.add(key);
      ui.renderPanel();
    },
  }, h('span', {}, label), h('span', { class: 'qj-chev', 'aria-hidden': 'true' }, open ? '▴' : '▾'));
}

/** ⭐ Histoire de la ferme. */
function storySection(ui) {
  const p = ui.game.profile;
  const s = storyView(p);
  const out = [h('h3', { class: 'qj-h' }, t('qj_storyTitle'),
    s.current ? h('small', {}, ` · ${t('qj_chapter', { n: s.chapter, total: s.total })}`) : null)];
  if (s.current) {
    out.push(questCard(ui, s.current, 'main'));
    if (s.upcoming) out.push(h('p', { class: 'qj-note' }, t('qj_upcoming', { n: s.upcoming })));
  } else {
    out.push(h('p', { class: 'qj-note big' }, t(s.finished ? 'qj_storyDone' : 'qj_storyRest')));
  }
  if (s.skipped.length) {
    out.push(h('div', { class: 'qj-skipped' },
      h('b', {}, t('qj_skippedTitle')),
      ...s.skipped.map((id) => h('div', { class: 'qj-row' },
        h('span', {}, questName(p, id)),
        h('button', { class: 'qc-btn', onClick: () => { ui.tutorial.resume(id); ui.renderPanel(); } }, t('qj_resume'))))));
  }
  if (s.done.length) {
    out.push(h('div', { class: 'qj-done-chips' },
      h('span', { class: 'qj-done-label' }, t('qj_doneChapters')),
      ...s.done.map((id) => h('span', { class: 'qj-chip' }, `✅ ${questName(p, id)}`))));
  }
  return h('section', { class: 'qj-part qj-story' }, out);
}

/** 🎯 Mes quêtes (n/3). */
function mineSection(ui) {
  const p = ui.game.profile;
  const mine = joinedQuests(p);
  return h('section', { class: 'qj-part qj-mine' },
    h('h3', { class: 'qj-h' }, t('qj_mineTitle', { n: mine.length, max: MAX_JOINED })),
    mine.length ? mine.map((id) => questCard(ui, id, 'joined')) : h('p', { class: 'qj-note' }, t('qj_mineEmpty', { max: MAX_JOINED })));
}

/** 🗺️ Autres quêtes, par thème. */
function othersSection(ui) {
  const p = ui.game.profile;
  const themes = otherQuests(p);
  const full = joinedQuests(p).length >= MAX_JOINED;
  const out = [h('h3', { class: 'qj-h' }, t('qj_othersTitle'))];
  out.push(h('p', { class: `qj-note ${full ? 'warn' : ''}` }, full ? `✋ ${t('qj_full', { max: MAX_JOINED })}` : t('qj_othersHelp')));
  for (const th of themes) {
    const key = `theme:${th.id}`;
    out.push(toggle(ui, key, `${t(`qj_theme_${th.id}`)} (${th.quests.length})`));
    if (openParts.has(key)) out.push(h('div', { class: 'qj-list' }, th.quests.map((id) => questCard(ui, id, 'side'))));
  }
  return h('section', { class: 'qj-part qj-others' }, out);
}

/** ✅ Terminées, repliées. */
function doneSection(ui) {
  const p = ui.game.profile;
  const done = doneQuests(p);
  const out = [toggle(ui, 'done', t('qj_doneTitle', { n: done.length }))];
  if (openParts.has('done')) {
    out.push(done.length
      ? h('ul', { class: 'qj-donelist' }, done.map((id) => h('li', {}, `✅ ${questName(p, id)}`)))
      : h('p', { class: 'qj-note' }, t('qj_noneDone')));
  }
  return h('section', { class: 'qj-part qj-finished' }, out);
}

/** Tout l'onglet Quêtes du journal. */
export function questsTab(ui) {
  if (!ui.tutorial || !ui.game?.profile) return [];
  return [h('div', { class: 'quest-journal' }, storySection(ui), mineSection(ui), othersSection(ui), doneSection(ui))];
}

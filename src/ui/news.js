// 🐴 Quoi de neuf ? Les nouveautés du cheval, montrées une fois aux parties déjà commencées (une nouvelle partie les
// découvre avec l'histoire de son premier cheval) ; on les revoit toutes dans ❓ Aide. Chaque ligne dit où les trouver.
// La fenêtre ne montre que les dernières (fresh) : une courte liste, pas un mur de texte.

import { h } from './dom.js';
import { t } from '../i18n.js';

/** Change quand une nouvelle liste arrive : elle est montrée une fois de plus. */
export const NEWS_ID = 'cheval5';
export const NEWS = [
  { icon: '📖', key: 'story2', fresh: true },
  { icon: '🎃', key: 'halloween', fresh: true },
  { icon: '🐢', key: 'warmup', fresh: true },
  { icon: '📸', key: 'memories', fresh: true },
  { icon: '🔢', key: 'logsNum', fresh: true },
  { icon: '🩺', key: 'real', fresh: true },
  { icon: '🌾', key: 'ration' },
  { icon: '🪮', key: 'pansage' },
  { icon: '🪢', key: 'saddle' },
  { icon: '🦶', key: 'hooves' },
  { icon: '📒', key: 'health' },
  { icon: '☀️', key: 'day' },
  { icon: '🎯', key: 'challenge' },
  { icon: '🏅', key: 'galops' },
  { icon: '✨', key: 'coat' },
  { icon: '👂', key: 'ears' },
  { icon: '📣', key: 'call' },
  { icon: '⬆️', key: 'post' },
  { icon: '⤴️', key: 'jumps' },
  { icon: '🐎', key: 'life' },
];

/** La liste (pour l'aide : toutes ; pour la fenêtre : les dernières). */
export function newsList(onlyFresh = false) {
  return h('ul', { class: 'news-list' }, NEWS.filter((n) => !onlyFresh || n.fresh).map((n) => h('li', {},
    h('span', { class: 'news-icon', 'aria-hidden': 'true' }, n.icon),
    h('span', {}, h('b', {}, t(`news_${n.key}`)), ' ', t(`news_${n.key}_d`)))));
}

/** Au début de la partie : la fenêtre, une fois, si la partie avait déjà commencé (sinon c'est noté, sans rien montrer). */
export function maybeShowNews(ui) {
  const p = ui.game?.profile;
  if (!p || p.newsSeen === NEWS_ID) return false;
  const started = p.animals.length > 0 && p.tutorial?.done !== false;
  p.newsSeen = NEWS_ID;
  if (!started) return false;
  ui.showModal([
    h('h2', {}, `🐴 ${t('news_title')}`),
    h('p', { class: 'note' }, t('news_intro')),
    newsList(true),
    h('div', { class: 'row end' }, h('button', { class: 'primary', 'data-escape': true, onClick: () => ui.hideModal() }, t('news_ok'))),
  ]);
  return true;
}

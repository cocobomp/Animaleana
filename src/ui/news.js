// 🐴 Quoi de neuf ? Les nouveautés du cheval, montrées une fois aux parties déjà commencées (une nouvelle partie les
// découvre avec l'histoire de son premier cheval) ; on les revoit toutes dans ❓ Aide. Chaque ligne dit où les trouver.
// La fenêtre ne montre que celles venues depuis la dernière liste vue (since : le numéro de leur liste ; au plus les
// deux dernières listes) : une courte liste, pas un mur de texte. Avant, seulement les toutes dernières (fresh) : une
// partie restée à « cheval6 » ne voyait jamais celles de « cheval7 » (le filet, tout assorti…).

import { h } from './dom.js';
import { t } from '../i18n.js';

/** Change quand une nouvelle liste arrive : elle est montrée une fois de plus (ses nouveautés : since, son numéro). */
export const NEWS_ID = 'cheval8';
export const NEWS = [
  { icon: '💬', key: 'wish', since: 8 },
  { icon: '⭐', key: 'stars', since: 8 },
  { icon: '🍀', key: 'lucky', since: 8 },
  { icon: '🌬️', key: 'breath', since: 8 },
  { icon: '📸', key: 'photos', since: 8 },
  { icon: '🎃', key: 'halloween', since: 8 },
  { icon: '🃏', key: 'cards', since: 7 },
  { icon: '🔍', key: 'quirks', since: 7 },
  { icon: '🪢', key: 'bridle', since: 7 },
  { icon: '🎨', key: 'matchy', since: 7 },
  { icon: '🎂', key: 'anniv', since: 7 },
  { icon: '📖', key: 'story2' },
  { icon: '🐢', key: 'warmup' },
  { icon: '📸', key: 'memories' },
  { icon: '💞', key: 'bond' },
  { icon: '🔢', key: 'logsNum' },
  { icon: '🩺', key: 'real' },
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

/** Le numéro d'une liste (« cheval6 » → 6 ; jamais vue : 0). */
const listN = (id) => Number(/\d+$/.exec(String(id ?? ''))?.[0] ?? 0);

/** Les nouveautés venues après la liste vue seen (au plus celles des deux dernières listes). */
export const freshNews = (seen) => NEWS.filter((n) => (n.since ?? 0) > Math.max(listN(seen), listN(NEWS_ID) - 2));

/** La liste (pour l'aide : toutes ; pour la fenêtre : celles venues depuis la liste vue seen). */
export function newsList(onlyFresh = false, seen = null) {
  return h('ul', { class: 'news-list' }, (onlyFresh ? freshNews(seen) : NEWS).map((n) => h('li', {},
    h('span', { class: 'news-icon', 'aria-hidden': 'true' }, n.icon),
    h('span', {}, h('b', {}, t(`news_${n.key}`)), ' ', t(`news_${n.key}_d`)))));
}

/** Au début de la partie : la fenêtre, une fois, si la partie avait déjà commencé (sinon c'est noté, sans rien montrer). */
export function maybeShowNews(ui) {
  const p = ui.game?.profile;
  if (!p || p.newsSeen === NEWS_ID) return false;
  const started = p.animals.length > 0 && p.tutorial?.done !== false;
  const seen = p.newsSeen; // (la dernière liste vue : ce qui est venu depuis)
  p.newsSeen = NEWS_ID;
  if (!started) return false;
  ui.showModal([
    h('h2', {}, `🐴 ${t('news_title')}`),
    h('p', { class: 'note' }, t('news_intro')),
    newsList(true, seen),
    h('div', { class: 'row end' }, h('button', { class: 'primary', 'data-escape': true, onClick: () => ui.hideModal() }, t('news_ok'))),
  ]);
  return true;
}

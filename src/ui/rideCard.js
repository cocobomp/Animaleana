// 🏇 « Ta balade » : la petite carte qui monte en descendant de cheval (src/sim/rideLog.js rideReport). Le temps et la
// distance, la barre des allures (🐢 🐴 💨, comme les boutons), ce qui s'est passé, les tampons de la détente et du
// retour au calme, l'étoile qui approche, le record, ce qui manque à sa journée. Une seule à la fois ; elle se ferme
// d'un toucher, ou toute seule après 8 s (CSS : cachée en selle, sous une fenêtre, pendant une activité).

import { h } from './dom.js';
import { t, getLang } from '../i18n.js';
import { fmtDist } from '../sim/rideLog.js';

const SHOW_MS = 8000;
const GAITS = [['walk', '🐢'], ['trot', '🐴'], ['canter', '💨']];
const ICON_MIN = 0.12; // (une part plus petite : la couleur seule, l'icône n'y tient pas)
let card = null; // (la carte affichée : { el, timer })

/** Ferme la carte affichée (d'un toucher, après 8 s, ou quand une autre arrive). */
export function closeRideCard() {
  if (!card) return;
  const { el, timer } = card;
  card = null;
  clearTimeout(timer);
  el.classList.add('out');
  setTimeout(() => el.remove(), 300);
}

/** Montre la carte d'une balade (rep : rideReport) avec le cheval a. Renvoie l'élément, ou null. */
export function showRideCard(ui, rep, a) {
  if (!rep?.show || !ui?.root) return null;
  closeRideCard();
  const p = { name: a.name, g: a.sex };
  const line = (text, cls = '') => h('div', { class: `rc-line ${cls}`.trim() }, text);
  const segs = GAITS.map(([k, icon]) => h('span', { class: `rc-${k}` }, rep.share[k] >= ICON_MIN ? icon : null));
  const st = rep.stamps;
  const stamps = [
    st.warm ? h('span', { class: 'rc-stamp' }, t('rc_warm')) : null,
    st.cool === 'cooled' ? h('span', { class: 'rc-stamp' }, t('rc_cool')) : null,
    st.pro ? h('span', { class: 'rc-stamp gold' }, t('rc_pro')) : null,
  ].filter(Boolean);
  const s = rep.star;
  const fill = s ? h('span', { class: 'rc-star-fill' }) : null;
  const el = h('div', { class: 'ride-card', role: 'status', 'aria-live': 'polite', onClick: closeRideCard },
    h('b', { class: 'rc-title' }, t('rc_title', p)),
    h('div', { class: 'rc-time' }, t('rc_time', { min: rep.min, dist: fmtDist(rep.dist, getLang()) })),
    h('div', { class: 'rc-bar', 'aria-hidden': 'true' }, segs),
    rep.lines.map((l) => line(t(l.key, { n: l.n }))),
    stamps.length ? h('div', { class: 'rc-stamps' }, stamps) : null,
    st.cool === 'hot' ? line(t('rc_hot'), 'hot') : null,
    s ? line(t(s.next === 1 ? 'rc_star_first' : 'rc_star', { icon: s.icon, n: s.toNext, k: s.next })) : null,
    s ? h('div', { class: 'rc-star', 'aria-hidden': 'true' }, fill) : null,
    rep.best ? line(t('rc_best')) : null,
    rep.perfect ? line(t('rc_perfect')) : rep.left ? line(t('rc_left', { icons: rep.left.join(' ') })) : null,
    rep.unsaddle ? line(t('rc_unsaddle', p)) : null);
  ui.root.append(el);
  // (les barres partent de zéro et se remplissent : la transition CSS, après une mise en page)
  el.getBoundingClientRect();
  GAITS.forEach(([k], i) => { segs[i].style.width = `${Math.round(rep.share[k] * 100)}%`; });
  if (fill) fill.style.width = `${Math.round(s.fill * 100)}%`;
  card = { el, timer: setTimeout(closeRideCard, SHOW_MS) };
  return el;
}

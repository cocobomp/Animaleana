// 🏇 « Ta balade » : la petite carte qui monte en descendant de cheval (src/sim/rideLog.js rideReport). Le temps et la
// distance, la barre des allures (🐢 🐴 💨, comme les boutons), ce qui s'est passé, les tampons de la détente et du
// retour au calme, l'étoile qui approche, le record, ce qui manque à sa journée. Une seule à la fois ; elle se ferme
// d'un toucher, ou toute seule après 12 s vue à l'écran (CSS : cachée sous une fenêtre ; ce temps-là ne compte pas, ni
// sous un mini-jeu : l'enfant la retrouve en entier). On remonte en selle ou une activité commence : elle s'en va
// (src/game/Game.js mountRider, src/game/Activities.js start), sinon elle reviendrait après, d'une autre balade.

import { h } from './dom.js';
import { t, getLang } from '../i18n.js';
import { fmtDist } from '../sim/rideLog.js';

const SHOW_MS = 12000; // (vue à l'écran : jusqu'à douze lignes à lire)
const TICK_MS = 250;
const GAITS = [['walk', '🐢'], ['trot', '🐴'], ['canter', '💨']];
const ICON_MIN = 0.12; // (une part plus petite : la couleur seule, l'icône n'y tient pas)
let card = null; // (la carte affichée : { el, timer })

/** Se voit-elle ? Pas cachée par le CSS (display: none : getClientRects vide), ni sous un mini-jeu, ni l'onglet caché. */
const seen = (el) => !document.hidden && el.getClientRects().length > 0 && !document.querySelector('.mg-overlay');

/** Une carte est-elle là (même cachée sous une fenêtre) ? Les petits mots du guide attendent (src/ui/tutorial.js tick). */
export const rideCardShown = () => !!card;

/** Ferme la carte affichée (d'un toucher, après 12 s vue, quand une autre arrive, en selle, au début d'une activité). */
export function closeRideCard() {
  if (!card) return;
  const { el, timer } = card;
  card = null;
  clearInterval(timer);
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
    // (classes : en paysage, le CSS passe 🧰 avant l'étoile et cache la journée parfaite, pour tenir au-dessus du bouton vert)
    s ? line(t(s.next === 1 ? 'rc_star_first' : 'rc_star', { icon: s.icon, n: s.toNext, k: s.next }), 'rc-later') : null,
    s ? h('div', { class: 'rc-star rc-later', 'aria-hidden': 'true' }, fill) : null,
    rep.best ? line(t('rc_best'), 'rc-later') : null,
    rep.perfect ? line(t('rc_perfect'), 'rc-day') : rep.left ? line(t('rc_left', { icons: rep.left.join(' ') }), 'rc-day') : null,
    rep.unsaddle ? line(t('rc_unsaddle', p), 'rc-untack') : null);
  ui.root.append(el);
  // (les barres partent de zéro et se remplissent : la transition CSS, après une mise en page)
  el.getBoundingClientRect();
  GAITS.forEach(([k], i) => { segs[i].style.width = `${Math.round(rep.share[k] * 100)}%`; });
  if (fill) fill.style.width = `${Math.round(s.fill * 100)}%`;
  // (le temps ne compte que quand elle se voit)
  let left = SHOW_MS;
  card = { el, timer: setInterval(() => {
    if (seen(el)) left -= TICK_MS;
    if (left <= 0) closeRideCard();
  }, TICK_MS) };
  return el;
}

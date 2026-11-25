// 🐷 La tirelire à l'écran (logique : src/sim/piggyBank.js).
// - Le compteur de pièces du HUD montre l'objectif choisi : « 🪙 120/240 🚧 », rempli comme une jauge ; on le touche
//   pour ouvrir les petits boulots (où l'on voit l'objectif, la série et ce que rapporte chaque boulot). Au téléphone :
//   « 🪙 120 🚧 » (le prix reste dans la carte de la tirelire et dans l'info-bulle).
// - Quand on gagne des pièces (n'importe où : boulot, client, concours…), elles volent jusqu'au compteur et un
//   « +25 » s'envole : un petit moment fêté (seulement « +25 » si l'appareil demande moins d'animations). Gagnées
//   pendant que le compteur est caché (concours, spectacle, mini-jeu, fenêtre), elles attendent qu'il revienne et
//   partent du bouton touché (« Continuer »).
// - 🎉 celebrate : un mot de fête (« Bravo ! », « 🔥 3 jours de suite ! », « Journée complète ! », « Défi réussi ! »,
//   « Tu as assez ! ») part de l'endroit touché et accompagne les pièces jusqu'au compteur ; un seul mot à la fois.
//   Moins d'animations : le mot seul, sur place. Bac à sable : le mot, sans pièces.
// - Le bouton « 🎯 Mon objectif » des boutiques (sellerie, outils, animalerie) et la carte de la tirelire.

import { h } from './dom.js';
import { t, L } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { PLACES } from '../sim/places.js';
import { goalStatus, goalJustReady, setGoal, clearGoal, sameGoal, goalPrice, goalPlace } from '../sim/piggyBank.js';
import { audio } from '../game/audio.js';
import { nbsp } from './minigames/frame.js'; // typographie française (espace insécable avant « ! ? : »)

/** Le nom de l'objectif (« Selle d'obstacle », « Brosse », « Poney Shetland »). */
export function goalLabel(goal) {
  if (goal?.kind === 'gear') return t(`gear_${goal.id}`);
  if (goal?.kind === 'tool') return t(`tool_${goal.id}`);
  if (goal?.kind === 'animal') {
    const b = SPECIES[goal.species]?.breeds.find((x) => x.id === goal.breed);
    return b ? L(b.name) : '';
  }
  return '';
}

/** Où acheter l'animal de l'objectif, écrit comme dans le menu des voyages (« 🇯🇵 Campagne de Kyoto ») ; ou null. */
export function goalPlaceLabel(profile) {
  const id = goalPlace(profile);
  return id ? `${PLACES[id].flag} ${L(PLACES[id].name)}` : null;
}

// ---------------------------------------------------------------- compteur du HUD

/**
 * Ce que le compteur avait vu (seen : { p, money }) et ce qu'il voit maintenant → { seen (à garder), gain (pièces qui
 * volent maintenant) }. Une autre partie, ou la même rouverte (synchro, restauration : un nouvel objet profil), repart
 * de son argent, sans volée. Compteur caché (visible faux) : un gain attend qu'il revienne (on garde ce qu'on avait
 * vu) ; une dépense est notée tout de suite. Bac à sable (money null) : jamais de pièces.
 */
export function coinStep(seen, p, money, visible) {
  if (typeof money !== 'number' || seen?.p !== p || typeof seen.money !== 'number') return { seen: { p, money: money ?? null }, gain: 0 };
  if (money > seen.money && !visible) return { seen, gain: 0 };
  return { seen: { p, money }, gain: Math.max(0, money - seen.money) };
}

/** Le compteur est-il vraiment à l'écran ? (pas caché par un concours ou une vue, ni sous un mini-jeu ou une fenêtre) */
function coinVisible(ui) {
  return !!ui.hudCoin?.offsetParent && !ui.minigameOpen && !ui.isBlocking?.();
}

/** Une partie qui s'ouvre (UI.onStart) : rien n'a encore été vu ni gagné. */
export function resetCoins(ui) {
  ui.coinSeen = null;
  note = null;
}

/** Met à jour le compteur de pièces (et sa tirelire), fête les pièces gagnées et l'objectif atteint. */
export function updateCoinChip(ui, s) {
  const el = ui.hudCoin;
  const p = ui.game.profile;
  watchTaps(); // (dès le début : le premier gain part déjà du doigt)
  const money = s.money === null ? t('infinite') : s.money;
  const st = s.money === null ? null : goalStatus(p);
  // (assez : « 🪙 260 🚧✓ » ; sinon « 🪙 120/240 🚧 », et au téléphone « 🪙 120 🚧 » : .coin-of caché, style.css)
  const text = !st ? `🪙 ${money}` : st.ready ? `🪙 ${money} ${st.emoji}✓` : `🪙 ${money}/${st.price} ${st.emoji}`;
  if (el.textContent !== text) {
    el.replaceChildren(`🪙 ${money}`, st && !st.ready ? h('span', { class: 'coin-of' }, `/${st.price}`) : '',
      st ? ` ${st.emoji}${st.ready ? '✓' : ''}` : '');
  }
  el.classList.toggle('goal', !!st);
  el.classList.toggle('ready', !!st?.ready);
  const pct = st ? `${Math.round(st.pct * 100)}%` : '';
  if (el.style.getPropertyValue('--pct') !== pct) el.style.setProperty('--pct', pct);
  const tip = st ? t(st.ready ? 'goal_tipReady' : 'goal_tip', { name: goalLabel(st.goal), n: st.missing }) : t('goal_tipNone');
  if (el.title !== tip) el.title = tip;
  // Des pièces en plus depuis la dernière fois (même partie) : elles volent jusqu'au compteur, ou attendent qu'il revienne.
  const visible = coinVisible(ui);
  const step = coinStep(ui.coinSeen, p, s.money, visible);
  ui.coinSeen = step.seen;
  if (st && goalJustReady(p)) {
    audio.ui('levelUp');
    const place = goalPlaceLabel(p); // (un animal vendu seulement à l'élevage d'un voyage : on dit où)
    ui.toast(place ? t('goal_readyAway', { name: goalLabel(st.goal), place }) : t('goal_ready', { name: goalLabel(st.goal) }), 7000);
    coinNote(t('cel_goalReady'), { big: true }); // 🎉 « Tu as assez ! », avec les pièces qui ont rempli la tirelire
  }
  if (!visible) { // (le mot attend avec les pièces)
    if (note) note.at = now();
    return;
  }
  const n = takeNote();
  if (step.gain > 0) coinBurst(ui, step.gain, n ?? {});
  else if (n) coinWord(n); // (bac à sable, achat : le mot seul)
}

// ---------------------------------------------------------------- 🎉 mots de fête

/** Un mot retenu pour la prochaine volée vaut 3 s (ou tant que le compteur est caché). */
export const NOTE_MS = 3000;
const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
let note = null; // { word, big, from, at } : le mot de la prochaine volée (un seul)

/**
 * Le mot à garder quand un autre arrive (un seul à la fois) : le nouveau, sauf si celui qui attend est un grand moment
 * (big) et pas le nouveau. Un mot trop vieux (NOTE_MS) ne compte plus.
 */
export function pickNote(cur, next, at = now()) {
  const alive = cur && at - cur.at < NOTE_MS ? cur : null;
  if (!next?.word) return alive;
  if (alive?.big && !next.big) return alive;
  return next;
}

/**
 * 🎉 Retient le mot de fête de la prochaine volée de pièces : word (« Bravo ! »), big (un grand moment : plus gros,
 * avec des éclats), from (un élément, ou { x, y }, d'où il part ; sinon l'endroit touché, sinon le milieu de l'écran).
 * La volée le prend au prochain rafraîchissement du compteur (updateCoinChip) ; sans pièces, le mot part seul.
 */
export function coinNote(word, { big = false, from = null } = {}) {
  note = pickNote(note, { word, big: !!big, from, at: now() });
}

function takeNote() {
  const n = pickNote(note, null);
  note = null;
  return n;
}

/**
 * 🎉 L'API des moments fêtés (UI.celebrate) : { word, big, from }. À appeler juste après avoir gagné les pièces (earn) :
 * le mot part de l'endroit touché et les accompagne jusqu'au compteur, qui saute. Pas de pièces (bac à sable, achat,
 * rien gagné) : le mot seul. Compteur caché (mini-jeu, concours, fenêtre) : mot et pièces attendent qu'il revienne
 * (ils partent alors de « Continuer »). Les pièces sont celles que le compteur voit arriver : jamais comptées deux fois.
 */
export function celebrate(ui, { word = '', big = false, from = null } = {}) {
  coinNote(word, { big, from });
  ui.refresh?.();
}

// ---------------------------------------------------------------- pièces qui volent

let lastTap = null;
let tapWatch = false;
function watchTaps() {
  if (tapWatch || typeof window === 'undefined') return;
  tapWatch = true;
  window.addEventListener('pointerdown', (e) => { lastTap = { x: e.clientX, y: e.clientY, at: performance.now() }; }, { capture: true, passive: true });
}

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const canAnimate = () => typeof Element !== 'undefined' && !!Element.prototype.animate && !reduced();
const clamp = (v, lo, hi) => (lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v)));

/** Combien de pièces dessiner pour un gain de n (3 à 8). */
export const burstCount = (n) => Math.max(3, Math.min(8, 3 + Math.floor(n / 25)));

/** D'où partent le mot et les pièces : from (élément encore à l'écran, ou { x, y }), sinon le doigt (2,5 s), sinon le milieu. */
function startPoint(from) {
  if (typeof from?.getBoundingClientRect === 'function') {
    const r = from.isConnected ? from.getBoundingClientRect() : null;
    if (r && (r.width || r.height)) return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  } else if (Number.isFinite(from?.x) && Number.isFinite(from?.y)) return { x: from.x, y: from.y };
  if (lastTap && performance.now() - lastTap.at < 2500) return { x: lastTap.x, y: lastTap.y };
  return { x: innerWidth / 2, y: innerHeight * 0.45 };
}

let wordEl = null; // le mot à l'écran (un seul à la fois : le suivant le remplace)
/** Un grand moment à l'écran garde sa place si peu de temps : un petit mot qui arrive juste après ne le chasse pas. */
export const BIG_HOLD_MS = 1400;

/**
 * Le mot de fête à l'écran, centré sur at sans déborder (il passe à la ligne sur un petit écran) ; to : le compteur,
 * où il s'envole avec les pièces (sinon il reste sur place et s'efface). Moins d'animations : sur place, en fondu.
 */
function showWord({ word, big }, at, to = null) {
  if (!big && wordEl?.isConnected && wordEl.bigAt !== undefined && now() - wordEl.bigAt < BIG_HOLD_MS) return;
  wordEl?.remove();
  // (aria-hidden : les messages, eux, sont lus par les lecteurs d'écran)
  const el = h('span', { class: `coin-word ${big ? 'big' : ''}`, 'aria-hidden': 'true' }, nbsp(word));
  if (big) el.bigAt = now();
  wordEl = el;
  document.body.append(el);
  const x = clamp(at.x, el.offsetWidth / 2 + 8, innerWidth - el.offsetWidth / 2 - 8);
  const y = clamp(at.y, el.offsetHeight / 2 + 8, innerHeight - el.offsetHeight / 2 - 8);
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  const done = () => { el.remove(); if (wordEl === el) wordEl = null; };
  setTimeout(done, 4000); // (au cas où l'animation ne finit pas : onglet caché…)
  if (!canAnimate()) {
    el.classList.add('still');
    el.addEventListener('animationend', done);
    return;
  }
  const c = 'translate(-50%, -50%)';
  const end = to ? `translate(calc(-50% + ${to.x - x}px), calc(-50% + ${to.y - y}px)) scale(0.35)` : 'translate(-50%, calc(-50% - 18px))';
  const a = el.animate([
    { transform: `${c} scale(0.5)`, opacity: 0 },
    { transform: `${c} scale(1.12)`, opacity: 1, offset: 0.14 },
    { transform: `${c} scale(1)`, opacity: 1, offset: 0.26 },
    { transform: `${c} scale(1)`, opacity: 1, offset: to ? 0.42 : 0.72 },
    { transform: end, opacity: to ? 0.2 : 0 },
  ], { duration: big ? 1700 : 1350, easing: 'ease-in-out', fill: 'forwards' });
  a.onfinish = done;
  a.oncancel = done;
  if (big) sparks(x, y);
}

/** ✨ Un grand moment : des éclats autour du mot. */
function sparks(x, y) {
  const glyphs = ['⭐', '✨', '🎉', '✨', '⭐', '🎉'];
  glyphs.forEach((g, i) => {
    const el = h('span', { class: 'coin-spark', 'aria-hidden': 'true', style: { left: `${x - 10}px`, top: `${y - 10}px` } }, g);
    document.body.append(el);
    const ang = (i / glyphs.length) * Math.PI * 2 + 0.4;
    const d = 70 + (i % 2) * 22;
    const a = el.animate([
      { transform: 'translate(0, 0) scale(0.4)', opacity: 0 },
      { transform: `translate(${Math.cos(ang) * d * 0.6}px, ${Math.sin(ang) * d * 0.45}px) scale(1.1)`, opacity: 1, offset: 0.35 },
      { transform: `translate(${Math.cos(ang) * d}px, ${Math.sin(ang) * d * 0.75}px) scale(0.8)`, opacity: 0 },
    ], { duration: 900, delay: 80 + i * 30, easing: 'ease-out', fill: 'both' });
    a.onfinish = () => el.remove();
    a.oncancel = () => el.remove();
  });
}

/** Le mot seul (sans pièces : bac à sable, achat), là où l'on vient de toucher. */
function coinWord(n) {
  if (typeof document === 'undefined') return;
  showWord(n, startPoint(n.from));
}

/**
 * 🪙 Des pièces partent de l'endroit touché (ou du milieu de l'écran) et volent jusqu'au compteur, qui saute ; un
 * « +n » s'envole sous le compteur. Avec un mot (opts { word, big, from } : voir celebrate), le mot apparaît d'abord
 * là d'où partent les pièces, puis vole avec elles. Moins d'animations : le mot sur place et le « +n », sans pièces.
 * Rien si le compteur est caché (updateCoinChip garde alors le gain pour plus tard).
 */
export function coinBurst(ui, n, { word = '', big = false, from = null } = {}) {
  watchTaps();
  const target = ui.hudCoin;
  const r = target?.getBoundingClientRect();
  if (!r || !r.width || !target.offsetParent) return;
  const tx = r.left + Math.min(18, r.width / 2);
  const ty = r.top + r.height / 2;
  const at = startPoint(from);
  const anim = canAnimate();
  const lead = word && anim ? 380 : 0; // (le mot d'abord, puis les pièces s'envolent avec lui)
  const plus = h('span', { class: 'coin-plus', 'aria-hidden': 'true', style: { top: `${r.bottom + 2}px`, animationDelay: `${lead}ms` } }, `+${n} 🪙`);
  document.body.append(plus);
  plus.style.left = `${clamp(r.left, 6, innerWidth - plus.offsetWidth - 6)}px`; // (jamais hors de l'écran à droite)
  plus.addEventListener('animationend', () => plus.remove());
  setTimeout(() => plus.remove(), 5000); // (au cas où l'animation ne finit pas : onglet caché…)
  const bump = () => { target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump'); };
  if (word) showWord({ word, big }, at, anim ? { x: tx, y: ty } : null);
  if (!anim) return bump();
  const sx = at.x;
  const sy = at.y;
  const count = burstCount(n);
  for (let i = 0; i < count; i++) {
    const c = h('span', { class: 'coin-fly', 'aria-hidden': 'true', style: { left: `${sx - 12}px`, top: `${sy - 12}px` } }, '🪙');
    document.body.append(c);
    const ang = (i / count) * Math.PI * 2;
    const ox = Math.cos(ang) * (24 + (i % 3) * 10);
    const oy = Math.sin(ang) * (18 + (i % 2) * 10) - 20;
    const a = c.animate([
      { transform: 'translate(0, 0) scale(0.6)', opacity: 0 },
      { transform: `translate(${ox}px, ${oy}px) scale(1.15)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${tx - sx}px, ${ty - sy}px) scale(0.55)`, opacity: 0.9 },
    ], { duration: 700 + i * 45, delay: lead + i * 55, easing: 'cubic-bezier(0.45, 0, 0.6, 1)', fill: 'both' });
    a.onfinish = () => { c.remove(); if (i === 0) bump(); };
    a.oncancel = () => c.remove();
  }
}

// ---------------------------------------------------------------- 🎯 boutons et carte

/** « 🎯 Mon objectif » (ou « 🎯 C'est mon objectif ✓ ») pour cette chose à acheter. Rien en bac à sable. */
export function goalButton(ui, goal, { cls = '' } = {}) {
  const p = ui.game.profile;
  if (p.mode === 'sandbox' || goalPrice(goal) === null) return null;
  const mine = sameGoal(p.goal, goal);
  return h('button', {
    class: `small goal-btn ${mine ? 'on' : ''} ${cls}`,
    'aria-pressed': mine ? 'true' : 'false',
    onClick: () => {
      if (mine) clearGoal(p);
      else if (setGoal(p, goal)) {
        audio.ui('ok');
        const st = goalStatus(p);
        ui.toast(t('goal_set', { name: goalLabel(goal), n: st.missing }), 5000);
      }
      ui.game.save?.();
      ui.refresh();
      ui.renderPanel?.();
    },
  }, mine ? `🎯 ${t('goal_mine')} ✓` : `🎯 ${t('goal_pick')}`);
}

/** La carte de la tirelire (petits boulots) : l'objectif, la jauge, ce qu'il manque ; ou l'invitation à en choisir un. */
export function goalCard(ui) {
  const p = ui.game.profile;
  if (p.mode === 'sandbox') return null;
  const st = goalStatus(p);
  const shop = h('button', { class: 'small', onClick: () => { ui.closePanel(); ui.openTack(); } }, `🏇 ${t(st ? 'goal_change' : 'goal_choose')}`);
  if (!st) {
    return h('div', { class: 'piggy-card none' },
      h('span', { class: 'piggy-icon' }, '🐷'),
      h('span', { class: 'piggy-main' }, h('b', {}, t('goal_noneTitle')), h('small', {}, t('goal_noneHelp'))),
      shop);
  }
  const place = goalPlaceLabel(p); // (un animal vendu seulement à l'élevage d'un voyage : « à l'élevage : 🇯🇵 … »)
  return h('div', { class: `piggy-card ${st.ready ? 'ready' : ''}` },
    h('span', { class: 'piggy-icon' }, st.emoji),
    h('span', { class: 'piggy-main' },
      h('b', {}, `🎯 ${goalLabel(st.goal)}`),
      h('span', { class: 'piggy-track' }, h('span', { class: 'piggy-fill', style: { width: `${Math.round(st.pct * 100)}%` } })),
      h('small', {}, st.ready ? t('goal_enough') : t('goal_missing', { n: st.missing, have: st.have, price: st.price })),
      place ? h('small', { class: 'piggy-where' }, t('goal_where', { place })) : null),
    st.ready && st.goal.kind === 'gear'
      ? h('button', { class: 'small primary', onClick: () => { ui.closePanel(); ui.openTackItem(st.goal.id); } }, `🛒 ${t('goal_go')}`)
      : st.ready && st.goal.kind === 'tool'
        ? h('button', { class: 'small primary', onClick: () => { ui.closePanel(); ui.openTack({ tab: 'tools' }); } }, `🛒 ${t('goal_go')}`)
        : st.ready ? null : shop); // (un animal : on l'achète à l'animalerie ; pas encore assez : changer d'objectif)
}

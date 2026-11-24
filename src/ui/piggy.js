// 🐷 La tirelire à l'écran (logique : src/sim/piggyBank.js).
// - Le compteur de pièces du HUD montre l'objectif choisi : « 🪙 120/240 🚧 », rempli comme une jauge ; on le touche
//   pour ouvrir les petits boulots (où l'on voit l'objectif, la série et ce que rapporte chaque boulot).
// - Quand on gagne des pièces (n'importe où : boulot, client, concours…), elles volent jusqu'au compteur et un
//   « +25 » s'envole : un petit moment fêté (seulement « +25 » si l'appareil demande moins d'animations).
// - Le bouton « 🎯 Mon objectif » des boutiques (sellerie, outils, animalerie) et la carte de la tirelire.

import { h } from './dom.js';
import { t, L } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { goalStatus, goalJustReady, setGoal, clearGoal, sameGoal, goalPrice } from '../sim/piggyBank.js';
import { audio } from '../game/audio.js';

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

// ---------------------------------------------------------------- compteur du HUD

/** Met à jour le compteur de pièces (et sa tirelire), fête les pièces gagnées et l'objectif atteint. */
export function updateCoinChip(ui, s) {
  const el = ui.hudCoin;
  const p = ui.game.profile;
  watchTaps(); // (dès le début : le premier gain part déjà du doigt)
  const money = s.money === null ? t('infinite') : s.money;
  const st = s.money === null ? null : goalStatus(p);
  // (assez : « 🪙 260 🚧✓ » ; sinon « 🪙 120/240 🚧 »)
  const text = !st ? `🪙 ${money}` : st.ready ? `🪙 ${money} ${st.emoji}✓` : `🪙 ${money}/${st.price} ${st.emoji}`;
  if (el.textContent !== text) el.textContent = text;
  el.classList.toggle('goal', !!st);
  el.classList.toggle('ready', !!st?.ready);
  const pct = st ? `${Math.round(st.pct * 100)}%` : '';
  if (el.style.getPropertyValue('--pct') !== pct) el.style.setProperty('--pct', pct);
  const tip = st ? t(st.ready ? 'goal_tipReady' : 'goal_tip', { name: goalLabel(st.goal), n: st.missing }) : t('goal_tipNone');
  if (el.title !== tip) el.title = tip;
  // Des pièces en plus depuis la dernière fois (même partie) : elles volent jusqu'au compteur.
  const seen = ui.coinSeen;
  if (s.money !== null && seen?.id === p.id && seen.money !== null && s.money > seen.money) coinBurst(ui, s.money - seen.money);
  ui.coinSeen = { id: p.id, money: s.money };
  if (st && goalJustReady(p)) {
    audio.ui('levelUp');
    ui.toast(t('goal_ready', { name: goalLabel(st.goal) }), 7000);
  }
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

/** Combien de pièces dessiner pour un gain de n (3 à 8). */
export const burstCount = (n) => Math.max(3, Math.min(8, 3 + Math.floor(n / 25)));

/**
 * 🪙 Des pièces partent de l'endroit touché (ou du milieu de l'écran) et volent jusqu'au compteur, qui saute ; un
 * « +n » s'envole sous le compteur. Rien si le compteur est caché (mini-jeu, vue construction).
 */
export function coinBurst(ui, n) {
  watchTaps();
  const target = ui.hudCoin;
  const r = target?.getBoundingClientRect();
  if (!r || !r.width || !target.offsetParent) return;
  const tx = r.left + Math.min(18, r.width / 2);
  const ty = r.top + r.height / 2;
  const plus = h('span', { class: 'coin-plus', 'aria-hidden': 'true', style: { left: `${r.left}px`, top: `${r.bottom + 2}px` } }, `+${n} 🪙`);
  document.body.append(plus);
  plus.addEventListener('animationend', () => plus.remove());
  setTimeout(() => plus.remove(), 5000); // (au cas où l'animation ne finit pas : onglet caché…)
  const bump = () => { target.classList.remove('bump'); void target.offsetWidth; target.classList.add('bump'); };
  if (reduced() || typeof Element === 'undefined' || !Element.prototype.animate) return bump();
  const recent = lastTap && performance.now() - lastTap.at < 2500;
  const sx = recent ? lastTap.x : innerWidth / 2;
  const sy = recent ? lastTap.y : innerHeight * 0.45;
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
    ], { duration: 700 + i * 45, delay: i * 55, easing: 'cubic-bezier(0.45, 0, 0.6, 1)', fill: 'forwards' });
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
  return h('div', { class: `piggy-card ${st.ready ? 'ready' : ''}` },
    h('span', { class: 'piggy-icon' }, st.emoji),
    h('span', { class: 'piggy-main' },
      h('b', {}, `🎯 ${goalLabel(st.goal)}`),
      h('span', { class: 'piggy-track' }, h('span', { class: 'piggy-fill', style: { width: `${Math.round(st.pct * 100)}%` } })),
      h('small', {}, st.ready ? t('goal_enough') : t('goal_missing', { n: st.missing, have: st.have, price: st.price }))),
    st.ready && st.goal.kind === 'gear'
      ? h('button', { class: 'small primary', onClick: () => { ui.closePanel(); ui.openTackItem(st.goal.id); } }, `🛒 ${t('goal_go')}`)
      : st.ready && st.goal.kind === 'tool'
        ? h('button', { class: 'small primary', onClick: () => { ui.closePanel(); ui.openTack({ tab: 'tools' }); } }, `🛒 ${t('goal_go')}`)
        : st.ready ? null : shop); // (un animal : on l'achète à l'animalerie ; pas encore assez : changer d'objectif)
}

// Interface du salon de toilettage (métier Toiletteur ✂️) : les clients qui attendent (bulles de
// dialogue, fiche de l'animal, étapes demandées, prix, Accepter / Refuser), la séance de toilettage
// (chaque étape est un mini-jeu), la boutique d'accessoires pour ses propres animaux, la carte
// « avant / après » avec les étoiles, le carnet du métier et les petites fiches « Montre-moi ».

import { h, hexColor } from './dom.js';
import { t } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { animalCard } from './panels.js';
import { runMinigame, registerMinigames } from './minigames.js';
import { GROOMER_GAMES, GROOMER_ICONS, setFinishOptions, setCutStyle, drawAccessoryOn } from './minigames/groomer.js';
import { drawAnimal, fitAnimal, animalShape, circle, emoji as drawEmoji, shade, css } from './minigames/draw.js';
import {
  STEPS, STEP_IDS, STYLES, REQUESTS, ACCESSORIES, ACC_COLORS, ACC_SLOTS, RANKS, GROOMER_LEVEL, CUT_DAYS,
  ensureGroomer, rankOf, rankProgress, careerXp, canGroom, waitingClients, stepAllowed, stylesFor, accessoryAllowed,
  recordStep, completeService, applyCut, wearAccessory, removeAccessory, recordOwnGrooming, speciesAllowed,
  salonAt, cutFresh, stepsDone,
} from '../sim/groomer.js';
import { applyCare } from '../sim/animal.js';
import { addStat, isSandbox } from '../sim/profile.js';
import { dayOf } from '../sim/time.js';
import { doorOf } from '../sim/construction.js';

registerMinigames(GROOMER_GAMES, GROOMER_ICONS);

const stepName = (id) => `${STEPS[id].emoji} ${t(`grm_step_${id}`)}`;
const styleName = (id) => `${STYLES[id].emoji} ${t(`grm_style_${id}`)}`;
const coins = (ui, n) => (isSandbox(ui.game.profile) ? '' : ` · ${n} 🪙`);
const ownerEmoji = (o) => (o.sex === 'f' ? '👩' : '👨');

// ---------------------------------------------------------------- le salon

export function openSalon(ui) {
  const g = ui.game;
  g.emit('building', 'salon');
  ui.openPanel({
    title: `✂️ ${t('grm_title')}`,
    kind: 'salon',
    render: () => renderSalon(ui),
  });
}

function rankHeader(ui) {
  const p = ui.game.profile;
  const st = ensureGroomer(p);
  const pr = rankProgress(p);
  return h('div', { class: 'grm-head' },
    h('div', { class: 'grm-rank' },
      h('span', { class: 'chip grm-rank-chip' }, `🎓 ${t(`grm_rank_${RANKS[pr.rank].id}`, { g: p.avatar?.female ? 'f' : 'm' })}`),
      h('span', { class: 'chip' }, `⭐ ${t('grm_reputation')} ${Math.round(st.reputation)}`),
      h('button', { class: 'small', onClick: () => openCarnet(ui) }, `📒 ${t('grm_carnet')}`)),
    h('div', { class: 'grm-xp' },
      h('span', { class: 'xp-track' }, h('span', { class: 'xp-fill', style: { width: `${Math.round(pr.share * 100)}%` } })),
      h('small', {}, pr.next ? t('grm_xpNext', { xp: pr.xp, next: pr.next, rank: t(`grm_rank_${RANKS[pr.rank + 1].id}`) }) : t('grm_xpMax', { xp: pr.xp }))));
}

function renderSalon(ui) {
  const g = ui.game;
  const p = g.profile;
  const gr = g.groomer;
  if (!canGroom(p)) {
    return [h('p', { class: 'note' }, `🔒 ${t('grm_locked', { n: GROOMER_LEVEL })}`)];
  }
  const out = [rankHeader(ui)];
  if (gr.session) {
    out.push(...renderSession(ui, gr.session));
    return out;
  }
  // Clients qui attendent
  const waiting = waitingClients(p).filter((c) => gr.isHere(c));
  out.push(h('h3', {}, `🔔 ${t('grm_clients')} (${waiting.length}/2)`));
  if (!waiting.length) out.push(h('p', { class: 'note' }, t('grm_noClient')));
  for (const c of waiting) out.push(clientCard(ui, c));
  // Mes animaux
  const mine = g.animalsHere().filter((a) => !a.guest);
  out.push(h('h3', {}, `🐾 ${t('grm_myAnimals')}`));
  if (!mine.length) out.push(h('p', { class: 'note' }, t('grm_noAnimal')));
  out.push(h('div', { class: 'cards' }, mine.map((a) => h('div', { class: 'card' },
    h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
    h('span', { class: 'card-main' }, h('b', {}, a.name), h('small', {}, groomStatus(a, g.day))),
    h('button', { class: 'primary', onClick: () => { gr.startOwn(a); ui.renderPanel(); } }, `✂️ ${t('grm_groom')}`)))));
  out.push(h('p', { class: 'note' }, t('grm_ownFree')));
  return out;
}

/** « Coupe courte toute fraîche · 🎀 » ou « Pas de coupe ». */
function groomStatus(a, day) {
  const parts = [];
  if (cutFresh(a, day)) parts.push(t('grm_freshCut', { style: t(`grm_style_${a.grooming.style}`), n: CUT_DAYS - (day - a.grooming.day) }));
  const acc = Object.values(a.accessories ?? {}).map((w) => ACCESSORIES[w.id]?.emoji).filter(Boolean).join(' ');
  if (acc) parts.push(acc);
  return parts.join(' · ') || t('grm_noCut');
}

/** Un client : sa bulle, son animal, ce qu'il demande, le prix, Accepter / Refuser. */
function clientCard(ui, c) {
  const g = ui.game;
  const gr = g.groomer;
  const a = c.animal;
  const req = REQUESTS[c.request];
  const allowed = speciesAllowed(g.profile).includes(a.species);
  const busy = !!gr.current();
  return h('div', { class: 'grm-client' },
    h('div', { class: 'grm-chat' },
      h('span', { class: 'grm-avatar' }, ownerEmoji(c.owner)),
      h('div', { class: 'grm-bubble' },
        h('b', {}, c.owner.name),
        h('p', {}, t(`grm_req_${c.request}`, { name: a.name, g: a.sex })))),
    animalCard(a),
    h('div', { class: 'grm-steps' },
      ...req.steps.map((id) => h('span', { class: 'chip' }, stepName(id))),
      c.style ? h('span', { class: 'chip grm-style' }, styleName(c.style)) : null),
    !allowed ? h('p', { class: 'warn' }, `🔒 ${t('grm_rankNeeded', { rank: t(`grm_rank_${RANKS[req.rank].id}`) })}`) : null,
    busy ? h('p', { class: 'note' }, t('grm_busy')) : null,
    h('div', { class: 'row grm-actions' },
      h('b', { class: 'grm-price' }, `🪙 ${c.price}`),
      h('button', { onClick: () => { gr.refuse(c); ui.toast(t('grm_refused', { owner: c.owner.name })); ui.renderPanel(); } }, `✖ ${t('grm_refuse')}`),
      h('button', { class: 'primary', disabled: !allowed || busy, onClick: () => {
        const r = gr.accept(c);
        if (!r.ok) return ui.toast(t(`grm_why_${r.reason}`));
        ui.toast(t('grm_accepted', { name: a.name, g: a.sex }), 4000);
        ui.renderPanel();
        return null;
      } }, `✅ ${t('grm_accept')}`)));
}

// ---------------------------------------------------------------- la séance

function renderSession(ui, s) {
  const g = ui.game;
  const p = g.profile;
  const gr = g.groomer;
  const a = s.animal;
  const c = s.client;
  const out = [];
  out.push(h('div', { class: 'grm-session-head' },
    h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
    h('div', {}, h('b', {}, a.name), h('small', {}, c ? t('grm_forOwner', { owner: c.owner.name }) : t('grm_yourAnimal')))));
  if (c) {
    out.push(h('div', { class: 'grm-chat small' },
      h('span', { class: 'grm-avatar' }, ownerEmoji(c.owner)),
      h('div', { class: 'grm-bubble' }, h('p', {}, t(`grm_req_${c.request}`, { name: a.name, g: a.sex })))));
  }
  const qualityOf = (id) => (c ? c.steps.find((x) => x.id === id)?.quality ?? null : s.done.find((x) => x.id === id)?.quality ?? null);
  const doneExtra = (id) => (c ? c.extra.includes(id) : false);
  const row = (id, required) => {
    const q = qualityOf(id);
    const done = q != null || doneExtra(id);
    const ok = stepAllowed(p, id);
    return h('div', { class: `grm-step ${done ? 'done' : ''} ${required ? 'required' : ''}` },
      h('span', { class: 'grm-step-name' }, stepName(id), id === 'cut' && s.style ? h('small', {}, ` · ${styleName(s.style)}`) : null),
      done ? h('span', { class: 'grm-step-q' }, q != null ? `✅ ${Math.round(q * 100)} %` : '✅') : null,
      h('button', { class: `small ${required && !done ? 'primary' : ''}`, disabled: !ok, onClick: () => runStep(ui, s, id) }, ok ? (done ? `↻ ${t('grm_redo')}` : `▶ ${t('grm_do')}`) : '🔒'));
  };
  if (c) {
    out.push(h('h3', {}, `📋 ${t('grm_asked')}`));
    out.push(h('div', { class: 'grm-step-list' }, c.steps.map((x) => row(x.id, true))));
    const extras = STEP_IDS.filter((id) => !c.steps.some((x) => x.id === id) && stepAllowed(p, id) && id !== 'cut');
    out.push(h('details', { class: 'grm-extra' }, h('summary', {}, `➕ ${t('grm_extraSteps')}`), h('div', { class: 'grm-step-list' }, extras.map((id) => row(id, false)))));
  } else {
    // Mes animaux : on choisit la coupe, et toutes les étapes sont libres.
    const styles = stylesFor(p, a.species);
    out.push(h('h3', {}, `💇 ${t('grm_chooseStyle')}`));
    out.push(h('div', { class: 'chips grm-styles' }, Object.keys(STYLES).map((id) => {
      const ok = styles.includes(id);
      return h('button', { class: `chip ${s.style === id ? 'on' : ''}`, disabled: !ok, onClick: () => { s.style = id; ui.renderPanel(); } }, ok ? styleName(id) : `🔒 ${t(`grm_style_${id}`)}`);
    })));
    out.push(h('h3', {}, `🧼 ${t('grm_steps')}`));
    out.push(h('div', { class: 'grm-step-list' }, STEP_IDS.map((id) => row(id, false))));
    out.push(h('h3', {}, `🛍️ ${t('grm_shop')}`), ...shopSection(ui, a));
  }
  const n = c ? stepsDone(c) : s.done.length;
  out.push(h('div', { class: 'row grm-finish' },
    h('button', { onClick: () => { if (c) ui.closePanel(); else gr.endOwn(); ui.renderPanel(); } }, c ? `⏸ ${t('grm_later')}` : `↩ ${t('grm_back')}`),
    h('button', { class: 'primary big', disabled: n === 0, onClick: () => finishSession(ui, s) }, `🏁 ${t('grm_finish')}`)));
  if (c && n === c.steps.length) out.push(h('p', { class: 'note good' }, `✨ ${t('grm_allDone')}`));
  return out;
}

/** Boutique : un accessoire par emplacement (tête, cou, queue), avec sa couleur. */
function shopSection(ui, a) {
  const g = ui.game;
  const p = g.profile;
  const out = [];
  for (const slot of ACC_SLOTS) {
    const worn = a.accessories?.[slot];
    const items = Object.entries(ACCESSORIES).filter(([, d]) => d.slot === slot);
    out.push(h('div', { class: 'grm-shop-slot' },
      h('b', {}, `${t(`grm_slot_${slot}`)}${worn ? ` · ${ACCESSORIES[worn.id].emoji} ${t(`grm_acc_${worn.id}`)}` : ''}`),
      h('div', { class: 'grm-shop-items' }, items.map(([id, d]) => {
        const ok = accessoryAllowed(p, id);
        const on = worn?.id === id;
        return h('div', { class: `grm-shop-item ${on ? 'on' : ''}` },
          h('button', { class: 'grm-shop-btn', disabled: !ok, onClick: () => wear(ui, a, id, worn?.id === id ? worn.color : 'pink') },
            h('span', { class: 'grm-shop-emoji' }, ok ? d.emoji : '🔒'), h('small', {}, `${t(`grm_acc_${id}`)}${ok ? coins(ui, d.price) : ` · ${t(`grm_rank_${RANKS[d.rank ?? 0].id}`)}`}`)),
          on ? h('div', { class: 'color-pick grm-colors' }, Object.entries(ACC_COLORS).map(([cid, hx]) => h('button', {
            class: `swatch-btn ${worn.color === cid ? 'on' : ''}`, title: t(`grm_col_${cid}`), style: { background: hexColor(hx) }, onClick: () => wear(ui, a, id, cid),
          }))) : null);
      })),
      worn ? h('button', { class: 'small', onClick: () => { removeAccessory(a, slot); g.entities.get(a.id)?.applyGear(); ui.renderPanel(); } }, `🗑️ ${t('grm_remove')}`) : null));
  }
  return out;
}

function wear(ui, a, id, color) {
  const g = ui.game;
  const r = wearAccessory(g.profile, a, id, color);
  if (!r.ok) return ui.toast(t(r.reason === 'money' ? 'r_money' : `grm_why_${r.reason}`));
  g.entities.get(a.id)?.applyGear();
  g.entities.get(a.id)?.emit('💖', 2);
  g.save();
  ui.refresh();
  ui.renderPanel();
  return r;
}

/** Fiche « Montre-moi » la première fois qu'on fait une étape. Renvoie true si on y va. */
function showStepTutorial(ui, id) {
  const st = ensureGroomer(ui.game.profile);
  if (st.seen.includes(id)) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (v) => { ui.hideModal(); if (v) st.seen.push(id); resolve(v); };
    ui.showModal(h('div', { class: 'grm-tuto' },
      h('div', { class: 'grm-tuto-emoji' }, STEPS[id].emoji),
      h('h2', {}, t(`grm_step_${id}`)),
      h('p', {}, t(`grm_tuto_${id}`)),
      h('div', { class: 'ev-buttons' },
        h('button', { class: 'primary', onClick: () => done(true) }, `👉 ${t('grm_showMe')}`),
        h('button', { onClick: () => done(false) }, t('grm_later')))));
  });
}

/** Lance le mini-jeu d'une étape et note le résultat (client) ou l'applique (mes animaux). */
export async function runStep(ui, s, id) {
  const g = ui.game;
  const p = g.profile;
  const gr = g.groomer;
  const a = s.animal;
  const def = STEPS[id];
  if (!def || g.blockedByPause()) return null;
  if (!(await showStepTutorial(ui, id))) return null;
  if (id === 'cut') {
    if (!s.style) s.style = stylesFor(p, a.species)[0] ?? 'court';
    setCutStyle(s.style);
  }
  if (id === 'finish') {
    const current = ACC_SLOTS.map((sl) => a.accessories?.[sl]).find(Boolean) ?? null;
    setFinishOptions({ accessories: Object.keys(ACCESSORIES).filter((k) => accessoryAllowed(p, k)), current, allowNone: true });
  }
  const promise = runMinigame(ui, a, def.game);
  const mg = ui.minigame; // (défini tout de suite : on lit stress / choix à la fin)
  const q = await promise;
  if (q === null) return null;
  const ctx = mg?.ctx ?? {};
  const day = dayOf(p.clock);
  if (s.client) {
    recordStep(s.client, id, q, { stress: id === 'dry' ? ctx.stress ?? 0 : undefined });
    if (id === 'finish') applyFinish(p, a, ctx.choice, true);
    if (id === 'cut') a.grooming = { style: s.style, day, quality: q };
  } else {
    const prev = s.done.find((x) => x.id === id);
    if (prev) prev.quality = Math.max(prev.quality, q);
    else s.done.push({ id, quality: q });
    if (def.care) {
      applyCare(a, def.care, q); // gratuit pour ses animaux
      addStat(p, def.care);
    } else if (id === 'cut') applyCut(a, s.style, day, q);
    else if (id === 'finish') applyFinish(p, a, ctx.choice, false, ui);
    else {
      a.needs.grooming = Math.min(100, a.needs.grooming + 12 * q);
      a.needs.hygiene = Math.min(100, a.needs.hygiene + 6 * q);
    }
    const e = g.entities.get(a.id);
    e?.emit(def.emoji, 2);
    if (id === 'cut' || id === 'finish') e?.applyGear();
    if (id === 'cut') gr.refreshCutVisuals();
  }
  g.xp('care');
  g.save();
  ui.refresh();
  if (ui.panel?.kind === 'salon') ui.renderPanel();
  return q;
}

function applyFinish(p, a, choice, free, ui = null) {
  if (!choice) return;
  if (!choice.id) {
    for (const sl of ACC_SLOTS) removeAccessory(a, sl);
    return;
  }
  const r = wearAccessory(p, a, choice.id, choice.color, { free });
  if (!r.ok && ui) ui.toast(t(r.reason === 'money' ? 'r_money' : `grm_why_${r.reason}`));
}

// ---------------------------------------------------------------- résultat : avant / après, étoiles

/** Portrait de l'animal : « avant » (poussière, poils en bataille) ou « après » (brillant, accessoires). */
export function drawPortrait(canvas, a, { before = false, style = null } = {}) {
  const W = 220;
  const H = 170;
  canvas.width = W * 2;
  canvas.height = H * 2;
  const g = canvas.getContext('2d');
  g.setTransform(2, 0, 0, 2, 0, 0);
  const grad = g.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, before ? '#e9e4ea' : '#fde9f1');
  grad.addColorStop(1, before ? '#d9d2d8' : '#f7cfe0');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = before ? '#c7bec4' : '#e8c9d8';
  g.fillRect(0, 140, W, 30);
  const floorY = 142;
  const fit = fitAnimal(a, { cx: W / 2, groundY: floorY, maxW: 190, maxH: 120 });
  const sh = animalShape(a, { x: fit.x, y: floorY, s: fit.s, f: 1 });
  drawAnimal(g, a, { x: fit.x, y: floorY, s: fit.s, f: 1, happy: !before, time: 1 });
  if (before) {
    // Poils en bataille et poussière
    g.strokeStyle = css(shade(a.look.coat, -0.4));
    g.lineWidth = 1.5;
    for (let i = 0; i < 14; i++) {
      const ang = (i / 14) * Math.PI * 2;
      const p0 = sh.L(Math.cos(ang) * sh.rx * 0.98, Math.sin(ang) * sh.ry * 0.98);
      const p1 = sh.L(Math.cos(ang) * sh.rx * 1.18, Math.sin(ang + 0.5) * sh.ry * 1.2);
      g.beginPath();
      g.moveTo(p0.x, p0.y);
      g.lineTo(p1.x, p1.y);
      g.stroke();
    }
    g.fillStyle = 'rgba(130,100,70,0.55)';
    for (let i = 0; i < 6; i++) {
      const q = sh.L(Math.sin(i * 2.3) * sh.rx * 0.7, Math.cos(i * 1.7) * sh.ry * 0.5);
      circle(g, q.x, q.y, 4 + (i % 3));
      g.fill();
    }
    drawEmoji(g, '💨', sh.rump.x - 20, sh.rump.y - 10, 18);
  } else {
    for (const w of Object.values(a.accessories ?? {})) drawAccessoryOn(g, sh, w, fit.s);
    for (let i = 0; i < 5; i++) drawEmoji(g, '✨', 20 + i * 45 + (i % 2) * 10, 25 + (i % 2) * 18, 16 + (i % 2) * 6);
    if (style) drawEmoji(g, STYLES[style]?.emoji ?? '✂️', W - 24, 24, 22);
  }
}

function starsEl(n) {
  return h('div', { class: 'grm-stars', 'aria-label': `${n}/5` }, [1, 2, 3, 4, 5].map((i) => h('span', { class: i <= n ? 'on' : 'off', style: { animationDelay: `${0.1 + i * 0.15}s` } }, '★')));
}

/** Termine la séance : note du client, paye, carte avant / après. */
function finishSession(ui, s) {
  const g = ui.game;
  const p = g.profile;
  const gr = g.groomer;
  const a = s.animal;
  const day = dayOf(p.clock);
  const before = h('canvas', { class: 'grm-photo' });
  const after = h('canvas', { class: 'grm-photo' });
  drawPortrait(before, a, { before: true });
  drawPortrait(after, a, { style: a.grooming?.style ?? s.style });
  const photos = h('div', { class: 'grm-photos' },
    h('figure', {}, before, h('figcaption', {}, t('grm_before'))),
    h('figure', {}, after, h('figcaption', {}, t('grm_after'))));
  if (s.client) {
    const c = s.client;
    const r = completeService(p, c, day);
    g.xp('care', r.stars >= 4 ? 2 : 1);
    const lines = [
      `🪙 ${t('grm_paid', { n: r.pay })}${r.tip ? ` · 🎁 ${t('grm_tip', { n: r.tip })}` : ''}`,
      `⭐ ${t('grm_repChange', { n: (r.rep >= 0 ? '+' : '') + r.rep })} · 🎓 +${r.xp} XP`,
    ];
    if (r.done < 1) lines.push(`⚠️ ${t('grm_forgot', { n: c.steps.length - stepsDone(c) })}`);
    if (r.calm < 0.7) lines.push(`😨 ${t('grm_scared', { name: a.name, g: a.sex })}`);
    const text = t(`grm_react${r.stars}`, { owner: c.owner.name, name: a.name, g: a.sex });
    ui.showModal(h('div', { class: 'grm-result' },
      h('div', { class: 'grm-chat' }, h('span', { class: 'grm-avatar' }, ownerEmoji(c.owner)), h('div', { class: 'grm-bubble' }, h('b', {}, c.owner.name), h('p', {}, text))),
      starsEl(r.stars),
      photos,
      h('ul', { class: 'ev-lines' }, lines.map((l) => h('li', {}, l))),
      r.rankUp ? h('p', { class: 'grm-rankup' }, `🎉 ${t('grm_rankUp', { rank: t(`grm_rank_${RANKS[r.rank].id}`) })}`) : null,
      h('div', { class: 'ev-buttons' }, h('button', { class: 'primary', onClick: () => {
        ui.hideModal();
        gr.release(c);
        ui.refresh();
        if (ui.panel?.kind === 'salon') ui.renderPanel();
      } }, t('grm_bye')))));
    if (r.rankUp) setTimeout(() => ui.toast(t('grm_rankUpHint', { rank: t(`grm_rank_${RANKS[r.rank].id}`) }), 7000), 500);
  } else {
    const steps = s.done.map((x) => x.id);
    const r = recordOwnGrooming(p, a, steps);
    const avg = s.done.reduce((k, x) => k + x.quality, 0) / Math.max(1, s.done.length);
    const stars = avg >= 0.9 ? 5 : avg >= 0.72 ? 4 : avg >= 0.5 ? 3 : 2;
    ui.showModal(h('div', { class: 'grm-result' },
      h('h2', {}, `✨ ${t('grm_ownDone', { name: a.name, g: a.sex })}`),
      starsEl(stars),
      photos,
      h('ul', { class: 'ev-lines' }, [h('li', {}, `🧼 ${steps.map(stepName).join(' · ')}`), a.grooming && cutFresh(a, day) ? h('li', {}, `💇 ${t('grm_freshCut', { style: t(`grm_style_${a.grooming.style}`), n: CUT_DAYS })}`) : null]),
      r.rankUp ? h('p', { class: 'grm-rankup' }, `🎉 ${t('grm_rankUp', { rank: t(`grm_rank_${RANKS[r.rank].id}`) })}`) : null,
      h('div', { class: 'ev-buttons' }, h('button', { class: 'primary', onClick: () => {
        ui.hideModal();
        gr.endOwn();
        ui.refresh();
        if (ui.panel?.kind === 'salon') ui.renderPanel();
      } }, 'OK'))));
  }
  g.save();
}

// ---------------------------------------------------------------- carnet du métier

export function openCarnet(ui) {
  const p = ui.game.profile;
  const st = ensureGroomer(p);
  const rank = rankOf(p);
  const xp = careerXp(p);
  ui.showModal(h('div', { class: 'grm-carnet' },
    h('h2', {}, `📒 ${t('grm_carnetTitle')}`),
    h('p', { class: 'note' }, t('grm_carnetHelp')),
    h('ul', { class: 'grm-ranks' }, RANKS.map((r, i) => h('li', { class: i === rank ? 'now' : i < rank ? 'done' : '' },
      h('b', {}, `${i < rank ? '✅' : i === rank ? '🎓' : '🔒'} ${t(`grm_rank_${r.id}`)}`),
      h('small', {}, `${r.xp} XP · ${t(`grm_rankDesc_${r.id}`)}`)))),
    h('div', { class: 'chips' },
      h('span', { class: 'chip' }, `🎓 ${xp} XP`),
      h('span', { class: 'chip' }, `⭐ ${t('grm_reputation')} ${Math.round(st.reputation)}`),
      h('span', { class: 'chip' }, `🐾 ${t('grm_served', { n: st.served })}`)),
    st.history.length ? h('table', { class: 'grm-history' }, h('tbody', {}, st.history.map((e) => h('tr', {},
      h('td', {}, t('day', { n: e.day })),
      h('td', {}, `${SPECIES[e.species]?.emoji ?? ''} ${e.name}`),
      h('td', {}, '★'.repeat(e.stars)),
      h('td', {}, isSandbox(p) ? '' : `${e.pay} 🪙`))))) : h('p', { class: 'note' }, t('grm_noHistory')),
    h('div', { class: 'ev-buttons' }, h('button', { class: 'primary', onClick: () => ui.hideModal() }, 'OK'))));
}

// ---------------------------------------------------------------- fiche de l'animal

/** Rubrique « Toilettage » de la fiche d'un animal : coupe en cours, accessoires, aller au salon. */
export function groomingSection(ui, a) {
  const g = ui.game;
  const p = g.profile;
  const day = dayOf(p.clock);
  const salon = salonAt(p, p.place);
  const worn = Object.entries(a.accessories ?? {});
  const out = [h('h3', {}, `✂️ ${t('grm_title')}`)];
  out.push(h('p', { class: 'note' }, groomStatus(a, day)));
  if (worn.length) {
    out.push(h('div', { class: 'chips' }, worn.map(([slot, w]) => h('button', { class: 'chip', title: t('grm_remove'), onClick: () => { removeAccessory(a, slot); g.entities.get(a.id)?.applyGear(); g.save(); ui.renderPanel(); } }, `${ACCESSORIES[w.id]?.emoji ?? '🎀'} ${t(`grm_acc_${w.id}`)} ✕`))));
  }
  if (!canGroom(p)) out.push(h('p', { class: 'note' }, `🔒 ${t('grm_locked', { n: GROOMER_LEVEL })}`));
  else if (!salon) out.push(h('p', { class: 'note' }, t('grm_buildSalon')));
  else {
    out.push(h('div', { class: 'grid' }, h('button', { class: 'act', onClick: () => {
      const d = doorOf(salon);
      ui.closePanel();
      g.walkTo({ x: d.x, z: d.z }, 1.4, () => { g.groomer.startOwn(a); openSalon(ui); });
    } }, `✂️ ${t('grm_goSalon')}`)));
  }
  return out;
}

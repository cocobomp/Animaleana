// Interface du salon de toilettage (métier Toiletteur ✂️) : les clients qui attendent (bulles de
// dialogue, fiche de l'animal, étapes demandées, prix, Accepter / Refuser), la séance de toilettage
// (chaque étape est un mini-jeu), la boutique d'accessoires pour ses propres animaux, la carte
// « avant / après » avec les étoiles, le carnet du métier et les petites fiches « Montre-moi ».

import { h, hexColor } from './dom.js';
import { t } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { perkParams } from './names.js'; // textes des rangs (espèces proposées)
import { animalCard, animalThumbSpec } from './panels.js';
import { thumb, thumbsFor } from '../game/thumbScenes.js'; // vignettes 3D : le vrai cheval (listes, photos avant / après)
import { runMinigame, registerMinigames } from './minigames.js';
import { GROOMER_GAMES, GROOMER_ICONS, setFinishOptions, setCutStyle, drawAccessoryOn } from './minigames/groomer.js';
import { drawAnimal, fitAnimal, animalShape, circle, emoji as drawEmoji, shade } from './minigames/draw.js';
import {
  STEPS, STEP_IDS, STYLES, REQUESTS, ACCESSORIES, ACC_COLORS, ACC_SLOTS, RANKS, GROOMER_LEVEL, CUT_DAYS,
  ensureGroomer, rankOf, rankProgress, careerXp, canGroom, waitingClients, stepAllowed, stylesFor, accessoryAllowed, finishAccessories,
  recordStep, completeService, applyCut, wearAccessory, removeAccessory, recordOwnGrooming, speciesAllowed,
  salonAt, cutFresh, stepsDone, reputation, GROOMER_CAREER, maxWaiting, stepFor,
} from '../sim/groomer.js';
import { isStarted } from '../sim/careers.js'; // 💼 Métiers
import { applyCare } from '../sim/animal.js';
import { addStat, isSandbox } from '../sim/profile.js';
import { dayOf } from '../sim/time.js';
import { doorOf } from '../sim/construction.js';

registerMinigames(GROOMER_GAMES, GROOMER_ICONS);

const stepName = (id) => `${STEPS[id].emoji} ${t(`grm_step_${id}`)}`;
const styleName = (id) => `${STYLES[id].emoji} ${t(`grm_style_${id}`)}`;
const coins = (ui, n) => (isSandbox(ui.game.profile) ? '' : ` · ${n} 🪙`);
const ownerEmoji = (o) => (o.sex === 'f' ? '👩' : '👨');

/**
 * Le cheval : sa vignette 3D (le vrai cheval, comme la fiche et l'animalerie : panels.js animalPic) à la place de
 * l'emoji 🐴 ; les autres animaux gardent leur emoji. (Pas de jeu, pas de WebGL, robe hors catalogue : l'emoji.)
 */
function animalPic(g, a, w, hh, cls = '') {
  const emoji = SPECIES[a.species].emoji;
  const spec = a.species === 'horse' && g ? animalThumbSpec(a) : null;
  if (!spec) return h('span', { class: 'card-emoji' }, emoji);
  const el = thumb(g, spec, { w, h: hh, emoji, cls: `grm-thumb ${cls}`.trim(), alt: a.name ?? '' });
  el.style.width = `${w}px`;
  el.style.height = `${hh}px`;
  return el;
}

// ---------------------------------------------------------------- le salon

export function openSalon(ui) {
  const g = ui.game;
  if (canGroom(g.profile) && !isStarted(g.profile, 'groomer')) g.clients?.startCareer('groomer');
  g.emit('building', 'salon');
  ui.openPanel({
    title: `✂️ ${t('grm_title')}`,
    kind: 'salon',
    render: () => renderSalon(ui),
  });
}

function rankHeader(ui) {
  const p = ui.game.profile;
  ensureGroomer(p);
  const pr = rankProgress(p);
  return h('div', { class: 'grm-head' },
    h('div', { class: 'grm-rank' },
      h('span', { class: 'chip grm-rank-chip' }, `🎓 ${t(`grm_rank_${RANKS[pr.rank].id}`, { g: p.avatar?.female ? 'f' : 'm' })}`),
      h('span', { class: 'chip' }, `⭐ ${t('grm_reputation')} ${Math.round(reputation(p))}`),
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
  out.push(h('h3', {}, `🔔 ${t('grm_clients')} (${waiting.length}/${maxWaiting(p)})`));
  if (!waiting.length) out.push(h('p', { class: 'note' }, t('grm_noClient')));
  for (const c of waiting) out.push(clientCard(ui, c));
  // Mes animaux
  const mine = g.animalsHere().filter((a) => !a.guest);
  out.push(h('h3', {}, `🐾 ${t('grm_myAnimals')}`));
  if (!mine.length) out.push(h('p', { class: 'note' }, t('grm_noAnimal')));
  out.push(h('div', { class: 'cards' }, mine.map((a) => h('div', { class: 'card' },
    animalPic(g, a, 60, 46),
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
    animalCard(a, a.species === 'horse' ? animalPic(g, a, 72, 54) : null),
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
    animalPic(g, a, 72, 54),
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
    const extras = STEP_IDS.filter((id) => !c.steps.some((x) => x.id === id) && stepAllowed(p, id) && stepFor(id, a.species) && id !== 'cut');
    out.push(h('details', { class: 'grm-extra' }, h('summary', {}, `➕ ${t('grm_extraSteps')}`), h('div', { class: 'grm-step-list' }, extras.map((id) => row(id, false)))));
  } else {
    // Mes animaux : on choisit la coupe, et toutes les étapes sont libres.
    const styles = stylesFor(p, a.species);
    out.push(h('h3', {}, `💇 ${t('grm_chooseStyle')}`));
    // (seules les coupes de son espèce : pas de « caniche en boules » verrouillée sous le nez d'un cheval)
    const mine = Object.keys(STYLES).filter((id) => !STYLES[id].species || STYLES[id].species.includes(a.species));
    out.push(h('div', { class: 'chips grm-styles' }, mine.map((id) => {
      const ok = styles.includes(id);
      return h('button', { class: `chip ${s.style === id ? 'on' : ''}`, disabled: !ok, onClick: () => { s.style = id; ui.renderPanel(); } }, ok ? styleName(id) : `🔒 ${t(`grm_style_${id}`)}`);
    })));
    out.push(h('h3', {}, `🧼 ${t('grm_steps')}`));
    out.push(h('div', { class: 'grm-step-list' }, STEP_IDS.filter((id) => stepFor(id, a.species)).map((id) => row(id, false))));
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
            h('span', { class: 'grm-shop-emoji' }, ok ? d.emoji : '🔒'), h('small', {}, `${t(`grm_acc_${id}`)}${ok ? coins(ui, d.price) : ` · ${t(`grm_rank_${RANKS[d.rank ?? 0].id}`)}`}`)));
      })),
      // La couleur de l'accessoire porté : de gros ronds (44 px) sur toute la largeur.
      worn ? h('div', { class: 'color-pick grm-colors' }, Object.entries(ACC_COLORS).map(([cid, hx]) => h('button', {
        class: `swatch-btn ${worn.color === cid ? 'on' : ''}`, title: t(`grm_col_${cid}`), 'aria-label': t(`grm_col_${cid}`), style: { background: hexColor(hx) }, onClick: () => wear(ui, a, worn.id, cid),
      }))) : null,
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
    const accessories = finishAccessories(p, a.species);
    const current = ACC_SLOTS.map((sl) => a.accessories?.[sl]).find((w) => w && accessories.includes(w.id)) ?? null;
    setFinishOptions({ accessories, current, allowNone: true });
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
    if (def.care) applyCare(a, def.care, q); // l'animal du client est vraiment plus propre (fiche, avant / après)
    // Dans le monde 3D : l'animal sur la table brille, et porte tout de suite son nœud ou son bandana.
    const e = gr.entityOf(s.client);
    e?.emit(def.emoji, 2);
    if (id === 'cut' || id === 'finish') e?.applyGear();
    if (id === 'cut') gr.refreshCutVisuals();
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
  if (def.carnet) noteCareer(g, def.carnet); // carnet de 💼 Métiers (bain, séchage, brossage, coupe…)
  g.xp('care');
  g.save();
  ui.refresh();
  if (ui.panel?.kind === 'salon') ui.renderPanel();
  return q;
}

/** Coche une action du carnet de 💼 Métiers (la première fois : petit message et XP). */
export function noteCareer(g, action) {
  if (GROOMER_CAREER.actions.some((x) => x.id === action)) g.clients?.noteCareer?.('groomer', action);
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
    g.strokeStyle = shade(a.look?.coat ?? 0xc98c43, -0.4); // (shade rend déjà une couleur CSS)
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
    // (les étoiles dans les coins, jamais sur la tête ; avant : en rang en haut, la 4e tombait sur l'œil)
    sparkleCorners(g, W, H, !!style);
    if (style) drawEmoji(g, STYLES[style]?.emoji ?? '✂️', W - 24, 24, 22);
  }
}

/** Des étincelles dans les coins de la photo (pas en haut à droite si l'emoji de la coupe y est). */
function sparkleCorners(g, W, H, styleCorner = false) {
  const spots = [[16, 18, 18], [38, 12, 12], [16, H - 46, 14], [W - 18, H - 46, 18], [W - 40, H - 36, 12]];
  if (!styleCorner) spots.push([W - 18, 18, 16]);
  for (const [x, y, sz] of spots) drawEmoji(g, '✨', x, y, sz);
}

/**
 * Photo avant / après d'un cheval : sa vignette 3D (le vrai cheval), et par-dessus, sur une toile transparente, la
 * poussière et les brins de paille posés sur sa robe (avant), ou les étincelles dans les coins, l'emoji de la coupe
 * et ce qu'on a fait pendant la séance (après). null si pas de vignette possible (le portrait dessiné prend le
 * relais). done : les étapes faites (emoji en bas de la photo « après ») ; acc : son accessoire (ruban, nœud).
 */
export function horsePhoto(g, a, { before = false, style = null, done = [], acc = null } = {}) {
  const spec = a.species === 'horse' && g ? animalThumbSpec(a) : null;
  // (sans moteur de vignettes — pas de WebGL — : le portrait dessiné, pas l'emoji 🐴 dans les deux photos)
  if (!spec || !thumbsFor(g)?.enabled) return null;
  const W = 220;
  const H = 170;
  const box = h('div', { class: `grm-photo grm-photo3d ${before ? 'before' : 'after'}`, style: { position: 'relative', aspectRatio: `${W} / ${H}`, overflow: 'hidden', background: before ? 'linear-gradient(#ece7ed, #d9d2d8)' : 'radial-gradient(circle at 50% 55%, #fff6fa, #f7cfe0 70%)' } });
  const pic = thumb(g, spec, { w: W, h: H, emoji: SPECIES.horse.emoji, cls: 'grm-photo-pic', alt: a.name ?? '', urgent: true });
  Object.assign(pic.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', borderRadius: '0', background: 'transparent', boxShadow: 'none' });
  // (avant : un peu terne, poussiéreux ; après : propre et lumineux, un halo doux autour de lui)
  pic.style.filter = before ? 'saturate(0.7) brightness(0.93) sepia(0.12)' : 'saturate(1.12) brightness(1.05) contrast(1.04) drop-shadow(0 0 5px rgba(255,255,255,0.95))';
  const over = h('canvas', { class: 'grm-photo-over', style: { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' } });
  over.width = W * 2;
  over.height = H * 2;
  const c = over.getContext('2d');
  if (c) {
    c.setTransform(2, 0, 0, 2, 0, 0);
    if (before) {
      drawEmoji(c, '💨', 22, H - 26, 20);
    } else {
      sparkleCorners(c, W, H, !!style);
      if (style) drawEmoji(c, STYLES[style]?.emoji ?? '✂️', W - 22, 22, 20);
      // ce qu'on a fait pendant la séance, en petit en bas (et son ruban ou son nœud, à sa couleur)
      // (avec un accessoire, son emoji remplace celui des finitions : pas deux 🎀 de suite)
      const withAcc = !!(acc?.id && ACCESSORIES[acc.id]);
      const icons = done.filter((id) => !(withAcc && id === 'finish')).map((id) => STEPS[id]?.emoji).filter(Boolean);
      if (withAcc) icons.push(ACCESSORIES[acc.id].emoji);
      const n = icons.length;
      if (n) {
        const sz = 13;
        const gap = 18;
        const x0 = W / 2 - ((n - 1) * gap) / 2;
        c.fillStyle = 'rgba(255,255,255,0.78)';
        c.beginPath();
        c.roundRect?.(x0 - 13, H - 22, (n - 1) * gap + 26, 19, 9.5);
        c.fill();
        icons.forEach((e, i) => drawEmoji(c, e, x0 + i * gap, H - 12.5, sz));
        if (acc?.color && ACC_COLORS[acc.color] != null) {
          c.fillStyle = `#${ACC_COLORS[acc.color].toString(16).padStart(6, '0')}`;
          c.beginPath();
          c.arc(x0 + (n - 1) * gap + 7, H - 6, 3.2, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
  }
  box.append(pic, over);
  // Quand l'image du cheval est là : la poussière sur sa robe (avant). Si la vignette rate (contexte WebGL perdu…) :
  // le portrait dessiné à sa place, pas un emoji.
  whenThumb(box, pic, (img) => {
    if (before && c) dustOn(c, bodySpots(img, W, H, 14));
  }, () => {
    const cv = h('canvas', { class: 'grm-photo-pic', style: { position: 'absolute', inset: '0', width: '100%', height: '100%' } });
    drawPortrait(cv, a, { before, style });
    pic.replaceWith(cv);
  });
  return box;
}

/**
 * Points du corps d'un cheval dans son image (vignette transparente autour de lui) : des pixels opaques du milieu
 * de sa silhouette (le tronc : ni la tête, en haut à un bout, ni le bas des jambes). n points, en pixels de la photo
 * (W × H). [] si l'image ne se lit pas.
 */
export function bodySpots(img, W, H, n = 9) {
  const cw = 110;
  const ch = Math.round((cw * H) / W);
  try {
    const cv = document.createElement('canvas');
    cv.width = cw;
    cv.height = ch;
    const cx = cv.getContext('2d');
    cx.drawImage(img, 0, 0, cw, ch);
    const data = cx.getImageData(0, 0, cw, ch).data;
    const alpha = new Uint8Array(cw * ch);
    for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
    return spotsOnBody(alpha, cw, ch, W, H, n);
  } catch {
    return [];
  }
}

/** Même chose, depuis l'opacité de chaque pixel (alpha, cw × ch) : les points, en pixels de la photo W × H. */
export function spotsOnBody(alpha, cw, ch, W, H, n = 9) {
  const on = (x, y) => x >= 0 && y >= 0 && x < cw && y < ch && alpha[y * cw + x] > 200;
  let x0 = cw;
  let x1 = -1;
  let y0 = ch;
  let y1 = -1;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (on(x, y)) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  if (x1 < 0) return [];
  // (le tronc : la bande du milieu de la silhouette, en hauteur 40 à 68 %, en largeur 25 à 75 %)
  const cand = [];
  for (let y = Math.round(y0 + (y1 - y0) * 0.4); y <= y0 + (y1 - y0) * 0.68; y++) {
    for (let x = Math.round(x0 + (x1 - x0) * 0.25); x <= x0 + (x1 - x0) * 0.75; x++) {
      // (bien dedans : ses voisins aussi sont sur lui)
      if (on(x, y) && on(x - 2, y) && on(x + 2, y) && on(x, y - 2) && on(x, y + 2)) cand.push([x, y]);
    }
  }
  if (!cand.length) return [];
  const out = [];
  for (let i = 0; i < n; i++) {
    const [x, y] = cand[Math.floor(((i * 0.618034 + 0.13) % 1) * cand.length)];
    out.push({ x: ((x + 0.5) / cw) * W, y: ((y + 0.5) / ch) * H });
  }
  return out;
}

/** Attend l'image de la vignette (au plus une minute) : ready(img), ou failed() si elle est restée un emoji. */
function whenThumb(box, pic, ready, failed) {
  const t0 = Date.now();
  const tick = () => {
    const img = pic.querySelector?.('img') ?? (pic.tagName === 'IMG' ? pic : null);
    if (img && img.complete && img.naturalWidth) return ready(img);
    if (pic.classList?.contains('is-emoji') && !pic.classList.contains('is-wait')) return failed();
    if (Date.now() - t0 < 60000 && (box.isConnected || Date.now() - t0 < 3000)) setTimeout(tick, 400);
  };
  tick();
}

/** La poussière (taches brunes floues) et quelques brins de paille, aux points donnés de sa robe. */
function dustOn(c, spots) {
  spots.slice(0, 9).forEach((p, i) => {
    const r = 8 + (i % 3) * 3;
    const gr = c.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
    gr.addColorStop(0, 'rgba(120,92,62,0.5)');
    gr.addColorStop(1, 'rgba(120,92,62,0)');
    c.fillStyle = gr;
    c.fillRect(p.x - r, p.y - r, r * 2, r * 2);
  });
  c.strokeStyle = 'rgba(214,184,96,0.9)';
  c.lineWidth = 1.4;
  spots.slice(9).forEach((p, i) => {
    c.beginPath();
    c.moveTo(p.x, p.y);
    c.lineTo(p.x + 8 - (i % 2) * 16, p.y + 3);
    c.stroke();
  });
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
  // (le cheval : sa vignette 3D, le vrai cheval ; les autres animaux : le portrait dessiné)
  const styleNow = a.grooming?.style ?? s.style;
  let before = horsePhoto(g, a, { before: true });
  const doneIds = s.client ? s.client.steps.filter((x) => x.quality != null).map((x) => x.id) : s.done.map((x) => x.id);
  const acc = ACC_SLOTS.map((sl) => a.accessories?.[sl]).find(Boolean) ?? null;
  let after = horsePhoto(g, a, { style: styleNow, done: doneIds, acc });
  if (!before || !after) {
    before = h('canvas', { class: 'grm-photo' });
    after = h('canvas', { class: 'grm-photo' });
    drawPortrait(before, a, { before: true });
    drawPortrait(after, a, { style: styleNow });
  }
  const photos = h('div', { class: 'grm-photos' },
    h('figure', {}, before, h('figcaption', {}, t('grm_before'))),
    h('figure', {}, after, h('figcaption', {}, t('grm_after'))));
  if (s.client) {
    const c = s.client;
    const r = completeService(p, c, day);
    noteCareer(g, 'return');
    g.xp('care', r.stars >= 4 ? 2 : 1);
    const lines = [
      // (bac à sable : pas d'argent, donc pas de ligne « gagnés »)
      isSandbox(p) ? null : `🪙 ${t('grm_paid', { n: r.pay })}${r.tip ? ` · 🎁 ${t('grm_tip', { n: r.tip })}` : ''}`,
      `⭐ ${t('grm_repChange', { n: (r.rep >= 0 ? '+' : '') + r.rep })} · 🎓 +${r.xp} XP`,
    ].filter(Boolean);
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
      h('small', {}, `${r.xp} XP · ${t(`grm_rankDesc_${r.id}`, perkParams('groomer', i))}`)))), // (espèces proposées)
    h('div', { class: 'chips' },
      h('span', { class: 'chip' }, `🎓 ${xp} XP`),
      h('span', { class: 'chip' }, `⭐ ${t('grm_reputation')} ${Math.round(reputation(p))}`),
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

// ---------------------------------------------------------------- 💼 Métiers

/** Dans la carte du métier (💼 Métiers) : où en est le salon, et un bouton pour y aller (ou le construire). */
export function salonCareerBlock(ui) {
  const g = ui.game;
  const p = g.profile;
  const salon = salonAt(p, p.place);
  const st = ensureGroomer(p);
  const waiting = waitingClients(p).filter((c) => g.groomer?.isHere(c)).length;
  const go = () => {
    ui.closePanel();
    if (salon) g.groomer.goToSalon();
    else g.groomer.showMe();
  };
  return h('div', { class: 'ca-school grm-career' },
    h('span', {}, salon
      ? `✂️ ${t('grm_cardSalon', { n: st.served })}${waiting ? ` · 🔔 ${t('grm_cardWaiting', { n: waiting })}` : ''}`
      : `🏗️ ${t('grm_cardNoSalon')}`),
    h('button', { class: 'small primary', onClick: go }, salon ? `✂️ ${t('grm_goSalon')}` : `🏗️ ${t('grm_cardBuild')}`));
}

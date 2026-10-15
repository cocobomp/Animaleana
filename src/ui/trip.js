// Écrans du voyage réaliste : choix du départ, écran du trajet (route, pauses, soins), bilan à l'arrivée,
// bandeau « Chargement 1/3 » et conseils dans le panneau Voyager.

import { h } from './dom.js';
import { t, ta } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { TRAVEL_MODES } from '../sim/places.js';
import {
  STOP_ACTIONS, STOP_ACTION_EMOJI, canStopAction, doStopAction, continueTrip, skipStop, sleepAtStop, canContinue,
  currentStop, nextStop, remainingHours, progress, stressLevel, tipsFor, phaseAt, runToEnd, planTrip, vehicleFor,
  isLongTrip,
} from '../sim/trip.js';

// ------------------------------------------------------------ outils

/** « 2 h 30 », « 45 min », « 1 j 3 h ». */
export function fmtHours(hours) {
  const total = Math.max(0, Math.round(hours * 60));
  const d = Math.floor(total / 1440);
  const hh = Math.floor((total % 1440) / 60);
  const m = total % 60;
  if (d) return t('trip_days', { d, h: hh });
  if (hh && m) return t('trip_hm', { h: hh, m: String(m).padStart(2, '0') });
  if (hh) return t('trip_h', { h: hh });
  return t('trip_min', { m });
}

const STOP_EMOJI = { rest: '🅿️', night: '🌙', boarding: '🛫', landing: '🛬' };

/** Petite barre : `good` dit si une valeur haute est bonne (soif, faim, confort) ou mauvaise (stress). */
function tripBar(icon, label, value, good = true) {
  const v = Math.round(value);
  const score = good ? v : 100 - v;
  const level = score >= 60 ? 'good' : score >= 30 ? 'mid' : 'low';
  const fill = h('span', { class: `bar-fill ${level}`, style: { width: `${v}%` } });
  const val = h('span', { class: 'trip-bar-val' }, v);
  const el = h('div', { class: 'trip-bar', title: label },
    h('span', { class: 'trip-bar-label' }, `${icon} ${label}`),
    h('span', { class: 'bar-track' }, fill),
    val);
  return { el, set: (x) => {
    const n = Math.round(x);
    const sc = good ? n : 100 - n;
    fill.style.width = `${n}%`;
    fill.className = `bar-fill ${sc >= 60 ? 'good' : sc >= 30 ? 'mid' : 'low'}`;
    if (val.textContent !== String(n)) val.textContent = n;
  } };
}

function overlay(ui) {
  if (!ui.tripEl) {
    ui.tripEl = h('div', { id: 'trip-overlay', hidden: true });
    ui.root.append(ui.tripEl);
  }
  return ui.tripEl;
}

// ------------------------------------------------------------ bandeau d'état pendant le chargement

/** Bandeau « 🚐 Chargement 1/3 » avec les boutons Mettre en caisse et Annuler. */
export function tripChips(ui) {
  const flow = ui.game?.tripFlow;
  const l = flow?.loading;
  if (!l?.vehicle) return [];
  const total = l.ids.length;
  const emojiOf = (a) => SPECIES[a.species].emoji;
  const animals = flow.travellers(l.ids);
  const names = animals.map((a) => `${l.loaded.has(a.id) ? '✅' : emojiOf(a)}`).join(' ');
  const hasSmall = flow.waiting().some((a) => flow.placeOf(a) === 'crate');
  return [h('div', { class: 'status-chip trip-chip' },
    h('span', {}, `${l.vehicle.kind === 'trailer' ? '🚐' : '🚗'} ${t('trip_loadingChip', { n: l.loaded.size, total })} · ${names}`),
    hasSmall && !l.carry ? h('button', { class: 'small', onClick: () => flow.crateNearest() }, t('trip_crateBtn')) : null,
    h('button', { class: 'small', onClick: () => flow.cancel() }, t('cancel')))];
}

// ------------------------------------------------------------ choix au départ

export function showDepartChoice(ui, flow) {
  const l = flow.loading;
  const animals = flow.travellers(l.ids);
  const tips = tipsFor(planTrip({ mode: l.mode, hours: l.check.hours, animals }), animals);
  const choose = (watch) => { ui.hideModal(); flow.depart(watch); };
  ui.showModal([
    h('p', { class: 'trip-modal-title' }, l.mode === 'horse' ? t('trip_horseGo') : t('trip_watchTitle')),
    h('div', { class: 'trip-choice' },
      h('button', { class: 'big-action primary', onClick: () => choose(true) },
        h('span', { class: 'ba-text' }, h('b', {}, t('trip_watch')), h('small', {}, t('trip_watchDesc')))),
      h('button', { class: 'big-action', onClick: () => choose(false) },
        h('span', { class: 'ba-text' }, h('b', {}, t('trip_skip')), h('small', {}, t('trip_skipDesc'))))),
    tipBox(tips[0]),
    h('div', { class: 'row end' }, h('button', { onClick: () => { ui.hideModal(); flow.cancel(); } }, t('cancel'))),
  ]);
}

function tipBox(key) {
  if (!key) return null;
  return h('div', { class: 'trip-tip' }, h('b', {}, t('trip_tipLabel')), h('span', {}, t(`trip_tip_${key}`)));
}

// ------------------------------------------------------------ écran du trajet

export function openJourney(ui, flow) {
  const el = overlay(ui);
  el.hidden = false;
  flow.journey.tips = tipsFor(flow.journey.trip, flow.animals);
  flow.journey.tipIndex = 0;
  flow.journey.tipAcc = 0;
  renderJourney(ui, flow);
  el.firstChild?.classList.add('enter');
}

export function closeJourney(ui) {
  if (!ui.tripEl) return;
  ui.tripEl.hidden = true;
  ui.tripEl.replaceChildren();
  ui.tripRefs = null;
}

/** Dessine tout l'écran (quand l'état change : départ, pause, soin…). */
export function renderJourney(ui, flow) {
  const j = flow.journey;
  if (!j || j.report) return;
  const trip = j.trip;
  const el = overlay(ui);
  const stop = currentStop(trip);
  const refs = { bars: [] };
  const modeDef = TRAVEL_MODES[trip.mode];

  // Route stylisée : le véhicule avance, avec les pauses et le drapeau d'arrivée.
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 320 84');
  svg.setAttribute('class', 'trip-route');
  const d = 'M16,58 C60,18 92,70 140,46 S220,14 262,40 S300,52 306,30';
  const mk = (tag, attrs) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    svg.append(n);
    return n;
  };
  mk('path', { d, class: 'trip-road-edge' });
  const road = mk('path', { d, class: 'trip-road' });
  mk('path', { d, class: 'trip-road-line' });
  const holdPath = trip.phases.some((p) => p.kind === 'hold') ? mk('path', { d, class: 'trip-road-hold' }) : null;
  const done = mk('path', { d, class: 'trip-road-done' });
  const labels = [];
  const text = (x, y, s, cls = '') => {
    const n = mk('text', { x, y, class: `trip-route-emoji ${cls}`, 'text-anchor': 'middle', 'dominant-baseline': 'middle' });
    n.textContent = s;
    labels.push(n);
    return n;
  };
  const start = text(0, 0, '🏠');
  const end = text(0, 0, flow.destName().split(' ')[0]);
  // Sur un très long trajet, on ne montre que les nuits (sinon la route est couverte de 🅿️).
  const many = trip.stops.length > 8;
  const shown = trip.stops.filter((s) => !many || s.kind !== 'rest');
  const stopMarks = shown.filter((s, i) => shown.length <= 10 || i % Math.ceil(shown.length / 10) === 0)
    .map((s) => ({ s, n: text(0, 0, STOP_EMOJI[s.kind], s.done || s.skipped ? 'past' : '') }));
  const holdMark = holdPath ? text(0, 0, trip.mode === 'plane' ? '✈️' : '⛴️', 'hold') : null;
  const vehicle = text(0, 0, trip.mode === 'horse' ? '🐎' : j.vehicle?.kind === 'trailer' || trip.vehicle === 'trailer' ? '🚐' : '🚗', 'vehicle');
  refs.route = { svg, road, done, holdPath, start, end, stopMarks, holdMark, vehicle, roadIcon: vehicle.textContent };

  // Temps et étape.
  refs.elapsed = h('b', {}, fmtHours(trip.elapsed));
  refs.remaining = h('b', {}, fmtHours(remainingHours(trip)));
  refs.next = h('small', { class: 'trip-next' });
  const phase = phaseAt(trip);
  const phaseText = phase.kind === 'hold' ? t(`trip_phase_hold_${trip.mode}`) : trip.mode === 'horse' ? t('trip_phase_ride') : t('trip_phase_road');

  const cards = flow.animals.map((a) => animalCard(ui, flow, a, stop, refs));

  const body = [
    h('header', { class: 'trip-head' },
      h('div', { class: 'trip-title' }, h('span', { class: 'trip-mode' }, modeDef.emoji), h('b', {}, t('trip_title', { from: flow.fromName(), to: flow.destName() })))),
    svg,
    h('div', { class: 'trip-times' },
      h('div', {}, h('small', {}, t('trip_elapsed')), refs.elapsed),
      h('div', {}, h('small', {}, t('trip_remaining')), refs.remaining)),
  ];
  if (stop) {
    const ride = trip.mode === 'horse' && stop.kind === 'rest' ? '_ride' : '';
    const kindDesc = stop.kind === 'night' && stop.slept ? 'morning' : `${stop.kind}${ride}`;
    body.push(h('section', { class: `trip-stop ${stop.kind}` },
      h('h3', {}, t(`trip_stop_${stop.kind}${ride}`)),
      h('p', {}, t(`trip_stopd_${kindDesc}`)),
      h('div', { class: 'row wrap trip-group' },
        h('button', { onClick: () => groupAction(ui, flow, 'water') }, t('trip_allWater')),
        h('button', { onClick: () => groupAction(ui, flow, 'feed') }, t('trip_allFeed')))));
  } else {
    body.push(h('p', { class: 'trip-phase' }, phaseText, ' ', refs.next));
  }
  body.push(h('div', { class: 'trip-animals' }, cards));
  if (stop) {
    const night = stop.kind === 'night' && !stop.slept;
    body.push(h('div', { class: 'trip-actions-main' },
      night
        ? h('button', { class: 'primary big', onClick: () => { flow.handleEvents(sleepAtStop(trip, flow.animals).events); renderJourney(ui, flow); } }, t('trip_sleep'))
        : h('button', { class: 'primary big', disabled: !canContinue(trip), onClick: () => { continueTrip(trip, flow.animals); renderJourney(ui, flow); } }, `${modeDef.emoji} ${t('trip_continue')}`),
      ['rest', 'night'].includes(stop.kind) && !stop.slept
        ? h('button', { class: 'trip-skip', onClick: () => { skipStop(trip, flow.animals); ui.toast(t('trip_skipped'), 4000); renderJourney(ui, flow); } }, night ? t('trip_skipNight') : t('trip_skipStop'))
        : null));
  } else {
    refs.tip = h('div', { class: 'trip-tip' }, h('b', {}, t('trip_tipLabel')), h('span', {}, t(`trip_tip_${j.tips[j.tipIndex % j.tips.length]}`)));
    body.push(refs.tip);
    body.push(h('div', { class: 'trip-controls' },
      h('span', {}, t('trip_speed')),
      [1, 3, 8].map((s) => h('button', { class: `small ${j.speed === s ? 'active' : ''}`, onClick: () => { j.speed = s; renderJourney(ui, flow); } }, `×${s}`)),
      h('button', { class: 'small trip-ff', onClick: () => fastForward(ui, flow) }, t('trip_fastForward'))));
  }
  el.replaceChildren(h('div', { class: `trip-sheet ${stop ? 'at-stop' : 'moving'}` }, body));
  ui.tripRefs = refs;
  placeRoute(flow, refs);
  updateJourney(ui, flow);
}

function animalCard(ui, flow, a, stop, refs) {
  const trip = flow.journey.trip;
  const lvl = stressLevel(a.stress ?? 0);
  const thirst = tripBar('💧', t('need_thirst'), a.needs.thirst);
  const hunger = tripBar('🍖', t('need_hunger'), a.needs.hunger);
  const stress = tripBar('😰', t('trip_stress'), a.stress ?? 0, false);
  const comfort = tripBar('🛋️', t('trip_comfort'), trip.comfort[a.id] ?? 80);
  const chip = h('span', { class: `chip trip-lv ${lvl}` }, ta(`trip_lv_${lvl}`, a));
  refs.bars.push({ a, thirst, hunger, stress, comfort, chip, lvl });
  const actions = stop ? h('div', { class: 'trip-acts' }, STOP_ACTIONS.map((act) => {
    const can = canStopAction(trip, a, act);
    const doneAct = can.reason === 'done';
    const label = act === 'feed' && ['horse', 'cow', 'sheep', 'goat'].includes(a.species) ? `${t('trip_act_feed')} 🌾` : t(`trip_act_${act}`);
    return h('button', {
      class: `trip-act ${can.ok ? '' : 'off'} ${doneAct ? 'done' : ''}`,
      disabled: doneAct,
      onClick: () => {
        const r = doStopAction(trip, a, act);
        if (!r.ok) return ui.toast(ta(`trip_r_${r.reason}`, a), 5000);
        flow.game.entities.get(a.id)?.emit(STOP_ACTION_EMOJI[act]);
        if (r.finding) ui.toast(ta(`trip_f_${r.finding}`, a), 5000);
        renderJourney(ui, flow);
        return null;
      },
    }, h('span', { class: 'trip-act-icon' }, doneAct ? '✅' : STOP_ACTION_EMOJI[act]), h('small', {}, label));
  })) : null;
  return h('div', { class: `trip-animal ${a.sick ? 'sick' : ''}` },
    h('div', { class: 'trip-animal-head' }, h('span', { class: 'trip-animal-emoji' }, SPECIES[a.species].emoji), h('b', {}, a.name), chip),
    h('div', { class: 'trip-bars' }, thirst.el, hunger.el, stress.el, comfort.el),
    actions);
}

function groupAction(ui, flow, act) {
  const trip = flow.journey.trip;
  let n = 0;
  for (const a of flow.animals) if (doStopAction(trip, a, act).ok) n++;
  ui.toast(n ? t('doneAll', { n }) : t('trip_r_done'));
  renderJourney(ui, flow);
}

/** « Aller jusqu'à l'arrivée » : la fin du trajet se fait toute seule, avec les soins minimum. */
function fastForward(ui, flow) {
  const j = flow.journey;
  flow.handleEvents(runToEnd(j.trip, flow.animals));
  flow.finish();
}

/** Place les repères sur la route (le SVG doit être dans la page). */
function placeRoute(flow, refs) {
  const r = refs.route;
  const trip = flow.journey.trip;
  const len = r.road.getTotalLength();
  const at = (f) => r.road.getPointAtLength(Math.max(0, Math.min(1, f)) * len);
  const put = (n, f, dy = -14) => {
    const p = at(f);
    n.setAttribute('x', p.x);
    n.setAttribute('y', p.y + dy);
  };
  put(r.start, 0, 0);
  put(r.end, 1, 0);
  const total = trip.totalHours || 1;
  for (const { s, n } of r.stopMarks) put(n, s.at / total, -15);
  const hold = trip.phases.find((p) => p.kind === 'hold');
  if (hold && r.holdPath) {
    const a = (hold.start / total) * len;
    const b = (hold.end / total) * len;
    r.holdPath.setAttribute('stroke-dasharray', `0 ${a} ${b - a} ${len}`);
    put(r.holdMark, (hold.start + hold.end) / 2 / total, 16);
  }
  r.len = len;
}

/** Mise à jour légère (4 fois par seconde) : temps, barres, véhicule sur la route, conseils. */
export function updateJourney(ui, flow) {
  const refs = ui.tripRefs;
  const j = flow.journey;
  if (!refs || !j || j.report) return;
  const trip = j.trip;
  refs.elapsed.textContent = fmtHours(trip.elapsed);
  refs.remaining.textContent = fmtHours(remainingHours(trip));
  const next = nextStop(trip);
  refs.next.textContent = next && trip.status === 'moving' ? `· ${t('trip_nextStop', { t: fmtHours(next.at - trip.elapsed) })}` : '';
  const r = refs.route;
  if (r.len) {
    const f = progress(trip);
    const p = r.road.getPointAtLength(f * r.len);
    // Dans la soute : le véhicule devient un avion ou un bateau sur la carte.
    const icon = phaseAt(trip).kind === 'hold' ? (trip.mode === 'plane' ? '✈️' : '⛴️') : r.roadIcon;
    if (r.vehicle.textContent !== icon) r.vehicle.textContent = icon;
    r.vehicle.setAttribute('x', p.x);
    r.vehicle.setAttribute('y', p.y - 2);
    r.done.setAttribute('stroke-dasharray', `${f * r.len} ${r.len}`);
  }
  for (const b of refs.bars) {
    b.thirst.set(b.a.needs.thirst);
    b.hunger.set(b.a.needs.hunger);
    b.stress.set(b.a.stress ?? 0);
    b.comfort.set(trip.comfort[b.a.id] ?? 80);
    const lvl = stressLevel(b.a.stress ?? 0);
    if (lvl !== b.lvl) {
      b.lvl = lvl;
      b.chip.className = `chip trip-lv ${lvl}`;
      b.chip.textContent = ta(`trip_lv_${lvl}`, b.a);
    }
  }
  // Un nouveau conseil toutes les 8 secondes.
  if (refs.tip && trip.status === 'moving') {
    j.tipAcc = (j.tipAcc ?? 0) + 0.25;
    if (j.tipAcc >= 8) {
      j.tipAcc = 0;
      j.tipIndex += 1;
      refs.tip.lastChild.textContent = t(`trip_tip_${j.tips[j.tipIndex % j.tips.length]}`);
    }
  }
}

// ------------------------------------------------------------ bilan

export function showReport(ui, flow, report) {
  const el = overlay(ui);
  el.hidden = false;
  ui.tripRefs = null;
  const j = flow.journey;
  const stopsMade = j.trip.stops.filter((s) => s.done).length;
  const lines = report.animals.map(({ a, level, sick }) => h('li', { class: `trip-rep ${sick ? 'sick' : level}` },
    ta(sick ? 'trip_rep_sick' : `trip_rep_${level}`, a)));
  el.replaceChildren(h('div', { class: 'trip-sheet report enter' },
    h('header', { class: 'trip-head' }, h('div', { class: 'trip-title' }, h('span', { class: 'trip-mode' }, '🏁'), h('b', {}, t('trip_arrivedTitle', { place: flow.destName() })))),
    h('div', { class: 'trip-report-facts' },
      h('span', { class: 'chip' }, t('trip_reportTime', { t: fmtHours(report.hours) })),
      j.trip.stops.length ? h('span', { class: 'chip' }, t('trip_reportStops', { n: stopsMade, s: report.skipped })) : null,
      report.animals.length ? h('span', { class: 'chip' }, t('trip_reportCare', { n: report.cares })) : null),
    report.animals.length ? h('ul', { class: 'trip-rep-list' }, lines) : h('p', {}, t('trip_rep_none')),
    (report.tips ?? []).map((k) => tipBox(k)),
    h('button', { class: 'primary big', onClick: () => flow.close() }, 'OK')));
}

// ------------------------------------------------------------ panneau Voyager

/**
 * Conseils sous le choix du transport : qui reste chez le voisin (un choix positif !),
 * le véhicule qui attendra dans la cour, les pauses prévues, la soute, et l'alerte « long trajet ».
 */
export function travelAdvice(ui, { here, travelers, state, option }) {
  const out = [];
  const stay = here.length - travelers.length;
  if (here.length) {
    out.push(h('div', { class: `trip-stayhome ${stay ? 'yes' : ''}` },
      h('span', {}, stay ? t('trip_stayHome', { n: stay }) : t('trip_stayHomeNone')),
      travelers.length ? h('button', { class: 'small', onClick: () => { state.bring.clear(); ui.renderPanel(); } }, t('trip_leaveAll')) : null));
  }
  if (!option?.ok || !travelers.length) return out;
  const notes = [];
  const vehicle = vehicleFor(option.mode, travelers);
  notes.push(t(`trip_vehicleNote_${vehicle}`));
  const plan = planTrip({ mode: option.mode, hours: option.hours, animals: travelers });
  const stops = plan.stops.filter((s) => s.kind === 'rest' || s.kind === 'night').length;
  if (stops) notes.push(t('trip_stopsNote', { n: stops }));
  if (option.mode === 'plane' || option.mode === 'boat') notes.push(t(`trip_holdNote_${option.mode}`));
  out.push(h('div', { class: 'trip-notes' }, notes.map((n) => h('p', { class: 'note' }, n))));
  if (isLongTrip(option.hours, option.mode)) {
    out.push(h('div', { class: 'trip-tip warn' }, h('span', {}, t('trip_longWarn', { t: fmtHours(plan.totalHours) }))));
  }
  return out;
}

// Écrans du voyage réaliste : choix du départ, écran du trajet (route, pauses, soins), bilan à l'arrivée,
// bandeau « Chargement 1/3 » et conseils dans le panneau Voyager.

import { h } from './dom.js';
import { t, ta } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { TRAVEL_MODES } from '../sim/places.js';
import {
  STOP_ACTIONS, STOP_ACTION_EMOJI, canStopAction, doStopAction, continueTrip, skipStop, sleepAtStop, canContinue,
  currentStop, nextStop, remainingHours, progress, stressLevel, tipsFor, phaseAt, runToEnd, planTrip, vehicleFor,
  isLongTrip, nightStopAhead, rideGait, RIDE_GAIT_ORDER,
} from '../sim/trip.js';
import { openVehicleMenu, openPackingModal, cargoSummary, cargoName } from './vehicle.js'; // véhicule, coffre
import { luggageHere, luggageEmoji } from '../sim/cargo.js';
import { thumb } from '../game/thumbScenes.js'; // vignette 3D du véhicule du voyage

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

/** Petite barre : `good` dit si une valeur haute est bonne (soif, faim, confort) ou mauvaise (stress) ; cls : sa classe. */
// Allures du voyage à cheval (boutons de la fiche du trajet).
const GAIT_ICON = { walk: '🐢', trot: '🐴', canter: '💨' };

function tripBar(icon, label, value, good = true, cls = '') {
  const v = Math.round(value);
  const score = good ? v : 100 - v;
  const level = score >= 60 ? 'good' : score >= 30 ? 'mid' : 'low';
  const fill = h('span', { class: `bar-fill ${level}`, style: { width: `${v}%` } });
  const val = h('span', { class: 'trip-bar-val' }, v);
  const el = h('div', { class: `trip-bar ${cls}`, title: label },
    h('span', { class: 'trip-bar-label' }, `${icon} `, h('span', { class: 'trip-bar-name' }, label)),
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
  const loose = flow.unsecured().length;
  return [h('div', { class: 'status-chip trip-chip' },
    h('span', {}, `${l.vehicle.kind === 'trailer' ? '🚐' : '🚗'} ${t('trip_loadingChip', { n: l.loaded.size, total })} · ${names}${loose ? ` · ⚠️ ${loose}` : ''}`),
    h('button', { class: 'small primary', onClick: () => openVehicleMenu(ui, flow) }, t('veh_menuBtn')),
    h('button', { class: 'small', onClick: () => flow.cancel() }, t('cancel')))];
}

// ------------------------------------------------------------ choix au départ

export function showDepartChoice(ui, flow) {
  const l = flow.loading;
  const animals = flow.travellers(l.ids);
  const tips = tipsFor(planTrip({ mode: l.mode, hours: l.check.hours, animals, cargo: l.cargo?.items }), animals);
  const choose = (watch) => { ui.hideModal(); flow.depart(watch); };
  // Sans véhicule (à cheval, ou seul) : les bagages se préparent ici (sacoches, sac).
  const bags = !l.vehicle && l.cargo ? h('div', { class: 'trip-bags' },
    h('span', {}, `${l.mode === 'horse' ? '🎒' : '🧳'} ${cargoSummary(flow)}`),
    h('button', { class: 'small', onClick: () => { ui.hideModal(); openPackingModal(ui, flow, () => showDepartChoice(ui, flow)); } }, t('veh_editBags'))) : null;
  const title = l.vehicle ? t('trip_watchTitle') : l.mode === 'horse' ? t('trip_horseGo') : animals.length ? t('trip_watchTitle') : t('veh_aloneTitle');
  // Depuis la cabine seulement par la route : en avion ou en bateau, le véhicule ne va que jusqu'au port ou à l'aéroport.
  const cab = !!l.vehicle && (l.mode === 'car' || l.mode === 'van');
  ui.showModal([
    h('p', { class: 'trip-modal-title' }, title),
    bags,
    animals.length ? h('div', { class: 'trip-choice' },
      h('button', { class: 'big-action primary', onClick: () => choose(true) },
        h('span', { class: 'ba-text' }, h('b', {}, t(cab ? 'veh_watchCab' : 'trip_watch')), h('small', {}, t(cab ? 'veh_watchCabDesc' : 'trip_watchDesc')))),
      h('button', { class: 'big-action', onClick: () => choose(false) },
        h('span', { class: 'ba-text' }, h('b', {}, t('trip_skip')), h('small', {}, t('trip_skipDesc')))))
      : h('div', { class: 'trip-choice' }, h('button', { class: 'big-action primary', onClick: () => choose(false) },
        h('span', { class: 'ba-text' }, h('b', {}, `${t('trip_goAlone')} ${flow.destName()}`)))),
    tipBox(tips[0]),
    h('div', { class: 'row end' }, h('button', {
      onClick: () => {
        ui.hideModal();
        // Avec le véhicule : on n'annule pas tout, on redescend juste (le pont se rabaisse).
        if (l.vehicle) {
          if (l.vehicle.trailer) { l.vehicle.setOpen('ramp', true); l.vehicle.setOpen('upper', true); }
        } else flow.cancel();
      },
    }, l.vehicle ? t('veh_notYet') : t('cancel'))),
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
  // Vue 3D du trajet (game/RoadView.js) : de la cabine, de dehors, ou dans le van ; à cheval (game/TrailView.js) :
  // derrière le cavalier, en selle, ou autour.
  const rv = j.road ?? j.trail;
  const cams = j.trail ? [['behind', '🎥', 'trail_camBehind'], ['rider', '🏇', 'trail_camRider'], ['side', '🔄', 'trail_camSide']]
    : [['cab', '🚙', 'veh_camCab'], ['outside', '🎥', 'veh_camOutside'], ...(j.vehicle?.trailer ? [['trailer', '🐴', 'veh_camTrailer']] : [])];
  const camList = rv ? cams
    .map(([mode, icon, key]) => h('button', { class: `small ${rv.cameraMode === mode ? 'active' : ''}`, onClick: () => { rv.setCameraMode(mode); renderJourney(ui, flow); } }, `${icon} ${t(key)}`)) : [];
  // On peut replier la fiche pour regarder la route : pendant qu'on roule, et aussi aux pauses sur un téléphone
  // (sur un grand écran, la fiche est rangée à droite : elle reste dépliée aux pauses).
  const compact = !!rv && (j.compact ?? (!stop || window.innerWidth < 900));
  // Pause, fiche repliée : l'essentiel pour s'occuper des animaux (cartes qui défilent de côté), le véhicule reste visible.
  const brief = compact && !!stop;
  const fold = rv ? h('button', { class: 'small trip-fold', 'aria-label': t(compact ? 'veh_more' : 'veh_less'), onClick: () => { j.compact = !compact; renderJourney(ui, flow); } }, compact ? `▴ ${t('veh_more')}` : `▾ ${t('veh_less')}`) : null;

  const body = brief ? [h('div', { class: 'trip-cams' }, camList)] : [
    h('header', { class: 'trip-head' },
      h('div', { class: 'trip-title' }, h('span', { class: 'trip-mode' }, modeDef.emoji), h('b', {}, t('trip_title', { from: flow.fromName(), to: flow.destName() }))),
      fold),
    rv ? h('div', { class: 'trip-cams' }, camList) : null,
    svg,
    h('div', { class: 'trip-times' },
      h('div', {}, h('small', {}, t('trip_elapsed')), refs.elapsed),
      h('div', {}, h('small', {}, t('trip_remaining')), refs.remaining)),
  ];
  if (stop) {
    const ride = trip.mode === 'horse' && stop.kind === 'rest' ? '_ride' : '';
    const kindDesc = stop.kind === 'night' && stop.slept ? 'morning' : `${stop.kind}${ride}`;
    body.push(h('section', { class: `trip-stop ${stop.kind}` },
      h('div', { class: 'trip-stop-head' }, h('h3', {}, t(`trip_stop_${stop.kind}${ride}`)),
        brief ? h('small', { class: 'trip-next', title: t('trip_remaining') }, '🏁 ', refs.remaining) : null, brief ? fold : null),
      brief ? null : h('p', {}, t(`trip_stopd_${kindDesc}`)),
      h('div', { class: 'row wrap trip-group' },
        h('button', { onClick: () => groupAction(ui, flow, 'water') }, t('trip_allWater')),
        h('button', { onClick: () => groupAction(ui, flow, 'feed') }, t('trip_allFeed')))));
  } else {
    body.push(h('p', { class: 'trip-phase' }, phaseText, ' ', refs.next));
    // À cheval : l'allure (le galop fait arriver plus vite mais fatigue le cheval ; flèches ↑ ↓ au clavier).
    if (trip.mode === 'horse') {
      const cur = rideGait(trip);
      const rider = flow.animals.find((a) => a.id === trip.riderId);
      refs.energy = rider ? tripBar('⚡', t('need_energy'), rider.needs.energy, true, 'energy') : null;
      refs.rider = rider ?? null;
      body.push(h('div', { class: 'trip-gaits', role: 'group', 'aria-label': t('trail_gait') },
        h('span', {}, t('trail_gait')),
        RIDE_GAIT_ORDER.map((g) => h('button', {
          class: `small ${cur === g ? 'active' : ''}`,
          'aria-pressed': cur === g ? 'true' : 'false',
          onClick: () => flow.setGait(g),
        }, `${GAIT_ICON[g]} ${t(`trail_gait_${g}`)}`)),
        refs.energy ? refs.energy.el : null,
        matchMedia('(pointer: fine)').matches ? h('small', { class: 'trip-gait-keys' }, t('trail_keys')) : null));
    }
  }
  if (!compact || brief) body.push(h('div', { class: `trip-animals ${brief ? 'strip' : ''}` }, cards));
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
    if (!compact) body.push(refs.tip);
    else refs.tip = null;
    body.push(h('div', { class: 'trip-controls' },
      h('span', {}, t('trip_speed')),
      [1, 3, 8].map((s) => h('button', { class: `small ${j.speed === s ? 'active' : ''}`, onClick: () => { j.speed = s; renderJourney(ui, flow); } }, `×${s}`)),
      h('button', { class: 'small trip-ff', onClick: () => fastForward(ui, flow) }, t('trip_fastForward'))));
  }
  // (après un soin, la fiche est redessinée : on garde l'endroit où on était, en haut et dans les cartes de côté)
  const key = `${trip.status}-${trip.stopIndex}-${compact}`;
  const same = el.firstChild?.dataset?.key === key;
  const keep = same ? { top: el.firstChild.scrollTop, left: el.querySelector('.trip-animals.strip')?.scrollLeft ?? 0 } : {};
  el.replaceChildren(h('div', { class: `trip-sheet ${stop ? 'at-stop' : 'moving'} ${compact ? 'compact' : ''} ${brief ? 'brief' : ''} ${rv ? 'with-road' : ''}`, 'data-key': key }, body));
  if (keep.top) el.firstChild.scrollTop = keep.top;
  const strip = keep.left && el.querySelector('.trip-animals.strip');
  if (strip) strip.scrollLeft = keep.left;
  el.classList.toggle('with-road', !!rv);
  ui.tripRefs = refs;
  placeRoute(flow, refs);
  updateJourney(ui, flow);
}

function animalCard(ui, flow, a, stop, refs) {
  const trip = flow.journey.trip;
  const lvl = stressLevel(a.stress ?? 0);
  const thirst = tripBar('💧', t('need_thirst'), a.needs.thirst, true, 'thirst');
  const hunger = tripBar('🍖', t('need_hunger'), a.needs.hunger, true, 'hunger');
  const stress = tripBar('😰', t('trip_stress'), a.stress ?? 0, false, 'stress');
  const comfort = tripBar('🛋️', t('trip_comfort'), trip.comfort[a.id] ?? 80, true, 'comfort');
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
        // Sans eau ni foin dans le coffre : on attend l'étape du soir… ou l'arrivée s'il n'y en a pas.
        const later = ['noWater', 'noHay', 'noBowls'].includes(r.reason) && !nightStopAhead(trip) ? 'Arrive' : '';
        if (!r.ok) return ui.toast(ta(`trip_r_${r.reason}${later}`, a), 5000);
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

/** Place les repères sur la route (le SVG doit être dans la page ; il n'y est pas dans la fiche repliée d'une pause). */
function placeRoute(flow, refs) {
  const r = refs.route;
  if (!r.svg.isConnected) return;
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
  if (refs.energy && refs.rider) refs.energy.set(refs.rider.needs.energy);
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
  el.classList.remove('with-road'); // le bilan se lit au milieu de l'écran
  ui.tripRefs = null;
  const j = flow.journey;
  const stopsMade = j.trip.stops.filter((s) => s.done).length;
  const lines = report.animals.map(({ a, level, sick }) => h('li', { class: `trip-rep ${sick ? 'sick' : level}` },
    ta(sick ? 'trip_rep_sick' : `trip_rep_${level}`, a)));
  el.replaceChildren(h('div', { class: 'trip-sheet report enter' },
    h('header', { class: 'trip-head' }, h('div', { class: 'trip-title' }, h('span', { class: 'trip-mode' }, '🏁'), h('b', {}, t('trip_arrivedTitle', { place: flow.destName() })))),
    h('div', { class: 'trip-report-facts' },
      h('span', { class: 'chip' }, t('trip_reportTime', { t: fmtHours(report.hours) })),
      j.trip.stops.length ? h('span', { class: 'chip' }, t('trip_reportStops', { made: t('trip_stopsMade', { n: stopsMade }), skipped: t('trip_stopsSkipped', { n: report.skipped }) })) : null,
      report.animals.length ? h('span', { class: 'chip' }, t('trip_reportCare', { n: report.cares })) : null),
    report.animals.length ? h('ul', { class: 'trip-rep-list' }, lines) : h('p', {}, t('trip_rep_none')),
    luggageLine(report),
    (report.tips ?? []).map((k) => tipBox(k)),
    h('button', { class: 'primary big', onClick: () => flow.close() }, 'OK')));
}

/** Le coffre est arrivé avec nous : ce qu'on a emporté (utilisable ici), le reste est à la maison. */
function luggageLine(report) {
  if (!report.cargo) return null;
  const ids = Object.keys(report.cargo);
  if (report.home) return h('p', { class: 'trip-luggage' }, t('veh_repHome'));
  return h('div', { class: 'trip-luggage' },
    h('b', {}, t('veh_repLuggage')),
    h('span', {}, ids.length ? ids.map((id) => `${luggageEmoji(id)} ${cargoName(id)}`).join(' · ') : t('veh_nothingPacked')),
    h('small', {}, t('veh_repLeftHome')));
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
  // En voyage : le matériel qu'on a avec soi ici (sim/cargo.js).
  const here2 = luggageHere(ui.game.profile);
  if (here2) {
    out.push(h('p', { class: 'note trip-luggage' }, t('veh_withYouHere', { list: here2.map((x) => x.emoji).join(' ') || t('veh_nothingPacked') })));
  }
  if (!option?.ok || !travelers.length) return out;
  const notes = [];
  const vehicle = vehicleFor(option.mode, travelers);
  // Le véhicule qu'on prendra (4x4 et van, ou voiture et caisses), en vignette avec sa phrase.
  const ride = { trailer: ['rig', '🚐'], car: ['car', '🚗'] }[vehicle];
  if (ride) {
    out.push(h('div', { class: 'trip-vehicle' },
      thumb(ui.game, { kind: 'vehicle', id: ride[0] }, { w: 110, h: 66, emoji: ride[1], cls: 'veh-thumb', alt: '' }),
      h('p', { class: 'note' }, t(`trip_vehicleNote_${vehicle}`))));
  } else notes.push(t(`trip_vehicleNote_${vehicle}`));
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

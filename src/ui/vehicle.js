// Interface du véhicule de voyage (src/game/TripFlow.js) :
//   - le menu du véhicule (faire monter un animal, coffre, compartiment, volant, annuler) ;
//   - le panneau du bas pendant les vues dans le véhicule : cheval qui hésite devant le pont,
//     étapes de sécurité dans le compartiment, cabine (Partir / Descendre), coffre de transport.

import { h } from './dom.js';
import { t, ta } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { cargoItems, cargoItem, CARGO_KINDS, cargoUsed, canPack, pack, unpack, inCargo, suggestCargo, available, missingSupplies, fitsTraveller } from '../sim/cargo.js';
import { packCompetitionTack, missingCompetitionTack } from '../sim/competitions.js'; // voyage au concours : selle et filet
import { GEAR } from '../sim/gear.js';
import { stallSteps, canStep, CONFIDENCE_OK } from '../sim/loading.js';
import { hasTool } from '../sim/tools.js';

/** Nom d'un objet du coffre (provision, équipement ou outil) ; l'équipement avec sa taille (« Selle mixte (Poney) »). */
export function cargoName(id) {
  const it = cargoItem(id);
  if (!it) return id;
  if (it.kind === 'supply') return t(`cargo_${id}`);
  if (it.kind === 'gear') return GEAR[it.gear].sizes?.length > 1 ? `${t(`gear_${it.gear}`)} (${t(`tk_size_${it.fit}`)})` : t(`gear_${it.gear}`);
  return t(`tool_${id}`);
}

const STEP_ICON = { breastBar: '🛡️', rearBar: '🚧', tie: '🪢' };

// ------------------------------------------------------------ menu du véhicule

/** Le menu du véhicule (toucher le van, ou le bouton d'action). */
export function openVehicleMenu(ui, flow) {
  const l = flow.loading;
  if (!l?.vehicle) return;
  const v = l.vehicle;
  const go = (fn) => () => { ui.hideModal(); fn(); };
  const big = (icon, title, sub, fn, cls = '') => h('button', { class: `big-action ${cls}`, onClick: go(fn) },
    h('span', { class: 'ba-icon' }, icon), h('span', { class: 'ba-text' }, h('b', {}, title), sub ? h('small', {}, sub) : null));
  const acts = [];
  for (const a of flow.waiting()) {
    if (flow.placeOf(a) === 'trailer') {
      acts.push(big(SPECIES[a.species].emoji, ta('veh_leadIn', a), ta(a.following ? 'veh_leadInNow' : 'veh_leadInFetch', a), () => flow.leadIn(a), 'primary'));
    } else {
      acts.push(big('📦', ta('veh_crateIt', a), t(v.trailer ? 'veh_crateItSubVan' : 'veh_crateItSub'), () => flow.crateNow(a), 'primary'));
    }
  }
  if (v.trailer) {
    const loose = flow.unsecured().length;
    acts.push(big('🔒', t('veh_stallView'), loose ? t('veh_stallLoose', { n: loose }) : t('veh_stallSub'), () => flow.setView('stall')));
  }
  acts.push(big('🧳', t(v.trailer ? 'veh_tackView' : 'veh_roofView'), t('veh_cargoUsed', { n: cargoUsed(l.cargo), max: l.capacity }), () => flow.setView('tack')));
  const left = flow.waiting().length;
  acts.push(big(v.trailer ? '🚙' : '🚗', t('veh_cabView'), left ? t('veh_cabWaiting', { n: left }) : t('veh_cabReady'), () => flow.setView('cab'), left ? '' : 'primary'));
  ui.showModal([
    h('p', { class: 'trip-modal-title' }, t(v.trailer ? 'veh_menuTitleVan' : 'veh_menuTitleCar', { place: flow.destName() })),
    h('div', { class: 'action-sheet veh-menu' }, acts),
    h('div', { class: 'row end' },
      h('button', { class: 'danger', onClick: go(() => flow.cancel()) }, t('veh_cancelTrip')),
      h('button', { onClick: () => ui.hideModal() }, t('close'))),
  ]);
}

// ------------------------------------------------------------ panneau des vues

function overlay(ui) {
  if (!ui.vehEl) {
    ui.vehEl = h('div', { id: 'veh-overlay', hidden: true });
    ui.root.append(ui.vehEl);
  }
  return ui.vehEl;
}

/** Dessine le panneau du bas selon la vue (rampe, compartiment, cabine, coffre), ou le cache. */
export function renderVehiclePanel(ui, flow) {
  const el = overlay(ui);
  const l = flow.loading;
  const view = l?.view ?? null;
  document.body.classList.toggle('veh-view', !!view);
  if (!view) {
    el.hidden = true;
    el.replaceChildren();
    return;
  }
  el.hidden = false;
  const redraw = () => renderVehiclePanel(ui, flow);
  let body;
  if (view === 'ramp') body = rampBody(ui, flow);
  else if (view === 'stall') body = stallBody(ui, flow, redraw);
  else if (view === 'cab') body = cabBody(ui, flow);
  else body = trunkBody(ui, flow, redraw, () => flow.setView(null));
  el.replaceChildren(h('div', { class: `veh-sheet ${view}` }, body));
}

/** Le cheval monte… ou hésite devant le pont : le rassurer, une friandise, patienter. */
function rampBody(ui, flow) {
  const w = flow.loading.walk;
  const a = w?.a;
  if (!a) return [];
  if (!w.hesitating) {
    return [h('p', { class: 'veh-title' }, `${SPECIES[a.species].emoji} ${ta('veh_walkingIn', a)}`), h('p', { class: 'veh-hint' }, ta('veh_walkingInHint', a))];
  }
  const conf = flow.loading.conf.get(a.id)?.conf ?? 0;
  const treats = hasTool(flow.game.profile, 'treats');
  const btn = (icon, key, how, extra = {}) => h('button', { class: 'veh-act', onClick: () => flow.encourageLoad(how), ...extra },
    h('span', { class: 'veh-act-icon' }, icon), h('small', {}, t(key)));
  return [
    h('p', { class: 'veh-title' }, `${SPECIES[a.species].emoji} ${ta('veh_hesitates', a)}`),
    h('p', { class: 'veh-hint' }, t(a.species === 'horse' ? 'veh_hesitatesHint' : 'veh_hesitatesHintOther')),
    h('div', { class: 'veh-meter', title: t('veh_confidence') },
      h('span', {}, `🤝 ${t('veh_confidence')}`),
      h('span', { class: 'bar-track' }, h('span', { class: `bar-fill ${conf >= CONFIDENCE_OK ? 'good' : conf >= 35 ? 'mid' : 'low'}`, style: { width: `${Math.min(100, (conf / CONFIDENCE_OK) * 100)}%` } }))),
    h('div', { class: 'veh-acts' },
      btn('🤲', 'veh_reassure', 'reassure'),
      btn('🍪', treats ? 'veh_treat' : 'veh_treatNone', 'treat', { class: `veh-act ${treats ? '' : 'off'}` }),
      btn('⏳', 'veh_wait', 'wait'),
      h('button', { class: 'veh-act ghost', onClick: () => flow.giveUpLoad() }, h('span', { class: 'veh-act-icon' }, '↩️'), h('small', {}, t('veh_giveUp')))),
  ];
}

/** Compartiment : pour chaque place, les étapes de sécurité dans l'ordre. */
function stallBody(ui, flow, redraw) {
  const l = flow.loading;
  const v = l.vehicle;
  const rows = [];
  const many = v.stallUse.filter((x) => x.length).length > 2;
  // Places vides : seulement autant que de grands animaux encore à faire monter (moins de lignes sur téléphone).
  let freeLeft = flow.waiting().filter((a) => flow.placeOf(a) === 'trailer').length;
  v.trailer.stalls.forEach((st, i) => {
    const ids = v.stallUse[i];
    const animals = ids.map((id) => flow.game.profile.animals.find((x) => x.id === id)).filter(Boolean);
    const state = flow.stallState(i);
    const who = animals.length ? animals.map((a) => `${SPECIES[a.species].emoji} ${a.name}`).join(' · ') : t('veh_stallFree');
    // Une place libre : on peut déjà fermer sa barre de poitrail (avant de faire monter le cheval).
    const steps = animals.length ? stallSteps(animals[0]) : ['breastBar'];
    if (!animals.length && freeLeft-- <= 0) return;
    const buttons = steps.map((step) => {
      const done = !!state[step];
      const can = animals.length ? canStep(state, animals[0], step) : { ok: !done, reason: done ? 'done' : null };
      return h('button', {
        class: `veh-step ${done ? 'done' : can.ok ? 'next' : 'off'}`,
        onClick: () => { flow.stallStep(i, step); redraw(); },
      }, h('span', {}, done ? '✅' : STEP_ICON[step]), h('small', {}, t(`veh_step_${step}`)));
    });
    rows.push(h('div', { class: 'veh-stall' },
      h('div', { class: 'veh-stall-head' }, h('b', {}, t('veh_place', { n: i + 1 })), h('span', {}, who)),
      h('div', { class: 'veh-steps' }, buttons)));
  });
  // L'ordre des étapes, pour le premier grand animal du van (ou le prochain qui montera).
  const first = v.passengerAt(v.stallUse.findIndex((x) => x.length)) ?? flow.nextToStall() ?? { species: 'horse' };
  const order = stallSteps(first).includes('tie') ? 'veh_stallOrder' : 'veh_stallOrderNoTie';
  return [
    h('p', { class: 'veh-title' }, `🔒 ${t('veh_stallTitle')}`),
    h('p', { class: 'veh-hint' }, t(order, { who: flow.whoText(first) })),
    h('div', { class: `veh-stalls ${many ? 'many' : ''}` }, rows),
    h('p', { class: 'veh-hint small' }, t(inCargo(l.cargo, 'hay') ? 'veh_hayFull' : 'veh_hayEmpty')),
    h('div', { class: 'row end' }, h('button', { class: 'primary', onClick: () => flow.setView(null) }, t('veh_leaveStall'))),
  ];
}

/** Au volant : on vérifie que tout est prêt, puis on part (ou on redescend). */
function cabBody(ui, flow) {
  const l = flow.loading;
  const v = l.vehicle;
  const total = l.ids.length;
  const left = flow.waiting().length;
  const loose = v.trailer ? flow.unsecured().length : 0;
  const missing = missingSupplies(l.cargo, flow.travellers(l.ids));
  const line = (ok, text) => h('li', { class: ok ? 'ok' : 'warn' }, `${ok ? '✅' : '⚠️'} ${text}`);
  const tack = competitionTackLine(flow);
  return [
    h('p', { class: 'veh-title' }, `${v.trailer ? '🚙' : '🚗'} ${t('veh_cabTitle')}`),
    h('ul', { class: 'veh-checks' },
      line(!left, t('veh_checkAnimals', { n: total - left, total })),
      v.trailer ? line(!loose, loose ? t('veh_checkLoose', { n: loose }) : t('veh_checkSecured')) : null,
      line(!missing.length, missing.length ? t('veh_checkSupplies', { list: missing.map(cargoName).join(', ') }) : t('veh_checkCargo', { n: cargoUsed(l.cargo), max: l.capacity })),
      tack ? line(tack.ok, tack.text) : null),
    v.trailer && l.loaded.size ? h('p', { class: 'veh-hint small' }, t('veh_cabCamera')) : h('p', { class: 'veh-hint small' }, t('veh_cabLook')),
    h('div', { class: 'veh-cab-btns' },
      h('button', { class: 'primary big', onClick: () => flow.departCheck() }, `🏁 ${t('veh_go')}`),
      h('button', { class: 'big', onClick: () => flow.setView(null) }, `🚪 ${t('veh_getOut')}`)),
  ];
}

/**
 * Le coffre de transport : ce qu'on emporte, avec la place qui reste.
 * onClose : bouton « Fermer le coffre ».
 */
export function trunkBody(ui, flow, redraw, onClose) {
  const l = flow.loading;
  const p = flow.game.profile;
  const cargo = l.cargo;
  const used = cargoUsed(cargo);
  const travellers = flow.travellers(l.ids);
  const missing = missingSupplies(cargo, travellers, l.mode);
  const items = cargoItems();
  const shown = (it) => it.kind === 'supply' || inCargo(cargo, it.id) > 0 || available(p, it.id) > 0;
  const groups = CARGO_KINDS.map((kind) => {
    const list = items.filter((it) => it.kind === kind && shown(it));
    if (!list.length) return null;
    return h('div', { class: 'veh-cargo-group' },
      h('h4', {}, t(`veh_kind_${kind}`)),
      list.map((it) => {
        const n = inCargo(cargo, it.id);
        const can = canPack(p, cargo, it.id, l.capacity);
        // Équipement : à qui il va parmi les voyageurs (la bonne taille : une selle poney pour le poney).
        const fits = it.kind === 'gear' ? travellers.filter((a) => fitsTraveller(it.id, a)).map((a) => a.name) : [];
        return h('div', { class: `veh-cargo-row ${n ? 'in' : ''}` },
          h('span', { class: 'veh-cargo-emoji' }, it.emoji),
          h('span', { class: 'veh-cargo-name' }, h('b', {}, cargoName(it.id)),
            h('small', {}, `${t('veh_size', { n: it.size })}${it.kind === 'gear' ? ` · ${t('veh_free', { n: available(p, it.id) })}` : ''}`),
            fits.length ? h('small', { class: 'veh-fits' }, `✓ ${t('veh_fitsFor', { names: fits.join(', ') })}`) : null),
          h('span', { class: 'veh-cargo-count' }, n ? `×${n}` : ''),
          h('button', { class: 'small', disabled: !n, 'aria-label': '−', onClick: () => { unpack(cargo, it.id); flow.cargoChanged(); redraw(); } }, '−'),
          h('button', {
            class: `small ${can.ok ? 'primary' : ''}`,
            'aria-label': '+',
            onClick: () => {
              const r = pack(p, cargo, it.id, l.capacity);
              if (!r.ok) ui.toast(t(`veh_pack_${r.reason}`));
              flow.cargoChanged();
              redraw();
            },
          }, '+'));
      }));
  });
  const pct = Math.min(100, (used / l.capacity) * 100);
  return [
    h('p', { class: 'veh-title' }, `🧳 ${t(l.vehicle ? (l.vehicle.trailer ? 'veh_trunkTitle' : 'veh_roofTitle') : (l.mode === 'horse' ? 'veh_bagsTitle' : 'veh_luggageTitle'))}`),
    h('p', { class: 'veh-hint' }, t('veh_trunkHint')),
    h('div', { class: 'veh-meter' },
      h('span', {}, t('veh_cargoUsed', { n: used, max: l.capacity })),
      h('span', { class: 'bar-track' }, h('span', { class: `bar-fill ${pct >= 100 ? 'low' : pct > 75 ? 'mid' : 'good'}`, style: { width: `${pct}%` } }))),
    missing.length ? h('p', { class: 'veh-warn' }, t('veh_missingSupplies', { list: missing.map(cargoName).join(', ') })) : null,
    tackNote(flow),
    h('div', { class: 'row wrap veh-cargo-tools' },
      h('button', {
        class: 'small',
        onClick: () => {
          l.cargo = suggestCargo(p, travellers, l.capacity, { last: null, mode: l.mode });
          // Voyage au concours : la selle et le filet de chaque cheval inscrit, à sa taille.
          if (l.purpose === 'competition') packCompetitionTack(p, l.cargo, travellers.filter((a) => a.species === 'horse'), l.capacity, l.entry?.comp.discipline);
          flow.cargoChanged();
          redraw();
        },
      }, `✨ ${t('veh_suggest')}`),
      h('button', { class: 'small', onClick: () => { l.cargo.items = {}; flow.cargoChanged(); redraw(); } }, `🗑️ ${t('veh_empty')}`)),
    h('div', { class: 'veh-cargo' }, groups),
    // (toujours visible en bas du panneau : pas besoin de faire défiler toute la liste pour refermer)
    h('div', { class: 'row end veh-close' }, h('button', { class: 'primary', onClick: onClose }, `✔ ${t(l.vehicle ? 'veh_closeTrunk' : 'veh_bagsReady')}`)),
  ];
}

/**
 * Voyage au concours (src/game/TripFlow.js, beginCompetitionTrip) : la selle et le filet de chaque cheval
 * inscrit sont-ils là, à sa taille (portés ou dans le coffre) ? Renvoie { ok, text } ou null (autre voyage).
 */
function competitionTackLine(flow) {
  const l = flow.loading;
  if (l?.purpose !== 'competition') return null;
  const miss = missingCompetitionTack(l.cargo, flow.travellers(l.ids), l.entry?.comp.discipline);
  if (!miss.length) return { ok: true, text: t('comp_tackOk') };
  const what = miss.map((m) => t('comp_tackMissingItem', { name: m.a.name, item: t(`comp_slot_${m.slot}`), size: m.size ? t(`tk_size_${m.size}`) : '' })).join(', ');
  return { ok: false, text: t('comp_tackMissingShort', { what }) };
}

function tackNote(flow) {
  const line = competitionTackLine(flow);
  if (!line) return null;
  return h('p', { class: line.ok ? 'veh-hint comp-tack-ok' : 'veh-warn' }, `🏆 ${line.text}`);
}

/** Bagages sans véhicule (à cheval : les sacoches ; seul : un sac) : le coffre dans une fenêtre. */
export function openPackingModal(ui, flow, onClose) {
  const render = () => ui.showModal(trunkBody(ui, flow, render, () => { ui.hideModal(); onClose?.(); }));
  render();
}

/** Résumé des bagages (pour le choix du départ). */
export function cargoSummary(flow) {
  const l = flow.loading;
  const list = Object.entries(l.cargo.items).map(([id, n]) => `${cargoItem(id)?.emoji ?? ''}${n > 1 ? `×${n}` : ''}`).join(' ');
  return `${list || t('veh_nothingPacked')} · ${t('veh_cargoUsed', { n: cargoUsed(l.cargo), max: l.capacity })}`;
}

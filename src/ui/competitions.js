// Interface des concours à l'extérieur et de l'entraînement de dressage : calendrier des concours
// (plusieurs lieux), inscription, « Mes inscriptions » (partir en véhicule), le site du concours
// (échauffement, participer), résultats avec podium, carrière sportive sur la fiche du cheval.
// Logique : src/sim/competitions.js, src/sim/dressage.js ; 3D : src/game/CompetitionVenue.js, src/game/Dressage.js.

import { h, bar } from './dom.js';
import { t, ta, L } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { PLACES, checkTravel } from '../sim/places.js';
import { isSandbox, spend, addStat } from '../sim/profile.js';
import {
  DISCIPLINES, calendar, competitionData, eligibleForCompetition, canRegister, register, entryState, upcomingEntries,
  bestResults, titleFor, fitsDiscipline, LEVELS,
} from '../sim/competitions.js';
import { cooldownLeft, dressageSkill, learnFactor } from '../sim/dressage.js';
import { awardEl } from './activities.js';

const TIER_ICON = { gold: '🏆', silver: '🥈', bronze: '🥉' };
const levelName = (c) => t(`actv_level_${c.levelId ?? LEVELS[c.level - 1]}`);
const discName = (d) => t(`actv_type_${d}`);
export const eventTitle = (c) => `${PLACES[c.place]?.flag ?? ''} ${L(c.name)}`;

/** « 🚐 ~6 h de route » entre ici et le lieu du concours (ou avion / bateau s'il faut traverser la mer). */
function travelText(g, placeId) {
  if (placeId === g.profile.place) return t('comp_here');
  for (const mode of ['van', 'plane']) {
    const c = checkTravel(g.profile.place, placeId, mode, [], false);
    if (c.ok) return t('comp_travelTime', { h: Math.max(1, Math.round(c.hours)), emoji: mode === 'van' ? '🚐' : '✈️' });
  }
  return '';
}

const whenText = (g, day) => {
  const d = day - g.day;
  if (d === 0) return t('actv_today', { from: 10, to: 18 });
  if (d === 1) return t('actv_tomorrow');
  return t('actv_inDays', { n: d, day });
};

// ---------------------------------------------------------------- calendrier et inscriptions

/** Section « 🚗 Concours ailleurs » du calendrier des activités : inscriptions en cours, puis les prochains concours. */
export function awayCalendar(ui) {
  const g = ui.game;
  const p = g.profile;
  const out = [h('h3', {}, `🚗 ${t('comp_awayTitle')}`), h('p', { class: 'note' }, t('comp_awayHelp'))];
  const mine = upcomingEntries(p);
  if (mine.length) {
    out.push(h('h4', {}, `📌 ${t('comp_myEntries')}`));
    out.push(h('div', { class: 'cards' }, mine.map((e) => entryCard(ui, e))));
  }
  const list = calendar(g.day, 21).filter((c) => !(c.day === g.day && g.hour >= c.close));
  out.push(h('div', { class: 'cards' }, list.slice(0, 14).map((c) => {
    const entered = competitionData(p).entries.some((e) => e.id === c.id);
    const block = entered ? 'already' : canRegister(p, c, ['?'], { day: g.day, hour: g.hour });
    return h('div', { class: `card actv-comp comp-card ${block ? '' : 'open'} ${entered ? 'entered' : ''}` },
      h('span', { class: 'card-emoji' }, DISCIPLINES[c.discipline]?.icon ?? '🏆'),
      h('span', { class: 'card-main' },
        h('b', {}, eventTitle(c)),
        h('small', {}, `${discName(c.discipline)} · ${levelName(c)}`),
        h('small', {}, `${t('day', { n: c.day })} · ${whenText(g, c.day)} · ${travelText(g, c.place)}`),
        h('small', {}, isSandbox(p) ? t('actv_prizesSandbox') : t('actv_prizes', { fee: c.fee, a: c.prizes[0], b: c.prizes[1], c: c.prizes[2] }))),
      block
        ? h('span', { class: 'lock' }, t(`comp_reg_${block}`))
        : h('button', { class: 'primary', onClick: () => openRegister(ui, c) }, t('comp_register')));
  })));
  return out;
}

/** Une inscription : où on en est, et le bouton pour partir ou aller à la carrière. */
function entryCard(ui, e) {
  const g = ui.game;
  const c = e.comp;
  const state = entryState(e, { day: g.day, hour: g.hour, place: g.profile.place });
  const names = e.animalIds.map((id) => g.profile.animals.find((a) => a.id === id)?.name).filter(Boolean).join(', ');
  let action = null;
  if (state === 'travel') {
    action = h('button', { class: 'primary', onClick: () => { if (g.tripFlow.beginCompetitionTrip(e)) ui.closePanel(); } }, `🚐 ${t('comp_goTrip')}`);
  } else if (state === 'today') {
    action = h('button', { class: 'primary', onClick: () => { ui.closePanel(); g.walkTo(g.venue.gate(), 1.5, () => ui.openBuilding('showground')); } }, `🏁 ${t('comp_goArena')}`);
  }
  return h('div', { class: 'card actv-comp comp-entry' },
    h('span', { class: 'card-emoji' }, DISCIPLINES[c.discipline]?.icon ?? '🏆'),
    h('span', { class: 'card-main' },
      h('b', {}, eventTitle(c)),
      h('small', {}, `${discName(c.discipline)} · ${levelName(c)} · ${t('day', { n: c.day })} (${whenText(g, c.day)})`),
      h('small', {}, `${t('comp_with')} ${names || '—'}`),
      h('small', { class: 'comp-state' }, t(`comp_entry_${state}`, { h: c.open }))),
    action ?? h('span', { class: 'lock' }, state === 'wait' ? '⏳' : '📍'));
}

/** Fenêtre d'inscription : on choisit les animaux (ceux qui sont ici et qui font la discipline). */
export function openRegister(ui, comp) {
  const g = ui.game;
  const p = g.profile;
  const here = g.animalsHere().filter((a) => fitsDiscipline(a, comp.discipline));
  const picked = new Set(here.filter((a) => !eligibleForCompetition(a, comp.discipline)).slice(0, 1).map((a) => a.id));
  const render = () => {
    const block = canRegister(p, comp, [...picked], { day: g.day, hour: g.hour });
    ui.modal.querySelector('.modal-box').replaceChildren(h('div', { class: 'comp-register' },
      h('h3', {}, `${DISCIPLINES[comp.discipline].icon} ${eventTitle(comp)}`),
      h('p', { class: 'note' }, `${discName(comp.discipline)} · ${levelName(comp)} · ${t('day', { n: comp.day })} · ${travelText(g, comp.place)}`),
      h('p', { class: 'note' }, isSandbox(p) ? t('comp_feeSandbox') : t('comp_fee', { fee: comp.fee, a: comp.prizes[0] })),
      here.length ? h('div', { class: 'checks' }, here.map((a) => {
        const why = eligibleForCompetition(a, comp.discipline);
        return h('label', { class: 'check' },
          h('input', { type: 'checkbox', checked: picked.has(a.id), onChange: (ev) => { if (ev.target.checked) picked.add(a.id); else picked.delete(a.id); render(); } }),
          ` ${SPECIES[a.species].emoji} ${a.name}`,
          why ? h('small', { class: 'comp-why' }, ` — ${ta(`comp_why_${why}`, a)}`) : null);
      })) : h('p', { class: 'warn' }, t('comp_noFit')),
      h('p', { class: 'note' }, t('comp_formHelp')),
      h('div', { class: 'row end' },
        h('button', { onClick: () => ui.hideModal() }, t('cancel')),
        h('button', {
          class: 'primary',
          disabled: !!block,
          onClick: () => {
            if (!spend(p, comp.fee)) return ui.toast(t('r_money'));
            register(p, comp, [...picked]);
            addStat(p, 'compRegistered');
            g.save();
            ui.hideModal();
            ui.toast(t('comp_registered', { name: L(comp.name), day: comp.day }), 6000);
            if (comp.place !== p.place) ui.toast(t('comp_registeredTrip', { place: L(PLACES[comp.place].name) }), 9000);
            g.venue?.refresh(false);
            ui.renderPanel();
          },
        }, block ? t(`comp_reg_${block}`) : `✅ ${t('comp_register')}`))));
  };
  ui.showModal([h('div')]);
  render();
}

// ---------------------------------------------------------------- sur place : le site du concours

/** Bandeau du concours du jour (en haut du menu des activités) : échauffement, participer. */
export function venueBanner(ui) {
  const g = ui.game;
  const v = g.venue;
  if (!v?.entry) return [];
  const e = v.entry;
  const c = e.comp;
  return [h('button', { class: 'card comp-banner', onClick: () => openVenuePanel(ui, v) },
    h('span', { class: 'card-emoji' }, DISCIPLINES[c.discipline].icon),
    h('span', { class: 'card-main' }, h('b', {}, `🏆 ${eventTitle(c)}`), h('small', {}, `${discName(c.discipline)} · ${levelName(c)} · ${e.done ? t('comp_state_done') : t('comp_state_today')}`)),
    h('span', { class: 'card-side' }, '▶️'))];
}

/** La fenêtre du concours sur place : tes animaux inscrits, leur forme, échauffement et départ. */
export function openVenuePanel(ui, venue) {
  const g = ui.game;
  ui.openPanel({
    title: () => `🏆 ${L(venue.event?.name ?? { fr: '', en: '' })}`,
    kind: 'venue',
    live: true,
    render: () => {
      const e = venue.entry;
      if (!e) return [h('p', { class: 'note' }, t('comp_block_none'))];
      const c = e.comp;
      const out = [
        h('div', { class: 'chips' },
          h('span', { class: 'chip' }, `${DISCIPLINES[c.discipline].icon} ${discName(c.discipline)}`),
          h('span', { class: 'chip' }, levelName(c)),
          h('span', { class: 'chip' }, `🕙 ${c.open} h – ${c.close} h`),
          isSandbox(g.profile) ? null : h('span', { class: 'chip' }, `🪙 ${c.prizes.join(' / ')}`)),
      ];
      if (e.done) {
        const r = competitionData(g.profile).results.find((x) => x.id === e.id);
        out.push(h('p', { class: 'note' }, r ? t('comp_doneLine', { n: r.rank, name: r.animalName }) : t('comp_state_done')));
        out.push(h('div', { class: 'grid' },
          h('button', { class: 'primary', onClick: () => { ui.closePanel(); ui.openTravel(); } }, `🧭 ${t('comp_travelBack')}`),
          h('button', { onClick: () => ui.closePanel() }, `🌳 ${t('comp_stay')}`)));
        return out;
      }
      const block = venue.openBlock();
      out.push(h('p', { class: 'note' }, block ? t(`comp_block_${block}`, { h: c.open }) : t('comp_venueHelp')));
      const animals = venue.animalsEntered();
      if (!animals.length) out.push(h('p', { class: 'warn' }, t('comp_noAnimalsHere')));
      out.push(h('div', { class: 'cards' }, animals.map((a) => {
        const why = venue.readiness(a);
        return h('div', { class: `card comp-athlete ${why ? 'locked' : ''}` },
          h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
          h('span', { class: 'card-main' },
            h('b', {}, a.name),
            why ? h('small', { class: 'actv-warn' }, ta(`comp_why_${why}`, a)) : h('small', { class: 'good' }, `✅ ${t('comp_ready')}${a.warmedUp === g.day ? ` · 🔥 ${t('comp_warmedUp')}` : ''}`),
            h('div', { class: 'bars small' }, ['hunger', 'thirst', 'energy'].map((n) => bar(t(`need_${n}`), a.needs[n]))),
            h('div', { class: 'row wrap' },
              a.species === 'horse' ? h('button', { class: 'small', disabled: !!why || !!block, onClick: () => venue.warmUp(a) }, `🔥 ${t('comp_warmup')}`) : null,
              h('button', { class: 'primary', disabled: !!why || !!block, onClick: () => venue.compete(a) }, `🏁 ${t('comp_compete')}`))));
      })));
      out.push(h('p', { class: 'note' }, t('comp_careTip')));
      return out;
    },
  });
}

/** Résultats d'un concours : classement, coupe ou flot, argent, titre, photo du podium. */
export function showCompetitionResults(ui, r) {
  const c = r.comp;
  const res = r.result;
  const lines = [];
  if (c.discipline === 'jumping' || c.discipline === 'agility') {
    lines.push(`⏱️ ${t('actv_time', { n: res.time })}`, `❌ ${t('actv_faults', { n: res.total })}`);
    if (r.jumpOff) lines.push(`⚡ ${t('comp_jumpOffLine', { n: r.jumpOff.player.total, s: r.jumpOff.player.time })}`);
  } else if (c.discipline === 'dressage') {
    lines.push(`🎯 ${t('dr_total', { n: res.percent })}`);
  } else {
    lines.push(`⭐ ${t('actv_points', { n: res.points })}`);
  }
  const close = (fn) => () => { ui.hideModal(); fn?.(); };
  const score = (x) => (c.discipline === 'jumping' || c.discipline === 'agility'
    ? `${x.total} · ${x.time} s${x.jo ? ` ⚡ ${x.jo.total} · ${x.jo.time} s` : ''}`
    : c.discipline === 'dressage' ? `${x.points} %` : t('actv_points', { n: x.points }));
  ui.showModal([
    h('div', { class: 'actv-result comp-result' },
      h('h2', {}, `${r.rank <= 3 ? TIER_ICON[['gold', 'silver', 'bronze'][r.rank - 1]] : '🎀'} ${r.rank <= 3 ? t('actv_podium', { n: r.rank }) : t('actv_ranked', { n: r.rank })}`),
      h('p', { class: 'actv-who' }, `${eventTitle(c)} · ${discName(c.discipline)} ${levelName(c)}`),
      h('p', { class: 'actv-who' }, `${SPECIES[r.animal.species].emoji} ${r.animal.name}`),
      r.photo ? h('img', { class: 'comp-photo', src: r.photo, alt: t('actv_sight_podium') }) : null,
      h('ul', { class: 'actv-lines' }, lines.map((x) => h('li', {}, x)),
        r.newTitle ? h('li', { class: 'good' }, `🏅 ${ta('comp_newTitle', r.animal, { title: t(`comp_title_${r.newTitle}`) })}`) : null),
      h('table', { class: 'actv-table' }, h('tbody', {}, r.table.map((x) => h('tr', { class: x.you ? 'you' : '' },
        h('td', {}, x.rank <= 3 ? TIER_ICON[['gold', 'silver', 'bronze'][x.rank - 1]] : String(x.rank)),
        h('td', {}, `${SPECIES[x.species]?.emoji ?? ''} ${x.you ? t('actv_you') : x.name} & ${x.animal}`),
        h('td', {}, score(x)))))),
      r.award ? h('div', { class: 'actv-won' }, awardEl(r.award, true), h('b', {}, t(r.award.kind !== 'trophy' ? 'actv_wonRibbon' : r.award.tier === 'gold' ? 'actv_wonTrophy' : 'actv_wonMedal'))) : null,
      r.money ? h('p', { class: 'actv-money' }, `🪙 +${r.money}`) : null,
      h('div', { class: 'row end' },
        h('button', { onClick: close(r.onTravel) }, `🧭 ${t('comp_travelBack')}`),
        h('button', { class: 'primary', onClick: close(r.onClose) }, t('actv_done')))),
  ]);
}

// ---------------------------------------------------------------- fiche du cheval : carrière sportive

/** Section « 🏅 Carrière sportive » de la fiche d'un cheval : compétences, titre, meilleurs résultats, inscriptions. */
export function competitionSection(ui, a) {
  const g = ui.game;
  const p = g.profile;
  if (a.species !== 'horse') return [];
  const title = titleFor(p, a.id);
  const best = bestResults(p, a.id);
  const entries = upcomingEntries(p).filter((e) => e.animalIds.includes(a.id));
  const results = competitionData(p).results.filter((r) => r.animalId === a.id);
  return [
    h('h3', {}, `🏅 ${t('comp_career')}`),
    title ? h('p', { class: 'comp-title' }, `🏅 ${t(`comp_title_${title}`)}`) : null,
    h('div', { class: 'bars small' },
      bar(`🎠 ${t('skill_dressage')}`, dressageSkill(a)),
      bar(`🏇 ${t('skill_jump')}`, a.skills.jump ?? 0),
      bar(`🧭 ${t('skill_endurance')}`, a.skills.endurance ?? 0)),
    Object.keys(best).length
      ? h('ul', { class: 'comp-best' }, Object.values(best).map((r) => h('li', {}, `${DISCIPLINES[r.discipline]?.icon ?? ''} ${discName(r.discipline)} : ${t('actv_rank', { n: r.rank })} · ${t(`actv_level_${LEVELS[r.level - 1]}`)} · ${PLACES[r.place]?.flag ?? ''} ${t('day', { n: r.day })}`)))
      : h('p', { class: 'note' }, t('comp_noResults')),
    results.length ? h('p', { class: 'note' }, t('comp_resultsCount', { n: results.length, p: results.filter((r) => r.rank <= 3).length })) : null,
    entries.length ? h('p', { class: 'note' }, `📌 ${entries.map((e) => `${eventTitle(e.comp)} (${t('day', { n: e.comp.day })})`).join(' · ')}`) : null,
    h('div', { class: 'grid' },
      h('button', { class: 'act', onClick: () => ui.openActivities({ pick: 'flat', animal: a }) }, `🎠 ${t('actv_type_flat')}`),
      h('button', { class: 'act', onClick: () => ui.openActivities({ pick: 'figures', animal: a }) }, `🔤 ${t('actv_type_figures')}`),
      h('button', { class: 'act', onClick: () => ui.openActivities({ pick: 'dressage', animal: a }) }, `🎠 ${t('actv_type_dressage')}`),
      h('button', { class: 'act', onClick: () => ui.openActivities({ tab: 'calendar' }) }, `📅 ${t('actv_tabCalendar')}`)),
  ];
}

/** Carte d'un cheval pour une séance d'entraînement : apprend-il bien ? faut-il attendre ? */
export function trainingCard(ui, a, type) {
  const g = ui.game;
  const left = type === 'dressage' ? 0 : cooldownLeft(a, type, g.profile.clock);
  const { factor, reasons } = learnFactor(a);
  const learn = reasons.length ? reasons.map((r) => ta(`dr_learn_${r}`, a)).join(' · ') : t('dr_learnWell');
  return h('button', {
    class: `card ${left ? 'locked' : ''}`,
    onClick: () => {
      if (left) return ui.toast(ta('dr_cooldown', a, { n: left }), 4000);
      g.activities.start(type, { animal: a });
    },
  },
  h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
  h('span', { class: 'card-main' }, h('b', {}, a.name),
    h('div', { class: 'bars small' }, bar(t('skill_dressage'), dressageSkill(a)), bar(t('skill_obedience'), a.skills.obedience ?? 0)),
    left ? h('small', { class: 'actv-warn' }, ta('dr_cooldown', a, { n: left })) : h('small', { class: factor < 1 ? 'actv-warn' : '' }, `${factor < 1 ? '😴' : '😀'} ${learn}`)),
  h('span', { class: 'card-side' }, left ? '⏳' : '▶️'));
}

/** Bouton du journal vers le calendrier des concours. */
export function journalCalendarButton(ui) {
  const n = upcomingEntries(ui.game.profile).length;
  return h('button', { class: 'small comp-journal', onClick: () => ui.openActivities({ tab: 'calendar' }) }, `📅 ${t('actv_tabCalendar')}${n ? ` (${n})` : ''}`);
}

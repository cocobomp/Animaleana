// 🧭 Guide de randonnée (interface) : la demande des visiteurs en bulles de discussion
// (comme src/ui/helperChat.js), la liste à cocher avant de partir, le carnet du métier
// et la fenêtre de résultats. Logique : src/sim/trailGuide.js ; 3D : src/game/TrailGuide.js.

import { h } from './dom.js';
import { t, L } from '../i18n.js';
import { PLACES } from '../sim/places.js';
import { SPECIES } from '../sim/species.js';
import { isSandbox } from '../sim/profile.js';
import {
  TRAIL_GUIDE_CAREER, RANK_IDS, GROUPS, ROUTES, tgState, rankOf, rankProgress, perksOf, horseFit, gearFit, isPony, riderMood,
} from '../sim/trailGuide.js';

const placeName = (id) => L(PLACES[id]?.name) || id;
const LEVEL_EMOJI = { beginner: '🌱', medium: '🌿', confirmed: '🌳' };
const AGE_EMOJI = { child: '🧒', adult: '🧑', senior: '👵' };

/** Une puce « Léa 🧒 · débutante · enfant ». */
function riderChip(r) {
  return h('span', { class: 'tg-rider' },
    h('b', {}, `${AGE_EMOJI[r.age]} ${r.name}`),
    h('small', {}, `${LEVEL_EMOJI[r.level]} ${t(`tg_level_${r.level}`, { g: r.sex })} · ${t(`tg_weight_${r.weight}`)}`));
}

// ---------------------------------------------------------------- la demande (chat)

export function openBookingChat(ui, tg) {
  const g = ui.game;
  const b = tgState(g.profile).offer;
  if (!b) return;
  const log = [];
  const say = (who, text) => log.push({ who, text });
  const beginners = b.riders.filter((r) => r.level === 'beginner').length;
  const first = b.riders[0];
  const hello = b.riders.length === 1
    ? t('tg_hello_one', { dur: t(`tg_dur_${b.duration}`), level: t(`tg_level_${first.level}`, { g: first.sex }), price: b.price })
    : t('tg_hello', { dur: t(`tg_dur_${b.duration}`), n: b.riders.length, beginners: beginners ? t('tg_beginners', { n: beginners }) : t('tg_noBeginner'), price: b.price });
  say('them', hello);
  const here = b.place === g.profile.place && b.day === g.day;
  say('them', here ? `${ROUTES[b.route]?.emoji ?? '🚩'} ${t('tg_hereToday')}` : `${PLACES[b.place]?.flag ?? ''} ${t('tg_elsewhere', { place: placeName(b.place), n: b.day - g.day })}`);
  if (b.dogsWelcome) say('them', t('tg_withDogs'));
  const state = { done: false };
  const scrollDown = () => requestAnimationFrame(() => {
    const el = document.querySelector('.hc-log');
    if (el) el.scrollTop = el.scrollHeight;
  });

  const answer = (accept) => {
    if (state.done) return;
    state.done = true;
    if (accept) {
      const already = tgState(g.profile).bookings.length;
      if (already >= 2) {
        state.done = false;
        return ui.toast(t('tg_fullBooked'), 4000);
      }
      say('me', t('tg_accept'));
      const accepted = tg.accept();
      say('them', here ? t('tg_acceptedReply') : t('tg_acceptedAway', { place: placeName(b.place), day: b.day }));
      ui.renderPanel();
      scrollDown();
      if (accepted && here) setTimeout(() => !ui.panel || ui.panel.kind !== 'tg-prep' ? openTrailPrep(ui, tg) : null, 1200);
    } else {
      say('me', t('tg_refuse'));
      say('them', t('tg_refusedReply'));
      ui.renderPanel();
      scrollDown();
      setTimeout(() => { tg.refuse(); if (ui.panel?.kind === 'tg-chat') ui.closePanel(); }, 1200);
    }
  };

  ui.openPanel({
    title: `${GROUPS[b.group]?.emoji ?? '🧭'} ${t(`tg_group_${b.group}`)}`,
    kind: 'tg-chat',
    render: () => [
      h('div', { class: 'hc-head' },
        h('span', { class: 'hc-avatar' }, GROUPS[b.group]?.emoji ?? '🧭'),
        h('div', { class: 'hc-id' },
          h('b', {}, t('tg_title')),
          h('small', {}, `${t(`tg_durShort_${b.duration}`)} · ${b.riders.length} 🏇 · ${b.price} 🪙 · ${PLACES[b.place]?.flag ?? ''} ${placeName(b.place)}`))),
      h('div', { class: 'hc-log' }, log.map((l) => h('div', { class: `hc-msg ${l.who}` }, l.text))),
      h('h3', {}, t('tg_ridersTitle')),
      h('div', { class: 'tg-riders' }, b.riders.map(riderChip)),
      state.done ? null : h('div', { class: 'hc-actions' },
        h('button', { class: 'hc-btn primary', onClick: () => answer(true) }, h('span', {}, '✅'), ` ${t('tg_accept')}`),
        h('button', { class: 'hc-btn', onClick: () => answer(false) }, h('span', {}, '❌'), ` ${t('tg_refuse')}`)),
    ],
  });
  scrollDown();
}

// ---------------------------------------------------------------- préparer la balade

export function openTrailPrep(ui, tg) {
  const g = ui.game;
  const b = tg.booking;
  if (!b) return openTrailCarnet(ui);
  tg.tutorial('prepare'); // explication la première fois (carnet)
  const state = { pickFor: null }; // 'guide' | rider.id
  const horses = () => tg.horses();
  const horseName = (id) => horses().find((x) => x.id === id)?.name ?? '?';
  const entityOf = (id) => g.entities.get(id) ?? null;
  const tackSpot = () => {
    const d = g.world.interactables.find((i) => i.kind === 'tackroom') ?? g.world.interactables.find((i) => i.kind === 'lodge');
    return d ? { x: d.x, z: d.z } : null;
  };
  const showBtn = (target) => (target ? h('button', { class: 'small tg-show', onClick: () => tg.showMe(target) }, `👉 ${t('quest_showMe')}`) : null);

  const horsePicker = () => {
    const forGuide = state.pickFor === 'guide';
    const rider = forGuide ? null : b.riders.find((r) => r.id === state.pickFor);
    if (!forGuide && !rider) return null;
    const taken = new Set([...b.riders.filter((r) => r !== rider).map((r) => r.horseId), forGuide ? null : b.guideHorseId].filter(Boolean));
    const cards = horses().map((a) => {
      const fit = forGuide ? { ok: true } : horseFit(a, rider);
      const busy = taken.has(a.id);
      const why = busy ? t('tg_reason_sameHorse') : fit.ok ? '' : t(`tg_reason_${fit.reason}`);
      return h('button', {
        class: `card tg-horse ${fit.ok && !busy ? '' : 'locked'}`,
        onClick: () => {
          if (busy || !fit.ok) return ui.toast(why, 4000);
          if (forGuide) b.guideHorseId = a.id; else rider.horseId = a.id;
          state.pickFor = null;
          g.save();
          ui.renderPanel();
        },
      },
      h('span', { class: 'card-emoji' }, isPony(a) ? '🐴' : '🐎'),
      h('span', { class: 'card-main' }, h('b', {}, a.name),
        h('small', {}, `${isPony(a) ? t('tg_pony') : L(SPECIES.horse.breeds.find((x) => x.id === a.breed)?.name)} · ${t('p_' + a.personality, { g: a.sex })} · 🎓 ${Math.round(a.skills.obedience)} · ❤️ ${Math.round(a.bond ?? 0)}`),
        why ? h('small', { class: 'tg-why' }, why) : null),
      h('span', { class: 'card-side' }, fit.ok && !busy ? '✅' : '⚠️'));
    });
    return h('div', { class: 'tg-picker' },
      h('h3', {}, forGuide ? t('tg_item_guideHorseNone') : t('tg_item_horseNone', { rider: rider.name })),
      ...(cards.length ? cards : [h('p', { class: 'note' }, t('tg_noHorses'))]),
      h('button', { class: 'small', onClick: () => { state.pickFor = null; ui.renderPanel(); } }, t('cancel')));
  };

  const line = (ok, label, extra = null, why = null) => h('div', { class: `tg-check ${ok ? 'ok' : ''}` },
    h('span', { class: 'tg-box' }, ok ? '✅' : '⬜'),
    h('span', { class: 'tg-label' }, h('b', {}, label), why ? h('small', { class: 'tg-why' }, why) : null),
    h('span', { class: 'tg-tools' }, extra));

  ui.openPanel({
    title: `🧭 ${t('tg_prepTitle')}`,
    kind: 'tg-prep',
    live: true,
    render: () => {
      const check = tg.checklist(b);
      const picker = horsePicker();
      if (picker) return [picker];
      const rows = [];
      for (const r of b.riders) {
        const it = check.items.find((x) => x.id === 'horse' && x.rider === r);
        const horse = it?.horse ?? null;
        rows.push(line(it?.ok, horse ? t('tg_item_horse', { rider: r.name, horse: horse.name }) : t('tg_item_horseNone', { rider: r.name }),
          [h('button', { class: 'small', onClick: () => { state.pickFor = r.id; ui.renderPanel(); } }, t('tg_pick')), horse ? showBtn(entityOf(horse.id)) : null],
          it?.ok ? `${LEVEL_EMOJI[r.level]} ${t(`tg_level_${r.level}`, { g: r.sex })} · ${t(`tg_weight_${r.weight}`)}` : it?.reason ? t(`tg_reason_${it.reason}`) : null));
        const gi = check.items.find((x) => x.id === 'gear' && x.rider === r);
        if (gi) {
          rows.push(line(gi.ok, t(gi.led ? 'tg_item_gearLed' : 'tg_item_gear', { horse: horse.name }),
            [gi.ok ? null : h('button', { class: 'small', onClick: () => { ui.closePanel(); ui.openAnimalActions(horse); } }, '📋'), gi.ok ? null : showBtn(entityOf(horse.id))],
            gi.ok ? null : t(`tg_reason_${gi.reason}`)));
        }
      }
      const same = check.items.find((x) => x.id === 'sameHorse');
      if (same) rows.push(line(false, t('tg_reason_sameHorse')));
      const gh = check.items.find((x) => x.id === 'guideHorse');
      rows.push(line(gh.ok, gh.horse ? t('tg_item_guideHorse', { horse: gh.horse.name }) : t('tg_item_guideHorseNone'),
        [h('button', { class: 'small', onClick: () => { state.pickFor = 'guide'; ui.renderPanel(); } }, t('tg_pick')), gh.horse ? showBtn(entityOf(gh.horse.id)) : null],
        gh.ok ? null : gh.reason && gh.reason !== 'noHorse' ? t(`tg_reason_${gh.reason}`) : null));
      for (const k of ['water', 'snack']) {
        const it = check.items.find((x) => x.id === k);
        rows.push(line(it.ok, t(`tg_item_${k}`), it.ok ? null : [h('button', { class: 'small', onClick: () => tg.takeSupply(b, k) }, t('tg_takeAtTack')), showBtn(tackSpot())]));
      }
      const wi = check.items.find((x) => x.id === 'weather');
      rows.push(line(wi.ok, `${t('tg_item_weather')} · ${t(`w_${g.weather}`)} ${g.temperature} °C`, null, wi.ok ? null : t(`tg_reason_${wi.reason}`)));
      if (perksOf(g.profile).dogs && g.animalsHere().some((a) => a.species === 'dog')) {
        rows.push(h('label', { class: 'check tg-check' }, h('input', {
          type: 'checkbox', checked: !!b.prep.dogs, onChange: (e) => { b.prep.dogs = e.target.checked; g.save(); },
        }), ` ${t('tg_item_dogs')}`));
      }
      return [
        h('p', { class: 'note' }, t('tg_prepIntro')),
        h('div', { class: 'tg-riders' }, b.riders.map(riderChip)),
        h('div', { class: 'tg-list' }, rows),
        h('div', { class: 'row wrap' },
          h('button', { onClick: () => { tg.autoAssign(b); g.save(); ui.renderPanel(); } }, `✨ ${t('tg_autoAssign')}`),
          h('button', { class: `primary big ${check.ok ? '' : 'off'}`, onClick: () => tg.startRide(b) }, `🐎 ${t('tg_start')}`)),
        h('div', { class: 'row end' }, h('button', { class: 'small danger', onClick: async () => { if (await ui.confirm(t('tg_cancelConfirm'))) tg.cancelBooking(b); } }, t('tg_cancel'))),
      ];
    },
  });
}

// ---------------------------------------------------------------- le carnet du métier

export function openTrailCarnet(ui) {
  const g = ui.game;
  const p = g.profile;
  const tg = g.trailGuide;
  const st = tgState(p);
  ui.openPanel({
    title: `🧭 ${t('tg_title')}`,
    kind: 'tg-carnet',
    live: true,
    render: () => {
      const rank = rankOf(p);
      const pr = rankProgress(p);
      const out = [
        h('div', { class: 'hc-head' },
          h('span', { class: 'hc-avatar' }, '🧭'),
          h('div', { class: 'hc-id' },
            h('b', {}, t(`tg_rank_${RANK_IDS[rank]}`)),
            h('small', {}, `${t('tg_xp')} ${pr.xp} · ${pr.to === null ? t('tg_maxRank') : t('tg_nextRank', { n: pr.to })} · ⭐ ${t('tg_reputation')} ${st.reputation}`),
            h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: { width: `${Math.round(pr.ratio * 100)}%` } })))),
        h('p', { class: 'note' }, t(`tg_rankHelp_${RANK_IDS[rank]}`)),
      ];
      if (g.level < TRAIL_GUIDE_CAREER.level) out.push(h('p', { class: 'note tg-locked' }, `🔒 ${t('tg_level', { n: TRAIL_GUIDE_CAREER.level })}`));
      // Rendez-vous
      out.push(h('h3', {}, `📅 ${t('tg_bookings')}`));
      const here = tg.booking;
      if (!st.bookings.length && !st.offer) out.push(h('p', { class: 'note' }, g.level >= TRAIL_GUIDE_CAREER.level ? t('tg_noBooking') : t('tg_level', { n: TRAIL_GUIDE_CAREER.level })));
      for (const b of st.bookings) {
        out.push(h('div', { class: 'card' },
          h('span', { class: 'card-emoji' }, GROUPS[b.group]?.emoji ?? '🧭'),
          h('span', { class: 'card-main' }, h('b', {}, `${t(`tg_group_${b.group}`)} · ${t(`tg_durShort_${b.duration}`)}`),
            h('small', {}, b === here ? t('tg_bookingHere') : `${PLACES[b.place]?.flag ?? ''} ${t('tg_bookingAt', { place: placeName(b.place), day: b.day })}`),
            h('small', {}, `${b.riders.length} 🏇 · ${b.price} 🪙 · ${ROUTES[b.route]?.emoji ?? ''}`)),
          b === here ? h('button', { class: 'small primary', onClick: () => openTrailPrep(ui, tg) }, t('tg_prepareBtn')) : null));
      }
      if (st.offer && tg.visitorsFor === 'offer') out.push(h('button', { class: 'card', onClick: () => tg.talk() }, h('span', { class: 'card-emoji' }, '💬'), h('span', { class: 'card-main' }, h('b', {}, t('tg_chip_visitor')))));
      // Carnet des actions
      out.push(h('h3', {}, `📒 ${t('tg_carnet')}`));
      out.push(h('div', { class: 'tg-list' }, TRAIL_GUIDE_CAREER.actions.map((a) => h('div', { class: `tg-check ${st.seen.includes(a.id) ? 'ok' : ''}` },
        h('span', { class: 'tg-box' }, st.seen.includes(a.id) ? '✅' : '⬜'),
        h('span', { class: 'tg-label' }, h('b', {}, `${a.emoji} ${t(`ca_trailGuide_${a.id}`)}`), h('small', {}, t(`tg_tuto_${a.id}`)))))));
      // Historique
      out.push(h('h3', {}, `🏇 ${t('tg_history')}`));
      if (!st.history.length) out.push(h('p', { class: 'note' }, t('tg_noHistory')));
      for (const x of st.history.slice(0, 8)) {
        out.push(h('div', { class: 'tg-hist' },
          h('span', {}, '★'.repeat(x.stars) + '☆'.repeat(3 - x.stars)),
          h('span', {}, `${PLACES[x.place]?.flag ?? ''} ${t('day', { n: x.day })} · ${t('tg_historyLine', { group: t(`tg_group_${x.group}`), n: x.riders, money: x.pay + x.tip })}`)));
      }
      return out;
    },
  });
}

// ---------------------------------------------------------------- résultats

const pickComment = (mood, i) => `tg_c_${mood}_${(i % 3) + 1}`;

/** r : { booking, result, applied, gains, sandbox, rankName, onClose } */
export function showRideResult(ui, r) {
  const res = r.result;
  let guard = null;
  const close = () => { clearInterval(guard); ui.hideModal(); r.onClose?.(); };
  const box = h('div', { class: 'actv-result tg-result' },
      h('h2', {}, `🧭 ${t('tg_resultTitle')}`),
      h('div', { class: 'actv-stars', 'aria-label': `${res.stars}/3` }, Array.from({ length: 3 }, (_, i) => h('span', { class: i < res.stars ? 'on' : '' }, '★'))),
      h('ul', { class: 'tg-comments' }, res.comments.map((c, i) => h('li', { class: c.mood }, `${AGE_EMOJI[c.rider.age]} ${t(pickComment(c.mood, i), { name: c.rider.name })}`))),
      h('ul', { class: 'actv-lines' },
        h('li', {}, `😊 ${t('tg_result_fun')} : ${res.fun} %`),
        r.sandbox ? null : h('li', {}, `🪙 ${t('tg_result_pay')} : +${res.pay}${res.tip ? ` · ${t('tg_result_tip')} +${res.tip} 🎁` : ''}`),
        h('li', {}, `⭐ ${t('tg_result_rep')} : ${res.repDelta >= 0 ? '+' : ''}${res.repDelta} → ${r.applied.reputation}`),
        h('li', {}, `🧭 ${t('tg_result_xp')} : +${res.xp}`),
        res.photos ? h('li', {}, `📷 ${t('tg_result_photos')} : ${res.photos}`) : null,
        h('li', {}, t('tg_result_horses', { n: r.gains.endurance })),
        r.applied.rankUp ? h('li', { class: 'good' }, t('tg_rankUp', { rank: r.rankName })) : null),
      h('div', { class: 'row end' }, h('button', { class: 'primary', onClick: close }, t('actv_done'))));
  ui.showModal([box]);
  // Si une autre fenêtre (« Niveau supérieur ! ») passe par-dessus, on remontre le résultat après.
  guard = setInterval(() => {
    if (box.isConnected) return;
    if (!ui.modalOpen) ui.showModal([box]);
  }, 500);
}

export { riderMood, gearFit };

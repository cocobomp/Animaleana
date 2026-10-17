// Interface du concours de beauté : menu au terrain de concours, liste de préparation sur la fiche
// de l'animal (« Préparer pour le concours »), et les lignes du juge dans les résultats.
// Logique : src/sim/beauty.js ; 3D et présentation dans la carrière : src/game/Beauty.js.

import { h, bar } from './dom.js';
import { t, ta } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { isSandbox } from '../sim/profile.js';
import { competitionsAt, entryBlock, eligibility, rivals, activityData } from '../sim/activities.js';
import { PREP_ITEMS, RIBBON_COLORS, checklist, isReady, beautyScore, nowHours } from '../sim/beauty.js';
import { canLead } from '../sim/gear.js';
import { runMinigame } from './minigames.js';

const COLOR_EMOJI = { red: '🔴', pink: '🩷', blue: '🔵', yellow: '🟡', green: '🟢', purple: '🟣', white: '⚪' };
const PART_ICON = { presentation: '🎀', coat: '🧼', health: '💚', weight: '⚖️', calm: '🤝', allure: '🌟' };

/** Le prochain concours de beauté ici (dans les 15 jours). */
export function nextBeautyComp(g) {
  return competitionsAt(g.profile.place, g.isHome, g.day, 15).find((c) => c.type === 'beauty') ?? null;
}

const whenText = (g, c) => {
  const d = c.day - g.day;
  if (d === 0) return t('actv_today', { from: c.open, to: c.close });
  if (d === 1) return t('actv_tomorrow');
  return t('actv_inDays', { n: d, day: c.day });
};

/** Pourquoi cet animal ne peut pas entrer dans la carrière maintenant (null si c'est bon). */
export function beautyBlock(a) {
  const why = eligibility(a, 'beauty');
  if (why) return why;
  if (!canLead(a).ok) return 'needHalter';
  return null;
}

/** Grande barre « Beauté » avec son score. */
function scoreBar(a, now) {
  const { score } = beautyScore(a, now);
  return bar(`🎀 ${t('beauty_score')}`, score, 'big');
}

/** Petites pastilles : présentation, robe, santé, poids, calme, allure. */
function partsChips(a, now) {
  const { parts } = beautyScore(a, now);
  return h('div', { class: 'chips beauty-parts' }, Object.entries(parts).map(([k, v]) => {
    const pct = Math.round(v * 100);
    return h('span', { class: `chip ${pct >= 80 ? 'good' : pct >= 50 ? '' : 'low'}` }, `${PART_ICON[k]} ${t(`beauty_part_${k}`)} ${pct}`);
  }));
}

// ---------------------------------------------------------------- menu du terrain de concours

/**
 * Fenêtre « Concours de beauté » : les animaux présents avec leur note, préparer ou présenter,
 * et le prochain concours du calendrier. opts : { comp } pour une inscription.
 */
export function openBeauty(ui, opts = {}) {
  const g = ui.game;
  const state = { comp: opts.comp ?? null };
  ui.openPanel({
    title: () => `🎀 ${t('beauty_title')}`,
    kind: 'beauty',
    render: () => {
      if (g.activities?.active) return [h('p', { class: 'note' }, t('actv_busy'))];
      return [h('p', { class: 'note' }, t('beauty_intro')), ...beautyPick(ui, state), h('p', { class: 'note' }, `💡 ${t('beauty_tipRain')}`)];
    },
  });
}

/**
 * Les cartes des animaux pour le concours de beauté (aussi utilisées par le menu des activités,
 * src/ui/activities.js, quand on s'inscrit depuis le calendrier). state : { comp }.
 */
export function beautyPick(ui, state) {
  const g = ui.game;
  const now = nowHours(g.profile);
  const out = [];
  const comp = state.comp;
  if (!comp) {
    const next = nextBeautyComp(g);
    if (next) {
      const block = entryBlock(next, { day: g.day, hour: g.hour, entered: activityData(g.profile).entered });
      out.push(h('div', { class: `card actv-comp ${block ? '' : 'open'}` },
        h('span', { class: 'card-emoji' }, '📅'),
        h('span', { class: 'card-main' }, h('b', {}, t('beauty_nextComp', { level: t(`actv_level_${next.levelId}`) })), h('small', {}, `${t('day', { n: next.day })} · ${whenText(g, next)}`),
          h('small', {}, isSandbox(g.profile) ? t('actv_prizesSandbox') : t('actv_prizes', { fee: next.fee, a: next.prizes[0], b: next.prizes[1], c: next.prizes[2] }))),
        block ? h('span', { class: 'lock' }, t(`actv_block_${block}`)) : h('button', { class: 'primary', onClick: () => { state.comp = next; ui.renderPanel(); } }, t('actv_enter'))));
    }
  } else {
    out.push(h('p', { class: 'note' }, isSandbox(g.profile) ? t('actv_compHelpSandbox') : t('actv_compHelp', { fee: comp.fee, a: comp.prizes[0] })));
    out.push(h('details', { class: 'actv-rivals' }, h('summary', {}, `👥 ${t('actv_rivals')}`),
      h('ul', {}, rivals(comp).map((r) => h('li', {}, `${SPECIES[r.species]?.emoji ?? ''} ${r.name} & ${r.animal}`)))));
  }
  out.push(h('p', { class: 'note' }, t('actv_how_beauty')));
  const here = g.animalsHere();
  if (!here.length) out.push(h('p', { class: 'warn' }, t('actv_none_beauty')));
  out.push(h('div', { class: 'cards' }, here.map((a) => {
    const why = beautyBlock(a);
    const ready = isReady(a, now);
    const missing = checklist(a, now).filter((l) => l.required && !l.done).length;
    return h('div', { class: `card beauty-card ${why ? 'locked' : ''}` },
      h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
      h('span', { class: 'card-main' },
        h('b', {}, a.name),
        h('div', { class: 'bars small' }, scoreBar(a, now)),
        why ? h('small', { class: 'actv-warn' }, ta(`actv_why_${why}`, a))
          : h('small', { class: ready ? 'beauty-ready' : '' }, ready ? `✅ ${t('beauty_ready')}` : `🧺 ${t('beauty_missing', { n: missing })}`),
        h('div', { class: 'row wrap' },
          h('button', { class: 'small', onClick: () => openBeautyPrep(ui, a, { comp }) }, `🧺 ${t('beauty_prepBtn')}`),
          h('button', {
            class: `small ${ready ? 'primary' : ''}`,
            onClick: () => {
              if (why) return ui.toast(ta(`actv_why_${why}`, a), 4000);
              g.activities.start('beauty', { animal: a, comp });
            },
          }, comp ? `🏆 ${t('beauty_enterBtn')}` : `🎀 ${t('beauty_presentBtn')}`))));
  })));
  return out;
}

// ---------------------------------------------------------------- préparer pour le concours

/** La liste de préparation d'un animal : chaque geste, sa fraîcheur, et le bouton pour le faire. */
export function openBeautyPrep(ui, a, opts = {}) {
  const g = ui.game;
  ui.openPanel({
    title: () => `🎀 ${ta('beauty_prepTitle', a)}`,
    kind: 'beautyPrep',
    animalId: a.id,
    live: true,
    render: () => {
      const now = nowHours(g.profile);
      const list = checklist(a, now);
      const ready = isReady(a, now);
      const why = beautyBlock(a);
      const out = [
        h('div', { class: 'bars' }, scoreBar(a, now)),
        partsChips(a, now),
        h('p', { class: 'note' }, ta('beauty_prepHelp', a)),
      ];
      if (a.location !== g.profile.place) return [...out, h('p', { class: 'warn' }, ta('actv_why_notHere', a))];
      out.push(h('ul', { class: 'checklist beauty-list' }, list.map((l) => {
        const def = PREP_ITEMS[l.item];
        let when = t('beauty_todo');
        if (l.done) when = l.left >= 24 ? t('beauty_freshDays', { n: Math.round(l.left / 24) }) : l.left > 0 ? t('beauty_fresh', { n: l.left }) : t('beauty_doneNow');
        else if (l.old) when = t('beauty_old');
        const color = l.color ? `${COLOR_EMOJI[l.color] ?? ''}` : '';
        return h('li', { class: l.done ? 'ok' : 'ko' },
          h('span', { class: 'beauty-check' }, l.done ? '✅' : '⬜'),
          h('span', { class: 'beauty-item' },
            h('b', {}, `${l.icon} ${t(`beauty_item_${l.item}`)}${l.required ? '' : ` · ${t('beauty_bonus')}`}`),
            h('small', {}, `${when} ${color}`)),
          h('button', {
            class: `small ${l.done ? '' : 'primary'}`,
            onClick: () => doPrep(ui, a, l.item),
          }, l.done ? `🔁 ${t('beauty_redo')}` : `▶️ ${t('beauty_do')}`));
      })));
      if (ready) {
        out.push(h('p', { class: 'beauty-banner' }, `🎉 ${ta('beauty_nowReady', a)}`));
      }
      // Aller au concours (ou s'entraîner) depuis la fiche
      const next = opts.comp ?? nextBeautyComp(g);
      const block = next ? entryBlock(next, { day: g.day, hour: g.hour, entered: activityData(g.profile).entered }) : 'none';
      out.push(h('div', { class: 'grid' },
        h('button', { class: `act ${ready && !block ? 'primary' : ''}`, disabled: !!block, onClick: () => { if (why) return ui.toast(ta(`actv_why_${why}`, a), 4000); g.activities.start('beauty', { animal: a, comp: next }); } },
          `🏆 ${t('beauty_enterBtn')}${next && block ? ` · ${t(`actv_block_${block}`)}` : ''}`),
        h('button', { class: 'act', onClick: () => { if (why) return ui.toast(ta(`actv_why_${why}`, a), 4000); g.activities.start('beauty', { animal: a, comp: null }); } },
          `🎀 ${t('beauty_presentBtn')}`)));
      if (next && block === 'notYet') out.push(h('p', { class: 'note' }, t('beauty_nextComp', { level: t(`actv_level_${next.levelId}`) }) + ` — ${whenText(g, next)}`));
      if (why) out.push(h('p', { class: 'warn' }, ta(`actv_why_${why}`, a)));
      return out;
    },
  });
  g.emit?.('panel', 'beautyPrep');
}

/** Fait un geste de préparation : soin existant (mini-jeu des soins) ou mini-jeu de beauté. */
export async function doPrep(ui, a, item) {
  const g = ui.game;
  const def = PREP_ITEMS[item];
  if (!def || g.blockedByPause()) return null;
  if (def.care) {
    const check = g.canCare(a, item);
    if (!check.ok && check.reason === 'full') {
      // Déjà tout propre : on le note sans refaire le soin.
      g.beauty?.prepDone(a, item, 1, {});
      ui.toast(ta('beauty_alreadyDone', a), 3500);
      ui.renderPanel();
      return 1;
    }
    const r = await ui.careWithGame(a, item);
    if (r?.ok) g.beauty?.prepDone(a, item, 1, {});
    ui.renderPanel();
    return r;
  }
  const opts = { out: {} };
  const q = await runMinigame(ui, a, item, opts);
  if (q === null) return null;
  g.beauty?.prepDone(a, item, q, opts.out ?? {});
  ui.renderPanel();
  return q;
}

/** Bouton « Préparer pour le concours » de la fiche de l'animal (src/ui/activities.js). */
export function beautyAnimalButtons(ui, a) {
  const now = nowHours(ui.game.profile);
  const ready = isReady(a, now);
  return [h('button', { class: `act ${ready ? 'done' : ''}`, onClick: () => openBeautyPrep(ui, a) }, `🎀 ${t('beauty_prepBtn')}${ready ? ' ✅' : ''}`)];
}

/** Action du terrain de concours (src/ui/actions.js via activityRuns). */
export const beautyRuns = (ui) => ({ actvBeauty: () => openBeauty(ui) });

/** Les lignes des résultats : les quatre notes du juge et son commentaire. */
export function judgeLines(marks, a) {
  return [
    `🎀 ${t('beauty_mark_presentation')} : ${marks.presentation} / 25`,
    `💚 ${t('beauty_mark_condition')} : ${marks.condition} / 25`,
    `🚶 ${t('beauty_mark_movement')} : ${marks.movement} / 25`,
    `🤝 ${t('beauty_mark_behaviour')} : ${marks.behaviour} / 25`,
    `🧑‍⚖️ ${ta(`beauty_judge_${marks.comment}`, a)}`,
  ];
}

export { RIBBON_COLORS };

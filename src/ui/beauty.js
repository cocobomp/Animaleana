// Interface du concours de beauté : menu au terrain de concours (inscription par classe, entraînement),
// liste de préparation sur la fiche de l'animal (« Préparer pour le concours »), ce que voit le juge
// (propreté et humeur réelles, accessoires assortis), et les notes du juge dans les résultats.
// Logique : src/sim/beauty.js ; 3D et présentation dans la carrière : src/game/Beauty.js.

import { h, bar } from './dom.js';
import { t, ta } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { isSandbox } from '../sim/profile.js';
import { competitionsAt, eligibility } from '../sim/activities.js';
import {
  PREP_ITEMS, RIBBON_COLORS, checklist, isReady, beautyScore, nowHours, classOf, BEAUTY_CLASSES, classRivals, entryFor, entriesOf,
  registerBlock, ringBlock, accessoryInfo, lowestNeed, JUDGE_CRITERIA, dirtState, prepItems,
} from '../sim/beauty.js';
import { canLead } from '../sim/gear.js';
import { runMinigame } from './minigames.js';

const COLOR_EMOJI = { red: '🔴', pink: '🩷', blue: '🔵', yellow: '🟡', green: '🟢', purple: '🟣', white: '⚪' };
const PART_ICON = { presentation: '🎀', coat: '🧼', health: '💚', weight: '⚖️', calm: '🤝', allure: '🌟', mood: '😊' };
const MARK_ICON = { presentation: '🎀', condition: '💚', movement: '🚶', behaviour: '🤝' };

/** Le prochain concours de beauté ici (dans les 15 jours), pas encore fermé. */
export function nextBeautyComp(g) {
  return competitionsAt(g.profile.place, g.isHome, g.day, 15)
    .find((c) => c.type === 'beauty' && (c.day > g.day || (c.day === g.day && g.hour < c.close))) ?? null;
}

const whenText = (g, c) => {
  const d = c.day - g.day;
  if (d === 0) return t('actv_today', { from: c.open, to: c.close });
  if (d === 1) return t('actv_tomorrow');
  return t('actv_inDays', { n: d, day: c.day });
};

const className = (cls) => `${BEAUTY_CLASSES[cls]?.emoji ?? ''} ${t(`beauty_class_${cls}`)}`;

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

/** Petites pastilles : présentation, robe, santé, poids, calme, allure, humeur. */
function partsChips(a, now) {
  const { parts } = beautyScore(a, now);
  return h('div', { class: 'chips beauty-parts' }, Object.entries(parts).map(([k, v]) => {
    const pct = Math.round(v * 100);
    return h('span', { class: `chip ${pct >= 80 ? 'good' : pct >= 50 ? '' : 'low'}` }, `${PART_ICON[k]} ${t(`beauty_part_${k}`)} ${pct}`);
  }));
}

/**
 * Ce que le juge verra de l'animal VRAI : propreté (le bain ou le brossage défaits par la saleté)
 * et humeur (le besoin le plus bas). Renvoie des petites lignes (vides si tout va bien).
 */
export function realStateLines(a, now) {
  const out = [];
  // « S'est sali depuis son bain » seulement s'il a vraiment été lavé (et propre) avant ; jamais lavé ou bain
  // trop léger : « encore trop sale, fais-lui un bain ». Pas de bain dans la liste (chat, lapin…) : rien à dire.
  const items = prepItems(a);
  const wash = items.includes('wash') ? dirtState(a, 'wash', now) : null;
  const brush = items.includes('brush') ? dirtState(a, 'brush', now) : null;
  if (wash) out.push(h('p', { class: 'beauty-real warn' }, ta(wash === 'dirtied' ? 'beauty_real_dirty' : 'beauty_real_tooDirty', a)));
  else if (brush) out.push(h('p', { class: 'beauty-real warn' }, ta(brush === 'dirtied' ? 'beauty_real_messy' : 'beauty_real_tangled', a)));
  const need = lowestNeed(a);
  // (« Soleil est sale » juste sous « Soleil est encore trop sale » : une seule fois suffit)
  const said = (need === 'hygiene' && wash) || (need === 'grooming' && (wash || brush));
  if (need && !said) out.push(h('p', { class: 'beauty-real warn' }, ta('beauty_real_need', a, { what: ta(`beauty_need_${need}`, a) })));
  if (!out.length) out.push(h('p', { class: 'beauty-real ok' }, ta('beauty_real_ok', a)));
  return out;
}

/** Petite ligne d'état d'une carte : prêt, gestes manquants, sale, pas content. */
function readyLine(a, now) {
  const ready = isReady(a, now);
  const missing = checklist(a, now).filter((l) => l.required && !l.done).length;
  const need = lowestNeed(a);
  const parts = [ready ? `✅ ${t('beauty_ready')}` : `🧺 ${t('beauty_missing', { n: missing })}`];
  if (dirtState(a, 'wash', now) || dirtState(a, 'brush', now)) parts.push(`🧼 ${t('beauty_dirtyShort')}`);
  if (need) parts.push(`😟 ${t(`need_${need}`)}`);
  return h('small', { class: ready ? 'beauty-ready' : '' }, parts.join(' · '));
}

// ---------------------------------------------------------------- menu du terrain de concours

/**
 * Fenêtre « Concours de beauté » : le prochain concours (inscription par classe), les animaux
 * présents avec leur note, préparer, s'inscrire, entrer dans la carrière ou s'entraîner.
 * opts : { comp } (un concours choisi dans le calendrier).
 */
export function openBeauty(ui, opts = {}) {
  const g = ui.game;
  const state = { comp: opts.comp ?? null };
  ui.openPanel({
    title: () => `🎀 ${t('beauty_title')}`,
    kind: 'beauty',
    live: true,
    render: () => {
      if (g.activities?.active) return [h('p', { class: 'note' }, t('actv_busy'))];
      return [h('p', { class: 'note' }, t('beauty_intro')), ...beautyPick(ui, state), h('p', { class: 'note' }, `💡 ${t('beauty_tipRain')}`)];
    },
  });
  g.emit?.('panel', 'beauty');
}

/** La carte du concours : niveau, jour, prix, classes, inscrits. */
function compCard(ui, comp) {
  const g = ui.game;
  const p = g.profile;
  const today = comp.day === g.day;
  const open = today && g.hour >= comp.open && g.hour < comp.close;
  const entries = entriesOf(p, comp.id).map((e) => ({ e, a: p.animals.find((x) => x.id === e.animalId) })).filter((x) => x.a);
  return h('div', { class: `card actv-comp beauty-comp ${open ? 'open' : ''}` },
    h('span', { class: 'card-emoji' }, '📅'),
    h('span', { class: 'card-main' },
      h('b', {}, t('beauty_nextComp', { level: t(`actv_level_${comp.levelId}`) })),
      h('small', {}, `${t('day', { n: comp.day })} · ${whenText(g, comp)}`),
      h('small', {}, isSandbox(p) ? t('actv_prizesSandbox') : t('actv_prizes', { fee: comp.fee, a: comp.prizes[0], b: comp.prizes[1], c: comp.prizes[2] })),
      h('small', { class: 'beauty-classes' }, `${t('beauty_classesLabel')} ${Object.keys(BEAUTY_CLASSES).map((c) => BEAUTY_CLASSES[c].emoji).join(' ')}`),
      entries.length ? h('small', { class: 'beauty-entered' }, `📝 ${t('beauty_entriesLabel')} ${entries.map(({ e, a }) => `${a.name}${e.presented ? ' ✅' : ''}`).join(', ')}`) : null),
    open ? h('span', { class: 'beauty-today' }, t('beauty_openNow')) : null);
}

/**
 * Le bouton concours d'un animal : s'inscrire (à l'avance ou sur place) ou entrer dans la carrière.
 * Renvoie un bouton, ou null s'il n'y a pas de concours à venir.
 */
function compButton(ui, a, comp, block) {
  const g = ui.game;
  const p = g.profile;
  if (!comp) return null;
  const ctx = { day: g.day, hour: g.hour };
  const entry = entryFor(p, comp.id, a.id);
  const ring = ringBlock(p, comp, a, ctx);
  const fee = isSandbox(p) ? '' : ` · ${comp.fee} 🪙`;
  if (entry) {
    if (entry.presented) return h('button', { class: 'small', disabled: true }, `✅ ${ta('beauty_presentedBtn', a)}`);
    if (ring === 'notYet') return h('button', { class: 'small', disabled: true }, `📝 ${ta('beauty_enteredBtn', a)} · ${t('day', { n: comp.day })}`);
    return h('button', {
      class: 'small primary',
      onClick: () => {
        if (block) return ui.toast(ta(`actv_why_${block}`, a), 4000);
        g.beauty.enterRing(a, comp);
      },
    }, `🏆 ${t('beauty_enterBtn')}`);
  }
  const reg = registerBlock(p, comp, a, ctx);
  if (reg === 'classTaken') return h('button', { class: 'small', disabled: true }, `🔒 ${t('beauty_classTakenBtn')}`);
  if (reg) return null;
  const now = !ring; // le concours est ouvert : on s'inscrit et on entre tout de suite
  return h('button', {
    class: `small ${now ? 'primary' : ''}`,
    onClick: () => {
      if (now) {
        if (block) return ui.toast(ta(`actv_why_${block}`, a), 4000);
        g.beauty.enterRing(a, comp);
      } else if (g.beauty.register(a, comp)) ui.renderPanel();
    },
  }, now ? `🏆 ${t('beauty_registerEnterBtn')}${fee}` : `📝 ${t('beauty_registerBtn')}${fee}`);
}

/**
 * Le contenu du concours de beauté (aussi utilisé par le menu des activités, src/ui/activities.js,
 * quand on choisit un concours dans le calendrier). state : { comp }.
 */
export function beautyPick(ui, state) {
  const g = ui.game;
  const now = nowHours(g.profile);
  const out = [];
  const comp = state.comp && (state.comp.day > g.day || (state.comp.day === g.day && g.hour < state.comp.close)) ? state.comp : nextBeautyComp(g);
  if (comp) {
    out.push(compCard(ui, comp));
    out.push(h('details', { class: 'actv-rivals' }, h('summary', {}, `👥 ${t('actv_rivals')}`),
      h('ul', {}, Object.keys(BEAUTY_CLASSES).map((cls) => h('li', {}, h('b', {}, className(cls)), ' : ',
        classRivals(comp, cls, 3).map((r) => `${r.name} & ${r.animal}`).join(', '))))));
  } else out.push(h('p', { class: 'note' }, t('beauty_noComp')));
  out.push(h('p', { class: 'note' }, t('actv_how_beauty')));
  const here = g.animalsHere();
  if (!here.length) out.push(h('p', { class: 'warn' }, t('actv_none_beauty')));
  out.push(h('div', { class: 'cards' }, here.map((a) => {
    const why = beautyBlock(a);
    return h('div', { class: `card beauty-card ${why ? 'locked' : ''}` },
      h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
      h('span', { class: 'card-main' },
        h('b', {}, a.name, h('span', { class: 'beauty-cls' }, className(classOf(a.species)))),
        h('div', { class: 'bars small' }, scoreBar(a, now)),
        why ? h('small', { class: 'actv-warn' }, ta(`actv_why_${why}`, a)) : readyLine(a, now),
        h('div', { class: 'row wrap' },
          h('button', { class: 'small', onClick: () => openBeautyPrep(ui, a, { comp }) }, `🧺 ${t('beauty_prepBtn')}`),
          compButton(ui, a, comp, why),
          h('button', {
            class: 'small',
            onClick: () => {
              if (why) return ui.toast(ta(`actv_why_${why}`, a), 4000);
              g.beauty.enterRing(a, null);
            },
          }, `🎀 ${t('beauty_presentBtn')}`))));
  })));
  return out;
}

// ---------------------------------------------------------------- préparer pour le concours

/** L'accessoire assorti (licol ou collier de la couleur des rubans) : état et bouton pour l'assortir. */
function accessoryRow(ui, a, now) {
  const g = ui.game;
  const acc = accessoryInfo(a, now);
  if (!acc) return null;
  const itemName = (id) => t(`gear_${id}`);
  let text;
  let btn = null;
  if (acc.matches) text = `✅ ${t('beauty_acc_match', { item: itemName(acc.item), color: t(`col_${acc.color}`).toLowerCase() })}`;
  else if (!acc.ribbon) text = t('beauty_acc_noRibbon');
  else if (!acc.want) text = t('beauty_acc_noColor');
  else {
    text = t('beauty_acc_hint', { color: t(`beauty_color_${acc.ribbon}`) });
    btn = h('button', {
      class: 'small primary',
      onClick: () => {
        if (g.equip(a, acc.target, acc.want)?.ok) {
          ui.toast(t('beauty_acc_done', { item: itemName(acc.target), color: t(`col_${acc.want}`).toLowerCase() }), 3500);
          g.entities.get(a.id)?.emit?.('🎨', 2);
          ui.renderPanel();
        }
      },
    }, `🎨 ${t('beauty_acc_put', { item: itemName(acc.target), color: t(`col_${acc.want}`).toLowerCase() })}`);
  }
  return h('li', { class: `beauty-acc ${acc.matches ? 'ok' : 'ko'}` },
    h('span', { class: 'beauty-check' }, acc.matches ? '✅' : '🎨'),
    h('span', { class: 'beauty-item' }, h('b', {}, `${t('beauty_acc_title')} · ${t('beauty_bonus')}`), h('small', {}, text)),
    btn);
}

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
        ...realStateLines(a, now),
        h('p', { class: 'note' }, ta('beauty_prepHelp', a)),
      ];
      if (a.location !== g.profile.place) return [...out, h('p', { class: 'warn' }, ta('actv_why_notHere', a))];
      out.push(h('ul', { class: 'checklist beauty-list' }, list.map((l) => {
        let when = t('beauty_todo');
        if (l.done) when = l.left >= 24 ? t('beauty_freshDays', { n: Math.round(l.left / 24) }) : l.left > 0 ? t('beauty_fresh', { n: l.left }) : t('beauty_doneNow');
        else if (l.dirty) when = ta('beauty_dirty', a);
        else if (l.tooDirty) when = ta(`beauty_tooDirty_${l.item}`, a);
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
      }), accessoryRow(ui, a, now)));
      if (ready) out.push(h('p', { class: 'beauty-banner' }, `🎉 ${ta('beauty_nowReady', a)}`));
      // Aller au concours (s'inscrire, entrer) ou s'entraîner depuis la fiche
      const comp = opts.comp && (opts.comp.day > g.day || (opts.comp.day === g.day && g.hour < opts.comp.close)) ? opts.comp : nextBeautyComp(g);
      if (comp) out.push(compCard(ui, comp));
      out.push(h('div', { class: 'row wrap beauty-go' },
        compButton(ui, a, comp, why),
        h('button', { class: 'small', onClick: () => { if (why) return ui.toast(ta(`actv_why_${why}`, a), 4000); g.beauty.enterRing(a, null); } },
          `🎀 ${t('beauty_presentBtn')}`)));
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
    // (la qualité du mini-jeu : un bain ★★★ rend l'animal propre pour le juge, voir showCare)
    if (r?.ok) g.beauty?.prepDone(a, item, r.quality ?? 1, {});
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

/**
 * Les lignes des résultats : la classe, les quatre notes du juge (petites barres sur 25), les
 * couleurs assorties, l'écharpe du plus bel animal et le commentaire du juge.
 * o : { cls, comp, champion }.
 */
export function judgeLines(marks, a, o = {}) {
  const lines = [];
  if (o.cls && o.comp) lines.push(`${BEAUTY_CLASSES[o.cls]?.emoji ?? ''} ${t('beauty_classLine', { cls: t(`beauty_class_${o.cls}`) })}`);
  for (const k of JUDGE_CRITERIA) {
    const v = marks[k];
    lines.push(h('span', { class: 'beauty-mark' },
      h('span', { class: 'beauty-mark-label' }, `${MARK_ICON[k]} ${t(`beauty_mark_${k}`)}`),
      h('span', { class: 'bar-track' }, h('span', { class: `bar-fill ${v >= 20 ? 'good' : v >= 13 ? 'mid' : 'low'}`, style: { width: `${Math.round((v / 25) * 100)}%` } })),
      h('b', {}, `${v} / 25`)));
  }
  if (marks.matches) lines.push(`🎨 ${t('beauty_judge_matches')}`);
  if (o.champion) lines.push(h('b', { class: 'beauty-champion' }, `🎗️ ${ta('beauty_champion', a)}`));
  const what = marks.need ? ta(`beauty_need_${marks.need}`, a) : '';
  lines.push(`🧑‍⚖️ ${ta(`beauty_judge_${marks.comment}`, a, { what })}`);
  return lines;
}

export { RIBBON_COLORS };

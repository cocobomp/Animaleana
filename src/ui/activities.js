// Interface des activités : menu (saut, balade, agility, spectacle), calendrier des concours,
// étagère des trophées et album photo, barre de jeu pendant une activité, et résultats.

import { h, bar } from './dom.js';
import { t, ta, L } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { PLACES } from '../sim/places.js';
import { isSandbox } from '../sim/profile.js';
import { owned, inUse } from '../sim/gear.js';
import { CAREERS } from '../sim/careers.js'; // 🧭 niveau du métier de guide
import {
  COMPETITION_TYPES, competitionsAt, entryBlock, eligibility, knownTricks, rivals, activityData, awardCounts, MAX_ACTS,
  JUMP_STAGES, comfortHeight, courseForStage, stageForLevel, stageFor, HUTCH_TOYS, hutchPlayBlock,
} from '../sim/activities.js';
import { awayCalendar, venueBanner, trainingCard } from './competitions.js'; // concours à l'extérieur et dressage
import { openBeauty, beautyPick, beautyAnimalButtons, beautyRuns } from './beauty.js'; // concours de beauté

export const TYPE_ICON = { jumping: '🏇', lesson: '🎓', trail: '🧭', agility: '🐕', hop: '🐇', show: '🎪', flat: '🎠', figures: '🔤', dressage: '🎠', beauty: '🎀' };
const TIER_ICON = { gold: '🏆', silver: '🥈', bronze: '🥉' };
const SKILL_OF = { jumping: ['jump', 'obedience'], lesson: ['jump', 'obedience'], trail: ['endurance', 'speed'], agility: ['jump', 'obedience', 'speed'], hop: ['jump', 'obedience'], show: ['obedience'], flat: ['dressage', 'obedience'], figures: ['dressage', 'obedience'], dressage: ['dressage', 'obedience'] };
const DRESSAGE_TYPES = ['flat', 'figures', 'dressage'];
const STAGE_ICON = ['🟫', '✖️', '🏇', '🏆'];

// ---------------------------------------------------------------- menu principal

/**
 * Fenêtre des activités. opts : { tab: 'play' | 'calendar' | 'trophies', pick: type, animal }.
 */
export function openActivities(ui, opts = {}) {
  const g = ui.game;
  const state = { tab: opts.tab ?? 'play', pick: opts.pick ?? null, comp: null, acts: [], autoJump: true };
  if (opts.pick === 'show' && opts.animal) {
    const first = knownTricks(opts.animal)[0];
    if (first) state.acts.push({ animalId: opts.animal.id, trick: first });
  }
  ui.openPanel({
    title: () => `🏆 ${t('actv_title')}`,
    kind: 'activities',
    render: () => {
      if (g.activities?.active) return [h('p', { class: 'note' }, t('actv_busy'))];
      const tabs = h('div', { class: 'tabs' }, [['play', `🎯 ${t('actv_tabPlay')}`], ['calendar', `📅 ${t('actv_tabCalendar')}`], ['trophies', `🏆 ${t('actv_tabTrophies')}`]]
        .map(([k, label]) => h('button', { class: state.tab === k ? 'active' : '', onClick: () => { state.tab = k; state.pick = null; state.comp = null; ui.renderPanel(); } }, label)));
      const out = [tabs];
      if (state.pick) out.push(...pickAnimal(ui, state));
      else if (state.tab === 'play') out.push(...playTab(ui, state));
      else if (state.tab === 'calendar') out.push(...calendarTab(ui, state));
      else out.push(...trophiesTab(ui));
      return out;
    },
  });
}

function playTab(ui, state) {
  const g = ui.game;
  const here = g.animalsHere();
  const count = (type) => here.filter((a) => !eligibility(a, type)).length;
  const cards = ['lesson', 'jumping', 'flat', 'figures', 'dressage', 'trail', 'agility', 'hop', 'show', 'beauty'].map((type) => {
    const n = type === 'trail' ? count('trail') + here.filter((a) => a.following).length : count(type);
    return h('button', { class: 'card actv-card', onClick: () => { if (type === 'beauty') return openBeauty(ui); state.pick = type; ui.renderPanel(); } },
      h('span', { class: 'card-emoji' }, TYPE_ICON[type]),
      h('span', { class: 'card-main' }, h('b', {}, t(`actv_type_${type}`)), h('small', {}, t(`actv_desc_${type}`))),
      h('span', { class: 'card-side' }, n ? h('small', {}, t('actv_ready', { n })) : h('small', {}, '—')));
  });
  const next = competitionsAt(g.profile.place, g.isHome, g.day, 7)[0];
  // 🧭 Guide de randonnée : le carnet du métier (src/ui/trailGuide.js)
  cards.push(h('button', { class: 'card actv-card tg-card', onClick: () => ui.openTrailGuide() },
    h('span', { class: 'card-emoji' }, '🧭'),
    h('span', { class: 'card-main' }, h('b', {}, t('tg_title')), h('small', {}, t('tg_cardDesc'))),
    h('span', { class: 'card-side' }, h('small', {}, g.level >= CAREERS.trailGuide.level ? '📒' : `🔒 ${t('tg_level', { n: CAREERS.trailGuide.level })}`))));
  return [
    ...venueBanner(ui), // concours du jour sur place (src/ui/competitions.js)
    h('p', { class: 'note' }, t('actv_intro')),
    h('div', { class: 'cards' }, cards),
    next ? h('button', { class: 'card actv-next', onClick: () => { state.tab = 'calendar'; ui.renderPanel(); } },
      h('span', { class: 'card-emoji' }, '📅'),
      h('span', { class: 'card-main' }, h('b', {}, compName(next)), h('small', {}, whenText(g, next)))) : null,
  ];
}

const compName = (c) => t('actv_compName', { type: t(`actv_type_${c.type}`), level: t(`actv_level_${c.levelId}`) });

function whenText(g, c) {
  const d = c.day - g.day;
  if (d === 0) return t('actv_today', { from: c.open, to: c.close });
  if (d === 1) return t('actv_tomorrow');
  return t('actv_inDays', { n: d, day: c.day });
}

/** Choix de l'animal (ou du programme pour un spectacle). */
function pickAnimal(ui, state) {
  const g = ui.game;
  const type = state.pick;
  const back = h('button', { class: 'small', onClick: () => { state.pick = null; state.comp = null; ui.renderPanel(); } }, `← ${t('actv_back')}`);
  const head = [h('div', { class: 'row' }, back, h('b', {}, `${TYPE_ICON[type]} ${state.comp ? compName(state.comp) : t(`actv_type_${type}`)}`))];
  if (type === 'beauty') return [...head, ...beautyPick(ui, state)]; // concours de beauté (src/ui/beauty.js)
  if (state.comp) {
    head.push(h('p', { class: 'note' }, isSandbox(g.profile) ? t('actv_compHelpSandbox') : t('actv_compHelp', { fee: state.comp.fee, a: state.comp.prizes[0] })));
    head.push(rivalsList(state.comp));
  } else {
    head.push(h('p', { class: 'note' }, t(`actv_how_${type}`)));
  }
  if (type === 'show') return [...head, ...programme(ui, state)];
  const fits = {
    jumping: (a) => SPECIES[a.species].rideable,
    lesson: (a) => SPECIES[a.species].rideable,
    trail: (a) => SPECIES[a.species].rideable,
    flat: (a) => a.species === 'horse',
    figures: (a) => a.species === 'horse',
    dressage: (a) => a.species === 'horse',
    agility: (a) => SPECIES[a.species].training.includes('agility'),
    hop: (a) => a.species === 'rabbit',
  }[type] ?? (() => true);
  const here = g.animalsHere().filter(fits);
  const out = [...head];
  if (!here.length) out.push(h('p', { class: 'warn' }, t(`actv_none_${type}`)));
  out.push(h('div', { class: 'cards' }, here.map((a) => {
    const why = eligibility(a, type);
    // Saut d'obstacles à l'entraînement : on choisit le niveau du parcours (débloqué par la compétence de saut).
    if (type === 'jumping' && !state.comp && !why) return stageCard(ui, a);
    if (DRESSAGE_TYPES.includes(type) && !state.comp && !why) return trainingCard(ui, a, type); // dressage : apprend-il bien ?
    const tooHigh = type === 'jumping' && state.comp && !why && comfortHeight(a.skills.jump) < courseForStage(stageForLevel(state.comp.level)).obstacles.at(-1).height - 0.05;
    return h('button', {
      class: `card ${why ? 'locked' : ''}`,
      onClick: () => {
        if (why) return ui.toast(ta(`actv_why_${why}`, a), 4000);
        g.activities.start(type, { animal: a, comp: state.comp });
      },
    },
    h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
    h('span', { class: 'card-main' }, h('b', {}, a.name),
      why ? h('small', {}, ta(`actv_why_${why}`, a)) : h('div', { class: 'bars small' }, SKILL_OF[type].map((k) => bar(t(`skill_${k}`), a.skills[k] ?? 0))),
      tooHigh ? h('small', { class: 'actv-warn' }, ta('actv_tooHighWarn', a)) : null),
    h('span', { class: 'card-side' }, why ? '🔒' : '▶️'));
  })));
  // La balade peut aussi se faire à pied avec les animaux qui nous suivent.
  if (type === 'trail') {
    const followers = g.animalsHere().filter((a) => a.following);
    out.push(h('button', {
      class: 'card',
      disabled: !followers.length,
      onClick: () => g.activities.start('trail', { comp: state.comp }),
    }, h('span', { class: 'card-emoji' }, '🚶'), h('span', { class: 'card-main' }, h('b', {}, t('actv_trailFoot')),
      h('small', {}, followers.length ? followers.map((a) => a.name).join(', ') : t('actv_trailFootHelp')))));
  }
  return out;
}

/** Carte d'un cheval avec les niveaux de parcours : barres au sol, petites croix, club, grand parcours. */
function stageCard(ui, a) {
  const g = ui.game;
  const skill = a.skills.jump;
  const best = stageFor(skill);
  return h('div', { class: 'card actv-stages' },
    h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
    h('span', { class: 'card-main' },
      h('b', {}, a.name),
      h('div', { class: 'bars small' }, SKILL_OF.jumping.map((k) => bar(t(`skill_${k}`), a.skills[k] ?? 0))),
      h('small', {}, ta('actv_comfort', a, { h: Math.round(comfortHeight(skill) * 100) })),
      h('div', { class: 'actv-stage-row' }, JUMP_STAGES.map((st, i) => {
        const locked = skill < st.minSkill;
        return h('button', {
          class: `actv-stage ${i === best ? 'primary' : ''} ${locked ? 'locked' : ''}`,
          onClick: () => {
            if (locked) return ui.toast(ta('actv_stageLocked', a, { n: st.minSkill }), 4000);
            g.activities.start('jumping', { animal: a, stage: i });
          },
        }, h('span', { class: 'ico' }, locked ? '🔒' : STAGE_ICON[i]), h('span', {}, t(`actv_stage_${st.id}`)),
        locked ? h('small', {}, `${t('skill_jump')} ${st.minSkill}`) : null);
      })),
      h('button', { class: 'small actv-teach', onClick: () => g.activities.start('lesson', { animal: a }) }, `🎓 ${t('actv_type_lesson')}`)));
}

/** « Tu vas jouer avec… » : choisir un lapin et un coin de l'enclos du clapier. */
export function openHutchPlay(ui, preset = null) {
  const g = ui.game;
  const state = { rabbit: preset?.id ?? null };
  ui.openPanel({
    title: () => `🎡 ${t('actv_hutchTitle')}`,
    kind: 'hutchPlay',
    render: () => {
      const rabbits = g.animalsHere().filter((a) => a.species === 'rabbit');
      if (!rabbits.length) return [h('p', { class: 'warn' }, t('actv_noRabbit'))];
      if (!rabbits.some((a) => a.id === state.rabbit)) state.rabbit = rabbits[0].id;
      const a = rabbits.find((x) => x.id === state.rabbit);
      const out = [h('p', { class: 'note' }, t('actv_hutchHelp'))];
      if (rabbits.length > 1) {
        out.push(h('div', { class: 'row wrap' }, rabbits.map((r) => h('button', {
          class: r.id === state.rabbit ? 'primary' : '',
          onClick: () => { state.rabbit = r.id; ui.renderPanel(); },
        }, `🐰 ${r.name}`))));
      }
      const why = hutchPlayBlock(a);
      if (why) out.push(h('p', { class: 'warn' }, ta(`actv_why_${why}`, a)));
      out.push(h('div', { class: 'action-sheet' }, Object.entries(HUTCH_TOYS).map(([id, toy]) => h('button', {
        class: `big-action ${why ? 'off' : ''}`,
        onClick: () => {
          if (why) return ui.toast(ta(`actv_why_${why}`, a));
          if (g.activities.playInHutch(a, id)) ui.closePanel();
        },
      }, h('span', { class: 'ba-icon' }, toy.icon), h('span', { class: 'ba-text' }, h('b', {}, ta('actv_playWith', a, { toy: t(`actv_toy_${id}`) })),
        h('small', { class: 'effect' }, t(`actv_toyd_${id}`)))))));
      out.push(h('p', { class: 'note' }, t('actv_hutchTap')));
      return out;
    },
  });
}

function rivalsList(comp) {
  return h('details', { class: 'actv-rivals' }, h('summary', {}, `👥 ${t('actv_rivals')}`),
    h('ul', {}, rivals(comp).map((r) => h('li', {}, `${SPECIES[r.species]?.emoji ?? ''} ${r.name} & ${r.animal}`))));
}

/** Le programme du spectacle : on choisit qui fait quel tour (5 au plus). */
function programme(ui, state) {
  const g = ui.game;
  const stars = g.animalsHere().filter((a) => knownTricks(a).length);
  const out = [];
  if (!stars.length) {
    out.push(h('p', { class: 'warn' }, t('actv_none_show')));
    return out;
  }
  out.push(h('h3', {}, t('actv_programme', { n: state.acts.length, max: MAX_ACTS })));
  if (!state.acts.length) out.push(h('p', { class: 'note' }, t('actv_programmeEmpty')));
  out.push(h('ol', { class: 'actv-programme' }, state.acts.map((x, i) => {
    const a = g.profile.animals.find((y) => y.id === x.animalId);
    return h('li', {}, h('span', {}, `${SPECIES[a.species].emoji} ${a.name} — ${t(`trick_${x.trick}`)}`),
      h('button', { class: 'small', 'aria-label': t('delete'), onClick: () => { state.acts.splice(i, 1); ui.renderPanel(); } }, '✕'));
  })));
  out.push(h('h3', {}, t('actv_artists')));
  for (const a of stars) {
    const why = eligibility(a, 'show');
    out.push(h('div', { class: 'actv-artist' },
      h('b', {}, `${SPECIES[a.species].emoji} ${a.name}`),
      why ? h('small', { class: 'note' }, ta(`actv_why_${why}`, a)) : null,
      h('div', { class: 'row wrap' }, knownTricks(a).map((trick) => h('button', {
        class: 'small',
        disabled: !!why || state.acts.length >= MAX_ACTS,
        onClick: () => { state.acts.push({ animalId: a.id, trick }); ui.renderPanel(); },
      }, `+ ${t(`trick_${trick}`)}`)))));
  }
  out.push(h('p', { class: 'note' }, t('actv_varietyTip')));
  out.push(h('button', {
    class: 'primary big',
    disabled: !state.acts.length,
    onClick: () => g.activities.start('show', { acts: [...state.acts], comp: state.comp }),
  }, `🎪 ${t('actv_startShow')}`));
  return out;
}

function calendarTab(ui, state) {
  const g = ui.game;
  const p = g.profile;
  const d = activityData(p);
  const list = competitionsAt(p.place, g.isHome, g.day, 8);
  const out = [h('p', { class: 'note' }, t(g.isHome ? 'actv_calendarHome' : 'actv_calendarAway'))];
  out.push(h('div', { class: 'cards' }, list.map((c) => {
    let block = entryBlock(c, { day: g.day, hour: g.hour, entered: d.entered });
    // Concours de beauté : on peut s'inscrire à l'avance (par classe), dans sa propre fenêtre.
    const beauty = c.type === 'beauty' && block !== 'over';
    if (beauty) block = null;
    return h('div', { class: `card actv-comp ${block ? '' : 'open'}` },
      h('span', { class: 'card-emoji' }, TYPE_ICON[c.type]),
      h('span', { class: 'card-main' },
        h('b', {}, compName(c)),
        h('small', {}, `${t('day', { n: c.day })} · ${whenText(g, c)}`),
        h('small', {}, isSandbox(p) ? t('actv_prizesSandbox') : t('actv_prizes', { fee: c.fee, a: c.prizes[0], b: c.prizes[1], c: c.prizes[2] }))),
      block
        ? h('span', { class: 'lock' }, t(`actv_block_${block}`))
        : h('button', { class: 'primary', onClick: () => { if (beauty) return openBeauty(ui, { comp: c }); state.pick = c.type; state.comp = c; ui.renderPanel(); } },
          beauty && c.day > g.day ? t('beauty_registerBtn') : t('actv_enter')));
  })));
  out.push(...awayCalendar(ui)); // concours à l'extérieur : inscriptions et calendrier (src/ui/competitions.js)
  // Les concours ailleurs dans le monde (pour donner envie de voyager).
  const away = Object.keys(PLACES).filter((id) => id !== p.place).map((id) => {
    const c = competitionsAt(id, id === p.home, g.day, 6)[0];
    return c ? h('li', {}, `${PLACES[id].flag} ${L(PLACES[id].name)} — ${t('day', { n: c.day })} : ${TYPE_ICON[c.type]} ${compName(c)}`) : null;
  });
  out.push(h('h3', {}, `🧭 ${t('actv_elsewhere')}`), h('ul', { class: 'actv-elsewhere' }, away));
  return out;
}

function trophiesTab(ui) {
  const g = ui.game;
  const p = g.profile;
  const d = activityData(p);
  const c = awardCounts(p);
  const out = [h('div', { class: 'chips' },
    h('span', { class: 'chip' }, `🏆 ${c.gold}`), h('span', { class: 'chip' }, `🥈 ${c.silver}`), h('span', { class: 'chip' }, `🥉 ${c.bronze}`),
    h('span', { class: 'chip' }, `🎀 ${c.ribbons}`))];
  if (!d.awards.length) out.push(h('p', { class: 'note' }, t('actv_shelfEmpty')));
  // L'étagère : 6 récompenses par planche.
  const items = [...d.awards].reverse();
  const shelves = [];
  for (let i = 0; i < Math.max(1, Math.ceil(items.length / 6)); i++) shelves.push(items.slice(i * 6, i * 6 + 6));
  out.push(h('div', { class: 'actv-shelf' }, shelves.map((row) => h('div', { class: 'actv-plank' }, row.map((a) => awardEl(a))))));
  out.push(h('h3', {}, `📷 ${t('actv_album')}`));
  out.push(d.photos.length
    ? h('div', { class: 'actv-album' }, [...d.photos].reverse().map((ph) => h('figure', {},
      h('img', { src: ph.data, alt: t(`actv_sight_${ph.sight}`) }),
      h('figcaption', {}, `${t(`actv_sight_${ph.sight}`)} · ${PLACES[ph.place]?.flag ?? ''} ${t('day', { n: ph.day })}`))))
    : h('p', { class: 'note' }, t('actv_albumEmpty')));
  return out;
}

/** Une coupe ou un flot (rosette) sur l'étagère. */
export function awardEl(a, big = false) {
  const caption = `${TYPE_ICON[a.type] ?? ''} ${a.animal ?? ''}${a.rank ? ` · ${t('actv_rank', { n: a.rank })}` : ''} · ${t('day', { n: a.day })}`;
  if (a.kind === 'trophy') {
    return h('div', { class: `actv-award trophy ${a.tier} ${big ? 'big' : ''}`, title: caption },
      h('span', { class: 'cup' }, TIER_ICON[a.tier]), h('small', {}, caption));
  }
  return h('div', { class: `actv-award ribbon ${a.tier} ${big ? 'big' : ''}`, title: caption },
    h('span', { class: 'rosette' }, h('span', {}, a.rank ? a.rank : '★')), h('small', {}, caption));
}

/** Section « Activités » de la fiche d'un animal. */
export function animalActivitySection(ui, a) {
  const g = ui.game;
  const sp = SPECIES[a.species];
  const btn = (type, label) => h('button', {
    class: 'act',
    onClick: () => {
      let why = eligibility(a, type);
      if (why === 'needBridle' && owned(g.profile, 'bridle') > inUse(g.profile, 'bridle') && g.equip(a, 'bridle')?.ok) {
        ui.toast(ta('actv_putBridleFirst', a), 2500);
        why = eligibility(a, type);
      }
      if (why) return ui.toast(ta(`actv_why_${why}`, a), 4000);
      if (type === 'show') return openActivities(ui, { pick: 'show', animal: a });
      g.activities.start(type, { animal: a });
    },
  }, `${TYPE_ICON[type]} ${label}`);
  const btns = [];
  if (sp.rideable) btns.push(btn('lesson', t('actv_type_lesson')), btn('jumping', t('actv_type_jumping')), btn('trail', t('actv_type_trail')));
  if (a.species === 'rabbit') {
    btns.push(btn('hop', t('actv_type_hop')));
    btns.push(h('button', { class: 'act', onClick: () => openHutchPlay(ui, a) }, `🎡 ${t('do_actvHutchPlay')}`));
  }
  if (sp.training.includes('agility')) btns.push(btn('agility', t('actv_type_agility')));
  if (knownTricks(a).length) btns.push(btn('show', t('actv_type_show')));
  btns.push(...beautyAnimalButtons(ui, a)); // « Préparer pour le concours » (concours de beauté)
  // Par identifiant (anciennes sauvegardes : par prénom), pour survivre à un renommage et ne pas confondre deux homonymes.
  const won = activityData(g.profile).awards.filter((x) => (x.animalId ? x.animalId === a.id : x.animal === a.name)).length;
  if (!btns.length && !won) return [];
  return [h('h3', {}, `🏆 ${t('actv_title')}`),
    btns.length ? h('div', { class: 'grid' }, btns) : null,
    won ? h('p', { class: 'note' }, ta('actv_animalAwards', a, { n: won })) : null];
}

/** Actions du terrain de concours et de l'écurie (pour src/ui/actions.js). */
export function activityRuns(ui) {
  return {
    actvJumping: () => openActivities(ui, { pick: 'jumping' }),
    actvTrail: () => openActivities(ui, { pick: 'trail' }),
    actvAgility: () => openActivities(ui, { pick: 'agility' }),
    actvShow: () => openActivities(ui, { pick: 'show' }),
    actvCalendar: () => openActivities(ui, { tab: 'calendar' }),
    actvTrophies: () => openActivities(ui, { tab: 'trophies' }),
    actvOpen: () => openActivities(ui),
    actvLesson: () => openActivities(ui, { pick: 'lesson' }),
    actvHop: () => openActivities(ui, { pick: 'hop' }),
    actvHutchPlay: () => openHutchPlay(ui),
    ...beautyRuns(ui), // concours de beauté
  };
}

// ---------------------------------------------------------------- barre de jeu pendant l'activité

export class ActivityHud {
  constructor(ui, { icon, title, onQuit }) {
    this.ui = ui;
    this.statsEl = h('div', { class: 'actv-stats' });
    this.hintEl = h('div', { class: 'actv-hint', hidden: true });
    this.bigEl = h('div', { class: 'actv-big', hidden: true });
    this.controls = h('div', { class: 'actv-controls' });
    this.choicesEl = h('div', { class: 'actv-choices', hidden: true });
    this.gaugeEl = h('div', { class: 'actv-gauge', hidden: true });
    this.mainEl = h('div', { class: 'actv-main' });
    this.toggleEl = h('div', { class: 'actv-toggle' });
    this.controls.append(this.choicesEl, this.gaugeEl, this.toggleEl, this.mainEl);
    this.root = h('div', { id: 'actv-hud' },
      h('div', { class: 'actv-top' },
        h('div', { class: 'actv-title' }, h('span', {}, `${icon} ${title}`),
          h('button', { class: 'actv-quit', 'aria-label': t('actv_quit'), title: t('actv_quit'), onClick: onQuit }, '✕')),
        this.statsEl),
      this.hintEl, this.bigEl, this.controls);
    ui.root.append(this.root);
  }

  stats(list) {
    const key = list.map((x) => x.join(' ')).join('|');
    if (key === this.statsKey) return;
    this.statsKey = key;
    this.statsEl.replaceChildren(...list.map(([icon, text]) => h('span', { class: 'actv-stat' }, `${icon} ${text}`)));
  }

  hint(text, ms = 9000) {
    this.hintEl.textContent = text;
    this.hintEl.hidden = false;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => { this.hintEl.hidden = true; }, ms);
  }

  big(text, ms = 900, cls = '') {
    this.bigEl.textContent = text;
    this.bigEl.className = `actv-big ${cls}`;
    this.bigEl.hidden = false;
    // Relance l'animation
    void this.bigEl.offsetWidth;
    this.bigEl.classList.add('show');
    clearTimeout(this.bigTimer);
    this.bigTimer = setTimeout(() => { this.bigEl.hidden = true; }, ms);
  }

  /** Gros bouton principal (sauter, photo, maintenant !). */
  setMain(spec) {
    this.mainSpec = spec;
    if (!spec) {
      this.mainEl.replaceChildren();
      return;
    }
    const b = h('button', {
      class: 'actv-btn primary',
      onPointerdown: (e) => { e.preventDefault(); if (!b.disabled) spec.onClick(); },
      onKeydown: (e) => { if (e.key === 'Enter') spec.onClick(); },
    }, h('span', { class: 'ico' }, spec.icon), h('span', {}, spec.label), spec.key ? h('kbd', {}, spec.key) : null);
    b.disabled = !!spec.disabled;
    this.mainEl.replaceChildren(b);
  }

  setMainEnabled(on) {
    const b = this.mainEl.firstChild;
    if (b && b.disabled === on) b.disabled = !on;
  }

  setToggle(label, value, onChange) {
    const input = h('input', { type: 'checkbox', checked: value, onChange: (e) => onChange(e.target.checked) });
    this.toggleEl.replaceChildren(h('label', { class: 'check actv-check' }, input, ` ${label}`));
  }

  /** Les ordres possibles (agility). */
  setChoices(list, prompt = '') {
    if (!list) {
      this.choicesEl.hidden = true;
      this.choiceBtns = [];
      return;
    }
    this.progressEl = h('span', { class: 'actv-progress-fill' });
    this.choiceBtns = list.map((c, i) => h('button', {
      class: 'actv-choice',
      onPointerdown: (e) => { e.preventDefault(); c.onClick(); },
    }, h('span', { class: 'ico' }, c.icon), h('span', {}, c.label), h('kbd', {}, String(i + 1))));
    this.choicesList = list;
    this.choicesEl.replaceChildren(
      h('div', { class: 'actv-prompt' }, prompt),
      h('div', { class: 'actv-progress' }, this.progressEl, h('span', { class: 'actv-progress-target' })),
      h('div', { class: 'actv-choice-row' }, this.choiceBtns),
    );
    this.choicesEl.hidden = false;
  }

  setChoiceProgress(phase) {
    if (this.progressEl) this.progressEl.style.width = `${Math.round(phase * 100)}%`;
  }

  pressChoice(i) {
    this.choicesList?.[i]?.onClick();
  }

  /** Jauge de timing du spectacle : zone verte au milieu, curseur qui va et vient. */
  setGauge(win) {
    if (win === null || win === undefined) {
      this.gaugeEl.hidden = true;
      return;
    }
    this.cursorEl = h('div', { class: 'gauge-cursor' });
    this.gaugeEl.replaceChildren(
      h('div', { class: 'actv-prompt' }, t('actv_gaugePrompt')),
      h('div', { class: 'gauge actv' },
        h('div', { class: 'gauge-green', style: { left: `${(0.5 - win / 2) * 100}%`, width: `${win * 100}%` } }),
        this.cursorEl));
    this.gaugeEl.hidden = false;
  }

  setGaugeCursor(x) {
    if (this.cursorEl) this.cursorEl.style.left = `${x * 100}%`;
  }

  fade() {
    const f = h('div', { class: 'actv-fade' });
    this.ui.root.append(f);
    setTimeout(() => f.remove(), 700);
  }

  flash() {
    const f = h('div', { class: 'actv-flash' });
    this.ui.root.append(f);
    setTimeout(() => f.remove(), 500);
  }

  remove() {
    clearTimeout(this.hintTimer);
    clearTimeout(this.bigTimer);
    this.root.remove();
  }
}

// ---------------------------------------------------------------- résultats

/**
 * Fenêtre des résultats. r : { type, result, comp, rank, table, award, money, animal, record, extra, onAgain, onClose }.
 */
export function showActivityResults(ui, r) {
  const res = r.result;
  const lines = [];
  if (r.type === 'lesson') {
    // Les lignes de la leçon sont dans r.extra.
  } else if (r.type === 'jumping' || r.type === 'agility' || r.type === 'hop') {
    lines.push(`⏱️ ${t('actv_time', { n: res.time })}`, `❌ ${t('actv_faults', { n: res.total })}${res.timePenalty ? ` (${t('actv_timePenalty', { n: res.timePenalty })})` : ''}`);
  } else if (r.type === 'dressage' || r.type === 'figures') {
    lines.push(`🎯 ${t('dr_total', { n: res.percent })}`); // reprise de dressage : un pourcentage
  } else {
    lines.push(`⭐ ${t('actv_points', { n: res.points })}`);
    if (r.type === 'trail') lines.push(`⏱️ ${t('actv_duration', { m: Math.floor(res.time / 60), s: String(res.time % 60).padStart(2, '0') })}`);
  }
  const maxStars = r.type === 'show' ? 5 : 3;
  let title;
  if (r.comp) title = r.rank <= 3 ? t('actv_podium', { n: r.rank }) : t('actv_ranked', { n: r.rank });
  else if (res.clear) title = t('actv_clearRound');
  else title = res.stars >= maxStars - 1 ? t('actv_bravo') : t('actv_wellTried');
  const close = (fn) => () => { ui.hideModal(); fn?.(); };
  ui.showModal([
    h('div', { class: 'actv-result' },
      h('h2', {}, `${TYPE_ICON[r.type]} ${title}`),
      h('div', { class: 'actv-stars', 'aria-label': `${res.stars}/${maxStars}` }, Array.from({ length: maxStars }, (_, i) => h('span', { class: i < res.stars ? 'on' : '' }, '★'))),
      h('p', { class: 'actv-who' }, `${SPECIES[r.animal.species].emoji} ${r.animal.name}`),
      h('ul', { class: 'actv-lines' }, lines.map((x) => h('li', {}, x)), (r.extra ?? []).map((x) => h('li', {}, x)),
        r.record ? h('li', { class: 'good' }, `🎖️ ${t('actv_record')}`) : null),
      r.body ?? null, // protocole de dressage (src/game/Dressage.js)
      r.table ? h('table', { class: 'actv-table' }, h('tbody', {}, r.table.map((x) => h('tr', { class: x.you ? 'you' : '' },
        h('td', {}, x.rank <= 3 ? TIER_ICON[['gold', 'silver', 'bronze'][x.rank - 1]] : String(x.rank)),
        h('td', {}, `${SPECIES[x.species]?.emoji ?? ''} ${x.you ? t('actv_you') : x.name} & ${x.animal}`),
        h('td', {}, ['jumping', 'agility', 'hop'].includes(r.type) ? `${x.total} · ${x.time} s` : t('actv_points', { n: x.points })))))) : null,
      r.award ? h('div', { class: 'actv-won' }, awardEl(r.award, true), h('b', {}, t(r.award.kind !== 'trophy' ? 'actv_wonRibbon' : r.award.tier === 'gold' ? 'actv_wonTrophy' : 'actv_wonMedal'))) : null,
      r.money ? h('p', { class: 'actv-money' }, `🪙 +${r.money}`) : null,
      h('div', { class: 'row end' },
        r.onAgain ? h('button', { onClick: close(r.onAgain) }, `🔁 ${t('actv_again')}`) : null,
        h('button', { class: 'primary', onClick: close(r.onClose) }, t('actv_done')))),
  ]);
}

export { COMPETITION_TYPES };

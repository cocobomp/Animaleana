// Fenêtres du jeu : fiche d'un animal, liste, adoption, voyage, journal, petits boulots, réglages.

import { h, bar, hexColor } from './dom.js';
import { t, L, getLang, setLang } from '../i18n.js';
import { SPECIES, getBreed } from '../sim/species.js';
import { NEEDS, CARE, happiness, mood, lifeStage, ageYears, canRide, weightClass } from '../sim/animal.js';
import { DAYS_PER_YEAR } from '../sim/time.js';
import { adoptionCandidates, adoptionPrice } from '../sim/adoption.js';
import { PLACES, PLACE_IDS, distanceKm, TRAVEL_MODES } from '../sim/places.js';
import { OBJECTIVES } from '../sim/objectives.js';
import { canAfford, isSandbox } from '../sim/profile.js';
import { JOBS } from '../game/Game.js';
import { EQUIPMENT, HELPERS, canProduce } from '../sim/farm.js';
import { speciesName } from './names.js';
import { GEAR, BLANKET_COLORS, owned, inUse } from '../sim/gear.js';

const MOOD_EMOJI = { happy: '😄', ok: '🙂', sad: '😢', sick: '🤒' };
const CARE_ICONS = {
  feed: '🍖', water: '💧', brush: '🪮', wash: '🫧', clean: '🧹', nails: '✂️', shoe: '🔨', pet: '🤚', treat: '🍪',
};

export function breedName(a) {
  if (a.breed === 'mix') return t('mixBreed');
  return L(getBreed(a.species, a.breed)?.name);
}

export function ageText(a) {
  const y = ageYears(a);
  if (y < 1) return t('months', { n: Math.max(0, Math.floor((a.ageDays / DAYS_PER_YEAR) * 12)) });
  return t('years', { n: Math.floor(y) });
}

const sexIcon = (a) => (a.sex === 'f' ? '♀' : '♂');

function actionLabel(a, action) {
  if (action === 'clean') return t(`act_${a.species}_clean`) || t('act_clean');
  return t(`act_${action}`);
}

function money(ui, n) {
  return isSandbox(ui.game.profile) || !n ? '' : ` · ${n} 🪙`;
}

// ---------------------------------------------------------------- fiche animal

export function openAnimal(ui, a) {
  const g = ui.game;
  ui.openPanel({
    title: () => `${SPECIES[a.species].emoji} ${a.name}`,
    live: true,
    animalId: a.id,
    kind: 'animal',
    render: () => renderAnimal(ui, g, a),
  });
}

function renderAnimal(ui, g, a) {
  const sp = SPECIES[a.species];
  const here = a.location === g.profile.place;
  const m = mood(a);
  const stage = lifeStage(a);
  const btn = (label, fn, opts = {}) => h('button', { class: `act ${opts.cls ?? ''}`, onClick: fn, disabled: opts.disabled }, label);

  const info = h('div', { class: 'animal-info' },
    h('div', { class: 'chips' },
      h('span', { class: 'chip' }, `${speciesName(a)} · ${breedName(a)}`),
      h('span', { class: 'chip' }, `${sexIcon(a)} ${t(a.sex === 'f' ? 'female' : 'male')}`),
      h('span', { class: 'chip' }, `${ageText(a)} · ${t(`stage_${stage}`)}`),
      h('span', { class: 'chip' }, t(`p_${a.personality}`, { g: a.sex })),
      h('span', { class: `chip weight-${weightClass(a)}` }, `⚖️ ${t(`weight_${weightClass(a)}`, { g: a.sex })}`),
      h('span', { class: `chip mood-${m}` }, `${MOOD_EMOJI[m]} ${t(`mood_${m}`, { g: a.sex })}`),
      h('span', { class: 'chip swatch', style: { background: hexColor(a.look.coat) } }, L(a.look.colorName) || ''),
    ),
    a.sick ? h('p', { class: 'warn' }, `🤒 ${t('r_sick', { name: a.name, g: a.sex })}`) : null,
    !here ? h('p', { class: 'note' }, t('isAt', { place: `${PLACES[a.location].flag} ${L(PLACES[a.location].name)}` })) : null,
  );

  const bars = h('div', { class: 'bars' },
    bar(t('health'), a.health, 'big'),
    bar(t('happiness'), happiness(a), 'big'),
    NEEDS.map((n) => bar(t(`need_${n}`), a.needs[n])),
  );

  const out = [info, bars];
  if (!here) return out;

  const careActions = sp.actions.filter((x) => !['play', 'lunge', 'liberty', 'ride', 'follow', 'shear', 'milk'].includes(x));
  out.push(h('h3', {}, t('care')), h('div', { class: 'grid' },
    careActions.map((x) => btn(`${CARE_ICONS[x] ?? ''} ${actionLabel(a, x)}${money(ui, CARE[x].cost)}`, () => ui.careWithGame(a, x))),
  ));

  const acts = [];
  if (sp.actions.includes('play')) acts.push(btn(`⚽ ${t('act_play')}`, () => ui.careWithGame(a, 'play')));
  if (sp.actions.includes('lunge')) acts.push(btn(`🌀 ${t('act_lunge')}`, () => ui.careWithGame(a, 'lunge')));
  if (sp.actions.includes('liberty')) acts.push(btn(`💛 ${t('act_liberty')}`, () => ui.careWithGame(a, 'liberty')));
  if (sp.rideable) {
    const r = canRide(a);
    acts.push(btn(`🏇 ${t('act_ride')}`, () => { if (g.ride(a)) ui.closePanel(); }, { cls: 'primary', disabled: !r.ok && r.reason === 'tooYoung' }));
  }
  acts.push(btn(a.following ? `✋ ${t('act_stay')}` : `🦮 ${t('act_follow')}`, () => { g.toggleFollow(a); ui.renderPanel(); }));
  acts.push(btn(`📍 ${t('callHere')}`, () => g.callHere(a)));
  acts.push(btn(`🩺 ${t('act_vet')}${money(ui, g.vetCost(false))}`, () => ui.openVet(a, false), { cls: a.sick ? 'primary' : '' }));
  acts.push(btn(`✏️ ${t('rename')}`, async () => {
    const name = await ui.prompt(t('newName'), a.name);
    if (name) {
      g.rename(a, name);
      ui.renderPanel();
    }
  }));
  out.push(h('h3', {}, t('activities')), h('div', { class: 'grid' }, acts));

  // Équipement
  const gearItems = Object.entries(GEAR).filter(([, d]) => d.species.includes(a.species));
  if (gearItems.length) {
    out.push(h('h3', {}, t('gearTitle')), gearSection(ui, a, gearItems));
  }

  // Laine et lait
  if (sp.product) {
    const prod = sp.product;
    out.push(h('h3', {}, t(`product_${prod.id}`)));
    if (canProduce(a)) {
      out.push(h('div', { class: 'bars small' }, bar(t(`product_${prod.id}`), a.produce ?? 0)),
        h('div', { class: 'grid' }, btn(`${prod.id === 'wool' ? '🧶' : '🥛'} ${t(`act_${prod.action}`)}${isSandbox(g.profile) ? '' : ` · +${prod.value} 🪙`}`,
          () => ui.collectWithGame(a), { disabled: !a.produceReady, cls: a.produceReady ? 'primary' : '' })));
    } else {
      out.push(h('p', { class: 'note' }, t(prod.females ? 'productFemales' : 'productAdults')));
    }
  }

  // Chien de troupeau
  if (a.species === 'dog') {
    const skill = a.skills.herding ?? 0;
    const able = skill >= 25;
    out.push(h('h3', {}, `🐑 ${t('herdDog')}`),
      h('p', { class: 'note' }, able ? t('herdDogHelp', { g: a.sex }) : t('herdDogTrain', { n: Math.round(skill), g: a.sex })),
      h('div', { class: 'grid' },
        btn(a.role === 'herder' ? `✅ ${t('herderIs', { g: a.sex })}` : t('herderMake', { g: a.sex }), () => { g.setHerder(a, a.role !== 'herder'); ui.renderPanel(); }, { disabled: !able, cls: a.role === 'herder' ? 'done' : '' }),
        btn(`🏠 ${t('herdIn')}`, () => g.startHerding('pen', g.entities.get(a.id)), { disabled: !able }),
        btn(`🌿 ${t('herdOut')}`, () => g.startHerding('field', g.entities.get(a.id)), { disabled: !able })));
  }

  out.push(h('h3', {}, t('training')), h('div', { class: 'grid' },
    sp.training.map((x) => btn(t(`tr_${x}`), () => g.train(a, x), { disabled: stage === 'baby' })),
  ), h('div', { class: 'bars small' },
    Object.entries(a.skills).map(([k, v]) => bar(t(`skill_${k}`), v)),
  ));

  out.push(h('h3', {}, t('tricks')), h('div', { class: 'grid' },
    sp.tricks.map((x) => {
      const p = a.tricks[x] ?? 0;
      return btn(h('span', {}, t(`trick_${x}`), h('small', {}, p >= 100 ? ` ✅ ${t('learned')}` : ` ${p} %`)),
        () => g.trick(a, x), { disabled: p >= 100, cls: p >= 100 ? 'done' : '' });
    }),
  ));

  const partners = g.breedingPartners(a);
  const fam = partners.map((b) => {
    const r = g.canBreed(a, b);
    return btn(`🍼 ${t('breedWith', { name: b.name })}`, () => g.breed(a, b), { disabled: !r.ok });
  });
  out.push(h('h3', {}, t('breedTitle')),
    fam.length ? h('div', { class: 'grid' }, fam) : h('p', { class: 'note' }, t('breedNone')));
  return out;
}

// ---------------------------------------------------------------- liste

export function openAnimals(ui) {
  const g = ui.game;
  ui.openPanel({
    title: t('allAnimals'),
    live: true,
    render: () => {
      const p = g.profile;
      if (!p.animals.length) return [h('p', { class: 'note' }, t('noAnimals'))];
      const cards = p.animals.map((a) => {
        const m = mood(a);
        const here = a.location === p.place;
        return h('button', { class: 'card', onClick: () => ui.openAnimal(a) },
          h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
          h('span', { class: 'card-main' },
            h('b', {}, `${a.name} ${sexIcon(a)}`),
            h('small', {}, `${speciesName(a)} · ${breedName(a)} · ${ageText(a)}`),
            h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: { width: `${happiness(a)}%` } }))),
          h('span', { class: 'card-side' }, MOOD_EMOJI[m], h('small', {}, here ? '' : PLACES[a.location].flag)));
      });
      const out = [h('div', { class: 'cards' }, cards)];
      if (p.memorial.length) {
        out.push(h('h3', {}, `🌈 ${t('memorial')}`), h('ul', { class: 'memorial' },
          p.memorial.map((x) => h('li', {}, `${SPECIES[x.species].emoji} ${x.name} — ${t('years', { n: x.years })}`))));
      }
      return out;
    },
  });
}

// ---------------------------------------------------------------- adoption

export function openAdoption(ui) {
  const g = ui.game;
  const home = g.isHome;
  const render = () => {
    const list = adoptionCandidates(g.profile.place, g.day, g.profile.adoptedKeys, g.isHome);
    if (!list.length) return [h('p', { class: 'note' }, t('nothingToday'))];
    return [h('div', { class: 'cards' }, list.map((a) => {
      const price = adoptionPrice(a);
      const afford = canAfford(g.profile, price);
      return h('div', { class: 'card adopt' },
        h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
        h('span', { class: 'card-main' },
          h('b', {}, `${a.name} ${sexIcon(a)}`),
          h('small', {}, `${speciesName(a)} · ${breedName(a)} · ${L(a.look.colorName)}`),
          h('small', {}, `${ageText(a)} · ${t(`p_${a.personality}`, { g: a.sex })}`)),
        h('span', { class: 'swatch-dot', style: { background: hexColor(a.look.coat) } }),
        h('button', {
          class: 'primary',
          disabled: !afford,
          onClick: async () => {
            const name = await ui.prompt(t('chooseName'), a.name);
            if (name === null) return;
            g.adopt(a, name);
            ui.renderPanel();
          },
        }, `${t('adopt')}${isSandbox(g.profile) ? '' : ` · ${price} 🪙`}`));
    }))];
  };
  ui.openPanel({ title: `${home ? '🐾' : '🏡'} ${home ? t('refuge') : `${t('breeder')} ${g.placeDef.flag}`}`, render });
}

// ---------------------------------------------------------------- vétérinaire

export function openVetClinic(ui) {
  const g = ui.game;
  ui.openPanel({
    title: `🩺 ${t('vetTitle')}`,
    render: () => {
      const here = g.animalsHere();
      if (!here.length) return [h('p', { class: 'note' }, t('noAnimals'))];
      return [h('p', {}, t('vetChoose')), h('div', { class: 'cards' }, here.map((a) => h('button', {
        class: `card ${a.sick ? 'sick' : ''}`,
        onClick: () => ui.openVet(a, true),
      },
      h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
      h('span', { class: 'card-main' }, h('b', {}, a.name), h('small', {}, `${t('health')} : ${Math.round(a.health)}`)),
      h('span', { class: 'card-side' }, a.sick ? '🤒' : '💚'))))];
    },
  });
}

// ---------------------------------------------------------------- voyage

export function openTravel(ui) {
  const g = ui.game;
  const state = { dest: null, mode: null, bring: new Set(g.animalsHere().map((a) => a.id)) };
  const render = () => {
    const p = g.profile;
    const from = PLACES[p.place];
    const places = PLACE_IDS.map((id) => {
      const pl = PLACES[id];
      const current = id === p.place;
      return h('button', {
        class: `card place ${state.dest === id ? 'selected' : ''}`,
        disabled: current,
        onClick: () => { state.dest = id; state.mode = null; ui.renderPanel(); },
      },
      h('span', { class: 'card-emoji' }, pl.flag),
      h('span', { class: 'card-main' }, h('b', {}, `${id === p.home ? '🏠 ' : ''}${L(pl.name)}`), h('small', {}, L(pl.region))),
      h('span', { class: 'card-side' }, current ? h('small', {}, t('currentPlace')) : h('small', {}, t('km', { n: distanceKm(from, pl) }))));
    });
    const out = [h('div', { class: 'cards' }, places)];
    if (!state.dest) return out;

    const here = g.animalsHere();
    const travelers = here.filter((a) => state.bring.has(a.id));
    if (here.length) {
      out.push(h('h3', {}, t('bring')), h('div', { class: 'row wrap' },
        h('button', { class: 'small', onClick: () => { here.forEach((a) => state.bring.add(a.id)); ui.renderPanel(); } }, t('bringAll')),
        h('button', { class: 'small', onClick: () => { state.bring.clear(); ui.renderPanel(); } }, t('bringNone'))),
      h('div', { class: 'checks' }, here.map((a) => h('label', { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: state.bring.has(a.id),
          onChange: (e) => { if (e.target.checked) state.bring.add(a.id); else state.bring.delete(a.id); ui.renderPanel(); },
        }),
        ` ${SPECIES[a.species].emoji} ${a.name}`))),
      h('p', { class: 'note' }, t('leftBehind')));
    }

    out.push(h('h3', {}, t('chooseMode')));
    const opts = g.travelOptions(state.dest, travelers);
    out.push(h('div', { class: 'cards' }, opts.map((o) => {
      const mode = TRAVEL_MODES[o.mode];
      const d = o.ok ? Math.floor(o.hours / 24) : 0;
      const hh = o.ok ? Math.round(o.hours % 24) : 0;
      const detail = o.ok
        ? `${d ? t('durationDays', { d, h: hh }) : t('duration', { h: Math.max(1, Math.round(o.hours)) })}${isSandbox(g.profile) ? '' : ` · ${t('travelCost', { n: o.cost })}`}`
        : t(`tr_${o.reason}`);
      return h('button', {
        class: `card mode ${state.mode === o.mode ? 'selected' : ''}`,
        disabled: !o.ok,
        onClick: () => { state.mode = o.mode; ui.renderPanel(); },
      }, h('span', { class: 'card-emoji' }, mode.emoji), h('span', { class: 'card-main' }, h('b', {}, t(`mode_${o.mode}`)), h('small', {}, detail)));
    })));
    out.push(h('button', {
      class: 'primary big',
      disabled: !state.mode,
      onClick: () => {
        if (g.travel(state.dest, state.mode, [...state.bring])) ui.closePanel();
      },
    }, `${t('go')} ${PLACES[state.dest].flag}`));
    return out;
  };
  ui.openPanel({ title: `🧭 ${t('travelTitle')}`, render });
}

// ---------------------------------------------------------------- journal

export function openJournal(ui) {
  const g = ui.game;
  const state = { tab: 'quest' };
  ui.openPanel({
    title: `📖 ${t('journal')}`,
    live: true,
    render: () => {
      const p = g.profile;
      const tabs = h('div', { class: 'tabs' },
        ['quest', 'achievement'].map((k) => h('button', {
          class: state.tab === k ? 'active' : '',
          onClick: () => { state.tab = k; ui.renderPanel(); },
        }, k === 'quest' ? `🎯 ${t('quests')}` : `🏆 ${t('achievements')}`)));
      const list = OBJECTIVES.filter((o) => o.kind === state.tab).map((o) => {
        const done = p.completed.includes(o.id);
        const [cur, max] = o.progress(p);
        return h('div', { class: `objective ${done ? 'done' : ''}` },
          h('span', { class: 'obj-icon' }, done ? '✅' : o.kind === 'quest' ? '🎯' : '🏆'),
          h('span', { class: 'card-main' },
            h('b', {}, t(`o_${o.id}`)),
            h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: { width: `${Math.min(100, (cur / max) * 100)}%` } }))),
          h('small', {}, `${Math.min(cur, max)}/${max}${o.reward && !isSandbox(p) ? ` · ${o.reward} 🪙` : ''}`));
      });
      return [tabs, h('div', { class: 'objectives' }, list)];
    },
  });
}

// ---------------------------------------------------------------- petits boulots

export function openJobs(ui) {
  const g = ui.game;
  ui.openPanel({
    title: `📋 ${t('jobsTitle')}`,
    render: () => [
      isSandbox(g.profile) ? h('p', { class: 'note' }, t('jobsSandbox')) : null,
      h('div', { class: 'cards' }, JOBS.map((j) => h('button', { class: 'card', onClick: () => g.doJob(j) },
        h('span', { class: 'card-emoji' }, { walk: '🐕', catsit: '🐈', stable: '🧹', hay: '🌾' }[j.id]),
        h('span', { class: 'card-main' }, h('b', {}, t(`job_${j.id}`)), h('small', {}, t('hours', { n: j.hours }))),
        h('span', { class: 'card-side' }, `+${j.pay} 🪙`)))),
    ],
  });
}

// ---------------------------------------------------------------- réglages

export function openSettings(ui) {
  const g = ui.game;
  ui.openPanel({
    title: `⚙️ ${t('settings')}`,
    render: () => {
      const quality = (() => {
        try { return localStorage.getItem('animaleana.quality') ?? g.quality; } catch { return g.quality; }
      })();
      return [
        h('h3', {}, t('camera')),
        h('div', { class: 'row' }, ['third', 'first'].map((m) => h('button', {
          class: g.rig.mode === m ? 'primary' : '',
          onClick: () => { if (g.rig.mode !== m) g.toggleCamera(); ui.renderPanel(); },
        }, t(m === 'third' ? 'cameraThird' : 'cameraFirst')))),
        h('h3', {}, t('quality')),
        h('div', { class: 'row' }, ['high', 'low'].map((q) => h('button', {
          class: quality === q ? 'primary' : '',
          onClick: () => { g.setQuality(q); location.reload(); },
        }, t(q === 'high' ? 'qualityHigh' : 'qualityLow')))),
        h('h3', {}, t('timeSpeed')),
        h('div', { class: 'row wrap' }, ['slow', 'normal', 'fast'].map((sp) => h('button', {
          class: (g.profile.settings.timeSpeed ?? 'normal') === sp ? 'primary' : '',
          onClick: () => { g.profile.settings.timeSpeed = sp; ui.renderPanel(); },
        }, t(`speed_${sp}`)))),
        h('h3', {}, t('onScreenControls')),
        h('div', { class: 'row' }, [[true, 'onScreenOn'], [false, 'onScreenOff']].map(([on, key]) => h('button', {
          class: ui.onScreenControls() === on ? 'primary' : '',
          onClick: () => { ui.setOnScreenControls(on); ui.renderPanel(); },
        }, t(key)))),
        h('h3', {}, t('language')),
        h('div', { class: 'row' }, [['fr', 'Français'], ['en', 'English']].map(([l, name]) => h('button', {
          class: getLang() === l ? 'primary' : '',
          onClick: () => {
            setLang(l);
            g.save();
            g.loadPlace(g.profile.place);
            ui.buildHud();
            ui.refresh();
            ui.renderPanel();
          },
        }, name))),
        h('p', { class: 'note' }, t('controlsHelp')),
        h('button', {
          class: 'danger big',
          onClick: () => {
            g.stop();
            ui.closePanel();
            ui.toast(t('saved'));
            ui.showProfiles();
          },
        }, t('quit')),
      ];
    },
  });
}

// ---------------------------------------------------------------- ferme

export function openFarm(ui) {
  const g = ui.game;
  const state = { tab: 'equipment' };
  ui.openPanel({
    title: `🚜 ${t('farm')}`,
    live: true,
    render: () => {
      const p = g.profile;
      const sandbox = isSandbox(p);
      const tabs = h('div', { class: 'tabs' }, [['equipment', `🥣 ${t('equipment')}`], ['helpers', `🧑‍🌾 ${t('helpers')}`], ['herd', `🐑 ${t('herd')}`]]
        .map(([k, label]) => h('button', { class: state.tab === k ? 'active' : '', onClick: () => { state.tab = k; ui.renderPanel(); } }, label)));
      const out = [tabs];

      if (state.tab === 'equipment') {
        out.push(h('p', { class: 'note' }, t('equipmentHelp')));
        out.push(h('div', { class: 'cards' }, Object.entries(EQUIPMENT).map(([type, def]) => {
          const owned = g.equipment.find((q) => q.eq.type === type);
          const who = def.serves.map((sid) => SPECIES[sid].emoji).join(' ');
          let side;
          if (!owned && !g.isUnlocked(type)) {
            side = h('span', { class: 'lock' }, `🔒 ${t('level', { n: g.unlockLevel(type) })}`);
          } else if (!owned) {
            side = h('button', { class: 'primary', onClick: () => { g.buyEquipment(type); ui.renderPanel(); } }, sandbox ? t('install') : `${t('install')} · ${def.price} 🪙`);
          } else if (def.stock !== null && !sandbox) {
            side = h('button', { onClick: () => { g.refillEquipment(owned.eq); ui.renderPanel(); }, disabled: owned.eq.stock >= def.stock },
              `${t('refill')} · ${def.refill} 🪙`);
          } else {
            side = h('span', { class: 'card-side' }, '✅');
          }
          return h('div', { class: 'card' },
            h('span', { class: 'card-emoji' }, def.emoji),
            h('span', { class: 'card-main' },
              h('b', {}, t(`eq_${type}`)),
              h('small', {}, `${who} · ${t(`eqd_${type}`)}`),
              owned && def.stock !== null && !sandbox
                ? h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: { width: `${(owned.eq.stock / def.stock) * 100}%` } }))
                : null),
            side);
        })));
      }

      if (state.tab === 'helpers') {
        out.push(h('p', { class: 'note' }, sandbox ? t('helpersHelpSandbox') : t('helpersHelp')));
        out.push(h('div', { class: 'cards' }, Object.entries(HELPERS).map(([type, def]) => {
          const hired = p.helpers.find((x) => x.type === type && x.place === p.place);
          const locked = !hired && !g.isUnlocked(type);
          const duties = hired && def.actions ? h('div', { class: 'duties' },
            h('small', {}, t('dutiesTitle', { g: hired.sex })),
            h('div', { class: 'checks' }, def.actions.map((act) => h('label', { class: 'check' }, h('input', {
              type: 'checkbox',
              checked: (hired.duties ?? def.actions).includes(act),
              onChange: (e) => {
                const cur = new Set(hired.duties ?? def.actions);
                if (e.target.checked) cur.add(act); else cur.delete(act);
                hired.duties = [...cur];
              },
            }), ` ${t(`act_${act}`)}`)))) : null;
          if (locked) {
            return h('div', { class: 'card locked' },
              h('span', { class: 'card-emoji' }, def.emoji),
              h('span', { class: 'card-main' }, h('b', {}, t(`helper_${type}`)), h('small', {}, t(`helperd_${type}`))),
              h('span', { class: 'lock' }, `🔒 ${t('level', { n: g.unlockLevel(type) })}`));
          }
          return h('div', { class: `card ${duties ? 'with-duties' : ''}` },
            h('span', { class: 'card-emoji' }, def.emoji),
            h('span', { class: 'card-main' },
              h('b', {}, hired ? `${hired.name} · ${t(`helper_${type}`, { g: hired.sex })}` : t(`helper_${type}`)),
              h('small', {}, t(`helperd_${type}`))),
            hired
              ? h('button', { onClick: async () => { if (await ui.confirm(t('fireConfirm', { name: hired.name }))) { g.fire(hired.id); ui.renderPanel(); } } }, t('fire'))
              : h('button', { class: 'primary', onClick: () => { g.hire(type); ui.renderPanel(); } }, sandbox ? t('hire') : `${t('hire')} · ${def.salary} 🪙/${t('perDay')}`),
            duties);
        })));
      }

      if (state.tab === 'herd') {
        const flock = g.animalsHere().filter((a) => SPECIES[a.species].livestock);
        const herder = g.herder();
        out.push(h('p', { class: 'note' }, t('herdHelp')));
        out.push(h('p', {}, herder ? t('herderNow', { name: herder.data.name }) : t('noHerder')));
        out.push(h('p', {}, flock.length ? t('flockCount', {
          n: flock.length,
          pen: flock.filter((a) => (a.zone ?? 'pen') === 'pen').length,
          field: flock.filter((a) => a.zone === 'field').length,
        }) : t('noFlock')));
        out.push(h('div', { class: 'grid' },
          h('button', { class: 'act', disabled: !herder || !flock.length || !!g.herding.active, onClick: () => g.startHerding('pen') }, `🏠 ${t('herdIn')}`),
          h('button', { class: 'act', disabled: !herder || !flock.length || !!g.herding.active, onClick: () => g.startHerding('field') }, `🌿 ${t('herdOut')}`)));
        out.push(h('label', { class: 'check' }, h('input', {
          type: 'checkbox',
          checked: p.farm.autoHerd,
          onChange: (e) => { p.farm.autoHerd = e.target.checked; },
        }), ` ${t('autoHerd')}`));
      }
      return out;
    },
  });
}

function gearSection(ui, a, items) {
  const g = ui.game;
  const p = g.profile;
  return h('div', { class: 'gear-list' }, items.map(([item, def]) => {
    const worn = a.gear?.[def.slot]?.item === item;
    const free = owned(p, item) - inUse(p, item);
    const colors = def.colors ? h('div', { class: 'swatches small' }, Object.entries(BLANKET_COLORS).map(([key, c]) => h('button', {
      class: `swatch-btn ${worn && a.gear[def.slot].color === key ? 'selected' : ''}`,
      style: { background: `#${c.toString(16).padStart(6, '0')}` },
      'aria-label': key,
      onClick: () => { g.equip(a, item, key); ui.renderPanel(); },
    }))) : null;
    return h('div', { class: 'gear-row' },
      h('span', { class: 'gear-name' }, `${def.emoji} ${t(`gear_${item}`)}`),
      worn
        ? h('button', { class: 'small', onClick: () => { g.unequip(a, def.slot); ui.renderPanel(); } }, t('gearRemove'))
        : h('button', { class: 'small primary', disabled: free <= 0 && !def.colors, onClick: () => { g.equip(a, item); ui.renderPanel(); } },
          free > 0 ? t('gearPut') : t('gearNone')),
      colors);
  }));
}

// ---------------------------------------------------------------- sellerie

export function openTack(ui) {
  const g = ui.game;
  ui.openPanel({
    title: `🏇 ${t('tackRoom')}`,
    render: () => {
      const p = g.profile;
      const sandbox = isSandbox(p);
      return [
        h('p', { class: 'note' }, t('tackHelp')),
        h('div', { class: 'cards' }, Object.entries(GEAR).map(([item, def]) => h('div', { class: 'card' },
          h('span', { class: 'card-emoji' }, def.emoji),
          h('span', { class: 'card-main' },
            h('b', {}, t(`gear_${item}`)),
            h('small', {}, `${def.species.map((sid) => SPECIES[sid].emoji).join(' ')} · ${t(`geard_${item}`)}`),
            h('small', {}, t('gearOwned', { n: owned(p, item), used: inUse(p, item) }))),
          h('button', { class: 'primary', onClick: () => { g.buyGear(item); ui.renderPanel(); } },
            sandbox ? t('buy') : `${t('buy')} · ${def.price} 🪙`)))),
        h('h3', {}, t('gearOnAnimals')),
        h('div', { class: 'cards' }, g.animalsHere().filter((a) => Object.values(GEAR).some((d) => d.species.includes(a.species)))
          .map((a) => h('button', { class: 'card', onClick: () => ui.openAnimal(a) },
            h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
            h('span', { class: 'card-main' }, h('b', {}, a.name),
              h('small', {}, Object.values(a.gear ?? {}).map((x) => GEAR[x.item].emoji).join(' ') || t('gearNothing')))))),
      ];
    },
  });
}

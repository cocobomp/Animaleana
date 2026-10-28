// Fenêtres du jeu : fiche d'un animal, liste, adoption, voyage, journal, petits boulots, réglages.

import { checkForUpdate } from './updates.js';
import { dogTrainerSection, trainingBadge } from './dogTrainer.js'; // éducateur canin : séances dans la fiche, badge
import { isTrainingClient } from '../sim/dogTrainer.js';
import { h, bar, hexColor } from './dom.js';
import { t, L, getLang, setLang } from '../i18n.js';
import { SPECIES, getBreed, allOffered, anyAvailable, LIVESTOCK_IDS } from '../sim/species.js';
import { NEEDS, CARE, happiness, mood, lifeStage, ageYears, canRide, weightClass } from '../sim/animal.js';
import { DAYS_PER_YEAR } from '../sim/time.js';
import { adoptionCandidates, adoptionPrice, shopPrice, shopBreeds, AGE_STAGES, stageAgeDays } from '../sim/adoption.js';
import { createAnimal, freeName, namesInUse } from '../sim/animal.js';
import { PLACES, PLACE_IDS, distanceKm, TRAVEL_MODES } from '../sim/places.js';
import { OBJECTIVES, objectiveShown, objectiveParams } from '../sim/objectives.js';
import { canAfford, isSandbox } from '../sim/profile.js';
import { JOBS } from '../game/Game.js';
import { EQUIPMENT, HELPERS, canProduce, equipmentShown, helperShown } from '../sim/farm.js';
import { speciesName, coatName, coatLabel, availableEmojis } from './names.js';
import { GEAR } from '../sim/gear.js';
import { openTackShop, animalGearSection } from './tack.js'; // sellerie : catalogue, fiches, équipement
import { hasTool } from '../sim/tools.js';
import { audio } from '../game/audio.js'; // réglage des sons
import { facilitiesTab } from './facilitiesPanel.js'; // onglet « Bâtiments »
import { homeSection } from './construction.js'; // rubrique « Maison » (constructions)
import { groomingSection } from './groomer.js'; // métier Toiletteur : coupe et accessoires
import { travelAdvice } from './trip.js'; // voyages réalistes
import { questsTab } from './quests.js'; // onglet Quêtes : histoire de la ferme, mes quêtes, autres quêtes, terminées
import { animalActivitySection } from './activities.js';
import { competitionSection, journalCalendarButton } from './competitions.js'; // concours à l'extérieur, dressage
import { clientBadge, clientInfo, clientsTab } from './clients.js'; // animaux confiés par des clients
import { isCareerPatient } from './vet.js'; // animal confié en soins, métier commencé : examen gratuit
import { openExport, pickRestoreFile } from './saveGame.js'; // 💾 sauvegarder / 📂 restaurer une partie (fichier)
import { thumb, portraitSpec } from '../game/thumbScenes.js'; // vignettes 3D (animalerie, voyage, portrait de la fiche)

const MOOD_EMOJI = { happy: '😄', ok: '🙂', sad: '😢', sick: '🤒' };
const CARE_ICONS = {
  feed: '🍖', water: '💧', brush: '🪮', wash: '🫧', clean: '🧹', nails: '✂️', shoe: '🔨', pet: '🤚', treat: '🍪',
};

export function breedName(a) {
  if (a.breed === 'mix') return t('mixBreed');
  return L(getBreed(a.species, a.breed)?.name);
}

/** Prénom proposé à l'adoption : celui du refuge, sauf si un de nos animaux le porte déjà. */
function suggestedName(profile, name) {
  const taken = namesInUse(profile);
  const key = (n) => n.trim().toLocaleLowerCase('fr');
  return taken.some((n) => key(n) === key(name)) ? freeName(taken) : name;
}

export function ageText(a) {
  const y = ageYears(a);
  if (y < 1) return t('months', { n: Math.max(0, Math.floor((a.ageDays / DAYS_PER_YEAR) * 12)) });
  return t('years', { n: Math.floor(y) });
}

const sexIcon = (a) => (a.sex === 'f' ? '♀' : '♂');

function actionLabel(a, action) {
  if (action === 'clean') return t(`act_${a.species}_clean`) || t('act_clean');
  if (action === 'brush' && a.species === 'horse') return t('act_horse_brush');
  return t(`act_${action}`);
}

function money(ui, n) {
  return isSandbox(ui.game.profile) || !n ? '' : ` · ${n} 🪙`;
}

/** Petite fiche d'identité : espèce, race, âge, sexe, caractère, robe. pic : vignette 3D (sinon l'emoji). */
/**
 * Vignette 3D d'un animal du jeu (refuge, fiche) : la même fabrique que l'animalerie (src/game/thumbScenes.js),
 * avec sa race, sa robe, son sexe, son âge et sa graine de marques. null si sa robe n'est pas au catalogue de
 * la race (croisement) : on garde alors l'emoji.
 */
export function animalThumbSpec(a) {
  const breed = getBreed(a.species, a.breed);
  if (!breed?.colors?.length || !a.look) return null;
  const same = (c) => c.coat === a.look.coat && (c.pattern ?? breed.pattern) === a.look.pattern;
  let ci = breed.colors.findIndex((c) => same(c) && (c.secondary ?? null) === (a.look.secondary ?? null));
  if (ci < 0) ci = breed.colors.findIndex(same);
  if (ci < 0) return null;
  const st = lifeStage(a);
  return { kind: 'animal', species: a.species, breed: breed.id, colorIndex: ci, sex: a.sex, stage: st === 'senior' ? 'adult' : st, seed: a.look.seed };
}

/** Élément vignette (ou emoji) d'un animal du jeu, w × h pixels affichés. */
function animalPic(g, a, w, hh, cls = '') {
  const emoji = SPECIES[a.species].emoji;
  const spec = animalThumbSpec(a);
  if (!spec || !g) return h('span', { class: cls ? `card-emoji ${cls}` : 'card-emoji' }, emoji);
  return thumb(g, spec, { w, h: hh, emoji, cls, alt: a.name ?? '' });
}

export function animalCard(a, pic = null) {
  const row = (k, v) => h('div', { class: 'id-row' }, h('span', {}, k), h('b', {}, v));
  return h('div', { class: 'id-card' },
    h('div', { class: 'id-head' },
      pic ?? h('span', { class: 'id-emoji' }, SPECIES[a.species].emoji),
      h('span', { class: 'swatch-dot', style: { background: hexColor(a.look.coat) } })),
    row(t('species'), speciesName(a)),
    row(t('breed'), breedName(a)),
    row(t('age'), `${ageText(a)} · ${t(`stage_${lifeStage(a)}`)}`),
    row(t('sexLabel'), `${sexIcon(a)} ${t(a.sex === 'f' ? 'female' : 'male')}`),
    row(t('personality'), t(`p_${a.personality}`, { g: a.sex })),
    row(t('coat'), coatName(a) || '—'));
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

  // En-tête : la vignette 3D de l'animal (même fabrique que l'animalerie) à côté de ses étiquettes.
  const pic = animalThumbSpec(a) ? animalPic(g, a, 96, 72, 'animal-thumb') : null;
  const info = h('div', { class: 'animal-info' },
    h('div', { class: pic ? 'animal-head' : '' }, pic, h('div', { class: 'chips' },
      h('span', { class: 'chip' }, `${speciesName(a)} · ${breedName(a)}`),
      h('span', { class: 'chip' }, `${sexIcon(a)} ${t(a.sex === 'f' ? 'female' : 'male')}`),
      h('span', { class: 'chip' }, `${ageText(a)} · ${t(`stage_${stage}`)}`),
      h('span', { class: 'chip' }, t(`p_${a.personality}`, { g: a.sex })),
      a.pregnant ? h('span', { class: 'chip' }, `🤰 ${t('pregnantChip')}`) : null,
      h('span', { class: `chip weight-${weightClass(a)}` }, `⚖️ ${t(`weight_${weightClass(a)}`, { g: a.sex })}`),
      h('span', { class: `chip mood-${m}` }, `${MOOD_EMOJI[m]} ${t(`mood_${m}`, { g: a.sex })}`),
      h('span', { class: `chip swatch${lightCoat(a.look.coat) ? ' light' : ''}`, style: { background: hexColor(a.look.coat) } }, coatName(a)),
    )),
    a.sick ? h('p', { class: 'warn' }, `🤒 ${t('r_sick', { name: a.name, g: a.sex })}`) : null,
    clientInfo(a, g), // animal confié : propriétaire, jours restants, soin
    !here ? h('p', { class: 'note' }, t('isAt', { place: `${PLACES[a.location].flag} ${L(PLACES[a.location].name)}` })) : null,
  );

  const bars = h('div', { class: 'bars' },
    bar(t('health'), a.health, 'big'),
    bar(t('happiness'), happiness(a), 'big'),
    bar(`🤝 ${t('bond')}`, a.bond ?? 0, 'big'),
    NEEDS.map((n) => bar(t(`need_${n}`), a.needs[n])),
  );

  // Portrait de l'animal en tête de sa fiche (vignette 3D : sa robe, son âge, de trois quarts avant). Sur un
  // téléphone en hauteur, à côté des étiquettes (style.css, .animal-head) : au-dessus, il repoussait les boutons de
  // soins sous le bas de l'écran.
  const portrait = h('div', { class: 'animal-portrait' },
    thumb(g, portraitSpec(a, stage), { w: 240, h: 180, emoji: sp.emoji, cls: 'portrait-thumb', alt: a.name, hold: `portrait:${a.id}` }));
  const out = [h('div', { class: 'animal-head' }, portrait, info), bars];
  if (!here) return out;
  const training = isTrainingClient(a); // chien en éducation (métier éducateur canin) : ses séances d'abord
  if (training) out.push(...dogTrainerSection(ui, a));

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
  // Animal confié en soins et métier de vétérinaire commencé : c'est toi le docteur, sans prix affiché (gratuit).
  const vetLabel = isCareerPatient(g.profile, a) ? t('vx_examineDoctor') : `${t('act_vet')}${money(ui, g.vetCost(false))}`;
  acts.push(btn(`🩺 ${vetLabel}`, () => ui.openVet(a, false), { cls: a.sick ? 'primary' : '' }));
  if (hasTool(g.profile, 'firstAid')) acts.push(btn(`🧰 ${t('vetSelfTitle')}`, () => ui.openVet(a, 'self')));
  if (!a.client) acts.push(btn(`✏️ ${t('rename')}`, async () => { // (pas pour un animal confié)
    const name = await ui.prompt(t('newName'), a.name, animalCard(a));
    if (name) {
      g.rename(a, name);
      ui.renderPanel();
    }
  }));
  out.push(h('h3', {}, t('activities')), h('div', { class: 'grid' }, acts));

  // Équipement
  if (Object.values(GEAR).some((d) => d.species.includes(a.species))) {
    out.push(h('h3', {}, t('gearTitle')), gearSection(ui, a));
  }

  // Maison construite par le joueur (niche, paddock, ranch…)
  out.push(...homeSection(ui, a));
  out.push(...groomingSection(ui, a)); // salon de toilettage : coupe et accessoires (src/ui/groomer.js)

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

  // Chien de troupeau : seulement s'il peut y avoir un troupeau dans la partie (moutons, chèvres ou vaches
  // proposés ou déjà à la ferme : src/sim/species.js), ou s'il est déjà le chien de troupeau.
  const herdOn = anyAvailable(g.profile, LIVESTOCK_IDS) || a.role === 'herder';
  if (a.species === 'dog' && herdOn) {
    const skill = a.skills.herding ?? 0;
    const able = skill >= 25;
    out.push(h('h3', {}, `🐑 ${t('herdDog')}`),
      h('p', { class: 'note' }, able ? t('herdDogHelp', { g: a.sex }) : t('herdDogTrain', { n: Math.round(skill), g: a.sex })),
      h('div', { class: 'grid' },
        btn(a.role === 'herder' ? `✅ ${t('herderIs', { g: a.sex })}` : t('herderMake', { g: a.sex }), () => { g.setHerder(a, a.role !== 'herder'); ui.renderPanel(); }, { disabled: !able, cls: a.role === 'herder' ? 'done' : '' }),
        btn(`🏠 ${t('herdIn')}`, () => g.startHerding('pen', g.entities.get(a.id)), { disabled: !able }),
        btn(`🌿 ${t('herdOut')}`, () => g.startHerding('field', g.entities.get(a.id)), { disabled: !able })));
  }

  out.push(...animalActivitySection(ui, a)); // activités : saut, balade, agility, spectacle
  out.push(...competitionSection(ui, a)); // chevaux : carrière sportive (dressage, saut, concours)

  if (!training) out.push(...dogTrainerSection(ui, a)); // éducateur canin : coaching de ses propres animaux

  if (a.client) return out; // animal confié : ni entraînement, ni tours, ni bébés (il repart bientôt)
  // (« Conduite de troupeau » et la jauge Troupeau : seulement quand un troupeau est possible, voir herdOn)
  out.push(h('h3', {}, t('training')), h('div', { class: 'grid' },
    sp.training.filter((x) => x !== 'herding' || herdOn).map((x) => btn(t(`tr_${x}`), () => g.train(a, x), { disabled: stage === 'baby' })),
  ), h('div', { class: 'bars small' },
    Object.entries(a.skills).filter(([k]) => k !== 'herding' || herdOn).map(([k, v]) => bar(t(`skill_${k}`), v)),
  ));

  out.push(h('h3', {}, t('tricks')), h('div', { class: 'grid' },
    sp.tricks.map((x) => {
      const p = a.tricks[x] ?? 0;
      return btn(h('span', {}, t(`trick_${x}`), h('small', {}, p >= 100 ? ` ✅ ${t('learned')}` : ` ${p} %`)),
        () => g.trick(a, x), { disabled: p >= 100, cls: p >= 100 ? 'done' : '' });
    }),
  ));

  // Bébés : une liste de conditions à remplir, pour donner envie de bien s'occuper des parents.
  out.push(h('h3', {}, t('breedTitle')));
  if (a.pregnant) {
    out.push(h('p', { class: 'note' }, `🤰 ${t('pregnantInfo', { name: a.name, n: Math.max(0, a.pregnant.due - g.day) })}`));
  } else {
    const partners = g.breedingPartners(a);
    if (!partners.length) out.push(h('p', { class: 'note' }, t('breedNone')));
    for (const b of partners) {
      const list = g.breedingChecklist(a, b);
      const ok = list.every((c) => c.ok);
      out.push(h('div', { class: 'breed-box' },
        h('b', {}, t('breedWith', { name: b.name })),
        h('ul', { class: 'checklist' }, list.map((c) => h('li', { class: c.ok ? 'ok' : 'ko' },
          `${c.ok ? '✅' : '❌'} ${t(`bc_${c.id}`, { name: c.who, g: c.g, n: c.n })}`))),
        btn(`💕 ${t('breedGo')}`, () => { g.breed(a, b); ui.renderPanel(); }, { disabled: !ok, cls: ok ? 'primary' : '' })));
    }
  }
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
            clientBadge(a, g) ?? trainingBadge(a), // 🏡 en pension / 🩺 en soins / 🐕 en éducation
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

/** Petit mot pour les enfants tant que toutes les espèces ne sont pas proposées (OFFERED_SPECIES). */
const moreSoonNote = () => (allOffered() ? null : h('p', { class: 'note more-soon' }, t('moreSoon')));

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
        animalPic(g, a, 72, 54, 'adopt-thumb'), // (vignette 3D de l'animal, comme à l'animalerie)
        h('span', { class: 'card-main' },
          h('b', {}, `${a.name} ${sexIcon(a)}`),
          h('small', {}, `${speciesName(a)} · ${breedName(a)} · ${coatName(a)}`),
          h('small', {}, `${ageText(a)} · ${t(`p_${a.personality}`, { g: a.sex })}`)),
        h('span', { class: 'swatch-dot', style: { background: hexColor(a.look.coat) } }),
        h('button', {
          class: 'primary',
          disabled: !afford,
          onClick: async () => {
            const name = await ui.prompt(t('chooseName'), suggestedName(g.profile, a.name), animalCard(a, animalThumbSpec(a) ? animalPic(g, a, 96, 72) : null));
            if (name === null) return;
            g.adopt(a, name);
            ui.renderPanel();
          },
        }, `${t('adopt')} · ${t('free')}`));
    }))];
  };
  ui.openPanel({ title: `🐾 ${t('refuge')}`, render: () => [h('p', { class: 'note' }, t('refugeHelp')), moreSoonNote(), ...render()] });
}

// ---------------------------------------------------------------- vétérinaire

export function openVetClinic(ui) {
  const g = ui.game;
  ui.openPanel({
    title: `🩺 ${t('vetTitle')}`,
    render: () => {
      const here = g.animalsHere();
      // 🎓 École vétérinaire : apprendre le métier (src/ui/vetSchool.js)
      const school = h('button', { class: 'small vs-open', onClick: () => ui.openVetSchool() }, `🎓 ${t('vs_open')}`);
      if (!here.length) return [h('p', { class: 'note' }, t('noAnimals')), school];
      return [h('p', {}, t('vetChoose')), h('div', { class: 'cards' }, here.map((a) => h('button', {
        class: `card ${a.sick ? 'sick' : ''}`,
        onClick: () => ui.openVet(a, true),
      },
      h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji),
      h('span', { class: 'card-main' }, h('b', {}, a.name), h('small', {}, `${t('health')} : ${Math.round(a.health)}`)),
      h('span', { class: 'card-side' }, a.sick ? '🤒' : '💚')))), school];
    },
  });
}

// ---------------------------------------------------------------- voyage

/** Véhicule de chaque façon de voyager (vignette 3D) ; le bateau et l'avion gardent leur emoji. */
const MODE_VEHICLE = { car: 'car', van: 'rig', horse: 'horse' };

function modePic(g, mode, emoji) {
  const id = MODE_VEHICLE[mode];
  if (!id) return h('span', { class: 'card-emoji' }, emoji);
  return thumb(g, { kind: 'vehicle', id }, { w: 92, h: 60, emoji, cls: 'veh-thumb', alt: '' });
}

export function openTravel(ui) {
  const g = ui.game;
  const state = { dest: null, mode: null, bring: new Set(g.animalsHere().filter((a) => !a.client).map((a) => a.id)) };
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

    const here = g.animalsHere().filter((a) => !a.client); // (les animaux confiés restent à la maison)
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
      }, modePic(g, o.mode, mode.emoji), h('span', { class: 'card-main' }, h('b', {}, t(`mode_${o.mode}`)), h('small', {}, detail)));
    })));
    // Voyage réaliste (ui/trip.js) : qui reste chez le voisin, véhicule, pauses, alerte long trajet.
    out.push(...travelAdvice(ui, { here, travelers, state, option: opts.find((o) => o.mode === state.mode) }));
    out.push(h('button', {
      class: 'primary big',
      disabled: !state.mode,
      onClick: () => {
        // On ne part plus directement : le véhicule se gare dans la cour (game/TripFlow.js).
        if (g.tripFlow.begin(state.dest, state.mode, [...state.bring].filter((id) => here.some((a) => a.id === id)))) ui.closePanel();
      },
    }, `${travelers.length ? t('trip_go') : t('trip_goAlone')} ${PLACES[state.dest].flag}`));
    return out;
  };
  ui.openPanel({ title: `🧭 ${t('travelTitle')}`, render });
}

// ---------------------------------------------------------------- journal

export function openJournal(ui, tab = 'quest') {
  const g = ui.game;
  const state = { tab };
  ui.openPanel({
    title: `📖 ${t('journal')}`,
    live: true,
    render: () => {
      const p = g.profile;
      const tabs = h('div', { class: 'tabs' },
        ['quest', 'achievement', 'clients'].map((k) => h('button', {
          class: state.tab === k ? 'active' : '',
          onClick: () => { state.tab = k; ui.renderPanel(); },
        }, k === 'quest' ? `🎯 ${t('quests')}` : k === 'clients' ? `🏷️ ${t('cl_tab')}` : `🏆 ${t('achievements')}`)));
      if (state.tab === 'clients') return [tabs, ...clientsTab(ui)]; // clients (src/ui/clients.js)
      // Quêtes : l'histoire de la ferme, mes quêtes, les autres quêtes par thème, les terminées (src/ui/quests.js).
      if (state.tab === 'quest') return [tabs, journalCalendarButton(ui), ...questsTab(ui)]; // + calendrier des concours
      const list = OBJECTIVES.filter((o) => o.kind === state.tab && objectiveShown(p, o)).map((o) => {
        const done = p.completed.includes(o.id);
        const [cur, max] = o.progress(p);
        return h('div', { class: `objective ${done ? 'done' : ''}` },
          h('span', { class: 'obj-icon' }, done ? '✅' : '🏆'),
          h('span', { class: 'card-main' },
            h('b', {}, t(`o_${o.id}`, objectiveParams(p, o))),
            h('span', { class: 'mini-track' }, h('span', { class: 'mini-fill', style: { width: `${Math.min(100, (cur / max) * 100)}%` } }))),
          h('small', {}, `${Math.min(cur, max)}/${max}${o.reward && !isSandbox(p) ? ` · ${o.reward} 🪙` : ''}`));
      });
      return [tabs, journalCalendarButton(ui), h('div', { class: 'objectives' }, list)]; // + calendrier des concours
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
      // (needs : un petit boulot avec une espèce pas encore proposée n'est pas affiché)
      h('div', { class: 'cards' }, JOBS.filter((j) => anyAvailable(g.profile, j.needs)).map((j) => h('button', { class: 'card', onClick: () => g.doJob(j) },
        h('span', { class: 'card-emoji' }, { walk: '🐕', catsit: '🐈', stable: '🧹', hay: '🌾' }[j.id]),
        h('span', { class: 'card-main' }, h('b', {}, t(`job_${j.id}`)), h('small', {}, t('hours', { n: j.hours }))),
        h('span', { class: 'card-side' }, `+${j.pay} 🪙`)))),
    ],
  });
}

// ---------------------------------------------------------------- réglages

/**
 * Réglages : mesures des vignettes 3D (combien, place en mémoire, temps de fabrication) — pour vérifier
 * sur le téléphone que rien ne pèse sur le jeu (src/game/thumbs.js).
 */
function thumbsLine(g) {
  const th = g.thumbs;
  if (!th) return null;
  if (!th.enabled) return h('p', { class: 'note' }, t('thumbsOff'));
  const s = th.stats();
  if (!s.made) return null;
  return h('p', { class: 'note' }, t('thumbsStats', {
    n: s.cacheCount, kb: Math.round(s.cacheBytes / 1024), ms: Math.round(s.avgCpuMs), max: Math.round(s.maxCpuMs),
  }));
}

export function openSettings(ui) {
  const g = ui.game;
  // Sons : s'applique tout de suite (src/game/audio.js) ; sauvegardé avec le profil.
  const sound = () => ({ on: true, volume: 0.7, ...(g.profile.settings.sound ?? {}) });
  const setSound = (patch) => {
    g.profile.settings.sound = { ...sound(), ...patch };
    audio.configure(g.profile.settings.sound);
    ui.renderPanel();
  };
  const VOLUMES = [[0.4, 'volLow'], [0.7, 'volMid'], [1, 'volHigh']];
  ui.openPanel({
    title: () => `⚙️ ${t('settings')}`, // (une fonction : le titre suit la langue choisie dans le panneau)
    render: () => {
      const quality = (() => {
        try { return localStorage.getItem('animaleana.quality') ?? g.quality; } catch { return g.quality; }
      })();
      const snd = sound();
      return [
        h('h3', {}, t('camera')),
        h('div', { class: 'row wrap' }, ['third', 'first'].map((m) => h('button', {
          class: g.rig.mode === m ? 'primary' : '',
          onClick: () => { if (g.rig.mode !== m) g.toggleCamera(); ui.renderPanel(); },
        }, t(m === 'third' ? 'cameraThird' : 'cameraFirst')))),
        h('h3', {}, t('quality')),
        h('div', { class: 'row wrap' }, ['high', 'low'].map((q) => h('button', {
          class: quality === q ? 'primary' : '',
          onClick: () => { g.setQuality(q); location.reload(); },
        }, t(q === 'high' ? 'qualityHigh' : 'qualityLow')))),
        thumbsLine(g),
        h('h3', {}, t('timeSpeed')),
        h('div', { class: 'row wrap' }, ['slow', 'normal', 'fast'].map((sp) => h('button', {
          class: (g.profile.settings.timeSpeed ?? 'normal') === sp ? 'primary' : '',
          onClick: () => { g.profile.settings.timeSpeed = sp; ui.renderPanel(); },
        }, t(`speed_${sp}`)))),
        h('h3', {}, `🔊 ${t('sound')}`),
        h('div', { class: 'row' }, [[true, 'soundOn'], [false, 'soundOff']].map(([on, key]) => h('button', {
          class: snd.on === on ? 'primary' : '',
          onClick: () => setSound({ on }),
        }, t(key)))),
        h('div', { class: 'row wrap' }, VOLUMES.map(([v, key]) => h('button', {
          class: snd.on && Math.abs(snd.volume - v) < 0.05 ? 'primary' : '',
          disabled: !snd.on,
          onClick: () => setSound({ volume: v }),
        }, t(key)))),
        h('h3', {}, t('onScreenControls')),
        h('div', { class: 'row wrap' }, [[true, 'onScreenOn'], [false, 'onScreenOff']].map(([on, key]) => h('button', {
          class: ui.onScreenControls() === on ? 'primary' : '',
          onClick: () => { ui.setOnScreenControls(on); ui.renderPanel(); },
        }, t(key)))),
        h('h3', {}, t('language')),
        h('div', { class: 'row wrap' }, [['fr', 'Français'], ['en', 'English']].map(([l, name]) => h('button', {
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
        // La partie dans un fichier (changer d'appareil, nouvelle adresse du jeu) : src/ui/saveGame.js.
        h('h3', {}, `💾 ${t('sv_section')}`),
        h('div', { class: 'save-tools' },
          h('button', {
            onClick: () => {
              const saved = g.save();
              // Pas pu écrire (stockage plein) : le fichier prend la partie en mémoire, la plus récente.
              // (En plein trajet, on garde la sauvegarde d'avant le départ, comme Game.save.)
              const travelling = g.tripFlow?.journey && !g.tripFlow.journey.report;
              openExport(ui, { ids: [g.profile.id], live: !saved && !travelling ? g.profile : null });
            },
          }, `💾 ${t('sv_save')}`),
          h('button', {
            onClick: () => {
              // D'abord écrire la partie : l'aperçu la compare au fichier, et la copie de secours (si on la
              // remplace) aura son tout dernier état. (Synchrone : le choix du fichier s'ouvre dans le même tap.)
              g.save();
              pickRestoreFile(ui);
            },
          }, `📂 ${t('sv_restore')}`)),
        h('p', { class: 'note' }, t('sv_why')),
        h('p', { class: 'note' }, t('controlsHelp')),
        // Revoir le tutoriel guidé (src/ui/tutorial.js).
        ui.tutorial ? h('button', { class: 'big', onClick: () => ui.tutorial.replay() }, `🎓 ${t('tuto_replay')}`) : null,
        // Mise à jour du jeu installé (src/ui/updates.js) : cherche, puis bandeau « Recharger » si une version est prête.
        h('button', {
          class: 'big',
          onClick: async (e) => {
            e.currentTarget.disabled = true;
            const r = await checkForUpdate();
            if (r !== 'ready') ui.toast(t(r === 'none' ? 'updateNone' : 'updateUnavailable'), 4500);
            ui.renderPanel();
          },
        }, `🔄 ${t('updateCheck')}`),
        h('button', {
          class: 'danger big',
          onClick: () => {
            const ok = g.stop();
            ui.closePanel();
            ui.toast(t(ok ? 'saved' : 'saveFailed'), ok ? 3000 : 6000);
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
      // (onglet du troupeau : seulement si moutons, chèvres ou vaches sont proposés, ou déjà à la ferme)
      const herdShown = anyAvailable(p, LIVESTOCK_IDS);
      if (state.tab === 'herd' && !herdShown) state.tab = 'equipment';
      const tabs = h('div', { class: 'tabs' }, [['equipment', `🥣 ${t('equipment')}`], ['helpers', `🧑‍🌾 ${t('helpers')}`], herdShown ? ['herd', `🐑 ${t('herd')}`] : null, ['buildings', `🏚️ ${t('fac_tab')}`]]
        .filter(Boolean).map(([k, label]) => h('button', { class: state.tab === k ? 'active' : '', onClick: () => { state.tab = k; ui.renderPanel(); } }, label)));
      const out = [tabs];

      if (state.tab === 'equipment') {
        out.push(h('p', { class: 'note' }, t('equipmentHelp')));
        // (pas de litière ni de mangeoire de bergerie tant que leurs espèces ne sont pas proposées : equipmentShown)
        out.push(h('div', { class: 'cards' }, Object.entries(EQUIPMENT).filter(([type]) => equipmentShown(p, type)).map(([type, def]) => {
          const owned = g.equipment.find((q) => q.eq.type === type);
          const who = availableEmojis(def.serves, p);
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
        out.push(h('div', { class: 'cards' }, Object.entries(HELPERS).filter(([type]) => helperShown(p, type)).map(([type, def]) => {
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
              ? h('span', { class: 'row' },
                h('button', { class: 'primary', onClick: () => ui.openHelper(hired) }, `💬 ${t('hc_talk')}`), // discuter, consignes, formation
                h('button', { onClick: async () => { if (await ui.confirm(t('fireConfirm', { name: hired.name }))) { g.fire(hired.id); ui.renderPanel(); } } }, t('fire')))
              : h('button', { class: 'primary', onClick: () => { g.hire(type); ui.renderPanel(); } }, sandbox ? t('hire') : `${t('hire')} · ${def.salary} 🪙/${t('perDay')}`),
            duties);
        })));
      }

      if (state.tab === 'buildings') out.push(...facilitiesTab(ui));

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

// Équipement de l'animal : par emplacement, avec ce qui lui va (src/ui/tack.js).
function gearSection(ui, a) {
  return animalGearSection(ui, a);
}

// ---------------------------------------------------------------- sellerie

export function openTack(ui, opts = {}) {
  // La sellerie a maintenant son catalogue et ses fiches (src/ui/tack.js) ; ce raccourci y mène.
  return openTackShop(ui, opts);
}

// ---------------------------------------------------------------- animalerie

/** Robe claire (chat blanc, Ragdoll, Sacré de Birmanie…) : texte foncé sur la pastille de la robe. */
function lightCoat(c = 0) {
  return (0.299 * ((c >> 16) & 255) + 0.587 * ((c >> 8) & 255) + 0.114 * (c & 255)) / 255 > 0.62;
}

/** Origine et caractère typique d'une race (fiche de la race choisie à l'animalerie). */
function breedNote(b) {
  const parts = [];
  if (b.from) parts.push(t('breedFrom', { place: L(b.from) }));
  if (b.temper?.length) parts.push(t('breedTemper', { list: b.temper.map((p) => t(`p_${p}`).toLowerCase()).join(', ') }));
  return parts.length ? h('small', { class: 'breed-note' }, parts.join(' · ')) : null;
}

/** Animalerie : on choisit l'espèce, la race, la couleur, le sexe et l'âge. C'est payant. */
export function openShop(ui) {
  const g = ui.game;
  const pool = shopBreeds(g.profile.place, g.isHome);
  const speciesList = [...new Set(pool.map((p) => p.species))];
  // seed : la graine de l'animal qu'on achètera (marques blanches, taches) — la même dans l'aperçu 3D.
  const st = { species: speciesList[0], breed: null, colorIndex: 0, sex: 'f', stage: 'young', seed: Math.floor(Math.random() * 1e6) };
  const render = () => {
    const breeds = pool.filter((p) => p.species === st.species).map((p) => p.breed);
    if (!breeds.find((b) => b.id === st.breed)) {
      st.breed = breeds[0].id;
      st.colorIndex = 0;
    }
    const breed = breeds.find((b) => b.id === st.breed);
    const price = shopPrice(st.species, st.breed, st.stage);
    const sandbox = isSandbox(g.profile);
    const preview = createAnimal({ species: st.species, breed: st.breed, colorIndex: st.colorIndex, sex: st.sex, ageDays: stageAgeDays(st.species, st.stage), name: '', seed: st.seed });
    const chip = (label, on, fn) => h('button', { class: `small ${on ? 'primary' : ''}`, onClick: () => { fn(); ui.renderPanel(); } }, label);
    // Vignettes 3D : l'animal tel qu'il sera (race, robe, sexe, âge), et chaque race de la liste (adulte, première robe).
    const emoji = SPECIES[st.species].emoji;
    const spec = { kind: 'animal', species: st.species, breed: st.breed, colorIndex: st.colorIndex, sex: st.sex, stage: st.stage, seed: st.seed };
    // (une seule image pour l'aperçu et la fiche : la grande sert aussi à la petite ; pendant qu'une nouvelle se
    // fait, l'ancienne reste sous un voile au lieu de redevenir un emoji — pour la même race seulement : une
    // autre race repart de l'emoji, sinon l'image de la race d'avant restait sous le nom de la nouvelle)
    const pic = (w, hh, cls) => thumb(g, spec, { w, h: hh, emoji, cls, urgent: true, alt: L(breed.name), hold: `shop:${st.species}:${st.breed}` });
    const coat = coatLabel(breed.colors[st.colorIndex % breed.colors.length], st.sex);
    return [
      h('p', { class: 'note' }, g.isHome ? t('shopHelp') : t('breederHelp')),
      moreSoonNote(),
      h('h3', {}, t('species')),
      h('div', { class: 'row wrap' }, speciesList.map((sid) => chip(`${SPECIES[sid].emoji} ${L(SPECIES[sid].name)}`, st.species === sid, () => { st.species = sid; }))),
      // Aperçu toujours visible en haut (il suit la liste quand on la fait défiler).
      h('div', { class: 'shop-preview', 'aria-live': 'polite' }, pic(132, 99, ''),
        h('div', { class: 'shop-preview-text' },
          h('b', {}, `${breed.from?.flag ? `${breed.from.flag} ` : ''}${L(breed.name)}`),
          h('small', {}, [coat, `${st.sex === 'f' ? '♀' : '♂'} ${t(st.sex === 'f' ? 'female' : 'male')}`, t(`stage_${st.stage}`)].filter(Boolean).join(' · ')),
          sandbox ? null : h('small', {}, `${price} 🪙`))),
      h('h3', {}, t('breed')),
      h('div', { class: 'cards' }, breeds.map((b) => h('button', {
        class: `card ${b.id === st.breed ? 'selected' : ''}`,
        onClick: () => { st.breed = b.id; st.colorIndex = 0; ui.renderPanel(); },
      },
      thumb(g, { kind: 'animal', species: st.species, breed: b.id, colorIndex: 0, sex: 'f', stage: 'adult' }, { w: 168, h: 126, emoji, cls: 'breed-thumb', alt: '' }),
      h('span', { class: 'card-main' }, h('b', {}, `${b.from?.flag ? `${b.from.flag} ` : ''}${L(b.name)}`), h('small', {}, '⭐'.repeat(b.rarity ?? 1)),
        // Chats : taille et poil de la race (catBreeds.js), sur chaque carte.
        b.desc ? h('small', { class: 'breed-desc' }, L(b.desc)) : null,
        b.id === st.breed ? breedNote(b) : null), // vague 3 : origine et caractère de la race choisie (chevaux, chats)
      h('span', { class: 'card-side' }, sandbox ? '' : h('small', {}, `${shopPrice(st.species, b.id, st.stage)} 🪙`))))),
      h('h3', {}, t('coat')),
      h('div', { class: 'row wrap' }, breed.colors.map((c, i) => h('button', {
        class: `small color-pick ${st.colorIndex === i ? 'primary' : ''}`,
        onClick: () => { st.colorIndex = i; ui.renderPanel(); },
      }, h('span', { class: 'swatch-dot', style: { background: hexColor(c.coat) } }), ` ${coatLabel(c, st.sex)}`))),
      h('h3', {}, t('sexLabel')),
      h('div', { class: 'row' }, chip(`♀ ${t('female')}`, st.sex === 'f', () => { st.sex = 'f'; }), chip(`♂ ${t('male')}`, st.sex === 'm', () => { st.sex = 'm'; })),
      h('h3', {}, t('age')),
      h('div', { class: 'row wrap' }, AGE_STAGES.map((sg) => chip(t(`stage_${sg}`), st.stage === sg, () => { st.stage = sg; }))),
      h('h3', {}, t('shopSummary')),
      animalCard(preview, pic(96, 72, '')),
      h('button', {
        class: 'primary big',
        disabled: !canAfford(g.profile, price),
        onClick: async () => {
          const name = await ui.prompt(t('chooseName'), freeName(namesInUse(g.profile)), animalCard(preview, pic(96, 72, '')));
          if (name === null) return;
          if (g.buyAnimal({ ...st }, name)) ui.closePanel();
        },
      }, sandbox ? `🛒 ${t('buy')}` : `🛒 ${t('buy')} · ${price} 🪙`),
    ];
  };
  ui.openPanel({ title: `🛒 ${g.isHome ? t('bld_petshop') : t('breeder')}`, render });
}

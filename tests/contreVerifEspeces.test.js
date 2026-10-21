// Contre-vérification (code) des espèces proposées (OFFERED_SPECIES, src/sim/species.js).
// Balayage de TOUS les générateurs qui peuvent faire apparaître un animal ou une espèce comme CHOIX ou NOUVEL
// animal, sur une longue simulation à graine ; puis l'interrupteur (ajouter cat et rabbit, puis tout le bétail)
// générateur par générateur ; enfin les constats corrigés : clapier et bergerie de la ferme au décor, chien de
// troupeau, orage, école vétérinaire, textes, quête des espèces, suivi de quête d'une ancienne partie.
// Hasard avec graine seulement (seeded, mulberry32).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SPECIES, SPECIES_IDS, OFFERED_SPECIES, isOffered, LIVESTOCK_IDS, coreShown } from '../src/sim/species.js';
import { breedsFor, shopBreeds, adoptionCandidates } from '../src/sim/adoption.js';
import { PLACE_IDS } from '../src/sim/places.js';
import { createProfile } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { startEvent, maybeStartEvent, stormShelters } from '../src/sim/events.js';
import { createVisit, pickVisitKind } from '../src/sim/clients.js';
import { startCareer, rankNewSpecies, carnet, nextAction, addCareerXp } from '../src/sim/careers.js';
import { newClient, ensureGroomer } from '../src/sim/groomer.js';
import { makeClientRequest, dogTrainerOf, coachingsFor } from '../src/sim/dogTrainer.js';
import { rivals, competitionsAt } from '../src/sim/activities.js';
import { competitionRivals, calendar } from '../src/sim/competitions.js';
import { visibleClasses, classRivals } from '../src/sim/beauty.js';
import { buildingActions } from '../src/sim/buildings.js';
import { OBJECTIVES, objectiveShown } from '../src/sim/objectives.js';
import { followQuest, followView, updateFollow } from '../src/sim/tutorial.js';
import { structureShown, coreRect } from '../src/sim/construction.js';
import { resizeCore } from '../src/sim/resize.js';
import { equipmentShown, helperShown } from '../src/sim/farm.js';
import { toolShown } from '../src/sim/tools.js';
import { canBuyUpgrade } from '../src/sim/facilities.js';
import { HEART_SORT, heartSortFor, vsTextKey, VS_TEXT_NEEDS } from '../src/sim/vetSchool.js';
import { searchHelp, topicSteps } from '../src/ui/help.js';
import { perkParams } from '../src/ui/names.js';
import { t, setLang, getLang } from '../src/i18n.js';
import { seeded, mulberry32 } from '../src/sim/rng.js';
import { DAYS_PER_YEAR } from '../src/sim/time.js';

// Ces tests jouent le scénario « seuls le cheval et le chien sont proposés » (toutes les autres espèces
// cachées), quelle que soit la liste du jeu, qui s'allonge au fil des modèles réalistes ; chaque test qui
// change la liste la retrouve ensuite comme dans le jeu (interrupteur).
const START = new Set(OFFERED_SPECIES);
const SCENARIO = ['horse', 'dog'];
beforeEach(() => {
  OFFERED_SPECIES.clear();
  for (const s of SCENARIO) OFFERED_SPECIES.add(s);
});
afterEach(() => {
  OFFERED_SPECIES.clear();
  for (const s of START) OFFERED_SPECIES.add(s);
});

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const adult = (species, sex = 'f', seed = species + sex) => createAnimal({ species, sex, ageDays: 80, rng: seeded(seed) });
const evCtx = (p, day, hour, place, isHome) => ({
  clock: (day - 1) * 1440 + hour * 60, hour, season: SEASONS[Math.floor(day / 30) % 4], place, isHome,
  weather: 'clear', temperature: 15, day, animals: p.animals, whereOf: () => 'out',
});

/** Tous les animaux « nouveaux » ou « proposés » d'une journée de partie, par générateur. */
function dayArrivals(p, day, rng, place, isHome) {
  const out = [];
  const push = (src, sp) => out.push([src, sp]);
  for (let hour = 0; hour < 24; hour++) {
    const ev = maybeStartEvent(p, evCtx(p, day, hour, place, isHome), rng);
    if (ev?.data?.stray) push('perdu', ev.data.stray.species);
    if (p.events.active) p.events.active = null;
  }
  // Visiteurs : le genre de visite tiré comme dans le jeu, toutes les espèces possibles ici (écurie, bergerie).
  const kind = pickVisitKind(p, rng);
  push(`visite:${kind}`, createVisit(p, { species: SPECIES_IDS, day, clock: day * 1440, place }, rng, kind).animal.species);
  push('salon', newClient(p, { rng, day }).animal.species);
  push('éducateur', makeClientRequest(p, { day, rng, rescue: rng() < 0.3 }).dog.species);
  for (const a of adoptionCandidates(place, day, [], isHome)) push(isHome ? 'refuge' : 'élevage', a.species);
  for (const b of shopBreeds(place, isHome)) push(isHome ? 'animalerie' : 'élevage', b.species);
  for (const comp of competitionsAt(place, isHome, day, 1)) for (const r of rivals(comp, 6)) push(`activité:${comp.type}`, r.species);
  for (const comp of calendar(day, 1)) for (const r of competitionRivals(comp)) push(`concours:${comp.discipline}`, r.species);
  for (const cls of visibleClasses(p)) for (const r of classRivals({ id: `b${day}`, level: 1 + (day % 3) }, cls, 5)) push(`beauté:${cls}`, r.species);
  return out;
}

describe('contre-vérif : aucun générateur ne propose une espèce pas encore proposée', () => {
  it('365 jours × 6 graines : événements (saisons, voyages), visiteurs, salon, éducateur, refuge, animalerie, élevages, concurrents', () => {
    const sources = new Set();
    for (let seed = 1; seed <= 6; seed++) {
      const rng = mulberry32(seed * 104729);
      const p = createProfile(`CV${seed}`, seed % 2 ? 'manage' : 'sandbox');
      p.xp = 5000;
      for (const career of ['vet', 'pension', 'handler', 'dogTrainer']) startCareer(p, career, 1, { level: 20 });
      ensureGroomer(p);
      dogTrainerOf(p);
      p.animals.push(adult('horse', 'f', `h${seed}`), adult('dog', 'm', `d${seed}`));
      const bad = [];
      let total = 0;
      for (let day = 1; day <= 365; day++) {
        for (const career of ['vet', 'pension', 'handler', 'dogTrainer']) p.careers.xp[career] = day * 5;
        p.careers.xp.groomer = day * 6;
        // Un voyage de 5 jours tous les 30 jours, dans un lieu tiré au hasard (avec graine).
        const away = day % 30 >= 25;
        const place = away ? PLACE_IDS[Math.floor(seeded(`lieu-${seed}-${Math.floor(day / 30)}`)() * PLACE_IDS.length)] : 'maison';
        for (const [src, sp] of dayArrivals(p, day, rng, place, !away || place === 'maison')) {
          total++;
          sources.add(src.split(':')[0]);
          if (!isOffered(sp)) bad.push(`${src} jour ${day} : ${sp}`);
        }
      }
      expect(bad, `graine ${seed}`).toEqual([]);
      expect(total).toBeGreaterThan(365 * 20);
    }
    // Chaque générateur a bien été essayé.
    expect([...sources].sort()).toEqual(['activité', 'animalerie', 'beauté', 'concours', 'perdu', 'refuge', 'salon', 'visite', 'élevage', 'éducateur'].sort());
  });
});

describe('contre-vérif : interrupteur, générateur par générateur', () => {
  it('cat et rabbit ajoutés : ils reviennent dans chaque générateur et chaque liste cachée', () => {
    OFFERED_SPECIES.add('cat');
    OFFERED_SPECIES.add('rabbit');
    const seen = (fn, n = 300) => {
      const s = new Set();
      for (let i = 0; i < n; i++) for (const sp of fn(i)) s.add(sp);
      return s;
    };
    const both = (s) => s.has('cat') && s.has('rabbit');
    // Refuge et animalerie de la maison.
    expect(both(seen((i) => adoptionCandidates('maison', i + 1, [], true).map((a) => a.species), 20))).toBe(true);
    expect(both(new Set(shopBreeds('maison', true).map((x) => x.species)))).toBe(true);
    // Élevages en voyage : chaque race locale de chat ou de lapin revient dans son lieu.
    for (const place of PLACE_IDS) {
      const local = breedsFor(place, false, { all: true }).filter((x) => x.breed.origin === place && ['cat', 'rabbit'].includes(x.species));
      const now = breedsFor(place, false).map((x) => x.breed.id);
      for (const x of local) expect(now, `${place} ${x.breed.id}`).toContain(x.breed.id);
    }
    // Animal perdu.
    expect(seen((i) => {
      const p = createProfile('A');
      p.animals.push(adult('dog'));
      return [startEvent(p, 'lostPet', evCtx(p, 3, 14, 'maison', true), seeded(`p-${i}`), true).data.stray.species];
    }, 100).has('cat')).toBe(true);
    // Clients des trois métiers à visiteurs (rang apprenti).
    for (const career of ['vet', 'pension', 'handler']) {
      const p = createProfile('A', 'manage');
      startCareer(p, career, 1, { level: 20 });
      expect(both(seen((i) => [createVisit(p, { species: SPECIES_IDS, day: 3 }, mulberry32(i + 1), career).animal.species])), career).toBe(true);
    }
    // Salon.
    const g = createProfile('G');
    ensureGroomer(g);
    expect(both(seen((i) => [newClient(g, { rng: mulberry32(9000 + i), day: 2 }).animal.species]))).toBe(true);
    // Concurrents : agility des activités et des concours.
    expect(both(seen((d) => competitionsAt('maison', true, d + 1, 1).flatMap((c) => rivals(c, 6).map((r) => r.species)), 120))).toBe(true);
    expect(both(seen((d) => calendar(d + 1, 1).flatMap((c) => competitionRivals(c).map((r) => r.species)), 120))).toBe(true);
    // Listes cachées : lapin-hop, classes de beauté, clapier, litière, quêtes du lapin, textes des rangs, aide.
    const p = createProfile('A');
    const ctx = { hour: 10, season: 'summer', home: true, count: { horse: 0, rabbit: 0, livestock: 0, pets: 0 } };
    expect(buildingActions('showground', ctx).some((a) => a.id === 'actvHop')).toBe(true);
    expect(visibleClasses(p)).toEqual(['horses', 'dogs', 'cats', 'small']);
    expect(structureShown(p, 'hutch')).toBe(true);
    expect(equipmentShown(p, 'autoLitter')).toBe(true);
    for (const id of ['actvHop1', 'actvHutch5']) expect(objectiveShown(p, OBJECTIVES.find((o) => o.id === id))).toBe(true);
    expect(rankNewSpecies('groomer', 0)).toEqual(['dog', 'cat', 'rabbit']);
    const clean = searchHelp('', p).find((x) => x.id === 'clean');
    expect(topicSteps(clean, p).some((s) => /lapin|rabbit/i.test(s))).toBe(true);
    // Le bétail n'est pas encore là.
    expect(helperShown(p, 'shepherd')).toBe(false);
    expect(searchHelp('', p).some((x) => x.id === 'herd')).toBe(false);
  });

  it('sans les chats et lapins (aujourd\'hui) : ces mêmes listes sont bien cachées', () => {
    const p = createProfile('A');
    const ctx = { hour: 10, season: 'summer', home: true, count: { horse: 0, rabbit: 0, livestock: 0, pets: 0 } };
    expect(buildingActions('showground', ctx).some((a) => a.id === 'actvHop')).toBe(false);
    expect(structureShown(p, 'hutch')).toBe(false);
    const clean = searchHelp('', p).find((x) => x.id === 'clean');
    expect(topicSteps(clean, p).some((s) => /lapin|rabbit/i.test(s))).toBe(false);
    expect(searchHelp('', p).some((x) => x.id === 'herd')).toBe(false);
    expect(searchHelp('troupeau mouton', p).some((x) => x.id === 'herd')).toBe(false);
  });

  it('moutons, chèvres et vaches ajoutés : berger, tondeuse, seau, mangeoires, classe ferme, concours des moutons, vaches chez le véto', () => {
    for (const s of LIVESTOCK_IDS) OFFERED_SPECIES.add(s);
    const p = createProfile('A', 'manage');
    expect(helperShown(p, 'shepherd')).toBe(true);
    expect(toolShown(p, 'shears') && toolShown(p, 'milkPail')).toBe(true);
    expect(equipmentShown(p, 'penFeeder') && equipmentShown(p, 'penTrough')).toBe(true);
    expect(visibleClasses(p)).toContain('farm');
    expect(searchHelp('', p).some((x) => x.id === 'herd')).toBe(true);
    const g = createProfile('G');
    ensureGroomer(g);
    g.careers.xp.groomer = 900;
    const req = new Set();
    for (let i = 0; i < 300; i++) req.add(newClient(g, { rng: mulberry32(70 + i), day: 9 }).request);
    expect(req.has('sheepShow')).toBe(true);
    startCareer(p, 'vet', 1, { level: 20 });
    p.careers.xp.vet = 5000;
    const sp = new Set();
    for (let i = 0; i < 300; i++) sp.add(createVisit(p, { species: SPECIES_IDS, day: 3 }, mulberry32(i + 1), 'vet').animal.species);
    expect(sp.has('cow') && sp.has('sheep') && sp.has('goat')).toBe(true);
    const show = new Set();
    for (let d = 1; d < 200; d++) for (const c of competitionsAt('maison', true, d, 1)) for (const r of rivals(c, 6)) show.add(r.species);
    expect(show.has('goat') && show.has('sheep')).toBe(true);
  });
});

// ---------------------------------------------------------------- constats corrigés

/** Une ancienne partie : vaches, moutons, chèvres, chats et lapins (et un cheval, un chien). */
function oldSave() {
  const p = createProfile('Ancienne', 'manage');
  p.money = 100000;
  p.xp = 5000;
  for (const sp of ['cow', 'sheep', 'goat', 'cat', 'rabbit', 'horse', 'dog']) p.animals.push(adult(sp, 'f'), adult(sp, 'm'));
  return p;
}
const PEN_ONLY = ['outFlock', 'inFlock', 'leadIn', 'leadOut', 'hayFlock', 'waterFlock', 'milkAll', 'shearAll', 'facManage', 'resizeCore'];
const HUTCH_ONLY = ['feedRabbits', 'cleanHutch', 'actvHutchPlay', 'resizeCore'];
const ids = (kind, ctx) => buildingActions(kind, ctx).map((a) => a.id);
const baseCtx = (count = {}, shown) => ({
  hour: 10, season: 'summer', home: true, shown,
  count: { horse: 0, rabbit: 0, livestock: 0, milkable: 0, shearable: 0, penDroppings: 0, ...count },
});
/** Les textes en français puis en anglais, pour chercher un mot qu'on ne veut plus voir. */
function bothLangs(fn) {
  const had = getLang();
  const hadDoc = !!globalThis.document;
  if (!hadDoc) globalThis.document = { documentElement: {} }; // setLang touche <html lang>
  const out = [];
  try {
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      out.push(fn(lang));
    }
  } finally {
    setLang(had);
    if (!hadDoc) delete globalThis.document;
  }
  return out;
}

describe('constats corrigés : le clapier et la bergerie de la ferme restent au décor', () => {
  it('nouvelle partie : leurs menus n\'ont plus ni troupeau, ni traite, ni tonte, ni lapins, ni améliorations, ni agrandissement', () => {
    const p = createProfile('A', 'manage');
    expect(coreShown(p, 'pen')).toBe(false);
    expect(coreShown(p, 'hutch')).toBe(false);
    expect(coreShown(p, 'stable')).toBe(true); // (les autres installations ne changent pas)
    const shown = { pen: coreShown(p, 'pen'), hutch: coreShown(p, 'hutch') };
    for (const ctx of [baseCtx({}, shown), baseCtx()]) { // (avec le drapeau du jeu, ou sans : même résultat)
      expect(ids('pen', ctx).filter((id) => PEN_ONLY.includes(id))).toEqual([]);
      expect(ids('hutch', ctx).filter((id) => HUTCH_ONLY.includes(id))).toEqual([]);
      expect(ids('pen', ctx)).toEqual(['farm', 'moveCore']);
      expect(ids('hutch', ctx)).toEqual(['farm', 'moveCore']);
    }
    // Un crottin égaré dans la bergerie se ramasse quand même.
    expect(ids('pen', baseCtx({ penDroppings: 2 }, shown))).toContain('cleanPen');
    // Améliorations de la bergerie : refusées (pas encore), sans rien dépenser ; l'écurie, elle, s'équipe.
    p.xp = 5000;
    p.money = 10000;
    expect(canBuyUpgrade(p, 'pen', 'lights')).toMatchObject({ ok: false, reason: 'soon' });
    expect(canBuyUpgrade(p, 'pen', 'heater')).toMatchObject({ ok: false, reason: 'soon' });
    expect(canBuyUpgrade(p, 'stable', 'lights').reason).not.toBe('soon');
    // Agrandir le clapier ou la bergerie : refusé, rien n'est payé.
    for (const id of ['hutch', 'pen']) {
      const old = coreRect({}, id);
      expect(resizeCore(p, 'maison', id, { ...old, hw: old.hw + 1 }), id).toMatchObject({ ok: false, reason: 'soon' });
    }
    expect(p.money).toBe(10000);
    expect(p.coreLayout?.maison?.hutch).toBeUndefined();
  });

  it('ancienne partie avec moutons, chèvres, vaches et lapins : tout est là, et ça marche', () => {
    const p = oldSave();
    expect(coreShown(p, 'pen') && coreShown(p, 'hutch')).toBe(true);
    const ctx = baseCtx({ livestock: 6, rabbit: 2, milkable: 1, shearable: 1 }, { pen: true, hutch: true });
    expect(ids('pen', ctx)).toEqual(expect.arrayContaining(PEN_ONLY));
    expect(ids('hutch', ctx)).toEqual(expect.arrayContaining(HUTCH_ONLY));
    expect(canBuyUpgrade(p, 'pen', 'lights').ok).toBe(true);
    const money = p.money;
    const old = coreRect({}, 'hutch');
    const r = resizeCore(p, 'maison', 'hutch', { ...old, hw: old.hw + 1 });
    expect(r.ok).toBe(true);
    expect(p.money).toBe(money - r.cost);
    // Seulement un lapin : seul le clapier sert.
    const q = createProfile('B');
    q.animals.push(adult('rabbit'));
    expect([coreShown(q, 'hutch'), coreShown(q, 'pen')]).toEqual([true, false]);
  });

  it('interrupteur : les lapins proposés rouvrent le clapier, le bétail proposé rouvre la bergerie', () => {
    const p = createProfile('A', 'manage');
    p.xp = 5000;
    p.money = 10000;
    OFFERED_SPECIES.add('rabbit');
    expect([coreShown(p, 'hutch'), coreShown(p, 'pen')]).toEqual([true, false]);
    expect(ids('hutch', baseCtx())).toEqual(expect.arrayContaining(HUTCH_ONLY));
    const old = coreRect({}, 'hutch');
    expect(resizeCore(p, 'maison', 'hutch', { ...old, hw: old.hw + 1 }).ok).toBe(true);
    for (const s of LIVESTOCK_IDS) OFFERED_SPECIES.add(s);
    expect(coreShown(p, 'pen')).toBe(true);
    expect(ids('pen', baseCtx())).toEqual(expect.arrayContaining(PEN_ONLY));
    expect(canBuyUpgrade(p, 'pen', 'lights').ok).toBe(true);
  });
});

describe('constats corrigés : pas de chien de troupeau sans troupeau possible', () => {
  it('éducateur canin : ni coaching « chien de troupeau » au carnet ni sur la fiche, ni dans le texte du rang', () => {
    const p = createProfile('A', 'manage');
    p.xp = 5000;
    startCareer(p, 'dogTrainer', 1, { level: 20 });
    addCareerXp(p, 'dogTrainer', 1000); // (rang expert : tout est ouvert)
    expect(carnet(p, 'dogTrainer').some((a) => a.id === 'coachHerd')).toBe(false);
    p.careers.done.dogTrainer = carnet(p, 'dogTrainer').map((a) => a.id);
    expect(nextAction(p, 'dogTrainer')).toBeNull(); // (jamais « coaching troupeau » comme prochaine action)
    expect(coachingsFor({ species: 'dog' }, 2, p)).not.toContain('herd');
    expect(coachingsFor({ species: 'dog' }, 2, p)).toContain('agility');
    const [fr, en] = bothLangs(() => t('ca_perk_skilled_dogTrainer', perkParams('dogTrainer', 1, p)));
    expect(fr).not.toMatch(/troupeau|\{/);
    expect(en).not.toMatch(/herd|\{/i);
  });

  it('ancienne partie avec un troupeau, ou bétail proposé : le coaching revient partout', () => {
    const p = oldSave();
    startCareer(p, 'dogTrainer', 1, { level: 20 });
    addCareerXp(p, 'dogTrainer', 1000);
    expect(carnet(p, 'dogTrainer').some((a) => a.id === 'coachHerd')).toBe(true);
    expect(coachingsFor({ species: 'dog' }, 2, p)).toContain('herd');
    expect(bothLangs(() => t('ca_perk_skilled_dogTrainer', perkParams('dogTrainer', 1, p)))[0]).toMatch(/troupeau/);
    const q = createProfile('B');
    for (const s of LIVESTOCK_IDS) OFFERED_SPECIES.add(s);
    expect(coachingsFor({ species: 'dog' }, 2, q)).toContain('herd');
    expect(perkParams('dogTrainer', 1, q).herd).not.toBe('');
  });

  it('un coaching déjà coché dans une ancienne partie reste coché au carnet', () => {
    const p = createProfile('A');
    startCareer(p, 'dogTrainer', 1, { level: 20 });
    p.careers.done.dogTrainer = ['coachHerd'];
    expect(carnet(p, 'dogTrainer').find((a) => a.id === 'coachHerd')).toMatchObject({ done: true });
  });
});

describe('constats corrigés : textes', () => {
  it('l\'orage : pas de « troupeau à la bergerie » sans troupeau possible', () => {
    expect(stormShelters(createProfile('A'))).toEqual(['horse', 'pets']);
    expect(stormShelters(oldSave())).toEqual(['horse', 'flock', 'pets']);
    OFFERED_SPECIES.add('sheep');
    expect(stormShelters(createProfile('B'))).toEqual(['horse', 'flock', 'pets']);
    for (const [k, v] of Object.entries({ horse: 'écurie', flock: 'bergerie', pets: 'maison' })) {
      const [fr, en] = bothLangs(() => t(`ev_storm_where_${k}`));
      expect(fr).toContain(v);
      expect(en).not.toBe(`ev_storm_where_${k}`);
    }
    const [fr, en] = bothLangs(() => t('ev_storm_intro', { where: 'X' }));
    expect(fr).not.toMatch(/bergerie|troupeau/);
    expect(en).not.toMatch(/sheepfold|flock/);
  });

  it('aide et sellerie : ni litière, ni clapier, ni bergerie dans une nouvelle partie (mais oui dans une ancienne)', () => {
    const p = createProfile('A');
    const topic = (id, q = p) => searchHelp('', q).find((x) => x.id === id);
    const [fr, en] = bothLangs((lang) => [
      topicSteps(topic('clean'), p).join(' '), topic('grow').title[lang], t('toold_pitchfork'),
    ].join(' | '));
    expect(fr).not.toMatch(/bergerie|clapier|litière/i);
    expect(en).not.toMatch(/sheepfold|hutch|litter/i);
    expect(topic('tools').icon).not.toBe('🧶');
    const old = oldSave();
    const steps = bothLangs(() => topicSteps(topic('clean', old), old).join(' '))[0];
    expect(steps).toMatch(/bergerie/);
    expect(steps).toMatch(/litière/);
  });
});

describe('constats corrigés : école vétérinaire', () => {
  it('nouvelle partie : le tri des cœurs et les textes ne montrent que le cheval et le chien', () => {
    const p = createProfile('A');
    expect(heartSortFor(p)).toEqual(['horse', 'dog']);
    const words = /lapin|vache|mouton|chèvre|\bchat\b|rabbit|\bcow\b|sheep|goat|\bcat\b/i;
    const keys = Object.keys(VS_TEXT_NEEDS);
    for (const list of bothLangs(() => keys.map((k) => t(vsTextKey(p, k))))) {
      list.forEach((s, i) => {
        expect(s, keys[i]).not.toBe(vsTextKey(p, keys[i])); // (la variante existe dans les deux langues)
        expect(s, keys[i]).not.toMatch(words);
      });
    }
    // Le quiz garde sa bonne réponse à la même place : le chien a le cœur le plus rapide (réponse 2).
    expect(bothLangs(() => t(vsTextKey(p, 'vs_vitals_q2_a2')))[0]).toMatch(/chien/);
  });

  it('ancienne partie (ou espèces proposées) : les textes d\'origine et tout le tri des cœurs', () => {
    const p = oldSave();
    expect(heartSortFor(p)).toEqual(HEART_SORT);
    for (const k of Object.keys(VS_TEXT_NEEDS)) expect(vsTextKey(p, k)).toBe(k);
    const q = createProfile('B');
    OFFERED_SPECIES.add('cat');
    OFFERED_SPECIES.add('rabbit');
    expect(heartSortFor(q)).toEqual(['horse', 'dog', 'cat', 'rabbit']);
    expect(vsTextKey(q, 'vs_vitals_p1')).toBe('vs_vitals_p1');
    expect(vsTextKey(q, 'vs_thermo_q2')).toBe('vs_thermo_q2_hd'); // (pas encore de mouton)
  });
});

describe('constats corrigés : quêtes', () => {
  it('« espèces différentes » : un client chat d\'une ancienne partie ne relève plus le but', () => {
    const p = createProfile('A');
    p.animals.push(adult('horse'), adult('dog'));
    const cat = adult('cat', 'f', 'client-chat');
    cat.client = { id: 'c1', kind: 'pension', until: 10 };
    p.animals.push(cat);
    const species4 = OBJECTIVES.find((o) => o.id === 'species4');
    expect(species4.progress(p)).toEqual([2, 2]);
    // Un chat à soi (ancienne partie), lui, compte.
    p.animals.push(adult('cat', 'm', 'mon-chat'));
    expect(species4.progress(p)).toEqual([3, 3]);
  });

  it('suivi d\'une quête cachée (lapin-hop suivi avant la mise à jour) : le suivi s\'arrête', () => {
    const p = createProfile('A');
    p.animals.push(adult('horse'), adult('dog'));
    followQuest(p, 'actvHop1');
    const hop = OBJECTIVES.find((o) => o.id === 'actvHop1');
    expect(objectiveShown(p, hop)).toBe(false);
    expect(followView(p, OBJECTIVES)).toBeNull();
    expect(updateFollow(p, OBJECTIVES)).toBeNull();
    expect(p.questFollow).toBeNull();
    // Avec un lapin (ancienne partie), le suivi continue.
    p.animals.push(adult('rabbit'));
    followQuest(p, 'actvHop1');
    expect(followView(p, OBJECTIVES)?.id).toBe('actvHop1');
    updateFollow(p, OBJECTIVES);
    expect(p.questFollow?.id).toBe('actvHop1');
  });
});

describe('(contrôle) les espèces non proposées existent toujours', () => {
  it('SPECIES les garde (les anciennes parties gardent leurs animaux)', () => {
    for (const s of ['cat', 'rabbit', 'sheep', 'goat', 'cow']) expect(SPECIES[s].adultYears * DAYS_PER_YEAR).toBeGreaterThan(0);
  });
});

// Quêtes principales (l'histoire de la ferme) et secondaires (rejoindre, enlever, passer, reprendre) :
// src/sim/quests.js. Tests déterministes (hasard avec graine seulement).

import { describe, it, expect } from 'vitest';
import { createProfile, migrate, addStat } from '../src/sim/profile.js';
import { createAnimal, applyCare, trainTrick, BOND_FOR_TRICKS, canRide } from '../src/sim/animal.js';
import { SPECIES, offeredSpeciesIds } from '../src/sim/species.js';
import { OBJECTIVES, checkObjectives, objectiveShown } from '../src/sim/objectives.js';
import { PLACE_IDS } from '../src/sim/places.js';
import { XP, levelOf } from '../src/sim/progress.js';
import { canStart, startCareer } from '../src/sim/careers.js';
import { eligibility, knownTricks } from '../src/sim/activities.js';
import { adoptionCandidates } from '../src/sim/adoption.js';
import { allowedGait } from '../src/sim/riding.js';
import { rideGear, tackUpForRide, starterTack, wears, sizeOf } from '../src/sim/gear.js';
import { followQuest, stopFollow, questBlock, followBlock, questReady, cheapestTrip, QUEST_GUIDE, QUEST_ORDER } from '../src/sim/tutorial.js';
import { serializeSave, parseSave, mergeProfiles } from '../src/sim/saveFile.js';
import { mulberry32, seeded } from '../src/sim/rng.js';
import {
  STORY, THEMES, MAX_JOINED, mainQuest, storyView, skipChapter, resumeChapter, resumeMode, joinQuest, leaveQuest, canJoin,
  joinedQuests, otherQuests, trackerQuest, afterQuestsDone, chapterEnd, questKind, isSideQuest, migrateQuests, doneQuests,
  questState, canFollow, tidyFollow, skippedLeft,
  activeQuests, nextQuest, setFront, passQuest, asideQuests, resumeAside, holdFollow, heldFollow,
} from '../src/sim/quests.js';
import { NoticeQueue } from '../src/ui/questNotices.js';
import { GALOPS, finishExam } from '../src/sim/galops.js'; // 🏅 le chapitre du Galop 1

const QUEST_IDS = OBJECTIVES.filter((o) => o.kind === 'quest').map((o) => o.id);
const pet = (species = 'dog', sex = 'f', seed = species + sex) => createAnimal({ species, sex, ageDays: 80, rng: seeded(seed) });
/** Un animal adulte (un cheval qu'on peut monter). */
const grown = (species = 'horse', sex = 'f', seed = species + sex) => createAnimal({ species, sex, ageDays: 60, rng: seeded(seed) });
const finish = (p, ...ids) => p.completed.push(...ids);

describe('les quêtes sont rangées', () => {
  it('chaque quête est dans un seul thème, et chaque chapitre de l\'histoire est une vraie quête', () => {
    const seen = THEMES.flatMap((th) => th.quests);
    expect(new Set(seen).size).toBe(seen.length);
    expect([...seen].sort()).toEqual([...QUEST_IDS].sort());
    for (const id of STORY) expect(QUEST_IDS, id).toContain(id);
    expect(new Set(STORY).size).toBe(STORY.length);
    for (const id of QUEST_IDS) expect(QUEST_ORDER, id).toContain(id);
  });

  it('l\'histoire est celle de ton premier cheval : chaque chapitre ne demande que lui (jamais caché)', () => {
    const p = createProfile('Lou');
    expect(STORY[0]).toBe('horse1');
    for (const id of STORY) {
      const o = OBJECTIVES.find((x) => x.id === id);
      expect(o.needs, id).toBeUndefined();
      expect(objectiveShown(p, o), id).toBe(true);
      // un cheval adulte et son filet (offerts avec le premier cheval) : ni lapin, ni deux animaux, ni crottin,
      // ni argent pour voyager, ni niveau
      for (const n of QUEST_GUIDE[id].need ?? []) expect(['animal', 'horse', 'grownHorse', 'tack'], `${id} → ${n}`).toContain(n);
    }
  });

  it('chaque espèce proposée peut être caressée, nourrie, abreuvée, brossée, apprendre un tour et le montrer en spectacle', () => {
    for (const sid of offeredSpeciesIds()) {
      for (const act of ['pet', 'feed', 'water', 'brush']) expect(SPECIES[sid].actions, `${sid} ${act}`).toContain(act);
      expect(SPECIES[sid].tricks.length, sid).toBeGreaterThan(0);
      const a = grown(sid);
      expect(eligibility(a, 'show'), sid).toBe('noTricks');
      a.tricks[SPECIES[sid].tricks[0]] = 100;
      expect(eligibility(a, 'show'), sid).toBeNull();
    }
  });

  it('le premier voyage n\'est plus un chapitre : depuis certaines maisons, il coûte plus de 750 🪙', () => {
    expect(STORY).not.toContain('travel1');
    const costs = PLACE_IDS.map((home) => cheapestTrip(createProfile('Lou', 'manage', home)));
    expect(Math.max(...costs)).toBeGreaterThan(750);
    expect(THEMES.find((th) => th.id === 'travel').quests).toContain('travel1'); // (une quête secondaire)
  });
});

describe('l\'histoire de la ferme', () => {
  it('commence par l\'adoption, puis un chapitre à la fois, dans l\'ordre', () => {
    const p = createProfile('Lou');
    expect(mainQuest(p)).toBe('horse1');
    expect(storyView(p)).toMatchObject({ current: 'horse1', chapter: 1, total: STORY.length, done: [], upcoming: STORY.length - 1 });
    finish(p, 'horse1');
    p.animals.push(pet());
    expect(mainQuest(p)).toBe('horsePet3');
    expect(storyView(p)).toMatchObject({ chapter: 2, done: ['horse1'], upcoming: STORY.length - 2 });
  });

  it('un chapitre fini plus tôt (hors de l\'histoire) compte comme fini', () => {
    const p = createProfile('Lou');
    finish(p, 'horse1', 'actvJump1', 'vet1');
    expect(mainQuest(p)).toBe('horsePet3');
    expect(storyView(p).done).toEqual(['horse1', 'vet1', 'actvJump1']);
    // les chapitres finis ne reviennent jamais
    finish(p, 'horsePet3', 'horseFeed3', 'horseWater2', 'horseBrush1', 'ride1', 'rideCanter1');
    expect(mainQuest(p)).toBe('galop1');
    finish(p, 'galop1');
    expect(mainQuest(p)).toBe('actvLesson1');
  });

  it('un cheval déjà à soi (ancienne partie) : le premier chapitre est fini tout de suite', () => {
    const p = createProfile('Lou', 'manage');
    p.animals.push(pet('dog'));
    expect(checkObjectives(p).map((o) => o.id)).toEqual([]);
    p.animals.push(grown('horse'));
    expect(checkObjectives(p).map((o) => o.id)).toEqual(['horse1']);
    expect(mainQuest(p)).toBe('horsePet3');
    // les soins d'un autre animal ne comptent pas pour son cheval
    addStat(p, 'pet', 3);
    expect(checkObjectives(p).map((o) => o.id)).not.toContain('horsePet3');
  });

  it('histoire finie : plus de chapitre, et c\'est dit', () => {
    const p = createProfile('Lou');
    finish(p, ...STORY);
    expect(mainQuest(p)).toBeNull();
    expect(storyView(p)).toMatchObject({ current: null, finished: true, upcoming: 0 });
  });

  it('passer pour l\'instant : le chapitre devient une quête secondaire et le suivant arrive', () => {
    const p = createProfile('Lou');
    p.animals.push(pet());
    finish(p, 'horse1');
    followQuest(p, 'horsePet3');
    expect(skipChapter(p)).toBe('horseFeed3');
    expect(p.questFollow).toBeNull(); // on ne suit plus un chapitre passé
    expect(mainQuest(p)).toBe('horseFeed3');
    expect(storyView(p).skipped).toEqual(['horsePet3']);
    expect(isSideQuest(p, 'horsePet3')).toBe(true);
    expect(questKind(p, 'horsePet3')).toBe('side');
    // seul le chapitre en cours se passe
    expect(skipChapter(p, 'horseWater2')).toBeUndefined();
    expect(mainQuest(p)).toBe('horseFeed3');
  });

  it('reprendre un chapitre passé qui vient AVANT le chapitre en cours : il redevient le chapitre en cours', () => {
    const p = createProfile('Lou');
    finish(p, 'horse1');
    skipChapter(p); // horsePet3
    skipChapter(p); // horseFeed3
    expect(mainQuest(p)).toBe('horseWater2');
    expect(resumeMode(p, 'horseFeed3')).toBe('main');
    expect(resumeChapter(p, 'horseFeed3')).toEqual({ ok: true, how: 'main' });
    expect(mainQuest(p)).toBe('horseFeed3'); // avant horseWater2 dans l'histoire
    expect(joinedQuests(p)).toEqual([]);
    expect(storyView(p).skipped).toEqual(['horsePet3']);
    expect(resumeChapter(p, 'horseWater2')).toEqual({ ok: false, reason: 'notSkipped' }); // pas passé
  });

  it('reprendre un chapitre passé qui vient APRÈS le chapitre en cours : il va dans « Mes quêtes » (il ne disparaît plus)', () => {
    const p = createProfile('Lou');
    for (let i = 0; i < STORY.length; i++) skipChapter(p); // tout passé
    expect(resumeChapter(p, 'actvLesson1').how).toBe('main');
    expect(mainQuest(p)).toBe('actvLesson1');
        expect(resumeMode(p, 'actvTrail1')).toBe('joined');
    expect(resumeChapter(p, 'actvTrail1')).toEqual({ ok: true, how: 'joined' });
    expect(mainQuest(p)).toBe('actvLesson1'); // l'histoire garde son ordre
    expect(joinedQuests(p)).toEqual(['actvTrail1']); // on le voit, on peut le suivre
    expect(questKind(p, 'actvTrail1')).toBe('joined');
    expect(storyView(p).skipped).not.toContain('actvTrail1'); // une seule fois dans le journal
    expect(trackerQuest(p).id).toBe('actvLesson1');
    // l'enlever : il revient dans « Passés pour l'instant »
    leaveQuest(p, 'actvTrail1');
    expect(storyView(p).skipped).toContain('actvTrail1');
    // « Mes quêtes » pleines : reprendre un chapitre d'après le dit, sans rien changer
    for (const id of ['scoop1', 'horseTrip', 'abroad']) joinQuest(p, id);
    expect(resumeMode(p, 'actvTrail1')).toBe('full');
    expect(resumeChapter(p, 'actvTrail1')).toEqual({ ok: false, reason: 'full' });
    expect(questState(p).skipped).toContain('actvTrail1');
    // un chapitre d'avant se reprend même avec 3 quêtes (il ne va pas dans « Mes quêtes »)
    expect(resumeChapter(p, 'horsePet3').how).toBe('main');
  });

  it('reprendre un chapitre d\'avant pendant qu\'on suit le chapitre en cours : on ne suit plus un chapitre à venir', () => {
    const p = createProfile('Lou');
    p.animals.push(pet());
    finish(p, 'horse1');
    skipChapter(p); // horsePet3
    followQuest(p, 'horseFeed3');
    resumeChapter(p, 'horsePet3');
    expect(mainQuest(p)).toBe('horsePet3');
    expect(p.questFollow).toBeNull();
    expect(trackerQuest(p)).toEqual({ id: 'horsePet3', kind: 'main', followed: false });
  });

  it('un chapitre passé n\'apparaît qu\'une fois dans le journal (dans l\'histoire, pas dans « Autres quêtes »)', () => {
    const p = createProfile('Lou');
    finish(p, 'horse1');
    p.animals.push(pet());
    skipChapter(p); // horsePet3
    expect(storyView(p).skipped).toEqual(['horsePet3']);
    for (const th of otherQuests(p)) expect(th.quests).not.toContain('horsePet3');
    for (const th of otherQuests(p)) for (const id of th.quests) expect(STORY, id).not.toContain(id);
  });

  it('tout passer : plus de chapitre en cours, sans rien perdre', () => {
    const p = createProfile('Lou');
    for (let i = 0; i < STORY.length; i++) skipChapter(p);
    expect(mainQuest(p)).toBeNull();
    expect(storyView(p)).toMatchObject({ current: null, finished: false, skipped: STORY });
    expect(skippedLeft(p)).toEqual(STORY);
    expect(resumeChapter(p, 'actvTrail1').how).toBe('main');
    expect(mainQuest(p)).toBe('actvTrail1');
  });
});

describe('rejoindre et enlever des quêtes secondaires', () => {
  it(`au plus ${MAX_JOINED} en même temps ; enlever en libère une place`, () => {
    const p = createProfile('Lou');
    for (const id of ['scoop1', 'horseTrip', 'abroad']) expect(joinQuest(p, id)).toEqual({ ok: true });
    expect(joinedQuests(p)).toEqual(['scoop1', 'horseTrip', 'abroad']);
    expect(canJoin(p, 'baby')).toEqual({ ok: false, reason: 'full' });
    expect(joinQuest(p, 'baby').ok).toBe(false);
    expect(joinedQuests(p)).toHaveLength(MAX_JOINED);
    expect(leaveQuest(p, 'horseTrip')).toBe(true);
    expect(leaveQuest(p, 'horseTrip')).toBe(false); // déjà enlevée
    expect(joinQuest(p, 'baby')).toEqual({ ok: true });
    expect(joinedQuests(p)).toEqual(['scoop1', 'abroad', 'baby']);
  });

  it('on ne rejoint ni un chapitre de l\'histoire (en cours ou à venir), ni une quête finie, ni deux fois la même', () => {
    const p = createProfile('Lou');
    expect(canJoin(p, 'horse1').reason).toBe('story'); // le chapitre en cours
    expect(canJoin(p, 'actvTrail1').reason).toBe('story'); // un chapitre à venir
    finish(p, 'horseTrip');
    expect(canJoin(p, 'horseTrip').reason).toBe('done');
    joinQuest(p, 'scoop1');
    expect(canJoin(p, 'scoop1').reason).toBe('joined');
    expect(canJoin(p, 'pasUneQuete').reason).toBe('unknown');
    expect(canJoin(p, 'zoo10').reason).toBe('unknown'); // un succès, pas une quête
  });

  it('enlever ne perd rien : la progression reste, et on peut la rejoindre de nouveau', () => {
    const p = createProfile('Lou');
    p.animals.push(grown('horse'));
    joinQuest(p, 'horseTrip');
    followQuest(p, 'horseTrip');
    addStat(p, 'feed', 2);
    leaveQuest(p, 'horseTrip');
    expect(p.questFollow).toBeNull(); // on ne suit plus une quête enlevée
    expect(p.stats.feed).toBe(2);
    expect(questKind(p, 'horseTrip')).toBe('side');
    expect(joinQuest(p, 'horseTrip').ok).toBe(true);
  });

  it('une quête pas encore possible peut se rejoindre : elle dit ce qu\'il faut d\'abord', () => {
    const p = createProfile('Lou');
    expect(questBlock('horseTrip', p)).toMatchObject({ need: 'horse', key: 'qneed_horse' });
    expect(joinQuest(p, 'horseTrip').ok).toBe(true);
    p.animals.push(grown('horse'));
    expect(questBlock('horseTrip', p)).toBeNull();
  });

  it('une quête rejointe et finie quitte « Mes quêtes », avec sa récompense', () => {
    const p = createProfile('Lou', 'manage');
    p.animals.push(grown('horse'));
    finish(p, 'horse1');
    joinQuest(p, 'horseTrip');
    joinQuest(p, 'scoop1');
    const money = p.money;
    addStat(p, 'horseTravels');
    const done = checkObjectives(p);
    expect(done.map((o) => o.id)).toEqual(['horseTrip']);
    expect(p.money).toBe(money + OBJECTIVES.find((o) => o.id === 'horseTrip').reward);
    const r = afterQuestsDone(p, done, 'horsePet3');
    expect(r.left).toEqual(['horseTrip']);
    expect(r.chapter).toBeNull(); // ce n'était pas le chapitre en cours
    expect(questState(p).joined).toEqual(['scoop1']);
    expect(joinedQuests(p)).toEqual(['scoop1']);
    expect(doneQuests(p)).toEqual(['horse1', 'horseTrip']);
  });

  it('une quête finie sans l\'avoir rejointe est récompensée pareil', () => {
    const p = createProfile('Lou', 'manage');
    const money = p.money;
    addStat(p, 'travels');
    expect(checkObjectives(p).map((o) => o.id)).toEqual(['travel1']); // une quête secondaire, pas rejointe
    expect(p.money).toBe(money + OBJECTIVES.find((o) => o.id === 'travel1').reward);
    expect(doneQuests(p)).toEqual(['travel1']);
    // un chapitre à venir fini en avance : récompensé, et l'histoire le saute
    addStat(p, 'actvJumping');
    expect(checkObjectives(p).map((o) => o.id)).toEqual(['actvJump1']);
    expect(storyView(p).done).toEqual(['actvJump1']);
  });

  it('les autres quêtes : d\'abord celles qu\'on peut faire, puis celles où le suivi passe par le refuge, puis les autres', () => {
    const p = createProfile('Lou');
    p.animals.push(grown('dog'));
    const actv = otherQuests(p).find((th) => th.id === 'activities').quests;
    // l'agility (un chien sait la faire) avant le sans-faute (il faut un cheval : le refuge) avant le spectacle
    // (il faut un tour appris)
    expect(actv.indexOf('actvAgility1')).toBeLessThan(actv.indexOf('actvClear1'));
    expect(actv.indexOf('actvClear1')).toBeLessThan(actv.indexOf('actvShow1'));
  });
});

describe('fin d\'un chapitre', () => {
  it('le chapitre fini est annoncé avec le suivant', () => {
    const p = createProfile('Lou');
    p.animals.push(pet());
    finish(p, 'horse1');
    const before = mainQuest(p);
    addStat(p, 'horse_pet', 3);
    const r = afterQuestsDone(p, checkObjectives(p), before);
    expect(r).toMatchObject({ chapter: 'horsePet3', next: 'horseFeed3', storyDone: false });
    expect(chapterEnd(r)).toEqual({ kind: 'next', next: 'horseFeed3', n: 0 });
  });

  it('le dernier chapitre : l\'histoire est finie', () => {
    const p = createProfile('Lou');
    finish(p, ...STORY.slice(0, -1));
    const before = mainQuest(p);
    expect(before).toBe('actvCompete1');
    addStat(p, 'actvCompetitions');
    const r = afterQuestsDone(p, checkObjectives(p), before);
    expect(r).toMatchObject({ chapter: 'actvCompete1', next: null, storyDone: true, skippedLeft: 0 });
    expect(chapterEnd(r).kind).toBe('finished');
  });

  it('le dernier chapitre pas passé, avec des chapitres passés : PAS « tu as fini toute l\'histoire »', () => {
    const p = createProfile('Lou');
    p.animals.push(pet());
    finish(p, 'horse1');
    for (let i = 0; i < STORY.length; i++) skipChapter(p); // horsePet3 … actvTrail1 passés
    resumeChapter(p, 'horseFeed3'); // repris : le seul chapitre en cours
    expect(mainQuest(p)).toBe('horseFeed3');
    const before = mainQuest(p);
    addStat(p, 'horse_feed', 3);
    const r = afterQuestsDone(p, checkObjectives(p), before);
    expect(r).toMatchObject({ chapter: 'horseFeed3', next: null, storyDone: false, skippedLeft: STORY.length - 2 });
    expect(chapterEnd(r)).toEqual({ kind: 'skippedLeft', next: null, n: STORY.length - 2 });
  });
});

describe('le petit mot de fin de chapitre attend qu\'aucune fenêtre ne soit ouverte', () => {
  it('une fenêtre ouverte : il attend, puis il est montré', () => {
    const q = new NoticeQueue(1000);
    q.add({ text: 'Chapitre réussi' });
    expect(q.update(true, 0)).toBeNull(); // le menu des soins (ou 💼 Métiers) est ouvert
    expect(q.update(true, 5000)).toBeNull();
    expect(q.update(false, 6000)).toMatchObject({ text: 'Chapitre réussi' }); // fermé : on le voit
    expect(q.update(false, 6500)).toMatchObject({ text: 'Chapitre réussi' });
    expect(q.update(false, 7100)).toBeNull(); // vu assez longtemps
  });

  it('une fenêtre s\'ouvre pendant qu\'on le lit (« niveau 4 ») : il revient après', () => {
    const q = new NoticeQueue(1000);
    q.add({ text: 'Chapitre réussi' });
    expect(q.update(false, 0)).toBeTruthy();
    expect(q.update(true, 200)).toBeNull(); // la fenêtre du niveau
    expect(q.size).toBe(1);
    expect(q.update(false, 9000)).toMatchObject({ text: 'Chapitre réussi' }); // OK touché : il revient, pour 1 s
    expect(q.update(false, 9500)).toBeTruthy();
  });

  it('dans l\'ordre ; la réponse à un bouton passe devant ; OK fait venir le suivant', () => {
    const q = new NoticeQueue(1000);
    q.add({ text: 'A' });
    q.add({ text: 'B' });
    expect(q.update(false, 0).text).toBe('A');
    q.hold();
    q.add({ text: 'Tu as déjà 3 quêtes' }, { first: true });
    expect(q.update(false, 10).text).toBe('Tu as déjà 3 quêtes');
    q.close();
    expect(q.update(false, 20).text).toBe('A');
    q.close();
    expect(q.update(false, 30).text).toBe('B');
    q.clear();
    expect(q.update(false, 40)).toBeNull();
  });
});

describe('le suivi à l\'écran', () => {
  it('montre la quête suivie, sinon le chapitre en cours, sinon la première rejointe, sinon rien', () => {
    const p = createProfile('Lou');
    expect(trackerQuest(p)).toEqual({ id: 'horse1', kind: 'main', followed: false });
    joinQuest(p, 'scoop1');
    joinQuest(p, 'abroad');
    expect(trackerQuest(p).id).toBe('horse1'); // la quête principale d'abord
    followQuest(p, 'abroad');
    expect(trackerQuest(p)).toEqual({ id: 'abroad', kind: 'joined', followed: true });
    finish(p, ...STORY);
    stopFollow(p);
    expect(trackerQuest(p)).toEqual({ id: 'scoop1', kind: 'joined', followed: false });
    leaveQuest(p, 'scoop1');
    leaveQuest(p, 'abroad');
    expect(trackerQuest(p)).toBeNull();
  });

  it('après ✋ sur une quête rejointe, le suivi revient au chapitre en cours (pas la quête arrêtée)', () => {
    const p = createProfile('Lou');
    p.animals.push(grown('horse'));
    finish(p, 'horse1');
    joinQuest(p, 'horseTrip');
    followQuest(p, 'horseTrip');
    expect(trackerQuest(p).id).toBe('horseTrip');
    stopFollow(p); // ✋
    expect(trackerQuest(p)).toEqual({ id: 'horsePet3', kind: 'main', followed: false });
  });

  it('un chapitre pas encore arrivé n\'est jamais montré, même s\'il était suivi (ancienne sauvegarde)', () => {
    const old = createProfile('Abimee');
    delete old.quests;
    old.animals.push(pet());
    old.completed = ['horse1'];
    old.questFollow = { id: 'horseWater2', step: 0, seen: [], steps: ['tapAnimal', 'do_water'] };
    expect(trackerQuest(old).id).toBe('horsePet3'); // (sans même la migration)
    const m = migrate(JSON.parse(JSON.stringify(old)));
    expect(m.questFollow).toBeNull();
    expect(trackerQuest(m)).toEqual({ id: 'horsePet3', kind: 'main', followed: false });
  });

  it('suivre le chapitre en cours : ⭐ et 🧭 ensemble', () => {
    const p = createProfile('Lou');
    followQuest(p, 'horse1');
    expect(trackerQuest(p)).toEqual({ id: 'horse1', kind: 'main', followed: true });
  });

  it('aucune quête impossible ou non choisie n\'est imposée ni suivie (simulation de 300 parties)', () => {
    const species = offeredSpeciesIds();
    for (let n = 0; n < 300; n++) {
      const rng = mulberry32(900 + n);
      const p = createProfile('A', rng() < 0.5 ? 'manage' : 'sandbox', PLACE_IDS[Math.floor(rng() * PLACE_IDS.length)]);
      if (rng() < 0.5) p.money = Math.floor(rng() * 400);
      const k = Math.floor(rng() * 4);
      for (let i = 0; i < k; i++) p.animals.push((rng() < 0.5 ? pet : grown)(species[Math.floor(rng() * species.length)], rng() < 0.5 ? 'f' : 'm', `${n}-${i}`));
      for (const id of QUEST_IDS) if (rng() < 0.4) p.completed.push(id);
      for (let i = 0; i < 3; i++) if (rng() < 0.3) skipChapter(p);
      for (const id of QUEST_IDS) if (rng() < 0.1) joinQuest(p, id);
      for (const id of STORY) if (rng() < 0.1) resumeChapter(p, id);
      if (rng() < 0.5) {
        // l'enfant touche 🧭 sur une quête au hasard : seulement si c'est possible
        const id = QUEST_IDS[Math.floor(rng() * QUEST_IDS.length)];
        if (canFollow(p, id).ok) {
          if (questKind(p, id) === 'side') expect(joinQuest(p, id).ok).toBe(true);
          followQuest(p, id);
        }
      }
      const q = trackerQuest(p);
      const main = mainQuest(p);
      const joined = joinedQuests(p);
      expect(joined.length).toBeLessThanOrEqual(MAX_JOINED);
      if (p.questFollow) expect(followBlock(p.questFollow.id, p), `${n} ${p.questFollow.id}`).toBeNull();
      if (!q) {
        expect(main).toBeNull();
        expect(joined).toEqual([]);
        continue;
      }
      // Ce que montre le suivi : la quête suivie, le chapitre en cours ou une quête rejointe, jamais une autre.
      expect(q.followed ? q.id === p.questFollow.id : q.id === (main ?? joined[0]), `${n} ${q.id}`).toBe(true);
      expect(['main', 'joined']).toContain(q.kind);
      expect(p.completed).not.toContain(q.id);
      expect(objectiveShown(p, OBJECTIVES.find((o) => o.id === q.id))).toBe(true);
      // Les autres quêtes : ni finies, ni rejointes, ni cachées, ni des chapitres de l'histoire.
      for (const th of otherQuests(p)) {
        for (const id of th.quests) {
          expect(p.completed).not.toContain(id);
          expect(joined).not.toContain(id);
          expect(STORY).not.toContain(id);
          expect(objectiveShown(p, OBJECTIVES.find((o) => o.id === id))).toBe(true);
        }
      }
    }
  });
});

describe('on ne suit jamais une quête pas encore possible (🧭 ne guide pas vers l\'impossible)', () => {
  it('bébé avec un seul animal, voyage sans assez d\'argent : pas de suivi, et la raison', () => {
    const p = createProfile('Lou', 'manage', 'japon');
    p.animals.push(grown('horse'));
    finish(p, ...STORY);
    expect(canFollow(p, 'baby')).toMatchObject({ ok: false, reason: 'blocked', block: { need: 'pair' } });
    p.money = 30;
    expect(canFollow(p, 'travel1')).toMatchObject({ ok: false, reason: 'blocked', block: { need: 'trip' } });
    expect(canFollow(p, 'travel1').block.params.n).toBe(cheapestTrip(p));
    p.money = 5000;
    expect(canFollow(p, 'travel1')).toEqual({ ok: true });
  });

  it('ce qu\'on trouve au refuge ne bloque pas : le suivi commence par l\'adoption', () => {
    const p = createProfile('Lou');
    finish(p, 'horse1');
    expect(questBlock('actvClear1', p)).toMatchObject({ need: 'horse' }); // « Il te faut d'abord un cheval »
    expect(followBlock('actvClear1', p)).toBeNull(); // … et 🧭 emmène au refuge
    expect(canFollow(p, 'actvClear1')).toEqual({ ok: true });
    followQuest(p, 'actvClear1');
    expect(p.questFollow.steps.slice(0, 3)).toEqual(['goRefuge', 'waitOpen', 'adoptHorse']);
    // le chapitre en cours de l'histoire aussi (caresser son cheval, sans cheval : d'abord le refuge)
    expect(canFollow(p, 'horsePet3')).toEqual({ ok: true });
    followQuest(p, 'horsePet3');
    expect(p.questFollow.steps).toEqual(['goRefuge', 'waitOpen', 'adoptHorse', 'tapHorse', 'horse_pet']);
    // mais deux animaux pour un bébé, ça ne s'adopte pas en un tour : bloqué
    expect(followBlock('baby', p)).toMatchObject({ need: 'pair' });
  });

  it('une quête devenue impossible (ancienne sauvegarde qui suivait « bébé ») n\'est plus suivie, mais reste rejointe', () => {
    const old = createProfile('Experte');
    delete old.quests;
    old.animals.push(grown('dog'));
    old.completed = ['horse1'];
    old.questFollow = { id: 'baby', step: 0, seen: [], steps: ['tapAnimal', 'openMore', 'breedNow'] };
    const m = migrate(JSON.parse(JSON.stringify(old)));
    expect(m.quests.joined).toEqual(['baby']);
    expect(m.questFollow).toBeNull();
    expect(trackerQuest(m).id).toBe('horsePet3');
    // tidyFollow : la même règle à tout moment
    const p = createProfile('Lou');
    finish(p, 'horse1');
    p.questFollow = { id: 'baby', step: 0, seen: [], steps: [] };
    expect(tidyFollow(p)).toBe(true);
    expect(p.questFollow).toBeNull();
  });
});

describe('à cheval : un cheval adulte, avec un filet ou un licol', () => {
  it('un poulain ne se monte pas : la balade le dit', () => {
    const p = createProfile('Lou');
    p.animals.push(createAnimal({ species: 'horse', sex: 'f', ageDays: 1, rng: seeded('poulain') })); // un poulain
    expect(canRide(p.animals[0]).reason).toBe('tooYoung');
    expect(questBlock('ride1', p)).toMatchObject({ need: 'grownHorse', key: 'qneed_grownHorse' });
    p.animals.push(grown('horse'));
    expect(questBlock('ride1', p)).toBeNull();
  });

  it('sans filet ni licol libre : la balade le dit ; avec un libre, « Monter » le met tout seul', () => {
    const p = createProfile('Lou');
    const h = grown('horse');
    p.animals.push(h);
    expect(wears(h, 'bridle') || wears(h, 'halter')).toBe(false);
    expect(questBlock('ride1', p)).toBeNull(); // le filet offert est rangé à la sellerie
    expect(rideGear(h).ok).toBe(false);
    const r = tackUpForRide(p, h);
    expect(r.ok).toBe(true);
    expect(r.item).toBeTruthy();
    expect(rideGear(h).ok).toBe(true);
    // un deuxième cheval, plus rien de libre : la balade dit pourquoi (elle ne pointe plus « Monter » pour rien)
    const p2 = createProfile('Lou');
    p2.items = { ...p2.items, bridle: 0, halter: 0 };
    p2.animals.push(grown('horse', 'm', 'h2'));
    expect(questBlock('ride1', p2)).toMatchObject({ need: 'tack', key: 'qneed_tack' });
    expect(tackUpForRide(p2, p2.animals[0]).ok).toBe(false);
    for (const id of ['actvLesson1', 'actvJump1', 'actvTrail1', 'drTrain3', 'tgFirst']) expect(questBlock(id, p2)?.need, id).toBe('tack');
  });

  it('le premier poney ou cheval de trait adopté reçoit aussi le licol, le filet et la selle offerts (taille échangée)', () => {
    for (const breed of ['shetland', 'connemara', 'percheron', 'irish_cob', 'selle_francais']) {
      const p = createProfile('Lou');
      const a = createAnimal({ species: 'horse', breed, sex: 'f', ageDays: 60, rng: seeded(breed) });
      expect(starterTack(p, a), `${breed} (${sizeOf(a)})`).toEqual(['halter', 'bridle', 'saddle']);
      expect(rideGear(a).ok, breed).toBe(true);
    }
    const p = createProfile('Lou');
    expect(starterTack(p, grown('dog'))).toEqual(['collar', 'leash']);
    expect(starterTack(p, grown('cat'))).toEqual([]);
  });
});

/**
 * Joue un chapitre comme dans le jeu (statistiques, soins avec le lien qu'ils donnent, XP de src/sim/progress.js,
 * coûts en mode gestion), puis checkObjectives (récompenses) : de quoi vérifier que chaque chapitre est faisable
 * quand il arrive, avec l'argent, le niveau et le cheval qu'on a à ce moment-là. Renvoie ce qu'on a dépensé.
 */
function playChapter(p, id, breed) {
  const xp = (k, n = 1) => { p.xp += XP[k] * n; };
  let spent = 0;
  const pay = (n) => { if (p.mode === 'manage') { p.money -= n; spent += n; } };
  const a = p.animals.find((x) => x.species === 'horse');
  const care = (action, need, n) => {
    for (let i = 0; i < n; i++) {
      a.needs[need] = 20;
      expect(applyCare(a, action).ok, `${breed} ${action}`).toBe(true);
    }
    addStat(p, action, n);
    addStat(p, `horse_${action}`, n);
    xp('care', n);
  };
  // une activité au terrain de concours : le cheval doit pouvoir la faire (adulte, filet, pas trop fatigué)
  const activity = (type, stat) => {
    a.needs.energy = 80;
    if (!rideGear(a).ok) expect(tackUpForRide(p, a).ok, `${breed} ${type}`).toBe(true);
    expect(eligibility(a, type), `${breed} ${type}`).toBeNull();
    addStat(p, stat);
    xp('activity');
  };
  switch (id) {
    case 'horse1': {
      // au refuge (gratuit), le premier cheval de la liste est adulte ; il reçoit son licol, son filet et sa selle
      const h = adoptionCandidates(p.home, 1, [], true).find((x) => x.species === 'horse');
      expect(h, breed).toBeTruthy();
      p.animals.push(h);
      starterTack(p, h);
      addStat(p, 'adopted');
      xp('adopt');
      break;
    }
    case 'horsePet3': care('pet', 'affection', 3); break;
    case 'horseFeed3': care('feed', 'hunger', 3); pay(3 * 3); break;
    case 'horseWater2': care('water', 'thirst', 2); break;
    case 'horseBrush1': care('brush', 'grooming', 1); break;
    case 'ride1': {
      a.needs.energy = 80;
      expect(canRide(a).ok, breed).toBe(true);
      if (!rideGear(a).ok) expect(tackUpForRide(p, a).ok, breed).toBe(true);
      addStat(p, 'rides');
      xp('ride');
      break;
    }
    case 'rideCanter1': a.needs.energy = 80; expect(allowedGait('canter', a).gait, breed).toBe('canter'); addStat(p, 'rideCanter'); break;
    case 'vet1': addStat(p, 'vet'); xp('vet'); pay(30); break; // la clinique (VET_COST.clinic)
    case 'galop1': {
      // 🏅 le Galop 1 : encore un pansage et une balade, puis l'examen
      care('brush', 'grooming', 1);
      addStat(p, 'rides');
      for (const it of GALOPS[0].practice) expect(p.stats[it.stat] ?? 0, `${breed} ${it.id}`).toBeGreaterThanOrEqual(it.n);
      expect(finishExam(p, 1, 5, 1).passed, breed).toBe(true);
      break;
    }
    case 'actvLesson1': activity('lesson', 'actvLessons'); break; // (gratuit)
    case 'actvJump1': activity('jumping', 'actvJumping'); break;
    case 'actvTrail1': activity('trail', 'actvTrail'); break;
    case 'beautyBraid1': addStat(p, 'beautyBraid'); addStat(p, 'beautyPrep'); xp('care'); break; // (le mini-jeu des tresses, gratuit)
    case 'drTrain3': for (let i = 0; i < 3; i++) activity('flat', 'actvTraining'); break; // (séances gratuites)
    case 'drReprise1': activity('dressage', 'actvDressage'); break;
    case 'actvCompete1': activity('jumping', 'actvCompetitions'); pay(10); break; // (concours du club : 10 🪙)
    default: throw new Error(id);
  }
  for (const o of checkObjectives(p)) xp(o.kind);
  return spent;
}

describe('chaque chapitre est faisable quand il arrive', () => {
  it('chaque maison, en bac à sable comme en gestion (sans la récompense du tutoriel), sans gros budget', () => {
    for (const home of PLACE_IDS) {
      for (const mode of ['sandbox', 'manage']) {
        const p = createProfile('Lou', mode, home);
        let spent = 0;
        for (const id of STORY) {
          expect(mainQuest(p), `${home} ${mode}`).toBe(id);
          expect(questBlock(id, p), `${home} ${mode} ${id} (${p.money} 🪙, niveau ${levelOf(p.xp)})`).toBeNull();
          spent += playChapter(p, id, `${home} ${p.animals[0]?.breed ?? ''}`);
          if (mode === 'manage') expect(p.money, `${home} ${id}`).toBeGreaterThanOrEqual(0);
        }
        expect(storyView(p).finished).toBe(true);
        expect(spent, home).toBeLessThanOrEqual(50); // (3 repas, la clinique et l'engagement au concours)
      }
    }
  });

  it('au refuge de la maison, il y a toujours un cheval adulte (qu\'on peut monter), tous les jours', () => {
    for (const home of PLACE_IDS) {
      for (let day = 1; day <= 40; day++) {
        const list = adoptionCandidates(home, day, [], true);
        const h = list.find((x) => x.species === 'horse');
        expect(h, `${home} jour ${day}`).toBeTruthy();
        expect(canRide({ ...h, needs: { ...h.needs, energy: 80 } }).ok, `${home} jour ${day}`).toBe(true);
      }
    }
  });

  it('sans métier à visiteurs (cavalier de concours seulement), le premier client le dit simplement', () => {
    const p = createProfile('Lou');
    p.xp = 400;
    startCareer(p, 'rider', 1, { level: 5 });
    expect(questBlock('client1', p)).toMatchObject({ need: 'visitCareer' });
    startCareer(p, 'vet', 1, { level: 5 });
    expect(questReady('client1', p)).toBe(true);
  });

  it('apprendre un tour demande le lien : sans s\'être occupé de l\'animal, la quête le dit', () => {
    const p = createProfile('Lou');
    p.animals.push(pet('cat'));
    expect(joinQuest(p, 'trick1').ok).toBe(true); // (une quête secondaire)
    expect(p.animals[0].bond).toBeLessThan(BOND_FOR_TRICKS);
    expect(questBlock('trick1', p)).toMatchObject({ need: 'bond', params: { n: 5, max: BOND_FOR_TRICKS } });
    expect(canFollow(p, 'trick1').reason).toBe('blocked');
    p.animals[0].bond = BOND_FOR_TRICKS;
    expect(questBlock('trick1', p)).toBeNull();
    // le spectacle demande un tour appris
    expect(questBlock('actvShow1', p)).toMatchObject({ need: 'trickKnown' });
  });

  it('en gestion sans assez d\'argent, le voyage dit combien il faut', () => {
    const p = createProfile('Lou', 'manage', 'japon');
    p.money = 10;
    const b = questBlock('travel1', p);
    expect(b).toMatchObject({ need: 'trip', key: 'qneed_trip' });
    expect(b.params.n).toBe(cheapestTrip(p));
    expect(b.params.n).toBeGreaterThan(10);
  });

  it('construire le salon : le niveau 3, et en gestion son prix', () => {
    const p = createProfile('Lou', 'manage');
    p.xp = 400;
    p.money = 100;
    expect(questBlock('grmSalon', p)).toMatchObject({ need: 'salonMoney', key: 'qneed_salonMoney', params: { n: 350 } });
    p.money = 350;
    expect(questBlock('grmSalon', p)).toBeNull();
    const s = createProfile('Lou', 'sandbox');
    s.xp = 400;
    s.money = 0;
    expect(questBlock('grmSalon', s)).toBeNull(); // (bac à sable : gratuit)
  });
});

describe('sauvegarde', () => {
  it('une nouvelle partie a l\'état des quêtes ; il est sauvegardé et relu', () => {
    const p = createProfile('Lou');
    expect(p.quests).toEqual({ joined: [], skipped: [] });
    joinQuest(p, 'scoop1');
    skipChapter(p);
    const back = parseSave(serializeSave([p]));
    expect(back.ok).toBe(true);
    expect(back.profiles[0].quests).toEqual({ joined: ['scoop1'], skipped: ['horse1'] });
    expect(mainQuest(back.profiles[0])).toBe('horsePet3');
  });

  it('ancienne sauvegarde (sans l\'état des quêtes) : rien de rejoint, sauf la quête suivie si c\'était une secondaire', () => {
    const old = createProfile('Old');
    delete old.quests;
    old.completed = ['horse1', 'horsePet3', 'horseFeed3'];
    old.animals.push(grown('horse'));
    old.questFollow = { id: 'horseTrip', step: 0, seen: [], steps: ['tapHorse', 'doRide'] };
    const m = migrate(JSON.parse(JSON.stringify(old)));
    expect(m.quests).toEqual({ joined: ['horseTrip'], skipped: [] });
    expect(mainQuest(m)).toBe('horseWater2'); // les chapitres déjà finis restent finis
    expect(storyView(m).done).toEqual(['horse1', 'horsePet3', 'horseFeed3']);
    expect(trackerQuest(m)).toMatchObject({ id: 'horseTrip', followed: true });
    // quête suivie = un chapitre de l'histoire : rien de rejoint
    const old2 = { ...JSON.parse(JSON.stringify(old)), questFollow: { id: 'horseWater2', step: 0, seen: [], steps: [] } };
    expect(migrate(old2).quests).toEqual({ joined: [], skipped: [] });
    // sans quête suivie
    const old3 = JSON.parse(JSON.stringify(old));
    delete old3.questFollow;
    expect(migrate(old3).quests).toEqual({ joined: [], skipped: [] });
    // l'ancien dernier chapitre (le voyage) suivi : c'est maintenant une quête secondaire, rejointe
    const old4 = { ...JSON.parse(JSON.stringify(old)), questFollow: { id: 'travel1', step: 0, seen: [], steps: [] } };
    expect(migrate(old4).quests.joined).toEqual(['travel1']);
    // et par le fichier de sauvegarde
    const back = parseSave(serializeSave([old]));
    expect(back.ok).toBe(true);
    expect(back.profiles[0].quests.joined).toEqual(['horseTrip']);
  });

  it('un état abîmé est réparé (ids inconnus, doublons, quêtes finies, chapitres rejoints sans être passés)', () => {
    const p = createProfile('Lou');
    p.completed = ['horseTrip'];
    p.quests = { joined: ['horseTrip', 'xx', 'scoop1', 'scoop1', 'horsePet3', 'abroad', 'baby', 'species4'], skipped: ['zz', 'horseFeed3', 'scoop1', 'horseFeed3'] };
    migrateQuests(p);
    expect(p.quests).toEqual({ joined: ['scoop1', 'abroad', 'baby'], skipped: ['horseFeed3'] });
    const q = createProfile('Lou');
    q.quests = 'n\'importe quoi';
    expect(questState(q)).toEqual({ joined: [], skipped: [] });
  });

  it('un fichier dont l\'état des quêtes est abîmé (un tableau) se charge quand même, réparé', () => {
    const p = createProfile('Lou');
    const text = serializeSave([p]).replace('"quests":{"joined":[],"skipped":[]}', '"quests":[]');
    expect(text).toContain('"quests":[]');
    const back = parseSave(text);
    expect(back.ok).toBe(true);
    expect(back.profiles[0].quests).toEqual({ joined: [], skipped: [] });
  });

  it('migrate ne touche pas à l\'objet qu\'on lui donne', () => {
    const raw = JSON.parse(JSON.stringify(createProfile('Lou')));
    raw.quests = { joined: ['scoop1', 'scoop1', 'zz'], skipped: ['horsePet3', 'zz'] };
    const before = JSON.stringify(raw);
    const m = migrate(raw);
    expect(JSON.stringify(raw)).toBe(before);
    expect(m.quests).toEqual({ joined: ['scoop1'], skipped: ['horsePet3'] });
    expect(m.quests).not.toBe(raw.quests);
  });

  it('deux copies d\'une partie : la plus récente garde son état des quêtes', () => {
    const a = createProfile('Lou');
    const b = JSON.parse(JSON.stringify(a));
    joinQuest(b, 'abroad');
    b.updatedAt = a.updatedAt + 1000;
    const r = mergeProfiles([a], [b]);
    expect(r.profiles[0].quests.joined).toEqual(['abroad']);
  });
});

describe('jongler entre les quêtes et les passer (⇄, ⏭️)', () => {
  it('les quêtes en cours : le chapitre puis les rejointes ; ⇄ fait le tour', () => {
    const p = createProfile('Lou');
    expect(activeQuests(p)).toEqual(['horse1']);
    expect(nextQuest(p)).toBeNull(); // une seule : rien à changer
    joinQuest(p, 'scoop1');
    joinQuest(p, 'abroad');
    expect(activeQuests(p)).toEqual(['horse1', 'scoop1', 'abroad']);
    expect(nextQuest(p)).toBe('scoop1');
    expect(nextQuest(p, -1)).toBe('abroad');
    expect(setFront(p, 'scoop1')).toBe(true);
    expect(trackerQuest(p)).toEqual({ id: 'scoop1', kind: 'joined', followed: false });
    expect(nextQuest(p)).toBe('abroad');
    setFront(p, 'abroad');
    expect(nextQuest(p)).toBe('horse1'); // (on revient au début)
  });

  it('on ne met devant que le chapitre en cours ou une quête rejointe ; la quête suivie (🧭) reste devant', () => {
    const p = createProfile('Lou');
    joinQuest(p, 'scoop1');
    expect(setFront(p, 'horseFeed3')).toBe(false); // chapitre pas encore arrivé
    expect(setFront(p, 'abroad')).toBe(false); // pas rejointe
    expect(setFront(p, 'zz')).toBe(false);
    setFront(p, 'scoop1');
    followQuest(p, 'horse1');
    expect(trackerQuest(p)).toEqual({ id: 'horse1', kind: 'main', followed: true });
    stopFollow(p);
    expect(trackerQuest(p).id).toBe('scoop1'); // ✋ : la quête mise devant revient
  });

  it('une quête mise devant puis finie : le suivi revient au chapitre en cours', () => {
    const p = createProfile('Lou');
    joinQuest(p, 'scoop1');
    setFront(p, 'scoop1');
    finish(p, 'scoop1');
    expect(trackerQuest(p)).toEqual({ id: 'horse1', kind: 'main', followed: false });
    afterQuestsDone(p, [{ id: 'scoop1' }], 'horse1');
    expect(questState(p).front).toBeUndefined();
  });

  it('⏭️ passer le chapitre en cours : le suivant arrive (comme « Passer pour l\'instant »)', () => {
    const p = createProfile('Lou');
    setFront(p, 'horse1');
    expect(passQuest(p, 'horse1')).toEqual({ ok: true, kind: 'main', next: 'horsePet3' });
    expect(mainQuest(p)).toBe('horsePet3');
    expect(storyView(p).skipped).toEqual(['horse1']);
    expect(trackerQuest(p).id).toBe('horsePet3');
    expect(passQuest(p, 'horseFeed3').ok).toBe(false); // pas encore arrivé
  });

  it('⏭️ passer une quête rejointe : elle va dans « Mises de côté », pas dans « Autres quêtes » ; ↩️ la reprend', () => {
    const p = createProfile('Lou');
    joinQuest(p, 'scoop1');
    joinQuest(p, 'abroad');
    setFront(p, 'scoop1');
    expect(passQuest(p, 'scoop1')).toEqual({ ok: true, kind: 'joined', next: null });
    expect(joinedQuests(p)).toEqual(['abroad']);
    expect(asideQuests(p)).toEqual(['scoop1']);
    expect(otherQuests(p).flatMap((th) => th.quests)).not.toContain('scoop1');
    expect(trackerQuest(p).id).toBe('horse1'); // la quête passée n'est plus devant
    expect(resumeAside(p, 'scoop1')).toEqual({ ok: true });
    expect(joinedQuests(p)).toEqual(['abroad', 'scoop1']);
    expect(asideQuests(p)).toEqual([]);
    expect(questState(p).aside).toBeUndefined(); // (le champ disparaît quand il est vide)
    expect(resumeAside(p, 'scoop1')).toEqual({ ok: false, reason: 'notAside' });
  });

  it('reprendre une quête mise de côté avec déjà 3 quêtes : il faut d\'abord en passer une', () => {
    const p = createProfile('Lou');
    joinQuest(p, 'scoop1');
    passQuest(p, 'scoop1');
    for (const id of ['abroad', 'travel1', 'species4']) expect(joinQuest(p, id).ok, id).toBe(true);
    expect(resumeAside(p, 'scoop1')).toEqual({ ok: false, reason: 'full' });
    passQuest(p, 'travel1');
    expect(resumeAside(p, 'scoop1').ok).toBe(true);
    expect(asideQuests(p)).toEqual(['travel1']);
    // rejoindre depuis ailleurs une quête mise de côté la sort aussi des mises de côté
    passQuest(p, 'abroad');
    expect(joinQuest(p, 'abroad').ok).toBe(true);
    expect(asideQuests(p)).toEqual(['travel1']);
  });

  it('⏭️ passer un chapitre repris dans « Mes quêtes » : il retourne avec les chapitres passés', () => {
    const p2 = createProfile('Lou');
    finish(p2, 'horse1');
    skipChapter(p2); // horsePet3 passé, horseFeed3 en cours
    skipChapter(p2); // horseFeed3 passé, horseWater2 en cours
    expect(resumeChapter(p2, 'horseFeed3')).toEqual({ ok: true, how: 'main' });
    skipChapter(p2); // horseFeed3 de nouveau passé
    expect(mainQuest(p2)).toBe('horseWater2');
    finish(p2, 'horseWater2');
    expect(mainQuest(p2)).toBe('horseBrush1');
    // un chapitre passé qui vient APRÈS le chapitre en cours va dans « Mes quêtes » quand on le reprend
    const p3 = createProfile('Lou');
    skipChapter(p3); // horse1
    skipChapter(p3); // horsePet3
    expect(resumeChapter(p3, 'horse1')).toEqual({ ok: true, how: 'main' });
    expect(resumeChapter(p3, 'horsePet3')).toEqual({ ok: true, how: 'joined' });
    expect(joinedQuests(p3)).toEqual(['horsePet3']);
    expect(passQuest(p3, 'horsePet3')).toEqual({ ok: true, kind: 'joined', next: null });
    expect(joinedQuests(p3)).toEqual([]);
    expect(asideQuests(p3)).toEqual([]); // pas dans les mises de côté…
    expect(storyView(p3).skipped).toEqual(['horsePet3']); // …mais avec les chapitres passés (↩️ Reprendre)
  });

  it('jongler garde l\'étape du suivi pas à pas de chaque quête', () => {
    const p = createProfile('Lou');
    p.animals.push(pet());
    finish(p, 'horse1');
    joinQuest(p, 'scoop1');
    const f = followQuest(p, 'horsePet3');
    expect(f.steps.length).toBeGreaterThan(1);
    p.questFollow.step = 1;
    p.questFollow.seen.push('panel:animal');
    holdFollow(p); // ⇄ vers une autre quête
    stopFollow(p);
    followQuest(p, 'scoop1', heldFollow(p, 'scoop1'));
    expect(p.questFollow.step).toBe(0);
    holdFollow(p);
    stopFollow(p);
    followQuest(p, 'horsePet3', heldFollow(p, 'horsePet3')); // ⇄ retour : même étape
    expect(p.questFollow).toMatchObject({ id: 'horsePet3', step: 1, seen: ['panel:animal'] });
    // passer une quête suivie garde aussi son étape pour plus tard
    passQuest(p, 'horsePet3');
    expect(heldFollow(p, 'horsePet3')).toMatchObject({ step: 1 });
  });

  it('sauvegarde : mises de côté, quête devant et étapes gardées sont relues ; un état abîmé est réparé', () => {
    const p = createProfile('Lou');
    joinQuest(p, 'scoop1');
    joinQuest(p, 'abroad');
    passQuest(p, 'scoop1');
    setFront(p, 'abroad');
    followQuest(p, 'abroad');
    holdFollow(p);
    const back = parseSave(serializeSave([p]));
    expect(back.ok).toBe(true);
    const q = back.profiles[0];
    expect(asideQuests(q)).toEqual(['scoop1']);
    expect(trackerQuest(q).id).toBe('abroad');
    expect(heldFollow(q, 'abroad')).toMatchObject({ id: 'abroad', step: 0 });
    const bad = createProfile('Lou');
    bad.completed = ['horseTrip'];
    bad.quests = { joined: ['scoop1'], skipped: [], aside: ['horsePet3', 'zz', 'horseTrip', 'abroad', 'abroad', 'scoop1'], front: 'zz', held: { horseTrip: { step: 1, seen: [], steps: ['a'] }, abroad: 'x', baby: { step: 0, seen: [], steps: ['a'] } } };
    migrateQuests(bad);
    expect(bad.quests).toEqual({ joined: ['scoop1'], skipped: [], aside: ['abroad'], held: { baby: { step: 0, seen: [], steps: ['a'] } } });
    const empty = createProfile('Lou');
    empty.quests = { joined: [], skipped: [], aside: 'x', front: 3, held: [] };
    migrateQuests(empty);
    expect(empty.quests).toEqual({ joined: [], skipped: [] });
  });

  it('jongler et passer au hasard ne casse jamais rien (simulation de 120 parties)', () => {
    const species = offeredSpeciesIds();
    for (let n = 0; n < 120; n++) {
      const rng = mulberry32(4200 + n);
      const p = createProfile('A', rng() < 0.5 ? 'manage' : 'sandbox', PLACE_IDS[Math.floor(rng() * PLACE_IDS.length)]);
      const k = Math.floor(rng() * 4);
      for (let i = 0; i < k; i++) p.animals.push((rng() < 0.5 ? pet : grown)(species[Math.floor(rng() * species.length)], rng() < 0.5 ? 'f' : 'm', `${n}-${i}`));
      for (const id of QUEST_IDS) if (rng() < 0.3) p.completed.push(id);
      for (let step = 0; step < 20; step++) {
        const r = rng();
        const any = QUEST_IDS[Math.floor(rng() * QUEST_IDS.length)];
        const act = activeQuests(p);
        const one = act[Math.floor(rng() * act.length)];
        if (r < 0.2) joinQuest(p, any);
        else if (r < 0.35 && one) passQuest(p, one);
        else if (r < 0.5) {
          const next = nextQuest(p, rng() < 0.5 ? 1 : -1);
          if (next) {
            const guiding = !!trackerQuest(p)?.followed;
            expect(setFront(p, next)).toBe(true);
            if (p.questFollow) { holdFollow(p); stopFollow(p); }
            if (guiding && !followBlock(next, p)) followQuest(p, next, heldFollow(p, next));
          }
        } else if (r < 0.6) {
          const aside = asideQuests(p);
          if (aside.length) resumeAside(p, aside[Math.floor(rng() * aside.length)]);
        } else if (r < 0.7) {
          if (canFollow(p, any).ok) {
            if (questKind(p, any) === 'side') joinQuest(p, any);
            if (p.questFollow && p.questFollow.id !== any) holdFollow(p);
            followQuest(p, any, heldFollow(p, any));
          }
        } else if (r < 0.75) stopFollow(p);
        else if (r < 0.8 && one) p.completed.push(one);
        else if (r < 0.85) {
          const skipped = storyView(p).skipped;
          if (skipped.length) resumeChapter(p, skipped[0]);
        }
        pruneAndCheck(p, n);
      }
      // relu depuis la sauvegarde : le même état
      const back = parseSave(serializeSave([p]));
      expect(back.ok).toBe(true);
      expect(activeQuests(back.profiles[0])).toEqual(activeQuests(p));
    }

    function pruneAndCheck(p, n) {
      afterQuestsDone(p, [], null);
      const act = activeQuests(p);
      const joined = joinedQuests(p);
      const aside = asideQuests(p);
      const q = trackerQuest(p);
      expect(joined.length, `${n}`).toBeLessThanOrEqual(MAX_JOINED);
      expect(act.length).toBeLessThanOrEqual(MAX_JOINED + 1);
      if (q) expect(act, `${n} ${q.id}`).toContain(q.id);
      else expect(act).toEqual([]);
      for (const id of aside) {
        expect(joined).not.toContain(id);
        expect(STORY).not.toContain(id);
        expect(p.completed).not.toContain(id);
      }
      for (const th of otherQuests(p)) for (const id of th.quests) expect(aside).not.toContain(id);
      if (p.questFollow && questKind(p, p.questFollow.id) !== 'done') expect(followBlock(p.questFollow.id, p), `${n} ${p.questFollow.id}`).toBeNull();
    }
  }, 30000);
});

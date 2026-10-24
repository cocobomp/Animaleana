// Quêtes principales (l'histoire de la ferme) et secondaires (rejoindre, enlever, passer, reprendre) :
// src/sim/quests.js. Tests déterministes (hasard avec graine seulement).

import { describe, it, expect } from 'vitest';
import { createProfile, migrate, addStat } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { SPECIES, offeredSpeciesIds } from '../src/sim/species.js';
import { OBJECTIVES, checkObjectives, objectiveShown } from '../src/sim/objectives.js';
import { PLACE_IDS } from '../src/sim/places.js';
import { XP, levelOf } from '../src/sim/progress.js';
import { canStart, startCareer } from '../src/sim/careers.js';
import { followQuest, questBlock, questReady, cheapestTrip, QUEST_GUIDE, QUEST_ORDER } from '../src/sim/tutorial.js';
import { serializeSave, parseSave, mergeProfiles } from '../src/sim/saveFile.js';
import { mulberry32, seeded } from '../src/sim/rng.js';
import {
  STORY, THEMES, MAX_JOINED, mainQuest, storyView, skipChapter, resumeChapter, joinQuest, leaveQuest, canJoin,
  joinedQuests, otherQuests, trackerQuest, afterQuestsDone, questKind, isSideQuest, migrateQuests, doneQuests, questState,
} from '../src/sim/quests.js';

const QUEST_IDS = OBJECTIVES.filter((o) => o.kind === 'quest').map((o) => o.id);
const pet = (species = 'dog', sex = 'f', seed = species + sex) => createAnimal({ species, sex, ageDays: 80, rng: seeded(seed) });
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

  it('les chapitres ne demandent aucune espèce particulière (jamais cachés)', () => {
    const p = createProfile('Lou');
    for (const id of STORY) {
      const o = OBJECTIVES.find((x) => x.id === id);
      expect(o.needs, id).toBeUndefined();
      expect(objectiveShown(p, o), id).toBe(true);
      // ni cheval, ni lapin, ni deux animaux, ni crottin : n'importe quel animal suffit
      for (const n of QUEST_GUIDE[id].need ?? []) expect(['horse', 'rabbit', 'pair', 'pooper', 'agility'], `${id} → ${n}`).not.toContain(n);
    }
  });

  it('chaque espèce proposée peut être caressée, nourrie, abreuvée, brossée et apprendre un tour', () => {
    for (const sid of offeredSpeciesIds()) {
      for (const act of ['pet', 'feed', 'water', 'brush']) expect(SPECIES[sid].actions, `${sid} ${act}`).toContain(act);
      expect(SPECIES[sid].tricks.length, sid).toBeGreaterThan(0);
    }
  });
});

describe('l\'histoire de la ferme', () => {
  it('commence par l\'adoption, puis un chapitre à la fois, dans l\'ordre', () => {
    const p = createProfile('Lou');
    expect(mainQuest(p)).toBe('adopt1');
    expect(storyView(p)).toMatchObject({ current: 'adopt1', chapter: 1, total: STORY.length, done: [], upcoming: STORY.length - 1 });
    finish(p, 'adopt1');
    p.animals.push(pet());
    expect(mainQuest(p)).toBe('pet3');
    expect(storyView(p)).toMatchObject({ chapter: 2, done: ['adopt1'], upcoming: STORY.length - 2 });
  });

  it('un chapitre fini plus tôt (hors de l\'histoire) compte comme fini', () => {
    const p = createProfile('Lou');
    finish(p, 'adopt1', 'travel1', 'vet1');
    expect(mainQuest(p)).toBe('pet3');
    expect(storyView(p).done).toEqual(['adopt1', 'vet1', 'travel1']);
    // les chapitres finis ne reviennent jamais
    finish(p, 'pet3', 'feed5', 'water3', 'brush3');
    expect(mainQuest(p)).toBe('trick1');
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
    finish(p, 'adopt1');
    followQuest(p, 'pet3');
    expect(skipChapter(p)).toBe('feed5');
    expect(p.questFollow).toBeNull(); // on ne suit plus un chapitre passé
    expect(mainQuest(p)).toBe('feed5');
    expect(storyView(p).skipped).toEqual(['pet3']);
    expect(isSideQuest(p, 'pet3')).toBe(true);
    expect(questKind(p, 'pet3')).toBe('side');
    expect(otherQuests(p).find((th) => th.id === 'animals').quests).toContain('pet3');
    // on peut le rejoindre comme une quête secondaire
    expect(joinQuest(p, 'pet3')).toEqual({ ok: true });
    expect(joinedQuests(p)).toEqual(['pet3']);
    // seul le chapitre en cours se passe
    expect(skipChapter(p, 'water3')).toBeUndefined();
    expect(mainQuest(p)).toBe('feed5');
  });

  it('reprendre un chapitre passé : il redevient le chapitre en cours', () => {
    const p = createProfile('Lou');
    finish(p, 'adopt1');
    skipChapter(p); // pet3
    skipChapter(p); // feed5
    expect(mainQuest(p)).toBe('water3');
    joinQuest(p, 'feed5');
    expect(resumeChapter(p, 'feed5')).toBe(true);
    expect(mainQuest(p)).toBe('feed5'); // avant water3 dans l'histoire
    expect(joinedQuests(p)).toEqual([]); // (il n'est plus une quête secondaire)
    expect(storyView(p).skipped).toEqual(['pet3']);
    expect(resumeChapter(p, 'water3')).toBe(false); // pas passé
  });

  it('tout passer : plus de chapitre en cours, sans rien perdre', () => {
    const p = createProfile('Lou');
    for (let i = 0; i < STORY.length; i++) skipChapter(p);
    expect(mainQuest(p)).toBeNull();
    expect(storyView(p)).toMatchObject({ current: null, finished: false, skipped: STORY });
    resumeChapter(p, 'travel1');
    expect(mainQuest(p)).toBe('travel1');
  });
});

describe('rejoindre et enlever des quêtes secondaires', () => {
  it(`au plus ${MAX_JOINED} en même temps ; enlever en libère une place`, () => {
    const p = createProfile('Lou');
    for (const id of ['scoop1', 'ride1', 'abroad']) expect(joinQuest(p, id)).toEqual({ ok: true });
    expect(joinedQuests(p)).toEqual(['scoop1', 'ride1', 'abroad']);
    expect(canJoin(p, 'baby')).toEqual({ ok: false, reason: 'full' });
    expect(joinQuest(p, 'baby').ok).toBe(false);
    expect(joinedQuests(p)).toHaveLength(MAX_JOINED);
    expect(leaveQuest(p, 'ride1')).toBe(true);
    expect(leaveQuest(p, 'ride1')).toBe(false); // déjà enlevée
    expect(joinQuest(p, 'baby')).toEqual({ ok: true });
    expect(joinedQuests(p)).toEqual(['scoop1', 'abroad', 'baby']);
  });

  it('on ne rejoint ni un chapitre de l\'histoire (en cours ou à venir), ni une quête finie, ni deux fois la même', () => {
    const p = createProfile('Lou');
    expect(canJoin(p, 'adopt1').reason).toBe('story'); // le chapitre en cours
    expect(canJoin(p, 'travel1').reason).toBe('story'); // un chapitre à venir
    finish(p, 'ride1');
    expect(canJoin(p, 'ride1').reason).toBe('done');
    joinQuest(p, 'scoop1');
    expect(canJoin(p, 'scoop1').reason).toBe('joined');
    expect(canJoin(p, 'pasUneQuete').reason).toBe('unknown');
    expect(canJoin(p, 'zoo10').reason).toBe('unknown'); // un succès, pas une quête
  });

  it('enlever ne perd rien : la progression reste, et on peut la rejoindre de nouveau', () => {
    const p = createProfile('Lou');
    p.animals.push(pet('horse'));
    joinQuest(p, 'ride1');
    followQuest(p, 'ride1');
    addStat(p, 'feed', 2);
    leaveQuest(p, 'ride1');
    expect(p.questFollow).toBeNull(); // on ne suit plus une quête enlevée
    expect(p.stats.feed).toBe(2);
    expect(questKind(p, 'ride1')).toBe('side');
    expect(joinQuest(p, 'ride1').ok).toBe(true);
  });

  it('une quête pas encore possible peut se rejoindre : elle dit ce qu\'il faut d\'abord', () => {
    const p = createProfile('Lou');
    expect(questBlock('ride1', p)).toMatchObject({ need: 'horse', key: 'qneed_horse' });
    expect(joinQuest(p, 'ride1').ok).toBe(true);
    p.animals.push(pet('horse'));
    expect(questBlock('ride1', p)).toBeNull();
  });

  it('une quête rejointe et finie quitte « Mes quêtes », avec sa récompense', () => {
    const p = createProfile('Lou', 'manage');
    p.animals.push(pet('horse'));
    joinQuest(p, 'ride1');
    joinQuest(p, 'scoop1');
    const money = p.money;
    addStat(p, 'rides');
    const done = checkObjectives(p);
    expect(done.map((o) => o.id)).toEqual(['ride1']);
    expect(p.money).toBe(money + OBJECTIVES.find((o) => o.id === 'ride1').reward);
    const r = afterQuestsDone(p, done, 'adopt1');
    expect(r.left).toEqual(['ride1']);
    expect(r.chapter).toBeNull(); // ce n'était pas le chapitre en cours
    expect(questState(p).joined).toEqual(['scoop1']);
    expect(joinedQuests(p)).toEqual(['scoop1']);
    expect(doneQuests(p)).toEqual(['ride1']);
  });

  it('une quête finie sans l\'avoir rejointe est récompensée pareil', () => {
    const p = createProfile('Lou', 'manage');
    const money = p.money;
    addStat(p, 'travels');
    expect(checkObjectives(p).map((o) => o.id)).toEqual(['travel1']); // un chapitre à venir, fini en avance
    expect(p.money).toBe(money + OBJECTIVES.find((o) => o.id === 'travel1').reward);
    expect(storyView(p).done).toEqual(['travel1']);
  });
});

describe('fin d\'un chapitre', () => {
  it('le chapitre fini est annoncé avec le suivant', () => {
    const p = createProfile('Lou');
    p.animals.push(pet());
    finish(p, 'adopt1');
    const before = mainQuest(p);
    addStat(p, 'pet', 3);
    const r = afterQuestsDone(p, checkObjectives(p), before);
    expect(r).toMatchObject({ chapter: 'pet3', next: 'feed5', storyDone: false });
  });

  it('le dernier chapitre : l\'histoire est finie', () => {
    const p = createProfile('Lou');
    finish(p, ...STORY.slice(0, -1));
    const before = mainQuest(p);
    expect(before).toBe('travel1');
    addStat(p, 'travels');
    expect(afterQuestsDone(p, checkObjectives(p), before)).toMatchObject({ chapter: 'travel1', next: null, storyDone: true });
  });
});

describe('le suivi à l\'écran', () => {
  it('montre le chapitre en cours, puis la quête suivie, puis la première rejointe, sinon rien', () => {
    const p = createProfile('Lou');
    expect(trackerQuest(p)).toEqual({ id: 'adopt1', kind: 'main', followed: false });
    joinQuest(p, 'scoop1');
    joinQuest(p, 'abroad');
    expect(trackerQuest(p).id).toBe('adopt1'); // la quête principale d'abord
    followQuest(p, 'abroad');
    expect(trackerQuest(p)).toEqual({ id: 'abroad', kind: 'joined', followed: true });
    p.questFollow = null;
    // la dernière choisie (✋ puis 🧭 la reprend) : seulement si elle est encore principale ou rejointe
    expect(trackerQuest(p, { recent: 'abroad' }).id).toBe('abroad');
    expect(trackerQuest(p, { recent: 'ride1' }).id).toBe('adopt1');
    finish(p, ...STORY);
    expect(trackerQuest(p)).toEqual({ id: 'scoop1', kind: 'joined', followed: false });
    leaveQuest(p, 'scoop1');
    leaveQuest(p, 'abroad');
    expect(trackerQuest(p)).toBeNull();
  });

  it('suivre le chapitre en cours : ⭐ et 🧭 ensemble', () => {
    const p = createProfile('Lou');
    followQuest(p, 'adopt1');
    expect(trackerQuest(p)).toEqual({ id: 'adopt1', kind: 'main', followed: true });
  });

  it('aucune quête impossible ou non choisie n\'est imposée (simulation de 300 parties)', () => {
    const species = offeredSpeciesIds();
    for (let n = 0; n < 300; n++) {
      const rng = mulberry32(900 + n);
      const p = createProfile('A', rng() < 0.5 ? 'manage' : 'sandbox', PLACE_IDS[Math.floor(rng() * PLACE_IDS.length)]);
      const k = Math.floor(rng() * 4);
      for (let i = 0; i < k; i++) p.animals.push(pet(species[Math.floor(rng() * species.length)], rng() < 0.5 ? 'f' : 'm', `${n}-${i}`));
      for (const id of QUEST_IDS) if (rng() < 0.4) p.completed.push(id);
      for (let i = 0; i < 3; i++) if (rng() < 0.3) skipChapter(p);
      for (const id of QUEST_IDS) if (rng() < 0.1) joinQuest(p, id);
      if (rng() < 0.3) {
        const pick = [mainQuest(p), ...joinedQuests(p)].filter(Boolean);
        if (pick.length) followQuest(p, pick[Math.floor(rng() * pick.length)]);
      }
      const q = trackerQuest(p);
      const main = mainQuest(p);
      const joined = joinedQuests(p);
      expect(joined.length).toBeLessThanOrEqual(MAX_JOINED);
      if (!q) {
        expect(main).toBeNull();
        expect(joined).toEqual([]);
        continue;
      }
      // Ce que montre le suivi : la quête suivie, le chapitre en cours ou une quête rejointe, jamais une autre.
      expect(q.followed ? q.id === p.questFollow.id : q.id === main || joined.includes(q.id), `${n} ${q.id}`).toBe(true);
      if (!q.followed && q.kind === 'joined') expect(main).toBeNull();
      expect(p.completed).not.toContain(q.id);
      expect(objectiveShown(p, OBJECTIVES.find((o) => o.id === q.id))).toBe(true);
      // Les autres quêtes : ni finies, ni rejointes, ni cachées, ni des chapitres pas encore arrivés.
      for (const th of otherQuests(p)) {
        for (const id of th.quests) {
          expect(p.completed).not.toContain(id);
          expect(joined).not.toContain(id);
          expect(isSideQuest(p, id)).toBe(true);
          expect(objectiveShown(p, OBJECTIVES.find((o) => o.id === id))).toBe(true);
        }
      }
    }
  });
});

/**
 * Joue un chapitre comme dans le jeu (statistiques, XP de src/sim/progress.js, coûts en mode gestion), puis
 * checkObjectives (récompenses) : de quoi vérifier que chaque chapitre est faisable quand il arrive, avec
 * l'argent et le niveau qu'on a à ce moment-là.
 */
function playChapter(p, id, species) {
  const xp = (k, n = 1) => { p.xp += XP[k] * n; };
  const pay = (n) => { if (p.mode === 'manage') p.money -= n; };
  switch (id) {
    case 'adopt1': p.animals.push(pet(species)); addStat(p, 'adopted'); xp('adopt'); break; // le refuge est gratuit
    case 'pet3': addStat(p, 'pet', 3); xp('care', 3); break;
    case 'feed5': addStat(p, 'feed', 5); xp('care', 5); pay(5 * 3); break;
    case 'water3': addStat(p, 'water', 3); xp('care', 3); break;
    case 'brush3': addStat(p, 'brush', 3); xp('care', 3); break;
    case 'vet1': addStat(p, 'vet'); xp('vet'); pay(30); break; // la clinique (VET_COST.clinic)
    case 'trick1': addStat(p, 'tricksLearned'); xp('trick', 4); xp('trickLearned'); break;
    case 'career1': {
      expect(canStart(p, 'pension', { level: levelOf(p.xp) }).ok, 'métier').toBe(true);
      startCareer(p, 'pension', 2, { level: levelOf(p.xp) });
      break;
    }
    case 'client1': addStat(p, 'clients'); p.money += p.mode === 'manage' ? 40 : 0; xp('client'); break; // 2 jours de pension d'un chien
    case 'travel1': pay(cheapestTrip(p)); addStat(p, 'travels'); xp('travel'); break;
    default: throw new Error(id);
  }
  for (const o of checkObjectives(p)) xp(o.kind);
}

describe('chaque chapitre est faisable quand il arrive', () => {
  it('pour chaque espèce, chaque maison, en bac à sable comme en gestion (sans la récompense du tutoriel)', () => {
    for (const species of offeredSpeciesIds()) {
      for (const home of PLACE_IDS) {
        for (const mode of ['sandbox', 'manage']) {
          const p = createProfile('Lou', mode, home);
          for (const id of STORY) {
            expect(mainQuest(p), `${species} ${home} ${mode}`).toBe(id);
            expect(questBlock(id, p), `${species} ${home} ${mode} ${id} (${p.money} 🪙, niveau ${levelOf(p.xp)})`).toBeNull();
            playChapter(p, id, species);
            if (mode === 'manage') expect(p.money, `${home} ${id}`).toBeGreaterThanOrEqual(0);
          }
          expect(storyView(p).finished).toBe(true);
        }
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

  it('en gestion sans assez d\'argent, le voyage dit combien il faut', () => {
    const p = createProfile('Lou', 'manage', 'japon');
    p.money = 10;
    const b = questBlock('travel1', p);
    expect(b).toMatchObject({ need: 'trip', key: 'qneed_trip' });
    expect(b.params.n).toBe(cheapestTrip(p));
    expect(b.params.n).toBeGreaterThan(10);
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
    expect(back.profiles[0].quests).toEqual({ joined: ['scoop1'], skipped: ['adopt1'] });
    expect(mainQuest(back.profiles[0])).toBe('pet3');
  });

  it('ancienne sauvegarde (sans l\'état des quêtes) : rien de rejoint, sauf la quête suivie si c\'était une secondaire', () => {
    const old = createProfile('Old');
    delete old.quests;
    old.completed = ['adopt1', 'pet3', 'feed5'];
    old.questFollow = { id: 'ride1', step: 0, seen: [], steps: ['tapHorse', 'doRide'] };
    const m = migrate(JSON.parse(JSON.stringify(old)));
    expect(m.quests).toEqual({ joined: ['ride1'], skipped: [] });
    expect(mainQuest(m)).toBe('water3'); // les chapitres déjà finis restent finis
    expect(storyView(m).done).toEqual(['adopt1', 'pet3', 'feed5']);
    expect(trackerQuest(m)).toMatchObject({ id: 'ride1', followed: true });
    // quête suivie = un chapitre de l'histoire : rien de rejoint
    const old2 = { ...JSON.parse(JSON.stringify(old)), questFollow: { id: 'water3', step: 0, seen: [], steps: [] } };
    expect(migrate(old2).quests).toEqual({ joined: [], skipped: [] });
    // sans quête suivie
    const old3 = JSON.parse(JSON.stringify(old));
    delete old3.questFollow;
    expect(migrate(old3).quests).toEqual({ joined: [], skipped: [] });
    // et par le fichier de sauvegarde
    const back = parseSave(serializeSave([old]));
    expect(back.ok).toBe(true);
    expect(back.profiles[0].quests.joined).toEqual(['ride1']);
  });

  it('un état abîmé est réparé (ids inconnus, doublons, quêtes finies, chapitres rejoints sans être passés)', () => {
    const p = createProfile('Lou');
    p.completed = ['ride1'];
    p.quests = { joined: ['ride1', 'xx', 'scoop1', 'scoop1', 'pet3', 'abroad', 'baby', 'species4'], skipped: ['zz', 'feed5', 'scoop1', 'feed5'] };
    migrateQuests(p);
    expect(p.quests).toEqual({ joined: ['scoop1', 'abroad', 'baby'], skipped: ['feed5'] });
    const q = createProfile('Lou');
    q.quests = 'n\'importe quoi';
    expect(questState(q)).toEqual({ joined: [], skipped: [] });
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

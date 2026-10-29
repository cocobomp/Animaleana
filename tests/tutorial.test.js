import { describe, it, expect } from 'vitest';
import { createProfile, addStat } from '../src/sim/profile.js';
import {
  TUTORIAL_STEPS, updateTutorial, noteEvent, tutorialStep, skipTutorial, restartTutorial,
  questGuide, questBlock, followBlock, QUEST_GUIDE, stepNumber,
  followQuest, updateFollow, noteFollowEvent, followView, stopFollow, QUEST_STEPS, FOLLOW_STEPS, stepWindow,
} from '../src/sim/tutorial.js';
import { OBJECTIVES } from '../src/sim/objectives.js';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';
import { trackerQuest, mainQuest, joinQuest } from '../src/sim/quests.js'; // ce que montre le suivi à l'écran

const fakeAnimal = (species = 'dog') => ({ id: Math.random().toString(36), species, needs: {} });

describe('tutoriel', () => {
  it('commence sur un nouveau profil', () => {
    const p = createProfile('Lou');
    expect(p.tutorial.done).toBe(false);
    expect(tutorialStep(p.tutorial).id).toBe('welcome');
    expect(stepNumber(p.tutorial)).toEqual({ n: 1, total: TUTORIAL_STEPS.length });
  });

  it('les étapes manuelles attendent le bouton OK', () => {
    const p = createProfile('Lou');
    expect(updateTutorial(p, {})).toBeNull();
    noteEvent(p.tutorial, 'next');
    expect(updateTutorial(p, {}).completed).toEqual(['welcome']);
    expect(p.tutorial.step).toBe('move');
  });

  it('se joue en entier comme un enfant', () => {
    const p = createProfile('Lou');
    const step = () => p.tutorial.step;
    noteEvent(p.tutorial, 'next');
    updateTutorial(p);
    // marcher
    expect(updateTutorial(p, { moved: 1 })).toBeNull();
    updateTutorial(p, { moved: 5 });
    expect(step()).toBe('refuge');
    // refuge fermé (8 h) : on ouvre le menu, puis on attend avec ⏩
    noteEvent(p.tutorial, 'building:refuge');
    updateTutorial(p, { refugeOpen: false });
    expect(step()).toBe('wait');
    noteEvent(p.tutorial, 'skip');
    updateTutorial(p, { refugeOpen: true });
    expect(step()).toBe('adopt');
    // adopter
    expect(updateTutorial(p, {})).toBeNull();
    p.animals.push(fakeAnimal());
    addStat(p, 'adopted');
    updateTutorial(p);
    expect(step()).toBe('tapAnimal');
    noteEvent(p.tutorial, 'animalActions');
    updateTutorial(p);
    expect(step()).toBe('feed');
    addStat(p, 'feed');
    updateTutorial(p);
    expect(step()).toBe('pet');
    addStat(p, 'pet');
    updateTutorial(p);
    expect(step()).toBe('journal');
    noteEvent(p.tutorial, 'panel:journal');
    // ⏩ a déjà été appris : l'étape « time » est sautée
    updateTutorial(p);
    updateTutorial(p);
    expect(step()).toBe('farm');
    noteEvent(p.tutorial, 'panel:farm');
    updateTutorial(p);
    expect(step()).toBe('end');
    noteEvent(p.tutorial, 'next');
    const r = updateTutorial(p);
    expect(r.finished).toBe(true);
    expect(p.tutorial.done).toBe(true);
    expect(tutorialStep(p.tutorial)).toBeNull();
  });

  it("saute l'attente si le refuge est ouvert, et apprend ⏩ plus tard", () => {
    const p = createProfile('Lou');
    p.tutorial.step = 'refuge';
    noteEvent(p.tutorial, 'building:refuge');
    updateTutorial(p, { refugeOpen: true });
    updateTutorial(p, { refugeOpen: true });
    expect(p.tutorial.step).toBe('adopt');
    p.tutorial.step = 'journal';
    noteEvent(p.tutorial, 'panel:journal');
    updateTutorial(p);
    expect(p.tutorial.step).toBe('time');
  });

  it("valide le repas si l'animal n'a plus faim", () => {
    const p = createProfile('Lou');
    p.animals.push(fakeAnimal());
    p.tutorial.step = 'feed';
    expect(updateTutorial(p, { full: {} })).toBeNull();
    updateTutorial(p, { full: { hunger: true } });
    expect(p.tutorial.step).toBe('pet');
  });

  it('peut être passé puis rejoué (sans réadopter si on a déjà des animaux)', () => {
    const p = createProfile('Lou');
    skipTutorial(p);
    expect(p.tutorial.done).toBe(true);
    expect(p.tutorial.skipped).toBe(true);
    expect(updateTutorial(p, {})).toBeNull();
    p.animals.push(fakeAnimal());
    addStat(p, 'adopted');
    restartTutorial(p);
    expect(p.tutorial.step).toBe('welcome');
    noteEvent(p.tutorial, 'next');
    updateTutorial(p);
    updateTutorial(p, { moved: 9 });
    updateTutorial(p, { moved: 0 }); // refuge, attente et adoption sautés
    expect(p.tutorial.step).toBe('tapAnimal');
  });
});

describe('quêtes claires', () => {
  it('chaque quête a un lieu', () => {
    for (const o of OBJECTIVES.filter((x) => x.kind === 'quest')) {
      expect(QUEST_GUIDE[o.id], o.id).toBeTruthy();
    }
  });

  it('montre d\'abord l\'adoption de ton premier cheval, puis ses soins (l\'histoire de la ferme)', () => {
    const p = createProfile('Lou');
    expect(trackerQuest(p).id).toBe('horse1');
    expect(questGuide('horse1', p)).toMatchObject({ where: 'refuge' });
    p.completed.push('horse1');
    p.animals.push(createAnimal({ species: 'horse', sex: 'f', ageDays: 60, rng: seeded('cheval') }));
    expect(trackerQuest(p).id).toBe('horsePet3');
    expect(questGuide('horsePet3', p)).toMatchObject({ where: 'horse' });
  });

  it('les soins de l\'histoire, sans cheval (un chat seulement) : d\'abord adopter un cheval', () => {
    const p = createProfile('Lou');
    p.animals.push(fakeAnimal('cat'));
    p.completed.push('horse1'); // (une ancienne partie : son cheval est parti)
    expect(questBlock('horsePet3', p)).toMatchObject({ key: 'qneed_horse' });
    expect(questGuide('horsePet3', p)).toMatchObject({ where: 'refuge', first: 'horse' });
    expect(followBlock('horsePet3', p)).toBeNull();
  });

  it("ne montre pas de monter à cheval sans cheval (sauf si on l'a choisi, et alors il dit pourquoi)", () => {
    const p = createProfile('Lou');
    p.animals.push(fakeAnimal('cat'));
    p.completed.push(...OBJECTIVES.filter((o) => o.kind === 'quest' && o.id !== 'actvClear1' && o.id !== 'actvCompete1').map((o) => o.id));
    expect(trackerQuest(p).id).toBe('actvCompete1'); // le dernier chapitre de l'histoire
    expect(mainQuest(p)).toBe('actvCompete1');
    p.completed.push('actvCompete1');
    expect(trackerQuest(p)).toBeNull(); // actvClear1 n'est pas imposée
    joinQuest(p, 'actvClear1');
    expect(trackerQuest(p).id).toBe('actvClear1');
    expect(questBlock('actvClear1', p)).toMatchObject({ key: 'qneed_horse' });
    expect(followBlock('actvClear1', p)).toBeNull(); // 🧭 emmène d'abord au refuge
    expect(questGuide('actvClear1', p)).toMatchObject({ where: 'refuge', first: 'horse' });
    p.animals.push(createAnimal({ species: 'horse', sex: 'f', ageDays: 60, rng: seeded('cheval') })); // adulte
    expect(questGuide('actvClear1', p).where).toBe('showground');
    expect(questBlock('actvClear1', p)).toBeNull(); // (le filet offert, rangé à la sellerie, se met tout seul)
  });

  it('sans aucun animal, une quête à cheval commence par adopter un cheval (pas « un animal »)', () => {
    const p = createProfile('Lou');
    expect(questGuide('ride1', p)).toMatchObject({ where: 'refuge', first: 'horse' });
    expect(questGuide('actvJump1', p)).toMatchObject({ first: 'horse' });
  });

  it('sans animal, les soins commencent au refuge', () => {
    const p = createProfile('Lou');
    expect(questGuide('feed5', p)).toMatchObject({ where: 'refuge', first: 'adopt' });
  });

  it('ne montre rien quand tout est fait', () => {
    const p = createProfile('Lou');
    p.completed.push(...OBJECTIVES.map((o) => o.id));
    expect(trackerQuest(p)).toBeNull();
  });
});

describe('suivre une quête', () => {
  it('chaque quête a des étapes connues', () => {
    for (const o of OBJECTIVES.filter((x) => x.kind === 'quest')) {
      expect(QUEST_STEPS[o.id], o.id).toBeTruthy();
      for (const s of QUEST_STEPS[o.id]) expect(FOLLOW_STEPS[s], s).toBeTruthy();
    }
  });

  it('vétérinaire : clinique, choisir l’animal, examen', () => {
    const p = createProfile('Lou');
    p.animals.push(fakeAnimal());
    followQuest(p, 'vet1');
    const now = () => followView(p, OBJECTIVES).current.id;
    expect(now()).toBe('goVet');
    expect(updateFollow(p, OBJECTIVES)).toBeNull();
    noteFollowEvent(p, 'building:vet');
    expect(updateFollow(p, OBJECTIVES).stepDone).toBe('goVet');
    expect(now()).toBe('vetOpen');
    noteFollowEvent(p, 'panel:vetClinic');
    updateFollow(p, OBJECTIVES);
    expect(now()).toBe('vetChoose');
    noteFollowEvent(p, 'panel:vetExam');
    updateFollow(p, OBJECTIVES);
    expect(now()).toBe('vetExam');
    expect(followView(p, OBJECTIVES).steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'now']);
    addStat(p, 'vet');
    expect(updateFollow(p, OBJECTIVES)).toEqual({ questDone: true, id: 'vet1' });
    expect(p.questFollow).toBeNull();
  });

  it('sans animal, on commence par le refuge (attente sautée si c’est ouvert)', () => {
    const p = createProfile('Lou');
    followQuest(p, 'feed5');
    expect(p.questFollow.steps.slice(0, 3)).toEqual(['goRefuge', 'waitOpen', 'adoptFirst']);
    noteFollowEvent(p, 'building:refuge');
    updateFollow(p, OBJECTIVES, { refugeOpen: true });
    expect(followView(p, OBJECTIVES).current.id).toBe('adoptFirst');
    p.animals.push(fakeAnimal());
    updateFollow(p, OBJECTIVES);
    expect(followView(p, OBJECTIVES).current.id).toBe('tapAnimal');
  });

  it('le voyage se coche : lieu, puis transport, puis départ', () => {
    const p = createProfile('Lou');
    followQuest(p, 'travel1');
    noteFollowEvent(p, 'panel:travel');
    updateFollow(p, OBJECTIVES);
    expect(followView(p, OBJECTIVES).current.id).toBe('pickPlace');
    updateFollow(p, OBJECTIVES, { travelDest: true });
    updateFollow(p, OBJECTIVES, { travelDest: true, travelMode: true });
    expect(followView(p, OBJECTIVES).current.id).toBe('goTravel');
    stopFollow(p);
    expect(followView(p, OBJECTIVES)).toBeNull();
  });
});

describe('⏩ de la barre du temps', () => {
  it("l'étape « time » se termine quand on appuie sur Avance rapide et vise ce bouton", () => {
    const p = createProfile('Lou');
    p.tutorial.step = 'time';
    expect(tutorialStep(p.tutorial).target).toEqual({ type: 'hud', id: 'timeFast' });
    expect(updateTutorial(p)).toBeNull();
    noteEvent(p.tutorial, 'timeFast');
    updateTutorial(p);
    expect(p.tutorial.step).toBe('farm');
    expect(p.tutorial.flags.skipUsed).toBe(true);
  });

  it("l'attente du refuge vise aussi Avance rapide", () => {
    expect(TUTORIAL_STEPS.find((s) => s.id === 'wait').target).toEqual({ type: 'hud', id: 'timeFast' });
  });
});

describe('suivi de quête sur le côté : quelques lignes seulement', () => {
  const steps = (states) => states.map((state, i) => ({ id: `s${i}`, state }));
  const ids = (w) => w.steps.map((s) => s.id);

  it('une quête courte se montre en entier', () => {
    const w = stepWindow(steps(['done', 'now', 'todo']), 3);
    expect(ids(w)).toEqual(['s0', 's1', 's2']);
    expect([w.before, w.after]).toEqual([0, 0]);
  });

  it('une longue quête : la dernière faite, celle en cours et la suivante', () => {
    const w = stepWindow(steps(['done', 'done', 'done', 'now', 'todo', 'todo', 'todo']), 3);
    expect(ids(w)).toEqual(['s2', 's3', 's4']);
    expect([w.before, w.after]).toEqual([2, 2]);
  });

  it('avec 2 lignes (téléphone en paysage) : celle en cours et la suivante', () => {
    const w = stepWindow(steps(['done', 'done', 'now', 'todo', 'todo']), 2);
    expect(ids(w)).toEqual(['s2', 's3']);
    expect([w.before, w.after]).toEqual([2, 1]);
  });

  it('au début et à la fin, la fenêtre reste pleine', () => {
    expect(ids(stepWindow(steps(['now', 'todo', 'todo', 'todo', 'todo']), 3))).toEqual(['s0', 's1', 's2']);
    const end = stepWindow(steps(['done', 'done', 'done', 'done', 'now']), 3);
    expect(ids(end)).toEqual(['s2', 's3', 's4']);
    expect(end.after).toBe(0);
  });

  it('la vraie quête du vétérinaire sans animal (7 étapes) tient en 3 lignes', () => {
    const p = createProfile('Lou');
    followQuest(p, 'vet1');
    const v = followView(p, OBJECTIVES);
    expect(v.steps.length).toBe(7);
    const w = stepWindow(v.steps, 3);
    expect(w.steps.length).toBe(3);
    expect(w.steps[0].state).toBe('now');
    expect(w.before + w.steps.length + w.after).toBe(7);
  });
});

describe('✋ touché par erreur, puis 🧭 : on reprend où on en était', () => {
  /** Suit la quête du vétérinaire (avec un animal) jusqu'à « choisir l'animal », puis l'arrête. */
  const pausedVet = () => {
    const p = createProfile('Lou');
    p.animals.push(fakeAnimal());
    followQuest(p, 'vet1');
    noteFollowEvent(p, 'building:vet');
    noteFollowEvent(p, 'panel:vetClinic');
    updateFollow(p, OBJECTIVES);
    const saved = { ...p.questFollow, seen: [...p.questFollow.seen] };
    stopFollow(p);
    return { p, saved };
  };

  it('même quête : la même étape, et les événements déjà vus', () => {
    const { p, saved } = pausedVet();
    expect(saved.step).toBe(2);
    followQuest(p, 'vet1', saved);
    expect(followView(p, OBJECTIVES).current.id).toBe('vetChoose');
    expect(p.questFollow.seen).toEqual(['building:vet', 'panel:vetClinic']);
    expect(p.questFollow.seen).not.toBe(saved.seen); // une copie : la reprise ne touche pas la sauvegarde
    noteFollowEvent(p, 'panel:vetExam');
    updateFollow(p, OBJECTIVES);
    expect(followView(p, OBJECTIVES).current.id).toBe('vetExam');
  });

  it('une autre quête repart du début', () => {
    const { p, saved } = pausedVet();
    followQuest(p, 'feed5', saved);
    expect(p.questFollow.step).toBe(0);
    expect(p.questFollow.seen).toEqual([]);
  });

  it('les étapes ont changé entre-temps (un animal adopté) : on repart du début', () => {
    const p = createProfile('Lou');
    followQuest(p, 'feed5');
    noteFollowEvent(p, 'building:refuge');
    updateFollow(p, OBJECTIVES, { refugeOpen: true });
    const saved = { ...p.questFollow, seen: [...p.questFollow.seen] };
    stopFollow(p);
    p.animals.push(fakeAnimal());
    followQuest(p, 'feed5', saved);
    expect(p.questFollow.steps).toEqual(QUEST_STEPS.feed5);
    expect(followView(p, OBJECTIVES).current.id).toBe('tapAnimal');
  });

  it('sans suivi à reprendre (ou un suivi abîmé), on commence normalement', () => {
    const p = createProfile('Lou');
    expect(followQuest(p, 'vet1', null).step).toBe(0);
    expect(followQuest(p, 'vet1', { id: 'vet1' }).step).toBe(0);
    const steps = p.questFollow.steps;
    expect(followQuest(p, 'vet1', { id: 'vet1', steps, step: 99, seen: [] }).step).toBe(steps.length - 1);
  });
});

describe('l\'histoire : au trot, puis au galop', () => {
  it('suivi : en selle, on passe tout de suite au bouton galop', () => {
    const p = createProfile('Lou');
    p.animals.push(createAnimal({ species: 'horse', sex: 'f', ageDays: 60, rng: seeded('cheval') }));
    p.completed.push('horse1', 'horsePet3', 'horseFeed3', 'horseWater2', 'horseBrush1', 'ride1');
    expect(mainQuest(p)).toBe('rideCanter1');
    followQuest(p, 'rideCanter1');
    expect(p.questFollow.steps).toEqual(['tapHorseRide', 'doMount', 'doCanter']);
    // à pied : d'abord toucher son cheval
    updateFollow(p, OBJECTIVES, { mounted: false });
    expect(p.questFollow.steps[p.questFollow.step]).toBe('tapHorseRide');
    // en selle : directement « 💨 Galop »
    updateFollow(p, OBJECTIVES, { mounted: true });
    expect(p.questFollow.steps[p.questFollow.step]).toBe('doCanter');
    expect(questBlock('rideCanter1', p)).toBeNull();
    addStat(p, 'rideCanter');
    expect(updateFollow(p, OBJECTIVES, { mounted: true })).toEqual({ questDone: true, id: 'rideCanter1' });
  });
});

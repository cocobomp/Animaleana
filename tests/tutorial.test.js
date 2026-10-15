import { describe, it, expect } from 'vitest';
import { createProfile, addStat } from '../src/sim/profile.js';
import {
  TUTORIAL_STEPS, updateTutorial, noteEvent, tutorialStep, skipTutorial, restartTutorial,
  suggestedQuest, questGuide, QUEST_GUIDE, stepNumber,
  followQuest, updateFollow, noteFollowEvent, followView, stopFollow, QUEST_STEPS, FOLLOW_STEPS,
} from '../src/sim/tutorial.js';
import { OBJECTIVES } from '../src/sim/objectives.js';

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

  it('propose d\'abord l\'adoption, puis les soins', () => {
    const p = createProfile('Lou');
    expect(suggestedQuest(p, OBJECTIVES).id).toBe('adopt1');
    p.completed.push('adopt1');
    p.animals.push(fakeAnimal());
    expect(suggestedQuest(p, OBJECTIVES).id).toBe('pet3');
  });

  it("ne propose pas de monter à cheval sans cheval", () => {
    const p = createProfile('Lou');
    p.animals.push(fakeAnimal('cat'));
    p.completed.push(...OBJECTIVES.filter((o) => o.kind === 'quest' && o.id !== 'ride1' && o.id !== 'travel1').map((o) => o.id));
    expect(suggestedQuest(p, OBJECTIVES).id).toBe('travel1');
    expect(questGuide('ride1', p)).toMatchObject({ where: 'refuge', first: 'horse' });
    p.animals.push(fakeAnimal('horse'));
    expect(questGuide('ride1', p).where).toBe('horse');
  });

  it('sans animal, les soins commencent au refuge', () => {
    const p = createProfile('Lou');
    expect(questGuide('feed5', p)).toMatchObject({ where: 'refuge', first: 'adopt' });
  });

  it('renvoie null quand tout est fait', () => {
    const p = createProfile('Lou');
    p.completed.push(...OBJECTIVES.map((o) => o.id));
    expect(suggestedQuest(p, OBJECTIVES)).toBeNull();
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

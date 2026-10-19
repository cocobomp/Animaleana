import { describe, it, expect } from 'vitest';
import {
  PREP_ITEMS, RIBBON_COLORS, checklistFor, prepItems, beautyData, allureOf, notePrep, freshness, isFresh, itemDone,
  weatherWear, clearPrep, checklist, isReady, beautyScore, presentationSteps, ringWindow, gaugeQuality, trotPar,
  fidgetChance, judgeMarks, rivalBeautyPoints, nowHours, undone, lowestNeed, accessoryInfo, colorFamily, ribbonColor,
  BEAUTY_CLASSES, classOf, classRivals, beautyEntries, entryFor, registerBlock, registerEntry, ringBlock, markPresented,
  missedEntries, todaysEntries, isChampion, handlerXp, CHAMPION_POINTS, JUDGE_CRITERIA, dirtiedSince, dirtState, showCare,
  CLEAN_MIN, DIRTY_DROP,
} from '../src/sim/beauty.js';
import { applyCare } from '../src/sim/animal.js';
import { competitionsAt, rivals, ranking, placementAward, practiceAward, eligibility, COMPETITION_TYPES } from '../src/sim/activities.js';
import { createAnimal } from '../src/sim/animal.js';
import { OBJECTIVES } from '../src/sim/objectives.js';
import { QUEST_GUIDE, QUEST_STEPS } from '../src/sim/tutorial.js';

const make = (species = 'horse') => {
  const a = createAnimal({ species, ageDays: 2000, rng: () => 0.5 });
  a.needs.hygiene = 50;
  a.needs.grooming = 50;
  a.needs.energy = 90;
  return a;
};

describe('préparation pour le concours', () => {
  it('chaque espèce a une liste avec des gestes connus', () => {
    for (const sp of ['horse', 'dog', 'cat', 'rabbit', 'sheep', 'goat', 'cow']) {
      const c = checklistFor(sp);
      expect(c.required.length).toBeGreaterThanOrEqual(3);
      for (const item of [...c.required, ...c.bonus]) expect(PREP_ITEMS[item], item).toBeTruthy();
    }
    expect(prepItems(make('horse'))).toContain('braid');
    expect(prepItems(make('dog'))).toContain('bow');
    expect(prepItems(make('rabbit'))).toContain('fluff');
  });

  it("l'allure est stable pour un même animal, entre 60 et 100", () => {
    const a = make();
    const v = allureOf(a);
    expect(v).toBeGreaterThanOrEqual(60);
    expect(v).toBeLessThanOrEqual(100);
    expect(allureOf(a)).toBe(v);
    expect(beautyData(a).allure).toBe(v);
  });

  it('un geste tient un certain temps puis se défraîchit', () => {
    const a = make();
    expect(isFresh(a, 'wash', 10)).toBe(false);
    notePrep(a, 'wash', 10, 1);
    expect(isFresh(a, 'wash', 20)).toBe(true);
    expect(freshness(a, 'wash', 20)).toBeGreaterThan(10);
    expect(isFresh(a, 'wash', 10 + 24 * 1.2)).toBe(false);
    // Les tresses tiennent 2 jours
    notePrep(a, 'braid', 10, 0.5, { color: 'pink' });
    expect(a.beauty.prep.braid.color).toBe('pink');
    expect(isFresh(a, 'braid', 10 + 47)).toBe(true);
    expect(isFresh(a, 'braid', 10 + 49)).toBe(false);
    // Couleur inconnue : rouge par défaut
    notePrep(a, 'bow', 0, 1, { color: 'rainbow' });
    expect(a.beauty.prep.bow.color).toBe('red');
    expect(notePrep(a, 'unknown', 0)).toBeNull();
  });

  it('un soin bien fait tient un peu plus longtemps', () => {
    const a = make();
    const b = make();
    notePrep(a, 'shine', 0, 1);
    notePrep(b, 'shine', 0, 0.4);
    expect(freshness(a, 'shine', 0)).toBeGreaterThan(freshness(b, 'shine', 0));
  });

  it('la pluie abîme la toilette et le lustrage', () => {
    const a = make();
    notePrep(a, 'wash', 0, 1);
    notePrep(a, 'shine', 0, 1);
    notePrep(a, 'braid', 0, 1);
    const before = freshness(a, 'wash', 5);
    expect(weatherWear(a, 'clear', 2)).toBe(false);
    expect(weatherWear(a, 'rain', 2)).toBe(true);
    expect(freshness(a, 'wash', 5)).toBeLessThan(before);
    expect(freshness(a, 'braid', 5)).toBeGreaterThan(freshness(a, 'wash', 5)); // les tresses résistent mieux
    clearPrep(a);
    expect(a.beauty.prep).toEqual({});
    expect(a.beauty.allure).toBeDefined();
  });

  it("la liste à cocher accepte aussi un animal déjà tout propre", () => {
    const a = make('dog');
    expect(itemDone(a, 'wash', 0)).toBe(false);
    a.needs.hygiene = 95;
    expect(itemDone(a, 'wash', 0)).toBe(true);
    const list = checklist(a, 0);
    expect(list.find((l) => l.item === 'wash').done).toBe(true);
    expect(list.find((l) => l.item === 'nails').required).toBe(false);
    expect(isReady(a, 0)).toBe(false);
    for (const item of checklistFor('dog').required) notePrep(a, item, 0, 1, { color: 'blue' });
    expect(isReady(a, 0)).toBe(false); // brossé, mais le poil est encore emmêlé (toilette réelle à 50)
    a.needs.grooming = 80; // le vrai brossage remonte la toilette
    expect(isReady(a, 0)).toBe(true);
    expect(isReady(a, 60)).toBe(false); // le lendemain soir, le bain et le lustrage sont vieux
  });
});

describe('note de beauté', () => {
  it('monte avec la préparation, la robe, le poids et le lien', () => {
    const a = make('horse');
    const base = beautyScore(a, 0);
    expect(base.score).toBeGreaterThanOrEqual(0);
    expect(base.score).toBeLessThanOrEqual(100);
    // Bain et brossage remontent la propreté réelle (soins normaux) : sans ça, ils ne comptent pas.
    a.needs.hygiene = 70;
    a.needs.grooming = 70;
    for (const item of prepItems(a)) notePrep(a, item, 0, 1, { color: 'red' });
    const prepped = beautyScore(a, 0);
    expect(prepped.score).toBeGreaterThan(base.score);
    expect(prepped.parts.presentation).toBe(1);
    a.needs.hygiene = 100;
    a.needs.grooming = 100;
    a.bond = 100;
    a.skills.obedience = 100;
    const shiny = beautyScore(a, 0);
    expect(shiny.score).toBeGreaterThan(prepped.score);
    a.weight = 90;
    expect(beautyScore(a, 0).score).toBeLessThan(shiny.score);
    a.weight = 50;
    a.sick = 'cold';
    expect(beautyScore(a, 0).score).toBeLessThan(shiny.score);
  });

  it("l'horloge du profil donne l'heure absolue", () => {
    expect(nowHours({ clock: 8 * 60 })).toBe(8);
    expect(nowHours(null)).toBe(0);
  });
});

describe('présentation au juge', () => {
  it('les chevaux et les chiens trottent, les petits animaux posent sur la table', () => {
    expect(presentationSteps('horse')).toEqual(['walk', 'halt', 'stand', 'turn', 'trot']);
    expect(presentationSteps('cat').at(-1)).toBe('pose');
  });

  it('jauges : zone verte au milieu, qualité qui baisse en s\'éloignant', () => {
    expect(gaugeQuality(0.5, 0.2)).toBe(1);
    expect(gaugeQuality(0.58, 0.2)).toBeGreaterThan(0.6);
    expect(gaugeQuality(0.9, 0.2)).toBe(0);
    const a = make('dog');
    const w0 = ringWindow(a);
    a.bond = 100;
    a.skills.obedience = 100;
    expect(ringWindow(a)).toBeGreaterThan(w0);
    expect(fidgetChance(a)).toBeLessThan(fidgetChance(make('dog')));
    expect(trotPar(20)).toBe(8);
  });

  it('le juge note sur 100 et commente ce qui manque', () => {
    const a = make('horse');
    const bad = judgeMarks(a, 0, { walk: 0.2, halt: 0, stand: 0, turn: 0, trot: 0.2 });
    expect(bad.points).toBeLessThan(55);
    expect(bad.stars).toBe(1);
    expect(['prep', 'presentation', 'movement', 'behaviour', 'condition', 'weight']).toContain(bad.comment);
    for (const item of prepItems(a)) notePrep(a, item, 0, 1);
    for (const n of Object.keys(a.needs)) a.needs[n] = 95; // propre ET de bonne humeur
    a.bond = 90;
    a.skills.obedience = 80;
    const good = judgeMarks(a, 0, { walk: 1, halt: 1, stand: 1, turn: 1, trot: 1 });
    expect(good.points).toBeGreaterThanOrEqual(80);
    expect(good.points).toBeLessThanOrEqual(100);
    expect(good.stars).toBe(3);
    expect(good.comment).toBe('perfect');
    expect(good.presentation + good.condition + good.movement + good.behaviour).toBeCloseTo(good.points, 0);
    // Un animal trop gros : le juge le dit
    a.weight = 95;
    expect(judgeMarks(a, 0, { walk: 1, halt: 1, stand: 1, turn: 1, trot: 1 }).comment).toBe('weight');
  });
});

describe('concours de beauté dans le calendrier', () => {
  it('fait partie de la rotation et a des concurrents avec des points', () => {
    expect(COMPETITION_TYPES).toContain('beauty');
    const comps = competitionsAt('maison', true, 1, 15);
    const c = comps.find((x) => x.type === 'beauty');
    expect(c).toBeTruthy();
    const rv = rivals(c);
    expect(rv.length).toBe(5);
    for (const r of rv) {
      expect(r.points).toBeGreaterThanOrEqual(40);
      expect(r.points).toBeLessThanOrEqual(95);
      expect(['horse', 'dog', 'cat', 'rabbit', 'sheep']).toContain(r.species);
    }
    expect(rivals(c)).toEqual(rv);
    expect(ranking(c, { points: 100 }, rv).rank).toBe(1);
    expect(ranking(c, { points: 1 }, rv).rank).toBe(6);
    expect(placementAward(c, 1).kind).toBe('trophy');
    expect(practiceAward('beauty', 3)).toEqual({ kind: 'ribbon', tier: 'red', money: 0 });
    expect(practiceAward('beauty', 2)).toBeNull();
  });

  it('tous les animaux adultes en forme peuvent participer', () => {
    for (const sp of ['horse', 'cat', 'sheep']) expect(eligibility(make(sp), 'beauty')).toBeNull();
    const baby = createAnimal({ species: 'dog', ageDays: 0 });
    expect(eligibility(baby, 'beauty')).toBe('baby');
  });

  it('les points des concurrents montent avec leur niveau', () => {
    expect(rivalBeautyPoints(1, () => 0)).toBe(85);
    expect(rivalBeautyPoints(0, () => 0)).toBe(40);
    expect(Object.keys(RIBBON_COLORS).length).toBeGreaterThanOrEqual(5);
  });

  it("l'aide trouve la fiche du concours de beauté", async () => {
    const { searchHelp } = await import('../src/ui/help.js');
    expect(searchHelp('tresser la crinière')[0].id).toBe('beauty');
  });

  it('les quêtes de beauté ont un guide et des étapes', () => {
    for (const id of ['beautyPrep1', 'beautyBraid1', 'beauty1']) {
      expect(OBJECTIVES.find((o) => o.id === id)).toBeTruthy();
      expect(QUEST_GUIDE[id]).toBeTruthy();
      expect(QUEST_STEPS[id]).toBeTruthy();
    }
  });
});

describe("l'animal vrai : propreté et humeur", () => {
  it('un bain défait par la saleté ne compte plus', () => {
    const a = make('dog');
    a.needs.hygiene = 80;
    notePrep(a, 'wash', 0, 1);
    expect(itemDone(a, 'wash', 1)).toBe(true);
    a.needs.hygiene = 40; // roulade dans la boue
    expect(undone(a, 'wash')).toBe(true);
    expect(itemDone(a, 'wash', 1)).toBe(false);
    const line = checklist(a, 1).find((l) => l.item === 'wash');
    expect(line.dirty).toBe(true);
    expect(line.old).toBe(false);
  });

  it('jamais lavé : « encore trop sale, fais-lui un bain », pas « il s\'est sali depuis son bain »', () => {
    const a = make('dog');
    a.needs.hygiene = 0;
    expect(dirtiedSince(a, 'wash')).toBe(false);
    expect(dirtState(a, 'wash', 0)).toBe('tooDirty');
    const line = checklist(a, 0).find((l) => l.item === 'wash');
    expect(line).toMatchObject({ done: false, dirty: false, tooDirty: true, old: false });
  });

  it('un bain ★★★ de concours sur un chien tout sale compte (avant : 59,98 < 60, « à refaire »)', () => {
    const a = make('dog');
    a.needs.hygiene = 0;
    applyCare(a, 'wash', 1); // le soin du mini-jeu (+60)
    a.needs.hygiene -= 0.02; // (le temps du mini-jeu)
    notePrep(a, 'wash', 0, 1); // noté par le soin ordinaire (événement 'care')
    expect(itemDone(a, 'wash', 0)).toBe(false); // un bain ordinaire ne suffit pas à un chien tout sale…
    expect(dirtState(a, 'wash', 0)).toBe('tooDirty'); // …et la liste dit « refais un bain », pas « sali depuis »
    expect(showCare(a, 'wash', 1)).toBe(true); // …mais le bain fait depuis la liste du concours, si
    notePrep(a, 'wash', 0, 1);
    expect(a.needs.hygiene).toBeGreaterThanOrEqual(CLEAN_MIN + 20);
    expect(itemDone(a, 'wash', 0)).toBe(true);
    expect(dirtState(a, 'wash', 0)).toBeNull();
  });

  it('même chose pour le brossage ★★★ (toilette 0,6 → 40,6 avant)', () => {
    const a = make('dog');
    a.needs.grooming = 0.6;
    applyCare(a, 'brush', 1);
    expect(a.needs.grooming).toBeLessThan(CLEAN_MIN);
    showCare(a, 'brush', 1);
    notePrep(a, 'brush', 0, 1);
    expect(itemDone(a, 'brush', 0)).toBe(true);
  });

  it('un bain raté (★) ne fait pas la toilette de concours : encore un peu sale', () => {
    const a = make('dog');
    a.needs.hygiene = 0;
    applyCare(a, 'wash', 0.3);
    expect(showCare(a, 'wash', 0.3)).toBe(false);
    notePrep(a, 'wash', 0, 0.3);
    expect(dirtState(a, 'wash', 0)).toBe('tooDirty');
  });

  it('après un bon bain, la petite baisse naturelle ne l\'efface pas ; la boue, si', () => {
    const a = make('dog');
    a.needs.hygiene = 80;
    notePrep(a, 'wash', 0, 1);
    a.needs.hygiene = CLEAN_MIN - DIRTY_DROP + 2; // quelques heures plus tard
    expect(itemDone(a, 'wash', 6)).toBe(true);
    expect(dirtState(a, 'wash', 6)).toBeNull();
    a.needs.hygiene = 20; // roulade dans la boue
    expect(dirtiedSince(a, 'wash')).toBe(true);
    expect(dirtState(a, 'wash', 6)).toBe('dirtied');
    expect(checklist(a, 6).find((l) => l.item === 'wash')).toMatchObject({ dirty: true, tooDirty: false });
  });

  it('les nouveaux textes existent en français et en anglais', async () => {
    const texts = await import('../src/ui/beautyTexts.js');
    const [fr, en] = [Object.values(texts)[0], Object.values(texts)[1]];
    for (const k of ['beauty_real_tooDirty', 'beauty_real_tangled', 'beauty_tooDirty_wash', 'beauty_tooDirty_brush']) {
      expect(fr[k], k).toBeTruthy();
      expect(en[k], k).toBeTruthy();
    }
  });

  it("l'humeur compte : un animal affamé est moins beau et le juge le dit", () => {
    const a = make('horse');
    for (const n of Object.keys(a.needs)) a.needs[n] = 95;
    for (const item of prepItems(a)) notePrep(a, item, 0, 1, { color: 'pink' });
    a.bond = 70;
    const happy = beautyScore(a, 0);
    expect(happy.parts.mood).toBeGreaterThan(0.8);
    expect(lowestNeed(a)).toBeNull();
    a.needs.hunger = 5;
    a.needs.thirst = 10;
    a.needs.affection = 10;
    const sad = beautyScore(a, 0);
    expect(sad.parts.mood).toBeLessThan(happy.parts.mood);
    expect(sad.score).toBeLessThan(happy.score);
    expect(lowestNeed(a)).toBe('hunger');
    expect(fidgetChance(a)).toBeGreaterThan(0);
    const perf = { walk: 1, halt: 0.5, stand: 0.4, turn: 0.5, trot: 1 };
    const m = judgeMarks(a, 0, perf);
    expect(m.comment).toBe('mood');
    expect(m.need).toBe('hunger');
  });

  it('un animal sale : le juge parle du bain', () => {
    const a = make('dog');
    for (const n of Object.keys(a.needs)) a.needs[n] = 95;
    for (const item of prepItems(a)) notePrep(a, item, 0, 1);
    a.needs.hygiene = 15;
    a.needs.grooming = 30;
    const m = judgeMarks(a, 0, { walk: 1, halt: 1, stand: 1, turn: 1, trot: 1 });
    expect(['prep', 'dirty']).toContain(m.comment);
    expect(JUDGE_CRITERIA).toEqual(['presentation', 'condition', 'movement', 'behaviour']);
  });
});

describe('accessoires assortis (sellerie)', () => {
  it('un licol de la couleur des rubans donne un bonus', () => {
    const a = make('horse');
    a.needs.hygiene = 80;
    a.needs.grooming = 80;
    expect(accessoryInfo(a, 0).ribbon).toBeNull();
    notePrep(a, 'braid', 0, 1, { color: 'pink' });
    expect(ribbonColor(a, 1)).toBe('pink');
    a.gear = { halter: { item: 'halter', color: 'navy' } };
    let acc = accessoryInfo(a, 1);
    expect(acc.matches).toBe(false);
    expect(acc.want).toBe('pink');
    expect(acc.target).toBe('halter');
    const before = beautyScore(a, 1).parts.presentation;
    a.gear.halter.color = 'pink';
    acc = accessoryInfo(a, 1);
    expect(acc.matches).toBe(true);
    expect(beautyScore(a, 1).parts.presentation).toBeGreaterThan(before);
    expect(judgeMarks(a, 1, { walk: 1, halt: 1, stand: 1, turn: 1, trot: 1 }).matches).toBe(true);
  });

  it('couleurs de la sellerie ramenées aux couleurs des rubans', () => {
    expect(colorFamily('navy')).toBe('blue');
    expect(colorFamily('sky')).toBe('blue');
    expect(colorFamily('brown')).toBeNull();
    const dog = make('dog');
    notePrep(dog, 'bow', 0, 1, { color: 'blue' });
    dog.gear = { neck: { item: 'collar', color: 'navy' } };
    expect(accessoryInfo(dog, 1).matches).toBe(true);
    expect(accessoryInfo(make('rabbit'), 0)).toBeNull(); // pas de licol ni de collier
  });
});

describe('classes et inscription', () => {
  const comp = { id: 'maison-6-beauty', place: 'maison', day: 6, type: 'beauty', level: 1, levelId: 'club', fee: 10, prizes: [80, 45, 25], open: 9, close: 18 };

  it('chaque espèce a sa classe, avec des concurrents de la même classe', () => {
    expect(classOf('horse')).toBe('horses');
    expect(classOf('rabbit')).toBe('small');
    expect(classOf('goat')).toBe('farm');
    for (const cls of Object.keys(BEAUTY_CLASSES)) {
      const rv = classRivals(comp, cls);
      expect(rv.length).toBe(5);
      for (const r of rv) {
        expect(BEAUTY_CLASSES[cls].species).toContain(r.species);
        expect(r.points).toBeGreaterThanOrEqual(40);
        expect(r.points).toBeLessThanOrEqual(95);
      }
      expect(classRivals(comp, cls)).toEqual(rv); // toujours les mêmes
    }
    const top = classRivals({ ...comp, level: 3 }, 'dogs').reduce((s, r) => s + r.points, 0);
    const low = classRivals(comp, 'dogs').reduce((s, r) => s + r.points, 0);
    expect(top).toBeGreaterThan(low); // le grand prix est plus relevé
  });

  it("s'inscrire à l'avance, un animal par classe, puis entrer le jour du concours", () => {
    const p = { animals: [] };
    const horse = make('horse');
    const horse2 = make('horse');
    const cat = make('cat');
    expect(registerBlock(p, comp, horse, { day: 2, hour: 10 })).toBeNull();
    registerEntry(p, comp, horse);
    expect(entryFor(p, comp.id, horse.id).cls).toBe('horses');
    expect(registerBlock(p, comp, horse, { day: 2, hour: 10 })).toBe('already');
    expect(registerBlock(p, comp, horse2, { day: 2, hour: 10 })).toBe('classTaken');
    expect(registerBlock(p, comp, cat, { day: 2, hour: 10 })).toBeNull();
    expect(registerBlock(p, comp, cat, { day: 7, hour: 10 })).toBe('over');
    expect(registerBlock(p, comp, cat, { day: 6, hour: 18 })).toBe('over');
    const baby = createAnimal({ species: 'dog', ageDays: 0 });
    expect(registerBlock(p, comp, baby, { day: 2, hour: 10 })).toBe('baby');
    // Entrer dans la carrière : le jour même, aux heures d'ouverture
    expect(ringBlock(p, comp, horse, { day: 5, hour: 10 })).toBe('notYet');
    expect(ringBlock(p, comp, horse, { day: 6, hour: 8 })).toBe('notYet');
    expect(ringBlock(p, comp, horse, { day: 6, hour: 10 })).toBeNull();
    expect(todaysEntries(p, 6).length).toBe(1);
    markPresented(p, comp, horse, { points: 82, rank: 2 });
    expect(ringBlock(p, comp, horse, { day: 6, hour: 11 })).toBe('presented');
    expect(entryFor(p, comp.id, horse.id)).toMatchObject({ presented: true, points: 82, rank: 2 });
    expect(todaysEntries(p, 6).length).toBe(0);
  });

  it('une inscription oubliée est signalée une seule fois', () => {
    const p = {};
    const dog = make('dog');
    registerEntry(p, comp, dog);
    expect(missedEntries(p, 6)).toEqual([]);
    const missed = missedEntries(p, 7);
    expect(missed.length).toBe(1);
    expect(missedEntries(p, 8)).toEqual([]);
    expect(beautyEntries(p).length).toBe(1);
    missedEntries(p, 60); // très vieille : oubliée
    expect(beautyEntries(p).length).toBe(0);
  });

  it('récompenses : écharpe du plus bel animal et XP du handler', () => {
    expect(isChampion(1, CHAMPION_POINTS)).toBe(true);
    expect(isChampion(1, CHAMPION_POINTS - 1)).toBe(false);
    expect(isChampion(2, 99)).toBe(false);
    expect(handlerXp(3, 1)).toBeGreaterThan(handlerXp(3, null));
    expect(handlerXp(3)).toBeGreaterThan(handlerXp(1));
  });
});

describe('métier de handler (registre des métiers et clients)', () => {
  it('est inscrit dans le registre des métiers, avec carnet, rangs et avantages', async () => {
    const { CAREERS, CAREER_IDS, startCareer, noteAction, rankOf, addCareerXp } = await import('../src/sim/careers.js');
    expect(CAREER_IDS).toContain('handler');
    const def = CAREERS.handler;
    expect(def.building).toBe('showground');
    expect(def.ranks.length).toBe(3);
    expect(def.perks.length).toBe(3);
    expect(def.actions.map((x) => x.id)).toEqual(['welcome', 'prep', 'braid', 'present', 'return']);
    for (const perk of def.perks) expect(perk.maxClients).toBeGreaterThan(0);
    const { createProfile } = await import('../src/sim/profile.js');
    const p = createProfile('Lou', 'manage');
    expect(startCareer(p, 'handler', 1, { level: 5 }).ok).toBe(true);
    expect(noteAction(p, 'handler', 'present').first).toBe(true);
    addCareerXp(p, 'handler', 400);
    expect(rankOf(p, 'handler')).toBe(2);
  });

  it('les clients du handler : préparer et présenter leur animal, payé selon la note', async () => {
    const { createProfile } = await import('../src/sim/profile.js');
    const { startCareer } = await import('../src/sim/careers.js');
    const { createVisit, acceptVisit, completeClient, finalScore, noteClientContest, pickVisitKind, worstPoint, pricing } = await import('../src/sim/clients.js');
    const p = createProfile('Lou', 'manage');
    p.xp = 9999;
    startCareer(p, 'handler', 1, { level: 5 });
    expect(pickVisitKind(p, () => 0.1)).toBe('handler');
    const visit = createVisit(p, { day: 1, clock: 600, place: 'maison' }, () => 0.3, 'handler');
    expect(visit.career).toBe('handler');
    expect(visit.days).toBeGreaterThanOrEqual(2);
    expect(visit.price).toBeGreaterThan(pricing(visit.animal.species, 'pension', visit.days).total);
    const r = acceptVisit(p, visit, 1);
    expect(r.ok).toBe(true);
    const a = r.animal;
    expect(a.client.contest).toBeNull();
    for (const n of Object.keys(a.needs)) a.needs[n] = 90;
    const without = finalScore(a, 3);
    expect(without).toBeLessThanOrEqual(25); // pas présenté : le propriétaire n'est pas content
    expect(worstPoint(a)).toBe('notPresented');
    expect(noteClientContest(a, { points: 60, stars: 2 })).toBe(true);
    expect(noteClientContest(a, { points: 85, rank: 1, stars: 3, comp: true })).toBe(false);
    expect(a.client.contest.points).toBe(85); // la meilleure présentation est gardée
    noteClientContest(a, { points: 50, stars: 1 });
    expect(a.client.contest.points).toBe(85);
    expect(finalScore(a, 3)).toBeGreaterThan(70);
    const res = completeClient(p, a, 3, () => 0.9);
    expect(res.kind).toBe('handler');
    expect(res.contest.points).toBe(85);
    expect(res.money).toBeGreaterThan(0);
    expect(p.stats.clientsHandler).toBe(1);
  });

  it('textes du métier en français et en anglais', async () => {
    globalThis.document = globalThis.document ?? { documentElement: {} };
    const { t, setLang } = await import('../src/i18n.js');
    const keys = ['career_handler', 'careerd_handler', 'ca_offer_handler', 'ca_perk_apprentice_handler', 'ca_perk_skilled_handler', 'ca_perk_expert_handler',
      'ca_handler_welcome', 'ca_handler_prep', 'ca_handler_braid', 'ca_handler_present', 'ca_handler_return', 'cl_kind_handler', 'cl_hello_handler',
      'cl_todo_handler', 'cl_hint_notPresented', 'beauty_class_horses', 'beauty_judge_mood', 'beauty_need_hunger'];
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of keys) expect(t(k, { name: 'X' }), `${lang} ${k}`).not.toBe(k);
    }
    setLang('en');
    expect(t('career_handler')).toBe('Show handler');
    setLang('fr');
    expect(t('cl_hello_handler', { name: 'Plume', g: 'f', days: 2 })).toMatch(/la préparer/);
  });
});

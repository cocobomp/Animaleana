import { describe, it, expect } from 'vitest';
import {
  helperLevel, addHelperXp, helperSpeed, helperQuality, tireHelper, startBreak, onBreak, updateBreak,
  trainHelper, praiseHelper, helperNews, setPriority, TRAIN_XP,
} from '../src/sim/helpers.js';
import { helperTask } from '../src/sim/farm.js';

const groom = () => ({ id: 'h1', type: 'groom', name: 'Lucie', sex: 'f', place: 'maison' });
const horse = (id, needs = {}) => ({ id, name: id, species: 'horse', sex: 'f', needs: { hunger: 90, thirst: 90, hygiene: 90, energy: 90, exercise: 90, affection: 90, grooming: 90, ...needs } });
const profile = () => ({ clock: 600, helpers: [], equipment: [], droppings: [] });

describe('aides : progression', () => {
  it('gagne des niveaux avec l\'expérience et travaille plus vite et mieux', () => {
    const h = groom();
    expect(helperLevel(h)).toBe(1);
    const q1 = helperQuality(h);
    const s1 = helperSpeed(h);
    expect(addHelperXp(h, 40).levelUp).toBe(true);
    expect(helperLevel(h)).toBe(2);
    expect(helperQuality(h)).toBeGreaterThan(q1);
    expect(helperSpeed(h)).toBeLessThan(s1);
  });
  it('se fatigue et ralentit, la pause la remet en forme', () => {
    const h = groom();
    tireHelper(h, 30);
    expect(h.mood).toBeLessThan(30);
    expect(helperSpeed(h)).toBeGreaterThan(1);
    startBreak(h, 600);
    expect(onBreak(h, 630)).toBe(true);
    expect(helperTask(profile(), h, [horse('a', { hunger: 10 })])).toBe(null); // en pause : ne travaille pas
    expect(updateBreak(h, 661)).toBe(true);
    expect(h.mood).toBeGreaterThan(50);
  });
  it('formation et compliments une fois par jour', () => {
    const h = groom();
    expect(trainHelper(h, 3).ok).toBe(true);
    expect(h.xp).toBe(TRAIN_XP);
    expect(trainHelper(h, 3).reason).toBe('trainedToday');
    expect(praiseHelper(h, 3).ok).toBe(true);
    expect(praiseHelper(h, 3).ok).toBe(false);
  });
});

describe('aides : consignes et nouvelles', () => {
  it('s\'occupe d\'abord de l\'animal prioritaire', () => {
    const h = groom();
    const a = horse('a', { hunger: 20 });
    const b = horse('b', { hunger: 70 });
    expect(helperTask(profile(), h, [a, b]).animalId).toBe('a');
    setPriority(h, 'b');
    expect(helperTask(profile(), h, [a, b]).animalId).toBe('b');
  });
  it('raconte qui a besoin de quoi', () => {
    const h = groom();
    expect(helperNews(h, [])[0].key).toBe('nobody');
    expect(helperNews(h, [horse('a')])[0].key).toBe('allGood');
    const news = helperNews(h, [horse('a', { thirst: 10 }), { ...horse('b'), sick: true }]);
    expect(news[0].key).toBe('sick');
    expect(news.some((n) => n.key === 'need' && n.need === 'thirst')).toBe(true);
  });
});

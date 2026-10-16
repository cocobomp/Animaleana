import { describe, it, expect } from 'vitest';
import { createProfile } from '../src/sim/profile.js';
import {
  CAREERS, CAREER_IDS, RANKS, careerState, canStart, startCareer, rankOf, rankProgress, addCareerXp, noteAction,
  nextAction, carnet, shouldPropose, markProposed, hintOnce, careerSummary, setActiveCareer, reputationOf, changeReputation,
  ACTION_XP, QUESTS_FOR_CAREER,
} from '../src/sim/careers.js';
import { OBJECTIVES } from '../src/sim/objectives.js';

describe('registre des métiers', () => {
  it('chaque métier a un emoji, un niveau, 3 rangs, des actions et des avantages par rang', () => {
    expect(CAREER_IDS).toEqual(expect.arrayContaining(['vet', 'pension']));
    for (const id of CAREER_IDS) {
      const def = CAREERS[id];
      expect(def.id).toBe(id);
      expect(def.emoji).toBeTruthy();
      expect(def.level).toBeGreaterThanOrEqual(1);
      expect(def.ranks).toHaveLength(RANKS.length);
      expect(def.ranks[0]).toBe(0);
      expect(def.actions.length).toBeGreaterThanOrEqual(3);
      for (const a of def.actions) expect(a.id && a.emoji && a.where).toBeTruthy();
      expect(def.perks).toHaveLength(RANKS.length);
    }
  });
});

describe('commencer un métier', () => {
  it('demande le niveau requis', () => {
    const p = createProfile('Lou');
    expect(canStart(p, 'vet', { level: 1 })).toMatchObject({ ok: false, reason: 'level', n: 3 });
    expect(startCareer(p, 'vet', 1, { level: 1 }).ok).toBe(false);
    expect(startCareer(p, 'vet', 2, { level: 3 }).ok).toBe(true);
    expect(careerState(p).started.vet).toBe(2);
    expect(careerState(p).active).toBe('vet');
    expect(p.stats.careersStarted).toBe(1);
    expect(startCareer(p, 'vet', 2, { level: 3 })).toMatchObject({ ok: false, reason: 'started' });
  });

  it('on peut apprendre plusieurs métiers et choisir celui qu\'on suit', () => {
    const p = createProfile('Lou');
    startCareer(p, 'vet', 1, { level: 5 });
    startCareer(p, 'pension', 1, { level: 5 });
    expect(careerState(p).active).toBe('pension');
    setActiveCareer(p, 'vet');
    expect(careerState(p).active).toBe('vet');
    expect(careerSummary(p, 'vet', { level: 5 }).active).toBe(true);
  });

  it('résumé : verrouillé, disponible, commencé', () => {
    const p = createProfile('Lou');
    expect(careerSummary(p, 'vet', { level: 1 }).state).toBe('locked');
    expect(careerSummary(p, 'vet', { level: 3 }).state).toBe('available');
    startCareer(p, 'vet', 1, { level: 3 });
    expect(careerSummary(p, 'vet', { level: 3 })).toMatchObject({ state: 'started', rank: 0, reputation: 50 });
  });
});

describe('carnet, XP et rangs', () => {
  it('une action cochée la première fois donne de l\'XP, pas la deuxième', () => {
    const p = createProfile('Lou');
    expect(noteAction(p, 'vet', 'exam')).toBeNull(); // métier pas commencé
    startCareer(p, 'vet', 1, { level: 3 });
    expect(nextAction(p, 'vet').id).toBe('welcome');
    expect(noteAction(p, 'vet', 'welcome')).toEqual({ first: true, rankUp: null });
    expect(noteAction(p, 'vet', 'welcome')).toEqual({ first: false, rankUp: null });
    expect(careerState(p).xp.vet).toBe(ACTION_XP);
    expect(nextAction(p, 'vet').id).toBe('exam');
    expect(carnet(p, 'vet').map((a) => a.done)).toEqual([true, false, false, false, false]);
    expect(noteAction(p, 'vet', 'nope')).toBeNull();
  });

  it('les rangs montent avec l\'XP de métier', () => {
    const p = createProfile('Lou');
    startCareer(p, 'pension', 1, { level: 3 });
    expect(rankOf(p, 'pension')).toBe(0);
    expect(addCareerXp(p, 'pension', 100)).toBeNull();
    expect(addCareerXp(p, 'pension', 30)).toEqual({ rankUp: 1 });
    expect(rankOf(p, 'pension')).toBe(1);
    const pr = rankProgress(p, 'pension');
    expect(pr).toMatchObject({ rank: 1, xp: 130, from: 120, to: 350 });
    expect(pr.ratio).toBeCloseTo(10 / 230);
    addCareerXp(p, 'pension', 1000);
    expect(rankProgress(p, 'pension').to).toBeNull();
    expect(addCareerXp(p, 'vet', 10)).toBeNull(); // pas commencé
  });

  it('réputation par métier, entre 0 et 100', () => {
    const p = createProfile('Lou');
    expect(reputationOf(p, 'vet')).toBe(50);
    expect(changeReputation(p, 'vet', 70)).toBe(100);
    expect(changeReputation(p, 'pension', -70)).toBe(0);
    expect(reputationOf(p, 'vet')).toBe(100);
  });
});

describe('proposer un métier', () => {
  it('quand on est prêt (niveau et quêtes), ou quand on touche le bâtiment, au plus une fois par jour', () => {
    const p = createProfile('Lou');
    const quests = OBJECTIVES.filter((o) => o.kind === 'quest').slice(0, QUESTS_FOR_CAREER).map((o) => o.id);
    expect(shouldPropose(p, 'vet', { level: 3, day: 2, objectives: OBJECTIVES })).toBe(false);
    p.completed.push(...quests);
    expect(shouldPropose(p, 'vet', { level: 2, day: 2, objectives: OBJECTIVES })).toBe(false);
    expect(shouldPropose(p, 'vet', { level: 3, day: 2, objectives: OBJECTIVES })).toBe(true);
    markProposed(p, 'vet', 2);
    expect(shouldPropose(p, 'vet', { level: 3, day: 2, objectives: OBJECTIVES })).toBe(false);
    expect(shouldPropose(p, 'vet', { level: 3, day: 3, objectives: OBJECTIVES })).toBe(true);
    // Toucher la clinique propose le métier même sans les quêtes.
    const q = createProfile('Max');
    expect(shouldPropose(q, 'vet', { level: 3, day: 1, building: 'vet' })).toBe(true);
    expect(shouldPropose(q, 'pension', { level: 3, day: 1, building: 'vet' })).toBe(false);
    expect(shouldPropose(q, 'pension', { level: 3, day: 1, building: 'pethouse' })).toBe(true);
    startCareer(q, 'vet', 1, { level: 3 });
    expect(shouldPropose(q, 'vet', { level: 3, day: 1, building: 'vet' })).toBe(false);
  });

  it('les indices ne sont dits qu\'une fois', () => {
    const p = createProfile('Lou');
    expect(hintOnce(p, 'autoPension')).toBe(true);
    expect(hintOnce(p, 'autoPension')).toBe(false);
  });
});

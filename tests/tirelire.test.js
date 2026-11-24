import { describe, it, expect } from 'vitest';
import {
  streakBonus, streakOn, streakAlive, recordJob, jobPayout, JOB_STREAK, FULL_DAY_BONUS,
  goalPrice, goalStatus, setGoal, clearGoal, sameGoal, goalBought, goalJustReady, goalEmoji,
} from '../src/sim/piggyBank.js';
import { createProfile, migrate } from '../src/sim/profile.js';
import { gearPrice } from '../src/sim/gear.js';
import { TOOLS } from '../src/sim/tools.js';
import { shopPrice } from '../src/sim/adoption.js';
import { JOBS, jobBlock } from '../src/game/Game.js';
import { t, setLang } from '../src/i18n.js';

globalThis.document = globalThis.document ?? { documentElement: {} };

const manage = (money = 100) => Object.assign(createProfile('Lina', 'manage'), { money });
const job = (id) => JOBS.find((j) => j.id === id);
const FOUR = JOBS; // (les quatre boulots, chats compris)

describe('🔥 série des petits boulots', () => {
  it('le bonus grandit de 5 en 5 et plafonne à +20', () => {
    expect([1, 2, 3, 4, 5, 6, 30].map(streakBonus)).toEqual([0, 5, 10, 15, 20, 20, 20]);
    expect(streakBonus(JOB_STREAK.max + 1)).toBe(20);
  });
  it('un boulot chaque jour : la série monte ; un jour sauté : elle recommence à 1', () => {
    const p = manage();
    expect(recordJob(p, 3).n).toBe(1);
    expect(recordJob(p, 3).n).toBe(1); // (deux boulots le même jour : un seul jour)
    expect(recordJob(p, 4).n).toBe(2);
    expect(recordJob(p, 5).n).toBe(3);
    expect(recordJob(p, 7).n).toBe(1); // jour 6 sauté
  });
  it('streakOn : premier boulot du jour ou pas, série gardée ou pas (sans rien changer)', () => {
    const s = { day: 4, n: 2 };
    expect(streakOn(s, 5)).toEqual({ n: 3, first: true, kept: true });
    expect(streakOn(s, 4)).toEqual({ n: 2, first: false, kept: true });
    expect(streakOn(s, 7)).toEqual({ n: 1, first: true, kept: false });
    expect(streakOn(undefined, 1)).toEqual({ n: 1, first: true, kept: false });
    expect(s).toEqual({ day: 4, n: 2 });
    expect(streakAlive(s, 5)).toBe(2);
    expect(streakAlive(s, 6)).toBe(0);
  });
});

describe('🪙 ce que rapporte un petit boulot', () => {
  it('premier jour : la paie seule', () => {
    const p = manage();
    expect(jobPayout(p, job('walk'), 1, FOUR)).toMatchObject({ base: 25, streak: 0, full: 0, total: 25 });
  });
  it('3e jour de suite : le premier boulot rapporte +10, les suivants non', () => {
    const p = manage();
    p.jobStreak = { day: 4, n: 2 };
    expect(jobPayout(p, job('stable'), 5, FOUR)).toMatchObject({ streak: 10, total: 50, n: 3 });
    recordJob(p, 5);
    p.jobsToday = { day: 5, done: ['stable'] };
    expect(jobPayout(p, job('hay'), 5, FOUR)).toMatchObject({ streak: 0, total: 35 });
  });
  it('le dernier boulot du jour : bonus journée complète', () => {
    const p = manage();
    p.jobStreak = { day: 5, n: 1 };
    p.jobsToday = { day: 5, done: ['walk', 'catsit', 'stable'] };
    expect(jobPayout(p, job('hay'), 5, FOUR)).toMatchObject({ full: FULL_DAY_BONUS, total: 35 + FULL_DAY_BONUS });
    // (sans le chat proposé : trois boulots suffisent)
    p.jobsToday = { day: 5, done: ['walk', 'stable'] };
    const three = FOUR.filter((j) => j.id !== 'catsit');
    expect(jobPayout(p, job('hay'), 5, three).full).toBe(FULL_DAY_BONUS);
    expect(jobPayout(p, job('hay'), 5, FOUR).full).toBe(0);
  });
  it('les règles ne changent pas : une fois par jour, entre 8 h et 18 h', () => {
    const p = manage();
    p.jobsToday = { day: 2, done: ['walk'] };
    expect(jobBlock(p, job('walk'), 2, 10)).toBe('done');
    expect(jobBlock(p, job('stable'), 2, 19)).toBe('closed');
    expect(job('walk').pay).toBe(25);
  });
  it('pas plus facile : au plus +35 pièces de bonus par jour', () => {
    const p = manage();
    p.jobStreak = { day: 9, n: 20 };
    let bonus = 0;
    p.jobsToday = { day: 10, done: [] };
    for (const j of FOUR) {
      const r = jobPayout(p, j, 10, FOUR);
      bonus += r.streak + r.full;
      recordJob(p, 10);
      p.jobsToday.done.push(j.id);
    }
    expect(bonus).toBe(20 + FULL_DAY_BONUS);
  });
});

describe('🎯 objectif d\'épargne (tirelire)', () => {
  it('le prix de l\'objectif suit la boutique : selle (taille), outil, animal', () => {
    expect(goalPrice({ kind: 'gear', id: 'saddleJump', size: 'pony' })).toBe(gearPrice('saddleJump', 'pony'));
    expect(goalPrice({ kind: 'tool', id: 'hoofKit' })).toBe(TOOLS.hoofKit.price);
    expect(goalPrice({ kind: 'animal', species: 'horse', breed: 'shetland', stage: 'young' })).toBe(shopPrice('horse', 'shetland', 'young'));
    expect(goalPrice({ kind: 'gear', id: 'padPumpkin' })).toBe(null); // (se gagne, ne s'achète pas)
    expect(goalPrice({ kind: 'gear', id: 'nexistepas' })).toBe(null);
    expect(goalEmoji({ kind: 'tool', id: 'hoofKit' })).toBe('🔨');
  });
  it('il manque combien, et après ce boulot ?', () => {
    const p = manage(100);
    expect(setGoal(p, { kind: 'gear', id: 'saddle' })).toBe(true);
    const price = gearPrice('saddle');
    expect(goalStatus(p)).toMatchObject({ price, have: 100, missing: price - 100, ready: false });
    expect(goalStatus(p, 25).missing).toBe(price - 125);
    expect(goalStatus(p, 1000)).toMatchObject({ missing: 0, ready: true, pct: 1 });
    clearGoal(p);
    expect(goalStatus(p)).toBe(null);
  });
  it('bac à sable : pas d\'objectif (l\'argent est illimité)', () => {
    const p = createProfile('Lina', 'sandbox');
    expect(setGoal(p, { kind: 'tool', id: 'brush' })).toBe(false);
    p.goal = { kind: 'tool', id: 'brush' };
    expect(goalStatus(p)).toBe(null);
  });
  it('la fête « tu as assez ! » une seule fois, et de nouveau si l\'argent redescend', () => {
    const p = manage(0);
    setGoal(p, { kind: 'tool', id: 'shears' });
    expect(goalJustReady(p)).toBe(false);
    p.money = 500;
    expect(goalJustReady(p)).toBe(true);
    expect(goalJustReady(p)).toBe(false);
    p.money = 0;
    expect(goalJustReady(p)).toBe(false);
    p.money = 500;
    expect(goalJustReady(p)).toBe(true);
  });
  it('acheter l\'objectif l\'efface (une autre chose : non)', () => {
    const p = manage();
    setGoal(p, { kind: 'gear', id: 'saddleJump', size: 'horse' });
    expect(goalBought(p, { kind: 'gear', id: 'bridle' })).toBe(false);
    expect(p.goal).not.toBe(null);
    expect(goalBought(p, { kind: 'gear', id: 'saddleJump' })).toBe(true);
    expect(p.goal).toBe(null);
    setGoal(p, { kind: 'animal', species: 'horse', breed: 'shetland', stage: 'young' });
    expect(goalBought(p, { kind: 'animal', species: 'horse', breed: 'frison' })).toBe(false);
    expect(goalBought(p, { kind: 'animal', species: 'horse', breed: 'shetland' })).toBe(true);
  });
  it('sameGoal : même chose à acheter', () => {
    expect(sameGoal({ kind: 'gear', id: 'saddle', size: 'pony' }, { kind: 'gear', id: 'saddle', size: 'pony' })).toBe(true);
    expect(sameGoal({ kind: 'gear', id: 'saddle', size: 'pony' }, { kind: 'gear', id: 'saddle', size: 'horse' })).toBe(false);
    expect(sameGoal({ kind: 'tool', id: 'brush' }, null)).toBe(false);
  });
});

describe('💾 sauvegarde : une ancienne partie', () => {
  it('sans tirelire ni série : valeurs par défaut', () => {
    const old = createProfile('Ancienne', 'manage');
    delete old.goal;
    delete old.jobStreak;
    const p = migrate(JSON.parse(JSON.stringify(old)));
    expect(p.goal).toBe(null);
    expect(p.jobStreak).toEqual({ day: 0, n: 0 });
    expect(goalStatus(p)).toBe(null);
    expect(jobPayout(p, job('walk'), 12, FOUR).total).toBe(25);
  });
  it('une partie avec un objectif le garde', () => {
    const p0 = manage();
    setGoal(p0, { kind: 'tool', id: 'hoofKit' });
    p0.jobStreak = { day: 3, n: 2 };
    const p = migrate(JSON.parse(JSON.stringify(p0)));
    expect(p.goal).toEqual({ kind: 'tool', id: 'hoofKit' });
    expect(p.jobStreak).toEqual({ day: 3, n: 2 });
  });
});

describe('🗣️ textes en français et en anglais', () => {
  const KEYS = ['job_streakGain', 'job_fullGain', 'job_goalLeft', 'job_goalEnough', 'job_fullHelp', 'job_fullDone',
    'streak_start', 'streak_help', 'streak_days', 'streak_today', 'streak_tomorrow', 'goal_noneTitle', 'goal_noneHelp',
    'goal_choose', 'goal_change', 'goal_missing', 'goal_enough', 'goal_go', 'goal_pick', 'goal_mine', 'goal_pickHelp',
    'goal_set', 'goal_tip', 'goal_tipReady', 'goal_tipNone', 'goal_ready', 'goal_bought'];
  it('chaque texte existe, sans {trou}', () => {
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of KEYS) {
        const s = t(k, { n: 12, days: 3, have: 10, price: 50, done: 1, total: 4, name: 'Selle' });
        expect(s, `${lang} ${k}`).not.toBe(k);
        expect(s, `${lang} ${k}`).not.toMatch(/\{\w+\}/);
      }
      expect(t('streak_days', { n: 1 }), lang).not.toMatch(/\b1 (jours|days)\b/); // (singulier : « 1er jour »)
    }
    setLang('fr');
  });
});

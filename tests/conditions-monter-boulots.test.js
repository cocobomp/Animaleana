import { describe, it, expect } from 'vitest';
import { createAnimal, canRide, RIDE_MIN } from '../src/sim/animal.js';
import { mulberry32 } from '../src/sim/rng.js';
import { DAYS_PER_YEAR } from '../src/sim/time.js';
import { JOBS, jobBlock } from '../src/game/Game.js';
import { t, setLang } from '../src/i18n.js';

globalThis.document = globalThis.document ?? { documentElement: {} };

const horse = () => {
  const a = createAnimal({ species: 'horse', sex: 'male', ageDays: 6 * DAYS_PER_YEAR, rng: mulberry32(7) });
  a.health = 90; Object.assign(a.needs, { hunger: 80, thirst: 80, energy: 80 });
  return a;
};

describe('monter : le cheval doit être en forme', () => {
  it('un cheval nourri, abreuvé et en bonne santé se monte', () => {
    expect(canRide(horse()).ok).toBe(true);
  });
  it('trop faim, trop soif ou mauvaise santé : pas de montée, avec la raison', () => {
    let a = horse(); a.needs.hunger = RIDE_MIN.hunger - 1;
    expect(canRide(a)).toEqual({ ok: false, reason: 'hungry' });
    a = horse(); a.needs.thirst = RIDE_MIN.thirst - 1;
    expect(canRide(a)).toEqual({ ok: false, reason: 'thirsty' });
    a = horse(); a.health = RIDE_MIN.health - 1;
    expect(canRide(a)).toEqual({ ok: false, reason: 'weak' });
  });
  it('chaque raison a son texte, en français et en anglais', () => {
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const r of ['hungry', 'thirsty', 'weak']) for (const pre of ['r_', 'actv_why_']) expect(t(pre + r, { name: 'Pomme' }), `${lang} ${pre}${r}`).toContain('Pomme');
      for (const k of ['job_why_done', 'job_why_closed', 'jobsRule']) expect(t(k, { from: '8 h', to: '18 h' })).not.toBe(k);
    }
    setLang('fr');
  });
});

describe('petits boulots : une fois par jour, en journée', () => {
  const job = JOBS.find((j) => j.id === 'stable');
  it('possible en journée, pas la nuit ni trop tard', () => {
    expect(jobBlock({}, job, 3, 10)).toBe(null);
    expect(jobBlock({}, job, 3, 6)).toBe('closed');
    expect(jobBlock({}, job, 3, 17)).toBe('closed'); // (2 h : fini après 18 h)
  });
  it('déjà fait aujourd\'hui : bloqué ; le lendemain : possible', () => {
    const p = { jobsToday: { day: 3, done: ['stable'] } };
    expect(jobBlock(p, job, 3, 10)).toBe('done');
    expect(jobBlock(p, JOBS.find((j) => j.id === 'hay'), 3, 10)).toBe(null);
    expect(jobBlock(p, job, 4, 10)).toBe(null);
  });
});

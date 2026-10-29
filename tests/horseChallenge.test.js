// 🎯 Le défi du jour (src/sim/horseChallenge.js) : un défi par jour parmi ceux que tu sais faire, le même toute la
// journée, compté depuis le matin, réussi une seule fois ; chaque défi a son texte.
import { describe, it, expect, beforeAll } from 'vitest';
import { CHALLENGES, readyChallenges, pickChallenge, todayChallenge, challengeJustDone } from '../src/sim/horseChallenge.js';
import { createProfile } from '../src/sim/profile.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

describe('le défi du jour', () => {
  it('au début, seulement les défis simples ; plus tard, les sauts, le trot enlevé…', () => {
    const p = createProfile('Lou');
    expect(readyChallenges(p).map((c) => c.id)).toEqual(['pet3', 'brush1', 'treat2']);
    Object.assign(p.stats, { rides: 3, rideCanter: 1, horse_saddle: 1, horse_pet: 5, horse_feed: 3, rideMatchy: 1 });
    expect(readyChallenges(p)).toHaveLength(CHALLENGES.length);
  });

  it('jamais un défi impossible aujourd\'hui : cheval qui boite, loin des troncs, journée parfaite trop tard', () => {
    const p = createProfile('Lou');
    Object.assign(p.stats, { rides: 3, rideCanter: 1, horse_saddle: 1, horse_pet: 5, horse_feed: 3, rideMatchy: 1 });
    const ids = (ctx) => readyChallenges(p, ctx).map((c) => c.id);
    for (const id of ['ride2', 'canter1', 'post1', 'logs2', 'matchy1']) expect(ids({ canRide: false })).not.toContain(id);
    expect(ids({ home: false })).not.toContain('logs2');
    expect(ids({ home: false })).toContain('ride2');
    expect(ids({ hour: 15 })).not.toContain('perfect1');
    expect(ids({ hour: 8, home: true, canRide: true })).toHaveLength(CHALLENGES.length);
    for (let d = 1; d < 40; d++) {
      p.challenge = null;
      expect(['ride2', 'canter1', 'post1', 'logs2', 'matchy1']).not.toContain(todayChallenge(p, d, true, { canRide: false }).def.id);
    }
  });

  it('pas de cheval : pas de défi ; un défi par jour, le même toute la journée, différent de la veille', () => {
    const p = createProfile('Lou');
    expect(todayChallenge(p, 1, false)).toBeNull();
    const a = todayChallenge(p, 1);
    expect(a.fresh).toBe(true);
    expect(todayChallenge(p, 1)).toMatchObject({ fresh: false, def: a.def });
    for (let d = 2; d < 30; d++) {
      const prev = p.challenge.id;
      expect(todayChallenge(p, d).def.id).not.toBe(prev);
    }
    expect(pickChallenge(createProfile('Lou'), 5).id).toBe(pickChallenge(createProfile('Lou'), 5).id);
  });

  it('compté depuis le matin, réussi une seule fois', () => {
    const p = createProfile('Lou');
    p.stats.horse_pet = 10; // (fait avant : ne compte pas)
    let c;
    let day = 1;
    for (; day < 40; day++) { c = todayChallenge(p, day); if (c.def.id === 'pet3') break; }
    expect(c.def.id).toBe('pet3');
    expect(c.have).toBe(0);
    p.stats.horse_pet += 2;
    expect(todayChallenge(p, day).have).toBe(2);
    expect(challengeJustDone(p, day)).toBe(false);
    p.stats.horse_pet += 1;
    expect(challengeJustDone(p, day)).toBe(true);
    expect(challengeJustDone(p, day)).toBe(false);
    expect(todayChallenge(p, day).done).toBe(true);
  });

  it('chaque défi a son texte (français et anglais)', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of ['ch_title', 'ch_new', 'ch_done']) expect(t(k)).not.toBe(k);
      for (const c of CHALLENGES) expect(t(`ch_${c.id}`), `${lang} ${c.id}`).not.toBe(`ch_${c.id}`);
    }
    setLang('fr');
  });
});

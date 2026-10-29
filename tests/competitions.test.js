import { describe, it, expect } from 'vitest';
import {
  DISCIPLINES, CALENDAR_DISCIPLINES, CIRCUIT, calendar, makeEvent, competitionData, eligibleForCompetition, canRegister, register,
  entryState, markMissed, activeEntry, upcomingEntries, COMP_COURSES, competitionCourse, jumpOffCourse, timeAllowed,
  competitionRivals, tiedLeaders, jumpOffRivals, finalRanking, prizeFor, recordResult, bestResults, titleFor, fitsDiscipline, eligibleCount,
} from '../src/sim/competitions.js';
import { SHOWGROUND, jumpingResult } from '../src/sim/activities.js';
import { PLACES } from '../src/sim/places.js';
import { createAnimal } from '../src/sim/animal.js';
import { createProfile } from '../src/sim/profile.js';

const horse = () => {
  const a = createAnimal({ species: 'horse', ageDays: 80, rng: () => 0.5 });
  for (const n of Object.keys(a.needs)) a.needs[n] = 90;
  a.gear = { bridle: { item: 'bridle' } };
  return a;
};

describe('calendrier des concours', () => {
  it('propose des concours dans plusieurs lieux, triés par jour, toujours les mêmes', () => {
    const list = calendar(1, 21);
    expect(list.length).toBeGreaterThan(10);
    expect(new Set(list.map((c) => c.place)).size).toBeGreaterThanOrEqual(5);
    for (let i = 1; i < list.length; i++) expect(list[i].day).toBeGreaterThanOrEqual(list[i - 1].day);
    for (const c of list) {
      expect(PLACES[c.place]).toBeTruthy();
      expect(DISCIPLINES[c.discipline]).toBeTruthy();
      expect(c.level).toBeGreaterThanOrEqual(1);
      expect(c.level).toBeLessThanOrEqual(3);
      expect(c.fee).toBeGreaterThan(0);
      expect(c.prizes[0]).toBeGreaterThan(c.prizes[1]);
      expect(c.name.fr).toBeTruthy();
      expect(c.name.en).toBeTruthy();
    }
    expect(calendar(1, 21)).toEqual(list);
    // Des concours de dressage et de saut (l'accent sur les chevaux), et un crochet pour la beauté.
    expect(list.some((c) => c.discipline === 'dressage')).toBe(true);
    expect(list.filter((c) => DISCIPLINES[c.discipline].horse).length).toBeGreaterThan(list.length / 2);
    expect(DISCIPLINES.beauty).toBeTruthy();
    expect(CALENDAR_DISCIPLINES.every((d) => DISCIPLINES[d])).toBe(true);
    expect(CIRCUIT.every((v) => PLACES[v.place])).toBe(true);
  });

  it('les concours deviennent plus relevés avec le temps', () => {
    const early = calendar(1, 10).map((c) => c.level);
    const late = calendar(40, 10).map((c) => c.level);
    expect(Math.max(...late)).toBe(3);
    expect(Math.min(...early)).toBe(1);
  });
});

describe('inscriptions', () => {
  const venue = CIRCUIT[1];
  const comp = makeEvent(venue, 5, 'dressage', 1);

  it('vérifie la forme de l\'animal', () => {
    const a = horse();
    expect(eligibleForCompetition(a, 'dressage')).toBeNull();
    expect(eligibleForCompetition(a, 'jumping')).toBeNull();
    a.needs.hunger = 30;
    expect(eligibleForCompetition(a, 'dressage')).toBe('low_hunger');
    a.needs.hunger = 90;
    a.sick = 'cold';
    expect(eligibleForCompetition(a, 'dressage')).toBe('sick');
    a.sick = null;
    a.pregnant = { due: 9 };
    expect(eligibleForCompetition(a, 'jumping')).toBe('pregnant');
    const dog = createAnimal({ species: 'dog', ageDays: 60, rng: () => 0.5 });
    for (const n of Object.keys(dog.needs)) dog.needs[n] = 80;
    expect(eligibleForCompetition(dog, 'dressage')).toBe('notHorse');
    expect(eligibleForCompetition(dog, 'agility')).toBeNull();
    expect(eligibleForCompetition(dog, 'show')).toBe('noTricks');
    expect(fitsDiscipline(dog, 'jumping')).toBe(false);
    expect(fitsDiscipline(dog, 'agility')).toBe(true);
    expect(eligibleCount([horse(), dog], 'dressage')).toBe(1);
  });

  it('s\'inscrit à l\'avance, pas deux fois, pas deux concours le même jour', () => {
    const p = createProfile('Lou');
    const a = horse();
    expect(canRegister(p, comp, [a.id], { day: 2, hour: 12 })).toBeNull();
    expect(canRegister(p, comp, [], { day: 2, hour: 12 })).toBe('noAnimal');
    expect(canRegister(p, comp, [a.id], { day: 6, hour: 12 })).toBe('past');
    expect(canRegister(p, comp, [a.id], { day: 5, hour: 19 })).toBe('past');
    const e = register(p, comp, [a.id]);
    expect(competitionData(p).entries).toHaveLength(1);
    expect(canRegister(p, comp, [a.id], { day: 2, hour: 12 })).toBe('already');
    const other = makeEvent(CIRCUIT[2], 5, 'jumping', 2);
    expect(canRegister(p, other, [a.id], { day: 2, hour: 12 })).toBe('sameDay');
    // États selon le jour et le lieu
    expect(entryState(e, { day: 2, hour: 12, place: 'maison' })).toBe('travel');
    expect(entryState(e, { day: 4, hour: 12, place: 'angleterre' })).toBe('wait');
    expect(entryState(e, { day: 5, hour: 8, place: 'angleterre' })).toBe('tooEarly');
    expect(entryState(e, { day: 5, hour: 12, place: 'angleterre' })).toBe('today');
    expect(activeEntry(p, { day: 5, place: 'angleterre' })).toBe(e);
    expect(activeEntry(p, { day: 5, place: 'maison' })).toBeNull();
    expect(upcomingEntries(p)).toEqual([e]);
    // Raté : le jour est passé sans concourir
    expect(markMissed(p, { day: 5, hour: 12, place: 'maison' })).toEqual([]);
    expect(markMissed(p, { day: 6, hour: 9, place: 'angleterre' })).toEqual([e]);
    expect(e.missed).toBe(true);
    expect(entryState(e, { day: 6, hour: 9, place: 'angleterre' })).toBe('missed');
    expect(upcomingEntries(p)).toEqual([]);
  });
});

describe('parcours de concours', () => {
  it('sont plus grands et variés aux niveaux élevés, et tiennent dans la carrière', () => {
    expect(competitionCourse(1).obstacles).toHaveLength(7);
    expect(competitionCourse(2).obstacles.length).toBeGreaterThanOrEqual(8);
    expect(competitionCourse(3).obstacles).toHaveLength(10);
    for (const level of [2, 3]) {
      const c = competitionCourse(level);
      const types = new Set(c.obstacles.map((x) => x.type));
      expect(types.has('water')).toBe(true);
      expect(types.has('wall')).toBe(true);
      expect(types.has('oxer')).toBe(true);
      expect(c.obstacles.filter((x) => x.combo).length).toBeGreaterThanOrEqual(2);
      for (const x of [...c.obstacles, c.start, c.finish]) {
        expect(Math.abs(x.x)).toBeLessThan(SHOWGROUND.hw - 1.4);
        expect(Math.abs(x.z)).toBeLessThan(SHOWGROUND.hd - 1.4);
      }
      for (let i = 1; i < c.obstacles.length; i++) {
        const a = c.obstacles[i - 1];
        const b = c.obstacles[i];
        const d = Math.hypot(a.x - b.x, a.z - b.z);
        if (a.combo && b.combo) expect(d).toBeCloseTo(7.5, 1);
        else expect(d).toBeGreaterThan(5.5);
      }
      expect(c.par).toBeGreaterThan(20);
    }
    expect(competitionCourse(3).obstacles.filter((x) => x.combo).length).toBe(3); // triple
    expect(competitionCourse(3).par).toBeLessThanOrEqual(timeAllowed(competitionCourse(3), 4.5));
    expect(COMP_COURSES[1].obstacles).toHaveLength(7);
  });

  it('le barrage est plus court, plus haut, et compte à partir de 1', () => {
    const c = competitionCourse(2);
    const jo = jumpOffCourse(c);
    expect(jo.obstacles).toHaveLength(5);
    expect(jo.jumpOff).toBe(true);
    expect(jo.obstacles[0].height).toBeCloseTo(c.obstacles[0].height + 0.1);
    expect(jo.obstacles.map((x) => x.n)).toEqual([1, 2, 3, 4, 5]);
    expect(jo.par).toBeLessThan(c.par);
    expect(jumpOffCourse(competitionCourse(1)).obstacles).toHaveLength(5);
  });
});

describe('classement, barrage et prix', () => {
  const comp = makeEvent(CIRCUIT[2], 9, 'jumping', 2);

  it('génère les mêmes concurrents, adaptés à la discipline', () => {
    const course = competitionCourse(2);
    const r = competitionRivals(comp, course);
    expect(r).toHaveLength(6);
    expect(competitionRivals(comp, course)).toEqual(r);
    for (const x of r) {
      expect(x.species).toBe('horse');
      expect(x.total).toBeGreaterThanOrEqual(0);
      expect(x.time).toBeGreaterThan(0);
    }
    const dr = competitionRivals(makeEvent(CIRCUIT[0], 3, 'dressage', 1));
    for (const x of dr) {
      expect(x.points).toBeGreaterThan(40);
      expect(x.points).toBeLessThan(95);
    }
    const ag = competitionRivals(makeEvent(CIRCUIT[0], 3, 'agility', 1));
    expect(ag.every((x) => x.species !== 'horse')).toBe(true);
  });

  it('départage les ex æquo au barrage', () => {
    const course = competitionCourse(2);
    const rivals = [
      { name: 'Léa', animal: 'Tornado', species: 'horse', ...jumpingResult({ rails: 0, time: 50, par: 60 }) },
      { name: 'Hugo', animal: 'Pompon', species: 'horse', ...jumpingResult({ rails: 1, time: 48, par: 60 }) },
      { name: 'Emma', animal: 'Opale', species: 'horse', ...jumpingResult({ rails: 0, time: 55, par: 60 }) },
    ];
    const me = jumpingResult({ rails: 0, time: 58, par: 60 });
    const tied = tiedLeaders(me, rivals);
    expect(tied.map((r) => r.name)).toEqual(['Léa', 'Emma']);
    expect(tiedLeaders(jumpingResult({ rails: 1, time: 40, par: 60 }), rivals)).toEqual([]);
    const jo = jumpOffRivals(tied, jumpOffCourse(course).par, comp.id);
    expect(jo).toHaveLength(2);
    expect(jo[0].jo.total).toBeGreaterThanOrEqual(0);
    // Je gagne le barrage sans faute et plus vite que tout le monde.
    const fast = { player: jumpingResult({ rails: 0, time: 10, par: 40 }), rivals: jo };
    const final = finalRanking(comp, me, rivals, fast);
    expect(final.rank).toBe(1);
    expect(final.table[final.table.length - 1].name).toBe('Hugo'); // la faute du 1er tour reste derrière
    // Je fais tomber une barre au barrage : derrière les sans-faute du barrage.
    const slow = { player: jumpingResult({ rails: 2, time: 60, par: 40 }), rivals: jo.map((r) => ({ ...r, jo: jumpingResult({ rails: 0, time: 30, par: 40 }) })) };
    expect(finalRanking(comp, me, rivals, slow).rank).toBe(3);
    // Sans barrage : classement normal (pénalités puis temps) ; dressage : au pourcentage.
    expect(finalRanking(comp, jumpingResult({ rails: 0, time: 30, par: 60 }), rivals).rank).toBe(1);
    const dr = makeEvent(CIRCUIT[0], 3, 'dressage', 1);
    expect(finalRanking(dr, { points: 99 }, competitionRivals(dr)).rank).toBe(1);
    expect(finalRanking(dr, { points: 1 }, competitionRivals(dr)).rank).toBe(7);
  });

  it('donne coupes, argent et XP selon la place, et garde les titres', () => {
    expect(prizeFor(comp, 1)).toMatchObject({ kind: 'trophy', tier: 'gold', money: 260, xp: 'win' });
    expect(prizeFor(comp, 3)).toMatchObject({ tier: 'bronze', money: 90, xp: 'podium' });
    expect(prizeFor(comp, 5)).toMatchObject({ kind: 'ribbon', money: 0, xp: 'competition' });
    const p = createProfile('Lou');
    const a = horse();
    const e = register(p, comp, [a.id]);
    recordResult(p, e, { rank: 2, animal: a, score: 4 });
    expect(e.done).toBe(true);
    expect(titleFor(p, a.id)).toBeNull();
    expect(bestResults(p, a.id).jumping.rank).toBe(2);
    const e2 = register(p, makeEvent(CIRCUIT[0], 12, 'jumping', 1), [a.id]);
    recordResult(p, e2, { rank: 1, animal: a, score: 0 });
    expect(titleFor(p, a.id)).toBe('champion_club');
    expect(bestResults(p, a.id).jumping.rank).toBe(1);
    const e3 = register(p, makeEvent(CIRCUIT[4], 15, 'dressage', 3), [a.id]);
    recordResult(p, e3, { rank: 1, animal: a, score: 71 });
    expect(titleFor(p, a.id)).toBe('champion_grand');
    expect(bestResults(p, a.id).dressage.score).toBe(71);
    expect(titleFor(p, 'nobody')).toBeNull();
  });
});

describe('🎖️ les flots sur la porte du box', () => {
  it('les meilleures places d\'abord, puis les plus récentes ; 6 au plus ; seulement les siens', async () => {
    const { rosettesOf, rosetteTier } = await import('../src/sim/competitions.js');
    const { createProfile: make } = await import('../src/sim/profile.js');
    const p = make('Lou');
    p.activities = { awards: [{ kind: 'ribbon', tier: 'blue', animalId: 'a', rank: null, day: 1 }] }; // (entraînement : pas un flot de concours)
    const res = p.activities.awards;
    const add = (animalId, rank, day) => res.push({ kind: rank <= 3 ? 'trophy' : 'ribbon', animalId, rank, day, type: 'jumping' });
    add('a', 5, 1); add('a', 1, 2); add('a', 2, 3); add('b', 1, 4); add('a', 1, 6);
    for (let d = 7; d < 14; d++) add('a', 8, d);
    const r = rosettesOf(p, 'a');
    expect(r).toHaveLength(6);
    expect(r.map((x) => x.rank)).toEqual([1, 1, 2, 5, 8, 8]);
    expect(r[0].day).toBe(6);
    expect(r.map((x) => x.tier).slice(0, 4)).toEqual(['gold', 'gold', 'silver', 'white']);
    expect(rosettesOf(p, 'zz')).toEqual([]);
    expect([1, 2, 3, 4, 5, 9].map(rosetteTier)).toEqual(['gold', 'silver', 'bronze', 'green', 'white', 'pink']);
  });
});

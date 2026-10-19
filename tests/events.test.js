import { describe, it, expect } from 'vitest';
import {
  EVENTS, EVENT_TYPES, START_CLOCK, MIN_GAP_HOURS, startEvent, maybeStartEvent, eventProgress, eventOutcome,
  resolveEvent, eventWeather, nextStep, shelterOf, isWarm, eventState, fairReady,
} from '../src/sim/events.js';
import { createProfile } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { XP } from '../src/sim/progress.js';
import { seeded } from '../src/sim/rng.js';

const adult = (species, extra = {}) => {
  const a = createAnimal({ species, ageDays: 60, rng: seeded(species + (extra.sex ?? '')), ...extra });
  a.gear = species === 'horse' ? { halter: { item: 'halter', color: 'red' } } : {};
  return a;
};

/** Un petit monde de test : chaque animal a une position « where ». */
function world(profile, animals, extra = {}) {
  const where = new Map(animals.map((a) => [a.id, 'out']));
  const ctx = {
    clock: 14 * 60, hour: 14, season: 'summer', place: 'maison', isHome: true, weather: 'clear', temperature: 22, day: 1,
    animals, whereOf: (a) => where.get(a.id) ?? 'out', ridingId: null, ...extra,
  };
  return { ctx, where, profile };
}

describe('événements spéciaux', () => {
  it('le profil a un état d\'événements par défaut, et l\'XP « event » existe', () => {
    const p = createProfile('A');
    expect(p.events).toMatchObject({ active: null, cooldowns: {}, nextAt: 0 });
    expect(XP.event).toBeGreaterThan(0);
    expect(EVENT_TYPES.length).toBeGreaterThanOrEqual(6);
  });

  it('chaque espèce a son abri', () => {
    expect(shelterOf('horse')).toBe('paddock');
    expect(shelterOf('sheep')).toBe('pen');
    expect(shelterOf('cow')).toBe('pen');
    expect(shelterOf('dog')).toBe('house');
  });

  it('rien ne se passe dans les premières minutes, ni sans animaux, ni deux fois à la fois', () => {
    const p = createProfile('A');
    const horse = adult('horse');
    const always = () => 0;
    // Trop tôt : le profil vient d'être créé.
    let w = world(p, [horse], { clock: START_CLOCK - 60, hour: 11 });
    expect(maybeStartEvent(p, w.ctx, always)).toBeNull();
    // Sans animaux.
    w = world(p, [], { clock: START_CLOCK + 120 });
    expect(maybeStartEvent(p, w.ctx, always)).toBeNull();
    // Avec un animal : un événement commence…
    w = world(p, [horse], { clock: START_CLOCK + 180, hour: 15 });
    const ev = maybeStartEvent(p, w.ctx, always);
    expect(ev).not.toBeNull();
    // … et pas un deuxième en même temps, même une heure plus tard.
    const w2 = world(p, [horse], { clock: START_CLOCK + 240, hour: 16 });
    expect(maybeStartEvent(p, w2.ctx, always)).toBeNull();
  });

  it('on ne tire au sort qu\'une fois par heure de jeu, avec une petite chance', () => {
    const p = createProfile('A');
    const w = world(p, [adult('dog')], { clock: 20 * 60 });
    expect(maybeStartEvent(p, w.ctx, () => 0.99)).toBeNull();
    expect(p.events.lastRoll).toBe(20);
    // Même heure : on ne relance pas le dé.
    expect(maybeStartEvent(p, w.ctx, () => 0)).toBeNull();
  });

  it('respecte le temps de repos entre deux événements et le délai par type', () => {
    const p = createProfile('A');
    const dog = adult('dog');
    const w = world(p, [dog]);
    const ev = startEvent(p, 'storm', w.ctx, () => 0);
    expect(ev.type).toBe('storm');
    expect(p.events.cooldowns.storm).toBe(w.ctx.clock + EVENTS.storm.cooldown * 60);
    w.where.set(dog.id, 'house');
    resolveEvent(p, ev, 'success', w.ctx);
    expect(p.events.active).toBeNull();
    expect(p.events.nextAt).toBe(ev.deadline + MIN_GAP_HOURS * 60);
    const later = world(p, [dog], { clock: ev.deadline + 60 });
    expect(maybeStartEvent(p, later.ctx, () => 0)).toBeNull();
  });

  it('orage : il faut rentrer tous les animaux, la météo change vraiment', () => {
    const p = createProfile('A');
    const horse = adult('horse');
    const sheep = adult('sheep');
    const cat = adult('cat');
    const w = world(p, [horse, sheep, cat]);
    const ev = startEvent(p, 'storm', w.ctx, seeded('s'));
    // Le ciel se couvre, puis l'orage éclate.
    expect(eventWeather(p, ev.start + 10, 'maison').weather).toBe('cloudy');
    expect(eventWeather(p, ev.start + 70, 'maison').weather).toBe('storm');
    expect(eventWeather(p, ev.start + 70, 'bretagne')).toBeNull();
    let pr = eventProgress(ev, w.ctx);
    expect(pr).toMatchObject({ done: 0, total: 3, complete: false });
    expect(nextStep(ev, w.ctx, pr)).toMatchObject({ step: 'shelter', group: 'paddock' });
    w.where.set(horse.id, 'paddock');
    w.where.set(sheep.id, 'pen');
    pr = eventProgress(ev, w.ctx);
    expect(pr.done).toBe(2);
    expect(nextStep(ev, w.ctx, pr)).toMatchObject({ step: 'shelter', group: 'house', animalId: cat.id });
    // Le temps est écoulé : le chat resté dehors est mouillé.
    const end = { ...w.ctx, clock: ev.deadline };
    expect(eventOutcome(ev, end, eventProgress(ev, end))).toBe('fail');
    const hyg = cat.needs.hygiene;
    const res = resolveEvent(p, ev, 'fail', end, () => 0);
    expect(res.affected).toEqual([cat.name]);
    expect(cat.needs.hygiene).toBeLessThan(hyg);
    expect(cat.sick).toBe('cold');
    expect(res.xp).toBe(false);
    // L'orage continue un peu après la fin de l'événement.
    expect(eventWeather(p, ev.deadline + 30, 'maison').weather).toBe('storm');
    expect(eventWeather(p, ev.deadline + 200, 'maison')).toBeNull();
  });

  it('orage réussi : récompense en mode gestion', () => {
    const p = createProfile('A', 'manage');
    const dog = adult('dog');
    const w = world(p, [dog]);
    const ev = startEvent(p, 'storm', w.ctx);
    w.where.set(dog.id, 'house');
    const pr = eventProgress(ev, w.ctx);
    expect(eventOutcome(ev, w.ctx, pr)).toBe('success');
    const money = p.money;
    const res = resolveEvent(p, ev, 'success', w.ctx);
    expect(res).toMatchObject({ outcome: 'success', xp: true, money: EVENTS.storm.money });
    expect(p.money).toBe(money + EVENTS.storm.money);
    expect(p.stats.events).toBe(1);
  });

  it('pas d\'orage si tout le monde est déjà à l\'abri, ni en pleine nuit', () => {
    const p = createProfile('A');
    const horse = adult('horse');
    const w = world(p, [horse]);
    w.where.set(horse.id, 'paddock');
    expect(EVENTS.storm.can(w.ctx)).toBeNull();
    w.where.set(horse.id, 'out');
    expect(EVENTS.storm.can({ ...w.ctx, hour: 2 })).toBeNull();
    expect(EVENTS.storm.can({ ...w.ctx, hour: 2 }, true)).not.toBeNull();
  });

  it('canicule : tout le monde a soif, il faut donner à boire', () => {
    const p = createProfile('A');
    const a = adult('dog');
    const b = adult('horse');
    a.needs.thirst = 90;
    const w = world(p, [a, b]);
    const ev = startEvent(p, 'heatwave', w.ctx);
    expect(a.needs.thirst).toBeLessThanOrEqual(40);
    expect(eventWeather(p, ev.start, 'maison')).toMatchObject({ weather: 'clear', tempDelta: 9 });
    expect(nextStep(ev, w.ctx).step).toBe('water');
    a.needs.thirst = 90;
    b.needs.thirst = 80;
    expect(eventProgress(ev, w.ctx).complete).toBe(true);
  });

  it('grand froid : une couverture pour les chevaux, les autres à l\'abri', () => {
    const p = createProfile('A');
    const horse = adult('horse');
    const dog = adult('dog');
    const w = world(p, [horse, dog], { season: 'winter', temperature: -2 });
    expect(EVENTS.coldSnap.can({ ...w.ctx, season: 'summer', temperature: 20 })).toBeNull();
    const ev = startEvent(p, 'coldSnap', w.ctx);
    expect(eventWeather(p, ev.start, 'maison').weather).toBe('snow');
    expect(nextStep(ev, w.ctx)).toMatchObject({ step: 'warm', animalId: horse.id });
    horse.gear.blanket = { item: 'blanket', color: 'navy' };
    expect(isWarm(horse, w.ctx)).toBe(true);
    expect(nextStep(ev, w.ctx)).toMatchObject({ step: 'shelter', group: 'house' });
    dog.gear.blanket = { item: 'dogCoat', color: 'red' };
    expect(eventProgress(ev, w.ctx).complete).toBe(true);
  });

  it('animal blessé : il faut aller chez le vétérinaire', () => {
    const p = createProfile('A');
    const dog = adult('dog');
    const w = world(p, [dog]);
    const ev = startEvent(p, 'injury', w.ctx);
    expect(ev.targetId).toBe(dog.id);
    expect(dog.sick).toBe('paw');
    expect(['brambles', 'wire', 'stone', 'sprain', 'thorn']).toContain(ev.data.cause);
    expect(nextStep(ev, w.ctx).step).toBe('vet');
    dog.sick = null; // le vétérinaire l'a soigné
    expect(eventOutcome(ev, w.ctx, eventProgress(ev, w.ctx))).toBe('success');
  });

  it('animal échappé : le rejoindre termine l\'événement', () => {
    const p = createProfile('A');
    const horse = adult('horse');
    const w = world(p, [horse]);
    w.where.set(horse.id, 'paddock');
    const ev = startEvent(p, 'escape', w.ctx);
    expect(ev.targetId).toBe(horse.id);
    w.where.set(horse.id, 'out'); // il a sauté la barrière
    expect(nextStep(ev, { ...w.ctx, playerDist: 50 }).step).toBe('find');
    expect(eventProgress(ev, { ...w.ctx, playerDist: 50 }).complete).toBe(false);
    const ctx = { ...w.ctx, playerDist: 2 };
    const pr = eventProgress(ev, ctx);
    expect(ev.data.found).toBe(true);
    expect(pr.complete).toBe(true); // plus besoin de le ramener à l'abri pour finir
    expect(nextStep(ev, ctx, pr)).toBeNull();
    expect(eventOutcome(ev, ctx, pr)).toBe('success');
  });

  it('animal échappé : le monter le retrouve aussi (plus de « Trouve-le : 0 m » à cheval dessus)', () => {
    const p = createProfile('A');
    const horse = adult('horse');
    const w = world(p, [horse]);
    w.where.set(horse.id, 'paddock');
    const ev = startEvent(p, 'escape', w.ctx);
    w.where.set(horse.id, 'out');
    // Monté (le contexte ne donne pas de distance utile : le joueur est sur la cible).
    const ctx = { ...w.ctx, ridingId: horse.id };
    const pr = eventProgress(ev, ctx);
    expect(pr.complete).toBe(true);
    expect(eventOutcome(ev, ctx, pr)).toBe('success');
  });

  it('un cheval sans licol ne s\'échappe pas (on ne pourrait pas le ramener)', () => {
    const p = createProfile('A');
    const horse = adult('horse');
    horse.gear = {};
    const w = world(p, [horse]);
    w.where.set(horse.id, 'paddock');
    expect(EVENTS.escape.can(w.ctx)).toBeNull();
  });

  it('petit animal perdu : on peut l\'adopter ou l\'emmener au refuge', () => {
    const p = createProfile('A');
    const w = world(p, [adult('horse')]);
    expect(EVENTS.lostPet.can({ ...w.ctx, isHome: false })).toBeNull();
    const ev = startEvent(p, 'lostPet', w.ctx);
    const stray = ev.data.stray;
    expect(stray.stray).toBe(true);
    expect(['dog', 'cat']).toContain(stray.species);
    expect(nextStep(ev, w.ctx).step).toBe('decide');
    ev.data.choice = 'refuge';
    expect(nextStep(ev, w.ctx).step).toBe('refuge');
    expect(eventProgress(ev, w.ctx).complete).toBe(false);
    expect(eventProgress(ev, { ...w.ctx, strayAtRefuge: true }).complete).toBe(true);
  });

  it('voisin : il faut aller l\'aider', () => {
    const p = createProfile('A');
    const w = world(p, [adult('cat')]);
    const ev = startEvent(p, 'neighbour', w.ctx, seeded('v'));
    expect(['f', 'm']).toContain(ev.data.neighbour.sex);
    expect(ev.data.neighbour.name).toBeTruthy();
    expect(nextStep(ev, w.ctx).step).toBe('meet');
    ev.data.helped = true;
    expect(eventProgress(ev, w.ctx).complete).toBe(true);
  });

  it('naissance : rester près de la maman', () => {
    const p = createProfile('A');
    const mare = adult('horse', { sex: 'f' });
    const stallion = adult('horse', { sex: 'm' });
    mare.lastBirthDay = -99;
    stallion.lastBirthDay = -99;
    const w = world(p, [mare, stallion], { day: 10 });
    expect(EVENTS.birth.can({ ...w.ctx, animals: [mare] })).toBeNull();
    mare.pregnant = { due: 10, father: stallion.id };
    const ev = startEvent(p, 'birth', w.ctx);
    expect(ev.targetId).toBe(mare.id);
    expect(ev.data.fatherId).toBe(stallion.id);
    eventProgress(ev, { ...w.ctx, playerDist: 30 }, 0.5);
    expect(ev.data.near).toBe(0);
    eventProgress(ev, { ...w.ctx, playerDist: 5 }, 0.5);
    expect(eventProgress(ev, { ...w.ctx, playerDist: 5 }, 0.5).complete).toBe(true);
  });

  it('fête du village : venir au stand avec un animal tout beau', () => {
    const p = createProfile('A', 'manage');
    const dog = adult('dog');
    dog.needs.grooming = 40;
    const w = world(p, [dog], { hour: 10, clock: 10 * 60 });
    const ev = startEvent(p, 'fair', w.ctx);
    expect(nextStep(ev, w.ctx)).toMatchObject({ step: 'brush', animalId: dog.id });
    dog.needs.grooming = 90;
    dog.needs.hygiene = 90;
    expect(fairReady(dog)).toBe(true);
    expect(nextStep(ev, w.ctx).step).toBe('lead');
    dog.following = true;
    expect(nextStep(ev, w.ctx).step).toBe('stand');
    expect(eventProgress(ev, { ...w.ctx, playerDist: 2 }).complete).toBe(true);
    const res = resolveEvent(p, ev, 'success', w.ctx);
    expect(res.money).toBe(EVENTS.fair.money);
    expect(p.stats.ribbons).toBe(1);
  });

  it('quitter le lieu annule l\'événement sans punition', () => {
    const p = createProfile('A');
    const dog = adult('dog');
    const w = world(p, [dog]);
    const ev = startEvent(p, 'storm', w.ctx);
    const away = { ...w.ctx, place: 'bretagne' };
    expect(eventOutcome(ev, away, eventProgress(ev, away))).toBe('cancel');
    const res = resolveEvent(p, ev, 'cancel', away);
    expect(res.affected).toEqual([]);
    expect(eventState(p).weather).toBeNull();
  });

  it('chaque type peut être forcé (pour tester) quand les animaux le permettent', () => {
    for (const type of EVENT_TYPES) {
      const p = createProfile('A');
      const mare = adult('horse', { sex: 'f' });
      const stallion = adult('horse', { sex: 'm' });
      mare.lastBirthDay = -99;
      stallion.lastBirthDay = -99;
      const w = world(p, [mare, stallion, adult('dog')], { day: 10 });
      w.where.set(mare.id, 'paddock');
      const ev = startEvent(p, type, { ...w.ctx, hour: 3, season: 'autumn', weather: 'fog' }, Math.random, true);
      expect(ev?.type, type).toBe(type);
    }
  });
});

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

  it('cheval blessé : jamais « un caillou sous le pied » (c\'est sa boiterie : cure-pied ou vétérinaire) ; un seul tirage, comme avant', () => {
    const causes = { horse: new Set(), dog: new Set() };
    const draws = { horse: [], dog: [] };
    for (const sp of ['horse', 'dog']) {
      for (let i = 0; i < 80; i++) {
        const p = createProfile('A');
        const a = adult(sp);
        const r = seeded(`blessure-${i}`);
        let n = 0;
        const ev = startEvent(p, 'injury', world(p, [a]).ctx, () => { n++; return r(); });
        causes[sp].add(ev.data.cause);
        draws[sp].push(n);
        expect(a.sick).toBe('paw');
      }
    }
    expect(causes.horse.has('stone')).toBe(false);
    expect([...causes.horse].sort()).toEqual(['brambles', 'sprain', 'thorn', 'wire']);
    expect(causes.dog.has('stone')).toBe(true); // (les autres animaux : comme avant)
    expect(draws.horse).toEqual(draws.dog);
  });

  it('cheval blessé, les mots : sa « jambe » (pas sa patte), « Blessée » et pas « Malade » ; le jeu le voit toujours malade', async () => {
    globalThis.document = globalThis.document ?? { documentElement: {} }; // (setLang écrit sa langue)
    const i18n = await import('../src/i18n.js');
    const { Events } = await import('../src/game/Events.js');
    const { mood, canRide } = await import('../src/sim/animal.js');
    const { t, ta, illText, setLang } = i18n;
    setLang('fr');
    const intro = (species, cause) => Events.prototype.intro.call({}, { type: 'injury', data: { cause, who: { name: 'Perle', sex: 'f', species } } });
    for (const cause of ['brambles', 'wire', 'sprain', 'thorn']) {
      expect(intro('horse', cause), cause).toContain('jambe');
      expect(intro('horse', cause), cause).not.toMatch(/patte|\{/);
      expect(intro('dog', cause), cause).toContain('patte');
    }
    expect(t('ev_injury_win', { name: 'Perle', g: 'f', part: t('ev_part_horse') })).toBe('Perle est soignée. Sa jambe va vite guérir !');
    expect(t('ev_injury_fail', { name: 'Rex', part: t('ev_part') })).toBe('Rex a encore mal à la patte. Emmène-le vite chez le vétérinaire.');
    const mare = adult('horse', { sex: 'f' });
    mare.name = 'Perle';
    mare.sick = 'paw';
    const dog = adult('dog', { sex: 'm' });
    dog.name = 'Rex';
    dog.sick = 'paw';
    expect(illText('paw', mare)).toBe('jambe blessée');
    expect(illText('paw', dog)).toBe('patte blessée');
    expect(illText('ear', mare)).toBe(t('ill_ear'));
    expect(ta('mood_sick', mare)).toBe('Blessée');
    expect(ta('mood_sick', dog)).toBe('Blessé');
    expect(ta(`r_${canRide(mare).reason}`, mare)).toBe('Perle est blessée, emmène-la chez le vétérinaire.');
    expect([mood(mare), canRide(mare).reason]).toEqual(['sick', 'sick']); // (la logique ne change pas)
    mare.sick = 'cold';
    expect(ta('mood_sick', mare)).toBe('Malade');
    expect(ta('r_sick', mare)).toBe('Perle est malade, emmène-la chez le vétérinaire.');
    setLang('en');
    mare.sick = 'paw';
    expect(ta('mood_sick', mare)).toBe('Hurt');
    expect(illText('paw', mare)).toBe('hurt leg');
    expect(intro('horse', 'thorn')).toContain('has a thorn in a leg');
    setLang('fr');
  });

  it('blessé : « Blessée » aussi pour choisir qui monter, sa « jambe » chez le vétérinaire ; l\'abcès d\'un caillou reste « Malade »', async () => {
    globalThis.document = globalThis.document ?? { documentElement: {} };
    const { t, ta, speciesKey, setLang } = await import('../src/i18n.js');
    const { isHurt, canRide } = await import('../src/sim/animal.js');
    const { eligibility } = await import('../src/sim/activities.js');
    const { horseFit } = await import('../src/sim/trailGuide.js');
    const { illName, signText } = await import('../src/ui/vetExam.js');
    const { readFileSync } = await import('node:fs');
    setLang('fr');
    const mare = Object.assign(adult('horse', { sex: 'f' }), { name: 'Perle', sick: 'paw' });
    const dog = Object.assign(adult('dog', { sex: 'm' }), { name: 'Rex', sick: 'paw' });
    const kid = { id: 'r0', name: 'Léa', sex: 'f', age: 'adult', level: 'confirmed', weight: 'adult', fun: 60 };
    // (les listes de chevaux : activités, concours, balade guidée ; la logique ne change pas : 'sick')
    expect([eligibility(mare, 'jumping'), canRide(mare).reason, horseFit(mare, kid).reason]).toEqual(['sick', 'sick', 'sick']);
    expect(ta('actv_why_sick', mare)).toBe('Perle est blessée : soigne-la d\'abord.');
    expect(ta('actv_why_sick', dog)).toBe('Rex est blessé : soigne-le d\'abord.');
    expect(ta('comp_why_sick', mare)).toBe('Perle est blessée : soigne-la d\'abord.');
    expect(ta('tg_reason_sick', mare)).toBe('Blessée : il faut la soigner d\'abord.');
    // chez le vétérinaire (l'examen, src/ui/vetExam.js) : la jambe d'un cheval, la patte d'un chien
    expect([illName('paw', mare), illName('paw', dog), illName('ear', mare)]).toEqual(['Jambe blessée', 'Patte blessée', t('vx_ill_ear')]);
    expect([signText(['painLeg', 'lame'], mare), signText(['painLeg'], dog)]).toEqual(['jambe douloureuse, boiterie', 'patte douloureuse']);
    expect(ta(speciesKey('vx_look_limps', mare), mare)).toBe('elle boite et pose mal un pied');
    expect(ta(speciesKey('vx_look_limps', dog), dog)).toBe('il boite et pose mal une patte');
    expect(ta('vx_follow_pawHorse', mare)).toBe('Repos : on ne la monte pas. Change le pansement chaque jour et regarde si la jambe dégonfle.');
    expect(readFileSync(new URL('../src/ui/vetExam.js', import.meta.url), 'utf8')).toContain('[\'belly\', \'paw\'].includes(cs.illness) && a.species === \'horse\' ? \'Horse\'');
    // l'abcès d'un caillou (src/sim/animal.js) : une infection, « Malade », 🤒, comme son message
    const abscess = Object.assign(adult('horse', { sex: 'f' }), { name: 'Perle', sick: 'paw', lame: { cause: 'abscess', foot: 0, hours: 50 } });
    expect([isHurt(mare), isHurt(abscess), isHurt({ ...mare, lame: { cause: 'stone' } })]).toEqual([true, false, true]);
    expect(ta('mood_sick', abscess)).toBe('Malade');
    expect(ta('r_sick', abscess)).toBe('Perle est malade, emmène-la chez le vétérinaire.');
    expect(ta('actv_why_sick', abscess)).toBe('Perle est malade : soigne-la d\'abord.');
    setLang('en');
    expect([ta('actv_why_sick', mare), ta('comp_why_sick', mare), ta('tg_reason_sick', mare)])
      .toEqual(['Perle is hurt: get them treated first.', 'Perle is hurt: get them treated first.', 'Hurt: needs treating first.']);
    expect([illName('paw', mare), signText(['painLeg'], mare), ta(speciesKey('vx_look_limps', mare), mare)]).toEqual(['Hurt leg', 'sore leg', 'limps and favours one foot']);
    expect(ta('vx_follow_pawHorse', mare)).not.toMatch(/[éè]/);
    setLang('fr');
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

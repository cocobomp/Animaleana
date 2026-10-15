import { describe, it, expect } from 'vitest';
import {
  TRAIL_GUIDE_CAREER, RANK_IDS, GROUPS, DURATIONS, ROUTES, BIOME_ROUTES, defaultTrailGuide, tgState, rankOf, perksOf, rankProgress,
  addTrailXp, makeBooking, makeRiders, offerDue, createOffer, acceptOffer, refuseOffer, bookingHere, expireBookings, routeFor,
  ridePlan, isPony, horseFit, autoAssign, gearFit, weatherBlock, prepChecklist, rideResult, applyRideResult, horseGains, noteAction,
  riderMood, changeReputation,
} from '../src/sim/trailGuide.js';
import { getCareer, listCareers } from '../src/sim/careersRegistry.js';
import { createAnimal } from '../src/sim/animal.js';
import { createProfile } from '../src/sim/profile.js';
import { PLACE_IDS, PLACES } from '../src/sim/places.js';
import { OBJECTIVES } from '../src/sim/objectives.js';
import { QUEST_GUIDE, QUEST_STEPS, FOLLOW_STEPS } from '../src/sim/tutorial.js';

const horse = (over = {}) => {
  const a = createAnimal({ species: 'horse', breed: 'selle_francais', ageDays: 80, rng: () => 0.5, personality: 'calm' });
  a.needs.energy = 90;
  a.skills.obedience = 60;
  a.gear = { bridle: { item: 'bridle' }, saddle: { item: 'saddle' } };
  return Object.assign(a, over);
};
const pony = (over = {}) => {
  const a = horse({ breed: 'shetland' });
  a.look.scale = 0.58;
  return Object.assign(a, over);
};
const profile = (xp = 0) => {
  const p = createProfile('Lou', 'manage');
  tgState(p);
  p.careers.xp.trailGuide = xp;
  return p;
};
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('le métier guide de randonnée', () => {
  it('est inscrit dans le registre des métiers avec 3 rangs et un carnet', () => {
    expect(getCareer('trailGuide')).toBe(TRAIL_GUIDE_CAREER);
    expect(listCareers().some((c) => c.id === 'trailGuide')).toBe(true);
    expect(TRAIL_GUIDE_CAREER.emoji).toBe('🧭');
    expect(TRAIL_GUIDE_CAREER.level).toBe(4);
    expect(TRAIL_GUIDE_CAREER.ranks).toHaveLength(3);
    expect(TRAIL_GUIDE_CAREER.perks).toHaveLength(3);
    expect(TRAIL_GUIDE_CAREER.actions.map((a) => a.id)).toEqual(['accept', 'prepare', 'ride', 'photo', 'break', 'return']);
    expect(RANK_IDS).toEqual(['apprentice', 'skilled', 'expert']);
  });

  it('le profil a ses données et les anciennes sauvegardes sont complétées', () => {
    const p = createProfile('Lou');
    expect(p.trailGuide).toEqual(defaultTrailGuide());
    const old = { name: 'X', animals: [] };
    const st = tgState(old);
    expect(st.reputation).toBe(50);
    expect(old.careers.xp.trailGuide).toBe(0);
  });

  it('les rangs montent avec l\'XP de métier', () => {
    const p = profile();
    expect(rankOf(p)).toBe(0);
    expect(perksOf(p).maxRiders).toBe(2);
    expect(addTrailXp(p, 149).rankUp).toBe(false);
    const r = addTrailXp(p, 1);
    expect(r.rankUp).toBe(true);
    expect(rankOf(p)).toBe(1);
    expect(perksOf(p).abroad).toBe(true);
    addTrailXp(p, 250);
    expect(rankOf(p)).toBe(2);
    expect(rankProgress(p).to).toBeNull();
    expect(perksOf(p).durations).toContain('trek');
  });

  it('la première fois, chaque action du carnet est expliquée', () => {
    const p = profile();
    expect(noteAction(p, 'accept')).toBe(true);
    expect(noteAction(p, 'accept')).toBe(false);
    expect(p.trailGuide.seen).toEqual(['accept']);
  });
});

describe('visiteurs et demandes', () => {
  it('un apprenti ne reçoit que des petits groupes pour une heure, ici', () => {
    const p = profile();
    for (let i = 0; i < 30; i++) {
      const b = makeBooking(p, { day: 3, place: 'maison', rng: seq([i / 30, 0.3, 0.7, 0.1, 0.9]) });
      expect(b.riders.length).toBeLessThanOrEqual(2);
      expect(b.duration).toBe('short');
      expect(b.place).toBe('maison');
      expect(b.day).toBe(3);
      expect(b.price).toBe(15 * b.riders.length);
      expect(GROUPS[b.group].minRank).toBe(0);
      for (const r of b.riders) expect(['beginner', 'medium', 'confirmed']).toContain(r.level);
    }
  });

  it('un expert peut recevoir un club de 5 et une randonnée de deux jours, ailleurs', () => {
    const p = profile(400);
    const b = makeBooking(p, { day: 3, place: 'maison', rng: seq([0.99, 0.5, 0.99, 0.2, 0.5, 0.1]), here: false });
    expect(b.group).toBe('club');
    expect(b.riders).toHaveLength(5);
    expect(b.place).not.toBe('maison');
    expect(b.day).toBeGreaterThan(3);
    expect(b.day).toBeLessThanOrEqual(6);
  });

  it('les prénoms des cavaliers sont différents, l\'enfant est un enfant', () => {
    const riders = makeRiders('family', seq([0.1, 0.5, 0.9]));
    expect(new Set(riders.map((r) => r.name)).size).toBe(3);
    expect(riders.find((r) => r.age === 'child').weight).toBe('child');
    expect(riders.every((r) => r.fun === 60)).toBe(true);
  });

  it('les demandes arrivent dès le niveau 4, de 9 h à 17 h, pas pendant une balade prévue', () => {
    const p = profile();
    const ctx = { level: 4, clock: 10 * 60, hour: 10, place: 'maison' };
    expect(offerDue(p, ctx)).toBe(true);
    expect(offerDue(p, { ...ctx, level: 3 })).toBe(false);
    expect(offerDue(p, { ...ctx, hour: 8 })).toBe(false);
    expect(offerDue(p, { ...ctx, hour: 17 })).toBe(false);
    createOffer(p, { day: 1, place: 'maison', clock: 600, rng: seq([0.5]) });
    expect(offerDue(p, ctx)).toBe(false);
    refuseOffer(p, 600);
    expect(p.trailGuide.offer).toBeNull();
    expect(offerDue(p, ctx)).toBe(false); // on nous laisse tranquille 3 h
    expect(offerDue(p, { ...ctx, clock: 600 + 181 })).toBe(true);
  });

  it('accepter garde la réservation ; on la retrouve ici le bon jour, et elle expire après', () => {
    const p = profile();
    createOffer(p, { day: 2, place: 'maison', clock: 600, rng: seq([0.5]) });
    const b = acceptOffer(p, 2);
    expect(b.status).toBe('accepted');
    expect(p.trailGuide.bookings).toEqual([b]);
    expect(p.trailGuide.started).toBe(2);
    expect(p.stats.tgAccepted).toBe(1);
    expect(bookingHere(p, 'maison', 2)).toBe(b);
    expect(bookingHere(p, 'maison', 3)).toBe(b); // un jour de retard, ça va encore
    expect(bookingHere(p, 'alpes', 2)).toBeNull();
    expect(expireBookings(p, 3)).toEqual([]);
    expect(expireBookings(p, 4)).toEqual([b]);
    expect(p.trailGuide.bookings).toEqual([]);
    expect(p.trailGuide.reputation).toBe(46);
  });
});

describe('itinéraires', () => {
  it('chaque paysage a des itinéraires connus, et chaque itinéraire a ses événements', () => {
    for (const id of PLACE_IDS) {
      expect(BIOME_ROUTES[PLACES[id].biome], id).toBeTruthy();
      expect(ROUTES[routeFor(id, () => 0.1)], id).toBeTruthy();
      expect(ROUTES[routeFor(id, () => 0.9)], id).toBeTruthy();
    }
    for (const [id, r] of Object.entries(ROUTES)) {
      expect(r.points.length, id).toBe(8);
      expect(r.sight.leg, id).toBeLessThan(8);
    }
  });

  it('une balade d\'une heure : 5 balises + l\'écurie, avec photo et goûter', () => {
    const plan = ridePlan({ duration: 'short', route: 'meadow', place: 'maison' });
    expect(plan.points).toHaveLength(6);
    expect(plan.points.at(-1).kind).toBe('finish');
    const types = plan.events.map((e) => e.type);
    expect(types).toContain('sight');
    expect(types).toContain('break');
    expect(types).toContain('lag');
    expect(types).toContain('scare');
    expect(plan.events.every((e) => e.leg < plan.points.length)).toBe(true);
  });

  it('une randonnée de deux jours passe par le gîte puis un autre itinéraire', () => {
    const plan = ridePlan({ duration: 'trek', route: 'meadow', place: 'maison' });
    const lodge = plan.points.findIndex((pt) => pt.kind === 'lodge');
    expect(lodge).toBe(8);
    expect(plan.points).toHaveLength(8 + 1 + 8 + 1);
    expect(plan.events.filter((e) => e.type === 'sight')).toHaveLength(2);
    expect(plan.events.some((e) => e.leg > lodge)).toBe(true);
  });

  it('en Islande, l\'expert a un itinéraire spécial (volcan)', () => {
    const p = profile(400);
    const b = makeBooking(p, { day: 1, place: 'islande', rng: seq([0.1, 0.1, 0.1, 0.1, 0.1]) });
    expect(b.route).toBe('volcano');
    expect(ROUTES.volcano.special).toBe(true);
    const a = makeBooking(profile(), { day: 1, place: 'islande', rng: seq([0.1]) });
    expect(a.route).toBe('river');
  });
});

describe('préparer la balade', () => {
  const beginner = { id: 'r0', name: 'Léa', sex: 'f', age: 'adult', level: 'beginner', weight: 'adult', fun: 60, horseId: null };
  const kid = { id: 'r1', name: 'Tom', sex: 'm', age: 'child', level: 'beginner', weight: 'child', fun: 60, horseId: null };
  const pro = { id: 'r2', name: 'Hugo', sex: 'm', age: 'adult', level: 'confirmed', weight: 'adult', fun: 60, horseId: null };

  it('un débutant a besoin d\'un cheval calme et obéissant', () => {
    expect(horseFit(horse(), beginner).ok).toBe(true);
    expect(horseFit(horse({ skills: { obedience: 20, speed: 10, endurance: 10, jump: 10 } }), beginner)).toMatchObject({ ok: false, reason: 'notCalm' });
    expect(horseFit(horse({ personality: 'stubborn' }), beginner)).toMatchObject({ ok: false, reason: 'stubborn' });
    expect(horseFit(horse({ personality: 'stubborn', skills: { obedience: 20, speed: 10, endurance: 10, jump: 10 } }), pro).ok).toBe(true);
  });

  it('pas de cheval malade, enceinte, fatigué ou trop jeune', () => {
    expect(horseFit(horse({ sick: 'cold' }), pro)).toMatchObject({ ok: false, reason: 'sick' });
    expect(horseFit(horse({ pregnant: { since: 1 } }), pro)).toMatchObject({ ok: false, reason: 'pregnant' });
    const tired = horse();
    tired.needs.energy = 20;
    expect(horseFit(tired, pro)).toMatchObject({ ok: false, reason: 'tired' });
    expect(horseFit(horse({ ageDays: 5 }), pro)).toMatchObject({ ok: false, reason: 'tooYoung' });
    expect(horseFit(createAnimal({ species: 'dog', rng: () => 0.5 }), pro)).toMatchObject({ ok: false, reason: 'notHorse' });
  });

  it('un enfant monte un poney ; un adulte, pas un poney', () => {
    expect(isPony(pony())).toBe(true);
    expect(isPony(horse())).toBe(false);
    expect(horseFit(pony(), kid).ok).toBe(true);
    expect(horseFit(horse({ skills: { obedience: 45, speed: 10, endurance: 10, jump: 10 } }), kid)).toMatchObject({ ok: false, reason: 'needPony' });
    expect(horseFit(horse({ skills: { obedience: 70, speed: 10, endurance: 10, jump: 10 } }), kid).ok).toBe(true);
    expect(horseFit(pony(), pro)).toMatchObject({ ok: false, reason: 'tooSmall' });
  });

  it('le lien avec le cheval compte dans le choix automatique', () => {
    const loved = horse({ bond: 80 });
    const other = horse({ bond: 5 });
    const booking = { riders: [{ ...beginner }, { ...pro }] };
    autoAssign(booking, [other, loved]);
    expect(booking.riders[0].horseId).toBe(loved.id);
    expect(booking.riders[1].horseId).toBe(other.id);
    autoAssign(booking, [other, loved], [loved.id]); // notre cheval : pas pour les visiteurs
    expect(booking.riders[0].horseId).toBe(other.id);
    expect(booking.riders[1].horseId).toBeNull();
  });

  it('matériel : selle + filet, ou licol seul pour un poney mené', () => {
    expect(gearFit(horse(), beginner).ok).toBe(true);
    expect(gearFit(horse({ gear: { bridle: { item: 'bridle' } } }), beginner)).toMatchObject({ ok: false, reason: 'needSaddle' });
    expect(gearFit(horse({ gear: {} }), beginner)).toMatchObject({ ok: false, reason: 'needBridle' });
    expect(gearFit(pony({ gear: { halter: { item: 'halter' } } }), kid)).toMatchObject({ ok: true, led: true });
    expect(gearFit(pony({ gear: {} }), kid)).toMatchObject({ ok: false, reason: 'needHalter' });
  });

  it('orage ou canicule : on reporte', () => {
    expect(weatherBlock('storm', 20)).toBe('storm');
    expect(weatherBlock('clear', 31)).toBe('heat');
    expect(weatherBlock('rain', 12)).toBeNull();
  });

  it('la liste à cocher est complète quand tout est prêt', () => {
    const h1 = horse();
    const h2 = horse();
    const mine = horse();
    const b = { riders: [{ ...beginner, horseId: h1.id }, { ...pro, horseId: h2.id }], guideHorseId: mine.id, prep: { water: false, snack: false } };
    let c = prepChecklist(b, { horses: [h1, h2, mine] });
    expect(c.ok).toBe(false);
    expect(c.items.filter((i) => !i.ok).map((i) => i.id)).toEqual(['water', 'snack']);
    b.prep.water = true;
    b.prep.snack = true;
    c = prepChecklist(b, { horses: [h1, h2, mine], weather: 'clear', temperature: 20 });
    expect(c.ok).toBe(true);
    // Le même cheval pour deux cavaliers, ou notre cheval prêté : refusé.
    b.riders[1].horseId = h1.id;
    expect(prepChecklist(b, { horses: [h1, h2, mine] }).items.some((i) => i.id === 'sameHorse')).toBe(true);
    b.riders[1].horseId = mine.id;
    expect(prepChecklist(b, { horses: [h1, h2, mine] }).items.find((i) => i.rider?.id === 'r2').reason).toBe('yourHorse');
    b.riders[1].horseId = h2.id;
    expect(prepChecklist(b, { horses: [h1, h2, mine], weather: 'storm' }).items.find((i) => i.id === 'weather').reason).toBe('storm');
  });
});

describe('résultat de la balade', () => {
  const riders = (fun) => [{ name: 'Léa', age: 'adult', fun }, { name: 'Tom', age: 'child', fun }];
  const booking = { id: 'b1', group: 'friends', duration: 'short', price: 30, place: 'maison', riders: riders(90) };
  const perks = TRAIL_GUIDE_CAREER.perks[1];

  it('des cavaliers ravis : 3 étoiles, paiement majoré, pourboire, bonne réputation', () => {
    const r = rideResult({ riders: riders(92), water: 90, photos: 1, handled: 4, total: 4, legs: 6, totalLegs: 6, booking, perks });
    expect(r.stars).toBe(3);
    expect(r.pay).toBeGreaterThan(30);
    expect(r.tip).toBe(6);
    expect(r.repDelta).toBe(6);
    expect(r.xp).toBeGreaterThan(60);
    expect(r.comments.every((c) => c.mood === 'great')).toBe(true);
  });

  it('des cavaliers déçus : 1 étoile, moins d\'argent, pas de pourboire', () => {
    const r = rideResult({ riders: riders(30), water: 10, photos: 0, handled: 0, total: 4, legs: 6, totalLegs: 6, booking, perks });
    expect(r.stars).toBe(1);
    expect(r.pay).toBeLessThan(30);
    expect(r.tip).toBe(0);
    expect(r.repDelta).toBe(-3);
    expect(r.comments[0].mood).toBe('bad');
    expect(riderMood(60)).toBe('ok');
  });

  it('une balade abandonnée paie peu et coûte de la réputation', () => {
    const r = rideResult({ riders: riders(60), legs: 2, totalLegs: 6, booking, perks, aborted: true });
    expect(r.stars).toBe(1);
    expect(r.pay).toBe(9);
    expect(r.repDelta).toBe(-6);
  });

  it('appliquer le résultat : argent, réputation, XP, historique, statistiques des quêtes', () => {
    const p = profile();
    p.trailGuide.bookings.push(booking);
    const r = rideResult({ riders: riders(92), water: 90, photos: 1, handled: 4, total: 4, legs: 6, totalLegs: 6, booking, perks });
    let earned = 0;
    const out = applyRideResult(p, booking, r, { day: 2, earn: (n) => { earned += n; }, home: false });
    expect(earned).toBe(r.pay + r.tip);
    expect(out.money).toBe(earned);
    expect(p.trailGuide.bookings).toEqual([]);
    expect(p.trailGuide.reputation).toBe(56);
    expect(p.careers.xp.trailGuide).toBe(r.xp);
    expect(p.trailGuide.history[0]).toMatchObject({ day: 2, group: 'friends', riders: 2, stars: 3 });
    expect(p.stats).toMatchObject({ tgRides: 1, tgRiders: 2, tgStars3: 1, tgAbroad: 1, tgPhotos: 1 });
    expect(horseGains(booking)).toEqual({ endurance: 3, bond: 4 });
    expect(changeReputation(p, 100)).toBe(100);
  });

  it('les quêtes du métier ont un guide et des étapes', () => {
    const ids = ['tgFirst', 'tgStars3', 'tgRiders10', 'tgAbroad'];
    for (const id of ids) {
      expect(OBJECTIVES.find((o) => o.id === id)?.kind).toBe('quest');
      expect(QUEST_GUIDE[id]).toBeTruthy();
      for (const s of QUEST_STEPS[id]) expect(FOLLOW_STEPS[s], s).toBeTruthy();
    }
    const p = profile();
    p.stats.tgRides = 1;
    expect(OBJECTIVES.find((o) => o.id === 'tgFirst').progress(p)).toEqual([1, 1]);
    p.trailGuide.bookings.push({ place: 'maison' });
    expect(FOLLOW_STEPS.tgWait.done({ profile: p, questDone: false })).toBe(true);
    expect(FOLLOW_STEPS.tgPrepare.done({ profile: p, questDone: false })).toBe(false);
    p.trailGuide.riding = true;
    expect(FOLLOW_STEPS.tgPrepare.done({ profile: p, questDone: false })).toBe(true);
    expect(DURATIONS.trek.hours).toBeGreaterThan(DURATIONS.half.hours);
  });
});

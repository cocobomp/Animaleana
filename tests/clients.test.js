import { describe, it, expect } from 'vitest';
import { createProfile } from '../src/sim/profile.js';
import { createAnimal, NEEDS, cure } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';
import { OBJECTIVES, checkObjectives } from '../src/sim/objectives.js';
import { XP } from '../src/sim/progress.js';
import {
  clientState, scheduleNextVisit, shouldVisitorArrive, createVisit, setVisitor, acceptVisit, refuseVisit, canAccept,
  visitorExpired, pricing, dailyCareScore, tickClientDay, finalScore, stars, payout, completeClient, advanceClientDays,
  noteCure, noteClientCare, pickVisitKind, maxClients, VISIT_HOURS, VISITOR_WAIT_HOURS, REFUSALS_BEFORE_DIP, UPSET_SCORE,
} from '../src/sim/clients.js';
import { startCareer, reputationOf, rankOf, careerXp, isActionDone, careerState } from '../src/sim/careers.js';

const ready = (p, level = 3) => {
  p.xp = 25 * level * (level - 1);
  return p;
};

const withCareer = (id = 'pension', mode = 'manage') => {
  const p = ready(createProfile('Lou', mode));
  startCareer(p, id, 1, { level: 3 });
  return p;
};

const fill = (a, v = 95) => {
  for (const n of NEEDS) a.needs[n] = v;
  a.health = 100;
};

describe('profil', () => {
  it('a des clients et des métiers par défaut', () => {
    const p = createProfile('Lou');
    expect(p.clients).toMatchObject({ active: [], history: [], visitor: null });
    expect(p.careers).toMatchObject({ active: null, started: {}, xp: {} });
    expect(XP.client).toBeGreaterThan(0);
  });

  it('complète une vieille sauvegarde', () => {
    const p = createProfile('Lou');
    delete p.clients;
    delete p.careers;
    expect(clientState(p).active).toEqual([]);
    expect(reputationOf(p, 'vet')).toBe(50);
    expect(maxClients(p)).toBe(0); // aucun métier
  });
});

describe('arrivée des visiteurs', () => {
  it('programme une visite dans 1 ou 2 jours entre 8 h et 17 h', () => {
    const p = withCareer();
    const rng = seeded('visit');
    for (let i = 0; i < 20; i++) {
      const next = scheduleNextVisit(p, 3, rng);
      expect(next).toBeGreaterThanOrEqual(4);
      expect(next).toBeLessThanOrEqual(5);
      expect(p.clients.nextVisitHour).toBeGreaterThanOrEqual(VISIT_HOURS[0]);
      expect(p.clients.nextVisitHour).toBeLessThan(VISIT_HOURS[1]);
    }
  });

  it("n'arrive qu'à la maison, dans la journée, au jour prévu", () => {
    const p = withCareer();
    p.clients.nextVisitDay = 4;
    p.clients.nextVisitHour = 10;
    expect(shouldVisitorArrive(p, { day: 3, hour: 12, isHome: true })).toBe(false);
    expect(shouldVisitorArrive(p, { day: 4, hour: 9, isHome: true })).toBe(false);
    expect(shouldVisitorArrive(p, { day: 4, hour: 12, isHome: false })).toBe(false);
    expect(shouldVisitorArrive(p, { day: 4, hour: 20, isHome: true })).toBe(false);
    expect(shouldVisitorArrive(p, { day: 4, hour: 12, isHome: true })).toBe(true);
    expect(shouldVisitorArrive(p, { day: 6, hour: 9, isHome: true })).toBe(true); // visite manquée : dès que possible
  });

  it('sans métier, les visites sont « auto » (le village s\'en occupe)', () => {
    const p = ready(createProfile('Lou'));
    const rng = seeded('kind');
    const kinds = new Set(Array.from({ length: 30 }, () => pickVisitKind(p, rng)));
    expect([...kinds].every((k) => k.startsWith('auto'))).toBe(true);
    const v = createVisit(p, { day: 2, clock: 2 * 1440 + 600, place: 'maison' }, seeded('auto'), 'autoVet');
    expect(v.auto).toBe(true);
    expect(v.price).toBe(0);
    expect(v.animal.sick).toBeTruthy();
    expect(canAccept(p, v).ok).toBe(false);
  });

  it('avec le métier de vétérinaire, on reçoit des animaux malades (et parfois un indice pension)', () => {
    const p = withCareer('vet');
    const rng = seeded('vetkinds');
    const kinds = new Set(Array.from({ length: 40 }, () => pickVisitKind(p, rng)));
    expect(kinds.has('vet')).toBe(true);
    expect(kinds.has('pension')).toBe(false);
  });

  it('crée une demande complète : propriétaire, animal, durée, prix', () => {
    const p = withCareer('pension');
    const v = createVisit(p, { day: 2, clock: 2 * 1440 + 600, place: 'maison', species: ['dog', 'cat'] }, seeded('v1'), 'pension');
    expect(v.owner.name).toBeTruthy();
    expect(['f', 'm']).toContain(v.owner.sex);
    expect(['dog', 'cat']).toContain(v.animal.species); // apprenti : petits animaux seulement
    expect(v.animal.sick).toBeNull();
    expect(v.days).toBeGreaterThanOrEqual(2);
    expect(v.price).toBe(v.perDay * v.days);
    expect(v.expiresClock - v.arrivedClock).toBe(VISITOR_WAIT_HOURS * 60);
    expect(v.animal.location).toBe('maison');
  });

  it('en soins, l\'animal arrive malade (maladie simple pour un apprenti)', () => {
    const p = withCareer('vet');
    const v = createVisit(p, { day: 2, clock: 0, place: 'maison' }, seeded('v2'), 'vet');
    expect(['ear', 'fleas', 'cold']).toContain(v.animal.sick);
    expect(v.price).toBeGreaterThan(pricing(v.animal.species, 'pension', v.days).total);
  });

  it('un visiteur ignoré repart au bout de 2 h', () => {
    const p = withCareer();
    const v = createVisit(p, { day: 2, clock: 1000, place: 'maison' }, seeded('v3'), 'pension');
    setVisitor(p, v);
    expect(visitorExpired(p, 1000 + 60)).toBe(false);
    expect(visitorExpired(p, 1000 + VISITOR_WAIT_HOURS * 60)).toBe(true);
  });
});

describe('prix', () => {
  it('dépend de l\'espèce, du type, de la durée et de la réputation', () => {
    expect(pricing('horse', 'pension', 3).total).toBeGreaterThan(pricing('cat', 'pension', 3).total);
    expect(pricing('dog', 'pension', 4).total).toBeGreaterThan(pricing('dog', 'pension', 2).total);
    expect(pricing('dog', 'vet', 3).total).toBeGreaterThan(pricing('dog', 'pension', 3).total);
    expect(pricing('dog', 'pension', 3, 100).total).toBeGreaterThan(pricing('dog', 'pension', 3, 0).total);
    expect(pricing('dog', 'pension', 3).perDay % 5).toBe(0);
  });
});

describe('accepter et refuser', () => {
  it('accepter ajoute l\'animal au profil avec sa fiche client et coche le carnet', () => {
    const p = withCareer('pension');
    const v = createVisit(p, { day: 2, clock: 0, place: 'maison' }, seeded('a1'), 'pension');
    setVisitor(p, v);
    const r = acceptVisit(p, v, 2);
    expect(r.ok).toBe(true);
    expect(r.firstWelcome).toBe(true);
    expect(p.animals).toHaveLength(1);
    expect(p.animals[0].client).toMatchObject({ ownerName: v.owner.name, kind: 'pension', startDay: 2, until: 2 + v.days, price: v.price });
    expect(p.clients.active).toHaveLength(1);
    expect(p.clients.visitor).toBeNull();
    expect(isActionDone(p, 'pension', 'welcome')).toBe(true);
  });

  it('un apprenti ne garde qu\'un animal à la fois', () => {
    const p = withCareer('pension');
    const rng = seeded('full');
    acceptVisit(p, createVisit(p, { day: 2, clock: 0 }, rng, 'pension'), 2);
    const r = acceptVisit(p, createVisit(p, { day: 2, clock: 0 }, rng, 'pension'), 2);
    expect(r).toMatchObject({ ok: false, reason: 'full', n: 1 });
    expect(p.animals).toHaveLength(1);
  });

  it('il faut le bon métier pour accepter', () => {
    const p = withCareer('pension');
    const v = createVisit(p, { day: 2, clock: 0 }, seeded('c'), 'vet');
    expect(acceptVisit(p, v, 2)).toMatchObject({ ok: false, reason: 'career' });
  });

  it('refuser est sans conséquence, sauf 3 fois de suite (petite baisse de réputation du métier)', () => {
    const p = withCareer('pension');
    const v = () => createVisit(p, { day: 2, clock: 0 }, seeded('r'), 'pension');
    for (let i = 0; i < REFUSALS_BEFORE_DIP - 1; i++) expect(refuseVisit(p, v()).dip).toBe(0);
    expect(reputationOf(p, 'pension')).toBe(50);
    expect(refuseVisit(p, v()).dip).toBeGreaterThan(0);
    expect(reputationOf(p, 'pension')).toBeLessThan(50);
    expect(p.clients.refusedStreak).toBe(0);
  });
});

describe('score de soin', () => {
  const hosted = (kind = 'pension', day = 2) => {
    const p = withCareer(kind);
    const v = createVisit(p, { day, clock: 0 }, seeded(`h-${kind}`), kind);
    acceptVisit(p, v, day);
    return { p, a: p.animals[0] };
  };

  it('note la journée : besoins hauts = bonne note, animal négligé = mauvaise note', () => {
    const { a } = hosted();
    fill(a, 95);
    expect(dailyCareScore(a)).toBeGreaterThanOrEqual(85);
    fill(a, 20);
    expect(dailyCareScore(a)).toBeLessThan(40);
  });

  it('un animal en pension qui tombe malade perd des points', () => {
    const { a } = hosted();
    fill(a, 95);
    const healthy = dailyCareScore(a);
    a.sick = 'cold';
    expect(dailyCareScore(a)).toBeLessThan(healthy - 15);
    tickClientDay(a, 3);
    expect(a.client.gotSick).toBe(true);
  });

  it('en soins, être malade au début ne compte pas, mais il faut guérir', () => {
    const { a } = hosted('vet');
    fill(a, 90);
    expect(a.sick).toBeTruthy();
    expect(dailyCareScore(a)).toBeGreaterThan(70);
    tickClientDay(a, 3);
    expect(a.client.gotSick).toBe(false);
    expect(a.client.curedDay).toBeNull();
    expect(finalScore(a, 5)).toBeLessThanOrEqual(25); // jamais soigné : note plafonnée
    cure(a, 3);
    expect(noteCure(a, 3)).toBe(true);
    expect(a.client.curedDay).toBe(3);
    fill(a, 95);
    expect(finalScore(a, 5)).toBeGreaterThan(80);
  });

  it('les jours sautés sont notés, et le retard fait baisser la note', () => {
    const { p, a } = hosted('pension', 2);
    fill(a, 90);
    advanceClientDays(p, 2);
    advanceClientDays(p, 5);
    expect(a.client.daily).toHaveLength(3);
    const onTime = finalScore(a, a.client.until);
    expect(finalScore(a, a.client.until + 2)).toBeLessThan(onTime);
  });

  it('étoiles', () => {
    expect(stars(95)).toBe(5);
    expect(stars(80)).toBe(4);
    expect(stars(60)).toBe(3);
    expect(stars(UPSET_SCORE)).toBe(2);
    expect(stars(10)).toBe(1);
  });

  it('les soins faits cochent le carnet de la pension', () => {
    const { p, a } = hosted();
    expect(noteClientCare(p, a, 'feed')).toBe('feed');
    expect(noteClientCare(p, a, 'water')).toBeNull(); // déjà coché
    expect(noteClientCare(p, a, 'wash')).toBe('clean');
    expect(noteClientCare(p, a, 'pet')).toBe('play');
  });
});

describe('paiement et réputation', () => {
  it('paie selon la note, avec un bonus 5 étoiles et parfois un pourboire', () => {
    const none = () => 0.99;
    expect(payout(100, 60, none).money).toBe(80);
    expect(payout(100, 100, none)).toMatchObject({ money: 120, bonus: 20, tip: 0, stars: 5, repDelta: 6 });
    expect(payout(100, 80, () => 0.1).tip).toBeGreaterThan(0);
    expect(payout(100, 80, () => 0.1, false).tip).toBe(0); // rang sans pourboires
  });

  it('un score terrible : pas de paiement et la réputation chute', () => {
    expect(payout(100, 10)).toMatchObject({ money: 0, upset: true, repDelta: -8 });
  });

  it('le propriétaire revient : argent, réputation, XP de métier, stats, l\'animal s\'en va', () => {
    const p = withCareer('pension');
    const v = createVisit(p, { day: 2, clock: 0 }, seeded('done'), 'pension');
    acceptVisit(p, v, 2);
    const a = p.animals[0];
    fill(a, 96);
    a.bond = 40;
    const money = p.money;
    const res = completeClient(p, a, a.client.until, () => 0.99);
    expect(res.stars).toBe(5);
    expect(res.money).toBeGreaterThan(0);
    expect(p.money).toBe(money + res.money);
    expect(reputationOf(p, 'pension')).toBe(56);
    expect(p.animals).toHaveLength(0);
    expect(p.clients.active).toHaveLength(0);
    expect(p.clients.history[0]).toMatchObject({ name: a.name, stars: 5 });
    expect(p.stats).toMatchObject({ clients: 1, clientsHappy: 1, clients5Stars: 1, clientMoney: res.money });
    expect(careerXp(p, 'pension')).toBeGreaterThanOrEqual(res.careerXp);
    expect(isActionDone(p, 'pension', 'return')).toBe(true);
    expect(careerState(p).earned.pension).toBe(res.money);
  });

  it('en bac à sable, l\'argent ne bouge pas mais le score est là', () => {
    const p = withCareer('pension', 'sandbox');
    const v = createVisit(p, { day: 2, clock: 0 }, seeded('sb'), 'pension');
    acceptVisit(p, v, 2);
    fill(p.animals[0], 96);
    const res = completeClient(p, p.animals[0], 4);
    expect(res.money).toBeGreaterThan(0);
    expect(p.money).toBe(500);
  });

  it('un client vétérinaire soigné compte pour la quête, un client fâché fait chuter la réputation', () => {
    const p = withCareer('vet');
    const v = createVisit(p, { day: 2, clock: 0 }, seeded('vq'), 'vet');
    acceptVisit(p, v, 2);
    const a = p.animals[0];
    cure(a, 2);
    noteCure(a, 2);
    fill(a, 96);
    completeClient(p, a, a.client.until);
    expect(p.stats.clientsVet).toBe(1);
    const done = checkObjectives(p).map((o) => o.id);
    expect(done).toContain('client1');
    expect(done).toContain('clientVet1');
    expect(done).toContain('career1');

    const v2 = createVisit(p, { day: 6, clock: 0 }, seeded('vq2'), 'vet');
    acceptVisit(p, v2, 6);
    const b = p.animals[0];
    fill(b, 10);
    const rep = reputationOf(p, 'vet');
    const res = completeClient(p, b, b.client.until);
    expect(res.upset).toBe(true);
    expect(res.worst).toBe('notCured');
    expect(reputationOf(p, 'vet')).toBe(rep - 8);
  });

  it('les objectifs des clients existent', () => {
    for (const id of ['career1', 'client1', 'clientVet1', 'clientHappy5', 'clientMoney500', 'client5Stars10', 'reputation90']) {
      expect(OBJECTIVES.find((o) => o.id === id), id).toBeTruthy();
    }
  });
});

describe('rangs des métiers et clients', () => {
  it('un rang plus haut : plus d\'animaux, plus d\'espèces, meilleurs prix', () => {
    const p = withCareer('pension');
    expect(maxClients(p)).toBe(1);
    const basic = createVisit(p, { day: 2, clock: 0 }, seeded('rank'), 'pension');
    p.careers.xp.pension = 400;
    expect(rankOf(p, 'pension')).toBe(2);
    expect(maxClients(p)).toBe(3);
    const expert = createVisit(p, { day: 2, clock: 0 }, seeded('rank'), 'pension');
    expect(expert.perDay).toBeGreaterThanOrEqual(basic.perDay);
  });
});

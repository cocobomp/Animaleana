// Métier de cavalier de concours (rider) et fusion avec main : registre des métiers, clients,
// selle et filet à la bonne taille dans le coffre de transport, équipement de dressage, sauvegardes.
import { describe, it, expect } from 'vitest';
import { createProfile, migrate } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { CAREERS, CAREER_IDS, RANKS, startCareer, careerState, rankOf, carnet, careerSummary } from '../src/sim/careers.js';
import { maxClients, pickVisitKind, scheduleNextVisit } from '../src/sim/clients.js';
import {
  CIRCUIT, makeEvent, tackReady, competitionTack, packCompetitionTack, missingCompetitionTack,
  riderPerks, entryFee, prizeMoney, riderAfterResult, riderMissed, noteRider,
} from '../src/sim/competitions.js';
import { createCargo, inCargo, capacityFor, cargoUsed, pack } from '../src/sim/cargo.js';
import { judgedSkill, dressageSkill, dressageTackBonus } from '../src/sim/dressage.js';
import { sizeOf, parseKey } from '../src/sim/gear.js';
import { getBreed, SPECIES } from '../src/sim/species.js';

const horse = (breed) => {
  const a = createAnimal({ species: 'horse', ageDays: 80, rng: () => 0.5, ...(breed ? { breed } : {}) });
  for (const n of Object.keys(a.needs)) a.needs[n] = 90;
  return a;
};

/** Une race de poney (pour la selle « taille poney »). */
const ponyBreed = () => SPECIES.horse.breeds.map((b) => b.id ?? b).find((id) => sizeOf({ species: 'horse', breed: id }) === 'pony');

describe('registre des métiers : cavalier de concours', () => {
  it('est inscrit dans CAREERS avec ses actions, ses 3 rangs et ses avantages', () => {
    expect(CAREER_IDS).toContain('rider');
    const def = CAREERS.rider;
    expect(def.building).toBe('showground');
    expect(def.clients).toBe(false);
    expect(def.ranks).toHaveLength(RANKS.length);
    expect(def.actions.map((a) => a.id)).toEqual(['train', 'reprise', 'register', 'travel', 'compete', 'podium']);
    expect(def.perks).toHaveLength(RANKS.length);
    // Plus on monte en rang, moins on paie et plus on gagne.
    for (let i = 1; i < def.perks.length; i++) {
      expect(def.perks[i].fee).toBeLessThan(def.perks[i - 1].fee);
      expect(def.perks[i].prize).toBeGreaterThan(def.perks[i - 1].prize);
    }
  });

  it('apparaît dans le panneau comme les autres métiers (verrouillé, disponible, commencé)', () => {
    const p = createProfile('Lou');
    expect(careerSummary(p, 'rider', { level: 1 }).state).toBe('locked');
    expect(careerSummary(p, 'rider', { level: 3 }).state).toBe('available');
    startCareer(p, 'rider', 1, { level: 3 });
    expect(careerSummary(p, 'rider', { level: 3 })).toMatchObject({ state: 'started', rank: 0, reputation: 50 });
    expect(carnet(p, 'rider').every((a) => !a.done)).toBe(true);
  });

  it('n\'attire pas de visiteurs : pas de client en plus, pas de visite de cavalier', () => {
    const p = createProfile('Lou');
    startCareer(p, 'rider', 1, { level: 3 });
    expect(maxClients(p)).toBe(0); // (et pas NaN : ses avantages n'ont pas de maxClients)
    startCareer(p, 'vet', 1, { level: 3 });
    expect(maxClients(p)).toBe(1);
    for (let i = 0; i < 20; i++) expect(['vet', 'autoPension']).toContain(pickVisitKind(p, () => i / 20));
    expect(scheduleNextVisit(p, 3, () => 0.9)).toBeGreaterThan(3);
  });
});

describe('avantages du métier : inscriptions et primes', () => {
  const comp = makeEvent(CIRCUIT[0], 6, 'dressage', 2);

  it('sans le métier : prix normaux', () => {
    const p = createProfile('Lou');
    expect(riderPerks(p)).toEqual(CAREERS.rider.perks[0]);
    expect(entryFee(p, comp)).toBe(comp.fee);
    expect(prizeMoney(p, comp, 1)).toBe(comp.prizes[0]);
    expect(prizeMoney(p, comp, 5)).toBe(0);
  });

  it('confirmé puis expert : inscription moins chère, primes plus grosses', () => {
    const p = createProfile('Lou');
    startCareer(p, 'rider', 1, { level: 3 });
    careerState(p).xp.rider = CAREERS.rider.ranks[1];
    expect(rankOf(p, 'rider')).toBe(1);
    expect(entryFee(p, comp)).toBeLessThan(comp.fee);
    expect(prizeMoney(p, comp, 1)).toBeGreaterThan(comp.prizes[0]);
    careerState(p).xp.rider = CAREERS.rider.ranks[2];
    expect(entryFee(p, comp)).toBe(Math.round(comp.fee * 0.5 / 5) * 5);
  });

  it('après un concours : carnet (concourir, podium), XP, réputation et argent gagné', () => {
    const p = createProfile('Lou');
    expect(riderAfterResult(p, comp, 1, 300)).toBeNull(); // métier pas commencé
    startCareer(p, 'rider', 1, { level: 3 });
    const r = riderAfterResult(p, comp, 2, 170);
    expect(r.notes.map((n) => n.action)).toEqual(['compete', 'podium']);
    expect(r.notes.every((n) => n.first)).toBe(true);
    expect(r.rep).toBeGreaterThan(50);
    expect(careerState(p).earned.rider).toBe(170);
    expect(careerState(p).xp.rider).toBe(r.xp + 2 * 15); // XP du concours + deux actions du carnet
    const r2 = riderAfterResult(p, comp, 6, 0);
    expect(r2.notes).toEqual([{ action: 'compete', first: false, rankUp: null }]);
    expect(r2.rep).toBeLessThan(r.rep);
    expect(riderMissed(p)).toBeLessThan(r2.rep);
    expect(noteRider(p, 'register')).toEqual({ first: true, rankUp: null });
  });

  it('assez de concours font monter de rang', () => {
    const p = createProfile('Lou');
    startCareer(p, 'rider', 1, { level: 3 });
    const grand = makeEvent(CIRCUIT[2], 30, 'jumping', 3);
    let up = null;
    for (let i = 0; i < 6 && up === null; i++) up = riderAfterResult(p, grand, 1, 0).rankUp;
    expect(up).toBe(1);
  });
});

describe('selle et filet au concours, à la bonne taille', () => {
  it('au concours de saut ou de dressage, le cheval doit être sellé et bridé', () => {
    const a = horse();
    expect(tackReady(a, 'dressage')).toBe('needBridle');
    a.gear = { bridle: { item: 'bridle' } };
    expect(tackReady(a, 'jumping')).toBe('needSaddle');
    a.gear.saddle = { item: 'saddleDressage' };
    expect(tackReady(a, 'dressage')).toBeNull();
    const dog = createAnimal({ species: 'dog', ageDays: 60, rng: () => 0.5 });
    expect(tackReady(dog, 'agility')).toBeNull();
  });

  it('propose d\'abord la selle de la discipline (selle de dressage), à la taille du cheval', () => {
    const a = horse();
    const list = competitionTack(a, 'dressage');
    expect(list.map((x) => x.slot)).toEqual(['saddle', 'bridle']);
    expect(list[0].keys[0]).toBe('saddleDressage');
    expect(list[1].keys).not.toContain('doubleBridle'); // (demande une obéissance de 50)
    expect(competitionTack(a, 'jumping')[0].keys[0]).toBe('saddleJump');
    const pb = ponyBreed();
    if (pb) {
      const pony = horse(pb);
      expect(competitionTack(pony, 'jumping')[0].keys[0]).toBe('saddleJump@pony');
      expect(competitionTack(pony, 'dressage')[0].keys.every((k) => parseKey(k).size === 'pony')).toBe(true); // (selle poney : sans « @pony »)
    }
    a.gear = { saddle: { item: 'saddle' }, bridle: { item: 'bridle' } };
    expect(competitionTack(a, 'dressage')).toEqual([]); // ce qu'il porte voyage avec lui
  });

  it('range dans le coffre la selle et le filet qu\'on possède, à la bonne taille', () => {
    const p = createProfile('Lou'); // selle mixte et filet taille cheval offerts au départ
    const a = horse();
    a.location = p.place;
    p.animals.push(a);
    const cargo = createCargo();
    expect(missingCompetitionTack(cargo, [a], 'dressage').map((m) => m.slot)).toEqual(['saddle', 'bridle']);
    const packed = packCompetitionTack(p, cargo, [a], capacityFor('trailer'), 'dressage');
    expect(packed).toEqual(['saddle', 'bridle']);
    expect(inCargo(cargo, 'saddle')).toBe(1);
    expect(missingCompetitionTack(cargo, [a], 'dressage')).toEqual([]);
    // Pas deux fois.
    expect(packCompetitionTack(p, cargo, [a], capacityFor('trailer'), 'dressage')).toEqual([]);
    // Avec une selle de dressage achetée : c'est elle qu'on emporte.
    p.items.saddleDressage = 1;
    const c2 = createCargo();
    expect(packCompetitionTack(p, c2, [a], capacityFor('trailer'), 'dressage')[0]).toBe('saddleDressage');
    // La selle mixte déjà dans le coffre (proposée d'après le dernier voyage) est échangée contre elle…
    expect(packCompetitionTack(p, cargo, [a], capacityFor('trailer'), 'dressage')).toEqual(['saddleDressage']);
    expect(inCargo(cargo, 'saddle')).toBe(0);
    expect(inCargo(cargo, 'saddleDressage')).toBe(1);
    // … mais pas pour un concours de saut (pas de selle d'obstacle : la mixte reste).
    const c3 = createCargo();
    pack(p, c3, 'saddle', capacityFor('trailer'));
    expect(packCompetitionTack(p, c3, [a], capacityFor('trailer'), 'jumping')).toEqual(['bridle']);
    expect(inCargo(c3, 'saddle')).toBe(1);
  });

  it('un poney n\'emporte pas la selle taille cheval ; le coffre plein fait de la place', () => {
    const pb = ponyBreed();
    if (!pb) return;
    const p = createProfile('Lou');
    const pony = horse(pb);
    pony.location = p.place;
    p.animals.push(pony);
    const c = createCargo();
    expect(packCompetitionTack(p, c, [pony], capacityFor('trailer'), 'jumping')).toEqual([]); // rien à sa taille
    expect(missingCompetitionTack(c, [pony], 'jumping').map((m) => m.size)).toEqual(['pony', 'pony']);
    p.items['saddle@pony'] = 1;
    p.items['bridle@pony'] = 1;
    p.tools = [...new Set([...(p.tools ?? []), 'ball', 'shampoo', 'lungeLine', 'brush'])];
    const full = createCargo();
    const cap = 4;
    for (const id of ['ball', 'shampoo', 'lungeLine', 'brush']) pack(p, full, id, cap);
    expect(cargoUsed(full)).toBe(cap);
    expect(packCompetitionTack(p, full, [pony], cap, 'jumping')).toEqual(['saddle@pony', 'bridle@pony']);
    expect(inCargo(full, 'ball')).toBe(0);
    expect(cargoUsed(full)).toBeLessThanOrEqual(cap);
  });
});

describe('équipement de dressage et sauvegardes', () => {
  it('la selle de dressage et le filet double ajoutent de la brillance aux yeux du juge', () => {
    const a = horse();
    expect(judgedSkill(a)).toBe(dressageSkill(a));
    a.gear = { saddle: { item: 'saddleDressage' }, bridle: { item: 'doubleBridle' } };
    expect(dressageTackBonus(a)).toBe(9);
    expect(judgedSkill(a)).toBe(dressageSkill(a) + 9);
    a.skills.dressage = 98;
    expect(judgedSkill(a)).toBe(100);
  });

  it('une ancienne sauvegarde reçoit les concours et la compétence de dressage des chevaux', () => {
    const p = createProfile('Lou');
    const old = JSON.parse(JSON.stringify(p));
    delete old.competitions;
    const a = horse();
    delete a.skills.dressage;
    old.animals.push(a);
    const m = migrate(old);
    expect(m.competitions).toEqual({ entries: [], results: [] });
    expect(m.animals[0].skills.dressage).toBe(10);
    // Les inscriptions déjà faites sont gardées.
    old.competitions = { entries: [{ id: 'x' }] };
    expect(migrate(old).competitions.entries).toHaveLength(1);
    expect(getBreed('horse', a.breed)).toBeTruthy();
  });
});

describe('textes du métier et des concours (FR puis EN)', () => {
  it('chaque texte du métier existe dans les deux langues, sans l\'ancien nom du jeu', async () => {
    globalThis.document = globalThis.document ?? { documentElement: {} };
    const { t, setLang } = await import('../src/i18n.js');
    const keys = ['career_rider', 'careerd_rider', 'ca_offer_rider', ...RANKS.map((r) => `ca_perk_${r}_rider`),
      ...CAREERS.rider.actions.map((a) => `ca_rider_${a.id}`), 'comp_why_needSaddle', 'comp_why_needBridle', 'comp_tackUp',
      'comp_tackMissing', 'comp_tackOk', 'comp_careerLine', 'comp_slot_saddle', 'comp_slot_bridle', 'dr_tackBonus'];
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of keys) {
        const s = t(k, { name: 'Tornade' });
        expect(s, `${lang}:${k}`).not.toBe(k);
        expect(s).not.toMatch(/Animadichelle|Animaleana/);
      }
    }
    setLang('en');
    expect(t('career_rider')).toBe('Show rider');
    setLang('fr');
    expect(t('comp_why_needSaddle', { name: 'Tornade', g: 'f' })).toMatch(/sellée/);
  });
});

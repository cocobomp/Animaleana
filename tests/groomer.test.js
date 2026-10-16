import { describe, it, expect } from 'vitest';
import { createProfile, loadProfile, saveProfile } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { STRUCTURES, build } from '../src/sim/construction.js';
import { UNLOCKS, xpForLevel } from '../src/sim/progress.js';
import { OBJECTIVES, checkObjectives } from '../src/sim/objectives.js';
import { QUEST_GUIDE, QUEST_STEPS, FOLLOW_STEPS } from '../src/sim/tutorial.js';
import { listCareers, getCareer, registerCareer } from '../src/sim/careersRegistry.js';
import { CAREERS, CAREER_IDS, careerSummary, startCareer, rankOf as careerRank, reputationOf } from '../src/sim/careers.js';
import { t } from '../src/i18n.js';
import {
  GROOMER_CAREER, RANKS, STEPS, STEP_IDS, STYLES, REQUESTS, ACCESSORIES, ACC_COLORS, MAX_WAITING, CUT_DAYS, GROOMER_LEVEL,
  ensureGroomer, rankOf, rankProgress, addCareerXp, canGroom, speciesAllowed, stylesFor, requestsFor,
  newClient, addClient, canWelcome, acceptClient, dismissClient, expireClients, recordStep, rateService, completeService,
  applyCut, cutFresh, groomingBonus, wearAccessory, removeAccessory, recordOwnGrooming, clientInterval, salonAt, careerXp, reputation,
} from '../src/sim/groomer.js';

const rng = () => 0.42;
const manage = (level = 3) => {
  const p = createProfile('Lou', 'manage');
  p.money = 1000;
  p.xp = xpForLevel(level);
  return p;
};
const has = (key) => t(key) !== key;

describe('métier Toiletteur : définition', () => {
  it('est inscrit au registre des métiers (💼 Métiers), avec 3 rangs, un carnet et une fiche par étape', () => {
    expect(CAREERS.groomer).toBe(GROOMER_CAREER);
    expect(CAREER_IDS).toContain('groomer');
    expect(getCareer('groomer')).toBe(GROOMER_CAREER);
    expect(listCareers().map((c) => c.id)).toEqual(expect.arrayContaining(['vet', 'pension', 'groomer']));
    expect(GROOMER_CAREER).toMatchObject({ emoji: '✂️', level: GROOMER_LEVEL, building: 'salon' });
    expect(GROOMER_CAREER.ranks).toEqual(RANKS.map((r) => r.xp));
    expect(GROOMER_CAREER.perks).toHaveLength(3);
    expect(GROOMER_CAREER.perks.every((k) => k.maxClients === 0)).toBe(true); // pas de pension grâce au salon
    expect(GROOMER_CAREER.perks[1].species).toContain('horse');
    expect(GROOMER_CAREER.steps.map((a) => a.id)).toEqual(STEP_IDS);
    for (const a of GROOMER_CAREER.steps) expect(has(a.tutorial), a.tutorial).toBe(true);
    for (const a of GROOMER_CAREER.actions) expect(has(`ca_groomer_${a.id}`), a.id).toBe(true);
    for (const k of ['career_groomer', 'careerd_groomer', 'ca_offer_groomer', 'ca_perk_apprentice_groomer', 'ca_perk_skilled_groomer', 'ca_perk_expert_groomer']) expect(has(k), k).toBe(true);
    registerCareer({ id: 'test', emoji: '🧪', ranks: [0], actions: [] });
    expect(getCareer('test').emoji).toBe('🧪');
    delete CAREERS.test;
    CAREER_IDS.splice(CAREER_IDS.indexOf('test'), 1);
  });

  it('le panneau des métiers voit le Toiletteur : verrouillé, disponible, puis commencé avec le même compteur d’XP', () => {
    const p = manage();
    expect(careerSummary(p, 'groomer', { level: 2 }).state).toBe('locked');
    expect(careerSummary(p, 'groomer', { level: 3 }).state).toBe('available');
    startCareer(p, 'groomer', 1, { level: 3 });
    addCareerXp(p, 320);
    const s = careerSummary(p, 'groomer', { level: 3 });
    expect(s.state).toBe('started');
    expect(s.rank).toBe(1);
    expect(careerRank(p, 'groomer')).toBe(rankOf(p));
    expect(s.progress.xp).toBe(careerXp(p));
    expect(s.carnet.map((a) => a.id)).toEqual(['welcome', 'bath', 'cut', 'finish', 'return']);
  });

  it('tous les textes existent (étapes, coupes, demandes, accessoires, couleurs, quêtes)', () => {
    for (const id of STEP_IDS) expect(has(`grm_step_${id}`), id).toBe(true);
    for (const id of Object.keys(STYLES)) expect(has(`grm_style_${id}`), id).toBe(true);
    for (const id of Object.keys(REQUESTS)) expect(has(`grm_req_${id}`), id).toBe(true);
    for (const id of Object.keys(ACCESSORIES)) expect(has(`grm_acc_${id}`), id).toBe(true);
    for (const id of Object.keys(ACC_COLORS)) expect(has(`grm_col_${id}`), id).toBe(true);
    for (const r of RANKS) expect(has(`grm_rank_${r.id}`) && has(`grm_rankDesc_${r.id}`), r.id).toBe(true);
    for (const s of Object.values(STEPS)) if (s.game.startsWith('g')) expect(has(`act_${s.game}`), s.game).toBe(true);
    for (const o of OBJECTIVES.filter((x) => x.id.startsWith('grm'))) expect(has(`o_${o.id}`), o.id).toBe(true);
    expect(has('st_salon') && has('con_d_salon')).toBe(true);
  });

  it('le salon est une construction de niveau 3, et les quêtes sont guidées', () => {
    expect(STRUCTURES.salon).toMatchObject({ cat: 'building', capacity: 0 });
    expect(UNLOCKS.salon).toBe(3);
    for (const id of ['grmSalon', 'grmClient1', 'grmOwn1', 'grmAccessory1', 'grmFive1']) {
      expect(QUEST_GUIDE[id], id).toBeTruthy();
      for (const s of QUEST_STEPS[id]) expect(FOLLOW_STEPS[s], s).toBeTruthy();
    }
  });
});

describe('métier Toiletteur : profil et rangs', () => {
  it('un profil neuf a le métier à zéro ; une vieille sauvegarde est complétée', () => {
    const p = createProfile('Lou');
    expect(careerXp(p)).toBe(0);
    expect(reputation(p)).toBe(50);
    expect(p.groomer.clients).toEqual([]);
    const old = { ...createProfile('Vieux') };
    delete old.careers;
    delete old.groomer;
    ensureGroomer(old);
    expect(careerXp(old)).toBe(0);
    expect(old.careers.started).toEqual({});
    expect(old.groomer.clients).toEqual([]);
  });

  it('les rangs montent avec l’XP et débloquent espèces et coupes', () => {
    const p = manage();
    expect(canGroom(p)).toBe(true);
    expect(canGroom(manage(2))).toBe(false);
    expect(rankOf(p)).toBe(0);
    expect(speciesAllowed(p)).toEqual(['dog', 'cat', 'rabbit']);
    expect(stylesFor(p, 'dog')).toEqual(['court']);
    expect(requestsFor(p)).not.toContain('lion');
    const up = addCareerXp(p, 300);
    expect(up).toEqual({ rankUp: true, rank: 1 });
    expect(speciesAllowed(p)).toContain('horse');
    expect(stylesFor(p, 'dog')).toContain('lion');
    expect(stylesFor(p, 'cat')).not.toContain('caniche');
    expect(stylesFor(p, 'horse')).toContain('tonte');
    expect(rankProgress(p)).toMatchObject({ rank: 1, next: 900 });
    addCareerXp(p, 600);
    expect(rankOf(p)).toBe(2);
    expect(speciesAllowed(p)).toContain('sheep');
    expect(rankProgress(p).next).toBeNull();
  });
});

describe('métier Toiletteur : clients', () => {
  it('crée un client adapté au rang, avec un animal de passage et une demande', () => {
    const p = manage();
    const c = newClient(p, { rng, day: 3 });
    expect(REQUESTS[c.request].rank).toBe(0);
    expect(['dog', 'cat', 'rabbit']).toContain(c.animal.species);
    expect(c.animal.guest).toBe(true);
    expect(c.steps.map((s) => s.id)).toEqual(REQUESTS[c.request].steps);
    expect(c.price).toBeGreaterThanOrEqual(REQUESTS[c.request].price);
    const forced = newClient(p, { requestId: 'poodle', rng, day: 3 });
    expect(forced.animal.species).toBe('dog');
    expect(['caniche', 'labradoodle', 'spitz_nain']).toContain(forced.animal.breed);
    expect(forced.style).toBe('caniche');
  });

  it('deux clients au plus, l’acceptation dépend du rang, le refus coûte un peu de réputation', () => {
    const p = manage();
    const a = newClient(p, { rng, day: 1 });
    const b = newClient(p, { rng, day: 1 });
    const c = newClient(p, { rng, day: 1 });
    expect(addClient(p, a).ok).toBe(true);
    expect(addClient(p, b).ok).toBe(true);
    expect(canWelcome(p)).toBe(false);
    expect(addClient(p, c)).toMatchObject({ ok: false, reason: 'full' });
    const horse = newClient(p, { requestId: 'horseClip', rng, day: 1 });
    expect(acceptClient(p, horse)).toMatchObject({ ok: false, reason: 'rank' });
    expect(acceptClient(p, a).ok).toBe(true);
    expect(acceptClient(p, b)).toMatchObject({ ok: false, reason: 'busy' });
    dismissClient(p, b, true);
    expect(reputationOf(p, 'groomer')).toBe(49);
    expect(p.groomer.clients).toHaveLength(1);
    // Le lendemain, ceux qui attendaient sont partis.
    addClient(p, newClient(p, { rng, day: 1 }));
    expect(expireClients(p, 2)).toHaveLength(2);
    expect(p.groomer.clients).toHaveLength(0);
    expect(clientInterval(p)).toBeGreaterThan(1);
  });

  it('note la prestation : étapes, qualité, calme → étoiles, paye, réputation, XP', () => {
    const p = manage();
    const c = newClient(p, { requestId: 'bathCut', rng, day: 1 });
    addClient(p, c);
    acceptClient(p, c);
    expect(rateService(c).stars).toBe(1);
    recordStep(c, 'bath', 1);
    recordStep(c, 'dry', 1, { stress: 0 });
    expect(recordStep(c, 'teeth', 1)).toBe('extra');
    expect(c.extra).toEqual(['teeth']);
    expect(rateService(c).done).toBeCloseTo(2 / 3);
    recordStep(c, 'cut', 0.95);
    const r0 = rateService(c);
    expect(r0.stars).toBe(5);
    const money = p.money;
    const r = completeService(p, c, 1);
    expect(r.stars).toBe(5);
    expect(r.pay).toBe(Math.round(c.price * 1.4));
    expect(r.tip).toBeGreaterThan(0);
    expect(p.money).toBe(money + r.pay + r.tip);
    expect(reputation(p)).toBe(55);
    expect(careerXp(p)).toBe(r.xp);
    expect(p.careers.earned.groomer).toBe(r.pay + r.tip);
    expect(p.groomer.served).toBe(1);
    expect(p.groomer.history[0]).toMatchObject({ stars: 5, name: c.animal.name });
    expect(p.groomer.clients).toHaveLength(0);
    expect(p.stats.groomClients).toBe(1);
    expect(p.stats.groomFive).toBe(1);
    expect(checkObjectives(p).map((o) => o.id)).toEqual(expect.arrayContaining(['grmClient1', 'grmFive1']));
  });

  it('un animal effrayé par le séchoir ou une étape oubliée fait baisser la note', () => {
    const p = manage();
    const c = newClient(p, { requestId: 'nailsEars', rng, day: 1 });
    recordStep(c, 'nails', 1);
    expect(rateService(c).stars).toBe(3); // oreilles oubliées : moyenne 0,5
    recordStep(c, 'ears', 1, { stress: 1 });
    expect(rateService(c).calm).toBe(0);
    expect(rateService(c).stars).toBe(3); // 0,7 → 3 étoiles
    const r = completeService(p, c, 1);
    expect(r.rep).toBe(1);
    expect(r.tip).toBe(0);
  });

  it('en bac à sable, l’argent ne bouge pas mais l’XP et la réputation oui', () => {
    const p = createProfile('Sable', 'sandbox');
    p.xp = xpForLevel(3);
    const c = newClient(p, { requestId: 'knots', rng, day: 1 });
    recordStep(c, 'knots', 1);
    recordStep(c, 'brush', 1);
    completeService(p, c, 1);
    expect(p.money).toBe(500);
    expect(careerXp(p)).toBeGreaterThan(0);
  });
});

describe('métier Toiletteur : mes animaux et accessoires', () => {
  it('une coupe reste fraîche quelques jours et donne un bonus au concours de beauté', () => {
    const a = createAnimal({ species: 'dog', rng });
    expect(groomingBonus(a, 1)).toBe(0);
    applyCut(a, 'lion', 2, 1);
    expect(cutFresh(a, 2)).toBe(true);
    expect(cutFresh(a, 2 + CUT_DAYS)).toBe(false);
    const fresh = groomingBonus(a, 2);
    expect(fresh).toBeGreaterThan(0.1);
    expect(groomingBonus(a, 5)).toBeLessThan(fresh);
    expect(groomingBonus(a, 20)).toBe(0);
  });

  it('les accessoires se paient (sauf changement de couleur), se portent par emplacement et se retirent', () => {
    const p = manage();
    const a = createAnimal({ species: 'cat', rng });
    expect(wearAccessory(p, a, 'hat')).toMatchObject({ ok: false, reason: 'rank' });
    expect(wearAccessory(p, a, 'ribbon', 'blue').ok).toBe(true);
    expect(a.accessories.head).toEqual({ id: 'ribbon', color: 'blue' });
    expect(p.money).toBe(1000 - ACCESSORIES.ribbon.price);
    expect(wearAccessory(p, a, 'ribbon', 'red').ok).toBe(true);
    expect(p.money).toBe(1000 - ACCESSORIES.ribbon.price); // couleur gratuite
    expect(wearAccessory(p, a, 'bell').ok).toBe(true);
    expect(Object.keys(a.accessories).sort()).toEqual(['head', 'neck']);
    p.money = 0;
    expect(wearAccessory(p, a, 'tailBow')).toMatchObject({ ok: false, reason: 'money' });
    expect(wearAccessory(p, a, 'tailBow', 'pink', { free: true }).ok).toBe(true);
    expect(groomingBonus(a, 1)).toBeCloseTo(0.06);
    expect(removeAccessory(a, 'head')).toBe(true);
    expect(removeAccessory(a, 'head')).toBe(false);
    expect(p.stats.groomAccessories).toBe(3);
    const guest = createAnimal({ species: 'dog', rng });
    guest.guest = true;
    wearAccessory(p, guest, 'ribbon', 'pink', { free: true });
    expect(p.stats.groomAccessories).toBe(3);
  });

  it('toiletter un de ses animaux compte pour les quêtes et l’XP du métier', () => {
    const p = manage();
    const a = createAnimal({ species: 'rabbit', rng });
    recordOwnGrooming(p, a, ['bath', 'cut']);
    expect(p.stats.groomOwn).toBe(1);
    expect(p.stats.groomCuts).toBe(1);
    expect(careerXp(p)).toBe(11);
    expect(checkObjectives(p).map((o) => o.id)).toContain('grmOwn1');
  });

  it('le salon se construit et se retrouve par lieu', () => {
    const p = manage();
    const r = build(p, 'salon', 'maison', 20, -20, 0);
    expect(r.ok).toBe(true);
    expect(salonAt(p, 'maison')).toBe(r.structure);
    expect(salonAt(p, 'alpes')).toBeNull();
    expect(checkObjectives(p).map((o) => o.id)).toContain('grmSalon');
    expect(build(manage(2), 'salon', 'maison', 20, -20, 0)).toMatchObject({ ok: false, reason: 'locked' });
  });

  it('les clients et les accessoires survivent à la sauvegarde', () => {
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    const p = manage();
    const c = newClient(p, { rng, day: 1 });
    addClient(p, c);
    const a = createAnimal({ species: 'dog', rng });
    wearAccessory(p, a, 'bandana', 'green');
    p.animals.push(a);
    saveProfile(p);
    const q = loadProfile(p.id);
    expect(q.groomer.clients[0].animal.name).toBe(c.animal.name);
    expect(q.animals[0].accessories.neck).toEqual({ id: 'bandana', color: 'green' });
    delete globalThis.localStorage;
  });
});

describe('métier Toiletteur : constantes', () => {
  it('garde les limites simples pour un enfant', () => {
    expect(MAX_WAITING).toBe(2);
    for (const r of Object.values(REQUESTS)) {
      for (const s of r.steps) expect(STEPS[s], s).toBeTruthy();
      if (r.style) expect(STYLES[r.style].rank).toBeLessThanOrEqual(r.rank);
    }
  });
});

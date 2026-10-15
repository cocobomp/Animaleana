import { describe, it, expect } from 'vitest';
import { createProfile } from '../src/sim/profile.js';
import { mulberry32 } from '../src/sim/rng.js';
import {
  DOG_TRAINER_CAREER, PROBLEMS, PROBLEM_IDS, COACHINGS, coachingsFor, makeClientRequest, acceptClient, canSession,
  applySession, isFixed, readyForDelivery, deliveryResult, finishClient, shouldClientArrive, sessionPrice,
  careerBook, maxClients, dogTrainerRank, FIXED_BELOW,
} from '../src/sim/dogTrainer.js';
import { listCareers, getCareer, addCareerXp, rankIndex, rankProgress, careerXp } from '../src/sim/careersRegistry.js';
import { OBJECTIVES } from '../src/sim/objectives.js';
import { QUEST_GUIDE, QUEST_STEPS, FOLLOW_STEPS } from '../src/sim/tutorial.js';
import { t, setLang } from '../src/i18n.js';

const profile = (xp = 300) => {
  const p = createProfile('Lou', 'manage');
  p.xp = xp; // niveau 3 à 150 XP, niveau 4 à 300
  return p;
};
const rng = () => mulberry32(7);

describe('registre des métiers', () => {
  it('expose le métier éducateur canin avec rangs, actions et niveau requis', () => {
    expect(listCareers().map((c) => c.id)).toContain('dogTrainer');
    expect(getCareer('dogTrainer')).toBe(DOG_TRAINER_CAREER);
    expect(DOG_TRAINER_CAREER.level).toBe(3);
    expect(DOG_TRAINER_CAREER.ranks.map((r) => r.id)).toEqual(['apprenti', 'confirme', 'expert']);
    expect(DOG_TRAINER_CAREER.actions.every((a) => a.id && a.tutorial)).toBe(true);
  });
  it('gère l\'XP et les rangs dans profile.careers', () => {
    const p = profile();
    expect(p.careers).toEqual({ xp: {}, active: null });
    expect(rankIndex(DOG_TRAINER_CAREER, 0)).toBe(0);
    const r = addCareerXp(p, DOG_TRAINER_CAREER, 160);
    expect(r).toMatchObject({ xp: 160, rank: 1, rankUp: true });
    expect(careerXp(p, 'dogTrainer')).toBe(160);
    expect(rankProgress(DOG_TRAINER_CAREER, 160)).toBeGreaterThan(0);
    expect(addCareerXp(p, DOG_TRAINER_CAREER, 300).rank).toBe(2);
    expect(rankProgress(DOG_TRAINER_CAREER, 1000)).toBe(1);
  });
});

describe('éducateur canin : clients', () => {
  it('fabrique une demande : un chien avec un problème, des séances et un prix', () => {
    const p = profile();
    const req = makeClientRequest(p, { day: 3, rng: rng(), problem: 'pull' });
    expect(req.main).toBe('pull');
    expect(req.dog.species).toBe('dog');
    expect(req.dog.skills.obedience).toBeLessThanOrEqual(20);
    expect(req.problems.pull).toBeGreaterThanOrEqual(60);
    expect(req.sessionsNeeded).toBeGreaterThanOrEqual(3);
    expect(req.sessionsNeeded).toBeLessThanOrEqual(5);
    expect(req.price).toBe(sessionPrice(p));
    expect(Object.keys(req.problems)).toHaveLength(1); // pas de cas difficile avant le rang expert
  });
  it('un expert reçoit des chiens de refuge avec deux problèmes', () => {
    const p = profile();
    addCareerXp(p, DOG_TRAINER_CAREER, 400);
    expect(dogTrainerRank(p)).toBe(2);
    const req = makeClientRequest(p, { rng: rng(), rescue: true });
    expect(Object.keys(req.problems)).toHaveLength(2);
    expect(req.rescue).toBe(true);
  });
  it('accepter garde le chien à la ferme comme client, dans la limite du rang', () => {
    const p = profile();
    const req = makeClientRequest(p, { day: 2, rng: rng(), problem: 'recall' });
    const r = acceptClient(p, req, 2);
    expect(r.ok).toBe(true);
    expect(p.animals).toHaveLength(1);
    expect(p.animals[0].client).toMatchObject({ kind: 'training', problem: 'recall', sessionsDone: 0, ownerName: req.ownerName });
    expect(p.dogTrainer.clients).toEqual([req.dog.id]);
    expect(maxClients(p)).toBe(1);
    expect(acceptClient(p, makeClientRequest(p, { rng: rng() }), 2)).toMatchObject({ ok: false, reason: 'full' });
  });
  it('le premier client vient toujours, puis selon les heures et la réputation', () => {
    const p = profile();
    expect(shouldClientArrive(p, { day: 1, hour: 10, level: 2 })).toBe(false); // niveau 3 requis
    expect(shouldClientArrive(p, { day: 1, hour: 7, level: 3 })).toBe(false); // trop tôt
    expect(shouldClientArrive(p, { day: 1, hour: 10, level: 3 })).toBe(true);
    expect(shouldClientArrive(p, { day: 1, hour: 11, level: 3 })).toBe(false); // une visite par jour
    p.careers.active = 'vet';
    expect(shouldClientArrive(p, { day: 2, hour: 11, level: 3 })).toBe(false); // un autre métier en cours
  });
});

describe('éducateur canin : séances et livraison', () => {
  const setup = (problem = 'pull', level = 70) => {
    const p = profile();
    const req = makeClientRequest(p, { day: 1, rng: rng(), problem });
    req.problems[problem] = level;
    acceptClient(p, req, 1);
    return { p, a: p.animals[0] };
  };
  it('une séance par jour ; une bonne séance baisse le problème et fait progresser le chien', () => {
    const { p, a } = setup();
    expect(canSession(a, 1).ok).toBe(true);
    const heel = a.tricks.heel ?? 0;
    const r = applySession(p, a, 'pull', 0.9, 1);
    expect(r.before).toBe(70);
    expect(r.after).toBeLessThan(45);
    expect(r.perfect).toBe(true);
    expect(a.tricks.heel).toBeGreaterThan(heel);
    expect(a.client.sessionsDone).toBe(1);
    expect(canSession(a, 1)).toMatchObject({ ok: false, reason: 'today' });
    expect(canSession(a, 2).ok).toBe(true);
    expect(p.stats.dtSessions).toBe(1);
    expect(careerXp(p, 'dogTrainer')).toBeGreaterThan(0);
  });
  it('une séance ratée remonte un peu le problème', () => {
    const { p, a } = setup();
    const r = applySession(p, a, 'pull', 0.3, 1);
    expect(r.after).toBeGreaterThan(70);
  });
  it('un rang plus haut règle les problèmes plus vite', () => {
    const s1 = setup();
    const s2 = setup();
    addCareerXp(s2.p, DOG_TRAINER_CAREER, 400);
    const r1 = applySession(s1.p, s1.a, 'pull', 0.8, 1);
    const r2 = applySession(s2.p, s2.a, 'pull', 0.8, 1);
    expect(r2.after).toBeLessThan(r1.after);
  });
  it('réglé sous 15 % : le maître revient, paie, pourboire, réputation et le chien repart', () => {
    const { p, a } = setup('pull', 40);
    p.money = 100;
    applySession(p, a, 'pull', 1, 1);
    expect(isFixed(a)).toBe(true);
    expect(readyForDelivery(a)).toBe(true);
    const r = deliveryResult(p, a);
    expect(r.success).toBe(true);
    expect(r.stars).toBe(3);
    expect(r.pay).toBe(a.client.price);
    expect(r.tip).toBeGreaterThan(0);
    const price = a.client.price;
    const f = finishClient(p, a, 2);
    expect(p.money).toBe(100 + price + r.tip);
    expect(p.dogTrainer.reputation).toBe(50 + r.repDelta);
    expect(p.animals).toHaveLength(0);
    expect(p.dogTrainer.history[0]).toMatchObject({ name: a.name, stars: 3, success: true });
    expect(p.stats.dtSuccess).toBe(1);
    expect(f.success).toBe(true);
  });
  it('séances épuisées sans réussite : paiement réduit et réputation en baisse', () => {
    const { p, a } = setup('bark', 90);
    a.client.sessionsNeeded = 2;
    applySession(p, a, 'bark', 0.5, 1);
    applySession(p, a, 'bark', 0.5, 2);
    expect(isFixed(a)).toBe(false);
    expect(readyForDelivery(a)).toBe(true);
    expect(canSession(a, 3)).toMatchObject({ ok: false, reason: 'done' });
    const r = deliveryResult(p, a);
    expect(r.success).toBe(false);
    expect(r.pay).toBe(Math.round(a.client.price * 2 * 0.5));
    expect(r.repDelta).toBeLessThan(0);
  });
  it('coache ses propres animaux (gratuit) : chiens tout, chatons et poulains assis et rappel', () => {
    const p = profile();
    expect(coachingsFor({ species: 'dog' }, 0)).toEqual(PROBLEM_IDS);
    expect(coachingsFor({ species: 'dog' }, 1)).toContain('herd');
    expect(coachingsFor({ species: 'dog' }, 1)).not.toContain('agility');
    expect(coachingsFor({ species: 'dog' }, 2)).toContain('agility');
    expect(coachingsFor({ species: 'cat' }, 2)).toEqual(['obey', 'recall', 'agility']);
    expect(coachingsFor({ species: 'horse' }, 0)).toEqual(['obey', 'recall']);
    expect(coachingsFor({ species: 'cow' }, 2)).toEqual([]);
    const dog = { species: 'dog', needs: { energy: 80 }, skills: { obedience: 10, herding: 5 }, tricks: {}, bond: 20 };
    const r = applySession(p, dog, 'herd', 0.9, 4);
    expect(r.before).toBeNull();
    expect(dog.skills.herding).toBeGreaterThan(5);
    expect(canSession(dog, 4)).toMatchObject({ ok: false, reason: 'today' });
    expect(p.stats.dtCoach).toBe(1);
    expect(p.stats.dtCoach_herd).toBe(1);
    expect(careerBook(p).find((x) => x.id === 'coachHerd').done).toBe(true);
  });
});

describe('éducateur canin : quêtes, tutoriel et textes', () => {
  it('les quêtes du métier ont un guide, des étapes et des textes fr/en', () => {
    const ids = OBJECTIVES.filter((o) => o.id.startsWith('dt')).map((o) => o.id);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    for (const id of ids.filter((x) => OBJECTIVES.find((o) => o.id === x).kind === 'quest')) {
      expect(QUEST_GUIDE[id], id).toBeTruthy();
      expect(QUEST_STEPS[id], id).toBeTruthy();
      for (const s of QUEST_STEPS[id]) expect(FOLLOW_STEPS[s], s).toBeTruthy();
    }
    const hadDoc = 'document' in globalThis;
    if (!hadDoc) globalThis.document = { documentElement: {} }; // setLang touche <html lang>
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const id of ids) expect(t(`o_${id}`)).not.toBe(`o_${id}`);
      for (const pid of PROBLEM_IDS) {
        expect(t(`dt_problem_${pid}`)).not.toBe(`dt_problem_${pid}`);
        expect(t(`dt_session_${pid}`)).not.toBe(`dt_session_${pid}`);
        expect(t(`dt_how_${pid}`)).not.toBe(`dt_how_${pid}`);
        expect(t(`dt_ask_${pid}`)).not.toBe(`dt_ask_${pid}`);
        expect(t(`act_${PROBLEMS[pid].game}`)).not.toBe(`act_${PROBLEMS[pid].game}`);
      }
      for (const cid of Object.keys(COACHINGS)) expect(t(`dt_session_${cid}`)).not.toBe(`dt_session_${cid}`);
      for (const act of DOG_TRAINER_CAREER.actions) {
        expect(t(act.tutorial)).not.toBe(act.tutorial);
        expect(t(`dt_tuto_${act.id}_title`)).not.toBe(`dt_tuto_${act.id}_title`);
        expect(t(`dt_act_${act.id}`)).not.toBe(`dt_act_${act.id}`);
      }
      for (const ph of ['walk', 'idle', 'pulling', 'waiting', 'reward', 'bad']) expect(t(`dt_walk_${ph}`)).not.toBe(`dt_walk_${ph}`);
    }
    setLang('fr');
    if (!hadDoc) delete globalThis.document;
  });
  it('les sauvegardes anciennes reçoivent les champs du métier', async () => {
    const { loadProfile, saveProfile } = await import('../src/sim/profile.js');
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    const p = createProfile('Old');
    delete p.careers;
    delete p.dogTrainer;
    saveProfile(p);
    const back = loadProfile(p.id);
    expect(back.careers).toEqual({ xp: {}, active: null });
    expect(back.dogTrainer.reputation).toBe(50);
    expect(FIXED_BELOW).toBe(15);
    delete globalThis.localStorage;
  });
});

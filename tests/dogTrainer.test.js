import { describe, it, expect } from 'vitest';
import { createProfile } from '../src/sim/profile.js';
import { mulberry32 } from '../src/sim/rng.js';
import {
  DOG_TRAINER_CAREER, PROBLEMS, PROBLEM_IDS, COACHINGS, coachingsFor, makeClientRequest, acceptClient, canSession,
  applySession, isFixed, readyForDelivery, deliveryResult, finishClient, shouldClientArrive, sessionPrice,
  careerBook, maxClients, dogTrainerRank, FIXED_BELOW, nextProblem, isOverdue, clientDogs,
  setPending, pendingRequest, clearPending, pendingExpired, careCheck, neglectReason,
} from '../src/sim/dogTrainer.js';
import {
  CAREERS, CAREER_IDS, RANKS, startCareer, addCareerXp, careerXp, reputationOf, nextAction, carnet, careerSummary,
} from '../src/sim/careers.js';
import { maxClients as boardingMax, isClientAnimal } from '../src/sim/clients.js';
import { inUse, owned } from '../src/sim/gear.js';
import { OBJECTIVES } from '../src/sim/objectives.js';
import { QUEST_GUIDE, QUEST_STEPS, FOLLOW_STEPS, QUEST_ORDER } from '../src/sim/tutorial.js';
import { t, setLang } from '../src/i18n.js';
import { commandsFor, commandsQuality, COMMANDS, DOG_TRAINING_GAMES } from '../src/ui/minigames/dogTraining.js';

/** Un joueur de niveau 3 ou plus qui a commencé le métier d'éducateur canin. */
const profile = ({ xp = 300, start = true } = {}) => {
  const p = createProfile('Lou', 'manage');
  p.xp = xp; // niveau 3 à 150 XP, niveau 4 à 300
  if (start) startCareer(p, 'dogTrainer', 1, { level: 3 });
  return p;
};
const rng = () => mulberry32(7);

describe('éducateur canin : inscrit dans le registre des métiers', () => {
  it('une entrée de CAREERS avec rangs, actions et avantages par rang', () => {
    expect(CAREER_IDS).toContain('dogTrainer');
    expect(CAREERS.dogTrainer).toBe(DOG_TRAINER_CAREER);
    expect(DOG_TRAINER_CAREER).toMatchObject({ id: 'dogTrainer', level: 3, building: 'kennel', ranks: [0, 150, 400], ownClients: true });
    expect(DOG_TRAINER_CAREER.perks).toHaveLength(RANKS.length);
    expect(DOG_TRAINER_CAREER.actions.map((a) => a.id)).toEqual(['meetClient', 'session', 'deliver', 'coachOwn', 'coachHerd', 'coachAgility', 'rescue']);
    // Chaque rang ajoute quelque chose : plus de chiens, de problèmes, un meilleur prix.
    const [a, b, c] = DOG_TRAINER_CAREER.perks;
    expect(a.maxClients < b.maxClients && b.maxClients < c.maxClients).toBe(true);
    expect(a.problems.length < b.problems.length && b.problems.length < c.problems.length).toBe(true);
    expect(c.rescue && !a.rescue).toBe(true);
    for (const pk of DOG_TRAINER_CAREER.perks) for (const id of pk.problems) expect(PROBLEMS[id], id).toBeTruthy();
  });
  it('le métier se commence comme les autres, et le carnet ferme les actions des rangs suivants', () => {
    const p = profile({ start: false });
    // (une partie avec un mouton : le coaching « chien de troupeau » est au carnet ; sans troupeau possible,
    // il est caché, voir tests/especesProposees.test.js)
    p.animals.push({ id: 'mouton', species: 'sheep' });
    expect(careerSummary(p, 'dogTrainer', { level: 2 }).state).toBe('locked');
    expect(careerSummary(p, 'dogTrainer', { level: 3 }).state).toBe('available');
    expect(startCareer(p, 'dogTrainer', 1, { level: 3 }).ok).toBe(true);
    expect(p.careers.active).toBe('dogTrainer');
    const book = carnet(p, 'dogTrainer');
    expect(book.find((x) => x.id === 'coachHerd')).toMatchObject({ done: false, locked: true });
    expect(book.find((x) => x.id === 'coachOwn')).toMatchObject({ done: false, locked: false });
    expect(nextAction(p, 'dogTrainer').id).toBe('meetClient');
    // Toutes les actions ouvertes faites : la suivante est fermée, donc rien à proposer.
    for (const id of ['meetClient', 'session', 'deliver', 'coachOwn']) p.careers.done.dogTrainer.push(id);
    expect(nextAction(p, 'dogTrainer')).toBeNull();
    addCareerXp(p, 'dogTrainer', 200);
    expect(nextAction(p, 'dogTrainer').id).toBe('coachHerd');
  });
  it('ses chiens ne prennent pas la place de la pension (clients à part)', () => {
    const p = profile();
    expect(boardingMax(p)).toBe(0); // aucun métier « pension / soins » commencé
    startCareer(p, 'pension', 1, { level: 3 });
    expect(boardingMax(p)).toBe(1);
    acceptClient(p, makeClientRequest(p, { rng: rng() }), 1);
    expect(isClientAnimal(p.animals[0])).toBe(false);
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
  it('le tout premier client a un chien qui n\'obéit pas (les ordres de base), puis selon le rang', () => {
    const p = profile();
    expect(makeClientRequest(p, { rng: rng() }).main).toBe('obey');
    acceptClient(p, makeClientRequest(p, { rng: rng() }), 1);
    const r = mulberry32(3);
    const seen = new Set();
    for (let i = 0; i < 60; i++) seen.add(makeClientRequest(p, { rng: r }).main);
    expect([...seen].every((id) => DOG_TRAINER_CAREER.perks[0].problems.includes(id))).toBe(true);
    expect(seen.has('shy')).toBe(false); // chiens peureux : rang expert
  });
  it('un expert reçoit des chiens de refuge avec deux problèmes', () => {
    const p = profile();
    expect(makeClientRequest(p, { rng: rng(), rescue: true }).rescue).toBe(false); // apprenti : non
    addCareerXp(p, 'dogTrainer', 400);
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
    addCareerXp(p, 'dogTrainer', 200);
    expect(maxClients(p)).toBe(2);
    expect(acceptClient(p, makeClientRequest(p, { rng: rng() }), 2).ok).toBe(true);
    expect(clientDogs(p)).toHaveLength(2);
    expect(p.careers.done.dogTrainer).toContain('meetClient');
  });
  it('le collier et la laisse du client ne viennent pas de ta sellerie', () => {
    const p = profile();
    const before = inUse(p, 'leash');
    acceptClient(p, makeClientRequest(p, { rng: rng() }), 1);
    expect(p.animals[0].gear.leash).toMatchObject({ item: 'leash', own: true });
    expect(inUse(p, 'leash')).toBe(before);
    expect(owned(p, 'leash')).toBeGreaterThan(0);
  });
  it('le premier client vient toujours, puis selon les heures et la réputation', () => {
    expect(shouldClientArrive(profile({ start: false }), { day: 1, hour: 10 })).toBe(false); // métier pas commencé
    const p = profile();
    expect(shouldClientArrive(p, { day: 1, hour: 7 })).toBe(false); // trop tôt
    expect(shouldClientArrive(p, { day: 1, hour: 10 })).toBe(true);
    expect(shouldClientArrive(p, { day: 1, hour: 11 })).toBe(false); // une visite par jour
  });  it('le maître qui attend une réponse survit au rechargement, le même jour seulement', () => {
    const p = profile();
    expect(shouldClientArrive(p, { day: 1, hour: 10 })).toBe(true);
    const req = makeClientRequest(p, { day: 1, rng: rng() });
    setPending(p, req, 1);
    // Sauvegarde puis rechargement : la demande est toujours là (et la visite du jour déjà comptée).
    const back = JSON.parse(JSON.stringify(p));
    expect(shouldClientArrive(back, { day: 1, hour: 12 })).toBe(false);
    const again = pendingRequest(back, 1);
    expect(again).toMatchObject({ ownerName: req.ownerName, main: req.main });
    expect(again.dog.id).toBe(req.dog.id);
    // Une fois accepté, il n'attend plus.
    acceptClient(back, again, 1);
    expect(pendingRequest(back, 1)).toBe(null);
    // Le lendemain, la demande d'hier est oubliée ; refuser l'efface aussi.
    setPending(p, req, 1);
    expect(pendingRequest(p, 2)).toBe(null);
    expect(p.dogTrainer.pending).toBe(null);
    setPending(p, req, 2);
    clearPending(p);
    expect(pendingRequest(p, 2)).toBe(null);
  });
  it('un maître à qui on ne répond pas repart au bout de 2 h (et garde son heure s\'il revient après un rechargement)', () => {
    const p = profile();
    const req = makeClientRequest(p, { day: 1, rng: rng() });
    const clock = 24 * 60 + 9 * 60; // jour 1, 9 h
    setPending(p, req, 1, clock);
    expect(pendingExpired(p, clock + 60)).toBe(false);
    expect(pendingRequest(p, 1, clock + 60)).toBe(req);
    // Rechargé à 10 h : le même maître revient, sans repartir à zéro.
    const back = JSON.parse(JSON.stringify(p));
    const again = pendingRequest(back, 1, clock + 60);
    setPending(back, again, 1, clock + 60);
    expect(back.dogTrainer.pending.expires).toBe(clock + 120);
    // À 11 h, il est reparti : la demande est oubliée, aucun maître ne revient ce jour-là.
    expect(pendingExpired(back, clock + 120)).toBe(true);
    expect(pendingRequest(back, 1, clock + 120)).toBe(null);
    expect(back.dogTrainer.pending).toBe(null);
    // Le lendemain, un autre client peut venir.
    expect(shouldClientArrive(back, { day: 2, hour: 10, rng: () => 0 })).toBe(true);
  });
  it('le maître ignoré repart vraiment dans le jeu (src/game/DogTrainer.js)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/game/DogTrainer.js', import.meta.url), 'utf8');
    expect(src).toMatch(/pendingExpired\(g\.profile, g\.profile\.clock\)\) \{\s*this\.ownerGivesUp\(v\)/);
    expect(src).toMatch(/setPending\(g\.profile, req, g\.day, g\.profile\.clock\)/);
    expect(src).toMatch(/ownerGivesUp\(v\) \{[\s\S]*?clearPending[\s\S]*?sendAway\(v, v\.e\)[\s\S]*?cl_left/);
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
    expect(nextProblem(a)).toBe('pull');
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
    expect(p.careers.done.dogTrainer).toContain('session');
  });
  it('une séance ratée remonte un peu le problème', () => {
    const { p, a } = setup();
    const r = applySession(p, a, 'pull', 0.3, 1);
    expect(r.after).toBeGreaterThan(70);
  });
  it('progrès sur plusieurs séances jusqu\'à ce que ce soit réglé', () => {
    const { p, a } = setup('obey', 80);
    let day = 1;
    while (!isFixed(a) && day < 10) applySession(p, a, 'obey', 0.8, day++);
    expect(isFixed(a)).toBe(true);
    expect(a.client.sessionsDone).toBeGreaterThanOrEqual(3);
    expect(nextProblem(a)).toBeNull();
    expect(readyForDelivery(a, day)).toBe(true);
  });
  it('un rang plus haut règle les problèmes plus vite', () => {
    const s1 = setup();
    const s2 = setup();
    addCareerXp(s2.p, 'dogTrainer', 400);
    const r1 = applySession(s1.p, s1.a, 'pull', 0.8, 1);
    const r2 = applySession(s2.p, s2.a, 'pull', 0.8, 1);
    expect(r2.after).toBeLessThan(r1.after);
  });
  it('réglé sous 15 % : le maître revient, paie, réputation et le chien repart', () => {
    const { p, a } = setup('pull', 40);
    p.money = 100;
    applySession(p, a, 'pull', 1, 1);
    expect(isFixed(a)).toBe(true);
    expect(readyForDelivery(a)).toBe(true);
    const r = deliveryResult(p, a);
    expect(r.success).toBe(true);
    expect(r.stars).toBe(3);
    expect(r.pay).toBe(a.client.price);
    expect(r.tip).toBe(0); // pas de pourboire au rang apprenti (avantage du rang confirmé)
    const price = a.client.price;
    const f = finishClient(p, a, 2);
    expect(p.money).toBe(100 + price);
    expect(reputationOf(p, 'dogTrainer')).toBe(50 + r.repDelta);
    expect(p.careers.earned.dogTrainer).toBe(price);
    expect(p.animals).toHaveLength(0);
    expect(p.dogTrainer.history[0]).toMatchObject({ name: a.name, stars: 3, success: true });
    expect(p.stats.dtSuccess).toBe(1);
    expect(f.success).toBe(true);
    expect(p.careers.done.dogTrainer).toContain('deliver');
  });
  it('rang confirmé : pourboire pour une livraison parfaite', () => {
    const { p, a } = setup('pull', 40);
    addCareerXp(p, 'dogTrainer', 200);
    applySession(p, a, 'pull', 1, 1);
    expect(deliveryResult(p, a).tip).toBeGreaterThan(0);
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
  it('chien rendu malade, affamé et assoiffé : plus de ★★★ « Incroyable ! », paye réduite et réputation en baisse', () => {
    const { p, a } = setup('pull', 40);
    applySession(p, a, 'pull', 1, 1);
    expect(isFixed(a)).toBe(true);
    const good = deliveryResult(p, a);
    expect(good).toMatchObject({ stars: 3, care: 'good', neglect: null, repDelta: 8 });
    for (const k of Object.keys(a.needs)) a.needs[k] = 0;
    a.sick = 'flu';
    a.health = 40;
    const bad = deliveryResult(p, a);
    expect(bad.success).toBe(true); // (le problème est réglé…)
    expect(bad).toMatchObject({ stars: 1, care: 'bad', neglect: 'sick' }); // (…mais le chien rentre en mauvais état)
    expect(bad.pay).toBe(Math.round(good.pay * 0.5));
    expect(bad.repDelta).toBeLessThan(0);
    expect(bad.tip).toBe(0);
    expect(bad.xp).toBeLessThan(good.xp);
  });
  it('un peu négligé (faim) : deux étoiles au plus, la phrase du maître dit pourquoi, et la fiche prévient avant', () => {
    const { p, a } = setup('pull', 40);
    applySession(p, a, 'pull', 1, 1);
    for (const k of Object.keys(a.needs)) a.needs[k] = 55;
    a.needs.hunger = 5;
    expect(neglectReason(a)).toBe('hunger');
    expect(careCheck(a).level).toBe('poor');
    const r = deliveryResult(p, a);
    expect(r).toMatchObject({ success: true, stars: 2, care: 'poor', neglect: 'hunger', repDelta: 2 });
    expect(r.pay).toBe(Math.round(a.client.price * a.client.sessionsDone * 0.75));
    // Bien nourri juste avant le retour du maître : tout va bien.
    a.needs.hunger = 90;
    for (const k of Object.keys(a.needs)) a.needs[k] = Math.max(a.needs[k], 80);
    expect(neglectReason(a)).toBeNull();
    expect(deliveryResult(p, a)).toMatchObject({ stars: 3, care: 'good' });
  });
  it('chien malade mais bien soigné par ailleurs : au plus deux étoiles (« il fallait appeler le vétérinaire »)', () => {
    const { p, a } = setup('pull', 40);
    applySession(p, a, 'pull', 1, 1);
    for (const k of Object.keys(a.needs)) a.needs[k] = 95;
    a.sick = 'cold';
    expect(careCheck(a).level).not.toBe('good');
    const r = deliveryResult(p, a);
    expect(r.stars).toBeLessThanOrEqual(2);
    expect(r.neglect).toBe('sick');
  });
  it('les textes du maître mécontent existent en français et en anglais, avec le féminin', () => {
    const hadDoc = 'document' in globalThis;
    if (!hadDoc) globalThis.document = { documentElement: {} }; // setLang touche <html lang>
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of ['sick', 'hunger', 'thirst', 'hygiene', 'other']) {
        expect(t(`dt_owner_neglect_${k}`, { dog: 'Pompon' })).not.toMatch(/dt_|\{/);
        expect(t(`dt_careWarn_${k}`, { name: 'Pompon', owner: 'Tom' })).not.toMatch(/dt_|\{/);
      }
      expect(t('dt_neglect_explain', { dog: 'Pompon' })).not.toMatch(/dt_|\{/);
    }
    setLang('fr');
    expect(t('dt_owner_neglect_hunger', { dog: 'Réglisse', g: 'f' })).toMatch(/affamée/);
    expect(t('dt_careWarn_hygiene', { name: 'Réglisse', owner: 'Tom', g: 'f' })).toMatch(/la retrouver/);
    if (!hadDoc) delete globalThis.document;
  });
  it('le jour prévu passé, le maître revient quand même', () => {
    const { a } = setup('jump', 80);
    expect(readyForDelivery(a, a.client.until)).toBe(false);
    expect(isOverdue(a, a.client.until + 1)).toBe(true);
    expect(readyForDelivery(a, a.client.until + 1)).toBe(true);
  });
  it('coache ses propres animaux (gratuit) : chiens tout, chats, lapins et chevaux les ordres et le rappel', () => {
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

describe('mini-jeu « Les ordres »', () => {
  it('assis, couché, pas bouger, au pied et rappel pour un chien ; pas de « couché » pour un cheval', () => {
    expect(commandsFor('dog')).toEqual(['sit', 'down', 'stay', 'heel', 'recall']);
    expect(commandsFor('horse')).not.toContain('sit');
    expect(commandsFor('cat')).not.toContain('down');
    expect(commandsFor('dog', 'dt_pull')).toContain('heel');
    for (const id of commandsFor('dog')) expect(COMMANDS[id].emoji).toBeTruthy();
  });
  it('la note récompense le bon moment et compte les erreurs', () => {
    expect(commandsQuality([1, 1, 1, 1, 1], 0)).toBe(1);
    expect(commandsQuality([1, 0.75, 1], 0)).toBeLessThan(1);
    expect(commandsQuality([1, 1, 1], 2)).toBeCloseTo(0.8);
    expect(commandsQuality([1, 1], 20)).toBe(0.4); // plancher : il a quand même fini
  });
  it('chaque séance a son mini-jeu enregistré', () => {
    for (const id of PROBLEM_IDS) expect(DOG_TRAINING_GAMES).toContain(PROBLEMS[id].game);
    for (const id of Object.keys(COACHINGS)) expect(DOG_TRAINING_GAMES).toContain(COACHINGS[id].game);
  });
});

describe('éducateur canin : quêtes, tutoriel et textes', () => {
  it('les quêtes du métier ont un guide, des étapes et des textes fr/en', () => {
    const ids = OBJECTIVES.filter((o) => o.id.startsWith('dt')).map((o) => o.id);
    expect(ids.length).toBeGreaterThanOrEqual(4);
    const hadDoc = 'document' in globalThis;
    if (!hadDoc) globalThis.document = { documentElement: {} }; // setLang touche <html lang>
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const id of ids.filter((x) => OBJECTIVES.find((o) => o.id === x).kind === 'quest')) {
        expect(QUEST_GUIDE[id], id).toBeTruthy();
        expect(QUEST_STEPS[id], id).toBeTruthy();
        expect(QUEST_ORDER).toContain(id);
        for (const s of QUEST_STEPS[id]) {
          expect(FOLLOW_STEPS[s], s).toBeTruthy();
          expect(t(`quest_step_${s}`), s).not.toBe(`quest_step_${s}`);
        }
        expect(t(`quest_hint_${id}`)).not.toBe(`quest_hint_${id}`);
        expect(t(`quest_where_${QUEST_GUIDE[id].where}`)).not.toBe(`quest_where_${QUEST_GUIDE[id].where}`);
      }
      for (const id of ids) expect(t(`o_${id}`)).not.toBe(`o_${id}`);
      for (const pid of PROBLEM_IDS) {
        for (const k of [`dt_problem_${pid}`, `dt_session_${pid}`, `dt_how_${pid}`, `dt_ask_${pid}`, `dt_more_${pid}`, `act_${PROBLEMS[pid].game}`]) expect(t(k), k).not.toBe(k);
      }
      for (const cid of Object.keys(COACHINGS)) expect(t(`dt_session_${cid}`)).not.toBe(`dt_session_${cid}`);
      for (const k of ['career_dogTrainer', 'careerd_dogTrainer', 'ca_offer_dogTrainer', ...RANKS.map((r) => `ca_perk_${r}_dogTrainer`)]) expect(t(k), k).not.toBe(k);
      for (const act of DOG_TRAINER_CAREER.actions) {
        for (const k of [`ca_dogTrainer_${act.id}`, `dt_tuto_${act.id}`, `dt_tuto_${act.id}_title`]) expect(t(k), k).not.toBe(k);
      }
      for (const c of Object.keys(COMMANDS)) {
        for (const k of [`dt_cmd_${c}`, `dt_mg_ask_${c}`]) expect(t(k), k).not.toBe(k);
      }
      for (const ph of ['walk', 'idle', 'pulling', 'waiting', 'reward', 'bad']) expect(t(`dt_walk_${ph}`)).not.toBe(`dt_walk_${ph}`);
    }
    setLang('fr');
    if (!hadDoc) delete globalThis.document;
  });
  it('les sauvegardes anciennes reçoivent les champs du métier', async () => {
    const { loadProfile, saveProfile } = await import('../src/sim/profile.js');
    const store = new Map();
    globalThis.localStorage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k), key: () => null, length: 0 };
    const p = createProfile('Old');
    delete p.careers;
    delete p.dogTrainer;
    saveProfile(p);
    const back = loadProfile(p.id);
    expect(back.careers.started).toEqual({});
    expect(back.dogTrainer).toMatchObject({ clients: [], history: [], tutored: {} });
    expect(reputationOf(back, 'dogTrainer')).toBe(50);
    expect(FIXED_BELOW).toBe(15);
    delete globalThis.localStorage;
  });
});

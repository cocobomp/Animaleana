// Les métiers réunis (fusion des branches) : un seul registre (src/sim/careers.js) pour le vétérinaire, la
// pension, le cavalier de concours, le handler de beauté, l'éducateur canin, le toiletteur et le guide de
// randonnée ; leurs textes FR et EN ; qui reçoit les visiteurs de src/sim/clients.js ; les migrations de
// profil qui s'additionnent ; un seul registre des séances et un seul « 👉 Montre-moi ».
import { describe, it, expect, beforeAll } from 'vitest';

const mem = new Map();
let i18n;
let careers;
let clients;
let profile;

beforeAll(async () => {
  globalThis.localStorage = globalThis.localStorage ?? {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  globalThis.window = globalThis.window ?? { addEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
  globalThis.document = globalThis.document ?? {
    addEventListener() {}, hidden: false, documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } }, getElementById: () => null, createElement: () => ({ getContext: () => null, style: {} }),
  };
  i18n = await import('../src/i18n.js');
  careers = await import('../src/sim/careers.js');
  clients = await import('../src/sim/clients.js');
  profile = await import('../src/sim/profile.js');
});

const ALL = ['vet', 'pension', 'rider', 'handler', 'dogTrainer', 'groomer', 'trailGuide'];

describe('un seul registre des métiers', () => {
  it('les sept métiers sont inscrits dans CAREERS, avec rangs, carnet et avantages', () => {
    const { CAREERS, CAREER_IDS, RANKS } = careers;
    expect(CAREER_IDS).toEqual(ALL);
    for (const id of ALL) {
      const def = CAREERS[id];
      expect(def.ranks).toHaveLength(RANKS.length);
      expect(def.ranks[1]).toBeGreaterThan(def.ranks[0]);
      expect(def.ranks[2]).toBeGreaterThan(def.ranks[1]);
      expect(def.perks).toHaveLength(RANKS.length);
      expect(new Set(def.actions.map((a) => a.id)).size).toBe(def.actions.length);
    }
  });

  it('chaque métier a tous ses textes, en français et en anglais, sans l\'ancien nom du jeu', () => {
    const { t, setLang } = i18n;
    const { CAREERS, RANKS } = careers;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const id of ALL) {
        const keys = [`career_${id}`, `careerd_${id}`, `ca_offer_${id}`, ...RANKS.map((r) => `ca_perk_${r}_${id}`), ...CAREERS[id].actions.map((a) => `ca_${id}_${a.id}`)];
        for (const k of keys) {
          const v = t(k);
          expect(v, `${lang} ${k}`).not.toBe(k);
          expect(v).not.toMatch(/Animadichelle/i);
        }
      }
    }
    setLang('fr');
    expect(t('title')).toBe('La ferme à Madichelle');
  });

  it('les pastilles d\'état repliées ont leurs textes', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      expect(t('statusMore', { n: 3 })).toMatch(/3/);
      expect(t('statusLess')).not.toBe('statusLess');
    }
    setLang('fr');
  });
});

describe('visiteurs de la pension et des soins', () => {
  it('le cavalier (aucun visiteur), l\'éducateur, le toiletteur et le guide (leurs propres clients) ne comptent pas', () => {
    const { CAREERS, startCareer } = careers;
    expect(CAREERS.rider.clients).toBe(false);
    for (const id of ['dogTrainer', 'groomer', 'trailGuide']) expect(CAREERS[id].ownClients).toBe(true);
    const p = profile.createProfile('Lou');
    for (const id of ['rider', 'dogTrainer', 'groomer', 'trailGuide']) expect(startCareer(p, id, 1, { level: 9 }).ok).toBe(true);
    expect(clients.maxClients(p)).toBe(0); // pas de NaN, pas de place de pension grâce à ces métiers
    expect(startCareer(p, 'handler', 1, { level: 9 }).ok).toBe(true);
    expect(clients.maxClients(p)).toBe(1); // le handler, lui, reçoit des animaux à préparer
    expect(startCareer(p, 'vet', 1, { level: 9 }).ok).toBe(true);
    expect(clients.maxClients(p)).toBe(1);
  });

  it('un chien en éducation n\'est pas un client de la pension', () => {
    expect(clients.isClientAnimal({ client: { kind: 'training' } })).toBe(false);
    expect(clients.isClientAnimal({ client: { kind: 'handler' } })).toBe(true);
  });
});

describe('profil : les migrations s\'additionnent', () => {
  it('une vieille sauvegarde reçoit concours, éducateur canin, salon, guide et la compétence de dressage', () => {
    const { createProfile, migrate } = profile;
    const old = JSON.parse(JSON.stringify(createProfile('Lou')));
    for (const k of ['competitions', 'dogTrainer', 'groomer', 'trailGuide']) delete old[k];
    old.animals.push({ id: 'h1', species: 'horse', name: 'Tornade', skills: { jump: 20, obedience: 30 }, needs: {}, look: {} });
    const p = migrate(old);
    expect(p.competitions).toMatchObject({ entries: [], results: [] });
    expect(p.dogTrainer).toBeTruthy();
    expect(p.groomer).toMatchObject({ clients: [], history: [] });
    expect(p.trailGuide).toBeTruthy();
    expect(p.animals.find((a) => a.id === 'h1').skills.dressage).toBe(10);
    expect(p.clients).toBeTruthy(); // les migrations de main restent
    expect(p.vetSchool).toBeTruthy();
  });
});

describe('un seul registre des séances et un seul « 👉 Montre-moi »', () => {
  let Game;
  beforeAll(async () => {
    ({ Game } = await import('../src/game/Game.js')); // charge aussi Dressage.js et Beauty.js
  }, 60000);

  it('le dressage et la beauté s\'inscrivent dans SESSION_TYPES d\'Activities.js', async () => {
    expect(Game).toBeTruthy();
    const { SESSION_TYPES } = await import('../src/game/Activities.js');
    for (const type of ['jumping', 'lesson', 'trail', 'agility', 'show', 'hop', 'flat', 'figures', 'dressage', 'beauty']) {
      expect(SESSION_TYPES[type]?.cls, type).toBeTypeOf('function');
      expect(SESSION_TYPES[type].stat).toBeTruthy();
    }
    expect(SESSION_TYPES.beauty.stat).toBe('actvBeauty');
  });

  it('cavalier, éducateur canin, salon et guide s\'inscrivent auprès de Clients ; showMe passe par eux', async () => {
    const { Clients } = await import('../src/game/Clients.js');
    const { CompetitionVenue } = await import('../src/game/CompetitionVenue.js');
    const { DogTrainer } = await import('../src/game/DogTrainer.js');
    const { Groomer } = await import('../src/game/Groomer.js');
    const { TrailGuide } = await import('../src/game/TrailGuide.js');
    const fake = { guides: {}, registerGuide: Clients.prototype.registerGuide };
    const game = { clients: fake, on() {}, profile: profile.createProfile('Lou') };
    for (const Cls of [CompetitionVenue, DogTrainer, Groomer, TrailGuide]) new Cls(game);
    expect(Object.keys(fake.guides).sort()).toEqual(['dogTrainer', 'groomer', 'rider', 'trailGuide']);
    const { CAREERS } = careers;
    const seen = [];
    const ctx = { game, guides: Object.fromEntries(Object.keys(fake.guides).map((id) => [id, (action) => seen.push(`${id}:${action}`)])) };
    for (const id of Object.keys(fake.guides)) Clients.prototype.showMe.call(ctx, id, CAREERS[id].actions[0].id);
    expect(seen).toEqual(Object.keys(fake.guides).map((id) => `${id}:${CAREERS[id].actions[0].id}`));
  });
});

describe('quêtes du journal : aucun texte brut', () => {
  it('chaque quête de QUEST_ORDER a son nom, son aide, son lieu et ses étapes, en français et en anglais', async () => {
    const { t, setLang } = i18n;
    const { QUEST_ORDER, QUEST_GUIDE, QUEST_STEPS, FOLLOW_STEPS } = await import('../src/sim/tutorial.js');
    // (sans animal ou sans cheval, la quête commence au refuge : ces textes-là aussi)
    const keys = new Set(['quest_hint_first_adopt', 'quest_hint_first_horse', 'quest_where_firstAdopt', 'quest_where_firstHorse',
      'quest_step_goRefuge', 'quest_step_waitOpen', 'quest_step_adoptFirst', 'quest_step_adoptHorse']);
    for (const id of QUEST_ORDER) {
      expect(QUEST_GUIDE[id], id).toBeTruthy();
      keys.add(`o_${id}`).add(`quest_hint_${id}`).add(`quest_where_${QUEST_GUIDE[id].where}`);
      for (const s of QUEST_STEPS[id] ?? []) {
        expect(FOLLOW_STEPS[s], `${id} → ${s}`).toBeTruthy();
        keys.add(`quest_step_${s}`);
      }
    }
    const missing = [];
    const frText = {};
    setLang('fr');
    for (const k of keys) {
      frText[k] = t(k, { n: 2 });
      if (frText[k] === k) missing.push(`fr ${k}`);
    }
    setLang('en');
    // (en anglais, t() retombe sur le français : un texte identique au français veut dire qu'il manque)
    for (const k of keys) {
      const v = t(k, { n: 2 });
      if (v === k || v === frText[k]) missing.push(`en ${k}`);
    }
    setLang('fr');
    expect(missing).toEqual([]);
  });

  it('« Tu as déjà un animal confié » au singulier (handler apprenti : un animal à la fois)', () => {
    const { t, setLang } = i18n;
    setLang('fr');
    expect(t('cl_full', { n: 1 })).toBe('Tu as déjà un animal confié. Finis d\'abord avec lui !');
    expect(t('cl_full', { n: 2 })).toMatch(/2 animaux/);
    setLang('en');
    expect(t('cl_full', { n: 1 })).toMatch(/an animal in your care/);
    setLang('fr');
  });
});

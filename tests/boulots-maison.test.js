// 🏡 Les petits boulots après la revue du chantier argent : les voisins sont à la maison (pas en voyage), rien n'est
// promis « aujourd'hui » quand il est trop tard, « demain dans le jeu », les mots de fête de Game.doJob, l'objectif
// « animal » qui garde son lieu, et une ancienne partie qui se charge toujours. Les règles des boulots ne changent pas.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './helpers/fakeDom.js';

let G; // src/game/Game.js
let PB; // src/sim/piggyBank.js
let i18n;
let profile; // src/sim/profile.js
let saveFile; // src/sim/saveFile.js
let panels; // src/ui/panels.js
let piggy; // src/ui/piggy.js
let CHALLENGE_REWARD;

beforeAll(async () => {
  installFakeDom();
  G = await import('../src/game/Game.js');
  PB = await import('../src/sim/piggyBank.js');
  i18n = await import('../src/i18n.js');
  profile = await import('../src/sim/profile.js');
  saveFile = await import('../src/sim/saveFile.js');
  panels = await import('../src/ui/panels.js');
  piggy = await import('../src/ui/piggy.js');
  ({ CHALLENGE_REWARD } = await import('../src/sim/horseChallenge.js'));
  i18n.setLang('fr');
}, 120000);

const job = (id) => G.JOBS.find((j) => j.id === id);

/** Un faux jeu pour Game.prototype.doJob : profil, jour, heure, à la maison ou non ; ui note tout dans log. */
function fakeGame({ home = true, hour = 10, day = 5, mode = 'manage', money = 100, p = null } = {}) {
  const prof = p ?? Object.assign(profile.createProfile('Lina', mode), { money });
  const log = [];
  const g = {
    profile: prof, day, hour, isHome: home,
    advanceTime(h) { this.hour += h; log.push(['time', h]); },
    ui: { toast: (m) => log.push(['toast', m]), celebrate: (o) => log.push(['celebrate', o]), refresh: () => log.push(['refresh']) },
  };
  return { g, p: prof, log, doJob: (id) => G.Game.prototype.doJob.call(g, job(id)) };
}
const said = (log) => log.filter(([k]) => k === 'toast').map(([, m]) => m);
const cheers = (log) => log.filter(([k]) => k === 'celebrate').map(([, o]) => o);

describe('📏 les règles des petits boulots ne changent pas', () => {
  it('JOBS, JOB_HOURS, série, journée complète, défi du cheval', () => {
    expect(G.JOBS.map((j) => [j.id, j.pay, j.hours])).toEqual([['walk', 25, 1], ['catsit', 30, 1.5], ['stable', 40, 2], ['hay', 35, 2]]);
    expect(G.JOB_HOURS).toEqual({ from: 8, to: 18 });
    expect(PB.JOB_STREAK).toEqual({ step: 5, max: 4 });
    expect(PB.FULL_DAY_BONUS).toBe(15);
    expect(CHALLENGE_REWARD.coins).toBe(30);
  });
  it('jobBlock : une fois par jour, entre 8 h et 18 h (fini avant 18 h), rien sur le lieu', () => {
    const p = { jobsToday: { day: 3, done: ['walk'] } };
    expect(G.jobBlock(p, job('walk'), 3, 10)).toBe('done');
    expect(G.jobBlock(p, job('walk'), 4, 10)).toBe(null);
    expect(G.jobBlock({}, job('walk'), 3, 7.5)).toBe('closed');
    expect(G.jobBlock({}, job('hay'), 3, 16.5)).toBe('closed');
    expect(G.jobBlock({}, job('hay'), 3, 16)).toBe(null);
    expect(G.jobBlock.length).toBe(4); // (profil, boulot, jour, heure : pas de lieu)
  });
});

describe('🏡 les voisins t\'attendent à la maison', () => {
  it('en voyage : pas de boulot (ni pièces, ni série, ni heure qui passe), juste la raison', () => {
    const { p, log, doJob } = fakeGame({ home: false });
    const before = JSON.stringify(p);
    doJob('walk');
    expect(said(log)).toEqual([i18n.t('job_why_away')]);
    expect(cheers(log)).toEqual([]);
    expect(log.some(([k]) => k === 'time')).toBe(false);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('à la maison : le boulot paie comme avant', () => {
    const { p, doJob } = fakeGame();
    doJob('walk');
    expect(p.money).toBe(125);
    expect(p.jobsToday).toEqual({ day: 5, done: ['walk'] });
  });
  it('le panneau des boulots, ouvert en voyage : cartes désactivées, avec la raison', () => {
    const { g } = fakeGame({ home: false });
    const ui = fakePanelUi(g);
    panels.openJobs(ui);
    const cards = ui.body().flatMap((n) => n.findAll?.('job-card') ?? []);
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.disabled).toBe(true);
      expect(c.textContent).toContain(i18n.t('job_why_away'));
    }
  });
  it('déjà fait aujourd\'hui, même en voyage : ✅', () => {
    const { g, p } = fakeGame({ home: false });
    p.jobsToday = { day: 5, done: ['walk'] };
    const ui = fakePanelUi(g);
    panels.openJobs(ui);
    const walk = ui.body().flatMap((n) => n.findAll?.('job-card') ?? []).find((c) => c.textContent.includes(i18n.t('job_walk')));
    expect(walk.textContent).toContain('✅');
  });
  it('Game.doJob : la garde du lieu vient avant jobBlock (qui ne change pas)', () => {
    const src = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('  doJob(job) {'), src.indexOf('  // ---------------------------------------------------------------- ferme'));
    expect(body.indexOf('if (!this.isHome)')).toBeGreaterThan(0);
    expect(body.indexOf('if (!this.isHome)')).toBeLessThan(body.indexOf('jobBlock('));
  });
});

/** Une fausse interface pour panels.openJobs : le panneau ouvert est dessiné tout de suite. */
function fakePanelUi(g) {
  let render = null;
  return {
    game: g,
    openPanel: (o) => { render = o.render; },
    body: () => render().filter(Boolean),
    closePanel() {}, openTack() {}, refreshPanel() {}, toast() {},
  };
}
const streakText = (ui) => ui.body().filter((n) => n.classList?.contains('streak')).map((n) => n.textContent).join(' ');

describe('🔥 rien n\'est promis « aujourd\'hui » quand il est trop tard', () => {
  it('jobsStillToday : encore un boulot possible ? la journée complète ?', () => {
    const four = G.JOBS;
    expect(G.jobsStillToday({}, four, 5, 10)).toEqual({ any: true, all: true }); // (1 + 1,5 + 2 + 2 = 6,5 h avant 18 h)
    expect(G.jobsStillToday({}, four, 5, 6)).toEqual({ any: true, all: true }); // (tôt : à partir de 8 h)
    expect(G.jobsStillToday({}, four, 5, 13)).toEqual({ any: true, all: false });
    expect(G.jobsStillToday({}, four, 5, 17.5)).toEqual({ any: false, all: false });
    const p = { jobsToday: { day: 5, done: ['walk', 'catsit', 'stable'] } };
    expect(G.jobsStillToday(p, four, 5, 16)).toEqual({ any: true, all: true }); // (le foin : 2 h, fini à 18 h)
    expect(G.jobsStillToday(p, four, 5, 16.5)).toEqual({ any: false, all: false });
    const allDone = { jobsToday: { day: 5, done: four.map((j) => j.id) } };
    expect(G.jobsStillToday(allDone, four, 5, 20)).toEqual({ any: false, all: true }); // (rien ne reste : déjà complète)
    expect(G.jobsStillToday(p, four, 6, 10)).toEqual({ any: true, all: true }); // (le lendemain : tout recommence)
  });
  it('17 h 30 avec une série d\'hier : pas de « ton premier boulot d\'aujourd\'hui », mais demain dans le jeu', () => {
    const { g, p } = fakeGame({ day: 10, hour: 17.5 });
    p.jobStreak = { day: 9, n: 3 };
    const ui = fakePanelUi(g);
    panels.openJobs(ui);
    const text = streakText(ui);
    expect(text).toContain(i18n.t('streak_late'));
    expect(text).not.toContain(i18n.t('streak_today', { n: 15 }));
    expect(text).toContain(i18n.t('job_fullLate'));
  });
  it('10 h avec une série d\'hier : le bonus d\'aujourd\'hui est bien promis', () => {
    const { g, p } = fakeGame({ day: 10, hour: 10 });
    p.jobStreak = { day: 9, n: 3 };
    const ui = fakePanelUi(g);
    panels.openJobs(ui);
    const text = streakText(ui);
    expect(text).toContain(i18n.t('streak_today', { n: 15 }));
    expect(text).toContain(i18n.t('job_fullHelp', { n: PB.FULL_DAY_BONUS, done: 0, total: G.availableJobs(p).length }));
  });
  it('« demain dans le jeu » (le temps du jeu ne passe que quand on joue)', () => {
    for (const [lang, word] of [['fr', 'dans le jeu'], ['en', 'in the game']]) {
      i18n.setLang(lang);
      for (const k of ['streak_tomorrow', 'streak_late', 'job_why_done', 'job_fullLate']) expect(i18n.t(k, { n: 10 }), `${lang} ${k}`).toContain(word);
    }
    i18n.setLang('fr');
    expect(i18n.t('streak_tomorrow', { n: 10 })).not.toMatch(/Reviens demain/);
  });
});

describe('🎉 les mots de fête des petits boulots (Game.doJob)', () => {
  it('« Bravo ! » : les messages d\'abord, la fête en dernier (« Tu as assez ! » reste visible)', () => {
    const { log, doJob } = fakeGame();
    doJob('walk');
    expect(log.at(-1)).toEqual(['celebrate', { word: i18n.t('cel_bravo'), big: false }]);
    const kinds = log.map(([k]) => k);
    expect(kinds.lastIndexOf('toast')).toBeLessThan(kinds.indexOf('celebrate'));
    expect(kinds).not.toContain('refresh'); // (celebrate rafraîchit l'écran : une seule fois)
  });
  it('paliers de la série (3, 5, 7, 14, 30 jours) au premier boulot du jour', () => {
    for (const n of [3, 5, 7, 14, 30]) {
      const { p, log, doJob } = fakeGame({ day: 50 });
      p.jobStreak = { day: 49, n: n - 1 };
      doJob('walk');
      expect(cheers(log)[0].word, `${n}`).toBe(i18n.t('cel_streak', { n }));
      expect(cheers(log)[0].word).toBe(`🔥 ${n} jours de suite !`);
    }
    for (const n of [2, 4, 6, 8]) { // (pas un palier : « Bravo ! »)
      const { p, log, doJob } = fakeGame({ day: 50 });
      p.jobStreak = { day: 49, n: n - 1 };
      doJob('walk');
      expect(cheers(log)[0].word).toBe(i18n.t('cel_bravo'));
    }
    const { p, log, doJob } = fakeGame({ day: 50 }); // (2e boulot du jour : plus de palier)
    p.jobStreak = { day: 50, n: 3 };
    p.jobsToday = { day: 50, done: ['stable'] };
    doJob('walk');
    expect(cheers(log)[0].word).toBe(i18n.t('cel_bravo'));
  });
  it('le dernier boulot du jour : « Journée complète ! » en grand (après ses messages)', () => {
    const { p, log, doJob } = fakeGame();
    p.jobsToday = { day: 5, done: ['walk', 'catsit', 'stable'] };
    doJob('hay');
    expect(cheers(log)).toEqual([{ word: i18n.t('cel_fullDay'), big: true }]);
    expect(said(log).at(-1)).toBe(i18n.t('job_fullGain', { n: PB.FULL_DAY_BONUS }));
    expect(p.money).toBe(100 + 35 + PB.FULL_DAY_BONUS);
  });
  it('bac à sable : le mot de fête, jamais de pièces', () => {
    const { p, log, doJob } = fakeGame({ mode: 'sandbox' });
    const money = p.money;
    doJob('walk');
    expect(p.money).toBe(money);
    expect(cheers(log)).toEqual([{ word: i18n.t('cel_bravo'), big: false }]);
  });
  it('jobCheer : un seul mot, le plus beau', () => {
    expect(PB.jobCheer({ full: 15, streak: 10, n: 3 })).toEqual({ key: 'cel_fullDay', big: true });
    expect(PB.jobCheer({ full: 0, streak: 10, n: 3 })).toEqual({ key: 'cel_streak', n: 3, big: false });
    expect(PB.jobCheer({ full: 0, streak: 0, n: 3 })).toEqual({ key: 'cel_bravo', big: false });
    expect(PB.jobCheer(undefined)).toEqual({ key: 'cel_bravo', big: false });
    expect(PB.STREAK_CHEERS).toEqual([3, 5, 7, 14, 30]);
  });
  it('Game.challengeTick fête « Défi réussi ! » après avoir payé ; goalDone « Objectif atteint ! »', () => {
    const src = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
    const tick = src.slice(src.indexOf('  challengeTick() {'), src.indexOf('  /**', src.indexOf('  challengeTick() {')));
    expect(tick.indexOf("celebrate?.({ word: t('cel_challenge') })")).toBeGreaterThan(tick.indexOf('earn(p, CHALLENGE_REWARD.coins)'));
    const done = src.slice(src.indexOf('  goalDone(bought, label) {'), src.indexOf('  train(a, trainingId) {'));
    expect(done).toContain("celebrate?.({ word: t('cel_goalDone'), big: true })");
  });
});

describe('🧭 l\'objectif « animal » choisi en voyage garde son lieu', () => {
  const kiso = { kind: 'animal', species: 'horse', breed: 'kiso', stage: 'young' };
  it('choisi au Japon : « en vente à l\'élevage : 🇯🇵 … »', () => {
    const p = profile.createProfile('Lina', 'manage');
    expect(PB.setGoal(p, { ...kiso, place: 'japon' })).toBe(true);
    expect(p.goal.place).toBe('japon');
    expect(PB.goalPlace(p)).toBe('japon');
    expect(piggy.goalPlaceLabel(p)).toBe('🇯🇵 Campagne de Kyoto');
    expect(i18n.t('goal_where', { place: piggy.goalPlaceLabel(p) })).toBe('En vente à l\'élevage : 🇯🇵 Campagne de Kyoto');
  });
  it('une race vendue à la maison : rien à dire ; un outil ou une selle : jamais de lieu', () => {
    const p = profile.createProfile('Lina', 'manage');
    PB.setGoal(p, { kind: 'animal', species: 'horse', breed: 'shetland', stage: 'young', place: 'japon' });
    expect(PB.goalPlace(p)).toBe(null);
    PB.setGoal(p, { kind: 'tool', id: 'hoofKit', place: 'japon' });
    expect(p.goal).toEqual({ kind: 'tool', id: 'hoofKit' });
    expect(PB.goalPlace(p)).toBe(null);
  });
  it('lecture tolérante : lieu inconnu ou absent (ancienne partie) → l\'origine de la race', () => {
    const p = profile.createProfile('Lina', 'manage');
    PB.setGoal(p, { ...kiso, place: 'lune' });
    expect(p.goal.place).toBe(undefined);
    expect(PB.goalPlace(p)).toBe('japon');
    p.goal = { ...kiso, place: 42 };
    expect(PB.goalPlace(p)).toBe('japon');
    expect(PB.goalPlace({ goal: null })).toBe(null);
    expect(PB.goalPlace(null)).toBe(null);
  });
  it('sameGoal ne dépend pas du lieu (le même Kiso, choisi ici ou là-bas)', () => {
    expect(PB.sameGoal({ ...kiso, place: 'japon' }, kiso)).toBe(true);
  });
  it('la carte de la tirelire dit où l\'acheter', () => {
    const { g, p } = fakeGame({ money: 10 });
    PB.setGoal(p, { ...kiso, place: 'japon' });
    const ui = fakePanelUi(g);
    panels.openJobs(ui);
    const card = ui.body().find((n) => n.classList?.contains('piggy-card'));
    expect(card.textContent).toContain('🇯🇵 Campagne de Kyoto');
  });
});

describe('💾 une ancienne partie (sans tirelire, série, boulots du jour ni lieu d\'objectif) se charge et marche', () => {
  function oldFile(edit) {
    const old = profile.createProfile('Ancienne', 'manage', 'maison');
    old.money = 300;
    delete old.goal;
    delete old.jobStreak;
    delete old.jobsToday;
    edit?.(old);
    return saveFile.serializeSave([old], { appVersion: '0.4.0' });
  }
  it('le fichier se relit, et les boulots paient comme avant', () => {
    const r = saveFile.parseSave(oldFile());
    expect(r.ok).toBe(true);
    const p = r.profiles[0];
    expect(saveFile.profileProblem(p)).toBe(null);
    expect(p.goal).toBe(null);
    expect(PB.goalPlace(p)).toBe(null);
    const { log, doJob } = fakeGame({ p });
    doJob('walk');
    expect(p.money).toBe(325);
    expect(p.jobStreak).toEqual({ day: 5, n: 1 });
    expect(cheers(log)).toEqual([{ word: i18n.t('cel_bravo'), big: false }]);
  });
  it('un objectif « animal » d\'avant (sans lieu) : le lieu vient de la race', () => {
    const r = saveFile.parseSave(oldFile((o) => { o.goal = { kind: 'animal', species: 'horse', breed: 'kiso', stage: 'young' }; }));
    expect(r.ok).toBe(true);
    const p = r.profiles[0];
    expect(PB.goalStatus(p)?.price).toBe(PB.goalPrice(p.goal));
    expect(PB.goalPlace(p)).toBe('japon');
  });
  it('la même partie avec un lieu d\'objectif se relit pareil (aller-retour)', () => {
    const p0 = profile.createProfile('Neuve', 'manage');
    PB.setGoal(p0, { kind: 'animal', species: 'horse', breed: 'kiso', stage: 'young', place: 'japon' });
    const r = saveFile.parseSave(saveFile.serializeSave([p0]));
    expect(r.ok).toBe(true);
    expect(r.profiles[0].goal).toEqual(p0.goal);
    expect(profile.migrate(JSON.parse(JSON.stringify(p0))).goal.place).toBe('japon');
  });
});

describe('🗣️ textes en français et en anglais', () => {
  const KEYS = ['job_why_away', 'job_fullLate', 'streak_late', 'goal_readyAway', 'goal_where', 'cel_bravo', 'cel_streak',
    'cel_fullDay', 'cel_challenge', 'cel_goalReady', 'cel_goalDone', 'streak_tomorrow', 'streak_help', 'job_why_done'];
  it('chaque texte existe, sans {trou}', () => {
    for (const lang of ['fr', 'en']) {
      i18n.setLang(lang);
      for (const k of KEYS) {
        const s = i18n.t(k, { n: 3, name: 'Kiso', place: '🇯🇵 Kyoto' });
        expect(s, `${lang} ${k}`).not.toBe(k);
        expect(s, `${lang} ${k}`).not.toMatch(/\{\w+\}/);
      }
    }
    i18n.setLang('fr');
  });
  it('typographie française : une espace avant « ! ? : », courts pour un enfant', () => {
    i18n.setLang('fr');
    for (const k of KEYS) {
      const s = i18n.t(k, { n: 3, name: 'Kiso', place: 'Kyoto' });
      expect(s, k).not.toMatch(/\S[!?:]/);
      expect(s.length, k).toBeLessThanOrEqual(100);
    }
    for (const k of KEYS.filter((x) => x.startsWith('cel_'))) expect(i18n.t(k, { n: 30 }).length, k).toBeLessThanOrEqual(24);
  });
});

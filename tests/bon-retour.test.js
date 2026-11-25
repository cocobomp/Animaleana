// ☀️ Bon retour (src/sim/piggyBank.js returnBonus, Game.welcomeBack) : la première ouverture de la partie un nouveau jour
// du CALENDRIER (un vrai jour), après l'histoire du début : +10 🪙 et « Bon retour ! ». Pas de série : rien ne se perd
// si on ne revient pas. Et une ancienne partie, sans aucun des nouveaux champs (wellDone, daily, lastVisit, ni tirelire),
// se charge et marche : la prime, les défis du jour, le bon retour. Les nouveautés et l'aide en parlent.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './helpers/fakeDom.js';

let PB; // src/sim/piggyBank.js
let G; // src/game/Game.js
let D; // src/sim/dailyChallenges.js
let profile;
let saveFile;
let createAnimal;
let i18n;
let help;

beforeAll(async () => {
  installFakeDom();
  PB = await import('../src/sim/piggyBank.js');
  G = await import('../src/game/Game.js');
  D = await import('../src/sim/dailyChallenges.js');
  profile = await import('../src/sim/profile.js');
  saveFile = await import('../src/sim/saveFile.js');
  ({ createAnimal } = await import('../src/sim/animal.js'));
  i18n = await import('../src/i18n.js');
  help = await import('../src/ui/help.js');
  i18n.setLang('fr');
}, 120000);

/** Une partie commencée hier (ou avant), l'histoire du début finie. */
function started(mode = 'manage', createdAt = new Date(2026, 10, 20, 10).getTime()) {
  const p = Object.assign(profile.createProfile('Lina', mode), { money: 100, createdAt });
  p.tutorial.done = true;
  return p;
}

describe('☀️ returnBonus (logique pure)', () => {
  it('un nouveau jour du calendrier : +10 🪙, une seule fois par date', () => {
    const p = started();
    expect(PB.RETURN_BONUS).toBe(10);
    expect(PB.returnBonus(p, '2026-11-25', '2026-11-20')).toEqual({ coins: 10, word: true });
    expect(p.lastVisit).toBe('2026-11-25');
    expect(PB.returnBonus(p, '2026-11-25', '2026-11-20')).toEqual({ coins: 0, word: false });
    expect(PB.returnBonus(p, '2026-11-26', '2026-11-20')).toEqual({ coins: 10, word: true });
  });
  it('la date du téléphone remise en arrière : rien, et la date notée ne recule pas (pas de +10 sans fin)', () => {
    const p = started();
    p.lastVisit = '2026-11-25';
    expect(PB.returnBonus(p, '2026-11-26', '2026-11-20')).toEqual({ coins: 10, word: true });
    expect(PB.returnBonus(p, '2026-11-25', '2026-11-20')).toEqual({ coins: 0, word: false });
    expect(p.lastVisit).toBe('2026-11-26');
    expect(PB.returnBonus(p, '2026-11-26', '2026-11-20')).toEqual({ coins: 0, word: false });
    expect(PB.returnBonus(p, '2025-01-01', '2024-06-01')).toEqual({ coins: 0, word: false });
    expect(p.lastVisit).toBe('2026-11-26');
    expect(PB.returnBonus(p, '2026-11-27', '2026-11-20')).toEqual({ coins: 10, word: true });
    // en tout, 2 vrais jours : +20, pas plus
    const q = started();
    q.lastVisit = '2026-11-25';
    let coins = 0;
    for (const d of ['2026-11-26', '2026-11-25', '2026-11-26', '2026-11-25', '2026-11-26', '2026-11-27']) coins += PB.returnBonus(q, d, '2026-11-20').coins;
    expect(coins).toBe(20);
  });
  it('Game.welcomeBack : la partie rouverte avec la date remise en arrière ne donne rien', () => {
    const p = started();
    const { log, welcomeBack } = fakeGame(p);
    welcomeBack(new Date(2026, 10, 26, 10).getTime());
    welcomeBack(new Date(2026, 10, 25, 10).getTime());
    welcomeBack(new Date(2026, 10, 26, 11).getTime());
    expect(p.money).toBe(110);
    expect(p.lastVisit).toBe('2026-11-26');
    expect(log).toHaveLength(2);
  });
  it('pas de série : 5 jours sautés, toujours +10 (rien ne se perd, rien ne grossit)', () => {
    const p = started();
    p.lastVisit = '2026-11-01';
    expect(PB.returnBonus(p, '2026-11-07', '2026-10-01').coins).toBe(10);
  });
  it('pendant l\'histoire du début : rien, mais la date est notée (pas de cadeau juste après, le même jour)', () => {
    const p = started();
    p.tutorial.done = false;
    expect(PB.returnBonus(p, '2026-11-25', '2026-11-20')).toEqual({ coins: 0, word: false });
    expect(p.lastVisit).toBe('2026-11-25');
    p.tutorial.done = true;
    expect(PB.returnBonus(p, '2026-11-25', '2026-11-20').word).toBe(false);
    expect(PB.returnBonus(p, '2026-11-26', '2026-11-20').coins).toBe(10);
  });
  it('une partie toute neuve, le jour de sa création : pas un retour', () => {
    const p = started();
    expect(PB.returnBonus(p, '2026-11-25', '2026-11-25')).toEqual({ coins: 0, word: false });
    expect(PB.returnBonus(p, '2026-11-26', '2026-11-25').coins).toBe(10);
  });
  it('bac à sable : le mot, jamais de pièces', () => {
    const p = started('sandbox');
    expect(PB.returnBonus(p, '2026-11-25', '2026-11-20')).toEqual({ coins: 0, word: true });
  });
  it('lecture tolérante : lastVisit absent ou abîmé (ancienne partie) → c\'est un retour ; date bizarre → rien', () => {
    for (const bad of [undefined, null, 3, {}, [], 'hier', '9999-99-99x', '']) {
      const p = started();
      p.lastVisit = bad;
      expect(PB.returnBonus(p, '2026-11-25', '2026-11-20').coins).toBe(10);
    }
    const p = started();
    expect(PB.returnBonus(p, '', '2026-11-20').word).toBe(false);
    expect(PB.returnBonus(p, undefined).word).toBe(false);
    expect(p.lastVisit).toBeUndefined();
  });
});

/** Un faux jeu pour Game.prototype.welcomeBack ; ui note tout dans log. */
function fakeGame(p) {
  const log = [];
  const g = {
    profile: p, saved: 0, save() { this.saved++; },
    ui: { toast: (m) => log.push(['toast', m]), celebrate: (o) => log.push(['celebrate', o]) },
  };
  return { g, log, welcomeBack: (now) => G.Game.prototype.welcomeBack.call(g, now) };
}

describe('☀️ Game.welcomeBack', () => {
  const at = (y, m, d, h = 18) => new Date(y, m - 1, d, h).getTime();
  it('un nouveau jour : +10 🪙, un message, « Bon retour ! » qui vole, la partie sauvegardée', () => {
    const p = started();
    const { g, log, welcomeBack } = fakeGame(p);
    welcomeBack(at(2026, 11, 25));
    expect(p.money).toBe(110);
    expect(p.lastVisit).toBe('2026-11-25');
    expect(log).toEqual([['toast', i18n.t('back_gift', { n: 10 })], ['celebrate', { word: i18n.t('cel_back') }]]);
    expect(p.stats.returns).toBe(1);
    expect(g.saved).toBe(1);
    // rouverte le même jour (même plus tard) : rien
    welcomeBack(at(2026, 11, 25, 23));
    expect(p.money).toBe(110);
    expect(log).toHaveLength(2);
  });
  it('bac à sable : « Bon retour ! » sans pièces', () => {
    const p = started('sandbox');
    const { log, welcomeBack } = fakeGame(p);
    welcomeBack(at(2026, 11, 25));
    expect(p.money).toBe(100);
    expect(log).toEqual([['toast', i18n.t('back_hello')], ['celebrate', { word: i18n.t('cel_back') }]]);
  });
  it('une partie créée aujourd\'hui : rien ; le lendemain : le cadeau', () => {
    const p = started('manage', at(2026, 11, 25, 9));
    const { log, welcomeBack } = fakeGame(p);
    welcomeBack(at(2026, 11, 25));
    expect(log).toEqual([]);
    welcomeBack(at(2026, 11, 26, 8));
    expect(p.money).toBe(110);
  });
  it('Game.start la lance un peu après l\'ouverture, une fois « Quoi de neuf ? » fermée, si la partie est toujours ouverte', () => {
    const src = readFileSync(new URL('../src/game/Game.js', import.meta.url), 'utf8');
    const start = src.slice(src.indexOf('  start(profile) {'), src.indexOf('  welcomeBack(now'));
    expect(start).toMatch(/if \(!this\.running \|\| this\.profile !== profile\) return;/);
    expect(start).toMatch(/if \(this\.ui\.isBlocking\?\.\(\) && tries > 0\) return void setTimeout\(\(\) => welcome\(tries - 1\), 1000\);/);
    expect(start).toMatch(/this\.welcomeBack\(\);/);
    expect(start).toMatch(/setTimeout\(welcome, 2500\);/);
  });
});

describe('💾 une ancienne partie, sans les nouveaux champs, se charge et marche', () => {
  function oldFile() {
    const old = profile.createProfile('Ancienne', 'manage', 'maison');
    old.money = 300;
    old.createdAt = new Date(2025, 5, 1).getTime();
    old.tutorial = { ...old.tutorial, done: true, step: null };
    old.stats = { water: 4, feed: 4, pet: 4, brush: 2 };
    old.animals.push(Object.assign(createAnimal({ species: 'dog', breed: 'labrador', sex: 'f', ageDays: 900, name: 'Rita' }), { location: 'maison' }));
    old.animals.push(Object.assign(createAnimal({ species: 'cat', sex: 'm', ageDays: 900, name: 'Tom' }), { location: 'maison' }));
    for (const k of ['goal', 'jobStreak', 'jobsToday', 'wellDone', 'daily', 'lastVisit', 'challenge']) delete old[k];
    return saveFile.serializeSave([old], { appVersion: '0.4.0' });
  }
  it('le fichier se relit (aucun champ de plus dans createProfile, rien à réparer)', () => {
    const r = saveFile.parseSave(oldFile());
    expect(r.ok).toBe(true);
    const p = r.profiles[0];
    expect(saveFile.profileProblem(p)).toBe(null);
    for (const k of ['wellDone', 'daily', 'lastVisit']) {
      expect(p[k], k).toBeUndefined();
      expect(profile.createProfile('x')[k], k).toBeUndefined();
    }
  });
  it('la prime, les défis du jour et le bon retour marchent ; ensuite, la partie se relit pareil', () => {
    const p = saveFile.parseSave(oldFile()).profiles[0];
    const log = [];
    const g = {
      profile: p, day: 5, hour: 9, isHome: true, save() {},
      ui: { toast: (m, ms, o) => log.push(['toast', m, o]), celebrate: (o) => log.push(['celebrate', o]), refresh() {} },
    };
    for (const m of ['wellDoneFor', 'wellDone', 'dailyCtx', 'dailyTick', 'welcomeBack']) g[m] = (...a) => G.Game.prototype[m].apply(g, a);
    // ⭐ la prime
    const wd = g.wellDoneFor('care:rita:feed', true);
    wd.stars = 3;
    g.wellDone(wd);
    expect(p.money).toBe(305);
    expect(p.wellDone).toEqual({ day: 5, coins: 5, keys: ['care:rita:feed'] });
    // 🎯 les défis du jour
    g.dailyTick();
    expect(p.daily.ids).toHaveLength(2);
    for (const id of p.daily.ids) { const c = D.dailyDef(id); p.stats[c.stat] = (p.stats[c.stat] ?? 0) + c.n; }
    g.dailyTick();
    expect(p.money).toBe(305 + 20 + D.chestCoins(5));
    // ☀️ bon retour (lastVisit absent : c'est une joueuse qui revient)
    g.welcomeBack(new Date(2026, 10, 25, 18).getTime());
    expect(p.money).toBe(305 + 20 + D.chestCoins(5) + 10);
    expect(p.lastVisit).toBe('2026-11-25');
    // et la partie, avec ses nouveaux champs, se relit pareil
    const again = saveFile.parseSave(saveFile.serializeSave([p]));
    expect(again.ok).toBe(true);
    const q = again.profiles[0];
    expect(saveFile.profileProblem(q)).toBe(null);
    for (const k of ['wellDone', 'daily', 'lastVisit']) expect(q[k], k).toEqual(p[k]);
    expect(profile.migrate(JSON.parse(JSON.stringify(p))).daily).toEqual(p.daily);
  });
});

describe('📣 le faire savoir : nouveautés, aide, README', () => {
  it('l\'aide « Gagner de l\'argent » parle de la tirelire, des primes, des défis et du coffre (autant d\'étapes en FR et en EN)', () => {
    const money = help.HELP?.find?.((x) => x.id === 'money') ?? help.searchHelp('tirelire')[0];
    expect(money.id).toBe('money');
    expect(money.steps.fr.length).toBe(money.steps.en.length);
    const fr = money.steps.fr.join(' ');
    for (const w of ['tirelire', '★★★ +5 🪙', 'défis', 'coffre surprise', '+10 🪙']) expect(fr).toContain(w);
    for (const w of ['piggy bank', '★★★ +5 🪙', 'challenges', 'surprise chest', '+10 🪙']) expect(money.steps.en.join(' ')).toContain(w);
    for (const q of ['le coffre surprise', 'défis du jour', 'ma tirelire', 'daily challenge chest']) expect(help.searchHelp(q)[0].id, q).toBe('money');
  });
  it('README (Contenu) : une phrase', () => {
    const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
    const contenu = readme.slice(readme.indexOf('## Contenu'), readme.indexOf('## Technique'));
    for (const w of ['tirelire', 'Bravo', 'défis du jour', 'coffre surprise']) expect(contenu).toContain(w);
  });
  it('textes du bon retour en FR et EN, sans {trou}, typographie française', () => {
    for (const lang of ['fr', 'en']) {
      i18n.setLang(lang);
      for (const [k, params] of [['cel_back', {}], ['back_gift', { n: 10 }], ['back_hello', {}]]) {
        const s = i18n.t(k, params);
        expect(s, `${lang} ${k}`).not.toBe(k);
        expect(s, `${lang} ${k}`).not.toMatch(/\{\w+\}/);
        if (lang === 'fr') expect(s, k).not.toMatch(/\S[!?:]/);
      }
    }
    i18n.setLang('fr');
  });
});

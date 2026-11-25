// ⭐ La prime du travail bien fait (src/sim/wellDone.js) : ★★★ +5 🪙, ★★ +2 🪙, ★ rien (jamais rien en moins), au plus
// 20 🪙 par jour de jeu (au bord du plafond, on paie le reste), une seule prime par (animal, soin) et par (corvée, box)
// chaque jour, seulement pour SES animaux, payée APRÈS le soin réussi, avec les étoiles de la carte de fin. Pas de prime
// pour les métiers, la tonte et la traite, seller, brider, le vermifuge, les soins automatiques ou groupés. La ligne
// « ⭐ Primes Bravo aujourd'hui » des petits boulots. Les règles des petits boulots ne changent pas.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { installFakeDom } from './helpers/fakeDom.js';

// (le mini-jeu pour de faux : il fait comme le cadre, qui écrit les étoiles de sa carte de fin dans opts.wellDone)
const mg = vi.hoisted(() => ({ result: 1, stars: 3, opts: null }));
vi.mock('../src/ui/minigames.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runMinigame: async (ui, a, action, opts = {}) => {
    mg.opts = opts;
    if (mg.result !== null && opts.wellDone && mg.stars !== null) opts.wellDone.stars = mg.stars;
    return mg.result;
  },
}));

let WD; // src/sim/wellDone.js
let G; // src/game/Game.js
let UI; // src/ui/UI.js
let Interiors;
let facilities;
let profile;
let panels;
let i18n;
let piggyBank;
let CHALLENGE_REWARD;

beforeAll(async () => {
  installFakeDom();
  WD = await import('../src/sim/wellDone.js');
  G = await import('../src/game/Game.js');
  ({ UI } = await import('../src/ui/UI.js'));
  ({ Interiors } = await import('../src/game/Interiors.js'));
  facilities = await import('../src/sim/facilities.js');
  profile = await import('../src/sim/profile.js');
  panels = await import('../src/ui/panels.js');
  i18n = await import('../src/i18n.js');
  piggyBank = await import('../src/sim/piggyBank.js');
  ({ CHALLENGE_REWARD } = await import('../src/sim/horseChallenge.js'));
  i18n.setLang('fr');
}, 120000);

const manage = (money = 100) => Object.assign(profile.createProfile('Lina', 'manage'), { money });
const prime = (p, stars, key, { own = true, day = 5 } = {}) => WD.recordWellDone(p, { stars, key, own, day });

describe('⭐ le barème et le plafond (logique pure)', () => {
  it('★★★ +5, ★★ +2, ★ 0 ; une valeur bizarre : 0', () => {
    expect(WD.WELL_DONE).toEqual({ pay: [0, 0, 2, 5], perDay: 20 });
    expect([0, 1, 2, 3].map(WD.wellDonePay)).toEqual([0, 0, 2, 5]);
    for (const x of [undefined, null, NaN, 4, -1, 2.5, '3']) expect(WD.wellDonePay(x)).toBe(0);
  });
  it('au plus 20 🪙 par jour de jeu ; au bord du plafond, on paie le reste ; le lendemain, tout recommence', () => {
    const p = manage();
    expect([1, 2, 3, 4].map((i) => prime(p, 3, `care:a${i}:feed`).coins)).toEqual([5, 5, 5, 5]);
    const r = prime(p, 3, 'care:a5:feed');
    expect(r).toEqual({ coins: 0, n: 0, capped: true, again: false });
    expect(p.wellDone.coins).toBe(20);
    // (18 déjà gagnés : ★★★ donne +2)
    const q = manage();
    q.wellDone = { day: 5, coins: 18, keys: [] };
    expect(prime(q, 3, 'care:x:brush').coins).toBe(2);
    expect(prime(q, 2, 'care:y:brush').coins).toBe(0);
    // un nouveau jour de jeu
    expect(prime(p, 3, 'care:a1:feed', { day: 6 }).coins).toBe(5);
    expect(p.wellDone).toEqual({ day: 6, coins: 5, keys: ['care:a1:feed'] });
  });
  it('une seule prime par (animal, soin) et par (corvée, box) chaque jour', () => {
    const p = manage();
    expect(prime(p, 3, WD.careKey({ id: 'pomme' }, 'treat')).coins).toBe(5);
    expect(prime(p, 3, WD.careKey({ id: 'pomme' }, 'treat'))).toMatchObject({ coins: 0, again: true });
    expect(prime(p, 2, WD.careKey({ id: 'pomme' }, 'brush')).coins).toBe(2); // (un autre soin)
    expect(prime(p, 3, WD.careKey({ id: 'caramel' }, 'treat')).coins).toBe(5); // (un autre animal)
    expect(prime(p, 3, WD.choreKey('muck', 0, 'maison')).coins).toBe(5);
    expect(prime(p, 3, WD.choreKey('muck', 0, 'maison')).coins).toBe(0);
    expect(prime(p, 3, WD.choreKey('muck', 1, 'maison')).coins).toBe(3); // (un autre box ; plafond : le reste)
  });
  it('★ ne note rien : on peut réessayer pour ★★★ (rien n\'est perdu)', () => {
    const p = manage();
    expect(prime(p, 1, 'care:a:feed')).toEqual({ coins: 0, n: 0, capped: false, again: false });
    expect(p.wellDone).toBeUndefined();
    expect(prime(p, 3, 'care:a:feed').coins).toBe(5);
  });
  it('pas tes animaux (animal confié, client, chien en éducation) : rien', () => {
    const p = manage();
    expect(prime(p, 3, 'care:client:feed', { own: false })).toMatchObject({ coins: 0, n: 0 });
    expect(p.wellDone).toBeUndefined();
  });
  it('bac à sable : jamais de pièces, mais le mot de fête (n) ; le plafond compte pareil', () => {
    const p = profile.createProfile('Lina', 'sandbox');
    const r = prime(p, 3, 'care:a:feed');
    expect(r.coins).toBe(0);
    expect(r.n).toBe(5);
  });
  it('wellDonePreview ne change rien', () => {
    const p = manage();
    p.wellDone = { day: 5, coins: 7, keys: ['care:a:feed'] };
    const before = JSON.stringify(p);
    expect(WD.wellDonePreview(p, { stars: 3, key: 'care:b:feed', own: true, day: 5 }).coins).toBe(5);
    expect(WD.wellDonePreview(p, { stars: 3, key: 'care:a:feed', own: true, day: 5 }).coins).toBe(0);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('lecture tolérante : wellDone absent, abîmé ou d\'un autre jour → un jour tout neuf', () => {
    for (const bad of [undefined, null, 'x', 3, [], { day: 5, coins: 'a', keys: 'b' }, { day: 5, coins: NaN, keys: [1, 'k'] }]) {
      const p = manage();
      p.wellDone = bad;
      expect(WD.wellDoneToday(p, 5).coins).toBe(0);
      expect(prime(p, 3, 'care:a:feed').coins).toBe(5);
      expect(p.wellDone.day).toBe(5);
      expect(Array.isArray(p.wellDone.keys)).toBe(true);
    }
  });
  it('« pas plus facile » : 30 soins ★★★ différents dans la journée rapportent 20 🪙 en tout', () => {
    const p = manage();
    let sum = 0;
    for (let i = 0; i < 30; i++) sum += prime(p, 3, `care:a${i}:pet`).coins;
    expect(sum).toBe(20);
  });
});

/** Un faux jeu pour Game.prototype.wellDone / wellDoneFor ; ui note tout dans log. */
function fakeGame({ mode = 'manage', money = 100, day = 5, p = null } = {}) {
  const prof = p ?? Object.assign(profile.createProfile('Lina', mode), { money });
  const log = [];
  const g = {
    profile: prof, day,
    ui: { toast: (m) => log.push(['toast', m]), celebrate: (o) => log.push(['celebrate', o]), refresh: () => log.push(['refresh']) },
  };
  g.wellDoneFor = (key, own) => G.Game.prototype.wellDoneFor.call(g, key, own);
  g.wellDone = (wd) => G.Game.prototype.wellDone.call(g, wd);
  return { g, p: prof, log };
}
const cheers = (log) => log.filter(([k]) => k === 'celebrate').map(([, o]) => o);

describe('⭐ Game.wellDone : payée après, avec « Bravo ! » qui vole', () => {
  it('★★★ : +5 🪙, « Bravo ! », stats wellDone et wellDone3', () => {
    const { g, p, log } = fakeGame();
    const wd = g.wellDoneFor('care:a:feed', true);
    wd.stars = 3;
    expect(g.wellDone(wd).coins).toBe(5);
    expect(p.money).toBe(105);
    expect(cheers(log)).toEqual([{ word: i18n.t('cel_bravo') }]);
    expect(p.stats).toMatchObject({ wellDone: 1, wellDone3: 1 });
  });
  it('★★ : +2 🪙 et « Bien joué ! » ; ★ : rien, ni mot ni pièce (et rien en moins)', () => {
    const { g, p, log } = fakeGame();
    const wd = g.wellDoneFor('care:a:brush', true);
    wd.stars = 2;
    g.wellDone(wd);
    expect(p.money).toBe(102);
    expect(cheers(log)).toEqual([{ word: i18n.t('cel_wellDone') }]);
    const w1 = g.wellDoneFor('care:b:brush', true);
    w1.stars = 1;
    g.wellDone(w1);
    expect(p.money).toBe(102);
    expect(cheers(log)).toHaveLength(1);
    expect(p.stats.wellDone3 ?? 0).toBe(0);
  });
  it('pas de mini-jeu (pas d\'étoiles) : rien du tout', () => {
    const { g, p, log } = fakeGame();
    const before = JSON.stringify(p);
    expect(g.wellDone(g.wellDoneFor('care:a:feed', true))).toBe(null);
    expect(g.wellDone(null)).toBe(null);
    expect(JSON.stringify(p)).toBe(before);
    expect(log).toEqual([]);
  });
  it('plafond atteint ou déjà eue : pas de pièces ni de mot (la carte a déjà dit « Bravo ! »)', () => {
    const { g, p, log } = fakeGame();
    p.wellDone = { day: 5, coins: 20, keys: [] };
    const wd = g.wellDoneFor('care:a:feed', true);
    wd.stars = 3;
    g.wellDone(wd);
    expect(p.money).toBe(100);
    expect(cheers(log)).toEqual([]);
    expect(p.stats.wellDone3).toBe(1); // (la statistique compte quand même : le défi « 2 soins ★★★ »)
  });
  it('l\'animal d\'un client : ni pièces, ni mot, ni statistique', () => {
    const { g, p, log } = fakeGame();
    const wd = g.wellDoneFor('care:client:feed', false);
    wd.stars = 3;
    g.wellDone(wd);
    expect(p.money).toBe(100);
    expect(log).toEqual([]);
    expect(p.stats.wellDone ?? 0).toBe(0);
  });
  it('bac à sable : le mot de fête, jamais de pièces', () => {
    const { g, p, log } = fakeGame({ mode: 'sandbox' });
    const wd = g.wellDoneFor('care:a:feed', true);
    wd.stars = 3;
    expect(g.wellDone(wd).coins).toBe(0);
    expect(p.money).toBe(100);
    expect(cheers(log)).toEqual([{ word: i18n.t('cel_bravo') }]);
  });
  it('wellDoneFor.preview : ce que dira la pastille, sans rien changer', () => {
    const { g, p } = fakeGame();
    const wd = g.wellDoneFor('care:a:feed', true);
    const before = JSON.stringify(p);
    expect(wd.preview(3).coins).toBe(5);
    expect(wd.preview(2).coins).toBe(2);
    expect(wd.preview(1).coins).toBe(0);
    expect(g.wellDoneFor('care:c:feed', false).preview(3).coins).toBe(0);
    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('🩺 UI.careWithGame : seulement tes animaux, payée APRÈS le soin réussi', () => {
  function careUi({ ok = true, mode = 'manage' } = {}) {
    const { g, p, log } = fakeGame({ mode });
    const cared = [];
    Object.assign(g, {
      blockedByPause: () => false,
      canCare: () => ({ ok: true }),
      care: (a, act, q) => { cared.push([act, q]); log.push(['care']); return ok ? { ok: true, quality: q } : null; },
    });
    return { g, p, log, cared, ui: { game: g, toast: (m) => log.push(['toast', m]) } };
  }
  const mine = { id: 'pomme', name: 'Pomme', species: 'horse', sex: 'f' };

  it('★★★ sur ton animal : le soin, puis +5 🪙 et « Bravo ! » (dans cet ordre)', async () => {
    const { p, log, ui } = careUi();
    Object.assign(mg, { result: 1, stars: 3 });
    await UI.prototype.careWithGame.call(ui, mine, 'feed');
    expect(mg.opts.wellDone).toMatchObject({ key: 'care:pomme:feed', own: true, stars: 3 });
    expect(p.money).toBe(105);
    expect(log.map(([k]) => k)).toEqual(['care', 'celebrate']);
  });
  it('fermé avec ✕ : ni soin, ni prime', async () => {
    const { p, log, cared, ui } = careUi();
    Object.assign(mg, { result: null, stars: 3 });
    expect(await UI.prototype.careWithGame.call(ui, mine, 'feed')).toBe(null);
    expect(cared).toEqual([]);
    expect(p.money).toBe(100);
    expect(log).toEqual([]);
  });
  it('le soin n\'a pas marché (done?.ok faux) : pas de prime', async () => {
    const { p, ui } = careUi({ ok: false });
    Object.assign(mg, { result: 1, stars: 3 });
    await UI.prototype.careWithGame.call(ui, mine, 'feed');
    expect(p.money).toBe(100);
  });
  it('un soin sans mini-jeu (pas d\'étoiles) : pas de prime', async () => {
    const { p, ui } = careUi();
    Object.assign(mg, { result: 1, stars: null });
    await UI.prototype.careWithGame.call(ui, mine, 'feed');
    expect(p.money).toBe(100);
  });
  it('animal confié (client), invité du salon, chien en éducation : pas de prime', async () => {
    for (const a of [{ ...mine, id: 'c1', client: { kind: 'boarding' } }, { ...mine, id: 'c2', guest: true }, { ...mine, id: 'c3', species: 'dog', client: { kind: 'training' } }]) {
      const { p, log, ui } = careUi();
      Object.assign(mg, { result: 1, stars: 3 });
      await UI.prototype.careWithGame.call(ui, a, 'feed');
      expect(mg.opts.wellDone.own).toBe(false);
      expect(p.money).toBe(100);
      expect(log.filter(([k]) => k === 'celebrate')).toEqual([]);
    }
  });
  it('le même soin sur le même animal, deux fois le même jour : une seule prime', async () => {
    const { p, ui } = careUi();
    Object.assign(mg, { result: 1, stars: 3 });
    await UI.prototype.careWithGame.call(ui, mine, 'treat');
    await UI.prototype.careWithGame.call(ui, mine, 'treat');
    expect(p.money).toBe(105);
  });
});

describe('🧹 Interiors.chore : une prime par corvée et par box, après la corvée réussie', () => {
  function choreThis({ quality = 1, stars = 3 } = {}) {
    const { g, p, log } = fakeGame();
    facilities.ensureFacilities(p).house.rooms.kitchen = 40;
    Object.assign(g, {
      xp() {},
      ui: { ...g.ui, choreWithGame: async (kind, target, wd) => { if (wd && stars !== null) wd.stars = stars; log.push(['chore', kind, wd]); return quality; } },
    });
    const self = { game: g, spots: [], sparkle() {}, refreshVisuals() {} };
    return { p, log, run: (kind = 'kitchen') => Interiors.prototype.chore.call(self, kind) };
  }
  it('la vaisselle ★★★ : la corvée, puis +5 🪙 ; refaite (salie de nouveau) le même jour : plus de prime', async () => {
    const { p, log, run } = choreThis();
    const r = await run();
    expect(r.ok).toBe(true);
    expect(log.find(([k]) => k === 'chore')[2]).toMatchObject({ key: 'chore:kitchen::maison', own: true, stars: 3 });
    expect(p.money).toBe(105);
    expect(p.stats).toMatchObject({ chores: 1, wellDone3: 1 });
    facilities.ensureFacilities(p).house.rooms.kitchen = 40;
    await run();
    expect(p.money).toBe(105);
  });
  it('abandonnée (✕) : rien', async () => {
    const { p, run } = choreThis({ quality: null });
    expect(await run()).toBe(null);
    expect(p.money).toBe(100);
  });
  it('déjà propre : pas de mini-jeu, pas de prime', async () => {
    const { p, log, run } = choreThis();
    facilities.ensureFacilities(p).house.rooms.kitchen = 100;
    await run();
    expect(log.filter(([k]) => k === 'chore')).toEqual([]);
    expect(p.money).toBe(100);
  });
});

describe('🚫 pas de prime ailleurs : seuls careWithGame et Interiors.chore la donnent', () => {
  // (le code seul, sans les commentaires ; \bwellDone : pas « mg_wellDone », le texte « Bien joué ! » des métiers)
  const src = (f) => readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const body = (s, start, end) => s.slice(s.indexOf(start), s.indexOf(end, s.indexOf(start) + start.length));
  it('métiers, beauté directe, seller, brider, vermifuge, tonte et traite, soins groupés ou automatiques', () => {
    for (const f of ['ui/groomer.js', 'ui/dogTrainer.js', 'ui/vet.js', 'ui/vetSchool.js', 'game/TrailGuide.js', 'game/Groomer.js', 'game/DogTrainer.js']) {
      expect(src(f), f).not.toMatch(/\bwellDone/);
    }
    const ui = src('ui/UI.js');
    for (const m of ['async saddleWithGame(', 'async dewormWithGame(', 'async collectWithGame(', 'async groupCareWithGame(']) {
      expect(body(ui, m, '\n  }\n'), m).not.toMatch(/\bwellDone/);
    }
    const game = src('game/Game.js');
    expect(body(game, '  groupCare(filter', '\n  }\n')).not.toMatch(/\bwellDone/);
    expect(body(game, '  autoCare(a, action)', '\n  }\n')).not.toMatch(/\bwellDone/);
    // (la préparation au concours de TON animal : bain et brossage passent par careWithGame, ce sont de vrais soins ;
    // tresses, lustrage, nœud : runMinigame direct, sans prime)
    const prep = body(src('ui/beauty.js'), 'export async function doPrep(', '\n}\n');
    expect(prep).toMatch(/ui\.careWithGame\(a, item\)/);
    expect(prep).not.toMatch(/\bwellDone/);
  });
  it('les étoiles viennent du cadre (showEnd : starsFor), jamais recalculées', () => {
    const mgSrc = src('ui/minigames.js');
    const showEnd = body(mgSrc, 'function showEnd(', 'const toLocal = (e)');
    expect(showEnd.length).toBeLessThan(4000);
    expect(showEnd).toMatch(/const stars = starsFor\(quality, endVerdict\)/);
    expect(showEnd).toMatch(/if \(wd\) wd\.stars = stars;/);
    expect(src('sim/wellDone.js')).not.toMatch(/starsFor|quality/);
    expect(body(src('game/Game.js'), '  wellDone(wd) {', '\n  }\n')).not.toMatch(/starsFor|quality/);
  });
});

describe('📋 la ligne « ⭐ Primes Bravo aujourd\'hui » des petits boulots', () => {
  function panelText(p, day = 5) {
    let render = null;
    const g = { profile: p, day, hour: 10, isHome: true };
    const ui = { game: g, openPanel: (o) => { render = o.render; }, closePanel() {}, openTack() {}, refreshPanel() {}, toast() {} };
    panels.openJobs(ui);
    return render().filter(Boolean);
  }
  const line = (nodes) => nodes.find((n) => n.classList?.contains('wd-line'))?.textContent ?? null;
  it('« 10/20 🪙 », le barème ; au plafond, « la suite demain » ; un autre jour : 0/20', () => {
    const p = manage();
    p.wellDone = { day: 5, coins: 10, keys: [] };
    expect(line(panelText(p))).toBe(`${i18n.t('wd_today', { n: 10, max: 20 })} ${i18n.t('wd_help', { a: 5, b: 2 })}`);
    expect(line(panelText(p))).toContain('10/20 🪙');
    p.wellDone.coins = 20;
    expect(line(panelText(p))).toContain(i18n.t('wd_full'));
    expect(line(panelText(p, 6))).toContain('0/20 🪙');
  });
  it('bac à sable : pas de ligne (pas de pièces) ; ancienne partie sans wellDone : 0/20', () => {
    expect(line(panelText(profile.createProfile('Lina', 'sandbox')))).toBe(null);
    const p = manage();
    delete p.wellDone;
    expect(line(panelText(p))).toContain('0/20 🪙');
  });
});

describe('📏 les règles des petits boulots ne changent pas', () => {
  it('JOBS, JOB_HOURS, jobBlock, série, journée complète, défi du cheval', () => {
    expect(G.JOBS.map((j) => [j.id, j.pay, j.hours])).toEqual([['walk', 25, 1], ['catsit', 30, 1.5], ['stable', 40, 2], ['hay', 35, 2]]);
    expect(G.JOB_HOURS).toEqual({ from: 8, to: 18 });
    expect(G.jobBlock.length).toBe(4);
    expect(piggyBank.JOB_STREAK).toEqual({ step: 5, max: 4 });
    expect(piggyBank.FULL_DAY_BONUS).toBe(15);
    expect(CHALLENGE_REWARD.coins).toBe(30);
  });
});

describe('🗣️ textes en français et en anglais', () => {
  const KEYS = [['cel_wellDone', {}], ['wd_today', { n: 10, max: 20 }], ['wd_help', { a: 5, b: 2 }], ['wd_full', {}]];
  it('chaque texte existe, sans {trou}, court, avec l\'espace avant « ! ? : » en français', () => {
    for (const lang of ['fr', 'en']) {
      i18n.setLang(lang);
      for (const [k, params] of KEYS) {
        const s = i18n.t(k, params);
        expect(s, `${lang} ${k}`).not.toBe(k);
        expect(s, `${lang} ${k}`).not.toMatch(/\{\w+\}/);
        expect(s.length, `${lang} ${k}`).toBeLessThan(80);
        if (lang === 'fr') expect(s, k).not.toMatch(/[^\s★][!?:]/);
      }
    }
    i18n.setLang('fr');
    expect(i18n.t('cel_wellDone')).toBe('Bien joué !');
  });
});

// 🎯 Les défis du jour de la ferme, pour tous (src/sim/dailyChallenges.js) : 2 défis par jour de jeu après l'histoire du
// début, tirés parmi ce que l'enfant sait déjà faire là où il est, jamais sur la même chose que le défi du cheval du
// jour ; +10 🪙 chacun ; les 2 faits, le 🎁 coffre surprise s'ouvre tout de suite, en grand (10 à 30 🪙 selon le jour,
// 30 : le coffre doré). Le défi du cheval reste à part (+30 🪙). Une seule annonce le matin. La carte « 🎯 Défis du
// jour » des petits boulots, en lecture seule. Bac à sable : les défis et la fête, sans pièces.
import { describe, it, expect, beforeAll } from 'vitest';
import { installFakeDom } from './helpers/fakeDom.js';

let D; // src/sim/dailyChallenges.js
let G; // src/game/Game.js
let HC; // src/sim/horseChallenge.js
let profile;
let createAnimal;
let panels;
let i18n;

beforeAll(async () => {
  installFakeDom();
  D = await import('../src/sim/dailyChallenges.js');
  G = await import('../src/game/Game.js');
  HC = await import('../src/sim/horseChallenge.js');
  profile = await import('../src/sim/profile.js');
  ({ createAnimal } = await import('../src/sim/animal.js'));
  panels = await import('../src/ui/panels.js');
  i18n = await import('../src/i18n.js');
  i18n.setLang('fr');
}, 120000);

const ALL = new Set(['feed', 'water', 'brush', 'pet', 'treat']);
const ctxAll = { hour: 9, home: true, mine: 2, can: ALL, jobsLeft: 4 };
/** Une partie qui a déjà tout fait une fois (sauf avis contraire). */
function played(stats = { water: 1, feed: 1, brush: 1, pet: 1, chores: 1, jobs: 1, wellDone3: 1 }, mode = 'manage') {
  const p = Object.assign(profile.createProfile('Lina', mode), { money: 100 });
  p.stats = { ...stats };
  p.tutorial.done = true; // (l'histoire du début est finie)
  return p;
}
const ids = (list) => list.map((c) => c.id).sort();

describe('🎯 ce qui peut être tiré (ce que tu sais faire, là où tu es)', () => {
  it('ce que tu as déjà fait, avec ce qui est possible ici', () => {
    expect(ids(D.readyDaily(played(), ctxAll))).toEqual(['brush2', 'care5', 'chore1', 'feed2', 'job2', 'pet3', 'stars2', 'water3']);
    // jamais fait : pas de défi (sauf « 5 soins »)
    expect(ids(D.readyDaily(played({}), ctxAll))).toEqual(['care5']);
  });
  it('loin de la maison : ni corvée ni boulots ; l\'après-midi (14 h) ou plus assez de boulots : pas « 2 boulots »', () => {
    expect(ids(D.readyDaily(played(), { ...ctxAll, home: false }))).not.toContain('chore1');
    expect(ids(D.readyDaily(played(), { ...ctxAll, home: false }))).not.toContain('job2');
    expect(ids(D.readyDaily(played(), { ...ctxAll, hour: 14 }))).not.toContain('job2');
    expect(ids(D.readyDaily(played(), { ...ctxAll, hour: 13.5 }))).toContain('job2');
    expect(ids(D.readyDaily(played(), { ...ctxAll, jobsLeft: 1 }))).not.toContain('job2');
  });
  it('pas d\'animal ici (ou le soin impossible) : pas de défi de soin ; « 5 soins » demande 2 animaux', () => {
    const none = ids(D.readyDaily(played(), { hour: 9, home: true, mine: 0, can: new Set(), jobsLeft: 4 }));
    expect(none).toEqual(['chore1', 'job2', 'stars2']);
    expect(ids(D.readyDaily(played(), { ...ctxAll, can: new Set(['feed', 'pet']) }))).not.toContain('water3');
    expect(ids(D.readyDaily(played(), { ...ctxAll, mine: 1 }))).not.toContain('care5');
  });
  it('jamais la même chose que le défi du cheval du jour (caresser, brosser)', () => {
    expect(ids(D.readyDaily(played(), ctxAll, 'horse_pet'))).not.toContain('pet3');
    expect(ids(D.readyDaily(played(), ctxAll, 'horse_brush'))).not.toContain('brush2');
    expect(ids(D.readyDaily(played(), ctxAll, 'rides'))).toHaveLength(8);
    // (aucun défi de la ferme ne compte la même statistique qu'un défi du cheval, à « horse_ » près, sans être écarté)
    for (const h of HC.CHALLENGES) {
      for (const c of D.readyDaily(played(), ctxAll, h.stat)) expect([c.stat, `horse_${c.stat}`]).not.toContain(h.stat);
    }
  });
});

describe('🎲 le tirage', () => {
  it('2 défis différents, toujours les mêmes pour cette partie et ce jour', () => {
    const p = played();
    const a = D.pickDaily(p, 12, ctxAll);
    expect(a).toHaveLength(2);
    expect(a[0].id).not.toBe(a[1].id);
    expect(ids(D.pickDaily(p, 12, ctxAll))).toEqual(ids(a));
  });
  it('jamais la paire d\'hier quand il y a le choix (40 jours de suite)', () => {
    const p = played();
    let prev = null;
    for (let day = 1; day <= 40; day++) {
      const d = D.todayDaily(p, day, ctxAll);
      if (prev) for (const x of d.list) expect(prev).not.toContain(x.def.id); // (8 possibles : les 2 sont nouveaux)
      prev = d.list.map((x) => x.def.id);
    }
  });
  it('seulement un défi possible : un seul ; aucun : rien (on réessaiera), et rien n\'est écrit', () => {
    const p = played({ chores: 1 });
    const one = D.todayDaily(p, 3, { hour: 16, home: true, mine: 0, can: new Set() });
    expect(one.list.map((x) => x.def.id)).toEqual(['chore1']);
    const q = played({});
    expect(D.todayDaily(q, 3, { hour: 16, home: false, mine: 0, can: new Set() })).toBe(null);
    expect(q.daily).toBeUndefined();
  });
});

describe('✅ la progression, les pièces et le coffre', () => {
  it('ce qui est fait avant le tirage ne compte pas ; chaque défi n\'est fêté qu\'une fois', () => {
    const p = played({ water: 7, feed: 3, pet: 1, brush: 1 });
    const ctx = { hour: 9, home: false, mine: 1, can: new Set(['water', 'feed']) };
    const d = D.todayDaily(p, 5, ctx);
    expect(d.fresh).toBe(true);
    expect(ids(d.list.map((x) => x.def))).toEqual(['feed2', 'water3']);
    expect(p.daily.base).toEqual({ water3: 7, feed2: 3 });
    expect(D.todayDaily(p, 5, ctx).fresh).toBe(false);
    p.stats.water = 9;
    expect(D.dailyJustDone(p, 5)).toEqual({ ids: [], chest: null });
    p.stats.water = 10;
    expect(D.dailyJustDone(p, 5)).toEqual({ ids: ['water3'], chest: null });
    expect(D.dailyJustDone(p, 5)).toEqual({ ids: [], chest: null });
    p.stats.feed = 5;
    expect(D.dailyJustDone(p, 5)).toEqual({ ids: ['feed2'], chest: D.chestCoins(5) });
    expect(D.dailyJustDone(p, 5)).toEqual({ ids: [], chest: null }); // (le coffre : une seule fois)
  });
  it('le coffre selon le jour : 10, 15, 20, 15, 10, 20, 30 (30 : le coffre doré, un jour sur 7)', () => {
    expect(D.DAILY).toEqual({ count: 2, coins: 10, chest: [10, 15, 20, 15, 10, 20, 30] });
    expect([0, 1, 2, 3, 4, 5, 6, 7, 13].map(D.chestCoins)).toEqual([10, 15, 20, 15, 10, 20, 30, 10, 30]);
    expect(D.chestGolden(30)).toBe(true);
    expect(D.chestGolden(20)).toBe(false);
    // au plus 2 × 10 + 30 = 50 🪙 en plus par jour de jeu
    expect(D.DAILY.count * D.DAILY.coins + Math.max(...D.DAILY.chest)).toBe(50);
  });
  it('le coffre ne dépend pas du défi du cheval (un cheval boiteux ne bloque rien)', () => {
    const p = played({ water: 0, feed: 0, pet: 1, brush: 1 });
    p.stats.water = 1;
    p.stats.feed = 1;
    p.challenge = { day: 5, id: 'ride2', base: 0, done: false };
    D.todayDaily(p, 5, { hour: 9, home: false, mine: 1, can: new Set(['water', 'feed']) }, 'rides');
    p.stats.water = 4;
    p.stats.feed = 3;
    expect(D.dailyJustDone(p, 5).chest).toBe(D.chestCoins(5));
    expect(p.challenge.done).toBe(false);
  });
  it('dailyState ne tire rien et ne change rien (l\'écran)', () => {
    const p = played();
    expect(D.dailyState(p, 5)).toBe(null);
    expect(p.daily).toBeUndefined();
    D.todayDaily(p, 5, ctxAll);
    const before = JSON.stringify(p);
    expect(D.dailyState(p, 5).list).toHaveLength(2);
    expect(D.dailyState(p, 6)).toBe(null);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('lecture tolérante : daily abîmé, d\'un autre jour ou avec un défi retiré du jeu → nouveau tirage', () => {
    for (const bad of ['x', 3, [], { day: 5, ids: 'a' }, { day: 5, ids: ['parti', 'water3'] }, { day: 4, ids: ['water3', 'feed2'] }, { day: 5, ids: [] }]) {
      const p = played();
      p.daily = bad;
      const d = D.todayDaily(p, 5, ctxAll);
      expect(d.fresh).toBe(true);
      expect(d.list).toHaveLength(2);
      expect(p.daily.done).toEqual([]);
    }
    // (done, base ou chest abîmés : lus sans planter)
    const p = played();
    D.todayDaily(p, 5, ctxAll);
    Object.assign(p.daily, { done: 'x', base: null, chest: 'y' });
    expect(D.dailyState(p, 5).chest).toBe(null);
    expect(D.dailyState(p, 5).list.every((x) => x.done === false)).toBe(true);
  });
});

/** Un faux jeu pour Game.prototype.dailyTick / challengeTick ; ui note tout dans log. */
function fakeGame({ mode = 'manage', day = 5, hour = 9, home = true, p = null, horse = false } = {}) {
  const prof = p ?? played(undefined, mode);
  const here = (sp, breed) => Object.assign(createAnimal({ species: sp, breed, sex: 'f', ageDays: 2000, name: sp }), { location: prof.place });
  if (!p) prof.animals.push(here('dog', 'labrador'), here('cat'));
  if (horse) prof.animals.push(here('horse', 'selle_francais'));
  const log = [];
  const g = {
    profile: prof, day, hour, isHome: home, entities: new Map(), player: null, lastHorseId: null,
    bondNews() {},
    ui: { toast: (m, ms, o) => log.push(['toast', m, o ?? null]), celebrate: (o) => log.push(['celebrate', o]), refresh() {} },
  };
  for (const m of ['dailyCtx', 'dailyTick', 'challengeCtx', 'challengeTick']) g[m] = (...a) => G.Game.prototype[m].apply(g, a);
  return { g, p: prof, log };
}
const said = (log) => log.filter(([k]) => k === 'toast').map(([, m]) => m);
const cheers = (log) => log.filter(([k]) => k === 'celebrate').map(([, o]) => o);

describe('🎮 Game.dailyTick', () => {
  it('le matin : une annonce (bulle « daily »), puis +10 🪙 par défi et « Défi réussi ! » ; les 2 faits : le coffre, en grand', () => {
    const { g, p, log } = fakeGame();
    g.dailyTick();
    expect(p.daily.ids).toHaveLength(2);
    expect(log).toHaveLength(1);
    expect(log[0][2]).toEqual({ group: 'daily' });
    expect(log[0][1]).toContain(i18n.t(`dc_${p.daily.ids[0]}`));
    g.dailyTick(); // (pas deux annonces)
    expect(log).toHaveLength(1);
    const [a, b] = p.daily.ids.map(D.dailyDef);
    p.stats[a.stat] = (p.stats[a.stat] ?? 0) + a.n;
    g.dailyTick();
    expect(p.money).toBe(110);
    expect(said(log)[1]).toBe(`${i18n.t('dc_done', { what: i18n.t(`dc_${a.id}`) })} +10 🪙`);
    expect(cheers(log)).toEqual([{ word: i18n.t('cel_challenge') }]);
    p.stats[b.stat] = (p.stats[b.stat] ?? 0) + b.n;
    g.dailyTick();
    const chest = D.chestCoins(5);
    expect(p.money).toBe(120 + chest);
    expect(said(log).at(-1)).toBe(`${i18n.t(D.chestGolden(chest) ? 'dc_chestGolden' : 'dc_chest')} +${chest} 🪙`);
    expect(cheers(log).at(-1)).toEqual({ word: i18n.t(D.chestGolden(chest) ? 'cel_chestGolden' : 'cel_chest'), big: true });
    expect(p.stats).toMatchObject({ dailyDone: 2, chests: 1 });
    g.dailyTick(); // (rien de plus)
    expect(p.money).toBe(120 + chest);
  });
  it('le jour du coffre doré : 30 🪙 et « Coffre doré ! »', () => {
    const { g, p, log } = fakeGame({ day: 6 });
    g.dailyTick();
    for (const id of p.daily.ids) { const c = D.dailyDef(id); p.stats[c.stat] = (p.stats[c.stat] ?? 0) + c.n; }
    g.dailyTick();
    expect(p.money).toBe(100 + 20 + 30);
    expect(cheers(log).at(-1)).toEqual({ word: i18n.t('cel_chestGolden'), big: true });
  });
  it('pendant l\'histoire du début : rien', () => {
    const { g, p, log } = fakeGame();
    p.tutorial = { ...p.tutorial, done: false };
    g.dailyTick();
    expect(p.daily).toBeUndefined();
    expect(log).toEqual([]);
  });
  it('bac à sable : les défis et la fête, sans pièces', () => {
    const { g, p, log } = fakeGame({ mode: 'sandbox' });
    g.dailyTick();
    for (const id of p.daily.ids) { const c = D.dailyDef(id); p.stats[c.stat] = (p.stats[c.stat] ?? 0) + c.n; }
    g.dailyTick();
    expect(p.money).toBe(100);
    for (const m of said(log)) expect(m).not.toContain('🪙');
    expect(cheers(log).at(-1).big).toBe(true);
  });
  it('avec un cheval : une seule bulle le matin (le défi du cheval et ceux de la ferme), jamais sur la même chose', () => {
    for (let day = 1; day <= 12; day++) {
      const { g, p, log } = fakeGame({ day, horse: true });
      g.challengeTick();
      g.dailyTick();
      const toasts = log.filter(([k]) => k === 'toast');
      expect(toasts).toHaveLength(2);
      for (const [, , o] of toasts) expect(o).toEqual({ group: 'daily' }); // (UI.toast les met dans la même bulle)
      const horse = HC.challengeDef(p.challenge.id);
      for (const id of p.daily.ids) expect([D.dailyDef(id).stat, `horse_${D.dailyDef(id).stat}`]).not.toContain(horse.stat);
      expect(HC.CHALLENGE_REWARD.coins).toBe(30); // (le défi du cheval reste à part, inchangé)
    }
  });
});

describe('📋 la carte « 🎯 Défis du jour » des petits boulots (lecture seule)', () => {
  function panel(g) {
    let render = null;
    const ui = { game: g, openPanel: (o) => { render = o.render; }, closePanel() {}, openTack() {}, refreshPanel() {}, toast() {} };
    panels.openJobs(ui);
    const nodes = render().filter(Boolean);
    return nodes.find((n) => n.classList?.contains('daily')) ?? null;
  }
  it('pas encore tirés : pas de carte, et le panneau ne tire rien (ni la ferme, ni le cheval)', () => {
    const { g, p } = fakeGame({ horse: true });
    const before = JSON.stringify(p);
    expect(panel(g)).toBe(null);
    expect(JSON.stringify(p)).toBe(before);
  });
  it('les 2 défis (⬜, où tu en es, +10 🪙), le coffre, et le défi du cheval (+30 🪙) tiré aujourd\'hui', () => {
    const { g, p } = fakeGame({ horse: true });
    g.challengeTick();
    g.dailyTick();
    const before = JSON.stringify(p);
    const card = panel(g);
    expect(JSON.stringify(p)).toBe(before);
    const rows = card.findAll('dc-row');
    expect(rows).toHaveLength(3);
    for (const id of p.daily.ids) {
      const r = rows.find((x) => x.textContent.includes(i18n.t(`dc_${id}`)));
      expect(r.textContent).toContain('⬜');
      expect(r.textContent).toContain(`(0/${D.dailyDef(id).n})`);
      expect(r.textContent).toContain('+10 🪙');
    }
    expect(rows[2].textContent).toContain(i18n.t(`ch_${p.challenge.id}`));
    expect(rows[2].textContent).toContain('+30 🪙');
    expect(card.textContent).toContain(i18n.t('dc_chestHelp'));
    expect(card.textContent).toContain(i18n.t('dc_title'));
  });
  it('un défi du cheval d\'hier : pas de ligne du cheval (on ne vole pas l\'annonce de ce matin)', () => {
    const { g, p } = fakeGame({ horse: true });
    g.dailyTick();
    p.challenge = { day: 4, id: 'pet3', base: 0, done: false };
    expect(panel(g).findAll('dc-row')).toHaveLength(2);
  });
  it('tout fait : ✅, le coffre ouvert et ses pièces, la carte en doré', () => {
    const { g, p } = fakeGame();
    g.dailyTick();
    for (const id of p.daily.ids) { const c = D.dailyDef(id); p.stats[c.stat] = (p.stats[c.stat] ?? 0) + c.n; }
    g.dailyTick();
    const card = panel(g);
    expect(card.classList.contains('ready')).toBe(true);
    for (const r of card.findAll('dc-row')) expect(r.textContent).toContain('✅');
    expect(card.textContent).toContain(`${i18n.t('dc_chestOpened')} +${D.chestCoins(5)} 🪙`);
  });
  it('bac à sable : la carte, sans pièces', () => {
    const { g } = fakeGame({ mode: 'sandbox' });
    g.dailyTick();
    const card = panel(g);
    expect(card.findAll('dc-row')).toHaveLength(2);
    expect(card.textContent).not.toContain('🪙');
  });
});

describe('🗣️ textes en français et en anglais', () => {
  const keys = () => [
    ['dc_title', {}], ['dc_new', { list: 'x · y' }], ['dc_newOne', { list: 'x' }], ['dc_done', { what: 'x' }], ['dc_chestHelp', {}],
    ['dc_chestOpened', {}], ['dc_chest', {}], ['dc_chestGolden', {}], ['cel_chest', {}], ['cel_chestGolden', {}],
    ...D.FARM_CHALLENGES.map((c) => [`dc_${c.id}`, {}]),
  ];
  it('chaque texte existe, sans {trou}, court, avec l\'espace avant « ! ? : » en français', () => {
    for (const lang of ['fr', 'en']) {
      i18n.setLang(lang);
      for (const [k, params] of keys()) {
        const s = i18n.t(k, params);
        expect(s, `${lang} ${k}`).not.toBe(k);
        expect(s, `${lang} ${k}`).not.toMatch(/\{\w+\}/);
        expect(s.length, `${lang} ${k}`).toBeLessThan(80);
        if (lang === 'fr') expect(s, k).not.toMatch(/[^\s★][!?:]/);
      }
    }
    i18n.setLang('fr');
  });
});

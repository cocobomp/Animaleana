// 🎉 Pièces qui volent avec « Bravo ! » (src/ui/piggy.js) : la volée, le mot de fête, le compteur caché, la partie
// rouverte, le bac à sable, moins d'animations. Un petit faux DOM suffit (pas de navigateur).
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { installFakeDom, animations } from './helpers/fakeDom.js';

let dom; // (dom.reduced : moins d'animations ; dom.tap : un doigt qui touche l'écran)
let P; // src/ui/piggy.js
let piggyBank;
let i18n;
let createProfile;

beforeAll(async () => {
  dom = installFakeDom();
  P = await import('../src/ui/piggy.js');
  piggyBank = await import('../src/sim/piggyBank.js');
  i18n = await import('../src/i18n.js');
  ({ createProfile } = await import('../src/sim/profile.js'));
  i18n.setLang('fr');
}, 60000);

beforeEach(() => {
  document.body.replaceChildren();
  animations.length = 0;
  dom.reduced = false;
});


/** Une partie et une fausse interface : le compteur du HUD, des messages, refresh comme UI.refresh. */
function setup({ mode = 'manage', money = 100 } = {}) {
  const p = Object.assign(createProfile('Lina', mode), { money });
  const toasts = [];
  const ui = {
    game: { profile: p },
    hudCoin: document.createElement('span'),
    minigameOpen: false,
    modal: false,
    isBlocking() { return this.modal; },
    toast: (m) => { toasts.push(m); },
  };
  ui.refresh = () => P.updateCoinChip(ui, { money: ui.game.profile.mode === 'sandbox' ? null : ui.game.profile.money });
  document.body.append(ui.hudCoin);
  P.resetCoins(ui);
  ui.refresh(); // (l'ouverture de la partie : rien ne vole)
  return { p, ui, toasts };
}
const all = (cls) => document.body.children.filter((c) => c.classList?.contains(cls));
const words = () => all('coin-word').map((w) => w.textContent.replace(/ /g, ' '));
const plus = () => all('coin-plus').map((x) => x.textContent);

describe('🪙 la volée de pièces (coinStep)', () => {
  it('même partie : le gain vole ; une dépense ne vole pas', () => {
    const p = {};
    let s = P.coinStep(null, p, 100, true);
    expect(s.gain).toBe(0);
    s = P.coinStep(s.seen, p, 125, true);
    expect(s.gain).toBe(25);
    s = P.coinStep(s.seen, p, 60, true);
    expect(s).toEqual({ seen: { p, money: 60 }, gain: 0 });
  });
  it('une partie rouverte (même id, nouvel objet : synchro, restauration) repart sans volée', () => {
    const a = { id: 'A' };
    const b = { id: 'A' };
    const s = P.coinStep({ p: a, money: 100 }, b, 500, true);
    expect(s).toEqual({ seen: { p: b, money: 500 }, gain: 0 });
  });
  it('compteur caché : le gain attend, puis vole tout entier quand il revient', () => {
    const p = {};
    let s = P.coinStep(null, p, 100, true);
    s = P.coinStep(s.seen, p, 272, false); // (concours : +172 pendant que le HUD est caché)
    expect(s.gain).toBe(0);
    expect(s.seen.money).toBe(100);
    s = P.coinStep(s.seen, p, 272, false);
    expect(s.gain).toBe(0);
    s = P.coinStep(s.seen, p, 272, true); // (« Continuer » : le compteur revient)
    expect(s.gain).toBe(172);
    s = P.coinStep(s.seen, p, 272, true);
    expect(s.gain).toBe(0); // (une seule fois)
  });
  it('compteur caché : une dépense est notée tout de suite (rien ne vole ensuite)', () => {
    const p = {};
    let s = P.coinStep({ p, money: 300 }, p, 200, false);
    expect(s.seen.money).toBe(200);
    s = P.coinStep(s.seen, p, 200, true);
    expect(s.gain).toBe(0);
  });
  it('bac à sable (argent illimité) : jamais de pièces', () => {
    const p = {};
    const s = P.coinStep({ p, money: null }, p, null, true);
    expect(s.gain).toBe(0);
  });
});

describe('🎉 un seul mot à la fois (pickNote)', () => {
  const n = (word, big, at) => ({ word, big, at });
  it('le dernier mot remplace le précédent, sauf un grand moment', () => {
    expect(P.pickNote(n('Bravo !', false, 0), n('Défi réussi !', false, 10), 20).word).toBe('Défi réussi !');
    expect(P.pickNote(n('Journée complète !', true, 0), n('Bravo !', false, 10), 20).word).toBe('Journée complète !');
    expect(P.pickNote(n('Journée complète !', true, 0), n('Tu as assez !', true, 10), 20).word).toBe('Tu as assez !');
  });
  it('un mot trop vieux ne compte plus', () => {
    expect(P.pickNote(n('Journée complète !', true, 0), n('Bravo !', false, P.NOTE_MS + 5), P.NOTE_MS + 5).word).toBe('Bravo !');
    expect(P.pickNote(n('Bravo !', false, 0), null, P.NOTE_MS + 1)).toBe(null);
  });
});

describe('🎉 celebrate : le mot part de l\'endroit touché et accompagne les pièces', () => {
  it('un boulot : « Bravo ! », des pièces qui volent du doigt au compteur, et « +25 🪙 »', () => {
    const { p, ui } = setup();
    dom.tap({ clientX: 80, clientY: 500 });
    p.money += 25;
    P.celebrate(ui, { word: 'Bravo !' });
    expect(words()).toEqual(['Bravo !']);
    expect(all('coin-fly')).toHaveLength(P.burstCount(25));
    expect(plus()).toEqual(['+25 🪙']);
    // (du doigt : les pièces partent de x = 80 - 12)
    expect(all('coin-fly')[0].style.left).toBe('68px');
    // Le mot s'envole vers le compteur (dernière image : déplacé), après une petite pause sur place.
    const a = animations.find((x) => x.el.classList.contains('coin-word'));
    expect(a.frames.at(-1).transform).toMatch(/calc\(-50% \+ -?\d/);
    // Les pièces partent après le mot (il apparaît d'abord).
    expect(animations.find((x) => x.el.classList.contains('coin-fly')).opts.delay).toBeGreaterThan(0);
  });
  it('typographie française : espace insécable avant « ! »', () => {
    const { p, ui } = setup();
    p.money += 30;
    P.celebrate(ui, { word: 'Défi réussi !' });
    expect(all('coin-word')[0].textContent).toBe('Défi réussi !');
  });
  it('un seul mot à l\'écran : le suivant remplace le précédent', () => {
    const { p, ui } = setup();
    p.money += 25;
    P.celebrate(ui, { word: 'Bravo !' });
    p.money += 30;
    P.celebrate(ui, { word: 'Défi réussi !' });
    expect(words()).toEqual(['Défi réussi !']);
  });
  it('un grand moment à l\'écran n\'est pas chassé par un petit mot qui arrive juste après (les pièces volent quand même)', () => {
    const { p, ui } = setup();
    p.money += 50;
    P.celebrate(ui, { word: 'Journée complète !', big: true });
    p.money += 30;
    P.celebrate(ui, { word: 'Défi réussi !' });
    expect(words()).toEqual(['Journée complète !']);
    expect(plus()).toEqual(['+50 🪙', '+30 🪙']);
    P.celebrate(ui, { word: 'Tu as assez !', big: true }); // (un autre grand moment, lui, prend la place)
    expect(words()).toEqual(['Tu as assez !']);
  });
  it('un grand moment (big) : plus gros, avec des éclats', () => {
    const { p, ui } = setup();
    p.money += 50;
    P.celebrate(ui, { word: 'Journée complète !', big: true });
    expect(all('coin-word')[0].classList.contains('big')).toBe(true);
    expect(all('coin-spark').length).toBeGreaterThan(0);
  });
  it('sans pièces (achat, rien gagné) : le mot seul, sans volée', () => {
    const { p, ui } = setup({ money: 400 });
    p.money -= 300;
    P.celebrate(ui, { word: 'Objectif atteint !', big: true });
    expect(words()).toEqual(['Objectif atteint !']);
    expect(all('coin-fly')).toHaveLength(0);
    expect(plus()).toHaveLength(0);
  });
  it('bac à sable : le mot de fête, jamais de pièces', () => {
    const { ui } = setup({ mode: 'sandbox' });
    P.celebrate(ui, { word: 'Bravo !' });
    expect(words()).toEqual(['Bravo !']);
    expect(all('coin-fly')).toHaveLength(0);
    expect(plus()).toHaveLength(0);
    expect(ui.hudCoin.textContent).toBe(`🪙 ${i18n.t('infinite')}`);
  });
  it('moins d\'animations : le mot seul, sur place (en fondu), et « +n » ; aucune pièce ne vole', () => {
    const { p, ui } = setup();
    dom.reduced = true;
    p.money += 25;
    P.celebrate(ui, { word: 'Bravo !' });
    expect(all('coin-fly')).toHaveLength(0);
    const w = all('coin-word')[0];
    expect(w.classList.contains('still')).toBe(true);
    expect(animations).toHaveLength(0);
    expect(plus()).toEqual(['+25 🪙']);
  });
  it('le mot ne déborde pas de l\'écran (320 px, touché tout au bord)', () => {
    const { p, ui } = setup();
    globalThis.innerWidth = 320;
    dom.tap({ clientX: 315, clientY: 600 });
    p.money += 25;
    P.celebrate(ui, { word: 'Bravo !' });
    const w = all('coin-word')[0];
    const x = parseFloat(w.style.left);
    expect(x - w.offsetWidth / 2).toBeGreaterThanOrEqual(8);
    expect(x + w.offsetWidth / 2).toBeLessThanOrEqual(320 - 8);
    globalThis.innerWidth = 360;
  });
});

describe('🙈 compteur caché : les gains attendent qu\'il revienne', () => {
  it('concours, spectacle (HUD caché) : rien ne vole, puis tout part quand il revient', () => {
    const { p, ui } = setup();
    ui.hudCoin.hiddenFlag = true; // (body.actv-running)
    p.money += 172;
    ui.refresh();
    ui.refresh();
    expect(all('coin-fly')).toHaveLength(0);
    ui.hudCoin.hiddenFlag = false; // (« Continuer » : fin du concours)
    ui.refresh();
    expect(plus()).toEqual(['+172 🪙']);
    expect(all('coin-fly')).toHaveLength(P.burstCount(172));
  });
  it('mini-jeu ouvert : le mot et les pièces attendent sa fermeture (même plus de 3 s)', () => {
    const { p, ui } = setup();
    ui.minigameOpen = true;
    p.money += 5;
    P.celebrate(ui, { word: 'Bravo !' });
    expect(words()).toEqual([]);
    expect(all('coin-fly')).toHaveLength(0);
    ui.minigameOpen = false;
    ui.refresh();
    expect(words()).toEqual(['Bravo !']);
    expect(plus()).toEqual(['+5 🪙']);
  });
  it('une fenêtre ouverte (isBlocking) : pareil', () => {
    const { p, ui } = setup();
    ui.modal = true;
    p.money += 40;
    ui.refresh();
    expect(plus()).toEqual([]);
    ui.modal = false;
    ui.refresh();
    expect(plus()).toEqual(['+40 🪙']);
  });
});

describe('🔄 rouvrir la même partie : rien ne vole à tort', () => {
  it('synchro ou restauration (même id, plus de pièces) : pas de « +400 »', () => {
    const { p, ui } = setup({ money: 100 });
    const again = JSON.parse(JSON.stringify({ ...p, money: 500 })); // (la copie synchronisée : un nouvel objet)
    ui.game.profile = again;
    ui.refresh(); // (même sans resetCoins : l'objet n'est plus le même)
    expect(plus()).toEqual([]);
    expect(all('coin-fly')).toHaveLength(0);
    again.money += 25; // (puis un vrai gain vole)
    ui.refresh();
    expect(plus()).toEqual(['+25 🪙']);
  });
  it('resetCoins (UI.onStart) oublie aussi un mot en attente', () => {
    const { ui } = setup();
    P.coinNote('Bravo !');
    P.resetCoins(ui);
    ui.refresh();
    expect(words()).toEqual([]);
  });
});

describe('🎯 « Tu as assez ! » vole avec les pièces qui remplissent la tirelire', () => {
  it('le grand mot passe avant « Bravo ! », et le message vient après les autres', () => {
    const { p, ui, toasts } = setup({ money: 10 });
    piggyBank.setGoal(p, { kind: 'tool', id: 'hoofKit' });
    ui.refresh();
    const price = piggyBank.goalPrice(p.goal);
    toasts.push('jobDone'); // (Game.doJob : ses messages d'abord)
    p.money = price + 5;
    P.celebrate(ui, { word: 'Bravo !' });
    expect(words()).toEqual([i18n.t('cel_goalReady')]);
    expect(all('coin-word')[0].classList.contains('big')).toBe(true);
    expect(toasts.at(-1)).toBe(i18n.t('goal_ready', { name: P.goalLabel(p.goal) }));
  });
  it('un animal vendu seulement en voyage : le message dit où l\'acheter', () => {
    const { p, ui, toasts } = setup({ money: 10 });
    piggyBank.setGoal(p, { kind: 'animal', species: 'horse', breed: 'kiso', stage: 'young', place: 'japon' });
    ui.refresh();
    p.money = piggyBank.goalPrice(p.goal);
    ui.refresh();
    expect(toasts.at(-1)).toContain('🇯🇵');
    expect(toasts.at(-1)).toBe(i18n.t('goal_readyAway', { name: P.goalLabel(p.goal), place: P.goalPlaceLabel(p) }));
  });
});

describe('📱 le compteur du HUD', () => {
  it('« 🪙 120/240 🚧 » : le prix dans .coin-of (caché au téléphone, style.css), le reste toujours visible', () => {
    const { p, ui } = setup({ money: 12 });
    piggyBank.setGoal(p, { kind: 'tool', id: 'hoofKit' });
    ui.refresh();
    const price = piggyBank.goalPrice(p.goal);
    const el = ui.hudCoin;
    expect(el.textContent).toBe(`🪙 12/${price} 🔨`);
    const of = el.children.find((c) => c.classList?.contains('coin-of'));
    expect(of.textContent).toBe(`/${price}`);
    p.money = price;
    ui.refresh();
    expect(el.textContent).toBe(`🪙 ${price} 🔨✓`);
    expect(el.children.some((c) => c.classList?.contains('coin-of'))).toBe(false);
  });
  it('style.css : cible de 44 px, prénom raccourci, compteur jamais coupé, prix caché au téléphone', async () => {
    const { readFileSync } = await import('node:fs');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.hud-info \.coin::before \{[^}]*inset: -13px/); // (19 px + 2 × 13 = 45 px)
    expect(css).toMatch(/\.hud-name \{[^}]*text-overflow: ellipsis/);
    expect(css).toMatch(/\.hud-info \.coin \{[^}]*flex-shrink: 0/);
    expect(css).toMatch(/@media \(max-width: 640px\), \(max-height: 480px\) \{\s*\.hud-info \.coin-of \{ display: none; \}/);
    expect(css).toMatch(/\.coin-word \{[^}]*max-width: calc\(100vw - 24px\)/);
    expect(css).toMatch(/\.coin-plus \{[^}]*white-space: nowrap/);
    // Outils : « 🎯 En faire mon objectif » sur sa propre ligne (plus de carte trop large à 320 px).
    expect(css).toMatch(/\.card\.tk-tool-goal \{ flex-wrap: wrap; \}/);
    expect(css).toMatch(/\.tk-tool-goal-row \{ flex-basis: 100%/);
  });
});

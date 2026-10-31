// Clavier : Entrée / Espace sur un bouton, focus et Tab dans les fenêtres, Échap.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Input, onControl, isPress } from '../src/game/Input.js';
import { UI } from '../src/ui/UI.js';

/** Faux élément : closest(sel) répond selon la liste des sélecteurs qu'il « est » ou dans lesquels il se trouve. */
const fakeEl = (inside = [], extra = {}) => ({
  closest: (sel) => (sel.split(',').some((s) => inside.includes(s.trim())) ? {} : null),
  ...extra,
});

describe('Entrée et Espace sur un bouton (src/game/Input.js)', () => {
  const listeners = {};
  let savedWindow;
  let savedDocument;
  beforeAll(() => {
    savedWindow = globalThis.window;
    savedDocument = globalThis.document;
    globalThis.window = { addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); } };
    globalThis.document = { body: { tag: 'body' }, documentElement: {} };
  });
  afterAll(() => {
    globalThis.window = savedWindow;
    globalThis.document = savedDocument;
  });

  const make = () => {
    const canvas = { addEventListener() {} };
    const joy = { addEventListener() {}, querySelector: () => ({ style: {} }) };
    const input = new Input(canvas, joy);
    const keys = [];
    input.onKey = (code) => keys.push(code);
    const press = (code, target) => {
      let prevented = false;
      const e = { code, target, repeat: false, defaultPrevented: false, preventDefault() { prevented = true; this.defaultPrevented = true; } };
      for (const fn of listeners.keydown.slice(-1)) fn(e);
      return { prevented };
    };
    return { input, keys, press };
  };

  it('isPress : Entrée, Entrée du pavé et Espace', () => {
    expect(['Enter', 'NumpadEnter', 'Space'].every(isPress)).toBe(true);
    expect(isPress('KeyE')).toBe(false);
  });

  it('onControl : un bouton, le panneau, une fenêtre ou un mini-jeu ; pas la page ni le canevas', () => {
    expect(onControl(fakeEl(['button']))).toBe(true);
    expect(onControl(fakeEl(['#panel']))).toBe(true);
    expect(onControl(fakeEl(['#modal']))).toBe(true);
    expect(onControl(fakeEl(['.mg-overlay']))).toBe(true);
    expect(onControl(fakeEl([]))).toBe(false); // le canevas 3D
    expect(onControl(document.body)).toBe(false);
    expect(onControl(null)).toBe(false);
  });

  it('Entrée sur « Caresser » (bouton du panneau) : le jeu ne relance pas « s\'occuper de l\'animal », le clic natif passe', () => {
    const { keys, press } = make();
    const r = press('Enter', fakeEl(['button', '#panel']));
    expect(keys).toEqual([]);
    expect(r.prevented).toBe(false);
  });

  it('Espace sur un bouton choisi avec Tab : pas de preventDefault (sinon le bouton ne se clique pas)', () => {
    const { keys, press } = make();
    const b = fakeEl(['button']);
    globalThis.document.activeElement = b;
    listeners.keyup.at(-1)({ code: 'Tab' }); // (Tab vient de poser le focus sur lui)
    const r = press('Space', b);
    expect(keys).toEqual([]);
    expect(r.prevented).toBe(false);
    expect(press('Enter', b).prevented).toBe(false);
  });

  it('un bouton du haut pris à la souris (📖, ⏸) ou rendu par une fenêtre : Espace et Entrée restent au jeu, sans le recliquer', () => {
    const { keys, press } = make();
    const journal = fakeEl(['button']);
    // (cliqué à la souris : il garde le focus, rien n'a été choisi avec Tab)
    let r = press('Space', journal);
    expect(r.prevented).toBe(true); // (pas de clic natif : le journal ne se rouvre pas)
    r = press('Enter', journal);
    expect(r.prevented).toBe(true);
    expect(keys).toEqual(['Space', 'Enter']); // (Espace : trot enlevé, sauter, bravo ; Entrée : agir)
    // choisi avec Tab, puis repris à la souris : la souris l'emporte
    globalThis.document.activeElement = journal;
    listeners.keyup.at(-1)({ code: 'Tab' });
    listeners.pointerdown.at(-1)({});
    expect(press('Space', journal).prevented).toBe(true);
    // dans un panneau, une fenêtre ou un écran : toujours le bouton, souris ou pas
    for (const where of ['#panel', '#modal', '#screen', '.mg-overlay']) {
      const before = keys.length;
      expect(press('Space', fakeEl(['button', where])).prevented, where).toBe(false);
      expect(keys.length).toBe(before);
    }
  });

  it('Entrée sur le jeu (rien de choisi) : « s\'occuper de… » comme avant ; Espace ne fait pas défiler la page', () => {
    const { keys, press } = make();
    press('Enter', document.body);
    expect(keys).toEqual(['Enter']);
    expect(press('Space', fakeEl([])).prevented).toBe(true);
  });

  it('E sur un bouton du panneau reste la touche du jeu', () => {
    const { keys, press } = make();
    press('KeyE', fakeEl(['button', '#panel']));
    expect(keys).toEqual(['KeyE']);
  });

  it('Échap déjà utilisé par une fenêtre : le jeu ne le reçoit pas (on ne sort pas du véhicule en même temps)', () => {
    const { keys } = make();
    const e = { code: 'Escape', target: document.body, repeat: false, defaultPrevented: true, preventDefault() {} };
    for (const fn of listeners.keydown.slice(-1)) fn(e);
    expect(keys).toEqual([]);
  });
});

describe('fenêtres au clavier (src/ui/UI.js)', () => {
  let savedDocument;
  beforeAll(() => { savedDocument = globalThis.document; });
  afterAll(() => { globalThis.document = savedDocument; });

  const btn = (name, attrs = {}, cls = []) => {
    const b = {
      name, tagName: 'BUTTON', clicked: 0, focused: 0,
      classList: { contains: (c) => cls.includes(c) },
      hasAttribute: (a) => a in attrs,
      click() { this.clicked++; },
      focus() { this.focused++; globalThis.document.activeElement = this; },
    };
    return b;
  };
  const fakeUi = (buttons) => {
    const box = { focus() { globalThis.document.activeElement = box; } };
    return {
      box,
      modal: { querySelector: () => box },
      modalFocusables: () => buttons,
    };
  };

  it('confirm : le focus va sur OK (data-default), Échap clique « Annuler » (data-escape)', () => {
    globalThis.document = { body: {}, activeElement: null };
    const cancel = btn('Annuler', { 'data-escape': '' });
    const ok = btn('OK', { 'data-default': '' }, ['danger']);
    const ui = fakeUi([cancel, ok]);
    UI.prototype.focusModal.call(ui);
    expect(globalThis.document.activeElement).toBe(ok);
    let prevented = false;
    UI.prototype.escapeModal.call(ui, { preventDefault: () => { prevented = true; } });
    expect(cancel.clicked).toBe(1);
    expect(ok.clicked).toBe(0);
    expect(prevented).toBe(true);
  });

  it('sans data-default : le bouton principal, sinon le dernier', () => {
    globalThis.document = { body: {}, activeElement: null };
    const a = btn('📸');
    const b = btn('👋', {}, ['primary']);
    UI.prototype.focusModal.call(fakeUi([b, a]));
    expect(globalThis.document.activeElement).toBe(b);
    const c = btn('Non');
    const d = btn('Oui');
    UI.prototype.focusModal.call(fakeUi([c, d]));
    expect(globalThis.document.activeElement).toBe(d);
  });

  it('alerte « niveau supérieur » (un seul bouton) : Échap la ferme', () => {
    globalThis.document = { body: {}, activeElement: null };
    const ok = btn('OK', {}, ['primary']);
    UI.prototype.escapeModal.call(fakeUi([ok]), { preventDefault() {} });
    expect(ok.clicked).toBe(1);
  });

  it('plusieurs choix sans data-escape : Échap ne choisit rien à la place de l\'enfant', () => {
    globalThis.document = { body: {}, activeElement: null };
    const yes = btn('Accepter');
    const no = btn('Refuser');
    UI.prototype.escapeModal.call(fakeUi([yes, no]), { preventDefault() {} });
    expect(yes.clicked + no.clicked).toBe(0);
  });

  it('Tab et Maj+Tab tournent dans les boutons de la fenêtre', () => {
    const a = btn('A');
    const b = btn('B');
    const c = btn('C');
    const ui = fakeUi([a, b, c]);
    globalThis.document = { body: {}, activeElement: c };
    let prevented = 0;
    const tab = (shiftKey) => UI.prototype.trapModalTab.call(ui, { shiftKey, preventDefault: () => { prevented++; } });
    tab(false);
    expect(globalThis.document.activeElement).toBe(a); // du dernier, on revient au premier
    tab(true);
    expect(globalThis.document.activeElement).toBe(c); // et l'inverse
    globalThis.document.activeElement = { name: 'barre du haut' }; // focus resté derrière la fenêtre
    tab(false);
    expect(globalThis.document.activeElement).toBe(a);
    expect(prevented).toBe(3);
  });

  it('alert() et confirm() marquent leurs boutons (Échap, bouton par défaut)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/ui/UI.js', import.meta.url), 'utf8');
    const alertSrc = src.slice(src.indexOf('  alert(msg)'), src.indexOf('  confirm(msg)'));
    const confirmSrc = src.slice(src.indexOf('  confirm(msg)'), src.indexOf('  prompt('));
    expect(alertSrc).toMatch(/'data-escape': true/);
    expect(confirmSrc).toMatch(/'data-escape': true, onClick: \(\) => done\(false\)/);
    expect(confirmSrc).toMatch(/'data-default': true, onClick: \(\) => done\(true\)/);
  });
});

describe('Échap qui ferme une fenêtre pendant la construction (src/game/BuildMode.js)', () => {
  let savedWindow;
  const listeners = {};
  beforeAll(() => {
    savedWindow = globalThis.window;
    globalThis.window = { addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); } };
  });
  afterAll(() => { globalThis.window = savedWindow; });

  it('la pose n\'est pas annulée en plus (l\'écouteur de l\'UI passe avant : modalOpen est déjà faux)', async () => {
    const { BuildMode } = await import('../src/game/BuildMode.js');
    const ui = { modalOpen: false };
    const bm = new BuildMode({ ui, renderer: { domElement: { addEventListener() {} } } }, {});
    let cancelled = 0;
    bm.active = true;
    bm.cancel = () => { cancelled++; };
    const key = listeners.keydown.at(-1);
    // Échap que la fenêtre vient d'utiliser (UI.escapeModal : preventDefault, fenêtre déjà fermée)
    key({ code: 'Escape', target: {}, defaultPrevented: true });
    expect(cancelled).toBe(0);
    // Échap sans fenêtre : la pose est annulée comme avant
    key({ code: 'Escape', target: {}, defaultPrevented: false });
    expect(cancelled).toBe(1);
  });
});

describe('retour du focus après un mini-jeu (UI.focusPanel)', () => {
  let savedDocument;
  beforeAll(() => { savedDocument = globalThis.document; });
  afterAll(() => { globalThis.document = savedDocument; });

  const pbtn = (label, effect) => ({
    textContent: `${label}${effect}`,
    querySelector: (sel) => (sel === 'b' ? { textContent: label } : null),
    focus() { globalThis.document.activeElement = this; },
  });

  it('le panneau redessiné pendant la partie : « Caresser » reprend le focus, même si son effet a changé', () => {
    globalThis.document = { body: {}, activeElement: null };
    const feed = pbtn('Nourrir', '🍖 Faim +45');
    const pet = pbtn('Caresser', '❤️ Affection +5');
    const ui = { panelBody: { querySelectorAll: () => [feed, pet], querySelector: () => feed }, panelEl: { querySelector: () => null } };
    UI.prototype.focusPanel.call(ui, { text: 'Caresser❤️ Affection +28', label: 'Caresser' });
    expect(globalThis.document.activeElement).toBe(pet);
    // sans bouton à retrouver : le premier du panneau (panneau ouvert avec E)
    UI.prototype.focusPanel.call(ui);
    expect(globalThis.document.activeElement).toBe(feed);
    UI.prototype.focusPanel.call(ui, { text: 'Monter', label: 'Monter' });
    expect(globalThis.document.activeElement).toBe(feed);
  });
});

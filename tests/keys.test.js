// ⌨️ Les touches sur ordinateur : la lettre écrite sur la touche (src/ui/keys.js), marcher avec les touches à leur
// place (src/game/Input.js), les touches des menus J, P, H, Échap (src/ui/controls.js) et la carte « Les touches ».
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';

let i18n;
let keys;
let controls;
let InputMod;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
  keys = await import('../src/ui/keys.js');
  controls = await import('../src/ui/controls.js');
  InputMod = await import('../src/game/Input.js');
});
afterEach(() => {
  vi.unstubAllGlobals();
  keys.resetKeyLayout();
  i18n.setLang('fr');
});

const lang = (l) => vi.stubGlobal('navigator', { language: l });

describe('la lettre écrite sur la touche (src/ui/keys.js)', () => {
  it('clavier français deviné par la langue du navigateur : fr, fr-FR, fr-BE ; pas le Canada, la Suisse ni le Luxembourg', () => {
    for (const l of ['fr', 'fr-FR', 'fr-BE', 'fr_FR', 'FR-fr']) expect(keys.guessAzerty(l), l).toBe(true);
    for (const l of ['fr-CA', 'fr-CH', 'fr-LU', 'en-US', 'en-GB', 'de-DE', 'it', '', undefined, null]) expect(keys.guessAzerty(l), String(l)).toBe(false);
  });

  it('AZERTY : marcher, c\'est Z Q S D ; QWERTY : W A S D (les autres lettres ne bougent pas)', () => {
    lang('fr-FR');
    expect(keys.MOVE_CODES.map(keys.keyLabel)).toEqual(['Z', 'Q', 'S', 'D']);
    expect(keys.moveKeys()).toBe('Z Q S D');
    expect(keys.moveKeys('')).toBe('ZQSD');
    expect(['KeyE', 'KeyJ', 'KeyP', 'KeyH', 'KeyC', 'KeyN'].map(keys.keyLabel)).toEqual(['E', 'J', 'P', 'H', 'C', 'N']);
    lang('en-US');
    expect(keys.moveKeys()).toBe('W A S D');
    lang('fr-CA');
    expect(keys.moveKeys()).toBe('W A S D');
  });

  it('le clavier suit le navigateur, pas la langue du jeu (un enfant qui joue en anglais garde son clavier français)', () => {
    lang('fr-FR');
    i18n.setLang('en');
    expect(keys.moveKeys()).toBe('Z Q S D');
    expect(keys.keyLabel('ShiftLeft')).toBe('Shift');
  });

  it('les touches nommées dans la langue du jeu ; les flèches en flèches ; les chiffres restent des chiffres', () => {
    lang('fr-FR');
    i18n.setLang('fr');
    expect(['Space', 'ShiftLeft', 'ShiftRight', 'Escape', 'Enter', 'NumpadEnter'].map(keys.keyLabel)).toEqual(['Espace', 'Maj', 'Maj', 'Échap', 'Entrée', 'Entrée']);
    expect(keys.ARROW_CODES.map(keys.keyLabel)).toEqual(['↑', '←', '↓', '→']);
    expect(['Digit0', 'Digit1', 'Digit3', 'Numpad0', 'Numpad8'].map(keys.keyLabel)).toEqual(['0', '1', '3', '0', '8']);
    i18n.setLang('en');
    expect(['Space', 'ShiftLeft', 'Escape', 'Enter'].map(keys.keyLabel)).toEqual(['Space', 'Shift', 'Esc', 'Enter']);
  });

  it('le vrai clavier (navigator.keyboard.getLayoutMap) l\'emporte sur la devinette ; jamais « & » pour la touche 1', async () => {
    lang('en-US'); // (devinette : QWERTY…)
    let told = 0;
    const off = keys.onKeyLayout(() => { told++; });
    const map = new Map([['KeyW', 'z'], ['KeyA', 'q'], ['KeyS', 's'], ['KeyD', 'd'], ['KeyE', 'e'], ['Digit1', '&'], ['Space', ' ']]);
    const nav = { keyboard: { getLayoutMap: async () => map } };
    expect(await keys.loadKeyLayout(nav)).toBe(true);
    expect(keys.moveKeys()).toBe('Z Q S D'); // (… mais le navigateur dit AZERTY)
    expect(keys.keyLabel('Digit1')).toBe('1');
    expect(keys.keyLabel('Space')).toBe('Espace');
    expect(told).toBe(1);
    expect(await keys.loadKeyLayout(nav)).toBe(true); // (lu une seule fois)
    expect(told).toBe(1);
    off();
  });

  it('carte vide (navigateur sans écran), erreur ou pas d\'API : on garde la devinette', async () => {
    lang('fr-FR');
    expect(await keys.loadKeyLayout({ keyboard: { getLayoutMap: async () => new Map() } })).toBe(false);
    expect(keys.moveKeys()).toBe('Z Q S D');
    keys.resetKeyLayout();
    expect(await keys.loadKeyLayout({ keyboard: { getLayoutMap: async () => { throw new Error('SecurityError'); } } })).toBe(false);
    expect(keys.moveKeys()).toBe('Z Q S D');
    keys.resetKeyLayout();
    expect(await keys.loadKeyLayout({})).toBe(false);
    lang('en-GB');
    expect(keys.moveKeys()).toBe('W A S D');
  });

  it('la ligne de toutes les touches (Réglages, au doigt) dit les bonnes lettres, en français et en anglais', () => {
    lang('fr-FR');
    expect(keys.controlsHelp()).toMatch(/^ZQSD ou flèches : marcher · Maj : courir · E : agir/);
    expect(keys.controlsHelp()).toMatch(/J : journal · P : pause · N : quête suivante · H : toutes les touches/);
    i18n.setLang('en');
    lang('en-US');
    expect(keys.controlsHelp()).toMatch(/^WASD or arrows: walk · Shift: run · E: act/);
    expect(keys.controlsHelp()).not.toMatch(/\{|\}/);
  });
});

describe('marcher avec les touches à leur place (src/game/Input.js)', () => {
  const listeners = {};
  let savedWindow;
  beforeAll(() => {
    savedWindow = globalThis.window;
    globalThis.window = { addEventListener: (type, fn) => { (listeners[type] ??= []).push(fn); } };
  });
  afterAll(() => { globalThis.window = savedWindow; });

  const make = () => {
    const input = new InputMod.Input({ addEventListener() {} }, { addEventListener() {}, querySelector: () => ({ style: {} }) });
    const got = [];
    input.onKey = (code) => got.push(code);
    const down = listeners.keydown.at(-1);
    const up = listeners.keyup.at(-1);
    const ev = (code, target = {}, extra = {}) => ({ code, target, repeat: false, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra });
    const hold = (code, target) => {
      down(ev(code, target));
      const m = { ...input.poll().move };
      up(ev(code, target));
      return m;
    };
    return { input, got, hold, down, ev };
  };

  it('W A S D (Z Q S D en AZERTY) et les flèches font marcher', () => {
    const { hold } = make();
    expect(hold('KeyW')).toEqual({ x: 0, y: 1 });
    expect(hold('KeyS')).toEqual({ x: 0, y: -1 });
    expect(hold('KeyA')).toEqual({ x: -1, y: 0 });
    expect(hold('KeyD')).toEqual({ x: 1, y: 0 });
    expect(hold('ArrowUp')).toEqual({ x: 0, y: 1 });
    expect(hold('ArrowDown')).toEqual({ x: 0, y: -1 });
    expect(hold('ArrowLeft')).toEqual({ x: -1, y: 0 });
    expect(hold('ArrowRight')).toEqual({ x: 1, y: 0 });
  });

  it('les touches Z et Q (W et A sur un clavier français) ne font plus marcher', () => {
    const { hold } = make();
    expect(hold('KeyZ')).toEqual({ x: 0, y: 0 });
    expect(hold('KeyQ')).toEqual({ x: 0, y: 0 });
  });

  it('en diagonale, pas plus vite ; Maj fait courir', () => {
    const { input, down, ev } = make();
    down(ev('KeyW'));
    down(ev('KeyD'));
    down(ev('ShiftLeft'));
    const c = input.poll();
    expect(Math.hypot(c.move.x, c.move.y)).toBeCloseTo(1);
    expect(c.run).toBe(true);
    listeners.blur.at(-1)(); // (fenêtre quittée : plus rien d'appuyé)
    expect(input.poll().run).toBe(false);
  });

  it('pendant qu\'on tape un nom, rien ne bouge et aucune touche ne part au jeu ; une case cochée, si', () => {
    const { input, got, hold } = make();
    const field = { tagName: 'INPUT', type: 'text' };
    for (const code of ['KeyW', 'KeyJ', 'KeyP', 'KeyH', 'KeyE', 'Space']) expect(hold(code, field)).toEqual({ x: 0, y: 0 });
    expect(hold('KeyW', { tagName: 'INPUT', type: 'search' })).toEqual({ x: 0, y: 0 });
    expect(hold('KeyW', { tagName: 'TEXTAREA' })).toEqual({ x: 0, y: 0 });
    expect(hold('KeyW', { tagName: 'DIV', isContentEditable: true })).toEqual({ x: 0, y: 0 });
    expect(got).toEqual([]);
    // (« Saut automatique » coché à la souris : Z Q S D font toujours marcher)
    expect(hold('KeyW', { tagName: 'INPUT', type: 'checkbox' })).toEqual({ x: 0, y: 1 });
    expect(input.enabled).toBe(true);
  });

  it('isTextEntry : les champs où l\'on écrit, pas les cases ni les boutons', () => {
    const { isTextEntry } = InputMod;
    expect(isTextEntry({ tagName: 'INPUT' })).toBe(true); // (type par défaut : texte)
    for (const type of ['text', 'search', 'email', 'password', 'number', 'tel', 'url']) expect(isTextEntry({ tagName: 'INPUT', type }), type).toBe(true);
    for (const type of ['checkbox', 'radio', 'button', 'submit', 'file']) expect(isTextEntry({ tagName: 'INPUT', type }), type).toBe(false);
    expect(isTextEntry({ tagName: 'SELECT' })).toBe(true);
    expect(isTextEntry({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntry(null)).toBe(false);
  });

  it('Ctrl, Cmd ou Alt avec la touche : c\'est pour le navigateur (Ctrl+P imprime, Cmd+H cache la fenêtre)', () => {
    const { got, down, ev } = make();
    down(ev('KeyP', {}, { ctrlKey: true }));
    down(ev('KeyH', {}, { metaKey: true }));
    down(ev('KeyC', {}, { ctrlKey: true }));
    down(ev('KeyJ', {}, { altKey: true }));
    down(ev('KeyP', {}, { shiftKey: true })); // (Maj, oui : c'est courir)
    expect(got).toEqual(['KeyP']);
  });

  it('une touche déjà utilisée (H qui ferme la carte, Échap une fenêtre) ne part pas au jeu en plus', () => {
    const { got, down, ev } = make();
    down(ev('KeyH', {}, { defaultPrevented: true }));
    down(ev('Escape', {}, { defaultPrevented: true }));
    down(ev('KeyJ'));
    expect(got).toEqual(['KeyJ']);
  });
});

describe('les touches des menus : J, P, H, Échap (src/ui/controls.js)', () => {
  const free = { running: true };

  it('rien d\'ouvert : J le journal, P la pause, H la carte des touches, Échap le menu ; les autres touches, rien', () => {
    expect(['KeyJ', 'KeyP', 'KeyH', 'Escape'].map((c) => controls.menuAction(c, free))).toEqual(['journal', 'pause', 'keys', 'menu']);
    for (const c of ['KeyE', 'KeyW', 'KeyN', 'Space', 'KeyZ']) expect(controls.menuAction(c, free), c).toBe(null);
  });

  it('jamais sous une fenêtre, pendant un mini-jeu, une activité, un voyage, ni hors de la partie', () => {
    for (const s of [{ blocking: true }, { minigame: true }, { activity: true }, { trip: true }, { running: false }]) {
      for (const c of ['KeyJ', 'KeyP', 'KeyH', 'Escape']) expect(controls.menuAction(c, { ...free, ...s }), `${c} ${JSON.stringify(s)}`).toBe(null);
    }
  });

  it('Échap ferme d\'abord ce qui est ouvert : pas de menu sur un panneau, la vue d\'ensemble, la vue dans le véhicule ; la bulle d\'une quête se ferme', () => {
    for (const s of [{ panel: true }, { mgmt: true }, { tripView: true }]) expect(controls.menuAction('Escape', { ...free, ...s }), JSON.stringify(s)).toBe(null);
    expect(controls.menuAction('Escape', { ...free, questBubble: true })).toBe('bubble');
    // (J et P marchent aussi avec un panneau ouvert, comme 📖 et ⏸ en haut de l'écran)
    expect(controls.menuAction('KeyJ', { ...free, panel: true })).toBe('journal');
    expect(controls.menuAction('KeyP', { ...free, mgmt: true })).toBe('pause');
  });

  it('pendant le tutoriel guidé : pas de menu d\'Échap (la bulle dirait « touche OK ») ; J, P et H, si', () => {
    expect(controls.menuAction('Escape', { ...free, tuto: true })).toBe(null);
    expect(['KeyJ', 'KeyP', 'KeyH'].map((c) => controls.menuAction(c, { ...free, tuto: true }))).toEqual(['journal', 'pause', 'keys']);
    const { ui, calls } = fakeUi({ tutorial: { active: true, bubble: null } });
    expect(controls.runMenuKey(ui, 'Escape')).toBe(null);
    expect(calls).toEqual([]);
  });

  const fakeUi = (over = {}) => {
    const calls = [];
    const game = {
      running: true, timeScale: 1,
      get paused() { return this.timeScale === 0; },
      setTimeScale(x) { this.timeScale = x; calls.push(['speed', x]); },
      activities: { active: false }, tripFlow: { journey: null, view: null }, mgmt: { active: false },
      profile: {},
    };
    const ui = {
      game, panel: null, modalOpen: false, minigameOpen: false,
      isBlocking() { return this.modalOpen; },
      openJournal() { this.panel = { kind: 'journal' }; calls.push(['journal']); },
      closePanel() { this.panel = null; calls.push(['close']); },
      openMore() { calls.push(['menu']); },
      showModal() { this.modalOpen = true; calls.push(['modal']); },
      tutorial: { bubble: { hidden: false, classList: { contains: (c) => c === 'quest-bubble' } }, closeQuestBubble() { calls.push(['bubble']); } },
      ...over,
    };
    return { ui, game, calls };
  };

  it('J ouvre puis referme le journal ; P met en pause puis repart (après ⏩, on repart à ×1)', () => {
    const { ui, game, calls } = fakeUi({ tutorial: null });
    expect(controls.runMenuKey(ui, 'KeyJ')).toBe('journal');
    expect(ui.panel.kind).toBe('journal');
    controls.runMenuKey(ui, 'KeyJ');
    expect(ui.panel).toBe(null);
    game.timeScale = 3;
    controls.runMenuKey(ui, 'KeyP');
    expect(game.timeScale).toBe(0);
    controls.runMenuKey(ui, 'KeyP');
    expect(game.timeScale).toBe(1);
    expect(calls).toEqual([['journal'], ['close'], ['speed', 0], ['speed', 1]]);
  });

  it('Échap : la bulle d\'une quête se ferme avant le menu ; sans bulle, le menu', () => {
    const a = fakeUi();
    expect(controls.runMenuKey(a.ui, 'Escape')).toBe('bubble');
    expect(a.calls).toEqual([['bubble']]);
    const b = fakeUi({ tutorial: null });
    expect(controls.runMenuKey(b.ui, 'Escape')).toBe('menu');
    expect(b.calls).toEqual([['menu']]);
  });

  it('une fenêtre ouverte (la carte, le menu) : J, P, H et Échap ne font rien ici (Échap et H la ferment : UI)', () => {
    const { ui, calls } = fakeUi({ modalOpen: true });
    for (const c of ['KeyJ', 'KeyP', 'KeyH', 'Escape']) expect(controls.runMenuKey(ui, c)).toBe(null);
    expect(calls).toEqual([]);
  });

  it('le menu d\'Échap ouvert : J, P et H choisissent ce que disent ses petites touches ; H referme la carte', () => {
    const clicked = [];
    const sheet = { KeyJ: '📖', KeyP: '⏸', KeyH: '⌨️' };
    const menu = {
      modalOpen: true,
      modal: { querySelector: (sel) => { const k = /data-key="(\w+)"/.exec(sel)?.[1]; return sheet[k] ? { click: () => clicked.push(sheet[k]) } : null; } },
      hideModal() { clicked.push('fermé'); },
    };
    for (const c of ['KeyJ', 'KeyP', 'KeyH']) expect(controls.modalMenuKey(menu, c), c).toBe(true);
    expect(controls.modalMenuKey(menu, 'Escape')).toBe(false); // (Échap : son bouton « Annuler », UI.escapeModal)
    expect(controls.modalMenuKey(menu, 'KeyE')).toBe(false);
    expect(clicked).toEqual(['📖', '⏸', '⌨️']);
    // la carte des touches : H la referme ; J et P ne font rien sous elle
    const card = { modalOpen: true, modal: { querySelector: (sel) => (sel === '.keys-card' ? {} : null) }, hideModal() { clicked.push('fermé'); } };
    expect(controls.modalMenuKey(card, 'KeyJ')).toBe(false);
    expect(controls.modalMenuKey(card, 'KeyH')).toBe(true);
    expect(clicked.at(-1)).toBe('fermé');
    expect(controls.modalMenuKey({ ...card, modalOpen: false }, 'KeyH')).toBe(false);
  });

  it('pendant une activité (le concours de beauté…), un mini-jeu ou un voyage : rien', () => {
    for (const over of [{ minigameOpen: true }]) {
      const { ui, calls } = fakeUi(over);
      for (const c of ['KeyJ', 'KeyP', 'KeyH', 'Escape']) expect(controls.runMenuKey(ui, c)).toBe(null);
      expect(calls).toEqual([]);
    }
    const act = fakeUi();
    act.game.activities.active = true;
    const trip = fakeUi();
    trip.game.tripFlow.journey = {};
    for (const { ui, calls } of [act, trip]) {
      for (const c of ['KeyJ', 'KeyP', 'KeyH', 'Escape']) expect(controls.runMenuKey(ui, c)).toBe(null);
      expect(calls).toEqual([]);
    }
  });

  it('les touches des menus ne comptent pas comme « il a bougé » au concours de beauté (Beauty.onKeyDown)', async () => {
    const { BeautySession } = await import('../src/game/Beauty.js');
    const self = { phase: 'stand', touched: false, action() {} };
    for (const code of ['KeyJ', 'KeyP', 'KeyH', 'Escape']) BeautySession.prototype.onKeyDown.call(self, { code, preventDefault() {} });
    expect(self.touched).toBe(false);
    BeautySession.prototype.onKeyDown.call(self, { code: 'KeyW', preventDefault() {} });
    expect(self.touched).toBe(true);
  });
});

describe('la carte « Les touches » (H)', () => {
  // (aucun code brut : ni KeyW, ni ShiftLeft, ni clé de texte oubliée, ni {paramètre} ; « Space » est bien le nom anglais)
  const RAW = /\b(?:Key[A-Z]|Digit\d|Numpad\w*|Arrow[A-Z]\w*|Shift(?:Left|Right)|Escape)\b|\{|\}|\b(?:kc|ks|key)_\w+/;
  const texts = () => controls.keysCardGroups().flatMap((g) => [g.title, ...g.rows.map((r) => r.text), ...g.rows.flatMap((r) => (r.keys ?? []).map(keys.keyLabel))]);

  for (const l of ['fr', 'en']) {
    it(`en ${l} : six groupes (marcher, courir, agir, regarder, à cheval, menus), chacun traduit, sans touche brute`, () => {
      lang(l === 'fr' ? 'fr-FR' : 'en-GB');
      i18n.setLang(l);
      const groups = controls.keysCardGroups();
      expect(groups.map((g) => g.id)).toEqual(['walk', 'run', 'act', 'look', 'ride', 'menus']);
      for (const s of texts()) {
        expect(s, s).toBeTruthy();
        expect(s, s).not.toMatch(RAW);
      }
      const all = groups.flatMap((g) => g.rows.flatMap((r) => r.keys ?? []));
      // (toutes les touches du jeu y sont)
      for (const c of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'KeyE', 'KeyC', 'Digit1', 'Digit0', 'Space', 'KeyJ', 'KeyP', 'KeyN', 'KeyH', 'Escape']) expect(all, c).toContain(c);
      expect(all).not.toContain('KeyZ');
      expect(all).not.toContain('KeyQ');
    });
  }

  it('les lettres suivent le clavier : Z Q S D en AZERTY, W A S D en QWERTY', () => {
    lang('fr-FR');
    const walk = () => controls.keysCardGroups()[0].rows[0].keys.map(keys.keyLabel).join('');
    expect(walk()).toBe('ZQSD');
    lang('en-US');
    expect(walk()).toBe('WASD');
  });

  it('la fenêtre : ses textes, une touche « Échap » qui la ferme, et vue une fois (elle ne s\'ouvre plus toute seule)', () => {
    // (un tout petit DOM pour h() : src/ui/dom.js)
    class El {
      constructor(tag) { Object.assign(this, { tag, children: [], attrs: {}, className: '', style: {} }); }
      append(c) { this.children.push(c); }
      setAttribute(k, v) { this.attrs[k] = v; }
      addEventListener() {}
    }
    globalThis.Node = El;
    Object.assign(globalThis.document, { createElement: (tag) => new El(tag), createTextNode: (data) => ({ data }) });
    const flat = (x) => [x].flat(Infinity).flatMap((e) => (e?.children ? [e, ...flat(e.children)] : [e]));
    lang('fr-FR');
    const shown = [];
    const ui = { game: { profile: {} }, showModal: (c) => shown.push(c), hideModal() {} };
    controls.openKeysCard(ui);
    expect(ui.game.profile.keysCard).toBe(true);
    const nodes = flat(shown[0]);
    const words = nodes.filter((n) => n && 'data' in n).map((n) => n.data).join(' | ');
    expect(words).toContain('Les touches');
    expect(words).toContain('Appuie sur H pour revoir cette carte.');
    expect(words).not.toMatch(RAW);
    // (typographie française : « Bravo ! », « Pavé numérique : » ne se coupent pas avant la ponctuation)
    expect(words).toContain('«\u00a0Bravo\u00a0!\u00a0»');
    expect(words).not.toMatch(/ [!?:;»]|« /);
    const kbds = nodes.filter((n) => n?.tag === 'kbd');
    expect(kbds.slice(0, 4).map((k) => k.children[0].data)).toEqual(['Z', 'Q', 'S', 'D']);
    expect(nodes.some((n) => n?.tag === 'button' && 'data-escape' in n.attrs)).toBe(true);
  });

  it('la première fois : pas sur un téléphone, pas pendant le tutoriel guidé, pas par-dessus une fenêtre ; une seule fois', () => {
    vi.stubGlobal('performance', { now: () => 1e6 });
    const shown = [];
    const make = (over = {}) => ({
      game: { running: true, profile: {}, activities: {}, tripFlow: {}, mgmt: {} }, startedAt: 0, panel: null, minigameOpen: false, modalQueue: [],
      tutorial: { active: false }, isBlocking: () => false, showModal: (c) => shown.push(c), hideModal() {}, ...over,
    });
    // (téléphone, ou tests : pas de souris)
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    expect(controls.maybeKeysCard(make())).toBe(false);
    vi.stubGlobal('matchMedia', (q) => ({ matches: /pointer: fine/.test(q) }));
    expect(controls.maybeKeysCard(make({ tutorial: { active: true } }))).toBe(false);
    expect(controls.maybeKeysCard(make({ isBlocking: () => true }))).toBe(false);
    expect(controls.maybeKeysCard(make({ panel: {} }))).toBe(false);
    const ui = make();
    expect(controls.maybeKeysCard(ui)).toBe(true);
    expect(ui.game.profile.keysCard).toBe(true);
    expect(controls.maybeKeysCard(ui)).toBe(false);
    expect(shown).toHaveLength(1);
  });
});

describe('le bandeau des touches et le menu d\'Échap (src/ui/controls.js, src/ui/UI.js)', () => {
  // (un tout petit DOM pour h() : src/ui/dom.js)
  class El {
    constructor(tag) { Object.assign(this, { tag, children: [], attrs: {}, className: '', style: {}, textContent: '' }); }
    append(c) { this.children.push(c); }
    replaceChildren(...c) { this.children = c; }
    setAttribute(k, v) { this.attrs[k] = v; }
    addEventListener() {}
  }
  const dom = () => {
    globalThis.Node = El;
    const body = { classes: new Set(), classList: { toggle: (c, on) => (on ? body.classes.add(c) : body.classes.delete(c)) } };
    Object.assign(globalThis.document, { createElement: (tag) => new El(tag), createTextNode: (data) => ({ data }), body });
    return body;
  };
  const desk = () => {
    vi.stubGlobal('matchMedia', (q) => ({ matches: /pointer: fine/.test(q) }));
    vi.stubGlobal('window', { innerWidth: 1280, innerHeight: 800 });
  };

  it('un portable à écran tactile (joystick deviné, rien choisi) garde son bandeau ; le joystick choisi dans les Réglages le remplace', () => {
    const body = dom();
    desk();
    lang('fr-FR');
    let choice = null;
    const ui = {
      game: { running: true, player: { mount: null } }, screen: { hidden: true },
      onScreenControls: () => true, // ('ontouchstart' dans Chrome : le joystick est montré)
      onScreenChoice: () => choice,
    };
    const strip = new controls.KeyStrip(ui);
    strip.update();
    expect(strip.on).toBe(true);
    expect(body.classes.has('keys-strip')).toBe(true);
    choice = 'off';
    strip.update();
    expect(strip.on).toBe(true);
    choice = 'on';
    strip.update();
    expect(strip.on).toBe(false);
    expect(body.classes.has('keys-strip')).toBe(false);
  });

  it('le menu d\'Échap sur ordinateur : ⌨️, 📖 et ⏸ portent leur touche (data-key), que J, P et H choisissent', async () => {
    dom();
    desk();
    lang('fr-FR');
    const { UI } = await import('../src/ui/UI.js');
    const shown = [];
    UI.prototype.openMore.call({ game: { paused: false, profile: {} }, showModal: (c) => shown.push(c) });
    const flat = (x) => [x].flat(Infinity).flatMap((e) => (e?.children ? [e, ...flat(e.children)] : [e]));
    const keyed = flat(shown[0]).filter((n) => n?.tag === 'button' && n.attrs['data-key']);
    expect(keyed.map((b) => b.attrs['data-key'])).toEqual(['KeyH', 'KeyJ', 'KeyP']);
    // (sur téléphone, « ⋯ Plus » comme avant : pas de touches)
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    UI.prototype.openMore.call({ game: { paused: false, profile: {} }, showModal: (c) => shown.push(c) });
    expect(flat(shown[1]).filter((n) => n?.tag === 'button' && n.attrs['data-key'])).toEqual([]);
  });
});

describe('le tutoriel apprend les touches sur ordinateur (src/ui/tutorial.js, étape « marcher »)', () => {
  it('ordinateur : « utilise les touches Z Q S D ou les flèches », puis cliquer sur le sol et Maj pour courir ; au doigt, comme avant', async () => {
    const { Tutorial } = await import('../src/ui/tutorial.js');
    const self = { profile: { name: 'Lina', mode: 'sandbox' }, animal: () => null, ui: { modalOpen: false }, targetWhy: null };
    const move = { id: 'move' };
    lang('fr-FR');
    vi.stubGlobal('matchMedia', (q) => ({ matches: /pointer: fine/.test(q) }));
    expect(Tutorial.prototype.stepText.call(self, move)).toBe('Pour marcher, utilise les touches Z Q S D ou les flèches ⌨️.');
    expect(Tutorial.prototype.subHint.call(self, move)).toBe('Tu peux aussi cliquer sur le sol 🖱️. Pour courir, garde la touche Maj appuyée.');
    lang('en-US');
    i18n.setLang('en');
    expect(Tutorial.prototype.stepText.call(self, move)).toBe('To walk, use the W A S D keys or the arrow keys ⌨️.');
    expect(Tutorial.prototype.subHint.call(self, move)).toBe('You can also click on the ground 🖱️. To run, hold Shift.');
    i18n.setLang('fr');
    vi.stubGlobal('matchMedia', (q) => ({ matches: /pointer: coarse/.test(q) }));
    expect(Tutorial.prototype.stepText.call(self, move)).toBe(i18n.t('tuto_move_touch'));
  });
});

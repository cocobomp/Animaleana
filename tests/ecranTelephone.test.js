// Écran du téléphone (test de jeu 3) : les pastilles d'état ne cachent plus le nom ni la bulle 💬 d'un animal, ni la
// vue devant le cheval ; à cheval, les messages attendent leur tour à côté des allures ; « Quoi de neuf ? » montre
// toute sa liste ; « Monter » grisé se lit ; « ⭐ Niveau 2 » ne passe plus sous la bulle du guide.
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');

// Un tout petit DOM : ce que h() (src/ui/dom.js) et les messages (UI.toast) utilisent.
class FakeNode {}
const classes = () => {
  const s = new Set();
  return {
    set: s,
    add: (...c) => c.forEach((x) => s.add(x)),
    remove: (...c) => c.forEach((x) => s.delete(x)),
    contains: (c) => s.has(c),
    toggle: (c, on = !s.has(c)) => (on ? s.add(c) : s.delete(c), on),
  };
};
class FakeEl extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.children = [];
    this.dataset = {};
    this.classList = classes();
    this.parent = null;
    this.text = '';
  }
  set className(v) { for (const c of String(v).split(/\s+/).filter(Boolean)) this.classList.add(c); }
  get childNodes() { return this.children; }
  get parentNode() { return this.parent; }
  get firstChild() { return this.children[0] ?? null; }
  get textContent() { return this.text + this.children.map((c) => c.textContent).join(''); }
  append(...xs) {
    for (const x of xs) {
      x.remove?.();
      x.parent = this;
      this.children.push(x);
    }
  }
  replaceChildren(...xs) { this.children = []; this.append(...xs); }
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  setAttribute() {}
  addEventListener() {}
}
class FakeText extends FakeNode {
  constructor(s) { super(); this.textContent = s; }
}

let UI;
let labelsUnder;
const saved = {};
beforeAll(async () => {
  for (const k of ['document', 'window', 'Node']) saved[k] = globalThis[k];
  globalThis.Node = FakeNode;
  globalThis.document = { createElement: (tag) => new FakeEl(tag), createTextNode: (s) => new FakeText(s), body: { classList: classes() }, documentElement: { lang: 'fr' } };
  globalThis.window = { innerWidth: 390, innerHeight: 844 };
  ({ UI, labelsUnder } = await import('../src/ui/UI.js'));
}, 60000); // importer UI.js (et tout ce qu'il tire) peut être lent quand toute la suite tourne
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
});

describe('pastilles d\'état et noms des animaux (P1)', () => {
  // la pastille « 🧭 Des visiteurs t'attendent » mesurée sur un téléphone (390 × 844)
  const box = { left: 22, right: 380, top: 210, bottom: 318, height: 108 };
  const label = (y, more = {}) => ({ x: 191, y, w: 86, wish: false, near: true, ...more });

  it('Praline à 5 m : son nom tombe sous la pastille', () => {
    expect(labelsUnder(box, [label(230)])).toBe(true);
  });

  it('plus bas ou plus haut que la pastille : rien à faire', () => {
    expect(labelsUnder(box, [label(400)])).toBe(false);
    expect(labelsUnder(box, [label(150)])).toBe(false);
  });

  it('son nom juste au-dessus, mais sa bulle 💬 pend dans la pastille', () => {
    expect(labelsUnder(box, [label(190)])).toBe(false);
    expect(labelsUnder(box, [label(190, { wish: true })])).toBe(true);
  });

  it('un animal loin (plus de 10 m, nom pâli) ne fait pas pâlir les pastilles', () => {
    expect(labelsUnder(box, [label(230, { near: false })])).toBe(false);
  });

  it('à côté de la pastille (une pastille étroite, à droite) : rien', () => {
    expect(labelsUnder({ left: 250, right: 380, top: 210, bottom: 260, height: 50 }, [label(230, { x: 120, w: 80 })])).toBe(false);
  });

  it('pas de pastille (ou cachée, hauteur 0) : rien', () => {
    expect(labelsUnder(null, [label(230)])).toBe(false);
    expect(labelsUnder({ left: 0, right: 390, top: 210, bottom: 210, height: 0 }, [label(210)])).toBe(false);
  });

  it('au bord : une fois en transparence, il en faut un peu plus pour revenir (pas de clignotement)', () => {
    const edge = label(360); // (la zone de son nom commence 4 px sous la pastille : y − 38 = 322)
    expect(labelsUnder(box, [edge])).toBe(false);
    expect(labelsUnder(box, [edge], 12)).toBe(true);
  });

  const fakeBar = (box, ride) => {
    const ui = { statusBar: new FakeEl('div'), statusBox: box, game: { rig: { ride } } };
    ui.dodgeStatus = UI.prototype.dodgeStatus.bind(ui);
    return ui;
  };

  it('le nom dessous : pastilles en transparence (.under), puis de retour quand il s\'en va', () => {
    const ui = fakeBar(box, 0);
    ui.dodgeStatus([label(230)]);
    expect(ui.statusBar.classList.contains('under')).toBe(true);
    ui.dodgeStatus([label(500)]);
    expect(ui.statusBar.classList.contains('under')).toBe(false);
  });

  it('à cheval sur un écran en hauteur (caméra de côté) : la vue devant le cheval passe (.ahead)', () => {
    const ui = fakeBar(box, 1);
    ui.dodgeStatus([]);
    expect(ui.statusBar.classList.contains('ahead')).toBe(true);
    // (ordinateur : les pastilles sont en bas, rien à faire ; à pied non plus)
    const low = fakeBar({ left: 400, right: 800, top: 650, bottom: 700, height: 50 }, 1);
    low.dodgeStatus([]);
    expect(low.statusBar.classList.contains('ahead')).toBe(false);
    const foot = fakeBar(box, 0);
    foot.dodgeStatus([]);
    expect(foot.statusBar.classList.contains('ahead')).toBe(false);
  });

  it('le suivi de quête aussi : Praline à 8 m, son nom dessous ; il pâlit, puis revient (sa place : tutorial.trackerBox)', () => {
    const tracker = { left: 140, right: 382, top: 156, bottom: 204 }; // (mesuré à 390 × 844 ; placeTracker ne garde pas height)
    const praline = label(211); // (son nom de y 173 à 217)
    expect(labelsUnder(tracker, [praline])).toBe(true);
    const ui = fakeBar(null, 0);
    ui.tutorial = { tracker: new FakeEl('div'), trackerBox: tracker };
    const faded = () => ui.tutorial.tracker.classList.contains('under');
    ui.dodgeStatus([praline]);
    expect(faded()).toBe(true);
    ui.dodgeStatus([label(500)]);
    expect(faded()).toBe(false);
    ui.tutorial.trackerBox = null; // (caché : pas de quête, une fiche ouverte…)
    ui.dodgeStatus([praline]);
    expect(faded()).toBe(false);
  });

  it('CSS : transparentes, on touche le nom à travers ; le chrono du cross reste lisible ; « Tu montes » caché au doigt', () => {
    expect(css).toMatch(/#status-bar\.under \{ pointer-events: none; \}/);
    expect(css).toMatch(/#status-bar\.under > \.status-chip \{ opacity: 0\.2; \}/);
    expect(css).toMatch(/#status-bar\.ahead:not\(\.under\) > \.status-chip:not\(\.timing\) \{ opacity: 0\.35; \}/);
    const phone = css.match(/@media \(pointer: coarse\), \(max-width: 640px\) \{\s*#status-bar \{[^}]*\}[\s\S]*?\n\}/)[0];
    expect(phone).toMatch(/#status-bar \.ride-chip:not\(\.timing\) \{ display: none; \}/);
    // (pendant le cross : le chrono seul, sans son « Descendre » qui l'élargissait sur le tronc suivant)
    expect(phone).toMatch(/#status-bar \.ride-chip\.timing button \{ display: none; \}/);
    expect(css).toMatch(/#quest-tracker\.under \{ opacity: 0\.2; pointer-events: none; \}/);
  });
});

describe('à cheval, les messages attendent leur tour (P6)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    document.body.classList.set.clear();
    window.innerWidth = 390;
    window.innerHeight = 844;
  });
  afterEach(() => vi.useRealTimers());

  const fakeUi = () => {
    const ui = { toasts: new FakeEl('div'), fitToasts() {} };
    for (const k of ['toast', 'toastTimers', 'toastsFull', 'nextToast']) ui[k] = UI.prototype[k];
    return ui;
  };
  const visible = (ui) => ui.toasts.children.filter((x) => !x.classList.contains('out')).map((x) => x.textContent);

  it('à pied : tous à la fois, comme avant (quatre au plus)', () => {
    const ui = fakeUi();
    for (let i = 1; i <= 5; i++) ui.toast(`m${i}`);
    expect(visible(ui)).toEqual(['m2', 'm3', 'm4', 'm5']);
  });

  it('à cheval sur un téléphone : deux à la fois, les suivants viennent quand un message s\'en va ; aucun perdu', () => {
    document.body.classList.add('riding');
    const ui = fakeUi();
    const seen = new Set();
    const look = () => visible(ui).forEach((x) => seen.add(x));
    for (let i = 1; i <= 5; i++) ui.toast(`m${i}`, 3200);
    look();
    expect(visible(ui)).toEqual(['m1', 'm2']);
    expect(ui.toastWait.length).toBe(3);
    for (let k = 0; k < 6; k++) {
      vi.advanceTimersByTime(3200);
      look();
      expect(visible(ui).length).toBeLessThanOrEqual(2);
    }
    expect([...seen]).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
    expect(ui.toastWait.length).toBe(0);
  });

  it('un message long qui attend ne reste pas plus de 5 s (la file avance)', () => {
    document.body.classList.add('riding');
    const ui = fakeUi();
    ui.toast('a', 9000);
    ui.toast('b', 9000);
    ui.toast('c', 9000);
    expect(ui.toastWait[0][1]).toBe(5000);
  });

  it('une avalanche : les plus anciens en attente partent (quatre au plus en attente)', () => {
    document.body.classList.add('riding');
    const ui = fakeUi();
    for (let i = 1; i <= 8; i++) ui.toast(`m${i}`);
    expect(ui.toastWait.map((x) => x[0])).toEqual(['m5', 'm6', 'm7', 'm8']);
  });

  it('on descend : ceux qui attendaient viennent tout de suite', () => {
    document.body.classList.add('riding');
    const ui = fakeUi();
    for (let i = 1; i <= 4; i++) ui.toast(`m${i}`);
    document.body.classList.remove('riding');
    ui.nextToast();
    expect(visible(ui)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('petit écran (667 px de haut) ou paysage : un seul à la fois (deux n\'y tiennent pas), les autres à leur tour', () => {
    document.body.classList.add('riding');
    for (const [w, hgt] of [[375, 667], [390, 760], [844, 390], [667, 375]]) {
      window.innerWidth = w;
      window.innerHeight = hgt;
      const ui = fakeUi();
      const seen = [];
      for (let i = 1; i <= 3; i++) ui.toast(`m${i}`, 3200);
      for (let k = 0; k < 4; k++) {
        expect(visible(ui).length).toBeLessThanOrEqual(1);
        visible(ui).forEach((x) => seen.includes(x) || seen.push(x));
        vi.advanceTimersByTime(3200);
      }
      expect(seen).toEqual(['m1', 'm2', 'm3']);
    }
    window.innerWidth = 390;
    window.innerHeight = 761; // (juste plus haut : deux)
    const ui = fakeUi();
    for (let i = 1; i <= 3; i++) ui.toast(`m${i}`);
    expect(visible(ui)).toEqual(['m1', 'm2']);
  });

  it('deux n\'y tiennent plus (fitToasts ôte le premier, ⤴️ Sauter arrive) : la file ne passe pas d\'un coup', () => {
    document.body.classList.add('riding');
    const ui = fakeUi();
    const seen = new Set();
    for (let i = 1; i <= 5; i++) ui.toast(`m${i}`, 3200);
    ui.fitToasts = function () { while (this.toasts.children.length > 1) this.toasts.firstChild.remove(); };
    vi.advanceTimersByTime(3200); // (m1 et m2 s'en vont ensemble ; m2, ôté par m3, ne fait pas venir m4)
    expect(visible(ui)).toEqual(['m3']);
    expect(ui.toastWait.map((x) => x[0])).toEqual(['m4', 'm5']);
    for (let k = 0; k < 3; k++) {
      visible(ui).forEach((x) => seen.add(x));
      vi.advanceTimersByTime(3200);
    }
    expect([...seen]).toEqual(['m3', 'm4', 'm5']);
  });

  it('le conseil de ⤴️ Sauter (opts.now) n\'attend pas : le tronc serait passé ; le plus ancien message s\'efface', () => {
    document.body.classList.add('riding');
    window.innerHeight = 667;
    const ui = fakeUi();
    ui.toast('fj_where', 7000);
    ui.toast('quête', 4000);
    ui.toast('fj_tip', 7000, { now: true });
    // (ôté tout de suite : le conseil prend sa place en haut, pas en dessous d'un message qui s'efface)
    expect(ui.toasts.children.map((x) => x.textContent)).toEqual(['fj_tip']);
    expect(ui.toastWait.map((x) => x[0])).toEqual(['quête']);
    vi.advanceTimersByTime(7000); // (le conseil s'en va : la quête vient à son tour)
    expect(visible(ui)).toEqual(['quête']);
  });

  it('à cheval sur un ordinateur : pas d\'attente (les messages sont loin des allures)', () => {
    document.body.classList.add('riding');
    window.innerWidth = 1280;
    const ui = fakeUi();
    for (let i = 1; i <= 3; i++) ui.toast(`m${i}`);
    expect(visible(ui)).toEqual(['m1', 'm2', 'm3']);
  });

  it('CSS : au téléphone en selle, les messages se rangent à gauche des allures (portrait) ou de ⤴️ Sauter (paysage)', () => {
    expect(css).toMatch(/@media \(pointer: coarse\) and \(max-width: 640px\) \{\s*body\.riding #toasts \{ left: calc\(12px \+ var\(--safe-l\)\); transform: none; width: calc\(100vw - 104px/);
    expect(css).toMatch(/@media \(pointer: coarse\) and \(max-height: 480px\) and \(min-width: 641px\) \{\s*body\.riding #toasts \{ left: calc\(182px \+ var\(--safe-l\)\); right: calc\(304px \+ var\(--safe-r\)\); width: auto; \}/);
    // (les allures : 56 px + 6 px de chaque côté, à 14 px du bord → 104 px laissent 10 px d'écart)
    expect(css).toMatch(/#gait-pad \{ left: auto; right: calc\(14px \+ var\(--safe-r\)\);[^}]*\}/);
    expect(css).toMatch(/\.gait-btn \{ width: 56px; height: 56px;/);
  });

  it('CSS : moins de 760 px de haut, la colonne passe à gauche de ⤴️ Sauter / ⬆️ Enlever (10 px d\'écart)', () => {
    const w = +css.match(/@media \(pointer: coarse\) and \(max-width: 640px\) and \(max-height: 760px\) \{\s*body\.riding #toasts \{ width: calc\(100vw - (\d+)px - var\(--safe-l\) - var\(--safe-r\)\); \}/)[1];
    const right = +css.match(/#post-btn, #jump-btn \{ left: auto; right: calc\((\d+)px \+ var\(--safe-r\)\); bottom: calc\(306px/)[1];
    const size = +css.match(/#post-btn, #jump-btn \{\s*position: fixed;[^}]*width: (\d+)px; height: \1px;/)[1];
    expect(w - 12 - right - size).toBe(10); // (la colonne commence à 12 px du bord gauche)
    // (colonnes étroites, petit écran et paysage : texte un peu plus petit, « Tu montes… » ne descend plus sur ⬇️ Descendre)
    for (const q of ['\\(max-width: 640px\\) and \\(max-height: 760px\\)', '\\(max-height: 480px\\) and \\(min-width: 641px\\)']) {
      expect(css).toMatch(new RegExp(`@media \\(pointer: coarse\\) and ${q} \\{[^}]*\\}\\s*body\\.riding #toasts \\.toast \\{ font-size: 0\\.85rem;`));
    }
  });
});

describe('« ⭐ Niveau 2 » et la bulle du guide (P6, tutoriel)', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const fakeUi = (bubbleShown) => {
    const shown = [];
    const ui = {
      panel: { title: '🐾 Refuge' }, modalOpen: false,
      panelEl: Object.assign(new FakeEl('aside'), { style: {} }),
      tutorial: { bubble: { hidden: !bubbleShown } },
      game: { running: true, activities: { active: null }, input: {} },
      toast: (msg) => shown.push(['toast', msg]),
      alert: (msg) => shown.push(['alert', msg]),
    };
    for (const k of ['levelUp', 'flushLevelUps', 'closePanel']) ui[k] = UI.prototype[k].bind(ui);
    return { ui, shown };
  };

  it('téléphone, le refuge ouvert sous la bulle du guide : il attend, puis vient en grand quand on ferme', () => {
    window.innerWidth = 390;
    const { ui, shown } = fakeUi(true);
    ui.levelUp(2, 'Niche');
    vi.advanceTimersByTime(5000);
    expect(shown).toEqual([]);
    expect(ui.levelQueue.length).toBe(1);
    ui.closePanel(); // (le ✕ que le guide montre)
    vi.advanceTimersByTime(400);
    expect(shown.map((s) => s[0])).toEqual(['alert']);
    expect(shown[0][1]).toMatch(/2/);
  });

  it('fermer un panneau sans rien en attente : pas d\'annonce', () => {
    const { ui, shown } = fakeUi(true);
    ui.closePanel();
    vi.advanceTimersByTime(1000);
    expect(shown).toEqual([]);
  });

  it('sans la bulle du guide, en paysage ou sur un ordinateur (les messages passent sous la bulle) : une bulle tout de suite', () => {
    window.innerWidth = 390;
    const a = fakeUi(false);
    a.ui.levelUp(2, '');
    vi.advanceTimersByTime(1200);
    expect(a.shown.map((s) => s[0])).toEqual(['toast']);
    for (const w of [844, 1280]) {
      window.innerWidth = w;
      const b = fakeUi(true);
      b.ui.levelUp(2, '');
      vi.advanceTimersByTime(1200);
      expect(b.shown.map((s) => s[0])).toEqual(['toast']);
    }
    window.innerWidth = 390;
  });
});

describe('« Quoi de neuf ? » et « Monter » grisé (P8, P9)', () => {
  it('dans la fenêtre, la liste ne défile plus toute seule (c\'est la fenêtre qui défile) ; l\'Aide garde la sienne', () => {
    expect(css).toMatch(/\.modal-box > \.news-list \{ max-height: none; overflow: visible; \}/);
    expect(css).toMatch(/\.news-list \{[^}]*max-height: 52vh; overflow-y: auto; \}/);
  });

  it('une action principale grisée garde un texte sombre (blanc sur beige, « Monter » ne se lisait pas)', () => {
    expect(css).toMatch(/\.big-action\.off\.primary \{ color: var\(--ink\); \}/);
    expect(css).toMatch(/\.big-action\.off\.primary small \{ color: var\(--muted\); \}/);
    // (après les règles qu'elles corrigent : même poids ou plus, et plus bas dans le fichier)
    expect(css.indexOf('.big-action.off.primary {')).toBeGreaterThan(css.indexOf('.big-action.primary small {'));
    expect(css.indexOf('.big-action.off.primary {')).toBeGreaterThan(css.indexOf('button.primary {'));
  });
});

// 🫧 Toucher la bulle de ton cheval (src/ui/UI.js : wishHit, tapWish, doWish ; src/game/Game.js : interact) : tu vas
// vers lui et tu fais ce qu'il demande. Le bouton vert près de lui le dit (« 🌾 Pomme a faim ») et E le fait aussi.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';
import { createAnimal } from '../src/sim/animal.js';
import { createProfile } from '../src/sim/profile.js';
import { seeded } from '../src/sim/rng.js';
import { starterTack } from '../src/sim/gear.js';
import { ICONS } from '../src/sim/horseWish.js';

// Un tout petit DOM : ce que h() (src/ui/dom.js) utilise, et les clics.
class FakeNode {}
class FakeEl extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = tag;
    this.children = [];
    this.attrs = {};
    this.style = {};
    this.on = {};
    this.parent = null;
    this.hidden = false;
    const s = new Set();
    this.classList = { set: s, add: (c) => s.add(c), toggle: (c, on) => (on ? s.add(c) : s.delete(c)), contains: (c) => s.has(c) };
  }
  set className(v) { for (const c of String(v).split(/\s+/).filter(Boolean)) this.classList.add(c); }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.children = [new FakeText(v)]; }
  append(...xs) {
    for (const y of xs) {
      const x = typeof y === 'string' ? new FakeText(y) : y; // (comme le vrai DOM : un texte devient un nœud)
      x.remove?.();
      x.parent = this;
      this.children.push(x);
    }
  }
  prepend(...xs) {
    const kids = this.children;
    this.children = [];
    this.append(...xs);
    this.children.push(...kids);
  }
  replaceChildren(...xs) { this.children = []; this.append(...xs); }
  remove() {
    if (!this.parent) return;
    this.parent.children.splice(this.parent.children.indexOf(this), 1);
    this.parent = null;
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(type, fn) { this.on[type] = fn; }
}
class FakeText extends FakeNode {
  constructor(s) { super(); this.textContent = s; }
}

let UI;
let Game;
let Tutorial;
let t;
const saved = {};
beforeAll(async () => {
  for (const k of ['document', 'window', 'Node']) saved[k] = globalThis[k];
  globalThis.Node = FakeNode;
  globalThis.document = { createElement: (tag) => new FakeEl(tag), createTextNode: (s) => new FakeText(s), body: { classList: { add() {}, remove() {} } }, documentElement: { lang: 'fr' } };
  globalThis.window = { innerWidth: 390, innerHeight: 844, addEventListener() {} };
  ({ UI } = await import('../src/ui/UI.js'));
  ({ Game } = await import('../src/game/Game.js'));
  ({ Tutorial } = await import('../src/ui/tutorial.js'));
  ({ t } = await import('../src/i18n.js'));
}, 60000); // (UI.js et Game.js tirent beaucoup de modules : lent quand toute la suite tourne)
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
});

const horse = () => {
  const a = createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'f', ageDays: 2000, rng: seeded('pomme') });
  a.name = 'Pomme';
  return a;
};
const wish = (id) => ({ id, icon: ICONS[id], task: id });

/** Fausse interface : doWish et ce qu'il appelle (les soins, seller, monter, desseller, son menu), notés dans calls. */
function fakeUi(a, w, { paused = false } = {}) {
  const calls = [];
  const p = createProfile('Lou');
  p.animals.push(a);
  const e = { data: a, wish: w, position: new THREE.Vector3(3, 0, 4), radius: 0.8 };
  const g = {
    profile: p, isHome: true, entities: new Map([[a.id, e]]), player: { mount: null },
    blockedByPause: () => paused,
    ride: (x) => calls.push(['ride', x.name]),
    dismount: () => { calls.push(['dismount', g.player.mount.data.name]); g.player.mount = null; },
    unsaddle: (x) => calls.push(['unsaddle', x.name]),
    walkTo: (pos, r, done, follow) => calls.push(['walkTo', pos === e.position, r, follow, done]),
  };
  const ui = {
    game: g,
    closePanel: () => calls.push(['closePanel']),
    careWithGame: (x, act) => calls.push(['care', act]),
    saddleWithGame: (x, ride) => calls.push(['saddle', ride]),
    openAnimalActions: (x) => calls.push(['menu', x.name]),
  };
  ui.doWish = UI.prototype.doWish.bind(ui);
  ui.tapWish = UI.prototype.tapWish.bind(ui);
  return { ui, g, e, p, calls };
}

describe('ce qu\'il demande, en un geste (UI.doWish)', () => {
  it('🌾 💧 🪮 ❤️ : le soin et son mini-jeu', () => {
    for (const [id, act] of [['hay', 'feed'], ['water', 'water'], ['brush', 'brush'], ['pet', 'pet']]) {
      const { ui, calls } = fakeUi(horse(), wish(id));
      ui.doWish(ui.game.entities.values().next().value.data);
      expect(calls).toEqual([['care', act]]);
    }
  });

  it('🏇 sans selle, une selle libre à la sellerie : seller, brider, puis monter ; sellé : en selle tout de suite', () => {
    const a = horse();
    const { ui, p, calls } = fakeUi(a, wish('work'));
    starterTack(p, a);
    ui.doWish(a);
    expect(calls).toEqual([['closePanel'], ['saddle', true]]);
    calls.length = 0;
    a.gear.saddle = { item: 'saddle' };
    ui.doWish(a);
    expect(calls).toEqual([['closePanel'], ['ride', 'Pomme']]);
    calls.length = 0;
    delete a.gear.saddle;
    p.items.saddle = 0; // (plus de selle libre : à cru, comme « Monter » de son menu)
    ui.doWish(a);
    expect(calls).toEqual([['closePanel'], ['ride', 'Pomme']]);
  });

  it('🏇 en selle sur un autre cheval : on en descend d\'abord (il ne reste pas « monté » pour toujours)', () => {
    const a = horse();
    const { ui, g, p, calls } = fakeUi(a, wish('work'));
    starterTack(p, a);
    const other = createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'm', ageDays: 2000, rng: seeded('caramel') });
    other.name = 'Caramel';
    g.player.mount = { data: other };
    ui.doWish(a);
    expect(calls).toEqual([['closePanel'], ['dismount', 'Caramel'], ['saddle', true]]);
    calls.length = 0;
    a.gear.saddle = { item: 'saddle' };
    g.player.mount = { data: other };
    ui.doWish(a);
    expect(calls).toEqual([['closePanel'], ['dismount', 'Caramel'], ['ride', 'Pomme']]);
  });

  it('🧰 : desseller ; plus de bulle (il a bu seul en chemin) : son menu ; en pause : rien', () => {
    const a = horse();
    const { ui, e, calls } = fakeUi(a, wish('untack'));
    ui.doWish(a);
    expect(calls).toEqual([['unsaddle', 'Pomme']]);
    calls.length = 0;
    e.wish = null;
    ui.doWish(a);
    expect(calls).toEqual([['menu', 'Pomme']]);
    const paused = fakeUi(horse(), wish('hay'), { paused: true });
    paused.ui.doWish(paused.e.data);
    expect(paused.calls).toEqual([]);
  });

  it('sa bulle touchée : tu marches jusqu\'à lui, puis tu le fais ; sans bulle, rien', () => {
    const a = horse();
    const { ui, e, calls } = fakeUi(a, wish('water'));
    ui.tapWish(a.id);
    expect(calls).toHaveLength(1);
    const [kind, same, r, follow, done] = calls[0];
    expect([kind, same, follow]).toEqual(['walkTo', true, true]);
    expect(r).toBeCloseTo(e.radius + 1.2);
    done();
    expect(calls.at(-1)).toEqual(['care', 'water']);
    calls.length = 0;
    e.wish = null;
    ui.tapWish(a.id);
    expect(calls).toEqual([]);
  });
});

describe('le bouton vert près de lui (UI.setFocus, Game.interact)', () => {
  it('« 🌾 Pomme a faim », « 🧰 Desselle Pomme » ; sans bulle : « S\'occuper de Pomme »', () => {
    const a = horse();
    const btn = new FakeEl('button');
    const ui = { actionBtn: btn, game: {} };
    const e = { data: a, wish: wish('hay') };
    UI.prototype.setFocus.call(ui, { kind: 'animal', entity: e });
    expect(btn.hidden).toBe(false);
    expect(btn.textContent).toBe(`🌾 ${t('wish_btn_hay', { name: 'Pomme' })}E`);
    expect(btn.textContent).toContain('Pomme a faim');
    e.wish = wish('untack');
    UI.prototype.setFocus.call(ui, { kind: 'animal', entity: e });
    expect(btn.textContent).toContain('🧰 Desselle Pomme');
    e.wish = null;
    UI.prototype.setFocus.call(ui, { kind: 'animal', entity: e });
    expect(btn.textContent).toContain(t('interact', { name: 'Pomme' }));
  });

  it('E (ou un toucher) : ce qu\'il demande ; sans bulle, son menu', () => {
    const a = horse();
    const calls = [];
    const g = {
      activities: { onInteract: () => false },
      ui: { doWish: (x) => calls.push(['wish', x.name]), openAnimalActions: (x) => calls.push(['menu', x.name]) },
      focus: { kind: 'animal', entity: { data: a, wish: wish('pet') } },
    };
    Game.prototype.interact.call(g);
    g.focus.entity.wish = null;
    Game.prototype.interact.call(g);
    expect(calls).toEqual([['wish', 'Pomme'], ['menu', 'Pomme']]);
  });
});

describe('sa bulle se touche (UI.updateLabels)', () => {
  const camera = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 200);
  camera.position.set(0, 2, 6);
  camera.lookAt(0, 1, 0);
  camera.updateMatrixWorld();
  const make = () => {
    const a = horse();
    const e = { data: a, wish: wish('hay'), position: new THREE.Vector3(0, 0, 0), label: { position: { y: 2.2 } }, radius: 0.8 };
    const ui = {
      game: { rig: null, moodOf: () => 'happy', entities: new Map([[a.id, e]]), walkTo: (...args) => ui.walked.push(args) },
      walked: [],
      statusBox: null,
      statusBar: { childElementCount: 0 },
      labels: new FakeEl('div'),
      labelEls: new Map(),
      wishEls: new Map(),
      dodgeStatus() {},
    };
    for (const k of ['updateLabels', 'wishHit', 'tapWish', 'clearLabels', 'doWish']) ui[k] = UI.prototype[k].bind(ui);
    return { a, e, ui };
  };
  const hits = (ui) => ui.labels.children.filter((x) => x.classList.contains('wish-hit'));

  it('un bouton sur la bulle, sous son nom ; touché : tu vas vers lui', () => {
    const { a, e, ui } = make();
    ui.updateLabels([e], camera, new THREE.Vector3(0, 0, 5));
    const [b] = hits(ui);
    expect(b.hidden).toBe(false);
    expect(b.attrs['aria-label']).toBe(t('wish_tap', { g: 'f' }));
    const label = ui.labelEls.get(a.id);
    const [, lx, ly] = label.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/).map(Number);
    const [, bx, by] = b.style.transform.match(/translate\(([-\d.]+)px, ([-\d.]+)px\)/).map(Number);
    expect(by).toBeCloseTo(ly + 38); // (la bulle pend au point d'accroche de son nom)
    expect(bx + 30).toBeGreaterThan(lx); // (centrée sous lui)
    expect(ui.labels.children[0]).toBe(b); // (sous les noms : un nom posé sur sa bulle gagne le toucher)
    let stopped = false;
    b.on.click({ stopPropagation: () => { stopped = true; } });
    expect(stopped).toBe(true);
    expect(ui.walked).toHaveLength(1);
  });

  it('plus de bulle, son nom écarté, ou trop loin : caché ; parti : enlevé', () => {
    const { e, ui } = make();
    const near = new THREE.Vector3(0, 0, 5);
    ui.updateLabels([e], camera, near);
    expect(hits(ui)).toHaveLength(1);
    e.wish = null;
    ui.updateLabels([e], camera, near);
    expect(hits(ui)[0].hidden).toBe(true);
    e.wish = wish('water');
    ui.updateLabels([e], camera, near);
    expect(hits(ui)[0].hidden).toBe(false);
    ui.updateLabels([e], camera, new THREE.Vector3(0, 0, 12)); // (à 12 m : son nom pâli, plus de bulle)
    expect(hits(ui)[0].hidden).toBe(true);
    ui.updateLabels([], camera, near);
    expect(hits(ui)).toHaveLength(0);
    expect(ui.wishEls.size).toBe(0);
    ui.updateLabels([e], camera, near);
    ui.clearLabels();
    expect(ui.labels.children).toHaveLength(0);
  });

  it('pas de bulle : pas de bouton créé', () => {
    const { e, ui } = make();
    e.wish = null;
    ui.updateLabels([e], camera, new THREE.Vector3(0, 0, 5));
    expect(hits(ui)).toHaveLength(0);
  });
});

describe('le guide des quêtes près de lui (Tutorial.resolveAnimal)', () => {
  const make = (w) => {
    const a = horse();
    const e = { data: a, wish: w, ridden: false, position: new THREE.Vector3(), radius: 0.8 };
    const label = { name: 'label' };
    const actionBtn = { hidden: false, name: 'action' };
    const self = {
      animal: () => a,
      game: { focus: { kind: 'animal', entity: e }, entities: new Map([[a.id, e]]), player: { mount: null }, animalsHere: () => [a] },
      ui: { panel: null, actionBtn, labelEls: new Map([[a.id, label]]) },
    };
    return { e, at: (spec, forAction) => Tutorial.prototype.resolveAnimal.call(self, spec, forAction).el?.name };
  };

  it('« caresse-le » et sa bulle demande ❤️ : le bouton vert ; elle demande 🌾 : son nom (qui ouvre son menu)', () => {
    const { e, at } = make(wish('pet'));
    expect(at({ type: 'action', id: 'pet' }, true)).toBe('action');
    e.wish = wish('hay');
    expect(at({ type: 'action', id: 'pet' }, true)).toBe('label');
    expect(at({ type: 'action', id: 'feed' }, true)).toBe('action');
    expect(at({ type: 'animal' }, false)).toBe('label'); // (« touche ton cheval » : son menu)
    e.wish = null;
    expect(at({ type: 'animal' }, false)).toBe('action'); // (sans bulle : comme avant)
  });
});

describe('le guide dit le bouton Nourrir de ton animal (Tutorial.stepText)', () => {
  it('🌾 pour un cheval, 🍖 pour un chien', () => {
    const feed = { id: 'feed' };
    const a = horse();
    const self = { animal: () => a, profile: { name: 'Lou' } };
    expect(Tutorial.prototype.stepText.call(self, feed)).toContain('🌾');
    const dog = createAnimal({ species: 'dog', sex: 'm', ageDays: 900, rng: seeded('rex') });
    self.animal = () => dog;
    const text = Tutorial.prototype.stepText.call(self, feed);
    expect(text).toContain('🍖');
    expect(text).not.toContain('🌾');
    expect(text).not.toContain('{');
  });
});

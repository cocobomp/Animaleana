// 🫧 Toucher la bulle de ton cheval (src/ui/UI.js : wishHit, tapWish, doWish ; src/game/Game.js : interact) : tu vas
// vers lui et tu fais ce qu'il demande. Le bouton vert près de lui le dit (« 🌾 Pomme a faim ») et E le fait aussi.
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as THREE from 'three';
import { createAnimal } from '../src/sim/animal.js';
import { createProfile } from '../src/sim/profile.js';
import { seeded } from '../src/sim/rng.js';
import { starterTack, GEAR } from '../src/sim/gear.js';
import { ICONS } from '../src/sim/horseWish.js';

// (les mini-jeux pour de faux : ce que l'enfant en fait, mg.result — null : fermé avec ✕ — et ce qu'il y a vu, mg.out)
const mg = vi.hoisted(() => ({ result: 1, out: null, played: [], opts: null }));
vi.mock('../src/ui/minigames.js', async (importOriginal) => ({
  ...(await importOriginal()),
  runMinigame: async (ui, a, action, opts = {}) => {
    mg.played.push(action);
    mg.opts = opts;
    if (mg.out) opts.out = { ...mg.out };
    return mg.result;
  },
}));

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
let setLang;
const saved = {};
beforeAll(async () => {
  for (const k of ['document', 'window', 'Node']) saved[k] = globalThis[k];
  globalThis.Node = FakeNode;
  globalThis.document = { createElement: (tag) => new FakeEl(tag), createTextNode: (s) => new FakeText(s), body: { classList: { add() {}, remove() {} } }, documentElement: { lang: 'fr' } };
  globalThis.window = { innerWidth: 390, innerHeight: 844, addEventListener() {} };
  ({ UI } = await import('../src/ui/UI.js'));
  ({ Game } = await import('../src/game/Game.js'));
  ({ Tutorial } = await import('../src/ui/tutorial.js'));
  ({ t, setLang } = await import('../src/i18n.js'));
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
  for (const k of ['doWish', 'tapWish', 'busyForWish']) ui[k] = UI.prototype[k].bind(ui);
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

  it('🏇 en selle sur un autre cheval : on y reste pendant qu\'on selle (✕ ne change rien) ; Game.ride fait changer de cheval', () => {
    const a = horse();
    const { ui, g, p, calls } = fakeUi(a, wish('work'));
    starterTack(p, a);
    const other = createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'm', ageDays: 2000, rng: seeded('caramel') });
    other.name = 'Caramel';
    g.player.mount = { data: other };
    ui.doWish(a);
    expect(calls).toEqual([['closePanel'], ['saddle', true]]);
    expect(g.player.mount.data).toBe(other);
    calls.length = 0;
    a.gear.saddle = { item: 'saddle' };
    ui.doWish(a);
    expect(calls).toEqual([['closePanel'], ['ride', 'Pomme']]);
  });

  it('pendant une activité (un cheval qui te suit en balade) ou un voyage : sa bulle touchée ne fait rien', () => {
    const a = horse();
    const { ui, g, calls } = fakeUi(a, wish('work'));
    g.activities = { active: { type: 'trail' } };
    ui.tapWish(a.id);
    ui.doWish(a);
    expect(calls).toEqual([]);
    g.activities.active = null;
    g.tripFlow = { active: true };
    ui.tapWish(a.id);
    expect(calls).toEqual([]);
    g.tripFlow.active = false;
    ui.tapWish(a.id);
    expect(calls.map((c) => c[0])).toEqual(['walkTo']);
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
    a.gear = { saddle: { item: 'saddle' }, bridle: { item: 'bridle' } };
    UI.prototype.setFocus.call(ui, { kind: 'animal', entity: e });
    expect(btn.textContent).toContain('🧰 Desselle Pomme');
    delete a.gear.saddle; // (monté à cru : seulement son filet, comme « 🧰 Débrider » dans son menu)
    UI.prototype.setFocus.call(ui, { kind: 'animal', entity: e });
    expect(btn.textContent).toContain('🧰 Débride Pomme');
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
    for (const k of ['updateLabels', 'wishHit', 'tapWish', 'clearLabels', 'doWish', 'busyForWish']) ui[k] = UI.prototype[k].bind(ui);
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

describe('seller un autre cheval, en selle sur le premier (UI.saddleWithGame)', () => {
  it('on reste sur le premier pendant le mini-jeu ; ✕ : rien ne change ; réussi : Game.ride fait changer de cheval', async () => {
    const a = horse();
    const calls = [];
    const p = createProfile('Lou');
    p.animals.push(a);
    starterTack(p, a);
    const other = { data: { name: 'Caramel' } };
    const g = {
      profile: p, isHome: true, player: { mount: other },
      blockedByPause: () => false,
      dismount: () => calls.push(['dismount']),
      saddle: (x) => { calls.push(['saddle', x.name]); x.gear.saddle = { item: 'saddle' }; return { ok: true }; },
      bridle: (x) => { calls.push(['bridle', x.name]); x.gear.bridle = { item: 'bridle' }; return { ok: true }; },
      ride: (x) => calls.push(['ride', x.name]),
    };
    const ui = { game: g };
    Object.assign(mg, { result: null, out: null, played: [] });
    expect(await UI.prototype.saddleWithGame.call(ui, a, true)).toBeNull();
    expect(mg.played).toEqual(['saddle']);
    expect(calls).toEqual([]);
    expect(g.player.mount).toBe(other);
    mg.result = 1;
    await UI.prototype.saddleWithGame.call(ui, a, true);
    const kinds = calls.map((c) => c[0]);
    expect(kinds[0]).toBe('saddle');
    expect(kinds.at(-1)).toBe('ride');
    expect(kinds).not.toContain('dismount');
  });
});

describe('changer de cheval en selle (Game.ride) ; 🧰 pas pour une selle toute neuve (a.freshTack)', () => {
  const rideGame = () => {
    const p = createProfile('Lou');
    const a = horse();
    const b = createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'm', ageDays: 2000, rng: seeded('caramel') });
    b.name = 'Caramel';
    p.animals.push(a, b);
    starterTack(p, a);
    starterTack(p, b);
    const calls = [];
    const ent = (x) => ({ data: x, applyGear() {}, stopRoll() {}, emit() {} });
    const g = Object.create(Game.prototype);
    Object.assign(g, {
      profile: p, entities: new Map([[a.id, ent(a)], [b.id, ent(b)]]), // (isHome, day, hour : lus dans le profil)
      // (Game.mountRider pour de vrai : sa bombe, puis Player.ride)
      player: { mount: null, session: null, setHelmet() {}, seat() {}, ride(e) { calls.push(['mount', e.data.name]); this.mount = e; } },
      ui: { toast: (m) => calls.push(['toast', m]), updateGaitPad() {} },
      dismount(o) { calls.push(['dismount', this.player.mount.data.name, o]); this.player.mount = null; },
      markHorseDay() {}, remember() {}, bondNews() {}, simWeather: () => 'clear', xp() {}, save() {},
    });
    g.player.mount = g.entities.get(a.id);
    return { g, a, b, p, calls };
  };

  it('en selle sur Pomme, monter Caramel : on descend sans la carte (on ne la verrait pas), puis on monte', () => {
    const { g, b, calls } = rideGame();
    Game.prototype.ride.call(g, b);
    const steps = calls.filter((c) => c[0] !== 'toast');
    expect(steps).toEqual([['dismount', 'Pomme', { card: false }], ['mount', 'Caramel']]);
    expect(g.player.mount.data).toBe(b);
  });

  it('Caramel ne peut pas être monté : on reste sur Pomme', () => {
    const { g, a, b, calls } = rideGame();
    b.lame = { cause: 'stone', foot: 0 };
    Game.prototype.ride.call(g, b);
    expect(calls.filter((c) => c[0] !== 'toast')).toEqual([]);
    expect(g.player.mount.data).toBe(a);
  });

  it('sellé et bridé (Game.saddle, Game.bridle) : la selle est neuve ; monté avec (Game.ride) ou dessellé : plus', () => {
    const { g, b } = rideGame();
    g.player.mount = null;
    expect(Game.prototype.saddle.call(g, b)).toBeTruthy();
    expect(b.freshTack).toBe(true);
    delete b.freshTack;
    expect(Game.prototype.bridle.call(g, b)).toBeTruthy();
    expect(b.freshTack).toBe(true);
    Game.prototype.ride.call(g, b);
    expect(g.player.mount.data).toBe(b);
    expect(b.freshTack).toBeUndefined();
    g.player.mount = null;
    b.freshTack = true;
    expect(Game.prototype.unsaddle.call(g, b)).toBe(true);
    expect(b.freshTack).toBeUndefined();
    // (longé avec sa selle : elle a servi aussi)
    b.freshTack = true;
    Game.prototype.markHorseDay.call(g, b, 'lunge');
    expect(b.freshTack).toBeUndefined();
  });

  it('mis depuis sa fiche ou la sellerie (Game.equip) : neuf aussi ; pas pour une autre couleur, ni en selle sur lui', () => {
    const { g, b } = rideGame();
    g.player.mount = null;
    const put = (item, color) => Game.prototype.equip.call(g, b, item, color)?.ok;
    expect(put('saddle')).toBe(true);
    expect(b.freshTack).toBe(true);
    // (la même selle, d'une autre couleur : elle a peut-être déjà servi ce matin)
    delete b.freshTack;
    const id = b.gear.saddle.item;
    expect(put(id, GEAR[id].colors.find((c) => c !== b.gear.saddle.color))).toBe(true);
    expect(b.freshTack).toBeUndefined();
    // en selle sur lui : le filet sert tout de suite
    g.player.mount = g.entities.get(b.id);
    expect(put('bridle')).toBe(true);
    expect(b.freshTack).toBeUndefined();
  });

  it('monté pour un voyage à cheval ou remis en selle à l\'arrivée (Game.mountRider, pas Game.ride) : la selle a servi', () => {
    const { g, b } = rideGame();
    g.player.mount = null;
    b.freshTack = true;
    Game.prototype.mountRider.call(g, g.entities.get(b.id));
    expect(g.player.mount.data).toBe(b);
    expect(b.freshTack).toBeUndefined();
  });
});

describe('🧦 le conseil des chaussettes de boue, après le pansage (UI.careWithGame)', () => {
  const careUi = () => {
    const p = createProfile('Lou');
    const cared = [];
    const toasts = [];
    const g = { profile: p, blockedByPause: () => false, canCare: () => ({ ok: true }), care: (x, act, q) => { cared.push([act, q]); return true; } };
    return { p, cared, toasts, ui: { game: g, toast: (m, ms, o) => toasts.push([m, ms, o]) } };
  };

  it('ses jambes brossées : un message de 9 s après le mini-jeu (en selle : pas en file), une seule fois', async () => {
    const a = horse();
    const { p, cared, toasts, ui } = careUi();
    Object.assign(mg, { result: 0.9, out: { legMudTip: true }, played: [] });
    expect(await UI.prototype.careWithGame.call(ui, a, 'brush')).toBe(true);
    expect(mg.opts.legMudTip).toBe(true);
    expect(cared).toEqual([['brush', 0.9]]);
    expect(toasts).toEqual([[`🧦 ${t('mg_pansage_legmud_tip')}`, 9000, { now: true }]]);
    expect(p.legMudTip).toBe(true);
    // déjà lu : le mini-jeu ne le note plus
    mg.out = { hooves: { cleaned: 1 } };
    await UI.prototype.careWithGame.call(ui, a, 'brush');
    expect(mg.opts.legMudTip).toBe(false);
    expect(toasts).toHaveLength(1);
    mg.out = null;
  });

  it('fermé avec ✕ après ses jambes : le conseil quand même, rien d\'appliqué', async () => {
    const a = horse();
    const { p, cared, toasts, ui } = careUi();
    Object.assign(mg, { result: null, out: { legMudTip: true }, played: [] });
    expect(await UI.prototype.careWithGame.call(ui, a, 'brush')).toBeNull();
    expect(cared).toEqual([]);
    expect(toasts).toHaveLength(1);
    expect(p.legMudTip).toBe(true);
    Object.assign(mg, { result: 1, out: null });
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

describe('les quêtes disent aussi 🌾 Nourrir pour un cheval (Tutorial.stepLabel, hintText)', () => {
  it('« Touche 🌾 Nourrir » pour son cheval, 🍖 pour un chien, rien quand on ne sait pas lequel ; jamais « {icon} »', async () => {
    const { hintText } = await import('../src/ui/quests.js');
    const { FOLLOW_STEPS, QUEST_ORDER } = await import('../src/sim/tutorial.js');
    const a = horse();
    const dog = createAnimal({ species: 'dog', sex: 'm', ageDays: 900, rng: seeded('rex') });
    const p = createProfile('Lou');
    p.animals.push(a, dog);
    const label = (x, id) => Tutorial.prototype.stepLabel.call({ animal: () => x }, id);
    setLang('fr');
    expect(label(a, 'do_feed')).toBe('Touche 🌾 Nourrir');
    expect(label(dog, 'do_feed')).toBe('Touche 🍖 Nourrir');
    expect(label(null, 'do_feed')).toBe('Touche Nourrir');
    expect(label(dog, 'horse_feed')).toBe('Touche 🌾 Nourrir'); // (l'histoire de ton cheval)
    expect(hintText(p, 'horseFeed3')).toContain('🌾 Nourrir');
    expect(hintText(p, 'feed5')).toBe('Touche ton animal, puis Nourrir.'); // (le journal : n'importe quel animal)
    expect(hintText(p, 'feed5', dog)).toBe('Touche ton animal, puis 🍖 Nourrir.');
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const x of [a, dog, null]) {
        for (const id of Object.keys(FOLLOW_STEPS)) {
          expect(label(x, id), `${lang} ${id}`).not.toMatch(/\{icon\}/);
          if (x === a) expect(label(x, id), `${lang} ${id}`).not.toContain('🍖'); // (pas de 🍖 pour son cheval)
        }
      }
      for (const id of QUEST_ORDER) expect(hintText(p, id), `${lang} ${id}`).not.toMatch(/\{icon\}/);
      expect(t('quest_step_horse_feed')).toContain('🌾');
      expect(t('quest_hint_horseFeed3')).toContain('🌾');
    }
    setLang('fr');
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

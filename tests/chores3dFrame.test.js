// Le cadre des mini-jeux (src/ui/minigames.js) pour les CORVÉES en 3D (curer, pailler, balayer : chores3d.js) :
// la scène s'ouvre sans animal et le jeu 3D tourne ; la scène ne peut pas s'ouvrir, ou le jeu 3D échoue : le jeu
// dessiné ; ?care3d=off : pas de scène ; à la fermeture, tout est rendu. Même petit DOM en faux que
// tests/care3dFrame.test.js ; la scène 3D est une fausse scène qu'on commande (vi.mock).
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

const ctl = { scene: null, game3d: null, opened: 0, chore: null, setting: '' };
function fakeScene(ui, over = {}) {
  const sc = {
    canvas: new (globalThis.FakeEl)('canvas'), ready: false, lost: false, lostFor: 0, disposed: 0, released: 0,
    updates: 0, renders: 0, focus: null, noAnimal: true,
    warm: () => Promise.resolve().then(() => { sc.ready = true; }),
    update() { sc.updates++; },
    render() { sc.renders++; },
    resize() {},
    setFocus(top, bottom) { sc.focus = [top, bottom]; },
    dispose() { sc.disposed++; },
    ...over,
  };
  ui.vxCover = (ui.vxCover ?? 0) + 1;
  sc.release = () => { sc.released++; ui.vxCover--; };
  return sc;
}
vi.mock('../src/ui/minigames/care3d.js', () => ({
  openCareScene: () => null,
  care3dGameFor: () => null,
  CARE3D_GAMES: {},
  openChoreScene: (ui, chore) => {
    ctl.opened++;
    ctl.chore = chore;
    return ctl.scene ? ctl.scene(ui) : null;
  },
  chore3dGameFor: () => (ctx) => ctl.game3d(ctx),
}));
vi.mock('../src/game/care/which.js', () => ({
  care3dWanted: () => false,
  care3dPossible: () => false,
  care3dSetting: () => ctl.setting,
  chore3dWanted: (kind) => ctl.setting !== 'off' && ['muck', 'straw', 'sweep'].includes(kind),
  CHORE3D_KINDS: new Set(['muck', 'straw', 'sweep']),
}));

// ---------------------------------------------------------------- un petit DOM
class FakeEl {
  constructor(tag) {
    Object.assign(this, { tagName: String(tag).toUpperCase(), children: [], attrs: {}, style: {}, dataset: {}, listeners: {}, parent: null, hidden: false, textContent: '', disabled: false, className: '' });
    const cls = new Set();
    this.classList = { add: (...c) => c.forEach((x) => cls.add(x)), remove: (...c) => c.forEach((x) => cls.delete(x)), contains: (c) => cls.has(c), toggle: (c, on) => ((on ?? !cls.has(c)) ? cls.add(c) : cls.delete(c)) };
  }
  append(...c) { for (const x of c) { if (x && typeof x === 'object') x.parent = this; this.children.push(x); } }
  insertBefore(x, ref) { x.parent = this; const i = this.children.indexOf(ref); this.children.splice(i < 0 ? this.children.length : i, 0, x); }
  replaceChildren(...c) { this.children = []; this.append(...c); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener() {}
  dispatch(type, e = {}) { for (const fn of this.listeners[type] ?? []) fn({ preventDefault() {}, target: this, ...e }); }
  querySelectorAll(sel) {
    const out = [];
    const walk = (n) => { for (const c of n.children ?? []) { if (c instanceof FakeEl) { if (sel === 'button' ? c.tagName === 'BUTTON' : false) out.push(c); walk(c); } } };
    walk(this);
    return out;
  }
  querySelector() { return null; }
  get firstElementChild() { return this.children.find((c) => c instanceof FakeEl) ?? null; }
  get isConnected() { return true; }
  get offsetHeight() { return 0; }
  get offsetTop() { return 300; }
  get offsetWidth() { return 0; }
  get clientWidth() { return 390; }
  get clientHeight() { return 560; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 390, height: 560, x: 0, y: 0 }; }
  getClientRects() { return [1]; }
  getContext() { return ctx2d; }
  focus() {}
  blur() {}
  setPointerCapture() {}
  releasePointerCapture() {}
}
const ctx2d = new Proxy({}, {
  get: (o, k) => (k in o ? o[k] : k === 'measureText' ? () => ({ width: 10 }) : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}),
  set: (o, k, v) => { o[k] = v; return true; },
});
const saved = {};
let rafQueue = [];
let now = 0;
/** Fait tourner la boucle du cadre n images de dt secondes. */
async function frames(n, dt = 1 / 30) {
  for (let i = 0; i < n; i++) {
    now += dt * 1000;
    const q = rafQueue;
    rafQueue = [];
    for (const f of q) f(now);
    await Promise.resolve();
  }
}


let runChoreGame;
beforeAll(async () => {
  for (const k of ['document', 'window', 'Node', 'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle', 'ResizeObserver', 'FakeEl']) saved[k] = globalThis[k];
  globalThis.FakeEl = FakeEl;
  globalThis.Node = FakeEl;
  const body = new FakeEl('body');
  globalThis.document = { createElement: (tag) => new FakeEl(tag), createTextNode: (s) => ({ data: String(s) }), body, documentElement: { lang: 'fr' }, activeElement: null, querySelector: () => null, querySelectorAll: () => [], getElementById: () => null };
  globalThis.window = { innerWidth: 390, innerHeight: 844, devicePixelRatio: 2, addEventListener() {}, removeEventListener() {}, dispatchEvent() {} };
  globalThis.requestAnimationFrame = (f) => { rafQueue.push(f); return rafQueue.length; };
  globalThis.cancelAnimationFrame = () => { rafQueue = []; };
  globalThis.getComputedStyle = () => ({ width: '390px', height: '560px', paddingTop: '0', paddingBottom: '0' });
  globalThis.ResizeObserver = class { observe() {} disconnect() {} };
  ({ runChoreGame } = await import('../src/ui/minigames.js'));
});
afterAll(async () => {
  await new Promise((r) => setTimeout(r, 20));
  for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
});

function makeUi() {
  return { ui: { root: new FakeEl('div'), game: { profile: { animals: [] }, input: { enabled: true } }, vxCover: 0, minigameOpen: false } };
}
function game3d(g = {}) {
  g.updates = 0;
  g.destroyed = 0;
  return (ctx) => {
    g.ctx = ctx;
    return { peek: () => ({ three: true }), update() { g.updates++; }, draw() {}, destroy() { g.destroyed++; } };
  };
}
function closeX(ui) {
  const find = (n) => (n instanceof FakeEl ? (n.className === 'mg-close' ? n : n.children.map(find).find(Boolean)) : null);
  find(ui.root).dispatch('click');
}

beforeEach(() => {
  ctl.scene = null;
  ctl.game3d = null;
  ctl.opened = 0;
  ctl.chore = null;
  ctl.setting = '';
  rafQueue = [];
});

describe('le cadre et les corvées en 3D', () => {
  for (const kind of ['muck', 'straw', 'sweep']) {
    it(`${kind} : la scène s'ouvre (la corvée, sa cible), le jeu 3D tourne ; fermé, tout est rendu`, async () => {
      const { ui } = makeUi();
      let sc = null;
      ctl.scene = (u) => (sc = fakeScene(u));
      const g = {};
      ctl.game3d = game3d(g);
      const done = runChoreGame(ui, kind, kind === 'sweep' ? null : 2);
      await frames(12);
      expect(ctl.opened).toBe(1);
      expect(ctl.chore).toEqual({ kind, target: kind === 'sweep' ? null : 2 });
      expect(ui.minigame.scene3d).toBe(sc);
      expect(ui.minigame.peek()).toEqual({ three: true });
      expect(g.updates).toBeGreaterThan(3);
      expect(sc.renders).toBeGreaterThan(3);
      expect(ui.vxCover).toBe(1);
      closeX(ui);
      expect(await done).toBe(null);
      expect(g.destroyed).toBe(1);
      expect(sc.disposed).toBe(1);
      expect(ui.vxCover).toBe(0);
    });
  }

  it('la scène ne peut pas s\'ouvrir (WebGL absent) : la corvée dessinée', async () => {
    const { ui } = makeUi();
    const done = runChoreGame(ui, 'muck', 0);
    await frames(3);
    expect(ctl.opened).toBe(1);
    expect(ui.minigame.scene3d).toBe(null);
    expect(ui.minigame.peek().items?.length, 'le crottin du jeu dessiné').toBeGreaterThan(0);
    expect(ui.vxCover).toBe(0);
    closeX(ui);
    await done;
  });

  it('le jeu 3D échoue au départ : la scène est rendue, la corvée dessinée prend la suite', async () => {
    const { ui } = makeUi();
    let sc = null;
    ctl.scene = (u) => (sc = fakeScene(u));
    ctl.game3d = () => { throw new Error('boum'); };
    const done = runChoreGame(ui, 'sweep');
    await frames(3);
    expect(sc.disposed).toBe(1);
    expect(ui.vxCover).toBe(0);
    expect(ui.minigame.scene3d).toBe(null);
    expect(ui.minigame.peek().total, 'les brins du jeu dessiné').toBeGreaterThan(0);
    closeX(ui);
    await done;
  });

  it('?care3d=off : pas de scène, la corvée dessinée ; ranger le salon reste dessiné', async () => {
    ctl.setting = 'off';
    let { ui } = makeUi();
    let done = runChoreGame(ui, 'straw', 0);
    await frames(3);
    expect(ctl.opened).toBe(0);
    expect(ui.minigame.scene3d).toBe(null);
    closeX(ui);
    await done;
    ctl.setting = '';
    ({ ui } = makeUi());
    done = runChoreGame(ui, 'living');
    await frames(3);
    expect(ctl.opened).toBe(0);
    closeX(ui);
    await done;
  });
});

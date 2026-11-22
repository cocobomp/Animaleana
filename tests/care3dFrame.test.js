// Le cadre des mini-jeux (src/ui/minigames.js) avec une scène de soin 3D : ce qui se passe vraiment quand la 3D ne
// peut pas s'ouvrir, quand le jeu 3D échoue au départ ou pendant la partie, quand la préparation échoue ou que le
// contexte WebGL ne revient pas (le jeu dessiné prend la suite), et ce qui est rendu à la fermeture. Un petit DOM
// en faux ; la scène 3D est remplacée par une fausse scène qu'on commande (vi.mock).
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';

// ---------------------------------------------------------------- la fausse scène et le faux jeu 3D
const ctl = { scene: null, game3d: null, opened: 0 };
function fakeScene(ui, over = {}) {
  const sc = {
    canvas: new (globalThis.FakeEl)('canvas'), ready: false, lost: false, lostFor: 0, disposed: 0, released: 0,
    updates: 0, renders: 0, focus: null,
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
  openCareScene: (ui, a, host, above) => {
    ctl.opened++;
    return ctl.scene ? ctl.scene(ui) : null;
  },
  care3dGameFor: () => (ctx) => ctl.game3d(ctx),
  CARE3D_GAMES: {},
}));
vi.mock('../src/game/care/which.js', () => ({
  care3dWanted: (a, action) => a?.species === 'horse' && action === 'feed',
  care3dPossible: (a) => a?.species === 'horse',
  care3dSetting: () => '',
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

let runMinigame;
let t;
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
  ({ runMinigame } = await import('../src/ui/minigames.js'));
  ({ t } = await import('../src/i18n.js'));
});
afterAll(async () => {
  // (la fermeture rend le focus un peu après, dans un setTimeout : on le laisse passer)
  await new Promise((r) => setTimeout(r, 20));
  for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
});

/** Le jeu, en faux : un cheval, une racine pour la fenêtre. */
function makeUi() {
  const a = { id: 'h1', species: 'horse', breed: 'selle_francais', name: 'Honey', sex: 'f', look: { coat: 0x8a5a2b, mane: 0x222222, seed: 3 }, needs: { hunger: 20 }, personality: 'calm' };
  const ui = { root: new FakeEl('div'), game: { profile: { animals: [a] }, input: { enabled: true } }, vxCover: 0, minigameOpen: false };
  return { ui, a };
}
/** Un faux jeu 3D qui note ce qu'on lui demande. */
function game3d(g = {}) {
  g.updates = 0;
  g.destroyed = 0;
  return (ctx) => {
    g.ctx = ctx;
    return { peek: () => ({ three: true }), update() { g.updates++; }, draw() {}, destroy() { g.destroyed++; } };
  };
}

beforeEach(() => {
  ctl.scene = null;
  ctl.game3d = null;
  ctl.opened = 0;
  rafQueue = [];
});

describe('le cadre et la scène 3D', () => {
  it('la scène ne peut pas s\'ouvrir (WebGL, erreur) : le jeu dessiné, sans 3D', async () => {
    const { ui, a } = makeUi();
    const done = runMinigame(ui, a, 'feed');
    await frames(3);
    expect(ctl.opened).toBe(1);
    expect(ui.minigame.scene3d).toBe(null);
    expect(ui.minigame.peek().stage).toBe('hay'); // (la ration dessinée)
    expect(ui.vxCover).toBe(0);
    ui.minigame && closeX(ui);
    expect(await done).toBe(null);
  });

  it('le jeu 3D échoue au départ : la scène est fermée et rendue, le jeu dessiné prend la suite', async () => {
    const { ui, a } = makeUi();
    let sc = null;
    ctl.scene = (u) => (sc = fakeScene(u));
    ctl.game3d = () => { throw new Error('boum'); };
    const done = runMinigame(ui, a, 'feed');
    await frames(3);
    expect(sc.disposed).toBe(1);
    expect(sc.released).toBe(1);
    expect(ui.vxCover).toBe(0);
    expect(ui.minigame.scene3d).toBe(null);
    expect(ui.minigame.peek().stage).toBe('hay');
    closeX(ui);
    await done;
  });

  it('pendant la préparation, le jeu attend (le temps ne compte pas) ; prête, il joue', async () => {
    const { ui, a } = makeUi();
    let sc = null;
    let go = null;
    ctl.scene = (u) => (sc = fakeScene(u, { warm: () => new Promise((r) => { go = () => { sc.ready = true; r(); }; }) }));
    const g = {};
    ctl.game3d = game3d(g);
    const done = runMinigame(ui, a, 'feed');
    await frames(10);
    expect(ui.minigame.ctx.time).toBe(0);
    expect(g.updates ?? 0).toBe(0);
    expect(sc.renders).toBe(0);
    go();
    await frames(10);
    expect(ui.minigame.ctx.time).toBeGreaterThan(0.2);
    expect(sc.renders).toBeGreaterThan(5);
    closeX(ui);
    await done;
    // fermeture : le jeu 3D libéré, la scène libérée et rendue, le monde se redessine
    expect(sc.disposed).toBe(1);
    expect(ui.vxCover).toBe(0);
    expect(ui.minigame).toBe(null);
  });

  it('la préparation échoue : le jeu dessiné (pas d\'emoji qui attend pour toujours)', async () => {
    const { ui, a } = makeUi();
    let sc = null;
    ctl.scene = (u) => (sc = fakeScene(u, { warm: () => Promise.reject(new Error('shaders')) }));
    ctl.game3d = game3d();
    const done = runMinigame(ui, a, 'feed');
    await frames(3);
    expect(sc.disposed).toBe(1);
    expect(ui.minigame.scene3d).toBe(null);
    expect(ui.minigame.peek().stage).toBe('hay');
    closeX(ui);
    await done;
  });

  it('la préparation ne finit jamais : le jeu dessiné au bout de 25 s', async () => {
    const { ui, a } = makeUi();
    let sc = null;
    ctl.scene = (u) => (sc = fakeScene(u, { warm: () => new Promise(() => {}) }));
    ctl.game3d = game3d();
    const done = runMinigame(ui, a, 'feed');
    await frames(240, 0.1);
    expect(ui.minigame.scene3d).toBe(sc);
    await frames(20, 0.1);
    expect(sc.disposed).toBe(1);
    expect(ui.minigame.peek().stage).toBe('hay');
    closeX(ui);
    await done;
  });

  it('une erreur de la scène pendant la partie : le jeu dessiné reprend (la partie ne se fige pas)', async () => {
    const { ui, a } = makeUi();
    let sc = null;
    let boom = false;
    ctl.scene = (u) => (sc = fakeScene(u, { render() { if (boom) throw new Error('render'); } }));
    const g = {};
    ctl.game3d = game3d(g);
    const done = runMinigame(ui, a, 'feed');
    await frames(5);
    expect(ui.minigame.peek().three).toBe(true);
    boom = true;
    await frames(3);
    expect(g.destroyed).toBe(1);
    expect(sc.disposed).toBe(1);
    expect(ui.vxCover).toBe(0);
    expect(ui.minigame.peek().stage).toBe('hay');
    await frames(3);
    closeX(ui);
    await done;
  });

  it('le contexte WebGL perdu : le jeu attend ; toujours perdu après 4 s, le jeu dessiné', async () => {
    const { ui, a } = makeUi();
    let sc = null;
    ctl.scene = (u) => (sc = fakeScene(u));
    ctl.game3d = game3d();
    const done = runMinigame(ui, a, 'feed');
    await frames(5);
    const t0 = ui.minigame.ctx.time;
    sc.lost = true;
    await frames(30, 0.1);
    expect(ui.minigame.ctx.time).toBeCloseTo(t0, 5); // (le temps ne compte pas)
    expect(ui.minigame.scene3d).toBe(sc);
    await frames(15, 0.1);
    expect(sc.disposed).toBe(1);
    expect(ui.minigame.peek().stage).toBe('hay');
    closeX(ui);
    await done;
  });
});

/** Appuie sur ✕. */
function closeX(ui) {
  const find = (n) => (n instanceof FakeEl ? (n.className === 'mg-close' ? n : n.children.map(find).find(Boolean)) : null);
  const x = find(ui.root);
  x.dispatch('click');
}

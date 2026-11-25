// ⭐ La carte de fin des mini-jeux (src/ui/minigames.js showEnd) et la prime du travail bien fait (src/sim/wellDone.js) :
// les étoiles sont celles de la carte (starsFor(quality, endVerdict)), notées dans wellDone pour Game.wellDone ; la
// pastille « +5 🪙 » est DANS la ligne des étoiles (la carte ne grandit pas) ; aucune pastille si la prime vaut 0, ni
// sans wellDone (métiers, seller, brider…). Même petit DOM en faux que tests/chores3dFrame.test.js ; une fausse scène
// 3D et un faux jeu qui finit tout de suite.
import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const ctl = { finish: null };
vi.mock('../src/ui/minigames/care3d.js', () => ({
  openCareScene: () => null,
  care3dGameFor: () => null,
  CARE3D_GAMES: {},
  openChoreScene: (ui) => {
    ui.vxCover = (ui.vxCover ?? 0) + 1;
    return {
      canvas: new (globalThis.FakeEl)('canvas'), ready: true, lost: false, lostFor: 0, noAnimal: true,
      warm: () => Promise.resolve(), update() {}, render() {}, resize() {}, setFocus() {}, dispose() {},
      release: () => { ui.vxCover--; },
    };
  },
  // (le jeu de la corvée finit à sa première image, avec la note et le verdict choisis : ctl.finish)
  chore3dGameFor: () => (ctx) => ({ peek: () => ({}), update() { if (!ctx.done) ctx.finish(...ctl.finish); }, draw() {}, destroy() {} }),
}));
vi.mock('../src/game/care/which.js', () => ({
  care3dWanted: () => false,
  care3dPossible: () => false,
  care3dSetting: () => '',
  chore3dWanted: () => true,
  CHORE3D_KINDS: new Set(['muck', 'straw', 'sweep']),
}));

// ---------------------------------------------------------------- un petit DOM
class FakeEl {
  constructor(tag) {
    Object.assign(this, { tagName: String(tag).toUpperCase(), children: [], attrs: {}, style: {}, dataset: {}, listeners: {}, parent: null, hidden: false, disabled: false, className: '' });
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
  get textContent() { return this.children.map((c) => (c instanceof FakeEl ? c.textContent : c.data ?? '')).join(''); }
  set textContent(v) { this.children = [{ data: String(v) }]; }
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
let WD;
let createProfile;
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
  WD = await import('../src/sim/wellDone.js');
  ({ createProfile } = await import('../src/sim/profile.js'));
}, 60000);
afterAll(async () => {
  vi.useRealTimers();
  await new Promise((r) => setTimeout(r, 20));
  for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
});
beforeEach(() => {
  rafQueue = [];
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
});

/** Un mini-jeu de corvée qui finit (note q, verdict why) ; renvoie la carte de fin et sa promesse. */
async function playChore({ q = 1, why = null, wellDone = null } = {}) {
  ctl.finish = [q, null, why];
  const ui = { root: new FakeEl('div'), game: { profile: { animals: [] }, input: { enabled: true } }, vxCover: 0, minigameOpen: false };
  const done = runChoreGame(ui, 'muck', 0, { wellDone });
  await frames(4);
  vi.advanceTimersByTime(2500); // (la carte de fin vient 1,9 s après, scène 3D)
  const find = (n, cls) => (n instanceof FakeEl ? (String(n.className).split(' ').includes(cls) ? n : n.children.map((c) => find(c, cls)).find(Boolean)) : null);
  return { ui, done, find: (cls) => find(ui.root, cls) ?? null };
}
const wdFor = (p, day = 5) => {
  const wd = { key: 'chore:muck:0:maison', own: true, stars: null };
  wd.preview = (stars) => WD.wellDonePreview(p, { stars, key: wd.key, own: true, day });
  return wd;
};

describe('⭐ la carte de fin et la prime', () => {
  it('★★★ : les étoiles notées pour Game.wellDone, la pastille « +5 🪙 » DANS la ligne des étoiles', async () => {
    const p = Object.assign(createProfile('Lina', 'manage'), { money: 100 });
    const wd = wdFor(p);
    const { find, done } = await playChore({ q: 1, wellDone: wd });
    expect(wd.stars).toBe(3);
    const stars = find('mg-stars');
    const pill = find('mg-prime');
    expect(pill.textContent).toBe('+5 🪙');
    expect(pill.parent).toBe(stars); // (dans la ligne des étoiles : la carte ne grandit pas)
    expect(stars.className).toBe('mg-stars has-prime');
    expect(stars.attrs['aria-label']).toBe('3/3 · +5 🪙');
    expect(p.money).toBe(100); // (rien n'est payé sur la carte : après la corvée réussie, Game.wellDone)
    find('mg-continue').dispatch('click');
    expect(await done).toBe(1);
  });
  it('une note de 1 avec le verdict « un peu trop peu » : ★★ sur la carte, donc ★★ notées et « +2 🪙 » (jamais ★★★)', async () => {
    const p = Object.assign(createProfile('Lina', 'manage'), { money: 100 });
    const wd = wdFor(p);
    const { find, done } = await playChore({ q: 1, why: 'low', wellDone: wd });
    expect(wd.stars).toBe(2);
    expect(find('mg-prime').textContent).toBe('+2 🪙');
    find('mg-continue').dispatch('click');
    await done;
  });
  it('★ : pas de pastille (rien de plus, rien en moins)', async () => {
    const p = createProfile('Lina', 'manage');
    const wd = wdFor(p);
    const { find, done } = await playChore({ q: 0.4, wellDone: wd });
    expect(wd.stars).toBe(1);
    expect(find('mg-prime')).toBe(null);
    expect(find('mg-stars').attrs['aria-label']).toBe('1/3');
    find('mg-continue').dispatch('click');
    await done;
  });
  it('plafond du jour atteint, ou bac à sable : pas de pastille (les étoiles sont quand même notées)', async () => {
    const p = createProfile('Lina', 'manage');
    p.wellDone = { day: 5, coins: 20, keys: [] };
    for (const prof of [p, createProfile('Lina', 'sandbox')]) {
      const wd = wdFor(prof);
      const { find, done } = await playChore({ q: 1, wellDone: wd });
      expect(wd.stars).toBe(3);
      expect(find('mg-prime')).toBe(null);
      find('mg-continue').dispatch('click');
      await done;
    }
  });
  it('sans wellDone (métiers, seller, brider, vermifuge…) : la carte comme avant, sans pastille', async () => {
    const { find, done } = await playChore({ q: 1 });
    expect(find('mg-stars').attrs['aria-label']).toBe('3/3');
    expect(find('mg-stars').className).toBe('mg-stars');
    expect(find('mg-prime')).toBe(null);
    find('mg-continue').dispatch('click');
    await done;
  });
  it('fermé avant la fin (✕) : pas d\'étoiles notées, donc pas de prime', async () => {
    ctl.finish = [1, null, null];
    const p = createProfile('Lina', 'manage');
    const wd = wdFor(p);
    const ui = { root: new FakeEl('div'), game: { profile: { animals: [] }, input: { enabled: true } }, vxCover: 0, minigameOpen: false };
    const done = runChoreGame(ui, 'muck', 0, { wellDone: wd });
    const find = (n) => (n instanceof FakeEl ? (n.className === 'mg-close' ? n : n.children.map(find).find(Boolean)) : null);
    find(ui.root).dispatch('click');
    expect(await done).toBe(null);
    expect(wd.stars).toBe(null);
  });
});

describe('📱 au téléphone (style.css)', () => {
  const css = () => readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
  const rule = (sel) => { const c = css(); const i = c.indexOf(`${sel} {`); return i < 0 ? '' : c.slice(i, c.indexOf('}', i)); };
  it('la pastille est posée sur les étoiles (position absolue : la carte ne grandit pas), sur une ligne', () => {
    expect(rule('.mg-stars .mg-prime')).toMatch(/position: absolute/);
    expect(rule('.mg-stars .mg-prime')).toMatch(/white-space: nowrap/);
    expect(rule('.mg-stars.has-prime')).toMatch(/position: relative/);
    expect(css()).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.mg-stars \.mg-prime \{ animation: none; \} \}/);
  });
  it('les défis du jour : le texte passe à la ligne, les pièces jamais coupées (320 px)', () => {
    expect(rule('.dc-text')).toMatch(/min-width: 0/);
    expect(rule('.dc-pay')).toMatch(/white-space: nowrap/);
    expect(rule('.dc-pay')).toMatch(/flex-shrink: 0/);
  });
});

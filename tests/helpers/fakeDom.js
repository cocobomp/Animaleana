// Un tout petit faux DOM (sans navigateur) pour tester l'interface fabriquée avec h() (src/ui/dom.js) : éléments,
// textes, classes, style, attributs, écouteurs, offsetParent (hiddenFlag : caché), animate() noté dans animations.

export class FakeNode {
  constructor() { this.parentNode = null; }
  remove() {
    if (!this.parentNode) return;
    const k = this.parentNode.children;
    k.splice(k.indexOf(this), 1);
    this.parentNode = null;
  }
  get isConnected() {
    let n = this;
    while (n.parentNode) n = n.parentNode;
    return n === globalThis.document?.body;
  }
}

export class FakeText extends FakeNode {
  constructor(s) { super(); this.textContent = s; }
}

export const animations = [];

export class FakeEl extends FakeNode {
  constructor(tag) {
    super();
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.classes = new Set();
    this.attrs = {};
    this.listeners = {};
    this.hiddenFlag = false; // (caché : display none, offsetParent null)
    this.title = '';
    this.disabled = false;
    const vars = {};
    this.style = { setProperty: (k, v) => { vars[k] = v; }, getPropertyValue: (k) => vars[k] ?? '' };
    const self = this;
    this.classList = {
      add: (...c) => c.forEach((x) => self.classes.add(x)),
      remove: (...c) => c.forEach((x) => self.classes.delete(x)),
      toggle: (c, on) => { if (on ?? !self.classes.has(c)) self.classes.add(c); else self.classes.delete(c); },
      contains: (c) => self.classes.has(c),
    };
  }
  set className(v) { this.classes = new Set(String(v).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  setAttribute(k, v) {
    this.attrs[k] = String(v);
    if (k === 'disabled') this.disabled = true;
  }
  getAttribute(k) { return this.attrs[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  append(...nodes) {
    for (const n0 of nodes) {
      const n = typeof n0 === 'string' ? new FakeText(n0) : n0;
      n.remove();
      n.parentNode = this;
      this.children.push(n);
    }
  }
  replaceChildren(...nodes) {
    for (const c of this.children) c.parentNode = null;
    this.children = [];
    this.append(...nodes);
  }
  get textContent() { return this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.replaceChildren(String(v)); }
  get offsetParent() { return this.isConnected && !this.hiddenFlag ? globalThis.document.body : null; }
  get offsetWidth() { return 120; }
  get offsetHeight() { return 36; }
  getBoundingClientRect() { return this.rect ?? { left: 200, top: 10, right: 290, bottom: 30, width: 90, height: 20 }; }
  animate(frames, opts) {
    const a = { frames, opts, el: this, onfinish: null, oncancel: null };
    animations.push(a);
    return a;
  }
  /** Tous les descendants qui ont la classe cls. */
  findAll(cls) {
    const out = [];
    const walk = (n) => { for (const c of n.children ?? []) { if (c.classList?.contains(cls)) out.push(c); walk(c); } };
    walk(this);
    return out;
  }
}

/**
 * Installe le faux DOM (document, window, Node, Element, matchMedia, innerWidth/innerHeight) ; renvoie l'état
 * réglable : { reduced (moins d'animations), tap (le pointerdown écouté par le jeu) }.
 */
export function installFakeDom({ width = 360, height = 640 } = {}) {
  const state = { reduced: false, tap: null };
  globalThis.Node = FakeNode;
  globalThis.Element = FakeEl;
  globalThis.document = {
    documentElement: {},
    body: new FakeEl('body'),
    createElement: (tag) => new FakeEl(tag),
    createTextNode: (s) => new FakeText(s),
    addEventListener() {},
  };
  globalThis.window = { addEventListener: (type, fn) => { if (type === 'pointerdown') state.tap = fn; }, innerWidth: width, innerHeight: height };
  globalThis.innerWidth = width;
  globalThis.innerHeight = height;
  globalThis.matchMedia = () => ({ matches: state.reduced });
  return state;
}

// Le cadre des mini-jeux, en faux (mêmes méthodes que le ctx de src/ui/minigames.js), et une fausse toile 2D :
// pour essayer les jeux de soin en 3D sans navigateur (tests/care3d.test.js, tests/care3dStage.test.js).
import { makeRng } from '../../src/ui/minigames/draw.js';
import { justRight, verdict } from '../../src/ui/minigames/score.js';

/** Un faux document : des toiles 2D qui ne dessinent rien (textures peintes des accessoires). */
export function fakeDocument() {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  if (globalThis.document.createElement && globalThis.document.__careFake) return;
  const ctx2d = new Proxy({}, {
    get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} })
      : k === 'createImageData' || k === 'getImageData' ? (x, y, w, h) => ({ data: new Uint8ClampedArray((w ?? x) * (h ?? y) * 4 || 4) })
        : k === 'measureText' ? () => ({ width: 0 }) : () => {}),
    set: () => true,
  });
  globalThis.document.createElement = () => ({ width: 0, height: 0, getContext: () => ctx2d, style: {} });
  globalThis.document.__careFake = true;
}

/** Le cadre, en faux. t : les textes (src/i18n.js). */
export function fakeCtx(a, t, extra = {}) {
  const noop = () => {};
  // (méthodes en fermeture, comme le vrai cadre : un jeu 3D passe un ctx dérivé à la logique du jeu dessiné)
  const c = {
    a, W: 400, H: 360, opts: {}, name: a.name,
    view: { x0: 0, y0: -60, x1: 400, y1: 420, w: 400, h: 480, scale: 1, ox: 0, oy: 60 },
    col: { coat: '#8a5a2b', mane: '#222' }, rng: makeRng(3),
    time: 0, done: false, pointer: { x: 0, y: 0, down: false, over: false }, t, hints: [], buttons: [], finished: null,
    texts: [],
    ...extra,
  };
  c.fx = { add: noop, burst: noop, float: noop, dot: noop, text: (x, y, s) => c.texts.push(s) };
  c.hint = (text, kind = '') => c.hints.push({ text, kind });
  c.progress = noop;
  c.zone = noop;
  c.button = (text, opts = {}) => {
    const b = { text, opts };
    c.buttons.push(b);
    return b;
  };
  c.clearButtons = () => { c.buttons = []; };
  c.finish = (q, msg, why) => {
    if (c.done) return;
    c.done = true;
    c.finished = { q, msg, why };
  };
  c.finishJust = (v, lo, hi, o = {}) => {
    const why = verdict(v, lo, hi);
    c.finish(justRight(v, lo, hi, o), o.msgs?.[why] ?? '', why);
    return { verdict: why };
  };
  c.stopButton = (onStop) => c.button('✅', { cls: 'stop', onTap: onStop });
  /** Appuie sur « C'est bon ». */
  c.pressStop = () => c.buttons.find((b) => b.opts.cls?.includes('stop')).opts.onTap();
  return c;
}

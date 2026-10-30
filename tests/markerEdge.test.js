// ➜ La flèche jaune au bord de l'écran (src/game/Marker.js updateEdge) : jamais sur le suivi de quête ni sur les allures.
// Téléphone en paysage (test de jeu 4) : entre les deux, moins que sa hauteur ; posée au-dessus des allures, elle
// retombait sur le suivi et prenait le toucher de 🧭 « Suivre la quête ».
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as THREE from 'three';

let Marker;
const saved = {};
beforeAll(async () => {
  for (const k of ['window', 'document']) saved[k] = globalThis[k];
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ Marker } = await import('../src/game/Marker.js'));
});
afterAll(() => {
  for (const [k, v] of Object.entries(saved)) globalThis[k] = v;
});

const rect = (left, top, w, h) => ({ left, top, right: left + w, bottom: top + h, width: w, height: h });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

/** La flèche pour une cible à droite, hors de l'écran (W × H) ; tracker : la boîte du suivi ; pad : les allures. */
function edge(W, H, { tracker = null, pad = null, y = 1.5 } = {}) {
  globalThis.window = { innerWidth: W, innerHeight: H };
  const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 500);
  camera.updateMatrixWorld();
  const el = { hidden: true, style: {}, firstChild: { style: {} } };
  const self = {
    pos: new THREE.Vector3(40, y, -8), // (loin sur la droite, un peu devant)
    opts: {},
    edgeEl: el,
    game: {
      camera,
      ui: {
        isBlocking: () => false,
        tutorial: { trackerBox: tracker },
        gaitPad: pad ? { hidden: false, getBoundingClientRect: () => pad } : null,
      },
    },
  };
  Marker.prototype.updateEdge.call(self, { top: 0 });
  const left = parseFloat(el.style.left);
  const top = parseFloat(el.style.top);
  return { hidden: el.hidden, box: rect(left, top, 64, 64) };
}

describe('la flèche du bord (Marker.updateEdge)', () => {
  it('téléphone en paysage (844 × 390) : ni sur le suivi (🧭), ni sur les allures ; à côté du suivi, côté écran', () => {
    const tracker = rect(607, 56, 229, 77); // (le suivi contre le bord droit, sous les boutons du haut)
    const pad = rect(640, 170, 192, 54); // (les allures, à 166 px du bas)
    for (const y of [-2, 0, 1.5, 3, 5]) {
      const r = edge(844, 390, { tracker, pad, y });
      expect(r.hidden).toBe(false);
      expect(overlaps(r.box, tracker), `y ${y}`).toBe(false);
      expect(overlaps(r.box, pad), `y ${y}`).toBe(false);
      expect(r.box.left).toBeGreaterThanOrEqual(0);
    }
    // (là où le test de jeu l'a vue, 768–832 × 98–162, sur 🧭 : maintenant à gauche du suivi, à sa hauteur)
    expect(edge(844, 390, { tracker, pad }).box).toMatchObject({ left: 535, top: 50 }); // (au ras des boutons du haut)
  });

  it('portrait et ordinateur : comme avant, contre le bord (le suivi est de l\'autre côté, ou la place suffit)', () => {
    const phone = edge(390, 844, { tracker: rect(10, 180, 300, 48), pad: rect(320, 382, 56, 236) });
    expect(phone.box.left).toBe(390 - 44 - 32);
    const desk = edge(1280, 800, { tracker: rect(10, 180, 300, 120), pad: rect(16, 732, 260, 48) });
    expect(desk.box.left).toBe(1280 - 44 - 32);
  });
});

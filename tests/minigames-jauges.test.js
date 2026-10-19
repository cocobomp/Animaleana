// Jauges des mini-jeux : la jauge « en direct » suit le jeu sans retard (griffes, nœud), celle de « Démêler
// les nœuds » ne retombe plus à 0 à chaque nœud défait, et le séchage s'accorde au féminin.
// Sans DOM : un faux ctx remplace le cadre (comme tests/minigames-beaute.test.js).

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeRng, coatColors } from '../src/ui/minigames/draw.js';
import { createAnimal } from '../src/sim/animal.js';

let t;
let G;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t } = await import('../src/i18n.js'));
  G = await import('../src/ui/minigames/groomer.js');
});

const animal = (species, o = {}) => createAnimal({ species, name: 'Réglisse', personality: 'calm', ageDays: 900, colorIndex: 0, rng: makeRng(5), ...o });

function fakeCtx(a) {
  const noop = () => {};
  return {
    a,
    W: 400,
    H: 360,
    view: { x0: 0, y0: -15, x1: 400, y1: 375, w: 400, h: 390, scale: 0.8, ox: 0, oy: 12 },
    col: coatColors(a),
    fx: { add: noop, burst: noop, float: noop, text: noop, dot: noop, update: noop, draw: noop },
    rng: makeRng(7),
    time: 0,
    done: false,
    pointer: { x: 200, y: 180, down: false, over: false, type: 'touch' },
    t,
    name: a.name,
    hints: [],
    progs: [],
    finished: null,
    hint(text, kind = '') { this.hints.push({ text, kind }); },
    progress(v) { this.progs.push(v); },
    button() { return {}; },
    finish(q, msg) { if (!this.done) { this.done = true; this.finished = { q, msg }; } },
    zone() { return null; },
  };
}

describe('🧶 Démêler les nœuds (salon)', () => {
  it('la jauge monte nœud après nœud (1/5, 2/5…) au lieu de retomber à 0, et finit à 1', () => {
    const ctx = fakeCtx(animal('dog'));
    const game = G.knotsGame(ctx);
    const total = game.peek().knots.length;
    expect(total).toBeGreaterThanOrEqual(3);
    const afterEach = [];
    for (let i = 0; i < total; i++) {
      const k = game.peek().knots[0];
      game.down({ x: k.x, y: k.y });
      // On tourne doucement autour du nœud (pas trop vite : sinon « Aïe »).
      for (let s = 0; s < 400 && game.peek().knots.length === total - i; s++) {
        ctx.time += 0.05;
        const ang = s * 0.35;
        game.move({ x: k.x + Math.cos(ang) * 12, y: k.y + Math.sin(ang) * 12 }, true);
      }
      game.up();
      afterEach.push(ctx.progs.at(-1));
    }
    for (let i = 0; i < total; i++) expect(afterEach[i]).toBeCloseTo((i + 1) / total, 5);
    expect(Number.isNaN(ctx.progs.at(-1))).toBe(false);
    expect(ctx.done).toBe(true);
  });
});

describe('💨 Sécher (salon)', () => {
  const dry = (sex) => {
    const a = animal('dog', { sex });
    const ctx = fakeCtx(a);
    const game = G.dryGame(ctx);
    const { body } = game.peek();
    // Le sèche-cheveux à bonne distance (ni trop près, ni trop loin) jusqu'à ce que ce soit sec.
    Object.assign(ctx.pointer, { x: body.x, y: body.y - body.ry * 1.8, down: true, over: true });
    for (let i = 0; i < 2000 && !ctx.done; i++) game.update(0.05);
    return ctx.finished;
  };
  it('une chienne est « toute sèche et toute calme » (avant : « tout sec et tout calme »)', () => {
    expect(dry('f').msg).toMatch(/toute sèche et toute calme/);
    expect(dry('m').msg).toMatch(/tout sec et tout calme/);
  });
});

describe('jauge « en direct » (src/ui/minigames.js)', () => {
  const src = (p) => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');
  it('mise à jour à chaque image : pas de transition CSS (la jauge suivait les ciseaux avec 0,25 s de retard)', () => {
    expect(src('style.css')).toMatch(/\.mg-progress-fill\.live \{ transition: none; \}/);
    const frame = src('ui/minigames.js');
    expect(frame).toMatch(/progress\(v, opts = \{\}\) \{[\s\S]*?const live = opts\.live \?\? now - progressAt < 150;[\s\S]*?classList\.toggle\('live', live\)/);
  });
  it('les griffes et le nœud du concours le demandent explicitement', () => {
    expect(src('ui/minigames/grooming.js')).toMatch(/ctx\.progress\(1 - u, \{ live: true \}\)/);
    expect(src('ui/minigames/beauty.js')).toMatch(/ctx\.progress\(tension \/ MAX, \{ live: true \}\)/);
  });
});

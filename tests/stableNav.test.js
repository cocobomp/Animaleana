// Navigation autour du paddock et de l'écurie (src/game/nav.js + src/game/Interiors.js) : un cheval qu'on
// rentre au box doit y arriver depuis le paddock, quelle que soit sa taille ou sa place ; un cheval resté
// dehors après une réduction du paddock doit y rentrer par la porte. On fait marcher un point (rayon d'un
// cheval) vers navTarget(), avec les mêmes collisions que le jeu (World.resolveCollisions).
import { describe, it, expect, beforeAll } from 'vitest';

// Les modèles de l'écurie et de la maison dessinent leurs panneaux sur un canvas : un faux suffit ici.
const any = new Proxy(function () {}, {
  get: (_, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'then' ? undefined : any),
  apply: () => any,
  construct: () => any,
  set: () => true,
});
globalThis.document = globalThis.document ?? { createElement: () => ({ width: 0, height: 0, style: {}, getContext: () => any }) };

let nav;
let interiors;
let coreLayout;
let facilities;
beforeAll(async () => {
  nav = await import('../src/game/nav.js');
  interiors = await import('../src/game/Interiors.js');
  coreLayout = await import('../src/game/coreLayout.js');
  facilities = await import('../src/sim/facilities.js');
});

/** Construit la ferme (enclos de base + écurie) pour ce layout et cette taille d'écurie. */
function farm(layout = null, ext = 0) {
  coreLayout.applyCoreLayout(layout);
  interiors.setStableExt(ext);
  nav.setBuiltEnclosures([], []);
  const world = { heightAt: () => 0, colliders: [], interactables: [], camVolumes: [] };
  interiors.buildInteriors(world, { add() {} }, true);
  for (const id of ['paddock', 'pen', 'hutch']) world.colliders.push(...nav.fenceColliders(nav.enclosure(id)));
  // La sellerie et la maison des animaux (bâtiments fixes, comme World.build).
  const tk = facilities.tackRoomPos(ext);
  world.colliders.push({ x: tk.x, z: tk.z, ...facilities.TACKROOM_SIZE, kind: 'tackroom' });
  nav.setNavBlockers(world.colliders.filter((c) => c.kind));
  return world;
}

/** Centre d'une pièce de l'écurie (box0…) dans le monde. */
function roomCenter(world, id) {
  const b = world.interiors.stable;
  const r = b.rooms.find((x) => x.id === id);
  const lx = (r.x0 + r.x1) / 2;
  const lz = (r.z0 + r.z1) / 2;
  return { x: b.x + lx * b.c + lz * b.s, z: b.z - lx * b.s + lz * b.c };
}

/** Fait marcher un cheval de start vers goal ; renvoie où il finit et en combien de temps (s). */
function walk(world, start, goal, secs = 200) {
  const pos = { x: start.x, z: start.z };
  const R = 0.69;
  for (let t = 0; t < secs; t += 0.1) {
    if (Math.hypot(goal.x - pos.x, goal.z - pos.z) < 0.6) return { pos, t };
    const w = nav.navTarget(pos, goal, false);
    const dx = w.x - pos.x;
    const dz = w.z - pos.z;
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, 0.4);
    pos.x += (dx / d) * step;
    pos.z += (dz / d) * step;
    for (const c of world.colliders) {
      if (c.jump) continue;
      const ox = c.hw + R - Math.abs(pos.x - c.x);
      const oz = c.hd + R - Math.abs(pos.z - c.z);
      if (ox > 0 && oz > 0) {
        if (ox < oz) pos.x += Math.sign(pos.x - c.x || 1) * ox;
        else pos.z += Math.sign(pos.z - c.z || 1) * oz;
      }
    }
  }
  return { pos, t: Infinity };
}

describe('du paddock au box', () => {
  const cases = [
    ['paddock par défaut (22 × 26 m)', null, 0],
    ['ancien paddock (14 × 18 m)', { paddock: { x: -16, z: 16, w: 14, d: 18 } }, 0],
    ['paddock agrandi vers l\'est', { paddock: { x: -14, z: 20, w: 26, d: 26 } }, 0],
    ['paddock agrandi vers l\'est et le nord', { paddock: { x: -14, z: 24, w: 26, d: 34 } }, 0],
    ['paddock déplacé au nord', { paddock: { x: -16, z: 36, w: 22, d: 26 } }, 0],
    ['écurie de 12 box', null, 1],
    ['écurie de 16 box', null, 2],
  ];
  for (const [name, layout, ext] of cases) {
    it(`${name} : le cheval arrive au box, de l'intérieur du paddock et du pré`, () => {
      const world = farm(layout, ext);
      const pd = nav.enclosure('paddock');
      const box = roomCenter(world, 'box0');
      for (const start of [{ x: pd.x + pd.hw - 3, z: pd.z + pd.hd - 3 }, { x: pd.x - pd.hw + 3, z: pd.z }, { x: 0, z: 58 }]) {
        const r = walk(world, start, box);
        expect(r.t, `${name} depuis ${start.x},${start.z} : bloqué en ${r.pos.x.toFixed(1)},${r.pos.z.toFixed(1)}`).toBeLessThan(200);
      }
    });
  }
});

describe('paddock réduit contre l\'écurie', () => {
  for (const rect of [{ x: -12, z: 14, w: 14, d: 14 }, { x: -13, z: 20, w: 16, d: 26 }]) {
    it(`${rect.w} × ${rect.d} m : les chevaux restés dehors au sud-ouest rentrent par la porte`, () => {
      const world = farm({ paddock: rect });
      const pd = nav.enclosure('paddock');
      const goal = { x: pd.x, z: pd.z };
      for (const start of [{ x: -25, z: 10 }, { x: -25, z: 8 }, { x: -22, z: 9 }, { x: -25, z: 12 }]) {
        const r = walk(world, start, goal);
        expect(r.t, `depuis ${start.x},${start.z} : bloqué en ${r.pos.x.toFixed(1)},${r.pos.z.toFixed(1)}`).toBeLessThan(200);
      }
    });
  }

  it('un coin de contournement n\'est jamais pris dans un bâtiment', () => {
    farm({ paddock: { x: -13, z: 20, w: 16, d: 26 } });
    // Coin sud-ouest du paddock (−23,2 ; 4,8) : dans l'écurie. Le cheval part par le nord-ouest.
    const w = nav.navTarget({ x: -25, z: 10 }, { x: -13, z: 20 }, false);
    expect(w.z).toBeGreaterThan(10);
  });
});

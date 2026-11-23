// Chantier « soinsbeaute », point 3 : le concours de beauté du cheval en 3D (lustrer, tresser) sur le vrai cheval
// (GLB chargé dans node, faux rendu). La logique est celle des jeux dessinés : pour les mêmes gestes, la même note et
// la même couleur de ruban ; la robe brille là où on frotte, les sabots huilés brillent ; chaque geste juste ajoute
// un bouton de tresse sur la vraie crinière, puis les rubans, puis la queue. Le repli dessiné dessine le beau cheval.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { fakeCtx } from './fixtures/careCtx.js';
import { loadStageMods, makeStage, ctxFor, run, HORSES } from './fixtures/soinsbeauteStage.js';

let t;
let beauty;
let beauty3d;
let care3d;
let which;
let headFrame;
beforeAll(async () => {
  ({ t } = await loadStageMods());
  beauty = await import('../src/ui/minigames/beauty.js');
  beauty3d = await import('../src/ui/minigames/beauty3d.js');
  care3d = await import('../src/ui/minigames/care3d.js');
  which = await import('../src/game/care/which.js');
  headFrame = await import('../src/ui/minigames/headFrame.js');
}, 60000);

const random = Math.random;
let seed = 1;
beforeEach(() => {
  seed = 99;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
});
afterAll(() => {
  Math.random = random;
});

const FIVE = ['sf', 'frison', 'shetland', 'falabella', 'poulain'];

describe('concours de beauté : les jeux 3D du cheval', () => {
  it('lustrer et tresser s\'ouvrent en 3D pour le cheval (et pas pour les autres espèces)', () => {
    for (const act of ['shine', 'braid']) {
      expect(which.care3dWanted({ species: 'horse' }, act)).toBe(true);
      expect(typeof care3d.care3dGameFor({ species: 'horse' }, act)).toBe('function');
      expect(which.care3dWanted({ species: 'dog' }, act)).toBe(false);
    }
  });
});

/**
 * Passe le chiffon sur tout le corps en 3D (rangées de gestes sur le flanc, à l'écran), puis huile les deux sabots.
 * Renvoie la liste des gestes reportés sur le cheval dessiné (pour rejouer les mêmes dans le jeu dessiné).
 */
function rubAll(sc, game, ctx, map, rows = 7, passes = 1) {
  const L = sc.marks;
  const gestures = [];
  const S = sc.double.scale;
  for (let pass = 0; pass < passes; pass++) {
    for (let r = 0; r < rows; r++) {
      const k = (r + 0.5) / rows;
      const y = L.back.y + (L.belly.y - L.back.y) * k;
      const a = sc.project(new THREE.Vector3(L.tail.x + 0.05 * S, y, L.body.z + 0.5));
      const b = sc.project(new THREE.Vector3(L.chest.x, y, L.body.z + 0.5));
      const g = [];
      ctx.pointer.down = true;
      let started = false;
      for (let i = 0; i <= 24; i++) {
        const p = { x: a.x + ((b.x - a.x) * i) / 24, y: a.y + ((b.y - a.y) * i) / 24 };
        const h = sc.pickAnimal(p.x, p.y);
        const inBody = h && ['body', 'shoulder', 'hip'].includes(h.region);
        if (!started) {
          game.down(p);
          started = true;
        } else game.move(p, true);
        if (inBody) g.push(map(h.point));
        else if (g.length) {
          gestures.push(g.splice(0));
        }
        run(ctx, game, sc, 1 / 30);
      }
      game.up();
      ctx.pointer.down = false;
      if (g.length) gestures.push(g);
    }
  }
  return gestures;
}

describe('lustrer en 3D', () => {
  for (const key of FIVE) {
    it(`${key} : la robe brille là où on frotte, les sabots huilés brillent, même note que le jeu dessiné`, () => {
      const h = HORSES.find((x) => x.key === key);
      const { a, sc } = makeStage(h);
      const ctx = ctxFor(a, sc);
      const game = beauty3d.shine3dGame(ctx);
      run(ctx, game, sc, 0.5);
      // le report des gestes (le même que celui du jeu) : la forme du cheval dessiné, rejouée à part
      const ctx2 = fakeCtx(a, t);
      const game2 = beauty.shineGame(ctx2);
      const map = beauty3d.bodyTo2d(sc, game2.shape);
      const gestures = rubAll(sc, game, ctx, map);
      const s3 = game.peek();
      expect(s3.coverage).toBeGreaterThan(0.6);
      // le voile brillant : des sommets de la robe ont pris du brillant
      const gloss = sc.model.coatMesh.parent.children.find((o) => o.userData.coatGloss);
      expect(gloss).toBeTruthy();
      const col = gloss.geometry.attributes.color.array;
      let lit = 0;
      for (let i = 3; i < col.length; i += 4) if (col[i] > 0.3) lit++;
      expect(lit).toBeGreaterThan(120);
      // les sabots : on touche les deux ronds
      for (const c of s3.hoof3d) game.down(c);
      run(ctx, game, sc, 0.3);
      expect(game.peek().oiled).toEqual([true, true]);
      expect(game.peek().hooves.length).toBe(0);
      ctx.pressStop();
      // Les mêmes gestes dans le jeu dessiné : même valeur, même note.
      for (const g of gestures) {
        game2.down(g[0]);
        for (const p of g.slice(1)) game2.move(p, true);
        game2.up();
      }
      for (const hv of game2.hoofSpots) game2.down({ x: hv.x, y: hv.y });
      game2.up();
      expect(game2.peek().value).toBeCloseTo(s3.value + (1 - 0.85), 5);
      ctx2.pressStop();
      expect(ctx2.finished.why).toBe(ctx.finished.why);
      expect(ctx2.finished.q).toBeCloseTo(ctx.finished.q, 5);
      game.destroy();
      sc.dispose();
    }, 30000);
  }

  it('trop frotter, ça colle : la même note « trop » que le jeu dessiné, et le reflet devient gras', () => {
    const { a, sc } = makeStage({ breed: 'selle_francais' });
    const ctx = ctxFor(a, sc);
    const game = beauty3d.shine3dGame(ctx);
    run(ctx, game, sc, 0.5);
    const ctx2 = fakeCtx(a, t);
    const game2 = beauty.shineGame(ctx2);
    const map = beauty3d.bodyTo2d(sc, game2.shape);
    const gestures = rubAll(sc, game, ctx, map, 7, 4);
    for (const c of game.peek().hoof3d) game.down(c);
    if (!ctx.done) ctx.pressStop();
    for (const g of gestures) {
      game2.down(g[0]);
      for (const p of g.slice(1)) game2.move(p, true);
      game2.up();
    }
    for (const hv of game2.hoofSpots) game2.down({ x: hv.x, y: hv.y });
    if (!ctx2.done) ctx2.pressStop();
    expect(ctx.finished.why).toBe('high');
    expect(ctx2.finished.why).toBe('high');
    expect(ctx2.finished.q).toBeCloseTo(ctx.finished.q, 5);
    const gloss = sc.model.coatMesh.parent.children.find((o) => o.userData.coatGloss);
    const col = gloss.geometry.attributes.color.array;
    let greasy = 0;
    for (let i = 0; i < col.length; i += 4) if (col[i] > 0.1) greasy++;
    expect(greasy).toBeGreaterThan(50);
    game.destroy();
    sc.dispose();
  }, 30000);
});

/** Tresse au clavier : une erreur au début, puis les bons gestes ; la couleur ; les rubans. */
function braidKeys(game, ctx, colorKey, tick = () => {}) {
  game.key('ArrowRight', true); // (erreur : il fallait la mèche de gauche)
  tick();
  for (let i = 0; i < 40 && game.peek().phase === 'braid'; i++) {
    const s = game.peek();
    game.key(s.crossings % 2 === 0 ? 'ArrowLeft' : 'ArrowRight', true);
    tick();
  }
  const btn = ctx.buttons.find((b) => b.text === { red: '🔴', pink: '🩷', blue: '🔵', yellow: '🟡', green: '🟢', purple: '🟣' }[colorKey]);
  btn.opts.onTap();
  tick();
  for (let i = 0; i < 10 && !ctx.done; i++) {
    game.key('Enter', true);
    tick();
  }
}

describe('lustrer : un reflet satiné sur toutes les robes, pas une tache brûlée', () => {
  it('plus la robe est claire, plus le reflet ajouté est doux et étalé (gris, blanc, Appaloosa contre noir, alezan)', () => {
    const dark = [0x1a1716, 0x7a4528].map((c) => beauty3d.glossFor(c));
    const light = [0xb3b0aa, 0xf1ece2, 0xd8d4cc].map((c) => beauty3d.glossFor(c));
    for (const l of light) for (const d of dark) {
      expect(l.alpha).toBeLessThan(d.alpha * 0.6);
      expect(l.roughness).toBeGreaterThan(d.roughness + 0.1);
      expect(l.env).toBeLessThan(d.env);
    }
    // (une robe foncée garde le reflet franc d'avant)
    for (const d of dark) expect(d.alpha).toBeGreaterThan(0.8);
  });
});

describe('tresser en 3D', () => {
  for (const key of FIVE) {
    it(`${key} : chaque geste juste ajoute un bouton sur la vraie crinière ; rubans, queue ; même note et même couleur`, () => {
      const h = HORSES.find((x) => x.key === key);
      const { a, sc } = makeStage(h);
      const ctx = ctxFor(a, sc, { opts: { out: {} } });
      const game = beauty3d.braid3dGame(ctx);
      run(ctx, game, sc, 0.3);
      expect(game.peek().knobs).toBe(0);
      // la crinière en gros plan : toute la tête dans l'image (bout du nez et oreilles, marge ≥ 5 %)
      const shape = headFrame.headShape(sc);
      let worst = 9;
      run(ctx, game, sc, 2, 1 / 30, () => { worst = Math.min(worst, headFrame.headMargins(sc, shape.points(0)).min); });
      expect(worst, key).toBeGreaterThanOrEqual(0.05);
      const seen = [];
      let toTail = false;
      braidKeys(game, ctx, 'blue', () => {
        run(ctx, game, sc, 0.2);
        seen.push(game.peek().knobs);
        // (vers la queue : un changement de plan net, pas un long glissement le long du dos où la tête est coupée)
        if (game.peek().view === 'tail' && !toTail) {
          toTail = true;
          expect(sc.settled(0.01), `${key} : plan net vers la queue`).toBe(true);
        }
        // (gros plan de la crinière, tresses puis rubans : la tête toujours entière)
        // (en revenant de la queue, un changement de plan net : la tête est là tout de suite)
        const v = game.peek().view;
        if (!ctx.done && typeof v === 'number') {
          run(ctx, game, sc, 1.2, 1 / 30, () => { worst = Math.min(worst, headFrame.headMargins(sc, shape.points(0)).min); });
        }
      });
      expect(worst, `${key} (tresses et rubans)`).toBeGreaterThanOrEqual(0.05);
      expect(toTail).toBe(true);
      // les boutons sont venus un par un (jamais moins qu'avant), tous à la fin
      for (let i = 1; i < seen.length; i++) expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
      const s = game.peek();
      expect(s.knobs).toBe(sc.model.braidSpots.crest.length);
      expect(s.knobs).toBeGreaterThanOrEqual(4);
      expect(s.ribbons).toBe(s.knobs);
      expect(s.beads).toBe(sc.model.braidSpots.tail.length);
      expect(s.tailBow).toBe(true);
      expect(s.tuck).toBeGreaterThan(0.9);
      // le ruban est à la couleur choisie
      let ribbon = null;
      sc.model.neck.traverse((o) => { if (o.isMesh && o.geometry.type === 'TorusGeometry' && o.visible) ribbon = o.material.color.getHex(); });
      expect(ribbon).toBe(0x2f6fd8);
      // le jeu dessiné, mêmes gestes : même note, même couleur
      const ctx2 = fakeCtx(a, t, { opts: { out: {} } });
      const game2 = beauty.braidGame(ctx2);
      braidKeys(game2, ctx2, 'blue');
      expect(ctx.done).toBe(true);
      expect(ctx2.done).toBe(true);
      expect(ctx.finished.q).toBeCloseTo(ctx2.finished.q, 6);
      expect(ctx.finished.q).toBeLessThan(1);
      expect(ctx.opts.out.color).toBe('blue');
      expect(ctx2.opts.out.color).toBe('blue');
      game.destroy();
      // libéré : la crinière n'est plus rentrée, les boutons sont partis
      expect(sc.model.hairMesh.material.userData.hairBraid.value).toBe(0);
      sc.dispose();
    }, 30000);
  }

  it('au doigt dans la loupe : la mèche touchée dans la petite loupe est celle du jeu dessiné', () => {
    const { a, sc } = makeStage({ breed: 'frison' });
    const ctx = ctxFor(a, sc, { opts: { out: {} } });
    const game = beauty3d.braid3dGame(ctx);
    run(ctx, game, sc, 0.3);
    const s = game.peek();
    // la mèche de gauche (attendue), en coordonnées de la petite loupe
    const o = s.loupe;
    const p = { x: o.x + (s.next.x - 204) * o.k, y: o.y + (s.next.y - 56) * o.k };
    game.down(p);
    expect(game.peek().crossings).toBe(1);
    expect(game.peek().wrong).toBe(0);
    game.destroy();
    sc.dispose();
  });
});

describe('repli dessiné : le beau cheval du vétérinaire', () => {
  it('tresser et lustrer dessinent le cheval avec drawHorseVet, pas avec le cheval-girafe', async () => {
    const vet = await import('../src/ui/vetHorse.js');
    const src = (await import('node:fs')).readFileSync(new URL('../src/ui/minigames/beauty.js', import.meta.url), 'utf8');
    expect(src).toMatch(/a\.species === 'horse' \? drawHorseVet/);
    expect(typeof vet.drawHorseVet).toBe('function');
    // (le jeu dessiné se dessine sans erreur, cheval comme chien)
    const calls = [];
    const g = new Proxy({}, { get: (_, k) => (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : k === 'measureText' ? () => ({ width: 0 }) : (...args) => calls.push(k)), set: () => true });
    for (const species of ['horse', 'dog']) {
      for (const make of [beauty.shineGame, beauty.braidGame]) {
        const a = { species, breed: species === 'horse' ? 'selle_francais' : 'labrador', name: 'Max', sex: 'm', look: { coat: 0x8a5a2b, mane: 0x222222 } };
        const c = fakeCtx(a, t, { opts: { out: {} } });
        make(c).draw(g);
      }
    }
    expect(calls.length).toBeGreaterThan(100);
  });
});

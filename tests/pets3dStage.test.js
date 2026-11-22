// Les soins des chiens, des chats et des lapins en 3D, joués pour de vrai sans navigateur (faux rendu, vrais modèles
// réalistes chargés dans node) : repères pris sur la peau pour toutes les tailles (chihuahua, bouvier bernois, chiot,
// sphynx, maine coon, chaton, lapin nain, bélier, géant des Flandres), l'animal et ce qu'on lui tend dans l'image pour
// chaque soin, les parties jouées jusqu'au bout (nourrir, donner à boire, friandise, caresses, brossage), la libération.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { loadPets, makePetStage, ctxFor, run, inView } from './fixtures/petStage.js';

let pets3d;
beforeAll(async () => {
  await loadPets();
  pets3d = await import('../src/ui/minigames/pets3d.js');
}, 120000);

// (le hasard des jeux et de l'animation, fixé : chaque test rejoue la même partie)
const random = Math.random;
let seed = 1;
beforeEach(() => {
  seed = 4242;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
});
afterAll(() => {
  Math.random = random;
});

const GAUGES = [
  { species: 'dog', breed: 'chihuahua' },
  { species: 'dog', breed: 'bouvier_bernois' },
  { species: 'dog', breed: 'labrador', ageDays: 40 },
  { species: 'cat', breed: 'sphynx' },
  { species: 'cat', breed: 'maine_coon' },
  { species: 'cat', breed: 'europeen', ageDays: 30 },
  { species: 'rabbit', breed: 'nain' },
  { species: 'rabbit', breed: 'belier' },
  { species: 'rabbit', breed: 'geant_flandres' },
];
const GAMES = ['feed', 'water', 'treat', 'pet', 'brush'];
const label = (g) => `${g.species} ${g.breed}${g.ageDays ? ' (petit)' : ''}`;

describe('la scène des animaux de compagnie : repères et cadrages pour toutes les tailles', () => {
  for (const gab of GAUGES) {
    it(`${label(gab)} : repères sur la peau, sa tête dans l'image pour chaque soin`, () => {
      const { a, sc } = makePetStage(gab);
      const L = sc.marks;
      // il regarde vers +x : le nez devant la tête, la tête devant le corps, la queue derrière
      expect(L.nose.x).toBeGreaterThan(L.head.x);
      expect(L.head.x).toBeGreaterThan(L.body.x);
      expect(L.tail.x).toBeLessThan(L.body.x);
      expect(L.muzzle.distanceTo(L.nose)).toBeLessThan(L.size.headLen * 0.5);
      // les pattes au sol, le dos au-dessus du ventre, le haut de la tête au-dessus du museau
      for (const p of L.paws) expect(p.y).toBeLessThan(L.size.h * 0.25);
      expect(L.back.y).toBeGreaterThan(L.belly.y);
      expect(L.poll.y).toBeGreaterThan(L.muzzle.y);
      expect(L.ears.length).toBe(2);
      for (const act of GAMES) {
        const ctx = ctxFor(a, sc);
        const game = pets3d.PET_CARE3D_GAMES[gab.species][act](ctx);
        run(ctx, game, sc, 0.6);
        const v = ctx.view;
        for (const k of ['muzzle', 'poll']) expect(inView(sc.project(sc.live(k)), v), `${act} ${k}`).toBe(true);
        if (act === 'feed' || act === 'water') {
          const bowl = sc.decor.props[act === 'feed' ? 'food' : 'water'].group.getWorldPosition(new THREE.Vector3());
          expect(inView(sc.project(bowl), v), `${act} gamelle`).toBe(true);
        }
        game.destroy();
        sc.mood.posture = null;
        sc.mood.walkTo = null;
        sc.mood.eat = null;
      }
      sc.dispose();
    }, 60000);
  }
});

/** Appuie (bouton « tenir ») : le premier bouton du jeu qui se tient. */
const holdBtn = (ctx) => ctx.buttons.find((b) => b.opts.hold);

describe('nourrir et donner à boire', () => {
  it('le chien : verser jusqu\'à la ligne, « C\'est bon », il vient jusqu\'à sa gamelle et mange', () => {
    const { a, sc } = makePetStage({ species: 'dog', breed: 'beagle' });
    const ctx = ctxFor(a, sc);
    const game = pets3d.petFeed3dGame(ctx);
    const x0 = sc.holder.position.x;
    run(ctx, game, sc, 0.3);
    expect(sc.mood.posture).toBe('sit'); // il attend assis
    holdBtn(ctx).opts.onDown();
    for (let k = 0; k < 300 && game.peek().value < (game.peek().lo + game.peek().hi) / 2 - 0.04; k++) run(ctx, game, sc, 1 / 30);
    holdBtn(ctx).opts.onUp();
    run(ctx, game, sc, 1.5);
    ctx.pressStop();
    run(ctx, game, sc, 1);
    expect(ctx.finished?.why).toBe('just');
    const full = sc.decor.props.food.level;
    run(ctx, game, sc, 4);
    expect(sc.holder.position.x - x0).toBeGreaterThan(0.05); // il est venu
    expect(sc.mood.eat).toBe('eat');
    expect(sc.decor.props.food.level).toBeLessThan(full); // il mange vraiment
    game.destroy();
    sc.dispose();
  }, 60000);

  it('le lapin boit à sa gamelle d\'eau, trop rempli : « un peu trop »', () => {
    const { a, sc } = makePetStage({ species: 'rabbit', breed: 'belier' });
    const ctx = ctxFor(a, sc);
    const game = pets3d.petWater3dGame(ctx);
    holdBtn(ctx).opts.onDown();
    for (let k = 0; k < 400 && game.peek().value < game.peek().hi + 0.06; k++) run(ctx, game, sc, 1 / 30);
    holdBtn(ctx).opts.onUp();
    run(ctx, game, sc, 1.5);
    ctx.pressStop();
    run(ctx, game, sc, 5);
    expect(ctx.finished?.why).toBe('high');
    expect(sc.mood.eat).toBe('drink');
    game.destroy();
    sc.dispose();
  }, 60000);
});

describe('la friandise', () => {
  it('le chat : attendre qu\'il soit sage, en donner deux, il les croque', () => {
    const { a, sc } = makePetStage({ species: 'cat', breed: 'europeen' });
    const ctx = ctxFor(a, sc);
    const game = pets3d.petTreat3dGame(ctx);
    const give = ctx.buttons.find((b) => !b.opts.cls?.includes('stop'));
    for (let k = 0; k < 600 && game.peek().given < game.peek().n; k++) {
      if (game.peek().state === 'calm') give.opts.onTap();
      run(ctx, game, sc, 1 / 30);
      if (game.peek().reach > 0.9) expect(sc.marks && sc.mood.nuzzle).toBeGreaterThan(0.5);
    }
    run(ctx, game, sc, 1.5);
    ctx.pressStop();
    expect(ctx.finished?.why).toBe('just');
    expect(game.peek().penalties).toBe(0);
    game.destroy();
    sc.dispose();
  }, 60000);
});

/** Points du cadre qui tombent sur ces régions de l'animal. */
function regionPoints(sc, regions, step = 8) {
  const out = [];
  for (let y = -120; y < 480; y += step) for (let x = 0; x < 400; x += step) {
    const h = sc.pickAnimal(x, y);
    if (h && regions.includes(h.region)) out.push({ x, y });
  }
  return out;
}

describe('les caresses', () => {
  it('le chien : doucement, le cœur monte ; trop vite, il sursaute ; juste, trois étoiles', () => {
    const { a, sc } = makePetStage({ species: 'dog', breed: 'golden' });
    const ctx = ctxFor(a, sc);
    const game = pets3d.petPet3dGame(ctx);
    run(ctx, game, sc, 1.5);
    const pts = regionPoints(sc, ['body', 'shoulder', 'hip']).sort((p, q) => p.x - q.x);
    expect(pts.length).toBeGreaterThan(20);
    const p0 = pts[Math.floor(pts.length * 0.3)];
    const p1 = pts[Math.floor(pts.length * 0.7)];
    // trop vite : un grand geste en une image
    ctx.pointer.down = true;
    game.down(p0);
    run(ctx, game, sc, 1 / 30);
    game.move(p1, true);
    run(ctx, game, sc, 1 / 30);
    game.move(p0, true);
    game.up();
    expect(game.peek().fast).toBe(1);
    expect(sc.mood.annoyed).toBeGreaterThan(0);
    run(ctx, game, sc, 1.2);
    // doucement, jusqu'à la zone verte
    for (let pass = 0; pass < 40 && game.peek().value < game.peek().lo + 0.02; pass++) {
      game.down(p0);
      for (let i = 1; i <= 20; i++) {
        const p = { x: p0.x + ((p1.x - p0.x) * i) / 20, y: p0.y + ((p1.y - p0.y) * i) / 20 };
        ctx.pointer = { ...ctx.pointer, ...p, down: true };
        game.move(p, true);
        run(ctx, game, sc, 1 / 30);
      }
      game.up();
    }
    expect(game.peek().value).toBeGreaterThan(game.peek().lo);
    expect(game.peek().value).toBeLessThan(game.peek().hi);
    ctx.pressStop();
    expect(ctx.finished?.why).toBe('just');
    game.destroy();
    sc.dispose();
  }, 60000);
});

describe('le brossage', () => {
  for (const gab of [{ species: 'dog', breed: 'border_collie' }, { species: 'rabbit', breed: 'angora' }]) {
    it(`${label(gab)} : toutes les taches dans le sens du poil, puis « C'est bon » : juste`, () => {
      const { a, sc } = makePetStage(gab);
      const ctx = ctxFor(a, sc);
      const game = pets3d.petBrush3dGame(ctx);
      run(ctx, game, sc, 0.5);
      let s = game.peek();
      expect(s.n).toBeGreaterThanOrEqual(5);
      // le sens du poil va vers la queue (la gauche de l'image)
      expect(s.hair.x).toBeLessThan(-0.5);
      for (const q of s.patches) expect(inView(q, ctx.view), 'tache dans l\'image').toBe(true);
      for (let pass = 0; pass < 8 && s.patches.length; pass++) {
        for (const q of s.patches) {
          const r = Math.max(10, q.r) * 1.5;
          game.down({ x: q.x - s.hair.x * r, y: q.y - s.hair.y * r });
          for (let i = 1; i <= 10; i++) game.move({ x: q.x + s.hair.x * r * ((2 * i) / 10 - 1), y: q.y + s.hair.y * r * ((2 * i) / 10 - 1) }, true);
          game.up();
          run(ctx, game, sc, 1 / 30);
        }
        s = game.peek();
      }
      expect(s.clean).toBe(1);
      ctx.pressStop();
      expect(ctx.finished?.why).toBe('just');
      game.destroy();
      sc.dispose();
    }, 60000);
  }
});

describe('les griffes (chien, chat)', () => {
  for (const gab of [{ species: 'dog', breed: 'labrador' }, { species: 'cat', breed: 'persan' }]) {
    it(`${label(gab)} : il donne la patte, quatre griffes au bout ; trois dans la zone, une dans le rose : « aïe »`, () => {
      const { a, sc } = makePetStage(gab);
      const ctx = ctxFor(a, sc);
      const game = pets3d.PET_CARE3D_GAMES[gab.species].nails(ctx);
      run(ctx, game, sc, 0.3);
      const cut = ctx.buttons.find((b) => !b.opts.cls?.includes('stop'));
      for (let k = 0; k < 4; k++) {
        const bad = k === 1;
        for (let i = 0; i < 400; i++) {
          const s = game.peek();
          if (bad ? s.u < s.quick + 0.02 : s.u > s.uLo + 0.03 && s.u < s.uHi - 0.03) break;
          run(ctx, game, sc, 1 / 30);
        }
        // la griffe en cours est dans l'image, et la pince sur elle
        expect(inView(game.peek().clawTip, ctx.view), `griffe ${k}`).toBe(true);
        cut.opts.onTap();
        run(ctx, game, sc, 0.3);
        if (bad) expect(sc.mood.annoyed).toBeGreaterThan(0); // il retire la patte, oreilles en arrière
      }
      expect(ctx.finished?.why).toBe('high');
      game.destroy();
      sc.dispose();
    }, 60000);
  }
});

describe('jouer à la balle (chien, lapin)', () => {
  for (const gab of [{ species: 'dog', breed: 'labrador' }, { species: 'rabbit', breed: 'rex' }]) {
    it(`${label(gab)} : on touche le sol, la balle vole, il court la chercher, la rapporte ; trois fois : juste`, () => {
      const { a, sc } = makePetStage(gab);
      const ctx = ctxFor(a, sc);
      const game = pets3d.PET_CARE3D_GAMES[gab.species].play(ctx);
      run(ctx, game, sc, 0.5);
      const n = game.peek().n;
      for (let k = 0; k < n; k++) {
        for (let i = 0; i < 300 && game.peek().ball !== 'hand'; i++) run(ctx, game, sc, 1 / 30);
        // on touche le sol juste devant lui
        const at = sc.project(sc.holder.position.clone().add(new THREE.Vector3(0.05, 0, 0.12)));
        game.down({ x: at.x, y: at.y });
        expect(game.peek().ball, `lancer ${k}`).toBe('fly');
        const x0 = sc.holder.position.clone();
        let moved = 0;
        for (let i = 0; i < 400 && game.peek().ball !== 'hand'; i++) {
          run(ctx, game, sc, 1 / 30);
          moved = Math.max(moved, sc.holder.position.distanceTo(x0));
          if (game.peek().ball === 'mouth') expect(game.peek().ball3d.distanceTo(sc.live('muzzle'))).toBeLessThan(0.1);
        }
        expect(moved).toBeGreaterThan(0.02); // il a couru
        expect(inView(sc.project(sc.holder.position), ctx.view)).toBe(true);
      }
      expect(game.peek().rounds).toBe(n);
      ctx.pressStop();
      expect(ctx.finished?.why).toBe('just');
      game.destroy();
      sc.dispose();
    }, 90000);
  }
});

describe('libération', () => {
  it('fermer la scène retire tout (jeu, décor, accessoires) et libère le rendu', () => {
    const { a, sc } = makePetStage({ species: 'dog', breed: 'caniche' });
    const ctx = ctxFor(a, sc);
    const game = pets3d.petTreat3dGame(ctx);
    run(ctx, game, sc, 0.5);
    const before = sc.scene.children.length;
    game.destroy();
    expect(sc.scene.children.length).toBe(before - 1); // (la main et sa friandise)
    sc.dispose();
    expect(sc.renderer.calls.dispose).toBe(1);
    expect(sc.disposed).toBe(true);
    expect(sc.listeners.length).toBe(0);
  }, 60000);
});

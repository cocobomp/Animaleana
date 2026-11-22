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

describe('brosser : la saleté se voit sur toutes les robes', () => {
  for (const gab of [{ species: 'dog', breed: 'teckel' }, { species: 'dog', breed: 'saint_bernard' }, { species: 'dog', breed: 'bouvier_bernois' }, { species: 'dog', breed: 'labrador', colorIndex: 1 }, { species: 'rabbit', breed: 'tete_de_lion' }, { species: 'rabbit', breed: 'angora' }, { species: 'cat', breed: 'sphynx' }]) {
    it(`${label(gab)} : terre sombre ou poussière claire, contraste d'au moins 2,5`, () => {
      const { a, sc } = makePetStage(gab);
      const ctx = ctxFor(a, sc);
      const game = pets3d.PET_CARE3D_GAMES[gab.species].brush(ctx);
      run(ctx, game, sc, 0.2);
      const s = game.peek();
      expect(s.contrast, `${s.dirt} sur ${ctx.col.coat}`).toBeGreaterThan(2.5);
      expect(s.patches.length).toBeGreaterThan(3);
      game.destroy();
      sc.dispose();
    }, 60000);
  }
});

describe('le lapin tête de lion ne se redresse pas (la barbe de sa crinière pendait en nappe)', () => {
  it('friandise, nourrir, griffes : il reste ramassé ; un autre lapin se dresse pour sa friandise', () => {
    for (const [breed, rears] of [['tete_de_lion', false], ['nain', true]]) {
      const { a, sc } = makePetStage({ species: 'rabbit', breed });
      expect(pets3d.rabbitRears(sc)).toBe(rears);
      for (const act of ['treat', 'feed', 'nails']) {
        const ctx = ctxFor(a, sc);
        const game = pets3d.PET_CARE3D_GAMES.rabbit[act](ctx);
        const seen = new Set();
        for (let i = 0; i < 90; i++) {
          run(ctx, game, sc, 1 / 15);
          seen.add(sc.mood.posture);
        }
        if (!rears) expect([...seen].filter((p) => p === 'rear' || p === 'sit'), act).toEqual([]);
        game.destroy();
        sc.mood.posture = null;
        sc.mood.pose = null;
      }
      sc.dispose();
    }
  }, 90000);
});

describe('le bain du chien', () => {
  for (const gab of [{ species: 'dog', breed: 'chihuahua' }, { species: 'dog', breed: 'bouvier_bernois' }]) {
    it(`${label(gab)} : debout dans la bassine, l'éponge partout, la douchette, il s'ébroue ; juste`, () => {
      const { a, sc } = makePetStage(gab);
      const ctx = ctxFor(a, sc);
      const before = sc.scene.children.length;
      const game = pets3d.PET_CARE3D_GAMES.dog.wash(ctx);
      run(ctx, game, sc, 0.5);
      // la bassine sous lui, ses pattes dedans ; lui et la bassine dans l'image
      const s0 = game.peek();
      expect(s0.cells).toBeGreaterThan(5);
      for (const k of ['muzzle', 'poll']) expect(inView(sc.project(sc.live(k)), ctx.view)).toBe(true);
      // on frotte chaque endroit une fois
      for (const c of s0.cellsAt) {
        game.down({ x: c.x - 32, y: c.y });
        for (let k = 0; k <= 12; k++) game.move({ x: c.x - 32 + (64 * k) / 12, y: c.y }, true);
        game.up();
      }
      run(ctx, game, sc, 0.2);
      expect(game.peek().soaped).toBeGreaterThan(0.85);
      ctx.pressStop();
      expect(game.peek().phase).toBe('rinse');
      // la douchette, bouton gardé appuyé : elle balaie le chien toute seule
      const shower = ctx.buttons.find((b) => b.opts.hold);
      shower.opts.onDown();
      let shook = 0;
      for (let i = 0; i < 600 && !ctx.finished; i++) run(ctx, game, sc, 1 / 30);
      shower.opts.onUp();
      expect(ctx.finished?.why).toBe('just');
      for (let i = 0; i < 30; i++) {
        run(ctx, game, sc, 1 / 30);
        shook = Math.max(shook, Math.abs(sc.holder.rotation.x));
      }
      expect(shook).toBeGreaterThan(0.05); // il s'ébroue
      run(ctx, game, sc, 1.5);
      expect(sc.holder.rotation.x).toBe(0);
      game.destroy();
      expect(sc.scene.children.length).toBe(before);
      sc.dispose();
    }, 90000);
  }
});

describe('nettoyer : la litière du chat, la litière du clapier', () => {
  for (const gab of [{ species: 'cat', breed: 'persan' }, { species: 'cat', breed: 'europeen', ageDays: 30 }, { species: 'rabbit', breed: 'belier' }, { species: 'rabbit', breed: 'nain' }]) {
    it(`${label(gab)} : chaque saleté d'une tape dans le sac (le seau), puis du propre partout : juste`, () => {
      const { a, sc } = makePetStage(gab);
      const ctx = ctxFor(a, sc);
      const before = sc.scene.children.length;
      const game = pets3d.PET_CARE3D_GAMES[gab.species].clean(ctx);
      run(ctx, game, sc, 0.3);
      let s = game.peek();
      // le bac (ou le coin de paille), le sac, et lui : dans l'image
      const f = s.floor;
      for (const [x, y] of [[f.x, f.y], [f.x + f.w, f.y + f.h], [s.bin.x, s.bin.y]]) expect(inView(s.toScreen(x, y), ctx.view), `${x},${y}`).toBe(true);
      expect(inView(sc.project(sc.live('poll')), ctx.view)).toBe(true);
      for (let n = 0; n < 20 && s.phase === 'pick'; n++) {
        const it = s.all.find((i) => i.state === 'floor' && !i.good);
        if (!it) break;
        const q = s.toScreen(it.x, it.y);
        game.down(q);
        game.up(q);
        run(ctx, game, sc, 0.5);
        s = game.peek();
      }
      expect(s.phase).toBe('spread');
      // une couche partout : une rangée par rangée de cases
      for (let y = f.y + 18; y < f.y + f.h; y += 36) {
        const a0 = s.toScreen(f.x + 4, y);
        const b0 = s.toScreen(f.x + f.w - 4, y);
        game.down(a0);
        for (let k = 0; k <= 30; k++) game.move({ x: a0.x + ((b0.x - a0.x) * k) / 30, y: a0.y + ((b0.y - a0.y) * k) / 30 }, true);
        game.up(b0);
        run(ctx, game, sc, 0.05);
      }
      s = game.peek();
      expect(s.value).toBeGreaterThanOrEqual(s.lo);
      expect(s.value).toBeLessThanOrEqual(s.hi);
      ctx.pressStop();
      expect(ctx.finished?.why).toBe('just');
      run(ctx, game, sc, 0.5);
      game.destroy();
      expect(sc.scene.children.length).toBe(before);
      sc.dispose();
    }, 90000);
  }
});

describe('jouer avec le chat : la canne à plume', () => {
  for (const gab of [{ species: 'cat', breed: 'maine_coon' }, { species: 'cat', breed: 'sphynx', ageDays: 30 }]) {
    it(`${label(gab)} : la plume suit le doigt, il bondit, l'attrape ; le bon nombre de bonds : juste`, () => {
      const { a, sc } = makePetStage(gab);
      const ctx = ctxFor(a, sc);
      const before = sc.scene.children.length;
      const game = pets3d.PET_CARE3D_GAMES.cat.play(ctx);
      run(ctx, game, sc, 0.3);
      // la plume va là où est le doigt (plan du jeu dessiné, ramené en 3D)
      let s = game.peek();
      const q = s.toScreen(250, 170);
      game.down(q);
      expect(game.peek().feather.x).toBeCloseTo(250, 0);
      expect(game.peek().feather.y).toBeCloseTo(170, 0);
      let maxLift = 0;
      let k = 0;
      for (let i = 0; i < 1500 && game.peek().catches < game.peek().n; i++) {
        s = game.peek();
        const p = s.toScreen(Math.max(40, Math.min(360, s.x + s.f * 100 + (k++ % 2 ? 25 : -25))), 190);
        // (la plume reste dans l'image : on peut toujours l'atteindre)
        expect(inView(p, ctx.view), `plume ${i}`).toBe(true);
        game.move(p, true);
        run(ctx, game, sc, 1 / 30);
        maxLift = Math.max(maxLift, sc.holder.position.y);
        if (game.peek().held) expect(game.peek().feather3d.distanceTo(sc.live('muzzle'))).toBeLessThan(0.08);
      }
      expect(game.peek().catches).toBe(game.peek().n);
      expect(maxLift).toBeGreaterThan(0.03); // il a bondi
      expect(inView(sc.project(sc.live('poll')), ctx.view)).toBe(true);
      run(ctx, game, sc, 1);
      ctx.pressStop();
      expect(ctx.finished?.why).toBe('just');
      game.destroy();
      expect(sc.scene.children.length).toBe(before);
      expect(sc.holder.position.y).toBe(0);
      sc.dispose();
    }, 120000);
  }
});

describe('nourrir, donner à boire : la gamelle bien visible, le sac ne la cache pas', () => {
  for (const gab of GAUGES) {
    it(`${label(gab)} : gamelle assez grande, sous le sac (ou la carafe) tenu plus haut`, () => {
      const { a, sc } = makePetStage(gab);
      for (const act of ['feed', 'water']) {
        const ctx = ctxFor(a, sc);
        const game = pets3d.PET_CARE3D_GAMES[gab.species][act](ctx);
        run(ctx, game, sc, 0.6);
        const s = game.peek();
        expect(s.bowlPx, `${act} rayon de la gamelle`).toBeGreaterThan(26);
        // le bas du sac au repos est au-dessus du bord de la gamelle
        expect(s.srcLowY, `${act} sac`).toBeLessThan(s.bowlRimY);
        game.destroy();
        sc.mood.posture = null;
      }
      sc.dispose();
    }, 60000);
  }
});

describe('les cadrages en paysage et sur ordinateur', () => {
  // (la toile 3D d'un téléphone en paysage, 844 × 390 : 496 × 370 ; la fenêtre du jeu sur un ordinateur : 660 × 460)
  for (const gab of [GAUGES[0], GAUGES[1], GAUGES[2], GAUGES[3], GAUGES[5], GAUGES[6], GAUGES[7], { species: 'rabbit', breed: 'tete_de_lion' }]) {
    for (const [w, h] of [[496, 370], [660, 460]]) {
      it(`${label(gab)} ${w}×${h} : la tête, les oreilles et les pattes dans l'image pour chaque soin`, () => {
        const { a, sc } = makePetStage({ ...gab, w, h });
        for (const act of GAMES) {
          const ctx = ctxFor(a, sc, w, h);
          const game = pets3d.PET_CARE3D_GAMES[gab.species][act](ctx);
          run(ctx, game, sc, 0.8);
          const v = ctx.view;
          for (const k of ['muzzle', 'poll', 'ear0', 'ear1']) expect(inView(sc.project(sc.live(k)), v, 2), `${act} ${k}`).toBe(true);
          if (act !== 'feed' && act !== 'water') for (const [i, p] of sc.marks.paws.entries()) expect(inView(sc.project(p), v, 2), `${act} patte ${i}`).toBe(true);
          if (act === 'feed' || act === 'water') {
            const bowl = sc.decor.props[act === 'feed' ? 'food' : 'water'].group.getWorldPosition(new THREE.Vector3());
            expect(inView(sc.project(bowl), v, 10), `${act} gamelle`).toBe(true);
          }
          game.destroy();
          sc.mood.posture = null;
          sc.mood.walkTo = null;
          sc.mood.eat = null;
        }
        sc.dispose();
      }, 60000);
    }
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

describe('notre main : une main d\'enfant, à la taille de l\'animal, le bras entre par le bas', () => {
  for (const gab of GAUGES) {
    it(`${label(gab)} : friandise et caresses`, () => {
      const { a, sc } = makePetStage(gab);
      const L = sc.marks;
      // (une main de 12 cm au plus, jamais plus du tiers de la taille de l'animal)
      const size = pets3d.handSize(L);
      expect(size * 0.12).toBeLessThan(0.36 * Math.max(L.size.len, L.size.h));
      const ctx = ctxFor(a, sc);
      const game = pets3d.PET_CARE3D_GAMES[gab.species].treat(ctx);
      run(ctx, game, sc, 0.6);
      const hand = sc.scene.children.find((o) => o.userData?.pose);
      expect(hand).toBeTruthy();
      // le bras : la manche part vers le bas de l'image, et sort de l'image
      const palm = sc.project(hand.getWorldPosition(new THREE.Vector3()));
      const elbow = sc.project(hand.localToWorld(new THREE.Vector3(-0.3 * size, 0, 0)));
      expect(elbow.y).toBeGreaterThan(palm.y);
      const far = sc.project(hand.localToWorld(new THREE.Vector3(-0.7 * size, 0, 0)));
      expect(far.behind || !inView(far, ctx.view)).toBe(true);
      game.destroy();
      sc.dispose();
    }, 60000);
  }
});

describe('les griffes (chien, chat, lapin) : un gros plan lisible', () => {
  // Une griffe vue de près : au moins 55 px du cadre (le jeu dessiné : 74), dans l'image, devant la patte (rien de
  // l'animal entre la caméra et elle), en portrait comme en paysage, du chihuahua au saint-bernard.
  const NAILS = [
    { species: 'dog', breed: 'chihuahua' }, { species: 'dog', breed: 'teckel' }, { species: 'dog', breed: 'saint_bernard' },
    { species: 'dog', breed: 'labrador', ageDays: 40 }, { species: 'cat', breed: 'persan' }, { species: 'cat', breed: 'maine_coon' },
    { species: 'cat', breed: 'sphynx' }, { species: 'rabbit', breed: 'nain' }, { species: 'rabbit', breed: 'tete_de_lion' },
  ];
  const visible = (sc, p) => {
    // (le premier point de l'animal sur le rayon caméra → griffe est derrière elle, ou il n'y en a pas)
    const cam = sc.camera.position.clone();
    const d = p.clone().sub(cam);
    const h = sc.proxy.hit(new THREE.Ray(cam, d.clone().normalize()), -9, 1e9);
    return !h || h.distance > d.length() - 0.002;
  };
  for (const gab of NAILS) {
    for (const [w, h] of [[390, 600], [844, 390]]) {
      it(`${label(gab)} ${w}×${h} : la patte en gros plan, quatre griffes bien grandes, devant la patte`, () => {
        const { a, sc } = makePetStage({ ...gab, w, h });
        const ctx = ctxFor(a, sc, w, h);
        const game = pets3d.PET_CARE3D_GAMES[gab.species].nails(ctx);
        run(ctx, game, sc, 0.5);
        const v = ctx.view;
        const s = game.peek();
        expect(s.clawPx, 'longueur de la griffe à l\'écran').toBeGreaterThan(55);
        expect(inView(s.clawBase, v, 4) && inView(s.clawTip, v, 4), 'griffe dans l\'image').toBe(true);
        sc.proxy.bake();
        const c = sc.scene.getObjectsByProperty('renderOrder', 53).map((m) => m.parent);
        expect(c.length).toBe(4);
        // (la mesure voit bien la peau : l'os des doigts, dans la patte, est caché par elle)
        expect(visible(sc, c[0].parent.getWorldPosition(new THREE.Vector3()))).toBe(false);
        // de gauche à droite, toutes dans l'image et devant la patte
        let x = -Infinity;
        for (const g of c.sort((p, q) => sc.project(p.getWorldPosition(new THREE.Vector3())).x - sc.project(q.getWorldPosition(new THREE.Vector3())).x)) {
          const mid = g.localToWorld(new THREE.Vector3(0, 0.6, 0));
          const q = sc.project(mid);
          expect(inView(q, v, 4)).toBe(true);
          expect(q.x).toBeGreaterThan(x);
          x = q.x;
          expect(visible(sc, mid), 'griffe cachée par la patte').toBe(true);
        }
        game.destroy();
        expect(sc.mood.pose).toBe(null);
        sc.dispose();
      }, 60000);
    }
  }

  for (const gab of [{ species: 'dog', breed: 'labrador' }, { species: 'cat', breed: 'persan' }, { species: 'rabbit', breed: 'belier' }]) {
    it(`${label(gab)} : trois griffes dans la zone, une dans le rose : « aïe », il retire la patte`, () => {
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
        const paw0 = game.peek().clawBase;
        cut.opts.onTap();
        run(ctx, game, sc, 0.3);
        if (bad) {
          expect(sc.mood.annoyed).toBeGreaterThan(0); // oreilles en arrière
          // il retire la patte : elle bouge à l'écran, puis revient
          const p1 = game.peek().clawBase;
          expect(Math.hypot(p1.x - paw0.x, p1.y - paw0.y)).toBeGreaterThan(5);
          run(ctx, game, sc, 1.2);
        }
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

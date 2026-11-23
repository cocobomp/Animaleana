// Chantier « soinsbeaute », point 4 : le salon de toilettage du cheval. Plus d'étape « oreilles » pour le cheval ;
// chaque étape d'une séance « show » s'ouvre en 3D sur le vrai cheval (bain, séchage, démêlage, brossage, tonte,
// finitions) ; on les joue sur le vrai modèle (GLB chargé dans node, faux rendu) : le séchage au racloir puis à la
// serviette (la peur si on racle la tête), le démêlage de la crinière et de la queue (« Aïe » si on tire), les
// finitions (tresses au ruban de la couleur choisie, choix rendu au salon), la tonte en bandes (même logique que le
// jeu dessiné, sans aucune touffe sur la tête).
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import * as THREE from 'three';
import { fakeCtx } from './fixtures/careCtx.js';
import { loadStageMods, makeStage, ctxFor, run, endCard } from './fixtures/soinsbeauteStage.js';

let t;
let sim;
let which;
let care3d;
let groom3d;
let groomer;
beforeAll(async () => {
  ({ t } = await loadStageMods());
  sim = await import('../src/sim/groomer.js');
  which = await import('../src/game/care/which.js');
  care3d = await import('../src/ui/minigames/care3d.js');
  groom3d = await import('../src/ui/minigames/groom3d.js');
  groomer = await import('../src/ui/minigames/groomer.js');
}, 60000);

const random = Math.random;
let seed = 1;
beforeEach(() => {
  seed = 321;
  Math.random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
});
afterAll(() => {
  Math.random = random;
});

/** Le cadre, avec des boutons qui acceptent ce que les jeux du salon leur font (texte, couleur). */
function salonCtx(a, sc) {
  const ctx = ctxFor(a, sc, { opts: {} });
  ctx.col = { ...ctx.col, raw: { coat: a.look?.coat ?? 0x8a5a2b, mane: a.look?.mane ?? 0x222222 } };
  const button = ctx.button;
  ctx.button = (text, opts = {}) => {
    const b = button(text, opts);
    b.style = { setProperty() {} };
    return b;
  };
  return ctx;
}

/** Des gestes en rangées sur le flanc, à l'écran (de dir = -1 : de la tête vers la queue). */
function sweep(sc, game, ctx, { rows = 6, dir = -1, steps = 20, dt = 1 / 30, wide = 0 } = {}) {
  const L = sc.marks;
  const S = sc.double.scale;
  for (let r = 0; r < rows; r++) {
    const k = (r + 0.5) / rows;
    const y = L.back.y + (L.belly.y - L.back.y) * k;
    const a = sc.project(new THREE.Vector3(L.chest.x + wide * S, y, L.body.z + 0.5));
    const b = sc.project(new THREE.Vector3(L.tail.x - wide * S, y, L.body.z + 0.5));
    const [p0, p1] = dir < 0 ? [a, b] : [b, a];
    ctx.pointer.down = true;
    game.down(p0);
    for (let i = 1; i <= steps; i++) {
      const p = { x: p0.x + ((p1.x - p0.x) * i) / steps, y: p0.y + ((p1.y - p0.y) * i) / steps };
      ctx.pointer.x = p.x;
      ctx.pointer.y = p.y;
      game.move(p, true);
      run(ctx, game, sc, dt);
    }
    game.up();
    ctx.pointer.down = false;
  }
}

describe('le salon : les étapes du cheval', () => {
  it('pas d\'étape « oreilles » pour le cheval (les autres animaux la gardent)', () => {
    expect(sim.stepFor('ears', 'horse')).toBe(false);
    expect(sim.stepFor('ears', 'dog')).toBe(true);
    for (const r of Object.values(sim.REQUESTS)) if (r.species.includes('horse')) expect(r.steps).not.toContain('ears');
  });

  it('une séance « show » du cheval : chaque étape s\'ouvre en 3D sur le vrai cheval', () => {
    const horse = { species: 'horse' };
    const steps = sim.REQUESTS.show.steps;
    expect(steps).toEqual(['bath', 'dry', 'knots', 'brush', 'cut', 'finish']);
    for (const id of steps) {
      const game = sim.STEPS[id].game;
      expect(which.care3dWanted(horse, game), id).toBe(true);
      expect(typeof care3d.care3dGameFor(horse, game), id).toBe('function');
    }
    // (le chien garde ses jeux dessinés du salon)
    expect(which.care3dWanted({ species: 'dog' }, 'gcut')).toBe(false);
  });

  it('la tonte dessinée (repli) : aucune touffe sur la tête d\'un cheval, toutes sur le corps', () => {
    groomer.setCutStyle('tonte');
    const a = { species: 'horse', breed: 'selle_francais', name: 'Max', sex: 'm', look: { coat: 0x8a5a2b } };
    const ctx = fakeCtx(a, t);
    const g = groomer.cutGame(ctx);
    expect(g.tufts.length).toBeGreaterThan(20);
    expect(g.tufts.some((q) => q.head)).toBe(false);
    expect(g.tufts.every((q) => q.k <= 1)).toBe(true);
    // un chien garde sa tête « caniche »
    groomer.setCutStyle('caniche');
    const d = groomer.cutGame(fakeCtx({ species: 'dog', breed: 'caniche', name: 'Rex', sex: 'm', look: { coat: 0xffffff } }, t));
    expect(d.tufts.some((q) => q.head)).toBe(true);
  });
});

describe('séchage en 3D', () => {
  it('le racloir dans le sens du poil, puis la serviette : il sèche ; calme, la note est pleine', () => {
    const { a, sc } = makeStage({ breed: 'selle_francais' });
    const ctx = salonCtx(a, sc);
    const game = groom3d.gdry3dGame(ctx);
    run(ctx, game, sc, 0.3);
    expect(game.peek().wet).toBeGreaterThan(0.95);
    expect(game.peek().tool).toBe('scraper');
    // à rebrousse-poil : rien
    sweep(sc, game, ctx, { rows: 3, dir: 1 });
    expect(game.peek().wet).toBeGreaterThan(0.95);
    for (let i = 0; i < 30 && !ctx.done; i++) sweep(sc, game, ctx, { rows: 6, dir: -1 });
    expect(ctx.done).toBe(true);
    expect(game.peek().tool).toBe('towel');
    expect(ctx.finished.q).toBeCloseTo(1, 5);
    expect(ctx.stress).toBe(0);
    game.destroy();
    sc.dispose();
  }, 60000);

  it('le racloir sur la tête : il a peur (la note du salon le compte)', () => {
    const { a, sc } = makeStage({ breed: 'arabe' });
    const ctx = salonCtx(a, sc);
    const game = groom3d.gdry3dGame(ctx);
    run(ctx, game, sc, 0.3);
    const head = sc.project(sc.live('head'));
    ctx.pointer.down = true;
    game.down(head);
    for (let i = 0; i < 36; i++) {
      game.move({ x: head.x - (i % 6) * 6, y: head.y + (i % 2) * 3 }, true);
      run(ctx, game, sc, 1 / 30);
    }
    game.up();
    expect(game.peek().peak).toBeGreaterThan(0.3);
    expect(ctx.stress).toBeGreaterThan(0.3);
    game.destroy();
    sc.dispose();
  });
});

describe('démêlage en 3D', () => {
  /** Peigne chaque nœud de haut en bas (lent : doux ; rapide : ça tire). */
  function combAll(sc, game, ctx, fast = false) {
    for (let i = 0; i < 40 && !ctx.done; i++) {
      const s = game.peek();
      const k = s.knots.find((x) => x.part === s.on) ?? s.knots[0];
      if (!k) break;
      ctx.pointer.down = true;
      game.down({ x: k.x, y: k.y - 40 });
      for (let j = 1; j <= 10; j++) {
        game.move({ x: k.x, y: k.y - 40 + j * 9 }, true);
        run(ctx, game, sc, fast ? 1 / 300 : 1 / 30, fast ? 1 / 300 : 1 / 30);
      }
      game.up();
      ctx.pointer.down = false;
      run(ctx, game, sc, 0.3);
    }
  }

  it('la crinière, puis la queue, de haut en bas, doucement : tout est démêlé, note pleine ; la tête entière à la carte de fin', async () => {
    const { a, sc } = makeStage({ breed: 'frison' });
    const ctx = salonCtx(a, sc);
    const game = groom3d.gknots3dGame(ctx);
    run(ctx, game, sc, 0.3);
    expect(game.peek().on).toBe('mane');
    expect(game.peek().knots.length).toBe(6);
    combAll(sc, game, ctx);
    expect(ctx.done).toBe(true);
    expect(ctx.finished.q).toBe(1);
    // la carte de fin : tout le cheval au-dessus, la tête entière (marge ≥ 5 %)
    const headFrame = await import('../src/ui/minigames/headFrame.js');
    const shape = headFrame.headShape(sc);
    endCard(sc, 0.5);
    let worst = 9;
    run(ctx, game, sc, 4, 1 / 30, (k) => { if (k > 60) worst = Math.min(worst, headFrame.headMargins(sc, shape.points(0)).min); });
    expect(worst).toBeGreaterThanOrEqual(0.05);
    game.destroy();
    sc.dispose();
  }, 30000);

  it('la crinière : toute la tête reste dans l\'image (bout du nez et oreilles, marge ≥ 5 %), pour 5 chevaux', async () => {
    const headFrame = await import('../src/ui/minigames/headFrame.js');
    for (const [breed, foal] of [['selle_francais', false], ['frison', false], ['shetland', false], ['falabella', false], ['selle_francais', true]]) {
      const { a, sc } = makeStage({ breed, foal });
      const ctx = salonCtx(a, sc);
      const game = groom3d.gknots3dGame(ctx);
      const shape = headFrame.headShape(sc);
      let worst = 9;
      run(ctx, game, sc, 2.5, 1 / 30, (k) => {
        if (k > 20 && game.peek().on === 'mane') worst = Math.min(worst, headFrame.headMargins(sc, shape.points(0)).min);
      });
      expect(game.peek().on, breed).toBe('mane');
      expect(worst, `${breed}${foal ? ' poulain' : ''}`).toBeGreaterThanOrEqual(0.05);
      game.destroy();
      sc.dispose();
    }
  }, 60000);

  it('trop vite, ça tire : « Aïe », et la même note que le jeu dessiné (moins un seizième par coup de trop)', () => {
    const { a, sc } = makeStage({ breed: 'shetland' });
    const ctx = salonCtx(a, sc);
    const game = groom3d.gknots3dGame(ctx);
    run(ctx, game, sc, 0.3);
    combAll(sc, game, ctx, true);
    const tugs = game.peek().tugs;
    expect(tugs).toBeGreaterThan(0);
    expect(ctx.texts).toContain(t('mg_gknots_ouch'));
    combAll(sc, game, ctx, false);
    expect(ctx.done).toBe(true);
    expect(ctx.finished.q).toBeCloseTo(1 - Math.min(1, tugs / 8) * 0.5, 6);
    game.destroy();
    sc.dispose();
  }, 30000);
});

describe('finitions en 3D', () => {
  it('le ruban et sa couleur (les boutons du jeu dessiné) ; chaque pschitt tresse un tiers de la crinière ; le choix revient au salon', () => {
    groomer.setFinishOptions({ accessories: ['ribbon', 'tailBow'], current: null, allowNone: true });
    const { a, sc } = makeStage({ breed: 'selle_francais' });
    const ctx = salonCtx(a, sc);
    const game = groom3d.gfinish3dGame(ctx);
    run(ctx, game, sc, 0.3);
    // (le ruban, puis la couleur suivante)
    const [acc, col] = ctx.buttons.filter((b) => !b.opts.cls?.includes('stop'));
    acc.opts.onTap();
    col.opts.onTap();
    expect(ctx.choice).toEqual({ id: 'ribbon', color: sim.ACC_COLORS ? Object.keys(sim.ACC_COLORS)[1] : 'red' });
    const body = sc.project(sc.marks.body);
    const counts = [];
    for (let i = 0; i < 3; i++) {
      game.down(body);
      run(ctx, game, sc, 0.5);
      counts.push(game.peek().knobs);
    }
    expect(counts[0]).toBeGreaterThan(0);
    expect(counts[1]).toBeGreaterThan(counts[0]);
    expect(counts[2]).toBe(sc.model.braidSpots.crest.length);
    expect(game.peek().ribbon).toBe(true);
    expect(ctx.done).toBe(true);
    expect(ctx.finished.q).toBe(1);
    // (à côté du cheval : pas de pschitt)
    game.destroy();
    sc.dispose();
  }, 30000);
});

describe('finitions en 3D : ce qu\'on choisit, c\'est ce qu\'on voit', () => {
  it('le cheval ne se voit proposer que les rubans et le nœud de queue (pas de chapeau, clochette, bandana…)', () => {
    const p = { level: 30, groomer: { served: 9999, history: [] }, careers: { xp: { groomer: 99999 } } };
    const all = sim.finishAccessories(p, 'dog');
    const horse = sim.finishAccessories(p, 'horse');
    expect(horse.every((k) => sim.HORSE_FINISH.includes(k))).toBe(true);
    expect(horse).toContain('ribbon');
    for (const k of ['hat', 'bell', 'bandana', 'flower', 'bow']) expect(horse).not.toContain(k);
    expect(all.length).toBeGreaterThan(horse.length);
  });

  it('nœud de queue : le nœud sur la queue, les tresses sans ruban ; le pschitt fait des nuages ronds (texture), pas des carrés', () => {
    groomer.setFinishOptions({ accessories: ['ribbon', 'tailBow'], current: null, allowNone: true });
    const { a, sc } = makeStage({ breed: 'selle_francais' });
    const ctx = salonCtx(a, sc);
    const game = groom3d.gfinish3dGame(ctx);
    run(ctx, game, sc, 0.3);
    const [acc] = ctx.buttons.filter((b) => !b.opts.cls?.includes('stop'));
    acc.opts.onTap();
    acc.opts.onTap();
    expect(ctx.choice.id).toBe('tailBow');
    const body = sc.project(sc.marks.body);
    game.down(body);
    const puffs = sc.scene.children.filter((o) => o.isSprite);
    expect(puffs.length).toBeGreaterThan(0);
    for (const sp of puffs) expect(sp.material.map).toBeTruthy();
    run(ctx, game, sc, 0.5);
    for (let i = 0; i < 2; i++) {
      game.down(body);
      run(ctx, game, sc, 0.5);
    }
    expect(ctx.done).toBe(true);
    const st = game.peek();
    expect(st.knobs).toBe(sc.model.braidSpots.crest.length);
    expect(st.tailBow).toBe(true);
    expect(st.ribbon).toBe(false);
    game.destroy();
    sc.dispose();
  }, 30000);
});

describe('tonte en 3D', () => {
  it('la tondeuse en bandes sur la robe : le poil d\'hiver s\'en va, toutes les zones sont tondues, même note que le jeu dessiné', () => {
    groomer.setCutStyle('tonte');
    const { a, sc } = makeStage({ breed: 'percheron' });
    const ctx = salonCtx(a, sc);
    const game = groom3d.gcut3dGame(ctx);
    run(ctx, game, sc, 0.3);
    const s0 = game.peek();
    expect(s0.style).toBe('tonte');
    expect(s0.toCut.length).toBeGreaterThan(20);
    expect(s0.keep.length).toBe(0);
    const fur = sc.model.coatMesh.parent.children.find((o) => o.userData.coatGloss).userData.api;
    // (le poil d'hiver qui reste sur le flanc qu'on voit, au milieu du corps)
    const L = sc.marks;
    const alpha = () => {
      const pos = fur.positions(9);
      let n = 0;
      for (let i = 0; i < fur.count; i++) {
        const x = pos[i * 3];
        const y = pos[i * 3 + 1];
        const z = pos[i * 3 + 2];
        if (z < L.body.z + 0.05 || x < L.tail.x + 0.15 || x > L.chest.x - 0.1 || y < L.belly.y + 0.08 || y > L.back.y - 0.05) continue;
        if (fur.value(i) > 0.5) n++;
      }
      return n;
    };
    const before = alpha();
    expect(before).toBeGreaterThan(40);
    for (let i = 0; i < 6 && !ctx.done; i++) sweep(sc, game, ctx, { rows: 9 + i, dir: i % 2 ? 1 : -1, steps: 30, wide: 0.15 });
    expect(ctx.done).toBe(true);
    expect(ctx.finished.q).toBe(1);
    expect(alpha()).toBeLessThan(before * 0.25);
    game.destroy();
    sc.dispose();
  }, 60000);
});

describe('la tête dans l\'image au début de chaque jeu 3D du salon et du concours', () => {
  it('séchage, tonte, finitions, lustrage : bout du nez et oreilles avec au moins 5 % de marge (5 chevaux)', async () => {
    const headFrame = await import('../src/ui/minigames/headFrame.js');
    const beauty3d = await import('../src/ui/minigames/beauty3d.js');
    const games = { gdry: groom3d.gdry3dGame, gcut: groom3d.gcut3dGame, gfinish: groom3d.gfinish3dGame, shine: beauty3d.shine3dGame };
    for (const [breed, foal] of [['selle_francais', false], ['frison', false], ['shetland', false], ['falabella', false], ['selle_francais', true]]) {
      for (const [name, make] of Object.entries(games)) {
        const { a, sc } = makeStage({ breed, foal });
        const ctx = name === 'shine' ? ctxFor(a, sc, { opts: { out: {} } }) : salonCtx(a, sc);
        const game = make(ctx);
        const shape = headFrame.headShape(sc);
        let worst = 9;
        run(ctx, game, sc, 2, 1 / 30, (k) => {
          if (k > 15) worst = Math.min(worst, headFrame.headMargins(sc, shape.points(0)).min);
        });
        expect(worst, `${name} ${breed}${foal ? ' poulain' : ''}`).toBeGreaterThanOrEqual(0.05);
        game.destroy();
        sc.dispose();
      }
    }
  }, 120000);
});

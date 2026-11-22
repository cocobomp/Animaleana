// La scène de soin des moutons, chèvres et vaches sans navigateur (faux rendu), pour les tests des soins de la
// ferme en 3D (tests/farm3dMore.test.js) : le vrai modèle réaliste (GLB chargé dans node), la bergerie, la
// chèvrerie ou l'étable, la caméra, le doigt et la projection.
import { fakeCtx as fakeCtxOf, fakeDocument } from './careCtx.js';
import { loadRealSheepGltf } from './realSheepGltf.js';
import { loadRealGoatGltf } from './realGoatGltf.js';
import { loadRealCowGltf } from './realCowGltf.js';

let M = null;

/** Charge les modules et les GLB (une fois). */
export async function loadFarm() {
  if (M) return M;
  fakeDocument();
  M = {
    t: (await import('../../src/i18n.js')).t,
    gltf: { sheep: await loadRealSheepGltf(), goat: await loadRealGoatGltf(), cow: await loadRealCowGltf() },
    stage: await import('../../src/game/care/stage.js'),
    barn: await import('../../src/game/care/farmBarn.js'),
    ruminant: await import('../../src/game/care/ruminant.js'),
    animal: await import('../../src/sim/animal.js'),
    frame: await import('../../src/ui/minigames/frame.js'),
  };
  return M;
}

/** Une scène : l'animal (espèce, race, âge, sexe) dans son bâtiment, toile de téléphone en portrait. */
export function farmStage({ species = 'goat', breed = null, young = false, sex = 'f', w = 390, h = 600, name = 'Biquette', needs = 25 } = {}) {
  const a = M.animal.createAnimal({ species, breed, colorIndex: 0, ageDays: young ? 5 : 900, seed: 77, sex });
  a.name = name;
  a.sex = sex;
  for (const k in a.needs) a.needs[k] = needs;
  const model = M.ruminant.buildRuminantModel(a, M.gltf[species]);
  const sc = new M.stage.CareStage({ a, renderer: M.stage.headlessRenderer(), model, set: M.barn.barnSet, fit: M.ruminant.RUMINANT_FIT });
  sc.resize(w, h, M.frame.fitView(w, h, 400, 360));
  sc.ready = true;
  for (const act of Object.values(model.anim?.actions ?? {})) act.time = 0;
  const ctx = fakeCtxOf(a, M.t, { scene: sc, view: M.frame.fitView(w, h, 400, 360) });
  return { a, sc, ctx };
}

/** s secondes de jeu : le jeu, puis la scène (comme la boucle du cadre). */
export function run(ctx, game, sc, s, dt = 1 / 30) {
  for (let k = 0; k < s / dt; k++) {
    ctx.time += dt;
    game.update(dt);
    sc.update(dt);
  }
}

export const inView = (q, v, m = 0) => !q.behind && q.x > v.x0 + m && q.x < v.x1 - m && q.y > v.y0 + m && q.y < v.y1 - m;

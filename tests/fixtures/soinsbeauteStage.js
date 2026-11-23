// Scène de soin du cheval, construite sans navigateur (faux rendu : stage.headlessRenderer), pour les tests du
// chantier « soinsbeaute » : le vrai cheval réaliste (GLB chargé dans node) d'une race et d'un âge donnés, dans son
// box, la caméra, la projection ; et le cadre en faux (careCtx.js) à la même taille de toile.
import { fakeCtx as fakeCtxOf, fakeDocument } from './careCtx.js';
import { loadRealHorseGltf } from './realHorseGltf.js';

let mods = null;

/** Charge une fois le GLB et les modules de la scène. */
export async function loadStageMods() {
  if (mods) return mods;
  fakeDocument();
  const { t } = await import('../../src/i18n.js');
  const gltf = await loadRealHorseGltf();
  const horseReal = await import('../../src/game/models/horseReal.js');
  horseReal.realHorseBase(gltf);
  mods = {
    t,
    gltf,
    horseReal,
    stage: await import('../../src/game/care/stage.js'),
    stall: await import('../../src/game/care/stall.js'),
    animal: await import('../../src/sim/animal.js'),
    frame: await import('../../src/ui/minigames/frame.js'),
  };
  return mods;
}

/** Les chevaux essayés : race, robe, âge. */
export const HORSES = [
  { key: 'sf', breed: 'selle_francais', colorIndex: 1 },
  { key: 'frison', breed: 'frison', colorIndex: 0 },
  { key: 'shetland', breed: 'shetland', colorIndex: 0 },
  { key: 'falabella', breed: 'falabella', colorIndex: 2 },
  { key: 'percheron', breed: 'percheron', colorIndex: 0 },
  { key: 'arabe', breed: 'arabe', colorIndex: 0 },
  { key: 'appaloosa', breed: 'appaloosa', colorIndex: 0 },
  { key: 'poulain', breed: 'selle_francais', colorIndex: 0, foal: true },
];

/** Une scène headless : le cheval dans son box, toile de téléphone (portrait 390 × 600, ou paysage). */
export function makeStage({ breed = 'selle_francais', colorIndex = 0, foal = false, w = 390, h = 600, name = 'Honey', needs = 25, personality = null } = {}) {
  const { horseReal, stage, stall, animal, frame } = mods;
  const a = animal.createAnimal({ species: 'horse', breed, colorIndex, ageDays: foal ? 7 : 900, seed: 77 });
  a.name = name;
  if (personality) a.personality = personality;
  for (const k in a.needs) a.needs[k] = needs;
  const model = horseReal.buildRealHorseModel(animal.stageLook(a), a.breed, mods.gltf);
  const sc = new stage.CareStage({ a, renderer: stage.headlessRenderer(), model, set: stall.stallSet });
  sc.resize(w, h, frame.fitView(w, h, 400, 360));
  sc.ready = true;
  for (const act of Object.values(model.anim?.actions ?? {})) act.time = 0;
  return { a, sc };
}

/** Le cadre autour de la scène. */
export const ctxFor = (a, sc, extra = {}) => fakeCtxOf(a, mods.t, { scene: sc, view: mods.frame.fitView(sc.size.w, sc.size.h, 400, 360), ...extra });

/** s secondes de jeu : le jeu, puis la scène (comme la boucle du cadre) ; each(k) après chaque image. */
export function run(ctx, game, sc, s, dt = 1 / 30, each = null) {
  for (let k = 0; k < s / dt; k++) {
    ctx.time += dt;
    game.update(dt);
    sc.update(dt);
    each?.(k);
  }
}

/** La carte de fin, comme le cadre : elle couvre le bas de la toile (la scène se recadre au-dessus). */
export function endCard(sc, frac = 0.5) {
  sc.setFocus(0, sc.size.h * frac);
}

// Une scène de soin 3D d'un animal de compagnie (chien, chat, lapin), construite sans navigateur (faux rendu
// headlessRenderer, vrai modèle réaliste chargé dans node) : pour tests/pets3dStage.test.js.
import { fakeCtx as fakeCtxOf, fakeDocument } from './careCtx.js';
import { loadRealDogGltf } from './realDogGltf.js';
import { loadRealCatGltf } from './realCatGltf.js';
import { loadRealRabbitGltf } from './realRabbitGltf.js';

let M = null;
/** Charge les modules et les six GLB (une fois). */
export async function loadPets() {
  if (M) return M;
  fakeDocument();
  const G = {
    shiba: await loadRealDogGltf('shiba'), jack: await loadRealDogGltf('jack'),
    adult: await loadRealCatGltf('adult'), kitten: await loadRealCatGltf('kitten'),
    up: await loadRealRabbitGltf('up'), lop: await loadRealRabbitGltf('lop'),
  };
  M = {
    G,
    t: (await import('../../src/i18n.js')).t,
    animal: await import('../../src/sim/animal.js'),
    frame: await import('../../src/ui/minigames/frame.js'),
    stage: await import('../../src/game/care/stage.js'),
    petStage: await import('../../src/game/care/petStage.js'),
    home: await import('../../src/game/care/home.js'),
    hutch: await import('../../src/game/care/hutch.js'),
    dog: await import('../../src/game/models/dogReal.js'),
    cat: await import('../../src/game/models/catReal.js'),
    rabbit: await import('../../src/game/models/rabbitReal.js'),
    dogLook: await import('../../src/sim/dogLook.js'),
    catLook: await import('../../src/sim/catLook.js'),
    rabbitLook: await import('../../src/sim/rabbitLook.js'),
    animalModel: await import('../../src/game/models/animalModel.js'),
  };
  return M;
}

/** Le modèle réaliste de cet animal (comme buildAnimalModel dans le jeu, avec les GLB de node). */
export function buildPetModel(a) {
  const look = M.animal.stageLook(a);
  if (a.species === 'dog') {
    const lk = M.animalModel.dogLookWithBreed(look, a.breed);
    return M.dog.buildRealDogModel(lk, a.breed, M.G[M.dogLook.dogModelOf(lk)]);
  }
  if (a.species === 'cat') {
    const st = look.kitten ? 'baby' : look.young ? 'young' : 'adult';
    return M.cat.buildRealCatModel(M.catLook.catLookWithBreed(look, a.breed), st, M.G[st === 'baby' ? 'kitten' : 'adult']);
  }
  const st = look.kit ? 'baby' : look.young ? 'young' : 'adult';
  const lk = M.rabbitLook.rabbitLookWithBreed(look, a.breed);
  return M.rabbit.buildRealRabbitModel(lk, st, M.G[M.rabbitLook.rabbitBuild(lk, st).model]);
}

/** Une scène : l'animal (espèce, race, âge en jours) dans son décor, toile de téléphone en portrait. */
export function makePetStage({ species = 'dog', breed = 'labrador', ageDays = 900, w = 390, h = 600, name = 'Filou', needs = 30, colorIndex = 0 } = {}) {
  const a = M.animal.createAnimal({ species, breed, colorIndex, ageDays, seed: 77, personality: 'calm', sex: 'm' });
  a.name = name;
  for (const k in a.needs) a.needs[k] = needs;
  const model = buildPetModel(a);
  const set = species === 'rabbit' ? M.hutch.hutchSet : M.home.homeSet;
  const sc = new M.petStage.PetStage({ a, renderer: M.stage.headlessRenderer(), model, set });
  sc.resize(w, h, M.frame.fitView(w, h, 400, 360));
  sc.ready = true;
  for (const act of Object.values(model.anim?.actions ?? {})) act.time = 0;
  return { a, sc };
}

/** Le cadre autour de la scène. */
export const ctxFor = (a, sc, w = 390, h = 600) => fakeCtxOf(a, M.t, { scene: sc, view: M.frame.fitView(w, h, 400, 360) });

/** s secondes de jeu : le jeu, puis la scène (comme la boucle du cadre). */
export function run(ctx, game, sc, s, dt = 1 / 30) {
  for (let k = 0; k < s / dt; k++) {
    ctx.time += dt;
    game?.update(dt);
    sc.update(dt);
    // (comme le rendu : les matrices des os et des objets sont mises à jour à chaque image)
    sc.scene.updateMatrixWorld();
  }
}

export const inView = (q, v, m = 0) => q.x > v.x0 + m && q.x < v.x1 - m && q.y > v.y0 + m && q.y < v.y1 - m;

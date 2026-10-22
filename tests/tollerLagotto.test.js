// Retriever de la Nouvelle-Écosse (« toller ») et lagotto romagnolo : données de la race, gabarit, robes, modèle 3D
// (marques blanches, panache relevé en action, bouclettes serrées), animalerie et élevage, salon de toilettage.
// Déterministe (graines fixes, pas de temps fixe).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealDogModel, realDogBase, deformDog } from '../src/game/models/dogReal.js';
import { coatPlan } from '../src/game/models/dogCoat.js';
import { DOG_BUILDS, dogBuild, dogModelOf } from '../src/sim/dogLook.js';
import { SPECIES, getBreed } from '../src/sim/species.js';
import { resolveLook } from '../src/sim/animal.js';
import { breedsFor } from '../src/sim/adoption.js';
import { STYLES, REQUESTS, newClient, stylesFor, addCareerXp } from '../src/sim/groomer.js';
import { makeClientRequest } from '../src/sim/dogTrainer.js';
import { seeded } from '../src/sim/rng.js';
import { createProfile } from '../src/sim/profile.js';
import { xpForLevel } from '../src/sim/progress.js';
import { t } from '../src/i18n.js';
import { GROOMER_FR, GROOMER_EN } from '../src/ui/groomerTexts.js';
import { loadRealDogGltf } from './fixtures/realDogGltf.js';

let G;
beforeAll(async () => {
  G = { shiba: await loadRealDogGltf('shiba'), jack: await loadRealDogGltf('jack') };
}, 120000);

const lookOf = (breed, colorIndex = 0, puppy = false) => ({ ...resolveLook('dog', breed, colorIndex), seed: 4242, ...(puppy ? { puppy: true } : {}) });
const dog = (breed, colorIndex = 0, puppy = false) => {
  const look = lookOf(breed, colorIndex, puppy);
  return buildRealDogModel(look, breed, G[dogModelOf(look)]);
};
const plan = (breed, i = 0) => coatPlan(resolveLook('dog', breed, i), breed);
const white = (c) => new THREE.Color(c).getHSL({}).l > 0.85;

describe('les deux races dans les données', () => {
  it('noms FR et EN, rareté 2, chiens moyens (modèle du shiba), robes de la race', () => {
    const toller = getBreed('dog', 'toller');
    const lagotto = getBreed('dog', 'lagotto');
    expect(toller.name).toEqual({ fr: 'Retriever de la Nouvelle-Écosse', en: 'Nova Scotia Duck Tolling Retriever' });
    expect(lagotto.name).toEqual({ fr: 'Lagotto romagnolo', en: 'Lagotto Romagnolo' });
    for (const b of [toller, lagotto]) {
      expect(b.rarity).toBe(2);
      expect(dogModelOf({ breed: b.id })).toBe('shiba');
      // (plus petits que le golden, moyens : 43 à 48 cm au garrot pour 57 cm au labrador)
      expect(b.scale).toBeLessThan(getBreed('dog', 'golden').scale);
      expect(b.scale).toBeGreaterThan(0.75);
      for (const c of b.colors) expect(c.name.fr && c.name.en, `${b.id} ${c.name.fr}`).toBeTruthy();
    }
    // toller : roux ou orange vif à marques blanches, et un roux sans blanc
    expect(toller.colors.map((c) => c.name.en)).toEqual(['Red with white markings', 'Orange with white markings', 'Dark red']);
    // lagotto : blanc cassé, blanc à taches marron, rouan marron, marron, orange, blanc à taches orange
    expect(lagotto.colors.map((c) => c.name.fr)).toEqual(['Blanc cassé', 'Blanc taché marron', 'Rouan marron', 'Marron', 'Orange', 'Blanc taché orange']);
  });

  it('vendus à l\'animalerie et au refuge de la maison ; le toller aussi à l\'élevage du voyage au Canada', () => {
    const home = breedsFor('maison', true).filter((p) => p.species === 'dog').map((p) => p.breed.id);
    expect(home).toContain('toller');
    expect(home).toContain('lagotto');
    const canada = breedsFor('canada').filter((p) => p.species === 'dog').map((p) => p.breed.id);
    expect(canada).toContain('toller');
    expect(canada).not.toContain('lagotto');
    // (ailleurs, pas d'élevage du toller)
    expect(breedsFor('japon').map((p) => p.breed.id)).not.toContain('toller');
  });
});

describe('gabarits', () => {
  it('toller : retriever compact aux oreilles tombantes courtes attachées haut, franges, panache relevé en action', () => {
    const B = dogBuild(lookOf('toller'));
    const golden = dogBuild(lookOf('golden'));
    expect(B.ears).toBe('floppy');
    expect(B.earLen).toBeLessThan(golden.earLen);
    expect(B.earSet).toBeGreaterThan(0);
    expect(B.tail).toBe('brush');
    expect(B.tailAction).toBeGreaterThan(0.5);
    expect(B.feather).toBeGreaterThanOrEqual(0.8);
    expect(B.fur).toBeGreaterThan(0);
    expect(B.curly).toBe(0);
    // (tête en coin : museau plus fin que le golden)
    expect(B.muzzleW).toBeLessThan(golden.muzzleW);
  });

  it('lagotto : silhouette carrée (dos court), tout en boucles serrées, sourcils et barbe, oreilles bouclées, queue en faucille', () => {
    const B = dogBuild(lookOf('lagotto'));
    const doodle = dogBuild(lookOf('labradoodle'));
    expect(B.back).toBeLessThan(0.9);
    expect(B.curly).toBe(1);
    expect(B.ringlets).toBe(1);
    expect(doodle.ringlets).toBe(0);
    expect(B.beard).toBeGreaterThan(0.5);
    expect(B.fur).toBeGreaterThan(0.02);
    expect(B.ears).toBe('floppy');
    expect(B.tail).toBe('sickle');
    expect(B.pompons).toBe(0);
    // chiot : bouclé aussi (poil plus court), toujours reconnaissable
    const P = dogBuild(lookOf('lagotto', 0, true), true);
    expect(P.ringlets).toBe(1);
    expect(P.fur).toBeGreaterThan(0.01);
  });

  it('gabarits distincts du golden, du labradoodle et du caniche (et entre eux)', () => {
    const keys = ['toller', 'lagotto', 'golden', 'labradoodle', 'caniche'].map((b) => dogBuild(lookOf(b)).key);
    expect(new Set(keys).size).toBe(5);
    expect(DOG_BUILDS.toller).toBeTruthy();
    expect(DOG_BUILDS.lagotto).toBeTruthy();
  });
});

describe('robes', () => {
  it('toller roux ou orange : marques blanches (liste, museau, poitrail, pieds, bout de la queue), ventre roux, franges plus claires', () => {
    for (const i of [0, 1]) {
      const P = plan('toller', i);
      expect(P.under).toBe(1);
      expect(white(P.underColor)).toBe(true);
      expect(P.blaze).toBeGreaterThan(0.3);
      expect(P.tailTip).toBe(1);
      expect(P.face).toBeGreaterThan(0);
      // pieds blancs seulement (pas au-dessus du paturon) ; blanc au poitrail, pas au ventre
      expect(P.legLevel).toBeLessThan(0.2);
      expect(P.chestOnly).toBe(1);
      expect(P.light).toBeGreaterThan(0);
      // (roux ou orange vif : plus rouge que vert, bien plus que bleu)
      const c = new THREE.Color(P.base);
      expect(c.r).toBeGreaterThan(c.g * 1.4);
      expect(c.g).toBeGreaterThan(c.b);
    }
    // roux foncé sans blanc : ni liste ni pieds blancs, franges plus claires gardées
    const D = plan('toller', 2);
    expect(D.blaze).toBe(0);
    expect(D.tailTip).toBe(0);
    expect(D.light).toBeGreaterThan(0);
  });

  it('lagotto : unies, taches marron ou orange (tête colorée, plaques), rouan boucle par boucle, laine mate', () => {
    expect(plan('lagotto', 0).headPatch).toBe(0);
    for (const i of [1, 5]) {
      const P = plan('lagotto', i);
      expect(P.headPatch).toBeGreaterThan(0.5);
      expect(P.blobs).toBeGreaterThan(0.3);
    }
    const roan = plan('lagotto', 2);
    expect(roan.tick).toBe(1);
    expect(roan.headPatch).toBeGreaterThan(0.5);
    // (fond mêlé de blanc et de marron, pas blanc pur)
    expect(roan.base).not.toBe(0xefe9de);
    // laine bouclée mate, même marron (pas le lustre des robes sombres lisses)
    expect(plan('lagotto', 3).sheen).toBeLessThan(0.3);
  });
});

describe('modèle 3D', () => {
  it('lagotto : bouclettes dans le shader, laine mate, oreilles bouclées modelées, coupe « lagotto » du salon', () => {
    const md = dog('lagotto');
    expect(md.uniforms.cCurl.value.z).toBe(1);
    expect(md.coatMesh.material.roughness).toBeGreaterThan(0.8);
    expect(md.coatMesh.geometry.attributes.position.count).toBeGreaterThan(realDogBase(G.shiba, 'shiba').prims.coat.count);
    // pas de pompons modelés (ce n'est pas un caniche)
    expect(md.coatMesh.geometry.attributes.cmpPom).toBeUndefined();
    // par défaut, ses boucles naturelles ; la coupe du salon égalise le corps, garde les pattes, arrondit la tête
    expect(md.uniforms.cCut.value.toArray()).toEqual([0, 0, 0, 0]);
    md.setCut('lagotto');
    const [trunk, ruff, legs, top] = md.uniforms.cCut.value.toArray();
    expect(trunk).toBeLessThan(0);
    expect(ruff).toBeLessThan(0);
    expect(legs).toBe(0);
    expect(top).toBeGreaterThan(0);
    md.setCut(null);
    expect(md.uniforms.cCut.value.toArray()).toEqual([0, 0, 0, 0]);
    md.dispose();
    // (les autres chiens n'ont pas de bouclettes serrées)
    for (const b of ['labradoodle', 'caniche', 'golden', 'toller']) {
      const m = dog(b);
      expect(m.uniforms.cCurl.value.z, b).toBe(0);
      m.dispose();
    }
  });

  it('lagotto : les touffes de boucles festonnent la silhouette (et pas en éclats : relief lissé)', () => {
    const base = realDogBase(G.shiba, 'shiba');
    const B = dogBuild(lookOf('lagotto'));
    const smooth = dogBuild({ ...lookOf('lagotto'), breed: 'lagotto' });
    smooth.ringlets = 0;
    const A = deformDog(base, B);
    const S = deformDog(base, smooth);
    const n = base.prims.coat.count;
    let max = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const d = Math.hypot(A.pos[i * 3] - S.pos[i * 3], A.pos[i * 3 + 1] - S.pos[i * 3 + 1], A.pos[i * 3 + 2] - S.pos[i * 3 + 2]);
      max = Math.max(max, d);
      sum += d;
    }
    expect(sum / n).toBeGreaterThan(0.002);
    // (sans lissage, des éclats de 3 cm se dressaient sur la tête)
    expect(max).toBeLessThan(0.025);
  });

  it('toller : marques blanches dans le shader, panache relevé au trot plus haut qu\'à l\'arrêt', () => {
    const md = dog('toller');
    expect(md.uniforms.cUnder2.value.y).toBe(1); // bout de la queue
    expect(md.uniforms.cUnder2.value.x).toBeGreaterThan(0.3); // liste
    expect(md.uniforms.cLight.value.y).toBe(1); // blanc au poitrail seulement
    const tipY = () => {
      md.root.updateMatrixWorld(true);
      return md.tailTip.getWorldPosition(new THREE.Vector3()).y;
    };
    md.staticPose('stand');
    for (let f = 0; f < 60; f++) md.anim.update(1 / 30, { v: 0, moving: false, posture: 'stand', happy: 0 });
    const rest = tipY();
    for (let f = 0; f < 90; f++) {
      md.anim.update(1 / 30, { v: 2.6, moving: true, happy: 0.25 });
      md.root.position.z += 2.6 / 30;
    }
    const trot = tipY();
    // (au trot, le panache monte d'au moins 5 cm, chien de taille 1)
    expect(trot - rest).toBeGreaterThan(0.05);
    // il ne se pose pas sur le dos (pas une queue enroulée de spitz)
    const withers = md.bone('scapL').getWorldPosition(new THREE.Vector3()).y;
    expect(trot).toBeLessThan(withers + 0.25);
    md.dispose();
    // (le golden garde son panache bas au trot)
    const g = dog('golden');
    g.staticPose('stand');
    for (let f = 0; f < 60; f++) g.anim.update(1 / 30, { v: 0, moving: false, posture: 'stand', happy: 0 });
    g.root.updateMatrixWorld(true);
    const gRest = g.tailTip.getWorldPosition(new THREE.Vector3()).y;
    for (let f = 0; f < 90; f++) {
      g.anim.update(1 / 30, { v: 2.6, moving: true, happy: 0.25 });
      g.root.position.z += 2.6 / 30;
    }
    g.root.updateMatrixWorld(true);
    expect(g.tailTip.getWorldPosition(new THREE.Vector3()).y - gRest).toBeLessThan(trot - rest);
    g.dispose();
  }, 60000);

  it('chiots des deux races : construits, pieds au sol', () => {
    for (const b of ['toller', 'lagotto']) {
      for (let i = 0; i < SPECIES.dog.breeds.find((x) => x.id === b).colors.length; i++) {
        const md = dog(b, i, true);
        expect(md.puppy).toBe(true);
        md.dispose();
      }
    }
  });
});

describe('salon de toilettage', () => {
  it('coupe « lagotto » (rang confirmé, chiens) et client qui amène son lagotto à démêler puis couper', () => {
    expect(STYLES.lagotto).toMatchObject({ rank: 1, species: ['dog'] });
    expect(REQUESTS.lagotto).toMatchObject({ rank: 1, species: ['dog'], breeds: ['lagotto'], style: 'lagotto' });
    expect(REQUESTS.lagotto.steps).toEqual(['bath', 'dry', 'knots', 'cut']);
    const p = createProfile('Lou', 'manage');
    p.money = 1000;
    p.xp = xpForLevel(3);
    expect(stylesFor(p, 'dog')).not.toContain('lagotto');
    addCareerXp(p, 300);
    expect(stylesFor(p, 'dog')).toContain('lagotto');
    expect(stylesFor(p, 'cat')).not.toContain('lagotto');
    const c = newClient(p, { requestId: 'lagotto', rng: () => 0.42, day: 3 });
    expect(c.animal.breed).toBe('lagotto');
    expect(c.style).toBe('lagotto');
    for (const D of [GROOMER_FR, GROOMER_EN]) {
      expect(D.grm_style_lagotto).toBeTruthy();
      expect(D.grm_req_lagotto).toContain('{name}');
    }
    expect(t('grm_req_lagotto', { name: 'Truffe' })).toContain('Truffe');
  });

  it('la demande « lagotto » reste rare : moins de 8 % de lagottos parmi les chiens clients, au rang confirmé et expert', () => {
    // (demande d'une seule race, de rang 1 : comptée deux fois au rang confirmé, elle amenait un chien client sur quatre)
    expect(REQUESTS.lagotto.weight).toBeLessThan(0.5);
    for (const xp of [300, 3000]) {
      const p = createProfile('Lou', 'manage');
      p.xp = xpForLevel(8);
      addCareerXp(p, xp);
      let dogs = 0;
      let lagotto = 0;
      for (let s = 0; s < 1200; s++) {
        const c = newClient(p, { rng: seeded('c' + s), day: 3 });
        if (c.animal.species !== 'dog') continue;
        dogs++;
        if (c.animal.breed === 'lagotto') lagotto++;
      }
      expect(dogs, `xp ${xp}`).toBeGreaterThan(300);
      expect(lagotto / dogs, `xp ${xp}`).toBeLessThan(0.08);
      // (il en vient quand même : demandes de coupe et clients ordinaires)
      expect(lagotto, `xp ${xp}`).toBeGreaterThan(0);
    }
  }, 60000);
});

describe('éducateur canin', () => {
  it('les chiens des clients sont de races variées de la maison, toller et lagotto compris (pas toujours un labrador)', () => {
    const p = createProfile('Lou', 'manage');
    const count = {};
    for (let s = 0; s < 600; s++) {
      const b = makeClientRequest(p, { day: 3, rng: seeded('e' + s) }).dog.breed;
      count[b] = (count[b] ?? 0) + 1;
    }
    expect(Object.keys(count).length).toBeGreaterThan(15);
    expect(count.toller).toBeGreaterThan(0);
    expect(count.lagotto).toBeGreaterThan(0);
    expect(count.labrador ?? 0).toBeLessThan(600 * 0.15);
    // (races de la maison seulement : pas d'élevage du voyage)
    for (const b of Object.keys(count)) {
      const br = getBreed('dog', b);
      expect(br.origin === null || br.homeShop, b).toBeTruthy();
    }
  }, 60000);
});

// Chiens réalistes (shiba et jack russell, GLB chargés dans node sans textures) : fichiers, races, chiots, pieds au
// sol dans toutes les poses et allures, robes, poses des tours, équipement, crédits CC-BY. Tout est déterministe
// (graines fixes, pas de temps fixe).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildRealDogModel, pickDogGait, realDogPose, REAL_DOG_KEYS } from '../src/game/models/dogReal.js';
import { coatPlan } from '../src/game/models/dogCoat.js';
import { buildGear, removeGear } from '../src/game/gearModels.js';
import { buildAccessories } from '../src/game/models/salon.js';
import { DOG_BUILDS, SMALL_DOG, dogBuild, dogModelOf } from '../src/sim/dogLook.js';
import { SPECIES } from '../src/sim/species.js';
import { resolveLook } from '../src/sim/animal.js';
import { MODELS } from '../src/game/assets.js';
import { MODEL_CREDITS } from '../src/ui/credits.js';
import { loadRealDogGltf, DOG_FILES, glbJson } from './fixtures/realDogGltf.js';

const BREEDS = SPECIES.dog.breeds.map((b) => b.id);
let G;
beforeAll(async () => {
  G = { shiba: await loadRealDogGltf('shiba'), jack: await loadRealDogGltf('jack') };
}, 120000);

const lookOf = (breed, { colorIndex = 0, puppy = false } = {}) => {
  const look = { ...resolveLook('dog', breed, colorIndex), seed: 4242 };
  return puppy ? { ...look, puppy: true } : look;
};
const dog = (breed, opts = {}) => {
  const look = lookOf(breed, opts);
  return buildRealDogModel(look, breed, G[dogModelOf(look)]);
};

const _v = new THREE.Vector3();
/** Point le plus bas de la peau (repère du chien), sans la queue si noTail. */
function lowest(md, { noTail = false, step = 2 } = {}) {
  md.root.updateMatrixWorld(true);
  const m = md.coatMesh;
  const si = m.geometry.attributes.skinIndex;
  const sw = m.geometry.attributes.skinWeight;
  const tail = new Set(md.tailBones.map((b) => md.bones.indexOf(b)));
  let lo = Infinity;
  for (let i = 0; i < m.geometry.attributes.position.count; i += step) {
    if (noTail) {
      let wt = 0;
      for (let k = 0; k < 4; k++) if (tail.has(si.getComponent(i, k))) wt += sw.getComponent(i, k);
      if (wt > 0.3) continue;
    }
    m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
    lo = Math.min(lo, _v.y);
  }
  return lo;
}

describe('fichiers des chiens réalistes', () => {
  it.each([['shiba', 57, 900_000], ['jack', 36, 560_000]])('%s : os, clips, compression, vitesses naturelles, poids', (kind, joints, maxBytes) => {
    const buf = fs.readFileSync(DOG_FILES[kind]);
    expect(buf.length).toBeLessThan(maxBytes);
    const json = glbJson(buf);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']));
    expect(json.skins[0].joints.length).toBe(joints);
    const names = new Set(json.nodes.map((n) => n.name));
    for (const b of ['root', 'pelvis', 'head', 'tail1', 'ear1L', 'ear2R', 'radiusL', 'toesR', 'femurL', 'htoesR', 'eyeL']) expect(names, b).toContain(b);
    if (kind === 'shiba') for (const b of ['jaw', 'tongue1', 'lidUL', 'breathe']) expect(names, b).toContain(b);
    const clips = json.animations.map((a) => a.name);
    for (const c of ['idle', 'walk', 'trot', 'run', 'sit', 'lie', 'sleep', 'sniff', 'eat', 'drink', 'wag', 'paw', 'rollover', 'bow', 'jump', 'sit_down', 'stand_up', 'lie_down', 'get_up']) expect(clips, c).toContain(c);
    // canaux inutiles retirés : plus aucune échelle animée
    for (const a of json.animations) for (const ch of a.channels) expect(ch.target.path).not.toBe('scale');
    const extras = json.scenes[json.scene ?? 0].extras?.dog;
    expect(extras.naturalSpeeds.walk).toBeGreaterThan(0.6);
    expect(extras.naturalSpeeds.run).toBeGreaterThan(extras.naturalSpeeds.trot);
    expect(json.materials.map((m) => m.name)).toContain('dog_coat');
  });

  it('les clés des modèles sont dog_shiba et dog_jack (jamais « dog » : le chien procédural reste le repli)', () => {
    expect(REAL_DOG_KEYS).toEqual({ shiba: 'dog_shiba', jack: 'dog_jack' });
    expect(MODELS.dog_shiba).toBe('dog_shiba.glb');
    expect(MODELS.dog_jack).toBe('dog_jack.glb');
    expect(MODELS.dog).toBeUndefined();
  });
});

describe('races et chiots', () => {
  it('chaque race a son gabarit ; les petites prennent le jack russell, les autres le shiba', () => {
    for (const b of SPECIES.dog.breeds) {
      expect(DOG_BUILDS[b.id], b.id).toBeTruthy();
      expect(dogModelOf({ breed: b.id })).toBe(b.scale <= SMALL_DOG ? 'jack' : 'shiba');
    }
    // des gabarits différents (pas deux races identiques)
    const keys = new Set(BREEDS.map((b) => dogBuild(lookOf(b)).key));
    expect(keys.size).toBe(BREEDS.length);
  });

  it('chiot : tête plus grosse, pattes et museau plus courts, oreilles pas encore dressées (ou plus petites)', () => {
    for (const b of BREEDS) {
      const A = dogBuild(lookOf(b));
      const P = dogBuild(lookOf(b), true);
      expect(P.head).toBeGreaterThan(A.head);
      expect(P.legs).toBeLessThan(A.legs);
      expect(P.snout).toBeLessThan(A.snout);
      if (P.model === 'shiba') expect(['pointed', 'bat']).not.toContain(P.ears);
      else if (['pointed', 'bat'].includes(A.ears)) expect(P.earSize).toBeLessThan(A.earSize);
    }
    const md = dog('labrador', { puppy: true });
    expect(md.puppy).toBe(true);
    const ad = dog('labrador');
    // (tête du chiot plus grosse par rapport à la hauteur au garrot)
    expect(md.accessoryFit.headR / md.saddleY).toBeGreaterThan(ad.accessoryFit.headR / ad.saddleY);
    md.dispose();
    ad.dispose();
  });

  it('grosse tête (chihuahua, chiot) : les yeux grossissent moins que la tête (pas d\'yeux globuleux)', () => {
    const eyeOverHead = (md) => {
      const g = md.eyeMesh.geometry;
      g.computeBoundingBox();
      return g.boundingBox.getSize(new THREE.Vector3()).y / md.accessoryFit.headR;
    };
    const jack = dog('jack_russell');
    const chi = dog('chihuahua');
    const pup = dog('jack_russell', { puppy: true });
    expect(eyeOverHead(chi)).toBeLessThan(eyeOverHead(jack) * 0.92);
    expect(eyeOverHead(pup)).toBeLessThan(eyeOverHead(jack) * 0.95);
    for (const md of [jack, chi, pup]) md.dispose();
  });

  it('écourtée : la queue des races « stub » est courte', () => {
    for (const b of ['bouledogue', 'boxer', 'corgi', 'cocker']) expect(dogBuild(lookOf(b)).tailLen, b).toBeLessThan(0.5);
  });
});

describe('pieds au sol', () => {
  it('debout : les 38 races et leurs chiots posent les pieds sur le sol, sans s\'y enfoncer', () => {
    for (const b of BREEDS) {
      for (const puppy of [false, true]) {
        const md = dog(b, { puppy });
        md.staticPose('stand');
        const lo = lowest(md, { step: 5 });
        expect(lo, `${b}${puppy ? ' (chiot)' : ''}`).toBeGreaterThan(-0.008);
        expect(lo, `${b}${puppy ? ' (chiot)' : ''}`).toBeLessThan(0.008);
        md.dispose();
      }
    }
  }, 240000);

  it.each(['labrador', 'galgo', 'corgi', 'teckel', 'chihuahua', 'terre_neuve', 'carlin', 'jack_russell'])('%s : au pas, au trot et au galop, jamais sous le sol ; au pas un pied toujours posé', (b) => {
    for (const puppy of [false, true]) {
      const md = dog(b, { puppy });
      md.staticPose('stand');
      for (const [gait, v] of [['walk', 1.1], ['trot', 2.6], ['run', 6.5]]) {
        let lo = Infinity;
        let hi = -Infinity;
        let walking = true;
        for (let f = 0; f < 150; f++) {
          md.anim.update(1 / 60, { v, moving: true, happy: 0.25 });
          if (f < 60 || f % 3) continue;
          walking &&= md.anim.gait === 'walk';
          const y = lowest(md, { step: 4 });
          lo = Math.min(lo, y);
          hi = Math.max(hi, y);
        }
        const name = `${b}${puppy ? ' (chiot)' : ''} ${gait}`;
        expect(lo, name).toBeGreaterThan(-0.022);
        // (au trot et au galop, il y a des temps de suspension : seul le pas garde toujours un pied posé)
        if (gait === 'walk' && walking) expect(hi, name).toBeLessThan(0.03);
      }
      md.dispose();
    }
  }, 240000);

  it.each(['labrador', 'corgi', 'teckel', 'galgo', 'carlin', 'chihuahua', 'terre_neuve'])('%s : assis, couché, endormi : posé sur le sol (ni en l\'air, ni enfoncé)', (b) => {
    const md = dog(b);
    for (const p of ['sit', 'lie', 'sleep']) {
      md.staticPose(p);
      const lo = lowest(md, { noTail: true, step: 2 });
      expect(lo, `${b} ${p}`).toBeGreaterThan(-0.06);
      expect(lo, `${b} ${p}`).toBeLessThan(0.012);
    }
    md.dispose();
  }, 120000);
});

describe('allures et tours', () => {
  it('allure choisie avec hystérésis (pas de va-et-vient au seuil)', () => {
    expect(pickDogGait('idle', 0)).toBe('idle');
    expect(pickDogGait('idle', 1)).toBe('walk');
    expect(pickDogGait('walk', 1.6)).toBe('walk');
    expect(pickDogGait('walk', 1.8)).toBe('trot');
    expect(pickDogGait('trot', 1.6)).toBe('trot'); // (redescend sous 1,45 seulement)
    expect(pickDogGait('trot', 1.4)).toBe('walk');
    expect(pickDogGait('trot', 4)).toBe('run');
    expect(pickDogGait('run', 3.7)).toBe('run');
    expect(pickDogGait('run', 3.4)).toBe('trot');
    expect(pickDogGait('idle', 8)).toBe('run');
  });

  it('les tours du spectacle et de l\'éducateur jouent les clips du chien (assis, couché, patte, roulade, saut, révérence)', () => {
    const md = dog('border_collie');
    const sg = new THREE.Group();
    sg.rotation.x = 0.4;
    for (const [kind, clip] of [['sit', 'sit'], ['down', 'lie'], ['paw', 'paw'], ['roll', 'rollover'], ['jump', 'jump'], ['bow', 'bow']]) {
      expect(realDogPose(md, kind, 0.8, sg, 0.5)).toBe(true);
      expect(md.anim.trick.clip).toBe(clip);
      md.anim.update(1 / 30, { v: 0, moving: false });
    }
    expect(sg.rotation.x).toBe(0); // le modèle n'est plus basculé d'un bloc
    expect(realDogPose({ legs: [] }, 'sit', 1)).toBe(false); // (autres modèles : leur propre pose)
    md.dispose();
  });

  it('couché sur commande (éducateur canin) puis debout : la posture suit, les transitions jouées une fois', () => {
    const md = dog('labrador');
    for (let f = 0; f < 200; f++) md.anim.update(1 / 30, { v: 0, moving: false, posture: 'lie' });
    expect(md.anim.posture).toBe('lie');
    for (let f = 0; f < 200; f++) md.anim.update(1 / 30, { v: 0, moving: false, posture: 'stand' });
    expect(md.anim.posture).toBe('stand');
    md.dispose();
  });
});

describe('robes', () => {
  it('bringé, dalmatien, noir et feu, et le « sable » français du labrador (jaune) n\'est pas un charbonné', () => {
    const plan = (b, i = 0) => coatPlan(resolveLook('dog', b, i), b);
    expect(plan('galgo', 0).brindle).toBe(1);
    expect(plan('dalmatien').spots).toBeGreaterThan(0);
    expect(plan('rottweiler').points).toBeGreaterThan(0);
    const lab = SPECIES.dog.breeds.find((b) => b.id === 'labrador');
    const sable = lab.colors.findIndex((c) => c.name.fr === 'Sable');
    if (sable >= 0) expect(plan('labrador', sable).sable).toBe(0);
    // chaque robe de chaque race donne un plan (les yeux, la truffe et la langue gardent leur texture)
    for (const b of SPECIES.dog.breeds) for (let i = 0; i < b.colors.length; i++) expect(plan(b.id, i).base).toBeTypeOf('number');
  });
});

describe('équipement ajusté', () => {
  it('collier sur l\'encolure mesurée, manteau lié au squelette, accessoires du salon ; tout se retire', () => {
    for (const b of ['chihuahua', 'labrador', 'terre_neuve', 'teckel']) {
      const md = dog(b);
      const look = lookOf(b);
      const g = buildGear(md, look, { neck: { item: 'collar', color: 'red' }, blanket: { item: 'dogCoat', color: 'navy' } });
      expect(g).toBeTruthy();
      // le collier est sur l'os de l'encolure, l'anneau de la laisse au-dessus du cou
      md.root.updateMatrixWorld(true);
      const ring = md.dogFit.collar;
      expect(ring.bone.children.length).toBeGreaterThan(0);
      const lp = md.leashPoint.getWorldPosition(new THREE.Vector3());
      const neck = md.neck.getWorldPosition(new THREE.Vector3());
      expect(lp.y).toBeGreaterThan(neck.y - 0.02);
      // une bande autour du cou, pas un manchon : sa largeur (le long du cou) reste petite devant son tour
      // (repère de l'anneau : z le long du cou)
      const torus = ring.bone.children.find((o) => o.children?.[0]?.geometry?.type === 'TorusGeometry').children[0];
      torus.geometry.computeBoundingBox();
      torus.updateMatrix();
      const size = torus.geometry.boundingBox.clone().applyMatrix4(torus.matrix).getSize(new THREE.Vector3());
      expect(size.x, b).toBeLessThan(0.6);
      expect(size.z, b).toBeLessThan(0.08);
      expect(size.z, b).toBeLessThan(size.x * 0.3);
      const acc = buildAccessories(md, look, { neck: { id: 'bandana', color: 'pink' }, head: { id: 'ribbon', color: 'blue' } });
      expect(acc.length).toBeGreaterThan(0);
      removeGear(g);
      md.dispose();
    }
  });
});

describe('crédits CC-BY', () => {
  it('les deux chiens sont crédités (auteur, titre, lien, licence, modifications) dans le jeu, CREDITS.md et LICENSES', () => {
    const credits = Object.fromEntries(MODEL_CREDITS.map((c) => [c.id, c]));
    expect(credits.dog_shiba.author).toBe('quander');
    expect(credits.dog_shiba.url).toContain('animated-dog-shiba-inu-9abfce885a834399b2c3ccaed51cd474');
    expect(credits.dog_jack.author).toContain('FainoDS');
    expect(credits.dog_jack.url).toContain('jack-russell-45f1bbf15b67488fba6bea6822d8a7c3');
    for (const c of [credits.dog_shiba, credits.dog_jack]) {
      expect(c.license.name).toBe('CC BY 4.0');
      expect(c.changes.fr.length).toBeGreaterThan(20);
      expect(c.changes.en.length).toBeGreaterThan(20);
    }
    const md = fs.readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8');
    expect(md).toContain('quander');
    expect(md).toContain('FainoDS');
    expect(md).toContain('CC BY 4.0');
    for (const f of ['quander-shiba-inu.txt', 'fainods-jack-russell.txt']) {
      const txt = fs.readFileSync(new URL(`../public/models/LICENSES/${f}`, import.meta.url), 'utf8');
      expect(txt).toContain('creativecommons.org/licenses/by/4.0');
    }
  });
});

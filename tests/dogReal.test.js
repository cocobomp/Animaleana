// Chiens réalistes (shiba et jack russell, GLB chargés dans node sans textures) : fichiers, races, chiots, pieds au
// sol dans toutes les poses et allures, robes, poses des tours, équipement, crédits CC-BY. Tout est déterministe
// (graines fixes, pas de temps fixe).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildRealDogModel, pickDogGait, realDogPose, REAL_DOG_KEYS, realDogBase, deformDog } from '../src/game/models/dogReal.js';
import { coatPlan } from '../src/game/models/dogCoat.js';
import { buildGear, removeGear } from '../src/game/gearModels.js';
import { buildAccessories } from '../src/game/models/salon.js';
import { dogLookWithBreed } from '../src/game/models/animalModel.js';
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

  it('yeux dans leurs orbites : l\'œil animé reste à sa place dans la tête de la race (grosse tête, chiots)', () => {
    // (un os à translation animée que le clip actif n'anime pas recevait deux fois le décalage de la race : œil à 1,6
    // fois sa distance au crâne pour une tête 1,3 fois plus grosse, globe hors de l'orbite)
    const eyeDist = (md) => {
      md.root.updateMatrixWorld(true);
      return md.bone('eyeL').getWorldPosition(new THREE.Vector3()).distanceTo(md.head.getWorldPosition(new THREE.Vector3())) / md.build.head;
    };
    for (const [ref, breeds] of [['shiba', ['saint_bernard', 'terre_neuve', 'akita', 'boxer', 'beagle']], ['jack_russell', ['chihuahua', 'bouledogue', 'carlin']]]) {
      const r = dog(ref);
      const d0 = eyeDist(r);
      for (const b of breeds) {
        for (const puppy of [false, true]) {
          const md = dog(b, { puppy });
          for (const pose of ['stand', 'sit', 'lie']) {
            md.staticPose(pose);
            // (le museau raccourci et le crâne étroit déplacent un peu l'œil : 12 % au plus)
            expect(eyeDist(md) / d0, `${b}${puppy ? ' (chiot)' : ''} ${pose}`).toBeLessThan(1.12);
            expect(eyeDist(md) / d0, `${b}${puppy ? ' (chiot)' : ''} ${pose}`).toBeGreaterThan(0.85);
          }
          md.dispose();
        }
      }
      r.dispose();
    }
  });

  it('oreilles dressées des petits chiens : le lambeau replié du jack est caché sous la peau du crâne (pas d\'oreilles en double)', () => {
    const base = realDogBase(G.jack, 'jack');
    expect(base.earFlap?.length).toBe(2);
    for (const b of ['chihuahua', 'bouledogue', 'corgi', 'spitz_nain', 'yorkshire']) {
      for (const puppy of [false, true]) {
        const B = dogBuild(lookOf(b), puppy);
        const D = deformDog(base, B);
        // (centre de la tête : entre l'os de la tête et les yeux, comme dogReal.js)
        const eyes = D.heads[base.index.get('eyeL')].clone().add(D.heads[base.index.get('eyeR')]).multiplyScalar(0.5);
        const hc = D.heads[base.index.get('head')].clone().lerp(eyes, 0.5);
        for (const F of base.earFlap) {
          // (le lambeau entier, pas seulement ce que le squelette automatique a pesé sur l'oreille)
          expect(F.ids.length).toBeGreaterThan(400);
          const flap = new Set(F.ids);
          const skull = [];
          for (let i = 0; i < base.prims.coat.count; i++) {
            if (flap.has(i) || base.W.head[i] < 0.5) continue;
            const v = new THREE.Vector3().fromArray(D.pos, i * 3).sub(hc);
            skull.push([v.clone().normalize(), v.length()]);
          }
          let out = 0;
          for (let k = 0; k < F.ids.length; k++) {
            if (F.c[k] < 0.95) continue;
            const v = new THREE.Vector3().fromArray(D.pos, F.ids[k] * 3).sub(hc);
            const r = v.length();
            v.normalize();
            let rmax = 0;
            for (const [d, rs] of skull) if (d.dot(v) > 0.9) rmax = Math.max(rmax, rs);
            if (r > rmax + 0.003) out++;
          }
          // (lambeau non caché : 551 sommets sur 742 dépassent ; caché : 20 à 45, aux limites de la mesure)
          expect(out, `${b}${puppy ? ' (chiot)' : ''}`).toBeLessThan(F.ids.length * 0.1);
        }
      }
    }
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
          // (le chien avance comme dans le jeu : les pieds en appui sont tenus sur place dans le monde)
          md.root.position.z += v / 60;
          md.root.updateMatrixWorld(true);
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

  it.each(['labrador', 'corgi', 'galgo', 'carlin', 'chihuahua', 'terre_neuve', 'saint_bernard', 'berger_allemand'])('%s : assis, couché, endormi : posé sur le sol (ni en l\'air, ni enfoncé), queue comprise', (b) => {
    const md = dog(b);
    for (const p of ['sit', 'lie', 'sleep']) {
      md.staticPose(p);
      const lo = lowest(md, { noTail: true, step: 2 });
      // (le poil s'écrase : 1,5 cm au plus ; la croupe du terre-neuve assis entrait de 4 cm, sa queue de 8 cm)
      expect(lo, `${b} ${p}`).toBeGreaterThan(-0.015);
      expect(lo, `${b} ${p}`).toBeLessThan(0.012);
      expect(lowest(md, { step: 1 }), `${b} ${p} (queue)`).toBeGreaterThan(-0.015);
    }
    md.dispose();
  }, 120000);

  it.each(['teckel', 'corgi', 'basset_like_puppy'])('%s : la tête reste au-dessus du sol en reniflant, mangeant, buvant', (b) => {
    const breed = b === 'basset_like_puppy' ? 'teckel' : b;
    const md = dog(breed, { puppy: b === 'basset_like_puppy' });
    for (const action of ['sniff', 'eat', 'drink']) {
      md.staticPose('stand');
      let lo = Infinity;
      for (let f = 0; f < 90; f++) {
        md.anim.update(1 / 30, { v: 0, moving: false, posture: 'stand', action, happy: 0.25 });
        if (f > 45 && f % 5 === 0) lo = Math.min(lo, lowest(md, { step: 2 }));
      }
      // (le teckel enfonçait la tête de 10 cm en reniflant)
      expect(lo, `${b} ${action}`).toBeGreaterThan(-0.01);
    }
    md.dispose();
  }, 120000);
});

describe('pieds en appui', () => {
  // Glissement des doigts posés (vitesse horizontale rapportée à celle du chien) : le teckel et le corgi patinaient
  // de 30 à 50 %, les lévriers de 20 à 40 %.
  const slip = (md, v) => {
    const feet = ['toesL', 'toesR', 'htoesL', 'htoesR'].map((n) => md.bone(n));
    const dt = 1 / 120;
    const rows = [];
    for (let i = 0; i < 120 * 3; i++) {
      md.anim.update(dt, { v, moving: true, happy: 0.25 });
      md.root.position.z += v * dt;
      md.root.updateMatrixWorld(true);
      if (i >= 120) rows.push(feet.map((b) => b.getWorldPosition(new THREE.Vector3())));
    }
    let worst = 0;
    for (let f = 0; f < 4; f++) {
      const ys = rows.map((r) => r[f].y);
      const thr = Math.min(...ys) + 0.004;
      let d = 0;
      let n = 0;
      for (let i = 1; i < rows.length; i++) {
        if (ys[i] < thr && ys[i - 1] < thr) {
          d += Math.abs(rows[i][f].z - rows[i - 1][f].z);
          n++;
        }
      }
      if (n) worst = Math.max(worst, d / (n * dt) / v);
    }
    return worst;
  };
  it.each(['teckel', 'corgi', 'galgo', 'bouledogue', 'labrador'])('%s : les pieds posés ne patinent pas au pas ni au trot', (b) => {
    const md = dog(b);
    md.staticPose('stand');
    // (au pas, il reste un peu de glissement aux antérieurs des races aux pattes courtes : 15 à 25 %, contre 30 à 50 %)
    expect(slip(md, 1.0), `${b} pas`).toBeLessThan(0.25);
    expect(slip(md, 2.4), `${b} trot`).toBeLessThan(0.12);
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

describe('anciennes sauvegardes', () => {
  it('sans look.breed : la race de l\'animal passe avant la race devinée par la robe (labradoodle noir ≠ jack)', () => {
    for (const [breed, colorIndex] of [['labradoodle', 3], ['spitz_nain', 0], ['carlin', 0], ['whippet', 0]]) {
      const look = lookOf(breed, { colorIndex });
      delete look.breed;
      const lk = dogLookWithBreed(look, breed);
      expect(lk.breed, breed).toBe(breed);
      expect(dogModelOf(lk), breed).toBe(dogModelOf(lookOf(breed, { colorIndex })));
      // (sans race connue, la robe sert encore à deviner une race)
      expect(dogLookWithBreed(look).breed, breed).toBeTruthy();
      // (une apparence qui a sa race la garde)
      expect(dogLookWithBreed({ ...look, breed: 'teckel' }, breed).breed).toBe('teckel');
    }
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
      // bande plate, pas une bouée : épaisseur radiale (sur le dessus de l'anneau) bien plus petite que sa largeur
      const pos = torus.geometry.attributes.position;
      let top = -Infinity;
      let topIn = Infinity;
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getX(i)) > 0.08 * size.x) continue;
        if (pos.getY(i) > 0) {
          top = Math.max(top, pos.getY(i));
          topIn = Math.min(topIn, pos.getY(i));
        }
      }
      expect(top - topIn, b).toBeLessThan(0.012);
      expect(top - topIn, b).toBeLessThan(size.z * 0.5);
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

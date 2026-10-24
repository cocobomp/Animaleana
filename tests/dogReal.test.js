// Chiens réalistes (shiba et jack russell, GLB chargés dans node sans textures) : fichiers, races, chiots, pieds au
// sol dans toutes les poses et allures, robes, poses des tours, équipement, crédits CC-BY. Tout est déterministe
// (graines fixes, pas de temps fixe).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildRealDogModel, pickDogGait, realDogPose, REAL_DOG_KEYS, realDogBase, deformDog, pickGabarit, dogClips } from '../src/game/models/dogReal.js';
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
  // (mèches de la robe soyeuse : le shader les fait pendre et les pose sur le sol, voir dogCoat.js — pas la peau)
  const hang = m.geometry.attributes.cmpPom;
  let lo = Infinity;
  for (let i = 0; i < m.geometry.attributes.position.count; i += step) {
    if (hang && hang.getX(i) < 0) continue;
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
  // (jack : 0,51 → 0,59 Mo avec les clips de ses gabarits court et trapu, 0,60 Mo avec la révérence du court, 0,61 Mo
  // avec la mâchoire et la langue modelée — 36 → 41 os ; shiba : 0,86 → 0,88 Mo)
  it.each([['shiba', 57, 900_000], ['jack', 41, 670_000]])('%s : os, clips, compression, vitesses naturelles, poids', (kind, joints, maxBytes) => {
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
  }, 60000); // (une vingtaine de modèles : plus de 5 s quand toute la suite tourne)

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
          // (le lambeau entier, pas seulement ce que le squelette automatique a pesé sur l'oreille ; e : part du
          // lambeau lui-même — la zone autour de la racine, ramenée sur le crâne interpolé, n'en est pas)
          const ear = F.e ?? F.c;
          expect(ear.filter((x) => x > 0.5).length).toBeGreaterThan(400);
          const flap = new Set([...F.ids].filter((_, k) => ear[k] > 0.5));
          const skull = [];
          for (let i = 0; i < base.prims.coat.count; i++) {
            if (flap.has(i) || base.W.head[i] < 0.5) continue;
            const v = new THREE.Vector3().fromArray(D.pos, i * 3).sub(hc);
            skull.push([v.clone().normalize(), v.length()]);
          }
          let out = 0;
          for (let k = 0; k < F.ids.length; k++) {
            if (ear[k] < 0.95) continue;
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
  }, 60000); // (10 modèles déformés : plus de 5 s quand toute la suite tourne)

  it('oreilles tombantes modelées : l\'oreille droite du shiba est effacée du crâne, une vraie oreille pend le long de la joue', () => {
    const base = realDogBase(G.shiba, 'shiba');
    const n = base.prims.coat.count;
    for (const b of ['labrador', 'golden', 'coonhound', 'setter', 'caniche', 'saint_bernard', 'terre_neuve']) {
      const md = dog(b);
      const P = md.coatMesh.geometry.attributes.position;
      expect(P.count, b).toBeGreaterThan(n);
      const eyeY = md.bone('eyeL').getWorldPosition(new THREE.Vector3()).y;
      const skullY = md.skull.clone().applyMatrix4(md.head.matrixWorld).y;
      // l'oreille modelée descend sous l'œil (jusqu'à la commissure ou plus bas : chiens courants)
      let low = Infinity;
      for (let i = n; i < P.count; i++) low = Math.min(low, md.coatMesh.getVertexPosition(i, _v).applyMatrix4(md.coatMesh.matrixWorld).y);
      expect(low, b).toBeLessThan(eyeY - 0.03 * md.build.head);
      // l'oreille droite d'origine ne dépasse plus du crâne (plus de cornes)
      let earTop = -Infinity;
      for (let i = 0; i < n; i++) {
        if (base.W.ear[i * 2] + base.W.ear[i * 2 + 1] < 0.5) continue;
        earTop = Math.max(earTop, md.coatMesh.getVertexPosition(i, _v).applyMatrix4(md.coatMesh.matrixWorld).y);
      }
      expect(earTop, b).toBeLessThan(skullY + 0.004);
      md.dispose();
    }
  });

  it('caniche : coupe « caniche » par défaut (pompons modelés montrés), cachés par une autre coupe du salon', () => {
    const md = dog('caniche');
    expect(md.coatMesh.geometry.attributes.cmpPom).toBeTruthy();
    expect(md.uniforms.cPom.value).toBe(1);
    md.setCut('court');
    expect(md.uniforms.cPom.value).toBe(0);
    md.setCut(null);
    expect(md.uniforms.cPom.value).toBe(1);
    md.dispose();
    // (les autres races n'ont pas de pompons modelés : la coupe « caniche » reste celle du shader)
    const doodle = dog('labradoodle');
    expect(doodle.coatMesh.geometry.attributes.cmpPom).toBeUndefined();
    doodle.setCut('caniche');
    expect(doodle.uniforms.cCut.value.z).toBeGreaterThan(0.01);
    doodle.dispose();
  });

  it('écourtée : la queue des races « stub » est courte', () => {
    for (const b of ['bouledogue', 'boxer', 'corgi', 'cocker']) expect(dogBuild(lookOf(b)).tailLen, b).toBeLessThan(0.5);
  });
});

describe('pieds au sol', () => {
  it('debout : les 40 races et leurs chiots posent les pieds sur le sol, sans s\'y enfoncer', () => {
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
    // (le poil s'écrase : 1,5 cm au plus, 80 % de sa longueur pour un poil long — terre-neuve : 2 cm)
    const crush = Math.max(0.015, 0.8 * dogBuild(lookOf(b)).fur);
    for (const p of ['sit', 'lie', 'sleep']) {
      md.staticPose(p);
      const lo = lowest(md, { noTail: true, step: 2 });
      // (la croupe du terre-neuve assis entrait de 4 cm, sa queue de 8 cm)
      expect(lo, `${b} ${p}`).toBeGreaterThan(-crush);
      expect(lo, `${b} ${p}`).toBeLessThan(0.012);
      expect(lowest(md, { step: 1 }), `${b} ${p} (queue)`).toBeGreaterThan(-crush);
    }
    md.dispose();
  }, 120000);

  it.each(['teckel', 'corgi', 'jack_russell', 'cavalier', 'carlin', 'chihuahua', 'bouledogue', 'yorkshire', 'terre_neuve'])('%s : assis, les pieds avant posés (le dos long ou les pattes courtes basculent le corps)', (b) => {
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    for (const puppy of [false, true]) {
      const md = dog(b, { puppy });
      md.staticPose('sit');
      md.root.updateMatrixWorld(true);
      m.copy(md.root.matrixWorld).invert();
      const soles = md.legs.map((leg, l) => Math.min(...md.anim.solePts[l].map((p) => v.copy(p).applyMatrix4(leg.paw.matrixWorld).applyMatrix4(m).y)));
      const name = `${b}${puppy ? ' (chiot)' : ''}`;
      // (avant : 30 cm en l'air pour le teckel, 22 pour le corgi, 4 à 6 pour le jack, le cavalier ou le carlin)
      expect(Math.min(soles[0], soles[1]), name).toBeLessThan(0.01);
      expect(Math.min(soles[0], soles[1]), name).toBeGreaterThan(-0.01);
      expect(Math.min(soles[2], soles[3]), name).toBeLessThan(0.045);
      // (le poil s'écrase : 2 cm, 80 % de sa longueur pour un poil long — yorkshire)
      expect(lowest(md, { noTail: true, step: 2 }), name).toBeGreaterThan(-Math.max(0.02, 0.8 * md.build.fur));
      md.dispose();
    }
  }, 120000);

  it.each(['teckel', 'corgi', 'terre_neuve', 'labrador', 'jack_russell'])('%s : en reniflant, mangeant, buvant, les pieds arrière restent posés (le corps se redresse)', (b) => {
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const md = dog(b);
    for (const action of ['sniff', 'eat', 'drink']) {
      md.staticPose('stand');
      for (let f = 0; f < 90; f++) md.anim.update(1 / 30, { v: 0, moving: false, posture: 'stand', action, happy: 0.25 });
      md.root.updateMatrixWorld(true);
      m.copy(md.root.matrixWorld).invert();
      const soles = md.legs.map((leg, l) => Math.min(...md.anim.solePts[l].map((p) => v.copy(p).applyMatrix4(leg.paw.matrixWorld).applyMatrix4(m).y)));
      // (avant : 9 cm en l'air pour le teckel qui renifle, 6 pour le corgi, 3 pour le terre-neuve)
      expect(Math.min(soles[2], soles[3]), `${b} ${action}`).toBeLessThan(0.01);
      expect(Math.min(soles[0], soles[1]), `${b} ${action}`).toBeLessThan(0.045);
      expect(lowest(md, { noTail: true, step: 2 }), `${b} ${action}`).toBeGreaterThan(-0.02);
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
  // Saut d'un pied posé d'une image à l'autre (60 i/s) : quand l'appui était pris ou lâché, la correction du membre
  // changeait d'un coup et le pied encore au sol sautait de 2 à 5 cm au trot (berger allemand, golden, labrador).
  it.each(['berger_allemand', 'golden', 'labrador', 'caniche', 'beagle', 'jack_russell', 'corgi', 'teckel'])('%s : un pied posé ne bouge pas de plus de 5 mm d\'une image à l\'autre (pas, trot, galop)', (b) => {
    for (const v0 of [1.2, 2.8, 6]) {
      const md = dog(b);
      md.staticPose('stand');
      const v = v0 * md.anim.speedScale;
      let prev = null;
      let worst = 0;
      for (let i = 0; i < 300; i++) {
        md.anim.update(1 / 60, { v, moving: true, happy: 0.25 });
        md.root.position.z += v / 60;
        md.root.updateMatrixWorld(true);
        const feet = md.legs.map((leg, l) => {
          let lo = Infinity;
          const c = new THREE.Vector3();
          for (const p of md.anim.solePts[l]) {
            const q = p.clone().applyMatrix4(leg.paw.matrixWorld);
            c.add(q);
            lo = Math.min(lo, q.y);
          }
          return { c: c.multiplyScalar(1 / md.anim.solePts[l].length), lo };
        });
        if (prev && i > 60) {
          for (let l = 0; l < 4; l++) {
            if (prev[l].lo < 0.008 && feet[l].lo < 0.008) worst = Math.max(worst, Math.hypot(feet[l].c.x - prev[l].c.x, feet[l].c.z - prev[l].c.z));
          }
        }
        prev = feet;
      }
      expect(worst, `${b} ${v0}`).toBeLessThan(0.005);
      md.dispose();
    }
  }, 120000);

  it.each(['teckel', 'corgi', 'galgo', 'bouledogue', 'labrador', 'beagle', 'jack_russell'])('%s : les pieds posés ne patinent pas au pas, au trot ni au galop', (b) => {
    // (pieds tenus en long et sur le côté, aussi au galop : 0 à 3 % au pas, 8 % au plus au trot ; le galgo patinait de
    // 32 % au galop, le beagle de 6 à 10 % au trot sur le gabarit des chiots)
    for (const [v, max, nom] of [[1.0, 0.05, 'pas'], [2.4, 0.1, 'trot'], [5.0, 0.06, 'galop']]) {
      const md = dog(b);
      md.staticPose('stand');
      expect(slip(md, v), `${b} ${nom}`).toBeLessThan(max);
      md.dispose();
    }
  }, 120000);
});

describe('poses et allures par gabarit', () => {
  const st = (o = {}) => ({ v: 0, moving: false, posture: 'stand', action: null, sleeping: false, happy: 0.25, sad: false, pull: 0, ...o });
  const W = (md, b) => md.bone(b).getWorldPosition(new THREE.Vector3());

  it('chaque race prend le gabarit le plus proche de ses membres (pattes courtes, longues) et ses clips', () => {
    const want = { teckel: 'court', corgi: 'court', carlin: 'trapu', bouledogue: 'trapu', galgo: 'long', whippet: 'long', caniche: 'long', labrador: null, jack_russell: null, husky: null, beagle: null };
    for (const [b, g] of Object.entries(want)) {
      const md = dog(b);
      expect(md.anim.gabarit, b).toBe(g);
      // (le clip « walk » du teckel est celui de son gabarit)
      expect(md.anim.actions.walk.getClip().name, b).toBe(g ? `walk_${g}` : 'walk');
      md.dispose();
    }
    expect(pickGabarit({ court: { legs: 0.52 }, trapu: { legs: 0.74 } }, 1)).toBe(null);
    expect(pickGabarit({ court: { legs: 0.52 }, trapu: { legs: 0.74 } }, 0.66)).toBe('trapu');
    expect(pickGabarit({ court: { legs: 0.52 }, trapu: { legs: 0.74 } }, 0.55)).toBe('court');
    expect(pickGabarit({ long: { legs: 1.25 } }, 1.15)).toBe('long');
    // (le gabarit court des chiots du shiba a leurs gros pieds : pas pour le beagle, oui pour un chiot labrador)
    const shibaGab = { long: { legs: 1.25, paws: 1 }, court: { legs: 0.82, paws: 1.2 } };
    expect(pickGabarit(shibaGab, 0.88, 1)).toBe(null);
    expect(pickGabarit(shibaGab, 0.97 * 0.83, 1.2)).toBe('court');
    expect(pickGabarit(shibaGab, 1.28 * 0.83, 1.2)).toBe(null);
    const chiot = dog('labrador', { puppy: true });
    expect(chiot.anim.gabarit).toBe('court');
    chiot.dispose();
    expect(dogClips({ clips: { walk: 'a', walk_long: 'b', sit_down: 'c', sit_down_long: 'd' }, gabarits: { long: {} } }, 'long')).toEqual({ walk: 'b', sit_down: 'd' });
    // (variante d'un gabarit — of, back — : jamais choisie seule ; ses clips fondus avec ceux du gabarit selon la longueur
    // du dos — de la variante au dos court au gabarit au dos long)
    const gv = { court: { legs: 0.52, back: 1.25 }, nain: { legs: 0.52, of: 'court', back: 0.8 }, trapu: { legs: 0.74 } };
    expect(pickGabarit(gv, 0.52)).toBe('court');
    const clip = (v) => new THREE.AnimationClip('c', 1, [new THREE.NumberKeyframeTrack('b.morphTargetInfluences[0]', [0, 1], [v, v])]);
    const base = { clips: { sit: clip(0), sit_court: clip(1), sit_nain: clip(3), walk_court: clip(5) }, gabarits: gv };
    const val = (c) => c.tracks[0].values[0];
    expect(val(dogClips(base, 'court', 1.45).sit)).toBe(1);
    expect(val(dogClips(base, 'court', 0.72).sit)).toBe(3);
    expect(val(dogClips(base, 'court', 1.025).sit)).toBeCloseTo(2, 5);
    expect(val(dogClips(base, 'court', 1.025).walk)).toBe(5);
    expect(dogClips(base, 'court', 1.025).sit).toBe(dogClips(base, 'court', 1.03).sit);
    // (teckel et corgi, dos de 1,45 et 1,25 : l'assis du gabarit seul)
    for (const b of ['teckel', 'corgi']) {
      const md = dog(b);
      expect(md.anim.actions.sit.getClip().name, b).toBe('sit_court');
      md.dispose();
    }
  });

  it('yeux dans les orbites après s\'asseoir, se coucher, sauter (40 races et leurs chiots)', async () => {
    // (le mixeur rendait aux os à translation animée leur position notée sur le squelette de la race : le décalage
    // comptait deux fois dès qu'une transition avait animé les yeux — globes 4 cm devant le visage du saint-bernard)
    for (const b of BREEDS) {
      for (const puppy of [false, true]) {
        const md = dog(b, { puppy });
        const ed = () => {
          md.root.updateMatrixWorld(true);
          return W(md, 'eyeL').distanceTo(W(md, 'head'));
        };
        md.anim.update(1 / 30, st());
        const d0 = ed();
        const name = `${b}${puppy ? ' (chiot)' : ''}`;
        for (let f = 0; f < 45; f++) md.anim.update(1 / 30, st({ posture: 'sit' }));
        expect(Math.abs(ed() - d0), `${name} assis`).toBeLessThan(0.004);
        for (let f = 0; f < 60; f++) md.anim.update(1 / 30, st({ posture: 'lie' }));
        expect(Math.abs(ed() - d0), `${name} couché`).toBeLessThan(0.004);
        for (let f = 0; f < 45; f++) md.anim.update(1 / 30, st());
        for (let f = 0; f <= 30; f++) {
          realDogPose(md, 'jump', 1, null, f / 30);
          md.anim.update(1 / 30, st());
        }
        for (let f = 0; f < 30; f++) md.anim.update(1 / 30, st());
        expect(Math.abs(ed() - d0), `${name} après le saut`).toBeLessThan(0.004);
        md.dispose();
        // (rend la main entre deux chiens : d'un bloc, le test retenait le fil plus d'une minute sur une machine
        // chargée et vitest perdait son échange avec le processus de test)
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  }, 300000);

  it.each(['teckel', 'corgi', 'galgo', 'jack_russell', 'labrador'])('%s : debout → assis → couché → debout sans à-coup (la tête bouge de moins de 3 cm par image)', (b) => {
    const md = dog(b);
    let prev = null;
    let worst = 0;
    const seq = [[30, 'stand'], [90, 'sit'], [120, 'lie'], [90, 'stand']];
    for (const [n, posture] of seq) {
      for (let f = 0; f < n; f++) {
        md.anim.update(1 / 60, st({ posture }));
        md.root.updateMatrixWorld(true);
        const h = W(md, 'head');
        if (prev) worst = Math.max(worst, h.distanceTo(prev));
        prev = h;
      }
    }
    // (le teckel se cabrait de 18 cm en une image au début de « se coucher », le galgo de 19 cm ; chien de taille 1)
    expect(worst, b).toBeLessThan(0.03);
    md.dispose();
  }, 120000);

  it.each(['jack_russell', 'chihuahua', 'carlin', 'bouledogue', 'cavalier'])('%s : couché, la croupe reste sous le garrot (pas de révérence) et le bassin est posé', (b) => {
    const md = dog(b);
    md.staticPose('lie');
    md.root.updateMatrixWorld(true);
    const hips = W(md, 'femurL').add(W(md, 'femurR')).multiplyScalar(0.5);
    const withers = W(md, 'scapL').add(W(md, 'scapR')).multiplyScalar(0.5);
    expect(hips.y, b).toBeLessThan(withers.y);
    // (hanches à moins de 0,4 fois leur hauteur debout : avant, postérieurs à demi dépliés, croupe en l'air)
    md.staticPose('stand');
    md.root.updateMatrixWorld(true);
    const standHip = (W(md, 'femurL').y + W(md, 'femurR').y) / 2;
    expect(hips.y / standHip, b).toBeLessThan(0.45);
    md.dispose();
  }, 60000);

  it.each(['jack_russell', 'chihuahua', 'teckel', 'corgi', 'galgo'])('%s : assis, la croupe posée entre les jarrets (hanches basses), les pieds arrière à plat', (b) => {
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const md = dog(b);
    md.staticPose('stand');
    md.root.updateMatrixWorld(true);
    const standHip = (W(md, 'femurL').y + W(md, 'femurR').y) / 2;
    md.staticPose('sit');
    md.root.updateMatrixWorld(true);
    m.copy(md.root.matrixWorld).invert();
    const hip = (W(md, 'femurL').y + W(md, 'femurR').y) / 2;
    // (avant : cuisse qui pendait, hanches à mi-hauteur au-dessus de postérieurs étalés)
    expect(hip / standHip, b).toBeLessThan(0.45);
    const soles = md.legs.map((leg, l) => Math.min(...md.anim.solePts[l].map((p) => v.copy(p).applyMatrix4(leg.paw.matrixWorld).applyMatrix4(m).y)));
    expect(Math.max(soles[2], soles[3]), b).toBeLessThan(0.03);
    md.dispose();
  }, 60000);

  it.each(['labrador', 'galgo', 'husky', 'beagle', 'jack_russell', 'teckel'])('%s : en reniflant, mangeant, buvant, le carpe ne se plie pas vers l\'avant (antérieurs tendus)', (b) => {
    const md = dog(b);
    for (const action of ['sniff', 'eat', 'drink']) {
      md.staticPose('stand');
      for (let f = 0; f < 60; f++) md.anim.update(1 / 30, st({ action }));
      md.root.updateMatrixWorld(true);
      for (const s of ['L', 'R']) {
        // métacarpe presque vertical, le pied devant le carpe ou à son aplomb (plié à l'envers, le pied passait en
        // arrière sous le corps, pattes croisées), le carpe au-dessus du pied ; le coude derrière le carpe
        const elbow = W(md, 'radius' + s);
        const wrist = W(md, 'metacarpus' + s);
        const toe = W(md, 'toes' + s);
        expect(toe.z - wrist.z, `${b} ${action} ${s} pied derrière le carpe`).toBeGreaterThan(-0.015);
        expect(wrist.y - toe.y, `${b} ${action} ${s} carpe au-dessus du pied`).toBeGreaterThan(0.02);
        expect(elbow.z - wrist.z, `${b} ${action} ${s} coude devant le carpe`).toBeLessThan(0.02);
      }
    }
    md.dispose();
  }, 60000);
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

  it.each(['labrador', 'teckel', 'berger_allemand', 'terre_neuve', 'jack_russell'])('%s : roulade du spectacle, la tête, les oreilles et la queue restent au-dessus du sol (de la scène)', (b) => {
    const md = dog(b);
    md.staticPose('stand');
    let lo = Infinity;
    // (comme Activities.js : la pose imposée à chaque image, la roulade avance de 0 à 1)
    for (let f = 0; f <= 60; f++) {
      realDogPose(md, 'roll', f / 60);
      md.anim.update(1 / 30, { v: 0, moving: false, posture: 'stand', happy: 1 });
      if (f % 4 === 0) lo = Math.min(lo, lowest(md, { step: 2 }));
    }
    // (avant : tête et oreilles 8 cm sous la scène, queue 7,6 cm)
    expect(lo, b).toBeGreaterThan(-0.02);
    md.dispose();
  }, 120000);

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

  it('yeux de la robe : un husky gris et blanc a l\'iris bleu (le berger australien bleu merle aussi), un labrador garde le sien', () => {
    const blue = new THREE.Color(0x6fb6e8);
    for (const [b, i] of [['husky', 0], ['berger_australien', 0]]) {
      const md = dog(b, { colorIndex: i });
      const iris = md.uniforms.cIris.value;
      expect(iris.w, b).toBe(1);
      expect(iris.z, b).toBeGreaterThan(iris.x);
      expect(Math.abs(iris.x - blue.r) + Math.abs(iris.y - blue.g) + Math.abs(iris.z - blue.b), b).toBeLessThan(1e-3);
      md.dispose();
    }
    // (les autres : iris brun chaud, éclairci depuis le brun très foncé par défaut des robes)
    const lab = dog('labrador');
    const li = lab.uniforms.cIris.value;
    expect(li.x).toBeGreaterThan(li.z * 2);
    expect(0.2126 * li.x + 0.7152 * li.y + 0.0722 * li.z).toBeGreaterThan(0.03);
    lab.dispose();
  });

  it('robes noires : relevées en brun-noir lustré (visage lisible), pas un noir absolu mat', () => {
    for (const [b, i] of [['terre_neuve', 0], ['labrador', 2], ['caniche', 1]]) {
      const P = coatPlan(resolveLook('dog', b, i), b);
      const c = new THREE.Color(P.base);
      const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      expect(l, b).toBeGreaterThan(0.012);
      expect(c.r, b).toBeGreaterThan(c.b); // (brun chaud, pas gris bleuté)
      expect(P.sheen, b).toBe(1);
      const md = dog(b, { colorIndex: i });
      expect(md.coatMesh.material.roughness, b).toBeLessThan(0.55);
      md.dispose();
    }
  });
});

describe('gueule au calme', () => {
  it('shiba et ses races : la mâchoire refermée au même angle, que le clip l\'ouvre (debout, assis) ou non (couché)', () => {
    for (const b of ['saint_bernard', 'boxer', 'terre_neuve', 'labrador', 'shiba']) {
      for (const puppy of [false, true]) {
        const md = dog(b, { puppy });
        const jaw = md.bone('jaw');
        expect(jaw, b).toBeTruthy();
        for (const pose of ['stand', 'sit', 'lie']) {
          md.staticPose(pose);
          const q = jaw.userData.restQ.clone().invert().multiply(jaw.quaternion);
          const a = 2 * Math.atan2(q.x, q.w);
          // (gueule fermée : environ -0,12 rad depuis la pose de repos, entrouverte, du GLB)
          expect(a, `${b}${puppy ? ' chiot' : ''} ${pose}`).toBeLessThan(-0.1);
          expect(a, `${b}${puppy ? ' chiot' : ''} ${pose}`).toBeGreaterThan(-0.14);
        }
        md.dispose();
      }
    }
  });
});

describe('queues fines', () => {
  /** Section de la queue autour de chaque os : rapport petit axe / grand axe (1 = ronde) et rayon moyen. */
  const sections = (base, P, H) => {
    const tb = base.tailBones;
    const coat = base.prims.coat;
    const C = tb.map((i) => H[i].clone());
    const last = tb[tb.length - 1];
    C.push(base.tailTip.clone().add(H[last]).sub(base.heads[last]));
    return tb.map((bi, k) => {
      const e = C[k + 1].clone().sub(C[k]);
      const len = e.length();
      e.normalize();
      const u = new THREE.Vector3(0, 1, 0).cross(e).normalize();
      const v = e.clone().cross(u);
      let a = 0, b = 0, c = 0, cnt = 0;
      for (let i = 0; i < coat.count; i++) {
        let w = 0;
        for (let q = 0; q < 4; q++) if (coat.si[i * 4 + q] === bi) w += coat.sw[i * 4 + q];
        if (w < 0.6) continue;
        const x = new THREE.Vector3().fromArray(P, i * 3).sub(C[k]);
        const t = Math.min(1, Math.max(0, x.dot(e) / len));
        x.addScaledVector(e, -t * len);
        a += x.dot(u) ** 2;
        b += x.dot(u) * x.dot(v);
        c += x.dot(v) ** 2;
        cnt++;
      }
      a /= cnt; b /= cnt; c /= cnt;
      const r = Math.sqrt(((a - c) / 2) ** 2 + b * b);
      return { ratio: Math.sqrt(((a + c) / 2 - r) / ((a + c) / 2 + r)), r: Math.sqrt((a + c) / 2 + r) };
    });
  };
  it('amincie (dalmatien, dogue argentin, beagle, rottweiler, galgo), la queue reste un cylindre, pas une lame plate', () => {
    const base = realDogBase(G.shiba, 'shiba');
    for (const b of ['dalmatien', 'dogo', 'beagle', 'rottweiler', 'galgo', 'coonhound']) {
      const B = dogBuild(lookOf(b), false);
      expect(B.tailThick, b).toBeLessThan(0.6);
      const D = deformDog(base, B);
      const s = sections(base, D.pos, D.heads);
      // (le premier os, soudé à la croupe, garde sa forme)
      for (let k = 1; k < s.length; k++) {
        expect(s[k].ratio, `${b} os ${k}`).toBeGreaterThan(0.6);
        // (effilée : le dernier os, à la pointe, peut être plus fin)
        expect(s[k].r, `${b} os ${k}`).toBeGreaterThan(k === s.length - 1 ? 0.0035 : 0.005);
        expect(s[k].r, `${b} os ${k}`).toBeLessThan(0.03);
      }
    }
  });
  it('panache et queue de loutre effilés : le rayon décroît jusqu\'à la pointe (pas une massue)', () => {
    const base = realDogBase(G.shiba, 'shiba');
    for (const b of ['golden', 'setter', 'labrador', 'bouvier_bernois', 'saint_bernard', 'terre_neuve']) {
      const B = dogBuild(lookOf(b), false);
      expect(B.tailTaper, b).toBeGreaterThan(0.3);
      const D = deformDog(base, B);
      const s = sections(base, D.pos, D.heads);
      expect(s[s.length - 1].r, b).toBeLessThan(s[1].r * 0.8);
    }
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

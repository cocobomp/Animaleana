// Mouton réaliste (Microsoft Rocketbox, GLB chargé dans node sans textures) : fichier, races, agneaux, toison qui suit
// la tonte, sabots au sol dans toutes les poses et allures, couché posé sur le ventre, os jamais étirés, sabots en appui
// tenus, transitions, accessoires, crédits MIT, repli procédural. Tout est déterministe (graines fixes, pas de temps
// fixe, aucun tirage au hasard).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildRealSheepModel, realSheepBase, pickSheepGait, REAL_SHEEP_KEY, sheepJoints, realSheepPose } from '../src/game/models/sheepReal.js';
import { buildAnimalModel } from '../src/game/models/animalModel.js';
import { buildAccessories, removeAccessories } from '../src/game/models/salon.js';
import { SHEEP_BUILDS, sheepBuild, sheepFleece, shornWeight, sheepLookOf, sheepBreedOfLook } from '../src/sim/sheepLook.js';
import { SPECIES } from '../src/sim/species.js';
import { resolveLook, createAnimal } from '../src/sim/animal.js';
import { collectProduct, tickProduce } from '../src/sim/farm.js';
import { MODELS } from '../src/game/assets.js';
import { MODEL_CREDITS } from '../src/ui/credits.js';
import { portraitSpec } from '../src/game/thumbScenes.js';
import { loadRealSheepGltf, SHEEP_FILE, glbJson } from './fixtures/realSheepGltf.js';

const BREEDS = SPECIES.sheep.breeds.map((b) => b.id);
const fixed = () => 0.42; // (tirages fixes : rien au hasard)
let G;
beforeAll(async () => {
  G = await loadRealSheepGltf();
}, 120000);

const lookOf = (breed, o = {}) => ({ ...resolveLook('sheep', breed, o.color ?? 0), seed: 4242, sex: o.sex ?? 'f', ...(o.lamb ? { lamb: true } : {}), ...(o.young ? { young: true } : {}), ...(o.fleece !== undefined ? { fleece: o.fleece } : {}) });
const sheep = (breed, o = {}) => buildRealSheepModel(lookOf(breed, o), breed, G);

const _v = new THREE.Vector3();
/** Point le plus bas de la peau (repère du modèle, toison comprise), un sommet sur step. */
function lowest(md, step = 2) {
  md.root.updateMatrixWorld(true);
  const m = md.mesh;
  let lo = Infinity;
  for (let i = 0; i < m.geometry.attributes.position.count; i += step) {
    m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
    lo = Math.min(lo, _v.y);
  }
  return lo;
}
const st = (o = {}) => ({ v: 0, moving: false, size: 1, posture: 'stand', action: null, ...o });

describe('fichier du mouton réaliste', () => {
  it('sheep.glb : os, clips, toison, masques, compression, version réduite, poids', () => {
    const buf = fs.readFileSync(SHEEP_FILE);
    expect(buf.length).toBeLessThan(600_000);
    const json = glbJson(buf);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']));
    expect(json.skins[0].joints.length).toBe(31);
    const names = new Set(json.nodes.map((n) => n.name));
    for (const b of ['root', 'pelvis', 'chest', 'neck1', 'neck2', 'head', 'jaw', 'earL', 'earR', 'tail1', 'scapL', 'humerusL', 'radiusL', 'metacarpusL', 'toesL', 'femurR', 'tibiaR', 'metatarsusR', 'htoesR', 'horns', 'sheep_lod']) expect(names, b).toContain(b);
    const clips = json.animations.map((a) => a.name);
    for (const c of ['idle', 'walk', 'trot', 'run', 'graze', 'eat', 'bleat', 'lie_down', 'lie', 'ruminate', 'sleep', 'get_up', 'lamb_play', 'jump']) expect(clips, c).toContain(c);
    // (aucune échelle animée ; aucune translation d'os sauf la racine : un os qui se déplace s'étire — l'avant-bras du
    // saut s'allongeait de 28 %)
    for (const a of json.animations) {
      for (const ch of a.channels) {
        expect(ch.target.path).not.toBe('scale');
        if (ch.target.path === 'translation') expect(json.nodes[ch.target.node].name, a.name).toBe('root');
      }
    }
    const sheepMesh = json.meshes.find((m) => m.name === 'sheep');
    expect(sheepMesh.extras.targetNames).toEqual(['shorn']);
    expect(Object.keys(sheepMesh.primitives[0].attributes)).toEqual(expect.arrayContaining(['_WOOL', '_HEAD', '_LEG', '_HOOF']));
    const ext = json.scenes[json.scene ?? 0].extras.sheep;
    expect(ext.naturalSpeeds.walk).toBeGreaterThan(0.6);
    expect(ext.naturalSpeeds.run).toBeGreaterThan(ext.naturalSpeeds.trot);
    // (mesures sur le maillage déformé, tools/mouton/measure.py : plus de rideau de peau du poitrail au galop — une arête
    // de 1,4 cm s'étirait 10,7 fois — ni d'os étiré ; sabots jamais sous le sol)
    for (const [clip, m] of Object.entries(ext.measures)) {
      expect(m.boneStretchPct, clip).toBeLessThan(0.5);
      expect(m.hoofLowCm, clip).toBeGreaterThan(-0.3);
      expect(m.edgeMaxBy.avant, clip).toBeLessThan(4);
      expect(m.edgeMaxBy.arriere, clip).toBeLessThan(3);
    }
  });

  it('la clé du modèle est sheep_real (jamais « sheep » : le mouton procédural reste le repli)', () => {
    expect(REAL_SHEEP_KEY).toBe('sheep_real');
    expect(MODELS.sheep_real).toBe('sheep.glb');
    expect(MODELS.sheep).toBeUndefined();
  });

  it('sans le GLB (chargement, fichier absent) : pas de mouton réaliste, buildAnimalModel prend le procédural', () => {
    // (rien n'est chargé par assets.js dans les tests : le GLB n'est donné qu'à la main)
    expect(buildRealSheepModel(lookOf('merinos'), 'merinos')).toBeNull();
    expect(typeof buildAnimalModel).toBe('function');
  });

  it('les clips du jeu n\'ont aucune translation d\'os hors de la racine', () => {
    const base = realSheepBase(G);
    for (const clip of Object.values(base.clips)) {
      for (const t of clip.tracks) {
        const [node, prop] = t.name.split('.');
        expect(prop).not.toBe('scale');
        if (prop === 'position') expect(node).toBe('root');
      }
    }
  });
});

describe('races et agneaux', () => {
  it('chaque race du jeu a son gabarit ; race des anciennes sauvegardes retrouvée', () => {
    for (const b of BREEDS) expect(SHEEP_BUILDS[b], b).toBeTruthy();
    const old = resolveLook('sheep', 'suffolk', 0);
    delete old.breed;
    expect(sheepBreedOfLook(old)).toBe('suffolk');
    // (agneau croisé : a.breed = 'mix', la race de son look d'abord)
    expect(sheepBuild({ ...resolveLook('sheep', 'cheviot', 0) }, { breed: 'mix' }).breed).toBe('cheviot');
    expect(sheepBuild({ coat: 0x123456, secondary: 0x654321 }, { breed: 'mix' }).breed).toBe('merinos');
  });

  it('races reconnaissables : tête et pattes noires du suffolk, Ouessant tout petit et noir, cornes, laine longue, toison épaisse', () => {
    const suffolk = sheepBuild(lookOf('suffolk'), { breed: 'suffolk' });
    expect(suffolk.colors.face).toBeLessThan(0x404040);
    expect(suffolk.colors.leg).toBeLessThan(0x404040);
    expect(suffolk.hornSize).toBe(0);
    const ouessant = sheepBuild(lookOf('ouessant'), { breed: 'ouessant' });
    // (garrot ≈ 0,4 m contre 0,7 m au mérinos : la plus petite race)
    expect(ouessant.size * resolveLook('sheep', 'ouessant', 0).scale).toBeLessThan(0.6);
    expect(ouessant.colors.wool).toBeLessThan(0x404040);
    const nezNoir = sheepBuild(lookOf('nez_noir', { sex: 'f' }), { breed: 'nez_noir', sex: 'f' });
    expect(nezNoir.knees).toBe(true);
    expect(nezNoir.curl).toBeGreaterThan(0.5);
    expect(nezNoir.hornSize).toBeGreaterThan(0); // (cornes en spirale, brebis comprises)
    expect(sheepBuild(lookOf('islandais_mouton'), { breed: 'islandais_mouton' }).long).toBeGreaterThan(0.1);
    const merinos = sheepBuild(lookOf('merinos'), { breed: 'merinos', sex: 'f' });
    expect(merinos.fleece).toBeGreaterThan(sheepBuild(lookOf('cheviot'), { breed: 'cheviot' }).fleece + 0.5);
    expect(merinos.hornSize).toBe(0);
    expect(sheepBuild(lookOf('merinos'), { breed: 'merinos', sex: 'm' }).hornSize).toBeGreaterThan(1);
    const cheviot = sheepBuild(lookOf('cheviot'), { breed: 'cheviot' });
    expect(cheviot.colors.face).toBeGreaterThan(0xe0e0e0);
    expect(cheviot.headWool).toBe(0);
    // (islandais moorit : tête et pattes brunes comme sa laine)
    const moorit = sheepBuild(lookOf('islandais_mouton', { color: 1 }), { breed: 'islandais_mouton' });
    expect(moorit.colors.face).toBe(moorit.colors.wool);
  });

  it('laine longue (islandais) : ne pend que du tronc, jamais d\'un membre qui se lève (poids du tronc par sommet)', () => {
    const md = sheep('islandais_mouton', { sex: 'm' });
    const base = md.anim.base;
    const P = base.prim;
    expect(md.coatMesh.geometry.attributes.sheepTrunk.count).toBe(P.count);
    const limb = /^(humerus|radius|metacarpus|toes|femur|tibia|metatarsus|htoes)/;
    let limbN = 0;
    let limbMax = 0;
    let trunkN = 0;
    let trunkMin = 1;
    for (let i = 0; i < P.count; i++) {
      const nm = base.names[P.domBone[i]];
      const w = P.sw[i * 4 + [0, 1, 2, 3].reduce((b, k) => (P.sw[i * 4 + k] > P.sw[i * 4 + b] ? k : b), 0)];
      if (w < 0.8) continue;
      if (limb.test(nm)) { limbN++; limbMax = Math.max(limbMax, P.trunk[i]); }
      if (/^(spine1|spine2|pelvis|chest)$/.test(nm)) { trunkN++; trunkMin = Math.min(trunkMin, P.trunk[i]); }
    }
    expect(limbN).toBeGreaterThan(40);
    expect(trunkN).toBeGreaterThan(20);
    // (le shader fait pendre la laine au-dessus de 0,55 seulement : smoothstep(0,55, 0,95))
    expect(limbMax).toBeLessThan(0.25);
    expect(trunkMin).toBeGreaterThan(0.75);
    md.dispose();
  });

  it('les 7 races et leurs agneaux se construisent : cornes selon la race et le sexe, taille de l\'Ouessant', () => {
    for (const b of BREEDS) {
      for (const o of [{ sex: 'm' }, { sex: 'f' }, { lamb: true }, { young: true }]) {
        const md = sheep(b, o);
        expect(md.realSheep, b).toBe(true);
        const B = md.build;
        expect(!!md.horns, `${b} ${JSON.stringify(o)}`).toBe(B.hornSize > 0);
        if (o.lamb) expect(md.horns, `${b} agneau sans cornes`).toBeNull();
        md.dispose();
      }
    }
    expect(sheep('ouessant').size).toBeLessThan(1);
  });

  it('agneau : tête plus grosse, pattes plus longues, toison courte ; le jeune entre les deux', () => {
    const ad = sheep('merinos');
    const lamb = sheep('merinos', { lamb: true });
    const young = sheep('merinos', { young: true });
    expect(lamb.head.scale.x).toBeGreaterThan(1.15 * ad.head.scale.x);
    expect(lamb.build.legs).toBeGreaterThan(1.1 * ad.build.legs);
    expect(young.build.legs).toBeGreaterThan(ad.build.legs);
    expect(young.build.legs).toBeLessThan(lamb.build.legs);
    expect(shornWeight(lamb.build, 1)).toBeGreaterThan(0.3); // (toison courte de l'agneau)
    expect(lamb.stage).toBe('baby');
    expect(young.stage).toBe('young');
    // (membres allongés par leurs os : les pieds restent au sol, le corps monte d'autant)
    const J = sheepJoints(realSheepBase(G), 1.14);
    expect(J.rise).toBeGreaterThan(0.02);
    const toes = realSheepBase(G).index.get('toesL');
    expect(J.heads[toes].y).toBeCloseTo(realSheepBase(G).heads[toes].y, 2);
    for (const m of [ad, lamb, young]) m.dispose();
  });

  it('apparence d\'un mouton du jeu : stade, sexe ; la race reste celle de la robe', () => {
    const a = createAnimal({ species: 'sheep', breed: 'nez_noir', ageDays: 2, seed: 5, sex: 'm', rng: fixed });
    const lk = sheepLookOf(a);
    expect(lk.lamb).toBe(true);
    expect(lk.sex).toBe('m');
    expect(lk.breed).toBe('nez_noir');
  });
});

describe('toison qui suit la tonte', () => {
  it('jamais tondu : toison pleine ; tondu : elle repousse avec la laine du jeu', () => {
    const a = createAnimal({ species: 'sheep', breed: 'merinos', ageDays: 80, seed: 7, rng: fixed });
    expect(sheepFleece(a)).toBe(1); // (adulte neuf, produce 0 : pas tondu pour autant)
    tickProduce(a, 200);
    expect(a.produceReady).toBe(true);
    const profile = { animals: [a], stats: {}, money: 0, coins: 0 };
    expect(collectProduct(profile, a).ok).toBe(true);
    expect(a.woolCut).toBe(true);
    expect(sheepFleece(a)).toBe(0);
    tickProduce(a, 60);
    expect(sheepFleece(a)).toBeCloseTo(0.5, 2);
    tickProduce(a, 100);
    expect(sheepFleece(a)).toBe(1);
  });

  it('poids de la cible « shorn » : 1 tondu, négatif quand la toison épaisse est pleine, en douceur à l\'écran', () => {
    const B = sheepBuild(lookOf('merinos'), { breed: 'merinos' });
    expect(shornWeight(B, 0)).toBe(1);
    expect(shornWeight(B, 1)).toBeCloseTo(-B.fleece, 5);
    expect(shornWeight(B, 0.5)).toBeCloseTo((1 - B.fleece) / 2, 5);
    const md = sheep('merinos');
    expect(md.mesh.morphTargetInfluences[0]).toBeCloseTo(-B.fleece, 3);
    // tondu : la toison rentre en douceur (≈ 1 s), sans reconstruire le modèle
    md.fleece = 0;
    md.anim.update(1 / 30, st());
    const w1 = md.mesh.morphTargetInfluences[0];
    expect(w1).toBeGreaterThan(-B.fleece);
    expect(w1).toBeLessThan(0.5);
    for (let i = 0; i < 120; i++) md.anim.update(1 / 30, st());
    expect(md.mesh.morphTargetInfluences[0]).toBeCloseTo(1, 2);
    expect(md.uniforms.sState.value.x).toBeCloseTo(1, 2);
    // tonte du salon : courte et égale ; laine gonflée du concours : plus épaisse
    md.fleece = 1;
    md.setCut('tonte');
    for (let i = 0; i < 120; i++) md.anim.update(1 / 30, st());
    expect(md.mesh.morphTargetInfluences[0]).toBeGreaterThan(0.5);
    md.setCut(null);
    md.setFluff(true);
    for (let i = 0; i < 120; i++) md.anim.update(1 / 30, st());
    expect(md.mesh.morphTargetInfluences[0]).toBeLessThan(-B.fleece - 0.1);
    md.dispose();
  });

  it('vignette du portrait : la toison du moment fait partie de la clé', () => {
    const a = createAnimal({ species: 'sheep', breed: 'suffolk', ageDays: 80, seed: 9, rng: fixed });
    expect(portraitSpec(a, 'adult').fleece).toBe(1);
    a.woolCut = true;
    a.produce = 30;
    expect(portraitSpec(a, 'adult').fleece).toBeCloseTo(0.3, 5);
    const dog = createAnimal({ species: 'dog', breed: 'labrador', ageDays: 80, seed: 9, rng: fixed });
    expect(portraitSpec(dog, 'adult').fleece).toBeUndefined();
  });
});

describe('au sol', () => {
  it('debout : les 7 races, leurs agneaux et leurs jeunes posent les sabots sur le sol, sans s\'y enfoncer', () => {
    for (const b of BREEDS) {
      for (const o of [{}, { lamb: true }, { young: true }, { fleece: 0 }]) {
        const md = sheep(b, o);
        md.staticPose('stand');
        const lo = lowest(md);
        expect(lo, `${b} ${JSON.stringify(o)}`).toBeGreaterThan(-0.01);
        expect(lo, `${b} ${JSON.stringify(o)}`).toBeLessThan(0.012);
        md.dispose();
      }
    }
  });

  it('couché, endormi, ruminant : posé sur le ventre (ni en l\'air, ni dans le sol), toison épaisse ou laine longue comprises', () => {
    for (const b of ['merinos', 'merinos_australien', 'suffolk', 'ouessant', 'islandais_mouton', 'cheviot']) {
      for (const o of [{}, { lamb: true }, { fleece: 0 }]) {
        for (const posture of ['lie', 'sleep']) {
          const md = sheep(b, o);
          md.staticPose('stand');
          for (let i = 0; i < 150; i++) md.anim.update(1 / 30, st({ posture, ruminate: posture === 'lie' }));
          expect(md.anim.posture, `${b} ${posture}`).toBe(posture);
          const lo = lowest(md);
          // (laine longue : le shader la fait pendre sous le ventre, le corps est relevé d'autant — mesuré sans elle)
          const skirt = md.anim.skirt * Math.max(0, 1 - Math.max(0, md.anim.shorn));
          // (les chèvres couchées de la page de comparaison flottaient au-dessus de l'herbe)
          expect(lo, `${b} ${JSON.stringify(o)} ${posture}`).toBeGreaterThan(-0.03);
          expect(lo - skirt, `${b} ${JSON.stringify(o)} ${posture}`).toBeLessThan(0.02);
          md.dispose();
        }
      }
    }
  });

  it('brouter, manger, bêler : sabots au sol, museau au-dessus de l\'herbe', () => {
    for (const b of ['suffolk', 'merinos', 'ouessant']) {
      for (const o of [{}, { lamb: true }]) {
        for (const action of ['graze', 'eat', null]) {
          const md = sheep(b, o);
          md.staticPose('stand');
          let lo = Infinity;
          for (let f = 0; f < 120; f++) {
            md.anim.update(1 / 30, st({ action, bleat: f === 5 && !action }));
            if (f > 60 && f % 6 === 0) lo = Math.min(lo, lowest(md));
          }
          expect(lo, `${b} ${JSON.stringify(o)} ${action}`).toBeGreaterThan(-0.012);
          md.dispose();
        }
      }
    }
  });

  it('allures (pas, trot, galop), gambade, saut : jamais sous le sol', () => {
    for (const b of ['merinos', 'suffolk', 'ouessant']) {
      for (const o of [{}, { lamb: true }]) {
        const md = sheep(b, o);
        md.staticPose('stand');
        for (const v of [0.9, 2.2, 4.5]) {
          let lo = Infinity;
          for (let f = 0; f < 90; f++) {
            md.anim.update(1 / 30, st({ v: v / (o.lamb ? 0.5 : 1), moving: true, size: o.lamb ? 0.5 : 1, play: !!o.lamb && v > 2 }));
            md.root.position.z += (v / 30);
            if (f > 30 && f % 3 === 0) lo = Math.min(lo, lowest(md, 3));
          }
          expect(lo, `${b} ${JSON.stringify(o)} ${v}`).toBeGreaterThan(-0.012);
        }
        md.dispose();
      }
    }
  });
});

describe('os et sabots', () => {
  it('aucun os ne s\'étire : dans tous les clips, chaque os garde sa distance à son parent', () => {
    for (const b of ['merinos', 'suffolk']) {
      for (const o of [{}, { lamb: true }]) {
        const md = sheep(b, o);
        const a = md.anim;
        const rest = new Map();
        md.root.updateMatrixWorld(true);
        const pos = (bn) => bn.getWorldPosition(new THREE.Vector3());
        for (const bn of md.bones) if (bn.parent?.isBone && bn.parent.name !== 'root') rest.set(bn, pos(bn).distanceTo(pos(bn.parent)));
        for (const clip of a.names) {
          for (const t of [0.1, 0.35, 0.6, 0.85]) {
            a.clipPose(clip, t);
            md.root.updateMatrixWorld(true);
            for (const [bn, d0] of rest) {
              const d = pos(bn).distanceTo(pos(bn.parent));
              expect(Math.abs(d - d0), `${b} ${clip} ${bn.name}`).toBeLessThan(0.0005 + d0 * 0.002);
            }
          }
        }
        md.dispose();
      }
    }
  });

  const run = (md, v, dt, n, each) => {
    for (let i = 0; i < n; i++) {
      md.anim.update(dt, st({ v, moving: true }));
      md.root.position.z += v * dt;
      md.root.updateMatrixWorld(true);
      each(i);
    }
  };
  // Sabots posés qui glissent : la vitesse horizontale d'un sabot en appui, rapportée à celle du mouton (page de
  // comparaison : les sabots glissaient et passaient sous le sol).
  it.each(['merinos', 'suffolk', 'ouessant', 'cheviot'])('%s : les sabots posés ne glissent pas (pas, trot, galop) et ne sautent pas d\'une image à l\'autre', (b) => {
    for (const [v, max] of [[0.9, 0.06], [2.3, 0.1], [4.5, 0.1]]) {
      const md = sheep(b);
      md.staticPose('stand');
      const feet = md.legs.map((l, k) => () => {
        let lo = Infinity;
        const c = new THREE.Vector3();
        for (const p of md.anim.solePts[k]) {
          const q = p.clone().applyMatrix4(l.paw.matrixWorld);
          c.add(q);
          lo = Math.min(lo, q.y);
        }
        return { c: c.multiplyScalar(1 / md.anim.solePts[k].length), lo };
      });
      const dt = 1 / 60;
      let prev = null;
      let jump = 0;
      const stance = [0, 0, 0, 0];
      const dist = [0, 0, 0, 0];
      run(md, v, dt, 300, (i) => {
        const f = feet.map((fn) => fn());
        if (prev && i > 60) {
          for (let l = 0; l < 4; l++) {
            if (prev[l].lo < 0.008 && f[l].lo < 0.008) {
              const d = Math.hypot(f[l].c.x - prev[l].c.x, f[l].c.z - prev[l].c.z);
              jump = Math.max(jump, d);
              dist[l] += d;
              stance[l] += dt;
            }
          }
        }
        prev = f;
      });
      expect(jump, `${b} ${v} saut d'un sabot posé`).toBeLessThan(0.006);
      const slip = Math.max(...dist.map((d, l) => (stance[l] > 0.05 ? d / stance[l] / v : 0)));
      expect(slip, `${b} ${v} glissement`).toBeLessThan(max);
      md.dispose();
    }
  }, 120000);

  // Centre des soles de chaque pied (monde) et sa hauteur la plus basse.
  const soles = (md) => md.legs.map((l, k) => {
    let lo = Infinity;
    const c = new THREE.Vector3();
    for (const p of md.anim.solePts[k]) {
      const q = p.clone().applyMatrix4(l.paw.matrixWorld);
      c.add(q);
      lo = Math.min(lo, q.y);
    }
    return { c: c.multiplyScalar(1 / md.anim.solePts[k].length), lo };
  });

  // Contre-vérification : l'agneau qui gambadait en courant jouait sa gambade sur place pendant que le corps avançait
  // (sabots qui glissaient comme sur la glace, 53 cm pour 53 cm de chemin).
  it('agneau et jeune qui gambadent en courant : l\'allure, sabots posés tenus', () => {
    for (const o of [{ lamb: true }, { young: true }]) {
      const md = sheep('merinos', o);
      md.staticPose('stand');
      const dt = 1 / 60;
      let prev = null;
      const dist = [0, 0, 0, 0];
      const stance = [0, 0, 0, 0];
      const v = 3.2;
      for (let i = 0; i < 240; i++) {
        md.anim.update(dt, st({ v, moving: true, play: true }));
        md.root.position.z += v * dt;
        md.root.updateMatrixWorld(true);
        const f = soles(md);
        if (prev && i > 60) {
          for (let l = 0; l < 4; l++) {
            if (prev[l].lo < 0.008 && f[l].lo < 0.008) {
              dist[l] += Math.hypot(f[l].c.x - prev[l].c.x, f[l].c.z - prev[l].c.z);
              stance[l] += dt;
            }
          }
        }
        prev = f;
      }
      expect(md.anim.w.lamb_play ?? 0, JSON.stringify(o)).toBeLessThan(0.02);
      const slip = Math.max(...dist.map((d, l) => (stance[l] > 0.05 ? d / stance[l] / v : 0)));
      expect(slip, `${JSON.stringify(o)} glissement`).toBeLessThan(0.05);
      md.dispose();
    }
  }, 120000);

  // Contre-vérification : à chaque arrêt, une patte sautait de 12 cm en une image (correction des sabots tenus coupée
  // net) puis un sabot glissait jusqu'à 19 cm (l'allure qui s'effaçait était jouée à sa vitesse naturelle, sur place).
  it.each([['merinos', 0.9], ['suffolk', 0.9], ['merinos', 4.5]])('%s arrêté depuis %s m/s : aucune patte ne saute, aucun sabot ne glisse', (b, v0) => {
    const md = sheep(b);
    md.staticPose('stand');
    const dt = 1 / 30;
    let v = v0;
    let prev = null;
    let prevL = null;
    let jump = 0;
    const slide = [0, 0, 0, 0];
    const inv = new THREE.Matrix4();
    for (let i = 0; i < 240; i++) {
      if (i > 60) v *= Math.exp(-3 * dt);
      const moving = v > 0.06;
      md.anim.update(dt, st({ v: moving ? v : 0, moving }));
      if (moving) md.root.position.z += v * dt;
      md.root.updateMatrixWorld(true);
      const f = soles(md);
      inv.copy(md.root.matrixWorld).invert();
      const L = f.map((x) => x.c.clone().applyMatrix4(inv));
      if (!moving && prev) {
        for (let l = 0; l < 4; l++) {
          jump = Math.max(jump, L[l].distanceTo(prevL[l]));
          if (prev[l].lo < 0.006 && f[l].lo < 0.006) slide[l] += Math.hypot(f[l].c.x - prev[l].c.x, f[l].c.z - prev[l].c.z);
        }
      }
      prev = f;
      prevL = L;
    }
    expect(jump, `${b} saut d'une patte à l'arrêt`).toBeLessThan(0.06);
    expect(Math.max(...slide), `${b} glissement à l'arrêt`).toBeLessThan(0.025);
    // (et il finit d'aplomb : plus aucune correction sur les membres)
    expect(Math.max(...md.anim.lockAng.map(Math.abs))).toBeLessThan(0.04);
    md.dispose();
  }, 120000);

  // Contre-vérification : l'agneau qui broute — la tête sautait sous le poitrail une image puis revenait (l'encolure
  // relevait le museau tantôt vers l'avant, tantôt vers l'arrière).
  it('agneau qui broute : la tête ne saute jamais d\'une image à l\'autre', () => {
    const md = sheep('merinos', { lamb: true });
    md.staticPose('stand');
    const m = new THREE.Vector3();
    let prev = null;
    let jump = 0;
    for (let i = 0; i < 400; i++) {
      md.anim.update(1 / 30, st({ action: 'graze' }));
      md.root.updateMatrixWorld(true);
      md.head.localToWorld(m.copy(md.mouth));
      if (prev && i > 60) jump = Math.max(jump, m.distanceTo(prev));
      prev = (prev ?? new THREE.Vector3()).copy(m);
    }
    expect(jump).toBeLessThan(0.03);
    expect(md.anim.noseLift).toBeLessThanOrEqual(0); // (toujours relevée vers l'avant)
    md.dispose();
  });
});

describe('animation', () => {
  it('allure choisie avec hystérésis (pas de va-et-vient au seuil)', () => {
    expect(pickSheepGait('idle', 0)).toBe('idle');
    expect(pickSheepGait('idle', 1)).toBe('walk');
    expect(pickSheepGait('walk', 1.5)).toBe('walk');
    expect(pickSheepGait('walk', 1.7)).toBe('trot');
    expect(pickSheepGait('trot', 1.4)).toBe('trot');
    expect(pickSheepGait('trot', 1.2)).toBe('walk');
    expect(pickSheepGait('trot', 3.6)).toBe('run');
    expect(pickSheepGait('run', 3.2)).toBe('run');
    expect(pickSheepGait('run', 2.8)).toBe('trot');
  });

  it('se coucher à genoux puis se relever l\'arrière-train d\'abord : transitions jouées une fois, posture qui suit', () => {
    const md = sheep('merinos');
    const a = md.anim;
    md.staticPose('stand');
    a.update(1 / 30, st({ posture: 'lie' }));
    expect(a.trans?.name).toBe('lie_down');
    for (let i = 0; i < 90; i++) a.update(1 / 30, st({ posture: 'lie' }));
    expect(a.posture).toBe('lie');
    expect(a.trans).toBeNull();
    a.update(1 / 30, st({ posture: 'sleep' }));
    expect(a.posture).toBe('sleep'); // (couché → endormi : en fondu, sans se relever)
    a.update(1 / 30, st({ posture: 'stand' }));
    expect(a.trans?.name).toBe('get_up');
    for (let i = 0; i < 90; i++) a.update(1 / 30, st({ posture: 'stand' }));
    expect(a.posture).toBe('stand');
    // il repart couché : se relève vite en marchant
    a.update(1 / 30, st({ posture: 'lie' }));
    for (let i = 0; i < 90; i++) a.update(1 / 30, st({ posture: 'lie' }));
    a.update(1 / 30, st({ v: 1, moving: true }));
    expect(a.trans?.name).toBe('get_up');
    expect(a.actions.get_up.timeScale).toBeGreaterThan(2);
    md.dispose();
  });

  it('bêler (une fois), gambader (agneau), téter, saut du spectacle', () => {
    const md = sheep('merinos', { lamb: true });
    const a = md.anim;
    md.staticPose('stand');
    a.update(1 / 30, st({ bleat: true }));
    expect(a.bleatOn).toBe(true);
    for (let i = 0; i < 70; i++) a.update(1 / 30, st());
    expect(a.bleatOn).toBe(false);
    for (let i = 0; i < 40; i++) a.update(1 / 30, st({ action: 'play' }));
    expect(a.w.lamb_play).toBeGreaterThan(0.8);
    for (let i = 0; i < 60; i++) a.update(1 / 30, st({ action: 'nurse' }));
    expect(a.nurse).toBeGreaterThan(0.9);
    expect(realSheepPose(md, 'jump', 1, 0.5)).toBe(true);
    for (let i = 0; i < 20; i++) {
      realSheepPose(md, 'jump', 1, 0.5);
      a.update(1 / 30, st());
    }
    expect(a.w.jump).toBeGreaterThan(0.8);
    expect(realSheepPose({ realSheep: false }, 'jump')).toBe(false);
    md.dispose();
  });

  it('version réduite au loin : un autre index sur la même géométrie', () => {
    const md = sheep('merinos', { sex: 'm' });
    const full = md.mesh.geometry;
    md.setLod(1);
    expect(md.mesh.geometry).not.toBe(full);
    expect(md.mesh.geometry.index.count).toBeLessThan(full.index.count * 0.6);
    expect(md.mesh.geometry.attributes.position).toBe(full.attributes.position);
    md.setLod(0);
    expect(md.mesh.geometry).toBe(full);
    md.dispose();
  });

  it('boîte englobante qui suit la pose (élimination hors champ) : couché, elle descend', () => {
    const md = sheep('merinos');
    md.staticPose('stand');
    md.root.updateMatrixWorld(true);
    md.mesh.computeBoundingBox();
    const top = md.mesh.boundingBox.max.y;
    md.staticPose('lie');
    md.root.updateMatrixWorld(true);
    md.mesh.computeBoundingBox();
    expect(md.mesh.boundingBox.max.y).toBeLessThan(top - 0.1);
    expect(md.mesh.boundingBox.min.y).toBeLessThan(0.02);
    md.dispose();
  });
});

describe('accessoires et crédits', () => {
  it('nœud, clochette et ruban du salon sur l\'encolure et la tête mesurées ; tout se retire', () => {
    const md = sheep('suffolk');
    expect(md.dogFit.collar.rx).toBeGreaterThan(0.03);
    expect(md.dogFit.collar.bone).toBe(md.neck);
    const look = lookOf('suffolk');
    const acc = buildAccessories(md, look, { neck: { id: 'bow', color: 'pink' }, head: { id: 'ribbon', color: 'blue' } });
    expect(acc.length).toBeGreaterThan(0);
    let onNeck = false;
    let onHead = false;
    for (const o of acc) {
      let p = o.parent;
      while (p) {
        if (p === md.neck) onNeck = true;
        if (p === md.head) onHead = true;
        p = p.parent;
      }
    }
    expect(onNeck || onHead).toBe(true);
    removeAccessories(acc);
    md.dispose();
  });

  it('le mouton Rocketbox est crédité (MIT : notice de copyright et texte de la licence) dans le jeu, CREDITS.md et LICENSES', () => {
    const c = MODEL_CREDITS.find((x) => x.id === 'sheep_real');
    expect(c.file).toBe('sheep.glb');
    expect(c.license.name).toBe('MIT');
    expect(c.url).toContain('github.com/microsoft/Microsoft-Rocketbox');
    expect(c.notice).toBe('Copyright (c) 2020 Microsoft');
    expect(c.licenseText).toContain('Permission is hereby granted, free of charge');
    expect(c.changes.fr.length).toBeGreaterThan(20);
    const credits = fs.readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8');
    expect(credits).toContain('Sheep_White_01');
    expect(credits).toContain('Copyright (c) 2020 Microsoft');
    expect(credits).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    const lic = fs.readFileSync(new URL('../public/models/LICENSES/microsoft-rocketbox-sheep.txt', import.meta.url), 'utf8');
    expect(lic).toContain('MIT License');
    expect(lic).toContain('Copyright (c) 2020 Microsoft');
    expect(lic).toContain('sheep.glb');
  });
});

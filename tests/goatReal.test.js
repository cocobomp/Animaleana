// Chèvre réaliste (Microsoft Rocketbox, GLB chargé dans node sans textures) : fichier, races reconnaissables, cornes,
// barbe, mamelle qui suit le lait et la traite, chevreaux, sabots au sol dans toutes les poses et allures, couchée posée
// sur le ventre, dressée contre la barrière les antérieurs sur la lisse, os jamais étirés, sabots en appui tenus,
// chevreau qui tète (bouche au trayon), version réduite, crédits MIT, repli procédural. Tout est déterministe (graines
// fixes, pas de temps fixe, aucun tirage au hasard).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import {
  buildRealGoatModel, realGoatBase, REAL_GOAT_KEY, realGoatPose, nurseSpot, teatPoint, FENCE_RAIL, GOAT_LOD_DIST, animateRealGoat,
} from '../src/game/models/goatReal.js';
import { pickSheepGait } from '../src/game/models/sheepReal.js';
import { buildAnimalModel } from '../src/game/models/animalModel.js';
import { GOAT_BUILDS, goatBuild, goatBreedOfLook, goatUdderFill, udderScale, goatLookOf, goatStage, UDDER } from '../src/sim/goatLook.js';
import { SPECIES, isOffered } from '../src/sim/species.js';
import { resolveLook, createAnimal } from '../src/sim/animal.js';
import { collectProduct, tickProduce } from '../src/sim/farm.js';
import { MODELS } from '../src/game/assets.js';
import { MODEL_CREDITS } from '../src/ui/credits.js';
import { portraitSpec } from '../src/game/thumbScenes.js';
import { loadRealGoatGltf, GOAT_FILE, glbJson } from './fixtures/realGoatGltf.js';

const BREEDS = SPECIES.goat.breeds.map((b) => b.id);
const fixed = () => 0.42; // (tirages fixes : rien au hasard)
let G;
beforeAll(async () => {
  G = await loadRealGoatGltf();
}, 120000);

const lookOf = (breed, o = {}) => ({ ...resolveLook('goat', breed, 0), seed: 4242, sex: o.sex ?? 'f', ...(o.kid ? { kid: true } : {}), ...(o.young ? { young: true } : {}), ...(o.udderFill !== undefined ? { udderFill: o.udderFill } : {}) });
const goat = (breed, o = {}) => buildRealGoatModel(lookOf(breed, o), breed, G);
const STAGES = [{ sex: 'f' }, { sex: 'm' }, { kid: true }, { young: true }];

const _v = new THREE.Vector3();
/** Point le plus bas de la peau (repère du monde), un sommet sur step ; only : filtre des sommets (index). */
function lowest(md, step = 2, only = null) {
  md.root.updateMatrixWorld(true);
  const m = md.mesh;
  let lo = Infinity;
  for (let i = 0; i < m.geometry.attributes.position.count; i += step) {
    if (only && !only(i)) continue;
    m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
    lo = Math.min(lo, _v.y);
  }
  return lo;
}
/** Sommets du tronc (poids des os du tronc > 0,6 : ni membres, ni tête, ni mamelle). */
const trunkOnly = (md) => {
  const P = md.anim.base.prim;
  return (i) => P.part[i * 4 + 3] > 0.6;
};
/** Sole la plus basse d'un pied (repère du monde). */
const soleLow = (md, k) => {
  md.root.updateMatrixWorld(true);
  let lo = Infinity;
  for (const p of md.anim.solePts[k]) lo = Math.min(lo, p.clone().applyMatrix4(md.legs[k].paw.matrixWorld).y);
  return lo;
};
const st = (o = {}) => ({ v: 0, moving: false, size: 1, posture: 'stand', action: null, ...o });

describe('fichier de la chèvre réaliste', () => {
  it('goat.glb : os, clips, cible des cornes, compression, version réduite, poids', () => {
    const buf = fs.readFileSync(GOAT_FILE);
    expect(buf.length).toBeLessThan(600_000);
    const json = glbJson(buf);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']));
    expect(json.skins[0].joints.length).toBe(37);
    const names = new Set(json.nodes.map((n) => n.name));
    for (const b of ['root', 'pelvis', 'chest', 'neck1', 'neck3', 'head', 'jaw', 'beard', 'hornL', 'hornR', 'earL', 'eyeL', 'udder', 'tail1',
      'scapL', 'humerusL', 'radiusL', 'metacarpusL', 'toesL', 'femurR', 'tibiaR', 'metatarsusR', 'htoesR']) expect(names, b).toContain(b);
    const clips = json.animations.map((a) => a.name);
    for (const c of ['idle', 'walk', 'trot', 'run', 'graze', 'eat', 'browse_up', 'rear_up', 'rear_down', 'climb', 'bleat', 'headbutt',
      'lie_down', 'lie', 'ruminate', 'sleep', 'get_up', 'kid_play', 'jump', 'milk']) expect(clips, c).toContain(c);
    // (aucune échelle animée ; aucune translation d'os sauf la racine : un os qui se déplace s'étire)
    for (const a of json.animations) {
      for (const ch of a.channels) {
        expect(ch.target.path).not.toBe('scale');
        if (ch.target.path === 'translation') expect(json.nodes[ch.target.node].name, a.name).toBe('root');
      }
    }
    const goatMesh = json.meshes.find((m) => m.name === 'goat');
    expect(goatMesh.extras.targetNames).toEqual(['horns_back']);
    expect(json.meshes.find((m) => m.name === 'goat_lod')?.extras?.lod).toBe(true);
    const ext = json.scenes[json.scene ?? 0].extras.goat;
    expect(ext.naturalSpeeds.walk).toBeGreaterThan(0.6);
    expect(ext.naturalSpeeds.run).toBeGreaterThan(ext.naturalSpeeds.trot);
    // (dressée : les sabots antérieurs à la hauteur de la lisse haute de la barrière de la bergerie)
    expect(ext.browse.rail).toBe(FENCE_RAIL);
    expect(Math.abs(ext.browse.hoof[1] - FENCE_RAIL)).toBeLessThan(0.05);
    // (mesures sur le maillage déformé, tools/chevre/measure.py : ni os étiré, ni sabot sous le sol, ni rideau de peau)
    for (const [clip, m] of Object.entries(ext.measures)) {
      expect(m.boneStretchPct, clip).toBeLessThan(0.5);
      expect(m.hoofLowCm, clip).toBeGreaterThan(-0.3);
      expect(m.edgeMaxBy.avant, clip).toBeLessThan(4);
      expect(m.edgeMaxBy.arriere, clip).toBeLessThan(3.5);
      expect(m.edgeMaxBy.tronc, clip).toBeLessThan(3.5);
      if (m.slipPct !== undefined) expect(m.slipPct, clip).toBeLessThan(6);
    }
  });

  it('la chèvre est proposée comme nouvel animal (son modèle réaliste est en ligne : OFFERED_SPECIES)', () => {
    expect(isOffered('goat')).toBe(true);
  });

  it('la clé du modèle est goat_real (jamais « goat » : la chèvre procédurale reste le repli)', () => {
    expect(REAL_GOAT_KEY).toBe('goat_real');
    expect(MODELS.goat_real).toBe('goat.glb');
    expect(MODELS.goat).toBeUndefined();
  });

  it('sans le GLB (chargement, fichier absent) : pas de chèvre réaliste, buildAnimalModel prend la procédurale', () => {
    // (rien n'est chargé par assets.js dans les tests : le GLB n'est donné qu'à la main ; la procédurale peint ses
    // textures dans un canevas, absent de node)
    expect(buildRealGoatModel(lookOf('alpine'), 'alpine')).toBeNull();
    const src = fs.readFileSync(new URL('../src/game/models/animalModel.js', import.meta.url), 'utf8');
    expect(src).toMatch(/speciesId === 'goat'\) \{\s*const real = buildRealGoatModel\(look, breedOfAnimal\);\s*if \(real\) return real;/);
    expect(typeof buildAnimalModel).toBe('function');
  });

  it('les clips du jeu n\'ont aucune translation d\'os hors de la racine', () => {
    const base = realGoatBase(G);
    for (const clip of Object.values(base.clips)) {
      for (const t of clip.tracks) {
        const [node, prop] = t.name.split('.');
        expect(prop).not.toBe('scale');
        if (prop === 'position') expect(node).toBe('root');
      }
    }
  });
});

describe('races, cornes, barbe et chevreaux', () => {
  it('chaque race du jeu a son gabarit ; race des anciennes sauvegardes retrouvée par la robe ; croisé', () => {
    for (const b of BREEDS) expect(GOAT_BUILDS[b], b).toBeTruthy();
    const old = resolveLook('goat', 'col_noir', 0);
    delete old.breed;
    expect(goatBreedOfLook(old)).toBe('col_noir');
    expect(goatBuild({ ...resolveLook('goat', 'poitevine', 0) }, { breed: 'mix' }).breed).toBe('poitevine');
    expect(goatBuild({ coat: 0x123456, secondary: 0x654321 }, { breed: 'mix' }).breed).toBe('alpine');
  });

  it('races reconnaissables : alpine chamoisée aux pattes noires, saanen blanche sans cornes, poitevine noire au poil long, col noir', () => {
    const red = (h) => (h >> 16) & 255;
    const blue = (h) => h & 255;
    const alpine = goatBuild(lookOf('alpine'), { breed: 'alpine' });
    expect(alpine.pattern).toBe('chamoisee');
    expect(red(alpine.colors.base)).toBeGreaterThan(blue(alpine.colors.base) + 40); // (brun chamois)
    expect(alpine.colors.leg).toBeLessThan(0x303030);
    expect(alpine.colors.dark).toBeLessThan(0x303030); // (raie dorsale, ventre et bandes de la face)
    expect(alpine.hornSize).toBeGreaterThan(0);
    expect(alpine.hornBack).toBe(1);
    const saanen = goatBuild(lookOf('saanen'), { breed: 'saanen' });
    expect(saanen.hornSize).toBe(0);
    expect(saanen.colors.base).toBeGreaterThan(0xe0e0e0);
    expect(saanen.long).toBe(0);
    const poit = goatBuild(lookOf('poitevine'), { breed: 'poitevine' });
    expect(poit.colors.base).toBeLessThan(0x303030);
    expect(poit.colors.light).toBeGreaterThan(0xb0b0b0); // (ventre, intérieur des cuisses, bandes de la face)
    expect(poit.long).toBeGreaterThan(0.08);
    expect(poit.hornBack).toBe(0);
    const col = goatBuild(lookOf('col_noir'), { breed: 'col_noir' });
    expect(col.colors.dark).toBeLessThan(0x202020);
    expect(col.colors.light).toBeGreaterThan(0xe0e0e0);
    expect(col.long).toBeGreaterThan(0.1);
    expect(col.hornSize).toBeGreaterThan(alpine.hornSize); // (grandes cornes, chèvres comprises)
  });

  it('bouc : cornes et barbe plus grandes ; chevreau : ni cornes ni barbe, tête plus grosse, pattes plus longues ; jeune entre les deux', () => {
    for (const b of ['alpine', 'col_noir', 'poitevine']) {
      const f = goatBuild(lookOf(b), { breed: b, sex: 'f' });
      const m = goatBuild(lookOf(b), { breed: b, sex: 'm' });
      const kid = goatBuild(lookOf(b), { breed: b, stage: 'baby' });
      const young = goatBuild(lookOf(b), { breed: b, stage: 'young' });
      expect(m.hornSize, b).toBeGreaterThan(1.3 * f.hornSize);
      expect(m.beardSize, b).toBeGreaterThan(1.3 * f.beardSize);
      expect(kid.hornSize, b).toBe(0);
      expect(kid.beardSize, b).toBe(0);
      expect(young.hornSize, b).toBeGreaterThan(0);
      expect(young.hornSize, b).toBeLessThan(f.hornSize);
      expect(kid.head).toBeGreaterThan(1.2 * f.head);
      expect(kid.legs).toBeGreaterThan(1.1 * f.legs);
      expect(young.legs).toBeGreaterThan(f.legs);
      expect(young.legs).toBeLessThan(kid.legs);
    }
    // (robe « sans cornes » d'une chèvre croisée ; barbe retirée)
    expect(goatBuild({ ...lookOf('alpine'), horns: 'none' }, { breed: 'alpine' }).hornSize).toBe(0);
    expect(goatBuild({ ...lookOf('alpine'), beard: false }, { breed: 'alpine' }).beardSize).toBe(0);
  });

  it('les 4 races et leurs chevreaux se construisent : cornes et barbe par l\'échelle de leurs os, poil long en mèches', () => {
    for (const b of BREEDS) {
      for (const o of STAGES) {
        const md = goat(b, o);
        const tag = `${b} ${JSON.stringify(o)}`;
        expect(md.realGoat, tag).toBe(true);
        const B = md.build;
        const horn = md.bone('hornL').scale.x;
        if (B.hornSize > 0) expect(horn, tag).toBeCloseTo(B.hornSize, 5);
        else expect(horn, tag).toBeLessThan(1e-3);
        expect(md.bone('beard').scale.x > 1e-3, tag).toBe(B.beardSize > 0);
        expect(md.mesh.morphTargetInfluences[0], tag).toBe(B.hornBack);
        expect(md.stage, tag).toBe(o.kid ? 'baby' : o.young ? 'young' : 'adult');
        if (!o.kid && !o.young) expect(!!md.hair, tag).toBe(B.long > 0);
        if (md.hair) expect(md.hair.geometry.userData.cards, tag).toBeLessThanOrEqual(170);
        md.dispose();
      }
    }
  });

  it('apparence d\'une chèvre du jeu : stade, sexe ; gabarit 3D par stade', () => {
    const a = createAnimal({ species: 'goat', breed: 'poitevine', ageDays: 2, seed: 5, sex: 'm', rng: fixed });
    const lk = goatLookOf(a);
    expect(lk.kid).toBe(true);
    expect(lk.sex).toBe('m');
    expect(lk.breed).toBe('poitevine');
    expect(goatStage('senior')).toBe('adult');
    expect(goatStage('baby')).toBe('baby');
  });
});

describe('mamelle qui suit le lait et la traite', () => {
  it('lait du jeu → mamelle : vide après la traite, pleine quand le lait est prêt ; bouc et chevrette : petite', () => {
    const a = createAnimal({ species: 'goat', breed: 'saanen', ageDays: 80, seed: 7, sex: 'f', rng: fixed });
    a.produce = 0;
    expect(goatUdderFill(a)).toBe(0);
    tickProduce(a, 30);
    const half = goatUdderFill(a);
    expect(half).toBeGreaterThan(0);
    tickProduce(a, 100);
    expect(goatUdderFill(a)).toBe(1);
    const profile = { animals: [a], stats: {}, money: 0, coins: 0 };
    expect(collectProduct(profile, a).ok).toBe(true);
    expect(goatUdderFill(a)).toBe(0);
    const buck = createAnimal({ species: 'goat', breed: 'saanen', ageDays: 80, seed: 7, sex: 'm', rng: fixed });
    buck.produce = 100;
    expect(goatUdderFill(buck)).toBe(0);
    const B = goatBuild(lookOf('saanen'), { breed: 'saanen', sex: 'f' });
    expect(udderScale(B, 0)).toBe(UDDER.empty);
    expect(udderScale(B, 1)).toBe(UDDER.full);
    expect(udderScale(goatBuild(lookOf('saanen'), { breed: 'saanen', sex: 'm' }), 1)).toBe(UDDER.small);
  });

  it('modèle : l\'os de la mamelle grossit avec le lait, en douceur ; couchée, elle s\'aplatit contre le ventre', () => {
    const md = goat('saanen', { udderFill: 1 });
    const s = md.size;
    expect(md.udderBone.scale.y).toBeCloseTo(UDDER.full, 3);
    // traite : la mamelle se vide en quelques secondes (sans reconstruire le modèle)
    md.udderFill = 0;
    md.anim.update(1 / 30, st());
    expect(md.udderBone.scale.y).toBeGreaterThan(UDDER.empty + 0.3);
    for (let i = 0; i < 300; i++) md.anim.update(1 / 30, st({ action: 'milk' }));
    expect(md.udderBone.scale.y).toBeCloseTo(UDDER.empty, 2);
    expect(md.anim.w.milk).toBeGreaterThan(0.9);
    md.setUdder(1);
    for (let i = 0; i < 150; i++) md.anim.update(1 / 30, st({ posture: 'lie' }));
    expect(md.udderBone.scale.y).toBeLessThan(0.6 * UDDER.full);
    expect(md.udderBone.scale.x).toBeGreaterThan(UDDER.full);
    void s;
    md.dispose();
  });

  it('vignette du portrait : la mamelle (au quart près) fait partie de la clé de la chèvre seulement', () => {
    const a = createAnimal({ species: 'goat', breed: 'alpine', ageDays: 80, seed: 9, sex: 'f', rng: fixed });
    a.produce = 60;
    expect(portraitSpec(a, 'adult').udder).toBe(0.5);
    a.produce = 100;
    expect(portraitSpec(a, 'adult').udder).toBe(1);
    const buck = createAnimal({ species: 'goat', breed: 'alpine', ageDays: 80, seed: 9, sex: 'm', rng: fixed });
    expect(portraitSpec(buck, 'adult').udder).toBeUndefined();
    const dog = createAnimal({ species: 'dog', breed: 'labrador', ageDays: 80, seed: 9, rng: fixed });
    expect(portraitSpec(dog, 'adult').udder).toBeUndefined();
  });
});

describe('au sol', () => {
  it('debout : les 4 races, boucs, chevreaux et jeunes posent les sabots sur le sol, sans s\'y enfoncer', () => {
    for (const b of BREEDS) {
      for (const o of STAGES) {
        const md = goat(b, o);
        md.staticPose('stand');
        const lo = lowest(md);
        expect(lo, `${b} ${JSON.stringify(o)}`).toBeGreaterThan(-0.01);
        expect(lo, `${b} ${JSON.stringify(o)}`).toBeLessThan(0.012);
        md.dispose();
      }
    }
  });

  it('couchée, endormie, ruminant : le ventre posé sur le sol (ni en l\'air, ni dedans), mamelle pleine comprise', () => {
    for (const b of BREEDS) {
      for (const o of [{ udderFill: 1 }, { kid: true }, { sex: 'm' }]) {
        for (const posture of ['lie', 'sleep']) {
          const md = goat(b, o);
          md.staticPose('stand');
          for (let i = 0; i < 150; i++) md.anim.update(1 / 30, st({ posture, ruminate: posture === 'lie' }));
          const tag = `${b} ${JSON.stringify(o)} ${posture}`;
          expect(md.anim.posture, tag).toBe(posture);
          expect(lowest(md), tag).toBeGreaterThan(-0.03);
          // (poil long : le shader le fait pendre sous le ventre, le corps est relevé d'autant — mesuré sans lui)
          const belly = lowest(md, 1, trunkOnly(md)) - md.anim.skirt;
          expect(belly, tag).toBeGreaterThan(-0.015);
          expect(belly, tag).toBeLessThan(0.015);
          md.dispose();
        }
      }
    }
  });

  it('brouter, manger, bêler, traite, coup de tête : sabots au sol, museau au-dessus de l\'herbe', () => {
    for (const b of ['alpine', 'col_noir']) {
      for (const o of [{}, { kid: true }]) {
        for (const action of ['graze', 'eat', 'milk', null, 'butt']) {
          const md = goat(b, o);
          md.staticPose('stand');
          let lo = Infinity;
          for (let f = 0; f < 120; f++) {
            md.anim.update(1 / 30, st({ action: action === 'butt' ? null : action, bleat: f === 5 && !action, butt: action === 'butt' && f === 5 }));
            if (f > 20 && f % 6 === 0) lo = Math.min(lo, lowest(md));
          }
          expect(lo, `${b} ${JSON.stringify(o)} ${action}`).toBeGreaterThan(-0.012);
          md.dispose();
        }
      }
    }
  });

  it('allures (pas, trot, galop), gambade du chevreau : jamais sous le sol', () => {
    for (const b of ['alpine', 'poitevine']) {
      for (const o of [{}, { kid: true }]) {
        const md = goat(b, o);
        md.staticPose('stand');
        for (const v of [0.9, 2.2, 4.5]) {
          let lo = Infinity;
          for (let f = 0; f < 90; f++) {
            md.anim.update(1 / 30, st({ v: v / (o.kid ? 0.6 : 1), moving: true, size: o.kid ? 0.6 : 1, play: !!o.kid && v > 2 }));
            md.root.position.z += v / 30;
            if (f > 30 && f % 3 === 0) lo = Math.min(lo, lowest(md, 3));
          }
          expect(lo, `${b} ${JSON.stringify(o)} ${v}`).toBeGreaterThan(-0.012);
        }
        md.dispose();
      }
    }
  });

  it('dressée contre la barrière : les antérieurs à la hauteur de la lisse, les postérieurs au sol, puis elle redescend', () => {
    for (const b of ['alpine', 'saanen']) {
      const md = goat(b);
      const a = md.anim;
      md.staticPose('stand');
      a.update(1 / 30, st({ posture: 'rear' }));
      expect(a.trans?.name).toBe('rear_up');
      for (let i = 0; i < 150; i++) a.update(1 / 30, st({ posture: 'rear' }));
      expect(a.posture).toBe('rear');
      expect(a.w.browse_up).toBeGreaterThan(0.9);
      const front = Math.min(soleLow(md, 0), soleLow(md, 1));
      expect(Math.abs(front - md.browseHoof[1] * md.size), b).toBeLessThan(0.06);
      expect(Math.abs(front - FENCE_RAIL), b).toBeLessThan(0.08);
      for (const k of [2, 3]) {
        expect(soleLow(md, k), `${b} postérieur ${k}`).toBeGreaterThan(-0.012);
        expect(soleLow(md, k), `${b} postérieur ${k}`).toBeLessThan(0.02);
      }
      // (sabots antérieurs en avant de l'origine : la chèvre s'arrête à cette distance de la barrière)
      expect(md.browseHoof[0]).toBeGreaterThan(0.15);
      a.update(1 / 30, st());
      expect(a.trans?.name).toBe('rear_down');
      for (let i = 0; i < 90; i++) a.update(1 / 30, st());
      expect(a.posture).toBe('stand');
      expect(Math.min(soleLow(md, 0), soleLow(md, 1))).toBeLessThan(0.02);
      md.dispose();
    }
  });

  // Contre-vérification : du clip seul, les postérieurs glissaient pendant qu'elle se dressait (3 à 19 cm).
  it('dressée puis redescendue : les postérieurs restent posés où ils étaient', () => {
    const md = goat('alpine');
    const a = md.anim;
    md.staticPose('stand');
    const hind = () => [2, 3].map((k) => {
      const c = new THREE.Vector3();
      for (const p of a.solePts[k]) c.add(p.clone().applyMatrix4(md.legs[k].paw.matrixWorld));
      return c.multiplyScalar(1 / a.solePts[k].length);
    });
    for (let i = 0; i < 30; i++) a.update(1 / 30, st());
    const start = hind();
    let drift = 0;
    for (let i = 0; i < 240; i++) {
      a.update(1 / 30, st({ posture: i < 160 ? 'rear' : 'stand' }));
      md.root.updateMatrixWorld(true);
      hind().forEach((c, j) => { drift = Math.max(drift, Math.hypot(c.x - start[j].x, c.z - start[j].z)); });
      for (const k of [2, 3]) expect(soleLow(md, k)).toBeGreaterThan(-0.006);
    }
    expect(drift).toBeLessThan(0.02);
    md.dispose();
  });
});

describe('os et sabots', () => {
  // Contre-vérification : le chevreau qui broute — sa tête sautait sous le poitrail pendant une image, toutes les ~19
  // images (21 à 23 cm) : l'encolure relevait le museau tantôt vers l'avant, tantôt vers l'arrière.
  it.each(['alpine', 'saanen'])('chevreau %s qui broute : la tête ne saute jamais d\'une image à l\'autre', (b) => {
    const md = goat(b, { kid: true });
    md.staticPose('stand');
    const m = new THREE.Vector3();
    let prev = null;
    let jump = 0;
    for (let i = 0; i < 600; i++) {
      md.anim.update(1 / 30, st({ action: 'graze' }));
      md.root.updateMatrixWorld(true);
      md.head.localToWorld(m.copy(md.mouth));
      if (prev && i > 60) jump = Math.max(jump, m.distanceTo(prev));
      prev = (prev ?? new THREE.Vector3()).copy(m);
    }
    expect(jump).toBeLessThan(0.03);
    md.dispose();
  });

  // Contre-vérification : à l'arrêt, une patte sautait de 12,7 cm en une image et un sabot glissait de 19 cm.
  it('arrêtée depuis le pas : aucune patte ne saute, aucun sabot ne glisse, elle finit d\'aplomb', () => {
    const md = goat('alpine');
    md.staticPose('stand');
    const dt = 1 / 30;
    let v = 0.9;
    let prev = null;
    let jump = 0;
    const slide = [0, 0, 0, 0];
    const inv = new THREE.Matrix4();
    const soles = () => md.legs.map((l, k) => {
      let lo = Infinity;
      const c = new THREE.Vector3();
      for (const p of md.anim.solePts[k]) {
        const q = p.clone().applyMatrix4(l.paw.matrixWorld);
        c.add(q);
        lo = Math.min(lo, q.y);
      }
      return { c: c.multiplyScalar(1 / md.anim.solePts[k].length), lo };
    });
    for (let i = 0; i < 240; i++) {
      if (i > 60) v *= Math.exp(-3 * dt);
      const moving = v > 0.06;
      md.anim.update(dt, st({ v: moving ? v : 0, moving }));
      if (moving) md.root.position.z += v * dt;
      md.root.updateMatrixWorld(true);
      inv.copy(md.root.matrixWorld).invert();
      const f = soles().map((x) => ({ ...x, l: x.c.clone().applyMatrix4(inv) }));
      if (!moving && prev) {
        for (let l = 0; l < 4; l++) {
          jump = Math.max(jump, f[l].l.distanceTo(prev[l].l));
          if (prev[l].lo < 0.006 && f[l].lo < 0.006) slide[l] += Math.hypot(f[l].c.x - prev[l].c.x, f[l].c.z - prev[l].c.z);
        }
      }
      prev = f;
    }
    expect(jump).toBeLessThan(0.06);
    expect(Math.max(...slide)).toBeLessThan(0.025);
    expect(Math.max(...md.anim.lockAng.map(Math.abs))).toBeLessThan(0.04);
    md.dispose();
  }, 60000);

  it('aucun os ne s\'étire : dans tous les clips, chaque os garde sa distance à son parent', () => {
    for (const b of ['alpine', 'col_noir']) {
      for (const o of [{}, { kid: true }]) {
        const md = goat(b, o);
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

  // Sabots posés qui glissent : vitesse horizontale d'un sabot en appui, rapportée à celle de la chèvre.
  it.each(['alpine', 'saanen'])('%s : les sabots posés ne glissent pas (pas, trot, galop) et ne sautent pas d\'une image à l\'autre', (b) => {
    for (const [v, max] of [[0.9, 0.06], [2.2, 0.1], [4.5, 0.1]]) {
      const md = goat(b);
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
      for (let i = 0; i < 300; i++) {
        md.anim.update(dt, st({ v, moving: true }));
        md.root.position.z += v * dt;
        md.root.updateMatrixWorld(true);
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
      }
      expect(jump, `${b} ${v} saut d'un sabot posé`).toBeLessThan(0.006);
      const slip = Math.max(...dist.map((d, l) => (stance[l] > 0.05 ? d / stance[l] / v : 0)));
      expect(slip, `${b} ${v} glissement`).toBeLessThan(max);
      md.dispose();
    }
  }, 120000);
});

describe('animation', () => {
  it('allure choisie avec hystérésis (celle du mouton)', () => {
    expect(pickSheepGait('idle', 1)).toBe('walk');
    expect(pickSheepGait('walk', 1.7)).toBe('trot');
    expect(pickSheepGait('trot', 3.6)).toBe('run');
    expect(pickSheepGait('run', 2.8)).toBe('trot');
  });

  it('se coucher puis se relever : transitions jouées une fois, posture qui suit ; de dressée à couchée, elle redescend d\'abord', () => {
    const md = goat('alpine');
    const a = md.anim;
    md.staticPose('stand');
    a.update(1 / 30, st({ posture: 'lie' }));
    expect(a.trans?.name).toBe('lie_down');
    for (let i = 0; i < 120; i++) a.update(1 / 30, st({ posture: 'lie' }));
    expect(a.posture).toBe('lie');
    expect(a.trans).toBeNull();
    a.update(1 / 30, st({ posture: 'sleep' }));
    expect(a.posture).toBe('sleep');
    a.update(1 / 30, st({ posture: 'stand' }));
    expect(a.trans?.name).toBe('get_up');
    for (let i = 0; i < 120; i++) a.update(1 / 30, st({ posture: 'stand' }));
    expect(a.posture).toBe('stand');
    for (let i = 0; i < 90; i++) a.update(1 / 30, st({ posture: 'rear' }));
    expect(a.posture).toBe('rear');
    a.update(1 / 30, st({ posture: 'lie' }));
    expect(a.trans?.name).toBe('rear_down');
    md.dispose();
  });

  it('bêler et coup de tête (une fois), gambader (chevreau), saut et salut du spectacle', () => {
    const md = goat('alpine', { kid: true });
    const a = md.anim;
    md.staticPose('stand');
    a.update(1 / 30, st({ bleat: true }));
    expect(a.bleatOn).toBe(true);
    for (let i = 0; i < 90; i++) a.update(1 / 30, st());
    expect(a.bleatOn).toBe(false);
    a.update(1 / 30, st({ butt: true }));
    expect(a.buttOn).toBe(true);
    for (let i = 0; i < 90; i++) a.update(1 / 30, st());
    expect(a.buttOn).toBe(false);
    for (let i = 0; i < 40; i++) a.update(1 / 30, st({ action: 'play' }));
    expect(a.w.kid_play).toBeGreaterThan(0.8);
    for (let i = 0; i < 20; i++) {
      expect(realGoatPose(md, 'jump', 1, 0.5)).toBe(true);
      a.update(1 / 30, st());
    }
    expect(a.w.jump).toBeGreaterThan(0.8);
    for (let i = 0; i < 30; i++) {
      realGoatPose(md, 'bow', 1);
      a.update(1 / 30, st());
    }
    expect(a.w.eat).toBeGreaterThan(0.8);
    expect(realGoatPose({ realGoat: false }, 'jump')).toBe(false);
    md.dispose();
  });

  it('chevreau qui tète : à côté de sa mère, tourné vers sa croupe, la bouche au trayon (hauteur suivie par l\'encolure)', () => {
    const mom = goat('alpine', { udderFill: 1 });
    const kid = goat('alpine', { kid: true });
    const mother = { position: new THREE.Vector3(0, 0, 0), heading: 0, scale: 1, model: mom, speed: 0 };
    mom.root.updateMatrixWorld(true);
    const e = { scale: 0.75, model: kid, nurseSide: 1 };
    const spot = new THREE.Vector3();
    const h = nurseSpot(e, mother, spot);
    // (tourné vers l'arrière, le museau rentré vers le ventre ; à côté d'elle, pas dedans)
    expect(Math.cos(h)).toBeLessThan(-0.85);
    expect(Math.abs(spot.x)).toBeGreaterThan(0.15);
    const teat = teatPoint(e, mother, new THREE.Vector3());
    expect(teat.y).toBeGreaterThan(0.15);
    expect(teat.y).toBeLessThan(mom.udderBone.getWorldPosition(new THREE.Vector3()).y);
    expect(teat.z).toBeLessThan(0); // (mamelle derrière le milieu de la mère)
    kid.root.scale.multiplyScalar(e.scale);
    kid.staticPose('stand');
    for (let i = 0; i < 120; i++) kid.anim.update(1 / 30, st({ action: 'nurse', nurseY: teat.y, size: e.scale }));
    expect(kid.anim.mouthW).toBeTruthy();
    expect(Math.abs(kid.anim.mouthW.y - teat.y)).toBeLessThan(0.03);
    expect(kid.anim.nurseBend).toBeGreaterThan(0); // (encolure plongée : le chevreau debout aurait la bouche trop haut)
    // (sabots au sol pendant la tétée)
    expect(lowest(kid)).toBeGreaterThan(-0.012);
    // (fin de la tétée : la tête revient)
    for (let i = 0; i < 60; i++) kid.anim.update(1 / 30, st({ size: e.scale }));
    expect(kid.anim.nurseK ?? 0).toBeLessThan(0.05);
    mom.dispose();
    kid.dispose();
  });

  // Contre-vérification : la chèvre se couchait pendant que son chevreau tétait (mamelle au sol).
  it('chevreau qui tète (comme en jeu) : la bouche au trayon, sa mère reste debout', () => {
    const rnd = Math.random;
    Math.random = () => 0.5; // (aucun tirage ne compte : pas de barrière à brouter ici)
    const ent = (md, id, x, z, heading, scale) => {
      const root = new THREE.Group();
      const sg = new THREE.Group();
      sg.scale.setScalar(scale);
      sg.add(md.root);
      root.add(sg);
      root.position.set(x, 0, z);
      root.rotation.y = heading;
      const e = { model: md, root, scale, heading, speed: 0, state: 'idle', time: 3, phase: 1.3, timer: 99, data: { id, produce: 100 }, stage: 'adult', partner: null, target: new THREE.Vector3() };
      Object.defineProperty(e, 'position', { get: () => root.position });
      return e;
    };
    const mom = ent(goat('alpine', { udderFill: 1 }), 'mo-ther', 0, 0, 0.3, 1);
    const kid = ent(goat('alpine', { kid: true }), 'ki-d1', 0.9, -0.6, 2, 0.62);
    kid.stage = 'baby';
    mom.restSeed = 0.22; // (sans le chevreau, elle se coucherait au bout de 9 s : sin(0,045 t + graine) > 0,66)
    const teat = new THREE.Vector3();
    const d = [];
    let lay = 0;
    try {
      for (let f = 0; f < 900; f++) {
        for (const e of [mom, kid]) e.time += 1 / 30;
        kid.state = 'mother';
        kid.partner = mom;
        mom.root.updateMatrixWorld(true);
        animateRealGoat(mom, 1 / 30, false);
        mom.root.updateMatrixWorld(true);
        kid.root.updateMatrixWorld(true);
        animateRealGoat(kid, 1 / 30, false);
        kid.root.updateMatrixWorld(true);
        if (kid.nursing === mom) {
          if (mom.model.anim.posture !== 'stand' || mom.model.anim.trans) lay++;
          if (f > 240 && kid.model.anim.mouthW && teatPoint(kid, mom, teat)) d.push(kid.model.anim.mouthW.distanceTo(teat));
        }
      }
    } finally {
      Math.random = rnd;
    }
    expect(d.length).toBeGreaterThan(300);
    d.sort((a, b) => a - b);
    expect(d[Math.floor(d.length / 2)]).toBeLessThan(0.06);
    expect(lay).toBe(0);
    mom.model.dispose();
    kid.model.dispose();
  }, 60000);

  it('version réduite au loin : un autre index sur la même géométrie, mèches du poil long cachées', () => {
    expect(GOAT_LOD_DIST.high).toBeGreaterThan(GOAT_LOD_DIST.low);
    const md = goat('col_noir', { sex: 'm' });
    const full = md.mesh.geometry;
    md.setLod(1);
    expect(md.mesh.geometry).not.toBe(full);
    expect(md.mesh.geometry.index.count).toBeLessThan(full.index.count * 0.6);
    expect(md.mesh.geometry.attributes.position).toBe(full.attributes.position);
    expect(md.hair.visible).toBe(false);
    md.setLod(0);
    expect(md.mesh.geometry).toBe(full);
    expect(md.hair.visible).toBe(true);
    md.dispose();
  });

  it('boîte englobante qui suit la pose (élimination hors champ) : couchée, elle descend ; dressée, elle monte', () => {
    const md = goat('alpine');
    const box = () => {
      md.root.updateMatrixWorld(true);
      md.mesh.computeBoundingBox();
      return md.mesh.boundingBox.clone();
    };
    md.staticPose('stand');
    const top = box().max.y;
    md.staticPose('lie');
    const lie = box();
    expect(lie.max.y).toBeLessThan(top - 0.1);
    expect(lie.min.y).toBeLessThan(0.03);
    md.dispose();
  });

  it('accessoires : licol, bouche et longe dans l\'ancre de la tête, encolure mesurée', () => {
    const md = goat('alpine');
    expect(md.head.name).toBe('headAnchor');
    expect(md.leashPoint.parent).toBe(md.head);
    expect(md.accessoryFit.headR).toBeGreaterThan(0.03);
    md.root.updateMatrixWorld(true);
    const lp = md.leashPoint.getWorldPosition(new THREE.Vector3());
    const hd = md.headBone.getWorldPosition(new THREE.Vector3());
    // (anneau du licol sous le menton, devant la nuque)
    expect(lp.y).toBeLessThan(hd.y);
    expect(lp.z).toBeGreaterThan(hd.z);
    md.dispose();
  });
});

describe('crédits', () => {
  it('la chèvre Rocketbox est créditée (MIT : notice de copyright et texte de la licence) dans le jeu, CREDITS.md et LICENSES', () => {
    const c = MODEL_CREDITS.find((x) => x.id === 'goat_real');
    expect(c.file).toBe('goat.glb');
    expect(c.license.name).toBe('MIT');
    expect(c.url).toContain('github.com/microsoft/Microsoft-Rocketbox');
    expect(c.notice).toBe('Copyright (c) 2020 Microsoft');
    expect(c.licenseText).toContain('Permission is hereby granted, free of charge');
    expect(c.changes.fr.length).toBeGreaterThan(20);
    expect(c.changes.en.length).toBeGreaterThan(20);
    const credits = fs.readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8');
    expect(credits).toContain('Goat_White_01');
    expect(credits).toContain('Goat_Brown_01');
    expect(credits).toContain('THE SOFTWARE IS PROVIDED "AS IS"');
    const lic = fs.readFileSync(new URL('../public/models/LICENSES/microsoft-rocketbox-goat.txt', import.meta.url), 'utf8');
    expect(lic).toContain('MIT License');
    expect(lic).toContain('Copyright (c) 2020 Microsoft');
    expect(lic).toContain('goat.glb');
  });
});

// Vache réaliste (Lyndon Daniels, CC0) et taureau (Microsoft Rocketbox, MIT), GLB chargés dans node sans textures :
// fichiers, races reconnaissables (11 races), cornes, poil long de la Highland, mamelle qui suit le lait et la traite,
// veaux, génisses et taureaux, sabots au sol dans toutes les poses et allures (races à pattes courtes au broutage
// comprises), couchée posée sur le ventre (sans flotter à la fin de « se coucher »), os jamais étirés, sabots en appui
// tenus, veau qui tète (bouche au trayon), version réduite, accessoires, crédits, repli procédural. Tout est
// déterministe (graines fixes, pas de temps fixe, aucun tirage au hasard).
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import {
  buildRealCowModel, realCowBase, REAL_COW_KEY, REAL_BULL_KEY, realCowPose, calfNurseSpot, calfTeatPoint, COW_LOD_DIST, animateRealCow, pickCowGait,
} from '../src/game/models/cowReal.js';
import { buildAnimalModel } from '../src/game/models/animalModel.js';
import {
  COW_BUILDS, cowBuild, cowBreedOfLook, cowUdderFill, cowUdderScale, cowLookOf, cowStage, cowModelKind, UDDER,
} from '../src/sim/cowLook.js';
import { SPECIES, isOffered } from '../src/sim/species.js';
import { resolveLook, createAnimal } from '../src/sim/animal.js';
import { collectProduct, tickProduce } from '../src/sim/farm.js';
import { MODELS } from '../src/game/assets.js';
import { MODEL_CREDITS } from '../src/ui/credits.js';
import { portraitSpec } from '../src/game/thumbScenes.js';
import { loadRealCowGltf, COW_FILE, BULL_FILE, glbJson } from './fixtures/realCowGltf.js';

const BREEDS = SPECIES.cow.breeds.map((b) => b.id);
const fixed = () => 0.42; // (tirages fixes : rien au hasard)
let G;
beforeAll(async () => {
  G = await loadRealCowGltf();
}, 120000);

const lookOf = (breed, o = {}) => ({
  ...resolveLook('cow', breed, o.color ?? 0), seed: 4242, sex: o.sex ?? 'f', ...(o.calf ? { calf: true } : {}), ...(o.young ? { young: true } : {}),
  ...(o.udderFill !== undefined ? { udderFill: o.udderFill } : {}),
});
const cow = (breed, o = {}) => buildRealCowModel(lookOf(breed, o), breed, G);
const STAGES = [{ sex: 'f' }, { sex: 'm' }, { calf: true }, { young: true }];

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
  return (i) => P.part[i * 4 + 3] > 0.6 && P.part[i * 4 + 1] < 0.1;
};
/**
 * Sommets qui portent la vache couchée : tronc, épaules, cuisses et avant-bras repliés (os dominant) — comme la pose
 * « lie » du GLB (tools/vache/make_cow.py, lie_gp) et les points de contact du jeu (RealCowAnim.contactClass).
 */
const supportOnly = (md) => {
  const P = md.anim.base.prim;
  const names = md.anim.base.names;
  return (i) => /^(root|pelvis|spine\d|chest|humerus|radius|metacarpus|femur)/.test(names[P.domBone[i]]);
};
/** Sole la plus basse d'un pied (repère du monde). */
const soleLow = (md, k) => {
  md.root.updateMatrixWorld(true);
  let lo = Infinity;
  for (const p of md.anim.solePts[k]) lo = Math.min(lo, p.clone().applyMatrix4(md.legs[k].paw.matrixWorld).y);
  return lo;
};
const st = (o = {}) => ({ v: 0, moving: false, size: 1, posture: 'stand', action: null, ...o });

describe('fichiers de la vache et du taureau', () => {
  it('cow.glb (Lyndon Daniels) : os, clips, mamelle, compression, version réduite, textures propres, poids', () => {
    const buf = fs.readFileSync(COW_FILE);
    expect(buf.length).toBeLessThan(850_000);
    const json = glbJson(buf);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']));
    expect(json.skins[0].joints.length).toBe(39);
    const names = new Set(json.nodes.map((n) => n.name));
    for (const b of ['root', 'pelvis', 'chest', 'neck1', 'neck3', 'head', 'jaw', 'hornL', 'hornR', 'earL', 'udder', 'tail1', 'tail6',
      'scapL', 'humerusL', 'radiusL', 'metacarpusL', 'toesL', 'femurR', 'tibiaR', 'metatarsusR', 'htoesR']) expect(names, b).toContain(b);
    const clips = json.animations.map((a) => a.name);
    for (const c of ['idle', 'walk', 'trot', 'run', 'graze', 'eat', 'lie_down', 'lie', 'ruminate', 'get_up', 'sleep', 'moo', 'milk', 'suckle',
      'tail_swish', 'calf_play']) expect(clips, c).toContain(c);
    // (aucune échelle animée ; aucune translation d'os sauf la racine : un os qui se déplace s'étire)
    for (const a of json.animations) {
      for (const ch of a.channels) {
        expect(ch.target.path).not.toBe('scale');
        if (ch.target.path === 'translation') expect(json.nodes[ch.target.node].name, a.name).toBe('root');
      }
    }
    expect(json.meshes.find((m) => m.name === 'cow_lod')?.extras?.lod).toBe(true);
    // (robe : carte de grain et masque — taches, peau, couleurs gardées — dans l'emplacement « occlusion »)
    const coat = json.materials.find((m) => m.name === 'cow_coat');
    expect(coat.occlusionTexture).toBeTruthy();
    expect(json.materials.some((m) => m.name === 'cow_eye')).toBe(true);
    const ext = json.scenes[json.scene ?? 0].extras.cow;
    expect(ext.kind).toBe('cow');
    expect(ext.naturalSpeeds.walk).toBeGreaterThan(0.8);
    expect(ext.naturalSpeeds.run).toBeGreaterThan(ext.naturalSpeeds.trot);
  });

  it('bull.glb (Rocketbox) : os aux noms des moutons et des chèvres, scrotum, cornes longues en cible de forme, yeux peints notés', () => {
    const buf = fs.readFileSync(BULL_FILE);
    expect(buf.length).toBeLessThan(700_000);
    const json = glbJson(buf);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']));
    expect(json.skins[0].joints.length).toBe(40);
    const names = new Set(json.nodes.map((n) => n.name));
    for (const b of ['root', 'head', 'jaw', 'hornL', 'hornR', 'scrotum', 'tail1', 'toesL', 'htoesR']) expect(names, b).toContain(b);
    const m = json.meshes.find((x) => x.name === 'cow');
    expect(m.extras.targetNames).toEqual(['horns_long']);
    expect(json.meshes.find((x) => x.name === 'cow_lod')?.extras?.lod).toBe(true);
    const ext = json.scenes[json.scene ?? 0].extras.cow;
    expect(ext.kind).toBe('bull');
    expect(ext.eyes.length).toBe(2);
    for (const e of ext.eyes) expect(Math.abs(e[0])).toBeGreaterThan(0.08);
    for (const a of json.animations) {
      for (const ch of a.channels) {
        expect(ch.target.path).not.toBe('scale');
        if (ch.target.path === 'translation') expect(json.nodes[ch.target.node].name, a.name).toBe('root');
      }
    }
  });

  it('les clés des modèles sont cow_real et bull_real (jamais « cow » : la vache procédurale reste le repli)', () => {
    expect(REAL_COW_KEY).toBe('cow_real');
    expect(REAL_BULL_KEY).toBe('bull_real');
    expect(MODELS.cow_real).toBe('cow.glb');
    expect(MODELS.bull_real).toBe('bull.glb');
    expect(MODELS.cow).toBeUndefined();
  });

  it('sans les GLB (chargement, fichier absent) : pas de vache réaliste, buildAnimalModel prend la procédurale', () => {
    expect(buildRealCowModel(lookOf('normande'), 'normande')).toBeNull();
    const src = fs.readFileSync(new URL('../src/game/models/animalModel.js', import.meta.url), 'utf8');
    expect(src).toMatch(/speciesId === 'cow' && !opts\.procedural\) \{\s*const real = buildRealCowModel\(look, breedOfAnimal\);\s*if \(real\) return real;/);
    // (taureau sans son GLB : la vache procédurale, jamais la vache de Lyndon Daniels avec une mamelle)
    expect(buildRealCowModel(lookOf('normande', { sex: 'm' }), 'normande', { cow: G.cow })).toBeNull();
  });

  it('les clips du jeu n\'ont aucune translation d\'os hors de la racine', () => {
    for (const g of [G.cow, G.bull]) {
      const base = realCowBase(g);
      for (const clip of Object.values(base.clips)) {
        for (const t of clip.tracks) {
          const [node, prop] = t.name.split('.');
          expect(prop).not.toBe('scale');
          if (prop === 'position') expect(node).toBe('root');
        }
      }
    }
  });
});

describe('races, cornes, poil long, veaux et taureaux', () => {
  it('chaque race du jeu a son gabarit ; race des anciennes sauvegardes retrouvée par la robe ; croisé', () => {
    for (const b of BREEDS) expect(COW_BUILDS[b], b).toBeTruthy();
    const old = resolveLook('cow', 'hereford', 0);
    delete old.breed;
    expect(cowBreedOfLook(old)).toBe('hereford');
    expect(cowBuild({ ...resolveLook('cow', 'highland', 0) }, { breed: 'mix' }).breed).toBe('highland');
    expect(cowBuild({ coat: 0x123456, secondary: 0x654321 }, { breed: 'mix' }).breed).toBe('normande');
    // (Hérens : noire ou rouge foncé)
    expect(SPECIES.cow.breeds.find((b) => b.id === 'herens').colors.length).toBe(2);
  });

  it('races reconnaissables : robes, gabarits, cornes, mamelle', () => {
    const B = (b, o = {}) => cowBuild(lookOf(b, o), { breed: b, sex: o.sex ?? 'f' });
    const lum = (h) => 0.2126 * ((h >> 16) & 255) + 0.7152 * ((h >> 8) & 255) + 0.0722 * (h & 255);
    const hol = B('holstein');
    expect(hol.pattern).toBe('pie');
    expect(lum(hol.colors.base)).toBeLessThan(40); // (pie NOIRE)
    expect(lum(hol.colors.white)).toBeGreaterThan(220);
    expect(hol.whiteLegs).toBe(1);
    expect(hol.legs).toBeGreaterThan(1); // (grande)
    expect(hol.udderBase).toBeGreaterThan(1.1); // (grosse mamelle)
    const nor = B('normande');
    expect(nor.pattern).toBe('pie');
    expect(nor.lunettes).toBe(1);
    expect(nor.brindle).toBeGreaterThan(0.3);
    expect((nor.colors.base >> 16) & 255).toBeGreaterThan((nor.colors.base & 255) + 40); // (pie rouge)
    const cha = B('charolaise');
    expect(cha.pattern).toBe('solid');
    expect(cha.hornSize).toBe(0); // (sans cornes)
    expect(lum(cha.colors.base)).toBeGreaterThan(200); // (blanc crème)
    expect(cha.girth).toBeGreaterThan(1.12); // (massive)
    const hig = B('highland');
    expect(hig.hair).toBeGreaterThan(0.1); // (poil long)
    expect(hig.fringe).toBeGreaterThan(0.1); // (frange sur les yeux)
    expect(hig.hornLong).toBe(1); // (très longues cornes en lyre)
    expect(hig.legs).toBeLessThan(0.9); // (petite)
    const bre = B('bretonne_pie_noire');
    expect(bre.pattern).toBe('pie');
    expect(bre.pie).toBeLessThan(hol.pie); // (plus de noir que la Prim'Holstein)
    expect(SPECIES.cow.breeds.find((b) => b.id === 'bretonne_pie_noire').scale).toBeLessThan(0.8); // (toute petite)
    const her = B('herens');
    expect(her.legs).toBeLessThan(0.9);
    expect(her.girth).toBeGreaterThan(1.1); // (trapue)
    expect(her.hornFwd).toBeGreaterThan(0.2); // (cornes de lutteuse, en avant)
    expect(lum(B('herens', { color: 1 }).colors.base)).toBeLessThan(60); // (rouge foncé)
    expect(lum(B('wagyu').colors.base)).toBeLessThan(40);
    const can = B('canadienne');
    expect(lum(can.colors.base)).toBeLessThan(40); // (brun noir, même si la couleur du jeu est un brun clair)
    expect(can.muzzleRing).toBe(1); // (mufle clair)
    expect(lum(can.colors.tan)).toBeGreaterThan(120);
    const hfd = B('hereford');
    expect(hfd.pattern).toBe('hereford');
    expect(lum(hfd.colors.white)).toBeGreaterThan(200);
    expect(B('angus').hornSize).toBe(0);
    expect(B('retinta').hornLong).toBe(1);
  });

  it('veau : sans cornes, tête plus grosse, pattes plus longues, mamelle petite ; génisse entre les deux ; taureau : son modèle', () => {
    for (const b of ['normande', 'highland', 'hereford']) {
      const f = cowBuild(lookOf(b), { breed: b });
      const m = cowBuild(lookOf(b), { breed: b, sex: 'm' });
      const calf = cowBuild(lookOf(b), { breed: b, stage: 'baby' });
      const young = cowBuild(lookOf(b), { breed: b, stage: 'young' });
      expect(calf.hornSize, b).toBe(0);
      expect(young.hornSize, b).toBeGreaterThan(0);
      expect(young.hornSize, b).toBeLessThan(f.hornSize);
      expect(calf.head).toBeGreaterThan(1.2 * f.head);
      expect(calf.legs).toBeGreaterThan(1.1 * f.legs);
      expect(calf.udder).toBe(UDDER.small);
      expect(young.milker).toBe(false);
      expect(f.milker).toBe(true);
      expect(m.kind).toBe('bull');
      expect(m.milker).toBe(false);
      expect(f.kind).toBe('cow');
      expect(calf.kind).toBe('cow');
    }
    // (veau mâle : la vache de Lyndon Daniels jusqu'à l'âge adulte, puis le taureau)
    expect(cowModelKind({ sex: 'm', calf: true })).toBe('cow');
    expect(cowModelKind({ sex: 'm', young: true })).toBe('cow');
    expect(cowModelKind({ sex: 'm' })).toBe('bull');
    expect(cowModelKind({ sex: 'f' })).toBe('cow');
    expect(cowBuild({ ...lookOf('normande'), horns: 'none' }, { breed: 'normande' }).hornSize).toBe(0);
  });

  it('les 11 races, leurs veaux, génisses et taureaux se construisent : cornes par l\'échelle de leurs os, poil long en mèches', () => {
    for (const b of BREEDS) {
      for (const o of STAGES) {
        const md = cow(b, o);
        const tag = `${b} ${JSON.stringify(o)}`;
        expect(md.realCow, tag).toBe(true);
        const B = md.build;
        expect(md.kind, tag).toBe(o.sex === 'm' && !o.calf && !o.young ? 'bull' : 'cow');
        const horn = md.bone('hornL').scale;
        if (B.hornSize > 0) expect(Math.max(horn.x, horn.y, horn.z), tag).toBeGreaterThan(B.hornSize * 0.99);
        else expect(horn.x, tag).toBeLessThan(1e-3);
        if (md.kind === 'bull') expect(md.mesh.morphTargetInfluences[0], tag).toBe(B.hornLong);
        expect(md.stage, tag).toBe(o.calf ? 'baby' : o.young ? 'young' : 'adult');
        expect(!!md.hair, tag).toBe(B.hair > 0.005 || B.fringe > 0.005);
        // (mèches : au plus 900 sur le corps et 140 pour la frange, trois segments chacune)
        if (md.hair) expect(md.hair.geometry.userData.cards, tag).toBeLessThanOrEqual(1040);
        if (md.kind === 'cow') expect(md.eyes, tag).toBeTruthy();
        md.dispose();
      }
    }
  });

  // (les cornes « longues » de la vache, droites et dressées comme des pointes, sont refaites en lyre : sur le côté,
  // puis relevées, la pointe vers le haut)
  it('cornes en lyre (Highland, Retinta) : larges sur le côté, pointes relevées ; courtes ailleurs', () => {
    const tips = (md) => {
      const P = md.anim.base.prim;
      const pos = md.mesh.geometry.attributes.position;
      let span = 0;
      let tip = null;
      for (let i = 0; i < pos.count; i++) {
        if (P.part[i * 4] < 0.5 || pos.getX(i) <= 0) continue;
        if (pos.getX(i) > span) span = pos.getX(i);
        if (P.aux[i * 4 + 2] > 0.97 && (!tip || pos.getY(i) > tip.y)) tip = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      }
      return { span, tip };
    };
    const n = cow('normande');
    const h = cow('highland');
    const r = cow('retinta');
    const [tn, th, tr] = [tips(n), tips(h), tips(r)];
    expect(th.span).toBeGreaterThan(tn.span + 0.18);
    expect(tr.span).toBeGreaterThan(tn.span + 0.08);
    // (pointe plus haute que la base de la corne, à l'aplomb du côté : relevée en lyre)
    const base = h.anim.base.heads[h.anim.base.index.get('hornL')];
    expect(th.tip.y).toBeGreaterThan(base.y + 0.1);
    expect(th.tip.x).toBeGreaterThan(base.x + 0.15);
    for (const md of [n, h, r]) md.dispose();
  });

  it('apparence d\'une vache du jeu : stade, sexe, race (jamais « mix ») ; gabarit 3D par stade', () => {
    const a = createAnimal({ species: 'cow', breed: 'hereford', ageDays: 2, seed: 5, sex: 'm', rng: fixed });
    const lk = cowLookOf(a);
    expect(lk.calf).toBe(true);
    expect(lk.sex).toBe('m');
    expect(lk.breed).toBe('hereford');
    const mixed = { ...a, breed: 'mix', look: { ...a.look, breed: undefined } };
    expect(cowLookOf(mixed).breed).toBe('hereford');
    expect(cowStage('senior')).toBe('adult');
    expect(cowStage('baby')).toBe('baby');
  });
});

describe('mamelle qui suit le lait et la traite', () => {
  it('lait du jeu → mamelle : vide après la traite, pleine quand le lait est prêt ; taureau et génisse : petite', () => {
    const a = createAnimal({ species: 'cow', breed: 'holstein', ageDays: 80, seed: 7, sex: 'f', rng: fixed });
    a.produce = 0;
    expect(cowUdderFill(a)).toBe(0);
    tickProduce(a, 30);
    expect(cowUdderFill(a)).toBeGreaterThan(0);
    tickProduce(a, 100);
    expect(cowUdderFill(a)).toBe(1);
    const profile = { animals: [a], stats: {}, money: 0, coins: 0 };
    expect(collectProduct(profile, a).ok).toBe(true);
    expect(cowUdderFill(a)).toBe(0);
    const bull = createAnimal({ species: 'cow', breed: 'holstein', ageDays: 80, seed: 7, sex: 'm', rng: fixed });
    bull.produce = 100;
    expect(cowUdderFill(bull)).toBe(0);
    const B = cowBuild(lookOf('holstein'), { breed: 'holstein' });
    expect(cowUdderScale(B, 0)).toBeCloseTo(UDDER.empty * B.udderBase, 5);
    expect(cowUdderScale(B, 1)).toBeCloseTo(UDDER.full * B.udderBase, 5);
    expect(cowUdderScale(cowBuild(lookOf('holstein'), { breed: 'holstein', stage: 'young' }), 1)).toBe(UDDER.small);
  });

  it('modèle : l\'os de la mamelle grossit avec le lait, en douceur ; traite (debout, elle mâche) ; couchée, aplatie', () => {
    const md = cow('holstein', { udderFill: 1 });
    const full = cowUdderScale(md.build, 1);
    const empty = cowUdderScale(md.build, 0);
    expect(md.udderBone.scale.y).toBeCloseTo(full, 3);
    md.udderFill = 0;
    md.anim.update(1 / 30, st());
    expect(md.udderBone.scale.y).toBeGreaterThan(empty + 0.2);
    for (let i = 0; i < 300; i++) md.anim.update(1 / 30, st({ action: 'milk' }));
    expect(md.udderBone.scale.y).toBeCloseTo(empty, 2);
    expect(md.anim.w.milk).toBeGreaterThan(0.9);
    md.setUdder(1);
    for (let i = 0; i < 150; i++) md.anim.update(1 / 30, st({ posture: 'lie' }));
    expect(md.udderBone.scale.y).toBeLessThan(0.5 * full);
    expect(md.udderBone.scale.x).toBeGreaterThan(full);
    md.dispose();
  });

  it('trayons : le point de la traite (main de la joueuse) est sous le ventre, entre les postérieurs', () => {
    const md = cow('normande', { udderFill: 1 });
    md.staticPose('stand');
    md.root.updateMatrixWorld(true);
    const u = md.udderPoint.getWorldPosition(new THREE.Vector3());
    expect(u.y).toBeGreaterThan(0.35);
    expect(u.y).toBeLessThan(0.8);
    expect(u.z).toBeLessThan(-0.3);
    expect(Math.abs(u.x)).toBeLessThan(0.12);
    md.dispose();
  });

  it('vignette du portrait : la mamelle (au quart près) fait partie de la clé de la vache seulement', () => {
    const a = createAnimal({ species: 'cow', breed: 'normande', ageDays: 80, seed: 9, sex: 'f', rng: fixed });
    a.produce = 60;
    expect(portraitSpec(a, 'adult').udder).toBe(0.5);
    const bull = createAnimal({ species: 'cow', breed: 'normande', ageDays: 80, seed: 9, sex: 'm', rng: fixed });
    expect(portraitSpec(bull, 'adult').udder).toBeUndefined();
  });
});

describe('au sol', () => {
  it('debout : les 11 races, veaux, génisses et taureaux posent les sabots sur le sol, sans s\'y enfoncer', () => {
    for (const b of BREEDS) {
      for (const o of STAGES) {
        const md = cow(b, o);
        md.staticPose('stand');
        const lo = lowest(md);
        expect(lo, `${b} ${JSON.stringify(o)}`).toBeGreaterThan(-0.01);
        expect(lo, `${b} ${JSON.stringify(o)}`).toBeLessThan(0.012);
        md.dispose();
      }
    }
  });

  // (couchée, la vache repose sur son poitrail et ses avant-bras repliés : ramenée jusqu'au ventre, ses antérieurs
  // repliés s'enfonçaient de 4 à 8 cm sous l'herbe)
  it('couchée, endormie, ruminant : posée sur le poitrail et les avant-bras repliés (ni en l\'air, ni dedans), mamelle pleine comprise', () => {
    for (const b of ['holstein', 'highland', 'charolaise', 'herens']) {
      for (const o of [{ udderFill: 1 }, { calf: true }, { sex: 'm' }]) {
        for (const posture of ['lie', 'sleep']) {
          const md = cow(b, o);
          md.staticPose('stand');
          for (let i = 0; i < 200; i++) md.anim.update(1 / 30, st({ posture, ruminate: posture === 'lie' }));
          const tag = `${b} ${JSON.stringify(o)} ${posture}`;
          expect(md.anim.posture, tag).toBe(posture);
          // (sabots repliés : à peine dans l'herbe)
          expect(lowest(md), tag).toBeGreaterThan(-0.025);
          const rest = lowest(md, 1, supportOnly(md)) - md.anim.skirt;
          expect(rest, tag).toBeGreaterThan(-0.015);
          expect(rest, tag).toBeLessThan(0.015);
          // (le ventre, au-dessus des antérieurs repliés, à quelques centimètres du sol au plus)
          expect(lowest(md, 1, trunkOnly(md)) - md.anim.skirt, tag).toBeLessThan(0.09);
          md.dispose();
        }
      }
    }
  });

  // Défaut de la page de comparaison : à la fin de « se coucher », la vache flottait 2 à 3 cm avant de se poser.
  it('se coucher : à la fin de la transition, elle est déjà posée (pas de vache qui flotte puis tombe)', () => {
    for (const b of ['normande', 'highland', 'holstein']) {
      const md = cow(b, { udderFill: 1 });
      const a = md.anim;
      md.staticPose('stand');
      let endGap = null;
      let lastTrans = null;
      for (let i = 0; i < 260; i++) {
        a.update(1 / 30, st({ posture: 'lie' }));
        const rest = lowest(md, 2, supportOnly(md)) - a.skirt;
        if (a.trans?.name === 'lie_down') lastTrans = rest;
        else if (lastTrans !== null && endGap === null) endGap = lastTrans;
        if (i > 200) expect(Math.abs(rest), `${b} couchée ${i}`).toBeLessThan(0.02);
      }
      expect(endGap, b).not.toBeNull();
      expect(endGap, `${b} fin de « se coucher »`).toBeLessThan(0.02);
      md.dispose();
    }
  });

  // Défaut de la page de comparaison : au broutage, les races à pattes courtes avaient les sabots avant 3,6 à 6,2 cm
  // au-dessus du sol (le corps était relevé pour sortir le museau de l'herbe).
  it('brouter, manger, meugler, traite : sabots au sol (races à pattes courtes comprises), museau au-dessus de l\'herbe', () => {
    for (const b of ['highland', 'herens', 'hereford', 'holstein']) {
      for (const o of [{}, { calf: true }]) {
        for (const action of ['graze', 'eat', 'milk', null]) {
          const md = cow(b, o);
          md.staticPose('stand');
          let lo = Infinity;
          let front = -Infinity;
          for (let f = 0; f < 150; f++) {
            md.anim.update(1 / 30, st({ action, moo: f === 5 && !action }));
            if (f > 40 && f % 6 === 0) {
              lo = Math.min(lo, lowest(md));
              front = Math.max(front, Math.min(soleLow(md, 0), soleLow(md, 1)));
            }
          }
          const tag = `${b} ${JSON.stringify(o)} ${action}`;
          expect(lo, tag).toBeGreaterThan(-0.012);
          expect(front, `${tag} sabots avant`).toBeLessThan(0.012);
          md.dispose();
        }
      }
    }
  });

  it('allures (pas, trot, galop) : jamais sous le sol', () => {
    for (const b of ['normande', 'highland']) {
      for (const o of [{}, { calf: true }, { sex: 'm' }]) {
        const md = cow(b, o);
        md.staticPose('stand');
        const size = o.calf ? 0.5 : 1;
        for (const v of [1.0, 2.4, 4.2]) {
          let lo = Infinity;
          for (let f = 0; f < 90; f++) {
            md.anim.update(1 / 30, st({ v: v / size, moving: true, size }));
            md.root.position.z += v / 30;
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
    for (const [b, o] of [['normande', {}], ['highland', { calf: true }], ['hereford', { sex: 'm' }]]) {
      const md = cow(b, o);
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
  });

  // Sabots posés qui glissent : vitesse horizontale d'un sabot en appui, rapportée à celle de la vache.
  it.each([['normande', {}], ['highland', {}], ['hereford', { sex: 'm' }]])('%s : les sabots posés ne glissent pas (pas, trot, galop) et ne sautent pas', (b, o) => {
    for (const [v, max] of [[1.0, 0.06], [2.4, 0.1], [4.2, 0.1]]) {
      const md = cow(b, o);
      md.staticPose('stand');
      // (le bout de l'onglon, comme le footLock : le sabot qui se décolle roule sur sa pince, le milieu de la sole avance
      // alors de 1 à 2 cm sans glisser)
      const feet = md.legs.map((l, k) => () => {
        let lo = Infinity;
        for (const p of md.anim.solePts[k]) lo = Math.min(lo, p.clone().applyMatrix4(l.paw.matrixWorld).y);
        return { c: md.anim.toePts[k].clone().applyMatrix4(l.paw.matrixWorld), lo };
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
            if (prev[l].lo < 0.01 && f[l].lo < 0.01) {
              const d = Math.hypot(f[l].c.x - prev[l].c.x, f[l].c.z - prev[l].c.z);
              jump = Math.max(jump, d);
              dist[l] += d;
              stance[l] += dt;
            }
          }
        }
        prev = f;
      }
      expect(jump, `${b} ${v} saut d'un sabot posé`).toBeLessThan(0.008);
      const slip = Math.max(...dist.map((d, l) => (stance[l] > 0.05 ? d / stance[l] / v : 0)));
      expect(slip, `${b} ${v} glissement`).toBeLessThan(max);
      md.dispose();
    }
  }, 120000);

  it('arrêtée depuis le pas : aucune patte ne saute, aucun sabot ne glisse, elle finit d\'aplomb', () => {
    const md = cow('normande');
    md.staticPose('stand');
    const dt = 1 / 30;
    let v = 1.0;
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
    for (let i = 0; i < 260; i++) {
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
          if (prev[l].lo < 0.008 && f[l].lo < 0.008) slide[l] += Math.hypot(f[l].c.x - prev[l].c.x, f[l].c.z - prev[l].c.z);
        }
      }
      prev = f;
    }
    expect(jump).toBeLessThan(0.08);
    expect(Math.max(...slide)).toBeLessThan(0.035);
    expect(Math.max(...md.anim.lockAng.map(Math.abs))).toBeLessThan(0.04);
    md.dispose();
  }, 60000);
});

describe('animation', () => {
  it('allure d\'une vache choisie avec hystérésis (seuils d\'un bovin)', () => {
    expect(pickCowGait('idle', 1)).toBe('walk');
    expect(pickCowGait('walk', 1.7)).toBe('walk');
    expect(pickCowGait('walk', 2.0)).toBe('trot');
    expect(pickCowGait('trot', 3.2)).toBe('trot');
    expect(pickCowGait('trot', 3.6)).toBe('run');
    expect(pickCowGait('run', 3.1)).toBe('run');
    expect(pickCowGait('run', 2.8)).toBe('trot');
  });

  it('se coucher puis se relever en bovin : transitions jouées une fois, posture qui suit', () => {
    const md = cow('normande');
    const a = md.anim;
    md.staticPose('stand');
    a.update(1 / 30, st({ posture: 'lie' }));
    expect(a.trans?.name).toBe('lie_down');
    for (let i = 0; i < 150; i++) a.update(1 / 30, st({ posture: 'lie' }));
    expect(a.posture).toBe('lie');
    expect(a.trans).toBeNull();
    a.update(1 / 30, st({ posture: 'sleep' }));
    expect(a.posture).toBe('sleep');
    a.update(1 / 30, st({ posture: 'stand' }));
    expect(a.trans?.name).toBe('get_up');
    for (let i = 0; i < 150; i++) a.update(1 / 30, st({ posture: 'stand' }));
    expect(a.posture).toBe('stand');
    md.dispose();
  });

  it('meugler (une fois), se retourner contre une mouche, queue qui chasse les mouches, gambader (veau), brosse, salut', () => {
    const md = cow('normande', { calf: true });
    const a = md.anim;
    md.staticPose('stand');
    a.update(1 / 30, st({ moo: true }));
    expect(a.mooOn).toBe(true);
    for (let i = 0; i < 100; i++) a.update(1 / 30, st());
    expect(a.mooOn).toBe(false);
    a.update(1 / 30, st({ fly: true }));
    expect(a.flyOn).toBe('tail_swish');
    for (let i = 0; i < 120; i++) a.update(1 / 30, st());
    expect(a.flyOn).toBeNull();
    // (queue : balancement procédural, de la base au toupillon)
    const tail = md.tailBones[md.tailBones.length - 1];
    const q0 = new THREE.Quaternion();
    let moved = 0;
    for (let i = 0; i < 200; i++) {
      a.update(1 / 30, st({ flies: true }));
      if (i === 0) q0.copy(tail.quaternion);
      moved = Math.max(moved, tail.quaternion.angleTo(q0));
    }
    expect(moved).toBeGreaterThan(0.1);
    for (let i = 0; i < 50; i++) a.update(1 / 30, st({ action: 'play' }));
    expect(a.w.calf_play).toBeGreaterThan(0.8);
    for (let i = 0; i < 30; i++) {
      expect(realCowPose(md, 'bow', 1)).toBe(true);
      a.update(1 / 30, st());
    }
    expect(a.w.eat).toBeGreaterThan(0.8);
    expect(realCowPose({ realCow: false }, 'bow')).toBe(false);
    md.dispose();
    const ad = cow('holstein');
    ad.staticPose('stand');
    for (let i = 0; i < 60; i++) ad.anim.update(1 / 30, st({ action: 'brush' }));
    expect(ad.anim.brushK).toBeGreaterThan(0.9);
    ad.dispose();
  });

  it('manger à l\'auge : la bouche monte à la hauteur du foin du râtelier', () => {
    const md = cow('normande');
    md.staticPose('stand');
    for (let i = 0; i < 150; i++) md.anim.update(1 / 30, st({ action: 'eat', reachY: 0.62 }));
    expect(md.anim.mouthW).toBeTruthy();
    expect(Math.abs(md.anim.mouthW.y - 0.62)).toBeLessThan(0.05);
    expect(lowest(md)).toBeGreaterThan(-0.012);
    md.dispose();
  });

  it('veau qui tète : à côté de sa mère, tourné vers sa croupe, la bouche au trayon (hauteur suivie par l\'encolure)', () => {
    const mom = cow('normande', { udderFill: 1 });
    const calf = cow('normande', { calf: true });
    const mother = { position: new THREE.Vector3(0, 0, 0), heading: 0, scale: 1, model: mom, speed: 0 };
    mom.staticPose('stand');
    mom.root.updateMatrixWorld(true);
    const e = { scale: 0.5, model: calf, nurseSide: 1 };
    const spot = new THREE.Vector3();
    const h = calfNurseSpot(e, mother, spot);
    expect(Math.cos(h)).toBeLessThan(-0.85);
    expect(Math.abs(spot.x)).toBeGreaterThan(0.25);
    const teat = calfTeatPoint(e, mother, new THREE.Vector3());
    expect(teat.y).toBeGreaterThan(0.3);
    expect(teat.z).toBeLessThan(0);
    calf.root.scale.multiplyScalar(e.scale);
    calf.staticPose('stand');
    for (let i = 0; i < 150; i++) calf.anim.update(1 / 30, st({ action: 'nurse', nurseY: teat.y, size: e.scale }));
    expect(calf.anim.mouthW).toBeTruthy();
    expect(Math.abs(calf.anim.mouthW.y - teat.y)).toBeLessThan(0.04);
    expect(calf.anim.w.suckle).toBeGreaterThan(0.8);
    expect(lowest(calf)).toBeGreaterThan(-0.012);
    for (let i = 0; i < 60; i++) calf.anim.update(1 / 30, st({ size: e.scale }));
    expect(calf.anim.reachK ?? 0).toBeLessThan(0.05);
    mom.dispose();
    calf.dispose();
  });

  it('veau qui tète (comme en jeu) : la bouche au trayon, sa mère reste debout', () => {
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
    const mom = ent(cow('normande', { udderFill: 1 }), 'mo-ther', 0, 0, 0.3, 1);
    const calf = ent(cow('normande', { calf: true }), 'ca-lf1', 1.2, -0.9, 2, 0.5);
    calf.stage = 'baby';
    mom.restSeed = 0.4;
    const teat = new THREE.Vector3();
    const d = [];
    let lay = 0;
    for (let f = 0; f < 900; f++) {
      for (const e of [mom, calf]) e.time += 1 / 30;
      calf.state = 'mother';
      calf.partner = mom;
      mom.root.updateMatrixWorld(true);
      animateRealCow(mom, 1 / 30, false);
      mom.root.updateMatrixWorld(true);
      calf.root.updateMatrixWorld(true);
      animateRealCow(calf, 1 / 30, false);
      calf.root.updateMatrixWorld(true);
      if (calf.nursing === mom) {
        if (mom.model.anim.posture !== 'stand' || mom.model.anim.trans) lay++;
        if (f > 300 && calf.model.anim.mouthW && calfTeatPoint(calf, mom, teat)) d.push(calf.model.anim.mouthW.distanceTo(teat));
      }
    }
    expect(d.length).toBeGreaterThan(300);
    d.sort((a, b) => a - b);
    expect(d[Math.floor(d.length / 2)]).toBeLessThan(0.08);
    expect(lay).toBe(0);
    mom.model.dispose();
    calf.model.dispose();
  }, 60000);

  it('version réduite au loin : un autre index sur la même géométrie (yeux compris), mèches du poil long cachées', () => {
    expect(COW_LOD_DIST.high).toBeGreaterThan(COW_LOD_DIST.low);
    const md = cow('highland');
    const full = md.mesh.geometry;
    const eyes = md.eyes.geometry;
    md.setLod(1);
    expect(md.mesh.geometry).not.toBe(full);
    expect(md.mesh.geometry.index.count).toBeLessThan(full.index.count * 0.6);
    expect(md.mesh.geometry.attributes.position).toBe(full.attributes.position);
    expect(md.eyes.geometry).not.toBe(eyes);
    expect(md.hair.visible).toBe(false);
    md.setLod(0);
    expect(md.mesh.geometry).toBe(full);
    expect(md.hair.visible).toBe(true);
    md.dispose();
    const bull = cow('normande', { sex: 'm' });
    const bf = bull.mesh.geometry;
    bull.setLod(1);
    expect(bull.mesh.geometry.index.count).toBeLessThan(bf.index.count * 0.6);
    bull.dispose();
  });

  it('boîte englobante qui suit la pose (élimination hors champ) : couchée, elle descend', () => {
    const md = cow('normande');
    const box = () => {
      md.root.updateMatrixWorld(true);
      md.mesh.computeBoundingBox();
      return md.mesh.boundingBox.clone();
    };
    md.staticPose('stand');
    const top = box().max.y;
    const bottom = box().min.y;
    md.staticPose('lie');
    const lie = box();
    // (couchée, la tête reste haute : c'est le dos qui descend ; la boîte suit, elle ne garde pas la pose debout)
    expect(lie.max.y).toBeLessThan(top);
    expect(lie.min.y).toBeLessThan(0.04);
    expect(bottom).toBeLessThan(0.04);
    const md2 = cow('normande');
    md2.staticPose('stand');
    md2.root.updateMatrixWorld(true);
    const back = md2.bone('spine2').getWorldPosition(new THREE.Vector3()).y;
    md2.staticPose('lie');
    md2.root.updateMatrixWorld(true);
    expect(md2.bone('spine2').getWorldPosition(new THREE.Vector3()).y).toBeLessThan(back - 0.4);
    md2.dispose();
    md.dispose();
  });

  it('accessoires : licol, bouche et longe dans l\'ancre de la tête, encolure mesurée, longueur mesurée', () => {
    for (const o of [{}, { sex: 'm' }, { calf: true }]) {
      const md = cow('normande', o);
      expect(md.head.name).toBe('headAnchor');
      expect(md.neck.name).toBe('neckAnchor');
      expect(md.leashPoint.parent).toBe(md.head);
      expect(md.accessoryFit.headR).toBeGreaterThan(0.05);
      md.root.updateMatrixWorld(true);
      const lp = md.leashPoint.getWorldPosition(new THREE.Vector3());
      const hd = md.headBone.getWorldPosition(new THREE.Vector3());
      expect(lp.y).toBeLessThan(hd.y);
      expect(lp.z).toBeGreaterThan(hd.z);
      // (vache réaliste : 2,1 à 2,6 m du nez à la pointe des fesses, à sa taille)
      if (!o.calf) {
        expect(md.bodyLength).toBeGreaterThan(2.0);
        expect(md.bodyLength).toBeLessThan(2.7);
      }
      md.dispose();
    }
  });
});

describe('shaders', () => {
  it('les shaders de la robe et de son ombre restent bien formés (accolades et parenthèses équilibrées)', async () => {
    const { cowMaterial, makeCowUniforms } = await import('../src/game/models/cowCoat.js');
    const out = cowMaterial(null, makeCowUniforms());
    for (const m of [out.mat, out.depth]) {
      const lib = m.isMeshDepthMaterial ? THREE.ShaderLib.depth : THREE.ShaderLib.standard;
      const sh = { vertexShader: lib.vertexShader, fragmentShader: lib.fragmentShader, uniforms: {} };
      m.onBeforeCompile(sh);
      for (const src of [sh.vertexShader, sh.fragmentShader]) {
        const count = (c) => src.split(c).length - 1;
        expect(count('{')).toBe(count('}'));
        expect(count('(')).toBe(count(')'));
      }
      // (le masque de la robe est dans l'emplacement « occlusion » : jamais utilisé comme occlusion)
      if (!m.isMeshDepthMaterial) expect(m.aoMapIntensity).toBe(0);
    }
  });
});

describe('crédits et espèce proposée', () => {
  it('la vache de Lyndon Daniels (CC0) et le taureau Rocketbox (MIT : notice et texte) sont crédités dans le jeu, CREDITS.md et LICENSES', () => {
    const c = MODEL_CREDITS.find((x) => x.id === 'cow_real');
    expect(c.file).toBe('cow.glb');
    expect(c.license.name).toBe('CC0 1.0');
    expect(c.author).toContain('Lyndon Daniels');
    expect(c.url).toContain('opengameart.org/content/realtime-ranchers-3d-model-pack');
    const b = MODEL_CREDITS.find((x) => x.id === 'bull_real');
    expect(b.file).toBe('bull.glb');
    expect(b.license.name).toBe('MIT');
    expect(b.notice).toBe('Copyright (c) 2020 Microsoft');
    expect(b.licenseText).toContain('Permission is hereby granted, free of charge');
    for (const x of [c, b]) {
      expect(x.changes.fr.length).toBeGreaterThan(20);
      expect(x.changes.en.length).toBeGreaterThan(20);
    }
    const credits = fs.readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8');
    expect(credits).toContain('Lyndon Daniels');
    expect(credits).toContain('Bull_Brown_01');
    expect(credits).toContain('`cow.glb`');
    expect(credits).toContain('`bull.glb`');
    const lic = fs.readFileSync(new URL('../public/models/LICENSES/microsoft-rocketbox-taureau.txt', import.meta.url), 'utf8');
    expect(lic).toContain('MIT License');
    expect(lic).toContain('Copyright (c) 2020 Microsoft');
    expect(lic).toContain('bull.glb');
    const lyn = fs.readFileSync(new URL('../public/models/LICENSES/lyndon-daniels-vache.txt', import.meta.url), 'utf8');
    expect(lyn).toContain('CC0');
    expect(lyn).toContain('cow.glb');
  });

  it('la vache est proposée comme nouvel animal (son modèle réaliste est en ligne : OFFERED_SPECIES)', () => {
    expect(isOffered('cow')).toBe(true);
  });
});

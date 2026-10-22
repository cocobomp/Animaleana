// Chats réalistes (chat de Claire pour les adultes, chaton de FainoDS, GLB chargés dans node sans textures) : fichiers,
// races (gabarits reconnaissables), chatons, yeux dans les orbites, pieds au sol dans les poses et allures, robes,
// tours du spectacle, équipement, crédits CC-BY. Tout est déterministe (graines fixes, pas de temps fixe, aucun
// Math.random : animateRealCat n'est pas appelé, seul le mixeur l'est, avec des états donnés).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { buildRealCatModel, realCatReady, REAL_CAT_KEYS, pickCatGait, catPosturePath, realCatPose, POSTURE_CLIP, realCatBase } from '../src/game/models/catReal.js';
import { catCoatPlan } from '../src/game/models/catCoat.js';
import { buildGear, removeGear } from '../src/game/gearModels.js';
import { buildAccessories } from '../src/game/models/salon.js';
import { catBuild, catLookWithBreed, CAT_BUILDS } from '../src/sim/catLook.js';
import { SPECIES } from '../src/sim/species.js';
import { resolveLook, stageLook } from '../src/sim/animal.js';
import { MODELS } from '../src/game/assets.js';
import { MODEL_CREDITS } from '../src/ui/credits.js';
import { loadRealCatGltf, CAT_FILES, glbJson } from './fixtures/realCatGltf.js';

// (machine chargée : construire et animer un chat prend parfois plusieurs secondes)
vi.setConfig({ testTimeout: 120000 });

const BREEDS = SPECIES.cat.breeds.map((b) => b.id);
const breedOf = (id) => SPECIES.cat.breeds.find((b) => b.id === id);
let G;
beforeAll(async () => {
  G = { adult: await loadRealCatGltf('adult'), kitten: await loadRealCatGltf('kitten') };
}, 120000);

const lookOf = (breed, colorIndex = 0) => catLookWithBreed({ ...resolveLook('cat', breed, colorIndex), seed: 4242 }, breed);
const cat = (breed, stage = 'adult', colorIndex = 0) => buildRealCatModel(lookOf(breed, colorIndex), stage, G[stage === 'baby' ? 'kitten' : 'adult']);

const _v = new THREE.Vector3();
/** Point le plus bas de la peau (repère du chat). */
function lowest(md, step = 2) {
  md.root.updateMatrixWorld(true);
  const m = md.coatMesh;
  let lo = Infinity;
  for (let i = 0; i < m.geometry.attributes.position.count; i += step) {
    m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
    lo = Math.min(lo, _v.y);
  }
  return lo;
}

/** Centres et rayons des deux yeux (sommets animés de la pièce des yeux, séparés par côté), repère du monde. */
function eyes(md) {
  md.root.updateMatrixWorld(true);
  const m = md.eyeMesh;
  const n = m.geometry.attributes.position.count;
  const pts = [[], []];
  for (let i = 0; i < n; i++) {
    m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
    pts[m.geometry.attributes.position.getX(i) > 0 ? 0 : 1].push(_v.clone());
  }
  return pts.map((p) => {
    const c = p.reduce((s, x) => s.add(x), new THREE.Vector3()).multiplyScalar(1 / p.length);
    return { c, r: Math.max(...p.map((x) => x.distanceTo(c))) };
  });
}

/** Marche du chat (comme dans le jeu : il avance, le mixeur tient les pieds posés). */
function stride(md, v, frames, dt, each) {
  for (let f = 0; f < frames; f++) {
    md.anim.update(dt, { v, moving: true, posture: 'stand' });
    md.root.position.z += v * dt;
    md.root.updateMatrixWorld(true);
    each?.(f);
  }
}

describe('fichiers des chats réalistes', () => {
  it.each([['adult', 43, 1_000_000], ['kitten', 41, 850_000]])('%s : os, clips, compression, vitesses naturelles, version allégée', (kind, joints, maxBytes) => {
    const buf = fs.readFileSync(CAT_FILES[kind]);
    expect(buf.length).toBeLessThan(maxBytes);
    const json = glbJson(buf);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']));
    expect(json.skins[0].joints.length).toBe(joints);
    const names = new Set(json.nodes.map((n) => n.name));
    for (const b of ['root', 'pelvis', 'head', 'neck2', 'tail1', 'tail8', 'ear1L', 'ear2R', 'radiusL', 'toesR', 'femurL', 'htoesR', 'haunchL', 'haunchR']) expect(names, b).toContain(b);
    const clips = json.animations.map((a) => a.name);
    for (const c of ['idle', 'walk', 'trot', 'run', 'balance', 'sit', 'groom', 'lie', 'sleep', 'eat', 'stretch', 'tail_up', 'highfive', 'jump', 'sit_down', 'stand_up', 'lie_down', 'get_up', 'curl_up']) expect(clips, c).toContain(c);
    // canaux inutiles retirés : ni échelle animée, ni translation ailleurs qu'à la racine
    for (const a of json.animations) {
      for (const ch of a.channels) {
        expect(ch.target.path).not.toBe('scale');
        if (ch.target.path === 'translation') expect(json.nodes[ch.target.node].name).toBe('root');
      }
    }
    const extras = json.scenes[json.scene ?? 0].extras?.cat;
    expect(extras.naturalSpeeds.walk).toBeGreaterThan(0.3);
    expect(extras.naturalSpeeds.trot).toBeGreaterThan(extras.naturalSpeeds.walk);
    expect(extras.naturalSpeeds.run).toBeGreaterThan(extras.naturalSpeeds.trot);
    expect(json.materials.map((m) => m.name)).toEqual(expect.arrayContaining(['cat_coat', 'cat_eye']));
    // version allégée pour le lointain : moins d'un tiers des triangles
    const full = json.meshes.find((m) => m.name !== 'cat_lod');
    const lod = json.meshes.find((m) => m.name === 'cat_lod');
    const tris = (m) => m.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0);
    expect(lod).toBeTruthy();
    expect(tris(lod)).toBeLessThan(tris(full) * 0.34);
  });

  it('les clés des modèles sont cat_adult et cat_kitten (jamais « cat » : le chat procédural reste le repli)', () => {
    expect(REAL_CAT_KEYS).toEqual({ adult: 'cat_adult', kitten: 'cat_kitten' });
    expect(MODELS.cat_adult).toBe('cat_adult.glb');
    expect(MODELS.cat_kitten).toBe('cat_kitten.glb');
    expect(MODELS.cat).toBeUndefined();
  });

  it('sans GLB chargé, pas de chat réaliste : le jeu prend le chat procédural (repli pendant le chargement)', () => {
    expect(realCatReady('adult')).toBe(false);
    expect(buildRealCatModel(lookOf('europeen'), 'adult')).toBeNull();
    expect(buildRealCatModel(lookOf('europeen'), 'baby')).toBeNull();
  });
});

describe('construction et poses tenues', () => {
  it.each(BREEDS)('%s : adulte, chaton et jeune se construisent ; debout, assis, couché, en boule : posés sur le sol', (breed) => {
    for (const stage of ['adult', 'baby', 'young']) {
      const md = cat(breed, stage);
      expect(md, `${breed} ${stage}`).toBeTruthy();
      expect(md.realCat).toBe(true);
      expect(md.cat).toBeUndefined();
      expect(md.kind).toBe(stage === 'baby' ? 'kitten' : 'adult');
      for (const k of ['stand', 'sit', 'lie', 'curl']) {
        md.staticPose(k);
        const lo = lowest(md);
        // (le poil long s'écrase un peu sur le sol)
        expect(lo, `${breed} ${stage} ${k}`).toBeGreaterThan(-0.004 - 0.4 * Math.max(0, md.build.fur));
        expect(lo, `${breed} ${stage} ${k}`).toBeLessThan(0.02);
      }
      md.dispose();
    }
  });

  it('même chat, même graine : la même géométrie (déterministe)', () => {
    const a = cat('maine_coon');
    const b = cat('maine_coon');
    const pa = a.coatMesh.geometry.attributes.position.array;
    const pb = b.coatMesh.geometry.attributes.position.array;
    expect(pa.length).toBe(pb.length);
    let d = 0;
    for (let i = 0; i < pa.length; i += 7) d = Math.max(d, Math.abs(pa[i] - pb[i]));
    expect(d).toBe(0);
    a.dispose();
    b.dispose();
  });
});

describe('races reconnaissables (par les os et le shader)', () => {
  it('15 races, chacune son gabarit', () => {
    expect(Object.keys(CAT_BUILDS).sort()).toEqual([...BREEDS].sort());
  });

  it('gabarits : persan face plate, maine coon grand avec collerette et pinceaux, sphynx nu, scottish oreilles pliées, devon grandes oreilles frisé, bobtail queue courte', () => {
    const B = Object.fromEntries(BREEDS.map((b) => [b, catBuild(lookOf(b), 'adult')]));
    const eu = B.europeen;
    expect(B.persan.flat).toBeGreaterThan(0.5);
    expect(B.persan.fur).toBeGreaterThan(eu.fur + 0.01);
    expect(B.persan.earSize).toBeLessThan(0.8);
    expect(B.maine_coon.tufts).toBeGreaterThan(0.5);
    expect(B.maine_coon.ruff).toBeGreaterThan(eu.ruff);
    expect(B.maine_coon.legs * B.maine_coon.back).toBeGreaterThan(eu.legs * eu.back);
    expect(B.norvegien.fur).toBeGreaterThan(eu.fur + 0.01);
    expect(B.sphynx.hairless).toBeTruthy();
    expect(B.sphynx.wrinkles).toBeTruthy();
    expect(B.sphynx.earSize).toBeGreaterThan(1.3);
    expect(B.scottish_fold.ears).toBe('fold');
    expect(BREEDS.filter((b) => B[b].ears === 'fold')).toEqual(['scottish_fold']);
    expect(B.devon_rex.earSize).toBeGreaterThan(1.5);
    expect(B.devon_rex.curly).toBeTruthy();
    expect(B.bobtail.stub).toBeTruthy();
    expect(B.bobtail.tailLen).toBeLessThan(0.5);
    expect(B.british.plush).toBeTruthy();
    expect(B.british.headW).toBeGreaterThan(eu.headW);
    expect(B.siamois.snout).toBeGreaterThan(eu.snout);
  });

  it('robes : points et yeux bleus (siamois, sacré de Birmanie avec ses gants blancs, ragdoll), rosettes, tiqueté, yeux cuivre du chartreux', () => {
    const plan = (b) => catCoatPlan(lookOf(b), breedOf(b), false);
    const blue = (hex) => (hex & 255) > ((hex >> 16) & 255) + 40;
    for (const b of ['siamois', 'sacre_birmanie', 'ragdoll']) {
      expect(plan(b).pattern, b).toBe('points');
      expect(plan(b).points, b).toBe(1);
      expect(blue(plan(b).eye), b).toBe(true);
    }
    expect(plan('sacre_birmanie').white).toBe('gloves');
    expect(plan('bengal').pattern).toBe('rosettes');
    expect(plan('abyssin').pattern).toBe('ticked');
    expect(plan('sphynx').hairless).toBe(1);
    expect(plan('devon_rex').curly).toBe(1);
    const copper = (hex) => ((hex >> 16) & 255) > 180 && (hex & 255) < 80;
    expect(copper(plan('chartreux').eye)).toBe(true);
    // chaton : points aussi marqués (sinon siamois, sacré de Birmanie et ragdoll se ressemblaient tous), masque à peine
    // plus petit
    const k = catCoatPlan(lookOf('siamois'), breedOf('siamois'), true);
    expect(k.points).toBe(1);
    expect(k.maskScale).toBeLessThan(1);
    expect(k.maskScale).toBeGreaterThan(0.85);
  });

  it('chaton : modèle du chaton, traits de la race adoucis ; le jeune prend le modèle adulte', () => {
    for (const b of ['persan', 'maine_coon', 'sphynx', 'devon_rex']) {
      const A = catBuild(lookOf(b), 'adult');
      const K = catBuild(lookOf(b), 'baby');
      const Y = catBuild(lookOf(b), 'young');
      expect(K.model, b).toBe('kitten');
      expect(Y.model, b).toBe('adult');
      expect(Math.abs(K.earSize - 1), b).toBeLessThan(Math.abs(A.earSize - 1) + 1e-9);
      expect(Math.abs(K.flat), b).toBeLessThanOrEqual(Math.abs(A.flat));
    }
  });
});

describe('yeux dans les orbites', () => {
  it('l\'œil reste à sa place dans la tête de la race (face plate, grosse tête, chatons), dans toutes les poses', () => {
    const rel = (md) => {
      const head = md.head.getWorldPosition(new THREE.Vector3());
      const e = eyes(md);
      const s = md.build.head;
      return { d: e.map((x) => x.c.distanceTo(head) / s), r: e.map((x) => x.r / s), gap: e[0].c.distanceTo(e[1].c) / s };
    };
    for (const stage of ['adult', 'baby']) {
      const ref = cat('europeen', stage);
      ref.staticPose('stand');
      const r0 = rel(ref);
      for (const b of ['persan', 'british', 'maine_coon', 'siamois', 'sphynx', 'devon_rex', 'scottish_fold']) {
        const md = cat(b, stage);
        for (const pose of ['stand', 'sit', 'lie', 'curl']) {
          md.staticPose(pose);
          const r = rel(md);
          const name = `${b} ${stage} ${pose}`;
          for (let i = 0; i < 2; i++) {
            // (face plate, museau long : l'œil se déplace un peu avec la face, 25 % au plus)
            expect(r.d[i] / r0.d[i], name).toBeGreaterThan(0.75);
            expect(r.d[i] / r0.d[i], name).toBeLessThan(1.25);
            // le globe ne gonfle ni ne s'écrase
            expect(r.r[i] / r0.r[i], name).toBeGreaterThan(0.8);
            expect(r.r[i] / r0.r[i], name).toBeLessThan(1.25);
          }
          expect(r.gap / r0.gap, name).toBeGreaterThan(0.8);
          expect(r.gap / r0.gap, name).toBeLessThan(1.3);
        }
        md.dispose();
      }
      ref.dispose();
    }
  }, 120000);

  it('paupières : ouvertes debout, fermées en boule', () => {
    const md = cat('europeen');
    md.staticPose('curl');
    expect(md.lids.length).toBe(2);
    for (const l of md.lids) expect(l.scale.x).toBeGreaterThan(0.5);
    md.anim.blink = 0;
    md.anim.blinkT = 10;
    md.staticPose('stand');
    for (const l of md.lids) expect(l.scale.x).toBeLessThan(0.01);
    md.dispose();
  });
});

describe('allures', () => {
  it('allure choisie avec hystérésis (pas de va-et-vient au seuil)', () => {
    expect(pickCatGait('idle', 0)).toBe('idle');
    expect(pickCatGait('idle', 0.5)).toBe('walk');
    expect(pickCatGait('walk', 1.1)).toBe('walk');
    expect(pickCatGait('walk', 1.3)).toBe('trot');
    expect(pickCatGait('trot', 1.0)).toBe('trot'); // (redescend sous 0,95 seulement)
    expect(pickCatGait('trot', 0.9)).toBe('walk');
    expect(pickCatGait('trot', 3.2)).toBe('run');
    expect(pickCatGait('run', 2.8)).toBe('run');
    expect(pickCatGait('run', 2.4)).toBe('trot');
    expect(pickCatGait('idle', 8)).toBe('run');
  });

  it.each([['europeen', 'adult'], ['maine_coon', 'adult'], ['persan', 'adult'], ['devon_rex', 'adult'], ['europeen', 'baby'], ['british', 'baby']])('%s (%s) : au pas, au trot et au galop, jamais sous le sol ; au pas un pied toujours posé', (b, stage) => {
    const md = cat(b, stage);
    md.staticPose('stand');
    const crush = 0.006 + 0.4 * Math.max(0, md.build.fur);
    for (const [gait, v] of [['walk', 0.5], ['trot', 1.8], ['run', 4.5]]) {
      let lo = Infinity;
      let hi = -Infinity;
      let same = true;
      stride(md, v, 150, 1 / 60, (f) => {
        if (f < 60 || f % 3) return;
        same &&= md.anim.gait === gait;
        const y = lowest(md, 4);
        lo = Math.min(lo, y);
        hi = Math.max(hi, y);
      });
      const name = `${b} ${stage} ${gait}`;
      expect(same, name).toBe(true);
      expect(lo, name).toBeGreaterThan(-crush);
      if (gait === 'walk') expect(hi, name).toBeLessThan(0.02);
    }
    md.dispose();
  }, 120000);

  it.each(['europeen', 'maine_coon', 'persan', 'sphynx'])('%s : les pieds posés ne patinent pas au pas ni au trot', (b) => {
    const md = cat(b);
    md.staticPose('stand');
    const slip = (v) => {
      const feet = ['toesL', 'toesR', 'htoesL', 'htoesR'].map((n) => md.bone(n));
      const dt = 1 / 120;
      const rows = [];
      stride(md, v, 360, dt, (f) => {
        if (f >= 120) rows.push(feet.map((x) => x.getWorldPosition(new THREE.Vector3())));
      });
      let worst = 0;
      for (let f = 0; f < 4; f++) {
        const ys = rows.map((r) => r[f].y);
        const thr = Math.min(...ys) + 0.003;
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
    expect(slip(0.5), `${b} pas`).toBeLessThan(0.2);
    expect(slip(1.8), `${b} trot`).toBeLessThan(0.2);
    md.dispose();
  }, 120000);

  it('en équilibre sur une barrière : le clip « balance », pattes resserrées, au pas lent', () => {
    const md = cat('europeen');
    md.staticPose('stand');
    for (let f = 0; f < 90; f++) md.anim.update(1 / 60, { v: 0.3, moving: true, balance: true, posture: 'stand' });
    expect(md.anim.gait).toBe('balance');
    expect(md.anim.w.balance).toBeGreaterThan(0.9);
    md.dispose();
  });
});

describe('postures et passages', () => {
  it('chemin le plus court : debout → en boule passe par assis et couché ; en boule → debout par couché', () => {
    expect(catPosturePath('stand', 'curl').map((e) => e[2])).toEqual(['sit_down', 'lie_down', 'curl_up']);
    expect(catPosturePath('curl', 'stand').map((e) => e[1])).toEqual(['lie', 'stand']);
    expect(catPosturePath('stand', 'groom').map((e) => e[1])).toEqual(['sit', 'groom']);
    expect(catPosturePath('sit', 'sit')).toEqual([]);
    expect(Object.keys(POSTURE_CLIP)).toEqual(['stand', 'sit', 'groom', 'lie', 'curl', 'crouch']);
  });

  it.each(['europeen', 'persan', 'bobtail'])('%s : chaque posture voulue est atteinte par ses passages, posée sur le sol', (b) => {
    for (const stage of ['adult', 'baby']) {
      const md = cat(b, stage);
      md.staticPose('stand');
      for (const posture of ['sit', 'groom', 'sit', 'lie', 'curl', 'lie', 'stand', 'crouch', 'stand']) {
        let lo = Infinity;
        for (let f = 0; f < 240 && (md.anim.posture !== posture || md.anim.trans); f++) {
          md.anim.update(1 / 30, { v: 0, moving: false, posture, sleeping: posture === 'curl' });
          if (f % 4 === 0) lo = Math.min(lo, lowest(md, 6));
        }
        for (let f = 0; f < 60; f++) md.anim.update(1 / 30, { v: 0, moving: false, posture, sleeping: posture === 'curl' });
        const name = `${b} ${stage} ${posture}`;
        expect(md.anim.posture, name).toBe(posture);
        expect(md.anim.w[POSTURE_CLIP[posture]], name).toBeGreaterThan(0.85);
        lo = Math.min(lo, lowest(md, 4));
        expect(lo, name).toBeGreaterThan(-0.006 - 0.4 * Math.max(0, md.build.fur));
        expect(lowest(md, 4), name).toBeLessThan(0.02);
      }
      md.dispose();
    }
  }, 120000);

  it('au réveil il s\'étire ; quand il suit quelqu\'un, la queue se dresse', () => {
    const md = cat('europeen');
    md.staticPose('stand');
    md.anim.oneShot = 'stretch';
    md.anim.oneShotAge = 0;
    for (let f = 0; f < 20; f++) md.anim.update(1 / 30, { v: 0, moving: false, posture: 'stand' });
    expect(md.anim.w.stretch).toBeGreaterThan(0.6);
    const tip = () => md.tailTip.getWorldPosition(new THREE.Vector3()).y;
    md.anim.oneShot = null;
    md.staticPose('stand');
    for (let f = 0; f < 60; f++) md.anim.update(1 / 30, { v: 0, moving: false, posture: 'stand' });
    const low = tip();
    for (let f = 0; f < 60; f++) md.anim.update(1 / 30, { v: 0, moving: false, posture: 'stand', following: true });
    expect(tip()).toBeGreaterThan(low + 0.05);
    md.dispose();
  });

  it.each(['sit', 'down', 'highfive', 'paw', 'bow', 'jump'])('tour « %s » du spectacle : joué par les clips du chat, au-dessus du sol', (kind) => {
    for (const stage of ['adult', 'baby']) {
      const md = cat('europeen', stage);
      md.staticPose('stand');
      const sg = new THREE.Group();
      sg.add(md.root);
      for (let f = 0; f < 30; f++) {
        expect(realCatPose(md, kind, 1, sg, kind === 'jump' ? f / 30 : null)).toBe(true);
        md.anim.update(1 / 30, { v: 0, moving: false, posture: 'stand' });
      }
      const clip = { sit: 'sit', down: 'lie', highfive: 'highfive', paw: 'highfive', bow: 'stretch', jump: 'jump' }[kind];
      expect(md.anim.w[clip], `${kind} ${stage}`).toBeGreaterThan(0.85);
      expect(lowest(md, 4), `${kind} ${stage}`).toBeGreaterThan(-0.006);
      md.dispose();
    }
    // un autre animal : rien
    expect(realCatPose({ realDog: true }, 'sit', 1)).toBe(false);
  });
});

describe('équipement ajusté', () => {
  it('collier plat sur l\'encolure mesurée (porté par l\'os du cou), accessoires du salon sur la tête et au cou ; tout se retire', () => {
    for (const [b, stage] of [['europeen', 'adult'], ['maine_coon', 'adult'], ['persan', 'adult'], ['siamois', 'baby']]) {
      const md = cat(b, stage);
      const look = lookOf(b);
      const g = buildGear(md, look, { neck: { item: 'collar', color: 'red' } });
      expect(g, b).toBeTruthy();
      const ring = md.dogFit.collar;
      expect(ring.bone, b).toBe(md.neck);
      expect(ring.bone.children.length, b).toBeGreaterThan(0);
      // la bande entoure le cou : son rayon suit la coupe mesurée (chat : 2 à 7 cm)
      expect(ring.rx, b).toBeGreaterThan(0.012);
      // (poil long : le collier s'enfonce un peu dans la collerette, couchée sous sa bande — catFinish.test.js — ; chaton :
      // modèle à la taille d'un adulte)
      expect(ring.rx, b).toBeLessThan((md.kitten ? 0.075 : 0.055) + 1.0 * (Math.max(0, md.build.fur) + md.build.ruff));
      const torus = ring.bone.children.find((o) => !o.isBone && o.children?.length).children[0];
      torus.geometry.computeBoundingBox();
      const size = torus.geometry.boundingBox.getSize(new THREE.Vector3());
      expect(size.z, b).toBeLessThan(size.x * 0.5);
      const acc = buildAccessories(md, look, { neck: { id: 'bandana', color: 'pink' }, head: { id: 'ribbon', color: 'blue' } });
      expect(acc.length, b).toBeGreaterThan(0);
      removeGear(g);
      md.dispose();
    }
  });
});

describe('crédits CC-BY', () => {
  it('les deux chats sont crédités (auteur, titre, lien, licence, modifications) dans le jeu, CREDITS.md et LICENSES', () => {
    const credits = Object.fromEntries(MODEL_CREDITS.map((c) => [c.id, c]));
    expect(credits.cat_adult.author).toContain('claireanne3d');
    expect(credits.cat_adult.title).toBe('Cat game asset');
    expect(credits.cat_adult.url).toContain('cat-game-asset-7a0c1a65e18747799af9fe9481f1bdb2');
    expect(credits.cat_kitten.author).toContain('FainoDS');
    expect(credits.cat_kitten.title).toBe('Kitten');
    expect(credits.cat_kitten.url).toContain('kitten-4ae3704cd65b423ab994545988d4db1a');
    for (const c of [credits.cat_adult, credits.cat_kitten]) {
      expect(c.license.name).toBe('CC BY 4.0');
      expect(c.changes.fr.length).toBeGreaterThan(20);
      expect(c.changes.en.length).toBeGreaterThan(20);
    }
    const md = fs.readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8');
    expect(md).toContain('cat_adult.glb');
    expect(md).toContain('cat_kitten.glb');
    expect(md).toContain('claireanne3d');
    for (const f of ['claireanne3d-cat-game-asset.txt', 'fainods-kitten.txt']) {
      const txt = fs.readFileSync(new URL(`../public/models/LICENSES/${f}`, import.meta.url), 'utf8');
      expect(txt).toContain('creativecommons.org/licenses/by/4.0');
      expect(txt).toContain('Modifications');
    }
  });
});

describe('corrections de la contre-vérification (beauté et jeu)', () => {
  /** Position d'un os dans le repère du chat (sans sa taille ni sa place dans le monde). */
  const local = (md, name) => {
    md.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
    return md.bone(name).getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
  };

  it('stade de l\'animal dans son apparence : chaton, jeune ; lapereau ; poulain, chiot', () => {
    const cat0 = { species: 'cat', ageDays: 0, lifespanYears: 15, look: { coat: 'x' } };
    expect(stageLook(cat0).kitten).toBe(true);
    const adult = stageLook({ ...cat0, ageDays: 80 * 30 });
    expect(adult.kitten).toBeUndefined();
    expect(adult.young).toBeUndefined();
    expect(stageLook({ species: 'rabbit', ageDays: 0, lifespanYears: 9, look: {} }).kit).toBe(true);
    expect(stageLook({ species: 'horse', ageDays: 0, lifespanYears: 30, look: {} }).foal).toBe(true);
    expect(stageLook({ species: 'dog', ageDays: 0, lifespanYears: 13, look: {} }).puppy).toBe(true);
    // (l'apparence d'origine n'est pas modifiée)
    expect(cat0.look.kitten).toBeUndefined();
  });

  it('mixeur forcé de tout réécrire après les mesures : un os resté dans une autre pose revient à celle du clip', () => {
    const a = cat('bengal');
    const b = cat('bengal');
    for (const md of [a, b]) md.staticPose('stand');
    // (os laissé basculé comme après la mesure de la toilette)
    a.bone('pelvis').rotateX(0.4);
    a.anim.resync();
    // le mixeur n'écrit un os que si sa valeur change : ses valeurs gardées sont effacées, il réécrit tout
    const binds = a.anim.mixer._bindings ?? [];
    expect(binds.length).toBeGreaterThan(10);
    for (const pm of binds) expect(Number.isNaN(pm.buffer[pm.valueSize])).toBe(true);
    for (const md of [a, b]) for (let f = 0; f < 30; f++) md.anim.update(1 / 30, { v: 0, moving: false, posture: 'stand' });
    for (const n of ['pelvis', 'spine2', 'humerusL', 'femurR']) {
      expect(a.bone(n).quaternion.angleTo(b.bone(n).quaternion), n).toBeLessThan(1e-3);
    }
    for (const md of [a, b]) md.dispose();
  });

  it('oreilles du chaton liées à leurs os (dos du pavillon et bord repris) ; celles de Claire inchangées', () => {
    const kb = realCatBase(G.kitten, 'kitten');
    const ab = realCatBase(G.adult, 'adult');
    expect(kb.earFixed).toBeGreaterThan(300);
    expect(ab.earFixed).toBe(0);
    expect(ab.earRaw).toBeNull();
    // plus aucun sommet de la tête seule dans un triangle de l'oreille au-delà de la moitié de sa longueur
    const coat = kb.prims.coat;
    const v = new THREE.Vector3();
    for (let s = 0; s < 2; s++) {
      const bp = kb.heads[kb.index.get(s ? 'ear1R' : 'ear1L')];
      const ax = kb.earTip[s].clone().sub(bp);
      const elen = ax.length();
      ax.normalize();
      let bad = 0;
      for (let t = 0; t < coat.index.length; t += 3) {
        const tri = [coat.index[t], coat.index[t + 1], coat.index[t + 2]];
        const e = tri.map((i) => kb.W.ear[i * 2 + s]);
        if (Math.max(...e) < 0.9) continue;
        for (const i of tri) if (kb.W.ear[i * 2 + s] < 0.02 && v.fromArray(coat.pos, i * 3).sub(bp).dot(ax) / elen > 0.5) bad++;
      }
      expect(bad, `oreille ${s}`).toBe(0);
    }
  });

  it('moustaches : fines lignes claires liées à l\'os de la tête, cachées au loin ; rares et courtes chez le sphynx', () => {
    const count = (md) => {
      let w = null;
      md.bone('head').traverse((o) => { if (o.userData?.whiskers) w = o; });
      return w;
    };
    const eu = cat('europeen');
    const sp = cat('sphynx');
    const we = count(eu);
    const ws = count(sp);
    expect(we).toBeTruthy();
    expect(we.isLineSegments).toBe(true);
    expect(we.geometry.attributes.position.count).toBeGreaterThan(ws.geometry.attributes.position.count);
    eu.setLod(1, true);
    expect(we.visible).toBe(false);
    eu.setLod(0, true);
    expect(we.visible).toBe(true);
    eu.dispose();
    sp.dispose();
  });

  it('british et chartreux différents : british rond et trapu (tête large, museau court), chartreux plus long ; robes et yeux', () => {
    const br = catBuild(lookOf('british'), 'adult');
    const ch = catBuild(lookOf('chartreux'), 'adult');
    expect(br.headW / ch.headW).toBeGreaterThan(1.15);
    expect(ch.snout / br.snout).toBeGreaterThan(1.5);
    expect(ch.legs / br.legs).toBeGreaterThan(1.1);
    expect(br.earSize).toBeLessThan(ch.earSize - 0.2);
    const pb = catCoatPlan(lookOf('british'), breedOf('british'), false);
    const pc = catCoatPlan(lookOf('chartreux'), breedOf('chartreux'), false);
    expect(pb.base === pc.base && pb.eye === pc.eye).toBe(false);
  });

  it('collier du chaton sur l\'encolure, derrière la tête (plus un cerceau autour du crâne)', () => {
    const md = cat('europeen', 'baby');
    md.staticPose('stand');
    const g = buildGear(md, lookOf('europeen'), { neck: { item: 'collar', color: 'red' } });
    const ring = md.dogFit.collar;
    const torus = ring.bone.children.find((o) => !o.isBone && o.children?.length).children[0];
    md.root.updateMatrixWorld(true);
    const inv = new THREE.Matrix4().copy(md.root.matrixWorld).invert();
    const c = torus.getWorldPosition(new THREE.Vector3()).applyMatrix4(inv);
    expect(c.z).toBeLessThan(local(md, 'head').z);
    removeGear(g);
    md.dispose();
  });

  it('chaton couché « en pain » (coudes bas, pattes repliées) et en boule tête baissée', () => {
    const md = cat('europeen', 'baby');
    md.staticPose('lie');
    const lieHead = local(md, 'head').y;
    // (couché comme une otarie : coude à 9 cm, pattes tendues devant)
    expect(local(md, 'radiusL').y).toBeLessThan(0.075);
    expect(local(md, 'metacarpusL').z).toBeLessThan(local(md, 'toesL').z + 0.05);
    md.staticPose('curl');
    // (il dormait assis, tête dressée : plus haute en boule que couché)
    expect(local(md, 'head').y).toBeLessThan(lieHead - 0.015);
    md.dispose();
  });
});

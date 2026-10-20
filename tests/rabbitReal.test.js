// Lapins réalistes (lapin gris de Dakota.Hinkle pour toutes les races sauf le bélier, bélier de FourthGreen ; GLB chargés
// dans node sans textures) : fichiers (os jamais étirés, aucune translation d'os sauf la racine, pieds jamais sous le
// sol), races reconnaissables, robes, lapereaux, pieds posés sans glissement aux allures, postures et passages, poses
// imposées des activités, équipement, crédits CC-BY. Tout est déterministe (graines fixes, pas de temps fixe, aucun
// Math.random : animateRealRabbit n'est pas appelé, seul le mixeur l'est, avec des états donnés).
import { describe, it, expect, beforeAll, vi } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import {
  buildRealRabbitModel, realRabbitReady, REAL_RABBIT_KEYS, pickRabbitGait, rabbitPosturePath, realRabbitPose, POSTURE_CLIP,
  pickRabbitIdle, realRabbitBase,
} from '../src/game/models/rabbitReal.js';
import { rabbitCoatPlan } from '../src/game/models/rabbitCoat.js';
import { rabbitBuild, rabbitLookWithBreed, rabbitBreedGuess, RABBIT_BUILDS } from '../src/sim/rabbitLook.js';
import { buildAnimalModel } from '../src/game/models/animalModel.js';
import { buildAccessories } from '../src/game/models/salon.js';
import { SPECIES } from '../src/sim/species.js';
import { resolveLook } from '../src/sim/animal.js';
import { MODELS } from '../src/game/assets.js';
import { MODEL_CREDITS } from '../src/ui/credits.js';
import { loadRealRabbitGltf, RABBIT_FILES, glbJson } from './fixtures/realRabbitGltf.js';

// (machine chargée : construire et animer un lapin prend parfois plusieurs secondes)
vi.setConfig({ testTimeout: 180000 });

const BREEDS = SPECIES.rabbit.breeds.map((b) => b.id);
let G;
beforeAll(async () => {
  G = { up: await loadRealRabbitGltf('up'), lop: await loadRealRabbitGltf('lop') };
}, 180000);

const lookOf = (breed, colorIndex = 0) => rabbitLookWithBreed({ ...resolveLook('rabbit', breed, colorIndex), seed: 4242 }, breed);
const rabbit = (breed, stage = 'adult', colorIndex = 0) => {
  const look = lookOf(breed, colorIndex);
  return buildRealRabbitModel(look, stage, G[rabbitBuild(look, stage).model]);
};

const _v = new THREE.Vector3();
/** Point le plus bas de la peau (repère du lapin). */
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

/** Longueur des oreilles (base → point le plus éloigné), au repos de la race. */
function earLength(md) {
  const base = md.ears[0].getWorldPosition(new THREE.Vector3());
  const m = md.coatMesh;
  const si = m.geometry.attributes.skinIndex;
  const sw = m.geometry.attributes.skinWeight;
  const ear = md.bones.indexOf(md.ears[0]);
  const chain = new Set([ear, ...md.ears[0].userData.chain.map((b) => md.bones.indexOf(b))]);
  let d = 0;
  for (let i = 0; i < si.count; i++) {
    if (!(chain.has(si.getX(i)) && sw.getX(i) > 0.6)) continue;
    m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
    d = Math.max(d, _v.distanceTo(base));
  }
  return d;
}

describe('fichiers des lapins réalistes', () => {
  it.each([['up', 29], ['lop', 31]])('%s : os, clips, compression, vitesses naturelles, version allégée', (kind, joints) => {
    const buf = fs.readFileSync(RABBIT_FILES[kind]);
    expect(buf.length).toBeLessThan(800_000);
    const json = glbJson(buf);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']));
    expect(json.skins[0].joints.length).toBe(joints);
    const clips = json.animations.map((a) => a.name);
    for (const c of ['idle', 'hop', 'lope', 'run', 'jump', 'sit', 'stand', 'lie', 'sleep', 'groom', 'sniff', 'eat', 'binky', 'hide', 'held',
      'sit_down', 'stand_up', 'rear_up', 'rear_down', 'lie_down', 'get_up']) expect(clips, c).toContain(c);
    // aucune échelle animée, aucune translation ailleurs qu'à la racine (les os ne s'étirent jamais)
    const root = kind === 'up' ? 'root' : 'pelvis';
    for (const a of json.animations) {
      for (const ch of a.channels) {
        expect(ch.target.path).not.toBe('scale');
        if (ch.target.path === 'translation') expect(json.nodes[ch.target.node].name, a.name).toBe(root);
      }
    }
    const ex = json.scenes[json.scene ?? 0].extras?.rabbit;
    expect(ex.earRest).toBe(kind === 'lop' ? 'lop' : 'up');
    expect(ex.naturalSpeeds.hop).toBeGreaterThan(0.2);
    expect(ex.naturalSpeeds.lope).toBeGreaterThan(ex.naturalSpeeds.hop);
    expect(ex.naturalSpeeds.run).toBeGreaterThan(ex.naturalSpeeds.lope);
    // glissement des appuis mesuré dans Blender (make_rabbit.py) aux vitesses naturelles : moins de 2 cm
    for (const g of ['hop', 'lope', 'run']) for (const [leg, cm] of Object.entries(ex.slipCm[g])) if (cm !== null) expect(cm, `${g} ${leg}`).toBeLessThan(2);
    expect(json.materials.map((m) => m.name)).toContain('rabbit_coat');
    const full = json.meshes.filter((m) => m.name !== 'rabbit_lod');
    const lod = json.meshes.find((m) => m.name === 'rabbit_lod');
    const tris = (m) => m.primitives.reduce((s, p) => s + json.accessors[p.indices].count / 3, 0);
    expect(lod).toBeTruthy();
    expect(tris(lod)).toBeLessThan(full.reduce((s, m) => s + tris(m), 0) * 0.45);
  });

  it('les clés des modèles sont rabbit_up et rabbit_lop (jamais « rabbit » : le lapin procédural reste le repli)', () => {
    expect(REAL_RABBIT_KEYS).toEqual({ up: 'rabbit_up', lop: 'rabbit_lop' });
    expect(MODELS.rabbit_up).toBe('rabbit.glb');
    expect(MODELS.rabbit_lop).toBe('rabbit_lop.glb');
    expect(MODELS.rabbit).toBeUndefined();
  });

  it('sans GLB chargé, pas de lapin réaliste : le jeu prend le lapin procédural (repli pendant le chargement)', () => {
    expect(realRabbitReady('up')).toBe(false);
    expect(buildRealRabbitModel(lookOf('rex'), 'adult')).toBeNull();
    const md = buildAnimalModel('rabbit', resolveLook('rabbit', 'rex', 0), 'rex');
    expect(md.realRabbit).toBeUndefined();
    expect(md.legs.length).toBe(4);
  });

  it.each(['up', 'lop'])('%s : dans chaque clip, aucun os ne s\'étire (distance à son parent constante à 0,5 mm près)', (kind) => {
    const gltf = G[kind];
    const scene = gltf.scene;
    const bones = [];
    scene.traverse((o) => { if (o.isBone && o.parent?.isBone) bones.push(o); });
    scene.updateMatrixWorld(true);
    const rest = bones.map((b) => b.getWorldPosition(new THREE.Vector3()).distanceTo(b.parent.getWorldPosition(new THREE.Vector3())));
    const mixer = new THREE.AnimationMixer(scene);
    let worst = 0;
    let at = '';
    for (const clip of gltf.animations) {
      const a = mixer.clipAction(clip);
      a.play();
      for (let k = 0; k <= 8; k++) {
        a.time = (k / 8) * clip.duration;
        mixer.update(0);
        scene.updateMatrixWorld(true);
        bones.forEach((b, i) => {
          const d = Math.abs(b.getWorldPosition(_v).distanceTo(b.parent.getWorldPosition(new THREE.Vector3())) - rest[i]);
          if (d > worst) {
            worst = d;
            at = `${clip.name} ${b.name}`;
          }
        });
      }
      a.stop();
    }
    mixer.uncacheRoot(scene);
    expect(worst, at).toBeLessThan(0.0005);
  });
});

describe('races reconnaissables (par les os, le poil et le shader)', () => {
  it('6 races, chacune son gabarit ; le bélier seul prend le modèle aux oreilles tombantes', () => {
    expect(Object.keys(RABBIT_BUILDS).sort()).toEqual([...BREEDS].sort());
    for (const b of BREEDS) expect(rabbitBuild(lookOf(b)).model, b).toBe(b === 'belier' ? 'lop' : 'up');
  });

  it('gabarits : nain rond à grosse tête et petites oreilles, géant long aux grandes oreilles, angora tout en poils, rex velouté, tête de lion à crinière', () => {
    const B = Object.fromEntries(BREEDS.map((b) => [b, rabbitBuild(lookOf(b))]));
    expect(B.nain.head).toBeGreaterThan(1.2);
    expect(B.nain.earLen).toBeLessThan(0.6);
    expect(B.nain.back).toBeLessThan(0.9);
    expect(B.geant_flandres.back).toBeGreaterThan(1.1);
    expect(B.geant_flandres.earLen).toBeGreaterThan(1.1);
    expect(B.angora.fur).toBeGreaterThan(0.02);
    expect(B.angora.cards).toBeGreaterThan(0.5);
    expect(B.angora.tassels).toBeGreaterThan(0.5);
    expect(B.rex.velvet).toBe(1);
    expect(B.tete_de_lion.mane).toBeGreaterThan(0.02);
    expect(B.tete_de_lion.maneCards).toBeGreaterThan(0.5);
    expect(B.tete_de_lion.earLen).toBeLessThan(0.7);
    // tailles de la race (species.js) : le géant est le plus grand, le nain le plus petit
    const scale = (b) => resolveLook('rabbit', b, 0).scale;
    expect(scale('geant_flandres')).toBeGreaterThan(1.5);
    expect(scale('nain')).toBeLessThan(0.8);
  });

  it('oreilles mesurées sur les modèles : nain < rex < géant ; celles du bélier pendent sous le dessus du crâne', () => {
    const len = Object.fromEntries(['nain', 'rex', 'geant_flandres'].map((b) => {
      const md = rabbit(b);
      const l = earLength(md);
      md.dispose();
      return [b, l];
    }));
    expect(len.nain).toBeLessThan(len.rex * 0.7);
    expect(len.geant_flandres).toBeGreaterThan(len.rex * 1.1);
    const lop = rabbit('belier');
    lop.root.updateMatrixWorld(true);
    const skull = lop.head.localToWorld(lop.skull.clone());
    const m = lop.coatMesh;
    const si = m.geometry.attributes.skinIndex;
    const ear3 = lop.bones.indexOf(lop.bone('ear3L'));
    let low = Infinity;
    for (let i = 0; i < si.count; i++) {
      if (si.getX(i) !== ear3) continue;
      m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
      low = Math.min(low, _v.y);
    }
    expect(low).toBeLessThan(skull.y - 0.03);
    lop.dispose();
  });

  it('poil long en cartes : l\'angora en a sur tout le corps, le tête de lion autour de la tête (crinière), les autres races aucune', () => {
    const cards = Object.fromEntries(BREEDS.map((b) => {
      const md = rabbit(b);
      const n = md.cardMesh ? md.cardMesh.geometry.attributes.position.count / 6 : 0;
      const out = { n };
      if (md.cardMesh) {
        // part des cartes plantées sur la tête et le cou (crinière) : poids du squelette de la tête et du cou
        const si = md.cardMesh.geometry.attributes.skinIndex;
        const head = new Set([md.bones.indexOf(md.head), md.bones.indexOf(md.neck)]);
        let h = 0;
        for (let i = 0; i < si.count; i += 6) if (head.has(si.getX(i))) h++;
        out.headShare = h / (si.count / 6);
      }
      md.dispose();
      return [b, out];
    }));
    expect(cards.angora.n).toBeGreaterThan(300);
    expect(cards.tete_de_lion.n).toBeGreaterThan(150);
    expect(cards.tete_de_lion.headShare).toBeGreaterThan(cards.angora.headShare ?? 0);
    for (const b of ['nain', 'belier', 'rex', 'geant_flandres']) expect(cards[b].n, b).toBe(0);
  });

  it('robes : agouti (dessous clair) quand la seconde couleur diffère, panaché du bélier, yeux rubis de l\'angora blanc, velours du rex', () => {
    expect(rabbitCoatPlan(lookOf('nain', 0)).pattern).toBe('agouti');
    expect(rabbitCoatPlan(lookOf('nain', 1)).pattern).toBe('solid'); // noir uni
    expect(rabbitCoatPlan(lookOf('belier', 0)).pattern).toBe('patches');
    expect(rabbitCoatPlan(lookOf('belier', 1)).pattern).toBe('solid'); // chocolat
    const ang = rabbitCoatPlan(lookOf('angora', 0));
    expect(ang.eye).toBe(0xb03a48);
    expect(ang.nose).toBe(0xd9a0a0);
    expect(rabbitCoatPlan(lookOf('rex'), rabbitBuild(lookOf('rex'))).velvet).toBe(1);
    // couleurs mélangées d'un lapereau : n'importe quelle couleur convient
    const mix = rabbitCoatPlan({ coat: 0x7a5c41, secondary: 0xc8b49a, pattern: 'solid', seed: 3 });
    expect(mix.base).toBe(0x7a5c41);
    expect(mix.pattern).toBe('agouti');
  });

  it('race des anciennes sauvegardes : look.breed, sinon la race de l\'animal (jamais « mix »), sinon devinée par la robe ; oreilles tombantes = bélier', () => {
    const lk = resolveLook('rabbit', 'angora', 0);
    delete lk.breed;
    expect(rabbitLookWithBreed(lk, 'angora').breed).toBe('angora');
    expect(rabbitLookWithBreed(lk, 'mix').breed).toBe('angora'); // (robe de l'angora blanc)
    expect(rabbitBreedGuess({ earType: 'lop' }).id).toBe('belier');
    expect(rabbitLookWithBreed({ coat: 1, secondary: 2 }, 'mix').breed).toBe('rex');
    // lapereau d'un bélier et d'un rex : le look d'un parent (oreilles tombantes ou non) décide du modèle
    expect(rabbitBuild({ ...resolveLook('rabbit', 'rex', 0), earType: 'lop' }).model).toBe('lop');
    expect(rabbitBuild({ ...resolveLook('rabbit', 'belier', 0), earType: 'rabbit' }).model).toBe('up');
  });
});

describe('construction, lapereaux et poses tenues', () => {
  it.each(BREEDS)('%s : adulte, lapereau et jeune se construisent ; accroupi, assis, debout, couché, en boule : posés sur le sol', (breed) => {
    for (const stage of ['adult', 'baby', 'young']) {
      const md = rabbit(breed, stage);
      expect(md, `${breed} ${stage}`).toBeTruthy();
      expect(md.realRabbit).toBe(true);
      expect(md.stage).toBe(stage);
      expect(md.kit).toBe(stage === 'baby');
      for (const k of ['crouch', 'sit', 'rear', 'lie', 'sleep']) {
        md.staticPose(k);
        const lo = lowest(md);
        // (le poil long et la crinière s'écrasent un peu sur le sol)
        expect(lo, `${breed} ${stage} ${k}`).toBeGreaterThan(-0.004 - 0.45 * (Math.max(0, md.build.fur) + md.build.mane));
        expect(lo, `${breed} ${stage} ${k}`).toBeLessThan(0.02);
      }
      md.dispose();
    }
  });

  it('lapereau : grosse tête, pattes et oreilles courtes, poil encore court ; le jeune entre les deux', () => {
    const a = rabbitBuild(lookOf('tete_de_lion'), 'adult');
    const k = rabbitBuild(lookOf('tete_de_lion'), 'baby');
    const y = rabbitBuild(lookOf('tete_de_lion'), 'young');
    expect(k.head).toBeGreaterThan(a.head * 1.2);
    expect(k.legs).toBeLessThan(a.legs);
    expect(k.earLen).toBeLessThan(a.earLen);
    expect(k.mane).toBeLessThan(a.mane);
    expect(y.head).toBeGreaterThan(a.head);
    expect(y.head).toBeLessThan(k.head);
    expect(k.key).not.toBe(a.key);
  });

  it('même lapin, même graine : la même géométrie (déterministe), partagée entre les lapins de la race', () => {
    const a = rabbit('angora');
    const b = rabbit('angora');
    expect(a.coatMesh.geometry).toBe(b.coatMesh.geometry);
    expect(a.cardMesh.geometry).toBe(b.cardMesh.geometry);
    expect(a.coatMesh.geometry.userData.shared).toBe(true);
    a.dispose();
    b.dispose();
  });

  it('interface du modèle procédural : hauteurs (taille 1), pattes, tête, oreilles, encolure, collier mesuré', () => {
    const md = rabbit('rex');
    expect(md.legs.length).toBe(4);
    for (const l of md.legs) expect(l.pivot?.isBone).toBe(true);
    expect(md.head.isBone).toBe(true);
    expect(md.neck.isBone).toBe(true);
    expect(md.ears.length).toBe(2);
    expect(md.headHeight).toBeGreaterThan(0.08);
    expect(md.headHeight).toBeLessThan(0.25);
    expect(md.y0).toBeGreaterThan(0.04);
    expect(md.dogFit.collar.rx).toBeGreaterThan(0.01);
    expect(md.dogFit.collar.rx).toBeLessThan(0.08);
    md.dispose();
  });
});

describe('allures, postures et gestes', () => {
  it('allure selon la vitesse (taille 1) avec hystérésis : sautillement lent, petit galop, course en bonds', () => {
    expect(pickRabbitGait('idle', 0)).toBe('idle');
    expect(pickRabbitGait('idle', 0.3)).toBe('hop');
    expect(pickRabbitGait('hop', 1.0)).toBe('lope');
    expect(pickRabbitGait('lope', 2.5)).toBe('run');
    expect(pickRabbitGait('run', 1.35)).toBe('run');
    expect(pickRabbitGait('run', 1.0)).toBe('lope');
    expect(pickRabbitGait('lope', 0.5)).toBe('lope');
    expect(pickRabbitGait('lope', 0.3)).toBe('hop');
  });

  it('passages entre postures par le plus court chemin : accroupi → assis → debout ; couché → en boule ; porté en fondu', () => {
    expect(rabbitPosturePath('crouch', 'rear').map((e) => e[2])).toEqual(['sit_down', 'rear_up']);
    expect(rabbitPosturePath('rear', 'crouch').map((e) => e[2])).toEqual(['rear_down', 'stand_up']);
    expect(rabbitPosturePath('crouch', 'sleep').map((e) => e[1])).toEqual(['lie', 'sleep']);
    expect(rabbitPosturePath('crouch', 'held')).toEqual([['crouch', 'held', null]]);
    for (const p of Object.values(POSTURE_CLIP)) expect(G.up.animations.map((c) => c.name)).toContain(p);
  });

  it('au repos : postures tirées selon la fatigue (tirage donné : déterministe)', () => {
    let s = 1;
    const r = () => {
      s = (s * 16807) % 2147483647;
      return s / 2147483647;
    };
    const seen = new Set();
    let prev = 'crouch';
    for (let i = 0; i < 60; i++) {
      const p = pickRabbitIdle(prev, 80, r);
      expect(p.pose).not.toBe(prev);
      expect(p.duration).toBeGreaterThan(1);
      seen.add(p.pose);
      prev = p.pose;
    }
    for (const p of ['sniff', 'sit', 'groom', 'rear', 'lie']) expect(seen, p).toContain(p);
    const tired = new Set();
    for (let i = 0; i < 60; i++) tired.add(pickRabbitIdle('crouch', 20, r).pose);
    expect(tired).toContain('sleep');
    expect(tired.has('rear')).toBe(false);
  });

  it.each([['rex', 'hop', 0.29], ['rex', 'lope', 0.9], ['rex', 'run', 1.8], ['belier', 'hop', 0.3], ['belier', 'lope', 0.7], ['belier', 'run', 1.2]])(
    '%s, %s à %f m/s : les pieds posés ne glissent pas (sole suivie dans le repère du sol)', (breed, gait, v) => {
      const md = rabbit(breed);
      const a = md.anim;
      const m = md.coatMesh;
      const dt = 1 / 60;
      const step = () => {
        a.update(dt, { v, moving: true, posture: 'crouch' });
        md.root.position.z += v * dt; // (le lapin avance dans le monde comme dans le jeu)
        md.root.updateMatrixWorld(true);
      };
      for (let f = 0; f < 90; f++) step();
      expect(a.gait).toBe(gait);
      const soles = a.S.soles;
      const cur = [null, null, null, null];
      const slides = [[], [], [], []];
      for (let f = 0; f < 150; f++) {
        step();
        soles.forEach((ids, l) => {
          if (cur[l]) {
            m.getVertexPosition(cur[l].i, _v).applyMatrix4(m.matrixWorld);
            if (_v.y < 0.004) {
              cur[l].d = Math.max(cur[l].d, Math.hypot(_v.x - cur[l].x, _v.z - cur[l].z));
              return;
            }
            if (cur[l].n >= 3) slides[l].push(cur[l].d);
            cur[l] = null;
          }
          let lo = Infinity;
          let best = -1;
          for (const i of ids) {
            m.getVertexPosition(i, _v).applyMatrix4(m.matrixWorld);
            if (_v.y < lo) {
              lo = _v.y;
              best = i;
            }
          }
          if (lo < 0.004) {
            m.getVertexPosition(best, _v).applyMatrix4(m.matrixWorld);
            cur[l] = { i: best, x: _v.x, z: _v.z, d: 0, n: 0 };
          }
        });
        for (const c of cur) if (c) c.n++;
      }
      const med = slides.map((s) => (s.length ? [...s].sort((p, q) => p - q)[Math.floor(s.length / 2)] : 0));
      // (avant : antérieurs du bélier qui patinaient de 11 à 24 cm, ceux du lapin gris de 14 cm à la course)
      for (let l = 0; l < 4; l++) expect(med[l], `${breed} ${gait} patte ${l}`).toBeLessThan(0.02);
      md.dispose();
    });

  it('aux allures, la sole la plus basse ne passe jamais sous le sol (plus de 3 mm)', () => {
    for (const breed of ['rex', 'belier', 'nain', 'geant_flandres']) {
      const md = rabbit(breed);
      let lo = Infinity;
      for (const v of [0.3, 0.9, 2.4]) {
        for (let f = 0; f < 80; f++) {
          md.anim.update(1 / 60, { v, moving: true, posture: 'crouch' });
          if (f % 8 === 0) lo = Math.min(lo, lowest(md, 5));
        }
      }
      expect(lo, breed).toBeGreaterThan(-0.003);
      md.dispose();
    }
  });

  it('postures de la carte des états (toilette, renifler avec le nez qui frémit, manger, tapi, porté) : passages joués, posés au sol', () => {
    const md = rabbit('rex');
    const a = md.anim;
    const settle = (posture, secs = 3) => {
      for (let f = 0; f < secs * 30; f++) a.update(1 / 30, { v: 0, moving: false, posture, held: posture === 'held' });
    };
    let sniffMax = 0;
    for (const p of ['sit', 'groom', 'crouch', 'sniff', 'eat', 'hide', 'rear', 'lie', 'sleep', 'crouch']) {
      settle(p);
      expect(a.posture, p).toBe(p);
      if (p === 'sniff') for (let f = 0; f < 30; f++) {
        a.update(1 / 30, { v: 0, moving: false, posture: 'sniff' });
        sniffMax = Math.max(sniffMax, md.uniforms.cSniff.value);
      }
      expect(lowest(md), p).toBeGreaterThan(-0.004);
    }
    expect(sniffMax).toBeGreaterThan(0.0005); // (le nez frémit en reniflant)
    settle('held');
    expect(a.posture).toBe('held');
    md.dispose();
  });

  it('oreilles du bélier : elles pendent vers le sol quand il renifle, mange, se dresse ou se couche (pas devant le nez)', () => {
    const md = rabbit('belier');
    const a = md.anim;
    expect(a.earHang).toHaveLength(2);
    for (const p of ['sniff', 'eat', 'rear', 'lie']) {
      for (let f = 0; f < 90; f++) a.update(1 / 30, { v: 0, moving: false, posture: p });
      md.root.updateMatrixWorld(true);
      for (let i = 0; i < 2; i++) expect(Math.abs(a.earPitch(i) - a.earHang[i]), `${p} oreille ${i}`).toBeLessThan(0.35);
    }
    md.dispose();
  });

  it('poses imposées des activités : saut tenu à sa phase, salut debout ; false pour un autre animal', () => {
    const md = rabbit('nain');
    expect(realRabbitPose({ realDog: true }, 'jump', 1)).toBe(false);
    expect(realRabbitPose(md, 'jump', 1, null, 0.4)).toBe(true);
    expect(md.anim.trick.clip).toBe('jump');
    expect(md.anim.trick.time).toBeCloseTo(0.4);
    const sg = new THREE.Group();
    sg.rotation.x = 0.3;
    expect(realRabbitPose(md, 'bow', 1, sg)).toBe(true);
    expect(md.anim.trick.clip).toBe('stand');
    expect(sg.rotation.x).toBe(0);
    for (let f = 0; f < 20; f++) {
      realRabbitPose(md, 'bow', 1, sg);
      md.anim.update(1 / 30, { v: 0, moving: false, posture: 'crouch' });
    }
    expect(md.anim.w.stand).toBeGreaterThan(0.8);
    md.dispose();
  });
});

describe('équipement et salon', () => {
  it('accessoires du salon (nœud, clochette, ruban) posés sur l\'encolure et le crâne mesurés', () => {
    const md = rabbit('tete_de_lion');
    const look = lookOf('tete_de_lion');
    const out = buildAccessories(md, look, { neck: { id: 'bow', color: 'pink' }, head: { id: 'ribbon', color: 'blue' } });
    expect(out.length).toBeGreaterThan(0);
    md.root.updateMatrixWorld(true);
    for (const o of out) {
      const p = o.getWorldPosition(new THREE.Vector3());
      expect(p.y).toBeGreaterThan(0.03);
      expect(p.y).toBeLessThan(0.3);
    }
    md.setCut('court');
    expect(md.uniforms.cCut.value.x).toBeLessThan(0);
    expect(md.cardMesh.visible).toBe(false);
    md.setCut(null);
    expect(md.cardMesh.visible).toBe(true);
    md.dispose();
  });
});

describe('crédits CC-BY', () => {
  it('Dakota.Hinkle et FourthGreen crédités (jeu, CREDITS.md, textes de licence) ; CDmir par courtoisie', () => {
    const up = MODEL_CREDITS.find((c) => c.id === 'rabbit_up');
    const lop = MODEL_CREDITS.find((c) => c.id === 'rabbit_lop');
    expect(up.author).toBe('Dakota.Hinkle');
    expect(up.license.name).toBe('CC BY 4.0');
    expect(up.url).toContain('sketchfab.com/3d-models/rabbit-073eef14ae3c4d06808498c3ba895e67');
    expect(lop.author).toBe('FourthGreen');
    expect(lop.url).toContain('rabbit-rigged-e7213589744d436b9d96e2dbb31198a5');
    const credits = fs.readFileSync(new URL('../CREDITS.md', import.meta.url), 'utf8');
    for (const s of ['Dakota.Hinkle', 'FourthGreen', 'rabbit.glb', 'rabbit_lop.glb', 'CDmir']) expect(credits).toContain(s);
    for (const f of ['dakota-hinkle-rabbit.txt', 'fourthgreen-rabbit-rigged.txt']) {
      const txt = fs.readFileSync(new URL(`../public/models/LICENSES/${f}`, import.meta.url), 'utf8');
      expect(txt).toContain('CC BY 4.0');
    }
  });

  it('données de repos tirées une fois par GLB (gardées dans gltf.userData)', () => {
    expect(realRabbitBase(G.up, 'up')).toBe(realRabbitBase(G.up, 'up'));
  });
});

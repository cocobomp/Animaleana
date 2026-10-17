// Cheval réaliste (public/models/horse_real.glb, src/game/models/horseReal.js) : le fichier contient bien
// le squelette et les allures attendus, les proportions de chaque race gardent les sabots au sol, et le
// choix de l'allure d'après la vitesse ne fait pas de va-et-vient.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import * as THREE from 'three';
import { deformer, pickGait, RIG_BONES, NATIVE_BUILD, NATURAL_SPEED } from '../src/game/models/horseReal.js';
import { horseBuild, foalBuild } from '../src/sim/horseLook.js';
import { SPECIES } from '../src/sim/species.js';

const FILE = new URL('../public/models/horse_real.glb', import.meta.url);

/** Partie JSON d'un fichier GLB. */
function glbJson(buf) {
  expect(buf.readUInt32LE(0)).toBe(0x46546c67); // « glTF »
  const len = buf.readUInt32LE(12);
  expect(buf.readUInt32LE(16)).toBe(0x4e4f534a); // « JSON »
  return JSON.parse(buf.subarray(20, 20 + len).toString('utf8'));
}

/** Position de repos (repère du fichier) de chaque nœud nommé. */
function restPositions(json) {
  const out = {};
  const walk = (i, parent) => {
    const n = json.nodes[i];
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...(n.translation ?? [0, 0, 0])),
      new THREE.Quaternion(...(n.rotation ?? [0, 0, 0, 1])),
      new THREE.Vector3(...(n.scale ?? [1, 1, 1])),
    );
    if (n.matrix) m.fromArray(n.matrix);
    const w = parent.clone().multiply(m);
    if (n.name) out[n.name] = new THREE.Vector3().setFromMatrixPosition(w);
    for (const c of n.children ?? []) walk(c, w);
  };
  for (const r of json.scenes[json.scene ?? 0].nodes) walk(r, new THREE.Matrix4());
  return out;
}

describe('fichier du cheval réaliste', () => {
  const buf = fs.readFileSync(FILE);
  const json = glbJson(buf);

  it('est léger et compressé (meshopt, WebP)', () => {
    expect(buf.length).toBeLessThan(1.3 * 1024 * 1024);
    expect(json.extensionsUsed).toEqual(expect.arrayContaining(['EXT_meshopt_compression', 'EXT_texture_webp']));
  });

  it('a les allures, le squelette et les matières attendus', () => {
    const clips = json.animations.map((a) => a.name);
    expect(clips).toEqual(expect.arrayContaining(['idle', 'rest', 'walk', 'trot', 'canter', 'canterR', 'gallop', 'eat']));
    expect(Object.keys(NATURAL_SPEED).every((g) => clips.includes(g))).toBe(true);
    const names = new Set(json.nodes.map((n) => n.name));
    for (const b of RIG_BONES) expect(names.has(b), b).toBe(true);
    expect(json.materials.map((m) => m.name).sort()).toEqual(['horse_coat', 'horse_eye', 'horse_mane']);
    expect(json.skins).toHaveLength(1);
  });

  it('a un os de paturon sous chaque canon (sabot à plat), au ras du sol', () => {
    const p = restPositions(json);
    for (const k of ['FL', 'FR', 'HL', 'HR']) {
      // canon au-dessus du boulet, boulet à 15-25 cm du sol
      expect(p[k + '3'].y).toBeGreaterThan(p[k + '4'].y + 0.2);
      expect(p[k + '4'].y).toBeGreaterThan(0.15);
      expect(p[k + '4'].y).toBeLessThan(0.25);
    }
    // symétrique : les deux côtés au même endroit (miroir en x)
    for (const [l, r] of [['FL2', 'FR2'], ['HL3', 'HR3'], ['EarL', 'EarR']]) {
      expect(p[l].x).toBeCloseTo(-p[r].x, 3);
      expect(p[l].y).toBeCloseTo(p[r].y, 3);
    }
  });

  describe('proportions des races', () => {
    const p = restPositions(json);
    // (repère du jeu : recalé en z comme horseReal.js le fait d'après le creux du dos)
    const rest = RIG_BONES.map((n) => p[n].clone().add(new THREE.Vector3(0, 0, 0.205)));
    const base = { rest };
    const sole = (k) => {
      const f = p[k + '4'].clone().add(new THREE.Vector3(0, 0, 0.205));
      return new THREE.Vector3(f.x, 0, f.z + 0.03);
    };
    const builds = SPECIES.horse.breeds.flatMap((b) => [[b.id, horseBuild(b)], [`${b.id} (poulain)`, foalBuild(horseBuild(b))]]);

    it.each(builds)('%s : sabots au sol, garrot à une hauteur de cheval', (name, B) => {
      const D = deformer(base, B);
      for (const k of ['FL', 'FR', 'HL', 'HR']) {
        const i = RIG_BONES.indexOf(k + '4');
        const s = D.maps[i](sole(k), new THREE.Vector3());
        expect(Math.abs(s.y)).toBeLessThan(1e-6);
      }
      const withers = D.heads[RIG_BONES.indexOf('Neck')].y;
      expect(withers).toBeGreaterThan(1.1);
      expect(withers).toBeLessThan(1.75);
      // la tête au-dessus du garrot, les coudes sous le dos
      expect(D.heads[RIG_BONES.indexOf('Head')].y).toBeGreaterThan(withers);
      expect(D.heads[RIG_BONES.indexOf('FL2')].y).toBeLessThan(withers);
    });

    it('un pur-sang est plus fin et plus haut sur jambes qu\'un trait', () => {
      const ps = deformer(base, horseBuild(SPECIES.horse.breeds.find((b) => b.id === 'pur_sang')));
      const tr = deformer(base, horseBuild(SPECIES.horse.breeds.find((b) => b.id === 'trait_breton')));
      expect(ps.scale.gx).toBeLessThan(tr.scale.gx);
      expect(ps.scale.bone).toBeLessThan(tr.scale.bone);
      expect(ps.heads[RIG_BONES.indexOf('FL2')].y).toBeGreaterThan(tr.heads[RIG_BONES.indexOf('FL2')].y);
    });

    it('le gabarit natif ne change rien', () => {
      const D = deformer(base, { ...NATIVE_BUILD });
      for (let i = 0; i < rest.length; i++) {
        if (!D.heads[i]) continue;
        expect(D.heads[i].distanceTo(rest[i])).toBeLessThan(1e-6);
      }
    });
  });
});

describe('allure d\'après la vitesse', () => {
  it('passe du pas au galop en accélérant, et revient en ralentissant', () => {
    let g = 'idle';
    const seen = [];
    for (let u = 0; u <= 9; u += 0.05) {
      g = pickGait(g, u);
      if (seen.at(-1) !== g) seen.push(g);
    }
    expect(seen).toEqual(['idle', 'walk', 'trot', 'canter', 'gallop']);
    const back = [];
    for (let u = 9; u >= 0; u -= 0.05) {
      g = pickGait(g, u);
      if (back.at(-1) !== g) back.push(g);
    }
    expect(back).toEqual(['gallop', 'canter', 'trot', 'walk', 'idle']);
  });

  it('ne fait pas de va-et-vient autour d\'une limite', () => {
    let g = pickGait('walk', 2.2); // au-dessus de la limite pas -> trot
    expect(g).toBe('trot');
    const seq = [2.1, 2.2, 2.0, 2.25, 1.95, 2.15].map((u) => (g = pickGait(g, u)));
    expect(new Set(seq)).toEqual(new Set(['trot']));
  });

  it('à l\'arrêt : idle', () => {
    expect(pickGait('gallop', 0)).toBe('idle');
    expect(pickGait('walk', NaN)).toBe('idle');
  });
});

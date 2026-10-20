// Marques des robes pie et léopard d'un cheval déjà là : mêmes plaques et mêmes taches, et autant de blanc,
// qu'avant l'étape 8 du plan « cheval beau » (une partie sauvegardée garde look et graine : l'enfant retrouve son
// cheval). Le bruit du shader (horseCoat.js) est recopié ici en JavaScript et évalué aux sommets du pelage de la race.
// Aucun hasard : graines fixes.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { coatMaterial, COAT_LOOKS } from '../src/game/models/horseCoat.js';
import { realHorseBase, buildRealHorseModel } from '../src/game/models/horseReal.js';
import { createAnimal } from '../src/sim/animal.js';
import { horseBuild } from '../src/sim/horseLook.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
  realHorseBase(gltf);
}, 60000);

// --- bruit du shader (mêmes formules) ---
const fract = (x) => x - Math.floor(x);
function hHash(x, y, z) {
  let px = fract(x * 0.3183099 + 0.11) * 17;
  let py = fract(y * 0.3183099 + 0.17) * 17;
  let pz = fract(z * 0.3183099 + 0.13) * 17;
  return fract(px * py * pz * (px + py + pz));
}
const mix = (a, b, t) => a + (b - a) * t;
function hNoise(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let fx = x - ix;
  let fy = y - iy;
  let fz = z - iz;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  fz = fz * fz * (3 - 2 * fz);
  const h = (a, b, c) => hHash(ix + a, iy + b, iz + c);
  return mix(mix(mix(h(0, 0, 0), h(1, 0, 0), fx), mix(h(0, 1, 0), h(1, 1, 0), fx), fy),
    mix(mix(h(0, 0, 1), h(1, 0, 1), fx), mix(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}
const hFbm = (x, y, z) => hNoise(x, y, z) * 0.55 + hNoise(x * 2.03 + 7.1, y * 2.03 + 7.1, z * 2.03 + 7.1) * 0.3
  + hNoise(x * 4.1 + 3.3, y * 4.1 + 3.3, z * 4.1 + 3.3) * 0.15;
/** Identifiant de la cellule la plus proche (hCell(p).z du shader, hCell(p).y avant l'étape 8). */
function cellId(x, y, z) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const iz = Math.floor(z);
  let d = 8;
  let id = 0;
  for (let c = -1; c <= 1; c++) for (let b = -1; b <= 1; b++) for (let a = -1; a <= 1; a++) {
    const gx = ix + a;
    const gy = iy + b;
    const gz = iz + c;
    const rx = a + hHash(gx, gy, gz) - (x - ix);
    const ry = b + hHash(gx + 19.1, gy + 19.1, gz + 19.1) - (y - iy);
    const rz = c + hHash(gx + 47.7, gy + 47.7, gz + 47.7) - (z - iz);
    const dd = rx * rx + ry * ry + rz * rz;
    if (dd < d) {
      d = dd;
      id = hHash(gx + 5.3, gy + 5.3, gz + 5.3);
    }
  }
  return id;
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Sommets du pelage d'une race : position, haut de la normale, partie, hauteur relative (membres), poids de la tête. */
function coatPoints(breed, colorIndex, seed) {
  const a = createAnimal({ species: 'horse', breed, colorIndex, ageDays: 80, seed });
  const md = buildRealHorseModel(a.look, a.breed, gltf);
  const g = md.coatMesh.geometry.attributes;
  const pts = [];
  for (let i = 0; i < g.position.count; i++) {
    const part = g.hPart.getX(i);
    // (corps, tête, membres ; pas les sabots, la peau du bout du nez ni les oreilles)
    if (part > 5.5) continue;
    pts.push({
      x: g.position.getX(i), y: g.position.getY(i), z: g.position.getZ(i), up: g.normal.getY(i),
      body: part < 0.5 ? 1 : 0, leg: part > 1.5 ? 1 : 0, h: g.hInfo.getX(i), head: g.hHead.getX(i),
    });
  }
  const seedU = coatMaterial(a.look, horseBuild(null, a.look), null, { detail: null, normalMap: null, normalSign: 1, hoofY: 0.12 })
    .userData.horseUniforms.hSeed.value;
  md.dispose();
  return { pts, seed: seedU };
}

/** Pie avant l'étape 8 (horseCoat.js de f35decc) : vrai si blanc. */
function pieOld(p, s) {
  const pn = hFbm(p.x * 1.7 + s * 3.1, p.y * 1.4 + s * 3.1, p.z * 1.7 + s * 3.1) + (hNoise(p.x * 9, p.y * 9, p.z * 9) - 0.5) * 0.06;
  const t = pn + p.leg * (1 - smooth(0.1, 0.7, p.h)) * 0.45 - p.head * 0.5
    + p.body * smooth(0.35, 0.9, p.up) * smooth(-0.6, -0.2, -Math.abs(p.z + 0.1)) * 0.12;
  return t > 0.5;
}

/** Pie d'aujourd'hui (mêmes formules que le shader). */
function pieNew(p, s) {
  const W = COAT_LOOKS.pinto.warp;
  const wx = hNoise(p.x * 4 + 1.7, p.y * 4 + 1.7, p.z * 4 + 1.7) - 0.5;
  const wy = hNoise(p.x * 4 + 9.2, p.y * 4 + 9.2, p.z * 4 + 9.2) - 0.5;
  const wz = hNoise(p.x * 4 + 4.4, p.y * 4 + 4.4, p.z * 4 + 4.4) - 0.5;
  const pn = hFbm(p.x * 1.7 + s * 3.1 + wx * W, p.y * 1.4 + s * 3.1 + wy * W, p.z * 1.7 + s * 3.1 + wz * W)
    + (hNoise(p.x * 9, p.y * 9, p.z * 9) - 0.5) * 0.06;
  const jag = (hNoise(p.x * 20 + s, p.y * 20 + s, p.z * 20 + s) - 0.5) * COAT_LOOKS.pinto.jag;
  const back = p.body * smooth(0.35, 0.9, p.up) * smooth(-0.6, -0.2, -Math.abs(p.z + 0.1));
  const t = pn + jag + p.leg * (1 - smooth(0.1, 0.7, p.h)) * 0.45 - p.head * 0.5 + back * 0.12;
  return t > 0.5;
}

describe('marques d\'un cheval déjà là (pie, léopard)', () => {
  it('pie : même part de blanc (± 5 points) et mêmes plaques qu\'avant l\'étape 8, sur 20 graines et 3 races', () => {
    for (const [breed, ci] of [['shetland', 0], ['irish_cob', 0], ['paint', 1]]) {
      const base = coatPoints(breed, ci, 1);
      expect(base.pts.length).toBeGreaterThan(2500);
      for (let k = 0; k < 20; k++) {
        const s = ((1 + k * 37) % 997) * 0.731;
        let wOld = 0;
        let wNew = 0;
        let same = 0;
        for (const p of base.pts) {
          const o = pieOld(p, s);
          const n = pieNew(p, s);
          wOld += o;
          wNew += n;
          same += o === n;
        }
        const N = base.pts.length;
        expect(Math.abs(wNew - wOld) / N, `${breed} graine ${k}`).toBeLessThan(0.05);
        // (bords déchiquetés : quelques sommets changent de côté, pas les plaques)
        expect(same / N, `${breed} graine ${k}`).toBeGreaterThan(0.9);
      }
    }
  });

  it('léopard : toutes les taches d\'avant gardées à leur place (même cellule, même seuil), quelques-unes de plus vers l\'arrière', () => {
    const { pts } = coatPoints('appaloosa', 0, 1);
    for (let k = 0; k < 5; k++) {
      const s = ((7 + k * 53) % 997) * 0.731;
      let kept = 0;
      let old = 0;
      for (const p of pts) {
        const id = cellId(p.x * 8.5 + s, p.y * 8.5 + s, p.z * 7.5 + s);
        const rear = smooth(0.35, -0.55, p.z);
        const was = id >= 0.22;
        const now = Math.max(id >= 0.22 ? 1 : 0, id >= mix(0.22, 0.04, rear) ? 1 : 0) > 0;
        if (was) {
          old++;
          if (now) kept++;
        }
      }
      expect(old).toBeGreaterThan(100);
      expect(kept).toBe(old);
    }
  });

  it('le shader garde le champ du pie et les cellules du léopard d\'avant l\'étape 8', () => {
    const a = createAnimal({ species: 'horse', breed: 'appaloosa', colorIndex: 0, ageDays: 80, seed: 3 });
    const m = coatMaterial(a.look, horseBuild(null, a.look), null, { detail: null, normalMap: null, normalSign: 1, hoofY: 0.12 });
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    m.onBeforeCompile(sh);
    const fs = sh.fragmentShader;
    expect(fs).toContain('vec3 q = P * vec3(1.7, 1.4, 1.7) + hSeed * 3.1;');
    expect(fs).toContain('smoothstep(0.5 - wdt, 0.5 + wdt, t)');
    expect(fs).toContain('hCell(P * vec3(8.5, 8.5, 7.5) + hSeed)');
    expect(fs).toContain('max(step(0.22, cl.z), step(mix(0.22, 0.04, rear) - hBlanket * 0.08, cl.z))');
  });
});

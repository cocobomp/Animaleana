// Finitions des ruminants réalistes (moutons, chèvres, vaches) après la critique : sabots des agneaux, des chevreaux et
// de l'Ouessant qui ne glissent plus (aux allures et en gambadant sur place), version réduite à la vraie distance de la
// caméra du téléphone, licol et masque visibles, chèvre qui ne traverse plus la barrière, robes (Hereford, taureaux pie).
// GLB chargés dans node sans textures ; tout est déterministe (pas de temps fixe, aucun tirage au hasard).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealSheepModel } from '../src/game/models/sheepReal.js';
import { buildRealGoatModel } from '../src/game/models/goatReal.js';
import { resolveLook } from '../src/sim/animal.js';
import { loadRealSheepGltf } from './fixtures/realSheepGltf.js';
import { loadRealGoatGltf } from './fixtures/realGoatGltf.js';

let GS;
let GG;
beforeAll(async () => {
  GS = await loadRealSheepGltf();
  GG = await loadRealGoatGltf();
}, 120000);

const lookOf = (sp, breed, o = {}) => ({
  ...resolveLook(sp, breed, 0), seed: 4242, sex: o.sex ?? 'f',
  ...(o.baby ? (sp === 'sheep' ? { lamb: true } : { kid: true }) : {}),
});
const build = (sp, breed, o = {}) => (sp === 'sheep' ? buildRealSheepModel(lookOf(sp, breed, o), breed, GS) : buildRealGoatModel(lookOf(sp, breed, o), breed, GG));
const st = (o = {}) => ({ v: 0, moving: false, size: 1, posture: 'stand', action: null, ...o });

/**
 * Allure ou gambade comme en jeu (mesure de la critique, mes/rum_gaits.json) : le modèle dans un groupe à la taille de
 * l'animal (look.scale, la moitié pour un petit — growthScale à la naissance), avancé à la vitesse du jeu (m/s), mixeur
 * à 30 images/s ; après 3 s, glissement de l'onglon pendant chaque appui (sole la plus basse à moins d'1 cm du sol,
 * dans le monde) : liste des glissements (m) et sole la plus basse.
 */
function gaitSlips(sp, breed, o, speed, { secs = 10, action = null } = {}) {
  const look = lookOf(sp, breed, o);
  const md = build(sp, breed, o);
  const s = (look.scale ?? 1) * (o.baby ? 0.5 : 1);
  const g = new THREE.Group();
  g.scale.setScalar(s);
  g.add(md.root);
  g.updateMatrixWorld(true);
  const a = md.anim;
  const scale = s * (md.size ?? 1);
  const dt = 1 / 30;
  const stt = st({ v: speed / scale, moving: speed > 0.06, size: scale, action });
  const prev = md.legs.map(() => null);
  const cur = md.legs.map(() => 0);
  const slips = [];
  let lowest = Infinity;
  for (let f = 0; f < Math.round((3 + secs) / dt); f++) {
    g.position.z += speed * dt;
    g.updateMatrixWorld(true);
    a.update(dt, stt);
    md.root.updateMatrixWorld(true);
    if (f < 3 / dt) continue;
    md.legs.forEach((leg, l) => {
      let lo = Infinity;
      for (const p of a.solePts[l]) lo = Math.min(lo, p.clone().applyMatrix4(leg.paw.matrixWorld).y);
      lowest = Math.min(lowest, lo);
      const toe = a.toePts[l].clone().applyMatrix4(leg.paw.matrixWorld);
      toe.lo = lo;
      if (prev[l]) {
        const d = Math.hypot(toe.x - prev[l].x, toe.z - prev[l].z);
        if (lo < 0.01 && prev[l].lo < 0.01) cur[l] += d;
        else if (cur[l] > 0) {
          slips.push(cur[l]);
          cur[l] = 0;
        }
      }
      prev[l] = toe;
    });
  }
  md.dispose?.();
  return { slips, lowest, n: slips.length, over1: slips.filter((x) => x > 0.01).length, over2: slips.filter((x) => x > 0.02).length, max: Math.max(0, ...slips) };
}

describe('sabots des agneaux, des chevreaux et de l\'Ouessant', () => {
  // (critique : agneau suffolk trot 9/76 appuis > 2 cm, galop 5/89 ; agneau islandais 11/106 et 13/115 ; chevreau alpine
  // pas 11/66, trot 8/108 ; chevreau col noir 8-15 ; Ouessant pas 2/54, trot 3/68 — les adultes ≤ 0,1 cm)
  it.each([
    ['sheep', 'suffolk', { baby: true }, 2.3], ['sheep', 'suffolk', { baby: true }, 4.2], ['sheep', 'islandais_mouton', { baby: true }, 2.3],
    ['sheep', 'islandais_mouton', { baby: true }, 4.2], ['sheep', 'ouessant', {}, 0.9], ['sheep', 'ouessant', {}, 2.3],
    ['goat', 'alpine', { baby: true }, 0.9], ['goat', 'alpine', { baby: true }, 2.3], ['goat', 'col_noir', { baby: true }, 4.2],
  ])('%s %s %j à %s m/s : les sabots posés ne glissent pas (pas plus d\'1 cm par appui)', (sp, b, o, v) => {
    const r = gaitSlips(sp, b, o, v);
    if (process.env.RUM_LOG) console.log('GLISSE', sp, b, JSON.stringify(o), v, r.n, r.over1, r.over2, (r.max * 100).toFixed(1), (r.lowest * 100).toFixed(1));
    expect(r.n).toBeGreaterThan(10);
    expect(r.over1, `${b} ${v} : ${r.over1} appuis sur ${r.n} glissent de plus d'1 cm (max ${(r.max * 100).toFixed(1)} cm)`).toBe(0);
    expect(r.lowest).toBeGreaterThan(-0.012);
  }, 120000);

  // (critique : agneau qui gambade sur place 3,1 cm (suffolk) et 3,3 cm (islandais) par appui ; chevreau 0,4 cm)
  it.each([['sheep', 'suffolk'], ['sheep', 'islandais_mouton'], ['goat', 'alpine']])('%s %s : le petit qui gambade sur place garde ses sabots qui retombent', (sp, b) => {
    const r = gaitSlips(sp, b, { baby: true }, 0, { action: 'play', secs: 8 });
    if (process.env.RUM_LOG) console.log('GAMBADE', sp, b, r.n, r.over1, (r.max * 100).toFixed(1), (r.lowest * 100).toFixed(1));
    expect(r.n).toBeGreaterThan(4);
    expect(r.max, `${b} : glissement ${(r.max * 100).toFixed(1)} cm`).toBeLessThan(0.01);
    expect(r.lowest).toBeGreaterThan(-0.012);
  }, 120000);
});

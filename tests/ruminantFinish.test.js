// Finitions des ruminants réalistes (moutons, chèvres, vaches) après la critique : sabots des agneaux, des chevreaux et
// de l'Ouessant qui ne glissent plus (aux allures et en gambadant sur place), version réduite à la vraie distance de la
// caméra du téléphone, licol et masque visibles, chèvre qui ne traverse plus la barrière, robes (Hereford, taureaux pie).
// GLB chargés dans node sans textures ; tout est déterministe (pas de temps fixe, aucun tirage au hasard).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealSheepModel, animateRealSheep, SHEEP_LOD_DIST } from '../src/game/models/sheepReal.js';
import { buildRealGoatModel, animateRealGoat, GOAT_LOD_DIST, FENCE_RAIL } from '../src/game/models/goatReal.js';
import { buildRealCowModel, animateRealCow, COW_LOD_DIST } from '../src/game/models/cowReal.js';
import { horseView } from '../src/game/models/horseReal.js';
import { gfx } from '../src/game/gfx.js';
import { buildGear } from '../src/game/gearModels.js';
import { resolveLook, createAnimal, growthScale } from '../src/sim/animal.js';
import { loadRealSheepGltf } from './fixtures/realSheepGltf.js';
import { loadRealGoatGltf } from './fixtures/realGoatGltf.js';
import { loadRealCowGltf } from './fixtures/realCowGltf.js';

let GS;
let GG;
let GC;
beforeAll(async () => {
  GS = await loadRealSheepGltf();
  GG = await loadRealGoatGltf();
  GC = await loadRealCowGltf();
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

/** Entité minimale (comme AnimalEntity) autour d'un modèle, à la taille de l'animal, posée à l'origine. */
const entity = (md, a, scale) => {
  const root = new THREE.Group();
  const sg = new THREE.Group();
  sg.scale.setScalar(scale);
  sg.add(md.root);
  root.add(sg);
  root.updateMatrixWorld(true);
  const e = { model: md, root, scale, heading: 0, speed: 0, state: 'idle', time: 3, phase: 1.3, timer: 99, data: a, stage: 'adult', partner: null, target: new THREE.Vector3() };
  Object.defineProperty(e, 'position', { get: () => root.position });
  return e;
};

describe('version réduite à la vraie distance de la caméra du téléphone', () => {
  // (critique : caméra normale du téléphone — rig.dist 7 derrière la joueuse — : moutons et chèvres à 9-11 m de l'œil,
  // vaches à 10-14 m, tous en version réduite (seuils 7 et 12 m, divisés par la taille : le veau et le chevreau
  // passaient en version réduite à 3,5-6 m) ; mèches de l'islandais, poil long des chèvres et de la Highland cachés,
  // animation une image sur deux)
  const lodAt = (sp, breed, days, dist, quality = 'low') => {
    const a = createAnimal({ species: sp, breed, sex: 'f', colorIndex: 0, ageDays: days, seed: 7, rng: () => 0.42 });
    const baby = days < 8;
    const stage = baby ? { calf: true, lamb: true, kid: true } : {};
    const build = { sheep: buildRealSheepModel, goat: buildRealGoatModel, cow: buildRealCowModel }[sp];
    const G = { sheep: GS, goat: GG, cow: GC }[sp];
    const md = build({ ...a.look, sex: 'f', ...stage }, breed, G);
    const e = entity(md, a, a.look.scale * growthScale(a));
    const anim = { sheep: animateRealSheep, goat: animateRealGoat, cow: animateRealCow }[sp];
    const q0 = gfx.quality;
    gfx.quality = quality;
    horseView.on = true;
    horseView.eye.set(0, 1.6, dist);
    try {
      for (let f = 0; f < 3; f++) {
        horseView.frame++;
        anim(e, 1 / 30, false);
      }
    } finally {
      horseView.on = false;
      gfx.quality = q0;
    }
    const r = { lod: md.lodLevel, hair: (md.hair ?? md.locks)?.visible ?? null };
    md.dispose?.();
    return r;
  };

  it('seuils en basse : 15 m pour le mouton et la chèvre, 16 m pour la vache (la haute inchangée)', () => {
    expect(SHEEP_LOD_DIST).toEqual({ low: 15, high: 18 });
    expect(GOAT_LOD_DIST).toEqual({ low: 15, high: 18 });
    expect(COW_LOD_DIST).toEqual({ low: 16, high: 26 });
  });

  it.each([
    ['sheep', 'islandais_mouton', 80, 12.5, 0], ['sheep', 'islandais_mouton', 80, 17, 1], ['sheep', 'merinos', 3, 10.5, 0],
    ['goat', 'poitevine', 80, 12.5, 0], ['goat', 'alpine', 3, 9.5, 0], ['goat', 'col_noir', 80, 17.5, 1],
    ['cow', 'highland', 80, 13.5, 0], ['cow', 'holstein', 3, 11, 0], ['cow', 'holstein', 80, 18.5, 1],
  ])('%s %s (%s j) à %s m de l\'œil : version %s', (sp, breed, days, dist, want) => {
    const r = lodAt(sp, breed, days, dist);
    expect(r.lod).toBe(want);
    // (mèches et poil long montrés de près, cachés au loin)
    if (r.hair !== null) expect(r.hair).toBe(want === 0);
  }, 60000);
});

describe('licol et masque anti-mouches sur la vraie tête (vache, taureau, veau, chèvre)', () => {
  // (critique : licol générique taillé pour la tête procédurale — rien ne se voyait sur la vache, le taureau ou le veau,
  // un V rouge sur le nez de la chèvre — ; masque anti-mouches (une demi-sphère) caché dans le crâne)
  const gearOn = (sp, breed, o, gear) => {
    const look = { ...resolveLook(sp, breed, 0), seed: 4242, sex: o.sex ?? 'f', ...(o.baby ? { calf: true, kid: true } : {}) };
    const md = sp === 'cow' ? buildRealCowModel(look, breed, GC) : buildRealGoatModel(look, breed, GG);
    const g = buildGear(md, look, gear);
    md.root.updateMatrixWorld(true);
    return { md, g, look };
  };
  const _d = new THREE.Vector3();
  /**
   * Sommets de la peau de la tête (repos, monde) et leurs normales — sans les oreilles (la têtière passe sous elles,
   * comme un vrai licol) ni la barbe de la chèvre (des poils qui pendent).
   */
  const headSkin = (md) => {
    const P = md.anim.base.prim;
    const names = md.anim.base.names;
    const geo = md.mesh.geometry;
    const nrm = geo.attributes.normal;
    const out = [];
    const v = new THREE.Vector3();
    for (let i = 0; i < geo.attributes.position.count; i++) {
      if (P.mask[i * 4 + 1] < 0.5 || /^ear/.test(names[P.domBone[i]]) || (md.realGoat && P.part[i * 4 + 2] > 0.3)) continue;
      md.mesh.getVertexPosition(i, v).applyMatrix4(md.mesh.matrixWorld);
      out.push([v.clone(), new THREE.Vector3().fromBufferAttribute(nrm, i).transformDirection(md.mesh.matrixWorld), /^horn/.test(names[P.domBone[i]])]);
    }
    return out;
  };
  /**
   * Sommets d'une pièce sous la peau (du côté intérieur de la peau la plus proche) : leur part et la plus grande
   * profondeur (m, négative) de ceux qui sont à moins de 4 cm de la peau.
   */
  const inside = (mesh, skin) => {
    const pos = mesh.geometry.attributes.position;
    const v = new THREE.Vector3();
    let n = 0;
    let bad = 0;
    let worst = 0;
    for (let i = 0; i < pos.count; i += 3) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      let best = Infinity;
      let side = 1;
      for (const [p, nn] of skin) {
        const d = p.distanceToSquared(v);
        if (d < best) {
          best = d;
          side = _d.subVectors(v, p).dot(nn);
        }
      }
      n++;
      if (side < -0.002) bad++;
      if (best < 0.0016) worst = Math.min(worst, side);
    }
    return { part: bad / Math.max(1, n), worst };
  };

  it.each([
    ['cow', 'holstein', {}], ['cow', 'highland', {}], ['cow', 'hereford', { sex: 'm' }], ['cow', 'charolaise', { baby: true }],
    ['goat', 'saanen', {}], ['goat', 'col_noir', { sex: 'm' }], ['goat', 'alpine', { baby: true }],
  ])('%s %s %j : muserolle, têtière, montants et anneau par-dessus la peau, larges comme la tête', (sp, breed, o) => {
    const { md, g } = gearOn(sp, breed, o, { halter: { item: 'halter', color: 'red' } });
    const parts = g.userData.meshes;
    expect(parts.length).toBe(5);
    const skin = headSkin(md);
    // (muserolle et montants : par-dessus la peau, à 1 cm près ; têtière : à 3 cm près au pied des cornes, que la race
    // allonge et tourne après les mesures — l'ancien licol passait 15 cm sous la peau)
    const [nb0, crown, ch0, ch1] = parts.map((m) => inside(m, skin));
    if (process.env.RUM_LOG) console.log('LICOL', breed, JSON.stringify([nb0, crown, ch0, ch1]));
    for (const [r, tag] of [[nb0, 'muserolle'], [ch0, 'montant'], [ch1, 'montant']]) {
      expect(r.part, `${breed} ${tag}`).toBeLessThan(0.08);
      expect(r.worst, `${breed} ${tag}`).toBeGreaterThan(-0.01);
    }
    expect(crown.worst, `${breed} têtière`).toBeGreaterThan(-0.03);
    // (la muserolle fait le tour du museau : plus large que le tiers de la tête vue de face)
    const nb = new THREE.Box3().setFromObject(parts[0]);
    const hb = new THREE.Box3();
    for (const [p, , horn] of skin) if (!horn) hb.expandByPoint(p);
    expect(nb.max.x - nb.min.x).toBeGreaterThan(0.35 * (hb.max.x - hb.min.x));
    // (l'anneau de la longe sous le menton, sous la nuque ; la longe y est attachée)
    const ring = parts[4].getWorldPosition(new THREE.Vector3());
    const lp = md.leashPoint.getWorldPosition(new THREE.Vector3());
    expect(ring.distanceTo(lp)).toBeLessThan(0.03);
    expect(ring.y).toBeLessThan(md.headBone.getWorldPosition(new THREE.Vector3()).y);
    md.dispose?.();
  });

  it('masque anti-mouches de la vache : une coque par-dessus le front et les yeux (plus une demi-sphère dans le crâne)', () => {
    for (const breed of ['holstein', 'highland']) {
      const { md, g } = gearOn('cow', breed, {}, { head: { item: 'flyMask', color: 'sky' } });
      const [shellMesh] = g.userData.meshes;
      expect(shellMesh.material.transparent).toBe(true);
      expect(inside(shellMesh, headSkin(md)).worst).toBeGreaterThan(-0.03);
      // (elle couvre les yeux : elle passe au-dessus et en dessous de la hauteur des yeux)
      const box = new THREE.Box3().setFromObject(shellMesh);
      const eyeY = md.anim.S.measure.eye.y * md.size;
      expect(box.min.y).toBeLessThan(eyeY);
      expect(box.max.y).toBeGreaterThan(eyeY);
      md.dispose?.();
    }
  });
});

describe('chèvre contre la barrière (en jeu : browseFence)', () => {
  // (critique : en s'avançant et en reculant, 14 à 82 sommets de la tête — barbe, cornes, mâchoire — dans la lisse du
  // haut ; dressées, les onglons de l'alpine et de la poitevine dans la lisse ; se dresser et redescendre en 0,77 s, les
  // antérieurs jusqu'à 10 cm par image)
  const RAIL_Z = 1.2;
  const soleLow = (md, k) => {
    let lo = Infinity;
    for (const p of md.anim.solePts[k]) lo = Math.min(lo, p.clone().applyMatrix4(md.legs[k].paw.matrixWorld).y);
    return lo;
  };
  const fenceRun = (breed, sex) => {
    const a = createAnimal({ species: 'goat', breed, sex, colorIndex: 0, ageDays: 80, seed: 7, rng: () => 0.42 });
    const md = buildRealGoatModel({ ...a.look, sex }, breed, GG);
    const e = entity(md, a, a.look.scale * growthScale(a));
    // (bergerie : la barrière de devant, le long de x, à 1,2 m devant la chèvre ; celle du fond, loin derrière)
    e.world = { fences: [{ core: 'pen', x: 0, z: RAIL_Z, hw: 3, hd: 0.04 }, { core: 'pen', x: 0, z: -5, hw: 3, hd: 0.04 }], heightAt: () => 0 };
    const m = md.mesh;
    const pos = m.geometry.attributes.position;
    const V = new THREE.Vector3();
    const anim = md.anim;
    anim.browseCheck = 0.05;
    const out = { phases: new Set(), railHits: 0, railFrames: 0, rearUpFrames: 0, rearDownFrames: 0, frontStepMax: 0, upFront: [], upHind: [] };
    const prevF = [null, null];
    const rnd = Math.random;
    Math.random = () => 0.2; // (la barrière est choisie, la durée dressée fixée : 7,2 s)
    try {
      for (let f = 0; f < 900; f++) {
        e.time += 1 / 30;
        anim.seen = true;
        md.lodHold = true;
        animateRealGoat(e, 1 / 30, false);
        e.root.updateMatrixWorld(true);
        const b = e.goatBrowse;
        if (!b) {
          if (out.phases.size) break;
          continue;
        }
        out.phases.add(b.phase);
        if (b.phase === 'go') continue;
        const tr = anim.trans?.name;
        if (tr === 'rear_up') out.rearUpFrames++;
        if (tr === 'rear_down') out.rearDownFrames++;
        for (let l = 0; l < 2; l++) {
          const c = new THREE.Vector3();
          for (const sp of anim.solePts[l]) c.add(V.copy(sp).applyMatrix4(md.legs[l].paw.matrixWorld));
          c.multiplyScalar(1 / anim.solePts[l].length);
          if (prevF[l] && tr) out.frontStepMax = Math.max(out.frontStepMax, c.distanceTo(prevF[l]));
          prevF[l] = c;
        }
        if ((b.phase === 'up' || b.phase === 'off') && !tr && b.t > 1.5) {
          out.upFront.push(Math.min(soleLow(md, 0), soleLow(md, 1)) - FENCE_RAIL);
          out.upHind.push(Math.min(soleLow(md, 2), soleLow(md, 3)));
        }
        if (f % 2) continue;
        // (sommets de la peau dans les lisses : centrées à 0,45 et 0,9 m, 10 cm de haut, 8 cm d'épaisseur — les onglons
        // posés sur la lisse du haut, à 0,95 m, la touchent sans y entrer)
        let hits = 0;
        for (let i = 0; i < pos.count; i++) {
          V.fromBufferAttribute(pos, i);
          m.applyBoneTransform(i, V);
          V.applyMatrix4(m.matrixWorld);
          if (Math.abs(V.z - RAIL_Z) < 0.04 && (Math.abs(V.y - 0.45) < 0.05 || Math.abs(V.y - 0.9) < 0.05)) hits++;
        }
        out.railHits = Math.max(out.railHits, hits);
        if (hits) out.railFrames++;
      }
    } finally {
      Math.random = rnd;
    }
    out.done = !e.goatBrowse;
    md.dispose?.();
    return out;
  };

  it.each([['alpine', 'f'], ['col_noir', 'm']])('%s (%s) : ni la tête ni les sabots dans les lisses, onglons posés sur la lisse du haut, se dresse en 1,1 s', (breed, sex) => {
    const r = fenceRun(breed, sex);
    if (process.env.RUM_LOG) console.log('BARRIERE', breed, JSON.stringify({ ...r, phases: [...r.phases], upFront: [Math.min(...r.upFront), Math.max(...r.upFront)], upHind: [Math.min(...r.upHind), Math.max(...r.upHind)] }));
    expect([...r.phases]).toEqual(expect.arrayContaining(['step', 'settle', 'up', 'off', 'down', 'back']));
    expect(r.done).toBe(true);
    expect(r.railHits, `${breed} : ${r.railHits} sommets dans une lisse (${r.railFrames} images)`).toBe(0);
    // (dressée : la sole des antérieurs 0 à 2,5 cm au-dessus du dessus de la lisse, les postérieurs au sol)
    expect(r.upFront.length).toBeGreaterThan(60);
    expect(Math.min(...r.upFront)).toBeGreaterThan(-0.002);
    expect(Math.max(...r.upFront)).toBeLessThan(0.025);
    expect(Math.min(...r.upHind)).toBeGreaterThan(-0.012);
    expect(Math.max(...r.upHind)).toBeLessThan(0.02);
    // (se dresser et redescendre : ≈ 1,1 s chacun, les antérieurs à moins de 8,5 cm par image)
    expect(r.rearUpFrames).toBeGreaterThanOrEqual(30);
    expect(r.rearDownFrames).toBeGreaterThanOrEqual(30);
    expect(r.frontStepMax).toBeLessThan(0.085);
  }, 120000);
});

describe('poil long des chèvres (col noir, poitevine)', () => {
  // (critique : mèches claires de l'arrière du col noir en « plumes » qui se chevauchent, languettes sombres qui dépassent
  // du dessus de l'encolure)
  it.each([['col_noir', 'f'], ['col_noir', 'm'], ['poitevine', 'f']])('%s (%s) : mèches étroites, aucune devant les épaules', (breed, sex) => {
    const md = buildRealGoatModel(lookOf('goat', breed, { sex }), breed, GG);
    const M = md.anim.S.measure;
    const g = md.hair.geometry;
    const top = g.attributes.hairTop;
    const pos = g.attributes.position;
    let zMax = -Infinity;
    for (let i = 0; i < top.count; i++) zMax = Math.max(zMax, top.getZ(i));
    // (racines derrière les épaules : rien sur l'encolure)
    expect(zMax).toBeLessThan(M.shZ - 0.02);
    // (largeur d'une mèche : les deux sommets d'un même rang, au plus 6,6 cm au tiers de sa longueur)
    let wMax = 0;
    for (let v = 0; v + 1 < pos.count; v += 2) {
      wMax = Math.max(wMax, Math.hypot(pos.getX(v) - pos.getX(v + 1), pos.getY(v) - pos.getY(v + 1), pos.getZ(v) - pos.getZ(v + 1)));
    }
    // (l'ondulation déplace les deux bords ensemble : elle ne change pas la largeur ; 9,2 cm avant)
    expect(wMax).toBeLessThan(0.068);
    expect(g.userData.cards).toBeGreaterThan(80);
    md.dispose?.();
  });
});

describe('mèches couchées : jamais sous le sol (islandais, poil long des chèvres et de la Highland)', () => {
  // (critique : islandais couché, les longues mèches pendaient droit sous le ventre et entraient dans le sol)
  it('le sol sous l\'animal est donné aux mèches et le shader y pose leur bout', () => {
    const md = buildRealSheepModel(lookOf('sheep', 'islandais_mouton'), 'islandais_mouton', GS);
    const g = new THREE.Group();
    g.position.set(1, 0.3, -2);
    g.add(md.root);
    g.updateMatrixWorld(true);
    const st = { v: 0, moving: false, size: 1, posture: 'lie', action: null };
    for (let i = 0; i < 90; i++) {
      md.anim.update(1 / 30, st);
      g.updateMatrixWorld(true);
    }
    const lu = md.lockUniforms;
    expect(lu.hState.value.y).toBeGreaterThan(0.8);
    expect(lu.hFloor.value).toBeCloseTo(0.305, 3);
    // (le shader des mèches : après le squelette, le sommet sous le sol remonte au sol)
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    md.locks.material.onBeforeCompile(sh);
    expect(sh.uniforms.hFloor).toBe(lu.hFloor);
    const iSkin = sh.vertexShader.indexOf('#include <skinning_vertex>');
    const iClamp = sh.vertexShader.indexOf('hFloor - hw.y');
    expect(iSkin).toBeGreaterThan(0);
    expect(iClamp).toBeGreaterThan(iSkin);
    expect(iClamp).toBeLessThan(sh.vertexShader.indexOf('#include <project_vertex>'));
    md.dispose?.();
  });
});

// Corrections des vaches réalistes après les contre-vérifications (beauté et jeu) : grain sans taches fantômes, ventre
// blanc net, chignon des vaches sans cornes et des veaux, poil long de la Highland, mangeoire, sabots des veaux, sol en se
// couchant, cornes de la Hérens, taureau dans le van. GLB chargés dans node sans textures ; tout est déterministe (pas de
// temps fixe, aucun tirage au hasard).
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { buildRealCowModel, POLL_CAP, animateRealCow, FEED_Y } from '../src/game/models/cowReal.js';
import { COW_GRAIN, makeCowUniforms, setCowCoat, cowMaterial } from '../src/game/models/cowCoat.js';
import { cowBuild } from '../src/sim/cowLook.js';
import { resolveLook, createAnimal, growthScale } from '../src/sim/animal.js';
import { loadRealCowGltf } from './fixtures/realCowGltf.js';

let G;
beforeAll(async () => {
  G = await loadRealCowGltf();
}, 120000);

const lookOf = (breed, o = {}) => ({
  ...resolveLook('cow', breed, o.color ?? 0), seed: 4242, sex: o.sex ?? 'f', ...(o.calf ? { calf: true } : {}), ...(o.young ? { young: true } : {}),
  ...(o.udderFill !== undefined ? { udderFill: o.udderFill } : {}),
});
const cow = (breed, o = {}) => buildRealCowModel(lookOf(breed, o), breed, G);
const _v = new THREE.Vector3();

describe('robe', () => {
  it('grain ramené à la même clarté dans les anciennes taches de la photo et hors taches (vache) ; rien pour le taureau', () => {
    const [kOut, kIn] = COW_GRAIN.cow;
    // (mesuré à l'écran : rapport 1,10 entre les deux champs ; la robe garde sa clarté moyenne — 28 % de taches)
    expect(kIn / kOut).toBeGreaterThan(1.08);
    expect(kIn / kOut).toBeLessThan(1.12);
    expect(0.28 * kIn + 0.72 * kOut).toBeGreaterThan(0.98);
    expect(0.28 * kIn + 0.72 * kOut).toBeLessThan(1.02);
    expect(COW_GRAIN.bull).toEqual([1, 1]);
    for (const [kind, k] of [['cow', COW_GRAIN.cow], ['bull', COW_GRAIN.bull]]) {
      const u = makeCowUniforms();
      setCowCoat(u, cowBuild(lookOf('retinta'), { breed: 'retinta', sex: kind === 'bull' ? 'm' : 'f' }), kind);
      expect([u.cGrain.value.x, u.cGrain.value.y]).toEqual(k);
    }
    // (le shader applique le facteur au grain d'après le champ des taches du masque)
    const { mat } = cowMaterial(null, makeCowUniforms());
    const sh = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
    mat.onBeforeCompile(sh);
    expect(sh.fragmentShader).toMatch(/mix\(cGrain\.x, cGrain\.y, smoothstep\(0\.4, 0\.6, mk\.r\)\)/);
    // (ventre blanc par une ligne nette — plus de rampe grise de 28 % de la hauteur du tronc, tache effacée à 80 %)
    expect(sh.fragmentShader).toMatch(/bellyW = smoothstep\(-0\.012, 0\.012, wb\)/);
    expect(sh.fragmentShader).not.toMatch(/belly \* 0\.8/);
  });
});

describe('sans cornes : un chignon, plus de pyramides', () => {
  /** Plus grande distance des sommets de la corne gauche (poids > 0,3) à la base de son os, en unités du modèle et de la tête (le veau a la tête 1,3 fois plus grosse). */
  const hornReach = (md) => {
    md.root.updateMatrixWorld(true);
    const P = md.anim.base.prim;
    const o = md.bone('hornL').getWorldPosition(new THREE.Vector3());
    const s = md.root.scale.x * md.headBone.scale.x;
    let far = 0;
    for (let i = 0; i < P.count; i++) {
      if (P.part[i * 4] < 0.3 || P.pos[i * 3] < 0) continue;
      md.mesh.getVertexPosition(i, _v).applyMatrix4(md.mesh.matrixWorld);
      far = Math.max(far, _v.distanceTo(o) / s);
    }
    return far;
  };
  /** Plus grand étirement des arêtes qui touchent la corne (longueur posée / longueur au repos du modèle). */
  const hornStretch = (md) => {
    md.root.updateMatrixWorld(true);
    const P = md.anim.base.prim;
    const idx = md.mesh.geometry.index.array;
    const s = md.root.scale.x;
    const w = (i) => md.mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(md.mesh.matrixWorld).divideScalar(s);
    let worst = 0;
    for (let t = 0; t < idx.length; t += 3) {
      for (let e = 0; e < 3; e++) {
        const a = idx[t + e];
        const b = idx[t + ((e + 1) % 3)];
        if (P.part[a * 4] < 0.1 && P.part[b * 4] < 0.1) continue;
        const rest = Math.hypot(P.pos[a * 3] - P.pos[b * 3], P.pos[a * 3 + 1] - P.pos[b * 3 + 1], P.pos[a * 3 + 2] - P.pos[b * 3 + 2]);
        if (rest < 1e-4) continue;
        worst = Math.max(worst, w(a).distanceTo(w(b)) / rest);
      }
    }
    return worst;
  };

  it('Angus, Charolaise et les veaux : corne écrasée en bosse (moins de 8,5 cm de la base, plus de 12 cm pour une corne), peinte de la robe, peau jamais étirée', () => {
    const horned = cow('holstein');
    horned.staticPose('stand');
    expect(hornReach(horned)).toBeGreaterThan(0.12);
    horned.dispose();
    for (const [b, o] of [['angus', {}], ['charolaise', {}], ['wagyu', { calf: true }], ['herens', { calf: true }], ['highland', { calf: true }], ['holstein', { calf: true }]]) {
      const md = cow(b, o);
      const tag = `${b} ${JSON.stringify(o)}`;
      md.staticPose('stand');
      expect(md.build.hornSize, tag).toBe(0);
      expect(hornReach(md), tag).toBeLessThan(0.085);
      expect(hornStretch(md), tag).toBeLessThan(2.6);
      // (aucun sommet peint couleur corne)
      const part = md.mesh.geometry.attributes.cowPart.array;
      let horn = 0;
      for (let i = 0; i < part.length; i += 4) horn = Math.max(horn, part[i]);
      expect(horn, tag).toBe(0);
      md.dispose();
    }
    // (le veau a de petits boutons de corne, l'adulte sans cornes un chignon à peine bombé)
    expect(POLL_CAP.calf).toBeGreaterThan(POLL_CAP.adult);
  });

  it('les races à cornes gardent leurs cornes couleur corne (Holstein, Normande, génisse Highland)', () => {
    for (const [b, o] of [['holstein', {}], ['normande', {}], ['highland', { young: true }]]) {
      const md = cow(b, o);
      const part = md.mesh.geometry.attributes.cowPart.array;
      let horn = 0;
      for (let i = 0; i < part.length; i += 4) horn = Math.max(horn, part[i]);
      expect(horn, b).toBeGreaterThan(0.9);
      md.dispose();
    }
  });
});

describe('poil long de la Highland', () => {
  it('mèches serrées en cartes croisées, étroites ; frange dense ; veau poilu (70 % de la longueur, toute la densité)', () => {
    const f = cow('highland');
    const calf = cow('highland', { calf: true });
    const g = f.hair.geometry;
    // (plus de 2 000 cartes : 1 100 mèches sur le corps, la frange, deux cartes croisées par mèche — il y en avait 920)
    expect(g.userData.cards).toBeGreaterThan(2000);
    expect(g.userData.cards % 2).toBe(0);
    // (cartes étroites : 4,8 cm au plus à leur plus large, au lieu de 7,2 cm — feuilles plates)
    const pos = g.attributes.position.array;
    const uv = g.attributes.uv.array;
    let widest = 0;
    for (let v = 0; v + 1 < pos.length / 3; v += 2) {
      if (Math.abs(uv[v * 2 + 1] - 1 / 3) > 1e-3) continue;
      widest = Math.max(widest, Math.hypot(pos[v * 3] - pos[v * 3 + 3], pos[v * 3 + 1] - pos[v * 3 + 4], pos[v * 3 + 2] - pos[v * 3 + 5]));
    }
    expect(widest).toBeLessThan(0.05);
    // (veau : poil à 75 % de celui de l'adulte, frange à 70 %, presque autant de mèches)
    expect(calf.build.hair).toBeGreaterThan(0.7 * f.build.hair);
    expect(calf.build.fringe).toBeGreaterThan(0.65 * f.build.fringe);
    expect(calf.hair.geometry.userData.cards).toBeGreaterThan(0.9 * g.userData.cards);
    f.dispose();
    calf.dispose();
  });
});

/** Le modèle dans un groupe à la taille de l'animal (look.scale), comme dans le jeu (AnimalEntity.scaleGroup). */
const inScene = (md, scale) => {
  const g = new THREE.Group();
  g.scale.setScalar(scale);
  g.add(md.root);
  g.updateMatrixWorld(true);
  return g;
};
const st = (o = {}) => ({ v: 0, moving: false, size: 1, posture: 'stand', action: null, ...o });
/** Sole la plus basse d'un pied (repère du monde). */
const soleLow = (md, k) => {
  md.root.updateMatrixWorld(true);
  let lo = Infinity;
  for (const p of md.anim.solePts[k]) lo = Math.min(lo, p.clone().applyMatrix4(md.legs[k].paw.matrixWorld).y);
  return lo;
};

describe('mangeoire de la bergerie', () => {
  it('toutes les races, petites comprises (Highland, Hérens, Bretonne), et les taureaux : la bouche au foin (62 cm), sabots au sol', () => {
    const out = {};
    for (const [b, o] of [['holstein', {}], ['normande', {}], ['highland', {}], ['herens', {}], ['bretonne_pie_noire', {}], ['charolaise', {}], ['angus', {}],
      ['highland', { sex: 'm' }], ['hereford', { sex: 'm' }], ['holstein', { young: true }]]) {
      const look = lookOf(b, o);
      const md = buildRealCowModel(look, b, G);
      const s = look.scale ?? 1;
      inScene(md, s);
      md.staticPose('stand');
      let front = -Infinity;
      for (let f = 0; f < 180; f++) {
        md.anim.update(1 / 30, st({ action: 'eat', reachY: 0.62, size: s }));
        md.root.parent.updateMatrixWorld(true);
        if (f > 120) front = Math.max(front, Math.min(soleLow(md, 0), soleLow(md, 1)));
      }
      out[`${b} ${JSON.stringify(o)}`] = { mouth: md.anim.mouthW?.y ?? -1, front };
      md.dispose();
    }
    if (process.env.COW_LOG) console.log('BOUCHES', JSON.stringify(out));
    for (const [tag, r] of Object.entries(out)) {
      expect(Math.abs(r.mouth - 0.62), tag).toBeLessThan(0.05);
      // (sabots avant posés : la Holstein relevait déjà ses antérieurs de 1,2 cm à l'auge)
      expect(r.front, `${tag} sabots avant`).toBeLessThan(0.015);
    }
  });
});

/** Entité minimale (comme AnimalEntity) autour d'un modèle, à la taille de l'animal. */
const entity = (md, a, scale) => {
  const root = new THREE.Group();
  const sg = new THREE.Group();
  sg.scale.setScalar(scale);
  sg.add(md.root);
  root.add(sg);
  const e = { model: md, root, scale, heading: 0, speed: 0, state: 'idle', time: 3, phase: 1.3, timer: 99, data: a, stage: 'adult', partner: null, target: new THREE.Vector3() };
  Object.defineProperty(e, 'position', { get: () => root.position });
  return e;
};

describe('mangeoire : le veau, trop petit, mange le foin tombé au pied', () => {
  it('à la mangeoire de la bergerie, la vache et la génisse mangent le foin à sa hauteur, le veau broute au pied', () => {
    for (const [days, want] of [[80, 'eat'], [14, 'eat'], [3, 'graze']]) {
      const a = createAnimal({ species: 'cow', breed: 'highland', sex: 'f', colorIndex: 0, ageDays: days, seed: 7, rng: () => 0.42 });
      const stage = days < 8 ? { calf: true } : days < 24 ? { young: true } : {};
      const md = buildRealCowModel({ ...a.look, sex: 'f', ...stage }, 'highland', G);
      const e = entity(md, a, a.look.scale * growthScale(a));
      e.state = 'eat';
      e.goal = { eq: { type: 'penFeeder' } };
      for (let f = 0; f < 30; f++) animateRealCow(e, 1 / 30, false);
      expect(e.cowSt.action, `${days} j`).toBe(want);
      expect(e.cowSt.reachY, `${days} j`).toBe(want === 'eat' ? FEED_Y.penFeeder : null);
      md.dispose();
    }
  });
});

/**
 * Allure ou gambade comme en jeu (mesure de la contre-vérification) : la vache dans son groupe à la taille de l'animal,
 * avancée à la vitesse du jeu (m/s), mixeur à 30 images/s ; après 3 s, glissement de l'onglon pendant chaque appui
 * (sole la plus basse à moins d'1 cm du sol, dans le monde) : liste des glissements (m).
 */
function gaitSlips(breed, o, speed, { secs = 10, action = null } = {}) {
  const look = lookOf(breed, o);
  const md = buildRealCowModel(look, breed, G);
  const s = (look.scale ?? 1) * (o.calf ? 0.5 : 1);
  const g = inScene(md, s);
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
  md.dispose();
  return { slips, lowest, n: slips.length, over1: slips.filter((x) => x > 0.01).length, max: Math.max(0, ...slips) };
}

describe('sabots des veaux', () => {
  it.each([
    ['highland', 1.0], ['holstein', 1.0], ['bretonne_pie_noire', 4.2], ['hereford', 4.2], ['normande', 2.4],
  ])('veau %s à %s m/s : les sabots posés ne glissent pas (pas plus d\'1 cm par appui)', (b, v) => {
    const r = gaitSlips(b, { calf: true }, v);
    if (process.env.COW_LOG) console.log('GLISSE', b, v, r.n, r.over1, (r.max * 100).toFixed(1));
    expect(r.n).toBeGreaterThan(10);
    expect(r.over1, `${b} ${v} : ${r.over1} appuis sur ${r.n} glissent de plus d'1 cm (max ${(r.max * 100).toFixed(1)} cm)`).toBe(0);
  }, 120000);

  it.each(['holstein', 'highland'])('veau %s qui gambade sur place : les sabots qui retombent ne glissent pas', (b) => {
    const r = gaitSlips(b, { calf: true }, 0, { action: 'play', secs: 8 });
    if (process.env.COW_LOG) console.log('GAMBADE', b, r.n, r.over1, (r.max * 100).toFixed(1), (r.lowest * 100).toFixed(1));
    expect(r.n).toBeGreaterThan(8);
    expect(r.max, `${b} : glissement ${(r.max * 100).toFixed(1)} cm`).toBeLessThan(0.01);
    expect(r.lowest).toBeGreaterThan(-0.012);
  }, 120000);
});

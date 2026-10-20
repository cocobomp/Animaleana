// Robes crédibles et finitions de près (plan « cheval beau », étapes 8 et 9) : pommelures contrastées, pie déchiqueté
// en plaques verticales, taches d'appaloosa inégales et auréolées, noir profond, reflet doré, raie de mulet ; œil plus
// grand au bord de paupière foncé, naseau ouvert, oreilles creusées, peau marbrée des gris et des appaloosas, couronne
// des sabots qui descend vers les talons, corne rayée de l'appaloosa. GLB chargé dans node, sans textures ; rien ne
// dépend du hasard (graines fixes).
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import { coatMaterial, coatGold, COAT_LOOKS } from '../src/game/models/horseCoat.js';
import { realHorseBase, buildRealHorseModel, EYE_SCALE, NOSTRIL, EAR_CUP, RIG_BONES } from '../src/game/models/horseReal.js';
import { gfx } from '../src/game/gfx.js';
import { createAnimal } from '../src/sim/animal.js';
import { horseBuild, horseCoatTraits } from '../src/sim/horseLook.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
  realHorseBase(gltf);
}, 60000);

const quality = gfx.quality;
afterEach(() => {
  gfx.quality = quality;
});

const animal = (breed, colorIndex = 0) => createAnimal({ species: 'horse', breed, colorIndex, ageDays: 900, seed: 77 });
const look = (breed, colorIndex = 0) => animal(breed, colorIndex).look;
const horse = (breed, colorIndex = 0) => {
  const a = animal(breed, colorIndex);
  return buildRealHorseModel(a.look, a.breed, gltf);
};
const realOpts = { detail: null, normalMap: null, normalSign: 1, hoofY: 0.12 };
const material = (breed, colorIndex = 0) => {
  const l = look(breed, colorIndex);
  return coatMaterial(l, horseBuild(null, l), null, realOpts);
};
const compile = (m) => {
  const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  m.onBeforeCompile(sh);
  return sh;
};
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;

describe('robes crédibles (étape 8)', () => {
  it('gris pommelé : pommelures nettement plus claires que le fond qui les sépare (écart ≥ 8 %, même là où le motif est le plus faible)', () => {
    const { dark, light } = COAT_LOOKS.dapple;
    // (force du motif : 0,6 au plus faible, 1 au plus fort ; gris pommelé : hGrey = 1)
    for (const zone of [0.6, 1]) {
      const centre = 1 + light * zone;
      const fond = 1 - dark * zone;
      expect(centre / fond - 1).toBeGreaterThanOrEqual(0.08 * 3);
    }
    const m = material('pre', 0);
    expect(m.userData.horseUniforms.hGrey.value).toBe(1);
    const fs = compile(m).fragmentShader;
    expect(fs).toContain(`net * ${dark.toFixed(4)} * zone`);
    expect(fs).toContain(`ctr * ${light.toFixed(4)} * zone`);
    // (gris clair sans pommelures : motif à 0,4)
    expect(material('camargue', 0).userData.horseUniforms.hGrey.value).toBeCloseTo(0.4, 5);
  });

  it('pie : bruit déformé, deux octaves, plaques étirées en hauteur, bord net mais déchiqueté', () => {
    const fs = compile(material('paint', 1)).fragmentShader;
    expect(fs).toContain('vec3 qw = q + w *');
    expect(fs).toContain('P * vec3(1.3, 0.6, 2.0)'); // (moins de détail en hauteur qu'en longueur : plaques verticales)
    expect(fs).toContain(`(hNoise(P * 20.0 + hSeed) - 0.5) * ${COAT_LOOKS.pinto.jag.toFixed(4)}`);
    expect(fs).toContain('fwidth(t)'); // (bord net, sans escalier)
  });

  it('léopard et couverture : taches de tailles inégales, plus nombreuses vers l\'arrière, auréolées', () => {
    const { rMin, rMax, halo } = COAT_LOOKS.spots;
    expect(rMax / rMin).toBeGreaterThan(2.5);
    expect(halo).toBeGreaterThan(0.04);
    for (const ci of [0, 1]) {
      const m = material('appaloosa', ci);
      const u = m.userData.horseUniforms;
      expect(u.hLeopard.value + u.hBlanket.value).toBe(1);
      // peau marbrée de rose autour des yeux et du nez, sabots rayés
      expect(u.hSkinMot.value).toBe(1);
      expect(u.hSkinPink.value).toBe(1);
      expect(u.hHoofStripe.value).toBe(1);
      const fs = compile(m).fragmentShader;
      expect(fs).toContain('float rear = smoothstep(0.35, -0.55, P.z)');
      expect(fs).toContain('float halo =');
    }
  });

  it('noir profond : poil plus lisse, moins de voile du ciel, reflet brun chaud ; grain du poil dans la rugosité', () => {
    gfx.quality = 'high';
    const m = material('frison', 0);
    expect(m.roughness).toBeLessThan(0.45);
    expect(m.specularIntensity).toBeLessThan(1);
    expect(m.sheenColor.r).toBeGreaterThan(m.sheenColor.b);
    const bay = material('selle_francais', 0);
    expect(bay.specularIntensity).toBe(1);
    expect(compile(m).fragmentShader).toContain('0.78 + 0.44 * hGrainV');
  });

  it('palomino et alezan : reflet doré (pas un reflet blanc) ; les parties noires d\'un bai gardent un reflet neutre', () => {
    gfx.quality = 'high';
    expect(coatGold(look('quarter', 1))).toBe(1); // palomino
    expect(coatGold(look('selle_francais', 1))).toBe(1); // alezan
    expect(coatGold(look('pre', 0))).toBe(0); // gris
    expect(coatGold(look('frison', 0))).toBe(0); // noir
    expect(coatGold(look('appaloosa', 0))).toBe(0); // léopard (robe blanche)
    for (const [breed, ci] of [['quarter', 1], ['selle_francais', 1]]) {
      const m = material(breed, ci);
      const u = m.userData.horseUniforms;
      expect(u.hGold.value).toBe(1);
      const t = u.hRimTint.value;
      expect(t.r).toBeGreaterThan(t.b * 1.3);
      const sc = m.sheenColor;
      const hsl = sc.getHSL({}, THREE.SRGBColorSpace);
      expect(hsl.h * 360).toBeGreaterThan(25);
      expect(hsl.h * 360).toBeLessThan(55);
      expect(sc.r).toBeGreaterThan(sc.b * 1.5);
    }
    // pommelures de santé : marquées sur le palomino (robe dorée claire), à peine sur le bai, aucune sur un gris
    expect(material('quarter', 1).userData.horseUniforms.hGoldDap.value).toBe(1);
    expect(material('selle_francais', 0).userData.horseUniforms.hGoldDap.value).toBeLessThan(0.4);
    expect(material('pre', 0).userData.horseUniforms.hGoldDap.value).toBe(0);
    expect(COAT_LOOKS.bloom.dark).toBeLessThan(COAT_LOOKS.dapple.dark / 2);
    const fs = compile(material('selle_francais', 0)).fragmentShader;
    expect(fs).toContain('mix( hRimTint, vec3( 1.0 ), hDarkV * hGold )');
    expect(fs).toContain('hDarkV * hGold ) * ( 1.0 - hBare )');
  });

  it('isabelle : raie de mulet plus large (≥ 2,5 cm) ; gris : peau noire au bout du nez et autour des yeux', () => {
    expect(COAT_LOOKS.dun.stripe).toBeGreaterThanOrEqual(0.025);
    expect(horseCoatTraits(look('fjord', 0)).dun).toBe(1);
    const grey = material('pre', 0).userData.horseUniforms;
    expect(grey.hSkinMot.value).toBeGreaterThan(0.5);
    expect(grey.hSkinPink.value).toBeLessThan(0.5);
    const bay = material('selle_francais', 0).userData.horseUniforms;
    expect(bay.hSkinMot.value).toBe(0);
    expect(bay.hHoofStripe.value).toBe(0);
  });

  it('le shader de la robe se compile en texte complet, en haute comme en basse, pour le cheval réaliste et le sculpté', () => {
    for (const q of ['high', 'low']) {
      gfx.quality = q;
      for (const real of [realOpts, null]) {
        const l = look('paint', 1);
        const sh = compile(coatMaterial(l, horseBuild(null, l), null, real));
        for (const k of ['hEye', 'hNos', 'hHoofA', 'hHoofB']) expect(sh.fragmentShader).toContain(`uniform vec4 ${k};`);
        for (const k of ['hGold', 'hSkinMot', 'hHoofStripe']) expect(sh.fragmentShader).toContain(`uniform float ${k};`);
        const open = (sh.fragmentShader.match(/{/g) ?? []).length;
        const close = (sh.fragmentShader.match(/}/g) ?? []).length;
        expect(open).toBe(close);
      }
    }
  });
});

describe('finitions de près (étape 9)', () => {
  it('œil plus grand (× EYE_SCALE), le pelage écarté autour : rien devant l\'iris, aucune paupière retournée', () => {
    const base = realHorseBase(gltf);
    expect(EYE_SCALE).toBeGreaterThan(1.05);
    const coat = base.prims.coat;
    for (const E of base.eyes) {
      // (rayon du globe : 3,6 cm dans le GLB)
      expect(E.r).toBeCloseTo(0.0361 * EYE_SCALE, 3);
      // aucun sommet du pelage hors du globe devant le milieu de l'ouverture (il cacherait l'iris), ni dans le globe à moins de
      // 0,7 de son rayon (les plis de paupière rentrés derrière le globe restent cachés)
      const v = new THREE.Vector3();
      let front = 0;
      let deep = 0;
      for (let i = 0; i < coat.count; i++) {
        v.fromArray(coat.pos, i * 3).sub(E.c);
        const d = v.length() / E.r;
        if (v.x * E.side < 0.3 * E.r) continue;
        const ang = Math.acos(Math.min(1, v.clone().normalize().dot(E.axis)));
        if (ang < 0.6 * E.cap && d > 1.0 && d < 1.8) front++;
        if (d < 0.7) deep++;
      }
      expect(front).toBe(0);
      expect(deep).toBe(0);
    }
    expect(base.eyes.flips).toBe(0);
  });

  it('œil, naseau et sabots repérés pour le shader de la robe ; bord de paupière foncé, naseau en virgule sombre', () => {
    for (const breed of ['selle_francais', 'arabe', 'shetland', 'lusitanien']) {
      const md = horse(breed);
      const u = md.coatMesh.material.userData.horseUniforms;
      const [ex, ey, ez, er] = u.hEye.value.toArray();
      expect(ex).toBeGreaterThan(0.08);
      expect(ez).toBeGreaterThan(0.1);
      expect(ez).toBeLessThan(0.4);
      expect(er).toBeGreaterThan(0.03);
      expect(Math.abs(ey)).toBeLessThan(0.2);
      const [nx, , nz, nr] = u.hNos.value.toArray();
      expect(nx).toBeGreaterThan(0.04);
      expect(nx).toBeLessThan(0.1);
      expect(nz).toBeGreaterThan(0.8);
      expect(nr).toBe(NOSTRIL.r);
      // sabots : gauche à +x, antérieurs devant les postérieurs
      const A = u.hHoofA.value;
      const B = u.hHoofB.value;
      expect(A.x).toBeGreaterThan(0);
      expect(A.z).toBeLessThan(0);
      expect(A.y).toBeGreaterThan(B.y + 0.5);
      md.dispose();
    }
    const fs = compile(coatMaterial(look('selle_francais'), horseBuild(null, look('selle_francais')), null, realOpts)).fragmentShader;
    expect(fs).toContain('float lidD');
    expect(fs).toContain('c = mix(c, hSkin * 0.32, nos * 0.92)');
    // couronne : plus basse aux talons (0,55 de la hauteur de la pince) : les glomes ne sont plus peints en corne
    expect(fs).toContain('hHoofY * mix(0.55, 1.0,');
  });

  it('naseau ouvert : le sommet au centre du naseau est enfoncé par rapport à ses voisins (plus qu\'au repos)', () => {
    const base = realHorseBase(gltf);
    const md = horse('selle_francais');
    const g = md.coatMesh.geometry;
    const P = g.attributes.position;
    const N = g.attributes.normal;
    const info = g.attributes.hInfo;
    const part = g.attributes.hPart;
    const u = md.coatMesh.material.userData.horseUniforms.hNos.value;
    let best = -1;
    let bd = Infinity;
    for (let i = 0; i < P.count; i++) {
      if (part.getX(i) !== 1 || info.getX(i) <= 0) continue;
      const d = Math.hypot(info.getX(i) - u.x, info.getY(i) - u.y, info.getZ(i) - u.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    expect(bd).toBeLessThan(0.03);
    // voisins (triangles qui touchent ce sommet) : leur moyenne est devant lui
    const idx = g.index.array;
    const nb = new Set();
    for (let t = 0; t < idx.length; t += 3) {
      if (idx[t] === best || idx[t + 1] === best || idx[t + 2] === best) for (let k = 0; k < 3; k++) if (idx[t + k] !== best) nb.add(idx[t + k]);
    }
    const p = new THREE.Vector3().fromBufferAttribute(P, best);
    const avg = new THREE.Vector3();
    for (const k of nb) avg.add(new THREE.Vector3().fromBufferAttribute(P, k));
    avg.multiplyScalar(1 / nb.size);
    const n = new THREE.Vector3().fromBufferAttribute(N, best);
    const after = p.clone().sub(avg).dot(n);
    // même mesure sur le maillage de repos du GLB (selle français : tête mise à l'échelle, sans profil)
    const coat = base.prims.coat;
    const rh = md.snoutTip[2] / base.snout.distanceTo(base.rest[RIG_BONES.indexOf('Head')]);
    const p0 = new THREE.Vector3().fromArray(coat.pos, best * 3);
    const avg0 = new THREE.Vector3();
    for (const k of nb) avg0.add(new THREE.Vector3().fromArray(coat.pos, k * 3));
    avg0.multiplyScalar(1 / nb.size);
    const before = p0.sub(avg0).dot(new THREE.Vector3().fromArray(coat.nrm, best * 3)) * rh;
    expect(after - before).toBeLessThan(-0.001);
    md.dispose();
  });

  it('oreilles creusées : le milieu de la face avant est en retrait de ses bords ; face avant repérée pour le shader', () => {
    expect(EAR_CUP).toBeGreaterThan(0.004);
    const md = horse('selle_francais');
    const g = md.coatMesh.geometry;
    const P = g.attributes.position;
    const Nr = g.attributes.normal;
    const info = g.attributes.hInfo;
    const part = g.attributes.hPart;
    let front = 0;
    let back = 0;
    let n = 0;
    const mid = [];
    const rim = [];
    const nf = new THREE.Vector3();
    for (let i = 0; i < P.count; i++) {
      if (part.getX(i) !== 8 || P.getX(i) < 0) continue;
      const z = info.getZ(i);
      const w = info.getY(i);
      expect(w).toBeGreaterThanOrEqual(-1);
      expect(w).toBeLessThanOrEqual(1);
      expect(z === -1 || (z >= 0 && z <= 1)).toBe(true);
      n++;
      if (z >= 0) front++;
      else back++;
      // face avant de la partie libre de l'oreille gauche
      if (z < 0.99) continue;
      nf.add(new THREE.Vector3().fromBufferAttribute(Nr, i));
      if (Math.abs(w) < 0.3) mid.push(new THREE.Vector3().fromBufferAttribute(P, i));
      else if (Math.abs(w) > 0.8) rim.push(new THREE.Vector3().fromBufferAttribute(P, i));
    }
    expect(front).toBeGreaterThan(n * 0.2);
    expect(back).toBeGreaterThan(n * 0.2);
    expect(mid.length).toBeGreaterThan(3);
    expect(rim.length).toBeGreaterThan(3);
    // (le long de la normale moyenne de la face avant : le milieu est derrière les bords, de quelques mm)
    nf.normalize();
    const dm = mid.reduce((s, v) => s + v.dot(nf), 0) / mid.length;
    const dr = rim.reduce((s, v) => s + v.dot(nf), 0) / rim.length;
    expect(dr - dm).toBeGreaterThan(0.002);
    md.dispose();
  });

  it('finitions sans triangle de plus : pelage, yeux et crins comme avant (aucun cil en cartes)', () => {
    const md = horse('selle_francais');
    expect(md.coatMesh.geometry.index.count / 3).toBe(realHorseBase(gltf).prims.coat.index.length / 3);
    const kinds = new Set();
    const r = md.hairMesh.geometry.attributes.hairRoot;
    for (let i = 0; i < r.count; i++) kinds.add(r.getW(i));
    expect([...kinds].every((k) => [0, 1, 2, 4].includes(k))).toBe(true);
    md.dispose();
  });
});

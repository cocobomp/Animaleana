// Robe propre et satinée (plan « cheval beau », étape 4) : modelé peint adouci, coutures de la carte de relief
// bouchées, satiné et liseré de lumière aussi en qualité basse, Akhal-Teké doré (pas olive), robe noire chaude.
import { describe, it, expect, afterEach } from 'vitest';
import * as THREE from 'three';
import { coatMaterial } from '../src/game/models/horseCoat.js';
import { gfx } from '../src/game/gfx.js';
import { createAnimal } from '../src/sim/animal.js';
import { horseBuild } from '../src/sim/horseLook.js';

const quality = gfx.quality;
afterEach(() => {
  gfx.quality = quality;
});
const animal = (breed, { colorIndex = 0 } = {}) => createAnimal({ species: 'horse', breed, colorIndex, ageDays: 900, seed: 77 });

describe('robe propre et satinée (étape 4)', () => {
  const realOpts = { detail: null, normalMap: null, normalSign: 1, hoofY: 0.05 };
  const compile = (m) => {
    const sh = {
      uniforms: {},
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    m.onBeforeCompile(sh);
    return sh;
  };
  const look = (breed, colorIndex = 0) => animal(breed, { colorIndex }).look;

  it('modelé peint adouci (0,5 ; 0,35 sur les robes claires), coutures de la carte de relief bouchées', () => {
    const bay = coatMaterial(look('selle_francais'), horseBuild(null, look('selle_francais')), null, realOpts);
    expect(bay.userData.horseUniforms.hDetail.value).toBe(0.5);
    const greyLook = { ...look('selle_francais'), coat: 0xd8d4cc, secondary: 0xd8d4cc, mane: 0xe8e4dc };
    const grey = coatMaterial(greyLook, horseBuild(null, greyLook), null, realOpts);
    expect(grey.userData.horseUniforms.hDetail.value).toBe(0.35);
    const sh = compile(bay);
    expect(sh.fragmentShader).toContain('mix(1.0, hDetTex.r * 2.0, hDet)');
    expect(sh.fragmentShader).not.toContain('c *= hDetTex.r * 2.0;');
    expect(sh.fragmentShader).toContain('hCov'); // texels vides des marges remis à plat
    expect(sh.fragmentShader).toContain('reflectedLight.indirectSpecular += hRimL');
    // (direction vers la caméra : vViewPosition va du point vers elle — à l'envers, toute la robe brillait)
    expect(sh.fragmentShader).toContain('vec3 hV = normalize( vViewPosition )');
  });

  it('satiné et liseré aussi en qualité basse (MeshStandard), lumière du ciel partagée', () => {
    gfx.quality = 'low';
    const l = look('frison');
    const m = coatMaterial(l, horseBuild(null, l), null, realOpts);
    expect(m.isMeshPhysicalMaterial).toBeFalsy();
    const sh = compile(m);
    expect(sh.fragmentShader).toContain('hSkyRim');
    expect(sh.uniforms.hSkyRim).toBe(gfx.skyRim);
    expect(sh.uniforms.hFill).toBe(gfx.horseFill);
    // robe noire : reflet brun chaud ; poil satiné (0,45 à 0,5 : plus de taches blanches « latex »), un peu plus
    // lisse que les autres robes ; base relevée vers un noir brun
    expect(m.userData.horseUniforms.hRimTint.value.r).toBeGreaterThan(m.userData.horseUniforms.hRimTint.value.b);
    expect(m.roughness).toBeGreaterThanOrEqual(0.45);
    expect(m.roughness).toBeLessThanOrEqual(0.5);
    const base = m.userData.horseUniforms.hCoat.value;
    expect(base.r).toBeGreaterThanOrEqual(new THREE.Color(l.coat).r);
    expect(base.r).toBeGreaterThan(base.b);
  });

  it('Akhal-Teké : éclat doré par le satiné, plus par le métal (la robe ne reflète plus l\'herbe)', () => {
    gfx.quality = 'high';
    const l = look('akhal_teke');
    const B = horseBuild(null, l);
    const m = coatMaterial(l, { ...B, sheen: B.sheen || 1 }, null, realOpts);
    expect(m.metalness).toBeLessThanOrEqual(0.05);
    expect(m.sheen).toBeGreaterThan(0.8);
    const sc = m.sheenColor;
    expect(sc.r).toBeGreaterThan(sc.b * 1.3); // doré, pas olive ni gris
    // Base réchauffée vers l'or orangé (au pré, la robe crème sortait kaki : teinte du flanc 66°) : teinte de la base
    // entre 30 et 42°, nettement plus orangée que la couleur de la race.
    for (const ci of [0, 1]) {
      const lc = look('akhal_teke', ci);
      const mc = coatMaterial(lc, { ...horseBuild(null, lc), sheen: 1 }, null, realOpts);
      const h = mc.userData.horseUniforms.hCoat.value.getHSL({}, THREE.SRGBColorSpace).h * 360;
      const h0 = new THREE.Color(lc.coat).getHSL({}, THREE.SRGBColorSpace).h * 360;
      expect(h, `couleur ${ci}`).toBeGreaterThan(30);
      expect(h, `couleur ${ci}`).toBeLessThan(42);
      expect(h).toBeLessThan(h0 - 2);
    }
  });

  it('lumière d\'ambiance sans l\'excès de vert du pré sur la robe (vert ramené au rouge ou au bleu, luminance gardée)', () => {
    const l = look('akhal_teke', 1);
    const m = coatMaterial(l, horseBuild(null, l), null, realOpts);
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
    m.onBeforeCompile(sh);
    const fs = sh.fragmentShader;
    expect(fs).toContain('hIr.g = min( hIr.g, max( hIr.r, hIr.b ) * 1.08 );');
    expect(fs).toContain('hIb.g = min( hIb.g, max( hIb.r, hIb.b ) * 1.08 );');
    // (avant les lumières indirectes : elles en tiennent compte)
    expect(fs.indexOf('hIr.g = min')).toBeLessThan(fs.indexOf('#include <lights_fragment_end>'));
  });
});


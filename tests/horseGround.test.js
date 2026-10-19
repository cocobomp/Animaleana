// Cheval posé au sol et net sur téléphone (plan « cheval beau », étape 1) : sable des carrières au ras du
// terrain, ombre de contact et ombres des sabots en qualité basse, version réduite plus loin, définition et
// anticrénelage de l'image (repli si le téléphone est trop lent). GLB chargé dans node, sans textures ; rien ne
// dépend du hasard (instants des clips fixés).
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import { realHorseBase, buildRealHorseModel, LOD_DIST, realLegPose } from '../src/game/models/horseReal.js';
import { sandGeometry, SAND_LIFT, SAND_OFFSET } from '../src/game/models/buildings.js';
import { renderSetup, PixelBudget, SHARP_RATIO, SAFE_RATIO } from '../src/game/pixelBudget.js';
import { gfx } from '../src/game/gfx.js';
import { createAnimal } from '../src/sim/animal.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
  realHorseBase(gltf); // (données de repos tirées une fois ici : le premier test ne dépasse pas son temps)
}, 60000);

const quality = gfx.quality;
afterEach(() => {
  gfx.quality = quality;
});

const animal = (breed, { foal = false, colorIndex = 0 } = {}) => createAnimal({ species: 'horse', breed, colorIndex, ageDays: foal ? 60 : 900, seed: 77 });
const horse = (breed, opts = {}) => {
  const a = animal(breed, opts);
  return buildRealHorseModel(opts.foal ? { ...a.look, foal: true } : a.look, a.breed, gltf);
};

/** Instants des clips fixés (le constructeur de l'animation les tire au hasard) : animation reproductible. */
function fixClips(md) {
  for (const a of Object.values(md.anim.actions)) a.time = 0;
  md.anim.t = 0;
  md.anim.resting = false;
  md.anim.restTimer = 1e9;
}

const still = { v: 0, moving: false, sleeping: false, sad: false, graze: 0, feeder: 0, turn: 0, fat: 1 };

describe('posé au sol (étape 1)', () => {
  it('le sable des carrières est au ras du terrain (maille fine), avec un décalage de profondeur', () => {
    const ground = (x, z) => 0.3 * Math.sin(x * 0.2) + 0.005 * z;
    const geo = sandGeometry(22, 26, ground);
    const p = geo.attributes.position;
    let worst = 0;
    for (let i = 0; i < p.count; i++) worst = Math.max(worst, Math.abs(p.getY(i) - ground(p.getX(i), p.getZ(i)) - SAND_LIFT));
    expect(worst).toBeLessThan(1e-6);
    expect(SAND_LIFT).toBeLessThan(0.01);
    expect(geo.parameters.widthSegments).toBeGreaterThanOrEqual(22 / 1.25);
    expect(SAND_OFFSET.polygonOffset).toBe(true);
    expect(SAND_OFFSET.polygonOffsetFactor).toBeLessThan(0);
  });

  it('qualité basse : ombres sous les sabots (pleines au sol, effacées sabot levé) ; qualité haute : aucune', () => {
    gfx.quality = 'high';
    const hi = horse('selle_francais');
    expect(hi.root.getObjectByName('soleShadows')).toBeUndefined();
    hi.dispose();
    gfx.quality = 'low';
    const md = horse('selle_francais');
    const soles = md.root.getObjectByName('soleShadows');
    expect(soles).toBeTruthy();
    expect(soles.geometry.index.count).toBe(24); // 4 carrés, 8 triangles
    // (l'ombre de contact passe devant un sol posé juste au-dessus du terrain)
    const contact = md.root.children.find((o) => o.isMesh && o !== soles && o.material?.depthWrite === false);
    expect(contact.material.polygonOffset).toBe(true);
    expect(contact.material.opacity).toBeGreaterThanOrEqual(0.7);
    // (à l'arrêt, clip d'arrêt à un instant fixe)
    fixClips(md);
    for (let f = 0; f < 30; f++) md.anim.update(1 / 30, still, {});
    md.root.updateMatrixWorld(true);
    soles.onBeforeRender();
    // les quatre sabots sont posés (uniform hSole : centre de la sole et opacité, lu comme le shader le reçoit)
    const read = () => {
      const sh = { uniforms: {}, vertexShader: '#include <common>\n#include <begin_vertex>', fragmentShader: '#include <common>\n#include <map_fragment>' };
      soles.material.onBeforeCompile(sh);
      return sh.uniforms.hSole.value;
    };
    for (const v of read()) expect(v.w).toBeGreaterThan(0.9);
    // antérieur gauche levé (« donner le sabot ») : son ombre s'efface, celle des autres reste
    realLegPose(md, 'hoof', 1);
    md.root.updateMatrixWorld(true);
    soles.onBeforeRender();
    const after = read();
    expect(after[0].w).toBeLessThan(0.35);
    for (const v of after.slice(1)) expect(v.w).toBeGreaterThan(0.9);
    // chaque ombre est sous son sabot (repère du cheval)
    const fl = md.legs[0];
    expect(Math.sign(after[0].x)).toBe(Math.sign(fl.side));
    md.dispose();
  });

  it('version réduite plus loin en qualité basse (la caméra du jeu voit la version complète)', () => {
    // (cheval de 0,9 à 13 m de la caméra : 14,4 m une fois divisé par sa taille)
    expect(LOD_DIST.low).toBeGreaterThanOrEqual(15);
    expect(LOD_DIST.high).toBeGreaterThan(LOD_DIST.low);
  });
});

describe('définition de l\'image sur téléphone (étape 1)', () => {
  it('qualité basse sur un écran fin : 1,5 pixel par point avec l\'anticrénelage, et surveillance', () => {
    expect(renderSetup('low', 3)).toEqual({ ratio: SHARP_RATIO, msaa: true, budget: true });
    expect(renderSetup('low', 2)).toEqual({ ratio: SHARP_RATIO, msaa: true, budget: true });
    expect(renderSetup('low', 1)).toEqual({ ratio: 1, msaa: false, budget: false });
    expect(renderSetup('low', 1.5)).toEqual({ ratio: SAFE_RATIO, msaa: false, budget: false });
    expect(renderSetup('high', 3)).toEqual({ ratio: 2, msaa: true, budget: false });
    expect(renderSetup('high', 1)).toEqual({ ratio: 1, msaa: true, budget: false });
    expect(renderSetup('low', NaN).ratio).toBe(1);
  });

  it('repli à 1,25 si les premières secondes sont trop lentes, une seule fois', () => {
    const b = new PixelBudget();
    const out = [];
    for (let i = 0; i < 400 && !b.done; i++) out.push(b.frame(0.03, SHARP_RATIO));
    expect(b.done).toBe(true);
    expect(out.filter((r) => r !== null)).toEqual([SAFE_RATIO]);
    expect(b.frame(0.03, SHARP_RATIO)).toBeNull();
  });

  it('pas de repli si le jeu est fluide, ni pour quelques à-coups (chargements)', () => {
    const b = new PixelBudget();
    let r = null;
    for (let i = 0; i < 600 && !b.done; i++) r = b.frame(i % 25 === 0 ? 0.1 : 0.016, SHARP_RATIO) ?? r;
    expect(b.done).toBe(true);
    expect(r).toBeNull();
    expect(b.meanMs).toBeLessThan(22);
  });

  it('les premières secondes (compilation des shaders) ne comptent pas', () => {
    const b = new PixelBudget({ warmup: 2, span: 4 });
    for (let i = 0; i < 20; i++) expect(b.frame(0.1, SHARP_RATIO)).toBeNull(); // 2 s très lentes
    let r = null;
    for (let i = 0; i < 400 && !b.done; i++) r = b.frame(0.016, SHARP_RATIO) ?? r;
    expect(r).toBeNull();
  });
});


// Le repli dessiné (téléphone sans WebGL, ?care3d=off) de seller, brider et vermifuge : une tête de cheval digne du jeu
// (chantier « harnais »). La tête de drawHorseHead a un œil avec son reflet, même sur un cheval noir, un naseau tiré
// de la robe, la marque blanche de l'animal, le toupet et la crinière aux couleurs des crins ; le piston de la seringue
// tient au corps ; seller dessine le cheval de la visite du vétérinaire (drawHorseVet), pas le cheval en ronds.
import { describe, it, expect, beforeAll } from 'vitest';
import { fakeDocument } from './fixtures/careCtx.js';

let dw;
let animalMod;
beforeAll(async () => {
  fakeDocument();
  dw = await import('../src/ui/minigames/deworm.js');
  animalMod = await import('../src/sim/animal.js');
});

/** Une toile 2D qui note ce qu'on y peint (couleurs des remplissages et des traits). */
function recorder() {
  const fills = [];
  const strokes = [];
  const g = new Proxy({}, {
    get(target, k) {
      if (k === 'fill') return () => fills.push(target.fillStyle);
      if (k === 'stroke') return () => strokes.push(target.strokeStyle);
      if (k === 'createRadialGradient' || k === 'createLinearGradient') return () => ({ addColorStop() {} });
      if (k in target) return target[k];
      return () => {};
    },
    set(target, k, v) {
      target[k] = v;
      return true;
    },
  });
  return { g, fills, strokes };
}

describe('la tête dessinée du cheval (repli)', () => {
  it('cheval noir : l\'œil a son reflet blanc, la tête un contour clair, le naseau est peint', () => {
    const { g, fills, strokes } = recorder();
    dw.drawHorseHead(g, { coat: '#141210', mane: '#0b0a09', dark: '#0d0c0a', light: '#2a2622' }, 0, 0, 1, { face: 0 });
    expect(fills, 'le reflet de l\'œil').toContain('#ffffff');
    expect(strokes.some((c) => /255,\s*255,\s*255/.test(String(c))), 'un contour clair sur la robe noire').toBe(true);
    expect(fills.filter((c) => c === '#141210').length, 'la tête et l\'encolure à la couleur de la robe').toBeGreaterThanOrEqual(2);
    expect(strokes.filter((c) => c === '#0b0a09').length, 'crinière et toupet aux couleurs des crins').toBeGreaterThan(8);
  });
  it('la marque blanche de l\'animal (liste) se voit ; sans marque, pas de blanc sur le chanfrein', () => {
    const a = recorder();
    dw.drawHorseHead(a.g, { coat: '#9a4f24', mane: '#c0662f', dark: '#6b3718', light: '#c77d4c' }, 0, 0, 1, { face: 3 });
    expect(a.fills).toContain('#f5f1ea');
    const b = recorder();
    dw.drawHorseHead(b.g, { coat: '#9a4f24', mane: '#c0662f', dark: '#6b3718', light: '#c77d4c' }, 0, 0, 1);
    expect(b.fills).not.toContain('#f5f1ea');
  });
  it('faceOf lit la marque de la race (un pie a une liste)', () => {
    const pie = animalMod.createAnimal({ species: 'horse', breed: 'shetland', colorIndex: 0, ageDays: 1500, seed: 5 });
    expect(dw.faceOf(pie)).toBeGreaterThan(0);
    expect(dw.faceOf({ species: 'dog' })).toBe(0);
  });
  it('ration.js peut toujours l\'appeler comme avant (sans options)', () => {
    const { g } = recorder();
    expect(() => dw.drawHorseHead(g, { coat: '#8a5a2b', mane: '#2b1d14' }, 0, 0.4, 2)).not.toThrow();
  });
});

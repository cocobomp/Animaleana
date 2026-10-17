// Vignettes 3D : choix des scènes (src/game/thumbScenes.js) — robe du mannequin selon la couleur de l'objet
// (l'objet ressort toujours), cadre selon la taille (un objet de poney paraît plus petit).
import { describe, it, expect } from 'vitest';
import { mannequinTone, sizeFrame } from '../src/game/thumbScenes.js';
import { COLORS, GEAR } from '../src/sim/gear.js';

describe('vignettes de la sellerie : mannequin contrasté', () => {
  it('un objet clair est porté par un cheval foncé, un objet foncé par un cheval clair', () => {
    for (const c of ['white', 'silver', 'sky', 'pink', 'gold']) expect(mannequinTone(COLORS[c])).toBe('dark');
    for (const c of ['brown', 'black', 'navy', 'red', 'green', 'purple', 'havana']) expect(mannequinTone(COLORS[c])).toBe('light');
  });

  it('les objets blancs par défaut (tapis, chemise et masque anti-mouches) sont sur un cheval foncé', () => {
    for (const id of ['saddlePad', 'gelPad', 'blanketSummer', 'flyMask']) expect(mannequinTone(COLORS[GEAR[id].colors[0]])).toBe('dark');
  });
});

describe('vignettes de la sellerie : la taille se voit', () => {
  it('le cadre d’un objet de poney est plus grand (l’objet y paraît plus petit), celui d’un trait plus petit', () => {
    expect(sizeFrame('horse')).toBe(1);
    expect(sizeFrame('pony')).toBeGreaterThan(1.1);
    expect(sizeFrame('draft')).toBeLessThan(0.95);
  });

  it('le cheval entier n’est jamais coupé (cadre au moins aussi grand que lui)', () => {
    expect(sizeFrame('draft', { whole: true })).toBe(1);
    expect(sizeFrame('pony', { whole: true })).toBeGreaterThan(1.1);
  });
});

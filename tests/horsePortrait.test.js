// Bien montrer le cheval (plan « cheval beau », étape 5) : portrait de la fiche lié à la vraie robe.
import { describe, it, expect } from 'vitest';
import { lookSig, portraitSpec } from '../src/game/thumbScenes.js';
import { createAnimal } from '../src/sim/animal.js';

const animal = (breed) => createAnimal({ species: 'horse', breed, colorIndex: 0, ageDays: 900, seed: 77 });

describe('portrait de la fiche (étape 5)', () => {
  it('clé de vignette liée à la vraie robe de l\'animal', () => {
    const a = animal('selle_francais');
    const b = { ...a, look: { ...a.look, coat: 0x111111 } };
    expect(lookSig(a.look)).toBe(lookSig({ ...a.look }));
    expect(lookSig(a.look)).not.toBe(lookSig(b.look));
    const s = portraitSpec(a, 'adult');
    expect(s).toMatchObject({ kind: 'animal', view: 'portrait', species: 'horse', breed: 'selle_francais', stage: 'adult' });
    expect(s.look).toBe(a.look);
  });
});

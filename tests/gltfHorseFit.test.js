import { describe, it, expect } from 'vitest';
import { torsoSdf, headSdf, backTopAt } from '../src/game/models/gltfHorseFit.js';

// Surfaces approchées du cheval GLB : la selle, le filet et la couverture du catalogue s'y posent.
describe('cheval GLB : surfaces pour l\'équipement', () => {
  it('le dos est à la hauteur mesurée sur le modèle (là où s\'assoit le cavalier)', () => {
    expect(backTopAt(-0.075)).toBeCloseTo(1.483, 2); // saddleY du modèle au repos
    expect(backTopAt(0.2)).toBeGreaterThan(backTopAt(-0.2)); // le garrot est plus haut que le rein
  });

  it('le tronc : dedans au centre, dehors au-delà du dos et des flancs', () => {
    expect(torsoSdf(0, 1.14, -0.1)).toBeLessThan(-0.2);
    expect(torsoSdf(0, 1.53, -0.1)).toBeGreaterThan(0.03); // 5 cm au-dessus du dos
    expect(torsoSdf(0.3, 1.14, -0.1)).toBeGreaterThan(0.03); // demi-largeur ≈ 0,24 m
    expect(Math.abs(torsoSdf(0, 1.483, -0.1))).toBeLessThan(0.01); // sur le dos
    expect(torsoSdf(0, 1.2, 1.2)).toBeGreaterThan(0); // devant le poitrail : dehors
  });

  it('la tête (repère incliné le long du chanfrein) : ronde au milieu, fine au bout du nez', () => {
    expect(headSdf(0, 0, 0.2)).toBeLessThan(-0.1);
    expect(headSdf(0.2, 0, 0.2)).toBeGreaterThan(0);
    expect(headSdf(0, 0, 0.6)).toBeGreaterThan(0); // au-delà des naseaux
    expect(Math.abs(headSdf(0.079, 0, 0.45))).toBeLessThan(0.01); // côté du museau
  });
});

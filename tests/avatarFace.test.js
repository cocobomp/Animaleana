// Visage lisible à la distance du jeu : niveaux de détail peints (mipmaps) de la bouche et des
// sourcils. De près, rien (les traits en relief suffisent) ; de loin, des traits d'au moins deux
// pixels environ, qui restent dans leur zone de texture et posés au-dessus des traits en relief.
import { describe, it, expect } from 'vitest';
import { maskOpacity, mouthLOD, browLOD, decalGeo, MOUTH_ZONE, BROW_ZONE, FACE } from '../src/game/models/avatarFace.js';
import { headSdf } from '../src/game/models/avatarHead.js';

/** Taille des texels de chaque niveau de mipmap d'une zone (m). */
const texels = (Z) => {
  const out = [];
  for (let w = Z.w; w >= 1; w >>= 1) out.push((2 * Z.rx) / w);
  return out;
};

describe('décalques du visage (bouche et sourcils de loin)', () => {
  it('invisibles de près, entiers à la distance du jeu', () => {
    const t = texels(MOUTH_ZONE);
    // Niveaux 0 et 1 (éditeur, vue de près) : vides.
    expect(maskOpacity(t[0])).toBe(0);
    expect(maskOpacity(t[1])).toBe(0);
    // Niveau 3 et suivants (tête d'une vingtaine de pixels) : opaques.
    for (const x of t.slice(3)) expect(maskOpacity(x)).toBe(1);
    // Entre les deux, un fondu qui ne recule jamais.
    for (let i = 1; i < t.length; i++) expect(maskOpacity(t[i])).toBeGreaterThanOrEqual(maskOpacity(t[i - 1]));
  });

  it('bouche : au moins deux texels d\'épaisseur, plus large et plus souriante de loin', () => {
    let prevW = 0;
    for (const x of texels(MOUTH_ZONE)) {
      if (maskOpacity(x) === 0) continue;
      const { T, W, smile } = mouthLOD(x);
      // Jamais plus fine que le pli en relief, ni que deux texels (sauf au plafond).
      expect(T).toBeGreaterThanOrEqual(0.0045);
      expect(T >= 2 * x || T === 0.02).toBe(true);
      expect(W).toBeGreaterThanOrEqual(FACE.mouthW);
      expect(W).toBeGreaterThanOrEqual(prevW);
      expect(smile).toBeGreaterThanOrEqual(FACE.smile);
      prevW = W;
      // Le sourire tient dans la texture (coins arrondis compris).
      const Z = MOUTH_ZONE;
      expect(W + T / 2).toBeLessThan(Z.rx);
      expect(FACE.mouthY - 0.68 * T).toBeGreaterThan(Z.cy - Z.ry);
      expect(FACE.mouthY + smile + 0.32 * T).toBeLessThan(Z.cy + Z.ry);
    }
    expect(prevW).toBeGreaterThan(FACE.mouthW * 1.3);
  });

  it('sourcils : plus épais de loin et dans leur zone', () => {
    for (const x of texels(BROW_ZONE)) {
      const { T, lift } = browLOD(x);
      expect(T >= 1.8 * x || T === 0.013).toBe(true);
      const Z = BROW_ZONE;
      expect(0.111 + 0.0075 + lift + T / 2).toBeLessThan(Z.cy + Z.ry);
      expect(0.111 - 0.004 - T / 2).toBeGreaterThan(Z.cy - Z.ry);
    }
  });

  it('posés juste au-dessus de la peau, plus haut que les lèvres et les sourcils en relief', () => {
    // Lèvre du bas : 3 mm au plus au-dessus de la peau ; sourcils : 2,4 mm.
    expect(MOUTH_ZONE.lift).toBeGreaterThan(0.003);
    expect(BROW_ZONE.lift).toBeGreaterThan(0.0024);
    for (const [Z, seg, segY] of [[MOUTH_ZONE, 12, 6], [BROW_ZONE, 16, 4]]) {
      const p = decalGeo(Z, seg, segY).attributes.position.array;
      for (let i = 0; i < p.length; i += 3) {
        const d = headSdf(p[i], p[i + 1], p[i + 2]);
        expect(d).toBeGreaterThan(Z.lift * 0.6);
        expect(d).toBeLessThan(Z.lift * 1.6);
      }
    }
  });
});

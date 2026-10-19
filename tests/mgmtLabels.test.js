import { describe, it, expect } from 'vitest';
import { overlapAt, freeTop } from '../src/game/ManagementView.js';

// Pose les étiquettes comme ManagementView.placeLabels (dans l'ordre), et renvoie leurs rectangles.
function placeAll(list, minTop = 50) {
  const placed = [];
  for (const it of list) {
    const top = freeTop(placed, placed.length, it.x, it.top, it.w, it.h, minTop);
    placed.push({ x: it.x, top, w: it.w, h: it.h });
  }
  return placed;
}

const overlaps = (a, b) => Math.abs(a.x - b.x) < (a.w + b.w) / 2 && a.top < b.top + b.h && b.top < a.top + a.h;

describe('vue construction : étiquettes qui s\'évitent', () => {
  it('deux étiquettes de 44 px presque au même endroit ne se chevauchent plus (« Petits boulots » / « Maison »)', () => {
    // Positions relevées sur téléphone (390×844) : 32 px d'écart vertical, 44 px de haut.
    const placed = placeAll([
      { x: 337, top: 105, w: 94, h: 44 }, // Maison
      { x: 318, top: 73 + 30, w: 136, h: 44 }, // Petits boulots, juste au-dessus
    ]);
    expect(overlaps(placed[0], placed[1])).toBe(false);
  });

  it('sous la barre du haut : l\'étiquette redescend au lieu de passer dessous', () => {
    const placed = placeAll([
      { x: 200, top: 60, w: 120, h: 44 },
      { x: 210, top: 62, w: 120, h: 44 },
    ], 50);
    expect(placed[1].top).toBeGreaterThanOrEqual(50);
    expect(overlaps(placed[0], placed[1])).toBe(false);
  });

  it('un groupe serré d\'étiquettes (balayage de positions fixes) : aucune ne chevauche une autre', () => {
    for (let dx = 0; dx <= 60; dx += 15) {
      for (let dy = 0; dy <= 40; dy += 10) {
        const list = Array.from({ length: 6 }, (_, i) => ({ x: 180 + ((i * dx) % 90), top: 300 + ((i * dy) % 50), w: 90 + i * 12, h: i % 3 === 2 ? 36 : 44 }));
        const placed = placeAll(list);
        for (let i = 0; i < placed.length; i++) for (let j = i + 1; j < placed.length; j++) expect(overlaps(placed[i], placed[j])).toBe(false);
      }
    }
  });

  it('overlapAt tient compte de la hauteur réelle et d\'un petit écart', () => {
    const placed = [{ x: 100, top: 100, w: 80, h: 44 }];
    expect(overlapAt(placed, 1, 100, 140, 80, 44)).toBe(placed[0]); // 4 px de chevauchement
    expect(overlapAt(placed, 1, 100, 150, 80, 44)).toBeNull();
    expect(overlapAt(placed, 1, 200, 100, 80, 44)).toBeNull(); // à côté
  });
});

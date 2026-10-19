import { describe, it, expect } from 'vitest';
import { overlapAt, freeTop, layoutLabels } from '../src/game/ManagementView.js';

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

  // Téléphone en paysage (844×390, barre du haut jusqu'à 54 px), vue haute : 13 étiquettes pour 330 px de haut.
  // Posées dans l'ordre de la liste, les dernières descendaient en cascade hors de l'écran : « Paddock », que montre
  // le tutoriel au milieu de l'écran, disparaissait et « Niche » prenait sa place.
  const landscape = () => [
    { name: 'Écurie', x: 300, top: 90, w: 100, h: 44 }, { name: 'Maison', x: 480, top: 70, w: 100, h: 44 },
    { name: 'Sellerie', x: 380, top: 120, w: 110, h: 44 }, { name: 'Petits boulots', x: 470, top: 110, w: 150, h: 44 },
    { name: 'Refuge', x: 540, top: 150, w: 100, h: 44 }, { name: 'Vétérinaire', x: 520, top: 210, w: 140, h: 44 },
    { name: 'Animalerie', x: 520, top: 80, w: 130, h: 44 }, { name: 'Niche', x: 420, top: 130, w: 90, h: 44 },
    { name: 'Clapier', x: 480, top: 140, w: 100, h: 44 }, { name: 'Terrain de concours', x: 240, top: 330, w: 190, h: 44 },
    { name: 'Maison des animaux', x: 300, top: 250, w: 190, h: 44 }, { name: 'Bergerie', x: 520, top: 360, w: 110, h: 44 },
    { name: 'Paddock', x: 420, top: 175, w: 110, h: 44 }, // au centre de l'écran, dernier de la liste
  ];

  it('le centre de l\'écran d\'abord : « Paddock » (montré par le tutoriel) garde sa place, même posé en dernier', () => {
    const cand = landscape();
    layoutLabels(cand, cand.length, 844, 390, 54);
    const pad = cand.find((c) => c.name === 'Paddock');
    expect(pad.hidden).toBe(false);
    expect(pad.y).toBe(175);
  });

  it('faute de place : aucune étiquette coupée par le bas de l\'écran ni sous la barre, aucune ne se chevauche', () => {
    for (const H of [390, 360, 600, 844]) {
      for (let shift = -60; shift <= 60; shift += 20) {
        const cand = landscape().map((c) => ({ ...c, top: c.top + shift * (c.x % 3 === 0 ? 1 : -1) }));
        layoutLabels(cand, cand.length, 844, H, 54);
        const shown = cand.filter((c) => !c.hidden).map((c) => ({ x: c.x, top: c.y, w: c.w, h: c.h }));
        expect(shown.length).toBeGreaterThan(4);
        for (const r of shown) {
          expect(r.top).toBeGreaterThanOrEqual(54);
          expect(r.top + r.h).toBeLessThanOrEqual(H - 2);
        }
        for (let i = 0; i < shown.length; i++) for (let j = i + 1; j < shown.length; j++) expect(overlaps(shown[i], shown[j])).toBe(false);
      }
    }
  });

  it('une étiquette tout en bas remonte dans l\'écran au lieu d\'être coupée', () => {
    const cand = [{ x: 300, top: 370, w: 120, h: 44 }];
    layoutLabels(cand, 1, 844, 390, 54);
    expect(cand[0].hidden).toBe(false);
    expect(cand[0].y + 44).toBeLessThanOrEqual(388);
  });

  it('overlapAt tient compte de la hauteur réelle et d\'un petit écart', () => {
    const placed = [{ x: 100, top: 100, w: 80, h: 44 }];
    expect(overlapAt(placed, 1, 100, 140, 80, 44)).toBe(placed[0]); // 4 px de chevauchement
    expect(overlapAt(placed, 1, 100, 150, 80, 44)).toBeNull();
    expect(overlapAt(placed, 1, 200, 100, 80, 44)).toBeNull(); // à côté
  });
});

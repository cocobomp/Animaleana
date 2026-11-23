// Chantier « soinsbeaute », reprise : les photos avant / après du salon pour un cheval. La poussière de l'« avant »
// se pose sur sa robe (le tronc de sa silhouette, jamais dans le vide ni sur sa tête) ; sans vignettes 3D (pas de
// WebGL), pas de photo 3D (le portrait dessiné prend le relais, pas l'emoji 🐴).
import { describe, it, expect, beforeAll } from 'vitest';

let ui;
beforeAll(async () => {
  ui = await import('../src/ui/groomer.js');
}, 60000);

/** Une silhouette de cheval de profil (opacité 255), tête en haut à droite, sur 110 × 85. */
function horseAlpha() {
  const cw = 110;
  const ch = 85;
  const a = new Uint8Array(cw * ch);
  const fill = (x0, y0, x1, y1) => {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) a[y * cw + x] = 255;
  };
  fill(25, 35, 80, 58); // le tronc
  fill(70, 15, 82, 40); // l'encolure
  fill(78, 8, 98, 20); // la tête
  for (const x of [28, 36, 68, 76]) fill(x, 58, x + 4, 80); // les jambes
  fill(18, 36, 26, 60); // la queue
  return { a, cw, ch };
}

describe('photos avant / après du cheval', () => {
  it('la poussière tombe sur son tronc : jamais dans le vide, ni sur sa tête, ni sur ses jambes', () => {
    const { a, cw, ch } = horseAlpha();
    const W = 220;
    const H = 170;
    const spots = ui.spotsOnBody(a, cw, ch, W, H, 14);
    expect(spots.length).toBe(14);
    for (const p of spots) {
      const x = Math.floor((p.x / W) * cw);
      const y = Math.floor((p.y / H) * ch);
      expect(a[y * cw + x], JSON.stringify(p)).toBe(255);
      // (dans le tronc : 25..80 × 35..58)
      expect(x >= 25 && x < 80 && y >= 35 && y < 58, JSON.stringify({ x, y })).toBe(true);
    }
    // (des points différents, répartis)
    expect(new Set(spots.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`)).size).toBeGreaterThan(8);
    // (image vide : pas de poussière)
    expect(ui.spotsOnBody(new Uint8Array(cw * ch), cw, ch, W, H)).toEqual([]);
  });

  it('sans vignettes 3D (pas de WebGL) : pas de photo 3D, le portrait dessiné prend le relais', async () => {
    const { getBreed } = await import('../src/sim/species.js');
    const panels = await import('../src/ui/panels.js');
    const c = getBreed('horse', 'selle_francais').colors[0];
    const a = { species: 'horse', breed: 'selle_francais', look: { coat: c.coat, pattern: c.pattern ?? getBreed('horse', 'selle_francais').pattern, secondary: c.secondary ?? null, seed: 1 }, sex: 'f', name: 'Honey', birthDay: 0 };
    // (le cheval a bien une vignette possible : c'est seulement le moteur qui manque)
    expect(panels.animalThumbSpec(a)).not.toBe(null);
    const g = { thumbs: { enabled: false } };
    expect(ui.horsePhoto(g, a, { before: true })).toBe(null);
    expect(ui.horsePhoto(g, a, {})).toBe(null);
  });
});

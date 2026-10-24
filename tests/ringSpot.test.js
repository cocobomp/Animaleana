// Le doigt du guide (src/ui/ringSpot.js) : il ne se pose jamais sur la bulle ni sur le suivi de quête.
// Les rectangles viennent des mesures faites dans Chromium (téléphone 390×844 et paysage 844×390).
import { describe, it, expect } from 'vitest';
import { ringSpot } from '../src/ui/ringSpot.js';

const rect = (left, top, right, bottom) => ({ left, top, right, bottom, width: right - left, height: bottom - top });

describe('ringSpot : où vient le doigt', () => {
  it('au milieu de l\'écran, sans rien autour : le doigt vient d\'en dessous', () => {
    const s = ringSpot(rect(150, 300, 240, 348), {}, 844);
    expect(s).toMatchObject({ fromTop: false, side: null, under: false, glyph: '👆' });
  });

  it('un bouton du bas, sans bulle : le doigt vient d\'au-dessus', () => {
    const s = ringSpot(rect(120, 770, 270, 818), {}, 844);
    expect(s).toMatchObject({ fromTop: true, side: null, under: false });
  });

  it('téléphone : sous 💼 Métiers, la bulle est juste dessous : le doigt vient de la gauche', () => {
    const s = ringSpot(rect(200, 52, 250, 100), { bubble: rect(8, 120, 382, 330) }, 844);
    expect(s).toMatchObject({ fromTop: false, side: 'left', under: false, glyph: '👉' });
  });

  it('un bouton contre le bord gauche : le doigt vient de la droite', () => {
    const s = ringSpot(rect(10, 52, 50, 100), { tracker: rect(8, 108, 200, 156) }, 844);
    expect(s).toMatchObject({ side: 'right', glyph: '👈' });
  });

  it('paysage : « S\'occuper de Mimi » en bas, la bulle au milieu le couvre en partie', () => {
    // Avant : le doigt venait d'au-dessus et se posait sur « Passer pour l'instant », le cercle barrait les boutons.
    const care = rect(311, 321, 533, 370);
    const s = ringSpot(care, { bubble: rect(211, 103, 591, 325) }, 390);
    expect(s.fromTop).toBe(false);
    expect(s.side).toBe('left');
    expect(s.under).toBe(true); // le cercle passe sous la bulle
  });

  it('une bulle cachée (null) ne compte pas', () => {
    const s = ringSpot(rect(311, 321, 533, 370), { bubble: null, tracker: null }, 390);
    expect(s).toMatchObject({ fromTop: true, side: null, under: false });
  });
});

describe('ringSpot : sous la bulle', () => {
  it('paysage : le doigt se met au milieu de ce qu\'on voit du cercle, sous la bulle', () => {
    // Mesuré après l'animation d'entrée : la bulle descend jusqu'à 340, le cercle va de 315 à 376.
    const care = rect(311, 321, 533, 370);
    const bubble = rect(201, 107, 601, 340);
    const s = ringSpot(care, { bubble }, 390);
    expect(s.under).toBe(true);
    expect(s.hidden).toBe(false);
    const ringTop = care.top - s.pad;
    expect(ringTop + s.fingerY).toBeGreaterThan(bubble.bottom + 10); // le milieu du doigt est bien sous la bulle
    expect(ringTop + s.fingerY).toBeLessThan(care.bottom + s.pad);
  });

  it('sans bulle par-dessus, le doigt garde sa place (fingerY null)', () => {
    expect(ringSpot(rect(200, 52, 250, 100), { bubble: rect(8, 120, 382, 330) }, 844).fingerY).toBe(null);
  });

  it('la bulle cache tout le bouton : ni cercle ni doigt', () => {
    const s = ringSpot(rect(300, 200, 400, 240), { bubble: rect(200, 100, 600, 330) }, 390);
    expect(s.hidden).toBe(true);
  });

  it('la bulle cache le bas du bouton : on voit le haut du cercle', () => {
    const s = ringSpot(rect(300, 100, 520, 160), { bubble: rect(200, 140, 600, 330) }, 390);
    expect(s).toMatchObject({ under: true, hidden: false });
  });
});

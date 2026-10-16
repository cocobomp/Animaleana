// Règle « juste ce qu'il faut » des mini-jeux (src/ui/minigames/score.js) : tous les
// points dans la zone, moins de points en dessous OU au-dessus, de façon symétrique et
// progressive, avec un plancher. Et les textes de fin qui disent pourquoi, en FR et en EN.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { justRight, verdict, zoneAround, JUST_FLOOR } from '../src/ui/minigames/score.js';

describe('justRight : qualité « juste ce qu\'il faut »', () => {
  const lo = 0.6;
  const hi = 0.8; // slack par défaut = hi − lo = 0,2

  it('donne tous les points dans la zone, bornes comprises', () => {
    expect(justRight(0.7, lo, hi)).toBe(1);
    expect(justRight(lo, lo, hi)).toBe(1);
    expect(justRight(hi, lo, hi)).toBe(1);
  });

  it('descend de la même façon un peu en dessous et un peu au-dessus (symétrie)', () => {
    for (const d of [0.02, 0.05, 0.1, 0.15, 0.2, 0.5]) {
      expect(justRight(lo - d, lo, hi)).toBeCloseTo(justRight(hi + d, lo, hi), 10);
    }
  });

  it('descend progressivement, sans couperet : à mi-chemin du mou, mi-chemin du plancher', () => {
    const a = justRight(lo - 0.05, lo, hi);
    const b = justRight(lo - 0.1, lo, hi);
    const c = justRight(lo - 0.15, lo, hi);
    expect(a).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(c);
    expect(c).toBeGreaterThan(JUST_FLOOR);
    // Linéaire : au milieu du mou (0,1 sur 0,2), on est au milieu entre 1 et le plancher.
    expect(b).toBeCloseTo((1 + JUST_FLOOR) / 2, 10);
    // Juste à côté de la zone, on garde presque tout.
    expect(justRight(hi + 0.001, lo, hi)).toBeGreaterThan(0.99);
  });

  it('atteint le plancher à lo − slack et hi + slack, et y reste au-delà', () => {
    expect(justRight(lo - 0.2, lo, hi)).toBeCloseTo(JUST_FLOOR, 10);
    expect(justRight(hi + 0.2, lo, hi)).toBeCloseTo(JUST_FLOOR, 10);
    expect(justRight(0, lo, hi)).toBe(JUST_FLOOR);
    expect(justRight(5, lo, hi)).toBe(JUST_FLOOR);
    expect(justRight(-100, lo, hi)).toBe(JUST_FLOOR);
  });

  it('respecte un plancher et un mou personnalisés', () => {
    expect(justRight(0, lo, hi, { floor: 0.5 })).toBe(0.5);
    expect(justRight(lo - 0.1, lo, hi, { floor: 0.5 })).toBeCloseTo(0.75, 10);
    // slack = 0,4 : à 0,2 de la zone on n'est qu'à mi-chemin du plancher.
    expect(justRight(hi + 0.2, lo, hi, { slack: 0.4 })).toBeCloseTo((1 + JUST_FLOOR) / 2, 10);
    expect(justRight(hi + 0.4, lo, hi, { slack: 0.4 })).toBeCloseTo(JUST_FLOOR, 10);
  });

  it('garde un mou minimal (0,15 × hi) quand la zone est très étroite ou réduite à un point', () => {
    // Zone [10, 10] : slack = 1,5. À 0,75 de distance, mi-chemin ; à 1,5, plancher.
    expect(justRight(10, 10, 10)).toBe(1);
    expect(justRight(10.75, 10, 10)).toBeCloseTo((1 + JUST_FLOOR) / 2, 10);
    expect(justRight(9.25, 10, 10)).toBeCloseTo((1 + JUST_FLOOR) / 2, 10);
    expect(justRight(11.5, 10, 10)).toBeCloseTo(JUST_FLOOR, 10);
    // Un slack explicite de 0 est relevé lui aussi.
    expect(justRight(10.75, 10, 10, { slack: 0 })).toBeCloseTo((1 + JUST_FLOOR) / 2, 10);
    // Zone étroite [10, 10,1] : le mou n'est pas 0,1 mais 1,5.
    expect(justRight(10.1 + 0.1, 10, 10.1)).toBeGreaterThan(0.9);
  });

  it('reste toujours entre le plancher et 1, et tolère des entrées bizarres', () => {
    for (let v = -2; v <= 4; v += 0.07) {
      const q = justRight(v, lo, hi);
      expect(q).toBeGreaterThanOrEqual(JUST_FLOOR);
      expect(q).toBeLessThanOrEqual(1);
    }
    expect(justRight(NaN, lo, hi)).toBe(JUST_FLOOR);
    expect(justRight(0.7, hi, lo)).toBe(1); // bornes inversées : on les remet dans l'ordre
    expect(justRight(1, 0, 0)).toBe(JUST_FLOOR); // zone [0, 0] : aucun mou possible
  });
});

describe('verdict et zoneAround', () => {
  it('dit si c\'est juste, trop peu ou trop', () => {
    expect(verdict(0.7, 0.6, 0.8)).toBe('just');
    expect(verdict(0.6, 0.6, 0.8)).toBe('just');
    expect(verdict(0.8, 0.6, 0.8)).toBe('just');
    expect(verdict(0.59, 0.6, 0.8)).toBe('low');
    expect(verdict(0.81, 0.6, 0.8)).toBe('high');
    expect(verdict(0.5, 0.8, 0.6)).toBe('low'); // bornes inversées
  });

  it('fabrique une zone à ± 12 % (ou autre) autour d\'une cible', () => {
    expect(zoneAround(10)).toEqual({ lo: 8.8, hi: 11.2 });
    expect(zoneAround(10, 0.2)).toEqual({ lo: 8, hi: 12 });
    const z = zoneAround(0.75);
    expect(z.lo).toBeCloseTo(0.66, 10);
    expect(z.hi).toBeCloseTo(0.84, 10);
    expect(justRight(0.75, z.lo, z.hi)).toBe(1);
    expect(zoneAround(0)).toEqual({ lo: 0, hi: 0 });
  });
});

describe('textes de fin « juste ce qu\'il faut »', () => {
  let i18n;
  beforeAll(async () => {
    // i18n.js ne touche au DOM que dans setLang : un minimum suffit.
    globalThis.document = globalThis.document ?? { documentElement: {} };
    i18n = await import('../src/i18n.js');
  });

  const KEYS = ['mg_justRight', 'mg_tooLittle', 'mg_tooMuch', 'mg_stopHere', 'mg_zoneHint',
    'mg_chore_justRight', 'mg_chore_tooLittle', 'mg_chore_tooMuch'];

  it('existent en français et en anglais, et disent le prénom', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const key of KEYS) {
        const s = t(key, { name: 'Pomme' });
        expect(s, `${lang} ${key}`).not.toBe(key);
        expect(s, `${lang} ${key}`).not.toMatch(/\{name\}/);
      }
      for (const key of ['mg_justRight', 'mg_tooLittle', 'mg_tooMuch']) expect(t(key, { name: 'Pomme' }), `${lang} ${key}`).toContain('Pomme');
    }
    setLang('fr');
  });

  it('sont bien définis dans chaque dictionnaire (pas seulement par repli sur le français)', () => {
    const src = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
    const enAt = src.indexOf('\nconst en = {');
    expect(enAt).toBeGreaterThan(0);
    const fr = src.slice(0, enAt);
    const en = src.slice(enAt);
    for (const key of KEYS) {
      expect(fr, `fr ${key}`).toMatch(new RegExp(`^\\s{2}${key}:`, 'm'));
      expect(en, `en ${key}`).toMatch(new RegExp(`^\\s{2}${key}:`, 'm'));
    }
  });
});

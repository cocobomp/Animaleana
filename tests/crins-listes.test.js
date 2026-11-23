// Listes avec le vrai animal (chantier « crins ») : dans « Mes animaux », chez le vétérinaire, aux activités, aux
// concours, au concours de beauté, à la voltige, à la construction et chez les clients, chaque carte montre la vignette 3D
// de l'animal (sa race, sa robe) au lieu de l'emoji de l'espèce — le même 🐴 pour chaque cheval.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = (f) => fs.readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

describe('cartes des listes : la vignette du vrai animal', () => {
  it('panels.js exporte animalPic et listPic (vignette 64 × 48, emoji en attendant ou hors catalogue)', () => {
    const s = src('panels.js');
    expect(s).toMatch(/export function animalPic\(g, a, w, hh, cls = ''\)/);
    expect(s).toMatch(/export function listPic\(g, a\) \{\n\s*return animalPic\(g, a, 64, 48, 'list-thumb'\);/);
    // (sans vignette possible : l'emoji de l'espèce, comme avant)
    expect(s).toContain("if (!spec || !g) return h('span', { class: cls ? `card-emoji ${cls}` : 'card-emoji' }, emoji);");
  });

  it.each([
    ['panels.js', 2], ['activities.js', 2], ['competitions.js', 2], ['beauty.js', 1], ['vaulting.js', 1],
    ['construction.js', 1], ['clients.js', 2],
  ])('%s : %i carte(s) d\'animal avec listPic, plus d\'emoji d\'espèce dans les cartes', (file, n) => {
    const s = src(file);
    // (les appels, pas la définition dans panels.js)
    expect((s.match(/(?<!function )listPic\(g, a\)/g) ?? []).length).toBe(n);
    expect(s).not.toContain("h('span', { class: 'card-emoji' }, SPECIES[a.species].emoji)");
    expect(s).not.toContain("h('span', { class: 'card-emoji' }, SPECIES.horse.emoji)");
  });

  it('pas le salon de toilettage (chantier soinsbeaute) ; une règle de style pour la vignette des listes', () => {
    expect(src('groomer.js')).not.toContain('listPic');
    const css = fs.readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    expect(css).toMatch(/\.list-thumb \{ width: 64px; height: 48px;/);
  });
});

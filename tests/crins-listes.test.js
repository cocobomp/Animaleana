// Listes avec le vrai animal (chantier « crins ») : dans « Mes animaux », chez le vétérinaire, aux activités, aux
// concours, au concours de beauté, à la voltige, à la construction et chez les clients, chaque carte montre la vignette 3D
// de l'animal (sa race, sa robe) au lieu de l'emoji de l'espèce — le même 🐴 pour chaque cheval.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const src = (f) => fs.readFileSync(new URL(`../src/ui/${f}`, import.meta.url), 'utf8');

describe('cartes des listes : la vignette du vrai animal', () => {
  it('animalPic.js : animalPic et listPic (vignette 64 × 48, emoji en attendant ou hors catalogue), redonnés par panels.js', () => {
    const s = src('animalPic.js');
    expect(s).toMatch(/export function animalPic\(g, a, w, hh, cls = ''\)/);
    expect(s).toMatch(/export function listPic\(g, a\) \{\n\s*return animalPic\(g, a, 64, 48, 'list-thumb'\);/);
    // (sans vignette possible : l'emoji de l'espèce, comme avant)
    expect(s).toContain("if (!spec || !g) return h('span', { class: cls ? `card-emoji ${cls}` : 'card-emoji' }, emoji);");
    // (module sans le jeu : pas de boucle d'imports avec les écrans des activités)
    expect(s).not.toMatch(/from '\.\.\/game\/Game\.js'|from '\.\/panels\.js'/);
    expect(src('panels.js')).toContain("export { animalThumbSpec, animalPic, listPic } from './animalPic.js';");
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

// Comportement (reprise) : ce que listPic demande vraiment à la file des vignettes, avec un jeu factice qui note les
// demandes (sans WebGL), et un document minimal pour l'emoji de repli.
import { listPic, animalThumbSpec } from '../src/ui/animalPic.js';
import { createAnimal, lifeStage } from '../src/sim/animal.js';

describe('listPic : la vignette demandée pour chaque animal', () => {
  const fakeGame = () => {
    const calls = [];
    return { calls, thumbs: { view: (spec, opts) => (calls.push({ spec, opts }), { thumb: true, spec, opts }) } };
  };
  const withDocument = (fn) => {
    const had = 'document' in globalThis;
    const prev = globalThis.document;
    const prevNode = globalThis.Node;
    class FakeNode {}
    globalThis.Node = FakeNode;
    globalThis.document = {
      createElement: (tag) => Object.assign(new FakeNode(), { tag, className: '', children: [], attrs: {}, append(...c) { this.children.push(...c); }, setAttribute(k, v) { this.attrs[k] = v; } }),
      createTextNode: (text) => Object.assign(new FakeNode(), { text }),
    };
    try {
      return fn();
    } finally {
      if (had) globalThis.document = prev;
      else delete globalThis.document;
      globalThis.Node = prevNode;
    }
  };

  it('deux chevaux de races et de robes différentes : deux vignettes différentes, à leur race, leur robe et leur âge', () => {
    const g = fakeGame();
    const a = createAnimal({ species: 'horse', breed: 'selle_francais', colorIndex: 1, ageDays: 900, seed: 3 });
    const b = createAnimal({ species: 'horse', breed: 'frison', colorIndex: 0, ageDays: 1, seed: 4 });
    listPic(g, a);
    listPic(g, b);
    expect(g.calls).toHaveLength(2);
    const [ca, cb] = g.calls;
    expect(ca.spec).toMatchObject({ kind: 'animal', species: 'horse', breed: 'selle_francais', colorIndex: 1, sex: a.sex, seed: a.look.seed });
    expect(cb.spec).toMatchObject({ kind: 'animal', species: 'horse', breed: 'frison', colorIndex: 0, stage: lifeStage(b) });
    expect(cb.spec.stage).not.toBe(ca.spec.stage);
    // (64 × 48 pixels affichés, classe des cartes de liste, l'emoji en attendant l'image)
    expect(ca.opts).toMatchObject({ w: 64, h: 48, cls: 'list-thumb', emoji: '🐴' });
  });

  it('toutes les espèces en profitent (chien, chat, lapin)', () => {
    const g = fakeGame();
    for (const species of ['dog', 'cat', 'rabbit']) listPic(g, createAnimal({ species, colorIndex: 0, ageDays: 400, seed: 5 }));
    expect(g.calls.map((c) => c.spec.species)).toEqual(['dog', 'cat', 'rabbit']);
  });

  it('robe hors du catalogue de la race (croisement) ou pas de jeu : l\'emoji de l\'espèce, aucune vignette demandée', () => {
    const g = fakeGame();
    const a = createAnimal({ species: 'horse', breed: 'arabe', colorIndex: 0, ageDays: 900, seed: 6 });
    const odd = { ...a, look: { ...a.look, coat: 0x123456 } };
    expect(animalThumbSpec(odd)).toBeNull();
    const el = withDocument(() => listPic(g, odd));
    expect(g.calls).toHaveLength(0);
    expect(el.className).toBe('card-emoji list-thumb');
    expect(el.children[0].text).toBe('🐴');
    const el2 = withDocument(() => listPic(null, a));
    expect(el2.className).toBe('card-emoji list-thumb');
  });
});

// Mini-jeux des corvées (src/ui/minigames/chores.js) : un jeu par corvée, et ses textes
// en français et en anglais. Le dessin (canvas) n'est pas testé ici.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

let i18n;
let chores;
beforeAll(async () => {
  // i18n.js ne touche au DOM que dans setLang (qu'on n'appelle pas) : un minimum suffit.
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
  chores = await import('../src/ui/minigames/chores.js');
});

const KINDS = ['muck', 'straw', 'sweep', 'living', 'kitchen'];

describe('mini-jeux des corvées', () => {
  it('propose un jeu (une fonction) pour chaque corvée, et rien d\'autre', () => {
    expect(chores.CHORE_KINDS).toEqual(KINDS);
    for (const kind of KINDS) {
      expect(typeof chores.CHORE_GAMES[kind], kind).toBe('function');
      expect(typeof chores.CHORE_ICONS[kind], kind).toBe('string');
    }
    expect(Object.keys(chores.CHORE_GAMES).sort()).toEqual([...KINDS].sort());
  });

  it('a un titre et une consigne en français pour chaque corvée', () => {
    const { t } = i18n;
    for (const kind of KINDS) {
      expect(t(`mg_chore_${kind}`), kind).not.toBe(`mg_chore_${kind}`);
      expect(t(`mg_chore_${kind}_hint`), kind).not.toBe(`mg_chore_${kind}_hint`);
    }
    for (const stars of [1, 2, 3]) expect(t(`mg_chore_end${stars}`)).not.toBe(`mg_chore_end${stars}`);
  });

  it('a les mêmes clés mg_chore_* en français et en anglais', () => {
    // Les dictionnaires ne sont pas exportés : on lit le fichier, découpé entre « const fr » et « const en ».
    const src = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
    const enAt = src.indexOf('\nconst en = {');
    expect(enAt).toBeGreaterThan(0);
    const keysOf = (text) => [...text.matchAll(/^\s{2}(mg_chore_\w+):/gm)].map((m) => m[1]).sort();
    const frKeys = keysOf(src.slice(0, enAt));
    const enKeys = keysOf(src.slice(enAt));
    expect(frKeys.length).toBeGreaterThan(0);
    expect(enKeys).toEqual(frKeys);
    for (const kind of KINDS) {
      expect(frKeys, kind).toContain(`mg_chore_${kind}`);
      expect(frKeys, kind).toContain(`mg_chore_${kind}_hint`);
    }
  });
});

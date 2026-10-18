// Noms de fichiers sûrs pour macOS et Windows : leurs disques ne distinguent pas les majuscules,
// donc deux fichiers qui ne diffèrent que par la casse (ex. Events.js et events.js) n'en font qu'un
// et l'un des deux disparaît (Vite affichait alors « No matching export in src/game/Events.js »).
import { describe, it, expect } from 'vitest';
import { readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = join(dir, e.name);
    out.push(p.slice(ROOT.length + 1));
    if (e.isDirectory()) walk(p, out);
  }
  return out;
}

describe('noms de fichiers', () => {
  it('aucun chemin ne diffère d’un autre seulement par la casse', () => {
    const seen = new Map();
    const clashes = [];
    for (const dir of ['src', 'tests', 'public', 'tools']) {
      if (!existsSync(join(ROOT, dir))) continue;
      for (const p of walk(join(ROOT, dir))) {
        const k = p.toLowerCase();
        if (seen.has(k)) clashes.push(`${seen.get(k)} ↔ ${p}`);
        else seen.set(k, p);
      }
    }
    expect(clashes).toEqual([]);
  });

  it('le petit système d’événements du jeu s’appelle emitter.js (et non events.js à côté de Events.js)', () => {
    expect(existsSync(join(ROOT, 'src/game/emitter.js'))).toBe(true);
    expect(existsSync(join(ROOT, 'src/game/Events.js'))).toBe(true);
    expect(readdirSync(join(ROOT, 'src/game'))).not.toContain('events.js');
  });
});

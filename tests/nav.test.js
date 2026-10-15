import { describe, it, expect } from 'vitest';
import { ENCLOSURES, addBaseEnclosure, setBuiltEnclosures, enclosure } from '../src/game/nav.js';

describe('enclos de base et enclos construits', () => {
  it('un enclos de base ajouté après coup survit à setBuiltEnclosures()', () => {
    addBaseEnclosure({ id: 'arena', x: 0, z: 0, hw: 5, hd: 5, gate: { side: '+z', at: 0, width: 2 } });
    addBaseEnclosure({ id: 'arena', x: 9, z: 9, hw: 1, hd: 1, gate: { side: '+z', at: 0, width: 2 } }); // doublon ignoré
    setBuiltEnclosures([{ id: 'b1', x: 30, z: 30, hw: 3, hd: 3, gate: { side: '+z', at: 30, width: 2 } }]);
    expect(enclosure('arena')?.x).toBe(0);
    expect(enclosure('b1')).toBeTruthy();
    // Rechargement du lieu : les enclos construits sont remplacés, les enclos de base restent.
    setBuiltEnclosures([]);
    expect(enclosure('arena')).toBeTruthy();
    expect(enclosure('b1')).toBeUndefined();
    expect(ENCLOSURES.filter((e) => e.id === 'arena')).toHaveLength(1);
  });

  it('le terrain de concours reste connu de la navigation après un rechargement de lieu', async () => {
    await import('../src/game/showground.js');
    expect(enclosure('showground')).toBeTruthy();
    setBuiltEnclosures([], []);
    expect(enclosure('showground')).toBeTruthy();
  });
});

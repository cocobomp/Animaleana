// Registre des parties ouvertes partagé entre onglets (src/sim/openGames.js).
import { describe, it, expect } from 'vitest';
import { markOpen, markClosed, openElsewhere, FRESH_MS, BEAT_MS, newTabId } from '../src/sim/openGames.js';

function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

describe('parties ouvertes dans les onglets', () => {
  it('une partie ouverte dans un autre onglet compte ; la sienne n\'est pas comptée deux fois', () => {
    const storage = fakeStorage();
    markOpen('A', 'lea', { storage, now: 1000 });
    expect(openElsewhere({ storage, now: 2000, except: 'B' })).toEqual(['lea']);
    expect(openElsewhere({ storage, now: 2000, except: 'A' })).toEqual([]);
  });

  it('battement : ouverte tant qu\'il a moins de ~30 s ; onglet gelé ou fermé sans prévenir : oubliée', () => {
    const storage = fakeStorage();
    markOpen('A', 'lea', { storage, now: 0 });
    expect(BEAT_MS).toBeLessThan(FRESH_MS);
    expect(openElsewhere({ storage, now: FRESH_MS - 1 })).toEqual(['lea']);
    expect(openElsewhere({ storage, now: FRESH_MS + 1 })).toEqual([]);
    markOpen('A', 'lea', { storage, now: FRESH_MS + 5 });
    expect(openElsewhere({ storage, now: FRESH_MS + 10 })).toEqual(['lea']);
  });

  it('fermée : retirée ; les entrées périmées sont nettoyées', () => {
    const storage = fakeStorage();
    markOpen('A', 'lea', { storage, now: 0 });
    markOpen('B', 'tom', { storage, now: 100000 });
    expect(JSON.parse(storage.getItem('animaleana.open'))).toEqual({ B: { id: 'tom', at: 100000 } });
    markClosed('B', { storage });
    expect(storage.getItem('animaleana.open')).toBeNull();
    expect(openElsewhere({ storage, now: 100001 })).toEqual([]);
  });

  it('stockage abîmé ou absent : rien d\'ouvert, sans erreur', () => {
    const storage = fakeStorage();
    storage.setItem('animaleana.open', '{pas du json');
    expect(openElsewhere({ storage })).toEqual([]);
    expect(openElsewhere({ storage: null })).toEqual([]);
    expect(() => markOpen('A', 'x', { storage: null })).not.toThrow();
  });

  it('chaque onglet a son nom', () => {
    expect(newTabId()).not.toBe(newTabId());
  });
});

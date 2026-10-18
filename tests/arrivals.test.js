// Les visiteurs des métiers arrivent chacun leur tour (src/game/arrivals.js) : plus de messages empilés
// au milieu de l'écran quand la pension, l'éducateur canin, le toiletteur et le guide de randonnée
// recevaient quelqu'un à la même seconde.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { Arrivals, ARRIVAL_GAP_MINUTES, ARRIVAL_GAP_MS } from '../src/game/arrivals.js';

describe('arrivées des visiteurs', () => {
  it('après une arrivée, la suivante attend des minutes de jeu ET des secondes réelles', () => {
    let clock = 600;
    let now = 0;
    const arr = new Arrivals({ clock: () => clock, now: () => now });
    expect(arr.free()).toBe(true);
    arr.note();
    expect(arr.free()).toBe(false);
    // En ×4 (ou après une nuit), le temps du jeu file : il faut aussi attendre en vrai.
    clock += 120;
    now += ARRIVAL_GAP_MS / 2;
    expect(arr.free()).toBe(false);
    now += ARRIVAL_GAP_MS / 2;
    expect(arr.free()).toBe(true);
    // À vitesse normale : quelques minutes de jeu ne suffisent pas.
    arr.note();
    clock += ARRIVAL_GAP_MINUTES - 1;
    now += ARRIVAL_GAP_MS * 3;
    expect(arr.free()).toBe(false);
    clock += 1;
    expect(arr.free()).toBe(true);
    // Autre profil (horloge plus tôt) : seules les secondes réelles comptent.
    arr.note();
    clock = 10;
    expect(arr.free()).toBe(false);
    now += ARRIVAL_GAP_MS;
    expect(arr.free()).toBe(true);
  });

  it('chaque métier demande son tour et note son arrivée', () => {
    for (const f of ['Clients', 'DogTrainer', 'Groomer', 'TrailGuide']) {
      const src = readFileSync(new URL(`../src/game/${f}.js`, import.meta.url), 'utf8');
      expect(src, f).toMatch(/arrivals\?\.free\(\)/);
      expect(src, f).toMatch(/arrivals\?\.note\(\)/);
      expect(src, f).toMatch(/group: 'visitors'/);
    }
  });
});

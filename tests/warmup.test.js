// 🐢 La détente et le retour au calme (src/sim/warmup.js) : au pas au début, au pas à la fin.
import { describe, it, expect, beforeAll } from 'vitest';
import { WARMUP, newSession, sessionTick, effortFactor, dismountVerdict } from '../src/sim/warmup.js';
import { rideEffort } from '../src/sim/riding.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

const run = (s, gait, secs) => {
  const out = [];
  for (let k = 0; k < secs * 10; k++) {
    const r = sessionTick(s, gait, 0.1);
    if (r) out.push(r);
  }
  return out;
};

describe('détente et retour au calme', () => {
  it('trotter tout de suite : pas échauffé (une fois), et l\'effort fatigue un peu plus', () => {
    const s = newSession();
    expect(run(s, 'trot', 2)).toEqual(['cold']);
    expect(effortFactor(s)).toBe(WARMUP.coldEffort);
    expect(run(s, 'canter', 2)).toEqual([]);
  });

  it('un petit moment au pas d\'abord : bien échauffé, l\'effort coûte comme d\'habitude', () => {
    const s = newSession();
    expect(run(s, 'walk', WARMUP.walk + 1)).toEqual([]);
    expect(effortFactor(s)).toBe(1);
    expect(run(s, 'trot', 1)).toEqual(['warm']);
    expect(effortFactor(s)).toBe(1);
  });

  it('à l\'arrêt, rien ne compte (ni échauffement, ni effort)', () => {
    const s = newSession();
    run(s, 'halt', 60);
    expect(s.walk).toBe(0);
    expect(s.started).toBe(false);
  });

  it('descendre : rien à dire sans galop ; juste après un galop, il est essoufflé ; après un moment au pas, bravo', () => {
    const s = newSession();
    run(s, 'walk', 30);
    run(s, 'trot', 10);
    expect(dismountVerdict(s)).toBeNull();
    run(s, 'canter', WARMUP.hard + 1);
    expect(dismountVerdict(s)).toBe('hot');
    run(s, 'walk', WARMUP.cool / 2);
    expect(dismountVerdict(s)).toBe('hot');
    run(s, 'walk', WARMUP.cool);
    expect(dismountVerdict(s)).toBe('cooled');
    // (regalopé : le retour au calme recommence)
    run(s, 'gallop', 2);
    expect(dismountVerdict(s)).toBe('hot');
    expect(dismountVerdict(null)).toBeNull();
  });

  it('rideEffort : le facteur ne touche que les allures rapides', () => {
    const a = { needs: { energy: 100, grooming: 100, thirst: 100 } };
    const b = { needs: { energy: 100, grooming: 100, thirst: 100 } };
    rideEffort(a, 'canter', 10, 1, 1);
    rideEffort(b, 'canter', 10, 1, WARMUP.coldEffort);
    expect(b.needs.energy).toBeLessThan(a.needs.energy);
    const c = { needs: { energy: 100 } };
    const d = { needs: { energy: 100 } };
    rideEffort(c, 'walk', 10, 1, 1);
    rideEffort(d, 'walk', 10, 1, WARMUP.coldEffort);
    expect(d.needs.energy).toBe(c.needs.energy);
  });

  it('chaque message existe en français (au féminin aussi) et en anglais', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of ['ride_cold', 'ride_warm', 'ride_hot', 'ride_cooled', 'lb_cooldowns']) {
        for (const g of ['m', 'f']) expect(t(k, { name: 'Étoile', g }), `${lang} ${k}`).not.toBe(k);
      }
    }
    setLang('fr');
    expect(t('ride_cooled', { name: 'Étoile', g: 'f' })).toContain('contente');
  });
});

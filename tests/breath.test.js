// 🌬️ Son souffle dans le froid (src/sim/breath.js) : de la buée sous 10 °C, plus il fait froid (et humide), plus
// elle se voit ; une bouffée à chaque expiration (12 par minute au repos, 60 essoufflé) ; la vapeur d'un cheval en
// sueur.
import { describe, it, expect } from 'vitest';
import { BREATH_FX, STEAM, breathFog, exhaleCrossed, puffOf, steamOf } from '../src/sim/breath.js';

const TAU = Math.PI * 2;

/** Expirations vues en sec secondes à hz respirations par seconde (pas de 1/60 s, phase comme horseReal.js). */
const count = (hz, sec, ph = 0) => {
  let n = 0;
  const dt = 1 / 60;
  for (let i = 0; i < sec * 60; i++) {
    const next = (ph + dt * hz * TAU) % TAU;
    if (exhaleCrossed(ph, next)) n++;
    ph = next;
  }
  return n;
};

describe('la buée de son souffle', () => {
  it('rien quand il fait doux ; pleine à 2 °C ; de plus en plus entre les deux', () => {
    expect(breathFog(12, 'clear')).toBe(0);
    expect(breathFog(BREATH_FX.warm, 'clear')).toBe(0);
    expect(breathFog(2, 'clear')).toBe(1);
    expect(breathFog(-10, 'clear')).toBe(1);
    let last = 0;
    for (let c = 10; c >= 2; c -= 0.5) {
      const f = breathFog(c, 'clear');
      expect(f).toBeGreaterThanOrEqual(last);
      last = f;
    }
    expect(breathFog(6, 'clear')).toBeGreaterThan(0.3);
    expect(breathFog(6, 'clear')).toBeLessThan(0.7);
  });

  it('un peu plus par temps humide (pluie, orage, neige, brouillard), jamais plus de 1', () => {
    for (const w of ['rain', 'storm', 'snow', 'fog']) {
      expect(breathFog(6, w)).toBeCloseTo(breathFog(6, 'clear') + BREATH_FX.humid);
      expect(breathFog(3, w)).toBeLessThanOrEqual(1);
      expect(breathFog(-5, w)).toBe(1);
    }
    expect(breathFog(6, 'cloudy')).toBe(breathFog(6, 'clear'));
    expect(breathFog(15, 'rain')).toBe(0);
  });
});

describe('une bouffée à chaque expiration', () => {
  it('12 par minute au repos, 60 essoufflé', () => {
    expect(count(0.2, 60)).toBe(12);
    expect(count(1, 60)).toBe(60);
    // (en partant juste avant le retour à 0, ou juste après le début de l'expiration)
    expect(count(0.2, 60, TAU - 0.05)).toBe(12);
    expect(count(1, 60, BREATH_FX.exhaleAt + 0.3)).toBe(60);
  });

  it('la phase repasse par 0 : comptée si elle a dépassé le début de l\'expiration, une seule fois', () => {
    expect(exhaleCrossed(6.1, 0.2)).toBe(false);
    expect(exhaleCrossed(6.1, 1.3)).toBe(true);
    expect(exhaleCrossed(1.0, 1.3)).toBe(true);
    expect(exhaleCrossed(1.3, 1.5)).toBe(false);
    expect(exhaleCrossed(1.0, 1.0)).toBe(false);
    // (photo : la phase revient à 0 sans expiration)
    expect(exhaleCrossed(3, 0)).toBe(false);
  });
});

describe('les bouffées et la vapeur', () => {
  it('essoufflé, des bouffées plus grosses, plus rapides et plus longues', () => {
    const calm = puffOf(0, 1);
    const blown = puffOf(1, 1);
    expect(blown.size1).toBeGreaterThan(calm.size1);
    expect(blown.speed).toBeGreaterThan(calm.speed);
    expect(blown.life).toBeGreaterThan(calm.life);
    expect(blown.alpha).toBeGreaterThan(calm.alpha);
    expect(calm.size1).toBeGreaterThan(calm.size0);
    expect(puffOf(0.5, 0).alpha).toBe(0);
    // (rempli sur place : pas d'objet neuf à chaque bouffée)
    const out = {};
    expect(puffOf(0.3, 0.5, out)).toBe(out);
  });

  it('la vapeur : rien s\'il est sec ou à 15 °C ; un cheval en sueur fume dans le froid', () => {
    expect(steamOf(0, 0)).toBe(0);
    expect(steamOf(undefined, 0)).toBe(0);
    expect(steamOf(1, STEAM.warm)).toBe(0);
    expect(steamOf(0.1, 0)).toBe(0);
    expect(steamOf(0.8, 2)).toBeCloseTo(0.8);
    expect(steamOf(0.8, 10)).toBeGreaterThan(0);
    expect(steamOf(0.8, 10)).toBeLessThan(steamOf(0.8, 2));
  });
});

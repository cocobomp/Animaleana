import { describe, it, expect } from 'vitest';
import {
  makeRandom, BLINK, planBlink, blinkAmount, blinkDuration, blinkLength, planGaze, IDLE_GESTURES,
  pickIdleGesture, nextIdleDelay, nextShiftDelay, careGestureFor, CARE_GESTURE_TIME, envelope,
  keyframes, legIK, squatPose, LEG, gaitWeights, gaitFromSpeed, riderPose,
} from '../src/game/models/avatarMotion.js';
import { CARE } from '../src/sim/animal.js';

describe('clignement des yeux', () => {
  it('le prochain clignement arrive entre 2 et 6 s, parfois double', () => {
    const rand = makeRandom(42);
    let doubles = 0;
    for (let i = 0; i < 2000; i++) {
      const p = planBlink(rand);
      expect(p.delay).toBeGreaterThanOrEqual(2);
      expect(p.delay).toBeLessThanOrEqual(6);
      if (p.double) doubles++;
    }
    // « Parfois » : ni jamais, ni la plupart du temps.
    expect(doubles / 2000).toBeGreaterThan(0.1);
    expect(doubles / 2000).toBeLessThan(0.35);
  });

  it('la paupière part ouverte, se ferme, puis se rouvre', () => {
    expect(blinkAmount(0)).toBe(0);
    expect(blinkAmount(BLINK.close + BLINK.hold / 2)).toBe(1);
    expect(blinkAmount(blinkLength())).toBe(0);
    expect(blinkAmount(blinkLength() + 0.5)).toBe(0);
    for (let t = 0; t < blinkLength(); t += 0.005) {
      const v = blinkAmount(t);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    // Un clignement est rapide (moins d'un quart de seconde).
    expect(blinkLength()).toBeLessThan(0.25);
  });

  it('un double clignement ferme deux fois l\'œil, avec une petite pause entre les deux', () => {
    let closes = 0;
    let wasClosed = false;
    for (let t = 0; t <= blinkDuration(true); t += 0.002) {
      const shut = blinkAmount(t, true) > 0.95;
      if (shut && !wasClosed) closes++;
      wasClosed = shut;
    }
    expect(closes).toBe(2);
    expect(blinkAmount(blinkLength() + BLINK.gap / 2, true)).toBe(0);
    expect(blinkDuration(true)).toBeGreaterThan(blinkDuration(false));
  });

  it('le regard bouge un peu, pas trop', () => {
    const rand = makeRandom(7);
    for (let i = 0; i < 500; i++) {
      const g = planGaze(rand);
      expect(Math.abs(g.yaw)).toBeLessThanOrEqual(0.33);
      expect(Math.abs(g.pitch)).toBeLessThanOrEqual(0.1);
      expect(g.delay).toBeGreaterThan(0.5);
    }
  });

  it('chaque personnage a son propre hasard (désynchronisés), reproductible', () => {
    const a = makeRandom(1);
    const b = makeRandom(2);
    const a2 = makeRandom(1);
    const sa = [a(), a(), a()];
    expect([b(), b(), b()]).not.toEqual(sa);
    expect([a2(), a2(), a2()]).toEqual(sa);
  });
});

describe("gestes d'attente", () => {
  it('jamais deux fois le même geste de suite, et tous finissent par arriver', () => {
    const rand = makeRandom(3);
    const seen = new Set();
    let last = null;
    for (let i = 0; i < 400; i++) {
      const g = pickIdleGesture(rand, last);
      expect(IDLE_GESTURES[g]).toBeGreaterThan(0);
      expect(g).not.toBe(last);
      seen.add(g);
      last = g;
    }
    expect([...seen].sort()).toEqual(Object.keys(IDLE_GESTURES).sort());
  });

  it('les gestes sont espacés de plusieurs secondes ; on change de jambe d\'appui de temps en temps', () => {
    const rand = makeRandom(9);
    for (let i = 0; i < 200; i++) {
      const d = nextIdleDelay(rand);
      expect(d).toBeGreaterThanOrEqual(4.5);
      expect(d).toBeLessThanOrEqual(12);
      expect(nextIdleDelay(rand, 1.5)).toBeGreaterThanOrEqual(4.5 * 1.5);
      const s = nextShiftDelay(rand);
      expect(s).toBeGreaterThanOrEqual(3.5);
      expect(s).toBeLessThanOrEqual(9);
    }
  });
});

describe('gestes de soin', () => {
  it('chaque soin a son geste', () => {
    expect(careGestureFor('feed')).toBe('pour');
    expect(careGestureFor('water')).toBe('pour');
    expect(careGestureFor('brush')).toBe('brush');
    expect(careGestureFor('pet')).toBe('pet');
    expect(careGestureFor('wash')).toBe('scrub');
    expect(careGestureFor('treat')).toBe('offer');
    const kinds = new Set(['pour', 'offer', 'brush', 'pet', 'scrub', 'tool', 'play', 'lead', 'milk']);
    for (const action of Object.keys(CARE)) expect(kinds.has(careGestureFor(action))).toBe(true);
    // Un soin inconnu : une caresse.
    expect(careGestureFor('???')).toBe('pet');
  });

  it('le geste est court et revient en douceur à la pose normale', () => {
    expect(CARE_GESTURE_TIME).toBeGreaterThanOrEqual(1);
    expect(CARE_GESTURE_TIME).toBeLessThanOrEqual(1.5);
    const d = CARE_GESTURE_TIME;
    expect(envelope(0, d)).toBe(0);
    expect(envelope(d, d)).toBe(0);
    expect(envelope(d / 2, d)).toBe(1);
    // Pas de saut : la montée et la descente sont continues.
    let prev = 0;
    for (let t = 0; t <= d; t += 0.01) {
      const v = envelope(t, d);
      expect(Math.abs(v - prev)).toBeLessThan(0.08);
      prev = v;
    }
  });

  it('images clés : interpolation douce, bornée', () => {
    const keys = [[0, 0], [1, 1], [2, -1]];
    expect(keyframes(-1, keys)).toBe(0);
    expect(keyframes(0.5, keys)).toBeCloseTo(0.5);
    expect(keyframes(1, keys)).toBe(1);
    expect(keyframes(3, keys)).toBe(-1);
  });
});

describe('jambes', () => {
  const ankle = ({ hip, knee }) => ({
    z: -LEG.thigh * Math.sin(hip) - LEG.shin * Math.sin(hip + knee),
    y: -LEG.thigh * Math.cos(hip) - LEG.shin * Math.cos(hip + knee),
  });

  it('la cheville arrive où on le demande, genou plié vers l\'avant', () => {
    for (const [dz, dy] of [[0, -0.7], [0.1, -0.6], [0.15, -0.5], [-0.05, -0.65]]) {
      const r = legIK(dz, dy);
      const p = ankle(r);
      expect(p.z).toBeCloseTo(dz, 3);
      expect(p.y).toBeCloseTo(dy, 3);
      expect(r.knee).toBeGreaterThan(0);
    }
    // Trop loin : jambe tendue (genou droit).
    expect(legIK(0, -2).knee).toBeLessThan(0.05);
  });

  it('accroupi : le pied reste à plat et sous la hanche, le bassin descend', () => {
    let lastDrop = -1;
    for (let k = 0; k <= 1; k += 0.1) {
      const s = squatPose(k);
      expect(s.hip + s.knee + s.ankle).toBeCloseTo(0, 6);
      const p = ankle(s);
      expect(Math.abs(p.z)).toBeLessThan(0.03);
      expect(s.drop).toBeGreaterThanOrEqual(lastDrop);
      lastDrop = s.drop;
    }
    expect(squatPose(0).drop).toBeCloseTo(0, 6);
    expect(squatPose(1).drop).toBeGreaterThan(0.3);
  });

  it('pas d\'allocation : on peut réutiliser l\'objet de sortie', () => {
    const out = {};
    expect(squatPose(0.5, out)).toBe(out);
    expect(legIK(0, -0.6, LEG.thigh, LEG.shin, out)).toBe(out);
    expect(riderPose(1, 0.3, true, out)).toBe(out);
  });
});

describe('à cheval', () => {
  it('poids des allures', () => {
    expect(gaitWeights(0)).toEqual({ walk: 1, trot: 0, gallop: 0 });
    expect(gaitWeights(1)).toEqual({ walk: 0, trot: 1, gallop: 0 });
    expect(gaitWeights(2)).toEqual({ walk: 0, trot: 0, gallop: 1 });
    const w = gaitWeights(1.5);
    expect(w.walk + w.trot + w.gallop).toBeCloseTo(1);
  });

  it("l'allure se déduit de la vitesse quand le modèle ne la donne pas (GLB)", () => {
    expect(gaitFromSpeed(0, 1.6, 5)).toBe(0);
    expect(gaitFromSpeed(1.6, 1.6, 5)).toBe(0);
    expect(gaitFromSpeed(2.8, 1.6, 5)).toBe(1);
    expect(gaitFromSpeed(4, 1.6, 5)).toBe(2);
  });

  it('trot enlevé : on se lève une fois par foulée ; trot assis : on reste en selle', () => {
    const lifts = [];
    for (let ph = 0; ph < Math.PI * 2; ph += 0.1) lifts.push(riderPose(1, ph, true).lift);
    expect(Math.max(...lifts)).toBeGreaterThan(0.06);
    expect(Math.min(...lifts)).toBeLessThan(0.005);
    const sit = [];
    for (let ph = 0; ph < Math.PI * 2; ph += 0.1) sit.push(riderPose(1, ph, false).lift);
    expect(Math.max(...sit)).toBeLessThan(0.02);
  });

  it('au galop le buste se penche en avant et les mains avancent ; au pas il reste droit', () => {
    const walk = riderPose(0, 0.5, true);
    const gallop = riderPose(2, 0.5, true);
    expect(walk.lean).toBeLessThan(0.08);
    expect(gallop.lean).toBeGreaterThan(0.3);
    expect(gallop.reach).toBeGreaterThan(walk.reach);
  });
});

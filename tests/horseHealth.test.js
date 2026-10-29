// Le carnet de santé du cheval (src/sim/horseHealth.js) : vermifuge, vaccins, dents, maréchal-ferrant ; rappels le
// jour venu, effets des retards (il maigrit, la grippe, un fer perdu), et c'est fait : tout redevient à jour.
import { describe, it, expect } from 'vitest';
import { createAnimal } from '../src/sim/animal.js';
import { seeded, mulberry32 } from '../src/sim/rng.js';
import { HEALTH_PLAN, HEALTH_IDS, healthPlan, noteHealth, healthDay } from '../src/sim/horseHealth.js';

const horse = () => {
  const a = createAnimal({ species: 'horse', sex: 'f', ageDays: 2000, rng: seeded('carnet') });
  a.weight = 50;
  return a;
};
/** Les jours passent, un par un, du jour d1 au jour d2 (comme Game.horseHealthDay). */
function live(a, d1, d2, rng = () => 0.99) {
  const out = [];
  for (let d = d1; d <= d2; d++) out.push(...healthDay(a, d, rng).map((e) => [d, e]));
  return out;
}

describe('le carnet de santé du cheval', () => {
  it('un cheval qui arrive : tout est à jour, mais pas tout le même jour', () => {
    const plan = healthPlan(horse(), 10);
    expect(plan.map((x) => x.id)).toEqual(HEALTH_IDS);
    for (const it of plan) expect(it.state, it.id).toBe('ok');
    expect(new Set(plan.map((x) => x.due)).size).toBe(4);
    expect(healthPlan(createAnimal({ species: 'dog', sex: 'f', ageDays: 300, rng: seeded('c') }), 10)).toEqual([]);
  });

  it('le jour venu, un rappel (une seule fois) ; fait, il revient au bout de sa période', () => {
    const a = horse();
    const ev = live(a, 1, 40);
    const worm = ev.filter(([, e]) => e === 'remind:worm');
    expect(worm.length).toBe(1);
    const due = worm[0][0];
    expect(healthPlan(a, due).find((x) => x.id === 'worm').state).not.toBe('ok');
    noteHealth(a, 'worm', due);
    const it = healthPlan(a, due).find((x) => x.id === 'worm');
    expect(it.state).toBe('ok');
    expect(it.left).toBe(HEALTH_PLAN.worm.every);
  });

  it('vermifuge oublié : il maigrit ; fers trop usés : il perd un fer et boite, ferré il ne boite plus', () => {
    const a = horse();
    live(a, 1, 60, mulberry32(3));
    expect(a.weight).toBeLessThan(50);
    expect(healthPlan(a, 60).find((x) => x.id === 'worm').state).toBe('late');
    const b = horse();
    const ev = live(b, 1, 40, mulberry32(7));
    expect(ev.some(([, e]) => e === 'lostShoe')).toBe(true);
    expect(b.lame.cause).toBe('shoe');
    noteHealth(b, 'farrier', 40);
    expect(b.lame).toBeNull();
  });

  it('sans vaccin depuis longtemps, il peut attraper la grippe', () => {
    const a = horse();
    const ev = live(a, 1, 160, mulberry32(11));
    expect(ev.some(([, e]) => e === 'sick')).toBe(true);
    expect(a.sick).toBe('flu');
  });

  it('bien suivi (vétérinaire, vermifuge, maréchal à temps) : ni maigreur, ni grippe, ni fer perdu', () => {
    const a = horse();
    const rng = mulberry32(5);
    for (let d = 1; d <= 200; d++) {
      for (const [, e] of live(a, d, d, rng)) {
        expect(e.startsWith('remind:'), e).toBe(true);
        noteHealth(a, e.slice(7), d);
      }
    }
    expect(a.weight).toBe(50);
    expect(a.sick ?? null).toBeNull();
    expect(a.lame ?? null).toBeNull();
  });

  it('une longue absence ne compte pas tout d\'un coup (10 jours au plus)', () => {
    const a = horse();
    healthDay(a, 1);
    noteHealth(a, 'worm', -100); // très en retard
    healthDay(a, 400, () => 0.99);
    expect(a.weight).toBeGreaterThanOrEqual(50 - 10 * 1.5 - 10 * 1);
  });
});

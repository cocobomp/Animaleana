// ⬆️ Le trot enlevé (src/sim/posting.js) : toucher au temps fort de chaque foulée (ni trop tôt, ni trop tard, une
// fois par foulée) ; trois de suite et on trotte enlevé ; sans toucher, on retombe assis ; enlevé, le trot fatigue
// deux fois moins le cheval.
import { describe, it, expect } from 'vitest';
import { POST, newPosting, tapPost, isPosting, postTick, postMilestone, beatRing } from '../src/sim/posting.js';
import { rideEffort } from '../src/sim/riding.js';

describe('le trot enlevé', () => {
  it('en rythme : la série monte et on trotte enlevé ; trop tôt, trop tard ou deux fois : elle repart à zéro', () => {
    const st = newPosting();
    expect(tapPost(st, 1.05)).toMatchObject({ ok: true, streak: 1 });
    expect(tapPost(st, 1.95)).toMatchObject({ ok: true, streak: 2, early: true });
    expect(isPosting(st, 2.5)).toBe(false);
    expect(tapPost(st, 3.1).streak).toBe(3);
    expect(isPosting(st, 3.5)).toBe(true);
    // deux fois sur le même temps fort
    expect(tapPost(st, 3.15).ok).toBe(false);
    expect(st.streak).toBe(0);
    // trop loin du temps fort
    expect(tapPost(st, 4.5).ok).toBe(false);
    expect(st.best).toBe(3);
  });

  it('sans toucher (ou plus au trot), on retombe assis', () => {
    const st = newPosting();
    for (const s of [1, 2, 3, 4]) tapPost(st, s);
    postTick(st, 4.5, true);
    expect(isPosting(st, 4.5)).toBe(true);
    postTick(st, 4 + POST.hold + 0.1, true);
    expect(st.streak).toBe(0);
    for (const s of [6, 7, 8]) tapPost(st, s);
    postTick(st, 8.2, false);
    expect(st.streak).toBe(0);
  });

  it('huit bons temps de suite : bravo, une fois par balade', () => {
    const st = newPosting();
    for (let s = 1; s < POST.statAt; s++) { tapPost(st, s); expect(postMilestone(st)).toBe(false); }
    tapPost(st, POST.statAt);
    expect(postMilestone(st)).toBe(true);
    tapPost(st, POST.statAt + 1);
    expect(postMilestone(st)).toBe(false);
  });

  it('le cercle se referme jusqu\'au temps fort', () => {
    expect(beatRing(3)).toBe(1);
    expect(beatRing(3.75)).toBeCloseTo(0.25, 5);
  });

  it('enlevé, le trot le fatigue deux fois moins', () => {
    const a = { needs: { energy: 80, grooming: 80, thirst: 80 } };
    const b = { needs: { energy: 80, grooming: 80, thirst: 80 } };
    rideEffort(a, 'trot', 100);
    rideEffort(b, 'trot', 100, POST.save);
    expect(80 - b.needs.energy).toBeCloseTo((80 - a.needs.energy) * POST.save, 5);
    // (le galop ne change pas)
    const c = { needs: { energy: 80, grooming: 80, thirst: 80 } };
    const d = { needs: { energy: 80, grooming: 80, thirst: 80 } };
    rideEffort(c, 'canter', 10);
    rideEffort(d, 'canter', 10, POST.save);
    expect(d.needs.energy).toBe(c.needs.energy);
  });
});

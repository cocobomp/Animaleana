// ⤴️ Sauter en balade (src/sim/freeJumps.js) : des troncs sur le chemin de balade, qu'on saute dans les deux sens ;
// au galop, bien droit : le bouton apparaît, l'appel au bon endroit fait un beau saut, sinon il saute tout seul au
// dernier moment ; au trot ou de travers, rien.
import { describe, it, expect, beforeAll } from 'vitest';
import { LOG, logSpots, logView, jumpAhead, jumpNow } from '../src/sim/freeJumps.js';
import { TRAIL, TAKEOFF } from '../src/sim/activities.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

describe('les troncs du chemin de balade', () => {
  const logs = logSpots();
  it('quelques troncs, en travers du chemin, entre deux points de la balade', () => {
    expect(logs.length).toBeGreaterThanOrEqual(3);
    const pts = [TRAIL.start, ...TRAIL.checkpoints];
    for (const o of logs) {
      const i = Number(o.id.slice(3));
      const a = pts[i];
      const b = pts[i + 1];
      // (sur le segment)
      const cross = (b.x - a.x) * (o.z - a.z) - (b.z - a.z) * (o.x - a.x);
      expect(Math.abs(cross) / Math.hypot(b.x - a.x, b.z - a.z)).toBeLessThan(1e-6);
      expect(o.heading).toBeCloseTo(Math.atan2(b.x - a.x, b.z - a.z), 6);
    }
  });

  it('au galop, droit dessus : le bouton, puis un beau saut si l\'on appelle à 1,8 m', () => {
    const o = logs[0];
    const at = (u) => ({ x: o.x - Math.sin(o.heading) * u, z: o.z - Math.cos(o.heading) * u });
    let p = at(8);
    let view = logView(o, p.x, p.z, o.heading);
    expect(view.u).toBeCloseTo(-8, 5);
    expect(jumpAhead(view, 5)).toBe(true);
    expect(jumpAhead(view, 2)).toBe(false); // (au trot : il l'enjambera)
    expect(jumpNow(view, -8.2, 5, true)).toBeNull(); // (trop loin pour appeler)
    p = at(TAKEOFF);
    view = logView(o, p.x, p.z, o.heading);
    const r = jumpNow(view, -2, 5, true);
    expect(r.what).toBe('jump');
    expect(r.timing).toBeCloseTo(1, 5);
  });

  it('rien demandé : il saute tout seul au dernier moment (moins bien) ; au trot, il l\'enjambe ; de travers : rien', () => {
    const o = logs[1];
    const at = (u, side = 0) => ({ x: o.x - Math.sin(o.heading) * u + Math.cos(o.heading) * side, z: o.z - Math.cos(o.heading) * u - Math.sin(o.heading) * side });
    const p = at(0.5);
    const view = logView(o, p.x, p.z, o.heading);
    expect(jumpNow(view, -0.8, 5, false)).toEqual({ what: 'auto', timing: LOG.autoTiming });
    expect(jumpNow(view, -0.8, 2, false)).toEqual({ what: 'step', timing: 0.2 }); // (au trot : il l'enjambe)
    expect(jumpNow(view, -0.8, 0.5, false)).toBeNull(); // (au pas : il passe)
    const skew = logView(o, p.x, p.z, o.heading + 1.4);
    expect(jumpNow(skew, -0.8, 5, false)).toBeNull();
    const q = at(0.5, 3); // (à côté du tronc)
    expect(jumpNow(logView(o, q.x, q.z, o.heading), -0.8, 5, false)).toBeNull();
  });

  it('il se saute dans les deux sens', () => {
    const o = logs[2];
    const back = o.heading + Math.PI;
    const p = { x: o.x + Math.sin(o.heading) * 3, z: o.z + Math.cos(o.heading) * 3 };
    const view = logView(o, p.x, p.z, back);
    expect(view.u).toBeCloseTo(-3, 5);
    expect(view.align).toBeCloseTo(1, 5);
    expect(jumpAhead(view, 5)).toBe(true);
  });

  it('les textes existent en français et en anglais', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of ['fj_btn', 'fj_btnHelp', 'fj_tip', 'fj_first', 'fj_great', 'fj_ok', 'fj_auto']) expect(t(k, { name: 'Étoile' })).not.toBe(k);
    }
    setLang('fr');
  });
});

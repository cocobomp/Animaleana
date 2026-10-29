// 🎃 Halloween au poney-club (src/sim/halloween.js) : la fête, les citrouilles le long du chemin, la chasse.
import { describe, it, expect, beforeAll } from 'vitest';
import { HALLOWEEN, halloweenOn, pumpkinSpots, decorSpots, huntState, findPumpkin, huntView } from '../src/sim/halloween.js';
import { TRAIL } from '../src/sim/activities.js';
import { GEAR, TACK_CATEGORIES, buyGear, giveGear, owned } from '../src/sim/gear.js';
import { createProfile } from '../src/sim/profile.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

describe('Halloween au poney-club', () => {
  it('la fête : du 24 octobre au 2 novembre seulement', () => {
    expect(halloweenOn(new Date(2026, 9, 23))).toBe(false);
    expect(halloweenOn(new Date(2026, 9, 24))).toBe(true);
    expect(halloweenOn(new Date(2026, 9, 31))).toBe(true);
    expect(halloweenOn(new Date(2026, 10, 2))).toBe(true);
    expect(halloweenOn(new Date(2026, 10, 3))).toBe(false);
    expect(halloweenOn(new Date(2026, 6, 14))).toBe(false);
  });

  it('une citrouille à chaque point du chemin (pas à l\'écurie), au bord du chemin, pas dessus', () => {
    const spots = pumpkinSpots();
    expect(spots).toHaveLength(TRAIL.checkpoints.length - 1);
    expect(new Set(spots.map((s) => s.id)).size).toBe(spots.length);
    spots.forEach((s, i) => {
      const cp = TRAIL.checkpoints[i];
      const d = Math.hypot(s.x - cp.x, s.z - cp.z);
      expect(d).toBeCloseTo(HALLOWEEN.side, 5);
      expect(d).toBeLessThan(HALLOWEEN.reach); // (on la trouve en passant au point du chemin)
    });
    expect(decorSpots().length).toBeGreaterThan(0);
  });

  it('la chasse : chaque citrouille compte une fois ; la dernière finit la chasse ; l\'an prochain, on recommence', () => {
    const p = createProfile('Lou');
    const spots = pumpkinSpots();
    expect(findPumpkin(p, spots[0].id, 2026)).toMatchObject({ what: 'found', n: 1, total: spots.length });
    expect(findPumpkin(p, spots[0].id, 2026).what).toBeNull();
    for (const s of spots.slice(1, -1)) expect(findPumpkin(p, s.id, 2026).what).toBe('found');
    expect(findPumpkin(p, spots.at(-1).id, 2026)).toMatchObject({ what: 'done', n: spots.length });
    expect(findPumpkin(p, spots.at(-1).id, 2026).what).toBeNull();
    expect(huntView(p, new Date(2026, 9, 30))).toEqual({ n: spots.length, total: spots.length, done: true });
    expect(huntView(p, new Date(2026, 11, 30))).toBeNull();
    expect(huntState(p, 2027)).toEqual({ year: 2027, found: [], done: false });
  });

  it('le tapis citrouille : dans la sellerie, il ne s\'achète pas, il se gagne', () => {
    expect(GEAR.padPumpkin.reward).toBe('halloween');
    expect(TACK_CATEGORIES.find((c) => c.id === 'pad').items).toContain('padPumpkin');
    const p = createProfile('Lou', 'manage');
    p.money = 1000;
    expect(buyGear(p, 'padPumpkin')).toEqual({ ok: false, reason: 'reward' });
    expect(p.money).toBe(1000);
    expect(giveGear(p, 'padPumpkin', 'pony')).toBe(true);
    expect(owned(p, 'padPumpkin')).toBe(1);
  });

  it('chaque texte existe en français et en anglais', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of ['hw_hello', 'hw_onFoot', 'hw_found', 'hw_done', 'hw_doneWorn', 'hw_line', 'hw_lineDone', 'lb_pumpkins', 'hw_guide', 'hw_guiding']) {
        expect(t(k, { n: 3, total: 8, name: 'Étoile' }), `${lang} ${k}`).not.toBe(k);
      }
    }
    setLang('fr');
    expect(t('hw_hello', { n: 1 })).toContain('Plus qu\'une citrouille');
  });
});

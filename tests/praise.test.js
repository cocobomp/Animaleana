// 🤚 « Bravo ! » / « Rassure-le » en selle (src/sim/praise.js) : un bouton quelques secondes après un beau saut, le retour
// au calme ou un écart ; touché, des gratouilles au garrot et un peu de lien.
import { describe, it, expect, beforeAll } from 'vitest';
import { PRAISE, newPraise, openPraise, canPraise, doPraise, coolJustDone } from '../src/sim/praise.js';
import { WARMUP, newSession, sessionTick } from '../src/sim/warmup.js';
import { quirksOf, QUIRK_FEARS, FEAR_CALM } from '../src/sim/horseQuirks.js';
import { createAnimal } from '../src/sim/animal.js';
import { createProfile } from '../src/sim/profile.js';
import { LOGBOOK } from '../src/sim/galops.js';
import { MEMORIES } from '../src/sim/memories.js';
import { seeded } from '../src/sim/rng.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

const horse = (o = {}) => Object.assign(createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'f', ageDays: 2000, rng: seeded('pr') }), { bond: 20 }, o);
/** Un cheval dont le coin préféré est (ou n'est pas) le garrot. */
const withSpot = (withers) => {
  for (let i = 0; i < 200; i++) if ((quirksOf({ id: `h${i}` }).spot === 'withers') === withers) return horse({ id: `h${i}` });
  throw new Error('pas trouvé');
};

describe('le bouton', () => {
  it('reste 3 s après un beau saut, 4 s après un écart, 6 s après le retour au calme', () => {
    for (const [why, secs] of [['jump', 3], ['spook', 4], ['cool', 6]]) {
      const st = newPraise();
      expect(canPraise(st, 10)).toBe(false);
      openPraise(st, why, 10);
      expect(st.why).toBe(why);
      expect(canPraise(st, 10 + secs - 0.05), why).toBe(true);
      expect(canPraise(st, 10 + secs), why).toBe(false);
    }
    expect([PRAISE.window, PRAISE.spookWindow, PRAISE.coolWindow]).toEqual([3, 4, 6]);
  });

  it('touché : il s\'en va ; trop tard, rien', () => {
    const a = horse();
    const st = newPraise();
    openPraise(st, 'jump', 0);
    expect(doPraise(st, a, 5, 1).ok).toBe(false);
    expect(st.n).toBe(0);
    openPraise(st, 'cool', 5);
    expect(doPraise(st, a, 6, 1)).toMatchObject({ ok: true, why: 'cool' });
    expect(canPraise(st, 6)).toBe(false);
    expect(doPraise(st, a, 6, 1).ok).toBe(false);
  });

  it('au plus 3 par balade : le 4e ne s\'ouvre plus', () => {
    const a = horse();
    const st = newPraise();
    for (let i = 0; i < PRAISE.perRide; i++) {
      openPraise(st, 'jump', i * 10);
      expect(doPraise(st, a, i * 10 + 1, 1).ok).toBe(true);
    }
    openPraise(st, 'jump', 50);
    expect(canPraise(st, 51)).toBe(false);
    expect(doPraise(st, a, 51, 1).ok).toBe(false);
  });
});

describe('ce qu\'il y gagne', () => {
  it('lien +0,3 et affection +3', () => {
    const a = horse();
    a.needs.affection = 50;
    const st = newPraise();
    openPraise(st, 'jump', 0);
    doPraise(st, a, 1, 1);
    expect(a.bond).toBeCloseTo(20.3, 5);
    expect(a.needs.affection).toBe(53);
  });

  it('au plus 6 fois par jour, même en deux balades ; le lendemain, ça recommence', () => {
    const a = horse();
    let t0 = 0;
    const ride = (n, day) => {
      const st = newPraise();
      for (let i = 0; i < n; i++) {
        openPraise(st, 'spook', (t0 += 10));
        expect(doPraise(st, a, t0 + 1, day).ok).toBe(true);
      }
    };
    ride(3, 4);
    ride(3, 4);
    expect(a.bond).toBeCloseTo(20 + 6 * PRAISE.bond, 5);
    ride(3, 4); // (la 3e balade du jour : toujours des cœurs, plus de lien)
    expect(a.bond).toBeCloseTo(20 + 6 * PRAISE.bond, 5);
    ride(1, 5);
    expect(a.bond).toBeCloseTo(20 + 7 * PRAISE.bond, 5);
  });

  it('un cheval qu\'on te confie : le bouton marche, sans lien', () => {
    const c = horse({ client: true });
    const st = newPraise();
    openPraise(st, 'jump', 0);
    expect(doPraise(st, c, 1, 1).ok).toBe(true);
    expect(c.bond).toBe(20);
    expect(c.praiseDay).toBeUndefined();
  });

  it('💖 seulement si le garrot est son coin préféré, et que tu le sais', () => {
    const tap = (a) => {
      const st = newPraise();
      openPraise(st, 'jump', 0);
      return doPraise(st, a, 1, 1).fav;
    };
    const w = withSpot(true);
    expect(tap(w)).toBe(false);
    w.known = { spot: true };
    expect(tap(w)).toBe(true);
    const n = withSpot(false);
    n.known = { spot: true };
    expect(tap(n)).toBe(false);
  });
});

describe('le retour au calme fini', () => {
  const run = (s, gait, secs, seen) => {
    for (let k = 0; k < secs * 10; k++) {
      const c0 = s.cool;
      sessionTick(s, gait, 0.1);
      if (coolJustDone(s, c0)) seen.push(gait);
    }
  };

  it('une seule fois, en passant 15 s de pas après au moins 4 s de galop', () => {
    const s = newSession();
    const seen = [];
    run(s, 'canter', WARMUP.hard + 1, seen);
    run(s, 'walk', WARMUP.cool - 1, seen);
    expect(seen).toEqual([]);
    run(s, 'walk', 30, seen);
    expect(seen).toEqual(['walk']);
    // (un nouveau galop, puis encore le pas : encore une fois)
    run(s, 'canter', 2, seen);
    run(s, 'walk', WARMUP.cool + 1, seen);
    expect(seen).toHaveLength(2);
  });

  it('pas assez de galop : rien', () => {
    const s = newSession();
    const seen = [];
    run(s, 'canter', WARMUP.hard - 1, seen);
    run(s, 'walk', 30, seen);
    expect(seen).toEqual([]);
  });
});

describe('dans le jeu (src/game/Game.js praiseHorse)', () => {
  let Game;
  let t;
  beforeAll(async () => {
    ({ Game } = await import('../src/game/Game.js'));
    ({ t } = await import('../src/i18n.js'));
  }, 60000);

  const fakeGame = (a) => {
    const p = createProfile('Lou');
    p.animals.push(a);
    const toasts = [];
    const emits = [];
    const gestures = [];
    const praised = [];
    const mount = { data: a, time: 0, emit: (e) => emits.push(e) };
    const g = {
      profile: p, toasts, emits, gestures, praised, day: 3,
      player: { mount, gaitEnabled: true, praise: newPraise(), careGesture: (...x) => gestures.push(x), praised: (w) => praised.push(w) },
      activities: { active: null }, tripFlow: { active: false },
      entities: new Map([[a.id, mount]]),
      ui: { toast: (m) => toasts.push(m) },
      remember(x, id) { if (id) (x.memories ??= []).push({ id, day: 3 }); return !!id; },
    };
    for (const k of ['canPraise', 'praiseHorse', 'bondNews']) g[k] = Game.prototype[k].bind(g);
    return g;
  };

  it('« Bravo ! » : les gratouilles au garrot, des 💕, le petit mot la première fois, compté dans le carnet', () => {
    const a = horse({ id: 'p1', name: 'Pomme' });
    const g = fakeGame(a);
    expect(g.canPraise()).toBe(false);
    expect(g.praiseHorse()).toBeNull();
    openPraise(g.player.praise, 'jump', 0);
    expect(g.canPraise()).toBe(true);
    expect(g.praiseHorse()).toMatchObject({ ok: true, why: 'jump' });
    expect(g.gestures).toEqual([['pet', g.player.mount, { withers: true }]]);
    expect(g.emits).toEqual(['💕']);
    expect(g.toasts).toEqual([t('pr_tip', { g: 'f' })]);
    expect(g.profile.stats.praises).toBe(1);
    expect(g.canPraise()).toBe(false);
    // (en activité, ou en voyage : pas de bouton)
    openPraise(g.player.praise, 'jump', 0);
    g.activities.active = {};
    expect(g.canPraise()).toBe(false);
  });

  it('en pleine série de trot enlevé, ⬆️ garde sa place : « Rassure-le » attend que la série retombe', () => {
    const g = fakeGame(horse({ id: 'p3', name: 'Pomme' }));
    openPraise(g.player.praise, 'spook', 0);
    g.player.postingNow = true;
    expect(g.canPraise()).toBe(false);
    expect(g.praiseHorse()).toBeNull();
    g.player.postingNow = false; // (trot assis, galop, ou la série est retombée)
    expect(g.canPraise()).toBe(true);
  });

  it('« Rassure-le » après un écart de sa peur à lui : 💪 2/5… puis plus jamais peur (souvenir, lien +3)', () => {
    const a = horse({ id: 'p2', name: 'Pomme', known: { fear: true } });
    const fear = quirksOf(a).fear;
    const g = fakeGame(a);
    g.player.spookCause = fear;
    const what = t(`qk_fear${fear}`);
    for (let i = 1; i < FEAR_CALM; i++) {
      g.player.praise = newPraise(); // (une nouvelle balade : au plus 3 par balade)
      openPraise(g.player.praise, 'spook', 0);
      g.praiseHorse();
      expect(g.toasts.at(-1)).toBe(t('pr_fearStep', { name: 'Pomme', g: 'f', what, n: i, total: FEAR_CALM }));
    }
    expect(g.toasts[1]).toBe(`💪 Pomme a moins peur ${what} (2/5)`);
    expect(g.praised).toEqual(['spook', 'spook', 'spook', 'spook']);
    const b0 = a.bond;
    openPraise(g.player.praise, 'spook', 0);
    g.praiseHorse();
    expect(a.fearGone).toBe(true);
    expect(g.toasts.at(-1)).toBe(`💪 Pomme n'a plus peur ${what} !`);
    expect(a.memories.map((m) => m.id)).toContain('fearGone');
    expect(a.bond).toBeCloseTo(b0 + 3 + PRAISE.bond, 5);
    // (un écart d'autre chose : il se calme, c'est tout)
    g.player.praise = newPraise();
    g.player.spookCause = (fear + 1) % QUIRK_FEARS;
    openPraise(g.player.praise, 'spook', 0);
    g.praiseHorse();
    expect(g.toasts.at(-1)).toBe(t('pr_calm', { g: 'f' }));
  });
});

describe('les textes', () => {
  it('le bouton, les petits mots, la fiche, le souvenir et le carnet (FR, au féminin aussi, et EN)', () => {
    const { t, setLang } = i18n;
    const keys = ['pr_btn', 'pr_btnCalm', 'pr_btnHelp', 'pr_tip', 'pr_fav', 'pr_calm', 'pr_fearStep', 'pr_fearGone', 'qk_fearGone', 'mem_fearGone', 'lb_praises'];
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of keys) for (const g of ['m', 'f']) expect(t(k, { name: 'Pomme', g, what: 'x', n: 2, total: 5 }), `${lang} ${k}`).not.toBe(k);
    }
    setLang('fr');
    expect(t('pr_btnCalm', { g: 'f' })).toBe('Rassure-la');
    expect(t('pr_calm', { g: 'm' })).toBe('💚 Tu le rassures : il se calme.');
    expect(t('qk_fearGone', { g: 'f', what: t('qk_fear0') })).toBe('💪 Elle n\'a plus peur des oiseaux');
    expect(t('pr_fearStep', { name: 'Pomme', what: t('qk_fear0'), n: 2, total: FEAR_CALM })).toBe('💪 Pomme a moins peur des oiseaux (2/5)');
    expect(LOGBOOK.some((x) => x.id === 'praises')).toBe(true);
    expect(MEMORIES.find((x) => x.id === 'fearGone')?.icon).toBe('💪');
  });
});

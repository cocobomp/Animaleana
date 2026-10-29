// 🔍 Ce que tu sais de lui (src/sim/horseQuirks.js) : son coin préféré, sa friandise préférée, sa peur en balade.
import { describe, it, expect, beforeAll } from 'vitest';
import { QUIRK_SPOTS, QUIRK_TREATS, QUIRK_FEARS, quirksOf, knows, discoverQuirk, spookCause, noteFear } from '../src/sim/horseQuirks.js';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

const horse = (o = {}) => Object.assign(createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'f', ageDays: 2000, rng: seeded('qk') }), o);

describe('ses goûts', () => {
  it('le même cheval a toujours les mêmes ; deux chevaux, pas forcément', () => {
    expect(quirksOf({ id: 'etoile' })).toEqual(quirksOf({ id: 'etoile' }));
    const all = new Set(Array.from({ length: 30 }, (_, i) => JSON.stringify(quirksOf({ id: `h${i}` }))));
    expect(all.size).toBeGreaterThan(10);
  });

  it('sur 2000 chevaux : le garrot le plus souvent, carotte et pomme moitié-moitié, les quatre peurs', () => {
    const N = 2000;
    const spots = {};
    const treats = {};
    const fears = {};
    for (let i = 0; i < N; i++) {
      const q = quirksOf({ id: `cheval-${i}` });
      spots[q.spot] = (spots[q.spot] ?? 0) + 1;
      treats[q.treat] = (treats[q.treat] ?? 0) + 1;
      fears[q.fear] = (fears[q.fear] ?? 0) + 1;
    }
    const total = Object.values(QUIRK_SPOTS).reduce((s, w) => s + w, 0);
    for (const [k, w] of Object.entries(QUIRK_SPOTS)) expect(Math.abs(spots[k] / N - w / total), k).toBeLessThan(0.04);
    for (const k of QUIRK_TREATS) expect(Math.abs(treats[k] / N - 0.5), k).toBeLessThan(0.04);
    expect(Object.keys(fears).map(Number).sort()).toEqual([0, 1, 2, 3]);
    for (let f = 0; f < QUIRK_FEARS; f++) expect(fears[f] / N).toBeGreaterThan(0.18);
  });
});

describe('les découvrir', () => {
  it('une seule fois, et jamais pour un cheval qu\'on te confie', () => {
    const a = horse();
    expect(knows(a, 'spot')).toBe(false);
    expect(discoverQuirk(a, 'spot')).toBe(true);
    expect(discoverQuirk(a, 'spot')).toBe(false);
    expect(knows(a, 'spot')).toBe(true);
    expect(knows(a, 'treat')).toBe(false);
    const c = horse({ client: true });
    expect(discoverQuirk(c, 'treat')).toBe(false);
    expect(knows(c, 'treat')).toBe(false);
    const d = createAnimal({ species: 'dog', sex: 'm', ageDays: 400, rng: seeded('chien') });
    expect(discoverQuirk(d, 'spot')).toBe(false);
  });

  it('en balade, ton cheval a le plus souvent peur de sa peur à lui', () => {
    const a = horse();
    const rng = seeded('ecarts');
    let mine = 0;
    for (let i = 0; i < 2000; i++) if (spookCause(a, rng) === quirksOf(a).fear) mine++;
    expect(mine / 2000).toBeGreaterThanOrEqual(0.55);
    // un cheval qu'on te confie : de n'importe quoi
    const c = horse({ client: true });
    let his = 0;
    for (let i = 0; i < 2000; i++) if (spookCause(c, rng) === quirksOf(c).fear) his++;
    expect(his / 2000).toBeLessThan(0.35);
  });

  it('sa peur : la deuxième fois, tu as compris ; ensuite, « encore » ; une autre peur ne compte pas', () => {
    const a = horse();
    const fear = quirksOf(a).fear;
    const other = (fear + 1) % QUIRK_FEARS;
    expect(noteFear(a, other)).toBe(null);
    expect(noteFear(a, fear)).toBe(null);
    expect(noteFear(a, other)).toBe(null);
    expect(noteFear(a, fear)).toBe('discovered');
    expect(knows(a, 'fear')).toBe(true);
    expect(noteFear(a, fear)).toBe('again');
    expect(noteFear(a, other)).toBe(null);
    expect(noteFear(horse({ client: true }), fear)).toBe(null);
  });

  it('une vieille partie (sans a.known ni a.fearSeen) marche', () => {
    const a = horse();
    delete a.known;
    delete a.fearSeen;
    expect(knows(a, 'fear')).toBe(false);
    expect(noteFear(a, quirksOf(a).fear)).toBe(null);
    expect(a.fearSeen).toBe(1);
    expect(discoverQuirk(a, 'treat')).toBe(true);
    expect(a.known).toEqual({ treat: true });
  });
});

describe('les textes', () => {
  it('chaque ligne de la fiche, chaque découverte et chaque peur ont leur texte (FR, au féminin aussi, et EN)', () => {
    const { t, setLang } = i18n;
    const keys = ['qk_title', 'qk_spot', 'qk_treat', 'qk_fear', 'ride_spookAgain', 'mg_pet_lip', 'mg_treat_which', 'mg_treat_fav',
      ...['spot', 'treat', 'fear'].flatMap((k) => [`qk_hint_${k}`, `qk_found_${k}`]),
      ...Object.keys(QUIRK_SPOTS).map((k) => `qk_where_${k}`), ...QUIRK_TREATS.map((k) => `qk_${k}`),
      ...Array.from({ length: QUIRK_FEARS }, (_, i) => `qk_fear${i}`)];
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of keys) for (const g of ['m', 'f']) expect(t(k, { name: 'Étoile', g, what: 'x' }), `${lang} ${k}`).not.toBe(k);
    }
    setLang('fr');
    expect(t('qk_fear', { g: 'f', what: t('qk_fear1') })).toBe('😲 Elle a peur des sacs plastique');
    expect(t('qk_title', { g: 'f' })).toBe('🔍 Ce que tu sais d\'elle');
    expect(t('ride_spookAgain', { name: 'Étoile', g: 'f', what: t('qk_fear1') })).toBe('😲 Étoile a toujours peur des sacs plastique : parle-lui doucement.');
  });
});

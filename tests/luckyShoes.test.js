// 🍀 Le fer porte-bonheur du jour (src/sim/luckyShoes.js) : un fer par jour au bord du chemin de balade, 7 vrais fers
// à collectionner, cloués sur la porte du box du cheval qu'on montait.
import { describe, it, expect, beforeAll } from 'vitest';
import { LUCKY, SHOE_KINDS, SHOE_SHAPES, dayKey, shoeSpots, luckyState, shoeOfDay, findShoe } from '../src/sim/luckyShoes.js';
import { TRAIL } from '../src/sim/activities.js';
import { logSpots } from '../src/sim/freeJumps.js';
import { pumpkinSpots } from '../src/sim/halloween.js';
import { LOGBOOK } from '../src/sim/galops.js';
import { MEMORIES } from '../src/sim/memories.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

const fresh = () => ({ mode: 'manage', money: 0, stats: {} });
const day = (k) => new Date(2026, 9, 29 + k, 15, 0);

/** Distance d'un point au segment [a, b]. */
function toSegment(p, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(p.x - (a.x + dx * k), p.z - (a.z + dz * k));
}

describe('le fer porte-bonheur du jour', () => {
  it('le jour : « AAAA-MM-JJ », date de l\'appareil', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 10, 30, 0, 1))).toBe('2026-11-30');
    expect(dayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('7 sortes de fers, chacune avec sa forme', () => {
    expect(SHOE_KINDS).toHaveLength(7);
    for (const k of SHOE_KINDS) expect(SHOE_SHAPES[k], k).toBeTruthy();
    expect(SHOE_SHAPES.pony.s).toBeLessThan(SHOE_SHAPES.front.s);
    expect(SHOE_SHAPES.draft.s).toBeGreaterThan(SHOE_SHAPES.front.s);
    expect(SHOE_SHAPES.eggbar.closed).toBe(true);
  });

  it('au bord du chemin, loin des troncs et des citrouilles', () => {
    const spots = shoeSpots();
    expect(spots.length).toBeGreaterThan(8);
    const away = [...logSpots(), ...pumpkinSpots()];
    const pts = [TRAIL.start, ...TRAIL.checkpoints];
    for (const s of spots) {
      for (const o of away) expect(Math.hypot(o.x - s.x, o.z - s.z)).toBeGreaterThan(LUCKY.clear);
      const d = Math.min(...pts.slice(1).map((b, i) => toSegment(s, pts[i], b)));
      expect(d).toBeLessThan(3);
      expect(d).toBeLessThan(LUCKY.reach); // (on le ramasse en passant sur le chemin)
      expect(Math.hypot(s.x - s.cx, s.z - s.cz)).toBeCloseTo(LUCKY.side, 5);
    }
  });

  it('le même jour : le même fer, à la même place ; ramassé, plus rien jusqu\'au lendemain', () => {
    const p = fresh();
    const a = shoeOfDay(p, day(0));
    expect(a).toEqual(shoeOfDay(fresh(), day(0)));
    expect(a.key).toBe('2026-10-29');
    expect(SHOE_KINDS).toContain(a.kind);
    expect(shoeSpots()).toContainEqual(a.spot);
    const r = findShoe(p, day(0), 'h1');
    expect(r).toMatchObject({ kind: a.kind, isNew: true, n: 1, total: 7, complete: false, coins: 0 });
    expect(shoeOfDay(p, day(0))).toBeNull();
    expect(findShoe(p, day(0), 'h1')).toBeNull();
    expect(shoeOfDay(p, day(1))).not.toBeNull();
  });

  it('7 jours, 7 fers différents ; le 7e : 50 🪙 ; ensuite, 5 🪙 par fer', () => {
    const p = fresh();
    const got = [];
    for (let k = 0; k < 7; k++) {
      const r = findShoe(p, day(k), k < 4 ? 'h1' : 'h2');
      got.push(r.kind);
      expect(r.n).toBe(k + 1);
      expect(r.isNew).toBe(true);
      expect(r.complete).toBe(k === 6);
      expect(r.coins).toBe(k === 6 ? LUCKY.coins : 0);
    }
    expect(new Set(got).size).toBe(7);
    const r8 = findShoe(p, day(7), 'h2');
    expect(r8).toMatchObject({ isNew: false, complete: false, n: 7, coins: LUCKY.daily });
    // (sur la porte du box du cheval qu'on montait)
    expect(p.luckyShoes.byHorse.h1).toEqual(got.slice(0, 4));
    expect(p.luckyShoes.byHorse.h2).toEqual(expect.arrayContaining(got.slice(4)));
    expect(p.luckyShoes.byHorse.h2).toContain(r8.kind);
    expect(p.luckyShoes.kinds).toHaveLength(7);
  });

  it('une vieille sauvegarde abîmée est remise d\'aplomb', () => {
    const p = { luckyShoes: { last: 3, kinds: ['front', 'front', 'nope'], byHorse: null } };
    expect(luckyState(p)).toEqual({ last: null, kinds: ['front'], byHorse: {} });
    expect(luckyState({})).toEqual({ last: null, kinds: [], byHorse: {} });
  });

  it('le jeu : ramassé à cheval, le 7e donne pièces, lien et souvenir ; cloué sur la porte de son box', async () => {
    const THREE = await import('three');
    const { LuckyShoes } = await import('../src/game/LuckyShoes.js');
    const { memoriesOf } = await import('../src/sim/memories.js');
    const p = { ...fresh(), id: 'p1', place: 'maison', home: 'maison', animals: [] };
    const a = { id: 'h1', name: 'Étoile', sex: 'f', species: 'horse', bond: 10, box: 1, location: 'maison' };
    p.animals.push(a);
    p.luckyShoes = { last: null, kinds: SHOE_KINDS.slice(0, 6), byHorse: {} };
    const toasts = [];
    const emits = [];
    const plates = [0, 1].map((i) => ({ i, plate: new THREE.Object3D() }));
    const g = {
      profile: p, isHome: true, day: 9, saved: 0,
      player: { mount: { data: a, emit: (e) => emits.push(e) } },
      ui: { toast: (m) => toasts.push(m) },
      world: { interiors: { stable: { model: { boxes: plates } } } },
      interiors: { f: { boxes: [{}, {}] }, homeHorses: () => p.animals },
      bondNews: () => {}, remember: (h, id) => { (h.memories ??= []).push({ id, day: 9 }); },
      save() { this.saved++; },
    };
    g.interiors.f = (await import('../src/sim/facilities.js')).ensureFacilities(p);
    const ls = new LuckyShoes(g);
    ls.item = { kind: 'alu', model: new THREE.Group(), found: false, pop: 0 };
    ls.collect();
    expect(p.luckyShoes.kinds).toHaveLength(7);
    expect(p.money).toBe(LUCKY.coins);
    expect(a.bond).toBe(10 + LUCKY.bond);
    expect(memoriesOf(a).map((m) => m.id)).toContain('luckyShoes');
    expect(p.stats.luckyShoes).toBe(1);
    expect(emits).toEqual(['🍀', '🎉']);
    expect(toasts[0]).toMatch(/^🍀 Un fer porte-bonheur ! .* 7\/7$/);
    expect(toasts[1]).toBe(`${i18n.t('ls_complete')} +${LUCKY.coins} 🪙`);
    expect(ls.item.found).toBe(true);
    expect(g.saved).toBe(1);
    // (sur la porte de son box à lui seulement)
    expect(plates[1].plate.userData.shoeGroup.children).toHaveLength(1);
    expect(plates[0].plate.userData.shoeGroup ?? null).toBeNull();
    // Bac à sable : rien à gagner ni à afficher ; un fer déjà connu : « Le fer du jour ! »
    const s = { mode: 'sandbox', money: 0, stats: {}, luckyShoes: { last: null, kinds: [...SHOE_KINDS], byHorse: {} } };
    g.profile = s;
    toasts.length = 0;
    ls.item = { kind: 'alu', model: new THREE.Group(), found: false, pop: 0 };
    ls.collect();
    expect(s.money).toBe(0);
    expect(toasts[0]).toMatch(/^🍀 Le fer du jour ! [^🪙]+$/);
  });

  it('le jeu : sur le cheval d\'un client, le fer reste par terre pour le tien', async () => {
    const THREE = await import('three');
    const { LuckyShoes } = await import('../src/game/LuckyShoes.js');
    const p = { ...fresh(), id: 'p1', place: 'maison', home: 'maison', animals: [] };
    const mine = { id: 'h1', species: 'horse', bond: 10 };
    const client = { id: 'c1', species: 'horse', bond: 10, client: { id: 'x' } };
    p.animals.push(mine, client);
    p.luckyShoes = { last: null, kinds: SHOE_KINDS.slice(0, 6), byHorse: {} };
    const toasts = [];
    const g = {
      profile: p, isHome: true, day: 9,
      player: { mount: { data: client, emit: () => {} }, root: new THREE.Object3D() },
      ui: { toast: (m) => toasts.push(m) },
      activities: { active: false }, world: {}, interiors: {},
      bondNews: () => {}, remember: () => {}, save: () => {},
    };
    const ls = new LuckyShoes(g);
    Object.assign(ls, { prof: p, where: p.place, acc: 0 }); // (pas de sync : le fer est posé à la main)
    ls.item = { kind: 'alu', model: new THREE.Group(), glint: new THREE.Object3D(), found: false, pop: 0 };
    ls.update(0.1);
    expect(ls.item.found).toBe(false);
    expect(p.luckyShoes.kinds).toHaveLength(6);
    expect(p.luckyShoes.byHorse).toEqual({});
    expect(toasts).toEqual([i18n.t('ls_onFoot')]);
    // (sur le tien : ramassé, les 7)
    g.player.mount.data = mine;
    ls.update(0.1);
    expect(ls.item.found).toBe(true);
    expect(p.luckyShoes.byHorse).toEqual({ h1: ['alu'] });
    expect(mine.bond).toBe(10 + LUCKY.bond);
    expect(client.bond).toBe(10);
  });

  it('dans le carnet, les souvenirs, et chaque texte en français et en anglais', () => {
    expect(LOGBOOK.some((x) => x.id === 'luckyShoes')).toBe(true);
    expect(MEMORIES.some((x) => x.id === 'luckyShoes')).toBe(true);
    const { t, setLang } = i18n;
    const keys = ['ls_today', 'ls_found', 'ls_again', 'ls_complete', 'ls_onFoot', 'lb_luckyShoes', 'mem_luckyShoes', ...SHOE_KINDS.map((k) => `ls_kind_${k}`)];
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of keys) expect(t(k, { what: 'X', n: 3, total: 7 }), `${lang} ${k}`).not.toBe(k);
    }
    setLang('fr');
    expect(t('ls_found', { what: t('ls_kind_hind'), n: 3, total: 7 })).toBe('🍀 Un fer porte-bonheur ! Fer de derrière : plus pointu. 3/7');
  });
});

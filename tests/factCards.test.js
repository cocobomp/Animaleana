// 🃏 Mes cartes « Le savais-tu ? » (src/sim/horseFacts.js) : chaque soin cache ses cartes, une carte lue se garde
// une seule fois, des pièces à la 9e et à la 18e, « toutes les cartes » à la 27e.
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  HORSE_FACTS, FACT_CARDS, FACT_WHERE, CARD_COINS, drawFact, collectFact, albumView, factIcon,
} from '../src/sim/horseFacts.js';
import { SPECIES } from '../src/sim/species.js';
import { LOGBOOK, logbook } from '../src/sim/galops.js';

let t;
let setLang;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t, setLang } = await import('../src/i18n.js'));
});

const fresh = () => ({ mode: 'manage', money: 0, stats: {} });
const all = () => Array.from({ length: HORSE_FACTS }, (_, i) => i + 1);

describe('les cartes « Le savais-tu ? »', () => {
  it('une carte par fait, de 1 à HORSE_FACTS, chacune une fois', () => {
    expect(FACT_CARDS.map((c) => c.id)).toEqual(all());
    for (const c of FACT_CARDS) expect(factIcon(c.id)).toBe(c.icon);
  });

  it('chaque carte se cache dans un vrai mini-jeu du cheval, qui a son icône', () => {
    const actions = new Set([...SPECIES.horse.actions, 'saddle', 'deworm']);
    for (const c of FACT_CARDS) {
      for (const a of c.from) {
        expect(actions.has(a), `${c.id} ${a}`).toBe(true);
        expect(FACT_WHERE[a], `${c.id} ${a}`).toBeTruthy();
      }
    }
    expect(FACT_WHERE.any).toBe('⭐');
  });

  it('d\'abord une carte de ce soin, puis une carte de tous les soins', () => {
    const p = fresh();
    expect(drawFact(p, 'water')).toBe(1);
    collectFact(p, 1);
    expect(drawFact(p, 'water')).toBe(17); // (la première carte « de tous les soins »)
    expect(drawFact(p, 'deworm')).toBe(12);
    collectFact(p, 12);
    expect(drawFact(p, 'deworm')).toBe(25);
    collectFact(p, 25);
    expect(drawFact(p, 'deworm')).toBe(17);
    expect(drawFact(p, 'braid')).toBe(17); // (un mini-jeu de beauté : les cartes de tous les soins)
  });

  it('tout trouvé : les faits défilent encore', () => {
    const p = fresh();
    p.factCards = all();
    const seen = new Set();
    for (let i = 0; i < HORSE_FACTS * 2; i++) {
      const id = drawFact(p, ['water', 'pet', 'deworm'][i % 3]);
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(HORSE_FACTS);
      seen.add(id);
    }
    expect(seen.size).toBe(HORSE_FACTS);
  });

  it('au hasard : toujours une carte de 1 à 27', () => {
    const acts = [...SPECIES.horse.actions, 'saddle', 'deworm', 'braid', undefined, 'nimporte'];
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 500; k++) {
      const p = fresh();
      p.factCards = all().filter(() => rnd() < 0.6);
      const id = drawFact(p, acts[Math.floor(rnd() * acts.length)]);
      expect(Number.isInteger(id)).toBe(true);
      expect(id).toBeGreaterThanOrEqual(1);
      expect(id).toBeLessThanOrEqual(HORSE_FACTS);
    }
  });

  it('une carte se garde une seule fois ; un numéro inconnu ne compte pas', () => {
    const p = fresh();
    expect(collectFact(p, 9)).toEqual({ isNew: true, n: 1, total: HORSE_FACTS, coins: 0, all: false });
    expect(collectFact(p, 9)).toEqual({ isNew: false, n: 1, total: HORSE_FACTS, coins: 0, all: false });
    for (const bad of [0, 28, -1, 2.5, '3', null, undefined]) expect(collectFact(p, bad).isNew).toBe(false);
    expect(p.factCards).toEqual([9]);
  });

  it('des pièces à la 9e et à la 18e, « toutes » à la 27e, une seule fois chacune', () => {
    const p = fresh();
    const coins = [];
    const done = [];
    for (const id of [...all()].reverse()) {
      const r = collectFact(p, id);
      if (r.coins) coins.push([r.n, r.coins]);
      if (r.all) done.push(r.n);
      expect(collectFact(p, id).coins).toBe(0); // (relue : rien de plus)
    }
    expect(coins).toEqual([[9, CARD_COINS[9]], [18, CARD_COINS[18]]]);
    expect(done).toEqual([HORSE_FACTS]);
    expect(p.factCards).toEqual([...all()].reverse()); // (dans l'ordre trouvé)
  });

  it('une ancienne partie sans cartes marche ; sans profil aussi', () => {
    const p = fresh();
    expect(albumView(p)).toMatchObject({ n: 0, total: HORSE_FACTS });
    expect(albumView(p).cards.every((c) => !c.found)).toBe(true);
    expect(drawFact(p, 'pet')).toBe(8);
    const id = drawFact(undefined, 'pet');
    expect(id).toBeGreaterThanOrEqual(1);
    expect(id).toBeLessThanOrEqual(HORSE_FACTS);
    collectFact(p, 8);
    const v = albumView(p);
    expect(v.n).toBe(1);
    expect(v.cards.filter((c) => c.found).map((c) => c.id)).toEqual([8]);
  });

  it('le jeu : comptée dans le carnet, des pièces en gestion seulement', async () => {
    const { Game } = await import('../src/game/Game.js');
    const p = fresh();
    p.factCards = all().slice(0, 8);
    const r = Game.prototype.collectFact.call({ profile: p }, 9);
    expect(r).toMatchObject({ isNew: true, n: 9, coins: 30 });
    expect(p.money).toBe(30);
    expect(p.stats.factCards).toBe(1);
    expect(logbook(p).find((x) => x.id === 'factCards')).toMatchObject({ icon: '🃏', n: 1 });
    expect(Game.prototype.collectFact.call({ profile: p }, 9).isNew).toBe(false);
    expect(p.stats.factCards).toBe(1);
    // (bac à sable : pièces illimitées, rien à gagner ni à afficher)
    const s = { mode: 'sandbox', money: 0, stats: {}, factCards: all().slice(0, 17) };
    const r2 = Game.prototype.collectFact.call({ profile: s }, 18);
    expect(r2).toMatchObject({ isNew: true, n: 18, coins: 0 });
    expect(s.money).toBe(0);
  }, 60000);

  it('les textes existent dans les deux langues', () => {
    expect(LOGBOOK.some((x) => x.id === 'factCards')).toBe(true);
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of ['card_new', 'card_all', 'card_album', 'card_title', 'card_help', 'lb_factCards']) expect(t(k), `${lang} ${k}`).not.toBe(k);
      expect(t('card_new', { n: 9, total: HORSE_FACTS })).toContain('9/27');
    }
    setLang('fr');
  });

  it('la carte de fin : gagnée en finissant seulement, et elle tient sur un petit téléphone', () => {
    const frame = readFileSync(new URL('../src/ui/minigames.js', import.meta.url), 'utf8');
    const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
    // (dans showEnd, pas à l'ouverture : fermé avec ✕, rien n'est gagné)
    const showEnd = frame.slice(frame.indexOf('function showEnd('), frame.indexOf('// ---------------------------------------------------------- entrées'));
    expect(showEnd).toMatch(/collectFact\?\.\(o\.factId\)/);
    expect(frame.match(/collectFact/g)).toHaveLength(1);
    // (compacte, puis sans la tête de l'animal s'il le faut ; la place se remesure après « tight »)
    expect(frame).toMatch(/endEl\.classList\.add\('tighter'\)/);
    expect(css).toMatch(/\.mg-end\.tighter \.mg-end-emoji \{ display: none; \}/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{ \.mg-card\.new \{ animation: none; \} \}/);
    // (le 💡 d'une carte déjà trouvée se fait plus petit en compact : plus fort que « .mg-end.tight .mg-end-card p »)
    expect(css).toMatch(/\.mg-end\.tight \.mg-end-card \.mg-fact \{/);
  });
});

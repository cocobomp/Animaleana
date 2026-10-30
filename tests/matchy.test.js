// 🎨 Tout assorti (src/sim/matchy.js) : le tapis et les jambes de la même couleur (niveau 1), ta bombe aussi
// (niveau 2) ; jamais les cuirs ni le tapis citrouille ; la pièce qui manque, ce qu'on a d'abord, sinon la moins chère.
import { describe, it, expect, beforeAll } from 'vitest';
import { matchyOf, missingFor, NEVER } from '../src/sim/matchy.js';
import { GEAR, COLORS } from '../src/sim/gear.js';
import { createProfile } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';

const horse = (gear = {}) => ({ ...createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'f', ageDays: 2000, rng: seeded('mx') }), gear });
const put = (item, color) => ({ item, color });

describe('tout assorti', () => {
  it('tapis et guêtres (ou cloches) de la même couleur : niveau 1 ; avec ta bombe : niveau 2', () => {
    expect(matchyOf(horse({ pad: put('saddlePad', 'pink'), legs: put('boots', 'pink') }), null)).toMatchObject({ level: 1, color: 'pink' });
    const a = horse({ pad: put('saddlePad', 'pink'), bells: put('bellBoots', 'pink') });
    expect(matchyOf(a, put('helmet', 'black')).level).toBe(1);
    const m = matchyOf(a, put('helmetSparkle', 'pink'));
    expect(m.level).toBe(2);
    expect(m.pieces.map((x) => [x.slot, x.ok])).toEqual([['pad', true], ['bells', true], ['helmet', true]]);
    expect(matchyOf(horse({ pad: put('saddlePad', 'black'), legs: put('boots', 'black') }), put('helmet', 'black')).level).toBe(2);
  });

  it('pas de la même couleur, pas de tapis, un cuir ou le tapis citrouille : niveau 0', () => {
    const m = matchyOf(horse({ pad: put('saddlePad', 'pink'), legs: put('boots', 'navy') }), put('helmetSparkle', 'pink'));
    expect(m.level).toBe(0);
    expect(m.pieces.map((x) => x.ok)).toEqual([true, false, true]);
    expect(matchyOf(horse({ legs: put('boots', 'pink') }), put('helmetSparkle', 'pink')).level).toBe(0);
    expect(matchyOf(horse({ pad: put('saddlePad', 'brown'), legs: put('boots', 'brown') }), put('helmet', 'brown')).level).toBe(0);
    expect(matchyOf(horse({ pad: put('padPumpkin', 'orange'), legs: put('boots', 'orange') }), null).level).toBe(0);
    expect(matchyOf(horse(), null)).toMatchObject({ level: 0, color: null });
  });

  it('il manque un tapis : un tapis de la couleur de ses jambes, sinon rose', () => {
    const p = createProfile('Lou');
    expect(missingFor(p, horse(), null)).toEqual({ item: 'saddlePad', color: 'pink', owned: false });
    expect(missingFor(p, horse({ legs: put('boots', 'navy') }), null)).toMatchObject({ item: 'saddlePad', color: 'navy' });
    expect(missingFor(p, horse({ pad: put('padPumpkin', 'orange') }), null)).toMatchObject({ item: 'saddlePad', color: 'pink' });
    p.items.saddlePad = 1;
    expect(missingFor(p, horse(), null).owned).toBe(true);
  });

  it('un tapis rose, rien aux jambes : les cloches roses (moins chères), ou les guêtres si on en a de libres', () => {
    const p = createProfile('Lou');
    const a = horse({ pad: put('saddlePad', 'pink') });
    expect(missingFor(p, a, null)).toEqual({ item: 'bellBoots', color: 'pink', owned: false });
    p.items.boots = 1;
    expect(missingFor(p, a, null)).toEqual({ item: 'boots', color: 'pink', owned: true });
    // (des guêtres bleues sur lui, aucune de libre : on change seulement leur couleur)
    const b = horse({ pad: put('saddlePad', 'pink'), legs: put('boots', 'navy') });
    const q = createProfile('Lou');
    q.items.boots = 1;
    q.animals = [b];
    expect(missingFor(q, b, null)).toEqual({ item: 'boots', color: 'pink', owned: true });
  });

  it('niveau 1 : la bombe de la couleur ; rien dans cette couleur (pas de guêtres vertes) : null', () => {
    const p = createProfile('Lou');
    const a = horse({ pad: put('saddlePad', 'pink'), bells: put('bellBoots', 'pink') });
    expect(missingFor(p, a, put('helmet', 'black'))).toEqual({ item: 'helmetSparkle', color: 'pink', owned: false });
    const n = horse({ pad: put('saddlePad', 'navy'), legs: put('boots', 'navy') });
    expect(missingFor(p, n, put('helmet', 'black'))).toEqual({ item: 'helmet', color: 'navy', owned: true });
    expect(missingFor(p, horse({ pad: put('saddlePad', 'green') }), null)).toBeNull();
    expect(missingFor(p, horse({ pad: put('saddlePad', 'red'), legs: put('boots', 'red') }), null)).toBeNull(); // (pas de bombe rouge)
    expect(missingFor(p, n, put('helmet', 'navy'))).toBeNull();
  });

  it('les ensembles possibles : blanc, bleu marine, noir, rose, bleu ciel et violet jusqu\'à la bombe ; rouge sans la bombe', () => {
    const top = (c) => {
      const pad = GEAR.saddlePad.colors.includes(c);
      const legs = GEAR.boots.colors.includes(c) || GEAR.bellBoots.colors.includes(c);
      const head = GEAR.helmet.colors.includes(c) || GEAR.helmetSparkle.colors.includes(c);
      return pad && legs ? (head ? 2 : 1) : 0;
    };
    const sets = Object.keys(COLORS).filter((c) => !NEVER.includes(c) && top(c) > 0);
    expect(sets.filter((c) => top(c) === 2).sort()).toEqual(['black', 'navy', 'pink', 'purple', 'sky', 'white']);
    expect(sets.filter((c) => top(c) === 1)).toEqual(['red']);
  });

  it('ne nomme jamais un objet qui n\'existe pas dans cette couleur', () => {
    const p = createProfile('Lou');
    const pads = GEAR.saddlePad.colors;
    for (const c of pads) {
      for (const legs of [null, put('boots', c), put('bellBoots', c)]) {
        for (const head of [null, put('helmet', 'black'), put('helmetSparkle', c)]) {
          const a = horse({ pad: put('saddlePad', c), ...(legs ? { [GEAR[legs.item].slot]: legs } : {}) });
          const miss = missingFor(p, a, head);
          if (miss) expect(GEAR[miss.item].colors, `${c} ${miss.item}`).toContain(miss.color);
        }
      }
    }
  });
});

describe('ta bombe complète l\'ensemble (src/game/Game.js equipHelmet)', () => {
  let Game;
  let t;
  beforeAll(async () => {
    ({ Game } = await import('../src/game/Game.js'));
    ({ t } = await import('../src/i18n.js'));
  }, 60000);

  const fakeGame = (p) => {
    const toasts = [];
    const emits = [];
    const g = {
      profile: p, toasts, emits, player: { mount: null }, lastHorseId: null,
      entities: new Map(p.animals.map((a) => [a.id, { emit: (e) => emits.push([a.name, e]) }])),
      ui: { toast: (m) => toasts.push(m) }, remember() {},
    };
    for (const k of ['animalsHere', 'mainHorse', 'matchyNews']) g[k] = Game.prototype[k].bind(g);
    return g;
  };

  it('depuis la fiche de la bombe (sans cheval) : fêté sur Étoile, même si on vient de soigner le poulain', () => {
    const p = createProfile('Lou');
    p.items.helmetSparkle = 1;
    const etoile = { ...horse({ pad: put('saddlePad', 'pink'), bells: put('bellBoots', 'pink') }), id: 'e', name: 'Étoile', location: p.place };
    const caramel = { ...horse(), id: 'c', name: 'Caramel', ageDays: 100, location: p.place };
    const loin = { ...horse({ pad: put('saddlePad', 'pink'), legs: put('boots', 'pink') }), id: 'l', name: 'Loin', location: 'bretagne' };
    p.animals.push(etoile, caramel, loin);
    const g = fakeGame(p);
    g.lastHorseId = 'c'; // (le dernier soigné : avant, seul lui était regardé)
    expect(g.mainHorse()).toBe(caramel);
    Game.prototype.equipHelmet.call(g, 'helmetSparkle', 'pink');
    expect(g.toasts).toEqual([t('tk_helmetOn', { item: t('gear_helmetSparkle') }), t('mx_lvl2', { color: t('col_pink') })]);
    expect(g.emits).toEqual([['Étoile', '✨']]); // (pas Caramel, ni le cheval resté en Bretagne)
  });

  it('deux ensembles complets d\'un coup : des ✨ sur chacun, le petit mot une seule fois', () => {
    const p = createProfile('Lou');
    p.items.helmetSparkle = 1;
    const a = { ...horse({ pad: put('saddlePad', 'pink'), bells: put('bellBoots', 'pink') }), id: 'a', name: 'Étoile', location: p.place };
    const b = { ...horse({ pad: put('saddlePad', 'pink'), legs: put('boots', 'pink') }), id: 'b', name: 'Éclair', location: p.place };
    p.animals.push(a, b);
    const g = fakeGame(p);
    Game.prototype.equipHelmet.call(g, 'helmetSparkle', 'pink', b);
    expect(g.toasts.filter((m) => m === t('mx_lvl2', { color: t('col_pink') }))).toHaveLength(1);
    expect(g.emits.map(([n]) => n).sort()).toEqual(['Éclair', 'Étoile']);
    // (déjà tout assorti : rien de plus)
    Game.prototype.equipHelmet.call(g, 'helmetSparkle', 'pink');
    expect(g.emits).toHaveLength(2);
  });
});

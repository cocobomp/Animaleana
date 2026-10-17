// Chevaux réalistes et races (vague 3) : données des races, gabarits, robes, animalerie, proportions.
import { describe, it, expect } from 'vitest';
import { SPECIES, PERSONALITIES } from '../src/sim/species.js';
import { PLACE_IDS } from '../src/sim/places.js';
import { HORSE_TYPES, horseBuild, horseBreedOf, horseCoatTraits, horseFaceMark, horseSocks } from '../src/sim/horseLook.js';
import { shopBreeds, shopPrice, adoptionCandidates } from '../src/sim/adoption.js';
import { createAnimal, resolveLook } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';
import { horseMeasures } from '../src/game/models/horseModel.js';

const breeds = SPECIES.horse.breeds;
const breed = (id) => breeds.find((b) => b.id === id);

describe('races de chevaux', () => {
  it('contient les races demandées (Franches-Montagnes en tête)', () => {
    const wanted = ['franches_montagnes', 'camargue', 'lusitanien', 'pre', 'merens', 'haflinger', 'fjord', 'connemara', 'welsh',
      'percheron', 'comtois', 'boulonnais', 'trotteur_francais', 'pur_sang', 'quarter', 'paint', 'mustang', 'akhal_teke',
      'knabstrupper', 'irish_cob', 'falabella'];
    for (const id of wanted) expect(breed(id), id).toBeTruthy();
    expect(new Set(breeds.map((b) => b.id)).size).toBe(breeds.length);
  });

  it('chaque race est complète : noms FR/EN, robes, gabarit, caractère, pays, lieu d\'élevage', () => {
    for (const b of breeds) {
      expect(b.name.fr && b.name.en, b.id).toBeTruthy();
      expect(b.colors.length, b.id).toBeGreaterThan(0);
      for (const c of b.colors) expect(c.name.fr && c.name.en && Number.isInteger(c.coat), `${b.id} ${c.name.fr}`).toBeTruthy();
      expect(HORSE_TYPES[b.type], b.id).toBeTruthy();
      expect(b.temper?.length, b.id).toBeGreaterThan(0);
      for (const p of b.temper) expect(PERSONALITIES).toContain(p);
      expect(b.from?.fr && b.from?.en && b.from?.flag, b.id).toBeTruthy();
      expect(b.origin === null || PLACE_IDS.includes(b.origin), b.id).toBe(true);
      expect(b.scale).toBeGreaterThan(0.4);
      expect(b.scale).toBeLessThan(1.15);
    }
  });

  it('les tailles sont cohérentes : Falabella < Shetland < Fjord < Selle Français < Percheron', () => {
    expect(breed('falabella').scale).toBeLessThan(breed('shetland').scale);
    expect(breed('shetland').scale).toBeLessThan(breed('fjord').scale);
    expect(breed('fjord').scale).toBeLessThan(breed('selle_francais').scale);
    expect(breed('selle_francais').scale).toBeLessThan(breed('percheron').scale);
  });

  it('les gabarits rendent les différences : trait épais, Akhal-Teké fin, fanons, brosse du Fjord, reflet doré', () => {
    const b = (id) => horseBuild(breed(id));
    expect(b('percheron').girth).toBeGreaterThan(b('selle_francais').girth);
    expect(b('selle_francais').girth).toBeGreaterThan(b('akhal_teke').girth);
    expect(b('comtois').bone).toBeGreaterThan(b('pur_sang').bone);
    expect(b('irish_cob').feathers).toBeGreaterThan(0.5);
    expect(b('frison').feathers).toBeGreaterThan(0.5);
    expect(b('selle_francais').feathers).toBe(0);
    expect(b('fjord').maneStyle).toBe('brush');
    expect(b('akhal_teke').sheen).toBeGreaterThan(0);
    expect(b('arabe').profile).toBe('dish');
    expect(b('lusitanien').profile).toBe('convex');
    expect(b('arabe').tailSet).toBeGreaterThan(b('percheron').tailSet);
  });
});

describe('robes', () => {
  it('reconnaît bai, isabelle (raie de mulet), gris, léopard, couverture, pie', () => {
    const look = (id, i = 0) => resolveLook('horse', id, i);
    expect(horseCoatTraits(look('selle_francais', 0)).points).toBe(1); // bai : crins et bas des membres noirs
    expect(horseCoatTraits(look('selle_francais', 1)).points).toBe(0); // alezan
    const fjord = horseCoatTraits(look('fjord'));
    expect(fjord.dun).toBe(1);
    expect(look('fjord').maneCore).toBeTruthy(); // crinière bicolore
    expect(horseCoatTraits(look('percheron', 0)).grey).toBeGreaterThan(0);
    expect(horseCoatTraits(look('knabstrupper')).leopard).toBe(1);
    expect(horseCoatTraits(look('appaloosa', 1)).blanket).toBe(1);
    expect(horseCoatTraits(look('paint')).pinto).toBe(1);
    expect(horseCoatTraits(look('lusitanien', 2)).dun).toBe(0); // isabelle (buckskin) sans raie de mulet
  });

  it('les anciennes sauvegardes (sans détails de robe) restent lisibles', () => {
    const old = { coat: 0x7a4528, secondary: 0xf4efe6, mane: 0x1b1410, pattern: 'socks', colorName: { fr: 'Bai', en: 'Bay' }, seed: 12 };
    expect(horseCoatTraits(old).points).toBe(1);
    expect(horseBreedOf(old)?.id).toBe('selle_francais');
    const dun = { coat: 0xc9a66b, secondary: 0xc9a66b, mane: 0x3a2b1e, pattern: 'solid', colorName: { fr: 'Isabelle', en: 'Dun' } };
    expect(horseCoatTraits(dun).dun).toBe(1);
  });

  it('balzanes et marques en tête dépendent de la graine (stables)', () => {
    const look = { pattern: 'socks', seed: 23 };
    expect(horseSocks(look)).toEqual(horseSocks({ ...look }));
    expect(horseSocks(look).filter((x) => x > 0).length).toBe(23 % 5);
    expect(horseSocks({ pattern: 'solid', seed: 23 })).toEqual([0, 0, 0, 0]);
    expect(horseFaceMark({ pattern: 'socks', seed: 0 })).toBeGreaterThan(0);
    expect(horseFaceMark({}, breed('franches_montagnes'))).toBe(2); // petite liste
  });
});

describe('animalerie et élevages', () => {
  it('le Franches-Montagnes et les races courantes se trouvent à la maison', () => {
    const home = shopBreeds('maison', true).filter((p) => p.species === 'horse').map((p) => p.breed.id);
    for (const id of ['franches_montagnes', 'camargue', 'fjord', 'percheron', 'haflinger', 'connemara']) expect(home).toContain(id);
    const alps = shopBreeds('alpes', false).map((p) => p.breed.id);
    expect(alps).toContain('franches_montagnes');
    expect(shopBreeds('pampa', false).map((p) => p.breed.id)).toContain('falabella');
  });

  it('une race recherchée coûte plus cher', () => {
    expect(shopPrice('horse', 'akhal_teke')).toBeGreaterThan(shopPrice('horse', 'franches_montagnes'));
    expect(shopPrice('horse', 'arabe')).toBeGreaterThan(shopPrice('horse', 'shetland'));
  });

  it('un nouvel animal garde sa race dans sa robe et a souvent le caractère de la race', () => {
    const rng = seeded('temper');
    let typical = 0;
    for (let i = 0; i < 200; i++) {
      const a = createAnimal({ species: 'horse', breed: 'franches_montagnes', rng });
      expect(a.look.breed).toBe('franches_montagnes');
      if (breed('franches_montagnes').temper.includes(a.personality)) typical++;
    }
    expect(typical).toBeGreaterThan(110);
    expect(typical).toBeLessThan(200);
  });

  it('les élevages en voyage proposent toujours les races locales', () => {
    const list = adoptionCandidates('andalousie', 3);
    expect(list.every((a) => ['pre', 'lusitanien', 'retinta'].includes(a.breed) || SPECIES[a.species].breeds.find((b) => b.id === a.breed)?.origin === 'andalousie')).toBe(true);
  });
});

describe('proportions du cheval sculpté', () => {
  it('cheval de selle : tête ≈ 1/2,5 du corps, garrot ≈ croupe, membres plus longs que la poitrine est profonde', () => {
    const m = horseMeasures(horseBuild(breed('selle_francais')));
    expect(m.head / m.length).toBeGreaterThan(0.33);
    expect(m.head / m.length).toBeLessThan(0.48);
    expect(Math.abs(m.withers - m.croup)).toBeLessThan(0.07);
    expect(m.withers).toBeGreaterThan(m.back); // garrot marqué, dos légèrement creusé
    expect(m.belly).toBeGreaterThan(0.8 * m.chestDepth);
    expect(m.length / m.withers).toBeGreaterThan(0.9);
    expect(m.length / m.withers).toBeLessThan(1.15);
  });

  it('un trait est plus large et plus profond qu\'un Akhal-Teké', () => {
    const draft = horseMeasures(horseBuild(breed('percheron')));
    const teke = horseMeasures(horseBuild(breed('akhal_teke')));
    expect(draft.width).toBeGreaterThan(teke.width * 1.25);
    expect(draft.chestDepth).toBeGreaterThan(teke.chestDepth);
  });
});

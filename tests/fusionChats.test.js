// Fusion des chats avec les véhicules, la sellerie par taille, les chevaux et le véto :
// chaque fonctionnalité des deux côtés marche ensemble.
import { describe, it, expect } from 'vitest';
import { createProfile, migrate } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { getBreed } from '../src/sim/species.js';
import { seeded, mulberry32 } from '../src/sim/rng.js';
import { DAYS_PER_YEAR } from '../src/sim/time.js';
import { equip, owned, ensureTack } from '../src/sim/gear.js';
import { createCargo, pack, arriveWithCargo, isAway } from '../src/sim/cargo.js';
import { placeFor } from '../src/sim/trip.js';
import { defaultVetSchool } from '../src/sim/vetSchool.js';

// Un chat enregistré avant les races détaillées (look sans « hair », œil par défaut d'avant).
const oldCat = () => ({
  ...createAnimal({ species: 'cat', breed: 'persan', ageDays: 3 * DAYS_PER_YEAR, rng: mulberry32(7) }),
  look: {
    bodyLen: 0.42, bodyR: 0.095, legLen: 0.2, legR: 0.024, neckLen: 0.07, neckAngle: 0.6, headLen: 0.12, headR: 0.072,
    earType: 'cat', tailType: 'cat', scale: 1, fluff: 1.35, legs: 0.85, snout: 0.15, pattern: 'solid',
    coat: 0xf5f3ee, secondary: 0xf5f3ee, third: 0xf5f3ee, mane: 0xf5f3ee, eye: 0xd98b2a,
    colorName: { fr: 'Blanc', en: 'White' }, seed: 12,
  },
});

describe('fusion : chats, coffre de transport, chevaux, véto', () => {
  it('une ancienne sauvegarde en voyage avec un chat : chat mis à jour, coffre gardé, école véto ajoutée', () => {
    const p = createProfile('Ancien', 'manage');
    const cat = oldCat();
    cat.location = 'bretagne';
    cat.gear = { neck: { item: 'collar', color: 'red' } };
    p.animals.push(cat);
    p.place = 'bretagne';
    p.luggage = { place: 'bretagne', items: { collar: 1 }, tools: [], supplies: {} };
    delete p.vetSchool;
    delete p.tackVersion;
    const m = migrate(JSON.parse(JSON.stringify(p)));
    ensureTack(m);
    // Chat : poil long et petites oreilles du Persan, proportions actuelles ; robe et yeux gardés.
    expect(m.animals[0].look.hair).toBe('long');
    expect(m.animals[0].look.earType).toBe('cat_small');
    expect(m.animals[0].look.bodyLen).toBe(0.38);
    expect(m.animals[0].look.coat).toBe(0xf5f3ee);
    expect(m.animals[0].look.eye).toBe(0xd98b2a);
    // Coffre et école vétérinaire.
    expect(isAway(m)).toBe(true);
    expect(m.luggage.items.collar).toBe(1);
    expect(m.vetSchool).toEqual(defaultVetSchool());
    // Le collier du coffre est porté par le chat.
    expect(owned(m, 'collar')).toBe(1);
  });

  it('en voyage, le chat ne peut porter que le collier emporté dans le coffre', () => {
    const p = createProfile('Lea', 'manage');
    const cat = createAnimal({ species: 'cat', breed: 'ragdoll', ageDays: 2 * DAYS_PER_YEAR, rng: seeded('ragdoll') });
    cat.location = p.place;
    p.animals.push(cat);
    // Le chat voyage en caisse, même avec la remorque.
    expect(placeFor('trailer', cat)).toBe('crate');
    expect(placeFor('car', cat)).toBe('crate');
    const c = createCargo();
    pack(p, c, 'hay', 14);
    arriveWithCargo(p, c, [cat], 'bretagne');
    p.place = 'bretagne';
    cat.location = 'bretagne';
    expect(isAway(p)).toBe(true);
    const r = equip(p, cat, 'collar');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('leftAtHome');
  });

  it('chevaux et chats : un nouvel animal a souvent le tempérament de sa race', () => {
    const rng = seeded('fusion-temper');
    for (const [species, breed] of [['cat', 'ragdoll'], ['horse', 'franches_montagnes']]) {
      const temper = getBreed(species, breed).temper;
      let typical = 0;
      for (let i = 0; i < 300; i++) if (temper.includes(createAnimal({ species, breed, rng }).personality)) typical++;
      expect(typical / 300, `${species}/${breed}`).toBeGreaterThan(0.55);
      expect(typical).toBeLessThan(300);
    }
  });

  it('le chat garde son look de race et le cheval sa race dans sa robe', () => {
    const cat = createAnimal({ species: 'cat', breed: 'sphynx', rng: seeded('sphynx') });
    expect(cat.look.hair).toBe('hairless');
    const horse = createAnimal({ species: 'horse', breed: 'franches_montagnes', rng: seeded('fm') });
    expect(horse.look.breed).toBe('franches_montagnes');
    expect(horse.look.hair).toBeUndefined();
  });
});

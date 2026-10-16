import { describe, it, expect } from 'vitest';
import { SPECIES, PERSONALITIES, getBreed } from '../src/sim/species.js';
import {
  CAT_BREEDS, CAT_HAIR, CAT_HEADS, CAT_BUILDS, CAT_EYES, CAT_EARS, CAT_PATTERNS, CAT_WHITE, catTraits,
} from '../src/sim/catBreeds.js';
import { resolveLook, createAnimal } from '../src/sim/animal.js';
import { shopPrice, breedsFor } from '../src/sim/adoption.js';
import { pickIdlePose, CAT_IDLE_POSES } from '../src/sim/catPoses.js';
import { seeded } from '../src/sim/rng.js';

const isBlue = (c) => (c & 255) > ((c >> 16) & 255) + 40;

describe('races de chats', () => {
  it('les races demandées existent, avec un nom en français et en anglais', () => {
    const ids = SPECIES.cat.breeds.map((b) => b.id);
    for (const id of ['ragdoll', 'maine_coon', 'persan', 'siamois', 'sacre_birmanie', 'bengal', 'british', 'chartreux',
      'sphynx', 'norvegien', 'scottish_fold', 'abyssin', 'europeen', 'devon_rex']) {
      expect(ids).toContain(id);
    }
    expect(new Set(ids).size).toBe(ids.length);
    expect(SPECIES.cat.breeds).toBe(CAT_BREEDS);
  });

  it('chaque race décrit taille, poil, tête, yeux, oreilles, caractère, prix et robes valides', () => {
    for (const b of CAT_BREEDS) {
      expect(b.name.fr && b.name.en, b.id).toBeTruthy();
      expect(b.desc.fr.length && b.desc.en.length, b.id).toBeTruthy();
      expect(b.rarity).toBeGreaterThanOrEqual(1);
      expect(b.rarity).toBeLessThanOrEqual(3);
      expect(b.scale).toBeGreaterThanOrEqual(0.8);
      expect(b.scale).toBeLessThanOrEqual(1.4);
      expect(b.price).toBeGreaterThan(0);
      expect(CAT_HAIR).toContain(b.look.hair);
      expect(CAT_HEADS).toContain(b.look.head);
      expect(CAT_BUILDS).toContain(b.look.build);
      expect(CAT_EYES).toContain(b.look.eyes);
      expect(CAT_EARS).toContain(b.earType ?? 'cat');
      expect(b.temper.length).toBeGreaterThan(0);
      for (const p of b.temper) expect(PERSONALITIES).toContain(p);
      expect(b.colors.length).toBeGreaterThan(0);
      const names = new Set();
      for (const c of b.colors) {
        expect(c.name.fr && c.name.en, `${b.id} couleur`).toBeTruthy();
        names.add(c.name.fr);
        for (const v of [c.coat, c.secondary, c.eye]) {
          expect(Number.isInteger(v)).toBe(true);
          expect(v).toBeGreaterThanOrEqual(0);
          expect(v).toBeLessThanOrEqual(0xffffff);
        }
        expect(CAT_PATTERNS).toContain(c.pattern ?? b.pattern);
        if (c.white) expect(CAT_WHITE).toContain(c.white);
      }
      expect(names.size, `${b.id} : noms de robes en double`).toBe(b.colors.length);
    }
  });

  it('le Ragdoll : colourpoint seal, blue et chocolat, mitted ou bicolore, yeux bleus, grand et câlin', () => {
    const r = getBreed('cat', 'ragdoll');
    expect(r.origin).toBeNull(); // proposé à la maison
    expect(r.scale).toBeGreaterThan(1.1);
    expect(r.look.hair).toBe('semi');
    expect(r.temper).toContain('cuddly');
    const names = r.colors.map((c) => c.name.fr.toLowerCase()).join(' ');
    for (const w of ['seal', 'blue', 'chocolat']) expect(names).toContain(w);
    expect(r.colors.some((c) => c.white === 'mitted')).toBe(true);
    expect(r.colors.some((c) => c.white === 'bicolor')).toBe(true);
    for (const c of r.colors) {
      expect((c.pattern ?? r.pattern)).toBe('points');
      expect(isBlue(c.eye)).toBe(true);
    }
  });

  it('les traits de chaque race se voient', () => {
    expect(getBreed('cat', 'sphynx').look.hair).toBe('hairless');
    expect(getBreed('cat', 'scottish_fold').earType).toBe('cat_fold');
    expect(getBreed('cat', 'maine_coon').earType).toBe('cat_lynx');
    expect(getBreed('cat', 'maine_coon').look.hair).toBe('long');
    expect(getBreed('cat', 'maine_coon').scale).toBeGreaterThanOrEqual(1.3);
    expect(getBreed('cat', 'persan').look.head).toBe('flat');
    expect(getBreed('cat', 'siamois').look.eyes).toBe('almond');
    expect(getBreed('cat', 'siamois').pattern).toBe('points');
    expect(getBreed('cat', 'sacre_birmanie').colors.every((c) => c.white === 'gloves')).toBe(true);
    expect(getBreed('cat', 'bengal').pattern).toBe('rosettes');
    expect(getBreed('cat', 'abyssin').pattern).toBe('ticked');
    expect(getBreed('cat', 'devon_rex').look.hair).toBe('curly');
    expect(getBreed('cat', 'chartreux').colors[0].name.fr).toBe('Gris bleu');
    expect(getBreed('cat', 'british').colors[0].name.fr).toBe('Bleu');
    expect(getBreed('cat', 'europeen').colors.length).toBeGreaterThanOrEqual(5);
  });

  it('le Ragdoll et les races courantes sont à l\'animalerie de la maison', () => {
    const home = breedsFor('maison', true).filter((p) => p.species === 'cat').map((p) => p.breed.id);
    for (const id of ['ragdoll', 'europeen', 'siamois', 'persan', 'sphynx', 'bengal']) expect(home).toContain(id);
  });

  it('le look de l\'animal reprend le poil, la tête, les yeux et les taches blanches de la race', () => {
    const r = getBreed('cat', 'ragdoll');
    const look = resolveLook('cat', 'ragdoll', 0);
    expect(look.hair).toBe('semi');
    expect(look.head).toBe(r.look.head);
    expect(look.eyes).toBe('oval');
    expect(look.white).toBe('mitted');
    expect(look.pattern).toBe('points');
    const odd = resolveLook('cat', 'persan', getBreed('cat', 'persan').colors.findIndex((c) => c.eye2));
    expect(odd.eye2).toBeDefined();
    expect(odd.eye2).not.toBe(odd.eye);
    // Les autres espèces ne reçoivent pas ces champs.
    expect(resolveLook('dog', 'labrador', 0).hair).toBeUndefined();
  });

  it('le caractère de la race sort plus souvent (un seul tirage, les autres espèces ne changent pas)', () => {
    const rng = seeded('chats-caractere');
    let calm = 0;
    const N = 600;
    for (let i = 0; i < N; i++) {
      const a = createAnimal({ species: 'cat', breed: 'persan', rng });
      if (a.personality === 'calm' || a.personality === 'cuddly') calm++;
    }
    // Sans biais : 2 caractères sur 6 (≈ 33 %) ; avec : 6 sur 10 (≈ 60 %).
    expect(calm / N).toBeGreaterThan(0.5);
    const d1 = createAnimal({ species: 'dog', breed: 'labrador', rng: seeded('x') });
    const d2 = createAnimal({ species: 'dog', breed: 'labrador', rng: seeded('x') });
    expect(d1.personality).toBe(d2.personality);
  });

  it('chaque race a son prix ; le chaton coûte un peu plus cher', () => {
    expect(shopPrice('cat', 'europeen', 'young')).toBe(80);
    expect(shopPrice('cat', 'ragdoll', 'young')).toBe(180);
    expect(shopPrice('cat', 'ragdoll', 'baby')).toBeGreaterThan(shopPrice('cat', 'ragdoll', 'young'));
    expect(shopPrice('cat', 'sphynx', 'young')).toBeGreaterThan(shopPrice('cat', 'europeen', 'young'));
    // Les autres espèces gardent leur calcul (prix de l'espèce × rareté).
    expect(shopPrice('dog', 'labrador', 'young')).toBe(Math.round((150 * (0.7 + 0.45)) / 5) * 5);
  });
});

describe('traits des chats (anciens animaux compris)', () => {
  it('un ancien chat sans les nouveaux champs reçoit des traits déduits', () => {
    const t = catTraits({ fluff: 1.35, snout: 0.15, pattern: 'solid', earType: 'cat' });
    expect(t.hair).toBe('long');
    expect(t.head).toBe('flat');
    expect(t.earType).toBe('cat');
    expect(catTraits({ fluff: 1, snout: 0.35 }).hair).toBe('short');
    expect(catTraits({ fluff: 1.2 }).hair).toBe('semi');
    expect(catTraits({ pattern: 'spots' }).pattern).toBe('rosettes');
    expect(catTraits({ pattern: 'patches' }).pattern).toBe('tricolor');
  });

  it('la race connue complète ce qui manque (oreilles à pinceaux du Maine coon)', () => {
    const mc = getBreed('cat', 'maine_coon');
    const t = catTraits({ earType: 'cat', fluff: 1.3, pattern: 'tabby' }, mc);
    expect(t.earType).toBe('cat_lynx');
    expect(t.hair).toBe('long');
    expect(t.head).toBe('square');
  });

  it('un nouveau chat garde ses traits ; yeux vairons gérés', () => {
    const look = resolveLook('cat', 'bobtail', 1);
    const t = catTraits(look);
    expect(t.stubTail).toBe(true);
    expect(t.eye2).not.toBe(t.eye);
    expect(catTraits(resolveLook('cat', 'sphynx', 0)).hair).toBe('hairless');
  });
});

describe('poses de repos du chat', () => {
  it('renvoie toujours une pose connue et une durée raisonnable', () => {
    const rng = seeded('poses');
    for (let i = 0; i < 200; i++) {
      const { pose, duration } = pickIdlePose({ personality: 'playful', energy: i % 100 }, rng);
      expect(CAT_IDLE_POSES).toContain(pose);
      expect(duration).toBeGreaterThanOrEqual(3);
      expect(duration).toBeLessThanOrEqual(18);
    }
  });

  it('fatigué, il se couche plus souvent ; il répète rarement la même pose', () => {
    const count = (opts) => {
      const rng = seeded(`p-${JSON.stringify(opts)}`);
      const n = {};
      for (let i = 0; i < 1000; i++) {
        const p = pickIdlePose(opts, rng).pose;
        n[p] = (n[p] ?? 0) + 1;
      }
      return n;
    };
    expect(count({ energy: 10 }).loaf).toBeGreaterThan(count({ energy: 95 }).loaf * 1.8);
    expect(count({ energy: 80, prev: 'sit' }).sit).toBeLessThan(count({ energy: 80 }).sit);
  });
});

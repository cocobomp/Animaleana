import { describe, it, expect } from 'vitest';
import { createProfile } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import {
  GEAR, TACK_CATEGORIES, COLORS, SIZES, sizeOf, defaultSize, stockKey, parseKey, gearPrice, fitReason,
  ensureTack, owned, inUse, ownedStock, freeStock, stockOf, buyGear, equip, swapSize, wears, tackEffects,
  feltWeather, riderHelmet, equipHelmet, rideGear,
} from '../src/sim/gear.js';
import { jumpChance, horseJumpStats, trickWindow, trailResult, activitySkillGain } from '../src/sim/activities.js';
import { TACK_FR, TACK_EN } from '../src/ui/tackTexts.js';

const horse = (breed = 'selle_francais', extra = {}) => ({ ...createAnimal({ species: 'horse', breed, ageDays: 2000 }), ...extra });

describe('catalogue de la sellerie', () => {
  it('chaque objet a un type, un emplacement, un prix, des espèces et des couleurs connues', () => {
    for (const [id, d] of Object.entries(GEAR)) {
      expect(d.type, id).toBeTruthy();
      expect(d.slot, id).toBeTruthy();
      expect(d.price, id).toBeGreaterThan(0);
      expect(d.species.length, id).toBeGreaterThan(0);
      for (const c of d.colors ?? []) expect(COLORS[c], `${id}/${c}`).toBeTypeOf('number');
      for (const s of d.sizes ?? []) expect(SIZES).toContain(s);
    }
  });

  it('chaque rayon ne montre que des objets du catalogue, et tous les objets sont dans un rayon', () => {
    const listed = TACK_CATEGORIES.flatMap((c) => c.items);
    for (const id of listed) expect(GEAR[id], id).toBeTruthy();
    for (const id of Object.keys(GEAR)) expect(listed, id).toContain(id);
  });

  it('le catalogue propose les selles demandées (mixte, dressage, obstacle, randonnée, western, poney, course)', () => {
    const disciplines = TACK_CATEGORIES[0].items.map((id) => GEAR[id].discipline);
    expect(disciplines).toEqual(['mixed', 'dressage', 'jumping', 'trail', 'western', 'ponyclub', 'racing']);
    expect(Object.values(GEAR).filter((d) => d.type === 'bridle').length).toBe(4);
    expect(Object.values(GEAR).filter((d) => d.type === 'blanket').length).toBe(3);
  });

  it('chaque objet a un nom, une phrase pour enfant et un effet, en français et en anglais', () => {
    for (const id of Object.keys(GEAR)) {
      for (const dict of [TACK_FR, TACK_EN]) {
        expect(dict[`gear_${id}`], id).toBeTruthy();
        expect(dict[`tk_d_${id}`], id).toBeTruthy();
        expect(dict[`geard_${id}`], id).toBeTruthy();
        expect(dict[`tk_disc_${GEAR[id].discipline}`], id).toBeTruthy();
      }
    }
    for (const c of Object.keys(COLORS)) {
      expect(TACK_FR[`col_${c}`]).toBeTruthy();
      expect(TACK_EN[`col_${c}`]).toBeTruthy();
    }
    expect(Object.keys(TACK_EN).sort()).toEqual(Object.keys(TACK_FR).sort());
  });
});

describe('tailles poney / cheval / trait', () => {
  it('le gabarit vient de la race', () => {
    expect(sizeOf(horse('shetland'))).toBe('pony');
    expect(sizeOf(horse('selle_francais'))).toBe('horse');
    expect(sizeOf(horse('trait_breton'))).toBe('draft');
    expect(sizeOf(createAnimal({ species: 'dog', ageDays: 900 }))).toBe(null);
  });

  it('clés d\'inventaire et prix selon la taille', () => {
    expect(defaultSize('saddle')).toBe('horse');
    expect(defaultSize('saddlePony')).toBe('pony');
    expect(stockKey('saddle', 'horse')).toBe('saddle');
    expect(stockKey('saddle', 'pony')).toBe('saddle@pony');
    expect(parseKey('saddleJump@pony')).toEqual({ id: 'saddleJump', size: 'pony' });
    expect(parseKey('saddle')).toEqual({ id: 'saddle', size: 'horse' });
    expect(gearPrice('saddle', 'pony')).toBeLessThan(gearPrice('saddle', 'horse'));
    expect(gearPrice('saddle', 'draft')).toBeGreaterThan(gearPrice('saddle', 'horse'));
  });

  it('une selle poney ne va pas à un cheval ; une selle taille poney ne va pas à un cheval', () => {
    const p = createProfile('A', 'manage');
    p.money = 5000;
    const big = horse('selle_francais');
    const pony = horse('shetland');
    p.animals.push(big, pony);
    expect(fitReason('saddlePony', big)).toBe('noSize');
    expect(fitReason('saddlePony', pony)).toBe(null);
    expect(fitReason('saddleRace', pony)).toBe('noSize');
    expect(buyGear(p, 'saddleJump', 'pony').ok).toBe(true);
    expect(ownedStock(p, 'saddleJump', 'pony')).toBe(1);
    const r = equip(p, big, 'saddleJump');
    expect(r.reason).toBe('wrongSize');
    expect(r.have).toBe('pony');
    expect(equip(p, pony, 'saddleJump', 'havana').ok).toBe(true);
    expect(pony.gear.saddle).toEqual({ item: 'saddleJump', color: 'havana', size: 'pony' });
    expect(freeStock(p, 'saddleJump', 'pony')).toBe(0);
  });

  it('on peut échanger gratuitement un objet rangé contre une autre taille', () => {
    const p = createProfile('A', 'manage');
    const before = p.money;
    const big = horse('selle_francais');
    p.animals.push(big);
    buyGear(p, 'saddlePad', 'pony');
    const spent = before - p.money;
    expect(spent).toBe(gearPrice('saddlePad', 'pony'));
    expect(swapSize(p, 'saddlePad', 'pony', 'horse').ok).toBe(true);
    expect(p.money).toBe(before - spent);
    expect(equip(p, big, 'saddlePad', 'navy').ok).toBe(true);
    expect(swapSize(p, 'saddlePad', 'horse', 'pony').reason).toBe('notOwned'); // il est porté
  });
});

describe('acheter et équiper', () => {
  it('bac à sable : gratuit ; mode gestion : on paie le juste prix', () => {
    const s = createProfile('S', 'sandbox');
    const m0 = s.money;
    expect(buyGear(s, 'saddleWestern').ok).toBe(true);
    expect(s.money).toBe(m0);
    const g = createProfile('G', 'manage');
    g.money = 100;
    expect(buyGear(g, 'saddleWestern').reason).toBe('money');
    g.money = 300;
    expect(buyGear(g, 'saddleWestern').ok).toBe(true);
    expect(g.money).toBe(300 - GEAR.saddleWestern.price);
  });

  it('« bridle » désigne tous les filets : un hackamore libre fait l\'affaire', () => {
    const p = createProfile('A', 'sandbox');
    const a = horse();
    const b = horse();
    p.animals.push(a, b);
    expect(equip(p, a, 'bridle').ok).toBe(true); // le filet offert
    buyGear(p, 'hackamore');
    expect(owned(p, 'bridle')).toBe(2);
    expect(inUse(p, 'bridle')).toBe(1);
    const r = equip(p, b, 'bridle');
    expect(r.ok).toBe(true);
    expect(b.gear.bridle.item).toBe('hackamore');
    expect(wears(b, 'bridle')).toBe(true);
    expect(rideGear(b).ok).toBe(true);
  });

  it('la bride est réservée aux chevaux assez dressés', () => {
    const p = createProfile('A', 'sandbox');
    const a = horse();
    p.animals.push(a);
    buyGear(p, 'doubleBridle');
    a.skills.obedience = 20;
    expect(equip(p, a, 'doubleBridle').reason).toBe('tooAdvanced');
    a.skills.obedience = 60;
    expect(equip(p, a, 'doubleBridle').ok).toBe(true);
  });

  it('les couleurs inconnues prennent la couleur du modèle', () => {
    const p = createProfile('A', 'sandbox');
    const a = horse();
    p.animals.push(a);
    equip(p, a, 'saddle', 'pink'); // une selle mixte n'existe pas en rose
    expect(a.gear.saddle.color).toBe('brown');
    equip(p, a, 'saddle', 'black');
    expect(a.gear.saddle.color).toBe('black');
  });

  it('stockOf liste les tailles possédées', () => {
    const p = createProfile('A', 'sandbox');
    buyGear(p, 'boots', 'pony');
    buyGear(p, 'boots', 'pony');
    buyGear(p, 'boots', 'draft');
    expect(stockOf(p, 'boots')).toEqual([{ size: 'pony', owned: 2, free: 2 }, { size: 'draft', owned: 1, free: 1 }]);
  });
});

describe('anciennes sauvegardes', () => {
  it('l\'objet porté par un poney prend sa taille, et le cavalier reçoit une bombe', () => {
    const pony = horse('shetland');
    pony.gear = { saddle: { item: 'saddle' }, bridle: { item: 'bridle' } };
    const big = horse('selle_francais');
    big.gear = { halter: { item: 'halter', color: 'red' } };
    const old = { items: { saddle: 1, bridle: 2, halter: 1 }, animals: [pony, big], mode: 'sandbox' };
    ensureTack(old);
    expect(old.items).toEqual({ 'saddle@pony': 1, bridle: 1, 'bridle@pony': 1, halter: 1, helmet: 1 });
    expect(pony.gear.saddle.size).toBe('pony');
    expect(big.gear.halter.size).toBeUndefined();
    expect(riderHelmet(old)).toEqual({ item: 'helmet', color: 'black' });
    expect(owned(old, 'saddle')).toBe(1);
    expect(inUse(old, 'saddle')).toBe(1);
    expect(freeStock(old, 'bridle', 'horse')).toBe(1);
    // Une seule fois : rien ne bouge au deuxième passage.
    ensureTack(old);
    expect(old.items['saddle@pony']).toBe(1);
  });

  it('nouveau profil : bombe offerte, on peut en choisir une autre', () => {
    const p = createProfile('A', 'sandbox');
    expect(riderHelmet(p).item).toBe('helmet');
    expect(equipHelmet(p, 'helmetSparkle', 'pink').reason).toBe('notOwned');
    buyGear(p, 'helmetSparkle');
    expect(equipHelmet(p, 'helmetSparkle', 'pink').ok).toBe(true);
    expect(riderHelmet(p)).toEqual({ item: 'helmetSparkle', color: 'pink' });
  });
});

describe('effets en jeu', () => {
  const geared = (gear) => ({ ...horse(), gear });

  it('selle d\'obstacle et cloches : saut plus sûr', () => {
    const plain = horse();
    const jumper = geared({ saddle: { item: 'saddleJump' }, bells: { item: 'bellBoots' } });
    const a = jumpChance({ ...horseJumpStats(plain), energy: 80, height: 0.3, align: 0.9, timing: 0.6 });
    const b = jumpChance({ ...horseJumpStats(jumper), energy: 80, height: 0.3, align: 0.9, timing: 0.6 });
    expect(b - a).toBeCloseTo(0.08, 5);
    // Hackamore : doux mais moins précis.
    const soft = geared({ bridle: { item: 'hackamore' } });
    expect(jumpChance({ ...horseJumpStats(soft), energy: 80, height: 0.3 })).toBeLessThan(jumpChance({ ...horseJumpStats(plain), energy: 80, height: 0.3 }));
  });

  it('selle de dressage et bride : figures mieux notées (fenêtre plus large)', () => {
    const a = horse();
    const before = trickWindow(a);
    a.gear = { saddle: { item: 'saddleDressage' }, bridle: { item: 'doubleBridle' } };
    expect(trickWindow(a) - before).toBeCloseTo(0.09, 5);
  });

  it('selle de randonnée : moins de fatigue en balade ; western : la longue balade n\'est pas pénalisée', () => {
    const plain = horse();
    const trail = geared({ saddle: { item: 'saddleTrail' } });
    plain.needs.energy = 80;
    trail.needs.energy = 80;
    activitySkillGain(plain, 'trail', 0.5);
    activitySkillGain(trail, 'trail', 0.5);
    expect(80 - trail.needs.energy).toBeLessThan(80 - plain.needs.energy);
    const args = { checkpoints: 9, totalCheckpoints: 9, collected: 10, totalCollectibles: 16, photos: 2, time: 500 };
    const western = tackEffects(geared({ saddle: { item: 'saddleWestern' } }));
    expect(western.longRide).toBe(true);
    expect(trailResult({ ...args, longRide: western.longRide }).points).toBeGreaterThan(trailResult(args).points);
  });

  it('selle de course : plus vite ; tapis : plus de câlins après l\'effort', () => {
    expect(tackEffects(geared({ saddle: { item: 'saddleRace' } })).speed).toBeGreaterThan(1);
    const plain = horse();
    const padded = geared({ pad: { item: 'gelPad' } });
    plain.needs.affection = 50;
    padded.needs.affection = 50;
    activitySkillGain(plain, 'jumping', 0.5);
    activitySkillGain(padded, 'jumping', 0.5);
    expect(padded.needs.affection).toBeGreaterThan(plain.needs.affection);
  });

  it('chaque couverture protège de sa météo', () => {
    const winter = geared({ blanket: { item: 'blanket' } });
    const rain = geared({ blanket: { item: 'blanketRain' } });
    const summer = geared({ blanket: { item: 'blanketSummer' } });
    expect(feltWeather(winter, 'snow', 0, 'winter')).toBe('clear');
    expect(feltWeather(winter, 'clear', 20, 'spring')).toBe('heat');
    expect(feltWeather(rain, 'rain', 12, 'autumn')).toBe('clear');
    expect(feltWeather(rain, 'clear', 20, 'spring')).toBe('clear');
    expect(feltWeather(rain, 'snow', 0, 'winter')).toBe('snow');
    expect(feltWeather(summer, 'clear', 28, 'summer')).toBe('clear'); // ni chaud, ni mouches
    expect(feltWeather(summer, 'rain', 15, 'summer')).toBe('rain');
    expect(feltWeather(horse(), 'clear', 28, 'summer')).toBe('flies');
  });
});

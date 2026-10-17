import { describe, it, expect } from 'vitest';
import { createProfile, migrate } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { mulberry32 } from '../src/sim/rng.js';
import { DAYS_PER_YEAR } from '../src/sim/time.js';
import {
  equip, owned, inUse, buyGear, freeStock, ownedStock, stockOf, swapSize, atHomeCount, ensureTack, riderHelmet,
} from '../src/sim/gear.js';
import { hasTool, missingTool, buyTool, toolAtHome } from '../src/sim/tools.js';
import {
  CAPACITY, capacityFor, cargoItems, createCargo, cargoUsed, available, canPack, pack, unpack, inCargo,
  suggestCargo, missingSupplies, luggageOnArrival, arriveWithCargo, luggageHere, isAway, wishList,
  cargoItem, cargoShape, fitsTraveller,
} from '../src/sim/cargo.js';

// (un cheval de selle, taille « cheval » : celle de la selle et du filet offerts au début, src/sim/gear.js)
const horse = (extra = {}) => Object.assign(createAnimal({ species: 'horse', breed: 'selle_francais', ageDays: 6 * DAYS_PER_YEAR, rng: mulberry32(3) }), extra);
const dog = () => createAnimal({ species: 'dog', ageDays: 3 * DAYS_PER_YEAR, rng: mulberry32(4) });
const profile = () => createProfile('Lea', 'manage');

describe('coffre de transport', () => {
  it('connaît tout le matériel : provisions, équipement et outils, avec leur place', () => {
    const items = cargoItems();
    for (const id of ['hay', 'water', 'bowls', 'saddle', 'bridle', 'halter', 'blanket', 'brush', 'firstAid']) {
      expect(items.find((x) => x.id === id)).toBeTruthy();
    }
    expect(items.find((x) => x.id === 'saddle').size).toBe(2);
    expect(capacityFor('car')).toBeLessThan(capacityFor('trailer'));
    expect(capacityFor('none')).toBe(CAPACITY.none);
  });

  it('on range ce qu\'on possède, dans la limite de la place', () => {
    const p = profile();
    const c = createCargo();
    expect(pack(p, c, 'saddle', 8).ok).toBe(true);
    expect(cargoUsed(c)).toBe(2);
    // Une seule selle à la maison : on ne peut pas en ranger deux.
    expect(pack(p, c, 'saddle', 8).reason).toBe('max');
    // Pas de shampoing acheté.
    expect(canPack(p, c, 'shampoo', 8).reason).toBe('none');
    // Les provisions sont toujours disponibles.
    expect(pack(p, c, 'hay', 8).ok).toBe(true);
    expect(pack(p, c, 'water', 8).ok).toBe(true);
    expect(pack(p, c, 'brush', 8).ok).toBe(true);
    expect(pack(p, c, 'bridle', 8).ok).toBe(true);
    expect(cargoUsed(c)).toBe(7);
    // Plus de place pour la selle d'un deuxième cheval… ni pour 2 cases.
    expect(canPack(p, c, 'treats', 7).reason).toBe('full');
    expect(unpack(c, 'hay').ok).toBe(true);
    expect(inCargo(c, 'hay')).toBe(0);
    expect(unpack(c, 'hay').ok).toBe(false);
  });

  it('un licol porté par le cheval voyage avec lui : il n\'est plus libre pour le coffre', () => {
    const p = profile();
    const h = horse({ location: p.place });
    p.animals.push(h);
    expect(available(p, 'halter')).toBe(1);
    expect(equip(p, h, 'halter').ok).toBe(true);
    expect(available(p, 'halter')).toBe(0);
    // Il manque un licol pour le coffre, mais la liste ne le demande plus (le cheval le porte).
    expect(wishList([h])).not.toContain('halter');
  });

  it('préparer le nécessaire selon les voyageurs', () => {
    const p = profile();
    const h = horse({ location: p.place });
    const d = dog();
    p.animals.push(h, d);
    const c = suggestCargo(p, [h, d], capacityFor('trailer'));
    expect(inCargo(c, 'water')).toBe(1);
    expect(inCargo(c, 'hay')).toBe(1);
    expect(inCargo(c, 'bowls')).toBe(1);
    expect(cargoUsed(c)).toBeLessThanOrEqual(capacityFor('trailer'));
    expect(missingSupplies(c, [h, d])).toEqual([]);
    // Dans les sacoches (à cheval), il y a très peu de place : l'eau d'abord.
    const small = suggestCargo(p, [h], capacityFor('none'));
    expect(cargoUsed(small)).toBeLessThanOrEqual(capacityFor('none'));
    expect(inCargo(small, 'water')).toBe(1);
  });

  it('à cheval, pas de foin dans les sacoches : ils broutent en route', () => {
    const p = profile();
    const h = horse({ location: p.place });
    p.animals.push(h);
    const bags = suggestCargo(p, [h], capacityFor('none'), { mode: 'horse' });
    expect(inCargo(bags, 'hay')).toBe(0);
    expect(inCargo(bags, 'water')).toBe(1);
    expect(missingSupplies(bags, [h], 'horse')).toEqual([]);
  });

  it('le coffre du dernier voyage est proposé la fois suivante', () => {
    const p = profile();
    p.lastCargo = { brush: 1, saddle: 1 };
    const h = horse({ location: p.place });
    const c = suggestCargo(p, [h], capacityFor('trailer'));
    expect(inCargo(c, 'brush')).toBe(1);
    expect(inCargo(c, 'saddle')).toBe(1);
    // … plus les provisions indispensables pour un cheval.
    expect(inCargo(c, 'hay')).toBe(1);
    expect(inCargo(c, 'water')).toBe(1);
  });
});

describe('à l\'arrivée', () => {
  const travelAway = () => {
    const p = profile();
    const h = horse({ location: p.place });
    p.animals.push(h);
    equip(p, h, 'halter');
    const c = createCargo();
    pack(p, c, 'saddle', 14);
    pack(p, c, 'brush', 14);
    pack(p, c, 'hay', 14);
    // On arrive en Bretagne avec le cheval (Game.travel change le lieu).
    arriveWithCargo(p, c, [h], 'bretagne');
    p.place = 'bretagne';
    h.location = 'bretagne';
    return { p, h, c };
  };

  it('le matériel emporté est utilisable sur place, le reste est resté à la maison', () => {
    const { p, h } = travelAway();
    expect(isAway(p)).toBe(true);
    expect(owned(p, 'saddle')).toBe(1);
    expect(equip(p, h, 'saddle').ok).toBe(true);
    // Le licol est venu sur la tête du cheval.
    expect(owned(p, 'halter')).toBe(1);
    expect(inUse(p, 'halter')).toBe(1);
    // Le filet n'a pas été emporté : il est resté à la maison.
    const r = equip(p, h, 'bridle');
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('leftAtHome');
    expect(hasTool(p, 'brush')).toBe(true);
    expect(hasTool(p, 'pitchfork')).toBe(false);
    expect(toolAtHome(p, 'pitchfork')).toBe(true);
    expect(missingTool(p, 'clean')).toBe('pitchfork');
    expect(luggageHere(p).map((x) => x.id)).toEqual(expect.arrayContaining(['hay', 'saddle', 'halter', 'brush']));
  });

  it('on rentre à la maison : on retrouve tout le matériel', () => {
    const { p, h, c } = travelAway();
    arriveWithCargo(p, c, [h], p.home);
    p.place = p.home;
    expect(p.luggage).toBeUndefined();
    expect(isAway(p)).toBe(false);
    expect(hasTool(p, 'pitchfork')).toBe(true);
    expect(owned(p, 'bridle')).toBe(1);
    expect(luggageHere(p)).toBe(null);
    // Le coffre est retenu pour le prochain voyage.
    expect(p.lastCargo.saddle).toBe(1);
  });

  it('acheté sur place : on peut s\'en servir tout de suite, et on le garde', () => {
    const { p } = travelAway();
    expect(buyGear(p, 'bridle').ok).toBe(true);
    expect(owned(p, 'bridle')).toBe(1);
    expect(p.items.bridle).toBe(2);
    expect(buyTool(p, 'pitchfork').ok).toBe(true);
    expect(hasTool(p, 'pitchfork')).toBe(true);
    expect(p.tools.filter((x) => x === 'pitchfork').length).toBe(1);
  });

  it('les anciennes sauvegardes (sans coffre) gardent tout leur matériel partout', () => {
    const p = profile();
    p.place = 'japon';
    expect(isAway(p)).toBe(false);
    expect(hasTool(p, 'brush')).toBe(true);
    expect(owned(p, 'saddle')).toBe(1);
    const m = migrate(JSON.parse(JSON.stringify(p)));
    expect(m.luggage).toBeUndefined();
    expect(hasTool(m, 'brush')).toBe(true);
  });

  it('le coffre est sauvegardé avec le profil', () => {
    const { p } = travelAway();
    const back = migrate(JSON.parse(JSON.stringify(p)));
    expect(back.luggage.place).toBe('bretagne');
    expect(back.luggage.items.saddle).toBe(1);
    expect(back.luggage.tools).toContain('brush');
    expect(back.lastCargo.hay).toBe(1);
  });

  it('rien d\'emporté pour un voyage vers la maison', () => {
    const p = profile();
    expect(luggageOnArrival(p, createCargo(), [], p.home)).toBe(null);
  });
});

// Véhicules + sellerie : le coffre est rangé par taille, avec les clés de la sellerie (stockKey).
describe('coffre de transport et tailles de la sellerie', () => {
  const pony = () => Object.assign(createAnimal({ species: 'horse', breed: 'shetland', ageDays: 6 * DAYS_PER_YEAR, rng: mulberry32(5) }), { name: 'Caramel' });
  const big = () => Object.assign(createAnimal({ species: 'horse', breed: 'selle_francais', ageDays: 6 * DAYS_PER_YEAR, rng: mulberry32(6) }), { name: 'Tornado' });
  const setOff = (p, cargo, travellers, dest = 'bretagne') => {
    arriveWithCargo(p, cargo, travellers, dest);
    p.place = dest;
    for (const a of travellers) a.location = dest;
  };

  it('chaque taille a sa ligne dans le coffre (la selle poney n\'est pas la selle cheval)', () => {
    expect(cargoItem('saddle').fit).toBe('horse');
    expect(cargoItem('saddle@pony')).toMatchObject({ kind: 'gear', gear: 'saddle', fit: 'pony', size: 2 });
    expect(cargoItem('saddleJump@pony').gear).toBe('saddleJump');
    expect(cargoItem('collar')).toMatchObject({ kind: 'gear', fit: null });
    expect(cargoShape('saddleJump@pony')).toBe('saddle');
    expect(cargoShape('hackamore')).toBe('bridle');
    expect(cargoShape('hay')).toBe('hay');
    expect(cargoItem('helmet')).toBe(null); // la bombe voyage avec le cavalier, pas dans le coffre
    const p = profile();
    buyGear(p, 'saddle', 'pony');
    expect(available(p, 'saddle@pony')).toBe(1);
    expect(available(p, 'saddle')).toBe(1); // la selle cheval du départ
    expect(fitsTraveller('saddle@pony', pony())).toBe(true);
    expect(fitsTraveller('saddle', pony())).toBe(false);
    expect(fitsTraveller('saddle', big())).toBe(true);
  });

  it('le nécessaire proposé est à la taille de chaque cheval', () => {
    const p = profile();
    const c1 = pony();
    p.animals.push(c1);
    buyGear(p, 'saddle', 'pony');
    buyGear(p, 'bridle', 'pony');
    const list = wishList([c1]);
    expect(list).toEqual(expect.arrayContaining(['saddle@pony', 'bridle@pony', 'halter@pony']));
    expect(list).not.toContain('saddle');
    const c = suggestCargo(p, [c1], capacityFor('trailer'), { last: null });
    expect(inCargo(c, 'saddle@pony')).toBe(1);
    expect(inCargo(c, 'bridle@pony')).toBe(1);
    expect(inCargo(c, 'saddle')).toBe(0);
    // Pas de selle mixte poney, mais une selle poney-club : on prend celle-là.
    const p2 = profile();
    p2.animals.push(c1);
    buyGear(p2, 'saddlePony', 'pony');
    expect(inCargo(suggestCargo(p2, [c1], capacityFor('trailer'), { last: null }), 'saddlePony')).toBe(1);
  });

  it('en voyage : on équipe avec ce qui est dans le coffre, à la bonne taille', () => {
    const p = profile();
    const c1 = pony();
    p.animals.push(c1);
    buyGear(p, 'saddle', 'pony');
    buyGear(p, 'bridle', 'pony');
    const c = createCargo();
    pack(p, c, 'saddle@pony', 14);
    pack(p, c, 'saddle', 14); // la selle cheval aussi (elle ne lui va pas)
    setOff(p, c, [c1]);
    expect(isAway(p)).toBe(true);
    expect(freeStock(p, 'saddle', 'pony')).toBe(1);
    expect(equip(p, c1, 'saddle', 'brown', { exact: true }).ok).toBe(true);
    expect(c1.gear.saddle.size).toBe('pony');
    expect(freeStock(p, 'saddle', 'pony')).toBe(0);
    // Le filet poney est resté à la maison : message clair, et pas d'échange de taille.
    const r = equip(p, c1, 'bridle', 'brown', { autoSwap: true });
    expect(r).toMatchObject({ ok: false, reason: 'leftAtHome' });
    expect(atHomeCount(p, 'bridle', 'pony')).toBe(1);
    expect(stockOf(p, 'bridle')).toEqual([]);
  });

  it('en voyage, celui du coffre n\'est pas à sa taille : pas d\'échange (la sellière est à la maison)', () => {
    const p = profile();
    const c1 = pony();
    p.animals.push(c1);
    const c = createCargo();
    pack(p, c, 'saddle', 14); // la selle cheval du départ, seule selle qu'on a
    setOff(p, c, [c1]);
    const r = equip(p, c1, 'saddle', 'brown', { exact: true, autoSwap: true });
    expect(r).toMatchObject({ ok: false, reason: 'wrongSizeAway', need: 'pony' });
    expect(swapSize(p, 'saddle', 'horse', 'pony')).toMatchObject({ ok: false, reason: 'away' });
    expect(p.items['saddle@pony']).toBeUndefined();
    // Rien du tout, ni ici ni à la maison : il faut en acheter un.
    expect(equip(p, c1, 'saddleWestern', 'tan', { exact: true }).reason).toBe('notOwned');
  });

  it('acheter en voyage : dans le coffre, à la taille choisie, et on le rapporte à la maison', () => {
    const p = profile();
    const c1 = pony();
    p.animals.push(c1);
    setOff(p, createCargo(), [c1]);
    expect(buyGear(p, 'bridle', 'pony').ok).toBe(true);
    expect(p.luggage.items['bridle@pony']).toBe(1);
    expect(p.items['bridle@pony']).toBe(1);
    expect(equip(p, c1, 'bridle', 'black', { exact: true }).ok).toBe(true);
    // De retour : tout est rangé à la maison, avec le filet acheté là-bas.
    arriveWithCargo(p, createCargo(), [c1], p.home);
    p.place = p.home;
    c1.location = p.home;
    expect(isAway(p)).toBe(false);
    expect(ownedStock(p, 'bridle', 'pony')).toBe(1);
    expect(ownedStock(p, 'bridle', 'horse')).toBe(1);
  });

  it('ce que portent les voyageurs (et les animaux déjà là-bas) arrive à leur taille ; la bombe suit le cavalier', () => {
    const p = profile();
    const c1 = pony();
    const t1 = big();
    p.animals.push(c1, t1);
    buyGear(p, 'halter', 'pony');
    expect(equip(p, c1, 'halter', 'red', { exact: true }).ok).toBe(true);
    t1.location = 'bretagne'; // laissé là-bas à un voyage précédent, avec son licol
    expect(equip(p, t1, 'halter', 'red', { exact: true }).ok).toBe(true);
    const l = luggageOnArrival(p, createCargo(), [c1], 'bretagne');
    expect(l.items['halter@pony']).toBe(1);
    expect(l.items.halter).toBe(1);
    expect(l.items.helmet).toBe(1);
    setOff(p, createCargo(), [c1]);
    expect(freeStock(p, 'halter', 'pony')).toBe(0);
    expect(freeStock(p, 'halter', 'horse')).toBe(0);
    expect(riderHelmet(p)?.item).toBe('helmet');
  });

  it('une sauvegarde de voyage d\'avant les tailles : le coffre suit la mise à jour de la sellerie', () => {
    const p = profile();
    const c1 = pony();
    c1.location = 'bretagne';
    c1.gear = { saddle: { item: 'saddle', color: 'brown' } };
    p.animals.push(c1);
    p.place = 'bretagne';
    p.items = { saddle: 1, halter: 1 };
    p.luggage = { place: 'bretagne', items: { saddle: 1 }, tools: [], supplies: {} };
    delete p.tackVersion;
    const m = migrate(JSON.parse(JSON.stringify(p)));
    ensureTack(m);
    expect(m.items['saddle@pony']).toBe(1);
    expect(m.luggage.items['saddle@pony']).toBe(1);
    expect(m.luggage.items.saddle).toBeUndefined();
    expect(freeStock(m, 'saddle', 'pony')).toBe(0);
    expect(atHomeCount(m, 'halter')).toBe(1);
  });
});

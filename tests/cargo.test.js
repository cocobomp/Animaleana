import { describe, it, expect } from 'vitest';
import { createProfile, migrate } from '../src/sim/profile.js';
import { createAnimal } from '../src/sim/animal.js';
import { mulberry32 } from '../src/sim/rng.js';
import { DAYS_PER_YEAR } from '../src/sim/time.js';
import { equip, owned, inUse, buyGear } from '../src/sim/gear.js';
import { hasTool, missingTool, buyTool, toolAtHome } from '../src/sim/tools.js';
import {
  CAPACITY, capacityFor, cargoItems, createCargo, cargoUsed, available, canPack, pack, unpack, inCargo,
  suggestCargo, missingSupplies, luggageOnArrival, arriveWithCargo, luggageHere, isAway, wishList,
} from '../src/sim/cargo.js';

const horse = (extra = {}) => Object.assign(createAnimal({ species: 'horse', ageDays: 6 * DAYS_PER_YEAR, rng: mulberry32(3) }), extra);
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

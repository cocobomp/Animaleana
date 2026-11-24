// Le décor du soin suit le vrai lieu de l'animal (src/game/care/setting.js).
import { describe, it, expect } from 'vitest';
import { careSetting, settingFrom, whereFacts, INDOOR_OF, OUTDOOR_OF, CARE_ANYWHERE, SETTINGS } from '../src/game/care/setting.js';
import { enclosure } from '../src/game/nav.js';

/** Un petit jeu pour les tests : l'animal (entité à la position x, z), le lieu, les bâtiments. */
function fakeGame({ a, x = 0, z = 0, place = 'maison', home = 'maison', inside = false, rooms = {}, structures = [], door = null }) {
  const e = { position: { x, z }, inside };
  return {
    profile: { place, home, animals: [a] },
    entities: new Map([[a.id, e]]),
    interiors: { roomAt: (id) => rooms[id] ?? null },
    structures: { here: () => structures },
    events: { houseDoor: () => door },
  };
}
const animal = (species, more = {}) => ({ id: `${species}1`, species, location: 'maison', ...more });

describe('le lieu du soin (careSetting)', () => {
  it('sans jeu, chaque espèce garde son décor habituel', () => {
    for (const sp of Object.keys(INDOOR_OF)) expect(careSetting(null, animal(sp))).toBe(INDOOR_OF[sp]);
    expect(INDOOR_OF.horse).toBe('box');
    expect(INDOOR_OF.cow).toBe('etable');
    expect(INDOOR_OF.dog).toBe('maison');
    expect(INDOOR_OF.rabbit).toBe('clapier');
  });

  it('cheval : au box, le box ; au paddock ou au pré, le pré ; en voyage, ailleurs', () => {
    const pd = enclosure('paddock');
    const h = animal('horse', { stalled: true, box: 0 });
    expect(careSetting(fakeGame({ a: h, x: 0, z: 0 }), h, 'feed')).toBe('box');
    const h2 = animal('horse');
    expect(careSetting(fakeGame({ a: h2, x: pd.x, z: pd.z }), h2, 'feed')).toBe('pre');
    expect(careSetting(fakeGame({ a: h2, x: 40, z: -30 }), h2, 'water')).toBe('pre');
    // (dans l'écurie, sans être rentré au box : dedans)
    expect(careSetting(fakeGame({ a: h2, rooms: { stable: 'hall' } }), h2, 'brush')).toBe('box');
    // (dans une grange construite : dedans ; sous un abri ouvert : dehors)
    const barn = { id: 's1', type: 'barn', x: 30, z: 30, rot: 0 };
    expect(careSetting(fakeGame({ a: h2, x: 30, z: 30, structures: [barn] }), h2, 'feed')).toBe('box');
    const shelter = { id: 's2', type: 'shelter', x: 30, z: 30, rot: 0 };
    expect(careSetting(fakeGame({ a: h2, x: 30, z: 30, structures: [shelter] }), h2, 'feed')).toBe('pre');
    // en voyage (le jeu est dans un autre lieu que la ferme, l'animal y est aussi)
    const h3 = animal('horse', { location: 'camping' });
    expect(careSetting(fakeGame({ a: h3, place: 'camping', home: 'maison' }), h3, 'feed')).toBe('ailleurs');
  });

  it('mouton, chèvre, vache : sous l\'abri de la bergerie, l\'étable ; dans l\'enclos ou au pré, le pré', () => {
    const pe = enclosure('pen');
    for (const sp of ['sheep', 'goat', 'cow']) {
      const a = animal(sp);
      expect(careSetting(fakeGame({ a, x: pe.x, z: pe.z - pe.hd + 2.6 }), a, 'feed')).toBe('etable');
      expect(careSetting(fakeGame({ a, x: pe.x, z: pe.z + pe.hd - 1 }), a, 'feed')).toBe('pre');
      const pasture = { id: 'p', type: 'pasture', x: -40, z: 40, rot: 0 };
      expect(careSetting(fakeGame({ a, x: -40, z: 40, structures: [pasture] }), a, 'water')).toBe('pre');
      const barn = { id: 'b', type: 'barn', x: -40, z: 40, rot: 0 };
      expect(careSetting(fakeGame({ a, x: -40, z: 40, structures: [barn] }), a, 'water')).toBe('etable');
    }
  });

  it('chien, chat : rangé dans la maison des animaux ou dans la maison, la maison ; dehors, le jardin', () => {
    for (const sp of ['dog', 'cat']) {
      const a = animal(sp, { housed: true });
      expect(careSetting(fakeGame({ a, inside: true }), a, 'feed')).toBe('maison');
      const b = animal(sp);
      expect(careSetting(fakeGame({ a: b, rooms: { house: 'salon' } }), b, 'pet')).toBe('maison');
      expect(careSetting(fakeGame({ a: b, x: 5, z: 5 }), b, 'feed')).toBe('jardin');
    }
  });

  it('lapin : rangé, le clapier ; dans son enclos ou dehors, l\'herbe et le grillage', () => {
    const hu = enclosure('hutch');
    const a = animal('rabbit', { housed: true });
    expect(careSetting(fakeGame({ a, inside: true }), a, 'feed')).toBe('clapier');
    const b = animal('rabbit');
    expect(careSetting(fakeGame({ a: b, x: hu.x, z: hu.z }), b, 'feed')).toBe('enclos');
  });

  it('un soin qui a besoin de son lieu garde son décor habituel', () => {
    const pd = enclosure('paddock');
    const h = animal('horse');
    const g = fakeGame({ a: h, x: pd.x, z: pd.z });
    expect(careSetting(g, h, 'feed')).toBe('pre');
    for (const act of ['clean', 'saddle', 'lunge', 'shoe', 'gcut']) expect(careSetting(g, h, act)).toBe('box');
    const c = animal('cow');
    expect(careSetting(fakeGame({ a: c, x: 999, z: 999 }), c, 'clean')).toBe('etable');
    const r = animal('rabbit');
    expect(careSetting(fakeGame({ a: r, x: 999, z: 999 }), r, 'clean')).toBe('clapier');
  });

  it('un animal qui n\'est pas dans ce lieu garde son décor habituel', () => {
    const a = animal('horse', { location: 'ailleurs-lointain' });
    expect(careSetting(fakeGame({ a, x: 0, z: 0 }), a, 'feed')).toBe('box');
  });

  it('settingFrom ne renvoie que des lieux connus, pour toutes les espèces et tous les cas', () => {
    const facts = [{ known: false }, { known: true, here: true }, { known: true, here: true, away: true }, { known: true, here: true, stalled: true }, { known: true, here: true, housed: true }, { known: true, here: true, inFold: true }];
    for (const sp of Object.keys(INDOOR_OF)) {
      for (const f of facts) for (const act of [null, ...CARE_ANYWHERE[sp], 'clean']) expect(SETTINGS).toContain(settingFrom(sp, f, act));
      expect(SETTINGS).toContain(OUTDOOR_OF[sp]);
    }
  });

  it('whereFacts lit la position de l\'animal', () => {
    const a = animal('dog');
    const f = whereFacts(fakeGame({ a, x: 3, z: 4, door: { x: 3, z: 5 } }), a);
    expect(f.pos).toEqual({ x: 3, z: 4 });
    expect(f.nearHouse).toBe(true);
    expect(whereFacts(null, a).known).toBe(false);
  });
});

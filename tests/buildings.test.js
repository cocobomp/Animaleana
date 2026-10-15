import { describe, it, expect } from 'vitest';
import { buildingActions, animalActionAllowed } from '../src/sim/buildings.js';

const count = { horse: 2, livestock: 3, pets: 1, sick: 0, milkable: 1, shearable: 1 };
const find = (list, id) => list.find((a) => a.id === id);

describe('bâtiments', () => {
  it('la nuit, on ne brosse pas les chevaux mais on peut vérifier qu\'ils vont bien', () => {
    const night = buildingActions('stable', { hour: 23, season: 'summer', count });
    expect(find(night, 'brushHorses')).toMatchObject({ enabled: false, reason: 'asleep' });
    expect(find(night, 'checkHorses').enabled).toBe(true);
    expect(find(buildingActions('stable', { hour: 10, season: 'summer', count }), 'brushHorses').enabled).toBe(true);
  });

  it('le refuge est fermé la nuit', () => {
    expect(find(buildingActions('refuge', { hour: 21, home: true, count }), 'adopt')).toMatchObject({ enabled: false, reason: 'closed' });
    expect(find(buildingActions('refuge', { hour: 10, home: false, count }), 'shop').enabled).toBe(true);
  });

  it('on trait le matin et le soir, on tond au printemps et en été', () => {
    expect(find(buildingActions('pen', { hour: 13, season: 'summer', count }), 'milkAll').reason).toBe('milkTime');
    expect(find(buildingActions('pen', { hour: 7, season: 'summer', count }), 'milkAll').enabled).toBe(true);
    expect(find(buildingActions('pen', { hour: 10, season: 'winter', count }), 'shearAll').reason).toBe('shearSeason');
  });

  it('la clinique reste ouverte la nuit pour une urgence', () => {
    expect(find(buildingActions('vet', { hour: 2, count }), 'vet').enabled).toBe(false);
    expect(find(buildingActions('vet', { hour: 2, count: { ...count, sick: 1 } }), 'vet').enabled).toBe(true);
  });

  it('sans cheval, l\'écurie explique pourquoi', () => {
    expect(find(buildingActions('stable', { hour: 10, count: { ...count, horse: 0 } }), 'hayHorses').reason).toBe('noAnimals');
  });

  it('un animal qui dort accepte une caresse mais pas un jeu', () => {
    expect(animalActionAllowed('pet', { sleeping: true }).ok).toBe(true);
    expect(animalActionAllowed('play', { sleeping: true }).ok).toBe(false);
  });
});

describe('sellerie et maison des animaux', () => {
  const find = (list, id) => list.find((a) => a.id === id);
  it('on range les petits animaux seulement si on en a dehors', () => {
    const none = buildingActions('pethouse', { hour: 20, count: { pets: 0, petsOut: 0, housed: 0 } });
    expect(find(none, 'storePets').reason).toBe('noPets');
    const out = buildingActions('pethouse', { hour: 20, count: { pets: 2, petsOut: 2, housed: 0 } });
    expect(find(out, 'storePets').enabled).toBe(true);
    expect(find(out, 'outPets').reason).toBe('noneHoused');
    const inside = buildingActions('pethouse', { hour: 20, count: { pets: 2, petsOut: 0, housed: 2, petHouseDirt: 1 } });
    expect(find(inside, 'storePets').reason).toBe('allHoused');
    expect(find(inside, 'cleanPetHouse').enabled).toBe(true);
  });
  it('le cuir ne se nettoie que s\'il est sale', () => {
    expect(find(buildingActions('tackroom', { hour: 10, count: { tackDirty: 0 } }), 'cleanTack').reason).toBe('tackClean');
    expect(find(buildingActions('tackroom', { hour: 10, count: { tackDirty: 1 } }), 'cleanTack').enabled).toBe(true);
  });
});

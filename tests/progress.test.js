import { describe, it, expect } from 'vitest';
import { addXp, levelOf, isUnlocked, xpForLevel } from '../src/sim/progress.js';
import { createProfile } from '../src/sim/profile.js';
import { hireHelper, helperTask } from '../src/sim/farm.js';
import { createAnimal } from '../src/sim/animal.js';

describe('progression', () => {
  it('monte de niveau et débloque des automatismes', () => {
    const p = createProfile('A');
    expect(levelOf(0)).toBe(1);
    expect(isUnlocked(p, 'petFeeder')).toBe(false);
    p.xp = xpForLevel(3) - 1;
    const up = addXp(p, 'care');
    expect(up.level).toBe(3);
    expect(up.unlocked).toContain('petFeeder');
    expect(isUnlocked(p, 'petFeeder')).toBe(true);
    expect(addXp(p, 'care')).toBeNull();
  });

  it('une aide ne fait que les tâches qu\'on lui a confiées', () => {
    const p = createProfile('A');
    const h = hireHelper(p, 'groom', 'maison').helper;
    h.duties = ['water'];
    const horse = createAnimal({ species: 'horse', ageDays: 80 });
    horse.needs.hunger = 5;
    horse.needs.thirst = 50;
    expect(helperTask(p, h, [horse])).toMatchObject({ action: 'water' });
    horse.needs.thirst = 90;
    expect(helperTask(p, h, [horse])).toBeNull();
  });
});

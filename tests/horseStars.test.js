// ⭐ Ses étoiles (src/sim/horseStars.js) : 0 à 5 étoiles par compétence, fêtées une seule fois, jamais pour un cheval
// qu'on te confie ; la 1re étoile de saut dit vrai (plus de refus devant les troncs), les 2e et 3e ouvrent les parcours.
import { describe, it, expect, beforeAll } from 'vitest';
import { STAR_STEPS, STAR_SKILLS, starsOf, starsView, newStars, starUnlock } from '../src/sim/horseStars.js';
import { JUMP_STAGES, refusalChance } from '../src/sim/activities.js';
import { LOG } from '../src/sim/freeJumps.js';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';
import { STARS_FR, STARS_EN } from '../src/ui/horseStarsTexts.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

const horse = (o = {}) => Object.assign(createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'f', ageDays: 2000, rng: seeded('etoiles') }), { name: 'Étoile' }, o);

describe('ses étoiles', () => {
  it('les paliers : 19 → 0, 20 → 1, 39 → 1, 40 → 2, 64 → 2, 65 → 3, 100 → 5', () => {
    expect([19, 20, 39, 40, 64, 65, 84, 85, 99, 100].map(starsOf)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
    expect(starsOf(undefined)).toBe(0);
  });

  it('les 3 premiers paliers sont ceux des parcours de saut (petites croix, club, grand)', () => {
    expect(STAR_STEPS.slice(0, 3)).toEqual(JUMP_STAGES.slice(1, 4).map((s) => s.minSkill));
    expect([1, 2, 3].map((n) => starUnlock('jump', n))).toEqual(['noRefuse', 'club', 'grand']);
    expect(starUnlock('jump', 4)).toBeNull();
    expect(starUnlock('speed', 1)).toBeNull();
  });

  it('1re étoile de saut : il ne pile plus devant les troncs (vrai dans le jeu)', () => {
    expect(refusalChance(STAR_STEPS[0], LOG.height)).toBe(0);
    expect(refusalChance(STAR_STEPS[0] - 1, LOG.height)).toBeGreaterThan(0);
  });

  it('pour la fiche : les 5 compétences, et ce qui manque pour la suivante', () => {
    const a = horse();
    Object.assign(a.skills, { speed: 12, endurance: 85, jump: 39.5, dressage: 100, obedience: 20 });
    const v = starsView(a);
    expect(v.map((s) => s.id)).toEqual(STAR_SKILLS.map((s) => s.id));
    expect(v.map((s) => s.stars)).toEqual([0, 4, 1, 5, 1]);
    expect(v.find((s) => s.id === 'jump').toNext).toBeCloseTo(0.5);
    expect(v.find((s) => s.id === 'speed').toNext).toBe(8);
    expect(v.find((s) => s.id === 'dressage').toNext).toBe(0);
  });

  it('la première fois : notées sans rien dire ; puis 39 → 41 au saut : une étoile, une seule fois', () => {
    const a = horse();
    a.skills.jump = 39;
    expect(newStars(a)).toEqual([]);
    expect(a.stars).toEqual({ speed: 0, endurance: 0, jump: 1, dressage: 0, obedience: 0 });
    expect(newStars(a)).toEqual([]);
    a.skills.jump = 41;
    expect(newStars(a)).toEqual([{ id: 'jump', stars: 2 }]);
    expect(newStars(a)).toEqual([]);
    expect(a.stars.jump).toBe(2);
    // (deux compétences à la fois : dans l'ordre de la fiche)
    a.skills.jump = 70;
    a.skills.speed = 25;
    expect(newStars(a)).toEqual([{ id: 'speed', stars: 1 }, { id: 'jump', stars: 3 }]);
  });

  it('jamais pour un cheval qu\'on te confie ; un ancien cheval sans dressage compte 10', () => {
    for (const o of [{ client: true }, { guest: true }]) {
      const c = horse(o);
      newStars(c);
      c.skills.jump = 90;
      expect(newStars(c)).toEqual([]);
      expect(c.stars).toBeUndefined();
    }
    const old = horse();
    delete old.skills.dressage;
    expect(starsView(old).find((s) => s.id === 'dressage')).toMatchObject({ stars: 0, toNext: 10 });
    expect(newStars(old)).toEqual([]);
    expect(old.stars.dressage).toBe(0);
    old.skills.dressage = 22;
    expect(newStars(old)).toEqual([{ id: 'dressage', stars: 1 }]);
  });

  it('les textes existent en français et en anglais (au féminin aussi, au singulier)', () => {
    for (const k of Object.keys(STARS_FR).filter((x) => !x.endsWith('_f'))) expect(STARS_EN[k], k).toBeTruthy();
    for (const k of Object.keys(STARS_EN)) expect(STARS_FR[k], k).toBeTruthy();
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const { id } of STAR_SKILLS) {
        for (const k of [`skill_${id}`, `st_how_${id}`]) expect(t(k), `${lang} ${k}`).not.toBe(k);
      }
      for (const k of ['noRefuse', 'club', 'grand']) expect(t(`st_unlock_${k}`), `${lang} ${k}`).not.toBe(`st_unlock_${k}`);
      expect(t('st_new', { skill: 'S', name: 'Étoile', n: 2 })).toContain('Étoile');
      expect(t('st_next', { icon: '⤴️', skill: 'S', n: 1, how: '' })).not.toMatch(/1 points/);
    }
    setLang('fr');
    expect(t('st_new', { skill: t('skill_jump'), name: 'Étoile', n: 1 })).toBe('⭐ Saut : Étoile a sa première étoile !');
    expect(t('st_unlock_noRefuse', { g: 'f' })).toBe('Elle ne pile plus devant les troncs.');
    expect(t('st_unlock_noRefuse', { g: 'm' })).toBe('Il ne pile plus devant les troncs.');
    expect(t('st_new', { skill: 'Saut', name: 'Étoile', n: 2 })).toBe('⭐ Saut : Étoile a maintenant 2 étoiles !');
  });
});

describe('dans le jeu (src/game/Game.js starsTick)', () => {
  let Game;
  beforeAll(async () => {
    ({ Game } = await import('../src/game/Game.js'));
  }, 60000);

  it('une étoile par petit mot, avec ce qu\'elle ouvre ; rien pour un cheval qu\'on te confie', () => {
    const a = horse({ id: 'h1' });
    const c = horse({ id: 'h2', client: true });
    const toasts = [];
    const emits = [];
    const g = { profile: { animals: [a, c] }, ui: { toast: (m) => toasts.push(m) },
      entities: new Map([['h1', { emit: (e, n) => emits.push([e, n]) }]]) };
    a.skills.jump = 19;
    a.skills.speed = 19;
    Game.prototype.starsTick.call(g);
    expect(toasts).toEqual([]);
    a.skills.jump = 21;
    a.skills.speed = 21;
    c.skills.jump = 80;
    Game.prototype.starsTick.call(g);
    Game.prototype.starsTick.call(g);
    Game.prototype.starsTick.call(g);
    expect(toasts).toHaveLength(2);
    expect(toasts.find((x) => x.includes('Saut'))).toBe('⭐ Saut : Étoile a sa première étoile ! Elle ne pile plus devant les troncs.');
    expect(toasts.find((x) => x.includes('Vitesse'))).toBe('⭐ Vitesse : Étoile a sa première étoile !');
    expect(emits).toEqual([['⭐', 4], ['⭐', 4]]);
  });

  it('un cheval de 2 ans (trop jeune pour être monté) : son étoile de saut, sans parcours ouvert', () => {
    const a = horse({ id: 'h3', ageDays: 2 * 12 });
    const toasts = [];
    const g = { profile: { animals: [a] }, ui: { toast: (m) => toasts.push(m) }, entities: new Map() };
    a.skills.jump = 19;
    Game.prototype.starsTick.call(g);
    a.skills.jump = 41;
    Game.prototype.starsTick.call(g);
    expect(toasts).toEqual(['⭐ Saut : Étoile a maintenant 2 étoiles !']);
  });

  it('deux étoiles d\'un coup : une seule notée par petit mot ; l\'autre reste à fêter, même après avoir quitté', () => {
    const a = horse({ id: 'h4' });
    const toasts = [];
    const g = { profile: { animals: [a] }, ui: { toast: (m) => toasts.push(m) }, entities: new Map() };
    a.skills.jump = 19;
    a.skills.speed = 19;
    Game.prototype.starsTick.call(g);
    a.skills.jump = 21;
    a.skills.speed = 21;
    Game.prototype.starsTick.call(g);
    expect(toasts).toHaveLength(1);
    // (on quitte : la sauvegarde garde a.stars ; on revient, une autre partie du jeu)
    const back = JSON.parse(JSON.stringify(a));
    const g2 = { profile: { animals: [back] }, ui: { toast: (m) => toasts.push(m) }, entities: new Map() };
    Game.prototype.starsTick.call(g2);
    Game.prototype.starsTick.call(g2);
    expect(toasts).toHaveLength(2);
    expect(toasts.some((x) => x.includes('Saut')) && toasts.some((x) => x.includes('Vitesse'))).toBe(true);
  });
});

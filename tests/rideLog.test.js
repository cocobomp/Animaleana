// 🏇 « Ta balade » (src/sim/rideLog.js, src/ui/rideCard.js) : le carnet d'une balade libre, et la carte en descendant.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { RIDE_LOG, newRideLog, tickRideLog, rideReport, dayLeft, fmtDist } from '../src/sim/rideLog.js';
import { STAR_STEPS } from '../src/sim/horseStars.js';
import { POST } from '../src/sim/posting.js';
import { markHorseDay } from '../src/sim/horseDay.js';
import { createAnimal } from '../src/sim/animal.js';
import { seeded } from '../src/sim/rng.js';
import { RIDE_CARD_FR, RIDE_CARD_EN } from '../src/ui/rideCardTexts.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

const horse = (o = {}) => Object.assign(createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'f', ageDays: 2000, rng: seeded('balade') }), { name: 'Pomme' }, o);
// (il avance tout droit à sa vitesse ; la première image, dt 0, ne fait que poser où il est)
const run = (log, gait, speed, secs, p = { x: 0, z: 0 }) => {
  tickRideLog(log, gait, speed, 0, p);
  for (let k = 0; k < secs * 10; k++) {
    p.x += speed * 0.1;
    tickRideLog(log, gait, speed, 0.1, p);
  }
};
// (une balade d'une minute, au pas, au trot et au galop)
const ride = (a, stats = {}, session = null) => {
  const log = newRideLog(a, stats, session);
  run(log, 'walk', 1.6, 30);
  run(log, 'trot', 3, 20);
  run(log, 'canter', 5, 10);
  return log;
};

// (un tout petit DOM pour h() : src/ui/dom.js)
class El {
  constructor(tag) {
    const cls = new Set();
    Object.assign(this, { tag, children: [], style: {}, className: '', attrs: {}, on: {}, removed: false });
    this.classList = { add: (c) => cls.add(c), contains: (c) => cls.has(c) };
  }
  append(...c) { this.children.push(...c); }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, f) { this.on[k] = f; }
  getBoundingClientRect() { return {}; }
  remove() { this.removed = true; }
  get text() { return this.children.map((c) => (c instanceof El ? c.text : c.data)).join(' '); }
}
const find = (el, cls) => (el.className?.split(' ').includes(cls) ? el : el.children?.map((c) => c instanceof El && find(c, cls)).find(Boolean));
const fakeDom = () => {
  globalThis.Node = El;
  Object.assign(globalThis.document, { createElement: (tag) => new El(tag), createTextNode: (data) => ({ data }) });
};

describe('le carnet de balade', () => {
  it('le temps et la distance en mouvement ; le grand galop compte avec le galop ; l\'arrêt ne compte pas', () => {
    const log = newRideLog(horse());
    run(log, 'walk', 1.6, 10);
    run(log, 'gallop', 8, 5);
    run(log, 'canter', 5, 5);
    run(log, 'halt', 0, 20); // (immobile : il broute, on regarde le paysage)
    run(log, 'walk', 0.2, 5); // (il piétine sur place)
    expect(log.t).toBeCloseTo(20);
    expect(log.dist).toBeCloseTo(16 + 40 + 25);
    expect(log.gaits.walk).toBeCloseTo(10);
    expect(log.gaits.canter).toBeCloseTo(10);
    expect(log.gaits.trot).toBe(0);
  });

  it('la vitesse est plafonnée (un saut de place n\'est pas de la route)', () => {
    const log = newRideLog(horse());
    tickRideLog(log, 'canter', 5, 0.1, { x: 0, z: 0 });
    expect(log.dist).toBe(0); // (la première image : où il est, rien à compter)
    tickRideLog(log, 'canter', 5, 0.5, { x: 200, z: 0 });
    expect(log.dist).toBe(RIDE_LOG.maxSpeed * 0.5);
    // (pas de temps qui passe, en gestion ou un voyage : il change de place sans rien compter)
    tickRideLog(log, 'canter', 5, 0, { x: -300, z: 40 });
    tickRideLog(log, 'canter', 5, 0.1, { x: -300, z: 40.5 });
    expect(log.dist).toBeCloseTo(RIDE_LOG.maxSpeed * 0.5 + 0.5);
  });

  it('contre une barrière, il galope sur place : ni temps ni distance ; le long d\'elle, le chemin vraiment fait', () => {
    const log = newRideLog(horse());
    const p = { x: 10, z: 10 };
    for (let k = 0; k < 300; k++) tickRideLog(log, 'canter', 6, 0.1, p); // (30 s, la tête dans la barrière)
    expect(log.t).toBe(0);
    expect(log.dist).toBe(0);
    for (let k = 0; k < 100; k++) {
      p.z += 0.2; // (il glisse le long d'elle : 2 m/s, pas 6)
      tickRideLog(log, 'canter', 6, 0.1, p);
    }
    expect(log.t).toBeCloseTo(10);
    expect(log.dist).toBeCloseTo(20);
    expect(log.gaits.canter).toBeCloseTo(10);
  });

  it('il va tout seul où on a touché : l\'allure d\'après sa vitesse (pas l\'allure choisie avant)', () => {
    const log = newRideLog(horse());
    run(log, null, 12, 10); // (loin : il y va au galop)
    run(log, null, 3, 5);
    run(log, null, 1.6, 5);
    expect(log.gaits).toEqual({ walk: expect.closeTo(5), trot: expect.closeTo(5), canter: expect.closeTo(10) });
  });

  it('jamais pour un cheval qu\'on te confie', () => {
    expect(newRideLog(horse({ client: { id: 'x' } }))).toBeNull();
    expect(newRideLog(horse({ guest: true }))).toBeNull();
  });

  it('pas de carte sous 40 s, ni quand une activité ou un voyage l\'a mené', () => {
    const a = horse();
    const short = newRideLog(a);
    run(short, 'walk', 1.6, RIDE_LOG.minTime - 1);
    expect(rideReport(short, { a }).show).toBe(false);
    const led = ride(a);
    led.skip = true;
    expect(rideReport(led, { a }).show).toBe(false);
    expect(rideReport(ride(a), { a }).show).toBe(true);
  });

  it('la carte : minutes, distance et parts des allures', () => {
    const a = horse();
    const r = rideReport(ride(a), { a });
    expect(r.min).toBe(1);
    expect(r.dist).toBeCloseTo(48 + 60 + 50);
    expect(r.share.walk).toBeCloseTo(0.5);
    expect(r.share.trot).toBeCloseTo(1 / 3);
    expect(r.share.canter).toBeCloseTo(1 / 6);
  });

  it('ce qui s\'est passé : seulement ce qui a changé, 3 lignes au plus', () => {
    const a = horse();
    const s0 = { freeJumps: 4, crossDone: 1, luckyShoes: 2, pumpkins: 0 };
    let r = rideReport(ride(a, s0), { a, stats: { ...s0, freeJumps: 7 } });
    expect(r.lines).toEqual([{ key: 'rc_jumps', n: 3 }]);
    r = rideReport(ride(a, s0), { a, stats: { ...s0 } });
    expect(r.lines).toEqual([]);
    r = rideReport(ride(a, s0), { a, stats: { freeJumps: 9, crossDone: 2, luckyShoes: 3, pumpkins: 2 }, postBest: 12 });
    expect(r.lines.map((l) => l.key)).toEqual(['rc_jumps', 'rc_cross', 'rc_shoe']);
    // (une stat qui n'existait pas encore au départ : comptée depuis 0)
    r = rideReport(ride(a, {}), { a, stats: { pumpkins: 1 }, postBest: POST.statAt });
    expect(r.lines).toEqual([{ key: 'rc_pumpkins', n: 1 }, { key: 'rc_post', n: POST.statAt }]);
    expect(rideReport(ride(a), { a, postBest: POST.statAt - 1 }).lines).toEqual([]);
  });

  it('les tampons : la détente (pas s\'il était déjà chaud), le retour au calme, « Comme au club » avec les deux', () => {
    const a = horse();
    const done = { warm: true, started: true };
    let r = rideReport(ride(a), { a, session: done, verdict: 'cooled' });
    expect(r.stamps).toEqual({ warm: true, cool: 'cooled', pro: true });
    r = rideReport(ride(a), { a, session: done, verdict: 'hot' });
    expect(r.stamps).toEqual({ warm: true, cool: 'hot', pro: false });
    r = rideReport(ride(a), { a, session: { warm: false, started: true }, verdict: 'cooled' });
    expect(r.stamps).toEqual({ warm: false, cool: 'cooled', pro: false });
    // (il venait de travailler : déjà chaud en montant, la détente n'est pas à toi)
    r = rideReport(ride(a, {}, { warm: true }), { a, session: done, verdict: 'cooled' });
    expect(r.stamps).toEqual({ warm: false, cool: 'cooled', pro: false });
    // (au pas seulement : rien à tamponner)
    r = rideReport(ride(a), { a, session: { warm: true, started: false } });
    expect(r.stamps).toEqual({ warm: false, cool: null, pro: false });
  });

  it('l\'étoile : la compétence qui a le plus grandi, et ce qui manque d\'après les paliers', () => {
    const a = horse();
    Object.assign(a.skills, { speed: 30, endurance: 50, jump: 18 });
    const log = ride(a);
    a.skills.speed += 0.03; // (trop peu pour en parler)
    a.skills.endurance += 0.06;
    a.skills.jump += 0.6; // (des troncs)
    let r = rideReport(log, { a });
    expect(r.star).toMatchObject({ id: 'jump', icon: '⤴️', next: 1, toNext: Math.ceil(STAR_STEPS[0] - 18.6) });
    expect(r.star.fill).toBeCloseTo(18.6 / STAR_STEPS[0]);
    const log2 = ride(a);
    a.skills.endurance += 0.1;
    r = rideReport(log2, { a });
    expect(r.star).toMatchObject({ id: 'endurance', next: 3, toNext: Math.ceil(STAR_STEPS[2] - a.skills.endurance) });
    expect(r.star.fill).toBeCloseTo((a.skills.endurance - STAR_STEPS[1]) / (STAR_STEPS[2] - STAR_STEPS[1]));
    // (presque là : « encore 1 point », jamais 0)
    a.skills.endurance = STAR_STEPS[2] - 0.2;
    const log3 = ride(a);
    a.skills.endurance += 0.1;
    expect(rideReport(log3, { a }).star.toNext).toBe(1);
    // rien n'a assez grandi, ou toutes les étoiles : pas de ligne
    expect(rideReport(ride(a), { a }).star).toBeNull();
    a.skills.dressage = 99.5;
    const log4 = ride(a);
    a.skills.dressage = 100; // (la 5e étoile : il n'y en a plus après)
    expect(rideReport(log4, { a }).star).toBeNull();
  });

  it('sa plus longue balade : notée la première fois sans rien dire, puis un record au-dessus, dès 200 m', () => {
    const a = horse();
    const long = (m) => { const log = ride(a); log.dist = m; return rideReport(log, { a }); };
    expect(long(150).best).toBe(false);
    expect(a.rideBest).toBe(150);
    expect(long(180).best).toBe(false); // (plus long, mais pas une vraie balade)
    expect(a.rideBest).toBe(180);
    expect(long(1400).best).toBe(true);
    expect(a.rideBest).toBe(1400);
    expect(long(1400.3).best).toBe(false);
    expect(long(900).best).toBe(false);
    expect(a.rideBest).toBe(1400);
    const b = horse();
    const log = ride(b);
    log.dist = 2000;
    expect(rideReport(log, { a: b }).best).toBe(false); // (sa première balade mesurée : rien à battre)
    expect(b.rideBest).toBe(2000);
  });

  it('sa journée : ce qui manque, « parfaite », ou rien si le foin du matin est oublié ; desseller après un galop', () => {
    const a = horse();
    const day = 3;
    for (const k of ['feed', 'water', 'brush', 'ride']) markHorseDay(a, k, 9, day);
    expect(dayLeft(a, day, 10)).toEqual(['🌇', '❤️']);
    let r = rideReport(ride(a), { a, left: dayLeft(a, day, 10) });
    expect(r).toMatchObject({ left: ['🌇', '❤️'], perfect: false });
    markHorseDay(a, 'pet', 15, day);
    markHorseDay(a, 'feed', 15, day);
    r = rideReport(ride(a), { a, left: dayLeft(a, day, 15) });
    expect(r).toMatchObject({ left: null, perfect: true });
    const late = horse();
    markHorseDay(late, 'ride', 15, day);
    expect(dayLeft(late, day, 15)).toBeNull();
    expect(rideReport(ride(late), { a: late, left: null })).toMatchObject({ left: null, perfect: false });
    expect(rideReport(ride(a), { a, worked: true, saddled: true }).unsaddle).toBe(true);
    expect(rideReport(ride(a), { a, worked: true, saddled: false }).unsaddle).toBe(false);
    expect(rideReport(ride(a), { a, worked: false, saddled: true }).unsaddle).toBe(false);
  });

  it('les distances : « 350 m », « 1,4 km » (« 1.4 km » en anglais), « 1 km »', () => {
    expect(fmtDist(347)).toBe('350 m');
    expect(fmtDist(1400)).toBe('1,4 km');
    expect(fmtDist(1400, 'en')).toBe('1.4 km');
    expect(fmtDist(996)).toBe('1 km');
    expect(fmtDist(0)).toBe('0 m');
  });

  it('les textes : français et anglais, au singulier, au féminin', () => {
    const { t, setLang } = i18n;
    for (const k of Object.keys(RIDE_CARD_FR).filter((x) => !x.endsWith('_f'))) expect(RIDE_CARD_EN[k], k).toBeTruthy();
    for (const k of Object.keys(RIDE_CARD_EN)) expect(RIDE_CARD_FR[k], k).toBeTruthy();
    setLang('fr');
    expect(t('rc_jumps', { n: 1 })).toBe('⤴️ 1 tronc sauté');
    expect(t('rc_jumps', { n: 3 })).toBe('⤴️ 3 troncs sautés');
    expect(t('rc_star', { icon: '💪', n: 2, k: 2 })).toBe('💪 Encore 2 points pour sa 2e étoile');
    expect(t('rc_star_first', { icon: '⤴️', n: 1, k: 1 })).toBe('⤴️ Encore 1 point pour sa 1re étoile');
    expect(t('rc_unsaddle', { g: 'f' })).toBe('🧰 Desselle-la : elle veut se rouler');
    expect(t('rc_unsaddle', { g: 'm' })).toBe('🧰 Desselle-le : il veut se rouler');
    setLang('en');
    expect(t('rc_pumpkins', { n: 1 })).toBe('🎃 1 pumpkin found');
    expect(t('rc_unsaddle', { g: 'f' })).toBe('🧰 Untack: time for a roll!');
    setLang('fr');
  });
});

describe('la carte à l\'écran', () => {
  it('le temps, la distance en français, les allures ; un toucher la ferme, une seule à la fois, partie après 8 s', async () => {
    fakeDom();
    vi.useFakeTimers();
    const { showRideCard } = await import('../src/ui/rideCard.js');
    i18n.setLang('fr');
    const a = horse({ sex: 'm' });
    a.rideBest = 300;
    const log = ride(a);
    Object.assign(log, { t: 130, dist: 1400, gaits: { walk: 60, trot: 40, canter: 30 } });
    const rep = rideReport(log, { a, session: { warm: true, started: true }, verdict: 'cooled', left: ['❤️'], worked: true, saddled: true });
    const ui = { root: new El('div') };
    const el = showRideCard(ui, rep, a);
    expect(ui.root.children).toEqual([el]);
    expect(el.attrs.role).toBe('status');
    const text = el.text;
    for (const s of ['🏇 Belle balade avec Pomme !', '⏱️ 2 min · 📏 1,4 km', '✅ Détente', '✅ Retour au calme', '🏅 Comme au club !', '📏 Sa plus longue balade !', 'Pour sa journée parfaite : ❤️', '🧰 Desselle-le : il veut se rouler']) {
      expect(text).toContain(s);
    }
    const bar = find(el, 'rc-bar');
    expect(bar.children.map((s) => s.style.width)).toEqual(['46%', '31%', '23%']);
    expect(bar.children.map((s) => s.children.length)).toEqual([1, 1, 1]);
    // (une autre carte arrive : la première s'en va)
    const el2 = showRideCard(ui, rep, a);
    expect(el.classList.contains('out')).toBe(true);
    vi.advanceTimersByTime(400);
    expect(el.removed).toBe(true);
    // un toucher la ferme
    el2.on.click();
    vi.advanceTimersByTime(400);
    expect(el2.removed).toBe(true);
    // toute seule après 8 s
    const el3 = showRideCard(ui, rep, a);
    vi.advanceTimersByTime(7900);
    expect(el3.removed).toBe(false);
    vi.advanceTimersByTime(500);
    expect(el3.removed).toBe(true);
    // pas de carte à montrer : rien
    expect(showRideCard(ui, { show: false }, a)).toBeNull();
    vi.useRealTimers();
  });
});

describe('en descendant (Game.dismount)', () => {
  let Game;
  beforeAll(async () => {
    ({ Game } = await import('../src/game/Game.js'));
  }, 60000);

  // (un jeu pour de faux : un cheval sellé qui a galopé, puis marché au pas avant qu'on descende)
  const fakeGame = (a, log) => {
    const toasts = [];
    const root = { children: [], append(c) { this.children.push(c); } };
    const g = Object.create(Game.prototype);
    const e = { data: a, emit() {} };
    Object.assign(g, {
      toasts, rideLog: log,
      profile: { clock: 600, tutorial: { done: true }, stats: {}, animals: [a] },
      player: { mount: e, cantered: true, gaitEnabled: true, session: { walk: 20, warm: true, started: true, hard: 10, cool: 20 }, posting: { best: 0 }, dismount() { this.mount = null; } },
      tripFlow: { active: false },
      ui: { root, toast: (m) => toasts.push(m), updateGaitPad() {} },
      remember() {}, bondNews() {},
    });
    return g;
  };

  it('une vraie balade : la carte, à la place de « Retour au calme » et « Desseller » ; le lien du retour au calme reste', () => {
    i18n.setLang('fr');
    const a = horse({ gear: { saddle: { item: 'saddle' } }, bond: 10 });
    const log = newRideLog(a);
    Object.assign(log, { t: 130, dist: 1400, gaits: { walk: 60, trot: 40, canter: 30 } });
    fakeDom();
    const g = fakeGame(a, log);
    Game.prototype.dismount.call(g);
    expect(g.ui.root.children).toHaveLength(1);
    expect(g.ui.root.children[0].text).toContain('1,4 km');
    expect(g.toasts).toEqual([]);
    expect(a.bond).toBe(10.5);
    expect(a.rideBest).toBe(1400);
    expect(g.rideLog).toBeNull();
  });

  it('une activité commence en selle (agility, spectacle, dressage…) : elle nous fait descendre, pas de carte, les petits mots d\'avant', async () => {
    i18n.setLang('fr');
    const { Activities, SESSION_TYPES } = await import('../src/game/Activities.js');
    const a = horse({ gear: { saddle: { item: 'saddle' } } });
    const log = newRideLog(a);
    Object.assign(log, { t: 130, dist: 1400, gaits: { walk: 60, trot: 40, canter: 30 } });
    const g = fakeGame(a, log);
    Object.assign(g.ui, { closePanel() {} });
    g.stopFollowers = () => {};
    g.activities = new Activities(g);
    // (comme les vraies séances : le constructeur fait descendre, avant que la séance soit active)
    SESSION_TYPES.rcTest = { cls: class { constructor(mgr) { this.ok = true; mgr.game.dismount(); } } };
    try {
      expect(g.activities.start('rcTest')).toBeTruthy();
    } finally {
      delete SESSION_TYPES.rcTest;
    }
    expect(g.ui.root.children).toHaveLength(0);
    expect(g.toasts).toEqual([i18n.t('ride_cooled', { name: 'Pomme', g: 'f' }), i18n.t('ride_unsaddle', { name: 'Pomme', g: 'f' })]);
    expect(g.activities.starting).toBe(false);
    expect(g.rideLog).toBeNull();
  });

  it('une balade de 10 s : pas de carte, les petits mots d\'avant', () => {
    i18n.setLang('fr');
    const a = horse({ gear: { saddle: { item: 'saddle' } } });
    const log = newRideLog(a);
    run(log, 'walk', 1.6, 10);
    const g = fakeGame(a, log);
    Game.prototype.dismount.call(g);
    expect(g.ui.root.children).toHaveLength(0);
    expect(g.toasts).toEqual([i18n.t('ride_cooled', { name: 'Pomme', g: 'f' }), i18n.t('ride_unsaddle', { name: 'Pomme', g: 'f' })]);
    expect(a.rideBest).toBeUndefined();
  });
});

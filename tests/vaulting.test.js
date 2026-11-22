import { describe, it, expect } from 'vitest';
import { createAnimal } from '../src/sim/animal.js';
import { createProfile, migrate } from '../src/sim/profile.js';
import { DAYS_PER_YEAR } from '../src/sim/time.js';
import { SPECIES } from '../src/sim/species.js';
import { GEAR, TACK_CATEGORIES, equip, buyGear, wears, freeStock } from '../src/sim/gear.js';
import {
  VAULT_LEVELS, LEVEL_IDS, FIGURES, PROGRAM, CIRCLE_R, onCircle, tapError, tapQuality, tapGrade, TAP_LATENCY, BALANCE_ZONE, balancePush, balanceAmp,
  leanOf, balanceScore, horseCalm, figureMark, judgesMarks, figureScore, judgeComment, vaultResult, vaultBlock, vaultData,
  canterUnlocked, CANTER_UNLOCK, figuresOnHorse, recordVault, vaultHorseEffect,
} from '../src/sim/vaulting.js';
import { practiceAward } from '../src/sim/activities.js';
import { seeded } from '../src/sim/rng.js';
import { OBJECTIVES } from '../src/sim/objectives.js';
import { VAULT_FR, VAULT_EN } from '../src/ui/vaultingTexts.js';

const horse = (extra = {}) => ({ ...createAnimal({ species: 'horse', breed: 'selle_francais', ageDays: 8 * DAYS_PER_YEAR }), ...extra });

/** Un cheval prêt pour la voltige : filet, surfaix, tapis (achetés en bac à sable). */
function readyHorse(p, extra = {}) {
  const a = horse(extra);
  p.animals.push(a);
  for (const id of ['surcingle', 'vaultPad', 'bridle']) expect(buyGear(p, id, 'horse').ok).toBe(true);
  expect(equip(p, a, 'bridle').ok).toBe(true);
  expect(equip(p, a, 'vaultPad').ok).toBe(true);
  expect(equip(p, a, 'surcingle').ok).toBe(true);
  return a;
}

describe('le cercle de voltige', () => {
  it('le cheval tourne à main gauche : son flanc gauche (le voltigeur) regarde le centre', () => {
    const c = { x: 3, z: -2 };
    for (const h of [0, 0.7, 2, 4]) {
      const p = onCircle(c, h);
      expect(Math.hypot(p.x - c.x, p.z - c.z)).toBeCloseTo(CIRCLE_R, 6);
      // gauche du cheval : (cos h, −sin h) ; elle pointe vers le centre
      const left = { x: Math.cos(h), z: -Math.sin(h) };
      const toC = { x: (c.x - p.x) / CIRCLE_R, z: (c.z - p.z) / CIRCLE_R };
      expect(left.x * toC.x + left.z * toC.z).toBeCloseTo(1, 6);
      // en avançant (cap h), il reste sur le cercle
      const dt = 1e-4;
      const q = onCircle(c, h + dt);
      const dir = { x: (q.x - p.x) / (CIRCLE_R * dt), z: (q.z - p.z) / (CIRCLE_R * dt) };
      expect(dir.x).toBeCloseTo(Math.sin(h), 3);
      expect(dir.z).toBeCloseTo(Math.cos(h), 3);
    }
  });

  it('un vrai cercle de voltige : au moins 15 m de diamètre', () => {
    expect(CIRCLE_R * 2).toBeGreaterThanOrEqual(15);
  });
});

describe('le programme et les niveaux', () => {
  it('les six figures imposées, dans l\'ordre', () => {
    expect(PROGRAM).toEqual(['basicSeat', 'flag', 'mill', 'scissors', 'stand', 'flank']);
    expect(FIGURES.mill.parts).toBe(4); // le moulin se fait en quatre temps
    expect(FIGURES.scissors.parts).toBe(2);
    expect(FIGURES.stand.hold && FIGURES.flag.hold && FIGURES.basicSeat.hold).toBe(true);
    // debout : l'équilibre le plus difficile
    expect(FIGURES.stand.balance).toBeGreaterThan(FIGURES.flag.balance);
    expect(FIGURES.flag.balance).toBeGreaterThan(FIGURES.basicSeat.balance);
  });

  it('le tonneau est le plus facile, puis le pas, puis le galop', () => {
    expect(LEVEL_IDS).toEqual(['barrel', 'walk', 'canter']);
    expect(VAULT_LEVELS.barrel.horse).toBe(false);
    for (const k of [0, 1]) {
      expect(VAULT_LEVELS.barrel.tol[k]).toBeGreaterThan(VAULT_LEVELS.walk.tol[k]);
      expect(VAULT_LEVELS.walk.tol[k]).toBeGreaterThan(VAULT_LEVELS.canter.tol[k]);
    }
    expect(VAULT_LEVELS.barrel.wobble).toBeLessThan(VAULT_LEVELS.canter.wobble);
  });
});

/** Note moyenne d'une figure non tenue pour une enfant qui touche à ±sigma s, reçue lat s plus tard (au hasard si
 * sigma vaut null), sur 4000 touchers tirés toujours de la même façon. Le jeu retire TAP_LATENCY (fix : sans). */
function childMark(level, sigma, lat, fix = TAP_LATENCY) {
  const r = seeded(`enfant-${level}-${sigma}-${lat}`);
  const randn = () => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
  const stride = { barrel: 1.25, walk: 1.1, canter: 0.62 }[level];
  let sum = 0;
  for (let i = 0; i < 4000; i++) {
    const at = sigma === null ? r() * stride : sigma * randn() + lat;
    const q = tapQuality(tapError((at - fix) / stride, stride), level);
    sum += figureMark({ timing: q, calm: 0.45 });
  }
  return sum / 4000;
}

describe('toucher en rythme', () => {
  it('le bon moment est le début de la foulée (juste avant ou juste après)', () => {
    expect(tapError(0, 0.6)).toBe(0);
    expect(tapError(0.1, 0.6)).toBeCloseTo(0.06, 9); // en retard
    expect(tapError(0.9, 0.6)).toBeCloseTo(-0.06, 9); // en avance
    expect(tapError(1.1, 0.6)).toBeCloseTo(0.06, 9); // (phase prise modulo 1)
    expect(tapQuality(0)).toBe(1);
    expect(tapQuality(0.05)).toBe(1); // (tout près : parfait)
    expect(tapQuality(-0.05)).toBe(1);
    expect(tapQuality(0.15)).toBeGreaterThan(tapQuality(0.2));
    expect(tapQuality(0.3, 'canter')).toBe(0);
  });

  it('la tolérance est en secondes : le galop, plus rapide, ne demande pas une précision de 37 ms', () => {
    // au galop : « parfait » jusqu'à 80 ms d'écart, « bien » encore à 150 ms
    expect(tapGrade(0.08, 'canter')).toBe('perfect');
    expect(tapGrade(0.15, 'canter')).toBe('good');
    expect(tapQuality(0.2, 'barrel')).toBeGreaterThan(tapQuality(0.2, 'canter'));
  });

  it('ce qu\'on dit : parfait, bien, un peu tôt, un peu tard', () => {
    expect(tapGrade(0.02)).toBe('perfect');
    expect(tapGrade(0.13)).toBe('good');
    expect(tapGrade(0.24)).toBe('late'); // après le temps
    expect(tapGrade(-0.24)).toBe('early'); // avant
  });

  it('une enfant au téléphone, un peu en retard (80 ms), a une bonne note au galop', () => {
    expect(childMark('canter', 0.1, 0.08)).toBeGreaterThanOrEqual(8); // (le succès « 8/10 au galop » est atteignable)
    expect(childMark('canter', 0.15, 0.08)).toBeGreaterThanOrEqual(6.5);
    expect(childMark('walk', 0.15, 0.08)).toBeGreaterThanOrEqual(7.5);
    expect(childMark('barrel', 0.15, 0.08)).toBeGreaterThanOrEqual(8);
    // le retard du tactile est corrigé : sans la correction, c'était moins bien
    expect(childMark('canter', 0.1, 0.08)).toBeGreaterThan(childMark('canter', 0.1, 0.08, 0) + 0.2);
  });

  it('toucher n\'importe quand ne suffit pas : le rythme compte vraiment', () => {
    for (const level of LEVEL_IDS) {
      expect(childMark(level, null, 0), level).toBeLessThan(6);
      expect(childMark(level, 0.1, 0.08) - childMark(level, null, 0), level).toBeGreaterThan(2.5);
    }
  });
});

/**
 * Note d'équilibre moyenne (20 figures) d'une enfant qui voit la bulle `delay` s en retard et glisse le doigt à la
 * vitesse `gain` × penché (gain 0 : elle ne fait rien). Même modèle que la relecture du jeu.
 */
function childBalance(level, fig, delay, gain) {
  const amp = balanceAmp(level, fig, level === 'barrel' ? 1 : 0.45);
  const len = VAULT_LEVELS[level].hold * { barrel: 1.25, walk: 1.1, canter: 0.62 }[level];
  let tot = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const leans = [];
    let control = 0;
    const dt = 1 / 30;
    for (let t = 0; t < len; t += dt) {
      leans.push(leanOf(balancePush(t, amp, seed, len), control));
      const seen = leans[Math.max(0, leans.length - 1 - Math.round(delay / dt))];
      if (Math.abs(seen) > BALANCE_ZONE * 0.5) control -= seen * gain * dt;
    }
    tot += balanceScore(leans);
  }
  return tot / 20;
}

describe('garder l\'équilibre', () => {
  it('la poussée est lisse, bornée, part du milieu, et la même pour une même figure', () => {
    const amp = balanceAmp('canter', 'stand', 0.5);
    expect(balancePush(0, amp, 3, 3)).toBeCloseTo(0, 9);
    let prev = 0;
    for (let t = 0.05; t < 3; t += 0.05) {
      const p = balancePush(t, amp, 3, 3);
      expect(Math.abs(p)).toBeLessThanOrEqual(amp + 1e-9);
      expect(Math.abs(p - prev)).toBeLessThan(0.25); // pas d'à-coup d'une image à l'autre
      prev = p;
    }
    expect(balancePush(1.3, amp, 3, 3)).toBe(balancePush(1.3, amp, 3, 3));
    // elle sort bien de la zone verte : il faut glisser le doigt
    const peak = Math.max(...Array.from({ length: 60 }, (_, i) => Math.abs(balancePush(i * 0.05, amp, 3, 3))));
    expect(peak).toBeGreaterThan(BALANCE_ZONE * 2.5);
  });

  it('debout au galop pousse plus que l\'assise sur le tonneau ; un cheval calme pousse moins', () => {
    expect(balanceAmp('canter', 'stand')).toBeGreaterThan(balanceAmp('barrel', 'basicSeat'));
    expect(balanceAmp('canter', 'flag', 1)).toBeLessThan(balanceAmp('canter', 'flag', 0));
  });

  it('glisser le doigt du bon côté ramène la bulle au milieu', () => {
    expect(leanOf(0.6, -0.6)).toBe(0);
    expect(Math.abs(leanOf(0.6, -0.4))).toBeLessThan(Math.abs(leanOf(0.6, 0)));
  });

  it('bien tenu : note d\'équilibre parfaite ; sans rien faire : moins bien ; tout penché : zéro', () => {
    const amp = balanceAmp('canter', 'stand', 0.3);
    const good = [];
    const none = [];
    for (let t = 0; t < 3; t += 1 / 30) {
      const push = balancePush(t, amp, 8, 3);
      good.push(leanOf(push, -push * 0.95));
      none.push(leanOf(push, 0));
    }
    expect(balanceScore(good)).toBe(1);
    expect(balanceScore(none)).toBeLessThan(0.5);
    expect(balanceScore([1.2, -1.2, 1])).toBe(0);
    expect(balanceScore([BALANCE_ZONE * 1.5])).toBeGreaterThan(0);
    expect(balanceScore([])).toBe(1);
  });

  it('le geste compte à tous les niveaux : sans rien faire, moins bien ; une enfant lente, mieux ; attentive, bien', () => {
    for (const level of LEVEL_IDS) {
      for (const fig of ['basicSeat', 'flag', 'stand']) {
        const none = childBalance(level, fig, 0, 0);
        const slow = childBalance(level, fig, 0.6, 1.2);
        const quick = childBalance(level, fig, 0.35, 2.5);
        expect(none, `${level} ${fig}`).toBeLessThan(0.8);
        expect(slow, `${level} ${fig}`).toBeGreaterThanOrEqual(none);
        expect(quick - none, `${level} ${fig}`).toBeGreaterThan(0.2);
        expect(quick, `${level} ${fig}`).toBeGreaterThan(0.6);
      }
    }
    // le tonneau et le pas, où l'on passe le plus de temps : ne rien faire n'y est plus presque parfait
    expect(childBalance('barrel', 'stand', 0, 0)).toBeLessThan(0.6);
    expect(childBalance('walk', 'flag', 0, 0)).toBeLessThan(0.6);
  });
});

describe('les notes des juges', () => {
  it('une figure parfaite vaut 10, une figure ratée au moins 1, par demi-points', () => {
    expect(figureMark({ timing: 1, balance: 1, calm: 1 })).toBe(10);
    expect(figureMark({ timing: 0, balance: 0, calm: 0 })).toBe(1);
    const m = figureMark({ timing: 0.63, balance: 0.41, calm: 0.4 });
    expect(m * 2).toBe(Math.round(m * 2));
    // l'équilibre compte plus que le rythme pour une figure tenue
    expect(figureMark({ timing: 0.2, balance: 1 })).toBeGreaterThan(figureMark({ timing: 1, balance: 0.2 }));
    // sans figure tenue (le moulin) : seul le rythme compte
    expect(figureMark({ timing: 1, balance: null, calm: 1 })).toBe(10);
  });

  it('trois juges, à un demi-point près, toujours les mêmes ; la note retenue est leur moyenne', () => {
    const marks = judgesMarks(7.5, 'x');
    expect(marks).toHaveLength(3);
    for (const m of marks) {
      expect(Math.abs(m - 7.5)).toBeLessThanOrEqual(0.5);
      expect(m).toBeGreaterThanOrEqual(0);
      expect(m).toBeLessThanOrEqual(10);
    }
    expect(judgesMarks(7.5, 'x')).toEqual(marks);
    expect(figureScore([7, 7.5, 8])).toBe(7.5);
    expect(figureScore([10, 9.5, 10])).toBe(9.8);
    expect(judgesMarks(10, 'y').every((m) => m <= 10)).toBe(true);
  });

  it('le mot de la juge dit ce qui a manqué', () => {
    expect(judgeComment(9.5)).toBe('perfect');
    expect(judgeComment(5, { timing: 0.9, balance: 0.2 })).toBe('balance');
    expect(judgeComment(4, { timing: 0.2, balance: null })).toBe('rhythm');
    expect(judgeComment(7.5, { timing: 0.8, balance: 0.8 })).toBe('good');
    expect(judgeComment(2, { timing: 0.6, balance: 0.6 })).toBe('keepGoing');
  });

  it('le résultat : la moyenne des figures, les étoiles, la meilleure et la moins bonne', () => {
    const figs = PROGRAM.map((id, i) => ({ id, score: 6 + i * 0.5, marks: [6, 6, 6], comment: 'ok' }));
    const r = vaultResult(figs);
    expect(r.score).toBe(7.25);
    expect(r.points).toBe(r.score);
    expect(r.stars).toBe(2);
    expect(r.best.id).toBe('flank');
    expect(r.worst.id).toBe('basicSeat');
    expect(vaultResult(figs.map((f) => ({ ...f, score: 9 }))).stars).toBe(3);
    expect(vaultResult(figs.map((f) => ({ ...f, score: 4 }))).stars).toBe(1);
    expect(vaultResult([]).stars).toBe(1);
  });

  it('un cheval obéissant est calme à la longe ; le tonneau ne bouge jamais', () => {
    expect(horseCalm(null)).toBe(1);
    expect(horseCalm(horse({ skills: { obedience: 80 } }))).toBeCloseTo(0.8);
  });
});

describe('qui peut faire de la voltige ?', () => {
  it('le tonneau : toujours, même sans cheval', () => {
    expect(vaultBlock(null, 'barrel')).toBeNull();
    expect(vaultBlock(horse({ sick: 'flu' }), 'barrel')).toBeNull();
  });

  it('un cheval prêt : surfaix, tapis, filet, adulte, en forme', () => {
    const p = createProfile('Lina');
    const a = readyHorse(p);
    expect(vaultBlock(a, 'walk', p)).toBeNull();
    expect(wears(a, 'saddle')).toBe(false);
  });

  it('trop jeune, malade, blessé, boiteux, fatigué : non, et on dit pourquoi', () => {
    const p = createProfile('Lina');
    const young = readyHorse(p, { ageDays: (SPECIES.horse.rideYears - 1) * DAYS_PER_YEAR });
    expect(vaultBlock(young, 'walk', p)).toBe('tooYoung');
    expect(vaultBlock(readyHorse(p, { sick: 'flu' }), 'walk', p)).toBe('sick');
    expect(vaultBlock(readyHorse(p, { lame: { cause: 'stone', foot: 1, hours: 0 } }), 'walk', p)).toBe('lame');
    const tired = readyHorse(p);
    tired.needs.energy = 15;
    expect(vaultBlock(tired, 'walk', p)).toBe('tired');
    for (const why of ['tooYoung', 'sick', 'hurt', 'lame', 'tired', 'pregnant', 'noSurcingle', 'noVaultPad', 'needBridle', 'canterLocked', 'notHorse']) {
      expect(VAULT_FR[`vt_why_${why}`], why).toBeTruthy();
      expect(VAULT_EN[`vt_why_${why}`], why).toBeTruthy();
    }
  });

  it('sans surfaix ou sans tapis de voltige : non ; un chien non plus', () => {
    const p = createProfile('Lina');
    const a = horse();
    p.animals.push(a);
    equip(p, a, 'bridle');
    expect(vaultBlock(a, 'walk', p)).toBe('noSurcingle');
    buyGear(p, 'surcingle', 'horse');
    equip(p, a, 'surcingle');
    expect(vaultBlock(a, 'walk', p)).toBe('noVaultPad');
    expect(vaultBlock(createAnimal({ species: 'dog', ageDays: 40 }), 'walk', p)).toBe('notHorse');
  });

  it('le galop vient après une bonne note au pas', () => {
    const p = createProfile('Lina');
    const a = readyHorse(p);
    expect(canterUnlocked(p)).toBe(false);
    expect(vaultBlock(a, 'canter', p)).toBe('canterLocked');
    vaultData(p).best.walk = CANTER_UNLOCK;
    expect(vaultBlock(a, 'canter', p)).toBeNull();
  });
});

describe('le matériel de voltige à la sellerie', () => {
  it('le surfaix et le tapis : dans leur rayon, avec un prix, pour les chevaux de toutes tailles', () => {
    const cat = TACK_CATEGORIES.find((c) => c.id === 'vaulting');
    expect(cat.items).toEqual(['surcingle', 'vaultPad']);
    for (const id of cat.items) {
      expect(GEAR[id].price).toBeGreaterThan(0);
      expect(GEAR[id].species).toEqual(['horse']);
      expect(GEAR[id].sizes).toEqual(['pony', 'horse', 'draft']);
    }
    expect(GEAR.vaultPad.slot).toBe('pad'); // un tapis
  });

  it('le surfaix prend la place de la selle (et inversement) : elle retourne à la sellerie', () => {
    const p = createProfile('Lina');
    const a = horse();
    p.animals.push(a);
    expect(equip(p, a, 'saddle').ok).toBe(true);
    buyGear(p, 'surcingle', 'horse');
    expect(equip(p, a, 'surcingle').ok).toBe(true);
    expect(a.gear.saddle).toBeUndefined();
    expect(a.lastSaddle.item).toBe('saddle');
    expect(freeStock(p, 'saddle', 'horse')).toBe(1); // (rangée)
    expect(equip(p, a, 'saddle').ok).toBe(true);
    expect(a.gear.surcingle).toBeUndefined();
    expect(freeStock(p, 'surcingle', 'horse')).toBe(1);
  });
});

describe('progrès, récompenses et effets', () => {
  it('meilleures notes, galop débloqué, figures réussies à cheval', () => {
    const p = createProfile('Lina');
    const figs = (s) => PROGRAM.map((id) => ({ id, score: s, marks: [s, s, s], comment: 'ok' }));
    let r = recordVault(p, 'barrel', vaultResult(figs(9)));
    expect(r.record).toBe(true);
    expect(figuresOnHorse(p)).toEqual([]); // le tonneau ne compte pas pour « sur un cheval »
    r = recordVault(p, 'walk', vaultResult(figs(6.5)));
    expect(r.unlockedCanter).toBe(true);
    expect(r.newFigures).toEqual(PROGRAM);
    expect(figuresOnHorse(p)).toEqual(PROGRAM);
    r = recordVault(p, 'walk', vaultResult(figs(5)));
    expect(r.record).toBe(false);
    expect(vaultData(p).sessions).toBe(3);
    expect(vaultData(p).best.walk).toBe(6.5);
  });

  it('le cheval se dépense, devient plus calme à la longe ; rien sur le tonneau', () => {
    const a = horse();
    a.needs.energy = 90;
    const ob = a.skills.obedience;
    const fx = vaultHorseEffect(a, 'canter', 0.8);
    expect(a.needs.energy).toBe(76);
    expect(a.skills.obedience).toBe(ob + 2);
    expect(fx.obedience).toBe(2);
    expect(vaultHorseEffect(null, 'barrel')).toBeNull();
  });

  it('un flot à l\'entraînement pour trois étoiles', () => {
    expect(practiceAward('vaulting', 3)).toEqual({ kind: 'ribbon', tier: 'yellow', money: 0 });
    expect(practiceAward('vaulting', 2)).toBeNull();
  });

  it('quêtes et succès de voltige, avec leurs textes', () => {
    const p = createProfile('Lina');
    p.stats = {};
    const q = (id) => OBJECTIVES.find((o) => o.id === id);
    for (const id of ['vaultFirst', 'vaultCanter1', 'vaultAll', 'vaultStar']) {
      expect(q(id), id).toBeTruthy();
      expect(VAULT_FR[`o_${id}`]).toBeTruthy();
      expect(VAULT_EN[`o_${id}`]).toBeTruthy();
    }
    expect(q('vaultAll').progress(p)).toEqual([0, 6]);
    vaultData(p).onHorse = { basicSeat: 6, flag: 5, mill: 4 };
    expect(q('vaultAll').progress(p)).toEqual([2, 6]);
    p.stats.actvVaulting = 1;
    expect(q('vaultFirst').progress(p)).toEqual([1, 1]);
  });
});

describe('sauvegarde', () => {
  it('les progrès de voltige et le matériel porté passent par la sauvegarde (et une vieille partie n\'en a pas)', () => {
    const p = createProfile('Lina');
    const a = readyHorse(p);
    const figs = PROGRAM.map((id) => ({ id, score: 7, marks: [7, 7, 7], comment: 'good' }));
    recordVault(p, 'walk', vaultResult(figs));
    const back = migrate(JSON.parse(JSON.stringify(p)));
    expect(vaultData(back).best.walk).toBe(7);
    expect(canterUnlocked(back)).toBe(true);
    expect(figuresOnHorse(back)).toEqual(PROGRAM);
    const h = back.animals.find((x) => x.id === a.id);
    expect(h.gear.surcingle.item).toBe('surcingle');
    expect(h.gear.pad.item).toBe('vaultPad');
    const old = migrate(JSON.parse(JSON.stringify(createProfile('Zoé'))));
    expect(vaultData(old).sessions).toBe(0);
    expect(canterUnlocked(old)).toBe(false);
  });
});

describe('textes de la voltige', () => {
  it('les mêmes clés en français et en anglais, et chaque figure a son nom et son « comment faire »', () => {
    const fr = Object.keys(VAULT_FR).filter((k) => !k.endsWith('_f')).sort();
    expect(Object.keys(VAULT_EN).sort()).toEqual(fr);
    for (const id of PROGRAM) {
      for (const d of [VAULT_FR, VAULT_EN]) {
        expect(d[`vt_fig_${id}`]).toBeTruthy();
        expect(d[`vt_how_${id}`]).toBeTruthy();
      }
    }
    for (const id of LEVEL_IDS) expect(VAULT_FR[`vt_level_${id}`]).toBeTruthy();
    for (const c of ['perfect', 'balance', 'rhythm', 'good', 'ok', 'keepGoing']) {
      expect(VAULT_FR[`vt_say_${c}`]).toBeTruthy();
      expect(VAULT_FR[`vt_tip_${c}`]).toBeTruthy();
    }
  });
});

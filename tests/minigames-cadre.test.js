// Cadre commun des mini-jeux (src/ui/minigames.js) : ce qui se calcule sans DOM.
// - le doigt tombe sous le doigt (fitView / toLocalPoint), même pendant l'animation d'ouverture ;
// - trois étoiles veut dire « juste ce qu'il fallait », et rien d'autre (justOutcome / starsFor) ;
// - typographie française (nbsp) ;
// - toutes les clés mg_* que les jeux lisent existent, en français ET en anglais.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fitView, toLocalPoint, nbsp } from '../src/ui/minigames/frame.js';
import { justOutcome, starsFor, justRight, verdict, JUST_FLOOR } from '../src/ui/minigames/score.js';

// ---------------------------------------------------------------- doigt

/**
 * Tailles de la scène (pixels CSS de mise en page) mesurées dans Chromium avec le correctif,
 * pour les quatre écrans vérifiés. Le paysage a sa propre mise en page (scène à gauche).
 */
const STAGES = {
  '390x844': { w: 358, h: 349.1 },
  '360x780': { w: 328, h: 319.8 },
  '844x390': { w: 496, h: 370 },
  '740x360': { w: 431.4, h: 340 },
  '1280x800': { w: 656, h: 482 },
};

/** Ce que le navigateur montre : la mise en page, réduite de k autour du centre (animation « pop »). */
function screenRect(left, top, w, h, k = 1) {
  const cx = left + w / 2;
  const cy = top + h / 2;
  return { left: cx - (w * k) / 2, top: cy - (h * k) / 2, width: w * k, height: h * k };
}
/** Où le point (x, y) du jeu est VRAIMENT dessiné à l'écran. */
function drawnAt(view, rect, w, x, y) {
  const k = rect.width / w;
  return { x: rect.left + (view.ox + x * view.scale) * k, y: rect.top + (view.oy + y * view.scale) * k };
}

describe('fitView : le jeu 400 × 360 agrandi au plus grand, centré', () => {
  it('prend la plus petite des deux échelles et centre le reste', () => {
    const v = fitView(358, 349);
    expect(v.scale).toBeCloseTo(0.895, 6); // 358 / 400 (et pas 0,805 : la mesure pendant le « pop »)
    expect(v.ox).toBeCloseTo(0, 6);
    expect(v.oy).toBeCloseTo((349 - 360 * 0.895) / 2, 6);
    expect(v.x0).toBeCloseTo(0, 6);
    expect(v.y0).toBeCloseTo(-v.oy / v.scale, 6);
    expect(v.w).toBeCloseTo(400, 6);
    expect(v.h).toBeCloseTo(349 / 0.895, 6);
  });

  it('en paysage, des bandes sur les côtés (x0 < 0, x1 > 400)', () => {
    const v = fitView(496, 370);
    expect(v.scale).toBeCloseTo(370 / 360, 6);
    expect(v.x0).toBeLessThan(0);
    expect(v.x1).toBeGreaterThan(400);
    expect(v.y0).toBeCloseTo(0, 6);
  });

  it('jamais d\'échelle nulle (scène pas encore mise en page)', () => {
    expect(fitView(0, 0).scale).toBe(1);
  });
});

describe('toLocalPoint : un toucher à un point connu tombe à ±2 px en coordonnées du jeu', () => {
  const POINTS = [[0, 0], [60, 60], [200, 180], [340, 300], [400, 360], [380, 40], [20, 340]];

  for (const [name, { w, h }] of Object.entries(STAGES)) {
    for (const k of [1, 0.9, 0.95]) {
      it(`${name}, ${k === 1 ? 'fenêtre ouverte' : `pendant l'animation d'ouverture (scale ${k})`}`, () => {
        const view = fitView(w, h);
        const rect = screenRect(17, 123, w, h, k);
        for (const [x, y] of POINTS) {
          const s = drawnAt(view, rect, w, x, y);
          const p = toLocalPoint(s.x, s.y, rect, w, h, view);
          expect(Math.abs(p.x - x), `${name} k=${k} x=${x}`).toBeLessThan(0.01);
          expect(Math.abs(p.y - y), `${name} k=${k} y=${y}`).toBeLessThan(0.01);
        }
      });
    }
  }

  it('l\'ancien calcul (échelle mesurée pendant le « pop ») était 11 % à côté : le bug que ça corrige', () => {
    const { w, h } = STAGES['390x844'];
    const good = fitView(w, h);
    const stale = fitView(w * 0.9, h * 0.9); // ce que donnait getBoundingClientRect() à l'ouverture
    const rect = screenRect(16, 200, w, h, 1);
    const s = drawnAt(good, rect, w, 300, 200);
    // ancien toLocal : (client − rect.left − ox) / scale avec l'échelle périmée
    const oldX = (s.x - rect.left - stale.ox) / stale.scale;
    expect(oldX - 300).toBeGreaterThan(30);
    const p = toLocalPoint(s.x, s.y, rect, w, h, good);
    expect(Math.abs(p.x - 300)).toBeLessThan(0.01);
  });

  it('sans taille de mise en page (0), pas de division par zéro', () => {
    const view = fitView(100, 90);
    const p = toLocalPoint(50, 45, { left: 0, top: 0, width: 100, height: 90 }, 0, 0, view);
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  });
});

// ---------------------------------------------------------------- étoiles et verdict

describe('justOutcome : la note et le verdict toujours d\'accord', () => {
  it('dans la zone : 1 et « juste »', () => {
    expect(justOutcome(0.7, 0.6, 0.8)).toEqual({ q: 1, verdict: 'just' });
    expect(justOutcome(0.6, 0.6, 0.8)).toEqual({ q: 1, verdict: 'just' });
  });

  it('à un cheveu du bord (note arrondie à 1,00) : « juste », pas « Un peu trop ! » sous ★★★', () => {
    // brosser, vu dans le navigateur : 1,0504 pour une zone qui s'arrête à 1,05
    const r = justOutcome(1.0504, 0.8, 1.05);
    expect(r.verdict).toBe('just');
    expect(r.q).toBe(1);
    expect(justOutcome(0.5996, 0.6, 0.8).verdict).toBe('just');
  });

  it('hors de la zone : moins de 1, et le verdict dit de quel côté', () => {
    const lo = justOutcome(0.55, 0.6, 0.8);
    const hi = justOutcome(0.85, 0.6, 0.8);
    expect(lo.verdict).toBe('low');
    expect(hi.verdict).toBe('high');
    expect(lo.q).toBeLessThan(1);
    expect(hi.q).toBeLessThan(1);
    expect(lo.q).toBeGreaterThanOrEqual(JUST_FLOOR);
    // caresser un cheval arrêté à 0,637 pour une zone de 0,68 à 0,92 : q = 0,89, « trop peu »
    const pet = justOutcome(0.637, 0.68, 0.92);
    expect(pet.verdict).toBe('low');
    expect(pet.q).toBeCloseTo(justRight(0.637, 0.68, 0.92), 10);
  });

  it('propriété : note arrondie 1 ⇔ verdict « juste », pour des milliers de valeurs', () => {
    const zones = [[0.6, 0.8, {}], [3, 3, { slack: 2 }], [1.05, 1.05, {}], [0.85, 1.25, { slack: 0.3 }], [7.6, 8.4, { slack: 2 }]];
    for (const [lo, hi, o] of zones) {
      for (let i = 0; i <= 4000; i++) {
        const v = lo - 2 * (hi - lo + 1) + (i / 4000) * 4 * (hi - lo + 1);
        const r = justOutcome(v, lo, hi, o);
        const rounded = Math.round(r.q * 100) / 100;
        expect(rounded === 1, `v=${v} zone [${lo}, ${hi}]`).toBe(r.verdict === 'just');
        if (r.verdict !== 'just') expect(r.verdict).toBe(verdict(v, lo, hi));
      }
    }
  });
});

describe('starsFor : ★★★ seulement si c\'est « juste »', () => {
  it('juste (q = 1) : trois étoiles', () => {
    expect(starsFor(1, 'just')).toBe(3);
    expect(starsFor(1)).toBe(3); // sans verdict (ctx.finish direct), la note seule : 1 = juste
  });

  it('hors de la zone, même tout près (q = 0,85 à 0,99) : deux étoiles, pas trois', () => {
    for (const q of [0.85, 0.89, 0.93, 0.99]) {
      expect(starsFor(q, 'low')).toBe(2);
      expect(starsFor(q, 'high')).toBe(2);
      expect(starsFor(q)).toBe(2);
    }
  });

  it('un verdict « trop » / « trop peu » ne donne jamais trois étoiles, même avec q = 1', () => {
    expect(starsFor(1, 'low')).toBe(2);
    expect(starsFor(1, 'high')).toBe(2);
  });

  it('loin de la zone : 2 étoiles tant que la note reste bonne (≥ 0,6), puis 1 (jamais 0)', () => {
    expect(starsFor(0.6, 'low')).toBe(2);
    expect(starsFor(0.59, 'low')).toBe(1);
    expect(starsFor(JUST_FLOOR, 'high')).toBe(1);
    expect(starsFor(Number.NaN)).toBe(1);
  });

  it('cohérent avec justOutcome : ★★★ ⇔ « juste » pour toute valeur', () => {
    for (let i = 0; i <= 2000; i++) {
      const v = (i / 2000) * 2;
      const r = justOutcome(v, 0.68, 0.92);
      const q = Math.round(Math.max(0.4, Math.min(1, r.q)) * 100) / 100; // comme ctx.finish
      expect(starsFor(q, r.verdict) === 3, `v=${v}`).toBe(r.verdict === 'just');
    }
  });
});

// ---------------------------------------------------------------- typographie

describe('nbsp : un « ! » ne part jamais seul à la ligne', () => {
  it('espace insécable devant ! ? : ; » et après «', () => {
    expect(nbsp('✅ C\'est bon !')).toBe('✅ C\'est bon !');
    expect(nbsp('Prêt ? Va : vite ; « là »')).toBe('Prêt ? Va : vite ; « là »');
  });

  it('idempotent, et sans effet sur l\'anglais', () => {
    const once = nbsp('Oh oui, juste là ! C\'est son endroit préféré !');
    expect(nbsp(once)).toBe(once);
    expect(once).not.toMatch(/ [!?:;»]/);
    expect(nbsp('Perfect! Tap ✅ That\'s it!')).toBe('Perfect! Tap ✅ That\'s it!');
    expect(nbsp(null)).toBe('');
  });
});

// ---------------------------------------------------------------- clés i18n

describe('clés mg_* des mini-jeux : présentes en français ET en anglais', () => {
  let t;
  let setLang;
  beforeAll(async () => {
    globalThis.document = globalThis.document ?? { documentElement: {} };
    ({ t, setLang } = await import('../src/i18n.js'));
  });

  const src = readFileSync(new URL('../src/i18n.js', import.meta.url), 'utf8');
  const enAt = src.indexOf('\nconst en = {');
  const FR = src.slice(0, enAt);
  const EN = src.slice(enAt);
  const defined = (dict, key) => new RegExp(`^\\s{2}${key}:`, 'm').test(dict);

  const dir = new URL('../src/ui/minigames/', import.meta.url);
  const files = [new URL('../src/ui/minigames.js', import.meta.url), ...readdirSync(dir).filter((f) => f.endsWith('.js')).map((f) => new URL(f, dir))];
  /** Toutes les clés écrites en toutes lettres dans le code des mini-jeux : t('mg_…'), tOr(t, 'mg_…', …). */
  const used = new Set();
  for (const f of files) {
    for (const m of readFileSync(f, 'utf8').matchAll(/['"`](mg_[A-Za-z0-9_]+)['"`]/g)) used.add(m[1]);
  }

  it('le code lit bien des dizaines de clés (le balayage marche)', () => {
    expect(used.size).toBeGreaterThan(100);
  });

  it('chaque clé lue par un mini-jeu existe dans les deux dictionnaires', () => {
    const missing = [...used].filter((k) => !defined(FR, k) || !defined(EN, k)).map((k) => `${k}${defined(FR, k) ? '' : ' (fr)'}${defined(EN, k) ? '' : ' (en)'}`);
    expect(missing).toEqual([]);
  });

  it('les clés demandées par les équipes (avant : texte de secours via tOr)', () => {
    const KEYS = ['mg_pressStop', 'mg_shear_hint_just', 'mg_shoe_hint_just', 'mg_nails_end_short', 'mg_nails_end_long',
      'mg_tapStop', 'mg_tooMuchStop', 'mg_clean_hint_rabbit',
      'mg_chore_muck_low', 'mg_chore_muck_high', 'mg_chore_straw_low', 'mg_chore_straw_high',
      'mg_chore_sweep_low', 'mg_chore_sweep_high', 'mg_chore_living_low', 'mg_chore_kitchen_low', 'mg_chore_kitchen_high'];
    for (const key of KEYS) {
      expect(defined(FR, key), `fr ${key}`).toBe(true);
      expect(defined(EN, key), `en ${key}`).toBe(true);
    }
  });

  it('les clés à trou ({…}) des jeux : titres, fins, allures, consignes du nettoyage', () => {
    const dyn = [
      ...[1, 2, 3].flatMap((n) => [`mg_end${n}`, `mg_chore_end${n}`]),
      ...['muck', 'straw', 'sweep', 'living', 'kitchen'].map((k) => `mg_chore_${k}`),
      ...['walk', 'trot', 'canter'].map((g) => `mg_gait_${g}`),
      ...['justRight', 'tooLittle', 'tooMuch'].flatMap((k) => [`mg_${k}`, `mg_chore_${k}`]),
      'mg_clean_hint_cat', 'mg_clean_hint_rabbit',
    ];
    for (const key of dyn) {
      expect(defined(FR, key), `fr ${key}`).toBe(true);
      expect(defined(EN, key), `en ${key}`).toBe(true);
    }
  });

  it('en anglais, pas de repli sur le français pour ces textes', () => {
    setLang('en');
    expect(t('mg_pressStop')).toMatch(/That's it/);
    expect(t('mg_clean_hint_rabbit')).toMatch(/bucket/);
    expect(t('mg_chore_straw_low')).not.toMatch(/paille/);
    setLang('fr');
    expect(t('mg_clean_hint_rabbit')).toMatch(/seau/); // le lapin : un seau, pas une brouette
  });
});

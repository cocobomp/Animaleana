import { describe, it, expect, beforeAll } from 'vitest';
import { VET_FR, VET_EN } from '../src/ui/vetTexts.js';
import { LESSONS } from '../src/sim/vetSchool.js';
import { MEASURE_IDS, ILLNESS_IDS, ILLNESS_SIGNS, SIGN_MEASURE, TOOL_IDS, TOOL_ZONES, LOOK_OF } from '../src/sim/vetExam.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

describe('textes de l\'examen et de l\'école vétérinaires', () => {
  it('chaque texte français existe en anglais (sauf les versions au féminin)', () => {
    const missing = Object.keys(VET_FR).filter((k) => !k.endsWith('_f') && VET_EN[k] === undefined);
    expect(missing).toEqual([]);
    const extra = Object.keys(VET_EN).filter((k) => VET_FR[k] === undefined);
    expect(extra).toEqual([]);
  });

  it('chaque leçon a son titre, ses 4 points et le texte de toutes ses questions', () => {
    for (const l of LESSONS) {
      for (const k of [`vs_${l.id}_title`, `vs_${l.id}_sub`, `vs_${l.id}_p1`, `vs_${l.id}_p4`]) expect(VET_FR[k], k).toBeTruthy();
      l.quiz.forEach((q, n) => {
        const key = `vs_${l.id}_q${n + 1}`;
        expect(VET_FR[key], key).toBeTruthy();
        expect(VET_FR[`${key}_why`], `${key}_why`).toBeTruthy();
        for (let k = 1; k <= q.answers; k++) expect(VET_FR[`${key}_a${k}`], `${key}_a${k}`).toBeTruthy();
      });
    }
  });

  it('chaque mesure, signe, maladie, outil et zone a son texte', () => {
    for (const m of MEASURE_IDS) {
      expect(VET_FR[`vx_m_${m}`], m).toBeTruthy();
      expect(VET_FR[`vx_try_${m}`], m).toBeTruthy();
    }
    const signs = new Set([...Object.values(ILLNESS_SIGNS).flat(), ...Object.keys(SIGN_MEASURE)]);
    for (const s of signs) expect(VET_FR[`vx_sign_${s}`], s).toBeTruthy();
    for (const id of ['healthy', ...ILLNESS_IDS]) {
      expect(VET_FR[`vx_ill_${id}`], id).toBeTruthy();
      expect(VET_FR[`vx_follow_${id}`], id).toBeTruthy();
    }
    for (const id of TOOL_IDS) expect(VET_FR[`vx_tool_${id}`] && VET_FR[`vx_toolLong_${id}`], id).toBeTruthy();
    for (const z of Object.values(TOOL_ZONES).flat()) expect(VET_FR[`vx_zone_${z}`], z).toBeTruthy();
    for (const look of ['fine', ...Object.values(LOOK_OF)]) expect(VET_FR[`vx_look_${look}`], look).toBeTruthy();
  });

  it('ce qui parle de l\'animal examiné a sa version au féminin (« elle respire », « trop grosse »)', () => {
    // Textes du carnet et de la consigne qui disent « il », « gros », « le nourrir »… sans version _f.
    // vx_nose_runny (« il coule ») parle du nez, pas de l'animal.
    const generic = ['vx_nose_runny'];
    // (« faut-il », « œil » : pas l'animal.)
    const masc = /(^|[\s«(])(il|Il)\s|(^|\s)(gros|le nourrir|fatigué|content)(\s|$|,)/;
    const missing = Object.keys(VET_FR).filter((k) => k.startsWith('vx_') && !k.endsWith('_f') && !generic.includes(k)
      && masc.test(VET_FR[k]) && !VET_FR[`${k}_f`]);
    expect(missing).toEqual([]);
    for (const k of ['vx_resp', 'vx_weight_fat', 'vx_weight_thin', 'vx_sign_fat']) expect(VET_FR[`${k}_f`], k).not.toBe(VET_FR[k]);
  });

  it('les valeurs du carnet n\'ont pas de deux-points (la consigne écrit déjà « Mesure : valeur »)', () => {
    const states = Object.keys(VET_FR).filter((k) => /^vx_(lungs|gut|eyes|ears|nose|coat|gums|palp\w+|gait|look)_\w+$/.test(k));
    expect(states.length).toBeGreaterThan(20);
    for (const k of states) {
      expect(VET_FR[k], k).not.toMatch(/:/);
      if (VET_EN[k]) expect(VET_EN[k], k).not.toMatch(/:/);
    }
  });

  it('les textes sont dans les dictionnaires du jeu, avec l\'accord au féminin', () => {
    const { t, setLang } = i18n;
    setLang('fr');
    expect(t('vs_title')).toBe('École vétérinaire');
    expect(t('vx_look_tired', { g: 'f' })).toBe('elle est très fatiguée');
    expect(t('vx_norm', { lo: '37,2', hi: '38,3', u: '°C' })).toBe('normale : 37,2 à 38,3 °C');
    expect(t('vx_resp', { g: 'f', v: 13 })).toBe('elle respire 13 fois par minute');
    expect(t('vx_resp', { g: 'm', v: 13 })).toBe('il respire 13 fois par minute');
    expect(t('vx_sign_fat', { g: 'f' })).toBe('trop grosse');
    expect(t('vx_heart_calcSlow', { c: 16, k: 2, m: 12, v: 192 })).toBe('16 battements en 10 s, au ralenti × 2 : 16 × 12 = 192 /min');
    setLang('en');
    expect(t('vx_look_tired', { g: 'f' })).toBe('is very tired');
    expect(t('do_vetSchool')).toBe('Vet school');
    setLang('fr');
  });
});

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

  it('les textes sont dans les dictionnaires du jeu, avec l\'accord au féminin', () => {
    const { t, setLang } = i18n;
    setLang('fr');
    expect(t('vs_title')).toBe('École vétérinaire');
    expect(t('vx_look_tired', { g: 'f' })).toBe('elle est très fatiguée');
    expect(t('vx_norm', { lo: '37,2', hi: '38,3', u: '°C' })).toBe('normale : 37,2 à 38,3 °C');
    setLang('en');
    expect(t('vx_look_tired', { g: 'f' })).toBe('is very tired');
    expect(t('do_vetSchool')).toBe('Vet school');
    setLang('fr');
  });
});

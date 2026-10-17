import { describe, it, expect, beforeAll } from 'vitest';
import { VEHICLES_FR, VEHICLES_EN } from '../src/ui/vehiclesTexts.js';
import { SUPPLIES, CARGO_KINDS } from '../src/sim/cargo.js';
import { stallSteps } from '../src/sim/loading.js';

let i18n;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

describe('textes des véhicules', () => {
  it('chaque texte existe en français et en anglais', () => {
    const base = (k) => k.replace(/_f$/, '');
    for (const k of Object.keys(VEHICLES_FR)) expect(VEHICLES_EN[base(k)] ?? VEHICLES_EN[k], k).toBeTruthy();
    for (const k of Object.keys(VEHICLES_EN)) expect(VEHICLES_FR[k], k).toBeTruthy();
  });

  it('les familles de textes construites par le code sont complètes', () => {
    const { t, setLang } = i18n;
    const keys = [
      ...Object.keys(SUPPLIES).map((id) => `cargo_${id}`),
      ...CARGO_KINDS.map((k) => `veh_kind_${k}`),
      ...stallSteps({ species: 'horse' }).flatMap((s) => [`veh_step_${s}`, `veh_stepDone_${s}`]),
      ...['empty', 'rearFirst', 'noStep'].map((r) => `veh_stepWhy_${r}`),
      ...['none', 'max', 'full'].map((r) => `veh_pack_${r}`),
      ...['reassure', 'treat', 'wait'].map((h) => `veh_stillHesitates_${h}`),
      ...['noWater', 'noHay', 'noBowls'].flatMap((r) => [`trip_r_${r}`, `trip_r_${r}Arrive`]),
      ...['both', 'hay', 'water'].map((w) => `veh_cargoWarn_${w}`),
      ...['horse', 'cow', 'sheep', 'goat'].map((s) => `veh_who_${s}`),
      'trip_f_loose',
      ...['tieRule', 'hayNet', 'noHay', 'noWater', 'unload'].map((k) => `trip_tip_${k}`),
      'veh_menuTitleVan', 'veh_menuTitleCar', 'veh_focusVan', 'veh_focusCar', 'veh_trunkTitle', 'veh_roofTitle',
      'veh_bagsTitle', 'veh_luggageTitle', 'veh_crateItSub', 'veh_crateItSubVan', 'veh_tackView', 'veh_roofView',
      'veh_allAboardVan', 'veh_allAboardCar', 'veh_cargoWarnNight', 'veh_cargoWarnArrival', 'veh_watchCab', 'veh_watchCabDesc',
      'veh_stallOrderNoTie', 'veh_hesitatesHintOther', 'buyToolAskAwayFree', 'tr_livestockNeedsVan',
      'veh_camCab', 'veh_camOutside', 'veh_camTrailer', 'veh_treat', 'veh_treatNone', 'veh_reassure', 'veh_wait',
      'gear_leftAtHome', 'gearAtHome', 'buyToolAskAway',
      // coffre rangé par taille, comme la sellerie (sim/gear.js, ui/tack.js)
      'gear_wrongSizeAway', 'gear_away', 'veh_fitsFor', 'tk_atHome', 'tk_awayShop', 'tk_atHomeRow',
    ];
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of keys) expect(t(k, { name: 'X', n: 2, list: 'Y', place: 'Z', tool: 'T', price: 1 }), `${lang}:${k}`).not.toBe(k);
    }
    setLang('fr');
  });

  it('les textes s\'accordent avec l\'animal (jument, plusieurs noms, un seul animal)', () => {
    const { t, ta, setLang } = i18n;
    setLang('fr');
    const mare = { name: 'Tornado', sex: 'f' };
    expect(ta('veh_stepDone_tie', mare)).toContain('attachée');
    expect(ta('veh_stepDone_tie', mare)).toContain('qu\'elle');
    expect(ta('veh_walkingInHint', mare)).toContain('d\'elle');
    expect(ta('veh_leadInNow', mare)).toContain('la tiens');
    expect(ta('veh_noTreats', mare)).toContain('Rassure-la');
    expect(t('veh_stillWaiting', { names: 'Rex, Minou', n: 2 })).toContain('ne sont pas');
    expect(t('veh_stillWaiting', { names: 'Rex', n: 1 })).toContain('n\'est pas');
    expect(t('veh_looseText', { names: 'Tornado', n: 1, g: 'f' })).toContain('attachée');
    expect(t('veh_cargoWarn_water', { n: 1, g: 'f' })).toContain('la faire boire');
    expect(t('veh_cargoWarn_water', { n: 3 })).toContain('les faire boire');
    expect(ta('trip_r_noWaterArrive', mare)).toContain('l\'arrivée');
    expect(ta('trip_r_noWaterArrive', mare)).not.toContain('soir');
    expect(t('veh_stepDone_breastBar', { who: t('veh_who_sheep') })).toContain('le mouton');
    expect(t('buyToolAskAwayFree', { tool: 'Brosse', price: 5 })).not.toContain('5');
  });
});

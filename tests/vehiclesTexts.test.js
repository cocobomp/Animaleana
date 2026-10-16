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
      ...['noWater', 'noHay', 'noBowls'].map((r) => `trip_r_${r}`),
      'trip_f_loose',
      ...['tieRule', 'hayNet', 'noHay', 'noWater', 'unload'].map((k) => `trip_tip_${k}`),
      'veh_menuTitleVan', 'veh_menuTitleCar', 'veh_focusVan', 'veh_focusCar', 'veh_trunkTitle', 'veh_roofTitle',
      'veh_bagsTitle', 'veh_luggageTitle', 'veh_crateItSub', 'veh_crateItSubVan', 'veh_tackView', 'veh_roofView',
      'veh_allAboardVan', 'veh_allAboardCar', 'veh_cargoWarnHay', 'veh_cargoWarnWater', 'veh_watchCab', 'veh_watchCabDesc',
      'veh_camCab', 'veh_camOutside', 'veh_camTrailer', 'veh_treat', 'veh_treatNone', 'veh_reassure', 'veh_wait',
      'gear_leftAtHome', 'gearAtHome', 'buyToolAskAway',
    ];
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of keys) expect(t(k, { name: 'X', n: 2, list: 'Y', place: 'Z', tool: 'T', price: 1 }), `${lang}:${k}`).not.toBe(k);
    }
    setLang('fr');
  });
});

import { describe, it, expect, beforeAll } from 'vitest';

let i18n;
beforeAll(async () => {
  // setLang écrit document.documentElement.lang : un minimum de DOM suffit ici.
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
});

describe('traductions', () => {
  it('en anglais, le singulier « _one » français ne fuit pas', () => {
    const { t, setLang } = i18n;
    setLang('fr');
    expect(t('actv_ready', { n: 1 })).toBe(t('actv_ready_one', { n: 1 }));
    setLang('en');
    expect(t('actv_ready', { n: 1 })).not.toMatch(/prêt/);
    setLang('fr');
  });

  it('toutes les raisons des activités ont un texte', () => {
    const { t } = i18n;
    for (const why of ['sick', 'baby', 'tired', 'notRideable', 'tooYoung', 'needBridle', 'noAgility', 'noTricks', 'notHere', 'pregnant', 'notRabbit']) {
      expect(t(`actv_why_${why}`, { name: 'X' })).not.toBe(`actv_why_${why}`);
    }
  });
});

describe('singulier : « 1 an », pas « 1 ans »', () => {
  // Textes avec un nombre qui peut valoir 1 : jamais « 1 ans », « 1 animaux », « 1 séances »…
  const CASES = [
    ['years', {}], ['months', {}], ['flockCount', { pen: 1, field: 0 }], ['pregnantInfo', { name: 'Lila' }],
    ['fac_capBoxes', { total: 4, max: 6 }], ['actv_lessonResult', { total: 5 }], ['vx_end_exams', {}],
    ['grm_served', {}], ['grm_freshCut', { style: 'courte' }], ['dt_howWas_reply', { dog: 'Rex', g: 'm' }],
    ['dt_howWas_reply', { dog: 'Fifi', g: 'f' }], ['sv_storagePartial', { total: 3 }], ['checkBad', { names: 'Tornade' }],
    ['trip_stopsMade', {}], ['trip_stopsSkipped', {}], ['cl_days', {}], ['cl_late', {}], ['animalsCount', {}],
  ];
  const PLURAL_AFTER_1 = {
    fr: /\b1 (?!mois\b|fois\b|box\b|rendez-vous\b)[a-zàâçéèêëîïôûùüÿœ]+[sx]\b|\b1 \S+ (?:réussis|occupés|servis|faites|sautées|ajoutées)\b|ne vont pas/,
    en: /\b1 (?!of\b|is\b)[a-z]+s\b|\bare not well\b/,
  };
  for (const lang of ['fr', 'en']) {
    it(`en ${lang}, les textes au singulier n'ont pas de pluriel`, () => {
      const { t, setLang } = i18n;
      setLang(lang);
      for (const [key, params] of CASES) {
        const s = t(key, { ...params, n: 1 });
        expect(s, key).not.toBe(key);
        expect(s, `${key} → ${s}`).not.toMatch(PLURAL_AFTER_1[lang]);
      }
      setLang('fr');
    });
  }

  it('l’âge d’un animal d’un an se lit « 1 an » (fiche d’un client)', () => {
    const { t, setLang } = i18n;
    setLang('fr');
    expect(t('years', { n: 1 })).toBe('1 an');
    expect(t('years', { n: 3 })).toBe('3 ans');
    setLang('en');
    expect(t('years', { n: 1 })).toBe('1 year');
    expect(t('months', { n: 1 })).toBe('1 month');
    setLang('fr');
  });

  it('pauses du voyage : chaque nombre s’accorde', () => {
    const { t, setLang } = i18n;
    setLang('fr');
    const s = t('trip_reportStops', { made: t('trip_stopsMade', { n: 1 }), skipped: t('trip_stopsSkipped', { n: 2 }) });
    expect(s).toBe('🅿️ Pauses : 1 faite, 2 sautées');
  });
});

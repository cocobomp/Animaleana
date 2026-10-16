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

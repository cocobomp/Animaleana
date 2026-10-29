// « 💡 Le savais-tu ? » (src/sim/horseFacts.js) : chaque fait existe en français et en anglais, et on les fait
// défiler sans répéter.
import { describe, it, expect, beforeAll } from 'vitest';
import { HORSE_FACTS, nextHorseFact } from '../src/sim/horseFacts.js';

let t;
let setLang;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  ({ t, setLang } = await import('../src/i18n.js'));
});

describe('le savais-tu ?', () => {
  it('chaque fait existe dans les deux langues', () => {
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      expect(t('factTitle')).not.toBe('factTitle');
      for (let i = 1; i <= HORSE_FACTS; i++) expect(t(`fact_${i}`), `${lang} ${i}`).not.toBe(`fact_${i}`);
      expect(t(`fact_${HORSE_FACTS + 1}`)).toBe(`fact_${HORSE_FACTS + 1}`); // (pas de fait oublié dans le compte)
    }
    setLang('fr');
  });

  it('ils défilent tous avant de recommencer', () => {
    const seen = new Set();
    for (let i = 0; i < HORSE_FACTS; i++) seen.add(nextHorseFact());
    expect(seen.size).toBe(HORSE_FACTS);
  });
});

// Textes des quêtes principales et secondaires (src/ui/questsTexts.js) : tout existe en français et en anglais,
// et chaque « pas encore possible » de questBlock a son texte.
import { describe, it, expect, beforeAll } from 'vitest';

const mem = new Map();
let i18n;

beforeAll(async () => {
  globalThis.localStorage = globalThis.localStorage ?? {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
  };
  globalThis.document = globalThis.document ?? { documentElement: { lang: 'fr' } };
  i18n = await import('../src/i18n.js');
});

describe('textes des quêtes', () => {
  it('chaque texte existe en français et en anglais (et n\'est pas le même)', async () => {
    const { QUESTS_FR, QUESTS_EN } = await import('../src/ui/questsTexts.js');
    expect(Object.keys(QUESTS_EN).sort()).toEqual(Object.keys(QUESTS_FR).sort());
    for (const k of Object.keys(QUESTS_FR)) {
      expect(QUESTS_FR[k], k).toBeTruthy();
      expect(QUESTS_EN[k], k).not.toBe(QUESTS_FR[k]);
    }
  });

  it('chaque thème, et chaque raison « pas encore possible », a son texte dans le jeu', async () => {
    const { t, setLang } = i18n;
    const { THEMES } = await import('../src/sim/quests.js');
    const { QUEST_GUIDE } = await import('../src/sim/tutorial.js');
    const keys = new Set(THEMES.map((th) => `qj_theme_${th.id}`));
    for (const g of Object.values(QUEST_GUIDE)) {
      for (const raw of g.need ?? []) {
        const need = typeof raw === 'string' ? { id: raw } : raw;
        keys.add(need.for ? `qneed_${need.id}_${need.for}` : `qneed_${need.id}`);
      }
    }
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of keys) expect(t(k, { n: 3 }), `${lang} ${k}`).not.toBe(k);
    }
    setLang('fr');
    expect(t('qj_upcoming', { n: 1 })).toBe('🔒 Encore 1 chapitre après celui-ci');
    expect(t('qj_notYet', { why: t('qneed_horse') })).toBe('Pas encore possible : il te faut d\'abord un cheval 🐴.');
  });
});

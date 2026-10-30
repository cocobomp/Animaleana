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

  it('monter : « 🏇 », pas « 🏇 Monter » (le bouton peut dire « Seller et monter »)', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of ['quest_hint_ride1', 'quest_hint_rideCanter1', 'quest_step_doMount', 'quest_step_doRide']) {
        expect(t(k), `${lang} ${k}`).toContain('🏇');
        expect(t(k), `${lang} ${k}`).not.toContain(`🏇 ${t('act_ride')}`);
      }
    }
    setLang('fr');
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
    // chaque raison a aussi sa version courte (le petit suivi à l'écran n'a qu'une ligne au téléphone)
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of keys) {
        if (!k.startsWith('qneed_')) continue;
        const short = k.replace(/^qneed_/, 'qshort_');
        const s = t(short, { n: 776, max: 20 });
        expect(s, `${lang} ${short}`).not.toBe(short);
        expect(s.length, `${lang} ${short} : « ${s} »`).toBeLessThanOrEqual(33);
      }
    }
    setLang('fr');
    expect(t('qj_upcoming', { n: 1 })).toBe('🔒 Encore 1 chapitre après celui-ci');
    expect(t('qj_skippedLeft', { n: 1 })).toBe('Il te reste 1 chapitre passé. Reprends-le dans 📖 Journal quand tu veux.');
    expect(t('qj_notYet', { why: t('qneed_horse') })).toBe('Pas encore possible : il te faut d\'abord un cheval 🐴.');
  });

  it('commencer un métier dit lesquels font venir des clients (le chapitre suivant est le premier client)', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      const hint = t('quest_hint_career1');
      for (const id of ['vet', 'pension', 'handler']) expect(hint, `${lang} ${id}`).toContain(t(`career_${id}`));
    }
    setLang('fr');
  });
});

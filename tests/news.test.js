// 🐴 Quoi de neuf ? (src/ui/news.js) : chaque nouveauté a son titre et sa phrase, en français et en anglais.
import { describe, it, expect, beforeAll } from 'vitest';

let i18n;
let news;
beforeAll(async () => {
  globalThis.document = globalThis.document ?? { documentElement: {} };
  i18n = await import('../src/i18n.js');
  news = await import('../src/ui/news.js');
});

describe('quoi de neuf', () => {
  it('chaque nouveauté a son titre et sa phrase (FR et EN), et la fenêtre ses textes', () => {
    const { t, setLang } = i18n;
    for (const lang of ['fr', 'en']) {
      setLang(lang);
      for (const k of ['news_title', 'news_intro', 'news_ok']) expect(t(k), `${lang} ${k}`).not.toBe(k);
      for (const n of news.NEWS) {
        expect(t(`news_${n.key}`), `${lang} ${n.key}`).not.toBe(`news_${n.key}`);
        expect(t(`news_${n.key}_d`), `${lang} ${n.key}_d`).not.toBe(`news_${n.key}_d`);
      }
    }
    setLang('fr');
    expect(new Set(news.NEWS.map((n) => n.key)).size).toBe(news.NEWS.length);
  });

  it('une nouvelle partie ne la voit pas (elle découvre tout avec son premier cheval) ; c\'est noté', () => {
    const ui = { game: { profile: { animals: [], tutorial: { done: false } } }, showModal: () => { throw new Error('pas de fenêtre'); } };
    expect(news.maybeShowNews(ui)).toBe(false);
    expect(ui.game.profile.newsSeen).toBe(news.NEWS_ID);
    // déjà vue : rien
    const seen = { game: { profile: { animals: [{}], newsSeen: news.NEWS_ID } }, showModal: () => { throw new Error('pas deux fois'); } };
    expect(news.maybeShowNews(seen)).toBe(false);
  });
});

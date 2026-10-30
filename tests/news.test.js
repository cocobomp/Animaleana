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

  it('la fenêtre montre ce qui est venu depuis la dernière liste vue (« cheval7 » : aussi la bulle, les étoiles…)', () => {
    const keys = (seen) => news.freshNews(seen).map((n) => n.key);
    const v9 = ['wishTap', 'rideCard', 'praise', 'legMud', 'starsFelt'];
    const v8 = ['wish', 'stars', 'lucky', 'breath', 'photos', 'halloween'];
    expect(keys('cheval8')).toEqual(v9);
    expect(keys('cheval7')).toEqual([...v9, ...v8]);
    // (plus ancienne, ou jamais vue : au plus les deux dernières listes, pas un mur de texte)
    expect(keys('cheval6')).toEqual([...v9, ...v8]);
    expect(keys('cheval2')).toEqual([...v9, ...v8]);
    expect(keys(undefined)).toEqual([...v9, ...v8]);
    expect(keys(news.NEWS_ID)).toEqual([]);
  });

  it('une partie restée à « cheval7 » : la fenêtre s\'ouvre une fois, avec les onze nouveautés', () => {
    // (un tout petit DOM pour h() : src/ui/dom.js)
    class El {
      constructor(tag) { Object.assign(this, { tag, children: [], style: {}, className: '' }); }
      append(c) { this.children.push(c); }
      setAttribute() {}
      addEventListener() {}
    }
    globalThis.Node = El;
    Object.assign(globalThis.document, { createElement: (tag) => new El(tag), createTextNode: (data) => ({ data }) });
    const find = (els, cls) => els.flat(Infinity).map((e) => (e?.className === cls ? e : e?.children && find(e.children, cls))).find(Boolean);
    const shown = [];
    const ui = { game: { profile: { animals: [{}], newsSeen: 'cheval7' } }, showModal: (c) => shown.push(c), hideModal() {} };
    expect(news.maybeShowNews(ui)).toBe(true);
    expect(shown).toHaveLength(1);
    expect(find(shown[0], 'news-list').children).toHaveLength(11); // (les 5 de « cheval9 » et les 6 de « cheval8 »)
    expect(ui.game.profile.newsSeen).toBe(news.NEWS_ID);
    expect(news.maybeShowNews(ui)).toBe(false);
  });
});

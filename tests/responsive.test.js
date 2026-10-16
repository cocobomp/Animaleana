// Audit responsive et clavier : champs texte, clavier de l'iPhone, tailles des cibles tactiles.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { visibleArea, SHORT_VIEW } from '../src/ui/viewport.js';

const SRC = new URL('../src/', import.meta.url).pathname;
const files = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  return statSync(p).isDirectory() ? files(p) : p.endsWith('.js') ? [p] : [];
});
const sources = files(SRC).map((p) => ({ p: p.slice(SRC.length), text: readFileSync(p, 'utf8') }));
const css = readFileSync(join(SRC, 'style.css'), 'utf8');

/** Les champs h('input', { … }) des fichiers du jeu (texte de l'objet des propriétés). */
const inputs = sources.flatMap(({ p, text }) => [...text.matchAll(/h\('input',\s*\{([\s\S]*?)\}\)/g)].map((m) => ({ p, props: m[1] })));
const textInputs = inputs.filter((x) => /type:\s*'(text|search)'/.test(x.props));

describe('champs texte et clavier à l\'écran', () => {
  it('on a bien trouvé les champs texte du jeu (nom du profil, nom d\'un animal, recherche de l\'Aide)', () => {
    expect(textInputs.length).toBeGreaterThanOrEqual(3);
    expect(textInputs.map((x) => x.p)).toEqual(expect.arrayContaining(['ui/UI.js', 'ui/screens.js', 'ui/help.js']));
  });

  it('chaque champ texte dit au clavier ce que fait Entrée, sans correction ni suggestions', () => {
    for (const { p, props } of textInputs) {
      const where = `${p} : ${props.trim().slice(0, 60)}`;
      expect(props, where).toMatch(/enterkeyhint:\s*'(done|go|search|next|send)'/);
      expect(props, where).toMatch(/autocomplete:\s*'off'/);
      expect(props, where).toMatch(/autocapitalize:\s*'(words|none|sentences|off)'/);
      expect(props, where).toMatch(/autocorrect:\s*'off'/);
    }
  });

  it('la recherche de l\'Aide est un champ de recherche (touche « Rechercher »)', () => {
    const help = textInputs.find((x) => x.p === 'ui/help.js');
    expect(help.props).toMatch(/type:\s*'search'/);
    expect(help.props).toMatch(/enterkeyhint:\s*'search'/);
  });

  it('le focus n\'est jamais donné seulement dans un setTimeout (sur iPhone, le clavier ne s\'ouvrirait pas)', () => {
    // Un repli plus tard est permis (focusField), mais jamais un .focus() direct dans un minuteur.
    // (Fichiers qui créent un champ texte ; ailleurs, focus d'un bouton pour le clavier physique, sans enjeu.)
    const withFields = new Set(textInputs.map((x) => x.p));
    for (const { p, text } of sources.filter((x) => withFields.has(x.p))) {
      expect(text, p).not.toMatch(/setTimeout\(\s*\(\)\s*=>\s*\{?[^;\n]*?\.focus\(/);
    }
  });

  it('la recherche de l\'Aide ne redessine plus tout le panneau à chaque lettre (le champ perdait le focus)', () => {
    const help = sources.find((x) => x.p === 'ui/help.js').text;
    const listener = help.match(/input\.addEventListener\('input',[^\n]*/)[0];
    expect(listener).not.toMatch(/renderPanel/);
  });
});

describe('partie visible de l\'écran (clavier de l\'iPhone)', () => {
  it('sans visualViewport, tout l\'écran est visible', () => {
    expect(visibleArea(null, 844)).toEqual({ top: 0, bottom: 0, height: 844, keyboard: false });
  });

  it('clavier ouvert : la page garde sa taille, la partie visible rétrécit (on laisse la place du clavier en bas)', () => {
    const a = visibleArea({ height: 500, offsetTop: 0, scale: 1 }, 844);
    expect(a).toEqual({ top: 0, bottom: 344, height: 500, keyboard: true });
    expect(a.height).toBeLessThan(SHORT_VIEW);
  });

  it('Safari a fait glisser la partie visible pour montrer le champ : on suit ce décalage', () => {
    expect(visibleArea({ height: 480, offsetTop: 120, scale: 1 }, 844)).toEqual({ top: 120, bottom: 244, height: 480, keyboard: true });
  });

  it('paysage, clavier ouvert : il ne reste qu\'une bande de 200 px', () => {
    expect(visibleArea({ height: 200, offsetTop: 0, scale: 1 }, 390)).toMatchObject({ bottom: 190, keyboard: true });
  });

  it('la barre de Safari qui bouge un peu n\'est pas un clavier', () => {
    expect(visibleArea({ height: 790, offsetTop: 0, scale: 1 }, 844).keyboard).toBe(false);
  });

  it('pendant un zoom au pincement, on ne déplace rien', () => {
    expect(visibleArea({ height: 400, offsetTop: 200, scale: 2 }, 844)).toEqual({ top: 0, bottom: 0, height: 844, keyboard: false });
  });
});

/** min-height (px) déclaré dans la règle dont le sélecteur est exactement sel (la dernière l'emporte). */
const minHeight = (sel) => {
  const esc = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const all = [...css.matchAll(new RegExp(`(?:^|[}\\n])\\s*${esc}\\s*\\{([^}]*)\\}`, 'g'))];
  const values = all.map((m) => m[1].match(/min-height:\s*(\d+)px/)).filter(Boolean).map((m) => Number(m[1]));
  return values.at(-1);
};

describe('cibles tactiles d\'au moins 44 px', () => {
  it.each([
    '.time-btn', // ⏸ ▶ ⏩ 🤖
    '.qt-quick', // 🧭 / ⏹ de la pastille de quête
    '.status-chip button', // « Arrêter »
    '.ba-queue', // 📝 Ajouter à ma liste
    '.swatch-btn', // couleurs de l'avatar
    '.swatches.small .swatch-btn', // couleurs de la couverture
    '.animal-label', // noms au-dessus des animaux
    '.check', // cases à cocher
  ])('%s', (sel) => {
    expect(minHeight(sel)).toBeGreaterThanOrEqual(44);
  });

  it('au doigt, les petits boutons (button.small) font aussi 44 px', () => {
    expect(css).toMatch(/@media \(pointer: coarse\) \{ button\.small \{ min-height: 44px; \} \}/);
  });

  it('la règle téléphone de la barre du temps ne la ramène plus sous 44 px', () => {
    const phone = css.match(/\.time-btn \{ flex: 1 1 0;[^}]*\}/)[0];
    expect(Number(phone.match(/min-height:\s*(\d+)px/)[1])).toBeGreaterThanOrEqual(44);
  });
});

describe('fenêtres', () => {
  it('une fenêtre trop haute défile (au lieu de mettre OK hors de l\'écran) et reste dans la partie visible', () => {
    const modal = css.match(/#modal \{[^}]*\}/)[0];
    expect(modal).toMatch(/var\(--vv-top/);
    expect(modal).toMatch(/var\(--vv-bottom/);
    const box = css.match(/\.modal-box \{[^}]*\}/)[0];
    expect(box).toMatch(/max-height:\s*100%/);
    expect(box).toMatch(/overflow-y:\s*auto/);
    expect(css).toMatch(/\.modal-box > \.row\.end:last-child \{ position: sticky;/);
  });
});

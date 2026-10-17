// Clavier à l'écran (surtout l'iPhone, appli web plein écran).
//
// Sur iPhone, le clavier ne rétrécit pas la page : il se pose PAR-DESSUS, et Safari fait glisser la
// partie visible (window.visualViewport) pour montrer le champ. Une fenêtre centrée sur tout l'écran
// avait alors son bouton OK sous le clavier, et le jeu glissait derrière. Ici, on suit la partie visible
// et on la donne au CSS :
//   --vv-top, --vv-bottom : marges à laisser en haut et en bas (le clavier) pour rester dans la partie visible ;
//   --vv-h : sa hauteur ;
//   body.kb-open : le clavier est ouvert ; body.vv-short : la partie visible est basse (< 560 px).
// #modal, #screen et #panel s'y calent (style.css, « Clavier à l'écran ») ; le champ qui a le focus
// est ramené dans la partie visible de sa fenêtre (revealField).

/** Hauteur visible sous laquelle on manque de place (clavier ouvert en portrait, ou paysage). */
export const SHORT_VIEW = 560;

/**
 * Partie visible de la page, en pixels de la page (celle des éléments position: fixed).
 * vv : window.visualViewport (ou null) ; innerHeight : window.innerHeight.
 * keyboard : vrai quand quelque chose (le clavier) cache le bas sans que la page ait rétréci.
 */
export function visibleArea(vv, innerHeight) {
  // Pas de visualViewport, ou zoom au pincement en cours : on ne touche à rien.
  if (!vv || !(vv.height > 0) || Math.abs((vv.scale ?? 1) - 1) > 0.01) {
    return { top: 0, bottom: 0, height: innerHeight, keyboard: false };
  }
  const top = Math.max(0, Math.round(vv.offsetTop || 0));
  const height = Math.min(Math.round(vv.height), innerHeight - top);
  const bottom = Math.max(0, Math.round(innerHeight - top - height));
  // Les barres de Safari font varier la hauteur de quelques dizaines de pixels ; un clavier en fait plus de 150.
  return { top, bottom, height, keyboard: innerHeight - height > 120 };
}

const isField = (el) => el?.tagName === 'INPUT' && /^(text|search|email|number|tel|url|password)$/.test(el.type || 'text');

/** Plus proche parent qui défile (fenêtre, panneau, écran), ou null. */
function scroller(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p).overflowY;
    if ((s === 'auto' || s === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;
}

/**
 * Fait défiler la fenêtre (ou le panneau) qui contient le champ pour qu'il soit visible, au-dessus de la
 * rangée OK / Annuler collée en bas et du clavier. Ne fait jamais défiler la page elle-même.
 */
export function revealField(el) {
  const box = el && scroller(el);
  if (!box) return;
  const vv = visibleArea(window.visualViewport, window.innerHeight);
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  // Rangée OK / Annuler collée en bas (fenêtre : enfant direct ; écran « Nouveau profil » : au bout du cadre .menu).
  const sticky = [...box.querySelectorAll('.row.end:last-child')].find((x) => getComputedStyle(x).position === 'sticky');
  const stickyH = sticky ? sticky.getBoundingClientRect().height : 0;
  const top = Math.max(b.top, vv.top) + 8;
  const bottom = Math.min(b.bottom, vv.top + vv.height) - stickyH - 8;
  if (r.bottom > bottom) box.scrollTop += Math.min(r.bottom - bottom, r.top - top);
  else if (r.top < top) box.scrollTop -= top - r.top;
}

/** Donne le focus à un champ et sélectionne son texte (taper remplace le nom proposé). */
export function focusField(el, select = false) {
  try {
    el.focus({ preventScroll: true });
  } catch {
    el.focus();
  }
  // (select() ne marche pas toujours sur iPhone ; setSelectionRange si.)
  if (select && document.activeElement === el) {
    try {
      el.setSelectionRange(0, el.value.length);
    } catch {
      /* type sans sélection */
    }
  }
  revealField(el);
}

let watching = false;

/** Suit la partie visible (une seule fois par page). */
export function watchViewport() {
  if (watching || typeof window === 'undefined') return;
  watching = true;
  const root = document.documentElement;
  let last = '';
  const sync = () => {
    // La page ne doit jamais défiler derrière le jeu (Safari la décale pour montrer un champ).
    if (window.scrollX || window.scrollY) window.scrollTo(0, 0);
    const a = visibleArea(window.visualViewport, window.innerHeight);
    const key = `${a.top}|${a.bottom}|${a.height}`;
    if (key === last) return;
    last = key;
    root.style.setProperty('--vv-top', `${a.top}px`);
    root.style.setProperty('--vv-bottom', `${a.bottom}px`);
    root.style.setProperty('--vv-h', `${a.height}px`);
    document.body.classList.toggle('kb-open', a.keyboard);
    document.body.classList.toggle('vv-short', a.height < SHORT_VIEW);
    // La place a changé (clavier ouvert, fenêtre redimensionnée) : le champ actif reste visible.
    if (isField(document.activeElement)) requestAnimationFrame(() => revealField(document.activeElement));
  };
  window.visualViewport?.addEventListener('resize', sync);
  window.visualViewport?.addEventListener('scroll', sync);
  window.addEventListener('resize', sync);
  window.addEventListener('scroll', sync, { passive: true });
  // Le clavier s'ouvre un peu après le focus (animation) : on regarde aussi juste après.
  document.addEventListener('focusin', (e) => {
    if (!isField(e.target)) return;
    sync();
    setTimeout(sync, 350);
  });
  document.addEventListener('focusout', () => setTimeout(sync, 350));
  sync();
}

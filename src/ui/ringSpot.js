// Où poser le cercle qui clignote et le doigt du guide (placeRing, src/ui/tutorial.js), sans DOM.
// r : le bouton montré ; bubble, tracker : la bulle et le suivi de quête (rectangles, ou null s'ils sont cachés) ;
// h : la hauteur de l'écran. Tout est en pixels de l'écran (getBoundingClientRect).

const PAD = 6; // l'écart entre le bouton et le cercle

/** Deux rectangles se touchent-ils ? (un rectangle vide ou absent ne touche rien) */
const hits = (b, s) => !!b && b.right - b.left > 0 && b.left < s.right && b.right > s.left && b.top < s.bottom && b.bottom > s.top;

/**
 * Le doigt vient d'en dessous du bouton (ou d'au-dessus si le bouton est en bas de l'écran). Là où il irait, s'il
 * cache la bulle ou le suivi (sous 💼 Métiers sur téléphone, au-dessus de « S'occuper de … » en paysage, où la bulle
 * est au milieu), il vient de côté : de la gauche (👉), ou de la droite (👈) contre le bord gauche de l'écran.
 * Si la bulle couvre une partie du bouton, le cercle passe sous elle (under) : il ne barre pas ses boutons, et le
 * doigt de côté se met au milieu de la partie du cercle qu'on voit encore (fingerY : sa hauteur depuis le haut du
 * cercle ; null = au milieu, comme d'habitude). Si la bulle cache tout le bouton, rien ne s'affiche (hidden).
 * Renvoie { pad, fromTop, side: null | 'left' | 'right', under, fingerY, hidden, glyph }.
 */
export function ringSpot(r, { bubble = null, tracker = null } = {}, h = 800) {
  const low = r.bottom > h - 90;
  const cx = (r.left + r.right) / 2;
  const spot = low
    ? { left: cx - 26, right: cx + 26, top: r.top - PAD - 48, bottom: r.top - PAD }
    : { left: cx - 26, right: cx + 26, top: r.bottom + PAD, bottom: r.bottom + PAD + 48 };
  const aside = hits(bubble, spot) || hits(tracker, spot);
  const side = !aside ? null : r.left > 56 ? 'left' : 'right';
  const under = hits(bubble, r);
  // Ce qu'on voit encore du cercle, de haut en bas : sous la bulle (bulle au-dessus), ou au-dessus d'elle.
  const top = r.top - PAD;
  const bottom = r.bottom + PAD;
  const seen = !under ? [top, bottom] : bubble.top > r.top ? [top, Math.min(bottom, bubble.top)] : [Math.max(top, bubble.bottom), bottom];
  const hidden = under && seen[1] - seen[0] < 2 * PAD + 8; // (il ne reste que le bord du cercle)
  return {
    pad: PAD,
    fromTop: low && !aside,
    side,
    under,
    fingerY: under && side && !hidden ? Math.round((seen[0] + seen[1]) / 2 - top) : null,
    hidden,
    glyph: side === 'left' ? '👉' : side === 'right' ? '👈' : '👆',
  };
}

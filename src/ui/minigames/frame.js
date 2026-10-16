// Calculs purs du cadre des mini-jeux (src/ui/minigames.js) : échelle de la scène, point
// touché en coordonnées du jeu, typographie française. Sans DOM : testés dans
// tests/minigames-cadre.test.js.

/**
 * Vue d'une scène de w × h pixels CSS (taille de MISE EN PAGE, sans transformation) pour un jeu
 * virtuel de vw × vh : le jeu est agrandi au plus grand qui tient, centré ; x0…y1 disent ce qui
 * est visible autour (bandes en plus sur les côtés ou en haut et en bas).
 */
export function fitView(w, h, vw = 400, vh = 360) {
  const sc = Math.min(w / vw, h / vh) || 1;
  const ox = (w - vw * sc) / 2;
  const oy = (h - vh * sc) / 2;
  const x0 = -ox / sc;
  const y0 = -oy / sc;
  const x1 = vw + ox / sc;
  const y1 = vh + oy / sc;
  return { scale: sc, ox, oy, x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

/**
 * Point de l'écran (clientX, clientY) → coordonnées du jeu.
 * rect : canvas.getBoundingClientRect() (ce qu'on VOIT, transformations comprises) ;
 * cw, ch : canvas.clientWidth / clientHeight (taille de mise en page, celle de la vue).
 * Pendant l'animation d'ouverture (scale 0,9), rect est 10 % plus petit que la mise en page :
 * on divise par ce rapport, et le point reste exactement sous le doigt.
 */
export function toLocalPoint(clientX, clientY, rect, cw, ch, view) {
  const kx = cw > 0 && rect.width > 0 ? rect.width / cw : 1;
  const ky = ch > 0 && rect.height > 0 ? rect.height / ch : 1;
  return {
    x: ((clientX - rect.left) / kx - view.ox) / view.scale,
    y: ((clientY - rect.top) / ky - view.oy) / view.scale,
  };
}

/**
 * Typographie française : l'espace devant « ! ? : ; » et à l'intérieur des guillemets devient
 * insécable, pour qu'un « ! » ne parte jamais seul à la ligne (« C'est bon / ! » sur un bouton
 * de 160 px). Sans effet sur l'anglais (pas d'espace devant la ponctuation). Idempotent.
 */
export function nbsp(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/ ([!?:;»])/g, ' $1').replace(/« /g, '« ');
}

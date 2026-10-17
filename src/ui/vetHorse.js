// Le cheval de l'examen vétérinaire, dessiné en grand et de profil « comme un vrai » : encolure
// galbée, tête avec chanfrein, naseaux, ganache et lèvres, oreilles en feuille, pattes articulées
// (avant-bras, genou, canon, boulet, paturon, sabot ; grasset, jarret à l'arrière), crinière,
// toupet et queue en volume, et la robe : bai à extrémités noires, balzanes, liste ou étoile, pie,
// appaloosa (léopard ou couverture), gris pommelé, fanons des chevaux de trait.
//
// Même géométrie que animalShape (src/ui/minigames/draw.js) : la tête, la bouche, le corps et
// le sol sont aux mêmes endroits, donc les zones de l'examen (src/ui/vetStage.js, zonePoints)
// tombent juste. draw.js (partagé avec les mini-jeux) n'est pas modifié.
//
// Tout est dessiné dans un repère local : origine au centre du corps, x vers l'avant de l'animal,
// y vers le bas, en unités du dessin pour s = 1. Les couleurs, les marques de la robe et les
// dégradés sont calculés une fois par cheval (caches), rien n'est alloué de gros à chaque image.

import { animalShape, coatColors, shade, css, makeRng } from './minigames/draw.js';

const TAU = Math.PI * 2;
/** La tête est un peu agrandie autour de l'œil (qui reste à sa place, comme les zones de l'examen). */
const HEAD_K = 1.1;

/** Où palper les pattes (repère local, s = 1) : avant-bras et jambe (au-dessus du jarret). */
export const HORSE_LEG_ZONES = { front: [46.5, 46], hind: [-61, 45] };

// ---------------------------------------------------------------- couleurs et marques (une fois par cheval)

const PALETTES = new Map();
const lum = (n) => (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
function sat(n) {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mx = Math.max(r, g, b);
  return mx ? (mx - Math.min(r, g, b)) / mx : 0;
}

/** Couleurs et marques blanches du cheval (balzanes, liste, taches), gardées en cache. */
function paletteOf(a) {
  const c = coatColors(a).raw;
  const seed = a.look?.seed ?? 7;
  const fluff = a.look?.fluff ?? 1;
  const key = `${c.coat}|${c.sec}|${c.mane}|${c.pattern}|${seed}|${fluff}`;
  let p = PALETTES.get(key);
  if (p) return p;
  const rng = makeRng(seed * 7 + 3);
  const lc = lum(c.coat);
  // Bai : corps brun, crins noirs, et le bas des jambes noir aussi (les « extrémités »).
  const points = lum(c.mane) < lc * 0.55 && lc > 0.14;
  const pattern = c.pattern;
  const leopard = pattern === 'spots' && lc > lum(c.sec);
  const grey = sat(c.coat) < 0.08 && lc > 0.45 && lc < 0.88 && pattern !== 'spots';
  // Balzanes (0 : aucune, 1 : couronne, 2 : boulet, 3 : mi-canon, 4 : jusqu'au genou) : avant proche,
  // arrière proche, avant loin, arrière loin. Liste, étoile ou ladre sur la tête.
  let socks = [0, 0, 0, 0];
  let face = 'none';
  if (pattern === 'socks') {
    socks = socks.map(() => (rng() < 0.45 ? 0 : 1 + Math.floor(rng() * 3)));
    if (socks.every((x) => !x)) socks[1] = 2;
    const r = rng();
    face = r < 0.45 ? 'blaze' : r < 0.8 ? 'star' : 'snip';
  } else if (pattern === 'patches') {
    socks = [4, 4, 3, 4];
    face = 'blaze';
  }
  // Taches : pie (grandes plaques), appaloosa léopard (petites taches partout), couverture (blanc sur la croupe).
  const blobs = [];
  if (pattern === 'patches') {
    for (const [x, y, r] of [[-48, -6, 26], [8, -12, 22], [52, 2, 16], [60, -48, 14]]) {
      blobs.push([x + (rng() - 0.5) * 14, y + (rng() - 0.5) * 10, r * (0.8 + rng() * 0.4), rng() * TAU]);
    }
  }
  const spots = [];
  if (pattern === 'spots') {
    const n = leopard ? 46 : 22;
    for (let i = 0; i < n; i++) {
      const x = leopard ? -84 + rng() * 164 : -82 + rng() * 52;
      const y = leopard ? -34 + rng() * 66 : -32 + rng() * 40;
      spots.push([x, y, 1.6 + rng() * 2.6]);
    }
    if (leopard) for (let i = 0; i < 12; i++) spots.push([58 + rng() * 34, -84 + rng() * 76, 1.4 + rng() * 2]); // encolure
  }
  const dapples = [];
  if (grey) for (let i = 0; i < 18; i++) dapples.push([-70 + rng() * 130, -26 + rng() * 44, 3 + rng() * 3.5]);

  const white = 0xf3efe7;
  const legLow = points ? c.mane : c.coat;
  p = {
    coat: css(c.coat),
    light: shade(c.coat, 0.14),
    mid: shade(c.coat, -0.05),
    dark: shade(c.coat, -0.17),
    far: shade(c.coat, -0.3),
    outline: lc < 0.16 ? 'rgba(0, 0, 0, 0.75)' : shade(c.coat, -0.55),
    line: lc < 0.2 ? 'rgba(255, 255, 255, 0.07)' : 'rgba(40, 20, 8, 0.13)',
    hi: lc > 0.75 ? 'rgba(255, 255, 255, 0.35)' : 'rgba(255, 245, 230, 0.16)',
    mane: css(c.mane),
    maneDark: shade(c.mane, lum(c.mane) < 0.15 ? 0.25 : -0.28),
    maneLight: shade(c.mane, 0.22),
    maneFar: shade(c.mane, -0.25),
    legLow: css(legLow),
    legLowFar: shade(legLow, -0.3),
    points,
    white: css(white),
    whiteFar: shade(white, -0.16),
    sec: css(c.sec),
    secDark: shade(c.sec, -0.12),
    muzzle: lc < 0.2 ? 'rgba(0, 0, 0, 0.25)' : 'rgba(30, 18, 12, 0.2)',
    nostril: lc < 0.2 ? '#050404' : shade(c.coat, -0.72),
    eye: '#1d130d',
    iris: '#4a2c19',
    hoof: '#3b3330',
    hoofLight: '#cdb89a',
    socks,
    face,
    blobs,
    spots,
    leopard,
    dapples,
    feather: fluff >= 1.1,
    fluff,
    key,
    stops: [shade(c.coat, 0.12), css(c.coat), shade(c.coat, -0.08), shade(c.coat, -0.2)],
  };
  PALETTES.set(key, p);
  if (PALETTES.size > 40) PALETTES.delete(PALETTES.keys().next().value);
  return p;
}

// Dégradés (repère local) gardés par contexte de dessin.
const GRADS = new WeakMap();
function gradsOf(g, p) {
  let m = GRADS.get(g);
  if (!m) GRADS.set(g, (m = new Map()));
  let gr = m.get(p.key);
  if (gr) return gr;
  const coat = g.createLinearGradient(0, -125, 0, 102);
  coat.addColorStop(0, p.stops[0]);
  coat.addColorStop(0.42, p.stops[1]);
  coat.addColorStop(0.72, p.stops[2]);
  coat.addColorStop(1, p.stops[3]);
  const glow = (x, y, r) => {
    const q = g.createRadialGradient(x, y, 0, x, y, r);
    q.addColorStop(0, p.hi);
    q.addColorStop(1, 'rgba(255, 255, 255, 0)');
    return q;
  };
  gr = { coat, hip: glow(-50, -16, 34), shoulder: glow(50, -8, 27), neck: glow(66, -62, 22), cheek: glow(-1, 7, 12) };
  // Couleurs des pattes : proches (haut dans le dégradé de la robe) et du fond (plus sombres).
  gr.near = { up: coat, low: p.points ? p.legLow : coat, white: p.white, hoof: p.hoof, hoofWhite: p.hoofLight };
  gr.far = { up: p.far, low: p.points ? p.legLowFar : p.far, white: p.whiteFar, hoof: '#2b2523', hoofWhite: '#b19e84' };
  m.set(p.key, gr);
  if (m.size > 12) m.delete(m.keys().next().value);
  return gr;
}

// ---------------------------------------------------------------- formes

function bodyPath(g) {
  g.moveTo(31, -35.6); // garrot
  g.bezierCurveTo(12, -30.4, -15.6, -30.4, -32.8, -33); // dos
  g.bezierCurveTo(-48.4, -35.6, -67, -33.7, -77.2, -23.8); // croupe
  g.bezierCurveTo(-85.8, -14.9, -85.8, 1.7, -76.4, 10.6); // fesse
  g.bezierCurveTo(-71.8, 18.2, -67, 23.1, -62.4, 28.4); // cuisse
  g.lineTo(-40.6, 27.7); // grasset
  g.bezierCurveTo(-23.4, 31.4, 7.8, 35.6, 35.1, 33.7); // ventre
  g.quadraticCurveTo(42.9, 34, 48.4, 30.4); // passage de sangle
  g.bezierCurveTo(62.4, 28, 76.4, 14.9, 78, 1.7); // poitrail
  g.bezierCurveTo(78, -9.9, 58.5, -31.4, 31, -35.6); // épaule
  g.closePath();
}

/** La crête de l'encolure (du garrot à la nuque) : points de la courbe de Bézier. */
function crest(t, hx, hy, out) {
  const u = 1 - t;
  const x0 = 20; const y0 = -33;
  const x1 = 30; const y1 = -60;
  const x2 = hx - 38; const y2 = hy - 18;
  const x3 = hx - 11; const y3 = hy - 17;
  out[0] = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
  out[1] = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
}

/** L'encolure, tracée dans le même sens que le corps (remplis et découpés d'un seul chemin). */
function neckPath(g, hx, hy) {
  g.moveTo(50, 8);
  g.lineTo(79, 2);
  g.bezierCurveTo(80, -22, hx - 16, hy + 34, hx - 10, hy + 18); // poitrail → dessous de l'encolure
  g.bezierCurveTo(hx - 12, hy + 14, hx - 16, hy + 8, hx - 15, hy - 6); // gorge
  g.lineTo(hx - 11, hy - 17); // nuque
  g.bezierCurveTo(hx - 38, hy - 18, 30, -60, 20, -33); // crête de l'encolure → garrot
  g.closePath();
}

function headPath(g, x, y) {
  g.moveTo(x - 10, y - 17); // nuque
  g.bezierCurveTo(x - 4, y - 20, x + 4, y - 15, x + 8, y - 11); // front
  g.lineTo(x + 32, y + 13); // chanfrein
  g.bezierCurveTo(x + 37, y + 18, x + 42, y + 21, x + 41.5, y + 26.5); // bout du nez
  g.quadraticCurveTo(x + 41, y + 30.5, x + 36, y + 29.8); // lèvre du haut
  g.bezierCurveTo(x + 37, y + 32.5, x + 33.5, y + 34.5, x + 29, y + 33.5); // lèvre du bas, menton
  g.lineTo(x + 17, y + 27.5); // auge
  g.bezierCurveTo(x + 8, y + 31, x - 5, y + 28, x - 9.5, y + 18); // ganache
  g.bezierCurveTo(x - 13, y + 11, x - 14.5, y + 2, x - 14, y - 5);
  g.quadraticCurveTo(x - 14, y - 14, x - 10, y - 17);
  g.closePath();
}

// ---------------------------------------------------------------- pattes

// Points d'une patte (x, y) : 0 haut (dans le corps), 1 coude / grasset, 2 genou / jarret,
// 3 boulet, 4 couronne, 5-8 sabot (haut de la pince, pince au sol, talon au sol, glome).
const LEG = new Float32Array(18);

function rot(P, from, to, cx, cy, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  for (let i = from; i <= to; i++) {
    const dx = P[i * 2] - cx;
    const dy = P[i * 2 + 1] - cy;
    P[i * 2] = cx + dx * c - dy * s;
    P[i * 2 + 1] = cy + dx * s + dy * c;
  }
}

/** Calcule la patte (repère local). swing > 0 : le sabot part vers l'avant ; flex : la patte se plie. */
function legPoints(P, hind, dx, swing, flex, feet) {
  const H = feet - 30;
  if (hind) {
    P[0] = -50; P[1] = 2; P[2] = -58; P[3] = 31; P[4] = -67; P[5] = 30 + 0.38 * H;
    P[6] = -63; P[7] = 30 + 0.79 * H; P[8] = -60.3; P[9] = 30 + 0.895 * H;
  } else {
    P[0] = 52; P[1] = 6; P[2] = 47; P[3] = 30; P[4] = 45.5; P[5] = 30 + 0.42 * H;
    P[6] = 46.2; P[7] = 30 + 0.78 * H; P[8] = 49.2; P[9] = 30 + 0.895 * H;
  }
  for (let i = 0; i < 10; i += 2) P[i] += dx;
  const cx = P[8];
  const cy = P[9];
  P[10] = cx + 3.4; P[11] = cy - 0.2; // haut de la pince
  P[12] = cx + 8.6; P[13] = feet; // pince
  P[14] = cx - 5; P[15] = feet; // talon
  P[16] = cx - 4.4; P[17] = cy + 3.4; // glome
  // La patte balance autour du coude (du grasset) ; en l'air, elle se plie.
  if (swing) rot(P, 2, 8, P[2], P[3], -swing);
  if (flex > 0.02) {
    if (hind) {
      rot(P, 3, 8, P[4], P[5], -flex * 0.5); // le jarret se plie : le canon passe devant
      rot(P, 4, 8, P[6], P[7], flex * 0.6); // le paturon se replie
    } else {
      rot(P, 3, 8, P[4], P[5], flex * 0.8); // le genou se plie : le pied part en arrière
      rot(P, 4, 8, P[6], P[7], flex * 0.45);
    }
  } else {
    // Au sol : le sabot touche le sol (la patte qui balance raccourcit un peu, on l'étire).
    const bottom = Math.max(P[13], P[15]);
    const k = bottom > P[3] + 1 ? (feet - P[3]) / (bottom - P[3]) : 1;
    if (k > 1 && k < 1.2) for (let i = 2; i <= 8; i++) P[i * 2 + 1] = P[3] + (P[i * 2 + 1] - P[3]) * k;
  }
}

/** Un tronçon (trapèze entre deux points, largeurs w1 et w2). */
function seg(g, x1, y1, w1, x2, y2, w2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  // Même sens que les ellipses (sinon, remplis ensemble, leurs recouvrements feraient des trous).
  g.moveTo(x1 + nx * w1 * 0.5, y1 + ny * w1 * 0.5);
  g.lineTo(x1 - nx * w1 * 0.5, y1 - ny * w1 * 0.5);
  g.lineTo(x2 - nx * w2 * 0.5, y2 - ny * w2 * 0.5);
  g.lineTo(x2 + nx * w2 * 0.5, y2 + ny * w2 * 0.5);
  g.closePath();
}

function blob(g, x, y, rx, ry, a = 0) {
  g.moveTo(x + Math.cos(a) * rx, y + Math.sin(a) * rx);
  g.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), a, 0, TAU);
}

/** Point à la fraction t du tronçon i → i + 1 (pour le haut des balzanes). */
function along(P, i, t, out) {
  out[0] = P[i * 2] + (P[i * 2 + 2] - P[i * 2]) * t;
  out[1] = P[i * 2 + 1] + (P[i * 2 + 3] - P[i * 2 + 1]) * t;
}
const TMP = new Float32Array(2);

/**
 * Dessine une patte. mode 'stroke' : le contour (avant de remplir tout le groupe), 'fill' : les couleurs.
 * colors : { up (haut, souvent le dégradé de la robe), low (bas : noir du bai), white, hoof, hoofWhite }.
 */
function drawLeg(g, P, hind, mode, colors, sock) {
  const w = hind ? [34, 22, 12.5, 10.2, 9, 8.2, 8.8] : [28, 19, 11, 9.6, 8.6, 8.2, 8.8];
  const run = (style, from) => {
    // from : 0 toute la patte, 1 depuis le genou/jarret, 2 depuis le boulet…
    if (mode === 'fill') g.fillStyle = style;
    g.beginPath();
    if (from <= 0) {
      seg(g, P[0], P[1], w[0], P[2], P[3], w[1]);
      seg(g, P[2], P[3], w[1], P[4], P[5], w[2]);
      if (hind) blob(g, P[2] - 4, P[3] + 6, 9, 11, 0.3); // muscle de la jambe
    }
    if (from <= 1) {
      blob(g, P[4] + (hind ? -0.5 : 0.6), P[5], hind ? 6.8 : 6.2, hind ? 7 : 6.6);
      if (hind) blob(g, P[4] - 5, P[5] - 4.5, 4.2, 4.2); // pointe du jarret
      seg(g, P[4], P[5], w[3], P[6], P[7], w[4]);
    }
    if (from <= 2) {
      blob(g, P[6] - 1.3, P[7], 6.2, 5.4);
      seg(g, P[6], P[7], w[5], P[8], P[9], w[6]);
    }
    if (mode === 'stroke') g.stroke();
    else g.fill();
  };
  if (mode === 'stroke') {
    run(null, 0);
  } else {
    run(colors.up, 0);
    if (colors.low !== colors.up) {
      // Bas des jambes noir (bai) : fondu sur l'avant-bras / la jambe, franc à partir du genou / jarret.
      g.save();
      g.fillStyle = colors.low;
      for (const [from, alpha] of [[0.35, 0.28], [0.65, 0.4]]) {
        g.globalAlpha = alpha;
        g.beginPath();
        along(P, 1, from, TMP);
        seg(g, TMP[0], TMP[1], (hind ? 22 : 19) - (hind ? 9.5 : 8) * from, P[4], P[5], w[2]);
        g.fill();
      }
      g.restore();
      run(colors.low, 1);
    }
    if (sock) {
      // Balzane : blanc depuis la couronne, le boulet, le milieu du canon ou le genou.
      g.fillStyle = colors.white;
      g.beginPath();
      if (sock >= 4) {
        along(P, 1, 0.8, TMP);
        seg(g, TMP[0], TMP[1], hind ? 14 : 12, P[4], P[5], w[2]);
      }
      if (sock >= 3) {
        if (sock === 3) along(P, 2, 0.45, TMP);
        else { TMP[0] = P[4]; TMP[1] = P[5]; }
        blob(g, TMP[0], TMP[1], w[3] * 0.5, w[3] * 0.42);
        seg(g, TMP[0], TMP[1], w[3], P[6], P[7], w[4]);
      }
      if (sock >= 2) blob(g, P[6] - 1.3, P[7], 6.2, 5.4);
      if (sock >= 2) seg(g, P[6], P[7], w[5], P[8], P[9], w[6]);
      else {
        along(P, 3, 0.45, TMP);
        blob(g, TMP[0], TMP[1], 4.2, 2.6);
        seg(g, TMP[0], TMP[1], 8.4, P[8], P[9], w[6]);
      }
      g.fill();
    }
    // Tendon à l'arrière du canon, genou / jarret dessinés.
    g.strokeStyle = 'rgba(0, 0, 0, 0.16)';
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(P[4] - (hind ? 4.5 : 3.6), P[5] + 6);
    g.lineTo(P[6] - 4.2, P[7] - 4);
    g.stroke();
  }
  // Sabot
  g.beginPath();
  g.moveTo(P[10], P[11]);
  g.lineTo(P[12], P[13]);
  g.lineTo(P[14], P[15]);
  g.lineTo(P[16], P[17]);
  g.quadraticCurveTo(P[8], P[9] - 1.5, P[10], P[11]);
  g.closePath();
  if (mode === 'stroke') {
    g.stroke();
    return;
  }
  g.fillStyle = sock ? colors.hoofWhite : colors.hoof;
  g.fill();
  // Bourrelet de la couronne et lignes de pousse
  g.strokeStyle = 'rgba(255, 255, 255, 0.18)';
  g.lineWidth = 0.8;
  g.beginPath();
  for (const t of [0.4, 0.7]) {
    g.moveTo(P[10] + (P[12] - P[10]) * t, P[11] + (P[13] - P[11]) * t);
    g.lineTo(P[16] + (P[14] - P[16]) * t, P[17] + (P[15] - P[17]) * t);
  }
  g.stroke();
}

/** Fanons (chevaux de trait, poneys) : longs poils sur le boulet et le sabot. */
function drawFeather(g, P, color, t) {
  const x = P[6];
  const y = P[7];
  g.fillStyle = color;
  g.beginPath();
  g.moveTo(x - 2, y - 7);
  g.quadraticCurveTo(x - 9, y + 2, P[14] - 4 + Math.sin(t * 2) * 0.6, P[15] - 0.5);
  g.lineTo(P[14] + 1.5, P[15] - 1);
  g.quadraticCurveTo(P[16] + 3, P[17] - 2, P[10] + 1, P[11] + 1.5);
  g.lineTo(P[12] + 1.2, P[13] - 2);
  g.quadraticCurveTo(P[10] + 4, P[11] - 4, x + 3, y - 3);
  g.closePath();
  g.fill();
  g.strokeStyle = 'rgba(0, 0, 0, 0.18)';
  g.lineWidth = 0.7;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    g.moveTo(x - 3 - i, y - 2 + i * 2);
    g.lineTo(P[14] - 2 + i * 2.5, P[15] - 1.5);
  }
  g.stroke();
}

// ---------------------------------------------------------------- crins

const CP = new Float32Array(2);
const CN = new Float32Array(2);

/** Crinière tombant sur l'encolure, côté visible. */
function drawMane(g, p, hx, hy, t) {
  const n = 10;
  const thick = 15 * p.fluff;
  const fillPath = () => {
    g.beginPath();
    crest(0.1, hx, hy, CP);
    g.moveTo(CP[0], CP[1] - 2);
    for (let i = 1; i <= n; i++) {
      crest(0.1 + (0.86 * i) / n, hx, hy, CP);
      g.lineTo(CP[0], CP[1] - 2.2);
    }
    // Retour par le bas, mèche par mèche (les mèches tombent vers le bas et un peu en arrière).
    for (let i = n; i >= 0; i--) {
      const u = 0.1 + (0.86 * i) / n;
      crest(u, hx, hy, CP);
      crest(Math.max(0, u - 0.05), hx, hy, CN);
      const len = thick * (1.1 - 0.45 * u) * (i % 2 ? 1 : 0.82);
      const sway = Math.sin(t * 2 + i) * 0.8;
      g.quadraticCurveTo(CN[0] - 3, CN[1] + len * 0.7, CP[0] - 3.5 + sway, CP[1] + len);
    }
    g.closePath();
  };
  fillPath();
  g.fillStyle = p.mane;
  g.fill();
  g.strokeStyle = p.maneDark;
  g.lineWidth = 0.9;
  g.stroke();
  // Mèches
  g.beginPath();
  for (let i = 1; i < n; i++) {
    const u = 0.1 + (0.86 * i) / n;
    crest(u, hx, hy, CP);
    const len = thick * (1.1 - 0.45 * u) * (i % 2 ? 0.9 : 0.7);
    g.moveTo(CP[0] + 1, CP[1]);
    g.quadraticCurveTo(CP[0] - 1.5, CP[1] + len * 0.5, CP[0] - 3 + Math.sin(t * 2 + i) * 0.8, CP[1] + len);
  }
  g.strokeStyle = p.maneDark;
  g.lineWidth = 1.1;
  g.stroke();
  g.beginPath();
  for (let i = 1; i < n; i += 2) {
    const u = 0.12 + (0.86 * i) / n;
    crest(u, hx, hy, CP);
    g.moveTo(CP[0] + 2.5, CP[1] - 0.5);
    g.quadraticCurveTo(CP[0] + 0.5, CP[1] + 4, CP[0] - 0.5, CP[1] + 7);
  }
  g.strokeStyle = p.maneLight;
  g.lineWidth = 0.8;
  g.stroke();
}

function drawTail(g, p, t, swish, mode) {
  const sw = Math.sin(t * 1.7) * 2.2 + swish;
  const end = -24 + 80 * (0.92 + 0.12 * p.fluff);
  g.beginPath();
  g.moveTo(-73, -27.5);
  g.bezierCurveTo(-84, -33, -94, -26, -96, -12); // le tronçon de la queue se cambre
  g.bezierCurveTo(-100 + sw * 0.3, 12, -104 + sw * 0.7, end - 30, -100 + sw, end);
  g.quadraticCurveTo(-95 + sw, end + 6, -91 + sw, end - 1);
  g.quadraticCurveTo(-87 + sw, end + 5, -83 + sw, end - 2);
  g.quadraticCurveTo(-80 + sw, end + 2, -78.5 + sw, end - 6);
  g.bezierCurveTo(-83 + sw * 0.7, end - 34, -86 + sw * 0.3, 2, -82, -12);
  g.quadraticCurveTo(-80, -21, -73, -22);
  g.closePath();
  if (mode === 'stroke') {
    g.stroke();
    return;
  }
  g.fillStyle = p.mane;
  g.fill();
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const k = i / 3;
    g.moveTo(-86 - k * 7, -14 + k * 3);
    g.bezierCurveTo(-90 - k * 6 + sw * 0.3, 14, -92 - k * 4 + sw * 0.7, end - 26, -86 - k * 8 + sw, end - 2 - (i % 2) * 3);
  }
  g.strokeStyle = p.maneDark;
  g.lineWidth = 1.1;
  g.stroke();
  g.beginPath();
  g.moveTo(-90, -16);
  g.bezierCurveTo(-94 + sw * 0.3, 8, -95 + sw * 0.6, end - 32, -92 + sw, end - 8);
  g.strokeStyle = p.maneLight;
  g.lineWidth = 0.9;
  g.stroke();
}

// ---------------------------------------------------------------- tête

function drawEar(g, x, y, back, color, inner, mode) {
  g.save();
  g.translate(x, y);
  g.rotate(-0.12 - back * 0.95);
  g.beginPath();
  g.moveTo(-4.2, 1.5);
  g.bezierCurveTo(-6, -7, -3, -15, 0.4, -19.5);
  g.bezierCurveTo(3.2, -14, 4.8, -7, 3.6, 1.5);
  g.closePath();
  if (mode === 'stroke') g.stroke();
  else {
    g.fillStyle = color;
    g.fill();
    if (inner) {
      g.fillStyle = inner;
      g.beginPath();
      g.moveTo(-1.6, -0.5);
      g.quadraticCurveTo(-2.4, -9, 0.3, -15.5);
      g.quadraticCurveTo(1.6, -8, 1.9, -0.5);
      g.closePath();
      g.fill();
    }
  }
  g.restore();
}

function drawHeadDetails(g, p, gr, x, y, o, t) {
  // Dans la tête : bout du nez plus sombre, ganache, liste.
  g.save();
  g.beginPath();
  headPath(g, x, y);
  g.clip();
  g.fillStyle = gr.cheek;
  g.translate(x, y);
  g.fillRect(-14, -6, 28, 28);
  g.translate(-x, -y);
  g.fillStyle = p.muzzle;
  g.beginPath();
  g.ellipse(x + 36, y + 25, 9.5, 9, 0.6, 0, TAU);
  g.fill();
  if (p.face !== 'none') {
    g.fillStyle = p.white;
    g.beginPath();
    if (p.face === 'blaze') {
      g.moveTo(x + 0.5, y - 17);
      g.lineTo(x + 9.5, y - 12.5);
      g.lineTo(x + 33, y + 13.2);
      g.lineTo(x + 43, y + 24);
      g.lineTo(x + 38.6, y + 25.6);
      g.lineTo(x + 30.4, y + 15.4);
      g.lineTo(x + 6.6, y - 5.2);
      g.lineTo(x + 0.6, y - 11);
      g.closePath();
    } else if (p.face === 'star') {
      g.ellipse(x + 5, y - 12, 4.6, 3.2, 0.7, 0, TAU);
    } else {
      g.ellipse(x + 40.5, y + 22, 3.4, 4.6, 0.5, 0, TAU);
    }
    g.fill();
  }
  // La ganache (grosse joue ronde) et la crête faciale.
  g.strokeStyle = p.line;
  g.lineWidth = 1.4;
  g.beginPath();
  g.arc(x + 0.5, y + 12.5, 13.5, -1.25, 1.95);
  g.moveTo(x + 4, y + 4.5);
  g.quadraticCurveTo(x + 11, y + 6.5, x + 18, y + 13);
  g.stroke();
  g.restore();

  // Naseau (virgule) et bouche
  g.fillStyle = p.nostril;
  g.beginPath();
  g.ellipse(x + 35.4, y + 19.4, 3.5, 1.8, 0.95, 0, TAU);
  g.fill();
  g.strokeStyle = p.nostril;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x + 33.4, y + 16.6);
  g.quadraticCurveTo(x + 31.4, y + 21.4, x + 34.6, y + 23.6);
  g.stroke();
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(x + 41, y + 28.6);
  g.quadraticCurveTo(x + 37.6, y + 29.8, x + 33.4, y + 28.8);
  g.moveTo(x + 34.4, y + 31.4);
  g.quadraticCurveTo(x + 32.5, y + 32.8, x + 30, y + 32.6);
  g.stroke();

  // Œil : grand, sombre et brillant, avec la paupière et les cils.
  const ex = x + 5.9;
  const ey = y - 3.15;
  g.fillStyle = 'rgba(0, 0, 0, 0.13)';
  g.beginPath();
  g.ellipse(ex + 0.2, ey + 0.4, 7.2, 5.6, 0.35, 0, TAU);
  g.fill();
  const blink = o.blink || t % 4.6 < 0.13;
  g.strokeStyle = p.eye;
  g.lineCap = 'round';
  if (blink || o.happy) {
    g.lineWidth = 1.5;
    g.beginPath();
    if (o.happy) {
      g.moveTo(ex - 4.4, ey + 0.6);
      g.quadraticCurveTo(ex, ey - 3.2, ex + 4.6, ey);
    } else {
      g.moveTo(ex - 4.4, ey - 0.4);
      g.quadraticCurveTo(ex, ey + 2.2, ex + 4.6, ey + 0.4);
    }
    g.stroke();
    g.lineWidth = 0.8;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      g.moveTo(ex - 1.5 + i * 2, ey + 1.1);
      g.lineTo(ex - 2 + i * 2, ey + 2.8);
    }
    g.stroke();
    return;
  }
  g.fillStyle = p.eye;
  g.beginPath();
  g.ellipse(ex, ey, 5.1, 3.9, 0.32, 0, TAU);
  g.fill();
  g.fillStyle = p.iris;
  g.beginPath();
  g.ellipse(ex + 0.5, ey + 0.4, 3.1, 2.3, 0.32, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.92)';
  g.beginPath();
  g.arc(ex + 1.9, ey - 1.4, 1.3, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(255, 255, 255, 0.35)';
  g.beginPath();
  g.arc(ex - 2.1, ey + 1.4, 0.8, 0, TAU);
  g.fill();
  // Paupière du haut et cils
  g.strokeStyle = p.outline;
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(ex - 5.8, ey + 0.5);
  g.quadraticCurveTo(ex - 0.5, ey - 6.4, ex + 5.8, ey - 0.9);
  g.stroke();
  g.lineWidth = 0.75;
  g.beginPath();
  for (let i = 0; i < 4; i++) {
    const qx = ex - 3 + i * 2.2;
    const qy = ey - 4 + Math.abs(i - 1.5) * 0.8;
    g.moveTo(qx, qy);
    g.lineTo(qx + 1.3, qy - 1.8);
  }
  g.stroke();
}

function drawForelock(g, p, x, y, t) {
  const sw = Math.sin(t * 1.9) * 0.6;
  g.fillStyle = p.mane;
  g.beginPath();
  g.moveTo(x - 11, y - 18);
  g.quadraticCurveTo(x - 1, y - 23, x + 6.5, y - 14);
  g.quadraticCurveTo(x + 8 + sw, y - 9, x + 5.5 + sw, y - 5.5);
  g.quadraticCurveTo(x + 4, y - 8.5, x + 2.4, y - 7.5);
  g.quadraticCurveTo(x + 1.5 + sw, y - 4.5, x - 0.8 + sw, y - 4);
  g.quadraticCurveTo(x - 2.5, y - 11, x - 8, y - 13);
  g.closePath();
  g.fill();
  g.strokeStyle = p.maneDark;
  g.lineWidth = 0.8;
  g.stroke();
  g.beginPath();
  g.moveTo(x - 3, y - 18);
  g.quadraticCurveTo(x + 3, y - 13, x + 3.6 + sw, y - 7);
  g.moveTo(x - 6, y - 16);
  g.quadraticCurveTo(x - 1.5, y - 11, x - 0.2 + sw, y - 6);
  g.stroke();
}

/** Licol bleu (le cheval est tenu pour l'examen). */
function drawHalter(g, x, y) {
  const straps = () => {
    g.beginPath();
    g.moveTo(x + 21.5, y + 1.6); // muserolle
    g.quadraticCurveTo(x + 19, y + 16, x + 20.4, y + 29.4);
    g.moveTo(x + 19.6, y + 21); // montant
    g.quadraticCurveTo(x + 6, y + 6, x - 9.5, y - 12.5);
    g.lineTo(x - 11, y - 16.5);
    g.moveTo(x - 9.5, y - 9); // sous-gorge
    g.quadraticCurveTo(x - 13.5, y + 2, x - 11.5, y + 12);
  };
  g.lineCap = 'round';
  straps();
  g.strokeStyle = '#1d3f66';
  g.lineWidth = 3.6;
  g.stroke();
  straps();
  g.strokeStyle = '#2f6fb0';
  g.lineWidth = 2.3;
  g.stroke();
  g.strokeStyle = '#c9ced3';
  g.lineWidth = 1.1;
  for (const [cx, cy] of [[x + 19.6, y + 21], [x + 20.4, y + 30.6]]) {
    g.beginPath();
    g.arc(cx, cy, 1.9, 0, TAU);
    g.stroke();
  }
}

// ---------------------------------------------------------------- le cheval entier

const NEAR = new Float32Array(18);
const NEAR_H = new Float32Array(18);
const FAR = new Float32Array(18);
const FAR_H = new Float32Array(18);

/**
 * Dessine le cheval de profil (mêmes options que drawAnimal pour un cheval debout :
 * x, y, s, f, walk, headDip, lift, shake, earsBack, blink, happy, time, shadow).
 * Renvoie la forme (animalShape) pour placer les zones et les gestes.
 */
export function drawHorseVet(g, a, o = {}) {
  const sh = animalShape(a, o); // debout (l'examen ne passe pas de pose)
  const { s, f, bx, by } = sh;
  const t = o.time ?? performance.now() / 1000;
  const p = paletteOf(a);
  const gr = gradsOf(g, p);
  const feet = (sh.groundY - sh.lift - by) / s;
  const hx = (sh.head.x - bx) / (f * s);
  const hy = (sh.head.y - by) / s;
  const walking = o.walk !== null && o.walk !== undefined;
  const ph = walking ? o.walk : 0;
  const swing = (k) => (walking ? Math.sin(ph + k) * 0.3 : 0);
  const flex = (k) => (walking ? Math.max(0, Math.cos(ph + k)) * 0.95 : 0);

  g.save();
  if (o.shake) g.translate(Math.sin(t * 40) * o.shake * 4, 0);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  if (o.shadow !== false) {
    const k = 1 - Math.min(0.4, sh.lift / 250);
    g.fillStyle = 'rgba(0, 0, 0, 0.15)';
    g.beginPath();
    g.ellipse(bx - f * 6 * s, sh.groundY + 2, 96 * s * k, 8 * s * k, 0, 0, TAU);
    g.fill();
  }
  g.translate(bx, by);
  g.scale(f * s, s);

  // Pattes du fond (plus sombres), puis la queue.
  legPoints(FAR, false, -8, swing(Math.PI), flex(Math.PI), feet);
  legPoints(FAR_H, true, 8, swing(0), flex(0), feet);
  const farColors = gr.far;
  g.strokeStyle = p.outline;
  g.lineWidth = 2.2;
  drawLeg(g, FAR_H, true, 'stroke', farColors, p.socks[3]);
  drawLeg(g, FAR, false, 'stroke', farColors, p.socks[2]);
  drawLeg(g, FAR_H, true, 'fill', farColors, p.socks[3]);
  drawLeg(g, FAR, false, 'fill', farColors, p.socks[2]);
  if (p.feather) {
    drawFeather(g, FAR_H, p.socks[3] ? p.whiteFar : farColors.low, t);
    drawFeather(g, FAR, p.socks[2] ? p.whiteFar : farColors.low, t);
  }
  g.strokeStyle = p.outline;
  g.lineWidth = 2.2;
  const swish = walking ? Math.sin(ph * 0.5) * 4 : 0;
  drawTail(g, p, t, swish, 'stroke');
  drawTail(g, p, t, swish, 'fill');

  // La tête est agrandie autour de l'œil (headIn) : l'œil, le nez et la bouche restent sur leurs zones.
  const headIn = () => {
    g.translate(hx + 5.9, hy - 3.15);
    g.scale(HEAD_K, HEAD_K);
    g.translate(-hx - 5.9, -hy + 3.15);
  };
  // Oreille du fond
  const earBack = o.earsBack ? 1 : 0;
  g.save();
  headIn();
  g.strokeStyle = p.outline;
  g.lineWidth = 2;
  drawEar(g, hx - 10.5, hy - 14, earBack * 0.9 + 0.12, p.far, null, 'stroke');
  drawEar(g, hx - 10.5, hy - 14, earBack * 0.9 + 0.12, p.far, null, 'fill');
  g.restore();

  // Le groupe du devant (encolure, corps, pattes proches, tête) : d'abord tous les contours,
  // puis toutes les couleurs, pour qu'il ne reste que le contour de la silhouette.
  legPoints(NEAR, false, 0, swing(0), flex(0), feet);
  legPoints(NEAR_H, true, 0, swing(Math.PI), flex(Math.PI), feet);
  const nearColors = gr.near;
  const group = (mode) => {
    if (mode === 'fill') g.fillStyle = gr.coat;
    g.beginPath();
    neckPath(g, hx, hy);
    bodyPath(g);
    if (mode === 'stroke') g.stroke();
    else g.fill();
    drawLeg(g, NEAR_H, true, mode, nearColors, p.socks[1]);
    drawLeg(g, NEAR, false, mode, nearColors, p.socks[0]);
    if (mode === 'fill') g.fillStyle = gr.coat;
    g.save();
    headIn();
    g.beginPath();
    headPath(g, hx, hy);
    if (mode === 'stroke') g.stroke();
    else g.fill();
    g.restore();
  };
  g.strokeStyle = p.outline;
  g.lineWidth = 2.4;
  group('stroke');
  group('fill');
  if (p.feather) {
    drawFeather(g, NEAR_H, p.socks[1] ? p.white : nearColors.low === gr.coat ? p.mid : nearColors.low, t);
    drawFeather(g, NEAR, p.socks[0] ? p.white : nearColors.low === gr.coat ? p.mid : nearColors.low, t);
  }

  // Robe et relief, dans le corps et l'encolure.
  g.save();
  g.beginPath();
  neckPath(g, hx, hy);
  bodyPath(g);
  g.clip();
  if (p.blobs.length) {
    g.fillStyle = p.sec;
    for (const [x, y, r, ang] of p.blobs) {
      g.beginPath();
      g.moveTo(x + r, y);
      for (let i = 1; i <= 6; i++) {
        const a0 = (i / 6) * TAU;
        const rr = r * (0.75 + 0.35 * Math.sin(ang + i * 2.3));
        g.quadraticCurveTo(x + Math.cos(a0 - 0.5) * r * 1.15, y + Math.sin(a0 - 0.5) * r * 0.9, x + Math.cos(a0) * rr, y + Math.sin(a0) * rr * 0.8);
      }
      g.fill();
    }
  }
  if (p.spots.length) {
    if (!p.leopard) {
      // Couverture : la croupe blanche, avec des taches de la couleur de la robe.
      g.fillStyle = p.sec;
      g.beginPath();
      g.ellipse(-56, -16, 40, 26, 0.15, 0, TAU);
      g.fill();
    }
    g.fillStyle = p.leopard ? p.sec : p.coat;
    g.beginPath();
    for (const [x, y, r] of p.spots) blob(g, x, y, r, r * 0.8, 0.4);
    g.fill();
  }
  if (p.dapples.length) {
    g.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    g.lineWidth = 1.6;
    g.beginPath();
    for (const [x, y, r] of p.dapples) {
      g.moveTo(x + r, y);
      g.arc(x, y, r, 0, TAU);
    }
    g.stroke();
  }
  // Muscles : croupe et épaule éclairées, encolure ; lignes de l'épaule et du grasset.
  g.fillStyle = gr.hip;
  g.fillRect(-86, -52, 72, 72);
  g.fillStyle = gr.shoulder;
  g.fillRect(22, -36, 56, 56);
  g.fillStyle = gr.neck;
  g.fillRect(44, -86, 44, 46);
  g.strokeStyle = p.line;
  g.lineWidth = 1.8;
  g.beginPath();
  g.moveTo(30, -26);
  g.bezierCurveTo(36, -8, 34, 8, 44, 22); // arrière de l'épaule
  g.moveTo(-38, -10);
  g.bezierCurveTo(-36, 4, -42, 16, -48, 25); // devant de la cuisse (grasset)
  g.moveTo(hx - 9, hy + 23);
  g.quadraticCurveTo(84, -40, 76, -14); // gouttière de la jugulaire
  g.stroke();
  g.restore();

  // Crinière, tête, oreille du devant, toupet, licol
  drawMane(g, p, hx, hy, t);
  headIn();
  drawHeadDetails(g, p, gr, hx, hy, o, t);
  g.strokeStyle = p.outline;
  g.lineWidth = 2;
  drawEar(g, hx - 5, hy - 15, earBack, p.light, p.points ? p.maneDark : 'rgba(0, 0, 0, 0.28)', 'stroke');
  drawEar(g, hx - 5, hy - 15, earBack, p.light, p.points ? p.maneDark : 'rgba(0, 0, 0, 0.28)', 'fill');
  drawForelock(g, p, hx, hy, t);
  drawHalter(g, hx, hy);
  g.restore();
  return sh;
}

/** Où se trouvent les zones des pattes du cheval (écran), pour la palpation. */
export function horseLegZone(sh, which) {
  const [x, y] = HORSE_LEG_ZONES[which];
  return sh.L(x * sh.s, y * sh.s);
}

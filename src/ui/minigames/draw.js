// Dessin 2D des mini-jeux : couleurs, formes simples, emoji et l'animal vu de profil
// (avec la vraie robe de l'animal : a.look.coat, a.look.secondary, a.look.mane).

import { catTraits } from '../../sim/catBreeds.js'; // chats : poil long, masque colourpoint, gants blancs…
import { horseBreedOf, horseBuild, foalBuild, horseCoatTraits, horseSocks, horseFaceMark } from '../../sim/horseLook.js'; // cheval vu de dessus

export const EMOJI_FONT = '"Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
export const TEXT_FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

const rgb = (n) => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const toCss = ([r, g, b]) => `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;

/** Couleur CSS d'un nombre 0xRRGGBB. */
export const css = (n) => toCss(rgb(n));

/** Éclaircit (k > 0) ou assombrit (k < 0) une couleur. */
export function shade(n, k) {
  const c = rgb(n).map((v) => (k >= 0 ? v + (255 - v) * k : v * (1 + k)));
  return toCss(c);
}

/** Mélange deux couleurs (t = 0 : la première, t = 1 : la seconde). */
export function mix(n1, n2, t) {
  const a = rgb(n1);
  const b = rgb(n2);
  return toCss(a.map((v, i) => v * (1 - t) + b[i] * t));
}

export const clamp = (v, min = 0, max = 1) => Math.max(min, Math.min(max, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);

/** Petit générateur pseudo-aléatoire reproductible (même animal = mêmes taches). */
export function makeRng(seed = 1) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** Distance d'un point au segment [a, b]. */
export function distToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = dx * dx + dy * dy;
  const t = len ? clamp(((px - ax) * dx + (py - ay) * dy) / len) : 0;
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

export function rrect(g, x, y, w, hh, r) {
  g.beginPath();
  g.roundRect ? g.roundRect(x, y, w, hh, r) : g.rect(x, y, w, hh);
}

export function ellipse(g, cx, cy, rx, ry, rot = 0) {
  g.beginPath();
  g.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

export function circle(g, cx, cy, r) {
  g.beginPath();
  g.arc(cx, cy, Math.max(0.1, r), 0, Math.PI * 2);
}

export function emoji(g, ch, x, y, size, rot = 0, alpha = 1) {
  g.save();
  // Sur un canvas, un emoji en couleur prend l'opacité du fillStyle courant : après un
  // remplissage translucide (rgba(…, 0.3)), il était tout pâle. Opaque ici ; la transparence
  // voulue passe par alpha (globalAlpha).
  g.fillStyle = '#000';
  g.globalAlpha *= alpha;
  g.translate(x, y);
  if (rot) g.rotate(rot);
  g.font = `${size}px ${EMOJI_FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(ch, 0, 0);
  g.restore();
}

/** Texte arrondi bien lisible (contour blanc). */
export function label(g, text, x, y, size = 18, color = '#23302a', align = 'center') {
  g.save();
  g.font = `800 ${size}px ${TEXT_FONT}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.28;
  g.strokeStyle = 'rgba(255,255,255,0.92)';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
  g.restore();
}

/** Ciel + sol simples. */
export function sky(g, view, top = '#bfe3f7', bottom = '#eaf6ff', groundY = 300, ground = '#8cc268', ground2 = '#6fa94f') {
  let gr = g.createLinearGradient(0, view.y0, 0, groundY);
  gr.addColorStop(0, top);
  gr.addColorStop(1, bottom);
  g.fillStyle = gr;
  g.fillRect(view.x0, view.y0, view.w, groundY - view.y0);
  gr = g.createLinearGradient(0, groundY, 0, view.y1);
  gr.addColorStop(0, ground);
  gr.addColorStop(1, ground2);
  g.fillStyle = gr;
  g.fillRect(view.x0, groundY, view.w, view.y1 - groundY);
}

/** Fond uni (ou dégradé vertical) qui couvre tout l'écran du mini-jeu. */
export function fillView(g, view, c1, c2 = c1) {
  const gr = g.createLinearGradient(0, view.y0, 0, view.y1);
  gr.addColorStop(0, c1);
  gr.addColorStop(1, c2);
  g.fillStyle = gr;
  g.fillRect(view.x0, view.y0, view.w, view.h);
}

/** Carrelage de salle de bain. */
export function tiles(g, view, color = '#d8eef6', line = '#bfdde9', size = 40) {
  g.fillStyle = color;
  g.fillRect(view.x0, view.y0, view.w, view.h);
  g.strokeStyle = line;
  g.lineWidth = 2;
  g.beginPath();
  for (let x = Math.floor(view.x0 / size) * size; x < view.x1; x += size) { g.moveTo(x, view.y0); g.lineTo(x, view.y1); }
  for (let y = Math.floor(view.y0 / size) * size; y < view.y1; y += size) { g.moveTo(view.x0, y); g.lineTo(view.x1, y); }
  g.stroke();
}

// ---------------------------------------------------------------- l'animal de profil

// Proportions (en unités du mini-jeu pour s = 1). hdx / hdy : position de la tête
// par rapport au centre du corps.
const BODY = {
  dog: { rx: 70, ry: 31, leg: 50, legW: 13, hr: 27, snout: 20, hdx: 78, hdy: -48, hoof: false },
  cat: { rx: 58, ry: 25, leg: 42, legW: 10, hr: 25, snout: 6, hdx: 62, hdy: -36, hoof: false },
  rabbit: { rx: 52, ry: 40, leg: 10, legW: 15, hr: 27, snout: 6, hdx: 46, hdy: -34, hoof: false },
  horse: { rx: 78, ry: 33, leg: 78, legW: 13, hr: 21, snout: 30, hdx: 100, hdy: -88, hoof: true },
  sheep: { rx: 70, ry: 40, leg: 38, legW: 9, hr: 22, snout: 14, hdx: 80, hdy: -26, hoof: true },
  goat: { rx: 62, ry: 29, leg: 54, legW: 9, hr: 20, snout: 18, hdx: 76, hdy: -56, hoof: true },
  cow: { rx: 84, ry: 40, leg: 50, legW: 15, hr: 26, snout: 18, hdx: 98, hdy: -24, hoof: true },
};

/**
 * Calcule où se trouvent les parties de l'animal (sans dessiner).
 * o : { x, y (sol), s (taille), f (1 = regarde à droite, -1 = à gauche), pose: 'stand' | 'sit' | 'beg' | 'down' (couché), lift }
 */
export function animalShape(a, o = {}) {
  const P = BODY[a.species] ?? BODY.dog;
  const s = o.s ?? 1;
  const f = o.f ?? 1;
  const groundY = o.y ?? 300;
  const lift = o.lift ?? 0;
  const rx = P.rx * s * (a.species === 'sheep' && o.shorn ? 0.86 : 1);
  const ry = P.ry * s * (a.species === 'sheep' && o.shorn ? 0.78 : 1);
  const leg = P.leg * s;
  const pose = o.pose ?? 'stand';
  const rot = pose === 'sit' ? -0.45 : pose === 'beg' ? -0.95 : 0;
  const ang = rot * f;
  let bx = o.x ?? 200;
  let by = groundY - leg - ry * 0.72 - lift;
  if (pose === 'sit') {
    bx -= f * rx * 0.22;
    by = groundY - ry - rx * 0.36 - lift;
  } else if (pose === 'beg') {
    bx -= f * rx * 0.3;
    by = groundY - rx * 0.78 - lift;
  } else if (pose === 'down') {
    // Couché : le ventre presque au sol, la tête levée.
    by = groundY - ry * 0.98 - lift;
  }
  const ux = [Math.cos(ang) * f, Math.sin(ang) * f];
  const uy = [-Math.sin(ang), Math.cos(ang)];
  const L = (lx, ly) => ({ x: bx + ux[0] * lx + uy[0] * ly, y: by + ux[1] * lx + uy[1] * ly });
  const dip = (o.headDip ?? 0) * s;
  const head = L(P.hdx * s, P.hdy * s);
  head.y += dip * (P.leg + 30) * 0.9;
  head.x += f * dip * 10;
  if (pose === 'sit') head.y -= 6 * s;
  const hr = P.hr * s;
  const mouth = { x: head.x + f * (hr * 0.6 + P.snout * s * 0.9), y: head.y + hr * 0.45 };
  if (a.species === 'horse') { mouth.x = head.x + f * hr * 1.7; mouth.y = head.y + hr * 1.25; }
  return {
    a, P, s, f, pose, ang, rx, ry, leg, bx, by, groundY, lift, L, hr,
    head,
    mouth,
    chest: L(rx * 0.72, ry * 0.25),
    neck: a.species === 'horse' ? L(rx * 0.95, -ry * 1.15) : L(rx * 0.92, -ry * 0.5),
    withers: L(rx * 0.5, -ry * 0.82), // (le garrot : en haut des épaules, au bout de la crinière)
    back: L(-rx * 0.1, -ry * 0.75),
    rump: L(-rx * 0.65, -ry * 0.3),
    belly: L(0, ry * 0.6),
    cheek: { x: head.x + f * hr * 0.25, y: head.y + hr * 0.35 },
    headTop: { x: head.x - f * hr * 0.15, y: head.y - hr * 0.75 },
    forehead: { x: head.x + f * hr * 0.35, y: head.y - hr * 0.45 },
    udder: L(-rx * 0.22, ry * 0.88),
  };
}

/** Le point (x, y) touche-t-il l'animal (corps ou tête) ? */
export function hitAnimal(sh, x, y, pad = 0) {
  const dx = x - sh.bx;
  const dy = y - sh.by;
  const c = Math.cos(-sh.ang);
  const sn = Math.sin(-sh.ang);
  const lx = dx * c - dy * sn;
  const ly = dx * sn + dy * c;
  const inBody = (lx * lx) / ((sh.rx + pad) ** 2) + (ly * ly) / ((sh.ry + pad) ** 2) <= 1;
  const inHead = dist(x, y, sh.head.x, sh.head.y) <= sh.hr * 1.35 + pad;
  const inNeck = dist(x, y, sh.neck.x, sh.neck.y) <= sh.hr * 1.1 + pad;
  return inBody || inHead || inNeck;
}

/** Le point est-il dans l'ellipse du corps (avec une marge) ? */
export function inBody(sh, x, y, k = 1) {
  const dx = x - sh.bx;
  const dy = y - sh.by;
  const c = Math.cos(-sh.ang);
  const sn = Math.sin(-sh.ang);
  const lx = dx * c - dy * sn;
  const ly = dx * sn + dy * c;
  return (lx * lx) / ((sh.rx * k) ** 2) + (ly * ly) / ((sh.ry * k) ** 2) <= 1;
}

function colorsOf(a) {
  const l = a.look ?? {};
  const coat = l.coat ?? 0xc98c43;
  const sec = l.secondary ?? coat;
  return { coat, sec, third: l.third ?? sec, mane: l.mane ?? sec, eye: l.eye ?? 0x2a1a10, pattern: l.pattern ?? 'solid' };
}

/** Couleurs CSS de la robe, pour les mini-jeux. */
export function coatColors(a) {
  const c = colorsOf(a);
  return { coat: css(c.coat), sec: css(c.sec), mane: css(c.mane), dark: shade(c.coat, -0.35), light: shade(c.coat, 0.3), raw: c };
}

/**
 * Dessine l'animal de profil.
 * o : options d'animalShape + { walk (phase des pattes), blink, happy, mouth, wag, earsBack, shorn, noWool, shake,
 *       shadow (false : pas d'ombre au sol), lip (cheval : il tend la lèvre du haut) }
 * lift (animalShape) : l'animal saute, pattes comprises (elles ne vont plus jusqu'au sol) ; son
 * ombre reste au sol, plus petite quand il est haut.
 * Renvoie la forme (animalShape) pour placer des choses dessus.
 */
export function drawAnimal(g, a, o = {}) {
  const sh = animalShape(a, o);
  const { P, s, f, rx, ry, L } = sh;
  const c = colorsOf(a);
  const sp = a.species;
  const time = o.time ?? performance.now() / 1000;
  const pts = c.pattern === 'points';
  const legColor = pts || c.pattern === 'tan' ? c.sec : c.coat;
  // Chats : poil (long, nu…), taches blanches (gants, bicolore), oreilles de race. Le masque est dessiné sur la tête.
  const ct = sp === 'cat' ? catTraits(a.look ?? {}) : null;
  const faceColor = pts && !ct ? c.sec : c.coat;
  const earColor = pts || c.pattern === 'tan' ? c.sec : sp === 'dog' && c.pattern === 'tricolor' ? c.sec : c.coat;
  const outline = shade(c.coat, -0.45);
  const look = a.look ?? {};
  const earType = look.earType ?? sp;
  const tailType = look.tailType ?? sp;
  const fluff = look.fluff ?? 1;

  g.save();
  if (o.shake) g.translate(Math.sin(time * 40) * o.shake * 4, 0);
  g.lineJoin = 'round';
  g.lineCap = 'round';

  // Les pieds : au sol, ou en l'air de `lift` quand l'animal saute (sinon, pattes en échasses).
  const lift = Math.max(0, sh.lift ?? 0);
  const feetY = sh.groundY - lift;

  // Ombre au sol (plus petite quand l'animal est en l'air)
  if (o.shadow !== false) {
    const k = 1 - Math.min(0.4, lift / 250);
    g.fillStyle = 'rgba(0,0,0,0.13)';
    ellipse(g, sh.bx, sh.groundY + 2, rx * 1.15 * k, 9 * s * k);
    g.fill();
  }

  // ---- pattes
  const legW = P.legW * s;
  const legTop = (lx) => L(lx, ry * 0.35);
  const drawLeg = (lx, phase, far) => {
    const top = legTop(lx);
    const swing = o.walk != null ? Math.sin(o.walk + phase) * 0.38 : 0;
    const len = feetY - top.y;
    const foot = { x: top.x + Math.sin(swing) * len, y: top.y + Math.cos(swing) * len };
    g.strokeStyle = far ? shade(legColor === c.coat ? c.coat : c.sec, -0.25) : css(legColor);
    g.lineWidth = legW;
    g.beginPath();
    g.moveTo(top.x, top.y);
    g.lineTo(foot.x, foot.y - legW * 0.3);
    g.stroke();
    if (c.pattern === 'socks' || (sp === 'dog' && c.pattern === 'patches')) {
      g.strokeStyle = far ? shade(c.sec, -0.2) : css(c.sec);
      g.beginPath();
      g.moveTo(lerp(top.x, foot.x, 0.65), lerp(top.y, foot.y, 0.65));
      g.lineTo(foot.x, foot.y - legW * 0.3);
      g.stroke();
    }
    if (P.hoof) {
      g.fillStyle = far ? '#2b2420' : '#3a302a';
      rrect(g, foot.x - legW * 0.62, foot.y - legW * 0.75, legW * 1.24, legW * 0.8, 3 * s);
      g.fill();
    } else {
      const glove = ct && (ct.white === 'gloves' || ct.white === 'mitted' || ct.white === 'bicolor');
      if (ct?.white === 'bicolor') {
        // Bicolore : pattes blanches presque jusqu'en haut.
        g.strokeStyle = far ? '#dcd8d0' : '#f6f3ee';
        g.beginPath();
        g.moveTo(lerp(top.x, foot.x, 0.25), lerp(top.y, foot.y, 0.25));
        g.lineTo(foot.x, foot.y - legW * 0.3);
        g.stroke();
      }
      g.fillStyle = glove ? (far ? '#dcd8d0' : '#f6f3ee') : far ? shade(legColor, -0.25) : css(legColor);
      ellipse(g, foot.x + f * legW * 0.25, foot.y - legW * 0.35, legW * 0.75, legW * 0.45);
      g.fill();
    }
  };
  const front = rx * 0.58;
  const rear = -rx * 0.58;
  if (sh.pose === 'stand') {
    drawLeg(front - 10 * s, Math.PI, true);
    drawLeg(rear + 8 * s, 0, true);
  }

  // ---- queue
  const tailBase = L(-rx * 0.95, -ry * 0.25);
  const wag = Math.sin(time * (o.wag ? 14 : 2.5)) * (o.wag ? 0.5 : 0.12);
  g.save();
  g.translate(tailBase.x, tailBase.y);
  g.scale(f, 1);
  g.rotate(-wag);
  drawTail(g, tailType, sp, s, c, ct && (ct.hair === 'long' || ct.hair === 'semi') ? fluff * 1.5 : ct?.hair === 'hairless' ? 0.7 : fluff);
  g.restore();

  // ---- corps
  if (sp === 'sheep' && !o.shorn && !o.noWool) {
    drawWoolBody(g, sh, c);
  } else {
    g.fillStyle = sp === 'sheep' ? mix(c.coat, 0xf2c4b4, 0.55) : css(c.coat);
    ellipse(g, sh.bx, sh.by, rx, ry, sh.ang);
    g.fill();
    g.save();
    ellipse(g, sh.bx, sh.by, rx, ry, sh.ang);
    g.clip();
    drawPattern(g, sh, c, a);
    if (ct) drawCatCoat(g, sh, c, ct);
    // Ombre douce sous le ventre
    g.fillStyle = 'rgba(0,0,0,0.08)';
    const b = L(0, ry * 0.95);
    ellipse(g, b.x, b.y, rx * 1.1, ry * 0.45, sh.ang);
    g.fill();
    g.restore();
    if (ct && (ct.hair === 'long' || ct.hair === 'semi')) drawLongFur(g, sh, c, ct);
  }
  // Pis de la vache / chèvre
  if ((sp === 'cow' || sp === 'goat') && a.sex === 'f' && sh.pose === 'stand') {
    const u = sh.udder;
    g.fillStyle = '#f2a9b4';
    ellipse(g, u.x, u.y, 13 * s, 9 * s);
    g.fill();
  }
  // Pattes arrière pliées (assis)
  if (sh.pose !== 'stand') {
    const hp = L(-rx * 0.5, ry * 0.25);
    g.fillStyle = shade(c.coat, -0.06);
    ellipse(g, hp.x, Math.min(hp.y, feetY - ry * 0.7), ry * 0.95, ry * 0.75, sh.ang * 0.4);
    g.fill();
    g.fillStyle = css(legColor);
    ellipse(g, hp.x + f * ry * 0.5, feetY - 5 * s, ry * 0.6, 6 * s);
    g.fill();
  }

  // ---- pattes avant (proches)
  if (sh.pose === 'stand') {
    drawLeg(front, 0, false);
    drawLeg(rear, Math.PI, false);
  } else if (sh.pose === 'sit') {
    const top = L(rx * 0.6, ry * 0.2);
    g.strokeStyle = css(legColor);
    g.lineWidth = legW;
    g.beginPath();
    g.moveTo(top.x, top.y);
    g.lineTo(top.x + f * 4 * s, feetY - legW * 0.4);
    g.stroke();
    g.fillStyle = ct && ct.white && ct.white !== 'chest' ? '#f6f3ee' : css(legColor);
    ellipse(g, top.x + f * (4 + legW * 0.3) * s, feetY - legW * 0.35, legW * 0.75, legW * 0.45);
    g.fill();
  } else if (sh.pose === 'down') {
    // Couché : les pattes avant allongées devant, à plat sur le sol.
    const top = L(rx * 0.5, ry * 0.45);
    const y = feetY - legW * 0.45;
    const tip = top.x + f * rx * 0.7;
    g.strokeStyle = css(legColor);
    g.lineWidth = legW;
    g.beginPath();
    g.moveTo(top.x, Math.min(top.y, y));
    g.lineTo(tip, y);
    g.stroke();
    g.fillStyle = ct && ct.white && ct.white !== 'chest' ? '#f6f3ee' : css(legColor);
    ellipse(g, tip + f * legW * 0.35, y + legW * 0.05, legW * 0.8, legW * 0.45);
    g.fill();
  } else {
    // Debout sur les pattes arrière : petites pattes devant le ventre
    const p = L(rx * 0.75, ry * 0.45);
    g.fillStyle = css(legColor);
    ellipse(g, p.x + f * 6 * s, p.y, legW * 0.9, legW * 0.6);
    g.fill();
  }

  // ---- cou
  const neckBase = L(rx * 0.7, -ry * 0.25);
  if (sp === 'horse' || sp === 'goat' || sp === 'dog' || sp === 'cow' || sp === 'cat') {
    const w = { horse: 30, goat: 17, dog: 22, cow: 30, cat: 16 }[sp] * s;
    g.strokeStyle = sp === 'cow' || sp === 'cat' ? css(c.coat) : css(pts && sp === 'goat' ? c.sec : c.coat);
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(neckBase.x, neckBase.y);
    g.lineTo(sh.head.x - f * sh.hr * 0.2, sh.head.y + sh.hr * 0.2);
    g.stroke();
  }
  // Crinière
  if (sp === 'horse') {
    g.strokeStyle = css(c.mane);
    g.lineWidth = 9 * s;
    g.beginPath();
    const m0 = L(rx * 0.55, -ry * 0.95);
    g.moveTo(m0.x, m0.y);
    g.quadraticCurveTo(lerp(m0.x, sh.head.x, 0.5) - f * 8 * s, lerp(m0.y, sh.head.y, 0.5) - 10 * s, sh.head.x - f * sh.hr * 0.45, sh.head.y - sh.hr * 0.75);
    g.stroke();
    // mèches
    g.lineWidth = 4 * s;
    for (let i = 0; i < 5; i++) {
      const t = i / 5;
      const px = lerp(m0.x, sh.head.x - f * sh.hr * 0.4, t);
      const py = lerp(m0.y, sh.head.y - sh.hr * 0.7, t) - 4 * s;
      g.beginPath();
      g.moveTo(px, py);
      g.lineTo(px - f * 7 * s, py + 12 * s + Math.sin(time * 3 + i) * 2);
      g.stroke();
    }
  }

  // ---- tête
  drawHead(g, sh, c, { faceColor, earColor, earType, o, time, outline, fluff, ct });
  g.restore();
  return sh;
}

// ---------------------------------------------------------------- chats : robes et poils

/** Motifs propres aux chats sur le corps (dans l'ellipse du corps) : marbré, rosettes, agouti, écaille, blanc. */
function drawCatCoat(g, sh, c, ct) {
  const { rx, ry, L, s } = sh;
  const rng = makeRng((sh.a.look?.seed ?? 3) + 11);
  const p = ct.pattern;
  if (p === 'classic') {
    g.strokeStyle = css(c.sec);
    g.globalAlpha = 0.65;
    g.lineWidth = 5 * s;
    const q = L(-rx * 0.15, -ry * 0.05);
    for (const r of [0.22, 0.45]) {
      g.beginPath();
      g.ellipse(q.x, q.y, rx * r, ry * r * 1.3, sh.ang, 0, Math.PI * 2);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (p === 'rosettes') {
    for (let i = 0; i < 16; i++) {
      const q = L((rng() - 0.5) * rx * 1.7, (rng() - 0.65) * ry * 1.3);
      const r = (4 + rng() * 3) * s;
      g.fillStyle = shade(c.coat, -0.18);
      ellipse(g, q.x, q.y, r * 1.3, r, sh.ang);
      g.fill();
      g.strokeStyle = css(c.sec);
      g.lineWidth = 2.2 * s;
      g.beginPath();
      g.ellipse(q.x, q.y, r * 1.3, r, sh.ang, rng() * 2, rng() * 2 + 4.2);
      g.stroke();
    }
  } else if (p === 'ticked') {
    g.fillStyle = shade(c.sec, 0.1);
    g.globalAlpha = 0.25;
    for (let i = 0; i < 90; i++) {
      const q = L((rng() - 0.5) * rx * 2, (rng() - 0.7) * ry * 1.6);
      circle(g, q.x, q.y, 1.4 * s);
      g.fill();
    }
    g.globalAlpha = 1;
  } else if (p === 'tortie') {
    g.fillStyle = css(c.sec);
    for (let i = 0; i < 7; i++) {
      const q = L((rng() - 0.5) * rx * 1.8, (rng() - 0.5) * ry * 1.6);
      ellipse(g, q.x, q.y, (8 + rng() * 12) * s, (6 + rng() * 8) * s, rng() * 3);
      g.fill();
    }
  } else if (p === 'points') {
    // Colourpoint : le dos un peu plus foncé.
    g.fillStyle = css(c.sec);
    g.globalAlpha = 0.15;
    const q = L(-rx * 0.1, -ry * 0.8);
    ellipse(g, q.x, q.y, rx * 1.1, ry * 0.6, sh.ang);
    g.fill();
    g.globalAlpha = 1;
  }
  if (ct.white === 'mitted' || ct.white === 'bicolor' || ct.white === 'chest') {
    g.fillStyle = '#f6f3ee';
    const q = L(rx * 0.1, ry * 0.95);
    const k = ct.white === 'bicolor' ? 0.6 : 0.3;
    ellipse(g, q.x, q.y, rx * (ct.white === 'chest' ? 0.4 : 1.0), ry * k, sh.ang);
    g.fill();
  }
}

/** Poil long : franges sous le ventre et collerette sur le poitrail. */
function drawLongFur(g, sh, c, ct) {
  const { rx, ry, L, s } = sh;
  const long = ct.hair === 'long' ? 1 : 0.6;
  const belly = ct.white === 'bicolor' || ct.white === 'mitted' ? '#f6f3ee' : css(c.coat);
  g.fillStyle = belly;
  // Frange de mèches sous le ventre : une seule forme, festonnée en bas (silhouette duveteuse).
  const n = 8;
  const edgeY = (t) => ry * Math.sqrt(Math.max(0.05, 1 - t * t));
  g.beginPath();
  const p0 = L(-rx * 0.8, edgeY(-0.8) * 0.4);
  g.moveTo(p0.x, p0.y);
  for (let i = 0; i <= n; i++) {
    const t = -0.8 + (i / n) * 1.6;
    const a = L(rx * t, edgeY(t) * 0.92);
    if (i === 0) g.lineTo(a.x, a.y);
    else {
      const tm = t - 0.8 / n;
      const b = L(rx * tm, edgeY(tm) * (1.08 + 0.14 * long) + 2 * s);
      g.quadraticCurveTo(b.x, b.y, a.x, a.y);
    }
  }
  const p1 = L(rx * 0.8, edgeY(0.8) * 0.4);
  g.lineTo(p1.x, p1.y);
  g.closePath();
  g.fill();
  // Collerette.
  g.fillStyle = ct.pattern === 'points' || ct.white ? '#f4f0e8' : shade(c.coat, 0.12);
  const q = L(rx * 0.78, -ry * 0.05);
  ellipse(g, q.x, q.y, ry * (0.75 + 0.25 * long), ry * (0.95 + 0.2 * long), sh.ang);
  g.fill();
}

function drawTail(g, type, sp, s, c, fluff) {
  g.strokeStyle = css(c.coat);
  g.fillStyle = css(c.coat);
  if (type === 'horse') {
    g.strokeStyle = css(c.mane);
    g.lineWidth = 14 * s;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(-22 * s, 18 * s, -16 * s, 70 * s);
    g.stroke();
    g.lineWidth = 6 * s;
    g.beginPath();
    g.moveTo(-6 * s, 10 * s);
    g.quadraticCurveTo(-30 * s, 30 * s, -26 * s, 72 * s);
    g.stroke();
  } else if (type === 'cow') {
    g.lineWidth = 5 * s;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(-12 * s, 20 * s, -8 * s, 52 * s);
    g.stroke();
    g.fillStyle = css(c.sec === c.coat ? 0x2a2420 : c.sec);
    ellipse(g, -8 * s, 56 * s, 6 * s, 10 * s);
    g.fill();
  } else if (type === 'pompom') {
    g.fillStyle = '#fbf8f2';
    circle(g, -4 * s, 2 * s, 12 * s * fluff);
    g.fill();
  } else if (type === 'stub' || type === 'goat' || sp === 'sheep') {
    g.lineWidth = 9 * s;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(-10 * s, type === 'goat' ? -14 * s : 10 * s);
    g.stroke();
  } else if (type === 'curl') {
    g.lineWidth = 11 * s * fluff;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-24 * s, -10 * s, -30 * s, -42 * s, -6 * s, -38 * s);
    g.stroke();
  } else if (type === 'cat') {
    g.lineWidth = 9 * s * fluff;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-30 * s, 0, -36 * s, -40 * s, -22 * s, -62 * s);
    g.stroke();
    if (c.pattern === 'points' || c.pattern === 'tabby') {
      g.strokeStyle = css(c.sec);
      g.lineWidth = 9 * s * fluff;
      g.beginPath();
      g.moveTo(-33 * s, -40 * s);
      g.quadraticCurveTo(-34 * s, -52 * s, -22 * s, -62 * s);
      g.stroke();
    }
  } else {
    // chien
    g.lineWidth = 10 * s * fluff;
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(-26 * s, -8 * s, -34 * s, -34 * s);
    g.stroke();
    if (c.pattern === 'tricolor' || c.pattern === 'patches') {
      g.strokeStyle = css(c.sec);
      g.beginPath();
      g.moveTo(-31 * s, -26 * s);
      g.lineTo(-34 * s, -34 * s);
      g.stroke();
    }
  }
}

function drawWoolBody(g, sh, c) {
  const { rx, ry, L, s } = sh;
  const wool = css(c.coat);
  g.fillStyle = shade(c.coat, -0.12);
  ellipse(g, sh.bx, sh.by + 3 * s, rx * 1.02, ry * 1.02, sh.ang);
  g.fill();
  g.fillStyle = wool;
  ellipse(g, sh.bx, sh.by, rx, ry, sh.ang);
  g.fill();
  for (let i = 0; i < 18; i++) {
    const t = (i / 18) * Math.PI * 2;
    const p = L(Math.cos(t) * rx * 0.88, Math.sin(t) * ry * 0.85);
    circle(g, p.x, p.y, 15 * s);
    g.fill();
  }
  g.fillStyle = shade(c.coat, 0.35);
  const rng = makeRng(7);
  for (let i = 0; i < 12; i++) {
    const p = L((rng() - 0.5) * rx * 1.5, (rng() - 0.6) * ry * 1.3);
    circle(g, p.x, p.y, 5 * s);
    g.fill();
  }
}

function drawPattern(g, sh, c, a) {
  const { rx, ry, L, s } = sh;
  const rng = makeRng(a.look?.seed ?? 3);
  const p = c.pattern;
  if (p === 'patches' || p === 'tricolor') {
    g.fillStyle = css(c.sec);
    for (let i = 0; i < 4; i++) {
      const q = L((rng() - 0.5) * rx * 1.6, (rng() - 0.6) * ry * 1.2);
      ellipse(g, q.x, q.y, (16 + rng() * 22) * s, (12 + rng() * 14) * s, rng() * 3);
      g.fill();
    }
    if (p === 'tricolor') {
      g.fillStyle = css(c.third);
      const q = L(-rx * 0.1, -ry * 0.6);
      ellipse(g, q.x, q.y, rx * 0.55, ry * 0.5, sh.ang);
      g.fill();
    }
  } else if (p === 'spots') {
    g.fillStyle = css(c.sec);
    for (let i = 0; i < 22; i++) {
      const q = L((rng() - 0.5) * rx * 1.9, (rng() - 0.5) * ry * 1.9);
      circle(g, q.x, q.y, (3 + rng() * 4) * s);
      g.fill();
    }
  } else if (p === 'tabby') {
    g.strokeStyle = css(c.sec);
    g.globalAlpha = 0.6;
    g.lineWidth = 6 * s;
    for (let i = -3; i <= 3; i++) {
      const q = L(i * rx * 0.24, -ry);
      const q2 = L(i * rx * 0.24 - 6 * s, ry * 0.2);
      g.beginPath();
      g.moveTo(q.x, q.y);
      g.quadraticCurveTo(q.x + 8 * s, (q.y + q2.y) / 2, q2.x, q2.y);
      g.stroke();
    }
    g.globalAlpha = 1;
  } else if (p === 'bicolor' || p === 'tan') {
    g.fillStyle = css(c.sec);
    const q = L(rx * 0.15, ry * 0.95);
    ellipse(g, q.x, q.y, rx * 1.0, ry * 0.6, sh.ang);
    g.fill();
  }
}

function drawHead(g, sh, c, { faceColor, earColor, earType, o, time, outline, fluff, ct }) {
  const { s, f, hr } = sh;
  const sp = sh.a.species;
  const { x, y } = sh.head;
  const face = css(faceColor);

  // Oreilles du fond
  const earBack = o.earsBack ? 0.7 : 0;
  const ear = (dx, far) => {
    g.save();
    g.translate(x + f * dx * hr, y - hr * 0.55);
    g.scale(f, 1);
    g.rotate(-earBack);
    g.fillStyle = far ? shade(earColor, -0.2) : css(earColor);
    const k = hr / 25;
    if (earType === 'floppy' || earType === 'lop') {
      ellipse(g, -6 * k, 18 * k, 9 * k, (earType === 'lop' ? 24 : 20) * k, 0.25);
      g.fill();
    } else if (earType === 'rabbit') {
      ellipse(g, -2 * k, -26 * k, 8 * k, 26 * k, -0.15);
      g.fill();
      if (!far) {
        g.fillStyle = '#f3b6c0';
        ellipse(g, -2 * k, -26 * k, 4 * k, 20 * k, -0.15);
        g.fill();
      }
    } else if (earType === 'horse' || earType === 'goat' || earType === 'cow' || earType === 'sheep') {
      const side = earType === 'cow' || earType === 'sheep';
      g.save();
      if (side) g.rotate(-1.1);
      ellipse(g, -2 * k, -14 * k, 6 * k, 14 * k, -0.2);
      g.fill();
      g.restore();
    } else if (earType === 'cat_fold') {
      // Scottish fold : petite oreille pliée vers l'avant.
      ellipse(g, 0, -6 * k, 9 * k, 6 * k, 0.5);
      g.fill();
    } else {
      // pointues (chat, husky…), semi, chauve-souris ; chats : grandes, petites, à pinceaux
      const big = { bat: 1.35, cat_big: 1.35, cat_small: 0.72, cat_lynx: 1.15 }[earType] ?? 1;
      if (earType === 'cat_lynx' && !far) {
        g.save();
        g.strokeStyle = shade(earColor, -0.5);
        g.lineWidth = 1.6 * k;
        g.beginPath();
        g.moveTo(-4 * k, -22 * k * big);
        g.lineTo(-5 * k, -30 * k * big);
        g.stroke();
        g.restore();
      }
      g.beginPath();
      g.moveTo(-12 * k, 4 * k);
      g.lineTo(-4 * k, -22 * k * big);
      g.lineTo(8 * k, 2 * k);
      g.closePath();
      g.fill();
      if (earType === 'semi' && !far) {
        g.beginPath();
        g.moveTo(-4 * k, -22 * k);
        g.lineTo(4 * k, -12 * k);
        g.lineTo(-6 * k, -12 * k);
        g.fill();
      }
      if (!far) {
        g.fillStyle = '#f0b0b8';
        g.beginPath();
        g.moveTo(-8 * k, 2 * k);
        g.lineTo(-4 * k, -15 * k * big);
        g.lineTo(3 * k, 1 * k);
        g.fill();
      }
    }
    g.restore();
  };
  const lop = earType === 'floppy' || earType === 'lop';
  if (!lop) ear(sp === 'rabbit' ? -0.35 : -0.45, true);

  // Cornes
  if (sp === 'goat' || sp === 'cow') {
    g.strokeStyle = '#d9cdb4';
    g.lineWidth = 5 * s;
    g.beginPath();
    g.moveTo(x - f * hr * 0.2, y - hr * 0.8);
    if (sp === 'goat') g.quadraticCurveTo(x - f * hr * 0.6, y - hr * 1.9, x - f * hr * 1.3, y - hr * 1.5);
    else g.quadraticCurveTo(x + f * hr * 0.1, y - hr * 1.5, x + f * hr * 0.4, y - hr * 1.4);
    g.stroke();
  }

  // Crâne
  g.fillStyle = face;
  if (sp === 'horse' || sp === 'goat') {
    circle(g, x, y, hr);
    g.fill();
    ellipse(g, x + f * hr * 0.85, y + hr * 0.6, hr * 1.25, hr * 0.62, f * 0.62);
    g.fill();
    // naseau
    g.fillStyle = shade(faceColor, -0.4);
    circle(g, x + f * hr * 1.75, y + hr * 1.1, 2.6 * s);
    g.fill();
    if (sp === 'goat') {
      g.fillStyle = shade(faceColor, -0.15);
      g.beginPath();
      g.moveTo(x + f * hr * 1.0, y + hr * 1.05);
      g.lineTo(x + f * hr * 0.9, y + hr * 1.8);
      g.lineTo(x + f * hr * 0.55, y + hr * 0.95);
      g.fill();
    }
  } else if (sp === 'cow') {
    ellipse(g, x, y, hr, hr * 1.05);
    g.fill();
    g.fillStyle = '#e9b7a8';
    ellipse(g, x + f * hr * 0.7, y + hr * 0.55, hr * 0.62, hr * 0.48);
    g.fill();
    g.fillStyle = '#6a4a40';
    circle(g, x + f * hr * 1.05, y + hr * 0.5, 2.6 * s);
    g.fill();
  } else if (sp === 'sheep') {
    ellipse(g, x + f * hr * 0.2, y + hr * 0.15, hr * 1.05, hr * 0.8, f * 0.35);
    g.fill();
    if (!o.shorn) {
      g.fillStyle = css(c.coat);
      circle(g, x - f * hr * 0.35, y - hr * 0.6, hr * 0.6);
      g.fill();
    }
    g.fillStyle = shade(faceColor, -0.45);
    circle(g, x + f * hr * 1.05, y + hr * 0.45, 2.2 * s);
    g.fill();
  } else {
    // chien, chat, lapin
    circle(g, x, y, hr * (sp === 'rabbit' ? 1 : 1) * (sp === 'cat' ? fluff ** 0.3 : 1));
    g.fill();
    const sn = sh.P.snout * s * (sh.a.look?.snout ?? 1);
    const muzzle = sp === 'dog' && (c.pattern === 'tan' || c.pattern === 'bicolor' || c.pattern === 'tricolor') ? css(c.sec) : face;
    if (ct?.pattern === 'points') {
      // Masque colourpoint : museau et tour des yeux plus foncés.
      g.fillStyle = css(c.sec);
      g.globalAlpha = 0.9;
      ellipse(g, x + f * hr * 0.42, y + hr * 0.18, hr * 0.72, hr * 0.62);
      g.fill();
      g.globalAlpha = 1;
    }
    if (ct && (ct.hair === 'long' || ct.hair === 'semi')) {
      // Joues fournies.
      g.fillStyle = face;
      ellipse(g, x - f * hr * 0.15, y + hr * 0.55, hr * 0.8, hr * 0.5);
      g.fill();
    }
    g.fillStyle = ct?.pattern === 'points' ? css(c.sec) : muzzle;
    if (ct && (ct.white === 'bicolor' || ct.white === 'mitted' || c.pattern === 'bicolor')) g.fillStyle = '#f6f3ee';
    ellipse(g, x + f * (hr * 0.62 + sn * 0.35), y + hr * 0.3, hr * 0.38 + sn * 0.5, hr * 0.42);
    g.fill();
    if (ct?.white === 'bicolor' && ct.pattern === 'points') {
      // V blanc entre les yeux (Ragdoll bicolore).
      g.fillStyle = '#f6f3ee';
      g.beginPath();
      g.moveTo(x + f * hr * 0.55, y - hr * 0.55);
      g.lineTo(x + f * hr * 0.98, y + hr * 0.2);
      g.lineTo(x + f * hr * 0.3, y + hr * 0.35);
      g.closePath();
      g.fill();
    }
    if (ct?.hair === 'hairless') {
      // Sphynx : petits plis sur le front.
      g.strokeStyle = shade(faceColor, -0.18);
      g.lineWidth = 1.2 * s;
      for (let i = 0; i < 3; i++) {
        g.beginPath();
        g.arc(x, y - hr * (0.2 + i * 0.16), hr * 0.45, Math.PI * 1.2, Math.PI * 1.8);
        g.stroke();
      }
    }
    // truffe
    g.fillStyle = sp === 'dog' ? '#1d1715' : '#e58a9a';
    ellipse(g, x + f * (hr * 0.85 + sn * 0.75), y + hr * 0.12, (sp === 'dog' ? 5.5 : 3.6) * s, (sp === 'dog' ? 4.2 : 2.8) * s);
    g.fill();
    if (sp !== 'dog') {
      g.strokeStyle = 'rgba(255,255,255,0.8)';
      g.lineWidth = 1.2 * s;
      for (let i = -1; i <= 1; i++) {
        g.beginPath();
        g.moveTo(x + f * hr * 0.8, y + hr * 0.35);
        g.lineTo(x + f * hr * 1.6, y + hr * (0.25 + i * 0.18));
        g.stroke();
      }
    }
  }

  // Bouche ouverte (manger) ou petit sourire
  if (o.mouth && sp !== 'horse') {
    g.fillStyle = '#7a2e36';
    ellipse(g, sh.mouth.x - f * 4 * s, sh.mouth.y + 2 * s, 6 * s, 4 * s + Math.abs(Math.sin(time * 12)) * 3 * s);
    g.fill();
  }
  // Gratté à son coin préféré, le cheval tend la lèvre du haut et la fait bouger (src/sim/horseQuirks.js)
  if (o.lip && sp === 'horse') {
    const { x: mx, y: my } = sh.mouth;
    const w = Math.sin(time * 14) * 1.5 * s;
    g.fillStyle = face;
    g.strokeStyle = shade(faceColor, -0.4);
    g.lineWidth = 1.6 * s;
    g.beginPath();
    g.moveTo(mx - f * hr * 0.2, my - hr * 0.25);
    g.quadraticCurveTo(mx + f * hr * 0.75, my - hr * 0.15 + w, mx + f * hr * 0.6, my + hr * 0.18 + w);
    g.quadraticCurveTo(mx + f * hr * 0.25, my + hr * 0.3, mx - f * hr * 0.15, my + hr * 0.12);
    g.fill();
    g.stroke();
    g.beginPath();
    g.moveTo(mx + f * hr * 0.05, my + hr * 0.05);
    g.quadraticCurveTo(mx + f * hr * 0.3, my + hr * 0.02 + w, mx + f * hr * 0.5, my + hr * 0.12 + w);
    g.stroke();
  }

  // Œil
  const ex = x + f * hr * 0.28;
  const ey = y - hr * 0.15;
  const blink = o.blink || (time % 4.2 < 0.12);
  if (o.happy || blink) {
    g.strokeStyle = '#2a1d16';
    g.lineWidth = 2.6 * s;
    g.beginPath();
    if (o.happy) g.arc(ex, ey + 2 * s, 5 * s, Math.PI * 1.1, Math.PI * 1.9);
    else { g.moveTo(ex - 5 * s, ey); g.lineTo(ex + 5 * s, ey); }
    g.stroke();
  } else {
    g.fillStyle = '#ffffff';
    circle(g, ex, ey, 5.6 * s);
    g.fill();
    g.fillStyle = css(c.eye);
    circle(g, ex + f * 1.2 * s, ey, 4.2 * s);
    g.fill();
    g.fillStyle = '#111';
    circle(g, ex + f * 1.6 * s, ey, 2.2 * s);
    g.fill();
    g.fillStyle = '#fff';
    circle(g, ex + f * 2.6 * s, ey - 1.6 * s, 1.2 * s);
    g.fill();
  }

  // Oreille du devant
  if (lop) ear(-0.15, false);
  else ear(sp === 'rabbit' ? 0.05 : -0.05, false);

  // Joue rose si heureux
  if (o.happy) {
    g.fillStyle = 'rgba(255, 120, 140, 0.35)';
    circle(g, x + f * hr * 0.25, y + hr * 0.4, 6 * s);
    g.fill();
  }
}

// ---------------------------------------------------------------- cheval vu de dessus (longe, liberté)

/**
 * Cheval vu d'en haut, centré en (x, y), qui avance dans la direction `dir` (radians) : le repli dessiné de la longe
 * et de la liberté (horse.js). s : sa taille (horse.js topScale : race et âge) ; phase : la foulée (les membres).
 *
 * Gabarit de sa race (horseLook.js : tronc, encolure, tête, crins), sa robe : la couleur, les taches de pie ou
 * d'appaloosa tirées de sa graine (toujours les mêmes pour lui), les balzanes au bas des membres seulement, le bas des
 * membres noir d'un bai ; une vraie tête vue de dessus : le front large, le chanfrein qui s'affine jusqu'au bout du
 * nez plus clair, les naseaux, les yeux sur les côtés, les deux oreilles pointues, le toupet, la liste.
 */
export function drawHorseTop(g, a, x, y, dir, s = 1, phase = 0) {
  const c = colorsOf(a);
  const look = a.look ?? {};
  const breed = horseBreedOf(look, a.breed);
  // (poulain, look.foal : stageLook : longues jambes, grosse tête, encolure courte, crinière en brosse)
  const b = look.foal ? foalBuild(horseBuild(breed, look)) : horseBuild(breed, look);
  const tr = horseCoatTraits(look);
  const socks = horseSocks(look);
  const face = horseFaceMark(look, breed);
  const rnd = makeRng((look.seed ?? 7) * 7919 + 13);
  const coat = css(c.coat);
  const dark = shade(c.coat, -0.3);
  const light = shade(c.coat, 0.18);
  const mane = css(c.mane);
  const white = 0xf4f0e8;
  // proportions (cheval de selle = 1)
  const bl = 30 * (b.back ?? 1); // demi-longueur du tronc
  const bw = 13 * (b.girth ?? 1); // demi-largeur
  const nk = 17 * (b.neck ?? 1); // encolure
  const hd = 1.0 * (b.head ?? 1); // tête
  g.save();
  g.translate(x, y);
  g.rotate(dir);
  g.scale(s, s);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  // ombre douce sous lui
  g.fillStyle = 'rgba(0,0,0,0.16)';
  ellipse(g, 3, 5, bl + 8, bw + 3);
  g.fill();

  // --- membres : le bas des jambes dépasse sous le ventre et avance / recule avec la foulée (diagonaux ensemble)
  const legs = [[bl * 0.62, -bw * 0.62, 0, 0], [bl * 0.62, bw * 0.62, Math.PI, 1], [-bl * 0.6, -bw * 0.66, Math.PI, 2], [-bl * 0.6, bw * 0.66, 0, 3]];
  const lw = 4.6 * (b.bone ?? 1);
  for (const [lx, ly, ph, i] of legs) {
    const sw = Math.sin(phase + ph) * 7;
    const x1 = lx + sw;
    const y1 = ly * 1.42;
    // (bai : le bas des membres noir ; balzane : blanche, du sabot jusqu'à sa hauteur seulement)
    g.strokeStyle = coat;
    g.lineWidth = lw;
    g.beginPath();
    g.moveTo(lx, ly);
    g.lineTo(x1, y1);
    g.stroke();
    const low = socks[i] > 0 ? css(white) : tr.points ? mane : null;
    if (low) {
      const k = socks[i] > 0 ? Math.min(0.85, 0.35 + socks[i] * 1.2) : 0.6;
      g.strokeStyle = low;
      g.beginPath();
      g.moveTo(lx + (x1 - lx) * (1 - k), ly + (y1 - ly) * (1 - k));
      g.lineTo(x1, y1);
      g.stroke();
    }
    // sabot (et fanons d'un frison, d'un trait)
    if (b.feathers > 0.3) {
      g.fillStyle = shade(c.mane, 0.05);
      ellipse(g, x1, y1, lw * 0.95, lw * 0.8);
      g.fill();
    }
    g.fillStyle = '#3a3029';
    ellipse(g, x1 + 0.6, y1, lw * 0.45, lw * 0.42);
    g.fill();
  }

  // --- queue : du haut de la croupe vers l'arrière, en mèches, elle se balance au rythme des pas
  const tl = 22 * (b.tail ?? 1) + 6;
  const sway = Math.sin(phase * 0.5) * 6;
  g.strokeStyle = mane;
  for (let k = 0; k < 4; k++) {
    g.lineWidth = 6.5 - k * 1.2;
    g.beginPath();
    g.moveTo(-bl + 2, (k - 1.5) * 1.2);
    g.quadraticCurveTo(-bl - tl * 0.45, sway * 0.6 + (k - 1.5) * 2.2, -bl - tl, sway + (k - 1.5) * 3.2);
    g.stroke();
  }

  // --- encolure : de l'épaule à la nuque, plus fine en haut (dessinée avant le tronc : elle part sous le garrot)
  const nx0 = bl * 0.72;
  const nx1 = bl * 0.72 + nk;
  const nw0 = bw * 0.72 * (b.neckW ?? 1);
  const nw1 = 5.2 * (b.neckW ?? 1);
  const neckPath = () => {
    g.beginPath();
    g.moveTo(nx0 - 4, -nw0);
    g.quadraticCurveTo((nx0 + nx1) / 2, -nw0 * 0.72, nx1, -nw1);
    g.lineTo(nx1 + 2, nw1);
    g.quadraticCurveTo((nx0 + nx1) / 2, nw0 * 0.72, nx0 - 4, nw0);
    g.closePath();
  };

  // --- tronc : épaules, dos, croupe plus large ; dégradé (dos clair, flancs plus sombres) pour le volume
  const bodyPath = () => {
    g.beginPath();
    g.moveTo(bl * 0.92, 0);
    g.bezierCurveTo(bl * 0.92, -bw * 0.85, bl * 0.45, -bw, 0, -bw * 0.94);
    g.bezierCurveTo(-bl * 0.55, -bw * 0.9, -bl * 0.7, -bw * 1.06, -bl * 0.92, -bw * 0.72);
    g.bezierCurveTo(-bl * 1.04, -bw * 0.4, -bl * 1.04, bw * 0.4, -bl * 0.92, bw * 0.72);
    g.bezierCurveTo(-bl * 0.7, bw * 1.06, -bl * 0.55, bw * 0.9, 0, bw * 0.94);
    g.bezierCurveTo(bl * 0.45, bw, bl * 0.92, bw * 0.85, bl * 0.92, 0);
    g.closePath();
  };
  const shadeFill = () => {
    const gr = g.createLinearGradient(0, -bw, 0, bw);
    gr.addColorStop(0, dark);
    gr.addColorStop(0.32, coat);
    gr.addColorStop(0.5, light);
    gr.addColorStop(0.68, coat);
    gr.addColorStop(1, dark);
    return gr;
  };
  g.fillStyle = shadeFill();
  neckPath();
  g.fill();
  bodyPath();
  g.fill();
  // taches (pie : grandes plaques ; appaloosa : petits ronds, ou une couverture blanche sur la croupe), tirées de sa
  // graine, découpées au tronc et à l'encolure
  if (tr.pinto || tr.leopard || tr.blanket) {
    g.save();
    bodyPath();
    g.clip();
    const sec = css(c.sec);
    if (tr.blanket) {
      g.fillStyle = sec;
      ellipse(g, -bl * 0.55, 0, bl * 0.55, bw * 1.1);
      g.fill();
      g.fillStyle = coat;
      for (let i = 0; i < 9; i++) {
        circle(g, -bl * (0.2 + rnd() * 0.8), (rnd() - 0.5) * bw * 1.6, 1.4 + rnd() * 1.6);
        g.fill();
      }
    } else if (tr.leopard) {
      g.fillStyle = sec;
      for (let i = 0; i < 26; i++) {
        ellipse(g, (rnd() - 0.5) * bl * 1.9, (rnd() - 0.5) * bw * 1.9, 1.4 + rnd() * 1.8, 1.2 + rnd() * 1.4, rnd() * 3);
        g.fill();
      }
    } else {
      g.fillStyle = sec;
      const n = 3 + Math.floor(rnd() * 2);
      for (let i = 0; i < n; i++) {
        const px = (rnd() - 0.5) * bl * 1.6;
        const py = (rnd() - 0.5) * bw * 1.2;
        g.beginPath();
        const r0 = 6 + rnd() * 7;
        for (let k = 0; k <= 9; k++) {
          const t = (k / 9) * Math.PI * 2;
          const r = r0 * (0.7 + rnd() * 0.5);
          const qx = px + Math.cos(t) * r * 1.3;
          const qy = py + Math.sin(t) * r;
          if (k === 0) g.moveTo(qx, qy);
          else g.lineTo(qx, qy);
        }
        g.closePath();
        g.fill();
      }
    }
    g.restore();
  }
  // ligne du dos (la colonne), à peine
  g.strokeStyle = 'rgba(0,0,0,0.12)';
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(bl * 0.6, 0);
  g.lineTo(-bl * 0.85, 0);
  g.stroke();

  // --- tête vue de dessus : le front large entre les yeux, le chanfrein qui s'affine, le bout du nez arrondi
  const hx0 = nx1 - 1; // nuque
  const hl = 19 * hd; // longueur de la tête
  const hw = 6.6 * hd; // demi-largeur au front
  const mw = 4.0 * hd; // demi-largeur au bout du nez
  const dish = b.profile === 'dish' ? 0.85 : 1;
  const headPath = () => {
    g.beginPath();
    g.moveTo(hx0, -hw * 0.75);
    g.quadraticCurveTo(hx0 + hl * 0.2, -hw * 1.08, hx0 + hl * 0.42, -hw * 0.92);
    g.quadraticCurveTo(hx0 + hl * 0.72, -mw * 1.05 * dish, hx0 + hl * 0.93, -mw);
    g.quadraticCurveTo(hx0 + hl * 1.06, 0, hx0 + hl * 0.93, mw);
    g.quadraticCurveTo(hx0 + hl * 0.72, mw * 1.05 * dish, hx0 + hl * 0.42, hw * 0.92);
    g.quadraticCurveTo(hx0 + hl * 0.2, hw * 1.08, hx0, hw * 0.75);
    g.closePath();
  };
  const hg = g.createLinearGradient(0, -hw, 0, hw);
  hg.addColorStop(0, dark);
  hg.addColorStop(0.5, light);
  hg.addColorStop(1, dark);
  g.fillStyle = hg;
  headPath();
  g.fill();
  // bout du nez : plus clair (ou grisé sur une robe noire), naseaux
  const nose = tr.grey || lum(c.coat) > 0.5 ? 0xb9a9a0 : lum(c.coat) < 0.12 ? 0x4a403c : null;
  g.save();
  headPath();
  g.clip();
  if (face) {
    // liste, étoile : du front vers le nez (étoile seule pour 1)
    g.fillStyle = css(white);
    if (face === 1) {
      ellipse(g, hx0 + hl * 0.3, 0, 2.6, 2.2);
      g.fill();
    } else {
      const w0 = face === 3 ? 3.2 : 1.6;
      g.beginPath();
      g.moveTo(hx0 + hl * 0.22, -w0);
      g.lineTo(hx0 + hl * 1.05, -w0 * (face === 3 ? 1.1 : 0.9));
      g.lineTo(hx0 + hl * 1.05, w0 * (face === 3 ? 1.1 : 0.9));
      g.lineTo(hx0 + hl * 0.22, w0);
      g.closePath();
      g.fill();
    }
  }
  if (nose !== null) {
    g.fillStyle = css(nose);
    ellipse(g, hx0 + hl * 0.98, 0, hl * 0.13, mw * 1.05);
    g.fill();
  }
  g.restore();
  g.fillStyle = 'rgba(30,20,15,0.75)';
  for (const sy of [-1, 1]) {
    ellipse(g, hx0 + hl * 0.95, sy * mw * 0.55, 1.4, 0.9, sy * 0.5);
    g.fill();
  }
  // yeux : sur les côtés, un peu en relief
  for (const sy of [-1, 1]) {
    g.fillStyle = '#1d140f';
    ellipse(g, hx0 + hl * 0.3, sy * hw * 0.98, 2.1, 1.3);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    circle(g, hx0 + hl * 0.33, sy * hw * 0.98 - sy * 0.4, 0.5);
    g.fill();
  }
  // oreilles : deux feuilles pointues derrière le front, l'intérieur plus clair
  for (const sy of [-1, 1]) {
    const ex = hx0 + 1.5;
    const ey = sy * hw * 0.58;
    g.fillStyle = dark;
    g.beginPath();
    g.moveTo(ex - 3.2, ey - sy * 0.2);
    g.quadraticCurveTo(ex + 1, ey + sy * 3.6 * (b.ears ?? 1), ex + 6.5 * (b.ears ?? 1), ey + sy * 1.2);
    g.quadraticCurveTo(ex + 1.5, ey - sy * 1.8, ex - 3.2, ey - sy * 0.2);
    g.fill();
    g.fillStyle = 'rgba(255,225,215,0.55)';
    ellipse(g, ex + 1.8, ey + sy * 0.9, 2.2, 0.8, sy * 0.3);
    g.fill();
  }
  // crinière : une bande de crins le long du dessus de l'encolure, tombant d'un côté ; le toupet entre les oreilles
  const mLong = b.maneStyle === 'long' ? 2.2 : b.maneStyle === 'thick' ? 1.4 : b.maneStyle === 'brush' ? 0.35 : 1;
  g.strokeStyle = mane;
  g.lineWidth = 3.4;
  g.beginPath();
  g.moveTo(nx0 - 6, 0);
  g.lineTo(hx0 + 1, 0);
  g.stroke();
  g.lineWidth = 1.6;
  for (let i = 0; i <= 8; i++) {
    const mx = nx0 - 4 + ((hx0 - nx0 + 3) * i) / 8;
    g.beginPath();
    g.moveTo(mx, 0);
    g.quadraticCurveTo(mx - 1.5, 2.5 * mLong, mx - 3, (3 + 2.5 * rnd()) * mLong);
    g.stroke();
  }
  g.lineWidth = 2;
  for (const k of [-1, 0, 1]) {
    g.beginPath();
    g.moveTo(hx0, k * 0.8);
    g.quadraticCurveTo(hx0 + 4, k * 1.6, hx0 + 6.5 * (b.maneStyle === 'long' ? 1.3 : 1), k * 2.2);
    g.stroke();
  }
  g.restore();
}

/** Luminance (0 à 1) d'une couleur 0xRRGGBB. */
function lum(n) {
  const [r, gg, bb] = rgb(n);
  return (r * 0.2126 + gg * 0.7152 + bb * 0.0722) / 255;
}

/** Petit personnage vu de dessus (le joueur). */
export function drawPersonTop(g, x, y, dir, s = 1, color = '#3c7bd9') {
  g.save();
  g.translate(x, y);
  g.rotate(dir);
  g.fillStyle = 'rgba(0,0,0,0.15)';
  circle(g, 2 * s, 3 * s, 15 * s);
  g.fill();
  g.fillStyle = color;
  ellipse(g, 0, 0, 10 * s, 15 * s);
  g.fill();
  g.fillStyle = '#e8b48f';
  circle(g, 2 * s, 0, 8 * s);
  g.fill();
  g.fillStyle = '#5b3a24';
  ellipse(g, -2 * s, 0, 6 * s, 7.5 * s);
  g.fill();
  g.restore();
}

/**
 * Taille et position pour que l'animal remplisse bien une zone (en gros plan).
 * Renvoie { x, s } à passer à drawAnimal (avec y = groundY).
 */
export function fitAnimal(a, { cx = 200, groundY = 300, maxW = 360, maxH = 250, pose = 'stand' } = {}) {
  const sh = animalShape(a, { x: 0, y: groundY, s: 1, f: 1, pose });
  const ears = a.species === 'rabbit' ? 2.3 : a.species === 'goat' ? 1.9 : 1.3;
  const minX = sh.bx - sh.rx - (a.species === 'cat' ? 40 : 28);
  const maxX = Math.max(sh.head.x + sh.hr * 1.9, sh.bx + sh.rx);
  const top = sh.head.y - sh.hr * ears;
  const s = Math.min(maxW / (maxX - minX), maxH / (groundY - top));
  return { s, x: cx - ((minX + maxX) / 2) * s };
}

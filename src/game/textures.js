// Textures dessinées par le code (pelage, sol, bois, eau, panneaux) : aucun fichier à télécharger.

import * as THREE from 'three';
import { mulberry32 } from '../sim/rng.js';
import { noise3 } from './models/shapes.js';
import { gfx, texSize } from './gfx.js';

const cache = new Map();

const hex = (c) => `#${c.toString(16).padStart(6, '0')}`;
const rgbOf = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
/** Luminance (0–1) d'une couleur 0xRRGGBB. */
export const lum = (c) => {
  const [r, g, b] = rgbOf(c);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

function shade(c, f) {
  const [r, g, b] = rgbOf(c);
  return `rgb(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0})`;
}

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, { srgb = true, repeat = true, shared = false } = {}) {
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
  }
  tex.anisotropy = gfx.quality === 'high' ? 4 : 1;
  if (shared) tex.userData.shared = true;
  return tex;
}

/**
 * Carte transparente (feuilles, brins, fleurs) : texture d'octets bruts dont les pixels
 * transparents reçoivent la couleur indiquée. Un canvas stocke ses pixels prémultipliés et
 * perd la couleur sous alpha 0 : ses mipmaps mélangeraient du noir et les cartes
 * noirciraient au loin.
 */
function alphaTexture(canvas, [r, g, b]) {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const src = ctx.getImageData(0, 0, w, h).data;
  const data = new Uint8Array(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const a = src[i + 3] / 255;
    data[i] = src[i] * a + r * (1 - a);
    data[i + 1] = src[i + 1] * a + g * (1 - a);
    data[i + 2] = src[i + 2] * a + b * (1 - a);
    data[i + 3] = src[i + 3];
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = true;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = gfx.quality === 'high' ? 4 : 1;
  tex.needsUpdate = true;
  return tex;
}

function cached(key, make) {
  if (!cache.has(key)) {
    const t = make();
    t.userData.shared = true;
    cache.set(key, t);
  }
  return cache.get(key);
}

/** Bruit qui boucle en u (autour du corps) : pas de couture visible. */
function wrapNoise(u, v, freq, seed) {
  const a = u * Math.PI * 2;
  const r = freq / (Math.PI * 2);
  return noise3(Math.cos(a) * r + seed, Math.sin(a) * r, v * freq);
}

function furStrokes(ctx, w, h, color, rng, count, len = 5, alpha = 0.4) {
  ctx.lineWidth = Math.max(1, w / 256);
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const l = (len * 0.4 + rng() * len) * (h / 128);
    ctx.strokeStyle = shade(color, 0.78 + rng() * 0.44);
    ctx.globalAlpha = alpha * (0.5 + rng());
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (rng() - 0.5) * 2, y + l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

/** Tache organique, dessinée trois fois pour boucler horizontalement. */
function blob(ctx, x, y, r, rng, w, squash = 0.8) {
  const n = 14;
  const pts = [];
  const ph = [rng() * 6, rng() * 6, rng() * 6];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.75 + 0.18 * Math.sin(a * 2 + ph[0]) + 0.12 * Math.sin(a * 3 + ph[1]) + 0.08 * Math.sin(a * 5 + ph[2]));
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr * squash]);
  }
  for (const dx of [-w, 0, w]) {
    ctx.beginPath();
    const mid = (i) => {
      const [ax, ay] = pts[i % n];
      const [bx, by] = pts[(i + 1) % n];
      return [x + dx + (ax + bx) / 2, y + (ay + by) / 2];
    };
    const [sx, sy] = mid(n - 1);
    ctx.moveTo(sx, sy);
    for (let i = 0; i < n; i++) {
      const [mx, my] = mid(i);
      ctx.quadraticCurveTo(x + dx + pts[i][0], y + pts[i][1], mx, my);
    }
    ctx.closePath();
    ctx.fill();
  }
}

// ------------------------------------------------------------------ pelage

/**
 * Textures du pelage d'un animal, une par partie du corps :
 * body, neck, head, tail, ear et legs[4] (avant gauche, avant droite, arrière gauche, arrière droite).
 * Chaque texture suit les UV des « lofts » : u fait le tour (0 = ventre), v suit la forme.
 */
export function coatTextures(look, speciesId) {
  const high = gfx.quality === 'high';
  const big = texSize(high ? 256 : 128); // (plus petites pour les vignettes 3D : gfx.texScale)
  const small = texSize(high ? 128 : 64);
  const rng = mulberry32(look.seed || 1);
  const pattern = look.pattern;
  const seed = (look.seed % 1000) * 0.37;
  const dark = lum(look.coat) < 0.12;
  const bay = speciesId === 'horse' && lum(look.mane) < 0.06 && lum(look.coat) > 0.06 && pattern !== 'spots';
  const sheep = !!look.wool;
  const cowLike = speciesId === 'cow';
  const horse = speciesId === 'horse';
  const sleek = horse || speciesId === 'cow' || speciesId === 'goat';
  // Robes du cheval : gris pommelé, isabelle (raie de mulet), rouan (poils blancs mêlés), nez sombre.
  const colorFr = look.colorName?.fr ?? '';
  const grey = horse && pattern !== 'spots' && lum(look.coat) > 0.42 && Math.abs(lum(look.coat) - lum(look.secondary)) < 0.2 && !/Palomino|Isabelle|Alezan|Rouan/.test(colorFr);
  const dun = horse && colorFr === 'Isabelle';
  const roan = horse && colorFr === 'Rouan';
  const darkMuzzle = horse && (bay || dark || grey || dun);
  // Marque en tête : liste, étoile, pelote ou rien, selon la graine et la robe.
  const faceMark = !horse || pattern === 'spots' || pattern === 'patches' || (grey && lum(look.coat) > 0.6) ? 'none'
    : pattern === 'socks' ? ['blaze', 'stripe', 'star', 'snip', 'star', 'none'][look.seed % 6]
      : (look.seed % 4 === 0 && lum(look.coat) < 0.5 ? 'star' : 'none');

  // Motif de base (taches, plaques, rayures), commun à toutes les parties.
  const baseCanvas = (size, part) => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const s = size / 256;
    const r2 = mulberry32((look.seed || 1) + part.length * 31);
    ctx.fillStyle = hex(look.coat);
    ctx.fillRect(0, 0, size, size);
    if (pattern === 'spots') {
      const appaloosaBlanket = speciesId === 'horse' && lum(look.coat) < lum(look.secondary);
      ctx.fillStyle = hex(look.secondary);
      if (appaloosaBlanket && part === 'body') {
        // Couverture blanche sur la croupe, parsemée de taches de la robe.
        ctx.fillRect(0, size * 0.55, size, size * 0.45);
        for (let i = 0; i < 6; i++) blob(ctx, r2() * size, size * (0.55 + r2() * 0.1), 30 * s, r2, size);
        ctx.fillStyle = hex(look.coat);
        for (let i = 0; i < 40; i++) blob(ctx, r2() * size, size * (0.62 + r2() * 0.38), (3 + r2() * 5) * s, r2, size);
      } else if (!appaloosaBlanket) {
        const n = speciesId === 'dog' ? 70 : 110;
        for (let i = 0; i < n; i++) blob(ctx, r2() * size, r2() * size, (speciesId === 'dog' ? 4 + r2() * 6 : 3 + r2() * 5) * s, r2, size);
      }
    } else if (pattern === 'patches' || (pattern === 'tricolor' && speciesId === 'cat')) {
      const n = cowLike ? 7 : 5;
      const colors = pattern === 'tricolor' ? [look.secondary, look.third] : [look.secondary];
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = hex(colors[i % colors.length]);
        const r = (cowLike ? 34 + r2() * 38 : 22 + r2() * 30) * s;
        blob(ctx, r2() * size, r2() * size, r, r2, size, 0.9);
        // Petites taches satellites autour des grandes, comme sur les vraies robes pie.
        if (cowLike || r2() < 0.5) blob(ctx, r2() * size, r2() * size, r * 0.35, r2, size);
      }
    } else if (grey && (part === 'body' || part === 'neck')) {
      // Pommelures : anneaux un peu plus sombres, centre clair, serrés sur le corps.
      const n = part === 'body' ? 110 : 30;
      for (let i = 0; i < n; i++) {
        const x = r2() * size;
        // Surtout sur le dos et la croupe (u autour de 0,5), moins sous le ventre.
        const y = size * (part === 'body' ? 0.5 + (r2() - 0.5) * 0.7 : r2());
        const xx = part === 'body' ? size * (0.5 + (r2() - 0.5) * 0.8) : x;
        const rr = (5 + r2() * 5) * s;
        for (const dx of [-size, 0, size]) {
          const g = ctx.createRadialGradient(xx + dx, y, 0, xx + dx, y, rr);
          g.addColorStop(0, 'rgba(255,255,255,0.12)');
          g.addColorStop(0.45, 'rgba(255,255,255,0.04)');
          g.addColorStop(0.8, 'rgba(70,65,60,0.13)');
          g.addColorStop(1, 'rgba(70,65,60,0)');
          ctx.fillStyle = g;
          ctx.fillRect(xx + dx - rr, y - rr, rr * 2, rr * 2);
        }
      }
    } else if (pattern === 'tabby') {
      // Rayures qui font le tour du corps, plus une raie sombre sur le dos.
      ctx.fillStyle = hex(look.secondary);
      ctx.globalAlpha = 0.8;
      const step = 22 * s;
      for (let y = r2() * step; y < size; y += step * (0.8 + r2() * 0.5)) {
        ctx.beginPath();
        const th = (4 + r2() * 4) * s;
        for (let x = 0; x <= size; x += 8 * s) {
          const fade = Math.sin((x / size) * Math.PI); // s'estompent vers le ventre
          ctx.lineTo(x, y + Math.sin(x * 0.05 / s + y) * 5 * s - th * fade);
        }
        for (let x = size; x >= 0; x -= 8 * s) ctx.lineTo(x, y + Math.sin(x * 0.05 / s + y) * 5 * s + th * Math.sin((x / size) * Math.PI));
        ctx.fill();
      }
      ctx.globalAlpha = 0.6;
      ctx.fillRect(size * 0.47, 0, size * 0.06, size);
      ctx.globalAlpha = 1;
    }
    return c;
  };

  // Couche de « marques » (ventre blanc, masque, balzanes…) calculée pixel par pixel.
  const paint = (size, part, marks, opts = {}) => {
    const c = baseCanvas(size, part);
    const ctx = c.getContext('2d');
    const img = ctx.getImageData(0, 0, size, size);
    const d = img.data;
    const sec = rgbOf(look.secondary);
    const third = rgbOf(look.third);
    const mane = rgbOf(look.mane);
    const white = rgbOf(0xf6f3ee);
    const pick = { secondary: sec, third, mane, white, coat: rgbOf(look.coat), muzzle: rgbOf(0x2b2522) };
    for (let py = 0; py < size; py++) {
      const v = 1 - (py + 0.5) / size;
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        const i = (py * size + px) * 4;
        const n = wrapNoise(u, v, 9, seed + part.length) - 0.5;
        const layers = marks ? marks(u, v, n) : null;
        if (layers) {
          for (const [col, w] of layers) {
            if (w <= 0) continue;
            const cc = pick[col];
            d[i] += (cc[0] - d[i]) * w;
            d[i + 1] += (cc[1] - d[i + 1]) * w;
            d[i + 2] += (cc[2] - d[i + 2]) * w;
          }
        }
        if (opts.counter) {
          // Dos un peu plus sombre, ventre un peu plus clair (contre-ombrage naturel).
          const back = 1 - Math.abs(u - 0.5) * 2;
          let f = horse ? 1.1 - back * 0.16 : 1.07 - back * 0.12;
          // Cheval : léger moiré de grandes taches (reflets de la robe), poils blancs du rouan.
          if (horse) f *= 1 + (wrapNoise(u, v, 3.5, seed + 11) - 0.5) * 0.09;
          d[i] = Math.min(255, d[i] * f);
          d[i + 1] = Math.min(255, d[i + 1] * f);
          d[i + 2] = Math.min(255, d[i + 2] * f);
          if (roan && rng() < 0.3) {
            d[i] += (245 - d[i]) * 0.6;
            d[i + 1] += (242 - d[i + 1]) * 0.6;
            d[i + 2] += (238 - d[i + 2]) * 0.6;
          }
        }
        // Variation douce de teinte (pelage jamais uniforme) : zones un peu plus chaudes ou plus froides.
        const mot = wrapNoise(u, v, 3, seed * 1.7 + 11) - 0.5;
        const mot2 = wrapNoise(u, v, 7, seed * 0.9 + 23) - 0.5;
        const ml = 1 + mot * 0.14 + mot2 * 0.06;
        // Grain très fin.
        const g = ml * (1 + (rng() - 0.5) * (sleek ? 0.05 : 0.1));
        d[i] = Math.min(255, d[i] * g * (1 + mot * 0.04));
        d[i + 1] = Math.min(255, d[i + 1] * g);
        d[i + 2] = Math.min(255, d[i + 2] * g * (1 - mot * 0.04));
      }
    }
    ctx.putImageData(img, 0, 0);
    const strokeColor = look.coat;
    if (!sheep || part === 'head' || part.startsWith('leg') || part === 'ear') {
      furStrokes(ctx, size, size, strokeColor, rng, (sleek ? 500 : 1400) * (size / 256) ** 2, sleek ? 4 : 6, sleek ? 0.18 : 0.35);
    }
    return toTexture(c);
  };

  // Fonctions utiles pour les marques.
  const belly = (u) => Math.min(u, 1 - u) * 2; // 0 au milieu du ventre, 1 sur le dos
  const edge = (x, e, f = 0.04) => smooth(e - f, e + f, x);
  const dogTri = pattern === 'tricolor' && speciesId === 'dog';
  const darkTri = dogTri && dark;

  const bodyMarks = (u, v, n) => {
    const b = belly(u);
    if (dun) return [['mane', (1 - edge(Math.abs(u - 0.5), 0.012 + n * 0.004, 0.006)) * 0.75]];
    if (pattern === 'bicolor' || (dogTri && !darkTri) || darkTri) {
      const reach = 0.28 + 0.4 * smooth(0.6, 0.98, v) + n * 0.25;
      const out = [['secondary', 1 - edge(b, reach)]];
      if (dogTri && !darkTri) {
        // Selle noire du beagle.
        out.push(['third', edge(b, 0.62 + n * 0.3) * edge(v, 0.18 + n * 0.1) * (1 - edge(v, 0.78 + n * 0.1))]);
      }
      return out;
    }
    if (pattern === 'tan') return [['secondary', 1 - edge(b, 0.45 + n * 0.25 + 0.15 * smooth(0.7, 1, v))]];
    if (pattern === 'points' && speciesId === 'goat') return [['secondary', edge(v, 0.62 + n * 0.15, 0.03)]];
    if (pattern === 'points' && speciesId === 'cat') return [['secondary', 0.25 * smooth(0.75, 1, v)]];
    return null;
  };
  const neckMarks = (u, v, n) => {
    const b = belly(u);
    if (dun) return [['mane', (1 - edge(Math.abs(u - 0.5), 0.012 + n * 0.004, 0.006)) * 0.6]];
    if (pattern === 'bicolor' || dogTri) return [['secondary', 1 - edge(b, 0.42 + n * 0.3 - v * 0.1)]];
    if (pattern === 'tan') return [['secondary', 1 - edge(b, 0.4 + n * 0.25)]];
    if (pattern === 'points' && (speciesId === 'goat')) return [['secondary', 1]];
    if (pattern === 'points' && sheep) return [['secondary', smooth(0.55, 0.95, v)]];
    if (pattern === 'points' && speciesId === 'cat') return [['secondary', 0.3 * v]];
    return null;
  };
  const headMarks = (u, v, n) => {
    const b = belly(u);
    if (sheep) return [['secondary', 1]];
    if (pattern === 'points') {
      if (speciesId === 'cat') return [['secondary', edge(v, 0.5 + n * 0.12, 0.07)]];
      return [['secondary', 1]];
    }
    if (horse) {
      // Bout du nez foncé (peau presque nue : bai, noir, gris), un peu plus clair pour les alezans.
      const out = [['muzzle', edge(v, 0.85 + n * 0.04, 0.04) * (darkMuzzle ? 0.8 : 0.3)]];
      if (grey) out.push(['muzzle', 0.12 * (1 - edge(v, 0.25 + n * 0.1, 0.15))]); // tête un peu plus sombre
      const du = Math.abs(u - 0.5);
      const star = 1 - edge(Math.hypot(du / 0.075, (v - 0.33) / 0.05) + n * 0.4, 1, 0.25);
      const snip = 1 - edge(Math.hypot(du / 0.07, (v - 0.9) / 0.045) + n * 0.4, 1, 0.3);
      if (faceMark === 'star') out.push(['white', star]);
      else if (faceMark === 'snip') out.push(['white', snip]);
      else if (faceMark === 'stripe') out.push(['white', Math.max(star * 0.8, (1 - edge(du, 0.02 + n * 0.01, 0.008)) * edge(v, 0.3, 0.03) * (1 - edge(v, 0.93, 0.03)))]);
      else if (faceMark === 'blaze') out.push(['white', Math.max(star, snip, (1 - edge(du, 0.045 + v * 0.03 + n * 0.02, 0.012)) * edge(v, 0.28, 0.03))]);
      return out;
    }
    if (cowLike && pattern === 'patches') {
      // Tête foncée avec une liste claire (Holstein, Normande, Bretonne pie noire).
      const darkCol = lum(look.coat) < lum(look.secondary) ? 'coat' : 'secondary';
      const lightCol = darkCol === 'coat' ? 'secondary' : 'coat';
      const blaze = (1 - edge(Math.abs(u - 0.5), 0.05 + v * 0.12 + n * 0.08, 0.02)) * edge(v, 0.15 + n * 0.1);
      return [[darkCol, 1], [lightCol, blaze], [lightCol, edge(v, 0.86) * 0.9]];
    }
    if (pattern === 'bicolor' || dogTri) {
      const muzzle = (1 - edge(b, 0.55 + n * 0.3)) * edge(v, 0.4 + n * 0.15);
      const blaze = speciesId === 'dog' ? (1 - edge(Math.abs(u - 0.5), 0.04 + v * 0.1 + n * 0.03, 0.015)) * edge(v, 0.25) : 0;
      const out = [['secondary', Math.max(muzzle, blaze)]];
      if (darkTri) out.unshift(['third', (1 - edge(b, 0.75 + n * 0.2)) * edge(v, 0.25) * (1 - muzzle)]);
      return out;
    }
    if (pattern === 'tan') return [['secondary', (1 - edge(b, 0.55 + n * 0.25)) * (1 - edge(v, 0.82)) * edge(v, 0.15)]];
    return null;
  };
  const legMarks = (i) => (u, v, n) => {
    const front = i < 2;
    const low = (at, f = 0.03) => edge(v, at + n * 0.12, f);
    if (sheep) return [['secondary', 1]];
    if (pattern === 'socks' && i < look.seed % 5) return [['white', low(0.55 + ((look.seed >> (2 + i)) % 4) * 0.07, 0.04)]];
    if (bay || dun) return [['mane', low(0.52, 0.1)]];
    if (pattern === 'points') {
      if (speciesId === 'goat') return front ? [['secondary', 1]] : [['secondary', low(0.75)]];
      return [['secondary', speciesId === 'cat' ? low(0.3, 0.15) : low(0.42)]];
    }
    if (pattern === 'bicolor') return [['secondary', speciesId === 'cat' ? low(0.72) : low(0.42)]];
    if (pattern === 'tan') return [['secondary', low(0.3)]];
    if (darkTri) return [['third', low(0.35)], ['secondary', low(0.82)]];
    if (dogTri) return [['secondary', low(0.35)]];
    if (cowLike && pattern === 'patches') return [[lum(look.coat) > lum(look.secondary) ? 'coat' : 'secondary', low(0.62) * 0.9]];
    return null;
  };
  const tailMarks = (u, v, n) => {
    if (pattern === 'points') return [['secondary', speciesId === 'cat' ? smooth(0, 0.4, v) : 1]];
    if ((pattern === 'bicolor' && speciesId === 'dog') || dogTri) return [['secondary', edge(v, 0.82 + n * 0.1)]];
    return null;
  };
  const earMarks = () => {
    if (sheep || pattern === 'points') return [['secondary', 1]];
    if (darkTri) return null;
    if (cowLike && pattern === 'patches') return [[lum(look.coat) < lum(look.secondary) ? 'coat' : 'secondary', 1]];
    return null;
  };

  const legs = [];
  const legKey = (i) => {
    // Les pattes identiques partagent la même texture.
    if (pattern === 'socks') return `l${i}`;
    if (pattern === 'points' && speciesId === 'goat') return i < 2 ? 'lf' : 'lh';
    return 'l';
  };
  const legCache = {};
  for (let i = 0; i < 4; i++) {
    const k = legKey(i);
    legCache[k] = legCache[k] ?? paint(small, `leg${k}`, legMarks(i));
    legs.push(legCache[k]);
  }
  return {
    body: paint(big, 'body', bodyMarks, { counter: true }),
    neck: paint(small, 'neck', neckMarks, { counter: true }),
    head: paint(small, 'head', headMarks),
    tail: paint(small, 'tail', tailMarks),
    ear: paint(texSize(64), 'ear', earMarks),
    legs,
  };
}

/** Laine bouclée (moutons) : couleur + relief. */
export function woolTextures(color) {
  const key = `wool-${color}-${gfx.quality}`;
  if (cache.has(key)) return cache.get(key);
  const size = gfx.quality === 'high' ? 256 : 128;
  const s = size / 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const b = makeCanvas(size);
  const bctx = b.getContext('2d');
  ctx.fillStyle = hex(color);
  ctx.fillRect(0, 0, size, size);
  bctx.fillStyle = '#606060';
  bctx.fillRect(0, 0, size, size);
  const rng = mulberry32(color + 3);
  const curl = (cx, cy, r, f) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
        ctx.fill();
        bctx.beginPath();
        bctx.arc(cx + dx, cy + dy, r, 0, Math.PI * 2);
        bctx.fill();
      }
    }
    return f;
  };
  for (let i = 0; i < 900 * s * s * 4; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = (3 + rng() * 5) * s;
    const f = 0.9 + rng() * 0.2;
    // Ombre de la boucle puis boucle éclairée.
    ctx.fillStyle = shade(color, f * 0.78);
    bctx.fillStyle = 'rgba(0,0,0,0.5)';
    curl(x + 1.2 * s, y + 1.2 * s, r, f);
    const grad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    grad.addColorStop(0, shade(color, f * 1.0));
    grad.addColorStop(1, shade(color, f * 0.86));
    ctx.fillStyle = grad;
    const bg = bctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
    bg.addColorStop(0, '#ffffff');
    bg.addColorStop(1, '#707070');
    bctx.fillStyle = bg;
    curl(x, y, r * 0.9, f);
  }
  const res = { map: toTexture(c, { shared: true }), bump: toTexture(b, { srgb: false, shared: true }) };
  cache.set(key, res);
  return res;
}

/** Masque de poils pour la fourrure en couches (« shells ») : valeur = hauteur du poil. */
export function furStrandTexture() {
  return cached('furStrands', () => {
    const size = 128;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, size, size);
    const rng = mulberry32(42);
    for (let i = 0; i < 5200; i++) {
      const v = 70 + rng() * 185;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      const x = rng() * size;
      const y = rng() * size;
      const r = 0.6 + rng() * 0.9;
      for (const dx of [-size, 0, size]) {
        for (const dy of [-size, 0, size]) {
          ctx.beginPath();
          ctx.arc(x + dx, y + dy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    return toTexture(c, { srgb: false });
  });
}

/** Mèches de crins (crinière, queue de cheval) avec transparence. */
export function hairTexture() {
  return cached('hair', () => {
    const w = 128;
    const h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const rng = mulberry32(11);
    for (let i = 0; i < 420; i++) {
      const x = 4 + rng() * (w - 8);
      const end = h * (0.55 + rng() * 0.45);
      const v = 150 + rng() * 105;
      ctx.strokeStyle = `rgb(${v},${v},${v})`;
      ctx.lineWidth = 0.8 + rng() * 1.6;
      ctx.globalAlpha = 0.7 + rng() * 0.3;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      const bend = (rng() - 0.5) * 14;
      ctx.bezierCurveTo(x + bend * 0.3, end * 0.3, x - bend, end * 0.7, x + bend * 0.5, end);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const tex = toTexture(c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

/** Crins du cheval : mèches denses et effilées, plus contrastées que les poils génériques. */
export function maneTexture() {
  return cached('mane', () => {
    const w = 128;
    const h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    const rng = mulberry32(23);
    ctx.lineCap = 'round';
    for (let i = 0; i < 1100; i++) {
      const x = 2 + rng() * (w - 4);
      const end = h * (0.5 + rng() * 0.5);
      const v = 120 + rng() * 135;
      ctx.strokeStyle = `rgb(${v},${v},${v})`;
      ctx.globalAlpha = 0.75 + rng() * 0.25;
      const bend = (rng() - 0.5) * 16;
      // Deux tronçons : épais à la racine, fin vers la pointe.
      ctx.lineWidth = 1.4 + rng() * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.quadraticCurveTo(x + bend * 0.3, end * 0.35, x - bend * 0.3, end * 0.6);
      ctx.stroke();
      ctx.lineWidth = 0.6 + rng() * 0.9;
      ctx.beginPath();
      ctx.moveTo(x - bend * 0.3, end * 0.6);
      ctx.quadraticCurveTo(x - bend * 0.7, end * 0.8, x + bend * 0.4, end);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const tex = toTexture(c);
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
    return tex;
  });
}

/**
 * Peint un œil (toute la sphère : le devant, +Z, est en u = 0,25, v = 0,5) sur un canevas w × h.
 * far (0 à 1, œil humain seulement) : version simplifiée et contrastée pour un œil vu tout petit —
 * iris plus grand et presque noir, pupille plus large, fibres effacées (voir humanEyeTexture).
 */
function paintEye(ctx, w, h, color, pupil, far = 0) {
  const cx = w * 0.25;
  const cy = h * 0.5;
  const human = pupil === 'human';
  ctx.fillStyle = human ? '#f6f3ee' : '#2a1d17';
  ctx.fillRect(0, 0, w, h);
  if (human) {
    // Blanc de l'œil légèrement ombré vers le haut (paupière).
    const sh = ctx.createLinearGradient(0, 0, 0, h);
    sh.addColorStop(0, `rgba(120,100,95,${0.35 * (1 - far)})`);
    sh.addColorStop(0.35, 'rgba(120,100,95,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, w, h);
  }
  // L'iris occupe presque tout l'œil visible (sauf humain) ; de loin, l'iris humain grandit.
  const iris = (pupil === 'oval' ? 1.05 : human ? 0.72 : 0.92) * (1 + 0.22 * far);
  // De loin, l'iris fonce vers le brun-noir : l'œil se lit comme un point sombre bien net sur le blanc.
  const col = far > 0 ? mixHex(color, 0x17110e, 0.8 * far) : color;
  const rx = w * 0.16 * iris;
  const ry = h * 0.32 * iris;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  const g = ctx.createRadialGradient(0, 0, 0.1, 0, 0, 1);
  g.addColorStop(0, shade(col, 1.5 - 0.4 * far));
  g.addColorStop(0.6, hex(col));
  g.addColorStop(1, shade(col, 0.45));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  // Fibres de l'iris (effacées de loin).
  const rng = mulberry32(color);
  ctx.lineWidth = 0.04;
  for (let i = 0; i < 60; i++) {
    const a = rng() * Math.PI * 2;
    ctx.strokeStyle = rng() < 0.5 ? shade(color, 1.4) : shade(color, 0.6);
    ctx.globalAlpha = 0.5 * (1 - far);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 0.3, Math.sin(a) * 0.3);
    ctx.lineTo(Math.cos(a) * 0.95, Math.sin(a) * 0.95);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#050505';
  ctx.beginPath();
  if (pupil === 'slit') ctx.ellipse(0, 0, 0.16, 0.85, 0, 0, Math.PI * 2);
  else if (pupil === 'bar') ctx.roundRect(-0.7, -0.22, 1.4, 0.44, 0.2);
  else if (pupil === 'oval') ctx.ellipse(0, 0, 0.65, 0.4, 0, 0, Math.PI * 2);
  else ctx.arc(0, 0, human ? 0.5 + 0.2 * far : 0.42, 0, Math.PI * 2);
  ctx.fill();
  if (human) {
    // Bord de l'iris plus sombre et reflet peint (lisible même sans reflets du ciel).
    ctx.strokeStyle = shade(col, 0.4);
    ctx.lineWidth = 0.1;
    ctx.beginPath();
    ctx.arc(0, 0, 0.95, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(-0.32, -0.35, 0.22 + 0.06 * far, 0.18 + 0.06 * far, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Mélange de deux couleurs 0xRRGGBB (t = 0 : a, t = 1 : b). */
function mixHex(a, b, t) {
  const A = rgbOf(a);
  const B = rgbOf(b);
  return A.reduce((n, v, i) => (n << 8) | Math.round(v + (B[i] - v) * t), 0);
}

/** Œil : iris, pupille (ronde, fendue ou horizontale) et reflet, plaqués sur une sphère. */
export function eyeTexture(color, pupil = 'round') {
  return cached(`eye-${color}-${pupil}`, () => {
    const c = makeCanvas(128, 64);
    paintEye(c.getContext('2d'), 128, 64, color, pupil);
    return toTexture(c, { repeat: false });
  });
}

/** Œil humain : simplification de chaque niveau de mipmap (0 = détaillé, 1 = contrasté). */
const EYE_FAR = [0, 0, 0.3];

/**
 * Œil des personnages, avec des niveaux de détail peints à la main (mipmaps) : la carte graphique
 * choisit elle-même le niveau selon la taille de l'œil à l'écran. De près (niveaux 0 et 1), l'œil
 * détaillé de l'éditeur ; dès qu'il ne fait plus que quelques pixels (personnage vu en jeu, à
 * quelques mètres), un œil simplifié au contraste fort (grand iris presque noir, reflet blanc) au
 * lieu de la bouillie gris-bleu que donne la simple réduction de l'œil détaillé. Aucun calcul par image.
 */
export function humanEyeTexture(color) {
  return cached(`eye-${color}-human-lod`, () => {
    const levels = [];
    for (let w = 128, h = 64, L = 0; ; w = Math.max(1, w >> 1), h = Math.max(1, h >> 1), L++) {
      const c = makeCanvas(w, h);
      paintEye(c.getContext('2d'), w, h, color, 'human', EYE_FAR[L] ?? 1);
      levels.push(c);
      if (w === 1 && h === 1) break;
    }
    const tex = toTexture(levels[0], { repeat: false });
    tex.mipmaps = levels;
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    // Pas de filtrage anisotrope : le niveau suit la plus grande empreinte (œil vu de biais = version nette).
    tex.anisotropy = 1;
    return tex;
  });
}

// ------------------------------------------------------------------ décor

/** Texture de détail pour le sol (petits grains), répétée sur le terrain. */
export function groundDetail() {
  return cached('ground', () => {
    const size = 256;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, size, size);
    const rng = mulberry32(7);
    for (let i = 0; i < 9000; i++) {
      const v = 200 + rng() * 55;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(rng() * size, rng() * size, 1 + rng() * 2, 1 + rng() * 3);
    }
    const tex = toTexture(c, { srgb: false });
    tex.repeat.set(60, 60);
    return tex;
  });
}

/**
 * Détails du sol, trois motifs en niveaux de gris rangés dans les canaux R, G, B :
 * R = herbe (touffes et plaques douces), G = terre (mottes, cailloux), B = sable/neige (grain fin, rides).
 * Répétés sur le terrain à trois échelles et mélangés selon le type de sol (shader du terrain).
 * Tout est doux (pas de brin d'un pixel) : le sol ne grésille plus quand la caméra bouge.
 * A = hauteur du relief (touffes, mottes), dont le shader du sol tire un léger bosselage.
 */
function buildTerrainMaps() {
  const high = gfx.quality === 'high';
  const size = high ? 512 : 256;
  const s = size / 512;
  const rng = mulberry32(21);
  // Couche peinte (touffes = petits dégradés doux, cailloux), bouclée en dessinant 9 copies.
  const wrapped = (ctx, fn) => {
    for (const dx of [-size, 0, size]) {
      for (const dy of [-size, 0, size]) {
        ctx.save();
        ctx.translate(dx, dy);
        fn();
        ctx.restore();
      }
    }
  };
  const g = makeCanvas(size);
  const gc = g.getContext('2d', { willReadFrequently: true });
  gc.fillStyle = '#808080';
  gc.fillRect(0, 0, size, size);
  // Touffes d'herbe : taches rondes très douces, claires et sombres.
  for (let i = 0; i < 700 * s * s; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = (5 + rng() * 13) * s;
    const v = 70 + rng() * 150;
    wrapped(gc, () => {
      const grad = gc.createRadialGradient(x, y - r * 0.2, 0, x, y, r);
      grad.addColorStop(0, `rgba(${v},${v},${v},0.5)`);
      grad.addColorStop(1, `rgba(${v},${v},${v},0)`);
      gc.fillStyle = grad;
      gc.fillRect(x - r, y - r, r * 2, r * 2);
    });
  }
  // Brins : traits courts, épais et transparents (lisibles sans scintiller).
  gc.lineCap = 'round';
  for (let i = 0; i < 2200 * s * s; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const v = 60 + rng() * 170;
    const a = -Math.PI / 2 + (rng() - 0.5) * 1.3;
    const l = (5 + rng() * 9) * s;
    gc.strokeStyle = `rgba(${v},${v},${v},${0.18 + rng() * 0.2})`;
    gc.lineWidth = (1.6 + rng() * 2.2) * s;
    wrapped(gc, () => {
      gc.beginPath();
      gc.moveTo(x, y);
      gc.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      gc.stroke();
    });
  }
  // Terre : mottes douces et cailloux ronds.
  const d = makeCanvas(size);
  const dc = d.getContext('2d', { willReadFrequently: true });
  dc.fillStyle = '#7e7e7e';
  dc.fillRect(0, 0, size, size);
  for (let i = 0; i < 900 * s * s; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = (1.5 + rng() * 4) * s;
    const v = 110 + rng() * 90;
    wrapped(dc, () => {
      dc.fillStyle = `rgba(${v * 0.7},${v * 0.7},${v * 0.7},0.7)`;
      dc.beginPath();
      dc.ellipse(x + r * 0.3, y + r * 0.35, r, r * 0.75, 0, 0, Math.PI * 2);
      dc.fill();
      const grad = dc.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      grad.addColorStop(0, `rgba(${v + 30},${v + 30},${v + 30},0.9)`);
      grad.addColorStop(1, `rgba(${v},${v},${v},0.8)`);
      dc.fillStyle = grad;
      dc.beginPath();
      dc.ellipse(x, y, r, r * 0.75, 0, 0, Math.PI * 2);
      dc.fill();
    });
  }
  const gd = gc.getImageData(0, 0, size, size).data;
  const dd = dc.getImageData(0, 0, size, size).data;
  const data = new Uint8Array(size * size * 4);
  const clamp = (v) => Math.min(255, Math.max(0, v));
  const at = (arr, x, y) => arr[(((y + size) % size) * size + ((x + size) % size)) * 4];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const u = x / size;
      const v = y / size;
      // Bruits qui bouclent (tuile sans couture), du plus large au plus fin.
      const n1 = wrapNoise(u, v, 4, 1.3);
      const n2 = wrapNoise(u, v, 11, 7.1);
      const n3 = wrapNoise(u, v, 29, 3.7);
      const n4 = wrapNoise(v, u, 61, 5.2);
      // Couche peinte adoucie (moyenne 3×3).
      let gs = 0;
      let ds = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          gs += at(gd, x + ox, y + oy);
          ds += at(dd, x + ox, y + oy);
        }
      }
      gs /= 9;
      ds /= 9;
      // Herbe : plaques larges, touffes, et un léger grain.
      const grass = 128 + (n1 - 0.5) * 70 + (n2 - 0.5) * 60 + (n3 - 0.5) * 30 + (gs - 128) * 0.9 + (n4 - 0.5) * 12;
      data[i] = clamp(grass);
      // Terre : mottes (bruit moyen) et cailloux.
      const dirt = 120 + (n1 - 0.5) * 40 + (n2 - 0.5) * 55 + (n3 - 0.5) * 25 + (ds - 126) * 1.1;
      data[i + 1] = clamp(dirt);
      // Sable / neige : grain fin et rides ondulées.
      const ripple = 0.5 + 0.5 * Math.sin((v + n2 * 0.1) * Math.PI * 2 * 14);
      data[i + 2] = clamp(255 * (0.4 + (n3 - 0.5) * 0.3 + ripple * 0.12 + (n4 - 0.5) * 0.14));
      // Hauteur du relief : touffes et mottes, douce.
      data[i + 3] = clamp(128 + ((n2 - 0.5) * 1.2 + (n3 - 0.5) * 0.7 + (gs - 128) / 128 + (ds - 126) / 256) * 70);
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = high ? 4 : 2;
  tex.needsUpdate = true;
  return tex;
}

/** Texture de détail du sol (voir buildTerrainMaps). */
export function terrainDetail() {
  return cached(`terrain-${gfx.quality}`, buildTerrainMaps);
}

/**
 * Touffe d'herbe (carte transparente) : brins en éventail, sombres à la base et clairs au bout,
 * quelques brins jaunis. Presque blanche : la couleur du matériau et de l'instance la teinte.
 */
export function grassTuftTexture() {
  return cached(`tuft-${gfx.quality}`, () => {
    const high = gfx.quality === 'high';
    const size = high ? 256 : 128;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const rng = mulberry32(23);
    ctx.lineCap = 'round';
    const n = high ? 26 : 18;
    for (let i = 0; i < n; i++) {
      const x0 = size * (0.5 + (rng() - 0.5) * 0.22);
      const lean = (rng() - 0.5) * 1.6;
      const len = size * (0.5 + rng() * 0.48);
      const w = size * (0.028 + rng() * 0.02);
      const dry = rng() < 0.25;
      // Dégradé le long du brin : base sombre, pointe claire.
      const tipX = x0 + lean * len * 0.55;
      const tipY = size - len;
      const grad = ctx.createLinearGradient(x0, size, tipX, tipY);
      const base = dry ? 'rgb(150,140,90)' : 'rgb(118,132,96)';
      const tip = dry ? 'rgb(240,228,170)' : 'rgb(236,246,222)';
      grad.addColorStop(0, base);
      grad.addColorStop(0.55, dry ? 'rgb(205,195,130)' : 'rgb(186,206,160)');
      grad.addColorStop(1, tip);
      ctx.strokeStyle = grad;
      // Brin effilé : plusieurs segments de plus en plus fins.
      const segs = 5;
      let px = x0;
      let py = size;
      for (let k = 1; k <= segs; k++) {
        const t = k / segs;
        const nx = x0 + lean * len * t * t * 0.55;
        const ny = size - len * t;
        ctx.lineWidth = w * (1 - t * 0.85);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        px = nx;
        py = ny;
      }
    }
    return alphaTexture(c, [175, 192, 140]);
  });
}

/** Petite fleur vue de dessus (pétales blancs à teinter, cœur doré), carte transparente. */
export function flowerTexture() {
  return cached('flower', () => {
    const size = 64;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const cx = size / 2;
    const cy = size / 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * size * 0.2, cy + Math.sin(a) * size * 0.2);
      ctx.rotate(a);
      const grad = ctx.createLinearGradient(-size * 0.1, 0, size * 0.18, 0);
      grad.addColorStop(0, 'rgb(225,225,225)');
      grad.addColorStop(1, 'rgb(255,255,255)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(0, 0, size * 0.19, size * 0.11, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
    const heart = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.12);
    heart.addColorStop(0, 'rgb(255,220,110)');
    heart.addColorStop(1, 'rgb(220,170,60)');
    ctx.fillStyle = heart;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.12, 0, Math.PI * 2);
    ctx.fill();
    return alphaTexture(c, [235, 235, 235]);
  });
}

/** Écorce : sillons verticaux (bouleau : blanc avec des marques sombres horizontales). */
export function barkTexture(birch = false) {
  return cached(`bark-${birch}`, () => {
    const w = 128;
    const h = 256;
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = mulberry32(birch ? 5 : 6);
    ctx.fillStyle = birch ? '#e9e5dc' : '#6a5040';
    ctx.fillRect(0, 0, w, h);
    if (birch) {
      for (let i = 0; i < 90; i++) {
        ctx.fillStyle = `rgba(30,25,20,${0.4 + rng() * 0.5})`;
        const x = rng() * w;
        const y = rng() * h;
        const l = 4 + rng() * 22;
        ctx.fillRect(x, y, l, 1 + rng() * 3);
        ctx.fillRect(x - w, y, l, 1 + rng() * 3);
      }
    } else {
      for (let i = 0; i < 220; i++) {
        const x = rng() * w;
        const v = rng();
        ctx.strokeStyle = v < 0.6 ? `rgba(25,15,10,${0.35 + rng() * 0.4})` : `rgba(160,135,110,${0.2 + rng() * 0.3})`;
        ctx.lineWidth = 1 + rng() * 3;
        ctx.beginPath();
        const y0 = rng() * h;
        const l = 20 + rng() * 80;
        ctx.moveTo(x, y0);
        ctx.bezierCurveTo(x + (rng() - 0.5) * 6, y0 + l * 0.3, x + (rng() - 0.5) * 6, y0 + l * 0.6, x + (rng() - 0.5) * 4, y0 + l);
        ctx.stroke();
      }
    }
    return toTexture(c);
  });
}

/** Grappe de feuilles (gris clair, teintée par instance) avec transparence, pour les houppiers. */
export function leafTexture(kind = 'broad') {
  return cached(`leaves-${kind}`, () => {
    const size = 256;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    const rng = mulberry32(kind.length * 13 + 1);
    if (kind === 'needle') {
      // Rameau de sapin : tige centrale et aiguilles.
      for (let b = 0; b < 5; b++) {
        const x0 = size * (0.15 + b * 0.17);
        ctx.strokeStyle = 'rgb(120,120,120)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x0, size);
        ctx.lineTo(x0 + (rng() - 0.5) * 30, 10);
        ctx.stroke();
        for (let i = 0; i < 70; i++) {
          const t = rng();
          const x = x0 + (rng() - 0.5) * 10;
          const y = size - t * (size - 10);
          const v = 175 + rng() * 80;
          ctx.strokeStyle = `rgb(${v},${v},${v})`;
          ctx.lineWidth = 1.8;
          const a = (rng() < 0.5 ? -1 : 1) * (0.5 + rng() * 0.6) - Math.PI / 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x + Math.cos(a) * 22, y + Math.sin(a) * 22 + 10);
          ctx.stroke();
        }
      }
    } else {
      for (let i = 0; i < 320; i++) {
        const x = 20 + rng() * (size - 40);
        const y = 20 + rng() * (size - 40);
        // Plus de feuilles au centre de la grappe.
        const dx = x - size / 2;
        const dy = y - size / 2;
        if (Math.hypot(dx, dy) > size * 0.48 * (0.6 + rng() * 0.4)) continue;
        const v = 185 + rng() * 70;
        const a = rng() * Math.PI * 2;
        const l = kind === 'small' ? 6 + rng() * 5 : 8 + rng() * 7;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.fillStyle = `rgb(${v * 0.88},${v * 0.9},${v * 0.86})`;
        ctx.beginPath();
        ctx.ellipse(0, 0, l, l * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgb(${v},${v},${v})`;
        ctx.beginPath();
        ctx.ellipse(-l * 0.1, -l * 0.08, l * 0.8, l * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = `rgba(90,100,80,0.35)`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-l, 0);
        ctx.lineTo(l, 0);
        ctx.stroke();
        ctx.restore();
      }
    }
    return alphaTexture(c, [205, 210, 200]);
  });
}

/** Normales de vagues (tuile sans couture), pour l'eau animée. */
export function waterNormalTexture() {
  return cached('waterNormals', () => {
    const size = 256;
    const hgt = new Float32Array(size * size);
    const rng = mulberry32(3);
    const waves = [];
    for (let i = 0; i < 14; i++) {
      // Fréquences entières : la tuile boucle parfaitement.
      waves.push({ fx: Math.round((rng() - 0.5) * 16), fy: Math.round((rng() - 0.5) * 16) || 1, a: 1 / (1 + i * 0.45), p: rng() * 6.28 });
    }
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        let h = 0;
        for (const w of waves) h += Math.sin((u * w.fx + v * w.fy) * Math.PI * 2 + w.p) * w.a;
        h += (wrapNoise(u, v, 24, 2) - 0.5) * 1.2;
        hgt[y * size + x] = h;
      }
    }
    const data = new Uint8Array(size * size * 4);
    const at = (x, y) => hgt[((y + size) % size) * size + ((x + size) % size)];
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * 0.35;
        const dy = (at(x, y + 1) - at(x, y - 1)) * 0.35;
        const l = Math.hypot(dx, dy, 1);
        const i = (y * size + x) * 4;
        data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
        data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
        data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
        data[i + 3] = 255;
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.generateMipmaps = true;
    tex.needsUpdate = true;
    return tex;
  });
}

/**
 * Bouffée de nuage : un amas de boules cotonneuses, bien éclairées sur le dessus et ombrées
 * en dessous (la luminosité code l'éclairage : le shader des nuages la teinte selon l'heure).
 */
export function cloudTexture() {
  return cached('cloud', () => {
    const w = gfx.quality === 'high' ? 512 : 256;
    const h = Math.round(w * 0.625);
    const c = makeCanvas(w, h);
    const ctx = c.getContext('2d');
    const rng = mulberry32(8);
    const puffs = [];
    for (let i = 0; i < 34; i++) {
      const u = 0.14 + rng() * 0.72;
      const x = w * u;
      const dome = Math.sin(((u - 0.14) / 0.72) * Math.PI);
      const y = h * (0.62 - dome * 0.22 - rng() * 0.18);
      const r = h * (0.1 + rng() * 0.15) * (0.55 + dome * 0.6);
      puffs.push([x, y, r]);
    }
    // 1) Masse ombrée (gris-bleu doux), un peu plus basse : le ventre du nuage.
    for (const [x, y, r] of puffs) {
      const g = ctx.createRadialGradient(x, y + r * 0.3, r * 0.05, x, y + r * 0.3, r * 1.25);
      g.addColorStop(0, 'rgba(168,176,190,0.75)');
      g.addColorStop(0.55, 'rgba(168,176,190,0.4)');
      g.addColorStop(1, 'rgba(168,176,190,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // 2) Volumes éclairés par le haut, bords cotonneux.
    for (const [x, y, r] of puffs) {
      const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.4, r * 0.05, x, y, r);
      g.addColorStop(0, 'rgba(255,255,255,1)');
      g.addColorStop(0.45, 'rgba(250,251,253,0.85)');
      g.addColorStop(0.8, 'rgba(236,240,246,0.35)');
      g.addColorStop(1, 'rgba(230,235,243,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // 3) Petites boules brillantes sur la crête : la lumière accroche le sommet.
    for (const [x, y, r] of puffs) {
      if (y > h * 0.5) continue;
      const g = ctx.createRadialGradient(x - r * 0.15, y - r * 0.55, 1, x - r * 0.15, y - r * 0.4, r * 0.55);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    const tex = toTexture(c, { repeat: false });
    return tex;
  });
}

// ------------------------------------------------------------------ bâtiments
// Textures presque blanches : la couleur du matériau leur donne leur teinte.
// Chaque texture a sa carte de normales (relief léger : joints, tuiles, grain), en qualité « high ».

/**
 * Carte de normales à partir d'une image de hauteur (gris = hauteur).
 * Dessinée sur un canvas pour garder la même orientation que la texture de couleur.
 */
function normalFromHeight(src, strength = 2, blur = 1) {
  const w = src.width;
  const h = src.height;
  const d = src.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  let hg = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) hg[i] = (d[i * 4] * 0.5 + d[i * 4 + 1] * 0.3 + d[i * 4 + 2] * 0.2) / 255;
  for (let b = 0; b < blur; b++) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) sum += hg[((y + oy + h) % h) * w + ((x + ox + w) % w)];
        out[y * w + x] = sum / 9;
      }
    }
    hg = out;
  }
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const at = (x, y) => hg[((y + h) % h) * w + ((x + w) % w)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      img.data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      img.data[i + 1] = ((dy / l) * 0.5 + 0.5) * 255; // le canvas a l'axe y vers le bas
      img.data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

/** Canvas de hauteur (gris) pour l'enduit : bosses douces sans grain fin. */
function plasterHeight(size) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const n = wrapNoise(u, v, 5, 1) * 0.55 + wrapNoise(u, v, 18, 2) * 0.3 + wrapNoise(u, v, 40, 4) * 0.15;
      const val = 60 + n * 160;
      const i = (y * size + x) * 4;
      img.data[i] = val;
      img.data[i + 1] = val;
      img.data[i + 2] = val;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Enduit de façade : grain, petites taches, coulures légères. */
export function plasterTexture() {
  return cached('plaster', () => {
    const size = 256;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const img = ctx.createImageData(size, size);
    const rng = mulberry32(31);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        const n = wrapNoise(u, v, 6, 1) * 0.5 + wrapNoise(u, v, 24, 2) * 0.3 + rng() * 0.2;
        const streak = wrapNoise(u * 3, v * 0.3, 8, 5) * 0.06;
        const val = 212 + n * 43 - streak * 255;
        const i = (y * size + x) * 4;
        img.data[i] = val;
        img.data[i + 1] = val;
        img.data[i + 2] = val * 0.98;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    return toTexture(c);
  });
}

/** Planches de bois verticales avec veinage. */
export function planksTexture() {
  return cached('planks', () => planksCanvas());
}

function planksCanvas() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rng = mulberry32(32);
  const n = 6;
  const pw = size / n;
  for (let i = 0; i < n; i++) {
    const v = 200 + rng() * 45;
    ctx.fillStyle = `rgb(${v},${v * 0.985},${v * 0.96})`;
    ctx.fillRect(i * pw, 0, pw, size);
    // Veinage.
    for (let k = 0; k < 14; k++) {
      const x = i * pw + rng() * pw;
      ctx.strokeStyle = `rgba(60,45,35,${0.08 + rng() * 0.15})`;
      ctx.lineWidth = 0.6 + rng() * 1.4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.bezierCurveTo(x + (rng() - 0.5) * 8, size * 0.33, x + (rng() - 0.5) * 8, size * 0.66, x + (rng() - 0.5) * 4, size);
      ctx.stroke();
    }
    // Nœud du bois.
    if (rng() < 0.6) {
      ctx.fillStyle = 'rgba(70,50,35,0.35)';
      ctx.beginPath();
      ctx.ellipse(i * pw + pw * (0.3 + rng() * 0.4), rng() * size, 2 + rng() * 3, 4 + rng() * 4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // Joint sombre entre les planches, arête claire à côté.
    ctx.fillStyle = 'rgba(25,18,12,0.75)';
    ctx.fillRect(i * pw, 0, 2.5, size);
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(i * pw + 2.5, 0, 1.5, size);
  }
  const tex = toTexture(c);
  tex.userData.canvas = c;
  return tex;
}

/** Toiture : 'tiles' (tuiles rondes), 'slate' (ardoises), 'shingle' (bardeaux de bois). */
export function roofTexture(kind = 'slate') {
  return cached(`roof-${kind}`, () => roofCanvas(kind));
}

function roofCanvas(kind) {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rng = mulberry32(kind.length * 7 + 33);
  ctx.fillStyle = '#8a8a8a';
  ctx.fillRect(0, 0, size, size);
  const rows = kind === 'tiles' ? 10 : 12;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const cols = kind === 'tiles' ? 8 : kind === 'shingle' ? 9 : 10;
    const cw = size / cols;
    const off = (r % 2) * cw * 0.5;
    for (let k = -1; k <= cols; k++) {
      const x = k * cw + off + (kind === 'tiles' ? 0 : (rng() - 0.5) * 2);
      const y = r * rh;
      const v = 178 + rng() * 62;
      if (kind === 'tiles') {
        // Tuile canal : bombée (clair au milieu, sombre sur les bords).
        const g = ctx.createLinearGradient(x, 0, x + cw, 0);
        g.addColorStop(0, `rgb(${v * 0.62},${v * 0.62},${v * 0.62})`);
        g.addColorStop(0.45, `rgb(${v},${v},${v})`);
        g.addColorStop(0.7, `rgb(${v * 0.92},${v * 0.92},${v * 0.92})`);
        g.addColorStop(1, `rgb(${v * 0.58},${v * 0.58},${v * 0.58})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.roundRect(x + 1, y, cw - 2, rh + 3, [0, 0, cw / 2, cw / 2]);
        ctx.fill();
      } else if (kind === 'shingle') {
        ctx.fillStyle = `rgb(${v},${v * 0.97},${v * 0.92})`;
        ctx.fillRect(x + 1, y, cw - 2, rh + 2);
        // Fibres du bois.
        for (let f = 0; f < 5; f++) {
          ctx.fillStyle = `rgba(0,0,0,${0.06 + rng() * 0.1})`;
          ctx.fillRect(x + 2 + rng() * (cw - 4), y, 1, rh);
        }
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + 1, y + rh, cw - 2, 2);
      } else {
        // Ardoise : légère variation de teinte, bord inférieur ombré.
        const g = ctx.createLinearGradient(0, y, 0, y + rh);
        g.addColorStop(0, `rgb(${v * 1.04},${v * 1.04},${v * 1.06})`);
        g.addColorStop(1, `rgb(${v * 0.9},${v * 0.9},${v * 0.93})`);
        ctx.fillStyle = g;
        ctx.fillRect(x + 1, y, cw - 2, rh + 2);
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x + 1, y + rh, cw - 2, 2);
      }
    }
    // Ombre portée de la rangée du dessus.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, r * rh, size, 2.5);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(0, r * rh + 2.5, size, 3);
  }
  const tex = toTexture(c);
  tex.userData.canvas = c;
  return tex;
}

/** Soubassement en pierres maçonnées. */
export function stoneTexture() {
  return cached('stone', () => stoneCanvas());
}

function stoneCanvas() {
  const size = 256;
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const rng = mulberry32(34);
  ctx.fillStyle = '#7e7a74';
  ctx.fillRect(0, 0, size, size);
  let y = 0;
  while (y < size) {
    const h = 18 + rng() * 16;
    let x = -rng() * 30;
    while (x < size) {
      const w = 26 + rng() * 34;
      const v = 150 + rng() * 90;
      const g = ctx.createLinearGradient(x, y, x + w * 0.4, y + h);
      g.addColorStop(0, `rgb(${v * 1.05},${v * 1.02},${v * 0.97})`);
      g.addColorStop(1, `rgb(${v * 0.9},${v * 0.88},${v * 0.85})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.roundRect(x + 2, y + 2, w - 4, h - 4, 5);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(x + 4, y + 3, w - 10, 3);
      x += w;
    }
    y += h;
  }
  const tex = toTexture(c);
  tex.userData.canvas = c;
  return tex;
}

/**
 * Carte de normales d'un matériau de bâtiment : 'plaster', 'planks', 'stone',
 * 'roof-tiles', 'roof-slate', 'roof-shingle'. Null en qualité « low » (pas de relief).
 */
export function buildingNormal(kind) {
  if (gfx.quality !== 'high') return null;
  return cached(`normal-${kind}`, () => {
    if (kind === 'plaster') return normalFromHeight(plasterHeight(256), 1.6, 1);
    if (kind === 'planks') return normalFromHeight(planksTexture().userData.canvas, 2.2, 0);
    if (kind === 'stone') return normalFromHeight(stoneTexture().userData.canvas, 2.4, 1);
    if (kind.startsWith('roof-')) return normalFromHeight(roofTexture(kind.slice(5)).userData.canvas, 2.6, 0);
    return normalFromHeight(plasterHeight(128), 1, 1);
  });
}

/** Paille (bottes de foin, litière). */
export function strawTexture() {
  return cached('straw', () => {
    const size = 128;
    const c = makeCanvas(size);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#c9a54e';
    ctx.fillRect(0, 0, size, size);
    const rng = mulberry32(35);
    for (let i = 0; i < 900; i++) {
      const x = rng() * size;
      const y = rng() * size;
      const a = (rng() - 0.5) * 0.9;
      const l = 6 + rng() * 14;
      const v = rng();
      ctx.strokeStyle = v < 0.5 ? `rgba(240,215,140,${0.5 + rng() * 0.5})` : `rgba(130,95,40,${0.3 + rng() * 0.4})`;
      ctx.lineWidth = 0.8 + rng();
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    return toTexture(c);
  });
}

/** Panneau avec du texte (refuge, vétérinaire…). */
export function signTexture(text, bg = '#6b4a2f', fg = '#fff8e8', emoji = '') {
  const canvas = makeCanvas(512, 128);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 512, 128);
  // Veinage du bois du panneau.
  const rng = mulberry32(text.length * 17 + 3);
  ctx.globalAlpha = 0.12;
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = rng() < 0.5 ? '#000' : '#fff';
    ctx.lineWidth = 1 + rng() * 2;
    const y = rng() * 128;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(170, y + (rng() - 0.5) * 10, 340, y + (rng() - 0.5) * 10, 512, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 8;
  ctx.strokeRect(4, 4, 504, 120);
  ctx.fillStyle = fg;
  const label = `${emoji} ${text}`.trim();
  // Les noms longs (« Maison des animaux ») rapetissent pour tenir dans le panneau.
  let size = 56;
  ctx.font = `bold ${size}px system-ui, sans-serif`;
  while (size > 26 && ctx.measureText(label).width > 480) {
    size -= 2;
    ctx.font = `bold ${size}px system-ui, sans-serif`;
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 68);
  return toTexture(canvas, { repeat: false });
}

/** Sprite emoji (cœurs, zzz, bulles d'humeur). */
export function emojiTexture(emoji) {
  const key = `emoji-${emoji}`;
  if (cache.has(key)) return cache.get(key);
  const canvas = makeCanvas(64);
  const ctx = canvas.getContext('2d');
  ctx.font = '48px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(emoji, 32, 36);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, tex);
  return tex;
}

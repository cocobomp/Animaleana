// Robes des chats dessinées par le code : motifs (tigré, marbré, tacheté de rosettes, agouti,
// colourpoint, écaille, tricolore), taches blanches (gants, mitted, bicolore), masque du visage,
// « M » sur le front, peau nue du Sphynx, poil frisé du Devon rex, et les yeux.
// Chaque texture suit les UV des formes du chat (voir models/catModel.js) :
//   corps : u fait le tour (0 = ventre, 0,5 = dos), v va de l'arrière (0) vers l'avant (1) ;
//   tête : u fait le tour (0 = menton, 0,5 = front), v va de l'arrière du crâne (0) au nez (1) ;
//   cou, pattes, queue, oreille : u fait le tour (0 = devant / dessous), v va de la base (0) au bout (1).

import * as THREE from 'three';
import { mulberry32 } from '../sim/rng.js';
import { noise3 } from './models/shapes.js';
import { gfx } from './gfx.js';
import { lum } from './textures.js';

const rgb = (c) => [(c >> 16) & 255, (c >> 8) & 255, c & 255];
const WHITE = [247, 244, 239];

const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const edge = (x, e, f = 0.04) => smooth(e - f, e + f, x);
/** Écart en u, en tenant compte du tour (0 et 1 se touchent). */
const du = (a, b) => {
  const d = Math.abs(a - b) % 1;
  return d > 0.5 ? 1 - d : d;
};

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(canvas, repeat = true) {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }
  tex.anisotropy = gfx.quality === 'high' ? 4 : 1;
  return tex;
}

/** Bruit qui boucle en u (autour du corps) : pas de couture visible. */
function wrapNoise(u, v, freq, seed) {
  const a = u * Math.PI * 2;
  const r = freq / (Math.PI * 2);
  return noise3(Math.cos(a) * r + seed, Math.sin(a) * r, v * freq);
}

/** Tache organique (calico, rosettes), dessinée trois fois pour boucler en u. */
function blob(ctx, x, y, r, rng, w, squash = 0.8, rot = 0) {
  const n = 12;
  const pts = [];
  const ph = [rng() * 6, rng() * 6];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const rr = r * (0.8 + 0.16 * Math.sin(a * 2 + ph[0]) + 0.1 * Math.sin(a * 3 + ph[1]));
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr * squash;
    pts.push([px * Math.cos(rot) - py * Math.sin(rot), px * Math.sin(rot) + py * Math.cos(rot)]);
  }
  for (const dx of [-w, 0, w]) {
    ctx.beginPath();
    for (let i = 0; i <= n; i++) {
      const [ax, ay] = pts[i % n];
      const [bx, by] = pts[(i + 1) % n];
      const mx = x + dx + (ax + bx) / 2;
      const my = y + (ay + by) / 2;
      if (i === 0) ctx.moveTo(mx, my);
      else ctx.quadraticCurveTo(x + dx + ax, y + ay, mx, my);
    }
    ctx.closePath();
    ctx.fill();
  }
}

/** Couleur de la truffe et des coussinets selon la robe. */
export function catSkinColors(look, traits) {
  const coat = look.coat;
  const p = traits.pattern;
  const [r, g, b] = rgb(coat);
  const warm = r > b + 40;
  const sat = Math.max(r, g, b) - Math.min(r, g, b);
  if (traits.hair === 'hairless') return { nose: 0xc98480, pad: 0xc98480 };
  if (p === 'points') {
    const [sr, , sb] = rgb(look.secondary);
    const L = lum(look.secondary);
    if (L < 0.2) return { nose: 0x3a2b26, pad: traits.white ? 0xe3a2a0 : 0x3d2e29 };
    if (sb > sr) return { nose: 0x5e6674, pad: traits.white ? 0xe0a4a4 : 0x66707c };
    if (sr > sb + 30 && L < 0.4) return { nose: 0x6e4a3e, pad: traits.white ? 0xe3a2a0 : 0x7a5446 };
    return { nose: 0xc09aa4, pad: 0xd8a8b0 };
  }
  if (lum(coat) < 0.09) return { nose: 0x2b2523, pad: p === 'bicolor' ? 0xe0a0a0 : 0x2e2725 };
  if (sat < 26 && lum(coat) < 0.6) return { nose: 0x5f636c, pad: traits.white ? 0xe0a4a4 : 0x646872 };
  if (warm && (p === 'tabby' || p === 'classic' || p === 'rosettes' || p === 'ticked')) return { nose: 0xb35a4a, pad: 0x6a4436 };
  if (warm) return { nose: 0xd9897a, pad: 0xe0a094 };
  if (p === 'tabby' || p === 'classic' || p === 'rosettes') return { nose: 0xa4635c, pad: 0x4a3a36 };
  return { nose: 0xe39a98, pad: 0xe7a6a6 };
}

/**
 * Textures du pelage d'un chat, une par partie : body, neck, head, tail, ear, legs[4].
 * traits : catTraits(look) ; marks : repères du visage en UV de la tête
 *   { eyes: [[u, v], [u, v]], noseV, brow } calculés par le modèle.
 */
export function catCoatTextures(look, traits, marks) {
  const high = gfx.quality === 'high';
  const BIG = high ? 256 : 128;
  const MID = high ? 256 : 128;
  const SMALL = high ? 128 : 64;
  const seed = ((look.seed ?? 1) % 1000) * 0.37;
  const coat = rgb(look.coat);
  const sec = rgb(look.secondary);
  const third = rgb(look.third ?? look.secondary);
  const p = traits.pattern;
  const white = traits.white ?? (p === 'bicolor' ? 'tuxedo' : null);
  const hairless = traits.hair === 'hairless';
  const longHair = traits.hair === 'long' || traits.hair === 'semi';
  // Les rayures et taches d'un tigré sont plus douces chez les poils longs.
  const soft = longHair ? 0.05 : 0.03;
  // Couleur « blanche » de la robe : le blanc, sauf pour l'ancien motif bicolore (sa 2e couleur).
  const whiteCol = p === 'bicolor' ? sec : WHITE;
  // Bicolore « ancien » (smoking, pie) : la couleur principale dessus, la seconde en blanc.
  const base = p === 'tricolor' ? WHITE : coat;
  const light = coat.map((c) => Math.min(255, c * 1.18 + 18)); // menton, ventre plus clairs (tigrés)
  const eyes = marks?.eyes ?? [[0.31, 0.78], [0.69, 0.78]];
  const vE = (eyes[0][1] + eyes[1][1]) / 2;
  const vN = marks?.noseV ?? 0.97;
  const rng = mulberry32((look.seed || 1) * 7 + 3);
  const tabbyLike = p === 'tabby' || p === 'classic';
  const out = [0, 0, 0];

  const mix = (c, k) => {
    if (k <= 0) return;
    const kk = Math.min(1, k);
    out[0] += (c[0] - out[0]) * kk;
    out[1] += (c[1] - out[1]) * kk;
    out[2] += (c[2] - out[2]) * kk;
  };
  const mul = (f) => {
    out[0] *= f;
    out[1] *= f;
    out[2] *= f;
  };

  // Rayures du tigré (bandes en travers d'une forme), avec un peu de tremblé.
  const bands = (x, n, width) => {
    const ph = x - Math.floor(x);
    return 1 - smooth(width * 0.5 - soft, width * 0.5 + soft, Math.abs(ph - 0.5));
  };
  // Agouti (Abyssin) : chaque poil est rayé, ça donne un grain fin.
  const ticking = (u, v, f = 1) => {
    const g = wrapNoise(u, v, 160, seed) * 0.6 + wrapNoise(u, v + 0.3, 330, seed + 4) * 0.4;
    return smooth(0.35, 0.75, g) * f;
  };
  const tortie = (u, v) => {
    const t = wrapNoise(u, v, 5, seed + 3) + (wrapNoise(u, v, 17, seed + 9) - 0.5) * 0.45;
    return smooth(0.47, 0.55, t);
  };

  // Base + motif, en un point (u, v) d'une partie.
  const pattern = (part, u, v, n) => {
    out[0] = base[0];
    out[1] = base[1];
    out[2] = base[2];
    const b = Math.min(u, 1 - u) * 2; // 0 dessous, 1 dessus
    if (p === 'points') {
      if (part === 'body') mix(sec, 0.08 + 0.22 * smooth(0.45, 1, b) * (0.7 + 0.3 * smooth(0.6, 0, v)));
      else if (part === 'neck') mix(sec, 0.1 + 0.18 * b + 0.15 * v);
      else if (part === 'head') {
        // Masque : le museau et le tour des yeux, qui s'estompe vers le front et l'arrière du crâne.
        const front = smooth(vE - 0.22 + n * 0.06, vE + 0.02, v);
        const crown = smooth(0.18, 0.02, du(u, 0.5)) * smooth(vE + 0.06, vE - 0.06, v);
        mix(sec, front * (1 - 0.75 * crown) + 0.06);
      } else if (part === 'ear') mix(sec, 0.92);
      else if (part === 'leg') mix(sec, smooth(0.15, 0.62, v + n * 0.08));
      else if (part === 'tail') mix(sec, smooth(-0.05, 0.3, v));
      return;
    }
    if (p === 'tortie' || (p === 'tricolor' && hairless)) {
      mix(sec, tortie(u, v));
      return;
    }
    if (p === 'ticked') {
      const tk = part === 'body' ? smooth(0.15, 0.6, b) : part === 'leg' ? smooth(0.4, 0.05, du(u, 0)) * 0.6 + 0.2 : part === 'head' ? 0.55 : 0.75;
      mix(sec, ticking(u, v) * 0.55 * tk);
      if (part === 'body') mix(sec, (1 - edge(du(u, 0.5), 0.025 + n * 0.01, 0.015)) * 0.55);
      if (part === 'tail') mix(sec, smooth(0.78, 0.95, v) * 0.9 + (1 - edge(du(u, 0.5), 0.12)) * 0.35);
      if (part === 'body' || part === 'neck' || part === 'leg') mix(light, (1 - smooth(0.05, 0.3, b)) * 0.5);
      return;
    }
    if (tabbyLike || p === 'rosettes') {
      // Ventre, menton et intérieur des pattes plus clairs (poil « agouti » des tigrés).
      if (part === 'body' || part === 'neck') mix(light, (1 - smooth(0.05, 0.4, b)) * 0.55);
      if (p === 'rosettes' && part === 'body') mix(light, (1 - smooth(0.1, 0.55, b)) * 0.4);
      if (p === 'rosettes') {
        if (part === 'tail') mix(sec, Math.max(bands(v * 6 + n * 0.3, 0, 0.32) * smooth(0.2, 0.4, v), smooth(0.86, 0.92, v)));
        if (part === 'leg') mix(sec, bands(v * 4 + 0.3 + n * 0.4, 0, 0.18) * 0.6 * smooth(0.15, 0.35, v) * smooth(0.95, 0.75, v));
        if (part === 'body') mix(sec, (1 - edge(du(u, 0.5), 0.02 + n * 0.01, 0.015)) * 0.35);
        return;
      }
      if (part === 'body') {
        if (p === 'tabby') {
          // Rayures « tigre » en travers, qui s'effacent sous le ventre ; raie sombre sur le dos.
          // Rayures fines et nombreuses, un peu cassées par endroits (vrai tigré « maquereau »).
          // Elles partent de la raie du dos et filent un peu vers l'arrière en descendant (arêtes de poisson).
          const x = v * 13 + (1 - b) * 1.1 + Math.sin(u * Math.PI * 6) * 0.15 + n * 0.6;
          const broken = smooth(-0.25, 0.05, wrapNoise(u, v, 14, seed + 31) - 0.5);
          mix(sec, bands(x, 0, 0.26) * smooth(0.18, 0.5, b) * (0.4 + 0.42 * broken));
          mix(sec, (1 - edge(du(u, 0.5), 0.035 + n * 0.012, 0.015)) * 0.85);
        } else {
          // Marbré : une cible sur chaque flanc, trois lignes sur le dos, un papillon sur les épaules.
          const k = longHair ? 0.6 : 0.82;
          for (const uc of [0.25, 0.75]) {
            const d = Math.hypot(du(u, uc) * 1.15, (v - 0.4) * 0.9) + n * 0.05;
            const ring = 1 - smooth(0.014 - soft * 0.25, 0.014 + soft * 0.25, Math.abs(d - 0.085));
            const core = 1 - smooth(0.025, 0.035, d);
            const ring2 = (1 - smooth(0.018 - soft * 0.25, 0.018 + soft * 0.25, Math.abs(d - 0.15))) * smooth(-0.1, 0.25, n * 2 + 0.1);
            mix(sec, Math.min(1, ring + core + ring2 * smooth(0.25, 0.08, Math.abs(v - 0.4))) * k);
          }
          const sp = du(u, 0.5);
          mix(sec, Math.max(1 - edge(sp, 0.012, 0.008), 1 - edge(Math.abs(sp - 0.045), 0.01, 0.008)) * smooth(0.05, 0.25, v) * smooth(0.85, 0.7, v) * k);
          const fly = Math.hypot((sp - 0.08) * 1.4, v - 0.78) + n * 0.03;
          mix(sec, (1 - smooth(0.03, 0.045, fly)) * k);
        }
        return;
      }
      if (part === 'neck') {
        mix(sec, bands(v * 3 + 0.5, 0, 0.3) * smooth(0.15, 0.4, b) * 0.6); // colliers
        mix(sec, (1 - smooth(0.25, 0.65, b)) * bands(v * 2.5, 0, 0.25) * 0.5);
        return;
      }
      if (part === 'leg') {
        mix(sec, bands(v * 5.5 + 0.4 + n * 0.3, 0, 0.3) * 0.75 * smooth(0.12, 0.3, v) * smooth(0.95, 0.8, v));
        mix(light, smooth(0.25, 0.05, du(u, 0.5)) * 0.25);
        return;
      }
      if (part === 'tail') {
        mix(sec, Math.max(bands(v * 6.5 + n * 0.2, 0, 0.4) * smooth(0.08, 0.25, v), smooth(0.86, 0.93, v)) * 0.95);
        return;
      }
      if (part === 'ear') {
        mix(sec, smooth(0.55, 0.9, v) * 0.6);
      }
      return;
    }
    if (p === 'tricolor') {
      return; // plaques ajoutées ensuite (formes)
    }
    if (p === 'bicolor' && part === 'ear') return;
    // Unis : un léger reflet argenté (pointes plus claires) sur les poils denses.
    if (traits.hair === 'plush') mix(WHITE, (wrapNoise(u, v, 90, seed + 1) - 0.4) * 0.12);
  };

  // Face : M sur le front, traits de mascara, menton clair, joues rayées.
  const faceMarks = (u, v, n) => {
    if (p === 'points' || p === 'tricolor' || p === 'tortie' || p === 'bicolor' || p === 'solid') return;
    const ft = du(u, 0.5);
    const strong = p === 'ticked' ? 0.35 : p === 'rosettes' ? 0.7 : 0.85;
    // Le « M » : lignes verticales sur le front, en éventail.
    if (v < vE + 0.02 && v > vE - 0.3) {
      const k = smooth(vE - 0.3, vE - 0.18, v) * smooth(vE + 0.03, vE - 0.04, v);
      const line = (c, w) => 1 - smooth(w * 0.5, w * 0.5 + 0.008, Math.abs(ft - c - (vE - v) * 0.05));
      mix(sec, Math.max(line(0, 0.016), line(0.04, 0.014), line(0.08, 0.012)) * k * strong);
    }
    // Mascara : un trait qui part du coin de l'œil vers la joue.
    for (const [ue, ve] of eyes) {
      const out1 = ue < 0.5 ? -1 : 1;
      const dx = (u - ue) * out1; // vers l'extérieur du visage (vers le menton)
      const along = smooth(0.0, 0.03, -dx) * smooth(0.16, 0.08, -dx);
      const lineV = ve - 0.02 - (-dx) * 0.9;
      mix(sec, along * (1 - smooth(0.006, 0.014, Math.abs(v - lineV))) * strong);
      // « Lunettes » claires autour des yeux.
      const d = Math.hypot(du(u, ue) * 1.3, v - ve);
      mix(light, (1 - smooth(0.045, 0.07, d)) * 0.5);
    }
    // Museau et menton plus clairs (coussinets des moustaches).
    mix(light, smooth(vN - 0.17, vN - 0.07, v) * 0.45 + (1 - smooth(0.12, 0.3, Math.min(u, 1 - u) * 2)) * smooth(vE - 0.1, vE + 0.05, v) * 0.35);
    // Rayures sur les joues.
    for (const c of [0.15, 0.85]) {
      const d = du(u, c);
      if (d < 0.08) mix(sec, bands(v * 9 + d * 4, 0, 0.3) * smooth(0.08, 0.02, d) * smooth(vE - 0.2, vE - 0.05, v) * smooth(vN - 0.02, vN - 0.15, v) * 0.6 * strong);
    }
    // Taches sur le front et les joues (Bengal).
    if (p === 'rosettes') {
      const s = wrapNoise(u, v, 40, seed + 3);
      mix(sec, smooth(0.62, 0.68, s) * smooth(vN - 0.05, vE - 0.05, v) * 0.8);
    }
  };

  // Taches blanches, par-dessus le motif.
  const whiteMarks = (part, u, v, n, front) => {
    if (!white) return 0;
    const b = Math.min(u, 1 - u) * 2;
    switch (white) {
      case 'gloves':
        if (part === 'leg') return front ? edge(v, 0.84 + n * 0.04, 0.02) : Math.max(edge(v, 0.76 + n * 0.04, 0.02), edge(v, 0.5 + n * 0.08, 0.03) * (1 - edge(du(u, 0), 0.12, 0.03)));
        return 0;
      case 'mitted':
        if (part === 'leg') return front ? edge(v, 0.8 + n * 0.05, 0.02) : edge(v, 0.42 + n * 0.08, 0.03);
        if (part === 'body') return (1 - edge(Math.min(u, 1 - u), 0.06 + n * 0.035, 0.015)) * edge(v, 0.15, 0.08);
        if (part === 'neck') return 1 - edge(b, 0.42 + n * 0.15, 0.04);
        if (part === 'head') return (1 - edge(Math.min(u, 1 - u) * 2, 0.3 + n * 0.12, 0.05)) * edge(v, vE - 0.12, 0.05);
        return 0;
      case 'bicolor':
        if (part === 'leg') return edge(v, 0.12 + n * 0.1, 0.03);
        if (part === 'body') return 1 - edge(b, 0.46 + n * 0.2 + 0.18 * smooth(0.65, 1, v), 0.03);
        if (part === 'neck') return 1 - edge(b, 0.6 + n * 0.2, 0.04);
        if (part === 'head') {
          // V inversé blanc entre les yeux, museau et menton blancs.
          const vee = 1 - smooth(0, 0.012, du(u, 0.5) - Math.max(0, v - (vE - 0.16)) * 0.62);
          const muzzle = edge(v, vN - 0.1 + n * 0.03, 0.025);
          const chin = (1 - edge(Math.min(u, 1 - u) * 2, 0.45 + n * 0.1, 0.05)) * edge(v, vE - 0.15, 0.05);
          return Math.max(vee * edge(v, vE - 0.2, 0.03), muzzle, chin);
        }
        if (part === 'tail') return 0;
        return 0;
      case 'tuxedo': // smoking : plastron, ventre, chaussettes, museau
        if (part === 'leg') return edge(v, 0.7 + n * 0.08, 0.02);
        if (part === 'body') return 1 - edge(b, 0.3 + n * 0.25 + 0.3 * smooth(0.6, 0.98, v), 0.03);
        if (part === 'neck') return 1 - edge(b, 0.5 + n * 0.2, 0.04);
        if (part === 'head') {
          const muzzle = edge(v, vN - 0.12 + n * 0.04, 0.03) * (1 - edge(du(u, 0.5), 0.3, 0.05));
          const chin = (1 - edge(Math.min(u, 1 - u) * 2, 0.4 + n * 0.15, 0.05)) * edge(v, vE - 0.1, 0.05);
          return Math.max(muzzle, chin);
        }
        return 0;
      case 'chest':
        if (part === 'body') return (1 - edge(b, 0.22 + n * 0.12, 0.03)) * smooth(0.72, 0.9, v);
        if (part === 'neck') return 1 - edge(b, 0.35 + n * 0.15, 0.04);
        return 0;
      case 'van':
        if (part === 'tail' || part === 'ear') return 0;
        if (part === 'head') return 1 - smooth(0.22, 0.12, du(u, 0.5)) * smooth(vE - 0.02, vE - 0.12, v);
        return 1;
      default:
        return 0;
    }
  };

  const paint = (size, part, { front = false, counter = false, strokes = true } = {}) => {
    const c = makeCanvas(size);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    const img = ctx.createImageData(size, size);
    const d = img.data;
    // Sur le corps, le haut et le bas de la texture se resserrent en un point (poitrail, sous la
    // queue) : on y fond le motif dans la couleur du ventre pour éviter une étoile de traits.
    const poleOf = (v) => (part === 'body' ? Math.max(smooth(0.9, 0.985, v), smooth(0.08, 0.015, v)) : 0);
    const belly = [0, 0, 0];
    for (let py = 0; py < size; py++) {
      const v = 1 - (py + 0.5) / size;
      const pole = poleOf(v);
      if (pole > 0) {
        pattern(part, 0.001, v, 0);
        belly[0] = out[0];
        belly[1] = out[1];
        belly[2] = out[2];
      }
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        const n = wrapNoise(u, v, 9, seed + part.length) - 0.5;
        pattern(part, u, v, n);
        if (part === 'head') faceMarks(u, v, n);
        if (pole > 0) mix(belly, pole);
        const i = (py * size + px) * 4;
        d[i] = out[0];
        d[i + 1] = out[1];
        d[i + 2] = out[2];
        d[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    // Formes : plaques du tricolore, rosettes du Bengal.
    const r2 = mulberry32((look.seed || 1) + part.length * 31);
    const css = (cc) => `rgb(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0})`;
    const s = size / 256;
    if (p === 'tricolor' && !hairless && part !== 'ear') {
      const n = part === 'body' ? 9 : part === 'head' ? 4 : 3;
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = css(k % 2 ? third : sec);
        // Surtout sur le dos et le dessus de la tête ; les pattes restent surtout blanches.
        const u = part === 'body' || part === 'head' ? 0.5 + (r2() - 0.5) * 0.55 : r2();
        const v = part === 'leg' ? r2() * 0.45 : part === 'head' ? 0.15 + r2() * 0.5 : part === 'body' ? 0.12 + r2() * 0.76 : r2();
        const rad = (part === 'body' ? 30 + r2() * 34 : part === 'head' ? 34 + r2() * 26 : 26 + r2() * 30) * s;
        if (part === 'leg' && r2() < 0.5) continue;
        blob(ctx, u * size, (1 - v) * size, rad, r2, size, 0.85);
      }
    }
    if (p === 'rosettes' && (part === 'body' || part === 'neck' || part === 'leg' || part === 'tail')) {
      const n = part === 'body' ? 70 : part === 'neck' ? 14 : 10;
      const mid = coat.map((x, i) => x * 0.72 + sec[i] * 0.12);
      for (let k = 0; k < n; k++) {
        const u = part === 'body' ? 0.08 + r2() * 0.84 : r2();
        const v = part === 'tail' ? r2() * 0.3 : part === 'body' ? 0.1 + r2() * 0.8 : r2();
        if (part === 'body' && du(u, 0.5) < 0.05) continue;
        const big = part === 'body' ? (du(u, 0.5) < 0.2 ? 0.8 : 1) : 0.6;
        const rad = (6 + r2() * 7) * s * big * (size / (part === 'body' ? 256 : 128) > 1.5 ? 0.5 : 1);
        const x = u * size;
        const y = (1 - v) * size;
        // Rosette : un cœur roux plus foncé, entouré de taches noires (anneau cassé), allongée le long du corps.
        ctx.fillStyle = css(mid);
        blob(ctx, x, y, rad * 0.85, r2, size, 1.3);
        ctx.fillStyle = css(sec);
        const pieces = 5 + Math.floor(r2() * 3);
        for (let q = 0; q < pieces; q++) {
          if (r2() < 0.2) continue; // anneau ouvert par endroits
          const a = (q / pieces) * Math.PI * 2 + r2() * 0.4;
          blob(ctx, x + Math.cos(a) * rad, y + Math.sin(a) * rad * 1.3, rad * (0.26 + r2() * 0.12), r2, size, 0.9, a);
        }
      }
      if (part === 'body') {
        // Petites taches pleines sur le ventre clair.
        ctx.fillStyle = css(sec);
        for (let k = 0; k < 24; k++) blob(ctx, (r2() < 0.5 ? r2() * 0.12 : 0.88 + r2() * 0.12) * size, r2() * size, (2 + r2() * 3) * s, r2, size);
      }
    }
    // Deuxième passe : taches blanches, contre-ombrage, variations, grain, plis de la peau nue.
    const img2 = ctx.getImageData(0, 0, size, size);
    const e = img2.data;
    for (let py = 0; py < size; py++) {
      const v = 1 - (py + 0.5) / size;
      const pole = poleOf(v);
      const bellyWhite = pole > 0 ? whiteMarks(part, 0.001, v, 0, front) : 0;
      for (let px = 0; px < size; px++) {
        const u = (px + 0.5) / size;
        const i = (py * size + px) * 4;
        out[0] = e[i];
        out[1] = e[i + 1];
        out[2] = e[i + 2];
        const n = wrapNoise(u, v, 11, seed + 5 + part.length) - 0.5;
        const wm = whiteMarks(part, u, v, n, front);
        mix(whiteCol, wm + (bellyWhite - wm) * pole);
        if (counter) mul(1.06 - Math.min(u, 1 - u) * 2 * 0.12);
        if (hairless) {
          // Peau : marbrures douces, plis sur le front et le cou, rose aux articulations.
          const wr = part === 'head' ? smooth(vE - 0.04, vE - 0.25, v) * smooth(0.2, 0.05, du(u, 0.5)) * (0.5 + 0.5 * Math.sin(v * 140))
            : part === 'neck' ? (0.5 + 0.5 * Math.sin(v * 50 + Math.sin(u * Math.PI * 2) * 0.5)) * 0.8
              : part === 'body' ? smooth(0.7, 0.95, v) * (0.5 + 0.5 * Math.sin(v * 70 + Math.sin(u * Math.PI * 6))) * 0.7 : 0;
          mul(1 - wr * 0.12);
          mul(1 + (wrapNoise(u, v, 4, seed + 2) - 0.5) * 0.1);
          if (part === 'leg') mix([224, 150, 140], smooth(0.35, 0.6, v) * smooth(0.85, 0.6, v) * 0.15);
        } else {
          const mot = wrapNoise(u, v, 3, seed * 1.7 + 11) - 0.5;
          mul(1 + mot * 0.1 + (rng() - 0.5) * 0.08);
        }
        e[i] = Math.min(255, Math.max(0, out[0]));
        e[i + 1] = Math.min(255, Math.max(0, out[1]));
        e[i + 2] = Math.min(255, Math.max(0, out[2]));
      }
    }
    ctx.putImageData(img2, 0, 0);
    // Poils : petits traits clairs et sombres dans le sens du poil (le long de v).
    if (strokes && !hairless) {
      const curly = traits.hair === 'curly';
      const count = (curly ? 900 : longHair ? 1100 : 1500) * (size / 256) ** 2;
      const len = (curly ? 3 : longHair ? 9 : 5) * (size / 128);
      ctx.lineWidth = Math.max(1, size / 256);
      for (let k = 0; k < count; k++) {
        const x = rng() * size;
        const y = rng() * size;
        const l = len * (0.5 + rng());
        if (part === 'body' && (y < size * 0.09 || y > size * 0.93)) continue;
        ctx.strokeStyle = rng() < 0.5 ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.10)';
        ctx.beginPath();
        if (curly) {
          ctx.arc(x, y, l, rng() * 6, rng() * 6 + 3);
        } else {
          ctx.moveTo(x, y);
          ctx.lineTo(x + (rng() - 0.5) * 1.5, y - l);
        }
        ctx.stroke();
      }
    }
    return toTexture(c);
  };

  const legs = [];
  const frontLeg = paint(SMALL, 'leg', { front: true });
  const hindLeg = white === 'gloves' || white === 'mitted' ? paint(SMALL, 'leg', { front: false }) : frontLeg;
  legs.push(frontLeg, frontLeg, hindLeg, hindLeg);
  return {
    body: paint(BIG, 'body', { counter: true }),
    neck: paint(SMALL, 'neck', { counter: true }),
    head: paint(MID, 'head'),
    tail: paint(SMALL, 'tail'),
    ear: paint(64, 'ear', { strokes: false }),
    legs,
  };
}

// ------------------------------------------------------------------ yeux

const eyeCache = new Map();

/**
 * Œil de chat : l'iris remplit tout l'œil visible (pas de blanc), cerclé de sombre, avec une
 * pupille en amande verticale et deux reflets peints (le regard brille même sans soleil).
 */
export function catEyeTexture(color, pupil = 0.34) {
  const key = `${color}-${pupil}`;
  if (eyeCache.has(key)) return eyeCache.get(key);
  const w = 256;
  const h = 128;
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d');
  const [r, g, b] = rgb(color);
  const css = (f, a = 1) => `rgba(${Math.min(255, r * f) | 0},${Math.min(255, g * f) | 0},${Math.min(255, b * f) | 0},${a})`;
  ctx.fillStyle = css(0.35);
  ctx.fillRect(0, 0, w, h);
  // Le devant de la sphère (+Z) correspond à u = 0,25, v = 0,5.
  const cx = w * 0.25;
  const cy = h * 0.5;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(w * 0.165, h * 0.33);
  const gr = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 1);
  gr.addColorStop(0, css(1.55));
  gr.addColorStop(0.32, css(1.3));
  gr.addColorStop(0.7, css(1));
  gr.addColorStop(0.9, css(0.7));
  gr.addColorStop(1, css(0.32));
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.arc(0, 0, 1, 0, Math.PI * 2);
  ctx.fill();
  // Fibres de l'iris.
  const rnd = mulberry32(color + 17);
  ctx.lineWidth = 0.025;
  for (let i = 0; i < 90; i++) {
    const a = rnd() * Math.PI * 2;
    ctx.strokeStyle = rnd() < 0.5 ? css(1.45, 0.45) : css(0.6, 0.4);
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 0.25, Math.sin(a) * 0.25);
    ctx.lineTo(Math.cos(a + (rnd() - 0.5) * 0.2) * 0.92, Math.sin(a + (rnd() - 0.5) * 0.2) * 0.92);
    ctx.stroke();
  }
  // Pupille : amande verticale, bord légèrement flou.
  ctx.fillStyle = '#060404';
  ctx.beginPath();
  ctx.ellipse(0, 0, pupil, 0.86, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(6,4,4,0.5)';
  ctx.lineWidth = 0.06;
  ctx.stroke();
  // Reflets : un grand en haut, un petit en bas (comme la lumière du ciel sur la cornée).
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.ellipse(-0.3, -0.42, 0.2, 0.15, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.ellipse(0.32, 0.4, 0.09, 0.07, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  const tex = toTexture(c, false);
  tex.userData.shared = true;
  eyeCache.set(key, tex);
  return tex;
}

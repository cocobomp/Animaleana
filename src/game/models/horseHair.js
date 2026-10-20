// Crins du cheval réaliste : texture de crins droits générée en code et matière des cartes de crins
// (crinière, toupet, queue, brosse, fanons ; les cartes elles-mêmes sont faites dans horseReal.js).
//
// La texture du GLB (« Hair12 ») est une fourrure frisée rangée en étoile : sur des rubans, elle donnait des
// plaques de caoutchouc. Ici, une bande de mèches droites : u le long de la mèche (0 racine, 1 pointe), v en
// travers ; quatre mèches différentes l'une au-dessus de l'autre (une par quart de la hauteur), chacune faite
// de crins fins de deux ou trois tons, aux pointes effilées et de longueurs inégales. Canaux (données, pas une
// couleur) : R ton du crin, G décalage du reflet (propre à chaque crin), B pente du crin en travers (relief),
// A couverture. Les niveaux réduits (mipmaps) gardent la même part de pixels opaques que l'image pleine : sans
// cela, la moyenne de l'alpha passe sous le seuil de découpe et les crins fondent au loin.

import * as THREE from 'three';
import { gfx, keepFrameAlpha } from '../gfx.js';

/** Taille de la bande de crins (u le long des crins, v en travers) et nombre de mèches rangées en hauteur. */
export const HAIR_TEX = { w: 512, h: 128, rows: 4, strands: 64 };
/**
 * Bande de la masse des crins (crinière, toupet et queue « en volume ») : sous la bande des cartes, même largeur,
 * 128 px de haut. La texture entière fait 512 × 256 : cartes en haut (v de 0 à HAIR_V), masse en bas. clumps :
 * mèches par bande ; root : u où commencent la queue et le toupet (après les pointes du bord gauche de la crinière).
 */
export const HAIR_MASS = { h: 128, clumps: 9, root: 0.1 };
/** Part de la hauteur de la texture prise par la bande des cartes (v des cartes × HAIR_V). */
export const HAIR_V = HAIR_TEX.h / (HAIR_TEX.h + HAIR_MASS.h);
/** Seuil de découpe des crins (et de couverture des niveaux réduits). */
export const HAIR_CUT = 0.5;
/** Couleur des crins la plus claire (linéaire) : au-delà, le soleil les brûle en blanc uni. */
export const HAIR_TOP = 0.6;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Un crin de la bande, de sa racine (u0) à sa pointe (len), par-dessus ceux d'avant : ton, décalage du reflet,
 * pente en travers, couverture. (Fonction à part : appelée 256 fois, le moteur JavaScript l'optimise vite ;
 * la texture est faite une seule fois, en code froid.)
 */
function drawStrand(rgba, W, y0, y1, cy, o, cconv, conv, cw, len, hw, tone, shift, wf, wp, u0) {
  const ylo = Math.floor(y0);
  const yhi = Math.ceil(y1) - 1;
  for (let x = Math.floor(u0 * W); x < W; x++) {
    const u = (x + 0.5) / W;
    if (u > len) break;
    // (hors de la racine et de la pointe : crin plein, à sa largeur)
    const inner = u >= u0 + 0.015 && u <= len - 0.2;
    const fade = inner ? 1 : (1 - smooth(len - 0.14, len, u)) * smooth(u0, u0 + 0.015, u);
    const wt = inner ? hw : hw * (1 - 0.45 * smooth(len - 0.2, len, u));
    // (la petite mèche se resserre vers la pointe et ondule d'un bloc ; le crin, un peu, pour lui)
    const vc = cy + o * (1 - cconv * conv[x]) + cw[x] + Math.sin(u * 6.28 * wf + wp) * 0.25;
    const ya = Math.max(ylo, Math.floor(vc - wt - 1));
    const yb = Math.min(yhi, Math.ceil(vc + wt + 1));
    const iw = 1 / Math.max(0.6, wt);
    for (let y = ya; y <= yb; y++) {
      const d = Math.abs(y + 0.5 - vc);
      const cov = Math.min(1, Math.max(0, wt + 0.5 - d)) * fade;
      if (cov <= 0) continue;
      const i = (y * W + x) * 4;
      const a0 = rgba[i + 3];
      const a = cov + a0 * (1 - cov);
      const k0 = (a0 * (1 - cov)) / a;
      const k1 = cov / a;
      // (pente en travers : bord du crin tourné d'un côté ou de l'autre, comme un cylindre)
      const slope = Math.max(-1, Math.min(1, (y + 0.5 - vc) * iw));
      rgba[i] = rgba[i] * k0 + tone * k1;
      rgba[i + 1] = rgba[i + 1] * k0 + shift * k1;
      rgba[i + 2] = rgba[i + 2] * k0 + (0.5 + 0.5 * slope) * k1;
      rgba[i + 3] = a;
    }
  }
}

/**
 * Pixels de la bande de crins (flottants 0-1, RGBA), sans hasard d'un appel à l'autre (graine fixe).
 * Chaque rangée (une mèche de carte) est faite de 5 à 7 petites mèches, chacune avec son ton, son décalage de
 * reflet, sa longueur et son ondulation ; ses crins (1 à 2,2 px) s'y resserrent vers la pointe : la mèche
 * s'effile, des jours s'ouvrent entre les petites mèches à partir de mi-longueur. Sur les niveaux réduits
 * (téléphone, de loin), les crins se fondent mais pas les petites mèches : des traînées claires et foncées le
 * long des crins et un reflet cassé, au lieu d'un ruban de satin uni. Chaque crin se couche sur ceux d'avant
 * (« par-dessus ») ; les crins du bord d'une petite mèche sont plus courts, la pointe de chaque crin s'affine et
 * s'efface sur ses 14 derniers %. Les racines (u < 0,06) sont pleines : pas de jour entre les crins et la peau.
 */
export function hairStrandPixels() {
  const { w: W, h: Hh, rows: ROWS, strands: NS } = HAIR_TEX;
  const RH = Hh / ROWS;
  const rgba = new Float32Array(W * Hh * 4);
  const rng = mulberry(9157);
  // (ce qui ne dépend que de la colonne, calculé une fois : la texture est faite d'un coup, en code froid)
  const conv = new Float64Array(W);
  const wave = new Float64Array(W);
  const cw = new Float64Array(W);
  for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W;
    conv[x] = smooth(0.45, 1, u);
    wave[x] = smooth(0.1, 0.5, u);
  }
  for (let k = 0; k < ROWS; k++) {
    const y0 = k * RH + 1; // (1 px vide entre deux mèches : pas de mélange au filtrage)
    const y1 = (k + 1) * RH - 1;
    const yc = (y0 + y1) / 2;
    const half = (y1 - y0) / 2;
    const nc = 5 + Math.floor(rng() * 3);
    const step = (y1 - y0 - 2) / nc;
    for (let c = 0; c < nc; c++) {
      const cy = y0 + 1 + step * (c + 0.5) + (rng() - 0.5) * step * 0.3;
      const chw = step * (0.55 + 0.2 * rng());
      const e = Math.abs(cy - yc) / half; // 0 au milieu de la rangée, 1 au bord
      // (petites mèches de tons et de reflets différents : elles restent lisibles une fois les crins fondus)
      const ctone = 0.6 + 0.4 * rng();
      const cshift = rng();
      const clen = Math.min(1, (0.8 + 0.2 * rng()) * (1 - 0.12 * e * e));
      const cconv = 0.18 + 0.17 * rng();
      const cwf = 0.7 + rng() * 1.5;
      const cwp = rng() * 6.28;
      const cwa = 0.3 + rng() * 0.6;
      // (ondulation de la petite mèche, d'un bloc)
      for (let x = 0; x < W; x++) cw[x] = Math.sin(((x + 0.5) / W) * 6.28 * cwf + cwp) * cwa * wave[x];
      const ns = Math.round(NS / nc);
      for (let s = 0; s < ns; s++) {
        // (crins plus serrés au cœur de la petite mèche)
        const sv = rng() * 2 - 1;
        const o = Math.sign(sv) * Math.abs(sv) ** 1.3 * chw;
        const f = Math.abs(o) / chw;
        const len = Math.min(1, clen * (0.72 + 0.28 * rng()) * (1 - 0.14 * f * f));
        const hw = 0.5 + rng() * 0.6;
        const tone = Math.min(1, ctone * (0.86 + rng() * 0.28));
        const shift = Math.min(1, Math.max(0, cshift + (rng() - 0.5) * 0.24));
        const wf = 1 + rng() * 2;
        const wp = rng() * 6.28;
        const u0 = rng() * 0.05; // (racine : chaque crin sort à sa place, pas de bord droit)
        drawStrand(rgba, W, y0, y1, cy, o, cconv, conv, cw, len, hw, tone, shift, wf, wp, u0);
      }
    }
    // Racines pleines, un peu plus sombres (le dessous de la mèche), qui commencent en dents irrégulières.
    // (décalage du reflet propre à chaque ligne de pixels, comme un crin : avec une valeur unique, toutes les
    // racines s'allumaient ensemble en une plaque grise, en haut de la queue et sur le toupet)
    for (let y = Math.floor(y0); y < Math.ceil(y1); y++) {
      const us = 0.01 + rng() * 0.035;
      const sh = rng();
      for (let x = 0; x < W * 0.08; x++) {
        const i = (y * W + x) * 4;
        const a0 = rgba[i + 3];
        const u = (x + 0.5) / W;
        const r = smooth(us, us + 0.012, u) * (1 - smooth(0.05, 0.08, u));
        if (a0 >= r) continue;
        rgba[i] = (rgba[i] * a0 + 0.62 * (r - a0)) / r;
        rgba[i + 1] = (rgba[i + 1] * a0 + sh * (r - a0)) / r;
        rgba[i + 2] = (rgba[i + 2] * a0 + 0.5 * (r - a0)) / r;
        rgba[i + 3] = r;
      }
    }
  }
  // Pixels vides : couleur neutre (ton moyen, reflet et relief au repos), sinon le filtrage mêle du noir aux bords.
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a >= 0.999) continue;
    rgba[i] = rgba[i] * a + 0.82 * (1 - a);
    rgba[i + 1] = rgba[i + 1] * a + 0.5 * (1 - a);
    rgba[i + 2] = rgba[i + 2] * a + 0.5 * (1 - a);
  }
  return rgba;
}

/**
 * Pixels de la bande de la masse (flottants 0-1, RGBA, 512 × 128), graine fixe. Peinte pour une masse de crins
 * vue en surface : u le long des crins, v en travers (une bande de la masse : quelques rangées de sa grille).
 * Opaque de u = 0,09 à u = 0,78 (le cou ne se voit jamais au travers), faite de HAIR_MASS.clumps mèches de
 * largeurs très inégales (6 à 20 px) qui ondulent d'un bloc et se couchent l'une sur l'autre, de tons bien écartés
 * d'une mèche à l'autre ; chacune à peine bombée en travers (canal B : un bord tourné vers la lumière, l'autre à
 * l'ombre — le relief en qualité haute), un peu plus claire au milieu ; crins fins de tons et de reflets voisins dans
 * chaque mèche, avec deux jours plus sombres çà et là (la mèche se divise). (Avant : sept mèches de même largeur,
 * bombées et creusées toutes pareil — des rayures régulières, un « papier plissé » de près.) Les deux bouts sont
 * faits de pointes : en u < 0,09, le bord gauche de la crinière (crins qui passent par-dessus la crête et retombent
 * à gauche, en dents) ; au-delà de 0,78, chaque mèche finit à sa longueur (0,8 à 1) en s'effilant sur son dernier
 * tiers — le bas de la crinière, le bout de la queue et la pointe du toupet ne sont pas coupés droit. La queue et le
 * toupet commencent après les dents (u ≥ HAIR_MASS.root : leurs racines sont pleines). Périodique en v.
 */
export function hairMassPixels() {
  const W = HAIR_TEX.w;
  const Hh = HAIR_MASS.h;
  const NC = HAIR_MASS.clumps;
  const rgba = new Float32Array(W * Hh * 4);
  const rng = mulberry(7717);
  // Fond : creux sombre, opaque entre les deux rangées de pointes.
  for (let y = 0; y < Hh; y++) {
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      const i = (y * W + x) * 4;
      rgba[i] = 0.45;
      rgba[i + 1] = 0.5;
      rgba[i + 2] = 0.5;
      rgba[i + 3] = smooth(0.06, 0.09, u) * (1 - smooth(0.74, 0.79, u));
    }
  }
  // Mèches : largeurs tirées puis ramenées à la hauteur de la bande (périodique).
  const widths = [];
  for (let c = 0; c < NC; c++) widths.push(0.45 + rng() * 1.1);
  const sumW = widths.reduce((a, b) => a + b, 0);
  let acc = 0;
  const clumps = widths.map((w) => {
    const h = (w / sumW) * Hh;
    const cy = acc + h / 2;
    acc += h;
    return {
      cy, hw: h * 0.62, tone: 0.62 + 0.38 * rng(), shift: rng(), u0: rng() * 0.06, end: 0.8 + 0.2 * rng(),
      wf: 0.8 + rng() * 1.4, wp: rng() * 6.28, wa: 1.5 + rng() * 3, seed: Math.floor(rng() * 1e6),
      // (deux jours plus sombres le long de la mèche, qui la divisent sur une partie de sa longueur)
      splits: [0, 1].map(() => ({ at: rng() * 1.6 - 0.8, u0: 0.1 + rng() * 0.5, u1: 0.55 + rng() * 0.45 })),
    };
  });
  // (dans un ordre mêlé : une mèche se couche sur la précédente, pas de motif régulier)
  const order = clumps.map((_, k) => k).sort((a, b) => (clumps[a].seed % 7) - (clumps[b].seed % 7) || a - b);
  const hash = (n) => {
    let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  };
  for (const k of order) {
    const C = clumps[k];
    for (let x = 0; x < W; x++) {
      const u = (x + 0.5) / W;
      if (u > C.end) break;
      if (u < C.u0) continue;
      // (la mèche s'effile sur son dernier tiers, et s'efface au bout ; au bord gauche, elle commence en pointe)
      const tip = smooth(C.end - 0.3, C.end, u);
      const head = smooth(C.u0, C.u0 + 0.05, u);
      const wt = C.hw * (1 - 0.85 * tip) * (0.2 + 0.8 * head);
      const fade = (1 - smooth(C.end - 0.04, C.end, u)) * smooth(C.u0, C.u0 + 0.008, u);
      const vc = C.cy + Math.sin(u * 6.28 * C.wf + C.wp) * C.wa * smooth(0.04, 0.4, u);
      const sp = C.splits.map((q) => smooth(q.u0, q.u0 + 0.08, u) * (1 - smooth(q.u1 - 0.08, q.u1, u)));
      for (let o = -1; o <= 1; o++) {
        const c0 = vc + o * Hh;
        const ya = Math.max(0, Math.floor(c0 - wt - 1));
        const yb = Math.min(Hh - 1, Math.ceil(c0 + wt + 1));
        for (let y = ya; y <= yb; y++) {
          const dy = y + 0.5 - c0;
          const cov = Math.min(1, Math.max(0, wt + 0.5 - Math.abs(dy))) * fade;
          if (cov <= 0) continue;
          const e = Math.max(-1, Math.min(1, dy / Math.max(0.8, wt)));
          // crins de la mèche : un ton et un reflet par crin (1,6 px), le long de la mèche
          const sIdx = Math.floor((dy + 64) / 1.6);
          const hs = hash(C.seed + sIdx * 131);
          // (jours : creux étroits aux places tirées, sur une partie de la longueur)
          let gap = 1;
          C.splits.forEach((q, j) => {
            gap *= 1 - 0.4 * sp[j] * Math.max(0, 1 - Math.abs(e - q.at) * 7);
          });
          const tone = Math.min(1, C.tone * (0.8 + 0.2 * Math.cos(e * 1.3)) * (0.84 + 0.3 * hs) * gap);
          const shift = Math.min(1, Math.max(0, C.shift + (hash(C.seed + sIdx * 977) - 0.5) * 0.35));
          const i = (y * W + x) * 4;
          const a0 = rgba[i + 3];
          const a = cov + a0 * (1 - cov);
          const k0 = (a0 * (1 - cov)) / a;
          const k1 = cov / a;
          rgba[i] = rgba[i] * k0 + tone * k1;
          rgba[i + 1] = rgba[i + 1] * k0 + shift * k1;
          // (à peine bombée en travers : B de 0,2 à 0,8 d'un bord à l'autre, du relief crin par crin)
          rgba[i + 2] = rgba[i + 2] * k0 + Math.max(0, Math.min(1, 0.5 + 0.3 * e + (hs - 0.5) * 0.22)) * k1;
          rgba[i + 3] = a;
        }
      }
    }
  }
  // Pixels vides : couleur neutre (pas de noir mêlé aux bords au filtrage).
  for (let i = 0; i < rgba.length; i += 4) {
    const a = rgba[i + 3];
    if (a >= 0.999) continue;
    rgba[i] = rgba[i] * a + 0.82 * (1 - a);
    rgba[i + 1] = rgba[i + 1] * a + 0.5 * (1 - a);
    rgba[i + 2] = rgba[i + 2] * a + 0.5 * (1 - a);
  }
  return rgba;
}

/** Part des pixels dont l'alpha (× k) atteint le seuil. */
function coverage(rgba, k = 1, cut = HAIR_CUT) {
  let n = 0;
  for (let i = 3; i < rgba.length; i += 4) if (rgba[i] * k >= cut) n++;
  return n / (rgba.length / 4);
}

/**
 * Niveaux réduits (mipmaps) de la bande de crins jusqu'à 1 × 1 : moyenne 2 × 2 (couleur pondérée par l'alpha),
 * puis l'alpha est multiplié par le facteur qui redonne la même part de pixels au-dessus du seuil qu'au niveau
 * plein (recherche par dichotomie). Renvoie [{ data: Float32Array, width, height, coverage }].
 */
export function hairMipLevels(rgba, W = HAIR_TEX.w, H = HAIR_TEX.h) {
  const levels = [{ data: rgba, width: W, height: H, coverage: coverage(rgba) }];
  const c0 = levels[0].coverage;
  let src = rgba;
  let w = W;
  let h = H;
  while (w > 1 || h > 1) {
    const nw = Math.max(1, w >> 1);
    const nh = Math.max(1, h >> 1);
    const out = new Float32Array(nw * nh * 4);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let n = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const sx = Math.min(w - 1, x * 2 + dx);
            const sy = Math.min(h - 1, y * 2 + dy);
            const i = (sy * w + sx) * 4;
            const sa = src[i + 3] + 1e-4;
            r += src[i] * sa;
            g += src[i + 1] * sa;
            b += src[i + 2] * sa;
            a += sa;
            n++;
          }
        }
        const o = (y * nw + x) * 4;
        out[o] = r / a;
        out[o + 1] = g / a;
        out[o + 2] = b / a;
        out[o + 3] = Math.max(0, a / n - 1e-4);
      }
    }
    // (dichotomie sur le facteur d'alpha : même couverture qu'au niveau plein)
    let lo = 1;
    let hi = 4;
    for (let it = 0; it < 14; it++) {
      const mid = (lo + hi) / 2;
      if (coverage(out, mid) < c0) lo = mid;
      else hi = mid;
    }
    const k = (lo + hi) / 2;
    for (let i = 3; i < out.length; i += 4) out[i] = Math.min(1, out[i] * k);
    levels.push({ data: out, width: nw, height: nh, coverage: coverage(out) });
    src = out;
    w = nw;
    h = nh;
  }
  return levels;
}

let hairTex = null;

/** Texture de crins droits (partagée par tous les chevaux, jamais libérée avec l'un d'eux). */
export function hairTexture() {
  if (hairTex) return hairTex;
  // (deux bandes réduites chacune de son côté — les pointes des cartes ne se mêlent pas à la masse au loin —,
  // puis l'une sur l'autre ; les deux derniers niveaux, plus bas qu'une bande, sont des moyennes)
  const cardL = hairMipLevels(hairStrandPixels());
  const massL = hairMipLevels(hairMassPixels(), HAIR_TEX.w, HAIR_MASS.h);
  const levels = [];
  for (let k = 0; k < cardL.length; k++) {
    const a = cardL[k];
    const b = massL[k];
    if (a.height + b.height === (HAIR_TEX.h + HAIR_MASS.h) >> k && a.width === b.width) {
      const data = new Float32Array(a.data.length + b.data.length);
      data.set(a.data);
      data.set(b.data, a.data.length);
      levels.push({ data, width: a.width, height: a.height + b.height });
    } else {
      const prev = levels[levels.length - 1];
      if (prev.width === 1 && prev.height === 1) break;
      const nw = Math.max(1, prev.width >> 1);
      const nh = Math.max(1, prev.height >> 1);
      const data = new Float32Array(nw * nh * 4);
      for (let y = 0; y < nh; y++) {
        for (let x = 0; x < nw; x++) {
          for (let c = 0; c < 4; c++) {
            let sum = 0;
            for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
              sum += prev.data[(Math.min(prev.height - 1, y * 2 + dy) * prev.width + Math.min(prev.width - 1, x * 2 + dx)) * 4 + c];
            }
            data[(y * nw + x) * 4 + c] = sum / 4;
          }
        }
      }
      levels.push({ data, width: nw, height: nh });
    }
  }
  const bytes = levels.map((l) => {
    // (tableau « bridé » : arrondi et borné à 0-255 par l'affectation)
    const d = new Uint8ClampedArray(l.data.length);
    for (let i = 0; i < d.length; i++) d[i] = l.data[i] * 255;
    return { data: new Uint8Array(d.buffer), width: l.width, height: l.height };
  });
  const tex = new THREE.DataTexture(bytes[0].data, bytes[0].width, bytes[0].height, THREE.RGBAFormat);
  tex.mipmaps = bytes;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.NoColorSpace; // (données : ton, reflet, relief, couverture)
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = gfx.quality === 'high' ? 4 : 1;
  tex.needsUpdate = true;
  tex.userData.shared = true;
  hairTex = tex;
  return tex;
}

/**
 * Reflet des crins (modèle de Kajiya-Kay) : le long d'une mèche, la lumière fait une bande claire en
 * travers, là où la direction du crin est perpendiculaire à la bissectrice lumière-regard ; décalée crin par
 * crin (canal G de la texture), elle se casse en mèches au lieu d'un aplat. Ajouté à chaque lumière directe
 * (ombre du soleil comprise) : RE_Direct de three.js est remplacé par RE_Direct_Hair, qui appelle l'éclairage
 * habituel puis ajoute le reflet. Qualité haute (HAIR_HQ) : second reflet plus large teinté par les crins et
 * relief du crin en travers (canal B). En contre-jour, la lumière traverse les mèches (pointes surtout).
 */
const HAIR_LIGHT = /* glsl */ `
vec3 hHairT;
float hHairShift;
void RE_Direct_Hair( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  vec3 L = directLight.direction;
  // (diffus un peu « enveloppant » : la lumière passe entre les crins ; pas de reflet GGX, qui faisait de la
  // crinière noire une plaque grise satinée — le reflet des crins est la bande de Kajiya-Kay)
  float wrapNL = saturate( ( dot( geometryNormal, L ) + 0.3 ) / 1.3 );
  reflectedLight.directDiffuse += wrapNL * directLight.color * BRDF_Lambert( material.diffuseColor );
  vec3 H = normalize( L + geometryViewDir );
  float lit = smoothstep( -0.25, 0.35, dot( geometryNormal, L ) );
  // (décalage étalé crin par crin et bande étroite : sur des crins parallèles (toupet couché, queue), un crin
  // sur cinq environ s'allume à la fois, pas toute la mèche)
  vec3 T1 = normalize( hHairT + geometryNormal * ( hHairShift * 0.9 - 0.05 ) );
  float t1 = dot( T1, H );
  // (racines plus mates : elles sont sous les autres crins ; un toupet couché, crins tous parallèles, ne
  // s'allume plus d'un bloc en gris)
  vec3 spec = vec3( pow( max( 0.0, 1.0 - t1 * t1 ), 96.0 ) * hHairSpec * ( 0.35 + 0.65 * smoothstep( 0.0, 0.3, vHairF ) ) );
#ifdef HAIR_HQ
  vec3 T2 = normalize( hHairT + geometryNormal * ( hHairShift * 0.5 + 0.15 ) );
  float t2 = dot( T2, H );
  spec += material.diffuseColor * pow( max( 0.0, 1.0 - t2 * t2 ), 8.0 ) * hHairSpec * 2.2;
#endif
  // (masse : grandes surfaces lisses, le reflet y faisait des bandes de satin gris — plus discret)
  reflectedLight.directSpecular += directLight.color * spec * lit * ( 1.0 - 0.65 * hHairFore() ) * ( 1.0 - 0.35 * vHairM );
  float back = pow( saturate( dot( geometryViewDir, - L ) ), 5.0 );
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * back * ( 0.2 + 0.7 * vHairF ) * hHairBack;
}
#undef RE_Direct
#define RE_Direct RE_Direct_Hair
`;

/**
 * Couleur de crins (linéaire) pour la matière ou les sommets d'une carte : crins presque noirs à peine éclaircis
 * (le reflet suffit à faire lire les mèches) ; ton moyen de la texture (≈ 0,85) compensé pour les crins foncés ;
 * crins clairs (lavés, crème, gris) plafonnés à HAIR_TOP, sinon le soleil les brûle en blanc uni.
 */
export function hairColor(hex) {
  const c = hex?.isColor ? hex.clone() : new THREE.Color(hex);
  const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  if (l < 0.03) c.lerp(new THREE.Color(0x4a4442), 0.12);
  c.multiplyScalar(1.15 - 0.3 * smooth(0.15, 0.5, l));
  const top = Math.max(c.r, c.g, c.b);
  if (top > HAIR_TOP) c.multiplyScalar(HAIR_TOP / top);
  return c;
}

/**
 * Matière des cartes de crins (une par cheval : sa couleur ; un seul programme pour tous). color : couleur des
 * crins (cartes partagées par la race, ton gris par sommet), ou null pour des cartes colorées par sommet
 * (brosse bicolore du Fjord, fanons de la couleur du bas de chaque membre). sway : uniform de l'ondulation
 * (vitesse du cheval, coup de queue). Normales « de volume » (vers l'extérieur de la crinière, de la queue),
 * pas retournées au dos d'un ruban ; ondulation des pointes au vent, vers l'extérieur (jamais dans le cou).
 */
/** Crins sans courbure (cartes sans ressorts : vignettes, autres modèles). */
const NO_DRAG = { tail: { value: new THREE.Vector3() }, mane: { value: new THREE.Vector3() }, up: { value: new THREE.Vector3(0, 1, 0) } };

export function hairMaterial(color, sway, drag = NO_DRAG) {
  const high = gfx.quality === 'high';
  // (cartes colorées par sommet : couleurs déjà plafonnées par hairColor ; la matière ne fait que compenser le
  // ton moyen de la texture)
  const c = color === null ? new THREE.Color(1, 1, 1) : hairColor(color);
  const l = color === null ? 0.5 : 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  const a2c = gfx.msaa || high;
  const m = new THREE.MeshStandardMaterial({
    color: c, map: hairTexture(), alphaTest: HAIR_CUT, side: THREE.DoubleSide, roughness: 0.75, metalness: 0,
    alphaToCoverage: a2c, vertexColors: true,
  });
  // (sinon, au bord des crins, le fond de la page passait au travers en points clairs le long de chaque mèche)
  if (a2c) keepFrameAlpha(m);
  // (force du reflet : plus discret sur les crins clairs, qui ont déjà de la lumière)
  // (qualité basse : pas d'ombre du soleil, le reflet brillerait aussi du côté à l'ombre : plus discret)
  // (0,06 × soleil de 2,8 à 3,5, sur un crin sur cinq : des crins qui brillent sur du noir, pas un aplat gris)
  // (qualité basse : plus discret encore sur les crins foncés, qui restent noirs au lieu de griser)
  const spec = { value: (high ? 0.06 : 0.032) * (1 - 0.5 * Math.min(1, l * 2)) };
  // (crins foncés : les crins clairs de la texture un peu éclaircis, comme la lumière du ciel prise par chaque
  // crin — on lit les mèches même sans reflet, en qualité basse aussi)
  const lift = { value: (high ? 0.05 : 0.025) * (1 - smooth(0, 0.12, l)) };
  // (crins clairs : pas de lumière qui traverse les pointes en contre-jour — des « glaçons » translucides sur
  // une crinière blanche — et racines un peu plus sombres, sous les autres crins)
  const light = smooth(0.12, 0.4, l);
  const back = { value: 1 - 0.85 * light };
  // (crins clairs : creux entre les mèches et tons des crins moins écartés — sur une crinière grise ou blanche,
  // les creux sombres de la texture se lisaient en rainures et en dents)
  const contrast = { value: 1 - 0.55 * light };
  // (la masse, grandes surfaces : moins encore — sur une crinière claire, ses mèches de tons écartés faisaient des
  // plaques grises)
  const contrastM = { value: 1 - 0.75 * light };
  // (reflet du ciel : sur des normales « de volume », les 4 % d'un diélectrique faisaient de la crinière noire un
  // aplat gris satiné ; moins encore sur les crins foncés — le reflet des crins, c'est la bande de Kajiya-Kay)
  const sky = { value: 0.18 + 0.12 * light };
  const rootDark = { value: 0.06 + 0.16 * light };
  // (toupet rentré sous un bonnet ou un masque : ses mèches se replient vers leur racine, entre les oreilles)
  const tuck = { value: 0 };
  // (crinière tressée pour le concours de beauté : ses mèches rentrent dans les boutons de la crête, Beauty.js)
  const braid = { value: 0 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.hairBraid = braid;
    sh.uniforms.hairTuck = tuck;
    sh.uniforms.hHairBack = back;
    sh.uniforms.hHairRoot = rootDark;
    sh.uniforms.hHairContrast = contrast;
    sh.uniforms.hHairContrastM = contrastM;
    sh.uniforms.hHairSky = sky;
    sh.uniforms.hairTime = gfx.time;
    sh.uniforms.hairWind = gfx.wind;
    sh.uniforms.hairSway = sway;
    sh.uniforms.hairDragT = drag.tail;
    sh.uniforms.hairDragM = drag.mane;
    sh.uniforms.hairUpT = drag.up;
    sh.uniforms.hHairSpec = spec;
    sh.uniforms.hHairLift = lift;
    const def = high ? '#define HAIR_HQ\n' : '';
    sh.vertexShader = def + sh.vertexShader
      .replace('#include <common>', `#include <common>
attribute float hairG;
attribute vec3 hairT;
attribute vec4 hairRoot;
uniform float hairTime;
uniform float hairWind;
uniform float hairSway;
uniform float hairBraid;
uniform float hairTuck;
uniform vec3 hairDragT;
uniform vec3 hairDragM;
uniform vec3 hairUpT;
varying vec3 vHairT;
varying float vHairF;
varying float vHairK;
varying float vHairM;
varying float vHairS;`)
      .replace('#include <skinnormal_vertex>', `#include <skinnormal_vertex>
{
  vec3 hT = hairT;
#ifdef USE_SKINNING
  hT = ( skinMatrix * vec4( hT, 0.0 ) ).xyz;
#endif
  vHairT = normalize( mat3( modelViewMatrix ) * hT );
  vHairF = hairG;
  // (sorte de la mèche ; + 8 pour la masse : crinière, toupet ou queue « en volume »)
  vHairK = mod( hairRoot.w, 8.0 );
  vHairM = step( 7.5, hairRoot.w );
  // (tirage propre à chaque carte, d'après sa racine : décalage de son reflet)
  vHairS = fract( sin( dot( hairRoot.xyz, vec3( 12.9898, 78.233, 37.719 ) ) ) * 43758.5453 );
}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
float hK = mod( hairRoot.w, 8.0 );
float hM = step( 7.5, hairRoot.w );
// (crinière et crête de la crinière : sortes 0 et 4 ; la masse de la crinière rentre toute dans les boutons)
if ( hK < 0.5 || hK > 3.5 ) transformed = mix( transformed, hairRoot.xyz + ( transformed - hairRoot.xyz ) * 0.12 * ( 1.0 - hM ), hairBraid );
// (toupet : sorte 1, rentré sous un bonnet anti-mouches ou un masque, sa masse aussi)
if ( hK > 0.5 && hK < 1.5 ) transformed = mix( transformed, hairRoot.xyz + ( transformed - hairRoot.xyz ) * 0.05, hairTuck );
{
  // Pointes qui ondulent au vent et quand le cheval court (racines immobiles) : une mèche bouge d'un bloc
  // (phase de sa racine), vers l'extérieur et d'avant en arrière ; la queue (hairRoot.w = 2) de côté aussi.
  // (la masse bouge à peine : les cartes posées dessus ondulent vers l'extérieur, jamais dedans)
  float hw = hairG * hairG * ( 0.4 + hairWind * 0.45 + hairSway ) * ( 1.0 - 0.75 * hM );
  float ph = hairTime * 2.1 + hairRoot.y * 6.0 + hairRoot.z * 4.0 - hairG * 1.6;
  transformed += normal * ( 0.5 + 0.5 * sin( ph ) ) * 0.012 * hw;
  transformed.z += cos( ph * 0.7 + 1.3 ) * 0.008 * hw;
  transformed.x += sin( ph ) * 0.012 * hw * step( 1.5, hK ) * step( hK, 3.5 );
  // (au trot et au galop, crinière et queue flottent à la cadence de la foulée : une onde de la racine vers la pointe,
  // décalée d'une mèche à l'autre, toujours vers l'extérieur ; la masse moins que les cartes posées dessus)
  float fl = hairG * hairG * max( 0.0, hairSway - 0.6 ) * ( step( hK, 0.5 ) + step( 1.5, hK ) * step( hK, 2.5 ) ) * ( 1.0 - 0.6 * hM );
  float ph2 = hairTime * 8.5 + hairRoot.z * 9.0 + hairRoot.x * 5.0 - hairG * 3.0;
  transformed += normal * ( 0.5 + 0.5 * sin( ph2 ) ) * 0.012 * fl;
}
{
  // Courbure des mèches (horseReal.js, hairSprings) : queue (sorte 2) et crinière (0) traînées par la vitesse,
  // pointes de la queue en retard quand elle fouette. Écart en travers de la mèche (sa longueur ne change
  // presque pas), croissant de la racine à la pointe (hairG × distance à la racine : une courbe, pas un pli).
  // Jamais vers le bas (la queue ne traverse pas le sol) : hairUpT, le haut dans le repère de repos de la queue.
  bool tl = hK > 1.5 && hK < 2.5;
  vec3 dd = tl ? hairDragT : ( hK < 0.5 ? hairDragM * ( 1.0 - hairBraid ) : vec3( 0.0 ) );
  vec3 tt = hairT / max( length( hairT ), 1e-4 );
  vec3 dp = dd - tt * dot( dd, tt );
  vec3 up = tl ? hairUpT : vec3( 0.0, 1.0, 0.0 );
  dp -= up * min( 0.0, dot( dp, up ) );
  transformed += dp * hairG * length( transformed - hairRoot.xyz );
}`);
    sh.fragmentShader = def + sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform float hHairSpec;
uniform float hHairLift;
uniform float hHairBack;
uniform float hHairRoot;
uniform float hHairContrast;
uniform float hHairContrastM;
uniform float hHairSky;
varying vec3 vHairT;
varying float vHairF;
varying float vHairK;
varying float vHairM;
varying float vHairS;
// (toupet, sorte 1 : couché sur le front, face au ciel et au regard, ses crins tous parallèles s'allumaient en
// traits gris — reflet et éclaircissement des crins foncés réduits, il reste noir sur un cheval aux crins noirs)
float hHairFore() { return step( 0.5, vHairK ) * step( vHairK, 1.5 ); }`)
      .replace('#include <lights_physical_pars_fragment>', `#include <lights_physical_pars_fragment>
${HAIR_LIGHT}`)
      // (reflet du ciel atténué : sur des normales « de volume » toutes tournées du même côté, les 4 % de
      // reflet d'un diélectrique faisaient de la crinière noire un aplat gris ; le reflet des crins, c'est
      // la bande de Kajiya-Kay)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
reflectedLight.indirectSpecular *= hHairSky;`)
      .replace('#include <map_fragment>', `
vec4 hTex = texture2D( map, vMapUv );
hTex.r = mix( 0.82, hTex.r, mix( hHairContrast, hHairContrastM, vHairM ) );
diffuseColor.rgb = diffuseColor.rgb * hTex.r + hHairLift * ( 1.0 - 0.6 * hHairFore() ) * max( 0.0, hTex.r - 0.62 );
// (masse : seulement au ras de la peau, le dessus du rouleau prend la lumière)
diffuseColor.rgb *= 1.0 - hHairRoot * ( 1.0 - smoothstep( 0.0, mix( 0.35, 0.06, vHairM ), vHairF ) );
diffuseColor.a *= hTex.a;`)
      .replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
normal = normalize( vNormal );
hHairT = normalize( vHairT - normal * dot( vHairT, normal ) );
// (cartes : reflet décalé carte par carte — chaque mèche a sa bande claire à sa hauteur, on lit des mèches et non des
// lamelles alignées ; la masse garde le décalage de sa texture, crin par crin)
hHairShift = hTex.g - 0.5 + ( vHairS - 0.5 ) * 0.55 * ( 1.0 - vHairM );
#ifdef HAIR_HQ
// (relief du crin en travers : un bord tourné vers la lumière, l'autre à l'ombre)
normal = normalize( normal + cross( normal, hHairT ) * ( hTex.b - 0.5 ) * 0.7 );
#else
// (qualité basse : relief des mèches de la masse seulement — elle se lit en mèches bombées, pas en aplat)
normal = normalize( normal + cross( normal, hHairT ) * ( hTex.b - 0.5 ) * 0.45 * vHairM );
#endif`);
  };
  m.customProgramCacheKey = () => `horsehair${high ? 'h' : 'l'}`;
  m.userData.hairSpec = spec;
  m.userData.hairBraid = braid;
  m.userData.hairTuck = tuck;
  return m;
}

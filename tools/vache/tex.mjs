// Textures propres de la robe (vache de Lyndon Daniels, taureau Rocketbox) : node tex.mjs <brut.glb> <couleur.png>
// <masque.png> --kind cow|bull [--size 1024] [--mask 512] [--eyeuv u,v,u,v] [--eye 0.04] [--debug <dossier>]
// [--islands]
//
// La photo de la robe du GLB (pie rouge pour la vache, brun uni pour le taureau) ne sert plus telle quelle : recolorée
// pour une autre race, elle laissait voir les contours de ses taches (« taches fantômes ») et ses zones grises (ombres
// de la photo sur le poil blanc). Ce script en tire :
// - une carte de couleur « grain » : chaque texel de poil, de peau, de corne ou d'onglon ne garde que son grain, rapporté
//   à la luminance moyenne locale de SA classe (poil foncé, poil clair, peau rose, corne, onglon, mamelle), dans son îlot
//   d'UV — ni les taches ni les ombres larges ne restent ; au bord d'une ancienne tache (texels mêlés), le grain est
//   repris du voisinage (bande lissée, un peu de bruit) ; gris neutre = 0,5 (linéaire) ; la bouche (langue, dents,
//   gencives), les cils et les yeux peints du taureau gardent leurs couleurs ; l'alpha (cils) est gardé ;
// - un masque (rangé dans l'emplacement « occlusion » du GLB, lu par le jeu comme masque, jamais comme occlusion) :
//   R = champ des taches de la photo (0,5 au bord d'une tache : un seuil plus haut ou plus bas donne moins ou plus de
//   couleur, bord net gardé), G = peau rose (mufle, intérieur des oreilles), B = couleurs gardées (bouche, cils, yeux).
// Les régions (tête, oreilles, cornes, mamelle, queue, bas des pattes, onglons) viennent des os qui portent chaque
// sommet, rastérisés dans l'espace des UV ; les classes de poil viennent de la couleur de la photo.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [inp, outColor, outMask, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i++) {
  if (!rest[i].startsWith('--')) continue;
  const k = rest[i].slice(2);
  opt[k] = rest[i + 1] && !rest[i + 1].startsWith('--') ? rest[++i] : true;
}
const KIND = opt.kind ?? 'cow';
const W = Number(opt.size ?? 1024);
const MW = Number(opt.mask ?? 512);
const DEBUG = opt.debug ?? null;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
const root = doc.getRoot();

// ------------------------------------------------------------------ maillage de la robe
const node = root.listNodes().find((n) => n.getMesh() && n.getSkin());
const prim = node.getMesh().listPrimitives().find((p) => p.getMaterial()?.getName() === 'cow_coat') ?? node.getMesh().listPrimitives()[0];
const mat = prim.getMaterial();
const tex = mat.getBaseColorTexture();
const joints = node.getSkin().listJoints().map((j) => j.getName());
const P = prim.getAttribute('POSITION');
const UV = prim.getAttribute('TEXCOORD_0');
const J = prim.getAttribute('JOINTS_0');
const WT = prim.getAttribute('WEIGHTS_0');
const IDX = prim.getIndices().getArray();
const nv = P.getCount();
const wm = node.getWorldMatrix();
const pos = new Float32Array(nv * 3);
const uv = new Float32Array(nv * 2);
const e = [];
for (let i = 0; i < nv; i++) {
  P.getElement(i, e);
  const [x, y, z] = e;
  pos[i * 3] = wm[0] * x + wm[4] * y + wm[8] * z + wm[12];
  pos[i * 3 + 1] = wm[1] * x + wm[5] * y + wm[9] * z + wm[13];
  pos[i * 3 + 2] = wm[2] * x + wm[6] * y + wm[10] * z + wm[14];
  UV.getElement(i, e);
  uv[i * 2] = e[0];
  uv[i * 2 + 1] = e[1];
}
// Parties : 0 rien, 1 corps, 2 tête, 3 mâchoire, 4 oreille, 5 corne, 6 mamelle (scrotum), 7 queue, 8 bas des pattes,
// 9 onglon, 10 œil (os des yeux : yeux peints du taureau).
const PART_NAMES = ['vide', 'corps', 'tête', 'mâchoire', 'oreille', 'corne', 'mamelle', 'queue', 'patte', 'onglon', 'œil'];
const groupOf = (n) => (/^horn/.test(n) ? 5 : /^(udder|scrotum)/.test(n) ? 6 : /^ear/.test(n) ? 4 : /^eye/.test(n) ? 10 : n === 'jaw' ? 3
  : n === 'head' ? 2 : /^tail/.test(n) ? 7 : /^(radius|metacarpus|toes|tibia|metatarsus|htoes)/.test(n) ? 8 : 1);
const NG = 11;
const vw = new Float32Array(nv * NG); // poids par partie
let ymin = Infinity;
for (let i = 0; i < nv; i++) ymin = Math.min(ymin, pos[i * 3 + 1]);
const HOOF_Y = Number(opt.hoof ?? (KIND === 'bull' ? 0.085 : 0.08));
for (let i = 0; i < nv; i++) {
  J.getElement(i, e);
  const jj = e.slice();
  WT.getElement(i, e);
  let toes = 0;
  for (let k = 0; k < 4; k++) {
    if (!(e[k] > 0)) continue;
    const nm = joints[jj[k]];
    vw[i * NG + groupOf(nm)] += e[k];
    if (/^(toes|htoes)/.test(nm)) toes += e[k];
  }
  // (onglons : le bas du pied)
  if (toes > 0.3 && pos[i * 3 + 1] - ymin < HOOF_Y) {
    vw[i * NG + 9] += vw[i * NG + 8];
    vw[i * NG + 8] = 0;
  }
}

// ------------------------------------------------------------------ îlots d'UV (triangles qui partagent un sommet)
const nt = IDX.length / 3;
const par = Int32Array.from({ length: nv }, (_, i) => i);
const find = (a) => {
  while (par[a] !== a) a = par[a] = par[par[a]];
  return a;
};
for (let t = 0; t < nt; t++) {
  const a = find(IDX[t * 3]);
  const b = find(IDX[t * 3 + 1]);
  const c = find(IDX[t * 3 + 2]);
  par[b] = a;
  par[find(c)] = a;
}
const islandOfRoot = new Map();
const triIsland = new Int32Array(nt);
for (let t = 0; t < nt; t++) {
  const r = find(IDX[t * 3]);
  if (!islandOfRoot.has(r)) islandOfRoot.set(r, islandOfRoot.size);
  triIsland[t] = islandOfRoot.get(r);
}
const NI = islandOfRoot.size;

// ------------------------------------------------------------------ rastérisation dans les UV
const N = W * W;
const isl = new Int32Array(N).fill(-1);
const part = new Uint8Array(N);
const p3 = new Float32Array(N * 3);
const iStat = Array.from({ length: NI }, () => ({ px: 0, parts: new Float64Array(NG), c: [0, 0, 0], tris: 0 }));
for (let t = 0; t < nt; t++) {
  const ia = IDX[t * 3];
  const ib = IDX[t * 3 + 1];
  const ic = IDX[t * 3 + 2];
  const ax = uv[ia * 2] * W - 0.5;
  const ay = uv[ia * 2 + 1] * W - 0.5;
  const bx = uv[ib * 2] * W - 0.5;
  const by = uv[ib * 2 + 1] * W - 0.5;
  const cx = uv[ic * 2] * W - 0.5;
  const cy = uv[ic * 2 + 1] * W - 0.5;
  const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
  const I = triIsland[t];
  iStat[I].tris++;
  if (Math.abs(den) < 1e-12) continue;
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
  const x1 = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
  const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
  const y1 = Math.min(W - 1, Math.ceil(Math.max(ay, by, cy)));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const l1 = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / den;
      const l2 = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / den;
      const l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      const o = y * W + x;
      isl[o] = I;
      let best = 1;
      let bw = -1;
      for (let g = 1; g < NG; g++) {
        const w = vw[ia * NG + g] * l1 + vw[ib * NG + g] * l2 + vw[ic * NG + g] * l3;
        if (w > bw) {
          bw = w;
          best = g;
        }
      }
      part[o] = best;
      for (let k = 0; k < 3; k++) p3[o * 3 + k] = pos[ia * 3 + k] * l1 + pos[ib * 3 + k] * l2 + pos[ic * 3 + k] * l3;
    }
  }
}
for (let o = 0; o < N; o++) {
  const I = isl[o];
  if (I < 0) continue;
  const s = iStat[I];
  s.px++;
  s.parts[part[o]]++;
  for (let k = 0; k < 3; k++) s.c[k] += p3[o * 3 + k];
}
for (const s of iStat) if (s.px) s.c = s.c.map((x) => x / s.px);

// ------------------------------------------------------------------ couleurs de la photo
const img = tex.getImage();
const raw = await sharp(Buffer.from(img)).ensureAlpha().resize(W, W, { kernel: 'lanczos3' }).raw().toBuffer();
const lin = (v) => {
  const x = v / 255;
  return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
};
const LUT = Float32Array.from({ length: 256 }, (_, i) => lin(i));
const lum = new Float32Array(N);
const hsv = new Float32Array(N * 3);
for (let o = 0; o < N; o++) {
  const r = raw[o * 4];
  const g = raw[o * 4 + 1];
  const b = raw[o * 4 + 2];
  lum[o] = 0.2126 * LUT[r] + 0.7152 * LUT[g] + 0.0722 * LUT[b];
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  const d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  hsv[o * 3] = h;
  hsv[o * 3 + 1] = mx ? d / mx : 0;
  hsv[o * 3 + 2] = mx / 255;
}

// ------------------------------------------------------------------ îlots à garder (bouche) : liste et règles
// Bouche : îlots portés par la tête ou la mâchoire, petits, sous les yeux, à l'intérieur du museau (langue, palais, dents,
// gencives). Règle mesurée sur chaque modèle (voir --islands) : toute la mâchoire « intérieure » est dans ces îlots.
const headIsl = iStat.map((s, I) => ({ I, ...s, head: (s.parts[2] + s.parts[3]) / Math.max(1, s.px), jaw: s.parts[3] / Math.max(1, s.px) }));
if (opt.islands) {
  for (const s of headIsl.filter((x) => x.px > 0).sort((a, b) => b.px - a.px)) {
    const dom = PART_NAMES[s.parts.indexOf(Math.max(...s.parts))];
    console.log(`îlot ${s.I} : ${s.px} px, ${s.tris} tri, ${dom}, tête ${(s.head * 100).toFixed(0)} %, mâchoire ${(s.jaw * 100).toFixed(0)} %, centre ${s.c.map((x) => x.toFixed(3)).join(' ')}`);
  }
}
// (îlot principal : la peau du corps, de la tête et des pattes d'un seul tenant ; les autres îlots de la tête : bouche de
// la vache — langue, palais, dents, orbites —, plaque du mufle du taureau ; bouchons des cornes du taureau)
const mainI = headIsl.reduce((a, b) => (b.px > a.px ? b : a)).I;
const MOUTH = new Set((opt.mouth ?? '').split(',').filter(Boolean).map(Number));
const SKIN_ISL = new Set();
for (const s of headIsl) {
  if (s.I === mainI || !s.px || s.head < 0.9) continue;
  // (vache : langue, palais, dents, orbites ; taureau : la bouche ouverte peinte — lèvres, dents —, pas les petits
  // bouchons des cornes)
  if (KIND === 'cow' || s.px > 400) MOUTH.add(s.I);
}
const keepIsl = new Uint8Array(NI);
for (const I of MOUTH) keepIsl[I] = 1;
// Yeux peints dans la robe (taureau) : texels à moins de EYE_R de l'os d'un œil (position de liaison).
const EYE_R = Number(opt.eye ?? 0.04);
const eyes = [];
{
  const skin = node.getSkin();
  const ibm = skin.getInverseBindMatrices();
  skin.listJoints().forEach((j, k) => {
    if (!/^eye/.test(j.getName()) || !ibm) return;
    const m = ibm.getElement(k, []);
    // (position de liaison : translation de l'inverse de la matrice inverse de liaison)
    const inv = invert4(m);
    eyes.push([inv[12], inv[13], inv[14]]);
  });
}
function invert4(m) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = m;
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06 || 1;
  return [
    (a11 * b11 - a12 * b10 + a13 * b09) / det, (a02 * b10 - a01 * b11 - a03 * b09) / det, (a31 * b05 - a32 * b04 + a33 * b03) / det, (a22 * b04 - a21 * b05 - a23 * b03) / det,
    (a12 * b08 - a10 * b11 - a13 * b07) / det, (a00 * b11 - a02 * b08 + a03 * b07) / det, (a32 * b02 - a30 * b05 - a33 * b01) / det, (a20 * b05 - a22 * b02 + a23 * b01) / det,
    (a10 * b10 - a11 * b08 + a13 * b06) / det, (a01 * b08 - a00 * b10 - a03 * b06) / det, (a30 * b04 - a31 * b02 + a33 * b00) / det, (a21 * b02 - a20 * b04 - a23 * b00) / det,
    (a11 * b07 - a10 * b09 - a12 * b06) / det, (a00 * b09 - a01 * b07 + a02 * b06) / det, (a31 * b01 - a30 * b03 - a32 * b00) / det, (a20 * b03 - a21 * b01 + a22 * b00) / det,
  ];
}
// (les os des yeux du taureau sont au milieu du crâne et ne portent aucun sommet : ses yeux sont peints sur la photo,
// aux UV données par --eyeuv u,v[,u,v] — relevées sur la photo de Bull_Brown_01 : 0,113 0,427 et 0,113 0,572 —, dont
// on prend la position de repos ; chercher le texel le plus sombre trouvait la base des oreilles ou la gorge)
eyes.length = 0;
if (opt.eyeuv) {
  const uvs = String(opt.eyeuv).split(',').map(Number);
  for (let k = 0; k + 1 < uvs.length; k += 2) {
    const cx = Math.round(uvs[k] * W);
    const cy = Math.round(uvs[k + 1] * W);
    const a = [0, 0, 0, 0];
    for (let y = cy - 4; y <= cy + 4; y++) for (let x = cx - 4; x <= cx + 4; x++) {
      const o = y * W + x;
      if (isl[o] < 0) continue;
      a[0] += p3[o * 3];
      a[1] += p3[o * 3 + 1];
      a[2] += p3[o * 3 + 2];
      a[3]++;
    }
    if (a[3]) eyes.push([a[0] / a[3], a[1] / a[3], a[2] / a[3]]);
  }
}
const nearEye = (o) => eyes.some((c) => Math.hypot(p3[o * 3] - c[0], p3[o * 3 + 1] - c[1], p3[o * 3 + 2] - c[2]) < EYE_R);
if (eyes.length) console.log('yeux', eyes.map((c) => c.map((x) => x.toFixed(3)).join(' ')).join(' | '));

// (bout du museau : la peau rose du mufle ne se cherche que là — la face claire du taureau passait pour du mufle)
let zNose = -Infinity;
for (let o = 0; o < N; o++) if ((part[o] === 2 || part[o] === 3) && isl[o] === mainI) zNose = Math.max(zNose, p3[o * 3 + 2]);

// ------------------------------------------------------------------ classes de texels
// 0 rien, 1 poil foncé, 2 poil clair, 3 peau rose, 4 corne, 5 onglon, 6 mamelle, 7 gardé (bouche, cils, yeux peints)
const cls = new Uint8Array(N);
const alpha = new Uint8Array(N);
const eyeLid = new Uint8Array(N);
for (let o = 0; o < N; o++) {
  alpha[o] = raw[o * 4 + 3];
  const I = isl[o];
  if (I < 0) continue;
  const pt = part[o];
  const h = hsv[o * 3];
  const s = hsv[o * 3 + 1];
  const v = hsv[o * 3 + 2];
  // (œil peint du taureau : seul l'œil sombre — iris, pupille — garde ses couleurs ; les paupières claires et le blanc de
  // l'œil, gardés aussi, faisaient un anneau pâle autour de l'œil sur les robes sombres et un « monocle » dans les
  // lunettes de la Normande : ils prennent la robe, peinte par le jeu)
  const eyeHere = eyes.length && pt === 2 && nearEye(o);
  if (eyeHere && KIND === 'bull' && lum[o] > Number(opt.lid ?? 0.16)) {
    cls[o] = 2;
    eyeLid[o] = 1;
    continue;
  }
  if (keepIsl[I] || alpha[o] < 250 || pt === 10 || eyeHere) {
    cls[o] = 7;
    continue;
  }
  if (SKIN_ISL.has(I)) cls[o] = 3;
  else if (pt === 5) cls[o] = 4;
  else if (pt === 9) cls[o] = 5;
  else if (pt === 6) cls[o] = 6;
  else {
    const pinkHue = h >= 335 || h <= 32;
    const skinRegion = pt === 4 || ((pt === 2 || pt === 3) && p3[o * 3 + 2] > zNose - Number(opt.muzzle ?? 0.13));
    // (intérieur des oreilles : peau rose plus sombre, à l'ombre du pavillon)
    const skin = skinRegion && pinkHue && s > (pt === 4 ? 0.12 : 0.18) && s < 0.66 && v > (pt === 4 ? 0.36 : KIND === 'bull' ? 0.42 : 0.5);
    const dark = KIND === 'bull' ? false : (s > 0.3 && v < 0.64) || v < 0.2;
    cls[o] = skin && !(dark && v < 0.5) ? 3 : dark ? 1 : 2;
  }
}

// ------------------------------------------------------------------ flou par îlot (avec poids)
/** Flou gaussien approché (3 boîtes) de num/den, sans franchir le bord d'un îlot ; renvoie num/den (ou fallback). */
function islandBlur(val, wgt, sigma, fallback = null) {
  const out = new Float32Array(N);
  const r = Math.max(1, Math.round(Math.sqrt((12 * sigma * sigma) / 3 + 1) / 2));
  // boîtes de l'îlot : on floute l'image entière mais les poids s'annulent hors îlot ; on traite chaque îlot séparément
  const box = iStat.map(() => [W, W, -1, -1]);
  for (let o = 0; o < N; o++) {
    const I = isl[o];
    if (I < 0) continue;
    const x = o % W;
    const y = (o - x) / W;
    const b = box[I];
    if (x < b[0]) b[0] = x;
    if (y < b[1]) b[1] = y;
    if (x > b[2]) b[2] = x;
    if (y > b[3]) b[3] = y;
  }
  for (let I = 0; I < NI; I++) {
    const b = box[I];
    if (b[2] < 0) continue;
    const x0 = Math.max(0, b[0] - r * 3);
    const y0 = Math.max(0, b[1] - r * 3);
    const x1 = Math.min(W - 1, b[2] + r * 3);
    const y1 = Math.min(W - 1, b[3] + r * 3);
    const bw = x1 - x0 + 1;
    const bh = y1 - y0 + 1;
    let A = new Float32Array(bw * bh);
    let B = new Float32Array(bw * bh);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const o = y * W + x;
      if (isl[o] !== I) continue;
      const k = (y - y0) * bw + (x - x0);
      A[k] = val[o] * wgt[o];
      B[k] = wgt[o];
    }
    const tmp = new Float32Array(bw * bh);
    const pass = (src, horiz) => {
      const dst = tmp;
      if (horiz) {
        for (let y = 0; y < bh; y++) {
          let acc = 0;
          const row = y * bw;
          for (let x = -r; x <= r; x++) acc += src[row + Math.min(bw - 1, Math.max(0, x))] * (x >= 0 && x < bw ? 1 : 0);
          for (let x = 0; x < bw; x++) {
            dst[row + x] = acc / (2 * r + 1);
            const xa = x + r + 1;
            const xb = x - r;
            if (xa < bw) acc += src[row + xa];
            if (xb >= 0) acc -= src[row + xb];
          }
        }
      } else {
        for (let x = 0; x < bw; x++) {
          let acc = 0;
          for (let y = -r; y <= r; y++) acc += y >= 0 && y < bh ? src[y * bw + x] : 0;
          for (let y = 0; y < bh; y++) {
            dst[y * bw + x] = acc / (2 * r + 1);
            const ya = y + r + 1;
            const yb = y - r;
            if (ya < bh) acc += src[ya * bw + x];
            if (yb >= 0) acc -= src[yb * bw + x];
          }
        }
      }
      src.set(dst);
    };
    for (let k = 0; k < 3; k++) {
      pass(A, true);
      pass(A, false);
      pass(B, true);
      pass(B, false);
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const o = y * W + x;
      if (isl[o] !== I) continue;
      const k = (y - y0) * bw + (x - x0);
      out[o] = B[k] > 1e-4 ? A[k] / B[k] : fallback ? fallback[o] : 0;
    }
    A = null;
    B = null;
  }
  return out;
}
const ones = new Float32Array(N).fill(1);

// (peau : petits points retirés, bord adouci — l'intérieur des oreilles était tacheté)
{
  const sk = new Float32Array(N);
  for (let o = 0; o < N; o++) sk[o] = cls[o] === 3 ? 1 : 0;
  const sb = islandBlur(sk, ones, 2.2);
  for (let o = 0; o < N; o++) {
    if (cls[o] === 3 && sb[o] < 0.42) cls[o] = hsv[o * 3 + 1] > 0.3 && hsv[o * 3 + 2] < 0.64 && KIND !== 'bull' ? 1 : 2;
    else if ((cls[o] === 1 || cls[o] === 2) && sb[o] > 0.62 && (part[o] === 4 || ((part[o] === 2 || part[o] === 3) && p3[o * 3 + 2] > zNose - 0.13))) cls[o] = 3;
  }
}

// ------------------------------------------------------------------ champ des taches (R du masque)
const hair = new Float32Array(N);
const dark = new Float32Array(N);
for (let o = 0; o < N; o++) {
  hair[o] = cls[o] === 1 || cls[o] === 2 ? 1 : 0;
  dark[o] = cls[o] === 1 ? 1 : 0;
}
// (petits points isolés retirés : flou léger puis seuil)
const d0 = islandBlur(dark, hair, 1.6);
const d1 = new Float32Array(N);
for (let o = 0; o < N; o++) d1[o] = d0[o] > 0.5 ? 1 : 0;
const pieN = islandBlur(d1, hair, 2.5);
const pieB = islandBlur(d1, hair, 18, pieN);
const pie = new Float32Array(N);
for (let o = 0; o < N; o++) pie[o] = KIND === 'bull' ? 0 : 0.5 * pieN[o] + 0.5 * pieB[o];

// ------------------------------------------------------------------ grain
// classe de grain : poil foncé / clair (d'après le champ nettoyé), peau, corne, onglon, mamelle
const gcls = new Uint8Array(N);
for (let o = 0; o < N; o++) {
  const c = cls[o];
  gcls[o] = c === 1 || c === 2 ? (d1[o] > 0.5 ? 1 : 2) : c;
}
// (taureau : moyenne prise de près — 3,5 texels — : sa photo, brun uni, n'a qu'une classe de poil ; à 12 texels, les
// boucles du front et l'anneau clair des yeux restaient en plaques claires et grises, « marbrées de bleu » sur une face
// blanche ; ici ne reste que le grain fin du poil)
const SIG = Number(opt.sigma ?? (KIND === 'bull' ? 3.5 : 12));
const mean = new Float32Array(N);
const own = new Float32Array(N);
const wide = islandBlur(lum, ones, 40);
for (let c = 1; c <= 6; c++) {
  const m = new Float32Array(N);
  let any = false;
  for (let o = 0; o < N; o++) if (gcls[o] === c) {
    m[o] = 1;
    any = true;
  }
  if (!any) continue;
  const mb = islandBlur(lum, m, SIG, wide);
  const ob = islandBlur(m, ones, 1.8);
  for (let o = 0; o < N; o++) if (gcls[o] === c) {
    mean[o] = mb[o];
    own[o] = ob[o];
  }
}
const grain = new Float32Array(N).fill(1);
const okw = new Float32Array(N);
for (let o = 0; o < N; o++) {
  if (!gcls[o] || gcls[o] === 7) continue;
  grain[o] = Math.min(1.6, Math.max(0.5, lum[o] / Math.max(0.01, mean[o])));
  // (bord d'une classe : texels mêlés, grain repris du voisinage ; de même les trous noirs de la photo — la base des
  // oreilles du taureau —, qui faisaient des points noirs sur la tête)
  okw[o] = Math.min(1, Math.max(0, (own[o] - 0.62) / 0.3)) * (hsv[o * 3 + 2] < 0.07 && (gcls[o] === 1 || gcls[o] === 2) ? 0 : 1) * (eyeLid[o] ? 0 : 1);
}
const gs = islandBlur(grain, okw, 2.2, ones);
const hash = (o) => {
  const x = Math.sin(o * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
};
for (let o = 0; o < N; o++) {
  if (!gcls[o] || gcls[o] === 7) continue;
  const b = 1 - okw[o];
  if (b > 0) grain[o] = grain[o] * (1 - b) + (gs[o] + (hash(o) - 0.5) * 0.08) * b;
}

// ------------------------------------------------------------------ sorties
const toS = (v) => {
  const x = Math.min(1, Math.max(0, v));
  return Math.round(255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055));
};
const col = Buffer.alloc(N * 4);
const skin = new Float32Array(N);
const keep = new Float32Array(N);
for (let o = 0; o < N; o++) {
  const c = gcls[o];
  if (c === 7 || isl[o] < 0) {
    col[o * 4] = raw[o * 4];
    col[o * 4 + 1] = raw[o * 4 + 1];
    col[o * 4 + 2] = raw[o * 4 + 2];
    keep[o] = c === 7 ? 1 : 0;
  } else {
    const g = toS(grain[o] * 0.5);
    col[o * 4] = col[o * 4 + 1] = col[o * 4 + 2] = g;
  }
  col[o * 4 + 3] = alpha[o];
  skin[o] = c === 3 ? 1 : 0;
}
// (gouttière : les texels hors des îlots prennent la valeur de leur voisin, pour le filtrage)
function dilate(buf, ch, valid, n = 6) {
  let ok = Uint8Array.from(valid);
  for (let it = 0; it < n; it++) {
    const nok = ok.slice();
    for (let o = 0; o < N; o++) {
      if (ok[o]) continue;
      const x = o % W;
      const y = (o - x) / W;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= W) continue;
        const q = yy * W + xx;
        if (!ok[q]) continue;
        for (let k = 0; k < ch; k++) buf[o * ch + k] = buf[q * ch + k];
        nok[o] = 1;
        break;
      }
    }
    ok = nok;
  }
}
const inIsl = Uint8Array.from(isl, (v) => (v >= 0 ? 1 : 0));
// (couleur : RGB seulement, l'alpha d'origine reste — les cils)
const rgb = Buffer.alloc(N * 3);
for (let o = 0; o < N; o++) for (let k = 0; k < 3; k++) rgb[o * 3 + k] = col[o * 4 + k];
dilate(rgb, 3, inIsl, 8);
for (let o = 0; o < N; o++) for (let k = 0; k < 3; k++) col[o * 4 + k] = rgb[o * 3 + k];
await sharp(col, { raw: { width: W, height: W, channels: 4 } }).png().toFile(outColor);
const mk = Buffer.alloc(N * 3);
for (let o = 0; o < N; o++) {
  mk[o * 3] = Math.round(255 * Math.min(1, Math.max(0, pie[o])));
  mk[o * 3 + 1] = Math.round(255 * skin[o]);
  mk[o * 3 + 2] = Math.round(255 * keep[o]);
}
dilate(mk, 3, inIsl, 8);
await sharp(mk, { raw: { width: W, height: W, channels: 3 } }).resize(MW, MW, { kernel: 'lanczos3' }).png().toFile(outMask);
// (repères notés pour le jeu : yeux peints du taureau — pack.mjs les range dans extras.cow.eyes)
fs.writeFileSync(outColor.replace(/\.png$/, '.json'), JSON.stringify({ eyes: eyes.map((c) => c.map((x) => Math.round(x * 1e4) / 1e4)) }));
console.log(`couleur ${outColor} (${W}²), masque ${outMask} (${MW}²), îlots ${NI}, bouche ${[...MOUTH].join(',') || 'aucun'}`);

if (DEBUG) {
  fs.mkdirSync(DEBUG, { recursive: true });
  const PC = [[0, 0, 0], [200, 200, 200], [230, 120, 60], [160, 40, 40], [240, 200, 60], [120, 90, 200], [240, 120, 200], [60, 160, 60], [60, 120, 230], [40, 40, 40], [0, 255, 255]];
  const pm = Buffer.alloc(N * 3);
  for (let o = 0; o < N; o++) pm.set(PC[part[o]], o * 3);
  await sharp(pm, { raw: { width: W, height: W, channels: 3 } }).png().toFile(path.join(DEBUG, `${KIND}_parties.png`));
  const CC = [[0, 0, 0], [110, 50, 30], [235, 235, 235], [240, 150, 150], [120, 90, 200], [40, 40, 40], [240, 120, 200], [0, 220, 220]];
  const cm = Buffer.alloc(N * 3);
  for (let o = 0; o < N; o++) cm.set(CC[gcls[o]], o * 3);
  await sharp(cm, { raw: { width: W, height: W, channels: 3 } }).png().toFile(path.join(DEBUG, `${KIND}_classes.png`));
  const im = Buffer.alloc(N * 3);
  for (let o = 0; o < N; o++) {
    const I = isl[o];
    if (I < 0) continue;
    im.set([(I * 97) % 255, (I * 57 + 80) % 255, (I * 151 + 30) % 255], o * 3);
  }
  await sharp(im, { raw: { width: W, height: W, channels: 3 } }).png().toFile(path.join(DEBUG, `${KIND}_ilots.png`));
}

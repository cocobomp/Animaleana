// Coutures de la robe : îlots d'UV de la carte de modelé (horse_body_detail) et de la carte de relief
// (HorseMain2k00Norm00) poussés de DILATE pixels au-delà de leur bord, et niveaux de gris du modelé raccordés
// d'un îlot à l'autre. node dilate.mjs <entrée.glb> <sortie.glb> (entrée : le GLB d'origine, pas déjà traité)
//
// Hors des îlots, la carte de modelé gardait la mosaïque de gris de la texture source (des carrés de gris
// différents collés au bord des îlots) et la carte de relief du noir (0, 0, 0). Le filtrage et les niveaux réduits
// (mipmaps) mêlent ces texels au bord des îlots : sur une robe claire, des plaques grises en dents de scie derrière
// l'œil, sous l'oreille et le long de la ganache, et un fin trait sombre sur un bai. Ici, les îlots sont
// retrouvés en dessinant les triangles de la robe dans l'espace des UV (pas d'après les couleurs) ; chaque texel
// hors d'un îlot prend, passe après passe, la moyenne de ses voisins déjà remplis (la valeur du bord la plus
// proche, jamais du noir ni la mosaïque) ; au-delà de DILATE pixels, la moyenne de l'îlot. Dans la carte de
// relief, les texels d'îlot impossibles (bleu < 128 : normale tournée vers l'intérieur) sont refaits de même et
// les normales remplies sont renormalisées. Les autres données du fichier ne changent pas (encodage meshopt sans
// filtre, comme lod.mjs et normfix.mjs) ; les images restent en WebP qualité 82 (comme pack.mjs).
//
// Raccord des niveaux (carte de modelé seulement) : de part et d'autre d'une couture (arête du maillage dont les
// deux triangles ont des UV différentes), la photo d'origine n'a pas le même gris (prise de vue, éclairage) : une
// marche de gris nette, en dents de scie le long des triangles, restait sur la joue des chevaux gris même sans
// fond mêlé. On mesure l'écart des gris moyens (flou de LEVEL_BLUR texels, sur l'îlot seul) des deux côtés le
// long de chaque couture, on y fixe un décalage de ∓ la moitié de l'écart, et on étend ces décalages à tout
// l'îlot par une interpolation douce (équation de Laplace, du grossier au fin) : le grain du poil ne change pas,
// seul le niveau moyen glisse doucement jusqu'à la couture, où les deux côtés se rejoignent.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [inp, out] = process.argv.slice(2);
const DILATE = 48; // (≥ 32 : jusqu'au niveau réduit 1/32, un texel ne voit plus que l'îlot)
const LEVEL_BLUR = 5; // (rayon du flou de la mesure des gris de part et d'autre d'une couture, en texels)

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(inp);
const root = doc.getRoot();

// Triangles de la robe (première primitive de la matière horse_coat : la version réduite partage ses UV).
const prim = root.listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getMaterial()?.getName() === 'horse_coat');
if (!prim) throw new Error('primitive de la robe absente');
const uvAcc = prim.getAttribute('TEXCOORD_0');
const index = prim.getIndices().getArray();
const uv = [];
const el = [0, 0];
for (let i = 0; i < uvAcc.getCount(); i++) uv.push(uvAcc.getElement(i, el).slice());

// Coutures : arêtes (par position soudée) partagées par deux triangles dont les UV diffèrent.
const posAcc = prim.getAttribute('POSITION');
const weld = new Map();
const pid = [];
const e3 = [0, 0, 0];
for (let i = 0; i < posAcc.getCount(); i++) {
  const k = posAcc.getElement(i, e3).map((v) => Math.round(v * 1e5)).join(',');
  if (!weld.has(k)) weld.set(k, weld.size);
  pid.push(weld.get(k));
}
const edges = new Map();
for (let t = 0; t < index.length; t += 3) {
  for (let k = 0; k < 3; k++) {
    const a = index[t + k];
    const b = index[t + ((k + 1) % 3)];
    const [lo, hi] = pid[a] < pid[b] ? [a, b] : [b, a];
    const key = `${pid[lo]}_${pid[hi]}`;
    if (!edges.has(key)) edges.set(key, []);
    edges.get(key).push([lo, hi]);
  }
}
const sameUv = (i, j) => Math.abs(uv[i][0] - uv[j][0]) < 1e-5 && Math.abs(uv[i][1] - uv[j][1]) < 1e-5;
const seams = [];
for (const list of edges.values()) {
  if (list.length !== 2) continue;
  const [[a1, b1], [a2, b2]] = list;
  if (sameUv(a1, a2) && sameUv(b1, b2)) continue;
  seams.push([uv[a1], uv[b1], uv[a2], uv[b2]]);
}

/** Masque des texels couverts par les triangles (centre du texel dans le triangle, ou à moins d'un demi-texel). */
function islandMask(W, H) {
  const mask = new Uint8Array(W * H);
  const edge = (ax, ay, bx, by, px, py) => (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  for (let t = 0; t < index.length; t += 3) {
    const p = [0, 1, 2].map((k) => [uv[index[t + k]][0] * W, uv[index[t + k]][1] * H]);
    const area = edge(p[0][0], p[0][1], p[1][0], p[1][1], p[2][0], p[2][1]);
    if (Math.abs(area) < 1e-9) continue;
    const s = Math.sign(area);
    const x0 = Math.max(0, Math.floor(Math.min(p[0][0], p[1][0], p[2][0]) - 1));
    const x1 = Math.min(W - 1, Math.ceil(Math.max(p[0][0], p[1][0], p[2][0]) + 1));
    const y0 = Math.max(0, Math.floor(Math.min(p[0][1], p[1][1], p[2][1]) - 1));
    const y1 = Math.min(H - 1, Math.ceil(Math.max(p[0][1], p[1][1], p[2][1]) + 1));
    // (distance signée à chaque arête, en texels : demi-texel de marge)
    const len = [0, 1, 2].map((k) => Math.hypot(p[(k + 1) % 3][0] - p[k][0], p[(k + 1) % 3][1] - p[k][1]) || 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const cx = x + 0.5;
        const cy = y + 0.5;
        let inside = true;
        for (let k = 0; k < 3 && inside; k++) {
          const a = p[k];
          const b = p[(k + 1) % 3];
          if ((s * edge(a[0], a[1], b[0], b[1], cx, cy)) / len[k] < -0.5) inside = false;
        }
        if (inside) mask[y * W + x] = 1;
      }
    }
  }
  return mask;
}

/** Moyenne locale de v sur les texels de l'îlot seulement (flou en boîte séparable, deux passes). */
function maskedBlur(v, mask, W, H, R) {
  let a = new Float32Array(W * H);
  let w = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    a[i] = v[i] * mask[i];
    w[i] = mask[i];
  }
  const box = (src, horiz) => {
    const res = new Float32Array(W * H);
    const n = horiz ? W : H;
    const m = horiz ? H : W;
    const at = (j, k) => (horiz ? j * W + k : k * W + j);
    for (let j = 0; j < m; j++) {
      let acc = 0;
      for (let k = 0; k <= R && k < n; k++) acc += src[at(j, k)];
      for (let k = 0; k < n; k++) {
        res[at(j, k)] = acc;
        if (k + R + 1 < n) acc += src[at(j, k + R + 1)];
        if (k - R >= 0) acc -= src[at(j, k - R)];
      }
    }
    return res;
  };
  for (let pass = 0; pass < 2; pass++) {
    a = box(box(a, true), false);
    w = box(box(w, true), false);
  }
  const res = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) res[i] = w[i] > 1e-6 ? a[i] / w[i] : 0;
  return res;
}

/** Valeur bilinéaire de f au point (x, y), en texels. */
function bilinear(f, W, H, x, y) {
  const fx = Math.min(W - 1.001, Math.max(0, x - 0.5));
  const fy = Math.min(H - 1.001, Math.max(0, y - 0.5));
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const u = fx - x0;
  const v = fy - y0;
  const i = y0 * W + x0;
  return (f[i] * (1 - u) + f[i + 1] * u) * (1 - v) + (f[i + W] * (1 - u) + f[i + W + 1] * u) * v;
}

/** Écart moyen des gris de part et d'autre des coutures, et décalages voulus (somme, nombre) par texel. */
function seamGaps(lum, mask, W, H) {
  const m = maskedBlur(lum, mask, W, H, LEVEL_BLUR);
  const sum = new Float32Array(W * H);
  const cnt = new Float32Array(W * H);
  let gap = 0;
  let n = 0;
  for (const [a1, b1, a2, b2] of seams) {
    const len = Math.max(Math.hypot((b1[0] - a1[0]) * W, (b1[1] - a1[1]) * H), Math.hypot((b2[0] - a2[0]) * W, (b2[1] - a2[1]) * H));
    const steps = Math.max(1, Math.ceil(len * 2));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x1 = (a1[0] + (b1[0] - a1[0]) * t) * W;
      const y1 = (a1[1] + (b1[1] - a1[1]) * t) * H;
      const x2 = (a2[0] + (b2[0] - a2[0]) * t) * W;
      const y2 = (a2[1] + (b2[1] - a2[1]) * t) * H;
      if (Math.hypot(x1 - x2, y1 - y2) < 1) continue;
      const d = bilinear(m, W, H, x1, y1) - bilinear(m, W, H, x2, y2);
      gap += Math.abs(d);
      n++;
      for (const [x, y, o] of [[x1, y1, -d / 2], [x2, y2, d / 2]]) {
        const i = Math.min(H - 1, Math.max(0, Math.floor(y))) * W + Math.min(W - 1, Math.max(0, Math.floor(x)));
        sum[i] += o;
        cnt[i]++;
      }
    }
  }
  return { gap: n ? gap / n : 0, sum, cnt, n };
}

/** Décalage doux sur les îlots, fixé aux coutures (Laplace : Gauss-Seidel sur-relaxé, du grossier au fin). */
function solveOffsets(sum, cnt, mask, W) {
  const levels = [{ w: W, mask, sum, cnt }];
  while (levels[levels.length - 1].w > 64) {
    const f = levels[levels.length - 1];
    const w = f.w >> 1;
    const L = { w, mask: new Uint8Array(w * w), sum: new Float32Array(w * w), cnt: new Float32Array(w * w) };
    for (let y = 0; y < f.w; y++) {
      for (let x = 0; x < f.w; x++) {
        const i = y * f.w + x;
        const j = (y >> 1) * w + (x >> 1);
        if (f.mask[i]) L.mask[j] = 1;
        L.sum[j] += f.sum[i];
        L.cnt[j] += f.cnt[i];
      }
    }
    levels.push(L);
  }
  let o = null;
  for (let l = levels.length - 1; l >= 0; l--) {
    const { w, mask: mk, sum: sm, cnt: ct } = levels[l];
    const cur = new Float32Array(w * w);
    if (o) for (let y = 0; y < w; y++) for (let x = 0; x < w; x++) cur[y * w + x] = o[(y >> 1) * (w >> 1) + (x >> 1)];
    const fixed = new Uint8Array(w * w);
    for (let i = 0; i < w * w; i++) {
      if (ct[i] > 0) {
        fixed[i] = 1;
        cur[i] = sm[i] / ct[i];
      }
    }
    const open = (i) => mk[i] || fixed[i];
    const iters = l === levels.length - 1 ? 3000 : 400;
    for (let it = 0; it < iters; it++) {
      for (let y = 0; y < w; y++) {
        for (let x = 0; x < w; x++) {
          const i = y * w + x;
          if (!mk[i] || fixed[i]) continue;
          let acc = 0;
          let n = 0;
          if (x > 0 && open(i - 1)) { acc += cur[i - 1]; n++; }
          if (x < w - 1 && open(i + 1)) { acc += cur[i + 1]; n++; }
          if (y > 0 && open(i - w)) { acc += cur[i - w]; n++; }
          if (y < w - 1 && open(i + w)) { acc += cur[i + w]; n++; }
          if (n) cur[i] += 1.85 * (acc / n - cur[i]);
        }
      }
    }
    o = cur;
  }
  return o;
}

/** Remplit les texels hors du masque (ok = 0) par passes successives depuis le bord. px : Float32Array RGB. */
function dilate(px, ok, W, H) {
  const done = ok.slice();
  let filled = 0;
  for (let pass = 0; pass < DILATE; pass++) {
    const add = [];
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (done[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx;
            const yy = y + dy;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            const j = yy * W + xx;
            if (!done[j]) continue;
            r += px[j * 3];
            g += px[j * 3 + 1];
            b += px[j * 3 + 2];
            n++;
          }
        }
        if (n) add.push([i, r / n, g / n, b / n]);
      }
    }
    if (!add.length) break;
    for (const [i, r, g, b] of add) {
      px[i * 3] = r;
      px[i * 3 + 1] = g;
      px[i * 3 + 2] = b;
      done[i] = 1;
    }
    filled += add.length;
  }
  // Au-delà : la moyenne des îlots.
  let mr = 0;
  let mg = 0;
  let mb = 0;
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!ok[i]) continue;
    mr += px[i * 3];
    mg += px[i * 3 + 1];
    mb += px[i * 3 + 2];
    n++;
  }
  for (let i = 0; i < W * H; i++) {
    if (done[i]) continue;
    px[i * 3] = mr / n;
    px[i * 3 + 1] = mg / n;
    px[i * 3 + 2] = mb / n;
  }
  return filled;
}

for (const [re, normal] of [[/body_detail/, false], [/Norm00/, true]]) {
  const tex = root.listTextures().find((t) => re.test(t.getName()));
  if (!tex) throw new Error(`texture ${re} absente`);
  const mime = tex.getMimeType();
  const { data, info } = await sharp(tex.getImage()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const mask = islandMask(W, H);
  const ok = mask.slice();
  let impossible = 0;
  if (normal) {
    for (let i = 0; i < W * H; i++) {
      if (ok[i] && (data[i * 3 + 2] < 128 || data[i * 3] + data[i * 3 + 1] + data[i * 3 + 2] <= 60)) {
        ok[i] = 0;
        impossible++;
      }
    }
  }
  const px = new Float32Array(W * H * 3);
  for (let i = 0; i < px.length; i++) px[i] = data[i];
  const cover = mask.reduce((s, v) => s + v, 0) / (W * H);
  if (!normal && W === H) {
    const lum = () => {
      const l = new Float32Array(W * H);
      for (let i = 0; i < W * H; i++) l[i] = (px[i * 3] + px[i * 3 + 1] + px[i * 3 + 2]) / 3;
      return l;
    };
    const before = seamGaps(lum(), mask, W, H);
    const off = solveOffsets(before.sum, before.cnt, mask, W);
    for (let i = 0; i < W * H; i++) {
      if (!mask[i]) continue;
      for (let c = 0; c < 3; c++) px[i * 3 + c] += off[i];
    }
    const after = seamGaps(lum(), mask, W, H);
    console.log(`coutures : ${seams.length} arêtes, ${before.n} mesures ; écart moyen des gris ${before.gap.toFixed(1)} -> ${after.gap.toFixed(1)} (sur 255)`);
  }
  const filled = dilate(px, ok, W, H);
  const outPx = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) {
    if (normal && !ok[i]) {
      let nx = px[i * 3] / 127.5 - 1;
      let ny = px[i * 3 + 1] / 127.5 - 1;
      let nz = Math.max(0.2, px[i * 3 + 2] / 127.5 - 1);
      const l = Math.hypot(nx, ny, nz);
      nx /= l;
      ny /= l;
      nz /= l;
      outPx[i * 3] = Math.round((nx + 1) * 127.5);
      outPx[i * 3 + 1] = Math.round((ny + 1) * 127.5);
      outPx[i * 3 + 2] = Math.round((nz + 1) * 127.5);
    } else {
      for (let c = 0; c < 3; c++) outPx[i * 3 + c] = Math.max(0, Math.min(255, Math.round(px[i * 3 + c])));
    }
  }
  const img = sharp(outPx, { raw: { width: W, height: H, channels: 3 } });
  const buf = mime === 'image/webp' ? await img.webp({ quality: 82, effort: 6 }).toBuffer() : await img.png().toBuffer();
  console.log(`${tex.getName()} ${W}×${H} : îlots ${(cover * 100).toFixed(1)} %, ${impossible} texels d'îlot refaits, ${filled} texels remplis ; ${(tex.getImage().byteLength / 1024).toFixed(1)} -> ${(buf.byteLength / 1024).toFixed(1)} Kio`);
  tex.setImage(new Uint8Array(buf));
}
await io.write(out, doc);
console.log('écrit', out);

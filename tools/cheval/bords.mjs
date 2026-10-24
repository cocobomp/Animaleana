// Bord des îlots de la carte de relief de la robe (HorseMain2k00Norm00) : node bords.mjs <entrée.glb> <sortie.glb>
// [--mesure] (entrée : le GLB de dilate.mjs ; refaisable sur sa propre sortie, le résultat ne change presque plus).
//
// La photo de relief de la source s'arrête en escalier au bord de ses îlots : sur les premiers texels à l'intérieur
// d'une couture, des normales mal cuites (bien plus penchées ou bien plus plates que la peau juste à côté), en dents
// de scie le long du bord. Le jeu lit la carte en filtrage bilinéaire : le long d'une couture, il tombe tantôt sur la
// peau, tantôt sur une dent — des tirets clairs alignés sur la couture du milieu du poitrail et de la gorge (vus de
// face), plus faibles ailleurs. dilate.mjs ne refaisait que les texels HORS des îlots. Ici, les texels d'îlot à moins
// de RING texels du bord (distance de Tchebychev) sont refaits depuis l'intérieur par les mêmes passes que dilate.mjs
// (moyenne des voisins déjà remplis), puis tout l'extérieur est rempli à nouveau depuis ce bord propre ; normales
// renormalisées. La carte de modelé n'est pas touchée (son bord est propre : les tirets disparaissent sans la carte
// de relief, pas sans le modelé). Les autres données du fichier ne changent pas (encodage meshopt sans filtre, comme
// lod.mjs, normfix.mjs et dilate.mjs) ; l'image reste en WebP qualité 82 (comme pack.mjs).
//
// --mesure : écart moyen (sur 255) entre chaque texel du bord et la moyenne des texels plus profonds autour de lui,
// par profondeur (1 = texel du bord) ; rien n'est écrit.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [inp, out, ...flags] = process.argv.slice(2);
const measureOnly = flags.includes('--mesure');
const RING = 3; // (texels d'îlot refaits au bord ; les dents mesurent 1 à 3 texels, voir --mesure)
// Pas sur la tête (u < U_MIN, comme normfix.mjs et dilate.mjs) : ses îlots sont petits, leurs bords passent au ras des
// naseaux, des lèvres et des yeux, et leur relief marqué y est voulu (refait, le bout du nez montrait ses facettes).
const U_MIN = 0.4;
const DILATE = 48; // (comme dilate.mjs)

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(inp);
const root = doc.getRoot();
const prim = root.listMeshes().flatMap((m) => m.listPrimitives()).find((p) => p.getMaterial()?.getName() === 'horse_coat');
if (!prim) throw new Error('primitive de la robe absente');
const uvAcc = prim.getAttribute('TEXCOORD_0');
const index = prim.getIndices().getArray();
const uv = [];
const el = [0, 0];
for (let i = 0; i < uvAcc.getCount(); i++) uv.push(uvAcc.getElement(i, el).slice());

/** Masque des texels couverts par les triangles (le même que dilate.mjs). */
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
    const len = [0, 1, 2].map((k) => Math.hypot(p[(k + 1) % 3][0] - p[k][0], p[(k + 1) % 3][1] - p[k][1]) || 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let inside = true;
        for (let k = 0; k < 3 && inside; k++) {
          const a = p[k];
          const b = p[(k + 1) % 3];
          if ((s * edge(a[0], a[1], b[0], b[1], x + 0.5, y + 0.5)) / len[k] < -0.5) inside = false;
        }
        if (inside) mask[y * W + x] = 1;
      }
    }
  }
  return mask;
}

/** Profondeur de chaque texel d'îlot (1 = touche un texel hors îlot ; distance de Tchebychev), jusqu'à max. */
function depthIn(mask, W, H, max) {
  const d = new Uint8Array(W * H);
  let front = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mask[i]) continue;
      let border = false;
      for (let dy = -1; dy <= 1 && !border; dy++) {
        for (let dx = -1; dx <= 1 && !border; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || !mask[yy * W + xx]) border = true;
        }
      }
      if (border) {
        d[i] = 1;
        front.push(i);
      }
    }
  }
  for (let k = 2; k <= max; k++) {
    const next = [];
    for (const i of front) {
      const x = i % W;
      const y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
          const j = yy * W + xx;
          if (mask[j] && !d[j]) {
            d[j] = k;
            next.push(j);
          }
        }
      }
    }
    front = next;
  }
  return d;
}

/** Remplit les texels où ok = 0 par passes depuis les texels déjà bons (comme dilate.mjs). */
function dilate(px, ok, W, H) {
  const done = ok.slice();
  let filled = 0;
  for (let pass = 0; pass < DILATE + RING; pass++) {
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
  // Au-delà : la moyenne des îlots (comme dilate.mjs).
  const m = [0, 0, 0];
  let n = 0;
  for (let i = 0; i < W * H; i++) {
    if (!ok[i]) continue;
    for (let c = 0; c < 3; c++) m[c] += px[i * 3 + c];
    n++;
  }
  for (let i = 0; i < W * H; i++) if (!done[i]) for (let c = 0; c < 3; c++) px[i * 3 + c] = m[c] / n;
  return filled;
}

/** Écart moyen (sur 255, trois canaux) entre un texel de bord et la moyenne des texels plus profonds (au-delà de 6) à 8 texels autour. */
function ringError(px, depth, W, H, maxD = 6, uMin = 0) {
  const sum = new Float64Array(maxD + 1);
  const cnt = new Float64Array(maxD + 1);
  for (let y = 8; y < H - 8; y++) {
    for (let x = 8; x < W - 8; x++) {
      const i = y * W + x;
      const k = depth[i];
      if (!k || k > maxD || (x + 0.5) / W < uMin) continue;
      const m = [0, 0, 0];
      let n = 0;
      for (let dy = -8; dy <= 8; dy++) {
        for (let dx = -8; dx <= 8; dx++) {
          const j = (y + dy) * W + x + dx;
          if (!inner[j]) continue;
          for (let c = 0; c < 3; c++) m[c] += px[j * 3 + c];
          n++;
        }
      }
      if (n < 4) continue;
      let e = 0;
      for (let c = 0; c < 3; c++) e += Math.abs(px[i * 3 + c] - m[c] / n);
      sum[k] += e / 3;
      cnt[k]++;
    }
  }
  return [...sum].map((s, k) => (cnt[k] ? s / cnt[k] : 0)).slice(1);
}

let inner = null;
const tex = root.listTextures().find((t) => /Norm00/.test(t.getName()));
if (!tex) throw new Error('carte de relief de la robe absente');
const { data, info } = await sharp(tex.getImage()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const mask = islandMask(W, H);
const depth = depthIn(mask, W, H, 12);
// (texels profonds : îlot au-delà de 6 texels du bord, la référence de la mesure)
inner = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) inner[i] = mask[i] && (!depth[i] || depth[i] > 6) ? 1 : 0;
const px = new Float32Array(W * H * 3);
for (let i = 0; i < px.length; i++) px[i] = data[i];
const fmt = (a) => a.map((e) => e.toFixed(1)).join(' ');
console.log(`écart au fond de l'îlot par profondeur (1 = bord), sur 255 : tout ${fmt(ringError(px, depth, W, H))} ; corps (u ≥ ${U_MIN}) ${fmt(ringError(px, depth, W, H, 6, U_MIN))}`);
if (measureOnly) process.exit(0);

const ok = new Uint8Array(W * H);
let ring = 0;
for (let i = 0; i < W * H; i++) {
  ok[i] = mask[i] && !(depth[i] && depth[i] <= RING && ((i % W) + 0.5) / W >= U_MIN) ? 1 : 0;
  if (mask[i] && !ok[i]) ring++;
}
const filled = dilate(px, ok, W, H);
const outPx = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H; i++) {
  if (ok[i]) {
    for (let c = 0; c < 3; c++) outPx[i * 3 + c] = data[i * 3 + c];
    continue;
  }
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
}
const after = new Float32Array(W * H * 3);
for (let i = 0; i < after.length; i++) after[i] = outPx[i];
console.log(`après : tout ${fmt(ringError(after, depth, W, H))} ; corps ${fmt(ringError(after, depth, W, H, 6, U_MIN))}`);
const img = sharp(outPx, { raw: { width: W, height: H, channels: 3 } });
const buf = tex.getMimeType() === 'image/webp' ? await img.webp({ quality: 82, effort: 6 }).toBuffer() : await img.png().toBuffer();
console.log(`${tex.getName()} ${W}×${H} : ${ring} texels de bord refaits, ${filled} texels remplis ; ${(tex.getImage().byteLength / 1024).toFixed(1)} -> ${(buf.byteLength / 1024).toFixed(1)} Kio`);
tex.setImage(new Uint8Array(buf));
await io.write(out, doc);
console.log('écrit', out);

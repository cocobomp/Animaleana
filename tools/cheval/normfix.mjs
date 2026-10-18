// Carte de relief de la robe (HorseMain2k00Norm00) : bouche les taches isolées venues de la texture source
// de Lyndon Daniels. node normfix.mjs <entrée.glb> <sortie.glb> [--liste]
//
// Une tache = des pixels dont la normale pointe vers l'intérieur de la peau (bleu < 128 : z < 0, impossible pour
// un relief) ou s'écarte fortement du filtre médian 11×11, entourés d'une peau normale. Sur la croupe, la
// paire de taches (832, 473) / (833, 547) dessinait une fente sombre, bleutée de près, des deux côtés ; sous les
// coudes, les grassets et aux jarrets, des points bleutés. Chaque tache (agrandie de 2 px) est remplie par
// diffusion depuis son bord (la peau voisine se prolonge), puis les normales sont renormalisées. La tête
// (u < 0,4 : yeux, naseaux, bouche, où le relief marqué est voulu) n'est pas touchée.
//
// L'image garde son format : PNG dans le GLB brut (avant pack.mjs), WebP qualité 82 dans le GLB du jeu (comme
// pack.mjs). Les autres données du fichier ne changent pas (encodage meshopt sans filtre, comme lod.mjs).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [inp, out, ...flags] = process.argv.slice(2);
const listOnly = flags.includes('--liste');
const U_MIN = 0.4; // (la tête est à gauche de la carte)
const DEV = 70; // écart au médian (niveaux) qui fait une tache
const MIN_CORE = 3; // au moins 3 pixels « impossibles » (bleu < 128) dans la tache

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(inp);
const tex = doc.getRoot().listTextures().find((t) => /Norm00/.test(t.getName()));
if (!tex) throw new Error('carte de relief de la robe absente');
const mime = tex.getMimeType();
const { data, info } = await sharp(tex.getImage()).removeAlpha().raw().toBuffer({ resolveWithObject: true });
const W = info.width;
const H = info.height;
const px = new Float32Array(W * H * 3);
for (let i = 0; i < px.length; i++) px[i] = data[i];

// Médian 11×11 par canal (histogrammes glissants seraient plus rapides : l'image ne fait que 1024²).
const R = 5;
const med = new Uint8Array(W * H * 3);
const win = new Uint8Array((2 * R + 1) ** 2);
for (let c = 0; c < 3; c++) {
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let n = 0;
      for (let dy = -R; dy <= R; dy++) {
        const yy = Math.min(H - 1, Math.max(0, y + dy));
        for (let dx = -R; dx <= R; dx++) {
          const xx = Math.min(W - 1, Math.max(0, x + dx));
          win[n++] = data[(yy * W + xx) * 3 + c];
        }
      }
      const s = win.subarray(0, n).sort();
      med[(y * W + x) * 3 + c] = s[n >> 1];
    }
  }
}

// Pixels suspects, à l'intérieur des îlots d'UV (peau normale autour : médian bien bleu).
const bad = new Uint8Array(W * H);
const core = new Uint8Array(W * H);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = y * W + x;
    if (x < U_MIN * W) continue;
    const r = data[i * 3], g = data[i * 3 + 1], b = data[i * 3 + 2];
    if (r + g + b <= 60 || med[i * 3 + 2] <= 200) continue;
    const dev = Math.max(Math.abs(r - med[i * 3]), Math.abs(g - med[i * 3 + 1]), Math.abs(b - med[i * 3 + 2]));
    if (b < 128) core[i] = 1;
    if (dev > DEV || b < 128) bad[i] = 1;
  }
}

// Taches (pixels suspects à moins de 3 px les uns des autres), gardées si elles ont un cœur « impossible ».
const label = new Int32Array(W * H).fill(-1);
const spots = [];
for (let i = 0; i < W * H; i++) {
  if (!bad[i] || label[i] >= 0) continue;
  const id = spots.length;
  const pts = [];
  const stack = [i];
  label[i] = id;
  while (stack.length) {
    const j = stack.pop();
    pts.push(j);
    const x = j % W;
    const y = (j / W) | 0;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        const k = yy * W + xx;
        if (bad[k] && label[k] < 0) {
          label[k] = id;
          stack.push(k);
        }
      }
    }
  }
  const nCore = pts.reduce((s, j) => s + core[j], 0);
  const cx = Math.round(pts.reduce((s, j) => s + (j % W), 0) / pts.length);
  const cy = Math.round(pts.reduce((s, j) => s + ((j / W) | 0), 0) / pts.length);
  spots.push({ pts, nCore, cx, cy, keep: nCore >= MIN_CORE && pts.length <= 400 });
}
const kept = spots.filter((s) => s.keep);
for (const s of kept) console.log(`tache (${s.cx}, ${s.cy}) : ${s.pts.length} px, dont ${s.nCore} tournés vers l'intérieur`);
console.log(`${kept.length} taches bouchées sur ${spots.length} candidates`);
if (listOnly) process.exit(0);

// Masque : chaque tache gardée, agrandie de 2 px ; remplie par diffusion (le bord reste fixe).
const hole = new Uint8Array(W * H);
for (const s of kept) {
  for (const j of s.pts) {
    const x = j % W;
    const y = (j / W) | 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < W && yy < H) hole[yy * W + xx] = 1;
      }
    }
  }
}
const idx = [];
for (let i = 0; i < W * H; i++) {
  if (!hole[i]) continue;
  idx.push(i);
  for (let c = 0; c < 3; c++) px[i * 3 + c] = med[i * 3 + c]; // (départ : le médian)
}
for (let it = 0; it < 400; it++) {
  for (const i of idx) {
    const x = i % W;
    const y = (i / W) | 0;
    for (let c = 0; c < 3; c++) {
      let s = 0;
      let n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
        s += px[(yy * W + xx) * 3 + c];
        n++;
      }
      px[i * 3 + c] = s / n;
    }
  }
}
// Normales renormalisées (x, y dans [-1, 1], z positif).
const outPx = Buffer.from(data);
for (const i of idx) {
  let nx = px[i * 3] / 127.5 - 1, ny = px[i * 3 + 1] / 127.5 - 1, nz = Math.max(0.2, px[i * 3 + 2] / 127.5 - 1);
  const l = Math.hypot(nx, ny, nz);
  nx /= l; ny /= l; nz /= l;
  outPx[i * 3] = Math.round((nx + 1) * 127.5);
  outPx[i * 3 + 1] = Math.round((ny + 1) * 127.5);
  outPx[i * 3 + 2] = Math.round((nz + 1) * 127.5);
}
const img = sharp(outPx, { raw: { width: W, height: H, channels: 3 } });
const buf = mime === 'image/webp' ? await img.webp({ quality: 82, effort: 6 }).toBuffer() : await img.png().toBuffer();
console.log(`${tex.getName()} : ${(tex.getImage().byteLength / 1024).toFixed(1)} -> ${(buf.byteLength / 1024).toFixed(1)} Ko (${mime})`);
tex.setImage(new Uint8Array(buf));
await io.write(out, doc);
console.log('écrit', out);

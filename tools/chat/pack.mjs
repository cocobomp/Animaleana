// Compression d'un chat du jeu : node pack.mjs <brut.glb> <sortie.glb> --report <rapport.json> [--simplify 0.6] [--tex 1024]
// D'après tools/chien/pack.mjs :
// - canaux d'animation inutiles retirés (échelles ; translations et rotations restées au repos sur tout un clip) ;
// - clés ré-échantillonnées (celles qu'une interpolation linéaire redonne sont retirées) ;
// - matières renommées (cat_coat, cat_eye, cat_whisker) ; carte métal/rugosité retirée (pelage : ni métal,
//   rugosité fixe), cartes de normales gardées sur le pelage ; yeux : couleur seule en 256 (le jeu recolore l'iris),
//   occlusion du pelage en 512 ;
// - maillage allégé si demandé (--simplify : part des triangles gardés, coutures respectées) ;
// - textures en WebP (couleur et normales), maillage quantifié et compressé (meshopt). Noms des os et des clips gardés.
// - mesures du rapport de make_cat.py rangées dans la scène (extras.cat : vitesses naturelles, hauteur des hanches…).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';

const [inp, out, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(inp);
const root = doc.getRoot();
if (opt.report) {
  const rep = JSON.parse(fs.readFileSync(opt.report, 'utf8'));
  root.listScenes()[0].setExtras({ cat: { naturalSpeeds: rep.naturalSpeeds, hipHeight: rep.hipHeight, shoulder: rep.shoulderJoint,
    withers: 0.25, sitHip: rep.sitHip, bones: rep.bones, groundFix: rep.groundFix } });
}
const TOL_T = 0.0003; // m (chat : petites translations)
const TOL_R = 0.002; // rad
let removed = 0;
let kept = 0;
for (const anim of root.listAnimations()) {
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode();
    const path = ch.getTargetPath();
    const o = ch.getSampler().getOutput();
    let drop = path === 'scale' || path === 'weights';
    if (!drop && node) {
      const ref = path === 'translation' ? node.getTranslation() : node.getRotation();
      const el = [];
      let dev = 0;
      for (let i = 0; i < o.getCount(); i++) {
        o.getElement(i, el);
        if (path === 'translation') dev = Math.max(dev, Math.hypot(el[0] - ref[0], el[1] - ref[1], el[2] - ref[2]));
        else {
          const d = Math.abs(el[0] * ref[0] + el[1] * ref[1] + el[2] * ref[2] + el[3] * ref[3]);
          dev = Math.max(dev, 2 * Math.acos(Math.min(1, d)));
        }
      }
      drop = dev < (path === 'translation' ? TOL_T : TOL_R);
    }
    if (drop) {
      const s = ch.getSampler();
      ch.dispose();
      if (!s.listParents().some((p) => p.propertyType === 'AnimationChannel')) s.dispose();
      removed++;
    } else kept++;
  }
}
console.log(`canaux : ${kept} gardés, ${removed} retirés`);
// matière du pelage : celle de la primitive la plus grosse ; yeux : nom « eye » (ou matières des globes) ; le reste :
// détails (moustaches, intérieur des oreilles, truffe, griffes)
let big = null, bigN = -1;
for (const me of root.listMeshes()) for (const p of me.listPrimitives()) { const n = p.getAttribute('POSITION').getCount(); if (n > bigN) { bigN = n; big = p.getMaterial(); } }
const eyeMats = new Set((opt.eyes || '').split(',').filter(Boolean));
for (const m of root.listMaterials()) {
  const n = m.getName();
  const eye = /eye|cornea|iris/i.test(n) || eyeMats.has(n);
  m.setName(m === big ? 'cat_coat' : eye ? 'cat_eye' : 'cat_detail');
  if (m.getMetallicRoughnessTexture()) m.setMetallicRoughnessTexture(null);
  m.setMetallicFactor(0);
  m.setRoughnessFactor(eye ? 0.15 : 0.85);
  if (eye) {
    m.setNormalTexture(null);
    m.setOcclusionTexture(null);
  }
}
// (texture des yeux en 256 seulement si le pelage ne s'en sert pas)
for (const m of root.listMaterials()) {
  const t = m.getName() === 'cat_eye' ? m.getBaseColorTexture() : null;
  if (!t || t.getName().startsWith('eye_')) continue;
  const users = t.listParents().filter((x) => x.propertyType === 'Material');
  if (users.every((u) => u.getName() === 'cat_eye')) t.setName('eye_' + (t.getName() || 'tex'));
}
const steps = [dedup(), prune({ keepAttributes: false, keepLeaves: true }), resample({ tolerance: 1e-4 })];
if (opt.simplify) steps.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Number(opt.simplify), error: Number(opt.error ?? 0.0006), lockBorder: true }));
const S = Number(opt.tex ?? 1024);
const Q = Number(opt.quality ?? 86);
steps.push(
  prune({ keepAttributes: false, keepLeaves: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /^eye_/, quality: 90, effort: 100, resize: [256, 256] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^occlusion/, quality: Q, effort: 100, resize: [512, 512] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /^(?!eye_)/, slots: /^(baseColor|normal)/, quality: Q, effort: 100, resize: [S, S] }),
  prune({ keepAttributes: false, keepLeaves: true }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }),
);
await doc.transform(...steps);
for (const t of root.listTextures()) console.log('texture', t.getName(), t.getMimeType(), t.getSize(), (t.getImage()?.byteLength / 1024).toFixed(1) + ' Ko');
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { tris += (p.getIndices()?.getCount() ?? 0) / 3; console.log('prim', p.getMaterial()?.getName(), p.getAttribute('POSITION').getCount(), 'sommets', (p.getIndices()?.getCount() ?? 0) / 3, 'triangles'); }
console.log('triangles', tris, 'clips', root.listAnimations().map((a) => `${a.getName()}(${a.listChannels().length})`).join(' '));
await io.write(out, doc);
console.log('écrit', out, (fs.statSync(out).size / 1024).toFixed(0), 'Ko');

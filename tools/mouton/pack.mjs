// Compression du mouton du jeu : node pack.mjs <brut.glb> <sortie.glb> --report <rapport.json> [--measures <mesures.json>]
// [--tex 1024] [--quality 84]. D'après le pack.mjs des lapins :
// - canaux d'animation inutiles retirés (échelles, poids des cibles de forme ; translations et rotations restées au repos
//   sur tout un clip) : il ne reste de translation qu'à l'os racine (make_sheep.py n'en écrit pas d'autres ; une
//   translation d'un autre os est retirée et signalée : un os qui se déplace s'étire) ;
// - clés ré-échantillonnées (celles qu'une interpolation linéaire redonne sont retirées) ;
// - matières renommées (sheep_wool, sheep_horn, sheep_eye) ; carte métal/rugosité retirée ;
// - cible de forme « shorn » et attributs de sommet _WOOL, _HEAD, _LEG, _HOOF gardés (prune sans keepAttributes les
//   aurait retirés : aucune matière ne s'en sert) ;
// - nœud « horns » (cornes en option) marqué extras.optional ;
// - textures en WebP, maillage quantifié et compressé (meshopt). Noms des os et des clips gardés ;
// - mesures du rapport de make_sheep.py rangées dans la scène (extras.sheep).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';

const [inp, out, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(inp);
const root = doc.getRoot();
if (opt.report) {
  const rep = JSON.parse(fs.readFileSync(opt.report, 'utf8'));
  root.listScenes()[0].setExtras({ sheep: {
    naturalSpeeds: rep.naturalSpeeds, hipHeight: rep.hipHeight, withers: rep.withers, lieDrop: rep.lieDrop,
    wool: rep.wool, horns: rep.horns || null, groundFix: rep.groundFix, eatMuzzle: rep.eatMuzzle, grazeMuzzle: rep.grazeMuzzle,
    measures: opt.measures ? JSON.parse(fs.readFileSync(opt.measures, 'utf8')) : null,
    morphs: { shorn: '0 = toison pleine (modèle), 1 = tondu ; négatif (jusqu’à −0,6) = toison plus épaisse' },
    attributes: { _WOOL: 'toison (1) / peau nue (0)', _HEAD: 'tête', _LEG: 'bas des membres', _HOOF: 'onglons' },
  } });
}
const TOL_T = 0.0003; // m
const TOL_R = 0.002; // rad
let removed = 0;
let kept = 0;
const transKept = new Set();
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
      if (!drop && path === 'translation' && node.getName() !== 'root') {
        console.warn(`translation retirée : ${anim.getName()} / ${node.getName()} (${(dev * 1000).toFixed(2)} mm)`);
        drop = true;
      }
      if (!drop && path === 'translation') transKept.add(node.getName());
    }
    if (drop) {
      const s = ch.getSampler();
      ch.dispose();
      if (!s.listParents().some((p) => p.propertyType === 'AnimationChannel')) s.dispose();
      removed++;
    } else kept++;
  }
}
console.log(`canaux : ${kept} gardés, ${removed} retirés ; translations animées : ${[...transKept].join(', ') || 'aucune'}`);
for (const m of root.listMaterials()) {
  const n = m.getName();
  const kind = /horn/i.test(n) ? 'sheep_horn' : /eye/i.test(n) ? 'sheep_eye' : 'sheep_wool';
  m.setName(kind);
  if (m.getMetallicRoughnessTexture()) m.setMetallicRoughnessTexture(null);
  m.setMetallicFactor(0);
  m.setRoughnessFactor(kind === 'sheep_eye' ? 0.15 : kind === 'sheep_horn' ? 0.55 : 0.9);
}
// (extensions de matière héritées de l'export Sketchfab : IOR, spéculaire — inutiles pour une toison)
for (const ext of root.listExtensionsUsed()) {
  if (['KHR_materials_ior', 'KHR_materials_specular'].includes(ext.extensionName)) ext.dispose();
}
for (const n of root.listNodes()) {
  if (n.getName() === 'horns') n.setExtras({ optional: true, defaultVisible: false, note: 'cornes de bélier en option : le jeu les affiche pour les races cornues et les met à l’échelle' });
}
const S = Number(opt.tex ?? 1024);
const Q = Number(opt.quality ?? 86);
await doc.transform(
  dedup(),
  prune({ keepAttributes: true, keepLeaves: true }),
  resample({ tolerance: 1e-4 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^occlusion/, quality: Q, effort: 100, resize: [512, 512] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(baseColor|normal)/, quality: Q, effort: 100, resize: [S, S] }),
  prune({ keepAttributes: true, keepLeaves: true }),
  // (un seul volume de quantification pour tous les maillages : ils partagent le même squelette)
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }),
);
for (const t of root.listTextures()) console.log('texture', t.getName(), t.getMimeType(), t.getSize(), (t.getImage()?.byteLength / 1024).toFixed(1) + ' Ko');
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  tris += (p.getIndices()?.getCount() ?? 0) / 3;
  console.log('prim', m.getName(), p.getMaterial()?.getName(), p.getAttribute('POSITION').getCount(), 'sommets', (p.getIndices()?.getCount() ?? 0) / 3, 'triangles',
    'attributs', p.listSemantics().join(','), 'cibles', p.listTargets().length);
}
console.log('triangles', tris, 'clips', root.listAnimations().map((a) => `${a.getName()}(${a.listChannels().length})`).join(' '));
await io.write(out, doc);
console.log('écrit', out, (fs.statSync(out).size / 1024).toFixed(0), 'Ko');

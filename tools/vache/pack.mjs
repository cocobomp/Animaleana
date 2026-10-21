// Compression de la vache ou du taureau du jeu : node pack.mjs <brut.glb> <sortie.glb> --kind cow|bull
// --report <rapport.json> [--measures <mesures.json>] [--color <grain.png>] [--mask <masque.png>] [--texinfo <grain.json>]
// [--tex 1024] [--quality 84]. Repris de tools/chevre/pack.mjs :
// - canaux d'animation inutiles retirés (échelles, poids des cibles de forme ; translations et rotations restées au repos
//   sur tout un clip) : il ne reste de translation qu'à l'os racine (une translation d'un autre os est retirée et
//   signalée : un os qui se déplace s'étire) ;
// - clés ré-échantillonnées (celles qu'une interpolation linéaire redonne sont retirées) ;
// - matières renommées cow_coat (robe) et cow_eye (yeux de la vache) ; carte métal/rugosité retirée ;
// - photo de la robe remplacée par la carte « grain » de tex.mjs (robe sans ses taches ni ses ombres) et masque de la robe
//   (taches, peau, couleurs gardées) rangé dans l'emplacement « occlusion » de la matière de la robe (le jeu le lit comme
//   masque, jamais comme occlusion) ;
// - cible de forme « horns_long » du taureau gardée (cornes longues en lyre) ;
// - textures en WebP, maillage quantifié et compressé (meshopt). Noms des os et des clips gardés ;
// - mesures du rapport de Blender rangées dans la scène (extras.cow).
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';

const [inp, out, ...rest] = process.argv.slice(2);
const opt = {};
for (let i = 0; i < rest.length; i += 2) opt[rest[i].replace(/^--/, '')] = rest[i + 1];
const KIND = opt.kind ?? 'cow';
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(inp);
const root = doc.getRoot();
if (opt.report) {
  const rep = JSON.parse(fs.readFileSync(opt.report, 'utf8'));
  const clips = {};
  for (const [k, v] of Object.entries(rep.clips || {})) {
    if (typeof v === 'string') clips[k] = { note: v };
    else clips[k] = { seconds: v.seconds, loop: v.loop !== false, ...(v.note ? { note: v.note } : {}) };
  }
  root.listScenes()[0].setExtras({ cow: {
    kind: KIND,
    source: KIND === 'bull' ? 'Bull_Brown_01 (Microsoft Rocketbox Avatar Library, MIT)' : 'Lyndon Daniels, Realtime Rancher’s 3D Model Pack (CC0 1.0)',
    withers: rep.withers, withersMeasured: rep.withersMeasured, hipHeight: rep.hipHeight, shoulder: rep.shoulderJoint ?? rep.shoulder, hip: rep.hipJoint ?? rep.hip,
    naturalSpeeds: rep.naturalSpeeds, eatMuzzle: rep.eatMuzzle, grazeMuzzle: rep.grazeMuzzle, suckleMuzzle: rep.suckleMuzzle, udder: rep.udder,
    lieDrop: rep.lieDrop, groundFix: rep.groundFix, partBones: rep.partBones, clips,
    ...(opt.texinfo ? JSON.parse(fs.readFileSync(opt.texinfo, 'utf8')) : {}),
    measures: opt.measures ? JSON.parse(fs.readFileSync(opt.measures, 'utf8')) : null,
    textures: { map: 'grain de la robe (gris neutre 0,5 linéaire) ; bouche, cils et yeux peints gardés', occlusion: 'masque de la robe : R taches, G peau rose, B couleurs gardées' },
    ...(KIND === 'bull' ? { morphs: { horns_long: '0 = cornes courtes du taureau, 1 = longues cornes en lyre' } } : {}),
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
// (attributs inutiles du jeu : couleurs de sommets de l'export)
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) {
  for (const sem of p.listSemantics()) if (/^COLOR_/.test(sem)) p.setAttribute(sem, null);
}
let coat = null;
for (const m of root.listMaterials()) {
  const eye = /eye/i.test(m.getName());
  m.setName(eye ? 'cow_eye' : 'cow_coat');
  if (!eye) coat = m;
  if (m.getMetallicRoughnessTexture()) m.setMetallicRoughnessTexture(null);
  m.setMetallicFactor(0);
  m.setRoughnessFactor(eye ? 0.25 : 0.85);
}
const png = async (file) => {
  const buf = fs.readFileSync(file);
  return new Uint8Array(buf);
};
if (opt.color && coat) {
  const t = coat.getBaseColorTexture();
  t.setImage(await png(opt.color)).setMimeType('image/png').setName(`${KIND}_grain`);
}
if (opt.mask && coat) {
  const t = doc.createTexture(`${KIND}_mask`).setImage(await png(opt.mask)).setMimeType('image/png');
  coat.setOcclusionTexture(t);
  coat.setOcclusionStrength(0);
  coat.getOcclusionTextureInfo().setTexCoord(0);
}
for (const ext of root.listExtensionsUsed()) {
  if (['KHR_materials_ior', 'KHR_materials_specular'].includes(ext.extensionName)) ext.dispose();
}
const S = Number(opt.tex ?? 1024);
const Q = Number(opt.quality ?? 84);
await doc.transform(
  dedup(),
  prune({ keepAttributes: true, keepLeaves: true }),
  resample({ tolerance: 1e-4 }),
  // (masque : 512, presque sans perte — ses bords décident des taches)
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^occlusion/, quality: 92, effort: 100, resize: [512, 512] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^(baseColor|normal)/, quality: Q, effort: 100, resize: [S, S] }),
  prune({ keepAttributes: true, keepLeaves: true }),
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

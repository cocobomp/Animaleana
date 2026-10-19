// Compression d'un chien pour le jeu : node pack.mjs <brut.glb> <sortie.glb> [--simplify 0.55] [--tex 1024]
// - canaux d'animation inutiles retirés : échelles (toujours 1), translations et rotations qui restent celles du
//   repos dans tout un clip (le mixeur du jeu revient au repos pour un os qu'un clip n'anime pas) ;
// - clés ré-échantillonnées (celles qu'une interpolation linéaire redonne sont retirées) ;
// - matières renommées (dog_coat, dog_eye) ; carte métal/rugosité du shiba retirée (pelage : ni métal, rugosité fixe) ;
// - maillage du shiba allégé (--simplify : part des triangles gardés, coutures d'UV respectées) ;
// - textures en WebP, maillage quantifié et compressé (meshopt). Noms des os et des clips gardés.
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
// Mesures du rapport de make_dog.py gardées dans la scène (extras : gltf.scene.userData.dog dans le jeu) :
// vitesses naturelles des allures (m/s, chien de taille 1), hauteur des hanches.
if (opt.report) {
  const rep = JSON.parse(fs.readFileSync(opt.report, 'utf8'));
  root.listScenes()[0].setExtras({ dog: { naturalSpeeds: rep.naturalSpeeds, hipHeight: rep.hipHeight, shoulder: rep.shoulderJoint } });
}

// ---- canaux inutiles
const TOL_T = 0.0005; // m
const TOL_R = 0.002; // rad
let removed = 0;
let kept = 0;
const keptT = new Map();
for (const anim of root.listAnimations()) {
  for (const ch of anim.listChannels()) {
    const node = ch.getTargetNode();
    const path = ch.getTargetPath();
    const out = ch.getSampler().getOutput();
    let drop = path === 'scale' || path === 'weights';
    if (!drop && node) {
      const ref = path === 'translation' ? node.getTranslation() : node.getRotation();
      const el = [];
      let dev = 0;
      for (let i = 0; i < out.getCount(); i++) {
        out.getElement(i, el);
        if (path === 'translation') {
          dev = Math.max(dev, Math.hypot(el[0] - ref[0], el[1] - ref[1], el[2] - ref[2]));
        } else {
          const d = Math.abs(el[0] * ref[0] + el[1] * ref[1] + el[2] * ref[2] + el[3] * ref[3]);
          dev = Math.max(dev, 2 * Math.acos(Math.min(1, d)));
        }
      }
      drop = dev < (path === 'translation' ? TOL_T : TOL_R);
      if (!drop && path === 'translation') keptT.set(node.getName(), Math.max(keptT.get(node.getName()) ?? 0, dev));
    }
    if (drop) {
      const s = ch.getSampler();
      ch.dispose();
      if (!s.listParents().some((p) => p.propertyType === 'AnimationChannel')) s.dispose();
      removed++;
    } else kept++;
  }
}
console.log(`canaux : ${kept} gardés, ${removed} retirés ; translations gardées :`, Object.fromEntries([...keptT].map(([k, v]) => [k, +v.toFixed(4)])));

// ---- matières
for (const m of root.listMaterials()) {
  const n = m.getName();
  m.setName(/eye/i.test(n) ? 'dog_eye' : 'dog_coat');
  const mr = m.getMetallicRoughnessTexture();
  if (mr) m.setMetallicRoughnessTexture(null);
  m.setMetallicFactor(0);
  m.setRoughnessFactor(/eye/i.test(n) ? 0.15 : 0.8);
}

const steps = [dedup(), prune({ keepAttributes: false, keepLeaves: true }), resample({ tolerance: 1e-4 })];
if (opt.simplify) {
  steps.push(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: Number(opt.simplify), error: Number(opt.error ?? 0.0008), lockBorder: true }));
}
const S = Number(opt.tex ?? 1024);
steps.push(
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^baseColor/, quality: Number(opt.quality ?? 86), effort: 100, resize: [S, S] }),
  prune({ keepAttributes: false, keepLeaves: true }),
  // (un seul volume de quantification pour tous les maillages : ils partagent le même squelette, donc les mêmes
  // matrices de liaison inverses ; sinon les yeux du jack, plus petits, se retrouvaient géants au milieu du corps)
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }),
);
await doc.transform(...steps);
for (const t of root.listTextures()) console.log('texture', t.getName(), t.getMimeType(), t.getSize(), (t.getImage()?.byteLength / 1024).toFixed(1) + ' Ko');
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) console.log('prim', p.getMaterial()?.getName(), p.getAttribute('POSITION').getCount(), 'sommets', (p.getIndices()?.getCount() ?? 0) / 3, 'triangles');
console.log('clips', root.listAnimations().map((a) => `${a.getName()}(${a.listChannels().length})`).join(' '));
await io.write(out, doc);

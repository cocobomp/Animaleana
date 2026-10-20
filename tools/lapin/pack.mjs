// Compression d'un lapin du jeu : node pack.mjs <brut.glb> <sortie.glb> --report <rapport.json> [--tex 1024] [--quality 84]
// D'après tools/chat/pack.mjs :
// - canaux d'animation inutiles retirés (échelles ; translations et rotations restées au repos sur tout un clip) : il ne
//   reste des translations qu'à l'os racine (make_rabbit.py n'en écrit pas d'autres : aucun os ne s'étire) ;
// - clés ré-échantillonnées (celles qu'une interpolation linéaire redonne sont retirées) ;
// - matières renommées (rabbit_coat, rabbit_eye) ; carte métal/rugosité retirée (pelage : ni métal, rugosité fixe) ;
//   yeux : couleur seule en 256 (le jeu recolore l'iris) ;
// - textures en WebP, maillage quantifié et compressé (meshopt). Noms des os et des clips gardés.
// - mesures du rapport de make_rabbit.py rangées dans la scène (extras.rabbit : vitesses naturelles, hanches, sol…).
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
  root.listScenes()[0].setExtras({ rabbit: { naturalSpeeds: rep.naturalSpeeds, restHip: rep.restHip, restShoulder: rep.restShoulder,
    earRest: rep.earRest, groundFix: rep.groundFix, slipCm: rep.slipCm } });
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
  const eye = /eye/i.test(n);
  m.setName(eye ? 'rabbit_eye' : 'rabbit_coat');
  if (m.getMetallicRoughnessTexture()) m.setMetallicRoughnessTexture(null);
  m.setMetallicFactor(0);
  m.setRoughnessFactor(eye ? 0.12 : 0.85);
  if (eye) {
    m.setNormalTexture(null);
    m.setOcclusionTexture(null);
  }
}
for (const m of root.listMaterials()) {
  const t = m.getName() === 'rabbit_eye' ? m.getBaseColorTexture() : null;
  if (!t || t.getName().startsWith('eye_')) continue;
  const users = t.listParents().filter((x) => x.propertyType === 'Material');
  if (users.every((u) => u.getName() === 'rabbit_eye')) t.setName('eye_' + (t.getName() || 'tex'));
}
const S = Number(opt.tex ?? 1024);
const Q = Number(opt.quality ?? 86);
await doc.transform(
  dedup(),
  prune({ keepAttributes: false, keepLeaves: true }),
  resample({ tolerance: 1e-4 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /^eye_/, quality: 90, effort: 100, resize: [256, 256] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^occlusion/, quality: Q, effort: 100, resize: [512, 512] }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /^(?!eye_)/, slots: /^(baseColor|normal)/, quality: Q, effort: 100, resize: [S, S] }),
  prune({ keepAttributes: false, keepLeaves: true }),
  // (un seul volume de quantification pour tous les maillages : ils partagent le même squelette)
  meshopt({ encoder: MeshoptEncoder, level: 'medium', quantizationVolume: 'scene' }),
);
for (const t of root.listTextures()) console.log('texture', t.getName(), t.getMimeType(), t.getSize(), (t.getImage()?.byteLength / 1024).toFixed(1) + ' Ko');
let tris = 0;
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) { tris += (p.getIndices()?.getCount() ?? 0) / 3; console.log('prim', p.getMaterial()?.getName(), p.getAttribute('POSITION').getCount(), 'sommets', (p.getIndices()?.getCount() ?? 0) / 3, 'triangles'); }
console.log('triangles', tris, 'clips', root.listAnimations().map((a) => `${a.getName()}(${a.listChannels().length})`).join(' '));
await io.write(out, doc);
console.log('écrit', out, (fs.statSync(out).size / 1024).toFixed(0), 'Ko');

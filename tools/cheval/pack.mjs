// Compression du cheval pour le jeu : node pack.mjs <brut.glb> <sortie.glb>
// Animations ré-échantillonnées (clés inutiles retirées), textures en WebP (modelé de la robe 1024,
// relief 1024 / 512), maillage quantifié et compressé (meshopt). Noms des nœuds et des clips gardés.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, resample, textureCompress, meshopt } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const [inp, out] = process.argv.slice(2);
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(inp);
const root = doc.getRoot();
for (const t of root.listTextures()) console.log('texture', t.getName(), t.getMimeType(), t.getSize());
await doc.transform(
  dedup(),
  prune({ keepAttributes: true, keepLeaves: true }),
  resample({ tolerance: 2e-4 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /body/, slots: /^baseColor/, quality: 90, effort: 100 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /hair/, slots: /^baseColor/, quality: 80, effort: 100 }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', slots: /^normal/, quality: 82, effort: 100 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
for (const t of root.listTextures()) console.log('->', t.getName(), t.getMimeType(), t.getSize(), (t.getImage()?.byteLength / 1024).toFixed(1) + ' Ko');
for (const a of root.listAnimations()) console.log('clip', a.getName(), a.listChannels().length);
for (const m of root.listMeshes()) for (const p of m.listPrimitives()) console.log('prim', p.getMaterial()?.getName(), p.listSemantics().join(','));
await io.write(out, doc);

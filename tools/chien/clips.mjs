// Clips refaits greffés sur un GLB du jeu, sans toucher à son maillage :
//   node clips.mjs <jeu.glb> <refait.glb> <sortie.glb> <clip1,clip2,…>
// (refait.glb : sortie de build.sh — make_dog.py, pack.mjs, lod.mjs — refaite avec les mêmes sources). Les clips nommés
// de jeu.glb sont remplacés par ceux de refait.glb (mêmes os, retrouvés par leur nom) ; maillage, squelette, textures,
// version réduite et autres clips de jeu.glb gardés tels quels (données non re-quantifiées, comme lod.mjs).
// Pourquoi : le maillage du shiba refait aujourd'hui n'est pas celui du dépôt (la simplification ne redonne pas les
// mêmes triangles : 10 743 sommets au lieu de 10 795) ; refaire un clip ne doit pas changer la peau des 20 races.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';

const [baseGlb, srcGlb, out, list] = process.argv.slice(2);
if (!list) {
  console.error('node clips.mjs <jeu.glb> <refait.glb> <sortie.glb> <clip1,clip2,…>');
  process.exit(1);
}
const names = list.split(',').filter(Boolean);
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(baseGlb);
const src = await io.read(srcGlb);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const nodes = new Map(root.listNodes().map((n) => [n.getName(), n]));
const copy = (a) => doc.createAccessor(a.getName())
  .setType(a.getType())
  .setArray(a.getArray().slice())
  .setNormalized(a.getNormalized())
  .setBuffer(buffer);
for (const name of names) {
  const from = src.getRoot().listAnimations().find((a) => a.getName() === name);
  if (!from) throw new Error(`clip absent de ${srcGlb} : ${name}`);
  // (ancien clip retiré avec ses accesseurs, s'ils ne servent à rien d'autre)
  for (const old of root.listAnimations().filter((a) => a.getName() === name)) {
    const accs = new Set(old.listSamplers().flatMap((s) => [s.getInput(), s.getOutput()]).filter(Boolean));
    for (const s of old.listSamplers()) s.dispose();
    for (const c of old.listChannels()) c.dispose();
    old.dispose();
    for (const a of accs) if (a.listParents().every((p) => p === root)) a.dispose();
  }
  const anim = doc.createAnimation(name);
  for (const ch of from.listChannels()) {
    const target = ch.getTargetNode();
    const node = target && nodes.get(target.getName());
    if (!node) throw new Error(`os absent de ${baseGlb} : ${target?.getName()} (clip ${name})`);
    const s0 = ch.getSampler();
    const s = doc.createAnimationSampler()
      .setInput(copy(s0.getInput()))
      .setOutput(copy(s0.getOutput()))
      .setInterpolation(s0.getInterpolation());
    anim.addSampler(s).addChannel(doc.createAnimationChannel().setTargetNode(node).setTargetPath(ch.getTargetPath()).setSampler(s));
  }
  console.log(`clip ${name} : ${from.listChannels().length} canaux greffés`);
}
await io.write(out, doc);

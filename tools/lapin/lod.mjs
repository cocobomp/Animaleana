// Version réduite (LOD) d'un lapin (repris de tools/chat/lod.mjs) : node lod.mjs <entrée.glb> <sortie.glb> [part gardée, 0,3 par défaut]
// (après pack.mjs ; refaisable sur sa sortie). Pour chaque primitive, un index simplifié par meshoptimizer
// (fusion d'arêtes : il ne reprend que des sommets existants), rangé dans un nœud « rabbit_lod » (extras.lod) dont les
// primitives partagent les attributs de la primitive d'origine : dans le jeu, la version réduite d'une race n'est
// qu'un autre index sur la même géométrie déformée (src/game/models/rabbitReal.js). Données non re-quantifiées.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';

const [inp, out, keepArg = '0.3'] = process.argv.slice(2);
const KEEP = Number(keepArg);
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(inp);
const root = doc.getRoot();
for (const n of root.listNodes()) {
  if (n.getName() !== 'rabbit_lod') continue;
  const m = n.getMesh();
  n.dispose();
  for (const p of m?.listPrimitives() ?? []) p.getIndices()?.dispose();
  m?.dispose();
}
const srcs = root.listNodes().filter((n) => n.getMesh() && n.getSkin());
const buffer = root.listBuffers()[0];
const read = (acc, n) => {
  const a = new Float32Array(acc.getCount() * n);
  const e = [];
  for (let i = 0; i < acc.getCount(); i++) a.set(acc.getElement(i, e), i * n);
  return a;
};
const lodMesh = doc.createMesh('rabbit_lod').setExtras({ lod: true });
let before = 0;
let after = 0;
for (const src of srcs) {
  for (const prim of src.getMesh().listPrimitives()) {
    const mat = prim.getMaterial()?.getName();
    const eye = mat === 'rabbit_eye';
    const idx = Uint32Array.from(prim.getIndices().getArray());
    const pos = read(prim.getAttribute('POSITION'), 3);
    const nrm = read(prim.getAttribute('NORMAL'), 3);
    // (yeux sans texture : pas d'UV)
    const uvA = prim.getAttribute('TEXCOORD_0');
    const uv = uvA ? read(uvA, 2) : new Float32Array((pos.length / 3) * 2);
    const n = pos.length / 3;
    const attr = new Float32Array(n * 5);
    for (let i = 0; i < n; i++) attr.set([nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2], uv[i * 2], uv[i * 2 + 1]], i * 5);
    const target = Math.floor((idx.length * (eye ? 0.25 : KEEP)) / 3) * 3;
    const [lod, err] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attr, 5, [0.5, 0.5, 0.5, 2, 2], null, target, eye ? 0.03 : 0.012, []);
    before += idx.length / 3;
    after += lod.length / 3;
    console.log(`${mat} : ${idx.length / 3} -> ${lod.length / 3} triangles (écart ${(err * 100).toFixed(2)} %)`);
    const ia = doc.createAccessor(`${mat}_lod`).setType('SCALAR').setArray(n < 65536 ? Uint16Array.from(lod) : lod).setBuffer(buffer);
    const p = doc.createPrimitive().setMaterial(prim.getMaterial()).setMode(prim.getMode()).setIndices(ia);
    for (const sem of prim.listSemantics()) p.setAttribute(sem, prim.getAttribute(sem));
    lodMesh.addPrimitive(p);
  }
}
console.log(`total : ${before} -> ${after} triangles`);
const src = srcs[0];
const node = doc.createNode('rabbit_lod').setMesh(lodMesh).setSkin(src.getSkin())
  .setTranslation(src.getTranslation()).setRotation(src.getRotation()).setScale(src.getScale());
const parent = src.getParentNode();
if (parent) parent.addChild(node);
else for (const s of root.listScenes()) if (s.listChildren().includes(src)) s.addChild(node);
await io.write(out, doc);

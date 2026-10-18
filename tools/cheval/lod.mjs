// Version allégée du cheval : node lod.mjs <entrée.glb> <sortie.glb> (après pack.mjs ; refaisable sur sa sortie).
//
// 1. Maillage réduit (LOD) : pour chaque primitive (robe, yeux, crins), un index simplifié par meshoptimizer
//    (fusion d'arêtes : il ne reprend que des sommets existants). Il est rangé dans un nœud « horse_lod »
//    (extras.lod) dont les primitives partagent les attributs de la primitive d'origine (positions, poids de la
//    peau, UV, AO) : dans le jeu, la version réduite d'une race n'est qu'un autre index sur la même géométrie
//    déformée (src/game/models/horseReal.js : shapeFor, chooseLod). Rien de plus à charger que ces index.
// 2. Carte des crins (horse_hair_detail) ramenée à 512² comme sa carte de relief : elle pesait plus lourd
//    que la robe (1024², ≈ 360 Ko en WebP) pour des mèches qui n'ont pas besoin de cette finesse.
//
// Les données du fichier ne sont pas re-quantifiées ni réordonnées (encodage meshopt sans filtre) : la
// géométrie et les allures restent identiques au bit près.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [inp, out] = process.argv.slice(2);
// Part des triangles gardés par matière (et erreur permise, relative à la taille du maillage). La robe
// garde sa silhouette (pas de bords ouverts ; les coutures d'UV sont respectées par meshoptimizer) ; les
// yeux sont de petites sphères ; les crins sont des cartes alpha (bandes) : on n'y retire que des points le
// long des mèches, les UV pèsent lourd pour que la texture ne glisse pas.
const PLAN = {
  horse_coat: { keep: 0.42, error: 0.012, attr: [0.6, 0.6, 0.6, 2, 2] },
  horse_eye: { keep: 0.2, error: 0.02, attr: [0.3, 0.3, 0.3, 1, 1] },
  horse_mane: { keep: 0.5, error: 0.012, attr: [0.3, 0.3, 0.3, 6, 6] },
};

await MeshoptEncoder.ready;
await MeshoptDecoder.ready;
await MeshoptSimplifier.ready;
MeshoptSimplifier.useExperimentalFeatures = true;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
  'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder,
});
const doc = await io.read(inp);
const root = doc.getRoot();

// (sortie d'un passage précédent : on refait les index)
for (const n of root.listNodes()) {
  if (n.getName() !== 'horse_lod') continue;
  const m = n.getMesh();
  n.dispose();
  for (const p of m?.listPrimitives() ?? []) p.getIndices()?.dispose();
  m?.dispose();
}

const src = root.listNodes().find((n) => n.getMesh() && n.getSkin());
if (!src) throw new Error('pas de maillage lié au squelette');
const mesh = src.getMesh();
const lodMesh = doc.createMesh('horse_lod').setExtras({ lod: true });
const buffer = root.listBuffers()[0];
const read = (acc, n) => {
  const a = new Float32Array(acc.getCount() * n);
  const e = [];
  for (let i = 0; i < acc.getCount(); i++) a.set(acc.getElement(i, e), i * n);
  return a;
};
let before = 0;
let after = 0;
for (const prim of mesh.listPrimitives()) {
  const mat = prim.getMaterial()?.getName();
  const plan = PLAN[mat];
  if (!plan) throw new Error(`matière inattendue : ${mat}`);
  const idx = Uint32Array.from(prim.getIndices().getArray());
  const pos = read(prim.getAttribute('POSITION'), 3);
  const nrm = read(prim.getAttribute('NORMAL'), 3);
  const uv = read(prim.getAttribute('TEXCOORD_0'), 2);
  const n = pos.length / 3;
  const attr = new Float32Array(n * 5);
  for (let i = 0; i < n; i++) attr.set([nrm[i * 3], nrm[i * 3 + 1], nrm[i * 3 + 2], uv[i * 2], uv[i * 2 + 1]], i * 5);
  const target = Math.floor((idx.length * plan.keep) / 3) * 3;
  const [lod, err] = MeshoptSimplifier.simplifyWithAttributes(idx, pos, 3, attr, 5, plan.attr, null, target, plan.error, []);
  before += idx.length / 3;
  after += lod.length / 3;
  // (erreur relative à la taille de la primitive : les positions du fichier sont quantifiées, en unités du fichier)
  console.log(`${mat} : ${idx.length / 3} -> ${lod.length / 3} triangles (écart ${(err * 100).toFixed(2)} % de sa taille, cible ${target / 3})`);
  const ia = doc.createAccessor(`${mat}_lod`).setType('SCALAR').setArray(n < 65536 ? Uint16Array.from(lod) : lod).setBuffer(buffer);
  const p = doc.createPrimitive().setMaterial(prim.getMaterial()).setMode(prim.getMode()).setIndices(ia);
  for (const sem of prim.listSemantics()) p.setAttribute(sem, prim.getAttribute(sem));
  lodMesh.addPrimitive(p);
}
console.log(`total : ${before} -> ${after} triangles`);
const node = doc.createNode('horse_lod').setMesh(lodMesh).setSkin(src.getSkin())
  .setTranslation(src.getTranslation()).setRotation(src.getRotation()).setScale(src.getScale());
const parent = src.getParentNode();
if (parent) parent.addChild(node);
else for (const s of root.listScenes()) if (s.listChildren().includes(src)) s.addChild(node);

for (const t of root.listTextures()) console.log('texture', t.getName(), t.getSize(), (t.getImage().byteLength / 1024).toFixed(1) + ' Ko');
// (déjà en 512² : sortie d'un passage précédent, on ne la recompresse pas)
if (root.listTextures().some((t) => /hair_detail/.test(t.getName()) && Math.max(...(t.getSize() ?? [0])) > 512)) {
  await doc.transform(
    textureCompress({ encoder: sharp, targetFormat: 'webp', pattern: /hair_detail/, resize: [512, 512], quality: 80, effort: 100 }),
  );
}
for (const t of root.listTextures()) console.log('->', t.getName(), t.getSize(), (t.getImage().byteLength / 1024).toFixed(1) + ' Ko');
await io.write(out, doc);

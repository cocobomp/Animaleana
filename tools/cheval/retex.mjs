// Remplace une image du GLB brut (horse_raw.glb, sortie de anim2.py) sans refaire les allures :
// node retex.mjs <brut.glb> <nom de la texture> <image.png> <sortie.glb>
// Exemple : le modelé de la robe refait par prep2.py (work/tex/horse_body_detail.png), puis pack.mjs.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import fs from 'node:fs';

const [inp, name, png, out] = process.argv.slice(2);
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(inp);
const tex = doc.getRoot().listTextures().find((t) => t.getName() === name);
if (!tex) throw new Error(`texture ${name} absente (${doc.getRoot().listTextures().map((t) => t.getName()).join(', ')})`);
console.log('remplace', name, tex.getMimeType(), tex.getSize(), '->', png);
tex.setImage(new Uint8Array(fs.readFileSync(png))).setMimeType('image/png');
await io.write(out, doc);
console.log('écrit', out);

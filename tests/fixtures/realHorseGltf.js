// Le GLB du cheval réaliste chargé dans node (tests) : sans ses textures (le décodage des images WebP
// demande un navigateur), avec la géométrie, le squelette et les allures. Un faux document suffit
// pour l'ombre de contact (une toile 2D jamais affichée).
import fs from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

const FILE = new URL('../../public/models/horse_real.glb', import.meta.url);

/** GLB sans textures (images, échantillonneurs, cartes des matières). */
function withoutTextures(buf) {
  const jlen = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jlen).toString('utf8'));
  delete json.textures;
  delete json.images;
  delete json.samplers;
  for (const m of json.materials ?? []) {
    delete m.normalTexture;
    delete m.occlusionTexture;
    delete m.emissiveTexture;
    if (m.pbrMetallicRoughness) {
      delete m.pbrMetallicRoughness.baseColorTexture;
      delete m.pbrMetallicRoughness.metallicRoughnessTexture;
    }
  }
  for (const k of ['extensionsUsed', 'extensionsRequired']) {
    if (json[k]) json[k] = json[k].filter((e) => e !== 'EXT_texture_webp');
  }
  let js = Buffer.from(JSON.stringify(json), 'utf8');
  js = Buffer.concat([js, Buffer.alloc((4 - (js.length % 4)) % 4, 0x20)]);
  const rest = buf.subarray(20 + jlen);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0);
  head.writeUInt32LE(2, 4);
  head.writeUInt32LE(20 + js.length + rest.length, 8);
  head.writeUInt32LE(js.length, 12);
  head.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([head, js, rest]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

let cached = null;

/** Le GLB chargé (une fois). */
export function loadRealHorseGltf() {
  if (!globalThis.document) {
    const ctx = { createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: '' };
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  }
  if (cached) return cached;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  cached = new Promise((resolve, reject) => loader.parse(withoutTextures(fs.readFileSync(FILE)), '', resolve, reject));
  return cached;
}

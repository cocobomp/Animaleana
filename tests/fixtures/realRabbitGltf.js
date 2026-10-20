// Les GLB des lapins réalistes chargés dans node (tests) : sans leurs textures (le décodage des images WebP
// demande un navigateur), avec la géométrie, le squelette et les clips. Un faux document suffit pour l'ombre de
// contact (une toile 2D jamais affichée). Même méthode que realHorseGltf.js.
import fs from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

export const RABBIT_FILES = {
  up: new URL('../../public/models/rabbit.glb', import.meta.url),
  lop: new URL('../../public/models/rabbit_lop.glb', import.meta.url),
};

/** Le JSON d'un GLB (premier bloc). */
export function glbJson(buf) {
  const jlen = buf.readUInt32LE(12);
  return JSON.parse(buf.subarray(20, 20 + jlen).toString('utf8'));
}

/** GLB sans textures (images, échantillonneurs, cartes des matières). */
function withoutTextures(buf) {
  const jlen = buf.readUInt32LE(12);
  const json = glbJson(buf);
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

const cached = {};

/** Le GLB d'un des deux lapins ('up' : Dakota.Hinkle, 'lop' : bélier de FourthGreen), chargé une fois. */
export function loadRealRabbitGltf(kind) {
  if (!globalThis.document) {
    // (toile 2D muette : toute méthode existe et ne fait rien ; les dégradés acceptent leurs couleurs)
    const ctx = new Proxy({}, {
      // (getImageData : un tampon de pixels, pour le lapin procédural de repli qui peint ses robes pixel par pixel)
      get: (o, k) => (k in o ? o[k] : k === 'getImageData' || k === 'createImageData'
        ? (x, y, w = 1, h = 1) => ({ data: new Uint8ClampedArray(Math.max(4, (w | 0) * (h | 0) * 4)), width: w, height: h })
        : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}),
      set: (o, k, v) => { o[k] = v; return true; },
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  }
  if (cached[kind]) return cached[kind];
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  cached[kind] = new Promise((resolve, reject) => loader.parse(withoutTextures(fs.readFileSync(RABBIT_FILES[kind])), '', resolve, reject));
  return cached[kind];
}

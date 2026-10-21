// Le GLB de la chèvre réaliste chargé dans node (tests) : sans ses textures (le décodage des images WebP demande un
// navigateur), avec la géométrie, le squelette, la cible de forme des cornes et les clips. Même méthode que le mouton
// (realSheepGltf.js : faux document pour l'ombre de contact).
import fs from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { withoutTextures, loadRealSheepGltf } from './realSheepGltf.js';

export const GOAT_FILE = new URL('../../public/models/goat.glb', import.meta.url);
export { glbJson } from './realSheepGltf.js';

let cached = null;

/** Le GLB de la chèvre, chargé une fois. */
export function loadRealGoatGltf() {
  // (le faux document est posé par le chargeur du mouton)
  void loadRealSheepGltf;
  if (!globalThis.document) {
    const ctx = new Proxy({}, {
      get: (o, k) => (k in o ? o[k] : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}),
      set: (o, k, v) => { o[k] = v; return true; },
    });
    globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
  }
  if (cached) return cached;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  cached = new Promise((resolve, reject) => loader.parse(withoutTextures(fs.readFileSync(GOAT_FILE)), '', resolve, reject));
  return cached;
}

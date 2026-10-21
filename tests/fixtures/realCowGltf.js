// Les GLB de la vache réaliste (Lyndon Daniels) et du taureau (Rocketbox) chargés dans node (tests) : sans leurs textures
// (le décodage des images WebP demande un navigateur), avec la géométrie, le squelette, la cible de forme des cornes du
// taureau et les clips. Même méthode que le mouton et la chèvre (realSheepGltf.js : faux document pour l'ombre de
// contact).
import fs from 'node:fs';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { withoutTextures } from './realSheepGltf.js';

export const COW_FILE = new URL('../../public/models/cow.glb', import.meta.url);
export const BULL_FILE = new URL('../../public/models/bull.glb', import.meta.url);
export { glbJson } from './realSheepGltf.js';

let cached = null;

function fakeDocument() {
  if (globalThis.document) return;
  const ctx = new Proxy({}, {
    get: (o, k) => (k in o ? o[k] : String(k).startsWith('create') ? () => ({ addColorStop() {} }) : () => {}),
    set: (o, k, v) => { o[k] = v; return true; },
  });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
}

const parse = (file) => new Promise((resolve, reject) => {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.parse(withoutTextures(fs.readFileSync(file)), '', resolve, reject);
});

/** Les GLB de la vache et du taureau, chargés une fois : { cow, bull }. */
export function loadRealCowGltf() {
  fakeDocument();
  if (cached) return cached;
  cached = Promise.all([parse(COW_FILE), parse(BULL_FILE)]).then(([cow, bull]) => ({ cow, bull }));
  return cached;
}

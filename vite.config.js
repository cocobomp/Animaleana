import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

// Génère sw.js avec la liste de tous les fichiers du jeu,
// pour qu'il fonctionne entièrement hors ligne après la première ouverture.
function offlineServiceWorker() {
  return {
    name: 'animaleana-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      // Les modèles 3D (public/models/*.glb) ne passent pas par le bundle : on les ajoute à la main.
      const modelDir = path.resolve('public/models');
      const models = fs.existsSync(modelDir)
        ? fs.readdirSync(modelDir, { recursive: true }).filter((f) => /\.(glb|gltf|bin|png|jpg|webp)$/i.test(String(f))).map((f) => `./models/${String(f).split(path.sep).join('/')}`)
        : [];
      const files = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
        './icon-maskable-512.png', './apple-touch-icon.png',
        ...Object.keys(bundle).map((f) => `./${f}`), ...models];
      const version = Date.now().toString(36);
      const source = `// Généré automatiquement au build.
const CACHE = 'animaleana-${version}';
const FILES = ${JSON.stringify([...new Set(files)], null, 2)};

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || fetch(e.request).then((res) => {
    const copy = res.clone();
    caches.open(CACHE).then((c) => c.put(e.request, copy));
    return res;
  }).catch(() => caches.match('./index.html'))));
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [offlineServiceWorker()],
  build: { chunkSizeWarningLimit: 1200 },
  test: { exclude: ['**/node_modules/**', '.claude/**'] },
});

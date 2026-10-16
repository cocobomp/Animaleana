import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// Version affichée sur l'écran d'accueil : numéro du package.json, date du build et commit.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
} catch {
  /* pas de dépôt git : pas de commit affiché */
}
const built = new Date().toISOString().slice(0, 16).replace('T', ' ');

// Génère sw.js avec la liste de tous les fichiers du jeu,
// pour qu'il fonctionne entièrement hors ligne après la première ouverture.
function offlineServiceWorker() {
  return {
    name: 'animaleana-offline',
    apply: 'build',
    generateBundle(_, bundle) {
      const files = ['./', './index.html', './manifest.webmanifest', './icon.svg', './icon-192.png', './icon-512.png',
        './icon-maskable-512.png', './apple-touch-icon.png',
        ...Object.keys(bundle).map((f) => `./${f}`)];
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
  // La page elle-même : d'abord le réseau (un seul rechargement suffit pour avoir la nouvelle version),
  // le cache seulement hors ligne. Les fichiers du jeu ont un nom unique par version : cache d'abord.
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put('./index.html', copy));
      return res;
    }).catch(() => caches.match('./index.html')));
    return;
  }
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
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __APP_COMMIT__: JSON.stringify(commit),
    __APP_BUILT__: JSON.stringify(built),
  },
  plugins: [offlineServiceWorker()],
  build: { chunkSizeWarningLimit: 1200 },
  test: { exclude: ['**/node_modules/**', '.claude/**'] },
});

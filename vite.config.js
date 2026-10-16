import { defineConfig } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

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

// Version « à emporter » : un seul fichier HTML (script et styles inclus) qui s'ouvre en double-cliquant,
// sans serveur ni réseau — pour passer le jeu sur un ordinateur par AirDrop, clé USB ou mail.
function portableFile() {
  let outDir = 'dist';
  return {
    name: 'animaleana-portable',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const read = (f) => readFileSync(join(outDir, f), 'utf8');
      let html = read('index.html');
      // Script et feuille de style inclus dans la page ; les liens vers le manifeste et les icônes ne servent à rien ici.
      html = html.replace(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"><\/script>/, (_, f) => `<script type="module">\n${read(f).replace(/<\/script/gi, '<\\/script')}\n</script>`);
      html = html.replace(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)">/, (_, f) => `<style>\n${read(f)}\n</style>`);
      html = html.replace(/\s*<link rel="manifest"[^>]*>/, '').replace(/\s*<link rel="apple-touch-icon"[^>]*>/, '');
      html = html.replace(/<link rel="icon" href="\.\/icon\.svg"/, `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(read('icon.svg')).toString('base64')}"`);
      // Modèles 3D (public/models) inclus en data: URI : la version à emporter a les mêmes graphismes.
      const modelDir = join(outDir, 'models');
      if (fs.existsSync(modelDir)) {
        const models = Object.fromEntries(fs.readdirSync(modelDir).filter((f) => /\.glb$/i.test(f))
          .map((f) => [f, `data:model/gltf-binary;base64,${fs.readFileSync(join(modelDir, f)).toString('base64')}`]));
        html = html.replace('<script type="module">', () => `<script>window.__ANIMADICHELLE_MODELS__ = ${JSON.stringify(models)};</script>\n<script type="module">`);
      }
      writeFileSync(join(outDir, 'animadichelle.html'), html);
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
  plugins: [offlineServiceWorker(), portableFile()],
  build: { chunkSizeWarningLimit: 1200 },
  test: { exclude: ['**/node_modules/**', '.claude/**'] },
});

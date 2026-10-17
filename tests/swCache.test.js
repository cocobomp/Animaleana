// Le service worker généré par vite.config.js (plugin animaleana-offline), rejoué avec un faux Cache API :
// les pages de connexion Firebase (/__/auth/…) et les autres adresses ne sont jamais interceptées, et seule la
// vraie page du jeu est gardée comme index.html (sinon, hors ligne, le jeu ne s'ouvrait plus).
import { describe, it, expect } from 'vitest';
import config from '../vite.config.js';

const ORIGIN = 'https://lafermeamadichelle.web.app';
const GAME_HTML = '<!doctype html><html><body><div id="app"></div><script type="module" src="./assets/index-abc.js"></script></body></html>';
const AUTH_HTML = '<!DOCTYPE html><html><head><script src="iframe.js"></script></head><body></body></html>';

function swSource() {
  const plugin = config.plugins.find((p) => p.name === 'animaleana-offline');
  let source = null;
  plugin.generateBundle.call({ emitFile: (f) => { source = f.source; } }, {}, { 'assets/index-abc.js': {} });
  return source;
}

function makeSw(net) {
  const selfLocation = new URL(`${ORIGIN}/sw.js`);
  const abs = (r) => new URL(typeof r === 'string' ? r : r.url, selfLocation).href;
  const store = new Map();
  const cache = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name);
    return {
      async put(req, res) { m.set(abs(req), res); },
      async match(req, opts = {}) {
        const u = new URL(abs(req));
        for (const [k, v] of m) {
          const ku = new URL(k);
          if (opts.ignoreSearch ? ku.origin + ku.pathname === u.origin + u.pathname : k === u.href) return v.clone();
        }
        return undefined;
      },
      async addAll(list) { for (const r of list) m.set(abs(r), new Response(r.endsWith('html') || r === './' ? GAME_HTML : 'x')); },
    };
  };
  const caches = {
    open: async (n) => cache(n),
    keys: async () => [...store.keys()],
    match: async (req, opts) => {
      for (const n of store.keys()) { const hit = await cache(n).match(req, opts); if (hit) return hit; }
      return undefined;
    },
  };
  const listeners = {};
  const self = { addEventListener: (t, fn) => { listeners[t] = fn; }, skipWaiting: async () => {}, clients: { claim: async () => {} }, location: selfLocation };
  const fetch = async (req) => {
    if (!net.online) throw new TypeError('Failed to fetch');
    const u = new URL(req.url);
    if (u.pathname.startsWith('/__/')) return new Response(AUTH_HTML, { headers: { 'content-type': 'text/html' } });
    if (u.origin !== ORIGIN) return new Response('{"other":1}');
    if (u.pathname === '/missing.html') return new Response('Not found', { status: 404 });
    return new Response(GAME_HTML, { headers: { 'content-type': 'text/html' } });
  };
  // eslint-disable-next-line no-new-func
  new Function('self', 'caches', 'fetch', 'location', swSource())(self, caches, fetch, selfLocation);
  const dispatch = async (url, mode) => {
    let p = null;
    listeners.fetch({ request: { method: 'GET', mode, url }, respondWith: (x) => { p = x; }, waitUntil: () => {} });
    const res = await p;
    await new Promise((r) => setTimeout(r, 5));
    return res ? res.text() : null; // null : pas intercepté (le navigateur s'en occupe)
  };
  const install = async () => { let p; listeners.install({ waitUntil: (x) => { p = x; } }); await p; };
  const cachedIndex = async () => (await (await caches.match('./index.html'))?.text()) ?? null;
  return { dispatch, install, caches, cachedIndex };
}

describe('service worker et connexion Firebase', () => {
  it('l\'iframe et la fenêtre de connexion (/__/auth/…) ne sont pas interceptées : le jeu reste en cache', async () => {
    const net = { online: true };
    const sw = makeSw(net);
    await sw.install();
    expect(await sw.dispatch(`${ORIGIN}/`, 'navigate')).toContain('id="app"');
    expect(await sw.dispatch(`${ORIGIN}/__/auth/iframe?apiKey=A&v=12`, 'navigate')).toBeNull();
    expect(await sw.dispatch(`${ORIGIN}/__/auth/handler?apiKey=A`, 'navigate')).toBeNull();
    expect(await sw.dispatch(`${ORIGIN}/__/auth/iframe.js`, 'no-cors')).toBeNull();
    expect(await sw.cachedIndex()).toContain('id="app"');
    net.online = false;
    expect(await sw.dispatch(`${ORIGIN}/`, 'navigate')).toContain('id="app"');
  });

  it('autres adresses (Google, Firestore…) : jamais interceptées ni gardées', async () => {
    const sw = makeSw({ online: true });
    await sw.install();
    expect(await sw.dispatch('https://firestore.googleapis.com/google.firestore.v1.Firestore/Listen/channel?VER=8&TYPE=xmlhttp', 'cors')).toBeNull();
    expect(await sw.dispatch('https://www.gstatic.com/firebasejs/x.js', 'no-cors')).toBeNull();
    expect(await sw.dispatch('https://accounts.google.com/o/oauth2/auth', 'navigate')).toBeNull();
  });

  it('seule la page du jeu (réponse ok) devient index.html ; une autre page ou une erreur, non', async () => {
    const net = { online: true };
    const sw = makeSw(net);
    await sw.install();
    const before = await sw.cachedIndex();
    await sw.dispatch(`${ORIGIN}/missing.html`, 'navigate');
    await sw.dispatch(`${ORIGIN}/ferme-madichelle.html`, 'navigate');
    expect(await sw.cachedIndex()).toBe(before);
    expect(await sw.dispatch(`${ORIGIN}/index.html`, 'navigate')).toContain('id="app"');
  });

  it('les fichiers du jeu restent servis depuis le cache hors ligne', async () => {
    const net = { online: true };
    const sw = makeSw(net);
    await sw.install();
    net.online = false;
    expect(await sw.dispatch(`${ORIGIN}/assets/index-abc.js`, 'no-cors')).toBe('x');
  });
});

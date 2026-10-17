// La partie et la synchro (src/game/Game.js) : « Quitter » prévient seulement quand la partie est vraiment
// arrêtée (pas de sauvegarde d'un voyage à moitié fait par la synchro du retour au menu), une partie qui
// s'ouvre est relue au démarrage, et la sauvegarde n'écrase jamais en silence une autre version.
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

const mem = new Map();
let Game;
let profile;

beforeAll(async () => {
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => mem.set(k, String(v)),
    removeItem: (k) => mem.delete(k),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  globalThis.window = globalThis.window ?? { addEventListener() {}, devicePixelRatio: 1, innerWidth: 800, innerHeight: 600 };
  globalThis.document = globalThis.document ?? {
    addEventListener() {}, hidden: false, documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } }, getElementById: () => null, createElement: () => ({ getContext: () => null, style: {} }),
  };
  ({ Game } = await import('../src/game/Game.js'));
  profile = await import('../src/sim/profile.js');
});
beforeEach(() => mem.clear());

/** Un faux jeu avec les vraies méthodes start/stop/save de Game. */
function fakeGame(p) {
  const listeners = {};
  const g = {
    profile: p, running: true, entities: new Map(), helpers: new Map(), modelsLoaded: true,
    tasks: { clear() {} }, mgmt: { stop() {} }, activities: { abort() {} }, marker: { hide() {} }, herding: { stop() {} }, player: null,
    tripFlow: { journey: null, reset() { this.journey = null; } },
    on(n, f) { (listeners[n] ??= []).push(f); },
    emit(n, d) { for (const f of listeners[n] ?? []) f(d); },
  };
  g.save = Game.prototype.save.bind(g);
  g.stop = Game.prototype.stop.bind(g);
  g.start = Game.prototype.start.bind(g);
  g.savedAt = p?.updatedAt;
  return g;
}

describe('Quitter, puis synchro', () => {
  it('« stop » est annoncé quand la partie est vraiment arrêtée : la synchro ne sauvegarde pas un voyage à moitié fait', () => {
    const p = profile.createProfile('Léa', 'manage');
    p.money = 500;
    profile.saveProfile(p);
    const g = fakeGame(p);
    const seen = [];
    // main.js : beforeSync = game.running && game.save(), lancé par la synchro du retour au menu.
    g.on('stop', () => seen.push({ running: g.running, profile: g.profile, beforeSync: g.running && g.save() }));
    p.money = 380; // billet payé, trajet suivi en cours
    g.tripFlow.journey = { report: null };
    expect(g.save()).toBe(false);
    expect(g.stop()).toBe(false);
    expect(seen).toEqual([{ running: false, profile: null, beforeSync: false }]);
    expect(profile.loadProfile(p.id).money).toBe(500); // la sauvegarde d'avant le départ
  });

  it('hors voyage, « Quitter » sauvegarde toujours', () => {
    const p = profile.createProfile('Léa', 'manage');
    profile.saveProfile(p);
    const g = fakeGame(p);
    p.money = 250;
    expect(g.stop()).toBe(true);
    expect(profile.loadProfile(p.id).money).toBe(250);
  });
});

describe('sauvegarde de la partie en cours', () => {
  it('changée ailleurs sur l\'appareil (synchro, autre onglet) : l\'autre version est gardée en copie de secours', () => {
    const p = profile.createProfile('Léa');
    profile.saveProfile(p);
    const g = fakeGame(p);
    g.savedAt = p.updatedAt;
    const other = { ...profile.loadProfile(p.id), money: 999, updatedAt: p.updatedAt + 5000 };
    profile.saveProfile(other, { touch: false });
    let kept = null;
    g.on('backupKept', (b) => { kept = b; });
    p.money = 1;
    expect(g.save()).toBe(true);
    expect(kept?.backupOf).toBe(p.id);
    const all = profile.listProfiles().map((e) => profile.loadProfile(e.id).money).sort((a, b) => a - b);
    expect(all).toEqual([1, 999]);
  });

  it('rien de changé : rien n\'est réécrit (la date ne bouge pas, rien à envoyer)', () => {
    const p = profile.createProfile('Léa');
    profile.saveProfile(p);
    const g = fakeGame(p);
    g.savedAt = p.updatedAt;
    expect(g.save()).toBe(true);
    const at = profile.listProfiles()[0].updatedAt;
    expect(g.save()).toBe(true);
    expect(profile.listProfiles()[0].updatedAt).toBe(at);
  });
});

describe('partie qui s\'ouvre pendant le chargement des modèles', () => {
  it('comptée comme ouverte tout de suite, et relue sur l\'appareil quand elle démarre vraiment', async () => {
    const p = profile.createProfile('Léa');
    profile.saveProfile(p);
    const g = fakeGame(null);
    g.running = false;
    g.modelsLoaded = false;
    let ready;
    g.modelsReady = new Promise((r) => { ready = r; });
    const started = [];
    // Le vrai démarrage (3D) n'est pas testé ici : on regarde seulement quel profil il reçoit.
    const realStart = g.start;
    g.start = (prof) => {
      if (!g.modelsLoaded) return realStart(prof);
      started.push(prof);
      return undefined;
    };
    const opening = [];
    g.on('opening', (x) => opening.push(x.id));
    g.start(profile.loadProfile(p.id)); // le toucher : l'ancienne version
    expect(g.opening?.id).toBe(p.id);
    expect(opening).toEqual([p.id]);
    // Pendant le chargement, une synchro met la version du téléphone sur l'appareil.
    profile.saveProfile({ ...profile.loadProfile(p.id), money: 999 }, { touch: false });
    g.modelsLoaded = true;
    ready();
    await new Promise((r) => setTimeout(r, 0));
    expect(started.map((x) => x.money)).toEqual([999]);
    expect(g.opening).toBeNull();
  });
});

vi.restoreAllMocks();

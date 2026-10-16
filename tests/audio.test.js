// Le moteur sonore (src/game/audio.js) doit s'importer en node sans DOM ni AudioContext,
// ne jamais lever d'exception, respecter le réglage on/off/volume et limiter les voix des animaux.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Audio, audio } from '../src/game/audio.js';

// ---------------------------------------------------------------- faux AudioContext

function param(v = 0) {
  const p = { value: v, calls: [] };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'cancelScheduledValues']) {
    p[m] = (val) => {
      p.calls.push([m, val]);
      if (m !== 'cancelScheduledValues') p.value = val;
      return p;
    };
  }
  return p;
}

function node(ctx, kind, extra = {}) {
  const n = { kind, connect() { return this; }, disconnect() {}, start() {}, stop() {}, ...extra };
  ctx.created.push(n);
  return n;
}

function fakeContext() {
  const ctx = {
    state: 'suspended',
    currentTime: 0,
    sampleRate: 8000,
    destination: { kind: 'destination' },
    created: [],
    createGain: () => node(ctx, 'gain', { gain: param(1) }),
    createOscillator: () => node(ctx, 'osc', { type: 'sine', frequency: param(440) }),
    createBiquadFilter: () => node(ctx, 'filter', { type: 'lowpass', frequency: param(350), Q: param(1) }),
    createBufferSource: () => node(ctx, 'source', { buffer: null, loop: false }),
    createBuffer: (channels, len) => ({ getChannelData: () => new Float32Array(len) }),
    resume() { ctx.state = 'running'; ctx.onstatechange?.(); return Promise.resolve(); },
    suspend() { ctx.state = 'suspended'; ctx.onstatechange?.(); return Promise.resolve(); },
    close() { ctx.state = 'closed'; return Promise.resolve(); },
  };
  return ctx;
}

const count = (ctx, kind) => ctx.created.filter((n) => n.kind === kind).length;

const SPECIES = ['horse', 'dog', 'cat', 'rabbit', 'sheep', 'goat', 'cow', 'dragon'];
const MOODS = ['happy', 'neutral', 'sad', 'sick'];
const UI = ['tap', 'ok', 'cancel', 'coin', 'levelUp', 'toast', 'skip', 'fast', 'inconnu'];
const SURFACES = ['grass', 'dirt', 'wood', 'stone', 'snow', 'sand', 'hoof', 'lave'];
const WEATHERS = ['clear', 'cloudy', 'rain', 'storm', 'snow', 'fog'];

function callEverything(a) {
  a.configure({ on: true, volume: 0.7 });
  a.setActive(true);
  for (const k of UI) a.ui(k);
  for (const s of SPECIES) for (const m of MOODS) a.animal(s, m, `${s}-${m}`, { pitch: 1.3, gain: 0.8 });
  for (const s of SURFACES) { a.step(s, false); a.step(s, true); }
  for (const w of WEATHERS) for (const night of [false, true]) for (const indoors of [false, true]) {
    a.ambience({ weather: w, night, biome: 'countryside', indoors });
  }
  a.ambience({ weather: 'clear', night: false, biome: 'beach' });
  a.ambience({ weather: 'storm', night: true, biome: 'tundra' });
  a.ambience();
  for (const k of ['good', 'bad', 'done']) a.minigame(k);
  a.thunder(0.5);
  a.thunder();
  a.applyAmbience();
  a.setEnabled(false);
  a.setVolume(0.4);
  a.setEnabled(true);
  a.setActive(false);
  a.stats();
}

let instances = [];
const make = (opts) => {
  const a = new Audio({ autoUnlock: false, ...opts });
  instances.push(a);
  return a;
};

afterEach(() => {
  for (const a of instances) a.dispose();
  instances = [];
  vi.useRealTimers();
});

// ---------------------------------------------------------------- tests

describe('sons : sans AudioContext (node)', () => {
  it("s'importe sans fenêtre ni AudioContext et toutes les méthodes se laissent appeler", () => {
    expect(typeof globalThis.AudioContext).toBe('undefined');
    expect(typeof window).toBe('undefined');
    const a = make();
    expect(() => callEverything(a)).not.toThrow();
    expect(a.stats().state).toBe('none');
    expect(a.ui('tap')).toBe(false);
    expect(a.animal('dog', 'happy')).toBe(false);
    expect(() => a.dispose()).not.toThrow();
    // Le moteur partagé du jeu aussi.
    expect(() => { audio.ui('tap'); audio.step('grass'); audio.ambience({ weather: 'rain' }); audio.animal('cat', 'sad'); }).not.toThrow();
    expect(audio.stats().state).toBe('none');
  });

  it('garde le réglage on/off/volume dans son état interne même sans son', () => {
    const a = make();
    a.configure({ on: false, volume: 0.4 });
    expect(a.enabled).toBe(false);
    expect(a.volume).toBe(0.4);
    a.configure({ on: true, volume: 5 });
    expect(a.volume).toBe(1); // borné
    a.setVolume(-3);
    expect(a.volume).toBe(0);
    a.configure();
    expect(a.enabled).toBe(true);
    expect(a.volume).toBe(0.7);
  });
});

describe('sons : avec un faux AudioContext', () => {
  it('ne lève rien non plus et joue des sons quand la partie est en cours', () => {
    const ctx = fakeContext();
    const a = make({ context: ctx, clock: () => 0 });
    expect(() => callEverything(a)).not.toThrow();
    expect(count(ctx, 'osc')).toBeGreaterThan(10);
  });

  it('respecte Activés / Coupés et le volume : volume maître, contexte en pause quand coupé', () => {
    const ctx = fakeContext();
    const a = make({ context: ctx, clock: () => 0 });
    expect(a.ui('tap')).toBe(false); // écran des profils : rien ne joue
    a.setActive(true);
    expect(ctx.state).toBe('running');
    expect(a.master.gain.value).toBeCloseTo(0.7 * 0.9, 5);
    expect(a.ui('tap')).toBe(true);
    const before = count(ctx, 'osc');

    a.configure({ on: false, volume: 1 });
    expect(a.enabled).toBe(false);
    expect(a.master.gain.value).toBe(0);
    expect(ctx.state).toBe('suspended');
    expect(a.ui('ok')).toBe(false);
    expect(a.animal('dog', 'happy', 'd')).toBe(false);
    expect(a.step('grass')).toBe(false);
    expect(count(ctx, 'osc')).toBe(before);

    a.configure({ on: true, volume: 0.4 });
    expect(ctx.state).toBe('running');
    expect(a.master.gain.value).toBeCloseTo(0.4 * 0.9, 5);
    expect(a.ui('coin')).toBe(true);
    expect(count(ctx, 'osc')).toBeGreaterThan(before);
  });

  it("se tait quand la partie s'arrête (écran des profils) et reprend au retour", () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    const a = make({ context: ctx, clock: () => 0 });
    a.setActive(true);
    a.ambience({ weather: 'rain', night: false, biome: 'countryside' });
    expect(a.stats().layers).toContain('rain');
    a.setActive(false);
    vi.advanceTimersByTime(2500);
    expect(ctx.state).toBe('suspended');
    expect(a.stats().layers).toEqual([]);
    expect(a.ui('tap')).toBe(false);
    a.setActive(true);
    expect(ctx.state).toBe('running');
    expect(a.ui('tap')).toBe(true);
  });

  it('limite les voix : une toutes les ~2 s par animal, jamais plus de 2 en même temps (horloge injectée)', () => {
    const ctx = fakeContext();
    let now = 0;
    const a = make({ context: ctx, clock: () => now });
    a.setActive(true);
    expect(a.animal('dog', 'happy', 'medor')).toBe(true);
    expect(a.animal('dog', 'happy', 'medor')).toBe(false); // trop tôt
    now = 1.9;
    expect(a.animal('dog', 'neutral', 'medor')).toBe(false);
    now = 2.1;
    expect(a.animal('dog', 'neutral', 'medor')).toBe(true);
    // Un autre animal peut parler tout de suite (mais 2 voix au plus en même temps).
    now = 100;
    expect(a.animal('cow', 'neutral', 'marguerite')).toBe(true); // 1,2 s
    expect(a.animal('sheep', 'neutral', 'laine')).toBe(true); // 0,7 s
    expect(a.animal('goat', 'happy', 'biquette')).toBe(false); // déjà 2 voix
    now = 100.8; // le mouton a fini, la vache meugle encore
    expect(a.animal('goat', 'happy', 'biquette')).toBe(true);
    expect(a.animal('cat', 'sad', 'mimi')).toBe(false);
    now = 103;
    expect(a.animal('cat', 'sad', 'mimi')).toBe(true);
    // Sans identifiant, c'est l'espèce qui compte.
    now = 200;
    expect(a.animal('rabbit', 'happy')).toBe(true);
    expect(a.animal('rabbit', 'happy')).toBe(false);
  });

  it('espace les pas et les notifications', () => {
    const ctx = fakeContext();
    let now = 0;
    const a = make({ context: ctx, clock: () => now });
    a.setActive(true);
    expect(a.step('wood', false)).toBe(true);
    expect(a.step('wood', false)).toBe(false);
    now = 0.3;
    expect(a.step('stone', true)).toBe(true);
    expect(a.ui('toast')).toBe(true);
    expect(a.ui('toast')).toBe(false);
    now = 2;
    expect(a.ui('toast')).toBe(true);
  });

  it("ambiance : une seule source de bruit partagée, nappes selon la météo et l'heure, fondus puis démontage", () => {
    vi.useFakeTimers();
    const ctx = fakeContext();
    let now = 0;
    const a = make({ context: ctx, clock: () => now });
    a.setActive(true);
    a.ambience({ weather: 'rain', night: false, biome: 'countryside', indoors: false });
    expect(a.stats().layers).toEqual(expect.arrayContaining(['wind', 'rain', 'birds']));
    expect(a.stats().layers).not.toContain('crickets');
    expect(count(ctx, 'source')).toBe(1); // vent et pluie partagent le même bruit
    const nodes = ctx.created.length;
    a.ambience({ weather: 'rain', night: false, biome: 'countryside', indoors: false });
    expect(ctx.created.length).toBe(nodes); // même état : rien de nouveau
    const rain = a.layers.rain;
    expect(rain.g.gain.calls.some(([m, v]) => m === 'linearRampToValueAtTime' && v > 0)).toBe(true);

    a.ambience({ weather: 'clear', night: true, biome: 'countryside', indoors: false });
    expect(a.stats().layers).toEqual(expect.arrayContaining(['wind', 'crickets', 'owl']));
    expect(rain.g.gain.calls.at(-1)).toEqual(['linearRampToValueAtTime', 0]); // fondu vers 0…
    expect(a.stats().layers).toContain('rain');
    vi.advanceTimersByTime(2400);
    expect(a.stats().layers).not.toContain('rain'); // …puis démontée
    expect(a.stats().layers).not.toContain('birds');
    expect(count(ctx, 'source')).toBe(1);

    // Dedans : le filtre assourdit l'ambiance.
    a.ambience({ weather: 'clear', night: true, biome: 'countryside', indoors: true });
    expect(a.ambFilter.frequency.value).toBe(520);
    a.ambience({ weather: 'snow', night: false, biome: 'tundra', indoors: false });
    expect(a.ambFilter.frequency.value).toBe(18000);
    vi.advanceTimersByTime(2400); // fondu des grillons, puis démontage
    expect(a.stats().layers).not.toContain('crickets');
    expect(a.layers.wind.filter.frequency.value).toBe(170); // vent sourd
    const srcBefore = count(ctx, 'source');
    expect(a.thunder(0.3)).toBe(true);
    expect(count(ctx, 'source')).toBe(srcBefore + 2); // le tonnerre est un son ponctuel
  });
});

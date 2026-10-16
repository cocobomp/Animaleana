// Sons du jeu, tous fabriqués par le code avec la Web Audio API (oscillateurs, bruit filtré,
// enveloppes) : aucun fichier audio. Pensé pour un enfant sur téléphone : doux, léger, peu de nœuds.
//
// Utilisation (import { audio } from './audio.js') :
//   audio.ui('tap' | 'ok' | 'cancel' | 'coin' | 'levelUp' | 'toast' | 'skip' | 'fast')
//   audio.animal(species, mood, id?, { pitch, gain })   voix courte (hennissement, aboiement…)
//   audio.step(surface, running)                        pas du joueur : grass / dirt / wood / stone / snow / sand / hoof
//   audio.ambience({ weather, night, biome, indoors })   nappe continue (oiseaux, grillons, vent, pluie, orage)
//   audio.minigame('good' | 'bad' | 'done')
//   audio.thunder(delay)                                 coup de tonnerre (synchronisé avec l'éclair)
//   audio.configure({ on, volume }) · audio.setActive(bool) · audio.stats()
//
// Tout est sans danger quand il n'y a pas d'AudioContext (tests en node, vieux navigateur) :
// aucune méthode ne lève d'exception. L'AudioContext est créé au premier geste de l'enfant
// (pointerdown / keydown / touchstart), mis en pause quand l'onglet est caché ou sur l'écran des profils.

const WIN = typeof window !== 'undefined' ? window : null;
const DOC = typeof document !== 'undefined' ? document : null;
const defaultClock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;

const VOICE_GAP = 2; // secondes entre deux voix d'un même animal
const VOICE_MAX = 2; // voix en même temps, au plus

// Oiseaux le jour, grillons la nuit : selon le paysage (0 = jamais, 1 = beaucoup).
const BIRDS = { countryside: 1, prairie: 0.8, garden: 1, beach: 0.7, mediterranean: 0.8, mountain: 0.5, outback: 0.6, tundra: 0.15 };
const CRICKETS = { countryside: 1, prairie: 1, garden: 0.8, beach: 0.5, mediterranean: 1, outback: 0.9, mountain: 0.2, tundra: 0 };
const BIRDS_WEATHER = { clear: 1, cloudy: 0.7, fog: 0.4, rain: 0.15, storm: 0, snow: 0.1 };
// Vent : fréquence de coupure (Hz), niveau, vitesse des rafales.
const WIND = {
  clear: { f: 320, level: 0.12, rate: 0.18 },
  cloudy: { f: 420, level: 0.2, rate: 0.22 },
  rain: { f: 520, level: 0.22, rate: 0.25 },
  storm: { f: 720, level: 0.42, rate: 0.4 },
  snow: { f: 170, level: 0.32, rate: 0.12 }, // vent sourd
  fog: { f: 240, level: 0.08, rate: 0.1 },
};
const RAIN = { rain: 0.26, storm: 0.4 };

// Pas : filtre, durée, niveau, éventuel « toc » (bois, pierre, sabot).
const STEPS = {
  grass: { type: 'lowpass', f: 1100, q: 0.6, dur: 0.075, gain: 0.16 },
  dirt: { type: 'bandpass', f: 480, q: 0.8, dur: 0.07, gain: 0.22 },
  wood: { type: 'lowpass', f: 750, q: 0.9, dur: 0.085, gain: 0.2, knock: { f: 170, gain: 0.12, dur: 0.07 } },
  stone: { type: 'bandpass', f: 1900, q: 1.1, dur: 0.05, gain: 0.18, knock: { f: 1200, gain: 0.05, dur: 0.03 } },
  snow: { type: 'lowpass', f: 520, q: 0.7, dur: 0.12, gain: 0.2 },
  sand: { type: 'lowpass', f: 650, q: 0.7, dur: 0.1, gain: 0.17 },
  hoof: { type: 'lowpass', f: 420, q: 0.9, dur: 0.08, gain: 0.3, knock: { f: 110, gain: 0.18, dur: 0.09 } },
};

export class Audio {
  /**
   * clock : horloge en secondes (injectable pour les tests) ; context : AudioContext déjà créé (tests).
   * autoUnlock : installe les écouteurs du premier geste et de la visibilité de la page.
   */
  constructor({ clock = defaultClock, context = null, autoUnlock = true } = {}) {
    this.clock = clock;
    this.enabled = true;
    this.volume = 0.7;
    this.active = false; // une partie est en cours (sinon : silence)
    this.unlocked = false;
    this.ctx = null;
    this.layers = {}; // nappes d'ambiance en cours (vent, pluie, oiseaux, grillons)
    this.timers = new Set();
    this.liveNodes = 0;
    this.voiceLast = new Map(); // id d'animal → dernière voix (horloge)
    this.voiceEnds = []; // fins des voix en cours (horloge)
    this.lastAt = {}; // dernier son par famille (anti-rafale)
    this.lastThunder = -99;
    this.amb = null; // état d'ambiance demandé { weather, night, biome, indoors }
    this.applied = null;
    if (context) {
      this.ctx = context;
      this.unlocked = true;
      this.buildGraph();
    }
    if (autoUnlock) this.listen();
  }

  // ---------------------------------------------------------------- réglages

  /** profile.settings.sound = { on, volume } ; s'applique tout de suite. */
  configure({ on = true, volume = 0.7 } = {}) {
    const was = this.enabled;
    this.enabled = !!on;
    this.volume = Math.min(1, Math.max(0, Number(volume) || 0));
    this.applyMaster();
    const p = this.sync();
    // Réactivé dans les réglages : un petit « ok » dès que le son a repris, pour entendre le résultat.
    if (!was && this.enabled && p && typeof p.then === 'function') p.then(() => this.ui('ok')).catch(() => {});
  }

  setEnabled(on) {
    this.configure({ on, volume: this.volume });
  }

  setVolume(volume) {
    this.configure({ on: this.enabled, volume });
  }

  /** Partie en cours (true) ou écran des profils (false : tout se tait). */
  setActive(on) {
    on = !!on;
    if (this.active === on) return;
    this.active = on;
    if (!on) {
      this.fadeAll();
      this.after(2300, () => this.sync());
    } else {
      this.ensure();
      this.sync();
    }
  }

  stats() {
    return {
      state: this.ctx ? this.ctx.state : 'none',
      nodes: this.liveNodes,
      layers: Object.keys(this.layers),
      unlocked: this.unlocked,
      active: this.active,
      enabled: this.enabled,
      volume: this.volume,
    };
  }

  // ---------------------------------------------------------------- contexte

  listen() {
    if (!WIN || typeof WIN.addEventListener !== 'function') return;
    try {
      const unlock = () => {
        this.unlocked = true;
        for (const ev of ['pointerdown', 'keydown', 'touchstart']) WIN.removeEventListener(ev, unlock, true);
        if (this.ensure()) this.sync();
      };
      for (const ev of ['pointerdown', 'keydown', 'touchstart']) WIN.addEventListener(ev, unlock, { capture: true, passive: true });
      DOC?.addEventListener?.('visibilitychange', () => this.sync());
    } catch {
      /* pas d'événements ici */
    }
  }

  /** Crée l'AudioContext (une seule fois). Renvoie null s'il n'y en a pas sur cet appareil. */
  ensure() {
    if (this.ctx) return this.ctx;
    if (!this.unlocked) return null;
    const AC = (WIN && (WIN.AudioContext || WIN.webkitAudioContext)) || (typeof globalThis !== 'undefined' ? globalThis.AudioContext : null);
    if (typeof AC !== 'function') return null;
    try {
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch {
        this.ctx = new AC();
      }
      this.buildGraph();
    } catch {
      this.ctx = null;
      return null;
    }
    return this.ctx;
  }

  buildGraph() {
    const c = this.ctx;
    try {
      this.master = this.track(c.createGain());
      this.master.gain.value = 0;
      this.master.connect(c.destination);
      this.sfx = this.track(c.createGain());
      this.sfx.gain.value = 1;
      this.sfx.connect(this.master);
      // Ambiance : un filtre passe-bas qui assourdit tout quand on est dans un bâtiment.
      this.ambFilter = this.track(c.createBiquadFilter());
      this.ambFilter.type = 'lowpass';
      this.ambFilter.frequency.value = 18000;
      this.ambFilter.connect(this.master);
      this.ambBus = this.track(c.createGain());
      this.ambBus.gain.value = 1;
      this.ambBus.connect(this.ambFilter);
      // Bruit blanc partagé (2 s en boucle) : vent, pluie, tonnerre, pas.
      const n = Math.max(2, Math.floor((c.sampleRate || 44100) * 2));
      const buf = c.createBuffer(1, n, c.sampleRate || 44100);
      const d = buf.getChannelData(0);
      let s = 0x9e3779b9; // pseudo-aléatoire : le même bruit à chaque partie
      for (let i = 0; i < n; i++) {
        s = (s * 1664525 + 1013904223) >>> 0;
        d[i] = (s / 4294967296) * 2 - 1;
      }
      this.noiseBuf = buf;
      this.noise = null;
      c.onstatechange = () => {
        if (c.state === 'running') this.applyAmbience();
      };
      this.applyMaster();
    } catch {
      /* contexte incomplet (tests) : on fait avec */
    }
  }

  applyMaster() {
    const m = this.master;
    if (!m) return;
    try {
      const v = this.enabled ? this.volume * 0.9 : 0;
      const t = this.ctx.currentTime ?? 0;
      m.gain.cancelScheduledValues(t);
      m.gain.setValueAtTime(m.gain.value, t);
      m.gain.linearRampToValueAtTime(v, t + 0.15);
    } catch {
      try { m.gain.value = this.enabled ? this.volume * 0.9 : 0; } catch { /* rien */ }
    }
  }

  /** Reprend ou suspend le contexte selon : partie en cours, réglage, onglet visible. Renvoie la promesse de reprise. */
  sync() {
    const c = this.ctx;
    if (!c) return null;
    const want = this.active && this.enabled && !(DOC && DOC.hidden);
    try {
      if (want) {
        if (c.state !== 'running') {
          const p = c.resume?.();
          if (p && typeof p.then === 'function') {
            const q = p.then(() => this.applyAmbience());
            q.catch(() => {});
            return q;
          }
        }
        if (c.state === 'running') this.applyAmbience();
      } else if (c.state === 'running') {
        const p = c.suspend?.();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      }
    } catch {
      /* rien */
    }
    return null;
  }

  /** Contexte prêt à jouer tout de suite, sinon null (rien n'est alors programmé). */
  ready() {
    const c = this.ctx;
    if (!c || !this.enabled || !this.active || c.state !== 'running' || !this.sfx) return null;
    return c;
  }

  /** Tout arrêter proprement (tests, fin de page). */
  dispose() {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.thunderTimer = null;
    for (const name of Object.keys(this.layers)) this.killLayer(name);
    try { this.noise?.stop(); } catch { /* rien */ }
    this.noise = null;
    const c = this.ctx;
    this.ctx = null;
    try { c?.close?.()?.catch?.(() => {}); } catch { /* rien */ }
  }

  // ---------------------------------------------------------------- outils

  after(ms, fn) {
    if (typeof setTimeout !== 'function') return null;
    const id = setTimeout(() => {
      this.timers.delete(id);
      try { fn(); } catch { /* un son raté ne casse pas le jeu */ }
    }, ms);
    this.timers.add(id);
    return id;
  }

  track(node) {
    this.liveNodes++;
    return node;
  }

  untrack(nodes) {
    for (const n of nodes) {
      try { n.disconnect(); } catch { /* déjà déconnecté */ }
    }
    this.liveNodes = Math.max(0, this.liveNodes - nodes.length);
  }

  /** Un son qui a un début et une fin : ses nœuds sont libérés quand la source s'arrête. */
  oneShot(source, nodes) {
    let done = false;
    const end = () => {
      if (done) return;
      done = true;
      this.untrack(nodes);
    };
    try { source.onended = end; } catch { /* rien */ }
    return end;
  }

  gate(key, min) {
    const now = this.clock();
    if (now - (this.lastAt[key] ?? -99) < min) return false;
    this.lastAt[key] = now;
    return true;
  }

  /**
   * Note synthétisée. o : { type, f, curve: [[dt, f]…], dur, gain, attack, release, filter: { type, f, q },
   * vibrato: { rate, depth }, t (début), pan }.
   */
  tone(dest, o) {
    const c = this.ctx;
    try {
      const t0 = o.t ?? c.currentTime;
      const osc = this.track(c.createOscillator());
      osc.type = o.type ?? 'sine';
      osc.frequency.setValueAtTime(Math.max(20, o.f), t0);
      for (const [dt, f] of o.curve ?? []) osc.frequency.exponentialRampToValueAtTime(Math.max(20, f), t0 + dt);
      const g = this.track(c.createGain());
      const attack = o.attack ?? 0.01;
      const release = o.release ?? 0.06;
      const end = t0 + o.dur;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t0 + attack);
      g.gain.setValueAtTime(Math.max(0.0002, o.gain), Math.max(t0 + attack, end - release));
      g.gain.exponentialRampToValueAtTime(0.0001, end);
      const nodes = [osc, g];
      let last = osc;
      if (o.filter) {
        const f = this.track(c.createBiquadFilter());
        f.type = o.filter.type;
        f.frequency.value = o.filter.f;
        f.Q.value = o.filter.q ?? 1;
        osc.connect(f);
        last = f;
        nodes.push(f);
      }
      last.connect(g);
      let out = g;
      if (o.pan !== undefined && typeof c.createStereoPanner === 'function') {
        const p = this.track(c.createStereoPanner());
        p.pan.value = Math.max(-1, Math.min(1, o.pan));
        g.connect(p);
        out = p;
        nodes.push(p);
      }
      out.connect(dest);
      if (o.vibrato) {
        const lfo = this.track(c.createOscillator());
        lfo.frequency.value = o.vibrato.rate;
        const lg = this.track(c.createGain());
        lg.gain.value = o.vibrato.depth;
        lfo.connect(lg);
        lg.connect(osc.frequency);
        lfo.start(t0);
        lfo.stop(end + 0.03);
        nodes.push(lfo, lg);
      }
      this.oneShot(osc, nodes);
      osc.start(t0);
      osc.stop(end + 0.03);
    } catch {
      /* un son raté ne casse pas le jeu */
    }
  }

  /** Bouffée de bruit filtré (pas, tonnerre, souffle). o : { t, dur, gain, attack, filter: { type, f, q, to }, decay }. */
  burst(dest, o) {
    const c = this.ctx;
    try {
      if (!this.noiseBuf) return;
      const t0 = o.t ?? c.currentTime;
      const src = this.track(c.createBufferSource());
      src.buffer = this.noiseBuf;
      src.loop = true;
      const f = this.track(c.createBiquadFilter());
      f.type = o.filter?.type ?? 'lowpass';
      f.frequency.setValueAtTime(o.filter?.f ?? 800, t0);
      if (o.filter?.to) f.frequency.exponentialRampToValueAtTime(o.filter.to, t0 + o.dur);
      f.Q.value = o.filter?.q ?? 0.8;
      const g = this.track(c.createGain());
      const attack = o.attack ?? 0.004;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, o.gain), t0 + attack);
      if (o.decay === 'exp') g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
      else g.gain.linearRampToValueAtTime(0, t0 + o.dur);
      src.connect(f);
      f.connect(g);
      g.connect(dest);
      this.oneShot(src, [src, f, g]);
      src.start(t0, (this.clock() * 7.3) % 1.5);
      src.stop(t0 + o.dur + 0.02);
    } catch {
      /* rien */
    }
  }

  // ---------------------------------------------------------------- interface

  ui(kind = 'tap') {
    const c = this.ready();
    if (!c) return false;
    const min = { toast: 1.2, tap: 0.05, ok: 0.1, cancel: 0.1, coin: 0.08, levelUp: 1, skip: 0.5, fast: 0.3 }[kind] ?? 0.05;
    if (!this.gate(`ui:${kind}`, min)) return false;
    const t = c.currentTime;
    const d = this.sfx;
    switch (kind) {
      case 'ok':
        this.tone(d, { f: 660, dur: 0.09, gain: 0.13, t });
        this.tone(d, { f: 990, dur: 0.16, gain: 0.13, t: t + 0.09 });
        break;
      case 'cancel':
        this.tone(d, { f: 520, curve: [[0.14, 360]], dur: 0.16, gain: 0.11, t });
        break;
      case 'coin':
        this.tone(d, { type: 'triangle', f: 1320, dur: 0.08, gain: 0.11, t });
        this.tone(d, { type: 'triangle', f: 1760, dur: 0.22, gain: 0.11, t: t + 0.08, release: 0.15 });
        break;
      case 'levelUp':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(d, { f, dur: i === 3 ? 0.45 : 0.13, gain: 0.13, t: t + i * 0.11, release: i === 3 ? 0.3 : 0.05 }));
        this.tone(d, { type: 'triangle', f: 2093, dur: 0.4, gain: 0.04, t: t + 0.4, release: 0.3 });
        break;
      case 'toast':
        this.tone(d, { f: 880, curve: [[0.06, 1175]], dur: 0.08, gain: 0.05, t });
        break;
      case 'skip':
        this.burst(d, { t, dur: 0.4, gain: 0.12, attack: 0.1, filter: { type: 'bandpass', f: 500, q: 1.2, to: 2600 } });
        this.tone(d, { f: 300, curve: [[0.35, 900]], dur: 0.38, gain: 0.06, t, attack: 0.08, release: 0.2 });
        break;
      case 'fast':
        this.tone(d, { type: 'triangle', f: 1500, dur: 0.04, gain: 0.08, t, attack: 0.003 });
        this.tone(d, { type: 'triangle', f: 1900, dur: 0.05, gain: 0.08, t: t + 0.07, attack: 0.003 });
        break;
      default: // tap
        this.tone(d, { type: 'triangle', f: 1700, curve: [[0.035, 1300]], dur: 0.045, gain: 0.09, t, attack: 0.003, release: 0.02 });
    }
    return true;
  }

  minigame(kind = 'good') {
    const c = this.ready();
    if (!c) return false;
    if (!this.gate(`mg:${kind}`, kind === 'done' ? 1 : 0.3)) return false;
    const t = c.currentTime;
    const d = this.sfx;
    if (kind === 'good') this.tone(d, { f: 880, curve: [[0.1, 1320]], dur: 0.13, gain: 0.1, t, release: 0.06 });
    else if (kind === 'bad') this.tone(d, { type: 'triangle', f: 300, curve: [[0.16, 210]], dur: 0.18, gain: 0.1, t, filter: { type: 'lowpass', f: 900 } });
    else [784, 988, 1319].forEach((f, i) => this.tone(d, { f, dur: i === 2 ? 0.4 : 0.12, gain: 0.12, t: t + i * 0.1, release: i === 2 ? 0.25 : 0.05 }));
    return true;
  }

  // ---------------------------------------------------------------- pas

  /** Un pas. surface : grass / dirt / wood / stone / snow / sand / hoof. running : plus fort, plus clair. */
  step(surface = 'grass', running = false) {
    const c = this.ready();
    if (!c) return false;
    if (!this.gate('step', 0.1)) return false;
    const s = STEPS[surface] ?? STEPS.grass;
    const t = c.currentTime;
    const k = running ? 1.35 : 1;
    const vary = 0.9 + ((this.clock() * 13.7) % 1) * 0.2; // chaque pas un peu différent
    this.burst(this.sfx, { t, dur: s.dur * (running ? 0.9 : 1), gain: s.gain * k * vary, filter: { type: s.type, f: s.f * (running ? 1.25 : 1) * vary, q: s.q }, decay: 'exp' });
    if (s.knock) this.tone(this.sfx, { f: s.knock.f * vary, curve: [[s.knock.dur, s.knock.f * 0.6]], dur: s.knock.dur, gain: s.knock.gain * k, t, attack: 0.002, release: 0.03 });
    return true;
  }

  // ---------------------------------------------------------------- voix des animaux

  /**
   * Voix courte d'un animal. mood : 'happy' | 'neutral' | 'sad' | 'sick'. id : pour la limite d'une voix
   * toutes les ~2 s par animal (par défaut l'espèce). opts.pitch (1 = adulte, plus = bébé), opts.gain (distance).
   * Renvoie true si la voix a été jouée.
   */
  animal(species, mood = 'neutral', id = null, opts = {}) {
    const c = this.ready();
    if (!c) return false;
    const key = id ?? species;
    const now = this.clock();
    if (now - (this.voiceLast.get(key) ?? -99) < VOICE_GAP) return false;
    this.voiceEnds = this.voiceEnds.filter((e) => e > now);
    if (this.voiceEnds.length >= VOICE_MAX) return false;
    const dur = this.voice(species, mood, opts);
    if (!dur) return false;
    this.voiceLast.set(key, now);
    this.voiceEnds.push(now + dur);
    return true;
  }

  /** Programme la voix et renvoie sa durée (s). */
  voice(species, mood, { pitch = 1, gain = 1 } = {}) {
    const c = this.ctx;
    const d = this.sfx;
    const t = c.currentTime;
    const p = Math.max(0.5, Math.min(2.2, pitch));
    const v = Math.max(0, Math.min(1, gain));
    const sad = mood === 'sad' || mood === 'sick';
    const happy = mood === 'happy';
    const sick = mood === 'sick';
    const g = (x) => x * v * (sick ? 0.6 : 1);
    const r = (this.clock() * 3.1) % 1;
    switch (species) {
      case 'horse': {
        if (sad) { // hennissement plaintif, plus bas et plus lent
          this.tone(d, { type: 'sawtooth', f: 480 * p, curve: [[0.2, 640 * p], [0.95, 330 * p]], dur: 1, gain: g(0.14), t, attack: 0.06, release: 0.3, vibrato: { rate: 7, depth: 18 * p }, filter: { type: 'bandpass', f: 1100, q: 0.8 } });
          return 1;
        }
        if (happy || r < 0.5) { // petit hennissement doux (« nicker »), gorge qui vibre
          this.tone(d, { type: 'sawtooth', f: (happy ? 230 : 190) * p, curve: [[0.4, 140 * p]], dur: 0.45, gain: g(0.2), t, attack: 0.03, release: 0.15, vibrato: { rate: 24, depth: 28 * p }, filter: { type: 'lowpass', f: 900, q: 1 } });
          return 0.45;
        }
        this.tone(d, { type: 'sawtooth', f: 700 * p, curve: [[0.15, 1100 * p], [0.7, 600 * p]], dur: 0.75, gain: g(0.16), t, attack: 0.04, release: 0.2, vibrato: { rate: 14, depth: 40 * p }, filter: { type: 'bandpass', f: 1300, q: 0.8 } });
        return 0.75;
      }
      case 'dog': {
        if (sad) { // gémissement
          this.tone(d, { f: 600 * p, curve: [[0.25, 920 * p], [0.6, 640 * p]], dur: 0.62, gain: g(0.12), t, attack: 0.05, release: 0.2, vibrato: { rate: 6, depth: 14 } });
          return 0.62;
        }
        const n = happy ? 2 : 1;
        for (let i = 0; i < n; i++) {
          this.tone(d, { type: 'sawtooth', f: (happy ? 560 : 480) * p, curve: [[0.11, 240 * p]], dur: 0.13, gain: g(0.26), t: t + i * 0.22, attack: 0.008, release: 0.05, filter: { type: 'bandpass', f: 950 * Math.sqrt(p), q: 1.2 } });
        }
        return 0.13 + (n - 1) * 0.22;
      }
      case 'cat': {
        if (sad) {
          this.tone(d, { type: 'triangle', f: 400 * p, curve: [[0.25, 520 * p], [0.85, 300 * p]], dur: 0.9, gain: g(0.12), t, attack: 0.06, release: 0.25, vibrato: { rate: 5, depth: 10 }, filter: { type: 'bandpass', f: 1400, q: 0.7 } });
          return 0.9;
        }
        if (happy) { // « mrrp » court et clair
          this.tone(d, { type: 'triangle', f: 450 * p, curve: [[0.22, 720 * p]], dur: 0.25, gain: g(0.14), t, attack: 0.02, release: 0.08, vibrato: { rate: 30, depth: 12 }, filter: { type: 'bandpass', f: 1600, q: 0.8 } });
          return 0.25;
        }
        this.tone(d, { type: 'triangle', f: 520 * p, curve: [[0.18, 760 * p], [0.5, 420 * p]], dur: 0.55, gain: g(0.14), t, attack: 0.04, release: 0.15, vibrato: { rate: 5, depth: 12 }, filter: { type: 'bandpass', f: 1500, q: 0.7 } });
        return 0.55;
      }
      case 'rabbit': { // presque muet : petit reniflement, ou un couinement très doux
        if (sad) {
          this.tone(d, { f: 1500 * p, curve: [[0.3, 1150 * p]], dur: 0.32, gain: g(0.05), t, attack: 0.03, release: 0.1 });
          return 0.32;
        }
        if (happy) {
          this.tone(d, { f: 2200 * p, curve: [[0.07, 2700 * p]], dur: 0.08, gain: g(0.045), t, attack: 0.005, release: 0.03 });
          return 0.08;
        }
        this.burst(d, { t, dur: 0.07, gain: g(0.06), attack: 0.01, filter: { type: 'bandpass', f: 1800, q: 1.5 } });
        this.burst(d, { t: t + 0.13, dur: 0.06, gain: g(0.05), attack: 0.01, filter: { type: 'bandpass', f: 2000, q: 1.5 } });
        return 0.2;
      }
      case 'sheep': {
        const f = (sad ? 280 : happy ? 380 : 330) * p;
        const dur = sad ? 0.9 : happy ? 0.5 : 0.7;
        this.tone(d, { type: 'sawtooth', f, curve: [[dur * 0.3, f * 1.08], [dur, f * 0.9]], dur, gain: g(0.18), t, attack: 0.05, release: 0.15, vibrato: { rate: sad ? 6 : 9, depth: 30 * p }, filter: { type: 'bandpass', f: 700 * Math.sqrt(p), q: 1 } });
        return dur;
      }
      case 'goat': {
        const f = (sad ? 380 : happy ? 520 : 450) * p;
        const dur = sad ? 0.8 : happy ? 0.4 : 0.5;
        this.tone(d, { type: 'sawtooth', f, curve: [[dur * 0.25, f * 1.1], [dur, f * 0.85]], dur, gain: g(0.16), t, attack: 0.04, release: 0.12, vibrato: { rate: sad ? 8 : 13, depth: 45 * p }, filter: { type: 'bandpass', f: 1000 * Math.sqrt(p), q: 1.2 } });
        return dur;
      }
      case 'cow': {
        const f = (sad ? 100 : happy ? 140 : 120) * p;
        const dur = sad ? 1.5 : happy ? 0.8 : 1.2;
        this.tone(d, { type: 'sawtooth', f, curve: [[dur * 0.25, f * 1.25], [dur, f * 0.88]], dur, gain: g(0.26), t, attack: 0.08, release: 0.35, vibrato: { rate: 5, depth: 6 }, filter: { type: 'lowpass', f: 600 * Math.sqrt(p), q: 1 } });
        return dur;
      }
      default: { // espèce inconnue : petit cri neutre
        this.tone(d, { type: 'triangle', f: 600 * p, curve: [[0.2, 500 * p]], dur: 0.25, gain: g(0.1), t });
        return 0.25;
      }
    }
  }

  // ---------------------------------------------------------------- ambiance

  /**
   * Nappe continue : { weather: 'clear'|'cloudy'|'rain'|'storm'|'snow'|'fog', night: bool,
   * biome: 'countryside'|…, indoors: bool }. Peut être appelée souvent : rien ne change si l'état est le même.
   */
  ambience(state = {}) {
    const s = {
      weather: state.weather ?? 'clear',
      night: !!state.night,
      biome: state.biome ?? state.place ?? 'countryside',
      indoors: !!state.indoors,
    };
    const a = this.amb;
    if (a && a.weather === s.weather && a.night === s.night && a.biome === s.biome && a.indoors === s.indoors) return;
    this.amb = s;
    this.applyAmbience();
  }

  /** Applique l'état d'ambiance demandé, avec des fondus d'environ 2 s. */
  applyAmbience() {
    const s = this.amb;
    const c = this.ready();
    if (!s || !c || !this.ambBus) return;
    try {
      const t = c.currentTime;
      const ramp = (param, to, dur = 2) => {
        param.cancelScheduledValues(t);
        param.setValueAtTime(param.value, t);
        param.linearRampToValueAtTime(to, t + dur);
      };
      const w = WIND[s.weather] ?? WIND.clear;
      const cold = s.biome === 'mountain' || s.biome === 'tundra';
      const beach = s.biome === 'beach';
      const wet = s.weather === 'rain' || s.weather === 'storm';

      // Dedans : tout est assourdi et plus doux.
      ramp(this.ambFilter.frequency, s.indoors ? 520 : 18000, 1.2);
      ramp(this.ambBus.gain, s.indoors ? 0.45 : 1, 1.2);

      // Vent (ou ressac à la plage) : toujours un peu, plus fort en montagne.
      const wind = this.layer('wind', () => this.makeWind(c));
      const windLevel = w.level * (cold ? 1.4 : 1) * (s.night ? 0.85 : 1) * (beach && !wet ? 1.6 : 1);
      ramp(wind.g.gain, windLevel);
      ramp(wind.filter.frequency, beach && !wet ? 650 : w.f);
      wind.lfo.frequency.value = beach ? 0.08 : w.rate;
      wind.lfoG.gain.value = beach ? 300 : w.f * 0.55;

      // Pluie.
      const rainLevel = (RAIN[s.weather] ?? 0) * (s.indoors ? 0.55 : 1);
      this.setLayer('rain', rainLevel, () => this.makeRain(c));

      // Oiseaux le jour, grillons (et parfois une chouette) la nuit.
      const birds = s.night ? 0 : (BIRDS[s.biome] ?? 0.6) * (BIRDS_WEATHER[s.weather] ?? 0.5) * (s.indoors ? 0.3 : 1);
      this.setLayer('birds', birds > 0.05 ? 0.5 : 0, () => this.makeBirds(c, s));
      if (this.layers.birds) this.layers.birds.density = birds;
      const crickets = s.night && !wet && s.weather !== 'snow' ? (CRICKETS[s.biome] ?? 0.5) * (s.indoors ? 0.3 : 1) : 0;
      this.setLayer('crickets', crickets > 0.05 ? 0.09 * crickets : 0, () => this.makeCrickets(c));
      const owls = s.night && !wet && s.weather !== 'snow' && (s.biome === 'countryside' || s.biome === 'mountain' || s.biome === 'garden') ? 1 : 0;
      this.setLayer('owl', owls ? 0.5 : 0, () => this.makeOwl(c));

      // Orage : tonnerre de temps en temps (en plus de celui synchronisé avec l'éclair par le jeu).
      if (s.weather === 'storm') this.scheduleThunder();
      this.applied = s;
    } catch {
      /* rien */
    }
  }

  /** Nappe nommée, créée si besoin (ses nœuds restent tant qu'elle joue). */
  layer(name, make) {
    let l = this.layers[name];
    if (l) {
      if (l.kill) {
        clearTimeout(l.kill);
        this.timers.delete(l.kill);
        l.kill = null;
      }
      return l;
    }
    l = make();
    l.g.connect(this.ambBus);
    l.nodes.push(l.g);
    this.layers[name] = l;
    return l;
  }

  /** Niveau cible d'une nappe (fondu ~2 s) ; à 0 elle est démontée après le fondu. */
  setLayer(name, level, make) {
    const c = this.ctx;
    if (level <= 0) {
      const l = this.layers[name];
      if (!l) return;
      const t = c.currentTime;
      l.g.gain.cancelScheduledValues(t);
      l.g.gain.setValueAtTime(l.g.gain.value, t);
      l.g.gain.linearRampToValueAtTime(0, t + 2);
      if (!l.kill) l.kill = this.after(2300, () => this.killLayer(name));
      return;
    }
    const l = this.layer(name, make);
    const t = c.currentTime;
    l.g.gain.cancelScheduledValues(t);
    l.g.gain.setValueAtTime(l.g.gain.value, t);
    l.g.gain.linearRampToValueAtTime(level, t + 2);
  }

  killLayer(name) {
    const l = this.layers[name];
    if (!l) return;
    delete this.layers[name];
    if (l.timer) {
      clearTimeout(l.timer);
      this.timers.delete(l.timer);
    }
    for (const n of l.nodes) {
      try { n.stop?.(); } catch { /* rien */ }
    }
    this.untrack(l.nodes);
  }

  /** La source de bruit partagée (une seule, en boucle) : vent, pluie. */
  noiseSource() {
    if (this.noise) return this.noise;
    const c = this.ctx;
    const src = this.track(c.createBufferSource());
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.start();
    this.noise = src;
    return src;
  }

  fadeAll() {
    const c = this.ctx;
    if (!c) return;
    try {
      const t = c.currentTime;
      for (const name of Object.keys(this.layers)) this.setLayer(name, 0);
      this.ambBus.gain.cancelScheduledValues(t);
      this.ambBus.gain.setValueAtTime(this.ambBus.gain.value, t);
      this.ambBus.gain.linearRampToValueAtTime(0, t + 1.5);
      this.amb = null;
    } catch {
      /* rien */
    }
  }

  makeWind(c) {
    const noise = this.noiseSource();
    const filter = this.track(c.createBiquadFilter());
    filter.type = 'lowpass';
    filter.frequency.value = 300;
    filter.Q.value = 0.9;
    const g = this.track(c.createGain());
    g.gain.value = 0;
    // Rafales : la coupure du filtre ondule lentement.
    const lfo = this.track(c.createOscillator());
    lfo.type = 'sine';
    lfo.frequency.value = 0.18;
    const lfoG = this.track(c.createGain());
    lfoG.gain.value = 160;
    lfo.connect(lfoG);
    lfoG.connect(filter.frequency);
    lfo.start();
    noise.connect(filter);
    filter.connect(g);
    return { g, filter, lfo, lfoG, nodes: [filter, lfo, lfoG] };
  }

  makeRain(c) {
    const noise = this.noiseSource();
    const filter = this.track(c.createBiquadFilter());
    filter.type = 'bandpass';
    filter.frequency.value = 2800;
    filter.Q.value = 0.5;
    const g = this.track(c.createGain());
    g.gain.value = 0;
    noise.connect(filter);
    filter.connect(g);
    return { g, filter, nodes: [filter] };
  }

  /** Oiseaux : petits sifflets programmés au fil du temps (aucun nœud permanent à part le volume). */
  makeBirds(c, s) {
    const g = this.track(c.createGain());
    g.gain.value = 0;
    const l = { g, nodes: [], density: 0.5, gull: s.biome === 'beach' };
    const next = () => {
      l.timer = this.after(600 + ((this.clock() * 97) % 1) * 3400 / Math.max(0.2, l.density), () => {
        if (this.layers.birds !== l) return;
        if (this.ready()) this.chirp(l);
        next();
      });
    };
    next();
    return l;
  }

  chirp(l) {
    const c = this.ctx;
    const t = c.currentTime;
    const r = (k) => ((this.clock() * k) % 1);
    const pan = r(5.3) * 1.6 - 0.8;
    const vol = 0.35 + r(7.7) * 0.65;
    if (l.gull && r(2.9) < 0.5) { // mouette : « kyaa » descendant
      this.tone(l.g, { type: 'sawtooth', f: 1100, curve: [[0.08, 1400], [0.45, 800]], dur: 0.45, gain: 0.07 * vol, t, attack: 0.03, release: 0.2, pan, filter: { type: 'bandpass', f: 1800, q: 1.5 } });
      return;
    }
    // Un sifflet de 2 à 4 notes aiguës, chacune avec un petit glissando.
    const base = 2300 + r(3.7) * 1800;
    const n = 2 + Math.floor(r(1.9) * 3);
    for (let i = 0; i < n; i++) {
      const f = base * (1 + (r(11.1 + i) - 0.5) * 0.3);
      const up = r(4.4 + i) < 0.5;
      this.tone(l.g, { f, curve: [[0.07, up ? f * 1.25 : f * 0.8]], dur: 0.08 + r(6.1 + i) * 0.05, gain: 0.08 * vol, t: t + i * 0.13, attack: 0.01, release: 0.03, pan });
    }
  }

  /** Grillons : deux sifflets aigus continus hachés en petites impulsions (programmées, sans nœud en plus). */
  makeCrickets(c) {
    const g = this.track(c.createGain());
    g.gain.value = 0;
    const bugs = [[4200, 0.52, 0], [3700, 0.61, 0.3]].map(([f, period, offset]) => {
      const osc = this.track(c.createOscillator());
      osc.type = 'sine';
      osc.frequency.value = f;
      const og = this.track(c.createGain());
      og.gain.value = 0;
      osc.connect(og);
      og.connect(g);
      osc.start();
      return { osc, og, period, offset, next: c.currentTime + offset };
    });
    const l = { g, nodes: bugs.flatMap((b) => [b.osc, b.og]) };
    const plan = () => {
      l.timer = this.after(900, () => {
        if (this.layers.crickets !== l) return;
        const now = c.currentTime;
        for (const b of bugs) {
          // Un « cri-cri » = 4 impulsions de 18 ms ; programmées une seconde à l'avance.
          while (b.next < now + 1.1) {
            const t0 = Math.max(now, b.next);
            for (let i = 0; i < 4; i++) {
              const p = t0 + i * 0.034;
              b.og.gain.setValueAtTime(0, p);
              b.og.gain.linearRampToValueAtTime(1, p + 0.006);
              b.og.gain.setValueAtTime(1, p + 0.018);
              b.og.gain.linearRampToValueAtTime(0, p + 0.024);
            }
            b.next = t0 + b.period;
          }
        }
        plan();
      });
    };
    plan();
    return l;
  }

  /** Chouette : « hou-hou » doux, rare. */
  makeOwl(c) {
    const g = this.track(c.createGain());
    g.gain.value = 0;
    const l = { g, nodes: [] };
    const next = () => {
      l.timer = this.after(15000 + ((this.clock() * 41) % 1) * 40000, () => {
        if (this.layers.owl !== l) return;
        if (this.ready()) {
          const t = c.currentTime;
          const pan = ((this.clock() * 2.7) % 1) * 1.2 - 0.6;
          this.tone(l.g, { f: 420, curve: [[0.3, 360]], dur: 0.35, gain: 0.09, t, attack: 0.05, release: 0.15, pan, filter: { type: 'lowpass', f: 900 } });
          this.tone(l.g, { f: 400, curve: [[0.4, 330]], dur: 0.5, gain: 0.09, t: t + 0.5, attack: 0.05, release: 0.25, pan, filter: { type: 'lowpass', f: 900 } });
        }
        next();
      });
    };
    next();
    return l;
  }

  scheduleThunder() {
    if (this.thunderTimer) return;
    this.thunderTimer = this.after(7000 + ((this.clock() * 17) % 1) * 14000, () => {
      this.thunderTimer = null;
      if (this.amb?.weather !== 'storm') return;
      if (this.clock() - this.lastThunder > 6) this.thunder(0);
      this.scheduleThunder();
    });
  }

  /** Coup de tonnerre (bruit grave qui roule), delay secondes après l'éclair. */
  thunder(delay = 0.5) {
    const c = this.ready();
    if (!c) return false;
    this.lastThunder = this.clock();
    const t = c.currentTime + Math.max(0, delay);
    const near = delay < 0.6;
    const dest = this.ambBus;
    this.burst(dest, { t, dur: near ? 0.35 : 0.6, gain: near ? 0.5 : 0.25, attack: 0.02, filter: { type: 'lowpass', f: 420, q: 0.7, to: 120 }, decay: 'exp' });
    this.burst(dest, { t: t + 0.15, dur: 3.5, gain: near ? 0.5 : 0.35, attack: 0.3, filter: { type: 'lowpass', f: 210, q: 0.9, to: 55 }, decay: 'exp' });
    return true;
  }
}

/** Le moteur sonore du jeu (un seul). */
export const audio = new Audio();

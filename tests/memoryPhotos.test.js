// 📸 Les vraies photos des souvenirs en selle (src/sim/memories.js attachPhoto, src/game/Game.js memoryPhoto) : une
// seule par souvenir, en JPEG, petites, 6 par cheval et 18 dans la partie ; jamais une sauvegarde trop grosse.
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as THREE from 'three';
import { remember, memoriesOf, attachPhoto, PHOTO_MEMORIES, PHOTO } from '../src/sim/memories.js';
import { createAnimal } from '../src/sim/animal.js';
import { createProfile } from '../src/sim/profile.js';
import { activityData } from '../src/sim/activities.js';
import { MAX_SAVE_BYTES } from '../src/cloud/firebase.js';
import { seeded } from '../src/sim/rng.js';

const horse = (seed = 'ph') => createAnimal({ species: 'horse', breed: 'selle_francais', sex: 'f', ageDays: 2000, rng: seeded(seed) });
/** Une « photo » JPEG de n caractères. */
const jpeg = (n = 9000) => `data:image/jpeg;base64,${'A'.repeat(n - 23)}`;
const IDS = Object.keys(PHOTO_MEMORIES);
/** Un cheval qui a vécu toutes les grandes premières fois en selle. */
function rider(seed) {
  const a = horse(seed);
  IDS.forEach((id, i) => remember(a, id, i + 1));
  return a;
}
const bytes = (p) => new TextEncoder().encode(JSON.stringify(p)).length;

describe('📸 la photo d\'un souvenir', () => {
  it('une seule photo, pour une grande première fois en selle déjà notée', () => {
    const a = horse();
    const p = { animals: [a] };
    expect(attachPhoto(p, a, 'firstRide', jpeg())).toBe(false); // (pas encore de souvenir)
    remember(a, 'firstRide', 3);
    remember(a, 'firstVet', 4);
    expect(attachPhoto(p, a, 'firstVet', jpeg())).toBe(false); // (un souvenir des menus : son icône)
    expect(attachPhoto(p, a, 'nimporte', jpeg())).toBe(false);
    expect(attachPhoto(p, a, 'firstRide', jpeg())).toBe(true);
    expect(attachPhoto(p, a, 'firstRide', jpeg(5000))).toBe(false); // (déjà la sienne)
    expect(memoriesOf(a).find((m) => m.id === 'firstRide').ph).toBe(jpeg());
    expect(memoriesOf(a).find((m) => m.id === 'firstVet').ph).toBeUndefined();
  });

  it('seulement une petite image JPEG', () => {
    const a = horse();
    const p = { animals: [a] };
    remember(a, 'firstCanter', 3);
    expect(attachPhoto(p, a, 'firstCanter', 'data:image/png;base64,AAAA')).toBe(false);
    expect(attachPhoto(p, a, 'firstCanter', null)).toBe(false);
    expect(attachPhoto(p, a, 'firstCanter', jpeg(PHOTO.bytes + 1))).toBe(false);
    expect(attachPhoto(p, a, 'firstCanter', jpeg(PHOTO.bytes))).toBe(true);
  });

  it('6 par cheval, 18 dans la partie', () => {
    expect(IDS.length).toBeGreaterThan(PHOTO.perHorse);
    const horses = ['a', 'b', 'c', 'd'].map(rider);
    const p = { animals: horses };
    const [first, ...rest] = horses;
    IDS.forEach((id, i) => expect(attachPhoto(p, first, id, jpeg()), id).toBe(i < PHOTO.perHorse));
    for (const a of rest.slice(0, 2)) for (const id of IDS.slice(0, PHOTO.perHorse)) expect(attachPhoto(p, a, id, jpeg())).toBe(true);
    expect(PHOTO.total).toBe(18);
    expect(attachPhoto(p, rest[2], 'firstRide', jpeg())).toBe(false); // (la 19e)
  });

  it('pas pour un cheval qu\'on te confie (pension, en visite)', () => {
    for (const k of ['client', 'guest']) {
      const a = rider(k);
      a[k] = true;
      expect(attachPhoto({ animals: [a] }, a, 'firstRide', jpeg()), k).toBe(false);
    }
  });

  it('jamais une sauvegarde trop grosse pour être envoyée : sans la photo, alors', () => {
    const a = rider('lourd');
    const p = { animals: [a], junk: 'x'.repeat(PHOTO.saveMax - 5000) };
    expect(attachPhoto(p, a, 'firstRide', jpeg())).toBe(false);
    expect(a.memories.find((m) => m.id === 'firstRide').ph).toBeUndefined();
  });

  it('une grosse partie (3 chevaux pleins de photos, 24 photos de balade) garde 25 % de marge sous la limite en ligne', () => {
    expect(PHOTO.saveMax).toBeLessThanOrEqual(MAX_SAVE_BYTES * 0.75);
    const p = createProfile('Lou', 'manage');
    const sp = ['dog', 'cat', 'rabbit', 'sheep', 'goat', 'cow'];
    for (let i = 0; i < 30; i++) p.animals.push(createAnimal({ species: sp[i % sp.length], sex: i % 2 ? 'f' : 'm', ageDays: 900, rng: seeded(`b${i}`) }));
    const horses = ['a', 'b', 'c'].map(rider);
    p.animals.push(...horses);
    const d = activityData(p);
    for (let i = 0; i < 24; i++) d.photos.push({ sight: 'lake', day: i + 1, place: 'maison', data: jpeg(12000) });
    for (const a of horses) for (const id of IDS.slice(0, PHOTO.perHorse)) expect(attachPhoto(p, a, id, jpeg(PHOTO.bytes))).toBe(true);
    expect(bytes(p)).toBeLessThan(PHOTO.saveMax);
  });
});

describe('📸 dans le jeu (src/game/Game.js)', () => {
  let Game;
  let shots;
  beforeAll(async () => {
    globalThis.document = globalThis.document ?? { documentElement: {} };
    shots = 0;
    globalThis.document.createElement = () => ({ width: 0, height: 0, getContext: () => ({ drawImage() {} }), toDataURL: () => { shots++; return jpeg(); } });
    ({ Game } = await import('../src/game/Game.js'));
  }, 60000);

  /** Un jeu pour de faux : la caméra à 5 m derrière le point (0, 0, 0), qui le regarde. */
  const fakeGame = (a, { mounted = false, at = [0, 0, 0] } = {}) => {
    const camera = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 500);
    camera.position.set(0, 1.6, 5);
    camera.lookAt(0, 1, 0);
    camera.updateMatrixWorld();
    const e = { emitted: [], emit(x) { this.emitted.push(x); }, position: new THREE.Vector3(...at) };
    const profile = { memoryTip: true, animals: [a] };
    const g = {
      running: true, profile, day: 3, ui: { toast() {} }, mgmt: { active: false }, tripFlow: { view: null },
      entities: new Map([[a.id, e]]), player: { mount: mounted ? e : null }, camera, scene: {},
      renderer: { render() {}, domElement: { width: 780, height: 1688 } }, saved: 0, save() { this.saved++; },
      remember: Game.prototype.remember, memoryPhoto: Game.prototype.memoryPhoto,
    };
    return { g, e };
  };

  it('une grande première fois en selle : sa photo un peu après (pas pour un souvenir des menus)', () => {
    vi.useFakeTimers();
    try {
      const a = horse();
      const { g, e } = fakeGame(a, { mounted: true });
      const spy = vi.spyOn(g, 'memoryPhoto');
      g.remember(a, 'firstVet');
      g.remember(a, 'firstRide');
      vi.advanceTimersByTime(PHOTO_MEMORIES.firstRide * 1000 - 10);
      expect(spy).not.toHaveBeenCalled();
      vi.advanceTimersByTime(20);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(a, 'firstRide', g.profile);
      expect(memoriesOf(a).find((m) => m.id === 'firstRide').ph).toBe(jpeg());
      expect(e.emitted).toEqual(['📸']);
      expect(g.saved).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('pas de photo si quelque chose cache la 3D, ou si le cheval n\'est pas bien en vue', () => {
    const cases = [
      [{ mounted: true }, (g) => { g.ui.panel = {}; }],
      [{ mounted: true }, (g) => { g.ui.modalOpen = true; }],
      [{ mounted: true }, (g) => { g.ui.minigameOpen = true; }],
      [{ mounted: true }, (g) => { g.mgmt.active = true; }],
      [{ mounted: true }, (g) => { g.tripFlow.view = 'cab'; }],
      [{ mounted: true }, (g) => { g.profile = { animals: [] }; }], // (une autre partie ouverte entre-temps)
      [{ at: [0, 0, 15] }, () => {}], // (derrière la caméra)
      [{ at: [0, 0, -40] }, () => {}], // (trop loin)
      [{ at: [12, 0, 0] }, () => {}], // (hors de l'écran)
    ];
    for (const [opts, cover] of cases) {
      const a = horse();
      remember(a, 'firstCall', 3);
      const { g, e } = fakeGame(a, opts);
      const prof = g.profile;
      cover(g);
      const n = shots;
      Game.prototype.memoryPhoto.call(g, a, 'firstCall', prof);
      expect(a.memories[0].ph, JSON.stringify(opts)).toBeUndefined();
      expect(shots).toBe(n);
      expect(e.emitted).toEqual([]);
    }
    // En vue, à 5 m : la photo.
    const a = horse();
    remember(a, 'firstCall', 3);
    const { g, e } = fakeGame(a);
    Game.prototype.memoryPhoto.call(g, a, 'firstCall', g.profile);
    expect(a.memories[0].ph).toBe(jpeg());
    expect(e.emitted).toEqual(['📸']);
  });
});

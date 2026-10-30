// On monte toujours avec sa bombe, aussi en voyage à cheval : sur le chemin (src/game/TrailView.js attachCarrier,
// parti à pied) et remis en selle à l'arrivée (Game.travel). Avant, Player.ride direct : les cheveux au vent.
import { describe, it, expect, beforeAll } from 'vitest';
import * as THREE from 'three';
import { createProfile } from '../src/sim/profile.js';
import { riderHelmet } from '../src/sim/gear.js';

describe('la bombe en voyage à cheval', () => {
  let Game;
  let TrailView;
  beforeAll(async () => {
    ({ Game } = await import('../src/game/Game.js'));
    ({ TrailView } = await import('../src/game/TrailView.js'));
  }, 60000);

  /** Un cavalier qui note ce qu'on lui fait (la bombe d'abord, puis en selle). */
  const rider = () => {
    const calls = [];
    const pl = {
      calls, mount: null, helmet: null, heading: 0, speed: 0,
      root: new THREE.Group(), avatar: { root: new THREE.Group() },
      setHelmet(h) { this.helmet = h; calls.push(['helmet', h?.item ?? null]); },
      ride(e) { this.mount = e; this.session = { walk: 0, warm: false, started: false, hard: 0, cool: 0 }; calls.push(['ride', e.data.name]); }, // (Player.ride : une séance neuve)
      dismount() { this.mount = null; this.setHelmet(null); },
      seat() {},
    };
    return pl;
  };
  const fakeGame = () => {
    const p = createProfile('Lou');
    p.items.helmetSparkle = 1;
    p.rider = { helmet: { item: 'helmetSparkle', color: 'pink' } };
    const g = { profile: p, player: rider() };
    g.mountRider = Game.prototype.mountRider.bind(g);
    return g;
  };
  const horseEntity = (name = 'Étoile') => ({ data: { id: 'h1', name, species: 'horse' }, root: new THREE.Group(), radius: 1.2, updateStatus() {} });

  it('parti à pied (Voyager → 🐎 À cheval) : sur le chemin, en selle avec sa bombe', () => {
    const g = fakeGame();
    const horse = horseEntity();
    const view = { game: g, opts: { horse, followers: [] }, scene: new THREE.Scene() };
    TrailView.prototype.attachCarrier.call(view);
    expect(g.player.mount).toBe(horse);
    expect(g.player.helmet).toEqual(riderHelmet(g.profile));
    expect(g.player.calls).toEqual([['helmet', 'helmetSparkle'], ['ride', 'Étoile']]); // (la bombe avant : l'avatar refait une fois)
  });

  it('déjà en selle sur lui : rien ne change ; sur un autre : descendu, puis remonté avec sa bombe', () => {
    const g = fakeGame();
    const horse = horseEntity();
    g.player.mount = horse;
    TrailView.prototype.attachCarrier.call({ game: g, opts: { horse, followers: [] }, scene: new THREE.Scene() });
    expect(g.player.calls).toEqual([]);
    const other = horseEntity('Caramel');
    TrailView.prototype.attachCarrier.call({ game: g, opts: { horse: other, followers: [] }, scene: new THREE.Scene() });
    expect(g.player.mount).toBe(other);
    expect(g.player.helmet?.item).toBe('helmetSparkle');
  });

  it('à l\'arrivée (Game.travel) : le lieu rechargé le fait descendre, il remonte avec sa bombe', () => {
    const g = fakeGame();
    const p = g.profile;
    const a = { id: 'h1', name: 'Étoile', sex: 'f', species: 'horse', ageDays: 2000, location: p.place, needs: { energy: 90 }, gear: { halter: { item: 'halter' } } };
    p.animals.push(a);
    const e = { data: a };
    Object.assign(g, {
      entities: new Map([[a.id, e]]), toasts: [],
      ui: { toast: (m) => g.toasts.push(m) },
      animalsHere: Game.prototype.animalsHere.bind(g),
      remember() {}, xp() {}, save() {},
      loadPlace() { g.player.dismount(); }, // (Game.loadPlace : le cavalier descend, sa bombe ôtée)
    });
    g.player.mount = e;
    expect(Game.prototype.travel.call(g, 'bretagne', 'horse', [a.id], { trip: {} })).toBeTruthy();
    expect(p.place).toBe('bretagne');
    expect(g.player.mount).toBe(e);
    expect(g.player.helmet?.item).toBe('helmetSparkle');
    expect(g.player.calls.slice(-2)).toEqual([['helmet', 'helmetSparkle'], ['ride', 'Étoile']]);
    // 🐢 des heures de route sous toi : échauffée (pas de « Pense à l'échauffer » au premier trot, ni d'effort en plus)
    expect(g.player.session).toMatchObject({ warm: true, started: true });
    expect(a.warmAt).toBe(p.clock);
  });
});

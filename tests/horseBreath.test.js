// 🌬️ La buée en 3D (src/game/HorseBreath.js) : des bouffées à chaque expiration quand il fait froid, rien quand il
// fait doux, jamais plus de 24 sprites ; le petit mot une seule fois ; la vapeur d'un cheval en sueur.
import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { HorseBreath } from '../src/game/HorseBreath.js';
import { BREATH_FX } from '../src/sim/breath.js';

const TAU = Math.PI * 2;
const DT = 1 / 60;

/** Un cheval réaliste réduit à ce que la buée lit : tête, groupe à l'échelle, phase de respiration, sueur. */
const horse = (x = 0, z = 0, name = 'Étoile') => {
  const root = new THREE.Object3D();
  root.position.set(x, 0, z);
  const scaleGroup = new THREE.Object3D();
  root.add(scaleGroup);
  const head = new THREE.Object3D();
  head.position.set(0, 1.5, 1);
  head.rotation.x = 0.8; // (le nez vers le bas et l'avant)
  scaleGroup.add(head);
  const scene = new THREE.Scene();
  scene.add(root);
  return {
    root, scaleGroup, scale: 1, inside: false,
    get position() {
      return root.position;
    },
    model: { real: true, head, dims: { snoutZ: 0.55, L: 1.5 }, anim: { breathPh: 0, effort: 0 }, saddleY: 1.3 },
    data: { species: 'horse', sweat: 0, name, sex: 'f' },
  };
};

/** La caméra à 4 m, tournée vers le cheval en 0 (vers -z). */
const fakeGame = (temperature, weather = 'clear') => {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
  camera.position.set(0, 1.6, 4);
  camera.lookAt(0, 1, 0);
  return {
    temperature, weather, camera,
    player: { position: new THREE.Vector3(0, 0, 3) },
    profile: {},
    ui: { toast: vi.fn() },
  };
};

/** sec secondes de jeu : la phase avance à hz respirations par seconde (comme horseReal.js), la buée suit. */
const run = (fx, g, horses, sec, hz = 0.2, onStep = null) => {
  for (let i = 0; i < Math.round(sec / DT); i++) {
    for (const e of horses) e.model.anim.breathPh = (e.model.anim.breathPh + DT * hz * TAU) % TAU;
    fx.update(DT, horses, g);
    onStep?.(fx);
  }
};

describe('la buée en 3D', () => {
  it('à 0 °C, une respiration fait des bouffées (jamais plus de 24 sprites)', () => {
    const scene = new THREE.Scene();
    const fx = new HorseBreath(scene);
    const g = fakeGame(0);
    const e = horse();
    let most = 0;
    run(fx, g, [e], 5, 0.2, (b) => (most = Math.max(most, b.live)));
    expect(fx.breaths).toBe(1);
    expect(most).toBeGreaterThan(0);
    // (deux naseaux)
    expect(most).toBe(2);
    // Essoufflé, trois chevaux tout près pendant 20 s : le nombre de sprites reste plafonné.
    const many = [e, horse(1, 0), horse(-1, 0), horse(0, 1)];
    for (const h of many) h.model.anim.effort = 1;
    run(fx, g, many, 20, 1, (b) => (most = Math.max(most, b.live)));
    expect(most).toBeLessThanOrEqual(BREATH_FX.pool);
    expect(scene.children.filter((c) => c.isSprite).length).toBeLessThanOrEqual(BREATH_FX.pool);
    // (au plus 3 chevaux suivis : 3 × 20 expirations, pas 4)
    expect(fx.breaths).toBeLessThanOrEqual(1 + 3 * 20 + 3);
    expect(fx.breaths).toBeGreaterThanOrEqual(1 + 3 * 19);
  });

  it('les bouffées sortent du bout du nez, vers le bas et l\'avant', () => {
    const scene = new THREE.Scene();
    const fx = new HorseBreath(scene);
    const e = horse();
    e.model.anim.breathPh = BREATH_FX.exhaleAt - 0.01;
    fx.update(DT, [e], fakeGame(0));
    e.model.anim.breathPh = BREATH_FX.exhaleAt + 0.01;
    fx.update(DT, [e], fakeGame(0));
    const s = scene.children.filter((c) => c.isSprite && c.visible);
    expect(s).toHaveLength(2);
    const nose = new THREE.Vector3(0, -0.12 * 0.55, 0.97 * 0.55).applyMatrix4(e.model.head.matrixWorld);
    for (const p of s) expect(p.position.distanceTo(nose)).toBeLessThan(0.08);
    expect(s[0].position.x).not.toBeCloseTo(s[1].position.x, 3);
    const v = fx.parts.find((p) => p.s === s[0]).v;
    expect(v.z).toBeGreaterThan(0);
    expect(v.y).toBeLessThan(0);
  });

  it('à 15 °C, rien ; et 3 s sans expiration, tout est retombé', () => {
    const warm = new HorseBreath(new THREE.Scene());
    run(warm, fakeGame(15), [horse()], 10);
    expect(warm.live).toBe(0);
    expect(warm.breaths).toBe(0);
    expect(warm.parts).toHaveLength(0);
    const fx = new HorseBreath(new THREE.Scene());
    const e = horse();
    run(fx, fakeGame(0), [e], 1.5);
    expect(fx.live).toBe(2);
    run(fx, fakeGame(0), [e], 3, 0); // (il retient sa respiration : la phase ne bouge plus)
    expect(fx.live).toBe(0);
  });

  it('un cheval trop loin de la caméra ou rentré : rien', () => {
    const fx = new HorseBreath(new THREE.Scene());
    const far = horse(0, -BREATH_FX.near - 6);
    const hidden = horse();
    hidden.inside = true;
    run(fx, fakeGame(0), [far, hidden], 6);
    expect(fx.breaths).toBe(0);
  });

  it('le troupeau derrière la caméra ne prend pas la place du cheval qu\'on regarde', () => {
    const scene = new THREE.Scene();
    const fx = new HorseBreath(scene);
    const g = fakeGame(0);
    // (trois chevaux broutent 2 à 4 m derrière la caméra, tout près du joueur ; celui qu'on regarde est à 10 m devant)
    const herd = [horse(0, 6, 'Pomme'), horse(1, 7, 'Caramel'), horse(-1, 8, 'Noisette')];
    const seen = horse(0, -6);
    run(fx, g, [...herd, seen], 12);
    expect(fx.track.has(seen)).toBe(true);
    for (const e of herd) expect(fx.track.has(e)).toBe(false);
    expect(fx.breaths).toBeGreaterThanOrEqual(2);
    for (const p of fx.parts) expect(p.s.position.z).toBeLessThan(0);
    // (pas de petit mot pour un cheval qu'on ne voit pas, même tout près du joueur)
    expect(g.ui.toast).not.toHaveBeenCalled();
    // Monté, à la première personne : son cheval est sous la caméra, il souffle quand même.
    const ridden = horse(0, 6);
    ridden.ridden = true;
    const fx2 = new HorseBreath(new THREE.Scene());
    run(fx2, fakeGame(0), [ridden], 5);
    expect(fx2.breaths).toBe(1);
  });

  it('le petit mot, une seule fois', () => {
    const fx = new HorseBreath(new THREE.Scene());
    const g = fakeGame(0);
    run(fx, g, [horse()], 12);
    expect(fx.breaths).toBe(3);
    expect(g.ui.toast).toHaveBeenCalledTimes(1);
    expect(g.ui.toast.mock.calls[0][0]).toContain('Étoile');
    expect(g.profile.seenBreath).toBe(true);
    // (une autre partie déjà prévenue : rien)
    const again = new HorseBreath(new THREE.Scene());
    const g2 = { ...fakeGame(0), profile: { seenBreath: true }, ui: { toast: vi.fn() } };
    run(again, g2, [horse()], 6);
    expect(g2.ui.toast).not.toHaveBeenCalled();
  });

  it('en sueur à 2 °C : il fume du dos, même sans expirer ; sec, rien', () => {
    const fx = new HorseBreath(new THREE.Scene());
    const e = horse();
    e.data.sweat = 0.8;
    run(fx, fakeGame(2), [e], 1, 0);
    expect(fx.breaths).toBe(0);
    expect(fx.live).toBeGreaterThan(0);
    const back = fx.parts.find((p) => p.age < p.life).s.position;
    expect(back.y).toBeGreaterThan(1.2);
    const dry = new HorseBreath(new THREE.Scene());
    run(dry, fakeGame(2), [horse()], 1, 0);
    expect(dry.live).toBe(0);
  });

  it('changer de lieu efface tout', () => {
    const fx = new HorseBreath(new THREE.Scene());
    run(fx, fakeGame(0), [horse()], 1.5);
    expect(fx.live).toBeGreaterThan(0);
    fx.clear();
    expect(fx.live).toBe(0);
    expect(fx.parts.every((p) => !p.s.visible)).toBe(true);
  });
});

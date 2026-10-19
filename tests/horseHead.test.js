// Port de tête relevé et oreilles calmes (plan « cheval beau », étape 3), et pose de photo (tête haute, à
// l'arrêt, la même à chaque fois). GLB chargé dans node, sans textures ; rien ne dépend du hasard.
import { describe, it, expect, beforeAll, afterEach } from 'vitest';
import * as THREE from 'three';
import { realHorseBase, buildRealHorseModel, HEAD_UP } from '../src/game/models/horseReal.js';
import { gfx } from '../src/game/gfx.js';
import { createAnimal } from '../src/sim/animal.js';
import { SPECIES } from '../src/sim/species.js';
import { loadRealHorseGltf } from './fixtures/realHorseGltf.js';

let gltf;
beforeAll(async () => {
  gltf = await loadRealHorseGltf();
  realHorseBase(gltf); // (données de repos tirées une fois ici : le premier test ne dépasse pas son temps)
}, 60000);

const quality = gfx.quality;
afterEach(() => {
  gfx.quality = quality;
});

const BREEDS = SPECIES.horse.breeds.map((b) => b.id);
const animal = (breed, { foal = false, colorIndex = 0 } = {}) => createAnimal({ species: 'horse', breed, colorIndex, ageDays: foal ? 60 : 900, seed: 77 });
const horse = (breed, opts = {}) => {
  const a = animal(breed, opts);
  return buildRealHorseModel(opts.foal ? { ...a.look, foal: true } : a.look, a.breed, gltf);
};

/** Instants des clips fixés (le constructeur de l'animation les tire au hasard) : animation reproductible. */
function fixClips(md) {
  for (const a of Object.values(md.anim.actions)) a.time = 0;
  md.anim.t = 0;
  md.anim.resting = false;
  md.anim.restTimer = 1e9;
}

/** Chanfrein (nuque → bout du nez) sous l'horizontale, en degrés, et hauteur de la nuque (repère du cheval). */
function headCarriage(md) {
  md.root.updateMatrixWorld(true);
  const poll = md.head.getWorldPosition(new THREE.Vector3());
  const tip = md.head.localToWorld(new THREE.Vector3(...md.snoutTip));
  const d = tip.clone().sub(poll);
  return { deg: (Math.atan2(-d.y, Math.hypot(d.x, d.z)) * 180) / Math.PI, poll: poll.y, tipY: tip.y };
}

const still = { v: 0, moving: false, sleeping: false, sad: false, graze: 0, feeder: 0, turn: 0, fat: 1 };

describe('port de tête (étape 3)', () => {
  it.each(BREEDS)('%s : à l\'arrêt, tête relevée (chanfrein entre 40° et 58° sous l\'horizontale)', (breed) => {
    const md = horse(breed);
    md.photoPose();
    const { deg } = headCarriage(md);
    expect(deg).toBeGreaterThan(40);
    expect(deg).toBeLessThan(58);
    md.dispose();
  });

  it('relève la tête par rapport aux clips seuls (environ 17°), nuque plus haute', () => {
    const md = horse('selle_francais');
    md.photoPose();
    const up = headCarriage(md);
    // sans le port de tête : on retire les deux rotations
    md.neck.rotateX(HEAD_UP.neck);
    md.head.rotateX(HEAD_UP.head);
    const down = headCarriage(md);
    expect(down.deg - up.deg).toBeGreaterThan(12);
    expect(up.poll - down.poll).toBeGreaterThan(0.06);
    md.dispose();
  });

  it.each(['selle_francais', 'shetland', 'frison', 'arabe', 'percheron'])('%s : au broutage, le bout du nez touche encore l\'herbe', (breed) => {
    const md = horse(breed);
    fixClips(md);
    for (let f = 0; f < 240; f++) md.anim.update(1 / 30, { ...still, graze: 1 }, {});
    expect(md.anim.w.eat).toBeGreaterThan(0.98);
    expect(md.anim.proud).toBeLessThan(0.03);
    md.root.updateMatrixWorld(true);
    const mouth = md.head.localToWorld(new THREE.Vector3(0, -0.12 * md.dims.snoutZ, md.dims.snoutZ * 0.97));
    expect(mouth.y).toBeLessThan(0.09);
    md.dispose();
  });

  it('au galop, la tête ne passe pas au-dessus du dos de plus de 0,4 m', () => {
    const md = horse('selle_francais');
    fixClips(md);
    const st = { ...still, v: 12, moving: true };
    let worst = -Infinity;
    for (let f = 0; f < 300; f++) {
      md.anim.update(1 / 60, st, {});
      if (f > 120) worst = Math.max(worst, headCarriage(md).poll - md.saddleY);
    }
    expect(md.anim.w.gallop).toBeGreaterThan(0.9);
    expect(worst).toBeLessThan(0.4);
    md.dispose();
  });

  it('oreilles calmes : jamais couchées de plus de 25° à l\'arrêt (10 min)', () => {
    const md = horse('pur_sang');
    fixClips(md);
    let worst = 0;
    const qRel = new THREE.Quaternion();
    for (let f = 0; f < 6000; f++) {
      md.anim.update(0.1, still, {});
      for (const e of md.ears) {
        qRel.copy(e.userData.restQ).invert().multiply(e.quaternion);
        worst = Math.max(worst, (2 * Math.acos(Math.min(1, Math.abs(qRel.w))) * 180) / Math.PI);
      }
    }
    expect(worst).toBeLessThan(25);
    md.dispose();
  });

  it('pose de photo : la même à chaque fois, sans broutage ni regard de côté', () => {
    const a = horse('haflinger');
    const b = horse('haflinger');
    a.anim.t = 123.4;
    a.photoPose();
    b.photoPose();
    // (composante par composante : angleTo, par un arc cosinus près de 1, grossit les erreurs d'arrondi)
    for (let i = 0; i < a.groups.length; i++) {
      const qa = a.groups[i].quaternion.toArray();
      const qb = b.groups[i].quaternion.toArray();
      for (let k = 0; k < 4; k++) expect(Math.abs(qa[k] - qb[k])).toBeLessThan(1e-5);
    }
    expect(a.anim.w.eat).toBe(0);
    expect(a.anim.t).toBe(123.4); // (l'horloge de l'animation n'est pas touchée)
    a.dispose();
    b.dispose();
  });
});


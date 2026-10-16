// Bergerie, clôture du troupeau et pré : ajoutés à chaque lieu par World.build().

import * as THREE from 'three';
import { sheepfold, kennel, hutch, wireFence } from './models/equipment.js';
import { PEN, FIELD } from './AnimalEntity.js';
import { enclosure, fenceColliders } from './nav.js';
import * as B from './models/buildings.js';
import { t } from '../i18n.js';
import { coreAt } from './coreLayout.js'; // installations déplaçables (vue d'ensemble)

const W = 20;
const D = 14;
const GATE = 4;

// Sellerie (bâtiment où l'on entre, construit par src/game/Interiors.js) et maison des animaux (à la maison seulement).
export const TACKROOM = { x: -24, z: -17.5 };
export const PETHOUSE = { x: -12, z: -17, door: { x: -12, z: -13.4 } };

export function buildFarm(world, group, isHome = false) {
  const cx = PEN.x;
  const cz = PEN.z;
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7650, roughness: 0.9 });
  const sides = [
    { x: cx, z: cz - D / 2, len: W, alongX: true },
    { x: cx - W / 2, z: cz, len: D, alongX: false },
    { x: cx + W / 2, z: cz, len: D, alongX: false },
    { x: cx - (W / 4 + GATE / 4), z: cz + D / 2, len: W / 2 - GATE / 2, alongX: true },
    { x: cx + (W / 4 + GATE / 4), z: cz + D / 2, len: W / 2 - GATE / 2, alongX: true },
  ];
  for (const s of sides) {
    const y = world.heightAt(s.x, s.z);
    for (const h of [0.45, 0.9]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(s.alongX ? s.len : 0.08, 0.1, s.alongX ? 0.08 : s.len), wood);
      rail.position.set(s.x, y + h, s.z);
      rail.castShadow = true;
      group.add(rail);
    }
    const n = Math.max(2, Math.round(s.len / 2.5) + 1);
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) - 0.5;
      const px = s.alongX ? s.x + t * s.len : s.x;
      const pz = s.alongX ? s.z : s.z + t * s.len;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 0.14), wood);
      post.position.set(px, world.heightAt(px, pz) + 0.55, pz);
      post.castShadow = true;
      group.add(post);
    }
  }
  // Barrières de la bergerie et du paddock : on ne passe que par l'ouverture.
  world.colliders.push(...fenceColliders(enclosure('pen')), ...fenceColliders(enclosure('paddock')));
  world.fences = [...fenceColliders(enclosure('pen')), ...fenceColliders(enclosure('paddock'))];

  world.colliders.push(...fenceColliders(enclosure('hutch')));

  // Obstacles solides : bottes de foin, abreuvoir, barre de saut (franchissable à cheval).
  const pad = (x, z) => { const [px, pz] = coreAt('paddock', x, z); return { x: px, z: pz }; };
  world.colliders.push(
    { ...pad(-21.5, 21), hw: 0.7, hd: 0.7, small: true },
    { ...pad(-27, 8), hw: 0.7, hd: 0.7, small: true },
    { ...pad(-21.5, 11), hw: 0.45, hd: 1, small: true },
    { ...pad(-16, 16), hw: 0.15, hd: 1.7, jump: true },
  );

  // Niche des chiens
  const k = kennel();
  const [kx, kz] = coreAt('kennel', -9, -7);
  k.position.set(kx, world.heightAt(kx, kz), kz);
  group.add(k);
  world.colliders.push({ x: kx, z: kz, hw: 0.8, hd: 0.9, small: true });
  world.interactables.push({ kind: 'kennel', x: kx, z: kz + 1.6 });

  // Clapier et son enclos grillagé
  const hu = enclosure('hutch');
  const hb = hutch();
  hb.position.set(hu.x, world.heightAt(hu.x, hu.z - 1.4), hu.z - 1.4);
  group.add(hb);
  for (const s of [
    { x: hu.x, z: hu.z - hu.hd, len: hu.hw * 2, alongX: true },
    { x: hu.x - hu.hw, z: hu.z, len: hu.hd * 2, alongX: false },
    { x: hu.x + hu.hw, z: hu.z, len: hu.hd * 2, alongX: false },
    { x: hu.x - (hu.hw + 0.6) / 2, z: hu.z + hu.hd, len: hu.hw - 0.6, alongX: true },
    { x: hu.x + (hu.hw + 0.6) / 2, z: hu.z + hu.hd, len: hu.hw - 0.6, alongX: true },
  ]) {
    const f = wireFence(s.len, s.alongX);
    f.position.set(s.x, world.heightAt(s.x, s.z), s.z);
    group.add(f);
  }
  world.interactables.push({ kind: 'hutch', x: hu.x, z: hu.z + hu.hd + 1 });
  world.interactables.push({ kind: 'paddock', ...pad(-7.6, 16) });

  // Animalerie (à la maison) : on y choisit et on y achète son animal.
  if (isHome) {
    const shop = B.refuge(t('bld_petshop'), true);
    shop.group.position.set(18, world.heightAt(18, -20), -20);
    shop.group.rotation.y = -Math.PI / 2;
    group.add(shop.group);
    world.colliders.push({ x: 18, z: -20, hw: 3.8, hd: 4.8, kind: 'petshop' });
    world.interactables.push({ kind: 'petshop', x: 18 - 4.9, z: -20 });

    // (La sellerie, à côté de l'écurie, est un bâtiment où l'on entre : voir src/game/Interiors.js.)

    // Maison des animaux : on y range chiens, chats et lapins pour la nuit.
    const ph = B.petHouse(t('bld_pethouse'));
    ph.group.position.set(PETHOUSE.x, world.heightAt(PETHOUSE.x, PETHOUSE.z), PETHOUSE.z);
    group.add(ph.group);
    world.colliders.push({ x: PETHOUSE.x, z: PETHOUSE.z, hw: 4.3, hd: 2.8, kind: 'pethouse' });
    world.interactables.push({ kind: 'pethouse', ...PETHOUSE.door });
    world.petHouse = PETHOUSE;
    world.clearZones.push({ x: TACKROOM.x, z: TACKROOM.z, r: 6 }, { x: PETHOUSE.x, z: PETHOUSE.z, r: 5.5 });
  } else {
    world.petHouse = null;
  }

  const fold = sheepfold();
  fold.position.set(cx, world.heightAt(cx, cz - D / 2 + 2.6), cz - D / 2 + 2.6);
  group.add(fold);

  world.interactables.push({ kind: 'pen', x: PEN.gate.x, z: PEN.gate.z - 1 });
  world.clearZones.push({ x: hu.x, z: hu.z, r: 4 }, { x: kx, z: kz, r: 2.5 }, { x: cx, z: cz, r: 13 }, { x: FIELD.x, z: FIELD.z, r: FIELD.r + 3 }, { x: PEN.gate.x, z: PEN.gate.z + 6, r: 6 });
}

// Bergerie, clôture du troupeau et pré : ajoutés à chaque lieu par World.build().

import * as THREE from 'three';
import { sheepfold } from './models/equipment.js';
import { PEN, FIELD } from './AnimalEntity.js';
import { enclosure, fenceColliders } from './nav.js';

const W = 20;
const D = 14;
const GATE = 4;

export function buildFarm(world, group) {
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

  const fold = sheepfold();
  fold.position.set(cx, world.heightAt(cx, cz - D / 2 + 2.6), cz - D / 2 + 2.6);
  group.add(fold);

  world.interactables.push({ kind: 'pen', x: PEN.gate.x, z: PEN.gate.z - 1 });
  world.clearZones.push({ x: cx, z: cz, r: 13 }, { x: FIELD.x, z: FIELD.z, r: FIELD.r + 3 }, { x: PEN.gate.x, z: PEN.gate.z + 6, r: 6 });
}

// Installations de base de chaque lieu (bergerie, paddock, clapier et son enclos grillagé, niche),
// et à la maison : animalerie, sellerie et maison des animaux. Ajoutées par World.build().
// Les installations de base sont dans leur propre groupe (world.coreGroup) : quand le joueur en déplace
// ou en agrandit une (vue construction), rebuildCores() les refait sans reconstruire tout le lieu.
// Leur place et leur taille viennent de coreLayout.js (enclosure('pen'), enclosure('paddock')…).

import * as THREE from 'three';
import { sheepfold, kennel, hutch, wireFence } from './models/equipment.js';
import { PEN, FIELD } from './AnimalEntity.js';
import { enclosure, fenceColliders } from './nav.js';
import * as B from './models/buildings.js';
import { t } from '../i18n.js';
import { coreAt } from './coreLayout.js'; // installations déplaçables (vue d'ensemble)
import { tackRoomPos, TACKROOM_SIZE, petHousePos, PETHOUSE_SIZE } from '../sim/facilities.js';
import { buildHutchToys } from './showground.js'; // jouets des lapins (activités)

const GATE = 4;

// Sellerie et maison des animaux (à la maison seulement). Elles reculent quand on rallonge l'écurie.
export const TACKROOM = { ...tackRoomPos(0) };
export const PETHOUSE = petHousePos(0);

/** Taille de l'écurie (0, 1 ou 2) : place de la sellerie et de la maison des animaux. Appelé avant World.build. */
export function setStableExt(ext) {
  Object.assign(TACKROOM, tackRoomPos(ext));
  Object.assign(PETHOUSE, petHousePos(ext));
}

function disposeGroup(g) {
  g.traverse((o) => {
    if (!o.isMesh && !o.isInstancedMesh) return;
    o.geometry.dispose();
    for (const m of [].concat(o.material)) {
      if (m.map && !m.map.userData?.shared) m.map.dispose();
      if (m.normalMap && !m.normalMap.userData?.shared) m.normalMap.dispose();
      m.dispose();
    }
  });
}

/** Barrière en bois (lisses et poteaux) d'un enclos rectangulaire, ouverte au milieu du côté +z. */
function woodFence(world, group, e, gate) {
  const { x: cx, z: cz } = e;
  const W = e.hw * 2;
  const D = e.hd * 2;
  const wood = new THREE.MeshStandardMaterial({ color: 0x9a7650, roughness: 0.9 });
  const sides = [
    { x: cx, z: cz - D / 2, len: W, alongX: true },
    { x: cx - W / 2, z: cz, len: D, alongX: false },
    { x: cx + W / 2, z: cz, len: D, alongX: false },
    { x: cx - (W / 4 + gate / 4), z: cz + D / 2, len: W / 2 - gate / 2, alongX: true },
    { x: cx + (W / 4 + gate / 4), z: cz + D / 2, len: W / 2 - gate / 2, alongX: true },
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
      const k = i / (n - 1) - 0.5;
      const px = s.alongX ? s.x + k * s.len : s.x;
      const pz = s.alongX ? s.z : s.z + k * s.len;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.15, 0.14), wood);
      post.position.set(px, world.heightAt(px, pz) + 0.55, pz);
      post.castShadow = true;
      group.add(post);
    }
  }
}

/**
 * Les installations de base (dans un groupe à part, world.coreGroup). Leurs colliders, barrières et
 * portes portent core: id, pour que rebuildCores() les retrouve.
 */
export function buildCores(world, parent) {
  const group = new THREE.Group();
  group.userData.cores = true;
  parent.add(group);
  world.coreGroup = group;
  const tag = (id, list) => list.map((c) => ({ ...c, core: id }));
  const deco = (obj, x, z, ry = 0) => {
    obj.position.set(x, world.heightAt(x, z), z);
    obj.rotation.y = ry;
    group.add(obj);
  };

  // Bergerie : barrière, abri au fond.
  const pe = enclosure('pen');
  woodFence(world, group, pe, GATE);
  const fold = sheepfold();
  deco(fold, pe.x, pe.z - pe.hd + 2.6);

  // Paddock : barrière blanche, sable et barre de saut ; abreuvoir et bottes de foin dans les coins.
  const pd = enclosure('paddock');
  const base = world.heightAt(pd.x, pd.z);
  // Le modèle est tourné d'un quart de tour (son ouverture regarde vers +x) : (lx, lz) → (x + lz, z - lx).
  const model = B.paddock(pd.hd * 2, pd.hw * 2, (lx, lz) => world.heightAt(pd.x + lz, pd.z - lx) - base);
  model.position.set(pd.x, base, pd.z);
  model.rotation.y = Math.PI / 2;
  group.add(model);
  const x0 = pd.x - pd.hw;
  const z0 = pd.z - pd.hd;
  const z1 = pd.z + pd.hd;
  deco(B.trough(), x0 + 1.5, z0 + 4, Math.PI / 2);
  deco(B.hayBale(), x0 + 1.5, z1 - 4);
  deco(B.hayBale(), x0 + 2, z0 + 1.5, 0.4);

  // Barrières de la bergerie et du paddock : on ne passe que par l'ouverture.
  const fences = [...tag('pen', fenceColliders(pe)), ...tag('paddock', fenceColliders(pd))];
  world.colliders.push(...fences, ...tag('hutch', fenceColliders(enclosure('hutch'))));
  world.fences = [...(world.fences ?? []), ...fences];
  // Obstacles solides : bottes de foin, abreuvoir, barre de saut (franchissable à cheval).
  world.colliders.push(...tag('paddock', [
    { x: x0 + 1.5, z: z1 - 4, hw: 0.7, hd: 0.7, small: true },
    { x: x0 + 2, z: z0 + 1.5, hw: 0.7, hd: 0.7, small: true },
    { x: x0 + 1.5, z: z0 + 4, hw: 0.45, hd: 1, small: true },
    { x: pd.x, z: pd.z, hw: 0.15, hd: 1.7, jump: true },
  ]));

  // Niche des chiens
  const k = kennel();
  const [kx, kz] = coreAt('kennel', -9, -7);
  deco(k, kx, kz);
  world.colliders.push({ x: kx, z: kz, hw: 0.8, hd: 0.9, small: true, core: 'kennel' });

  // Clapier (au fond) et son enclos grillagé
  const hu = enclosure('hutch');
  const hb = hutch();
  deco(hb, hu.x, hu.z - hu.hd + 0.8);
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
  buildHutchToys(world, group);

  // Où l'on se tient pour s'en occuper (devant l'entrée).
  world.interactables.push(
    { kind: 'kennel', x: kx, z: kz + 1.6, core: 'kennel' },
    { kind: 'hutch', x: hu.x, z: hu.z + hu.hd + 1, core: 'hutch' },
    { kind: 'paddock', x: pd.x + pd.hw + 1.4, z: pd.z, core: 'paddock' },
    { kind: 'pen', x: PEN.gate.x, z: PEN.gate.z - 1, core: 'pen' },
  );
  world.clearZones.push(
    { x: hu.x, z: hu.z, r: Math.hypot(hu.hw, hu.hd) + 1 }, { x: kx, z: kz, r: 2.5 },
    { x: pe.x, z: pe.z, r: Math.hypot(pe.hw, pe.hd) + 1 }, { x: PEN.gate.x, z: PEN.gate.z + 6, r: 6 },
  );
}

/** Refait les installations de base (déplacées ou agrandies) sans reconstruire le reste du lieu. */
export function rebuildCores(world) {
  if (world.coreGroup) {
    world.coreGroup.parent?.remove(world.coreGroup);
    disposeGroup(world.coreGroup);
  }
  world.colliders = world.colliders.filter((c) => !c.core);
  world.interactables = world.interactables.filter((i) => !i.core);
  world.fences = (world.fences ?? []).filter((f) => !f.core);
  buildCores(world, world.group);
}

export function buildFarm(world, group, isHome = false) {
  buildCores(world, group);

  // Animalerie (à la maison) : on y choisit et on y achète son animal.
  if (isHome) {
    const shop = B.refuge(t('bld_petshop'), true);
    shop.group.position.set(18, world.heightAt(18, -20), -20);
    shop.group.rotation.y = -Math.PI / 2;
    group.add(shop.group);
    world.colliders.push({ x: 18, z: -20, hw: 3.8, hd: 4.8, kind: 'petshop' });
    world.interactables.push({ kind: 'petshop', x: 18 - 4.9, z: -20 });

    // Sellerie, à côté de l'écurie : selles, filets, licols et outils.
    const tk = B.tackRoom(t('bld_tackroom'));
    tk.group.position.set(TACKROOM.x, world.heightAt(TACKROOM.x, TACKROOM.z), TACKROOM.z);
    tk.group.rotation.y = Math.PI / 2; // la porte regarde vers la cour
    group.add(tk.group);
    world.colliders.push({ x: TACKROOM.x, z: TACKROOM.z, ...TACKROOM_SIZE, kind: 'tackroom' });
    world.interactables.push({ kind: 'tackroom', x: TACKROOM.x + 3.9, z: TACKROOM.z });

    // Maison des animaux : on y range chiens, chats et lapins pour la nuit.
    const ph = B.petHouse(t('bld_pethouse'));
    ph.group.position.set(PETHOUSE.x, world.heightAt(PETHOUSE.x, PETHOUSE.z), PETHOUSE.z);
    group.add(ph.group);
    world.colliders.push({ x: PETHOUSE.x, z: PETHOUSE.z, ...PETHOUSE_SIZE, kind: 'pethouse' });
    world.interactables.push({ kind: 'pethouse', ...PETHOUSE.door });
    world.petHouse = PETHOUSE;
    world.clearZones.push({ x: TACKROOM.x, z: TACKROOM.z, r: 5 }, { x: PETHOUSE.x, z: PETHOUSE.z, r: 5.5 });
  } else {
    world.petHouse = null;
  }
  world.clearZones.push({ x: FIELD.x, z: FIELD.z, r: FIELD.r + 3 });
}

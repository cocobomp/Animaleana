// Petits outils communs aux soins du cheval refaits en 3D dans le chantier « seller, brider, vermifuge, maréchal,
// curer » (saddle3d.js, bridle3d.js, deworm3d.js, shoe3d.js, clean3d.js) : ce qu'on crée et qu'il faut libérer,
// l'équipement réel posé en pièces rigides, l'impatience du cheval, la pastille de l'étape, la retouche de la pose
// après l'animation (stage.afterLife).

import * as THREE from 'three';
import { buildGear, removeGear } from '../../game/gearModels.js';
import { rrect, label } from './draw.js';
import { snort } from './feed3d.js';

export const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
export const smooth = (k) => k * k * (3 - 2 * k);
export const dist2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** Ce qu'un jeu crée (géométries, matières, textures) : own(x) le garde, free() libère tout. */
export function owner() {
  const list = [];
  const own = (x) => {
    list.push(x);
    return x;
  };
  own.free = () => {
    for (const x of list) x.dispose?.();
    list.length = 0;
  };
  return own;
}

/**
 * L'équipement du jeu (gearModels.js buildGear) posé sur le double de la scène, en pièces RIGIDES (pas liées au
 * squelette : on peut les déplacer, les porter, les faire glisser le long du dos). gear : { pad, saddle, bridle… }.
 * Renvoie { group, meshes, dispose } ; les pièces sont dans le repère de leur parent (model.body, model.head).
 */
export function rigidGear(sc, gear) {
  const md = sc.model;
  // (une copie du modèle sans skinGear : pièces posées telles quelles ; et sans toucher au toupet du vrai modèle)
  const proxy = Object.create(md);
  proxy.skinGear = null;
  proxy.setForelockTucked = null;
  const group = buildGear(proxy, sc.a?.look ?? {}, gear);
  const meshes = group.userData.meshes ?? [];
  for (const m of meshes) {
    m.traverse?.((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
  }
  return { group, meshes, dispose: () => removeGear(group) };
}

/**
 * L'impatience : trop longtemps sans rien faire (après `after` secondes), le cheval gratte du pied, s'ébroue, couche
 * un instant les oreilles et secoue la tête. update(dt, busy) : busy = on est en train de faire quelque chose.
 * leg : le membre qui gratte (model.legs : 0 FL, 1 FR — celui de notre côté —, 2 HL, 3 HR).
 * Renvoie { update, poke (remet à zéro), level (0 à 1) }.
 */
export function impatience(sc, { after = 9, every = 4.5, leg = 1 } = {}) {
  const m = sc.mood;
  let idle = 0;
  let paw = 0;
  let next = after;
  return {
    get level() {
      return Math.min(1, Math.max(0, (idle - after) / 8));
    },
    poke() {
      idle = 0;
      next = after;
    },
    update(dt, busy = false, { canPaw = true } = {}) {
      idle = busy ? 0 : idle + dt;
      if (busy) next = after;
      if (idle > next) {
        next = idle + every;
        paw = 1.1;
        m.annoyed = Math.max(m.annoyed, 0.7);
        m.nod = Math.max(m.nod, 0.9);
        snort(sc);
      }
      if (paw > 0) {
        paw -= dt;
        // (gratter du pied : l'antérieur se lève un peu et retombe, deux fois)
        if (canPaw) {
          m.lift = Math.sin(paw * 9) > 0 ? leg : null;
          m.liftMax = 0.32;
        }
        if (paw <= 0 && canPaw) m.lift = null;
      }
      return paw > 0;
    },
  };
}

/** La pastille de l'étape en haut (« 2/3 · La selle »), comme les jeux dessinés. */
export function stagePill(g, i, n, name, y = 8) {
  g.save();
  g.fillStyle = 'rgba(255,255,255,0.88)';
  rrect(g, 200 - 82, y, 164, 30, 15);
  g.fill();
  label(g, `${i + 1}/${n} · ${name}`, 200, y + 15, 16, '#23302a');
  g.restore();
}

/**
 * Retouche de la pose après l'animation du modèle (oreilles pliées, ventre gonflé, tête relevée) : fn(dt, stage) est
 * appelée à chaque image juste après la vie de l'animal (stage.afterLife). Renvoie de quoi la retirer.
 */
export function afterLife(sc, fn) {
  (sc.afterLife ??= []).push(fn);
  return () => {
    sc.afterLife = (sc.afterLife ?? []).filter((f) => f !== fn);
  };
}

/** Une petite cible qui pulse (anneau blanc posé face à la caméra), là où toucher. */
export function pulseRing(own, { color = 0xffffff, r = 0.035 } = {}) {
  const mat = own(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, toneMapped: false }));
  const ring = new THREE.Mesh(own(new THREE.RingGeometry(r * 0.78, r, 40)), mat);
  ring.renderOrder = 20;
  ring.userData.baseOpacity = 0.8;
  return ring;
}

/** L'anneau regarde la caméra et pulse. */
export function updateRing(ring, sc, time, at) {
  if (at) ring.position.copy(at);
  ring.quaternion.copy(sc.camera.quaternion);
  const k = 1 + Math.sin(time * 5) * 0.12;
  ring.scale.setScalar(k);
  ring.material.opacity = 0.55 + Math.sin(time * 5) * 0.25;
}

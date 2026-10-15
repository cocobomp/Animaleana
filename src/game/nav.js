// Navigation simple autour des enclos : pour entrer ou sortir, on passe par la barrière ouverte.
// Sert au joueur (toucher pour aller quelque part) et aux grands animaux.

import * as THREE from 'three';

// side : côté de l'ouverture ('+x', '-x', '+z', '-z'), at : position de l'ouverture le long de ce côté.
export const ENCLOSURES = [
  { id: 'pen', x: 14, z: 35, hw: 10, hd: 7, gate: { side: '+z', at: 14, width: 4 } },
  { id: 'paddock', x: -16, z: 16, hw: 7, hd: 9, gate: { side: '+x', at: 16, width: 3 } },
];

export const enclosure = (id) => ENCLOSURES.find((e) => e.id === id);

export function inside(e, x, z, margin = 0) {
  return Math.abs(x - e.x) < e.hw - margin && Math.abs(z - e.z) < e.hd - margin;
}

/** Repères d'un enclos dans son propre repère : n = vers l'ouverture, t = le long de ce côté. */
function frame(e) {
  const alongX = e.gate.side.endsWith('x');
  const sign = e.gate.side[0] === '+' ? 1 : -1;
  const n = alongX ? new THREE.Vector3(sign, 0, 0) : new THREE.Vector3(0, 0, sign);
  const t = alongX ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
  const extN = alongX ? e.hw : e.hd;
  const extT = alongX ? e.hd : e.hw;
  const centerT = alongX ? e.z : e.x;
  const gateLat = e.gate.at - centerT;
  return { n, t, extN, extT, gateLat };
}

const out = new THREE.Vector3();

/** Prochain point de passage pour aller de pos à goal sans traverser de clôture. */
export function navTarget(pos, goal) {
  for (const e of ENCLOSURES) {
    const pIn = inside(e, pos.x, pos.z);
    if (pIn === inside(e, goal.x, goal.z)) continue;
    const { n, t, extN, extT, gateLat } = frame(e);
    const rel = new THREE.Vector3(pos.x - e.x, 0, pos.z - e.z);
    const dN = rel.dot(n);
    const dT = rel.dot(t);
    const center = new THREE.Vector3(e.x, 0, e.z);
    const gateIn = center.clone().addScaledVector(n, extN - 2.5).addScaledVector(t, gateLat);
    const gateOut = center.clone().addScaledVector(n, extN + 2.5).addScaledVector(t, gateLat);
    const corridor = Math.abs(dT - gateLat) < e.gate.width / 2 + 0.6 && dN > extN - 3 && dN < extN + 3;
    if (pIn) return out.copy(corridor ? gateOut : gateIn);
    if (corridor) return out.copy(gateIn);
    if (dN < extN + 1) {
      const s = dT >= gateLat ? 1 : -1;
      // Encore à côté ou derrière l'enclos : on s'écarte d'abord sur le côté, puis on va vers le coin.
      if (Math.abs(dT) < extT + 1.5) {
        return out.copy(center).addScaledVector(t, s * (extT + 2.5)).addScaledVector(n, Math.max(-extN - 2.5, Math.min(extN + 2.5, dN)));
      }
      return out.copy(center).addScaledVector(t, s * (extT + 2.5)).addScaledVector(n, extN + 2.5);
    }
    return out.copy(gateOut);
  }
  return goal;
}

/** Barrières de l'enclos sous forme de murs fins (avec l'ouverture). */
export function fenceColliders(e) {
  const { n, t, extN, extT, gateLat } = frame(e);
  const walls = [];
  const center = new THREE.Vector3(e.x, 0, e.z);
  const seg = (a, b) => {
    const mid = a.clone().add(b).multiplyScalar(0.5);
    walls.push({ x: mid.x, z: mid.z, hw: Math.max(0.12, Math.abs(a.x - b.x) / 2), hd: Math.max(0.12, Math.abs(a.z - b.z) / 2), fence: true });
  };
  const corner = (sn, st) => center.clone().addScaledVector(n, sn * extN).addScaledVector(t, st * extT);
  seg(corner(-1, -1), corner(-1, 1)); // fond
  seg(corner(-1, -1), corner(1, -1)); // côtés
  seg(corner(-1, 1), corner(1, 1));
  const g1 = center.clone().addScaledVector(n, extN).addScaledVector(t, gateLat - e.gate.width / 2);
  const g2 = center.clone().addScaledVector(n, extN).addScaledVector(t, gateLat + e.gate.width / 2);
  seg(corner(1, -1), g1);
  seg(g2, corner(1, 1));
  return walls;
}

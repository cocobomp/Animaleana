// Proportions d'un cheval réaliste (géométrie de repos de sa race, cheval de taille 1), mesurées comme un juge
// de modèle et allures : hauteur au garrot, profondeur de poitrine, vide sous la poitrine, longueur du corps
// (pointe de l'épaule → pointe de la fesse), ensellure (creux du dos sous le garrot et la croupe), tête.
// Ligne du dessus et du dessous : coupes du tronc (md.sdf.torso.rings : [z, centre, rayons, haut, bas]).
import * as THREE from 'three';
import { RIG_BONES } from '../../src/game/models/horseReal.js';

const TRUNK = new Set(['Spine', 'Ribs', 'FL1', 'FR1', 'HL1', 'HR1', 'Neck']);

export function horseProportions(md) {
  md.root.updateMatrixWorld(true);
  const wp = (g) => g.getWorldPosition(new THREE.Vector3());
  const zN = wp(md.neck).z;
  const zE = wp(md.legs[0].pivot).z;
  const zHip = wp(md.legs[2].top).z;
  const rings = md.sdf.torso.rings;
  const over = (a, b, k, pick) => rings.filter((r) => r[0] >= a && r[0] <= b).reduce((m, r) => pick(m, r[k]), pick === Math.max ? -Infinity : Infinity);
  const withers = over(zN - 0.32, zN - 0.04, 3, Math.max);
  const croup = over(zHip - 0.25, zHip + 0.25, 3, Math.max);
  const back = over(zHip + 0.25, zN - 0.32, 3, Math.min);
  const girth = over(zE - 0.4, zE - 0.05, 4, Math.min);
  // Longueur du corps : à mi-hauteur de la poitrine, le plus en avant du tronc (devant les antérieurs, sous la
  // gorge) et le plus en arrière (fesses, sans la queue).
  const g = md.coatMesh.geometry;
  const pos = g.attributes.position;
  const si = g.attributes.skinIndex;
  const sw = g.attributes.skinWeight;
  const y0 = girth + (withers - girth) * 0.2;
  const y1 = girth + (withers - girth) * 0.55;
  let front = -Infinity;
  let rear = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    if (y < y0 || y > y1 || Math.abs(pos.getX(i)) > 0.3) continue;
    let b = 0;
    let w = -1;
    for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > w) { w = sw.getComponent(i, k); b = si.getComponent(i, k); }
    const name = RIG_BONES[b];
    const z = pos.getZ(i);
    if (TRUNK.has(name) && z < zN + 0.45) front = Math.max(front, z);
    if (TRUNK.has(name) || name === 'HL2' || name === 'HR2') rear = Math.min(rear, z);
  }
  const length = front - rear;
  return {
    withers, croup, back, girth, length,
    depth: (withers - girth) / withers,
    gap: girth / withers,
    long: length / withers,
    sway: Math.min(withers, croup) - back,
    head: md.dims.snoutZ / withers,
    legs: girth / (withers - girth),
  };
}

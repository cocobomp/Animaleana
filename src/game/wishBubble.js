// 🫧 La bulle de ce que ton cheval te demande (src/sim/horseWish.js) : un petit cadre blanc arrondi, une queue en bas
// au milieu, l'icône dedans. Une texture par icône, gardée (cinq en tout) ; posée par AnimalEntity.updateStatus, sous
// l'étiquette de son nom.

import * as THREE from 'three';

/** Hauteur de la bulle à l'écran (px CSS), de près comme de loin : un peu plus que l'étiquette du nom (28 px). */
export const BUBBLE_PX = 52;

/** Échelle du sprite de la bulle (sizeAttenuation: false) : BUBBLE_PX de haut, caméra de fov degrés, écran de h px. */
export const bubbleScale = (fov, h) => (2 * BUBBLE_PX * Math.tan((fov * Math.PI) / 360)) / h;

const cache = new Map();

/** La texture de la bulle avec cette icône (128 × 128). */
export function bubbleTexture(icon) {
  if (cache.has(icon)) return cache.get(icon);
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  const x0 = 8;
  const y0 = 6;
  const x1 = 120;
  const y1 = 104;
  const r = 28;
  // (le cadre et sa queue d'un seul trait : pas de couture)
  ctx.beginPath();
  ctx.moveTo(x0 + r, y0);
  ctx.arcTo(x1, y0, x1, y1, r);
  ctx.arcTo(x1, y1, x0, y1, r);
  ctx.lineTo(76, y1);
  ctx.lineTo(64, 122);
  ctx.lineTo(52, y1);
  ctx.arcTo(x0, y1, x0, y0, r);
  ctx.arcTo(x0, y0, x1, y0, r);
  ctx.closePath();
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#c3c9d1';
  ctx.stroke();
  ctx.font = '64px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(icon, 64, 60);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  cache.set(icon, tex);
  return tex;
}

/**
 * Le rendu d'une photo (souvenir, balade, podium) : sans les bulles, qui sont une aide à l'écran, pas une partie de la
 * scène. Remises tout de suite : la toile garde l'image jusqu'au prochain rendu (on la copie dans la même tâche).
 */
export function renderForPhoto(g) {
  const hidden = [];
  for (const e of g.entities?.values?.() ?? []) {
    const st = e.status;
    if (st?.visible && st.renderOrder === 10) {
      st.visible = false;
      hidden.push(st);
    }
  }
  g.renderer.render(g.scene, g.camera);
  for (const st of hidden) st.visible = true;
}

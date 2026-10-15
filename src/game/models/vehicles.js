// Véhicules du voyage, générés par le code : van, remorque à chevaux, voiture et caisse de transport.
// Repère de chaque modèle : l'avant regarde vers +z, le sol est à y = 0.

import * as THREE from 'three';

const std = (color, roughness = 0.6, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
const glass = () => new THREE.MeshStandardMaterial({ color: 0x9cc4dc, roughness: 0.1, metalness: 0.2, transparent: true, opacity: 0.35, depthWrite: false });

function box(w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function wheel(r, w, x, z) {
  const g = new THREE.Group();
  const tyre = new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 18).rotateZ(Math.PI / 2), std(0x1d1d1f, 0.9));
  tyre.castShadow = true;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, w + 0.02, 12).rotateZ(Math.PI / 2), std(0xc9ccd1, 0.35, 0.6));
  g.add(tyre, rim);
  g.position.set(x, r, z);
  g.userData.wheel = r;
  return g;
}

/** Petit van (fourgon) qui tire la remorque. Renvoie { group, length, width, hitchZ }. */
export function van(color = 0xf2f2ee) {
  const g = new THREE.Group();
  const paint = std(color, 0.45, 0.1);
  const L = 5;
  const W = 2;
  g.add(box(W, 1.9, 3.4, paint, 0, 1.45, -0.7)); // caisse
  g.add(box(W, 1.15, 1.6, paint, 0, 1.05, 1.7)); // capot
  g.add(box(W * 0.96, 0.75, 0.9, paint, 0, 2.0, 1.15)); // cabine
  const win = box(W * 0.9, 0.62, 0.05, glass(), 0, 2.02, 1.62);
  win.rotation.x = -0.35;
  g.add(win);
  for (const s of [-1, 1]) {
    g.add(box(0.04, 0.55, 0.85, glass(), s * (W / 2 + 0.01), 2.0, 1.15)); // vitres des portes
    g.add(box(0.04, 0.5, 2.6, glass(), s * (W / 2 + 0.01), 1.95, -0.7)); // vitres de la caisse
    g.add(box(0.06, 0.12, 4.8, std(0x2f8a5f, 0.5), s * (W / 2 + 0.02), 1.15, -0.1)); // bande verte
  }
  g.add(box(W * 0.9, 0.85, 0.05, glass(), 0, 1.95, -2.42)); // vitre arrière
  g.add(box(W + 0.1, 0.25, 0.25, std(0x333333, 0.8), 0, 0.45, 2.5)); // pare-chocs
  g.add(box(W + 0.1, 0.25, 0.25, std(0x333333, 0.8), 0, 0.45, -2.45));
  for (const s of [-1, 1]) {
    g.add(box(0.35, 0.18, 0.05, std(0xfff6c8, 0.2), s * 0.7, 1.15, 2.51)); // phares
    g.add(box(0.25, 0.25, 0.05, std(0xd2302a, 0.3), s * 0.85, 1.0, -2.43)); // feux
  }
  for (const [x, z] of [[-0.95, 1.6], [0.95, 1.6], [-0.95, -1.6], [0.95, -1.6]]) g.add(wheel(0.38, 0.28, x, z));
  g.add(box(0.12, 0.12, 0.5, std(0x333333, 0.5, 0.5), 0, 0.5, -2.75)); // attelage
  return { group: g, length: L, width: W, hitchZ: -3 };
}

/**
 * Remorque à chevaux ouverte en haut (on voit les chevaux dedans), avec une rampe à l'arrière.
 * rows : nombre de rangées de 2 places. Renvoie { group, length, width, ramp, stalls }.
 */
export function horseTrailer(rows = 1, color = 0x7b5a3a) {
  const g = new THREE.Group();
  const W = 2;
  const L = 1.2 + rows * 2.6;
  const body = std(color, 0.7);
  const trim = std(0xe8e2d4, 0.6);
  const floorY = 0.5;
  g.add(box(W, 0.12, L, std(0x4a3a2a, 0.9), 0, floorY, 0)); // plancher
  const wallH = 1.25;
  for (const s of [-1, 1]) g.add(box(0.08, wallH, L, body, s * W / 2, floorY + wallH / 2, 0));
  g.add(box(W, wallH + 0.5, 0.1, body, 0, floorY + (wallH + 0.5) / 2, L / 2)); // avant
  g.add(box(W + 0.02, 0.1, L, trim, 0, floorY + wallH, 0)); // liseré
  // Toit en bâche sur des montants : la partie haute reste ouverte pour l'air (et pour voir les chevaux).
  const roofY = 2.55;
  const n = rows + 2;
  for (let i = 0; i < n; i++) {
    const z = -L / 2 + 0.1 + (i * (L - 0.2)) / (n - 1);
    for (const s of [-1, 1]) g.add(box(0.07, roofY - floorY - wallH, 0.07, trim, s * (W / 2 - 0.03), (floorY + wallH + roofY) / 2, z));
  }
  const roof = box(W + 0.15, 0.08, L + 0.1, std(0x2f5a46, 0.8), 0, roofY, 0);
  g.add(roof);
  // Séparation entre les deux places de chaque rangée.
  g.add(box(0.05, 0.9, L - 0.6, trim, 0, floorY + 0.75, -0.1));
  // Rampe arrière (charnière en bas). Abaissée pendant le chargement.
  const ramp = new THREE.Group();
  ramp.position.set(0, floorY, -L / 2);
  const plank = box(W - 0.1, 0.08, 1.6, std(0x5b4733, 0.9), 0, 0, -0.8);
  ramp.add(plank);
  for (let i = 0; i < 6; i++) ramp.add(box(W - 0.2, 0.04, 0.06, std(0x3a2c20, 0.9), 0, 0.05, -0.15 - i * 0.26));
  g.add(ramp);
  // Roues et timon.
  for (const s of [-1, 1]) {
    g.add(wheel(0.36, 0.25, s * (W / 2 + 0.12), -0.2));
    g.add(box(0.3, 0.06, 0.9, std(0x333333, 0.8), s * (W / 2 + 0.12), 0.8, -0.2)); // garde-boue
  }
  g.add(box(0.1, 0.1, 1.3, std(0x333333, 0.5, 0.5), 0, 0.5, L / 2 + 0.6));
  // Places : deux par rangée, de l'avant vers l'arrière, l'animal regarde vers l'avant.
  const stalls = [];
  for (let r = 0; r < rows; r++) {
    for (const s of [-1, 1]) stalls.push(new THREE.Vector3(s * 0.48, floorY + 0.06, L / 2 - 1.5 - r * 2.6));
  }
  return { group: g, length: L, width: W, ramp, stalls };
}

/** Voiture break, vitres transparentes pour voir les caisses dans le coffre. Renvoie { group, length, width, crateSlots }. */
export function car(color = 0x2f6fb0) {
  const g = new THREE.Group();
  const paint = std(color, 0.35, 0.25);
  const L = 4.5;
  const W = 1.85;
  g.add(box(W, 0.7, L, paint, 0, 0.72, 0)); // bas de caisse
  g.add(box(W * 0.94, 0.08, 2.9, paint, 0, 1.68, -0.45)); // toit
  for (const s of [-1, 1]) {
    for (const z of [1.0, 0.0, -1.0, -1.85]) g.add(box(0.08, 0.6, 0.08, paint, s * (W / 2 - 0.08), 1.37, z)); // montants
    g.add(box(0.03, 0.58, 2.9, glass(), s * (W / 2 - 0.07), 1.37, -0.45)); // vitres
  }
  const wind = box(W * 0.88, 0.7, 0.04, glass(), 0, 1.35, 1.2);
  wind.rotation.x = -0.6;
  g.add(wind);
  g.add(box(W * 0.88, 0.58, 0.04, glass(), 0, 1.37, -1.88)); // lunette arrière
  g.add(box(W + 0.05, 0.2, 0.2, std(0x2a2a2a, 0.8), 0, 0.42, L / 2));
  g.add(box(W + 0.05, 0.2, 0.2, std(0x2a2a2a, 0.8), 0, 0.42, -L / 2));
  for (const s of [-1, 1]) {
    g.add(box(0.35, 0.14, 0.05, std(0xfff6c8, 0.2), s * 0.6, 0.85, L / 2 + 0.01));
    g.add(box(0.3, 0.16, 0.05, std(0xd2302a, 0.3), s * 0.7, 0.9, -L / 2 - 0.01));
  }
  for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) g.add(wheel(0.34, 0.24, x, z));
  // Coffre et banquette arrière : 4 places pour des caisses.
  const crateSlots = [
    new THREE.Vector3(-0.42, 1.08, -1.45), new THREE.Vector3(0.42, 1.08, -1.45),
    new THREE.Vector3(-0.42, 1.08, -0.55), new THREE.Vector3(0.42, 1.08, -0.55),
  ];
  return { group: g, length: L, width: W, crateSlots };
}

/** Caisse de transport (plastique et grille à l'avant), à la taille de l'animal. */
export function crate(size = 0.6, color = 0x3f8fd0) {
  const g = new THREE.Group();
  const w = size * 0.75;
  const h = size * 0.7;
  const d = size;
  const plastic = std(color, 0.5);
  const grid = std(0xd8d8d8, 0.3, 0.7);
  g.add(box(w, 0.04, d, plastic, 0, 0.02, 0)); // fond
  g.add(box(w, 0.04, d, plastic, 0, h, 0)); // dessus
  for (const s of [-1, 1]) {
    g.add(box(0.03, h, d, plastic, s * w / 2, h / 2, 0)); // côtés pleins
  }
  g.add(box(w, h, 0.03, plastic, 0, h / 2, -d / 2)); // arrière
  // Grille de la porte (à l'avant) : on voit l'animal à travers.
  for (let i = 0; i <= 4; i++) g.add(box(0.012, h, 0.012, grid, -w / 2 + (i * w) / 4, h / 2, d / 2));
  for (let i = 0; i <= 3; i++) g.add(box(w, 0.012, 0.012, grid, 0, (i * h) / 3, d / 2));
  // Poignée.
  g.add(box(w * 0.4, 0.04, 0.06, std(0x333333, 0.6), 0, h + 0.06, 0));
  // Petites fenêtres d'aération sur les côtés (bandes sombres).
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) g.add(box(0.035, h * 0.12, d * 0.6, std(0x1d2a33, 0.6), s * w / 2, h * (0.35 + i * 0.18), 0));
  return { group: g, size: { w, h, d } };
}

/** Libère la mémoire d'un véhicule. */
export function disposeVehicle(object) {
  object.traverse((o) => {
    if (o.isMesh) {
      o.geometry.dispose();
      o.material.dispose();
    }
  });
}

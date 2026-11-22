// Le bain du chien, dans le coin de la maison (home.js) : une bassine ovale en zinc posée sur le parquet, un peu
// d'eau tiède et de la mousse dedans, une serviette pliée et le flacon de shampoing à côté, et la douchette que tient
// notre main (petHand.js). Tout est à la taille du chien (repères de la scène) ; ce qu'on crée est libéré par dispose.

import * as THREE from 'three';
import { canvasTex } from './textures.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

function shadowed(m, cast = true) {
  m.castShadow = cast;
  m.receiveShadow = true;
  return m;
}

/** Le zinc martelé de la bassine : gris doux, reflets, quelques traces d'eau. */
function zincTexture() {
  return canvasTex(128, 128, (c) => {
    c.fillStyle = '#b9c1c4';
    c.fillRect(0, 0, 128, 128);
    let s = 3;
    const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
    for (let i = 0; i < 260; i++) {
      const g = 150 + r() * 70;
      c.fillStyle = `rgba(${g},${g + 6},${g + 8},${0.18 + r() * 0.2})`;
      c.beginPath();
      c.arc(r() * 128, r() * 128, 2 + r() * 6, 0, Math.PI * 2);
      c.fill();
    }
    for (let i = 0; i < 18; i++) {
      c.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.1})`;
      c.lineWidth = 1;
      c.beginPath();
      const y = r() * 128;
      c.moveTo(0, y);
      c.lineTo(128, y + (r() - 0.5) * 6);
      c.stroke();
    }
  }, { key: 'petBathZinc' });
}

/** Serviette éponge à rayures. */
function towelTexture() {
  return canvasTex(128, 64, (c) => {
    c.fillStyle = '#f4ede2';
    c.fillRect(0, 0, 128, 64);
    for (const [x, w, col] of [[14, 10, '#7fb3c8'], [30, 4, '#e7a97a'], [96, 4, '#e7a97a'], [104, 10, '#7fb3c8']]) {
      c.fillStyle = col;
      c.fillRect(x, 0, w, 64);
    }
    for (let i = 0; i < 900; i++) {
      c.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '120,100,80'},0.08)`;
      c.fillRect(Math.random() * 128, Math.random() * 64, 1, 2);
    }
  }, { key: 'petBathTowel', repeat: false });
}

/** Étiquette du flacon de shampoing (une patte et des bulles). */
function labelTexture() {
  return canvasTex(64, 64, (c) => {
    c.fillStyle = '#7cc3b6';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#fffaf0';
    c.beginPath();
    c.roundRect(8, 14, 48, 36, 8);
    c.fill();
    c.fillStyle = '#d9707e';
    for (const [x, y, r] of [[32, 36, 7], [23, 26, 3.5], [29, 22, 3.5], [36, 22, 3.5], [42, 26, 3.5]]) {
      c.beginPath();
      c.arc(x, y, r, 0, Math.PI * 2);
      c.fill();
    }
  }, { key: 'petBathLabel', repeat: false });
}

/**
 * La bassine et ce qui va avec, sous l'animal (repères L de la scène). Renvoie { group, waterY, rim, size, foam(k),
 * dispose }. foam(k) : la mousse qui flotte sur l'eau (0 à 1).
 */
export function petBath(L) {
  const own = [];
  const keep = (x) => {
    own.push(x);
    return x;
  };
  const g = new THREE.Group();
  const len = Math.max(0.24, L.size.len * 0.98);
  const wid = Math.max(0.17, Math.max(L.size.w * 2.1, len * 0.5));
  const H = Math.max(0.06, Math.min(0.2, L.size.h * 0.26));
  const R = wid / 2;
  // la bassine : un profil tourné (fond, paroi évasée, bord roulé), étiré en ovale
  const prof = [[0, 0.004], [R * 0.84, 0.004], [R * 0.86, 0.01], [R * 0.95, H * 0.6], [R, H]];
  const geo = keep(new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 48));
  geo.scale(len / wid, 1, 1);
  const zinc = keep(zincTexture());
  zinc.repeat.set(3, 1);
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, map: zinc, metalness: 0.55, roughness: 0.42, side: THREE.DoubleSide }));
  const tub = shadowed(new THREE.Mesh(geo, metal));
  g.add(tub);
  const rim = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(R, Math.max(0.004, H * 0.06), 8, 64)), metal));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = H;
  rim.scale.set(len / wid, 1, 1);
  g.add(rim);
  // deux poignées, aux bouts
  for (const sd of [-1, 1]) {
    const hd = shadowed(new THREE.Mesh(keep(new THREE.TorusGeometry(H * 0.32, H * 0.045, 8, 20, Math.PI)), metal));
    hd.position.set(sd * (len / 2 + H * 0.02), H * 0.78, 0);
    hd.rotation.set(0, sd > 0 ? Math.PI / 2 : -Math.PI / 2, 0);
    g.add(hd);
  }
  // l'eau tiède : une nappe claire, un peu bleutée, qui ondule
  const waterY = H * 0.42;
  const waterMat = keep(new THREE.MeshStandardMaterial({ color: 0x9cc9dc, roughness: 0.06, metalness: 0.1, transparent: true, opacity: 0.6, depthWrite: false }));
  const water = new THREE.Mesh(keep(new THREE.CircleGeometry(1, 40)), waterMat);
  water.rotation.x = -Math.PI / 2;
  const rw = R * (0.86 + (0.95 - 0.86) * (waterY - 0.01) / (H * 0.6 - 0.01));
  water.scale.set(rw * (len / wid), rw, 1);
  water.position.y = waterY;
  water.renderOrder = 3;
  g.add(water);
  // la mousse sur l'eau : des grappes de bulles, de plus en plus nombreuses
  const foamMat = keep(new THREE.MeshStandardMaterial({ color: 0xfbfdff, roughness: 0.35 }));
  const bub = keep(new THREE.SphereGeometry(1, 12, 8));
  const foamBits = [];
  let s = 11;
  const r = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < 46; i++) {
    const a = r() * Math.PI * 2;
    const d = 0.55 + r() * 0.4;
    const b = new THREE.Mesh(bub, foamMat);
    const rr = R * (0.05 + r() * 0.07);
    b.position.set(Math.cos(a) * rw * d * (len / wid), waterY + rr * 0.2, Math.sin(a) * rw * d);
    b.scale.set(rr, rr * 0.55, rr);
    b.visible = false;
    b.userData.k = r();
    g.add(b);
    foamBits.push(b);
  }
  // la serviette pliée et le shampoing, à côté (du côté de sa tête, devant)
  const towel = shadowed(new THREE.Mesh(keep(new THREE.BoxGeometry(wid * 0.75, H * 0.32, wid * 0.55, 4, 2, 4)), keep(new THREE.MeshStandardMaterial({ map: keep(towelTexture()), roughness: 1 }))));
  const tp = towel.geometry.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const y = tp.getY(i);
    tp.setY(i, y * (1 - 0.25 * (tp.getX(i) / (wid * 0.375)) ** 2));
  }
  towel.geometry.computeVertexNormals();
  towel.position.set(len / 2 + wid * 0.55, H * 0.16, wid * 0.35);
  towel.rotation.y = 0.25;
  g.add(towel);
  const bottle = new THREE.Group();
  const bh = Math.max(0.07, H * 0.9);
  const body = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(bh * 0.2, bh * 0.24, bh, 20)), keep(new THREE.MeshStandardMaterial({ map: keep(labelTexture()), roughness: 0.3 }))));
  body.position.y = bh / 2;
  bottle.add(body);
  const cap = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(bh * 0.1, bh * 0.14, bh * 0.22, 14)), keep(new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.4 }))));
  cap.position.y = bh * 1.1;
  bottle.add(cap);
  bottle.position.set(len / 2 + wid * 0.25, H * 0.32, -wid * 0.1);
  g.add(bottle);
  return {
    group: g,
    waterY,
    rim: H,
    size: { len, wid, H },
    foam(k) {
      for (const b of foamBits) b.visible = b.userData.k < k;
    },
    update(dt, t) {
      water.position.y = waterY + Math.sin(t * 2.3) * H * 0.008;
    },
    dispose() {
      for (const x of own) x.dispose?.();
    },
  };
}

/**
 * La douchette, tenue par notre main : la poignée et la pomme (trous sombres), le flexible qui part vers le bras.
 * Origine : le centre de la pomme ; l'eau sort vers -y local. s : échelle.
 */
export function showerHead(keep, s = 1) {
  const g = new THREE.Group();
  const chrome = keep(new THREE.MeshStandardMaterial({ color: 0xe9edf0, metalness: 0.85, roughness: 0.2 }));
  const head = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.03 * s, 0.026 * s, 0.014 * s, 24)), chrome));
  g.add(head);
  const face = new THREE.Mesh(keep(new THREE.CircleGeometry(0.024 * s, 24)), keep(new THREE.MeshStandardMaterial({ color: 0x9aa3a8, roughness: 0.4, map: keep(canvasTex(64, 64, (c) => {
    c.fillStyle = '#c9d0d4';
    c.fillRect(0, 0, 64, 64);
    c.fillStyle = '#4a5358';
    for (let ring = 0; ring < 4; ring++) {
      const n = ring === 0 ? 1 : ring * 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        c.beginPath();
        c.arc(32 + Math.cos(a) * ring * 8, 32 + Math.sin(a) * ring * 8, 1.8, 0, Math.PI * 2);
        c.fill();
      }
    }
  }, { key: 'petShowerFace', repeat: false })) })));
  face.rotation.x = Math.PI / 2;
  face.position.y = -0.0075 * s;
  g.add(face);
  const handle = shadowed(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.009 * s, 0.011 * s, 0.13 * s, 14)), chrome));
  handle.rotation.z = Math.PI / 2 - 0.35;
  handle.position.set(0.075 * s, 0.022 * s, 0);
  g.add(handle);
  g.userData.grip = v3(0.09 * s, 0.03 * s, 0); // (là où la main tient la poignée, repère de la douchette)
  return g;
}

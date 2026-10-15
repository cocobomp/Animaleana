// Pluie, neige et éclairs autour de la caméra.

import * as THREE from 'three';

const BOX = { x: 50, y: 30, z: 50 };

function snowflakeTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

export class Weather3D {
  constructor(scene, quality) {
    this.scene = scene;
    this.kind = 'clear';
    this.flash = 0;
    const count = quality === 'high' ? 5000 : 1800;

    // Pluie : petits traits qui tombent vite.
    const rainPos = new Float32Array(count * 6);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * BOX.x;
      const y = Math.random() * BOX.y;
      const z = (Math.random() - 0.5) * BOX.z;
      rainPos.set([x, y, z, x + 0.03, y - 0.6, z], i * 6);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    this.rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xaec4d6, transparent: true, opacity: 0.55 }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    // Neige : flocons qui flottent.
    const snowPos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      snowPos.set([(Math.random() - 0.5) * BOX.x, Math.random() * BOX.y, (Math.random() - 0.5) * BOX.z], i * 3);
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    this.snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({
      size: 0.11, map: snowflakeTexture(), transparent: true, depthWrite: false, color: 0xffffff,
    }));
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    scene.add(this.snow);
    this.time = 0;
  }

  set(kind) {
    this.kind = kind;
    this.rain.visible = kind === 'rain' || kind === 'storm';
    this.snow.visible = kind === 'snow';
  }

  /** Renvoie l'intensité d'un éventuel éclair (0 à 1). */
  update(dt, center) {
    this.time += dt;
    if (this.rain.visible) {
      this.rain.position.set(center.x, center.y - 8, center.z);
      const arr = this.rain.geometry.attributes.position.array;
      const fall = dt * 22;
      for (let i = 0; i < arr.length; i += 6) {
        arr[i + 1] -= fall;
        arr[i + 4] -= fall;
        if (arr[i + 4] < 0) {
          arr[i + 1] += BOX.y;
          arr[i + 4] += BOX.y;
        }
      }
      this.rain.geometry.attributes.position.needsUpdate = true;
    }
    if (this.snow.visible) {
      this.snow.position.set(center.x, center.y - 8, center.z);
      const arr = this.snow.geometry.attributes.position.array;
      for (let i = 0; i < arr.length; i += 3) {
        arr[i + 1] -= dt * 1.6;
        arr[i] += Math.sin(this.time + i) * dt * 0.4;
        if (arr[i + 1] < 0) arr[i + 1] += BOX.y;
      }
      this.snow.geometry.attributes.position.needsUpdate = true;
    }
    if (this.kind === 'storm') {
      if (this.flash <= 0 && Math.random() < dt * 0.12) this.flash = 1;
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    return this.flash > 0.5 ? this.flash : 0;
  }
}

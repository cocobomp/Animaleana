// Pluie, neige et éclairs autour de la caméra.
// Les gouttes et les flocons bougent dans leurs shaders (aucune mise à jour de géométrie par image) ;
// seules les éclaboussures au sol sont animées côté JavaScript.

import * as THREE from 'three';
import { gfx } from './gfx.js';

const BOX = { x: 50, y: 30, z: 50 };

function snowflakeTexture() {
  const c = document.createElement('canvas');
  c.width = 32;
  c.height = 32;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.35, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 32, 32);
  return new THREE.CanvasTexture(c);
}

/** Anneau d'éclaboussure : cercle fin et doux, plus clair au centre. */
function splashTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, S * 0.22, S / 2, S / 2, S * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0)');
  g.addColorStop(0.55, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.75, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class Weather3D {
  constructor(scene, quality) {
    this.scene = scene;
    this.kind = 'clear';
    this.flash = 0;
    const high = quality === 'high';
    const count = high ? 5000 : 1800;

    // Pluie : traits fins, lumineux en tête et qui s'effacent vers la queue (traînée).
    // Par sommet : position de départ (x, y de la tête, z), aT (0 tête / 1 queue) et longueur.
    const rainPos = new Float32Array(count * 6);
    const rainT = new Float32Array(count * 2);
    const rainLen = new Float32Array(count * 2);
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * BOX.x;
      const y = Math.random() * BOX.y;
      const z = (Math.random() - 0.5) * BOX.z;
      const len = 0.7 + Math.random() * 0.9;
      rainPos.set([x, y, z, x, y, z], i * 6);
      rainT.set([0, 1], i * 2);
      rainLen.set([len, len], i * 2);
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    rainGeo.setAttribute('aT', new THREE.BufferAttribute(rainT, 1));
    rainGeo.setAttribute('aLen', new THREE.BufferAttribute(rainLen, 1));
    this.rainMat = new THREE.ShaderMaterial({
      uniforms: { uTime: gfx.time, uOpacity: { value: 0.5 }, uColor: { value: new THREE.Color(0.8, 0.86, 0.94) }, uLean: { value: 0.16 } },
      vertexShader: `
attribute float aT;
attribute float aLen;
uniform float uTime;
uniform float uLean;
varying float vA;
void main() {
  float speed = 17.0 + aLen * 5.0;
  float head = mod(position.y - uTime * speed, ${BOX.y.toFixed(1)});
  float x = mod(position.x + uTime * speed * uLean + ${(BOX.x / 2).toFixed(1)}, ${BOX.x.toFixed(1)}) - ${(BOX.x / 2).toFixed(1)};
  vec3 p = vec3(x + aT * aLen * uLean, head + aT * aLen, position.z);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  // Tête nette, queue effacée ; les gouttes proches de la caméra sont plus visibles.
  vA = (1.0 - aT * 0.9) * clamp(1.4 - (-mv.z) / 30.0, 0.25, 1.0);
}`,
      fragmentShader: `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() { gl_FragColor = vec4(uColor, vA * uOpacity); }`,
      transparent: true, depthWrite: false,
    });
    this.rain = new THREE.LineSegments(rainGeo, this.rainMat);
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);

    // Éclaboussures : anneaux qui s'élargissent et s'effacent là où les gouttes touchent le sol.
    this.splashCount = high ? 90 : 36;
    this.splashes = [];
    const splashGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const splashMat = new THREE.MeshBasicMaterial({
      map: splashTexture(), color: 0xffffff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.splash = new THREE.InstancedMesh(splashGeo, splashMat, this.splashCount);
    this.splash.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.splashCount * 3), 3);
    this.splash.frustumCulled = false;
    this.splash.visible = false;
    for (let i = 0; i < this.splashCount; i++) this.splashes.push({ x: 0, y: 0, z: 0, t: Math.random(), size: 0.3 });
    scene.add(this.splash);
    this._m = new THREE.Matrix4();
    this._q = new THREE.Quaternion();
    this._p = new THREE.Vector3();
    this._s = new THREE.Vector3();
    this._c = new THREE.Color();

    // Neige : flocons de tailles variées qui descendent lentement en se balançant.
    const snowPos = new Float32Array(count * 3);
    const snowSize = new Float32Array(count);
    const snowPhase = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      snowPos.set([(Math.random() - 0.5) * BOX.x, Math.random() * BOX.y, (Math.random() - 0.5) * BOX.z], i * 3);
      snowSize[i] = 0.5 + Math.random() * Math.random() * 1.5;
      snowPhase[i] = Math.random() * 6.283;
    }
    const snowGeo = new THREE.BufferGeometry();
    snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
    snowGeo.setAttribute('aSize', new THREE.BufferAttribute(snowSize, 1));
    snowGeo.setAttribute('aPhase', new THREE.BufferAttribute(snowPhase, 1));
    this.snowMat = new THREE.ShaderMaterial({
      uniforms: { uTime: gfx.time, map: { value: snowflakeTexture() }, uScale: { value: 300 }, uOpacity: { value: 0.9 } },
      vertexShader: `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uScale;
varying float vA;
void main() {
  float fall = 0.55 + aSize * 0.45;
  float y = mod(position.y - uTime * fall, ${BOX.y.toFixed(1)});
  float sway = sin(uTime * 0.7 + aPhase) * 0.5 + sin(uTime * 1.9 + aPhase * 2.3) * 0.15;
  vec3 p = vec3(position.x + sway, y, position.z + cos(uTime * 0.5 + aPhase * 1.7) * 0.4);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 1.5, 14.0);
  vA = clamp(1.3 - (-mv.z) / 32.0, 0.3, 1.0);
}`,
      fragmentShader: `
uniform sampler2D map;
uniform float uOpacity;
varying float vA;
void main() {
  vec4 t = texture2D(map, gl_PointCoord);
  gl_FragColor = vec4(vec3(1.0), t.a * vA * uOpacity);
}`,
      transparent: true, depthWrite: false,
    });
    this.snow = new THREE.Points(snowGeo, this.snowMat);
    this.snow.frustumCulled = false;
    this.snow.visible = false;
    scene.add(this.snow);
    this.time = 0;
  }

  set(kind) {
    this.kind = kind;
    const rain = kind === 'rain' || kind === 'storm';
    this.rain.visible = rain;
    this.splash.visible = rain;
    this.snow.visible = kind === 'snow';
    this.rainMat.uniforms.uOpacity.value = kind === 'storm' ? 0.75 : 0.6;
    this.rainMat.uniforms.uLean.value = kind === 'storm' ? 0.3 : 0.16;
  }

  /** Renvoie l'intensité d'un éventuel éclair (0 à 1). */
  update(dt, center) {
    this.time += dt;
    const world = this.scene.userData.world;
    if (this.rain.visible) {
      this.rain.position.set(center.x, center.y - 8, center.z);
      if (world?.heightAt) this.updateSplashes(dt, center, world);
      else this.splash.visible = false;
    }
    if (this.snow.visible) {
      this.snow.position.set(center.x, center.y - 8, center.z);
      this.snowMat.uniforms.uScale.value = 60 * (this.scene.userData.pixelRatio ?? 1);
    }
    if (this.kind === 'storm') {
      if (this.flash <= 0 && Math.random() < dt * 0.12) this.flash = 1;
    }
    this.flash = Math.max(0, this.flash - dt * 3);
    return this.flash > 0.5 ? this.flash : 0;
  }

  updateSplashes(dt, center, world) {
    this.splash.visible = true;
    const m = this._m;
    const q = this._q;
    const p = this._p;
    const s = this._s;
    const c = this._c;
    const life = 0.5;
    const radius = 16;
    for (let i = 0; i < this.splashCount; i++) {
      const sp = this.splashes[i];
      sp.t += dt / life;
      if (sp.t >= 1) {
        // Nouvelle goutte : au sol (ou à la surface de l'eau) près de la caméra.
        sp.t = Math.random() * 0.3;
        const a = Math.random() * Math.PI * 2;
        const r = 2 + Math.sqrt(Math.random()) * radius;
        sp.x = center.x + Math.cos(a) * r;
        sp.z = center.z + Math.sin(a) * r;
        const h = world.heightAt(sp.x, sp.z);
        sp.y = (world.waterLevel !== null && h < world.waterLevel ? world.waterLevel : h) + 0.04;
        sp.size = 0.12 + Math.random() * 0.16;
      }
      const k = sp.t;
      const size = sp.size * (0.3 + k * 1.2);
      const a = (1 - k) * (1 - k) * 0.4;
      m.compose(p.set(sp.x, sp.y, sp.z), q, s.set(size, 1, size));
      this.splash.setMatrixAt(i, m);
      this.splash.setColorAt(i, c.setRGB(a, a, a));
    }
    this.splash.instanceMatrix.needsUpdate = true;
    this.splash.instanceColor.needsUpdate = true;
  }
}

// Construit un lieu (terrain, eau, bâtiments, végétation) et gère le ciel, le soleil et la nuit.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { PLACES } from '../sim/places.js';
import { mulberry32 } from '../sim/rng.js';
import { t, L } from '../i18n.js';
import { terrainDetail, waterNormalTexture, cloudTexture } from './textures.js';
import { noise3 } from './models/shapes.js';
import { gfx } from './gfx.js';
import * as B from './models/buildings.js';
import { forest, rocks, groundCover, mountainRing } from './models/nature.js';
import { buildFarm } from './farmLayout.js';
import { buildInteriors } from './Interiors.js'; // écurie et maison où l'on entre
import { coreAt } from './coreLayout.js'; // installations déplaçables (vue d'ensemble)
import { buildShowground } from './showground.js'; // activités : terrain de concours
import { showgroundFlat } from '../sim/activities.js';

const SIZE = 420;
const SEGMENTS = 168;
export const WATER_LEVEL = -1.1;

const smooth = (a, b, x) => {
  const t2 = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t2 * t2 * (3 - 2 * t2);
};

const GROUND = {
  countryside: { spring: 0x63983c, summer: 0x6c9a3a, autumn: 0x7a9242, winter: 0x74866a },
  beach: { spring: 0x6e9a44, summer: 0x7a9c45, autumn: 0x7f9246, winter: 0x728463 },
  mountain: { spring: 0x6f9e4a, summer: 0x6a9a44, autumn: 0x8a8f4a, winter: 0xeef2f6 },
  tundra: { spring: 0x6c8a52, summer: 0x6f9152, autumn: 0x8a7e4c, winter: 0xeef1f4 },
  forest: { spring: 0x5f8f3e, summer: 0x568a38, autumn: 0x7d8a3e, winter: 0xf0f3f6 },
  garden: { spring: 0x7aa64c, summer: 0x6d9c42, autumn: 0x9a9446, winter: 0x8a9670 },
  prairie: { spring: 0x8fa653, summer: 0xb5a45c, autumn: 0xa8995a, winter: 0xeef2f6 },
  mediterranean: { spring: 0x93a656, summer: 0xbca462, autumn: 0xa39a5c, winter: 0x8d9c60 },
  outback: { spring: 0xa77a42, summer: 0xb26e3c, autumn: 0xa9763f, winter: 0x9c7c4a },
};

const FLOWERS = {
  spring: [0xf5e663, 0xffffff, 0xe86a8a, 0x9d7de0],
  summer: [0xf5e663, 0xffffff, 0xe85a4a],
  autumn: [],
  winter: [],
};

let glowTex = null;
/** Tache de lumière douce (plus forte contre la façade, en haut de l'image) pour les fenêtres allumées. */
function windowGlowTexture() {
  if (glowTex) return glowTex;
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S * 0.12, 2, S / 2, S * 0.18, S * 0.78);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  glowTex = new THREE.CanvasTexture(c);
  glowTex.colorSpace = THREE.SRGBColorSpace;
  glowTex.userData.shared = true;
  return glowTex;
}

// Palette de la lumière (valeurs linéaires), partagée par toutes les images : rien n'est alloué par image.
const C = (r, g, b) => new THREE.Color(r, g, b);
const PAL = {
  sunNoon: C(1.0, 0.965, 0.92), sunGold: C(1.0, 0.76, 0.5), sunSet: C(1.0, 0.55, 0.3), sunMorning: C(0.9, 0.95, 1.0),
  moon: C(0.55, 0.68, 1.0),
  skyClear: C(0.55, 0.72, 1.0), skyGrey: C(0.72, 0.74, 0.78), skyGold: C(1.0, 0.72, 0.5),
  nightClear: C(0.32, 0.42, 0.68), nightGrey: C(0.22, 0.24, 0.3),
  fogDay: C(0.73, 0.82, 0.93), fogGrey: C(0.69, 0.72, 0.76), fogGold: C(0.96, 0.7, 0.46), fogDusk: C(0.32, 0.18, 0.3),
  fogNight: C(0.012, 0.018, 0.04), fogNightGrey: C(0.01, 0.011, 0.016),
  nightSky: C(0.012, 0.022, 0.055), nightTint: C(0.6, 0.75, 1.3),
  cloudLit: C(1, 1, 1), cloudGrey: C(0.72, 0.73, 0.75), cloudShade: C(0.66, 0.7, 0.78), cloudShadeGrey: C(0.42, 0.44, 0.48),
  cloudShadeGold: C(0.75, 0.42, 0.3), cloudNight: C(0.14, 0.17, 0.26), cloudNightShade: C(0.05, 0.06, 0.1),
};
const scratch = { sun: C(0, 0, 0), sky: C(0, 0, 0), night: C(0, 0, 0), ground: C(0, 0, 0), fogDay: C(0, 0, 0), fogNight: C(0, 0, 0), lit: C(0, 0, 0), shade: C(0, 0, 0) };

/** Couleur de la lumière du soleil selon sa hauteur (degrés) et le moment de la journée. */
function sunlightColor(out, elev, hour) {
  const low = smooth(32, 0, elev); // 1 à l'horizon, 0 au-dessus de 32°
  const veryLow = smooth(9, -2, elev);
  out.copy(PAL.sunNoon); // plein jour : blanc à peine chaud
  out.lerp(PAL.sunGold, low * low * 0.85); // soleil bas : doré
  out.lerp(PAL.sunSet, veryLow * 0.7); // lever / coucher : orangé
  // Matin : lumière un peu plus fraîche qu'en fin de journée.
  if (hour < 12) out.lerp(PAL.sunMorning, smooth(12, 8, hour) * (1 - low) * 0.35);
  return out;
}

// Demi-largeur de la zone d'ombre autour du joueur (mètres) : plus elle est petite, plus les ombres sont fines.
const SHADOW_HALF = 30;

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.group = null;
    this.colliders = [];
    this.interactables = [];
    this.place = null;
    this.waterLevel = null;
    // Les autres systèmes de la scène (pluie, neige…) retrouvent le monde par ici, pour la hauteur du sol.
    scene.userData.world = this;

    // Ciel physique (diffusion de la lumière), soleil, lumière d'ambiance.
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    scene.add(this.sky);
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3(0, 1, 0);

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6b3a, 0.8);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.5);
    this.sun.castShadow = quality === 'high';
    const s = this.sun.shadow;
    s.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    s.camera.left = -SHADOW_HALF;
    s.camera.right = SHADOW_HALF;
    s.camera.top = SHADOW_HALF;
    s.camera.bottom = -SHADOW_HALF;
    s.camera.near = 1;
    s.camera.far = 220;
    // Biais : assez pour éviter l'acné sur le sol en pente, assez peu pour garder les pieds collés à leur ombre.
    s.bias = -0.00035;
    s.normalBias = 0.045;
    scene.add(this.sun);
    scene.add(this.sun.target);
    this._shadowBasis = new THREE.Matrix4();
    this._shadowInv = new THREE.Matrix4();
    this._tmpV = new THREE.Vector3();

    scene.fog = new THREE.Fog(0xbfd6ea, 60, 380);
    this.fogColor = new THREE.Color();

    // Éclairage d'ambiance par le ciel (image-based lighting) : une copie du ciel sans disque
    // solaire, plus un sol, est « photographiée » de temps en temps (PMREM) et sert
    // d'environnement à tous les matériaux. Mise à jour rare : coût négligeable.
    this.envScene = new THREE.Scene();
    const envSkyMat = this.sky.material.clone();
    envSkyMat.uniforms = this.sky.material.uniforms;
    // Ciel enrichi : teinte globale, lueur du crépuscule à l'horizon (orange côté soleil couché,
    // violet ailleurs) et ciel de nuit bleu profond, plus clair vers l'horizon — rien n'est jamais noir.
    const u = this.sky.material.uniforms;
    u.skyTint = { value: new THREE.Color(1, 1, 1) };
    u.duskGlow = { value: 0 };
    u.nightSky = { value: new THREE.Color(0, 0, 0) };
    u.hazeColor = { value: new THREE.Color(0, 0, 0) };
    u.hazeAmount = { value: 0 };
    const tint = (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('uniform vec3 up;', `uniform vec3 up;
uniform vec3 skyTint;
uniform float duskGlow;
uniform vec3 nightSky;
uniform vec3 hazeColor;
uniform float hazeAmount;`)
        .replace('gl_FragColor = vec4( retColor, 1.0 );', `
float hz = pow(1.0 - clamp(direction.y, 0.0, 1.0), 4.0);
vec3 sunH = normalize(vec3(vSunDirection.x, 0.0, vSunDirection.z) + vec3(1e-4, 0.0, 0.0));
vec3 dirH = normalize(vec3(direction.x, 0.0, direction.z) + vec3(1e-4, 0.0, 0.0));
float toward = dot(dirH, sunH) * 0.5 + 0.5;
vec3 dusk = mix(vec3(0.22, 0.11, 0.28), vec3(1.0, 0.46, 0.16), toward * toward) * (duskGlow * hz * (0.22 + 0.78 * toward * toward));
vec3 night = nightSky * (0.45 + 1.2 * hz);
retColor = retColor * skyTint + dusk + night;
// Brume : l'horizon se fond dans la couleur du brouillard (un peu par beau temps, beaucoup par temps
// couvert) ; tout en bas, le ciel prend exactement cette couleur : les lointains noyés de brume s'y
// raccordent sans couture.
float hzBand = pow(1.0 - clamp(direction.y * 6.0, 0.0, 1.0), 3.0);
retColor = mix(retColor, hazeColor, max(hazeAmount * pow(1.0 - clamp(direction.y, 0.0, 1.0), 2.5), hzBand));
gl_FragColor = vec4( retColor, 1.0 );`);
    };
    this.sky.material.onBeforeCompile = tint;
    envSkyMat.onBeforeCompile = (sh) => {
      tint(sh);
      sh.fragmentShader = sh.fragmentShader.replace('L0 += ( vSunE * 19000.0 * Fex ) * sundisk;', '');
    };
    this.moon = this.makeMoon();
    scene.add(this.moon);
    const envSky = new THREE.Mesh(this.sky.geometry, envSkyMat);
    envSky.scale.setScalar(400);
    this.envScene.add(envSky);
    this.envGround = new THREE.Mesh(new THREE.CircleGeometry(300, 32), new THREE.MeshBasicMaterial({ color: 0x40502c }));
    this.envGround.rotation.x = -Math.PI / 2;
    this.envGround.position.y = -2;
    this.envScene.add(this.envGround);
    this.pmrem = null;
    this.envTarget = null;
    this.envKey = null;
    this.envTime = 0;
    this.stars = this.makeStars();
    scene.add(this.stars);
    this.clouds = this.makeClouds();
    scene.add(this.clouds);
    this.windowGlow = null;
  }

  /** Donne au monde l'accès au moteur de rendu (pour l'éclairage par le ciel). */
  setRenderer(renderer) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.stars.material.uniforms.uPixelRatio.value = renderer.getPixelRatio();
    this.scene.userData.pixelRatio = renderer.getPixelRatio();
  }

  /** Recalcule l'environnement lumineux quand le soleil a assez bougé (ou que la météo change). */
  updateEnvironment(day, overcast, groundColor) {
    if (!this.pmrem) return;
    const high = this.quality === 'high';
    const step = high ? 0.025 : 0.06;
    const key = `${Math.round(this.sunDir.x / step)}|${Math.round(this.sunDir.y / step)}|${Math.round(this.sunDir.z / step)}|${overcast.toFixed(2)}`;
    const now = performance.now();
    if (key === this.envKey || (this.envKey && now - this.envTime < (high ? 800 : 3000))) return;
    this.envKey = key;
    this.envTime = now;
    this.envGround.material.color.copy(groundColor).multiplyScalar(0.12 + 0.5 * day);
    const rt = this.pmrem.fromScene(this.envScene, 0, 1, 1000, { size: high ? 128 : 64 });
    this.scene.environment = rt.texture;
    if (this.envTarget) this.envTarget.dispose();
    this.envTarget = rt;
  }

  makeMoon() {
    // Lune : disque avec ses « mers » et un bord doux, dans un halo léger.
    const S = 256;
    const c = document.createElement('canvas');
    c.width = S;
    c.height = S;
    const ctx = c.getContext('2d');
    const h = S / 2;
    const halo = ctx.createRadialGradient(h, h, S * 0.12, h, h, h);
    halo.addColorStop(0, 'rgba(200,215,255,0.42)');
    halo.addColorStop(0.45, 'rgba(190,205,250,0.12)');
    halo.addColorStop(1, 'rgba(190,205,250,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(0, 0, S, S);
    const R = S * 0.13;
    const disc = ctx.createRadialGradient(h - R * 0.3, h - R * 0.3, R * 0.2, h, h, R);
    disc.addColorStop(0, '#fbfcff');
    disc.addColorStop(0.85, '#e6ebf5');
    disc.addColorStop(1, '#c9d2e3');
    ctx.fillStyle = disc;
    ctx.beginPath();
    ctx.arc(h, h, R, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(h, h, R, 0, Math.PI * 2);
    ctx.clip();
    const rng = mulberry32(4);
    for (let i = 0; i < 16; i++) {
      const r = R * (0.08 + rng() * 0.22);
      const x = h + (rng() - 0.5) * R * 1.5;
      const y = h + (rng() - 0.5) * R * 1.5;
      const m = ctx.createRadialGradient(x, y, 0, x, y, r);
      m.addColorStop(0, 'rgba(150,162,185,0.5)');
      m.addColorStop(1, 'rgba(150,162,185,0)');
      ctx.fillStyle = m;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
    moon.scale.setScalar(320);
    return moon;
  }

  makeStars() {
    // Étoiles : tailles et éclats variés, scintillement léger, une Voie lactée discrète.
    const rng = mulberry32(99);
    const pos = [];
    const col = [];
    const size = [];
    const phase = [];
    const count = this.quality === 'high' ? 2200 : 1200;
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const milky = i > count * 0.6;
      let u;
      let a;
      if (milky) {
        // Bande inclinée : étoiles faibles et serrées autour d'un grand cercle.
        const along = rng() * Math.PI * 2;
        const off = (rng() + rng() + rng() - 1.5) * 0.22;
        const x = Math.cos(along);
        const y = Math.sin(along) * 0.55 + off;
        const z = Math.sin(along) * 0.83 - off * 0.5;
        const l = Math.hypot(x, y, z);
        u = y / l;
        a = Math.atan2(z / l, x / l);
      } else {
        u = rng() * 2 - 1;
        a = rng() * Math.PI * 2;
      }
      const r = Math.sqrt(Math.max(0, 1 - u * u));
      const y = Math.abs(u);
      pos.push(Math.cos(a) * r * 1500, y * 1500 + 40, Math.sin(a) * r * 1500);
      const bright = milky ? 0.25 + rng() * 0.3 : 0.5 + rng() * rng() * 0.5;
      const warm = rng();
      c.setRGB(1, 1, 1);
      if (warm < 0.2) c.setRGB(1, 0.86, 0.72);
      else if (warm > 0.8) c.setRGB(0.78, 0.86, 1);
      col.push(c.r * bright, c.g * bright, c.b * bright);
      size.push(milky ? 1.2 + rng() * 0.8 : 1.6 + rng() * rng() * 2.4);
      phase.push(rng() * 6.283);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
    geo.setAttribute('aPhase', new THREE.Float32BufferAttribute(phase, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: { uTime: gfx.time, uOpacity: { value: 0 }, uPixelRatio: { value: 1 } },
      vertexShader: `
attribute float aSize;
attribute float aPhase;
uniform float uTime;
uniform float uOpacity;
uniform float uPixelRatio;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  float tw = 0.7 + 0.3 * sin(uTime * (1.2 + aPhase * 0.5) + aPhase * 17.0);
  gl_PointSize = aSize * uPixelRatio * (0.85 + 0.15 * tw);
  vColor = color;
  vAlpha = uOpacity * (0.55 + 0.45 * tw);
}`,
      fragmentShader: `
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.25, d);
  gl_FragColor = vec4(vColor, a * vAlpha);
}`,
      transparent: true, depthWrite: false, vertexColors: true, fog: false,
    });
    const stars = new THREE.Points(geo, m);
    stars.frustumCulled = false;
    return stars;
  }

  makeClouds() {
    // Nuages : des grappes de « bouffées » toujours tournées vers la caméra, claires en haut et
    // ombrées en dessous. Toutes les bouffées tiennent dans un seul maillage instancié (un seul
    // appel de rendu) ; leur dérive avec le vent se calcule dans le shader.
    const rng = mulberry32(5);
    const high = this.quality === 'high';
    const count = high ? 34 : 20;
    const puffs = [];
    for (let i = 0; i < count; i++) {
      const n = 5 + Math.floor(rng() * 6);
      const w = 30 + rng() * 40;
      const a = rng() * Math.PI * 2;
      const d = 90 + rng() * 300;
      const cx = Math.cos(a) * d;
      const cy = 110 + rng() * 50;
      const cz = Math.sin(a) * d;
      for (let j = 0; j < n; j++) {
        const t = j / (n - 1) - 0.5;
        const s = (22 + rng() * 22) * (1 - Math.abs(t) * 0.8);
        puffs.push({
          x: cx + t * w + (rng() - 0.5) * 8, y: cy + Math.sin((t + 0.5) * Math.PI) * 6 + rng() * 3, z: cz + (rng() - 0.5) * 16,
          sx: s * 1.6, sy: s, cx,
        });
      }
    }
    const geo = new THREE.InstancedBufferGeometry().copy(new THREE.PlaneGeometry(1, 1));
    geo.instanceCount = puffs.length;
    const off = new Float32Array(puffs.length * 3);
    const sc = new Float32Array(puffs.length * 3);
    puffs.forEach((p, i) => {
      off.set([p.x, p.y, p.z], i * 3);
      sc.set([p.sx, p.sy, p.cx], i * 3);
    });
    geo.setAttribute('iOffset', new THREE.InstancedBufferAttribute(off, 3));
    geo.setAttribute('iScale', new THREE.InstancedBufferAttribute(sc, 3));
    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: cloudTexture() }, uTime: gfx.time, uSpeed: { value: 1.5 },
        uColor: { value: new THREE.Color(1, 1, 1) }, uShade: { value: new THREE.Color(0.6, 0.62, 0.68) },
        uOpacity: { value: 0.9 },
        uFogColor: { value: this.scene.fog.color }, uFogRange: { value: new THREE.Vector3(60, 400, 0.65) },
      },
      vertexShader: `
attribute vec3 iOffset;
attribute vec3 iScale;
uniform float uTime;
uniform float uSpeed;
uniform vec3 uFogRange;
varying vec2 vUv;
varying float vFog;
void main() {
  vUv = uv;
  // Dérive du nuage entier (toutes ses bouffées ensemble), en boucle sur 760 m.
  float cx = mod(iScale.z + uTime * uSpeed + 380.0, 760.0) - 380.0;
  vec3 center = vec3(cx + (iOffset.x - iScale.z), iOffset.y, iOffset.z);
  vec4 mv = modelViewMatrix * vec4(center, 1.0);
  mv.xy += position.xy * iScale.xy;
  gl_Position = projectionMatrix * mv;
  // Perspective aérienne : les nuages lointains se fondent dans la brume (à moitié par beau temps,
  // entièrement par temps de brouillard : uFogRange.z).
  vFog = smoothstep(uFogRange.x, uFogRange.y * 1.5, length(mv.xyz)) * uFogRange.z;
}`,
      fragmentShader: `
uniform sampler2D map;
uniform vec3 uColor;
uniform vec3 uShade;
uniform vec3 uFogColor;
uniform float uOpacity;
varying vec2 vUv;
varying float vFog;
void main() {
  vec4 t = texture2D(map, vUv);
  float l = smoothstep(0.55, 1.0, max(t.r, max(t.g, t.b)));
  vec3 col = mix(mix(uShade, uColor, l), uFogColor, vFog);
  gl_FragColor = vec4(col, t.a * uOpacity);
}`,
      transparent: true, depthWrite: false, fog: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.frustumCulled = false;
    mesh.userData.mat = mat;
    mesh.renderOrder = -1;
    return mesh;
  }

  /**
   * Lueur chaude que les fenêtres allumées projettent au sol, la nuit : un seul maillage
   * instancié (une tache par fenêtre), additif, posé juste au-dessus du sol devant la façade.
   */
  makeWindowGlow(g) {
    const spots = [];
    const wm = new Set(B.windowMaterials);
    const p = new THREE.Vector3();
    const n = new THREE.Vector3();
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      if (!o.isMesh || !wm.has(o.material)) return;
      o.getWorldPosition(p);
      n.set(0, 0, 1).transformDirection(o.matrixWorld);
      n.y = 0;
      if (n.lengthSq() < 0.5) return;
      n.normalize();
      spots.push({ x: p.x, z: p.z, h: p.y - this.heightAt(p.x, p.z), nx: n.x, nz: n.z });
    });
    if (!spots.length) return null;
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: windowGlowTexture(), color: 0xffb870, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    spots.forEach((w, i) => {
      // Plus la fenêtre est haute, plus la tache s'étale loin de la façade.
      const reach = 2.2 + Math.max(0, w.h - 1.5) * 1.1;
      const width = 2.6 + Math.max(0, w.h - 1.5) * 0.6;
      const cx = w.x + w.nx * (reach / 2 - 0.05);
      const cz = w.z + w.nz * (reach / 2 - 0.05);
      q.setFromAxisAngle(up, Math.atan2(w.nx, w.nz));
      s.set(width, 1, reach);
      m.compose(p.set(cx, this.heightAt(cx, cz) + 0.05, cz), q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    mesh.visible = false;
    return mesh;
  }

  /** Hauteur du sol en (x, z), la même pour le terrain et pour tout ce qui marche dessus. */
  heightAt(x, z) {
    const p = this.place;
    if (!p) return 0;
    const r = Math.hypot(x, z);
    let h = p.hills * (
      Math.sin(x * 0.045) * Math.cos(z * 0.05) * 1.6
      + Math.sin(x * 0.017 + 1.3) * Math.sin(z * 0.021 + 0.7) * 4
      + Math.sin((x + z) * 0.09) * 0.4
    );
    h *= smooth(34, 75, r);
    h *= 1 - showgroundFlat(x, z); // activités : terrain de concours bien plat
    if (p.mountains) h += smooth(100, 190, r) * (30 + 14 * Math.sin(Math.atan2(z, x) * 5));
    if (p.sea) h -= smooth(42, 80, x) * 7;
    if (p.lake) {
      const d = Math.hypot(x + 62, z + 48);
      h -= (1 - smooth(14, 32, d)) * 5;
    }
    return h;
  }

  isWater(x, z) {
    return this.waterLevel !== null && this.heightAt(x, z) < this.waterLevel + 0.15;
  }

  build(placeId, season, isHome = false) {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((o) => {
        if (o.isMesh || o.isInstancedMesh) {
          o.geometry.dispose();
          if (o.material.map && !o.material.map.userData?.shared) o.material.map.dispose?.();
          o.userData.depthTex?.dispose();
          o.material.dispose();
        }
      });
    }
    B.windowMaterials.length = 0;
    this.place = PLACES[placeId];
    this.season = season;
    const p = this.place;
    const g = new THREE.Group();
    this.group = g;
    this.colliders = [];
    this.interactables = [];
    this.clearZones = [];
    this.waterLevel = p.sea || p.lake ? WATER_LEVEL : null;
    const rng = mulberry32(placeId.length * 977 + 13);
    const snowy = [0xeef2f6, 0xeef1f4, 0xf0f3f6].includes(GROUND[p.biome][season]);

    g.add(this.makeTerrain(season, rng));
    if (this.waterLevel !== null) g.add(this.makeWater(snowy && p.lake));

    // Bâtiments
    const place = (obj, x, z, rotY = 0, kind = null) => {
      obj.group.position.set(x, this.heightAt(x, z), z);
      obj.group.rotation.y = rotY;
      g.add(obj.group);
      const [w, d] = obj.size;
      const swap = Math.abs(Math.sin(rotY)) > 0.5;
      this.colliders.push({ x, z, hw: (swap ? d : w) / 2 + 0.3, hd: (swap ? w : d) / 2 + 0.3, kind });
    };
    const doorOf = (x, z, d, rotY = 0) => ({ x: x + Math.sin(rotY) * (d / 2 + 1.4), z: z + Math.cos(rotY) * (d / 2 + 1.4) });

    // Maison et écurie où l'on entre (murs, portes, pièces) : voir src/game/Interiors.js.
    buildInteriors(this, g, isHome);
    if (isHome) {
      place(B.jobBoard(t('jobBoard')), 6, -9.5, 0, 'jobs');
      this.interactables.push({ kind: 'jobs', x: 6, z: -8.4 });
    } else {
      place(B.lodge(L({ fr: 'Gîte', en: 'Lodge' }), p.biome), 0, -16, 0, 'lodge');
      this.interactables.push({ kind: 'lodge', ...doorOf(0, -16, 7) });
    }
    place(B.refuge(isHome ? t('refuge') : t('breeder'), !isHome), 18, -6, -Math.PI / 2, 'refuge');
    this.interactables.push({ kind: 'refuge', ...doorOf(18, -6, 7, -Math.PI / 2) });
    place(B.vetClinic(L({ fr: 'Vétérinaire', en: 'Vet' })), 18, 9, -Math.PI / 2, 'vet');
    this.interactables.push({ kind: 'vet', ...doorOf(18, 9, 7, -Math.PI / 2) });

    const pad = B.paddock(18, 14);
    const [padX, padZ] = coreAt('paddock', -16, 16); // le paddock peut être déplacé
    pad.position.set(padX, this.heightAt(padX, padZ), padZ);
    pad.rotation.y = Math.PI / 2;
    g.add(pad);
    const deco = (obj, x, z, ry = 0) => {
      obj.position.set(x, this.heightAt(x, z), z);
      obj.rotation.y = ry;
      g.add(obj);
    };
    deco(B.trough(), ...coreAt('paddock', -21.5, 11), Math.PI / 2);
    deco(B.hayBale(), ...coreAt('paddock', -21.5, 21));
    deco(B.hayBale(), ...coreAt('paddock', -27, 8), 0.4);
    buildFarm(this, g, isHome);
    buildShowground(this, g); // activités : carrière, tribune et jury
    if (p.biome === 'garden') deco(B.torii(), 0, 30);
    if (p.biome === 'beach') deco(B.lighthouse(), 70, -60);

    // Montagnes au loin
    if (p.mountains) g.add(mountainRing(16, 230, true, p.volcano ? 0x4a4644 : 0x77716b, rng));
    else g.add(mountainRing(10, 300, false, 0x6f8a6a, rng));

    // Végétation, posée en dehors de la cour et de l'eau.
    const spots = (count, rMin, rMax, sMin, sMax) => {
      const out = [];
      let guard = 0;
      while (out.length < count && guard++ < count * 20) {
        const a = rng() * Math.PI * 2;
        const r = rMin + rng() * (rMax - rMin);
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        if (this.isWater(x, z)) continue;
        if (this.colliders.some((c) => Math.abs(x - c.x) < c.hw + 2 && Math.abs(z - c.z) < c.hd + 2)) continue;
        if (Math.abs(x - padX) < 9 && Math.abs(z - padZ) < 10) continue; // paddock
        if (this.clearZones.some((c) => Math.hypot(x - c.x, z - c.z) < c.r)) continue; // bergerie et pré
        out.push({ x, y: this.heightAt(x, z), z, s: sMin + rng() * (sMax - sMin), r: rng() * Math.PI * 2 });
      }
      return out;
    };
    const treeCount = this.quality === 'high' ? p.treeCount : Math.round(p.treeCount * 0.6);
    g.add(forest(p.trees, spots(treeCount, 30, 190, 0.8, 1.5), season, snowy));
    if (p.trees !== 'pine') g.add(forest('pine', spots(Math.round(treeCount * 0.15), 60, 190, 0.9, 1.4), season, snowy));
    g.add(rocks(spots(p.biome === 'tundra' ? 90 : 35, 15, 160, 0.3, 1.6), p.biome === 'tundra' ? 0x403c3a : 0x8c8a86));
    if (!snowy) {
      const grassColor = new THREE.Color(GROUND[p.biome][season]).offsetHSL(0, 0.08, 0.02).getHex();
      // Pas d'herbe haute dans la cour en terre battue.
      const yard = (s) => Math.hypot(s.x, s.z) > 15 + noise3(s.x * 0.15, s.z * 0.15, 8) * 8
        && !(p.sea && s.x > 38) && (this.waterLevel === null || s.y > this.waterLevel + 1);
      g.add(groundCover(spots(this.quality === 'high' ? 9000 : 1800, 5, 95, 0.7, 1.3).filter(yard), grassColor, FLOWERS[season]));
    }

    this.windowGlow = this.makeWindowGlow(g);
    if (this.windowGlow) g.add(this.windowGlow);
    this.scene.add(g);
    this.snowy = snowy;
  }

  makeTerrain(season, rng) {
    const p = this.place;
    const high = this.quality === 'high';
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const splat = [];
    const base = new THREE.Color(GROUND[p.biome][season]);
    const snowyGround = base.getHSL({}).l > 0.85;
    const dry = base.clone().offsetHSL(0.03, -0.05, 0.08);
    const lush = base.clone().offsetHSL(0.015, 0.06, -0.07);
    const sand = new THREE.Color(0xd8c495);
    const wetSand = new THREE.Color(0x9c8a66);
    const dirt = new THREE.Color(0x8f7a5a);
    const rock = new THREE.Color(p.volcano ? 0x3d3a38 : 0x86817a);
    const snow = new THREE.Color(0xf3f6f9);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);
      // Variations de grande taille : plaques d'herbe sèche et d'herbe grasse.
      const n = noise3(x * 0.03, z * 0.03, 1.7) * 0.65 + noise3(x * 0.11, z * 0.11, 4.2) * 0.35;
      c.copy(base);
      if (!snowyGround) {
        if (n > 0.5) c.lerp(dry, Math.min(1, (n - 0.5) * 2.2));
        else c.lerp(lush, Math.min(1, (0.5 - n) * 2.2));
      }
      c.offsetHSL((rng() - 0.5) * 0.01, (rng() - 0.5) * 0.03, (rng() - 0.5) * 0.03);
      const r = Math.hypot(x, z);
      let wDirt = 0;
      let wSand = 0;
      let wRock = 0;
      let wSnow = snowyGround ? 1 : 0;
      // Cour en terre battue autour des bâtiments, aux bords irréguliers.
      wDirt = (1 - smooth(13, 24, r + (noise3(x * 0.15, z * 0.15, 8) - 0.5) * 8)) * 0.75;
      if (p.sea) wSand = Math.max(wSand, smooth(36, 50, x + (noise3(z * 0.08, 1, 3) - 0.5) * 6) * 0.95);
      if (this.waterLevel !== null && y < this.waterLevel + 0.9) wSand = Math.max(wSand, smooth(this.waterLevel + 0.9, this.waterLevel + 0.3, y));
      if (p.mountains && y > 14) wRock = Math.max(wRock, smooth(14, 22, y + (n - 0.5) * 4));
      if (p.mountains && y > 26) wSnow = Math.max(wSnow, smooth(26, 32, y + (n - 0.5) * 3));
      if (p.volcano) wRock = Math.max(wRock, Math.max(0, Math.sin(x * 0.08) * Math.cos(z * 0.06)) * 0.6);
      c.lerp(dirt, wDirt);
      const wet = this.waterLevel !== null ? smooth(this.waterLevel + 0.35, this.waterLevel - 0.1, y) : 0;
      c.lerp(sand.clone().lerp(wetSand, wet), wSand);
      c.lerp(rock, wRock);
      c.lerp(snow, wSnow * (snowyGround ? 0.95 : 1));
      colors.push(c.r, c.g, c.b);
      splat.push(wDirt * (1 - wSand), wSand, wRock, wSnow);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute('splat', new THREE.Float32BufferAttribute(splat, 4));
    geo.computeVertexNormals();
    const detail = terrainDetail();
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    // Shader du sol : mélange de détails (herbe, terre, sable/neige, roche) et relief fin.
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.terrainDetail = { value: detail };
      sh.uniforms.gWet = gfx.wet;
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', `#include <common>
attribute vec4 splat;
varying vec4 vSplat;
varying vec2 vTUv;`)
        .replace('#include <begin_vertex>', `#include <begin_vertex>
vSplat = splat;
vTUv = position.xz;`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', `#include <common>
uniform sampler2D terrainDetail;
uniform float gWet;
varying vec4 vSplat;
varying vec2 vTUv;`)
        .replace('#include <color_fragment>', `#include <color_fragment>
vec4 dA = texture2D(terrainDetail, vTUv * 0.42);
vec4 dB = texture2D(terrainDetail, vTUv * 0.093 + 0.37);
vec4 dC = texture2D(terrainDetail, vTUv * 0.021 + 0.61);
float wGrass = max(0.0, 1.0 - vSplat.x - vSplat.y - vSplat.z - vSplat.w);
vec3 dd = dA.rgb * 0.1 + dB.rgb * 0.55 + dC.rgb * 0.35;
float th = dd.r * wGrass + dd.g * vSplat.x + dd.b * (vSplat.y + vSplat.w * 0.5) + (dB.g * 0.6 + dC.b * 0.4) * vSplat.z;
th += (dC.r - 0.5) * 0.25 * wGrass;
diffuseColor.rgb *= 0.76 + 0.48 * th;
diffuseColor.rgb *= 1.0 - gWet * 0.28 * (1.0 - vSplat.w);`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.55, vSplat.w * 0.6);
roughnessFactor = mix(roughnessFactor, 0.32, gWet * (1.0 - vSplat.w) * (0.6 + 0.4 * (vSplat.x + vSplat.y)));`);
      if (high) {
        sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 dpx = dFdx(-vViewPosition);
  vec3 dpy = dFdy(-vViewPosition);
  float tb = (dA.r * wGrass + dA.g * (vSplat.x + vSplat.z) + dA.b * (vSplat.y + vSplat.w)) * (1.0 - smoothstep(8.0, 30.0, length(vViewPosition)));
  float hx = dFdx(tb);
  float hy = dFdy(tb);
  vec3 r1 = cross(dpy, normal);
  vec3 r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  vec3 grad = sign(det) * (hx * r1 + hy * r2);
  normal = normalize(abs(det) * normal - grad * 0.5);
}`);
      }
    };
    mat.customProgramCacheKey = () => `terrain-${high}`;
    const mesh = new THREE.Mesh(geo, mat);
    mesh.receiveShadow = true;
    return mesh;
  }

  /**
   * Eau : vagues animées (deux couches de normales qui glissent), reflets du ciel,
   * couleur et transparence selon la profondeur, écume sur le rivage.
   */
  makeWater(ice) {
    const high = this.quality === 'high';
    // Profondeur de l'eau sur le terrain, calculée une fois (texture).
    const n = high ? 256 : 128;
    const depth = new Uint8Array(n * n * 4);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const x = (i / (n - 1) - 0.5) * SIZE;
        const z = (j / (n - 1) - 0.5) * SIZE;
        const d = Math.min(1, Math.max(0, (this.waterLevel - this.heightAt(x, z)) / 3));
        const k = (j * n + i) * 4;
        depth[k] = d * 255;
        depth[k + 3] = 255;
      }
    }
    const depthTex = new THREE.DataTexture(depth, n, n, THREE.RGBAFormat);
    depthTex.magFilter = THREE.LinearFilter;
    depthTex.minFilter = THREE.LinearFilter;
    depthTex.needsUpdate = true;
    const mat = new THREE.MeshStandardMaterial({
      color: ice ? 0xcfe3ef : 0x1d5a73, roughness: ice ? 0.5 : 0.04, metalness: 0,
      transparent: true, opacity: 0.92, normalMap: ice ? null : waterNormalTexture(),
    });
    if (!ice) {
      mat.normalScale.set(0.2, 0.2);
      mat.onBeforeCompile = (sh) => {
        sh.uniforms.gTime = gfx.time;
        sh.uniforms.waterDepth = { value: depthTex };
        sh.uniforms.wSky = { value: this.fogColor };
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
uniform float gTime;
varying vec2 vWPos;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
vWPos = vec2(position.x, -position.y);
${high ? `// Houle très douce : le plan d'eau respire.
transformed.z += (sin(vWPos.x * 0.21 + gTime * 0.9) * 0.5 + sin(vWPos.y * 0.17 - gTime * 0.7) * 0.5 + sin((vWPos.x + vWPos.y) * 0.09 + gTime * 0.5) * 0.4) * 0.09;` : ''}`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform float gTime;
uniform sampler2D waterDepth;
uniform vec3 wSky;
varying vec2 vWPos;
float wDepth;
float wFoam;`)
          .replace('#include <normal_fragment_maps>', `
vec2 wuv1 = vWPos * 0.045 + vec2(gTime * 0.012, gTime * 0.007);
vec2 wuv2 = vWPos * 0.11 + vec2(-gTime * 0.017, gTime * 0.013);
vec3 wn1 = texture2D(normalMap, wuv1).xyz * 2.0 - 1.0;
vec3 wn2 = texture2D(normalMap, wuv2).xyz * 2.0 - 1.0;
${high ? 'vec3 wn3 = texture2D(normalMap, vWPos * 0.31 + vec2(gTime * 0.03, -gTime * 0.02)).xyz * 2.0 - 1.0;' : 'vec3 wn3 = vec3(0.0, 0.0, 1.0);'}
vec3 mapN = normalize(vec3((wn1.xy + wn2.xy * 0.6 + wn3.xy * 0.2) * normalScale, 1.0));
normal = normalize(tbn * mapN);
// Fresnel : vue de loin et en rasant, l'eau devient un miroir du ciel (opaque, couleur de l'horizon).
float wFres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 3.5);
diffuseColor.rgb = mix(diffuseColor.rgb, wSky, wFres * 0.55);
diffuseColor.a = mix(diffuseColor.a, 1.0, wFres * 0.9);`)
          .replace('#include <color_fragment>', `#include <color_fragment>
wDepth = texture2D(waterDepth, vWPos / ${SIZE.toFixed(1)} + 0.5).r;
if (abs(vWPos.x) > ${(SIZE / 2).toFixed(1)} || abs(vWPos.y) > ${(SIZE / 2).toFixed(1)}) wDepth = 1.0;
vec3 shallow = vec3(0.16, 0.42, 0.42);
diffuseColor.rgb = mix(shallow, diffuseColor.rgb, smoothstep(0.0, 0.7, wDepth));
float fn = texture2D(normalMap, vWPos * 0.6 + vec2(gTime * 0.05, 0.0)).x;
wFoam = (1.0 - smoothstep(0.0, 0.09, wDepth)) * smoothstep(0.35, 0.65, fn + 0.25 * sin(gTime * 1.3 + vWPos.x * 0.7 + vWPos.y * 0.4));
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.93, 0.96, 0.97), wFoam * 0.85);
diffuseColor.a = mix(0.35, 0.94, smoothstep(0.0, 0.5, wDepth)) + wFoam * 0.5;`)
          .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.8, wFoam);`);
      };
      mat.customProgramCacheKey = () => `water-${high}`;
    }
    const seg = high && !ice ? 48 : 1;
    const geo = new THREE.PlaneGeometry(SIZE * 1.5, SIZE * 1.5, seg, seg);
    const water = new THREE.Mesh(geo, mat);
    water.rotation.x = -Math.PI / 2;
    water.position.y = this.waterLevel;
    water.receiveShadow = true;
    water.userData.depthTex = depthTex;
    return water;
  }

  /** Met à jour le ciel et la lumière selon l'heure (0–24) et la météo. */
  updateSky(hour, weather, focus) {
    const elev = 72 * Math.sin(((hour - 6) / 12) * Math.PI);
    const azim = ((hour - 6) / 12) * 180 + 90;
    const phi = THREE.MathUtils.degToRad(90 - elev);
    const theta = THREE.MathUtils.degToRad(azim);
    this.sunDir.setFromSphericalCoords(1, phi, theta);
    // La lune se lève à l'opposé du soleil, assez haut pour éclairer la nuit.
    this.moonDir.set(-this.sunDir.x, Math.abs(this.sunDir.y) * 0.8 + 0.25, -this.sunDir.z).normalize();
    const u = this.sky.material.uniforms;
    u.sunPosition.value.copy(this.sunDir);
    const overcast = { clear: 0, cloudy: 0.5, rain: 0.8, storm: 0.95, snow: 0.75, fog: 0.7 }[weather] ?? 0;
    const wind = { clear: 0.6, cloudy: 1, rain: 1.4, storm: 2.2, snow: 0.8, fog: 0.3 }[weather] ?? 0.8;
    gfx.wind.value += (wind - gfx.wind.value) * 0.02;
    // Le sol se mouille vite sous la pluie et sèche lentement.
    const rainy = weather === 'rain' || weather === 'storm';
    gfx.wet.value = Math.min(1, Math.max(0, gfx.wet.value + (rainy ? 0.004 : -0.0006)));
    const low = smooth(30, 0, elev) * smooth(-8, 2, elev);
    u.turbidity.value = 2 + overcast * 14 + low * 5;
    u.rayleigh.value = 1.2 + overcast * 1.5 + low * 1.3;
    u.mieCoefficient.value = 0.004 + overcast * 0.02 + low * 0.005;
    u.mieDirectionalG.value = 0.8 + low * 0.08;

    const day = smooth(-6, 10, elev);
    const golden = smooth(25, 2, elev) * day;
    // Crépuscule : entre -16° et +6°, l'horizon s'embrase côté soleil puis vire au violet.
    const twilight = smooth(-16, -4, elev) * smooth(12, 4, elev);
    const night = 1 - day;
    const clear = 1 - overcast;
    const env = !!this.pmrem;
    const sunCol = sunlightColor(scratch.sun, elev, hour);
    this.sun.color.copy(sunCol);
    this.sun.intensity = (env ? 3.5 : 2.8) * day * (1 - overcast * 0.8) * (1 - low * 0.3);
    // Lumière d'ambiance : ciel bleu (gris par temps couvert, doré le soir) au-dessus, reflet du sol en dessous.
    const skyCol = scratch.sky.copy(PAL.skyClear).lerp(PAL.skyGrey, overcast).lerp(PAL.skyGold, golden * 0.4 * clear);
    const nightSkyCol = scratch.night.copy(PAL.nightClear).lerp(PAL.nightGrey, overcast * 0.6);
    this.hemi.color.copy(nightSkyCol).lerp(skyCol, day);
    const groundCol = scratch.ground.setHex(this.place ? GROUND[this.place.biome][this.season] : 0x6f9a44);
    this.hemi.groundColor.copy(groundCol).multiplyScalar(0.25 + 0.35 * day);
    this.hemi.intensity = env
      ? 0.12 + 0.22 * day * (1 - overcast * 0.3) + 0.42 * night
      : 0.3 + 0.9 * day * (1 - overcast * 0.3) + 0.5 * night;
    this.updateEnvironment(day, overcast, groundCol);
    this.scene.environmentIntensity = 0.45 + 0.4 * overcast;

    // Lumière principale : le soleil (ou la lune) suit le joueur pour garder des ombres nettes autour de lui.
    const lightDir = elev > 0 ? this.sunDir : this.moonDir;
    if (elev <= 0) {
      // Clair de lune bleuté, plus faible sous les nuages.
      this.sun.intensity = 0.7 * (1 - overcast * 0.7) * smooth(0, -4, elev);
      this.sun.color.copy(PAL.moon);
    }
    this.placeShadowLight(focus, lightDir);

    // Brume de distance : sa couleur suit celle de l'horizon (bleutée, grise sous les nuages,
    // dorée le soir, violette au crépuscule, bleu nuit la nuit — jamais noire).
    const fogDay = scratch.fogDay.copy(PAL.fogDay).lerp(PAL.fogGrey, overcast);
    const fogNight = scratch.fogNight.copy(PAL.fogNight).lerp(PAL.fogNightGrey, overcast * 0.7);
    const fogColor = this.fogColor.copy(fogNight).lerp(fogDay, day)
      .lerp(PAL.fogGold, golden * 0.45 * clear)
      .lerp(PAL.fogDusk, twilight * night * 0.5 * clear);
    this.scene.fog.color.copy(fogColor);
    // Perspective aérienne : les lointains (montagnes) se fondent doucement dans l'horizon ;
    // plus dense sous la pluie et la neige, épaisse par temps de brouillard.
    const foggy = weather === 'fog' ? 1 : weather === 'snow' ? 0.6 : weather === 'rain' || weather === 'storm' ? 0.5 : 0;
    this.scene.fog.near = THREE.MathUtils.lerp(70 - overcast * 20, 8, foggy);
    this.scene.fog.far = THREE.MathUtils.lerp(480 - overcast * 100, 80, foggy);
    this.foggy = foggy;

    // Ciel : lueur du crépuscule, fond de nuit bleu, horizon fondu dans la brume (toujours un peu,
    // pour que le ciel et le brouillard se rejoignent sans cassure ; beaucoup quand le temps est bouché).
    u.duskGlow.value = twilight * clear * 0.9;
    u.nightSky.value.copy(PAL.nightSky).multiplyScalar(night * (1 - overcast * 0.6));
    u.hazeColor.value.copy(fogColor);
    u.hazeAmount.value = Math.max(foggy, 0.45 + overcast * 0.4);
    u.skyTint.value.setRGB(1, 1, 1).lerp(PAL.nightTint, night);

    this.stars.material.uniforms.uOpacity.value = smooth(-4, -12, elev) * clear;
    this.moon.visible = day < 0.6;
    this.moon.material.opacity = night * (1 - overcast * 0.8);
    this.moon.position.copy(focus).addScaledVector(this.moonDir, 1800);
    this.stars.position.set(focus.x, 0, focus.z);
    // (brouillard : les nuages sont noyés dans la brume, on ne les dessine pas)
    const cloudVis = { clear: 0.35, cloudy: 0.9, rain: 1, storm: 1, snow: 1, fog: 0 }[weather] ?? 0.4;
    const cm = this.clouds.userData.mat;
    cm.uniforms.uOpacity.value = Math.min(1, cloudVis * 1.05);
    // Nuages : blancs au soleil, dorés le soir, gris sous un ciel couvert, bleu sombre la nuit.
    const lit = scratch.lit.copy(PAL.cloudLit).lerp(PAL.cloudGrey, overcast * 0.8).lerp(sunCol, golden * 0.6 * clear);
    const shade = scratch.shade.copy(PAL.cloudShade).lerp(PAL.cloudShadeGrey, overcast).lerp(PAL.cloudShadeGold, golden * 0.5 * clear);
    cm.uniforms.uColor.value.copy(PAL.cloudNight).lerp(lit, day);
    cm.uniforms.uShade.value.copy(PAL.cloudNightShade).lerp(shade, day);
    cm.uniforms.uSpeed.value = 1.2 + gfx.wind.value * 1.2;
    this.clouds.visible = cloudVis > 0.01;

    for (const m of B.windowMaterials) m.emissiveIntensity = night * 1.4;
    if (this.windowGlow) {
      this.windowGlow.visible = night > 0.03;
      this.windowGlow.material.opacity = night * 0.85;
    }
    return { day, elev };
  }

  /**
   * Cadre la caméra d'ombre sur la zone utile autour du joueur, en alignant son centre sur la grille
   * des texels : l'ombre ne « grouille » plus quand on marche.
   */
  placeShadowLight(focus, lightDir) {
    const sun = this.sun;
    const basis = this._shadowBasis.lookAt(lightDir, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0));
    const inv = this._shadowInv.copy(basis).transpose();
    const texel = (SHADOW_HALF * 2) / sun.shadow.mapSize.x;
    const f = this._tmpV.copy(focus).applyMatrix4(inv);
    f.x = Math.round(f.x / texel) * texel;
    f.y = Math.round(f.y / texel) * texel;
    f.applyMatrix4(basis);
    sun.target.position.copy(f);
    sun.position.copy(f).addScaledVector(lightDir, 100);
  }

  updateClouds(dt) {
    gfx.time.value += dt;
    // (après updateSky et l'éventuel recul du brouillard en vue d'ensemble)
    this.clouds.userData.mat.uniforms.uFogRange.value.set(this.scene.fog.near, this.scene.fog.far, 0.65 + 0.35 * (this.foggy ?? 0));
  }

  /** Que représente ce point du sol ? (bâtiment, enclos, paddock…) */
  kindAt(x, z) {
    const c = this.colliders.find((k) => k.kind && Math.abs(x - k.x) < k.hw + 0.5 && Math.abs(z - k.z) < k.hd + 0.5);
    if (c) return c.kind;
    // (positions décalées si le joueur a déplacé ces installations : coreLayout.js)
    const [pdx, pdz] = coreAt('paddock', -16, 16);
    const [hx, hz] = coreAt('hutch', 9, 4);
    const [kx, kz] = coreAt('kennel', -9, -7);
    const [px, pz] = coreAt('pen', 14, 35);
    if (Math.abs(x - pdx) < 8 && Math.abs(z - pdz) < 10) return 'paddock';
    if (Math.abs(x - hx) < 3 && Math.abs(z - hz) < 2.6) return 'hutch';
    if (Math.abs(x - kx) < 1.5 && Math.abs(z - kz) < 1.5) return 'kennel';
    if (Math.abs(x - px) < 10.5 && Math.abs(z - pz) < 7.5) return 'pen';
    return null;
  }

  /** Vrai si le point est à l'intérieur d'un bâtiment (pour la caméra). */
  insideBuilding(x, y, z) {
    // Bâtiments où l'on entre : leur volume compte, sauf celui où l'on est (vue en coupe).
    if ((this.camVolumes ?? []).some((v) => v.id !== this.cutaway && Math.abs(x - v.x) < v.hw && Math.abs(z - v.z) < v.hd && y < v.top)) return true;
    return this.colliders.some((c) => !c.fence && !c.equip && !c.wire && !c.jump && !c.small && !c.room && Math.abs(x - c.x) < c.hw && Math.abs(z - c.z) < c.hd && y < this.heightAt(c.x, c.z) + 7);
  }

  /** Repousse un point (x, z, rayon) hors des bâtiments. */
  resolveCollisions(pos, radius = 0.4, opts = {}) {
    for (const c of this.colliders) {
      if (opts.small && (c.fence || c.jump)) continue; // les petits animaux passent sous les barrières
      if (opts.mounted && c.jump) continue; // à cheval, on saute les obstacles
      const dx = pos.x - c.x;
      const dz = pos.z - c.z;
      const ox = c.hw + radius - Math.abs(dx);
      const oz = c.hd + radius - Math.abs(dz);
      if (ox > 0 && oz > 0) {
        if (ox < oz) pos.x += Math.sign(dx || 1) * ox;
        else pos.z += Math.sign(dz || 1) * oz;
      }
    }
    const lim = SIZE / 2 - 30;
    pos.x = Math.max(-lim, Math.min(lim, pos.x));
    pos.z = Math.max(-lim, Math.min(lim, pos.z));
  }
}

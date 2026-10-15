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

export class World {
  constructor(scene, quality) {
    this.scene = scene;
    this.quality = quality;
    this.group = null;
    this.colliders = [];
    this.interactables = [];
    this.place = null;
    this.waterLevel = null;

    // Ciel physique (diffusion de la lumière), soleil, lumière d'ambiance.
    this.sky = new Sky();
    this.sky.scale.setScalar(4000);
    scene.add(this.sky);
    this.sunDir = new THREE.Vector3();

    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6b3a, 0.8);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff1dc, 2.5);
    this.sun.castShadow = quality === 'high';
    const s = this.sun.shadow;
    s.mapSize.set(quality === 'high' ? 2048 : 1024, quality === 'high' ? 2048 : 1024);
    s.camera.left = -35;
    s.camera.right = 35;
    s.camera.top = 35;
    s.camera.bottom = -35;
    s.camera.near = 1;
    s.camera.far = 220;
    s.bias = -0.0005;
    s.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);

    scene.fog = new THREE.Fog(0xbfd6ea, 60, 380);

    // Éclairage d'ambiance par le ciel (image-based lighting) : une copie du ciel sans disque
    // solaire, plus un sol, est « photographiée » de temps en temps (PMREM) et sert
    // d'environnement à tous les matériaux. Mise à jour rare : coût négligeable.
    this.envScene = new THREE.Scene();
    const envSkyMat = this.sky.material.clone();
    envSkyMat.uniforms = this.sky.material.uniforms;
    // Teinte du ciel (bleu nuit) appliquée au ciel visible et à sa copie d'éclairage.
    this.sky.material.uniforms.skyTint = { value: new THREE.Color(1, 1, 1) };
    const tint = (sh) => {
      sh.fragmentShader = sh.fragmentShader
        .replace('uniform vec3 up;', 'uniform vec3 up;\nuniform vec3 skyTint;')
        .replace('gl_FragColor = vec4( retColor, 1.0 );', 'gl_FragColor = vec4( retColor * skyTint, 1.0 );');
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
  }

  /** Donne au monde l'accès au moteur de rendu (pour l'éclairage par le ciel). */
  setRenderer(renderer) {
    this.renderer = renderer;
    this.pmrem = new THREE.PMREMGenerator(renderer);
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
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const glow = ctx.createRadialGradient(64, 64, 10, 64, 64, 64);
    glow.addColorStop(0, 'rgba(220,230,255,0.5)');
    glow.addColorStop(1, 'rgba(220,230,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = '#eef1f6';
    ctx.beginPath();
    ctx.arc(64, 64, 18, 0, Math.PI * 2);
    ctx.fill();
    const rng = mulberry32(4);
    ctx.fillStyle = 'rgba(150,160,175,0.45)';
    for (let i = 0; i < 9; i++) {
      ctx.beginPath();
      ctx.arc(52 + rng() * 24, 52 + rng() * 24, 2 + rng() * 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: false, depthWrite: false }));
    moon.scale.setScalar(260);
    return moon;
  }

  makeStars() {
    const rng = mulberry32(99);
    const pos = [];
    for (let i = 0; i < 1500; i++) {
      const u = rng() * 2 - 1;
      const a = rng() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const y = Math.abs(u);
      pos.push(Math.cos(a) * r * 1500, y * 1500 + 40, Math.sin(a) * r * 1500);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const m = new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    return new THREE.Points(geo, m);
  }

  makeClouds() {
    // Nuages : des grappes de « bouffées » toujours tournées vers la caméra (sprites),
    // claires en haut et grisées en dessous.
    const g = new THREE.Group();
    const rng = mulberry32(5);
    const mat = new THREE.SpriteMaterial({ map: cloudTexture(), color: 0xffffff, transparent: true, opacity: 0.9, fog: false, depthWrite: false });
    const count = this.quality === 'high' ? 34 : 20;
    for (let i = 0; i < count; i++) {
      const cloud = new THREE.Group();
      const n = 5 + Math.floor(rng() * 6);
      const w = 30 + rng() * 40;
      for (let j = 0; j < n; j++) {
        const sp = new THREE.Sprite(mat);
        const t = j / (n - 1) - 0.5;
        const s = (22 + rng() * 22) * (1 - Math.abs(t) * 0.8);
        sp.scale.set(s * 1.6, s, 1);
        sp.position.set(t * w + (rng() - 0.5) * 8, Math.sin((t + 0.5) * Math.PI) * 6 + rng() * 3, (rng() - 0.5) * 16);
        cloud.add(sp);
      }
      const a = rng() * Math.PI * 2;
      const d = 90 + rng() * 300;
      cloud.position.set(Math.cos(a) * d, 110 + rng() * 50, Math.sin(a) * d);
      g.add(cloud);
    }
    g.userData.mat = mat;
    return g;
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
        sh.vertexShader = sh.vertexShader
          .replace('#include <common>', `#include <common>
varying vec2 vWPos;`)
          .replace('#include <begin_vertex>', `#include <begin_vertex>
vWPos = vec2(position.x, -position.y);`);
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <common>', `#include <common>
uniform float gTime;
uniform sampler2D waterDepth;
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
normal = normalize(tbn * mapN);`)
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
    const geo = new THREE.PlaneGeometry(SIZE * 1.5, SIZE * 1.5);
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
    const env = !!this.pmrem;
    this.sun.intensity = (env ? 3.6 : 2.8) * day * (1 - overcast * 0.8);
    this.sun.color.setHSL(0.08, 0.35 + golden * 0.55, 0.93 - golden * 0.22);
    // Avec l'éclairage par le ciel, la lumière d'ambiance ne sert plus que d'appoint (et la nuit).
    this.hemi.intensity = env ? 0.12 + 0.2 * day * (1 - overcast * 0.3) + 0.18 * (1 - day) : 0.22 + 0.9 * day * (1 - overcast * 0.3);
    this.hemi.color.setHSL(0.6, 0.45, 0.3 + 0.45 * day);
    this.hemi.groundColor.setHSL(0.22, 0.3, 0.08 + 0.22 * day);
    const groundCol = new THREE.Color(this.place ? GROUND[this.place.biome][this.season] : 0x6f9a44);
    this.updateEnvironment(day, overcast, groundCol);
    this.scene.environmentIntensity = 0.45 + 0.4 * overcast;

    // Lumière : le soleil suit le joueur pour garder des ombres nettes autour de lui.
    const lightDir = elev > 0 ? this.sunDir : this.sunDir.clone().setY(Math.abs(this.sunDir.y) + 0.3);
    this.sun.position.copy(focus).addScaledVector(lightDir, 100);
    this.sun.target.position.copy(focus);
    if (elev <= 0) {
      // Clair de lune bleuté.
      this.sun.intensity = 0.45 * (1 - overcast * 0.6);
      this.sun.color.setHex(0x9fb7e8);
    }

    const fogDay = new THREE.Color(0xbfd3e6).lerp(new THREE.Color(0xb7bcc2), overcast);
    const fogNight = new THREE.Color(0x0d1626);
    const fogColor = fogNight.lerp(fogDay, day).lerp(new THREE.Color(0xe7a678), golden * 0.35 * (1 - overcast));
    this.scene.fog.color.copy(fogColor);
    const foggy = weather === 'fog' ? 1 : weather === 'snow' || weather === 'rain' || weather === 'storm' ? 0.5 : 0;
    this.scene.fog.near = 90 - foggy * 82;
    this.scene.fog.far = 650 - foggy * 570;

    this.stars.material.opacity = (1 - day) * (1 - overcast);
    u.skyTint.value.setRGB(1, 1, 1).lerp(new THREE.Color(0.55, 0.75, 1.5), 1 - day);
    this.moon.visible = day < 0.6;
    this.moon.material.opacity = (1 - day) * (1 - overcast * 0.8);
    this.moon.position.copy(focus).addScaledVector(new THREE.Vector3(-this.sunDir.x, Math.abs(this.sunDir.y) * 0.8 + 0.25, -this.sunDir.z).normalize(), 1800);
    this.stars.position.set(focus.x, 0, focus.z);
    const cloudVis = { clear: 0.35, cloudy: 0.9, rain: 1, storm: 1, snow: 1, fog: 0.6 }[weather] ?? 0.4;
    const cm = this.clouds.userData.mat;
    cm.opacity = Math.min(1, cloudVis * 1.05);
    cm.color.setHSL(0.07, 0.6 * golden, 0.12 + 0.82 * day * (1 - overcast * 0.45));
    this.clouds.visible = cloudVis > 0.01;

    const lit = 1 - day;
    for (const m of B.windowMaterials) m.emissiveIntensity = lit * 1.4;
    return { day, elev };
  }

  updateClouds(dt) {
    gfx.time.value += dt;
    for (const c of this.clouds.children) {
      c.position.x += dt * 1.5;
      if (c.position.x > 380) c.position.x = -380;
    }
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

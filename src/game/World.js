// Construit un lieu (terrain, eau, bâtiments, végétation) et gère le ciel, le soleil et la nuit.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { PLACES } from '../sim/places.js';
import { mulberry32 } from '../sim/rng.js';
import { t, L } from '../i18n.js';
import { groundDetail } from './textures.js';
import * as B from './models/buildings.js';
import { forest, rocks, groundCover, mountainRing } from './models/nature.js';
import { buildFarm } from './farmLayout.js';

const SIZE = 420;
const SEGMENTS = 168;
export const WATER_LEVEL = -1.1;

const smooth = (a, b, x) => {
  const t2 = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t2 * t2 * (3 - 2 * t2);
};

const GROUND = {
  countryside: { spring: 0x6fa344, summer: 0x7aa53f, autumn: 0x8f9a48, winter: 0x7f8f6c },
  beach: { spring: 0x78a44a, summer: 0x86a84b, autumn: 0x8a9a4c, winter: 0x7a8c66 },
  mountain: { spring: 0x6f9e4a, summer: 0x6a9a44, autumn: 0x8a8f4a, winter: 0xeef2f6 },
  tundra: { spring: 0x6c8a52, summer: 0x6f9152, autumn: 0x8a7e4c, winter: 0xeef1f4 },
  forest: { spring: 0x5f8f3e, summer: 0x568a38, autumn: 0x7d8a3e, winter: 0xf0f3f6 },
  garden: { spring: 0x7aa64c, summer: 0x6d9c42, autumn: 0x9a9446, winter: 0x8a9670 },
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
    this.stars = this.makeStars();
    scene.add(this.stars);
    this.clouds = this.makeClouds();
    scene.add(this.clouds);
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
    const g = new THREE.Group();
    const rng = mulberry32(5);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, transparent: true, opacity: 0.85, fog: false, depthWrite: false });
    const geo = new THREE.IcosahedronGeometry(1, 2);
    for (let i = 0; i < 26; i++) {
      const cloud = new THREE.Group();
      const n = 4 + Math.floor(rng() * 4);
      for (let j = 0; j < n; j++) {
        const m = new THREE.Mesh(geo, mat);
        const s = 10 + rng() * 14;
        m.scale.set(s * 1.4, s * 0.55, s);
        m.position.set(j * 12 - n * 6, rng() * 4, rng() * 10 - 5);
        cloud.add(m);
      }
      const a = rng() * Math.PI * 2;
      const d = 80 + rng() * 260;
      cloud.position.set(Math.cos(a) * d, 90 + rng() * 40, Math.sin(a) * d);
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

  build(placeId, season) {
    if (this.group) {
      this.scene.remove(this.group);
      this.group.traverse((o) => {
        if (o.isMesh || o.isInstancedMesh) {
          o.geometry.dispose();
          if (o.material.map && !o.material.map.userData?.shared) o.material.map.dispose?.();
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
    const snowy = GROUND[p.biome][season] === 0xeef2f6 || GROUND[p.biome][season] === 0xeef1f4 || GROUND[p.biome][season] === 0xf0f3f6;

    g.add(this.makeTerrain(season, rng));
    if (this.waterLevel !== null) {
      const water = new THREE.Mesh(
        new THREE.PlaneGeometry(SIZE * 1.5, SIZE * 1.5),
        new THREE.MeshStandardMaterial({ color: snowy && p.lake ? 0xcfe3ef : 0x2f7392, roughness: snowy && p.lake ? 0.6 : 0.12, metalness: 0.15, transparent: true, opacity: 0.88 }),
      );
      water.rotation.x = -Math.PI / 2;
      water.position.y = this.waterLevel;
      water.receiveShadow = true;
      g.add(water);
    }

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

    if (p.home) {
      place(B.house(t('title')), 0, -16, 0, 'house');
      this.interactables.push({ kind: 'house', ...doorOf(0, -16, 7) });
      place(B.stable(L({ fr: 'Écurie', en: 'Stable' })), -22, -2, Math.PI / 2, 'stable');
      this.interactables.push({ kind: 'stable', ...doorOf(-22, -2, 7, Math.PI / 2) });
      place(B.jobBoard(t('jobBoard')), 6, -9.5, 0, 'jobs');
      this.interactables.push({ kind: 'jobs', x: 6, z: -8.4 });
    } else {
      place(B.lodge(L({ fr: 'Gîte', en: 'Lodge' }), p.biome), 0, -16, 0, 'lodge');
      this.interactables.push({ kind: 'lodge', ...doorOf(0, -16, 7) });
    }
    place(B.refuge(p.home ? t('refuge') : t('breeder'), !p.home), 18, -6, -Math.PI / 2, 'refuge');
    this.interactables.push({ kind: 'refuge', ...doorOf(18, -6, 7, -Math.PI / 2) });
    place(B.vetClinic(L({ fr: 'Vétérinaire', en: 'Vet' })), 18, 9, -Math.PI / 2, 'vet');
    this.interactables.push({ kind: 'vet', ...doorOf(18, 9, 7, -Math.PI / 2) });

    const pad = B.paddock(18, 14);
    pad.position.set(-16, this.heightAt(-16, 16), 16);
    pad.rotation.y = Math.PI / 2;
    g.add(pad);
    const deco = (obj, x, z, ry = 0) => {
      obj.position.set(x, this.heightAt(x, z), z);
      obj.rotation.y = ry;
      g.add(obj);
    };
    deco(B.trough(), -21.5, 11, Math.PI / 2);
    deco(B.hayBale(), -21.5, 21);
    deco(B.hayBale(), -27, 8, 0.4);
    buildFarm(this, g);
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
        if (x > -25 && x < -7 && z > 6 && z < 26) continue; // paddock
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
      g.add(groundCover(spots(this.quality === 'high' ? 2500 : 900, 6, 90, 0.6, 1.2), grassColor, FLOWERS[season]));
    }

    this.scene.add(g);
    this.snowy = snowy;
  }

  makeTerrain(season, rng) {
    const p = this.place;
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const base = new THREE.Color(GROUND[p.biome][season]);
    const sand = new THREE.Color(0xdcc89a);
    const dirt = new THREE.Color(0x9c8664);
    const rock = new THREE.Color(p.volcano ? 0x3d3a38 : 0x86817a);
    const snow = new THREE.Color(0xf3f6f9);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = this.heightAt(x, z);
      pos.setY(i, y);
      c.copy(base).offsetHSL((rng() - 0.5) * 0.02, (rng() - 0.5) * 0.05, (rng() - 0.5) * 0.05);
      const r = Math.hypot(x, z);
      // Cour en terre battue autour des bâtiments.
      c.lerp(dirt, (1 - smooth(14, 24, r)) * 0.55);
      if (p.sea) c.lerp(sand, smooth(36, 50, x) * 0.95);
      if (this.waterLevel !== null && y < this.waterLevel + 0.8) c.lerp(sand, 0.7);
      if (p.mountains && y > 14) c.lerp(rock, smooth(14, 22, y));
      if (p.mountains && y > 26) c.lerp(snow, smooth(26, 32, y));
      if (p.volcano) c.lerp(rock, Math.max(0, Math.sin(x * 0.08) * Math.cos(z * 0.06)) * 0.6);
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const detail = groundDetail();
    detail.userData.shared = true;
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 1 }));
    mesh.receiveShadow = true;
    return mesh;
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
    u.turbidity.value = 2 + overcast * 14;
    u.rayleigh.value = 1.2 + overcast * 1.5;
    u.mieCoefficient.value = 0.004 + overcast * 0.02;
    u.mieDirectionalG.value = 0.8;

    const day = smooth(-6, 10, elev);
    const golden = smooth(25, 2, elev) * day;
    this.sun.intensity = 2.8 * day * (1 - overcast * 0.75);
    this.sun.color.setHSL(0.09, 0.4 + golden * 0.5, 0.92 - golden * 0.2);
    this.hemi.intensity = 0.22 + 0.9 * day * (1 - overcast * 0.3);
    this.hemi.color.setHSL(0.58, 0.4, 0.35 + 0.45 * day);
    this.hemi.groundColor.setHSL(0.25, 0.3, 0.1 + 0.25 * day);

    // Lumière : le soleil suit le joueur pour garder des ombres nettes autour de lui.
    const lightDir = elev > 0 ? this.sunDir : this.sunDir.clone().setY(Math.abs(this.sunDir.y) + 0.3);
    this.sun.position.copy(focus).addScaledVector(lightDir, 100);
    this.sun.target.position.copy(focus);
    if (elev <= 0) {
      // Clair de lune bleuté.
      this.sun.intensity = 0.35 * (1 - overcast * 0.6);
      this.sun.color.setHex(0x9fb7e8);
    }

    const fogDay = new THREE.Color(0xbfd3e6).lerp(new THREE.Color(0xb7bcc2), overcast);
    const fogNight = new THREE.Color(0x0d1626);
    const fogColor = fogNight.lerp(fogDay, day).lerp(new THREE.Color(0xe7a678), golden * 0.35 * (1 - overcast));
    this.scene.fog.color.copy(fogColor);
    const foggy = weather === 'fog' ? 1 : weather === 'snow' || weather === 'rain' || weather === 'storm' ? 0.5 : 0;
    this.scene.fog.near = 60 - foggy * 52;
    this.scene.fog.far = 380 - foggy * 300;

    this.stars.material.opacity = (1 - day) * (1 - overcast);
    this.stars.position.set(focus.x, 0, focus.z);
    const cloudVis = { clear: 0.35, cloudy: 0.9, rain: 1, storm: 1, snow: 1, fog: 0.6 }[weather] ?? 0.4;
    const cm = this.clouds.userData.mat;
    cm.opacity = cloudVis * 0.9;
    cm.color.setHSL(0, 0, 0.25 + 0.7 * day * (1 - overcast * 0.45));
    this.clouds.visible = cloudVis > 0.01;

    const lit = 1 - day;
    for (const m of B.windowMaterials) m.emissiveIntensity = lit * 1.4;
    return { day, elev };
  }

  updateClouds(dt) {
    for (const c of this.clouds.children) {
      c.position.x += dt * 1.5;
      if (c.position.x > 380) c.position.x = -380;
    }
  }

  /** Que représente ce point du sol ? (bâtiment, enclos, paddock…) */
  kindAt(x, z) {
    const c = this.colliders.find((k) => k.kind && Math.abs(x - k.x) < k.hw + 0.5 && Math.abs(z - k.z) < k.hd + 0.5);
    if (c) return c.kind;
    if (x > -24 && x < -8 && z > 6 && z < 26) return 'stable';
    if (Math.abs(x - 14) < 10.5 && Math.abs(z - 35) < 7.5) return 'pen';
    return null;
  }

  /** Vrai si le point est à l'intérieur d'un bâtiment (pour la caméra). */
  insideBuilding(x, y, z) {
    return this.colliders.some((c) => !c.fence && !c.equip && Math.abs(x - c.x) < c.hw && Math.abs(z - c.z) < c.hd && y < this.heightAt(c.x, c.z) + 7);
  }

  /** Repousse un point (x, z, rayon) hors des bâtiments. */
  resolveCollisions(pos, radius = 0.4, opts = {}) {
    for (const c of this.colliders) {
      if (opts.small && c.fence) continue; // les petits animaux passent sous les barrières
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

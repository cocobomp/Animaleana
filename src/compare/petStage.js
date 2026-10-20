// Décor de la page « Chats et lapins » (repris du décor de la page des chiens) : le ciel, le soleil, la brume
// et l'éclairage du jeu (la classe World, src/game/World.js, sans bâtir de ferme), le sol du jeu (son shader
// de terrain), des touffes d'herbe et des fleurs (nature.js), quelques arbres au loin. Un seul moteur de rendu
// dessine toutes les cartes : le canevas couvre la fenêtre, derrière la page, et chaque carte visible est
// rendue dans son rectangle. Quand l'animal avance, le sol défile sous lui, à la vitesse où ses pattes posées
// ne glissent pas.
// Chats et lapins sont petits (25 cm au garrot, 20 cm de haut) : touffes d'herbe plus basses, qui s'effacent
// tout près de l'animal (elles cacheraient les pattes), ombre du soleil resserrée sur lui.

import * as THREE from 'three';
import { World } from '../game/World.js';
import { gfx } from '../game/gfx.js';
import { groundCover } from '../game/models/nature.js';
import { gltfForest, gltfBushes, hasGltfTrees } from '../game/models/gltfNature.js';
import { preloadModels } from '../game/assets.js';
import { mulberry32 } from '../sim/rng.js';

const HOUR = 15; // milieu d'après-midi, beau temps
const GRASS = 0x6c9a3a; // herbe de la campagne en été (GROUND de World.js)
const FLOWERS = [0xf5e663, 0xffffff, 0xe85a4a];
const TILE = 6; // période des touffes d'herbe (m) : le motif se répète, le défilement ne saute pas
const TILES = 7;
const CLEAR = [0.32, 0.62]; // (m) touffes effacées autour de l'animal, puis de plus en plus hautes
// Caméra : à hauteur d'enfant accroupi près de l'animal, de trois quarts par rapport au soleil.
const CAM_AZ = THREE.MathUtils.degToRad(170);
const CAM_EL = THREE.MathUtils.degToRad(13);
const CAM_FOV = 30;

let contactTex = null;
/** Ombre de contact douce sous l'animal (comme celle des animaux du jeu). r : demi-largeur, l : longueur. */
export function contactShadow(r, l) {
  if (!contactTex) {
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 31);
    g.addColorStop(0, 'rgba(0,0,0,0.75)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.4)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    contactTex = new THREE.CanvasTexture(c);
  }
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: contactTex, transparent: true, depthWrite: false, opacity: 0.45, toneMapped: false,
  }));
  m.scale.set(r * 3, 1, l * 1.45);
  m.position.y = 0.004;
  m.renderOrder = -1;
  return m;
}

/** Touffes et fleurs : plus basses près de l'animal (centre du décor), effacées tout près. */
function clearAround(material) {
  const base = material.onBeforeCompile;
  material.onBeforeCompile = (sh, r) => {
    base?.(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
{
  vec4 cmpRoot = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  float cmpK = smoothstep(${CLEAR[0].toFixed(3)}, ${CLEAR[1].toFixed(3)}, length(cmpRoot.xz));
  transformed *= cmpK;
}
#endif`);
  };
  const key = material.customProgramCacheKey?.bind(material);
  material.customProgramCacheKey = () => `${key ? key() : ''}|cmp-clear`;
  material.needsUpdate = true;
}

export class PetStage {
  constructor(canvas) {
    gfx.quality = 'high';
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(0x000000, 0);
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(CAM_FOV, 1, 0.02, 5000);
    this.world = new World(this.scene, 'high');
    this.world.setRenderer(renderer);
    this.focus = new THREE.Vector3();
    this.world.updateSky(HOUR, 'clear', this.focus);
    this.tightenShadow();
    this.pets = [];
    this.buildGround();
    // Arbres GLB du jeu au loin (s'ils se chargent ; sinon le pré reste dégagé).
    preloadModels(['tree_common', 'tree_common2', 'tree_birch', 'tree_pine', 'bush']).then(() => this.buildTrees()).catch(() => {});
  }

  /**
   * Ombre du soleil : le jeu la règle pour une cour de ferme entière ; ici l'animal est petit et toujours au
   * centre, on resserre son cadre (même direction de lumière) pour qu'elle soit aussi nette qu'en jeu de près.
   */
  tightenShadow() {
    this.scene.traverse((o) => {
      if (!o.isDirectionalLight || !o.castShadow) return;
      const cam = o.shadow.camera;
      cam.left = -1.1;
      cam.right = 1.1;
      cam.top = 1.1;
      cam.bottom = -1.1;
      cam.updateProjectionMatrix();
      o.shadow.bias = -0.0003;
      o.shadow.normalBias = 0.006;
      this.sun = o;
    });
  }

  /** Sol : le terrain du jeu (plat), avec un décalage de texture pour le défilement, et l'herbe. */
  buildGround() {
    const fake = { place: { biome: 'countryside' }, quality: 'high', heightAt: () => 0, dirtAt: () => 0, waterLevel: null };
    const terrain = World.prototype.makeTerrain.call(fake, 'summer', mulberry32(5));
    const scroll = { value: new THREE.Vector2() };
    const base = terrain.material.onBeforeCompile;
    terrain.material.onBeforeCompile = (sh) => {
      base(sh);
      sh.uniforms.cmpScroll = scroll;
      sh.vertexShader = sh.vertexShader
        .replace('varying vec2 vTUv;', 'varying vec2 vTUv;\nuniform vec2 cmpScroll;')
        .replace('vTUv = position.xz;', 'vTUv = position.xz + cmpScroll;');
    };
    terrain.material.customProgramCacheKey = () => 'cmp-terrain';
    this.scene.add(terrain);
    this.terrainScroll = scroll.value;

    // Touffes d'herbe et fleurs : un carreau de TILE m répété TILES × TILES fois, touffes basses (à la taille
    // d'un chat, l'herbe du pré lui arrive aux genoux).
    const rng = mulberry32(11);
    const tile = [];
    for (let i = 0; i < 80; i++) tile.push({ x: rng() * TILE, z: rng() * TILE, s: 0.2 + rng() * 0.16, r: rng() * Math.PI * 2 });
    const spots = [];
    const h = (TILES * TILE) / 2;
    for (let a = 0; a < TILES; a++) {
      for (let b = 0; b < TILES; b++) {
        for (const p of tile) spots.push({ x: p.x + a * TILE - h, y: 0, z: p.z + b * TILE - h, s: p.s, r: p.r });
      }
    }
    const grassColor = new THREE.Color(GRASS).offsetHSL(0, 0.08, 0.02).getHex();
    this.grass = groundCover(spots, grassColor, FLOWERS);
    this.grass.traverse((o) => {
      if (o.isInstancedMesh) clearAround(o.material);
    });
    this.scene.add(this.grass);
  }

  buildTrees() {
    if (!hasGltfTrees()) return;
    const rng = mulberry32(3);
    const spots = (n, r0, r1, spread) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        // (devant la caméra, en éventail, jamais juste derrière l'animal)
        let a = (rng() - 0.5) * spread;
        if (Math.abs(a) < 0.12) a += Math.sign(a || 1) * 0.15;
        const ang = CAM_AZ + Math.PI + a;
        const r = r0 + rng() * (r1 - r0);
        out.push({ x: Math.sin(ang) * r, y: 0, z: Math.cos(ang) * r, s: 0.8 + rng() * 0.6, r: rng() * Math.PI * 2 });
      }
      return out;
    };
    this.scene.add(gltfForest('deciduous', spots(16, 22, 60, 2.6), 'summer', false));
    this.scene.add(gltfForest('birch', spots(5, 26, 50, 2.2), 'summer', false));
    this.scene.add(gltfForest('pine', spots(8, 45, 85, 2.8), 'summer', false));
    this.scene.add(gltfBushes(spots(10, 7, 20, 2.4), 'summer'));
  }

  /** Ajoute un animal (son groupe) au décor ; un seul est visible par rendu. */
  addPet(holder) {
    holder.visible = false;
    this.pets.push(holder);
    this.scene.add(holder);
  }

  /** Prépare d'avance les shaders des animaux (sinon chaque carte qui apparaît fige l'image). */
  async precompile() {
    const shown = this.pets.map((h) => h.visible);
    this.pets.forEach((h) => { h.visible = true; });
    try {
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      /* (ancien navigateur : compilation au premier rendu) */
    }
    this.pets.forEach((h, i) => { h.visible = shown[i]; });
  }

  /** Taille du canevas : toute la fenêtre. */
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = this.renderer;
    const px = r.getPixelRatio();
    if (r.domElement.width !== Math.floor(w * px) || r.domElement.height !== Math.floor(h * px)) r.setSize(w, h, false);
  }

  /** Avance l'horloge commune (vent dans l'herbe et les arbres). */
  tick(dt) {
    this.world.updateClouds(dt);
  }

  /** Efface tout le canevas (transparent entre les cartes ; chaque rendu efface son rectangle). */
  clear() {
    const r = this.renderer;
    r.setScissorTest(false);
    r.clear(true, true, true);
  }

  /**
   * Dessine un animal dans un rectangle de l'écran (px CSS, repère de la fenêtre).
   * v : { holder, scroll {x, z}, size, frame {y, h, r} (cadrage pour la taille 1, FRAME de petCandidates.js),
   * long (dos allongé), tall (hauteur), yaw, pitch, zoom, focus ('head' : gros plan sur v.head) }.
   */
  render(rect, v) {
    const r = this.renderer;
    const H = window.innerHeight;
    const x = Math.max(0, rect.left);
    const y = Math.max(0, H - rect.bottom);
    r.setViewport(rect.left, H - rect.bottom, rect.width, rect.height);
    r.setScissor(x, y, Math.min(rect.width, rect.right - x), Math.min(rect.height, H - y));
    r.setScissorTest(true);
    for (const h of this.pets) h.visible = h === v.holder;
    v.holder.visible = true;
    v.holder.rotation.y = v.yaw;
    // Sol : texture du terrain et touffes décalées de ce que l'animal a parcouru.
    this.terrainScroll.set(-v.scroll.x, -v.scroll.z);
    const wrap = (a) => ((a % TILE) + TILE) % TILE - TILE / 2;
    this.grass.position.set(wrap(v.scroll.x), 0, wrap(v.scroll.z));
    // Caméra : assez loin pour que l'animal tienne en entier quand il tourne (hauteur ou largeur de la vue,
    // selon sa forme) ; elle recule avec la taille de l'animal (un nain est cadré comme un géant).
    const cam = this.camera;
    cam.aspect = rect.width / rect.height;
    const s = v.size;
    const f = v.frame;
    const t = Math.tan(THREE.MathUtils.degToRad(CAM_FOV / 2));
    const el = CAM_EL + (v.pitch ?? 0);
    let d;
    let target;
    if (v.focus === 'head' && v.head) {
      // Gros plan : la tête (position donnée dans le repère du décor), de trois quarts face.
      target = v.head;
      d = (Math.max((f.h * 0.46) / t, (f.h * 0.5) / (t * cam.aspect)) * s) / (v.zoom ?? 1);
    } else {
      const tall = v.tall ?? 1;
      target = _t.set(0, f.y * s * tall, 0);
      d = (Math.max((f.h * (0.35 + 0.65 * tall)) / t, (f.r * (v.long ?? 1)) / (t * cam.aspect)) * s) / (v.zoom ?? 1);
    }
    cam.position.set(target.x + Math.sin(CAM_AZ) * Math.cos(el) * d, target.y + Math.sin(el) * d, target.z + Math.cos(CAM_AZ) * Math.cos(el) * d);
    cam.lookAt(target);
    cam.near = Math.max(0.01, d * 0.05);
    cam.updateProjectionMatrix();
    r.render(this.scene, cam);
  }
}

const _t = new THREE.Vector3();
export const CAMERA_AZIMUTH = CAM_AZ;

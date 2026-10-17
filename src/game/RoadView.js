// Le trajet vu de la cabine : la route qui défile, le paysage du pays (arbres, poteaux, collines),
// le ciel selon l'heure. Le véhicule du voyage (avec les animaux dedans) roule sur cette route ;
// on regarde depuis le siège du conducteur (on peut tourner la tête), de dehors, ou dans le van.
// Aux pauses, le véhicule s'arrête sur une aire de repos (ou devant l'écurie d'étape le soir).
// Une petite scène à part : peu d'objets, réutilisés (InstancedMesh), rien n'est créé à chaque image.

import * as THREE from 'three';
import { PLACES } from '../sim/places.js';
import { hourOf } from '../sim/time.js';
import { currentStop, progress } from '../sim/trip.js';
import { isHigh } from './gfx.js';
import { CAB_PORTRAIT } from './Vehicle.js';

const SPAN = 420; // longueur de route qui boucle (m)
const BEHIND = 70; // les objets passent derrière nous jusque-là avant de revenir devant
const BASE_SPEED = 22; // m/s (80 km/h) à la vitesse ×1
// On roule à droite (France) : la caméra regarde vers +z, donc la droite de l'écran est du côté des x négatifs.
const LANE_X = -1.9;
const SIDE = -1; // côté de l'aire de repos (à droite de la route)
const portrait = () => window.innerWidth < window.innerHeight;

// Couleurs du paysage selon le pays.
const BIOMES = {
  countryside: { ground: 0x6f9a48, ground2: 0x5d8a3c, tree: 0x3f6f2e, tree2: 0x587f32, hill: 0x6c8f55, trees: 1, conifer: 0.2 },
  beach: { ground: 0x86a65a, ground2: 0xc9b98a, tree: 0x4b7a3a, tree2: 0x6b8f45, hill: 0x7a9a6a, trees: 0.6, conifer: 0.5 },
  mountain: { ground: 0x6a9250, ground2: 0x86a070, tree: 0x2f5a35, tree2: 0x3d6b3a, hill: 0x8a9aa8, trees: 1.1, conifer: 0.9, snowCaps: true },
  tundra: { ground: 0x8a9a6a, ground2: 0x9aa58a, tree: 0x4a6b45, tree2: 0x5d7a50, hill: 0x7d8790, trees: 0.25, conifer: 0.9, snowCaps: true },
  prairie: { ground: 0xa3a85a, ground2: 0x8f9a4c, tree: 0x5a7a3a, tree2: 0x748a40, hill: 0x9aa070, trees: 0.35, conifer: 0.3 },
  garden: { ground: 0x6a9a50, ground2: 0x5a8a45, tree: 0x3f7a40, tree2: 0xd08aa8, hill: 0x6a8a68, trees: 1.1, conifer: 0.35 },
  mediterranean: { ground: 0xb0a368, ground2: 0x9a9a5a, tree: 0x5d7a40, tree2: 0x7a8a50, hill: 0xa89a78, trees: 0.6, conifer: 0.45 },
  outback: { ground: 0xc08a50, ground2: 0xa8703a, tree: 0x6b7a40, tree2: 0x8a8a4a, hill: 0xb0683a, trees: 0.3, conifer: 0 },
};
const SNOW = { ground: 0xeef2f5, ground2: 0xdde6ec, tree: 0x2f4f3a, tree2: 0x3a5a45, hill: 0xf4f7fa };

const texCache = new Map();
function canvasTex(key, w, h, draw, repeat = [1, 1]) {
  if (!texCache.has(key)) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    draw(c.getContext('2d'), w, h);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.anisotropy = 4;
    texCache.set(key, tex);
  }
  const t = texCache.get(key).clone();
  t.needsUpdate = true;
  t.repeat.set(...repeat);
  return t;
}

/** Asphalte, lignes de bord et ligne du milieu en pointillés. */
function roadTexture() {
  return canvasTex('road', 128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#55585c';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 900; i++) {
      const v = 70 + Math.random() * 40;
      ctx.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
    }
    ctx.fillStyle = '#f2f0e6';
    ctx.fillRect(6, 0, 4, h);
    ctx.fillRect(w - 10, 0, 4, h);
    ctx.fillRect(w / 2 - 2, 0, 4, h * 0.45);
  }, [1, SPAN / 12]);
}

/** Herbe tachetée du bord de la route. */
function groundTexture() {
  return canvasTex('ground', 128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const v = 200 + Math.random() * 55;
      ctx.fillStyle = `rgba(${v * 0.8},${v},${v * 0.75},0.6)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 3);
    }
  }, [60, 60]);
}

export class RoadView {
  constructor(game, vehicle, trip) {
    this.game = game;
    this.vehicle = vehicle;
    this.trip = trip;
    this.cameraMode = 'cab';
    this.resetLook(); // un peu vers le bas : on voit le tableau de bord et la route
    this.orbit = 0.6;
    this.time = 0;
    this.speed = 0;
    this.offset = 0;
    this.disposables = [];
    const scene = new THREE.Scene();
    this.scene = scene;
    scene.environment = game.scene.environment;
    scene.environmentIntensity = 0.6;
    this.camera = new THREE.PerspectiveCamera(64, window.innerWidth / window.innerHeight, 0.04, 1200);
    scene.fog = new THREE.Fog(0xcfe3ef, 90, 560);
    scene.background = new THREE.Color(0xa9cfe8);

    // Lumières : soleil et ciel.
    this.hemi = new THREE.HemisphereLight(0xcfe6ff, 0x5a6a40, 1.4);
    this.sun = new THREE.DirectionalLight(0xfff2d8, 2.6);
    this.sun.position.set(40, 80, 30);
    scene.add(this.hemi, this.sun, this.sun.target);

    // Le paysage du départ (puis celui de l'arrivée, à mi-chemin).
    const from = PLACES[trip.from] ?? PLACES.maison;
    const to = PLACES[trip.to] ?? from;
    this.biomeA = BIOMES[from.biome] ?? BIOMES.countryside;
    this.biomeB = BIOMES[to.biome] ?? BIOMES.countryside;
    this.snowy = game.season === 'winter' && ['mountain', 'tundra'].includes(from.biome);
    this.build();

    // Le véhicule (et ses passagers) passe dans cette scène pour la durée du trajet.
    vehicle.removeColliders();
    vehicle.root.removeFromParent();
    vehicle.lead.visible = false;
    vehicle.setCutaway(false);
    vehicle.closeRamp();
    for (const p of vehicle.parts) {
      p.t = p.target;
      p.obj.rotation[p.axis] = p.closed + (p.open - p.closed) * p.t;
    }
    vehicle.root.position.set(LANE_X, 0, 0); // voie de droite
    vehicle.root.rotation.set(0, 0, 0);
    vehicle.heading = 0;
    vehicle.root.visible = true;
    scene.add(vehicle.root);
    this.lookAt = new THREE.Vector3();
    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.dummy = new THREE.Object3D();
    this.applyBiome(0);
  }

  track(obj) {
    this.disposables.push(obj);
    return obj;
  }

  build() {
    const scene = this.scene;
    const high = isHigh();
    // Sol, route, bas-côtés.
    this.groundMat = this.track(new THREE.MeshStandardMaterial({ color: 0x6f9a48, roughness: 1, map: this.track(groundTexture()) }));
    const ground = new THREE.Mesh(this.track(new THREE.PlaneGeometry(1400, 1400).rotateX(-Math.PI / 2)), this.groundMat);
    ground.position.y = -0.02;
    scene.add(ground);
    this.roadTex = this.track(roadTexture());
    const road = new THREE.Mesh(this.track(new THREE.PlaneGeometry(7.6, SPAN * 2).rotateX(-Math.PI / 2)),
      this.track(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, map: this.roadTex })));
    road.position.set(0, 0.0, SPAN / 2);
    this.roadTex.repeat.set(1, (SPAN * 2) / 12);
    scene.add(road);
    this.shoulderMat = this.track(new THREE.MeshStandardMaterial({ color: 0x9a8f78, roughness: 1 }));
    for (const x of [-1, 1]) {
      const s = new THREE.Mesh(this.track(new THREE.PlaneGeometry(1.6, SPAN * 2).rotateX(-Math.PI / 2)), this.shoulderMat);
      s.position.set(x * 4.6, 0.005, SPAN / 2);
      scene.add(s);
    }

    // Collines au loin (immobiles), avec de la neige au sommet en montagne.
    this.hillMat = this.track(new THREE.MeshStandardMaterial({ color: 0x6c8f55, roughness: 1, flatShading: true }));
    this.capMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf4f7fa, roughness: 0.9, flatShading: true }));
    const hillGeo = this.track(new THREE.ConeGeometry(1, 1, 7, 1));
    const capGeo = this.track(new THREE.ConeGeometry(0.36, 0.36, 7, 1));
    this.caps = [];
    for (let i = 0; i < 26; i++) {
      const a = (i / 26) * Math.PI * 2 + Math.random() * 0.2;
      const r = 380 + Math.random() * 200;
      const hgt = 30 + Math.random() * 70;
      const hill = new THREE.Mesh(hillGeo, this.hillMat);
      hill.scale.set(90 + Math.random() * 90, hgt, 90 + Math.random() * 90);
      hill.position.set(Math.cos(a) * r, hgt / 2 - 2, Math.sin(a) * r);
      scene.add(hill);
      const cap = new THREE.Mesh(capGeo, this.capMat);
      cap.scale.copy(hill.scale);
      cap.position.copy(hill.position).add(new THREE.Vector3(0, hgt * 0.32, 0));
      scene.add(cap);
      this.caps.push(cap);
    }

    // Arbres (feuillus et sapins), buissons, poteaux de bord de route : ils défilent et reviennent devant.
    const N = high ? 90 : 56;
    this.trunkMat = this.track(new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }));
    this.leafMat = this.track(new THREE.MeshStandardMaterial({ color: 0x3f6f2e, roughness: 0.95, flatShading: true }));
    this.leafMat2 = this.track(new THREE.MeshStandardMaterial({ color: 0x587f32, roughness: 0.95, flatShading: true }));
    this.trunks = new THREE.InstancedMesh(this.track(new THREE.CylinderGeometry(0.16, 0.24, 1, 6)), this.trunkMat, N);
    this.crowns = new THREE.InstancedMesh(this.track(new THREE.IcosahedronGeometry(1, 0)), this.leafMat, N);
    this.firs = new THREE.InstancedMesh(this.track(new THREE.ConeGeometry(1, 1, 7)), this.leafMat2, N);
    this.bushes = new THREE.InstancedMesh(this.track(new THREE.IcosahedronGeometry(1, 0)), this.leafMat2, N);
    this.postMat = this.track(new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.6 }));
    this.posts = new THREE.InstancedMesh(this.track(new THREE.BoxGeometry(0.12, 1, 0.12)), this.postMat, 48);
    for (const m of [this.trunks, this.crowns, this.firs, this.bushes, this.posts]) {
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.frustumCulled = false;
      scene.add(m);
    }
    this.items = [];
    for (let i = 0; i < N; i++) this.items.push(this.newTree(Math.random() * SPAN - BEHIND));
    this.bushItems = [];
    for (let i = 0; i < N; i++) this.bushItems.push({ z: Math.random() * SPAN - BEHIND, x: this.side() * (6.5 + Math.random() * 30), s: 0.5 + Math.random() * 0.9 });
    this.postItems = [];
    for (let i = 0; i < 48; i++) this.postItems.push({ z: -BEHIND + (i % 24) * (SPAN / 24), x: (i < 24 ? 1 : -1) * 5.3 });

    // Aire de repos (pauses) et écurie d'étape (le soir), cachées pendant qu'on roule.
    this.restArea = this.buildRestArea();
    scene.add(this.restArea);
  }

  side() {
    return Math.random() < 0.5 ? -1 : 1;
  }

  newTree(z) {
    const biome = this.biome ?? this.biomeA;
    const show = Math.random() < Math.min(1, biome.trees);
    return {
      z,
      x: this.side() * (7 + Math.random() * 45),
      h: 4 + Math.random() * 5,
      w: 1.6 + Math.random() * 1.6,
      fir: Math.random() < biome.conifer,
      show,
    };
  }

  buildRestArea() {
    const g = new THREE.Group();
    const m = (c) => this.track(new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
    // (les x sont donnés pour le côté +x, puis passés du côté droit de la route : SIDE)
    const add = (geo, mat, x, y, z) => {
      const o = new THREE.Mesh(this.track(geo), mat);
      o.position.set(x * SIDE, y, z);
      g.add(o);
      return o;
    };
    // Parking (bitume), panneau P bleu, table de pique-nique, poubelle, abreuvoir, arbre.
    add(new THREE.PlaneGeometry(9, 26).rotateX(-Math.PI / 2), m(0x5a5d61), 9.5, 0.01, 0);
    add(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), m(0x9aa0a6), 5.6, 1.3, -10);
    const sign = add(new THREE.BoxGeometry(0.06, 0.9, 0.9), m(0x1f5fbf), 5.6, 2.8, -10);
    sign.material.emissive = new THREE.Color(0x0a2050);
    // La lettre P, tournée vers la route (dans le bon sens vue de la voie de droite).
    const pz = (dz) => -10 + dz * SIDE;
    add(new THREE.BoxGeometry(0.07, 0.5, 0.12), m(0xffffff), 5.56, 2.85, pz(-0.12));
    add(new THREE.BoxGeometry(0.07, 0.12, 0.3), m(0xffffff), 5.56, 3.05, pz(0.02));
    add(new THREE.BoxGeometry(0.07, 0.12, 0.3), m(0xffffff), 5.56, 2.85, pz(0.02));
    add(new THREE.BoxGeometry(0.07, 0.3, 0.1), m(0xffffff), 5.56, 2.95, pz(0.14));
    add(new THREE.BoxGeometry(1.8, 0.06, 0.8), m(0x8a5a32), 15, 0.75, 4);
    for (const z of [-0.6, 0.6]) add(new THREE.BoxGeometry(1.8, 0.05, 0.3), m(0x8a5a32), 15, 0.45, 4 + z);
    add(new THREE.CylinderGeometry(0.25, 0.22, 0.8, 10), m(0x2f7a4a), 14, 0.4, 8);
    add(new THREE.BoxGeometry(1.6, 0.5, 0.6), m(0x8a9096), 13, 0.25, -4);
    add(new THREE.CylinderGeometry(0.2, 0.3, 3, 6), m(0x6b4a2f), 17, 1.5, 0);
    add(new THREE.IcosahedronGeometry(2.2, 0), m(0x3f6f2e), 17, 4, 0);
    // Écurie d'étape (le soir).
    const stable = new THREE.Group();
    const wall = m(0xc9a77a);
    const roof = m(0x8a3a2a);
    const body = new THREE.Mesh(this.track(new THREE.BoxGeometry(8, 3, 5)), wall);
    body.position.set(16 * SIDE, 1.5, 0);
    const top = new THREE.Mesh(this.track(new THREE.ConeGeometry(5.6, 2, 4, 1).rotateY(Math.PI / 4)), roof);
    top.scale.set(1.05, 1, 0.68);
    top.position.set(16 * SIDE, 4, 0);
    const light = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.1, 0.4, 0.3)), this.track(new THREE.MeshStandardMaterial({ color: 0xffe2a0, emissive: 0xffc860, emissiveIntensity: 1.5 })));
    light.position.set(11.95 * SIDE, 2.4, 0);
    stable.add(body, top, light);
    for (const z of [-1.4, 1.4]) {
      const door = new THREE.Mesh(this.track(new THREE.BoxGeometry(0.08, 2, 1.2)), m(0x5a3a22));
      door.position.set(11.97 * SIDE, 1, z);
      stable.add(door);
    }
    g.add(stable);
    g.userData.stable = stable;
    g.visible = false;
    return g;
  }

  /** Le paysage passe de celui du départ à celui de l'arrivée vers le milieu du trajet. */
  applyBiome(f) {
    const b = f < 0.5 ? this.biomeA : this.biomeB;
    const snow = this.snowy && f < 0.5;
    if (b === this.biome && snow === this.lastSnow) return;
    this.biome = b;
    this.lastSnow = snow;
    const pal = snow ? { ...b, ...SNOW } : b;
    this.groundMat.color.setHex(pal.ground);
    this.shoulderMat.color.setHex(pal.ground2);
    this.leafMat.color.setHex(pal.tree);
    this.leafMat2.color.setHex(pal.tree2);
    this.hillMat.color.setHex(pal.hill);
    for (const c of this.caps) c.visible = !!b.snowCaps || snow;
    for (const it of this.items) {
      it.show = Math.random() < Math.min(1, b.trees);
      it.fir = Math.random() < b.conifer;
    }
  }

  /** Une image : la route défile selon la vitesse du trajet (0 pendant une pause). */
  update(dt, ctrl, speedMul, flow) {
    this.time += dt;
    const trip = this.trip;
    const stop = currentStop(trip);
    const want = speedMul > 0 ? BASE_SPEED * (1 + (speedMul - 1) * 0.35) : 0;
    this.speed += (want - this.speed) * Math.min(1, dt * (want > this.speed ? 0.6 : 1.2));
    if (this.speed < 0.05 && want === 0) this.speed = 0;
    const step = this.speed * dt;
    this.offset += step;
    this.roadTex.offset.y = -(this.offset / 12) % 1;
    this.groundMat.map.offset.y = -(this.offset / (1400 / 60)) % 1;
    this.applyBiome(progress(trip));

    // Les objets du bord de la route.
    const d = this.dummy;
    let ti = 0;
    let ci = 0;
    let fi = 0;
    for (const it of this.items) {
      it.z -= step;
      if (it.z < -BEHIND) Object.assign(it, this.newTree(it.z + SPAN));
      if (!it.show) continue;
      d.position.set(it.x, it.h * 0.25, it.z);
      d.rotation.set(0, 0, 0);
      d.scale.set(1, it.h * 0.5, 1);
      d.updateMatrix();
      this.trunks.setMatrixAt(ti++, d.matrix);
      if (it.fir) {
        d.position.set(it.x, it.h * 0.62, it.z);
        d.scale.set(it.w, it.h * 0.85, it.w);
        d.updateMatrix();
        this.firs.setMatrixAt(fi++, d.matrix);
      } else {
        d.position.set(it.x, it.h * 0.68, it.z);
        d.scale.set(it.w * 1.2, it.w * 1.05, it.w * 1.2);
        d.updateMatrix();
        this.crowns.setMatrixAt(ci++, d.matrix);
      }
    }
    this.trunks.count = ti;
    this.crowns.count = ci;
    this.firs.count = fi;
    let bi = 0;
    for (const b of this.bushItems) {
      b.z -= step;
      if (b.z < -BEHIND) {
        b.z += SPAN;
        b.x = this.side() * (6.5 + Math.random() * 30);
      }
      d.position.set(b.x, b.s * 0.45, b.z);
      d.scale.set(b.s * 1.3, b.s * 0.8, b.s * 1.1);
      d.updateMatrix();
      this.bushes.setMatrixAt(bi++, d.matrix);
    }
    this.bushes.count = bi;
    let pi = 0;
    for (const p of this.postItems) {
      p.z -= step;
      if (p.z < -BEHIND) p.z += SPAN;
      d.position.set(p.x, 0.5, p.z);
      d.scale.set(1, 1, 1);
      d.updateMatrix();
      this.posts.setMatrixAt(pi++, d.matrix);
    }
    for (const m of [this.trunks, this.crowns, this.firs, this.bushes, this.posts]) m.instanceMatrix.needsUpdate = true;

    // Pause : l'aire de repos (ou l'écurie d'étape le soir) arrive à côté du véhicule.
    const atStop = !!stop && stop.kind !== 'landing' && stop.kind !== 'boarding';
    if (atStop && !this.restArea.visible) {
      // Elle apparaît juste là où le véhicule finira de freiner.
      this.restArea.visible = true;
      this.restArea.position.z = this.speed / 1.2;
      this.restArea.userData.stable.visible = stop.kind === 'night';
    }
    if (this.restArea.visible) {
      this.restArea.position.z -= step;
      if (atStop) this.restArea.position.z = Math.max(this.restArea.position.z, -2);
      else if (this.restArea.position.z < -60) this.restArea.visible = false;
    }

    // Le véhicule : roues, petit roulis, volant ; les animaux à bord bougent.
    const v = this.vehicle;
    v.spinWheels(step);
    v.update(dt);
    const sway = this.speed > 1 ? Math.sin(this.time * 1.7) * 0.004 + Math.sin(this.time * 4.3) * 0.0015 : 0;
    v.main.group.rotation.z = sway;
    if (v.trailer) v.trailer.group.rotation.z = -sway * 1.5;
    if (v.main.steering) v.main.steering.rotation.z = Math.sin(this.time * 0.5) * 0.05 * Math.min(1, this.speed / 10);

    this.updateSky();
    this.updateCamera(dt, ctrl);
  }

  /** Ciel et lumière selon l'heure du trajet. */
  updateSky() {
    const g = this.game;
    const hour = hourOf(g.profile.clock + this.trip.elapsed * 60);
    const day = THREE.MathUtils.clamp(Math.sin(((hour - 6) / 12) * Math.PI) * 1.6, 0, 1);
    const dusk = Math.max(0, 1 - Math.abs(hour - 19.5) / 1.6) + Math.max(0, 1 - Math.abs(hour - 6.5) / 1.4);
    const sky = this.v1.set(0.66, 0.81, 0.91).multiplyScalar(day).add(this.v2.set(0.05, 0.07, 0.14).multiplyScalar(1 - day));
    sky.lerp(this.v2.set(0.95, 0.6, 0.42), Math.min(0.5, dusk * 0.5));
    this.scene.background.setRGB(sky.x, sky.y, sky.z);
    this.scene.fog.color.setRGB(sky.x * 1.05, sky.y * 1.05, sky.z * 1.05);
    this.sun.intensity = 0.3 + 2.4 * day;
    this.hemi.intensity = 0.35 + 1.1 * day;
    this.scene.environmentIntensity = 0.15 + 0.5 * day;
    const a = ((hour - 6) / 12) * Math.PI;
    this.sun.position.set(Math.cos(a) * 80, Math.max(8, Math.sin(a) * 90), 40);
  }

  /** Caméra : au volant (on tourne la tête en faisant glisser), dehors (elle tourne autour), dans le van. */
  updateCamera(dt, ctrl) {
    const v = this.vehicle;
    const cam = this.camera;
    if (cam.aspect !== window.innerWidth / window.innerHeight) {
      cam.aspect = window.innerWidth / window.innerHeight;
      cam.updateProjectionMatrix();
    }
    const dx = ctrl?.look?.dx ?? 0;
    const dy = ctrl?.look?.dy ?? 0;
    v.root.updateWorldMatrix(true, true);
    if (this.cameraMode === 'cab') {
      this.yaw = THREE.MathUtils.clamp(this.yaw - dx * 0.006, -1.9, 1.9);
      this.pitch = THREE.MathUtils.clamp(this.pitch - dy * 0.004, -0.6, 0.45);
      const m = v.main.group.matrixWorld;
      cam.position.copy(v.cabEye(this.v2, cam.aspect < 1)).applyMatrix4(m);
      cam.position.y += Math.sin(this.time * 9) * 0.004 * Math.min(1, this.speed / 10);
      const dir = this.v1.set(Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch) - 0.04, Math.cos(this.yaw) * Math.cos(this.pitch));
      this.lookAt.copy(cam.position).add(dir);
      cam.fov = cam.aspect < 1 ? CAB_PORTRAIT.fov : 66;
    } else if (this.cameraMode === 'trailer' && v.trailer) {
      // Le van en coupe (le flanc gauche est caché) : on voit les animaux voyager, le paysage défile derrière.
      const pose = v.view('stall');
      if (cam.aspect < 1) pose.pos.sub(pose.look).multiplyScalar(1.5).add(pose.look);
      cam.position.copy(pose.pos);
      this.lookAt.copy(pose.look);
      cam.fov = 55;
    } else {
      // Dehors : la caméra tourne doucement autour du véhicule (on peut la faire tourner avec le doigt).
      // En portrait, l'image est étroite : on recule pour voir tout l'attelage.
      this.orbit += dt * 0.08 - dx * 0.006;
      const center = this.v2.set(v.root.position.x, 1.4, v.trailer ? -2.6 : 0);
      const far = cam.aspect < 1 ? 1.55 : 1;
      const r = (v.trailer ? 13 : 9) * far;
      cam.position.set(center.x + Math.sin(this.orbit) * r, 3.4 + (far - 1) * 3, center.z + Math.cos(this.orbit) * r);
      this.lookAt.copy(center);
      cam.fov = 55;
    }
    // La fiche du trajet cache une partie de l'écran : à droite sur un écran large, en bas sur un téléphone.
    // On décale l'image pour que la route et le véhicule restent visibles à côté.
    this.sheetAcc = (this.sheetAcc ?? 1) + dt;
    if (this.sheetAcc > 0.5) {
      this.sheetAcc = 0;
      const sheet = this.game.ui.tripEl?.firstChild;
      this.sheetH = sheet ? sheet.getBoundingClientRect().height : 0;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    const wide = W >= 900 && cam.aspect > 1.25;
    const ox = wide ? W * 0.2 : 0;
    const oy = wide ? 0 : Math.round(H * Math.min(0.24, (this.sheetH ?? 0) / H / 2));
    const key = `${ox}|${oy}|${W}x${H}|${cam.fov}`;
    if (key !== this.offsetKey) {
      this.offsetKey = key;
      if (ox || oy) cam.setViewOffset(W, H, ox, oy, W, H);
      else cam.clearViewOffset();
    }
    cam.updateProjectionMatrix();
    cam.lookAt(this.lookAt);
  }

  setCameraMode(mode) {
    this.cameraMode = mode;
    this.vehicle.setCutaway(mode === 'trailer');
    this.resetLook();
  }

  /** Regard de départ au volant : un peu vers le bas (en portrait : presque droit devant, vers le rétroviseur). */
  resetLook() {
    const look = this.vehicle.cabLook(portrait(), -0.15);
    this.yaw = look.yaw;
    this.pitch = look.pitch;
  }

  render() {
    this.game.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.vehicle.root.removeFromParent();
    for (const o of this.disposables) o.dispose?.();
    this.disposables = [];
    for (const m of [this.trunks, this.crowns, this.firs, this.bushes, this.posts]) m.dispose();
  }
}

// Petites images 3D pour les fiches de la sellerie : l'objet seul (selle, filet, couverture…)
// ou un de nos animaux qui l'essaie. On réutilise le moteur de rendu du jeu (pas de deuxième
// contexte WebGL) : on dessine dans un coin de l'écran, on recopie dans une image, puis on
// redessine aussitôt la scène (comme pour les photos de balade).

import * as THREE from 'three';
import { tackModel, tackMount } from './models/tackModels.js';

const VIEW = {
  rack: [1.05, 0.72, 0.95], // selle : de trois quarts, un peu au-dessus
  hook: [0.32, 0.05, 1], // filet, licol : de face
  bar: [0.85, 0.3, 1],
  shelf: [0.7, 0.75, 1],
  animal: [1, 0.32, 0.62], // l'animal de trois quarts, côté gauche
};

const box = new THREE.Box3();
const sphere = new THREE.Sphere();

export class TackThumbs {
  constructor(game) {
    this.game = game;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(28, 4 / 3, 0.01, 60);
    this.scene.add(new THREE.HemisphereLight(0xfff6e8, 0x6a5a48, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 1.7);
    key.position.set(2, 3.5, 2.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xcfe0ff, 0.9);
    rim.position.set(-2.5, 1.5, -2);
    this.scene.add(rim);
    this.cache = new Map();
    this.batch = 0;
    this.dirty = false;
  }

  /** Plusieurs images d'affilée (une liste) : la scène du jeu n'est redessinée qu'une fois, à la fin. */
  begin() {
    this.batch += 1;
  }

  end() {
    this.batch = Math.max(0, this.batch - 1);
    if (!this.batch && this.dirty) {
      this.dirty = false;
      const g = this.game;
      if (g.scene && g.camera) g.renderer?.render(g.scene, g.camera);
    }
  }

  /** Photo d'un objet du catalogue (gardée en mémoire par objet et couleur). */
  item(id, color, size = [240, 180]) {
    const key = `${id}|${color}|${size.join('x')}`;
    if (this.cache.has(key)) return this.cache.get(key);
    const obj = tackModel(id, color);
    const url = this.shot(obj, VIEW[tackMount(id)], size, 0xf4ecdc);
    // Les géométries et matériaux sont partagés (cache des modèles) : on retire juste le groupe.
    if (url) this.cache.set(key, url);
    return url;
  }

  /**
   * Un animal présent qui essaie un objet : on met l'équipement d'essai sur son modèle,
   * on le photographie à part, puis on lui rend son vrai équipement.
   */
  onAnimal(entity, gear, size = [320, 220]) {
    const root = entity.root;
    const parent = root.parent;
    const pos = root.position.clone();
    const rotY = root.rotation.y;
    const labels = [entity.label, entity.status].map((s) => s && [s, s.visible]);
    let url = null;
    try {
      entity.applyGear(gear);
      for (const l of labels) if (l) l[0].visible = false;
      root.position.set(0, 0, 0);
      root.rotation.y = 0;
      url = this.shot(root, VIEW.animal, size, 0xdfe9ef, 0.92);
    } finally {
      root.position.copy(pos);
      root.rotation.y = rotY;
      for (const l of labels) if (l) l[0].visible = l[1];
      if (parent) parent.add(root);
      entity.applyGear();
    }
    return url;
  }

  /** Cadre l'objet, le dessine dans un coin de l'écran et renvoie une image (data URL). */
  shot(obj, dir, [w, h], bg, fill = 1) {
    const g = this.game;
    const r = g.renderer;
    if (!r) return null;
    const prevParent = obj.parent;
    this.scene.add(obj);
    this.scene.environment = g.scene?.environment ?? null;
    this.scene.environmentIntensity = 0.7;
    this.scene.background = new THREE.Color(bg);
    obj.updateMatrixWorld(true);
    box.setFromObject(obj);
    box.getBoundingSphere(sphere);
    const cam = this.camera;
    cam.aspect = w / h;
    const fov = THREE.MathUtils.degToRad(cam.fov);
    const fit = Math.max(sphere.radius / Math.sin(fov / 2), sphere.radius / Math.sin(Math.atan(Math.tan(fov / 2) * cam.aspect)));
    const d = new THREE.Vector3(...dir).normalize();
    cam.position.copy(sphere.center).addScaledVector(d, fit * 0.98 / fill);
    cam.near = Math.max(0.01, fit * 0.1);
    cam.far = fit * 4;
    cam.updateProjectionMatrix();
    cam.lookAt(sphere.center);

    const pr = r.getPixelRatio();
    const size = r.getSize(new THREE.Vector2());
    const cw = Math.max(1, Math.round(w / pr));
    const ch = Math.max(1, Math.round(h / pr));
    let url = null;
    try {
      r.setScissorTest(true);
      r.setViewport(0, 0, cw, ch);
      r.setScissor(0, 0, cw, ch);
      r.render(this.scene, cam);
      const src = r.domElement;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      c.getContext('2d').drawImage(src, 0, src.height - ch * pr, cw * pr, ch * pr, 0, 0, w, h);
      url = c.toDataURL('image/jpeg', 0.86);
    } catch {
      url = null;
    } finally {
      r.setScissorTest(false);
      r.setViewport(0, 0, size.x, size.y);
      this.scene.remove(obj);
      if (prevParent) prevParent.add(obj);
      // On redessine tout de suite la scène du jeu : pas d'image d'essai qui clignote dans un coin.
      if (this.batch) this.dirty = true;
      else if (g.scene && g.camera) r.render(g.scene, g.camera);
    }
    return url;
  }
}

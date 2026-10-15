// Mode construction (dans la vue d'ensemble) : une construction « fantôme » suit le doigt ou la souris,
// alignée sur une grille de 1 m. Vert = on peut construire ici, rouge = impossible (et on dit pourquoi).
// On peut la tourner, puis confirmer ou annuler. Sert aussi à déplacer une construction existante.

import * as THREE from 'three';
import { t } from '../i18n.js';
import { STRUCTURES, footprint, snap, frontDir } from '../sim/construction.js';
import { buildStructureModel } from './models/structures.js';
import { structureName } from '../ui/construction.js';

const GOOD = 0x3fae62;
const BAD = 0xe0574a;

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh || o.isLine) {
      o.geometry.dispose();
      o.material.map?.dispose?.();
      o.material.dispose();
    }
  });
}

export class BuildMode {
  constructor(game, view) {
    this.game = game;
    this.view = view;
    this.active = false;
    this.ghost = null;
    this.dragging = false;
    this.pinned = false;
    this.valid = { ok: false };
    this.x = 0;
    this.z = 0;
    this.rot = 0;

    const canvas = game.renderer.domElement;
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    const up = () => {
      if (this.dragging) this.pinned = true;
      this.dragging = false;
      this.view.lockPan = false;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    window.addEventListener('keydown', (e) => {
      if (!this.active || ['INPUT', 'TEXTAREA'].includes(e.target?.tagName)) return;
      if (e.code === 'KeyR') this.rotate();
      if (e.code === 'Enter') this.confirm();
      if (e.code === 'Escape') this.cancel();
    });
  }

  get ui() {
    return this.game.ui;
  }

  /** Commence à placer un nouveau type, ou à déplacer la structure movingId. */
  start(type, movingId = null) {
    if (this.active) this.cancel();
    const s = movingId ? this.game.structures.get(movingId) : null;
    this.active = true;
    this.type = type;
    this.moving = s;
    this.rot = s ? s.rot : 0;
    this.pinned = !!s || matchMedia('(pointer: coarse)').matches;
    this.dragging = false;
    const at = s ?? this.view.focus;
    this.x = null;
    if (s) {
      const g = this.game.structures.group(s.id);
      if (g) g.visible = false;
    }
    this.makeGhost();
    this.setPos(at.x, at.z, true);
    this.view.refreshBar();
  }

  makeGhost() {
    if (this.ghost) {
      this.ghost.parent?.remove(this.ghost);
      disposeGroup(this.ghost);
    }
    const def = STRUCTURES[this.type];
    const g = new THREE.Group();
    const model = buildStructureModel(this.type, def.cat === 'decor' ? '' : structureName(this.type));
    model.traverse((o) => {
      if (!o.isMesh && !o.isInstancedMesh) return;
      const old = o.material;
      o.material = old.clone();
      old.dispose();
      o.material.transparent = true;
      o.material.opacity = 0.6;
      o.material.depthWrite = false;
      o.castShadow = false;
    });
    model.rotation.y = (this.rot * Math.PI) / 2;
    g.add(model);
    // Plaque colorée au sol (toujours visible) et flèche vers l'entrée.
    const f = footprint(this.type, 0, 0, this.rot);
    this.plateMat = new THREE.MeshBasicMaterial({ color: GOOD, transparent: true, opacity: 0.35, depthTest: false, depthWrite: false });
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(f.hw * 2, f.hd * 2).rotateX(-Math.PI / 2), this.plateMat);
    plate.position.y = 0.15;
    plate.renderOrder = 20;
    g.add(plate);
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(f.hw * 2, f.hd * 2).rotateX(-Math.PI / 2)),
      new THREE.LineBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true }),
    );
    edge.position.y = 0.16;
    edge.renderOrder = 21;
    g.add(edge);
    this.edgeMat = edge.material;
    if (def.cat !== 'decor') {
      const dir = frontDir(this.rot);
      const ext = dir.x !== 0 ? f.hw : f.hd;
      const shape = new THREE.Shape();
      shape.moveTo(-0.7, 0);
      shape.lineTo(0.7, 0);
      shape.lineTo(0, 1.1);
      shape.closePath();
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).rotateY(Math.PI), this.plateMat.clone());
      arrow.material.opacity = 0.9;
      arrow.rotation.y = (this.rot * Math.PI) / 2;
      arrow.position.set(dir.x * (ext + 0.4), 0.17, dir.z * (ext + 0.4));
      arrow.renderOrder = 22;
      g.add(arrow);
      this.arrowMat = arrow.material;
    } else {
      this.arrowMat = null;
    }
    this.ghost = g;
    this.game.scene.add(g);
    if (this.x !== null) this.setPos(this.x, this.z, true);
  }

  setPos(x, z, force = false) {
    const sx = snap(x);
    const sz = snap(z);
    if (!force && sx === this.x && sz === this.z) return;
    this.x = sx;
    this.z = sz;
    const w = this.game.world;
    this.ghost.position.set(sx, w.heightAt(sx, sz), sz);
    this.check();
  }

  check() {
    const st = this.game.structures;
    this.valid = st.validate(this.type, this.x, this.z, this.rot, this.moving?.id ?? null);
    if (this.valid.ok && !this.moving) {
      const c = st.canBuild(this.type);
      if (!c.ok) this.valid = { ok: false, reason: c.reason, level: c.level };
    }
    const color = this.valid.ok ? GOOD : BAD;
    this.plateMat.color.setHex(color);
    this.arrowMat?.color.setHex(color);
    this.view.refreshBar();
  }

  rotate() {
    if (!this.active) return;
    this.rot = (this.rot + 1) % 4;
    this.makeGhost();
  }

  /** Le pointeur est-il sur la construction fantôme ? */
  overGhost(p) {
    const f = footprint(this.type, this.x, this.z, this.rot);
    const m = Math.max(1, Math.min(f.hw, f.hd) * 0.2);
    return Math.abs(p.x - f.x) < f.hw + m && Math.abs(p.z - f.z) < f.hd + m;
  }

  onDown(e) {
    if (!this.active || !this.view.active) return;
    const p = this.view.groundAt(e.clientX, e.clientY);
    if (!p) return;
    if (this.overGhost(p) || !this.pinned) {
      this.dragging = true;
      this.offset = { x: this.x - p.x, z: this.z - p.z };
      if (!this.pinned) this.offset = { x: 0, z: 0 };
      this.view.lockPan = true;
    }
  }

  onMove(e) {
    if (!this.active || !this.view.active) return;
    const hover = e.pointerType === 'mouse' && e.buttons === 0 && !this.pinned;
    if (!this.dragging && !hover) return;
    const p = this.view.groundAt(e.clientX, e.clientY);
    if (!p) return;
    const off = this.dragging ? this.offset : { x: 0, z: 0 };
    this.setPos(p.x + off.x, p.z + off.z);
  }

  /** Toucher le sol : la construction vient ici. */
  onTap(sx, sy) {
    const p = this.view.groundAt(sx, sy);
    if (!p) return;
    if (!this.overGhost(p)) this.setPos(p.x, p.z);
    this.pinned = true;
  }

  update() {
    if (!this.active || !this.ghost) return;
    const k = 0.3 + Math.sin(performance.now() / 220) * 0.08;
    this.plateMat.opacity = k;
  }

  reasonText() {
    const v = this.valid;
    if (v.ok) return '';
    return t(`con_bad_${v.reason}`, { n: v.level });
  }

  confirm() {
    if (!this.active) return;
    const st = this.game.structures;
    const name = structureName(this.type);
    const g = STRUCTURES[this.type].g;
    if (!this.valid.ok) {
      this.ui.toast(this.reasonText());
      return;
    }
    if (this.moving) {
      const r = st.move(this.moving.id, this.x, this.z, this.rot);
      if (!r.ok) return this.ui.toast(t(`con_bad_${r.reason}`));
      this.ui.toast(t('con_moved', { name, g }));
      this.end();
      return;
    }
    const r = st.build(this.type, this.x, this.z, this.rot);
    if (!r.ok) return this.ui.toast(t(`con_bad_${r.reason}`, { n: r.level }));
    this.ui.toast(t('con_built', { name, g }), 4000);
    if (STRUCTURES[this.type].capacity) setTimeout(() => this.ui.toast(t('con_builtHelp'), 6000), 600);
    this.end();
    this.ui.refresh();
  }

  cancel() {
    if (!this.active) return;
    if (this.moving) {
      const grp = this.game.structures.group(this.moving.id);
      if (grp) grp.visible = true;
    }
    this.end();
  }

  end() {
    this.active = false;
    this.moving = null;
    this.dragging = false;
    this.view.lockPan = false;
    if (this.ghost) {
      this.ghost.parent?.remove(this.ghost);
      disposeGroup(this.ghost);
      this.ghost = null;
    }
    this.view.refreshBar();
  }
}

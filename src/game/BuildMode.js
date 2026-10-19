// Mode construction (dans la vue d'ensemble) : un objet « fantôme » suit le doigt ou la souris,
// aligné sur une grille de 1 m. Vert = on peut le poser ici, rouge = impossible (et on dit pourquoi).
// On peut le tourner, puis confirmer ou annuler.
// Sert à construire, à déplacer une construction, une installation de base (bergerie, paddock,
// niche, clapier) ou un équipement (mangeoire, abreuvoir…), et à poser un équipement neuf.

import * as THREE from 'three';
import { t } from '../i18n.js';
import { STRUCTURES, CORE_ITEMS, snap, frontDir, corePos, coreSize, sizeOf, equipmentPos, moveFeeFor, EQUIP_SIZE } from '../sim/construction.js';
import { EQUIPMENT } from '../sim/farm.js';
import { isSandbox } from '../sim/profile.js';
import { buildStructureModel } from './models/structures.js';
import { EQUIPMENT_MODELS, kennel as kennelModel, hutch as hutchModel, sheepfold } from './models/equipment.js';
import { paddock as paddockModel } from './models/buildings.js';
import { structureName } from '../ui/construction.js';

const GOOD = 0x3fae62;
const BAD = 0xe0574a;
const SIDE_ROT = { '+z': 0, '+x': 1, '-z': 2, '-x': 3 };

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh || o.isLine) {
      o.geometry.dispose();
      o.material.map?.dispose?.();
      o.material.dispose();
    }
  });
}

/** Modèle d'une installation de base, pour le fantôme (size : sa taille actuelle, w le long de x). */
function coreModel(id, size) {
  if (id === 'kennel') return kennelModel();
  if (id === 'hutch') return hutchModel();
  if (id === 'pen') return sheepfold();
  const g = paddockModel(size.d, size.w);
  g.rotation.y = Math.PI / 2;
  const wrap = new THREE.Group();
  wrap.add(g);
  return wrap;
}

export class BuildMode {
  constructor(game, view) {
    this.game = game;
    this.view = view;
    this.active = false;
    this.spec = null;
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
      // (fenêtre ouverte : Entrée et Échap sont pour ses boutons)
      if (!this.active || ['INPUT', 'TEXTAREA'].includes(e.target?.tagName) || this.ui.modalOpen) return;
      if (e.code === 'KeyR') this.rotate();
      if (e.code === 'Enter') this.confirm();
      if (e.code === 'Escape') this.cancel();
    });
  }

  get ui() {
    return this.game.ui;
  }

  get st() {
    return this.game.structures;
  }

  // ---------------------------------------------------------------- ce qu'on place

  /** Nouvelle construction du catalogue. */
  start(type, movingId = null) {
    if (movingId) return this.begin(this.specMoveStructure(this.st.get(movingId)));
    const def = STRUCTURES[type];
    const st = this.st;
    return this.begin({
      emoji: def.emoji,
      name: structureName(type),
      cost: def.price,
      w: def.w,
      d: def.d,
      rotatable: true,
      arrow: def.cat !== 'decor',
      model: () => buildStructureModel(type, def.cat === 'decor' ? '' : structureName(type)),
      validate: (x, z, rot) => {
        const v = st.validate(type, x, z, rot);
        if (!v.ok) return v;
        const c = st.canBuild(type);
        return c.ok ? v : { ok: false, reason: c.reason, level: c.level };
      },
      confirm: (x, z, rot) => {
        const r = st.build(type, x, z, rot);
        if (!r.ok) return r;
        this.ui.toast(t('con_built', { name: structureName(type), g: def.g }), 4000);
        if (def.capacity) setTimeout(() => this.ui.toast(t('con_builtHelp'), 6000), 600);
        return r;
      },
    });
  }

  specMoveStructure(s) {
    const def = STRUCTURES[s.type];
    const st = this.st;
    const grp = st.group(s.id);
    const size = sizeOf(s); // (un enclos agrandi garde sa taille)
    return {
      emoji: def.emoji,
      name: structureName(s.type),
      cost: moveFeeFor('structure', s.type),
      moving: true,
      w: size.w,
      d: size.d,
      rotatable: true,
      arrow: def.cat !== 'decor',
      at: { x: s.x, z: s.z, rot: s.rot },
      model: () => buildStructureModel(s.type, def.cat === 'decor' ? '' : structureName(s.type), undefined, size),
      validate: (x, z, rot) => st.validate(s.type, x, z, rot, s.id),
      confirm: (x, z, rot) => {
        const r = st.move(s.id, x, z, rot);
        if (r.ok) this.ui.toast(t('con_moved', { name: structureName(s.type), g: def.g }));
        return r;
      },
      hide: () => { if (grp) grp.visible = false; },
      show: () => { if (grp) grp.visible = true; },
    };
  }

  /** Déplacer la bergerie, le paddock, la niche ou le clapier. */
  moveCore(id) {
    const def = CORE_ITEMS[id];
    const st = this.st;
    const p = corePos(st.layout, id);
    const size = coreSize(st.layout, id);
    const name = t(`bld_${id}`);
    return this.begin({
      emoji: def.emoji,
      name,
      cost: moveFeeFor('core'),
      moving: true,
      w: size.w,
      d: size.d,
      rot: SIDE_ROT[def.gate.side],
      rotatable: false,
      arrow: true,
      at: { x: p.x, z: p.z, rot: 0 },
      model: () => coreModel(id, size),
      validate: (x, z) => st.validateCore(id, x, z),
      confirm: (x, z) => {
        const r = st.moveCore(id, x, z);
        if (r.ok) this.ui.toast(t('mgmt_coreMoved', { name }));
        return r;
      },
    });
  }

  /** Déplacer un équipement acheté. */
  moveEquipment(entry) {
    const type = entry.eq.type;
    const st = this.st;
    const p = equipmentPos(st.layout, entry.eq);
    return this.begin({
      emoji: EQUIPMENT[type].emoji,
      name: t(`eq_${type}`),
      cost: moveFeeFor('equipment'),
      moving: true,
      w: EQUIP_SIZE,
      d: EQUIP_SIZE,
      rotatable: false,
      at: { x: p.x, z: p.z, rot: 0 },
      model: () => EQUIPMENT_MODELS[type](),
      validate: (x, z) => st.validateEquipment(x, z, entry),
      confirm: (x, z) => {
        const r = st.moveEquipment(entry, x, z);
        if (r.ok) this.ui.toast(t('mgmt_eqMoved', { name: t(`eq_${type}`) }));
        return r;
      },
      hide: () => { entry.mesh.visible = false; },
      show: () => { entry.mesh.visible = true; },
    });
  }

  /** Poser un équipement neuf (on l'achète en confirmant). */
  newEquipment(type) {
    const def = EQUIPMENT[type];
    const st = this.st;
    return this.begin({
      emoji: def.emoji,
      name: t(`eq_${type}`),
      cost: def.price,
      w: EQUIP_SIZE,
      d: EQUIP_SIZE,
      rotatable: false,
      model: () => EQUIPMENT_MODELS[type](),
      validate: (x, z) => st.validateEquipment(x, z),
      confirm: (x, z) => st.buyEquipmentAt(type, x, z),
    });
  }

  // ---------------------------------------------------------------- fantôme

  begin(spec) {
    if (this.active) this.cancel();
    if (!this.view.active) this.view.enter();
    this.active = true;
    this.spec = spec;
    this.rot = spec.at?.rot ?? 0;
    this.pinned = !!spec.at || matchMedia('(pointer: coarse)').matches;
    this.dragging = false;
    const at = spec.at ?? this.view.focus;
    if (spec.at) this.view.focus.set(spec.at.x, 0, spec.at.z);
    this.x = null;
    spec.hide?.();
    this.makeGhost();
    this.setPos(at.x, at.z, true);
    this.view.refreshBar();
  }

  /** Rectangle au sol pour la rotation actuelle. */
  rect(x = this.x, z = this.z) {
    const sp = this.spec;
    const swap = this.rot % 2 === 1;
    return { x, z, hw: (swap ? sp.d : sp.w) / 2, hd: (swap ? sp.w : sp.d) / 2 };
  }

  makeGhost() {
    if (this.ghost) {
      this.ghost.parent?.remove(this.ghost);
      disposeGroup(this.ghost);
    }
    const sp = this.spec;
    const g = new THREE.Group();
    const model = sp.model();
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
    const f = this.rect(0, 0);
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
    this.arrowMat = null;
    if (sp.arrow) {
      const arot = sp.rot ?? this.rot;
      const dir = frontDir(arot);
      const ext = dir.x !== 0 ? f.hw : f.hd;
      const shape = new THREE.Shape();
      shape.moveTo(-0.7, 0);
      shape.lineTo(0.7, 0);
      shape.lineTo(0, 1.1);
      shape.closePath();
      const arrow = new THREE.Mesh(new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2).rotateY(Math.PI), this.plateMat.clone());
      arrow.material.opacity = 0.9;
      arrow.rotation.y = (arot * Math.PI) / 2;
      arrow.position.set(dir.x * (ext + 0.4), 0.17, dir.z * (ext + 0.4));
      arrow.renderOrder = 22;
      g.add(arrow);
      this.arrowMat = arrow.material;
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
    this.ghost.position.set(sx, this.game.world.heightAt(sx, sz), sz);
    this.check();
  }

  check() {
    this.valid = this.spec.validate(this.x, this.z, this.rot);
    const color = this.valid.ok ? GOOD : BAD;
    this.plateMat.color.setHex(color);
    this.arrowMat?.color.setHex(color);
    this.view.refreshBar();
  }

  rotate() {
    if (!this.active || !this.spec.rotatable) return;
    this.rot = (this.rot + 1) % 4;
    this.makeGhost();
  }

  /** Le pointeur est-il sur l'objet fantôme ? */
  overGhost(p) {
    const f = this.rect();
    const m = Math.max(1, Math.min(f.hw, f.hd) * 0.2);
    return Math.abs(p.x - f.x) < f.hw + m && Math.abs(p.z - f.z) < f.hd + m;
  }

  onDown(e) {
    if (!this.active || !this.view.active) return;
    const p = this.view.groundAt(e.clientX, e.clientY);
    if (!p) return;
    if (this.overGhost(p) || !this.pinned) {
      this.dragging = true;
      this.offset = this.pinned ? { x: this.x - p.x, z: this.z - p.z } : { x: 0, z: 0 };
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

  /** Toucher le sol : l'objet vient ici. */
  onTap(sx, sy) {
    const p = this.view.groundAt(sx, sy);
    if (!p) return;
    if (!this.overGhost(p)) this.setPos(p.x, p.z);
    this.pinned = true;
  }

  update() {
    if (!this.active || !this.ghost) return;
    this.plateMat.opacity = 0.3 + Math.sin(performance.now() / 220) * 0.08;
  }

  reasonText() {
    const v = this.valid;
    if (v.ok) return '';
    return t(`con_bad_${v.reason}`, { n: v.level });
  }

  /** Prix affiché dans la barre (rien en bac à sable). */
  priceText() {
    const c = this.spec.cost;
    if (!c || isSandbox(this.game.profile)) return '';
    return ` · ${c} 🪙`;
  }

  confirm() {
    if (!this.active) return;
    if (!this.valid.ok) {
      this.ui.toast(this.reasonText());
      return;
    }
    const sp = this.spec;
    const r = sp.confirm(this.x, this.z, this.rot);
    if (!r?.ok) {
      if (!r?.silent) this.ui.toast(t(`con_bad_${r?.reason ?? 'unknown'}`, { n: r?.level }));
      return;
    }
    this.end(true);
    this.ui.refresh();
  }

  cancel() {
    if (!this.active) return;
    this.end(false);
  }

  end(done) {
    const sp = this.spec;
    this.active = false;
    this.spec = null;
    this.dragging = false;
    this.view.lockPan = false;
    if (!done || sp?.moving) sp?.show?.();
    if (this.ghost) {
      this.ghost.parent?.remove(this.ghost);
      disposeGroup(this.ghost);
      this.ghost = null;
    }
    this.view.construct?.refresh(); // vue construction : zones occupées et cadre de la sélection à jour
    this.view.refreshBar();
  }
}


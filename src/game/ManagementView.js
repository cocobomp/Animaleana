// Vue d'ensemble de la ferme, vue d'en haut : la caméra monte au-dessus de la ferme,
// on glisse pour se déplacer, on pince (ou molette, ou boutons ±) pour zoomer,
// et on touche un bâtiment, un enclos ou un animal pour lui donner un ordre sans marcher.
// Le joueur ne bouge pas pendant ce temps. La vue construction (🏗️ : grille, poignées pour agrandir)
// est dans ConstructionView.js, la pose d'une construction (fantôme vert/rouge) dans BuildMode.js.

import * as THREE from 'three';
import { h } from '../ui/dom.js';
import { t } from '../i18n.js';
import { SPECIES } from '../sim/species.js';
import { STRUCTURES, RESIZABLE_CORE, footprintOf, capacityOf } from '../sim/construction.js';
import { PEN } from './AnimalEntity.js';
import { BuildMode } from './BuildMode.js';
import { ConstructionView, fmt } from './ConstructionView.js';
import { renderBar, openStructure, openEquipment, structureName } from '../ui/construction.js';
import { enclosure } from './nav.js';
import { EQUIPMENT } from '../sim/farm.js';

const BLD_ICON = { stable: '🐴', pen: '🐑', house: '🏠', lodge: '🛏️', refuge: '🐾', vet: '🩺', jobs: '📋', paddock: '🐎', kennel: '🐶', hutch: '🐰' };
const MIN_H = 16;
const MAX_H = 150;
const smoothstep = (x) => x * x * (3 - 2 * x);

export class ManagementView {
  constructor(game) {
    this.game = game;
    this.active = false;
    this.leaving = false;
    this.focus = new THREE.Vector3();
    this.height = 55;
    this.trans = null;
    this.lockPan = false;
    this.dummy = new THREE.PerspectiveCamera();
    this.raycaster = new THREE.Raycaster();
    this.labelEls = new Map();
    this.labelAcc = 0;
    this.items = [];
    this.glide = null; // { x, z, h } : la caméra y va doucement (choix dans la vue construction)
    this.build = new BuildMode(game, this);
    this.construct = new ConstructionView(game, this);
  }

  get ui() {
    return this.game.ui;
  }

  toggle() {
    if (this.active && !this.leaving) this.exit();
    else if (!this.active) this.enter();
  }

  /** Bouton 🏗️ Construire : la vue construction (depuis le jeu ou depuis la vue d'ensemble). */
  openBuild() {
    if (this.leaving) return;
    if (!this.active) this.enter('build');
    else if (!this.construct.active) {
      if (this.build.active) this.build.cancel();
      this.construct.open('view');
    }
  }

  /** La caméra glisse vers (x, z) à la hauteur h ; glisser ou zoomer soi-même l'arrête. */
  glideTo(x, z, height) {
    this.glide = { x, z, h: THREE.MathUtils.clamp(height, MIN_H, MAX_H) };
  }

  enter(mode = 'overview') {
    const g = this.game;
    if (!g.running || this.active) return;
    g.player.cancelGoTo();
    g.player.speed = 0;
    g.tapRing.visible = false;
    const cam = g.camera;
    this.saved = { pos: cam.position.clone(), quat: cam.quaternion.clone() };
    this.focus.set(g.player.position.x, 0, g.player.position.z + 6);
    this.height = window.innerWidth < 640 ? 70 : 55; // sur téléphone, on voit un peu plus large
    this.trans = { t: 0, dur: 0.9, from: cam.position.clone(), fromQ: cam.quaternion.clone(), out: false };
    this.active = true;
    this.leaving = false;
    document.body.classList.add('mgmt');
    this.ui.closePanel();
    this.layer = h('div', { id: 'mgmt-labels' });
    this.bar = h('div', { id: 'mgmt-bar' });
    this.ui.root.append(this.layer, this.bar);
    this.barKey = '';
    this.glide = null;
    if (mode === 'build') this.construct.open('hud');
    this.refreshBar();
    this.refreshLabels();
    if (mode !== 'build') this.ui.toast(t('mgmt_hint'), 6000);
  }

  exit() {
    if (!this.active || this.leaving) return;
    if (this.build.active) this.build.cancel();
    this.construct.close();
    this.ui.closePanel();
    this.leaving = true;
    this.glide = null;
    this.trans = { t: 0, dur: 0.7, from: this.game.camera.position.clone(), fromQ: this.game.camera.quaternion.clone(), out: true };
  }

  /** Fin de la vue : le joueur reprend la main, la caméra est revenue à sa place. */
  finish() {
    this.construct.close();
    this.active = false;
    this.leaving = false;
    this.trans = null;
    document.body.classList.remove('mgmt');
    this.layer?.remove();
    this.bar?.remove();
    this.labelEls.clear();
    this.ui.renderStatus?.();
  }

  /** Arrêt immédiat (fin de partie, voyage). */
  stop() {
    if (!this.active) return;
    if (this.build.active) this.build.cancel();
    this.construct.close();
    if (this.saved) {
      this.game.camera.position.copy(this.saved.pos);
      this.game.camera.quaternion.copy(this.saved.quat);
    }
    this.finish();
  }

  zoomBy(f) {
    this.glide = null;
    this.height = THREE.MathUtils.clamp(this.height * f, MIN_H, MAX_H);
  }

  recenter() {
    const p = this.game.player.position;
    this.glide = null;
    this.focus.set(p.x, 0, p.z + 6);
  }

  /**
   * Où la caméra veut être pour la vue d'en haut. Vue construction : presque d'aplomb
   * (la grille et les poignées se lisent mieux), sinon un peu de biais.
   */
  desired() {
    const w = this.game.world;
    const y = w.heightAt(this.focus.x, this.focus.z);
    const back = this.construct.active ? 0.16 : 0.5;
    this.lookAt = this.lookAt ?? new THREE.Vector3();
    this.lookAt.set(this.focus.x, y, this.focus.z);
    this.dummy.position.set(this.focus.x, y + this.height, this.focus.z + this.height * back);
    this.dummy.lookAt(this.lookAt);
    this.wanted = this.wanted ?? { pos: this.dummy.position, quat: this.dummy.quaternion };
    return this.wanted;
  }

  update(dt, ctrl) {
    const cam = this.game.camera;
    if (!this.leaving) {
      const k = (this.height / window.innerHeight) * 1.25;
      if (!this.lockPan) {
        this.focus.x -= ctrl.look.dx * k;
        this.focus.z -= ctrl.look.dy * k;
      }
      const speed = this.height * 0.9;
      this.focus.x += ctrl.move.x * speed * dt;
      this.focus.z -= ctrl.move.y * speed * dt;
      if (ctrl.zoom) this.zoomBy(1 + ctrl.zoom * 0.08);
      // Glisser ou se déplacer soi-même arrête le trajet automatique de la caméra.
      if (this.glide && (ctrl.look.dx || ctrl.look.dy || ctrl.move.x || ctrl.move.y) && !this.lockPan) this.glide = null;
      const gl = this.glide;
      if (gl) {
        const a = Math.min(1, dt * 4);
        this.focus.x += (gl.x - this.focus.x) * a;
        this.focus.z += (gl.z - this.focus.z) * a;
        this.height += (gl.h - this.height) * a;
        if (Math.abs(gl.x - this.focus.x) + Math.abs(gl.z - this.focus.z) + Math.abs(gl.h - this.height) < 0.05) this.glide = null;
      }
      this.focus.x = THREE.MathUtils.clamp(this.focus.x, -110, 110);
      this.focus.z = THREE.MathUtils.clamp(this.focus.z, -110, 110);
    }
    const tr = this.trans;
    if (tr) {
      tr.t += dt / tr.dur;
      const e = smoothstep(Math.min(1, tr.t));
      const to = tr.out ? { pos: this.saved.pos, quat: this.saved.quat } : this.desired();
      cam.position.lerpVectors(tr.from, to.pos, e);
      cam.quaternion.slerpQuaternions(tr.fromQ, to.quat, e);
      if (tr.t >= 1) {
        this.trans = null;
        if (tr.out) {
          this.finish();
          return;
        }
      }
    } else {
      const d = this.desired();
      cam.position.lerp(d.pos, Math.min(1, dt * 10));
      cam.quaternion.slerp(d.quat, Math.min(1, dt * 10));
    }
    this.build.update(dt);
    this.construct.update(dt);
    this.labelAcc += dt;
    if (this.labelAcc > 0.5) {
      this.labelAcc = 0;
      this.refreshLabels();
      this.refreshBar();
    }
    this.placeLabels();
  }

  /** Vue de haut : on recule le brouillard d'autant que la caméra est montée. */
  liftFog() {
    const fog = this.game.scene.fog;
    const cam = this.game.camera.position;
    const up = Math.max(0, cam.y - this.game.world.heightAt(cam.x, cam.z));
    fog.near += up * 1.2;
    fog.far += up * 2;
  }

  /** Point du sol sous l'écran (sx, sy) : rayon contre le relief, sans tester toute la scène. */
  groundAt(sx, sy) {
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.game.camera);
    const { origin, direction } = this.raycaster.ray;
    if (direction.y > -0.01) return null;
    const w = this.game.world;
    let y = w.heightAt(this.focus.x, this.focus.z);
    const p = new THREE.Vector3();
    for (let i = 0; i < 5; i++) {
      const d = (y - origin.y) / direction.y;
      p.copy(origin).addScaledVector(direction, d);
      y = w.heightAt(p.x, p.z);
    }
    p.y = y;
    return p;
  }

  /** Toucher en vue d'ensemble : on ouvre directement la feuille d'actions, sans marcher. */
  onTap(sx, sy) {
    if (this.leaving) return;
    if (this.build.active) {
      this.build.onTap(sx, sy);
      return;
    }
    // Vue construction : toucher choisit un enclos, un bâtiment ou un équipement à modifier.
    if (this.construct.active) {
      this.construct.onTap(sx, sy);
      return;
    }
    const g = this.game;
    const ground = this.groundAt(sx, sy);
    const rc = this.raycaster;
    const roots = [...g.entities.values()].filter((e) => !e.ridden).map((e) => e.root);
    const hitA = rc.intersectObjects(roots, true).find((x) => !x.object.isSprite);
    if (hitA) {
      let o = hitA.object;
      while (o && !o.userData.entity) o = o.parent;
      if (o) {
        this.ui.openAnimalActions(o.userData.entity.data);
        return;
      }
    }
    // Un animal tout près du point touché (ils sont petits vus d'en haut).
    if (ground) {
      let best = null;
      let bestD = Math.max(1.2, this.height / 40);
      for (const e of g.entities.values()) {
        const d = Math.hypot(e.position.x - ground.x, e.position.z - ground.z) - e.radius;
        if (d < bestD && !e.ridden) {
          bestD = d;
          best = e;
        }
      }
      if (best) {
        this.ui.openAnimalActions(best.data);
        return;
      }
    }
    const eqHit = rc.intersectObjects(g.equipment.map((q) => q.mesh), true)[0];
    if (eqHit) {
      const q = g.equipment.find((x) => { let o = eqHit.object; while (o && o !== x.mesh) o = o.parent; return !!o; });
      if (q) {
        openEquipment(this.ui, q);
        return;
      }
    }
    const s = g.structures.pick(rc, ground);
    if (s) {
      openStructure(this.ui, s);
      return;
    }
    if (!ground) return;
    const kind = g.world.kindAt(ground.x, ground.z);
    if (kind && g.world.interactables.some((i) => i.kind === kind)) this.ui.openBuilding(kind);
  }

  refreshBar() {
    renderBar(this.ui, this);
  }

  // ---------------------------------------------------------------- étiquettes

  /** Liste des étiquettes : bâtiments de la ferme, constructions et animaux, avec leur état. */
  refreshLabels() {
    const g = this.game;
    const w = g.world;
    const st = g.structures;
    const care = (a) => st.needsCare(a);
    const here = g.animalsHere();
    const free = here.filter((a) => !st.homeOf(a));
    const items = [];
    const far = this.height > 85; // de très haut : étiquettes courtes (emoji + nombre)
    const status = (list, emoji) => (list.length ? ` · ${emoji} ${list.length}${list.some(care) ? ' ⚠️' : ''}` : '');
    // Vue construction : les noms (et la taille des enclos) ; toucher une étiquette choisit l'élément.
    const cv = this.construct.active ? this.construct : null;
    const size = (r) => ` · ${t('con_size', { w: fmt(r.hw * 2), d: fmt(r.hd * 2) })}`;
    for (const it of w.interactables) {
      if (it.kind === 'spot') continue;
      const col = w.colliders.find((c) => c.kind === it.kind);
      let pos = col ? { x: col.x, z: col.z } : { x: it.x, z: it.z };
      if (it.kind === 'pen') pos = { x: PEN.x, z: PEN.z - 3 };
      if (it.kind === 'paddock') pos = { x: enclosure('paddock').x, z: enclosure('paddock').z };
      const name = it.kind === 'refuge' && !g.isHome ? t('bld_breeder') : t(`bld_${it.kind}`);
      if (cv) {
        const e = enclosure(it.kind);
        items.push({
          key: `b-${it.kind}`, x: pos.x, z: pos.z, y: 5, cls: 'mgmt-label building',
          text: `${BLD_ICON[it.kind] ?? '🏠'} ${name}${e && RESIZABLE_CORE.includes(it.kind) && !far ? size(e) : ''}`,
          tap: () => cv.tapLabel(it.kind),
        });
        continue;
      }
      let extra = '';
      if (it.kind === 'stable') extra = status(free.filter((a) => a.species === 'horse'), '🐴');
      if (it.kind === 'pen') extra = status(free.filter((a) => SPECIES[a.species].livestock), '🐑');
      if (it.kind === 'house' || it.kind === 'lodge') extra = status(free.filter((a) => a.species === 'cat'), '🐱');
      if (it.kind === 'kennel') extra = status(free.filter((a) => a.species === 'dog'), '🐶');
      if (it.kind === 'hutch') extra = status(free.filter((a) => a.species === 'rabbit'), '🐰');
      if (it.kind === 'vet') {
        const sick = here.filter((a) => a.sick);
        extra = sick.length ? ` · 🤒 ${sick.length} ⚠️` : '';
      }
      items.push({
        key: `b-${it.kind}`, x: pos.x, z: pos.z, y: 5, cls: 'mgmt-label building',
        text: far ? `${BLD_ICON[it.kind] ?? '🏠'}${extra.replace(' · ', ' ')}` : `${BLD_ICON[it.kind] ?? '🏠'} ${name}${extra}`,
        tap: () => this.ui.openBuilding(it.kind),
      });
    }
    for (const s of st.here()) {
      const def = STRUCTURES[s.type];
      if (def.cat === 'decor') continue;
      const res = st.residents(s);
      const warn = res.some(care) || st.droppings(s) > 3;
      const f = footprintOf(s);
      const cap = capacityOf(s);
      items.push({
        key: `s-${s.id}`, x: s.x, z: s.z - f.hd * 0.3, y: def.cat === 'home' ? 2.2 : 4, cls: 'mgmt-label structure',
        text: cv
          ? `${def.emoji} ${structureName(s.type)}${['enclosure', 'ranch'].includes(def.cat) && !far ? size(f) : ''}`
          : far
            ? `${def.emoji}${cap ? ` ${res.length}/${cap}` : ''}${warn ? ' ⚠️' : ''}`
            : `${def.emoji} ${structureName(s.type)}${cap ? ` · 👥 ${res.length}/${cap}` : ''}${warn ? ' ⚠️' : ''}`,
        tap: () => (cv ? cv.pick({ kind: 'structure', id: s.id }) : openStructure(this.ui, s)),
      });
    }
    // Équipements : on peut les toucher pour les déplacer (comme dans un jeu de construction).
    if (!far) {
      for (const q of g.equipment) {
        const low = q.def.stock !== null && !g.equipmentStock(q.eq);
        items.push({
          key: `e-${q.eq.id}`, x: q.pos.x, z: q.pos.z, y: 1.4, cls: `mgmt-label equip${low ? ' warn' : ''}`,
          text: `${EQUIPMENT[q.eq.type].emoji}${low ? ' ⚠️' : ''}`,
          tap: () => (cv ? cv.pick({ kind: 'equipment', id: q.eq.id }) : openEquipment(this.ui, q)),
        });
      }
    }
    if (!far && !cv) {
      for (const e of g.entities.values()) {
        if (e.ridden) continue;
        const a = e.data;
        const mark = a.sick ? ' 🤒' : care(a) ? ' ⚠️' : e.sleeping ? ' 💤' : '';
        items.push({
          key: `a-${a.id}`, entity: e, y: e.label.position.y, cls: `mgmt-label animal${mark.includes('⚠️') || a.sick ? ' warn' : ''}`,
          text: `${SPECIES[a.species].emoji} ${a.name}${mark}`,
          tap: () => this.ui.openAnimalActions(a),
        });
      }
    }
    this.items = items;
    const seen = new Set();
    for (const it of items) {
      seen.add(it.key);
      let el = this.labelEls.get(it.key);
      if (!el) {
        el = h('button', { class: it.cls, onClick: (ev) => { ev.stopPropagation(); if (!this.build.active) el.tapFn?.(); } });
        this.layer.append(el);
        this.labelEls.set(it.key, el);
      }
      el.tapFn = it.tap;
      if (el.textContent !== it.text) el.textContent = it.text;
      if (el.className !== it.cls) el.className = it.cls;
      if (el.offsetWidth) el.labelW = el.offsetWidth;
    }
    for (const [k, el] of this.labelEls) {
      if (!seen.has(k)) {
        el.remove();
        this.labelEls.delete(k);
      }
    }
  }

  /** Place les étiquettes à l'écran (chaque image). */
  placeLabels() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const cam = this.game.camera;
    const v = new THREE.Vector3();
    const w = this.game.world;
    const placed = [];
    const dim = this.build.active || !!this.construct.sel;
    for (const it of this.items) {
      const el = this.labelEls.get(it.key);
      if (!el) continue;
      if (it.entity) v.copy(it.entity.position).setY(it.entity.position.y + it.y);
      else v.set(it.x, w.heightAt(it.x, it.z) + it.y, it.z);
      v.project(cam);
      if (v.z > 1 || v.x < -1.05 || v.x > 1.05 || v.y < -1.05 || v.y > 1.05) {
        el.style.display = 'none';
        continue;
      }
      el.style.display = '';
      const x = ((v.x + 1) / 2) * W;
      let y = ((1 - v.y) / 2) * H;
      const wpx = el.labelW || 120;
      for (let k = 0; k < 5; k++) {
        const hit = placed.find((q) => Math.abs(q.x - x) < (q.w + wpx) / 2 && Math.abs(q.y - y) < 30);
        if (!hit) break;
        y = hit.y - 32;
      }
      placed.push({ x, y, w: wpx });
      el.style.transform = `translate(${Math.round(x - wpx / 2)}px, ${Math.round(y - 20)}px)`;
      el.style.opacity = dim ? 0.45 : 1;
    }
  }
}

// Constructions du joueur dans le monde 3D : modèles, collisions, enclos pour la navigation,
// zones de vie des habitants, et les actions (construire, déplacer, démolir, attribuer une maison).
// La logique pure (catalogue, placement, prix, places) est dans src/sim/construction.js.

import * as THREE from 'three';
import {
  STRUCTURES, structuresAt, findStructure, footprint, toWorld, enclosureOf, homeZone, zoneRect, hasResidents,
  validatePlacement, build, moveStructure, demolish, assign, unassign, residents, applyComfort, homeOf, structureAtPoint,
  isEnclosure, canBuild, validateCore, validateEquipment, moveCore, moveEquipment, coreRect, equipmentPos, doorOf,
} from '../sim/construction.js';
import { addStat } from '../sim/profile.js';
import { scoopZone } from '../sim/droppings.js';
import { trainSkill, NEEDS } from '../sim/animal.js';
import { isNight } from '../sim/time.js';
import { fenceColliders, setBuiltEnclosures } from './nav.js';
import { buildStructureModel, RANCH_BARN } from './models/structures.js';
import { t } from '../i18n.js';

/** Rectangle local (lx, lz, hw, hd) d'une structure → rectangle du monde (rotation en quarts de tour). */
function localRect(s, lx, lz, hw, hd, extra = {}) {
  const p = toWorld(s, lx, lz);
  const swap = s.rot % 2 === 1;
  return { x: p.x, z: p.z, hw: swap ? hd : hw, hd: swap ? hw : hd, structure: s.id, ...extra };
}

function disposeGroup(g) {
  g.traverse((o) => {
    if (o.isMesh || o.isInstancedMesh) {
      o.geometry.dispose();
      o.material.map?.dispose?.();
      o.material.dispose();
    }
  });
}

export class Structures {
  constructor(game) {
    this.game = game;
    this.items = new Map(); // id → { s, group }
    this.hidden = [];
    this.hiddenRoot = null;
  }

  get world() {
    return this.game.world;
  }

  get profile() {
    return this.game.profile;
  }

  /** Reconstruit toutes les structures du lieu (appelé par Game.loadPlace et après chaque changement). */
  rebuild(placeId = this.profile.place) {
    const w = this.world;
    for (const it of this.items.values()) {
      it.group.parent?.remove(it.group);
      disposeGroup(it.group);
    }
    this.items.clear();
    w.colliders = w.colliders.filter((c) => !c.structure);
    w.fences = (w.fences ?? []).filter((f) => !f.structure);
    w.interactables = w.interactables.filter((i) => !i.structure); // porte du salon de toilettage
    w.structureHomes = new Map();
    const encl = [];
    const list = structuresAt(this.profile, placeId);
    for (const s of list) this.spawn(s, encl);
    // Les bâtiments pleins (grange, écurie, niche…) : les animaux et le joueur en font le tour.
    const solid = list.filter((s) => !isEnclosure(s.type) && !STRUCTURES[s.type].open && STRUCTURES[s.type].cat !== 'decor')
      .map((s) => footprint(s.type, s.x, s.z, s.rot));
    setBuiltEnclosures(encl, solid);
    this.hideVegetation();
    if (this.game.mgmt?.active) this.game.mgmt.refreshLabels();
  }

  spawn(s, encl) {
    const w = this.world;
    const def = STRUCTURES[s.type];
    const base = w.heightAt(s.x, s.z);
    const ground = (lx, lz) => {
      const p = toWorld(s, lx, lz);
      return w.heightAt(p.x, p.z) - base;
    };
    const group = buildStructureModel(s.type, def.cat === 'decor' ? '' : t(`st_${s.type}`), ground);
    group.position.set(s.x, base, s.z);
    group.rotation.y = (s.rot * Math.PI) / 2;
    group.userData.structure = s;
    w.group.add(group);
    this.items.set(s.id, { s, group });

    const cols = [];
    if (isEnclosure(s.type)) {
      const e = enclosureOf(s);
      encl.push(e);
      const fences = fenceColliders(e).map((c) => ({ ...c, structure: s.id }));
      cols.push(...fences);
      w.fences = [...(w.fences ?? []), ...fences];
      if (def.cat === 'ranch') cols.push(localRect(s, RANCH_BARN.x, RANCH_BARN.z, RANCH_BARN.hw, RANCH_BARN.hd));
    } else if (def.open) {
      // Abri ouvert : seulement le mur du fond et les côtés.
      cols.push(localRect(s, 0, -def.d / 2 + 0.1, def.w / 2, 0.2), localRect(s, -def.w / 2 + 0.1, 0, 0.2, def.d / 2), localRect(s, def.w / 2 - 0.1, 0, 0.2, def.d / 2));
    } else if (s.type === 'tree') {
      cols.push(localRect(s, 0, 0, 0.35, 0.35, { equip: true }));
    } else if (s.type === 'fence') {
      cols.push(localRect(s, 0, 0, 2, 0.12, { fence: true }));
    } else if (!def.walkable) {
      const f = footprint(s.type, s.x, s.z, s.rot);
      cols.push({ ...f, hw: f.hw + 0.15, hd: f.hd + 0.15, structure: s.id, equip: def.cat !== 'building' });
    }
    w.colliders.push(...cols);
    if (hasResidents(s.type)) w.structureHomes.set(s.id, homeZone(s));
    if (s.type === 'salon') w.interactables.push({ kind: 'salon', ...doorOf(s), structure: s.id }); // métier Toiletteur
  }

  /** Cache les arbres (et l'herbe sous les bâtiments) qui se trouvent sur une construction. */
  hideVegetation() {
    const w = this.world;
    if (this.hiddenRoot === w.group) {
      for (const { im, i, m } of this.hidden) {
        im.setMatrixAt(i, m);
        im.instanceMatrix.needsUpdate = true;
      }
    }
    this.hidden = [];
    this.hiddenRoot = w.group;
    const list = [...this.items.values()].map(({ s }) => ({
      f: footprint(s.type, s.x, s.z, s.rot),
      floor: !['enclosure', 'ranch'].includes(STRUCTURES[s.type].cat) || STRUCTURES[s.type].arena,
    }));
    if (!list.length) return;
    const meshes = [];
    for (const child of w.group.children) {
      if (child.userData.structure) continue;
      child.traverse((o) => { if (o.isInstancedMesh) meshes.push(o); });
    }
    const m = new THREE.Matrix4();
    const p = new THREE.Vector3();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const im of meshes) {
      if (!im.geometry.boundingBox) im.geometry.computeBoundingBox();
      const bb = im.geometry.boundingBox;
      const tall = bb.max.y - bb.min.y > 1.2;
      let changed = false;
      for (let i = 0; i < im.count; i++) {
        im.getMatrixAt(i, m);
        p.setFromMatrixPosition(m);
        const hit = list.some(({ f, floor }) => (tall || floor)
          && Math.abs(p.x - f.x) < f.hw + (tall ? 2 : 0.2) && Math.abs(p.z - f.z) < f.hd + (tall ? 2 : 0.2));
        if (!hit) continue;
        this.hidden.push({ im, i, m: m.clone() });
        im.setMatrixAt(i, zero);
        changed = true;
      }
      if (changed) im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------- questions

  here() {
    return structuresAt(this.profile, this.profile.place);
  }

  get(id) {
    return findStructure(this.profile, id);
  }

  group(id) {
    return this.items.get(id)?.group ?? null;
  }

  /** La structure touchée par un rayon (ou dont l'emprise contient le point du sol). */
  pick(raycaster, groundPoint = null) {
    const groups = [...this.items.values()].map((it) => it.group);
    const hit = raycaster.intersectObjects(groups, true)[0];
    if (hit) {
      let o = hit.object;
      while (o && !o.userData.structure) o = o.parent;
      if (o) return o.userData.structure;
    }
    if (groundPoint) return structureAtPoint(this.profile, this.profile.place, groundPoint.x, groundPoint.z);
    return null;
  }

  /** Positions des installations de base dans ce lieu (bergerie, paddock… déplacés). */
  get layout() {
    return this.profile.coreLayout?.[this.profile.place] ?? null;
  }

  /** Obstacles et zones interdites pour valider un emplacement. */
  env(ignore = null) {
    const w = this.world;
    return {
      ignore,
      core: this.layout,
      structures: this.here(),
      colliders: w.colliders.filter((c) => !c.structure),
      blocked: w.interactables.map((d) => ({ x: d.x, z: d.z, hw: 1.6, hd: 1.6 })),
      isWater: (x, z) => w.isWater(x, z),
      heightAt: (x, z) => w.heightAt(x, z),
    };
  }

  validate(type, x, z, rot, ignore = null) {
    return validatePlacement(type, x, z, rot, this.env(ignore));
  }

  /** Déplacer la bergerie, le paddock, la niche ou le clapier : on ignore ses propres barrières. */
  validateCore(id, x, z) {
    const env = this.env();
    const old = coreRect(this.layout, id);
    const mine = (c) => Math.abs(c.x - old.x) <= old.hw + 0.6 && Math.abs(c.z - old.z) <= old.hd + 0.6;
    env.colliders = env.colliders.filter((c) => !mine(c));
    env.blocked = env.blocked.filter((c) => !mine(c));
    return validateCore(id, x, z, env);
  }

  /** Poser un équipement : toutes les barrières comptent (on peut le mettre dans un enclos). */
  validateEquipment(x, z, entry = null) {
    const env = this.env();
    env.colliders = this.world.colliders.filter((c) => c !== entry?.col);
    return validateEquipment(x, z, env);
  }

  residents(s) {
    return residents(this.profile, s.id).filter((a) => a.location === this.profile.place);
  }

  /** Un habitant a besoin d'attention (malade, triste, un besoin bas). */
  needsCare(a) {
    return a.sick || NEEDS.some((n) => a.needs[n] < 40);
  }

  // ---------------------------------------------------------------- actions

  build(type, x, z, rot) {
    const g = this.game;
    const v = this.validate(type, x, z, rot);
    if (!v.ok) return v;
    const r = build(this.profile, type, this.profile.place, x, z, rot);
    if (!r.ok) return r;
    this.rebuild();
    addStat(this.profile, 'built');
    g.xp('build');
    g.save();
    return r;
  }

  move(id, x, z, rot) {
    const s = this.get(id);
    if (!s) return { ok: false, reason: 'unknown' };
    const v = this.validate(s.type, x, z, rot, id);
    if (!v.ok) return v;
    moveStructure(this.profile, id, x, z, rot);
    this.rebuild();
    for (const a of this.residents(s)) this.sendHome(a);
    this.game.save();
    return { ok: true, structure: s };
  }

  demolish(id) {
    const r = demolish(this.profile, id);
    if (!r.ok) return r;
    this.rebuild();
    for (const a of r.freed) this.sendHome(a);
    this.game.save();
    return r;
  }

  /** Déplace une installation de base : le lieu est reconstruit autour du joueur. */
  moveCore(id, x, z) {
    const v = this.validateCore(id, x, z);
    if (!v.ok) return v;
    const r = moveCore(this.profile, this.profile.place, id, x, z);
    if (!r.ok) return r;
    this.reloadPlace();
    return r;
  }

  /** Reconstruit le lieu (après un déménagement) sans bouger le joueur ni quitter la vue d'ensemble. */
  reloadPlace() {
    const g = this.game;
    const pp = g.player.position.clone();
    const yaw = g.rig.yaw;
    g.save();
    g.loadPlace(this.profile.place, { keepView: true });
    g.player.spawn(pp.x, pp.z);
    this.world.resolveCollisions(g.player.position);
    g.rig.yaw = yaw;
  }

  /** Déplace un équipement acheté (sans reconstruire le lieu). */
  moveEquipment(entry, x, z, free = false) {
    const v = this.validateEquipment(x, z, entry);
    if (!v.ok) return v;
    if (free) entry.eq.pos = [Math.round(x), Math.round(z)];
    else {
      const r = moveEquipment(this.profile, entry.eq, x, z);
      if (!r.ok) return r;
    }
    this.placeEquipment(entry);
    this.game.save();
    return { ok: true };
  }

  placeEquipment(entry) {
    const { x, z } = equipmentPos(this.layout, entry.eq);
    entry.mesh.position.set(x, this.world.heightAt(x, z), z);
    entry.mesh.visible = true;
    entry.pos.set(x, 0, z);
    if (entry.col) {
      entry.col.x = x;
      entry.col.z = z;
    }
  }

  /** Acheter un équipement et le poser à l'endroit choisi. */
  buyEquipmentAt(type, x, z) {
    const v = this.validateEquipment(x, z);
    if (!v.ok) return v;
    const r = this.game.buyEquipment(type);
    if (!r?.ok) return { ok: false, reason: 'money', silent: true }; // (buyEquipment a déjà prévenu)
    const entry = this.game.equipment.find((q) => q.eq.id === r.equipment.id);
    if (entry) this.moveEquipment(entry, x, z, true);
    return { ok: true };
  }

  canBuild(type) {
    return canBuild(this.profile, type);
  }

  assign(a, s) {
    const r = assign(this.profile, a, s);
    if (r.ok) this.sendHome(a);
    return r;
  }

  unassign(a) {
    unassign(a);
    this.sendHome(a);
  }

  homeOf(a) {
    return homeOf(this.profile, a);
  }

  /** L'animal (s'il est là) rentre à sa zone de vie. */
  sendHome(a) {
    const e = this.game.entities.get(a.id);
    if (!e || e.ridden) return false;
    a.following = false;
    e.sleeping = false;
    e.state = 'walk';
    e.pickWanderTarget();
    e.timer = 40;
    return true;
  }

  callHome(s) {
    let n = 0;
    for (const a of this.residents(s)) if (this.sendHome(a)) n++;
    return n;
  }

  /** Ramasser les crottins de la zone. */
  clean(s) {
    const ids = scoopZone(this.profile, this.profile.place, zoneRect(s));
    this.game.removeDroppingMeshes(ids);
    if (ids.length) {
      addStat(this.profile, 'scoop', ids.length);
      this.game.xp('care', Math.min(3, ids.length));
    }
    return ids.length;
  }

  droppings(s) {
    const z = zoneRect(s);
    return (this.profile.droppings ?? []).filter((d) => d.place === this.profile.place && d.kind === 'poop'
      && Math.abs(d.x - z.x) < z.hw + 1 && Math.abs(d.z - z.z) < z.hd + 1).length;
  }

  /** Séance à la carrière : les chevaux y vont et progressent en saut ou en dressage. */
  trainHorses(s) {
    const zone = homeZone(s);
    let n = 0;
    let i = 0;
    for (const a of this.game.animalsHere().filter((x) => x.species === 'horse')) {
      const r = trainSkill(a, i++ % 2 === 0 ? 'jump' : 'dressage');
      if (!r.ok) continue;
      // Un bonus : la carrière est faite pour ça.
      a.skills[r.skill] = Math.min(100, a.skills[r.skill] + 1);
      const e = this.game.entities.get(a.id);
      if (e && !e.ridden) {
        a.following = false;
        e.state = 'walk';
        e.target.set(zone.x + (Math.random() - 0.5) * zone.r, 0, zone.z + (Math.random() - 0.5) * zone.r);
        e.timer = 25;
        e.emit('⭐', 2);
      }
      n++;
    }
    if (n) {
      addStat(this.profile, 'trainings', n);
      this.game.xp('care', Math.min(3, n));
    }
    return n;
  }

  /** Confort : un animal qui dort chez lui récupère plus vite. */
  tick(here, hours, skipped) {
    const g = this.game;
    applyComfort(this.profile, here, hours, (a, s) => {
      if (skipped) return isNight(this.profile.clock);
      const e = g.entities.get(a.id);
      if (!e?.sleeping) return false;
      const z = homeZone(s);
      return Math.hypot(e.position.x - z.x, e.position.z - z.z) < z.r + 2.5;
    });
  }
}

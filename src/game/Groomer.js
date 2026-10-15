// Salon de toilettage dans le monde 3D (métier Toiletteur ✂️) : les clients arrivent à pied avec leur
// animal, attendent devant le salon, l'animal monte sur la table pendant le toilettage, puis tout le
// monde repart. Gère aussi l'aspect « fraîchement coupé » des animaux du joueur.
// La logique pure (demandes, notes, paye, rangs) est dans src/sim/groomer.js ; l'interface dans src/ui/groomer.js.

import * as THREE from 'three';
import { buildAvatar } from './models/avatarModel.js';
import { disposeModel } from './models/animalModel.js';
import { AnimalEntity } from './AnimalEntity.js';
import { navTarget } from './nav.js';
import { doorOf, toWorld, STRUCTURES, BOUNDS } from '../sim/construction.js';
import {
  ensureGroomer, salonAt, canGroom, canWelcome, newClient, addClient, acceptClient, dismissClient, expireClients,
  clientInterval, currentClient, cutFresh,
} from '../sim/groomer.js';
import { dayOf, hourOf } from '../sim/time.js';
import { openSalon } from '../ui/groomer.js';
import { t } from '../i18n.js';

const SKINS = [0xf5d3b8, 0xe8b796, 0xd09a72, 0xa9714b, 0x7a4b2e, 0x5a3a24];
const HAIRS = [0x1b1411, 0x4a2f1d, 0x8a5a2b, 0xd2a557, 0xa63a1f, 0x9a9a9a];
const TOPS = [0xe07b9a, 0x3b7dd8, 0xf2c94c, 0x3fae62, 0x9b59d0, 0xe86a3a];

function nameTag(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 28px system-ui, sans-serif';
  const w = Math.min(250, ctx.measureText(text).width + 28);
  ctx.fillStyle = 'rgba(120,60,110,0.7)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 10, w, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Un client : le maître (avatar) et son animal (AnimalEntity, non ajouté au troupeau du joueur). */
class Visitor {
  constructor(game, client, at, waitAt) {
    this.game = game;
    this.client = client;
    const seed = client.owner.seed ?? 0;
    const female = client.owner.sex === 'f';
    const styles = female ? ['ponytail', 'long', 'curly', 'long'] : ['short', 'curly', 'short', 'bald'];
    this.avatar = buildAvatar({
      skin: SKINS[seed % SKINS.length],
      hair: HAIRS[(seed * 3) % HAIRS.length],
      hairStyle: styles[seed % styles.length],
      top: TOPS[(seed * 7) % TOPS.length],
      bottom: seed % 2 ? 0x5a4a6a : 0x3a3f4a,
      shoes: 0x3b2a20,
      hat: seed % 4 === 0,
    });
    this.root = new THREE.Group();
    this.root.add(this.avatar.root);
    this.root.userData.visitor = this;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTag(`${female ? '👩' : '👨'} ${client.owner.name}`), depthTest: false, transparent: true }));
    this.tag.position.y = 2.05;
    this.tag.scale.set(1.6, 0.4, 1);
    this.tag.renderOrder = 10;
    this.root.add(this.tag);
    this.root.position.set(at.x, game.world.heightAt(at.x, at.z), at.z);
    game.scene.add(this.root);
    // L'animal du client : une vraie entité, qui suit son maître.
    this.animal = new AnimalEntity(client.animal, game.world, game.scene);
    this.animal.root.userData.visitor = this;
    this.animal.position.set(at.x + 0.8, 0, at.z + 0.6);
    this.animal.snap();
    this.animal.label.visible = true;
    this.waitAt = waitAt;
    this.target = new THREE.Vector3(waitAt.x, 0, waitAt.z);
    this.heading = 0;
    this.speed = 0;
    this.phase = 0;
    this.state = 'arriving'; // arriving | waiting | leaving | gone
    this.onTable = false;
  }

  get position() {
    return this.root.position;
  }

  /** Repart (vers la sortie), puis disparaît. */
  leave(exitAt) {
    this.state = 'leaving';
    this.onTable = false;
    this.target.set(exitAt.x, 0, exitAt.z);
  }

  /** L'animal monte sur la table de toilettage (ou en redescend). */
  table(spot) {
    this.onTable = !!spot;
    if (spot) {
      this.animal.position.set(spot.x, 0, spot.z);
      this.animal.snap();
      this.animal.root.position.y += spot.y ?? 0;
      this.animal.heading = spot.heading ?? 0;
    }
  }

  update(dt) {
    const g = this.game;
    const p = this.root.position;
    const d = Math.hypot(this.target.x - p.x, this.target.z - p.z);
    let want = 0;
    if (this.state === 'arriving' && d > 0.5) want = 2.2;
    else if (this.state === 'arriving') this.state = 'waiting';
    else if (this.state === 'leaving') {
      if (d > 0.8) want = 2.6;
      else this.state = 'gone';
    }
    if (want > 0) {
      const way = navTarget(p, this.target);
      const h = Math.atan2(way.x - p.x, way.z - p.z);
      let diff = h - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
    } else if (this.state === 'waiting') {
      // Face au salon (vers la porte).
      const door = g.groomer.door();
      if (door) this.heading = Math.atan2(door.x - p.x, door.z - p.z);
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 6);
    if (this.speed > 0.02) {
      p.x += Math.sin(this.heading) * this.speed * dt;
      p.z += Math.cos(this.heading) * this.speed * dt;
      g.world.resolveCollisions(p, 0.35);
    }
    p.y = g.world.heightAt(p.x, p.z);
    this.root.rotation.y = this.heading;
    this.tag.visible = p.distanceTo(g.player.position) < 16;
    this.phase += dt * this.speed * 2.2;
    const amp = Math.min(0.7, this.speed * 0.16);
    this.avatar.legs[0].rotation.x = Math.sin(this.phase) * amp;
    this.avatar.legs[1].rotation.x = -Math.sin(this.phase) * amp;
    this.avatar.arms[0].rotation.x = -Math.sin(this.phase) * amp * 0.8;
    this.avatar.arms[1].rotation.x = Math.sin(this.phase) * amp * 0.8;

    // L'animal suit son maître (sauf quand il est sur la table).
    const a = this.animal;
    a.time += dt;
    if (!this.onTable) {
      const side = 0.9;
      const goal = { x: p.x - Math.sin(this.heading) * 0.9 + Math.cos(this.heading) * side, z: p.z - Math.cos(this.heading) * 0.9 - Math.sin(this.heading) * side };
      const ap = a.root.position;
      const ad = Math.hypot(goal.x - ap.x, goal.z - ap.z);
      const aw = ad > 0.5 ? Math.min(a.sp.runSpeed * 0.6, ad * 2) : 0;
      a.speed += (aw - a.speed) * Math.min(1, dt * 5);
      if (aw > 0) {
        const h = Math.atan2(goal.x - ap.x, goal.z - ap.z);
        let diff = h - a.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        a.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 5);
        ap.x += Math.sin(a.heading) * a.speed * dt;
        ap.z += Math.cos(a.heading) * a.speed * dt;
      } else if (this.state === 'waiting') a.heading = this.heading;
      ap.y = g.world.heightAt(ap.x, ap.z);
    } else a.speed = 0;
    a.root.rotation.y = a.heading;
    try { a.animate(dt, false); } catch { /* modèle sans cette pièce : tant pis */ }
  }

  dispose() {
    this.game.scene.remove(this.root);
    disposeModel(this.avatar.root);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
    this.animal.dispose();
  }
}

export class Groomer {
  constructor(game) {
    this.game = game;
    this.visitors = new Map(); // client.id → Visitor
    this.session = null; // { client | null, animal, own, done: [{ id, quality }], style }
    this.mgmtSeen = false;
    this.visualAcc = 0;
    this.cutVisuals = new Map(); // entité → { style, saved: [[obj, scale]] }
  }

  get profile() {
    return this.game.profile;
  }

  get state() {
    return ensureGroomer(this.profile);
  }

  /** Le salon de ce lieu (construction), ou null. */
  salon() {
    return this.profile ? salonAt(this.profile, this.profile.place) : null;
  }

  door() {
    const s = this.salon();
    return s ? doorOf(s) : null;
  }

  /** Points utiles autour du salon : où attendre, où entrer, la table. */
  spots() {
    const s = this.salon();
    if (!s) return null;
    const def = STRUCTURES[s.type];
    const clampB = (p) => ({ x: Math.max(-BOUNDS + 2, Math.min(BOUNDS - 2, p.x)), z: Math.max(-BOUNDS + 2, Math.min(BOUNDS - 2, p.z)) });
    const w = this.game.world;
    const table = toWorld(s, 1.95, 0.9);
    const tableRot = (s.rot * Math.PI) / 2;
    return {
      wait: [toWorld(s, -3.0, def.d / 2 + 2.4), toWorld(s, 2.8, def.d / 2 + 3.2)],
      entry: clampB(toWorld(s, 0, def.d / 2 + 16)),
      table: { x: table.x, z: table.z, y: w.heightAt(s.x, s.z) - w.heightAt(table.x, table.z) + 1.02, heading: tableRot + Math.PI / 2 },
    };
  }

  /** Les clients qui attendaient sont remis en place quand on charge le lieu. */
  onPlaceLoaded() {
    this.clear(false);
    if (!this.profile || !this.salon()) return;
    const st = this.state;
    const day = dayOf(this.profile.clock);
    expireClients(this.profile, day);
    const sp = this.spots();
    st.clients.forEach((c, i) => {
      const at = sp.wait[i % sp.wait.length];
      const v = new Visitor(this.game, c, at, at);
      v.state = 'waiting';
      this.visitors.set(c.id, v);
      if (c.status === 'accepted') {
        this.session = { client: c, animal: c.animal, own: false, done: [], style: c.style };
        v.table(sp.table);
      }
    });
  }

  clear(all = true) {
    for (const v of this.visitors.values()) v.dispose();
    this.visitors.clear();
    this.session = null;
    if (all) this.cutVisuals.clear();
  }

  update(dt) {
    const p = this.profile;
    if (!p) return;
    // Le repère des quêtes : « ouvre la vue d'ensemble » est fait quand on y est.
    const mgmt = !!this.game.mgmt?.active;
    if (mgmt && !this.mgmtSeen) this.game.emit('panel', 'mgmt');
    this.mgmtSeen = mgmt;
    for (const [id, v] of this.visitors) {
      v.update(dt);
      if (v.state === 'gone') {
        v.dispose();
        this.visitors.delete(id);
      }
    }
    this.visualAcc += dt;
    if (this.visualAcc > 1) {
      this.visualAcc = 0;
      this.refreshCutVisuals();
    }
    const s = this.salon();
    if (!s || dt <= 0) return;
    const st = this.state;
    const day = dayOf(p.clock);
    // Les clients de la veille sont repartis.
    for (const c of expireClients(p, day)) {
      if (this.session?.client === c) this.session = null;
      this.visitors.get(c.id)?.leave(this.spots().entry);
    }
    // Arrivées : de jour, si on a le niveau et de la place.
    if (st.nextClientAt === 0) st.nextClientAt = p.clock + 20;
    const hour = hourOf(p.clock);
    if (canGroom(p) && canWelcome(p) && p.clock >= st.nextClientAt && hour >= 8 && hour < 19) {
      st.nextClientAt = p.clock + clientInterval(p) * 60 * (0.7 + Math.random() * 0.6);
      this.arrive(newClient(p, { day }));
    }
  }

  /** Un client arrive à pied depuis l'entrée. */
  arrive(client) {
    const r = addClient(this.profile, client);
    if (!r.ok) return null;
    const sp = this.spots();
    const i = [...this.visitors.values()].filter((v) => v.state !== 'leaving').length;
    const v = new Visitor(this.game, client, sp.entry, sp.wait[i % sp.wait.length]);
    this.visitors.set(client.id, v);
    this.game.ui.toast(t('grm_arrives', { owner: client.owner.name, name: client.animal.name }), 6000);
    this.game.emit('groomerClient', client);
    return client;
  }

  /** Pour tester : fait venir tout de suite un client (demande et espèce au choix). */
  force(requestId = null, species = null) {
    if (!this.salon()) return null;
    const client = newClient(this.profile, { requestId, species, day: dayOf(this.profile.clock) });
    return this.arrive(client);
  }

  /** Toucher un client ou son animal : on va au salon. */
  onTap(raycaster) {
    if (!this.visitors.size) return false;
    const roots = [...this.visitors.values()].flatMap((v) => [v.root, v.animal.root]);
    const hit = raycaster.intersectObjects(roots, true)[0];
    if (!hit) return false;
    const door = this.door();
    if (door) this.game.walkTo(new THREE.Vector3(door.x, 0, door.z), 1.4, () => this.open());
    return true;
  }

  open() {
    openSalon(this.game.ui);
  }

  // ---------------------------------------------------------------- séance

  accept(client) {
    const r = acceptClient(this.profile, client);
    if (!r.ok) return r;
    this.session = { client, animal: client.animal, own: false, done: [], style: client.style };
    this.visitors.get(client.id)?.table(this.spots()?.table);
    this.game.save();
    return r;
  }

  refuse(client) {
    if (this.session?.client === client) this.session = null;
    dismissClient(this.profile, client, true);
    this.visitors.get(client.id)?.leave(this.spots().entry);
    this.game.save();
  }

  /** Toiletter un de ses animaux (gratuit). */
  startOwn(a) {
    this.session = { client: null, animal: a, own: true, done: [], style: null };
    return this.session;
  }

  /** Le client repart (après le résultat). */
  release(client) {
    if (this.session?.client === client) this.session = null;
    this.visitors.get(client.id)?.leave(this.spots()?.entry ?? { x: 0, z: -20 });
    this.game.save();
  }

  endOwn() {
    this.session = null;
  }

  /** Ce client est-il en train de patienter devant le salon ? */
  isHere(client) {
    return this.visitors.has(client.id);
  }

  current() {
    return this.profile ? currentClient(this.profile) : null;
  }

  // ---------------------------------------------------------------- aspect « fraîchement coupé »

  /** Les animaux du joueur fraîchement coupés : poil plus court (ou crinière de lion…). Tolérant aux modèles. */
  refreshCutVisuals() {
    const g = this.game;
    const day = dayOf(this.profile.clock);
    for (const e of g.entities.values()) {
      const a = e.data;
      const style = cutFresh(a, day) ? a.grooming.style : null;
      const cur = this.cutVisuals.get(e);
      if ((cur?.style ?? null) === style && cur?.model === e.model) continue;
      if (cur) for (const [o, s] of cur.saved) o.scale.copy(s);
      this.cutVisuals.delete(e);
      if (!style) continue;
      const saved = [];
      const sc = (o, x, y, z) => {
        if (!o?.scale) return;
        saved.push([o, o.scale.clone()]);
        o.scale.set(o.scale.x * x, o.scale.y * y, o.scale.z * z);
      };
      try {
        const md = e.model;
        const furs = (md.body?.children ?? []).filter((o) => o.isMesh);
        if (['court', 'tonte', 'concours'].includes(style)) furs.forEach((o) => sc(o, 0.93, 0.95, 1));
        else if (style === 'long') furs.forEach((o) => sc(o, 1.05, 1.04, 1));
        else if (style === 'lion') { furs.forEach((o) => sc(o, 0.92, 0.94, 1)); sc(md.neck, 1.16, 1.06, 1.16); }
        else if (style === 'caniche') { furs.forEach((o) => sc(o, 0.9, 0.93, 1)); sc(md.tail, 1.3, 1.3, 1.3); sc(md.head, 1.1, 1.1, 1.1); }
      } catch { /* modèle différent : pas d'aspect particulier */ }
      this.cutVisuals.set(e, { style, saved, model: e.model });
    }
    for (const e of [...this.cutVisuals.keys()]) if (!g.entities.has(e.data.id)) this.cutVisuals.delete(e);
  }
}

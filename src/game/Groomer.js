// Salon de toilettage dans le monde 3D (métier Toiletteur ✂️) : les clients arrivent par la route avec
// leur animal (les mêmes visiteurs que la pension et le vétérinaire : VisitorEntity de src/game/Clients.js),
// attendent devant le salon avec leur bulle 💬, l'animal monte sur la table de toilettage (le cheval et le
// mouton restent à côté, ils sont trop grands), puis tout le monde repart, l'animal tout beau.
// Gère aussi l'aspect « fraîchement coupé » des animaux (poil plus court, crinière de lion…).
// La logique pure (demandes, notes, paye, rangs) est dans src/sim/groomer.js ; l'interface dans src/ui/groomer.js.
//
// Pour tester dans la console : animaleana.game.groomer.force() (ou force('lion', 'dog')).

import * as THREE from 'three';
import { AnimalEntity } from './AnimalEntity.js';
import { VisitorEntity, GATE, WAY } from './Clients.js';
import { doorOf, toWorld, STRUCTURES, BOUNDS } from '../sim/construction.js';
import {
  ensureGroomer, salonAt, canGroom, canWelcome, newClient, addClient, acceptClient, dismissClient, expireClients,
  clientInterval, currentClient, cutFresh, waitingClients,
} from '../sim/groomer.js';
import { dayOf, hourOf } from '../sim/time.js';
import { openSalon, noteCareer } from '../ui/groomer.js';
import { openCatalogue } from '../ui/construction.js';
import { t } from '../i18n.js';

const SMALL = ['dog', 'cat', 'rabbit']; // ceux qui montent sur la table
const OPEN_HOURS = [8, 19];

/** Un client du salon : le maître (VisitorEntity) et son animal (AnimalEntity hors du troupeau du joueur). */
class SalonVisitor {
  constructor(game, client, at) {
    this.game = game;
    this.client = client;
    this.npc = new VisitorEntity(game, client.owner);
    this.npc.place(at.x, at.z);
    this.e = new AnimalEntity(client.animal, game.world, game.scene);
    this.e.root.userData.salonVisitor = this;
    this.npc.root.userData.salonVisitor = this;
    this.e.position.set(at.x + 0.9, 0, at.z + 0.7);
    this.e.snap();
    // L'animal reste près de son maître (sa « zone de vie » suit le visiteur), comme chez les clients de la pension.
    const npcPos = this.npc.position;
    Object.defineProperty(this.e, 'home', { configurable: true, get: () => ({ x: npcPos.x, z: npcPos.z, r: 1.4 }) });
    this.state = 'arriving'; // arriving | waiting | groomed | leaving
    this.onTable = null; // { x, y, z, heading } quand l'animal est installé pour le toilettage
  }

  /** Marche jusqu'à un endroit (par la route), puis attend en regardant la porte du salon. */
  walk(path, onArrive) {
    this.npc.walk(path, onArrive);
  }

  /** L'animal s'installe (sur la table ou à côté), ou redescend (spot = null). */
  table(spot) {
    const e = this.e;
    this.onTable = spot;
    e.scripted = !!spot;
    e.herdCtrl = null;
    if (spot) {
      e.position.set(spot.x, spot.y, spot.z);
      e.heading = spot.heading;
      e.speed = 0;
      e.state = 'idle';
      e.emit('✨', 2);
    } else {
      e.snap();
    }
  }

  update(dt, ctx) {
    this.npc.update(dt);
    const e = this.e;
    if (this.onTable) {
      e.position.set(this.onTable.x, this.onTable.y, this.onTable.z);
      e.speed = 0;
    } else {
      const d = Math.hypot(e.position.x - this.npc.position.x, e.position.z - this.npc.position.z);
      e.herdCtrl = d > 2.2 ? { pusher: true, target: this.npc.position } : null;
    }
    e.update(dt, ctx);
  }

  dispose() {
    this.npc.dispose();
    this.e.dispose();
  }
}

export class Groomer {
  constructor(game) {
    this.game = game;
    this.visitors = new Map(); // client.id → SalonVisitor
    this.leaving = []; // ceux qui s'en vont
    this.session = null; // { client | null, animal, own, done: [{ id, quality }], style }
    this.visualAcc = 0;
    this.cutVisuals = new Map(); // entité → { style, saved: [[obj, scale]], model }
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

  /** Points utiles autour du salon : où attendre, d'où l'on vient, la table (ou à côté pour les grands). */
  spots() {
    const s = this.salon();
    if (!s) return null;
    const def = STRUCTURES[s.type];
    const w = this.game.world;
    const clampB = (p) => ({ x: Math.max(-BOUNDS + 2, Math.min(BOUNDS - 2, p.x)), z: Math.max(-BOUNDS + 2, Math.min(BOUNDS - 2, p.z)) });
    const base = w.heightAt(s.x, s.z); // le socle du salon (src/game/Structures.js)
    const rot = (s.rot * Math.PI) / 2;
    const table = toWorld(s, 1.95, 0.9);
    const beside = toWorld(s, 1.95, def.d / 2 + 1.3);
    const near = toWorld(s, 3.9, def.d / 2 + 0.6);
    // Par la route du village (comme les visiteurs de la pension), sinon depuis le devant du salon.
    const road = this.game.isHome ? [GATE, WAY] : [clampB(toWorld(s, 0, def.d / 2 + 16))];
    return {
      wait: [toWorld(s, -2.2, def.d / 2 + 2.4), toWorld(s, 0.6, def.d / 2 + 3.4), toWorld(s, 3.2, def.d / 2 + 2.6)],
      road,
      owner: near, // le maître regarde le toilettage, sous l'auvent
      table: { x: table.x, z: table.z, y: base + 1.02, heading: rot + Math.PI / 2 },
      ground: { x: beside.x, z: beside.z, y: w.heightAt(beside.x, beside.z), heading: rot + Math.PI / 2 },
      look: toWorld(s, 1.95, 0.9),
    };
  }

  /** Où l'animal de ce client se met pour le toilettage. */
  spotFor(client) {
    const sp = this.spots();
    if (!sp) return null;
    return SMALL.includes(client.animal.species) ? sp.table : sp.ground;
  }

  /** Les clients qui attendaient sont remis en place quand on charge le lieu. */
  onPlaceLoaded() {
    this.clear(false);
    if (!this.profile || !this.salon()) return;
    const st = this.state;
    expireClients(this.profile, dayOf(this.profile.clock));
    const sp = this.spots();
    st.clients.forEach((c, i) => {
      const at = c.status === 'accepted' ? sp.owner : sp.wait[i % sp.wait.length];
      const v = new SalonVisitor(this.game, c, at);
      this.visitors.set(c.id, v);
      this.settle(v);
      if (c.status === 'accepted') {
        this.session = { client: c, animal: c.animal, own: false, done: [], style: c.style };
        v.table(this.spotFor(c));
      }
    });
  }

  /** Le visiteur est arrivé : bulle 💬, petit coucou, il regarde le salon. */
  settle(v) {
    const sp = this.spots();
    v.state = v.client.status === 'accepted' ? 'groomed' : 'waiting';
    v.npc.bubble.visible = v.state === 'waiting';
    v.npc.waving = v.state === 'waiting';
    if (sp) v.npc.lookAt(sp.look.x, sp.look.z);
    this.refreshFocus();
    this.game.ui.renderStatus?.();
  }

  clear(all = true) {
    for (const v of this.visitors.values()) v.dispose();
    this.visitors.clear();
    for (const v of this.leaving) v.dispose();
    this.leaving = [];
    this.session = null;
    if (all) this.cutVisuals.clear();
  }

  update(dt) {
    const g = this.game;
    const p = this.profile;
    if (!p || !g.running) return;
    const ctx = { playerPos: g.player.position, night: false, entities: [], game: g };
    for (const v of this.visitors.values()) v.update(dt, ctx);
    for (const v of [...this.leaving]) v.update(dt, ctx);
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
      if (this.session?.client?.id === c.id) this.session = null;
      this.sendAway(c);
    }
    // Arrivées : aux heures d'ouverture, si on a le niveau et de la place (pas pendant une fenêtre ou un mini-jeu).
    if (!st.nextClientAt) st.nextClientAt = p.clock + 20;
    const hour = hourOf(p.clock);
    if (canGroom(p) && canWelcome(p) && p.clock >= st.nextClientAt && hour >= OPEN_HOURS[0] && hour < OPEN_HOURS[1] && !g.ui.isBlocking?.()) {
      st.nextClientAt = p.clock + clientInterval(p) * 60 * (0.7 + Math.random() * 0.6);
      this.arrive(newClient(p, { day }));
    }
  }

  /** Un client arrive à pied par la route. instant : déjà devant le salon (tests). */
  arrive(client, instant = false) {
    const r = addClient(this.profile, client);
    if (!r.ok) return null;
    const sp = this.spots();
    const i = [...this.visitors.values()].filter((v) => v.state !== 'groomed').length;
    const wait = sp.wait[i % sp.wait.length];
    const v = new SalonVisitor(this.game, client, instant ? wait : sp.road[0]);
    this.visitors.set(client.id, v);
    if (instant) this.settle(v);
    else v.walk([...sp.road.slice(1), wait], () => this.settle(v));
    this.game.ui.toast(t('grm_arrives', { owner: client.owner.name, name: client.animal.name }), 6000);
    this.game.emit('groomerClient', client);
    this.game.ui.renderStatus?.();
    return client;
  }

  /** Pour tester : fait venir tout de suite un client (demande et espèce au choix), déjà devant le salon. */
  force(requestId = null, species = null, instant = true) {
    if (!this.salon()) return null;
    const client = newClient(this.profile, { requestId, species, day: dayOf(this.profile.clock) });
    return this.arrive(client, instant);
  }

  /** Le client (et son animal) repart par la route, puis disparaît. */
  sendAway(client) {
    const v = this.visitors.get(client.id);
    if (!v) return;
    this.visitors.delete(client.id);
    v.table(null);
    v.state = 'leaving';
    v.npc.bubble.visible = false;
    v.npc.waving = false;
    this.leaving.push(v);
    const sp = this.spots();
    const road = sp ? [...sp.road].reverse() : [GATE];
    v.walk(road, () => {
      const k = this.leaving.indexOf(v);
      if (k >= 0) this.leaving.splice(k, 1);
      v.dispose();
    });
    this.refreshFocus();
    this.game.ui.renderStatus?.();
  }

  /** Toucher un client ou son animal : on va au salon. */
  onTap(raycaster) {
    if (!this.visitors.size) return false;
    const roots = [...this.visitors.values()].flatMap((v) => [v.npc.root, v.e.root]);
    const hit = raycaster.intersectObjects(roots, true)[0];
    if (!hit) return false;
    const door = this.door();
    if (door) this.game.walkTo(new THREE.Vector3(door.x, 0, door.z), 1.4, () => this.open());
    return true;
  }

  open() {
    openSalon(this.game.ui);
  }

  /** Texte du bouton d'action devant la porte : « Entrer au salon (2 clients) ». */
  focusLabel() {
    const n = this.profile ? waitingClients(this.profile).filter((c) => this.visitors.get(c.id)?.state === 'waiting').length : 0;
    return n ? t('grm_enterN', { n }) : t('grm_enter');
  }

  /** Le bouton d'action devant la porte suit le nombre de clients qui attendent. */
  refreshFocus() {
    const f = this.game.focus;
    if (f?.kind === 'salon') this.game.ui.setFocus(f);
  }

  /** Puce du bandeau : des clients attendent au salon. */
  statusChips(chip) {
    const p = this.profile;
    if (!p || !this.salon()) return [];
    const n = waitingClients(p).filter((c) => this.visitors.get(c.id)?.state === 'waiting').length;
    if (!n) return [];
    return [chip(t('grm_chip', { n }), t('cl_go'), () => this.goToSalon())];
  }

  /** On marche jusqu'à la porte du salon, puis il s'ouvre. */
  goToSalon(then = () => this.open()) {
    const d = this.door();
    if (!d) return;
    this.game.walkTo(new THREE.Vector3(d.x, 0, d.z), 1.4, then);
  }

  /**
   * « 👉 Montre-moi » du carnet (💼 Métiers) : le repère sur le salon. S'il n'y en a pas encore,
   * la vue construction s'ouvre sur les bâtiments, pour le poser.
   */
  showMe() {
    const g = this.game;
    const d = this.door();
    if (!d) {
      g.ui.toast(t('grm_buildSalon'), 7000);
      if (g.isHome && g.mgmt) {
        g.mgmt.openBuild();
        openCatalogue(g.ui, 'building');
      }
      return;
    }
    g.marker.show(new THREE.Vector3(d.x, 0, d.z), { hideNear: 2.5 });
    g.ui.toast(t('grm_showSalon'), 5000);
  }

  // ---------------------------------------------------------------- séance

  accept(client) {
    const r = acceptClient(this.profile, client);
    if (!r.ok) return r;
    this.session = { client, animal: client.animal, own: false, done: [], style: client.style };
    const v = this.visitors.get(client.id);
    const sp = this.spots();
    if (v && sp) {
      v.state = 'groomed';
      v.npc.bubble.visible = false;
      v.npc.waving = false;
      v.table(this.spotFor(client));
      v.walk([sp.owner], () => v.npc.lookAt(sp.look.x, sp.look.z));
    }
    this.refreshFocus();
    noteCareer(this.game, 'welcome'); // carnet de 💼 Métiers
    this.game.ui.renderStatus?.();
    this.game.save();
    return r;
  }

  refuse(client) {
    if (this.session?.client === client) this.session = null;
    dismissClient(this.profile, client, true);
    this.sendAway(client);
    this.game.save();
  }

  /** Toiletter un de ses animaux (gratuit). */
  startOwn(a) {
    this.session = { client: null, animal: a, own: true, done: [], style: null };
    return this.session;
  }

  /** Le client repart, tout content (après le résultat). */
  release(client) {
    if (this.session?.client === client) this.session = null;
    const v = this.visitors.get(client.id);
    if (v) {
      v.e.applyGear(); // nœud, bandana…
      v.e.emit('💖', 3);
    }
    this.sendAway(client);
    this.game.save();
  }

  endOwn() {
    this.session = null;
  }

  /** L'entité 3D de l'animal d'un client (pour les petits effets pendant le toilettage). */
  entityOf(client) {
    return this.visitors.get(client?.id)?.e ?? null;
  }

  /** Ce client est-il en train de patienter devant le salon ? */
  isHere(client) {
    return this.visitors.has(client.id);
  }

  current() {
    return this.profile ? currentClient(this.profile) : null;
  }

  // ---------------------------------------------------------------- aspect « fraîchement coupé »

  /** Animaux fraîchement coupés (les miens et ceux des clients) : poil plus court, crinière de lion… */
  refreshCutVisuals() {
    const g = this.game;
    if (!this.profile) return;
    const day = dayOf(this.profile.clock);
    const all = [...g.entities.values(), ...[...this.visitors.values()].map((v) => v.e)];
    for (const e of all) {
      const a = e.data;
      const style = cutFresh(a, day) ? a.grooming.style : null;
      const cur = this.cutVisuals.get(e);
      if ((cur?.style ?? null) === style && cur?.model === e.model) continue;
      if (cur && cur.model === e.model) for (const [o, s] of cur.saved) o.scale.copy(s);
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
        if (['court', 'tonte', 'concours'].includes(style)) furs.forEach((o) => sc(o, 0.95, 0.96, 1));
        else if (style === 'long') furs.forEach((o) => sc(o, 1.04, 1.03, 1));
        else if (style === 'lion') { furs.forEach((o) => sc(o, 0.94, 0.95, 1)); sc(md.neck, 1.14, 1.05, 1.14); }
        else if (style === 'caniche') { furs.forEach((o) => sc(o, 0.93, 0.95, 1)); sc(md.tail, 1.25, 1.25, 1.25); }
      } catch { /* modèle différent : pas d'aspect particulier */ }
      this.cutVisuals.set(e, { style, saved, model: e.model });
    }
    const alive = new Set(all);
    for (const e of [...this.cutVisuals.keys()]) if (!alive.has(e)) this.cutVisuals.delete(e);
  }
}

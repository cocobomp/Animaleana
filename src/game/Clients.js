// Clients et métiers dans le monde 3D : le visiteur qui arrive avec son animal, la bulle 💬,
// la discussion (Accepter / Refuser), le propriétaire qui revient chercher son animal, les visites
// « auto » (le vétérinaire du village) tant qu'on n'a pas appris le métier, et le carnet du métier
// (« Montre-moi »). La logique est dans src/sim/clients.js et src/sim/careers.js, l'interface dans
// src/ui/clients.js et src/ui/careers.js.
//
// Le jeu n'appelle qu'une chose à chaque image : game.clients.update(dt).
// Pour tester dans la console : animaleana.game.clients.force('pension') / force('vet') / force('autoVet'),
//   .startCareer('vet'), puis .forcePickup() pour faire revenir les propriétaires.

import * as THREE from 'three';
import { buildAvatar, animateAvatarWalk, updateAvatarLife } from './models/avatarModel.js';
import { disposeModel } from './models/animalModel.js';
import { signTexture, emojiTexture } from './textures.js';
import { navTarget } from './nav.js';
import { AnimalEntity } from './AnimalEntity.js';
import {
  clientState, shouldVisitorArrive, scheduleNextVisit, createVisit, setVisitor, acceptVisit, refuseVisit,
  visitorExpired, clearVisitor, clientAnimals, isPickupDue, completeClient, advanceClientDays, noteCure,
  noteClientCare, pickVisitKind,
} from '../sim/clients.js';
import {
  CAREERS, CAREER_IDS, RANKS, startCareer, isStarted, shouldPropose, markProposed, hintOnce, noteAction, nextAction, addCareerXp,
} from '../sim/careers.js';
import { OBJECTIVES } from '../sim/objectives.js';
import { addStat } from '../sim/profile.js';
import { showRequest, showResult } from '../ui/clients.js';
import { showCareerOffer } from '../ui/careers.js';
import { t, ta } from '../i18n.js';

// Le chemin des visiteurs : ils arrivent par la route à l'est, passent entre le refuge et le
// vétérinaire, et s'arrêtent dans la cour, près de la maison.
const GATE = { x: 28, z: 1.2 };
const WAY = { x: 13, z: 1.2 };
const MEET = { x: 5, z: -2.5 };
const CLINIC = { x: 11.3, z: 9 }; // devant la porte du vétérinaire du village
const AUTO_VET_HOURS = 1.5; // temps passé chez le vétérinaire du village

const SKINS = [0xf5d3b8, 0xe8b796, 0xd09a72, 0xa9714b, 0x7a4b2e, 0x5a3a24];
const HAIRS = [0x1b1411, 0x4a2f1d, 0x8a5a2b, 0xd2a557, 0xa63a1f, 0x9a9a9a];
const TOPS = [0xd9643a, 0x3f7cc4, 0x7a4b8f, 0x2f8f6b, 0xc43f6a, 0xe0b030];

/** Un visiteur (propriétaire d'un animal) qui marche vers un endroit. */
class VisitorEntity {
  constructor(game, owner) {
    this.game = game;
    this.owner = owner;
    const seed = owner.seed ?? 0;
    const female = owner.sex === 'f';
    const styles = female ? ['ponytail', 'long', 'curly', 'bun', 'braid'] : ['short', 'curly', 'bald'];
    this.avatar = buildAvatar({
      skin: SKINS[seed % SKINS.length],
      hair: HAIRS[Math.floor(seed / 7) % HAIRS.length],
      hairStyle: styles[seed % styles.length],
      top: TOPS[Math.floor(seed / 3) % TOPS.length],
      bottom: seed % 2 ? 0x5a4a6a : 0x3a3f4a,
      shoes: 0x3b2a20,
      hat: !female && seed % 3 === 0,
    });
    this.lifeOpts = { speed: 0, busy: false }; // options de updateAvatarLife, réutilisées
    this.root = new THREE.Group();
    this.root.userData.visitor = this;
    this.root.add(this.avatar.root);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture(owner.name, '#7a4b8f', '#ffffff', '👋'), depthTest: false, transparent: true }));
    this.tag.position.y = 2.15;
    this.tag.scale.set(1.8, 0.45, 1);
    this.tag.renderOrder = 10;
    this.root.add(this.tag);
    // Bulle 💬 : « viens me parler ».
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('💬'), depthTest: false, transparent: true }));
    this.bubble.position.y = 2.75;
    this.bubble.scale.setScalar(0.9);
    this.bubble.renderOrder = 11;
    this.bubble.visible = false;
    this.root.add(this.bubble);
    this.path = [];
    this.onArrive = null;
    this.heading = Math.PI;
    this.speed = 0;
    this.phase = 0;
    this.time = Math.random() * 10;
    this.waving = false;
    game.scene.add(this.root);
  }

  get position() {
    return this.root.position;
  }

  place(x, z) {
    this.root.position.set(x, this.game.world.heightAt(x, z), z);
  }

  /** Marche d'étape en étape, puis appelle onArrive. */
  walk(path, onArrive = null) {
    this.path = path.map((p) => new THREE.Vector3(p.x, 0, p.z));
    this.onArrive = onArrive;
  }

  lookAt(x, z) {
    const p = this.root.position;
    this.heading = Math.atan2(x - p.x, z - p.z);
  }

  update(dt) {
    this.time += dt;
    const p = this.root.position;
    let targetSpeed = 0;
    if (this.path.length) {
      const goal = this.path[0];
      const d = Math.hypot(goal.x - p.x, goal.z - p.z);
      if (d < 0.7) {
        this.path.shift();
        if (!this.path.length) {
          const fn = this.onArrive;
          this.onArrive = null;
          fn?.();
        }
      } else {
        targetSpeed = d > 10 ? 3.6 : 2.2;
        const way = navTarget(p, goal);
        const want = Math.atan2(way.x - p.x, way.z - p.z);
        let diff = want - this.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
      }
    }
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 6);
    if (this.speed > 0.02) {
      p.x += Math.sin(this.heading) * this.speed * dt;
      p.z += Math.cos(this.heading) * this.speed * dt;
      this.game.world.resolveCollisions(p, 0.35);
    }
    p.y = this.game.world.heightAt(p.x, p.z);
    this.root.rotation.y = this.heading;
    // Marche articulée, puis la vie (respiration, regard, gestes d'attente, chacun à son rythme).
    this.phase += dt * this.speed * 2.2;
    const wave = this.waving && this.speed < 0.3;
    animateAvatarWalk(this.avatar, this.phase, this.speed);
    const o = this.lifeOpts;
    o.speed = this.speed;
    o.busy = wave;
    updateAvatarLife(this.avatar, dt, o);
    if (wave) {
      // Coucou : bras levé, la main se balance.
      this.avatar.arms[0].rotation.set(0, 0, 2.5 + Math.sin(this.time * 6) * 0.35);
      this.avatar.elbows[0].rotation.set(-0.35, 0, 0);
    }
    if (this.bubble.visible) this.bubble.position.y = 2.75 + Math.sin(this.time * 3) * 0.08;
    this.tag.visible = p.distanceTo(this.game.player.position) < 18;
  }

  dispose() {
    this.game.scene.remove(this.root);
    disposeModel(this.avatar.root);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
    this.bubble.material.dispose();
  }
}

export class Clients {
  constructor(game) {
    this.game = game;
    this.acc = 0;
    this.worldGroup = null;
    this.profileRef = null;
    this.visitor = null; // { visit, npc, e } : le visiteur qui attend une réponse (ou visite auto)
    this.leaving = []; // { npc, e } : ceux qui s'en vont
    this.pickups = new Map(); // animalId -> { npc, ready, done }
    this.pendingResult = null;
    this.asked = false;
    this.unsub = [];
    // « 👉 Montre-moi » des métiers sans visiteurs (cavalier de concours…) : id -> (action, def) => void.
    // Un module s'y inscrit avec registerGuide (src/game/CompetitionVenue.js pour 'rider').
    this.guides = {};
  }

  /** Inscrit le guide « 👉 Montre-moi » d'un métier qui ne passe pas par les visiteurs. */
  registerGuide(id, fn) {
    this.guides[id] = fn;
  }

  // ------------------------------------------------------------ boucle

  update(dt) {
    const g = this.game;
    if (!g.running || !g.profile) {
      this.clearAll();
      return;
    }
    if (g.world.group !== this.worldGroup || g.profile !== this.profileRef) this.sync();
    const ctx = { playerPos: g.player.position, night: false, entities: [], game: g };
    if (this.visitor) {
      this.visitor.npc.update(dt);
      if (this.visitor.e) this.follow(this.visitor.e, this.visitor.npc, dt, ctx);
    }
    for (const x of this.pickups.values()) x.npc.update(dt);
    for (const l of [...this.leaving]) {
      l.npc.update(dt);
      if (l.e) this.follow(l.e, l.npc, dt, ctx);
    }
    this.acc += dt;
    if (this.acc >= 0.5) {
      this.acc = 0;
      this.tick();
    }
  }

  /** L'animal du visiteur trotte à côté de lui. */
  follow(e, npc, dt, ctx) {
    const d = Math.hypot(e.position.x - npc.position.x, e.position.z - npc.position.z);
    e.herdCtrl = d > 2.4 ? { pusher: true, target: npc.position } : null;
    e.update(dt, ctx);
  }

  /** Nouveau lieu ou nouveau profil : on repart de zéro (et on remet le visiteur s'il y en avait un). */
  sync() {
    const g = this.game;
    this.clearNpcs();
    this.worldGroup = g.world.group;
    this.profileRef = g.profile;
    if (!this.unsub.length) {
      // Le carnet du métier se coche quand on soigne un animal confié ou qu'on ouvre l'examen du vétérinaire.
      this.unsub.push(g.on('care', ({ a, action }) => this.onCare(a, action)));
      this.unsub.push(g.on('panel', (kind) => { if (kind === 'vetExam') this.onVetExam(); }));
      this.unsub.push(g.on('building', (kind) => this.onBuilding(kind)));
    }
    const st = clientState(g.profile);
    if (st.visitor && g.isHome) {
      if (st.visitor.auto) st.visitor = null; // une visite auto ne survit pas à un rechargement
      else this.spawnVisitor(st.visitor, true);
    }
  }

  clearNpcs() {
    if (this.visitor) {
      this.visitor.npc.dispose();
      this.visitor.e?.dispose();
      this.visitor = null;
    }
    for (const x of this.pickups.values()) x.npc.dispose();
    this.pickups.clear();
    for (const l of this.leaving) {
      l.npc.dispose();
      l.e?.dispose();
    }
    this.leaving = [];
    this.asked = false;
  }

  clearAll() {
    if (this.visitor || this.pickups.size || this.leaving.length) this.clearNpcs();
    this.profileRef = null;
    this.pendingResult = null;
  }

  /** Du temps a été sauté (sommeil, voyage, ⏩) : chaque journée des animaux confiés est notée. */
  onTimeSkipped() {
    const g = this.game;
    if (!g.profile) return;
    advanceClientDays(g.profile, g.day);
    for (const a of clientAnimals(g.profile)) if (noteCure(a, g.day)) this.noteCareer(a.client.kind, 'treat');
  }

  tick() {
    const g = this.game;
    const p = g.profile;
    const st = clientState(p);
    const day = g.day;
    this.onTimeSkipped();
    if (!st.nextVisitDay) scheduleNextVisit(p, day);

    if (this.visitor) {
      if (!this.visitor.visit.auto && visitorExpired(p, p.clock)) this.visitorLeaves(false);
      else this.proximity();
    } else if (!st.visitor && shouldVisitorArrive(p, { day, hour: g.hour, isHome: g.isHome }) && !g.ui.isBlocking()) {
      this.arrive();
    }
    // Les propriétaires reviennent chercher leur animal (seulement quand on est à la maison).
    if (g.isHome) {
      for (const a of clientAnimals(p)) {
        if (isPickupDue(a, day) && a.location === p.place && !this.pickups.has(a.id)) this.startPickup(a);
      }
      for (const [id, x] of this.pickups) {
        if (x.ready && !x.done && !g.ui.isBlocking()) {
          const a = p.animals.find((y) => y.id === id);
          if (a) this.finishPickup(a, x);
          else this.pickups.delete(id);
        }
      }
    }
    this.maybeProposeCareer();
    this.showPendingResult();
    g.ui.renderStatus();
  }

  // ------------------------------------------------------------ arrivée du visiteur

  /** Les espèces qu'on peut accueillir ici (chevaux : s'il y a une écurie ou un paddock). */
  speciesHere() {
    const w = this.game.world;
    const list = ['dog', 'cat', 'rabbit'];
    if (w.interactables.some((i) => i.kind === 'stable' || i.kind === 'paddock') || w.stallOf) list.push('horse');
    if (w.interactables.some((i) => i.kind === 'pen')) list.push('sheep', 'goat', 'cow');
    return list;
  }

  arrive(forcedKind = null, instant = false) {
    const g = this.game;
    const p = g.profile;
    const kind = forcedKind ?? pickVisitKind(p);
    // Visite auto « pension » : une seule fois, juste pour donner l'idée.
    if (kind === 'autoPension' && !hintOnce(p, 'autoPension')) {
      scheduleNextVisit(p, g.day);
      return null;
    }
    const visit = createVisit(p, { day: g.day, clock: p.clock, place: p.place, species: this.speciesHere() }, Math.random, kind);
    setVisitor(p, visit);
    scheduleNextVisit(p, g.day);
    this.spawnVisitor(visit, instant);
    if (visit.auto) {
      g.ui.toast(visit.kind === 'autoVet' ? t('cl_autoVet', { owner: visit.owner.name, name: visit.animal.name }) : t('cl_autoPension', { owner: visit.owner.name, name: visit.animal.name }), 7000);
    } else {
      g.ui.toast(t('cl_arrive', { owner: visit.owner.name, name: visit.animal.name, kind: t(`cl_kind_${visit.career}`) }), 7000);
    }
    g.emit('clientArrived', visit);
    return visit;
  }

  spawnVisitor(visit, instant) {
    const g = this.game;
    const npc = new VisitorEntity(g, visit.owner);
    const start = instant ? { x: WAY.x - 3, z: WAY.z } : GATE;
    npc.place(start.x, start.z);
    const e = new AnimalEntity(visit.animal, g.world, g.scene);
    e.position.set(start.x + 1, 0, start.z + 1);
    e.snap();
    // L'animal reste près de son maître (sa « zone de vie » suit le visiteur).
    const npcPos = npc.position;
    Object.defineProperty(e, 'home', { configurable: true, get: () => ({ x: npcPos.x, z: npcPos.z, r: 1.6 }) });
    this.visitor = { visit, npc, e };
    this.asked = false;
    if (visit.kind === 'autoVet') {
      // Le village s'en occupe : le visiteur va à la clinique, y reste un moment, puis repart.
      npc.walk([WAY, CLINIC], () => {
        npc.lookAt(CLINIC.x + 3, CLINIC.z);
        this.visitor.leaveAt = g.profile.clock + AUTO_VET_HOURS * 60;
        this.visitor.autoArrived = true;
      });
    } else if (visit.kind === 'autoPension') {
      npc.walk([WAY, MEET], () => {
        npc.lookAt(g.player.position.x, g.player.position.z);
        npc.waving = true;
        this.visitor.leaveAt = g.profile.clock + 45;
        this.visitor.autoArrived = true;
      });
    } else {
      npc.walk([WAY, MEET], () => {
        npc.bubble.visible = true;
        npc.waving = true;
        npc.lookAt(g.player.position.x, g.player.position.z);
      });
    }
  }

  /** Tout près du visiteur : on lui parle. Les visites auto se terminent toutes seules. */
  proximity() {
    const g = this.game;
    const v = this.visitor;
    if (v.visit.auto) {
      if (v.autoArrived && g.profile.clock >= v.leaveAt) {
        if (v.visit.kind === 'autoVet') {
          v.visit.animal.sick = null;
          g.ui.toast(t('cl_autoVetCured', { name: v.visit.animal.name }), 5000);
          if (!isStarted(g.profile, 'vet') && hintOnce(g.profile, 'autoVetHint')) g.ui.toast(t('cl_autoVetHint', { owner: v.visit.owner.name }), 6000);
        }
        clearVisitor(g.profile);
        this.visitorLeaves(true);
      }
      return;
    }
    const pp = g.player.position;
    const d = Math.hypot(v.npc.position.x - pp.x, v.npc.position.z - pp.z);
    if (d > 5) this.asked = false;
    if (d < 2.4 && !this.asked && v.npc.bubble.visible && !g.ui.isBlocking() && !g.player.auto) {
      this.asked = true;
      this.talk();
    }
  }

  /** Pour le bouton d'action (E) : le visiteur à portée. */
  focusNear(pp) {
    const v = this.visitor;
    if (!v || v.visit.auto || !v.npc.bubble.visible) return null;
    const d = Math.hypot(v.npc.position.x - pp.x, v.npc.position.z - pp.z);
    return d < 2.8 ? { kind: 'client', visitor: v, name: v.visit.owner.name } : null;
  }

  /** Toucher le visiteur (ou son animal) : on va lui parler. */
  onTap(raycaster) {
    const v = this.visitor;
    if (!v || v.visit.auto) return false;
    const hit = raycaster.intersectObjects([v.npc.root, v.e.root], true)[0];
    if (!hit) return false;
    this.goToVisitor();
    return true;
  }

  goToVisitor() {
    const v = this.visitor;
    if (!v) return;
    this.game.walkTo(v.npc.position.clone(), 1.8, () => this.talk());
  }

  talk() {
    const g = this.game;
    const v = this.visitor;
    if (!v || v.visit.auto || g.ui.modalOpen) return;
    v.npc.lookAt(g.player.position.x, g.player.position.z);
    showRequest(g.ui, v.visit, {
      accept: () => this.accept(),
      refuse: () => this.refuse(),
      later: () => { this.asked = true; },
    });
    g.emit('clientTalk', v.visit);
  }

  accept() {
    const g = this.game;
    const v = this.visitor;
    if (!v) return;
    const r = acceptVisit(g.profile, v.visit, g.day);
    if (!r.ok) {
      g.ui.toast(r.reason === 'full' ? t('cl_full', { n: r.n }) : t('cl_needCareer', { career: t(`career_${v.visit.career}`) }), 5000);
      return;
    }
    const a = r.animal;
    const e = v.e;
    delete e.home; // il retrouve sa zone de vie normale (niche, perron, paddock…)
    e.herdCtrl = null;
    e.state = 'walk';
    e.pickWanderTarget();
    e.timer = 20;
    g.entities.set(a.id, e);
    e.emit('❤️', 4);
    addStat(g.profile, 'clientsAccepted');
    this.visitor = null;
    v.npc.bubble.visible = false;
    v.npc.waving = false;
    this.leaving.push({ npc: v.npc, e: null });
    v.npc.walk([WAY, GATE], () => this.removeLeaving(v.npc));
    g.ui.toast(ta('cl_accepted', a, { n: v.visit.days }), 6000);
    if (r.firstWelcome) this.noteCareer(v.visit.career, 'welcome', true);
    g.ui.refresh();
    g.save();
    g.emit('clientAccepted', a);
  }

  refuse() {
    const g = this.game;
    const v = this.visitor;
    if (!v) return;
    const r = refuseVisit(g.profile, v.visit);
    g.ui.toast(t('cl_refused'), 4000);
    if (r.dip) g.ui.toast(t('cl_refusedDip'), 6000);
    this.visitorLeaves(true);
  }

  /** Le visiteur s'en va avec son animal (answered = false : il n'a pas eu de réponse). */
  visitorLeaves(answered) {
    const g = this.game;
    const v = this.visitor;
    if (!v) return;
    if (!answered) {
      clearVisitor(g.profile);
      g.ui.toast(t('cl_left', { owner: v.visit.owner.name, g: v.visit.owner.sex }), 5000);
    }
    this.visitor = null;
    v.npc.bubble.visible = false;
    v.npc.waving = false;
    this.leaving.push({ npc: v.npc, e: v.e });
    v.npc.walk([WAY, GATE], () => this.removeLeaving(v.npc));
    g.ui.renderStatus();
  }

  removeLeaving(npc) {
    const i = this.leaving.findIndex((l) => l.npc === npc);
    if (i < 0) return;
    const [l] = this.leaving.splice(i, 1);
    l.npc.dispose();
    l.e?.dispose();
  }

  // ------------------------------------------------------------ retour du propriétaire

  startPickup(a) {
    const g = this.game;
    const c = a.client;
    const npc = new VisitorEntity(g, { name: c.ownerName, sex: c.ownerSex, seed: c.ownerSeed ?? 0 });
    npc.place(GATE.x, GATE.z);
    const entry = { npc, ready: false, done: false };
    this.pickups.set(a.id, entry);
    g.ui.toast(t('cl_pickupSoon', { owner: c.ownerName, name: a.name }), 5000);
    npc.walk([WAY, MEET], () => {
      entry.ready = true;
      npc.waving = true;
      npc.lookAt(g.player.position.x, g.player.position.z);
    });
  }

  finishPickup(a, entry) {
    const g = this.game;
    entry.done = true;
    const e = g.entities.get(a.id);
    if (e && g.player.mount === e) g.dismount();
    const res = completeClient(g.profile, a, g.day);
    if (!res.upset) g.xp('client');
    g.ui.closePanelFor(a.id);
    // L'animal rejoint son maître, puis ils s'en vont ensemble.
    if (e) {
      g.entities.delete(a.id);
      if (e.inside) e.leaveHouse();
      a.housed = false;
      a.following = false;
      a.leashed = false;
      a.stalled = false;
      delete e.home;
      const npcPos = entry.npc.position;
      Object.defineProperty(e, 'home', { configurable: true, get: () => ({ x: npcPos.x, z: npcPos.z, r: 1.6 }) });
      e.emit('❤️', 3);
    }
    this.pickups.delete(a.id);
    this.pendingResult = { res, npc: entry.npc, e };
    this.showPendingResult();
    g.ui.refresh();
    g.save();
    g.emit('clientDone', res);
  }

  /** L'écran de fin attend qu'aucune autre fenêtre ne soit ouverte. */
  showPendingResult() {
    const r = this.pendingResult;
    if (!r || this.game.ui.modalOpen) return;
    this.pendingResult = null;
    const g = this.game;
    showResult(g.ui, r.res, () => {
      g.ui.toast(t('cl_leaving', { name: r.res.name, owner: r.res.ownerName }), 5000);
      if (r.res.rankUp !== null) g.ui.toast(t('ca_rankUpToast', { rank: t(`ca_rank_${RANKS[r.res.rankUp]}`), career: t(`career_${r.res.kind}`) }), 7000);
      r.npc.waving = false;
      this.leaving.push({ npc: r.npc, e: r.e });
      r.npc.walk([WAY, GATE], () => this.removeLeaving(r.npc));
    });
  }

  /** Puces du bandeau d'état : visiteur qui attend, nombre de clients. */
  statusChips(chip) {
    const g = this.game;
    const out = [];
    const v = this.visitor;
    if (v && !v.visit.auto && v.npc.bubble.visible) {
      out.push(chip(t('cl_waiting', { owner: v.visit.owner.name, name: v.visit.animal.name }), t('cl_go'), () => this.goToVisitor()));
    }
    const n = clientAnimals(g.profile).length;
    if (n) out.push(chip(t('cl_hudChip', { n }), t('cl_see'), () => g.ui.openJournal('clients')));
    return out;
  }

  // ------------------------------------------------------------ métiers

  /** On propose un métier quand on est prêt (niveau, quêtes) — au plus une proposition par jour. */
  maybeProposeCareer(building = null) {
    const g = this.game;
    const p = g.profile;
    if (g.ui.isBlocking() || this.visitor?.visit && !this.visitor.visit.auto) return;
    // Pas au milieu d'une activité (reprise de dressage, parcours, barrage…) : la fenêtre cachait la carrière
    // et mettait les résultats en attente. Elle reviendra plus tard.
    if (g.activities?.active) return;
    const ctx = { level: g.level, day: g.day, objectives: OBJECTIVES, building };
    const id = CAREER_IDS.find((k) => shouldPropose(p, k, ctx));
    if (!id) return;
    markProposed(p, id, g.day);
    showCareerOffer(g.ui, id, { yes: () => this.startCareer(id), later: () => {} });
  }

  onBuilding(kind) {
    if (CAREER_IDS.some((id) => CAREERS[id].building === kind)) this.maybeProposeCareer(kind);
  }

  startCareer(id) {
    const g = this.game;
    const r = startCareer(g.profile, id, g.day, { level: g.level });
    if (!r.ok) {
      g.ui.toast(r.reason === 'level' ? t('lockedLevel', { n: r.n }) : t('alreadyOwned'));
      return r;
    }
    // Un premier client arrive vite pour apprendre (sauf pour un métier sans visiteurs).
    if (CAREERS[id].clients !== false) {
      const st = clientState(g.profile);
      st.nextVisitDay = Math.min(st.nextVisitDay || g.day, g.day);
      st.nextVisitHour = Math.min(st.nextVisitHour, Math.max(8, Math.ceil(g.hour)));
    }
    g.ui.toast(t('ca_started', { career: t(`career_${id}`) }), 7000);
    g.ui.renderStatus();
    g.save();
    g.emit('careerStarted', id);
    return r;
  }

  /** Une action du carnet vient d'être faite (first = déjà vérifié par la logique). */
  noteCareer(id, action, already = false) {
    const g = this.game;
    const r = already ? { first: true, rankUp: null } : noteAction(g.profile, id, action);
    if (!r?.first) return;
    g.ui.toast(t('ca_actionDone', { career: t(`career_${id}`), action: t(`ca_${id}_${action}`) }), 5000);
    if (r.rankUp !== null) g.ui.toast(t('ca_rankUpToast', { rank: t(`ca_rank_${RANKS[r.rankUp]}`), career: t(`career_${id}`) }), 7000);
    g.ui.renderStatus();
  }

  /** De l'expérience de métier pour un travail réussi (un concours…), avec la bulle du nouveau rang. */
  careerXp(id, n) {
    const r = addCareerXp(this.game.profile, id, n);
    if (r?.rankUp !== undefined && r?.rankUp !== null) this.rankUpToast(id, r.rankUp);
    return r;
  }

  rankUpToast(id, rank) {
    const g = this.game;
    g.ui.toast(t('ca_rankUpToast', { rank: t(`ca_rank_${RANKS[rank]}`), career: t(`career_${id}`) }), 7000);
    g.ui.renderStatus();
  }

  onCare(a, action) {
    if (!a?.client) return;
    const step = noteClientCare(this.game.profile, a, action);
    if (step) this.noteCareer(a.client.kind, step, true);
  }

  onVetExam() {
    const g = this.game;
    const id = g.ui.panel?.animalId;
    const a = id && g.profile.animals.find((x) => x.id === id);
    if (a?.client?.kind === 'vet') this.noteCareer('vet', 'exam');
  }

  /** « 👉 Montre-moi » : la flèche jaune sur le visiteur, l'animal confié ou le bâtiment du métier. */
  showMe(id, action) {
    const g = this.game;
    const p = g.profile;
    const def = CAREERS[id].actions.find((x) => x.id === action);
    if (!def) return;
    if (this.guides[id]) return this.guides[id](action, def); // métier sans visiteurs : son propre guide
    const client = clientAnimals(p).find((a) => a.client.kind === id);
    if (def.where === 'visitor') {
      if (this.visitor && !this.visitor.visit.auto) {
        g.marker.show(this.visitor.npc, { hideNear: 2.5 });
        g.ui.toast(t('ca_show_visitor'), 5000);
      } else if (action === 'return' && client) {
        g.marker.show(g.entities.get(client.id) ?? null, { hideNear: 2.5 });
        g.ui.toast(t('ca_show_animal', { name: client.name, g: client.sex }), 5000);
      } else {
        g.marker.show(new THREE.Vector3(MEET.x, 0, MEET.z), { hideNear: 3 });
        g.ui.toast(t('ca_show_wait'), 6000);
      }
      return;
    }
    if (!client) {
      g.ui.toast(t('ca_show_noAnimal'), 5000);
      g.marker.show(new THREE.Vector3(MEET.x, 0, MEET.z), { hideNear: 3 });
      return;
    }
    const e = g.entities.get(client.id);
    g.marker.show(e ?? null, { hideNear: 2.5 });
    g.ui.toast(t('ca_show_animal', { name: client.name, g: client.sex }), 5000);
  }

  // ------------------------------------------------------------ pour tester

  /** Fait venir un visiteur tout de suite ('pension', 'vet', 'autoVet', 'autoPension'). */
  force(kind = 'pension') {
    if (this.visitor) {
      clearVisitor(this.game.profile);
      this.visitorLeaves(true);
    }
    return this.arrive(kind, true);
  }

  /** Les propriétaires reviennent tout de suite chercher leurs animaux. */
  forcePickup() {
    for (const a of clientAnimals(this.game.profile)) a.client.until = Math.min(a.client.until, this.game.day);
    this.tick();
  }

  get nextStep() {
    const id = this.game.profile?.careers?.active;
    return id ? nextAction(this.game.profile, id) : null;
  }
}


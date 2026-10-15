// Éducateur canin (3D) : le maître arrive à la ferme avec son chien, on discute, le chien reste,
// on fait les séances (mini-jeux, ou la vraie promenade en laisse), puis le maître revient le chercher.
// Logique pure : src/sim/dogTrainer.js. Interface : src/ui/dogTrainer.js.

import * as THREE from 'three';
import { t } from '../i18n.js';
import { buildAvatar } from './models/avatarModel.js';
import { disposeModel } from './models/animalModel.js';
import { navTarget } from './nav.js';
import { canLeash } from '../sim/gear.js';
import { addStat } from '../sim/profile.js';
import {
  PROBLEMS, COACHINGS, SESSION_MINUTES, makeClientRequest, acceptClient, canSession, applySession, readyForDelivery,
  finishClient, shouldClientArrive, dogTrainerOf, dogTrainerRank, clientDogs, isFixed,
} from '../sim/dogTrainer.js';
import { openDogTrainerChat, showDogTrainerTutorial, showDelivery, showSessionResult, startLeashWalkOverlay, runSessionGame } from '../ui/dogTrainer.js';

const SKINS = [0xf5d3b8, 0xe8b796, 0xd09a72, 0xa9714b, 0x7a4b2e];
const HAIRS = [0x1b1411, 0x4a2f1d, 0x8a5a2b, 0xd2a557, 0x9a9a9a];
const TOPS = [0xc94f4f, 0x3f7cc4, 0x7a5fa8, 0xe0a030, 0x3a9a6a];

function bubbleTexture(text) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 28px system-ui, sans-serif';
  const w = Math.min(250, ctx.measureText(text).width + 28);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.roundRect((256 - w) / 2, 10, w, 44, 22);
  ctx.fill();
  ctx.fillStyle = '#23302a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 33);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Le maître d'un chien : un personnage qui marche jusqu'au point de rendez-vous, puis attend. */
class VisitorEntity {
  constructor(req, world, scene, from) {
    this.req = req;
    this.world = world;
    this.scene = scene;
    const seed = [...req.ownerName].reduce((n, c) => n + c.charCodeAt(0), 0);
    const female = req.ownerSex === 'f';
    this.avatar = buildAvatar({
      skin: SKINS[seed % SKINS.length],
      hair: HAIRS[(seed * 7) % HAIRS.length],
      hairStyle: female ? ['ponytail', 'long', 'curly'][seed % 3] : ['short', 'curly', 'bald'][seed % 3],
      top: TOPS[seed % TOPS.length],
      bottom: 0x3a3f4a,
      shoes: 0x3b2a20,
      hat: seed % 4 === 0,
    });
    this.root = new THREE.Group();
    this.root.add(this.avatar.root);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(`💬 ${req.ownerName}`), depthTest: false, transparent: true }));
    this.tag.position.y = 2.1;
    this.tag.scale.set(1.7, 0.42, 1);
    this.tag.renderOrder = 10;
    this.root.add(this.tag);
    this.root.position.set(from.x, world.heightAt(from.x, from.z), from.z);
    scene.add(this.root);
    this.target = new THREE.Vector3(from.x, 0, from.z);
    this.heading = 0;
    this.speed = 0;
    this.phase = 0;
    this.arrived = false;
    this.leaving = false;
    this.wave = 0;
  }

  get position() { return this.root.position; }

  goTo(x, z) {
    this.target.set(x, 0, z);
    this.arrived = false;
  }

  update(dt, game) {
    const p = this.root.position;
    const d = Math.hypot(this.target.x - p.x, this.target.z - p.z);
    let want = 0;
    if (d > 0.6) {
      want = d > 10 ? 3.2 : 2;
      const way = navTarget(p, this.target);
      const h = Math.atan2(way.x - p.x, way.z - p.z);
      let diff = h - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 6);
    } else {
      if (!this.arrived) this.wave = 2.5;
      this.arrived = true;
      // Face au joueur quand il est proche.
      const pl = game.player.position;
      if (p.distanceTo(pl) < 6) this.heading = Math.atan2(pl.x - p.x, pl.z - p.z);
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 6);
    if (this.speed > 0.02) {
      p.x += Math.sin(this.heading) * this.speed * dt;
      p.z += Math.cos(this.heading) * this.speed * dt;
      this.world.resolveCollisions(p, 0.35);
    }
    p.y = this.world.heightAt(p.x, p.z);
    this.root.rotation.y = this.heading;
    this.phase += dt * this.speed * 2.2;
    const amp = Math.min(0.7, this.speed * 0.16);
    this.avatar.legs[0].rotation.x = Math.sin(this.phase) * amp;
    this.avatar.legs[1].rotation.x = -Math.sin(this.phase) * amp;
    this.avatar.arms[0].rotation.x = -Math.sin(this.phase) * amp * 0.8;
    // Un petit coucou de la main en arrivant.
    this.wave = Math.max(0, this.wave - dt);
    this.avatar.arms[1].rotation.x = this.wave > 0 ? -2.6 + Math.sin(this.wave * 12) * 0.3 : Math.sin(this.phase) * amp * 0.8;
    this.tag.visible = !this.leaving;
  }

  dispose() {
    this.scene.remove(this.root);
    disposeModel(this.avatar.root);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
  }
}

export class DogTrainer {
  constructor(game) {
    this.game = game;
    this.visitor = null; // { entity, req, dog (entité du chien), returning (id du chien client) }
    this.leaving = []; // visiteurs qui s'en vont
    this.checkAcc = 0;
    this.walk = null; // promenade en laisse en cours (séance « tire en laisse »)
    this.demo = null;
  }

  get profile() { return this.game.profile; }

  reset() {
    this.clearVisitor();
    for (const v of this.leaving) { v.entity.dispose(); v.dog?.dispose?.(); }
    this.leaving = [];
    this.walk?.cancel?.();
    this.walk = null;
    this.demo = null;
  }

  onPlaceLoaded() {
    this.reset();
  }

  clearVisitor() {
    const v = this.visitor;
    this.visitor = null;
    if (!v) return;
    v.entity.dispose();
    if (v.dog && !v.accepted) {
      v.dog.dispose();
      if (this.game.entities.get(v.dog.data.id) === v.dog) this.game.entities.delete(v.dog.data.id);
    }
  }

  // ---------------------------------------------------------------- arrivées

  /** Point de rendez-vous : devant la niche (ou près du joueur). */
  meetingSpot() {
    const k = this.game.world.interactables.find((i) => i.kind === 'kennel');
    if (k) return { x: k.x + 2.2, z: k.z + 1.5 };
    const p = this.game.player.position;
    return { x: p.x + 3, z: p.z + 2 };
  }

  update(dt) {
    const g = this.game;
    if (!g.profile || !g.isHome) return;
    if (this.visitor) {
      this.visitor.entity.update(dt, g);
      this.followOwner(this.visitor, dt);
    }
    for (const v of this.leaving) {
      v.entity.update(dt, g);
      this.followOwner(v, dt);
    }
    this.leaving = this.leaving.filter((v) => {
      if (!v.entity.arrived && v.entity.position.distanceTo(g.player.position) < 60) return true;
      v.entity.dispose();
      if (v.dog) {
        v.dog.dispose();
        if (g.entities.get(v.dog.data.id) === v.dog) g.entities.delete(v.dog.data.id);
      }
      return false;
    });
    this.walk?.update(dt);
    this.demo?.update(dt);
    this.checkAcc += dt;
    if (this.checkAcc < 4) return;
    this.checkAcc = 0;
    if (this.visitor || this.walk || this.demo || g.ui.isBlocking() || g.paused) return;
    // Un maître revient chercher son chien (réglé, ou séances épuisées).
    const back = clientDogs(g.profile).find((a) => a.location === g.profile.place && readyForDelivery(a) && g.entities.has(a.id));
    if (back && g.hour >= 8 && g.hour <= 20) return this.spawnReturning(back);
    if (shouldClientArrive(g.profile, { day: g.day, hour: g.hour, level: g.level })) this.spawnClient(makeClientRequest(g.profile, { day: g.day, rescue: Math.random() < 0.3 }));
  }

  /** Le chien du visiteur trotte à côté de lui (il n'est pas encore à nous : pas d'IA). */
  followOwner(v, dt) {
    if (!v.dog || v.accepted) return;
    const e = v.dog;
    const o = v.entity.position;
    const h = v.entity.heading;
    const goal = { x: o.x - Math.cos(h) * 0.9 - Math.sin(h) * 0.4, z: o.z + Math.sin(h) * 0.9 - Math.cos(h) * 0.4 };
    const p = e.position;
    const d = Math.hypot(goal.x - p.x, goal.z - p.z);
    const sp = d > 0.3 ? Math.min(5, d * 2.5) : 0;
    if (sp > 0) {
      e.heading = Math.atan2(goal.x - p.x, goal.z - p.z);
      p.x += Math.sin(e.heading) * sp * dt;
      p.z += Math.cos(e.heading) * sp * dt;
    } else if (v.entity.arrived) e.heading = v.entity.heading;
    e.speed = sp;
    e.snap();
  }

  entrance() {
    const spot = this.meetingSpot();
    return { x: spot.x - 16, z: spot.z - 10 };
  }

  spawnClient(req, near = false) {
    const g = this.game;
    this.clearVisitor();
    // near (tests / force) : le visiteur apparaît directement à côté du joueur.
    const spot = near ? { x: g.player.position.x + 2.2, z: g.player.position.z + 1.5 } : this.meetingSpot();
    const from = near ? spot : this.entrance();
    const entity = new VisitorEntity(req, g.world, g.scene, from);
    entity.goTo(spot.x, spot.z);
    const dog = g.spawnEntity(req.dog, from);
    dog.scripted = true;
    this.visitor = { entity, req, dog, accepted: false, returning: null };
    g.ui.toast(t('dt_arrives', { name: req.ownerName, dog: req.dog.name }), 6000);
    return this.visitor;
  }

  spawnReturning(a, near = false) {
    const g = this.game;
    this.clearVisitor();
    const req = { ownerName: a.client.ownerName, ownerSex: a.client.ownerSex, dog: a };
    const e = g.entities.get(a.id);
    const spot = e ? { x: e.position.x + 1.5, z: e.position.z + 1 } : this.meetingSpot();
    const entity = new VisitorEntity(req, g.world, g.scene, near ? spot : this.entrance());
    entity.goTo(spot.x, spot.z);
    this.visitor = { entity, req, dog: null, accepted: true, returning: a.id };
    g.ui.toast(t('dt_ownerBack', { name: req.ownerName, dog: a.name }), 6000);
    return this.visitor;
  }

  /** Pour tester : fait venir tout de suite un client (problème au choix), ou le maître d'un chien prêt. */
  force(problem = null, opts = {}) {
    const g = this.game;
    if (opts.returning) {
      const a = clientDogs(g.profile).find((x) => readyForDelivery(x)) ?? clientDogs(g.profile)[0];
      return a ? this.spawnReturning(a, true) : null;
    }
    dogTrainerOf(g.profile).lastVisitDay = g.day;
    return this.spawnClient(makeClientRequest(g.profile, { day: g.day, problem, rescue: !!opts.rescue }), true);
  }

  // ---------------------------------------------------------------- toucher / parler

  /** Toucher le visiteur ou son chien : on va lui parler. */
  onTap(raycaster, paused) {
    const v = this.visitor;
    if (!v) return false;
    const roots = [v.entity.root];
    if (v.dog && !v.accepted) roots.push(v.dog.root);
    if (!raycaster.intersectObjects(roots, true).length) return false;
    if (paused) this.talk();
    else this.game.walkTo(v.entity.position, 1.8, () => this.talk(), true);
    return true;
  }

  /** Pour le bouton d'action (E) : le visiteur est à portée. */
  focusNear(pp) {
    const v = this.visitor;
    if (!v) return null;
    const d = Math.hypot(v.entity.position.x - pp.x, v.entity.position.z - pp.z) - 0.4;
    if (d > 1.6) return null;
    return { d, focus: { kind: 'spot', key: 'dt-visitor', icon: '💬', label: () => t('talkTo', { name: v.req.ownerName }), run: () => this.talk() } };
  }

  talk() {
    const v = this.visitor;
    if (!v) return;
    const g = this.game;
    const first = !dogTrainerOf(g.profile).tutored.meetClient && !v.returning;
    const open = () => openDogTrainerChat(g.ui, this, v);
    if (first) showDogTrainerTutorial(g.ui, 'meetClient', open);
    else open();
  }

  accept() {
    const v = this.visitor;
    if (!v || v.accepted) return { ok: false };
    const g = this.game;
    const r = acceptClient(g.profile, v.req, g.day);
    if (!r.ok) return r;
    v.accepted = true;
    v.dog.scripted = false;
    v.dog.data.following = false;
    v.dog.emit('❤️', 2);
    this.sendAway(v);
    g.ui.toast(t('dt_accepted', { name: v.req.dog.name, owner: v.req.ownerName }), 5000);
    g.xp('adopt', 0.5);
    g.ui.refresh();
    return r;
  }

  refuse() {
    const v = this.visitor;
    if (!v) return;
    this.sendAway(v);
    this.game.ui.toast(t('dt_refused', { name: v.req.ownerName }), 4000);
  }

  /** Le visiteur repart vers l'entrée (avec son chien s'il ne reste pas). */
  sendAway(v) {
    if (this.visitor === v) this.visitor = null;
    const out = this.entrance();
    v.entity.leaving = true;
    v.entity.goTo(out.x - 6, out.z - 6);
    if (v.accepted && v.dog) v.dog = null; // le chien reste à la ferme
    this.leaving.push(v);
  }

  // ---------------------------------------------------------------- séances

  /** Séances possibles pour cet animal : problèmes du client, ou coaching d'un animal à soi. */
  sessionsFor(a) {
    if (a.client) return Object.keys(a.client.problems);
    return null;
  }

  /** Lance une séance (depuis la fiche de l'animal). id : clé de PROBLEMS ou COACHINGS. */
  async session(a, id) {
    const g = this.game;
    if (g.blockedByPause()) return null;
    const can = canSession(a, g.day);
    if (!can.ok) return g.ui.toast(t(`dt_cant_${can.reason}`, { name: a.name, g: a.sex }), 4500);
    const def = PROBLEMS[id] ?? COACHINGS[id];
    if (!def) return null;
    const tutoKey = a.client ? 'session' : COACHINGS[id] ? (id === 'herd' ? 'coachHerd' : 'coachAgility') : 'coachOwn';
    const d = dogTrainerOf(g.profile);
    if (!d.tutored[tutoKey] || !d.tutored[`game_${id}`]) {
      await new Promise((res) => showDogTrainerTutorial(g.ui, tutoKey, res, id));
      d.tutored[`game_${id}`] = true;
    }
    g.ui.closePanel();
    let quality;
    if (id === 'pull') quality = await this.leashWalk(a);
    else quality = await runSessionGame(g.ui, a, def.game);
    if (quality === null || quality === undefined) return null;
    const r = applySession(g.profile, a, id, quality, g.day);
    g.profile.clock += SESSION_MINUTES;
    addStat(g.profile, 'dtAnySession');
    g.xp('trick');
    const e = g.entities.get(a.id);
    e?.emit(r.perfect ? '🎉' : '⭐', 3);
    showSessionResult(g.ui, a, id, r);
    if (r.rankUp) g.ui.toast(t('dt_rankUp', { rank: t(`dt_rank_${['apprenti', 'confirme', 'expert'][r.rank]}`) }), 6000);
    if (a.client && isFixed(a)) g.ui.toast(t('dt_fixedSoon', { name: a.name, g: a.sex, owner: a.client.ownerName }), 6000);
    g.ui.refresh();
    return r;
  }

  /**
   * Séance « tire en laisse » : la vraie promenade en 3D. Le chien tire (leashPull de l'entité) ;
   * il faut s'arrêter et attendre que la laisse se détende, puis récompenser.
   */
  leashWalk(a) {
    const g = this.game;
    if (!canLeash(a)) { g.ui.toast(t('r_needLeash', { name: a.name, g: a.sex }), 5000); return Promise.resolve(null); }
    const e = g.entities.get(a.id);
    if (!e) return Promise.resolve(null);
    return new Promise((resolve) => {
      a.following = true;
      a.leashed = true;
      a.housed = false;
      const NEED = 5;
      const st = { time: 0, pull: 0, pulling: false, waited: 0, window: 0, rewards: 0, miss: 0, bad: 0, nudge: 3, done: false, phase: 'walk' };
      const overlay = startLeashWalkOverlay(g.ui, a, st, {
        reward: () => {
          if (st.done) return;
          if (st.window > 0 && st.pull < 0.25) {
            st.rewards++;
            st.window = 0;
            st.phase = 'walk';
            e.emit('🍪', 2);
            e.sniffing = false;
            if (st.rewards >= NEED) finish();
          } else {
            st.miss++;
            st.phase = 'bad';
            st.badFlash = 1.5;
          }
        },
        stop: () => finish(null, true),
      });
      const finish = (q, cancelled = false) => {
        if (st.done) return;
        st.done = true;
        a.following = false;
        a.leashed = false;
        e.sniffing = false;
        overlay.close();
        this.walk = null;
        const quality = cancelled && st.rewards < 2 ? null : Math.max(0.4, Math.min(1, 0.4 + st.rewards * 0.12 - st.bad * 0.01 - st.miss * 0.06));
        resolve(quality);
      };
      this.walk = {
        st,
        cancel: () => finish(null, true),
        // Pour les tests automatiques : forcer la traction, ou terminer avec n récompenses.
        script: { pull: (v) => { st.forcePull = v; }, finish: (n) => { st.rewards = n; finish(); } },
        update: (dt) => {
          if (st.done) return;
          st.time += dt;
          st.badFlash = Math.max(0, (st.badFlash ?? 0) - dt);
          if (st.badFlash <= 0 && st.phase === 'bad') st.phase = 'walk';
          st.pull = st.forcePull ?? e.leashPull ?? 0;
          const moving = g.player.speed > 0.4;
          // De temps en temps, le chien part renifler devant : la laisse se tend.
          st.nudge -= dt;
          if (st.nudge <= 0 && st.window <= 0) {
            st.nudge = 5 + Math.random() * 3;
            const h = g.player.heading;
            e.sniffing = true;
            e.sniff = 3.5;
            e.sniffSpot = { x: g.player.position.x + Math.sin(h) * 6 + Math.cos(h) * 2, z: g.player.position.z + Math.cos(h) * 6 - Math.sin(h) * 2 };
          }
          if (st.pull > 0.3) {
            if (moving) { st.bad += dt; st.waited = 0; st.phase = 'pulling'; }
            else {
              st.waited += dt;
              st.phase = 'waiting';
              if (st.waited > 1.2) {
                // Bravo : on a attendu, le chien revient et la laisse se détend.
                e.sniffing = false;
                e.sniff = 4;
                st.waited = 0;
                st.window = 4;
                st.phase = 'reward';
              }
            }
          } else {
            st.waited = 0;
            if (st.window > 0) { st.window -= dt; st.phase = 'reward'; if (st.window <= 0) st.phase = 'walk'; }
            else if (st.phase !== 'bad') st.phase = moving ? 'walk' : 'idle';
          }
          overlay.render();
          if (st.time > 75) finish();
        },
      };
    });
  }

  // ---------------------------------------------------------------- livraison

  /** Démonstration devant le maître, puis résultat (étoiles, paiement) et départ. */
  deliver() {
    const v = this.visitor;
    if (!v?.returning) return;
    const g = this.game;
    const a = g.profile.animals.find((x) => x.id === v.returning);
    const e = a && g.entities.get(a.id);
    if (!a || !e) return;
    g.ui.closePanel();
    const owner = v.entity.position;
    e.scripted = true;
    e.data.following = false;
    e.data.leashed = false;
    const emojiFor = { pull: '🦮', recall: '📣', jump: '🙅', bark: '🤫', shy: '💛', obey: '✋' }[a.client.problem] ?? '⭐';
    let tm = 0;
    let shown = false;
    this.demo = {
      update: (dt) => {
        tm += dt;
        const p = e.position;
        const goal = { x: owner.x + Math.cos(v.entity.heading) * 1.1, z: owner.z - Math.sin(v.entity.heading) * 1.1 };
        const d = Math.hypot(goal.x - p.x, goal.z - p.z);
        if (d > 0.3) {
          e.heading = Math.atan2(goal.x - p.x, goal.z - p.z);
          const sp = Math.min(4, d * 2);
          p.x += Math.sin(e.heading) * sp * dt;
          p.z += Math.cos(e.heading) * sp * dt;
          e.speed = sp;
        } else {
          e.speed = 0;
          e.heading = v.entity.heading + Math.PI;
        }
        e.snap();
        if (tm > 1.2 && tm < 1.3 && !this.demoEmit1) { this.demoEmit1 = true; e.emit(emojiFor, 3); }
        if (tm > 2.6 && !shown) {
          shown = true;
          e.emit(isFixed(a) ? '⭐' : '💛', 4);
          const r = finishClient(g.profile, a, g.day);
          g.xp(r.success ? 'event' : 'care');
          showDelivery(g.ui, a, r, () => {
            // Le chien repart avec son maître.
            this.demo = null;
            this.demoEmit1 = false;
            if (g.player.mount === e) g.dismount();
            v.dog = e;
            v.accepted = false;
            this.sendAway(v);
            g.ui.refresh();
          });
        }
      },
    };
  }

  /** Résumé pour la fiche du chien : « Problème : tire en laisse 60 % → 30 % ». */
  problemSummary(a) {
    if (!a.client) return [];
    return Object.entries(a.client.problems).map(([id, now]) => ({ id, start: a.client.start[id], now, fixed: now < 15 }));
  }

  rank() { return dogTrainerRank(this.profile); }
}

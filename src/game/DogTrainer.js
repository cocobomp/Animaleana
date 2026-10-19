// Éducateur canin (3D) : le maître arrive à la ferme avec son chien et s'arrête près de la niche, on
// discute, le chien reste ; on fait les séances (mini-jeux, ou la vraie promenade en laisse), puis le
// maître revient le chercher : démonstration, étoiles, paiement, et ils repartent ensemble.
// Logique pure : src/sim/dogTrainer.js. Interface : src/ui/dogTrainer.js. Les maîtres sont les mêmes
// personnages que les clients de la pension (VisitorEntity, src/game/Clients.js).
//
// Pour tester dans la console : animaleana.game.dogTrainer.force('pull') (un maître arrive tout près),
//   .force(null, { returning: true }) (le maître d'un chien prêt revient).

import * as THREE from 'three';
import { t } from '../i18n.js';
import { AnimalEntity } from './AnimalEntity.js';
import { VisitorEntity, VISITOR_PATH } from './Clients.js';
import { canLeash } from '../sim/gear.js';
import { addStat } from '../sim/profile.js';
import { RANKS, isStarted } from '../sim/careers.js';
import {
  CAREER_ID, PROBLEMS, COACHINGS, SESSION_MINUTES, makeClientRequest, acceptClient, canSession, applySession,
  readyForDelivery, finishClient, shouldClientArrive, dogTrainerOf, clientDogs, isFixed, isTrainingClient,
  coachingsFor, dogTrainerRank, setPending, pendingRequest, clearPending, pendingExpired,
} from '../sim/dogTrainer.js';
import {
  openDogTrainerChat, showDogTrainerTutorial, showDelivery, showSessionResult, startLeashWalkOverlay, runSessionGame,
} from '../ui/dogTrainer.js';

const { GATE, WAY, MEET } = VISITOR_PATH;
const LEASH_REWARDS = 5; // récompenses à donner pendant la promenade-séance « tire en laisse »

export class DogTrainer {
  constructor(game) {
    this.game = game;
    this.visitor = null; // { npc, e (chien du maître, pas encore à nous), req, accepted, returning (id du chien client) }
    this.leaving = []; // { npc, e } : maîtres (et leur chien) qui s'en vont
    this.checkAcc = 0;
    this.walk = null; // promenade en laisse en cours (séance « tire en laisse »)
    this.demo = null; // démonstration devant le maître
    this.asked = false; // on a déjà ouvert la discussion en arrivant tout près
    game.clients?.registerGuide?.('dogTrainer', (action) => this.showMe(action)); // « 👉 Montre-moi » du carnet
  }

  get profile() { return this.game.profile; }

  reset() {
    this.clearVisitor();
    for (const l of this.leaving) { l.npc.dispose(); l.e?.dispose(); }
    this.leaving = [];
    this.walk?.cancel?.();
    this.walk = null;
    if (this.demo) this.demo.abort?.();
    this.demo = null;
  }

  onPlaceLoaded() {
    this.reset();
  }

  clearVisitor() {
    const v = this.visitor;
    this.visitor = null;
    if (!v) return;
    v.npc.dispose();
    if (v.e && !v.accepted) v.e.dispose();
  }

  // ---------------------------------------------------------------- arrivées

  /** Tout près du joueur, devant la caméra (visiteur appelé pour tester : force). */
  nearSpot() {
    const g = this.game;
    const p = g.player.position;
    const d = new THREE.Vector3();
    g.camera.getWorldDirection(d);
    d.y = 0;
    if (d.lengthSq() < 1e-4) d.set(0, 0, 1);
    d.normalize();
    return { x: p.x + d.x * 3 - d.z * 1.2, z: p.z + d.z * 3 + d.x * 1.2 };
  }

  /** Point de rendez-vous : devant la niche (ou dans la cour, près de la maison). */
  meetingSpot() {
    const k = this.game.world.interactables.find((i) => i.kind === 'kennel');
    if (k) return { x: k.x + 2.2, z: k.z + 1.5 };
    return { x: MEET.x - 2, z: MEET.z - 2.5 };
  }

  update(dt) {
    const g = this.game;
    if (!g.running || !g.profile) return;
    const ctx = { playerPos: g.player.position, night: false, entities: [], game: g };
    const v = this.visitor;
    if (v) {
      v.npc.update(dt);
      if (v.e && !v.accepted) this.follow(v.e, v.npc, dt, ctx);
      this.proximity();
    }
    for (const l of this.leaving) {
      l.npc.update(dt);
      if (l.e) this.follow(l.e, l.npc, dt, ctx);
    }
    this.walk?.update(dt);
    this.demo?.update(dt);
    this.checkAcc += dt;
    if (this.checkAcc < 3) return;
    this.checkAcc = 0;
    // Un maître à qui on ne répond pas repart au bout de 2 h de jeu (comme les visiteurs de la pension) :
    // avant, il attendait des jours et des nuits et aucun autre client ne venait.
    if (v && !v.accepted && !v.returning && v.npc.bubble.visible && !g.ui.isBlocking() && pendingExpired(g.profile, g.profile.clock)) {
      this.ownerGivesUp(v);
      return;
    }
    if (!g.isHome || this.visitor || this.walk || this.demo || g.ui.isBlocking() || g.paused) return;
    if (g.activities?.active) return; // pas en pleine épreuve ou séance : le maître viendra après
    if (g.clients?.visitor && !g.clients.visitor.visit?.auto) return; // un client de la pension ou du vétérinaire attend déjà : chacun son tour
    if (g.arrivals?.free() === false) return; // un autre visiteur vient d'arriver (src/game/arrivals.js)
    // Un maître revient chercher son chien (réglé, séances épuisées, ou jour prévu passé).
    const back = clientDogs(g.profile).find((a) => a.location === g.profile.place && readyForDelivery(a, g.day) && g.entities.has(a.id));
    if (back && g.hour >= 8 && g.hour <= 20) {
      this.spawnReturning(back);
      return;
    }
    // Le maître qui attendait une réponse revient (page rechargée, ou retour de voyage le même jour).
    const pend = pendingRequest(g.profile, g.day, g.profile.clock);
    if (pend) {
      if (g.hour >= 8 && g.hour <= 20) this.spawnClient(pend);
      return;
    }
    if (shouldClientArrive(g.profile, { day: g.day, hour: g.hour })) this.spawnClient(makeClientRequest(g.profile, { day: g.day, rescue: Math.random() < 0.3 }));
  }

  /** Le chien du visiteur trotte à côté de lui (comme les animaux des clients, src/game/Clients.js). */
  follow(e, npc, dt, ctx) {
    const d = Math.hypot(e.position.x - npc.position.x, e.position.z - npc.position.z);
    e.herdCtrl = d > 2.4 ? { pusher: true, target: npc.position } : null;
    e.update(dt, ctx);
  }

  /** Tout près du maître qui attend : la discussion s'ouvre toute seule (une fois). */
  proximity() {
    const g = this.game;
    const v = this.visitor;
    if (!v || !v.npc.bubble.visible) return;
    const pp = g.player.position;
    const d = Math.hypot(v.npc.position.x - pp.x, v.npc.position.z - pp.z);
    if (d > 5) this.asked = false;
    if (d < 2.4 && !this.asked && !g.ui.isBlocking() && !g.player.auto && !g.ui.panel) {
      this.asked = true;
      this.talk();
    }
  }

  ownerOf(req) {
    return { name: req.ownerName, sex: req.ownerSex, seed: req.ownerSeed ?? 0 };
  }

  /** Le chien du maître : une entité à part (pas encore dans game.entities), qui reste près de lui. */
  spawnVisitorDog(dogData, npc, at) {
    const g = this.game;
    const e = new AnimalEntity(dogData, g.world, g.scene);
    e.position.set(at.x + 1, 0, at.z + 1);
    e.snap();
    const npcPos = npc.position;
    Object.defineProperty(e, 'home', { configurable: true, get: () => ({ x: npcPos.x, z: npcPos.z, r: 1.6 }) });
    return e;
  }

  spawnClient(req, near = false) {
    const g = this.game;
    this.clearVisitor();
    const spot = near ? this.nearSpot() : this.meetingSpot();
    const npc = new VisitorEntity(g, this.ownerOf(req));
    const start = near ? { x: spot.x + 1.5, z: spot.z + 1 } : GATE;
    npc.place(start.x, start.z);
    const e = this.spawnVisitorDog(req.dog, npc, start);
    this.visitor = { npc, e, req, accepted: false, returning: null };
    setPending(g.profile, req, g.day, g.profile.clock); // gardé dans le profil tant qu'on n'a pas répondu (2 h au plus)
    this.asked = false;
    npc.walk(near ? [spot] : [WAY, MEET, spot], () => this.waitHere(npc));
    g.arrivals?.note();
    g.ui.toast(t('dt_arrives', { name: req.ownerName, dog: req.dog.name }), 6000, { group: 'visitors' });
    g.ui.renderStatus();
    return this.visitor;
  }

  /** Arrivé : la bulle 💬, un coucou, et il regarde vers toi. */
  waitHere(npc) {
    const g = this.game;
    npc.bubble.visible = true;
    npc.waving = true;
    npc.lookAt(g.player.position.x, g.player.position.z);
    g.ui.renderStatus();
  }

  spawnReturning(a, near = false) {
    const g = this.game;
    this.clearVisitor();
    const req = { ownerName: a.client.ownerName, ownerSex: a.client.ownerSex, ownerSeed: a.client.ownerSeed, dog: a };
    const spot = near ? this.nearSpot() : this.meetingSpot();
    const npc = new VisitorEntity(g, this.ownerOf(req));
    const start = near ? { x: spot.x + 1.5, z: spot.z + 1 } : GATE;
    npc.place(start.x, start.z);
    this.visitor = { npc, e: null, req, accepted: true, returning: a.id };
    this.asked = false;
    npc.walk(near ? [spot] : [WAY, MEET, spot], () => this.waitHere(npc));
    g.arrivals?.note();
    g.ui.toast(t('dt_ownerBack', { name: req.ownerName, dog: a.name }), 6000, { group: 'visitors' });
    g.ui.renderStatus();
    return this.visitor;
  }

  /** Pour tester : fait venir tout de suite un client (problème au choix), ou le maître d'un chien prêt. */
  force(problem = null, opts = {}) {
    const g = this.game;
    if (opts.returning) {
      const a = clientDogs(g.profile).find((x) => readyForDelivery(x, g.day)) ?? clientDogs(g.profile)[0];
      return a ? this.spawnReturning(a, opts.near ?? true) : null;
    }
    dogTrainerOf(g.profile).lastVisitDay = g.day;
    return this.spawnClient(makeClientRequest(g.profile, { day: g.day, problem, rescue: !!opts.rescue }), opts.near ?? true);
  }

  /** Le visiteur repart vers la route (avec son chien s'il ne reste pas). */
  sendAway(v, withDog = null) {
    this.walkOut(this.keepNear(v, withDog));
  }

  /** Le maître n'attend plus (bulle cachée) mais reste là un moment, son chien près de lui. */
  keepNear(v, withDog = null) {
    if (this.visitor === v) this.visitor = null;
    v.npc.bubble.visible = false;
    v.npc.waving = false;
    const l = { npc: v.npc, e: withDog };
    this.leaving.push(l);
    this.game.ui.renderStatus();
    return l;
  }

  /** Il s'en va par la route ; arrivé au bout, il disparaît. */
  walkOut(l) {
    l.npc.walk([MEET, WAY, GATE], () => {
      const i = this.leaving.indexOf(l);
      if (i >= 0) this.leaving.splice(i, 1);
      l.npc.dispose();
      l.e?.dispose();
    });
  }

  // ---------------------------------------------------------------- toucher / parler

  /** Toucher le visiteur ou son chien : on va lui parler. */
  onTap(raycaster, paused) {
    const v = this.visitor;
    if (!v) return false;
    const roots = [v.npc.root];
    if (v.e && !v.accepted) roots.push(v.e.root);
    if (!raycaster.intersectObjects(roots, true).length) return false;
    if (paused) this.talk();
    else this.goToVisitor();
    return true;
  }

  goToVisitor() {
    const v = this.visitor;
    if (!v) return;
    this.asked = true;
    this.game.walkTo(v.npc.position.clone(), 1.8, () => this.talk(), true);
  }

  /** Pour le bouton d'action (E) : le visiteur est à portée. */
  focusNear(pp) {
    const v = this.visitor;
    if (!v || !v.npc.bubble.visible) return null;
    const d = Math.hypot(v.npc.position.x - pp.x, v.npc.position.z - pp.z) - 0.4;
    if (d > 2.4) return null;
    return { d, focus: { kind: 'spot', key: 'dt-visitor', icon: '💬', label: () => t('talkTo', { name: v.req.ownerName }), run: () => this.talk() } };
  }

  talk() {
    const v = this.visitor;
    const g = this.game;
    if (!v || g.ui.modalOpen) return;
    v.npc.lookAt(g.player.position.x, g.player.position.z);
    const open = () => openDogTrainerChat(g.ui, this, v);
    const d = dogTrainerOf(g.profile);
    const key = v.returning ? 'deliver' : 'meetClient';
    if (!d.tutored[key]) showDogTrainerTutorial(g.ui, key, open);
    else open();
  }

  accept() {
    const v = this.visitor;
    if (!v || v.accepted || v.returning) return { ok: false };
    const g = this.game;
    const r = acceptClient(g.profile, v.req, g.day);
    if (!r.ok) return r;
    clearPending(g.profile);
    v.accepted = true;
    const e = v.e;
    delete e.home; // il retrouve une zone de vie normale (la niche, la cour)
    e.herdCtrl = null;
    e.state = 'walk';
    e.pickWanderTarget?.();
    e.timer = 20;
    g.entities.set(r.a.id, e);
    e.emit('❤️', 3);
    this.sendAway(v);
    g.ui.toast(t('dt_accepted', { name: v.req.dog.name, owner: v.req.ownerName }), 5000);
    g.xp('client', 0.5);
    g.ui.refresh();
    g.save();
    g.emit('dogTrainerAccepted', r.a);
    return r;
  }

  /** Le maître a attendu 2 h sans réponse : il repart avec son chien (il en viendra d'autres, un autre jour). */
  ownerGivesUp(v) {
    const g = this.game;
    clearPending(g.profile);
    this.sendAway(v, v.e);
    g.ui.toast(t('cl_left', { owner: v.req.ownerName, g: v.req.ownerSex }), 5000, { group: 'visitors' });
    g.save();
  }

  refuse() {
    const v = this.visitor;
    if (!v) return;
    if (!v.returning) clearPending(this.game.profile);
    this.sendAway(v, v.accepted ? null : v.e);
    this.game.ui.toast(t('dt_refused', { name: v.req.ownerName }), 4000);
  }

  // ---------------------------------------------------------------- séances

  /** Lance une séance (fiche de l'animal ou menu rapide). id : clé de PROBLEMS ou COACHINGS. */
  async session(a, id) {
    const g = this.game;
    if (this.walk || g.ui.minigameOpen) return null;
    if (g.blockedByPause()) return null;
    const can = canSession(a, g.day);
    if (!can.ok) {
      g.ui.toast(t(`dt_cant_${can.reason}`, { name: a.name, g: a.sex }), 4500);
      return null;
    }
    const def = PROBLEMS[id] ?? COACHINGS[id];
    if (!def) return null;
    if (COACHINGS[id] && dogTrainerRank(g.profile) < COACHINGS[id].rank) return null;
    const tutoKey = isTrainingClient(a) ? 'session' : COACHINGS[id] ? (id === 'herd' ? 'coachHerd' : 'coachAgility') : 'coachOwn';
    const d = dogTrainerOf(g.profile);
    g.ui.closePanel();
    if (!d.tutored[tutoKey] || !d.tutored[`game_${id}`]) {
      await new Promise((res) => showDogTrainerTutorial(g.ui, tutoKey, res, id));
      d.tutored[`game_${id}`] = true;
    }
    let quality;
    if (id === 'pull' && canLeash(a) && g.entities.has(a.id)) quality = await this.leashWalk(a);
    else quality = await runSessionGame(g.ui, a, def.game); // (tire en laisse sans promenade 3D : « au pied » en mini-jeu)
    if (quality === null || quality === undefined) return null;
    if (!g.profile?.animals.includes(a)) return null; // (le chien est reparti entre-temps)
    const r = applySession(g.profile, a, id, quality, g.day);
    g.profile.clock += SESSION_MINUTES;
    addStat(g.profile, 'dtAnySession');
    g.xp('trick');
    g.entities.get(a.id)?.emit(r.perfect ? '🎉' : '⭐', 3);
    showSessionResult(g.ui, a, id, r);
    if (r.rankUp) g.ui.toast(t('ca_rankUpToast', { rank: t(`ca_rank_${RANKS[r.rank]}`), career: t(`career_${CAREER_ID}`) }), 7000);
    if (isTrainingClient(a) && isFixed(a)) g.ui.toast(t('dt_fixedSoon', { name: a.name, g: a.sex, owner: a.client.ownerName }), 6000);
    g.ui.refresh();
    g.ui.renderStatus();
    g.save();
    g.emit('dogTrainerSession', { a, id, r });
    return r;
  }

  /**
   * Séance « tire en laisse » : la vraie promenade en 3D. Le chien tire (leashPull de l'entité) ;
   * il faut s'arrêter et attendre que la laisse se détende, puis récompenser.
   */
  leashWalk(a) {
    const g = this.game;
    const e = g.entities.get(a.id);
    if (!e) return Promise.resolve(null);
    return new Promise((resolve) => {
      const before = { following: a.following, leashed: a.leashed };
      a.following = true;
      a.leashed = true;
      a.housed = false;
      const st = { time: 0, pull: 0, waited: 0, window: 0, rewards: 0, need: LEASH_REWARDS, miss: 0, bad: 0, nudge: 3, done: false, phase: 'walk' };
      const finish = (cancelled = false) => {
        if (st.done) return;
        st.done = true;
        a.following = before.following;
        a.leashed = before.leashed;
        e.sniffing = false;
        overlay.close();
        this.walk = null;
        const quality = cancelled && st.rewards < 2 ? null : Math.max(0.4, Math.min(1, 0.4 + st.rewards * 0.12 - st.bad * 0.01 - st.miss * 0.06));
        resolve(quality);
      };
      const overlay = startLeashWalkOverlay(g.ui, a, st, {
        reward: () => {
          if (st.done) return;
          if (st.window > 0 && st.pull < 0.25) {
            st.rewards++;
            st.window = 0;
            st.phase = 'walk';
            e.emit('🍪', 2);
            e.sniffing = false;
            if (st.rewards >= LEASH_REWARDS) finish();
          } else {
            st.miss++;
            st.phase = 'bad';
            st.badFlash = 1.5;
          }
        },
        stop: () => finish(true),
      });
      this.walk = {
        st,
        cancel: () => finish(true),
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
            const hd = g.player.heading ?? 0;
            e.sniffing = true;
            e.sniff = 3.5;
            e.sniffSpot = { x: g.player.position.x + Math.sin(hd) * 6 + Math.cos(hd) * 2, z: g.player.position.z + Math.cos(hd) * 6 - Math.sin(hd) * 2 };
          }
          if (st.pull > 0.3) {
            if (moving) { st.bad += dt; st.waited = 0; st.phase = 'pulling'; } else {
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
            if (st.window > 0) {
              st.window -= dt;
              st.phase = 'reward';
              if (st.window <= 0) st.phase = 'walk';
            } else if (st.phase !== 'bad') st.phase = moving ? 'walk' : 'idle';
          }
          overlay.render();
          if (st.time > 90) finish();
        },
      };
    });
  }

  // ---------------------------------------------------------------- livraison

  /** Démonstration devant le maître (ce que le chien a appris), puis résultat et départ ensemble. */
  deliver() {
    const v = this.visitor;
    if (!v?.returning) return;
    const g = this.game;
    const a = g.profile.animals.find((x) => x.id === v.returning);
    const e = a && g.entities.get(a.id);
    if (!a || !e) return;
    g.ui.closePanel();
    if (g.player.mount === e) g.dismount();
    if (e.inside) e.leaveHouse?.();
    a.following = false;
    a.leashed = false;
    a.housed = false;
    e.scripted = true;
    v.npc.bubble.visible = false;
    v.npc.waving = false;
    v.npc.walk([]); // il s'arrête là où il est (et ne rouvre pas sa bulle en arrivant)
    v.npc.lookAt(e.position.x, e.position.z);
    const owner = v.npc.position;
    // Le chien est loin (au bout de la ferme) : il arrive en courant, déjà tout près, pour qu'on voie la démonstration.
    if (Math.hypot(e.position.x - owner.x, e.position.z - owner.z) > 10) {
      e.position.set(owner.x + 4, 0, owner.z + 3);
      e.snap();
    }
    const fixed = isFixed(a);
    const steps = this.demoSteps(a.client.problem, fixed);
    let i = 0;
    let tm = 0;
    let shown = false;
    const front = () => {
      const h = v.npc.heading;
      return { x: owner.x + Math.sin(h) * 1.3, z: owner.z + Math.cos(h) * 1.3 };
    };
    const moveTo = (goal, dt, speed) => {
      const p = e.position;
      const d = Math.hypot(goal.x - p.x, goal.z - p.z);
      if (d > 0.25) {
        e.heading = Math.atan2(goal.x - p.x, goal.z - p.z);
        const sp = Math.min(speed, d * 2.5);
        p.x += Math.sin(e.heading) * sp * dt;
        p.z += Math.cos(e.heading) * sp * dt;
        e.speed = sp;
        return false;
      }
      e.speed = 0;
      e.heading = Math.atan2(owner.x - p.x, owner.z - p.z);
      return true;
    };
    const end = () => {
      if (shown) return;
      shown = true;
      this.demo = null;
      const r = finishClient(g.profile, a, g.day); // (le chien quitte le profil)
      g.xp(r.success ? 'client' : 'care');
      // Le chien n'est plus à nous : il rejoint son maître et reste près de lui jusqu'au départ.
      g.entities.delete(a.id);
      e.scripted = false;
      e.posing = null;
      const npcPos = v.npc.position;
      Object.defineProperty(e, 'home', { configurable: true, get: () => ({ x: npcPos.x, z: npcPos.z, r: 1.6 }) });
      e.emit('❤️', 3);
      const l = this.keepNear(v, e);
      g.ui.closePanelFor?.(a.id);
      g.ui.refresh();
      g.save();
      g.emit('dogTrainerDelivered', r);
      showDelivery(g.ui, a, r, () => {
        this.walkOut(l);
        if (r.rankUp) g.ui.toast(t('ca_rankUpToast', { rank: t(`ca_rank_${RANKS[r.rank]}`), career: t(`career_${CAREER_ID}`) }), 7000);
        g.ui.toast(t('cl_leaving', { name: a.name, owner: v.req.ownerName }), 5000);
      });
    };
    this.demo = {
      abort: () => { e.scripted = false; e.posing = null; },
      peek: () => ({ step: i, steps: steps.length, tm, dog: { x: e.position.x, z: e.position.z }, front: front() }), // (tests)
      update: (dt) => {
        if (shown) return;
        tm += dt;
        const s = steps[i];
        if (!s) {
          end();
          e.snap();
          return;
        }
        let done = false;
        if (s.go === 'front') done = moveTo(front(), dt, 3.5);
        else if (s.go === 'away') done = moveTo({ x: owner.x + 4, z: owner.z + 3 }, dt, 3);
        else if (s.go === 'circle') {
          // Au pied : un petit tour autour du maître, sans tirer.
          s.a = (s.a ?? Math.atan2(e.position.x - owner.x, e.position.z - owner.z)) + dt * 1.4;
          moveTo({ x: owner.x + Math.sin(s.a) * 1.6, z: owner.z + Math.cos(s.a) * 1.6 }, dt, 2);
          done = tm > (s.t ?? 2.5);
        } else {
          e.speed = 0;
          done = tm > (s.t ?? 1);
        }
        e.posing = s.pose ?? null;
        if (s.emoji && !s.emitted) { s.emitted = true; e.emit(s.emoji, 3); }
        e.snap();
        if (done) { i++; tm = 0; }
      },
    };
  }

  /** Ce que le chien montre au maître, selon son problème (et s'il est réglé). */
  demoSteps(problem, fixed) {
    if (!fixed) return [{ go: 'front' }, { emoji: '💛', t: 1.4 }];
    const steps = {
      obey: [{ go: 'front' }, { emoji: '✋', t: 1.1 }, { pose: 'down', emoji: '👇', t: 1.6 }, { emoji: '⭐', t: 0.8 }],
      pull: [{ go: 'front' }, { go: 'circle', emoji: '🦮', t: 3 }, { go: 'front', emoji: '⭐' }],
      recall: [{ go: 'away', emoji: '🐾' }, { emoji: '📣', t: 0.6 }, { go: 'front', emoji: '💨' }, { emoji: '⭐', t: 0.8 }],
      jump: [{ go: 'front' }, { emoji: '🙅', t: 1.2 }, { pose: 'down', emoji: '❤️', t: 1.2 }],
      bark: [{ go: 'front' }, { emoji: '🤫', t: 1.5 }, { emoji: '⭐', t: 0.8 }],
      shy: [{ go: 'front', emoji: '💛' }, { pose: 'down', emoji: '❤️', t: 1.5 }],
    };
    return steps[problem] ?? [{ go: 'front' }, { emoji: '⭐', t: 1.2 }];
  }

  // ---------------------------------------------------------------- carnet : « 👉 Montre-moi »

  /** La flèche jaune vers ce qu'il faut faire pour cette action du carnet (src/ui/careers.js). */
  showMe(action) {
    const g = this.game;
    const p = g.profile;
    const v = this.visitor;
    const spot = this.meetingSpot();
    const arrowAt = (x, z) => g.marker.show(new THREE.Vector3(x, 0, z), { hideNear: 3 });
    if (['meetClient', 'deliver', 'rescue'].includes(action)) {
      if (v && v.npc.bubble.visible && (action !== 'deliver' || v.returning)) {
        g.marker.show(v.npc, { hideNear: 2.5 });
        g.ui.toast(t('dt_show_visitor'), 5000);
      } else {
        arrowAt(spot.x, spot.z);
        g.ui.toast(t(action === 'deliver' ? 'dt_show_deliver' : action === 'rescue' ? 'dt_show_rescue' : 'dt_show_wait'), 6000);
      }
      return;
    }
    if (action === 'session') {
      const a = clientDogs(p).find((x) => g.entities.has(x.id));
      if (!a) {
        arrowAt(spot.x, spot.z);
        g.ui.toast(t('dt_show_noDog'), 6000);
        return;
      }
      g.marker.show(g.entities.get(a.id), { hideNear: 2.5 });
      g.ui.toast(t('dt_show_dog', { name: a.name, g: a.sex }), 6000);
      return;
    }
    // Entraîner un de ses animaux (coaching).
    const rank = dogTrainerRank(p);
    const want = action === 'coachHerd' ? 'herd' : action === 'coachAgility' ? 'agility' : null;
    const own = p.animals.find((x) => !x.client && g.entities.has(x.id) && coachingsFor(x, rank).some((id) => !want || id === want));
    if (!own) {
      g.ui.toast(t('dt_show_noOwnDog'), 6000);
      return;
    }
    g.marker.show(g.entities.get(own.id), { hideNear: 2.5 });
    g.ui.toast(t('dt_show_ownDog', { name: own.name, g: own.sex }), 6000);
  }

  // ---------------------------------------------------------------- bandeau d'état

  /** Puces du bandeau d'état : un maître attend (ou revient). */
  statusChips(chip) {
    const g = this.game;
    const v = this.visitor;
    if (!g.profile || !isStarted(g.profile, CAREER_ID) || !v || !v.npc.bubble.visible) return [];
    const text = v.returning
      ? t('dt_backChip', { owner: v.req.ownerName, dog: v.req.dog.name })
      : t('dt_waitingChip', { owner: v.req.ownerName, dog: v.req.dog.name });
    return [chip(text, t('cl_go'), () => this.goToVisitor())];
  }
}

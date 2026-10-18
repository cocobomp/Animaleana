// 🧭 Guide de randonnée (partie 3D) : des visiteurs arrivent près de l'écurie (ou du gîte en
// voyage) pour demander une balade ; on prépare (chevaux calmes, selle à la bonne taille, gourde,
// goûter, trousse de secours), puis on les emmène sur un itinéraire de balises avec des petits
// événements (cavalier à la traîne, cheval qui a peur, cavalier qui tombe, ruisseau, photo, pause boisson).
// La logique (règles, résultat) est dans src/sim/trailGuide.js ; l'interface dans src/ui/trailGuide.js.

import * as THREE from 'three';
import { ActivitySession, fmtActivityTime } from './Activities.js';
import { buildAvatar, animateAvatarWalk, updateAvatarLife, poseAvatar, animateAvatarRide } from './models/avatarModel.js';
import { stirrupFor } from './models/avatarMotion.js'; // pieds dans les étriers (comme le joueur, src/game/Player.js)
import { disposeModel } from './models/animalModel.js';
import { trailMarker, sightModel, guideArrow } from './models/course.js';
import { emojiTexture } from './textures.js';
import { navTarget } from './nav.js';
import { TACKROOM } from './farmLayout.js';
import { activityData } from '../sim/activities.js';
import { canRide } from '../sim/animal.js';
import { addStat, earn, isSandbox } from '../sim/profile.js';
import { PLACES } from '../sim/places.js';
import { hashString, mulberry32 } from '../sim/rng.js';
import {
  tgState, offerDue, createOffer, acceptOffer, refuseOffer, bookingHere, expireBookings, makeBooking, makeRiders, autoAssign,
  ridePlan, prepChecklist, weatherBlock, rideResult, applyRideResult, horseGains, explainOnce, perksOf, rankOf, changeReputation,
  firstAidState, helpFallen, gearFit, wornOfType, guideHorseFit, carriesAdult, FALL_WAIT,
  FUN, WATER_PER_MIN, addFun, STABLE_DOOR, LODGE_DOOR, RANK_IDS, TRAIL_GUIDE_CAREER, GROUPS, DURATIONS, ROUTES,
} from '../sim/trailGuide.js';
import { openBookingChat, openTrailPrep, showRideResult } from '../ui/trailGuide.js';
import { isStarted } from '../sim/careers.js'; // registre des métiers (💼)
import { GEAR, sizeOf } from '../sim/gear.js'; // sellerie (types d'objets : filet, licol, selle ; tailles)
import { TOOLS } from '../sim/tools.js'; // 🧰 trousse de secours
import { t, ta, L } from '../i18n.js';

const SKINS = [0xf5d3b8, 0xe8b796, 0xd09a72, 0xa9714b, 0x7a4b2e, 0x5a3a24];
const HAIRS = [0x1b1411, 0x4a2f1d, 0x8a5a2b, 0xd2a557, 0xa63a1f, 0x3b2a20];
const TOPS = [0xd8402f, 0x2f6fd8, 0xf2c230, 0x2a9a4a, 0x9a45d8, 0xff8a1f, 0x2fb8b0, 0xe07aa5];
const WAIT_SPOT = { home: { x: -10, z: -9 }, away: { x: 4, z: -8 } }; // devant l'écurie, ou devant le gîte

/** Petite étiquette (prénom, « Attendez-moi ! ») au-dessus d'une tête. */
function bubbleTexture(text, bg = 'rgba(30,60,40,0.7)') {
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 96;
  const ctx = c.getContext('2d');
  ctx.font = 'bold 36px system-ui, sans-serif';
  const w = Math.min(376, ctx.measureText(text).width + 40);
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.roundRect((384 - w) / 2, 16, w, 64, 32);
  ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 192, 49);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** L'apparence d'un cavalier visiteur (toujours la même pour un même prénom), bien variée d'un visiteur à l'autre. */
function riderLook(rider) {
  const rnd = mulberry32(hashString(`${rider.name}:${rider.id ?? ''}`));
  const one = (list) => list[Math.floor(rnd() * list.length)];
  const female = rider.sex === 'f';
  const senior = rider.age === 'senior';
  return {
    skin: one(SKINS),
    hair: senior ? one([0xbfbfbf, 0xd8d8d8, 0x9a9a9a]) : one(HAIRS),
    hairStyle: senior ? (female ? 'bun' : one(['short', 'bald'])) : female ? one(['ponytail', 'long', 'curly', 'bun', 'braid']) : one(['short', 'curly', 'short', 'bald']),
    top: one(TOPS),
    bottom: one([0x3a3f4a, 0x5a4a6a, 0x2f4f6f, 0x6b5a3a]),
    shoes: one([0x3b2a20, 0x222222, 0x6b4a2a]),
    hat: !senior && rnd() < 0.25,
  };
}

const riderScale = (rider) => (rider.age === 'child' ? 0.72 : rider.age === 'senior' ? 0.94 : 1);

// ---------------------------------------------------------------- visiteurs à pied

class Visitor {
  constructor(rider, world, scene, from, to) {
    this.rider = rider;
    this.world = world;
    this.scene = scene;
    this.avatar = buildAvatar(riderLook(rider));
    this.root = new THREE.Group();
    this.root.userData.visitor = this;
    this.avatar.root.scale.setScalar(riderScale(rider));
    this.root.add(this.avatar.root);
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(rider.name), depthTest: false, transparent: true }));
    this.tag.position.y = 2.05 * riderScale(rider);
    this.tag.scale.set(1.8, 0.45, 1);
    this.tag.renderOrder = 10;
    this.root.add(this.tag);
    this.root.position.set(from.x, world.heightAt(from.x, from.z), from.z);
    this.target = new THREE.Vector3(to.x, 0, to.z);
    this.heading = Math.atan2(to.x - from.x, to.z - from.z);
    this.speed = 0;
    this.phase = Math.random() * 6;
    this.time = Math.random() * 10;
    this.lifeOpts = { speed: 0, busy: false }; // options de updateAvatarLife, réutilisées
    // Bulle 💬 au-dessus du premier visiteur : « viens nous parler » (comme les clients, src/game/Clients.js).
    this.bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('💬'), depthTest: false, transparent: true }));
    this.bubble.position.y = 2.7 * riderScale(rider);
    this.bubble.scale.setScalar(0.9);
    this.bubble.renderOrder = 11;
    this.bubble.visible = false;
    this.root.add(this.bubble);
    scene.add(this.root);
  }

  get position() {
    return this.root.position;
  }

  update(dt, playerPos) {
    const p = this.root.position;
    const d = Math.hypot(this.target.x - p.x, this.target.z - p.z);
    let want = 0;
    if (d > 0.5) {
      const way = navTarget(p, this.target);
      const h = Math.atan2(way.x - p.x, way.z - p.z);
      let diff = h - this.heading;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 5);
      want = d > 6 ? 3 : 1.6;
    } else if (playerPos) {
      // On attend : on regarde le joueur.
      this.heading = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
    }
    this.speed += (want - this.speed) * Math.min(1, dt * 6);
    if (this.speed > 0.02) {
      p.x += Math.sin(this.heading) * this.speed * dt;
      p.z += Math.cos(this.heading) * this.speed * dt;
      this.world.resolveCollisions(p, 0.35);
    }
    p.y = this.world.heightAt(p.x, p.z);
    this.root.rotation.y = this.heading;
    this.time += dt;
    // Marche articulée, puis la vie (respiration, regard) ; on fait coucou au joueur qui approche.
    this.phase += dt * this.speed * 2.2;
    const a = this.avatar;
    const near = playerPos && Math.hypot(playerPos.x - p.x, playerPos.z - p.z) < 9;
    const wave = near && this.speed < 0.3 && this.waves;
    animateAvatarWalk(a, this.phase, this.speed);
    this.lifeOpts.speed = this.speed;
    this.lifeOpts.busy = wave;
    updateAvatarLife(a, dt, this.lifeOpts);
    if (wave) {
      a.arms[0].rotation.set(0, 0, 2.5 + Math.sin(this.time * 6) * 0.35);
      a.elbows[0].rotation.set(-0.35, 0, 0);
    }
    // Un enfant qui attend sautille.
    if (this.rider.age === 'child' && this.speed < 0.1) a.root.position.y = Math.abs(Math.sin(this.time * 5)) * 0.08;
    if (this.bubble.visible) this.bubble.position.y = 2.7 * riderScale(this.rider) + Math.sin(this.time * 3) * 0.08;
  }

  dispose() {
    this.scene.remove(this.root);
    disposeModel(this.avatar.root);
    this.tag.material.map.dispose();
    this.tag.material.dispose();
    this.bubble.material.dispose();
  }
}

// ---------------------------------------------------------------- le métier dans le jeu

export class TrailGuide {
  constructor(game) {
    this.game = game;
    this.visitors = [];
    this.visitorsFor = null; // 'offer' | 'booking'
    this.worldGroup = null;
    this.profileRef = null;
    this.acc = 0;
    this.soon = false; // le métier vient de commencer : les premiers visiteurs arrivent vite
    this.needs = new Map(); // chevaux à seller : l'objet qui manque, à acheter ({ item, size })
    game.clients?.registerGuide?.('trailGuide', (action) => this.showMeAction(action)); // « 👉 Montre-moi » du carnet
    // Métier commencé depuis le panneau 💼 (ou la proposition à l'écurie) : des visiteurs arrivent bientôt.
    game.on?.('careerStarted', (id) => {
      if (id !== 'trailGuide' || !game.profile) return;
      this.st.nextOfferAt = 0;
      this.soon = true;
    });
  }

  get st() {
    return tgState(this.game.profile);
  }

  get p() {
    return this.game.profile;
  }

  /** La balade prévue ici (acceptée), ou null. */
  get booking() {
    const g = this.game;
    return g.profile ? bookingHere(g.profile, g.profile.place, g.day) : null;
  }

  get session() {
    const s = this.game.activities.session;
    return s instanceof GuidedRideSession ? s : null;
  }

  // ------------------------------------------------------------ boucle

  update(dt) {
    const g = this.game;
    if (!g.running || !g.profile) {
      if (this.visitors.length) this.clearVisitors();
      this.worldGroup = null;
      return;
    }
    if (g.world.group !== this.worldGroup || g.profile !== this.profileRef) this.sync();
    for (const v of this.visitors) v.update(dt, g.player.position);
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    const p = g.profile;
    const st = this.st;
    // Rendez-vous ratés
    if (expireBookings(p, g.day).length) {
      g.ui.toast(t('tg_missed'), 6000);
      g.ui.refresh();
    }
    // La demande du jour n'a pas eu de réponse : les visiteurs repartent le soir.
    if (st.offer && (st.offer.askedDay !== g.day || g.hour >= 18)) {
      st.offer = null;
      this.clearVisitors();
      g.ui.refresh();
    }
    // Les visiteurs d'une balade acceptée ici attendent près de l'écurie.
    const b = this.booking;
    if (b && !this.session && this.visitorsFor !== 'booking') this.spawnVisitors(b, 'booking');
    if (!b && this.visitorsFor === 'booking') this.clearVisitors();
    // Une nouvelle demande ? (pas pendant une épreuve ou une séance : les visiteurs viendront après)
    if (!b && !this.session && !g.activities?.active && !g.ui.isBlocking?.() && g.arrivals?.free() !== false // (chacun son tour : src/game/arrivals.js)
      && offerDue(p, { level: g.level, clock: p.clock, hour: g.hour, place: p.place })
      && (this.soon || Math.random() < 0.35)) {
      this.soon = false;
      this.newOffer();
    }
  }

  /** Après un changement de lieu ou de profil : on replace les visiteurs attendus. */
  sync() {
    const g = this.game;
    this.worldGroup = g.world.group;
    this.profileRef = g.profile;
    this.clearVisitors();
    const st = this.st;
    if (!this.session) st.riding = false; // (sauvegarde faite pendant une balade)
    const b = this.booking;
    if (b) this.spawnVisitors(b, 'booking');
    else if (st.offer && st.offer.askedPlace === g.profile.place && st.offer.askedDay === g.day) this.spawnVisitors(st.offer, 'offer');
    else st.offer = null;
  }

  newOffer(opts = {}) {
    const g = this.game;
    const st = this.st;
    const offer = opts.booking ?? createOffer(g.profile, { day: g.day, place: g.profile.place, clock: g.profile.clock });
    st.offer = offer;
    offer.askedPlace = g.profile.place;
    offer.askedDay = g.day;
    this.spawnVisitors(offer, 'offer');
    g.arrivals?.note();
    g.ui.toast(t(g.isHome ? 'tg_arrived' : 'tg_arrivedAway'), 6000, { group: 'visitors' });
    g.ui.refresh();
    return offer;
  }

  /**
   * Force une demande tout de suite (console : game.trailGuide.force()).
   * opts : { group, duration, route, here }
   */
  force(opts = {}) {
    const g = this.game;
    const b = makeBooking(g.profile, { day: g.day, place: g.profile.place, here: opts.here !== false });
    if (opts.group && GROUPS[opts.group]) {
      b.group = opts.group;
      b.riders = makeRiders(opts.group);
    }
    if (opts.duration && DURATIONS[opts.duration]) {
      b.duration = opts.duration;
      b.hours = DURATIONS[opts.duration].hours;
      b.price = Math.round(DURATIONS[opts.duration].price * b.riders.length);
    }
    if (opts.route && ROUTES[opts.route]) b.route = opts.route;
    b.price = Math.round(DURATIONS[b.duration].price * b.riders.length);
    return this.newOffer({ booking: b });
  }

  spawnVisitors(booking, why) {
    const g = this.game;
    this.clearVisitors();
    this.visitorsFor = why;
    const spot = g.isHome ? WAIT_SPOT.home : WAIT_SPOT.away;
    booking.riders.forEach((r, i) => {
      const to = { x: spot.x + (i % 3) * 1.3 - 1.3, z: spot.z - Math.floor(i / 3) * 1.2 };
      const from = { x: to.x + 6, z: to.z - 26 };
      const v = new Visitor(r, g.world, g.scene, from, to);
      v.waves = i === 0; // le premier fait coucou
      v.bubble.visible = i === 0 && why === 'offer'; // 💬 : ils attendent qu'on vienne leur parler
      this.visitors.push(v);
    });
  }

  clearVisitors() {
    for (const v of this.visitors) v.dispose();
    this.visitors = [];
    this.visitorsFor = null;
  }

  /** Position des visiteurs (pour le repère « Montre-moi »). */
  visitorSpot() {
    return this.visitors[0]?.position ?? null;
  }

  // ------------------------------------------------------------ toucher / parler

  onTap(raycaster) {
    if (!this.visitors.length || this.session) return false;
    const hit = raycaster.intersectObjects(this.visitors.map((v) => v.root), true)[0];
    if (!hit) return false;
    const g = this.game;
    const v = this.visitors.find((x) => { let o = hit.object; while (o && o !== x.root) o = o.parent; return !!o; });
    if (!v) return false;
    if (g.paused) this.talk();
    else g.walkTo(v.position, 1.8, () => this.talk(), true);
    return true;
  }

  focusNear(pp) {
    if (!this.visitors.length || this.session) return null;
    const v = this.visitors.find((x) => Math.hypot(x.position.x - pp.x, x.position.z - pp.z) < 2.6);
    return v ? { kind: 'trailVisitor', key: 'tg' } : null;
  }

  talk() {
    const g = this.game;
    if (this.st.offer && this.visitorsFor === 'offer') {
      this.tutorial('accept');
      openBookingChat(g.ui, this);
    } else if (this.booking) {
      this.tutorial('prepare');
      openTrailPrep(g.ui, this);
    }
  }

  /** Petit tutoriel la première fois qu'on fait une action du carnet. */
  tutorial(actionId) {
    const g = this.game;
    // Carnet du panneau 💼 : l'action se coche (et donne un peu d'XP de métier la première fois).
    if (isStarted(g.profile, 'trailGuide')) g.clients?.noteCareer?.('trailGuide', actionId);
    if (!explainOnce(g.profile, actionId)) return;
    // Pendant la balade, les consignes de l'activité expliquent déjà (et le carnet garde l'explication) :
    // pas de grand message en plus par-dessus.
    if (this.session) return;
    const text = t(`tg_tuto_${actionId}`);
    g.ui.toast(text, 10000);
    g.ui.tutorial?.speak?.(text);
  }

  accept() {
    const g = this.game;
    const b = acceptOffer(g.profile, g.day); // la première fois, le métier commence dans le registre 💼
    if (!b) return null;
    // Pas de nouveaux visiteurs tout de suite (le temps de préparer, ou de partir au rendez-vous).
    this.st.nextOfferAt = g.profile.clock + 3 * 60;
    this.soon = false;
    if (b.careerStarted) {
      delete b.careerStarted;
      g.ui.toast(t('ca_started', { career: t('career_trailGuide') }), 6000);
      g.emit('careerStarted', 'trailGuide');
    }
    g.clients?.noteCareer?.('trailGuide', 'accept');
    if (b.place === g.profile.place && b.day === g.day) {
      this.visitorsFor = 'booking';
    } else {
      // Rendez-vous ailleurs : les visiteurs repartent, on les retrouvera là-bas.
      this.clearVisitors();
    }
    g.save();
    g.ui.refresh();
    return b;
  }

  refuse() {
    const g = this.game;
    refuseOffer(g.profile, g.profile.clock);
    this.clearVisitors();
    g.ui.refresh();
  }

  cancelBooking(b) {
    const g = this.game;
    const st = this.st;
    st.bookings = st.bookings.filter((x) => x.id !== b.id);
    changeReputation(g.profile, -3); // les visiteurs sont déçus
    this.clearVisitors();
    g.ui.closePanel();
    g.ui.refresh();
  }

  // ------------------------------------------------------------ préparer

  /** Nos chevaux présents ici. */
  horses() {
    return this.game.animalsHere().filter((a) => a.species === 'horse');
  }

  checklist(b) {
    const g = this.game;
    return prepChecklist(b, {
      horses: this.horses(), guideHorseId: b.guideHorseId ?? null, weather: g.weather, temperature: g.temperature, firstAid: firstAidState(g.profile),
    });
  }

  autoAssign(b) {
    const horses = this.horses();
    autoAssign(b, horses, b.guideHorseId ? [b.guideHorseId] : []);
    if (!b.guideHorseId) {
      const taken = new Set(b.riders.map((r) => r.horseId));
      const score = (h) => (h.bond ?? 0) + (carriesAdult(h) ? 100 : 0) + (canRide(h).ok ? 200 : 0);
      const mine = horses.filter((h) => !taken.has(h.id)).sort((x, y) => score(y) - score(x))[0];
      if (mine) b.guideHorseId = mine.id;
    }
  }

  /**
   * Seller un cheval pour un cavalier (ou pour nous) : filet (ou licol pour un poney mené) et selle,
   * à sa taille (src/sim/gear.js : à la maison, la sellière échange la taille ; en voyage, seul le coffre compte).
   * Renvoie true si le cheval est prêt.
   */
  saddleUp(horse, rider = null) {
    const g = this.game;
    const led = rider ? gearFit(horse, rider).led : false;
    // Filet (ou licol pour un poney mené) : on remet seulement ce qui manque ou n'est pas à sa taille.
    const put = (type) => {
      const r = g.equip(horse, type);
      // Pas d'exemplaire libre à sa taille : on propose de l'acheter tout de suite (bouton de la liste).
      if (!r?.ok) this.needs.set(horse.id, { item: type, size: sizeOf(horse) ?? 'horse', reason: r?.reason });
      return !!r?.ok;
    };
    const head = wornOfType(horse, 'bridle') ?? wornOfType(horse, 'halter');
    if ((!head || !head.fits) && !put(head ? GEAR[head.item].type : led ? 'halter' : 'bridle')) return false;
    // La selle (pas pour un poney mené ; notre cheval peut aussi partir à cru).
    if (rider && !led) {
      const saddle = wornOfType(horse, 'saddle');
      if ((!saddle || !saddle.fits) && !put('saddle')) return false;
    }
    const ok = rider ? gearFit(horse, rider).ok : guideHorseFit(horse).ok;
    if (ok) {
      this.needs.delete(horse.id);
      g.ui.toast(t('tg_saddled', { horse: horse.name, g: horse.sex }), 2500);
      g.save();
    }
    return ok;
  }

  /** Ce qu'il faudrait acheter pour seller ce cheval ({ item, size }), ou null. */
  needFor(horseId) {
    return this.needs.get(horseId) ?? null;
  }

  /** Acheter l'objet qui manque (à la taille du cheval), puis seller. */
  buyAndSaddle(horse, rider) {
    const g = this.game;
    const need = this.needFor(horse.id);
    if (!need) return this.saddleUp(horse, rider);
    const r = g.buyGear(need.item, need.size);
    if (!r?.ok) return false;
    this.needs.delete(horse.id);
    return this.saddleUp(horse, rider);
  }

  /** Acheter la trousse de secours 🧰 (outil « firstAid ») : à la sellerie, ou ici (elle va dans la sacoche). */
  async buyFirstAid() {
    const g = this.game;
    const key = isSandbox(g.profile) ? 'tg_kitBuyFree' : firstAidState(g.profile) === 'atHome' ? 'tg_kitBuyAway' : 'tg_kitBuy';
    const ok = await g.ui.confirm(t(key, { price: TOOLS.firstAid.price }));
    if (!ok) return false;
    const r = g.buyTool('firstAid');
    if (r?.ok) g.save();
    return !!r?.ok;
  }

  /** Gourde ou goûter : on va à la sellerie (si elle existe ici), puis c'est pris. */
  takeSupply(b, kind) {
    const g = this.game;
    const done = () => {
      b.prep[kind] = true;
      g.ui.toast(t(`tg_took_${kind}`), 3000);
      g.save();
      g.ui.renderPanel?.();
    };
    const tack = g.world.interactables.find((i) => i.kind === 'tackroom');
    const spot = tack ?? (g.isHome ? { x: TACKROOM.x + 3.9, z: TACKROOM.z } : LODGE_DOOR);
    const d = Math.hypot(spot.x - g.player.position.x, spot.z - g.player.position.z);
    if (d < 4 || g.paused) return done();
    g.ui.toast(t(tack ? 'tg_goTack' : 'tg_goLodge'), 3000); // en voyage : au gîte
    g.ui.closePanel();
    g.walkTo(new THREE.Vector3(spot.x, 0, spot.z), 1.5, () => { done(); openTrailPrep(g.ui, this); });
  }

  /** « 👉 Montre-moi » du carnet (panneau 💼) : où faire cette action du métier. */
  showMeAction(action) {
    const g = this.game;
    const b = this.booking;
    if (this.session) return g.ui.toast(t('tg_hintStart'), 5000);
    if (this.visitors.length) {
      this.showMe(this.visitors[0].root);
      return g.ui.toast(t(this.visitorsFor === 'offer' ? 'tg_chip_visitor' : 'tg_waiting'), 5000);
    }
    if (b && action !== 'accept') return openTrailPrep(g.ui, this);
    const door = g.world.interactables.find((i) => i.kind === 'stable') ?? g.world.interactables.find((i) => i.kind === 'lodge');
    if (door) this.showMe({ x: door.x, z: door.z });
    // On attend des visiteurs : ils arrivent bientôt (entre 9 h et 17 h), sans attendre des heures.
    if (g.level >= TRAIL_GUIDE_CAREER.level && !this.st.offer) {
      this.st.nextOfferAt = Math.min(this.st.nextOfferAt, g.profile.clock);
      this.soon = true;
    }
    g.ui.toast(t(g.level >= TRAIL_GUIDE_CAREER.level ? 'tg_noBooking' : 'tg_level', { n: TRAIL_GUIDE_CAREER.level }), 6000);
  }

  /** Montre où est quelque chose : un cheval, la sellerie, les visiteurs. */
  showMe(target) {
    const g = this.game;
    g.ui.closePanel();
    g.marker.show(target, { height: target?.label ? undefined : 3 });
    clearTimeout(this.showTimer);
    this.showTimer = setTimeout(() => { if (g.marker.target === target) g.marker.hide(); }, 20000);
  }

  /** Tout est coché : on part ! */
  startRide(b) {
    const g = this.game;
    const check = this.checklist(b);
    const wb = weatherBlock(g.weather, g.temperature);
    if (wb) return g.ui.toast(t('tg_postponed', { why: t(`tg_reason_${wb}`) }), 6000);
    if (!check.ok) return g.ui.toast(t('tg_notReady'), 4000);
    const horses = this.horses();
    const guide = horses.find((h) => h.id === b.guideHorseId);
    const riders = b.riders.map((r) => ({ rider: r, animal: horses.find((h) => h.id === r.horseId) }));
    if (!guide || riders.some((x) => !x.animal || !g.entities.get(x.animal.id))) return g.ui.toast(t('tg_noHorses'), 5000);
    g.ui.closePanel();
    if (g.activities.session) g.activities.session.end(true);
    // Les chevaux sortent de leur box (écurie, src/game/Interiors.js) et ne suivent plus personne.
    for (const a of [guide, ...riders.map((x) => x.animal)]) {
      a.stalled = false;
      a.following = false;
    }
    this.tutorial('ride');
    const s = new GuidedRideSession(g.activities, 'trail', { tg: this, booking: b, guide, riders });
    if (!s.ok) {
      s.end(true);
      return null;
    }
    g.activities.session = s;
    this.clearVisitors();
    this.st.riding = true;
    g.save();
    g.ui.refresh();
    return s;
  }

  /** Fin de la balade : résultat appliqué, fenêtre de résultats, les visiteurs repartent. */
  finishRide(session, result) {
    const g = this.game;
    const p = g.profile;
    const b = session.booking;
    const home = g.isHome;
    const applied = applyRideResult(p, b, result, { day: g.day, earn: (n) => earn(p, n), home });
    const gains = horseGains(b);
    for (const { animal } of [...session.riders, { animal: session.guide }]) {
      animal.skills.endurance = Math.min(100, (animal.skills.endurance ?? 10) + gains.endurance);
      animal.bond = Math.min(100, (animal.bond ?? 0) + gains.bond);
      animal.needs.energy = Math.max(0, animal.needs.energy - (b.duration === 'short' ? 15 : 25));
      animal.needs.exercise = Math.min(100, animal.needs.exercise + 40);
    }
    addStat(p, 'actvTrail');
    g.xp('activity');
    this.st.riding = false;
    this.st.nextOfferAt = p.clock + 180; // les prochains visiteurs attendent 3 h
    g.save();
    g.ui.refresh();
    this.tutorial('return');
    showRideResult(g.ui, {
      booking: b, result, applied, gains, sandbox: isSandbox(p),
      rankName: t(`tg_rank_${RANK_IDS[applied.rank]}`),
      onClose: () => session.end(false),
    });
  }

  /** Balade arrêtée en route : les visiteurs sont déçus. */
  abortRide(session) {
    const g = this.game;
    const p = g.profile;
    const result = rideResult({
      riders: session.booking.riders, legs: session.next, totalLegs: session.points.length, booking: session.booking, perks: perksOf(p), aborted: true,
      falls: session.falls ?? 0, helped: session.helped ?? 0,
    });
    applyRideResult(p, session.booking, result, { day: g.day, earn: (n) => earn(p, n), home: g.isHome });
    this.st.riding = false;
    g.save();
    g.ui.refresh();
  }

  // ------------------------------------------------------------ bandeau d'état

  statusChips(chip) {
    const g = this.game;
    const out = [];
    const st = this.st;
    if (this.session) {
      out.push(chip(`🧭 ${t('tg_chip_riding')}`, t('tg_chip_open'), () => g.ui.openTrailGuide()));
      return out;
    }
    if (st.offer && this.visitorsFor === 'offer') out.push(chip(`🧭 ${t('tg_chip_visitor')}`, t('tg_talk'), () => this.talk()));
    const b = this.booking;
    if (b) out.push(chip(`🧭 ${t('tg_chip_booking')}`, t('tg_prepareBtn'), () => this.talk()));
    for (const x of st.bookings) {
      if (x === b) continue;
      out.push(chip(`🧭 ${t('tg_chip_away', { place: L(PLACES[x.place]?.name) || x.place, day: x.day })}`, t('tg_chip_open'), () => g.ui.openTrailGuide()));
    }
    return out;
  }
}

// ---------------------------------------------------------------- la balade guidée

const FORWARD = (h) => new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

class GuidedRideSession extends ActivitySession {
  constructor(mgr, type, opts) {
    super(mgr, type, opts);
    const g = this.game;
    const w = g.world;
    this.tg = opts.tg;
    this.booking = opts.booking;
    this.guide = opts.guide;
    // Titre : « Balade guidée » au lieu de « Balade ».
    const titleEl = this.hud.root.querySelector('.actv-title span');
    if (titleEl) titleEl.textContent = `🧭 ${t('tg_rideTitle')}`;

    // Notre monture.
    const ge = g.entities.get(this.guide.id);
    if (!ge) {
      this.ok = false;
      return;
    }
    if (g.player.mount && g.player.mount !== ge) g.dismount();
    if (!g.player.mount) {
      ge.position.set(STABLE_DOOR.x, 0, STABLE_DOOR.z - 2);
      ge.snap();
      if (!g.ride(this.guide)) {
        this.ok = false;
        return;
      }
    }
    this.mount = ge;

    // Les cavaliers sur leurs chevaux.
    this.riders = opts.riders.map(({ rider, animal }, i) => {
      const e = g.entities.get(animal.id);
      this.script(e);
      const avatar = buildAvatar(riderLook(rider));
      avatar.root.scale.setScalar(riderScale(rider));
      const bubble = new THREE.Sprite(new THREE.SpriteMaterial({ map: bubbleTexture(rider.name), depthTest: false, transparent: true }));
      bubble.position.y = e.label.position.y + 0.5;
      bubble.scale.set(2.2, 0.55, 1);
      bubble.renderOrder = 11;
      e.root.add(bubble);
      const r = { rider, animal, e, avatar, bubble, gap: 3.6, lag: null, scared: null, fallen: null, bubbleUntil: 0, lastGood: 0 };
      this.seatRider(r);
      return r;
    });

    // Les chiens qui viennent (rang confirmé).
    this.dogs = [];
    if (this.booking.prep?.dogs) {
      for (const d of g.animalsHere().filter((a) => a.species === 'dog' && !a.sick).slice(0, 2)) {
        if (!d.following) {
          d.following = true;
          this.dogs.push(d);
        }
        g.callHere(d);
      }
    }

    // Itinéraire : on évite l'eau (on rapproche la balise de la ferme).
    const dry = (pt) => {
      const q = { ...pt };
      for (let i = 0; i < 20 && w.isWater(q.x, q.z); i++) {
        q.x *= 0.9;
        q.z *= 0.9;
      }
      return q;
    };
    const plan = ridePlan(this.booking);
    this.points = plan.points.map(dry);
    this.markers = this.points.map((pt, i) => this.put(trailMarker(i + 1, pt.kind !== 'marker'), pt.x, pt.z));
    this.arrow = guideArrow(0xff8a1f);
    this.group.add(this.arrow);

    // Événements du chemin, placés au milieu de leur étape.
    const mid = (leg, side = 0) => {
      const a = leg === 0 ? STABLE_DOOR : this.points[leg - 1];
      const b = this.points[leg];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      return { x: (a.x + b.x) / 2 + (-(b.z - a.z) / len) * side, z: (a.z + b.z) / 2 + ((b.x - a.x) / len) * side, dir: Math.atan2(b.x - a.x, b.z - a.z) };
    };
    const along = (leg, f) => {
      const a = leg === 0 ? STABLE_DOOR : this.points[leg - 1];
      const b = this.points[leg];
      return { x: a.x + (b.x - a.x) * f, z: a.z + (b.z - a.z) * f, dir: Math.atan2(b.x - a.x, b.z - a.z) };
    };
    this.events = plan.events.map((ev) => {
      // Le sac qui fait peur est au bord du chemin ; le point de vue (moulin, vieil arbre…) un peu à l'écart, pour
      // qu'on le voie bien sans passer à travers.
      const side = ev.type === 'scare' ? 3 : ev.type === 'sight' ? (ev.id === 'windmill' || ev.id === 'oldTree' ? 10 : 6) : 0;
      const e = { ...ev, done: false, active: false, pos: dry(mid(ev.leg, side)) };
      if (ev.type === 'scare') {
        e.sprite = this.sprite('🛍️', e.pos, 1.1, 0.9);
        e.sprite.visible = false;
      } else if (ev.type === 'fall') {
        e.pos = dry(along(ev.leg, 0.4)); // une grosse racine, un peu avant le milieu de l'étape
        e.sprite = this.sprite('🪨', e.pos, 0.7, 0.8);
      } else if (ev.type === 'stream') {
        const plane = new THREE.Mesh(new THREE.PlaneGeometry(18, 5), new THREE.MeshBasicMaterial({ color: 0x5fb6ff, transparent: true, opacity: 0.55, depthWrite: false }));
        plane.rotation.x = -Math.PI / 2;
        plane.rotation.z = e.pos.dir; // en travers du chemin
        plane.position.set(e.pos.x, this.y(e.pos.x, e.pos.z) + 0.06, e.pos.z);
        this.group.add(plane);
        e.plane = plane;
        e.sprite = this.sprite('💧', e.pos, 2.6, 0.9);
      } else if (ev.type === 'sight') {
        const m = sightModel(ev.id);
        this.put(m, e.pos.x, e.pos.z, Math.atan2(-e.pos.x, -e.pos.z));
        e.sprite = this.sprite('📷', e.pos, ev.id === 'windmill' ? 8.6 : ev.id === 'oldTree' ? 8 : 3.4, 1.3);
      } else if (ev.type === 'break') {
        e.sprite = this.sprite('🧺', e.pos, 1.4, 1.1);
        const ring = new THREE.Mesh(new THREE.RingGeometry(2.4, 2.8, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.6, depthWrite: false }));
        ring.position.set(e.pos.x, this.y(e.pos.x, e.pos.z) + 0.08, e.pos.z);
        this.group.add(ring);
        e.ring = ring;
      }
      return e;
    });
    this.totalEvents = this.events.length;
    this.handled = 0;
    this.photos = 0;
    this.falls = 0; // cavaliers tombés…
    this.helped = 0; // … et aidés à remonter
    this.kit = firstAidState(g.profile) === 'ok'; // 🧰 trousse de secours dans la sacoche
    this.water = 100;
    this.next = 0;
    this.lostTimer = 0;
    this.thirstWarned = false;
    this.mode = null; // bouton principal : 'photo' | 'reassure' | 'break' | 'sleep'
    this.lodgeStop = false;

    // Départ : tout le monde en file derrière nous.
    const first = this.points[0];
    const heading = Math.atan2(first.x - STABLE_DOOR.x, first.z - STABLE_DOOR.z);
    this.teleportPlayer(STABLE_DOOR.x, STABLE_DOOR.z, heading);
    this.riders.forEach((r, i) => {
      r.e.position.set(STABLE_DOOR.x - Math.sin(heading) * r.gap * (i + 1), 0, STABLE_DOOR.z - Math.cos(heading) * r.gap * (i + 1));
      r.e.heading = heading;
      r.e.speed = 0;
      r.e.snap();
    });
    this.hud.setMain(null);
    this.hud.hint(t('tg_hintStart'), 10000);
    this.refreshHud();
  }

  sprite(emoji, pos, up = 1.2, size = 1) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji), transparent: true, depthWrite: false }));
    s.scale.setScalar(size);
    const y = this.y(pos.x, pos.z) + up;
    s.position.set(pos.x, y, pos.z);
    s.userData.bob = y;
    this.group.add(s);
    return s;
  }

  async quit() {
    if (this.state === 'done') return;
    if (await this.game.ui.confirm(t('tg_quitConfirm'))) this.end(true);
  }

  onKeyDown(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      this.action();
    }
  }

  /** Bulle au-dessus d'un cavalier (« Attendez-moi ! »). */
  say(r, key, ms = 3500) {
    r.bubble.material.map.dispose();
    r.bubble.material.map = bubbleTexture(ta(key, r.rider), 'rgba(255,255,255,0.92)');
    r.bubble.material.needsUpdate = true;
    r.bubbleUntil = this.time + ms / 1000;
  }

  everyone(n) {
    for (const r of this.riders) addFun(r.rider, n);
  }

  avgFun() {
    return Math.round(this.riders.reduce((s, r) => s + r.rider.fun, 0) / Math.max(1, this.riders.length));
  }

  refreshHud() {
    const total = this.points.length;
    this.hud.stats([
      ['🚩', `${Math.min(this.next + 1, total)}/${total}`],
      ['😊', `${this.avgFun()} %`],
      ['💧', `${Math.round(this.water)} %`],
      ['📷', String(this.photos)],
      ['⏱️', fmtActivityTime(this.clock)],
    ]);
  }

  setMode(mode, enabled = true) {
    if (mode === this.mode && this.mainEnabled === enabled) return;
    this.mode = mode;
    this.mainEnabled = enabled;
    if (!mode) return this.hud.setMain(null);
    const spec = {
      photo: { icon: '📷', label: t('tg_btn_photo') },
      reassure: { icon: '🤚', label: t('tg_btn_reassure') },
      break: { icon: '🧃', label: t('tg_btn_break') },
      sleep: { icon: '🛏️', label: t('tg_btn_sleep') },
      firstAid: { icon: this.kit ? '🩹' : '🤝', label: t(this.kit ? 'tg_btn_firstAid' : 'tg_btn_help') },
    }[mode];
    this.hud.setMain({ ...spec, key: t('actv_key_space'), onClick: () => this.action(), disabled: !enabled });
  }

  // ------------------------------------------------------------ actions du joueur

  action() {
    if (this.state !== 'run' || !this.mode || !this.mainEnabled) return;
    // L'événement du bouton (plusieurs peuvent être en cours : un retardataire pendant la photo…).
    const TYPE = { photo: 'sight', reassure: 'scare', break: 'break', firstAid: 'fall' };
    const ev = this.events.find((x) => x.active && !x.done && x.type === TYPE[this.mode] && (x.type !== 'scare' && x.type !== 'fall' || x.since)) ?? null;
    if (!ev && this.mode !== 'sleep') return null;
    switch (this.mode) {
      case 'photo': return this.takeGroupPhoto(ev);
      case 'reassure': return this.reassure(ev);
      case 'break': return this.snackBreak(ev);
      case 'sleep': return this.sleepAtLodge();
      case 'firstAid': return this.tendFallen(ev);
      default: return null;
    }
  }

  /** Toucher un cheval qui a peur (ou le bouton Rassurer), ou le cavalier tombé (ou le bouton Soigner). */
  onTap(sx, sy) {
    const g = this.game;
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    g.raycaster.setFromCamera(ndc, g.camera);
    const fall = this.events.find((x) => x.type === 'fall' && x.active && x.since);
    if (fall && g.raycaster.intersectObject(fall.rider.avatar.root, true)[0]) {
      this.tendFallen(fall);
      return true;
    }
    const ev = this.events.find((x) => x.type === 'scare' && x.active);
    if (!ev) return false;
    const hit = g.raycaster.intersectObject(ev.rider.e.root, true)[0];
    if (!hit) return false;
    this.reassure(ev);
    return true;
  }

  /** Assied un cavalier sur son cheval : pieds dans les étriers, mains aux rênes (comme le joueur). */
  seatRider(r) {
    const { e, animal, avatar } = r;
    const md = e.model;
    const sc = e.scale;
    const s = riderScale(r.rider);
    const look = animal.look;
    const seatY = md.saddleY * sc - 0.78 * s;
    const seatZ = -look.bodyLen * sc * 0.05;
    const R = ((md.dims?.R ?? look.bodyR * (look.fluff ?? 1)) * sc) / s; // dans le repère de l'avatar (enfant plus petit)
    const saddle = !!animal.gear?.saddle;
    const foot = stirrupFor(R, saddle, {});
    e.root.add(avatar.root);
    avatar.root.rotation.set(0, 0, 0);
    r.ride = {
      gait: 0, phase: Math.random() * 6, bob: 0, posting: saddle,
      seatY, seatZ, reinsY: 1.02, reinsZ: 0.36, footX: foot.x, footY: foot.y, footZ: foot.z, kneeOut: foot.out,
    };
    poseAvatar(avatar, 'ride', r.ride);
  }

  /** Le cheval trébuche : son cavalier tombe à côté, assis dans l'herbe. */
  fallOff(ev) {
    const g = this.game;
    const r = ev.rider;
    ev.since = this.time;
    r.fallen = ev;
    r.e.speed = 0;
    this.falls++;
    const side = FORWARD(r.e.heading + Math.PI / 2).multiplyScalar(1.8);
    const x = r.e.position.x + side.x;
    const z = r.e.position.z + side.z;
    r.e.root.remove(r.avatar.root);
    poseAvatar(r.avatar, 'stand');
    // Couché sur le dos, la tête vers le cheval : il a juste eu peur.
    r.avatar.root.position.set(x, this.y(x, z) + 0.14 * riderScale(r.rider), z);
    r.avatar.root.rotation.set(-Math.PI / 2, 0, 0);
    r.avatar.root.rotation.order = 'YXZ';
    r.avatar.root.rotation.y = r.e.heading + Math.PI / 2;
    this.group.add(r.avatar.root);
    // Bien visible de loin : 🤕 au-dessus de lui et un cercle orange par terre (on doit venir là).
    ev.sprite.visible = false;
    ev.hurt = this.sprite('🤕', { x, z }, 1.5, 1.2);
    ev.ring = new THREE.Mesh(new THREE.RingGeometry(1.9, 2.3, 36).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xff8a1f, transparent: true, opacity: 0.7, depthWrite: false }));
    ev.ring.position.set(x, this.y(x, z) + 0.08, z);
    this.group.add(ev.ring);
    addFun(r.rider, FUN.fall);
    r.e.emit('😮', 2);
    this.say(r, 'tg_bubble_ouch', 5000);
    this.hud.big('🤕', 900);
    this.hud.hint(ta(this.kit ? 'tg_ev_fall' : 'tg_ev_fallNoKit', r.rider), 10000);
    g.audio?.ui?.('cancel'); // petit son « oh non »
  }

  /** On aide le cavalier tombé : trousse de secours, pansement, et il remonte en selle. */
  tendFallen(ev) {
    const g = this.game;
    if (!ev || ev.type !== 'fall' || !ev.since || ev.done) return;
    const r = ev.rider;
    const d = dist2(g.player.position, r.avatar.root.position);
    if (d > 4.5) return g.ui.toast(ta('tg_ev_fallFar', r.rider), 3000);
    ev.done = true;
    ev.active = false;
    r.fallen = null;
    this.handled++;
    this.helped++;
    const res = helpFallen(r.rider, { kit: this.kit, waited: this.time - ev.since });
    this.everyone(FUN.eventGood / 2);
    this.group.remove(r.avatar.root);
    this.seatRider(r);
    if (ev.hurt) ev.hurt.material.map = emojiTexture(this.kit ? '🩹' : '✅');
    if (ev.ring) ev.ring.visible = false;
    this.burst(this.kit ? '🩹' : '❤️', { x: r.e.position.x, y: r.e.position.y + 2, z: r.e.position.z }, 4, 1.4);
    r.e.emit('❤️', 3);
    this.say(r, res.mood === 'great' ? 'tg_bubble_thanks' : 'tg_bubble_hurt', 4000);
    g.ui.toast(ta(this.kit ? (res.mood === 'great' ? 'tg_ev_fallOk' : 'tg_ev_fallLate') : 'tg_ev_fallNoKitOk', r.rider), 4500);
    if (this.kit) this.tg.tutorial('firstAid');
    this.setMode(null);
  }

  takeGroupPhoto(ev) {
    const g = this.game;
    ev.done = true;
    ev.active = false;
    this.photos++;
    this.handled++;
    ev.sprite.material.map = emojiTexture('✅');
    for (const r of this.riders) {
      if (r.fallen) continue;
      r.avatar.arms.forEach((arm) => arm.rotation.set(-2.8, 0, 0)); // bras levés : on pose !
      r.avatar.elbows?.forEach((el) => el.rotation.set(0, 0, 0));
      r.poseUntil = this.time + 2.5;
      r.e.speed = 0;
    }
    this.say(this.riders[0], 'tg_bubble_cheese');
    this.everyone(FUN.photo);
    setTimeout(() => { if (!this.ended) this.savePhoto(); }, 400);
    this.hud.flash();
    g.ui.toast(t('tg_ev_photoDone'), 3500);
    g.xp('photo');
    addStat(g.profile, 'actvPhotos');
    this.tg.tutorial('photo');
    this.burst('✨', { x: ev.pos.x, y: this.y(ev.pos.x, ev.pos.z) + 2, z: ev.pos.z }, 6, 3);
    this.setMode(null);
  }

  /** Photo de l'écran gardée dans l'album (comme la balade libre). */
  savePhoto() {
    const g = this.game;
    try {
      g.renderer.render(g.scene, g.camera);
      const src = g.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 192;
      c.height = 120;
      const ctx = c.getContext('2d');
      const ratio = c.width / c.height;
      let sw = src.width;
      let sh = sw / ratio;
      if (sh > src.height) {
        sh = src.height;
        sw = sh * ratio;
      }
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      const d = activityData(g.profile);
      d.photos.push({ sight: 'trailGuide', day: g.day, place: g.profile.place, data: c.toDataURL('image/jpeg', 0.7) });
      if (d.photos.length > 24) d.photos.shift();
    } catch {
      /* pas de photo possible : tant pis */
    }
  }

  reassure(ev) {
    const g = this.game;
    const r = ev.rider;
    const d = dist2(g.player.position, r.e.position);
    if (d > 4.5) return g.ui.toast(ta('tg_ev_scareFar', r.animal, { horse: r.animal.name }), 3000);
    ev.done = true;
    ev.active = false;
    r.scared = null;
    this.handled++;
    r.e.emit('❤️', 3);
    const slow = this.time - ev.since > 25;
    addFun(r.rider, slow ? FUN.eventBad / 2 : FUN.eventGood);
    this.everyone(FUN.eventGood / 2);
    g.ui.toast(ta('tg_ev_scareOk', r.animal, { horse: r.animal.name }), 3500);
    this.setMode(null);
  }

  snackBreak(ev) {
    const g = this.game;
    ev.done = true;
    ev.active = false;
    this.handled++;
    this.water = 100;
    this.thirstWarned = false;
    this.everyone(FUN.break);
    for (const r of this.riders) r.e.emit('🍎', 2);
    this.say(this.riders[Math.min(1, this.riders.length - 1)], 'tg_bubble_yum');
    this.burst('🍎', { x: ev.pos.x, y: this.y(ev.pos.x, ev.pos.z) + 1.5, z: ev.pos.z }, 5, 2);
    ev.sprite.material.map = emojiTexture('✅');
    if (ev.ring) ev.ring.visible = false;
    g.ui.toast(t('tg_ev_breakDone'), 3500);
    this.tg.tutorial('break');
    this.setMode(null);
  }

  /** Trek : nuit au gîte, on repart le lendemain matin. */
  sleepAtLodge() {
    const g = this.game;
    this.lodgeStop = false;
    g.sleep();
    this.water = 100;
    this.everyone(5);
    for (const r of this.riders) r.animal.needs.energy = Math.max(r.animal.needs.energy, 90);
    g.ui.toast(t('tg_slept'), 4000);
    this.hud.fade();
    this.setMode(null);
  }

  // ------------------------------------------------------------ boucle

  get current() {
    return this.events.find((x) => x.active) ?? null;
  }

  update(dt) {
    this.updateCommon(dt);
    const g = this.game;
    if (this.state === 'done' || this.state === 'finishing') return;
    if (g.player.mount !== this.mount) {
      g.ui.toast(t('tg_dismounted'), 4000);
      this.end(true);
      return;
    }
    const p = g.player.root.position;
    if (this.state === 'countdown') {
      p.set(STABLE_DOOR.x, this.y(STABLE_DOOR.x, STABLE_DOOR.z), STABLE_DOOR.z);
      g.player.speed = 0;
      this.mount.position.copy(p);
    }
    const target = this.points[this.next];
    // La flèche orange montre la balise suivante, ou le cavalier tombé / le cheval qui a peur (on doit y aller).
    const help = this.events.find((x) => (x.type === 'fall' || x.type === 'scare') && x.active && x.since && !x.done);
    const focus = help ? (help.type === 'fall' ? help.rider.avatar.root.position : help.rider.e.position) : target;
    if (focus) {
      const lost = this.lostTimer > 2;
      this.arrow.position.set(focus.x, this.y(focus.x, focus.z) + (help ? 3 : 3.6) + Math.sin(this.time * 4) * 0.25, focus.z);
      this.arrow.scale.setScalar(lost || help ? 1.4 : 1);
    }
    this.markers.forEach((m, i) => {
      m.visible = i >= this.next;
      m.userData.ring.material.opacity = i === this.next ? 0.55 + Math.sin(this.time * 5) * 0.3 : 0.35;
    });
    this.updateConvoy(dt);
    for (const r of this.riders) {
      r.bubble.visible = this.time < r.bubbleUntil;
      if (r.poseUntil && this.time > r.poseUntil) r.poseUntil = 0; // les mains retournent aux rênes
    }
    if (this.state !== 'run') return;
    if (this.lodgeStop) {
      this.setMode('sleep', true);
      return;
    }
    this.updateEvents(dt);
    this.updateGauges(dt);
    // Balise suivante
    if (target && dist2(target, p) < 4.5) {
      this.next++;
      this.burst('⭐', { x: target.x, y: this.y(target.x, target.z) + 2.6, z: target.z }, 4, 1.4);
      this.everyone(FUN.checkpoint);
      this.lostTimer = 0;
      if (target.kind === 'finish' || this.next >= this.points.length) this.complete();
      else if (target.kind === 'lodge') {
        this.lodgeStop = true;
        this.hud.hint(t('tg_hintLodge'), 12000);
        this.hud.big('🛏️', 1200, 'good');
      } else this.hud.big(`🚩 ${this.next}/${this.points.length}`, 700, 'good');
    }
    this.refreshHud();
  }

  /** Les cavaliers suivent en file indienne : chacun derrière le précédent, à distance sûre. */
  updateConvoy(dt) {
    const g = this.game;
    const player = g.player;
    const run = this.state === 'run';
    this.riders.forEach((r, i) => {
      const leader = i === 0 ? { position: player.position, heading: player.heading, speed: player.speed } : this.riders[i - 1].e;
      const e = r.e;
      const back = FORWARD(leader.heading).multiplyScalar(-r.gap);
      const want = new THREE.Vector3(leader.position.x + back.x, 0, leader.position.z + back.z);
      const d = dist2(want, e.position);
      let max = r.lag ? 2.4 : 11;
      if (r.scared || r.poseUntil || r.fallen) max = 0;
      let speed = 0;
      if (run && d > 0.8 && max > 0) speed = Math.min(max, 0.8 + d * 1.5, Math.max(leader.speed * 1.6, 4));
      if (speed > 0.02) {
        const wantH = Math.atan2(want.x - e.position.x, want.z - e.position.z);
        let diff = wantH - e.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        e.heading += Math.sign(diff) * Math.min(Math.abs(diff), dt * 3.5);
      }
      e.speed += (speed - e.speed) * Math.min(1, dt * 4);
      if (e.speed > 0.02) {
        const ox = e.position.x;
        const oz = e.position.z;
        const nx = ox + Math.sin(e.heading) * e.speed * dt;
        const nz = oz + Math.cos(e.heading) * e.speed * dt;
        if (!g.world.isWater(nx, nz) || this.inStream(nx, nz)) {
          e.position.x = nx;
          e.position.z = nz;
        }
        g.world.resolveCollisions(e.position, e.radius * 0.6, { mounted: true });
        // Coincé contre un mur ou une clôture (même le retardataire) : au bout de 3 s, il nous rejoint.
        const moved = Math.hypot(e.position.x - ox, e.position.z - oz);
        r.stuck = e.speed > 1 && moved < e.speed * dt * 0.25 ? (r.stuck ?? 0) + dt : Math.max(0, (r.stuck ?? 0) - dt);
        if (r.stuck > 3 && !r.scared && !r.fallen) {
          r.stuck = 0;
          e.position.set(want.x, 0, want.z);
          e.snap();
        }
      }
      e.snap(dt);
      // Le cavalier suit les allures de son cheval (pas, trot enlevé, galop), sauf pendant la photo.
      if (!r.fallen && !r.poseUntil && r.ride) {
        r.ride.gait = e.speed > 7 ? 2 : e.speed > 3.4 ? 1 : 0;
        r.ride.phase += dt * (1.5 + e.speed * 1.1);
        animateAvatarRide(r.avatar, r.ride);
      }
      // Trop loin derrière (bloqué derrière un arbre) : petit saut pour rattraper.
      // Pas pour le retardataire (c'est le jeu), ni pour un cheval qui a peur, qui pose ou dont le cavalier est tombé.
      if (d > 14 && !r.lag && !r.scared && !r.poseUntil && !r.fallen) {
        e.position.set(want.x, 0, want.z);
        e.snap();
      }
    });
  }

  inStream(x, z) {
    return this.events.some((ev) => ev.type === 'stream' && this.inZone(ev, x, z));
  }

  inZone(ev, x, z, halfLen = 9, halfW = 3) {
    const dx = x - ev.pos.x;
    const dz = z - ev.pos.z;
    const along = dx * Math.sin(ev.pos.dir) + dz * Math.cos(ev.pos.dir);
    const side = dx * Math.cos(ev.pos.dir) - dz * Math.sin(ev.pos.dir);
    return Math.abs(along) < halfW && Math.abs(side) < halfLen;
  }

  updateEvents(dt) {
    const g = this.game;
    const p = g.player.position;
    const leg = this.next;
    let want = null; // bouton principal voulu : [mode, actif]
    for (const ev of this.events) {
      if (ev.done) continue;
      if (!ev.active && ev.leg === leg) this.startEvent(ev);
      if (!ev.active) continue;
      switch (ev.type) {
        case 'lag': {
          const r = ev.rider;
          const far = dist2(p, r.e.position) > r.gap * (this.riders.indexOf(r) + 1) + 3;
          if (far && g.player.speed > 3.2) {
            addFun(r.rider, FUN.lagPerSec * dt);
            this.everyone(FUN.lagPerSec * 0.3 * dt);
            ev.bad = true;
          }
          ev.timer -= dt;
          ev.elapsed = (ev.elapsed ?? 0) + dt;
          if (ev.timer <= 0) {
            r.lag = null;
            if (!far || ev.elapsed > 40) {
              ev.done = true;
              ev.active = false;
              this.handled++;
              if (!ev.bad) addFun(r.rider, FUN.eventGood);
              g.ui.toast(t('tg_ev_lagOk'), 3000);
            } else ev.timer = 1; // on attend qu'il revienne
          }
          break;
        }
        case 'scare': {
          const r = ev.rider;
          if (!ev.since) {
            // Le cheval a peur quand il arrive près du sac.
            if (dist2(r.e.position, ev.pos) < 9) {
              ev.since = this.time;
              r.scared = ev;
              r.e.emit('😱', 2);
              this.say(r, 'tg_bubble_scared');
              this.hud.hint(ta('tg_ev_scare', r.animal, { horse: r.animal.name }), 9000);
              this.hud.big('😱', 900);
            }
            break;
          }
          const near = dist2(p, r.e.position) < 4.5 && g.player.speed < 0.6;
          want = want ?? ['reassure', near];
          if (dist2(p, r.e.position) > 18) this.everyone(-0.5 * dt);
          break;
        }
        case 'fall': {
          const r = ev.rider;
          if (!ev.since) {
            // Son cheval arrive sur la racine (ou au bout d'un moment) : il trébuche.
            ev.wait = (ev.wait ?? 0) + dt;
            if (r.scared || r.lag) break;
            if (dist2(r.e.position, ev.pos) < 4.5 || ev.wait > 20 || this.next > ev.leg) this.fallOff(ev);
            break;
          }
          const near = dist2(p, r.avatar.root.position) < 4.5 && g.player.speed < 0.6;
          want = want ?? ['firstAid', near];
          if (dist2(p, r.avatar.root.position) > 16) this.everyone(FUN.waitPerSec * dt);
          if (this.time - ev.since > FALL_WAIT && !ev.slowHint) {
            ev.slowHint = true;
            this.hud.hint(ta('tg_ev_fallWaiting', r.rider), 6000);
          }
          break;
        }
        case 'stream': {
          const inside = this.inZone(ev, p.x, p.z);
          if (inside && !ev.inside) ev.inside = true;
          if (inside && g.player.speed > 3.4 && !ev.bad) {
            ev.bad = true;
            this.everyone(FUN.troting);
            this.burst('💦', { x: p.x, y: p.y + 1, z: p.z }, 8, 3, 0.8);
            this.say(this.riders[this.riders.length - 1], 'tg_bubble_wet');
            g.ui.toast(t('tg_ev_streamBad'), 3500);
          }
          if (ev.inside && !inside) {
            ev.done = true;
            ev.active = false;
            if (!ev.bad) {
              this.handled++;
              this.everyone(FUN.eventGood / 2);
              g.ui.toast(t('tg_ev_streamOk'), 3000);
            }
          }
          break;
        }
        case 'sight':
          want = want ?? ['photo', dist2(p, ev.pos) < 14];
          break;
        case 'break':
          want = want ?? ['break', dist2(p, ev.pos) < 5.5 && g.player.speed < 0.8];
          break;
        default:
      }
    }
    // Un événement qui n'est plus sur l'étape en cours et qui n'a pas été fait : on l'a raté.
    for (const ev of this.events) {
      if (ev.done || !ev.active) continue;
      if (ev.leg < leg - 1 && (ev.type === 'sight' || ev.type === 'break' || ev.type === 'stream')) {
        ev.done = true;
        ev.active = false;
        if (ev.type === 'break') this.everyone(FUN.eventBad / 2);
      }
    }
    if (want) this.setMode(want[0], want[1]);
    else if (this.mode) this.setMode(null);
    // Mauvaise direction : loin du trait entre la balise passée et la suivante.
    const a = this.next === 0 ? STABLE_DOOR : this.points[this.next - 1];
    const b = this.points[this.next];
    if (b) {
      const off = distToSegment(p, a, b);
      if (off > 30) {
        this.lostTimer += dt;
        if (this.lostTimer > 2) this.everyone(FUN.lostPerSec * dt);
        if (this.lostTimer > 2 && (this.lostHint ?? 0) < this.time) {
          this.lostHint = this.time + 7;
          this.hud.hint(t('tg_ev_lost'), 4000);
        }
      } else this.lostTimer = 0;
    }
  }

  startEvent(ev) {
    ev.active = true;
    // Un cheval a peur : on garde sa consigne à l'écran, les autres attendront.
    const quiet = this.events.some((x) => x.type === 'scare' && x.active && x.since && !x.done);
    const hint = (text, ms) => { if (!quiet) this.hud.hint(text, ms); };
    const beginner = this.riders.find((r) => r.rider.level === 'beginner') ?? this.riders[this.riders.length - 1];
    switch (ev.type) {
      case 'lag':
        ev.rider = beginner;
        ev.timer = 9;
        beginner.lag = ev;
        this.say(beginner, 'tg_bubble_wait', 5000);
        this.hud.hint(ta('tg_ev_lag', beginner.rider), 7000);
        break;
      case 'scare':
        ev.rider = this.riders.find((r) => r.rider.level !== 'confirmed') ?? this.riders[0];
        ev.sprite.visible = true;
        break;
      case 'fall': {
        // Pas le même que celui qui a peur ou qui traîne, si possible : le dernier de la file.
        const busy = new Set(this.events.filter((x) => x !== ev && x.rider && x.active && !x.done).map((x) => x.rider));
        ev.rider = [...this.riders].reverse().find((r) => !busy.has(r)) ?? this.riders[this.riders.length - 1];
        hint(t('tg_ev_rocky'), 6000);
        break;
      }
      case 'stream':
        hint(t('tg_ev_stream'), 7000);
        break;
      case 'sight':
        hint(t('tg_ev_sight'), 7000);
        break;
      case 'break':
        hint(t('tg_ev_break'), 7000);
        break;
      default:
    }
  }

  updateGauges(dt) {
    this.water = Math.max(0, this.water - (WATER_PER_MIN / 60) * dt);
    if (this.water < 30) {
      this.everyone(FUN.thirstyPerSec * dt);
      if (!this.thirstWarned) {
        this.thirstWarned = true;
        this.hud.hint(t('tg_ev_thirsty'), 6000);
        this.say(this.riders[0], 'tg_bubble_thirsty');
      }
    }
  }

  complete() {
    const g = this.game;
    this.state = 'finishing';
    this.hud.big(t('tg_resultTitle'), 1500, 'good');
    this.burst('🎉', { x: g.player.position.x, y: g.player.position.y + 2, z: g.player.position.z }, 8, 3);
    this.say(this.riders[0], 'tg_bubble_yay');
    const result = rideResult({
      riders: this.booking.riders, water: this.water, photos: this.photos, handled: this.handled, total: this.totalEvents,
      legs: this.next, totalLegs: this.points.length, booking: this.booking, perks: perksOf(g.profile),
      falls: this.falls, helped: this.helped,
    });
    this.hud.setMain(null);
    setTimeout(() => {
      if (this.ended) return;
      this.state = 'done';
      this.tg.finishRide(this, result);
    }, 1300);
  }

  cleanup(aborted) {
    const g = this.game;
    for (const r of this.riders ?? []) {
      r.avatar.root.parent?.remove(r.avatar.root); // sur son cheval, ou par terre (tombé)
      disposeModel(r.avatar.root);
      r.e.root.remove(r.bubble);
      r.bubble.material.map.dispose();
      r.bubble.material.dispose();
      r.e.speed = 0;
    }
    for (const d of this.dogs ?? []) d.following = false;
    if (aborted && this.state !== 'done' && this.points) this.tg.abortRide(this);
  }
}

/** Distance d'un point au segment [a, b] (dans le plan). */
function distToSegment(p, a, b) {
  const vx = b.x - a.x;
  const vz = b.z - a.z;
  const len2 = vx * vx + vz * vz || 1;
  const u = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.z - a.z) * vz) / len2));
  return Math.hypot(p.x - (a.x + vx * u), p.z - (a.z + vz * u));
}

export { GuidedRideSession, TRAIL_GUIDE_CAREER, rankOf };

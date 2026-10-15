// Événements spéciaux dans le monde 3D : flèche au-dessus de la cible, animal échappé,
// petit animal perdu, voisin, stand de la fête, météo imposée, bandeau et écrans.
// La logique (quand, quoi, réussi ou raté) est dans src/sim/events.js.
//
// Le jeu n'appelle qu'une chose à chaque image : game.events.update(dt).
// Pour tester dans la console : animaleana.game.events.force('storm')
//   (types : storm, heatwave, coldSnap, injury, escape, lostPet, neighbour, birth, fair),
//   puis .end('success' | 'fail') pour voir l'écran de fin.

import * as THREE from 'three';
import { buildAvatar } from './models/avatarModel.js';
import { disposeModel } from './models/animalModel.js';
import { emojiTexture, signTexture } from './textures.js';
import { enclosure, inside } from './nav.js';
import { PEN, FIELD } from './AnimalEntity.js';
import { SPECIES } from '../sim/species.js';
import {
  EVENTS, EVENT_TYPES, eventState, startEvent, maybeStartEvent, eventProgress, eventOutcome, resolveEvent,
  eventWeather, nextStep, minutesLeft,
} from '../sim/events.js';
import { GEAR, owned, inUse } from '../sim/gear.js';
import { canAfford, addStat } from '../sim/profile.js';
import { XP } from '../sim/progress.js';
import {
  EventBanner, showEventIntro, showEventResult, showStrayChoice, showNeighbourAsk, formatLeft,
} from '../ui/events.js';
import { t, ta } from '../i18n.js';

const PETS = ['dog', 'cat', 'rabbit'];
// Où se tiennent le voisin et le stand de la fête (dans la cour, faciles à trouver).
const NEIGHBOUR_SPOT = { x: -7, z: -7 };
const FAIR_SPOT = { x: 5, z: 15 };
const AREA = { paddock: { x: -16, z: 16, r: 5 }, pen: { x: PEN.x, z: PEN.z, r: PEN.r } };
const DOOR_OF = { paddock: 'stable', pen: 'pen' };
const BABY_EMOJI = { horse: '🐴', sheep: '🐑', goat: '🐐', cow: '🐄' };

export class Events {
  constructor(game) {
    this.game = game;
    this.acc = 0;
    this.lastClock = null;
    this.worldGroup = null;
    this.profileRef = null;
    this.weatherSig = '';
    this.state = null; // { ev, progress, step, info }
    this.banner = null;
    this.props = [];
    this.strayEntity = null;
    this.shelterPins = new Set();
    this.pendingResult = null;
    this.asked = false;

    // Grande flèche jaune qui rebondit au-dessus de la cible + anneau au sol.
    this.marker = new THREE.Group();
    const gold = new THREE.MeshBasicMaterial({ color: 0xffc83a, depthTest: false, transparent: true });
    const edge = new THREE.MeshBasicMaterial({ color: 0x7a4b00, depthTest: false, transparent: true });
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.8, 20), gold);
    cone.rotation.x = Math.PI;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.6, 12), gold);
    stem.position.y = 0.65;
    const rim = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.9, 20), edge);
    rim.rotation.x = Math.PI;
    rim.position.y = 0.02;
    rim.scale.set(1, 1, 1);
    this.arrow = new THREE.Group();
    this.arrow.add(rim, cone, stem);
    for (const m of [rim, cone, stem]) m.renderOrder = 30 + (m === rim ? 0 : 1);
    this.marker.add(this.arrow);
    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.25, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffc83a, transparent: true, opacity: 0.8, depthWrite: false }),
    );
    this.marker.visible = false;
    this.ring.visible = false;
    game.scene.add(this.marker, this.ring);
    // Petits « ! » au-dessus des animaux qui attendent encore.
    this.dots = [];
  }

  // ------------------------------------------------------------ boucle

  update(dt) {
    const g = this.game;
    if (!g.running || !g.profile) {
      this.hideAll();
      return;
    }
    if (!this.banner) this.banner = new EventBanner(g.ui, () => this.go());
    if (g.world.group !== this.worldGroup || g.profile !== this.profileRef) this.sync();

    // La météo de l'événement (orage, canicule, neige) : on prévient le jeu quand elle change.
    const ov = this.weatherOverride();
    const sig = ov ? `${ov.weather}${ov.tempDelta}` : '';
    if (sig !== this.weatherSig) {
      if (ov?.weather === 'storm' && this.weatherSig) g.ui.toast(t('ev_stormNow'), 5000);
      this.weatherSig = sig;
      g.weatherKey = null;
      g.updateWeather();
    }

    this.acc += dt;
    if (this.acc >= 0.5) {
      this.acc = 0;
      const clock = g.profile.clock;
      const hours = this.lastClock === null ? 0 : Math.max(0, Math.min(0.25, (clock - this.lastClock) / 60));
      this.lastClock = clock;
      this.tick(hours);
    }
    this.animate(dt);
  }

  /** Météo imposée par l'événement en cours (utilisée par Game.updateWeather et Game.temperature). */
  weatherOverride() {
    const p = this.game.profile;
    return p ? eventWeather(p, p.clock, p.place) : null;
  }

  tick(hours) {
    const g = this.game;
    const p = g.profile;
    const st = eventState(p);
    const ev = st.active;
    this.showPendingResult();
    this.updateShelterPins();
    if (!ev) {
      this.state = null;
      this.banner.hide();
      g.ui.renderStatus();
      // On ne lance pas d'événement pendant qu'une fenêtre est ouverte.
      if (g.ui.isBlocking() || g.ui.panel) return;
      const started = maybeStartEvent(p, this.context(null));
      if (started) this.begin(started);
      return;
    }
    const ctx = this.context(ev);
    const progress = eventProgress(ev, ctx, hours);
    const outcome = eventOutcome(ev, ctx, progress);
    if (outcome) {
      this.finish(ev, outcome, ctx);
      return;
    }
    const step = nextStep(ev, ctx, progress);
    this.state = { ev, progress, step, info: step ? this.stepInfo(ev, step) : null, ctx };
    this.proximity(ev, ctx);
    this.renderBanner();
    g.ui.renderStatus();
  }

  /** Ce que la logique a besoin de savoir sur le monde. */
  context(ev) {
    const g = this.game;
    const p = g.profile;
    const pp = g.player.position;
    const target = ev ? this.targetPos(ev) : null;
    const refuge = this.door('refuge');
    const se = this.strayEntity;
    return {
      clock: p.clock, hour: g.hour, season: g.season, place: p.place, isHome: g.isHome, day: g.day,
      weather: g.weather, temperature: g.temperature,
      // Les plus proches du joueur d'abord : la prochaine étape est celle qui est à côté.
      animals: g.animalsHere().map((a) => ({ a, d: this.distTo(a) })).sort((x, y) => x.d - y.d).map((x) => x.a),
      whereOf: (a) => this.whereOf(a),
      ridingId: g.player.mount?.data.id ?? null,
      playerDist: target ? Math.hypot(target.x - pp.x, target.z - pp.z) : undefined,
      strayAtRefuge: !!(se && refuge && Math.hypot(se.position.x - refuge.x, se.position.z - refuge.z) < 5),
    };
  }

  whereOf(a) {
    const e = this.game.entities.get(a.id);
    if (!e || e.ridden) return 'out';
    const { x, z } = e.position;
    if (inside(enclosure('paddock'), x, z)) return 'paddock';
    if (inside(enclosure('pen'), x, z)) return 'pen';
    const door = this.houseDoor();
    if (door && Math.hypot(x - door.x, z - door.z) < 7) return 'house';
    return 'out';
  }

  distTo(a) {
    const e = this.game.entities.get(a.id);
    const pp = this.game.player.position;
    return e ? Math.hypot(e.position.x - pp.x, e.position.z - pp.z) : 1e9;
  }

  door(kind) {
    return this.game.world.interactables.find((i) => i.kind === kind) ?? null;
  }

  houseDoor() {
    return this.door('house') ?? this.door('lodge');
  }

  targetPos(ev) {
    const e = this.game.entities.get(ev.targetId);
    if (ev.type === 'escape' || ev.type === 'birth') return e?.position ?? null;
    if (ev.type === 'neighbour') return NEIGHBOUR_SPOT;
    if (ev.type === 'fair') return FAIR_SPOT;
    if (ev.type === 'lostPet') return this.strayEntity?.position ?? null;
    return null;
  }

  // ------------------------------------------------------------ début et fin

  begin(ev) {
    const g = this.game;
    if (ev.type === 'escape') this.escapeAnimal(ev);
    this.restore(ev);
    const def = EVENTS[ev.type];
    showEventIntro(g.ui, {
      emoji: def.emoji, title: this.title(ev), text: this.intro(ev), hours: def.hours,
    });
    this.lastClock = g.profile.clock;
    this.tick(0);
    g.save();
  }

  /** Remet en place ce que l'événement a mis dans le monde (après un chargement ou un voyage). */
  restore(ev) {
    const g = this.game;
    if (ev.place !== g.profile.place) return;
    if (ev.type === 'lostPet' && ev.data.stray) this.spawnStray(ev);
    if (ev.type === 'neighbour') this.spawnNeighbour(ev);
    if (ev.type === 'fair') this.spawnStand();
    if (ev.type === 'escape' && !ev.data.found) {
      const e = g.entities.get(ev.targetId);
      if (e) pin(e, { x: e.position.x, z: e.position.z, r: 3 });
    }
  }

  sync() {
    const g = this.game;
    this.worldGroup = g.world.group;
    this.profileRef = g.profile;
    this.clearProps();
    this.strayEntity = null;
    this.shelterPins.clear();
    this.weatherSig = '';
    this.lastClock = g.profile.clock;
    this.state = null;
    const ev = eventState(g.profile).active;
    if (ev) this.restore(ev);
  }

  finish(ev, outcome, ctx) {
    const g = this.game;
    const p = g.profile;
    const res = resolveEvent(p, ev, outcome, ctx);
    const who = ev.data.who ?? {};
    const a = p.animals.find((x) => x.id === ev.targetId);
    let extra = null;
    if (ev.type === 'escape' && a) {
      const e = g.entities.get(a.id);
      if (e) unpin(e);
      if (outcome === 'fail' && e) {
        // Un voisin le ramène à son abri.
        const area = a.species === 'horse' ? AREA.paddock : AREA.pen;
        a.following = false;
        e.position.set(area.x, 0, area.z);
        e.snap();
      }
      if (outcome === 'success') a.following = false;
    }
    if (ev.type === 'birth' && outcome !== 'cancel') {
      const father = p.animals.find((x) => x.id === ev.data.fatherId);
      // Les petits naissent maintenant (gestation terminée).
      if (a && a.location === p.place) {
        a.pregnant = { due: g.day, father: father?.id ?? a.id };
        const before = p.animals.length;
        g.checkBirths();
        extra = p.animals.slice(before).map((b) => b.name).join(', ') || null;
      }
    }
    if (ev.type === 'lostPet') this.removeStray(ev.data.choice === 'adopt');
    if (ev.type === 'fair' && outcome === 'success') g.entities.get(ev.data.winnerId)?.emit('🎀', 5);
    if (outcome === 'success' && ev.type === 'storm') g.ui.toast(t('ev_allIn'), 4000);
    this.clearProps();
    this.state = null;
    this.banner.hide();
    this.hideMarkers();
    g.ui.renderStatus();
    g.ui.refresh();
    g.save();
    if (outcome === 'cancel') {
      g.ui.toast(t('ev_cancel'), 5000);
      return;
    }
    const win = outcome === 'success';
    const names = res.affected.join(', ');
    let key = `ev_${ev.type}_${win ? 'win' : 'fail'}`;
    if (ev.type === 'lostPet' && win) key += `_${ev.data.choice}`;
    const params = {
      name: ev.type === 'neighbour' ? ev.data.neighbour.name : ev.type === 'lostPet' && ev.data.choice === 'adopt' ? (a?.name ?? who.name) : who.name,
      g: ev.type === 'neighbour' ? ev.data.neighbour.sex : who.sex,
      names, kind: t(`ev_kind_${who.species}`), babies: extra ?? '',
    };
    if (ev.type === 'fair' && win) {
      const w = p.animals.find((x) => x.id === ev.data.winnerId);
      if (w) Object.assign(params, { name: w.name, g: w.sex });
    }
    const lines = [];
    if (win) {
      lines.push(t('ev_reward_xp', { n: XP.event }));
      if (res.money && p.mode === 'manage') lines.push(t('ev_reward_money', { n: res.money }));
    }
    if (res.sick.length) lines.push(t('ev_caughtCold', { names: res.sick.join(', ') }));
    this.pendingResult = {
      win, emoji: win ? (ev.type === 'fair' ? '🎀' : ev.type === 'birth' ? BABY_EMOJI[who.species] ?? '🍼' : '🎉') : '😕',
      title: t(win ? 'ev_win' : 'ev_fail'), text: t(key, params), lines,
      onClose: () => { if (win) g.xp('event'); },
    };
    this.showPendingResult();
  }

  /** L'écran de fin attend qu'aucune autre fenêtre ne soit ouverte. */
  showPendingResult() {
    const r = this.pendingResult;
    if (!r || this.game.ui.modalOpen) return;
    this.pendingResult = null;
    showEventResult(this.game.ui, r);
  }

  // ------------------------------------------------------------ textes

  title(ev) {
    const who = ev.data.who ?? {};
    switch (ev.type) {
      case 'injury':
      case 'escape':
        return t(`ev_${ev.type}_title`, { name: who.name, g: who.sex });
      case 'birth':
        return t('ev_birth_title', { name: who.name, g: 'f', baby: t(`ev_baby_${who.species}`) });
      case 'lostPet':
        return t('ev_lostPet_title', { kind: t(`ev_kind_${who.species}`) });
      case 'neighbour':
        return t('ev_neighbour_title', { name: ev.data.neighbour.name, g: ev.data.neighbour.sex });
      default:
        return t(`ev_${ev.type}_title`);
    }
  }

  intro(ev) {
    const who = ev.data.who ?? {};
    const p = { name: who.name, g: who.sex, kind: t(`ev_kind_${who.species}`) };
    if (ev.type === 'injury') p.cause = t(`ev_cause_${ev.data.cause}`);
    if (ev.type === 'escape') p.shelter = t(`ev_shelter_${who.species === 'horse' ? 'paddock' : 'pen'}`);
    if (ev.type === 'neighbour') Object.assign(p, { name: ev.data.neighbour.name, g: ev.data.neighbour.sex, task: t(`ev_task_${ev.data.task}`) });
    if (ev.type === 'birth') Object.assign(p, { g: 'f', baby: t(`ev_baby_${who.species}`) });
    return t(`ev_${ev.type}_intro`, p);
  }

  /** Texte, position et action du bouton « Y aller » pour la prochaine étape. */
  stepInfo(ev, step) {
    const g = this.game;
    const a = g.animalsHere().find((x) => x.id === step.animalId);
    const e = step.animalId ? g.entities.get(step.animalId) : null;
    const onAnimal = (fn) => (e ? { pos: e.position, entity: e, go: () => g.walkTo(e.position, e.radius + 1.2, fn, true) } : {});
    const atDoor = (kind, fn, r = 1.4) => {
      const d = this.door(kind) ?? (kind === 'house' ? this.houseDoor() : null);
      if (!d) return {};
      const pos = new THREE.Vector3(d.x, 0, d.z);
      return { pos, go: () => g.walkTo(pos, r, fn) };
    };
    const kind = t(`ev_kind_${ev.data.who?.species}`);
    switch (step.step) {
      case 'shelter':
        return {
          text: t(`ev_step_shelter_${step.group}`),
          ...atDoor(DOOR_OF[step.group] ?? 'house', () => this.bringIn(step.group)),
        };
      case 'water':
        return { text: ta('ev_step_water', a), ...onAnimal(() => g.ui.openAnimalActions(a)) };
      case 'warm':
        return { text: ta('ev_step_warm', a), ...onAnimal(() => this.putBlanket(a)) };
      case 'vet':
        return { text: ta('ev_step_vet', a ?? ev.data.who), dotOn: e, ...atDoor('vet', () => g.ui.openVetClinic()) };
      case 'find':
        return { text: ta('ev_step_find', a), ...onAnimal(() => this.found(ev, a)) };
      case 'lead':
        if (ev.type === 'fair') return { text: ta('ev_step_fetch', a), ...onAnimal(() => { if (!a.following) g.toggleFollow(a); }) };
        {
          const area = AREA[step.group];
          const pos = new THREE.Vector3(area.x, 0, area.z);
          return { text: ta(`ev_step_lead_${step.group}`, a), pos, go: () => g.walkTo(pos, 2) };
        }
      case 'meet': {
        const pos = new THREE.Vector3(NEIGHBOUR_SPOT.x, 0, NEIGHBOUR_SPOT.z);
        const n = ev.data.neighbour;
        return { text: t('ev_step_meet', { name: n.name, g: n.sex }), pos, y: 2.6, go: () => g.walkTo(pos, 1.8, () => this.askNeighbour(ev)) };
      }
      case 'stay':
        return { text: ta('ev_step_stay', a), ...onAnimal(null) };
      case 'brush':
        return { text: ta('ev_step_brush', a), ...onAnimal(() => g.ui.openAnimalActions(a)) };
      case 'stand': {
        const pos = new THREE.Vector3(FAIR_SPOT.x, 0, FAIR_SPOT.z);
        return { text: ta('ev_step_stand', a), pos, y: 3.4, go: () => g.walkTo(pos, 1.5) };
      }
      case 'decide': {
        const se = this.strayEntity;
        if (!se) return { text: t('ev_step_decide', { kind }) };
        return { text: t('ev_step_decide', { kind }), pos: se.position, entity: se, go: () => g.walkTo(se.position, se.radius + 1.2, () => this.askStray(ev), true) };
      }
      case 'refuge':
        return { text: t('ev_step_refuge', { kind }), ...atDoor('refuge', null) };
      default:
        return { text: '' };
    }
  }

  progressText(ev, pr) {
    if (ev.type === 'storm') return t('ev_prog_shelter', { done: pr.done, total: pr.total });
    if (ev.type === 'coldSnap') return t('ev_prog_warm', { done: pr.done, total: pr.total });
    if (ev.type === 'heatwave') return t('ev_prog_water', { done: pr.done, total: pr.total });
    if (ev.type === 'birth') return t('ev_prog_birth', { pct: Math.round((pr.done / pr.total) * 100) });
    return null;
  }

  renderBanner() {
    const s = this.state;
    if (!s) return;
    const { ev, progress, info } = s;
    const g = this.game;
    let compass = null;
    if (info?.pos) {
      const pp = g.player.position;
      const dx = info.pos.x - pp.x;
      const dz = info.pos.z - pp.z;
      const dist = Math.hypot(dx, dz);
      const yaw = g.rig.yaw;
      // Vers l'avant de la caméra = haut de l'écran.
      const fwd = dx * Math.sin(yaw) + dz * Math.cos(yaw);
      const right = -dx * Math.cos(yaw) + dz * Math.sin(yaw);
      compass = { deg: (Math.atan2(right, fwd) * 180) / Math.PI, dist: Math.round(dist) };
    }
    const ptext = this.progressText(ev, progress);
    this.banner.show({
      key: `${ev.id}-${s.step?.step}-${s.step?.animalId}-${s.step?.group}`,
      type: ev.type,
      emoji: EVENTS[ev.type].emoji,
      title: this.title(ev),
      text: info?.text ?? '',
      left: formatLeft(minutesLeft(ev, g.profile.clock)),
      urgent: minutesLeft(ev, g.profile.clock) < 30,
      prog: ptext ? { text: ptext, ratio: progress.total ? progress.done / progress.total : 0 } : null,
      // Déjà tout près de la maman : il suffit de rester là.
      canGo: !!info?.go && !(s.step?.step === 'stay' && compass && compass.dist < 9),
      compass,
    });
  }

  /** Puce dans le bandeau d'état (src/ui/UI.js renderStatus), visible quand le bandeau est réduit. */
  statusChips(chip) {
    const s = this.state;
    if (!s || !this.banner || !this.banner.min) return [];
    const pr = this.progressText(s.ev, s.progress);
    const left = formatLeft(minutesLeft(s.ev, this.game.profile.clock));
    return [chip(`${EVENTS[s.ev.type].emoji} ${pr ?? this.title(s.ev)} · ⏳ ${left}`, t('ev_show'), () => this.banner.expand())];
  }

  // ------------------------------------------------------------ actions

  /** Bouton « Y aller » : le joueur marche jusqu'à la cible, puis l'action se fait. */
  go() {
    const info = this.state?.info;
    if (!info?.go) return;
    if (this.game.player.mount && this.state.step?.step !== 'stand' && this.state.step?.step !== 'lead') this.game.dismount();
    info.go();
  }

  bringIn(group) {
    const g = this.game;
    if (group === 'paddock') g.sendHorses('paddock');
    else if (group === 'pen') g.moveFlock('pen');
    else this.callPets();
  }

  /** Les petits animaux rentrent à la maison (et y restent pendant le mauvais temps). */
  callPets() {
    const g = this.game;
    const door = this.houseDoor();
    if (!door) return;
    const area = { x: door.x, z: door.z + 1.5, r: 2.5 };
    let n = 0;
    for (const e of g.entities.values()) {
      if (!PETS.includes(e.data.species) || e.data.stray || e.ridden) continue;
      e.data.following = false;
      pin(e, area);
      this.shelterPins.add(e);
      e.state = 'walk';
      e.target.set(area.x + (Math.random() - 0.5) * 3, 0, area.z + (Math.random() - 0.5) * 2);
      e.timer = 30;
      n++;
    }
    g.ui.toast(n ? t('ev_callPets') : t('nobody'), 4000);
  }

  /** Pendant l'orage ou la neige, les animaux à l'abri y restent ; après, ils repartent. */
  updateShelterPins() {
    const ov = this.weatherOverride();
    const bad = ov && ['storm', 'snow', 'cloudy'].includes(ov.weather);
    if (!bad) {
      for (const e of this.shelterPins) unpin(e);
      this.shelterPins.clear();
      return;
    }
    const door = this.houseDoor();
    for (const e of this.game.entities.values()) {
      if (e.data.following || e.data.stray || this.shelterPins.has(e)) continue;
      const where = this.whereOf(e.data);
      if (PETS.includes(e.data.species) && where === 'house' && door) {
        pin(e, { x: door.x, z: door.z + 1.5, r: 2.5 });
        this.shelterPins.add(e);
      }
    }
  }

  putBlanket(a) {
    const g = this.game;
    const p = g.profile;
    if (owned(p, 'blanket') - inUse(p, 'blanket') <= 0) {
      if (!canAfford(p, GEAR.blanket.price)) return g.ui.toast(t('ev_noBlanket'), 5000);
      g.buyGear('blanket');
    }
    const r = g.equip(a, 'blanket', 'navy');
    if (r?.ok) {
      g.entities.get(a.id)?.emit('🧣', 3);
      g.ui.toast(ta('ev_blanketOn', a));
    }
    return r;
  }

  found(ev, a) {
    const g = this.game;
    ev.data.found = true;
    const e = g.entities.get(a.id);
    if (e) unpin(e);
    if (!a.following) g.toggleFollow(a);
    e?.emit('❤️', 3);
    g.ui.toast(ta('ev_found', a), 5000);
  }

  /** L'animal saute la barrière et part se promener loin dans les prés. */
  escapeAnimal(ev) {
    const g = this.game;
    const e = g.entities.get(ev.targetId);
    if (!e) return;
    const w = g.world;
    let spot = null;
    for (let i = 0; i < 40 && !spot; i++) {
      const x = (Math.random() - 0.5) * 90;
      const z = 40 + Math.random() * 45;
      if (w.isWater(x, z) || inside(enclosure('pen'), x, z, -3) || inside(enclosure('paddock'), x, z, -3)) continue;
      if (Math.hypot(x - g.player.position.x, z - g.player.position.z) < 30) continue;
      spot = { x, z };
    }
    spot = spot ?? { x: FIELD.x + 20, z: FIELD.z + 10 };
    e.data.following = false;
    e.position.set(spot.x, 0, spot.z);
    w.resolveCollisions(e.position);
    e.snap();
    e.state = 'idle';
    e.timer = 3;
    pin(e, { x: e.position.x, z: e.position.z, r: 3 });
  }

  spawnStray(ev) {
    const g = this.game;
    const s = ev.data.stray;
    const door = this.houseDoor() ?? { x: 0, z: -10 };
    const spot = { x: door.x + 5, z: door.z + 3 };
    const e = g.spawnEntity(s, s.pos ? null : spot);
    if (!s.following) pin(e, { ...spot, r: 2.5 });
    this.strayEntity = e;
  }

  removeStray(keep) {
    const g = this.game;
    const e = this.strayEntity;
    this.strayEntity = null;
    if (!e) return;
    unpin(e);
    if (keep) return;
    if (g.player.mount === e) g.dismount();
    e.dispose();
    if (g.entities.get(e.data.id) === e) g.entities.delete(e.data.id);
  }

  askStray(ev) {
    const g = this.game;
    const s = ev?.data.stray;
    if (!s || ev.data.choice) return;
    const kind = t(`ev_kind_${s.species}`);
    showStrayChoice(g.ui, { emoji: SPECIES[s.species].emoji, kind, text: t('ev_stray_q', { kind }) }, {
      adopt: async () => {
        const name = await g.ui.prompt(t('ev_stray_name'), s.name);
        if (name === null || !this.state || eventState(g.profile).active !== ev) return;
        delete s.stray;
        s.name = name.trim().slice(0, 20) || s.name;
        s.location = g.profile.place;
        s.following = false;
        g.profile.animals.push(s);
        addStat(g.profile, 'adopted');
        ev.data.choice = 'adopt';
        ev.data.stray = null;
        const e = this.strayEntity;
        if (e) {
          unpin(e);
          e.rename();
          e.emit('❤️', 5);
        }
        g.xp('adopt');
        g.ui.toast(ta('adopted', s), 5000);
      },
      refuge: () => {
        ev.data.choice = 'refuge';
        s.following = true;
        if (this.strayEntity) unpin(this.strayEntity);
        g.ui.toast(t('ev_strayFollows', { kind }), 5000);
      },
    });
  }

  askNeighbour(ev) {
    const g = this.game;
    if (ev.data.helped || g.ui.modalOpen) return;
    const n = ev.data.neighbour;
    showNeighbourAsk(g.ui, { name: n.name, g: n.sex, task: t(`ev_task_${ev.data.task}`) }, () => {
      if (eventState(g.profile).active !== ev) return;
      ev.data.helped = true;
      g.advanceTime(1);
      this.props.find((x) => x.userData.neighbour)?.userData.wave?.();
      g.ui.refresh();
    });
  }

  /** Quand on arrive tout près du voisin ou du petit animal perdu, on lui parle. */
  proximity(ev, ctx) {
    const near = ctx.playerDist !== undefined && ctx.playerDist < 2.6;
    if (!near) {
      if (ctx.playerDist === undefined || ctx.playerDist > 5) this.asked = false;
      return;
    }
    if (this.asked || this.game.ui.isBlocking() || this.game.player.auto) return;
    if (ev.type === 'neighbour' && !ev.data.helped) {
      this.asked = true;
      this.askNeighbour(ev);
    } else if (ev.type === 'lostPet' && !ev.data.choice) {
      this.asked = true;
      this.askStray(ev);
    }
  }

  // ------------------------------------------------------------ décor de l'événement

  spawnNeighbour(ev) {
    const n = ev.data.neighbour;
    const g = this.game;
    const female = n.sex === 'f';
    const av = buildAvatar({
      skin: [0xf1c9a5, 0xd09a72, 0x8a5a3c][n.name.length % 3],
      hair: female ? 0x8a5a2b : 0x5a5a5a,
      hairStyle: female ? 'ponytail' : 'short',
      top: 0xd9643a, bottom: 0x3b4a6b, shoes: 0x3b2a20, hat: !female,
    });
    const root = new THREE.Group();
    root.add(av.root);
    const tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: signTexture(n.name, '#2f6b45', '#ffffff', '👋'), depthTest: false, transparent: true }));
    tag.position.y = 2.15;
    tag.scale.set(1.8, 0.45, 1);
    tag.renderOrder = 10;
    root.add(tag);
    // Un tas de foin, une brouette… selon ce qu'il faut faire.
    const prop = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.7, 0.8), new THREE.MeshStandardMaterial({ color: ev.data.task === 'apples' ? 0x9a6a3a : 0xd8b860, roughness: 0.9 }));
    prop.position.set(1.2, 0.35, 0.4);
    prop.castShadow = true;
    root.add(prop);
    root.position.set(NEIGHBOUR_SPOT.x, g.world.heightAt(NEIGHBOUR_SPOT.x, NEIGHBOUR_SPOT.z), NEIGHBOUR_SPOT.z);
    root.rotation.y = Math.atan2(-NEIGHBOUR_SPOT.x, -6 - NEIGHBOUR_SPOT.z);
    root.userData.neighbour = true;
    root.userData.arm = av.arms?.[0];
    g.scene.add(root);
    this.props.push(root);
  }

  /** Petit stand de fête : une table, un toit rayé, des fanions et un panneau. */
  spawnStand() {
    const g = this.game;
    const root = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x9a7650, roughness: 0.9 });
    const table = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.12, 1.1), new THREE.MeshStandardMaterial({ color: 0xf4ead2 }));
    table.position.y = 0.9;
    root.add(table);
    for (const [x, z] of [[-1.2, -0.45], [1.2, -0.45], [-1.2, 0.45], [1.2, 0.45]]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), wood);
      leg.position.set(x, 0.45, z);
      root.add(leg);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.5, 8), wood);
      pole.position.set(x * 1.05, 1.25, z * 1.4);
      root.add(pole);
    }
    const stripes = document.createElement('canvas');
    stripes.width = 128;
    stripes.height = 8;
    const sc = stripes.getContext('2d');
    for (let i = 0; i < 8; i++) {
      sc.fillStyle = i % 2 ? '#ffffff' : '#d8413a';
      sc.fillRect(i * 16, 0, 16, 8);
    }
    const tex = new THREE.CanvasTexture(stripes);
    tex.colorSpace = THREE.SRGBColorSpace;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.1, 0.9, 4, 1, true), new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide }));
    roof.position.y = 2.9;
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(1.05, 1, 0.75);
    root.add(roof);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.6), new THREE.MeshBasicMaterial({ map: signTexture(t('ev_fair_sign'), '#2f6b45', '#fff8e8', '🎀') }));
    sign.position.set(0, 1.35, 0.58);
    root.add(sign);
    const ribbon = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('🏆'), transparent: true }));
    ribbon.position.set(0, 1.3, 0);
    ribbon.scale.setScalar(0.6);
    root.add(ribbon);
    root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.position.set(FAIR_SPOT.x, g.world.heightAt(FAIR_SPOT.x, FAIR_SPOT.z), FAIR_SPOT.z);
    root.rotation.y = Math.atan2(-FAIR_SPOT.x, -6 - FAIR_SPOT.z);
    g.scene.add(root);
    this.props.push(root);
  }

  clearProps() {
    for (const r of this.props) {
      r.parent?.remove(r);
      disposeModel(r);
    }
    this.props = [];
  }

  // ------------------------------------------------------------ flèche et repères

  animate(dt) {
    const s = this.state;
    const info = s?.info;
    const now = performance.now() / 1000;
    if (!info?.pos) {
      this.marker.visible = false;
      this.ring.visible = false;
    } else {
      const w = this.game.world;
      const ground = w.heightAt(info.pos.x, info.pos.z);
      const e = info.entity;
      const top = e ? e.position.y + e.label.position.y + 0.9 : ground + (info.y ?? 3.2);
      this.marker.visible = true;
      this.marker.position.set(info.pos.x, top + Math.abs(Math.sin(now * 3)) * 0.45, info.pos.z);
      this.arrow.rotation.y = now * 1.6;
      // Plus petite quand on est tout près (sinon elle cache l'animal).
      const pp = this.game.player.position;
      const near = Math.min(1, Math.hypot(info.pos.x - pp.x, info.pos.z - pp.z) / 12);
      const sc = (e ? Math.max(0.6, Math.min(1, e.scale)) : 1.1) * (0.55 + 0.45 * near);
      this.marker.scale.setScalar(sc);
      this.ring.visible = true;
      this.ring.position.set(info.pos.x, (e ? e.position.y : ground) + 0.06, info.pos.z);
      this.ring.scale.setScalar(1 + Math.sin(now * 4) * 0.12);
    }
    // « ! » au-dessus des animaux encore dehors (orage, froid, soif) ou de l'animal blessé.
    const list = [];
    if (s) {
      if (['storm', 'coldSnap', 'heatwave'].includes(s.ev.type)) {
        for (const a of s.progress.missing.slice(0, 16)) {
          const e = this.game.entities.get(a.id);
          if (e && e !== info?.entity) list.push(e);
        }
      }
      if (info?.dotOn) list.push(info.dotOn);
    }
    while (this.dots.length < list.length) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('❗'), depthTest: false, transparent: true }));
      sp.renderOrder = 25;
      sp.scale.setScalar(0.7);
      this.game.scene.add(sp);
      this.dots.push(sp);
    }
    this.dots.forEach((sp, i) => {
      const e = list[i];
      sp.visible = !!e;
      if (e) sp.position.set(e.position.x, e.position.y + e.label.position.y + 0.55 + Math.sin(now * 5 + i) * 0.08, e.position.z);
    });
    // Le voisin fait coucou.
    for (const r of this.props) {
      if (r.userData.arm) r.userData.arm.rotation.z = 2.5 + Math.sin(now * 6) * 0.35;
    }
    if (s && this.banner && !this.banner.min) this.bannerAcc = (this.bannerAcc ?? 0) + dt;
    if (this.bannerAcc > 0.2) {
      this.bannerAcc = 0;
      this.renderBanner();
    }
  }

  hideMarkers() {
    this.marker.visible = false;
    this.ring.visible = false;
    for (const d of this.dots) d.visible = false;
  }

  hideAll() {
    this.hideMarkers();
    this.banner?.hide();
    this.state = null;
    this.pendingResult = null;
    if (this.props.length) this.clearProps();
    this.profileRef = null;
  }

  // ------------------------------------------------------------ pour tester

  /** Lance tout de suite un événement (en ignorant l'heure, la saison et la chance). */
  force(type) {
    const g = this.game;
    if (!EVENT_TYPES.includes(type)) {
      console.warn(`Types d'événements : ${EVENT_TYPES.join(', ')}`);
      return null;
    }
    const st = eventState(g.profile);
    if (st.active) this.finish(st.active, 'cancel', this.context(st.active));
    st.weather = null;
    st.cooldowns[type] = 0;
    const ev = startEvent(g.profile, type, this.context(null), Math.random, true);
    if (!ev) {
      console.warn(`Impossible de lancer « ${type} » ici (il faut peut-être d'autres animaux).`);
      return null;
    }
    this.begin(ev);
    return ev;
  }

  /** Termine l'événement en cours ('success' ou 'fail'), pour voir l'écran de fin. */
  end(outcome = 'success') {
    const ev = eventState(this.game.profile).active;
    if (ev) this.finish(ev, outcome, this.context(ev));
  }

  get active() {
    return this.game.profile ? eventState(this.game.profile).active : null;
  }
}

// Un animal peut être « épinglé » à une zone (l'abri pendant l'orage, l'endroit où il s'est échappé) :
// on remplace sa zone de vie (getter `home` d'AnimalEntity) pour cet animal seulement.
function pin(e, area) {
  Object.defineProperty(e, 'home', { value: area, configurable: true, writable: true });
}

function unpin(e) {
  if (Object.prototype.hasOwnProperty.call(e, 'home')) delete e.home;
}


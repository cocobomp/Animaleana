// Boucle de jeu : relie la simulation (src/sim), la 3D et l'interface.

import * as THREE from 'three';
import { World } from './World.js';
import { Weather3D } from './Weather3D.js';
import { Player, CameraRig } from './Player.js';
import { AnimalEntity } from './AnimalEntity.js';
import { Input } from './Input.js';
import { HelperEntity } from './HelperEntity.js';
import { Herding } from './Herding.js';
import { EQUIPMENT_MODELS } from './models/equipment.js';
import { disposeModel } from './models/animalModel.js';
import {
  EQUIPMENT, HERD_SPECIES, equipmentAt, buyEquipment, refillEquipment, wantedEquipment, useEquipment,
  passiveEquipment, hireHelper, fireHelper, payHelpers, doHelperTask, tickProduce, collectProduct,
  socialMoment, graze, companionsOf, hasStock, helperTask as helperTaskFn,
} from '../sim/farm.js';
import { SPECIES } from '../sim/species.js';
import {
  NEEDS, tickAnimal, applyCare, CARE, trainTrick, trainSkill, canRide, canBreed, breed, cure, checkup, mood, ageYears,
} from '../sim/animal.js';
import { minutesPerSecond, dayOf, hourOf, isNight, seasonOf } from '../sim/time.js';
import { PLACES, rollWeather, temperature, checkTravel, TRAVEL_MODES } from '../sim/places.js';
import { adoptionPrice } from '../sim/adoption.js';
import { checkObjectives } from '../sim/objectives.js';
import { saveProfile, spend, earn, canAfford, addStat } from '../sim/profile.js';
import { buildingActions, animalActionAllowed } from '../sim/buildings.js';
import { addXp, isUnlocked, levelOf, UNLOCKS } from '../sim/progress.js';
import { GEAR, buyGear, equip, unequip, rideGear, feltWeather, canLead } from '../sim/gear.js';
import { PEN, FIELD } from './AnimalEntity.js';
import { t, L } from '../i18n.js';

const CARE_EMOJI = {
  feed: '🍖', water: '💧', brush: '✨', wash: '🫧', clean: '🧹', nails: '✂️', shoe: '🔨',
  pet: '❤️', treat: '🍪', play: '⚽', lunge: '⭐', liberty: '💛',
};

export const JOBS = [
  { id: 'walk', pay: 25, hours: 1 },
  { id: 'catsit', pay: 30, hours: 1.5 },
  { id: 'stable', pay: 40, hours: 2 },
  { id: 'hay', pay: 35, hours: 2 },
];

export const VET_COST = { clinic: 30, home: 50 };

export class Game {
  constructor(container, ui) {
    this.ui = ui;
    this.quality = readQuality();
    const renderer = new THREE.WebGLRenderer({ antialias: this.quality === 'high', powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.25));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = this.quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.75;
    container.prepend(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
    this.world = new World(this.scene, this.quality);
    this.weather3d = new Weather3D(this.scene, this.quality);
    this.rig = new CameraRig(this.camera);
    this.input = new Input(renderer.domElement, document.getElementById('joystick'));
    this.input.onKey = (code) => this.onKey(code);
    this.input.onTap = (x, y) => this.onTap(x, y);
    this.raycaster = new THREE.Raycaster();
    this.marker = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.marker.visible = false;
    this.scene.add(this.marker);
    this.entities = new Map();
    this.helpers = new Map();
    this.equipment = [];
    this.herding = new Herding(this);
    this.profile = null;
    this.running = false;
    this.simAcc = 0;
    this.checkAcc = 0;
    this.saveAcc = 0;
    this.focus = null;

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('pagehide', () => this.save());
    this.clock = new THREE.Clock();
    renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- partie

  start(profile) {
    this.profile = profile;
    this.rig.mode = profile.settings.camera ?? 'third';
    this.player = this.player ?? new Player(this.scene, this.world, profile.avatar);
    this.player.setAvatar(profile.avatar);
    this.loadPlace(profile.place);
    this.running = true;
    this.clock.getDelta();
    this.ui.onStart(this);
    if (profile.animals.length === 0) this.ui.toast(t('welcome', { name: profile.name }), 7000);
  }

  stop() {
    this.save();
    if (this.player?.mount) this.player.dismount();
    this.herding.stop(false);
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear();
    for (const h of this.helpers.values()) h.dispose();
    this.helpers.clear();
    this.running = false;
    this.profile = null;
  }

  save() {
    if (!this.profile) return;
    for (const e of this.entities.values()) {
      e.data.pos = [e.position.x, e.position.z];
    }
    saveProfile(this.profile);
  }

  get day() {
    return dayOf(this.profile.clock);
  }

  get hour() {
    return hourOf(this.profile.clock);
  }

  get season() {
    return seasonOf(new Date());
  }

  get placeDef() {
    return PLACES[this.profile.place];
  }

  loadPlace(placeId) {
    if (this.player?.mount) this.player.dismount();
    this.herding.stop(false);
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear();
    for (const h of this.helpers.values()) h.dispose();
    this.helpers.clear();
    this.world.build(placeId, this.season);
    this.equipment = [];
    for (const eq of equipmentAt(this.profile, placeId)) this.spawnEquipment(eq);
    for (const h of this.profile.helpers) {
      if (h.place === placeId) this.helpers.set(h.id, new HelperEntity(h, this.world, this.scene));
    }
    this.weatherKey = null;
    this.updateWeather();
    this.player.spawn(0, -6);
    this.rig.yaw = Math.PI;
    this.rig.reset();
    for (const a of this.profile.animals) {
      if (a.location === placeId) this.spawnEntity(a);
    }
  }

  spawnEquipment(eq) {
    const def = EQUIPMENT[eq.type];
    const mesh = EQUIPMENT_MODELS[eq.type]();
    const [x, z] = def.slot;
    mesh.position.set(x, this.world.heightAt(x, z), z);
    this.world.group.add(mesh);
    this.world.colliders.push({ x, z, hw: 0.5, hd: 0.4, equip: true });
    const entry = { eq, def, mesh, pos: new THREE.Vector3(x, 0, z) };
    this.equipment.push(entry);
    return entry;
  }

  spawnEntity(a, near = null) {
    const e = new AnimalEntity(a, this.world, this.scene);
    if (near) {
      e.position.set(near.x + (Math.random() - 0.5) * 3, 0, near.z + (Math.random() - 0.5) * 3);
      this.world.resolveCollisions(e.position);
      e.snap();
    } else if (a.pos) {
      e.position.set(a.pos[0], 0, a.pos[1]);
      e.snap();
    }
    this.entities.set(a.id, e);
    return e;
  }

  animalsHere() {
    return this.profile.animals.filter((a) => a.location === this.profile.place);
  }

  // ---------------------------------------------------------------- météo

  updateWeather() {
    const key = `${this.day}-${Math.floor(this.hour / 6)}`;
    if (key === this.weatherKey) return;
    this.weatherKey = key;
    this.weather = rollWeather(this.profile.place, this.season, key);
    this.weather3d.set(this.weather);
  }

  get temperature() {
    return temperature(this.profile.place, this.season, this.hour, this.weather);
  }

  simWeather() {
    if (this.weather === 'clear' && this.temperature >= 28) return 'heat';
    return this.weather;
  }

  // ---------------------------------------------------------------- temps

  /** Fait passer du temps d'un coup (sommeil, voyage, petit boulot). */
  advanceTime(hours, ctx = {}, decayFactor = 1) {
    this.profile.clock += hours * 60;
    const here = this.animalsHere();
    for (const a of here) {
      const events = tickAnimal(a, hours * decayFactor, { ...ctx, weather: this.simWeather(), ...this.socialCtx(a, here) });
      a.ageDays += (hours * (1 - decayFactor)) / 24;
      tickProduce(a, hours);
      this.handleEvents(a, events);
    }
    this.farmTick(here, hours, true);
    this.updateWeather();
  }

  socialCtx(a, here) {
    const companions = companionsOf(a, here);
    return { companions, alone: HERD_SPECIES.includes(a.species) && companions === 0 };
  }

  /** Effets de la ferme pendant `hours` heures : litière, pâturage, aides (si temps sauté), salaires. */
  farmTick(here, hours, skipped = false) {
    const p = this.profile;
    passiveEquipment(p, here, p.place, hours);
    for (const a of here) {
      if (a.zone === 'field') graze(a, hours, this.world.snowy);
    }
    // Quand on saute du temps (nuit, voyage…), les aides travaillent quand même.
    if (skipped) {
      for (const h of p.helpers.filter((x) => x.place === p.place)) {
        for (let i = 0; i < Math.min(12, Math.ceil(hours)); i++) {
          const task = this.helperTaskFor(h);
          if (!task) break;
          doHelperTask(p, task, here);
        }
      }
    }
    const day = this.day;
    if (p.lastPayDay === undefined) p.lastPayDay = day;
    if (day > p.lastPayDay) {
      const left = payHelpers(p, day - p.lastPayDay);
      p.lastPayDay = day;
      for (const h of left) {
        this.helpers.get(h.id)?.dispose();
        this.helpers.delete(h.id);
        this.ui.toast(t('helperLeft', { name: h.name, g: h.sex }), 6000);
      }
    }
    this.autoHerd();
  }

  helperTaskFor(h) {
    return helperTaskFn(this.profile, h, this.animalsHere());
  }

  handleEvents(a, events) {
    if (events.includes('sick')) this.ui.toast(t('gotSick', { name: a.name, g: a.sex }), 6000);
    if (events.includes('died')) this.animalDied(a);
  }

  animalDied(a) {
    const p = this.profile;
    p.animals = p.animals.filter((x) => x.id !== a.id);
    const y = Math.floor(ageYears(a));
    p.memorial.push({ name: a.name, g: a.sex, species: a.species, breed: a.breed, years: y, day: this.day });
    const e = this.entities.get(a.id);
    if (e) {
      if (this.player.mount === e) this.player.dismount();
      e.dispose();
      this.entities.delete(a.id);
    }
    this.ui.closePanelFor(a.id);
    this.ui.alert(t('died', { name: a.name, g: a.sex, age: t('years', { n: y }) }));
  }

  // ---------------------------------------------------------------- boucle

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    if (!this.running) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const p = this.profile;
    const mps = minutesPerSecond(p.settings.timeSpeed);
    p.clock += dt * mps;
    const night = isNight(p.clock);

    const ctrl = this.input.poll();
    if (ctrl.look.dx || ctrl.look.dy || ctrl.zoom) this.ui.hideHelp?.();
    this.player.update(dt, ctrl, this.rig.yaw, this.rig.mode === 'first');
    this.rig.update(dt, ctrl, this.player, this.world);

    const entities = [...this.entities.values()];
    const ctx = { playerPos: this.player.position, night, entities, game: this };
    for (const e of entities) e.update(dt, ctx);
    for (const h of this.helpers.values()) h.update(dt, this);
    this.herding.update(dt);
    for (const q of this.equipment) {
      if (q.mesh.userData.spin) q.mesh.userData.spin.rotation.y += dt * 2;
    }

    const { day } = this.world.updateSky(this.hour, this.weather, this.player.position);
    this.world.updateClouds(dt);
    this.player.torch.intensity = (1 - day) * 6;
    const flash = this.weather3d.update(dt, this.camera.position);
    if (flash) this.world.hemi.intensity += flash * 3;

    // Simulation des besoins 2 fois par seconde.
    this.simAcc += dt;
    if (this.simAcc >= 0.5) {
      const hours = (this.simAcc * mps) / 60;
      this.simAcc = 0;
      this.updateWeather();
      const weather = this.simWeather();
      const here = this.animalsHere();
      this.farmTick(here, hours);
      for (const a of here) {
        const e = this.entities.get(a.id);
        const before = mood(a);
        const events = tickAnimal(a, hours, {
          weather: feltWeather(a, weather, this.temperature, this.season), sleeping: e?.sleeping, ridden: e?.ridden, moving: e && e.speed > 0.3, ...this.socialCtx(a, here),
        });
        tickProduce(a, hours);
        if (before !== 'sad' && mood(a) === 'sad') this.ui.toast(t('sad', { name: a.name, g: a.sex }), 4000);
        this.handleEvents(a, events);
        if (e && e.stage !== undefined) {
          const oldScale = e.scale;
          e.applyScale();
          if (Math.abs(e.scale - oldScale) > 0.01) e.placeLabels();
        }
      }
      this.ui.refresh();
    }

    this.checkAcc += dt;
    if (this.checkAcc > 2) {
      this.checkAcc = 0;
      for (const o of checkObjectives(p)) {
        this.xp('quest');
        const name = t(`o_${o.id}`);
        const msg = o.kind === 'quest' ? t('questDone', { name }) : t('achievementDone', { name });
        this.ui.toast(o.reward && p.mode === 'manage' ? `${msg} ${t('reward', { n: o.reward })}` : msg, 5000);
      }
    }
    this.saveAcc += dt;
    if (this.saveAcc > 15) {
      this.saveAcc = 0;
      this.save();
    }

    if (this.marker.visible) {
      this.marker.scale.setScalar(1 + Math.sin(performance.now() / 150) * 0.12);
      if (!this.player.auto) this.marker.visible = false;
    }
    this.updateFocus();
    this.renderer.render(this.scene, this.camera);
  }

  // ---------------------------------------------------------------- toucher l'écran

  /** Toucher le sol : on y va. Toucher un animal ou un bâtiment : on y va puis on choisit quoi faire. */
  onTap(sx, sy) {
    if (!this.running || this.ui.isBlocking()) return;
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const roots = [...this.entities.values()].filter((e) => !e.ridden).map((e) => e.root);
    const hitA = this.raycaster.intersectObjects(roots, true).find((h) => !h.object.isSprite || h.object === h.object.parent?.userData?.entity?.label);
    if (hitA) {
      let o = hitA.object;
      while (o && !o.userData.entity) o = o.parent;
      const e = o?.userData.entity;
      if (e) {
        this.walkTo(e.position, e.radius + 1.2, () => this.ui.openAnimalActions(e.data), true);
        return;
      }
    }
    if (this.player.mount) {
      const hitG = this.raycaster.intersectObject(this.world.group, true)[0];
      if (hitG) this.walkTo(hitG.point, 1);
      return;
    }
    const hit = this.raycaster.intersectObject(this.world.group, true)[0];
    if (!hit) return;
    const kind = this.world.kindAt(hit.point.x, hit.point.z);
    if (kind) {
      const door = this.world.interactables.find((i) => i.kind === kind);
      if (door) {
        this.walkTo(new THREE.Vector3(door.x, 0, door.z), 1.2, () => this.ui.openBuilding(kind));
        return;
      }
    }
    if (this.world.isWater(hit.point.x, hit.point.z)) return;
    this.walkTo(hit.point, 0.5);
  }

  walkTo(point, radius, onArrive = null, follow = false) {
    const target = point.clone ? point : new THREE.Vector3(point.x, 0, point.z);
    this.marker.position.set(target.x, this.world.heightAt(target.x, target.z) + 0.05, target.z);
    this.marker.visible = !follow;
    // Si on vise un animal qui bouge, on vise sa position actuelle.
    this.player.goTo(follow ? target.clone() : target, radius, onArrive);
  }

  buildingContext() {
    const here = this.animalsHere();
    const sp = (a) => SPECIES[a.species];
    return {
      hour: this.hour,
      season: this.season,
      home: this.placeDef.home,
      count: {
        horse: here.filter((a) => a.species === 'horse').length,
        livestock: here.filter((a) => sp(a).livestock).length,
        pets: here.filter((a) => ['dog', 'cat', 'rabbit'].includes(a.species)).length,
        sick: here.filter((a) => a.sick).length,
        milkable: here.filter((a) => a.produceReady && sp(a).product?.action === 'milk').length,
        shearable: here.filter((a) => a.produceReady && sp(a).product?.action === 'shear').length,
      },
    };
  }

  buildingActions(kind) {
    return buildingActions(kind, this.buildingContext());
  }

  animalActionAllowed(a, action) {
    return animalActionAllowed(action, { sleeping: this.entities.get(a.id)?.sleeping });
  }

  /** Un soin pour tout un groupe d'animaux (ex. foin pour tous les chevaux). */
  groupCare(filter, action, quality = 1) {
    let n = 0;
    for (const a of this.animalsHere().filter(filter)) {
      if (!SPECIES[a.species].actions.includes(action)) continue;
      if (!canAfford(this.profile, CARE[action].cost)) break;
      if (applyCare(a, action, quality).ok) {
        spend(this.profile, CARE[action].cost);
        addStat(this.profile, action);
        this.entities.get(a.id)?.emit(CARE_EMOJI[action] ?? '❤️', 2);
        n++;
      }
    }
    if (n) this.xp('care', Math.min(n, 3));
    this.ui.toast(n ? t('doneAll', { n }) : t('nobody'));
    this.ui.refresh();
    return n;
  }

  groupCollect(action) {
    let n = 0;
    for (const a of this.animalsHere()) {
      if (a.produceReady && SPECIES[a.species].product?.action === action && collectProduct(this.profile, a).ok) {
        this.entities.get(a.id)?.emit(action === 'shear' ? '🧶' : '🥛', 2);
        n++;
      }
    }
    this.ui.toast(n ? t('doneAll', { n }) : t('nobody'));
    return n;
  }

  /** Les chevaux rentrent au paddock (ou en sortent pour aller au pré). */
  sendHorses(where) {
    const target = where === 'field' ? FIELD : { x: -16, z: 16 };
    let n = 0;
    for (const e of this.entities.values()) {
      if (e.data.species !== 'horse' || e.ridden) continue;
      e.data.following = false;
      e.data.zone = where === 'field' ? 'field' : undefined;
      e.state = 'walk';
      e.target.set(target.x + (Math.random() - 0.5) * 6, 0, target.z + (Math.random() - 0.5) * 6);
      e.timer = 30;
      n++;
    }
    this.ui.toast(n ? t(where === 'field' ? 'horsesOut' : 'storedHorses') : t('nobody'));
  }

  /** Ce qui demande l'attention du joueur maintenant (pour le bouton ⏩). */
  needsAttention() {
    const out = [];
    for (const a of this.animalsHere()) {
      if (a.sick) out.push({ a, what: 'sick' });
      else {
        const low = NEEDS.filter((n) => a.needs[n] < 40).sort((x, y) => a.needs[x] - a.needs[y])[0];
        if (low) out.push({ a, what: low });
        else if (a.produceReady) out.push({ a, what: SPECIES[a.species].product.id });
      }
    }
    return out;
  }

  /**
   * ⏩ Avance jusqu'au prochain moment intéressant : un animal qui a besoin de toi,
   * ou un rendez-vous de la journée (traite, sortie au pré, ouverture du refuge…). 12 h au plus.
   */
  skipAhead() {
    const now = this.needsAttention();
    if (now.length) {
      const { a, what } = now[0];
      this.ui.toast(t('skipBusy', { name: a.name, g: a.sex, what: t(`attn_${what}`, { g: a.sex }) }), 5000);
      return 0;
    }
    const RDV = [6, 8, 9, 17, 20];
    let hours = 0;
    while (hours < 12) {
      const step = 0.25;
      const before = this.hour;
      this.advanceTime(step);
      hours += step;
      const after = this.hour;
      const crossed = RDV.find((r) => (before < r && after >= r) || (before > after && after >= r));
      if (this.needsAttention().length || crossed !== undefined) break;
    }
    this.ui.toast(t('skipped', { h: Math.round(hours * 10) / 10 }), 4000);
    this.ui.refresh();
    return hours;
  }

  /** Gagne de l'expérience ; annonce le nouveau niveau et ce qu'il débloque. */
  xp(kind, times = 1) {
    const up = addXp(this.profile, kind, times);
    if (!up) return;
    const names = up.unlocked.map((k) => this.unlockName(k)).join(', ');
    this.ui.levelUp(up.level, names);
  }

  unlockName(key) {
    if (EQUIPMENT[key]) return t(`eq_${key}`);
    if (['petsitter', 'groom', 'shepherd', 'farmhand', 'vet'].includes(key)) return t(`helper_${key}`);
    return t(`st_${key}`);
  }

  get level() {
    return levelOf(this.profile.xp ?? 0);
  }

  isUnlocked(key) {
    return isUnlocked(this.profile, key);
  }

  unlockLevel(key) {
    return UNLOCKS[key] ?? 1;
  }

  buyGear(item) {
    const r = buyGear(this.profile, item);
    if (!r.ok) return this.ui.toast(t('r_money'));
    this.ui.toast(t('gearBought', { name: t(`gear_${item}`) }));
    return r;
  }

  equip(a, item, color) {
    const r = equip(this.profile, a, item, color);
    if (!r.ok) return this.ui.toast(t(`gear_${r.reason}`));
    this.entities.get(a.id)?.applyGear();
    if (this.player.mount?.data === a) this.player.seat();
    return r;
  }

  unequip(a, slot) {
    unequip(a, slot);
    this.entities.get(a.id)?.applyGear();
  }

  moodOf(a) {
    return mood(a);
  }

  /** Emmène le troupeau : avec le chien ou le berger s'il y en a un, sinon les animaux y vont seuls. */
  moveFlock(dest) {
    if (this.herder()) return this.startHerding(dest);
    let n = 0;
    for (const e of this.entities.values()) {
      if (!e.sp.livestock) continue;
      e.data.zone = dest;
      e.data.following = false;
      e.state = 'walk';
      e.pickWanderTarget();
      e.timer = 40;
      n++;
    }
    this.ui.toast(n ? t('flockMoving') : t('noFlock'), 5000);
    return n > 0;
  }

  checkHorses() {
    const horses = this.animalsHere().filter((a) => a.species === 'horse');
    const sick = horses.filter((a) => a.sick || mood(a) === 'sad');
    this.ui.toast(sick.length ? t('checkBad', { names: sick.map((a) => a.name).join(', ') }) : t('checkGood', { n: horses.length }), 5000);
  }

  /** Cherche ce qui est à portée de main (animal, porte…) pour le bouton d'action. */
  updateFocus() {
    let best = null;
    const pp = this.player.position;
    if (this.player.mount) {
      best = { kind: 'dismount' };
    } else {
      let bestD = Infinity;
      for (const e of this.entities.values()) {
        const d = Math.hypot(e.position.x - pp.x, e.position.z - pp.z) - e.radius;
        if (d < 1.6 && d < bestD) {
          bestD = d;
          best = { kind: 'animal', entity: e };
        }
      }
      if (!best) {
        for (const it of this.world.interactables) {
          const d = Math.hypot(it.x - pp.x, it.z - pp.z);
          if (d < 3 && d < bestD) {
            bestD = d;
            best = it;
          }
        }
      }
    }
    const key = best ? `${best.kind}-${best.entity?.data.id ?? ''}` : '';
    if (key !== this.focusKey) {
      this.focusKey = key;
      this.focus = best;
      this.ui.setFocus(best);
    }
  }

  onKey(code) {
    if (!this.running || this.ui.isBlocking()) return;
    if (code === 'KeyE' || code === 'Enter') this.interact();
    if (code === 'KeyC') this.toggleCamera();
  }

  interact() {
    const f = this.focus;
    if (!f) return;
    switch (f.kind) {
      case 'animal': this.ui.openAnimalActions(f.entity.data); break;
      case 'refuge':
      case 'vet':
      case 'house':
      case 'lodge':
      case 'jobs':
      case 'stable':
      case 'pen': this.ui.openBuilding(f.kind); break;
      case 'dismount': this.dismount(); break;
      default:
    }
  }

  toggleCamera() {
    this.rig.mode = this.rig.mode === 'third' ? 'first' : 'third';
    this.profile.settings.camera = this.rig.mode;
  }

  setQuality(q) {
    try {
      localStorage.setItem('animaleana.quality', q);
    } catch {
      /* rien */
    }
  }

  // ---------------------------------------------------------------- actions

  /** Vérifie qu'un soin est possible avant de lancer son mini-jeu. */
  canCare(a, action) {
    const care = CARE[action];
    if (!canAfford(this.profile, care.cost)) return { ok: false, reason: 'money' };
    if (care.full && a.needs[care.full] >= 96) return { ok: false, reason: 'full' };
    if (care.tiring && a.needs.energy < 15) return { ok: false, reason: 'tired' };
    if (care.tiring && a.sick) return { ok: false, reason: 'sick' };
    return { ok: true };
  }

  care(a, action, quality = 1) {
    const care = CARE[action];
    if (!canAfford(this.profile, care.cost)) return this.ui.toast(t('r_money'));
    const res = applyCare(a, action, quality);
    if (!res.ok) return this.ui.toast(t(`r_${res.reason}`, { name: a.name, g: a.sex }));
    spend(this.profile, care.cost);
    addStat(this.profile, action);
    this.xp('care');
    this.entities.get(a.id)?.emit(CARE_EMOJI[action] ?? '❤️');
    this.ui.refresh();
    return res;
  }

  trick(a, trickId) {
    const r = trainTrick(a, trickId);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex }));
    const e = this.entities.get(a.id);
    this.xp(r.learned ? 'trickLearned' : 'trick');
    if (r.learned) {
      addStat(this.profile, 'tricksLearned');
      e?.emit('🎉', 5);
      this.ui.toast(t('trickLearned', { name: a.name, g: a.sex, trick: t(`trick_${trickId}`) }));
    } else if (r.success) {
      e?.emit('⭐', 2);
      this.ui.toast(t('trickSuccess', { name: a.name, g: a.sex, p: r.progress }));
    } else {
      this.ui.toast(t('trickFail', { name: a.name, g: a.sex }));
    }
    this.ui.refresh();
    return r;
  }

  train(a, trainingId) {
    const r = trainSkill(a, trainingId);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex }));
    addStat(this.profile, 'trainings');
    this.entities.get(a.id)?.emit('💪', 2);
    this.ui.toast(t('skillGain', { name: a.name, g: a.sex, skill: t(`skill_${r.skill}`), n: r.gain }));
    this.ui.refresh();
    return r;
  }

  ride(a) {
    const r = canRide(a);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex }));
    const gear = rideGear(a);
    if (!gear.ok) return this.ui.toast(t('r_needBridle', { name: a.name, g: a.sex }), 5000);
    this.bareback = gear.bareback;
    const e = this.entities.get(a.id);
    if (!e) return null;
    this.player.ride(e);
    addStat(this.profile, 'rides');
    this.xp('ride');
    this.ui.toast(t(gear.bareback ? 'ridingBareback' : 'ridingHint', { name: a.name, g: a.sex }));
    return r;
  }

  dismount() {
    this.player.dismount();
  }

  toggleFollow(a) {
    if (!a.following) {
      const lead = canLead(a);
      if (!lead.ok) return this.ui.toast(t('r_needHalter', { name: a.name, g: a.sex }), 5000);
    }
    a.following = !a.following;
    this.ui.toast(t(a.following ? 'following' : 'staying', { name: a.name, g: a.sex }));
    if (a.following) addStat(this.profile, 'walks');
  }

  callHere(a) {
    const e = this.entities.get(a.id);
    if (!e) return;
    const p = this.player.position;
    e.position.set(p.x + Math.sin(this.player.heading) * 2, 0, p.z + Math.cos(this.player.heading) * 2);
    this.world.resolveCollisions(e.position);
    e.snap();
  }

  rename(a, name) {
    a.name = name.trim().slice(0, 20) || a.name;
    this.entities.get(a.id)?.rename();
  }

  adopt(candidate, name) {
    const price = adoptionPrice(candidate);
    if (!spend(this.profile, price)) return this.ui.toast(t('r_money'));
    const a = { ...candidate, name: name?.trim() || candidate.name, location: this.profile.place };
    this.profile.adoptedKeys.push(candidate.adoptKey);
    delete a.adoptKey;
    this.profile.animals.push(a);
    addStat(this.profile, 'adopted');
    this.xp('adopt');
    // Le premier cheval reçoit tout de suite le filet et la selle offerts.
    if (a.species === 'horse') {
      equip(this.profile, a, 'halter', 'red');
      equip(this.profile, a, 'bridle');
      equip(this.profile, a, 'saddle');
    }
    const door = this.world.interactables.find((i) => i.kind === 'refuge');
    const e = this.spawnEntity(a, door);
    e.emit('❤️', 5);
    this.ui.toast(t('adopted', { name: a.name, g: a.sex }));
    this.save();
    return a;
  }

  breedingPartners(a) {
    return this.animalsHere().filter((b) => b.id !== a.id && b.species === a.species && b.sex !== a.sex);
  }

  canBreed(a, b) {
    return canBreed(a, b, this.day);
  }

  breed(a, b) {
    const r = canBreed(a, b, this.day);
    if (!r.ok) return this.ui.toast(t(r.reason === 'cooldown' ? 'breedCooldown' : 'breedNone'));
    const babies = breed(a, b, this.day);
    const mother = a.sex === 'f' ? a : b;
    const near = this.entities.get(mother.id)?.position;
    for (const baby of babies) {
      this.profile.animals.push(baby);
      this.spawnEntity(baby, near).emit('🍼', 3);
    }
    addStat(this.profile, 'births', babies.length);
    this.xp('birth');
    this.ui.toast(t('born', { n: babies.length, names: babies.map((x) => x.name).join(', ') }), 6000);
    this.save();
    return babies;
  }

  vetCost(atClinic) {
    return atClinic ? VET_COST.clinic : VET_COST.home;
  }

  vetDone(a, atClinic) {
    spend(this.profile, this.vetCost(atClinic));
    const wasSick = !!a.sick;
    if (wasSick) cure(a);
    else checkup(a);
    addStat(this.profile, 'vet');
    this.xp('vet');
    this.entities.get(a.id)?.emit('💚', 4);
    this.ui.toast(t(wasSick ? 'vetCured' : 'vetCheckupDone', { name: a.name, g: a.sex }));
    this.ui.refresh();
  }

  sleep() {
    const h = this.hour;
    const hours = h < 7 ? 7 - h : 31 - h;
    this.advanceTime(hours, { sleeping: true });
    for (const a of this.animalsHere()) a.needs.energy = Math.max(a.needs.energy, 90);
    this.ui.toast(t('sleepDone'), 4000);
    this.save();
  }

  doJob(job) {
    this.advanceTime(job.hours);
    earn(this.profile, job.pay);
    addStat(this.profile, 'jobs');
    this.ui.toast(t('jobDone', { n: job.pay }));
  }

  // ---------------------------------------------------------------- ferme

  wantedEquipment(a) {
    const eq = wantedEquipment(this.profile, a, this.profile.place);
    return eq ? this.equipment.find((q) => q.eq.id === eq.id) ?? null : null;
  }

  animalUsedEquipment(entity, entry) {
    if (!entry) return;
    const r = useEquipment(this.profile, entity.data, entry.eq);
    if (r.ok) entity.emit({ hunger: '🍖', thirst: '💧', grooming: '✨' }[r.need] ?? '❤️', 2);
  }

  socialMoment(entity, kind) {
    socialMoment(entity.data, kind);
    entity.emit({ play: '⚽', groom: '💕', nurse: '🍼' }[kind], 1);
  }

  buyEquipment(type) {
    if (!this.isUnlocked(type)) return this.ui.toast(t('lockedLevel', { n: this.unlockLevel(type) }));
    const r = buyEquipment(this.profile, type, this.profile.place);
    if (!r.ok) return this.ui.toast(t(r.reason === 'money' ? 'r_money' : 'alreadyOwned'));
    this.spawnEquipment(r.equipment);
    addStat(this.profile, 'equipment');
    this.ui.toast(t('equipmentBought', { name: t(`eq_${type}`) }));
    this.save();
    return r;
  }

  refillEquipment(eq) {
    const r = refillEquipment(this.profile, eq);
    if (!r.ok) return this.ui.toast(t(r.reason === 'money' ? 'r_money' : 'alreadyFull'));
    this.ui.toast(t('refilled', { name: t(`eq_${eq.type}`) }));
    return r;
  }

  hire(type) {
    if (!this.isUnlocked(type)) return this.ui.toast(t('lockedLevel', { n: this.unlockLevel(type) }));
    const r = hireHelper(this.profile, type, this.profile.place);
    if (!r.ok) return this.ui.toast(t('alreadyHired'));
    this.helpers.set(r.helper.id, new HelperEntity(r.helper, this.world, this.scene));
    addStat(this.profile, 'hired');
    this.ui.toast(t('hired', { name: r.helper.name, g: r.helper.sex, job: t(`helper_${type}`, { g: r.helper.sex }) }));
    this.save();
    return r;
  }

  fire(helperId) {
    this.helpers.get(helperId)?.dispose();
    this.helpers.delete(helperId);
    fireHelper(this.profile, helperId);
    this.save();
  }

  taskPosition(task) {
    if (task.animalId) {
      const e = this.entities.get(task.animalId);
      return e ? e.position : null;
    }
    if (task.equipmentId) return this.equipment.find((q) => q.eq.id === task.equipmentId)?.pos ?? null;
    return null;
  }

  helperDone(helper, task) {
    if (!task) return;
    const r = doHelperTask(this.profile, task, this.animalsHere());
    if (!r.ok) return;
    const e = task.animalId && this.entities.get(task.animalId);
    if (e) e.emit(task.kind === 'cure' ? '💚' : task.kind === 'product' ? '🪣' : '❤️', 2);
    if (task.kind === 'product') this.ui.toast(t(`collected_${r.product}`, { name: helper.data.name, g: helper.data.sex, n: r.earned }));
  }

  collect(a) {
    const r = collectProduct(this.profile, a);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex }));
    this.entities.get(a.id)?.emit(r.product === 'wool' ? '🧶' : '🥛', 3);
    this.xp('collect');
    this.ui.toast(t(`got_${r.product}`, { name: a.name, g: a.sex, n: r.earned }));
    this.ui.refresh();
    return r;
  }

  /** Qui peut conduire le troupeau ici : un chien de troupeau, sinon le berger. */
  herder() {
    const dog = [...this.entities.values()].find((e) => e.data.role === 'herder' && !e.ridden);
    if (dog) return dog;
    return [...this.helpers.values()].find((h) => h.def.herds) ?? null;
  }

  startHerding(dest, pusher = this.herder()) {
    if (!pusher) return this.ui.toast(t('noHerder'));
    if (!this.herding.start(dest, pusher)) return this.ui.toast(t('noFlock'));
    this.ui.toast(t(dest === 'pen' ? 'herdingIn' : 'herdingOut', { name: pusher.data.name, g: pusher.data.sex }));
    return true;
  }

  herdingDone(dest, pusher) {
    addStat(this.profile, 'herds');
    this.xp('herd');
    if (pusher.data.skills) {
      pusher.data.skills.herding = Math.min(100, (pusher.data.skills.herding ?? 0) + 2);
      socialMoment(pusher.data, 'play');
      pusher.emit('⭐', 2);
    }
    this.ui.toast(t(dest === 'pen' ? 'herdedIn' : 'herdedOut'), 4000);
  }

  autoHerd() {
    const p = this.profile;
    if (!p.farm?.autoHerd || this.herding.active) return;
    const h = this.hour;
    const slot = h >= 20 || h < 8 ? 'pen' : 'field';
    const key = `${this.day}-${slot}`;
    if (p.farm.lastHerd === key) return;
    if (h < 8 && slot === 'pen' && p.farm.lastHerd === `${this.day - 1}-pen`) return;
    const flock = [...this.entities.values()].filter((e) => e.sp.livestock);
    if (!flock.length) return;
    const pusher = this.herder();
    if (!pusher) return;
    if (flock.every((e) => (e.data.zone ?? 'pen') === slot)) {
      p.farm.lastHerd = key;
      return;
    }
    p.farm.lastHerd = key;
    this.startHerding(slot, pusher);
  }

  setHerder(a, on) {
    for (const x of this.profile.animals) if (x.role === 'herder' && x.location === a.location) delete x.role;
    if (on) a.role = 'herder';
    this.ui.toast(t(on ? 'herderOn' : 'herderOff', { name: a.name, g: a.sex }));
  }

  equipmentHere() {
    return this.equipment;
  }

  equipmentStock(eq) {
    return hasStock(this.profile, eq);
  }

  travelOptions(destId, travelers) {
    const horseOk = travelers.some((a) => a.species === 'horse' && canRide(a).ok);
    return Object.keys(TRAVEL_MODES).map((mode) => ({
      mode, ...checkTravel(this.profile.place, destId, mode, travelers, horseOk),
    }));
  }

  travel(destId, mode, travelerIds) {
    const p = this.profile;
    const travelers = this.animalsHere().filter((a) => travelerIds.includes(a.id));
    const horse = travelers.find((a) => a.species === 'horse' && canRide(a).ok);
    const check = checkTravel(p.place, destId, mode, travelers, !!horse);
    if (!check.ok) return this.ui.toast(t(`tr_${check.reason}`));
    if (!spend(p, check.cost)) return this.ui.toast(t('r_money'));

    // Pendant le voyage on fait des pauses : les besoins baissent moins vite.
    const hours = check.hours;
    p.clock += hours * 60;
    for (const a of travelers) {
      const events = tickAnimal(a, hours * 0.25, { moving: true, ridden: mode === 'horse' && a === horse });
      a.ageDays += (hours * 0.75) / 24;
      a.location = destId;
      a.following = true;
      delete a.pos;
      if (events.includes('died')) this.animalDied(a);
      else if (events.includes('sick')) this.ui.toast(t('gotSick', { name: a.name, g: a.sex }), 6000);
    }
    p.place = destId;
    if (!p.visited.includes(destId)) p.visited.push(destId);
    addStat(p, 'travels');
    this.xp('travel');
    if (mode === 'horse') addStat(p, 'horseTravels');
    this.loadPlace(destId);
    if (mode === 'horse' && horse && this.entities.get(horse.id)) this.player.ride(this.entities.get(horse.id));
    const def = PLACES[destId];
    this.ui.toast(t('arrived', { flag: def.flag, place: L(def.name) }), 5000);
    this.save();
    return check;
  }

  hud() {
    const p = this.profile;
    return {
      name: p.name,
      money: p.mode === 'sandbox' ? null : p.money,
      day: this.day,
      clock: p.clock,
      place: this.placeDef,
      weather: this.weather,
      temperature: this.temperature,
      season: this.season,
      level: this.level,
      levelProgress: (() => {
        const xp = p.xp ?? 0;
        const lv = levelOf(xp);
        const a = 25 * lv * (lv - 1);
        const b = 25 * (lv + 1) * lv;
        return (xp - a) / (b - a);
      })(),
    };
  }
}

function readQuality() {
  try {
    const q = localStorage.getItem('animaleana.quality');
    if (q) return q;
  } catch {
    /* rien */
  }
  const phone = matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 700;
  return phone ? 'low' : 'high';
}

export { SPECIES };

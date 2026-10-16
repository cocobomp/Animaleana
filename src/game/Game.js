// Boucle de jeu : relie la simulation (src/sim), la 3D et l'interface.

import * as THREE from 'three';
import { World } from './World.js';
import { gfx } from './gfx.js';
import { preloadModels } from './assets.js';
import { Weather3D } from './Weather3D.js';
import { Player, CameraRig } from './Player.js';
import { AnimalEntity } from './AnimalEntity.js';
import { Input } from './Input.js';
import { HelperEntity } from './HelperEntity.js';
import { Herding } from './Herding.js';
import { TaskQueue } from './TaskQueue.js';
import { Interiors, setStableExt } from './Interiors.js'; // écurie et maison où l'on entre, box, corvées
import { ensureFacilities, stableExt } from '../sim/facilities.js'; // taille de l'écurie
import { Events } from './Events.js'; // événements spéciaux (orage, animal blessé…)
import { Clients } from './Clients.js'; // clients (pension, soins) et métiers
import { EQUIPMENT_MODELS } from './models/equipment.js';
import { disposeModel } from './models/animalModel.js';
import {
  EQUIPMENT, HERD_SPECIES, equipmentAt, buyEquipment, refillEquipment, wantedEquipment, useEquipment,
  passiveEquipment, hireHelper, fireHelper, payHelpers, doHelperTask, tickProduce, collectProduct,
  socialMoment, graze, companionsOf, hasStock, helperTask as helperTaskFn,
} from '../sim/farm.js';
import { SPECIES } from '../sim/species.js';
import {
  NEEDS, createAnimal, tickAnimal, applyCare, CARE, breedingChecklist, mate, trainTrick, trainSkill, canRide, canBreed, breed, cure, checkup, mood, ageYears,
} from '../sim/animal.js';
import { minutesPerSecond, dayOf, hourOf, isNight, seasonOf } from '../sim/time.js';
import { PLACES, rollWeather, temperature, checkTravel, TRAVEL_MODES, placeSeason } from '../sim/places.js';
import { adoptionPrice, shopPrice, stageAgeDays } from '../sim/adoption.js';
import { checkObjectives } from '../sim/objectives.js';
import { saveProfile, spend, earn, canAfford, addStat } from '../sim/profile.js';
import { buildingActions, animalActionAllowed } from '../sim/buildings.js';
import { addHelperXp, tireHelper, restHelper, updateBreak, onBreak, startBreak } from '../sim/helpers.js'; // les aides progressent
import { addXp, isUnlocked, levelOf, UNLOCKS } from '../sim/progress.js';
import { digest, addDropping, dryPuddles, dirtNear, removeDroppings, scoopZone } from '../sim/droppings.js';
import { enclosure } from './nav.js';
import { missingTool, buyTool, TOOLS } from '../sim/tools.js';
import { GEAR, buyGear, equip, unequip, rideGear, feltWeather, canLead, canLeash } from '../sim/gear.js';
import { PEN, FIELD } from './AnimalEntity.js';
import { Activities } from './Activities.js'; // activités : saut, balade, agility, spectacles, concours
import { t, L } from '../i18n.js';
// Vue d'ensemble (d'en haut) et constructions du joueur.
import { Structures } from './Structures.js';
import { ManagementView } from './ManagementView.js';
import { openStructure } from '../ui/construction.js';
import { doorOf, equipmentPos } from '../sim/construction.js';
import { applyCoreLayout } from './coreLayout.js';
import { TripFlow } from './TripFlow.js'; // voyages réalistes (véhicule, trajet, pauses)
import { Marker } from './Marker.js';
import { Emitter } from './events.js';
import { audio } from './audio.js'; // sons synthétisés : voix, pas, ambiance, interface

// Animaux qu'on range dans la maison des animaux.
const PET_HOUSED = ['dog', 'cat', 'rabbit'];

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
    gfx.quality = this.quality;
    const renderer = new THREE.WebGLRenderer({ antialias: this.quality === 'high', powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.25));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = this.quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tons filmiques : les hautes lumières (ciel, soleil) restent douces.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    container.prepend(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 5000);
    this.world = new World(this.scene, this.quality);
    this.world.setRenderer(renderer);
    this.weather3d = new Weather3D(this.scene, this.quality);
    this.rig = new CameraRig(this.camera);
    this.input = new Input(renderer.domElement, document.getElementById('joystick'));
    this.input.onKey = (code) => this.onKey(code);
    this.input.onTap = (x, y) => this.onTap(x, y);
    this.raycaster = new THREE.Raycaster();
    // Petit cercle blanc là où on a touché le sol (renommé : game.marker est le repère réutilisable).
    this.tapRing = new THREE.Mesh(
      new THREE.RingGeometry(0.35, 0.5, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.tapRing.visible = false;
    this.scene.add(this.tapRing);
    // Événements du jeu (game.on / game.emit) et repère 3D réutilisable (game.marker.show / hide).
    this.bus = new Emitter(); // (game.events = événements spéciaux)
    this.marker = new Marker(this);
    this.entities = new Map();
    this.helpers = new Map();
    this.equipment = [];
    this.herding = new Herding(this);
    this.tasks = new TaskQueue(this);
    this.interiors = new Interiors(this);
    this.events = new Events(this);
    this.clients = new Clients(this); // visiteurs, animaux confiés, métiers
    this.activities = new Activities(this);
    this.droppingMeshes = new Map();
    this.timeScale = 1; // 0 = pause
    this.profile = null;
    this.running = false;
    this.simAcc = 0;
    this.checkAcc = 0;
    this.saveAcc = 0;
    this.focus = null;
    this.structures = new Structures(this);
    this.mgmt = new ManagementView(this);
    this.tripFlow = new TripFlow(this);
    // Sons (src/game/audio.js) : l'animal répond quand on s'occupe de lui, petits sons sur ⏩ et ×2/×4.
    this.audio = audio;
    this.on('care', ({ a, action }) => this.entities.get(a.id)?.speak(['pet', 'treat', 'play', 'feed', 'water'].includes(action) ? 'happy' : null));
    this.on('adopted', (a) => setTimeout(() => this.entities.get(a.id)?.speak('happy'), 350));
    this.on('skip', (hours) => audio.ui(hours > 0 ? 'skip' : 'cancel'));
    this.on('timeFast', () => audio.ui('fast'));

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
    // Modèles 3D (GLB) : chargés pendant l'écran des profils ; start() attend qu'ils soient prêts.
    this.modelsLoaded = false;
    this.modelsReady = preloadModels().then((n) => { this.modelsLoaded = true; return n; });
  }

  // ---------------------------------------------------------------- partie

  start(profile) {
    if (!this.modelsLoaded) {
      this.modelsReady.then(() => this.start(profile));
      return;
    }
    this.profile = profile;
    this.rig.mode = profile.settings.camera ?? 'third';
    this.player = this.player ?? new Player(this.scene, this.world, profile.avatar);
    this.player.setAvatar(profile.avatar);
    // Bruit des pas selon le sol (herbe, terre, plancher, pierre…), sabots à cheval.
    this.player.onStep = (running, hoof) => audio.step(hoof ? 'hoof' : this.surfaceAt(), running);
    audio.configure(profile.settings.sound);
    audio.setActive(true);
    this.loadPlace(profile.place);
    this.running = true;
    this.clock.getDelta();
    this.ui.onStart(this);
    // Pendant le tutoriel guidé, c'est le guide qui explique quoi faire.
    if (profile.animals.length === 0 && profile.tutorial?.done !== false) this.ui.toast(t('welcome', { name: profile.name }), 7000);
    this.emit('start', profile);
  }

  /** Événements : game.on('adopted', fn), game.emit('adopted', a). */
  on(name, fn) {
    return this.bus.on(name, fn);
  }

  emit(name, data) {
    this.bus.emit(name, data);
  }

  stop() {
    this.tasks.clear();
    this.mgmt.stop();
    this.activities.abort();
    const saved = this.save(); // avant d'annuler un trajet en cours : on ne sauvegarde pas un voyage à moitié fait
    this.tripFlow.reset();
    this.emit('stop');
    audio.setActive(false); // écran des profils : silence
    this.marker.hide();
    if (this.player?.mount) this.player.dismount();
    this.herding.stop(false);
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear();
    for (const h of this.helpers.values()) h.dispose();
    this.helpers.clear();
    this.running = false;
    this.profile = null;
    return saved;
  }

  /** Sauvegarde le profil. Renvoie false si rien n'a été écrit (pas de profil, voyage en cours, stockage plein). */
  save() {
    if (!this.profile) return false;
    // Pendant un trajet suivi, le profil est entre deux lieux (billet payé, animaux en route) :
    // on garde la sauvegarde d'avant le départ plutôt qu'un voyage à moitié fait.
    if (this.tripFlow?.journey && !this.tripFlow.journey.report) return false;
    for (const e of this.entities.values()) {
      e.data.pos = [e.position.x, e.position.z];
    }
    return saveProfile(this.profile);
  }

  get day() {
    return dayOf(this.profile.clock);
  }

  get hour() {
    return hourOf(this.profile.clock);
  }

  get season() {
    return placeSeason(this.profile?.place ?? 'maison', seasonOf(new Date()));
  }

  get isHome() {
    return this.profile.place === this.profile.home;
  }

  /** Sol sous les pieds du joueur, pour le bruit des pas : grass / dirt / wood / stone / snow / sand. */
  surfaceAt() {
    const inside = this.interiors.inside;
    if (inside) return inside === 'house' ? 'wood' : 'stone';
    const w = this.world;
    const p = this.player.position;
    if (w.snowy) return 'snow';
    if (w.waterLevel !== null && w.waterLevel !== undefined && w.heightAt(p.x, p.z) < w.waterLevel + 0.9) return 'sand';
    return (w.dirtAt?.(p.x, p.z) ?? 0) > 0.5 ? 'dirt' : 'grass';
  }

  get placeDef() {
    return PLACES[this.profile.place];
  }

  loadPlace(placeId, opts = {}) {
    this.activities.abort();
    if (this.player?.mount) this.player.dismount();
    this.herding.stop(false);
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear();
    for (const h of this.helpers.values()) h.dispose();
    this.helpers.clear();
    applyCoreLayout(this.profile.coreLayout?.[placeId]); // bergerie, paddock… déplacés ou agrandis par le joueur
    setStableExt(stableExt(ensureFacilities(this.profile))); // écurie rallongée (8, 12 ou 16 box)
    this.world.build(placeId, this.season, placeId === this.profile.home);
    this.interiors.onPlaceLoaded(); // coins de corvées, box des chevaux
    this.equipment = [];
    for (const eq of equipmentAt(this.profile, placeId)) this.spawnEquipment(eq);
    if (!opts.keepView) this.mgmt.stop();
    this.structures.rebuild(placeId); // constructions du joueur (avant les animaux : leur maison)
    // Anciennes sauvegardes : paddock, bergerie ou clapier qui attendent d'être agrandis (si la place le permet).
    if (this.structures.growPending()) this.save();
    this.droppingMeshes.clear();
    for (const d of this.profile.droppings ?? []) if (d.place === placeId) this.spawnDropping(d);
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
    // Position choisie dans la vue d'ensemble (eq.pos), sinon l'emplacement prévu.
    const { x, z } = equipmentPos(this.profile.coreLayout?.[eq.place], eq);
    mesh.position.set(x, this.world.heightAt(x, z), z);
    this.world.group.add(mesh);
    const col = { x, z, hw: 0.5, hd: 0.4, equip: true };
    this.world.colliders.push(col);
    const entry = { eq, def, mesh, col, pos: new THREE.Vector3(x, 0, z) };
    this.equipment.push(entry);
    return entry;
  }

  /** Crottin (petits tas bruns) ou flaque de pipi. */
  spawnDropping(d) {
    const g = new THREE.Group();
    if (d.kind === 'poop') {
      const big = d.species === 'horse' || d.species === 'cow' ? 1 : 0.45;
      const mat = new THREE.MeshStandardMaterial({ color: d.species === 'cow' ? 0x4a3a22 : 0x5a4126, roughness: 0.9 });
      const n = d.species === 'cow' ? 1 : 4;
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.09 * big * (d.species === 'cow' ? 2.2 : 1), 8, 6), mat);
        m.position.set((Math.random() - 0.5) * 0.18 * big, 0.05 * big, (Math.random() - 0.5) * 0.18 * big);
        m.scale.y = d.species === 'cow' ? 0.35 : 0.8;
        m.castShadow = true;
        g.add(m);
      }
    } else {
      const m = new THREE.Mesh(new THREE.CircleGeometry(0.35, 16).rotateX(-Math.PI / 2),
        new THREE.MeshStandardMaterial({ color: 0x3a3320, roughness: 0.2, transparent: true, opacity: 0.45, depthWrite: false }));
      m.position.y = 0.02;
      g.add(m);
    }
    g.position.set(d.x, this.world.heightAt(d.x, d.z), d.z);
    g.userData.dropping = d;
    this.world.group.add(g);
    this.droppingMeshes.set(d.id, g);
  }

  removeDroppingMeshes(ids) {
    for (const id of ids) {
      const m = this.droppingMeshes.get(id);
      if (!m) continue;
      m.parent?.remove(m);
      m.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
      this.droppingMeshes.delete(id);
    }
  }

  scoop(ids) {
    removeDroppings(this.profile, ids);
    this.removeDroppingMeshes(ids);
    if (ids.length) {
      addStat(this.profile, 'scoop', ids.length);
      this.xp('care', Math.min(2, ids.length));
    }
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
    // Un événement (orage, canicule, neige) peut imposer sa météo : voir Events.weatherOverride.
    const forced = this.events?.weatherOverride();
    const key = `${this.day}-${Math.floor(this.hour / 6)}${forced ? `-${forced.weather}` : ''}`;
    if (key === this.weatherKey) return;
    this.weatherKey = key;
    this.weather = forced?.weather ?? rollWeather(this.profile.place, this.season, key);
    this.weather3d.set(this.weather);
  }

  get temperature() {
    return temperature(this.profile.place, this.season, this.hour, this.weather) + (this.events?.weatherOverride()?.tempDelta ?? 0);
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
    this.clients.onTimeSkipped(); // les journées des animaux confiés sont notées (src/game/Clients.js)
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
    this.interiors.farmTick(here, hours); // propreté et usure des bâtiments
    this.structures.tick(here, hours, skipped); // confort de la maison pendant le sommeil
    for (const a of here) {
      if (a.zone === 'field') graze(a, hours, this.world.snowy);
    }
    // Quand on saute du temps (nuit, voyage…), les aides travaillent quand même.
    if (skipped) {
      for (const h of p.helpers.filter((x) => x.place === p.place)) {
        for (let i = 0; i < Math.min(12, Math.ceil(hours)); i++) {
          const task = this.helperTaskFor(h);
          if (!task) break;
          if (doHelperTask(p, task, here, h).ok) addHelperXp(h, 3);
        }
        restHelper(h, hours * 0.5); // la nuit, on se repose aussi
      }
    }
    // Pauses des aides : fin de la pause, ou pause d'office quand elles sont épuisées.
    for (const h of p.helpers.filter((x) => x.place === p.place)) {
      if (updateBreak(h, p.clock)) this.ui.toast(t('helperBack', { name: h.name, g: h.sex }), 4000);
      else if (!onBreak(h, p.clock) && (h.mood ?? 80) < 12) {
        startBreak(h, p.clock);
        this.ui.toast(t('helperTiredBreak', { name: h.name, g: h.sex }), 5000);
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
    // Pendant le trajet (écran du voyage), la ferme est en pause : TripFlow fait avancer le voyage et dessine la 3D.
    if (this.tripFlow.frame(dt)) return;
    const p = this.profile;
    // Vitesse : réglage de la durée d'une journée × boutons pause / ×1 / ×2 / ×4.
    const mps = minutesPerSecond(p.settings.timeSpeed) * this.timeScale;
    p.clock += dt * mps;
    const night = isNight(p.clock);

    const ctrl = this.input.poll();
    if (ctrl.look.dx || ctrl.look.dy || ctrl.zoom) this.ui.hideHelp?.();
    // En pause, personne ne bouge (on peut seulement tourner la vue et ouvrir les menus).
    // En ×2 / ×4, le monde est simulé en plusieurs petits pas : tout le monde va plus vite.
    const steps = this.paused ? 1 : Math.max(1, Math.round(this.timeScale));
    const wdt = this.paused ? 0 : dt;
    if (this.paused) ctrl.move = { x: 0, y: 0 };
    // Vue d'ensemble : le joueur ne bouge pas, la caméra est au-dessus de la ferme.
    const mgmt = this.mgmt.active;
    const pctrl = mgmt ? { ...ctrl, move: { x: 0, y: 0 }, run: false } : ctrl;
    const entities = [...this.entities.values()];
    const ctx = { playerPos: this.player.position, night, entities, game: this };
    for (let i = 0; i < steps; i++) {
      this.player.update(mgmt ? 0 : wdt, pctrl, this.rig.yaw, this.rig.mode === 'first');
      for (const e of entities) e.update(wdt, ctx);
      for (const h of this.helpers.values()) h.update(wdt, this);
      this.herding.update(wdt);
      this.tasks?.update();
      this.activities.update(wdt); // après les animaux : l'activité ajuste leur pose (sauts, tours)
    }
    if (mgmt) this.mgmt.update(dt, ctrl);
    else {
      this.rig.update(dt, ctrl, this.player, this.world);
      this.fadeOccluders();
    }
    this.ui.updateLabels(entities, this.camera, this.player.position);
    this.updateLeashes(entities);
    this.interiors.update(dt);
    for (const q of this.equipment) {
      if (q.mesh.userData.spin) q.mesh.userData.spin.rotation.y += dt * 2;
    }

    const { day } = this.world.updateSky(this.hour, this.weather, this.mgmt.active ? this.mgmt.focus : this.player.position);
    this.dayLight = day; // 0 la nuit, 1 le jour (ambiance sonore)
    if (this.mgmt.active) this.mgmt.liftFog(); // vue d'en haut : le brouillard commence plus loin
    this.world.updateClouds(dt);
    this.player.torch.intensity = (1 - day) * 6;
    const flash = this.weather3d.update(dt, this.camera.position);
    if (flash) this.world.hemi.intensity += flash * 3;
    // Le tonnerre suit l'éclair, un peu après.
    if (flash > (this.lastFlash ?? 0) + 0.4) audio.thunder(0.3 + Math.random() * 1.2);
    this.lastFlash = flash;

    // Simulation des besoins 2 fois par seconde.
    this.simAcc += dt;
    if (this.simAcc >= 0.5) {
      const hours = (this.simAcc * mps) / 60;
      this.simAcc = 0;
      this.updateWeather();
      // Nappe sonore : oiseaux le jour, grillons la nuit, vent, pluie ; assourdie dans un bâtiment.
      audio.ambience({ weather: this.weather, night: (this.dayLight ?? 1) < 0.35, biome: this.placeDef.biome, indoors: !!this.interiors.inside });
      const weather = this.simWeather();
      // En pause, rien ne change (on peut quand même se promener).
      const here = hours > 0 ? this.animalsHere() : [];
      if (hours > 0) this.farmTick(here, hours);
      if (hours > 0) this.checkBirths();
      this.removeDroppingMeshes(dryPuddles(this.profile, this.profile.clock));
      for (const a of here) {
        const e = this.entities.get(a.id);
        const before = mood(a);
        if (e) {
          const kind = digest(a, hours);
          if (kind && e.inside) {
            // Dans la maison des animaux : ça salit les paniers (à nettoyer).
            this.profile.petHouse = { ...(this.profile.petHouse ?? {}), dirt: Math.min(9, (this.profile.petHouse?.dirt ?? 0) + (kind === 'poop' ? 1 : 0.5)) };
          } else if (kind) {
            const back = 0.5 * (a.look.bodyLen * e.scale);
            const d = addDropping(this.profile, this.profile.place, e.position.x - Math.sin(e.heading) * back, e.position.z - Math.cos(e.heading) * back, kind, this.profile.clock, a.species);
            this.spawnDropping(d);
            this.removeDroppingMeshes(d.removed);
            delete d.removed;
            if (kind === 'poop' && a.species === 'dog' && a.following) this.ui.toast(t('dogPoop', { name: a.name, g: a.sex }), 4000);
          }
        }
        // + la saleté de son box / de la maison (src/game/Interiors.js)
        const dirt = e?.inside ? Math.floor(this.profile.petHouse?.dirt ?? 0)
          : (e ? dirtNear(this.profile, this.profile.place, e.position.x, e.position.z) : 0) + this.interiors.dirtFor(a);
        const events = tickAnimal(a, hours, {
          dirt,
          weather: e?.inside ? 'clear' : this.interiors.feltWeather(a, feltWeather(a, weather, this.temperature, this.season)), sleeping: e?.sleeping, ridden: e?.ridden, moving: e && e.speed > 0.3, ...this.socialCtx(a, here),
        });
        tickProduce(a, hours);
        // Chaque promenade fait progresser le chien (obéissance et « Au pied »).
        if (a.species === 'dog' && a.following && e && e.speed > 0.5) {
          a.skills.obedience = Math.min(100, a.skills.obedience + 1.2 * hours * (a.leashed ? 1 : 0.5));
          a.tricks.heel = Math.min(100, (a.tricks.heel ?? 0) + 2.5 * hours * (a.leashed ? 1 : 0.4));
        }
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
        this.xp(o.kind === 'quest' ? 'quest' : 'achievement');
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

    if (this.tapRing.visible) {
      this.tapRing.scale.setScalar(1 + Math.sin(performance.now() / 150) * 0.12);
      if (!this.player.auto) this.tapRing.visible = false;
    }
    this.marker.update(dt);
    this.updateFocus();
    this.events.update(dt); // événements spéciaux
    this.clients.update(dt); // clients et métiers
    this.renderer.render(this.scene, this.camera);
  }

  /** Les murs et toits qui cachent le personnage deviennent transparents. */
  fadeOccluders() {
    if (this.rig.mode !== 'third') {
      // 1re personne : on rend aux murs leur aspect normal.
      for (const o of this.faded ?? []) {
        o.material = o.userData.solidMat;
        o.castShadow = true;
      }
      this.faded?.clear();
      return;
    }
    if (this.occluderGroup !== this.world.group) {
      // Liste des objets qui peuvent cacher la vue (bâtiments), calculée une fois par lieu.
      this.occluderGroup = this.world.group;
      this.occluders = [];
      this.world.group.traverse((o) => {
        if (!o.isMesh || o.isInstancedMesh || o.userData.noOccluder || o.geometry.type === 'PlaneGeometry') return;
        if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
        if (o.geometry.boundingSphere.radius * Math.max(o.scale.x, o.scale.y, o.scale.z) > 0.8) this.occluders.push(o);
      });
      this.faded = new Set();
    }
    const head = this.player.position.clone();
    head.y += this.player.eyeHeight * 0.8;
    const dir = head.clone().sub(this.camera.position);
    const len = dir.length();
    this.raycaster.set(this.camera.position, dir.normalize());
    this.raycaster.far = len - 0.3;
    const hits = new Set(this.raycaster.intersectObjects(this.occluders, false).map((h) => h.object));
    this.raycaster.far = Infinity;
    for (const o of hits) {
      if (this.faded.has(o)) continue;
      if (!o.userData.fadeMat) {
        o.userData.solidMat = o.material;
        o.userData.fadeMat = o.material.clone();
        o.userData.fadeMat.transparent = true;
        o.userData.fadeMat.opacity = 0.18;
        o.userData.fadeMat.depthWrite = false;
      }
      o.material = o.userData.fadeMat;
      o.castShadow = false;
      this.faded.add(o);
    }
    for (const o of this.faded) {
      if (hits.has(o)) continue;
      o.material = o.userData.solidMat;
      o.castShadow = true;
      this.faded.delete(o);
    }
  }

  // ---------------------------------------------------------------- toucher l'écran

  /** Toucher le sol : on y va. Toucher un animal ou un bâtiment : on y va puis on choisit quoi faire. */
  onTap(sx, sy) {
    if (!this.running || this.ui.isBlocking()) return;
    if (this.mgmt.active) {
      this.mgmt.onTap(sx, sy);
      return;
    }
    if (this.activities.onTap(sx, sy)) return;
    const paused = this.paused;
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.tripFlow.onTap(this.raycaster)) return; // chargement du véhicule de voyage
    // Une aide : on va la voir et on discute (src/ui/helperChat.js).
    const hitH = this.raycaster.intersectObjects([...this.helpers.values()].map((x) => x.root), true)[0];
    if (hitH) {
      const helper = [...this.helpers.values()].find((x) => { let o = hitH.object; while (o && o !== x.root) o = o.parent; return !!o; });
      if (helper) {
        if (paused) this.ui.openHelper(helper.data);
        else this.walkTo(helper.position, 1.8, () => this.ui.openHelper(helper.data), true);
        return;
      }
    }
    if (this.clients.onTap(this.raycaster)) return; // un visiteur (client) : on va lui parler
    const roots = [...this.entities.values()].filter((e) => !e.ridden && !e.inside).map((e) => e.root);
    const hitA = this.raycaster.intersectObjects(roots, true).find((h) => !h.object.isSprite || h.object === h.object.parent?.userData?.entity?.label);
    if (hitA) {
      let o = hitA.object;
      while (o && !o.userData.entity) o = o.parent;
      const e = o?.userData.entity;
      if (e) {
        if (paused) this.ui.openAnimalActions(e.data);
        else this.walkTo(e.position, e.radius + 1.2, () => this.ui.openAnimalActions(e.data), true);
        return;
      }
    }
    const poops = [...this.droppingMeshes.values()].filter((m) => m.userData.dropping.kind === 'poop');
    const hitP = this.raycaster.intersectObjects(poops, true)[0];
    if (hitP && !this.player.mount) {
      let o = hitP.object;
      while (o && !o.userData.dropping) o = o.parent;
      if (o) {
        const id = o.userData.dropping.id;
        this.walkTo(o.position.clone(), 1, () => {
          this.scoop([id]);
          this.ui.toast(t('scooped'));
        });
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
    if (this.interiors.onTap(hit)) return; // dans l'écurie ou la maison
    // Une construction du joueur : on va devant son entrée, puis on choisit quoi faire.
    const built = this.structures.pick(this.raycaster, hit.point);
    if (built) {
      const door = doorOf(built);
      this.walkTo(new THREE.Vector3(door.x, 0, door.z), 1.2, () => openStructure(this.ui, built));
      return;
    }
    const kind = this.world.kindAt(hit.point.x, hit.point.z);
    if (paused) {
      if (kind) this.ui.openBuilding(kind);
      else this.ui.toast(t('pausedNoMove'));
      return;
    }
    // Un enclos : on va à l'endroit touché (en passant par la porte), puis on choisit quoi faire.
    if (['paddock', 'pen', 'hutch'].includes(kind)) {
      this.walkTo(hit.point, 0.8, () => this.ui.openBuilding(kind));
      return;
    }
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
    this.tapRing.position.set(target.x, this.world.heightAt(target.x, target.z) + 0.05, target.z);
    this.tapRing.visible = !follow;
    // Si on vise un animal qui bouge, on vise sa position actuelle.
    this.player.goTo(follow ? target.clone() : target, radius, onArrive);
  }

  buildingContext() {
    const here = this.animalsHere();
    const sp = (a) => SPECIES[a.species];
    return {
      hour: this.hour,
      season: this.season,
      home: this.isHome,
      count: {
        horse: here.filter((a) => a.species === 'horse').length,
        livestock: here.filter((a) => sp(a).livestock).length,
        pets: here.filter((a) => ['dog', 'cat', 'rabbit'].includes(a.species)).length,
        dog: here.filter((a) => a.species === 'dog').length,
        rabbit: here.filter((a) => a.species === 'rabbit').length,
        sick: here.filter((a) => a.sick).length,
        milkable: here.filter((a) => a.produceReady && sp(a).product?.action === 'milk').length,
        shearable: here.filter((a) => a.produceReady && sp(a).product?.action === 'shear').length,
        paddockDroppings: this.zoneDroppings('paddock'),
        // Maison des animaux et sellerie
        petsOut: here.filter((a) => PET_HOUSED.includes(a.species) && !a.housed).length,
        housed: here.filter((a) => a.housed).length,
        petHouseDirt: Math.floor(this.profile.petHouse?.dirt ?? 0),
        tackDirty: this.day - (this.profile.tackCleanedDay ?? -99) >= 2 ? 1 : 0,
        penDroppings: this.zoneDroppings('pen'),
      },
    };
  }

  zoneDroppings(id) {
    const z = enclosure(id);
    return (this.profile.droppings ?? []).filter((d) => d.place === this.profile.place && d.kind === 'poop'
      && Math.abs(d.x - z.x) < z.hw + 1 && Math.abs(d.z - z.z) < z.hd + 1).length;
  }

  /** Curer : ramasse tous les crottins d'un enclos. */
  cleanZone(id) {
    const ids = scoopZone(this.profile, this.profile.place, enclosure(id));
    this.removeDroppingMeshes(ids);
    this.interiors.zoneCleaned(id);
    if (ids.length) {
      addStat(this.profile, 'scoop', ids.length);
      this.xp('care', Math.min(3, ids.length));
    }
    return ids.length;
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
    const reasons = new Set();
    const group = this.animalsHere().filter(filter).filter((a) => SPECIES[a.species].actions.includes(action));
    for (const a of group) {
      if (!canAfford(this.profile, CARE[action].cost)) {
        reasons.add('money');
        break;
      }
      const before = { ...a.needs };
      const res = applyCare(a, action, quality);
      if (res.ok) {
        if (n === 0) this.ui.showDeltas(a, before);
        spend(this.profile, CARE[action].cost);
        addStat(this.profile, action);
        this.entities.get(a.id)?.emit(CARE_EMOJI[action] ?? '❤️', 2);
        n++;
      } else reasons.add(res.reason);
    }
    if (n) {
      this.xp('care', Math.min(n, 3));
      this.ui.toast(t('doneAll', { n }));
    } else if (!group.length) this.ui.toast(t('nobody'));
    else if (reasons.has('money')) this.ui.toast(t('r_money'));
    else if (reasons.has('full')) this.ui.toast(t(`allFull_${CARE[action].full ?? 'x'}`));
    else this.ui.toast(t(`r_${[...reasons][0]}`, { name: group[0].name, g: group[0].sex }));
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
    // Au box : chaque cheval rentre dans son box de l'écurie.
    if (where === 'box') return this.interiors.stallAll();
    const target = where === 'field' ? FIELD : enclosure('paddock'); // (le paddock peut être déplacé)
    let n = 0;
    for (const e of this.entities.values()) {
      if (e.data.species !== 'horse' || e.ridden) continue;
      e.data.following = false;
      e.data.stalled = false; // il sort de son box
      e.data.zone = where === 'field' ? 'field' : undefined;
      e.state = 'walk';
      e.target.set(target.x + (Math.random() - 0.5) * 6, 0, target.z + (Math.random() - 0.5) * 6);
      e.timer = 30;
      n++;
    }
    this.ui.toast(n ? t(where === 'field' ? 'horsesOut' : 'storedHorses') : t('nobody'));
  }

  /** Chiens, chats et lapins vont dormir dans la maison des animaux (in = true) ou en sortent. */
  housePets(inside = true) {
    if (inside && !this.world.petHouse) return this.ui.toast(t('noPetHouse'));
    let n = 0;
    for (const e of this.entities.values()) {
      const a = e.data;
      if (!PET_HOUSED.includes(a.species) || !!a.housed === inside) continue;
      if (inside && a.following) {
        a.following = false;
        a.leashed = false;
      }
      a.housed = inside;
      if (!inside) e.leaveHouse();
      n++;
    }
    this.ui.toast(n ? t(inside ? 'petsHoused' : 'petsOutside', { n }) : t('nobody'));
    if (n) this.xp('care');
    return n;
  }

  /** Nettoyer les paniers et les coins de la maison des animaux. */
  cleanPetHouse() {
    const p = this.profile;
    const n = Math.floor(p.petHouse?.dirt ?? 0);
    p.petHouse = { ...(p.petHouse ?? {}), dirt: 0 };
    if (n) {
      addStat(p, 'scoop', n);
      this.xp('care', Math.min(3, n));
    }
    this.ui.toast(n ? t('petHouseCleaned', { n }) : t('why_alreadyClean'));
  }

  /** Entretenir le cuir (selles, filets, licols) : nettoyer puis graisser. */
  cleanTack() {
    this.profile.tackCleanedDay = this.day;
    addStat(this.profile, 'tackClean');
    this.xp('care', 2);
    this.ui.toast(t('tackCleaned'));
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
  setTimeScale(x) {
    const was = this.timeScale;
    this.timeScale = x;
    if (x === 0) this.player.cancelGoTo();
    this.ui.refresh();
    if (x > 1 && was !== x) this.emit('timeFast', x); // tutoriel : « ⏩ fait avancer le temps »
  }

  get paused() {
    return this.timeScale === 0;
  }

  /** Les actions sont bloquées pendant la pause. Renvoie vrai si c'est bloqué. */
  blockedByPause() {
    if (!this.paused) return false;
    this.ui.toast(t('pausedNoAction'));
    return true;
  }

  /** Avance jusqu'à une heure précise (aujourd'hui ou demain). Les aides travaillent pendant ce temps. */
  skipTo(hour) {
    const now = this.hour;
    let hours = hour - now;
    if (hours <= 0.05) hours += 24;
    let done = 0;
    while (done < hours) {
      const step = Math.min(0.5, hours - done);
      this.advanceTime(step);
      done += step;
    }
    this.ui.toast(t('skippedTo', { h: `${hour} h` }), 3500);
    this.ui.refresh();
    return done;
  }

  skipAhead(force = false) {
    const now = this.needsAttention();
    if (now.length && !force) {
      const { a, what } = now[0];
      this.ui.toast(t('skipBusy', { name: a.name, g: a.sex, what: t(`attn_${what}`, { g: a.sex }) }), 5000);
      this.emit('skip', 0);
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
    this.emit('skip', hours);
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

  /**
   * Mode Auto : les tâches simples les plus urgentes (nourrir, abreuver, brosser,
   * nettoyer, câliner, ramasser les crottins). keys : tâches déjà prévues, à ne pas doubler.
   */
  planAutoTasks(max, keys = new Set()) {
    if (max <= 0) return [];
    const ICON = { feed: '🍖', water: '💧', brush: '🪮', clean: '🧹', pet: '🤚', play: '⚽' };
    const NEED_ACTION = { hunger: 'feed', thirst: 'water', grooming: 'brush', hygiene: 'clean', affection: 'pet', exercise: 'play' };
    const out = [];
    for (const a of this.animalsHere()) {
      const e = this.entities.get(a.id);
      if (!e || e.ridden) continue;
      for (const [need, action] of Object.entries(NEED_ACTION)) {
        if (a.needs[need] >= 55) continue;
        if (!SPECIES[a.species].actions.includes(action) || !this.canCare(a, action).ok) continue;
        if (e.sleeping && !['feed', 'water', 'pet'].includes(action)) continue;
        const key = `${a.id}:${action}`;
        if (keys.has(key)) continue;
        out.push({
          key,
          urgency: a.needs[need],
          label: `${action === 'clean' ? t(`act_${a.species}_clean`) : t(`act_${action}`)} · ${a.name}`,
          icon: ICON[action],
          target: () => this.entities.get(a.id)?.position ?? null,
          radius: 1.8,
          auto: () => this.autoCare(a, action),
          manual: () => this.ui.careWithGame(a, action),
        });
      }
    }
    for (const d of (this.profile.droppings ?? []).filter((x) => x.place === this.profile.place && x.kind === 'poop').slice(0, 3)) {
      const key = `poop:${d.id}`;
      if (keys.has(key)) continue;
      out.push({
        key,
        urgency: 50,
        label: t('autoScoop'),
        icon: '💩',
        target: () => this.droppingMeshes.get(d.id)?.position ?? null,
        radius: 1,
        auto: () => this.scoop([d.id]),
        manual: () => this.scoop([d.id]),
      });
    }
    return out.sort((x, y) => x.urgency - y.urgency).slice(0, max);
  }

  /** Endroit où aller pour un bâtiment ou un enclos (sa porte). */
  buildingSpot(kind) {
    const it = this.world.interactables.find((i) => i.kind === kind);
    return it ? new THREE.Vector3(it.x, 0, it.z) : null;
  }

  /** Soin fait automatiquement (liste de tâches) : un peu moins bien qu'à la main. */
  autoCare(a, action) {
    const check = this.canCare(a, action);
    if (!check.ok) return this.ui.toast(t(check.reason === 'money' ? 'r_money' : `r_${check.reason}`, { name: a.name, g: a.sex }));
    return this.care(a, action, 0.75);
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

  /** Diriger le troupeau soi-même, à pied ou à cheval : les animaux s'écartent devant le joueur. */
  leadFlock(dest) {
    const me = { isPlayer: true, position: this.player.position, data: { name: this.profile.name } };
    if (!this.herding.start(dest, me)) return this.ui.toast(t('noFlock'));
    this.ui.toast(t(this.player.mount ? 'leadFlockRiding' : 'leadFlockFoot'), 6000);
    return true;
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
      best = this.tripFlow.focusNear(pp) ?? this.clients.focusNear(pp); // véhicule de voyage, ou visiteur (client)
      let bestD = best ? -1 : Infinity;
      for (const e of this.entities.values()) {
        if (e.inside) continue; // rangé dans la maison des animaux
        const d = Math.hypot(e.position.x - pp.x, e.position.z - pp.z) - e.radius;
        if (d < 1.6 && d < bestD) {
          bestD = d;
          best = { kind: 'animal', entity: e };
        }
      }
      for (const hp of this.helpers.values()) {
        const d = Math.hypot(hp.position.x - pp.x, hp.position.z - pp.z) - 0.4;
        if (d < 1.4 && d < bestD) {
          bestD = d;
          best = { kind: 'helper', helper: hp, id: hp.data.id };
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
    const key = best ? `${best.kind}-${best.entity?.data.id ?? best.id ?? best.key ?? ''}` : '';
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
    if (this.activities.onInteract()) return;
    const f = this.focus;
    if (!f) return;
    switch (f.kind) {
      case 'animal': this.ui.openAnimalActions(f.entity.data); break;
      case 'helper': this.ui.openHelper(f.helper.data); break;
      case 'refuge':
      case 'petshop':
      case 'tackroom':
      case 'pethouse':
      case 'vet':
      case 'house':
      case 'lodge':
      case 'jobs':
      case 'stable':
      case 'paddock':
      case 'kennel':
      case 'hutch':
      case 'showground':
      case 'pen': this.ui.openBuilding(f.kind); break;
      case 'dismount': this.dismount(); break;
      case 'spot': f.run(); break; // un coin de l'écurie ou de la maison
      case 'vehicle': this.tripFlow.interact(); break;
      case 'client': this.clients.talk(); break; // parler au visiteur (src/game/Clients.js)
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
    const tool = missingTool(this.profile, action);
    if (tool) return { ok: false, reason: 'needTool', tool };
    if (!canAfford(this.profile, care.cost)) return { ok: false, reason: 'money' };
    if (care.full && a.needs[care.full] >= 96) return { ok: false, reason: 'full' };
    if (care.tiring && a.needs.energy < 15) return { ok: false, reason: 'tired' };
    if (care.tiring && a.sick) return { ok: false, reason: 'sick' };
    return { ok: true };
  }

  care(a, action, quality = 1) {
    const care = CARE[action];
    const tool = missingTool(this.profile, action);
    if (tool) return this.ui.toast(t('r_needTool', { tool: `${TOOLS[tool].emoji} ${t(`tool_${tool}`)}` }), 5000);
    if (!canAfford(this.profile, care.cost)) return this.ui.toast(t('r_money'));
    const before = { ...a.needs };
    const res = applyCare(a, action, quality);
    if (res.ok) this.ui.showDeltas(a, before);
    if (!res.ok) return this.ui.toast(t(`r_${res.reason}`, { name: a.name, g: a.sex }));
    spend(this.profile, care.cost);
    addStat(this.profile, action);
    this.xp('care');
    this.entities.get(a.id)?.emit(CARE_EMOJI[action] ?? '❤️');
    this.ui.refresh();
    this.emit('care', { a, action });
    return res;
  }

  trick(a, trickId) {
    if (a.client) return this.ui.toast(t('cl_notYours', { name: a.name, g: a.sex })); // animal confié (src/sim/clients.js)
    const r = trainTrick(a, trickId);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex, n: r.need }));
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

  buyTool(tool) {
    const r = buyTool(this.profile, tool);
    if (!r.ok) return this.ui.toast(t(r.reason === 'money' ? 'r_money' : 'alreadyOwned'));
    this.ui.toast(t('gearBought', { name: t(`tool_${tool}`) }));
    return r;
  }

  train(a, trainingId) {
    if (a.client) return this.ui.toast(t('cl_notYours', { name: a.name, g: a.sex })); // animal confié
    const tool = missingTool(this.profile, trainingId);
    if (tool) return this.ui.toast(t('r_needTool', { tool: `${TOOLS[tool].emoji} ${t(`tool_${tool}`)}` }), 5000);
    const r = trainSkill(a, trainingId);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex, n: r.need }));
    addStat(this.profile, 'trainings');
    this.entities.get(a.id)?.emit('💪', 2);
    this.ui.toast(t('skillGain', { name: a.name, g: a.sex, skill: t(`skill_${r.skill}`), n: r.gain }));
    this.ui.refresh();
    return r;
  }

  ride(a, bareback = false) {
    const r = canRide(a);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex }));
    const gear = rideGear(a, bareback);
    if (!gear.ok) return this.ui.toast(t('r_needBridle', { name: a.name, g: a.sex }), 5000);
    this.bareback = gear.bareback;
    this.player.bareback = gear.bareback;
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

  /** Laisses : un trait entre la main du joueur et le collier ; le chien qui tire entraîne le joueur. */
  updateLeashes(entities) {
    this.leashLines = this.leashLines ?? new Map();
    let pull = null;
    const seen = new Set();
    for (const e of entities) {
      if (!(e.data.following && e.data.leashed && canLeash(e.data))) continue;
      seen.add(e.data.id);
      let line = this.leashLines.get(e.data.id);
      if (!line) {
        const geo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 10 }, () => new THREE.Vector3()));
        line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: 0xc0392b }));
        line.frustumCulled = false;
        this.scene.add(line);
        this.leashLines.set(e.data.id, line);
      }
      const pl = this.player.position;
      const h = this.player.heading;
      const hand = new THREE.Vector3(pl.x + Math.cos(h) * 0.3, pl.y + 0.85, pl.z - Math.sin(h) * 0.3);
      const neck = e.position.clone();
      neck.y += (e.model.y0 + e.data.look.bodyR) * e.scale;
      const dist = hand.distanceTo(neck);
      const slack = Math.max(0, 2.8 - dist) * 0.35;
      const pos = line.geometry.attributes.position;
      for (let i = 0; i < 10; i++) {
        const tt = i / 9;
        pos.setXYZ(i, hand.x + (neck.x - hand.x) * tt, hand.y + (neck.y - hand.y) * tt - Math.sin(tt * Math.PI) * slack, hand.z + (neck.z - hand.z) * tt);
      }
      pos.needsUpdate = true;
      if (e.leashPull > 0) pull = { x: e.leashDir.x * e.leashPull, z: e.leashDir.z * e.leashPull };
    }
    for (const [id, line] of this.leashLines) {
      if (!seen.has(id)) {
        this.scene.remove(line);
        line.geometry.dispose();
        line.material.dispose();
        this.leashLines.delete(id);
      }
    }
    this.player.pull = pull;
  }

  /** Promener un chien en laisse (collier + laisse). */
  toggleLeash(a) {
    if (!a.following || !a.leashed) {
      if (!canLeash(a)) return this.ui.toast(t('r_needLeash', { name: a.name, g: a.sex }), 5000);
      a.following = true;
      a.leashed = true;
      this.ui.toast(t('leashOn', { name: a.name, g: a.sex }));
    } else {
      a.following = false;
      a.leashed = false;
      this.ui.toast(t('leashOff', { name: a.name, g: a.sex }));
    }
  }

  toggleFollow(a) {
    a.leashed = false;
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

  adopt(candidate, name, price = adoptionPrice(candidate), from = 'refuge') {
    if (!spend(this.profile, price)) return this.ui.toast(t('r_money'));
    const a = { ...candidate, name: name?.trim() || candidate.name, location: this.profile.place };
    if (candidate.adoptKey) this.profile.adoptedKeys.push(candidate.adoptKey);
    delete a.adoptKey;
    this.profile.animals.push(a);
    addStat(this.profile, 'adopted');
    this.xp('adopt');
    // Le premier cheval reçoit tout de suite le filet et la selle offerts.
    if (a.species === 'dog') {
      equip(this.profile, a, 'collar', 'red');
      equip(this.profile, a, 'leash');
    }
    if (a.species === 'horse') {
      equip(this.profile, a, 'halter', 'red');
      equip(this.profile, a, 'bridle');
      equip(this.profile, a, 'saddle');
    }
    const door = this.world.interactables.find((i) => i.kind === from) ?? this.world.interactables.find((i) => i.kind === 'refuge');
    const e = this.spawnEntity(a, door);
    e.emit('❤️', 5);
    this.ui.toast(t('adopted', { name: a.name, g: a.sex }));
    this.save();
    this.emit('adopted', a);
    return a;
  }

  /** Acheter un animal choisi à l'animalerie (ou à l'élevage en voyage). */
  buyAnimal(cfg, name) {
    const price = shopPrice(cfg.species, cfg.breed, cfg.stage);
    const a = createAnimal({
      species: cfg.species, breed: cfg.breed, colorIndex: cfg.colorIndex, sex: cfg.sex,
      ageDays: stageAgeDays(cfg.species, cfg.stage), name: name?.trim() || undefined, location: this.profile.place, day: this.day,
    });
    return this.adopt(a, name, price, this.isHome ? 'petshop' : 'refuge');
  }

  breedingPartners(a) {
    if (a.client) return []; // animal confié : pas de bébés
    return this.animalsHere().filter((b) => b.id !== a.id && !b.client && b.species === a.species && b.sex !== a.sex);
  }

  canBreed(a, b) {
    return canBreed(a, b, this.day, this.level);
  }

  breedingChecklist(a, b) {
    return breedingChecklist(a, b, { day: this.day, level: this.level });
  }

  /** Les deux animaux se rencontrent ; les petits naîtront à la fin de la gestation. */
  breed(a, b) {
    const r = canBreed(a, b, this.day, this.level);
    if (!r.ok) return this.ui.toast(t('breedNotReady'));
    const mother = mate(a, b, this.day);
    this.entities.get(a.id)?.emit('💕', 3);
    this.entities.get(b.id)?.emit('💕', 3);
    this.ui.toast(t('pregnant', { name: mother.name, n: mother.pregnant.due - this.day }), 6000);
    this.save();
    return mother;
  }

  /** Naissances quand la gestation est terminée. */
  checkBirths() {
    for (const mother of [...this.profile.animals]) {
      if (!mother.pregnant || this.day < mother.pregnant.due) continue;
      const father = this.profile.animals.find((x) => x.id === mother.pregnant.father) ?? mother;
      const babies = breed(mother, father, this.day);
      for (const baby of babies) {
        baby.location = mother.location;
        this.profile.animals.push(baby);
        if (mother.location === this.profile.place) this.spawnEntity(baby, this.entities.get(mother.id)?.position).emit('🍼', 3);
      }
      addStat(this.profile, 'births', babies.length);
      this.xp('birth');
      this.ui.alert(t('born', { n: babies.length, names: babies.map((x) => x.name).join(', ') }));
      this.save();
    }
  }

  /** Soins faits soi-même avec la trousse (sans vétérinaire, gratuit). */
  selfCare(a) {
    const wasSick = !!a.sick;
    if (wasSick) cure(a, this.day);
    else checkup(a, this.day);
    addStat(this.profile, 'vet');
    this.xp('vet');
    this.entities.get(a.id)?.emit('💚', 4);
    this.ui.refresh();
  }

  vetCost(atClinic) {
    return atClinic ? VET_COST.clinic : VET_COST.home;
  }

  vetDone(a, atClinic) {
    spend(this.profile, this.vetCost(atClinic));
    const wasSick = !!a.sick;
    if (wasSick) cure(a, this.day);
    else checkup(a, this.day);
    addStat(this.profile, 'vet');
    this.xp('vet');
    this.entities.get(a.id)?.emit('💚', 4);
    this.ui.toast(t(wasSick ? 'vetCured' : 'vetCheckupDone', { name: a.name, g: a.sex }));
    this.ui.refresh();
  }

  sleep() {
    const h = this.hour;
    if (h >= 7 && h < 19) return this.ui.toast(t('why_notTired', { h: '19 h' })); // on dort de 19 h à 7 h
    const hours = h < 7 ? 7 - h : 31 - h;
    this.advanceTime(hours, { sleeping: true });
    for (const a of this.animalsHere()) a.needs.energy = Math.max(a.needs.energy, 90);
    this.ui.toast(t('sleepDone'), 4000);
    this.save();
  }

  doJob(job) {
    this.advanceTime(job.hours);
    earn(this.profile, job.pay);
    audio.ui('coin');
    addStat(this.profile, 'jobs');
    this.ui.toast(t('jobDone', { n: job.pay }));
  }

  // ---------------------------------------------------------------- ferme

  wantedEquipment(a) {
    if (a.stalled && this.interiors.stallOf(a)) return null; // au box, on ne va pas au paddock boire
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
    if (task.droppingId) {
      const m = this.droppingMeshes.get(task.droppingId);
      return m ? m.position : null;
    }
    if (task.animalId) {
      const e = this.entities.get(task.animalId);
      return e ? e.position : null;
    }
    if (task.equipmentId) return this.equipment.find((q) => q.eq.id === task.equipmentId)?.pos ?? null;
    return null;
  }

  helperDone(helper, task) {
    if (!task) return;
    const r = doHelperTask(this.profile, task, this.animalsHere(), helper.data);
    if (!r.ok) return;
    // L'aide gagne de l'expérience (et se fatigue un peu).
    tireHelper(helper.data);
    const up = addHelperXp(helper.data, 5);
    if (up.levelUp) {
      helper.refreshTag();
      this.ui.toast(t('helperLevelUp', { name: helper.data.name, g: helper.data.sex, n: up.level }), 5000);
    }
    if (r.scooped) {
      this.removeDroppingMeshes([r.scooped]);
      return;
    }
    const e = task.animalId && this.entities.get(task.animalId);
    if (e) e.emit(task.kind === 'cure' ? '💚' : task.kind === 'product' ? '🪣' : '❤️', 2);
    if (task.kind === 'product') this.ui.toast(t(`collected_${r.product}`, { name: helper.data.name, g: helper.data.sex, n: r.earned }));
  }

  collect(a) {
    const r = collectProduct(this.profile, a);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name, g: a.sex }));
    this.entities.get(a.id)?.emit(r.product === 'wool' ? '🧶' : '🥛', 3);
    audio.ui('coin');
    this.xp('collect');
    this.ui.toast(t(`got_${r.product}`, { name: a.name, g: a.sex, n: r.earned }));
    this.ui.refresh();
    return r;
  }

  /** Qui peut conduire le troupeau ici : un chien de troupeau, sinon le berger. */
  herder() {
    const dogs = [...this.entities.values()].filter((e) => e.data.role === 'herder' && !e.ridden);
    const dog = dogs.find((e) => !e.data.housed) ?? dogs[0]; // de préférence un chien qui n'est pas rangé pour la nuit
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
    const flock = [...this.entities.values()].filter((e) => e.sp.livestock && !e.customHome);
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

  /**
   * Change de lieu. opts.trip : voyage réaliste déjà fait par TripFlow (sim/trip.js) :
   * le coût, le temps qui passe et les besoins pendant le trajet ont déjà été comptés.
   */
  travel(destId, mode, travelerIds, opts = {}) {
    const p = this.profile;
    const done = !!opts.trip;
    const travelers = this.animalsHere().filter((a) => travelerIds.includes(a.id));
    const horse = travelers.find((a) => a.species === 'horse' && canRide(a).ok);
    const check = checkTravel(p.place, destId, mode, travelers, done || !!horse);
    if (!check.ok) return this.ui.toast(t(`tr_${check.reason}`));
    if (!done && !spend(p, check.cost)) return this.ui.toast(t('r_money'));

    // Pendant le voyage on fait des pauses : les besoins baissent moins vite.
    const hours = check.hours;
    if (!done) p.clock += hours * 60;
    for (const a of travelers) {
      const events = done ? [] : tickAnimal(a, hours * 0.25, { moving: true, ridden: mode === 'horse' && a === horse });
      if (!done) a.ageDays += (hours * 0.75) / 24;
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
      isHome: this.isHome,
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

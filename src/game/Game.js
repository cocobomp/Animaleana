// Boucle de jeu : relie la simulation (src/sim), la 3D et l'interface.

import * as THREE from 'three';
import { World } from './World.js';
import { gfx } from './gfx.js';
import { Weather3D } from './Weather3D.js';
import { Player, CameraRig } from './Player.js';
import { AnimalEntity } from './AnimalEntity.js';
import { Input } from './Input.js';
import { SPECIES } from '../sim/species.js';
import {
  tickAnimal, applyCare, CARE, trainTrick, trainSkill, canRide, canBreed, breed, cure, checkup, mood, ageYears,
} from '../sim/animal.js';
import { GAME_MINUTES_PER_REAL_SECOND, dayOf, hourOf, isNight, seasonOf } from '../sim/time.js';
import { PLACES, rollWeather, temperature, checkTravel, TRAVEL_MODES } from '../sim/places.js';
import { adoptionPrice } from '../sim/adoption.js';
import { checkObjectives } from '../sim/objectives.js';
import { saveProfile, spend, earn, canAfford, addStat } from '../sim/profile.js';
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
    gfx.quality = this.quality;
    const renderer = new THREE.WebGLRenderer({ antialias: this.quality === 'high', powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality === 'high' ? 2 : 1.25));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = this.quality === 'high';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Tons filmiques : les hautes lumières (ciel, soleil) restent douces.
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.9;
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
    this.entities = new Map();
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
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear();
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
    for (const e of this.entities.values()) e.dispose();
    this.entities.clear();
    this.world.build(placeId, this.season);
    this.weatherKey = null;
    this.updateWeather();
    this.player.spawn(0, -6);
    this.rig.yaw = Math.PI;
    this.rig.reset();
    for (const a of this.profile.animals) {
      if (a.location === placeId) this.spawnEntity(a);
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
    for (const a of this.animalsHere()) {
      const events = tickAnimal(a, hours * decayFactor, { ...ctx, weather: this.simWeather() });
      a.ageDays += (hours * (1 - decayFactor)) / 24;
      this.handleEvents(a, events);
    }
    this.updateWeather();
  }

  handleEvents(a, events) {
    if (events.includes('sick')) this.ui.toast(t('gotSick', { name: a.name }), 6000);
    if (events.includes('died')) this.animalDied(a);
  }

  animalDied(a) {
    const p = this.profile;
    p.animals = p.animals.filter((x) => x.id !== a.id);
    const y = Math.floor(ageYears(a));
    p.memorial.push({ name: a.name, species: a.species, breed: a.breed, years: y, day: this.day });
    const e = this.entities.get(a.id);
    if (e) {
      if (this.player.mount === e) this.player.dismount();
      e.dispose();
      this.entities.delete(a.id);
    }
    this.ui.closePanelFor(a.id);
    this.ui.alert(t('died', { name: a.name, age: t('years', { n: y }) }));
  }

  // ---------------------------------------------------------------- boucle

  frame() {
    const dt = Math.min(0.1, this.clock.getDelta());
    if (!this.running) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    const p = this.profile;
    p.clock += dt * GAME_MINUTES_PER_REAL_SECOND;
    const night = isNight(p.clock);

    const ctrl = this.input.poll();
    if (ctrl.look.dx || ctrl.look.dy || ctrl.zoom) this.ui.hideHelp?.();
    this.player.update(dt, ctrl, this.rig.yaw, this.rig.mode === 'first');
    this.rig.update(dt, ctrl, this.player, this.world);

    const ctx = { playerPos: this.player.position, night };
    for (const e of this.entities.values()) e.update(dt, ctx);

    const { day } = this.world.updateSky(this.hour, this.weather, this.player.position);
    this.world.updateClouds(dt);
    this.player.torch.intensity = (1 - day) * 6;
    const flash = this.weather3d.update(dt, this.camera.position);
    if (flash) this.world.hemi.intensity += flash * 3;

    // Simulation des besoins 2 fois par seconde.
    this.simAcc += dt;
    if (this.simAcc >= 0.5) {
      const hours = (this.simAcc * GAME_MINUTES_PER_REAL_SECOND) / 60;
      this.simAcc = 0;
      this.updateWeather();
      const weather = this.simWeather();
      for (const a of this.animalsHere()) {
        const e = this.entities.get(a.id);
        const before = mood(a);
        const events = tickAnimal(a, hours, {
          weather, sleeping: e?.sleeping, ridden: e?.ridden, moving: e && e.speed > 0.3,
        });
        if (before !== 'sad' && mood(a) === 'sad') this.ui.toast(t('sad', { name: a.name }), 4000);
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

    this.updateFocus();
    this.renderer.render(this.scene, this.camera);
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
      case 'animal': this.ui.openAnimal(f.entity.data); break;
      case 'refuge': this.ui.openAdoption(); break;
      case 'vet': this.ui.openVetClinic(); break;
      case 'house':
      case 'lodge': this.sleep(); break;
      case 'jobs': this.ui.openJobs(); break;
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

  care(a, action) {
    const care = CARE[action];
    if (!canAfford(this.profile, care.cost)) return this.ui.toast(t('r_money'));
    const res = applyCare(a, action);
    if (!res.ok) return this.ui.toast(t(`r_${res.reason}`, { name: a.name }));
    spend(this.profile, care.cost);
    addStat(this.profile, action);
    this.entities.get(a.id)?.emit(CARE_EMOJI[action] ?? '❤️');
    this.ui.refresh();
    return res;
  }

  trick(a, trickId) {
    const r = trainTrick(a, trickId);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name }));
    const e = this.entities.get(a.id);
    if (r.learned) {
      addStat(this.profile, 'tricksLearned');
      e?.emit('🎉', 5);
      this.ui.toast(t('trickLearned', { name: a.name, trick: t(`trick_${trickId}`) }));
    } else if (r.success) {
      e?.emit('⭐', 2);
      this.ui.toast(t('trickSuccess', { name: a.name, p: r.progress }));
    } else {
      this.ui.toast(t('trickFail', { name: a.name }));
    }
    this.ui.refresh();
    return r;
  }

  train(a, trainingId) {
    const r = trainSkill(a, trainingId);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name }));
    addStat(this.profile, 'trainings');
    this.entities.get(a.id)?.emit('💪', 2);
    this.ui.toast(t('skillGain', { name: a.name, skill: t(`skill_${r.skill}`), n: r.gain }));
    this.ui.refresh();
    return r;
  }

  ride(a) {
    const r = canRide(a);
    if (!r.ok) return this.ui.toast(t(`r_${r.reason}`, { name: a.name }));
    const e = this.entities.get(a.id);
    if (!e) return null;
    this.player.ride(e);
    addStat(this.profile, 'rides');
    this.ui.toast(t('ridingHint', { name: a.name }));
    return r;
  }

  dismount() {
    this.player.dismount();
  }

  toggleFollow(a) {
    a.following = !a.following;
    this.ui.toast(t(a.following ? 'following' : 'staying', { name: a.name }));
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
    const door = this.world.interactables.find((i) => i.kind === 'refuge');
    const e = this.spawnEntity(a, door);
    e.emit('❤️', 5);
    this.ui.toast(t('adopted', { name: a.name }));
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
    this.entities.get(a.id)?.emit('💚', 4);
    this.ui.toast(t(wasSick ? 'vetCured' : 'vetCheckupDone', { name: a.name }));
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
      else if (events.includes('sick')) this.ui.toast(t('gotSick', { name: a.name }), 6000);
    }
    p.place = destId;
    if (!p.visited.includes(destId)) p.visited.push(destId);
    addStat(p, 'travels');
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

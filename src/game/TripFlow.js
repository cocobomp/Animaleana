// Déroulement d'un voyage réaliste : on fait monter les animaux dans le véhicule garé dans la cour,
// puis on suit le trajet (pauses, soins) ou on le passe, et enfin on arrive (Game.travel).
// La logique pure (étapes, stress…) est dans sim/trip.js ; l'écran du trajet dans ui/trip.js.

import * as THREE from 'three';
import { TripVehicle, crateWithAnimal } from './Vehicle.js';
import { disposeVehicle } from './models/vehicles.js';
import { disposeModel } from './models/animalModel.js';
import { checkTravel, PLACES } from '../sim/places.js';
import { canRide } from '../sim/animal.js';
import { canLead } from '../sim/gear.js';
import { canAfford, spend, addStat } from '../sim/profile.js';
import { hourOf } from '../sim/time.js';
import {
  planTrip, tickTrip, runToEnd, finishTrip, vehicleFor, placeFor, needsTrailer,
} from '../sim/trip.js';
import { t, ta, L } from '../i18n.js';
import { openJourney, closeJourney, updateJourney, renderJourney, showReport, showDepartChoice } from '../ui/trip.js';

// Distance au véhicule (m) pour pouvoir faire monter un animal.
const LOAD_RADIUS = 5;
const CRATE_TAP_RADIUS = 9;
// Vitesse du trajet à l'écran : heures de voyage par seconde réelle (multipliée par le bouton de vitesse).
export const HOURS_PER_SECOND = 0.6;

export class TripFlow {
  constructor(game) {
    this.game = game;
    this.loading = null; // { destId, mode, ids, check, vehicle, loaded: Set, carry }
    this.journey = null; // { trip, watch, speed, vehicle, destId, ids }
  }

  get ui() {
    return this.game.ui;
  }

  get active() {
    return !!(this.loading || this.journey);
  }

  travellers(ids) {
    return this.game.profile.animals.filter((a) => ids.includes(a.id));
  }

  // ------------------------------------------------------------ préparation

  /** Depuis le panneau Voyager : vérifie, puis gare le véhicule dans la cour. Renvoie true si c'est parti. */
  begin(destId, mode, ids) {
    const g = this.game;
    const p = g.profile;
    if (this.active) this.cancel(true);
    const travellers = g.animalsHere().filter((a) => ids.includes(a.id));
    const horse = travellers.find((a) => a.species === 'horse' && canRide(a).ok);
    const check = checkTravel(p.place, destId, mode, travellers, !!horse);
    if (!check.ok) return this.ui.toast(t(`tr_${check.reason}`));
    if (!canAfford(p, check.cost)) return this.ui.toast(t('r_money'));

    // Personne ne vient : on part tout de suite, les animaux restent chez le voisin.
    if (!travellers.length) {
      this.loading = { destId, mode, ids: [], check, vehicle: null, loaded: new Set() };
      this.depart(false);
      return true;
    }

    if (vehicleFor(mode, travellers) === 'none') {
      // À cheval : pas de véhicule. On monte le cheval, les autres suivent.
      const others = travellers.filter((a) => a !== horse);
      const noLead = others.find((a) => !canLead(a).ok);
      if (noLead) return this.ui.toast(ta('r_needHalter', noLead), 5000);
      this.loading = { destId, mode, ids: travellers.map((a) => a.id), check, vehicle: null, loaded: new Set(), riderId: horse.id };
      showDepartChoice(this.ui, this);
      return true;
    }

    const vehicle = new TripVehicle(g, vehicleFor(mode, travellers), travellers);
    this.loading = { destId, mode, ids: travellers.map((a) => a.id), check, vehicle, loaded: new Set(), carry: null };
    // On se tourne vers le véhicule.
    const lp = vehicle.center;
    g.rig.yaw = Math.atan2(lp.x - g.player.position.x, lp.z - g.player.position.z);
    this.ui.toast(t(`trip_parked_${vehicle.kind}`), 6000);
    this.ui.toast(t(vehicle.kind === 'trailer' ? 'trip_parkedHelp' : 'trip_parkedHelpCar'), 9000);
    this.ui.renderStatus();
    return true;
  }

  /**
   * Départ pour un concours à l'extérieur (src/game/CompetitionVenue.js) : on emmène les animaux inscrits
   * dans le bon véhicule (van s'il y a un cheval, sinon voiture ; avion ou bateau au-delà des mers).
   */
  beginCompetitionTrip(entry) {
    const g = this.game;
    const ids = entry.animalIds.filter((id) => g.animalsHere().some((a) => a.id === id));
    if (!ids.length) return this.ui.toast(t('comp_noAnimalsHere'), 5000);
    const travellers = g.animalsHere().filter((a) => ids.includes(a.id));
    const opts = g.travelOptions(entry.comp.place, travellers);
    const mode = ['van', 'car', 'plane', 'boat'].find((m) => opts.find((o) => o.mode === m)?.ok);
    if (!mode) return this.ui.toast(t('tr_sea'));
    const ok = this.begin(entry.comp.place, mode, ids);
    if (ok && this.loading) {
      this.loading.purpose = 'competition';
      this.ui.toast(t('comp_tripStarted', { name: L(entry.comp.name) }), 7000);
    }
    return ok;
  }

  /** Les voyageurs pas encore montés. */
  waiting() {
    const l = this.loading;
    if (!l) return [];
    return this.travellers(l.ids).filter((a) => !l.loaded.has(a.id) && l.carry?.a !== a);
  }

  placeOf(a) {
    return placeFor(this.loading.vehicle.kind, a);
  }

  entityOf(a) {
    return this.game.entities.get(a.id) ?? null;
  }

  /** Qui peut monter maintenant (tout près du véhicule) ? */
  loadable() {
    const l = this.loading;
    if (!l?.vehicle) return [];
    const mount = this.game.player.mount;
    return this.waiting().filter((a) => {
      const e = this.entityOf(a);
      if (!e) return false;
      if (l.vehicle.distanceTo(e.position) > LOAD_RADIUS && !(mount === e && l.vehicle.distanceTo(this.game.player.position) < LOAD_RADIUS)) return false;
      if (this.placeOf(a) === 'trailer') return a.following || mount === e;
      return true;
    });
  }

  /** Toucher l'écran pendant le chargement. Renvoie true si on s'en est occupé. */
  onTap(raycaster) {
    const l = this.loading;
    if (!l?.vehicle || this.journey) return false;
    const g = this.game;
    // Un petit animal près du véhicule : on le met dans sa caisse.
    const roots = [...g.entities.values()].filter((e) => !e.ridden).map((e) => e.root);
    const hitA = raycaster.intersectObjects(roots, true)[0];
    const hitV = raycaster.intersectObjects(l.vehicle.pickables, true)[0];
    if (hitA && (!hitV || hitA.distance < hitV.distance)) {
      let o = hitA.object;
      while (o && !o.userData.entity) o = o.parent;
      const e = o?.userData.entity;
      const a = e?.data;
      if (a && this.waiting().includes(a) && this.placeOf(a) === 'crate' && l.vehicle.distanceTo(e.position) < CRATE_TAP_RADIUS) {
        g.walkTo(e.position, e.radius + 1, () => this.crateAnimal(a), true);
        return true;
      }
      return false;
    }
    if (hitV) {
      const target = g.player.mount ? l.vehicle.loadPoint : this.nearestSide(g.player.position);
      g.walkTo(target, 1.4, () => this.interact());
      return true;
    }
    return false;
  }

  /** Un point juste à côté du véhicule, du côté du joueur (le bas de la rampe s'il y a une remorque). */
  nearestSide(from) {
    const v = this.loading.vehicle;
    if (v.kind === 'trailer') return v.loadPoint;
    const c = v.center;
    const d = new THREE.Vector3(from.x - c.x, 0, from.z - c.z);
    if (d.lengthSq() < 0.01) d.set(0, 0, 1);
    d.normalize().multiplyScalar(2);
    return c.add(d);
  }

  /** Pour le bouton d'action : on est près du véhicule. */
  focusNear(pp) {
    const l = this.loading;
    if (!l?.vehicle || this.journey) return null;
    if (l.vehicle.distanceTo(pp) > 3.5) return null;
    return { kind: 'vehicle', key: this.loadable().map((a) => a.id).join(',') };
  }

  focusLabel() {
    const first = this.loadable()[0];
    const emoji = this.loading?.vehicle?.kind === 'car' ? '🚗' : '🚐';
    return `${emoji} ${first ? t('trip_focusLoad', { name: first.name }) : t('trip_focusVehicle')}`;
  }

  /** Faire monter tous ceux qui sont prêts, ou expliquer quoi faire. */
  interact() {
    const l = this.loading;
    if (!l?.vehicle) return;
    if (l.carry && l.vehicle.distanceTo(this.game.player.position) < 4) {
      this.finishCarry();
      return;
    }
    const ready = this.loadable();
    if (!ready.length) {
      const horse = this.waiting().find((a) => this.placeOf(a) === 'trailer' && !a.following);
      this.ui.toast(horse ? ta('trip_loadHorseHint', horse) : t('trip_nobodyNear'), 5000);
      return;
    }
    for (const a of ready) this.load(a);
  }

  /** L'animal monte : il disparaît du monde et apparaît dans la remorque ou dans une caisse. */
  load(a) {
    const g = this.game;
    const l = this.loading;
    const e = this.entityOf(a);
    if (e) {
      if (g.player.mount === e) g.dismount();
      g.ui.closePanelFor(a.id);
      e.dispose();
      g.entities.delete(a.id);
    }
    a.following = false;
    const place = this.placeOf(a);
    l.vehicle.addPassenger(a, place);
    l.loaded.add(a.id);
    this.ui.toast(ta(place === 'trailer' ? 'trip_loaded' : 'trip_inCrate', a));
    this.ui.renderStatus();
    if (this.waiting().length === 0 && !l.carry) this.allLoaded();
  }

  /** On met un petit animal dans sa caisse, et on la porte jusqu'au véhicule. */
  crateAnimal(a) {
    const g = this.game;
    const l = this.loading;
    if (!l || l.carry || !this.waiting().includes(a)) return;
    const e = this.entityOf(a);
    if (e && l.vehicle.distanceTo(e.position) < LOAD_RADIUS && l.vehicle.distanceTo(g.player.position) < LOAD_RADIUS) {
      this.load(a);
      return;
    }
    if (e) {
      g.ui.closePanelFor(a.id);
      e.dispose();
      g.entities.delete(a.id);
    }
    a.following = false;
    const c = crateWithAnimal(a);
    c.crate.group.position.set(0, 0.6, 0.45);
    g.player.root.add(c.crate.group);
    l.carry = { a, mesh: c.crate.group, model: c.model };
    this.ui.toast(ta('trip_carrying', a));
    g.walkTo(l.vehicle.loadPoint, 1.5, () => this.finishCarry());
    this.ui.renderStatus();
  }

  finishCarry() {
    const l = this.loading;
    if (!l?.carry) return;
    const { a, mesh, model } = l.carry;
    mesh.parent?.remove(mesh);
    mesh.remove(model.root);
    disposeModel(model.root);
    disposeVehicle(mesh);
    l.carry = null;
    this.load(a);
  }

  /** Bouton « Mettre en caisse » : le petit animal le plus proche. */
  crateNearest() {
    const g = this.game;
    const pp = g.player.position;
    const small = this.waiting().filter((a) => this.placeOf(a) === 'crate' && this.entityOf(a))
      .sort((x, y) => this.entityOf(x).position.distanceTo(pp) - this.entityOf(y).position.distanceTo(pp));
    if (!small.length) return this.ui.toast(t('trip_nothingToCrate'));
    const e = this.entityOf(small[0]);
    g.walkTo(e.position, e.radius + 1, () => this.crateAnimal(small[0]), true);
    return null;
  }

  /** Tout le monde est à bord : on choisit de suivre le trajet ou de le passer. */
  allLoaded() {
    this.loading.vehicle.closeRamp();
    showDepartChoice(this.ui, this);
  }

  /** Annuler : tout le monde redescend du véhicule. */
  cancel(silent = false) {
    const g = this.game;
    const l = this.loading;
    if (!l) return;
    if (l.carry) {
      l.carry.mesh.parent?.remove(l.carry.mesh);
      l.carry.mesh.remove(l.carry.model.root);
      disposeModel(l.carry.model.root);
      disposeVehicle(l.carry.mesh);
      l.loaded.add(l.carry.a.id);
      l.carry = null;
    }
    if (l.vehicle) {
      const near = l.vehicle.loadPoint;
      for (const id of l.loaded) {
        const a = g.profile?.animals.find((x) => x.id === id);
        l.vehicle.removePassenger(id);
        if (a && a.location === g.profile.place && !g.entities.has(id)) g.spawnEntity(a, near);
      }
      l.vehicle.dispose();
    }
    this.loading = null;
    if (!silent) this.ui.toast(t('trip_cancelled'));
    this.ui.renderStatus();
  }

  /** Appelé à chaque image pendant le chargement (porter une caisse). */
  updateLoading() {
    const l = this.loading;
    if (!l?.carry || !l.vehicle) return;
    if (l.vehicle.distanceTo(this.game.player.position) < 2.2) this.finishCarry();
  }

  // ------------------------------------------------------------ trajet

  /** Départ ! watch : on suit le trajet (sinon il passe tout seul, avec les soins minimum). */
  depart(watch) {
    const g = this.game;
    const p = g.profile;
    const l = this.loading;
    if (!l) return;
    if (!spend(p, l.check.cost)) {
      this.ui.toast(t('r_money'));
      this.cancel(true);
      return;
    }
    const animals = this.travellers(l.ids);
    const trip = planTrip({
      mode: l.mode,
      km: l.check.km,
      hours: l.check.hours,
      animals,
      from: p.place,
      to: l.destId,
      riderId: l.riderId ?? null,
      heat: g.weather === 'clear' && g.temperature >= 26,
    });
    this.journey = { trip, watch, speed: 1, vehicle: l.vehicle, destId: l.destId, mode: l.mode, ids: l.ids, startClock: p.clock, camT: 0, report: null };
    this.loading = null;
    this.ui.renderStatus();
    g.focusKey = 'trip';
    g.focus = null;
    this.ui.setFocus(null);
    if (this.journey.vehicle) {
      g.player.root.visible = false; // on est au volant
      if (g.player.mount) g.dismount();
    }
    if (!watch || !animals.length) {
      runToEnd(trip, animals);
      this.handleEvents(animals);
      this.finish();
      return;
    }
    this.ui.tripBlocking = true;
    g.input.enabled = false;
    openJourney(this.ui, this);
  }

  get animals() {
    return this.journey ? this.travellers(this.journey.ids) : [];
  }

  handleEvents(list) {
    for (const { a, events } of list ?? []) this.game.handleEvents(a, events);
  }

  /** Une image pendant le trajet : le temps avance, la 3D tourne derrière l'écran du trajet. Renvoie true si le trajet est en cours. */
  frame(dt) {
    if (this.loading) this.updateLoading();
    const j = this.journey;
    if (!j) return false;
    const g = this.game;
    const trip = j.trip;
    if (trip.status === 'moving' && !j.report) {
      const out = tickTrip(trip, this.animals, dt * HOURS_PER_SECOND * j.speed);
      this.handleEvents(out.events);
      if (out.reached === 'arrived') this.finish();
      else if (out.reached) renderJourney(this.ui, this);
    }
    j.uiAcc = (j.uiAcc ?? 0) + dt;
    if (j.uiAcc > 0.25 && this.journey) {
      j.uiAcc = 0;
      updateJourney(this.ui, this);
    }
    this.render3d(dt);
    return true;
  }

  /** Le véhicule quitte la cour, la caméra le suit un moment. */
  render3d(dt) {
    const g = this.game;
    const j = this.journey;
    let focus = g.player.position;
    if (j?.vehicle) {
      focus = j.trip.status === 'moving' || j.vehicle.driven > 0 ? j.vehicle.drive(j.trip.status === 'moving' ? dt : dt * 0.5) : j.vehicle.root.position;
      if (j.vehicle.driven > 140) focus = j.vehicle.root.position;
      const cam = g.camera;
      const back = new THREE.Vector3(-Math.sin(j.vehicle.heading), 0, -Math.cos(j.vehicle.heading));
      const side = new THREE.Vector3(Math.cos(j.vehicle.heading), 0, -Math.sin(j.vehicle.heading));
      const want = focus.clone().addScaledVector(back, 9).addScaledVector(side, 5);
      want.y = g.world.heightAt(want.x, want.z) + 4.5;
      if (j.vehicle.driven < 120) cam.position.lerp(want, Math.min(1, dt * 2));
      cam.lookAt(focus.x, focus.y + 1, focus.z);
    } else {
      // Sans véhicule (à cheval, ou bilan à l'arrivée) : la caméra habituelle derrière le joueur.
      g.rig.update(dt, { look: { dx: 0, dy: 0 }, zoom: 0, keyLook: { x: 0, y: 0 } }, g.player, g.world);
    }
    const hour = hourOf(g.profile.clock + (j ? j.trip.elapsed * 60 : 0));
    g.world.updateSky(hour, g.weather, focus);
    g.world.updateClouds(dt);
    g.weather3d.update(dt, g.camera.position);
    g.renderer.render(g.scene, g.camera);
  }

  /** Arrivée : le temps a passé, on change de lieu, puis on affiche le bilan. */
  finish() {
    const g = this.game;
    const j = this.journey;
    if (!j || j.report) return;
    const animals = this.animals;
    const report = finishTrip(j.trip, animals);
    for (const r of report.animals) if (r.sick) g.ui.toast(ta('gotSick', r.a), 6000);
    g.profile.clock += j.trip.elapsed * 60;
    if (j.trip.skipped) addStat(g.profile, 'tripStopsSkipped', j.trip.skipped);
    j.vehicle?.dispose();
    j.vehicle = null;
    g.player.root.visible = true;
    g.input.enabled = true;
    g.travel(j.destId, j.mode, j.ids.filter((id) => g.profile.animals.some((a) => a.id === id)), { trip: j.trip });
    j.report = report;
    this.ui.refresh();
    report.tips = j.trip.ids.length ? ['stressHome', 'long'] : ['neighbour'];
    showReport(this.ui, this, report);
  }

  /** Fermer le bilan. */
  close() {
    this.journey = null;
    this.ui.tripBlocking = false;
    this.game.input.enabled = true;
    closeJourney(this.ui);
    this.ui.renderStatus();
    this.ui.refresh();
  }

  /** Quitter la partie au milieu d'un voyage. */
  reset() {
    if (this.loading) this.cancel(true);
    if (this.journey) {
      this.journey.vehicle?.dispose();
      this.game.player.root.visible = true;
      this.journey = null;
      this.ui.tripBlocking = false;
      closeJourney(this.ui);
    }
  }

  destName() {
    const j = this.journey ?? this.loading;
    const d = PLACES[j.destId];
    return `${d.flag} ${L(d.name)}`;
  }

  fromName() {
    const p = PLACES[this.journey?.trip.from ?? this.game.profile.place];
    return `${p.flag} ${L(p.name)}`;
  }

  needsTrailer(a) {
    return needsTrailer(a);
  }
}

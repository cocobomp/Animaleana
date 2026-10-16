// Déroulement d'un voyage réaliste :
//   1. le véhicule se gare dans la cour (4x4 + van à chevaux, ou voiture + caisses) ;
//   2. on fait monter les animaux : le cheval monte le pont en main (il peut hésiter : on le rassure,
//      on lui donne une friandise), les petits vont dans une caisse qu'on porte jusqu'au coffre ;
//   3. dans le compartiment : barre de poitrail, barre arrière, attacher au filet à foin ;
//   4. on remplit le coffre de transport (selles, filets, foin, eau, trousse…) ;
//   5. au volant : « Partir », puis on suit le trajet depuis la cabine (pauses, soins) ou on le passe ;
//   6. à l'arrivée, le matériel emporté est là (Game.travel, sim/cargo.js).
// La logique pure est dans sim/trip.js, sim/loading.js et sim/cargo.js ; l'interface dans ui/trip.js et ui/vehicle.js.

import * as THREE from 'three';
import { TripVehicle, crateWithAnimal } from './Vehicle.js';
import { RoadView } from './RoadView.js';
import { disposeVehicle } from './models/vehicles.js';
import { disposeModel } from './models/animalModel.js';
import { checkTravel, PLACES } from '../sim/places.js';
import { canRide } from '../sim/animal.js';
import { canLead } from '../sim/gear.js';
import { hasTool } from '../sim/tools.js';
import { canAfford, spend, addStat } from '../sim/profile.js';
import { hourOf } from '../sim/time.js';
import {
  planTrip, tickTrip, runToEnd, finishTrip, vehicleFor, placeFor, needsTrailer,
} from '../sim/trip.js';
import { capacityFor, suggestCargo, arriveWithCargo, inCargo } from '../sim/cargo.js';
import {
  startLoad, willLoad, encourage, newStall, enterStall, doStep, secured, secureAll, safetyMap,
} from '../sim/loading.js';
import { t, ta, L } from '../i18n.js';
import { openJourney, closeJourney, updateJourney, renderJourney, showReport, showDepartChoice } from '../ui/trip.js';
import { openVehicleMenu, renderVehiclePanel } from '../ui/vehicle.js';

// Distance au véhicule (m) pour pouvoir faire monter un animal.
const LOAD_RADIUS = 5;
const CRATE_TAP_RADIUS = 9;
// Vitesse du trajet à l'écran : heures de voyage par seconde réelle (multipliée par le bouton de vitesse).
export const HOURS_PER_SECOND = 0.6;

export class TripFlow {
  constructor(game) {
    this.game = game;
    // loading : { destId, mode, ids, check, vehicle, loaded: Set, carry, cargo, capacity, stalls: Map, conf: Map, walk, view }
    this.loading = null;
    this.journey = null; // { trip, watch, speed, vehicle, destId, ids, cargo }
    this.camLook = new THREE.Vector3();
    this.camYaw = 0;
    this.camPitch = 0;
    this.feedAcc = 0;
  }

  get ui() {
    return this.game.ui;
  }

  get active() {
    return !!(this.loading || this.journey);
  }

  /** Une vue dans le véhicule est ouverte (la caméra et le panneau du bas sont à nous). */
  get view() {
    return this.loading?.view ?? null;
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
    const kind = travellers.length ? vehicleFor(mode, travellers) : 'car';
    const capacity = capacityFor(mode === 'horse' ? 'none' : kind);
    const base = { destId, mode, check, loaded: new Set(), capacity, cargo: suggestCargo(p, travellers, capacity, { mode }), stalls: new Map(), conf: new Map(), walk: null, view: null };

    // Personne ne vient : les animaux restent chez le voisin ; on choisit juste ses bagages.
    if (!travellers.length) {
      this.loading = { ...base, ids: [], vehicle: null };
      showDepartChoice(this.ui, this);
      return true;
    }

    if (mode === 'horse') {
      // À cheval : pas de véhicule. On monte le cheval, les autres suivent ; le matériel va dans les sacoches.
      const others = travellers.filter((a) => a !== horse);
      const noLead = others.find((a) => !canLead(a).ok);
      if (noLead) return this.ui.toast(ta('r_needHalter', noLead), 5000);
      this.loading = { ...base, ids: travellers.map((a) => a.id), vehicle: null, riderId: horse.id };
      showDepartChoice(this.ui, this);
      return true;
    }

    const vehicle = new TripVehicle(g, kind, travellers);
    this.loading = { ...base, ids: travellers.map((a) => a.id), vehicle, carry: null };
    vehicle.setCargo(this.loading.cargo.items);
    // On se tourne vers le véhicule.
    const lp = vehicle.center;
    g.rig.yaw = Math.atan2(lp.x - g.player.position.x, lp.z - g.player.position.z);
    this.ui.toast(t(`trip_parked_${vehicle.kind}`), 6000);
    this.ui.toast(t(vehicle.kind === 'trailer' ? 'trip_parkedHelp' : 'trip_parkedHelpCar'), 9000);
    this.ui.renderStatus();
    return true;
  }

  /** Les voyageurs pas encore montés. */
  waiting() {
    const l = this.loading;
    if (!l) return [];
    return this.travellers(l.ids).filter((a) => !l.loaded.has(a.id) && l.carry?.a !== a && l.walk?.a !== a);
  }

  placeOf(a) {
    return placeFor(this.loading.vehicle?.kind ?? 'car', a);
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
    if (l.view || l.walk) return true; // dans le véhicule, ou un animal est en train de monter
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
      // Le van, la cabine ou la sellerie : on y va, puis on choisit quoi faire.
      const part = l.vehicle.partAt(hitV.object);
      const target = part === 'cab' ? l.vehicle.driverPoint : l.vehicle.trailer ? l.vehicle.loadPoint : this.nearestSide(g.player.position);
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
    d.normalize().multiplyScalar(2.6);
    return c.add(d);
  }

  /** Pour le bouton d'action : on est près du véhicule. */
  focusNear(pp) {
    const l = this.loading;
    if (!l?.vehicle || this.journey || l.view || l.walk) return null;
    if (l.vehicle.distanceTo(pp) > 3.5) return null;
    return { kind: 'vehicle', key: `${this.leading()?.id ?? ''}-${l.carry ? 1 : 0}-${this.waiting().length}` };
  }

  /** Le grand animal qu'on tient au licol (il nous suit), prêt à monter. */
  leading() {
    const mount = this.game.player.mount?.data;
    return this.waiting().find((a) => this.placeOf(a) === 'trailer' && (a.following || a === mount)) ?? null;
  }

  focusLabel() {
    const l = this.loading;
    const emoji = l?.vehicle?.kind === 'car' ? '🚗' : '🚐';
    if (l?.carry) return `📦 ${ta('veh_putCrate', l.carry.a)}`;
    const lead = this.leading();
    if (lead) return `${emoji} ${t('trip_focusLoad', { name: lead.name })}`;
    return `${emoji} ${t(l?.vehicle?.kind === 'car' ? 'veh_focusCar' : 'veh_focusVan')}`;
  }

  /** Bouton d'action près du véhicule : poser la caisse, faire monter le cheval qu'on tient, sinon le menu. */
  interact() {
    const l = this.loading;
    if (!l?.vehicle || l.view || l.walk) return;
    if (l.carry && l.vehicle.distanceTo(this.game.player.position) < 4) {
      this.finishCarry();
      return;
    }
    const lead = this.leading();
    if (lead) {
      this.leadIn(lead);
      return;
    }
    openVehicleMenu(this.ui, this);
  }

  // ------------------------------------------------------------ faire monter un grand animal

  /**
   * Faire monter un cheval (ou une vache, un mouton…) : on va le chercher s'il le faut, on le mène au
   * licol jusqu'au bas du pont, puis il monte à sa place (s'il n'hésite pas).
   */
  leadIn(a) {
    const g = this.game;
    const l = this.loading;
    const v = l?.vehicle;
    if (!v?.trailer || l.walk || l.loaded.has(a.id)) return;
    const e = this.entityOf(a);
    if (!e) return;
    const i = v.freeStall(a);
    if (i < 0) {
      this.ui.toast(t('veh_noPlace'));
      return;
    }
    l.walk = { a, i, phase: 'fetch' };
    this.ui.renderStatus();
    const toRamp = () => {
      if (l !== this.loading || l.walk?.a !== a) return;
      if (g.player.mount === e) g.dismount();
      // Le licol du cheval, ou le licol de secours rangé dans le van.
      if (!a.following) {
        if (!canLead(a).ok) this.ui.toast(ta('veh_spareHalter', a), 4500);
        a.leashed = false;
        a.following = true;
      }
      l.walk.phase = 'lead';
      const start = v.walkPath(i, a, e.scale)[0];
      g.walkTo(start, 0.7, () => this.startWalkIn(a, i));
    };
    if (a.following || g.player.mount === e) toRamp();
    else g.walkTo(e.position, e.radius + 1.1, toRamp, true);
  }

  startWalkIn(a, i) {
    const g = this.game;
    const l = this.loading;
    if (!l || l.walk?.a !== a) return;
    const e = this.entityOf(a);
    if (!e) return;
    const st = l.conf.get(a.id) ?? startLoad(a);
    l.conf.set(a.id, st);
    l.walk.phase = 'walk';
    l.walk.hesitating = false;
    l.walk.w = l.vehicle.walkIn(e, i, {
      hesitate: !willLoad(st),
      player: g.player,
      onHesitate: () => {
        l.walk.hesitating = true;
        this.ui.toast(ta('veh_hesitatesToast', a), 4000);
        this.renderPanel();
      },
      onDone: () => this.boarded(a, i),
    });
    this.camYaw = 0;
    this.camPitch = 0;
    this.setView('ramp');
  }

  /** Rassurer, friandise, patienter : il prend confiance (et monte quand il est prêt). */
  encourageLoad(how) {
    const l = this.loading;
    const w = l?.walk;
    if (!w?.hesitating) return;
    const a = w.a;
    const p = this.game.profile;
    if (how === 'treat' && !hasTool(p, 'treats')) {
      this.ui.toast(t('veh_noTreats'), 4500);
      return;
    }
    const st = l.conf.get(a.id);
    const ok = encourage(st, how);
    const e = w.w?.e;
    e?.emit({ reassure: '❤️', treat: '🍪', wait: '💭' }[how], 3);
    if (how !== 'wait') a.needs.affection = Math.min(100, a.needs.affection + 4);
    if (how === 'treat') a.needs.hunger = Math.min(100, a.needs.hunger + 2);
    if (ok) {
      w.hesitating = false;
      this.ui.toast(ta('veh_goesIn', a), 3500);
      l.vehicle.resumeWalk(w.w);
    } else {
      this.ui.toast(ta(`veh_stillHesitates_${how}`, a), 3500);
    }
    this.renderPanel();
  }

  /** On renonce pour l'instant : l'animal redescend du pont et nous suit. */
  giveUpLoad() {
    const l = this.loading;
    const w = l?.walk;
    if (!w) return;
    if (w.w) l.vehicle.abortWalk(w.w);
    l.walk = null;
    this.setView(null);
    this.ui.toast(ta('veh_gaveUp', w.a), 5000);
    this.ui.renderStatus();
  }

  /** L'animal est à sa place dans le van. */
  boarded(a, i) {
    const g = this.game;
    const l = this.loading;
    if (!l) return;
    g.entities.delete(a.id); // il appartient maintenant au van (Vehicle.js l'anime)
    g.ui.closePanelFor(a.id);
    l.loaded.add(a.id);
    l.walk = null;
    const st = this.stallState(i);
    if (enterStall(st) === 'breastOpen') this.ui.toast(t('veh_tipBreastFirst'), 6000);
    this.ui.toast(ta('trip_loaded', a));
    addStat(g.profile, 'vanLoads');
    l.vehicle.showStall(i, st);
    this.setView('stall');
    this.ui.renderStatus();
    if (this.waiting().length === 0 && !l.carry) this.allLoaded();
  }

  /** L'état des barres d'une place du van (sim/loading.js). */
  stallState(i) {
    const l = this.loading;
    if (!l.stalls.has(i)) l.stalls.set(i, newStall());
    return l.stalls.get(i);
  }

  /** Les animaux du van pas encore bien installés (barres, corde). */
  unsecured() {
    const l = this.loading;
    const v = l?.vehicle;
    if (!v?.trailer) return [];
    const out = [];
    v.stallUse.forEach((ids, i) => {
      for (const id of ids) {
        const a = this.game.profile.animals.find((x) => x.id === id);
        if (a && l.loaded.has(id) && !secured(this.stallState(i), a)) out.push(a);
      }
    });
    return out;
  }

  /** Une étape de sécurité dans le compartiment (barre de poitrail, barre arrière, attacher). */
  stallStep(i, step) {
    const l = this.loading;
    const v = l.vehicle;
    const a = v.passengerAt(i) ?? { species: 'horse' };
    const st = this.stallState(i);
    const r = doStep(st, a, step);
    if (!r.ok) {
      if (r.reason !== 'done') this.ui.toast(t(`veh_stepWhy_${r.reason}`), 5000);
      return;
    }
    v.showStall(i, st);
    this.ui.toast(t(`veh_stepDone_${step}`, { name: a.name ?? '' }));
    if (a.id && secured(st, a)) this.ui.toast(ta('veh_secured', a), 4000);
    this.ui.renderStatus();
  }

  // ------------------------------------------------------------ petits animaux : la caisse

  /** Menu : « Mettre X dans sa caisse » (on va le chercher). */
  crateNow(a) {
    const e = this.entityOf(a);
    if (!e) return;
    this.game.walkTo(e.position, e.radius + 1, () => this.crateAnimal(a), true);
  }

  /** L'animal monte tout de suite (sans animation) : dans le van, ou dans une caisse. */
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
    if (place === 'trailer') {
      const i = l.vehicle.passengers.get(a.id)?.stall;
      if (i !== undefined) {
        enterStall(this.stallState(i));
        l.vehicle.showStall(i, this.stallState(i));
      }
    }
    l.loaded.add(a.id);
    this.ui.toast(ta(place === 'trailer' ? 'trip_loaded' : 'trip_inCrate', a));
    this.ui.renderStatus();
    if (this.waiting().length === 0 && !l.carry) this.allLoaded();
  }

  /** On met un petit animal dans sa caisse, et on la porte jusqu'au véhicule. */
  crateAnimal(a) {
    const g = this.game;
    const l = this.loading;
    if (!l || l.carry || l.walk || !this.waiting().includes(a)) return;
    const e = this.entityOf(a);
    if (e) {
      g.ui.closePanelFor(a.id);
      e.dispose();
      g.entities.delete(a.id);
    }
    a.following = false;
    const c = crateWithAnimal(a, [...l.vehicle.passengers.values()].filter((x) => x.crate).length);
    c.crate.group.position.set(0, 0.62, 0.38);
    g.player.root.add(c.crate.group);
    g.player.carrying = true;
    l.carry = { a, mesh: c.crate.group, model: c.model };
    l.vehicle.setOpen(l.vehicle.trailer ? 'rearDoor' : 'tailgate', true);
    this.ui.toast(ta('trip_carrying', a));
    g.walkTo(this.cratePoint(), 1.2, () => this.finishCarry());
    this.ui.renderStatus();
  }

  /** Où poser les caisses : derrière le 4x4 (porte arrière) ou au coffre de la voiture. */
  cratePoint() {
    const v = this.loading.vehicle;
    return v.toWorld(new THREE.Vector3(0.6, 0, -v.main.length / 2 - 1.1));
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
    this.game.player.carrying = false;
    l.vehicle.addCrate(a);
    l.loaded.add(a.id);
    this.ui.toast(ta('trip_inCrate', a));
    setTimeout(() => this.loading?.vehicle?.setOpen(this.loading.vehicle.trailer ? 'rearDoor' : 'tailgate', false), 1500);
    this.ui.renderStatus();
    if (this.waiting().length === 0) this.allLoaded();
  }

  /** Bouton « Mettre en caisse » : le petit animal le plus proche. */
  crateNearest() {
    const g = this.game;
    const pp = g.player.position;
    const small = this.waiting().filter((a) => this.placeOf(a) === 'crate' && this.entityOf(a))
      .sort((x, y) => this.entityOf(x).position.distanceTo(pp) - this.entityOf(y).position.distanceTo(pp));
    if (!small.length) return this.ui.toast(t('trip_nothingToCrate'));
    this.crateNow(small[0]);
    return null;
  }

  /** Tout le monde est à bord : il reste à vérifier les barres et le coffre, puis à monter au volant. */
  allLoaded() {
    this.ui.toast(t(this.loading.vehicle?.trailer ? 'veh_allAboardVan' : 'veh_allAboardCar'), 6000);
  }

  // ------------------------------------------------------------ coffre de transport

  /** Le contenu du coffre a changé : on range le matériel dans le véhicule. */
  cargoChanged() {
    this.loading?.vehicle?.setCargo(this.loading.cargo.items);
    this.ui.renderStatus();
  }

  // ------------------------------------------------------------ vues dans le véhicule

  /** Ouvre une vue : 'cab' (au volant), 'stall' (compartiment), 'tack' (coffre), 'ramp' (montée) ; null pour sortir. */
  setView(kind) {
    const g = this.game;
    const l = this.loading;
    if (!l?.vehicle) return;
    const v = l.vehicle;
    const was = l.view;
    if (was === kind) return;
    l.view = kind;
    if (was === 'tack' || was === 'cab' || was === 'stall') {
      v.setOpen('tack', false);
      v.setOpen('trunk', false);
      v.setOpen('roof', false);
      v.setOpen('door', false);
    }
    if (was === 'cab') {
      // On redescend à côté de la portière.
      g.player.root.visible = true;
      const p = v.driverPoint;
      g.player.root.position.set(p.x, g.world.heightAt(p.x, p.z), p.z);
      v.setOpen('door', true);
      setTimeout(() => this.loading?.vehicle?.setOpen('door', false), 900);
      v.main.screen.material.map = v.main.screenDefault ?? v.main.screen.material.map;
    }
    // Le joueur ne se voit pas dans les vues du véhicule (sauf quand il mène le cheval sur le pont).
    g.player.root.visible = !kind || kind === 'ramp';
    v.setCutaway(kind === 'stall' || kind === 'tack', kind === 'tack');
    if (!kind) this.resetCamera();
    if (kind === 'cab') {
      v.setOpen('door', true);
      setTimeout(() => this.loading?.view === 'cab' && this.loading.vehicle.setOpen('door', false), 1100);
      if (g.player.mount) g.dismount();
      this.camYaw = 0;
      this.camPitch = -0.3; // on regarde un peu vers le bas : tableau de bord, volant, écran
    } else if (kind === 'tack') {
      v.setOpen('tack', true);
      v.setOpen('trunk', true);
      v.setOpen('roof', true);
      const tp = v.tackPoint;
      g.player.root.position.set(tp.x, g.world.heightAt(tp.x, tp.z), tp.z);
    } else if (kind === 'stall') {
      const lp = v.loadPoint;
      if (!l.walk) g.player.root.position.set(lp.x, g.world.heightAt(lp.x, lp.z), lp.z);
    }
    if (!kind) g.player.cancelGoTo();
    this.viewBlend = 0;
    this.renderPanel();
    this.ui.setFocus(null);
    g.focusKey = 'veh-view';
    if (!kind) {
      g.focusKey = null;
      this.ui.renderStatus();
    }
  }

  /** La caméra habituelle du jeu (champ de vision normal, image centrée). */
  resetCamera() {
    const cam = this.game.camera;
    this.camKey = null;
    cam.fov = 60;
    cam.clearViewOffset();
    cam.updateProjectionMatrix();
  }

  renderPanel() {
    renderVehiclePanel(this.ui, this);
    // Part de l'écran cachée par le panneau (la moitié sert à remonter l'image de la vue).
    const el = this.ui.vehEl?.firstChild;
    const h = el && this.loading?.view ? el.getBoundingClientRect().height : 0;
    this.panelFrac = Math.min(0.28, h / Math.max(1, window.innerHeight) / 2);
  }

  /**
   * Caméra des vues dans le véhicule (appelée par Game.frame à la place de la caméra habituelle).
   * Renvoie true si elle s'en est occupée.
   */
  viewCamera(dt, ctrl) {
    const l = this.loading;
    if (!l?.view || !l.vehicle) return false;
    const v = l.vehicle;
    const cam = this.game.camera;
    let pose;
    if (l.view === 'ramp') pose = this.rampPose();
    else pose = v.view(l.view);
    const portrait = window.innerWidth < window.innerHeight;
    if (portrait && (l.view === 'stall' || l.view === 'tack')) {
      // Téléphone en portrait : on recule pour que tout tienne dans l'écran.
      pose.pos.sub(pose.look).multiplyScalar(l.view === 'stall' ? 1.55 : 1.3).add(pose.look);
    }
    const fov = l.view === 'cab' ? (portrait ? 80 : 68) : 60;
    // Le panneau du bas cache le bas de l'écran : on remonte l'image d'autant (la scène reste visible au-dessus).
    const H = window.innerHeight;
    const shift = Math.round(H * (this.panelFrac ?? 0));
    const key = `${fov}|${shift}|${window.innerWidth}x${H}`;
    if (key !== this.camKey) {
      this.camKey = key;
      cam.fov = fov;
      if (shift) cam.setViewOffset(window.innerWidth, H, 0, shift, window.innerWidth, H);
      else cam.clearViewOffset();
      cam.updateProjectionMatrix();
    }
    if (l.view === 'cab') {
      // On regarde autour de soi en faisant glisser le doigt (ou la souris).
      this.camYaw = THREE.MathUtils.clamp(this.camYaw - (ctrl.look?.dx ?? 0) * 0.006, -1.9, 1.9);
      this.camPitch = THREE.MathUtils.clamp(this.camPitch - (ctrl.look?.dy ?? 0) * 0.004, -0.75, 0.45);
      const dir = pose.look.clone().sub(pose.pos);
      dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.camYaw);
      const right = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      dir.applyAxisAngle(right, this.camPitch);
      pose.look.copy(pose.pos).add(dir);
      this.updateFeed(dt);
    }
    // Glissement doux vers la nouvelle vue.
    this.viewBlend = Math.min(1, (this.viewBlend ?? 0) + dt * 1.6);
    const k = this.viewBlend >= 1 ? 1 : Math.min(1, dt * 4.5);
    if (this.viewBlend <= dt * 1.6 + 1e-6) this.camLook.copy(this.lookTarget());
    cam.position.lerp(pose.pos, k);
    this.camLook.lerp(pose.look, k);
    cam.lookAt(this.camLook);
    return true;
  }

  /** Ce que la caméra regardait juste avant (pour glisser doucement vers la vue). */
  lookTarget() {
    const cam = this.game.camera;
    return cam.position.clone().add(new THREE.Vector3(0, 0, -6).applyQuaternion(cam.quaternion));
  }

  /** Vue de la montée : de côté, derrière le van, on voit le pont, le cheval et le joueur. */
  rampPose() {
    const v = this.loading.vehicle;
    const tr = v.trailer;
    const w = this.loading.walk?.w;
    // En portrait (téléphone), on recule un peu plus pour tout voir.
    const far = window.innerWidth < window.innerHeight ? 1.45 : 1;
    const pos = v.trailerToWorld(new THREE.Vector3(tr.width / 2 + 3.6 * far, 2.3 + 0.4 * far, tr.rearZ - 4.6 * far));
    const look = v.trailerToWorld(new THREE.Vector3(0, 0.9, tr.rearZ - 1.1));
    if (w?.e && w.step < 3) look.lerp(w.e.position.clone().setY(look.y), 0.5);
    return { pos, look };
  }

  /** Écran du tableau de bord : la caméra du van montre les chevaux (quelques images par seconde). */
  updateFeed(dt) {
    const v = this.loading?.vehicle ?? this.journey?.vehicle;
    if (!v?.trailer || !v.main.screen) return;
    this.feedAcc += dt;
    if (this.feedAcc < 0.2 && this.feedRT) return;
    this.feedAcc = 0;
    const g = this.game;
    if (!this.feedRT) {
      this.feedRT = new THREE.WebGLRenderTarget(256, 160);
      this.feedRT.texture.colorSpace = THREE.SRGBColorSpace;
      this.feedCam = new THREE.PerspectiveCamera(75, 256 / 160, 0.05, 8);
    }
    const pose = v.view('camera');
    this.feedCam.position.copy(pose.pos);
    this.feedCam.lookAt(pose.look);
    const scene = v.root.parent ?? g.scene;
    const r = g.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.feedRT);
    r.render(scene, this.feedCam);
    r.setRenderTarget(prev);
    const mat = v.main.screen.material;
    if (mat.map !== this.feedRT.texture) {
      v.main.screenDefault = v.main.screenDefault ?? mat.map;
      mat.map = this.feedRT.texture;
      mat.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ départ

  /** « Partir » : tout le monde est-il à bord et attaché ? A-t-on de l'eau et du foin ? */
  departCheck() {
    const l = this.loading;
    if (!l) return;
    const left = this.waiting();
    if (left.length || l.walk || l.carry) {
      this.ui.toast(t('veh_stillWaiting', { names: left.map((a) => a.name).join(', ') || l.walk?.a?.name || l.carry?.a?.name || '' }), 5000);
      return;
    }
    const loose = this.unsecured();
    if (loose.length) {
      this.ui.showModal([
        h3(t('veh_looseTitle')),
        para(t('veh_looseText', { names: loose.map((a) => a.name).join(', ') })),
        btnRow([
          [t('veh_doItForMe'), 'primary', () => {
            const v = l.vehicle;
            v.stallUse.forEach((ids, i) => {
              const a = v.passengerAt(i);
              if (!a) return;
              secureAll(this.stallState(i), a);
              v.showStall(i, this.stallState(i));
            });
            this.ui.hideModal();
            this.ui.toast(t('veh_allSecured'), 4000);
            this.renderPanel();
          }],
          [t('veh_goAnyway'), '', () => { this.ui.hideModal(); this.departGo(true); }],
        ]),
      ]);
      return;
    }
    this.departGo(false);
  }

  departGo(skipSafety) {
    const l = this.loading;
    if (!skipSafety) {
      const animals = this.travellers(l.ids);
      const needWater = animals.length && !inCargo(l.cargo, 'water');
      const needHay = animals.some((a) => needsTrailer(a)) && !inCargo(l.cargo, 'hay');
      if ((needWater || needHay) && !l.warnedCargo) {
        l.warnedCargo = true;
        this.ui.showModal([
          h3(t('veh_cargoWarnTitle')),
          para(t(needHay ? 'veh_cargoWarnHay' : 'veh_cargoWarnWater')),
          btnRow([
            [t('veh_openTrunk'), 'primary', () => { this.ui.hideModal(); this.setView('tack'); }],
            [t('veh_goAnyway'), '', () => { this.ui.hideModal(); this.departGo(true); }],
          ]),
        ]);
        return;
      }
    }
    l.vehicle?.closeRamp();
    showDepartChoice(this.ui, this);
  }

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
    const trailerAnimals = l.vehicle?.trailer ? animals.filter((a) => l.vehicle.passengers.get(a.id)?.stall !== undefined) : [];
    const stallsById = new Map();
    for (const a of trailerAnimals) stallsById.set(a.id, this.stallState(l.vehicle.passengers.get(a.id).stall));
    const trip = planTrip({
      mode: l.mode,
      km: l.check.km,
      hours: l.check.hours,
      animals,
      from: p.place,
      to: l.destId,
      riderId: l.riderId ?? null,
      heat: g.weather === 'clear' && g.temperature >= 26,
      cargo: { ...l.cargo.items },
      safety: trailerAnimals.length ? safetyMap(stallsById, trailerAnimals) : null,
    });
    const vehicle = l.vehicle;
    // On quitte la vue de chargement (la cabine du trajet prend le relais).
    if (l.view) this.setView(null);
    for (const w of vehicle?.walkers ?? []) vehicle.abortWalk(w);
    this.journey = { trip, watch, speed: 1, vehicle, destId: l.destId, mode: l.mode, ids: l.ids, cargo: l.cargo, startClock: p.clock, camT: 0, report: null };
    this.loading = null;
    this.ui.renderStatus();
    g.focusKey = 'trip';
    g.focus = null;
    this.ui.setFocus(null);
    if (vehicle) {
      g.player.root.visible = false; // on est au volant
      if (g.player.mount) g.dismount();
    }
    if (!watch || !animals.length) {
      this.handleEvents(runToEnd(trip, animals));
      this.finish();
      return;
    }
    this.ui.tripBlocking = true;
    g.input.enabled = true; // on peut regarder autour de soi dans la cabine
    // Par la route (voiture, van) : on suit le trajet depuis la cabine. En avion ou en bateau, le véhicule
    // ne fait que le trajet jusqu'au port ou à l'aéroport : on le voit partir, comme avant.
    if (vehicle && (l.mode === 'car' || l.mode === 'van')) {
      this.journey.road = new RoadView(g, vehicle, trip);
      document.body.classList.add('trip-road'); // on cache le reste de l'interface : on regarde la route
    }
    openJourney(this.ui, this);
  }

  get animals() {
    return this.journey ? this.travellers(this.journey.ids) : [];
  }

  handleEvents(list) {
    for (const { a, events } of list ?? []) this.game.handleEvents(a, events);
  }

  /** Une image : chargement (le véhicule s'anime) ou trajet. Renvoie true si le trajet est en cours (la ferme est en pause). */
  frame(dt) {
    if (this.loading) this.updateLoading(dt);
    const j = this.journey;
    if (!j) return false;
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

  /** Appelé à chaque image pendant le chargement : pièces mobiles, animaux qui montent, caisse portée. */
  updateLoading(dt) {
    const l = this.loading;
    if (!l?.vehicle) return;
    l.vehicle.update(dt);
    if (l.carry && l.vehicle.distanceTo(this.game.player.position) < 1.6 && !this.game.player.auto) this.finishCarry();
    if (l.view === 'ramp' && l.walk) {
      // Le panneau suit la montée (marche, hésitation).
      const key = `${l.walk.hesitating ? 1 : 0}`;
      if (key !== this.rampKey) {
        this.rampKey = key;
        this.renderPanel();
      }
    }
  }

  /** La 3D pendant le trajet : la route vue de la cabine (RoadView), ou le véhicule qui quitte la cour. */
  render3d(dt) {
    const g = this.game;
    const j = this.journey;
    if (j?.road) {
      const ctrl = g.input.poll();
      j.road.update(dt, ctrl, j.trip.status === 'moving' && !j.report ? j.speed : 0, this);
      if (j.road.cameraMode === 'cab') this.updateFeed(dt);
      j.road.render();
      return;
    }
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

  /** Arrivée : le temps a passé, on change de lieu (avec le matériel emporté), puis on affiche le bilan. */
  finish() {
    const g = this.game;
    const j = this.journey;
    if (!j || j.report) return;
    const animals = this.animals;
    const report = finishTrip(j.trip, animals);
    for (const r of report.animals) if (r.sick) g.ui.toast(ta('gotSick', r.a), 6000);
    g.profile.clock += j.trip.elapsed * 60;
    if (j.trip.skipped) addStat(g.profile, 'tripStopsSkipped', j.trip.skipped);
    j.road?.dispose();
    j.road = null;
    document.body.classList.remove('trip-road');
    j.vehicle?.dispose();
    j.vehicle = null;
    g.player.root.visible = true;
    g.input.enabled = true;
    // Le coffre arrive avec nous : ce qu'on a emporté est utilisable ici, le reste attend à la maison.
    const ids = j.ids.filter((id) => g.profile.animals.some((a) => a.id === id));
    report.luggage = j.cargo ? arriveWithCargo(g.profile, j.cargo, this.travellers(ids), j.destId) : null;
    report.cargo = j.cargo ? { ...j.cargo.items } : null;
    report.home = j.destId === g.profile.home;
    g.travel(j.destId, j.mode, ids, { trip: j.trip });
    g.rig.reset?.();
    j.report = report;
    this.ui.refresh();
    report.tips = j.trip.ids.length ? ['unload', 'stressHome', 'long'] : ['neighbour'];
    if (!j.trip.ids.some((id) => g.profile.animals.find((a) => a.id === id && needsTrailer(a)))) report.tips = report.tips.filter((x) => x !== 'unload');
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

  /** Annuler : tout le monde redescend du véhicule. */
  cancel(silent = false) {
    const g = this.game;
    const l = this.loading;
    if (!l) return;
    if (l.view) {
      l.view = null;
      renderVehiclePanel(this.ui, this);
      g.player.root.visible = true;
      this.resetCamera();
    }
    g.player.scripted = false;
    if (l.walk?.w) l.vehicle.abortWalk(l.walk.w);
    l.walk = null;
    if (l.carry) {
      l.carry.mesh.parent?.remove(l.carry.mesh);
      l.carry.mesh.remove(l.carry.model.root);
      disposeModel(l.carry.model.root);
      disposeVehicle(l.carry.mesh);
      l.loaded.add(l.carry.a.id);
      l.carry = null;
      g.player.carrying = false;
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

  /** Quitter la partie au milieu d'un voyage. */
  reset() {
    if (this.loading) this.cancel(true);
    if (this.journey) {
      this.journey.road?.dispose();
      this.journey.vehicle?.dispose();
      this.game.player.root.visible = true;
      this.journey = null;
      this.ui.tripBlocking = false;
      closeJourney(this.ui);
    }
    document.body.classList.remove('veh-view', 'trip-road');
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

// Petites aides pour les fenêtres de confirmation.
function h3(text) {
  const el = document.createElement('p');
  el.className = 'trip-modal-title';
  el.textContent = text;
  return el;
}

function para(text) {
  const el = document.createElement('p');
  el.textContent = text;
  return el;
}

function btnRow(list) {
  const row = document.createElement('div');
  row.className = 'row end wrap';
  for (const [label, cls, fn] of list) {
    const b = document.createElement('button');
    b.textContent = label;
    if (cls) b.className = cls;
    b.addEventListener('click', fn);
    row.append(b);
  }
  return row;
}

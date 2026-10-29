// Bâtiments où l'on entre (écurie, maison et sellerie) : construction dans le monde, murs et navigation
// par les portes, toit qui disparaît quand on est dedans, coins où l'on fait les corvées,
// box des chevaux, et lien avec la propreté / l'usure (src/sim/facilities.js).

import * as THREE from 'three';
import { stableModel, stableRooms, stableHall, stableWidth, STABLE_D } from './models/stableInterior.js';
import { stableRect } from '../sim/facilities.js'; // l'écurie se rallonge (vue construction)
import { setStableExt as placeTackRoom, TACKROOM } from './farmLayout.js';
import { houseModel, houseRooms, HOUSE_HALL, HOUSE_W, HOUSE_D } from './models/houseInterior.js';
import { plateTexture } from './models/interiorKit.js';
// Sellerie où l'on entre : objets exposés, étiquettes de prix, comptoir (src/game/models/tackRoomInterior.js).
import { tackRoomModel, TACK_HALL, TACK_W, TACK_D } from './models/tackRoomInterior.js';
import { GEAR, gearPrice, ownedVariant, wornBy, defaultSize } from '../sim/gear.js';
import { isSandbox } from '../sim/profile.js';
import { emojiTexture } from './textures.js';
import { ENCLOSURES, NAV_HOOKS, pathBlocked } from './nav.js';
import { HOME } from './AnimalEntity.js'; // paddock (déplaçable en vue d'ensemble)
import {
  ensureFacilities, boxCount, boxOccupants, assignBox, canChore, doChore, tickFacilities, applyStallEffects,
  stallDirt, houseDirt, penDirt, hasUpgrade,
} from '../sim/facilities.js';
import { droppingsAt } from '../sim/droppings.js';
import { addStat } from '../sim/profile.js';
import { SPECIES } from '../sim/species.js';
import { isNight } from '../sim/time.js';
import { rosettesOf } from '../sim/competitions.js'; // 🎖️ les flots gagnés, sur la porte du box
import { t, L } from '../i18n.js';

// ---------------------------------------------------------------- repères

const toLocal = (b, x, z) => {
  const dx = x - b.x;
  const dz = z - b.z;
  return { lx: dx * b.c - dz * b.s, lz: dx * b.s + dz * b.c };
};
const toWorld = (b, lx, lz) => ({ x: b.x + lx * b.c + lz * b.s, z: b.z - lx * b.s + lz * b.c });
const inRect = (r, p, m = 0) => p.lx > r.x0 + m && p.lx < r.x1 - m && p.lz > r.z0 + m && p.lz < r.z1 - m;

// Bâtiments du lieu actuel (pour la navigation).
let active = [];

// ---------------------------------------------------------------- navigation intérieure

const roomOf = (b, p) => b.rooms.find((r) => inRect(r, p)) ?? null;

function doorPoint(room, inner) {
  const d = room.door;
  const center = d.axis === 'z' ? (room.z0 + room.z1) / 2 : (room.x0 + room.x1) / 2;
  const side = Math.sign(center - d.wall) * (inner ? 1 : -1);
  return d.axis === 'z' ? { lx: d.at, lz: d.wall + side * 0.9 } : { lx: d.wall + side * 0.9, lz: d.at };
}

function inCorridor(p, room) {
  const d = room.door;
  const along = d.axis === 'z' ? p.lx : p.lz;
  const across = d.axis === 'z' ? p.lz : p.lx;
  return Math.abs(along - d.at) < d.gap / 2 && Math.abs(across - d.wall) < 0.95;
}

const navOut = new THREE.Vector3();

/** Étape suivante pour aller de pos à goal en passant par les portes des pièces (ou null : tout droit). */
export function interiorNav(pos, goal) {
  const way = (b, w) => {
    const o = toWorld(b, w.lx, w.lz);
    return navOut.set(o.x, 0, o.z);
  };
  // Dedans : de pièce en pièce, puis la porte d'entrée.
  for (const b of active) {
    const p = toLocal(b, pos.x, pos.z);
    if (!inRect(b.box, p)) continue;
    const q = toLocal(b, goal.x, goal.z);
    const goalIn = inRect(b.box, q);
    const rp = roomOf(b, p);
    // Pour sortir, on va d'abord dans la pièce de l'entrée.
    const rg = goalIn ? roomOf(b, q) : b.entry;
    if (rp === rg) {
      if (goalIn) return null;
      const front = { axis: 'z', wall: b.d / 2, at: 0, gap: b.door - 0.4 };
      return way(b, inCorridor(p, { door: front }) ? { lx: 0, lz: b.d / 2 + 1.3 } : { lx: 0, lz: b.d / 2 - 1.1 });
    }
    if (rp) return way(b, doorPoint(rp, !inCorridor(p, rp)));
    return way(b, doorPoint(rg, inCorridor(p, rg)));
  }
  // Dehors, vers l'intérieur : on fait le tour du bâtiment jusqu'à sa façade (sauf depuis un enclos).
  if (ENCLOSURES.some((e) => !e.interior && Math.abs(pos.x - e.x) < e.hw && Math.abs(pos.z - e.z) < e.hd)) return null;
  for (const b of active) {
    const q = toLocal(b, goal.x, goal.z);
    if (!inRect(b.box, q)) continue;
    const p = toLocal(b, pos.x, pos.z);
    const W = b.w / 2;
    const D = b.d / 2;
    // Devant l'écurie en venant du paddock : on longe sa barrière avant d'aller à la porte.
    // (marge de 0,3 m : une fois arrivé à ce point, on n'y retourne pas — l'écurie rallongée a des
    // coordonnées à virgule, et sans marge le cheval pouvait rester planté là)
    // Seulement si on y va tout droit : le paddock agrandi (ou déplacé) peut cacher ce point derrière
    // sa barrière ; nav.js fait alors le tour de l'enclos par le bon coin, puis passe par la porte.
    if (b.aroundSide && p.lz > D + 3 && p.lx < -(W - 1) - 0.3 && p.lx * b.aroundSide < 0) {
      const w = toWorld(b, -(W - 1) * b.aroundSide, D + 9);
      if (!pathBlocked(pos, w)) return navOut.set(w.x, 0, w.z);
    }
    if (p.lz >= D - 0.5) return null; // devant : nav.js fait passer par la porte
    // L'écurie se contourne par le côté opposé au paddock.
    const side = b.aroundSide ?? (Math.sign(p.lx) || 1);
    const mine = Math.sign(p.lx) === side;
    if (mine && Math.abs(p.lx) > W + 1.5) return way(b, { lx: side * (W + 2.5), lz: D + 2.5 }); // le long du bon côté
    if (p.lz < -D - 1.5) return way(b, { lx: side * (W + 2.5), lz: -D - 2.5 }); // derrière
    if (Math.abs(p.lx) > W - 0.5) {
      if (mine) return way(b, { lx: side * (W + 2.5), lz: p.lz }); // on s'écarte du mur
      // Du mauvais côté : vers l'avant si on en est proche, sinon par l'arrière.
      return way(b, p.lz > 0 ? { lx: p.lx, lz: D + 2.5 } : { lx: -side * (W + 2.5), lz: -D - 2.5 });
    }
    return way(b, { lx: side * (W + 2.5), lz: Math.max(-D - 2.5, Math.min(D + 2.5, p.lz)) });
  }
  return null;
}
NAV_HOOKS.push(interiorNav);

// ---------------------------------------------------------------- construction

const DEFS = {
  // aroundSide : côté par où l'on fait le tour (l'écurie touche presque le paddock au nord).
  // (place et longueur de l'écurie : setStableExt, selon sa taille)
  stable: { kind: 'stable', x: -22, z: -2, rot: Math.PI / 2, w: stableWidth(0), d: STABLE_D, top: 5.5, door: 3.2, aroundSide: 1 },
  house: { kind: 'house', x: 0, z: -16, rot: 0, w: HOUSE_W, d: HOUSE_D, top: 5.2, door: 1.6 },
  // Sellerie : à côté de l'écurie, la porte regarde vers la cour.
  tackroom: { kind: 'tackroom', x: TACKROOM.x, z: TACKROOM.z, rot: Math.PI / 2, w: TACK_W, d: TACK_D, top: 4.8, door: 1.6 },
};
let stableExtNow = 0;
const MODELS = {
  stable: () => stableModel(L({ fr: 'Écurie', en: 'Stable' }), stableExtNow),
  house: () => houseModel(t('title')),
  tackroom: () => tackRoomModel(t('bld_tackroom'), t('tk_board')),
};
const ROOMS = { stable: () => stableRooms(stableExtNow), house: houseRooms, tackroom: () => [] };
const HALLS = { stable: () => stableHall(stableExtNow), house: () => HOUSE_HALL, tackroom: () => TACK_HALL };

/**
 * Taille de l'écurie (0 : 8 box, 1 : 12, 2 : 16) : son bout nord reste contre le paddock, elle s'allonge
 * vers le sud et la sellerie recule d'autant. Appelé par Game.loadPlace avant World.build.
 */
export function setStableExt(ext) {
  stableExtNow = ext;
  const r = stableRect(ext);
  Object.assign(DEFS.stable, { x: r.x, z: r.z, w: stableWidth(ext) });
  placeTackRoom(ext);
  Object.assign(DEFS.tackroom, { x: TACKROOM.x, z: TACKROOM.z }); // la sellerie où l'on entre recule aussi
}

/**
 * Ajoute l'écurie et la maison (à la maison seulement) au monde, à la place des anciens bâtiments fermés.
 * Appelé par World.build().
 */
export function buildInteriors(world, group, isHome) {
  world.interiors = {};
  world.camVolumes = [];
  world.cutaway = null;
  active = [];
  for (let i = ENCLOSURES.length - 1; i >= 0; i--) if (ENCLOSURES[i].interior) ENCLOSURES.splice(i, 1);
  if (!isHome) return;
  for (const [id, def] of Object.entries(DEFS)) {
    const model = MODELS[id]();
    const b = {
      id,
      ...def,
      c: Math.cos(def.rot),
      s: Math.sin(def.rot),
      model,
      box: { x0: -def.w / 2, x1: def.w / 2, z0: -def.d / 2, z1: def.d / 2 },
      rooms: ROOMS[id](),
      hall: HALLS[id](),
    };
    b.entry = id === 'stable' ? b.rooms.find((r) => r.id === 'passage') : null;
    const y = world.heightAt(def.x, def.z);
    model.group.position.set(def.x, y, def.z);
    model.group.rotation.y = def.rot;
    model.group.userData.building = id;
    group.add(model.group);
    // Murs : de fins colliders (on entre par les portes).
    const swap = Math.abs(b.s) > 0.5;
    for (const r of model.rects) {
      const w = toWorld(b, r.lx, r.lz);
      world.colliders.push({ x: w.x, z: w.z, hw: swap ? r.hz : r.hx, hd: swap ? r.hx : r.hz, room: id });
    }
    // Le bâtiment devient un « enclos » avec une porte, pour que nav.js fasse passer par l'entrée.
    const side = Math.abs(b.s) > 0.5 ? (b.s > 0 ? '+x' : '-x') : (b.c > 0 ? '+z' : '-z');
    ENCLOSURES.push({
      id, interior: true, x: def.x, z: def.z, hw: (swap ? def.d : def.w) / 2, hd: (swap ? def.w : def.d) / 2,
      gate: { side, at: side.endsWith('x') ? def.z : def.x, width: def.door },
    });
    world.camVolumes.push({ id, x: def.x, z: def.z, hw: (swap ? def.d : def.w) / 2 + 0.3, hd: (swap ? def.w : def.d) / 2 + 0.3, top: y + def.top });
    const door = toWorld(b, 0, def.d / 2 + 1.4);
    world.interactables.push({ kind: def.kind, x: door.x, z: door.z });
    world.interiors[id] = b;
    active.push(b);
  }
}

// ---------------------------------------------------------------- en jeu

const STRAW_FRESH = new THREE.Color(0xe6c86e);
const STRAW_OLD = new THREE.Color(0x8c7448);
const LIGHT_POS = { stable: [0, 0], house: [1.5, 0.5], tackroom: [0, -0.4] };
// De jour, la sellerie n'est éclairée que par la lumière ambiante (le soleil ne passe pas le toit) : le visage
// de la sellière était grisâtre. Une petite lampe douce devant le comptoir, plus faible que celle du soir.
const TACK_DAY_LIGHT = { pos: [1.7, 1.1], y: 2.5, intensity: 3.2 };

// 🎖️ Un flot : une cocarde plissée de la couleur de la place, un cœur crème, deux rubans qui pendent.
const ROSETTE_COLORS = { gold: 0xd8b24a, silver: 0xc4cad1, bronze: 0xb0703c, green: 0x3f8a4a, white: 0xf2efe6, pink: 0xe07aa5 };
let rosetteKit = null;
function rosetteParts() {
  if (rosetteKit) return rosetteKit;
  const m = (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, side: THREE.DoubleSide });
  rosetteKit = {
    disc: new THREE.CylinderGeometry(0.058, 0.058, 0.012, 16),
    heart: new THREE.CylinderGeometry(0.028, 0.028, 0.016, 12),
    tail: new THREE.BoxGeometry(0.026, 0.1, 0.004),
    mats: Object.fromEntries(Object.entries(ROSETTE_COLORS).map(([k, c]) => [k, m(c)])),
    cream: m(0xf4e6c0),
  };
  return rosetteKit;
}
/** Une rangée de flots (repère de la plaque : plan face à +z), sous la plaque. */
function rosetteRow(list) {
  const k = rosetteParts();
  const row = new THREE.Group();
  const gap = 0.145;
  list.forEach((r, i) => {
    const x = (i - (list.length - 1) / 2) * gap;
    const disc = new THREE.Mesh(k.disc, k.mats[r.tier]);
    disc.rotation.x = Math.PI / 2;
    disc.position.set(x, -0.25, 0.032); // (devant la traverse de la porte)
    const heart = new THREE.Mesh(k.heart, k.cream);
    heart.rotation.x = Math.PI / 2;
    heart.position.set(x, -0.25, 0.036);
    row.add(disc, heart);
    for (const s of [-1, 1]) {
      const tail = new THREE.Mesh(k.tail, k.mats[r.tier]);
      tail.position.set(x + s * 0.02, -0.33, 0.028);
      tail.rotation.z = s * 0.18;
      row.add(tail);
    }
  });
  return row;
}

export class Interiors {
  constructor(game) {
    this.game = game;
    this.light = new THREE.PointLight(0xffdcaa, 0, 14, 1.4);
    game.scene.add(this.light);
    this.inside = null;
    this.spots = [];
    this.fx = [];
    this.visAcc = 0;
    this.tmpV = new THREE.Vector3();
  }

  get world() {
    return this.game.world;
  }

  get profile() {
    return this.game.profile;
  }

  get f() {
    return ensureFacilities(this.profile);
  }

  get here() {
    return !!this.world.interiors?.stable;
  }

  /** Chevaux de la maison (où qu'ils soient : un cheval en voyage garde son box). */
  homeHorses() {
    return this.profile.animals.filter((a) => a.species === 'horse' && (a.location === this.profile.home || Number.isInteger(a.box)));
  }

  /** Après World.build() : coins où l'on fait quelque chose, état visuel. */
  onPlaceLoaded() {
    const w = this.world;
    w.stallOf = (a) => this.stallOf(a);
    this.spots = [];
    this.inside = null;
    this.plates = new Map();
    if (!this.here) return;
    const f = this.f;
    const g = this.game;
    const ui = g.ui;
    const st = w.interiors.stable;
    const hs = w.interiors.house;
    const spot = (b, id, obj, lx, lz, icon, label, run, radius = 1) => {
      const p = toWorld(b, lx, lz);
      const s = { kind: 'spot', id, building: b.id, x: p.x, z: p.z, icon, label, run, radius };
      obj.traverse((o) => { o.userData.spot = s; });
      obj.userData.spot = s;
      this.spots.push(s);
      return s;
    };
    st.model.boxes.forEach((box) => {
      spot(st, `box${box.i}`, box.group, box.inner.lx, box.inner.lz, '🐴', () => this.boxLabel(box.i), () => ui.openBox(box.i), 0.8);
    });
    const S = st.model.spots;
    spot(st, 'tack', S.tack.obj, S.tack.lx, S.tack.lz, '🏇', () => t('fac_spot_tack'), () => ui.openTack());
    spot(st, 'hay', S.hay.obj, S.hay.lx, S.hay.lz, '🌾', () => t('fac_spot_hay'), () => ui.groupCareWithGame((a) => a.species === 'horse', 'feed'));
    spot(st, 'water', S.water.obj, S.water.lx, S.water.lz, '💧', () => t('fac_spot_water'), () => ui.groupCareWithGame((a) => a.species === 'horse', 'water'));
    spot(st, 'broom', S.broom.obj, S.broom.lx, S.broom.lz, '🧹', () => t('fac_spot_sweep'), () => this.chore('sweep'));
    const H = hs.model.spots;
    spot(hs, 'living', H.living.obj, H.living.lx, H.living.lz, '🧽', () => t('fac_spot_living'), () => this.chore('living'));
    spot(hs, 'bowls', H.bowls.obj, H.bowls.lx, H.bowls.lz, '🥣', () => t('do_feedPets'), () => ui.groupCareWithGame((a) => ['dog', 'cat', 'rabbit'].includes(a.species), 'feed'));
    spot(hs, 'basket', H.basket.obj, H.basket.lx, H.basket.lz, '🧺', () => t('fac_spot_basket'), () => this.callPets());
    spot(hs, 'kitchen', H.kitchen.obj, H.kitchen.lx, H.kitchen.lz, '🍽️', () => t('fac_spot_kitchen'), () => this.chore('kitchen'));
    spot(hs, 'bed', H.bed.obj, H.bed.lx, H.bed.lz, '🛏️', () => t('fac_spot_bed'), () => ui.openBed());
    spot(hs, 'wardrobe', H.wardrobe.obj, H.wardrobe.lx, H.wardrobe.lz, '👕', () => t('fac_spot_wardrobe'), () => ui.showAvatarEditor(g.profile, () => ui.clearScreen()));
    // Sellerie : chaque objet exposé ouvre sa fiche ; le comptoir, le coffre et le chevalet de nettoyage.
    const tk = w.interiors.tackroom;
    if (tk) {
      for (const d of tk.model.displays.values()) {
        // Le bouton d'action dit aussi le prix (ou « À toi ») : lisible même sur un petit écran.
        const label = () => (this.tackLines?.get(d.id) ? `${t(`gear_${d.id}`)} · ${this.tackLines.get(d.id)}` : t(`gear_${d.id}`));
        spot(tk, `tk_${d.id}`, d.obj, d.stand[0], d.stand[1], GEAR[d.id].emoji, label, () => ui.openTackItem(d.id), 0.6);
      }
      const T = tk.model.spots;
      spot(tk, 'tk_counter', T.counter.obj, T.counter.lx, T.counter.lz, '🛒', () => t('tk_spot_counter'), () => ui.openTack(), 0.7);
      spot(tk, 'tk_chest', T.chest.obj, T.chest.lx, T.chest.lz, '🧰', () => t('tk_spot_chest'), () => ui.openTack({ tab: 'mine' }), 0.7);
      spot(tk, 'tk_clean', T.clean.obj, T.clean.lx, T.clean.lz, '🧽', () => t('tk_spot_clean'), () => this.cleanTack(), 0.7);
    }
    // Les chevaux sans box en reçoivent un (s'il en reste).
    for (const a of this.homeHorses()) assignBox(f, this.homeHorses(), a);
    this.refreshVisuals();
  }

  boxLabel(i) {
    if (i >= boxCount(this.f)) return t('fac_boxLocked');
    const a = this.boxOccupant(i);
    return a ? t('fac_boxOf', { name: a.name }) : t('fac_boxEmpty', { n: i + 1 });
  }

  /** Le cheval qui habite ce box (null s'il est vide). */
  boxOccupant(i) {
    return boxOccupants(this.f, this.homeHorses())[i] ?? null;
  }

  /** Zone de vie d'un cheval rentré : son box (null s'il n'est pas rentré). */
  stallOf(a) {
    if (!a.stalled || !Number.isInteger(a.box) || a.location !== this.profile?.home || !this.here) return null;
    const st = this.world.interiors.stable;
    const box = st.model.boxes[a.box];
    if (!box) return null;
    const p = toWorld(st, box.center.lx, box.center.lz);
    return { x: p.x, z: p.z, r: 0.5 };
  }

  /** Le point (x, z) est-il dans ce bâtiment ? Renvoie la pièce ('hall' pour l'allée ou le salon). */
  roomAt(id, x, z) {
    const b = this.world.interiors?.[id];
    if (!b) return null;
    const p = toLocal(b, x, z);
    if (!inRect(b.box, p)) return null;
    return roomOf(b, p)?.id ?? 'hall';
  }

  // ------------------------------------------------------------ chevaux au box

  /** Rentre un cheval dans son box. wanted : un box précis (sinon le sien ou le premier libre). */
  stall(a, wanted = null, quiet = false) {
    const box = assignBox(this.f, this.homeHorses(), a, wanted);
    if (box === null) {
      if (!quiet) this.game.ui.toast(t('fac_noBox', { name: a.name, g: a.sex }), 5000);
      return false;
    }
    a.stalled = true;
    a.following = false;
    delete a.zone;
    const e = this.game.entities.get(a.id);
    const home = this.stallOf(a);
    if (e && home && !e.ridden) {
      e.state = 'walk';
      e.target.set(home.x, 0, home.z);
      e.timer = 90;
      e.partner = null;
    }
    if (!quiet) this.game.ui.toast(t('fac_toBox', { name: a.name, g: a.sex, n: box + 1 }));
    this.refreshVisuals();
    return true;
  }

  /** « Rentrer les chevaux » : chacun va dans son box. */
  stallAll() {
    const horses = this.game.animalsHere().filter((a) => a.species === 'horse');
    if (!this.here || !horses.length) return this.game.ui.toast(t('nobody'));
    const full = [];
    let n = 0;
    for (const a of horses) {
      if (this.game.entities.get(a.id)?.ridden) continue;
      if (this.stall(a, null, true)) n++;
      else full.push(a.name);
    }
    this.game.ui.toast(n ? t('fac_toBoxes', { n }) : t('nobody'));
    if (full.length) this.game.ui.toast(t('fac_noBoxFor', { names: full.join(', ') }), 6000);
    return n;
  }

  /** Sort un cheval de son box (il garde son box pour la prochaine fois). */
  unstall(a, where = 'paddock') {
    a.stalled = false;
    const e = this.game.entities.get(a.id);
    if (e && !e.ridden) {
      e.state = 'walk';
      e.target.set(HOME.horse.x + (Math.random() - 0.5) * 6, 0, HOME.horse.z + (Math.random() - 0.5) * 6);
      e.timer = 60;
    }
    if (where) this.game.ui.toast(t('fac_toPaddock', { name: a.name, g: a.sex }));
    this.refreshVisuals();
  }

  /** Le cheval est-il vraiment dans son box (et pas en chemin) ? */
  inBox(a) {
    const home = this.stallOf(a);
    const e = this.game.entities.get(a.id);
    return !!(home && e && Math.hypot(e.position.x - home.x, e.position.z - home.z) < 1.5);
  }

  // ------------------------------------------------------------ corvées

  /** Une corvée (curer, balayer, ranger…). Son mini-jeu passe par ui.choreWithGame. */
  async chore(kind, target = null) {
    const g = this.game;
    // Déjà propre, box fermé, pas assez d'argent : on le dit tout de suite, sans faire jouer pour rien.
    const pre = canChore(g.profile, kind, target);
    if (!pre.ok) {
      g.ui.toast(t(`fac_r_${pre.reason}`));
      return pre;
    }
    const quality = await g.ui.choreWithGame(kind, target);
    if (quality === null || quality === false || !g.profile) return null;
    const r = doChore(g.profile, kind, target);
    if (!r.ok) {
      g.ui.toast(t(`fac_r_${r.reason}`));
      return r;
    }
    // On enlève aussi les crottins qui traînent là où on nettoie.
    if (kind === 'muck' || kind === 'sweep') {
      const st = this.world.interiors.stable;
      const rects = kind === 'muck' ? [st.rooms[target]] : [st.hall, st.rooms.find((x) => x.id === 'passage')];
      const ids = droppingsAt(g.profile, g.profile.place).filter((d) => {
        const p = toLocal(st, d.x, d.z);
        return rects.some((rc) => inRect(rc, p, -0.2));
      }).map((d) => d.id);
      if (ids.length) g.scoop(ids);
    }
    addStat(g.profile, 'chores');
    g.xp('care');
    const s = this.spots.find((x) => x.id === (kind === 'muck' || kind === 'straw' ? `box${target}` : { sweep: 'broom', fold: null }[kind] ?? kind));
    if (s) this.sparkle(s.x, s.z, kind === 'straw' ? '🌾' : '✨');
    g.ui.toast(t(`fac_done_${kind}`), 3500);
    this.refreshVisuals();
    g.ui.refresh();
    return r;
  }

  /** Les chiens et les chats viennent au panier. */
  callPets() {
    const pets = this.game.animalsHere().filter((a) => a.species === 'dog' || a.species === 'cat');
    if (!pets.length) return this.game.ui.toast(t('nobody'));
    const s = this.spots.find((x) => x.id === 'basket');
    for (const a of pets) {
      const e = this.game.entities.get(a.id);
      if (!e || e.ridden) continue;
      e.state = 'walk';
      e.target.set(s.x + (Math.random() - 0.5), 0, s.z + (Math.random() - 0.5));
      e.timer = 20;
      e.emit('💕', 1);
    }
    this.game.ui.toast(t('fac_petsCome'));
  }

  sparkle(x, z, emoji = '✨') {
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji), transparent: true, depthWrite: false }));
      s.position.set(x + (Math.random() - 0.5) * 1.2, 0.4, z + (Math.random() - 0.5) * 1.2);
      s.scale.setScalar(0.45);
      s.userData = { life: 1.3 + i * 0.2 };
      this.game.scene.add(s);
      this.fx.push(s);
    }
  }

  /** Quand on cure l'enclos de la bergerie, l'abri est propre aussi. */
  zoneCleaned(id) {
    if (id === 'pen') {
      this.f.pen.rooms.fold = 100;
    }
  }

  // ------------------------------------------------------------ simulation

  /** Le temps passe pour les bâtiments (appelé par Game.farmTick, en direct ou quand on saute du temps). */
  farmTick(here, hours) {
    if (!this.profile || this.profile.place !== this.profile.home || !this.here) return;
    const f = this.f;
    const p = this.profile;
    const helper = (type) => p.helpers.some((h) => h.type === type && h.place === p.place);
    const stalledHorses = here.filter((a) => a.species === 'horse' && a.stalled && Number.isInteger(a.box));
    tickFacilities(f, hours, {
      stalled: stalledHorses.map((a) => a.box),
      horses: here.filter((a) => a.species === 'horse').length,
      pets: here.filter((a) => a.species === 'dog' || a.species === 'cat').length,
      livestock: here.filter((a) => SPECIES[a.species].livestock).length,
      helpers: { stable: helper('groom'), house: helper('petsitter'), pen: helper('shepherd') },
    });
    const cold = this.game.temperature < 5;
    for (const a of stalledHorses) applyStallEffects(f, a, hours, { cold });
  }

  /** Saleté ressentie par l'animal à cause de son bâtiment (s'ajoute aux crottins autour de lui). */
  dirtFor(a) {
    if (!this.profile || a.location !== this.profile.home || !this.here) return 0;
    const f = this.f;
    if (a.species === 'horse') return stallDirt(f, a);
    if (a.species === 'dog' || a.species === 'cat') return houseDirt(f) * 0.5;
    if (SPECIES[a.species].livestock && (a.zone ?? 'pen') === 'pen') return penDirt(f);
    return 0;
  }

  /** À l'abri dans son box, un cheval ne sent ni la pluie, ni la neige, ni les mouches. */
  feltWeather(a, weather) {
    if (a.species !== 'horse' || !this.inBox(a)) return weather;
    return ['rain', 'storm', 'snow', 'flies'].includes(weather) ? 'clear' : weather;
  }

  // ------------------------------------------------------------ rendu

  update(dt) {
    for (let i = this.fx.length - 1; i >= 0; i--) {
      const s = this.fx[i];
      s.userData.life -= dt;
      s.position.y += dt * 0.8;
      s.material.opacity = Math.min(1, s.userData.life);
      if (s.userData.life <= 0) {
        this.game.scene.remove(s);
        s.material.dispose();
        this.fx.splice(i, 1);
      }
    }
    if (!this.here || !this.profile) {
      this.light.intensity = 0;
      return;
    }
    const w = this.world;
    const pp = this.game.player.position;
    let inside = null;
    for (const b of active) {
      if (inRect(b.box, toLocal(b, pp.x, pp.z), 0.05)) inside = b.id;
    }
    if (inside !== this.inside) {
      // Le bouton d'action ne propose que les coins du bâtiment où l'on est.
      w.interactables = w.interactables.filter((i) => i.kind !== 'spot').concat(this.spots.filter((s) => s.building === inside));
      if (inside === 'tackroom') this.faceTackWall(); // comme dans un magasin : on voit tout de suite les selles
    }
    this.inside = inside;
    this.turnCamera(dt);
    // Vue en coupe : sans toit ni haut des murs quand on est dedans (en 3ᵉ personne).
    const cut = inside && this.game.rig.mode === 'third' ? inside : null;
    if (cut !== w.cutaway) {
      if (w.cutaway) this.setUpperHidden(w.interiors[w.cutaway], false);
      if (cut) this.setUpperHidden(w.interiors[cut], true);
      w.cutaway = cut;
    }

    // Portes : elles ne s'ouvrent que si quelqu'un essaie vraiment de passer
    // (il avance vers la porte, ou il est en train de la franchir), puis se referment.
    const pl = this.game.player;
    const movers = [{ p: pp, heading: pl.heading, speed: pl.speed },
      ...[...this.game.entities.values()].filter((e) => !e.sleeping).map((e) => ({ p: e.position, heading: e.heading, speed: e.speed }))];
    const wants = (b, lx, lz, r) => {
      const d = toWorld(b, lx, lz);
      return movers.some((m) => {
        const dx = d.x - m.p.x;
        const dz = d.z - m.p.z;
        const dist = Math.hypot(dx, dz);
        if (dist < 0.9) return true; // en train de passer
        if (dist > r || m.speed < 0.2) return false;
        return (Math.sin(m.heading) * dx + Math.cos(m.heading) * dz) / dist > 0.6; // va vers la porte
      });
    };
    this.doorHold = this.doorHold ?? new Map();
    const hold = (key, now) => {
      const left = now ? 1.2 : Math.max(0, (this.doorHold.get(key) ?? 0) - dt);
      this.doorHold.set(key, left);
      return left > 0;
    };
    const st = w.interiors.stable;
    for (const box of st.model.boxes) {
      const open = box.i < boxCount(this.f) && hold(`box${box.i}`, wants(st, box.door.lx, box.door.lz, 1.9));
      const want = open ? -box.sign * 1.75 : 0;
      box.hinge.rotation.y += (want - box.hinge.rotation.y) * Math.min(1, dt * 5);
    }
    const hs = w.interiors.house;
    const hd = hs.model.doorHinge;
    const wantH = hold('house', wants(hs, 0, HOUSE_D / 2, 2.2)) ? 1.5 : 0;
    hd.rotation.y += (wantH - hd.rotation.y) * Math.min(1, dt * 5);
    // Sellerie : porte, la sellière qui regarde le joueur quand il entre.
    const tk = w.interiors.tackroom;
    if (tk) {
      // Mobilier et objets exposés : seulement dedans ou près de la porte (budget de triangles).
      const near = inside === 'tackroom' || Math.hypot(pp.x - tk.x, pp.z - tk.z) < 16;
      tk.model.setDetail(near);
      const td = tk.model.doorHinge;
      const wantT = hold('tackroom', wants(tk, 0, TACK_D / 2, 2.2)) ? 1.45 : 0;
      td.rotation.y += (wantT - td.rotation.y) * Math.min(1, dt * 5);
      const sl = tk.model.seller;
      let look = 0;
      if (inside === 'tackroom') {
        const q = sl.root.worldToLocal(this.tmpV.set(pp.x, pp.y + 1.4, pp.z));
        look = Math.max(-0.9, Math.min(0.9, Math.atan2(q.x, q.z)));
      }
      sl.head.rotation.y += (look - sl.head.rotation.y) * Math.min(1, dt * 3);
      sl.torso.rotation.x = Math.sin(performance.now() / 900) * 0.012;
    }
    // Robot aspirateur.
    if (hs.model.robot.visible) {
      const tt = performance.now() / 4000;
      hs.model.robot.position.set(1.8 + Math.cos(tt) * 1.6, 0.18, 1.5 + Math.sin(tt * 1.3) * 1.2);
    }

    // Lumières la nuit : la maison est toujours éclairée, l'écurie seulement avec l'éclairage acheté.
    const night = isNight(this.profile.clock);
    const stableLit = night && hasUpgrade(this.f, 'stable', 'lights');
    st.model.lampMat.emissiveIntensity = stableLit ? 1.5 : 0;
    st.model.glass.emissiveIntensity = stableLit ? 1.2 : 0;
    hs.model.lampMat.emissiveIntensity = night ? 1.5 : 0.2;
    if (tk) tk.model.lampMat.emissiveIntensity = night ? 1.6 : 0.25;
    const lit = inside && night && (inside === 'house' || inside === 'tackroom' || stableLit);
    const dayLit = inside === 'tackroom' && !night && !!tk; // petite lumière de jour (TACK_DAY_LIGHT)
    this.light.intensity = lit ? 9 : dayLit ? TACK_DAY_LIGHT.intensity : 0;
    if (lit || dayLit) {
      const b = w.interiors[inside];
      const [lx, lz] = dayLit ? TACK_DAY_LIGHT.pos : LIGHT_POS[inside];
      const p = toWorld(b, lx, lz);
      this.light.position.set(p.x, w.heightAt(p.x, p.z) + (dayLit ? TACK_DAY_LIGHT.y : 2.6), p.z);
    }

    this.visAcc += dt;
    if (this.visAcc > 1) {
      this.visAcc = 0;
      this.refreshVisuals();
    }
  }

  setUpperHidden(b, hidden) {
    b.model.upper.traverse((o) => {
      o.layers.set(hidden ? 1 : 0); // calque 1 : ni dessiné, ni touché par le rayon du doigt
    });
    b.model.upper.visible = !hidden;
  }

  /** Met à jour ce qu'on voit : paille, saleté, plaques des box, améliorations. */
  refreshVisuals() {
    if (!this.here || !this.profile) return;
    const f = this.f;
    const st = this.world.interiors.stable;
    const n = boxCount(f);
    const occ = boxOccupants(f, this.homeHorses());
    const waterers = hasUpgrade(f, 'stable', 'waterers');
    for (const box of st.model.boxes) {
      const locked = box.i >= n;
      const s = f.boxes[box.i];
      const sp = this.spots.find((x) => x.id === `box${box.i}`);
      if (sp) sp.icon = locked ? '🔒' : '🐴';
      box.storage.visible = locked;
      box.straw.visible = !locked;
      box.hay.parent.visible = !locked;
      box.waterer.visible = !locked && waterers;
      box.strawMat.color.copy(STRAW_OLD).lerp(STRAW_FRESH, s.straw / 100);
      box.tuftMat.color.copy(box.strawMat.color).offsetHSL(0, 0, -0.04);
      box.group.children.forEach((c) => {
        if (c.geometry?.type === 'SphereGeometry' && c.userData.box === box.i && c !== box.waterer) c.visible = !locked;
      });
      box.stains.forEach((m, k) => { m.visible = !locked && 100 - s.clean > 15 + k * 20; });
      const text = locked ? '🔒' : occ[box.i]?.name ?? '—';
      if (text !== box.plateText) {
        box.plateText = text;
        box.plate.material.map?.dispose();
        box.plate.material.map = plateTexture(text);
        box.plate.material.needsUpdate = true;
      }
      // 🎖️ Ses flots de concours, sous la plaque (les meilleurs d'abord)
      const ros = !locked && occ[box.i] ? rosettesOf(this.profile, occ[box.i].id) : [];
      const rosKey = ros.map((r) => r.tier).join(',');
      if (rosKey !== (box.rosKey ?? '')) {
        box.rosKey = rosKey;
        box.rosettes?.removeFromParent();
        box.rosettes = ros.length ? rosetteRow(ros) : null;
        if (box.rosettes) box.plate.add(box.rosettes);
      }
    }
    const aisle = f.stable.rooms.aisle;
    for (const m of st.model.spots.aisle.obj.children) m.visible = 100 - aisle > m.userData.threshold;

    const hs = this.world.interiors.house.model;
    for (const [room, grp] of Object.entries(hs.dirt)) {
      const dirt = 100 - f.house.rooms[room];
      for (const m of grp.children) m.visible = dirt > m.userData.threshold;
    }
    this.refreshTack();
    const messy = f.house.rooms.bedroom < 55;
    hs.blanket.rotation.y = messy ? 0.35 : 0;
    hs.blanket.position.x = messy ? -3.2 : -3.4;
    hs.blanket.scale.y = messy ? 2.2 : 1;
    hs.heaters.visible = hasUpgrade(f, 'house', 'heater');
    hs.robot.visible = hasUpgrade(f, 'house', 'vacuum');
    const fancy = hasUpgrade(f, 'house', 'basket');
    hs.cushion.material.color.setHex(fancy ? 0xc2405a : 0x8fb3cf);
    hs.basket.scale.setScalar(fancy ? 1.25 : 1);
  }

  /**
   * Sellerie : chaque objet exposé montre son prix, ou « À toi » s'il est rangé là,
   * ou le nom de l'animal qui le porte (le support est alors vide).
   */
  refreshTack() {
    const tk = this.world.interiors?.tackroom;
    if (!tk || !this.profile) return;
    const p = this.profile;
    const sandbox = isSandbox(p);
    const list = [];
    for (const d of tk.model.displays.values()) {
      const id = d.id;
      const def = GEAR[id];
      const own = ownedVariant(p, id);
      const wearers = def.sizes ? def.sizes.flatMap((sz) => wornBy(p, id, sz)) : wornBy(p, id, defaultSize(id));
      const onHead = def.type === 'helmet' && p.rider?.helmet?.item === id ? 1 : 0;
      const free = own - wearers.length - onHead;
      const pref = p.tackColors?.[id];
      const st = { id, name: t(`gear_${id}`), color: def.colors?.includes(pref) ? pref : def.colors?.[0], visible: true };
      if (own <= 0) {
        st.line = sandbox ? `🎁 ${t('tk_free')}` : `${gearPrice(id)} 🪙`;
        st.tone = 'price';
      } else if (free > 0) {
        st.line = free > 1 ? `${t('tk_tagMine')} ×${free}` : t('tk_tagMine');
        st.tone = 'mine';
      } else {
        // Tout est porté : le support reste vide, l'étiquette dit qui l'a.
        const who = wearers[0];
        st.line = onHead ? t('tk_tagHead') : t('tk_tagOn', { name: who?.name ?? '', emoji: SPECIES[who?.species]?.emoji ?? '🐴' });
        st.tone = 'worn';
        st.visible = false;
      }
      list.push(st);
    }
    tk.model.applyDisplays(list);
    this.tackLines = new Map(list.map((x) => [x.id, x.line]));
  }

  /**
   * En entrant dans la sellerie : la caméra se tourne doucement vers le mur des selles (vers -X local,
   * un peu vers les filets) et se rapproche. snap : tout de suite (arrivée par « Entrer »).
   */
  faceTackWall(snap = false) {
    const b = this.world.interiors?.tackroom;
    const rig = this.game.rig;
    if (!b || rig.mode !== 'third') return;
    const lx = -1;
    const lz = -0.12;
    const yaw = Math.atan2(lx * b.c + lz * b.s, -lx * b.s + lz * b.c); // direction (lx, lz) du bâtiment, dans le monde
    this.camTurn = { yaw, dist: Math.min(rig.dist, 4.3), pitch: 0.48, t: snap ? 0 : 1.2 };
    if (snap) {
      this.game.player.heading = yaw; // le personnage regarde les selles, lui aussi
      this.turnCamera(1);
    }
  }

  turnCamera(dt) {
    const c = this.camTurn;
    if (!c) return;
    const rig = this.game.rig;
    const k = c.t <= 0 ? 1 : Math.min(1, dt * 3);
    rig.yaw += Math.atan2(Math.sin(c.yaw - rig.yaw), Math.cos(c.yaw - rig.yaw)) * k;
    rig.dist += (c.dist - rig.dist) * k;
    rig.pitch += (c.pitch - rig.pitch) * k;
    c.t -= dt;
    if (c.t <= 0) this.camTurn = null;
  }

  /** Nettoyer et graisser le cuir (chevalet de la sellerie) : tous les 2 jours. */
  async cleanTack() {
    const g = this.game;
    if (g.day - (g.profile.tackCleanedDay ?? -99) < 2) return g.ui.toast(t('why_tackClean'));
    const q = await g.ui.choreWithGame('tack');
    if (q === null || q === false || !g.profile) return;
    g.cleanTack();
    const s = this.spots.find((x) => x.id === 'tk_clean');
    if (s) this.sparkle(s.x, s.z, '✨');
  }

  // ------------------------------------------------------------ toucher l'écran

  /**
   * Toucher dans un bâtiment : un coin de corvée → on y va et on le fait ;
   * le sol quand on est dedans → on y marche ; le bâtiment vu du dehors → sa porte et son menu.
   * Renvoie vrai si le toucher est pris en charge.
   */
  onTap(hit) {
    if (!this.here || !hit) return false;
    let o = hit.object;
    let spotObj = null;
    while (o) {
      if (!spotObj && o.userData.spot) spotObj = o.userData.spot;
      if (o.userData.building) break;
      o = o.parent;
    }
    if (!o) return false;
    const id = o.userData.building;
    const g = this.game;
    if (spotObj) {
      g.walkTo(new THREE.Vector3(spotObj.x, 0, spotObj.z), spotObj.radius, () => spotObj.run());
      return true;
    }
    if (this.inside === id) {
      g.walkTo(hit.point, 0.5);
      return true;
    }
    const door = this.world.interactables.find((i) => i.kind === DEFS[id].kind);
    g.walkTo(new THREE.Vector3(door.x, 0, door.z), 1.2, () => g.ui.openBuilding(DEFS[id].kind));
    return true;
  }

  /** « Entrer » : le joueur va au milieu de l'allée ou du salon. */
  enter(kind) {
    const b = this.world.interiors?.[kind];
    if (!b) return;
    const lx = (b.hall.x0 + b.hall.x1) / 2;
    const lz = (b.hall.z0 + b.hall.z1) / 2;
    // (sellerie : on s'arrête au milieu, face au mur des selles)
    const p = toWorld(b, kind === 'house' ? lx : kind === 'tackroom' ? -0.5 : 0, kind === 'tackroom' ? -0.3 : lz);
    this.game.walkTo(new THREE.Vector3(p.x, 0, p.z), 0.6, kind === 'tackroom' ? () => this.faceTackWall(true) : undefined);
  }
}

// 🍀 Le fer porte-bonheur du jour (src/sim/luckyShoes.js) : un vieux fer posé au bord du chemin de balade, qui brille
// toutes les 2 secondes pour qu'on le voie de loin ; ramassé à cheval, il est cloué sur la porte du box du cheval
// qu'on montait, sous ses flots. Seulement à la ferme, le tutoriel fini, avec un cheval à toi. Mis à jour avec les
// citrouilles (Game.frame).

import * as THREE from 'three';
import { t } from '../i18n.js';
import { earn, addStat, isSandbox } from '../sim/profile.js';
import { bondStage, canRide } from '../sim/animal.js';
import { boxOccupants } from '../sim/facilities.js';
import { keepsMemories } from '../sim/memories.js'; // (tes chevaux : pas ceux qu'on te confie)
import { LUCKY, SHOE_KINDS, SHOE_SHAPES, dayKey, shoeOfDay, findShoe } from '../sim/luckyShoes.js';
import { audio } from './audio.js';

const R = 0.075; // (le rayon d'un fer de taille 1 : 15 cm de large)
const TUBE = 0.016;
const ON_GROUND = 2.4; // (posé par terre : agrandi, pour qu'on le voie à cheval)
const ON_DOOR = 0.55; // (sur la porte du box, sous les flots)

/** Le milieu de la barre à l'angle a : en haut, les branches s'allongent et restent écartées (un U, pas un C). */
function bend(a) {
  const c = Math.cos(a);
  const sn = Math.sin(a);
  return sn > 0 ? [R * c * (1 + 0.2 * sn), R * sn * 1.25] : [R * c, R * sn];
}

/** Un fer : un anneau ouvert (les talons en haut, +y ; la pince en bas), aplati comme une vraie barre de fer. */
function shoeGeometry({ s = 1, sx = 1, sz = 1, toe = 0, closed = false }) {
  const geo = new THREE.TorusGeometry(R, TUBE, 6, 18, closed ? Math.PI * 2 : Math.PI * 1.6);
  geo.rotateZ(Math.PI * 0.7); // (l'ouverture, centrée à 1,8π, passe en haut)
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const a = Math.atan2(p.getY(i), p.getX(i));
    const [bx, by] = bend(a);
    const x = bx + p.getX(i) - R * Math.cos(a);
    const y = by + p.getY(i) - R * Math.sin(a);
    const pinch = 1 - toe * Math.max(0, -y / (R + TUBE)); // (fer de derrière : la pince plus pointue)
    p.setXYZ(i, x * sx * pinch * s, y * sz * s, p.getZ(i) * 0.55 * s);
  }
  geo.computeVertexNormals();
  return geo;
}

/** L'étincelle : une étoile à 4 branches, dorée (64 px). */
function glintTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const glow = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  glow.addColorStop(0, 'rgba(255, 255, 255, 1)');
  glow.addColorStop(0.2, 'rgba(255, 238, 170, 0.85)');
  glow.addColorStop(1, 'rgba(255, 210, 90, 0)');
  x.fillStyle = glow;
  x.beginPath();
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2;
    if (!k) x.moveTo(32 + Math.cos(a) * 31, 32 + Math.sin(a) * 31);
    const m = a + Math.PI / 4;
    const b = a + Math.PI / 2;
    x.quadraticCurveTo(32 + Math.cos(m) * 4, 32 + Math.sin(m) * 4, 32 + Math.cos(b) * 31, 32 + Math.sin(b) * 31);
  }
  x.fill();
  x.beginPath();
  x.arc(32, 32, 7, 0, Math.PI * 2);
  x.fill();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// (partagés : une forme par fer, deux métaux, un crampon ; l'étincelle, à la première pose)
let kit = null;
let glintMat = null;
function shoeKit() {
  if (kit) return kit;
  kit = {
    geos: Object.fromEntries(SHOE_KINDS.map((k) => [k, shoeGeometry(SHOE_SHAPES[k])])),
    stud: new THREE.CylinderGeometry(0.011, 0.013, 0.024, 6),
    iron: new THREE.MeshStandardMaterial({ color: 0x55595f, metalness: 0.7, roughness: 0.45 }),
    alu: new THREE.MeshStandardMaterial({ color: 0xd0d4da, metalness: 0.7, roughness: 0.45 }),
  };
  return kit;
}

/** Un fer de cette sorte, debout dans le plan xy (face à +z), les talons en haut. */
function shoeModel(kind) {
  const k = shoeKit();
  const sh = SHOE_SHAPES[kind];
  const mat = sh.metal === 'alu' ? k.alu : k.iron;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(k.geos[kind], mat));
  if (sh.studs) {
    // (deux crampons d'acier vissés aux talons, au bout des branches : clairs, pour qu'on les voie)
    for (const a of [Math.PI * 0.7, Math.PI * 0.3]) {
      const st = new THREE.Mesh(k.stud, k.alu);
      st.rotation.x = Math.PI / 2;
      const [x, y] = bend(a);
      st.position.set(x * sh.s * (sh.sx ?? 1), y * sh.s * (sh.sz ?? 1), TUBE * 0.55 * sh.s + 0.01);
      g.add(st);
    }
  }
  return g;
}

/** Sa largeur sur la porte (pour les ranger côte à côte). */
const doorWidth = (kind) => 2 * (R + TUBE) * SHOE_SHAPES[kind].s * (SHOE_SHAPES[kind].sx ?? 1) * ON_DOOR;

export class LuckyShoes {
  constructor(game) {
    this.game = game;
    this.key = null; // (partie, lieu, jour du fer posé)
    this.item = null; // { kind, model, glint, found, pop }
    this.acc = 1;
    this.time = 0;
    this.prof = null;
    this.where = null;
    this.toldKey = null;
    this.footKey = null;
  }

  /** Pose le fer du jour (ou le retire) : une autre partie, un autre lieu, un autre jour. */
  sync() {
    const g = this.game;
    const p = g.profile;
    this.prof = p;
    this.where = p?.place;
    // (un cheval à toi, ici, assez grand pour être monté : sinon, rien à ramasser)
    const on = !!p && g.isHome && p.tutorial?.done !== false
      && p.animals.some((a) => keepsMemories(a) && a.location === p.place && canRide(a).reason !== 'tooYoung');
    const key = on ? `${p.id}:${p.place}:${dayKey()}` : null;
    if (key === this.key) return;
    this.key = key;
    this.item?.model.removeFromParent();
    this.item = null;
    if (!on) return;
    const day = shoeOfDay(p);
    if (!day) return; // (déjà ramassé aujourd'hui)
    glintMat ??= new THREE.SpriteMaterial({ map: glintTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    // (pas dans l'eau, ni dans un bâtiment : comme les citrouilles, de l'autre côté du chemin, sinon sur le chemin)
    const blocked = (x, z) => !!g.world.isWater?.(x, z)
      || Object.keys(g.world.interiors ?? {}).some((id) => g.interiors?.roomAt?.(id, x, z));
    const s = day.spot;
    const cp = { x: 2 * s.cx - s.x, z: 2 * s.cz - s.z };
    const at = [s, cp].find((q) => !blocked(q.x, q.z)) ?? { x: s.cx, z: s.cz };
    const model = new THREE.Group();
    const shoe = shoeModel(day.kind);
    shoe.rotation.x = -Math.PI / 2; // (couché par terre)
    shoe.scale.setScalar(ON_GROUND);
    shoe.position.y = 0.03;
    model.add(shoe);
    const glint = new THREE.Sprite(glintMat);
    glint.position.y = 0.14;
    glint.scale.setScalar(0.2);
    model.add(glint);
    model.position.set(at.x, g.world.heightAt(at.x, at.z), at.z);
    model.rotation.y = Math.atan2(s.x - s.cx, s.z - s.cz) + 0.6; // (un peu de travers, comme tombé d'un sabot)
    g.scene.add(model);
    this.item = { kind: day.kind, model, glint, found: false, pop: 0 };
  }

  update(dt) {
    const g = this.game;
    this.acc += dt;
    // (le jour, le tutoriel, un cheval à toi et les portes des box : une fois par seconde ; un autre lieu : tout de suite)
    if (this.acc >= 1 || g.profile !== this.prof || g.profile?.place !== this.where) {
      this.acc = 0;
      this.sync();
      this.decorate();
    }
    const it = this.item;
    if (!it) return;
    if (it.pop > 0) {
      // (ramassé : il saute en tournant et disparaît)
      it.pop = Math.max(0, it.pop - dt * 2.5);
      it.model.position.y += dt * 1.6;
      it.model.rotation.y += dt * 9;
      it.model.scale.setScalar(Math.max(0.01, it.pop));
      if (!it.pop) it.model.visible = false;
      return;
    }
    if (it.found) return;
    // (une activité qui mène le cheval ailleurs, un voyage : caché ; la balade, elle, passe à côté)
    const busy = (g.activities.active && g.activities.type !== 'trail') || g.tripFlow?.active;
    it.model.visible = !busy;
    if (busy) return;
    this.time += dt;
    it.glint.scale.setScalar(0.2 + 0.6 * Math.abs(Math.sin((Math.PI * this.time) / 2)) ** 12); // (un éclat toutes les 2 s)
    const pl = g.player;
    const own = keepsMemories(pl.mount?.data); // (un cheval de client ou invité : le fer reste par terre pour le tien)
    if (own && this.toldKey !== this.key) {
      this.toldKey = this.key; // (la première fois en selle, ce jour-là)
      g.ui.toast(t('ls_today'), 6000);
    }
    const p = pl.root.position;
    if (Math.hypot(it.model.position.x - p.x, it.model.position.z - p.z) > LUCKY.reach) return;
    if (!own) {
      if (this.footKey !== this.key) {
        this.footKey = this.key; // (une fois par jour et par partie)
        g.ui.toast(t('ls_onFoot'), 5000);
      }
      return;
    }
    this.collect();
  }

  /** Le fer ramassé à cheval. */
  collect() {
    const g = this.game;
    const p = g.profile;
    const it = this.item;
    const e = g.player.mount;
    const a = e?.data;
    const r = findShoe(p, new Date(), a?.id ?? null);
    it.found = true;
    it.pop = 1;
    if (!r) return; // (déjà ramassé aujourd'hui, ailleurs)
    addStat(p, 'luckyShoes');
    e?.emit('🍀', 3);
    audio.ui('coin');
    const coins = r.coins && !isSandbox(p) ? r.coins : 0;
    if (coins) earn(p, coins);
    const money = coins ? ` +${coins} 🪙` : '';
    const what = t(`ls_kind_${r.kind}`);
    if (!r.isNew) g.ui.toast(`${t('ls_again')} ${what}${money}`, 5000);
    else g.ui.toast(`${t('ls_found', { what, n: r.n, total: r.total })}${r.complete ? '' : money}`, 6000);
    if (r.complete) {
      // Les 7 : un peu de lien, un souvenir
      if (a) {
        const s0 = bondStage(a);
        a.bond = Math.min(100, (a.bond ?? 0) + LUCKY.bond);
        g.bondNews(a, s0);
        g.remember?.(a, 'luckyShoes');
      }
      e?.emit('🎉', 5);
      g.ui.toast(`${t('ls_complete')}${money}`, 9000);
    }
    this.decorate(); // (tout de suite sur la porte de son box)
    g.save?.();
  }

  /** 🍀 Les fers de chaque cheval, cloués sur la porte de son box, sous les flots (repère de la plaque : face à +z). */
  decorate() {
    const g = this.game;
    const st = g.profile && g.isHome ? g.world.interiors?.stable : null;
    if (!st) return;
    const by = g.profile.luckyShoes?.byHorse ?? {};
    const occ = boxOccupants(g.interiors.f, g.interiors.homeHorses());
    for (const box of st.model.boxes) {
      const a = occ[box.i];
      const kinds = a && Array.isArray(by[a.id]) ? by[a.id].filter((k) => SHOE_SHAPES[k]) : [];
      const key = kinds.join(',');
      const plate = box.plate;
      if ((plate.userData.shoeKey ?? '') === key) continue;
      plate.userData.shoeKey = key;
      plate.userData.shoeGroup?.removeFromParent();
      plate.userData.shoeGroup = kinds.length ? this.doorRow(kinds) : null;
      if (plate.userData.shoeGroup) plate.add(plate.userData.shoeGroup);
    }
  }

  /** Une rangée de petits fers debout, les talons en haut (« pour garder la chance », comme dans les écuries). */
  doorRow(kinds) {
    const row = new THREE.Group();
    const gap = 0.025;
    const w = kinds.map(doorWidth);
    let x = -(w.reduce((sum, v) => sum + v, 0) + gap * (kinds.length - 1)) / 2;
    kinds.forEach((kind, i) => {
      const m = shoeModel(kind);
      m.scale.setScalar(ON_DOOR);
      m.position.set(x + w[i] / 2, -0.52, 0.03);
      row.add(m);
      x += w[i] + gap;
    });
    return row;
  }
}

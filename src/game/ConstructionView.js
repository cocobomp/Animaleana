// Vue construction (bouton 🏗️ Construire du haut de l'écran, ou de la vue d'ensemble) : la caméra regarde
// la ferme presque d'aplomb, une grille de 1 m (plus marquée tous les 5 m) couvre le sol et les zones
// occupées sont teintées (enclos en vert, bâtiments en orange, portes en jaune, équipements en bleu).
// On touche un enclos, un bâtiment ou un équipement pour le choisir : un cadre l'entoure et, si on peut
// l'agrandir, des poignées rondes apparaissent sur ses bords et ses coins. Tirer une poignée change sa
// taille au mètre près (taille, places et prix affichés pendant qu'on tire), puis ✅ Valider.
// Les poignées sont des boutons de l'interface (≥ 44 px) : les tirer ne fait jamais glisser la vue,
// et glisser ou pincer ailleurs déplace et zoome la vue comme d'habitude.
// Poser une nouvelle construction (fantôme vert/rouge) reste dans BuildMode.js ; la barre du bas est
// dessinée par src/ui/construction.js. Grille, cadre et poignées n'existent que pendant la vue construction.

import * as THREE from 'three';
import { h, safeInsets } from '../ui/dom.js';
import { t, getLang } from '../i18n.js';
import {
  STRUCTURES, CORE_ITEMS, RESIZABLE_CORE, BOUNDS, coreRect, coreRects, footprintOf, apron, isEnclosure, EQUIP_SIZE, capacityOf,
} from '../sim/construction.js';
import { canResize, worldLimits, dragRect, edgesOf, sameRect, resizeCost, localSize, capacityFor, HANDLES } from '../sim/resize.js';
import { stableRect, stableExt, ensureFacilities, canExtendStable, STABLE_SIZES } from '../sim/facilities.js';
import { ENCLOSURES } from './nav.js';
import { structureName, confirmDemolish } from '../ui/construction.js';

const HALF = 96; // la grille couvre -96 m … 96 m (la zone constructible va jusqu'à BOUNDS = 90 m)
const N = HALF * 2; // une case de la carte des zones occupées = 1 m
const FRAME_Y = 0.25;
const BAR = 0.35; // largeur des bords du cadre (m)
const GOOD = 0x3fae62;
const BAD = 0xe0574a;
const WHITE = 0xffffff;
// Couleurs des zones occupées (rouge, vert, bleu, opacité).
const TINT = {
  core: [215, 215, 215, 55], // cour et pré du troupeau : on ne construit pas dessus
  enclosure: [110, 205, 130, 105],
  building: [235, 145, 65, 165],
  equipment: [80, 155, 245, 190],
  door: [250, 215, 80, 150],
};
// Espèce montrée pour les places de chaque installation de base.
const PLACE_EMOJI = { paddock: '🐴', pen: '🐑', hutch: '🐰' };
// Ancrage des éléments placés à l'écran (voir moveEl).
const CENTER = 'translate(-50%, -50%)';
const ABOVE = 'translate(-50%, -100%)';

const VERT = /* glsl */`
varying vec2 vXZ;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vXZ = wp.xz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAG = /* glsl */`
uniform sampler2D uOcc;
uniform float uHalf;
uniform float uBounds;
varying vec2 vXZ;
// Ligne de grille anti-crénelée (épaisseur en pixels).
float gridLine(vec2 q, float px) {
  vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
  return 1.0 - min(min(g.x, g.y) / px, 1.0);
}
void main() {
  vec2 p = vXZ;
  float mpp = max(fwidth(p.x), fwidth(p.y)); // mètres par pixel : de loin, les petites lignes s'effacent
  float minor = gridLine(p, 1.0) * (1.0 - smoothstep(0.12, 0.35, mpp));
  float major = gridLine(p / 5.0, 1.6);
  float line = max(minor * 0.28, major * 0.6);
  vec4 occ = texture2D(uOcc, (p + uHalf) / (2.0 * uHalf));
  vec3 tint = occ.rgb;
  float ta = occ.a * 0.55;
  if (abs(p.x) > uBounds || abs(p.y) > uBounds) { tint = vec3(0.85, 0.3, 0.25); ta = 0.22; line *= 0.35; }
  float a = max(ta, line);
  gl_FragColor = vec4(mix(tint, vec3(1.0), line / max(a, 0.001)), a);
}`;

export class ConstructionView {
  constructor(game, view) {
    this.game = game;
    this.view = view;
    this.active = false;
    this.from = null;
    this.sel = null; // { kind: 'core' | 'structure' | 'equipment' | 'stable', id }
    this.pending = null; // nouveau rectangle proposé (pas encore validé)
    this.check = { ok: true };
    this.cost = null;
    this.drag = null;
    this.version = 0; // change à chaque nouveau cadre (pour ne replacer les poignées que si besoin)
    this.v = new THREE.Vector3();
    this.lastCam = new Float64Array(8);
    // Ce qui est replacé à chaque image (poignées, étiquette, bulle) : dernières positions écrites, en pixels,
    // pour ne réécrire style.transform que si elles changent (et rien n'est alloué quand rien ne bouge).
    this.px = new Int32Array(HANDLES.length * 2 + 4).fill(-99999);
    this.inf = null; // infos de la sélection, gardées tant que this.version ne change pas
    this.infV = -1;
    this.area = { x0: 0, y0: 0, x1: 0, y1: 0 }; // partie de l'écran que la barre et les boutons laissent libre
    this.areaKey = '';
    this.tagW = 0;
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  get ui() {
    return this.game.ui;
  }

  get st() {
    return this.game.structures;
  }

  get profile() {
    return this.game.profile;
  }

  // ---------------------------------------------------------------- ouvrir / fermer

  /** from : 'hud' (bouton du haut : « Terminé » revient au jeu) ou 'view' (depuis la vue d'ensemble). */
  open(from = 'view') {
    if (this.active || !this.view.active) return;
    this.active = true;
    this.from = from;
    document.body.classList.add('construct');
    this.ui.closePanel();
    this.makeGrid();
    this.makeFrame();
    this.layer = h('div', { id: 'cv-layer' });
    this.tag = h('div', { class: 'cv-tag', hidden: true });
    this.layer.append(this.tag);
    this.ui.root.append(this.layer);
    this.handleEls = null;
    this.sel = null;
    this.pending = null;
    this.refresh();
    this.view.refreshLabels();
    this.view.refreshBar();
    if (!this.profile.tips?.build) {
      // La première fois : le paddock bien en vue (dans la partie libre de l'écran), avec la bulle « touche le paddock ».
      this.showTip('start');
      this.focusOn(coreRect(this.st.layout, 'paddock'), 1.25);
    } else {
      // Sinon la ferme, assez haut pour voir les enclos autour.
      const phone = window.innerWidth < 640;
      this.view.glideTo(this.view.focus.x, this.view.focus.z, Math.max(this.view.height, phone ? 78 : 58));
    }
  }

  close() {
    if (!this.active) return;
    this.active = false;
    this.drag = null;
    this.view.lockPan = false;
    document.body.classList.remove('construct');
    for (const o of [this.grid, this.frame]) {
      if (!o) continue;
      o.parent?.remove(o);
      o.traverse((m) => {
        if (!m.isMesh) return;
        m.geometry.dispose();
        m.material.dispose();
      });
    }
    this.occTex?.dispose();
    this.grid = null;
    this.frame = null;
    this.occTex = null;
    this.layer?.remove();
    this.layer = null;
    this.handleEls = null;
    this.tipEl = null;
    this.sel = null;
    this.pending = null;
    this.inf = null;
    this.infV = -1;
    this.px.fill(-99999);
    if (this.view.active) {
      this.view.refreshLabels();
      this.view.refreshBar();
    }
  }

  /** « Terminé » : retour au jeu (ou à la vue d'ensemble si on venait de là). */
  done() {
    if (this.pending) this.cancelPending();
    if (this.from === 'hud') this.view.exit();
    else this.close();
  }

  // ---------------------------------------------------------------- grille et zones occupées

  makeGrid() {
    const w = this.game.world;
    const geo = new THREE.PlaneGeometry(N, N, N / 2, N / 2).rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, w.heightAt(pos.getX(i), pos.getZ(i)) + 0.08);
    this.occData = new Uint8Array(N * N * 4);
    this.occTex = new THREE.DataTexture(this.occData, N, N, THREE.RGBAFormat);
    this.occTex.magFilter = THREE.NearestFilter;
    this.occTex.minFilter = THREE.NearestFilter;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uOcc: { value: this.occTex }, uHalf: { value: HALF }, uBounds: { value: BOUNDS } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -4,
    });
    this.grid = new THREE.Mesh(geo, mat);
    this.grid.renderOrder = 4;
    this.grid.frustumCulled = false;
    this.game.scene.add(this.grid);
  }

  /** Remplit la carte des zones occupées (une case par mètre). */
  fillOcc() {
    if (!this.occData) return;
    const data = this.occData;
    data.fill(0);
    const put = (r, rgba) => {
      const i0 = Math.max(0, Math.ceil(r.x - r.hw + HALF - 0.5));
      const i1 = Math.min(N - 1, Math.floor(r.x + r.hw + HALF - 0.5));
      const j0 = Math.max(0, Math.ceil(r.z - r.hd + HALF - 0.5));
      const j1 = Math.min(N - 1, Math.floor(r.z + r.hd + HALF - 0.5));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) data.set(rgba, (j * N + i) * 4);
    };
    const g = this.game;
    const w = g.world;
    const layout = this.st.layout;
    for (const r of coreRects(layout)) if (r.id === 'yard' || r.id === 'field') put(r, TINT.core);
    for (const e of ENCLOSURES) if (!e.interior) put(e, TINT.enclosure);
    for (const v of w.camVolumes ?? []) put(v, TINT.building);
    for (const c of w.colliders) if (c.kind && c.kind !== 'showground') put(c, TINT.building);
    for (const s of this.st.here()) {
      const def = STRUCTURES[s.type];
      if (isEnclosure(s.type)) continue;
      put(footprintOf(s), def.cat === 'decor' ? TINT.equipment : TINT.building);
    }
    for (const q of g.equipment) put({ x: q.pos.x, z: q.pos.z, hw: EQUIP_SIZE / 2, hd: EQUIP_SIZE / 2 }, TINT.equipment);
    for (const r of coreRects(layout)) if (r.gate) put(r, TINT.door);
    for (const s of this.st.here()) {
      const ap = apron(s);
      if (ap) put(ap, TINT.door);
    }
    for (const i of w.interactables) if (i.kind !== 'spot' && !i.core) put({ x: i.x, z: i.z, hw: 1, hd: 1 }, TINT.door);
    this.occTex.needsUpdate = true;
  }

  // ---------------------------------------------------------------- cadre de la sélection

  makeFrame() {
    const g = new THREE.Group();
    const flat = () => new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = (color, opacity) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthTest: false, depthWrite: false });
    this.plate = new THREE.Mesh(flat(), mat(GOOD, 0.28));
    this.plate.renderOrder = 30;
    g.add(this.plate);
    this.bars = [0, 1, 2, 3].map(() => {
      const m = new THREE.Mesh(flat(), mat(WHITE, 0.95));
      m.renderOrder = 31;
      g.add(m);
      return m;
    });
    // Contour de la taille actuelle, pendant qu'on propose une autre taille.
    this.oldBars = [0, 1, 2, 3].map(() => {
      const m = new THREE.Mesh(flat(), mat(WHITE, 0.45));
      m.renderOrder = 30;
      g.add(m);
      return m;
    });
    g.visible = false;
    this.frame = g;
    this.game.scene.add(g);
  }

  /** Place les quatre bords d'un cadre autour du rectangle r, à la hauteur y. */
  placeBars(bars, r, y, width) {
    const e = edgesOf(r);
    const set = (m, x, z, sx, sz) => {
      m.position.set(x, y, z);
      m.scale.set(sx, 1, sz);
    };
    set(bars[0], r.x, e.z0, r.hw * 2 + width, width);
    set(bars[1], r.x, e.z1, r.hw * 2 + width, width);
    set(bars[2], e.x0, r.z, width, r.hd * 2);
    set(bars[3], e.x1, r.z, width, r.hd * 2);
  }

  /** Met le cadre, la plaque et les poignées sur la sélection (ou la taille proposée). */
  syncFrame() {
    const inf = this.info();
    if (!this.frame) return;
    this.version++;
    if (!inf) {
      this.frame.visible = false;
      this.setHandles(false);
      this.tag.hidden = true;
      return;
    }
    const r = this.pending ?? inf.rect;
    const y = this.game.world.heightAt(r.x, r.z) + FRAME_Y;
    this.frame.visible = true;
    this.placeBars(this.bars, r, y, BAR);
    const color = this.pending ? (this.check.ok ? GOOD : BAD) : WHITE;
    for (const b of this.bars) b.material.color.setHex(color);
    this.plate.visible = !!this.pending;
    this.plate.position.set(r.x, y - 0.02, r.z);
    this.plate.scale.set(r.hw * 2, 1, r.hd * 2);
    this.plate.material.color.setHex(this.check.ok ? GOOD : BAD);
    for (const b of this.oldBars) b.visible = !!this.pending;
    if (this.pending) this.placeBars(this.oldBars, inf.rect, y - 0.01, BAR * 0.5);
    this.setHandles(!!inf.resizable);
    this.updateTag(inf);
  }

  /** Poignées rondes (boutons de l'interface) : quatre bords et quatre coins. */
  setHandles(on) {
    if (!on) {
      if (this.handleEls) for (const el of Object.values(this.handleEls)) el.hidden = true;
      return;
    }
    if (!this.handleEls) {
      this.handleEls = {};
      for (const name of HANDLES) {
        const el = h('button', {
          class: `cv-handle ${name.length === 2 ? 'corner' : 'edge'} h-${name}`,
          'aria-label': t('cv_resize'),
          title: t('cv_resizeHint'),
        });
        el.addEventListener('pointerdown', (e) => this.onHandleDown(e, name, el));
        el.addEventListener('pointermove', (e) => this.onHandleMove(e));
        el.addEventListener('pointerup', (e) => this.onHandleUp(e));
        el.addEventListener('pointercancel', (e) => this.onHandleUp(e));
        el.addEventListener('lostpointercapture', (e) => this.onHandleUp(e));
        this.layer.append(el);
        this.handleEls[name] = el;
      }
    }
    for (const el of Object.values(this.handleEls)) el.hidden = false;
  }

  /** Étiquette au-dessus du cadre : taille, places, prix (ou pourquoi ce n'est pas possible). */
  updateTag(inf) {
    const r = this.pending ?? inf.rect;
    const lines = [];
    if (inf.resizable) {
      const { w, d } = localSize(r, inf.rot);
      lines.push(`📏 ${t('con_size', { w: fmt(r.hw * 2), d: fmt(r.hd * 2) })}`);
      const cap = this.capacity(inf, w, d);
      if (cap) lines.push(`${inf.placeEmoji} ${t('cv_places', { n: cap })}`);
    }
    if (this.pending) {
      if (!this.check.ok) lines.push(`⛔ ${this.reasonText(this.check)}`);
      else if (this.costText()) lines.push(this.costText());
    }
    const text = lines.join(' · ');
    this.tag.hidden = !lines.length || !!this.game.mgmt.build.active;
    if (this.tag.textContent !== text) {
      this.tag.textContent = text;
      this.tagW = this.tag.hidden ? 0 : this.tag.offsetWidth; // (mesurée quand le texte change, pas à chaque image)
    }
    this.tag.classList.toggle('bad', !!this.pending && !this.check.ok);
    this.tag.classList.toggle('ok', !!this.pending && this.check.ok);
  }

  // ---------------------------------------------------------------- ce qui est choisi

  /**
   * Infos sur la sélection : rectangle au sol, nom, et ce qu'on peut en faire
   * (resizable, movable, rotatable, sellable, stable).
   */
  info(sel = this.sel) {
    if (!sel || !this.profile) return null;
    const g = this.game;
    const st = this.st;
    if (sel.kind === 'core') {
      const def = CORE_ITEMS[sel.id];
      return {
        rect: coreRect(st.layout, sel.id), emoji: def.emoji, name: t(`bld_${sel.id}`), kindKey: sel.id, rot: 0,
        resizable: RESIZABLE_CORE.includes(sel.id), movable: true, placeEmoji: PLACE_EMOJI[sel.id],
      };
    }
    if (sel.kind === 'structure') {
      const s = st.get(sel.id);
      if (!s || s.place !== this.profile.place) return null;
      const def = STRUCTURES[s.type];
      const sp = def.species?.[0];
      return {
        s, rect: footprintOf(s), emoji: def.emoji, name: structureName(s.type), kindKey: s.type, rot: s.rot,
        resizable: canResize(s.type), movable: true, rotatable: true, sellable: true,
        placeEmoji: sp === 'horse' ? '🐴' : sp ? '🐑' : '',
      };
    }
    if (sel.kind === 'equipment') {
      const q = g.equipment.find((x) => x.eq.id === sel.id);
      if (!q) return null;
      return { q, rect: { x: q.pos.x, z: q.pos.z, hw: EQUIP_SIZE / 2 + 0.3, hd: EQUIP_SIZE / 2 + 0.3 }, emoji: q.def.emoji, name: t(`eq_${q.eq.type}`), movable: true };
    }
    if (sel.kind === 'stable') {
      if (!g.world.interiors?.stable) return null;
      const ext = stableExt(ensureFacilities(this.profile));
      return { rect: stableRect(ext), emoji: '🐴', name: t('bld_stable'), stable: true, ext, boxes: STABLE_SIZES[ext] };
    }
    return null;
  }

  /** Places pour les animaux (w × d dans le repère de l'objet). */
  capacity(inf, w, d) {
    if (inf.s) return STRUCTURES[inf.s.type].capacity ? capacityFor(inf.s.type, w, d) : 0;
    return capacityFor(inf.kindKey, w, d);
  }

  /** Places actuelles (pour la barre du bas). */
  currentCapacity(inf) {
    if (inf.s) return capacityOf(inf.s);
    if (!inf.resizable) return 0;
    const { w, d } = localSize(inf.rect, 0);
    return capacityFor(inf.kindKey, w, d);
  }

  select(sel) {
    this.pending = null;
    this.drag = null;
    this.sel = sel;
    const inf = this.info();
    if (!inf) this.sel = null;
    if (inf && sel.kind === 'core' && sel.id === 'paddock') this.markTip('build');
    this.syncFrame();
    this.view.refreshLabels();
    this.view.refreshBar();
    if (inf) this.focusOn(inf.rect, 1, inf.resizable && !this.profile.tips?.resize); // (après la barre : sa taille a changé)
    if (inf?.resizable && !this.profile.tips?.resize) this.showTip('resize');
    else if (this.tipKind === 'resize') this.hideTip();
  }

  deselect() {
    this.select(null);
  }

  /** Tout est à jour (après une construction, un déplacement, un agrandissement, un rechargement). */
  refresh() {
    if (!this.active) return;
    this.fillOcc();
    if (this.sel && !this.info()) this.sel = null;
    if (this.pending && this.sel) this.recheck();
    this.syncFrame();
    this.view.refreshBar();
  }

  /**
   * Partie de l'écran (pixels) que laissent libre les boutons du haut et la barre de construction (en bas
   * en portrait et sur ordinateur, à gauche sur un téléphone en paysage). Recalculée si la barre change.
   */
  freeArea() {
    const W = window.innerWidth;
    const H = window.innerHeight;
    const key = `${this.view.barKey}|${W}|${H}`;
    if (key === this.areaKey) return this.area;
    this.areaKey = key;
    const a = this.area;
    // Jamais sous l'encoche ni sous la barre d'accueil (paysage : la bulle « Compris ! » passait sous l'encoche).
    const safe = safeInsets();
    a.x0 = safe.l;
    a.y0 = safe.t;
    a.x1 = W - safe.r;
    a.y1 = H - safe.b;
    const top = document.querySelector('#hud .hud-buttons')?.getBoundingClientRect();
    if (top?.height) a.y0 = Math.max(a.y0, top.bottom + 6);
    const bar = this.view.bar?.getBoundingClientRect();
    if (bar?.height) {
      if (bar.right < W * 0.5) a.x0 = bar.right + 6; // barre sur le côté (paysage)
      else if (bar.top > H * 0.4) a.y1 = bar.top - 6; // barre en bas
    }
    return a;
  }

  /**
   * La caméra vient se placer au-dessus de r, assez haut pour tout voir (et les poignées), au milieu de la
   * partie libre de l'écran. room : marge en plus (1 = juste ce qu'il faut). tip : garder à côté la place
   * de la bulle « tire un rond » (à droite sur un écran large, en dessous sur un écran haut).
   */
  focusOn(r, room = 1, tip = false) {
    const v = this.view;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const a = this.freeArea();
    let x1 = a.x1;
    let y1 = a.y1;
    if (tip) {
      const tw = 240;
      const th = 175;
      if (a.x1 - a.x0 - tw > a.y1 - a.y0 - th) x1 -= tw;
      else y1 -= th;
    }
    const pad = 62; // place pour les poignées (52 px) autour du cadre
    const fw = Math.max(60, x1 - a.x0 - pad * 2);
    const fh = Math.max(60, y1 - a.y0 - pad * 2);
    // Vue presque d'aplomb (60°) : la hauteur de sol vue ≈ 1,17 × la hauteur de la caméra, sur H pixels.
    const k = 1.17;
    const need = room * Math.max((r.hd * 2 * H) / (k * fh), (r.hw * 2 * H) / (k * fw));
    const height = Math.max(22, Math.min(110, need));
    const mpp = (k * height) / H; // mètres par pixel
    // Le centre de r au centre de la partie libre (l'écran a +x à droite et +z en bas).
    v.glideTo(r.x - ((a.x0 + x1) / 2 - W / 2) * mpp, r.z + (H / 2 - (a.y0 + y1) / 2) * mpp, height);
  }

  // ---------------------------------------------------------------- toucher

  /** Toucher le sol dans la vue construction : on choisit ce qui est là. */
  onTap(sx, sy) {
    const g = this.game;
    const p = this.view.groundAt(sx, sy);
    const rc = this.view.raycaster; // (préparé par groundAt)
    // Un équipement (petit : on accepte un toucher tout près).
    const eqHit = rc.intersectObjects(g.equipment.map((q) => q.mesh), true)[0];
    let q = eqHit ? g.equipment.find((x) => { let o = eqHit.object; while (o && o !== x.mesh) o = o.parent; return !!o; }) : null;
    if (!q && p) q = g.equipment.find((x) => Math.hypot(x.pos.x - p.x, x.pos.z - p.z) < Math.max(1.3, this.view.height / 45));
    if (q) return this.pick({ kind: 'equipment', id: q.eq.id });
    const s = g.structures.pick(rc, p);
    if (s) return this.pick({ kind: 'structure', id: s.id });
    if (!p) return null;
    const inside = (r, m = 0) => Math.abs(p.x - r.x) <= r.hw + m && Math.abs(p.z - r.z) <= r.hd + m;
    for (const id of ['hutch', 'kennel', 'pen', 'paddock']) {
      if (inside(coreRect(this.st.layout, id), id === 'kennel' ? 0.8 : 0.3)) return this.pick({ kind: 'core', id });
    }
    if (g.world.interiors?.stable && inside(stableRect(stableExt(ensureFacilities(this.profile))))) return this.pick({ kind: 'stable' });
    const kind = g.world.kindAt(p.x, p.z) ?? (g.world.camVolumes ?? []).find((v) => inside(v))?.id;
    if (kind) return this.tapLabel(kind);
    if (this.pending) {
      this.ui.toast(t('cv_pendingHint'));
      return null;
    }
    this.deselect();
    return null;
  }

  pick(sel) {
    const same = this.sel && this.sel.kind === sel.kind && this.sel.id === sel.id;
    if (!same) this.select(sel);
  }

  /** Toucher l'étiquette d'un bâtiment (ou le bâtiment) dans la vue construction. */
  tapLabel(kind) {
    if (['paddock', 'pen', 'hutch', 'kennel'].includes(kind)) return this.pick({ kind: 'core', id: kind });
    if (kind === 'stable' && this.game.world.interiors?.stable) return this.pick({ kind: 'stable' });
    this.ui.toast(t('cv_fixed', { name: t(`bld_${kind}`) }));
    return null;
  }

  // ---------------------------------------------------------------- tirer les poignées

  onHandleDown(e, name, el) {
    const inf = this.info();
    if (!inf?.resizable || this.drag) return;
    e.preventDefault();
    e.stopPropagation();
    try { el.setPointerCapture(e.pointerId); } catch { /* rien */ }
    const p = this.view.groundAt(e.clientX, e.clientY);
    if (!p) return;
    const start = this.pending ?? inf.rect;
    const ed = edgesOf(start);
    // On garde l'écart entre le doigt et le bord : le bord ne saute pas sous le doigt.
    const ex = name.includes('e') ? ed.x1 : name.includes('w') ? ed.x0 : p.x;
    const ez = name.includes('n') ? ed.z1 : name.includes('s') ? ed.z0 : p.z;
    this.drag = { name, start, pointerId: e.pointerId, offX: ex - p.x, offZ: ez - p.z, lim: worldLimits(inf.kindKey, inf.rot) };
    this.view.lockPan = true;
    el.classList.add('active');
    this.hideTip();
  }

  onHandleMove(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    e.preventDefault();
    const p = this.view.groundAt(e.clientX, e.clientY);
    if (!p) return;
    const r = dragRect(d.start, d.name, p.x + d.offX, p.z + d.offZ, d.lim);
    if (sameRect(r, this.pending ?? d.start)) return; // (pas encore un mètre de plus : rien à refaire)
    this.propose(r);
  }

  onHandleUp(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.pointerId) return;
    this.drag = null;
    this.view.lockPan = false;
    for (const el of Object.values(this.handleEls ?? {})) el.classList.remove('active');
    this.view.refreshBar();
  }

  /** Une nouvelle taille proposée : on vérifie, on calcule le prix, on montre. */
  propose(r) {
    const inf = this.info();
    if (!inf) return;
    this.pending = sameRect(r, inf.rect) ? null : r;
    this.recheck();
    this.syncFrame();
    this.view.refreshBar();
  }

  recheck() {
    const inf = this.info();
    if (!this.pending || !inf) {
      this.check = { ok: true };
      this.cost = null;
      return;
    }
    const st = this.st;
    this.check = inf.s ? st.validateStructureResize(inf.s, this.pending) : st.validateCoreResize(inf.kindKey, this.pending);
    this.cost = resizeCost(this.profile, inf.kindKey, inf.rect, this.pending);
    if (this.check.ok && this.cost.cost && this.profile.mode !== 'sandbox' && this.profile.money < this.cost.cost) {
      this.check = { ok: false, reason: 'money' };
    }
  }

  costText() {
    const c = this.cost;
    if (!c) return '';
    if (this.profile.mode === 'sandbox') return `🎁 ${t('cv_free')}`;
    if (c.cost) return `🪙 −${c.cost}`;
    if (c.refund) return `🪙 +${c.refund}`;
    return '';
  }

  reasonText(v) {
    if (v.reason === 'crowded' && v.n) return t('cv_bad_crowdedN', { n: v.n }); // (combien d'animaux y vivent)
    const key = `cv_bad_${v.reason}`;
    return t(key) !== key ? t(key, { n: v.level }) : t(`con_bad_${v.reason}`, { n: v.level });
  }

  /** ✅ Valider la nouvelle taille. */
  applyPending() {
    const inf = this.info();
    if (!this.pending || !inf) return;
    if (!this.check.ok) {
      this.ui.toast(this.reasonText(this.check));
      return;
    }
    const r = this.pending;
    const res = inf.s ? this.st.resizeStructure(inf.s.id, r) : this.st.resizeCore(inf.kindKey, r);
    if (!res.ok) {
      this.ui.toast(this.reasonText(res));
      return;
    }
    this.pending = null;
    this.markTip('resize');
    this.markTip('build');
    const money = res.cost ? ` (−${res.cost} 🪙)` : res.refund ? ` (+${res.refund} 🪙)` : '';
    this.ui.toast(`${t('cv_resized', { name: inf.name, w: fmt(r.hw * 2), d: fmt(r.hd * 2) })}${money}`, 4000);
    this.refresh();
    this.ui.refresh();
  }

  cancelPending() {
    this.pending = null;
    this.recheck();
    this.syncFrame();
    this.view.refreshBar();
  }

  // ---------------------------------------------------------------- outils de la barre

  move() {
    const inf = this.info();
    if (!inf) return;
    const b = this.view.build;
    if (this.sel.kind === 'core') b.moveCore(this.sel.id);
    else if (this.sel.kind === 'structure') b.start(inf.s.type, inf.s.id);
    else if (this.sel.kind === 'equipment') b.moveEquipment(inf.q);
  }

  rotate() {
    const inf = this.info();
    if (!inf?.rotatable) return;
    this.view.build.start(inf.s.type, inf.s.id);
    this.view.build.rotate();
  }

  /** « Agrandir » : montre les poignées (elles bougent) et rappelle comment faire. */
  hintResize() {
    const inf = this.info();
    if (!inf) return;
    if (inf.stable) return this.extendStable();
    if (!inf.resizable) return this.ui.toast(t('cv_cantResize'));
    for (const el of Object.values(this.handleEls ?? {})) {
      el.classList.remove('wiggle');
      void el.offsetWidth; // relance l'animation
      el.classList.add('wiggle');
    }
    this.showTip('resize');
    return null;
  }

  async sell() {
    const inf = this.info();
    if (!inf?.sellable) return;
    if (await confirmDemolish(this.ui, inf.s)) {
      this.deselect();
      this.ui.refresh();
    }
  }

  /** Rallonger l'écurie (+4 box). */
  extendStable() {
    const check = canExtendStable(this.profile);
    if (!check.ok) return this.ui.toast(check.reason === 'max' ? t('cv_stableMax') : this.reasonText(check));
    const r = this.st.extendStable();
    if (!r.ok) return this.ui.toast(this.reasonText(r));
    this.ui.toast(t('cv_stableExtended', { n: r.boxes }), 5000);
    this.ui.refresh();
    this.refresh();
    const inf = this.info();
    if (inf) this.focusOn(inf.rect);
    return null;
  }

  /** Ce que coûte la prochaine rallonge (pour le bouton). */
  stableOffer() {
    return canExtendStable(this.profile);
  }

  // ---------------------------------------------------------------- bulles d'aide

  showTip(kind) {
    if (!this.layer) return;
    this.hideTip();
    this.tipKind = kind;
    const ok = () => {
      this.markTip(kind === 'start' ? 'build' : 'resize');
      this.hideTip();
    };
    this.tipEl = h('div', { class: `cv-tip ${kind}` },
      h('p', {}, t(kind === 'start' ? 'cv_tipStart' : 'cv_tipResize')),
      h('button', { class: 'small primary', onClick: ok }, t('cv_tipOk')));
    this.layer.append(this.tipEl);
    this.tipPlaced = false;
    this.tipW = 0;
    this.tipH = 0;
    this.tipSide = '';
    this.tipArrow = -1;
  }

  hideTip() {
    this.tipEl?.remove();
    this.tipEl = null;
    this.tipKind = null;
  }

  markTip(key) {
    const p = this.profile;
    if (!p) return;
    p.tips = p.tips ?? {};
    if (!p.tips[key]) {
      p.tips[key] = true;
      if (this.tipKind === (key === 'build' ? 'start' : 'resize')) this.hideTip();
    }
  }

  // ---------------------------------------------------------------- chaque image

  update() {
    if (!this.active) return;
    const busy = this.view.build.active || this.view.leaving;
    if (this.frame) this.frame.visible = !busy && !!this.sel;
    this.layer.classList.toggle('busy', busy);
    if (busy) return;
    const cam = this.game.camera;
    const m = cam.matrixWorld.elements;
    const L = this.lastCam;
    // Rien n'a bougé (caméra posée, même cadre) : on ne replace rien.
    if (L[0] === m[12] && L[1] === m[13] && L[2] === m[14] && L[3] === m[0] && L[4] === m[5] && L[5] === m[10]
      && L[6] === this.version && L[7] === window.innerWidth + window.innerHeight * 10000 && !(this.tipEl && !this.tipPlaced)) return;
    L[0] = m[12]; L[1] = m[13]; L[2] = m[14]; L[3] = m[0]; L[4] = m[5]; L[5] = m[10];
    L[6] = this.version;
    L[7] = window.innerWidth + window.innerHeight * 10000;
    if (this.infV !== this.version) {
      this.inf = this.info(); // (une fois par nouveau cadre, pas à chaque image)
      this.infV = this.version;
    }
    const inf = this.inf;
    const r = inf && (this.pending ?? inf.rect);
    const a = this.freeArea();
    if (r && this.handleEls && inf.resizable) {
      const x0 = r.x - r.hw;
      const x1 = r.x + r.hw;
      const z0 = r.z - r.hd;
      const z1 = r.z + r.hd;
      // Sur un petit enclos vu de loin, les poignées du milieu des bords se cachent (il reste les coins) :
      // celles du haut et du bas si le cadre est étroit à l'écran, celles des côtés s'il est bas.
      const p = this.screen(x0, z1);
      const ax = p.x;
      const ay = p.y;
      const q = this.screen(x1, z0);
      const narrow = Math.abs(q.x - ax) < 140;
      const flat = Math.abs(q.y - ay) < 140;
      for (let i = 0; i < HANDLES.length; i++) {
        const name = HANDLES[i];
        const el = this.handleEls[name];
        const x = name.includes('e') ? x1 : name.includes('w') ? x0 : r.x;
        const z = name.includes('n') ? z1 : name.includes('s') ? z0 : r.z;
        const sp = this.screen(x, z);
        this.moveEl(el, i, sp.x, sp.y, CENTER);
        el.classList.toggle('far', name.length === 1 && (name === 'n' || name === 's' ? narrow : flat));
      }
    }
    if (r && !this.tag.hidden) {
      // Au-dessus du bord du haut de l'écran (côté -z : la caméra regarde vers -z), au-dessus des poignées,
      // sans sortir de la partie libre de l'écran.
      const sp = this.screen(r.x, r.z - r.hd);
      const half = (this.tagW || 200) / 2;
      const x = Math.max(a.x0 + half + 4, Math.min(a.x1 - half - 4, sp.x));
      const y = Math.max(a.y0 + 34, sp.y - 30);
      this.moveEl(this.tag, HANDLES.length, x, y, ABOVE);
    }
    if (this.tipEl) this.placeTip(r, a);
  }

  /** Place un élément (poignée, étiquette, bulle) : style.transform n'est réécrit que si les pixels changent. */
  moveEl(el, slot, x, y, anchor) {
    const X = Math.round(x);
    const Y = Math.round(y);
    const k = slot * 2;
    if (this.px[k] === X && this.px[k + 1] === Y) return;
    this.px[k] = X;
    this.px[k + 1] = Y;
    el.style.transform = `translate(${X}px, ${Y}px) ${anchor}`;
  }

  /**
   * Bulles d'aide. « Touche le paddock » : sous le paddock (ou au-dessus s'il n'y a pas la place), la flèche
   * sur lui. « Tire un rond » : à côté du cadre (à droite, à gauche, en dessous ou au-dessus : la première
   * place libre), jamais sur les poignées. Toujours dans la partie libre de l'écran.
   */
  placeTip(r, a) {
    const el = this.tipEl;
    if (!this.tipW) {
      this.tipW = el.offsetWidth || 230;
      this.tipH = el.offsetHeight || 110;
    }
    const tw = this.tipW;
    const th = this.tipH;
    let x = 0;
    let y = 0;
    let side = 'below';
    let arrow = 0;
    if (this.tipKind === 'start') {
      const pr = coreRect(this.st.layout, 'paddock');
      const sp = this.screen(pr.x, pr.z);
      const px = sp.x;
      const py = sp.y;
      side = py + 30 + th <= a.y1 - 4 ? 'below' : 'above';
      y = clamp(side === 'below' ? py + 30 : py - 30 - th, a.y0 + 4, a.y1 - th - 4);
      x = clamp(px - tw / 2, a.x0 + 4, a.x1 - tw - 4);
      arrow = clamp(px - x, 18, tw - 18);
    } else if (this.tipKind === 'resize' && r) {
      // Les bords du cadre à l'écran (avec la place des poignées).
      const e = this.screen(r.x + r.hw, r.z).x + 34;
      const w = this.screen(r.x - r.hw, r.z).x - 34;
      const n = this.screen(r.x, r.z + r.hd).y + 34;
      const s = this.screen(r.x, r.z - r.hd).y - 34;
      const c = this.screen(r.x, r.z);
      const cx = c.x;
      const cy = c.y;
      side = 'right';
      x = e + 8;
      y = cy - th / 2;
      if (!fitsIn(a, x, y, tw, th)) {
        side = 'left';
        x = w - 8 - tw;
      }
      if (!fitsIn(a, x, y, tw, th)) {
        side = 'below';
        x = cx - tw / 2;
        y = n + 8;
      }
      if (!fitsIn(a, x, y, tw, th) && fitsIn(a, x, s - 8 - th, tw, th)) {
        side = 'above';
        y = s - 8 - th;
      }
      x = clamp(x, a.x0 + 4, a.x1 - tw - 4);
      y = clamp(y, a.y0 + 4, a.y1 - th - 4);
      arrow = side === 'right' || side === 'left' ? clamp(cy - y, 18, th - 18) : clamp(cx - x, 18, tw - 18);
    } else return;
    if (side !== this.tipSide) {
      el.classList.remove('right', 'left', 'below', 'above');
      el.classList.add(side);
      this.tipSide = side;
    }
    const A = Math.round(arrow);
    if (A !== this.tipArrow) {
      this.tipArrow = A;
      el.style.setProperty('--arrow', `${A}px`);
    }
    this.moveEl(el, HANDLES.length + 1, x, y, '');
    this.tipPlaced = true;
  }

  /** Point du sol (x, z) → position à l'écran (réutilise le même vecteur). */
  screen(x, z) {
    const v = this.v.set(x, this.game.world.heightAt(x, z) + FRAME_Y, z).project(this.game.camera);
    v.x = ((v.x + 1) / 2) * window.innerWidth;
    v.y = ((1 - v.y) / 2) * window.innerHeight;
    return v;
  }

  onKey(e) {
    if (!this.active || ['INPUT', 'TEXTAREA'].includes(e.target?.tagName) || this.view.build.active) return;
    if (e.code === 'Escape') {
      if (this.pending) this.cancelPending();
      else if (this.sel) this.deselect();
    }
    if (e.code === 'Enter' && this.pending) this.applyPending();
  }
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** Le rectangle (x, y, w, h) tient-il dans la partie libre a de l'écran ? */
const fitsIn = (a, x, y, w, h) => x >= a.x0 && x + w <= a.x1 && y >= a.y0 && y + h <= a.y1;

/** 22 → « 22 », 22.4 → « 22,4 » (virgule en français). */
export function fmt(v) {
  const r = Math.round(v * 10) / 10;
  return getLang() === 'fr' ? String(r).replace('.', ',') : String(r);
}

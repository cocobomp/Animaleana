// 🎃 Halloween au poney-club (src/sim/halloween.js) : les citrouilles-lanternes de la ferme (elles s'allument le soir)
// et la chasse aux citrouilles à cheval le long du chemin de balade. Seulement à la ferme, pendant la fête.
// Mis à jour avec les troncs (Game.frame).

import * as THREE from 'three';
import { t } from '../i18n.js';
import { earn, addStat, isSandbox } from '../sim/profile.js';
import { giveGear, sizeFor } from '../sim/gear.js';
import { bondStage } from '../sim/animal.js';
import { hourOf } from '../sim/time.js';
import { HALLOWEEN, halloweenOn, halloweenYear, pumpkinSpots, decorSpots, huntState, findPumpkin } from '../sim/halloween.js';
import { audio } from './audio.js';

const R = 0.32; // (le rayon d'une citrouille de taille 1)

/** La peau (côtes plus sombres) et le visage taillé : deux textures, la couleur et la lumière de la bougie. */
function faceTextures() {
  const W = 256;
  const H = 128;
  const make = (paint) => {
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    paint(c.getContext('2d'));
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  };
  // Le visage, face à +z (u = 0,25 sur la sphère) : deux yeux, un nez, une bouche en dents de scie.
  const face = (x, fill) => {
    x.fillStyle = fill;
    const cx = W * 0.25;
    const tri = (pts) => {
      x.beginPath();
      x.moveTo(pts[0], pts[1]);
      for (let i = 2; i < pts.length; i += 2) x.lineTo(pts[i], pts[i + 1]);
      x.closePath();
      x.fill();
    };
    tri([cx - 22, 58, cx - 8, 58, cx - 15, 42]);
    tri([cx + 8, 58, cx + 22, 58, cx + 15, 42]);
    tri([cx - 4, 68, cx + 4, 68, cx, 61]);
    x.beginPath();
    x.moveTo(cx - 24, 74);
    const teeth = [[-18, 82], [-12, 76], [-6, 84], [0, 77], [6, 84], [12, 76], [18, 82], [24, 74]];
    for (const [dx, y] of teeth) x.lineTo(cx + dx, y);
    x.lineTo(cx + 16, 90);
    x.lineTo(cx - 16, 90);
    x.closePath();
    x.fill();
  };
  const map = make((x) => {
    x.fillStyle = '#e8731c';
    x.fillRect(0, 0, W, H);
    x.fillStyle = 'rgba(120, 40, 0, 0.28)'; // (les côtes)
    for (let i = 0; i < 10; i++) x.fillRect((i * W) / 10 - 3, 0, 6, H);
    face(x, '#3a1a06');
  });
  const glow = make((x) => {
    x.fillStyle = '#000';
    x.fillRect(0, 0, W, H);
    face(x, '#ffd070');
  });
  return { map, glow };
}

/** La forme d'une citrouille : une sphère aplatie, creusée de côtes. */
function pumpkinGeometry() {
  const geo = new THREE.SphereGeometry(R, 20, 14);
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const a = Math.atan2(v.z, v.x);
    const k = 1 - 0.07 * Math.abs(Math.cos(a * 5)); // (10 côtes)
    p.setXYZ(i, v.x * k, v.y * 0.78, v.z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

export class Halloween {
  constructor(game) {
    this.game = game;
    this.place = null;
    this.items = []; // { id?, model, found, pop }
    this.on = false;
    this.mat = null;
  }

  /** Construit (ou retire) les citrouilles quand on change de lieu ou quand la fête commence. */
  sync() {
    const g = this.game;
    const on = !!g.profile && g.isHome && halloweenOn();
    const key = on ? g.profile.place : null;
    if (key === this.place) return;
    this.place = key;
    for (const it of this.items) it.model.removeFromParent();
    this.items = [];
    if (this.guiding || this.marked) {
      this.guiding = false;
      this.pointNearest(); // (ailleurs : plus de flèche)
    }
    if (!on) return;
    if (!this.mat) {
      const { map, glow } = faceTextures();
      this.geo = pumpkinGeometry();
      this.mat = new THREE.MeshStandardMaterial({ map, emissiveMap: glow, emissive: 0xffa040, emissiveIntensity: 0.4, roughness: 0.6 });
      this.stemMat = new THREE.MeshStandardMaterial({ color: 0x5b6b2a, roughness: 0.9 });
      this.stemGeo = new THREE.CylinderGeometry(0.035, 0.06, 0.16, 6);
    }
    const hunt = huntState(g.profile, halloweenYear());
    const put = (x, z, size, id = null) => {
      if (g.world.isWater?.(x, z)) return;
      const m = new THREE.Group();
      const body = new THREE.Mesh(this.geo, this.mat);
      body.position.y = R * 0.78;
      body.castShadow = true;
      m.add(body);
      const stem = new THREE.Mesh(this.stemGeo, this.stemMat);
      stem.position.set(0.02, R * 1.6, 0);
      stem.rotation.z = -0.25;
      m.add(stem);
      m.scale.setScalar(size);
      m.position.set(x, g.world.heightAt(x, z), z);
      g.scene.add(m);
      const it = { id, model: m, found: !!id && hunt.found.includes(id), pop: 0 };
      m.visible = !it.found;
      this.items.push(it);
      return it;
    };
    for (const d of decorSpots()) {
      const it = put(d.x, d.z, d.size);
      if (it) it.model.rotation.y = d.face;
    }
    for (const s of pumpkinSpots()) {
      const it = put(s.x, s.z, 1.5, s.id); // (plus grosses : on les voit de loin)
      if (it) it.model.rotation.y = s.face;
    }
  }

  update(dt) {
    this.sync();
    if (!this.items.length) return;
    const g = this.game;
    // Les bougies : allumées le soir et la nuit, à peine le jour (et elles vacillent un peu).
    const hr = hourOf(g.profile.clock ?? 0);
    const dark = hr < 7 || hr >= 18.5 ? 1 : hr < 8 ? 8 - hr : hr > 17.5 ? hr - 17.5 : 0;
    this.time = (this.time ?? 0) + dt;
    this.mat.emissiveIntensity = 0.15 + dark * (1.4 + 0.25 * Math.sin(this.time * 9) * Math.sin(this.time * 3.7));
    for (const it of this.items) {
      if (it.pop > 0) {
        // (trouvée : elle saute et disparaît)
        it.pop = Math.max(0, it.pop - dt * 2.5);
        it.model.position.y += dt * 1.4;
        it.model.scale.setScalar(Math.max(0.01, it.pop));
        if (!it.pop) it.model.visible = false;
      }
    }
    const pl = g.player;
    if (g.activities.active || g.tripFlow?.active) return;
    const hunt = huntState(g.profile, halloweenYear());
    if (hunt.done) return;
    // Le mot de la fête, une fois par partie (à la ferme, quand rien d'autre ne parle)
    if (!this.told && g.profile.tutorial?.done !== false && g.profile.animals.some((a) => a.species === 'horse' && !a.client && !a.guest)) {
      this.told = true;
      g.ui.toast(t('hw_hello', { n: pumpkinSpots().length - hunt.found.length }), 8000);
    }
    const p = pl.root.position;
    for (const it of this.items) {
      if (!it.id || it.found) continue;
      const d = Math.hypot(it.model.position.x - p.x, it.model.position.z - p.z);
      if (d > HALLOWEEN.reach) continue;
      if (!pl.mount) {
        if (!this.footSaid) {
          this.footSaid = true;
          g.ui.toast(t('hw_onFoot'), 5000);
        }
        continue;
      }
      this.found(it);
    }
  }

  /**
   * 🧭 « Guide-moi » (fiche du cheval) : la flèche jaune montre la citrouille la plus proche pas encore trouvée, puis
   * la suivante à chaque trouvaille ; rendue (à la quête) quand la chasse est finie ou qu'on quitte la ferme.
   */
  guide(on = true) {
    this.guiding = on;
    this.pointNearest();
  }

  pointNearest() {
    const g = this.game;
    const p = g.player.root.position;
    let best = null;
    if (this.guiding) {
      for (const it of this.items) {
        if (!it.id || it.found) continue;
        const d = Math.hypot(it.model.position.x - p.x, it.model.position.z - p.z);
        if (!best || d < best.d) best = { it, d };
      }
    }
    if (best) {
      this.shown = new THREE.Vector3(best.it.model.position.x, 0, best.it.model.position.z);
      g.marker?.show(this.shown, { hideNear: 2 });
      this.marked = true;
      return true;
    }
    this.guiding = false;
    if (this.marked) {
      if (g.marker?.target === this.shown) g.marker.hide();
      if (g.ui?.tutorial) g.ui.tutorial.markerKey = null; // (la flèche de la quête reprend sa place)
      this.marked = false;
      this.shown = null;
    }
    return false;
  }

  /** Une citrouille trouvée à cheval. */
  found(it) {
    const g = this.game;
    const p = g.profile;
    const r = findPumpkin(p, it.id, halloweenYear(), this.items.filter((x) => x.id).length);
    it.found = true;
    it.pop = 1;
    if (this.guiding) this.pointNearest(); // (la suivante, ou la flèche rendue)
    if (!r.what) return;
    addStat(p, 'pumpkins');
    const e = g.player.mount;
    e?.emit('🎃', 2);
    audio.ui('coin');
    if (r.what === 'found') return g.ui.toast(t('hw_found', { n: r.n, total: r.total }), 3500);
    // Toutes trouvées : la récompense
    const a = e?.data;
    const { coins, bond, item } = HALLOWEEN.reward;
    earn(p, coins);
    if (a) {
      const s0 = bondStage(a);
      a.bond = Math.min(100, (a.bond ?? 0) + bond);
      g.bondNews(a, s0);
    }
    giveGear(p, item, a ? sizeFor(item, a) : undefined);
    let worn = false;
    if (a?.species === 'horse' && a.gear?.saddle) worn = !!g.equip(a, item, 'orange', { exact: true })?.ok; // (il le porte tout de suite)
    addStat(p, 'halloweenHunts');
    g.remember?.(a, 'halloween');
    e?.emit('🎉', 5);
    const money = isSandbox(p) ? '' : ` +${coins} 🪙`;
    g.ui.toast(`${t(worn ? 'hw_doneWorn' : 'hw_done', { name: a?.name ?? '', g: a?.sex })}${money}`, 9000);
    g.save?.();
  }
}

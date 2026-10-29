// 🌬️ Son souffle dans le froid (src/sim/breath.js) : à chaque expiration des chevaux proches de la caméra, deux petites
// bouffées blanches sortent des naseaux, vers le bas et l'avant (au rythme de sa respiration : horseReal.js breathPh,
// plus vite essoufflé) ; un cheval en sueur fume du dos. Au plus 24 sprites, créés au besoin, une seule texture
// partagée ; quand il fait doux et que tout est retombé, rien à faire.

import * as THREE from 'three';
import { BREATH_FX, STEAM, breathFog, exhaleCrossed, puffOf, steamOf } from '../sim/breath.js';
import { t } from '../i18n.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _puff = {};
const PUFF = { rise: 0.12, drag: 0.9 }; // (m/s² : l'air chaud monte ; freinage : la bouffée s'arrête en s'étalant)
const TIP_NEAR = 8; // (m : le petit mot de la première fois, seulement tout près)

/** Bouffée : un disque blanc très doux (dégradé radial). */
function puffTexture() {
  const S = 64;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export class HorseBreath {
  constructor(scene) {
    this.scene = scene;
    this.parts = []; // { s (sprite), v (m/s), age, life, size0, size1, alpha, rise, drag }
    this.tex = undefined; // (créée avec le premier sprite ; null sans DOM : tests)
    this.track = new WeakMap(); // entité → { ph (phase d'avant), tick, steam (s), side }
    this.tick = 0;
    this.temp = undefined;
    this.fog = 0;
    this.near = new Array(BREATH_FX.max).fill(null);
    this.nearD = new Array(BREATH_FX.max).fill(0);
    this.live = 0; // (bouffées visibles : vérifications)
    this.breaths = 0; // (expirations vues depuis le début : vérifications)
  }

  update(dt, entities, g) {
    this.tick++;
    // (température relue deux fois par seconde environ : elle change à l'heure près)
    if (this.temp === undefined || this.tick % 30 === 0) {
      this.temp = g.temperature;
      this.fog = breathFog(this.temp, g.weather);
    }
    const temp = this.temp;
    const fog = this.fog;
    if (!fog && temp >= STEAM.warm && !this.live) return;
    if (fog || temp < STEAM.warm) this.spawnAll(dt, entities, g, temp, fog);
    // Les bouffées : elles montent doucement, grossissent et s'effacent.
    const shade = 0.35 + 0.65 * (g.dayLight ?? 1); // (la nuit, pas de buée qui brille)
    let live = 0;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p.age >= p.life) continue;
      p.age += dt;
      if (p.age >= p.life) {
        p.s.visible = false;
        continue;
      }
      const k = p.age / p.life;
      p.v.y += p.rise * dt;
      if (p.drag) p.v.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.s.position.addScaledVector(p.v, dt);
      const size = p.size0 + (p.size1 - p.size0) * Math.sqrt(k);
      p.s.scale.set(size, size, 1);
      p.s.material.opacity = p.alpha * (1 - k);
      p.s.material.color.setScalar(shade);
      live++;
    }
    this.live = live;
  }

  /** Les (au plus 3) chevaux les plus proches devant la caméra : bouffées à chaque expiration, vapeur s'il a transpiré. */
  spawnAll(dt, entities, g, temp, fog) {
    const near = this.near;
    const nearD = this.nearD;
    const max = BREATH_FX.max;
    let n = 0;
    const cam = g.camera.position;
    const lim = BREATH_FX.near * BREATH_FX.near;
    g.camera.getWorldDirection(_fwd);
    for (const e of entities) {
      const md = e.model;
      if (!md?.real || !md.anim || e.data?.species !== 'horse' || e.inside || !e.root.visible) continue;
      const d = e.position.distanceToSquared(cam);
      if (d > lim || (n === max && d >= nearD[max - 1])) continue;
      // (derrière la caméra : on ne le voit pas, il ne prend pas la place de celui qu'on regarde ; monté, il est
      // sous la caméra à la première personne)
      if (!e.ridden && _v.subVectors(e.position, cam).dot(_fwd) < -1) continue;
      // (rangés du plus proche au plus loin)
      let j = n < max ? n++ : max - 1;
      while (j > 0 && nearD[j - 1] > d) {
        near[j] = near[j - 1];
        nearD[j] = nearD[j - 1];
        j--;
      }
      near[j] = e;
      nearD[j] = d;
    }
    const steamT = temp < STEAM.warm;
    for (let i = 0; i < n; i++) {
      const e = near[i];
      near[i] = null;
      const md = e.model;
      const ph = md.anim.breathPh;
      let tr = this.track.get(e);
      if (!tr) {
        tr = { ph, tick: 0, steam: 0, side: 1 };
        this.track.set(e, tr);
      }
      // (suivi à l'image d'avant seulement : sinon une vieille phase ferait croire à une expiration)
      if (fog && tr.tick === this.tick - 1 && exhaleCrossed(tr.ph, ph)) this.exhale(e, g, fog);
      tr.ph = ph;
      tr.tick = this.tick;
      const steam = steamT ? steamOf(e.data.sweat, temp) : 0;
      if (steam > 0) {
        tr.steam -= dt;
        if (tr.steam <= 0) {
          tr.steam = STEAM.every;
          tr.side = -tr.side;
          e.scaleGroup.updateWorldMatrix(true, false);
          e.scaleGroup.localToWorld(_v.set((Math.random() - 0.5) * 0.1, md.saddleY, tr.side * 0.4 * md.dims.L));
          const sc = e.scale ?? 1;
          this.spawn(_v, _d.set(0, STEAM.rise * sc, 0), 0.2 * sc, 0.55 * sc, STEAM.life, STEAM.alpha * steam, 0, 0);
        }
      }
    }
  }

  /** Il expire : une bouffée par naseau (là où le bout du nez touche l'herbe : horseReal.js computeReach). */
  exhale(e, g, fog) {
    const md = e.model;
    const z = md.dims.snoutZ;
    const sc = e.scale ?? 1;
    const fx = puffOf(md.anim.effort, fog, _puff);
    md.head.updateWorldMatrix(true, false);
    for (let side = -1; side <= 1; side += 2) {
      _v.set(side * 0.04 * z, -0.12 * z, 0.97 * z).applyMatrix4(md.head.matrixWorld);
      _d.set(0, 0, 1).transformDirection(md.head.matrixWorld).multiplyScalar(fx.speed);
      _d.y -= 0.15;
      _d.multiplyScalar(sc);
      this.spawn(_v, _d, fx.size0 * sc, fx.size1 * sc, fx.life, fx.alpha, PUFF.rise, PUFF.drag);
    }
    this.breaths++;
    // La première fois, tout près et bien visible : le petit mot.
    const p = g.profile;
    if (p && !p.seenBreath && fog >= BREATH_FX.tip && g.player && e.position.distanceTo(g.player.position) < TIP_NEAR) {
      p.seenBreath = true;
      g.ui.toast(t('breathCold', { name: e.data.name, g: e.data.sex }), 6000);
    }
  }

  spawn(pos, vel, size0, size1, life, alpha, rise, drag) {
    const p = this.slot();
    p.s.position.copy(pos);
    p.v.copy(vel);
    p.age = 0;
    p.life = life;
    p.size0 = size0;
    p.size1 = size1;
    p.alpha = alpha;
    p.rise = rise;
    p.drag = drag;
    p.s.scale.set(size0, size0, 1);
    p.s.material.opacity = alpha;
    p.s.visible = true;
  }

  /** Un sprite libre ; s'il y en a déjà 24 en l'air, le plus avancé dans sa vie. */
  slot() {
    let old = null;
    for (let i = 0; i < this.parts.length; i++) {
      const p = this.parts[i];
      if (p.age >= p.life) return p;
      if (!old || p.age / p.life > old.age / old.life) old = p;
    }
    if (this.parts.length >= BREATH_FX.pool) return old;
    if (this.tex === undefined) this.tex = typeof document === 'undefined' || !document.createElement ? null : puffTexture();
    // (sans tons filmiques : blanc comme les flocons de Weather3D, pas gris)
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false }));
    s.renderOrder = 5;
    s.visible = false;
    this.scene.add(s);
    const p = { s, v: new THREE.Vector3(), age: 1, life: 1, size0: 0, size1: 0, alpha: 0, rise: 0, drag: 0 };
    this.parts.push(p);
    return p;
  }

  /** Tout s'efface (changement de lieu). */
  clear() {
    for (const p of this.parts) {
      p.age = p.life;
      p.s.visible = false;
    }
    this.live = 0;
    this.temp = undefined; // (autre lieu : autre température)
  }
}

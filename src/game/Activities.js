// Activités jouables en 3D : parcours de saut d'obstacles, balade avec balises et photos,
// agility (on guide son animal), spectacles devant le public, et concours (classements).
// La logique (notes, chances, classements) est dans src/sim/activities.js ; l'interface dans src/ui/activities.js.

import * as THREE from 'three';
import { tackEffects } from '../sim/gear.js'; // effets de la selle en balade
import {
  SHOWGROUND, JUMP_COURSE, AGILITY_COURSE, AGILITY_LENGTH, TRAIL, toWorld, approach, alignment, takeoffQuality, TAKEOFF,
  jumpChance, horseJumpStats, refuses, jumpingResult, parTime, trailCollectibles, trailResult, trailEnduranceGain,
  courseForStage, stageFor, stageForLevel, refusalChance, LESSON_STEPS, LESSON_JUMPS, lessonStart, lessonGain, lessonResult, JUMP_STAGES,
  HOP_COURSE, hopChance, hopPar, hopResult, HUTCH_TOYS, hutchPlay, hutchPlayBlock,
  agilityChance, agilitySpeed, agilityResult, agilityPar, commandQuality, AGILITY_TYPES, trickWindow, trickPoints, showResult,
  showAudience, ranking, placementAward, practiceAward, addAward, recordBest, activityData, activitySkillGain, eligibility,
} from '../sim/activities.js';
import { SPECIES } from '../sim/species.js';
import { addStat, earn, spend, isSandbox } from '../sim/profile.js';
import { mulberry32 } from '../sim/rng.js';
import {
  jumpObstacle, flagPair, agilityObstacle, spectators, showStage, trailMarker, sightModel, guideArrow,
} from './models/course.js';
import { enclosure, navTarget } from './nav.js';
import { emojiTexture } from './textures.js';
import { realLegPose } from './models/horseReal.js'; // poses des membres du cheval réaliste (sauts, tours)
import { realDogPose } from './models/dogReal.js'; // poses du chien réaliste (ses clips : assis, couché, saut…)
import { realCatPose } from './models/catReal.js'; // poses du chat réaliste (ses clips : assis, patte levée, saut…)
import { ActivityHud, showActivityResults } from '../ui/activities.js';
import { t, ta } from '../i18n.js';

const COLLECT_EMOJI = { apple: '🍎', flower: '🌼', horseshoe: '🍀', carrot: '🥕' };
const ARENA_SPEED = 7.2; // galop de concours, un peu plus calme que le galop de balade
// Leçon de saut : un seul obstacle au milieu de la carrière (coordonnées locales).
const LESSON_SPOT = { x: 0, z: -4, heading: -Math.PI / 2 };
const LESSON_START = { x: 14, z: -4, heading: -Math.PI / 2 };

const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const fwd = (h) => new THREE.Vector3(Math.sin(h), 0, Math.cos(h));

export class Activities {
  constructor(game) {
    this.game = game;
    this.session = null;
    this.plays = []; // lapins qui jouent au clapier
  }

  get active() {
    return this.session;
  }

  /**
   * Lance une activité. type : 'jumping' | 'trail' | 'agility' | 'show'.
   * opts : { animal, animals, acts, comp } (comp = concours, sinon entraînement).
   * opts.prepaid : frais déjà payés à l'inscription (concours de beauté, src/game/Beauty.js).
   */
  start(type, opts = {}) {
    const g = this.game;
    if (this.session) this.session.end(true);
    const comp = opts.comp ?? null;
    if (comp && !opts.prepaid) {
      const fee = comp.fee;
      if (!spend(g.profile, fee)) {
        g.ui.toast(t('r_money'));
        return null;
      }
      activityData(g.profile).entered.push(comp.id);
    }
    g.ui.closePanel();
    const Cls = SESSION_TYPES[type]?.cls; // registre des séances (dressage : src/game/Dressage.js ; beauté : src/game/Beauty.js)
    if (!Cls) return null;
    // Les animaux qui nous suivent attendent ici (pas ceux de l'activité ou du spectacle de tours : la séance
    // s'occupe d'eux ; ni pour une balade, où ils viennent avec nous : TrailSession, walkers).
    if (type !== 'trail') g.stopFollowers([opts.animal?.id, ...(opts.acts ?? []).map((x) => x.animalId)]);
    this.session = new Cls(this, type, opts);
    if (!this.session.ok) {
      this.session.end(true);
      return null;
    }
    return this.session;
  }

  update(dt) {
    this.updatePlays(dt);
    this.game.beauty?.update(dt); // concours de beauté : décor des animaux, pluie (src/game/Beauty.js)
    const s = this.session;
    if (!s) return;
    if (this.game.profile.place !== s.place) {
      s.end(true);
      return;
    }
    s.update(dt);
  }

  abort() {
    this.session?.end(true);
    this.stopPlays();
  }

  /** Bouton d'action (E) pendant une activité. Renvoie true si l'activité l'a utilisé. */
  onInteract() {
    if (!this.session) return false;
    this.session.action?.();
    return true;
  }

  /** Toucher l'écran pendant une activité. Renvoie true si l'activité a utilisé le toucher. */
  onTap(sx, sy) {
    if (this.session) return this.session.onTap?.(sx, sy) ?? false;
    return this.tapHutchToy(sx, sy);
  }

  // ------------------------------------------------------------ jeux des lapins au clapier

  /** Toucher un jouet de l'enclos du clapier : un lapin va y jouer. Renvoie true si on a touché un jouet. */
  tapHutchToy(sx, sy) {
    const g = this.game;
    const toys = g.world.hutchToys;
    if (!toys) return false;
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    g.raycaster.setFromCamera(ndc, g.camera);
    const hit = g.raycaster.intersectObjects(Object.values(toys).map((x) => x.group), true)[0];
    if (!hit || hit.distance > 30) return false;
    const id = Object.keys(toys).find((k) => {
      for (let o = hit.object; o; o = o.parent) if (o === toys[k].group) return true;
      return false;
    });
    const rabbit = this.pickRabbit(toys[id]);
    if (!rabbit) {
      g.ui.toast(t('actv_noRabbit'), 4000);
      return true;
    }
    this.playInHutch(rabbit, id);
    return true;
  }

  /** Le lapin libre le plus proche du jouet. */
  pickRabbit(toy) {
    const g = this.game;
    const free = g.animalsHere().filter((a) => a.species === 'rabbit' && !hutchPlayBlock(a) && !this.plays.some((p) => p.a === a) && g.entities.get(a.id));
    free.sort((a, b) => g.entities.get(a.id).position.distanceTo(new THREE.Vector3(toy.x, 0, toy.z))
      - g.entities.get(b.id).position.distanceTo(new THREE.Vector3(toy.x, 0, toy.z)));
    return free[0] ?? null;
  }

  /** « Tu vas jouer avec la roue ! » : le lapin va au jouet et joue un moment. */
  playInHutch(a, toyId) {
    const g = this.game;
    const why = hutchPlayBlock(a);
    if (why) return g.ui.toast(ta(`actv_why_${why}`, a), 4000);
    if (this.session) return g.ui.toast(t('actv_busy'));
    if (this.plays.some((p) => p.a === a)) return g.ui.toast(ta('actv_hutchBusy', a));
    if (this.plays.some((p) => p.toyId === toyId)) return g.ui.toast(t('actv_toyBusy'));
    const e = g.entities.get(a.id);
    const toy = g.world.hutchToys?.[toyId];
    if (!e || !toy) return null;
    e.scripted = true;
    e.sleeping = false;
    a.following = false;
    this.plays.push({ a, e, toyId, toy, phase: 'go', t: 0 });
    g.ui.toast(ta('actv_hutchGo', a, { toy: t(`actv_toy_${toyId}`) }), 3500);
    return true;
  }

  updatePlays(dt) {
    const g = this.game;
    for (const pl of [...this.plays]) {
      const { e, toy, toyId } = pl;
      const p = e.position;
      pl.t += dt;
      const ground = (x, z) => g.world.heightAt(x, z);
      if (pl.phase === 'go') {
        const goal = new THREE.Vector3(toy.x, 0, toy.z + (toyId === 'hay' ? 0.4 : toyId === 'wheel' ? 0.55 : 0));
        if (toyId === 'tunnel') goal.x -= 0.9;
        const way = navTarget(p, goal);
        const to = new THREE.Vector3(way.x - p.x, 0, way.z - p.z);
        const d = Math.hypot(goal.x - p.x, goal.z - p.z);
        if (d < 0.2 || pl.t > 20) {
          if (pl.t > 20) p.set(goal.x, 0, goal.z);
          pl.phase = 'play';
          pl.t = 0;
        } else {
          e.heading += wrap(Math.atan2(to.x, to.z) - e.heading) * Math.min(1, dt * 8);
          const v = Math.min(e.sp.runSpeed * 0.7, Math.max(0.6, d * 2));
          p.addScaledVector(fwd(e.heading), Math.min(to.length(), v * dt));
          e.speed = v;
        }
        p.y = ground(p.x, p.z);
      } else {
        const T = 6;
        const k = pl.t;
        const part = toy.part;
        e.speed = 0;
        switch (toyId) {
          case 'wheel':
            // Dans la roue : elle tourne pendant que le lapin court.
            p.set(toy.x, ground(toy.x, toy.z) + 0.07, toy.z);
            e.heading = 0;
            e.speed = 2.6;
            if (part) part.rotation.x -= dt * 6;
            break;
          case 'tunnel': {
            const dir = Math.floor(k / 2) % 2 ? -1 : 1;
            const u = ((k % 2) / 2) * 1.8 - 0.9;
            p.set(toy.x + u * dir, ground(toy.x, toy.z), toy.z);
            e.heading = dir > 0 ? Math.PI / 2 : -Math.PI / 2;
            e.speed = 1.8;
            e.scaleGroup.visible = Math.abs(u) > 0.5;
            break;
          }
          case 'ball': {
            const ang = k * 1.7;
            if (part) {
              part.position.set(Math.cos(ang) * 0.35, 0.11, Math.sin(ang) * 0.35);
              part.rotation.x += dt * 7;
            }
            const back = ang - 0.55;
            p.set(toy.x + Math.cos(back) * 0.35, ground(toy.x, toy.z), toy.z + Math.sin(back) * 0.35);
            e.heading = Math.atan2(-Math.sin(back), Math.cos(back));
            e.speed = 1.4;
            break;
          }
          case 'platform': {
            const up = Math.min(1, k / 0.6);
            const hop = k > 0.6 ? Math.max(0, Math.sin(k * 4)) * 0.08 : Math.sin(up * Math.PI) * 0.25;
            p.set(toy.x - 0.5 * (1 - up), ground(toy.x, toy.z) + 0.36 * up + hop, toy.z);
            e.heading = Math.PI / 2;
            break;
          }
          default: // foin : il mange, la tête en bas
            p.set(toy.x, ground(toy.x, toy.z), toy.z + 0.38);
            e.heading = Math.PI;
            if (!e.model.realDog && !e.model.realCat) e.model.neck.rotation.x = e.data.look.neckAngle + 0.9 + Math.sin(k * 7) * 0.06;
        }
        if (k > 1 && Math.floor(k) !== Math.floor(k - dt) && Math.floor(k) % 2 === 0) e.emit(toyId === 'hay' ? '🌾' : '💕', 1);
        if (k >= T) this.endPlay(pl, true);
      }
      e.root.rotation.y = e.heading;
    }
  }

  endPlay(pl, done) {
    const g = this.game;
    const { e, a, toy, toyId } = pl;
    this.plays = this.plays.filter((x) => x !== pl);
    e.scripted = false;
    e.scaleGroup.visible = true;
    e.state = 'idle';
    e.timer = 3;
    if (toyId === 'wheel') e.position.z = toy.z + 0.6;
    if (toyId === 'platform') e.position.x = toy.x - 0.6;
    if (toy.part && toyId === 'ball') toy.part.position.set(0, 0.11, 0);
    if (!done) return;
    const r = hutchPlay(a, toyId);
    if (!r.ok) return;
    e.emit('❤️', 3);
    addStat(g.profile, 'actvHutchPlay');
    g.xp('care');
    g.ui.toast(ta('actv_hutchDone', a, { toy: t(`actv_toy_${toyId}`) }), 4000);
    g.ui.refresh();
  }

  stopPlays() {
    for (const pl of [...this.plays]) this.endPlay(pl, false);
  }

}

// ---------------------------------------------------------------- base commune

export class Session {
  constructor(mgr, type, opts) {
    this.mgr = mgr;
    this.game = mgr.game;
    this.type = type;
    this.opts = opts;
    this.comp = opts.comp ?? null;
    this.place = this.game.profile.place;
    this.group = new THREE.Group();
    this.game.scene.add(this.group);
    this.time = 0;
    this.clock = 0;
    this.state = 'countdown';
    this.count = 3.2;
    this.lastCount = null;
    this.particles = [];
    this.scripted = [];
    this.crowd = null;
    this.cheer = 0;
    this.ok = true;
    this.hud = new ActivityHud(this.game.ui, {
      icon: SESSION_TYPES[type]?.icon ?? '🏇',
      title: this.comp ? t('actv_comp_title', { type: t(`actv_type_${type}`) }) : t(`actv_type_${type}`),
      onQuit: () => this.quit(),
    });
    document.body.classList.add('actv-running');
    // Agility et spectacle : on ne se déplace pas soi-même (pas de joystick).
    document.body.classList.toggle('actv-nomove', type === 'agility' || type === 'show');
    // (fenêtre ouverte, « Arrêter ? » : Espace et Entrée sont pour ses boutons, pas pour l'activité)
    this.keyHandler = (e) => { if (!this.game.ui.modalOpen) this.onKeyDown?.(e); };
    window.addEventListener('keydown', this.keyHandler);
  }

  async quit() {
    if (this.state === 'done') return;
    if (await this.game.ui.confirm(t('actv_quitConfirm'))) {
      this.game.ui.toast(t('actv_quitDone'));
      this.end(true);
    }
  }

  y(x, z) {
    return this.game.world.heightAt(x, z);
  }

  put(obj, x, z, heading = 0) {
    obj.position.set(x, this.y(x, z), z);
    obj.rotation.y = heading;
    this.group.add(obj);
    return obj;
  }

  /** Petites particules emoji (applaudissements, étoiles…). */
  burst(emoji, pos, n = 4, spread = 1.5, size = 0.6) {
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(emoji), transparent: true, depthWrite: false }));
      s.position.set(pos.x + (Math.random() - 0.5) * spread, pos.y + Math.random() * 0.5, pos.z + (Math.random() - 0.5) * spread);
      s.scale.setScalar(size);
      s.userData = { life: 1.2 + Math.random() * 0.6, vy: 1 + Math.random() * 0.8, delay: i * 0.08 };
      s.visible = false;
      this.group.add(s);
      this.particles.push(s);
    }
  }

  /** Public dans la tribune (concours et spectacles). */
  addCrowd(density = 0.75) {
    const stand = this.game.world.showground?.userData.stand;
    if (!stand) return;
    const rng = mulberry32(this.place.length * 31 + (this.comp?.day ?? 7));
    const seats = stand.userData.seats.filter(() => rng() < density);
    this.crowd = spectators(seats, rng);
    stand.add(this.crowd);
  }

  applause(power = 1) {
    this.cheer = Math.max(this.cheer, power);
    const stand = this.game.world.showground?.userData.stand;
    if (stand && this.crowd) {
      const p = new THREE.Vector3();
      stand.getWorldPosition(p);
      for (let i = 0; i < Math.round(3 + power * 6); i++) {
        this.burst(i % 3 ? '👏' : '🎉', { x: p.x + (Math.random() - 0.5) * 22, y: p.y + 2.4, z: p.z + 0.8 }, 1, 1, 0.8);
      }
    }
  }

  /** Un animal joué par l'activité (il ne fait plus ce qu'il veut). */
  script(e) {
    e.scripted = true;
    e.data.following = false;
    e.sleeping = false;
    this.scripted.push(e);
  }

  updateCommon(dt) {
    this.time += dt;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const s = this.particles[i];
      const u = s.userData;
      if (u.delay > 0) {
        u.delay -= dt;
        continue;
      }
      s.visible = true;
      u.life -= dt;
      s.position.y += u.vy * dt;
      s.material.opacity = Math.min(1, u.life);
      if (u.life <= 0) {
        this.group.remove(s);
        s.material.dispose();
        this.particles.splice(i, 1);
      }
    }
    this.cheer = Math.max(0, this.cheer - dt * 0.4);
    if (this.crowd) this.crowd.userData.cheer(this.time, this.cheer);
    for (const o of this.group.children) {
      if (o.userData.spin) o.userData.spin.rotation.z += dt * 0.8;
      if (o.userData.bob) o.position.y = o.userData.bob + Math.sin(this.time * 3) * 0.25;
    }
    if (this.state === 'countdown') {
      this.count -= dt;
      const n = Math.ceil(this.count - 0.2);
      if (n !== this.lastCount) {
        this.lastCount = n;
        this.hud.big(n > 0 ? String(n) : t('actv_go'), n > 0 ? 800 : 900);
      }
      if (this.count <= 0) {
        this.state = 'run';
        this.onGo?.();
      }
    } else if (this.state === 'run') {
      this.clock += dt;
    }
  }

  /** Fin de l'activité : récompenses et fenêtre des résultats. */
  finish(result, info) {
    const g = this.game;
    const p = g.profile;
    this.state = 'done';
    const animals = info.animals;
    const main = animals[0];
    if (this.opts.onResult) {
      // Concours à l'extérieur (src/game/CompetitionVenue.js) : le site gère classement, barrage et podium.
      this.hud.setMain(null);
      const cb = this.opts.onResult;
      this.end(false);
      cb(result, info);
      return;
    }
    addStat(p, SESSION_TYPES[this.type]?.stat ?? 'actvOther');
    if (this.type === 'jumping' && result.clear) addStat(p, 'actvClear');
    g.xp(this.type === 'show' ? 'show' : 'activity');
    let award = null;
    let rank = null;
    let table = null;
    let money = 0;
    if (this.comp) {
      // info.rivals : concurrents particuliers (concours de beauté : ceux de la classe de l'animal).
      ({ rank, table } = ranking(this.comp, { ...result, name: p.name, animal: main.name, species: main.species }, info.rivals));
      award = placementAward(this.comp, rank);
      money = award.money;
      addStat(p, 'actvCompetitions');
      if (rank <= 3) addStat(p, 'actvPodiums');
      if (rank === 1) addStat(p, 'actvWins');
      g.xp('competition');
      if (rank <= 3) g.xp('podium');
    } else {
      award = practiceAward(this.type, result.stars, this.type === 'show' ? 5 : 3);
      if (this.type === 'show') money = info.earnings ?? 0;
    }
    if (money && !isSandbox(p)) earn(p, money);
    if (money) g.audio?.ui('coin');
    let saved = null;
    if (award) {
      saved = addAward(p, award, {
        type: this.type, day: g.day, place: p.place, animal: main.name, animalId: main.id, species: main.species,
        level: this.comp?.levelId ?? null, rank,
      });
    }
    const record = !['show', 'lesson'].includes(this.type) && recordBest(p, this.type, main.id, result);
    for (const a of animals) activitySkillGain(a, this.type, info.quality ?? 0.5);
    g.save();
    g.ui.refresh();
    this.hud.setMain(null);
    showActivityResults(g.ui, {
      type: this.type, result, comp: this.comp, rank, table, award: saved, money: isSandbox(p) ? 0 : money,
      animal: main, record, extra: info.extra, body: info.body,
      onAgain: this.comp ? null : () => this.again(),
      onClose: () => this.end(false),
    });
  }

  again() {
    const { type, opts } = this;
    this.end(false);
    this.mgr.start(type, opts);
  }

  end(aborted = false) {
    if (this.ended) return;
    this.ended = true;
    this.cleanup?.(aborted);
    window.removeEventListener('keydown', this.keyHandler);
    for (const e of this.scripted) {
      e.scripted = false;
      e.carried = false; // (porté dans les bras : concours de beauté des chats et lapins)
      if (this.onTable !== undefined) e.onTable = false; // (et posé sur sa table)
      e.scaleGroup.position.set(0, 0, 0);
      e.scaleGroup.rotation.set(0, 0, 0);
      e.scaleGroup.visible = true;
      e.state = 'idle';
      e.timer = 2;
    }
    if (this.crowd) {
      this.crowd.parent?.remove(this.crowd);
      this.crowd.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
    }
    this.game.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isMesh || o.isSprite || o.isLine) {
        if (!o.isSprite) o.geometry?.dispose(); // les sprites partagent la même géométrie
        if (o.material.map && !o.isSprite) o.material.map.dispose();
        o.material.dispose();
      }
    });
    for (const l of this.lights ?? []) {
      this.game.scene.remove(l);
      this.game.scene.remove(l.target);
      l.dispose();
    }
    this.hud.remove();
    document.body.classList.remove('actv-running', 'actv-nomove');
    if (this.mgr.session === this) this.mgr.session = null;
    this.game.ui.refresh();
  }

  /** Place le joueur (et sa monture) d'un coup, avec un petit fondu. */
  teleportPlayer(x, z, heading) {
    const g = this.game;
    const pl = g.player;
    pl.cancelGoTo();
    pl.root.position.set(x, this.y(x, z), z);
    pl.heading = heading;
    pl.speed = 0;
    if (pl.mount) {
      pl.mount.position.copy(pl.root.position);
      pl.mount.heading = heading;
    }
    g.rig.yaw = heading;
    g.rig.reset();
    this.hud.fade();
  }
}

// 🧭 Guide de randonnée (src/game/TrailGuide.js) : la balade guidée réutilise la base des activités.
export { Session as ActivitySession, fmtTime as fmtActivityTime };

/** Remet la monture droite (après un saut). */
function resetPose(e) {
  e.scaleGroup.rotation.x = 0;
  e.scaleGroup.position.y = 0;
  e.scaleGroup.position.z = 0;
}

const smooth01 = (a, b, x) => {
  const u = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};
/** Tangage du cheval au saut (rad) : il lève l'avant-main à l'appel, passe à plat au sommet, plonge un peu à la réception. */
const JUMP_PITCH = 0.16;

/**
 * Bascule de la monture (et du cavalier) autour de son centre au saut : le groupe d'échelle tourne de pitch
 * (x, négatif = avant-main levée) autour du point (0, hc, zc) du repère de l'entité, au lieu du sol sous le
 * ventre (le dos reculait de 35 cm, le cavalier se retrouvait sur l'encolure). Le cavalier (racine de
 * l'avatar, même repère : le joueur est à la place du cheval) tourne autour du même point.
 */
export function pitchAbout(e, pitch, hc, zc, avatarRoot) {
  const c = Math.cos(pitch);
  const s = Math.sin(pitch);
  const sg = e.scaleGroup;
  sg.rotation.x = pitch;
  sg.position.y = hc - (hc * c - zc * s);
  sg.position.z = zc - (hc * s + zc * c);
  if (avatarRoot) {
    const p = avatarRoot.position;
    const y = p.y - hc;
    const z = p.z - zc;
    p.y = hc + y * c - z * s;
    p.z = zc + y * s + z * c;
    avatarRoot.rotation.x = pitch;
  }
}

/**
 * Pose d'un saut d'obstacle à sa phase t (0 → 1, de l'appel à la réception), écrite après l'animation.
 * Un vrai saut : appel (avant-main levée, postérieurs qui poussent), bascule (à plat au sommet, encolure
 * étirée vers l'avant et le bas au-dessus de la barre, membres repliés), réception (antérieurs tendus
 * vers le sol, un peu le nez en bas, puis l'encolure se relève). Le cheval tourne autour de son centre,
 * le cavalier avec lui, en suspension (pl.jumpPose, lue par Player.lateUpdate et animateAvatarRide) ;
 * ses mains restent au-dessus de l'encolure (Player.handsOverNeck, après les séances).
 */
export function poseJump(e, pl, t) {
  const md = e.model;
  const s = Math.sin(Math.PI * t);
  const sc = e.scaleGroup.scale.y;
  const pitch = -JUMP_PITCH * Math.sin(2 * Math.PI * t);
  pitchAbout(e, pitch, (md.y0 ?? (md.saddleY ?? 1.2) * 0.75) * sc, -0.075 * sc, pl.avatar?.root);
  const bump = (a, b) => (t > a && t < b ? Math.sin((Math.PI * (t - a)) / (b - a)) ** 2 : 0);
  if (md.neck) md.neck.rotateX(0.3 * bump(0.12, 0.85) - 0.08 * bump(0, 0.22) - 0.12 * bump(0.75, 1));
  // (cheval réaliste : membres selon la phase du saut, horseReal.js)
  if (!realLegPose(md, 'jump', s, null, t)) for (const l of md.legs) l.pivot.rotation.x = l.front ? -1.25 * s : 0.85 * s;
  pl.jumpPose = smooth01(0, 0.18, t) * (1 - smooth01(0.75, 0.98, t));
}

// ---------------------------------------------------------------- saut d'obstacles

class JumpingSession extends Session {
  constructor(mgr, type, opts) {
    super(mgr, type, opts);
    const g = this.game;
    const a = opts.animal;
    const e = g.entities.get(a.id);
    const why = eligibility(a, 'jumping');
    if (!e || why) {
      g.ui.toast(ta(`actv_why_${why ?? 'notHere'}`, a), 5000);
      this.ok = false;
      return;
    }
    this.animal = a;
    this.level = this.comp?.level ?? 1;
    this.autoJump = opts.autoJump ?? true;
    this.lesson = type === 'lesson';
    // Le parcours : des barres au sol pour débuter, plus haut quand le cheval a appris.
    this.stage = this.comp ? stageForLevel(this.level) : (opts.stage ?? stageFor(a.skills.jump));
    // opts.course : parcours de concours (src/sim/competitions.js), sinon le parcours du niveau.
    const course = opts.course ?? courseForStage(this.stage);
    this.start = this.lesson ? LESSON_START : course.start;
    if (this.lesson) {
      // Leçon : un seul obstacle au milieu, la barre monte à chaque réussite.
      this.step = lessonStart(a.skills.jump);
      this.lessonJumps = 0;
      this.lessonOk = 0;
      this.gained = 0;
      const w = toWorld(LESSON_SPOT);
      this.obstacles = [{ ...LESSON_SPOT, x: w.x, z: w.z, n: null, width: 3.6, colors: [0xd8402f, 0xffffff], done: false }];
      this.buildLessonObstacle();
    } else {
      this.obstacles = course.obstacles.map((o) => {
        const w = toWorld(o);
        const model = jumpObstacle(o, o.height);
        this.put(model.group, w.x, w.z, o.heading);
        return { ...o, x: w.x, z: w.z, model, done: false };
      });
    }
    const st = toWorld(this.start);
    const finishDef = course.finish ?? JUMP_COURSE.finish;
    const fin = toWorld(finishDef);
    this.finishLine = { ...finishDef, x: fin.x, z: fin.z };
    if (!this.lesson) {
      this.put(flagPair(finishDef.width, t('actv_finish')), fin.x, fin.z, finishDef.heading);
      this.put(flagPair(6, t('actv_start')), st.x - 2.5, st.z, this.start.heading);
    }
    this.arrow = guideArrow();
    this.group.add(this.arrow);
    this.next = 0;
    this.rails = 0;
    this.refusals = 0;
    this.jump = null;
    this.push = 0;
    this.want = -1;
    this.par = course.par ?? parTime(JUMP_COURSE);
    this.prev = this.obstacles.map(() => null);
    if (this.comp) this.addCrowd();

    // En selle, sur la ligne de départ.
    if (g.player.mount && g.player.mount !== e) g.dismount();
    if (!g.player.mount) {
      e.position.set(st.x, 0, st.z);
      if (!g.ride(a)) {
        this.ok = false;
        return;
      }
    }
    this.mount = e;
    this.teleportPlayer(st.x, st.z, this.start.heading);
    this.hud.setMain({ icon: '⤴️', label: t('actv_jumpBtn'), key: t('actv_key_space'), onClick: () => this.action() });
    this.hud.setToggle(t('actv_autoJump'), this.autoJump, (v) => { this.autoJump = v; });
    this.hud.hint(ta(this.lesson ? 'actv_lessonHint' : 'actv_jumpHint', a));
    this.refreshHud();
  }

  /** (Re)construit l'obstacle de la leçon à la hauteur de l'étape actuelle. */
  buildLessonObstacle() {
    const o = this.obstacles[0];
    const st = LESSON_STEPS[this.step];
    if (o.model) {
      this.group.remove(o.model.group);
      o.model.group.traverse((m) => { if (m.isMesh) { m.geometry.dispose(); m.material.map?.dispose(); m.material.dispose(); } });
    }
    o.type = st.type;
    o.height = st.height;
    o.model = jumpObstacle(o, st.height);
    this.put(o.model.group, o.x, o.z, o.heading);
  }

  /** Après un saut de leçon : la barre monte si c'est réussi. */
  lessonJumped(clean) {
    const a = this.animal;
    this.lessonJumps++;
    if (clean) {
      this.lessonOk++;
      const gain = lessonGain(a.skills.jump, LESSON_STEPS[this.step].height);
      a.skills.jump = Math.min(100, a.skills.jump + gain);
      this.gained += gain;
      if (this.step < LESSON_STEPS.length - 1) {
        this.step++;
        this.hud.big(t('actv_lessonUp'), 1100, 'good');
      } else this.hud.big(t('actv_perfect'), 900, 'good');
      this.mount.emit('💪', 2);
    } else {
      this.hud.big(t('actv_lessonAgain'), 1000, 'bad');
    }
    this.buildLessonObstacle();
    this.obstacles[0].done = false;
    this.next = 0;
    if (this.lessonJumps >= LESSON_JUMPS) this.completeLesson();
  }

  completeLesson() {
    const a = this.animal;
    const result = lessonResult({ success: this.lessonOk, jumps: this.lessonJumps, gained: this.gained, step: this.step });
    this.state = 'finishing';
    this.hud.big(t('actv_lessonDone'), 1500, 'good');
    const extra = [t('actv_lessonResult', { n: this.lessonOk, total: this.lessonJumps }), t('actv_jumpSkill', { n: this.gained, v: Math.round(a.skills.jump) })];
    const before = stageFor(a.skills.jump - this.gained);
    const after = stageFor(a.skills.jump);
    if (after > before) extra.push(t('actv_nextStage', { stage: t(`actv_stage_${JUMP_STAGES[after].id}`) }));
    setTimeout(() => !this.ended && this.finish(result, { animals: [a], quality: this.lessonOk / this.lessonJumps, extra }), 1200);
  }

  onKeyDown(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      this.action();
    }
  }

  action() {
    if (this.state === 'run') this.want = this.time;
  }

  refreshHud() {
    if (this.lesson) {
      const st = LESSON_STEPS[this.step];
      this.hud.stats([
        ['🎓', t('actv_lessonStep', { n: this.step + 1, total: LESSON_STEPS.length, what: t(`actv_ob_${st.type}`), h: Math.round(st.height * 100) })],
        ['🔁', t('actv_lessonJumps', { n: this.lessonJumps, total: LESSON_JUMPS })],
        ['💪', `${t('skill_jump')} ${Math.round(this.animal.skills.jump)}`],
      ]);
      return;
    }
    const total = this.obstacles.length;
    const faults = this.rails * 4 + this.refusals * 4;
    this.hud.stats([
      ['🚧', this.next < total ? t('actv_nextObstacle', { n: this.next + 1, total }) : t('actv_toFinish')],
      ['⏱️', `${this.clock.toFixed(1)} s / ${this.par} s`],
      ['❌', t('actv_faults', { n: faults })],
    ]);
  }

  update(dt) {
    this.updateCommon(dt);
    const g = this.game;
    const pl = g.player;
    if (this.state === 'done') return;
    if (pl.mount !== this.mount) {
      g.ui.toast(t('actv_dismounted'));
      this.end(true);
      return;
    }
    const p = pl.root.position;
    if (this.state === 'countdown') {
      const st = toWorld(this.start);
      p.set(st.x, this.y(st.x, st.z), st.z);
      pl.heading = this.start.heading;
      pl.speed = 0;
      this.mount.position.copy(p);
      this.mount.heading = pl.heading;
    }
    // Galop de concours : on garde une vitesse raisonnable dans la carrière.
    pl.speed = Math.min(pl.speed, ARENA_SPEED * (1 + this.animal.skills.speed / 300));

    // Flèche au-dessus du prochain obstacle (ou de l'arrivée).
    const target = this.obstacles[this.next] ?? this.finishLine;
    this.arrow.position.set(target.x, this.y(target.x, target.z) + 2.6 + Math.sin(this.time * 4) * 0.2, target.z);
    this.arrow.rotation.y += dt * 2;
    // Tout près, la flèche gênerait la vue : on la cache.
    this.arrow.visible = Math.hypot(target.x - p.x, target.z - p.z) > 6;

    // Barres qui tombent
    for (const o of this.obstacles) {
      for (const m of o.model.poles) {
        const f = m.userData.fall;
        if (!f) continue;
        f.t = Math.min(1, f.t + dt * 2.2);
        m.position.y = f.y0 + (0.07 - f.y0) * f.t * f.t;
        m.rotation.x = f.t * 0.6;
      }
    }

    if (this.jump) {
      this.updateJump(dt);
    } else if (this.push > 0) {
      // Refus : le cheval recule de quelques pas.
      this.push -= dt;
      const o = this.refusedAt;
      p.addScaledVector(fwd(o.heading), -2.6 * dt);
      pl.speed = 0;
      this.mount.position.copy(p);
    } else if (this.state === 'run') {
      this.checkObstacles();
    }

    if (this.state === 'run') {
      // Arrivée
      if (!this.lesson && this.next >= this.obstacles.length && !this.jump) {
        const a = approach(this.finishLine, p.x, p.z);
        if (Math.abs(a.v) < this.finishLine.width / 2 + 0.5 && a.u > 0 && (this.prevFinish ?? -1) <= 0) this.complete();
        this.prevFinish = a.u;
      }
      this.refreshHud();
    }
  }

  checkObstacles() {
    const pl = this.game.player;
    const p = pl.root.position;
    const pressed = this.time - this.want < 0.45;
    if (this.lesson) {
      // Leçon : on peut sauter l'obstacle dans les deux sens (il se tourne vers le cavalier).
      const o = this.obstacles[0];
      const a = approach(o, p.x, p.z);
      if (Math.abs(a.u) > 4 && alignment({ heading: o.heading + Math.PI }, pl.heading) > alignment(o, pl.heading)) {
        o.heading = wrap(o.heading + Math.PI);
        o.model.group.rotation.y = o.heading;
        this.prev[0] = null;
      }
    }
    this.obstacles.forEach((o, i) => {
      const a = approach(o, p.x, p.z);
      const prev = this.prev[i];
      this.prev[i] = a.u;
      if (prev === null || this.jump) return;
      const inLane = Math.abs(a.v) < o.width / 2 + 0.25;
      if (!inLane) return;
      const al = alignment(o, pl.heading);
      const alBack = alignment({ heading: o.heading + Math.PI }, pl.heading);
      if (i !== this.next) {
        // Un autre obstacle : le cheval le saute quand même, mais il ne compte pas.
        const forward = prev < -0.7 && a.u >= -0.7 && al > 0.3;
        const backward = prev > 0.7 && a.u <= 0.7 && alBack > 0.3;
        if (forward || backward) {
          this.startJump(o, forward ? o.heading : o.heading + Math.PI, 0.7, false);
          if (!o.done) this.game.ui.toast(t('actv_wrongObstacle', { n: this.next + 1 }), 2500);
        }
        return;
      }
      // Le bon obstacle : appel au bon moment.
      if (pressed && a.u > -3.6 && a.u < -0.4 && !refuses(al, pl.speed)) {
        this.want = -1;
        this.startJump(o, o.heading, takeoffQuality(a.u), true);
        return;
      }
      if (this.autoJump && prev < -TAKEOFF && a.u >= -TAKEOFF && !refuses(al, pl.speed) && al > 0.5) {
        this.startJump(o, o.heading, 0.65, true);
        return;
      }
      if (prev < -0.5 && a.u >= -0.5) {
        if (!refuses(al, pl.speed) && this.autoJump) this.startJump(o, o.heading, 0.3, true);
        else this.refuse(o);
      }
    });
  }

  refuse(o, tooHigh = false) {
    this.refusals++;
    this.refusedAt = o;
    this.push = 0.8;
    this.game.player.speed = 0;
    this.mount.emit(tooHigh ? '😨' : '❗', 1);
    this.hud.big(t('actv_refusal'), 900, 'bad');
    this.game.ui.toast(ta(tooHigh ? (this.lesson ? 'actv_lessonDown' : 'actv_tooHigh') : 'actv_refusalHint', this.animal), 4500);
    if (this.lesson) {
      // Trop haut pour l'instant : on redescend la barre d'un cran.
      this.refusals--;
      this.step = Math.max(0, this.step - 1);
      this.lessonJumps++;
      this.buildLessonObstacle();
      if (this.lessonJumps >= LESSON_JUMPS) this.completeLesson();
    }
  }

  startJump(o, heading, timing, counts) {
    const pl = this.game.player;
    // Un obstacle trop haut pour ce qu'il a appris : le cheval a peur et se dérobe.
    if (counts && Math.random() < refusalChance(this.animal.skills.jump, o.height)) {
      this.refuse(o, true);
      return;
    }
    const stats = horseJumpStats(this.animal);
    const al = alignment({ heading }, pl.heading);
    const chance = jumpChance({ ...stats, height: o.height, align: al, timing });
    const clean = Math.random() < chance;
    const speed = Math.max(4.5, pl.speed);
    this.jump = {
      o, counts, clean, t: 0, dur: 0.62 + o.height * 0.22,
      from: pl.root.position.clone(), heading, h0: pl.heading,
      dist: Math.max(3.6, speed * (0.62 + o.height * 0.22)), height: o.height * 1.1 + 0.3, speed, timing,
    };
    if (counts && timing > 0.85) this.hud.big(t('actv_perfect'), 700, 'good');
  }

  updateJump(dt) {
    const j = this.jump;
    const pl = this.game.player;
    const e = this.mount;
    j.t = Math.min(1, j.t + dt / j.dur);
    const s = Math.sin(Math.PI * j.t);
    const pos = j.from.clone().addScaledVector(fwd(j.heading), j.dist * j.t);
    const ground = this.y(pos.x, pos.z);
    pl.root.position.set(pos.x, ground + s * j.height, pos.z);
    pl.heading = j.h0 + wrap(j.heading - j.h0) * Math.min(1, j.t * 3);
    pl.root.rotation.y = pl.heading;
    pl.speed = j.speed;
    e.position.copy(pl.root.position);
    e.heading = pl.heading;
    e.root.rotation.y = pl.heading;
    poseJump(e, pl, j.t);
    // Faute : la barre tombe au passage.
    if (!j.clean && !j.knocked && j.t > 0.5) {
      j.knocked = true;
      const pole = j.o.model.poles[0];
      if (pole) pole.userData.fall = { t: 0, y0: pole.position.y };
      if (j.counts) {
        this.rails++;
        this.hud.big(t(j.o.type === 'water' ? 'actv_splash' : 'actv_rail'), 900, 'bad');
        if (j.o.type === 'water') this.burst('💦', pl.root.position.clone(), 5, 1.2, 0.5);
      }
    }
    if (j.t >= 1) {
      this.jump = null;
      resetPose(e);
      pl.avatar.root.rotation.x = 0;
      pl.jumpPose = 0;
      if (j.counts && this.lesson) {
        this.prev[0] = null;
        this.lessonJumped(j.clean);
      } else if (j.counts) {
        j.o.done = true;
        this.next++;
        if (j.clean) {
          e.emit('⭐', 2);
          if (this.comp) this.applause(0.5);
        }
        for (let i = 0; i < this.prev.length; i++) this.prev[i] = null;
      }
    }
  }

  complete() {
    const result = jumpingResult({ rails: this.rails, refusals: this.refusals, time: this.clock, par: this.par });
    if (this.comp || result.clear) this.applause(result.clear ? 1 : 0.5);
    if (result.clear) this.burst('🎉', this.game.player.root.position.clone().setY(this.game.player.root.position.y + 2.5), 8, 2);
    this.hud.big(result.clear ? t('actv_clearRound') : t('actv_finished'), 1500, result.clear ? 'good' : '');
    const quality = Math.max(0, 1 - result.total / 16);
    setTimeout(() => !this.ended && this.finish(result, { animals: [this.animal], quality }), 1200);
    this.state = 'finishing';
  }

  cleanup() {
    const e = this.mount;
    if (e) resetPose(e);
    if (this.game.player.avatar) this.game.player.avatar.root.rotation.x = 0;
    this.game.player.jumpPose = 0;
  }
}

// ---------------------------------------------------------------- balade

class TrailSession extends Session {
  constructor(mgr, type, opts) {
    super(mgr, type, opts);
    const g = this.game;
    const w = g.world;
    const a = opts.animal ?? null;
    // On part à cheval, ou à pied avec les animaux qui nous suivent.
    if (a) {
      const e = g.entities.get(a.id);
      const why = eligibility(a, 'trail');
      if (!e || why) {
        g.ui.toast(ta(`actv_why_${why ?? 'notHere'}`, a), 5000);
        this.ok = false;
        return;
      }
      if (g.player.mount && g.player.mount !== e) g.dismount();
      if (!g.player.mount) {
        e.position.set(TRAIL.start.x, 0, TRAIL.start.z);
        if (!g.ride(a)) {
          this.ok = false;
          return;
        }
      }
      this.mount = e;
    }
    this.walkers = g.animalsHere().filter((x) => x.following);
    this.animals = [...(a ? [a] : []), ...this.walkers];
    if (!this.animals.length) {
      g.ui.toast(t('actv_trailNeedAnimal'), 5000);
      this.ok = false;
      return;
    }
    // Itinéraire : on évite l'eau (on rapproche la balise de la ferme).
    const dry = (pt) => {
      const q = { ...pt };
      for (let i = 0; i < 20 && w.isWater(q.x, q.z); i++) {
        q.x *= 0.9;
        q.z *= 0.9;
      }
      return q;
    };
    this.points = TRAIL.checkpoints.map(dry);
    this.markers = this.points.map((pt, i) => {
      const m = trailMarker(i + 1, i === this.points.length - 1);
      this.put(m, pt.x, pt.z);
      return m;
    });
    this.collectibles = trailCollectibles([TRAIL.start, ...this.points], `${this.place}-trail`).filter((c) => !w.isWater(c.x, c.z)).map((c) => {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(COLLECT_EMOJI[c.kind]), transparent: true, depthWrite: false }));
      s.scale.setScalar(0.9);
      const y = this.y(c.x, c.z) + 1.2;
      s.position.set(c.x, y, c.z);
      s.userData.bob = y;
      this.group.add(s);
      return { ...c, sprite: s, taken: false };
    });
    this.sights = TRAIL.sights.map((sg) => {
      const q = dry(sg);
      const m = sightModel(sg.id);
      this.put(m, q.x, q.z, Math.atan2(-q.x, -q.z));
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture('📷'), transparent: true, depthWrite: false }));
      s.scale.setScalar(1.3);
      s.position.set(q.x, this.y(q.x, q.z) + (sg.id === 'windmill' ? 8.6 : sg.id === 'oldTree' ? 8 : 3.4), q.z);
      this.group.add(s);
      return { ...sg, x: q.x, z: q.z, model: m, icon: s, taken: false };
    });
    this.arrow = guideArrow(0xff8a1f);
    this.group.add(this.arrow);
    this.next = 0;
    this.collected = 0;
    this.photos = 0;
    if (!this.mount) {
      this.teleportPlayer(TRAIL.start.x, TRAIL.start.z, Math.atan2(this.points[0].x - TRAIL.start.x, this.points[0].z - TRAIL.start.z));
      for (const x of this.walkers) g.callHere(x);
    } else {
      this.teleportPlayer(TRAIL.start.x, TRAIL.start.z, Math.atan2(this.points[0].x - TRAIL.start.x, this.points[0].z - TRAIL.start.z));
    }
    this.hud.setMain({ icon: '📷', label: t('actv_photoBtn'), key: t('actv_key_space'), onClick: () => this.action(), disabled: true });
    this.hud.hint(t(this.mount ? 'actv_trailHint' : 'actv_trailHintFoot'));
    this.refreshHud();
  }

  onKeyDown(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      this.action();
    }
  }

  nearSight() {
    const p = this.game.player.root.position;
    return this.sights.find((s) => !s.taken && Math.hypot(s.x - p.x, s.z - p.z) < 14);
  }

  action() {
    if (this.state !== 'run') return;
    const s = this.nearSight();
    if (!s) {
      this.game.ui.toast(t('actv_noSight'));
      return;
    }
    s.taken = true;
    this.photos++;
    s.icon.material.map = emojiTexture('✅');
    this.takePhoto(s);
    this.hud.flash();
    this.game.ui.toast(t('actv_photoTaken', { what: t(`actv_sight_${s.id}`) }), 3000);
    this.game.xp('photo');
  }

  /** Petite photo de l'écran gardée dans l'album (sans réseau, dans la sauvegarde). */
  takePhoto(s) {
    const g = this.game;
    try {
      g.renderer.render(g.scene, g.camera);
      const src = g.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 192;
      c.height = 120;
      const ctx = c.getContext('2d');
      const ratio = c.width / c.height;
      let sw = src.width;
      let sh = sw / ratio;
      if (sh > src.height) {
        sh = src.height;
        sw = sh * ratio;
      }
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      const d = activityData(g.profile);
      d.photos.push({ sight: s.id, day: g.day, place: g.profile.place, data: c.toDataURL('image/jpeg', 0.7) });
      if (d.photos.length > 24) d.photos.shift();
      addStat(g.profile, 'actvPhotos');
    } catch {
      /* pas de photo possible : tant pis */
    }
  }

  refreshHud() {
    const total = this.points.length;
    this.hud.stats([
      ['🚩', this.next < total ? t('actv_checkpoint', { n: this.next + 1, total }) : t('actv_toFinish')],
      ['🍎', `${this.collected}/${this.collectibles.length}`],
      ['📷', `${this.photos}/${this.sights.length}`],
      ['⏱️', fmtTime(this.clock)],
    ]);
  }

  update(dt) {
    this.updateCommon(dt);
    const g = this.game;
    if (this.state === 'done' || this.state === 'finishing') return;
    if (this.mount && g.player.mount !== this.mount) {
      g.ui.toast(t('actv_dismounted'));
      this.end(true);
      return;
    }
    const p = g.player.root.position;
    if (this.state === 'countdown') {
      p.set(TRAIL.start.x, this.y(TRAIL.start.x, TRAIL.start.z), TRAIL.start.z);
      g.player.speed = 0;
      if (this.mount) this.mount.position.copy(p);
    }
    const target = this.points[this.next];
    if (target) this.arrow.position.set(target.x, this.y(target.x, target.z) + 3.6 + Math.sin(this.time * 4) * 0.25, target.z);
    this.markers.forEach((m, i) => {
      m.visible = i >= this.next;
      m.userData.ring.material.opacity = i === this.next ? 0.55 + Math.sin(this.time * 5) * 0.3 : 0.35;
    });
    const r = this.mount ? 4.2 : 3.2;
    if (this.state === 'run') {
      for (const c of this.collectibles) {
        if (c.taken) continue;
        if (Math.hypot(c.x - p.x, c.z - p.z) < (this.mount ? 2.6 : 1.8)) {
          c.taken = true;
          c.sprite.visible = false;
          this.collected++;
          this.burst('✨', c.sprite.position, 3, 0.6, 0.4);
        }
      }
      if (target && Math.hypot(target.x - p.x, target.z - p.z) < r) {
        this.next++;
        this.burst('⭐', { x: target.x, y: this.y(target.x, target.z) + 2.6, z: target.z }, 4, 1.4);
        if (this.next >= this.points.length) this.complete();
        else this.hud.big(`🚩 ${this.next}/${this.points.length}`, 700, 'good');
      }
      this.hud.setMainEnabled(!!this.nearSight());
      this.refreshHud();
    }
  }

  complete() {
    const result = trailResult({
      checkpoints: this.next, totalCheckpoints: this.points.length, collected: this.collected,
      totalCollectibles: this.collectibles.length, photos: this.photos, time: this.clock,
      longRide: tackEffects(this.mount?.data).longRide, // selle de randonnée ou western (src/sim/gear.js)
    });
    // Endurance : le cheval et les animaux qui ont marché avec nous.
    const gain = trailEnduranceGain(this.next);
    for (const a of this.animals) a.skills.endurance = Math.min(100, (a.skills.endurance ?? 10) + gain);
    this.hud.big(t('actv_trailDone'), 1500, 'good');
    this.state = 'finishing';
    setTimeout(() => !this.ended && this.finish(result, {
      animals: this.animals, quality: result.points / result.max,
      extra: [t('actv_enduranceGain', { n: gain })],
    }), 1200);
  }
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

// ---------------------------------------------------------------- agility

class AgilitySession extends Session {
  constructor(mgr, type, opts) {
    super(mgr, type, opts);
    const g = this.game;
    const a = opts.animal;
    const e = g.entities.get(a?.id);
    const why = a ? eligibility(a, 'agility') : 'notHere';
    if (!e || why) {
      if (a) g.ui.toast(ta(`actv_why_${why ?? 'notHere'}`, a), 5000);
      this.ok = false;
      return;
    }
    if (g.player.mount) g.dismount();
    this.animal = a;
    this.e = e;
    this.script(e);
    // Les obstacles sont plus petits pour les petits animaux.
    const small = a.species !== 'dog' || e.scale < 0.65;
    this.size = small ? 0.62 : 1;
    this.obstacles = AGILITY_COURSE.obstacles.map((o) => {
      const w = toWorld(o);
      const model = agilityObstacle(o.type, o.n);
      model.scale.setScalar(o.type === 'tunnel' || o.type === 'weave' || o.type === 'seesaw' ? Math.max(0.8, this.size) : this.size);
      this.put(model, w.x, w.z, o.heading);
      return { ...o, x: w.x, z: w.z, model, len: AGILITY_LENGTH[o.type] };
    });
    const st = toWorld(AGILITY_COURSE.start);
    const fin = toWorld(AGILITY_COURSE.finish);
    this.finishPt = { x: fin.x, z: fin.z };
    this.put(flagPair(AGILITY_COURSE.finish.width, t('actv_finish')), fin.x, fin.z, AGILITY_COURSE.finish.heading);
    this.arrow = guideArrow(0x2f6fd8);
    this.group.add(this.arrow);
    e.position.set(st.x, this.y(st.x, st.z), st.z);
    e.heading = AGILITY_COURSE.start.heading;
    this.handler = new THREE.Vector3(st.x + 1.5, 0, st.z + 2.2);
    this.teleportPlayer(this.handler.x, this.handler.z, e.heading);
    g.rig.yaw = e.heading;
    this.speed = agilitySpeed(a);
    this.next = 0;
    this.faults = 0;
    this.refusals = 0;
    this.phase = 'run'; // run (vers l'obstacle) | wait (attend l'ordre) | do (franchit) | stop (refus) | finish
    this.cmd = null; // commandement en cours
    this.qualities = [];
    this.par = agilityPar();
    if (this.comp) this.addCrowd();
    this.hud.hint(ta('actv_agilityHint', a));
    this.refreshHud();
  }

  onGo() {
    this.openCommand();
  }

  refreshHud() {
    this.hud.stats([
      ['🚧', this.next < this.obstacles.length ? t('actv_nextObstacle', { n: this.next + 1, total: this.obstacles.length }) : t('actv_toFinish')],
      ['⏱️', `${this.clock.toFixed(1)} s / ${this.par} s`],
      ['❌', t('actv_faults', { n: (this.faults + this.refusals) * 5 })],
    ]);
  }

  /** Point d'entrée de l'obstacle (le chien arrive par là). */
  entry(o) {
    return new THREE.Vector3(o.x, 0, o.z).addScaledVector(fwd(o.heading), -(o.len / 2 + 0.9));
  }

  exit(o) {
    return new THREE.Vector3(o.x, 0, o.z).addScaledVector(fwd(o.heading), o.len / 2 + 0.6);
  }

  /** Propose les ordres : le bon obstacle et deux autres, dans le désordre. */
  openCommand() {
    const o = this.obstacles[this.next];
    if (!o) {
      this.hud.setChoices(null);
      return;
    }
    const others = AGILITY_TYPES.filter((x) => x !== o.type).sort(() => Math.random() - 0.5).slice(0, 2);
    const options = [o.type, ...others].sort(() => Math.random() - 0.5);
    const dist = this.e.position.distanceTo(this.entry(o).setY(this.e.position.y));
    this.cmd = { o, given: false, start: this.time, dur: Math.max(1.4, Math.min(3, dist / this.speed)) };
    this.hud.setChoices(options.map((type) => ({
      icon: { hurdle: '🚧', tunnel: '🌀', weave: '〰️', seesaw: '⚖️', tyre: '⭕' }[type],
      label: t(`actv_ag_${type}`),
      onClick: () => this.command(type),
    })), t('actv_commandPrompt', { n: o.n }));
  }

  /** Phase du commandement (0 → 1 quand le chien arrive à l'obstacle). */
  get cmdPhase() {
    const c = this.cmd;
    return c ? Math.min(1, (this.time - c.start) / c.dur) : 0;
  }

  command(type) {
    const c = this.cmd;
    if (!c || c.given || this.state !== 'run') return;
    if (type !== c.o.type) {
      // Mauvais ordre : le chien hésite, tourne en rond, refus.
      this.refusals++;
      this.phase = 'stop';
      this.stopT = 1.1;
      this.e.emit('❓', 1);
      this.hud.big(t('actv_wrongCommand'), 900, 'bad');
      this.hud.setChoices(null);
      this.cmd = null;
      return;
    }
    c.given = true;
    c.quality = this.phase === 'wait' ? 0.35 : commandQuality(this.cmdPhase);
    this.hud.setChoices(null);
    if (c.quality > 0.85) this.hud.big(t('actv_perfect'), 600, 'good');
    else if (c.quality > 0.5) this.hud.big(t('actv_good'), 600, 'good');
    if (this.phase === 'wait') this.phase = 'run';
  }

  onTap(sx, sy) {
    if (this.state !== 'run') return true;
    const g = this.game;
    const ndc = new THREE.Vector2((sx / window.innerWidth) * 2 - 1, -(sy / window.innerHeight) * 2 + 1);
    g.raycaster.setFromCamera(ndc, g.camera);
    const hit = g.raycaster.intersectObjects(this.obstacles.map((o) => o.model), true)[0];
    if (hit && this.cmd && !this.cmd.given) {
      const o = this.obstacles.find((x) => { let m = hit.object; while (m && m !== x.model) m = m.parent; return !!m; });
      if (o) this.command(o === this.cmd.o ? o.type : `wrong-${o.type}`);
    }
    return true;
  }

  onKeyDown(e) {
    const i = ['Digit1', 'Digit2', 'Digit3', 'Numpad1', 'Numpad2', 'Numpad3'].indexOf(e.code);
    if (i >= 0) this.hud.pressChoice(i % 3);
  }

  update(dt) {
    this.updateCommon(dt);
    const e = this.e;
    if (this.state === 'done') return;
    const p = e.position;
    const o = this.obstacles[this.next];
    const target = o ?? this.finishPt;
    this.arrow.position.set(target.x, this.y(target.x, target.z) + 2.2 + Math.sin(this.time * 4) * 0.2, target.z);
    if (this.cmd && !this.cmd.given) this.hud.setChoiceProgress(this.cmdPhase);

    let speed = 0;
    if (this.state === 'run' || this.state === 'finishing') {
      switch (this.phase) {
        case 'run': {
          const goal = o ? this.entry(o) : new THREE.Vector3(this.finishPt.x, 0, this.finishPt.z);
          const to = new THREE.Vector3(goal.x - p.x, 0, goal.z - p.z);
          const d = to.length();
          speed = this.speed;
          if (o && d < 0.35) {
            if (this.cmd?.given) this.beginObstacle(o);
            else {
              this.phase = 'wait';
              this.hud.big(ta('actv_waiting', this.animal), 900);
            }
          } else if (!o && d < 0.6) {
            this.complete();
          } else {
            this.steer(to, dt, speed);
            if (o && d < 1.2) {
              // Tout près : il se tourne dans le sens de l'obstacle.
              e.heading += wrap(o.heading - e.heading) * Math.min(1, dt * 6);
            }
          }
          break;
        }
        case 'wait':
          speed = 0;
          e.heading += wrap(Math.atan2(this.handler.x - p.x, this.handler.z - p.z) - e.heading) * Math.min(1, dt * 3);
          break;
        case 'stop':
          this.stopT -= dt;
          e.heading += dt * 7;
          speed = 1.5;
          if (this.stopT <= 0) {
            this.phase = 'run';
            this.openCommand();
          }
          break;
        case 'do':
          speed = this.updateObstacle(dt);
          break;
        default:
      }
    }
    e.speed = speed;
    if (this.phase !== 'do') {
      p.y = this.y(p.x, p.z);
      e.scaleGroup.position.y = 0;
      e.scaleGroup.rotation.x = 0;
    }
    e.root.rotation.y = e.heading;
    this.moveHandler(dt);
    if (this.state === 'run') this.refreshHud();
  }

  steer(to, dt, speed) {
    const e = this.e;
    const want = Math.atan2(to.x, to.z);
    e.heading += wrap(want - e.heading) * Math.min(1, dt * 8);
    const step = Math.min(to.length(), speed * dt);
    e.position.addScaledVector(fwd(e.heading), step);
  }

  beginObstacle(o) {
    const c = this.cmd;
    const quality = c?.quality ?? 0.3;
    this.qualities.push(quality);
    this.cur = { o, t: 0, clean: Math.random() < agilityChance(this.animal, o.type, quality), from: this.e.position.clone(), quality };
    const len = o.len + 1.5;
    const slow = { tunnel: 0.85, weave: 0.55, seesaw: 0.45, hurdle: 1, tyre: 1 }[o.type];
    this.cur.dur = len / (this.speed * slow);
    this.cur.len = len;
    this.phase = 'do';
    this.e.heading = o.heading;
  }

  /** Le chien franchit l'obstacle (animation selon le type). Renvoie sa vitesse. */
  updateObstacle(dt) {
    const c = this.cur;
    const o = c.o;
    const e = this.e;
    c.t = Math.min(1, c.t + dt / c.dur);
    const f = fwd(o.heading);
    const side = new THREE.Vector3(f.z, 0, -f.x);
    const pos = c.from.clone().addScaledVector(f, c.len * c.t);
    const ground = this.y(pos.x, pos.z);
    let y = 0;
    let pitch = 0;
    e.scaleGroup.visible = true;
    const k = this.size;
    switch (o.type) {
      case 'hurdle':
      case 'tyre': {
        const s = Math.max(0, Math.sin(Math.PI * Math.min(1, Math.max(0, (c.t - 0.2) / 0.6))));
        y = s * (o.type === 'tyre' ? 0.75 : 0.65) * k;
        pitch = -0.3 * Math.cos(Math.PI * (c.t - 0.2) / 0.6) * s;
        // (chien réaliste : son clip de saut, à la phase du saut)
        // (le clip plie les pattes pour l'appel jusqu'à 22 % et se reçoit à 78 % : il suit la course, pas l'envol)
        const jt = c.t;
        const jtCat = Math.min(1, Math.max(0, (c.t - 0.2) / 0.6)); // (chat réaliste : son clip suit l'envol)
        if (!realLegPose(e.model, 'jump', s * 0.9) && !realDogPose(e.model, 'jump', s, null, jt) && !realCatPose(e.model, 'jump', s, null, jtCat)) for (const l of e.model.legs) l.pivot.rotation.x = l.front ? -1.1 * s : 0.8 * s;
        if (!c.clean && !c.knocked && c.t > 0.5 && o.model.userData.parts.bar) {
          c.knocked = true;
          o.model.userData.parts.bar.position.y = 0.05;
        }
        break;
      }
      case 'tunnel': {
        // Dans le tunnel, on ne voit plus le chien.
        const inside = c.t > 0.22 && c.t < 0.8;
        e.scaleGroup.visible = !inside;
        break;
      }
      case 'weave': {
        const u = (c.t * c.len - 0.75) / 0.6;
        if (u > 0 && u < 8) pos.addScaledVector(side, Math.sin(u * Math.PI) * 0.28 * Math.max(0.7, k));
        e.heading = o.heading + Math.cos(u * Math.PI) * 0.5;
        break;
      }
      case 'seesaw': {
        const plank = o.model.userData.parts.plank;
        const u = c.t * c.len - 0.75; // position sur la planche (0 → 4,2)
        const L = 4.2 * Math.max(0.8, k);
        const along = Math.max(0, Math.min(L, u)) - L / 2;
        const tilt = along < 0 ? 0.2 : -0.2;
        plank.rotation.x += (tilt - plank.rotation.x) * Math.min(1, dt * 5);
        if (u > 0 && u < L) y = 0.44 * Math.max(0.8, k) + Math.tan(-plank.rotation.x) * along * -1;
        pitch = u > 0 && u < L ? plank.rotation.x : 0;
        break;
      }
      default:
    }
    e.position.set(pos.x, ground + Math.max(0, y), pos.z);
    e.scaleGroup.rotation.x = pitch;
    if (o.type !== 'weave') e.heading = o.heading;
    if (c.t >= 1) {
      e.scaleGroup.visible = true;
      if (!c.clean) {
        this.faults++;
        this.hud.big(t(`actv_agFault_${o.type}`), 900, 'bad');
      } else {
        e.emit('⭐', 1);
        if (this.comp) this.applause(0.35);
      }
      this.next++;
      this.cmd = null;
      this.phase = 'run';
      this.openCommand();
    }
    const slow = { tunnel: 0.85, weave: 0.55, seesaw: 0.45, hurdle: 1, tyre: 1 }[o.type];
    return this.speed * slow;
  }

  /** Le joueur court à côté de son animal (sur le côté du parcours). */
  moveHandler(dt) {
    const pl = this.game.player;
    const e = this.e;
    const o = this.obstacles[this.next];
    const ref = o ? new THREE.Vector3(o.x, 0, o.z) : new THREE.Vector3(this.finishPt.x, 0, this.finishPt.z);
    const center = new THREE.Vector3(SHOWGROUND.x, 0, SHOWGROUND.z);
    // Toujours du côté intérieur du parcours, un peu en retrait.
    const mid = e.position.clone().setY(0).lerp(ref, 0.5);
    const toC = center.clone().sub(mid).setY(0);
    if (toC.length() > 0.1) toC.normalize();
    const goal = mid.addScaledVector(toC, 3);
    const to = goal.sub(this.handler);
    const d = to.length();
    const v = Math.min(6.5, d * 2.5);
    if (d > 0.05) this.handler.addScaledVector(to.normalize(), Math.min(d, v * dt));
    pl.cancelGoTo();
    pl.root.position.set(this.handler.x, this.y(this.handler.x, this.handler.z), this.handler.z);
    pl.heading = Math.atan2(e.position.x - this.handler.x, e.position.z - this.handler.z);
    pl.speed = v > 0.4 ? v : 0;
    // La caméra regarde doucement vers l'animal.
    const rig = this.game.rig;
    rig.yaw += wrap(pl.heading - rig.yaw) * Math.min(1, dt * 1.5);
  }

  complete() {
    if (this.state !== 'run') return;
    this.state = 'finishing';
    this.phase = 'finish';
    this.hud.setChoices(null);
    const result = agilityResult({ faults: this.faults, refusals: this.refusals, time: this.clock, par: this.par });
    this.applause(result.clear ? 1 : 0.5);
    this.e.emit('🎉', 4);
    this.hud.big(result.clear ? t('actv_clearRound') : t('actv_finished'), 1500, result.clear ? 'good' : '');
    const quality = this.qualities.reduce((s, q) => s + q, 0) / Math.max(1, this.qualities.length);
    setTimeout(() => !this.ended && this.finish(result, { animals: [this.animal], quality }), 1200);
  }

  cleanup() {
    const pl = this.game.player;
    pl.speed = 0;
  }
}

// ---------------------------------------------------------------- spectacle

const STAGE = { x: 0, z: 0 };

class ShowSession extends Session {
  constructor(mgr, type, opts) {
    super(mgr, type, opts);
    const g = this.game;
    const acts = (opts.acts ?? []).filter((x) => g.entities.get(x.animalId));
    if (!acts.length) {
      g.ui.toast(t('actv_showNeedActs'), 5000);
      this.ok = false;
      return;
    }
    if (g.player.mount) g.dismount();
    this.acts = acts.map((x) => ({ ...x, animal: g.profile.animals.find((a) => a.id === x.animalId) }));
    this.cast = [...new Set(this.acts.map((x) => x.animalId))].map((id) => g.entities.get(id));
    for (const e of this.cast) this.script(e);
    const c = toWorld(STAGE);
    this.center = new THREE.Vector3(c.x, this.y(c.x, c.z), c.z);
    const stage = showStage();
    this.put(stage.group, c.x, c.z);
    this.stageTop = 0.25;
    // Projecteurs : discrets le jour, magnifiques la nuit.
    this.lights = stage.lamps.map((l) => {
      const s = new THREE.SpotLight(0xfff1d0, 0, 30, 0.38, 0.5, 1.2);
      s.position.set(c.x + l.x, this.center.y + l.y, c.z + l.z);
      s.target.position.set(c.x, this.center.y, c.z);
      g.scene.add(s, s.target);
      return s;
    });
    this.addCrowd(0.9);
    // Les artistes attendent sur le côté de la scène.
    this.wings = this.cast.map((e, i) => new THREE.Vector3(c.x - 5 - (i % 3) * 1.6, 0, c.z - 1.5 + Math.floor(i / 3) * 1.8));
    this.cast.forEach((e, i) => {
      e.position.set(this.wings[i].x, this.y(this.wings[i].x, this.wings[i].z), this.wings[i].z);
      e.heading = Math.PI / 2;
    });
    // Le joueur présente le spectacle, devant la scène ; le public est derrière (côté +Z).
    this.teleportPlayer(c.x + 1.2, c.z - 4.6, 0);
    g.rig.pitch = 0.28;
    g.rig.dist = 6;
    this.index = -1;
    this.phase = 'intro';
    this.phaseT = 0;
    this.results = [];
    this.hud.hint(t('actv_showHint'));
    this.refreshHud();
  }

  refreshHud() {
    this.hud.stats([
      ['🎪', this.index < this.acts.length ? t('actv_act', { n: Math.max(1, this.index + 1), total: this.acts.length }) : t('actv_finished')],
      ['⭐', t('actv_points', { n: this.results.reduce((s, r) => s + r.points, 0) })],
    ]);
  }

  onGo() {
    this.applause(0.6);
    this.nextAct();
  }

  nextAct() {
    this.index++;
    this.refreshHud();
    if (this.index >= this.acts.length) {
      this.complete();
      return;
    }
    const act = this.acts[this.index];
    this.e = this.game.entities.get(act.animalId);
    this.phase = 'enter';
    this.phaseT = 0;
    this.hud.big(`${SPECIES[act.animal.species].emoji} ${act.animal.name} : ${t(`trick_${act.trick}`)}`, 1600);
  }

  onKeyDown(e) {
    if (e.code === 'Space') {
      e.preventDefault();
      this.action();
    }
  }

  onTap() {
    return true;
  }

  /** Toucher au bon moment pendant la jauge. */
  action() {
    if (this.phase !== 'gauge') return;
    const g = this.gauge;
    const d = Math.abs(g.cursor - 0.5);
    const inside = d <= g.win / 2;
    const quality = inside ? 1 - (d / (g.win / 2)) * 0.35 : Math.max(0, 0.55 - (d - g.win / 2) * 2.2);
    const points = trickPoints(quality);
    this.results.push({ animalId: this.acts[this.index].animalId, trick: this.acts[this.index].trick, points, quality });
    this.hud.setGauge(null);
    this.hud.setMain(null);
    this.hud.big(quality > 0.85 ? t('actv_perfect') : quality > 0.55 ? t('actv_good') : t('actv_oops'), 900, quality > 0.55 ? 'good' : 'bad');
    this.phase = 'trick';
    this.phaseT = 0;
    this.quality = quality;
  }

  update(dt) {
    this.updateCommon(dt);
    if (this.state === 'done') return;
    const g = this.game;
    const night = 1 - Math.min(1, Math.max(0, (Math.sin(((g.hour - 6) / 12) * Math.PI) + 0.1) * 3));
    for (const l of this.lights) l.intensity = 40 + night * 260;
    // Le présentateur reste à sa place.
    const pl = g.player;
    pl.cancelGoTo();
    pl.root.position.set(this.center.x + 1.2, this.y(this.center.x + 1.2, this.center.z - 4.6), this.center.z - 4.6);
    pl.speed = 0;
    if (this.e && this.state !== 'countdown') pl.heading = Math.atan2(this.e.position.x - pl.root.position.x, this.e.position.z - pl.root.position.z);
    for (const e of this.cast) {
      if (e !== this.e || this.phase === 'intro') {
        e.speed = 0;
        e.position.y = this.y(e.position.x, e.position.z);
        e.heading += wrap(Math.atan2(this.center.x - e.position.x, this.center.z - e.position.z) - e.heading) * Math.min(1, dt * 2);
        e.root.rotation.y = e.heading;
      }
    }
    if (this.state !== 'run' || !this.e) return;
    const e = this.e;
    this.phaseT += dt;
    const spot = new THREE.Vector3(this.center.x, 0, this.center.z + 0.6);
    switch (this.phase) {
      case 'enter':
      case 'leave': {
        const wing = this.wings[this.cast.indexOf(e)];
        const goal = this.phase === 'enter' ? spot : wing;
        const to = new THREE.Vector3(goal.x - e.position.x, 0, goal.z - e.position.z);
        const d = to.length();
        if (d < 0.2) {
          if (this.phase === 'enter') {
            this.phase = 'face';
            this.phaseT = 0;
          } else {
            this.e = null;
            this.nextAct();
            return;
          }
        } else {
          e.heading += wrap(Math.atan2(to.x, to.z) - e.heading) * Math.min(1, dt * 6);
          const v = Math.min(e.sp.walkSpeed * 2.4, d * 3);
          e.position.addScaledVector(fwd(e.heading), Math.min(d, v * dt));
          e.speed = v;
        }
        break;
      }
      case 'face': {
        // Il se tourne vers le public, puis la jauge apparaît.
        e.speed = 0;
        if (e.model.cat || e.model.realCat) e.catPoseOverride = 'stand'; // chat : debout en attendant (pas de sieste)
        e.heading += wrap(Math.PI - e.heading) * Math.min(1, dt * 5);
        if (this.phaseT > 0.7) {
          this.phase = 'gauge';
          this.phaseT = 0;
          this.gauge = { cursor: 0, dir: 1, win: trickWindow(this.acts[this.index].animal), speed: 0.55 + this.index * 0.08 };
          this.hud.setGauge(this.gauge.win);
          this.hud.setMain({ icon: '⭐', label: t('actv_nowBtn'), key: t('actv_key_space'), onClick: () => this.action() });
        }
        break;
      }
      case 'gauge': {
        e.speed = 0;
        const gg = this.gauge;
        gg.cursor += gg.dir * gg.speed * dt;
        if (gg.cursor > 1) { gg.cursor = 1; gg.dir = -1; }
        if (gg.cursor < 0) { gg.cursor = 0; gg.dir = 1; }
        this.hud.setGaugeCursor(gg.cursor);
        // Trop long : on fait le tour quand même, moins bien.
        if (this.phaseT > 9) {
          gg.cursor = gg.win > 0.3 ? 0.2 : 0.05;
          this.action();
        }
        break;
      }
      case 'trick': {
        const dur = 2.6;
        const k = Math.min(1, this.phaseT / dur);
        animateTrick(e, this.acts[this.index].trick, k, dt);
        if (this.phaseT > 0.8 && !this.cheered) {
          this.cheered = true;
          const pts = this.results[this.results.length - 1].points;
          this.applause(pts / 10);
          this.burst(pts >= 8 ? '⭐' : pts >= 5 ? '👏' : '😅', { x: e.position.x, y: e.position.y + 1.8, z: e.position.z }, Math.max(2, Math.round(pts / 2)), 1.2);
        }
        if (k >= 1) {
          this.cheered = false;
          e.scaleGroup.position.set(0, 0, 0);
          e.scaleGroup.rotation.set(0, 0, 0);
          if (e.model.cat || e.model.realCat) e.catPoseOverride = null; // chat : fin de la pose du tour
          this.phase = 'bow';
          this.phaseT = 0;
          this.refreshHud();
        }
        break;
      }
      case 'bow': {
        e.speed = 0;
        // Le salut après le tour : le cheval réaliste fait une petite révérence (ses antérieurs se tendent :
        // basculé tout d'une pièce, ses sabots avant passaient sous la scène).
        const b = Math.sin(Math.min(1, this.phaseT / 0.8) * Math.PI);
        if (!realLegPose(e.model, 'bow', b * 0.85, e.scaleGroup) && !realDogPose(e.model, 'bow', b, e.scaleGroup) && !realCatPose(e.model, 'bow', b, e.scaleGroup)) e.scaleGroup.rotation.x = b * 0.25;
        if (this.phaseT > 0.8) {
          e.scaleGroup.rotation.x = 0;
          e.scaleGroup.position.y = 0;
          this.phase = 'leave';
          this.phaseT = 0;
        }
        break;
      }
      default:
    }
    // Pendant le tour (face au public, jauge, tour, salut) : la caméra se rapproche de l'artiste, de trois quarts à
    // environ 3 m, puis revient à la vue normale (au fond de la scène, le chien faisait une quarantaine de pixels).
    if (this.phase === 'face' || this.phase === 'gauge' || this.phase === 'trick' || this.phase === 'bow') {
      const sc = e.scale ?? 1;
      this.game.rig.focus = { shot: { at: (this.shotAt ??= new THREE.Vector3()).set(e.position.x, e.position.y + 0.45 * sc, e.position.z), heading: e.heading, dist: 1.4 + 1.6 * sc, yaw: 0.75, pitch: 0.2 } };
    }
    const onStage = Math.hypot(e.position.x - this.center.x, e.position.z - this.center.z) < 3.3;
    e.position.y = this.y(e.position.x, e.position.z) + (onStage ? this.stageTop : 0) + (e.scaleGroup.position.y > 0 ? 0 : 0);
    e.root.rotation.y = e.heading;
  }

  complete() {
    this.state = 'finishing';
    this.e = null;
    const result = showResult(this.results);
    const aud = showAudience(result.stars, this.results.length, this.game.isHome);
    this.applause(1);
    this.hud.big(t('actv_bravo'), 1800, 'good');
    const animals = this.cast.map((e) => e.data);
    const quality = this.results.reduce((s, r) => s + r.quality, 0) / this.results.length;
    setTimeout(() => !this.ended && this.finish({ ...result, acts: this.results }, {
      animals, quality, earnings: this.comp ? 0 : aud.earnings,
      extra: [t('actv_spectators', { n: aud.spectators })],
    }), 1600);
  }

  cleanup() {
    this.hud.setGauge(null);
    for (const e of this.cast ?? []) if (e.model?.cat || e.model?.realCat) e.catPoseOverride = null; // chats : poses libres
  }
}

/** Animation simple d'un tour (k : 0 → 1). Modifie la pose du modèle de l'animal. */
function animateTrick(e, trick, k, dt) {
  const s = Math.sin(Math.PI * k);
  const sg = e.scaleGroup;
  const md = e.model;
  const front = md.legs.filter((l) => l.front);
  e.speed = 0;
  // Chats : leurs vraies poses (catAnim.js) au lieu de basculer tout le modèle (l'arrière-train
  // passait sous le sol). Assis et patte levée : rien d'autre à faire.
  if (md.cat) {
    e.catPoseOverride = { sit: 'sit', highfive: 'highfive', jump: 'stand' }[trick] ?? null;
    if (trick === 'sit' || trick === 'highfive') return;
  }
  // Chat réaliste : ses clips (assis, patte levée, saut tenu à sa phase, étirement pour le salut) au lieu de basculer le
  // modèle ou de tourner ses os à la main (catReal.js).
  if (md.realCat) {
    const up = Math.min(1, s * 2);
    const real = { sit: ['sit', up], down: ['down', up], highfive: ['highfive', Math.min(1, s * 1.8)], paw: ['highfive', Math.min(1, s * 1.8)], bow: ['bow', up], smile: ['sit', up] }[trick];
    if (real) {
      realCatPose(md, real[0], real[1], sg);
      if (trick === 'smile') e.happyFor = Math.max(e.happyFor ?? 0, 0.4);
      return;
    }
    if (trick === 'jump') {
      const j = Math.max(0, Math.sin(Math.PI * Math.min(1, k * 1.4)));
      sg.position.y = j * 0.6;
      realCatPose(md, 'jump', j, null, Math.min(1, k * 1.4));
      return;
    }
    if (trick === 'come') return;
  }
  // Chien réaliste : ses clips (assis, couché, donner la patte, roulade, saut, révérence) au lieu de basculer tout le
  // modèle ou de tourner ses os à la main (dogReal.js) ; le sourire : content, la tête penchée.
  if (md.realDog) {
    const up = Math.min(1, s * 2);
    const real = {
      sit: ['sit', up], down: ['down', up], paw: ['paw', Math.min(1, s * 1.8)], hoof: ['paw', Math.min(1, s * 1.8)],
      highfive: ['paw', Math.min(1, s * 1.8)], roll: ['roll', Math.min(1, Math.max(0, (k - 0.1) / 0.8))], bow: ['bow', up],
      smile: ['sit', up],
    }[trick];
    if (real) {
      realDogPose(md, real[0], real[1], sg);
      if (trick === 'smile') e.happyFor = Math.max(e.happyFor ?? 0, 0.4);
      return;
    }
    if (trick === 'jump') {
      // (appel : le clip plie les pattes jusqu'à 22 % de sa durée, l'envol suit, réception à 78 % ; hauteur à la
      // taille du chien — 0,9 m pour tous, le jack et le teckel sautaient trois fois leur hauteur)
      const jt = Math.min(1, k * 1.4);
      const j = Math.sin(Math.PI * Math.min(1, Math.max(0, (jt - 0.2) / 0.6)));
      sg.position.y = j * 0.9 * Math.min(1.2, e.scale ?? 1);
      realDogPose(md, 'jump', j, null, jt);
      return;
    }
  }
  switch (trick) {
    case 'sit':
      sg.rotation.x = -0.4 * Math.min(1, s * 2);
      sg.position.y = -0.08 * Math.min(1, s * 2);
      break;
    case 'down':
    case 'back':
      if (trick === 'back') {
        sg.position.z = -1.2 * s;
        e.speed = 1;
      } else if (!realLegPose(md, 'down', Math.min(1, s * 2), sg)) {
        sg.position.y = -0.22 * Math.min(1, s * 2);
        for (const l of md.legs) l.pivot.rotation.x = (l.front ? -1.3 : 1.3) * Math.min(1, s * 2);
      }
      break;
    case 'paw':
    case 'hoof':
    case 'highfive':
      if (!realLegPose(md, 'hoof', Math.min(1, s * 1.8)) && front[0]) front[0].pivot.rotation.x = -1.3 * Math.min(1, s * 1.8);
      if (trick === 'highfive') sg.rotation.x = -0.25 * s;
      break;
    case 'roll':
      sg.position.y = 0.15 * s;
      sg.rotation.z = Math.PI * 2 * Math.min(1, Math.max(0, (k - 0.15) / 0.7));
      break;
    case 'jump':
      sg.position.y = Math.max(0, Math.sin(Math.PI * Math.min(1, k * 1.4))) * 0.9;
      if (!realLegPose(md, 'jump', Math.max(0, Math.sin(Math.PI * Math.min(1, k * 1.4))))) {
        for (const l of md.legs) l.pivot.rotation.x = (l.front ? -1 : 0.8) * Math.max(0, Math.sin(Math.PI * Math.min(1, k * 1.4)));
      }
      break;
    case 'spin':
      sg.rotation.y = Math.PI * 2 * k;
      e.speed = 1.2;
      break;
    case 'bow':
      // (cheval réaliste : sa pose de révérence, antérieurs tendus et sabots sur la scène)
      if (!realLegPose(md, 'bow', Math.min(1, s * 2), sg)) {
        sg.rotation.x = 0.35 * Math.min(1, s * 2);
        for (const l of front) l.pivot.rotation.x = -0.8 * Math.min(1, s * 2);
      }
      break;
    case 'smile':
      md.neck.rotation.x = e.data.look.neckAngle - 0.6 * Math.min(1, s * 2);
      md.head.rotation.z = Math.sin(k * 20) * 0.1;
      break;
    case 'fetch':
    case 'come':
      sg.position.z = 2.5 * s;
      sg.rotation.y = k > 0.5 ? Math.PI : 0;
      e.speed = 4;
      if (k > 0.45 && k < 0.5 && !e.fetchEmit) {
        e.fetchEmit = true;
        e.emit(trick === 'fetch' ? '🎾' : '❤️', 1);
      }
      if (k > 0.9) e.fetchEmit = false;
      break;
    default:
      sg.position.y = 0.2 * s;
  }
  void dt;
}

// ---------------------------------------------------------------- lapin-hop (le lapin suit le joueur)

const HOP_SCALE = 0.42;

class HopSession extends Session {
  constructor(mgr, type, opts) {
    super(mgr, type, opts);
    const g = this.game;
    const a = opts.animal;
    const e = g.entities.get(a?.id);
    const why = a ? eligibility(a, 'hop') : 'notHere';
    if (!e || why) {
      if (a) g.ui.toast(ta(`actv_why_${why ?? 'notHere'}`, a), 5000);
      this.ok = false;
      return;
    }
    if (g.player.mount) g.dismount();
    this.animal = a;
    this.e = e;
    this.script(e);
    this.obstacles = HOP_COURSE.obstacles.map((o) => {
      const w = toWorld(o);
      const model = agilityObstacle(o.type, o.n);
      model.scale.setScalar(HOP_SCALE);
      this.put(model, w.x, w.z, o.heading);
      const half = o.type === 'tunnel' ? (4 * HOP_SCALE) / 2 + 0.1 : 0.42;
      return { ...o, x: w.x, z: w.z, model, half, done: false };
    });
    const fin = toWorld(HOP_COURSE.finish);
    this.finishLine = { ...HOP_COURSE.finish, x: fin.x, z: fin.z };
    const flags = flagPair(HOP_COURSE.finish.width, t('actv_finish'));
    flags.scale.setScalar(0.7);
    this.put(flags, fin.x, fin.z, HOP_COURSE.finish.heading);
    this.arrow = guideArrow(0xe86aa0);
    this.arrow.scale.setScalar(0.6);
    this.group.add(this.arrow);
    this.st = toWorld(HOP_COURSE.start);
    this.teleportPlayer(this.st.x, this.st.z, HOP_COURSE.start.heading);
    g.rig.dist = 5;
    g.rig.pitch = 0.5;
    this.placeRabbit();
    this.crumbs = [];
    this.prev = this.obstacles.map(() => null);
    this.next = 0;
    this.faults = 0;
    this.par = hopPar();
    if (this.comp) this.addCrowd();
    this.hud.hint(ta('actv_hopHint', a));
    this.refreshHud();
  }

  /** Le lapin attend derrière le joueur. */
  placeRabbit() {
    const b = fwd(HOP_COURSE.start.heading);
    const x = this.st.x - b.x * 1.2;
    const z = this.st.z - b.z * 1.2;
    this.e.position.set(x, this.y(x, z), z);
    this.e.heading = HOP_COURSE.start.heading;
  }

  refreshHud() {
    this.hud.stats([
      ['🚧', this.next < this.obstacles.length ? t('actv_nextObstacle', { n: this.next + 1, total: this.obstacles.length }) : t('actv_toFinish')],
      ['⏱️', `${this.clock.toFixed(1)} s / ${this.par} s`],
      ['❌', t('actv_faults', { n: this.faults * 5 })],
    ]);
  }

  update(dt) {
    this.updateCommon(dt);
    if (this.state === 'done') return;
    const g = this.game;
    const pl = g.player;
    const p = pl.root.position;
    const e = this.e;
    if (this.state === 'countdown') {
      p.set(this.st.x, this.y(this.st.x, this.st.z), this.st.z);
      pl.heading = HOP_COURSE.start.heading;
      pl.speed = 0;
      this.placeRabbit();
    }
    // Le lapin suit le chemin du joueur (miettes de pain), un peu derrière lui.
    const last = this.crumbs[this.crumbs.length - 1];
    if (!last || Math.hypot(last.x - p.x, last.z - p.z) > 0.25) this.crumbs.push({ x: p.x, z: p.z });
    while (this.crumbs.length && Math.hypot(this.crumbs[0].x - e.position.x, this.crumbs[0].z - e.position.z) < 0.2) this.crumbs.shift();
    const far = Math.hypot(p.x - e.position.x, p.z - e.position.z);
    let speed = 0;
    if (this.state !== 'countdown' && this.crumbs.length && far > 1.0) {
      const c = this.crumbs[0];
      const to = new THREE.Vector3(c.x - e.position.x, 0, c.z - e.position.z);
      speed = Math.min(3.4, 1.2 + far * 0.9);
      e.heading += wrap(Math.atan2(to.x, to.z) - e.heading) * Math.min(1, dt * 10);
      e.position.addScaledVector(to.normalize(), Math.min(to.length() + 0.01, speed * dt));
    }
    e.speed = speed;

    // Sauts et tunnel selon la position du lapin.
    let y = 0;
    let visible = true;
    this.obstacles.forEach((o, i) => {
      const a = approach(o, e.position.x, e.position.z);
      const inLane = Math.abs(a.v) < 0.45;
      if (inLane && Math.abs(a.u) < o.half) {
        if (o.type === 'tunnel') visible = Math.abs(a.u) > o.half - 0.3;
        else y = Math.sin((Math.PI * (a.u + o.half)) / (2 * o.half)) * 0.3;
      }
      const prev = this.prev[i];
      this.prev[i] = a.u;
      if (this.state !== 'run' || prev === null || !inLane || !(prev < 0 && a.u >= 0)) return;
      if (i === this.next) {
        const clean = o.type === 'tunnel' || Math.random() < hopChance(this.animal);
        if (!clean) {
          this.faults++;
          const bar = o.model.userData.parts.bar;
          if (bar) bar.position.y = 0.05;
          this.hud.big(t('actv_agFault_hurdle'), 900, 'bad');
        } else {
          e.emit('⭐', 1);
          if (this.comp) this.applause(0.35);
        }
        o.done = true;
        this.next++;
      } else if (!o.done) {
        g.ui.toast(t('actv_wrongObstacle', { n: this.next + 1 }), 2500);
      }
    });
    e.position.y = this.y(e.position.x, e.position.z) + Math.max(0, y);
    e.scaleGroup.visible = visible;
    e.root.rotation.y = e.heading;

    const target = this.obstacles[this.next] ?? this.finishLine;
    this.arrow.position.set(target.x, this.y(target.x, target.z) + 1.6 + Math.sin(this.time * 4) * 0.15, target.z);
    this.arrow.visible = Math.hypot(target.x - p.x, target.z - p.z) > 2.5;
    if (this.state === 'run') {
      if (this.next >= this.obstacles.length) {
        const a = approach(this.finishLine, e.position.x, e.position.z);
        if (Math.abs(a.v) < this.finishLine.width / 2 + 0.5 && a.u >= 0 && (this.prevFinish ?? -1) < 0) this.complete();
        this.prevFinish = a.u;
      }
      this.refreshHud();
    }
  }

  complete() {
    this.state = 'finishing';
    const result = hopResult({ faults: this.faults, time: this.clock, par: this.par });
    this.applause(result.clear ? 1 : 0.5);
    this.e.emit('🎉', 4);
    this.hud.big(result.clear ? t('actv_clearRound') : t('actv_finished'), 1500, result.clear ? 'good' : '');
    setTimeout(() => !this.ended && this.finish(result, { animals: [this.animal], quality: Math.max(0, 1 - this.faults / 4) }), 1200);
  }
}

// ---------------------------------------------------------------- registre des séances

/**
 * Types de séance : classe, icône de la barre de jeu et statistique comptée à la fin.
 * D'autres modules s'y ajoutent (src/game/Dressage.js : plat, figures, reprise de dressage ;
 * src/game/Beauty.js : concours de beauté).
 */
export const SESSION_TYPES = {
  jumping: { cls: JumpingSession, icon: '🏇', stat: 'actvJumping' },
  lesson: { cls: JumpingSession, icon: '🎓', stat: 'actvLessons' },
  trail: { cls: TrailSession, icon: '🧭', stat: 'actvTrail' },
  agility: { cls: AgilitySession, icon: '🐕', stat: 'actvAgility' },
  show: { cls: ShowSession, icon: '🎪', stat: 'actvShows' },
  hop: { cls: HopSession, icon: '🐇', stat: 'actvHop' },
};

// Le site d'un concours à l'extérieur : quand on est au bon endroit le bon jour (inscription faite),
// on installe autour de la carrière des tribunes pleines, un paddock d'échauffement, des boxes, un podium…
// puis on gère le déroulement : échauffement, épreuve (saut avec barrage, reprise de dressage, agility,
// spectacle), cérémonie sur le podium, photo, prix. La logique pure est dans src/sim/competitions.js ;
// l'interface dans src/ui/competitions.js.

import * as THREE from 'three';
import { SHOWGROUND, toWorld, addAward, activityData, knownTricks } from '../sim/activities.js';
import { SESSION_TYPES } from './Activities.js';
import {
  activeEntry, markMissed, competitionCourse, jumpOffCourse, competitionRivals, tiedLeaders, jumpOffRivals, finalRanking,
  prizeFor, recordResult, eligibleForCompetition, titleFor, DISCIPLINES, tackReady, competitionTack, prizeMoney,
  riderAfterResult, riderMissed, upcomingEntries,
} from '../sim/competitions.js';
import { equip, owned } from '../sim/gear.js'; // seller le cheval avec ce qu'il y a dans le coffre
import { competitionVenueModel } from './models/venue.js';
import { spectators, numberTexture } from './models/course.js';
import { mulberry32 } from '../sim/rng.js';
import { addStat, earn, isSandbox } from '../sim/profile.js';
import { emojiTexture } from './textures.js';
import { shotPose } from './Player.js';
import { renderForPhoto } from './wishBubble.js'; // (photo : sans les bulles « il te demande »)
import { t, ta, L } from '../i18n.js';
import { openVenuePanel, showCompetitionResults } from '../ui/competitions.js';

/** Marches du podium : 1,6 m de côté (models/venue.js). Le devant (numéros) regarde la carrière (−x). */
const STEP_HALF = 0.8;

/**
 * Places de la cérémonie (repère du monde) : { player: { x, z, y (hauteur au-dessus du sol), heading }, horse: { x, z,
 * heading } }. Monté (mounted) : le cheval et sa cavalière au pied de la marche, devant elle, face à la carrière (−x),
 * sa croupe (≈ 1 m × sa taille derrière son centre) à 25 cm de la marche. À pied : la joueuse sur sa marche (y = sa
 * hauteur), le cheval au pied du podium à côté d'elle, de profil vers la carrière. Après la 3e place : à côté du
 * podium, au sol. Le cheval n'est jamais sur une marche.
 */
export function ceremonySpot(pod, rank, { mounted = true, scale = 1 } = {}) {
  const step = rank <= 3 ? pod.steps[Math.min(2, rank - 1)] : null;
  const face = -Math.PI / 2;
  if (!step) {
    const x = pod.x - STEP_HALF - 1.2;
    const z = pod.z + 4.5;
    return { player: { x, z, y: 0, heading: face }, horse: mounted ? { x, z, heading: face } : { x: x - 0.4, z: z + 1.6, heading: face } };
  }
  if (mounted) {
    const x = step.x - STEP_HALF - 0.25 - 1.0 * scale;
    return { player: { x, z: step.z, y: 0, heading: face }, horse: { x, z: step.z, heading: face } };
  }
  // (à pied, sur sa marche ; le cheval de profil, son épaule devant elle, au pied de la marche)
  return {
    player: { x: step.x, z: step.z, y: step.y, heading: face },
    horse: { x: step.x - STEP_HALF - 0.35 - 0.35 * scale, z: step.z - 0.3 * scale, heading: Math.PI },
  };
}

/**
 * Le podium est-il pris dans un bâtiment du lieu (à la maison, l'écurie occupe sa place : la cérémonie et sa photo se
 * passaient entre les murs des boxes) ? insideBuilding : World.insideBuilding(x, y, z).
 */
export function podiumBlocked(pod, insideBuilding, heightAt = () => 0) {
  if (!insideBuilding) return false;
  return pod.steps.some((s) => insideBuilding(s.x, heightAt(s.x, s.z) + 0.4, s.z));
}

/**
 * Podium pris dans un bâtiment : on installe un podium dans la carrière, le temps de la remise des prix (comme en vrai,
 * au bord de la piste), dos à sa lice d'entrée (+x), face à la carrière, mêmes marches que celui du terrain
 * (models/venue.js : 1 au milieu, 0,75 m ; 2 à −1,7 m, 0,5 m ; 3 à +1,7 m, 0,3 m). Avant, la cérémonie se faisait au
 * sol au milieu de la carrière, sans marche : on ne comprenait pas qu'on était sur le podium.
 */
export function arenaPodium() {
  const x = SHOWGROUND.x + SHOWGROUND.hw - 2.6;
  const z = SHOWGROUND.z;
  const steps = [{ x, z, y: 0.75 }, { x, z: z - 1.7, y: 0.5 }, { x, z: z + 1.7, y: 0.3 }];
  return { x, z, steps };
}

/** Places de la cérémonie au podium de la carrière (arenaPodium ; mêmes places que ceremonySpot). */
export function arenaCeremonySpot(rank, opts = {}) {
  return ceremonySpot(arenaPodium(), rank, opts);
}

/** Le podium de la carrière en 3D (repère du monde, posé au sol à ground m) : trois marches numérotées, un tapis rouge. */
export function arenaPodiumModel(pod, ground = 0) {
  const g = new THREE.Group();
  g.name = 'arenaPodium';
  g.position.set(pod.x, ground, pod.z);
  const cols = [0xffcf2e, 0xd9d9d9, 0xcd7f32];
  const carpet = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.1, 6.2), new THREE.MeshStandardMaterial({ color: 0xb7322c, roughness: 0.7 }));
  carpet.position.y = 0.05;
  carpet.receiveShadow = true;
  g.add(carpet);
  pod.steps.forEach((st, k) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(1.6, st.y, 1.6), new THREE.MeshStandardMaterial({ color: cols[k], roughness: 0.5 }));
    m.position.set(st.x - pod.x, st.y / 2, st.z - pod.z);
    m.castShadow = true;
    m.receiveShadow = true;
    const num = new THREE.Mesh(new THREE.PlaneGeometry(0.8, Math.min(0.8, st.y * 0.9)), new THREE.MeshStandardMaterial({ map: numberTexture(String(k + 1)), roughness: 0.5 }));
    num.position.set(-0.81, 0, 0);
    num.rotation.y = -Math.PI / 2;
    m.add(num);
    g.add(m);
  });
  return g;
}

/**
 * Plan de la cérémonie (rig.focus.shot) : de trois quarts avant, le podium derrière. La caméra reste hors de la
 * carrière (7 m devant le podium : avec un angle plus faible, elle se mettait derrière sa palissade, qui cachait tout). Monté (rider.mount === e), le
 * cheval et sa cavalière entiers (visée à mi-hauteur entre les sabots et son casque). À pied (rider = la joueuse sur sa
 * marche), visée entre elle et son cheval, vue de la carrière (de face pour elle, de profil pour le cheval), reculée
 * selon l'écart entre eux et la forme de l'écran (aspect), pour qu'on les voie tous les deux entiers.
 */
export function ceremonyShot(e, rider, at, aspect = 1) {
  const sc = e.scale ?? 1;
  if (rider && rider.mount !== e && rider.position) {
    const p = rider.position;
    const ground = e.position.y;
    const top = Math.max(2.1 * sc, p.y - ground + 1.55);
    at.set((e.position.x + p.x) / 2, ground + top * 0.5, (e.position.z + p.z) / 2);
    // écart (largeur à montrer) : de la tête à la croupe du cheval et jusqu'à la joueuse
    const span = Math.hypot(e.position.x - p.x, e.position.z - p.z) + 2.6 * sc;
    const h = aspect < 1 ? 1 : aspect;
    const dist = Math.max(1.4 + top * 1.6, (span * 0.5) / (0.36 * Math.min(1, h)) + 1);
    return { at, heading: rider.heading, dist, yaw: 0.75, pitch: 0.1 };
  }
  const top = rider ? Math.max(1.4, rider.eyeHeight - 0.1) : 2.1 * sc;
  at.set(e.position.x, e.position.y + top * 0.5, e.position.z);
  // (sur un téléphone en hauteur, un peu plus loin : la tête tendue du cheval sortait de l'écran)
  return { at, heading: e.heading, dist: (1.2 + top * 1.75) * (aspect < 1 ? 1.2 : 1), yaw: 1.0, pitch: 0.12 };
}

export class CompetitionVenue {
  constructor(game) {
    this.game = game;
    this.entry = null; // l'inscription du jour, ici
    this.built = null; // { group, stands, crowds, colliders, podium }
    this.acc = 9;
    this.cheer = 0;
    this.time = 0;
    this.particles = [];
    this.busy = false;
    // « 👉 Montre-moi » du métier de cavalier de concours (carnet du panneau 💼 Métiers).
    game.clients?.registerGuide?.('rider', (action) => this.showMe(action));
  }

  get ui() {
    return this.game.ui;
  }

  get event() {
    return this.entry?.comp ?? null;
  }

  /** Appelé après le chargement d'un lieu (Game.loadPlace) : le site est reconstruit si un concours a lieu ici. */
  onPlaceLoaded() {
    this.dispose();
    this.entry = null;
    this.refresh(true);
  }

  /** Chaque image : le public, les confettis ; toutes les 2 s, l'état des inscriptions. */
  update(dt) {
    this.time += dt;
    // Cérémonie : le cheval (et sa cavalière) de trois quarts avant, le podium derrière eux, jusqu'à la photo et un peu après.
    if (this.ceremonyT > 0 && this.ceremonyE && this.built) {
      this.ceremonyT -= dt;
      const pl = this.game.player;
      this.game.rig.focus = { shot: ceremonyShot(this.ceremonyE, pl.mount === this.ceremonyE || this.ceremonyFoot ? pl : null, (this.shotAt ??= new THREE.Vector3()), this.game.camera?.aspect ?? 1) };
    }
    if (this.built?.arenaPodium && (this.arenaPodiumT -= dt) <= 0) this.hideArenaPodium();
    if (this.built) {
      this.cheer = Math.max(0, this.cheer - dt * 0.35);
      for (const c of this.built.crowds) c.userData.cheer(this.time, this.cheer);
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const s = this.particles[i];
        s.userData.life -= dt;
        s.position.y += s.userData.vy * dt;
        s.position.x += s.userData.vx * dt;
        s.material.opacity = Math.min(1, s.userData.life);
        if (s.userData.life <= 0) {
          this.game.scene.remove(s);
          s.material.dispose();
          this.particles.splice(i, 1);
        }
      }
    }
    this.acc += dt;
    if (this.acc < 2) return;
    this.acc = 0;
    this.refresh(false);
  }

  refresh(arrived) {
    const g = this.game;
    const p = g.profile;
    if (!p) return;
    const now = { day: g.day, hour: g.hour, place: p.place };
    for (const e of markMissed(p, now)) {
      this.ui.toast(t('comp_missed', { name: L(e.comp.name) }), 7000);
      if (riderMissed(p) !== null) this.ui.toast(t('comp_missedRep'), 6000); // métier : la réputation baisse un peu
    }
    // Le site reste installé jusqu'au soir, même quand l'épreuve est finie.
    const keep = this.entry && this.entry.comp.place === p.place && this.entry.comp.day === g.day && g.hour < this.entry.comp.close + 2;
    const entry = activeEntry(p, now) ?? (keep ? this.entry : null);
    if (entry === this.entry) return;
    this.dispose();
    this.entry = entry;
    if (entry) {
      this.build(entry);
      this.ui.toast(t('comp_welcome', { name: L(entry.comp.name) }), 7000);
      if (arrived) this.ui.toast(t('comp_welcomeHelp'), 9000);
    }
    this.ui.renderStatus();
  }

  build(entry) {
    const g = this.game;
    const S = SHOWGROUND;
    const label = t('comp_warmupSign');
    const model = competitionVenueModel(S.hw, S.hd, L(entry.comp.name), label);
    model.group.position.set(S.x, g.world.heightAt(S.x, S.z), S.z);
    g.scene.add(model.group);
    // Le public (toujours le même pour ce concours)
    const rng = mulberry32(entry.comp.day * 131 + entry.comp.place.length);
    const crowds = model.stands.map((stand) => {
      const seats = stand.userData.seats.filter(() => rng() < 0.85);
      const c = spectators(seats, rng);
      stand.add(c);
      return c;
    });
    const colliders = model.colliders.map((c) => ({ ...c, x: c.x + S.x, z: c.z + S.z, venue: true }));
    g.world.colliders.push(...colliders);
    const podium = { x: model.podium.x + S.x, z: model.podium.z + S.z, steps: model.podium.steps.map((s) => ({ x: s.x + S.x, z: s.z + S.z, y: s.y })) };
    this.built = { group: model.group, stands: model.stands, crowds, colliders, podium };
  }

  dispose() {
    this.ceremonyT = 0;
    this.ceremonyE = null;
    const b = this.built;
    if (!b) return;
    this.hideArenaPodium();
    const g = this.game;
    g.scene.remove(b.group);
    b.group.traverse((o) => {
      if (o.isMesh || o.isInstancedMesh) {
        o.geometry?.dispose();
        o.material.map?.dispose?.();
        o.material.dispose();
      }
    });
    g.world.colliders = g.world.colliders.filter((c) => !c.venue);
    for (const s of this.particles) {
      g.scene.remove(s);
      s.material.dispose();
    }
    this.particles = [];
    this.built = null;
  }

  /** Pastille dans la barre d'état : « 🏆 Kentucky Classic · aujourd'hui ». */
  statusChips(chip) {
    const e = this.entry;
    if (!e) return [];
    const g = this.game;
    const state = e.done ? t('comp_state_done') : g.hour < e.comp.open ? t('comp_state_opensAt', { h: e.comp.open }) : t('comp_state_today');
    return [chip(`🏆 ${L(e.comp.name)} · ${state}`, t('comp_go'), () => openVenuePanel(this.ui, this))];
  }

  /** Les animaux inscrits qui sont bien ici. */
  animalsEntered() {
    const g = this.game;
    return (this.entry?.animalIds ?? []).map((id) => g.profile.animals.find((a) => a.id === id)).filter((a) => a && a.location === g.profile.place);
  }

  /** Prêt à concourir ? En forme (src/sim/competitions.js) et, à cheval, sellé et bridé (pas à cru). */
  readiness(a) {
    return eligibleForCompetition(a, this.event.discipline) ?? tackReady(a, this.event.discipline);
  }

  /**
   * « Seller » : met au cheval une selle et un filet à sa taille, pris dans le coffre du voyage (ou à la
   * sellerie, à la maison) ; la selle de la discipline d'abord (selle de dressage…). Renvoie true si c'est bon.
   */
  tackUp(a) {
    const g = this.game;
    const p = g.profile;
    const put = [];
    for (const { slot, keys } of competitionTack(a, this.event.discipline, (k) => owned(p, k.split('@')[0]))) {
      let r = null;
      for (const k of keys) {
        r = equip(p, a, k.split('@')[0], undefined, { exact: true });
        if (r.ok) break;
      }
      // Sinon n'importe quel modèle à sa taille (à la maison, la sellière échange la taille).
      if (!r?.ok) r = equip(p, a, slot, undefined, { autoSwap: g.isHome });
      if (!r.ok) {
        // (mêmes messages que la sellerie : resté à la maison, pas la bonne taille dans le coffre…)
        this.ui.toast(t(`gear_${r.reason}`, { item: t(`gear_${r.item ?? slot}`), size: r.need ? t(`tk_size_${r.need}`) : '' }), 7000);
        g.entities.get(a.id)?.applyGear();
        g.ui.refresh();
        return false;
      }
      put.push(t(`gear_${r.item}`));
    }
    g.entities.get(a.id)?.applyGear();
    if (g.player.mount?.data === a) g.player.seat();
    g.save();
    if (put.length) this.ui.toast(ta('comp_tackedUp', a, { what: put.join(', ') }), 5000);
    g.ui.refresh();
    return true;
  }

  /** L'épreuve est-elle ouverte maintenant ? (raison si non) */
  openBlock() {
    const g = this.game;
    const e = this.entry;
    if (!e) return 'none';
    if (e.done) return 'done';
    if (g.hour < e.comp.open) return 'tooEarly';
    if (g.hour >= e.comp.close) return 'closed';
    if (this.busy || g.activities.active) return 'busy';
    return null;
  }

  // ------------------------------------------------------------ échauffement et épreuve

  /** Petit tour d'échauffement sur la piste : le cheval se détend (moins de stress). */
  warmUp(a) {
    const g = this.game;
    const why = this.readiness(a);
    if (why) return this.ui.toast(ta(`comp_why_${why}`, a), 5000);
    if (a.species !== 'horse') return this.ui.toast(ta('comp_warmupHorses', a), 4000);
    this.ui.closePanel();
    return g.activities.start('flat', {
      animal: a,
      warmup: true,
      onResult: () => {
        addStat(g.profile, 'compWarmups');
        this.ui.toast(ta('comp_warmupOk', a), 5000);
        g.ui.refresh();
      },
    });
  }

  /** C'est parti : l'épreuve de la discipline du concours. */
  compete(a) {
    const g = this.game;
    const e = this.entry;
    const block = this.openBlock();
    if (block) return this.ui.toast(t(`comp_block_${block}`, { h: e?.comp.open }), 5000);
    const why = this.readiness(a);
    if (why) return this.ui.toast(ta(`comp_why_${why}`, a), 6000);
    const comp = { ...e.comp, type: e.comp.discipline, fee: 0 };
    this.busy = true;
    this.ui.closePanel();
    this.ui.toast(t('comp_start', { name: L(e.comp.name) }), 4000);
    switch (e.comp.discipline) {
      case 'jumping': {
        const course = competitionCourse(e.comp.level);
        return this.startOrFail(g.activities.start('jumping', { animal: a, comp, course, onResult: (res) => this.afterJumping(a, res, course) }));
      }
      case 'dressage':
        return this.startOrFail(g.activities.start('dressage', { animal: a, comp, level: e.comp.level, onResult: (res) => this.finishEvent(a, res, competitionRivals(e.comp)) }));
      case 'agility':
        return this.startOrFail(g.activities.start('agility', { animal: a, comp, onResult: (res) => this.finishEvent(a, res, competitionRivals(e.comp)) }));
      case 'show': {
        const acts = [];
        for (const x of this.animalsEntered()) for (const trick of knownTricks(x)) if (acts.length < 5) acts.push({ animalId: x.id, trick });
        return this.startOrFail(g.activities.start('show', { acts, comp, onResult: (res) => this.finishEvent(a, res, competitionRivals(e.comp)) }));
      }
      default:
        this.busy = false;
        return this.ui.toast(t('comp_block_none'));
    }
  }

  startOrFail(session) {
    if (!session) this.busy = false;
    return session;
  }

  /** Après le premier tour de saut : barrage si on est à égalité en tête, sinon classement. */
  async afterJumping(a, result, course) {
    const g = this.game;
    const e = this.entry;
    const rivalList = competitionRivals(e.comp, course);
    const tied = tiedLeaders(result, rivalList);
    if (!tied.length || this.ended(a)) return this.finishEvent(a, result, rivalList);
    const jo = jumpOffCourse(course);
    const names = tied.map((r) => `${r.name} & ${r.animal}`).join(', ');
    await this.ui.alert(`⚡ ${t('comp_jumpOff', { names, n: jo.obstacles.length })}`);
    const comp = { ...e.comp, type: 'jumping', fee: 0 };
    const s = g.activities.start('jumping', {
      animal: a, comp, course: jo,
      onResult: (res) => this.finishEvent(a, result, rivalList, { player: res, rivals: jumpOffRivals(tied, jo.par, e.comp.id) }),
    });
    if (!s) this.finishEvent(a, result, rivalList);
  }

  ended(a) {
    return !this.entry || this.game.profile.place !== this.entry.comp.place || !this.game.entities.get(a.id);
  }

  /** Classement, prix, podium, photo et fenêtre des résultats. */
  finishEvent(a, result, rivalList, jumpOff = null) {
    const g = this.game;
    const p = g.profile;
    const e = this.entry;
    this.busy = false;
    if (!e || e.done) return;
    const comp = e.comp;
    const { table, rank } = finalRanking(comp, { ...result, name: p.name, animal: a.name, species: a.species }, rivalList, jumpOff);
    const prize = { ...prizeFor(comp, rank), money: prizeMoney(p, comp, rank) }; // primes du métier (rider)
    const away = comp.place !== p.home;
    const titleBefore = titleFor(p, a.id);
    recordResult(p, e, { rank, animal: a, score: result.total ?? result.points ?? 0 });
    addStat(p, SESSION_TYPES[comp.discipline]?.stat ?? 'actvOther');
    addStat(p, 'actvCompetitions');
    g.remember?.(a, 'firstShow'); // 📸 (src/sim/memories.js)
    if (rank <= 3) g.remember?.(a, 'firstPodium');
    if (away) addStat(p, 'compAway');
    if (rank <= 3) addStat(p, 'actvPodiums');
    if (rank <= 3 && away) addStat(p, 'compAwayPodiums');
    if (rank === 1) addStat(p, 'actvWins');
    if (rank === 1 && comp.level === 3) addStat(p, 'compGrandWins');
    if (comp.discipline === 'jumping' && result.clear) addStat(p, 'actvClear');
    g.xp('competition');
    if (rank <= 3) g.xp(prize.xp);
    const money = isSandbox(p) ? 0 : prize.money;
    if (money) earn(p, money);
    if (money) g.audio?.ui('coin');
    const award = addAward(p, { kind: prize.kind, tier: prize.tier }, {
      type: comp.discipline, day: g.day, place: p.place, animal: a.name, animalId: a.id, species: a.species, level: comp.levelId, rank, event: L(comp.name),
    });
    const title = titleFor(p, a.id);
    const newTitle = title && title !== titleBefore ? title : null;
    // Métier de cavalier de concours : carnet (concourir, podium), expérience, réputation, argent gagné.
    const career = riderAfterResult(p, comp, rank, money);
    if (career) {
      for (const n of career.notes) if (n.first) g.clients?.noteCareer?.('rider', n.action, true);
      if (career.rankUp !== null) g.clients?.rankUpToast?.('rider', career.rankUp);
    }
    g.save();
    g.ui.refresh();
    this.ui.renderStatus();
    // Cérémonie : sur le podium, applaudissements, confettis, puis la photo souvenir.
    this.ceremony(a, rank);
    setTimeout(() => {
      const photo = this.takePhoto();
      showCompetitionResults(this.ui, {
        comp, rank, table, award, money, animal: a, result, title, newTitle, photo, jumpOff, career,
        onClose: () => {},
        onTravel: () => this.ui.openTravel(),
      });
    }, 1500);
  }

  /**
   * Cérémonie, comme en vrai : le cheval ne monte jamais sur la marche (ses sabots restaient calés sur le terrain,
   * jambes enfoncées dans la marche). À cheval : devant sa marche, face à la carrière, la croupe à 25 cm de la marche ;
   * à pied : la joueuse sur sa marche, son cheval au pied du podium à côté d'elle (ceremonySpot). Au-delà de la 3e
   * place : à côté du podium. La caméra les montre de trois quarts avant (update : ceremonyShot), puis la photo.
   */
  ceremony(a, rank) {
    const g = this.game;
    const b = this.built;
    if (!b) return;
    const pod = b.podium;
    const e = g.entities.get(a.id);
    const pl = g.player;
    pl.cancelGoTo();
    const mounted = !!e && pl.mount === e;
    // (à la maison, l'écurie occupe la place du podium : cérémonie dans la carrière)
    const inArena = podiumBlocked(pod, g.world.insideBuilding?.bind(g.world), (x, z) => g.world.heightAt(x, z));
    const spot = inArena ? arenaCeremonySpot(rank, { mounted, scale: e?.scale ?? 1 }) : ceremonySpot(pod, rank, { mounted, scale: e?.scale ?? 1 });
    if (inArena) this.showArenaPodium();
    const { x, z } = spot.player;
    const y = g.world.heightAt(x, z) + spot.player.y;
    pl.root.position.set(x, y, z);
    pl.heading = spot.player.heading;
    pl.speed = 0;
    if (mounted) {
      e.position.copy(pl.root.position);
      e.heading = pl.heading;
    } else if (e) {
      e.position.set(spot.horse.x, g.world.heightAt(spot.horse.x, spot.horse.z), spot.horse.z);
      e.heading = spot.horse.heading;
      e.state = 'idle';
      e.timer = 6;
    }
    this.ceremonyE = e ?? null;
    this.ceremonyFoot = !mounted && rank <= 3;
    this.ceremonyT = 3.5;
    g.rig.yaw = pl.heading;
    g.rig.reset();
    this.cheer = rank <= 3 ? 1 : 0.5;
    e?.emit(rank === 1 ? '🏆' : rank <= 3 ? '🏅' : '🎀', 3);
    const n = rank <= 3 ? 24 : 10;
    const fx = Math.sin(pl.heading);
    const fz = Math.cos(pl.heading);
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(['🎊', '🎉', '✨'][i % 3]), transparent: true, depthWrite: false }));
      // (derrière eux et au-dessus, pas entre eux et la caméra, qui les voit de devant : avant, ils couvraient la photo)
      const back = 1.2 + Math.random() * 2.5;
      const side = (Math.random() - 0.5) * 6;
      s.position.set(x - fx * back + fz * side, y + 1.8 + Math.random() * 2, z - fz * back - fx * side);
      s.scale.setScalar(0.5 + Math.random() * 0.4);
      s.userData = { life: 2 + Math.random() * 2, vy: 0.6 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.6 };
      g.scene.add(s);
      this.particles.push(s);
    }
  }

  /** Le podium de la carrière (arenaPodium), installé pour la remise des prix ; enlevé 30 s après (update). */
  showArenaPodium() {
    const g = this.game;
    const b = this.built;
    if (!b) return;
    if (!b.arenaPodium) {
      const pod = arenaPodium();
      b.arenaPodium = arenaPodiumModel(pod, g.world.heightAt(pod.x, pod.z));
      g.scene.add(b.arenaPodium);
    }
    this.arenaPodiumT = 30;
  }

  /** Enlève le podium de la carrière (et libère ce qu'il a créé). */
  hideArenaPodium() {
    const p = this.built?.arenaPodium;
    if (!p) return;
    this.game.scene.remove(p);
    p.traverse((o) => {
      if (!o.isMesh) return;
      o.geometry.dispose();
      o.material.map?.dispose?.();
      o.material.dispose();
    });
    this.built.arenaPodium = null;
  }

  /** Photo souvenir du podium, gardée dans l'album (comme les photos de balade). */
  takePhoto() {
    const g = this.game;
    const cam = g.camera;
    const fov = cam.fov;
    let saved = null;
    try {
      const src = g.renderer.domElement;
      const c = document.createElement('canvas');
      c.width = 192;
      c.height = 120;
      const ctx = c.getContext('2d');
      let sw = src.width;
      let sh = sw / (c.width / c.height);
      if (sh > src.height) {
        sh = src.height;
        sw = sh * (c.width / c.height);
      }
      // (bande gardée étroite sur un téléphone en hauteur : champ élargi le temps de la photo, ≈ 40° de haut dans la
      // bande, pour qu'on y voie le cheval et sa cavalière entiers)
      const band = sh / src.height;
      if (band < 0.9) {
        cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(20)) / band));
        cam.updateProjectionMatrix();
      }
      // (la caméra à la place exacte du plan de la cérémonie, même si elle n'y est pas encore arrivée : sur un
      // téléphone lent, la photo montrait la croupe du cheval, vue de derrière)
      const shot = this.ceremonyE && this.shotAt ? ceremonyShot(this.ceremonyE, g.player.mount === this.ceremonyE || this.ceremonyFoot ? g.player : null, this.shotAt, cam.aspect) : null;
      if (shot) {
        saved = { p: cam.position.clone(), q: cam.quaternion.clone() };
        shotPose(shot, cam.position, (x, z) => g.world.heightAt(x, z));
        cam.lookAt(shot.at);
        cam.updateMatrixWorld(true);
      }
      renderForPhoto(g);
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', 0.7);
      const d = activityData(g.profile);
      d.photos.push({ sight: 'podium', day: g.day, place: g.profile.place, data });
      if (d.photos.length > 24) d.photos.shift();
      addStat(g.profile, 'actvPhotos');
      return data;
    } catch {
      return null;
    } finally {
      if (cam.fov !== fov) {
        cam.fov = fov;
        cam.updateProjectionMatrix();
      }
      if (saved) {
        cam.position.copy(saved.p);
        cam.quaternion.copy(saved.q);
        cam.updateMatrixWorld(true);
      }
    }
  }

  /** Point où aller pour l'épreuve (l'entrée de la carrière). */
  gate() {
    const w = toWorld({ x: SHOWGROUND.hw + 2.2, z: 0 });
    return new THREE.Vector3(w.x, 0, w.z);
  }

  /**
   * « 👉 Montre-moi » du carnet du métier (rider) : le terrain de concours pour s'entraîner, le calendrier
   * pour s'inscrire ou partir, l'entrée de la carrière le jour du concours.
   */
  showMe(action) {
    const g = this.game;
    const ui = this.ui;
    const p = g.profile;
    const ground = () => {
      const w = this.gate();
      g.marker.show(new THREE.Vector3(w.x, 0, w.z), { hideNear: 4 });
    };
    if (action === 'train' || action === 'reprise') {
      ground();
      return ui.toast(t(p.animals.some((a) => a.species === 'horse' && a.location === p.place) ? `ca_rider_show_${action}` : 'ca_rider_show_noHorse'), 7000);
    }
    if ((action === 'compete' || action === 'podium') && this.entry && !this.entry.done) {
      ground();
      return ui.toast(t('ca_rider_show_venue', { name: L(this.entry.comp.name) }), 7000);
    }
    const mine = upcomingEntries(p);
    ui.openActivities({ tab: 'calendar' });
    if (action === 'register' || !mine.length) return ui.toast(t('ca_rider_show_register'), 7000);
    return ui.toast(t('ca_rider_show_travel', { name: L(mine[0].comp.name), day: mine[0].comp.day }), 7000);
  }

  disciplineIcon() {
    return DISCIPLINES[this.event?.discipline]?.icon ?? '🏆';
  }
}

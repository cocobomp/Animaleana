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
import { spectators } from './models/course.js';
import { mulberry32 } from '../sim/rng.js';
import { addStat, earn, isSandbox } from '../sim/profile.js';
import { emojiTexture } from './textures.js';
import { renderForPhoto } from './wishBubble.js'; // (photo : sans les bulles « il te demande »)
import { t, ta, L } from '../i18n.js';
import { openVenuePanel, showCompetitionResults } from '../ui/competitions.js';

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
    const b = this.built;
    if (!b) return;
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

  /** Le joueur et son cheval montent sur la marche du podium (ou à côté), le public acclame. */
  ceremony(a, rank) {
    const g = this.game;
    const b = this.built;
    if (!b) return;
    const pod = b.podium;
    const step = pod.steps[Math.min(2, rank - 1)];
    const x = rank <= 3 ? step.x : pod.x;
    const z = rank <= 3 ? step.z : pod.z + 4.5;
    const e = g.entities.get(a.id);
    const pl = g.player;
    pl.cancelGoTo();
    const y = g.world.heightAt(x, z) + (rank <= 3 ? step.y : 0);
    pl.root.position.set(x, y, z);
    pl.heading = -Math.PI / 2;
    pl.speed = 0;
    if (pl.mount === e) {
      e.position.copy(pl.root.position);
      e.heading = pl.heading;
    } else if (e) {
      e.position.set(x, g.world.heightAt(x, z), z + 1.6);
      e.heading = -Math.PI / 2;
      e.state = 'idle';
      e.timer = 6;
    }
    g.rig.yaw = pl.heading;
    g.rig.reset();
    this.cheer = rank <= 3 ? 1 : 0.5;
    e?.emit(rank === 1 ? '🏆' : rank <= 3 ? '🏅' : '🎀', 3);
    const n = rank <= 3 ? 24 : 10;
    for (let i = 0; i < n; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: emojiTexture(['🎊', '🎉', '✨'][i % 3]), transparent: true, depthWrite: false }));
      s.position.set(x + (Math.random() - 0.5) * 5, y + 1 + Math.random() * 2, z + (Math.random() - 0.5) * 5);
      s.scale.setScalar(0.5 + Math.random() * 0.4);
      s.userData = { life: 2 + Math.random() * 2, vy: 0.6 + Math.random() * 0.8, vx: (Math.random() - 0.5) * 0.6 };
      g.scene.add(s);
      this.particles.push(s);
    }
  }

  /** Photo souvenir du podium, gardée dans l'album (comme les photos de balade). */
  takePhoto() {
    const g = this.game;
    try {
      renderForPhoto(g);
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
      ctx.drawImage(src, (src.width - sw) / 2, (src.height - sh) / 2, sw, sh, 0, 0, c.width, c.height);
      const data = c.toDataURL('image/jpeg', 0.7);
      const d = activityData(g.profile);
      d.photos.push({ sight: 'podium', day: g.day, place: g.profile.place, data });
      if (d.photos.length > 24) d.photos.shift();
      addStat(g.profile, 'actvPhotos');
      return data;
    } catch {
      return null;
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

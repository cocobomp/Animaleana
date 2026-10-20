// Le chat et le lapin actuels du jeu sur la page « Chats et lapins » : les vrais modèles (buildAnimalModel :
// catModel.js pour le chat, le modèle commun animalModel.js pour le lapin) animés par le vrai code du jeu
// (AnimalEntity.animate : catAnim.js pour le chat, sautillement des lapins). On prête à ce code un « animal »
// minimal : ses données (robe, race), son horloge et son état.

import * as THREE from 'three';
import { buildAnimalModel, disposeModel } from '../game/models/animalModel.js';
import { AnimalEntity } from '../game/AnimalEntity.js';
import { SPECIES, getBreed } from '../sim/species.js';
import { resolveLook } from '../sim/animal.js';

/** Robe de la page (COATS) appliquée à une race du jeu ; null = première robe de la race. */
export function procLook(species, breedId, coat) {
  const look = resolveLook(species, breedId, 0);
  look.seed = 7; // (taches toujours les mêmes)
  if (!coat) return look;
  const g = coat.game;
  Object.assign(look, {
    coat: g.coat,
    secondary: g.secondary,
    third: g.third ?? g.secondary,
    mane: g.secondary,
    pattern: g.pattern,
    colorName: { fr: coat.label, en: coat.label },
  });
  delete look.white;
  delete look.eye2;
  if (g.eye) look.eye = g.eye;
  return look;
}

// Pose imposée au chat du jeu pour chaque bouton (catAnim.js : catPoseOverride) ; null : il se déplace.
const CAT_POSE = { stop: 'stand', walk: null, run: null, sit: 'sit', lie: 'loaf', curl: 'curl', groom: 'groom' };
const MOVING = ['walk', 'run', 'hop'];
// Dimensions des modèles d'artiste (taille 1) : hauteur oreilles comprises et longueur, queue comprise (m).
const REF = { cat: { h: 0.32, l: 0.6 }, rabbit: { h: 0.3, l: 0.38 } };

export class ProcPet {
  constructor(species) {
    this.species = species;
    this.holder = new THREE.Group();
    this.wrapper = new THREE.Group();
    this.holder.add(this.wrapper);
    // Un animal minimal pour le code d'animation du jeu.
    this.ent = Object.create(AnimalEntity.prototype);
    Object.assign(this.ent, {
      sp: SPECIES[species], time: 0, phase: 0, state: 'idle', sleeping: false, posing: null, lie: 0, scale: 1, speed: 0,
      stage: 'adult', legLift: 0, catPoseOverride: null,
      data: { species, weight: 50, look: null, personality: 'calm', needs: { energy: 80 } },
    });
    this.size = 1;
    this.fit = 1;
    this.long = 1;
    this.tall = 1;
    this.triangles = 0;
    this.furTriangles = 0;
  }

  /** (Re)construit le modèle pour une race et une robe. */
  build(breedId, coat) {
    if (this.model) {
      this.wrapper.remove(this.model.root);
      disposeModel(this.model.root);
    }
    const look = procLook(this.species, breedId, coat);
    const breed = getBreed(this.species, breedId);
    this.model = buildAnimalModel(this.species, look, breedId);
    this.ent.data.look = look;
    this.ent.data.breed = breedId;
    this.ent.model = this.model;
    this.ent.catAnim = null;
    this.size = breed?.scale ?? 1;
    this.tall = 1 - (1 - (breed?.legs ?? 1)) * 0.5;
    this.ent.scale = this.size;
    this.wrapper.scale.setScalar(this.size);
    // Cadrage : le modèle du jeu n'a pas la taille des modèles d'artiste (le lapin du jeu est bien plus gros) ;
    // la caméra recule d'autant pour qu'il tienne dans la carte (la vitesse du sol, elle, ne change pas).
    this.model.root.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(this.model.root);
    const ref = REF[this.species];
    this.fit = Math.min(2.2, Math.max(0.8, (box.max.y - box.min.y) / ref.h, (box.max.z - box.min.z) / ref.l));
    this.wrapper.add(this.model.root);
    this.triangles = 0;
    this.furTriangles = 0;
    this.model.root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const g = o.geometry;
      const n = ((g.index ? g.index.count : g.attributes.position.count) / 3) * (o.isInstancedMesh ? o.count : 1);
      if (o.userData.shells) this.furTriangles += n;
      else if (o.material?.opacity !== 0 && o.visible) this.triangles += n;
    });
    // Forme principale de la tête (la plus grande) : son centre sert aux gros plans des planches.
    this.headShape = null;
    this.model.head.traverse((o) => {
      if (o.isMesh && !o.userData.shells && (!this.headShape || o.geometry.attributes.position.count > this.headShape.geometry.attributes.position.count)) this.headShape = o;
    });
  }

  /**
   * Une image : allure ou position demandée (id de GAITS) à la vitesse v (m/s, animal de taille 1).
   * Renvoie la vitesse du sol. Le chat du jeu a toutes les poses de la page ; le lapin du jeu sautille et se
   * tasse pour dormir, mais ne sait ni s'asseoir, ni se dresser, ni faire sa toilette (accroupi à la place).
   */
  update(dt, gait, v) {
    const e = this.ent;
    e.time += dt;
    const moving = MOVING.includes(gait) && v > 0;
    e.state = moving ? 'walk' : 'idle';
    e.speed = moving ? v * this.size : 0;
    if (this.species === 'cat') {
      e.catPoseOverride = CAT_POSE[gait] ?? null;
      e.sleeping = gait === 'curl';
      this.used = gait;
    } else {
      e.posing = gait === 'lie' ? 'down' : null;
      e.sleeping = false;
      this.used = ['sit', 'stand', 'groom'].includes(gait) ? 'stop' : gait;
    }
    e.animate(dt, false);
    return moving ? v * this.size : 0;
  }

  /** Position (repère du décor) du milieu de la tête : gros plans. */
  headWorld(out) {
    this.holder.updateMatrixWorld(true);
    if (!this.headShape) return this.model.head.getWorldPosition(out);
    return new THREE.Box3().setFromObject(this.headShape).getCenter(out);
  }

  /** Remet l'animal au repos (même instant pour toutes les cartes). */
  reset() {
    Object.assign(this.ent, { time: 0, phase: 0, lie: 0, doze: 0, headDown: 0, posing: null, catAnim: null, sleeping: false });
  }
}

// Animal à partir d'un modèle GLB animé (squelette + clips idle/walk/run), avec la même
// « forme » que buildAnimalModel() : root, body, head, neck, legs[{pivot}], tail, ears, y0,
// headHeight, saddleY — pour que AnimalEntity, gearModels (selle, filet…) et Player (monte)
// continuent de marcher sans rien savoir du format.
// Le pelage par race est peint dans les couleurs de sommets (robe, chaussettes, taches).

import * as THREE from 'three';
import { instantiate, hasModel } from '../assets.js';
import { noise3 } from './shapes.js';
import { gfx } from '../gfx.js';
import { horseGearFit } from './gltfHorseFit.js'; // selle, filet, couverture du catalogue sur le cheval GLB

// Réglages par espèce : hauteur totale (m, tête levée), matériaux de robe / crins, noms d'os.
// (Le cheval n'a plus de fichier GLB : il est sculpté par le code, voir horseModel.js. Ces réglages ne
// servent que si un modèle « horse » revient un jour dans assets.js.)
const SPEC = {
  horse: {
    height: 2.1,
    coat: ['Material.003'],
    mane: ['Material.006'],
    bones: { body: 'Body', head: 'Head', neck: 'Neck', tail: 'Tail1', legs: [['FrontLegL', true, 1], ['FrontLegR', true, -1], ['BackLegL', false, 1], ['BackLegR', false, -1]] },
    clips: { idle: 'idle', walk: 'walk', run: 'run' },
    // Durée d'un cycle de marche/galop à vitesse de référence (m/s) : règle la cadence des pattes.
    walkRef: 1.4,
    runRef: 4.5,
    headDownSign: 1,
  },
};

/** Vrai si cette espèce a un modèle GLB prêt. */
export const hasGltfAnimal = (speciesId) => !!SPEC[speciesId] && hasModel(speciesId);

function findBone(root, name) {
  let found = null;
  root.traverse((o) => { if (!found && o.isBone && o.name === name) found = o; });
  return found;
}

/**
 * Groupe accroché à un os, dont le repère coïncide au repos avec un repère exprimé dans `root`
 * (origine `origin` en mètres, orientation `basis` ou celle de root). Il suit ensuite l'os.
 */
function anchor(bone, root, origin, basis = null) {
  const g = new THREE.Group();
  const target = new THREE.Matrix4().makeTranslation(origin.x, origin.y, origin.z);
  if (basis) target.multiply(new THREE.Matrix4().makeBasis(basis.x, basis.y, basis.z));
  target.premultiply(root.matrixWorld);
  g.matrix.copy(bone.matrixWorld).invert().multiply(target);
  g.matrix.decompose(g.position, g.quaternion, g.scale);
  bone.add(g);
  return g;
}

/** Position d'un sommet dans le repère monde (peau appliquée pour un SkinnedMesh). */
function vertexAt(mesh, i, v) {
  v.fromBufferAttribute(mesh.geometry.attributes.position, i);
  if (mesh.isSkinnedMesh) mesh.applyBoneTransform(i, v);
  return v.applyMatrix4(mesh.matrixWorld);
}

/** Boîte englobante (repère monde) de l'objet, squelette au repos compris. */
function bounds(object) {
  // updateMatrixWorld (et non updateWorldMatrix) : SkinnedMesh y recalcule bindMatrixInverse, sinon les
  // positions « peau appliquée » restent dans l'ancienne échelle.
  object.updateMatrixWorld(true);
  object.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); o.boundingBox = null; o.computeBoundingBox(); } });
  return new THREE.Box3().setFromObject(object);
}

/** Couleur de robe d'un sommet selon le motif de la race (positions relatives : h = hauteur 0..1). */
function coatAt(look, pattern, x, h, z, coat, secondary, out) {
  out.copy(coat);
  switch (pattern) {
    case 'socks':
      if (h < 0.17 + noise3(x * 9, z * 9, 2) * 0.05) out.copy(secondary);
      break;
    case 'patches':
      if (noise3(x * 1.6 + 1, h * 2.2, z * 1.6) > 0.52) out.copy(secondary);
      break;
    case 'spots':
      if (noise3(x * 7, h * 9 + 4, z * 7) > 0.6) out.copy(secondary);
      break;
    case 'points':
      if (h < 0.2 || z > 0.42) out.copy(secondary);
      break;
    default:
  }
  // Ventre et bas des pattes un peu plus clairs, dos un peu plus sombre : lecture du volume.
  const shade = 0.93 + h * 0.1 + (noise3(x * 3, h * 3, z * 3) - 0.5) * 0.06;
  out.multiplyScalar(shade);
  return out;
}

/** Peint la robe dans l'attribut couleur (copie privée de la géométrie par animal). */
function paintCoat(mesh, look, spec, box, isMane) {
  const g = mesh.geometry;
  const mine = new THREE.BufferGeometry();
  mine.index = g.index;
  for (const k of Object.keys(g.attributes)) if (k !== 'color') mine.setAttribute(k, g.attributes[k]);
  mine.boundingSphere = g.boundingSphere;
  mine.boundingBox = g.boundingBox;
  mine.userData.shared = true; // attributs partagés avec le modèle source : ne pas libérer
  const pos = g.attributes.position;
  const n = pos.count;
  const colors = new Float32Array(n * 3);
  const coat = new THREE.Color(look.coat);
  const secondary = new THREE.Color(look.secondary ?? look.coat);
  const mane = new THREE.Color(look.mane ?? 0x1b1410);
  const c = new THREE.Color();
  const v = new THREE.Vector3();
  const size = box.getSize(new THREE.Vector3());
  for (let i = 0; i < n; i++) {
    if (isMane) c.copy(mane);
    else {
      vertexAt(mesh, i, v);
      const h = (v.y - box.min.y) / size.y;
      coatAt(look, look.pattern, v.x / size.x, h, (v.z - box.min.z) / size.z, coat, secondary, c);
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  mine.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  mesh.geometry = mine;
  mesh.material.vertexColors = true;
  mesh.material.color.set(0xffffff);
  mesh.material.roughness = 0.75;
  mesh.material.metalness = 0;
  mesh.material.needsUpdate = true;
}

/** Hauteur du dos au milieu du corps (pour la selle) : plus haut sommet proche de l'axe, au centre. */
function backTop(meshes, box) {
  const v = new THREE.Vector3();
  const size = box.getSize(new THREE.Vector3());
  let best = box.min.y + size.y * 0.55;
  for (const mesh of meshes) {
    const pos = mesh.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      vertexAt(mesh, i, v);
      const zr = (v.z - box.min.z) / size.z;
      if (Math.abs(v.x) < size.x * 0.12 && zr > 0.42 && zr < 0.58 && v.y > best && v.y < box.min.y + size.y * 0.8) best = v.y;
    }
  }
  return best;
}

/** Ombre de contact douce (comme le modèle procédural). */
function contactShadow(R, L) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const grad = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  const geo = new THREE.PlaneGeometry(1, 1);
  geo.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: gfx.quality === 'high' ? 0.5 : 0.65, toneMapped: false }));
  mesh.scale.set(R * 3.2, 1, L * 1.5);
  mesh.position.y = 0.015;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * Construit l'animal GLB. Renvoie null si le modèle n'est pas disponible (l'appelant
 * retombe alors sur buildAnimalModel).
 */
export function buildGltfAnimal(speciesId, look) {
  const spec = SPEC[speciesId];
  const inst = spec && instantiate(speciesId);
  if (!inst) return null;
  const { scene, animations } = inst;
  const root = new THREE.Group();
  const inner = new THREE.Group();
  root.add(inner);
  inner.add(scene);

  // Orientation : l'animal regarde vers +Z (comme le modèle procédural). On regarde où est la tête.
  scene.updateWorldMatrix(true, true);
  const headBone = findBone(scene, spec.bones.head);
  const tailBone = findBone(scene, spec.bones.tail);
  if (headBone && tailBone) {
    const hz = headBone.getWorldPosition(new THREE.Vector3()).z;
    const tz = tailBone.getWorldPosition(new THREE.Vector3()).z;
    if (hz < tz) inner.rotation.y = Math.PI;
  }
  // Échelle : hauteur totale = spec.height × échelle de race (look.scale est appliqué par l'entité).
  // root n'est pas encore dans la scène (transformation identité) : repère monde = repère de root.
  let box = bounds(root);
  const s = spec.height / Math.max(0.01, box.max.y - box.min.y);
  inner.scale.setScalar(s);
  box = bounds(root);
  inner.position.set(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  box = bounds(root);

  // Pelage.
  const meshes = [];
  scene.traverse((o) => { if (o.isMesh) meshes.push(o); });
  for (const mesh of meshes) {
    const isMane = spec.mane.includes(mesh.material.name);
    paintCoat(mesh, look, spec, box, isMane);
    mesh.frustumCulled = false; // le squelette bouge : évite les disparitions au bord de l'écran
  }

  const L = look.bodyLen;
  const R = look.bodyR * (look.fluff ?? 1);
  const saddleY = backTop(meshes, box);
  const y0 = saddleY - R;
  const headPos = headBone ? root.worldToLocal(headBone.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(0, box.max.y * 0.9, L * 0.6);

  // Points d'accroche de l'équipement, dans le repère procédural (origine au sol, +Z devant).
  const bodyBone = findBone(scene, spec.bones.body) ?? scene;
  const body = anchor(bodyBone, root, new THREE.Vector3(0, 0, 0));
  const head = anchor(headBone ?? bodyBone, root, headPos);
  const neckBone = findBone(scene, spec.bones.neck);
  let neck;
  if (neckBone && headBone) {
    const np = root.worldToLocal(neckBone.getWorldPosition(new THREE.Vector3()));
    const y = headPos.clone().sub(np).normalize();
    const x = new THREE.Vector3(1, 0, 0);
    const z = new THREE.Vector3().crossVectors(x, y).normalize();
    neck = anchor(neckBone, root, np, { x, y, z });
  } else neck = anchor(bodyBone, root, new THREE.Vector3(0, y0, L * 0.4));
  const legs = spec.bones.legs.map(([name, front, side]) => {
    const b = findBone(scene, name);
    const p = b ? root.worldToLocal(b.getWorldPosition(new THREE.Vector3())) : new THREE.Vector3(side * R * 0.6, y0, front ? L * 0.35 : -L * 0.35);
    return { pivot: anchor(b ?? bodyBone, root, p), front, side };
  });
  const tail = tailBone ? anchor(tailBone, root, root.worldToLocal(tailBone.getWorldPosition(new THREE.Vector3()))) : new THREE.Group();

  root.add(contactShadow(R, L));

  // Animations.
  const mixer = new THREE.AnimationMixer(scene);
  const actions = {};
  for (const [key, clipName] of Object.entries(spec.clips)) {
    const clip = THREE.AnimationClip.findByName(animations, clipName);
    if (clip) actions[key] = mixer.clipAction(clip);
  }
  let current = null;
  const play = (key, fade = 0.25) => {
    const a = actions[key] ?? actions.idle;
    if (!a || a === current) return;
    a.reset().fadeIn(fade).play();
    if (current) current.fadeOut(fade);
    current = a;
  };
  play('idle', 0);
  // Pour baisser la tête : rotation autour de l'axe latéral du cheval (X de root), exprimée dans le repère
  // du parent de chaque os (capturé au repos ; root est à l'identité à ce moment-là).
  const bendOf = (bone) => {
    if (!bone) return null;
    const parentQ = bone.parent.getWorldQuaternion(new THREE.Quaternion());
    return { bone, toParent: parentQ.clone().invert(), fromParent: parentQ };
  };
  const benders = [[bendOf(neckBone), 0.9], [bendOf(headBone), 0.8]].filter(([b]) => b);
  const bend = new THREE.Quaternion();
  const tmp = new THREE.Quaternion();
  const lateral = new THREE.Vector3(1, 0, 0);

  const model = {
    gltf: true,
    root, body, head, neck, legs, tail, ears: [], y0, saddleY,
    headHeight: headPos.y,
    mixer,
    /**
     * st : { moving, gallop, v (m/s hors échelle), sleeping, headDown (0..1), sad, time }
     */
    animate(dt, st) {
      if (st.moving) play(st.gallop ? 'run' : 'walk');
      else play('idle');
      if (current) {
        if (st.moving) {
          const ref = st.gallop ? spec.runRef : spec.walkRef;
          current.timeScale = THREE.MathUtils.clamp(st.v / ref, 0.5, 1.8);
        } else current.timeScale = st.sleeping ? 0.35 : 1;
      }
      mixer.update(dt);
      // Tête baissée (manger, brouter, dormir debout, tristesse) : ajoutée après l'animation.
      const down = (st.headDown ?? 0) + (st.sad ? 0.3 : 0) + (st.sleeping ? 0.45 : 0);
      if (down > 0.001) {
        for (const [b, k] of benders) {
          bend.setFromAxisAngle(lateral, down * k * spec.headDownSign);
          // local' = parent⁻¹ · R · parent · local
          tmp.copy(b.toParent).multiply(bend).multiply(b.fromParent);
          b.bone.quaternion.premultiply(tmp);
        }
      }
    },
    dispose() {
      mixer.stopAllAction();
      mixer.uncacheRoot(scene);
    },
  };
  // Cheval : surfaces approchées pour poser l'équipement du catalogue (src/game/gearModels.js).
  if (speciesId === 'horse') model.gearFit = horseGearFit(model, anchor, (name) => findBone(scene, name), root);
  return model;
}

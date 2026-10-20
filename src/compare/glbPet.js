// Chat ou lapin GLB de la page « Chats et lapins » : chargement, allures et poses (clips glTF, transitions
// jouées une fois entre deux poses, chemin le plus court dans le graphe des poses de l'espèce), robe et
// proportions de race (petRecolor.js), oreilles des races (taille, pliées, tombantes ou dressées).
// Tous les candidats suivent la norme de leur espèce (voir petCandidates.js) : regard vers +Z, pattes à
// y = 0, animations sur place. À la vitesse « naturelle » d'une allure, les pattes posées ne glissent pas :
// le sol défile à cette vitesse, et le clip est accéléré ou ralenti (dans une limite) pour s'approcher de la
// vitesse demandée.

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { makePetUniforms, patchPetMesh, restPositions, bindToPet, partWeights, furLow, rigidPieces, PATTERN } from './petRecolor.js';
import { contactShadow } from './petStage.js';
import { POSE_GRAPH } from './petCandidates.js';

let loader = null;
const getLoader = () => {
  if (!loader) {
    loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
  }
  return loader;
};

const _v = new THREE.Vector3();
const _j = new THREE.Vector3();
const _p = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();
const _qh = new THREE.Quaternion();
const _qp = new THREE.Quaternion();

/** Charge un candidat GLB ; renvoie l'animal prêt à animer. */
export async function loadGlbPet(cand, species) {
  const res = await fetch(cand.file);
  if (!res.ok) throw new Error(`${cand.file} : ${res.status}`);
  const buf = await res.arrayBuffer();
  const gltf = await getLoader().parseAsync(buf, '');
  return new GlbPet(cand, species, gltf, buf.byteLength);
}

/** Chemin le plus court (liste d'arêtes [de, vers, clip]) d'une pose à une autre ; fondu = 1,5 transition. */
function posePath(graph, from, to) {
  if (from === to) return [];
  const dist = new Map([[from, 0]]);
  const prev = new Map();
  const todo = [from];
  while (todo.length) {
    todo.sort((a, b) => dist.get(a) - dist.get(b));
    const a = todo.shift();
    for (const e of graph.edges) {
      if (e[0] !== a) continue;
      const d = dist.get(a) + (e[2] ? 1 : 1.5);
      if (d < (dist.get(e[1]) ?? Infinity)) {
        dist.set(e[1], d);
        prev.set(e[1], e);
        todo.push(e[1]);
      }
    }
  }
  if (!prev.has(to)) return [[from, to, null]];
  const path = [];
  for (let n = to; n !== from; n = prev.get(n)[0]) path.unshift(prev.get(n));
  return path;
}

class GlbPet {
  constructor(cand, species, gltf, bytes) {
    this.cand = cand;
    this.species = species;
    this.graph = POSE_GRAPH[species];
    this.bytes = bytes;
    this.holder = new THREE.Group(); // tourne (plateau) ; contient la race et l'ombre de contact
    this.wrapper = new THREE.Group(); // taille de la race
    this.inner = gltf.scene;
    this.wrapper.add(this.inner);
    this.holder.add(this.wrapper);
    const cat = species === 'cat';
    this.shadow = contactShadow(cat ? 0.06 : 0.07, cat ? 0.36 : 0.3);
    this.holder.add(this.shadow);
    this.uniforms = makePetUniforms();
    this.holder.updateMatrixWorld(true);

    const bone = (n) => {
      if (!n) return null;
      const o = this.inner.getObjectByName(THREE.PropertyBinding.sanitizeNodeName(n));
      if (!o) console.warn(`${cand.id} : os introuvable ${n}`);
      return o ?? null;
    };
    const desc = (o, set = new Set()) => {
      o?.traverse((c) => set.add(c));
      return set;
    };
    this.legs = cand.legs.map((l) => ({ top: bone(l.top), end: bone(l.end), set: desc(bone(l.top)) }));
    this.earChains = (cand.ears ?? []).map((names) => names.map((n) => bone(n)).filter(Boolean)).filter((c) => c.length);
    const ear = new Set();
    for (const c of this.earChains) desc(c[0], ear);
    const tail = desc(bone(cand.tail));
    this.head = bone(cand.head);
    const head = desc(this.head);
    this.neck = (cand.neck ?? []).map((n) => bone(n)).filter(Boolean).map((b) => ({ b, rest: b.position.clone() }));
    const worldOf = (o) => (o ? o.getWorldPosition(new THREE.Vector3()) : null);

    // Maillages : ombres, triangles, position de repos et appartenance de chaque sommet.
    this.triangles = 0;
    this.meshes = [];
    const toWrapper = new THREE.Matrix4().copy(this.wrapper.matrixWorld).invert();
    this.inner.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true;
      o.receiveShadow = true;
      o.frustumCulled = false; // (boîtes des maillages à os pas mises à jour quand ils bougent)
      const g = o.geometry;
      this.triangles += (g.index ? g.index.count : g.attributes.position.count) / 3;
      o.material = o.material.clone();
      const toPet = new THREE.Matrix4().multiplyMatrices(toWrapper, o.matrixWorld);
      const rest = restPositions(o, toPet);
      const bind = bindToPet(o, toPet);
      const parts = partWeights(o, { legs: this.legs.map((l) => l.set), ear, tail, head });
      this.meshes.push({ mesh: o, toPet, bind, rest, parts });
    });

    // Repères du corps au repos (dans le repère de l'animal).
    const avgZ = (ls) => ls.reduce((s, l) => s + (worldOf(l.top)?.z ?? 0), 0) / ls.length;
    const hipZ = avgZ(this.legs.slice(2));
    const shZ = avgZ(this.legs.slice(0, 2));
    let bellyY = Infinity;
    let topY = -Infinity;
    let noseZ = -Infinity;
    let tip = null;
    let tailTip = Infinity;
    let minX = Infinity;
    let maxX = -Infinity;
    const z0 = hipZ + 0.25 * (shZ - hipZ);
    const z1 = shZ - 0.25 * (shZ - hipZ);
    for (const { rest, parts } of this.meshes) {
      for (let i = 0; i < rest.count; i++) {
        const x = rest.getX(i);
        const y = rest.getY(i);
        const z = rest.getZ(i);
        const legW = parts.part[i * 4 + 3];
        const ew = parts.part[i * 4];
        const tw = parts.part[i * 4 + 1];
        const hw = parts.part[i * 4 + 2];
        if (hw > 0.5 && ew < 0.5 && z > noseZ) {
          noseZ = z;
          tip = new THREE.Vector3(x, y, z);
        }
        if (tw > 0.5) tailTip = Math.min(tailTip, z);
        if (legW < 0.05 && tw < 0.05 && hw < 0.05 && z > z0 && z < z1) {
          bellyY = Math.min(bellyY, y);
          topY = Math.max(topY, y);
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      }
    }
    const hp = worldOf(this.head) ?? new THREE.Vector3(0, topY, shZ + 0.05);
    if (!Number.isFinite(noseZ)) noseZ = hp.z + 0.06;
    if (!Number.isFinite(tailTip)) tailTip = hipZ - 0.15;
    const midX = Number.isFinite(minX) ? (minX + maxX) / 2 : 0;
    // Demi-largeur de la tête (hors oreilles), à la hauteur des yeux.
    let headW = 0;
    for (const { rest, parts } of this.meshes) {
      for (let i = 0; i < rest.count; i++) {
        if (parts.part[i * 4 + 2] > 0.5 && parts.part[i * 4] < 0.2 && Math.abs(rest.getY(i) - hp.y) < 0.4 * (noseZ - hp.z)) {
          headW = Math.max(headW, Math.abs(rest.getX(i) - midX));
        }
      }
    }
    this.land = { hipZ, shZ, bellyY, topY, noseZ, tailTip, midZ: (hipZ + shZ) / 2, midX };
    const u = this.uniforms;
    u.cLand.value.set(hipZ, shZ, bellyY, topY);
    u.cHead.value.set(hp.x, hp.y, hp.z, noseZ);
    u.cMisc.value.set(midX, tailTip, tip?.x ?? hp.x, headW || 0.03);
    u.cMuz.value.y = cand.muzzleStart ?? 0.5;
    u.cTail.value.y = cand.tailR ?? (cat ? 0.018 : 0.02);

    // Repère sur la tête (entre l'os et le bout du nez) : gros plans des planches.
    this.headMark = new THREE.Object3D();
    if (this.head) {
      this.head.add(this.headMark);
      const mid = new THREE.Vector3(hp.x, hp.y + 0.005, (hp.z + noseZ) / 2);
      this.headMark.position.copy(this.head.worldToLocal(mid));
    }

    // Échantillons du corps (hors pattes) : pour ne pas passer sous le sol quand les pattes raccourcissent.
    this.samples = [];
    const body = this.meshes.filter((m) => m.mesh.isSkinnedMesh).sort((a, b) => b.rest.count - a.rest.count)[0];
    if (body) {
      const n = body.rest.count;
      const cand0 = [];
      for (let i = 0; i < n; i++) if (body.parts.part[i * 4 + 3] < 0.1) cand0.push(i);
      const step = Math.max(1, Math.floor(cand0.length / 400));
      for (let k = 0; k < cand0.length; k += step) {
        const i = cand0[k];
        this.samples.push({ i, front: body.rest.getZ(i) > this.land.midZ });
      }
      this.sampleMesh = body;
    }

    // Oreilles : direction de chaque segment au repos (vers l'os suivant, ou vers le sommet le plus éloigné
    // de l'oreille pour le dernier) ; sert aux oreilles pliées, tombantes ou dressées des races.
    // Pose de repos de tout le squelette (les rotations des oreilles des races se calculent dans cette pose).
    this.bindPose = [];
    this.inner.traverse((o) => {
      if (o.isBone) this.bindPose.push({ o, p: o.position.clone(), q: o.quaternion.clone(), s: o.scale.clone() });
    });
    this.ears = this.earChains.map((chain) => this.measureEar(chain));
    this.earPose = null;
    this.earScale = 1;

    // Robe : rôle des matières, grain du poil peint, ce qui garde sa couleur (« tip » : autour du bout du nez).
    const spheres = (cand.keep?.spheres ?? []).map(([n, r, l = 0.09]) => {
      const p = n === 'tip' ? tip?.clone().add(new THREE.Vector3(0, 0, -r * 0.4)) : worldOf(bone(n));
      return p ? { s: new THREE.Vector4(p.x, p.y, p.z, r), l } : null;
    }).filter(Boolean);
    for (const m of this.meshes) {
      const role = cand.fur?.[m.mesh.material.name] ?? 'fur';
      const detail = role === 'fur' && !cand.flat ? furLow(m.mesh, m.rest, cand.low) : null;
      if (!m.mesh.geometry.attributes.cmpLow) m.mesh.geometry.setAttribute('cmpLow', new THREE.BufferAttribute(new Float32Array(m.rest.count), 1));
      // (cartes de poils découpées : ce sont des morceaux détachés, mais elles doivent suivre le poil gonflé)
      if (m.mesh.material.alphaTest > 0) m.mesh.geometry.setAttribute('cmpRigid', new THREE.BufferAttribute(new Float32Array(m.rest.count), 1));
      else rigidPieces(m.mesh, m.rest, role === 'keep');
      patchPetMesh(m.mesh, m.toPet, m.bind, this.uniforms, { role, detail, contrast: cand.grain ?? 1, keep: cand.keep, spheres });
    }

    this.mixer = new THREE.AnimationMixer(this.inner);
    this.clips = new Map(gltf.animations.map((c) => [c.name, c]));
    this.natural = { ...(cand.speeds ?? {}) };
    this.action = null;
    this.clipName = null;
    this.pose = this.graph.rest;
    this.trans = null;
    this.size = 1;
    this.long = 1;
    this.tall = 1;
    this.neckScale = 1;
    this.legK = 1;
  }

  /** Segments d'une oreille : os, direction de repos (repère de l'animal), côté. */
  measureEar(chain) {
    const inner = this.inner;
    inner.updateMatrixWorld(true);
    const toPet = new THREE.Matrix4().copy(this.wrapper.matrixWorld).invert();
    const pos = (o) => o.getWorldPosition(new THREE.Vector3()).applyMatrix4(toPet);
    // Sommet le plus éloigné de la base, parmi ceux qui suivent cette oreille (tous les maillages : chez CDmir,
    // le plus grand est la coque de poils).
    const set = new Set();
    chain[0].traverse((c) => set.add(c));
    const base = pos(chain[0]);
    let far = null;
    let farD = -1;
    for (const m of this.meshes) {
      if (!m.mesh.isSkinnedMesh) continue;
      const g = m.mesh.geometry;
      const si = g.attributes.skinIndex;
      const sw = g.attributes.skinWeight;
      const bones = m.mesh.skeleton.bones;
      for (let i = 0; i < m.rest.count; i++) {
        let w = 0;
        for (let k = 0; k < 4; k++) if (set.has(bones[si.getComponent(i, k)])) w += sw.getComponent(i, k);
        if (w < 0.5) continue;
        _v.set(m.rest.getX(i), m.rest.getY(i), m.rest.getZ(i));
        const d = _v.distanceTo(base);
        if (d > farD) {
          farD = d;
          far = _v.clone();
        }
      }
    }
    const pts = chain.map((b) => pos(b));
    pts.push(far ?? pts[pts.length - 1].clone().add(new THREE.Vector3(0, 0.03, 0)));
    return {
      chain,
      restQ: chain.map((b) => b.quaternion.clone()),
      side: Math.sign(base.x - this.land.midX) || 1,
      pts,
      len: farD,
    };
  }

  /**
   * Oreilles d'une race : pose ('fold' pliées en avant, 'lop' tombantes, 'up' dressées, null : celles du
   * fichier) et taille. La direction voulue de chaque segment est notée dans le repère de la tête (au repos) ;
   * à chaque image, après le clip, chaque os est tourné vers elle (aimEars) : les oreilles suivent la tête.
   */
  setEars(pose, scale) {
    this.earScale = scale;
    const want = pose && pose !== (this.cand.earRest ?? 'up') ? pose : null;
    this.earPose = want && this.head ? want : null;
    for (const e of this.ears) e.chain[0].scale.setScalar(scale);
    if (!this.earPose) return;
    // Squelette remis au repos le temps du calcul (sinon il dépendrait de la pose du clip à cet instant).
    const saved = this.bindPose.map(({ o }) => [o.position.clone(), o.quaternion.clone(), o.scale.clone()]);
    for (const b of this.bindPose) {
      b.o.position.copy(b.p);
      b.o.quaternion.copy(b.q);
      b.o.scale.copy(b.s);
    }
    this.holder.updateMatrixWorld(true);
    const wq = this.wrapper.getWorldQuaternion(new THREE.Quaternion());
    const hqInv = this.head.getWorldQuaternion(new THREE.Quaternion()).invert();
    for (const e of this.ears) {
      const s = e.side;
      const n = e.chain.length;
      const target = (i) => {
        if (want === 'up') return new THREE.Vector3(s * 0.22, 0.96, -0.18);
        if (want === 'lop') {
          if (n === 1) return new THREE.Vector3(s * 0.45, -0.88, 0.04);
          return i === 0 ? new THREE.Vector3(s * 0.62, -0.72, 0.04) : new THREE.Vector3(s * 0.16, -0.98, 0.1);
        }
        // fold : la base s'écarte un peu, le bout se rabat vers l'avant et vers le bas.
        if (n === 1) return new THREE.Vector3(s * 0.55, 0.35, 0.75);
        return i === 0 ? new THREE.Vector3(s * 0.62, 0.68, 0.3) : new THREE.Vector3(s * 0.25, -0.35, 0.9);
      };
      // (repère de l'animal → repère de la tête au repos)
      e.aim = e.chain.map((b, i) => target(i).normalize().applyQuaternion(wq).applyQuaternion(hqInv));
      e.tipLocal = e.chain[n - 1].worldToLocal(e.pts[n].clone().applyMatrix4(this.wrapper.matrixWorld));
    }
    this.bindPose.forEach(({ o }, i) => {
      o.position.copy(saved[i][0]);
      o.quaternion.copy(saved[i][1]);
      o.scale.copy(saved[i][2]);
    });
    for (const e of this.ears) e.chain[0].scale.setScalar(scale);
    this.inner.updateMatrixWorld(true);
  }

  /** Oreilles de la race : chaque segment tourné vers sa direction (repère de la tête), de la base au bout. */
  aimEars() {
    const hq = this.head.getWorldQuaternion(_qh);
    for (const e of this.ears) {
      const n = e.chain.length;
      for (let i = 0; i < n; i++) {
        const b = e.chain[i];
        const a = b.getWorldPosition(_a);
        const next = i + 1 < n ? e.chain[i + 1].getWorldPosition(_b) : b.localToWorld(_b.copy(e.tipLocal));
        const cur = next.sub(a).normalize();
        const q = _qa.setFromUnitVectors(cur, _c.copy(e.aim[i]).applyQuaternion(hq));
        const pq = b.parent.getWorldQuaternion(_qp);
        b.quaternion.premultiply(_qb.copy(pq).invert().multiply(q).multiply(pq));
        b.updateMatrixWorld(true);
      }
    }
  }

  has(clip) {
    return !!(clip && this.clips.has(clip));
  }

  /** Joue un clip (fondu depuis le précédent). once : transition jouée une fois, figée à la fin. */
  play(name, once = false, fade = 0.3) {
    const next = this.mixer.clipAction(this.clips.get(name));
    next.reset();
    next.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = once;
    next.timeScale = 1;
    next.setEffectiveWeight(1);
    next.play();
    if (this.action && this.action !== next) next.crossFadeFrom(this.action, fade, false);
    this.action = next;
    this.clipName = name;
  }

  /** Robe : null = couleurs d'origine ; sinon une robe de COATS. */
  setCoat(coat) {
    const u = this.uniforms;
    u.cOn.value = coat ? 1 : 0;
    if (!coat) return;
    u.cPattern.value = PATTERN[coat.pattern] ?? 0;
    u.cBase.value.setHex(coat.base);
    u.cTan.value.setHex(coat.tan ?? coat.base);
    u.cWhite.value.setHex(coat.white ?? 0xf2eee6);
  }

  /** Race : taille (size) et proportions (BREEDS de petCandidates.js). */
  setBreed(b, size) {
    const u = this.uniforms;
    this.size = size;
    this.long = b.back;
    this.legK = b.legs;
    u.cLegK.value = b.legs;
    u.cLegT.value = b.legW;
    u.cGirth.value = b.girth;
    u.cBack.value = b.back;
    u.cShape.value = [b.legs, b.legW, b.girth, b.back, b.head].some((x) => x !== 1) ? 1 : 0;
    u.cHeadS.value = b.head;
    u.cMuz.value.x = b.muzzle;
    u.cFluff.value = b.fluff;
    u.cRuff.value = b.ruff;
    u.cTail.value.x = b.tail;
    u.cHairless.value = b.hairless ? 1 : 0;
    this.tall = 1 - (1 - b.legs) * 0.5;
    this.neckScale = b.neck;
    this.wrapper.scale.setScalar(size);
    const cat = this.species === 'cat';
    this.shadow.scale.set((cat ? 0.06 : 0.07) * 3 * b.girth * size, 1, (cat ? 0.36 : 0.3) * 1.45 * b.back * size);
    this.setEars(b.earPose, b.ears * (b.id === 'origine' ? 1 : this.cand.earK ?? 1));
  }

  /**
   * Une image : allure ou position demandée (id de GAITS) à la vitesse v (m/s, animal de taille 1).
   * Renvoie la vitesse (m/s) à laquelle le sol doit défiler sous lui.
   */
  update(dt, gait, v) {
    const want = this.graph.gaits[gait] ?? this.graph.gaits.stop;
    // Transition en cours : finie quand le clip arrive au bout, on passe à la pose visée.
    if (this.trans && this.action && this.action.time >= this.action.getClip().duration - 0.04) {
      this.pose = this.trans.to;
      this.trans = null;
    }
    if (!this.trans && this.pose !== want.pose) {
      const [edge] = posePath(this.graph, this.pose, want.pose);
      if (edge[2] && this.has(edge[2])) {
        this.play(edge[2], true, 0.22);
        this.trans = { to: edge[1] };
      } else {
        this.pose = edge[1];
        this.fadeNext = 0.6; // (passage sans clip : fondu plus long)
      }
    }
    if (!this.trans && this.pose === want.pose && this.clipName !== want.clip) {
      const clip = this.has(want.clip) ? want.clip : this.graph.gaits.stop.clip;
      if (this.clipName !== clip) this.play(clip, false, this.fadeNext ?? (want.moving ? 0.25 : 0.3));
      this.fadeNext = null;
    }
    this.used = gait;
    let ground = 0;
    const nat = this.natural[want.clip];
    if (!this.trans && want.moving && nat && this.clipName === want.clip) {
      const ts = Math.min(2.2, Math.max(0.6, (v || nat) / nat));
      this.action.timeScale = ts;
      ground = nat * ts;
    } else if (this.action) {
      this.action.timeScale = 1;
    }
    // Encolure et oreilles de la race, par-dessus le clip (remises au repos avant : le clip peut ne pas les
    // animer, et la retouche s'accumulerait ou resterait après un changement de race).
    for (const n of this.neck) n.b.position.copy(n.rest);
    for (const e of this.ears) e.chain.forEach((b, i) => b.quaternion.copy(e.restQ[i]));
    this.mixer.update(dt);
    if (this.neckScale !== 1) for (const n of this.neck) n.b.position.multiplyScalar(this.neckScale);
    this.inner.updateMatrixWorld(true);
    if (this.earPose) this.aimEars();
    this.updateLegs();
    return ground * this.size;
  }

  /**
   * Pattes de la race : axe et longueur de chaque patte (épaule ou hanche → poignet ou jarret) dans le repère
   * de l'animal, et de combien il descend pour que ses pattes raccourcies touchent le sol (sans que le ventre,
   * la tête ou la queue passent dessous).
   */
  updateLegs() {
    const u = this.uniforms;
    if (!u.cShape.value) return;
    const inv = _m.copy(this.inner.matrixWorld).invert();
    if (this.head) this.head.getWorldPosition(u.cHeadJ.value).applyMatrix4(inv);
    const k = this.legK;
    const low = [Infinity, Infinity, Infinity, Infinity];
    const lowK = [Infinity, Infinity, Infinity, Infinity];
    this.legs.forEach((l, i) => {
      if (!l.top || !l.end) return;
      l.top.getWorldPosition(_j).applyMatrix4(inv);
      l.end.getWorldPosition(_p).applyMatrix4(inv);
      const d = _p.clone().sub(_j);
      const len = Math.max(1e-4, d.length());
      u.cJ.value[i].copy(_j);
      u.cA.value[i].copy(d).divideScalar(len);
      u.cL.value[i] = len;
      low[i] = _p.y;
      lowK[i] = _p.y + (k - 1) * (_p.y - _j.y);
    });
    let dF = Math.min(lowK[0], lowK[1]) - Math.min(low[0], low[1]);
    let dB = Math.min(lowK[2], lowK[3]) - Math.min(low[2], low[3]);
    if (k < 1 && this.sampleMesh) {
      let fF = Infinity;
      let fB = Infinity;
      const { mesh, toPet } = this.sampleMesh;
      for (const s of this.samples) {
        mesh.getVertexPosition(s.i, _v).applyMatrix4(toPet);
        if (s.front) fF = Math.min(fF, _v.y);
        else fB = Math.min(fB, _v.y);
      }
      dF = Math.max(0, Math.min(dF, fF - 0.003));
      dB = Math.max(0, Math.min(dB, fB - 0.003));
    }
    u.cDrop.value.set(Number.isFinite(dB) ? dB : 0, Number.isFinite(dF) ? dF : 0);
  }

  /** Position (repère du décor) du milieu de la tête : gros plans. */
  headWorld(out) {
    this.holder.updateMatrixWorld(true);
    return this.headMark.getWorldPosition(out);
  }

  /** Remet l'animal au repos (même instant pour toutes les cartes). */
  reset() {
    this.mixer.stopAllAction();
    this.action = null;
    this.clipName = null;
    this.trans = null;
    this.pose = this.graph.rest;
    this.fadeNext = null;
  }
}

export { posePath };

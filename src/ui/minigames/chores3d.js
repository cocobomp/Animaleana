// Les corvées de l'écurie en 3D, sans animal : curer le box (muck), le pailler (straw), balayer l'allée (sweep). La
// scène est la scène de soin (src/game/care/stage.js) ouverte SANS animal (o.noAnimal), dans le box (barn.js
// boxFloorSet) ou dans l'allée (barn.js aisleSet). La logique et la note sont celles des jeux dessinés (chores.js) :
// voir floor3d.js pour le box ; ici, le balayage.
//
// Branché par le cadre (src/ui/minigames.js : runChoreGame → make3d, start3d → openChoreScene / chore3dGameFor).

import * as THREE from 'three';
import { CareStage } from '../../game/care/stage.js';
import { care3dPossible, care3dSetting } from '../../game/care/which.js';
import { boxFloorSet, bareBoxSet, aisleSet, AISLE, pushBroom, bigDustpan, rubberMatTexture } from '../../game/care/barn.js';
import { sweepGame } from './chores.js';
import { drawMiniGauge } from './clean.js';
import { label, rrect } from './draw.js';
import { softDot } from '../../game/care/textures.js';
import { muck3dGame, straw3dGame } from './floor3d.js';
import { v3, owner } from './horse3dKit.js';

/** Le décor de chaque corvée (pailler : le box curé, sol nu — pas de la paille sur de la paille). */
const CHORE_SETS = { muck: boxFloorSet, straw: bareBoxSet, sweep: aisleSet };

/** Le jeu 3D d'une corvée, ou undefined. */
export function chore3dGameFor(kind) {
  return { muck: muck3dGame, straw: straw3dGame, sweep: sweep3dGame }[kind];
}

/**
 * Ouvre la scène 3D d'une corvée (sans animal) dans la scène du cadre (host), sous la toile 2D (above). Renvoie la
 * scène, ou null (WebGL absent, erreur) : le cadre garde alors le jeu dessiné.
 */
export function openChoreScene(ui, chore, host, above) {
  const set = CHORE_SETS[chore?.kind];
  if (!set) return null;
  const game = ui.game ?? null;
  // (le box d'un cheval : sa plaque à son nom ; sinon une plaque vierge)
  const a = Number.isInteger(chore.target) ? game?.interiors?.boxOccupant?.(chore.target) ?? null : null;
  // (le cheval qui habite le box est là : il mange au fond pendant qu'on cure ou qu'on paille devant lui)
  const horse = choreHorse(game, chore);
  let scene = null;
  try {
    scene = new CareStage({ game, a, noAnimal: !horse, entity: horse ? game?.entities?.get?.(horse.id) ?? null : null, set });
  } catch (e) {
    console.warn('[care3d] scène 3D impossible, jeu dessiné', e?.message ?? e);
    try {
      scene?.dispose();
    } catch {
      /* rien */
    }
    return null;
  }
  host.insertBefore(scene.canvas, above);
  ui.vxCover = (ui.vxCover ?? 0) + 1;
  scene.release = () => {
    ui.vxCover = Math.max(0, (ui.vxCover ?? 1) - 1);
  };
  return scene;
}

/**
 * Le cheval à montrer dans la scène d'une corvée : celui qui habite le box qu'on cure ou qu'on paille (comme le jeu
 * dessiné : « le cheval qui y habite regarde faire »), si son modèle réaliste est chargé ; sinon null (box vide).
 * has : (clé du modèle) → chargé ? (injecté par les tests).
 */
export function choreHorse(game, chore, has = undefined) {
  if (chore?.kind !== 'muck' && chore?.kind !== 'straw') return null;
  if (!Number.isInteger(chore.target)) return null;
  const a = game?.interiors?.boxOccupant?.(chore.target) ?? null;
  if (a?.species !== 'horse') return null;
  return care3dPossible(a, { setting: care3dSetting(), ...(has ? { has } : {}) }) ? a : null;
}

// ---------------------------------------------------------------- balayer l'allée

/**
 * Balayer l'allée, en 3D : la logique de sweepGame (chores.js) telle quelle, sur son sol plat ; ce sol est posé sur le
 * béton de l'allée (la longueur de l'allée le long de x, sa largeur le long de z). Les brins de paille et la poussière
 * sont de vrais brins et de petits tas gris ; le balai d'écurie suit le doigt, sa tête en travers du geste ; la
 * grande pelle rouge attend au bout ; la poussière se soulève quand on balaie (et quand on balaie du propre).
 */
export function sweep3dGame(ctx) {
  const sc = ctx.scene;
  const own = owner();
  const root = new THREE.Group();
  sc.scene.add(root);
  // le sol du jeu dessiné (x 0 → 400, y : l'allée) posé sur le béton
  const p0Logic = { aisle: { y: 104, h: 250 } };
  const A = AISLE;
  const W = { x0: -1.7, x1: 1.7, z0: A.zBoxes + 0.26, z1: A.zBoxes + 2.75 };
  const Y = 0.012;
  const toWorld = (lx, ly, y = Y) => v3(W.x0 + (lx / 400) * (W.x1 - W.x0), y, W.z0 + ((ly - p0Logic.aisle.y) / p0Logic.aisle.h) * (W.z1 - W.z0));
  const toLogic = (p) => ({ x: ((p.x - W.x0) / (W.x1 - W.x0)) * 400, y: p0Logic.aisle.y + ((p.z - W.z0) / (W.z1 - W.z0)) * p0Logic.aisle.h });
  const fingerToLogic = (p) => {
    const hit = sc.pointOnPlane(p.x, p.y, Y);
    return hit ? { ...toLogic(hit), id: p.id, type: p.type } : null;
  };
  // la logique, ses effets reposés sur le sol
  const lctx = Object.create(ctx);
  const P = (x, y) => sc.project(toWorld(x, y, 0.1));
  let lp = { x: 200, y: 200 };
  Object.defineProperty(lctx, 'pointer', { get: () => ({ ...ctx.pointer, x: lp.x, y: lp.y }), set() {} });
  lctx.fx = {
    add() {},
    dot(x, y) {
      puff(toWorld(x, y, 0.05), 0.5);
    },
    text(x, y, ...r) {
      const q = P(x, y);
      ctx.fx.text(q.x, q.y, ...r);
    },
    burst(x, y, ...r) {
      const q = P(x, y);
      ctx.fx.burst(q.x, q.y, ...r);
    },
    float(x, y, ...r) {
      const q = P(x, y);
      ctx.fx.float(q.x, q.y, ...r);
    },
  };
  const play = sweepGame(lctx);
  const s0 = play.peek();

  // ---------------------------------------------------------------- les brins et la poussière
  const all = s0.all ?? [];
  const strandGeo = own(new THREE.BoxGeometry(1, 0.008, 0.012));
  const strandMat = own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
  const straws = all.filter((b) => b.kind === 'straw');
  const dusts = all.filter((b) => b.kind !== 'straw');
  const strawInst = new THREE.InstancedMesh(strandGeo, strandMat, Math.max(1, straws.length * 3));
  strawInst.castShadow = true;
  strawInst.receiveShadow = true;
  own({ dispose: () => strawInst.dispose() });
  root.add(strawInst);
  const lumpGeo = own(new THREE.IcosahedronGeometry(1, 1));
  const dustMat = own(new THREE.MeshStandardMaterial({ color: 0x6f665a, roughness: 1 }));
  const dustInst = new THREE.InstancedMesh(lumpGeo, dustMat, Math.max(1, dusts.length));
  dustInst.castShadow = false;
  dustInst.receiveShadow = true;
  own({ dispose: () => dustInst.dispose() });
  root.add(dustInst);
  const col = new THREE.Color();
  straws.forEach((b, i) => {
    for (let k = 0; k < 3; k++) strawInst.setColorAt(i * 3 + k, col.setHex([0xe8c968, 0xd8b45a, 0xf0d88e][(i + k) % 3]));
  });
  const m4 = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const at = new THREE.Vector3();
  const off = new THREE.Vector3();
  const scl = new THREE.Vector3();
  // (où était chaque brin à la dernière mise à jour : on ne refait les matrices que si l'un d'eux a bougé)
  const lastXY = new Float32Array(all.length * 2).fill(NaN);
  function syncBits(list = play.peek().all ?? []) {
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      if (list[i].x !== lastXY[i * 2] || list[i].y !== lastXY[i * 2 + 1]) {
        moved = true;
        lastXY[i * 2] = list[i].x;
        lastXY[i * 2 + 1] = list[i].y;
      }
    }
    if (!moved) return;
    let si = 0;
    let di = 0;
    for (let idx = 0; idx < list.length; idx++) {
      const b = list[idx];
      at.set(W.x0 + (b.x / 400) * (W.x1 - W.x0), 0.006, W.z0 + ((b.y - p0Logic.aisle.y) / p0Logic.aisle.h) * (W.z1 - W.z0));
      if (b.kind === 'straw') {
        for (let k = 0; k < 3; k++) {
          e.set(0, -b.rot + k * 0.5 - 0.5, 0.05 * k);
          q.setFromEuler(e);
          off.set(Math.cos(idx + k * 2) * 0.012, 0.003 * k, Math.sin(idx + k * 3) * 0.012).add(at);
          m4.compose(off, q, scl.set(0.16 + 0.05 * ((idx + k) % 3), 1, 1));
          strawInst.setMatrixAt(si * 3 + k, m4);
        }
        si++;
      } else {
        const r = (b.r ?? 4) * 0.008;
        e.set(idx, idx * 2, 0);
        q.setFromEuler(e);
        at.y = r * 0.25;
        m4.compose(at, q, scl.set(r * 1.3, r * 0.45, r));
        dustInst.setMatrixAt(di++, m4);
      }
    }
    strawInst.instanceMatrix.needsUpdate = true;
    dustInst.instanceMatrix.needsUpdate = true;
  }
  syncBits();

  // ---------------------------------------------------------------- la grande pelle, le balai
  // Le bout de l'allée où l'on ramasse (la « pelle » du jeu dessiné, toute la largeur de l'allée) : un grand tapis en
  // caoutchouc noir où l'on pousse le tas, et la pelle rouge posée dessus.
  const pan = s0.pan;
  const c0 = toWorld(pan.x + 10, pan.y, 0);
  const c1 = toWorld(pan.x + pan.w, pan.y + pan.h, 0);
  // (un tapis à picots, brun, avec son bord jaune : on voit que c'est un tapis où l'on pousse le tas — avant, un pavé
  // noir uni ; la grande pelle rouge posée dessus, la lèvre vers l'allée)
  const matW = c1.x - c0.x + 0.12;
  const matD = c1.z - c0.z + 0.1;
  const matTex = own(rubberMatTexture());
  matTex.repeat.set(matW / 0.6, matD / 0.6);
  const rubber = new THREE.Mesh(own(new THREE.BoxGeometry(matW, 0.014, matD)), own(new THREE.MeshStandardMaterial({ map: matTex, color: 0xc8b8a4, roughness: 0.85 })));
  rubber.position.set((c0.x + c1.x) / 2 + 0.04, 0.007, (c0.z + c1.z) / 2);
  rubber.receiveShadow = true;
  root.add(rubber);
  const rimMat = own(new THREE.MeshStandardMaterial({ color: 0xe2b42a, roughness: 0.6 }));
  for (const [w, d, x, z] of [[matW, 0.035, 0, -matD / 2], [matW, 0.035, 0, matD / 2], [0.035, matD, -matW / 2, 0], [0.035, matD, matW / 2, 0]]) {
    const rim = new THREE.Mesh(own(new THREE.BoxGeometry(w, 0.022, d)), rimMat);
    rim.position.set(rubber.position.x + x, 0.011, rubber.position.z + z);
    rim.receiveShadow = true;
    rim.castShadow = true;
    root.add(rim);
  }
  const dustpan = bigDustpan(own, 0.62);
  dustpan.group.position.set(c0.x + 0.1, 0.016, (c0.z + c1.z) / 2 + 0.45);
  dustpan.group.rotation.y = -0.18;
  root.add(dustpan.group);
  const broom = pushBroom(own);
  broom.scale.setScalar(1.3); // (plus grand : on le voit bien au téléphone)
  broom.visible = false;
  root.add(broom);
  let dir = v3(1, 0, 0);
  let lastW = null;

  // ---------------------------------------------------------------- la poussière qui se soulève
  const puffTex = own(softDot('170,155,130'));
  // (les bouffées en l'air : leur fin, en temps de la scène — pas setTimeout, qui compte en temps réel)
  const puffEnds = [];
  function puff(at, k = 1) {
    while (puffEnds.length && puffEnds[0] <= sc.time) puffEnds.shift();
    if (puffEnds.length > 24) return;
    puffEnds.push(sc.time + 0.95);
    const mat = new THREE.SpriteMaterial({ map: puffTex, transparent: true, opacity: 0.55 * k, depthWrite: false });
    mat.userData.baseOpacity = 0.55 * k;
    const sp = new THREE.Sprite(mat);
    sp.position.copy(at);
    const s = 0.12 + Math.random() * 0.1;
    sp.scale.set(s, s, s);
    sc.spawn(sp, { life: 0.9, v: v3((Math.random() - 0.5) * 0.3, 0.25 + Math.random() * 0.25, (Math.random() - 0.5) * 0.3), update: (o, kk) => o.scale.setScalar(s * (1 + kk * 1.6)) });
  }

  // ---------------------------------------------------------------- caméra
  function frame(now = false) {
    const pts = [toWorld(0, 104, 0), toWorld(400, 104, 0), toWorld(0, 354, 0), toWorld(400, 354, 0), v3(W.x0, 0.75, A.zBoxes), v3(W.x1, 0.75, A.zBoxes)];
    // (en portrait : les devants des box, leurs barreaux et leurs plaques remplissent le haut, plutôt que 40 % de
    // béton vide en bas)
    if (sc.size.h > sc.size.w * 1.15) pts.push(v3(W.x0, 2.55, A.zBoxes), v3(W.x1, 2.55, A.zBoxes));
    sc.frame(pts, { dir: [0.02, 1.25, 1], pad: 1.0, now });
  }
  frame(true);
  let size = '';

  return {
    peek: () => {
      const s = play.peek();
      return {
        ...s,
        screen: (x, y) => sc.project(toWorld(x, y)),
        bitsScreen: (s.bits ?? []).map((b) => sc.project(toWorld(b.x, b.y))),
        panScreen: sc.project(toWorld(pan.x + pan.w / 2, pan.y + pan.h / 2)),
      };
    },
    down(p) {
      const l = fingerToLogic(p);
      if (!l) return;
      lp = l;
      lastW = toWorld(l.x, l.y);
      play.down(l);
    },
    move(p, down) {
      const l = fingerToLogic(p);
      if (!l) return;
      lp = l;
      const w = toWorld(l.x, l.y);
      if (down && lastW) {
        const d = w.clone().sub(lastW).setY(0);
        if (d.length() > 0.01) {
          dir.lerp(d.normalize(), 0.5).normalize();
          if (Math.random() < 0.35) puff(w.clone().addScaledVector(dir, 0.18).setY(0.04), 0.7);
        }
      }
      lastW = w;
      play.move(l, down);
    },
    up(p) {
      const l = fingerToLogic(p) ?? lp;
      lastW = null;
      play.up(l);
    },
    key: (c, d) => play.key?.(c, d),
    update(dt) {
      play.update?.(dt);
      const key = `${sc.size.w}x${sc.size.h}`;
      if (key !== size) {
        size = key;
        frame(true);
      }
      syncBits(play.peek().all ?? []);
      const pp = ctx.pointer;
      const at = (pp.over || pp.down) && !ctx.done && sc.ready ? sc.pointOnPlane(pp.x, pp.y, Y) : null;
      broom.visible = !!at;
      if (at) {
        broom.position.copy(at);
        broom.rotation.set(0, Math.atan2(-dir.x, -dir.z), 0);
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      const v = ctx.view;
      // le compte dans la pelle, et la petite jauge (la même zone verte que la jauge du cadre)
      const c = sc.project(toWorld(pan.x + pan.w / 2, pan.y - 4, 0.3));
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.88)';
      rrect(g, c.x - 34, c.y - 30, 68, 28, 14);
      g.fill();
      label(g, `${s.collected} / ${s.total}`, c.x, c.y - 16, 16, '#23302a');
      g.restore();
      drawMiniGauge(g, v.x0 + 30, v.y0 + 14, Math.min(250, v.x1 - v.x0 - 140), 14, s.value / s.max, s.lo / s.max, s.hi / s.max);
      if (s.collected < s.total && !ctx.done && s.value < s.lo) {
        const a = sc.project(toWorld(pan.x - 40, pan.y + pan.h / 2 + 40, 0.05));
        g.save();
        g.font = '24px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText('➡️', a.x + Math.sin(ctx.time * 5) * 4, a.y);
        g.restore();
      }
    },
    destroy() {
      play.destroy?.();
      sc.scene.remove(root);
      own.free();
    },
  };
}

// Les travaux au sol du box, en 3D : curer le box du cheval (soin « clean » : clean.js cleanGame), la corvée « curer »
// (chores.js muckGame) et la corvée « pailler » (chores.js strawGame). La LOGIQUE est celle des jeux dessinés, telle
// quelle (même règle, même note) : elle travaille sur son sol plat de 400 × 360 ; ici, ce sol est posé sur le sol du
// box (une correspondance linéaire : un point du sol 3D ↔ un point du sol du jeu dessiné). Le doigt touche le sol 3D
// (rayon contre le plan du sol), on le ramène sur le sol du jeu dessiné ; ce que la logique a sur son sol (crottin,
// touffes de paille propre, paille posée, brouette, botte) est montré en 3D au même endroit.
//
//   - curer : la fourche sous le doigt ; chaque tas de crottin (des pommes brun foncé) se prend et vole dans la
//     brouette (le tas y monte) ; les touffes de paille propre (corvée) sont à laisser ;
//   - pailler : on prend une brassée sur la botte, on la secoue en glissant sur le sol : la paille fraîche se pose là où
//     le doigt passe (une couche dorée, des brins), en tas si on repasse au même endroit ;
//   - le soin du cheval : le cheval mange au filet au fond du box pendant qu'on cure devant lui, puis on étale.

import * as THREE from 'three';
import { cleanGame } from './clean.js';
import { muckGame, strawGame } from './chores.js';
import { distToSegment, label, rrect } from './draw.js';
import { drawMiniGauge } from './clean.js';
import { STALL } from '../../game/care/stall.js';
import { manurePile, strawTuft, wheelbarrow, pitchfork, strawBale, strawArmful, lumpGeometry, dirtyBox } from '../../game/care/barn.js';
import { strawFloorTexture, softDot, rng as seeded } from '../../game/care/textures.js';
import { v3, owner, impatience } from './horse3dKit.js';

/**
 * Le moteur commun. make : la logique dessinée (ctx → jeu). o : { floor (rectangle du sol de la logique), cells
 * ('replicate' : refaire la paille posée de clean.js ; 'peek' : la lire dans peek().cells ; null), step (taille d'une
 * case), bale (la botte de paille), horse (le cheval est dans le box) }.
 */
export function floorGame3d(ctx, make, o) {
  const sc = ctx.scene;
  const own = owner();
  const F = o.floor;
  const S = STALL;
  const horse = !sc.noAnimal;
  const m = sc.mood;
  // (le box du cheval, celui des soins : il devient box à curer le temps du jeu — litière sale, porte ouverte)
  let undoBox = null;
  if (!sc.decor?.dirty && sc.decor?.walls) {
    const over = dirtyBox(sc, sc.decor);
    const base = sc.decor.update;
    sc.decor.update = (dt, st) => {
      base(dt, st);
      over.update();
    };
    undoBox = () => {
      sc.decor.update = base;
      over.dispose();
    };
  }
  // ---------------------------------------------------------------- le sol du jeu dessiné, posé sur le box
  const z0 = horse ? sc.holder.position.z + 0.5 * sc.double.scale + 0.2 : S.back + 0.3;
  const W = { x0: -S.halfW + 0.28, x1: S.halfW - 0.82, z0, z1: S.front - 0.3 };
  const Y = 0.03;
  const toWorld = (lx, ly, y = Y) => v3(W.x0 + ((lx - F.x) / F.w) * (W.x1 - W.x0), y, W.z0 + ((ly - F.y) / F.h) * (W.z1 - W.z0));
  const toLogic = (p) => ({ x: F.x + ((p.x - W.x0) / (W.x1 - W.x0)) * F.w, y: F.y + ((p.z - W.z0) / (W.z1 - W.z0)) * F.h });
  /** Le doigt (espace du cadre) → un point du sol de la logique (ou null : il ne vise pas le sol). */
  const fingerToLogic = (p) => {
    const hit = sc.pointOnPlane(p.x, p.y, Y);
    return hit ? { ...toLogic(hit), id: p.id, type: p.type, world: hit } : null;
  };

  // ---------------------------------------------------------------- la logique, avec ses effets reposés sur le sol 3D
  const lctx = Object.create(ctx);
  const P = (x, y) => sc.project(toWorld(x, y, 0.15));
  lctx.fx = {
    add() {},
    dot(x, y, color) {
      if (Math.random() < 0.5) spawnStraw(toWorld(x, y, 0.06), color);
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
  // (la logique lit le doigt dans ctx.pointer : on lui donne le sien, sur son sol)
  let lp = { x: F.x + F.w / 2, y: F.y + F.h / 2, down: false, over: false };
  Object.defineProperty(lctx, 'pointer', { get: () => ({ ...ctx.pointer, x: lp.x, y: lp.y }), set() {} });
  const play = make(lctx);
  const p0 = play.peek();

  // ---------------------------------------------------------------- matières partagées
  const mats = {
    lump: own(lumpGeometry(7)),
    manure: own(new THREE.MeshStandardMaterial({ color: 0x4b3a1e, roughness: 0.38 })),
    manure2: own(new THREE.MeshStandardMaterial({ color: 0x5d4a26, roughness: 0.5 })),
    wet: own(new THREE.MeshBasicMaterial({ map: own(softDot('52,38,20')), transparent: true, opacity: 0.55, depthWrite: false })),
    wetGeo: own(new THREE.PlaneGeometry(1, 1)),
    strand: own(new THREE.BoxGeometry(1, 0.004, 0.006)),
    strandMat: own(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 })),
  };
  const root = new THREE.Group();
  sc.scene.add(root);

  // ---------------------------------------------------------------- crottin et touffes (ce qui est par terre)
  const keyOf = (it) => `${it.x.toFixed(2)},${it.y.toFixed(2)}`;
  const items = (p0.items ?? []).map((it, i) => {
    const obj = it.good ? strawTuft(own, mats, i + 1) : manurePile(own, mats, i + 1);
    obj.position.copy(toWorld(it.x, it.y, 0.012));
    obj.rotation.y = i * 1.7;
    const s = (it.good ? 1.2 : 1.45) * (1 + (seeded(i + 5)() - 0.5) * 0.25);
    obj.scale.setScalar(s);
    root.add(obj);
    return { key: keyOf(it), x: it.x, y: it.y, good: !!it.good, obj, state: 'floor', k: 0, from: null };
  });
  const nDirt = items.filter((x) => !x.good).length;

  // ---------------------------------------------------------------- la brouette, la botte
  let barrow = null;
  if (p0.bin) {
    barrow = wheelbarrow(own);
    const at = toWorld(p0.bin.x, p0.bin.y, 0);
    at.x = Math.min(S.halfW - 0.4, Math.max(at.x, W.x1 + 0.3));
    at.z = Math.min(S.front - 0.95, Math.max(at.z, W.z0 + 0.55));
    barrow.group.position.copy(at);
    barrow.group.rotation.y = 0.12;
    root.add(barrow.group);
  }
  let bale = null;
  if (o.bale && p0.bale) {
    bale = strawBale(own);
    const c = toWorld(p0.bale.x + p0.bale.w / 2, p0.bale.y + p0.bale.h / 2, 0);
    c.x = Math.min(S.halfW - 0.3, Math.max(c.x, W.x1 + 0.25));
    bale.group.position.copy(c);
    bale.group.rotation.y = Math.PI / 2 + 0.15;
    root.add(bale.group);
  }

  // ---------------------------------------------------------------- la paille fraîche posée (couche, brins, tas)
  let cells = null;
  if (o.cells) {
    const step = o.step ?? p0.step ?? 36;
    cells = [];
    for (let y = F.y + step / 2; y < F.y + F.h; y += step) {
      for (let x = F.x + step / 2; x < F.x + F.w; x += step) cells.push({ x, y, n: 0, hit: false, shown: 0 });
    }
    cells.step = step;
  }
  const cover = cells ? coverLayer() : null;
  function coverLayer() {
    const CW = 128;
    const CH = Math.round((128 * F.h) / F.w);
    const canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;
    const c2 = canvas.getContext('2d');
    c2.fillStyle = '#000';
    c2.fillRect(0, 0, CW, CH);
    const alpha = own(new THREE.CanvasTexture(canvas));
    const tex = own(strawFloorTexture());
    tex.repeat.set(2.2, 1.8);
    const mat = own(new THREE.MeshStandardMaterial({ map: tex, alphaMap: alpha, transparent: true, depthWrite: false, roughness: 1, color: 0xffffff, emissive: 0x2a1e08, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    const geo = own(new THREE.PlaneGeometry(W.x1 - W.x0 + 0.3, W.z1 - W.z0 + 0.3, 1, 1));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set((W.x0 + W.x1) / 2, 0.026, (W.z0 + W.z1) / 2);
    mesh.receiveShadow = true;
    mesh.renderOrder = 1;
    root.add(mesh);
    // les brins (une gerbe par couche et par case) et les tas
    const cap = cells.length * 3 * 9;
    const strands = new THREE.InstancedMesh(mats.strand, mats.strandMat, cap);
    strands.count = 0;
    strands.castShadow = false;
    strands.receiveShadow = true;
    own({ dispose: () => strands.dispose() });
    root.add(strands);
    const heapTex = own(strawFloorTexture());
    heapTex.repeat.set(0.6, 0.6);
    // (un tas : une motte de paille bosselée, pas un disque bien rond)
    const heapGeo = own(lumpyHeap());
    const heaps = new THREE.InstancedMesh(heapGeo, own(new THREE.MeshStandardMaterial({ map: heapTex, color: 0xf6e2a6, roughness: 1 })), cells.length);
    heaps.count = 0;
    heaps.castShadow = true;
    heaps.receiveShadow = true;
    own({ dispose: () => heaps.dispose() });
    root.add(heaps);
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const col = new THREE.Color();
    const r = seeded(77);
    const sx = (W.x1 - W.x0) / F.w;
    const sz = (W.z1 - W.z0) / F.h;
    return {
      /** Une couche de plus dans la case c. */
      add(c) {
        // la couche (douce) sur la carte de transparence
        const px = ((c.x - F.x) / F.w) * CW;
        const py = ((c.y - F.y) / F.h) * CH;
        const rad = (cells.step / F.w) * CW * 0.95;
        const g = c2.createRadialGradient(px, py, 0, px, py, rad);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.6, 'rgba(255,255,255,0.85)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        c2.fillStyle = g;
        c2.fillRect(px - rad, py - rad, rad * 2, rad * 2);
        alpha.needsUpdate = true;
        // les brins
        for (let i = 0; i < 9 && strands.count < cap; i++) {
          const lx = c.x + (r() - 0.5) * cells.step * 1.2;
          const ly = c.y + (r() - 0.5) * cells.step * 1.2;
          e.set((r() - 0.5) * 0.4, r() * Math.PI * 2, (r() - 0.5) * 0.4);
          q.setFromEuler(e);
          const len = 0.1 + r() * 0.16;
          m4.compose(toWorld(lx, ly, 0.03 + Math.min(3, c.n) * 0.012 + r() * 0.01), q, v3(len, 1, 1 + r()));
          strands.setMatrixAt(strands.count, m4);
          strands.setColorAt(strands.count, col.setHex([0xf0d88e, 0xe6c66e, 0xd8b45a, 0xf6e2a0, 0xe9cf86][Math.floor(r() * 5)]).multiplyScalar(0.9 + r() * 0.2));
          strands.count++;
        }
        strands.instanceMatrix.needsUpdate = true;
        if (strands.instanceColor) strands.instanceColor.needsUpdate = true;
        // un tas, si on repasse au même endroit
        if (c.n >= 2) {
          if (c.heap === undefined && heaps.count < cells.length) c.heap = heaps.count++;
          if (c.heap !== undefined) {
            const k = Math.min(4, c.n) - 1;
            const w = cells.step * 0.55;
            e.set(0, r() * Math.PI * 2, 0);
            q.setFromEuler(e);
            m4.compose(toWorld(c.x + (r() - 0.5) * 6, c.y + (r() - 0.5) * 6, 0.015), q, v3(w * sx * (0.75 + 0.12 * k), 0.05 * k + 0.03, w * sz * (0.6 + 0.12 * k)));
            heaps.setMatrixAt(c.heap, m4);
            heaps.instanceMatrix.needsUpdate = true;
          }
        }
      },
    };
  }
  /** Les couches de paille : celles de la logique (peek) ou refaites comme clean.js (même calcul). */
  function syncCells() {
    if (!cells) return;
    if (o.cells === 'peek') {
      const pc = play.peek().cells ?? [];
      pc.forEach((q, i) => {
        if (cells[i]) cells[i].n = q.n;
      });
    }
    for (const c of cells) {
      while (c.shown < c.n) {
        c.shown++;
        cover.add({ ...c, n: c.shown });
      }
    }
  }
  // (clean.js : une couche par passage, le cœur de la brassée pose, le bord bouche les trous)
  let last = null;
  const onFloor = (p) => p.x > F.x - 6 && p.x < F.x + F.w + 6 && p.y > F.y - 6 && p.y < F.y + F.h + 6;
  function replicateSpread(p) {
    if (!last) {
      last = p;
      return;
    }
    const inside = onFloor(p) && onFloor(last);
    for (const c of cells) {
      if (c.hit) continue;
      const d = distToSegment(c.x, c.y, last.x, last.y, p.x, p.y);
      if ((d < 18 && inside) || (d < 32 && c.n === 0)) {
        c.n++;
        c.hit = true;
      }
    }
    last = p;
  }

  // ---------------------------------------------------------------- l'outil sous le doigt : fourche, brassée
  const fork = pitchfork(own);
  fork.visible = false;
  root.add(fork);
  const armful = o.cells ? strawArmful(own, mats) : null;
  if (armful) {
    armful.visible = false;
    root.add(armful);
  }
  const strawBits = [];
  function spawnStraw(at) {
    if (strawBits.length > 40) return;
    const mesh = new THREE.Mesh(mats.strand, mats.strandMat);
    mesh.scale.set(0.12, 1, 1.5);
    mesh.position.copy(at);
    mesh.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    mesh.material = mats.strandMat;
    mats.strand.userData.shared = true;
    mats.strandMat.userData.shared = true;
    strawBits.push(mesh);
    sc.spawn(mesh, { life: 0.7, v: v3((Math.random() - 0.5) * 0.8, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.8), grav: 4, spin: 6, fade: false });
    setTimeout(() => strawBits.splice(strawBits.indexOf(mesh), 1), 800);
  }

  /** Le doigt (espace du cadre) est-il sur la brouette 3D ? (son contour à l'écran, élargi d'un doigt) */
  root.updateMatrixWorld(true);
  const barrowBox = barrow ? new THREE.Box3().setFromObject(barrow.group) : null;
  const corner = new THREE.Vector3();
  function overBarrow(p) {
    if (!barrowBox) return false;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? barrowBox.max.x : barrowBox.min.x, i & 2 ? barrowBox.max.y : barrowBox.min.y, i & 4 ? barrowBox.max.z : barrowBox.min.z);
      const q = sc.project(corner);
      x0 = Math.min(x0, q.x);
      y0 = Math.min(y0, q.y);
      x1 = Math.max(x1, q.x);
      y1 = Math.max(y1, q.y);
    }
    const m = 14;
    return p.x > x0 - m && p.x < x1 + m && p.y > y0 - m && p.y < y1 + m;
  }

  // ---------------------------------------------------------------- caméra
  function frame(now = false) {
    const pts = [toWorld(F.x, F.y, 0), toWorld(F.x + F.w, F.y, 0), toWorld(F.x, F.y + F.h, 0), toWorld(F.x + F.w, F.y + F.h, 0)];
    if (barrow) pts.push(barrow.group.localToWorld(barrow.mouth.clone().add(v3(0.32, 0, 0))), barrow.group.localToWorld(v3(-0.32, 0.6, 0)), barrow.group.localToWorld(v3(0, 0.45, 0.9)));
    if (bale) for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) pts.push(bale.group.localToWorld(v3(x * bale.w / 2, bale.h, z * bale.d / 2)));
    if (horse) pts.push(sc.marks.withers, sc.marks.croup, sc.marks.poll);
    sc.frame(pts, { dir: [0.04, horse ? 1.0 : 1.2, 1], pad: 1.04, now });
  }
  frame(true);
  if (horse) {
    sc.decor.layout('feed');
    m.feeder = 0;
    m.ears = 'forward';
  }
  const busy = horse ? impatience(sc, { after: 14 }) : null;

  // ---------------------------------------------------------------- ce qu'on tient, ce qui vole
  let held = null;
  const floorKeys = () => new Set((play.peek().items ?? []).map(keyOf));
  function itemPos(it) {
    return toWorld(it.x, it.y, 0.012);
  }
  let size = '';
  return {
    peek: () => {
      const s = play.peek();
      return {
        ...s,
        /** (tests et captures) un point du sol de la logique → l'espace du cadre */
        screen: (x, y) => sc.project(toWorld(x, y)),
        itemsScreen: (s.items ?? []).map((it) => ({ ...sc.project(toWorld(it.x, it.y, 0.04)), good: it.good })),
        binScreen: barrow ? sc.project(barrow.group.localToWorld(barrow.mouth.clone())) : null,
        baleScreen: bale ? sc.project(bale.group.localToWorld(bale.top.clone())) : null,
        floorScreen: [sc.project(toWorld(F.x + 20, F.y + 20)), sc.project(toWorld(F.x + F.w - 20, F.y + F.h - 20))],
      };
    },
    down(p) {
      const q = fingerToLogic(p);
      if (!q) return;
      lp = q;
      busy?.poke();
      const before = floorKeys();
      play.down(q);
      const after = floorKeys();
      for (const it of items) {
        if (it.state === 'floor' && before.has(it.key) && !after.has(it.key)) {
          it.state = 'held';
          held = it;
        }
      }
      if (cells && o.cells === 'replicate' && play.peek().phase === 'spread') last = q;
    },
    move(p, down) {
      const q = fingerToLogic(p);
      if (!q) return;
      lp = q;
      play.move?.(q, down);
      if (down && cells && o.cells === 'replicate' && play.peek().phase === 'spread') replicateSpread(q);
    },
    up(p) {
      let q = fingerToLogic(p) ?? lp;
      // (glissé sur la brouette 3D : il va dans la brouette. Elle n'est pas toujours pile à la place de celle du jeu
      // dessiné — avec le cheval, elle recule pour tenir dans le box — : la logique reçoit alors sa brouette à elle)
      if (held && p0.bin && overBarrow(p)) q = { ...q, x: p0.bin.x, y: p0.bin.y };
      const before = floorKeys();
      play.up?.(q);
      last = null;
      if (cells) for (const c of cells) c.hit = false;
      if (!held) return;
      const after = floorKeys();
      const fresh = [...after].filter((k) => !before.has(k) && !items.some((it) => it.key === k && it.state === 'floor'));
      if (fresh.length) {
        // lâché à côté : il retombe là
        const [x, y] = fresh[0].split(',').map(Number);
        Object.assign(held, { key: fresh[0], x, y, state: 'floor' });
        held.obj.position.copy(itemPos(held));
      } else {
        held.state = 'fly';
        held.k = 0;
        held.from = held.obj.position.clone();
      }
      held = null;
    },
    key: (c, d) => play.key?.(c, d),
    update(dt) {
      play.update?.(dt);
      const key = `${sc.size.w}x${sc.size.h}`;
      if (key !== size) {
        size = key;
        frame(true);
      }
      syncCells();
      // ce qui vole vers la brouette
      for (const it of items) {
        if (it.state !== 'fly') continue;
        it.k = Math.min(1, it.k + dt * 2.6);
        const to = barrow ? barrow.group.localToWorld(barrow.mouth.clone()) : itemPos(it);
        it.obj.position.lerpVectors(it.from, to, it.k);
        it.obj.position.y += Math.sin(it.k * Math.PI) * 0.45;
        it.obj.rotation.x += dt * 6;
        if (it.k >= 1) {
          it.state = 'bin';
          it.obj.visible = false;
        }
      }
      const inBin = items.filter((x) => x.state === 'bin' && !x.good).length;
      barrow?.setFill(nDirt ? inBin / nDirt : 0);
      // l'outil sous le doigt
      const pp = ctx.pointer;
      const show = (pp.over || pp.down) && !ctx.done && sc.ready;
      const at = show ? sc.pointOnPlane(pp.x, pp.y, Y) : null;
      const s = play.peek();
      const spreading = !!cells && (o.cells === 'peek' ? true : s.phase === 'spread');
      const withArm = spreading && (o.cells === 'peek' ? s.arm > 0 : true);
      fork.visible = !!at && !spreading;
      if (armful) armful.visible = !!at && withArm;
      if (at) {
        const cam = sc.camera.position;
        const yaw = Math.atan2(cam.x - at.x, cam.z - at.z);
        if (fork.visible) {
          fork.position.copy(at).add(v3(0, held ? 0.08 : 0.02, 0));
          fork.rotation.set(held ? -0.15 : 0, yaw, 0);
        }
        if (armful?.visible) {
          armful.position.copy(at).add(v3(0, 0.12, 0));
          armful.scale.setScalar(0.6 + 0.6 * (o.cells === 'peek' ? s.arm : 1));
          armful.rotation.y = yaw;
        }
      }
      if (held) {
        const tip = fork.visible ? fork.localToWorld(v3(0, 0.03, 0.12)) : at ?? held.obj.position;
        held.obj.position.copy(tip);
      }
      // le cheval mange au filet, tourne la tête vers nous de temps en temps ; impatient si on traîne
      if (horse) {
        const fidget = busy.update(dt, !!pp.down || ctx.done);
        if (!fidget) m.lift = null;
        const k = (Math.sin(sc.time * 0.35) + 1) / 2;
        m.look = at ?? sc.decor.props?.net?.bite?.(v3()) ?? null;
        m.lookAmt = at && k > 0.8 ? 0.6 : 0;
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      const v = ctx.view;
      if (barrow && s.phase !== 'spread' && (s.dirtInBin ?? 0) < (s.nDirt ?? nDirt) && !ctx.done) {
        const b = sc.project(barrow.group.localToWorld(barrow.mouth.clone()));
        g.save();
        g.font = '24px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText('⬇️', b.x, b.y - 34 + Math.sin(ctx.time * 5) * 4);
        g.restore();
      }
      const tx = v.x1 - 44;
      const ty = Math.max(16, v.y0 + 16);
      if (s.phase === 'pick' || (s.phase === undefined && !cells)) {
        g.save();
        g.fillStyle = 'rgba(255,255,255,0.88)';
        rrect(g, tx - 36, ty, 72, 30, 15);
        g.fill();
        label(g, `${s.dirtInBin ?? 0} / ${s.nDirt ?? nDirt}`, tx, ty + 15, 17, '#23302a');
        g.restore();
      } else if (cells) {
        drawMiniGauge(g, tx - 7, ty, 14, 130, s.value / s.max, s.lo / s.max, s.hi / s.max);
        if (o.cells === 'peek') label(g, `${Math.round(s.value * 100)} %`, tx, ty + 148, 15);
      }
      if (bale && s.arm <= 0 && !ctx.done) {
        const b = sc.project(bale.group.localToWorld(bale.top.clone()));
        g.save();
        g.font = '24px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        g.fillStyle = '#000';
        g.fillText('⬇️', b.x, b.y - 30 + Math.sin(ctx.time * 5) * 4);
        g.restore();
      }
    },
    destroy() {
      play.destroy?.();
      sc.scene.remove(root);
      undoBox?.();
      own.free();
    },
  };
}

/** Curer le box du cheval (soin « clean ») : le cheval mange au fond, on cure devant lui, puis on étale. */
export function clean3dGame(ctx) {
  return floorGame3d(ctx, (c) => cleanGame(c), { floor: { x: 14, y: 96, w: 312, h: 246 }, cells: 'replicate', step: 36 });
}

/** La corvée « curer le box » (le box vide). */
export function muck3dGame(ctx) {
  return floorGame3d(ctx, muckGame, { floor: { x: 14, y: 96, w: 312, h: 246 }, cells: null });
}

/** La corvée « pailler » (le box vide). */
export function straw3dGame(ctx) {
  return floorGame3d(ctx, strawGame, { floor: { x: 14, y: 96, w: 300, h: 246 }, cells: 'peek', bale: true });
}

/** Une motte de paille : une demi-sphère bosselée et un peu aplatie (les tas, quand on repasse au même endroit). */
function lumpyHeap() {
  const geo = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const p = geo.attributes.position;
  const r = seeded(19);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const a = Math.atan2(z, x);
    const k = 0.8 + 0.2 * Math.sin(a * 3 + 1) + (r() - 0.5) * 0.12;
    p.setXYZ(i, x * k, p.getY(i) * (0.85 + (r() - 0.5) * 0.3), z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

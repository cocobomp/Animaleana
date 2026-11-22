// Nettoyer l'étable de la vache, en 3D. La logique est celle du jeu dessiné (clean.js cleanGame : d'abord toutes les
// bouses dans la brouette — on les touche, ou on les y glisse —, puis on étale la paille fraîche, une couche partout,
// ni clairsemée ni en tas, et « C'est bon ! ») : la note et les textes ne changent pas.
// Ici, dans l'étable, la vache mange au râtelier pendant qu'on travaille ; devant elle, la litière sale (paille foulée,
// brunie) et les bouses, avec leurs mouches. À la fourche : la bouse touchée part en cloche dans la brouette verte, qui
// se remplit ; puis chaque passage du doigt pose une brassée de paille dorée (deux brassées au même endroit : un tas).
// Le petit terrain du jeu dessiné (le sol de 312 × 246, la brouette à droite) est posé sur la litière, devant elle.

import * as THREE from 'three';
import { cleanGame } from './clean.js';
import { withLogic } from './care3d.js';
import { distToSegment } from './draw.js';
import { litterHeight } from '../../game/care/farmBarn.js';
import { lumpy } from '../../game/care/barnProps.js';
import { dirtyLitterTexture, cowPatParts, patField, patMaterials, wheelbarrow, strawFork } from '../../game/care/stableChores.js';
import { strawFloorTexture } from '../../game/care/textures.js';
import { callOut } from './farm3d.js';

const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
// Le sol du jeu dessiné (clean.js : vache) et ses cases de paille.
const FLOOR = { x: 14, y: 96, w: 312, h: 246 };
const STEP = 36;
const BIN = { x: 354, y: 250 };

export function barnClean3dGame(ctx) {
  const sc = ctx.scene;
  const D = sc.decor;
  const S = D.dims;
  D.layout('feed');
  const P = D.props;
  const L = sc.marks;
  const u = L.u;
  const m = sc.mood;
  const disp = [];
  const keep = (x) => {
    disp.push(x);
    return x;
  };
  // Elle mange au râtelier pendant qu'on cure (le râtelier est plein).
  P.rack.setFill(0.8);
  // Le terrain : sur la litière, de son arrière-main à son épaule, entre elle et nous (c'est derrière et à côté d'elle
  // que les bouses s'accumulent) ; la brouette au bout, à droite.
  const zBack = sc.box.max.z + 0.08;
  // (assez profond : en portrait, le terrain prend la hauteur de l'image, pas l'allée devant l'étable)
  const zFront = Math.min(S.front - 0.2, zBack + THREE.MathUtils.clamp(1.2 + 0.7 * u, 1.4, 2.1));
  const X0 = Math.max(-S.halfW + 0.2, L.croup.x - 0.5 - 0.4 * u);
  const X1 = Math.min(S.halfW - 0.15, X0 + THREE.MathUtils.clamp(1.6 + 1.1 * u, 2, 3.2));
  const toWorld = (x, y) => {
    const X = X0 + (x / 400) * (X1 - X0);
    const Z = zBack + ((y - FLOOR.y) / FLOOR.h) * (zFront - zBack);
    return v3(X, litterHeight(S, X, Z), Z);
  };
  const toDrawn = (W) => ({ x: ((W.x - X0) / (X1 - X0)) * 400, y: FLOOR.y + ((W.z - zBack) / (zFront - zBack)) * FLOOR.h });
  const cellW = (STEP / 400) * (X1 - X0);
  const cellD = (STEP / FLOOR.h) * (zFront - zBack);

  // la litière sale, posée sur la litière de l'étable (mêmes bosses)
  const dirtyTex = keep(dirtyLitterTexture());
  dirtyTex.repeat.set(2.5, 2);
  const lw = X1 - X0 + 0.25;
  const ld = zFront - zBack + 0.25;
  const litGeo = keep(new THREE.PlaneGeometry(lw, ld, 36, 24));
  litGeo.rotateX(-Math.PI / 2);
  const lp = litGeo.attributes.position;
  const cx = (X0 + X1) / 2;
  const cz = (zBack + zFront) / 2;
  for (let i = 0; i < lp.count; i++) lp.setY(i, litterHeight(S, lp.getX(i) + cx, lp.getZ(i) + cz) + 0.012);
  litGeo.computeVertexNormals();
  const litter = new THREE.Mesh(litGeo, keep(new THREE.MeshStandardMaterial({ map: dirtyTex, roughness: 0.92 })));
  litter.position.set(cx, 0, cz);
  litter.receiveShadow = true;
  sc.scene.add(litter);

  // la brouette, à la place de celle du jeu dessiné
  const barrowS = THREE.MathUtils.clamp(0.8 + 0.3 * u, 0.9, 1.25);
  const barrow = wheelbarrow(keep, barrowS);
  const bw = toWorld(BIN.x, BIN.y);
  barrow.group.position.set(Math.min(bw.x, S.halfW - 0.45 * barrowS), bw.y - 0.02, bw.z);
  barrow.group.rotation.y = -Math.PI / 2 - 0.35; // (la roue vers le fond, les bras vers nous)
  sc.scene.add(barrow.group);
  const barrowMouth = () => barrow.group.localToWorld(barrow.mouth.clone());

  // la logique du jeu dessiné (les mots à l'endroit du geste, ou à la brouette)
  let lastP = null;
  const play = withLogic(ctx, (c) => cleanGame(c), () => sc.project(lastP ?? barrowMouth()));
  const s0 = play.peek();

  // les bouses, à la place de celles du jeu dessiné, et leurs mouches
  const pm = patMaterials(keep);
  const pats = s0.items.map((it, i) => {
    // (g : la place de la bouse ; ses morceaux sont dessinés tous ensemble, patField)
    const g = new THREE.Object3D();
    g.position.copy(toWorld(it.x, it.y));
    return { g, obj: g, parts: cowPatParts(THREE.MathUtils.clamp(0.26 + 0.1 * u, 0.26, 0.38), i + 1), x: it.x, y: it.y, state: 'floor', k: 0, from: null };
  });
  const field = patField(sc.scene, pm, pats);
  field.write();
  const flyGeo = keep(new THREE.SphereGeometry(0.006, 6, 4));
  const flyMat = keep(new THREE.MeshBasicMaterial({ color: 0x15130f }));
  const flies = new THREE.InstancedMesh(flyGeo, flyMat, pats.length * 2);
  flies.frustumCulled = false;
  sc.scene.add(flies);
  const m4 = new THREE.Matrix4();

  // la paille fraîche : une brassée par case du sol (comme les cases du jeu dessiné)
  const cells = [];
  for (let y = FLOOR.y + STEP / 2; y < FLOOR.y + FLOOR.h; y += STEP) {
    for (let x = FLOOR.x + STEP / 2; x < FLOOR.x + FLOOR.w; x += STEP) cells.push({ x, y, n: 0, hit: false, h: 0, seed: Math.random() * 6 });
  }
  // (la même paille que la litière de l'étable, en plus doré : on voit bien ce qui est frais)
  const strawTex = keep(strawFloorTexture());
  strawTex.repeat.set(0.9, 0.9);
  const strawGeo = keep(lumpy(new THREE.SphereGeometry(1, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0.16, 2, 6));
  const straw = new THREE.InstancedMesh(strawGeo, keep(new THREE.MeshStandardMaterial({ map: strawTex, roughness: 1, color: 0xffe9b0 })), cells.length);
  straw.receiveShadow = true;
  // (pas d'ombre portée : une brassée de 3 cm au ras de la litière ; une passe d'ombre de moins à chaque image)
  straw.castShadow = false;
  straw.count = cells.length;
  sc.scene.add(straw);
  const q = new THREE.Quaternion();
  const sv = v3();
  const writeStraw = () => {
    cells.forEach((c, i) => {
      const w = toWorld(c.x, c.y);
      q.setFromAxisAngle(v3(0, 1, 0), c.seed);
      const h = c.h;
      sv.set(cellW * 0.78 * (h > 0 ? 1 : 0.001), Math.max(0.0001, h), cellD * 0.78 * (h > 0 ? 1 : 0.001));
      m4.compose(w.add(v3(0, 0.006, 0)), q, sv);
      straw.setMatrixAt(i, m4);
    });
    straw.instanceMatrix.needsUpdate = true;
  };
  writeStraw();

  // la fourche sous le doigt (vide pour les bouses, avec une brassée de paille pour étaler)
  const fork = strawFork(keep);
  fork.group.scale.setScalar(THREE.MathUtils.clamp(0.75 + 0.3 * u, 0.85, 1.15));
  fork.group.visible = false;
  sc.scene.add(fork.group);

  // Cadrage : la litière entière, la brouette, et elle (son dos, sa tête au râtelier), vus d'en haut, de notre côté.
  const frameAll = (now) => sc.frame([toWorld(0, FLOOR.y), toWorld(400, FLOOR.y), toWorld(0, FLOOR.y + FLOOR.h), toWorld(400, FLOOR.y + FLOOR.h), barrowMouth(), L.withers, L.croup],
    { dir: [-0.1, 1.25, 0.85], pad: 1.02, now });
  frameAll(true);
  m.ears = 'forward';

  let phase = s0.phase;
  let held = null; // la bouse qu'on tient
  let lastD = null;
  let t = 0;
  let saidEnd = false;

  /** Le point du sol sous le doigt (espace du cadre → litière → jeu dessiné). */
  const under = (p) => {
    const W = sc.pointOnPlane(p.x, p.y, 0.06);
    return W ? { W, d: toDrawn(W) } : null;
  };

  /** Copie des cases du jeu dessiné : chaque passage pose une brassée (mêmes règles que clean.js spread). */
  function spreadMirror(d) {
    if (!lastD) {
      lastD = d;
      return;
    }
    const on = (p) => p.x > FLOOR.x - 6 && p.x < FLOOR.x + FLOOR.w + 6 && p.y > FLOOR.y - 6 && p.y < FLOOR.y + FLOOR.h + 6;
    const inside = on(d) && on(lastD);
    for (const c of cells) {
      if (c.hit) continue;
      const e = distToSegment(c.x, c.y, lastD.x, lastD.y, d.x, d.y);
      if ((e < 18 && inside) || (e < 32 && c.n === 0)) {
        c.n++;
        c.hit = true;
        // des brins qui tombent de la fourche
        if (Math.random() < 0.5) {
          const bit = new THREE.Mesh(pm.straw, pm.strawMat);
          bit.scale.set(0.05 + Math.random() * 0.05, 1, 1);
          bit.position.copy(toWorld(c.x, c.y)).add(v3(0, 0.15, 0));
          bit.rotation.set(0, Math.random() * 6, (Math.random() - 0.5) * 0.6);
          sc.spawn(bit, { life: 0.6, v: v3((Math.random() - 0.5) * 0.3, -0.2, (Math.random() - 0.5) * 0.3), grav: 2, spin: 6, fade: false });
        }
      }
    }
    lastD = d;
  }

  return {
    peek: () => ({ ...play.peek(), pats3d: pats.filter((p) => p.state === 'floor').map((p) => sc.project(p.g.position)), barrow3d: sc.project(barrowMouth()) }),
    /** Un point du sol du jeu dessiné, à l'écran (espace du cadre) : pour les tests et les scripts. */
    toScreen: (x, y) => sc.project(toWorld(x, y)),
    /** Part des cases où on a posé de la paille fraîche (en 3D). */
    strawCells: () => cells.filter((c) => c.n > 0).length / cells.length,
    key: (c, d) => play.key?.(c, d),
    down(p) {
      if (ctx.done) return;
      const h = under(p);
      if (!h) return;
      lastP = h.W.clone();
      if (play.peek().phase === 'pick') {
        const before = play.peek().items.length;
        play.down(h.d);
        // (la logique a pris la bouse la plus proche : la nôtre aussi)
        const floorNow = play.peek().items;
        if (floorNow.length < before) {
          const gone = pats.find((pt) => pt.state === 'floor' && !floorNow.some((it) => Math.abs(it.x - pt.x) < 0.5 && Math.abs(it.y - pt.y) < 0.5));
          if (gone) {
            held = gone;
            gone.state = 'held';
          }
        }
      } else {
        lastD = null;
        play.down(h.d);
        spreadMirror(h.d);
      }
    },
    move(p, down) {
      if (!down || ctx.done) return;
      const h = under(p);
      if (!h) return;
      lastP = h.W.clone();
      play.move(h.d, true);
      if (held) {
        held.x = Math.max(16, Math.min(384, h.d.x));
        held.y = Math.max(16, Math.min(350, h.d.y));
      } else if (play.peek().phase === 'spread') spreadMirror(h.d);
    },
    up(p) {
      const h = p ? under(p) : null;
      const d = h?.d ?? (held ? { x: held.x, y: held.y } : { x: 0, y: 0 });
      play.up(d);
      if (held) {
        const floorNow = play.peek().items;
        const back = floorNow.some((it) => Math.abs(it.x - held.x) < 0.5 && Math.abs(it.y - held.y) < 0.5);
        if (back) held.state = 'floor';
        else {
          // vers la brouette, en cloche
          held.state = 'fly';
          held.k = 0;
          held.from = held.g.position.clone();
        }
        held = null;
      }
      lastD = null;
      for (const c of cells) c.hit = false;
    },
    update(dt) {
      t += dt;
      play.update(dt);
      const s = play.peek();
      // elle mange au râtelier, la queue contre les mouches ; elle nous regarde de temps en temps
      m.eat = !ctx.done;
      m.reachY = P.rack.bite(v3()).y;
      P.rack.nibble(!ctx.done);
      m.look = sc.camera.position;
      m.lookAmt = ctx.done ? 0.6 : Math.max(0, Math.sin(t * 0.35)) * 0.3;
      // les bouses : par terre, sur la fourche, en vol vers la brouette, dedans
      for (const pt of pats) {
        if (pt.state === 'floor') pt.g.position.copy(toWorld(pt.x, pt.y));
        else if (pt.state === 'held') pt.g.position.lerp(toWorld(pt.x, pt.y).add(v3(0, 0.16, 0)), Math.min(1, dt * 18));
        else if (pt.state === 'fly') {
          pt.k = Math.min(1, pt.k + dt * 2.6);
          const to = barrowMouth();
          pt.g.position.copy(pt.from).lerp(to, pt.k).add(v3(0, Math.sin(pt.k * Math.PI) * 0.45, 0));
          pt.g.rotation.z += dt * 5;
          if (pt.k >= 1) {
            pt.state = 'bin';
            pt.g.visible = false;
          }
        }
      }
      field.write();
      barrow.fill(pats.filter((pt) => pt.state === 'bin').length, pats.length);
      // les mouches, au-dessus des bouses encore là
      let k = 0;
      for (const pt of pats) {
        for (let j = 0; j < 2; j++) {
          const on = pt.state === 'floor';
          const a = t * (3 + j) + pt.x * 0.1 + j * 2;
          const r = 0.06 + 0.04 * Math.sin(t * 1.3 + j);
          m4.makeTranslation(pt.g.position.x + Math.cos(a) * r, pt.g.position.y + 0.06 + 0.04 * Math.sin(a * 1.7), pt.g.position.z + Math.sin(a) * r);
          if (!on) m4.makeScale(0, 0, 0);
          flies.setMatrixAt(k++, m4);
        }
      }
      flies.instanceMatrix.needsUpdate = true;
      // la paille fraîche monte, case par case (une couche : 3 cm ; un tas : plus haut)
      let changed = false;
      for (const c of cells) {
        const want = c.n === 0 ? 0 : c.n === 1 ? 0.035 : 0.035 + 0.04 * Math.min(3, c.n - 1);
        if (Math.abs(c.h - want) > 1e-4) {
          c.h += (want - c.h) * Math.min(1, dt * 8);
          changed = true;
        }
      }
      if (changed) writeStraw();
      // la fourche : sous le doigt
      const pp = ctx.pointer;
      const showFork = !ctx.done && (pp.down || pp.over) && (held || s.phase === 'spread' || pp.over);
      if (showFork) {
        const h = under(pp);
        if (h) {
          const at = held ? held.g.position.clone().add(v3(0, -0.02, 0)) : h.W.clone().setY(litterHeight(S, h.W.x, h.W.z) + (pp.down ? 0.06 : 0.14));
          fork.group.position.lerp(at, fork.group.visible ? Math.min(1, dt * 20) : 1);
          // (le manche vers nous et vers le haut, les dents à plat)
          fork.group.rotation.set(-1.1, 0.15, 0);
          fork.group.visible = true;
        }
      } else fork.group.visible = false;
      fork.load.visible = s.phase === 'spread';
      if (s.phase !== phase) {
        phase = s.phase;
        // les bouses sont parties : elle nous regarde, contente
        callOut(sc);
      }
      if (ctx.done && !saidEnd) {
        saidEnd = true;
        if (ctx.finished?.why === 'just') callOut(sc);
      }
    },
    draw(g) {
      if (!sc.ready) return;
      const s = play.peek();
      const v = ctx.view;
      // les bouses qui restent (pastilles, comme le compteur du jeu dessiné), puis la jauge des couches
      g.save();
      g.fillStyle = 'rgba(255,255,255,0.86)';
      g.beginPath();
      g.roundRect(v.x0 + 10, v.y0 + 10, 92, 40, 14);
      g.fill();
      g.font = '22px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif';
      g.textAlign = 'left';
      g.textBaseline = 'middle';
      g.fillStyle = '#000';
      g.fillText(s.phase === 'pick' ? '💩' : '🌾', v.x0 + 18, v.y0 + 31);
      g.font = '800 17px system-ui, sans-serif';
      g.fillStyle = '#3a2a1a';
      g.fillText(s.phase === 'pick' ? `${s.dirtInBin}/${s.nDirt}` : `${Math.round(Math.min(1, s.covered) * 100)} %`, v.x0 + 50, v.y0 + 31);
      g.restore();
      // une bouse qui reste : un petit cercle doré qui pulse (après quelques secondes sans toucher)
      if (s.phase === 'pick' && !ctx.done && ctx.time > 4) {
        const left = pats.filter((pt) => pt.state === 'floor');
        if (left.length) {
          const c = sc.project(left[0].g.position);
          g.save();
          g.strokeStyle = 'rgba(242,200,75,0.85)';
          g.lineWidth = 3;
          g.setLineDash([5, 4]);
          g.beginPath();
          g.arc(c.x, c.y, 20 + Math.sin(ctx.time * 5) * 2, 0, Math.PI * 2);
          g.stroke();
          g.restore();
        }
      }
    },
    destroy() {
      field.dispose();
      sc.scene.remove(litter, barrow.group, straw, fork.group, flies);
      straw.dispose();
      flies.dispose();
      P.rack.nibble(false);
      m.eat = false;
      for (const x of disp) x.dispose?.();
    },
  };
}
